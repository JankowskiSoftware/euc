// Panel 8: Leaflet route map coloured by safety-margin bucket, with event and impact pins.
import { fmt, fmtClock, isNum } from '../app/format.mjs';
import { themeColors, onThemeChange } from '../app/chartTheme.mjs';
import { h, whenVisible, marginBucket } from './e-util.mjs';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function mount(root, ctx) {
  const { store, bus } = ctx;
  const mapEl = h('div', { class: 'e-map' });
  const netNote = h('p', { class: 'note', hidden: true }, 'Brak sieci – sam kształt trasy');
  const noGps = h('p', { class: 'empty', hidden: true }, 'Brak danych GPS w tym pliku.');
  const legend = h('div', { class: 'e-legend' });
  const credit = h('p', { class: 'note e-credit' }, 'Mapa: ',
    h('a', { class: 'e-credit-link', href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, '© autorzy OpenStreetMap'));
  root.append(noGps, mapEl, credit, netNote, legend);

  let map = null, layer = null, tiles = null, bounds = null, visible = false, wanted = false;

  function syncTiles() {
    if (!map) return;
    const online = navigator.onLine;
    netNote.hidden = online;
    if (online && !tiles) {
      tiles = L.tileLayer(TILES, { maxZoom: 19 });
      tiles.addTo(map);
    } else if (!online && tiles) { map.removeLayer(tiles); tiles = null; }
  }

  function build() {
    const a = store.get().analysis;
    if (!a || !visible) { wanted = !!a; return; }
    wanted = false;
    const w = a.ride.wheel, s = a.settingsUsed && store.get().settings;
    const c = themeColors();
    const col = { ok: c.ok, warn: c.warn, bad: c.bad };
    const has = [];
    for (let i = 0; i < w.n; i++) if (isNum(w.lat[i]) && isNum(w.lon[i])) has.push(i);
    noGps.hidden = has.length > 0;
    mapEl.hidden = legend.hidden = !has.length;
    if (!has.length) return;
    if (!map) {
      map = L.map(mapEl, { preferCanvas: true, zoomControl: true, attributionControl: false });
      map.setView([has.length ? w.lat[has[0]] : 0, w.lon[has[0]]], 15);
    }
    syncTiles();
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    // Batch consecutive same-bucket points into one polyline.
    let cur = null, pts = [];
    const flush = () => { if (cur && pts.length > 1) L.polyline(pts, { color: col[cur], weight: 5, opacity: .95 }).addTo(layer); };
    for (const i of has) {
      const m = isNum(w.safetyMargin[i]) ? marginBucket(w.safetyMargin[i], s) : 'ok';
      const p = [w.lat[i], w.lon[i]];
      if (m !== cur) { const last = pts[pts.length - 1]; flush(); cur = m; pts = last ? [last, p] : [p]; } else pts.push(p);
    }
    flush();
    bounds = L.latLngBounds(has.map((i) => [w.lat[i], w.lon[i]]));
    const pin = (lat, lon, color, html, onBtn, btnText) => {
      if (!isNum(lat) || !isNum(lon)) return;
      const box = h('div', { class: 'e-popup' }, h('div'));
      box.firstChild.innerHTML = html;
      box.append(h('button', { type: 'button', class: 'btn', onclick: onBtn }, btnText));
      L.circleMarker([lat, lon], { radius: 10, color: c.text, weight: 2, fillColor: color, fillOpacity: 1 })
        .bindPopup(box).addTo(layer);
    };
    for (const e of a.events) {
      const brake = e.kind === 'brake';
      pin(e.lat, e.lon, brake ? c.bad : c.wheel,
        `<strong>${brake ? 'Hamowanie' : 'Przyspieszenie'}</strong> ${fmtClock(a.ride, e.tStart)}<br>${fmt(e.vStart, 0)}→${fmt(e.vEnd, 0)} km/h, ${fmt(e.meanG, 2)} g`,
        () => bus.emit('open-event', { id: e.id }), 'Szczegóły');
    }
    for (const im of a.impacts) {
      pin(im.lat, im.lon, c.warn,
        `<strong>Uderzenie (kandydat)</strong> ${fmtClock(a.ride, im.t)}<br>${fmt(im.speedReal, 0)} km/h, poziom ${im.level}`,
        () => bus.emit('focus-time', { t: im.t, span: 20 }), 'Przebieg');
    }
    legend.replaceChildren(
      ...[['ok', 'zapas OK'], ['warn', 'zapas niski'], ['bad', 'zapas krytyczny']].map(([k, t]) => h('span', {}, h('i', { class: 'ln', style: `background:${col[k]}` }), t)),
      h('span', {}, h('i', { style: `background:${c.bad}` }), 'hamowanie'),
      h('span', {}, h('i', { style: `background:${c.wheel}` }), 'przyspieszenie'),
      h('span', {}, h('i', { style: `background:${c.warn}` }), 'uderzenie'));
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });
  }

  whenVisible(root, () => { visible = true; build(); });
  new ResizeObserver(() => { if (map) { map.invalidateSize(); } }).observe(mapEl);
  store.on('analysis', build);
  store.on('settings', () => { if (map) build(); });
  onThemeChange(() => { if (map) build(); });
  window.addEventListener('online', syncTiles);
  window.addEventListener('offline', syncTiles);
}
