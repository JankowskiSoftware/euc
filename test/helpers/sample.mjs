// Loads data/sample.csv once with the vendored PapaParse (UMD build).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// package.json has "type":"module", so require() would treat the UMD file as ESM (and fail);
// evaluate it as CommonJS by hand instead.
function loadPapa() {
  const src = readFileSync(fileURLToPath(new URL('../../vendor/papaparse.min.js', import.meta.url)), 'utf8');
  const module = { exports: {} };
  new Function('module', 'exports', src).call({}, module, module.exports);
  return module.exports;
}
export const Papa = loadPapa();
const SAMPLE = fileURLToPath(new URL('../../data/sample.csv', import.meta.url));

let cached = null;
export function loadSampleRows() {
  if (!cached) {
    const text = readFileSync(SAMPLE, 'utf8');
    const res = Papa.parse(text, { skipEmptyLines: true });
    cached = { header: res.data[0], rows: res.data.slice(1) };
  }
  return cached;
}
