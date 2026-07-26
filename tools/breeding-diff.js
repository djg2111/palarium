// Compare the breeding-engine inputs the app ships against what 1.0 actually
// contains. These four things decide every prediction the calculator makes:
//   CombiRank (r), CombiDuplicatePriority (pr), IgnoreCombi (ic), unique combos
const fs = require('fs');
const E = 'extract';

const src = fs.readFileSync('c:/Users/David/Documents/Palarium/js/data.js', 'utf8');
const sandbox = { window: {} };
new Function('window', src).call(sandbox, sandbox.window);
const APP = sandbox.window.PALDATA;

const rows = f => JSON.parse(fs.readFileSync(`${E}/dt/${f}.json`, 'utf8'))[0].Rows || {};
const mp = rows('DT_PalMonsterParameter');
const combi = rows('DT_PalCombiUnique');
const enumv = s => String(s ?? '').split('::').pop();

// game rows include NPCs/humans; the app only tracks pals
const gamePals = new Map();
for (const [k, v] of Object.entries(mp)) {
  if (v.IsPal === false) continue;
  gamePals.set(k, { r: v.CombiRank ?? 0, pr: v.CombiDuplicatePriority ?? 0, ic: v.IgnoreCombi ? 1 : 0, z: v.ZukanIndex ?? 0 });
}

const red = s => `\x1b[31m${s}\x1b[0m`, grn = s => `\x1b[32m${s}\x1b[0m`, yel = s => `\x1b[33m${s}\x1b[0m`, bold = s => `\x1b[1m${s}\x1b[0m`;

console.log(bold(`\npals: app ${APP.pals.length} · game ${gamePals.size} (IsPal rows)`));
const appByKey = new Map(APP.pals.map(p => [p.k, p]));
const missing = [...gamePals.keys()].filter(k => !appByKey.has(k));
const stale = [...appByKey.keys()].filter(k => !gamePals.has(k));

let rDiff = [], prDiff = [], icDiff = [];
for (const [k, p] of appByKey) {
  const g = gamePals.get(k); if (!g) continue;
  if (p.r !== g.r) rDiff.push({ k, n: p.n, from: p.r, to: g.r });
  if (p.pr !== g.pr) prDiff.push({ k, n: p.n, from: p.pr, to: g.pr });
  if (p.ic !== g.ic) icDiff.push({ k, n: p.n, from: p.ic, to: g.ic });
}

console.log(`  in game but NOT in app: ${missing.length ? red(missing.length) : grn('0')}`);
if (missing.length) console.log('   ', missing.slice(0, 40).join(', ') + (missing.length > 40 ? ` …+${missing.length - 40}` : ''));
console.log(`  in app but NOT in game: ${stale.length ? red(stale.length) : grn('0')}`);
if (stale.length) console.log('   ', stale.slice(0, 30).join(', '));

console.log(bold('\nbreeding-engine fields (shared pals only):'));
console.log(`  CombiRank changed:            ${rDiff.length ? red(rDiff.length) : grn('0')}`);
rDiff.slice(0, 15).forEach(d => console.log(`     ${d.n} (${d.k}): ${d.from} -> ${d.to}`));
console.log(`  CombiDuplicatePriority changed: ${prDiff.length ? yel(prDiff.length) : grn('0')}`);
prDiff.slice(0, 10).forEach(d => console.log(`     ${d.n} (${d.k}): ${d.from} -> ${d.to}`));
console.log(`  IgnoreCombi changed:          ${icDiff.length ? red(icDiff.length) : grn('0')}`);
icDiff.slice(0, 10).forEach(d => console.log(`     ${d.n} (${d.k}): ${d.from} -> ${d.to}`));

// ---- unique combos ----
const gameCombos = Object.values(combi).map(c => ({
  a: enumv(c.ParentTribeA), b: enumv(c.ParentTribeB), c: c.ChildCharacterID,
  ga: enumv(c.ParentGenderA), gb: enumv(c.ParentGenderB),
})).filter(c => c.a && c.b && c.c);

// Lower-cased, because the game's own tables disagree on casing: CombiUnique
// says `Blueplatypus` where MonsterParameter says `BluePlatypus`, and gen-data
// canonicalises to the latter. Comparing them raw reported the same two recipes
// as both "new in 1.0" and "gone from game", i.e. two false alarms in the one
// tool whose job is to shout when the calculator's inputs move.
const key = c => {
  const g = (c.ga && c.ga !== 'None') ? `|${c.ga}/${c.gb}` : '';
  return `${c.a}+${c.b}${g}`.toLowerCase();
};
const gameMap = new Map(gameCombos.map(c => [key(c), c]));
const appMap = new Map(APP.combos.map(c => [key({ a: c.a, b: c.b, ga: c.ga, gb: c.gb }), c]));

const cNew = [...gameMap.keys()].filter(k => !appMap.has(k));
const cGone = [...appMap.keys()].filter(k => !gameMap.has(k));
const cChanged = [...appMap.keys()].filter(k => gameMap.has(k) && gameMap.get(k).c !== appMap.get(k).c);

console.log(bold(`\nunique combos: app ${APP.combos.length} · game ${gameCombos.length}`));
console.log(`  new in 1.0:      ${cNew.length ? yel(cNew.length) : grn('0')}`);
cNew.slice(0, 20).forEach(k => console.log(`     ${k} -> ${gameMap.get(k).c}`));
console.log(`  gone from game:  ${cGone.length ? red(cGone.length) : grn('0')}`);
cGone.slice(0, 10).forEach(k => console.log(`     ${k} (was -> ${appMap.get(k).c})`));
console.log(`  DIFFERENT child: ${cChanged.length ? red(cChanged.length) : grn('0')}`);
cChanged.forEach(k => console.log(`     ${k}: ${appMap.get(k).c} -> ${gameMap.get(k).c}`));

console.log(bold('\nverdict:'));
const engineBroken = rDiff.length + icDiff.length + cChanged.length + cGone.length;
console.log(engineBroken
  ? red(`  ${engineBroken} changes alter calculator output — data.js must be regenerated`)
  : grn('  breeding maths unchanged; app additions are new content only'));
console.log(`  ${missing.length} pals and ${cNew.length} combos exist in 1.0 that the app doesn't know about\n`);
