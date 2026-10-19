// Short Polish caveats the UI shows next to model outputs (see docs/physics-review.md).
import { isFiniteNum } from './linalg.mjs';

const fmt = (x, d) => (isFiniteNum(x) ? x.toFixed(d).replace('.', ',').replace('-', '−') : '—');

/** { tiltback, accel, stopping, brakeCurrent, impacts } — plain strings, numbers filled from this ride. */
export function buildCaveats(marginModel, brakeModel, summary, settings) {
  let tiltback = 'Ekstrapolacja modelu poza zakres jazdy. Przy pustej baterii i dużym obciążeniu (podjazd, ' +
    'mocne przyspieszenie) tiltback nastąpi znacznie wcześniej — liczy się najgorszy przypadek, nie wartość przy pełnej baterii.';
  if (marginModel) {
    const om = marginModel.observedMax;
    let half = 0;
    for (const p of marginModel.predictions) half = Math.max(half, (p.band[1] - p.band[0]) / 2);
    tiltback = `Ekstrapolacja modelu poza zakres jazdy (maks. zarejestrowane: ${fmt(om.speedWheel, 0)} km/h, ` +
      `PWM ${fmt(om.pwm, 0)} %). Niepewność co najmniej ±${fmt(Math.max(5, Math.ceil(half)), 0)} km/h. ` +
      'Przy pustej baterii i dużym obciążeniu (podjazd, mocne przyspieszenie) tiltback nastąpi znacznie wcześniej — ' +
      `liczy się najgorszy przypadek (ok. ${fmt(marginModel.worstCase.speedWheel, 0)} km/h wg licznika), nie wartość przy pełnej baterii.`;
  }
  const accel = 'Najostrzejszy odcinek ≈1–1,2 s (dane co ~0,6 s; wartość przybliżona, nie gwarantowane minimum).';
  const stopping = 'Średnie opóźnienie i droga zatrzymania opisują Twoje hamowanie w tej jeździe, a nie możliwości koła. ' +
    'Droga to projekcja do zatrzymania przy tej samej średniej intensywności plus ' +
    `${fmt(settings.reactionTime, 1)} s reakcji. Prędkość z koła zawyża opóźnienie, gdy opona się ślizga.`;
  const traction = 'Model nie zna przyczepności. Na mokrej nawierzchni, malowanych pasach, włazach i liściach realne ' +
    'opóźnienie może być niższe niż w tabeli.';
  const brakeCurrent = brakeModel
    ? `Wartości powyżej zarejestrowanych (${fmt(brakeModel.observedMinIph, 0)} A, ${fmt(brakeModel.observedPeakBrakeG, 2)} g) ` +
      `to ekstrapolacja — nie oznaczają, że koło lub opona je osiągną. ${traction}`
    : `Wartości powyżej zarejestrowanych (${fmt(summary.iphMin.value, 0)} A) to ekstrapolacja. ${traction}`;
  const impacts = 'Kandydaci na dziury wykryci z prądu i pochylenia, bez akcelerometru pionowego; ' +
    'pozycja GPS może być przesunięta o 10–15 m.';
  return { tiltback, accel, stopping, brakeCurrent, impacts };
}
