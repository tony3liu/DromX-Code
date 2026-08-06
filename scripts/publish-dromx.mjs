#!/usr/bin/env node
/**
 * publish-dromx.mjs — assemble npm-publishable packages for DromX.
 *
 * Produces (does NOT publish — you run `npm publish` in each):
 *   publish/dromx-code/   the CLI (renamed/rebranded coding-agent dist)
 *   publish/dromx-loopx/  the pi-loopx extension (/auto-loop + 6 tools)
 *
 * The monorepo's internal package name (@earendil-works/pi-coding-agent) is
 * left untouched; this re-packages the built output under the `dromx-code`
 * name so users can `npm i -g dromx-code` without cloning source.
 *
 * Prereq: `npm run build` (so packages/coding-agent/dist/cli.js exists).
 *
 * Usage:
 *   npm run build
 *   node scripts/publish-dromx.mjs
 *   cd publish/dromx-code  && npm login && npm publish
 *   cd publish/dromx-loopx && npm publish
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

// --- 1. dromx-code (the CLI) ------------------------------------------------
const codeDir = join(PUB, "dromx-code");
if (!existsSync(join(CA, "dist", "cli.js"))) {
	console.error("ERROR: packages/coding-agent/dist/cli.js not found. Run `npm run build` first.");
	process.exit(1);
}
mkdirSync(codeDir, { recursive: true });
copyTree(join(CA, "dist"), join(codeDir, "dist"));
copyTree(join(CA, "examples"), join(codeDir, "examples")); // built-in samples users can `dromx install`
copyTree(join(CA, "docs"), join(codeDir, "docs"));
if (existsSync(join(CA, "npm-shrinkwrap.json"))) {
	cpSync(join(CA, "npm-shrinkwrap.json"), join(codeDir, "npm-shrinkwrap.json"));
}
writePkg(codeDir, {
	name: "dromx-code",
	version: caPkg.version,
	description: "DromX — an autonomous coding agent (improved pi-mono) with loopx-powered auto-loop.",
	type: "module",
	bin: { dromx: "dist/cli.js" },
	main: "dist/index.js",
	types: "dist/index.d.ts",
	exports: caPkg.exports,
	files: ["dist", "examples", "docs", "CHANGELOG.md", "npm-shrinkwrap.json"],
	piConfig: { name: "dromx", configDir: ".pi" },
	engines: caPkg.engines ?? { node: ">=22.19.0" },
	dependencies: caPkg.dependencies,
	overrides: caPkg.overrides,
	keywords: ["coding-agent", "ai", "cli", "loopx", "autonomous", "pi", "dromx"],
	license: "MIT",
});
console.log("✓ assembled publish/dromx-code  (bin: dromx, version:", caPkg.version + ")");

// --- 2. dromx-loopx (the extension) ----------------------------------------
const loopxSrcDir = join(CA, "examples", "extensions", "loopx");
if (!existsSync(join(loopxSrcDir, "index.ts"))) {
	console.error("ERROR: pi-loopx extension not found at packages/coding-agent/examples/extensions/loopx/index.ts");
	process.exit(1);
}
const loopxDir = join(PUB, "dromx-loopx");
mkdirSync(loopxDir, { recursive: true });
cpSync(join(loopxSrcDir, "index.ts"), join(loopxDir, "index.ts"));
writePkg(loopxDir, {
	name: "dromx-loopx",
	version: "0.0.1",
	description: "DromX loopx extension — /auto-loop autonomous mode + 6 loopx tools (status/start_goal/todo_add/update/quota_should_run/diagnose).",
	type: "module",
	files: ["index.ts"],
	pi: { extensions: ["./index.ts"] },
	keywords: ["pi", "dromx", "loopx", "extension", "autonomous"],
	license: "MIT",
});
console.log("✓ assembled publish/dromx-loopx  (pi-loopx extension, version: 0.0.1)");

console.log(`
Distribute without an npm registry (share files/dirs with your internal group):

  cd publish/dromx-code && npm pack     # → dromx-code-${caPkg.version}.tgz  (the CLI tarball)
  # share publish/dromx-loopx/ as-is    (dromx install accepts a local dir)

Internal users install:
  npm i -g ./dromx-code-${caPkg.version}.tgz   # the dromx CLI
  dromx install ./dromx-loopx                  # the /auto-loop extension (local dir)
  pip install loopx                            # the loopx state kernel (for /auto-loop)
  dromx                                         # run; then /login + /auto-loop <objective>

(To publish to a public/private registry instead: cd publish/dromx-code && npm publish)
`);
