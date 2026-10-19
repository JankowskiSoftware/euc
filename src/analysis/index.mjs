// Public API of the analysis core (see docs/CONTRACT.md). Pure, no DOM, no dependencies.
import { DEFAULT_ANALYSIS_SETTINGS } from './defaults.mjs';
import { createIngester, prepareRideFromRows } from './ingest.mjs';
import { calibrate } from './calib.mjs';
import { computeDerived } from './kinematics.mjs';
import { detectEvents } from './events.mjs';
import {
  fitMarginModel, fitBrakeModel, fitBatteryModel, batteryFlags, predictTiltbackSpeed, iphForG, R_FALLBACK,
} from './models.mjs';
import { detectImpacts } from './impacts.mjs';
import { ALARM_BITS, detectAlarmEpisodes, detectMarkers, alarmCounts } from './alarms.mjs';
import { buildSummary } from './summary.mjs';

export { createIngester, prepareRideFromRows, predictTiltbackSpeed, iphForG, ALARM_BITS };

const MIN_MODEL_SAMPLES = 50;

export function analyzeRide(ride, settings) {
  const s = { ...DEFAULT_ANALYSIS_SETTINGS, ...(settings || {}) };
  for (const k of Object.keys(DEFAULT_ANALYSIS_SETTINGS)) if (s[k] === undefined) s[k] = DEFAULT_ANALYSIS_SETTINGS[k];
  const warnings = [];
  const w = ride.wheel;

  const cal = calibrate(ride, s);
  if (cal.warning) warnings.push(cal.warning);
  const derived = computeDerived(w, cal.k);

  const rMeta = ride.meta && isFinite(ride.meta.batteryCircuitResistance) && ride.meta.batteryCircuitResistance > 0
    ? ride.meta.batteryCircuitResistance : null;
  if (rMeta === null) warnings.push(`Brak oporu obwodu baterii w logu — przyjęto ${String(R_FALLBACK).replace('.', ',')} Ω.`);
  const rInfo = { r: rMeta ?? R_FALLBACK };

  const events = detectEvents(ride, derived, s);

  let marginModel = fitMarginModel(ride, s, cal.k, rInfo);
  if (marginModel && marginModel.n < MIN_MODEL_SAMPLES) {
    warnings.push(`Mało danych do modelu marginesu (${marginModel.n} próbek).`);
  }
  if (!marginModel) warnings.push('Za mało danych do modelu marginesu bezpieczeństwa.');
  let brakeModel = fitBrakeModel(ride, derived);
  if (brakeModel && brakeModel.n < MIN_MODEL_SAMPLES) warnings.push(`Mało danych do modelu hamowania (${brakeModel.n} próbek).`);
  if (!brakeModel) warnings.push('Za mało danych do modelu siły hamowania.');
  const batteryModel = fitBatteryModel(ride, rMeta);
  if (!batteryModel) warnings.push('Za mało danych do modelu baterii.');

  const impacts = detectImpacts(ride, derived, s);
  const alarms = detectAlarmEpisodes(w);
  const markers = detectMarkers(w);
  const summary = buildSummary(ride, derived, events, alarmCounts(w, alarms), markers);
  const flags = batteryFlags(ride, batteryModel, summary);

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
  };
}

/** JSON text; NaN/±Infinity become null so the result always round-trips through JSON.parse. */
export function serializeAnalysis(a) {
  return JSON.stringify(a, (key, value) => (typeof value === 'number' && !Number.isFinite(value) ? null : value));
}
