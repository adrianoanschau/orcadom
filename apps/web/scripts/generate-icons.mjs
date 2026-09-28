import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const brand = [0x0d, 0x6e, 0x63, 0xff];
const ink = [0x1c, 0x24, 0x20, 0xff];
const paper = [0xff, 0xff, 0xff, 0xff];

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = paint(x, y);
      const offset = row + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRing(x, y, cx, cy, outer, inner) {
  const dx = x - cx + 0.5;
  const dy = y - cy + 0.5;
  const dist = Math.hypot(dx, dy);
  return dist <= outer && dist >= inner;
}

function inRect(x, y, left, top, right, bottom) {
  return x >= left && x < right && y >= top && y < bottom;
}

function paintMark(x, y, size, padded) {
  const inset = padded ? size * 0.18 : size * 0.08;
  const cx = size / 2;
  const cy = size / 2 - size * 0.02;
  const outer = size / 2 - inset;
  const inner = outer - size * 0.09;
  const dashTop = cy + outer * 0.18;
  const dashHeight = Math.max(2, size * 0.045);
  if (inRing(x, y, cx, cy, outer, inner)) return paper;
  if (inRect(x, y, cx - outer * 0.42, dashTop, cx + outer * 0.42, dashTop + dashHeight)) {
    return paper;
  }
  return brand;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'icon-192.png'), png(192, (x, y) => paintMark(x, y, 192, false)));
writeFileSync(join(outDir, 'icon-512.png'), png(512, (x, y) => paintMark(x, y, 512, false)));
writeFileSync(
  join(outDir, 'icon-512-maskable.png'),
  png(512, (x, y) => paintMark(x, y, 512, true)),
);
writeFileSync(join(outDir, 'apple-touch-icon.png'), png(180, (x, y) => paintMark(x, y, 180, false)));
writeFileSync(
  join(outDir, 'badge-96.png'),
  png(96, (x, y) => {
    const mark = paintMark(x, y, 96, false);
    return mark === paper ? ink : brand;
  }),
);

console.log(`Wrote PWA icons to ${outDir}`);
