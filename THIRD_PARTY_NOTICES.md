# Third-party notices

## Original CodeSnap

CodeSnap Next derives from [kufii/CodeSnap](https://github.com/kufii/CodeSnap),
originally published by Adrien Pyke under the MIT license. Upstream Git history
and copyright attribution are retained; see [LICENSE](LICENSE).

## DOM rendering

Runtime image rendering uses [SnapDOM](https://github.com/zumerlab/snapdom)
(version 3.3.6, MIT). Its package includes its license.
`dom-to-image-even-more@1.0.4` is a development-only benchmark dependency
for the pinned upstream baseline; the extension runtime does not use it.

## Windows image clipboard helper

`src/copy-image-windows.ps1` is adapted from
[SunFlowerBaby32/codesnap-fast](https://github.com/SunFlowerBaby32/codesnap-fast),
[`src/copy-image.ps1` at 4da6979](https://github.com/SunFlowerBaby32/codesnap-fast/blob/4da6979716e09bc8fc162e6123033a0d6cc03778/src/copy-image.ps1).
Local changes remove artificial image-size caps and add an explicit
copy-success acknowledgement. The original MIT notice follows.

MIT License

Copyright (c) Adrien Pyke and CodeSnap contributors
Copyright (c) 2026 SunFlowerBaby32 for the CodeSnap Fast modifications

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
