#!/usr/bin/env node
// Diff a freshly extracted PALDATA against the one the app currently ships.
// The breeding engine runs on r (CombiRank), pr (tie-break priority), ic
// (ignoreCombi) and the combo table — a silent change in any of those changes
// what the calculator predicts, so those are reported separately and loudly.
//
//   node datadiff.js <old data.js> <new data.js>

const fs = require('fs');

function load(p) {
  const src = fs.readFileSync(p, 'utf8');
  const sandbox = { window: {} };
  new Function('window', src).call(sandbox, sandbox.window);
  const d = sandbox.window.PALDATA;
  if (!d) throw new Error(`${p}: no window.PALDATA`);
  return d;
}

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) { console.error('usage: node datadiff.js <old> <new>'); process.exit(1); }
const A = load(oldPath), B = load(newPath);

const bold = s => `\x1b[1m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const grn = s => `\x1b[32m${s}\x1b[0m`;
const yel = s => `\x1b[33m${s}\x1b[0m`;

// fields that change what the app computes, vs. cosmetic ones
const ENGINE = ['r', 'pr', 'ic'];
const COSMETIC = ['n', 'z', 'zs', 't', 'm', 'rar', 'w', 'cb', 'd', 'sz', 'noct', 'st', 'img'];

function indexBy(arr, key) { return new Map(arr.map(o => [o[key], o])); }
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);

console.log(bold(`\npals  ${A.pals.length} -> ${B.pals.length}`));
const pa = indexBy(A.pals, 'k'), pb = indexBy(B.pals, 'k');
const added = [...pb.keys()].filter(k => !pa.has(k));
const removed = [...pa.keys()].filter(k => !pb.has(k));
if (added.length) console.log(grn(`  +${added.length} added: `) + added.map(k => pb.get(k).n).join(', '));
if (removed.length) console.log(red(`  -${removed.length} REMOVED: `) + removed.map(k => pa.get(k).n).join(', '));

const engineChanges = [], cosmeticChanges = new Map();
for (const [k, o] of pa) {
  const n = pb.get(k); if (!n) continue;
  for (const f of ENGINE) if (!eq(o[f], n[f])) engineChanges.push({ k, name: o.n, f, from: o[f], to: n[f] });
  for (const f of COSMETIC) if (!eq(o[f], n[f])) cosmeticChanges.set(f, (cosmeticChanges.get(f) || 0) + 1);
}
if (engineChanges.length) {
  console.log(red(bold(`\n  !! ${engineChanges.length} BREEDING-ENGINE field changes — these change calculator output:`)));
  for (const c of engineChanges) console.log(`     ${c.name} (${c.k})  ${c.f}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
} else console.log(grn('  breeding-engine fields (r/pr/ic): identical'));
if (cosmeticChanges.size) {
  console.log(yel('  cosmetic field changes: ') + [...cosmeticChanges].map(([f, n]) => `${f}x${n}`).join(', '));
}

// Partner skills were carried over from the pre-1.0 dataset until the
// DT_PartnerSkillParameter link was found, so their diff gets spelled out
// rather than counted: a rank table that changes shape, or a tag that
// disappears, silently changes what the Skills catalog can find.
console.log(bold('\npartner skills'));
{
  const has = f => arr => arr.filter(p => (p.ps?.[f] || []).length).length;
  console.log(`  rank tables: ${has('re')(A.pals)} -> ${has('re')(B.pals)}` +
    ` · tagged: ${has('t')(A.pals)} -> ${has('t')(B.pals)}` +
    ` · units shipped: ${A.pals.some(p => p.ps?.ru) ? 'yes' : 'no'} -> ${B.pals.some(p => p.ps?.ru) ? 'yes' : 'no'}`);
  const tagsOf = arr => new Set(arr.flatMap(p => p.ps?.t || []));
  const ta = tagsOf(A.pals), tb = tagsOf(B.pals);
  const tAdd = [...tb].filter(t => !ta.has(t)).sort(), tRem = [...ta].filter(t => !tb.has(t)).sort();
  console.log(`  tag vocabulary: ${ta.size} -> ${tb.size}`);
  if (tAdd.length) console.log(grn(`   +${tAdd.length}: `) + tAdd.join(', '));
  if (tRem.length) console.log(yel(`   -${tRem.length}: `) + tRem.join(', '));
  let dChg = 0, reAdd = 0, reDrop = 0, reChg = [], tokenA = 0, tokenB = 0;
  for (const [k, o] of pa) {
    const n = pb.get(k); if (!n) continue;
    if (/\{[A-Za-z]/.test(o.ps?.d || '')) tokenA++;
    if (/\{[A-Za-z]/.test(n.ps?.d || '')) tokenB++;
    if ((o.ps?.d || '') !== (n.ps?.d || '')) dChg++;
    const ol = (o.ps?.re || []).length, nl = (n.ps?.re || []).length;
    if (!ol && nl) reAdd++;
    else if (ol && !nl) reDrop++;
    else if (ol && nl) {
      // compare as label -> five values, so a re-ordering isn't a change
      const flat = p => {
        const m = new Map();
        (p.ps.re || []).forEach((rank, ri) => rank.forEach(([i, v]) => {
          if (!m.has(i)) m.set(i, new Array(5).fill(null));
          m.get(i)[ri] = v;
        }));
        return [...m].map(([i, vals]) => JSON.stringify(vals)).sort();
      };
      if (!eq(flat(o), flat(n))) reChg.push(o.n);
    }
  }
  console.log(`  descriptions changed: ${dChg} · unresolved {tokens}: ${tokenA} -> ${tokenB > 0 ? red(tokenB) : grn(0)}`);
  console.log(`  rank tables gained: ${reAdd} · lost: ${reDrop > 0 ? red(reDrop) : 0}` +
    ` · value sets changed: ${reChg.length ? yel(reChg.length) + ' (' + reChg.slice(0, 10).join(', ') + ')' : grn(0)}`);
}

console.log(bold(`\ncombos  ${A.combos.length} -> ${B.combos.length}`));
const ck = c => `${c.a}+${c.b}${c.ga ? `(${c.ga}/${c.gb})` : ''}`;
const ca = indexBy(A.combos, 0), cb = new Map(B.combos.map(c => [ck(c), c]));
const caM = new Map(A.combos.map(c => [ck(c), c]));
const cAdded = [...cb.keys()].filter(k => !caM.has(k));
const cRemoved = [...caM.keys()].filter(k => !cb.has(k));
const cChanged = [...caM.keys()].filter(k => cb.has(k) && cb.get(k).c !== caM.get(k).c);
if (cAdded.length) console.log(grn(`  +${cAdded.length} new recipes: `) + cAdded.slice(0, 12).join(', ') + (cAdded.length > 12 ? ` …+${cAdded.length - 12}` : ''));
if (cRemoved.length) console.log(red(`  -${cRemoved.length} REMOVED: `) + cRemoved.slice(0, 12).join(', '));
if (cChanged.length) {
  console.log(red(bold(`  !! ${cChanged.length} recipes now produce a DIFFERENT child:`)));
  for (const k of cChanged) console.log(`     ${k}: ${caM.get(k).c} -> ${cb.get(k).c}`);
}
if (!cAdded.length && !cRemoved.length && !cChanged.length) console.log(grn('  identical'));

console.log(bold(`\npassives  ${A.passives.length} -> ${B.passives.length}`));
const sa = indexBy(A.passives, 'n'), sb = indexBy(B.passives, 'n');
const sAdd = [...sb.keys()].filter(k => !sa.has(k)), sRem = [...sa.keys()].filter(k => !sb.has(k));
if (sAdd.length) console.log(grn(`  +${sAdd.length}: `) + sAdd.join(', '));
if (sRem.length) console.log(red(`  -${sRem.length} REMOVED: `) + sRem.join(', '));
const sChg = [...sa.keys()].filter(k => sb.has(k) && !eq(sa.get(k), sb.get(k)));
if (sChg.length) console.log(yel(`  ~${sChg.length} changed: `) + sChg.slice(0, 15).join(', '));
if (!sAdd.length && !sRem.length && !sChg.length) console.log(grn('  identical'));

// Anything the app persists by key breaks if a key disappears: roster entries,
// saved plans and the owned-star list are all stored as pal keys in localStorage.
if (removed.length) {
  console.log(red(bold('\n!! user-data risk: ')) + `${removed.length} pal keys vanish. Saved rosters, plans and ` +
    'owned-stars referencing them are dropped on load (data.js is filtered by byKey).');
}
console.log('');
