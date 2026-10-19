// Alarm bit definitions, alarm episodes and user markers (bit 128).
export const ALARM_BITS = Object.freeze([
  { bit: 1, key: 'speed3', label: 'Alarm prędkości 3', isAlarm: true },
  { bit: 2, key: 'speed2', label: 'Alarm prędkości 2', isAlarm: true },
  { bit: 4, key: 'speed1', label: 'Alarm prędkości 1', isAlarm: true },
  { bit: 8, key: 'peakCurrent', label: 'Szczytowy prąd', isAlarm: true },
  { bit: 16, key: 'sustainedCurrent', label: 'Długotrwały wysoki prąd', isAlarm: true },
  { bit: 32, key: 'temperature', label: 'Temperatura', isAlarm: true },
  { bit: 64, key: 'overvoltage', label: 'Przepięcie', isAlarm: true },
  { bit: 128, key: 'marker', label: 'Znacznik (przycisk)', isAlarm: false },
  { bit: 256, key: 'safetyMargin', label: 'Margines bezpieczeństwa', isAlarm: true },
  { bit: 512, key: 'speedLimit', label: 'Limit prędkości', isAlarm: true },
  { bit: 1024, key: 'undervoltage', label: 'Niskie napięcie', isAlarm: true },
].map(Object.freeze));

export const MARKER_BIT = 128;
export const MARKER_HALF_WINDOW = 10; // s

/** Contiguous runs of wheel samples with each alarm bit set (marker bit excluded), chronological. */
export function detectAlarmEpisodes(wheel) {
  const out = [];
  for (const def of ALARM_BITS) {
    if (!def.isAlarm) continue;
    let start = -1;
    for (let i = 0; i <= wheel.n; i++) {
      const on = i < wheel.n && (wheel.alarm[i] & def.bit) !== 0;
      if (on && start < 0) start = i;
      else if (!on && start >= 0) {
        out.push({ bit: def.bit, key: def.key, label: def.label, tStart: wheel.t[start], tEnd: wheel.t[i - 1],
          i0: start, i1: i - 1, samples: i - start });
        start = -1;
      }
    }
  }
  out.sort((a, b) => a.tStart - b.tStart || a.bit - b.bit);
  return out;
}

function lowerBound(t, x) {
  let lo = 0, hi = t.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

/** One marker per run of consecutive marker samples; window ±10 s around its first sample. */
export function detectMarkers(wheel) {
  const out = [];
  for (let i = 0; i < wheel.n; i++) {
    if (!(wheel.alarm[i] & MARKER_BIT)) continue;
    if (i > 0 && (wheel.alarm[i - 1] & MARKER_BIT)) continue;
    const t = wheel.t[i];
    const tStart = t - MARKER_HALF_WINDOW, tEnd = t + MARKER_HALF_WINDOW;
    const i0 = lowerBound(wheel.t, tStart);
    const i1 = Math.max(i0, lowerBound(wheel.t, tEnd + 1e-9) - 1);
    out.push({ t, tStart, tEnd, i0, i1 });
  }
  return out;
}

export function alarmCounts(wheel, episodes) {
  return ALARM_BITS.map((def) => {
    let samples = 0;
    for (let i = 0; i < wheel.n; i++) if (wheel.alarm[i] & def.bit) samples++;
    const episodesN = def.isAlarm
      ? episodes.filter((e) => e.bit === def.bit).length
      : detectMarkers(wheel).length;
    return { bit: def.bit, key: def.key, label: def.label, episodes: episodesN, samples };
  });
}
