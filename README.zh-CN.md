# DeepSeek Harness Design

[English](README.md) | 简体中文

DeepSeek Harness 的社区插件，与 DeepSeek 官方无隶属关系。

在对话中让模型生成前端界面，右侧 **Design** 标签页实时预览。点选元素后，可以直接说「把这个按钮改成描边样式」。支持多个方案、修订回看和并排对比。

## 安装

需要提供 `tools`、`fs`、`webServer`、`systemPrompt`、`storageDomain`、`sessions` 和 `sessionPersistence` 服务的 Harness Web / Desktop profile。当前版本在 DeepSeek Harness Desktop **0.2.0-rc.2** 的 Web profile 上验证。

开发和测试需要 Node.js 22.12+（22.x）或 24+；Host 运行时需要 Node.js 22+。先从源码构建发布包：

```sh
git clone https://github.com/heureux831/deepseek-harness-design.git
cd deepseek-harness-design
npm ci
./release.sh
```

首次构建生成 `dist/r1/deepseek-harness-design-0.5.3.tgz`，后续使用递增的 `rN` 目录。安装脚本输出的本地发布包：

```sh
dsh plugin --profile web add ./dist/r1/deepseek-harness-design-0.5.3.tgz
# Desktop 使用 --profile desktop
```

从旧的本地包 `dsh-design` 或 `@local/dsh-designer-rN` 升级时，先用 `dsh plugin --profile <profile> remove <旧包名>` 移除旧 bundle，再安装本包；同一个 profile 只能装一个 Designer。修改 Host 后需重新启动 Harness 才会使用新的模块。

当前通过本地 tarball 安装，尚未发布到 npm。正式发布后才可使用 `dsh plugin --profile web add deepseek-harness-design`。

## 使用

1. 展开右侧栏，在 `+` 的 guide 卡片中选择 **Design**。还没有稿件时，面板会显示使用指南和示例提示词。
2. 对模型描述想要的页面。模型调用 `design_apply` 后，面板约 1 秒内自动刷新。
3. 开启工具栏的「点选」，点击预览中的目标元素，再对模型说要如何修改。
4. 关闭「点选」可操作原型自己的按钮和脚本。手机、平板、桌面按钮用于切换视口宽度。

方案与修订是两层：要求「再出一个方向」会生成独立方案 A / B / C；继续修改 A 会追加 A1 / A2 / A3。工具栏负责切换方案和修订，原型页面无需自行添加版本切换 UI。对比模式的两栏各有自己的方案和修订选择器。

历史修订用于只读预览。让模型修改历史版本时，明确告诉它方案名与修订号，先调用 `design_read` 取回该版，再用 `design_apply` 追加新修订。

单栏和对比模式都使用真实的 390 / 834 / 1280 px 视口；侧栏较窄时可横向滚动。首次加载失败会显示重试提示，连接恢复后自动加载稿件；已有预览在连接失败时保留。修订加载也会自动重试，「刷新」可重新发起稿件加载。

## 保存与恢复

方案、当前 HTML、版本号、修订 HTML 和修改备注存储在 Harness 的 `designer` storage domain 中。每次 `design_apply` 先完成持久化，再更新预览；重新启动 Harness 后，打开原会话即可恢复画布和修订。

每个会话、每个方案最多保留 **40 个历史修订**；一个会话最多 **32 个方案**；每份 HTML 最多 **400,000 字符**。删除 Harness 的存储目录会删除这些记录，应把它纳入常规备份。

有工作目录的会话还会把当前 HTML 导出到：

```text
<工作区>/.dsh-design/<SHA-256 会话 ID>/<方案名>.html
```

`design_apply` 返回 `persisted`（Harness 保存成功）和 `exported`（HTML 导出成功），二者分别报告。持久化失败返回 `ok: false`，已有稿件、版本和修订保持原状；额外 HTML 导出失败时会明确说明，已保存的稿件仍可恢复。没有工作目录的会话同样可以保存。

挂载沙箱文件系统时，导出通过 `sandboxPolicy` 解析当前会话的既有策略：`workspace-write` 使用本会话工作区作为写入边界；`read-only` 仍可保存 Harness 草稿，但拒绝额外 HTML 导出。插件不会申请扩大访问模式。

首次打开旧版会话时，插件会自动导入该会话哈希目录下的 `.html` 文件，保留原文件。旧版只导出最新 HTML，因此无法从这些文件还原旧修订；旧版仅存于进程内存、从未落盘的稿件不会自动迁移。

旧稿导入要求有效 UTF-8、最多 32 份符合命名规则的 HTML、每份最多 400,000 字符。无效导入会整体停止，保留所有原文件；按 `design_apply` 的恢复错误修正对应文件，或把超额文件移出该会话的导入目录后重试。被淘汰的历史修订由 `design_read` 返回 `found: false`，面板自动回到最新修订。

## 点选规则

- 点选开关、选中记录和模型提示都按会话隔离。关闭点选或点「清除」只解除当前会话的绑定。
- 重新打开 Design 会恢复该会话的点选开关、有效回执及对应修订。切换方案、修订或对比模式会清除绑定；成功修改被选方案也会清除绑定。点选开关不会重载原型，原型交互状态会保留。
- 开关或清除同步失败会显示提示并自动重试；旧点选请求、过期预览和旧开关状态的点击会被拒收。历史点选包含修订号；模型未指定方案时优先修改被选方案，否则修改最近编辑的方案。
- 点选超过 **10 分钟**失效。自动上下文、`design_selection`、`design_read.hasSelection` 和 HTTP 元信息使用相同的判断。
- 点选提示只进入对应 Agent 的上下文。提示被写入该会话的上下文快照后才标记已投递；取消或拒绝一次请求组装不会消耗它。
- 面板的「点选已记录」表示 Host 已接收；下一次模型请求会收到提示。它不表示模型已经读取或执行了修改。
- 已进入对话历史的点选提示无法撤回。关闭开关会阻止后续注入；模型主动读取实时选中记录时也会得到空结果。

## 模型工具

| 工具 | 作用 |
|---|---|
| `design_apply` | 用 `html` 创建/替换整份页面，或用 `oldString` + `newString` 定点修改。`asNew: true` 创建独立方案；名称冲突自动加后缀。 |
| `design_list` | 列出当前会话的方案和修订链。 |
| `design_read` | 读取某方案当前或指定 `revision` 的 HTML；`html: false` 只读元信息。 |
| `design_selection` | 读取当前会话最近点选的元素，或用 `name` 指定方案。返回标签、文本、选择器、outerHTML 和位置。 |

## 预览与运行环境

预览使用 `sandbox="allow-scripts"`，HTTP 响应同时提供 `Content-Security-Policy: sandbox allow-scripts`。页面脚本可以交互，但不能读取 Harness 主页面、同源存储或同源 API；原生表单提交被浏览器阻止。依赖 API 的原型需要使用允许跨源访问的测试服务。

插件使用 Harness 的本机 HTTP 服务。它没有额外的身份认证层；Harness 默认绑定 `127.0.0.1`。若部署到非本机网络，应在部署层提供认证和访问控制。

## 开发与发布

```sh
npm ci
npm test
npm run check
./release.sh
```

`release.sh` 生成新的 `dist/rN` 目录和标准 `deepseek-harness-design-0.5.3.tgz` 发布包，执行测试、安装运行依赖，并拒绝覆盖已有快照。可用 `DSG_RELEASE_DIR` 指定其他输出目录。包名保持 `deepseek-harness-design`，版本由 `package.json` 管理。`npm pack` 的 `prepack` 同样执行 Host、React 测试和语法检查。

发布包包含 Host、浏览器入口、locale、bundle patch、README 和 MIT 许可；不会包含测试种子插件。公开发布前，可用生成的 tarball 安装到独立 profile 验证，再通过 `npm publish <tarball>` 发布。

React 回归覆盖加载重试、请求乱序、会话切换、点选同步和回执恢复。Host 回归覆盖会话隔离、过期、一致的投递消费、重启恢复、并发编辑、失败回滚、旧文件导入和无工作目录的会话。浏览器回归与真实存储验证见 [e2e/README.md](https://github.com/heureux831/deepseek-harness-design/blob/main/e2e/README.md)。

## 文件结构

```text
host/index.js        Host 路由、工具、会话状态和生命周期
host/persistence.js  持久化记录结构与大小限制
client.js            Design 面板、iframe 和点选回传
cordis.patch.yml     插入 Host 插件的 bundle 配置层
locale/              Plugin Manager 文案
tests/               Host 与 React 生命周期回归
e2e/                 独立 Harness 的浏览器与存储验证
```

贡献流程见 [CONTRIBUTING.md](https://github.com/heureux831/deepseek-harness-design/blob/main/CONTRIBUTING.md)，版本记录见 [CHANGELOG.md](https://github.com/heureux831/deepseek-harness-design/blob/main/CHANGELOG.md)。

[MIT License](LICENSE)。
