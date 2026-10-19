// Shared helpers for agent D panels.
export function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Render only while `el` is (nearly) on screen; `request()` renders now or when it becomes visible.
export function lazyRender(el, fn) {
  let visible = false, dirty = false;
  const io = new IntersectionObserver((es) => {
    visible = es.some((e) => e.isIntersecting);
    if (visible && dirty) { dirty = false; fn(); }
  }, { rootMargin: '300px' });
  io.observe(el);
  return { request() { if (visible) { dirty = false; fn(); } else dirty = true; } };
}

// Evenly thin an index range to at most `max` points.
export function thin(n, max = 4000) {
  const step = Math.max(1, Math.ceil(n / max));
  const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  return idx;
}

export function rangeOf(arr, filter = Number.isFinite) {
  let lo = Infinity, hi = -Infinity;
  for (const v of arr) if (filter(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

// Build a small table element from rows of strings; first row is the header.
export function table(rows, cls = 'd-table') {
  const t = h('table', cls);
  rows.forEach((r, ri) => {
    const tr = h('tr');
    r.forEach((c, ci) => tr.append(h(ri === 0 || ci === 0 ? 'th' : 'td', ci ? 'num' : '', c)));
    (ri === 0 ? t.createTHead() : (t.tBodies[0] ?? t.createTBody())).append(tr);
  });
  return t;
}
