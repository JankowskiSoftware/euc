# Physics and data-analysis review (analysis core)

Scope: `docs/CONTRACT.md`, `src/analysis/*.mjs`. Checks were run with `npm test` (27/27 pass) and short scripts on
`data/sample.csv`. Sample facts used below: 3200 wheel samples, median spacing 0.60 s but 787 intervals (25 %) shorter
than 0.4 s, max wheel speed 53.2 km/h, max PWM 52 %, Iph −108.7…+84.8 A, Ib −23…+45 A, V 125.5–139.1 V,
k 1.089, margin model a 1.195 / b 0.217 / c −0.35 / residSd 2.07 % (r² 0.95), brake k 0.0303, c −0.25, d −0.0031,
battery R 0.151 Ω. 18 events, none ending at a stop. No blockers found; the core formulas are correct. The problems
are mostly that outputs look more certain than they are.

## Verified correct (no action)
- Units and signs: km/h→m/s (/3.6), g = 9.81, central difference, `speedReal = speed/k`, k = median(wheel/GPS) (right direction), PWM = 100 − margin.
- `predictTiltbackSpeed` closed form and the `pwmAt` quadratic (the root that stays continuous as q→0 is right for both signs of Iph).
- Sag direction: V = Vrest − R·Ib; regen (Iph<0) raises V. Brake d ≈ −0.0031 matches aero drag (½ρCdA/m ≈ 0.0026); c ≈ −0.25 m/s² is rolling resistance plus mean grade.
- A brake-only fit (k 0.031) and a drive-only fit (k 0.028) agree, so one symmetric k is acceptable.
- Timestamps: midnight and DST changes (+0200→+0100) give a continuous t. Empty, single-row, 5-row, stationary and no-GPS inputs all run without throwing.

## Major

**M1 — Tiltback speed is extrapolated far beyond the data, with a fixed current and no error band.**
`src/analysis/models.mjs:8,13,56-74`, `CONTRACT.md:104-107`. The data reach PWM 52 % and 53 km/h, but the predictions go to 65 % PWM
and 63–80 km/h, and the curves go to 90 km/h. Iph is fixed per curve (10/40/80 A), but cruise current grows with v². 10 A at
80 km/h is not possible on flat ground, so "151,2 V / 10 A → 80 km/h" is the most misleading figure. One residSd (2.07 % PWM)
already equals about ±2.3 km/h, and parameter uncertainty grows with extrapolation.
Fix: export `observed {speedMax, pwmMax, iphMin, iphMax}`. Draw curves solid only up to the highest observed speed and dashed
after it. Use a cruise-current model Iph(v) = e + f·v² fitted on steady samples, plus a reserve of +40 A for hills and
acceleration, instead of a constant. Report the speed at PWM = target − 2·residSd as the headline, with the nominal value as
the upper end. Drop the 10 A row or label it "tylko zjazd/bez obciążenia".

**M2 — Voltage reference points hide the dangerous case (empty pack, high current).**
`models.mjs:6-7,52,56,73`. The headline `tiltbackSpeedAtMedian` uses `vMedian`, which is a loaded median: its sag gets
subtracted twice (small, conservative error). `V_LOW` = 126 V (3.5 V/cell) is not an empty pack, and the flag elsewhere uses
118.8 V. On the sample, 126 V and 80 A already give a tiltback at 49.5 km/h wheel speed, which is below the rider's observed
53.2 km/h. A full pack (151.2 V) gives the most optimistic number (73–80 km/h). A rider who learns that number on a fresh
charge will hit tiltback 15–25 km/h earlier at the end of a commute, because the PWM limit stays the same.
Fix: use vRest = [151.2, battery-fit v0 or resting voltage, 118.8]. Make the headline the worst case (lowest vRest, 80 A).
Show the full-pack value only as "przy pełnej baterii".

**M3 — `peakG` is labelled a lower bound but is partly noise.**
`kinematics.mjs:17-25`, `ingest.mjs:122-147`, `events.mjs:81`, `CONTRACT.md:89,229`. The deduplication key is any change in
7 fields. That creates partial-update samples: 25 % of intervals are under 0.4 s, and 286 of them carry an unchanged (stale)
speed. A central difference over a 0.40 s span therefore yields event 2's "peak 0,36 g", while the steepest ~1.2 s window in
the whole ride is 0.31 g. Timing jitter and stale values can push the result up as well as down, so "co najmniej" is false.
Fix: compute acceleration over a minimum span (for example ≥ 1.0 s, using the nearest samples or interpolation), or
deduplicate kinematics on changes of `speed` only. Rename the field "najostrzejszy odcinek ≈1,2 s" and drop the
lower-bound wording.

**M4 — The brake model's current-for-g table is shown as achievable.**
`models.mjs:12,108-110`, `CONTRACT.md:113`. g = 0.4 and 0.5 need −114 A and −147 A, but the data only reach −108.7 A and
0.31 g. Several things are left out: tyre traction (wet asphalt, paint and manhole covers can be around 0.3–0.5 g), the
regen and overvoltage limit (M5), the firmware current limit, and a different rider mass (for example a backpack changes k).
Fix: add `gMaxObserved` and `iphMinObserved`. Mark rows beyond them as "ekstrapolacja" or hide them. Add a traction caveat.
Never phrase a row as "możesz hamować 0,5 g".

**M5 — Regen on a full pack (overvoltage) is neither modelled nor flagged.**
`models.mjs:137-150`, `events.mjs:86-89`. Each event stores `maxVoltage` and `peakRegenI`, but nothing uses them. Starting
at 151.2 V, the sample's −23 A of regen gives about 151.2 + 0.151·23 ≈ 154.7 V. The firmware may cut back braking torque or
raise an overvoltage alarm or tiltback. This matters because the rider is training hard braking, typically right after
charging.
Fix: add a battery or ride flag when `voltageMax` ≥ ~150 V or the start voltage is ≥ ~148 V and brake events exist. Also add
a per-event flag when V + R·|Ib| gets close to the overvoltage threshold.

**M6 — Stopping distance describes how the rider braked, not what the wheel can do.**
`events.mjs:96-106`, `CONTRACT.md:88,95`. `meanG` includes the ramp-in and ramp-out samples (0.20–0.23 g, against
0.26–0.31 g in the steepest steps). `brakingM` = v²/(2·meanG) projects every event to zero speed, although no sample event
actually stops. Wheel speed also over-reads deceleration when the tyre slips, which is worst in the wet. With the k=1 fallback (m1), both v and a are inflated as well.
Fix: label the distance as a projection at the same average intensity. Show the plateau deceleration (steepest ~1.2 s)
separately. Keep `distanceM` (the measured distance) next to it. Show none of these as capability.

## Minor

- **m1 — The k=1 fallback skews all kinematics.** `calib.mjs:41-43`. With no GPS, k=1 makes speeds and accelerations about 9 % too high on this wheel: 27 events instead of 18, meanG +9 %, and stopping distance −9 % (optimistic). A missing `acceleration` or `gps_acc` column (`calib.mjs:32,35`) also triggers a "too little GPS" message, which names the wrong cause. Fix: remember the last automatic k per wheel model, and state the consequence in the warning.
- **m2 — The sag current is too low and uses the wrong R.** `models.mjs:22-23,53`. The measured battery current is Ib ≈ 1.25·Iph·PWM/100, so sag is underestimated by about 25 %. The fit also uses meta R or the 0.17 Ω fallback rather than the fitted 0.151 Ω. The effect is under 1 km/h. Fix: fit the 1.25 factor (η) from the data and use the fitted R when it is valid.
- **m3 — Brake pairing and fit bias.** `models.mjs:97-100`. The Iph mean is not weighted by time, although sample spacing is irregular. Only the left gap is checked, so samples with one-sided acceleration still get mixed in. Noise in Iph (errors in variables) pulls k downward. The pairing was chosen by r² on the same ride. Fix: weight Iph[i−1] and Iph[i] by their intervals, require both neighbours, and report a CI for k.
- **m4 — Battery R lacks a quality gate.** `models.mjs:119-135`. A stationary log with Ib only −17…+34 A still returns R = 0.135 Ω. OCV is modelled as linear in Wh. Fix: require an Ib span of at least 20 A and n ≥ 200, and report a CI before comparing against 1.5×rMeta.
- **m5 — The low-voltage flag is worded as a resting cell voltage.** `models.mjs:143-145`. `voltageMin` is measured under load, but "3,3 V/ogniwo" reads as resting. Fix: add "pod obciążeniem".
- **m6 — Impact positions are off and candidates over-merge.** `ingest.mjs:116-119,135`, `impacts.mjs:34,66`. The position is the last GPS fix, which can be about 1.2 s plus latency old, or 10–15 m at 30 km/h. Merging chains without limit across cobbles or tram tracks. One sample candidate has a neighbour 0.06 s away (a partial-update artefact). Thresholds were tuned on one ride and one rider mass. Fix: interpolate GPS at t, cap the merged span (for example 3 s), and require ≥ 0.3 s spacing to neighbours.
- **m7 — Wh/km uses the inflated distance.** `summary.mjs:22,48`. Wh/km and the headline distance use wheel distance, which is k-inflated by about 9 %. Fix: divide by k, or label it "wg licznika koła".
- **m8 — Models are shown without a quality gate.** `index.mjs:16,35-42`. A fit only fails when n ≤ p, and `MIN_MODEL_SAMPLES` only produces a warning. There is no r² or range gate: a 268-sample ride gave a tiltback speed of 66 km/h with no warning. Fix: hide predictions when n < 200, r² < 0.8, or speedMax < 25 km/h.

## Notes

- **n1 — Timestamp edge cases.** `time.mjs:23,34-42`. A comma in the fraction, or a timestamp with no zone, is silently read as UTC. Backward clock jumps (dt < 0) pass the `<= MAX_NEIGHBOUR_GAP` checks in `events.mjs:32,53,66-67` and `models.mjs:99`; use `> 0 &&`. GPS rows with an unparsable time are pushed with t = NaN (`ingest.mjs:110-114`).
- **n2 — GPS timing and the acceleration column unit.** GPS calibration uses the row arrival time, not `gps_datetime` (`ingest.mjs:112`). The wheel `acceleration` column is about 4× m/s², which looks like km/h/s, so `CALIB_MAX_ACCEL = 1` is roughly 0.28 m/s². Document that.
- **n3 — Least-squares numerics.** OLS uses normal equations, an absolute pivot tolerance of 1e-12, and unscaled columns (v² up to ~250, Iph ±100). This is fine for 3 parameters in float64, but centring or scaling (or QR) would be more robust (`linalg.mjs:31,51-81`).
- **n4 — Grade is not modelled.** Braking downhill is misattributed, and `c` absorbs the mean slope. A slope term from GPS altitude could fix this. The firmware's speed tiltback (separate from the PWM tiltback) is also not modelled.
- **n5 — Phone-clock offset.** `tzOffsetMin` is taken from the first row only, so the clock display after a DST change is off by one hour; t is unaffected.

## Recommended UI caveats (Polish)

- Prędkość tiltbacku: „Ekstrapolacja modelu poza zakres jazdy (maks. zarejestrowane: 53 km/h, PWM 52 %). Niepewność co najmniej ±5 km/h. Przy pustej baterii i dużym obciążeniu (podjazd, mocne przyspieszenie) tiltback nastąpi znacznie wcześniej — liczy się najgorszy przypadek, nie wartość przy pełnej baterii.”
- Pełna bateria: „Na świeżo naładowanej baterii mocne hamowanie odzyskuje energię i podnosi napięcie — koło może ograniczyć siłę hamowania lub zgłosić przepięcie. Nie trenuj maksymalnego hamowania tuż po ładowaniu.”
- Hamowanie: „Średnie opóźnienie i droga zatrzymania opisują Twoje hamowanie w tej jeździe, a nie możliwości koła. Droga to projekcja do zatrzymania przy tej samej średniej intensywności plus 1 s reakcji.”
- Przyczepność: „Model nie zna przyczepności. Na mokrej nawierzchni, malowanych pasach, włazach i liściach realne opóźnienie może być niższe niż w tabeli.”
- Prąd dla g: „Wartości powyżej zarejestrowanych (−109 A, 0,31 g) to ekstrapolacja — nie oznaczają, że koło lub opona je osiągną.”
- Szczyt opóźnienia: „Najostrzejszy odcinek ≈1,2 s (dane co ~0,6 s; wartość przybliżona, nie gwarantowane minimum).”
- Brak GPS: „Brak kalibracji GPS — przyjęto k = 1; prędkości i opóźnienia mogą być zawyżone o ok. 5–10 %.”
- Napięcie: „Napięcie pod obciążeniem spadło do … V (poniżej 118,8 V).”
- Uderzenia: „Kandydaci na dziury wykryci z prądu i pochylenia, bez akcelerometru pionowego; pozycja GPS może być przesunięta o 10–15 m.”
