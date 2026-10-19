// Small numeric helpers: robust statistics and ordinary least squares via normal equations.

export const isFiniteNum = (x) => typeof x === 'number' && x === x && x !== Infinity && x !== -Infinity;

export function median(values) {
  const a = [];
  for (const v of values) if (isFiniteNum(v)) a.push(v);
  if (!a.length) return NaN;
  a.sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Median of 5 or fewer numbers without allocation-heavy sorting (NaNs ignored). */
export function smallMedian(buf, len) {
  const a = [];
  for (let i = 0; i < len; i++) if (buf[i] === buf[i]) a.push(buf[i]);
  if (!a.length) return NaN;
  a.sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Solve A x = b (A square, small) by Gaussian elimination with partial pivoting; null if singular. */
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-12)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Incremental OLS accumulator. add(xRow, y) with xRow already containing the intercept column if wanted.
 * fit() -> { coef, residSd, r2, n } or null.
 */
export function createLeastSquares(p) {
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  let n = 0, sy = 0, syy = 0;
  const rows = [];
  return {
    add(x, y) {
      for (let i = 0; i < p; i++) {
        Xty[i] += x[i] * y;
        for (let j = i; j < p; j++) XtX[i][j] += x[i] * x[j];
      }
      n++; sy += y; syy += y * y;
      rows.push(x.slice(), y);
    },
    get n() { return n; },
    fit() {
      if (n <= p) return null;
      for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) XtX[i][j] = XtX[j][i];
      const coef = solve(XtX, Xty);
      if (!coef) return null;
      let sse = 0;
      for (let r = 0; r < rows.length; r += 2) {
        const x = rows[r];
        let yh = 0;
        for (let i = 0; i < p; i++) yh += coef[i] * x[i];
        const e = rows[r + 1] - yh;
        sse += e * e;
      }
      const sst = syy - (sy * sy) / n;
      return { coef, residSd: Math.sqrt(sse / (n - p)), r2: sst > 0 ? 1 - sse / sst : NaN, n };
    },
  };
}
