// Panel 6 (Prąd vs prędkość): phase current vs real speed, with braking/acceleration reference curves.
import { initChart, themeColors, onThemeChange, axis, baseOption } from '../app/chartTheme.mjs';
import { fmt, fmtSigned } from '../app/format.mjs';
import { iphForG } from '../analysis/index.mjs';
import { h, lazyRender, thin } from './d-common.mjs';

export function mount(root, ctx) {
  const { store } = ctx;
  const el = h('div', 'chart d-chart-tall');
  const text = h('div', 'd-text');
  const caveat = h('p', 'note d-caveat');
  root.append(el, caveat, text);
  let chart = null, analysis = null;

  function render() {
    if (!analysis) return;
    const w = analysis.ride.wheel, sr = analysis.derived.speedReal, bm = analysis.brakeModel, sm = analysis.summary;
    const c = themeColors();
    if (!chart) chart = initChart(el);
    const idx = thin(w.n, 4000);
    const data = idx.map((i) => [sr[i], w.currentPhase[i]]);
    const hl = (v, name, pos) => ({ yAxis: v, label: { show: true, formatter: `${name} ${fmt(v, 0)} A`, position: pos, color: c.text, fontSize: 13 } });
    const series = [{
      name: 'Pomiary', type: 'scatter', large: true, largeThreshold: 500, symbolSize: 4, data, color: c.current, silent: true,
      markLine: {
        silent: true, symbol: 'none', animation: false, lineStyle: { color: c.text, type: 'dotted', width: 1.5 },
        data: [hl(sm.iphMax.value, 'maks.', 'insideEndTop'), hl(sm.iphMin.value, 'min.', 'insideEndBottom')],
      },
    }];
    const yLo = Math.min(sm.iphMin.value, 0), yHi = Math.max(sm.iphMax.value, 0);
    const yMin = Math.floor(yLo / 20) * 20 - 20 * (bm ? 1 : 0), yMax = Math.ceil(yHi / 20) * 20 + 20 * (bm ? 1 : 0);
    if (bm) {
      for (const g of [0.3, 0.4, 0.5]) for (const sign of [-1, 1]) {
        const pts = [];
        for (let v = 5; v <= 60; v += 2.5) { const y = iphForG(bm, sign * g, v); if (y >= yMin && y <= yMax) pts.push([v, y]); }
        if (!pts.length) continue;
        const name = (sign < 0 ? 'hamowanie ' : 'przysp. ') + fmt(g, 1) + ' g';
        const col = sign < 0 ? c.bad : c.ok;
        series.push({
          name, type: 'line', showSymbol: true, symbol: 'none', silent: true, z: 5, color: col, clip: true,
          lineStyle: { type: sign < 0 ? 'dashed' : 'dotted', width: 2.5, color: col },
          data: pts.map((p, j) => (j === pts.length - 1 ? { value: p, symbol: 'circle', symbolSize: 6, label: { show: true, formatter: name, position: 'left', color: c.text, fontSize: 12, backgroundColor: c.surface, padding: [1, 3] } } : p)),
        });
      }
    }
    chart.setOption({
      ...baseOption(c),
      tooltip: { show: false }, legend: { show: false },
      grid: { left: 52, right: 14, top: 22, bottom: 46 },
      xAxis: { ...axis(c), type: 'value', name: 'prędkość rzeczywista, km/h', nameLocation: 'middle', nameGap: 28, min: 0, max: 60 },
      yAxis: { ...axis(c), type: 'value', name: 'Iph, A', nameGap: 8, min: yMin, max: yMax },
      series,
    }, true);
    caveat.textContent = analysis.caveats?.brakeCurrent || '';
    caveat.hidden = !caveat.textContent;
    text.replaceChildren(...describe(bm));
  }
  function describe(bm) {
    if (!bm) return [h('p', 'empty', 'Za mało danych, aby dopasować model hamowania (brakeModel = brak). Pokazano tylko pomiary.')];
    const tbl = h('table', 'd-table');
    const hr = tbl.createTHead().insertRow();
    ['Przyspieszenie', 'Hamowanie, Iph', 'Przyspieszanie, Iph'].forEach((t) => hr.append(h('th', '', t)));
    const body = tbl.createTBody();
    for (const r of bm.currentFor) {
      const tr = body.insertRow(), out = r.beyondObserved;
      const th = h('th', out ? 'd-out' : '', `${fmt(r.g, 1)} g`);
      if (out) th.append(h('span', 'd-sub', 'poza zakresem jazdy'));
      tr.append(th, h('td', 'num' + (out ? ' d-out' : ''), fmtSigned(r.brakeIph, 0, 'A')), h('td', 'num' + (out ? ' d-out' : ''), fmtSigned(r.accelIph, 0, 'A')));
    }
    return [
      h('h3', '', 'Model prądu'),
      h('p', '', `Każdy amper prądu fazowego daje k = ${fmt(bm.k, 3)} m/s² przyspieszenia (a = k·Iph + c + d·v², c = ${fmt(bm.c, 2)}, d = ${fmt(bm.d, 4)}; odchylenie reszt ${fmt(bm.residSd, 2, 'm/s²')}, próbek: ${bm.n}).`),
      h('p', 'small muted', `Prąd potrzebny do zadanego przyspieszenia przy ${fmt(bm.vRef, 0, 'km/h')} (prędkość rzeczywista):`),
      tbl,
      h('p', 'small', `W jeździe: hamowanie, szczyt ≥ ${fmt(bm.observedPeakBrakeG, 2)} g (średnia z ≥1 s), najmniejszy Iph ${fmtSigned(bm.observedMinIph, 0, 'A')}.`),
      h('p', 'note', 'Krzywe na wykresie: prąd fazowy potrzebny do 0,3 / 0,4 / 0,5 g; linia przerywana = hamowanie (czerwona), kropkowana = przyspieszanie (zielona), opisane przy końcu linii (ekstrapolacja modelu).'),
    ];
  }
  const lazy = lazyRender(el, render);
  store.on('analysis', (a) => { analysis = a; if (a) lazy.request(); });
  onThemeChange(() => lazy.request());
  if (store.get().analysis) { analysis = store.get().analysis; lazy.request(); }
}
