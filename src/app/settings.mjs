import { DEFAULT_ANALYSIS_SETTINGS } from '../analysis/defaults.mjs';

const KEY = 'euc-dashboard.settings.v1';

// Analysis settings plus display-only thresholds for the summary tiles.
export const DEFAULT_SETTINGS = Object.freeze({
  ...DEFAULT_ANALYSIS_SETTINGS,
  marginOk: 45,          // safety margin > 45 green
  marginBad: 35,         // < 35 red, between yellow
  voltageWarn: 122.4,    // 3.40 V/cell x 36
  voltageBad: 118.8,     // 3.30 V/cell x 36
  tempWarn: 55,          // deg C, any wheel temperature
  tempBad: 65,
  batteryWarn: 30,       // % at ride end
  batteryBad: 15,
});

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw);
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in saved) out[k] = saved[k];
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); return true; } catch { return false; }
}
