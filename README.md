<p align="center">
  <a href="https://github.com/tony3liu/DromX-Code">
    <img alt="DromX logo" src="docs/images/dromx-logo.svg" width="200">
  </a>
</p>

# DromX-Code

简体中文 | [English](README.en.md)

**DromX 是一个能把活儿干完的 AI 编程 agent。** 给它一个目标，你就可以走开——它会一轮接一轮地干，直到任务完成。它还能操控你的真实浏览器（复用你的登录），帮你读网页、点击、填表、截图。

## 安装

需要 **Node 22.19+**，以及一个模型服务的 **API key**（安装时会问，或之后用 `/login` 添加）。

### 方式一：安装包（全平台）

**1. 打包**（在项目里，打出一个 tarball）：

```bash
npm run build && node scripts/publish-dromx.mjs && (cd publish/dromx-code && npm pack)   # → dromx-code-<version>.tgz
```

> 改版本号：编辑 `packages/coding-agent/package.json` 的 `version`（TUI 显示和 tarball 文件名都读它）。

**2. 安装**（拿到 `.tgz` 后，全平台通用；CLI + `/auto-loop` + `/webbridge` 扩展会自动注册）：

```bash
# macOS / Linux
npm i -g ./dromx-code-<version>.tgz

# Windows（PowerShell）
npm i -g .\dromx-code-<version>.tgz
```

装完运行 `dromx`，再 `/login` 填入 API key 即可。

> 🇨🇳 国内用户：装之前建议先把 npm 换成国内源，首次注册扩展会快很多 —— `npm config set registry https://registry.npmmirror.com`。（即使不设，自动注册失败时也会自动用国内源重试。）

> 首次用 `/auto-loop` 自治模式时，若缺 loopx 引擎会提示你一键自动安装（需要 Python 3）。`/webbridge` 浏览器控制首次运行也会提示对应平台的安装命令。基础对话和编码开箱即用。

### 方式二：一键脚本（仅 macOS / Linux）

从源码安装，脚本会把所有东西（含 loopx、浏览器 daemon）**全部自动配好**，无需手动装：

```bash
git clone https://github.com/tony3liu/DromX-Code.git
cd DromX-Code
bash scripts/setup-dromx.sh
```

### 卸载

```bash
dromx uninstall --all        # 交互式，逐项确认（配置 / WebBridge / loopx / 别名）
dromx uninstall --all --yes  # 全部删除，不询问
```

卸单个扩展：`dromx remove npm:pi-lens`。

## 使用

```bash
cd 你的项目
dromx
```

直接跟它对话。想让它自己一直干到任务完成：

```
/auto-loop 给支付模块加单元测试并让它们全部通过
```

DromX 会一轮接一轮地干下去——底部会显示进度 `auto-loop 3/100`——直到目标达成、需要你做决定、或到达上限才停。单独输 `/auto-loop` 可切换开关；加 `--max-turns 50` 改上限。

常用命令：

| | |
|---|---|
| `/login` | 添加或切换模型服务的 key |
| `/model` | 切换模型 |
| `/auto-loop <目标>` | 自动跑到任务完成 |
| `/webbridge` | 开启真实浏览器控制（见下） |
| `!命令` | 执行 shell 命令 |
| `Ctrl+T` | 显示/隐藏模型的思考过程 |
| `Ctrl+C` / `Ctrl+D` | 取消 / 退出 |

之后可以用 `dromx`（新会话）、`dromx -c`（接着上次）、`dromx -r`（挑一个历史会话）继续。

## 操控你的真实浏览器

DromX 能操控你的真实 Chrome——复用你已有的登录——去浏览、点击、填表、截图。开启一次即可：

```
/webbridge
```

第一次运行时，DromX 会打开一个全新的 Chrome 窗口并停在插件安装页——点一下 **“添加到 Chrome”** 就好。之后直接说：

> “打开我的后台，把最新那份报告截个图”

随时用 `/webbridge status` 查看状态。

## 致谢

DromX 基于两个优秀的开源项目构建：

- **[pi-mono](https://github.com/earendil-works/pi-mono)** —— [earendil-works](https://github.com/earendil-works) / Mario Zechner 的编程 agent，DromX 以它为基础。
- **[loopx](https://github.com/huangruiteng/loopx)** —— [huangruiteng](https://github.com/huangruiteng) 的项目，驱动自治模式。

真实浏览器控制使用 Moonshot AI 的 [Kimi WebBridge](https://www.kimi.com/features/webbridge)。

## License

MIT
