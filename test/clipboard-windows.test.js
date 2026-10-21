'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const path = require('path');
const { tmpdir } = require('os');
const { writeWindowsImage } = require('../src/clipboard-windows');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DQAAAEgQGALFXOsAAAAABJRU5ErkJggg==',
  'base64'
);
const ack = {
  Width: 1,
  Height: 1,
  PngBytes: png.length,
  HasPng: true,
  HasBitmap: true,
  CheckOnly: false,
  Copied: true,
  HelperMilliseconds: 100,
  ClipboardMilliseconds: 5
};
const options = { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } };

test('Windows copy uses STA, original PNG temp file, explicit acknowledgement, and cleans up', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'codesnap-windows-test-'));
  t.after(() => fs.rmdir(root));
  const result = await writeWindowsImage(png.toString('base64'), {
    ...options,
    tmpdir: root,
    execFile: async (executable, args, settings) => {
      assert.equal(executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
      assert.ok(args.includes('-STA'));
      assert.ok(!args.includes('-ExecutionPolicy'));
      assert.ok(args.includes('-NoProfile'));
      assert.equal(settings.windowsHide, true);
      assert.equal(settings.timeout, 15000);
      assert.equal(settings.shell, undefined);
      const script = args[args.indexOf('-File') + 1];
      assert.ok(script.endsWith('copy-image-windows.ps1'));
      assert.deepEqual(await fs.readFile(args[args.indexOf('-File') + 2]), png);
      return { stdout: JSON.stringify(ack) };
    }
  });
  assert.equal(result.backend, 'windows-powershell');
  assert.equal(result.metrics.ClipboardMilliseconds, 5);
  assert.deepEqual(await fs.readdir(root), []);
});

test('Windows helper failure, invalid acknowledgement, and check-only cannot report copy success', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'codesnap-windows-test-'));
  t.after(() => fs.rmdir(root));
  for (const stdout of [
    'not json',
    '{}',
    JSON.stringify({ ...ack, Copied: false }),
    JSON.stringify({ ...ack, CheckOnly: true })
  ]) {
    await assert.rejects(
      writeWindowsImage(png.toString('base64'), {
        ...options,
        tmpdir: root,
        execFile: () => Promise.resolve({ stdout })
      }),
      /acknowledgement|did not confirm/u
    );
    assert.deepEqual(await fs.readdir(root), []);
  }
  await assert.rejects(
    writeWindowsImage(png.toString('base64'), {
      ...options,
      tmpdir: root,
      execFile: () => Promise.reject(new Error('PowerShell blocked'))
    }),
    /PowerShell blocked/u
  );
  assert.deepEqual(await fs.readdir(root), []);
});

test('Windows path rejects malformed data and supports check-only preparation without writing clipboard', async () => {
  await assert.rejects(writeWindowsImage('invalid', options), /not a PNG/u);
  await assert.rejects(
    writeWindowsImage(png.toString('base64'), { platform: 'linux' }),
    /unavailable/u
  );
  const result = await writeWindowsImage(png.toString('base64'), {
    ...options,
    checkOnly: true,
    execFile: (_executable, args) => {
      assert.ok(args.includes('-CheckOnly'));
      return Promise.resolve({
        stdout: JSON.stringify({ ...ack, CheckOnly: true, Copied: false })
      });
    }
  });
  assert.equal(result.metrics.Copied, false);
});

// On Windows this exercises the real PowerShell/.NET PNG+Bitmap preparation,
// without modifying the clipboard. Linux cannot validate those APIs.
test(
  'real Windows helper prepares both formats and preserves the PNG hash',
  { skip: process.platform !== 'win32' },
  async () => {
    const { metrics } = await writeWindowsImage(png.toString('base64'), { checkOnly: true });
    assert.equal(metrics.HasPng, true);
    assert.equal(metrics.HasBitmap, true);
    assert.equal(metrics.Copied, false);
    assert.equal(
      metrics.PngSha256,
      'ac308cdc947fb054538666cfd4a0c92c3fab0d5dd51083c0e8eae204aed8c645'
    );
  }
);
