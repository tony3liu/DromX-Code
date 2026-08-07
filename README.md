<p align="center">
  <a href="https://github.com/tony3liu/DromX-Code">
    <img alt="DromX logo" src="docs/images/dromx-logo.svg" width="200">
  </a>
</p>

# DromX-Code

简体中文 | [English](README.en.md)

**DromX 是一个能把活儿干完的 AI 编程 agent。** 给它一个目标，你就可以走开——它会一轮接一轮地干，直到任务完成。它还能操控你的真实浏览器（复用你的登录），帮你读网页、点击、填表、截图。

## 安装

```bash
git clone https://github.com/tony3liu/DromX-Code.git
cd DromX-Code
bash scripts/setup-dromx.sh
```

脚本会自动配好一切，缺什么会提示你。你需要 **Node 22.19+**，以及一个模型服务的 **API key**（脚本会问，或之后用 `/login` 添加）。

<details>
<summary>没有 git？用预构建的安装包。</summary>

```bash
npm i -g ./dromx-code-<version>.tgz   # 向分享给你的人要这个 .tgz 文件
dromx                                 # 然后 /login 填入你的 API key
```
</details>

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

<details>
<summary>分发 / 构建（打包给别人用）</summary>

把 DromX 打成一个 tarball，分享给别人 `npm i -g` 安装（CLI + `/auto-loop` + `/webbridge` 扩展，安装时自动注册）：

```bash
npm run build                        # 编译
node scripts/publish-dromx.mjs       # 组装到 publish/dromx-code/
cd publish/dromx-code && npm pack    # → dromx-code-<version>.tgz
```

改版本号：编辑 `packages/coding-agent/package.json` 的 `version`（TUI 显示和 tarball 文件名都读它）。
</details>

## License

MIT
