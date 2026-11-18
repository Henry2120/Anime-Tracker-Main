import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/icons');
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundedRect(x, y, rx, ry, rw, rh, radius) {
  const x0 = rx + radius;
  const y0 = ry + radius;
  const x1 = rx + rw - radius;
  const y1 = ry + rh - radius;
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  if (x >= x0 && x <= x1) return true;
  if (y >= y0 && y <= y1) return true;
  const cx = x < x0 ? x0 : x1;
  const cy = y < y0 ? y0 : y1;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function renderBookIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const padScale = maskable ? 0.78 : 1.0;
  const offset = maskable ? (512 * (1 - padScale)) / 2 : 0;

  const setPixel = (px, py, r, g, b, a = 255) => {
    const idx = (py * size + px) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 28, g = 25, b = 23, a = 255;
      const vx = px / scale;
      const vy = py / scale;

      if (!maskable && !inRoundedRect(vx, vy, 0, 0, 512, 512, 108)) {
        setPixel(px, py, 0, 0, 0, 0);
        continue;
      }

      const bx = (vx - offset) / padScale;
      const by = (vy - offset) / padScale;

      if (inRoundedRect(bx, by, 116, 88, 280, 336, 22)) {
        r = 250; g = 249; b = 246;
      }
      if (inRoundedRect(bx, by, 116, 88, 46, 336, 12)) {
        r = 194; g = 65; b = 12;
      }
      if (bx >= 232 && bx <= 292 && by >= 88 && by <= 216) {
        const notchDepth = 22 - Math.abs(bx - 262) * (22 / 30);
        if (by <= 216 - notchDepth) {
          r = 194; g = 65; b = 12;
        }
      }
      if (inRoundedRect(bx, by, 188, 252, 160, 16, 8)) {
        r = 68; g = 64; b = 60;
      }
      if (inRoundedRect(bx, by, 188, 292, 124, 14, 7)) {
        r = 120; g = 113; b = 108;
      }
      if (inRoundedRect(bx, by, 188, 330, 144, 14, 7)) {
        r = 168; g = 162; b = 158;
      }
      setPixel(px, py, r, g, b, a);
    }
  }
  return encodePng(size, size, buf);
}

fs.writeFileSync(path.join(outDir, 'icon-192.png'), renderBookIcon(192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), renderBookIcon(512, false));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), renderBookIcon(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderBookIcon(180, true));
console.log('Generated Book Tracker PWA PNG icons in', outDir);
