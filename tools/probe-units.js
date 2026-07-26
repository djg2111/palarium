// Scratch probe: every EffectType used by a partner skill, with the evidence
// the description text gives about its unit (does the text spell "20%" or "20"?).
const fs = require('fs');
const E = 'extract';
const rows = f => JSON.parse(fs.readFileSync(`${E}/dt/${f}.json`, 'utf8'))[0].Rows || {};
const PSP = rows('DT_PartnerSkillParameter'), MAIN = rows('DT_PassiveSkill_Main');
const ev = s => String(s ?? '').split('::').pop();
const mainLC = new Map(Object.entries(MAIN).map(([k, v]) => [k.toLowerCase(), v]));
const pspLC = new Map(Object.entries(PSP).map(([k, v]) => [k.toLowerCase(), v]));
global.window = {}; require('../js/data.js');
const P = window.PALDATA.pals;

const fx = key => {
  const g = mainLC.get(String(key).toLowerCase());
  if (!g) return [];
  const out = [];
  for (let i = 1; i <= 4; i++) {
    const t = ev(g['EffectType' + i]);
    if (t && t !== 'no' && t !== 'None') out.push([t, g['EffectValue' + i] ?? 0]);
  }
  return out;
};

const info = new Map();   // EffectType -> {pct, flat, none, vals:Set, pals:Set, oldTags:Set}
for (const p of P) {
  const row = pspLC.get(p.k.toLowerCase());
  if (!row) continue;
  const d = (p.ps.d || '').replace(/\s+/g, ' ');
  const seen = new Map();  // type -> values across ranks
  (row.PassiveSkills || []).forEach(rank => (rank.SkillAndParametersArray || []).forEach(s =>
    fx(s.SkillName?.Key).forEach(([t, v]) => {
      if (!seen.has(t)) seen.set(t, []);
      seen.get(t).push(v);
    })));
  for (const [t, vals] of seen) {
    if (!info.has(t)) info.set(t, {pct: 0, flat: 0, none: 0, vals: new Set(), pals: new Set(), oldTags: new Set()});
    const rec = info.get(t);
    vals.forEach(v => rec.vals.add(v));
    rec.pals.add(p.n);
    (p.ps.t || []).forEach(x => rec.oldTags.add(x));
    const a = Math.abs(vals[0]);
    if (new RegExp('(^|[^0-9])' + a + '\\s*%').test(d)) rec.pct++;
    else if (new RegExp('(^|[^0-9.])' + a + '([^0-9%]|$)').test(d)) rec.flat++;
    else rec.none++;
  }
}
console.log('distinct EffectTypes across partner skills:', info.size, '\n');
[...info].sort().forEach(([t, r]) => {
  const vals = [...r.vals].sort((a, b) => a - b);
  console.log(t.padEnd(44),
    ('pct' + r.pct + '/flat' + r.flat + '/?' + r.none).padEnd(18),
    'n=' + r.pals.size,
    'vals ' + (vals.length > 8 ? vals.slice(0, 4).join(',') + '…' + vals.slice(-2).join(',') : vals.join(',')),
    '| e.g. ' + [...r.pals].slice(0, 2).join(', '));
});
