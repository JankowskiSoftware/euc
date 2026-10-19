// Polish number/time formatting helpers. Missing values render as an en dash.
const nf = new Map();
function formatter(d) {
  if (!nf.has(d)) nf.set(d, new Intl.NumberFormat('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nf.get(d);
}
export const DASH = '–';
export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
export function fmt(x, digits = 1, unit = '') {
  if (!isNum(x)) return DASH;
  const s = formatter(digits).format(x).replace('-', '−');
  return unit ? `${s} ${unit}` : s;
}
export function fmtSigned(x, digits = 1, unit = '') {
  return isNum(x) && x > 0 ? '+' + fmt(x, digits, unit) : fmt(x, digits, unit);
}
// Seconds from file start -> "m:ss" (or "h:mm:ss").
export function fmtElapsed(t) {
  if (!isNum(t)) return DASH;
  const s = Math.round(t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const ss = String(r).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
// Seconds from file start -> local wall-clock "HH:MM:SS" in the ride's own time zone.
export function fmtClock(ride, t, withTenths = false) {
  if (!ride || !isNum(t)) return DASH;
  const ms = ride.startMs + t * 1000 + ride.tzOffsetMin * 60000;
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  let s = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  if (withTenths) s += ',' + Math.floor(d.getUTCMilliseconds() / 100);
  return s;
}
export function mapsUrl(lat, lon) {
  return isNum(lat) && isNum(lon) ? `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}` : null;
}
