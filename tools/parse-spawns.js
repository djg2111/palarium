#!/usr/bin/env node
// Build js/spawndata.js — where every species spawns in the wild.
//
// Two tables do the work, joined on SpawnerName:
//   DT_PalSpawnerPlacement  8253 placed spawner instances: world position,
//                           radius, and which spawner group sits there
//   DT_PalWildSpawner       1691 weighted rows per group: up to 3 pals each,
//                           with level band, count band and a night-only flag
//
// Output is a separate file from mapdata.js because it's ~10x the size and only
// the map tab ever needs it — app.js loads it on demand.
const fs = require('fs');
const P = 'extract';

const placements = Object.values(JSON.parse(
  fs.readFileSync(`${P}/dt/DT_PalSpawnerPlacement.json`, 'utf8'))[0].Rows || {});
const wildRows = Object.values(JSON.parse(
  fs.readFileSync(`${P}/dt/DT_PalWildSpawner.json`, 'utf8'))[0].Rows || {});
const uiRows = JSON.parse(fs.readFileSync(`${P}/dt/DT_WorldMapUIData.json`, 'utf8'))[0].Rows;

// same two layers and the same swap+flipX projection parse-map.js uses; see
// tools/README.md for why the axes are that way round
const LAYERS = Object.entries(uiRows).map(([key, v]) => ({
  key,
  size: v.minMapTextureBlockSize.X,
  min: v.landScapeRealPositionMin,
  max: v.landScapeRealPositionMax,
}));
const project = (l, wx, wy) => ({
  x: ((wy - l.min.Y) / (l.max.Y - l.min.Y)) * l.size,
  y: (1 - (wx - l.min.X) / (l.max.X - l.min.X)) * l.size,
});
const layerFor = (wx, wy) => LAYERS.find(l =>
  wx >= l.min.X && wx <= l.max.X && wy >= l.min.Y && wy <= l.max.Y) ?? null;
// both layers are square in world space, so one scale per layer covers radii
const pxPerUnit = l => l.size / (l.max.Y - l.min.Y);

// ---- pal keys ----
// Spawner rows name pals in the game's own casing, which disagrees with
// DT_PalMonsterParameter often enough to matter (WindChimes/Windchimes), and
// alpha rows carry a BOSS_ prefix over the base species.
const app = {};
new Function('window', fs.readFileSync('../js/data.js', 'utf8'))(app);
const byLower = new Map(app.PALDATA.pals.map(p => [p.k.toLowerCase(), p.k]));
const resolvePal = raw => {
  if (!raw || raw === 'None' || raw === 'RowName') return null;
  const s = raw.replace(/^BOSS_/i, '');
  return byLower.get(s.toLowerCase()) ?? byLower.get(raw.toLowerCase()) ?? null;
};

// ---- group table: spawner name -> merged pal entries ----
const NIGHT = 1, AURA = 2;
const groups = new Map();          // name -> Map(palKey -> entry)
const unresolved = new Map();
for (const r of wildRows) {
  const name = r.SpawnerName;
  if (!name || name === 'None') continue;
  if (!groups.has(name)) groups.set(name, new Map());
  const g = groups.get(name);
  for (let i = 1; i <= 3; i++) {
    const raw = r[`Pal_${i}`];
    if (!raw || raw === 'None') continue;
    const key = resolvePal(raw);
    if (!key) { unresolved.set(raw, (unresolved.get(raw) || 0) + 1); continue; }
    const lo = r[`LvMin_${i}`] || 0, hi = r[`LvMax_${i}`] || 0;
    const night = r.OnlyTime === 'EPalOneDayTimeType::Night';
    const e = g.get(key);
    if (!e) {
      g.set(key, {lo, hi, w: r.Weight || 0, night, aura: !!r.bHasWorldTreeAura});
    } else {
      e.lo = Math.min(e.lo, lo); e.hi = Math.max(e.hi, hi);
      e.w += r.Weight || 0;
      // a pal listed on both a day row and a night row is not night-only
      e.night = e.night && night;
      e.aura = e.aura && !!r.bHasWorldTreeAura;
    }
  }
}

// ---- placements ----
// Field is the overworld. Dungeon placements sit at the dungeon entrance, which
// is a real place you can walk to, so they're kept but flagged. The three boss
// placement types are already drawn as alpha/tower markers by parse-map.js.
const KIND = {
  'EPalSpawnerPlacementType::Field': 0,
  'EPalSpawnerPlacementType::Dungeon': 1,
};
// Radius and placement type are constant per spawner group (verified: 0 of 273
// groups mix them), so they live on the group and each spot is a bare x,y pair.
// That's ~40% off the file for free.
const names = [];
const nameIdx = new Map();
const meta = [];                   // parallel to names: [radiusPx per layer, kind]
const runs = Object.fromEntries(LAYERS.map(l => [l.key, new Map()]));  // gi -> [x,y,...]
const stats = {placed: 0, noGroup: 0, offLayer: 0, skippedType: 0};

for (const p of placements) {
  const kind = KIND[p.PlacementType];
  if (kind === undefined) { stats.skippedType++; continue; }
  const name = p.SpawnerName;
  if (!name || name === 'None' || !groups.has(name)) { stats.noGroup++; continue; }
  const loc = p.Location;
  if (!loc) continue;
  const layer = layerFor(loc.X, loc.Y);
  if (!layer) { stats.offLayer++; continue; }

  if (!nameIdx.has(name)) {
    nameIdx.set(name, names.length);
    names.push(name);
    meta.push([p.StaticRadius || 15000, kind]);
  }
  const gi = nameIdx.get(name);
  const px = project(layer, loc.X, loc.Y);
  const m = runs[layer.key];
  if (!m.has(gi)) m.set(gi, [gi]);
  m.get(gi).push(Math.round(px.x), Math.round(px.y));
  stats.placed++;
}
// world radius -> map pixels, per layer: the two layers cover very different
// world spans, so the same 15000uu circle is 85px on the surface and 360px
// inside the World Tree
const spots = Object.fromEntries(LAYERS.map(l => [l.key, [...runs[l.key].values()]]));
const radii = Object.fromEntries(LAYERS.map(l =>
  [l.key, meta.map(m => Math.round(m[0] * pxPerUnit(l)))]));

// only ship groups that something actually places
const groupList = names.map(n => {
  const g = groups.get(n);
  return [...g.entries()]
    .sort((a, b) => b[1].w - a[1].w)
    .map(([k, e]) => {
      const flags = (e.night ? NIGHT : 0) | (e.aura ? AURA : 0);
      // trailing zeros trimmed by the writer below
      return [k, e.lo, e.hi, e.w, flags];
    });
});

const out = {
  version: app.PALDATA.version || '1.0.1',
  flags: {night: NIGHT, aura: AURA},
  names,
  groups: groupList,
  kinds: meta.map(m => m[1]),
  radii,
  spots,
};

fs.mkdirSync('../js', {recursive: true});
const json = JSON.stringify(out);
fs.writeFileSync('../js/spawndata.js',
  '// Generated by tools/parse-spawns.js from DT_PalSpawnerPlacement +\n' +
  '// DT_PalWildSpawner. Loaded on demand by the map view — do not edit.\n' +
  'window.SPAWNDATA = ' + json + ';\n');

// ---- report ----
const species = new Set();
for (const g of groupList) for (const e of g) species.add(e[0]);
console.log(`groups placed:  ${names.length} of ${groups.size} defined`);
console.log(`placements:     ${stats.placed}  (skipped: ${stats.skippedType} boss-type, ` +
            `${stats.noGroup} with no group, ${stats.offLayer} off-layer)`);
for (const l of LAYERS) {
  const n = spots[l.key].reduce((a, r) => a + (r.length - 1) / 2, 0);
  console.log(`  ${l.key}: ${n} spots across ${spots[l.key].length} groups`);
}
console.log(`species covered: ${species.size} of ${app.PALDATA.pals.length}`);
console.log(`file size:       ${(json.length / 1024).toFixed(1)} KB`);
const nightOnly = [...new Set(groupList.flatMap(g => g.filter(e => e[4] & NIGHT).map(e => e[0])))];
console.log(`night-only somewhere: ${nightOnly.length}`);
if (unresolved.size) {
  console.log(`\nunresolved pal ids (${unresolved.size}) — expected: unreleased content and NPCs:`);
  console.log('  ' + [...unresolved.entries()].sort((a, b) => b[1] - a[1])
    .slice(0, 20).map(([k, n]) => `${k}×${n}`).join(', '));
}
const missing = app.PALDATA.pals.filter(p => !species.has(p.k));
console.log(`\nspecies with no wild spawn (${missing.length}) — breeding-only, ` +
            `tower bosses and raid pals:`);
console.log('  ' + missing.map(p => p.n).join(', '));
