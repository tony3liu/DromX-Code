#!/usr/bin/env node
/**
 * publish-dromx.mjs — assemble the ONE npm-publishable dromx-code package.
 *
 * Produces: publish/dromx-code/ — the CLI (rebranded coding-agent dist) WITH
 * the pi-loopx extension bundled (examples/extensions/loopx/) and a postinstall
 * that auto-registers the extension. So `npm i -g dromx-code.tgz` gives users
 * the CLI + /auto-loop in ONE install (no separate `dromx install` step).
 *
 * The monorepo's internal package name (@earendil-works/pi-coding-agent) is
 * left untouched; this re-packages the built output under `dromx-code`.
 *
 * Prereq: `npm run build` (so packages/coding-agent/dist/cli.js exists).
 *
 * Usage:
 *   npm run build
 *   node scripts/publish-dromx.mjs
 *   cd publish/dromx-code && npm pack    # → dromx-code-<version>.tgz
 */
import { readFileSync, writeFileSync, cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const CA = join(REPO, "packages", "coding-agent");
const PUB = join(REPO, "publish");

const caPkg = JSON.parse(readFileSync(join(CA, "package.json"), "utf8"));

function writePkg(dir, obj) {
	writeFileSync(join(dir, "package.json"), JSON.stringify(obj, null, "\t") + "\n");
}
function copyTree(src, dest) {
	if (!existsSync(src)) return false;
	rmSync(dest, { recursive: true, force: true });
	cpSync(src, dest, { recursive: true });
	return true;
}

// --- dromx-code (the CLI + bundled pi-loopx extension) ----------------------
const codeDir = join(PUB, "dromx-code");
if (!existsSync(join(CA, "dist", "cli.js"))) {
	console.error("ERROR: packages/coding-agent/dist/cli.js not found. Run `npm run build` first.");
	process.exit(1);
}
if (!existsSync(join(CA, "examples", "extensions", "loopx", "index.ts"))) {
	console.error("ERROR: pi-loopx extension not found at packages/coding-agent/examples/extensions/loopx/index.ts");
	process.exit(1);
}
mkdirSync(codeDir, { recursive: true });
copyTree(join(CA, "dist"), join(codeDir, "dist"));
copyTree(join(CA, "examples"), join(codeDir, "examples")); // includes extensions/loopx (bundled) + other samples
copyTree(join(CA, "docs"), join(codeDir, "docs"));
if (existsSync(join(CA, "npm-shrinkwrap.json"))) {
	cpSync(join(CA, "npm-shrinkwrap.json"), join(codeDir, "npm-shrinkwrap.json"));
}
writePkg(codeDir, {
	name: "dromx-code",
	version: caPkg.version,
	description: "DromX — an autonomous coding agent (improved pi-mono) with loopx-powered auto-loop and real-browser control. Bundles the loopx (/auto-loop) and webbridge (/webbridge) extensions and auto-registers them on install.",
	type: "module",
	bin: { dromx: "dist/cli.js" },
	main: "dist/index.js",
	types: "dist/index.d.ts",
	exports: caPkg.exports,
	scripts: {
		// Auto-register the bundled extensions on `npm i -g` so /auto-loop and /webbridge
		// work out of the box. --no-approve avoids a project-trust prompt in the
		// non-interactive postinstall; `|| echo` keeps install non-fatal with a manual fallback.
		postinstall:
			"node dist/cli.js install ./examples/extensions/loopx --no-approve && node dist/cli.js install ./examples/extensions/webbridge --no-approve || echo 'dromx: extension auto-register skipped — run: dromx install ./examples/extensions/loopx and dromx install ./examples/extensions/webbridge'",
	},
	files: ["dist", "examples", "docs", "CHANGELOG.md", "npm-shrinkwrap.json"],
	piConfig: { name: "dromx", configDir: ".pi" },
	engines: caPkg.engines ?? { node: ">=22.19.0" },
	dependencies: caPkg.dependencies,
	overrides: caPkg.overrides,
	keywords: ["coding-agent", "ai", "cli", "loopx", "autonomous", "pi", "dromx"],
	license: "MIT",
});
console.log("✓ assembled publish/dromx-code  (bin: dromx, version:", caPkg.version + ", bundles pi-loopx + postinstall auto-register)");

console.log(`
Distribute without an npm registry (share the ONE tarball with your internal group):

  cd publish/dromx-code && npm pack    # → dromx-code-${caPkg.version}.tgz  (CLI + /auto-loop + /webbridge extensions)

Internal users install (ONE npm install — both extensions auto-register via postinstall):
  npm i -g ./dromx-code-${caPkg.version}.tgz   # dromx CLI + /auto-loop + /webbridge (auto-registered on install)
  pip install loopx                            # the loopx state kernel (for /auto-loop)
  dromx                                         # run; then /login + /auto-loop <objective>

Real-browser control (/webbridge) additionally needs the WebBridge daemon + Chrome extension,
which the tarball does NOT install (only setup-dromx.sh does). Users who want it run:
  curl -fsSL https://kimi-web-img.moonshot.cn/webbridge/install.sh | bash -s -- --no-start --no-skill
then install the Chrome extension (https://www.kimi.com/features/webbridge) and use /webbridge in dromx.

If postinstall auto-register was skipped (it prints a fallback), run manually:
  dromx install $(npm root -g)/dromx-code/examples/extensions/loopx
  dromx install $(npm root -g)/dromx-code/examples/extensions/webbridge

(To publish to a public/private registry instead: cd publish/dromx-code && npm publish)
`);
