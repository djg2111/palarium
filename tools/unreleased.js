// Catalogue the pal rows Palworld 1.0 ships but doesn't expose, and work out
// whether each is a bare data stub or has real production assets behind it.
const fs = require('fs');
const E = 'extract';

const mp = JSON.parse(fs.readFileSync(`${E}/dt/DT_PalMonsterParameter.json`, 'utf8'))[0].Rows || {};
const text = f => {
  const m = new Map();
  try {
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(`${E}/l10n/${f}.json`, 'utf8'))[0].Rows || {})) {
      const s = v?.TextData?.LocalizedString ?? v?.LocalizedString;
      if (s) m.set(k.toLowerCase(), s);
    }
  } catch {}
  return { get: k => m.get(String(k).toLowerCase()) };
};
const NAME = text('DT_PalNameText_Common');
const DESC = text('DT_PalLongDescriptionText');
const SKN = text('DT_SkillNameText_Common');
const ev = s => String(s ?? '').split('::').pop();

const EX = /^(RAID_|GYM_|BOSS_|Boss_|SUMMON_|NPC_|PREDATOR_|Quest_)/;
const rows = Object.entries(mp).filter(([k, v]) =>
  v.IsPal !== false && (v.ZukanIndex ?? 0) <= 0 && !EX.test(k)
  && !/_(Oilrig|Tower)$/.test(k) && !/^Yakushima/.test(k));

// which of these have an icon texture on disk?
const icons = new Set(fs.readdirSync(`${E}/icons`)
  .map(f => f.replace(/^T_/, '').replace(/_icon_normal\.png$/, '').toLowerCase()));

const out = rows.map(([k, v]) => ({
  key: k,
  name: NAME.get('PAL_NAME_' + k) ?? null,
  desc: DESC.get('PAL_LONG_DESC_' + k) ?? null,
  partnerSkill: SKN.get('PARTNERSKILL_' + k) ?? null,
  hasIcon: icons.has(k.toLowerCase()),
  zukan: v.ZukanIndex, zukanSuffix: v.ZukanIndexSuffix,
  combiRank: v.CombiRank, combiPriority: v.CombiDuplicatePriority, ignoreCombi: !!v.IgnoreCombi,
  elements: [v.ElementType1, v.ElementType2].map(ev).filter(x => x && x !== 'None'),
  rarity: v.Rarity, size: ev(v.Size), genus: ev(v.GenusCategory),
  hp: v.Hp, melee: v.MeleeAttack, shot: v.ShotAttack, defense: v.Defense,
  price: v.Price, maleProbability: v.MaleProbability, nocturnal: !!v.Nocturnal,
  isBoss: !!v.IsBoss, isTowerBoss: !!v.IsTowerBoss, isRaidBoss: !!v.IsRaidBoss,
  bpClass: v.BPClass ?? null, tribe: ev(v.Tribe),
  work: Object.fromEntries(Object.entries(v).filter(([kk, vv]) => kk.startsWith('WorkSuitability_') && vv > 0)
    .map(([kk, vv]) => [kk.replace('WorkSuitability_', ''), vv])),
}));

fs.mkdirSync(`${E}/out`, { recursive: true });
fs.writeFileSync(`${E}/out/unreleased.json`, JSON.stringify(out, null, 1));

const named = out.filter(r => r.name && r.name !== 'en_text');
const placeholder = out.filter(r => r.name === 'en_text');
console.log(`rows: ${out.length}`);
console.log(`  real localized name : ${named.length}`);
console.log(`  placeholder en_text : ${placeholder.length}`);
console.log(`  no name row at all  : ${out.filter(r => !r.name).length}`);
console.log(`  icon texture exists : ${out.filter(r => r.hasIcon).length}`);
console.log(`  description exists  : ${out.filter(r => r.desc).length}`);
console.log(`  partner skill named : ${out.filter(r => r.partnerSkill && r.partnerSkill !== 'en_text').length}`);
console.log('\n=== named ===');
named.forEach(r => console.log(`  ${r.key.padEnd(20)} ${String(r.name).padEnd(16)} ${(r.elements.join('/') || '-').padEnd(16)} hp=${r.hp} icon=${r.hasIcon} desc=${!!r.desc} ps=${r.partnerSkill ?? '-'}`));
console.log('\n=== placeholder-named ===');
placeholder.forEach(r => console.log(`  ${r.key.padEnd(20)} ${(r.elements.join('/') || '-').padEnd(16)} hp=${r.hp} icon=${r.hasIcon} work=${JSON.stringify(r.work)}`));
