// Panel 3 (Przebieg): speed + safety margin over time, shared zoomable time axis, tap readout, markers.
// Pan decision: pinch zoom is always on; one-finger pan is OFF by default so a vertical swipe scrolls the
// page (touch-action: pan-y). The "Przesuwanie wykresu" toggle enables one-finger pan (touch-action: none).
import { initChart, themeColors, onThemeChange } from '../app/chartTheme.mjs';
import { buildTimelineOption } from './d-timeline-opt.mjs';
import { createReadout, nearestIndex } from './d-readout.mjs';
import { createMarkers } from './d-marker.mjs';
import { h } from './d-common.mjs';
import { whenVisible } from './e-util.mjs';

export function mount(root, ctx) {
  const { store, bus } = ctx;
  const bar = h('div', 'd-bar');
  const panBtn = h('button', 'btn secondary', 'Przesuwanie wykresu'); panBtn.type = 'button';
  panBtn.setAttribute('aria-pressed', 'false');
  const resetBtn = h('button', 'btn secondary', 'Pokaż całość'); resetBtn.type = 'button';
  bar.append(panBtn, resetBtn);
  const el = h('div', 'chart d-timeline-chart');
  const readout = createReadout(root);
  root.prepend(bar, el);
  const markers = createMarkers(root, (m) => zoomTo(m.t, 20));
  let chart = null, analysis = null, pan = false, drawn = null;

  const settings = () => store.get().settings;
  const draw = (full) => {
    if (!analysis) return;
    drawn = analysis;
    if (!chart) chart = initChart(el), chart.getZr().on('click', onTap);
    const opt = buildTimelineOption(analysis, settings(), themeColors(), pan);
    chart.setOption(opt, full ? { notMerge: true } : {});
  };
  function setCursor(t) {
    chart.setOption({ series: [0, 1].map((k) => ({ id: 'cur' + k, markLine: { data: [{ xAxis: t }] } })) });
  }
  function showAt(t) {
    const i = nearestIndex(analysis.ride.wheel.t, t);
    readout.show(analysis, i);
    setCursor(analysis.ride.wheel.t[i]);
  }
  function onTap(e) {
    if (!chart || !analysis) return;
    const p = [e.offsetX, e.offsetY];
    for (const gi of [0, 1]) {
      if (chart.containPixel({ gridIndex: gi }, p)) { showAt(chart.convertFromPixel({ gridIndex: gi }, p)[0]); return; }
    }
  }
  function zoomTo(t, span = 20) {
    if (!chart || !analysis) return;
    const w = analysis.ride.wheel, tMax = w.t[w.n - 1];
    const a = Math.max(0, t - span / 2), b = Math.min(tMax, t + span / 2);
    chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, startValue: a, endValue: b });
    chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, startValue: a, endValue: b });
  }
  function setPan(on) {
    pan = on;
    panBtn.setAttribute('aria-pressed', String(on));
    el.style.touchAction = on ? 'none' : 'pan-y';
    chart?.setOption({ dataZoom: [{ id: 'zin', moveOnMouseMove: on, preventDefaultMouseMove: on }] });
  }
  panBtn.onclick = () => setPan(!pan);
  resetBtn.onclick = () => chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
  el.style.touchAction = 'pan-y';

  store.on('analysis', (a) => {
    analysis = a;
    if (!a) return;
    readout.clear(); markers.render(a);
    lazyDraw();
  });
  // Chart is far below the first screen: draw it when scrolled near (or on focus-time).
  function lazyDraw() { whenVisible(el, () => { if (analysis && drawn !== analysis) draw(true); }); }
  onThemeChange(() => { if (drawn) draw(false); markers.redraw(); });
  bus.on('focus-time', ({ t, span = 20 } = {}) => {
    if (!analysis || !Number.isFinite(t)) return;
    draw(drawn !== analysis);
    zoomTo(t, span);
    showAt(t);
    root.closest('section')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  if (store.get().analysis) { analysis = store.get().analysis; readout.clear(); markers.render(analysis); lazyDraw(); }
}
