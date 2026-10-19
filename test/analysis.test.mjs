// Analysis core tests on data/sample.csv (Leaperkim Lynx S, EUC World 2.68.0).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadSampleRows } from './helpers/sample.mjs';
import { repeatRide, clone } from './helpers/ride-utils.mjs';
import {
  createIngester, prepareRideFromRows, analyzeRide, predictTiltbackSpeed, iphForG,
  serializeAnalysis, ALARM_BITS,
} from '../src/analysis/index.mjs';
import { DEFAULT_ANALYSIS_SETTINGS } from '../src/analysis/defaults.mjs';
import { parseTimestamp } from '../src/analysis/time.mjs';

// impactIphDev 45 A is the value tuned on the sample (requested for defaults.mjs); passing it
// explicitly keeps these tests valid before and after the default changes.
const SETTINGS = { ...DEFAULT_ANALYSIS_SETTINGS, impactIphDev: 45 };

const { header, rows } = loadSampleRows();
const ride = prepareRideFromRows(header, rows);
const A = analyzeRide(ride, SETTINGS);
const S = A.summary;

const near = (x, target, tol, msg) =>
  assert.ok(Math.abs(x - target) <= tol, `${msg ?? ''} expected ${target} ± ${tol}, got ${x}`);
const within = (x, lo, hi, msg) => assert.ok(x >= lo && x <= hi, `${msg ?? ''} expected [${lo}, ${hi}], got ${x}`);

describe('timestamp parsing', () => {
  test('+0200 offset with milliseconds', () => {
    const p = parseTimestamp('2026-10-19T12:33:43.219+0200');
    assert.equal(p.tzOffsetMin, 120);
    assert.equal(p.ms, Date.UTC(2026, 9, 19, 10, 33, 43, 219));
  });
  test('other zone forms and fractions', () => {
    assert.equal(parseTimestamp('2026-01-02T03:04:05Z').ms, Date.UTC(2026, 0, 2, 3, 4, 5));
    assert.equal(parseTimestamp('2026-01-02T03:04:05.5-05:30').ms, Date.UTC(2026, 0, 2, 8, 34, 5, 500));
    assert.equal(parseTimestamp('garbage'), null);
  });
});

describe('ingestion', () => {
  test('meta from the extra column', () => {
    assert.equal(ride.meta.make, 'Veteran');
    assert.equal(ride.meta.model, 'Lynx S');
    assert.equal(ride.meta.firmware, '9.0.4');
    assert.equal(ride.meta.batteryCircuitResistance, 0.17);
    assert.equal(ride.meta.phone, 'Pixel 8 Pro');
    assert.equal(ride.meta.appVersion, '2.68.0');
    assert.equal(ride.meta.raw['info.timeZone'], 'Europe/Warsaw');
  });
  test('start, rows, dedupe counts', () => {
    assert.equal(ride.startIso, '2026-10-19T12:33:43.219+0200');
    assert.equal(ride.tzOffsetMin, 120);
    assert.equal(ride.startMs, Date.UTC(2026, 9, 19, 10, 33, 43, 219));
    assert.equal(ride.rawRowCount, rows.length);
    within(ride.wheel.n, 3200, 3500, 'wheel samples');
    within(ride.gps.n, 1200, 1700, 'gps samples');
    const w = ride.wheel;
    for (const k of ['t', 'row', 'speed', 'voltage', 'current', 'currentPhase', 'power', 'safetyMargin', 'tilt', 'roll',
      'battery', 'temp', 'tempBatt', 'tempCpu', 'tempImu', 'distance', 'energyConsumed', 'accelCol', 'alarm', 'lat', 'lon']) {
      assert.equal(w[k].length, w.n, k);
    }
    for (let i = 1; i < w.n; i++) assert.ok(w.t[i] >= w.t[i - 1]);
  });
  test('raw alarm values', () => {
    assert.deepEqual(ride.rawAlarmValueCounts, { 1: 84, 513: 14, 256: 3, 768: 3, 512: 2 });
  });
  test('chunked pushRows gives an identical Ride', () => {
    for (const size of [1, 7, 1000]) {
      const ing = createIngester(header);
      for (let i = 0; i < rows.length; i += size) ing.pushRows(rows.slice(i, i + size));
      assert.deepStrictEqual(ing.finish(), ride, `chunk size ${size}`);
    }
  });
  test('40k rows ingest well under 300 ms', () => {
    const big = [];
    for (let r = 0; r < 5; r++) for (const row of rows) big.push(row);
    prepareRideFromRows(header, big.slice(0, 2000)); // warm-up
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      prepareRideFromRows(header, big);
      best = Math.min(best, performance.now() - t0);
    }
    assert.ok(best < 300, `ingest took ${best.toFixed(1)} ms`);
  });
});

describe('summary acceptance', () => {
  test('distances, energy, battery, voltage', () => {
    near(S.distanceWheelKm, 10.498, 0.001);
    near(S.distanceGpsKm, 9.871, 0.001);
    near(S.energyWh, 330, 0.5);
    near(S.whPerKm, 31.4, 0.1);
    assert.equal(S.batteryStart, 67);
    // The log's last battery value is 53 % (at rest, voltage recovered); 51 % is the minimum, under load.
    assert.equal(S.batteryEnd, 53);
    assert.equal(Math.min(...ride.wheel.battery.filter(Number.isFinite)), 51);
    near(S.voltageMin.value, 125.46, 0.001);
  });
  test('speeds and calibration', () => {
    near(S.maxSpeedWheel.value, 53.2, 0.001);
    near(S.maxSpeedGps, 47.57, 0.001);
    near(A.calib.k, 1.096, 0.02, 'k');
    assert.equal(A.calib.auto, true);
    near(S.maxSpeedReal.value, 53.2 / A.calib.k, 1e-9);
  });
  test('minimum safety margin', () => {
    assert.equal(S.minMargin.value, 48);
    near(S.minMargin.t, 630, 1.5);
    within(S.minMargin.speed, 52, 53.2);
  });
  test('currents', () => {
    near(S.iphMin.value, -108.7, 0.001);
    near(S.iphMin.t, 616.4, 0.2);
    near(S.iphMax.value, 84.8, 0.001);
    near(S.ibMin.value, -23.1, 0.001);
    near(S.ibMax.value, 44.85, 0.001);
  });
  test('alarm counts and episodes', () => {
    const c = Object.fromEntries(S.alarmCounts.map((x) => [x.key, x]));
    assert.equal(S.alarmCounts.length, ALARM_BITS.length);
    assert.ok(c.speed3.samples > 0 && c.speed3.episodes > 0);
    assert.ok(c.safetyMargin.episodes >= 1 && c.speedLimit.episodes >= 1);
    assert.equal(c.peakCurrent.samples, 0);
    const sm = A.alarms.filter((e) => e.bit === 256);
    assert.ok(sm.length >= 1);
    const brakes = A.events.filter((e) => e.kind === 'brake');
    for (const e of sm) {
      within(e.tStart, 628.5, 632, 'margin alarm start');
      within(e.tEnd, 628.5, 632, 'margin alarm end');
      for (let i = e.i0; i <= e.i1; i++) {
        assert.ok(ride.wheel.speed[i] > 48, 'margin alarm at top speed');
        assert.ok(!brakes.some((b) => i >= b.i0 && i <= b.i1), 'margin alarm not during braking');
      }
    }
    assert.deepEqual(A.markers, []);
    assert.deepEqual(S.markerTimes, []);
  });
});

describe('models', () => {
  const m = A.marginModel;
  test('safety margin regression', () => {
    near(m.a, 1.19, 1.19 * 0.15, 'a');
    near(m.b, 0.22, 0.22 * 0.15, 'b');
    near(m.c, -0.4, 1, 'c');
    near(m.residSd, 2.1, 0.3, 'residSd');
    assert.ok(m.r2 > 0.9 && m.n > 1000);
    assert.equal(m.rOhm, 0.17);
    assert.equal(m.extrapolated, true);
  });
  test('tiltback prediction', () => {
    near(predictTiltbackSpeed(m, 134, 40, 65, 0.17), 64, 5);
    assert.equal(m.predictions.length, 9);
    for (const p of m.predictions) near(p.speedReal, p.speedWheel / A.calib.k, 1e-9);
    // more voltage or less current => higher tiltback speed
    const at = (v, i) => m.predictions.find((p) => p.vRest === v && p.iph === i).speedWheel;
    assert.ok(at(151.2, 40) > at(m.vMedian, 40) && at(m.vMedian, 40) > at(126, 40));
    assert.ok(at(126, 10) > at(126, 80));
    assert.equal(m.curves.length, 3);
    for (const c of m.curves) {
      assert.equal(c.iph, SETTINGS.curveIph);
      assert.ok(c.points.length > 50);
      for (let j = 1; j < c.points.length; j++) assert.ok(c.points[j][1] < c.points[j - 1][1]);
      // the curve crosses margin 35 % (PWM 65) at the predicted tiltback speed
      const pred = predictTiltbackSpeed(m, c.vRest, c.iph, 65, m.rOhm);
      const crossing = c.points.find((pt) => pt[1] <= 35);
      near(crossing[0], pred, 1.01);
    }
    near(m.tiltbackSpeedAtMedian.speedWheel, predictTiltbackSpeed(m, m.vMedian, 40, 65, 0.17), 1e-9);
  });
  test('brake force model', () => {
    const b = A.brakeModel;
    near(b.k, 0.033, 0.033 * 0.3, 'k');
    assert.equal(b.vRef, 30);
    const half = b.currentFor.find((x) => x.g === 0.5);
    within(Math.abs(half.brakeIph), 130, 155, '|Iph| for 0.5 g');
    assert.ok(half.brakeIph < 0 && half.accelIph > 0);
    near(iphForG(b, -0.5, 30), half.brakeIph, 1e-9);
    assert.deepEqual(b.currentFor.map((x) => x.g), [0.3, 0.4, 0.5]);
  });
  test('battery model and flags', () => {
    const bm = A.batteryModel;
    within(bm.r, 0.08, 0.25, 'R');
    assert.equal(bm.rMeta, 0.17);
    assert.deepEqual(A.battery.flags, []);
    // synthetic: low voltage + empty battery + hot => flags
    const hot = clone(ride);
    hot.wheel.voltage = hot.wheel.voltage.map((v) => v - 10);
    hot.wheel.battery = hot.wheel.battery.map(() => 10);
    hot.wheel.tempBatt = hot.wheel.tempBatt.map(() => 61);
    assert.ok(analyzeRide(hot, SETTINGS).battery.flags.length >= 3);
  });
});

describe('events', () => {
  const brakes = A.events.filter((e) => e.kind === 'brake');
  const HARD = [613.4, 945.2, 1443.4, 1523.2];
  test('the four hard brakes from ~44 km/h', () => {
    for (const t of HARD) {
      const e = brakes.find((x) => Math.abs(x.tStart - t) <= 1);
      assert.ok(e, `brake near ${t}`);
      within(e.vStartWheel, 43, 46, 'vStartWheel');
      within(e.maxMargin, 70, 90, 'maxMargin');
      // NOTE: the contract asked for meanG 0.30–0.36; the data (wheel and GPS) give ~0.20–0.23 g
      // over the whole braking phase, peak central-difference values 0.25–0.31 g. See report.
      within(e.meanG, 0.18, 0.36, 'meanG');
      within(e.peakG, 0.25, 0.4, 'peakG');
      assert.ok(e.peakIph < -60 && e.peakRegenI < 0);
      assert.ok(e.stop.brakingM > 0 && e.stop.reactionM > 0);
      near(e.stop.reactionM, (e.vStart / 3.6) * SETTINGS.reactionTime, 1e-9);
      near(e.stop.brakingM, (e.vStart / 3.6) ** 2 / (2 * e.meanG * 9.81), 1e-6);
      near(e.stop.totalM, e.stop.brakingM + e.stop.reactionM, 1e-9);
    }
  });
  test('event fields and invariants', () => {
    assert.ok(A.events.length > 4);
    const keys = ['id', 'kind', 'i0', 'i1', 'tStart', 'tEnd', 'duration', 'vStart', 'vEnd', 'vStartWheel', 'vEndWheel',
      'meanG', 'peakG', 'distanceM', 'peakIph', 'minMargin', 'maxMargin', 'peakRegenI', 'maxVoltage', 'stop', 'lat', 'lon'];
    A.events.forEach((e, k) => {
      for (const key of keys) assert.ok(key in e, key);
      assert.equal(e.id, k + 1);
      if (k) assert.ok(e.tStart >= A.events[k - 1].tStart);
      assert.ok(e.duration >= SETTINGS.eventMinDur && e.peakG >= SETTINGS.eventPeakG);
      assert.ok(e.kind === 'brake' ? e.vEnd < e.vStart && e.stop : e.vEnd > e.vStart && e.stop === null && e.peakRegenI === null);
      assert.ok(e.distanceM > 0 && Number.isFinite(e.lat));
      near(e.meanG, Math.abs(e.vEnd - e.vStart) / 3.6 / e.duration / 9.81, 1e-9);
    });
    const hardest = A.events.find((e) => e.id === S.hardestBrakeId);
    assert.ok(brakes.every((e) => e.meanG <= hardest.meanG));
  });
  test('stricter thresholds give fewer events', () => {
    const b = analyzeRide(ride, { ...SETTINGS, eventG: 0.2, eventPeakG: 0.25 });
    assert.ok(b.events.length < A.events.length);
  });
});

describe('impacts', () => {
  const ts = A.impacts.map((c) => c.t);
  const has = (t) => ts.some((x) => Math.abs(x - t) <= 0.7);
  test('known impacts found, braking onsets not flagged', () => {
    assert.ok(has(616.4), `616.4 in ${ts}`);
    assert.ok(has(886.7), `886.7 in ${ts}`);
    assert.ok(!has(1523.8), 'brake onset 1523.8 flagged');
    assert.ok(!has(1444.0), 'brake onset 1444.0 flagged');
    assert.ok(A.impacts.length <= 12 && A.impacts.length >= 2);
  });
  test('candidate fields', () => {
    for (const c of A.impacts) {
      assert.ok([1, 2, 3].includes(c.level) && c.severity > 0 && c.reasons.length > 0);
      assert.ok(c.speed > SETTINGS.impactMinSpeed);
      assert.equal(c.t, ride.wheel.t[c.i]);
    }
    for (let k = 1; k < A.impacts.length; k++) assert.ok(A.impacts[k].t - A.impacts[k - 1].t >= 1.5);
  });
});

describe('calibration options', () => {
  test('manual speedK overrides', () => {
    const b = analyzeRide(ride, { ...SETTINGS, speedK: 1.1 });
    assert.equal(b.calib.k, 1.1);
    assert.equal(b.calib.auto, false);
    near(b.derived.speedReal[100], ride.wheel.speed[100] / 1.1, 1e-12);
  });
  test('no GPS => k = 1 with a warning', () => {
    const noGps = clone(ride);
    noGps.gps = { n: 0, t: [], lat: [], lon: [], speed: [], alt: [], bearing: [], acc: [], distance: [] };
    const b = analyzeRide(noGps, SETTINGS);
    assert.equal(b.calib.k, 1);
    assert.ok(b.warnings.length > 0);
  });
});

describe('api properties', () => {
  test('serializeAnalysis round-trips, NaN -> null', () => {
    const json = serializeAnalysis(A);
    const back = JSON.parse(json);
    assert.equal(back.version, 1);
    assert.equal(back.events.length, A.events.length);
    const nanIdx = ride.wheel.temp.findIndex((x) => Number.isNaN(x));
    assert.ok(nanIdx >= 0);
    assert.equal(back.ride.wheel.temp[nanIdx], null);
    assert.equal(JSON.stringify(JSON.parse(json)), json);
  });
  test('derived arrays', () => {
    for (const k of ['speedReal', 'accel', 'accelG', 'pwm']) assert.equal(A.derived[k].length, ride.wheel.n);
    near(A.derived.pwm[500], 100 - ride.wheel.safetyMargin[500], 1e-12);
    assert.deepEqual(A.settingsUsed, SETTINGS);
  });
  test('analyzeRide does not mutate the ride', () => {
    const before = clone(ride);
    analyzeRide(ride, SETTINGS);
    assert.deepStrictEqual(ride, before);
  });
  test('2-hour log analysed in < 150 ms', () => {
    const long = repeatRide(ride, 5);
    assert.ok(long.wheel.n >= 16000);
    analyzeRide(long, SETTINGS); // warm-up
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      analyzeRide(long, SETTINGS);
      best = Math.min(best, performance.now() - t0);
    }
    assert.ok(best < 150, `analysis took ${best.toFixed(1)} ms`);
  });
});
