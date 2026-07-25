#!/usr/bin/env node
// Convert the extracted UI textures to lossless WebP under assets/ui and
// assets/items, under names the app can address directly.
//
// The one thing you cannot guess here: the numbered icon sets are indexed by
// UI *display* order, not by the EPalElementType / EPalWorkSuitability enum.
// They agree for the first eight work icons and then diverge — icon 08 is
// Medicine and 09 is Oil Extraction, where the enum has Oil at 9 and Medicine
// at 10. Elements diverge from index 3 (icon 03 is Electric, enum 4 is Leaf).
// Both orders below were read off the rendered textures, not the enums.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = 'extract/ui';
const ITEMSRC = 'extract/items';
const OUT = '../assets/ui';
const ITEMOUT = '../assets/items';

const ELEMENTS = ['normal', 'fire', 'water', 'electric', 'grass', 'dark', 'dragon', 'ground', 'ice'];
const WORKS = ['kindling', 'watering', 'planting', 'generatingElectricity', 'handiwork',
  'gathering', 'lumbering', 'mining', 'medicineProduction', 'oilExtraction',
  'cooling', 'transporting', 'farming', 'any'];
const MARKERS = {
  T_icon_compass_Teleport: 'waypoint',
  T_icon_compass_tower: 'tower',
  T_icon_compass_boss: 'alpha',
  T_icon_compass_dungeon: 'dungeon',
  T_icon_compass_FTtower: 'ftTower',
  T_icon_compass_camp: 'camp',
  T_icon_compass_Boss_Unknown: 'unknown',
};

// Items ship at 256px and are drawn at ~28px. Kept at 128 — a lossless encode
// of a 256px source costs 4x for detail no one can see at that size, and the
// downscale is a clean lanczos resample rather than a lossy re-encode.
const ITEM_SIZE = 128;

const webp = {lossless: true, effort: 6};
let total = 0, count = 0;

// Which item icons the site actually needs: every drop id already in data.js,
// plus the guide's cake ingredients. Writes the regex to feed back into
// `palex png`, so the extract step and this step can't drift apart.
const GUIDE_ITEMS = ['Flour', 'Berries', 'Milk', 'Egg', 'Honey', 'Mushroom', 'CaveMushroom',
  'Tomato', 'Lettuce', 'Sweet', 'Sweet_Caramel', 'Potato', 'Onion', 'Carrot',
  'Meat_GrassMammoth', 'Cake', 'Cake02', 'Cake03', 'Cake04', 'Cake05'];
function resolveItemIcons() {
  const rows = JSON.parse(fs.readFileSync('extract/dt/DT_ItemIconDataTable.json', 'utf8'))[0].Rows;
  // ids differ from the icon table's keys by zero-padding as well as case
  // (WorldTreeRelic_01 vs WorldTreeRelic_1)
  const norm = k => k.toLowerCase().replace(/_0+(\d)/g, '_$1');
  const idx = new Map(Object.entries(rows).map(([k, v]) => [norm(k), v]));
  const app = {};
  new Function('window', fs.readFileSync('../js/data.js', 'utf8'))(app);
  const want = new Set(GUIDE_ITEMS);
  for (const p of app.PALDATA.pals) for (const d of (p.dr || [])) want.add(d[0]);

  const map = {}, miss = [];
  for (const id of [...want].sort()) {
    const row = rows[id] || idx.get(norm(id));
    if (row) map[id] = row.Icon.AssetPathName.split('/').pop().split('.')[0];
    else miss.push(id);
  }
  fs.mkdirSync('extract/out', {recursive: true});
  fs.writeFileSync('extract/out/itemIcons.json', JSON.stringify(map, null, 1));
  const tex = [...new Set(Object.values(map))].sort();
  fs.writeFileSync('extract/out/itemIconRegex.txt',
    `Others/InventoryItemIcon/Texture/(${tex.join('|')})\\.uasset$`);
  console.log(`item ids resolved: ${Object.keys(map).length}` +
    (miss.length ? ` (no icon row for ${miss.join(', ')})` : ''));
  console.log('  extraction regex -> extract/out/itemIconRegex.txt');
  return map;
}

async function convert(src, dst, resize) {
  let img = sharp(src);
  if (resize) img = img.resize(resize, resize, {kernel: 'lanczos3', fit: 'inside'});
  const buf = await img.webp(webp).toBuffer();
  fs.mkdirSync(path.dirname(dst), {recursive: true});
  fs.writeFileSync(dst, buf);
  total += buf.length; count++;
  return buf.length;
}

(async () => {
  for (let i = 0; i < ELEMENTS.length; i++) {
    const src = `${SRC}/T_Icon_element_0${i}.png`;
    if (!fs.existsSync(src)) { console.log(`  !! missing ${src}`); continue; }
    await convert(src, `${OUT}/element/${ELEMENTS[i]}.webp`);
  }
  console.log(`elements: ${ELEMENTS.length}`);

  for (let i = 0; i < WORKS.length; i++) {
    const src = `${SRC}/T_icon_palwork_${String(i).padStart(2, '0')}.png`;
    if (!fs.existsSync(src)) { console.log(`  !! missing ${src}`); continue; }
    await convert(src, `${OUT}/work/${WORKS[i]}.webp`);
  }
  console.log(`works: ${WORKS.length}`);

  for (const [tex, name] of Object.entries(MARKERS)) {
    const src = `${SRC}/${tex}.png`;
    if (!fs.existsSync(src)) { console.log(`  !! missing ${src}`); continue; }
    await convert(src, `${OUT}/map/${name}.webp`);
  }
  console.log(`markers: ${Object.keys(MARKERS).length}`);

  // Items are written under their *item id*, not their texture name, so the app
  // can address assets/items/<id>.webp directly. A few ids share one texture;
  // duplicating a 12 KB file beats making the whole site download a lookup
  // table to render one section of one card.
  //
  // Lowercased, because the game's own drop tables contain both `Poppy` and
  // `poppy`. On Windows those collapse to one file and everything looks fine;
  // on a case-sensitive host one of them 404s. The app lowercases to match.
  const idToTex = resolveItemIcons();
  let itemBytes = 0, itemCount = 0;
  const written = new Set();
  for (const [id, tex] of Object.entries(idToTex)) {
    const src = `${ITEMSRC}/${tex}.png`;
    if (!fs.existsSync(src)) { console.log(`  !! missing ${src}`); continue; }
    const name = id.toLowerCase();
    if (written.has(name)) continue;
    written.add(name);
    itemBytes += await convert(src, `${ITEMOUT}/${name}.webp`, ITEM_SIZE);
    itemCount++;
  }
  console.log(`items: ${itemCount} ids, ${(itemBytes / 1024).toFixed(0)} KB`);
  console.log(`\ntotal: ${count} files, ${(total / 1024).toFixed(0)} KB`);
})();
