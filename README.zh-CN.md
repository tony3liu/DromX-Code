<p align="center">
  <a href="https://github.com/tony3liu/DromX-Code">
    <img alt="DromX logo" src="docs/images/dromx-logo.svg" width="200">
  </a>
</p>

# DromX-Code

[English](README.md) | 简体中文

DromX 是[pi-mono](https://github.com/earendil-works/pi-mono)的改进版本,加了 **loopx 驱动的自治模式**：给它一个目标，走开，dromx 自己跑到完成——由一个跨轮次、跨会话持久的目标 / todo / gate / 证据状态内核跟踪全过程。

## 一键安装

```bash
git clone https://github.com/tony3liu/DromX-Code.git
cd DromX-Code
bash scripts/setup-dromx.sh
```

<details>
<summary>或装预构建 tarball（内部分发，不用 git clone）</summary>

```bash
npm i -g ./dromx-code-0.0.1.tgz   # dromx CLI（你收到的 .tgz）
dromx install ./dromx-loopx      # /auto-loop 扩展（你收到的目录）
pip install loopx                # loopx 状态内核（/auto-loop 用）
dromx                            # 启动；然后 /login + /auto-loop <目标>
```

自己打 tarball：`npm run build && node scripts/publish-dromx.mjs && (cd publish/dromx-code && npm pack)`。

</details>


**前置依赖**（脚本会检查并提示，但**不会**替你装这些）：

- node ≥ 22.19（`nvm install 22` / `n 22` / `brew install node@22`）
- python ≥ 3.11 —— 仅当 loopx 还没装时需要（`pyenv install 3.12` / `conda create -n py312 python=3.12` / `brew install python@3.12`）
- 一个 provider API key（如 DeepSeek）—— 脚本会提示输入，或在 pi 里用 `/login`

## 用法

```bash
cd ~/你的项目
dromx          
```

在 dromx 里用斜杠命令触发 auto-loop：

```
/auto-loop 给 app.py 加 docstring 并验证能跑
```

`/auto-loop <目标>` 一键启用 auto-loop + 建 loopx 目标 + 驱动到完成。底部状态行显示 `LoopX: auto-loop N/100`；dromx 自动循环直到目标完成、遇到需要人审的 gate、或达到轮数上限。走开就行。

- `/auto-loop`（无参）—— 切换本会话 auto-loop 开 / 关。
- `/auto-loop <目标>` —— 启用 + 建目标 + 驱动到完成。
- 启动时加 flag 也行：`dromx --auto-loopx`（或 `dromx-auto` 别名 = `LOOPX_MAX_TURNS=100 PI_OFFLINE=1 dromx --auto-loopx`）。
- 上限：`/auto-loop --max-turns 50 <目标>` 行内设（运行时，不用重启），或 `LOOPX_MAX_TURNS=50` 环境变量（默认 25）。

日常（非自治）使用直接 `dromx`—— auto-loop **默认关闭**。

> Thinking（CoT）默认折叠成 `Thinking...` 标签，保持输出清爽；按 `ctrl+t` 展开 / 折叠。由 settings 的 `hideThinkingBlock: true` 设置。

## 基本操作

日常 dromx 用法速查（完整见 `dromx --help` 和 [usage 文档](packages/coding-agent/docs/usage.md)）。

**启动 / 恢复：**
- `dromx` 新会话 · `dromx -c` 接上次 · `dromx -r` 从列表选一个恢复
- 会话按项目存，先 `cd` 进项目。

**会话内：**
- 输消息 + `Enter` 对话；`Shift+Enter` 换行。
- `!命令` —— 跑 shell 命令，输出发给模型。`!!命令` —— 静默跑（输出不发）。
- `/` 弹出斜杠命令补全。常用：
  - `/login` `/logout` —— 管 provider 凭证（OAuth 或 API key）
  - `/model` 切模型 · `/scoped-models` 选 `Ctrl+P` 循环的模型
  - `/resume` `/new` `/tree` `/fork` —— 恢复 / 新建 / 导航 / 分支会话
  - `/changelog` 版本历史 · `/auto-loop`（本 fork）触发自治模式

**快捷键：**

| 键 | 作用 |
|-----|------|
| `Esc` | 中断 agent |
| `Ctrl+C` / `Ctrl+D` | 清空输入 / 退出（输入为空时） |
| `Ctrl+L` / `Ctrl+P` / `Shift+Tab` | 模型选择 / 循环模型 / 切 thinking 级别 |
| `Ctrl+T` | 折叠 / 展开 thinking |
| `Ctrl+O` | 折叠 / 展开工具输出 |
| `Ctrl+X` | 复制上一条回复 |
| `Ctrl+G` | 外部编辑器（`$EDITOR` / nano） |
| `Shift+Enter` | 换行（多行输入） |

## dromx基于pi所做的变更

- **`packages/coding-agent/examples/extensions/loopx/`** —— `pi-loopx` 扩展。六个封装 loopx CLI 的工具（`loopx_status`、`loopx_start_goal`、`loopx_todo_add`、`loopx_todo_update`、`loopx_quota_should_run`、`loopx_diagnose`），外加：
  - **auto-continue 驱动** —— 在 `turn_end`，问 loopx `quota should-run`；若为 true 且未达上限，通过 `pi.sendUserMessage()` 注入下一轮，自动续跑。在 dromx 里用 `/auto-loop` 触发（或启动时 `dromx --auto-loopx` / `LOOPX_AUTO_CONTINUE=1`）。上限：`LOOPX_MAX_TURNS`（默认 25）或 `/auto-loop --max-turns N` 行内设。在 loopx gate / quota 或上限时停。
  - **autonomous-start** —— `loopx_start_goal` 默认自治（自动接受 onboarding、开始推进、不启心跳），所以不会有 onboarding user-gate 挡住 auto-loop。
- **`scripts/setup-dromx.sh`** —— 上面的一键安装脚本。
- 全局加载的扩展（通过 `~/.pi/agent/settings.json`）：`pi-mcp-adapter`、`pi-subagents`、`pi-hashline-edit`、`pi-messenger`、`pi-intercom`，加上自带示例里的 `permission-gate` 和 `plan-mode`。（`pi-hashline-edit` 用哈希锚定编辑替换内置的 read/edit。）



## 更新

```bash
git pull && npm run build       # 刷新 dromx 源码
bash scripts/setup-dromx.sh  # 重跑以同步扩展改动（幂等）
```


## 安全说明

- **auto-loop 默认关闭**：不带 `--auto-loopx` / `LOOPX_AUTO_CONTINUE=1` 时，dromx 跟普通用法一样，不会自己续跑。
- 停的决策交给 loopx 的 `quota should-run`（gate / quota 说停就停），再加 `LOOPX_MAX_TURNS` 硬上限兜底，不会无限烧 token。
- dromx 默认无权限弹窗（permissionless），工具直接跑；要加护栏可装 `permission-gate`（危险 bash 前确认）。
- 全自动 = 无人值守跑真实改动，先盯头一两轮确认在真推进、而非空转。

## 致谢

DromX-Code 站在巨人的肩膀上：

- **[pi-mono](https://github.com/earendil-works/pi-mono)** —— [earendil-works](https://github.com/earendil-works) / Mario Zechner 的 Pi 编程 agent。Dromx 直接基于它的 runtime、工具与扩展系统构建。
- **[loopx](https://github.com/huangruiteng/loopx)** —— [huangruiteng](https://github.com/huangruiteng) 的循环工程状态内核，驱动自治模式（跨轮次 / 跨会话持久的目标 / todo / gate / 证据）。




