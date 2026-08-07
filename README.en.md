<p align="center">
  <a href="https://github.com/tony3liu/DromX-Code">
    <img alt="DromX logo" src="docs/images/dromx-logo.svg" width="200">
  </a>
</p>

# DromX-Code

[中文](README.md) | English

**DromX is an AI coding agent that finishes the job.** Give it a goal, walk away — it keeps working across turns until the task is done. It can also drive your real browser (with your logins) to read pages, click, fill forms, and take screenshots.

## Install

You'll need **Node 22.19+** and an **API key** for a model provider (asked at install, or run `/login` later).

**macOS / Linux** — one-line script:

```bash
git clone https://github.com/tony3liu/DromX-Code.git
cd DromX-Code
bash scripts/setup-dromx.sh
```

It sets everything up and tells you if anything is missing.

**Windows** — use the package (in PowerShell):

```powershell
npm i -g .\dromx-code-<version>.tgz   # ask whoever shared it for the .tgz
dromx                                  # then /login to add your API key
```

> For full features on Windows: `/auto-loop` needs Python + `pip install loopx`; `/webbridge` will print a one-line install command to run in PowerShell the first time. Basic chat and coding work out of the box.
>
> macOS/Linux users can use the package too (change `.\` to `./`).

## Use it

```bash
cd your-project
dromx
```

Just talk to it. To let it run on its own until a task is done:

```
/auto-loop add unit tests for the payment module and make them pass
```

DromX keeps going turn after turn — the footer shows progress like `auto-loop 3/100` — and stops when the goal is met, it needs a decision from you, or it hits the limit. Type `/auto-loop` alone to toggle it; add `--max-turns 50` to change the limit.

Everyday commands inside DromX:

| | |
|---|---|
| `/login` | Add or switch your model provider key |
| `/model` | Switch models |
| `/auto-loop <goal>` | Run autonomously until done |
| `/webbridge` | Turn on real-browser control (see below) |
| `!command` | Run a shell command |
| `Ctrl+T` | Show/hide the model's thinking |
| `Ctrl+C` / `Ctrl+D` | Cancel / exit |

Start again later with `dromx` (new), `dromx -c` (continue last), or `dromx -r` (pick a past session).

## Control your real browser

DromX can drive your actual Chrome — using your existing logins — to browse, click, fill forms, and screenshot. Turn it on once:

```
/webbridge
```

The first time, DromX opens a fresh Chrome window on the extension's install page — click **"Add to Chrome"**, then you're set. After that, just ask:

> "open my dashboard and screenshot the latest report"

Check status anytime with `/webbridge status`.

## Credits

DromX is built on two excellent open-source projects:

- **[pi-mono](https://github.com/earendil-works/pi-mono)** by [earendil-works](https://github.com/earendil-works) / Mario Zechner — the coding agent DromX is based on.
- **[loopx](https://github.com/huangruiteng/loopx)** by [huangruiteng](https://github.com/huangruiteng) — powers the autonomous mode.

Real-browser control uses [Kimi WebBridge](https://www.kimi.com/features/webbridge) by Moonshot AI.

<details>
<summary>Distribute / build (package it for others)</summary>

Bundle DromX into a single tarball others install with `npm i -g` (CLI + the `/auto-loop` and `/webbridge` extensions, auto-registered on install):

```bash
npm run build && node scripts/publish-dromx.mjs && (cd publish/dromx-code && npm pack)   # → dromx-code-<version>.tgz
```

To bump the version, edit `version` in `packages/coding-agent/package.json` (both the TUI banner and the tarball filename read it).
</details>

## License

MIT
