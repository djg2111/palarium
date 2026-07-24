// Build the passive-skill list from DT_PassiveSkill_Main, and check it against
// the palpedia-derived list the app shipped.
const fs = require('fs');
const E = 'extract';

const ps = JSON.parse(fs.readFileSync(`${E}/dt/DT_PassiveSkill_Main.json`, 'utf8'))[0].Rows || {};
const text = f => {
  const m = new Map();
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(`${E}/l10n/${f}.json`, 'utf8'))[0].Rows || {})) {
    const s = v?.TextData?.LocalizedString ?? v?.LocalizedString;
    if (s) m.set(k.toLowerCase(), s);
  }
  return { get: k => m.get(String(k).toLowerCase()) };
};
const SN = text('DT_SkillNameText_Common');
const ev = s => String(s ?? '').split('::').pop();

function build() {
  const out = [];
  for (const [key, g] of Object.entries(ps)) {
    const n = SN.get('PASSIVE_' + key);
    // SortDisplayable is the game's own "show this in the passive list" flag
    if (!n || !ev(g.Category).startsWith('SortDisplayable')) continue;

    // "(party)" marks each individual effect that reaches beyond the pal
    // itself — not the skill as a whole. Lucky, for instance, is party-wide on
    // defence only, so a single trailing marker would misattribute it.
    const parts = [];
    for (let i = 1; i <= 4; i++) {
      const type = ev(g['EffectType' + i]);
      if (!type || type === 'no' || type === 'None') continue;
      const val = g['EffectValue' + i] ?? 0;
      const party = ev(g['TargetType' + i]) !== 'ToSelf' ? ' (party)' : '';
      parts.push(`${type.toLowerCase()} ${val >= 0 ? '+' : ''}${val}%${party}`);
    }
    const e = parts.join(', ');

    const p = { n, r: g.Rank ?? 0, e };
    // mutation-exclusive: rollable only from the mutation pool
    if (g.AddMutationPal && !g.AddPal && !g.AddRarePal && !g.AddWorldTreePal) p.mt = 1;
    out.push(p);
  }
  out.sort((a, b) => a.n.localeCompare(b.n));
  return out;
}

const built = build();
const src = fs.readFileSync('c:/Users/David/Documents/Palarium/js/data.js', 'utf8');
const sb = { window: {} }; new Function('window', src).call(sb, sb.window);
const OLD = sb.window.PALDATA.passives;

const oldByName = new Map(OLD.map(p => [p.n, p]));
const newByName = new Map(built.map(p => [p.n, p]));
console.log(`generated ${built.length} · shipped ${OLD.length}`);
console.log('  only in generated:', [...newByName.keys()].filter(n => !oldByName.has(n)));
console.log('  only in shipped  :', [...oldByName.keys()].filter(n => !newByName.has(n)));

let eDiff = [], rDiff = [], mtDiff = [];
for (const [n, o] of oldByName) {
  const g = newByName.get(n); if (!g) continue;
  if (o.e !== g.e) eDiff.push({ n, old: o.e, new: g.e });
  if (o.r !== g.r) rDiff.push({ n, old: o.r, new: g.r });
  if ((o.mt ? 1 : 0) !== (g.mt ? 1 : 0)) mtDiff.push({ n, old: o.mt ?? 0, new: g.mt ?? 0 });
}
console.log(`  effect-string mismatches: ${eDiff.length}`);
eDiff.slice(0, 8).forEach(d => { console.log(`    ${d.n}`); console.log(`      old: ${d.old}`); console.log(`      new: ${d.new}`); });
console.log(`  rank mismatches: ${rDiff.length}`, rDiff.slice(0, 5));
console.log(`  mutation-flag mismatches: ${mtDiff.length}`, mtDiff.slice(0, 5));

fs.writeFileSync(`${E}/out/passives.json`, JSON.stringify(built, null, 1));
