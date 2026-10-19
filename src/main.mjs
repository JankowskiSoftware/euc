// App entry: creates the store, mounts every panel, re-runs analysis on ride/settings change.
import { createStore } from './app/store.mjs';
import { loadSettings } from './app/settings.mjs';
import { loadFile, loadSample } from './app/loader.mjs';
import { analyzeRide } from './analysis/index.mjs';
import * as p01 from './panels/p01-file.mjs';
import * as p02 from './panels/p02-summary.mjs';
import * as p03 from './panels/p03-timeline.mjs';
import * as p04 from './panels/p04-margin.mjs';
import * as p05 from './panels/p05-events.mjs';
import * as p06 from './panels/p06-current.mjs';
import * as p07 from './panels/p07-impacts.mjs';
import * as p08 from './panels/p08-map.mjs';
import * as p09 from './panels/p09-battery.mjs';
import * as p10 from './panels/p10-settings.mjs';

const PANELS = [
  ['p-file', p01], ['p-summary', p02], ['p-timeline', p03], ['p-margin', p04], ['p-events', p05],
  ['p-current', p06], ['p-impacts', p07], ['p-map', p08], ['p-battery', p09], ['p-settings', p10],
];
// Panels that stay visible before a ride is loaded.
const ALWAYS_VISIBLE = new Set(['p-file', 'p-settings']);

const store = createStore({
  status: 'idle', progress: 0, error: null, fileName: null,
  ride: null, analysis: null, settings: loadSettings(),
});
const ctx = {
  store,
  bus: store.bus,
  loadFile: (file) => loadFile(file, store),
  loadSample: () => loadSample(store),
};

function recompute() {
  const { ride, settings } = store.get();
  if (!ride) return;
  try {
    const t0 = performance.now();
    const analysis = analyzeRide(ride, settings);
    store.set({ analysis, status: 'ready', error: null });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.body.dataset.state = 'ready';
      performance.mark('euc-rendered');
      console.info(`analysis+render ${Math.round(performance.now() - t0)} ms`);
    }));
  } catch (e) {
    console.error(e);
    store.set({ status: 'error', error: `Błąd analizy: ${e.message}` });
  }
}
store.on('ride', () => { document.body.dataset.state = 'analysing'; recompute(); });
store.on('settings', recompute);
store.on('status', (s) => { if (s !== 'ready') document.body.dataset.state = s; });
store.on('analysis', (a) => {
  for (const [id] of PANELS) if (!ALWAYS_VISIBLE.has(id)) document.getElementById(id).hidden = !a;
});

for (const [id, mod] of PANELS) {
  const root = document.querySelector(`#${id} .panel-body`);
  try { mod.mount(root, ctx); } catch (e) { console.error(`mount ${id} failed`, e); root.textContent = 'Błąd panelu.'; }
}

window.eucApp = ctx;
window.dispatchEvent(new Event('euc-ready'));
