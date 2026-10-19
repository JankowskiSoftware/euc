// Panel 6 (Prąd vs prędkość): phase current vs real speed, with braking/acceleration reference curves.
import { initChart, themeColors, onThemeChange, axis, baseOption } from '../app/chartTheme.mjs';
import { fmt, fmtSigned } from '../app/format.mjs';
import { iphForG } from '../analysis/index.mjs';
import { h, lazyRender, thin, table } from './d-common.mjs';

export function mount(root, ctx) {
  const { store } = ctx;
  const el = h('div', 'chart d-chart-tall');
  const text = h('div', 'd-text');
  root.append(el, text);
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
    let yLo = Math.min(sm.iphMin.value, 0), yHi = Math.max(sm.iphMax.value, 0);
    if (bm) {
      for (const g of [0.3, 0.4, 0.5]) for (const sign of [-1, 1]) {
        const pts = [];
        for (let v = 5; v <= 60; v += 2.5) pts.push([v, iphForG(bm, sign * g, v)]);
        const name = `${fmt(g, 1)} g`;
        const col = sign < 0 ? c.bad : c.ok;
        series.push({
          name: (sign < 0 ? 'hamowanie ' : 'przyspieszanie ') + name, type: 'line', showSymbol: true, symbol: 'none', silent: true, z: 5, color: col,
          lineStyle: { type: 'dashed', width: 2, color: col },
          data: pts.map((p, j) => (j === pts.length - 1 ? { value: p, symbol: 'circle', symbolSize: 6, label: { show: true, formatter: name, position: 'top', color: col, fontSize: 13, backgroundColor: c.surface, padding: [1, 3] } } : p)),
        });
      }
    }
    chart.setOption({
      ...baseOption(c),
      tooltip: { show: false }, legend: { show: false },
      grid: { left: 52, right: 14, top: 22, bottom: 46 },
      xAxis: { ...axis(c), type: 'value', name: 'prędkość rzeczywista, km/h', nameLocation: 'middle', nameGap: 28, min: 0, max: 60 },
      yAxis: { ...axis(c), type: 'value', name: 'Iph, A', nameGap: 8, min: Math.floor(yLo / 20) * 20 - 20 * (bm ? 1 : 0), max: Math.ceil(yHi / 20) * 20 + 20 * (bm ? 1 : 0) },
      series,
    }, true);
    text.replaceChildren(...describe(bm));
  }
  function describe(bm) {
    if (!bm) return [h('p', 'empty', 'Za mało danych, aby dopasować model hamowania (brakeModel = brak). Pokazano tylko pomiary.')];
    const rows = [['Przyspieszenie', 'Hamowanie, Iph', 'Przyspieszanie, Iph']];
    for (const r of bm.currentFor) rows.push([`${fmt(r.g, 1)} g`, fmtSigned(r.brakeIph, 0, 'A'), fmtSigned(r.accelIph, 0, 'A')]);
    return [
      h('h3', '', 'Model prądu'),
      h('p', '', `Każdy amper prądu fazowego daje k = ${fmt(bm.k, 3)} m/s² przyspieszenia (a = k·Iph + c + d·v², c = ${fmt(bm.c, 2)}, d = ${fmt(bm.d, 4)}; odchylenie reszt ${fmt(bm.residSd, 2, 'm/s²')}, próbek: ${bm.n}).`),
      h('p', 'small muted', `Prąd potrzebny do zadanego przyspieszenia przy ${fmt(bm.vRef, 0, 'km/h')} (prędkość rzeczywista):`),
      table(rows),
      h('p', 'note', 'Krzywe na wykresie: prąd fazowy potrzebny do 0,3 / 0,4 / 0,5 g, czerwone hamowanie, zielone przyspieszanie (ekstrapolacja modelu).'),
    ];
  }
  const lazy = lazyRender(el, render);
  store.on('analysis', (a) => { analysis = a; if (a) lazy.request(); });
  onThemeChange(() => lazy.request());
  if (store.get().analysis) { analysis = store.get().analysis; lazy.request(); }
}
