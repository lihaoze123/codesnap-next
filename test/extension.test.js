'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

test('native host copies only on ready/refresh, reads settings from source, and keeps save default on cancel', async () => {
  const events = {};
  const messages = [];
  const commands = {};
  const disposed = [];
  const saveDefaults = [];
  let copies = 0;
  const event = (name) => (callback) => {
    events[name] = callback;
    return { dispose: () => disposed.push(name) };
  };
  const editor = {
    document: { uri: { path: '/project/source.js' }, languageId: 'javascript' },
    options: { tabSize: 4 },
    selection: { isEmpty: false, start: { line: 8 } },
    viewColumn: 1
  };
  editor.selections = [editor.selection];
  const panel = {
    viewColumn: 2,
    reveal: () => undefined,
    onDidDispose: event('dispose'),
    webview: {
      cspSource: 'test-source',
      asWebviewUri: (uri) => uri.fsPath,
      postMessage: (message) => {
        messages.push(message);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: event('message')
    }
  };
  const vscode = {
    env: {},
    ExtensionKind: { UI: 1 },
    Uri: { file: (fsPath) => ({ fsPath }) },
    ViewColumn: { Beside: 2 },
    commands: {
      registerCommand: (name, callback) => {
        commands[name] = callback;
        return { dispose: () => undefined };
      },
      executeCommand: (name) => {
        assert.equal(name, 'editor.action.clipboardCopyWithSyntaxHighlightingAction');
        copies++;
        return Promise.resolve();
      }
    },
    window: {
      activeTextEditor: editor,
      createWebviewPanel: () => panel,
      showTextDocument: () => Promise.resolve(editor),
      showErrorMessage: (message) => {
        throw new Error(message);
      },
      showSaveDialog: ({ defaultUri }) => {
        saveDefaults.push(defaultUri);
        return Promise.resolve(undefined);
      },
      onDidChangeTextEditorSelection: event('selection'),
      onDidChangeActiveTextEditor: event('editor'),
      onDidChangeActiveColorTheme: event('theme')
    },
    workspace: {
      name: 'Project',
      onDidChangeConfiguration: event('config'),
      getConfiguration: () => ({
        get: (key) =>
          ({ realLineNumbers: true, showWindowTitle: true, fontLigatures: true, tabSize: 2 }[key])
      })
    }
  };
  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args);
  };
  let extension;
  try {
    // eslint-disable-next-line global-require
    extension = require('../src/extension');
  } finally {
    Module._load = originalLoad;
  }
  extension.activate({ subscriptions: [], extensionPath: path.resolve(__dirname, '..') });
  await commands['codesnapNext.start']();
  assert.equal(copies, 0, 'waits for webview ready handshake');
  await events.message({ type: 'ready' });
  assert.equal(copies, 1);
  assert.equal(messages.find((message) => message.type === 'capture').config.startLine, 8);
  for (let i = 0; i < 100; i++)
    events.selection({ textEditor: editor, selections: editor.selections });
  events.theme();
  events.config({ affectsConfiguration: () => true });
  assert.equal(copies, 1, 'selection, theme and settings changes never touch clipboard');
  await events.message({ type: 'refresh' });
  assert.equal(copies, 2);
  vscode.env.remoteName = 'ssh-remote';
  await events.message({ type: 'copy-native', id: 42, data: '' });
  assert.match(
    messages.find((message) => message.type === 'native-copy-result' && message.id === 42).error,
    /run locally/u
  );
  vscode.env.remoteName = undefined;
  await events.message({ type: 'save', data: 'aGVsbG8=' });
  await events.message({ type: 'save', data: 'aGVsbG8=' });
  assert.equal(saveDefaults.length, 2);
  assert.equal(saveDefaults[0], saveDefaults[1]);
  assert.equal(messages.filter((message) => message.type === 'saved' && !message.saved).length, 2);
  events.dispose();
  assert.deepEqual(disposed.sort(), ['config', 'editor', 'selection', 'theme']);
});
