import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels.set(color, offset);
}

function drawCircle(pixels, size, cx, cy, radius, color) {
  const limit = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= limit) setPixel(pixels, size, x, y, color);
    }
  }
}

function drawLine(pixels, size, start, end, width, color) {
  const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const x = Math.round(start.x + (end.x - start.x) * ratio);
    const y = Math.round(start.y + (end.y - start.y) * ratio);
    drawCircle(pixels, size, x, y, width, color);
  }
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const navy = [16, 28, 44, 255];
  const blue = [36, 107, 206, 255];
  const white = [255, 255, 255, 255];
  const mint = [92, 210, 174, 255];

  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(navy, offset);
  const inset = Math.round(size * 0.12);
  const panelRadius = Math.round(size * 0.08);
  for (let y = inset; y < size - inset; y += 1) {
    for (let x = inset; x < size - inset; x += 1) {
      const nearCorner = Math.min(x - inset, size - inset - x, y - inset, size - inset - y);
      if (nearCorner >= panelRadius || ((x - (inset + panelRadius)) ** 2 + (y - (inset + panelRadius)) ** 2 <= panelRadius ** 2)
        || ((x - (size - inset - panelRadius)) ** 2 + (y - (inset + panelRadius)) ** 2 <= panelRadius ** 2)
        || ((x - (inset + panelRadius)) ** 2 + (y - (size - inset - panelRadius)) ** 2 <= panelRadius ** 2)
        || ((x - (size - inset - panelRadius)) ** 2 + (y - (size - inset - panelRadius)) ** 2 <= panelRadius ** 2)) {
        setPixel(pixels, size, x, y, blue);
      }
    }
  }

  const points = [
    { x: Math.round(size * 0.27), y: Math.round(size * 0.66) },
    { x: Math.round(size * 0.48), y: Math.round(size * 0.43) },
    { x: Math.round(size * 0.72), y: Math.round(size * 0.58) },
  ];
  drawLine(pixels, size, points[0], points[1], Math.max(2, Math.round(size * 0.022)), white);
  drawLine(pixels, size, points[1], points[2], Math.max(2, Math.round(size * 0.022)), white);
  drawCircle(pixels, size, points[0].x, points[0].y, Math.round(size * 0.065), white);
  drawCircle(pixels, size, points[1].x, points[1].y, Math.round(size * 0.065), mint);
  drawCircle(pixels, size, points[2].x, points[2].y, Math.round(size * 0.065), white);

  const rawRows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    rawRows[rowOffset] = 0;
    pixels.copy(rawRows, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rawRows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

for (const size of [192, 512]) {
  const output = resolve(`public/icons/saferoute-${size}.png`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, createIcon(size));
  console.log(`PWA_ICON_CREATED ${size} ${output}`);
}
