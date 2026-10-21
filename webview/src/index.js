import { $, setVar } from './util.js';
import { readClipboardHtml, renderCode } from './code.js';
import { takeSnap, configureSnap, cameraFlashAnimation, getPerformanceSamples } from './snap.js';

const vscode = acquireVsCodeApi();
const btnSave = $('#save');
const btnCopy = $('#copy-image');
const btnRefresh = $('#refresh');
const btnRetry = $('#retry');
const statusNode = $('#status');
const selectionNode = $('#selection-status');
const scaleNode = $('#image-scale');
const imageSize = (message) => {
  $('#image-size').textContent = message;
};
let config;
let html;
let capturing = false;
let exporting = false;
let captureTimer;
let lastAction = 'copy';
let nextRequest = 0;
const nativeRequests = new Map();
const copyNative = (data) =>
  new Promise((resolve, reject) => {
    const id = ++nextRequest;
    const timer = setTimeout(
      () => {
        nativeRequests.delete(id);
        reject(new Error('Native clipboard request timed out. Retry or use Save image.'));
      },
      config.nativeClipboard ? 20000 : 5000
    );
    nativeRequests.set(id, { resolve, reject, timer });
    vscode.postMessage({ type: 'copy-native', id, data });
  });

const buttons = () => {
  btnRefresh.disabled = capturing;
  btnSave.disabled = capturing || !html;
  btnCopy.disabled = capturing || !html;
  $('#save-image').disabled = capturing || !html;
  btnRetry.disabled = capturing;
  scaleNode.disabled = capturing || exporting;
  [btnRefresh, btnSave, btnCopy, $('#save-image'), btnRetry].forEach((button) => {
    button.setAttribute('aria-disabled', String(exporting));
  });
};
const status = (message, error = false) => {
  // Background preparation must not hide an actionable error.
  if (
    !error &&
    !btnRetry.hidden &&
    (message === 'Ready to copy.' || message.startsWith('Large image:'))
  )
    return;
  statusNode.textContent = message;
  statusNode.classList.toggle('error', error);
  if (error || !exporting || document.activeElement !== btnRetry) btnRetry.hidden = !error;
};
const finishCapture = () => {
  clearTimeout(captureTimer);
  capturing = false;
  buttons();
};
const applyConfig = (value) => {
  config = { ...value, imageScale: Number(scaleNode.value) };
  const {
    fontLigatures,
    tabSize,
    backgroundColor,
    boxShadow,
    containerPadding,
    roundedCorners,
    showWindowControls,
    showWindowTitle,
    windowTitle
  } = config;
  setVar('ligatures', fontLigatures ? 'normal' : 'none');
  setVar('font-features', typeof fontLigatures === 'string' ? fontLigatures : 'normal');
  setVar('tab-size', tabSize);
  setVar('container-background-color', backgroundColor);
  setVar('box-shadow', boxShadow);
  setVar('container-padding', containerPadding);
  setVar('window-border-radius', roundedCorners ? '4px' : 0);
  $('#navbar').hidden = !showWindowControls && !showWindowTitle;
  $('#window-controls').hidden = !showWindowControls;
  $('#window-title').hidden = !showWindowTitle;
  $('#window-title').textContent = windowTitle;
  if (html) {
    renderCode(config, html);
    status('Preparing image…');
  }
  configureSnap(config, Boolean(html), status, imageSize);
  buttons();
};

const exportImage = (action) => {
  if (capturing || exporting) return;
  lastAction = action;
  if (document.activeElement !== btnRetry) btnRetry.hidden = true;
  return takeSnap(
    action,
    (message) => vscode.postMessage(message),
    (value) => {
      exporting = value;
      buttons();
      if (!value && !statusNode.classList.contains('error')) btnRetry.hidden = true;
    },
    copyNative
  );
};
const refresh = () => {
  if (capturing || exporting) return;
  capturing = true;
  lastAction = 'refresh';
  buttons();
  status('Updating selection…');
  vscode.postMessage({ type: 'refresh' });
  captureTimer = setTimeout(() => {
    finishCapture();
    status('Could not update the selection. Select code in the editor and retry.', true);
  }, 5000);
};
btnSave.addEventListener('click', () => exportImage(config.shutterAction));
btnCopy.addEventListener('click', () => exportImage('copy'));
btnRetry.addEventListener('click', () =>
  html && lastAction !== 'refresh' ? exportImage(lastAction) : refresh()
);
btnRefresh.addEventListener('click', refresh);
$('#save-image').addEventListener('click', () => exportImage('save'));
scaleNode.addEventListener('change', () => {
  if (!config || capturing || exporting) return;
  config = { ...config, imageScale: Number(scaleNode.value) };
  status('Preparing image…');
  configureSnap(config, Boolean(html), status, imageSize);
});

document.addEventListener('copy', (event) => {
  event.preventDefault();
  exportImage('copy');
});
document.addEventListener('paste', (event) => {
  event.preventDefault();
  if (exporting || !config) return;
  try {
    html = readClipboardHtml(event.clipboardData);
    if (!html) throw new Error('No code was found on the clipboard. Update the selection.');
    finishCapture();
    applyConfig(config);
    selectionNode.textContent = 'Selection captured.';
    status('Preparing image…');
    vscode.postMessage({ type: 'capture-complete' });
  } catch (error) {
    finishCapture();
    status(error.message, true);
  }
});
window.addEventListener('message', ({ data }) => {
  if (data.type === 'native-copy-result') {
    const request = nativeRequests.get(data.id);
    if (!request) return;
    nativeRequests.delete(data.id);
    clearTimeout(request.timer);
    if (data.error) request.reject(new Error(data.error));
    else
      request.resolve(
        data.metrics ? { backend: data.backend, metrics: data.metrics } : data.backend
      );
  } else if (data.type === 'capture') {
    lastAction = 'refresh';
    capturing = true;
    applyConfig(data.config);
    window.focus();
    // VS Code supplies rich HTML through its native paste integration.
    document.execCommand('paste');
    if (capturing) {
      clearTimeout(captureTimer);
      captureTimer = setTimeout(() => {
        finishCapture();
        status(
          'Could not paste highlighted code. Focus the preview and use Ctrl+V, or update the selection again.',
          true
        );
      }, 1500);
    }
  } else if (data.type === 'config') {
    applyConfig(
      html
        ? { ...data.config, startLine: config.startLine, windowTitle: config.windowTitle }
        : data.config
    );
  } else if (data.type === 'selection-changed') {
    selectionNode.textContent = 'Editor selection changed. Click Update selection to capture it.';
  } else if (data.type === 'theme-changed') {
    selectionNode.textContent =
      'Editor theme changed. Click Update selection to refresh syntax colours.';
    if (config) configureSnap(config, Boolean(html), status, imageSize);
  } else if (data.type === 'saved') {
    status(data.saved ? 'Image saved.' : 'Save cancelled.');
    if (data.saved) cameraFlashAnimation();
  } else if (data.type === 'error') {
    finishCapture();
    status(data.message, true);
  }
});
$('#performance').addEventListener('click', () => {
  const samples = getPerformanceSamples();
  const copies = samples.filter((sample) => sample.stage === 'copy');
  const failures = samples.filter((sample) => sample.stage === 'error').length;
  const hitRate = copies.length
    ? Math.round((100 * copies.filter((sample) => sample.hit).length) / copies.length)
    : 0;
  const p95 = (values) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1) + 'ms' : 'n/a';
  };
  status(
    `Last ${
      copies.length
    } successful copies (${hitRate}% cached, ${failures} export failures): cached P95 ${p95(
      copies.filter((s) => s.hit).map((s) => s.ms)
    )}; uncached P95 ${p95(
      copies.filter((s) => !s.hit).map((s) => s.ms)
    )}. Details in Developer Tools.`
  );
  console.table(samples);
});
buttons();
vscode.postMessage({ type: 'ready' });
