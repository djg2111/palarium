// Check the partner-skill data the app ships against what the game files say —
// independently of gen-data.js, so a bug in the generator can't hide behind
// itself. Same idea as breeding-diff.js does for the combo table.
//
// Walks DT_PartnerSkillParameter -> DT_PassiveSkill_Main directly and asserts:
//   · every (effect, target) the game gives a pal is a row in ps.rl/ps.rt
//   · every rank value in ps.re is the game's value for that row
//   · nothing the game grants is missing from ps.re
//   · no description still holds an unresolved {token}
const fs = require('fs');
const E = 'extract';

const src = fs.readFileSync('c:/Users/David/Documents/Palarium/js/data.js', 'utf8');
const sandbox = { window: {} };
new Function('window', src).call(sandbox, sandbox.window);
const APP = sandbox.window.PALDATA;

const rows = f => JSON.parse(fs.readFileSync(`${E}/dt/${f}.json`, 'utf8'))[0].Rows || {};
const ev = s => String(s ?? '').split('::').pop();
const ci = o => new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const PSP = ci(rows('DT_PartnerSkillParameter'));
const MAIN = ci(rows('DT_PassiveSkill_Main'));
const { TARGETS } = require('./partner-skills');

const red = s => `\x1b[31m${s}\x1b[0m`, grn = s => `\x1b[32m${s}\x1b[0m`, bold = s => `\x1b[1m${s}\x1b[0m`;

// the game's own answer: pal -> "label-free" map of effect|target -> 5 values
function gameRanks(key) {
  const row = PSP.get(String(key).toLowerCase());
  if (!row) return null;
  const out = new Map();
  (row.PassiveSkills || []).forEach((rank, ri) => {
    for (const s of rank.SkillAndParametersArray || []) {
      const g = MAIN.get(String(s.SkillName?.Key ?? '').toLowerCase());
      if (!g) continue;
      for (let i = 1; i <= 4; i++) {
        const t = ev(g['EffectType' + i]);
        if (!t || t === 'no' || t === 'None') continue;
        const id = t + '|' + (TARGETS[ev(g['TargetType' + i])] || ['?'])[0];
        if (!out.has(id)) out.set(id, new Array(5).fill(null));
        out.get(id)[ri] = g['EffectValue' + i] ?? 0;
      }
    }
  });
  return out;
}

let checked = 0, bad = 0, activeRows = 0, tokens = 0;
const say = (...a) => { bad++; console.log(red('  ✗'), ...a); };

for (const p of APP.pals) {
  if (/\{[A-Za-z]/.test(p.ps?.d || '')) { tokens++; say(p.n, 'description still has a placeholder'); }
  const game = gameRanks(p.k);
  if (!game) continue;
  const ps = p.ps;
  // shipped rows, as value sequences keyed by position
  const shipped = new Map();
  (ps.re || []).forEach((rank, ri) => rank.forEach(([i, v]) => {
    if (!shipped.has(i)) shipped.set(i, new Array(5).fill(null));
    shipped.get(i)[ri] = v;
  }));
  // the active-skill rows (power/cooldown/duration) are not passive effects and
  // have no counterpart in the game's PassiveSkills array
  const ACTIVE = /^(Skill power|Hammer attack power|Damage multiplier|Health restored|Launch power|Chest grade it can open|Effect duration|Cooldown)$/;
  const gameSeqs = [...game.values()].map(v => JSON.stringify(v));
  const used = new Set();
  for (const [i, vals] of shipped) {
    const label = (ps.rl || [])[i];
    if (ACTIVE.test(label)) { activeRows++; continue; }
    const seq = JSON.stringify(vals);
    const at = gameSeqs.findIndex((s, j) => s === seq && !used.has(j));
    if (at < 0) say(p.n, `row "${label}" ${seq} has no match in the game data`);
    else { used.add(at); checked++; }
  }
  // and nothing the game grants may be missing — flag effects are stored in
  // ps.re like any other, they're just not drawn as a rank row
  gameSeqs.forEach((s, j) => {
    if (used.has(j)) return;
    say(p.n, `the game has ${[...game.keys()][j]} = ${s} and the app ships no row for it`);
  });
}

console.log(bold('\npartner skills vs the game files'));
console.log(`  pals with a game row: ${APP.pals.filter(p => PSP.has(p.k.toLowerCase())).length} / ${APP.pals.length}`);
console.log(`  rank rows matched exactly: ${checked}`);
console.log(`  active-skill rows (power/cooldown/duration, not in PassiveSkills): ${activeRows}`);
console.log(`  unresolved description tokens: ${tokens ? red(tokens) : grn(0)}`);
console.log(bad ? red(bold(`\n  ${bad} MISMATCHES\n`)) : grn(bold('\n  no mismatches\n')));
process.exit(bad ? 1 : 0);
