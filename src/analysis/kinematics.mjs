// Real speed, acceleration (central difference) and PWM per wheel sample.
export const G = 9.81;
export const MAX_NEIGHBOUR_GAP = 2.0; // s; wider spacing is treated as a data gap

/**
 * Acceleration from real speed: central difference (v[i+1]-v[i-1])/(t[i+1]-t[i-1]); one-sided when
 * one neighbour is beyond a gap, NaN when both are. Values are lower bounds: wheel data arrives
 * only every ~0.6 s, so short peaks are smoothed out.
 */
export function computeDerived(wheel, k) {
  const n = wheel.n, t = wheel.t, sp = wheel.speed, sm = wheel.safetyMargin;
  const speedReal = new Array(n), accel = new Array(n), accelG = new Array(n), pwm = new Array(n);
  for (let i = 0; i < n; i++) {
    speedReal[i] = sp[i] / k;
    pwm[i] = 100 - sm[i];
  }
  for (let i = 0; i < n; i++) {
    const okL = i > 0 && t[i] - t[i - 1] <= MAX_NEIGHBOUR_GAP && t[i] > t[i - 1];
    const okR = i < n - 1 && t[i + 1] - t[i] <= MAX_NEIGHBOUR_GAP && t[i + 1] > t[i];
    let a = NaN;
    if (okL && okR) a = (speedReal[i + 1] - speedReal[i - 1]) / 3.6 / (t[i + 1] - t[i - 1]);
    else if (okR) a = (speedReal[i + 1] - speedReal[i]) / 3.6 / (t[i + 1] - t[i]);
    else if (okL) a = (speedReal[i] - speedReal[i - 1]) / 3.6 / (t[i] - t[i - 1]);
    accel[i] = a;
    accelG[i] = a / G;
  }
  return { speedReal, accel, accelG, pwm };
}
