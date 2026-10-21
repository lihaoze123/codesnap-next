# CodeSnap Next

## 0.1.2

- Wrap long lines automatically within a configurable `codesnapNext.maxWidth` (960 CSS pixels by default), preserving source line numbers and complete PNG exports.

## 0.1.1

- Remove the Windows PowerShell clipboard helper and always use the Webview browser clipboard on Windows.
- Keep the optional `wl-copy` fallback for Linux Wayland sessions.

## 0.1.0

- Independent extension identity, commands and settings.
- SnapDOM rendering, revisioned PNG cache and immutable click-time snapshots.
- Acknowledged Windows STA and Wayland clipboard copying.
- Explicit capture, progress, retries, timing and resolution controls.
- Full-size long PNG export without extension-imposed dimension or payload caps.
- See [changes](docs/CHANGES.md) and [benchmarks](docs/BENCHMARK.md).

## Inherited development and upstream history

# Change Log

All notable changes to the "codesnap" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.3.8]

- Prefer local Windows PowerShell STA image copying in auto mode, with PNG and Bitmap formats.
- Show preparation and clipboard-writing phases, with optional per-copy timings.
- Add an explicit browser-only clipboard mode and acknowledge native writes before flashing.

## [1.3.4]

- Fix issue where extension didn't work with `editor.copyWithSyntaxHighlighting: false`

## [1.3.3]

- Fixed issue with copy to clipboard in windows

## [1.3.2]

- Fixed issue with inconsistent start up

## [1.3.1]

- Fixed issue with screenshot margins

## [1.3.0]

- Add `shutterAction` option
- Fix issue with transparency on windows
- Fix auto width of snap shots

## [1.0.26]

- Update copy to clipboard permissions for OS X

## [1.0.20]

- Support `editor.fontLigatures: false`

## [1.0.19]

- Fixed some issues with generated images

## [1.0.18]

- Added command in right click context menu

## [1.0.14]

- Added usage instructions to readme

## [1.0.13]

- Fixed font rendering issues with certain font settings

## [1.0.9]

- Fixed issues when using language specific settings

## [1.0.8]

- Fixed line number alignment on narrow screen

## [1.0.7]

- Fixed render issue with line numbers

## [1.0.6]

- Fixed render issue when saving on certain VS Code configurations

## [1.0.0]

- Initial release
