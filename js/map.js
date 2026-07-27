// ---------- map view ----------
// One fixed 8192x8192 "map pixel" stage under a single transform. Tiles,
// markers and the link line are all positioned in map pixels and never move —
// panning and zooming rewrite exactly one transform plus one CSS variable
// (--iz = 1/scale), which the markers read to counter-scale themselves. That
// keeps a 255-marker layer at one style write per frame instead of 255.
const MAP = window.MAPDATA || null;
const MAP_SIZE = 8192, MAP_TILE = 512, MAP_MAXZ = 4;
const LAYER_DIR = {MainMap: 'main', Tree: 'tree'};
const LAYER_NAME = {MainMap: 'Palpagos Islands', Tree: 'World Tree'};
const MTYPE_NAME = {fastTravel: 'Fast travel point', tower: 'Syndicate tower',
  middleBoss: 'World Tree boss', alpha: 'Field alpha'};
// which species have a fixed alpha spawn — read by the pal card's "Show on map"
const MAP_ALPHAS = new Map();

const mapViewEl = document.getElementById('mapView');
const mapStageEl = document.getElementById('mapStage');
const mapTilesEl = document.getElementById('mapTiles');
const mapMarksEl = document.getElementById('mapMarks');
const mapLinkEl = document.getElementById('mapLink');
const mapLinkLine = document.getElementById('mapLinkLine');
const mapInfoEl = document.getElementById('mapInfo');
const mapHelpEl = document.getElementById('mapHelp');
const mapCountEl = document.getElementById('mapCount');
const mapResultsEl = document.getElementById('mapResults');
const mapSearchEl = document.getElementById('mapSearch');
const mapLayerSeg = document.getElementById('mapLayer');
const mapFilterSeg = document.getElementById('mapFilters');
const mapLabelSeg = document.getElementById('mapLabels');

// The enabled filter chips are saved as a set, so a chip that ships later isn't
// in anyone's saved set and would be off for every returning user — invisible
// in development, where the prefs are always fresh. This used to be handled by
// bumping a version constant by hand, which only works if you remember.
// Instead each save records which chips existed at the time; anything the saved
// set has never been offered is new, and defaults to on. Adding a chip to
// index.html is now enough — there is nothing to keep in step.
const mapPrefs = readStore('palarium_map', {});
const MAP_CHIPS = [...mapFilterSeg.querySelectorAll('button[data-t]')].map(b => b.dataset.t);
let mapLayer = LAYER_DIR[mapPrefs.l] ? mapPrefs.l : 'MainMap';
const mapTypes = new Set(Array.isArray(mapPrefs.t)
  ? [...mapPrefs.t.filter(t => MAP_CHIPS.includes(t)),          // drop chips that were retired
     ...MAP_CHIPS.filter(t => !(mapPrefs.k || []).includes(t))] // opt into ones never offered
  : MAP_CHIPS);
let mapK = 0.1, mapMinK = 0.05, mapTX = 0, mapTY = 0;
let mapSel = null, mapBuilt = false, mapQuery = '';
const mapEls = new Map();    // "layer|id" -> marker button
const mapTiles = new Map();  // "dir/z/x/y" -> img
let mapTileSig = '', mapBaseImg = null, mapGlideRAF = 0;
// A pan drags the marker along under the cursor, so a drag that starts on one
// also *ends* on it and Chrome fires a click. Without this the map selected a
// marker every time you grabbed the view near one.
let mapDragged = false;

// map prefs live in their own key: save() runs during boot, before this
// section has initialised, and reading these from there would be a TDZ crash
function mapSavePrefs() {
  // k = the chips that existed when this was written; see MAP_CHIPS above
  localStorage.setItem('palarium_map',
    JSON.stringify({l: mapLayer, t: [...mapTypes], k: MAP_CHIPS, lb: mapLabelMode}));
}

const mapKey = m => m.layer + '|' + m.id;
// BOSS_ rows name the tower variant (Boss_Anubis); the icon is the base pal's
const mapPal = m => m.pal ? (byKey.get(m.pal) || byKey.get(m.pal.replace(/^Boss_/, '')) || null) : null;
const mapTitle = m => m.type === 'alpha' ? (mapPal(m)?.n || m.label) : m.label;
// the tower filter chip covers the three World Tree mid-bosses too
const mapTypeOn = t => mapTypes.has(t === 'middleBoss' ? 'tower' : t);
// world units are centimetres
const fmtDist = d => d >= 1000 ? (d / 1000).toFixed(d < 10000 ? 1 : 0) + ' km' : Math.round(d / 5) * 5 + ' m';
const mapDist = (a, b) => Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y) / 100;

function mapMatch(m, q) {
  if (!q) return true;
  return (m.label || '').toLowerCase().includes(q)
    || (m.boss || '').toLowerCase().includes(q)
    || (mapPal(m)?.n || '').toLowerCase().includes(q);
}

// ---- view transform ----
function mapApply() {
  mapStageEl.style.transform = `translate3d(${mapTX}px,${mapTY}px,0) scale(${mapK})`;
  mapStageEl.style.setProperty('--iz', 1 / mapK);
  mapStageEl.classList.toggle('lab', mapK >= 0.2);
  const rt = 'r' + stageTier(mapK);
  if (!mapStageEl.classList.contains(rt)) {
    mapStageEl.classList.remove('r0', 'r1', 'r2', 'r3');
    mapStageEl.classList.add(rt);
  }
  mapLinkLine.style.strokeWidth = 2.5 / mapK + 'px';
  mapLinkLine.style.strokeDasharray = `${14 / mapK} ${18 / mapK}`;
  mapRenderTiles();
  // the zone edge is baked into the canvas, so it only needs repainting when
  // the zoom bucket changes — a few times per session, not per frame
  if (mapSpawnKey && mapZonesStale()) mapQueueZones();
  mapQueueLabels();
}
// Both textures are square, but the playable area inside them isn't: the
// surface is a diamond and the World Tree fills barely two thirds. Fitting and
// clamping to the marker bounding box instead of the raw 8192 square stops the
// default view from opening on a frame of empty ocean, and stops panning off
// into the void.
const mapBoundsCache = new Map();
function mapBounds() {
  let b = mapBoundsCache.get(mapLayer);
  if (b) return b;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of MAP.markers) {
    if (m.layer !== mapLayer) continue;
    x0 = Math.min(x0, m.map.x); x1 = Math.max(x1, m.map.x);
    y0 = Math.min(y0, m.map.y); y1 = Math.max(y1, m.map.y);
  }
  if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = MAP_SIZE; }
  const pad = MAP_SIZE * 0.025;   // markers stop short of the coastline
  b = {x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad),
       x1: Math.min(MAP_SIZE, x1 + pad), y1: Math.min(MAP_SIZE, y1 + pad)};
  mapBoundsCache.set(mapLayer, b);
  return b;
}
function mapClampTo(k, tx, ty) {
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight, b = mapBounds();
  const w = (b.x1 - b.x0) * k, h = (b.y1 - b.y0) * k;
  return [
    w <= cw ? (cw - w) / 2 - b.x0 * k : Math.min(-b.x0 * k, Math.max(cw - b.x1 * k, tx)),
    h <= ch ? (ch - h) / 2 - b.y0 * k : Math.min(-b.y0 * k, Math.max(ch - b.y1 * k, ty)),
  ];
}
function mapClamp() { [mapTX, mapTY] = mapClampTo(mapK, mapTX, mapTY); }
function mapZoomTo(k, px, py) {
  k = Math.max(mapMinK, Math.min(1, k));
  if (Math.abs(k - mapK) < 1e-6) return;
  if (px == null) { px = mapViewEl.clientWidth / 2; py = mapViewEl.clientHeight / 2; }
  mapTX = px - (px - mapTX) * (k / mapK);
  mapTY = py - (py - mapTY) * (k / mapK);
  mapK = k;
  mapClamp(); mapApply();
}
function mapStopGlide() { if (mapGlideRAF) { cancelAnimationFrame(mapGlideRAF); mapGlideRAF = 0; } }
function mapGlide(tx, ty, k) {
  mapStopGlide();
  if (SMOOTH === 'auto') { mapK = k; mapTX = tx; mapTY = ty; mapApply(); return; }
  const t0 = performance.now(), k0 = mapK, x0 = mapTX, y0 = mapTY;
  const step = now => {
    const u = Math.min(1, (now - t0) / 340), e = 1 - (1 - u) ** 3;
    mapK = k0 + (k - k0) * e; mapTX = x0 + (tx - x0) * e; mapTY = y0 + (ty - y0) * e;
    mapApply();
    mapGlideRAF = u < 1 ? requestAnimationFrame(step) : 0;
  };
  mapGlideRAF = requestAnimationFrame(step);
}
function mapFit(animate) {
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!cw || !ch) return;
  const b = mapBounds();
  mapMinK = Math.min(1, cw / (b.x1 - b.x0), ch / (b.y1 - b.y0));
  const [tx, ty] = mapClampTo(mapMinK, 0, 0);
  if (animate) mapGlide(tx, ty, mapMinK);
  else { mapK = mapMinK; mapTX = tx; mapTY = ty; mapApply(); }
}
function mapFocus(m, zoom) {
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!cw || !ch) return;
  const k = Math.max(mapMinK, Math.min(1, zoom ?? Math.max(mapK, 0.34)));
  const [tx, ty] = mapClampTo(k, cw / 2 - m.map.x * k, ch / 2 - m.map.y * k);
  mapGlide(tx, ty, k);
}

// ---- tiles ----
// Pick the level whose 512px tiles render at ~512 CSS px or better. z4 is the
// source's native 8192px, so at maximum scale the viewer shows 1:1 pixels and
// never upscales — the real fix for a soft map. It costs 41 MB of the pyramid's
// 64, which is why tiles are fetched on demand rather than precached.
const mapTileZoom = k => Math.max(0, Math.min(MAP_MAXZ, Math.ceil(Math.log2(k * MAP_SIZE / MAP_TILE))));
function mapRenderTiles() {
  const dir = LAYER_DIR[mapLayer];
  const z = mapTileZoom(mapK), n = 2 ** z, span = MAP_SIZE / n;
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  const l = Math.max(0, Math.floor(-mapTX / mapK / span) - 1);
  const t = Math.max(0, Math.floor(-mapTY / mapK / span) - 1);
  const r = Math.min(n - 1, Math.floor((-mapTX + cw) / mapK / span) + 1);
  const b = Math.min(n - 1, Math.floor((-mapTY + ch) / mapK / span) + 1);
  const sig = `${dir}/${z}/${l},${t},${r},${b}`;
  if (sig === mapTileSig) return;
  mapTileSig = sig;

  const want = new Set();
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
    const key = `${dir}/${z}/${x}/${y}`;
    want.add(key);
    if (mapTiles.has(key)) continue;
    const img = new Image();
    img.alt = ''; img.decoding = 'async'; img.draggable = false;
    // +1px overlap kills the hairline seams that fractional scaling leaves
    // between neighbours; at 1/1024 of a tile the distortion is invisible
    img.style.cssText = `left:${x * span}px;top:${y * span}px;width:${span + 1}px;height:${span + 1}px`;
    img.src = `assets/map/${dir}/${z}/${x}_${y}.webp`;
    mapTiles.set(key, img);
    mapTilesEl.appendChild(img);
  }
  for (const [key, img] of mapTiles) {
    if (want.has(key)) continue;
    img.remove(); mapTiles.delete(key);
  }
}
function mapResetTiles() {
  for (const img of mapTiles.values()) img.remove();
  mapTiles.clear(); mapTileSig = '';
  if (!mapBaseImg) {
    mapBaseImg = new Image();
    mapBaseImg.className = 'base'; mapBaseImg.alt = ''; mapBaseImg.draggable = false;
    mapTilesEl.appendChild(mapBaseImg);
  }
  // z0 sits under every detail level so changing level never flashes the
  // background while the replacement tiles decode
  mapBaseImg.src = `assets/map/${LAYER_DIR[mapLayer]}/0/0_0.webp`;
  mapTilesEl.insertBefore(mapBaseImg, mapTilesEl.firstChild);
}

// ---- markers ----
// Two spawners hold a pair of alphas at one point: Paladius and Necromus stand
// on the same desert spot, Celesdir and Celesdir Noct on the same World Tree
// one. Their coordinates really are identical, so drawn as-is the second
// marker lands exactly on the first and one of the pair can never be clicked.
// Fan a coincident group apart — purely a display offset, in --fx/--fy, which
// the .mk transform applies *after* its counter-scale so the separation is a
// constant number of screen pixels at every zoom, like the icon's own size.
// left/top stay on the true position, so nothing that measures anything (the
// link line, mapNearest, the statue ranking) sees the nudge at all.
//
// Sideways, starting at 0° rather than straight up: an alpha wears its level
// badge above its own icon, so fanning a pair vertically put the lower one's
// "Lv 60" squarely over the upper one's face.
const MARK_FAN = 15;           // screen px; the alpha icon itself is 26
function mapBuildMarkers() {
  mapMarksEl.textContent = ''; mapEls.clear();
  const here = new Map(), seen = new Map();
  for (const m of MAP.markers) {
    if (m.layer !== mapLayer) continue;
    const pos = m.map.x + ',' + m.map.y;
    here.set(pos, (here.get(pos) || 0) + 1);
  }
  for (const m of MAP.markers) {
    if (m.layer !== mapLayer) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mk mk-' + m.type; b.tabIndex = -1;
    b.style.left = m.map.x + 'px'; b.style.top = m.map.y + 'px';
    const pos = m.map.x + ',' + m.map.y, n = here.get(pos);
    if (n > 1) {
      const i = seen.get(pos) || 0;
      seen.set(pos, i + 1);
      const a = Math.PI * 2 * i / n;
      b.style.setProperty('--fx', (Math.cos(a) * MARK_FAN).toFixed(1) + 'px');
      b.style.setProperty('--fy', (Math.sin(a) * MARK_FAN).toFixed(1) + 'px');
    }
    const g = document.createElement('span'); g.className = 'g';
    if (m.type === 'alpha') {
      const p = mapPal(m);
      const im = new Image();
      im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.draggable = false;
      im.onerror = () => {
        const f = document.createElement('span');
        f.className = 'fb'; f.textContent = (mapTitle(m) || '?')[0];
        im.replaceWith(f);
      };
      if (p) im.src = IMG + p.img; else im.onerror();
      g.appendChild(im);
      if (m.level) {
        const lv = document.createElement('span'); lv.className = 'lvl';
        lv.textContent = 'Lv ' + m.level; b.appendChild(lv);
      }
    }
    // waypoints, towers and World Tree bosses are drawn by CSS from the game's
    // own compass icons, so .g needs nothing in it
    b.appendChild(g);
    const lb = document.createElement('span'); lb.className = 'lb';
    lb.textContent = mapTitle(m); b.appendChild(lb);
    const t = mapTitle(m) + ' — ' + MTYPE_NAME[m.type] + (m.level ? ' Lv ' + m.level : '');
    b.title = t; b.setAttribute('aria-label', t);
    b.addEventListener('click', e => { e.stopPropagation(); if (!mapDragged) mapSelect(m); });
    mapEls.set(mapKey(m), b);
    mapMarksEl.appendChild(b);
  }
}
function mapSyncMarkers() {
  mapRegionsEl.hidden = !mapTypes.has('region');
  const q = mapQuery.trim().toLowerCase();
  const counts = {alpha: 0, fastTravel: 0, tower: 0, middleBoss: 0};
  let matches = 0;
  for (const m of MAP.markers) {
    if (m.layer !== mapLayer) continue;
    const el = mapEls.get(mapKey(m)); if (!el) continue;
    const on = mapTypeOn(m.type);
    el.hidden = !on;
    const hit = mapMatch(m, q);
    el.classList.toggle('dim', on && !!q && !hit);
    if (on) { counts[m.type]++; if (hit) matches++; }
  }
  mapQueueLabels();
  if (q) {
    // a query can match a species (spawn areas) as well as places, and saying
    // "0 matches" next to a species result on screen is just wrong
    const sp = PALS.filter(p => p.n.toLowerCase().includes(q) && spawnEntries(p.k).length).length;
    const bits = [];
    if (sp) bits.push(sp + (sp === 1 ? ' species' : ' species'));
    bits.push(matches + (matches === 1 ? ' place' : ' places'));
    mapCountEl.textContent = bits.join(' · ');
  } else {
    const parts = [];
    if (mapTypes.has('alpha')) parts.push(counts.alpha + ' alphas');
    if (mapTypes.has('fastTravel')) parts.push(counts.fastTravel + ' waypoints');
    if (mapTypes.has('tower')) parts.push(counts.tower + counts.middleBoss + ' towers');
    mapCountEl.textContent = parts.join(' · ') || 'No markers shown';
  }
}

// ---- search results (cross-layer, so "where is Jetragon" works from anywhere) ----
function mapRenderResults() {
  const q = mapQuery.trim().toLowerCase();
  mapResultsEl.textContent = '';
  if (!q) { mapResultsEl.hidden = true; return; }
  // Two kinds of answer to "where is X": the place called X, and the species
  // called X. Species come first — someone typing a pal name wants its range,
  // and any alpha marker of the same name is listed right underneath.
  const species = PALS.filter(p => p.n.toLowerCase().includes(q) && spawnEntries(p.k).length);
  species.sort((a, b) =>
    (b.n.toLowerCase().startsWith(q) ? 1 : 0) - (a.n.toLowerCase().startsWith(q) ? 1 : 0)
    || a.n.localeCompare(b.n));
  const hits = MAP.markers.filter(m => mapTypeOn(m.type) && mapMatch(m, q));
  hits.sort((a, b) => {
    const an = mapTitle(a).toLowerCase(), bn = mapTitle(b).toLowerCase();
    return (bn.startsWith(q) ? 1 : 0) - (an.startsWith(q) ? 1 : 0)
      || (a.layer === mapLayer ? -1 : 0) - (b.layer === mapLayer ? -1 : 0)
      || an.localeCompare(bn);
  });
  mapResultsEl.hidden = false;
  const SPECIES_CAP = 4, MARKER_CAP = 8;
  for (const p of species.slice(0, SPECIES_CAP)) {
    const sum = mapSpawnSummary(p.k);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mres sp';
    const im = new Image(); im.src = IMG + p.img; im.alt = ''; im.loading = 'lazy';
    const tx = document.createElement('span');
    tx.textContent = p.n + ' · ' + sum.spots + ' spawn areas';
    b.append(im, tx);
    b.title = 'Show where ' + p.n + ' spawns';
    b.addEventListener('click', () => { mapSelect(null); mapSetSpawn(p.k, true); });
    mapResultsEl.appendChild(b);
  }
  for (const m of hits.slice(0, MARKER_CAP)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mres';
    const p = mapPal(m);
    if (p) {
      const im = new Image(); im.src = IMG + p.img; im.alt = ''; im.loading = 'lazy'; b.appendChild(im);
    } else {
      const g = document.createElement('span');
      g.className = 'rt ' + (m.type === 'fastTravel' ? 'ft' : 'tw');
      b.appendChild(g);
    }
    const tx = document.createElement('span');
    tx.textContent = mapTitle(m) + (m.level ? ' · Lv ' + m.level : '')
      + (m.layer === mapLayer ? '' : ' · ' + LAYER_NAME[m.layer]);
    b.appendChild(tx);
    b.addEventListener('click', () => mapSelect(m, true));
    mapResultsEl.appendChild(b);
  }
  const extra = Math.max(0, species.length - SPECIES_CAP) + Math.max(0, hits.length - MARKER_CAP);
  if (!hits.length && !species.length) {
    const s = document.createElement('span'); s.className = 'more';
    s.textContent = 'Nothing matches “' + mapQuery.trim() + '” — try a pal or waypoint name.';
    mapResultsEl.appendChild(s);
  } else if (extra) {
    const s = document.createElement('span'); s.className = 'more';
    s.textContent = '+' + extra + ' more'; mapResultsEl.appendChild(s);
  }
}

// ---- selection + detail panel ----
function mapNearest(m, type, n) {
  return MAP.markers
    .filter(f => f.type === type && f.layer === m.layer && f !== m)
    .map(f => ({f, d: mapDist(f, m)}))
    .sort((a, b) => a.d - b.d).slice(0, n);
}
function mapSelect(m, focus) {
  if (!MAP) return;
  if (m && m.layer !== mapLayer) mapSetLayer(m.layer);
  for (const el of mapEls.values()) el.classList.remove('sel', 'near');
  mapSel = m || null;
  if (!mapSel) {
    mapLinkEl.classList.add('off');
    const sp = mapSpawnKey && byKey.get(mapSpawnKey);
    if (sp) mapRenderSpawnInfo(sp);
    else { mapInfoEl.hidden = true; mapInfoEl.textContent = ''; }
    updateHash();
    return;
  }
  mapEls.get(mapKey(mapSel))?.classList.add('sel');
  mapRenderInfo(mapSel);
  if (focus) mapFocus(mapSel);
  updateHash();
}
function mapLinkTo(a, b) {
  if (!a || !b) { mapLinkEl.classList.add('off'); return; }
  mapLinkLine.setAttribute('x1', a.map.x); mapLinkLine.setAttribute('y1', a.map.y);
  mapLinkLine.setAttribute('x2', b.map.x); mapLinkLine.setAttribute('y2', b.map.y);
  mapLinkEl.classList.remove('off');
}
function mapRenderInfo(m) {
  mapInfoEl.hidden = false;
  mapInfoEl.textContent = '';
  const p = mapPal(m);

  const x = document.createElement('button');
  x.type = 'button'; x.className = 'iclose'; x.textContent = '✕';
  x.setAttribute('aria-label', 'Close marker details');
  x.addEventListener('click', () => mapSelect(null));
  mapInfoEl.appendChild(x);

  const head = document.createElement('div'); head.className = 'ihead';
  if (p) head.appendChild(icon(p, 44, true));
  const hb = document.createElement('div');
  const h3 = document.createElement('h3'); h3.textContent = mapTitle(m); hb.appendChild(h3);
  const sub = document.createElement('div'); sub.className = 'isub';
  sub.textContent = MTYPE_NAME[m.type] + (m.level ? ' · Lv ' + m.level : '')
    + (m.boss ? ' · ' + m.boss : '');
  hb.appendChild(sub);
  head.appendChild(hb);
  mapInfoEl.appendChild(head);

  if (p) {
    const crow = document.createElement('div'); crow.className = 'crow';
    crow.appendChild(typeChips(p)); crow.appendChild(tierBadge(p));
    mapInfoEl.appendChild(crow);
  }

  // an alpha or a tower wants the nearest statue; a statue wants to know what's
  // worth walking to from it
  const wantFT = m.type !== 'fastTravel';
  const list = wantFT ? mapNearest(m, 'fastTravel', 3) : mapNearest(m, 'alpha', 4);
  const lb = document.createElement('div'); lb.className = 'nlb';
  lb.textContent = wantFT ? 'Closest fast travel' : 'Alphas near here';
  mapInfoEl.appendChild(lb);
  if (!list.length) {
    const e = document.createElement('div'); e.className = 'isub';
    e.textContent = wantFT ? 'No fast travel point on this layer.' : 'No alphas on this layer.';
    mapInfoEl.appendChild(e);
  } else {
    const wrap = document.createElement('div'); wrap.className = 'near';
    list.forEach(({f, d}, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const n = document.createElement('span'); n.textContent = mapTitle(f) + (f.level ? ' · Lv ' + f.level : '');
      const dd = document.createElement('span'); dd.className = 'd'; dd.textContent = fmtDist(d);
      b.append(n, dd);
      b.title = 'Show ' + mapTitle(f) + ' on the map';
      b.addEventListener('click', () => mapSelect(f, true));
      wrap.appendChild(b);
      if (i === 0) { mapEls.get(mapKey(f))?.classList.add('near'); mapLinkTo(m, f); }
    });
    mapInfoEl.appendChild(wrap);
  }
  if (!list.length) mapLinkTo(null, null);

  const acts = document.createElement('div'); acts.className = 'iacts';
  if (p) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'alink'; b.textContent = 'Pal card';
    b.addEventListener('click', () => openModal(p));
    acts.appendChild(b);
  }
  const cp = document.createElement('button');
  cp.type = 'button'; cp.className = 'alink'; cp.textContent = 'Copy link';
  cp.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0] + '#/map/' + m.id);
      toast('Link to ' + mapTitle(m) + ' copied');
    } catch { toast('Copy failed — clipboard blocked by browser'); }
  });
  acts.appendChild(cp);
  mapInfoEl.appendChild(acts);
}

// ---- layer ----
function mapSetLayer(l) {
  if (!LAYER_DIR[l] || l === mapLayer) return;
  mapLayer = l;
  mapSavePrefs();
  mapLayerSeg.querySelectorAll('button').forEach(b => {
    const on = b.dataset.l === l;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
  mapSel = null;
  mapInfoEl.hidden = true; mapInfoEl.textContent = '';
  mapLinkEl.classList.add('off');
  mapResetTiles();
  mapBuildMarkers();
  mapBuildRegions();
  mapSyncMarkers();
  mapRenderResults();
  mapDrawZones();
  if (mapSpawnKey) { const p = byKey.get(mapSpawnKey); if (p) mapRenderSpawnInfo(p); }
  mapFit();
  updateHash();
}

// ---- activation (the container has no size until the tab is shown) ----
const mapPhone = () => matchMedia('(max-width:640px)').matches;
const mapHeadH = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 0;
function mapSyncHeight() {
  if (!MAP) return;
  // On a phone the control stack above the map runs to half the screen, so a
  // height derived from 100dvh alone pushed the viewport's bottom edge — and
  // with it the info sheet anchored to it — under the fold. Measure instead.
  if (!mapPhone()) { mapViewEl.style.height = ''; return; }
  const navH = bottomNavEl.offsetHeight || 0;
  mapViewEl.style.height = Math.max(300, window.innerHeight - mapHeadH() - navH - 22) + 'px';
}
function mapActivate() {
  if (!MAP) return;
  mapSyncHeight();
  if (!mapBuilt) {
    mapBuilt = true;
    mapResetTiles();
    mapBuildMarkers();
    mapBuildRegions();
    mapSyncMarkers();
    mapFit();
    // the search box offers species as well as places, so the spawn table has
    // to be here before the user types — but not before they open the tab
    mapLoadSpawns().then(() => {
      mapRenderResults();
      if (mapSpawnKey) mapSetSpawn(mapSpawnKey);
      accDecorate();   // the Planner's catch list can be annotated now too
    }).catch(() => toast('Spawn data failed to load — markers still work'));
  }
  // the map now owns a screenful; bring it under the header rather than
  // leaving the user staring at filter chips with the map below the fold
  if (mapPhone()) requestAnimationFrame(() => {
    const top = mapViewEl.getBoundingClientRect().top + window.scrollY - mapHeadH() - 8;
    if (Math.abs(window.scrollY - top) > 10) scrollTo({top: Math.max(0, top), behavior: SMOOTH});
  });
}
// resolves #/map/<marker-id> and #/map/tree
// #/map/spawn/<pal> — resolves the same aliases as every other pal link, and
// waits on the spawn table if the map is opening cold from this URL
function mapOpenSpawnRef(ref) {
  if (!MAP) return;
  const p = resolvePal(ref);
  if (!p) { badLink('Link not recognized — unknown pal' + (ref ? ' “' + ref + '”' : '')); return; }
  mapSelect(null);
  mapLoadSpawns().then(() => mapSetSpawn(p.k, true)).catch(() => {});
}
function mapOpenRef(ref) {
  if (!MAP || !ref) return;
  const low = String(ref).toLowerCase();
  if (low === 'tree') { mapSetLayer('Tree'); return; }
  if (low === 'main' || low === 'mainmap') { mapSetLayer('MainMap'); return; }
  const m = MAP.markers.find(k => k.id && k.id.toLowerCase() === low);
  if (m) mapSelect(m, true);
  else badLink('Link not recognized — no map marker “' + ref + '”');
}

// ---------- spawn zones ----------
// js/spawndata.js is ~120 KB and only the map ever reads it, so it loads on
// first use rather than with the shell. Everything below no-ops until it lands.
const mapZonesEl = document.getElementById('mapZones');
const mapRegionsEl = document.getElementById('mapRegions');
const spawnBarEl = document.getElementById('spawnBar');
const SPAWN_NIGHT = 1;

let SPAWN = null, spawnLoading = null;
let spawnByPal = null;                 // palKey -> [{gi, lo, hi, w, f}]
let spawnRuns = null;                  // layer -> Map(gi -> [gi, x,y, x,y, ...])
let mapSpawnKey = null;

function mapLoadSpawns() {
  if (SPAWN) return Promise.resolve(SPAWN);
  if (spawnLoading) return spawnLoading;
  spawnLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'js/spawndata.js';
    s.onload = () => {
      // The service worker answers a failed shell fetch with index.html, so an
      // offline load resolves this script tag with markup that never defines
      // SPAWNDATA: onload fires and the data isn't there. Reject instead of
      // throwing inside the handler and leaving the promise pending forever —
      // callers all have a rejection path, and none of them has a hang path.
      if (!window.SPAWNDATA || !window.SPAWNDATA.groups) {
        spawnLoading = null; rej(new Error('spawn data unavailable')); return;
      }
      SPAWN = window.SPAWNDATA;
      spawnByPal = new Map();
      SPAWN.groups.forEach((entries, gi) => {
        for (const [k, lo, hi, w, f] of entries) {
          if (!spawnByPal.has(k)) spawnByPal.set(k, []);
          spawnByPal.get(k).push({gi, lo, hi, w, f});
        }
      });
      spawnRuns = {};
      for (const [layer, runs] of Object.entries(SPAWN.spots)) {
        const m = new Map();
        for (const run of runs) m.set(run[0], run);
        spawnRuns[layer] = m;
      }
      res(SPAWN);
    };
    s.onerror = () => { spawnLoading = null; rej(new Error('spawn data unavailable')); };
    document.head.appendChild(s);
  });
  return spawnLoading;
}

const spawnEntries = k => (spawnByPal && spawnByPal.get(k)) || [];
// map pixels -> metres, per layer: the World Tree texture covers a quarter the
// world span of the surface, so a pixel is worth four times less there
const mPerPx = layer => {
  const w = MAP.layers[layer].world;
  return (w.maxY - w.minY) / MAP.layers[layer].size / 100;
};

// every spawn point for a species on one layer, as a flat [x,y,...] list
function spawnPoints(palKey, layer) {
  const runs = spawnRuns && spawnRuns[layer];
  if (!runs) return [];
  const pts = [];
  for (const {gi} of spawnEntries(palKey)) {
    const run = runs.get(gi);
    if (!run) continue;
    for (let i = 1; i < run.length; i += 2) pts.push(run[i], run[i + 1]);
  }
  return pts;
}
const spawnLayersFor = k => Object.keys(MAP.layers).filter(l => spawnPoints(k, l).length);

// ---- the overlay ----
// Canvas rather than SVG: a common species like Mimog has 5,327 circles, which
// is a fine single canvas path and a terrible DOM. Circles are filled opaque
// into one path and the *element* carries the opacity, so overlapping areas
// read as one blob instead of compounding into a dark core.
// A flat wash at low opacity vanished over open water and pale terrain, so the
// union gets a hard bright edge instead. The trick that makes that cheap: every
// spot in a group is the same radius, so union(r) minus union(r - w) is exactly
// a band following the union's outline. Fill the outer union opaque, then knock
// the inner union back with a partially transparent destination-out — one
// canvas, two passes, no per-circle strokes showing through the interior.
// How likely this species is in a given spawner group: its weight over the
// group's total. A pal that's 30% of one biome's table and 3% of another's is
// worth telling apart, and the numbers were already sitting in the data unused.
function spawnShares(palKey) {
  const out = new Map();
  if (!SPAWN) return out;
  for (const {gi, w} of spawnEntries(palKey)) {
    const total = SPAWN.groups[gi].reduce((a, e) => a + e[3], 0) || 1;
    out.set(gi, w / total);
  }
  return out;
}

// Sequential encoding is one hue with monotone lightness — the previous ramp
// slid amber -> red, which is two hues doing one hue's job. Generated by
// tools/zone-ramp.js from the documented orange slot: constant hue (OKLCH 40deg),
// L climbing 0.52 -> 0.84, chroma peaking mid so the top step isn't neon.
// Orange rather than the documented blue sequential default because the surface
// is a satellite map — blue reads as ocean and green as forest.
//
// Discrete buckets, not a continuous gradient: a reader can name which bucket a
// patch is in, but not which shade. ARK's spawn maps bucket theirs too.
const ZONE_RAMP = ['#c64f1f', '#e65e28', '#ff7642', '#fe9e7c', '#ffc0ab'];
// Alpha climbs with lightness rather than sitting flat. Over imagery a constant
// alpha turns the weakest bucket into a blanket over the terrain; monotone
// alpha in the same direction as lightness keeps the encoding single-meaning —
// weak recedes, strong dominates — and lets the map read through underneath.
const ZONE_ALPHA = [0.26, 0.35, 0.43, 0.52, 0.6];
const ZONE_EDGE = '#ffd9a8';
const ZONE_OUTLINE = 'rgba(8,10,14,.82)';
// widths in *screen* pixels, converted to map units at draw time
const RING_SCREEN = 3.4, OUTLINE_SCREEN = 1.6;
// Backing-store cap. At scale 1 a 1200px viewport needs ~2800px of canvas at
// dpr 2; the cap keeps a large monitor at high dpr from allocating a surface
// that would push a phone into a decode failure.
const ZONE_MAX_PX = 3072;
let zoneView = null;          // the map rect currently drawn, in map pixels

// Redraw when the view leaves what's painted or the scale moved materially.
// Panning inside the margin costs nothing — the canvas lives in the stage and
// is positioned in map pixels, so it moves with everything else.
function mapZonesStale() {
  if (!zoneView) return true;
  if (Math.abs(zoneView.k - mapK) / mapK > 0.02) return true;
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  const vx = -mapTX / mapK, vy = -mapTY / mapK;
  return vx < zoneView.x || vy < zoneView.y ||
         vx + cw / mapK > zoneView.x + zoneView.w ||
         vy + ch / mapK > zoneView.y + zoneView.h;
}

function mapDrawZones() {
  const ctx = mapZonesEl.getContext('2d');
  if (!mapSpawnKey || !SPAWN) {
    mapZonesEl.hidden = true; zoneView = null;
    mapZonesEl.width = mapZonesEl.height = 1;
    return 0;
  }
  const runs = spawnRuns[mapLayer];
  const radii = SPAWN.radii[mapLayer];
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!runs || !radii || !cw || !ch) { mapZonesEl.hidden = true; return 0; }

  // Cover the visible map rect plus a margin, at the resolution it's displayed
  // at. A fixed 2048px canvas across the whole 8192px map was a quarter-scale
  // texture stretched 4x at maximum zoom, which is exactly what "pixelated and
  // blurry when you zoom in" looks like.
  const vw = cw / mapK, vh = ch / mapK;
  const mx = vw * 0.3, my = vh * 0.3;
  const rect = {
    x: Math.max(0, -mapTX / mapK - mx),
    y: Math.max(0, -mapTY / mapK - my),
  };
  rect.w = Math.min(MAP_SIZE - rect.x, vw + mx * 2);
  rect.h = Math.min(MAP_SIZE - rect.y, vh + my * 2);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.min(mapK * dpr, ZONE_MAX_PX / Math.max(rect.w, rect.h));
  mapZonesEl.width = Math.max(1, Math.round(rect.w * px));
  mapZonesEl.height = Math.max(1, Math.round(rect.h * px));
  mapZonesEl.style.left = rect.x + 'px';
  mapZonesEl.style.top = rect.y + 'px';
  mapZonesEl.style.width = rect.w + 'px';
  mapZonesEl.style.height = rect.h + 'px';
  // draw in map pixels; the transform handles the rest
  ctx.setTransform(px, 0, 0, px, -rect.x * px, -rect.y * px);
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'source-over';
  zoneView = {...rect, k: mapK};

  const ring = RING_SCREEN / mapK, outline = OUTLINE_SCREEN / mapK;
  const shares = spawnShares(mapSpawnKey);
  const peak = Math.max(...shares.values(), 0.0001);

  // One path per ramp bucket rather than per group: overlapping circles of the
  // same bucket are the same probability and shouldn't darken each other, and
  // buckets paint low-to-high so the better rate wins where two overlap.
  const buckets = ZONE_RAMP.map(() => null);
  const oOut = new Path2D(), oIn = new Path2D(), rOut = new Path2D(), rIn = new Path2D();
  let n = 0;
  for (const {gi} of spawnEntries(mapSpawnKey)) {
    const run = runs.get(gi);
    if (!run) continue;
    const r = Math.max(1, radii[gi]);
    const ri = Math.max(0.5, r - ring);
    const bi = Math.min(ZONE_RAMP.length - 1,
      Math.floor((shares.get(gi) || 0) / peak * ZONE_RAMP.length * 0.999));
    if (!buckets[bi]) buckets[bi] = new Path2D();
    const body = buckets[bi];
    for (let i = 1; i < run.length; i += 2) {
      const cx = run[i], cy = run[i + 1];
      // a moveTo before each arc, or every circle joins the last one
      oOut.moveTo(cx + r + outline, cy); oOut.arc(cx, cy, r + outline, 0, Math.PI * 2);
      rOut.moveTo(cx + r, cy);           rOut.arc(cx, cy, r, 0, Math.PI * 2);
      rIn.moveTo(cx + ri, cy);           rIn.arc(cx, cy, ri, 0, Math.PI * 2);
      oIn.moveTo(cx + ri - outline, cy); oIn.arc(cx, cy, Math.max(0.2, ri - outline), 0, Math.PI * 2);
      body.moveTo(cx + ri, cy);          body.arc(cx, cy, ri, 0, Math.PI * 2);
      n++;
    }
  }
  if (!n) { mapZonesEl.hidden = true; return 0; }

  // Edge as a band: every spot in a group shares a radius, so union(r) minus
  // union(r - w) is exactly the union's outline. It's sandwiched in dark so it
  // stays readable over snow and sand as well as forest and ocean — the same
  // trick the map's text labels use.
  ctx.fillStyle = ZONE_OUTLINE; ctx.fill(oOut);
  ctx.fillStyle = ZONE_EDGE;    ctx.fill(rOut);
  ctx.fillStyle = ZONE_OUTLINE; ctx.fill(rIn);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';       ctx.fill(oIn);
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.clip(oIn);
  for (let i = 0; i < buckets.length; i++) {
    if (!buckets[i]) continue;
    ctx.globalAlpha = ZONE_ALPHA[i];
    ctx.fillStyle = ZONE_RAMP[i];
    ctx.fill(buckets[i]);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  mapZonesEl.hidden = false;
  return n;
}

// ---- "which statue do I warp to" ----
// Ranked by how many spawn points sit within reach of each fast-travel point,
// not by raw distance: the nearest statue to one stray spawner is less useful
// than the one sitting in the middle of the herd.
const POP8 = Uint8Array.from({length: 256}, (_, i) => {
  let c = 0; for (let v = i; v; v >>= 1) c += v & 1; return c;
});
function mapSpawnHubs(palKey, layer, n = 3) {
  const pts = spawnPoints(palKey, layer);
  if (!pts.length) return [];
  const reach = 1200 / mPerPx(layer);          // 1.2 km, in map pixels
  const np = pts.length / 2, words = (np + 7) >> 3;
  const hubs = [];
  for (const f of MAP.markers) {
    if (f.type !== 'fastTravel' || f.layer !== layer) continue;
    let near = 0, best = Infinity;
    // which spots this statue covers, as a bitset — 150 statues over the
    // densest species is ~100 KB, where a list of indices would be megabytes
    const cov = new Uint8Array(words);
    for (let i = 0, p = 0; i < pts.length; i += 2, p++) {
      const d = Math.hypot(pts[i] - f.map.x, pts[i + 1] - f.map.y);
      if (d < reach) { near++; cov[p >> 3] |= 1 << (p & 7); }
      if (d < best) best = d;
    }
    hubs.push({f, near, best, cov});
  }
  hubs.sort((a, b) => b.near - a.near || a.best - b.best);
  // nothing within reach of anywhere: the only honest answer left is distance
  if (!hubs.length || !hubs[0].near) {
    return hubs.slice(0, n).map(h => ({f: h.f, near: h.near, best: h.best, gain: 0}));
  }
  // Scoring each statue on its own gave three names for one place: on a common
  // species the runners-up sit on the same herd as the winner, so they scored
  // nearly the same while adding nowhere new. Pick the leader on raw coverage,
  // then rank the rest by what they *add* — greedy set cover. Falling to a
  // small `gain` is itself the answer for a species that's everywhere: one
  // statue already had it.
  const out = [], taken = new Uint8Array(words);
  for (let r = 0; r < n && hubs.length; r++) {
    let bi = -1, bg = -1, bd = Infinity;
    for (let i = 0; i < hubs.length; i++) {
      let g = 0;
      for (let w = 0; w < words; w++) g += POP8[hubs[i].cov[w] & ~taken[w] & 255];
      if (g > bg || (g === bg && hubs[i].best < bd)) { bi = i; bg = g; bd = hubs[i].best; }
    }
    if (bi < 0 || (r && bg <= 0)) break;      // nothing new left worth a row
    const h = hubs.splice(bi, 1)[0];
    for (let w = 0; w < words; w++) taken[w] |= h.cov[w];
    out.push({f: h.f, near: h.near, best: h.best, gain: bg});
  }
  return out;
}
// One phrasing for both readers of the list. The leader is worth its whole
// catchment; a runner-up is worth only the part of it nobody above already
// covers, which is the number that tells you whether it's worth a second trip.
const hubLabel = (h, i, m) => !h.near ? fmtDist(h.best * m)
  : i ? '+' + h.gain + ' more' : h.near + ' areas';
const hubTitle = (h, i, m) => !h.near ? `Nearest spawn area ${fmtDist(h.best * m)} away`
  : i ? `${h.gain} spawn areas within 1.2 km that the statues above it don’t already cover · nearest ${fmtDist(h.best * m)}`
      : `${h.near} spawn areas within 1.2 km · nearest ${fmtDist(h.best * m)}`;

// ---- selection ----
function mapSetSpawn(palKey, focus) {
  const p = palKey ? byKey.get(palKey) : null;
  mapSpawnKey = p ? p.k : null;
  if (!mapSpawnKey) {
    spawnBarEl.hidden = true; spawnBarEl.textContent = '';
    mapDrawZones();
    if (!mapSel) { mapInfoEl.hidden = true; mapInfoEl.textContent = ''; }
    updateHash();
    return;
  }
  // follow the species to whichever layer it actually lives on
  const layers = spawnLayersFor(mapSpawnKey);
  if (layers.length && !layers.includes(mapLayer)) mapSetLayer(layers[0]);
  mapRenderSpawnBar(p);
  const n = mapDrawZones();
  if (!mapSel) mapRenderSpawnInfo(p);
  if (focus && n) mapFocusSpawns(mapSpawnKey);
  updateHash();
}

// frame the spawn area rather than the whole map — for a species with three
// spawners on one island, fitting the island is the answer
function mapFocusSpawns(palKey) {
  const pts = spawnPoints(palKey, mapLayer);
  if (!pts.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  const pad = 400;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!cw || !ch) return;
  const k = Math.max(mapMinK, Math.min(1, Math.min(cw / (x1 - x0), ch / (y1 - y0))));
  const [tx, ty] = mapClampTo(k, cw / 2 - (x0 + x1) / 2 * k, ch / 2 - (y0 + y1) / 2 * k);
  mapGlide(tx, ty, k);
}

function mapSpawnSummary(palKey) {
  const es = spawnEntries(palKey);
  if (!es.length) return null;
  let lo = Infinity, hi = 0, spots = 0, night = true, dungeonOnly = true;
  const shares = spawnShares(palKey);
  let sLo = Infinity, sHi = 0;
  for (const v of shares.values()) { sLo = Math.min(sLo, v); sHi = Math.max(sHi, v); }
  for (const e of es) {
    lo = Math.min(lo, e.lo); hi = Math.max(hi, e.hi);
    if (!(e.f & SPAWN_NIGHT)) night = false;
    if (SPAWN.kinds[e.gi] === 0) dungeonOnly = false;
    for (const layer of Object.keys(MAP.layers)) {
      const run = spawnRuns[layer]?.get(e.gi);
      if (run) spots += (run.length - 1) / 2;
    }
  }
  return {lo, hi, spots, night, dungeonOnly, groups: es.length,
          shareLo: isFinite(sLo) ? sLo : 0, shareHi: sHi};
}

function mapRenderSpawnBar(p) {
  const sum = mapSpawnSummary(p.k);
  spawnBarEl.hidden = false;
  spawnBarEl.textContent = '';
  spawnBarEl.append(icon(p, 30, true));
  const txt = document.createElement('div'); txt.className = 'sb-txt';
  const b = document.createElement('b'); b.textContent = p.n + ' spawn areas';
  const sub = document.createElement('span');
  sub.textContent = sum
    ? `${sum.spots} areas · Lv ${sum.lo === sum.hi ? sum.lo : sum.lo + '–' + sum.hi}`
    : 'No wild spawns — breeding or raids only';
  txt.append(b, sub);
  spawnBarEl.appendChild(txt);
  if (sum && sum.night) {
    const n = document.createElement('span'); n.className = 'sbadge'; n.textContent = '🌙 Night only';
    spawnBarEl.appendChild(n);
  }
  if (sum && sum.dungeonOnly) {
    const n = document.createElement('span'); n.className = 'sbadge'; n.textContent = 'Dungeons only';
    spawnBarEl.appendChild(n);
  }
  // the shading now carries information, so it needs a key
  if (sum && sum.groups > 1) {
    const lg = document.createElement('div'); lg.className = 'sb-legend';
    const a = document.createElement('span'); a.textContent = 'less common';
    const ramp = document.createElement('span'); ramp.className = 'sb-ramp';
    ramp.title = 'Shading shows how much of each area’s spawn table this pal is';
    // discrete swatches, because the fill is discrete buckets rather than a
    // continuous gradient — the key should say what the map actually does
    for (const c of ZONE_RAMP) {
      const sw = document.createElement('i');
      sw.style.background = c;
      sw.style.opacity = ZONE_ALPHA[ZONE_RAMP.indexOf(c)];
      ramp.appendChild(sw);
    }
    const b = document.createElement('span'); b.textContent = 'more';
    lg.append(a, ramp, b);
    spawnBarEl.appendChild(lg);
  }
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'alink sb-clear'; x.textContent = '✕ Clear';
  if (!sum || sum.groups <= 1) x.style.marginLeft = 'auto';
  x.addEventListener('click', () => mapSetSpawn(null));
  spawnBarEl.appendChild(x);
}

function mapRenderSpawnInfo(p) {
  mapInfoEl.hidden = false;
  mapInfoEl.textContent = '';
  const sum = mapSpawnSummary(p.k);

  const x = document.createElement('button');
  x.type = 'button'; x.className = 'iclose'; x.textContent = '✕';
  x.setAttribute('aria-label', 'Stop showing spawn areas');
  x.addEventListener('click', () => mapSetSpawn(null));
  mapInfoEl.appendChild(x);

  const head = document.createElement('div'); head.className = 'ihead';
  head.appendChild(icon(p, 44, true));
  const hb = document.createElement('div');
  const h3 = document.createElement('h3'); h3.textContent = p.n; hb.appendChild(h3);
  const sub = document.createElement('div'); sub.className = 'isub';
  sub.textContent = sum
    ? `Wild spawns · Lv ${sum.lo === sum.hi ? sum.lo : sum.lo + '–' + sum.hi}` +
      (sum.night ? ' · night only' : '')
    : 'Not catchable in the wild';
  hb.appendChild(sub);
  head.append(hb);
  mapInfoEl.appendChild(head);

  const crow = document.createElement('div'); crow.className = 'crow';
  crow.appendChild(typeChips(p)); crow.appendChild(tierBadge(p));
  mapInfoEl.appendChild(crow);

  if (!sum) {
    // legendaries, sub-species and raid bosses genuinely have no spawner; say so
    // and hand the reader to the tab that can actually get them one
    const e = document.createElement('div'); e.className = 'isub inote';
    const alpha = MAP_ALPHAS.get(p.k);
    e.textContent = alpha
      ? 'No wild spawn area — the only one in the world is the alpha shown on the map.'
      : 'No spawner anywhere in the world files. This one comes from breeding or a raid.';
    mapInfoEl.appendChild(e);
    const acts = document.createElement('div'); acts.className = 'iacts';
    const fp = document.createElement('button');
    fp.type = 'button'; fp.className = 'alink'; fp.textContent = 'Find parents';
    fp.addEventListener('click', () => {
      pickT.set(p, true); reverseShown = {}; renderReverse(); navTab('reverse');
    });
    acts.appendChild(fp);
    mapInfoEl.appendChild(acts);
    if (alpha) mapEls.get(mapKey(alpha[0]))?.classList.add('near');
    return;
  }

  // the number that actually predicts how long you'll be standing there
  const pct = v => (v * 100 < 1 ? '<1' : Math.round(v * 100)) + '%';
  const rate = document.createElement('div'); rate.className = 'isub inote';
  rate.textContent = sum.shareHi
    ? `Makes up ${sum.shareLo === sum.shareHi ? pct(sum.shareHi)
        : pct(sum.shareLo) + '\u2013' + pct(sum.shareHi)} of the spawns in its areas` +
      (sum.groups > 1 ? ' \u2014 brighter shading is where it\u2019s most common.' : '.')
    : '';
  if (rate.textContent) mapInfoEl.appendChild(rate);

  const other = spawnLayersFor(p.k).filter(l => l !== mapLayer);
  if (other.length) {
    const e = document.createElement('div'); e.className = 'isub inote';
    e.textContent = `Also spawns on ${LAYER_NAME[other[0]]}.`;
    mapInfoEl.appendChild(e);
  }

  const hubs = mapSpawnHubs(p.k, mapLayer, 3);
  const lb = document.createElement('div'); lb.className = 'nlb';
  lb.textContent = 'Best fast travel';
  mapInfoEl.appendChild(lb);
  if (!hubs.length) {
    const e = document.createElement('div'); e.className = 'isub';
    e.textContent = 'No spawn areas on this layer.';
    mapInfoEl.appendChild(e);
  } else {
    const m = mPerPx(mapLayer);
    const wrap = document.createElement('div'); wrap.className = 'near';
    hubs.forEach((h, i) => {
      const b = document.createElement('button'); b.type = 'button';
      const n = document.createElement('span'); n.textContent = mapTitle(h.f);
      const d = document.createElement('span'); d.className = 'd';
      d.textContent = hubLabel(h, i, m);
      b.append(n, d);
      b.title = hubTitle(h, i, m);
      b.addEventListener('click', () => mapSelect(h.f, true));
      wrap.appendChild(b);
      if (i === 0) mapEls.get(mapKey(h.f))?.classList.add('near');
    });
    mapInfoEl.appendChild(wrap);
  }

  const acts = document.createElement('div'); acts.className = 'iacts';
  const pc = document.createElement('button');
  pc.type = 'button'; pc.className = 'alink'; pc.textContent = 'Pal card';
  pc.addEventListener('click', () => openModal(p));
  const cp = document.createElement('button');
  cp.type = 'button'; cp.className = 'alink'; cp.textContent = 'Copy link';
  cp.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0] + '#/map/spawn/' + p.k);
      toast('Link to ' + p.n + '’s spawn areas copied');
    } catch { toast('Copy failed — clipboard blocked by browser'); }
  });
  acts.append(pc, cp);
  mapInfoEl.appendChild(acts);
}

// ---------- label placement ----------
// 152 waypoints, 90 alphas and 123 regions all shouting at once is unreadable,
// and a plain on/off toggle trades one bad state for another. This is the
// approach map renderers use: rank the labels, try several anchor positions for
// each, and drop the ones that still collide.
//
// Boxes are computed analytically from measured text rather than read back from
// the DOM — 230 getBoundingClientRect calls per pan would force a layout each
// time, and the labels counter-scale so their screen size is already known.
const LABEL_MODES = ['auto', 'all', 'off'];
let mapLabelMode = LABEL_MODES.includes(mapPrefs.lb) ? mapPrefs.lb : 'auto';
const labelMeasure = document.createElement('canvas').getContext('2d');
const labelWidths = new Map();
function labelWidth(text, region) {
  const key = (region ? 'r|' : 'm|') + text;
  let w = labelWidths.get(key);
  if (w === undefined) {
    // Region labels render uppercase at 12-13px depending on zoom tier, and
    // uppercase is materially wider than the mixed-case string in the DOM.
    // Measuring what's actually drawn, at the larger size, keeps the box on the
    // conservative side — an over-wide box costs a label, an under-wide one
    // silently lets a name sit on top of a marker.
    labelMeasure.font = region
      ? '700 13px "Segoe UI", system-ui, sans-serif'
      : '700 10.5px "Segoe UI", system-ui, sans-serif';
    const t = region ? text.toUpperCase() : text;
    w = labelMeasure.measureText(t).width + (region ? t.length * 1.17 : 0);  // letter-spacing
    labelWidths.set(key, w);
  }
  return w;
}
// half the marker glyph, so a label placed beside one clears the art. Alphas
// carry a level badge above the icon, so their obstacle reaches higher than it
// is wide — without that, a label anchored above lands on the badge.
const MK_HALF = {tower: 15, middleBoss: 12, alpha: 15, fastTravel: 11};
const MK_TOP = {alpha: 28};
const halfOf = m => MK_HALF[m.type] || 12;
const topOf = m => MK_TOP[m.type] || MK_HALF[m.type] || 12;
// anchors in the order they're tried, matching the CSS classes below
const ANCHORS = ['', 'lb-t', 'lb-r', 'lb-l'];
const LABEL_PRIORITY = {tower: 0, middleBoss: 1, fastTravel: 2, alpha: 3};
const LABEL_PAD = 2;
// One margin for everything just outside the viewport. Obstacles and labels
// have to use the same number: a wider margin for labels than for markers lets
// a label at the very edge be placed against an obstacle that was skipped.
const LABEL_EDGE = 160;

// Redrawing is ~30ms for the worst species, so it's debounced like the labels:
// the canvas stays glued during a gesture (it's positioned in map pixels inside
// the stage) and only goes stale at the margins, which the 30% overscan hides.
let zoneTimer = 0;
function mapQueueZones() {
  clearTimeout(zoneTimer);
  zoneTimer = setTimeout(() => { if (mapZonesStale()) mapDrawZones(); }, 70);
}

let labelTimer = 0;
function mapQueueLabels() {
  clearTimeout(labelTimer);
  labelTimer = setTimeout(mapPlaceLabels, 90);
}
function mapPlaceLabels() {
  if (!MAP || !mapBuilt) return;
  const off = mapLabelMode === 'off';
  const all = mapLabelMode === 'all';
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  const placed = [];
  const clear = b => {
    for (const q of placed) {
      if (b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0) return false;
    }
    return true;
  };
  const boxFor = (anchor, sx, sy, w, h, half, top) => {
    if (anchor === 'lb-t') return {x0: sx - w / 2, x1: sx + w / 2, y0: sy - top - 3 - h, y1: sy - top - 3};
    if (anchor === 'lb-r') return {x0: sx + half + 5, x1: sx + half + 5 + w, y0: sy - h / 2, y1: sy + h / 2};
    if (anchor === 'lb-l') return {x0: sx - half - 5 - w, x1: sx - half - 5, y0: sy - h / 2, y1: sy + h / 2};
    return {x0: sx - w / 2, x1: sx + w / 2, y0: sy + half + 3, y1: sy + half + 3 + h};
  };

  // Every marker glyph is an obstacle before any label is placed — the
  // equivalent of Mapbox's icon-allow-overlap:false. Without this the placer
  // happily drops a waypoint name straight across a tower.
  const markers = MAP.markers.filter(m => m.layer === mapLayer && mapTypeOn(m.type));
  if (!off) {
    for (const m of markers) {
      const half = halfOf(m);
      const sx = m.map.x * mapK + mapTX, sy = m.map.y * mapK + mapTY;
      if (sx < -LABEL_EDGE || sy < -LABEL_EDGE || sx > cw + LABEL_EDGE || sy > ch + LABEL_EDGE) continue;
      placed.push({x0: sx - half, x1: sx + half, y0: sy - topOf(m), y1: sy + half});
    }
  }

  const placedText = new Set();
  markers.sort((a, b) => (a === mapSel ? -1 : b === mapSel ? 1 : 0)
    || LABEL_PRIORITY[a.type] - LABEL_PRIORITY[b.type]
    || (b.level || 0) - (a.level || 0));

  for (const m of markers) {
    const el = mapEls.get(mapKey(m));
    if (!el) continue;
    el.classList.remove('lb-t', 'lb-r', 'lb-l');
    if (off && m !== mapSel) { el.classList.add('nolb'); continue; }
    const sx = m.map.x * mapK + mapTX, sy = m.map.y * mapK + mapTY;
    // off-screen labels are hidden and, importantly, reserve no space
    if (sx < -LABEL_EDGE || sy < -LABEL_EDGE || sx > cw + LABEL_EDGE || sy > ch + LABEL_EDGE) {
      el.classList.add('nolb'); continue;
    }
    if (all) { el.classList.remove('nolb'); continue; }
    const w = labelWidth(mapTitle(m)) + LABEL_PAD * 2, h = 15;
    const half = halfOf(m), top = topOf(m);
    let put = null;
    for (const a of ANCHORS) {
      const b = boxFor(a, sx, sy, w, h, half, top);
      if (clear(b)) { put = {a, b}; break; }
    }
    if (!put && m === mapSel) put = {a: '', b: boxFor('', sx, sy, w, h, half, top)};
    if (put) {
      el.classList.remove('nolb');
      if (put.a) el.classList.add(put.a);
      placed.push(put.b);
      placedText.add(mapTitle(m).toLowerCase());
    } else {
      el.classList.add('nolb');
    }
  }

  // regions last: they're background context, so they yield to anything
  // actionable, and they're already gated by the zoom tier in CSS
  for (const el of mapRegionsEl.children) {
    if (off) { el.classList.add('nolb'); continue; }
    const sx = +el.dataset.x * mapK + mapTX, sy = +el.dataset.y * mapK + mapTY;
    if (sx < -LABEL_EDGE || sy < -LABEL_EDGE || sx > cw + LABEL_EDGE || sy > ch + LABEL_EDGE) {
      el.classList.add('nolb'); continue;
    }
    // Read the zoom tier from the data, not from computed style: .nolb itself
    // sets display:none, so asking the DOM whether a region is "hidden by zoom"
    // returns true for anything this function suppressed last pass — which
    // silently let those through untested.
    if (+el.dataset.t > stageTier(mapK)) { el.classList.remove('nolb'); continue; }
    if (all) { el.classList.remove('nolb'); continue; }
    // ~40 regions share a name with the waypoint inside them; printing both is
    // just noise, and the waypoint is the one you can actually travel to
    if (placedText.has(el.textContent.toLowerCase())) { el.classList.add('nolb'); continue; }
    const w = labelWidth(el.textContent, true) + LABEL_PAD * 2, h = 18;
    const b = {x0: sx - w / 2, x1: sx + w / 2, y0: sy - h / 2, y1: sy + h / 2};
    if (clear(b)) { el.classList.remove('nolb'); placed.push(b); }
    else el.classList.add('nolb');
  }

  // "All" means all, overlaps included — that's the point of the mode
  if (!all && !off) mapVerifyLabels();
}

// The pass above models label boxes from measured text, which is fast but is
// still a model — it can't know about a margin someone changes in the
// stylesheet later, and it was quietly 2-3px out per anchor. This second pass
// reads the geometry the browser actually produced and drops any label still
// sitting on a marker it doesn't own. One batched layout read on a 90ms
// debounce, and it means the model drifting can only cost a label, never
// produce the overlap the whole exercise is about.
function mapVerifyLabels() {
  const glyphs = [];
  for (const el of mapMarksEl.children) {
    if (el.hidden) continue;
    // NOT firstElementChild: an alpha's level badge is appended before its
    // glyph, so that would measure the badge and miss the icon entirely
    const g = el.querySelector('.g');
    if (g) glyphs.push({owner: el, r: g.getBoundingClientRect()});
  }
  const labels = [];
  for (const el of mapMarksEl.children) {
    if (el.hidden || el.classList.contains('nolb') || el === mapEls.get(mapSel && mapKey(mapSel))) continue;
    const lb = el.querySelector('.lb');
    if (lb) labels.push({el, owner: el, r: lb.getBoundingClientRect()});
  }
  for (const el of mapRegionsEl.children) {
    if (el.classList.contains('nolb')) continue;
    labels.push({el, owner: null, r: el.getBoundingClientRect()});
  }
  for (const l of labels) {
    if (!l.r.width) continue;
    for (const g of glyphs) {
      if (g.owner === l.owner) continue;
      if (l.r.left < g.r.right - 1 && l.r.right > g.r.left + 1 &&
          l.r.top < g.r.bottom - 1 && l.r.bottom > g.r.top + 1) {
        l.el.classList.add('nolb');
        break;
      }
    }
  }
}

// ---------- region labels ----------
// 123 named areas from the game's own region volumes. They're bucketed by
// physical size so a zoomed-out map shows only the handful of big biomes and
// the small named landmarks appear as you go in — one class write per frame
// instead of 123 visibility checks.
const regionTier = r => r >= 400 ? 0 : r >= 200 ? 1 : r >= 90 ? 2 : 3;
// same thresholds mapApply uses to set the stage's r0..r3 class
const stageTier = k => k < 0.12 ? 0 : k < 0.25 ? 1 : k < 0.45 ? 2 : 3;
function mapBuildRegions() {
  mapRegionsEl.textContent = '';
  for (const r of MAP.regions || []) {
    if (r.layer !== mapLayer) continue;
    const d = document.createElement('div');
    d.className = 'rg t' + regionTier(r.r);
    d.dataset.t = regionTier(r.r);
    d.style.left = r.map.x + 'px';
    d.style.top = r.map.y + 'px';
    d.dataset.x = r.map.x; d.dataset.y = r.map.y;
    d.textContent = r.name;
    mapRegionsEl.appendChild(d);
  }
}

if (MAP) {
  // One extracted marker (the Deserted Islet tower) has no id in the world
  // files. Everything that addresses a marker — #/map/<id>, Copy link, the hash
  // updateHash writes when you select one — keys off it, so give the id-less
  // ones a stable one derived from their actor rather than putting "null" in
  // the address bar and handing out a link that resolves to nothing.
  for (const m of MAP.markers) {
    if (!m.id) m.id = (m.actor || m.type + '_' + m.label).replace(/^BP_/, '').replace(/_C$/, '');
  }
  for (const m of MAP.markers) {
    if (m.type !== 'alpha') continue;
    const p = mapPal(m);
    if (!p) continue;
    if (!MAP_ALPHAS.has(p.k)) MAP_ALPHAS.set(p.k, []);
    MAP_ALPHAS.get(p.k).push(m);
  }
  mapLayerSeg.querySelectorAll('button').forEach(b => {
    const on = b.dataset.l === mapLayer;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => mapSetLayer(b.dataset.l));
  });
  mapFilterSeg.querySelectorAll('button').forEach(b => {
    const t = b.dataset.t;
    const paint = () => {
      const on = mapTypes.has(t);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    };
    paint();
    b.addEventListener('click', () => {
      if (mapTypes.has(t)) mapTypes.delete(t); else mapTypes.add(t);
      paint(); mapSavePrefs();
      // hiding the type the open card describes leaves a card with no marker
      if (mapSel && !mapTypeOn(mapSel.type)) mapSelect(null);
      mapSyncMarkers(); mapRenderResults();
    });
  });
  mapLabelSeg.querySelectorAll('button').forEach(b => {
    const paint = () => {
      const on = b.dataset.lb === mapLabelMode;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    };
    paint();
    b.addEventListener('click', () => {
      mapLabelMode = b.dataset.lb;
      mapLabelSeg.querySelectorAll('button').forEach(x => {
        const on = x.dataset.lb === mapLabelMode;
        x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on));
      });
      mapSavePrefs();
      mapPlaceLabels();
    });
  });
  mapSearchEl.addEventListener('input', () => {
    mapQuery = mapSearchEl.value;
    mapSyncMarkers(); mapRenderResults();
  });
  mapSearchEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = mapResultsEl.querySelector('.mres');
    if (first) first.click();
  });

  // ---- gestures. No setPointerCapture: capturing on the viewport retargets
  // the follow-up click away from the marker button that was pressed. ----
  const ptrs = new Map();
  let pinchD = 0, pinchK = 0, dragged = 0;
  let helpTimer = 0;
  const hideHelp = () => { clearTimeout(helpTimer); mapHelpEl.classList.add('gone'); };
  // it's a hint, not a caption — retire it whether or not anyone touches the map
  helpTimer = setTimeout(hideHelp, 7000);
  mapViewEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.mapzoom, .mapinfo')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    dragged = 0; mapDragged = false;
    mapStopGlide();
    mapViewEl.classList.add('drag');
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y); pinchK = mapK;
    }
  });
  const onMove = e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      dragged += Math.abs(dx) + Math.abs(dy);
      if (dragged > 4) hideHelp();
      mapTX += dx; mapTY += dy; mapClamp(); mapApply();
    } else if (ptrs.size === 2 && pinchD > 0) {
      const [a, b] = [...ptrs.values()];
      const r = mapViewEl.getBoundingClientRect();
      dragged += 20; hideHelp();
      mapZoomTo(pinchK * (Math.hypot(a.x - b.x, a.y - b.y) / pinchD),
        (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    }
  };
  const onUp = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinchD = 0;
    if (ptrs.size) return;
    mapViewEl.classList.remove('drag');
    mapDragged = dragged > 4;   // read by the marker click handler, which runs next
    // a tap on open water clears the selection; a drag that ended there doesn't
    if (dragged <= 4 && !e.target.closest('.mk, .mapzoom, .mapinfo')) mapSelect(null);
  };
  window.addEventListener('pointermove', onMove, {passive: true});
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  mapViewEl.addEventListener('wheel', e => {
    e.preventDefault();
    mapStopGlide(); hideHelp();
    const r = mapViewEl.getBoundingClientRect();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    mapZoomTo(mapK * Math.exp(-d * 0.0016), e.clientX - r.left, e.clientY - r.top);
  }, {passive: false});
  mapViewEl.addEventListener('dblclick', e => {
    if (e.target.closest('.mapzoom, .mapinfo')) return;
    const r = mapViewEl.getBoundingClientRect();
    mapZoomTo(mapK * 1.9, e.clientX - r.left, e.clientY - r.top);
  });
  mapViewEl.addEventListener('keydown', e => {
    const step = e.shiftKey ? 240 : 90;
    const pan = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]}[e.key];
    if (pan) {
      e.preventDefault(); mapStopGlide(); hideHelp();
      mapTX += pan[0]; mapTY += pan[1]; mapClamp(); mapApply();
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); mapZoomTo(mapK * 1.5); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); mapZoomTo(mapK / 1.5); }
    else if (e.key === '0') { e.preventDefault(); mapFit(true); }
    else if (e.key === 'Escape' && mapSel) { e.preventDefault(); mapSelect(null); }
  });
  document.getElementById('mapIn').addEventListener('click', () => { hideHelp(); mapZoomTo(mapK * 1.6); });
  document.getElementById('mapOut').addEventListener('click', () => { hideHelp(); mapZoomTo(mapK / 1.6); });
  document.getElementById('mapReset').addEventListener('click', () => { hideHelp(); mapSelect(null); mapFit(true); });

  // the viewport only has a size once its tab is visible, and the phone
  // breakpoint sizes it off the viewport height, so refit on every resize
  addEventListener('resize', mapSyncHeight);
  new ResizeObserver(() => {
    if (!mapBuilt || !mapViewEl.clientWidth) return;
    const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight, b = mapBounds();
    mapMinK = Math.min(1, cw / (b.x1 - b.x0), ch / (b.y1 - b.y0));
    if (mapK < mapMinK) mapK = mapMinK;
    mapClamp(); mapApply();
  }).observe(mapViewEl);
} else {
  // no mapdata.js — drop the tab rather than route to an empty view
  document.querySelectorAll('[data-v="map"]').forEach(b => b.remove());
  document.getElementById('view-map')?.remove();
}

