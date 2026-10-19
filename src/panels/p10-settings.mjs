// Panel 10: settings form.
import { DEFAULT_SETTINGS, saveSettings } from '../app/settings.mjs';

// key, label, unit, help, [min, max]
const FIELDS = [
  ['tiltbackPwm', 'Próg tiltbacku (PWM)', '%', 'PWM, przy którym koło odchyla siodełko.', [30, 100]],
  ['marginOk', 'Zapas: zielony powyżej', '%', 'Zapas bezpieczeństwa powyżej tej wartości = OK.', [0, 100]],
  ['marginBad', 'Zapas: czerwony poniżej', '%', 'Zapas poniżej tej wartości = alarm.', [0, 100]],
  ['eventG', 'Próg zdarzenia', 'g', 'Hamowanie/przyspieszenie zaczyna się od tego przeciążenia.', [0.02, 1]],
  ['eventPeakG', 'Szczyt zdarzenia', 'g', 'Zdarzenie musi mieć próbkę co najmniej tak mocną.', [0.02, 1.5]],
  ['reactionTime', 'Czas reakcji', 's', 'Dodawany do drogi hamowania.', [0, 5]],
  ['impactIphDev', 'Uderzenie: skok prądu', 'A', 'Odchylenie prądu fazowego od mediany.', [5, 300]],
  ['impactTiltJump', 'Uderzenie: skok nachylenia', '°', 'Zmiana nachylenia na próbkę.', [0.1, 20]],
  ['curveIph', 'Prąd krzywych modelu', 'A', 'Prąd fazowy dla krzywych w panelu zapasu.', [0, 200]],
  ['voltageWarn', 'Napięcie: ostrzeżenie', 'V', 'Poniżej = UWAGA.', [50, 200]],
  ['voltageBad', 'Napięcie: alarm', 'V', 'Poniżej = ALARM.', [50, 200]],
  ['tempWarn', 'Temperatura: ostrzeżenie', '°C', 'Powyżej = UWAGA.', [0, 150]],
  ['tempBad', 'Temperatura: alarm', '°C', 'Powyżej = ALARM.', [0, 150]],
  ['batteryWarn', 'Bateria na końcu: ostrzeżenie', '%', 'Poniżej = UWAGA.', [0, 100]],
  ['batteryBad', 'Bateria na końcu: alarm', '%', 'Poniżej = ALARM.', [0, 100]],
  ['speedK', 'Kalibracja prędkości k', '', 'Puste = automatycznie. Licznik / prędkość realna.', [0.5, 2]],
];

const parse = (v) => Number(String(v).trim().replace(',', '.'));

export function mount(root, ctx) {
  const { store } = ctx;
  root.innerHTML = `<form class="settings-form" novalidate>
    ${FIELDS.map(([k, label, unit, help]) => `<div class="field">
      <label for="set-${k}">${label}</label>
      <div class="field-row"><input id="set-${k}" name="${k}" inputmode="decimal" autocomplete="off"
        ${k === 'speedK' ? 'placeholder="auto"' : ''}><span class="unit">${unit}</span></div>
      <span class="note" id="help-${k}">${help}</span><span class="field-err status-bad" hidden></span></div>`).join('')}
    <div class="settings-actions">
      <button type="submit" class="btn">Zastosuj</button>
      <button type="button" class="btn secondary" data-reset>Przywróć domyślne</button>
    </div>
    <p class="note settings-msg" role="status"></p></form>`;
  const form = root.querySelector('form'), msg = root.querySelector('.settings-msg');

  function fill(s) {
    for (const [k] of FIELDS) {
      const v = s[k];
      form.elements[k].value = v == null ? '' : String(v).replace('.', ',');
      form.elements[k].setAttribute('aria-describedby', `help-${k}`);
    }
  }
  function collect() {
    const out = { ...store.get().settings };
    let ok = true;
    for (const [k, , , , [lo, hi]] of FIELDS) {
      const el = form.elements[k], errEl = el.closest('.field').querySelector('.field-err');
      const raw = el.value.trim();
      errEl.hidden = true;
      if (k === 'speedK' && raw === '') { out[k] = null; continue; }
      const n = parse(raw);
      if (raw === '' || !Number.isFinite(n) || n < lo || n > hi) {
        errEl.hidden = false; errEl.textContent = `Podaj liczbę od ${String(lo).replace('.', ',')} do ${String(hi).replace('.', ',')}.`;
        ok = false;
      } else out[k] = n;
    }
    if (ok && out.marginBad > out.marginOk) { ok = false; msg.textContent = 'Próg czerwony zapasu musi być niższy niż zielony.'; }
    else if (ok && out.voltageBad > out.voltageWarn) { ok = false; msg.textContent = 'Próg alarmu napięcia musi być niższy niż ostrzeżenia.'; }
    else if (ok && out.tempBad < out.tempWarn) { ok = false; msg.textContent = 'Próg alarmu temperatury musi być wyższy niż ostrzeżenia.'; }
    else if (ok && out.batteryBad > out.batteryWarn) { ok = false; msg.textContent = 'Próg alarmu baterii musi być niższy niż ostrzeżenia.'; }
    return ok ? out : null;
  }
  function apply(s) {
    const saved = saveSettings(s);
    store.set({ settings: s });
    fill(s);
    msg.textContent = saved ? 'Zastosowano.' : 'Zastosowano, ale nie udało się zapisać ustawień w przeglądarce.';
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    msg.textContent = '';
    const s = collect();
    if (s) apply(s);
  });
  root.querySelector('[data-reset]').addEventListener('click', () => { msg.textContent = ''; apply({ ...DEFAULT_SETTINGS }); });
  fill(store.get().settings);
}
