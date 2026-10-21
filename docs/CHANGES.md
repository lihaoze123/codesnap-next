# 与原版 CodeSnap 的区别

CodeSnap Next 是从 [kufii/CodeSnap](https://github.com/kufii/CodeSnap) 派生的独立项目。
本次对比固定在原版 **1.3.4 / `6de4a985`**，并不代表未来上游版本。
完整上游历史保留在 Git 中；本项目独立维护，不隶属于原作者。

## 变化一览

| 项目         | 原版 1.3.4                                      | CodeSnap Next 0.1.0                                                      |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 扩展标识     | `adpyke.codesnap`                               | `HaozeLi.codesnap-next`                                                  |
| 命令         | `codesnap.start`                                | `codesnapNext.start`                                                     |
| 设置         | `codesnap.*`                                    | `codesnapNext.*`，不自动迁移                                             |
| DOM → 图片   | `dom-to-image-even-more@1.0.4`                  | `@zumer/snapdom@3.3.6`                                                   |
| 每次复制     | 重新渲染、PNG Data URL、Base64 解码、写入剪贴板 | 复用当前版本的 PNG Blob；内容、尺寸、字体或外观变化后失效                |
| 预生成       | 无                                              | ≤200 行且 ≤4MP 时后台生成；更大的图片在点击时生成                        |
| 复制时的内容 | 异步操作实时 DOM                                | 点击时冻结 DOM、样式和尺寸，避免中途变化造成错图                         |
| 浏览器写入   | 调用 `write()` 后不等待完成就闪光               | 等待成功；失败反馈、重试和另存图片                                       |
| Wayland      | 浏览器剪贴板路径                                | 浏览器拒绝后回退本机 `wl-copy`，成功后复用此路径                         |
| Windows      | 浏览器剪贴板路径                                | 默认先用本机 PowerShell STA，发布 PNG + Bitmap，等待确认                 |
| 选区变化     | 每次触发高亮复制，经过系统剪贴板                | 首次打开或显式 Update selection 时获取，其他选区变化只提示               |
| 分辨率       | 固定 2×                                         | 显式 1× / 2×，显示尺寸和像素数                                           |
| 长图         | 单画布导出受浏览器能力限制                      | SnapDOM 支持时分窗口导出 PNG，不添加扩展层面的尺寸、像素数或传输大小上限 |
| 反馈         | 快门闪光                                        | 准备、写入、成功、失败和重试；可选耗时、缓存命中率和 P95                 |
| 远程工作区   | 未声明本地 UI 扩展宿主                          | 本地 UI 宿主；拒绝在远端主机调用本机剪贴板后端                           |
| 回归验证     | 上游未提供本项目这些测试                        | 浏览器 PNG 读回、缓存竞态、失败路径、长图、视觉比较和本机后端协议测试    |

## 为什么重复复制更快

原版每次都进行 DOM 遍历、样式内联、SVG / Canvas 渲染、PNG 编码和 Base64 往返。
Next 将渲染与复制分开：图片准备完成后，重复复制直接使用 PNG Blob。
浏览器路径不需要自己把 PNG 转成 Base64；原生后端仍需 Base64 经过 Webview 消息传输，
同一个 PNG 的序列化结果也会复用。

缓存的改善只适用于图片没有变化时。重新生成仍需完整渲染，耗时会随代码量和像素数增加。
没有引入 WASM；本次主要优化来自渲染库替换、减少重复工作和剪贴板控制流程调整。
实际数据和测量范围见 [Benchmark](BENCHMARK.md)。

## 使用上的变化

- 命令面板搜索 **CodeSnap Next**。旧版可以共存，二者使用不同的设置和命令。
- 旧的 `codesnap.*` 配置需要手动改为 `codesnapNext.*`。
- 选区变化后点击 **Update selection**。获取高亮代码依然会覆盖系统剪贴板，普通调整和预生成不会。
- Windows 默认采用本机后端；设置 `codesnapNext.clipboardMode: "browser"` 可切换为浏览器路径。
- Wayland 回退需要本机已有 `wl-copy`；扩展不会自动安装它。macOS 保留浏览器路径。
- 图片不会被静默缩小或裁剪。选择 1× 会将宽高各减半，像素数变为 2× 时的四分之一。

## 来源与验证范围

Windows 辅助脚本参考 [SunFlowerBaby32/codesnap-fast](https://github.com/SunFlowerBaby32/codesnap-fast)，
保留 PNG + Bitmap、STA 和剪贴板争用重试，增加确认协议，并去掉其人工尺寸上限。
见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

本机已验证 Linux Chromium 浏览器复制与 PNG 读回，以及 Wayland `wl-copy` / `wl-paste` 往返。
Windows 的自动后端选择、进程调用和确认协议有自动化测试，但 Windows 实际复制速度及接收应用兼容性
尚待实机验证。Windows 专用 `-CheckOnly` 测试在 Linux 上跳过。
超长图仍受浏览器、内存、操作系统及粘贴目标限制；取消人工上限不等于所有尺寸都能成功。

发布者 ID 为 `HaozeLi`。也可从源码打包 VSIX 安装。
