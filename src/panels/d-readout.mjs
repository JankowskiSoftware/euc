// Fixed readout box for panel 3: values of the wheel sample nearest to a given time.
import { fmt, fmtSigned, fmtClock, fmtElapsed } from '../app/format.mjs';
import { ALARM_BITS } from '../analysis/index.mjs';
import { h } from './d-common.mjs';

export function nearestIndex(t, x) {
  let lo = 0, hi = t.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (t[mid] < x) lo = mid + 1; else hi = mid; }
  return lo > 0 && Math.abs(t[lo - 1] - x) <= Math.abs(t[lo] - x) ? lo - 1 : lo;
}

export function createReadout(root) {
  const box = h('div', 'd-readout');
  box.setAttribute('aria-live', 'polite');
  const hint = 'Dotknij wykresu, aby zobaczyć wartości w wybranej chwili.';
  box.append(h('p', 'empty', hint));
  root.append(box);
  return {
    clear() { box.replaceChildren(h('p', 'empty', hint)); },
    show(analysis, i) {
      const w = analysis.ride.wheel, d = analysis.derived;
      const labels = ALARM_BITS.filter((b) => (w.alarm[i] & b.bit)).map((b) => b.label);
      const rows = [
        ['Czas', `${fmtClock(analysis.ride, w.t[i], true)} (${fmtElapsed(w.t[i])})`],
        ['Prędkość koła', fmt(w.speed[i], 1, 'km/h')],
        ['Prędkość rzecz.', fmt(d.speedReal[i], 1, 'km/h')],
        ['Zapas', fmt(w.safetyMargin[i], 1, '%')],
        ['PWM', fmt(d.pwm[i], 1, '%')],
        ['Prąd fazowy', fmt(w.currentPhase[i], 1, 'A')],
        ['Prąd baterii', fmt(w.current[i], 1, 'A')],
        ['Napięcie', fmt(w.voltage[i], 1, 'V')],
        ['Przysp.', fmtSigned(d.accelG[i], 2, 'g')],
        ['Pochylenie', fmt(w.tilt[i], 1, '°')],
        ['Przechył', fmt(w.roll[i], 1, '°')],
        ['Bateria', fmt(w.battery[i], 0, '%')],
      ];
      const dl = h('dl', 'd-readout-grid');
      for (const [k, v] of rows) { const g = h('div'); g.append(h('dt', 'muted small', k), h('dd', 'num', v)); dl.append(g); }
      const al = h('p', labels.length ? 'd-readout-alarm status-bad' : 'muted small', labels.length ? `Alarmy: ${labels.join(', ')}` : 'Brak alarmów');
      box.replaceChildren(dl, al);
    },
  };
}
