// Public API of the analysis core (see docs/CONTRACT.md). Pure, no DOM, no dependencies.
import { DEFAULT_ANALYSIS_SETTINGS } from './defaults.mjs';
import { createIngester, prepareRideFromRows } from './ingest.mjs';
import { calibrate } from './calib.mjs';
import { computeDerived, accelStencil } from './kinematics.mjs';
import { detectEvents } from './events.mjs';
import {
  fitMarginModel, fitBrakeModel, fitBatteryModel, batteryFlags, batteryModelOk, predictTiltbackSpeed, iphForG, R_FALLBACK,
} from './models.mjs';
import { buildCaveats } from './caveats.mjs';
import { parseTimestamp } from './time.mjs';
import { detectImpacts } from './impacts.mjs';
import { ALARM_BITS, detectAlarmEpisodes, detectMarkers, alarmCounts } from './alarms.mjs';
import { buildSummary } from './summary.mjs';

export { createIngester, prepareRideFromRows, predictTiltbackSpeed, iphForG, ALARM_BITS };

// Quality gates: below these the model is not shown (null + warning).
const MARGIN_MIN_N = 200, MARGIN_MIN_R2 = 0.6;
const BRAKE_MIN_N = 100, BRAKE_MIN_R2 = 0.4;
const fmt = (x, d) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');

export function analyzeRide(ride, settings) {
  const s = { ...DEFAULT_ANALYSIS_SETTINGS, ...(settings || {}) };
  for (const k of Object.keys(DEFAULT_ANALYSIS_SETTINGS)) if (s[k] === undefined) s[k] = DEFAULT_ANALYSIS_SETTINGS[k];
  const warnings = [];
  const w = ride.wheel;

  const cal = calibrate(ride, s);
  if (cal.warning) warnings.push(cal.warning);
  const stencil = accelStencil(w.t);
  const derived = computeDerived(w, cal.k, stencil);
  const ts = ride.startIso ? parseTimestamp(ride.startIso) : null;
  if (ts && !ts.hasZone) warnings.push('Znaczniki czasu bez strefy czasowej — przyjęto UTC; godziny mogą być przesunięte.');

  const rMeta = ride.meta && isFinite(ride.meta.batteryCircuitResistance) && ride.meta.batteryCircuitResistance > 0
    ? ride.meta.batteryCircuitResistance : null;
  if (rMeta === null) warnings.push(`Brak oporu obwodu baterii w logu — przyjęto ${String(R_FALLBACK).replace('.', ',')} Ω.`);
  const rInfo = { r: rMeta ?? R_FALLBACK };

  const events = detectEvents(ride, derived, s);

  let marginModel = fitMarginModel(ride, s, cal.k, rInfo);
  if (!marginModel) warnings.push('Za mało danych do modelu marginesu bezpieczeństwa.');
  else if (!(marginModel.n >= MARGIN_MIN_N && marginModel.r2 >= MARGIN_MIN_R2)) {
    warnings.push(`Model marginesu ukryty: za mało danych lub słabe dopasowanie (n = ${marginModel.n}, r² = ${fmt(marginModel.r2, 2)}).`);
    marginModel = null;
  }
  let brakeModel = fitBrakeModel(ride, derived, stencil);
  if (!brakeModel) warnings.push('Za mało danych do modelu siły hamowania.');
  else if (!(brakeModel.n >= BRAKE_MIN_N && brakeModel.r2 >= BRAKE_MIN_R2)) {
    warnings.push(`Model hamowania ukryty: za mało danych lub słabe dopasowanie (n = ${brakeModel.n}, r² = ${fmt(brakeModel.r2, 2)}).`);
    brakeModel = null;
  }
  let batteryModel = fitBatteryModel(ride, rMeta);
  if (!batteryModel) warnings.push('Za mało danych do modelu baterii.');
  else if (!batteryModelOk(batteryModel)) {
    warnings.push(`Model oporu baterii odrzucony (R = ${fmt(batteryModel.r, 3)} Ω, rozrzut ${fmt(batteryModel.residSd, 2)} V).`);
    batteryModel = null;
  }

  const impacts = detectImpacts(ride, derived, s);
  const alarms = detectAlarmEpisodes(w);
  const markers = detectMarkers(w);
  const summary = buildSummary(ride, derived, events, alarmCounts(w, alarms), markers, cal.k);
  const flags = batteryFlags(ride, batteryModel, summary, events);
  const caveats = buildCaveats(marginModel, brakeModel, summary, s);

  return {
    version: 1,
    settingsUsed: s,
    ride,
    calib: { k: cal.k, n: cal.n, auto: cal.auto },
    derived,
    events,
    marginModel,
    brakeModel,
    batteryModel,
    battery: { flags },
    impacts,
    alarms,
    markers,
    summary,
    warnings,
    caveats,
  };
}

/** JSON text; NaN/±Infinity become null so the result always round-trips through JSON.parse. */
export function serializeAnalysis(a) {
  return JSON.stringify(a, (key, value) => (typeof value === 'number' && !Number.isFinite(value) ? null : value));
}
