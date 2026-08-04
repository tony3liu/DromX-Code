/**
 * pi-loopx extension
 *
 * Wraps the LoopX CLI (https://github.com/huangruiteng/loopx) as first-class
 * pi tools, so the agent can drive the LoopX state kernel — long-running
 * goals, todos, human gates, quota, evidence, handoffs — across sessions
 * without shelling out via bash.
 *
 * LoopX is agent-agnostic and CLI-driven; pi is an "other agent" host, so we
 * run LoopX manually from these tools. State lives in <project>/.loopx and
 * <project>/.codex/goals; this extension just calls the `loopx` binary on PATH.
 *
 * Tools provided:
 *   - loopx_status         : current goals / todos / gates / next action
 *   - loopx_start_goal     : connect project + create a long-running goal
 *   - loopx_todo_add       : add an agent todo (next concrete step)
 *   - loopx_todo_update    : mark a todo done (with evidence) / blocked / deferred
 *   - loopx_quota_should_run : ask LoopX whether the next turn should run
 *   - loopx_diagnose       : compact evidence packet for replan / handoff
 *
 * Requires: `loopx` on PATH (install: pip install git+https://github.com/huangruiteng/loopx)
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LOOPX_BIN = "loopx";

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
		const notInstalled =
			(res.error as NodeJS.ErrnoException).code === "ENOENT";
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
	return {
		ok: res.status === 0,
		stdout: out,
		exitCode: res.status,
		notInstalled: false,
	};
}

function textResult(text: string, details: Record<string, unknown> = {}) {
	return { content: [{ type: "text" as const, text }], details };
}

const projectParam = Type.Optional(
	Type.String({ description: "Project directory. Defaults to the current working directory." }),
);

function resolveCwd(project: string | undefined): string {
	return project && project.trim() ? project : process.cwd();
}

function notConnectedResult(cwd: string) {
	return textResult(
		`No LoopX registry at ${registryPath(cwd)}. This project is not connected to LoopX. Call loopx_start_goal first to create a goal.`,
		{ connected: false },
	);
}

export default function loopxExtension(pi: ExtensionAPI) {
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
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, {
				exitCode: r.exitCode,
				ok: r.ok,
				connected: true,
			});
		},
	});

	pi.registerTool({
		name: "loopx_start_goal",
		label: "LoopX Start Goal",
		description:
			"Connect the project to LoopX and create (or append to) a long-running goal. Persists objective, onboarding todos, gates, and progress state across sessions. Returns the goal id, proposed onboarding candidates, and the exact next commands. Use for multi-turn, long-horizon objectives that should survive process restarts.",
		promptSnippet: "Start a LoopX long-running goal in this project.",
		parameters: Type.Object({
			objective: Type.String({ description: "The long-running objective text." }),
			project: projectParam,
		}),
		async execute(_id, params) {
			const cwd = resolveCwd(params.project);
			const r = runLoopx(["bootstrap", "--project", cwd, "--objective", params.objective], cwd, 90_000);
			return textResult(r.stdout || `(no output, exit ${r.exitCode})`, {
				exitCode: r.exitCode,
				ok: r.ok,
				registry: registryPath(cwd),
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

	// Footer status: show whether this project is connected to LoopX.
	pi.on("session_start", (_event, ctx) => {
		try {
			const cwd = ctx?.cwd ?? process.cwd();
			const connected = existsSync(registryPath(cwd));
			ctx.ui.setStatus("loopx", connected ? "LoopX: connected" : "LoopX: not connected");
		} catch {
			// status is best-effort; never break session start
		}
	});
}
