#!/usr/bin/env node
// Parse fast-travel points, towers and region volumes out of the exported
// PL_MainWorld5 level, resolve their display names from the L10N tables, and
// project world coords onto the 8192px map using the game's OWN transform
// (DT_WorldMapUIData) rather than reverse-engineered community constants.
const fs = require('fs');
const P = 'extract';

const level = JSON.parse(fs.readFileSync(`${P}/level/PL_MainWorld5.json`, 'utf8'));
const uiRows = JSON.parse(fs.readFileSync(`${P}/dt/DT_WorldMapUIData.json`, 'utf8'))[0].Rows;

// The game ships two map layers with disjoint world bounds: the surface
// (T_WorldMap) and the World Tree interior (T_TreeMap). A marker belongs to
// whichever layer's bounds contain it.
const LAYERS = Object.entries(uiRows).map(([key, v]) => ({
  key,
  size: v.minMapTextureBlockSize.X,
  min: v.landScapeRealPositionMin,
  max: v.landScapeRealPositionMax,
  texture: (v.textureDataMap || [])[0]?.Value?.Texture?.AssetPathName?.split('.').pop() ?? null,
}));

// The map is rotated relative to world space: screen X tracks world Y, and
// screen Y tracks world X *inverted* (UE X grows north, screen Y grows down).
// Established empirically in calibrate.js, which scored all 8 axis-swap/flip
// combinations against the texture — this one put 75% of MainMap and 89% of
// Tree markers on land, against 44% for the next best.
const project = (layer, wx, wy) => ({
  x: ((wy - layer.min.Y) / (layer.max.Y - layer.min.Y)) * layer.size,
  y: (1 - (wx - layer.min.X) / (layer.max.X - layer.min.X)) * layer.size,
});
const layerFor = (wx, wy) => LAYERS.find(l =>
  wx >= l.min.X && wx <= l.max.X && wy >= l.min.Y && wy <= l.max.Y) ?? null;

// L10N: rows are keyed by MsgID -> { TextData: { LocalizedString } }
function loadText(file) {
  const map = new Map();
  try {
    const rows = JSON.parse(fs.readFileSync(`${P}/l10n/${file}.json`, 'utf8'))[0].Rows || {};
    for (const [k, v] of Object.entries(rows)) {
      const s = v?.TextData?.LocalizedString ?? v?.LocalizedString ?? v?.Text ?? null;
      if (s) map.set(k, s);
    }
  } catch (e) { console.error(`  (no ${file}: ${e.message})`); }
  return map;
}
const respawnText = loadText('DT_MapRespawnPointInfoText');
const commonText = loadText('DT_UI_Common_Text_Common');
const worldMapText = loadText('DT_WorldMap_Common_Text_Common');
const lookup = id => respawnText.get(id) ?? respawnText.get(`FAST_TRAVEL_${id}`)
  ?? worldMapText.get(id) ?? commonText.get(id) ?? null;

// an actor's transform lives on the SceneComponent its RootComponent points at;
// ObjectPath ends in the export index, so it indexes straight into the array
const locOf = actor => {
  const ref = actor.Properties?.RootComponent?.ObjectPath;
  if (!ref) return null;
  const idx = Number(ref.split('.').pop());
  return level[idx]?.Properties?.RelativeLocation ?? null;
};

const TOWER_TYPES = {
  BP_PalBossTower_C: 'tower',
  BP_PalBossTower_MiddleBoss_C: 'middleBoss',
  BP_PalBossTower_KingWhale_C: 'tower',
  BP_PalBossTower_LastBoss_C: 'tower',
};

const out = [];
const orphans = [];
let skipped = 0;

for (const o of level) {
  let type = null, id = null, extra = {};
  if (o.Type === 'BP_LevelObject_TowerFastTravelPoint_C') {
    type = 'fastTravel';
    id = o.Properties?.FastTravelPointID ?? null;
  } else if (TOWER_TYPES[o.Type]) {
    type = TOWER_TYPES[o.Type];
    id = (o.Properties?.BossType ?? '').replace('EPalBossType::', '') || null;
    extra.actor = o.Type;
  } else continue;

  const loc = locOf(o);
  if (!loc) { skipped++; continue; }
  const layer = layerFor(loc.X, loc.Y);
  if (!layer) { orphans.push({ id, type, world: loc }); continue; }
  const px = project(layer, loc.X, loc.Y);
  out.push({
    id, type, layer: layer.key,
    label: (id && lookup(id)) || id,
    world: { x: +loc.X.toFixed(1), y: +loc.Y.toFixed(1), z: +loc.Z.toFixed(1) },
    map: { x: +px.x.toFixed(1), y: +px.y.toFixed(1) },
    ...extra,
  });
}

// ---- field alpha bosses (DT_BossSpawnerLoactionData) ----
// CharacterID is BOSS_<tribe>, which is the pal key with the prefix stripped.
const bossRows = Object.values(JSON.parse(
  fs.readFileSync(`${P}/dt/DT_BossSpawnerLoactionData.json`, 'utf8'))[0].Rows || {});

// The location table says *where* a field boss stands, but it names only one
// pal. The roster is in DT_PalWildSpawner, keyed by the same spawner id, and a
// spawner can list more than one alpha: 81_2_dessert_FBOSS_2 is Paladius *and*
// Necromus, both Lv 60 in the same desert spot, and worldtree_9_11_N_FBOSS_1
// is the same arrangement for Celesdir and Celesdir Noct. Reading CharacterID
// alone dropped the second of each pair, so the app reported a pal you can
// walk up to and catch as having no spawner anywhere in the world.
//
// Only the BOSS_-prefixed slots are alphas. The rest are the ordinary pals
// that mill around one — BOSS_KingAlpaca's spawner also lists Lv 5-7 Alpacas,
// which are not a second alpha and must not become a marker.
const bossRoster = (() => {
  const m = new Map();
  const rows = JSON.parse(fs.readFileSync(`${P}/dt/DT_PalWildSpawner.json`, 'utf8'))[0].Rows || {};
  for (const v of Object.values(rows)) {
    if (!v.SpawnerName || !String(v.SpawnerType || '').includes('FieldBoss')) continue;
    const list = [];
    for (let i = 1; i <= 3; i++) {
      const p = v['Pal_' + i];
      if (typeof p === 'string' && p.startsWith('BOSS_'))
        list.push({ key: p.replace(/^BOSS_/, ''), level: v['LvMin_' + i] ?? null });
    }
    if (list.length) m.set(v.SpawnerName, list);
  }
  return m;
})();
const palNames = (() => {
  const m = new Map();
  try {
    const rows = JSON.parse(fs.readFileSync(`${P}/l10n/DT_PalNameText_Common.json`, 'utf8'))[0].Rows || {};
    for (const [k, v] of Object.entries(rows)) {
      const s = v?.TextData?.LocalizedString ?? v?.LocalizedString;
      if (s) m.set(k.replace(/^PAL_NAME_/, ''), s);
    }
  } catch {}
  return m;
})();

for (const r of bossRows) {
  if (!r.Location || !r.CharacterID || r.CharacterID === 'None') continue;
  const layer = layerFor(r.Location.X, r.Location.Y);
  if (!layer) continue;
  const key = r.CharacterID.replace(/^BOSS_/, '');
  const px = project(layer, r.Location.X, r.Location.Y);
  // the location table's own pal first, then any other alpha the same spawner
  // rolls. The primary keeps the bare SpawnerID so every #/map/<id> link that
  // already exists still resolves; the extras take the pal key as a suffix.
  const pals = [{ key, level: r.Level ?? null },
    ...(bossRoster.get(r.SpawnerID) || []).filter(p => p.key !== key)];
  pals.forEach((p, i) => out.push({
    id: (r.SpawnerID ?? key) + (i ? '_' + p.key : ''), type: 'alpha', layer: layer.key,
    pal: p.key,
    label: palNames.get(p.key) ?? p.key,
    level: p.level ?? r.Level ?? null,
    world: { x: +r.Location.X.toFixed(1), y: +r.Location.Y.toFixed(1), z: +r.Location.Z.toFixed(1) },
    map: { x: +px.x.toFixed(1), y: +px.y.toFixed(1) },
  }));
}

// ---- tower labels ----
// Tower actors carry only a BossType enum. The game names the *entrance*, so
// borrow the label from the fast-travel point sitting on top of the tower
// (all matched within 100m below), and add the syndicate leader's name.
const npcNames = (() => {
  const m = new Map();
  try {
    const rows = JSON.parse(fs.readFileSync(`${P}/l10n/DT_UniqueNPCText_Common.json`, 'utf8'))[0].Rows || {};
    for (const [k, v] of Object.entries(rows)) {
      const s = v?.TextData?.LocalizedString ?? v?.LocalizedString;
      if (s) m.set(k, s);
    }
  } catch {}
  return m;
})();
for (const t of out) {
  if (t.type !== 'tower' && t.type !== 'middleBoss') continue;
  let best = null, bd = Infinity;
  for (const f of out) {
    if (f.type !== 'fastTravel' || f.layer !== t.layer) continue;
    const d = (f.world.x - t.world.x) ** 2 + (f.world.y - t.world.y) ** 2;
    if (d < bd) { bd = d; best = f; }
  }
  // squared distance; every tower's entrance measured under ~10,000 units away
  if (best && bd < 1.2e8) t.label = best.label.replace(/\s*Entrance$/, '');
  const npc = t.id && npcNames.get('NAME_' + t.id);
  if (npc) t.boss = npc;
}

// ---- named regions ----
// Only 13 of the ~124 region volumes live in the persistent level; World
// Partition puts the rest in per-cell .umap packages with hashed names, which
// is what `palex scan` sweeps into extract/out/regionCells.json. Run that first
// or you get a map labelled with a seventh of its regions.
const areaRows = JSON.parse(fs.readFileSync(`${P}/dt/DT_WorldMapAreaData.json`, 'utf8'))[0].Rows || {};
const regionName = key => {
  const msg = areaRows[key]?.MsgID;
  return (msg && (worldMapText.get(msg) ?? commonText.get(msg))) || null;
};
// a BoxComponent's default extent is 32uu cubed and a sphere's radius 32uu,
// both scaled by RelativeScale3D — enough to rank regions by size so the map
// can reveal the small ones only as you zoom
const volumeOf = (loc, scale, isSphere) => {
  const s = scale || { X: 1, Y: 1, Z: 1 };
  const rx = 32 * (isSphere ? s.X : s.X), ry = 32 * (isSphere ? s.X : s.Y);
  return { loc, rx, ry };
};

const rawRegions = [];
for (const o of level) {
  if (!/^BP_PalRegionTrigger(Box|Sphere)_C$/.test(o.Type || '')) continue;
  const key = o.Properties?.AreaName?.Key;
  const ref = o.Properties?.RootComponent?.ObjectPath;
  if (!key || !ref) continue;
  const comp = level[Number(ref.split('.').pop())];
  const loc = comp?.Properties?.RelativeLocation;
  if (loc) rawRegions.push({ key, ...volumeOf(loc, comp.Properties.RelativeScale3D, /Sphere/.test(o.Type)) });
}
let cellRegions = 0;
try {
  const cells = JSON.parse(fs.readFileSync(`${P}/out/regionCells.json`, 'utf8'));
  for (const exps of Object.values(cells)) {
    for (const o of exps) {
      if (!/^BP_PalRegionTrigger(Box|Sphere)_C$/.test(o.Type || '')) continue;
      const key = o.Properties?.AreaName?.Key;
      const ref = o.Properties?.RootComponent?.ObjectPath;
      if (!key || !ref) continue;
      const comp = exps[Number(ref.split('.').pop())];
      const loc = comp?.Properties?.RelativeLocation;
      if (!loc) continue;
      rawRegions.push({ key, ...volumeOf(loc, comp.Properties.RelativeScale3D, /Sphere/.test(o.Type)) });
      cellRegions++;
    }
  }
} catch (e) {
  console.error(`  (no regionCells.json — only ${rawRegions.length} persistent-level regions: ${e.message})`);
}

const regions = [];
const seenRegion = new Set();
for (const r of rawRegions) {
  if (seenRegion.has(r.key)) continue;
  const layer = layerFor(r.loc.X, r.loc.Y);
  const label = regionName(r.key);
  if (!layer || !label) continue;
  seenRegion.add(r.key);
  const px = project(layer, r.loc.X, r.loc.Y);
  const scale = layer.size / (layer.max.Y - layer.min.Y);
  regions.push({
    id: r.key, name: label, layer: layer.key,
    map: { x: +px.x.toFixed(1), y: +px.y.toFixed(1) },
    // rx/ry are world half-extents on the world X/Y axes; screen axes are
    // swapped, so the screen half-width comes from the world Y extent
    r: +(Math.max(r.rx, r.ry) * scale).toFixed(1),
  });
}
regions.sort((a, b) => b.r - a.r);

fs.mkdirSync(`${P}/out`, { recursive: true });
fs.writeFileSync(`${P}/out/mapMarkers.json`, JSON.stringify(out, null, 1));
fs.writeFileSync(`${P}/out/mapRegions.json`, JSON.stringify(regions, null, 1));

// ...and the file the app actually loads. Writing it here rather than by hand
// is the whole point of keeping this pipeline: a regen after a game update
// should be one command, not one command plus a remembered copy-paste.
const layerOut = Object.fromEntries(LAYERS.map(l => [l.key, {
  id: l.texture === 'T_TreeMap' ? 'tree' : 'main',
  size: l.size, tileSize: 512, maxZoom: 3,
  world: { minX: l.min.X, minY: l.min.Y, maxX: l.max.X, maxY: l.max.Y },
}]));
fs.writeFileSync('../js/mapdata.js',
  '// Generated by tools/parse-map.js from PL_MainWorld5 + DT_WorldMapUIData +\n' +
  '// DT_BossSpawnerLoactionData + DT_WorldMapAreaData. Do not edit.\n' +
  'window.MAPDATA = ' + JSON.stringify({
    version: '1.0.1', layers: layerOut, markers: out, regions,
  }) + ';\n');

const byType = {};
out.forEach(m => byType[m.type] = (byType[m.type] || 0) + 1);
console.log('markers:', out.length, byType, `(skipped ${skipped} with no transform)`);
console.log('named:', out.filter(m => m.label && m.label !== m.id).length, '/', out.length);
console.log('L10N tables:', { respawn: respawnText.size, common: commonText.size, worldMap: worldMapText.size });
console.log(`regions: ${regions.length} named (${rawRegions.length} volumes, ` +
            `${cellRegions} from world-partition cells, ` +
            `${rawRegions.length - regions.length} unnamed or off-layer)`);
console.log('  largest:', regions.slice(0, 6).map(r => `${r.name} (${r.r | 0}px)`).join(', '));
for (const l of LAYERS) {
  const ms = out.filter(m => m.layer === l.key);
  if (!ms.length) { console.log(`\nlayer ${l.key}: no markers`); continue; }
  const xs = ms.map(m => m.map.x), ys = ms.map(m => m.map.y);
  const inBounds = ms.every(m => m.map.x >= 0 && m.map.x <= l.size && m.map.y >= 0 && m.map.y <= l.size);
  console.log(`\nlayer ${l.key} (${l.texture}, ${l.size}px): ${ms.length} markers`);
  console.log(`  pixel x ${Math.min(...xs).toFixed(0)}-${Math.max(...xs).toFixed(0)}` +
              ` | y ${Math.min(...ys).toFixed(0)}-${Math.max(...ys).toFixed(0)}` +
              `  ${inBounds ? 'ALL IN BOUNDS' : '!! OUT OF BOUNDS'}`);
}
if (orphans.length) console.log('\norphans (outside every layer):', orphans.length, orphans.slice(0, 6).map(o => o.id));
console.log('\nsample:', JSON.stringify(out.slice(0, 4), null, 1));
console.log('\ntowers:'); out.filter(m => m.type !== 'fastTravel').forEach(m => console.log(' ', m.type, m.id, '|', m.label));
