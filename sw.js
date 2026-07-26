// Palarium service worker: network-first for the app shell (so deploys land
// immediately when online), cache-first for pal icons (immutable-ish, 299 files).
// v10: new brand assets. The header logo is now artwork rather than styled
// text, so it's precached with the shell — otherwise the header renders empty
// on a cold offline load.
// v11: map view. mapdata.js joins the shell (45 KB, and app.js hides the Map
// tab entirely without it); the tiles it references stay on-demand below.
// v12: spawn zones, region names, and the game's own element/work/item icons.
// spawndata.js is deliberately NOT precached — it's 120 KB that only the map
// tab reads, and it caches itself on first use through the fetch handler.
// v13: corrected fast-travel marker art, passive/egg icon sets, icon dropdowns,
// and re-tiled map (unsharp mask) — every tile filename is unchanged, so the
// cache-first rule below would happily serve the old soft ones forever.
// v14: native z4 tiles, and z0-z3 re-sharpened under the same filenames again.
// v17: mapdata.js gained the second alpha of the two paired spawners (Necromus
// beside Paladius, Celesdir beside Celesdir Noct). Same filename, so an offline
// client would otherwise keep serving a map that says Necromus doesn't exist.
// v18: mapdata.js again — the two Dualith alphas shared one SpawnerID, so one
// of them had no working #/map/ link. Same reasoning as v17.
const VERSION = 'palarium-v18';
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

  if (url.pathname.includes('/assets/pals/') || url.pathname.includes('/assets/map/')
      || url.pathname.includes('/assets/items/') || url.pathname.includes('/assets/ui/')) {
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
  // index.html is the right offline answer for a *navigation* and a wrong one
  // for anything else: handing it back for js/spawndata.js loaded a script tag
  // full of markup, which threw "Unexpected token '<'" and then poisoned the
  // browser's subresource cache so the retry failed too. Fail the request
  // instead — every caller of an on-demand script already has an error path.
  }).catch(() => caches.match(e.request).then(hit => hit
    || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
