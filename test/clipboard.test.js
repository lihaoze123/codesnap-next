'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { writeWaylandImage, decodePng } = require('../src/clipboard');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
);
const options = { platform: 'linux', env: { WAYLAND_DISPLAY: 'test' } };
const child = () => {
  const process = new EventEmitter();
  process.stdin = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = () => undefined;
  return process;
};

test('Wayland write streams PNG without a shell and completes on parent exit, not daemon close', async () => {
  const bytes = [];
  const backend = await writeWaylandImage(png.toString('base64'), {
    ...options,
    spawn: (command, args, settings) => {
      assert.equal(command, 'wl-copy');
      assert.deepEqual(args, ['--type', 'image/png']);
      assert.equal(settings.shell, undefined);
      const process = child();
      process.stdin.on('data', (chunk) => bytes.push(chunk));
      process.stdin.on('finish', () => process.emit('exit', 0));
      return process;
    }
  });
  assert.equal(backend, 'wl-copy');
  assert.deepEqual(Buffer.concat(bytes), png);
});

test('missing wl-copy and compositor refusal are failures', async () => {
  await assert.rejects(
    writeWaylandImage(png.toString('base64'), {
      ...options,
      spawn: () => {
        const process = child();
        queueMicrotask(() =>
          process.emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' }))
        );
        return process;
      }
    }),
    /wl-copy is unavailable/u
  );
  await assert.rejects(
    writeWaylandImage(png.toString('base64'), {
      ...options,
      spawn: () => {
        const process = child();
        process.stdin.on('finish', () => {
          process.stderr.write('compositor refused clipboard');
          process.emit('exit', 1);
        });
        return process;
      }
    }),
    /compositor refused/u
  );
});

test('unsupported sessions and malformed images never launch a helper', async () => {
  await assert.rejects(
    writeWaylandImage(png.toString('base64'), { platform: 'linux', env: {} }),
    /unavailable/u
  );
  assert.throws(() => decodePng('invalid'), /not a PNG/u);
  const empty = Buffer.from(png);
  empty.writeUInt32BE(0, 16);
  assert.throws(() => decodePng(empty.toString('base64')), /dimensions/u);
  // Header admission must not block dimensions the renderer can export.
  const large = Buffer.from(png);
  large.writeUInt32BE(40000, 16);
  large.writeUInt32BE(40000, 20);
  assert.deepEqual(decodePng(large.toString('base64')), large);
});
