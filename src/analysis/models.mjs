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

export const REST_CURRENT = 3;             // A, |battery current| below this counts as near rest
export const OUT_OF_DATA_FACTOR = 1.05;    // prediction beyond 1.05 × ride max wheel speed is outOfData
export const CURVE_BEYOND_DATA = 20;       // km/h, curves stop this far beyond the ride max wheel speed

/**
 * PWM model. vRestMedian is the median voltage of near-rest samples (|Ib| < 3 A), an estimate of the
 * resting pack voltage during the ride; vMedian (kept for older consumers) holds the same value. Using
 * the loaded median would subtract the sag twice. Predictions carry a ±residSd band (PWM target ± one
 * residual SD) and outOfData when they lie beyond the ride's speed range; worstCase is the lowest
 * prediction of the grid. Quality gating (n, r²) is done by analyzeRide.
 */
export function fitMarginModel(ride, settings, k, rInfo) {
  const w = ride.wheel;
  const ls = createLeastSquares(3);
  const x = [0, 0, 1];
  let speedMax = -Infinity, pwmMax = -Infinity;
  const restV = [];
  for (let i = 0; i < w.n; i++) {
    const sp = w.speed[i], V = w.voltage[i], ip = w.currentPhase[i], m = w.safetyMargin[i];
    if (sp > speedMax) speedMax = sp;
    if (100 - m > pwmMax) pwmMax = 100 - m;
    if (V > 0 && Math.abs(w.current[i]) < REST_CURRENT) restV.push(V);
    if (!(sp > MARGIN_MIN_SPEED) || !(V > 0) || !isFiniteNum(ip) || !isFiniteNum(m)) continue;
    x[0] = (sp / V) * 100; x[1] = (ip / V) * 100;
    ls.add(x, 100 - m);
  }
  const f = ls.fit();
  if (!f) return null;
  const [a, b, c] = f.coef;
  const vRestMedian = restV.length >= 20 ? median(restV) : median(w.voltage);
  const rOhm = rInfo.r;
  const observedMax = { speedWheel: Number.isFinite(speedMax) ? speedMax : NaN, pwm: Number.isFinite(pwmMax) ? pwmMax : NaN };
  const model = { a, b, c, residSd: f.residSd, n: f.n, r2: f.r2, rOhm, vMedian: vRestMedian, vRestMedian, observedMax };
  const pwmT = settings.tiltbackPwm;
  const vRests = [V_FULL, vRestMedian, V_LOW];
  const outLimit = observedMax.speedWheel * OUT_OF_DATA_FACTOR;
  model.predictions = [];
  for (const vRest of vRests) {
    for (const iph of PRED_IPH) {
      const sw = predictTiltbackSpeed(model, vRest, iph, pwmT, rOhm);
      const band = [predictTiltbackSpeed(model, vRest, iph, pwmT - f.residSd, rOhm),
        predictTiltbackSpeed(model, vRest, iph, pwmT + f.residSd, rOhm)];
      model.predictions.push({ vRest, iph, speedWheel: sw, speedReal: sw / k, outOfData: !(sw <= outLimit), band });
    }
  }
  let worst = model.predictions[0];
  for (const p of model.predictions) if (p.speedWheel < worst.speedWheel) worst = p;
  model.worstCase = { vRest: worst.vRest, iph: worst.iph, speedWheel: worst.speedWheel, speedReal: worst.speedReal };
  const curveMax = Math.min(CURVE_MAX_SPEED, isFiniteNum(observedMax.speedWheel) ? observedMax.speedWheel + CURVE_BEYOND_DATA : CURVE_MAX_SPEED);
  model.curves = vRests.map((vRest) => {
    const points = [];
    for (let s = 0; s <= curveMax; s += 1) {
      const p = pwmAt(model, s, vRest, settings.curveIph, rOhm);
      if (!isFiniteNum(p) || p > 100) break;
      points.push([s, 100 - p]);
    }
    return { vRest, iph: settings.curveIph, points };
  });
  const sw = predictTiltbackSpeed(model, vRestMedian, settings.curveIph, pwmT, rOhm);
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
 * a = k·Iph + c + d·v² on samples with wheel speed > 15 km/h. accel[i] is a difference over the
 * stencil [lo, hi] (≥ 1 s, see kinematics.accelStencil); each Iph reading holds until the next sample
 * (zero-order hold), so the current driving that speed change is the time-weighted mean of Iph over
 * [t(lo), t(hi)]. Pairing with the instantaneous, noisy Iph[i] instead dilutes k.
 * observedPeakBrakeG / observedMinIph bound the data; currentFor rows beyond them are beyondObserved.
 */
export function fitBrakeModel(ride, derived, stencil) {
  const w = ride.wheel, I = w.currentPhase, t = w.t;
  const { lo, hi } = stencil;
  const ls = createLeastSquares(3);
  const x = [0, 1, 0];
  let peakBrakeG = 0, minIph = Infinity;
  for (let i = 0; i < w.n; i++) if (I[i] < minIph) minIph = I[i];
  for (let i = 0; i < w.n; i++) {
    const a = derived.accel[i], v = derived.speedReal[i] / 3.6;
    if (!(hi[i] > lo[i]) || !(w.speed[i] > BRAKE_MIN_SPEED) || !isFiniteNum(a) || !isFiniteNum(v)) continue;
    let ip = 0;
    for (let j = lo[i]; j < hi[i]; j++) ip += I[j] * (t[j + 1] - t[j]);
    ip /= t[hi[i]] - t[lo[i]];
    if (!isFiniteNum(ip)) continue;
    x[0] = ip; x[2] = v * v;
    ls.add(x, a);
    if (-a / G > peakBrakeG) peakBrakeG = -a / G;
  }
  const f = ls.fit();
  if (!f || !(f.coef[0] > 0)) return null;
  const [kk, c, d] = f.coef;
  const observedMinIph = Number.isFinite(minIph) ? minIph : NaN;
  const model = { k: kk, c, d, residSd: f.residSd, n: f.n, r2: f.r2, vRef: BRAKE_VREF,
    observedPeakBrakeG: peakBrakeG, observedMinIph };
  model.currentFor = BRAKE_G.map((g) => {
    const brakeIph = iphForG(model, -g, BRAKE_VREF);
    const beyondObserved = !(Math.abs(brakeIph) <= Math.abs(observedMinIph)) || g > peakBrakeG;
    return { g, brakeIph, accelIph: iphForG(model, g, BRAKE_VREF), beyondObserved };
  });
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

export const BATT_R_MIN = 0.03, BATT_R_MAX = 0.6;   // ohm, plausible fitted pack resistance
export const BATT_RESID_MAX = 1.5;                  // V, larger residual SD => fit rejected
export const REGEN_FULL_V = 147;                    // V, ~4,08 V/cell: regen headroom is small above this

/** Quality gate for the battery fit: null when R is implausible or the residuals are large. */
export function batteryModelOk(bm) {
  return !!bm && bm.r >= BATT_R_MIN && bm.r <= BATT_R_MAX && bm.residSd <= BATT_RESID_MAX;
}

export function batteryFlags(ride, bm, summary, events = []) {
  const flags = [];
  const fmt = (x, d) => x.toFixed(d).replace('.', ',');
  if (bm && isFiniteNum(bm.rMeta) && bm.r > 1.5 * bm.rMeta) {
    flags.push(`Opór obwodu baterii ${fmt(bm.r, 3)} Ω przekracza 1,5× wartość koła (${fmt(bm.rMeta, 2)} Ω).`);
  }
  if (summary.voltageMin.value < 118.8) {
    flags.push(`Napięcie pod obciążeniem spadło do ${fmt(summary.voltageMin.value, 2)} V (poniżej 118,8 V — 3,3 V/ogniwo).`);
  }
  let vStart = NaN;
  for (const v of ride.wheel.voltage) if (v > 0) { vStart = v; break; }
  let vBrake = -Infinity;
  for (const e of events) if (e.kind === 'brake' && e.maxVoltage > vBrake) vBrake = e.maxVoltage;
  if (vStart > REGEN_FULL_V || vBrake > REGEN_FULL_V) {
    const v = Math.max(vStart > 0 ? vStart : -Infinity, vBrake);
    flags.push(`Prawie pełna bateria (${fmt(v, 1)} V): odzysk energii przy hamowaniu jest ograniczony — ` +
      'koło może osłabić hamowanie lub zgłosić przepięcie. Nie trenuj mocnego hamowania tuż po ładowaniu.');
  }
  const tm = summary.tempMax;
  const hot = Math.max(...[tm.temp, tm.tempBatt, tm.tempCpu, tm.tempImu].filter(isFiniteNum), -Infinity);
  if (hot >= 60) flags.push(`Temperatura osiągnęła ${fmt(hot, 0)} °C (≥ 60 °C).`);
  if (summary.batteryEnd < 15) flags.push(`Bateria na koniec jazdy: ${fmt(summary.batteryEnd, 0)} % (poniżej 15 %).`);
  return flags;
}
