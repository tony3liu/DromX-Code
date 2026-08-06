<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@earendil-works/pi-coding-agent?style=flat-square" /></a>
</p>

# DromX-Code

[English](README.md) | [中文](README.zh-CN.md)

A fork of [pi-mono](https://github.com/earendil-works/pi-mono) (the Pi coding agent) with a **loopx-powered autonomous mode**: give it a goal, walk away, and pi runs to completion — tracked by a durable goal / todo / gate / evidence state kernel across turns and sessions.

## One-click setup

```bash
git clone https://github.com/tony3liu/DromX-Code.git
cd DromX-Code
bash scripts/setup-pi-loopx.sh
```

The script installs the full stack — [loopx](https://github.com/huangruiteng/loopx), 6 community extensions, the built-in safety/plan examples, the `pi-loopx` extension (auto-continue + autonomous-start), `~/.pi/agent/settings.json`, and the `pi` / `pi-auto` aliases — then verifies pi loads everything cleanly. It is idempotent; re-run any time.

**Prereqs** (the script checks + instructs, it does **not** install these for you):

- node ≥ 22.19  (`nvm install 22` / `n 22` / `brew install node@22`)
- python ≥ 3.11  — only needed if loopx isn't installed yet (`pyenv install 3.12` / `conda create -n py312 python=3.12` / `brew install python@3.12`)
- a provider API key (e.g. DeepSeek) — the script prompts for it, or use `/login` inside pi

## Usage

```bash
cd ~/your-project
pi
```

Inside pi, trigger auto-loop with a slash command:

```
/auto-loop 给 app.py 加 docstring 并验证能跑
```

`/auto-loop <objective>` enables auto-loop + starts a loopx goal + drives it to completion in one shot. The footer shows `LoopX: auto-loop N/100`; pi auto-loops until the goal is done, a human gate blocks, or the cap is hit. Walk away.

- `/auto-loop` (no args) — toggle auto-loop on/off for the session.
- `/auto-loop <objective>` — enable + kick off a loopx goal + drive to completion.
- Launch-time flag still works: `pi --auto-loopx` (or the `pi-auto` alias = `LOOPX_MAX_TURNS=100 PI_OFFLINE=1 pi --auto-loopx`).
- Cap: `/auto-loop --max-turns 50 <objective>` sets it inline at run time, or `LOOPX_MAX_TURNS=50` env (default 25). No restart needed for the inline form.

For normal (non-autonomous) use, just run `pi` — the auto-loop is **off by default**.

## What this fork adds on top of pi-mono

- **`packages/coding-agent/examples/extensions/loopx/`** — the `pi-loopx` extension. Six tools that wrap the loopx CLI (`loopx_status`, `loopx_start_goal`, `loopx_todo_add`, `loopx_todo_update`, `loopx_quota_should_run`, `loopx_diagnose`), plus:
  - **auto-continue driver** — on `turn_end`, asks loopx `quota should-run`; if true and under the cap, injects the next turn via `pi.sendUserMessage()`. Trigger inside pi with `/auto-loop` (or launch with `pi --auto-loopx` / `LOOPX_AUTO_CONTINUE=1`). Cap: `LOOPX_MAX_TURNS` env (default 25) or `/auto-loop --max-turns N` inline. Stops on a loopx gate/quota or the cap.
  - **autonomous-start** — `loopx_start_goal` defaults to autonomous (auto-accept onboarding, begin advancement, no heartbeat), so no onboarding user-gate blocks the auto-loop.
- **`scripts/setup-pi-loopx.sh`** — the one-click installer above.
- Globally loaded extensions (via `~/.pi/agent/settings.json`): `pi-mcp-adapter`, `pi-subagents`, `pi-hashline-edit`, `pi-messenger`, `pi-intercom`, plus `permission-gate` and `plan-mode` from the built-in examples. (`pi-hashline-edit` replaces the built-in read/edit with hash-anchored editing.)

## Architecture

```
pi (this fork, run from source via pi-test.sh)
 └ 8 globally-loaded extensions
     loopx ◄── pi-loopx extension: 6 tools + auto-continue driver + autonomous-start
     pi-mcp-adapter / pi-subagents / pi-hashline-edit / pi-messenger / pi-intercom
     permission-gate / plan-mode
              │  turn_end → quota should-run → sendUserMessage  (the auto-loop)
              ▼
        loopx state kernel  (cross-session: goals / todos / gates / evidence / quota)
```

## Updating

```bash
git pull && npm run build       # refresh the pi source
bash scripts/setup-pi-loopx.sh  # re-run to pick up extension changes (idempotent)
```

> The `pi-loopx` extension path in `~/.pi/agent/settings.json` points into this repo (`packages/coding-agent/examples/extensions/loopx/index.ts`). If you move/rename the repo, re-run the setup script to update the path.

---

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

> Below is the upstream **pi-mono** README, kept for reference.

# Pi Agent Harness

This is the home of the Pi agent harness project including our self extensible coding agent.

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@earendil-works/pi-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@earendil-works/pi-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

To learn more about Pi:

* [Visit pi.dev](https://pi.dev), the project website with demos
* [Read the documentation](https://pi.dev/docs/latest), but you can also ask the agent to explain itself

## All Packages

| Package | Description |
|---------|-------------|
| **[@earendil-works/pi-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |

For Slack/chat automation and workflows see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).

## Permissions & Containerization

Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.

If you need stronger boundaries, containerize or sandbox Pi. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns:

- **Gondolin extension**: keep `pi` and provider auth on the host while routing built-in tools and `!` commands into a local Linux micro-VM.
- **Plain Docker**: run the whole `pi` process in a local container for simple isolation.
- **OpenShell**: run the whole `pi` process in a policy-controlled sandbox.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).  Longer term plans for Pi can also be found in [RFCs](https://rfc.earendil.com/keyword/pi/).

## Development

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run build         # Refresh model data, then build all packages
npm run build:offline # Rebuild using existing model data without network access
npm run check         # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

## Building standalone binaries from release source

GitHub releases include a versioned source archive covered by the release's `SHA256SUMS` file. Extract it and run the same build script used for the official standalone binaries:

```bash
VERSION="<release-version>"
tar -xzf "pi-${VERSION}-source.tar.gz"
cd "pi-${VERSION}"
./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
```

The source archive includes the generated provider model data used for the release. `--offline-model-data` builds with that snapshot instead of refreshing it from live provider catalogs. The script still installs dependencies, builds the monorepo, compiles the Bun executable, and stages its runtime assets. Package maintainers who provide dependencies separately can pass `--skip-install --skip-deps`.

## Supply-chain hardening

We treat npm dependency changes as reviewed code changes.

- Direct external dependencies are pinned to exact versions. Internal workspace packages remain version-ranged.
- `.npmrc` sets `save-exact=true` and `min-release-age=2` to avoid same-day dependency releases during npm resolution.
- `package-lock.json` is the dependency ground truth. Pre-commit blocks accidental lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1` is set.
- `npm run check` verifies pinned direct deps, native TypeScript import compatibility, and the generated coding-agent shrinkwrap.
- The published CLI package includes `packages/coding-agent/npm-shrinkwrap.json`, generated from the root lockfile, to pin transitive deps for npm users.
- Release smoke tests use `npm run release:local` to build, pack, and create isolated npm and Bun installs outside the repo before tagging a release.
- Local release installs, documented npm installs, and `pi update --self` use `--ignore-scripts` where supported.
- CI installs with `npm ci --ignore-scripts`, and a scheduled GitHub workflow runs `npm audit --omit=dev` plus `npm audit signatures --omit=dev`.
- Shrinkwrap generation has an explicit allowlist for dependency lifecycle scripts; new lifecycle-script deps fail checks until reviewed.

## Share your OSS coding agent sessions

If you use Pi or other coding agents for open source work, please share your sessions.

Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `pi-mono` sessions.

I regularly publish my own `pi-mono` work sessions here:

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## License

MIT

<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>
