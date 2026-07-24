#!/usr/bin/env node
// Regenerate js/data.js from Palworld 1.0 game files.
//
// Everything here is sourced from the game's own datatables except the partner
// skill RANK tables (ps.rl / ps.re): those values live in per-pal Blueprints,
// not any datatable, so they're carried over from the existing file. Every
// other field is first-party. See gen-data-report.txt for the field-by-field
// comparison against what the app shipped.
const fs = require('fs');
const E = 'extract';
const OUT = process.argv[2] || 'extract/out/data.new.js';

const rows = f => JSON.parse(fs.readFileSync(`${E}/dt/${f}.json`, 'utf8'))[0].Rows || {};
// Lookups are case-insensitive: the game's own tables disagree on casing
// (WindChimes in MonsterParameter vs Windchimes in L10N, BluePlatypus vs
// Blueplatypus in CombiUnique), which silently drops rows if matched exactly.
const text = f => {
  const m = new Map();
  try {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(`${E}/l10n/${f}.json`, 'utf8'))[0].Rows || {})) {
      const s = v?.TextData?.LocalizedString ?? v?.LocalizedString;
      if (s) m.set(k.toLowerCase(), s);
    }
  } catch {}
  return { get: k => m.get(String(k).toLowerCase()), has: k => m.has(String(k).toLowerCase()), size: m.size };
};
const ev = s => String(s ?? '').split('::').pop();

const mp = rows('DT_PalMonsterParameter');
const combi = rows('DT_PalCombiUnique');
const dropRows = Object.values(rows('DT_PalDropItem'));
const NAME = text('DT_PalNameText_Common');
const DESC = text('DT_PalLongDescriptionText');
const SKILLNAME = text('DT_SkillNameText_Common');
const SKILLDESC = text('DT_SkillDescText_Common');
const APPEND = text('DT_PartnerSkillAppendText');

// the file we're replacing — used only for the partner-skill rank tables
const oldSrc = fs.readFileSync('c:/Users/David/Documents/Palarium/js/data.js', 'utf8');
const sb = { window: {} }; new Function('window', oldSrc).call(sb, sb.window);
const OLD = sb.window.PALDATA;
const oldByKey = new Map(OLD.pals.map(p => [p.k, p]));

// ---- which rows are real, playable pals ----------------------------------
// Excludes raid/gym/boss/predator/summon duplicates, quest props, and the
// oil-rig / tower re-skins that share a ZukanIndex with their base species.
const EXCLUDE = /^(RAID_|GYM_|BOSS_|Boss_|SUMMON_|NPC_|PREDATOR_|Quest_)/;
const EXCLUDE_SUFFIX = /_(Oilrig|Tower)$/;
const isCollab = k => /^Yakushima/.test(k);

const dexRows = [], collabRows = [];
for (const [k, v] of Object.entries(mp)) {
  if (v.IsPal === false || EXCLUDE.test(k) || EXCLUDE_SUFFIX.test(k)) continue;
  if (!NAME.has('PAL_NAME_' + k)) continue;   // unused variant, no display name shipped
  if (isCollab(k)) { collabRows.push([k, v]); continue; }
  if ((v.ZukanIndex ?? 0) > 0) dexRows.push([k, v]);
}
// the app numbers collab pals 900+ alphabetically by display name
collabRows.sort((a, b) => (NAME.get('PAL_NAME_' + a[0]) ?? a[0]).localeCompare(NAME.get('PAL_NAME_' + b[0]) ?? b[0]));

// the game's internal element names differ from the ones the UI uses
const ELEMENT_MAP = { electricity: 'electric', leaf: 'grass', earth: 'ground' };
const element = s => { const e = ev(s).toLowerCase(); return ELEMENT_MAP[e] ?? e; };

// Descriptions are UE rich text. Exactly three tag shapes occur across the
// whole table: <characterName id=|Key|/>, <activeSkillName id=|Key|/>, and
// <://Error_Code:126DC> — which is LITERAL text in Xenolord's entry, not
// markup, so only the two id=|…| forms get substituted. A blanket
// <[^>]*> strip would eat both the skill name and that error code.
const cleanText = s => String(s ?? '')
  .replace(/<characterName\s+id=\|([^|]+)\|\s*\/>/g,
           (_, key) => NAME.get('PAL_NAME_' + key)?.trim() ?? key)
  .replace(/<activeSkillName\s+id=\|([^|]+)\|\s*\/>/g,
           (_, key) => (SKILLNAME.get('ACTION_SKILL_' + key) ?? SKILLNAME.get('ACTION_' + key) ?? SKILLNAME.get(key))?.trim() ?? key)
  .replace(/\r\n|\r|\n/g, ' ')
  .trim();

const WORK_MAP = {
  WorkSuitability_EmitFlame: 'kindling',
  WorkSuitability_Watering: 'watering',
  WorkSuitability_Seeding: 'planting',
  WorkSuitability_GenerateElectricity: 'generatingElectricity',
  WorkSuitability_Handcraft: 'handiwork',
  WorkSuitability_Collection: 'gathering',
  WorkSuitability_Deforest: 'lumbering',
  WorkSuitability_Mining: 'mining',
  WorkSuitability_ProductMedicine: 'medicineProduction',
  WorkSuitability_Cool: 'cooling',
  WorkSuitability_Transport: 'transporting',
  WorkSuitability_MonsterFarm: 'farming',
  // WorkSuitability_OilExtraction has no counterpart in the app's WORKS map
};

// drops: one CharacterID can have several rows (per level band); the app
// concatenates them, so match that rather than inventing a new shape
const dropsByPal = new Map();
for (const r of dropRows) {
  const id = r.CharacterID;
  if (!id || id === 'None') continue;
  const list = dropsByPal.get(id) ?? [];
  for (let i = 1; i <= 8; i++) {
    const item = r['ItemId' + i];
    if (!item || item === 'None') continue;
    list.push([item, r['Rate' + i] ?? 0, r['min' + i] ?? 0, r['Max' + i] ?? 0]);
  }
  dropsByPal.set(id, list);
}

function buildPal([k, v], zOverride, collab) {
  const t = [v.ElementType1, v.ElementType2]
    .filter(x => x && ev(x) !== 'None').map(element);
  const w = {};
  for (const [gk, ak] of Object.entries(WORK_MAP)) {
    const n = v[gk] ?? 0;
    if (n > 0) w[ak] = n;
  }
  const old = oldByKey.get(k);
  const psName = (SKILLNAME.get('PARTNERSKILL_' + k) ?? old?.ps?.n ?? '').trim();
  const psDesc = SKILLDESC.get('PARTNERSKILL_' + k) ?? APPEND.get('PARTNERSKILL_' + k)
    ?? SKILLDESC.get('PARTNERSKILL_DESC_' + k) ?? old?.ps?.d ?? '';
  const psDescClean = cleanText(psDesc) || old?.ps?.d || '';
  return {
    k,
    n: (NAME.get('PAL_NAME_' + k) ?? old?.n ?? k).trim(),
    z: zOverride ?? v.ZukanIndex ?? 0,
    zs: v.ZukanIndexSuffix ?? '',
    t,
    r: v.CombiRank ?? 0,
    pr: v.CombiDuplicatePriority ?? 0,
    m: v.MaleProbability ?? 50,
    img: `pals/T_${k}_icon_normal.webp`,   // convert-icons.js writes lossless WebP
    rar: v.Rarity ?? 0,
    w,
    ic: v.IgnoreCombi ? 1 : 0,
    cb: collab ? 1 : 0,
    d: cleanText(DESC.get('PAL_LONG_DESC_' + k)) || old?.d || '',
    sz: ev(v.Size) || '',
    noct: v.Nocturnal ? 1 : 0,
    st: [v.Hp ?? 0, v.ShotAttack ?? 0, v.Defense ?? 0, v.Support ?? 0,
         v.CraftSpeed ?? 0, v.MaxFullStomach ?? 0, v.FoodAmount ?? 0, v.Price ?? 0],
    // name/desc are first-party; the rank tables are carried over (see header)
    ps: { n: psName, d: psDescClean, t: old?.ps?.t ?? [], rl: old?.ps?.rl ?? [], re: old?.ps?.re ?? [] },
    dr: dropsByPal.get(k) ?? [],
  };
}

const pals = [
  ...dexRows.map(r => buildPal(r, null, false)),
  ...collabRows.map((r, i) => buildPal(r, 900 + i, true)),
];
pals.sort((a, b) => a.z - b.z || String(a.zs).localeCompare(String(b.zs)));

// ---- combos --------------------------------------------------------------
const canon = new Map(pals.map(p => [p.k.toLowerCase(), p.k]));
const fix = s => canon.get(String(s).toLowerCase()) ?? s;
const combos = [];
const seen = new Set();
for (const row of Object.values(combi)) {
  const a = fix(ev(row.ParentTribeA)), b = fix(ev(row.ParentTribeB)), c = fix(row.ChildCharacterID);
  if (!a || !b || !c) continue;
  // drop recipes that reference unreleased pals — they'd be phantom entries
  if (!canon.has(a.toLowerCase()) || !canon.has(b.toLowerCase()) || !canon.has(c.toLowerCase())) continue;
  const ga = ev(row.ParentGenderA), gb = ev(row.ParentGenderB);
  const e = { a, b, c };
  if (ga && ga !== 'None') { e.ga = ga; e.gb = gb; }
  const sig = `${a}+${b}|${e.ga ?? ''}`;
  if (seen.has(sig)) continue;      // the game ships one exact duplicate row
  seen.add(sig);
  combos.push(e);
}

// ---- passives ------------------------------------------------------------
// SortDisplayable is the game's own "show in the passive list" flag: 115 rows.
// "(party)" marks each individual effect that reaches beyond the pal itself,
// not the skill as a whole — Lucky is party-wide on defence only.
const passiveRows = rows('DT_PassiveSkill_Main');
const passives = [];
for (const [key, g] of Object.entries(passiveRows)) {
  const n = SKILLNAME.get('PASSIVE_' + key);
  if (!n || !ev(g.Category).startsWith('SortDisplayable')) continue;
  const parts = [];
  for (let i = 1; i <= 4; i++) {
    const type = ev(g['EffectType' + i]);
    if (!type || type === 'no' || type === 'None') continue;
    const val = g['EffectValue' + i] ?? 0;
    const party = ev(g['TargetType' + i]) !== 'ToSelf' ? ' (party)' : '';
    parts.push(`${type.toLowerCase()} ${val >= 0 ? '+' : ''}${val}%${party}`);
  }
  const p = { n, r: g.Rank ?? 0, e: parts.join(', ') };
  if (g.AddMutationPal && !g.AddPal && !g.AddRarePal && !g.AddWorldTreePal) p.mt = 1;
  passives.push(p);
}
passives.sort((a, b) => a.n.localeCompare(b.n));

const D = { pals, combos, passives };
fs.mkdirSync('extract/out', { recursive: true });
fs.writeFileSync(OUT, `window.PALDATA = ${JSON.stringify(D)};\n`);
console.log(`wrote ${OUT}`);
console.log(`  pals ${pals.length} (dex ${dexRows.length} + collab ${collabRows.length}) · combos ${combos.length} · passives ${passives.length}`);
