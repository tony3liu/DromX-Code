/**
 * webbridge extension — Kimi WebBridge (real-browser control) for dromx.
 *
 * Kimi WebBridge (https://www.kimi.com/features/webbridge) lets dromx control the
 * user's REAL Chrome — navigate, click, fill, screenshot, read pages — using their
 * actual login sessions. Architecture: dromx → kimi-webbridge skill (curl to the
 * local daemon at 127.0.0.1:10086) → Chrome extension → real browser.
 *
 * dromx ships this integration by default (setup installs the daemon + skill).
 * Enabling the browser side is USER-DRIVEN via a slash command:
 *
 *   /webbridge          Enable: start the daemon; if the browser extension isn't connected,
 *                       open a dedicated clean Chrome window at the extension install page so
 *                       the user can click "Add to Chrome". Then check status.
 *   /webbridge status   Show daemon + extension connection status.
 *
 * On session start it only PASSIVELY reflects status in the footer (never launches
 * anything) so startup stays quiet and predictable.
 *
 * Notes:
 *   - The daemon binary lives at ~/.kimi-webbridge/bin/kimi-webbridge (installed by
 *     setup-dromx.sh; if missing, /webbridge tells the user how to install it).
 *   - A dedicated Chrome profile (~/.dromx-chrome) avoids the CDP one-attach-per-tab
 *     conflict where other extensions steal the tab.
 *   - The user installs the Chrome EXTENSION themselves (a browser action the CLI can't do).
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DAEMON_BIN = join(homedir(), ".kimi-webbridge", "bin", "kimi-webbridge");
const CLEAN_PROFILE = join(homedir(), ".dromx-chrome");
const EXTENSION_URL = "https://www.kimi.com/features/webbridge";
const INSTALL_CMD =
	platform() === "win32"
		? "irm https://kimi-web-img.moonshot.cn/webbridge/install.ps1 | iex"
		: "curl -fsSL https://kimi-web-img.moonshot.cn/webbridge/install.sh | bash -s -- --no-start --no-skill";

interface Status {
	installed: boolean;
	running: boolean;
	extensionConnected: boolean;
}

function daemonStatus(): Status {
	if (!existsSync(DAEMON_BIN)) return { installed: false, running: false, extensionConnected: false };
	const r = spawnSync(DAEMON_BIN, ["status"], { encoding: "utf-8", timeout: 8_000 });
	if (r.error || typeof r.stdout !== "string") return { installed: true, running: false, extensionConnected: false };
	try {
		const j = JSON.parse(r.stdout.match(/\{[\s\S]*\}/)?.[0] ?? r.stdout);
		return { installed: true, running: Boolean(j.running), extensionConnected: Boolean(j.extension_connected) };
	} catch {
		return { installed: true, running: false, extensionConnected: false };
	}
}

function findChrome(): string | undefined {
	const plat = platform();
	if (plat === "darwin") {
		const p = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
		return existsSync(p) ? p : undefined;
	}
	if (plat === "linux") {
		for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
			const r = spawnSync("which", [c], { encoding: "utf-8" });
			if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
		}
		return undefined;
	}
	if (plat === "win32") {
		for (const p of [
			join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
			join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
		]) {
			if (existsSync(p)) return p;
		}
		return undefined;
	}
	return undefined;
}

function launchChrome(chrome: string, url?: string): void {
	const args = [`--user-data-dir=${CLEAN_PROFILE}`, "--no-first-run", "--no-default-browser-check"];
	if (url) args.push(url);
	const child = spawn(chrome, args, { detached: true, stdio: "ignore" });
	child.unref();
}

function footerLabel(s: Status): string {
	if (!s.installed) return "WebBridge: not installed";
	if (s.extensionConnected) return "WebBridge: connected";
	if (s.running) return "WebBridge: daemon up, extension off";
	return "WebBridge: off";
}

export default function webbridgeExtension(pi: ExtensionAPI) {
	// Passive status in the footer on startup — never launches anything.
	pi.on("session_start", (_event, ctx) => {
		try {
			ctx.ui.setStatus("webbridge", footerLabel(daemonStatus()));
		} catch {
			// best-effort
		}
	});

	pi.registerCommand("webbridge", {
		description:
			"Enable Kimi WebBridge (real-browser control): start the daemon, launch a clean Chrome profile, and show how to install the browser extension. `/webbridge status` just reports status.",
		handler: async (args, ctx) => {
			const sub = (typeof args === "string" ? args : "").trim().toLowerCase();

			// --- daemon not installed: tell the user how ---
			const s0 = daemonStatus();
			if (!s0.installed) {
				ctx.ui.notify(
					`Kimi WebBridge daemon not installed. Install it:\n  ${INSTALL_CMD}\nThen install the Chrome extension: ${EXTENSION_URL}`,
					"warning",
				);
				ctx.ui.setStatus("webbridge", footerLabel(s0));
				return;
			}

			// --- status subcommand: report only ---
			if (sub === "status") {
				const s = daemonStatus();
				ctx.ui.setStatus("webbridge", footerLabel(s));
				ctx.ui.notify(
					`Kimi WebBridge — daemon: ${s.running ? "running" : "stopped"}, extension: ${s.extensionConnected ? "connected" : "not connected"}.`,
					"info",
				);
				return;
			}

			// --- enable: ensure daemon up ---
			if (!s0.running) {
				ctx.ui.notify("WebBridge: starting daemon...", "info");
				spawnSync(DAEMON_BIN, ["start"], { timeout: 10_000 });
			}

			const s1 = daemonStatus();
			if (s1.extensionConnected) {
				ctx.ui.setStatus("webbridge", footerLabel(s1));
				ctx.ui.notify("Kimi WebBridge is connected — browser control is ready. Ask dromx to open a page.", "info");
				return;
			}

			// --- extension not connected: launch clean Chrome + guide install ---
			const chrome = findChrome();
			if (!chrome) {
				ctx.ui.setStatus("webbridge", footerLabel(s1));
				ctx.ui.notify(
					`WebBridge daemon is up, but Chrome was not found. Open Chrome, then install the extension: ${EXTENSION_URL}`,
					"warning",
				);
				return;
			}
			launchChrome(chrome, EXTENSION_URL);
			ctx.ui.setStatus("webbridge", "WebBridge: launched Chrome");
			ctx.ui.notify(
				`WebBridge: opened a dedicated Chrome window (profile ${CLEAN_PROFILE}) at the extension install page.\n` +
					`Click "Add to Chrome" there to install the Kimi WebBridge extension, then run /webbridge status to confirm it's connected.\n` +
					`(This window is isolated from your everyday Chrome, so other extensions can't steal the tab.)`,
				"info",
			);
		},
	});
}
