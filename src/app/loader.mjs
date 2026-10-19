// CSV loading: chunked PapaParse (no worker) feeding the streaming ingester.
import { createIngester } from '../analysis/index.mjs';
import { getSampleBlob } from './sample.mjs';

const REQUIRED = ['datetime', 'speed', 'safety_margin', 'current_phase', 'voltage'];
export const SAMPLE_NAME = 'Przykład (Lynx S, 2026-10-19).csv';

function fail(store, msg) {
  store.set({ status: 'error', error: msg, progress: 0 });
}

export function loadFile(file, store) {
  return new Promise((resolve) => {
    performance.mark('euc-parse-start');
    const fileName = file.name || 'plik.csv';
    store.set({ status: 'parsing', progress: 0, error: null });
    document.body.dataset.state = 'parsing';
    let ingester = null;
    let aborted = false;
    const size = file.size || 1;
    const abort = (msg, parser) => {
      aborted = true;
      try { parser?.abort(); } catch { /* ignore */ }
      fail(store, msg);
      resolve();
    };
    Papa.parse(file, {
      chunkSize: 512 * 1024,
      skipEmptyLines: true,
      chunk(results, parser) {
        if (aborted) return;
        let rows = results.data;
        try {
          if (!ingester) {
            const header = rows[0].map((h) => String(h).replace(/^﻿/, '').trim());
            const missing = REQUIRED.filter((c) => !header.includes(c));
            if (missing.length) {
              return abort(`To nie wygląda na log EUC World: brak kolumn ${missing.join(', ')}.`, parser);
            }
            ingester = createIngester(header);
            rows = rows.slice(1);
          }
          ingester.pushRows(rows);
        } catch (e) {
          return abort(`Błąd wczytywania pliku: ${e.message}`, parser);
        }
        store.set({ progress: Math.min(1, results.meta.cursor / size) });
      },
      complete() {
        if (aborted) return;
        if (!ingester) return abort('Plik jest pusty.', null);
        try {
          const ride = ingester.finish();
          if (!ride.wheel.n) return abort('Plik nie zawiera próbek z koła.', null);
          store.set({ progress: 1, fileName, error: null, status: 'analysing', ride });
        } catch (e) {
          return abort(`Błąd wczytywania pliku: ${e.message}`, null);
        }
        resolve();
      },
      error(err) { abort(`Nie można odczytać pliku: ${err.message || err}`, null); },
    });
  });
}

export async function loadSample(store) {
  store.set({ status: 'parsing', progress: 0, error: null });
  let blob;
  try { blob = await getSampleBlob(); } catch (e) {
    return fail(store, `Nie można wczytać przykładu: ${e.message}`);
  }
  const file = new File([blob], SAMPLE_NAME, { type: 'text/csv' });
  return loadFile(file, store);
}
