// Panel 5: ranked list of braking / acceleration events, detail card, compare overlay.
import { fmt, fmtSigned, fmtClock, fmtElapsed } from '../app/format.mjs';
import { onThemeChange } from '../app/chartTheme.mjs';
import { h } from './e-util.mjs';
import { detailOption, compareOption, COMPARE_KEYS, initChart } from './e-eventchart.mjs';

const KIND = { brake: 'Hamowanie', accel: 'Przyspieszenie' };

export function mount(root, ctx) {
  const { store, bus } = ctx;
  const st = { filter: 'brake', compare: false, sel: new Set(), openId: null, withIph: false };
  let analysis = null, detailChart = null, cmpChart = null, pending = null;

  const bar = h('div', { class: 'e-bar' });
  const cmpBar = h('div', { class: 'e-bar' });
  const list = h('ul', { class: 'list e-events' });
  const cmpBox = h('div', { class: 'e-compare', hidden: true });
  const note = h('p', { class: 'note' }, 'Wartości przyspieszenia to dolne oszacowanie (próbkowanie co ~0,6 s).');
  root.append(bar, cmpBar, cmpBox, list, note);

  const seg = (label, val) => h('button', {
    type: 'button', class: 'btn secondary', 'aria-pressed': String(st.filter === val),
    onclick: () => { st.filter = val; st.openId = null; render(); },
  }, label);

  function visibleEvents() {
    const ev = analysis.events.filter((e) => st.filter === 'all' || e.kind === st.filter);
    return ev.slice().sort((a, b) => b.meanG - a.meanG);
  }

  function disposeCharts() {
    if (detailChart) { detailChart.dispose(); detailChart = null; }
  }

  function render() {
    disposeCharts();
    if (!analysis) return;
    bar.replaceChildren(
      h('div', { class: 'e-seg', role: 'group', 'aria-label': 'Filtr zdarzeń' },
        seg('Hamowania', 'brake'), seg('Przyspieszenia', 'accel'), seg('Wszystkie', 'all')),
      h('button', {
        type: 'button', class: 'btn secondary', 'aria-pressed': String(st.compare),
        onclick: () => { st.compare = !st.compare; if (!st.compare) st.sel.clear(); render(); },
      }, 'Porównaj'));
    const evs = visibleEvents();
    list.replaceChildren();
    if (!evs.length) list.append(h('li', { class: 'empty' }, 'Brak zdarzeń tego rodzaju.'));
    evs.forEach((e, k) => list.append(row(e, k + 1)));
    renderCompare();
    if (st.openId != null) {
      const li = list.querySelector(`li[data-id="${st.openId}"]`);
      if (li) openDetail(li, analysis.events.find((x) => x.id === st.openId));
    }
  }

  function row(e, rank) {
    const li = h('li', { 'data-id': e.id, class: 'e-row' });
    const main = h('button', { type: 'button', class: 'e-main', 'aria-expanded': String(st.openId === e.id), onclick: () => toggle(e.id) },
      h('span', { class: 'e-rank num' }, String(rank)),
      h('span', { class: 'e-body' },
        h('span', { class: 'e-l1' },
          h('strong', { class: e.kind === 'brake' ? 'e-brake' : 'e-accel' }, KIND[e.kind]), ' ',
          h('span', { class: 'num muted' }, fmtClock(analysis.ride, e.tStart))),
        h('span', { class: 'e-l2 num' }, `${fmt(e.vStart, 0)}→${fmt(e.vEnd, 0)} km/h · ${fmt(e.meanG, 2)} g · ${fmt(e.duration, 1)} s`),
        h('span', { class: 'e-l3 small muted' }, `szczyt co najmniej ${fmt(e.peakG, 2)} g`)));
    if (st.compare) {
      const cb = h('input', { type: 'checkbox', class: 'e-check', 'aria-label': `Porównaj zdarzenie ${e.id}`, onchange: (ev) => {
        if (ev.target.checked) st.sel.add(e.id); else st.sel.delete(e.id);
        renderCompare();
      } });
      cb.checked = st.sel.has(e.id);
      li.append(h('label', { class: 'e-cb' }, cb), main);
      li.classList.add('with-cb');
    } else li.append(main);
    return li;
  }

  function toggle(id) {
    st.openId = st.openId === id ? null : id;
    render();
    if (st.openId != null) list.querySelector(`li[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function kv(label, value) {
    return h('div', { class: 'e-kv' }, h('span', { class: 'muted' }, label), h('span', { class: 'num' }, value));
  }

  function openDetail(li, e) {
    const s = analysis.settingsUsed;
    const card = h('div', { class: 'e-detail' });
    const grid = h('div', { class: 'e-kvs' },
      kv('Rodzaj', KIND[e.kind]),
      kv('Początek', `${fmtClock(analysis.ride, e.tStart, true)} (${fmtElapsed(e.tStart)} od startu)`),
      kv('Czas trwania', fmt(e.duration, 1, 's')),
      kv('Prędkość rzecz.', `${fmt(e.vStart, 1)} → ${fmt(e.vEnd, 1, 'km/h')}`),
      kv('Prędkość koła', `${fmt(e.vStartWheel, 1)} → ${fmt(e.vEndWheel, 1, 'km/h')}`),
      kv('Średnie przysp.', fmt(e.meanG, 2, 'g')),
      kv('Szczyt', `co najmniej ${fmt(e.peakG, 2, 'g')}`),
      kv('Dystans', fmt(e.distanceM, 0, 'm')),
      kv('Szczytowy prąd fazowy', fmtSigned(e.peakIph, 0, 'A')),
      kv('Zapas bezp. min / maks', `${fmt(e.minMargin, 0)} / ${fmt(e.maxMargin, 0, '%')}`),
      kv('Prąd rekuperacji (szczyt)', e.peakRegenI == null ? '–' : fmt(e.peakRegenI, 0, 'A')),
      kv('Maks. napięcie', fmt(e.maxVoltage, 1, 'V')));
    card.append(grid);
    if (e.kind === 'brake' && e.stop) {
      const rt = s.reactionTime;
      card.append(h('div', { class: 'e-stop' },
        h('strong', {}, `Droga zatrzymania z ${fmt(e.vStart, 0)} km/h`),
        kv('Hamowanie', fmt(e.stop.brakingM, 1, 'm')),
        kv(`Reakcja (${fmt(rt, 1)} s)`, fmt(e.stop.reactionM, 1, 'm')),
        h('div', { class: 'e-kv e-total' }, h('strong', {}, 'Razem'), h('strong', { class: 'num' }, fmt(e.stop.totalM, 1, 'm')))));
    }
    const chartEl = h('div', { class: 'chart e-chart' });
    card.append(chartEl, h('button', { type: 'button', class: 'btn', onclick: () => bus.emit('focus-time', { t: e.tStart, span: 20 }) }, 'Pokaż na przebiegu'));
    li.append(card);
    detailChart = initChart(chartEl);
    detailChart.setOption(detailOption(analysis, e));
  }

  function renderCompare() {
    cmpBar.replaceChildren();
    if (cmpChart) { cmpChart.dispose(); cmpChart = null; }
    const evs = analysis.events.filter((e) => st.sel.has(e.id));
    cmpBox.hidden = !(st.compare && evs.length);
    cmpBox.replaceChildren();
    if (!st.compare) return;
    cmpBar.append(h('span', { class: 'note' }, evs.length ? `Wybrano: ${evs.length}` : 'Zaznacz zdarzenia na liście.'));
    if (!evs.length) return;
    const iphCb = h('input', { type: 'checkbox', onchange: (ev) => { st.withIph = ev.target.checked; renderCompare(); } });
    iphCb.checked = st.withIph;
    cmpBar.append(h('label', { class: 'e-iph' }, iphCb, ' z Iph'));
    const el = h('div', { class: 'chart e-chart' });
    cmpBox.append(el);
    cmpChart = initChart(el);
    cmpChart.setOption(compareOption(analysis, evs.slice(0, 8), st.withIph));
  }

  store.on('analysis', (a) => { analysis = a; st.openId = null; st.sel.clear(); render(); });
  onThemeChange(() => {
    if (!analysis) return;
    if (detailChart && st.openId != null) detailChart.setOption(detailOption(analysis, analysis.events.find((x) => x.id === st.openId)), true);
    if (cmpChart) renderCompare();
  });
  bus.on('open-event', ({ id }) => {
    if (!analysis) return;
    const ev = analysis.events.find((x) => x.id === id);
    if (!ev) return;
    st.filter = 'all'; st.compare = false; st.openId = id;
    render();
    const li = list.querySelector(`li[data-id="${id}"]`);
    (li || root).scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  void COMPARE_KEYS; void pending;
  if (store.get().analysis) { analysis = store.get().analysis; render(); }
}
