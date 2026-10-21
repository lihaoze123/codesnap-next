'use strict';

const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { tmpdir } = require('os');
const { promisify } = require('util');
const { decodePng } = require('./clipboard');
const execFileAsync = promisify(execFile);

const writeWindowsImage = async (data, options = {}) => {
  if ((options.platform || process.platform) !== 'win32') {
    throw new Error('Windows image clipboard is unavailable on this platform.');
  }
  const png = decodePng(data);
  const env = options.env || process.env;
  if (!env.SystemRoot)
    throw new Error(
      'Windows PowerShell location is unavailable. Use codesnapNext.clipboardMode: browser.'
    );
  const directory = await fs.mkdtemp(path.join(options.tmpdir || tmpdir(), 'codesnap-clipboard-'));
  const imagePath = path.join(directory, 'capture.png');
  try {
    await fs.writeFile(imagePath, png, { flag: 'wx', mode: 0o600 });
    const executable = path.win32.join(
      env.SystemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-File',
      path.join(__dirname, 'copy-image-windows.ps1'),
      imagePath
    ];
    if (options.checkOnly) args.push('-CheckOnly');
    let stdout;
    try {
      ({ stdout } = await (options.execFile || execFileAsync)(executable, args, {
        env,
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 8192
      }));
    } catch (error) {
      throw new Error(
        `Windows clipboard failed: ${String(error.stderr || error.message)
          .trim()
          .slice(-1000)}. Use codesnapNext.clipboardMode: browser, or Save image.`
      );
    }
    let metrics;
    try {
      metrics = JSON.parse(stdout.trim());
    } catch (error) {
      throw new Error('Windows clipboard helper returned an invalid acknowledgement.');
    }
    if (
      !metrics ||
      typeof metrics !== 'object' ||
      metrics.Width !== png.readUInt32BE(16) ||
      metrics.Height !== png.readUInt32BE(20) ||
      metrics.PngBytes !== png.length ||
      metrics.HasPng !== true ||
      metrics.HasBitmap !== true ||
      metrics.CheckOnly !== Boolean(options.checkOnly) ||
      metrics.Copied !== !options.checkOnly
    ) {
      throw new Error('Windows clipboard helper did not confirm the requested image.');
    }
    return { backend: 'windows-powershell', metrics };
  } finally {
    // Remove only the file and directory created for this request, on failure too.
    await fs.unlink(imagePath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await fs.rmdir(directory);
  }
};

module.exports = { writeWindowsImage };
