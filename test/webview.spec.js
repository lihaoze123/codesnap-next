'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs').promises;

const config = {
  fontLigatures: true,
  tabSize: 2,
  backgroundColor: '#abb8c3',
  boxShadow: 'rgba(0, 0, 0, 0.55) 0px 20px 68px',
  containerPadding: '3em',
  roundedCorners: true,
  showWindowControls: true,
  showWindowTitle: true,
  windowTitle: 'Example',
  showLineNumbers: true,
  realLineNumbers: true,
  startLine: 9,
  transparentBackground: false,
  target: 'container',
  shutterAction: 'copy'
};
const codeHtml = (lines = 12) =>
  '<div style="font-family:monospace;font-size:14px;line-height:20px">' +
  Array.from(
    { length: lines },
    (_, i) =>
      `<div><span style="color:#c586c0">const </span><span style="color:#dcdcaa">line${i}</span><span style="color:#d4d4d4"> = &quot;hello =&gt; world&quot;;</span></div>`
  ).join('') +
  '</div>';

const open = async (page, lines = 12) => {
  await page.addInitScript(() => {
    window.messages = [];
    window.acquireVsCodeApi = () => ({
      postMessage: async (message) => {
        window.messages.push(message);
        if (message.type !== 'copy-native') return;
        if (window.nativeCopy) {
          if (window.nativePause)
            await new Promise((resolve) => {
              window.resumeNative = resolve;
            });
          const binary = atob(message.data);
          const blob = new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], {
            type: 'image/png'
          });
          await window.realWrite([new ClipboardItem({ 'image/png': blob })]);
          window.postMessage({ type: 'native-copy-result', id: message.id, backend: 'wl-copy' });
        } else {
          window.postMessage({
            type: 'native-copy-result',
            id: message.id,
            error: 'Clipboard access denied by native test backend.'
          });
        }
      }
    });
    document.execCommand = (command) => {
      if (command !== 'paste') return false;
      const data = new DataTransfer();
      data.setData('text/html', window.codeHtml);
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
      return true;
    };
  });
  await page.goto('/webview/index.html');
  await page.waitForFunction(() => window.messages.some((message) => message.type === 'ready'));
  await page.evaluate(
    async ({ cfg, html }) => {
      document.documentElement.style.cssText =
        '--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#d4d4d4;--vscode-editor-font-family:monospace;--vscode-editor-font-size:14;--vscode-editor-font-weight:400;--vscode-editorLineNumber-foreground:#858585';
      window.renderCount = 0;
      const { renderer } = await import('/webview/src/renderer.js');
      const render = renderer.toBlob;
      renderer.toBlob = (...args) => {
        window.renderCount++;
        return render(...args);
      };
      window.codeHtml = html;
      window.postMessage({ type: 'capture', config: cfg });
    },
    { cfg: config, html: codeHtml(lines) }
  );
  await expect(page.locator('#status')).toHaveText('Ready to copy.');
};

const imageInfo = (page) =>
  page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const blob = await items[0].getType('image/png');
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      corner: Array.from(ctx.getImageData(0, 0, 1, 1).data),
      bytes: blob.size
    };
  });

test('copies a real PNG, reuses cache, and does not recapture changed selection', async ({
  page,
  context
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  const dimensions = await page
    .locator('#snippet-container')
    .evaluate((node) => ({ width: node.offsetWidth * 2, height: node.offsetHeight * 2 }));
  const renders = await page.evaluate(() => window.renderCount);
  await page.locator('#copy-image').click();
  await expect(page.locator('#status')).toHaveText('Copied image.');
  // Independent reader page exercises the browser clipboard, not a mocked write.
  const reader = await context.newPage();
  await reader.goto('/webview/index.html');
  const png = await imageInfo(reader);
  expect(png.width).toBe(dimensions.width);
  expect(png.height).toBe(dimensions.height);
  expect(png.corner).toEqual([171, 184, 195, 255]);
  expect(png.bytes).toBeGreaterThan(1000);
  await reader.close();
  await page.bringToFront();
  for (let i = 0; i < 20; i++) {
    await page.locator('#copy-image').click();
    await expect(page.locator('#copy-image')).toHaveAttribute('aria-disabled', 'false');
  }
  expect(await page.evaluate(() => window.renderCount)).toBe(renders);
  await page.evaluate(() => window.postMessage({ type: 'selection-changed' }));
  await expect(page.locator('#selection-status')).toContainText('selection changed');
  expect(
    await page.evaluate(
      () => window.messages.filter((message) => message.type === 'refresh').length
    )
  ).toBe(0);
  expect(errors).toEqual([]);
  const samples = await page.evaluate(async () =>
    (await import('/webview/src/snap.js')).getPerformanceSamples()
  );
  console.log(
    'cached copy samples',
    JSON.stringify(samples.filter((sample) => sample.stage === 'copy'))
  );
});

test('freezes the clicked snapshot while config changes and rejects duplicate copies', async ({
  page
}) => {
  await open(page);
  await page.evaluate(async (cfg) => {
    const { renderer } = await import('/webview/src/renderer.js');
    const render = renderer.toBlob;
    renderer.toBlob = async (...args) => {
      await new Promise((resolve) => {
        window.releaseRender = resolve;
      });
      return render(...args);
    };
    window.postMessage({ type: 'config', config: { ...cfg, backgroundColor: '#ff0000' } });
  }, config);
  await expect(page.locator('body')).toHaveCSS('--container-background-color', '#ff0000');
  await page.locator('#copy-image').click();
  await page.evaluate((cfg) => {
    document.dispatchEvent(new Event('copy', { cancelable: true }));
    window.postMessage({ type: 'config', config: { ...cfg, backgroundColor: '#0000ff' } });
  }, config);
  await page.waitForFunction(() => Boolean(window.releaseRender));
  await page.evaluate(() => window.releaseRender());
  await expect(page.locator('#status')).toHaveText('Copied image.');
  expect((await imageInfo(page)).corner).toEqual([255, 0, 0, 255]);
  const samples = await page.evaluate(async () =>
    (await import('/webview/src/snap.js')).getPerformanceSamples()
  );
  expect(samples.filter((sample) => sample.stage === 'copy')).toHaveLength(1);
});

test('reports denied writes without flashing and can retry', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.realWrite = navigator.clipboard.write.bind(navigator.clipboard);
    navigator.clipboard.write = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.locator('#copy-image').click();
  await expect(page.locator('#status')).toContainText('denied');
  expect(await page.locator('#flash-fx').evaluate((node) => node.getAnimations().length)).toBe(0);
  await expect(page.locator('#retry')).toBeVisible();
  await page.evaluate(() => {
    navigator.clipboard.write = window.realWrite;
  });
  await page.locator('#retry').click();
  await expect(page.locator('#status')).toHaveText('Copied image.');
});

test('preserves transparent PNG and escapes plaintext', async ({ page }) => {
  await open(page);
  await page.evaluate(
    (cfg) =>
      window.postMessage({ type: 'config', config: { ...cfg, transparentBackground: true } }),
    config
  );
  await expect(page.locator('#status')).toHaveText('Ready to copy.');
  await page.locator('#copy-image').click();
  await expect(page.locator('#status')).toHaveText('Copied image.');
  expect((await imageInfo(page)).corner[3]).toBe(0);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', '<script>alert(1)</script>\nconst x = a < b;');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
  });
  await expect(page.locator('#snippet .line-code').first()).toContainText(
    '<script>alert(1)</script>'
  );
});

test('cache coalesces work and never promotes stale results', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { createSnapshotCache } = await import('/webview/src/cache.js');
    let value = 'old';
    const releases = [];
    const cache = createSnapshotCache(
      () => value,
      (snapshot) => new Promise((resolve) => releases.push(() => resolve(snapshot)))
    );
    const old = cache.get();
    const same = cache.get();
    cache.invalidate();
    value = 'new';
    const latest = cache.get();
    await Promise.resolve();
    releases[1]();
    await latest;
    releases[0]();
    return { old: await old, latest: await cache.get(), coalesced: old === same };
  });
  expect(result).toEqual({ old: 'old', latest: 'new', coalesced: true });
});

test('measures cold render and actual clipboard completion at 200 lines within 4MP', async ({
  page
}) => {
  await open(page);
  await page.evaluate((cfg) => {
    window.codeHtml =
      '<div style="font-size:10px;line-height:12px">' +
      '<div><span style="color:#c586c0">const </span><span style="color:#dcdcaa">x</span><span> = 1;</span></div>'.repeat(
        200
      ) +
      '</div>';
    window.postMessage({ type: 'capture', config: cfg });
  }, config);
  await expect(page.locator('#snippet .line')).toHaveCount(200);
  await expect(page.locator('#status')).toHaveText('Ready to copy.');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(async () => {
      const snap = await import('/webview/src/snap.js');
      snap.invalidateSnap();
      document.dispatchEvent(new Event('copy', { cancelable: true }));
    });
    await expect(page.locator('#status')).toHaveText('Copied image.');
    await expect(page.locator('#copy-image')).toHaveAttribute('aria-disabled', 'false');
  }
  console.log(
    '200-line samples',
    JSON.stringify(
      await page.evaluate(async () =>
        (await import('/webview/src/snap.js')).getPerformanceSamples()
      )
    )
  );
});

test('PNG matches browser paint for wrapping, font features, colours and shadow at 2x', async ({
  browser
}, testInfo) => {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    permissions: ['clipboard-read', 'clipboard-write']
  });
  const page = await context.newPage();
  await open(page);
  await page.locator('#window').evaluate((node) => {
    node.style.width = '320px';
  });
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<div style="font-size:14px;line-height:22px"><div><span style="color:#c586c0;font-style:italic">const </span><span style="color:#dcdcaa;font-weight:bold">example</span><span> = &quot;long text =&gt; != &lt;= 中文 👋 long text that wraps onto another line&quot;;</span></div><div><span style="color:#4ec9b0;text-decoration:underline">\tsecond line</span></div></div>'
    );
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
  });
  await expect(page.locator('#status')).toHaveText('Ready to copy.');
  const screenshot = await page
    .locator('#snippet-container')
    .screenshot({ path: testInfo.outputPath('browser.png') });
  await page.locator('#copy-image').click();
  await expect(page.locator('#status')).toHaveText('Copied image.');
  const difference = await page.evaluate(async (base64) => {
    const expected = new Image();
    expected.src = 'data:image/png;base64,' + base64;
    await expected.decode();
    const items = await navigator.clipboard.read();
    const actual = await createImageBitmap(await items[0].getType('image/png'));
    const canvas = document.createElement('canvas');
    canvas.width = expected.width;
    canvas.height = expected.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(expected, 0, 0);
    const reference = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(actual, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let different = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (
        [0, 1, 2, 3].some((channel) => Math.abs(pixels[i + channel] - reference[i + channel]) > 32)
      )
        different++;
    }
    return {
      expected: [expected.width, expected.height],
      actual: [actual.width, actual.height],
      ratio: different / (canvas.width * canvas.height)
    };
  }, screenshot.toString('base64'));
  const pngBytes = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return Array.from(new Uint8Array(await (await items[0].getType('image/png')).arrayBuffer()));
  });
  await fs.writeFile(testInfo.outputPath('capture.png'), Buffer.from(pngBytes));
  console.log('browser/PNG pixel difference', difference);
  expect(difference.actual).toEqual(difference.expected);
  expect(difference.ratio).toBeLessThan(0.02);
  await context.close();
});

test('denied browser writes fall back to acknowledged native copy and remember the working backend', async ({
  page
}) => {
  await open(page);
  await page.evaluate(() => {
    window.nativeCopy = true;
    window.nativePause = true;
    window.browserAttempts = 0;
    window.realWrite = navigator.clipboard.write.bind(navigator.clipboard);
    navigator.clipboard.write = () => {
      window.browserAttempts++;
      return Promise.reject(new DOMException('Write permission denied', 'NotAllowedError'));
    };
  });
  await page.locator('#copy-image').click();
  await page.waitForFunction(() => Boolean(window.resumeNative));
  expect(await page.evaluate(() => document.activeElement.id)).toBe('copy-image');
  expect(await page.locator('#flash-fx').evaluate((node) => node.getAnimations().length)).toBe(0);
  await page.evaluate(() => {
    window.nativePause = false;
    window.resumeNative();
  });
  await expect(page.locator('#status')).toHaveText('Copied image.');
  expect((await imageInfo(page)).bytes).toBeGreaterThan(1000);
  await expect(page.locator('#copy-image')).toHaveAttribute('aria-disabled', 'false');
  await page.locator('#copy-image').click();
  await expect(page.locator('#copy-image')).toHaveAttribute('aria-disabled', 'false');
  expect(await page.evaluate(() => window.browserAttempts)).toBe(1);
  expect(
    await page.evaluate(
      () => window.messages.filter((message) => message.type === 'copy-native').length
    )
  ).toBe(2);
});

for (const lines of [240, 450]) {
  test(`${lines}-line selection exports at full 2x beyond the former size limits`, async ({
    page
  }) => {
    await open(page);
    await page.locator('#window').evaluate((node) => {
      node.style.width = '800px';
    });
    await page.evaluate(
      ({ cfg, html }) => {
        window.codeHtml = html;
        window.postMessage({ type: 'capture', config: cfg });
      },
      { cfg: config, html: codeHtml(lines) }
    );
    await expect(page.locator('#snippet .line')).toHaveCount(lines);
    const dimensions = await page
      .locator('#snippet-container')
      .evaluate((node) => ({ width: node.offsetWidth, height: node.offsetHeight }));
    await page.locator('#copy-image').click();
    await expect(page.locator('#status')).toHaveText('Copied image.');
    const fullImage = await imageInfo(page);
    expect(fullImage.width).toBe(dimensions.width * 2);
    expect(fullImage.height).toBe(dimensions.height * 2);
    await page.locator('#image-scale').selectOption('1');
    await expect(page.locator('#image-size')).toContainText(
      `${dimensions.width} × ${dimensions.height}px`
    );
    await page.locator('#copy-image').click();
    await expect(page.locator('#status')).toHaveText('Copied image.');
    const image = await imageInfo(page);
    expect(image.width).toBe(dimensions.width);
    expect(image.height).toBe(dimensions.height);
    await expect(page.locator('#snippet .line')).toHaveCount(lines);
    // Returning to 2x must not silently reuse the smaller cached PNG.
    await page.locator('#image-scale').selectOption('2');
    await page.locator('#copy-image').click();
    await expect(page.locator('#status')).toHaveText('Copied image.');
    expect((await imageInfo(page)).height).toBe(dimensions.height * 2);
  });
}

test('PNG export beyond the browser canvas side limit retains full dimensions', async ({
  page
}, testInfo) => {
  test.setTimeout(60000);
  await open(page);
  await page.locator('#window').evaluate((node) => {
    node.style.width = '200px';
  });
  await page.evaluate((cfg) => {
    window.codeHtml =
      '<div style="font-size:10px;line-height:20px">' +
      '<div><span>x</span></div>'.repeat(900) +
      '</div>';
    window.postMessage({ type: 'capture', config: cfg });
  }, config);
  await expect(page.locator('#snippet .line')).toHaveCount(900);
  const expected = await page
    .locator('#snippet-container')
    .evaluate((node) => [node.offsetWidth * 2, node.offsetHeight * 2]);
  expect(expected[1]).toBeGreaterThan(32767);
  await page.locator('#save-image').click();
  await page.waitForFunction(() => window.messages.some((message) => message.type === 'save'), {
    timeout: 45000
  });
  const actual = await page.evaluate(() => {
    const message = window.messages.find((item) => item.type === 'save');
    const header = atob(message.data.slice(0, 32));
    const bytes = Uint8Array.from(header, (character) => character.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    return [view.getUint32(16), view.getUint32(20)];
  });
  expect(actual).toEqual(expected);
  const png = await page.evaluate(
    () => window.messages.find((message) => message.type === 'save').data
  );
  await fs.writeFile(testInfo.outputPath('long-export.png'), Buffer.from(png, 'base64'));
  console.log('Windowed PNG output', actual);
});

test('browser PNG sanitizer failure can use the native clipboard backend', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.nativeCopy = true;
    window.realWrite = navigator.clipboard.write.bind(navigator.clipboard);
    navigator.clipboard.write = () =>
      Promise.reject(new DOMException('PNG sanitizer failed', 'DataError'));
  });
  await page.locator('#copy-image').click();
  await expect(page.locator('#status')).toHaveText('Copied image.');
  expect((await imageInfo(page)).bytes).toBeGreaterThan(1000);
});

test('Windows auto mode chooses native copy before the browser and shows phase/timing feedback', async ({
  page
}) => {
  await open(page);
  await page.evaluate((cfg) => {
    window.nativeCopy = true;
    window.nativePause = true;
    window.realWrite = navigator.clipboard.write.bind(navigator.clipboard);
    window.browserAttempts = 0;
    navigator.clipboard.write = () => {
      window.browserAttempts++;
      return new Promise(() => undefined);
    };
    window.postMessage({
      type: 'config',
      config: { ...cfg, nativeClipboard: true, clipboardMode: 'auto', showTiming: true }
    });
  }, config);
  await expect(page.locator('#status')).toHaveText('Ready to copy.');
  await page.locator('#copy-image').click();
  await page.waitForFunction(() => Boolean(window.resumeNative));
  await expect(page.locator('#status')).toHaveText('Writing to Windows clipboard…');
  expect(await page.evaluate(() => window.browserAttempts)).toBe(0);
  expect(await page.locator('#flash-fx').evaluate((node) => node.getAnimations().length)).toBe(0);
  await page.evaluate(() => window.resumeNative());
  await expect(page.locator('#status')).toContainText('Copied image. Prepare');
  await expect(page.locator('#status')).toContainText('clipboard');
  expect((await imageInfo(page)).bytes).toBeGreaterThan(1000);
});

test('browser-only mode never invokes native copy even on Windows or after a permission failure', async ({
  page
}) => {
  await open(page);
  await page.evaluate(
    (cfg) =>
      window.postMessage({
        type: 'config',
        config: { ...cfg, nativeClipboard: true, clipboardMode: 'browser' }
      }),
    config
  );
  await expect(page.locator('#status')).toHaveText('Ready to copy.');
  await page.locator('#copy-image').click();
  await expect(page.locator('#status')).toHaveText('Copied image.');
  await page.evaluate(() => {
    navigator.clipboard.write = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.locator('#copy-image').click();
  await expect(page.locator('#status')).toContainText('Clipboard access was denied');
  expect(
    await page.evaluate(
      () => window.messages.filter((message) => message.type === 'copy-native').length
    )
  ).toBe(0);
});
