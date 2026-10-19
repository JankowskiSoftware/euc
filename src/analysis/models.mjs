// Regression models: safety margin (PWM), braking force per phase amp, battery internal resistance.
import { createLeastSquares, median, isFiniteNum } from './linalg.mjs';
import { G } from './kinematics.mjs';

export const R_FALLBACK = 0.17;            // ohm, Lynx S circuit resistance when meta lacks it
export const V_FULL = 151.2;               // V, 36S full
export const V_LOW = 126;                  // V, reference low-ish pack voltage
export const PRED_IPH = [10, 40, 80];      // A
export const MARGIN_MIN_SPEED = 5;         // km/h wheel
export const BRAKE_MIN_SPEED = 15;         // km/h wheel
export const BRAKE_VREF = 30;              // km/h real
export const BRAKE_G = [0.3, 0.4, 0.5];
export const CURVE_MAX_SPEED = 90;         // km/h wheel

/**
 * Wheel speed (km/h) at which PWM reaches pwmTarget for resting voltage vRest and phase current iph.
 * Sagged voltage V = vRest − R·Ib with Ib ≈ iph·PWM/100 (PWM fixed at target, so closed form):
 * pwm = a·s/V·100 + b·iph/V·100 + c  ⇒  s = ((pwm − c)·V/100 − b·iph) / a.
 */
export function predictTiltbackSpeed(model, vRest, iph, pwmTarget, rOhm) {
  if (!model || !(model.a > 0)) return NaN;
  const ib = (iph * pwmTarget) / 100;
  const v = vRest - (isFiniteNum(rOhm) ? rOhm : 0) * ib;
  return (((pwmTarget - model.c) * v) / 100 - model.b * iph) / model.a;
}

/** PWM (%) at wheel speed s, solving the sag/PWM coupling V = vRest − R·iph·PWM/100 (quadratic). */
export function pwmAt(model, s, vRest, iph, rOhm) {
  const N = 100 * (model.a * s + model.b * iph);
  const q = (rOhm * iph) / 100;
  if (Math.abs(q) < 1e-9) return model.c + N / vRest;
  // q·P² − (vRest + q·c)·P + (c·vRest + N) = 0, physical root is the one continuous with q→0
  const B = vRest + q * model.c;
  const disc = B * B - 4 * q * (model.c * vRest + N);
  if (disc < 0) return NaN;
  return (B - Math.sqrt(disc)) / (2 * q);
}

export function fitMarginModel(ride, settings, k, rInfo) {
  const w = ride.wheel;
  const ls = createLeastSquares(3);
  const x = [0, 0, 1];
  for (let i = 0; i < w.n; i++) {
    const sp = w.speed[i], V = w.voltage[i], ip = w.currentPhase[i], m = w.safetyMargin[i];
    if (!(sp > MARGIN_MIN_SPEED) || !(V > 0) || !isFiniteNum(ip) || !isFiniteNum(m)) continue;
    x[0] = (sp / V) * 100; x[1] = (ip / V) * 100;
    ls.add(x, 100 - m);
  }
  const f = ls.fit();
  if (!f) return null;
  const [a, b, c] = f.coef;
  const vMedian = median(w.voltage);
  const rOhm = rInfo.r;
  const model = { a, b, c, residSd: f.residSd, n: f.n, r2: f.r2, rOhm, vMedian };
  const pwmT = settings.tiltbackPwm;
  const vRests = [V_FULL, vMedian, V_LOW];
  model.predictions = [];
  for (const vRest of vRests) {
    for (const iph of PRED_IPH) {
      const sw = predictTiltbackSpeed(model, vRest, iph, pwmT, rOhm);
      model.predictions.push({ vRest, iph, speedWheel: sw, speedReal: sw / k });
    }
  }
  model.curves = vRests.map((vRest) => {
    const points = [];
    for (let s = 0; s <= CURVE_MAX_SPEED; s += 1) {
      const p = pwmAt(model, s, vRest, settings.curveIph, rOhm);
      if (!isFiniteNum(p) || p > 100) break;
      points.push([s, 100 - p]);
    }
    return { vRest, iph: settings.curveIph, points };
  });
  const sw = predictTiltbackSpeed(model, vMedian, settings.curveIph, pwmT, rOhm);
  model.tiltbackSpeedAtMedian = { speedWheel: sw, speedReal: sw / k };
  model.extrapolated = true;
  return model;
}

/** Phase current (signed A) needed for acceleration g (negative = braking) at real speed vKmhReal. */
export function iphForG(model, g, vKmhReal) {
  if (!model || !(Math.abs(model.k) > 0)) return NaN;
  const v = vKmhReal / 3.6;
  return (g * G - model.c - model.d * v * v) / model.k;
}

/**
 * a = k·Iph + c + d·v² on samples with wheel speed > 15 km/h. accel[i] is a central difference over
 * [t(i−1), t(i+1)]; with ~0.6 s sampling each Iph reading holds over the following interval, so the
 * current driving that speed change is the mean of Iph[i−1] and Iph[i] (zero-order hold). Pairing the
 * smoothed acceleration with the instantaneous, noisy Iph[i] instead dilutes k (r² 0.74 vs 0.88 on the
 * sample ride).
 */
export function fitBrakeModel(ride, derived) {
  const w = ride.wheel, I = w.currentPhase;
  const ls = createLeastSquares(3);
  const x = [0, 1, 0];
  for (let i = 1; i < w.n; i++) {
    const a = derived.accel[i], ip = (I[i - 1] + I[i]) / 2, v = derived.speedReal[i] / 3.6;
    if (!(w.t[i] - w.t[i - 1] <= 2)) continue;
    if (!(w.speed[i] > BRAKE_MIN_SPEED) || !isFiniteNum(a) || !isFiniteNum(ip) || !isFiniteNum(v)) continue;
    x[0] = ip; x[2] = v * v;
    ls.add(x, a);
  }
  const f = ls.fit();
  if (!f || !(f.coef[0] > 0)) return null;
  const [kk, c, d] = f.coef;
  const model = { k: kk, c, d, residSd: f.residSd, n: f.n, vRef: BRAKE_VREF };
  model.currentFor = BRAKE_G.map((g) => ({
    g, brakeIph: iphForG(model, -g, BRAKE_VREF), accelIph: iphForG(model, g, BRAKE_VREF),
  }));
  return model;
}

/**
 * Pack resistance from V = v0 − s·E − R·Ib, where E (energy consumed, Wh) absorbs the slow
 * state-of-charge drift (falls back to elapsed time when the energy column is missing).
 * Only samples with a finite current are used; v0 is the fitted open-circuit voltage at E = 0.
 */
export function fitBatteryModel(ride, rMeta) {
  const w = ride.wheel;
  let useE = 0;
  for (let i = 0; i < w.n; i++) if (isFiniteNum(w.energyConsumed[i])) useE++;
  const drift = useE > w.n / 2 ? w.energyConsumed : w.t;
  const ls = createLeastSquares(3);
  const x = [1, 0, 0];
  for (let i = 0; i < w.n; i++) {
    const V = w.voltage[i], ib = w.current[i], e = drift[i];
    if (!(V > 0) || !isFiniteNum(ib) || !isFiniteNum(e)) continue;
    x[1] = e; x[2] = ib;
    ls.add(x, V);
  }
  const f = ls.fit();
  if (!f) return null;
  return { r: -f.coef[2], v0: f.coef[0], residSd: f.residSd, n: f.n, rMeta };
}

export function batteryFlags(ride, bm, summary) {
  const flags = [];
  const fmt = (x, d) => x.toFixed(d).replace('.', ',');
  if (bm && isFiniteNum(bm.rMeta) && bm.r > 1.5 * bm.rMeta) {
    flags.push(`Opór obwodu baterii ${fmt(bm.r, 3)} Ω przekracza 1,5× wartość koła (${fmt(bm.rMeta, 2)} Ω).`);
  }
  if (summary.voltageMin.value < 118.8) {
    flags.push(`Napięcie spadło do ${fmt(summary.voltageMin.value, 2)} V (poniżej 118,8 V — 3,3 V/ogniwo).`);
  }
  const tm = summary.tempMax;
  const hot = Math.max(...[tm.temp, tm.tempBatt, tm.tempCpu, tm.tempImu].filter(isFiniteNum), -Infinity);
  if (hot >= 60) flags.push(`Temperatura osiągnęła ${fmt(hot, 0)} °C (≥ 60 °C).`);
  if (summary.batteryEnd < 15) flags.push(`Bateria na koniec jazdy: ${fmt(summary.batteryEnd, 0)} % (poniżej 15 %).`);
  return flags;
}
