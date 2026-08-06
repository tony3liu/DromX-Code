# DromX-Code

[English](README.md) | 简体中文

[pi-mono](https://github.com/earendil-works/pi-mono)（Pi 编程 agent）的一个 fork，加了 **loopx 驱动的自治模式**：给它一个目标，走开，pi 自己跑到完成——由一个跨轮次、跨会话持久的目标 / todo / gate / 证据状态内核跟踪全过程。

## 一键安装

```bash
git clone https://github.com/tony3liu/DromX-Code.git
cd DromX-Code
bash scripts/setup-pi-loopx.sh
```

脚本安装整套栈——[loopx](https://github.com/huangruiteng/loopx)、6 个社区扩展、自带的安全 / plan 示例、`pi-loopx` 扩展（auto-continue + autonomous-start）、`~/.pi/agent/settings.json`、以及 `pi` / `pi-auto` 别名——然后验证 pi 能干净加载所有扩展。脚本幂等，随时可重跑。

**前置依赖**（脚本会检查并提示，但**不会**替你装这些）：

- node ≥ 22.19（`nvm install 22` / `n 22` / `brew install node@22`）
- python ≥ 3.11 —— 仅当 loopx 还没装时需要（`pyenv install 3.12` / `conda create -n py312 python=3.12` / `brew install python@3.12`）
- 一个 provider API key（如 DeepSeek）—— 脚本会提示输入，或在 pi 里用 `/login`

## 用法

```bash
cd ~/你的项目
pi
```

在 pi 里用斜杠命令触发 auto-loop：

```
/auto-loop 给 app.py 加 docstring 并验证能跑
```

`/auto-loop <目标>` 一键启用 auto-loop + 建 loopx 目标 + 驱动到完成。底部状态行显示 `LoopX: auto-loop N/100`；pi 自动循环直到目标完成、遇到需要人审的 gate、或达到轮数上限。走开就行。

- `/auto-loop`（无参）—— 切换本会话 auto-loop 开 / 关。
- `/auto-loop <目标>` —— 启用 + 建目标 + 驱动到完成。
- 启动时加 flag 也行：`pi --auto-loopx`（或 `pi-auto` 别名 = `LOOPX_MAX_TURNS=100 PI_OFFLINE=1 pi --auto-loopx`）。
- 上限：`/auto-loop --max-turns 50 <目标>` 行内设（运行时，不用重启），或 `LOOPX_MAX_TURNS=50` 环境变量（默认 25）。

日常（非自治）使用直接 `pi` —— auto-loop **默认关闭**。

## 这个 fork 在 pi-mono 之上加了什么

- **`packages/coding-agent/examples/extensions/loopx/`** —— `pi-loopx` 扩展。六个封装 loopx CLI 的工具（`loopx_status`、`loopx_start_goal`、`loopx_todo_add`、`loopx_todo_update`、`loopx_quota_should_run`、`loopx_diagnose`），外加：
  - **auto-continue 驱动** —— 在 `turn_end`，问 loopx `quota should-run`；若为 true 且未达上限，通过 `pi.sendUserMessage()` 注入下一轮，自动续跑。在 pi 里用 `/auto-loop` 触发（或启动时 `pi --auto-loopx` / `LOOPX_AUTO_CONTINUE=1`）。上限：`LOOPX_MAX_TURNS`（默认 25）或 `/auto-loop --max-turns N` 行内设。在 loopx gate / quota 或上限时停。
  - **autonomous-start** —— `loopx_start_goal` 默认自治（自动接受 onboarding、开始推进、不启心跳），所以不会有 onboarding user-gate 挡住 auto-loop。
- **`scripts/setup-pi-loopx.sh`** —— 上面的一键安装脚本。
- 全局加载的扩展（通过 `~/.pi/agent/settings.json`）：`pi-mcp-adapter`、`pi-subagents`、`pi-hashline-edit`、`pi-messenger`、`pi-intercom`，加上自带示例里的 `permission-gate` 和 `plan-mode`。（`pi-hashline-edit` 用哈希锚定编辑替换内置的 read/edit。）

## 架构

```
pi（本 fork，通过 pi-test.sh 从源码运行）
 └ 8 个全局加载的扩展
     loopx ◄── pi-loopx 扩展：6 工具 + auto-continue 驱动 + autonomous-start
     pi-mcp-adapter / pi-subagents / pi-hashline-edit / pi-messenger / pi-intercom
     permission-gate / plan-mode
              │  turn_end → quota should-run → sendUserMessage  (auto-loop)
              ▼
        loopx 状态内核  (跨会话：目标 / todo / gate / 证据 / 配额)
```

## 更新

```bash
git pull && npm run build       # 刷新 pi 源码
bash scripts/setup-pi-loopx.sh  # 重跑以同步扩展改动（幂等）
```

> `~/.pi/agent/settings.json` 里的 `pi-loopx` 扩展路径指向本仓库（`packages/coding-agent/examples/extensions/loopx/index.ts`）。若你移动 / 重命名仓库，重跑安装脚本以更新路径。

## 安全说明

- **auto-loop 默认关闭**：不带 `--auto-loopx` / `LOOPX_AUTO_CONTINUE=1` 时，pi 跟普通用法一样，不会自己续跑。
- 停的决策交给 loopx 的 `quota should-run`（gate / quota 说停就停），再加 `LOOPX_MAX_TURNS` 硬上限兜底，不会无限烧 token。
- pi 默认无权限弹窗（permissionless），工具直接跑；要加护栏可装 `permission-gate`（危险 bash 前确认）。
- 全自动 = 无人值守跑真实改动，先盯头一两轮确认在真推进、而非空转。

---

> 上游 **pi-mono** 的完整 README（英文，含包列表 / 权限 / 贡献 / 开发 / 供应链等）见 [README.md](README.md) 下方。
