// Settings that change analysis results. Pure data; safe in Node and the browser.
export const DEFAULT_ANALYSIS_SETTINGS = Object.freeze({
  tiltbackPwm: 65,       // % PWM at which the wheel tilts back
  eventG: 0.15,          // |a| threshold that delimits an event, g
  eventPeakG: 0.2,       // event must contain a sample at or above this, g
  eventMinDur: 1.0,      // s
  eventMergeGap: 0.7,    // s; gaps shorter than this are merged
  reactionTime: 1.0,     // s, added to projected stopping distance
  impactIphDev: 25,      // A deviation of Iph from 5-sample rolling median (tuned on sample)
  impactTiltJump: 1.5,   // deg per wheel sample
  impactMinSpeed: 8,     // km/h, wheel speed
  curveIph: 40,          // A, phase current used for the three prediction curves in panel 4
  speedK: null,          // null = auto calibration per ride; number = manual k
});
