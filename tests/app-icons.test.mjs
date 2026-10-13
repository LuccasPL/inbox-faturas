import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngSize(image) {
  assert.deepEqual(image.subarray(0, 8), pngSignature);
  assert.equal(image.toString('ascii', 12, 16), 'IHDR');
  return [image.readUInt32BE(16), image.readUInt32BE(20)];
}

test('app icon uses the workspace identity with no scripts or remote assets', async () => {
  const svg = await readFile(new URL('../app/icon.svg', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /<title id="title">Inbox Faturas<\/title>/);
  assert.match(svg, /fill="#147b61"/);
  assert.match(styles, /--primary: #147b61;/);
  assert.match(svg, /stroke="#ffffff"/);
  assert.doesNotMatch(svg, /<script|<foreignObject|\bhref=|\bon\w+=|vercel|next\.svg/i);
});

test('favicon contains complete PNG images at standard browser sizes', async () => {
  const icon = await readFile(new URL('../app/favicon.ico', import.meta.url));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 3);
  let previousEnd = 6 + 3 * 16;
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(icon[entry], size);
    assert.equal(icon[entry + 1], size);
    assert.equal(icon.readUInt16LE(entry + 4), 1);
    assert.equal(icon.readUInt16LE(entry + 6), 32);
    const length = icon.readUInt32LE(entry + 8);
    const offset = icon.readUInt32LE(entry + 12);
    assert.equal(offset, previousEnd);
    assert.ok(length > 24 && offset + length <= icon.length);
    assert.deepEqual(pngSize(icon.subarray(offset, offset + length)), [size, size]);
    previousEnd = offset + length;
  }
  assert.equal(previousEnd, icon.length);
});

test('Apple touch icon is a full-size PNG', async () => {
  const icon = await readFile(new URL('../app/apple-icon.png', import.meta.url));
  assert.deepEqual(pngSize(icon), [180, 180]);
});
