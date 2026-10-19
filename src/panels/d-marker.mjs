// Marker chips under the timeline plus a small detail chart for the +-10 s window.
import { axis, baseOption, themeColors, initChart } from '../app/chartTheme.mjs';
import { fmt, fmtClock } from '../app/format.mjs';
import { h, rangeOf, table } from './d-common.mjs';

export function createMarkers(root, onOpen) {
  const wrap = h('div', 'd-markers');
  const chips = h('div', 'd-chips');
  const detail = h('div', 'd-marker-detail'); detail.hidden = true;
  const title = h('h3', 'd-marker-title');
  const close = h('button', 'btn secondary', 'Zamknij'); close.type = 'button';
  const chartEl = h('div', 'chart d-marker-chart');
  const stats = h('div', 'd-marker-stats');
  detail.append(title, chartEl, stats, close);
  wrap.append(chips, detail);
  root.append(wrap);
  let chart = null, analysis = null, current = -1;
  close.onclick = () => { detail.hidden = true; current = -1; };

  function draw() {
    const m = analysis.markers[current]; if (!m) return;
    const c = themeColors(), w = analysis.ride.wheel;
    const sl = (a) => { const o = []; for (let i = m.i0; i <= m.i1; i++) o.push([w.t[i], a[i]]); return o; };
    const ln = (name, data, color, yAxisIndex) => ({ name, type: 'line', data, showSymbol: false, yAxisIndex, color, lineStyle: { width: 2, color } });
    chart.setOption({
      ...baseOption(c),
      grid: { left: 46, right: 46, top: 56, bottom: 34 },
      legend: { ...baseOption(c).legend, top: 0, textStyle: { color: c.text, fontSize: 13 } },
      xAxis: { ...axis(c), type: 'value', min: m.tStart, max: m.tEnd, splitNumber: 3, axisLabel: { color: c.text, fontSize: 12, hideOverlap: true, formatter: (v) => fmtClock(analysis.ride, v) } },
      yAxis: [{ ...axis(c), type: 'value', name: 'km/h, %', nameGap: 8 }, { ...axis(c, { splitLine: { show: false } }), type: 'value', name: 'A', nameGap: 8 }],
      series: [ln('Prędkość koła', sl(w.speed), c.wheel, 0), ln('Zapas %', sl(w.safetyMargin), c.margin, 0), ln('Iph', sl(w.currentPhase), c.current, 1)],
    }, true);
    const rows = [['', 'min', 'maks.']];
    for (const [name, arr, u] of [['Prędkość koła, km/h', w.speed, 1], ['Zapas, %', w.safetyMargin, 1], ['Iph, A', w.currentPhase, 1]]) {
      const [lo, hi] = rangeOf(arr.slice(m.i0, m.i1 + 1));
      rows.push([name, fmt(lo, u), fmt(hi, u)]);
    }
    stats.replaceChildren(table(rows));
  }
  function open(k) {
    current = k;
    const m = analysis.markers[k];
    title.textContent = `Znacznik ${fmtClock(analysis.ride, m.t)} (±10 s)`;
    detail.hidden = false;
    if (!chart) chart = initChart(chartEl);
    chart.resize(); draw();
    detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onOpen?.(m);
  }
  return {
    render(a) {
      analysis = a; current = -1; detail.hidden = true;
      chips.replaceChildren();
      wrap.hidden = !a.markers.length;   // no markers: hide the whole chip/detail area
      if (!a.markers.length) return;
      a.markers.forEach((m, k) => {
        const b = h('button', 'chip d-chip', `Znacznik ${fmtClock(a.ride, m.t)}`); b.type = 'button';
        b.onclick = () => open(k);
        chips.append(b);
      });
    },
    redraw() { if (chart && current >= 0 && !detail.hidden) draw(); },
  };
}
