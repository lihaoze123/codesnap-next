'use strict';

const vscode = require('vscode');
const path = require('path');
const { readFile, writeFile } = require('fs').promises;

const readHtml = async (htmlPath, panel) =>
  (await readFile(htmlPath, 'utf-8'))
    .replace(/%CSP_SOURCE%/gu, panel.webview.cspSource)
    .replace(
      /(src|href)="([^"]*)"/gu,
      (_, type, src) =>
        `${type}="${panel.webview.asWebviewUri(
          vscode.Uri.file(path.resolve(htmlPath, '..', src))
        )}"`
    );

const getSettings = (group, keys, editor = vscode.window.activeTextEditor) => {
  const scope =
    editor && editor.document
      ? { uri: editor.document.uri, languageId: editor.document.languageId }
      : null;
  const settings = vscode.workspace.getConfiguration(group, scope);
  return keys.reduce((acc, k) => {
    acc[k] = settings.get(k);
    return acc;
  }, {});
};

module.exports = { readHtml, writeFile, getSettings };
