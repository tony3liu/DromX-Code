/**
 * pi-loopx extension
 *
 * Wraps the LoopX CLI (https://github.com/huangruiteng/loopx) as first-class
 * pi tools, so the agent can drive the LoopX state kernel — long-running
 * goals, todos, human gates, quota, evidence, handoffs — across sessions
 * without shelling out via bash.
 *
 * Tools:
 *   - loopx_status         : current goals / todos / gates / next action
 *   - loopx_start_goal     : connect project + create a long-running goal
 *                            (autonomous by default: skips the onboarding user-gate)
 *   - loopx_todo_add       : add an agent todo (next concrete step)
 *   - loopx_todo_update    : mark a todo done (with evidence) / blocked / deferred
 *   - loopx_quota_should_run : ask LoopX whether the next turn should run
 *   - loopx_diagnose       : compact evidence packet for replan / handoff
 *
 * Auto-continue driver — trigger it INSIDE pi with `/auto-loop`:
 *   `/auto-loop [--max-turns N] <objective>`  set the turn cap + enable + start a loopx goal + drive to completion
 *   `/auto-loop [--max-turns N]`              set the cap + toggle on (no goal)
 *   `/auto-loop`                              toggle on/off (uses current cap)
 *   (also still triggerable at launch via `pi --auto-loopx` or `LOOPX_AUTO_CONTINUE=1`)
 *   On `turn_end`, if enabled + idle, ask loopx `quota should-run`; if true and under the
 *   turn cap, inject a continuation message via pi.sendUserMessage(). Stop conditions
 *   delegate to loopx (quota/gate) + a hard turn cap backstop.
 *   Cap default: `LOOPX_MAX_TURNS` env (25); override at runtime with `/auto-loop --max-turns N`.
 *
 * Requires: `loopx` on PATH (install: pip install git+https://github.com/huangruiteng/loopx)
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LOOPX_BIN = "loopx";
// loopx is not on PyPI — install from its GitHub repo.
const LOOPX_PIP_SPEC = "git+https://github.com/huangruiteng/loopx.git";

function registryPath(project: string): string {
	return join(project, ".loopx", "registry.json");
}

interface RunResult {
	ok: boolean;
	stdout: string;
	exitCode: number | null;
	notInstalled: boolean;
}

function runLoopx(args: string[], cwd: string, timeoutMs = 60_000): RunResult {
	const reg = registryPath(cwd);
	const fullArgs = existsSync(reg) ? ["--registry", reg, ...args] : args;
	const res = spawnSync(LOOPX_BIN, fullArgs, {
		cwd,
		encoding: "utf-8",
		timeout: timeoutMs,
		maxBuffer: 8 * 1024 * 1024,
	});

	if (res.error) {
		const notInstalled = (res.error as NodeJS.ErrnoException).code === "ENOENT";
		return {
			ok: false,
			stdout: notInstalled
				? `loopx binary not found on PATH. Install: pip install git+https://github.com/huangruiteng/loopx`
				: `loopx failed: ${res.error.message}`,
			exitCode: null,
			notInstalled,
		};
	}

	const out = `${res.stdout || ""}${res.stderr ? `\n[stderr]\n${res.stderr}` : ""}`.trim();
	return { ok: res.status === 0, stdout: out, exitCode: res.status, notInstalled: false };
}

function textResult(text: string, details: Record<string, unknown> = {}) {
	return { content: [{ type: "text" as const, text }], details };
}

const projectParam = Type.Optional(
	Type.String({ description: "Project directory. Defaults to the current working directory." }),
);

function resolveCwd(project: string | undefined): string {
	return project?.trim() ? project : process.cwd();
}

function notConnectedResult(cwd: string) {
	return textResult(
		`No LoopX registry at ${registryPath(cwd)}. This project is not connected to LoopX. Call loopx_start_goal first to create a goal.`,
		{ connected: false },
	);
}

// --- Auto-continue helpers -------------------------------------------------

/** Parse a goal id from loopx CLI output (bootstrap / status / diagnose). */
function parseGoalId(output: string): string | undefined {
	const m = output.match(/goal[_-]?id[=:]\s*`?([A-Za-z0-9_.-]+)/i);
	if (m) return m[1];
	const m2 = output.match(/\bgoal=([A-Za-z0-9_.-]+)/i);
	return m2 ? m2[1] : undefined;
}

/** Ask loopx whether the next turn should run. `quota should-run` outputs JSON by default. */
function quotaShouldRun(cwd: string, goalId: string): { shouldRun: boolean; decision: string; reason: string } {
	const r = runLoopx(["quota", "should-run", "--goal-id", goalId], cwd, 30_000);
	if (r.stdout) {
		try {
			const jsonStr = r.stdout.match(/\{[\s\S]*\}/)?.[0] ?? r.stdout;
			const j = JSON.parse(jsonStr);
			return {
				shouldRun: Boolean(j.should_run),
				decision: String(j.decision ?? ""),
				reason: String(j.reason ?? ""),
			};
		} catch {
			// fall back to regex
		}
	}
	const m = r.stdout.match(/should_run["'\s:]+(true|false)/i);
	return { shouldRun: m ? m[1].toLowerCase() === "true" : false, decision: "", reason: r.stdout.slice(0, 200) };
}

/** Parse `--max-turns N` / `--max-turns=N` / `-m N` out of an arg string. Returns {maxTurns?, rest}. */
function parseMaxTurns(raw: string): { maxTurns: number | undefined; rest: string } {
	let maxTurns: number | undefined;
	let rest = raw;
	// --max-turns=N  or  --max-turns N  /  -m N
	let m = rest.match(/(^|\s)--max-turns=(\d+)/);
	if (m) {
		maxTurns = Number(m[2]);
		rest = rest.replace(m[0], "").trim();
	} else {
		m = rest.match(/(^|\s)(--max-turns|-m)\s+(\d+)/);
		if (m) {
			maxTurns = Number(m[3]);
			rest = rest.replace(m[0], "").trim();
		}
	}
	if (maxTurns !== undefined && (!Number.isFinite(maxTurns) || maxTurns <= 0)) maxTurns = undefined;
	return { maxTurns, rest };
}

/** True if auto-loop is enabled at launch (flag/env). The session toggle (autoLoopOn) is checked separately. */
function autoContinueEnabledAtLaunch(pi: ExtensionAPI): boolean {
	try {
		if (pi.getFlag("auto-loopx") === true) return true;
	} catch {
		// flag may be unavailable in non-interactive/print mode; ignore
	}
	const v = process.env.LOOPX_AUTO_CONTINUE;
	return v === "1" || v === "true" || v === "yes";
}

/** Is the `loopx` CLI on PATH? */
function loopxInstalled(): boolean {
	const r = spawnSync(LOOPX_BIN, ["--version"], { encoding: "utf-8", timeout: 8_000 });
	return !r.error;
}

/** Find a usable python that has pip. Returns the python command, or undefined. */
function findPython(): string | undefined {
	// Order covers macOS/Linux (python3.x, python3) and Windows (py launcher, python).
	for (const c of ["python3.13", "python3.12", "python3.11", "python3", "python", "py"]) {
		const r = spawnSync(c, ["-c", "import sys,pip;print(sys.version_info[0])"], {
			encoding: "utf-8",
			timeout: 8_000,
		});
		if (!r.error && r.status === 0 && r.stdout.trim() === "3") return c;
	}
	return undefined;
}

/**
 * Ensure the `loopx` CLI is available (auto-loop needs it). If missing, ask the
 * user once, then pip-install it from GitHub with a detected python. Returns true
 * if loopx is usable afterward. Best-effort; on failure gives a manual hint.
 *
 * Note: loopx is NOT on PyPI — it must be installed from its GitHub repo.
 */
async function ensureLoopxInstalled(ctx: {
	ui: { confirm(t: string, m: string): Promise<boolean>; notify(m: string, level?: string): void };
}): Promise<boolean> {
	if (loopxInstalled()) return true;

	const manual = `pip install --no-build-isolation ${LOOPX_PIP_SPEC}`;
	const py = findPython();
	if (!py) {
		ctx.ui.notify(
			`auto-loop needs loopx, but no Python 3 with pip was found. Install Python 3.11+, then: ${manual}`,
			"warning",
		);
		return false;
	}

	const ok = await ctx.ui.confirm(
		"Install loopx?",
		`Auto-loop needs the loopx engine. Install it now from GitHub? (equivalent to: ${manual})`,
	);
	if (!ok) {
		ctx.ui.notify(`Skipped. Install later with: ${manual}`, "info");
		return false;
	}

	ctx.ui.notify("Installing loopx from GitHub (pip)... this may take a moment.", "info");
	// Upgrade setuptools/wheel first: loopx uses declarative pyproject package discovery,
	// and an old setuptools (e.g. bundled with Anaconda) silently builds a broken
	// "UNKNOWN-0.0.0" wheel instead of loopx. A recent setuptools resolves the name correctly.
	spawnSync(py, ["-m", "pip", "install", "--user", "--quiet", "-U", "setuptools>=64", "wheel"], {
		encoding: "utf-8",
		timeout: 120_000,
	});
	// --no-build-isolation: loopx's pyproject pins setuptools==83.0.0 (not on PyPI),
	// so build isolation fails; use the (now-upgraded) environment setuptools instead.
	const r = spawnSync(py, ["-m", "pip", "install", "--user", "--quiet", "--no-build-isolation", LOOPX_PIP_SPEC], {
		encoding: "utf-8",
		timeout: 180_000,
	});
	if (r.error || r.status !== 0) {
		ctx.ui.notify(
			`loopx install failed (${r.error?.message ?? `exit ${r.status}`}). Install it manually: ${manual}`,
			"error",
		);
		return false;
	}
	if (!loopxInstalled()) {
		ctx.ui.notify(
			"loopx installed, but the `loopx` command isn't on PATH yet. Add your Python user bin dir to PATH (or restart the shell), then retry.",
			"warning",
		);
		return false;
	}
	ctx.ui.notify("loopx installed ✓", "info");
	return true;
}

// --------------------------------------------------------------------------

/** Ensure <cwd>/.gitignore ignores dromx local state (.pi/ .loopx/ .codex/).
 *  Only in git repos. Append-only (never modifies existing content). Idempotent:
 *  if all rules already present, does nothing. Returns the rules it added. */
function ensureProjectGitignore(cwd: string): string[] {
	if (!existsSync(join(cwd, ".git"))) return []; // only in git repos
	const giPath = join(cwd, ".gitignore");
	const rules = [".pi/", ".loopx/", ".codex/"];
	let content = "";
	try {
		content = readFileSync(giPath, "utf-8");
	} catch {
		// .gitignore doesn't exist yet — appendFileSync will create it
	}
	const lines = content.split(/\r?\n/);
	const missing = rules.filter((r) => !lines.some((l) => l.trim() === r));
	if (missing.length === 0) return []; // already written — treat as done
	const header =
		(content.length === 0 ? "" : content.endsWith("\n") ? "" : "\n") + "# dromx local state (auto-added by dromx)\n";
	appendFileSync(giPath, header + missing.join("\n") + "\n");
	return missing;
}

export default function loopxExtension(pi: ExtensionAPI) {
	// Shared session state for the auto-continue driver.
	let activeGoalId: string | undefined;
	let autoTurnCount = 0;
	let autoLoopOn = false; // toggled by /auto-loop inside pi
	let maxAutoTurns = Number(process.env.LOOPX_MAX_TURNS ?? 25); // mutable: /auto-loop --max-turns can override

	pi.registerFlag("auto-loopx", {
		description:
			"Enable loopx auto-continue at launch: auto-tick the loopx loop across turns until the goal is done, a human gate blocks, or the turn cap is hit. (Inside a session, use /auto-loop instead.)",
		type: "boolean",
		default: false,
	});

	// `/auto-loop` — trigger auto-loop mode from inside pi (no launch flag needed).
	//   /auto-loop --max-turns 50 <objective>   set cap=50 + enable + kickoff goal
	//   /auto-loop --max-turns 50               set cap=50 + enable (no goal)
	//   /auto-loop <objective>                  enable + kickoff (current cap)
	//   /auto-loop                              toggle on/off (current cap)
	pi.registerCommand("auto-loop", {
		description:
			"Trigger loopx auto-loop. `/auto-loop [--max-turns N] <objective>`: set the turn cap + enable + start a loopx goal + drive to completion. `/auto-loop [--max-turns N]`: set cap + enable. `/auto-loop`: toggle on/off. Cap defaults to 25 (or LOOPX_MAX_TURNS env).",
		handler: async (args, ctx) => {
			const raw = (typeof args === "string" ? args : "").trim();
			const { maxTurns, rest } = parseMaxTurns(raw);
			if (maxTurns !== undefined) maxAutoTurns = maxTurns;
			const objective = rest;

			// Auto-loop needs the loopx engine — install it on demand if missing.
			if (!(await ensureLoopxInstalled(ctx))) {
				ctx.ui.setStatus("loopx", "LoopX: unavailable (loopx not installed)");
				return;
			}

			if (objective) {
				// enable + kick off the goal in one shot
				autoLoopOn = true;
				autoTurnCount = 0;
				ctx.ui.setStatus("loopx", `LoopX: auto-loop ON (cap ${maxAutoTurns})`);
				ctx.ui.notify(`auto-loop ON (cap ${maxAutoTurns}) — kicking off: ${objective.slice(0, 80)}`, "info");
				pi.sendUserMessage(
					`用 loopx_start_goal 建目标: ${objective}. 然后驱动循环到完成或遇到需要我决策的 gate（用 loopx_status 定位、loopx_todo_add 拆步、做完用 loopx_todo_update 标 done 附证据、loopx_quota_should_run 查配额）.`,
				);
			} else {
				// no objective — toggle (and apply the new cap if given)
				autoLoopOn = !autoLoopOn;
				autoTurnCount = 0;
				ctx.ui.setStatus(
					"loopx",
					autoLoopOn ? `LoopX: auto-loop ON (cap ${maxAutoTurns})` : "LoopX: auto-loop OFF",
				);
				ctx.ui.notify(
					autoLoopOn
						? `auto-loop ON (cap ${maxAutoTurns}) — will auto-continue each turn_end. Give a goal or call loopx_status.`
						: "auto-loop OFF",
					"info",
				);
			}
		},
	});

	pi.registerTool({
		name: "loopx_status",
		label: "LoopX Status",
		description:
			"Show the current LoopX state for this project: active goals, agent/user todos, gates, attention queue, and the next recommended action. Call this to orient before working on a long-running goal. Requires the project to be connected (run loopx_start_goal first).",
		promptSnippet: "Check LoopX state for the current project.",
		parameters: Type.Object({ project: projectParam }),
		async execute(_id, params) {
			const cwd = resolveCwd(params.project);
			if (!existsSync(registryPath(cwd))) return notConnectedResult(cwd);
			const r = runLoopx(["status"], cwd);
			const gid = parseGoalId(r.stdout);
			if (gid) activeGoalId = gid;
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, {
				exitCode: r.exitCode,
				ok: r.ok,
				connected: true,
				goalId: gid,
			});
		},
	});

	pi.registerTool({
		name: "loopx_start_goal",
		label: "LoopX Start Goal",
		description:
			"Connect the project to LoopX and create (or append to) a long-running goal. Persists objective, todos, gates, and progress state across sessions. By default starts in AUTONOMOUS mode (auto-accept onboarding, begin advancement, no heartbeat) so no onboarding user-gate blocks the auto-loop. Returns the goal id, proposed onboarding candidates, and the exact next commands. Use for multi-turn, long-horizon objectives that should survive process restarts.",
		promptSnippet: "Start a LoopX long-running goal in this project (autonomous by default).",
		parameters: Type.Object({
			objective: Type.String({ description: "The long-running objective text." }),
			autonomous: Type.Optional(
				Type.Boolean({
					description:
						"Start the goal in autonomous mode: auto-accept onboarding candidates, begin advancement, no Codex heartbeat — so no onboarding user-gate blocks delivery and the auto-loop can proceed hands-off. Default true. Set false to require manual onboarding confirmation.",
				}),
			),
			project: projectParam,
		}),
		async execute(_id, params) {
			const cwd = resolveCwd(params.project);
			const args = ["bootstrap", "--project", cwd, "--objective", params.objective];
			// Default autonomous=true: skip the onboarding user-gate so the auto-loop can proceed hands-off.
			if (params.autonomous !== false) {
				args.push("--accept-onboarding-agent-todos", "--begin-autonomous-advance", "--codex-app-heartbeat", "no");
			}
			const r = runLoopx(args, cwd, 90_000);
			const gid = parseGoalId(r.stdout);
			if (gid) activeGoalId = gid;
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, {
				exitCode: r.exitCode,
				ok: r.ok,
				registry: registryPath(cwd),
				goalId: gid,
				autonomous: params.autonomous !== false,
			});
		},
	});

	pi.registerTool({
		name: "loopx_todo_add",
		label: "LoopX Add Todo",
		description:
			"Add an agent todo to a LoopX goal — the next concrete step toward the objective. Returns the new todo id. Use after orienting with loopx_status and before doing delivery work.",
		parameters: Type.Object({
			goal_id: Type.String({ description: "LoopX goal id, e.g. <project-name>-goal." }),
			text: Type.String({ description: "The todo text / next step to perform." }),
			task_class: Type.Optional(
				Type.String({
					description: "Task class: advancement_task (default), user_gate, continuous_monitor, blocker.",
				}),
			),
			action_kind: Type.Optional(
				Type.String({ description: "Action kind, e.g. repo_intake, implementation, validation, state_writeback." }),
			),
			project: projectParam,
		}),
		async execute(_id, params) {
			const cwd = resolveCwd(params.project);
			if (!existsSync(registryPath(cwd))) return notConnectedResult(cwd);
			const args = ["todo", "add", "--goal-id", params.goal_id, "--role", "agent", "--text", params.text];
			args.push("--task-class", params.task_class ?? "advancement_task");
			if (params.action_kind) args.push("--action-kind", params.action_kind);
			const r = runLoopx(args, cwd);
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, { exitCode: r.exitCode, ok: r.ok });
		},
	});

	pi.registerTool({
		name: "loopx_todo_update",
		label: "LoopX Update Todo",
		description:
			"Update a LoopX todo: mark it done with evidence, or blocked/deferred with a reason. Call this after completing a validated step to write back evidence and advance the loop. Then check loopx_quota_should_run before the next turn.",
		parameters: Type.Object({
			goal_id: Type.String({ description: "LoopX goal id." }),
			todo_id: Type.String({ description: "The todo id to update (e.g. todo_abc123)." }),
			status: Type.String({ description: "New status: done | open | blocked | deferred." }),
			evidence: Type.Optional(
				Type.String({ description: "Evidence / note for the outcome (recommended when status=done)." }),
			),
			project: projectParam,
		}),
		async execute(_id, params) {
			const cwd = resolveCwd(params.project);
			if (!existsSync(registryPath(cwd))) return notConnectedResult(cwd);
			const args = ["todo", "--goal-id", params.goal_id, "--todo-id", params.todo_id, "--status", params.status];
			if (params.evidence) args.push("--evidence", params.evidence);
			const r = runLoopx(args, cwd);
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, { exitCode: r.exitCode, ok: r.ok });
		},
	});

	pi.registerTool({
		name: "loopx_quota_should_run",
		label: "LoopX Quota Should-Run",
		description:
			"Ask LoopX whether the next agent turn should run (quota + safety gate). Returns should_run, decision, normal_delivery_allowed, and reason. Call before doing delivery work; after a validated step, spend a slot and mark the todo done.",
		parameters: Type.Object({
			goal_id: Type.String({ description: "LoopX goal id." }),
			agent_id: Type.Optional(Type.String({ description: "Registered LoopX agent id, if any." })),
			project: projectParam,
		}),
		async execute(_id, params) {
			const cwd = resolveCwd(params.project);
			if (!existsSync(registryPath(cwd))) return notConnectedResult(cwd);
			const args = ["quota", "should-run", "--goal-id", params.goal_id];
			if (params.agent_id) args.push("--agent-id", params.agent_id);
			const r = runLoopx(args, cwd);
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, { exitCode: r.exitCode, ok: r.ok });
		},
	});

	pi.registerTool({
		name: "loopx_diagnose",
		label: "LoopX Diagnose",
		description:
			"Build a compact evidence packet for a LoopX goal: recent runs, decisions, blockers, progress signals. Use when replanning, handing off to another agent, or summarizing state for the user.",
		parameters: Type.Object({
			goal_id: Type.String({ description: "LoopX goal id." }),
			project: projectParam,
		}),
		async execute(_id, params) {
			const cwd = resolveCwd(params.project);
			if (!existsSync(registryPath(cwd))) return notConnectedResult(cwd);
			const r = runLoopx(["diagnose", "--goal-id", params.goal_id], cwd);
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, { exitCode: r.exitCode, ok: r.ok });
		},
	});

	// --- Auto-continue driver ------------------------------------------------
	// On turn_end (agent idle, waiting for input), if enabled (session toggle or
	// launch flag/env) and loopx says the next turn should run, inject a
	// continuation message. Stop conditions:
	//   - disabled (default) -> normal pi behavior
	//   - no connected loopx goal -> do nothing (nudge once)
	//   - loopx quota should_run=false (gate/quota) -> stop + notify
	//   - turn cap hit (LOOPX_MAX_TURNS or /auto-loop --max-turns) -> stop + notify
	pi.on("turn_end", async (_event, ctx) => {
		try {
			// enabled if the session /auto-loop toggle is on, OR launched with the flag/env
			if (!(autoLoopOn || autoContinueEnabledAtLaunch(pi))) return;
			if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) return; // not idle, don't inject
			const cwd = ctx?.cwd ?? process.cwd();
			if (!existsSync(registryPath(cwd))) return; // project not connected to loopx

			let goalId = activeGoalId;
			if (!goalId) {
				// best-effort discovery from `loopx status`
				const s = runLoopx(["status"], cwd, 30_000);
				goalId = parseGoalId(s.stdout);
				if (goalId) activeGoalId = goalId;
			}
			if (!goalId) {
				// connected but no goal yet — nudge once, don't spin
				if (autoTurnCount === 0) {
					ctx.ui.notify("LoopX auto-loop: connected but no active goal. Call loopx_start_goal first.", "warning");
				}
				return;
			}

			if (autoTurnCount >= maxAutoTurns) {
				ctx.ui.notify(
					`LoopX auto-loop: hit turn cap (${maxAutoTurns}). Stopping. Use /auto-loop --max-turns N to raise, or continue manually.`,
					"warning",
				);
				return;
			}

			const q = quotaShouldRun(cwd, goalId);
			if (!q.shouldRun) {
				ctx.ui.setStatus("loopx", "LoopX: auto-loop stopped");
				ctx.ui.notify(
					`LoopX auto-loop stop (${q.decision || "should_run=false"}): ${q.reason}`.slice(0, 300),
					"info",
				);
				return;
			}

			autoTurnCount += 1;
			ctx.ui.setStatus("loopx", `LoopX: auto-loop ${autoTurnCount}/${maxAutoTurns}`);
			pi.sendUserMessage(
				`Continue the LoopX loop toward the objective. Steps: (1) call loopx_status to orient; (2) pick the next open agent todo; (3) do that step; (4) call loopx_todo_update to mark it done WITH evidence; (5) call loopx_quota_should_run. If a user gate is pending (needs human decision), STOP and ask the user instead of continuing.`,
			);
		} catch {
			// never break the turn on a driver error
		}
	});

	// Footer status + reset auto-loop counter each session.
	pi.on("session_start", (_event, ctx) => {
		autoTurnCount = 0;
		autoLoopOn = false; // fresh session: don't inherit a stale toggle
		// re-read env cap for the new session (a /auto-loop --max-turns can still override mid-session)
		maxAutoTurns = Number(process.env.LOOPX_MAX_TURNS ?? 25);
		try {
			const cwd = ctx?.cwd ?? process.cwd();
			// Ensure .gitignore ignores dromx local state (.pi/ .loopx/ .codex/) — create if missing, append if absent.
			const added = ensureProjectGitignore(cwd);
			if (added.length > 0) {
				ctx.ui.notify(`dromx: added ${added.join(", ")} to .gitignore (local state)`, "info");
			}
			const connected = existsSync(registryPath(cwd));
			const label = connected
				? `LoopX: connected${activeGoalId ? ` (${activeGoalId})` : ""}`
				: "LoopX: not connected";
			ctx.ui.setStatus("loopx", label);
		} catch {
			// status is best-effort
		}
	});
}
