# Designer 独立实例回归

Host 的单元回归用 `npm test` 执行。以下检查使用实际安装的 Harness 和 Chrome，包含发布 tarball 安装、预览隔离、点选和修订切换。

## 浏览器回归

先运行 `./release.sh`，把生成的 tarball 传给：

```sh
./e2e/run.sh /absolute/path/deepseek-harness-design-0.5.0.tgz
```

脚本需要 macOS 上的 `/Applications/DeepSeek Harness.app` 和 `/Applications/Google Chrome.app`。通过 `DSG_HARNESS_APP` 可调整 Harness app 路径；`DSG_E2E_PORT` 和 `DSG_E2E_CDP` 可调整默认的 19401 / 19501 端口。

脚本创建独立的 `DSH_HOME`、profile、pnpm store 和 Chrome profile，安装 tarball，并用额外 `--patch` 挂载 `test-seed` 插件。测试结束自动关闭自己启动的进程，保留 `/tmp/deepseek-harness-design-e2e.*` 下的日志和截图供检查。

Launcher 参数必须放在 Web 参数前，例如：

```sh
dsh --profile web --patch ./test-seed.patch.yml --no-open --port 19401
```

`e2e.cjs` 与 `cdp.cjs` 是 CommonJS，可直接在本包的 `type: module` 下运行，无需复制到包外。

覆盖应用启动、面板挂载、opaque-origin 沙箱和响应 CSP、轮询刷新、方案/历史修订切换、两栏对比、点选回传、关开开关、在途点击拒收和重新绑定。

`POST /designer/dev/seed` 仅由 `test-seed/index.js` 注册。正式 tarball 没有测试插件，也不会注册这条路由。

## 真实存储与进程重启

以下脚本使用 Harness 自带的 Cordis、storage-domain 和 JSON 存储提供者。第一次进程保存方案和修订，并通过阻断原子文件替换制造持久化失败；第二次进程读回数据并继续追加修订。

```sh
APP='/Applications/DeepSeek Harness.app'
WORK=$(mktemp -d /tmp/deepseek-harness-design-native.XXXXXX)
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/DeepSeek Harness" --expose-internals \
  e2e/harness-storage.mjs write "$WORK"
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/DeepSeek Harness" --expose-internals \
  e2e/harness-storage.mjs read "$WORK"
```

`DSG_HARNESS_MODULES` 可以指定另一份 Harness 的 `node_modules` 根目录。
