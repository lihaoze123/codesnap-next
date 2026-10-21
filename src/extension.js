'use strict';

const vscode = require('vscode');
const path = require('path');
const { homedir } = require('os');
const { readHtml, writeFile, getSettings } = require('./util');
const { writeWaylandImage } = require('./clipboard');

const getConfig = (editor = vscode.window.activeTextEditor) => {
  const editorSettings = getSettings('editor', ['fontLigatures', 'tabSize'], editor);
  if (editor) editorSettings.tabSize = editor.options.tabSize;

  const extensionSettings = getSettings(
    'codesnapNext',
    [
      'backgroundColor',
      'boxShadow',
      'containerPadding',
      'roundedCorners',
      'showWindowControls',
      'showWindowTitle',
      'showLineNumbers',
      'realLineNumbers',
      'transparentBackground',
      'target',
      'shutterAction',
      'clipboardMode',
      'showTiming'
    ],
    editor
  );

  const selection = editor && editor.selection;
  const startLine = extensionSettings.realLineNumbers ? (selection ? selection.start.line : 0) : 0;

  let windowTitle = '';
  if (editor && extensionSettings.showWindowTitle) {
    const activeFileName = editor.document.uri.path.split('/').pop();
    windowTitle = `${vscode.workspace.name} - ${activeFileName}`;
  }

  return {
    ...editorSettings,
    ...extensionSettings,
    // Windows intentionally uses only the Webview clipboard. This avoids
    // depending on PowerShell script execution policy in the extension host.
    clipboardMode: process.platform === 'win32' ? 'browser' : extensionSettings.clipboardMode,
    startLine,
    windowTitle
  };
};

const createPanel = (context) => {
  const panel = vscode.window.createWebviewPanel(
    'codesnapNext',
    'CodeSnap Next 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );
  return panel;
};

let lastUsedImageUri = vscode.Uri.file(path.resolve(homedir(), 'Desktop/code.png'));
const saveImage = async (data) => {
  const uri = await vscode.window.showSaveDialog({
    filters: { Images: ['png'] },
    defaultUri: lastUsedImageUri
  });
  if (uri) {
    await writeFile(uri.fsPath, Buffer.from(data, 'base64'));
    lastUsedImageUri = uri;
  }
  return Boolean(uri);
};

const hasOneSelection = (selections) =>
  selections && selections.length === 1 && !selections[0].isEmpty;

let currentPanel;
const runCommand = async (context) => {
  if (currentPanel) {
    currentPanel.reveal(currentPanel.viewColumn, false);
    return;
  }
  let sourceEditor = vscode.window.activeTextEditor;
  const panel = createPanel(context);
  currentPanel = panel;
  let updating = false;
  let disposed = false;
  const update = async () => {
    if (updating || disposed) return;
    if (!sourceEditor || !hasOneSelection(sourceEditor.selections)) {
      panel.webview.postMessage({
        type: 'error',
        message: 'Select code in an editor, then click Update selection.'
      });
      return;
    }
    updating = true;
    try {
      const editor = sourceEditor;
      const config = getConfig(editor);
      await vscode.window.showTextDocument(editor.document, editor.viewColumn);
      await vscode.commands.executeCommand(
        'editor.action.clipboardCopyWithSyntaxHighlightingAction'
      );
      if (!disposed) {
        panel.reveal(panel.viewColumn, false);
        await panel.webview.postMessage({ type: 'capture', config });
      }
    } catch (error) {
      panel.webview.postMessage({ type: 'error', message: error.message });
    } finally {
      updating = false;
    }
  };

  panel.webview.onDidReceiveMessage(async ({ type, data, id }) => {
    if (type === 'ready') {
      if (sourceEditor && hasOneSelection(sourceEditor.selections)) await update();
      else panel.webview.postMessage({ type: 'config', config: getConfig(sourceEditor) });
    } else if (type === 'refresh') {
      await update();
    } else if (type === 'copy-native') {
      try {
        // A UI extension runs locally even when the workspace is remote. Refuse
        // native access if a user override placed this extension on a remote host.
        if (
          vscode.env.remoteName &&
          (!context.extension || context.extension.extensionKind !== vscode.ExtensionKind.UI)
        ) {
          throw new Error(
            'Native clipboard copy requires CodeSnap to run locally. Use Save image.'
          );
        }
        if (process.platform === 'win32') {
          throw new Error('Windows uses the browser clipboard. Focus the preview and retry.');
        }
        const result = { backend: await writeWaylandImage(data) };
        if (!disposed) panel.webview.postMessage({ type: 'native-copy-result', id, ...result });
      } catch (error) {
        if (!disposed)
          panel.webview.postMessage({ type: 'native-copy-result', id, error: error.message });
      }
    } else if (type === 'save') {
      try {
        const saved = await saveImage(data);
        panel.webview.postMessage({ type: 'saved', saved });
      } catch (error) {
        panel.webview.postMessage({ type: 'error', message: error.message });
      }
    } else if (type !== 'capture-complete') {
      vscode.window.showErrorMessage(`CodeSnap Next 📸: Unknown shutterAction "${type}"`);
    }
  });

  const selectionHandler = vscode.window.onDidChangeTextEditorSelection((e) => {
    sourceEditor = e.textEditor;
    panel.webview.postMessage({ type: 'selection-changed' });
  });
  const editorHandler = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      sourceEditor = editor;
      panel.webview.postMessage({ type: 'selection-changed' });
    }
  });
  const configHandler = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('codesnapNext') || event.affectsConfiguration('editor')) {
      panel.webview.postMessage({ type: 'config', config: getConfig(sourceEditor) });
    }
  });
  const themeHandler = vscode.window.onDidChangeActiveColorTheme(() => {
    panel.webview.postMessage({ type: 'theme-changed' });
  });
  panel.onDidDispose(() => {
    disposed = true;
    currentPanel = undefined;
    selectionHandler.dispose();
    editorHandler.dispose();
    configHandler.dispose();
    themeHandler.dispose();
  });
  panel.webview.html = await readHtml(
    path.resolve(context.extensionPath, 'webview/index.html'),
    panel
  );
};

module.exports.activate = (context) =>
  context.subscriptions.push(
    vscode.commands.registerCommand('codesnapNext.start', () => runCommand(context))
  );
