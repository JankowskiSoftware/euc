// Tiny pure-JS PNG encoder + icon renderer (dark tile with a ring and a speed arc).
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** maskable: content kept inside the central 80% safe zone, background full-bleed. */
export function renderIcon(size, maskable = false) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [11, 18, 32], fg = [56, 189, 248], hot = [251, 146, 60];
  const cx = size / 2, cy = size / 2;
  const R = size * (maskable ? 0.30 : 0.38), w = size * 0.07;
  const corner = maskable ? 0 : size * 0.22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    // rounded-square alpha (full for maskable)
    const dx = Math.max(Math.abs(x + 0.5 - cx) - (cx - corner), 0);
    const dy = Math.max(Math.abs(y + 0.5 - cy) - (cy - corner), 0);
    const inside = Math.hypot(dx, dy) <= corner || corner === 0;
    if (!inside) continue;
    let c = bg;
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (Math.abs(d - R) < w / 2) {
      let a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx); // -pi..pi, 0 = right
      const deg = ((a * 180 / Math.PI) + 360 + 90) % 360; // 0 = top, clockwise
      c = deg > 200 && deg < 320 ? hot : fg;
    }
    if (d < size * 0.05) c = fg;
    // needle
    const ang = (-35 * Math.PI) / 180, nx = Math.sin(ang), ny = -Math.cos(ang);
    const t = (x + 0.5 - cx) * nx + (y + 0.5 - cy) * ny;
    const perp = Math.abs(-(x + 0.5 - cx) * ny + (y + 0.5 - cy) * nx);
    if (t > 0 && t < R * 0.85 && perp < w * 0.35) c = [255, 255, 255];
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return encodePng(size, px);
}
