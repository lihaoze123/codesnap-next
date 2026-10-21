'use strict';

const { spawn } = require('child_process');

const decodePng = (data) => {
  if (typeof data !== 'string') {
    throw new Error('Invalid clipboard image.');
  }
  const png = Buffer.from(data, 'base64');
  if (
    png.length < 33 ||
    !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    png.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('The clipboard payload is not a PNG image.');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (!width || !height) {
    throw new Error('Clipboard image has invalid dimensions.');
  }
  return png;
};

const writeWaylandImage = (data, options = {}) => {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  if (platform !== 'linux' || !env.WAYLAND_DISPLAY) {
    return Promise.reject(new Error('Native image copy is unavailable here. Use Save image.'));
  }
  let png;
  try {
    png = decodePng(data);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const child = (options.spawn || spawn)('wl-copy', ['--type', 'image/png'], {
      env,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    let stderr = '';
    let settled = false;
    const done = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // wl-copy forks a clipboard owner. Do not wait for inherited pipe handles
      // to close: the owner's lifetime is intentionally longer than this call.
      child.stderr.destroy();
      if (error) reject(error);
      else resolve('wl-copy');
    };
    const timer = setTimeout(() => {
      child.kill();
      done(new Error('Wayland clipboard did not respond. Retry or use Save image.'));
    }, 3000);
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.once('error', (error) =>
      done(
        new Error(
          error.code === 'ENOENT'
            ? 'Browser clipboard access was denied and wl-copy is unavailable. Use Save image.'
            : error.message
        )
      )
    );
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        child.kill();
        done(error);
      }
    });
    child.once('exit', (code) =>
      done(code === 0 ? undefined : new Error(stderr.trim() || 'Wayland clipboard write failed.'))
    );
    child.stdin.end(png);
  });
};

module.exports = { writeWaylandImage, decodePng };
