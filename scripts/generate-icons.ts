/**
 * Generate PWA icons (any-purpose + maskable + apple-touch) as PNGs.
 * Called from scripts/build-assets.ts — writes into the build icons dir.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const TEAL = { r: 0x0f, g: 0x76, b: 0x6e };
const MINT = { r: 0xee, g: 0xf5, b: 0xf3 };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

type Rgb = { r: number; g: number; b: number };

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0;
    rgba.copy(raw, y * rowSize + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(buf: Buffer, size: number, x: number, y: number, c: Rgb, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = c.r;
  buf[i + 1] = c.g;
  buf[i + 2] = c.b;
  buf[i + 3] = a;
}

function fillRect(
  buf: Buffer,
  size: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgb
) {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(size - 1, Math.ceil(x1));
  const bottom = Math.min(size - 1, Math.ceil(y1));
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) setPixel(buf, size, x, y, c);
  }
}

function fillRoundedRect(
  buf: Buffer,
  size: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  c: Rgb
) {
  const r = Math.max(0, Math.floor(radius));
  fillRect(buf, size, x0 + r, y0, x1 - r, y1, c);
  fillRect(buf, size, x0, y0 + r, x1, y1 - r, c);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      setPixel(buf, size, Math.round(x0 + r + dx), Math.round(y0 + r + dy), c);
      setPixel(buf, size, Math.round(x1 - r + dx), Math.round(y0 + r + dy), c);
      setPixel(buf, size, Math.round(x0 + r + dx), Math.round(y1 - r + dy), c);
      setPixel(buf, size, Math.round(x1 - r + dx), Math.round(y1 - r + dy), c);
    }
  }
}

/** Draw clipboard mark centered in [pad, size-pad]. */
function drawClipboard(buf: Buffer, size: number, pad: number) {
  const inner = size - pad * 2;
  const cx = size / 2;
  const bodyW = inner * 0.48;
  const bodyH = inner * 0.58;
  const x0 = cx - bodyW / 2;
  const y0 = pad + inner * 0.22;
  const x1 = x0 + bodyW;
  const y1 = y0 + bodyH;
  const radius = inner * 0.06;

  fillRoundedRect(buf, size, x0, y0, x1, y1, radius, WHITE);

  const clipW = bodyW * 0.42;
  const clipH = inner * 0.12;
  const clipX0 = cx - clipW / 2;
  const clipY0 = y0 - clipH * 0.55;
  fillRoundedRect(
    buf,
    size,
    clipX0,
    clipY0,
    clipX0 + clipW,
    clipY0 + clipH,
    clipH * 0.35,
    MINT
  );

  // Content lines on the clipboard
  const lineLeft = x0 + bodyW * 0.18;
  const lineRight = x1 - bodyW * 0.18;
  const lineY0 = y0 + bodyH * 0.32;
  for (let i = 0; i < 3; i++) {
    const y = lineY0 + i * bodyH * 0.16;
    fillRect(buf, size, lineLeft, y, lineRight - (i === 2 ? bodyW * 0.2 : 0), y + inner * 0.035, TEAL);
  }
}

function renderIcon(size: number, maskable: boolean): Buffer {
  const buf = Buffer.alloc(size * size * 4);
  // Background
  const bgPad = maskable ? size * 0.1 : 0;
  if (maskable) {
    // Full canvas mint, then teal circle/square in safe zone
    fillRect(buf, size, 0, 0, size - 1, size - 1, MINT);
    fillRoundedRect(
      buf,
      size,
      bgPad,
      bgPad,
      size - 1 - bgPad,
      size - 1 - bgPad,
      size * 0.18,
      TEAL
    );
    drawClipboard(buf, size, size * 0.22);
  } else {
    fillRoundedRect(buf, size, 0, 0, size - 1, size - 1, size * 0.18, TEAL);
    drawClipboard(buf, size, size * 0.18);
  }
  return encodePng(size, size, buf);
}

export function writeIcons(iconsDir: string): void {
  writeFileSync(join(iconsDir, "icon-192.png"), renderIcon(192, false));
  writeFileSync(join(iconsDir, "icon-512.png"), renderIcon(512, false));
  writeFileSync(join(iconsDir, "icon-maskable-512.png"), renderIcon(512, true));
  writeFileSync(join(iconsDir, "apple-touch-icon.png"), renderIcon(180, false));
}

if (import.meta.main) {
  const out = process.argv[2] ?? join(import.meta.dir, "..", "dist", "assets", "dev", "icons");
  writeIcons(out);
  console.log(`Icons written → ${out}`);
}
