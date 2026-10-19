// Build: dist/euc-dashboard.html (single file) and dist/pwa/ (installable variant).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { renderIcon } from './src/pwa/icons.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const rd = (p) => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } };
const block = (name) => new RegExp(`<!-- build:${name} -->[\\s\\S]*?<!-- /build:${name} -->`);
const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const kb = (n) => (n / 1024).toFixed(0) + ' kB';

let html = rd('src/index.html');
const cssBlock = html.match(block('css'))[0];
const css = [...cssBlock.matchAll(/href="([^"]+)"/g)]
  .map((m) => rd(path.join('src', m[1]))).join('\n').replace(/<\/style/gi, '<\\/style');
const vendorBlock = html.match(block('vendor'))[0];
const vendor = [...vendorBlock.matchAll(/src="([^"]+)"/g)]
  .map((m) => `<script>${safeScript(rd(path.join('src', m[1])))}\n</script>`).join('\n');

const out = await build({
  entryPoints: [path.join(root, 'src/main.mjs')], bundle: true, write: false, format: 'iife',
  target: 'chrome110', minify: true, legalComments: 'none',
});
const app = safeScript(out.outputFiles[0].text);

let sample = '';
try {
  const gz = zlib.gzipSync(fs.readFileSync(path.join(root, 'data/sample.csv')), { level: 9 });
  sample = `<script>globalThis.__EUC_SAMPLE_GZ_B64__="${gz.toString('base64')}"</script>\n`;
} catch { console.warn('no data/sample.csv'); }

html = html.replace(cssBlock, () => `<style>\n${css}\n</style>`)
  .replace(vendorBlock, () => vendor)
  .replace(block('app'), () => `${sample}<script>${app}</script>`);

fs.mkdirSync(path.join(root, 'dist/pwa'), { recursive: true });
const single = path.join(root, 'dist/euc-dashboard.html');
fs.writeFileSync(single, html);
console.log(`dist/euc-dashboard.html  ${kb(Buffer.byteLength(html))}`);

// ---- PWA ----
const pwaDir = path.join(root, 'dist/pwa');
const head = `<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="EUC">
</head>`;
const hi = html.indexOf('</head>');            // first </head> is the real one (vendor code comes later)
const bi = html.lastIndexOf('</body>');
const pwaHtml = html.slice(0, hi) + head + html.slice(hi + 7, bi)
  + `<script>\n${rd('src/pwa/page.js')}</script>\n` + html.slice(bi);
fs.writeFileSync(path.join(pwaDir, 'index.html'), pwaHtml);

const icons = { 'icon-192.png': renderIcon(192), 'icon-512.png': renderIcon(512), 'icon-maskable-512.png': renderIcon(512, true) };
for (const [n, b] of Object.entries(icons)) fs.writeFileSync(path.join(pwaDir, n), b);

const manifest = {
  name: 'EUC Lynx S – analiza jazdy', short_name: 'EUC', lang: 'pl',
  display: 'standalone', start_url: './', scope: './',
  background_color: '#0b1220', theme_color: '#0b1220',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  share_target: {
    action: './share-target', method: 'POST', enctype: 'multipart/form-data',
    params: { files: [{ name: 'file', accept: ['text/csv', '.csv', 'text/comma-separated-values', 'application/octet-stream', 'text/plain'] }] },
  },
};
const manifestJson = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(pwaDir, 'manifest.webmanifest'), manifestJson);

const hash = crypto.createHash('sha256').update(pwaHtml).update(manifestJson)
  .update(Buffer.concat(Object.values(icons))).digest('hex').slice(0, 12);
const precache = ['./', './index.html', './manifest.webmanifest', ...Object.keys(icons).map((n) => './' + n)];
fs.writeFileSync(path.join(pwaDir, 'sw.js'), rd('src/pwa/sw.js')
  .replace('__VERSION__', hash).replace('__PRECACHE__', JSON.stringify(precache)));
console.log(`dist/pwa/index.html  ${kb(Buffer.byteLength(pwaHtml))}  (sw version ${hash})`);
