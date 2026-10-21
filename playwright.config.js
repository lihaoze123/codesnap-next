'use strict';

const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.js',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    permissions: ['clipboard-read', 'clipboard-write'],
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }
  },
  webServer: { command: 'node test/server.js', url: 'http://127.0.0.1:4173/webview/index.html' }
});
