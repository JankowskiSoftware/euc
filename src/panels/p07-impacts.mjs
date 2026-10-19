// Panel 7: impact candidates inferred from current spikes / tilt jumps.
import { fmt, fmtSigned, fmtClock, mapsUrl } from '../app/format.mjs';
import { h, LEVEL_CLASS, LEVEL_TEXT } from './e-util.mjs';

const REASON = { iph: 'skok prądu fazowego', tilt: 'skok pochylenia', margin: 'niski zapas bezpieczeństwa' };

export function mount(root, ctx) {
  const { store, bus } = ctx;
  function render(a) {
    root.replaceChildren();
    if (!a) return;
    root.append(h('p', { class: 'note' }, 'To kandydaci wywnioskowani ze skoków prądu i pochylenia – koło nie ma akcelerometru, więc nie jest to pewne wykrycie uderzenia.'));
    if (!a.impacts.length) { root.append(h('p', { class: 'empty' }, 'Nie wykryto kandydatów na uderzenia.')); return; }
    const ul = h('ul', { class: 'list' });
    for (const im of a.impacts) {
      const url = mapsUrl(im.lat, im.lon);
      ul.append(h('li', { class: 'e-imp' },
        h('div', { class: 'e-imp-head' },
          h('strong', { class: 'num' }, fmtClock(a.ride, im.t, true)),
          h('span', { class: `chip ${LEVEL_CLASS[im.level]}` }, `Poziom ${im.level}: ${LEVEL_TEXT[im.level]}`)),
        h('div', { class: 'e-imp-grid num' },
          h('span', {}, `Koło: ${fmt(im.speed, 0, 'km/h')}`),
          h('span', {}, `Rzecz.: ${fmt(im.speedReal, 0, 'km/h')}`),
          h('span', {}, `Iph: ${fmtSigned(im.iph, 0, 'A')}`),
          h('span', {}, `Odchyl.: ${fmtSigned(im.iphDev, 0, 'A')}`),
          h('span', {}, `Skok pochyl.: ${fmt(im.tiltJump, 1, '°')}`),
          h('span', {}, `Zapas: ${fmt(im.margin, 0, '%')}`)),
        h('div', { class: 'small' }, 'Powód: ' + (im.reasons.map((r) => REASON[r] || r).join(', ') || '–')),
        h('div', { class: 'e-imp-actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => bus.emit('focus-time', { t: im.t, span: 20 }) }, 'Przebieg'),
          url ? h('a', { class: 'btn secondary', href: url, target: '_blank', rel: 'noopener' }, 'Mapa') : null)));
    }
    root.append(ul);
  }
  store.on('analysis', render);
  render(store.get().analysis);
}
