# 我给 DeepSeek Harness 做了一个 Design 插件：边聊边看页面，点哪里改哪里

用 AI 写前端页面时，我很想让后续修改变得简单一点。

第一版出来以后，往往还要继续调整：按钮换个样式，标题小一点，卡片间距拉开，或者再试一种视觉方向。尤其是页面上有好几个相似的元素时，一句「把右边那个按钮改一下」，很难说清楚到底指哪一个。

我做了一个开源插件 **DeepSeek Harness Design**，把页面预览和点选修改放进 Harness 的右侧栏。

用法可以概括成三步：**描述页面 → 看预览 → 点选元素继续改。** 想比较不同方向，也可以保留多份方案，直接并排看。

项目地址：[GitHub · DeepSeek Harness Design](https://github.com/heureux831/deepseek-harness-design)

## 一、对话旁边，放一块可以持续修改的画布

[DeepSeek Harness](https://www.deepseek.com/harness/) 是 DeepSeek 的开源 Agent Harness，支持通过插件扩展工具和界面。Design 是我独立维护的社区插件。

安装之后，右侧栏会多一个 **Design** 标签页。第一次打开时，里面有使用指南和示例提示词。

比如，你可以这样开始：

> 帮我做一个咖啡店首页，方案名叫「暖白咖啡首页」。暖白底色、橄榄绿按钮，包含品牌介绍、今日推荐和购买入口。请用 Design 预览。

模型调用插件的保存工具后，页面会出现在侧栏。后续修改继续在同一个方案里追加修订，预览自动更新。

![Design 中的暖白咖啡首页预览](https://raw.githubusercontent.com/heureux831/deepseek-harness-design/v0.6.1/docs/media/design-preview.png)

*本文截图来自真实 Harness 面板，加载的是仓库内的原创咖啡店示例 HTML，用于展示插件功能。*

对我来说，把预览留在对话旁边，最方便的地方是可以一边看、一边继续描述要改哪里。做产品首页、活动页面，或者讨论一个交互草案时，这种来回修改会很直接。

## 二、点一下按钮，再说「把这个改成描边」

这是我最想做好的部分。

打开顶部的「点选」，点击预览里的按钮、标题或卡片，插件会记录元素的文本、选择器、源码片段和位置。下一次模型请求能拿到这些上下文。

然后就可以接着说：

> 把这个按钮改成描边样式，文字改为「了解今日咖啡」，其余布局保持原样。

![点选按钮后，侧栏显示元素定位信息](https://raw.githubusercontent.com/heureux831/deepseek-harness-design/v0.6.1/docs/media/design-selection.png)

这样，模型更容易定位到具体的元素。插件还提供定点替换工具，让模型能够只修改对应片段。

这里有一个使用细节：**「点选已记录」代表插件收到了选择，接下来还需要发送修改要求。** 它不会自己替你决定怎么改，也不保证模型每一次都能完全符合预期。

想试原型里的按钮和脚本，就把「点选」关掉。关掉以后，你可以正常操作页面；开启以后，点击用于告诉模型你指的是哪个元素。

## 三、保留两个方向，放在一起比较

设计页面经常会碰到这种需求：当前这版还不错，但想看看另一种风格。

你可以说：

> 保留「暖白咖啡首页」，再做一个叫「深色编辑风」的独立方案，我想并排比较。

插件会保存两个方案。点击「对比」，两边可以独立选择方案和修订。

![暖白咖啡首页与深色编辑风并排对比](https://raw.githubusercontent.com/heureux831/deepseek-harness-design/v0.6.1/docs/media/design-compare.png)

方案可以用中文命名，也能通过铅笔按钮重命名。「暖白咖啡首页」和「深色编辑风」这样的名称，比几个字母更容易记住各自的区别。

同一方案继续修改，会产生 r1、r2、r3 这样的修订。你可以回看之前的版本，也可以比较同一方案修改前后的效果。

顶部用下拉框选择方案和修订，数量多了也不会把整个工具栏撑满。手机、平板和桌面模式分别使用 390、834、1280 像素的实际视口宽度，方便检查不同宽度下的布局。

## 四、稿子会保存，也能导出 HTML

方案和修订保存在 Harness 的会话存储里。重新打开原会话，可以继续查看和修改已有稿子。

如果会话有工作区，而且允许写入，插件还会额外导出当前 HTML。你可以在工作区的 `.dsh-design` 目录下找到它，用浏览器打开，或者作为后续开发的参考。

草稿保存和文件导出会分别报告结果。比如只读会话仍然可以保存 Harness 草稿，但不会向工作区写 HTML。

当前每个会话最多保存 32 个方案，每个方案保留 40 个历史修订。预览支持页面脚本，同时通过 iframe 沙箱与 Harness 主页面隔离。

## 五、怎么安装、怎么开始

当前发布版本是 **0.6.1**，项目采用 **MIT 许可**。安装包已经放在 GitHub Releases，不需要自己克隆仓库或构建。

[下载插件安装包](https://github.com/heureux831/deepseek-harness-design/releases/tag/v0.6.1)

下载 `deepseek-harness-design-0.6.1.tgz` 后，打开终端，进入下载目录。

如果你使用 **Harness Desktop**：

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile desktop add ./deepseek-harness-design-0.6.1.tgz
```

如果你使用 **Harness Web**，把 `desktop` 改成 `web`。

这些命令需要 Node.js 和 pnpm，推荐 Node.js 24；如果缺少 pnpm，可以先执行 `npm install -g pnpm@11`。已有 `dsh` 命令的用户也可以直接使用它安装。

装好后，重新启动 Harness，展开右侧栏，在 `+` 中选择 **Design**。先让模型做一个简单页面，再试一次点选修改，就能熟悉主要流程。

目前验证的环境是 **DeepSeek Harness Desktop 0.2.0-rc.2 的 Web profile**；安装包也已装进 Desktop profile。Harness 仍在持续迭代，其他版本的兼容性需要实际验证。遇到问题，可以在仓库提 Issue，并附上 Harness 版本和复现步骤。

## 六、适合拿它做什么

我觉得它比较适合这些场景：

- 产品或独立开发者快速做一个可讨论的页面草案。
- 前端开发者试几种布局、配色和按钮样式。
- 设计讨论时，保留几个方向，比较哪一版更合适。
- 学习 HTML、CSS 时，把描述、代码修改和视觉结果放在一起看。

当前主要处理 HTML 原型。正式产品的组件拆分、数据接口、业务逻辑和上线验证，还需要结合项目继续完成。模型调用也由你自己的 Harness 配置提供，插件本身不附带模型服务。

这次公开发布前，我做了 54 项自动化回归和 46 项真实浏览器检查，也验证了存储恢复、工作区导出和失败回滚。它们覆盖了当前已知的使用流程，后续还会根据真实反馈继续完善。

如果你也在用 DeepSeek Harness 做页面，可以下载试试。从一个简单的首页开始，再点一下你想修改的按钮。

[项目源码与使用说明](https://github.com/heureux831/deepseek-harness-design) · [下载 Release](https://github.com/heureux831/deepseek-harness-design/releases/tag/v0.6.1) · [反馈问题](https://github.com/heureux831/deepseek-harness-design/issues)

觉得这个工作流对你有帮助，欢迎给项目一个 Star，也欢迎带着具体的页面需求来提建议。
