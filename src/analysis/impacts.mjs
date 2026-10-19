// Impact candidates. The log has no vertical accelerometer, so impacts are inferred from SHORT
// spikes that return: phase current (primary), tilt (pitch) and safety margin (supporting).
//
// Rule (per wheel sample i with wheel speed > impactMinSpeed):
//  - iphDev  = Iph[i] − median(Iph[i−2..i+2])                 (centred 5-sample rolling median)
//  - iphProm = signed min(|Iph[i]−Iph[i−1]|, |Iph[i]−Iph[i+1]|) when BOTH neighbours lie on the same
//              side of Iph[i] (a spike that returns), else 0. A braking onset — Iph drops and stays
//              down — has a neighbour at least as extreme, so its prominence is ~0 and it is not flagged.
//  - flagged by 'iph'  when |iphDev| ≥ impactIphDev and |iphProm| ≥ impactIphDev;
//  - flagged by 'tilt' when the tilt spike prominence (same definition) ≥ impactTiltJump;
//  - 'margin' is a supporting reason only: safety margin dips ≥ IMPACT_MARGIN_DIP below both neighbours.
// Candidates closer than IMPACT_MERGE_S are merged, keeping the most severe sample.
import { smallMedian } from './linalg.mjs';

export const IMPACT_MARGIN_DIP = 6;   // % safety margin
export const IMPACT_MERGE_S = 1.5;    // s

// severity = (|iphProm|/impactIphDev + 0.5·|tiltProm|/impactTiltJump + 0.25·dip/IMPACT_MARGIN_DIP)
//            × clamp(speed/30 km/h, 0.5, 1.5); level 3 at ≥ 2.5, level 2 at ≥ 1.5.
const levelOf = (sev) => (sev >= 2.5 ? 3 : sev >= 1.5 ? 2 : 1);

function prominence(A, i) {
  const a = A[i] - A[i - 1], b = A[i] - A[i + 1];
  if (!(a === a) || !(b === b) || a === 0 || b === 0 || (a > 0) !== (b > 0)) return 0;
  return a > 0 ? Math.min(a, b) : -Math.min(-a, -b);
}

export function detectImpacts(ride, derived, s) {
  const w = ride.wheel, n = w.n, I = w.currentPhase, T = w.tilt, M = w.safetyMargin, t = w.t;
  const buf = new Array(5);
  const raw = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(w.speed[i] > s.impactMinSpeed)) continue;
    if (t[i + 1] - t[i - 1] > 2.5) continue; // neighbours across a data gap are not comparable
    let len = 0;
    for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < n) buf[len++] = I[j];
    const dev = I[i] - smallMedian(buf, len);
    const pI = prominence(I, i);
    const pT = prominence(T, i);
    const byIph = Math.abs(dev) >= s.impactIphDev && Math.abs(pI) >= s.impactIphDev;
    const byTilt = Math.abs(pT) >= s.impactTiltJump;
    if (!byIph && !byTilt) continue;
    const tiltJump = Math.max(Math.abs(T[i] - T[i - 1]) || 0, Math.abs(T[i + 1] - T[i]) || 0);
    const dip = -prominence(M, i);
    const reasons = [];
    if (byIph) reasons.push('iph');
    if (byTilt || (byIph && tiltJump >= s.impactTiltJump)) reasons.push('tilt');
    if (dip >= IMPACT_MARGIN_DIP) reasons.push('margin');
    const speedFactor = Math.min(1.5, Math.max(0.5, w.speed[i] / 30));
    const severity = (Math.abs(pI) / s.impactIphDev +
      0.5 * (Math.abs(pT) / s.impactTiltJump) +
      (dip >= IMPACT_MARGIN_DIP ? 0.25 * (dip / IMPACT_MARGIN_DIP) : 0)) * speedFactor;
    raw.push({
      i, t: t[i], speed: w.speed[i], speedReal: derived.speedReal[i],
      iph: I[i], iphDev: dev, tiltJump, margin: M[i],
      lat: w.lat[i], lon: w.lon[i],
      severity, level: levelOf(severity), reasons,
    });
  }
  // Merge: the representative sample is the one with the largest |iphDev| (the current extreme,
  // falling back to severity for tilt-only members); severity is the group maximum, reasons the union.
  const key = (c) => (c.reasons.includes('iph') ? 1000 + Math.abs(c.iphDev) : c.severity);
  const out = [];
  for (const c of raw) {
    const prev = out[out.length - 1];
    if (prev && c.t - prev._last < IMPACT_MERGE_S) {
      prev._last = c.t;
      for (const r of c.reasons) prev._reasons.add(r);
      const sev = Math.max(prev._sev, c.severity);
      if (key(c) > key(prev)) Object.assign(prev, c, { _last: c.t, _reasons: prev._reasons });
      prev._sev = sev;
    } else {
      out.push({ ...c, _last: c.t, _reasons: new Set(c.reasons), _sev: c.severity });
    }
  }
  const order = ['iph', 'tilt', 'margin'];
  return out.map(({ _last, _reasons, _sev, ...c }) => ({
    ...c, severity: _sev, level: levelOf(_sev), reasons: order.filter((r) => _reasons.has(r)),
  }));
}
