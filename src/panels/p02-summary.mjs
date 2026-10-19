// Panel 2: summary figure tiles.
import { fmt, fmtSigned, fmtElapsed, fmtClock, isNum, DASH } from '../app/format.mjs';

const CUE = { ok: 'OK', warn: 'UWAGA', bad: 'ALARM', none: '' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// lower-is-worse and higher-is-worse threshold helpers
const low = (v, warn, bad) => (!isNum(v) ? 'none' : v < bad ? 'bad' : v < warn ? 'warn' : 'ok');
const high = (v, warn, bad) => (!isNum(v) ? 'none' : v > bad ? 'bad' : v > warn ? 'warn' : 'ok');

function tile({ label, value, unit = '', sub = '', status = 'none', id = '', button = false }) {
  const tag = button ? 'button type="button"' : 'div';
  const end = button ? 'button' : 'div';
  return `<${tag} class="tile status-${status}"${id ? ` data-tile="${id}"` : ''}>
    <span class="tile-label">${esc(label)}${CUE[status] ? ` <b class="tile-cue">${CUE[status]}</b>` : ''}</span>
    <span class="tile-value"><span class="num tile-num">${esc(value)}</span>${unit ? `<span class="tile-unit">${esc(unit)}</span>` : ''}</span>
    <span class="tile-sub small">${sub}</span></${end}>`;
}

function build(a, st) {
  const s = a.summary, r = a.ride, ev = a.events;
  const clock = (t) => fmtClock(r, t);
  const brake = ev.find((e) => e.id === s.hardestBrakeId);
  const accel = ev.find((e) => e.id === s.hardestAccelId);
  const evSub = (e) => (e ? `szczyt co najmniej ${fmt(e.peakG, 2)} g<br>${clock(e.tStart)}, ${fmt(e.vStart, 0)} → ${fmt(e.vEnd, 0)} km/h` : '');
  const marginSt = !isNum(s.minMargin.value) ? 'none' : s.minMargin.value > st.marginOk ? 'ok' : s.minMargin.value < st.marginBad ? 'bad' : 'warn';
  const tmax = Math.max(...[s.tempMax.temp, s.tempMax.tempBatt, s.tempMax.tempCpu, s.tempMax.tempImu].filter(isNum));
  const tempSt = isNum(tmax) ? high(tmax, st.tempWarn, st.tempBad) : 'none';
  const batSt = low(s.batteryEnd, st.batteryWarn, st.batteryBad);
  const voltSt = low(s.voltageMin.value, st.voltageWarn, st.voltageBad);
  const BAD_KEYS = new Set(['safetyMargin', 'peakCurrent', 'undervoltage']);
  const alarms = s.alarmCounts.filter((x) => x.episodes > 0);
  const real = alarms.filter((x) => !['speed1', 'speed2', 'speed3', 'marker'].includes(x.key));
  const alarmSt = alarms.some((x) => BAD_KEYS.has(x.key)) ? 'bad' : real.length ? 'warn' : alarms.length ? 'ok' : 'ok';
  const alarmList = alarms.filter((x) => x.key !== 'marker');
  const k = a.calib.k;
  const t = [];
  t.push(tile({ label: 'Dystans (koło)', value: fmt(s.distanceWheelKm, 2), unit: 'km', sub: `GPS: ${fmt(s.distanceGpsKm, 2)} km` }));
  t.push(tile({ label: 'Czas jazdy', value: fmtElapsed(s.ridingS), sub: `cały log: ${fmtElapsed(s.durationS)}` }));
  t.push(tile({ label: 'Vmax (koło)', value: fmt(s.maxSpeedWheel.value, 1), unit: 'km/h',
    sub: `realna: ${fmt(s.maxSpeedReal.value, 1)} km/h<br>GPS: ${fmt(s.maxSpeedGps, 1)} km/h` }));
  t.push(tile({ label: 'Min. zapas', value: fmt(s.minMargin.value, 0), unit: '%', status: marginSt, id: 'margin', button: true,
    sub: `${clock(s.minMargin.t)}, ${fmt(s.minMargin.speed, 0)} km/h<br>dotknij: pokaż na wykresie` }));
  t.push(tile({ label: 'Najmocniejsze hamowanie', value: brake ? fmt(brake.meanG, 2) : DASH, unit: 'g', sub: evSub(brake) }));
  t.push(tile({ label: 'Najmocniejsze przyspieszenie', value: accel ? fmt(accel.meanG, 2) : DASH, unit: 'g', sub: evSub(accel) }));
  t.push(tile({ label: 'Prąd fazowy', value: fmt(s.iphMax.value, 0), unit: 'A', sub: `max; min: ${fmt(s.iphMin.value, 0)} A` }));
  t.push(tile({ label: 'Prąd baterii', value: fmt(s.ibMax.value, 0), unit: 'A', sub: `max; min (regeneracja): ${fmt(s.ibMin.value, 0)} A` }));
  t.push(tile({ label: 'Energia', value: fmt(s.energyWh, 0), unit: 'Wh', sub: `${fmt(s.whPerKm, 1)} Wh/km` }));
  t.push(tile({ label: 'Bateria', value: `${fmt(s.batteryStart, 0)} → ${fmt(s.batteryEnd, 0)}`, unit: '%', status: batSt,
    sub: `min. pod obciążeniem: ${fmt(s.batteryMin.value, 0)} %` }));
  t.push(tile({ label: 'Napięcie min.', value: fmt(s.voltageMin.value, 1), unit: 'V', status: voltSt,
    sub: `${clock(s.voltageMin.t)}; max ${fmt(s.voltageMax, 1)} V` }));
  t.push(tile({ label: 'Temperatura max', value: fmt(tmax, 0), unit: '°C', status: tempSt,
    sub: `płyta ${fmt(s.tempMax.temp, 0)}, bat. ${fmt(s.tempMax.tempBatt, 0)}, CPU ${fmt(s.tempMax.tempCpu, 0)}, IMU ${fmt(s.tempMax.tempImu, 0)}` }));
  t.push(tile({ label: 'Alarmy', value: String(alarmList.reduce((n, x) => n + x.episodes, 0)), status: alarmSt,
    sub: alarmList.length ? alarmList.map((x) => `${esc(x.label)}: ${x.episodes}`).join('<br>') : 'brak alarmów' }));
  t.push(tile({ label: 'Kalibracja prędkości k', value: fmt(k, 3), sub: isNum(k) && k > 0
    ? `${a.calib.auto ? 'auto' : 'ręcznie'}; licznik zawyża o ${fmt((k - 1) * 100, 1)} %` : '' }));
  t.push(tile({ label: 'Znaczniki', value: String(s.markerTimes.length), sub: 'przycisk w aplikacji' }));
  return t.join('');
}

export function mount(root, ctx) {
  const { store, bus } = ctx;
  function render() {
    const { analysis: a, settings } = store.get();
    if (!a) { root.innerHTML = ''; return; }
    const notes = (a.warnings || []).map((w) => `<li>${esc(w)}</li>`).join('');
    root.innerHTML = `<div class="tiles">${build(a, settings)}</div>${notes ? `<ul class="notes note">${notes}</ul>` : ''}`;
  }
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-tile="margin"]')) return;
    const a = store.get().analysis;
    if (a) bus.emit('focus-time', { t: a.summary.minMargin.t });
  });
  store.on('analysis', render);
  store.on('settings', render);
  render();
}
