# CodeSnap Next

[English](README.md) | 简体中文

基于 [CodeSnap](https://github.com/kufii/CodeSnap) 独立维护的 VS Code 代码截图扩展。
采用 SnapDOM、随内容版本失效的 PNG 缓存，以及等待成功确认的 Windows / Wayland 原生剪贴板后端，
重点改善图片生成速度、复制可靠性和长代码导出。

- [与原版的变化](docs/CHANGES.md)
- [Benchmark：实测数据、范围与复现方式](docs/BENCHMARK.md)

Linux 无头 Chromium 实测，以下为复制完成总耗时的**中位数**（2×，每种场景采样 20 次）：

| 选区                   | 原版 1.3.4 | Next 重新生成后复制 | Next 复用已准备 PNG |
| ---------------------- | ---------- | ------------------- | ------------------- |
| 200 行 / 552 × 5104px  | 1378.4ms   | 185.6ms             | 18.7ms              |
| 450 行 / 552 × 11104px | 2311.2ms   | 394.0ms             | 37.0ms              |

缓存数据不含此前生成 PNG 的时间。200 行未缓存 P95 为 224.1ms，尚未达到 200ms 的优化目标。
这些不是 Windows / Wayland 原生后端或 VS Code Webview 的端到端数据；环境、P95 和原始样本见 benchmark 报告。

商店显示名称：**CodeSnap Next (chumeng)**。
扩展 ID：`chumeng.codesnap-next-chumeng`。命令：**CodeSnap Next 📸**（`codesnapNext.start`）。
配置使用 `codesnapNext.*`，不会自动导入原版的 `codesnap.*` 设置，两款扩展可以共存。
可先运行 `npm ci`，再运行 `npx @vscode/vsce package` 打包，并通过 **Extensions: Install from VSIX** 安装。

## 功能

- SnapDOM 渲染与可复用的 PNG 缓存
- 浏览器图片复制，以及 Windows / Wayland 原生剪贴板后端
- 显式获取选区、阶段反馈和失败重试
- 完整长图导出，可选择 1× 或 2× 分辨率
- 可配置行号、颜色、阴影、边距和窗口按钮

## 使用方法

1. 打开命令面板：Windows / Linux 使用 Ctrl+Shift+P，macOS 使用 Cmd+Shift+P，搜索 `CodeSnap Next`。
2. 打开前先选中代码；也可以打开后选择代码，点击预览中的 **Update selection** 获取选区。
3. 按需调整截图宽度。满足预生成条件时，CodeSnap Next 会在后台准备图片。
4. 点击 **Copy image** 复制，或 **Save image** 保存。快门按钮的行为由 `codesnapNext.shutterAction` 决定。

编辑器选区变化不会自动更新预览，需要点击 **Update selection**。
获取带语法高亮的代码会使用并覆盖系统剪贴板；调整尺寸、修改设置和准备图片不会。
更换编辑器主题后，请重新获取选区以更新语法颜色。重新打开已有预览会保留此前获取的代码。

**提示：**

- 也可选中代码后右键，选择 **CodeSnap Next 📸**。
- 在键盘快捷方式设置中，为 `codesnapNext.start` 绑定快捷键即可快速启动。
- 点击图片后可使用 Ctrl+C（Windows / Linux）或 Cmd+C（macOS）复制；将 `codesnapNext.shutterAction` 设为 `copy`，也可让快门按钮执行复制。

## 示例

以下示例沿用自原版 CodeSnap 项目。

[Material Theme](https://marketplace.visualstudio.com/items?itemName=Equinusocio.vsc-material-theme) + [Operator Mono](https://www.typography.com/fonts/operator/styles/operatormono)

![示例 1](https://raw.githubusercontent.com/kufii/CodeSnap/master/examples/material_operator-mono.png)

[Nord](https://github.com/arcticicestudio/nord-visual-studio-code) + [Cascadia Code](https://github.com/microsoft/cascadia-code)

![示例 2](https://raw.githubusercontent.com/kufii/CodeSnap/master/examples/nord_cascadia-code.png)

Monokai + [Fira Code](https://github.com/tonsky/FiraCode)

![示例 3](https://raw.githubusercontent.com/kufii/CodeSnap/master/examples/monokai_fira-code.png)

## 配置

可通过以下设置调整截图外观：

**`codesnapNext.backgroundColor`：** 代码容器的背景色，支持有效的 CSS 颜色值。

**`codesnapNext.boxShadow`：** 窗口阴影，支持有效的 CSS `box-shadow` 值。

**`codesnapNext.containerPadding`：** 容器内边距，支持有效的 CSS `padding` 值。

**`codesnapNext.roundedCorners`：** 是否使用圆角窗口。

**`codesnapNext.showWindowControls`：** 是否显示 macOS 风格的窗口按钮。

**`codesnapNext.showWindowTitle`：** 是否显示 `文件夹名 - 文件名` 形式的窗口标题。

**`codesnapNext.showLineNumbers`：** 是否显示行号。

**`codesnapNext.realLineNumbers`：** 是否使用源文件中的真实行号，而非从 1 开始。

**`codesnapNext.transparentBackground`：** 是否使用透明背景。

**`codesnapNext.target`：** `container` 表示包含外部容器，`window` 表示仅导出代码窗口。

**`codesnapNext.shutterAction`：** `save` 表示保存为文件，`copy` 表示复制到剪贴板。

## 图片准备与复制

图片由 [SnapDOM](https://github.com/zumerlab/snapdom) 生成，默认使用独立于显示缩放的 2× 分辨率。
大选区可通过 **Resolution** 显式选择 1×。工具栏下方会显示输出尺寸和像素数，切换分辨率保留完整选区。
已准备的 PNG Blob 会持续复用，直到代码、外观、尺寸或分辨率发生变化。
复制采用点击时的预览状态，即使处理期间更改设置，也不会混入新状态。
只有剪贴板写入成功后才会闪光；导出失败会显示重试入口，也可以选择 **Save image** 保存。

Linux Wayland 下，如果浏览器写入被拒绝且本机已安装 `wl-copy`，扩展会回退到该命令。
扩展等待命令结果后才报告成功，并在后续复制中复用已成功的后端。
包括远程工作区在内，CodeSnap Next 均在本地 UI 扩展宿主运行，拒绝在远端主机执行原生回退。
缺少 `wl-copy` 时会明确报错，不会自动安装。macOS 保留浏览器路径。

Windows 下，`codesnapNext.clipboardMode: "auto"` 会**优先**使用本机 Windows PowerShell STA 辅助脚本，
而不是先尝试浏览器剪贴板。脚本同时提供原始 PNG 和兼容的 Bitmap 格式，退出后仍保留剪贴板数据，
短暂争用时重试，并在成功确认后才触发闪光。该路径改编自
[CodeSnap Fast](https://github.com/SunFlowerBaby32/codesnap-fast)，未沿用其图片尺寸上限。
原始 PNG 放在每次请求独立的临时目录中，请求结束后删除。
PowerShell 隐藏运行并遵循现有执行策略，不请求管理员权限或更改执行策略。
如果 PowerShell 不可用或被阻止，可显式切换为浏览器模式：

```json
{
  "codesnapNext.clipboardMode": "browser",
  "codesnapNext.showTiming": true
}
```

准备图片和写入剪贴板的阶段始终可见。开启 `showTiming` 后，成功提示还会显示这两个阶段的耗时。
Windows 辅助进程超时为 15 秒，Webview 等待回复最长 20 秒；失败不会显示为成功。

后台预生成范围为不超过 200 行且不超过 400 万输出像素，更大的图片在复制或保存时生成。
扩展不设像素数、单边长度或 PNG 传输大小的人为上限。浏览器支持时，长图通过 SnapDOM 分窗口导出 PNG。
图片不会被静默缩小或裁剪，渲染库报告的缩小警告会作为错误显示。
实际能否生成或粘贴，仍取决于可用内存、浏览器、操作系统和接收应用。
分辨率由用户显式选择：2× 相比 1× 宽高各翻倍，像素数为四倍。

点击 **Performance** 可查看缓存命中率及缓存命中 / 未命中时的复制 P95。
开发者工具中保留最近 200 个计时样本，包含 DOM 捕获、PNG 编码、输出尺寸和导出失败信息。
Windows 原生路径还会记录辅助脚本的剪贴板写入时间和总耗时。
这些数据仅存于内存，不包含代码或图片内容。未命中缓存时，`writeMs` 包含等待 PNG 就绪的时间，
不能将其理解为单独的合成器写入耗时。

预生成范围内的优化目标是：缓存命中复制 P95 ≤50ms，未命中复制 P95 ≤200ms。
这些是目标而非保证。Wayland 端到端路径、其他操作系统、不同字体和远程开发窗口仍需平台验证。

## 开发检查

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 使用已有的 Chromium 系浏览器。
测试覆盖 VS Code API 模拟环境中的宿主消息处理、真实浏览器 PNG 写入及另一页面的读回、权限拒绝后的原生回退、
过期快照、重试、大图导出、透明度，以及与浏览器绘制结果的像素比较。
原生高亮代码获取仍需在 VS Code 中进行冒烟测试。

Windows 上，`npm test` 还会使用真实辅助脚本的 `-CheckOnly` 模式验证 PNG / Bitmap 数据准备和原始 PNG 哈希，
不修改剪贴板；该测试在其他操作系统上跳过。
Windows 端到端粘贴兼容性和实际耗时仍需 Windows 实机验证，Linux 浏览器测试及进程模拟测试不能替代。

## 致谢

[CodeSnap](https://github.com/kufii/CodeSnap) 的原作者 Adrien Pyke 及其贡献者，提供了原始扩展。

[CodeSnap Fast](https://github.com/SunFlowerBaby32/codesnap-fast)，提供了 Windows 剪贴板辅助脚本的参考实现。

[Polacode](https://github.com/octref/polacode)，提供了最初的创意。

[Carbon](https://carbon.now.sh/)，提供了部分设计灵感。

署名和许可信息见 [LICENSE](LICENSE) 与[第三方声明](THIRD_PARTY_NOTICES.md)。
