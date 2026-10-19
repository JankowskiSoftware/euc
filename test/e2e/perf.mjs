// node test/e2e/perf.mjs [--profile]  -> 3 throttled runs of long.csv, prints timing + top self-time functions
import { chromium } from 'playwright';
const URL = 'file:///home/user/euc/dist/euc-dashboard.html';
const prof = process.argv.includes('--profile');
const browser = await chromium.launch();
const rows = [];
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(() => { window.__lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {} });
  await page.goto(URL);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (prof && i === 0) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const t0 = Date.now();
  await page.setInputFiles('#file-input', 'data/long.csv');
  await page.waitForSelector('body[data-state="ready"]', { timeout: 120000 });
  const wall = Date.now() - t0;
  const info = await page.evaluate(() => {
    const g = (n) => performance.getEntriesByName(n).pop()?.startTime;
    return { parse: g('euc-parse-start'), rendered: g('euc-rendered'), marks: performance.getEntriesByType('mark').map((m) => `${m.name}@${Math.round(m.startTime)}`).join(' '), lt: window.__lt.filter((x) => x[1] >= 50) };
  });
  rows.push({ run: i + 1, wall, marks: Math.round(info.rendered - info.parse), errs: errs.length });
  console.log(`run ${i + 1}: wall ${wall} ms, parse-start->rendered ${Math.round(info.rendered - info.parse)} ms, errors ${errs.length}`, errs.slice(0, 2));
  console.log('  marks', info.marks); console.log('  longtasks>=50ms [start,dur]', JSON.stringify(info.lt));
  if (prof && i === 0) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, k) => { const cf = byId.get(id).callFrame; const key = `${cf.functionName || '(anon)'}:${cf.lineNumber}`; self.set(key, (self.get(key) || 0) + (dt[k] || 0)); });
    console.log('  top self time (ms, throttled):');
    [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, v]) => console.log(`   ${(v / 1000).toFixed(0).padStart(6)}  ${k}`));
  }
  await ctx.close();
}
const med = (a) => a.slice().sort((x, y) => x - y)[1];
console.log(`median wall ${med(rows.map((r) => r.wall))} ms; median marks ${med(rows.map((r) => r.marks))} ms`);
await browser.close();
