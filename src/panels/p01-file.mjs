import { fmtClock } from '../app/format.mjs';
// Panel 1: file picker, sample button, progress, compact row once loaded.
export function mount(root, ctx) {
  const { store } = ctx;
  const hdr = document.getElementById('app-header');
  if (hdr) mountHeader(hdr, store);
  root.innerHTML = `
    <div class="file-full">
      <label class="btn file-pick" for="file-input">Wybierz plik CSV z EUC World</label>
      <input id="file-input" class="file-input" type="file" accept=".csv,text/csv,text/plain">
      <button type="button" class="btn secondary file-sample">Przykład</button>
      <div class="progress" hidden><div class="progress-bar"></div><span class="progress-text num">0%</span></div>
      <p class="file-error status-bad" role="alert" hidden></p>
      <p class="note">Wszystko liczy się lokalnie w telefonie. Plik nie jest nigdzie wysyłany.</p>
    </div>
    <div class="file-compact" hidden>
      <span class="file-name"></span>
      <label class="btn secondary" for="file-input">Zmień plik</label>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const input = $('.file-input'), full = $('.file-full'), compact = $('.file-compact');
  const prog = $('.progress'), bar = $('.progress-bar'), txt = $('.progress-text'), err = $('.file-error');
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (f) ctx.loadFile(f);
    input.value = '';
  });
  if (globalThis.__EUC_NO_SAMPLE__) $('.file-sample').hidden = true;
  $('.file-sample').addEventListener('click', () => ctx.loadSample());

  function render() {
    const s = store.get();
    const busy = s.status === 'parsing' || s.status === 'analysing';
    const loaded = !!s.analysis && !busy && !s.error;
    full.hidden = loaded;
    compact.hidden = !loaded;
    $('.file-name').textContent = s.fileName || '';
    prog.hidden = !busy;
    const pct = Math.round((s.status === 'analysing' ? 1 : s.progress) * 100);
    bar.style.width = pct + '%';
    txt.textContent = s.status === 'analysing' ? 'Analiza…' : pct + '%';
    err.hidden = !s.error;
    err.textContent = s.error || '';
    root.querySelectorAll('button,input').forEach((e) => { e.disabled = busy; });
  }
  for (const k of ['status', 'progress', 'error', 'fileName', 'analysis']) store.on(k, render);
  render();
}

// Sticky header content (owned by the same agent): file/ride date, wheel, status.
export function mountHeader(header, store) {
  header.innerHTML = `<div class="hdr-main"><strong class="hdr-title">EUC Lynx S</strong><span class="hdr-sub small muted"></span></div>
    <span class="chip hdr-status status-none"></span>`;
  const title = header.querySelector('.hdr-title'), sub = header.querySelector('.hdr-sub'), chip = header.querySelector('.hdr-status');
  const LABEL = { idle: ['Gotowy', 'none'], parsing: ['Wczytywanie…', 'none'], analysing: ['Analiza…', 'none'],
    ready: ['OK', 'ok'], error: ['Błąd', 'bad'] };
  function render() {
    const s = store.get(), r = s.ride;
    const parts = [];
    if (r && s.fileName) {
      const d = r.startIso ? r.startIso.slice(0, 10) : '';
      parts.push(`${d} ${fmtClock(r, 0)}`);
      const m = r.meta || {};
      const wheel = [m.make, m.model, m.firmware && `fw ${m.firmware}`].filter(Boolean).join(' ');
      if (wheel) parts.push(wheel);
    } else parts.push('Analiza logów EUC World');
    title.textContent = s.fileName || 'EUC Lynx S';
    sub.textContent = parts.join(' · ');
    const [t, k] = LABEL[s.status] || LABEL.idle;
    chip.textContent = s.status === 'parsing' ? `${Math.round(s.progress * 100)}%` : t;
    chip.className = `chip hdr-status status-${k}`;
  }
  for (const k of ['status', 'progress', 'ride', 'fileName']) store.on(k, render);
  render();
}
