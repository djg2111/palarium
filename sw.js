// Palarium service worker: network-first for the app shell (so deploys land
// immediately when online), cache-first for pal icons (immutable-ish, 299 files).
// v10: new brand assets. The header logo is now artwork rather than styled
// text, so it's precached with the shell — otherwise the header renders empty
// on a cold offline load.
// v11: map view. mapdata.js joins the shell (45 KB, and app.js hides the Map
// tab entirely without it); the tiles it references stay on-demand below.
const VERSION = 'palarium-v11';
const SHELL = ['.', 'index.html', 'css/style.css', 'js/app.js', 'js/data.js',
  'js/mapdata.js', 'assets/favicon.svg', 'assets/lockup.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/assets/pals/') || url.pathname.includes('/assets/map/')) {
    // cache-first: icons and map tiles never change for a given filename.
    // Tiles are deliberately NOT precached — there are 170 of them (~22 MB) and
    // most users never pan far enough to need most of them, so they accumulate
    // in the cache as they're actually viewed.
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    })));
    return;
  }

  // network-first with cache fallback for everything else (app shell).
  // cache:'no-cache' forces ETag revalidation — a plain fetch() reads through
  // the HTTP cache (max-age=600 on GitHub Pages), which could pair a fresh
  // index.html with a stale stylesheet for up to 10 minutes after a deploy
  e.respondWith(fetch(e.request, {cache: 'no-cache'}).then(res => {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))));
});
