// Braking / acceleration event detection on the per-sample acceleration (real speed).
//
// Boundary choice (documented in the contract summary): the "core" of an event is a run of samples
// whose |accelG| >= eventG with the same sign (runs separated by a sub-threshold stretch shorter than
// eventMergeGap are merged). Because accelG[i] is a difference over a stencil around i (≥ 1 s), the speed
// change actually starts at the sample BEFORE the first core sample and ends at the sample AFTER the
// last one; i0/i1 are those extended indices (never across a data gap). The minimum-duration test
// uses the core length counted in sample intervals ((t[last]-t[first]) + typical spacing), so a single
// above-threshold sample (~0.6 s) never forms an event. meanG = |v(i1)-v(i0)| / (t(i1)-t(i0)) / g.
import { G, MAX_NEIGHBOUR_GAP } from './kinematics.mjs';

export const STOP_SPEED = 5; // km/h real; a brake ending above this did not reach a stop

function typicalSpacing(t) {
  const d = [];
  const step = Math.max(1, Math.floor(t.length / 2000));
  for (let i = step; i < t.length; i += step) {
    const x = t[i] - t[i - 1];
    if (x > 0 && x < MAX_NEIGHBOUR_GAP) d.push(x);
  }
  if (!d.length) return 0.6;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}

function findCores(accelG, t, s) {
  const n = accelG.length;
  const cores = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const a = accelG[i];
    const sign = a >= s.eventG ? 1 : a <= -s.eventG ? -1 : 0;
    if (sign === 0) continue;
    const contiguous = cur && cur.sign === sign && cur.last === i - 1 && t[i] - t[i - 1] <= MAX_NEIGHBOUR_GAP;
    // gap = length of the sub-threshold stretch, measured from its first sample to this sample
    const mergeable = cur && cur.sign === sign && !contiguous && cur.last + 1 < i &&
      t[i] - t[cur.last + 1] < s.eventMergeGap && noOpposite(accelG, cur.last + 1, i, sign, s.eventG) &&
      noGap(t, cur.last, i);
    if (contiguous || mergeable) {
      cur.last = i;
      cur.peak = Math.max(cur.peak, Math.abs(a));
    } else {
      cur = { sign, first: i, last: i, peak: Math.abs(a) };
      cores.push(cur);
    }
  }
  return cores;
}

function noOpposite(accelG, a, b, sign, thr) {
  for (let i = a; i < b; i++) if (accelG[i] * sign <= -thr) return false;
  return true;
}
function noGap(t, a, b) {
  for (let i = a + 1; i <= b; i++) if (!(t[i] - t[i - 1] <= MAX_NEIGHBOUR_GAP)) return false;
  return true;
}

export function detectEvents(ride, derived, s) {
  const w = ride.wheel, t = w.t, n = w.n;
  const { speedReal, accelG } = derived;
  const spacing = typicalSpacing(t);
  const events = [];
  for (const c of findCores(accelG, t, s)) {
    if (c.peak < s.eventPeakG) continue;
    if (t[c.last] - t[c.first] + spacing < s.eventMinDur - 1e-9) continue;
    let i0 = c.first, i1 = c.last;
    if (i0 > 0 && t[i0] - t[i0 - 1] <= MAX_NEIGHBOUR_GAP) i0--;
    if (i1 < n - 1 && t[i1 + 1] - t[i1] <= MAX_NEIGHBOUR_GAP) i1++;
    events.push(buildEvent(w, speedReal, accelG, i0, i1, c.sign < 0 ? 'brake' : 'accel', s));
  }
  // extended windows of neighbouring events may share a boundary sample; that is fine (chronological order kept)
  events.forEach((e, k) => { e.id = k + 1; });
  return events;
}

function buildEvent(w, vr, accelG, i0, i1, kind, s) {
  const brake = kind === 'brake';
  let peakG = 0, peakIph = brake ? Infinity : -Infinity, minM = Infinity, maxM = -Infinity;
  let regen = Infinity, maxV = -Infinity, dist = 0;
  for (let i = i0; i <= i1; i++) {
    const g = accelG[i];
    if (g === g && Math.abs(g) > peakG && Math.sign(g) === (brake ? -1 : 1)) peakG = Math.abs(g);
    const ip = w.currentPhase[i];
    if (ip === ip) peakIph = brake ? Math.min(peakIph, ip) : Math.max(peakIph, ip);
    const m = w.safetyMargin[i];
    if (m === m) { if (m < minM) minM = m; if (m > maxM) maxM = m; }
    const ib = w.current[i];
    if (ib === ib && ib < regen) regen = ib;
    const v = w.voltage[i];
    if (v === v && v > maxV) maxV = v;
    if (i > i0) {
      const seg = ((vr[i] + vr[i - 1]) / 2 / 3.6) * (w.t[i] - w.t[i - 1]);
      if (seg === seg) dist += seg;
    }
  }
  const fin = (x) => (Number.isFinite(x) ? x : NaN);
  const duration = w.t[i1] - w.t[i0];
  const vStart = vr[i0], vEnd = vr[i1];
  const meanG = duration > 0 ? Math.abs(vEnd - vStart) / 3.6 / duration / G : NaN;
  let stop = null;
  if (brake) {
    const v = vStart / 3.6;
    const a = meanG * G;
    const brakingM = a > 0 ? (v * v) / (2 * a) : NaN;
    const reactionM = v * s.reactionTime;
    // projection to zero speed at the event's mean intensity; extrapolated when the event did not end near a stop
    stop = { brakingM, reactionM, totalM: brakingM + reactionM,
      speedShedFraction: vStart > 0 ? 1 - vEnd / vStart : NaN, extrapolated: !(vEnd <= STOP_SPEED) };
  }
  return {
    id: 0, kind, i0, i1,
    tStart: w.t[i0], tEnd: w.t[i1], duration,
    vStart, vEnd, vStartWheel: w.speed[i0], vEndWheel: w.speed[i1],
    meanG, peakG, distanceM: dist,
    peakIph: fin(peakIph), minMargin: fin(minM), maxMargin: fin(maxM),
    peakRegenI: brake ? (Number.isFinite(regen) ? regen : null) : null,
    maxVoltage: fin(maxV), stop,
    lat: w.lat[i0], lon: w.lon[i0],
  };
}
