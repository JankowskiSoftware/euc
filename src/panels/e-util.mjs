// Small DOM helpers shared by agent E panels.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
// Run fn once when el becomes visible (or immediately without IntersectionObserver).
export function whenVisible(el, fn) {
  if (typeof IntersectionObserver === 'undefined') { fn(); return; }
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  });
  io.observe(el);
}
export function g(x) { return x; }
export const LEVEL_CLASS = { 1: 'status-warn', 2: 'status-warn', 3: 'status-bad' };
export const LEVEL_TEXT = { 1: 'niski', 2: 'średni', 3: 'wysoki' };
export function marginBucket(m, s) {
  return m > s.marginOk ? 'ok' : m < s.marginBad ? 'bad' : 'warn';
}
