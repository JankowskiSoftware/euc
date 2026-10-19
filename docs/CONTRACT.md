# EUC dashboard — shared contract

Every agent reads this file. If you need to deviate, keep the exported names and shapes below and
report the deviation in your summary. Do not edit files owned by another agent.

## Repo layout and ownership

| Path | Owner | Notes |
|---|---|---|
| `src/analysis/*.mjs`, `test/analysis.test.mjs`, `test/helpers/*` | B | pure ES modules, no DOM, run in Node 22 and Chrome |
| `src/analysis/defaults.mjs` | orchestrator | `DEFAULT_ANALYSIS_SETTINGS` |
| `src/app/{store,settings,format,chartTheme}.mjs`, `src/main.mjs`, `src/index.html`, `src/styles/{tokens,base}.css` | orchestrator | shared infra; ask before changing |
| `src/app/loader.mjs`, `src/app/sample.mjs`, `src/panels/p01-file.mjs`, `p02-summary.mjs`, `p10-settings.mjs`, `src/styles/app.css` | C | app shell, header, layout |
| `src/panels/p03-timeline.mjs`, `p04-margin.mjs`, `p06-current.mjs`, `src/styles/panels-d.css` | D | charts |
| `src/panels/p05-events.mjs`, `p07-impacts.mjs`, `p08-map.mjs`, `p09-battery.mjs`, `src/styles/panels-e.css` | E | lists, map, battery |
| `build.mjs`, `src/pwa/*`, `dist/*` | Phase 3 | |
| `scripts/*`, `docs/data-profile.md` | A | |

Helper modules private to a panel go in `src/panels/<owner-letter>-*.mjs` (e.g. `src/panels/d-zoom.mjs`).
Keep every source file under ~400 lines. Dev: `npm run serve`, open `http://localhost:8080/src/index.html`.
Vendored globals (loaded as classic scripts before the app): `echarts` 5.5.1, `Papa` 5.4.1, `L` (Leaflet 1.9.4).
Use Leaflet `circleMarker`/`polyline` only (no image icons — they would not be inlined).

## Units and sign conventions

Time `t`: seconds since the first CSV row's `datetime` (float). Speeds km/h. `speed` = wheel speedometer;
`speedReal = speed / k`. Acceleration m/s² (`accel`) and g (`accelG = accel / 9.81`), signed, negative = braking.
`current` = battery current A (positive discharge, negative regen). `currentPhase` (Iph) A, negative when braking.
`safetyMargin` % (= 100 − PWM). `pwm` % . Voltage V. Distances: km in summary, m inside events.
Missing numeric values are `NaN` in memory; `serializeAnalysis` writes them as `null`.

## Analysis module (`src/analysis/index.mjs` exports)

```ts
// Streaming ingestion; the browser loader feeds PapaParse chunks, tests feed all rows at once.
function createIngester(header: string[]): { pushRows(rows: string[][]): void; finish(): Ride };
function prepareRideFromRows(header: string[], rows: string[][]): Ride;   // convenience
function analyzeRide(ride: Ride, settings?: Partial<AnalysisSettings>): Analysis;  // pure, fast (<150 ms for 2 h)
function predictTiltbackSpeed(model: MarginModel, vRest: number, iph: number, pwmTarget: number, rOhm: number): number; // wheel km/h
function iphForG(model: BrakeModel, g: number, vKmhReal: number): number;   // signed A; g<0 braking, g>0 accel
function serializeAnalysis(a: Analysis): string;   // JSON, NaN -> null
const ALARM_BITS: { bit: number; key: string; label: string /* Polish */; isAlarm: boolean }[];
// keys: speed3=1, speed2=2, speed1=4, peakCurrent=8, sustainedCurrent=16, temperature=32,
//       overvoltage=64, marker=128 (isAlarm false), safetyMargin=256, speedLimit=512, undervoltage=1024
```

```ts
type AnalysisSettings = typeof DEFAULT_ANALYSIS_SETTINGS;  // see src/analysis/defaults.mjs

type Meta = {
  raw: Record<string, string>;            // every key=value from the `extra` column
  make: string|null; model: string|null; firmware: string|null;
  batteryCircuitResistance: number|null;  // ohm
  phone: string|null; appVersion: string|null;
};

type WheelSeries = {          // deduplicated wheel samples, all arrays length n
  n: number;
  t: number[]; row: number[];             // first timestamp, index of first raw data row
  speed: number[]; voltage: number[]; current: number[]; currentPhase: number[]; power: number[];
  safetyMargin: number[]; tilt: number[]; roll: number[]; battery: number[];
  temp: number[]; tempBatt: number[]; tempCpu: number[]; tempImu: number[];
  distance: number[];                     // km since ride start (column `distance`)
  energyConsumed: number[];               // Wh
  accelCol: number[];                     // the wheel's own `acceleration` column
  alarm: number[];                        // OR of alarm bits over the duplicates
  lat: number[]; lon: number[];           // last known GPS fix on that row
};
type GpsSeries = { n: number; t: number[]; lat: number[]; lon: number[]; speed: number[];
                   alt: number[]; bearing: number[]; acc: number[]; distance: number[] /* km */ };

type Ride = {
  meta: Meta;
  startIso: string;  startMs: number;  tzOffsetMin: number;   // from first row's datetime (+0200 -> 120)
  rawRowCount: number;
  rawAlarmValueCounts: Record<string, number>;  // raw rows, non-zero alarm values: {"1":84,"513":14,...}
  wheel: WheelSeries; gps: GpsSeries;
  last: { distanceKm: number; gpsDistanceKm: number; energyWh: number; durationS: number;
          ridingS: number; speedMaxCol: number };   // last non-empty values of cumulative columns
};

type RideEvent = {
  id: number; kind: 'brake'|'accel';
  i0: number; i1: number;                 // wheel sample indices, inclusive
  tStart: number; tEnd: number; duration: number;
  vStart: number; vEnd: number;           // real km/h
  vStartWheel: number; vEndWheel: number; // wheel km/h
  meanG: number;                          // |Δv/Δt| / 9.81 over [i0,i1] incl. one sample before/after, positive
  peakG: number;                          // max |accelG| in event, positive (lower bound)
  distanceM: number;
  peakIph: number;                        // signed extreme in the event's direction
  minMargin: number; maxMargin: number;
  peakRegenI: number|null;                // most negative battery current (brake only)
  maxVoltage: number;
  stop: { brakingM: number; reactionM: number; totalM: number } | null;  // brake only: v²/(2a) and v·reactionTime from vStart
  lat: number; lon: number;
};

type MarginModel = {
  a: number; b: number; c: number;        // PWM = a·(speed/V)·100 + b·(Iph/V)·100 + c
  residSd: number; n: number; r2: number;
  rOhm: number;                           // used for sag (meta or 0.17 fallback)
  vMedian: number;
  predictions: { vRest: number; iph: number; speedWheel: number; speedReal: number }[];  // 3 vRest × 3 iph
  curves: { vRest: number; iph: number; points: [number, number][] }[];  // [wheel km/h, safety margin %] 0..90 km/h, iph = settings.curveIph
  tiltbackSpeedAtMedian: { speedWheel: number; speedReal: number };     // vRest = vMedian, iph = curveIph
  extrapolated: true;
};
type BrakeModel = {
  k: number; c: number; d: number;        // a[m/s²] = k·Iph + c + d·v², v in m/s (real)
  residSd: number; n: number;
  vRef: number;                           // km/h real, for currentFor
  currentFor: { g: number; brakeIph: number; accelIph: number }[];  // g = 0.3, 0.4, 0.5
};
type BatteryModel = { r: number; v0: number; residSd: number; n: number; rMeta: number|null };

type ImpactCandidate = {
  i: number; t: number; speed: number; speedReal: number;
  iph: number; iphDev: number; tiltJump: number; margin: number;
  lat: number; lon: number;
  severity: number;                       // dimensionless, higher = worse
  level: 1|2|3;                           // for colour
  reasons: ('iph'|'tilt'|'margin')[];
};
type AlarmEpisode = { bit: number; key: string; label: string; tStart: number; tEnd: number; i0: number; i1: number; samples: number };
type Marker = { t: number; tStart: number; tEnd: number; i0: number; i1: number };  // ±10 s window

type Summary = {
  startIso: string; durationS: number; ridingS: number;
  distanceWheelKm: number; distanceGpsKm: number;
  maxSpeedWheel: { value: number; t: number }; maxSpeedReal: { value: number; t: number }; maxSpeedGps: number;
  minMargin: { value: number; t: number; speed: number };
  hardestBrakeId: number|null; hardestAccelId: number|null;   // by meanG
  iphMax: { value: number; t: number }; iphMin: { value: number; t: number };
  ibMax: { value: number; t: number };  ibMin: { value: number; t: number };
  energyWh: number; whPerKm: number;
  batteryStart: number; batteryEnd: number; batteryMin: { value: number; t: number };  // end = last logged value (at rest)
  voltageMin: { value: number; t: number }; voltageMax: number;
  tempMax: { temp: number; tempBatt: number; tempCpu: number; tempImu: number };
  alarmCounts: { bit: number; key: string; label: string; episodes: number; samples: number }[];
  markerTimes: number[];
};

type Analysis = {
  version: 1;
  settingsUsed: AnalysisSettings;
  ride: Ride;
  calib: { k: number; n: number; auto: boolean };
  derived: { speedReal: number[]; accel: number[]; accelG: number[]; pwm: number[] };  // per wheel sample
  events: RideEvent[];                    // chronological
  marginModel: MarginModel|null;
  brakeModel: BrakeModel|null;
  batteryModel: BatteryModel|null;
  battery: { flags: string[] };           // Polish, non-empty => panel 9 highlighted
  impacts: ImpactCandidate[];             // chronological
  alarms: AlarmEpisode[];
  markers: Marker[];
  summary: Summary;
  warnings: string[];                     // Polish caveats (e.g. "k z ustawień", "mało danych do modelu")
};
```

## App infrastructure (orchestrator-owned, use as is)

`src/main.mjs` creates the store and mounts each panel: `mount(root: HTMLElement, ctx)` where `root` is
the section's `.panel-body`. Every panel module exports `mount` and nothing else is required.

```ts
ctx = {
  store: { get(): State; set(patch): void; on(key, fn(value, state)): unsubscribe;
           bus: { emit(name, payload); on(name, fn): unsubscribe } };
  bus: same as store.bus;
  loadFile(file: File|Blob): Promise<void>;   // implemented in src/app/loader.mjs (C)
  loadSample(): Promise<void>;
};
State = { status: 'idle'|'parsing'|'analysing'|'ready'|'error'; progress: number /*0..1*/; error: string|null;
          fileName: string|null; ride: Ride|null; analysis: Analysis|null; settings: Settings };
```

- Loader sets `status:'parsing'`, `progress`, `fileName`, then `ride`. main.mjs runs `analyzeRide` on
  `ride` or `settings` change and sets `analysis`. Panels subscribe to `analysis` (and `settings` for
  display thresholds) and re-render. Sections other than file/settings are hidden until `analysis` exists.
- `document.body.dataset.state` becomes `ready` two frames after analysis is set (perf test waits on it).
- `window.eucApp = ctx` and a `euc-ready` window event are exposed for the PWA glue and tests.

Bus events:
- `focus-time` `{ t: number, span?: number /* s, default 20 */ }` — panel 3 zooms to [t−span/2, t+span/2],
  shows the readout at t, and scrolls itself into view. Emitted by panels 5, 7, 8 and marker chips.
- `open-event` `{ id: number }` — panel 5 opens that event's detail and scrolls into view (emitted by map pins).

`src/app/settings.mjs`: `DEFAULT_SETTINGS` (analysis settings + `marginOk 45, marginBad 35, voltageWarn 122.4,
voltageBad 118.8, tempWarn 55, tempBad 65, batteryWarn 30, batteryBad 15`), `loadSettings()`, `saveSettings(s)`.
Status rule for safety margin: `> marginOk` ok, `< marginBad` bad, otherwise warn.

`src/app/format.mjs`: `fmt(x, digits, unit)` (pl-PL, decimal comma, − sign), `fmtSigned`, `fmtElapsed(t)`,
`fmtClock(ride, t, withTenths)`, `mapsUrl(lat, lon)`, `isNum`, `DASH`.

`src/app/chartTheme.mjs`: `themeColors()`, `baseOption(c)`, `axis(c, extra)`, `onThemeChange(fn)`,
`initChart(el)` (ECharts canvas + ResizeObserver). Re-apply options on theme change.

## DOM mount points (src/index.html)

`#p-file`, `#p-summary`, `#p-timeline`, `#p-margin`, `#p-events`, `#p-current`, `#p-impacts`, `#p-map`
are `<section class="panel"><h2>…</h2><div class="panel-body"></div></section>`; `#p-battery` and
`#p-settings` are `<details class="panel"><summary>…</summary><div class="panel-body">`.
`#app-header` is a sticky header owned by C (file name, ride date, status/progress).
Panel 9 adds class `alert` to `#p-battery` when `analysis.battery.flags.length > 0`.

## CSS tokens (src/styles/tokens.css) and primitives (base.css)

Tokens: `--bg --surface --surface-2 --text --text-muted --border --accent --accent-text --focus`,
`--ok/--ok-bg --warn/--warn-bg --bad/--bad-bg`, series `--series-wheel --series-real --series-margin
--series-current --series-battery --series-voltage --series-gps`, zones `--zone-ok --zone-warn --zone-bad`,
bands `--band-alarm --band-marker`, `--grid-line`, sizes `--fs-base 18px --fs-small 15px --fs-large 22px
--fs-xl 30px --tap 48px --gap --pad 16px --radius`, fonts `--font --font-num`.
Classes: `.panel .btn .btn.secondary .chip .status-ok|warn|bad|none .list .chart .empty .note .num .muted .small`.
Layout target: 412×915 portrait first, no horizontal page scroll, every touch target ≥ 48 px.
Never hard-code colours in JS/CSS; use tokens (charts via `themeColors()`).

## Performance rules

Analysis runs on full-resolution data. Display only: line series use ECharts `sampling: 'lttb'`,
scatters use `large: true` (and may thin to ≤ 4000 points). Budget: 2-hour log (≈40k rows) parsed,
analysed and first-screen rendered in < 3 s at 4× CPU throttle. Panels below the fold may defer chart
init until visible (IntersectionObserver), but must render when scrolled to or when `focus-time` fires.

## UI language

All visible text Polish. Acceleration peaks are lower bounds: show as "co najmniej 0,42 g".
Model predictions are extrapolations: label "ekstrapolacja modelu".
