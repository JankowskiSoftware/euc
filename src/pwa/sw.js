// EUC dashboard service worker (placeholders substituted by build.mjs).
const VERSION = '__VERSION__';
const SHELL = `euc-shell-${VERSION}`;
const TILES = 'euc-tiles';
const SHARED = 'euc-shared';
const PRECACHE = __PRECACHE__;
const TILE_CAP = 150;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('euc-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function handleShare(request) {
  try {
    const fd = await request.formData();
    const f = fd.get('file');
    if (f && typeof f !== 'string') {
      const cache = await caches.open(SHARED);
      await cache.put('shared/latest', new Response(f, {
        headers: { 'content-type': f.type || 'text/csv', 'x-filename': encodeURIComponent(f.name || 'shared.csv') },
      }));
    }
  } catch (err) { /* fall through to redirect */ }
  return Response.redirect('./?shared=1', 303);
}

async function tileFetch(request) {
  const cache = await caches.open(TILES);
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') {
      cache.put(request, res.clone());
      const keys = await cache.keys();
      if (keys.length > TILE_CAP) for (const k of keys.slice(0, keys.length - TILE_CAP)) await cache.delete(k);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('tile.openstreetmap.org')) { e.respondWith(tileFetch(req)); return; }
  if (url.origin === location.origin) {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await c.match('./index.html'); if (idx) return idx; }
      return fetch(req);
    }));
  }
});
