// Charts for panel 5: single-event detail (speed + Iph) and compare overlay.
import { themeColors, baseOption, axis, initChart } from '../app/chartTheme.mjs';

export const COMPARE_KEYS = ['wheel', 'real', 'margin', 'current', 'battery', 'voltage', 'gps', 'accent'];

function slice(analysis, ev, padS) {
  const w = analysis.ride.wheel;
  const t = w.t, sp = analysis.derived.speedReal, iph = w.currentPhase;
  const a = ev.tStart - padS, b = ev.tEnd + padS;
  const out = [];
  for (let i = 0; i < w.n; i++) if (t[i] >= a && t[i] <= b) out.push(i);
  return { idx: out, t, sp, iph };
}

export function detailOption(analysis, ev) {
  const c = themeColors();
  const { idx, t, sp, iph } = slice(analysis, ev, 1);
  const spd = idx.map((i) => [t[i] - ev.tStart, sp[i]]);
  const cur = idx.map((i) => [t[i] - ev.tStart, iph[i]]);
  return {
    ...baseOption(c),
    grid: { left: 46, right: 46, top: 36, bottom: 34 },
    legend: { ...baseOption(c).legend, top: 0 },
    tooltip: { ...baseOption(c).tooltip, trigger: 'axis' },
    xAxis: { type: 'value', name: 's', ...axis(c), min: 'dataMin', max: 'dataMax' },
    yAxis: [
      { type: 'value', name: 'km/h', ...axis(c), scale: true },
      { type: 'value', name: 'A', ...axis(c, { splitLine: { show: false } }), scale: true },
    ],
    series: [
      { name: 'Prędkość rzecz.', type: 'line', data: spd, showSymbol: false, lineStyle: { color: c.real, width: 2 }, itemStyle: { color: c.real } },
      { name: 'Iph', type: 'line', yAxisIndex: 1, data: cur, showSymbol: false, lineStyle: { color: c.current, width: 2 }, itemStyle: { color: c.current } },
    ],
  };
}

export function compareOption(analysis, events, withIph) {
  const c = themeColors();
  const series = [];
  events.forEach((ev, k) => {
    const col = c[COMPARE_KEYS[k % COMPARE_KEYS.length]];
    const { idx, t, sp, iph } = slice(analysis, ev, 1);
    const name = `#${ev.id}`;
    series.push({ name, type: 'line', data: idx.map((i) => [t[i] - ev.tStart, sp[i]]), showSymbol: false, lineStyle: { color: col, width: 2 }, itemStyle: { color: col } });
    if (withIph) series.push({ name: `${name} Iph`, type: 'line', yAxisIndex: 1, data: idx.map((i) => [t[i] - ev.tStart, iph[i]]), showSymbol: false, lineStyle: { color: col, width: 1, type: 'dashed' }, itemStyle: { color: col } });
  });
  return {
    ...baseOption(c),
    grid: { left: 46, right: withIph ? 46 : 14, top: 40, bottom: 34 },
    legend: { ...baseOption(c).legend, top: 0, type: 'scroll' },
    tooltip: { ...baseOption(c).tooltip, trigger: 'axis' },
    xAxis: { type: 'value', name: 's od startu', ...axis(c) },
    yAxis: [
      { type: 'value', name: 'km/h', ...axis(c), scale: true },
      ...(withIph ? [{ type: 'value', name: 'A', ...axis(c, { splitLine: { show: false } }), scale: true }] : []),
    ],
    series,
  };
}

export { initChart };
