# 与原版的 Benchmark

对比对象是原版 [CodeSnap 1.3.4 / `6de4a985`](https://github.com/kufii/CodeSnap/tree/6de4a985c48de8ab69c4258e9406e408f7e5a8d6)
和本项目 CodeSnap Next 0.1.0。原版使用其 lockfile 中的 `dom-to-image-even-more@1.0.4`；
Next 使用 `@zumer/snapdom@3.3.6`。不使用其他 fork 的宣传数据作为测量结果。

## 本机实测结果

测量时间：2026-10-21T08:22:16.350Z。环境：Linux 7.2.8-cachyos / 13th Gen Intel(R) Core(TM) i5-13400 / 16 个逻辑 CPU / 7.53 GiB RAM / Node v24.21.0 / Edge Chromium 154.0.4258.53，无头模式。

[完整原始样本与源码哈希](benchmarks/linux-2026-10-21.json)。每个行数、每种模式各 20 个正式样本，共 180 次；不含预热。

### 复制总耗时：Median / P95（ms）

| 行数 | 输出尺寸（2×） | 原版，每次重新生成 | Next 未缓存   | Next 已缓存 | 未缓存 / 已缓存加速比 ¹ |
| ---- | -------------- | ------------------ | ------------- | ----------- | ----------------------- |
| 12   | 510 × 592      | 184.9 / 193.9      | 30.7 / 38.0   | 3.6 / 4.6   | 6.0× / 51.4×            |
| 200  | 552 × 5104     | 1378.4 / 1414.2    | 185.6 / 224.1 | 18.7 / 24.6 | 7.4× / 73.7×            |
| 450  | 552 × 11104    | 2311.2 / 2395.6    | 394.0 / 461.2 | 37.0 / 41.0 | 5.9× / 62.5×            |

¹ 加速比按总耗时 Median 计算，相对于原版的每次重新生成。已缓存路径把生成工作提前完成，并非同等工作量的渲染加速。

### PNG 生成：Median / P95（ms）

| 行数 | 原版 Data URL 就绪 | Next Blob 就绪 |
| ---- | ------------------ | -------------- |
| 12   | 179.6 / 187.3      | 25.3 / 31.4    |
| 200  | 1342.8 / 1382.3    | 161.6 / 199.2  |
| 450  | 2261.1 / 2348.0    | 347.1 / 420.7  |

200 行这组中，Next 已缓存复制 P95 **24.6ms**，达到 50ms 目标；未缓存 P95 **224.1ms**，**尚未达到 200ms 目标**。450 行的数据属于大选区，不应用该目标判断。

## 测量定义

每个场景预热 2 次，然后采样 20 次；同一浏览器上下文，每份选区两个页面，依次交错运行原版、
Next 未缓存、Next 已缓存。表中数据为毫秒，保留一位小数。Median 和 P95 使用排序后
nearest-rank 方法，分别取第 `ceil(n × 0.5)` 和 `ceil(n × 0.95)` 个样本。
20 个样本的 P95 是描述性统计，不能代表长期分布。

- **复制总耗时**：从页面内调用截图复制，到真实 `navigator.clipboard.write()` 的 Promise 成功。
  原版不等待写入就返回，因此 benchmark 在外部观察并等待该 Promise，避免把“发起复制”误当成“复制完成”。
- **PNG 生成**：原版的 `toPng()` 耗时；Next 缓存记录的渲染耗时，含 DOM 捕获及 PNG 编码。
  原版结果是 Data URL，Next 是 Blob，所以这两列表示各自得到可用 PNG 的成本，并非完全相同的内部阶段。
  Next 点击时冻结 DOM 的成本包含在复制总耗时中，不全部计入渲染计时。
- **未缓存**：每次调用前使 Next 的 PNG 缓存失效；浏览器、模块、字体和 SnapDOM 内部资源缓存已经预热。
  这不等于首次启动 VS Code 或冷进程。原版每次均重新生成 PNG。
- **已缓存**：紧接未缓存复制，复用同一份 PNG。此前生成 PNG 的成本另列在未缓存场景，不能忽略。
- 每次写入后读回 PNG 并解码，验证三个场景的输出宽高一致。读回和校验不计入耗时。
  宽高相同不等于逐像素一致；本项目另有 PNG 与浏览器绘制的视觉回归测试。

输入是合成的高亮 JavaScript，每行三个 span，例如 `const x199 = 199;`。
字体为 monospace 10px、行高 12px，保留行号、阴影、窗口按钮和背景；导出倍率 2×、DPR 1。
行数不能单独决定图片成本，应同时比较表中的像素尺寸。200 行约 2.82MP，处于预生成范围；
450 行超过行数阈值，首次生成在点击时完成，之后不变的图片仍可复用。

## 这些数据能说明什么

替换渲染库降低了每次重新生成的耗时；复用 PNG 进一步省掉重新渲染和编码。
已缓存复制和未缓存生成是不同工作量，不能只引用缓存倍数来宣传全部场景的提升。

50ms 已缓存 / 200ms 未缓存的 P95 是 ≤200 行且 ≤4MP 的优化目标，不是跨机器保证。
应直接用本次 P95 判断是否达到，不能用 Median 代替；大选区不在这组目标内。
单次会话未隔离 CPU、内存压力或电源频率，结果可能随字体、语法 token 数、窗口宽度和宿主浏览器变化。

## 尚未测量的部分

本报告测的是 **Linux 无头 Chromium 的 Web Clipboard API**，没有运行 VS Code / Electron Webview。
因此不包含 VS Code 获取高亮选区、扩展激活、Webview 初始化、原生后端消息传输或接收应用的粘贴耗时。
无头浏览器的剪贴板结果不能当成 Wayland 合成器的端到端耗时。

- Wayland `wl-copy` / `wl-paste` 原生路径做过真实 PNG 往返验证，但本表没有与原版同条件对照的原生基准。
- Windows 使用浏览器剪贴板路径，但本表仍不能替代 VS Code / Electron Webview 中的实际复制和粘贴测量。
- macOS、VS Code 远程窗口、不同接收应用、首次启动、峰值内存和 900 行极长图的耗时未列入对比。

不会把其他项目所述“200 行生成 2 秒、写入 1 秒”或用户反馈中的“十几秒”作为本项目加速倍数的基线。
长图的完整导出另由回归测试覆盖：例如 900 行 PNG 可保留 664 × 36330 的尺寸，
这是一项完整性验证，不是本报告的性能数字。

## 复现

需要 Node.js 24、Git 和完整 Git 历史。浅克隆若缺少基线提交，请先运行 `git fetch --unshallow`。
原版页面及其 JS / CSS 直接从保留的 Git 提交读取，不对其渲染逻辑打补丁；
只改写测试服务器中的依赖 URL 和 CSP 占位符。原版依赖仅供开发基准使用，不包含在扩展运行依赖中。

```sh
git clone https://github.com/lihaoze123/codesnap-next.git
cd codesnap-next
npm ci
npx playwright install chromium
npm run benchmark
```

默认结果写入 `docs/benchmarks/latest.json`，包含环境、源码 SHA-256、逐次样本、宽高、PNG 大小和统计。
Linux 系统依赖不足时可运行 `npx playwright install --with-deps chromium`。
使用其他 Chromium 可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`。例如：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium \
  BENCHMARK_SAMPLES=20 \
  BENCHMARK_OUTPUT=docs/benchmarks/local.json \
  npm run benchmark
```

测量期间关闭其他性能测试和构建任务；操作系统、浏览器版本和输出尺寸不一致时，不宜直接比较。
运行此 benchmark 会覆盖测试浏览器的图片剪贴板。
