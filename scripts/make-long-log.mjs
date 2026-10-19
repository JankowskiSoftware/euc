#!/usr/bin/env node
// Build a long test log: the header once, then the data rows repeated COPIES times.
// Usage: node scripts/make-long-log.mjs [input.csv] [output.csv]
// Defaults: data/sample.csv -> data/long.csv. Two streaming passes, no dependencies.
// Copy k (0-based) shifts datetime/gps_datetime by k * (sample span + 1 s) and adds
// k * (final value of the source) to each cumulative column, so all of them keep increasing.

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const COPIES = 5;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inPath = process.argv[2] ?? join(ROOT, 'data', 'sample.csv');
const outPath = process.argv[3] ?? join(ROOT, 'data', 'long.csv');
const CUMULATIVE = ['duration', 'duration_riding', 'distance', 'distance_total', 'energy_consumed',
  'gps_duration', 'gps_duration_riding', 'gps_distance'];
const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3})([+-]\d{4})$/;

// Split one CSV line on commas; quoted fields are kept raw (quotes included).
function splitLine(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const unquote = (s) => (s.length >= 2 && s[0] === '"' && s.at(-1) === '"' ? s.slice(1, -1) : s);

function shiftTs(raw, shiftMs) {
  if (raw === '') return raw;
  const m = TS_RE.exec(unquote(raw));
  if (!m) throw new Error(`unexpected timestamp format: ${raw}`);
  const ms = Date.parse(m[1] + 'Z') + shiftMs; // fixed-offset arithmetic in the local wall clock
  return new Date(ms).toISOString().slice(0, 23) + m[2];
}

function decimals(s) {
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

async function readLines(path, onLine) {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) onLine(line);
}

// Pass 1: header, EOL style, first/last datetime, final value of each cumulative column.
const info = {
  header: null, eol: '\n', first: null, last: null, rows: 0,
  finals: {}, cols: null,
};
await readLines(inPath, (line) => {
  if (info.header === null) {
    info.eol = line.endsWith('\r') ? '\r\n' : '\n';
    info.header = line.replace(/\r$/, '');
    info.cols = splitLine(info.header).map(unquote);
    return;
  }
  const body = line.replace(/\r$/, '');
  if (body === '') return;
  const f = splitLine(body);
  info.rows++;
  const ts = unquote(f[info.cols.indexOf('datetime')] ?? '');
  if (info.first === null) info.first = ts;
  info.last = ts;
  for (const c of CUMULATIVE) {
    const i = info.cols.indexOf(c);
    const v = i >= 0 ? unquote(f[i] ?? '') : '';
    if (v !== '') info.finals[c] = { str: v, num: Number(v) };
  }
});
if (info.rows === 0) throw new Error(`no data rows in ${inPath}`);

const toMs = (ts) => Date.parse(TS_RE.exec(ts)[1] + 'Z');
const spanMs = toMs(info.last) - toMs(info.first);
const periodMs = spanMs + 1000;
const cumIdx = CUMULATIVE.map((c) => [info.cols.indexOf(c), c]).filter(([i]) => i >= 0);
const tsIdx = [info.cols.indexOf('datetime'), info.cols.indexOf('gps_datetime')];

// Pass 2: stream the output.
const out = createWriteStream(outPath, { encoding: 'utf8' });
const write = async (s) => { if (!out.write(s)) await once(out, 'drain'); };
await write(info.header + info.eol);

let written = 0;
let firstOut = null;
let lastOut = null;
for (let k = 0; k < COPIES; k++) {
  const shiftMs = k * periodMs;
  let buf = '';
  await new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(inPath, { encoding: 'utf8' }), crlfDelay: Infinity });
    let headerSeen = false;
    rl.on('line', (line) => {
      try {
        if (!headerSeen) { headerSeen = true; return; }
        const body = line.replace(/\r$/, '');
        if (body === '') return;
        const f = splitLine(body);
        for (const i of tsIdx) if (i >= 0 && f[i] !== undefined) f[i] = shiftTs(f[i], shiftMs);
        for (const [i, c] of cumIdx) {
          const raw = unquote(f[i] ?? '');
          if (raw === '' || k === 0) continue;
          const dec = Math.max(decimals(raw), decimals(info.finals[c]?.str ?? ''));
          f[i] = (Number(raw) + k * (info.finals[c]?.num ?? 0)).toFixed(dec);
        }
        const dt = f[tsIdx[0]];
        if (firstOut === null) firstOut = unquote(dt);
        lastOut = unquote(dt);
        buf += f.join(',') + info.eol;
        written++;
        if (buf.length > 1 << 16) { const chunk = buf; buf = ''; rl.pause(); write(chunk).then(() => rl.resume(), reject); }
      } catch (err) { rl.close(); reject(err); }
    });
    rl.on('close', () => { write(buf).then(resolve, reject); });
    rl.on('error', reject);
  });
}
out.end();
await once(out, 'finish');

const spanSec = (toMs(lastOut) - toMs(firstOut)) / 1000;
console.log(`input:  ${inPath}`);
console.log(`output: ${outPath}`);
console.log(`data rows written: ${written} (${COPIES} copies x ${info.rows} rows)`);
console.log(`time span: ${firstOut} .. ${lastOut} (${spanSec.toFixed(3)} s)`);
