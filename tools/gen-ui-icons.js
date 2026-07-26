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
const COMPASSSRC = 'extract/compass';
const PASSIVESRC = 'extract/passive';
const EGGSRC = 'extract/egg';
const OUT = '../assets/ui';
const ITEMOUT = '../assets/items';

const ELEMENTS = ['normal', 'fire', 'water', 'electric', 'grass', 'dark', 'dragon', 'ground', 'ice'];
const WORKS = ['kindling', 'watering', 'planting', 'generatingElectricity', 'handiwork',
  'gathering', 'lumbering', 'mining', 'medicineProduction', 'oilExtraction',
  'cooling', 'transporting', 'farming', 'any'];
// Map markers. FTtower is the fast-travel statue — the winged emblem the game
// shows for an activated travel point, and the actor these markers come from is
// literally BP_LevelObject_TowerFastTravelPoint_C. `Teleport` is the blue portal
// vortex (the one on top of Feybreak Tower), which is a different thing; it's
// kept under its own name rather than mislabelled as the waypoint.
const MARKERS = {
  T_icon_compass_FTtower: 'waypoint',
  T_icon_compass_FTUnlockMap: 'statue',
  T_icon_compass_Teleport: 'portal',
  T_icon_compass_tower: 'tower',
  T_icon_compass_boss: 'alpha',
  T_icon_compass_dungeon: 'dungeon',
  T_icon_compass_camp: 'camp',
  T_icon_compass_Boss_Unknown: 'unknown',
};

// Egg icons, one per element plus the plain and mutated variants. The game's
// internal element names again (Leaf/Electricity/Earth), mapped to the app's.
const EGGS = {
  normal: 'T_itemicon_Material_PalEgg',
  fire: 'T_itemicon_Material_PalEgg_Fire_01',
  water: 'T_itemicon_Material_PalEgg_Water_01',
  electric: 'T_itemicon_Material_PalEgg_Electricity_01',
  grass: 'T_itemicon_Material_PalEgg_Leaf_01',
  dark: 'T_itemicon_Material_PalEgg_Dark_01',
  dragon: 'T_itemicon_Material_PalEgg_Dragon_01',
  ground: 'T_itemicon_Material_PalEgg_Earth_01',
  ice: 'T_itemicon_Material_PalEgg_Ice_01',
  mutation: 'T_itemicon_Material_PalEgg_MutationPal',
  worldtree: 'T_itemicon_Material_PalEgg_WorldTree_01',
};

// Passive-skill icons, keyed by the effect type the app already stores as the
// first token of each passive's `e` string — so no data.js change is needed.
//
// CAVEAT, because it matters: there is no effect-type -> icon table in the game
// files (DT_partnerSkillIconDataTable exists for partner skills but indexes a UI
// sprite atlas by number, unresolvable from data). This mapping was read off the
// rendered textures. Wrong entries are a cosmetic bug, not a data one, and the
// fallback below means nothing renders broken. The element rows are the safe
// ones: 009_NN and 012_NN are unambiguously the boost/resist diamonds, in the
// same display order as the element icon sheet.
const ELEM_ORDER = ['normal', 'fire', 'water', 'electricity', 'leaf', 'dark', 'dragon', 'earth', 'ice'];
const PASSIVE_FALLBACK = 'T_icon_skill_pal_00';
const PASSIVES = {
  maxhp: 'T_icon_skill_pal_004',
  defense: 'T_icon_skill_pal_005',
  shotattack: 'T_icon_skill_pal_006',
  craftspeed: 'T_icon_skill_pal_016',
  movespeed: 'T_icon_skill_pal_017',
  swimspeed: 'T_icon_skill_pal_019',
  ridejumpcount_increase: 'T_icon_skill_pal_FrogJump',
  // work
  logging: 'T_icon_skill_pal_WorkRank_Deforest',
  mining: 'T_icon_skill_pal_WorkRank_Mining',
  worksuitabilityaddrank_monsterfarm: 'T_icon_skill_pal_WorkRank_MonsterFarm',
  // survival / upkeep
  fullstomatch_decrease: 'T_icon_skill_pal_PartyFeeding',
  sanity_decrease: 'T_icon_skill_pal_011',
  autohpregenerate: 'T_icon_skill_pal_HPRecovery',
  palsp_increase: 'T_icon_skill_pal_StaminaEndurance',
  playersp_decreaserate: 'T_icon_skill_pal_StaminaEndurance',
  lifesteal: 'T_icon_skill_pal_LifeSteel',            // sic — the texture is misspelled
  nonkilling: 'T_icon_skill_pal_000',
  selfdeathadditemdrop: 'T_icon_skill_pal_SacrificeBuff',
  // combat modifiers
  activeskillcooltime_decrease: 'T_icon_skill_pal_AttackSpeed_Combat',
  reloadspeedup: 'T_icon_skill_pal_ReloadSpeed_FullAuto',
  explosionresist: 'T_icon_skill_pal_ResistExplosion',
  resistadditionaleffect_burn: 'T_icon_skill_pal_AddStatusEffect_Burn',
  resistadditionaleffect_poison: 'T_icon_skill_pal_PoisonImmunity',
  knockbackinvalid_forpassiveskill: 'T_icon_skill_pal_005',
  leanbackinvalid_forpassiveskill: 'T_icon_skill_pal_005',
  // breeding / world
  breedspeed: 'T_icon_skill_pal_SpawnEggSpeed',
  breedspeed_inbasecamp: 'T_icon_skill_pal_SpawnEggSpeed',
  palegghatchingspeed: 'T_icon_skill_pal_GetEgg',
  nocturnal: 'T_icon_skill_pal_NightVision',
  nightowl: 'T_icon_skill_pal_NightVision',
  worldtreedecayimmunity: 'T_icon_skill_pal_Revive',
  shopsellprice_money_increase: 'T_icon_skill_pal_014',
  shopbuyprice_money_increase: 'T_icon_skill_pal_014',
};
for (let i = 0; i < ELEM_ORDER.length; i++) {
  PASSIVES['elementboost_' + ELEM_ORDER[i]] = `T_icon_skill_pal_009_0${i}`;
  PASSIVES['elementresist_' + ELEM_ORDER[i]] = `T_icon_skill_pal_012_0${i}`;
}

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
  // Some ids aren't in the icon table at all and point at another id that is:
  // DT_ItemDataTable.IconName sends PalUpgradeStone -> PalUpgradeStone1 (the
  // icon table only has the four numbered tiers) and Cloth2 -> Cloth. Without
  // following it those two drops render as a text chip with a 404 behind it.
  const itemRows = JSON.parse(fs.readFileSync('extract/dt/DT_ItemDataTable.json', 'utf8'))[0].Rows;
  const aliasOf = id => {
    const n = itemRows[id]?.IconName;
    return n && n !== 'None' && n !== id ? n : null;
  };
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
    const alias = aliasOf(id);
    const row = rows[id] || idx.get(norm(id))
      || (alias && (rows[alias] || idx.get(norm(alias))));
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

  let markers = 0;
  for (const [tex, name] of Object.entries(MARKERS)) {
    const src = [`${COMPASSSRC}/${tex}.png`, `${SRC}/${tex}.png`].find(fs.existsSync);
    if (!src) { console.log(`  !! missing ${tex}`); continue; }
    await convert(src, `${OUT}/map/${name}.webp`);
    markers++;
  }
  console.log(`markers: ${markers}`);

  let eggs = 0;
  for (const [name, tex] of Object.entries(EGGS)) {
    const src = `${EGGSRC}/${tex}.png`;
    if (!fs.existsSync(src)) { console.log(`  !! missing ${src}`); continue; }
    await convert(src, `${OUT}/egg/${name}.webp`, 96);
    eggs++;
  }
  console.log(`eggs: ${eggs}`);

  // one file per effect type the app can actually produce, so a missing entry
  // shows up here as a fallback count rather than as a broken image in the UI
  const app2 = {};
  new Function('window', fs.readFileSync('../js/data.js', 'utf8'))(app2);
  const effects = new Set();
  for (const p of app2.PALDATA.passives) {
    for (const part of p.e.split(', ')) effects.add(part.split(' ')[0]);
  }
  let mapped = 0, fellBack = [];
  for (const eff of effects) {
    const tex = PASSIVES[eff] || PASSIVE_FALLBACK;
    if (!PASSIVES[eff]) fellBack.push(eff);
    const src = `${PASSIVESRC}/${tex}.png`;
    if (!fs.existsSync(src)) { console.log(`  !! missing ${src} (for ${eff})`); continue; }
    await convert(src, `${OUT}/passive/${eff}.webp`);
    mapped++;
  }
  console.log(`passives: ${mapped} effect types` +
    (fellBack.length ? ` (${fellBack.length} on the generic fallback: ${fellBack.join(', ')})` : ''));

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
