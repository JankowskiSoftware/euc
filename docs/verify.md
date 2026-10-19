# Verification report (independent)

## Environment
- Chromium via Playwright, 412x915 @2x, isMobile, hasTouch; light and dark. Build OK; `npm test`: 27/27 pass.
- Re-run: `node test/e2e/verify.mjs` (writes docs/screens/*.png and test/e2e/results.json); `node test/e2e/expected.mjs` prints the independent analysis values.
- Screens: docs/screens/{light|dark}-{p-file,p-summary,p-timeline,p-margin,p-events,p-current,p-impacts,p-map,p-battery,p-settings,full}.png, light-interaction-timeline.png.

## Pass/fail
| # | Check | Result |
|---|---|---|
| 1 | Load sample, ready, both themes, no page/console errors, 6 canvases, screenshots | PASS |
| 2 | Numbers vs analysis | PASS (all match) |
| 3a | No horizontal scroll (scrollWidth - clientWidth = 0) | PASS |
| 3b | Text overflow | PASS with notes (intentional ellipsis only) |
| 3c | Touch targets >= 44 | FAIL (Leaflet controls) |
| 3d | Contrast | PASS light; 1 minor FAIL dark (Leaflet attribution) |
| 4 | Interactions (event detail, impact -> Przebieg, chart readout, settings persist) | PASS |
| 5 | Perf 2 h log at 4x CPU | MARGINAL/FAIL on wall clock (see below) |
| 6 | Offline: requests other than OSM tiles | PASS (0 others; 18 tile requests) |

## Numbers (UI text vs independent analysis)
| Item | Expected | UI | OK |
|---|---|---|---|
| Wheel / GPS distance | 10,498 / 9,871 km | 10,50 / 9,87 km | yes |
| Energy, Wh/km | 330, 31,43 | 330, 31,4 | yes |
| Battery | 67 -> 53, min 51 | 67 -> 53, min 51 | yes |
| Min voltage / max | 125,46 / 139,08 | 125,5 (12:49:24) / 139,1 | yes |
| Vmax wheel / real / GPS | 53,2 / 48,9 / 47,57 | 53,2 / 48,9 / 47,6 | yes |
| k | 1,0886 | 1,089 | yes |
| Min margin | 48 % @630,3 s, 52,1 km/h | 48 %, 12:44:13, 52 km/h | yes |
| Iph max/min | 84,8 / -108,7 | 85 / -109 | yes |
| Ib max/min | 44,85 / -23,1 | 45 / -23 | yes |
| Impacts | 7 (t=616,4; 618,2; 654,5; 886,7; 1133,3; 1328,6; 1387,1) | 7 listed, 12:43:59,6 and 12:48:29,9 are level 2 | yes |
| Brake starts | ...614, 946, 1443, 1523 | 12:43:57, 12:49:29, 12:57:46, 12:59:06 listed | yes |
Notes: the events list showed 15 braking rows (filter default) of 18 events total; all 15 brake starts present in the analysis.

## Layout / contrast offenders
| Selector | Theme | Detail |
|---|---|---|
| `#p-map a.leaflet-control-zoom-in` / `-out` | both | 30x30 px (< 44) |
| `#p-map .leaflet-control-attribution a` ("Leaflet") | both | 54x15 px |
| `#p-map a` (Leaflet attribution link) | dark | contrast 3,23:1 (12 px, needs 4,5) |
| `#app-header span.hdr-sub` | both | text clipped with ellipsis (328 > 320 px) |
| `#p-file span.file-name` | both | ellipsis (299 > 238 px) |
No other contrast failures found in either theme; no other targets < 48 px.
Visual notes: in the timeline panel an empty marker chart (230 px, `.d-marker-chart`, no canvas) leaves a large blank block when there are no markers; the sticky header overlays element screenshots (artifact of capture, not a bug).

## Interactions
Event row tap opens `.e-detail`; impact "Przebieg" scrolls panel 3 to top 0 with readout (12:43:59,6, Iph -108,7 A); tapping the timeline shows readout (12:44:00,8); settings `reactionTime` set to 2,5, Zastosuj, reload -> value 2,5 persisted (restored afterwards).

## Performance (4x CPU throttle, 412x915)
| Case | Wall setInputFiles/click -> ready (ms) | euc-parse-start -> euc-rendered (ms) |
|---|---|---|
| long.csv (39 720 rows) run 1/2/3 | 3574 / 3348 / 3705 | 2875 / 2635 / 3002 |
| long.csv median | 3574 | 2875 |
| Sample via Przykład | 1423 (earlier run 1833) | 1097 (1408) |
Budget 3000 ms: marks median passes narrowly (one run 3002), wall-clock median fails by ~19 %. Scroll to bottom with all panels open on long log: no errors, 6 canvases; only the no-marker chart was empty.

## Defects (prioritised)
1. Perf: 2 h log is ~3,6 s wall at 4x throttle. Suggest profiling parse vs analyse in `src/app/loader.mjs` / `src/main.mjs` (larger Papa chunks, avoid per-row object allocation, defer below-fold charts) to gain ~20 %.
2. Leaflet zoom buttons 30 px and attribution link 15 px violate the 48 px target rule. Fix in `src/styles/panels-e.css`: `.leaflet-control-zoom a{width:48px;height:48px;line-height:48px}`; enlarge attribution padding.
3. Dark-theme attribution link contrast 3,23:1: override `.leaflet-control-attribution a` colour with a token (panels-e.css).
4. Header subtitle and file name are truncated; consider `white-space:normal` / wrapping so the ride date and wheel remain readable (`src/styles/app.css` lines 9-22).
5. Panel 3 shows an empty 230 px marker chart when there are no markers; hide `.d-marker-chart` when `analysis.markers` is empty (`src/panels/p03-timeline.mjs` marker code).
