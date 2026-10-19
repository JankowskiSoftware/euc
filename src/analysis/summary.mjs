// Ride summary (see Summary in docs/CONTRACT.md).
import { isFiniteNum } from './linalg.mjs';

function extreme(arr, t, wantMax) {
  let best = NaN, bt = NaN, bi = -1;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!(v === v)) continue;
    if (bi < 0 || (wantMax ? v > best : v < best)) { best = v; bt = t[i]; bi = i; }
  }
  return { value: best, t: bt, i: bi };
}
const vt = (e) => ({ value: e.value, t: e.t });

function firstFinite(a) { for (let i = 0; i < a.length; i++) if (a[i] === a[i]) return a[i]; return NaN; }
function lastFinite(a) { for (let i = a.length - 1; i >= 0; i--) if (a[i] === a[i]) return a[i]; return NaN; }
function maxOf(a) { let m = NaN; for (const v of a) if (v === v && !(v <= m)) m = v; return m; }

export function buildSummary(ride, derived, events, counts, markers, k = 1) {
  const w = ride.wheel, g = ride.gps, last = ride.last;
  const tEnd = w.n ? w.t[w.n - 1] : 0;
  const distW = isFiniteNum(last.distanceKm) ? last.distanceKm : lastFinite(w.distance);
  const distG = isFiniteNum(last.gpsDistanceKm) ? last.gpsDistanceKm : lastFinite(g.distance);
  const energyWh = isFiniteNum(last.energyWh) ? last.energyWh : lastFinite(w.energyConsumed);
  const minM = extreme(w.safetyMargin, w.t, false);
  const best = (kind) => {
    let id = null, m = -1;
    for (const e of events) if (e.kind === kind && e.meanG > m) { m = e.meanG; id = e.id; }
    return id;
  };
  return {
    startIso: ride.startIso,
    durationS: isFiniteNum(last.durationS) ? last.durationS : tEnd,
    ridingS: isFiniteNum(last.ridingS) ? last.ridingS : NaN,
    distanceWheelKm: distW,
    distanceGpsKm: distG,
    maxSpeedWheel: vt(extreme(w.speed, w.t, true)),
    maxSpeedReal: vt(extreme(derived.speedReal, w.t, true)),
    maxSpeedGps: maxOf(g.speed),
    minMargin: { value: minM.value, t: minM.t, speed: minM.i >= 0 ? w.speed[minM.i] : NaN },
    hardestBrakeId: best('brake'),
    hardestAccelId: best('accel'),
    iphMax: vt(extreme(w.currentPhase, w.t, true)),
    iphMin: vt(extreme(w.currentPhase, w.t, false)),
    ibMax: vt(extreme(w.current, w.t, true)),
    ibMin: vt(extreme(w.current, w.t, false)),
    energyWh,
    whPerKm: distW > 0 ? energyWh / distW : NaN,
    // per real km: GPS distance, or wheel distance / k when there is no GPS distance
    whPerKmReal: distG > 0 ? energyWh / distG : distW > 0 && k > 0 ? energyWh / (distW / k) : NaN,
    batteryStart: firstFinite(w.battery),
    batteryEnd: lastFinite(w.battery),
    batteryMin: vt(extreme(w.battery, w.t, false)),   // under load; end value is after voltage recovery
    voltageMin: vt(extreme(w.voltage, w.t, false)),
    voltageMax: maxOf(w.voltage),
    tempMax: { temp: maxOf(w.temp), tempBatt: maxOf(w.tempBatt), tempCpu: maxOf(w.tempCpu), tempImu: maxOf(w.tempImu) },
    alarmCounts: counts,
    markerTimes: markers.map((m) => m.t),
  };
}
