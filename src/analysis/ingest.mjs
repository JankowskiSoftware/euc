// Streaming ingestion of EUC World CSV rows into a deduplicated Ride (see docs/CONTRACT.md).
import { parseTimestamp } from './time.mjs';

const WHEEL_KEY_COLS = ['speed', 'voltage', 'current', 'current_phase', 'safety_margin', 'tilt', 'roll'];

// WheelSeries field -> CSV column (values filled from the first duplicate that has them)
const WHEEL_FIELDS = [
  ['speed', 'speed'], ['voltage', 'voltage'], ['current', 'current'], ['currentPhase', 'current_phase'],
  ['power', 'power'], ['safetyMargin', 'safety_margin'], ['tilt', 'tilt'], ['roll', 'roll'],
  ['battery', 'battery'], ['temp', 'temp'], ['tempBatt', 'temp_batt'], ['tempCpu', 'temp_cpu'],
  ['tempImu', 'temp_imu'], ['distance', 'distance'], ['energyConsumed', 'energy_consumed'],
  ['accelCol', 'acceleration'],
];

const GPS_FIELDS = [
  ['lat', 'gps_lat'], ['lon', 'gps_lon'], ['speed', 'gps_speed'], ['alt', 'gps_alt'],
  ['bearing', 'gps_bearing'], ['acc', 'gps_acc'], ['distance', 'gps_distance'],
];

const LAST_FIELDS = [
  ['distanceKm', 'distance'], ['gpsDistanceKm', 'gps_distance'], ['energyWh', 'energy_consumed'],
  ['durationS', 'duration'], ['ridingS', 'duration_riding'], ['speedMaxCol', 'speed_max'],
];

function toNum(s) {
  if (s === undefined || s === null || s === '') return NaN;
  const v = +s;
  return v === v ? v : NaN;
}

function emptyMeta() {
  return { raw: {}, make: null, model: null, firmware: null, batteryCircuitResistance: null, phone: null, appVersion: null };
}

function finishMeta(raw) {
  const m = emptyMeta();
  m.raw = raw;
  const g = (k) => (raw[k] !== undefined && raw[k] !== '' ? raw[k] : null);
  m.make = g('euc.make');
  m.model = g('euc.model');
  m.firmware = g('euc.firmware');
  const r = parseFloat(g('euc.batteryCircuitResistance'));
  m.batteryCircuitResistance = Number.isFinite(r) && r > 0 ? r : null;
  m.phone = g('info.model');
  m.appVersion = g('info.appVersionName');
  return m;
}

/**
 * Create a streaming ingester. pushRows may be called any number of times with consecutive
 * chunks of data rows (header excluded); finish() returns the Ride.
 */
export function createIngester(header) {
  const col = {};
  header.forEach((h, i) => { col[String(h).trim()] = i; });
  const ix = (name) => (col[name] === undefined ? -1 : col[name]);
  const iDt = ix('datetime'), iAlarm = ix('alarm'), iExtra = ix('extra'), iGpsDt = ix('gps_datetime');
  const keyIx = WHEEL_KEY_COLS.map(ix).filter((i) => i >= 0);
  const wFields = WHEEL_FIELDS.map(([f, c]) => [f, ix(c)]);
  const gFields = GPS_FIELDS.map(([f, c]) => [f, ix(c)]);
  const lFields = LAST_FIELDS.map(([f, c]) => [f, ix(c)]);
  const iLat = ix('gps_lat'), iLon = ix('gps_lon');

  const wheel = { n: 0, t: [], row: [], alarm: [], lat: [], lon: [] };
  for (const [f] of wFields) wheel[f] = [];
  const gps = { n: 0, t: [] };
  for (const [f] of gFields) gps[f] = [];
  const last = {};
  for (const [f] of lFields) last[f] = NaN;
  const metaRaw = {};
  const alarmCounts = {};

  let rowIdx = 0;
  let startMs = NaN, tzOffsetMin = 0, startIso = '';
  let prevKey = null;
  let prevGpsDt = null;
  let curLat = NaN, curLon = NaN;
  let lastTs = '', lastMs = NaN;

  function rowTime(ts) {
    if (ts === lastTs) return lastMs;
    const p = parseTimestamp(ts);
    lastTs = ts;
    lastMs = p ? p.ms : NaN;
    if (p && !(startMs === startMs)) { startMs = p.ms; tzOffsetMin = p.tzOffsetMin; startIso = ts; }
    return lastMs;
  }

  function pushRow(r) {
    const idx = rowIdx++;
    const ms = iDt >= 0 ? rowTime(r[iDt]) : NaN;
    const t = (ms - startMs) / 1000;

    if (iExtra >= 0) {
      const ex = r[iExtra];
      if (ex) {
        const eq = ex.indexOf('=');
        if (eq > 0) metaRaw[ex.slice(0, eq).trim()] = ex.slice(eq + 1).trim();
      }
    }
    const alarm = iAlarm >= 0 ? (toNum(r[iAlarm]) | 0) : 0;
    if (alarm) alarmCounts[alarm] = (alarmCounts[alarm] || 0) + 1;

    for (const [f, i] of lFields) {
      if (i >= 0) { const v = toNum(r[i]); if (v === v) last[f] = v; }
    }

    // GPS
    const gdt = iGpsDt >= 0 ? r[iGpsDt] : '';
    if (gdt && gdt !== prevGpsDt) {
      prevGpsDt = gdt;
      gps.t.push(t);
      for (const [f, i] of gFields) gps[f].push(i >= 0 ? toNum(r[i]) : NaN);
      gps.n++;
    }
    if (iLat >= 0) {
      const la = toNum(r[iLat]), lo = toNum(r[iLon]);
      if (la === la && lo === lo && !(la === 0 && lo === 0)) { curLat = la; curLon = lo; }
    }

    // Wheel
    let key = '';
    let any = false;
    for (let k = 0; k < keyIx.length; k++) {
      const s = r[keyIx[k]];
      if (s !== undefined && s !== '') any = true;
      key += (s === undefined ? '' : s) + '|';
    }
    if (!any || !(t === t)) return;
    if (key !== prevKey) {
      prevKey = key;
      wheel.t.push(t);
      wheel.row.push(idx);
      wheel.alarm.push(alarm);
      wheel.lat.push(curLat);
      wheel.lon.push(curLon);
      for (const [f, i] of wFields) wheel[f].push(i >= 0 ? toNum(r[i]) : NaN);
      wheel.n++;
    } else {
      const j = wheel.n - 1;
      wheel.alarm[j] |= alarm;
      for (const [f, i] of wFields) {
        const arr = wheel[f];
        if (i >= 0 && !(arr[j] === arr[j])) arr[j] = toNum(r[i]);
      }
      if (!(wheel.lat[j] === wheel.lat[j])) { wheel.lat[j] = curLat; wheel.lon[j] = curLon; }
    }
  }

  return {
    pushRows(rows) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r && r.length > 1) pushRow(r);
      }
    },
    finish() {
      return {
        meta: finishMeta(metaRaw),
        startIso, startMs, tzOffsetMin,
        rawRowCount: rowIdx,
        rawAlarmValueCounts: alarmCounts,
        wheel, gps, last,
      };
    },
  };
}

export function prepareRideFromRows(header, rows) {
  const ing = createIngester(header);
  ing.pushRows(rows);
  return ing.finish();
}
