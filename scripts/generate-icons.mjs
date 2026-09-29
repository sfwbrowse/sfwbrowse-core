/**
 * SFWbrowse - PNG Icon Generator
 *
 * Generates crisp pixel-drawn PNG icons for WebExtension manifests
 * (sizes 16, 32, 48, 128 in both active green and disabled gray).
 */

import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = resolve(monorepoRoot, "core/icons");

// Simple CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

function renderShieldPNG(size, isActive = true) {
  // Color definitions: active green (#10B981) vs disabled gray (#64748B)
  const fg = isActive
    ? { r: 16, g: 185, b: 129, a: 255 }
    : { r: 100, g: 116, b: 139, a: 255 };

  const bg = { r: 0, g: 0, b: 0, a: 0 }; // Transparent

  // Scanline data: (1 + size * 4) bytes per row
  const rowSize = 1 + size * 4;
  const rawData = Buffer.alloc(rowSize * size);

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0: None

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Shield shape equation
      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;

      // Top flat/curved, bottom tapering to point
      const inTop = ny >= -0.85 && ny <= 0.1 && Math.abs(nx) <= 0.85;
      const inBottom = ny > 0.1 && ny <= 0.95 && Math.abs(nx) <= 0.85 * (1 - (ny - 0.1) / 0.9);

      if (inTop || inBottom) {
        // Anti-aliased boundary or fill
        rawData[pxOffset] = fg.r;
        rawData[pxOffset + 1] = fg.g;
        rawData[pxOffset + 2] = fg.b;
        rawData[pxOffset + 3] = fg.a;
      } else {
        rawData[pxOffset] = bg.r;
        rawData[pxOffset + 1] = bg.g;
        rawData[pxOffset + 2] = bg.b;
        rawData[pxOffset + 3] = bg.a;
      }
    }
  }

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Compression Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Non-interlaced
  const ihdrChunk = createChunk("IHDR", ihdrData);

  // IDAT chunk
  const compressed = deflateSync(rawData);
  const idatChunk = createChunk("IDAT", compressed);

  // IEND chunk
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

export async function generateIcons() {
  await mkdir(iconsDir, { recursive: true });

  const sizes = [16, 32, 48, 128];

  for (const size of sizes) {
    const activeBuf = renderShieldPNG(size, true);
    await writeFile(resolve(iconsDir, `icon-${size}.png`), activeBuf);

    const disabledBuf = renderShieldPNG(size, false);
    await writeFile(resolve(iconsDir, `icon-disabled-${size}.png`), disabledBuf);
  }

  console.log("✓ Successfully generated active and disabled PNG icons (16, 32, 48, 128)");
}

generateIcons().catch(console.error);
