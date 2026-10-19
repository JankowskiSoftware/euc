// ECharts helpers that read colours from CSS tokens so charts follow light/dark theme.
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function themeColors() {
  const v = (n) => cssVar('--' + n);
  return {
    bg: v('bg'), surface: v('surface'), text: v('text'), muted: v('text-muted'), border: v('border'),
    grid: v('grid-line'), accent: v('accent'), ok: v('ok'), warn: v('warn'), bad: v('bad'),
    wheel: v('series-wheel'), real: v('series-real'), margin: v('series-margin'), current: v('series-current'),
    battery: v('series-battery'), voltage: v('series-voltage'), gps: v('series-gps'),
    zoneOk: v('zone-ok'), zoneWarn: v('zone-warn'), zoneBad: v('zone-bad'),
    bandAlarm: v('band-alarm'), bandMarker: v('band-marker'),
  };
}

// Base option every chart merges in: transparent background, readable text, no animation.
export function baseOption(c = themeColors()) {
  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: c.text, fontSize: 14, fontFamily: cssVar('--font') },
    tooltip: { backgroundColor: c.surface, borderColor: c.border, textStyle: { color: c.text, fontSize: 14 } },
    legend: { textStyle: { color: c.text, fontSize: 14 }, itemHeight: 12 },
  };
}

export function axis(c = themeColors(), extra = {}) {
  return {
    axisLine: { lineStyle: { color: c.border } },
    axisTick: { lineStyle: { color: c.border } },
    axisLabel: { color: c.text, fontSize: 13 },
    splitLine: { lineStyle: { color: c.grid } },
    nameTextStyle: { color: c.muted, fontSize: 13 },
    ...extra,
  };
}

// Calls fn whenever the effective theme changes (system setting or data-theme attribute).
export function onThemeChange(fn) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const handler = () => fn(themeColors());
  mq.addEventListener('change', handler);
  const mo = new MutationObserver(handler);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => { mq.removeEventListener('change', handler); mo.disconnect(); };
}

// Lazily init an ECharts instance and keep it sized to its container.
export function initChart(el) {
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  new ResizeObserver(() => chart.resize()).observe(el);
  return chart;
}
