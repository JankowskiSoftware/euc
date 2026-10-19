// Real speed, acceleration (wide-span difference) and PWM per wheel sample.
export const G = 9.81;
export const MAX_NEIGHBOUR_GAP = 2.0; // s; wider spacing is treated as a data gap
export const ACCEL_MIN_SPAN = 1.0;    // s; minimum time span of the acceleration stencil
export const ACCEL_MAX_SPAN = 2.5;    // s; the stencil never grows beyond this

/**
 * Stencil [lo[i], hi[i]] for each sample: widened symmetrically (i±j) until t[hi]−t[lo] ≥ 1.0 s,
 * never across a data gap and never wider than 2.5 s; one-sided at ride edges and gaps.
 * EUC World writes partial-update rows (25 % of intervals < 0.4 s, often with a stale speed), so a
 * plain central difference over neighbours can be dominated by timing jitter. lo === hi means no stencil.
 */
export function accelStencil(t) {
  const n = t.length;
  const lo = new Int32Array(n), hi = new Int32Array(n);
  const ok = (a, b) => t[b] - t[a] > 0 && t[b] - t[a] <= MAX_NEIGHBOUR_GAP;  // neighbours a < b
  for (let i = 0; i < n; i++) {
    let l = i, h = i;
    while (t[h] - t[l] < ACCEL_MIN_SPAN) {
      const canL = l > 0 && ok(l - 1, l) && t[h] - t[l - 1] <= ACCEL_MAX_SPAN;
      const canH = h < n - 1 && ok(h, h + 1) && t[h + 1] - t[l] <= ACCEL_MAX_SPAN;
      if (canL && canH && t[h + 1] - t[l - 1] <= ACCEL_MAX_SPAN) { l--; h++; }
      else if (canL && canH) { if (t[l] - t[l - 1] <= t[h + 1] - t[h]) l--; else h++; }
      else if (canL) l--;
      else if (canH) h++;
      else break;
    }
    lo[i] = l; hi[i] = h;
  }
  return { lo, hi };
}

/**
 * Acceleration from real speed: (v[hi]−v[lo])/(t[hi]−t[lo]) over the ≥ 1 s stencil (see accelStencil);
 * NaN when the sample is isolated. With ~0.6 s data, peaks are the steepest ~1–1,2 s stretch, an
 * approximation rather than a guaranteed minimum.
 */
export function computeDerived(wheel, k, stencil = accelStencil(wheel.t)) {
  const n = wheel.n, t = wheel.t, sp = wheel.speed, sm = wheel.safetyMargin;
  const { lo, hi } = stencil;
  const speedReal = new Array(n), accel = new Array(n), accelG = new Array(n), pwm = new Array(n);
  for (let i = 0; i < n; i++) {
    speedReal[i] = sp[i] / k;
    pwm[i] = 100 - sm[i];
  }
  for (let i = 0; i < n; i++) {
    const a = hi[i] > lo[i] ? (speedReal[hi[i]] - speedReal[lo[i]]) / 3.6 / (t[hi[i]] - t[lo[i]]) : NaN;
    accel[i] = a;
    accelG[i] = a / G;
  }
  return { speedReal, accel, accelG, pwm };
}
