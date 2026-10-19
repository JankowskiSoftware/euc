// Per-ride speedometer calibration: real speed = wheel speed / k.
import { median, isFiniteNum } from './linalg.mjs';

export const CALIB_MIN_GPS_SPEED = 15;   // km/h
export const CALIB_MAX_ACCEL = 1;        // |wheel acceleration column|
export const CALIB_MAX_GPS_ACC = 10;     // m, GPS accuracy
export const CALIB_MIN_SAMPLES = 20;

/** Linear interpolation of series y(t) at time tq; idx is a cursor object for monotone queries. */
function interp(t, y, tq, cur) {
  const n = t.length;
  while (cur.i < n - 2 && t[cur.i + 1] <= tq) cur.i++;
  const i = cur.i;
  if (tq < t[0] || tq > t[n - 1]) return NaN;
  const dt = t[i + 1] - t[i];
  if (!(dt > 0) || dt > 2.5) return tq - t[i] < 0.35 ? y[i] : NaN;
  return y[i] + ((y[i + 1] - y[i]) * (tq - t[i])) / dt;
}

/**
 * k = median(wheel speed / GPS speed) over GPS fixes with gps_speed > 15 km/h, |acceleration| < 1
 * and gps_acc <= 10 m; wheel values are interpolated at each GPS fix time.
 * settings.speedK (number) overrides. Returns { k, n, auto, warning }.
 */
export function calibrate(ride, settings) {
  const w = ride.wheel, g = ride.gps;
  const ratios = [];
  if (w.n >= 2 && g.n > 0) {
    const c1 = { i: 0 }, c2 = { i: 0 };
    for (let j = 0; j < g.n; j++) {
      const gs = g.speed[j];
      if (!(gs > CALIB_MIN_GPS_SPEED) || !(g.acc[j] <= CALIB_MAX_GPS_ACC)) continue;
      const ws = interp(w.t, w.speed, g.t[j], c1);
      const wa = interp(w.t, w.accelCol, g.t[j], c2);
      if (!isFiniteNum(ws) || !(Math.abs(wa) < CALIB_MAX_ACCEL)) continue;
      ratios.push(ws / gs);
    }
  }
  const manual = settings && isFiniteNum(settings.speedK) && settings.speedK > 0;
  if (manual) return { k: settings.speedK, n: ratios.length, auto: false, warning: 'Współczynnik k prędkościomierza z ustawień (ręczny).' };
  if (ratios.length < CALIB_MIN_SAMPLES) {
    return { k: 1, n: ratios.length, auto: true, warning: `Za mało danych GPS do kalibracji prędkościomierza (${ratios.length} próbek) — przyjęto k = 1; prędkości i opóźnienia mogą być zawyżone o ok. 5–10 % (na tym kole ok. 9 %).` };
  }
  return { k: median(ratios), n: ratios.length, auto: true, warning: null };
}
