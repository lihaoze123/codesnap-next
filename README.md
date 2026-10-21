# CodeSnap Next

English | [简体中文](README.zh-CN.md)

A standalone VS Code extension derived from [CodeSnap](https://github.com/kufii/CodeSnap).
It uses SnapDOM, revisioned PNG caching, and acknowledged native clipboard backends for Windows and Wayland.

Independently maintained, with a focus on faster image generation, reliable copying, and long code screenshots.

- [Changes from upstream (Chinese)](docs/CHANGES.md)
- [Benchmark results, scope, and reproduction steps (Chinese)](docs/BENCHMARK.md)

Measured in headless Chromium on Linux. **Median total time until the clipboard write completes**
(2× output, 20 samples per scenario):

| Selection                 | Original 1.3.4 | Next: render and copy | Next: reuse prepared PNG |
| ------------------------- | -------------- | --------------------- | ------------------------ |
| 200 lines / 552 × 5104px  | 1378.4ms       | 185.6ms               | 18.7ms                   |
| 450 lines / 552 × 11104px | 2311.2ms       | 394.0ms               | 37.0ms                   |

Cached timings exclude the earlier PNG preparation. Uncached P95 at 200 lines was 224.1ms,
which does not yet meet the 200ms optimization target. These are not end-to-end measurements
of Windows / Wayland native backends or the VS Code Webview. See the benchmark report for
the environment, P95, and raw samples.

Extension ID: `chumeng.codesnap-next`. Command: **CodeSnap Next 📸** (`codesnapNext.start`).
Settings use `codesnapNext.*`; existing `codesnap.*` settings are not imported. Both extensions can
be installed together.
For a local VSIX, run `npm ci`, then `npx @vscode/vsce package`, and use **Extensions: Install from VSIX**.

## Features

- SnapDOM rendering with reusable PNG caching
- Browser clipboard copying, with native Windows and Wayland backends
- Explicit selection capture, progress feedback, and retries
- Full-size long screenshots with a choice of 1× or 2× resolution
- Configurable line numbers, colours, shadows, padding, and window controls

## Usage Instructions

1. Open the command palette (Ctrl+Shift+P on Windows and Linux, Cmd+Shift+P on OS X) and search for `CodeSnap Next`.
2. Select code before opening CodeSnap Next, or select code and click **Update selection** in the preview.
3. Adjust the width of the screenshot if desired. Eligible images are prepared in the background.
4. Click **Copy image** or **Save image**. The shutter button follows `codesnapNext.shutterAction`.

Changing the editor selection does not automatically update the preview. Click **Update selection**
to capture it. Capturing highlighted code uses and replaces the system clipboard; resizing, changing
settings, and preparing images do not. After changing the editor theme, update the selection to
capture its new syntax colours. Reopening an existing preview preserves its captured code.

**Tips**:

- You can also start CodeSnap Next by selecting code, right clicking, and clicking **CodeSnap Next 📸**
- If you'd like to bind CodeSnap Next to a hotkey, open up your keyboard shortcut settings and bind `codesnapNext.start` to a custom keybinding.
- If you'd like to copy to clipboard instead of saving, click the image and press the copy keyboard shortcut (defaults are Ctrl+C on Windows and Linux, Cmd+C on OS X), or set `codesnapNext.shutterAction` to `copy` in your settings

## Examples

These examples are inherited from the original CodeSnap project.

[Material Theme](https://marketplace.visualstudio.com/items?itemName=Equinusocio.vsc-material-theme) + [Operator Mono](https://www.typography.com/fonts/operator/styles/operatormono)

![Example 1](https://raw.githubusercontent.com/kufii/CodeSnap/master/examples/material_operator-mono.png)

[Nord](https://github.com/arcticicestudio/nord-visual-studio-code) + [Cascadia Code](https://github.com/microsoft/cascadia-code)

![Example 2](https://raw.githubusercontent.com/kufii/CodeSnap/master/examples/nord_cascadia-code.png)

Monokai + [Fira Code](https://github.com/tonsky/FiraCode)

![Example 3](https://raw.githubusercontent.com/kufii/CodeSnap/master/examples/monokai_fira-code.png)

## Configuration

CodeSnap Next is highly configurable. Here's a list of settings you can change to tune the way your screenshots look:

**`codesnapNext.backgroundColor`:** The background color of the snippet's container. Can be any valid CSS color.

**`codesnapNext.boxShadow`:** The CSS box-shadow for the snippet. Can be any valid CSS box shadow.

**`codesnapNext.containerPadding`:** The padding for the snippet's container. Can be any valid CSS padding.

**`codesnapNext.roundedCorners`:** Boolean value to use rounded corners or square corners for the window.

**`codesnapNext.showWindowControls`:** Boolean value to show or hide OS X style window buttons.

**`codesnapNext.showWindowTitle`:** Boolean value to show or hide window title `folder_name - file_name`.

**`codesnapNext.showLineNumbers`:** Boolean value to show or hide line numbers.

**`codesnapNext.realLineNumbers`:** Boolean value to start from the real line number of the file instead of 1.

**`codesnapNext.transparentBackground`:** Boolean value to use a transparent background when taking the screenshot.

**`codesnapNext.target`:** Either `container` to take the screenshot with the container, or `window` to only take the window.

**`codesnapNext.shutterAction`:** Either `save` to save the screenshot into a file, or `copy` to copy the screenshot into the clipboard.

## Image preparation and copying

Images use [SnapDOM](https://github.com/zumerlab/snapdom), at a default 2× resolution independent of
display scaling. Use **Resolution** to explicitly select 1× for larger selections. Output dimensions
and pixel count are displayed below the toolbar; changing resolution preserves the full selection.
A prepared PNG Blob is reused until the code, appearance, dimensions, or resolution change.
Copying fixes the preview state at the moment of the action, even if settings change while it runs.
The flash occurs only after the clipboard write succeeds. Failed exports show a retry action;
**Save image** is always an explicit alternative.

On Linux Wayland, a denied browser write falls back to the local `wl-copy` command when available.
The extension waits for its result before reporting success and reuses that working backend for
subsequent copies. CodeSnap Next runs in the local UI extension host, including for remote workspaces;
it refuses to run the native fallback on a remote host. If `wl-copy` is unavailable, the failure is
reported explicitly; nothing is installed automatically. macOS retains the browser path.

On Windows, `codesnapNext.clipboardMode: "auto"` selects a local Windows PowerShell STA helper
**before** calling the browser clipboard. The helper publishes the original PNG plus a compatible
Bitmap format, keeps the data available after the helper exits, retries brief clipboard contention, and
acknowledges success before the flash. This path is adapted from
[CodeSnap Fast](https://github.com/SunFlowerBaby32/codesnap-fast); its image-size caps are not adopted.
The original PNG is placed in a per-request temporary directory and removed when the request ends.
PowerShell runs hidden with the current execution policy; no administrator privileges or execution
policy changes are requested. If it is unavailable or blocked, use the explicit browser mode:

```json
{
  "codesnapNext.clipboardMode": "browser",
  "codesnapNext.showTiming": true
}
```

Preparing and clipboard-writing stages are always visible. `showTiming` additionally shows the
preparation and clipboard durations after success. The Windows helper has a 15-second process
timeout and the Webview waits up to 20 seconds for its reply; failures do not report success.

Background preparation covers up to 200 lines and 4 million output pixels. Larger images are
generated on demand. There are no extension-imposed pixel-count, side-length, or PNG payload-size
caps. Large PNG exports use SnapDOM's windowed PNG export when supported by the browser. Images
are never silently resized or cropped; a renderer warning about downscaling is reported as an
error. Available memory, the browser, the operating system and the receiving application still
determine what can actually be rendered or pasted. Resolution remains an explicit choice: 2×
doubles both dimensions and uses four times as many pixels as 1×.

Use **Performance** for cache hit rate and cached/uncached copy P95. Developer Tools contains the
last 200 timing samples, including DOM capture, PNG encoding, output size and export failures.
Native Windows samples also include the helper's clipboard-only and total helper timings.
These measurements stay in memory and contain no code or image data. `writeMs` includes waiting
for the promised PNG on an uncached copy; it is not a measurement of the compositor alone.

The performance targets are cached copy P95 ≤50ms and uncached copy P95 ≤200ms for selections
within the background preparation limits. They are targets, not guarantees. End-to-end Wayland,
other operating systems, fonts and remote-development windows require platform validation.

## Development checks

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to test with an existing Chromium-based browser. The tests
exercise native-host message handling with a VS Code API mock, real browser PNG clipboard writes
and reads from another page, permission-denied native fallback, stale snapshots, retries, large exports, transparency and pixel comparison
against browser paint. The native rich-text clipboard acquisition still needs a VS Code smoke test.
On Windows, `npm test` also runs the real helper with `-CheckOnly` to verify PNG and Bitmap data
preparation and the original PNG hash without changing the clipboard. That test is skipped on
other operating systems. Windows end-to-end paste compatibility and actual timings still require
testing on Windows; Linux browser tests and mocked process tests cannot establish them.

## Acknowledgements

[CodeSnap](https://github.com/kufii/CodeSnap) by Adrien Pyke and its contributors, for the original extension.

[CodeSnap Fast](https://github.com/SunFlowerBaby32/codesnap-fast), for the Windows clipboard helper.

See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md) for attribution and licensing.

The great [Polacode](https://github.com/octref/polacode), for the initial concept.

[Carbon](https://carbon.now.sh/) for some design inspiration.
