// Test utilities: build a long ride by repeating a ride in memory, and structural clones.

/** Concatenate `times` copies of ride (time-shifted) into a new Ride. */
export function repeatRide(ride, times) {
  const span = ride.wheel.t[ride.wheel.n - 1] + 1;
  const cat = (series) => {
    const out = { n: series.n * times };
    for (const [key, arr] of Object.entries(series)) {
      if (!Array.isArray(arr)) continue;
      const res = [];
      for (let r = 0; r < times; r++) {
        for (const v of arr) {
          if (key === 't') res.push(v + r * span);
          else if (key === 'row') res.push(v + r * ride.rawRowCount);
          else res.push(v);
        }
      }
      out[key] = res;
    }
    return out;
  };
  return {
    ...ride,
    rawRowCount: ride.rawRowCount * times,
    wheel: cat(ride.wheel),
    gps: cat(ride.gps),
    last: { ...ride.last },
  };
}

/** Deep clone that keeps NaN (structuredClone does). */
export const clone = (x) => structuredClone(x);

/** Index of the sample nearest to time t. */
export function nearestIndex(tArr, t) {
  let best = 0;
  for (let i = 1; i < tArr.length; i++) if (Math.abs(tArr[i] - t) < Math.abs(tArr[best] - t)) best = i;
  return best;
}
