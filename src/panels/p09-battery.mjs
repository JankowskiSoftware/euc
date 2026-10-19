// Panel 9: battery details (collapsed unless flagged): V vs Ib scatter with fit, temperatures.
import { fmt, fmtElapsed, isNum } from '../app/format.mjs';
import { themeColors, baseOption, axis, onThemeChange, initChart } from '../app/chartTheme.mjs';
import { h } from './e-util.mjs';

export function mount(root, ctx) {
  const { store } = ctx;
  const det = root.closest('details');
  let a = null, charts = [], built = false;

  const flagsBox = h('div'), stats = h('div', { class: 'e-stats' }), txt = h('p', { class: 'note' });
  const scEl = h('div', { class: 'chart' }), tEl = h('div', { class: 'chart' });
  root.append(flagsBox, stats, h('h3', {}, 'Napięcie vs prąd baterii'), scEl, txt,
    h('h3', {}, 'Temperatury'), tEl);

  const kv = (l, v) => h('div', { class: 'e-kv' }, h('span', { class: 'muted' }, l), h('span', { class: 'num' }, v));

  function scatterOpt(c) {
    const w = a.ride.wheel, step = Math.max(1, Math.ceil(w.n / 4000)), pts = [];
    for (let i = 0; i < w.n; i += step) if (isNum(w.current[i]) && isNum(w.voltage[i])) pts.push([w.current[i], w.voltage[i]]);
    const series = [{ type: 'scatter', name: 'Pomiary', data: pts, large: true, symbolSize: 3, itemStyle: { color: c.voltage, opacity: .5 } }];
    const m = a.batteryModel;
    if (m && pts.length) {
      let lo = Infinity, hi = -Infinity;
      for (const p of pts) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
      series.push({ type: 'line', name: 'Dopasowanie', showSymbol: false, data: [[lo, m.v0 - m.r * lo], [hi, m.v0 - m.r * hi]], lineStyle: { color: c.bad, width: 3 }, itemStyle: { color: c.bad } });
    }
    return { ...baseOption(c), grid: { left: 50, right: 14, top: 30, bottom: 36 },
      legend: { ...baseOption(c).legend, top: 0 },
      xAxis: { type: 'value', name: 'A', nameLocation: 'middle', nameGap: 22, ...axis(c), scale: true },
      yAxis: { type: 'value', name: 'V', ...axis(c), scale: true }, series };
  }
  function tempOpt(c) {
    const w = a.ride.wheel;
    const defs = [['temp', 'Sterownik', c.current], ['tempBatt', 'Bateria', c.battery], ['tempCpu', 'CPU', c.wheel], ['tempImu', 'IMU', c.margin]];
    const series = [];
    for (const [k, name, col] of defs) {
      const data = [];
      for (let i = 0; i < w.n; i++) if (isNum(w[k][i])) data.push([w.t[i], w[k][i]]);
      if (data.length) series.push({ type: 'line', name, data, showSymbol: false, sampling: 'lttb', lineStyle: { color: col, width: 2 }, itemStyle: { color: col } });
    }
    return { ...baseOption(c), grid: { left: 46, right: 14, top: 40, bottom: 34 },
      legend: { ...baseOption(c).legend, top: 0 }, tooltip: { ...baseOption(c).tooltip, trigger: 'axis' },
      xAxis: { type: 'value', ...axis(c, { axisLabel: { color: c.text, fontSize: 13, formatter: (v) => fmtElapsed(v) } }) },
      yAxis: { type: 'value', name: '°C', ...axis(c), scale: true }, series };
  }
  function applyOptions() {
    if (!built || !a) return;
    const c = themeColors();
    charts[0].setOption(scatterOpt(c), true);
    charts[1].setOption(tempOpt(c), true);
  }
  function initCharts() {
    if (built || !a) return;
    built = true;
    charts = [initChart(scEl), initChart(tEl)];
    applyOptions();
  }
  function render() {
    flagsBox.replaceChildren();
    if (!a) return;
    const fl = a.battery.flags, s = a.summary, m = a.batteryModel;
    root.closest('details').classList.toggle('alert', fl.length > 0);
    if (fl.length) { det.open = true; flagsBox.append(h('ul', { class: 'e-flags' }, fl.map((f) => h('li', {}, f)))); }
    stats.replaceChildren(
      kv('Napięcie min', `${fmt(s.voltageMin.value, 1, 'V')} (${fmtElapsed(s.voltageMin.t)})`),
      kv('Napięcie maks.', fmt(s.voltageMax, 1, 'V')),
      kv('Bateria start / koniec', `${fmt(s.batteryStart, 0)} / ${fmt(s.batteryEnd, 0, '%')}`),
      kv('Bateria minimum', `${fmt(s.batteryMin.value, 0, '%')} (${fmtElapsed(s.batteryMin.t)})`));
    txt.textContent = m
      ? `Opór dopasowany R = ${fmt(m.r * 1000, 0, 'mΩ')}${m.rMeta != null ? `, z pliku ${fmt(m.rMeta * 1000, 0, 'mΩ')}` : ''}; V0 = ${fmt(m.v0, 1, 'V')} (V0 dryfuje wraz z poziomem naładowania, więc dopasowanie jest przybliżone).`
      : 'Za mało danych do dopasowania oporu baterii.';
    if (built) { charts.forEach((c) => c.dispose()); charts = []; built = false; }
    if (det.open) initCharts();
  }
  det.addEventListener('toggle', () => { if (det.open) { initCharts(); charts.forEach((c) => c.resize()); } });
  store.on('analysis', (x) => { a = x; render(); });
  onThemeChange(applyOptions);
  if (store.get().analysis) { a = store.get().analysis; render(); }
}
