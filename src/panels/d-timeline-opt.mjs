// ECharts option for panel 3: speed grid on top, safety-margin grid below, shared time axis.
import { axis, baseOption } from '../app/chartTheme.mjs';
import { fmtClock } from '../app/format.mjs';

const pairs = (t, v) => { const o = new Array(t.length); for (let i = 0; i < t.length; i++) o[i] = [t[i], v[i]]; return o; };

export function alarmBands(analysis, c) {
  const out = [];
  for (const a of analysis.alarms) {
    if (a.bit === 128) continue;
    out.push([{ xAxis: a.tStart, itemStyle: { color: c.bandAlarm } }, { xAxis: Math.max(a.tEnd, a.tStart + 0.6) }]);
  }
  for (const m of analysis.markers) {
    out.push([{ xAxis: m.tStart, itemStyle: { color: c.bandMarker } }, { xAxis: m.tEnd }]);
  }
  return out;
}

export function buildTimelineOption(analysis, settings, c, pan) {
  const ride = analysis.ride, w = ride.wheel;
  const tMax = w.n ? w.t[w.n - 1] : 1;
  const bands = alarmBands(analysis, c);
  const { marginOk, marginBad } = settings;
  let mMin = 0;
  for (const v of w.safetyMargin) if (Number.isFinite(v) && v < mMin) mMin = v;
  mMin = Math.floor(mMin / 10) * 10;
  const line = (name, y, color, extra) => ({
    name, type: 'line', datasetIndex: 0, encode: { x: 't', y }, showSymbol: false, sampling: 'lttb', color, lineStyle: { width: 1.6, color }, silent: true, ...extra,
  });
  const cursor = (id, gi) => ({
    id, type: 'line', xAxisIndex: gi, yAxisIndex: gi, data: [], silent: true,
    markLine: { silent: true, symbol: 'none', animation: false, label: { show: false }, lineStyle: { color: c.text, width: 2, type: 'solid' }, data: [] },
  });
  const xAxis = (gi, show) => ({
    ...axis(c), gridIndex: gi, type: 'value', min: 0, max: tMax, splitNumber: 3,
    axisLabel: { show, color: c.text, fontSize: 12, hideOverlap: true, formatter: (v) => fmtClock(ride, v) },
    splitLine: { show: true, lineStyle: { color: c.grid } },
  });
  const zone = (a, b, color) => [{ yAxis: a, itemStyle: { color } }, { yAxis: b }];
  return {
    ...baseOption(c),
    legend: { ...baseOption(c).legend, top: 0, left: 4, itemGap: 14, data: ['Prędkość koła', 'Prędkość rzeczywista'], textStyle: { color: c.text, fontSize: 13 } },
    dataset: [{ source: { t: w.t, speed: w.speed, real: analysis.derived.speedReal, margin: w.safetyMargin }, dimensions: ['t', 'speed', 'real', 'margin'] }],
    tooltip: { show: false },
    axisPointer: { show: false },
    grid: [{ left: 48, right: 10, top: 52, height: 104 }, { left: 48, right: 10, top: 198, height: 82 }],
    xAxis: [xAxis(0, false), xAxis(1, true)],
    yAxis: [
      { ...axis(c), gridIndex: 0, type: 'value', name: 'km/h', min: 0, nameGap: 8, splitNumber: 3 },
      { ...axis(c), gridIndex: 1, type: 'value', name: 'zapas %', min: mMin, max: 100, nameGap: 8, interval: 25 },
    ],
    dataZoom: [
      { id: 'zin', type: 'inside', xAxisIndex: [0, 1], filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseMove: pan, moveOnMouseWheel: false, preventDefaultMouseMove: pan },
      { id: 'zsl', type: 'slider', xAxisIndex: [0, 1], filterMode: 'none', bottom: 4, height: 30, handleSize: '100%', showDetail: false,
        borderColor: c.border, fillerColor: c.bandMarker, textStyle: { color: c.text }, dataBackground: { lineStyle: { color: c.border }, areaStyle: { color: c.grid } } },
    ],
    series: [
      line('Prędkość koła', 'speed', c.wheel, { xAxisIndex: 0, yAxisIndex: 0, markArea: { silent: true, data: bands } }),
      line('Prędkość rzeczywista', 'real', c.real, { xAxisIndex: 0, yAxisIndex: 0, lineStyle: { width: 1.6, color: c.real, type: 'dashed' } }),
      line('Zapas bezpieczeństwa', 'margin', c.margin, {
        xAxisIndex: 1, yAxisIndex: 1,
        markArea: { silent: true, data: [zone(marginOk, 100, c.zoneOk), zone(marginBad, marginOk, c.zoneWarn), zone(mMin, marginBad, c.zoneBad), ...bands] },
      }),
      cursor('cur0', 0), cursor('cur1', 1),
    ],
  };
}
