// node test/e2e/verify.mjs  -> writes docs/screens/*.png and test/e2e/results.json
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
const URL = 'file:///home/user/euc/dist/euc-dashboard.html';
const OUT = 'docs/screens'; mkdirSync(OUT, { recursive: true });
const ctxOpts = (cs) => ({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: cs });
const res = { themes: {}, perf: {}, interactions: {} };
const browser = await chromium.launch();

function track(page, bag) {
  bag.errors = []; bag.console = []; bag.requests = [];
  page.on('pageerror', e => bag.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') bag.console.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) bag.requests.push(u); });
}
const ready = (p, t = 60000) => p.waitForSelector('body[data-state="ready"]', { timeout: t });

const AUDIT = () => {
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/) || s.match(/color\(srgb ([^)]+)\)/); if (!m) return null; let p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); if (s.startsWith('color(')) p = p.map((v, i) => i < 3 ? v * 255 : v); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) return s + '#' + el.id; if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).join('.'); const p = el.closest('[id]'); return (p ? '#' + p.id + ' ' : '') + s; };
  const bgOf = el => { let layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } } let base = [255, 255, 255]; if (getComputedStyle(document.documentElement).colorScheme.includes('dark') && !layers.some(l => l[3] >= 1)) base = [0, 0, 0]; for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; base = base.map((b, k) => l[k] * l[3] + b * (1 - l[3])); } return base; };
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]') && !el.closest('details:not([open]) > :not(summary)'); };
  const out = { hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, overflow: [], small: [], contrast: [] };
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el) || el.closest('canvas,svg,.echarts')) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (/^(BUTTON|A|INPUT|SUMMARY|SELECT)$/.test(el.tagName) && (r.width < 44 || r.height < 44)) out.small.push({ s: sel(el), w: Math.round(r.width), h: Math.round(r.height), t: (el.textContent || '').trim().slice(0, 20) });
    else if (/^(BUTTON|A|INPUT|SUMMARY|SELECT)$/.test(el.tagName) && (r.width < 48 || r.height < 48)) out.small.push({ s: sel(el), w: Math.round(r.width), h: Math.round(r.height), warn48: 1 });
    if (/clip|hidden|auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && !/auto|scroll/.test(cs.overflowX)) out.overflow.push({ s: sel(el), sw: el.scrollWidth, cw: el.clientWidth });
    if (r.right > innerWidth + 1 || r.left < -1) out.overflow.push({ s: sel(el), off: 'viewport', l: Math.round(r.left), r: Math.round(r.right) });
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own) {
      const pr = el.parentElement.getBoundingClientRect();
      if (el.parentElement !== document.body && (r.right > pr.right + 1 || r.left < pr.left - 1) && !/auto|scroll/.test(getComputedStyle(el.parentElement).overflowX)) out.overflow.push({ s: sel(el), off: 'parent' });
      const fg = parse(cs.color), bg = bgOf(el); if (!fg) continue;
      const a = fg[3]; const f = fg.slice(0, 3).map((v, k) => v * a + bg[k] * (1 - a));
      const L1 = lum(f), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
      const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
      const need = (px >= 24 || (bold && px >= 18.66)) ? 3 : 4.5;
      if (ratio < need) { const k = sel(el) + cs.color; if (!seen.has(k)) { seen.add(k); out.contrast.push({ s: sel(el), ratio: +ratio.toFixed(2), need, px, fg: cs.color, txt: el.textContent.trim().slice(0, 25) }); } }
    }
  }
  out.contrast.sort((a, b) => a.ratio - b.ratio); out.contrast = out.contrast.slice(0, 12);
  out.overflow = out.overflow.slice(0, 12); out.small = out.small.slice(0, 20);
  return out;
};

for (const cs of ['light', 'dark']) {
  const bag = {}; const ctx = await browser.newContext(ctxOpts(cs)); const page = await ctx.newPage(); track(page, bag);
  await page.goto(URL); await page.click('text=Przykład'); await ready(page);
  await page.evaluate(() => document.querySelectorAll('details.panel').forEach(d => d.open = true));
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); } scrollTo(0, 0); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${cs}-full.png`, fullPage: true });
  const ids = await page.$$eval('section.panel, details.panel', els => els.filter(e => !e.hidden).map(e => e.id));
  for (const id of ids) { try { await (await page.$('#' + id)).screenshot({ path: `${OUT}/${cs}-${id}.png` }); } catch (e) { bag.errors.push('shot ' + id + e.message); } }
  const texts = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.panel')].map(p => [p.id, p.innerText])));
  const audit = await page.evaluate(AUDIT);
  res.themes[cs] = { ids, bag, audit, texts: cs === 'light' ? texts : undefined, canvasCount: await page.$$eval('canvas', c => c.length) };
  if (cs === 'light') {
    // interactions
    const I = res.interactions;
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('#p-events .e-main').nth(1).tap(); await page.waitForTimeout(500);
    I.eventDetail = await page.locator('#p-events .e-detail').count() > 0 && await page.locator('#p-events .e-detail').first().isVisible();
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
    await page.locator('#p-impacts .e-imp .btn', { hasText: 'Przebieg' }).first().tap(); await page.waitForTimeout(1200);
    const r = await page.evaluate(() => { const p = document.querySelector('#p-timeline').getBoundingClientRect(); return { top: Math.round(p.top), inView: p.top < innerHeight && p.bottom > 0, txt: document.querySelector('#p-timeline').innerText.slice(0, 300) }; });
    I.impactToTimeline = r;
    const ch = await page.locator('#p-timeline .chart').first().boundingBox();
    await page.touchscreen.tap(ch.x + ch.width * .6, ch.y + ch.height * .4); await page.waitForTimeout(600);
    I.timelineReadout = await page.evaluate(() => document.querySelector('#p-timeline').innerText.slice(0, 400));
    await page.screenshot({ path: `${OUT}/light-interaction-timeline.png` });
    if (!(await page.evaluate(() => document.querySelector('#p-settings').open))) await page.locator('#p-settings summary').tap();
    const inp = page.locator('#set-reactionTime'); const old = await inp.inputValue(); await inp.fill('2,5');
    await page.locator('#p-settings button[type=submit]').tap(); await page.waitForTimeout(800);
    await page.reload(); await page.waitForTimeout(500);
    const open = await page.evaluate(() => document.querySelector('#p-settings').open);
    if (!open) await page.locator('#p-settings summary').click();
    I.settings = { old, after: await page.locator('#set-reactionTime').inputValue() };
    await page.locator('#set-reactionTime').fill(old); await page.locator('#p-settings button[type=submit]').tap();
  }
  await ctx.close();
}

// perf
const long = 'data/long.csv';
async function perfRun(kind) {
  const ctx = await browser.newContext(ctxOpts('light')); const page = await ctx.newPage(); const bag = {}; track(page, bag);
  await page.goto(URL); const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  if (kind === 'long') await page.setInputFiles('#file-input', long); else await page.click('text=Przykład');
  await ready(page, 120000); const ms = Date.now() - t0;
  const m = await page.evaluate(() => { const a = performance.getEntriesByName('euc-parse-start').pop(), b = performance.getEntriesByName('euc-rendered').pop(); return a && b ? b.startTime - a.startTime : null; });
  let scrollErr = null;
  if (kind === 'long') {
    await page.evaluate(() => document.querySelectorAll('details.panel').forEach(d => d.open = true));
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 250)); } scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(1500); scrollErr = { errors: bag.errors, console: bag.console, canvases: await page.$$eval('canvas', c => c.length), empties: await page.$$eval('.panel:not([hidden]) .chart', cs => cs.filter(c => !c.querySelector('canvas')).length) };
  }
  await ctx.close(); return { ms, marks: m, scrollErr };
}
for (const kind of ['long', 'long', 'long', 'sample']) { (res.perf[kind] ||= []).push(await perfRun(kind)); }
res.requests = [...new Set(Object.values(res.themes).flatMap(t => t.bag.requests))];
writeFileSync('test/e2e/results.json', JSON.stringify(res, null, 1));
await browser.close(); console.log('done');
