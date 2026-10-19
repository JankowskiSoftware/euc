// Fast timestamp parsing for EUC World logs, e.g. "2026-10-19T12:33:43.219+0200".
// Date.parse does not accept "+0200" reliably, so the string is decoded by hand.

const D0 = 48; // '0'

function num(s, a, b) {
  let v = 0;
  for (let i = a; i < b; i++) v = v * 10 + (s.charCodeAt(i) - D0);
  return v;
}

/**
 * Parse an ISO-like timestamp with optional fraction and optional zone (Z, +hh, +hhmm, +hh:mm).
 * @returns {{ms:number, tzOffsetMin:number}|null} epoch milliseconds (UTC) and zone offset in minutes.
 */
export function parseTimestamp(s) {
  if (typeof s !== 'string' || s.length < 19) return null;
  const y = num(s, 0, 4), mo = num(s, 5, 7), d = num(s, 8, 10);
  const h = num(s, 11, 13), mi = num(s, 14, 16), se = num(s, 17, 19);
  if (!(y > 0 && mo >= 1 && mo <= 12)) return null;
  let i = 19;
  let frac = 0;
  if (s.charCodeAt(i) === 46 /* . */) {
    i++;
    let scale = 100;
    while (i < s.length) {
      const c = s.charCodeAt(i) - D0;
      if (c < 0 || c > 9) break;
      frac += c * scale;
      scale /= 10;
      i++;
    }
  }
  let tz = 0;
  const c = s.charAt(i);
  if (c === '+' || c === '-') {
    const sign = c === '+' ? 1 : -1;
    const rest = s.slice(i + 1).replace(':', '');
    const th = num(rest, 0, 2);
    const tm = rest.length >= 4 ? num(rest, 2, 4) : 0;
    tz = sign * (th * 60 + tm);
  }
  const ms = Date.UTC(y, mo - 1, d, h, mi, se) + frac - tz * 60000;
  return Number.isFinite(ms) ? { ms, tzOffsetMin: tz } : null;
}

/** Epoch ms only; NaN on failure. */
export function parseTimestampMs(s) {
  const r = parseTimestamp(s);
  return r ? r.ms : NaN;
}
