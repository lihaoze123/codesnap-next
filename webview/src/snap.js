import { $, $$ } from './util.js';
import { createSnapshotCache } from './cache.js';
import { renderer } from './renderer.js';

const windowNode = $('#window');
const containerNode = $('#snippet-container');
const flashFx = $('#flash-fx');
let config;
let hasCode = false;
let timer;
let backgroundBusy = false;
let busy = false;
let layoutKey;
let notify = () => undefined;
let notifySize = () => undefined;
let generation = 0;
let preferNative = false;
const nativeData = new WeakMap();

// Bounded in-memory diagnostics, containing no source code, paths or images.
const samples = [];
const record = (sample) => {
  samples.push(sample);
  if (samples.length > 200) samples.shift();
  console.debug('CodeSnap performance', sample);
};

const size = () => {
  const target = config.target === 'window' ? windowNode : containerNode;
  return {
    target,
    width: target.offsetWidth,
    height: target.offsetHeight,
    scale: config.imageScale === 1 ? 1 : 2
  };
};

const capture = () => {
  const { target, width, height, scale } = size();
  if (!width || !height) throw new Error('The preview is empty. Update the selection first.');
  const node = target.cloneNode(true);
  // Freeze inherited theme variables before asynchronous rendering. Shared
  // CodeSnap CSS is static; all VS Code theme variables are captured here.
  const bodyStyle = getComputedStyle(document.body);
  Array.from(bodyStyle)
    .filter((key) => key.startsWith('--'))
    .forEach((key) => {
      node.style.setProperty(key, bodyStyle.getPropertyValue(key));
    });
  const targetStyle = getComputedStyle(target);
  [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-feature-settings',
    'font-variant-ligatures',
    'color',
    'tab-size'
  ].forEach((key) => {
    node.style.setProperty(key, targetStyle.getPropertyValue(key));
  });
  node.style.width = targetStyle.width;
  node.style.height = targetStyle.height;
  node.style.resize = 'none';
  const windowClone = target === windowNode ? node : $('#window', node);
  windowClone.style.width = getComputedStyle(windowNode).width;
  windowClone.style.resize = 'none';
  if (config.transparentBackground && target === containerNode)
    node.style.backgroundColor = 'transparent';
  const holder = document.createElement('div');
  holder.className = 'render-snapshot';
  holder.setAttribute('aria-hidden', 'true');
  holder.inert = true;
  holder.appendChild(node);
  document.body.appendChild(holder);
  return { node, holder, width, height, scale, lines: $$('.line', node).length };
};

const cache = createSnapshotCache(
  capture,
  async ({ node, holder, width, height, scale, lines }) => {
    const start = performance.now();
    try {
      await document.fonts.ready;
      const { blob, captureMs, encodeMs } = await renderer.toBlob(node, scale);
      if (!blob) throw new Error('PNG encoding failed. Try a smaller selection.');
      record({
        stage: 'render',
        captureMs,
        encodeMs,
        ms: performance.now() - start,
        pixels: width * height * scale ** 2,
        scale,
        lines,
        bytes: blob.size
      });
      return blob;
    } finally {
      holder.remove();
    }
  }
);

const key = () =>
  [
    windowNode.offsetWidth,
    windowNode.offsetHeight,
    document.body.className,
    document.body.getAttribute('style'),
    document.documentElement.className,
    document.documentElement.getAttribute('style')
  ].join('|');

const schedule = () => {
  clearTimeout(timer);
  if (!hasCode || backgroundBusy || busy || cache.ready) return;
  timer = setTimeout(async () => {
    const { width, height, scale } = size();
    // Large exports remain available on demand without repeated large canvases.
    if (width * height * scale ** 2 > 4000000 || $$('.line', windowNode).length > 200) {
      notify('Large image: generated when you copy or save.');
      return;
    }
    backgroundBusy = true;
    const startedGeneration = generation;
    try {
      await cache.get();
      if (cache.ready) notify('Ready to copy.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      backgroundBusy = false;
      if (generation !== startedGeneration && !cache.ready) schedule();
    }
  }, 100);
};

export const invalidateSnap = () => {
  generation++;
  cache.invalidate();
  layoutKey = key();
  if (hasCode) {
    const { width, height, scale } = size();
    notifySize(
      `${width * scale} × ${height * scale}px · ${((width * height * scale ** 2) / 1000000).toFixed(
        1
      )} MP · ${scale}×`
    );
  }
  schedule();
};

export const configureSnap = (value, ready, onStatus, onSize = () => undefined) => {
  config = { ...value };
  hasCode = ready;
  notify = onStatus;
  notifySize = onSize;
  invalidateSnap();
};

new ResizeObserver(() => {
  if (hasCode && key() !== layoutKey) invalidateSnap();
}).observe(windowNode);
new MutationObserver(() => {
  if (hasCode && key() !== layoutKey) invalidateSnap();
}).observe(document.documentElement, { attributes: true });
new MutationObserver(() => {
  if (hasCode && key() !== layoutKey) invalidateSnap();
}).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
document.fonts.addEventListener('loadingdone', () => hasCode && invalidateSnap());

export const cameraFlashAnimation = () => {
  flashFx.getAnimations().forEach((animation) => animation.cancel());
  flashFx.animate([{ opacity: 0.65 }, { opacity: 0 }], { duration: 150 });
};

const blobData = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the PNG for saving.'));
    reader.readAsDataURL(blob);
  });

export const takeSnap = async (action, postMessage, onBusy, copyNative) => {
  if (busy) return;
  const start = performance.now();
  if (!hasCode) {
    notify('Select code in an editor, then click Update selection.', true);
    return;
  }
  if (key() !== layoutKey) invalidateSnap();
  clearTimeout(timer);
  busy = true;
  onBusy(true);
  const hit = cache.ready;
  const browserOnly = config.clipboardMode === 'browser';
  let pendingBlob;
  let imageReadyAt;
  let failed = false;
  notify(hit && action === 'copy' ? 'Writing image to clipboard…' : 'Preparing image…');
  try {
    const blob = cache.get().then((png) => {
      imageReadyAt = performance.now();
      if (!failed && action === 'copy') {
        notify(
          config.nativeClipboard && !browserOnly
            ? 'Writing to Windows clipboard…'
            : 'Writing image to clipboard…'
        );
      }
      return png;
    });
    pendingBlob = blob;
    // A denied write can reject before the browser consumes the promised Blob.
    blob.catch(() => undefined);
    if (action === 'copy') {
      const writeStart = performance.now();
      let backend = 'browser';
      let nativeMetrics;
      const native = async () => {
        const png = await blob;
        if (!nativeData.has(png)) nativeData.set(png, blobData(png));
        const result = await copyNative(await nativeData.get(png));
        preferNative = true;
        nativeMetrics = result && result.metrics;
        return typeof result === 'string' ? result : result.backend;
      };
      if (
        !browserOnly &&
        (config.nativeClipboard ||
          preferNative ||
          !navigator.clipboard ||
          typeof ClipboardItem === 'undefined')
      ) {
        backend = await native();
      } else {
        if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
          throw new Error('Browser image clipboard is unavailable. Use Save image.');
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } catch (error) {
          if (
            browserOnly ||
            !['NotAllowedError', 'DataError', 'NotSupportedError'].includes(error.name)
          )
            throw error;
          console.debug('CodeSnap browser clipboard unavailable', {
            message: error.message,
            focused: document.hasFocus(),
            active: navigator.userActivation && navigator.userActivation.isActive
          });
          backend = await native();
        }
      }
      const finished = performance.now();
      const prepareMs = imageReadyAt - start;
      const clipboardMs = finished - imageReadyAt;
      record({
        stage: 'copy',
        ms: performance.now() - start,
        writeMs: performance.now() - writeStart,
        hit,
        backend,
        prepareMs,
        clipboardMs,
        nativeHelperMs: nativeMetrics && nativeMetrics.HelperMilliseconds,
        nativeClipboardMs: nativeMetrics && nativeMetrics.ClipboardMilliseconds
      });
      cameraFlashAnimation();
      notify(
        config.showTiming
          ? `Copied image. Prepare ${prepareMs.toFixed(0)} ms · clipboard ${clipboardMs.toFixed(
              0
            )} ms${hit ? ' (cached PNG)' : ''}.`
          : 'Copied image.'
      );
    } else {
      postMessage({ type: 'save', data: await blobData(await blob) });
      notify('Choose where to save the image.');
    }
  } catch (error) {
    failed = true;
    const message =
      error.name === 'NotAllowedError'
        ? 'Clipboard access was denied. Focus the preview and retry, or use Save image.'
        : error.message || 'Image export failed. Retry or use Save image.';
    notify(message, true);
    record({ stage: 'error', action, name: error.name, ms: performance.now() - start });
    console.error('CodeSnap export failed', error);
    // Do not let repeated denied writes accumulate abandoned renders.
    if (pendingBlob) await pendingBlob.catch(() => undefined);
  } finally {
    busy = false;
    onBusy(false);
    schedule();
  }
};

export const getPerformanceSamples = () => samples.slice();
