// Panel 4 (Zapas vs prędkość): scatter of wheel speed vs safety margin coloured by voltage + model text.
import { initChart, themeColors, onThemeChange, axis, baseOption } from '../app/chartTheme.mjs';
import { fmt } from '../app/format.mjs';
import { h, lazyRender, thin, rangeOf, table } from './d-common.mjs';

export function mount(root, ctx) {
  const { store } = ctx;
  const el = h('div', 'chart d-chart-tall');
  const text = h('div', 'd-text');
  root.append(el, text);
  let chart = null, analysis = null;

  function curveName(m, cv, k) {
    const v = fmt(cv.vRest, 1, 'V');
    return Math.abs(cv.vRest - m.vMedian) < 0.05 ? `mediana ${v}` : v;
  }
  function render() {
    if (!analysis) return;
    const { ride, derived } = analysis, w = ride.wheel, m = analysis.marginModel, s = store.get().settings;
    const c = themeColors();
    if (!chart) chart = initChart(el);
    const idx = thin(w.n, 4000);
    const data = idx.map((i) => [w.speed[i], w.safetyMargin[i], w.voltage[i]]);
    const [vLo, vHi] = rangeOf(w.voltage);
    const [mLo] = rangeOf(w.safetyMargin);
    const [, sHi] = rangeOf(w.speed);
    const xMax = Math.ceil((sHi + 5) / 5) * 5;
    const tbLine = 100 - s.tiltbackPwm;
    const yMin = Math.floor((Math.min(mLo, tbLine) - 5) / 10) * 10;
    // `large` scatters ignore per-point visualMap colour, so points are binned by voltage into coloured series.
    const NB = 8, bins = Array.from({ length: NB }, () => []);
    for (const d of data) bins[Math.max(0, Math.min(NB - 1, Math.floor(((d[2] - vLo) / (vHi - vLo || 1)) * NB)))].push(d);
    const ramp = [c.bad, c.warn, c.ok];
    const series = bins.map((b, k) => ({
      name: 'Pomiary ' + k, type: 'scatter', large: true, largeThreshold: 500, symbolSize: 4, data: b, silent: true,
      itemStyle: { color: echarts.color.lerp((k + 0.5) / NB, ramp) },
      ...(k ? {} : { markLine: {

        silent: true, symbol: 'none', animation: false,
        lineStyle: { color: c.bad, width: 2, type: 'solid' },
        label: { show: true, formatter: 'tiltback', color: c.bad, fontSize: 13, position: 'insideStartTop' },
        data: [{ yAxis: tbLine }],
      } }),
    }));
    if (m) {
      const cs = [...m.curves].sort((a, b) => b.vRest - a.vRest);
      const dashes = ['dashed', 'dashed', 'dashed'];
      cs.forEach((cv, k) => {
        const pts = cv.points.filter((p) => p[0] <= xMax);
        let at = pts.findIndex((p) => p[0] >= xMax * (0.55 + 0.17 * k));
        if (at < 0) at = pts.length - 1;
        series.push({
          name: curveName(m, cv, k), type: 'line', showSymbol: true, symbol: 'none', silent: true, z: 5,
          lineStyle: { type: dashes[k], width: 2.5, color: c.text }, color: c.text,
          data: pts.map((p, j) => (j === at
            ? { value: p, symbol: 'circle', symbolSize: 6, label: { show: true, formatter: curveName(m, cv, k), position: 'top', color: c.text, fontSize: 13, backgroundColor: c.surface, padding: [1, 3] } }
            : p)),
        });
      });
    }
    chart.setOption({
      ...baseOption(c),
      tooltip: { show: false }, legend: { show: false },
      grid: { left: 48, right: 12, top: 18, bottom: 92 },
      xAxis: { ...axis(c), type: 'value', name: 'prędkość koła, km/h', nameLocation: 'middle', nameGap: 28, min: 0, max: xMax },
      yAxis: { ...axis(c), type: 'value', name: 'zapas %', min: yMin, max: 100, nameGap: 8 },
      visualMap: {
        type: 'continuous', dimension: 2, seriesIndex: [], min: Math.floor(vLo), max: Math.ceil(vHi),
        orient: 'horizontal', left: 'center', bottom: 4, itemWidth: 16, itemHeight: 200, calculable: false,
        text: [fmt(vHi, 0, 'V'), fmt(vLo, 0, 'V')], textStyle: { color: c.text, fontSize: 13 },
        inRange: { color: [c.bad, c.warn, c.ok] }, formatter: (v) => fmt(v, 0),
      },
      series,
    }, true);
    text.replaceChildren(...describe(m, s, derived));
  }
  function describe(m, s) {
    if (!m) return [h('p', 'empty', 'Za mało danych, aby dopasować model zapasu (marginModel = brak).')];
    const out = [];
    out.push(h('h3', '', 'Model zapasu'));
    out.push(h('p', 'num small', `PWM = a·(prędkość/U)·100 + b·(Iph/U)·100 + c`));
    out.push(h('p', '', `a = ${fmt(m.a, 3)}, b = ${fmt(m.b, 3)}, c = ${fmt(m.c, 2)}. Odchylenie reszt ${fmt(m.residSd, 2, 'pkt %')}, r² = ${fmt(m.r2, 3)}, próbek: ${m.n}.`));
    const tb = m.tiltbackSpeedAtMedian;
    out.push(h('p', '', `Przy napięciu spoczynkowym ${fmt(m.vMedian, 1, 'V')} (mediana) i prądzie ${fmt(s.curveIph, 0, 'A')} tiltback (PWM ${fmt(s.tiltbackPwm, 0, '%')}) wypada przy ok. ${fmt(tb.speedWheel, 1, 'km/h')} wg koła (${fmt(tb.speedReal, 1, 'km/h')} rzeczywistych).`));
    const vs = [...new Set(m.predictions.map((p) => p.vRest))].sort((a, b) => b - a);
    const is = [...new Set(m.predictions.map((p) => p.iph))].sort((a, b) => a - b);
    const rows = [['U spocz. \\ Iph', ...is.map((i) => fmt(i, 0, 'A'))]];
    for (const v of vs) {
      rows.push([fmt(v, 1, 'V'), ...is.map((i) => {
        const p = m.predictions.find((q) => q.vRest === v && q.iph === i);
        return p ? `${fmt(p.speedWheel, 0)} / ${fmt(p.speedReal, 0)}` : '–';
      })]);
    }
    out.push(h('h3', '', 'Prędkość tiltbacku: ekstrapolacja modelu'));
    out.push(table(rows));
    out.push(h('p', 'note', 'Komórki: km/h wg koła / rzeczywiste. To ekstrapolacja modelu poza zakres zarejestrowanych prędkości, nie pomiar.'));
    return out;
  }
  const lazy = lazyRender(el, render);
  store.on('analysis', (a) => { analysis = a; if (a) lazy.request(); });
  onThemeChange(() => lazy.request());
  if (store.get().analysis) { analysis = store.get().analysis; lazy.request(); }
}
