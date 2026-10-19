import { loadSampleRows } from '../helpers/sample.mjs';
import { prepareRideFromRows, analyzeRide } from '../../src/analysis/index.mjs';
const { header, rows } = loadSampleRows();
const a = analyzeRide(prepareRideFromRows(header, rows));
const s = a.summary;
const o = { calib:a.calib, dist:s.distanceWheelKm, gps:s.distanceGpsKm, wh:s.energyWh, whkm:s.whPerKm, b0:s.batteryStart,b1:s.batteryEnd,bmin:s.batteryMin,
 vmin:s.voltageMin, vmax:s.voltageMax, smax:s.maxSpeedWheel, sreal:s.maxSpeedReal, gpsmax:s.maxSpeedGps, mm:s.minMargin, iphMax:s.iphMax, iphMin:s.iphMin, ibMax:s.ibMax, ibMin:s.ibMin,
 impacts:a.impacts.map(i=>[+i.t.toFixed(1),i.level]), brakes:a.events.filter(e=>e.kind==='brake').map(e=>+e.tStart.toFixed(0)), nEv:a.events.length, startIso:s.startIso};
console.log(JSON.stringify(o));
