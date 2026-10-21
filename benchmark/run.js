'use strict';

// Load the original source verbatim from preserved Git history. Only its HTML
// dependency URL and CSP placeholder are changed by the HTTP fixture server.
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const baseline = '6de4a985';
const count = Number(process.env.BENCHMARK_SAMPLES || 20);
if (!Number.isInteger(count) || count < 2) throw new Error('BENCHMARK_SAMPLES must be >= 2');
const config = {
  fontLigatures: true,
  tabSize: 2,
  backgroundColor: '#abb8c3',
  boxShadow: 'rgba(0, 0, 0, 0.55) 0px 20px 68px',
  containerPadding: '3em',
  roundedCorners: true,
  showWindowControls: true,
  showWindowTitle: false,
  showLineNumbers: true,
  realLineNumbers: false,
  startLine: 0,
  transparentBackground: false,
  target: 'container',
  shutterAction: 'copy',
  clipboardMode: 'browser'
};
const originalFiles = new Map(
  [
    'index.html',
    'style.css',
    'src/index.js',
    'src/code.js',
    'src/snap.js',
    'src/util.js'
  ].map((file) => [
    '/baseline/' + file,
    execFileSync('git', ['show', `${baseline}:webview/${file}`], { cwd: root })
  ])
);
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + url);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    let content = originalFiles.get(url) || fs.readFileSync(file);
    const extension = path.extname(url);
    res.setHeader(
      'Content-Type',
      { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extension] ||
        'application/octet-stream'
    );
    if (extension === '.html')
      content = content
        .toString()
        .replace(/%CSP_SOURCE%/gu, "'self'")
        .replace('../node_modules/dom-to-image-even-more', '/node_modules/dom-to-image-even-more');
    res.end(content);
  } catch (error) {
    res.writeHead(404);
    res.end(error.message);
  }
});

const open = async (context, origin, variant, lines) => {
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.acquireVsCodeApi = () => ({ postMessage: () => undefined });
    document.execCommand = (command) => {
      if (command !== 'paste') return false;
      const data = new DataTransfer();
      data.setData('text/html', window.fixture);
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
      return true;
    };
  });
  await page.goto(
    origin + (variant === 'original' ? '/baseline/index.html' : '/webview/index.html')
  );
  await page.waitForFunction(
    (original) => !original || Boolean(window.domtoimage),
    variant === 'original'
  );
  await page.evaluate(
    ({ cfg, n, original }) => {
      document.documentElement.style.cssText =
        '--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#d4d4d4;--vscode-editor-font-family:monospace;--vscode-editor-font-size:14;--vscode-editor-font-weight:400;--vscode-editorLineNumber-foreground:#858585';
      document.body.style.fontSize = '14px';
      window.fixture =
        '<div style="font-family:monospace;font-size:10px;line-height:12px">' +
        Array.from(
          { length: n },
          (_, i) =>
            `<div><span style="color:#c586c0">const </span><span style="color:#dcdcaa">x${i}</span><span> = ${i};</span></div>`
        ).join('') +
        '</div>';
      const write = navigator.clipboard.write.bind(navigator.clipboard);
      navigator.clipboard.write = (items) => {
        window.writePromise = write(items);
        return window.writePromise;
      };
      if (original) {
        const render = domtoimage.toPng.bind(domtoimage);
        domtoimage.toPng = async (...args) => {
          const start = performance.now();
          const result = await render(...args);
          window.renderMs = performance.now() - start;
          return result;
        };
      }
      window.benchmarkConfig = cfg;
      window.postMessage(original ? { type: 'update', ...cfg } : { type: 'capture', config: cfg });
    },
    { cfg: config, n: lines, original: variant === 'original' }
  );
  await page.waitForFunction(
    (n) => document.querySelectorAll('#snippet .line').length === n,
    lines
  );
  await page.evaluate(() => document.fonts.ready);
  if (variant !== 'original')
    await page.waitForFunction(() =>
      /Ready to copy|Large image/u.test(document.querySelector('#status').textContent)
    );
  return page;
};

const measure = async (page, variant) => {
  await page.bringToFront();
  return page.evaluate(async (mode) => {
    const original = mode === 'original';
    const snap = await import(original ? '/baseline/src/snap.js' : '/webview/src/snap.js');
    if (mode === 'uncached') snap.invalidateSnap();
    window.writePromise = undefined;
    const start = performance.now();
    if (original) await snap.takeSnap(window.benchmarkConfig);
    else
      await snap.takeSnap(
        'copy',
        () => undefined,
        () => undefined,
        () => {
          throw new Error('Unexpected native backend');
        }
      );
    if (!window.writePromise) throw new Error('No browser clipboard write');
    // Original takeSnap does not await write(). Observe its real completion here.
    await window.writePromise;
    const totalMs = performance.now() - start;
    const sample = original
      ? undefined
      : snap
          .getPerformanceSamples()
          .filter((s) => s.stage === 'copy')
          .slice(-1)[0];
    if (!original && (!sample || sample.hit !== (mode === 'cached')))
      throw new Error('Unexpected cache state');
    if (!original && !document.querySelector('#status').textContent.startsWith('Copied image.'))
      throw new Error('Copy failed');
    // Readback and decoding validate the result but are outside totalMs.
    const items = await navigator.clipboard.read();
    const blob = await items[0].getType('image/png');
    const image = await createImageBitmap(blob);
    const dimensions = [image.width, image.height];
    image.close();
    const render = original
      ? undefined
      : snap
          .getPerformanceSamples()
          .filter((s) => s.stage === 'render')
          .slice(-1)[0];
    return {
      totalMs,
      renderMs: original ? window.renderMs : mode === 'cached' ? 0 : render.ms,
      prepareMs: sample && sample.prepareMs,
      clipboardMs: sample && sample.clipboardMs,
      dimensions,
      bytes: blob.size
    };
  }, variant);
};

const summary = (samples, key) => {
  const sorted = samples.map((sample) => sample[key]).sort((a, b) => a - b);
  return {
    median: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]
  };
};

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
    });
    const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1
    });
    const results = {
      generatedAt: new Date().toISOString(),
      baselineCommit: execFileSync('git', ['rev-parse', baseline], { cwd: root }).toString().trim(),
      nextSourceSha256: Object.fromEntries(
        ['webview/src/snap.js', 'webview/src/renderer.js', 'webview/src/code.js'].map((file) => [
          file,
          createHash('sha256')
            .update(fs.readFileSync(path.join(root, file)))
            .digest('hex')
        ])
      ),
      environment: {
        os: os.type(),
        release: os.release(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        logicalCpus: os.cpus().length,
        ramGiB: os.totalmem() / 2 ** 30,
        node: process.version,
        browser: browser.version(),
        headless: true,
        deviceScaleFactor: 1,
        scale: 2
      },
      methodology: {
        samples: count,
        warmupsPerMode: 2,
        order:
          'Interleaved original, Next uncached, Next cached; one browser context, two pages per fixture.',
        measured:
          'In-page invocation until real browser clipboard write resolves; readback/decode excluded. Uncached means PNG cache invalidated, not a fresh browser or process. Rich-text acquisition and native clipboard backends excluded.'
      },
      fixtures: []
    };
    for (const lines of [12, 200, 450]) {
      const original = await open(context, origin, 'original', lines);
      const next = await open(context, origin, 'next', lines);
      const samples = { original: [], uncached: [], cached: [] };
      for (let i = -2; i < count; i++) {
        for (const mode of ['original', 'uncached', 'cached']) {
          const result = await measure(mode === 'original' ? original : next, mode);
          if (i >= 0) samples[mode].push(result);
        }
      }
      const dimensions = Object.values(samples)
        .flat()
        .map((sample) => sample.dimensions.join('x'));
      if (new Set(dimensions).size !== 1)
        throw new Error(`Output dimensions differ: ${[...new Set(dimensions)]}`);
      const stats = Object.fromEntries(
        Object.entries(samples).map(([mode, values]) => [
          mode,
          { totalMs: summary(values, 'totalMs'), renderMs: summary(values, 'renderMs') }
        ])
      );
      results.fixtures.push({ lines, dimensions: samples.original[0].dimensions, stats, samples });
      console.log(JSON.stringify({ lines, dimensions: samples.original[0].dimensions, stats }));
      await original.close();
      await next.close();
    }
    const destination = path.resolve(
      root,
      process.env.BENCHMARK_OUTPUT || 'docs/benchmarks/latest.json'
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(results, null, 2) + '\n');
    console.log(`Raw benchmark results: ${destination}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
