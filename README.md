<p align="center">
  <a href="https://github.com/tony3liu/DromX-Code">
    <img alt="DromX logo" src="docs/images/dromx-logo.svg" width="200">
  </a>
</p>

# DromX-Code

[English](README.md) | [中文](README.zh-CN.md)

DromX-Code is an improved version of [pi-mono](https://github.com/earendil-works/pi-mono), with a **loopx-powered autonomous mode**: give it a goal, walk away, and dromx runs to completion — tracked by a durable goal / todo / gate / evidence state kernel across turns and sessions.

## One-click setup

```bash
git clone https://github.com/tony3liu/DromX-Code.git
cd DromX-Code
bash scripts/setup-dromx.sh
```

<details>
<summary>Or install a prebuilt tarball (internal distribution — no git clone)</summary>

ONE tarball contains the CLI + the /auto-loop extension (auto-registered on install):

```bash
npm i -g ./dromx-code-<version>.tgz   # dromx CLI + /auto-loop extension (auto-registered via postinstall)
pip install loopx                 # the loopx state kernel (for /auto-loop)
dromx                             # run; then /login + /auto-loop <objective>
```

To build the tarball yourself: `npm run build && node scripts/publish-dromx.mjs && (cd publish/dromx-code && npm pack)`.

If the postinstall auto-register was skipped (it prints a fallback message), run manually: `dromx install $(npm root -g)/dromx-code/examples/extensions/loopx`.

</details>

**Prereqs** (the script checks + instructs, it does **not** install these for you):

- node ≥ 22.19  (`nvm install 22` / `n 22` / `brew install node@22`)
- python ≥ 3.11  — only needed if loopx isn't installed yet (`pyenv install 3.12` / `conda create -n py312 python=3.12` / `brew install python@3.12`)
- a provider API key (e.g. DeepSeek) — the script prompts for it, or use `/login` inside pi

## Usage

```bash
cd ~/your-project
dromx          # `pi` is an alias to the same binary; both work
```

Inside dromx, trigger auto-loop with a slash command:

```
/auto-loop 给 app.py 加 docstring 并验证能跑
```

`/auto-loop <objective>` enables auto-loop + starts a loopx goal + drives it to completion in one shot. The footer shows `LoopX: auto-loop N/100`; pi auto-loops until the goal is done, a human gate blocks, or the cap is hit. Walk away.

- `/auto-loop` (no args) — toggle auto-loop on/off for the session.
- `/auto-loop <objective>` — enable + kick off a loopx goal + drive to completion.
- Launch-time flag still works: `pi --auto-loopx` (or the `pi-auto` alias = `LOOPX_MAX_TURNS=100 PI_OFFLINE=1 pi --auto-loopx`).
- Cap: `/auto-loop --max-turns 50 <objective>` sets it inline at run time, or `LOOPX_MAX_TURNS=50` env (default 25). No restart needed for the inline form.

For normal (non-autonomous) use, just run `dromx` (or `pi`) — the auto-loop is **off by default**.

> Thinking (CoT) is collapsed by default (shows a `Thinking...` label) to keep output readable; press `ctrl+t` to expand/collapse. Set by `hideThinkingBlock: true` in settings.

## Basic operations

Quick reference for everyday dromx use (full set in `dromx --help` and the [usage docs](packages/coding-agent/docs/usage.md)).

**Start / resume:**
- `dromx` — new session · `dromx -c` — continue the last · `dromx -r` — pick a session to resume
- Sessions are per-project: `cd` into the project first.

**In a session:**
- Type a message + `Enter` to chat; `Shift+Enter` for a newline.
- `!command` — run a shell command and send its output to the model. `!!command` — run it silently (output not sent).
- `/` opens slash-command completion. Common ones:
  - `/login` `/logout` — manage provider credentials (OAuth or API key)
  - `/model` — switch models · `/scoped-models` — choose models for `Ctrl+P` cycling
  - `/resume` `/new` `/tree` `/fork` — resume, start, navigate, or branch sessions
  - `/changelog` — version history · `/auto-loop` — (this fork) trigger autonomous mode

**Keybindings:**

| Key | Action |
|-----|--------|
| `Esc` | Interrupt the agent |
| `Ctrl+C` / `Ctrl+D` | Clear input / exit (when input empty) |
| `Ctrl+L` / `Ctrl+P` / `Shift+Tab` | Model selector / cycle models / cycle thinking level |
| `Ctrl+T` | Collapse / expand thinking blocks |
| `Ctrl+O` | Collapse / expand tool output |
| `Ctrl+X` | Copy last assistant response |
| `Ctrl+G` | Open external editor (`$EDITOR` / nano) |
| `Shift+Enter` | Newline (multi-line input) |

## Real-browser control (Kimi WebBridge)

dromx supports [Kimi WebBridge](https://www.kimi.com/features/webbridge) **by default** — drive your **real Chrome** (navigate, click, fill, read, screenshot) using your actual login sessions, so dromx can work with sites behind a login. Architecture: `dromx → kimi-webbridge skill (curl to the local daemon :10086) → Chrome extension → your browser`.

`setup-dromx.sh` installs the **daemon** and wires the **skill**. Enabling the browser side is a one-liner inside dromx:

```
/webbridge          # start the daemon, launch a dedicated clean Chrome profile, and show how to install the extension
/webbridge status   # report daemon + extension connection
```

You still do two things yourself:

1. **Install the Chrome extension** (a browser action a script can't do): https://www.kimi.com/features/webbridge — install it in the Chrome window `/webbridge` launches (`~/.dromx-chrome`).
2. Keep it connected (`/webbridge status` → connected).

Then just ask: *"use webbridge to open X, read it / click Y / screenshot"*.

> Why a dedicated Chrome profile: Chrome's CDP allows only **one** extension attached per tab, so other automation / custom-new-tab / recorder extensions in your main profile steal the tab and browser ops fail with `Cannot access a chrome-extension:// URL of different extension`. The clean profile avoids that.
>
> Skip the daemon at setup with `bash scripts/setup-dromx.sh --no-webbridge`.

## Changes dromx makes on top of pi-mono

- **`packages/coding-agent/examples/extensions/loopx/`** — the `pi-loopx` extension. Six tools that wrap the loopx CLI (`loopx_status`, `loopx_start_goal`, `loopx_todo_add`, `loopx_todo_update`, `loopx_quota_should_run`, `loopx_diagnose`), plus:
  - **auto-continue driver** — on `turn_end`, asks loopx `quota should-run`; if true and under the cap, injects the next turn via `pi.sendUserMessage()`. Trigger inside pi with `/auto-loop` (or launch with `pi --auto-loopx` / `LOOPX_AUTO_CONTINUE=1`). Cap: `LOOPX_MAX_TURNS` env (default 25) or `/auto-loop --max-turns N` inline. Stops on a loopx gate/quota or the cap.
  - **autonomous-start** — `loopx_start_goal` defaults to autonomous (auto-accept onboarding, begin advancement, no heartbeat), so no onboarding user-gate blocks the auto-loop.
- **`scripts/setup-dromx.sh`** — the one-click installer above.
- Globally loaded extensions (via `~/.pi/agent/settings.json`): `pi-mcp-adapter`, `pi-subagents`, `pi-hashline-edit`, `pi-messenger`, `pi-intercom`, plus `permission-gate` and `plan-mode` from the built-in examples. (`pi-hashline-edit` replaces the built-in read/edit with hash-anchored editing.)

## Updating

```bash
git pull && npm run build       # refresh the pi source
bash scripts/setup-dromx.sh  # re-run to pick up extension changes (idempotent)
```

> The `pi-loopx` extension path in `~/.pi/agent/settings.json` points into this repo (`packages/coding-agent/examples/extensions/loopx/index.ts`). If you move/rename the repo, re-run the setup script to update the path.

## Credits

DromX-Code stands on the shoulders of:

- **[pi-mono](https://github.com/earendil-works/pi-mono)** — the Pi coding agent by [earendil-works](https://github.com/earendil-works) / Mario Zechner. This fork builds directly on its runtime, tools, and extension system.
- **[loopx](https://github.com/huangruiteng/loopx)** — the loop-engineering state kernel by [huangruiteng](https://github.com/huangruiteng), powering the autonomous mode (durable goals / todos / gates / evidence across turns and sessions).

---

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).



## License

MIT



