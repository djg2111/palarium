// ================= skills catalog =================
// Partner skills and passives both existed only as scattered detail — a partner
// skill on its own pal card, a passive as a row in a picker. Everything below
// reads the same DATA the rest of the app does and turns it into two browsable
// indexes plus the base-aura group, which is the reason the tab exists.

// ---------- reading DATA.pals[i].ps ----------
// Everything the rank tables need now ships in the data (see
// tools/partner-skills.js), so nothing here has to be inferred:
//   rl  label per row          ru  unit: '%' | '' | 'lv' | 's' | 'x' | 'flag'
//   rt  who it lands on        rc  what narrows it, where anything does
//   re  five ranks of [row index, value]
// Rank 1 is what the description quotes; a row can start empty and appear from
// rank 2 (Direhowl's move speed), which is a real fact about the skill.
const PS_PALS = PALS.filter(p => p.ps && p.ps.n);
const PS_TARGET = {s: 'this pal', p: 'you', sp: 'you and this pal', o: 'your party pals',
  a: 'the pal fighting with you', b: 'every pal at the base', f: 'base facilities'};
// rows of the rank table — [{label, unit, target, vals[5], flat}]. A 'flag' row
// is an on/off trait with no number (an air dash, a lava immunity); it is not a
// rank row and comes back separately.
function psRankRows(ps) {
  if (!ps || !ps.re || !ps.re.length || !ps.rl.length) return [];
  const byIdx = new Map();
  ps.re.forEach((rank, ri) => {
    for (const [li, v] of rank) {
      if (!byIdx.has(li)) byIdx.set(li, new Array(5).fill(null));
      byIdx.get(li)[ri] = v;
    }
  });
  const rows = [];
  for (const [li, vals] of byIdx) {
    const unit = (ps.ru || [])[li] ?? '';
    if (unit === 'flag') continue;
    const seen = [...new Set(vals.filter(v => v !== null))];
    rows.push({label: ps.rl[li] ?? '', unit, target: (ps.rt || [])[li] || '',
      cond: (ps.rc || [])[li] || '',
      vals, flat: seen.length === 1 && vals.every(v => v !== null)});
  }
  return rows;
}
// the on/off traits, which the rank table has no column for
const psFlags = ps => (ps.rl || [])
  .map((l, i) => ((ps.ru || [])[i] === 'flag' ? l : null)).filter(Boolean);
const psVal = (v, unit) => v === null ? '—'
  : unit === '%' ? (v > 0 ? '+' + v + '%' : v + '%')
  : unit === 'lv' ? (v > 0 ? '+' + v : String(v))
  : unit === 's' ? v + 's'
  : unit === 'x' ? '×' + v
  : String(v);
// the 5xN table, shared by the pal card and the catalog
function psRankTable(p) {
  const rows = psRankRows(p.ps);
  if (!rows.length) return null;
  const tbl = document.createElement('table'); tbl.className = 'ranktbl';
  const cap = document.createElement('caption');
  cap.textContent = 'Partner skill rank (souls spent to raise it)';
  tbl.appendChild(cap);
  const thead = document.createElement('thead'), hr = document.createElement('tr');
  const th0 = document.createElement('th'); th0.scope = 'col'; th0.textContent = 'Effect'; hr.appendChild(th0);
  for (let i = 1; i <= 5; i++) {
    const th = document.createElement('th'); th.scope = 'col'; th.textContent = 'Rk ' + i; hr.appendChild(th);
  }
  thead.appendChild(hr); tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = r.label;
    // Sekhmet grants work speed twice over, +20% to the base and +30% to
    // itself — without the target the two rows read as a duplicate
    if (PS_TARGET[r.target]) {
      const w = document.createElement('span'); w.className = 'rtgt';
      // A condition on a group target narrows who receives it, so it replaces
      // the target ("Anubis only"); on a self/player target it's a requirement
      // for the effect to fire at all, so it qualifies it instead.
      w.textContent = !r.cond ? PS_TARGET[r.target]
        : /^[bfoa]$/.test(r.target) ? r.cond
        : PS_TARGET[r.target] + ' — ' + r.cond;
      th.appendChild(w);
    }
    tr.appendChild(th);
    r.vals.forEach(v => {
      const td = document.createElement('td');
      td.textContent = psVal(v, r.unit);
      if (v === null) td.title = 'This effect only starts at a higher rank';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  return tbl;
}

// The generator resolves the game's unresolved {ReferencePassive1_EffectValue1}
// tokens against DT_PartnerSkillParameter, so none reach the app today. This
// stays as the guard for a future game update that ships a token the extractor
// doesn't know: marked as the gap it is, rather than printed raw.
const PS_PLACEHOLDER = /\{[^}]+\}/g;
function psDesc(text) {
  const f = document.createDocumentFragment();
  let at = 0;
  for (const m of String(text).matchAll(PS_PLACEHOLDER)) {
    if (m.index > at) f.append(text.slice(at, m.index));
    const s = document.createElement('span'); s.className = 'phold'; s.textContent = '?';
    s.title = 'The game’s own description ships without this number (' + m[0] + ')';
    f.append(s);
    at = m.index + m[0].length;
  }
  f.append(text.slice(at));
  return f;
}

// ---------- base auras ----------
// The flagship group. 23 partner skills do something while the pal is assigned
// to a base; 12 of them raise one Work Suitability by +1 for every other pal
// there, and between them they cover all twelve jobs exactly once.
//
// Two signals, answering different questions. The "Base Aura" tag is sourced —
// the game aims those effects at ToBaseCampPal or ToBuildObject, so they really
// do reach the rest of the base. The description clause is what gets shown, and
// it also catches the three pals whose base effect is not an aura at all:
// Jelliette and Jellroy buff only themselves when both are home, and Panthalus
// just patrols.
const BASE_CLAUSE = /\bWhile\b[^.]*\bbase\b[^.]*(\.|$)/i;
const AURA_WORK = [['gathering', /Gathering/i], ['lumbering', /Lumbering/i], ['handiwork', /Handiwork/i],
  ['watering', /Watering/i], ['farming', /Farming/i], ['generatingElectricity', /Generating Electricity/i],
  ['kindling', /Kindling/i], ['planting', /Planting/i], ['transporting', /Transporting/i],
  ['mining', /Mining/i], ['cooling', /Cooling/i], ['medicineProduction', /Medicine Production/i]];
function auraOf(p) {
  const d = (p.ps && p.ps.d || '').replace(/\s+/g, ' ');
  const m = d.match(BASE_CLAUSE);
  if (!m) return null;
  const clause = m[0].trim();
  const work = /Work Suitability Level/i.test(clause)
    ? (AURA_WORK.find(([, re]) => re.test(clause)) || [null])[0] : null;
  const reaches = (p.ps.t || []).includes('Base Aura');
  let group = 'other';
  if (work) group = 'work';
  else if (/patrol|intruder|bombard/i.test(clause)) group = 'guard';
  else if (!reaches) group = 'cond';          // a base effect that buffs nobody else
  else if (/crop|harvest|egg|incubat|breeding farm/i.test(clause)) group = 'farm';
  else if (/hunger|SAN\b|sanity/i.test(clause)) group = 'upkeep';
  return {p, clause, work, group, reaches,
    stacks: !/does not stack/i.test(d)};
}
const AURAS = PS_PALS.map(auraOf).filter(Boolean);
const AURA_KEYS = new Set(AURAS.map(a => a.p.k));
const AURA_GROUPS = [
  {k: 'work', t: 'Work suitability +1 for every other base pal',
   s: 'One pal per job, and between them they cover all twelve. Assigning one lifts every other pal at that base by a full suitability level — the same as a Lv 1 worker becoming Lv 2. None of them stack, and none of them scale with partner-skill rank, so one of each is the whole story.'},
  {k: 'farm', t: 'Farming & incubation',
   s: 'Base-wide output, and the only partner skills that touch breeding throughput.'},
  {k: 'upkeep', t: 'Upkeep — hunger & sanity',
   s: 'Base pals that stop working to eat or to sulk are the usual reason a base stalls.'},
  {k: 'other', t: 'Other base bonuses'},
  {k: 'guard', t: 'Base defense'},
  {k: 'cond', t: 'Conditional & single-target',
   s: 'Base effects that reach nobody else — they need a specific partner at the base, and then only pay out to the pal itself.'},
];

// ---------- partner-skill effect tags ----------
// ps.t is the normalized effect tag list — 89 distinct tags. It's the reason
// this is browsable at all, so it's the filter; search is secondary.
const PS_TAGS = new Map();                       // tag -> count
for (const p of PS_PALS) for (const t of p.ps.t || []) PS_TAGS.set(t, (PS_TAGS.get(t) || 0) + 1);
const tagSlug = t => t.toLowerCase().replace(/\+\+$/, '').replace(/--$/, '-down')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TAG_BY_SLUG = new Map([...PS_TAGS.keys()].map(t => [tagSlug(t), t]));
// families, by rule rather than by an 89-entry hand list
function tagFamily(t) {
  if (/Mount|Move Speed|Swim Speed|Climb Speed|Jump|Stealth|Durability|Fall Damage/.test(t)) return 'travel';
  if (/Resist|Inflict|Immunity|Damage vs|Slower /.test(t)) return 'status';
  if (/Capture|Collar|Drop|Item Pickup|Carry Capacity|Pal EXP|Extra Drops|Fishing|Homing/.test(t)) return 'loot';
  if (/Dmg|Atk|Attack|Defense|Life Steal|HP Regen|Shield|Cooldown|Weak Point|Dodge|Reload/.test(t)) return 'combat';
  return 'work';
}
const TAG_ICON = {   // tags that map straight onto an already-shipped game icon
  'Collection++': ['work', 'gathering'], 'Deforest++': ['work', 'lumbering'], 'Logging++': ['work', 'lumbering'],
  'Handcraft++': ['work', 'handiwork'], 'Craft Speed++': ['work', 'handiwork'], 'Watering++': ['work', 'watering'],
  'Seeding++': ['work', 'planting'], 'Farming++': ['work', 'farming'], 'Monster Farm++': ['work', 'farming'],
  'Generate Electricity++': ['work', 'generatingElectricity'], 'Emit Flame++': ['work', 'kindling'],
  'Cool++': ['work', 'cooling'], 'Transport++': ['work', 'transporting'], 'Product Medicine++': ['work', 'medicineProduction'],
  'Mining++': ['work', 'mining'],
};
const ELEM_WORDS = {Fire: 'fire', Water: 'water', Electric: 'electric', Grass: 'grass', Dark: 'dark',
  Dragon: 'dragon', Ground: 'ground', Ice: 'ice', Neutral: 'normal'};
function tagIcon(t, size = 15) {
  if (TAG_ICON[t]) return uiIcon(TAG_ICON[t][0], TAG_ICON[t][1], size);
  const w = Object.keys(ELEM_WORDS).find(k => t.startsWith(k + ' '));
  return w ? uiIcon('element', ELEM_WORDS[w], size) : null;
}

// ---------- passive effects ----------
// DATA.passives[i].e is the parsed effect string, one effect per comma. The key
// is also the icon name (see passiveIconKey) and the generator writes the unit
// it sourced, so the table below only adds a human label, which category the
// effect belongs to, and which direction of the number is the good one.
const PV_EFFECTS = {
  craftspeed: ['Work speed', 'work', 1], logging: ['Lumbering speed', 'work', 1],
  mining: ['Mining speed', 'work', 1],
  worksuitabilityaddrank_monsterfarm: ['Farming suitability', 'work', 1],
  shotattack: ['Attack', 'atk', 1], lifesteal: ['Life steal', 'atk', 1],
  defense: ['Defense', 'def', 1], maxhp: ['Max HP', 'def', 1],
  autohpregenerate: ['HP regeneration', 'def', 1], explosionresist: ['Explosion resistance', 'def', 1],
  resistadditionaleffect_burn: ['Burn resistance', 'def', 1],
  resistadditionaleffect_poison: ['Poison resistance', 'def', 1],
  knockbackinvalid_forpassiveskill: ['Immune to knockback', 'def', 1],
  leanbackinvalid_forpassiveskill: ['Immune to flinching', 'def', 1],
  activeskillcooltime_decrease: ['Skill cooldown reduction', 'atk', 1],
  reloadspeedup: ['Reload speed', 'atk', 1],
  movespeed: ['Move speed', 'move', 1], swimspeed: ['Swim speed', 'move', 1],
  palsp_increase: ['Pal stamina', 'move', 1],
  playersp_decreaserate: ['Player stamina drain', 'move', -1],
  ridejumpcount_increase: ['Extra mount jumps', 'move', 1],
  fullstomatch_decrease: ['Hunger rate', 'upkeep', -1],
  sanity_decrease: ['Sanity loss rate', 'upkeep', -1],
  nightowl: ['Works through the night', 'upkeep', 1],
  nocturnal: ['Nocturnal — works at night', 'upkeep', 1],
  breedspeed: ['Breeding speed', 'breed', 1],
  breedspeed_inbasecamp: ['Breeding speed at base', 'breed', 1],
  palegghatchingspeed: ['Egg hatching speed', 'breed', 1],
  selfdeathadditemdrop: ['Extra drops when defeated', 'loot', 1],
  shopsellprice_money_increase: ['Selling price', 'loot', 1],
  shopbuyprice_money_increase: ['Buying price', 'loot', -1],
  nonkilling: ['Never lands the killing blow', 'loot', 1],
  worldtreedecayimmunity: ['Immune to World Tree decay', 'def', 1],
};
const PV_CATS = [['work', 'Work speed'], ['atk', 'Attack'], ['def', 'Defense & survival'],
  ['move', 'Movement & stamina'], ['upkeep', 'Hunger & sanity'], ['breed', 'Breeding'],
  ['loot', 'Loot & trade'], ['elem', 'Element damage & resistance']];
function pvEffect(part) {
  // The generator writes the unit it sourced, so the shape says which it is:
  //   "craftspeed +50% (party)"        percentage
  //   "ridejumpcount_increase +2"      a count, not a percentage
  //   "nightowl"                       an on/off trait, no number at all
  const m = part.match(/^(\S+)(?:\s+([+-]?[\d.]+)(%?))?(\s*\(party\))?$/);
  if (!m) return {key: part, val: null, party: false, label: part, cat: 'elem', good: 1, unit: ''};
  const key = m[1], val = m[2] === undefined ? null : parseFloat(m[2]);
  const unit = val === null ? 'flag' : m[3] || '';
  const e = PV_EFFECTS[key];
  if (e) return {key, val, party: !!m[4], label: e[0], cat: e[1], good: e[2], unit};
  const el = key.match(/^element(boost|resist)_(\w+)$/);
  const nm = {leaf: 'Grass', earth: 'Ground', electricity: 'Electric', normal: 'Neutral'};
  if (el) {
    const t = nm[el[2]] || el[2][0].toUpperCase() + el[2].slice(1);
    return {key, val, party: !!m[4], cat: 'elem', good: 1, unit,
      label: t + (el[1] === 'boost' ? ' attack' : ' resistance')};
  }
  return {key, val, party: !!m[4], label: pretty(key), cat: 'elem', good: 1, unit};
}
const pvText = e => e.unit === 'flag' ? e.label
  : e.label + ' ' + (e.val > 0 ? '+' : '') + e.val + (e.unit === '%' ? '%' : '');
// a passive is detrimental when the game says so (negative rank); "mixed" is a
// worthwhile passive that still carries a downside, which is what you actually
// need to know before breeding it in
const PV_LIST = PASSIVES.map(m => {
  const fx = m.e.split(', ').map(pvEffect);
  const bad = fx.some(e => e.val !== null && e.unit !== 'flag' && e.val * e.good < 0);
  return {m, fx, cats: [...new Set(fx.map(e => e.cat))],
    sign: m.r < 0 ? 'bad' : bad ? 'mixed' : 'good'};
});
const PV_TIERS = [[5, 'Rank 5 · World Tree'], [4, 'Rank 4'], [3, 'Rank 3'], [2, 'Rank 2'],
  [1, 'Rank 1'], [-1, 'Detrimental · minor'], [-2, 'Detrimental · major'], [-3, 'Detrimental · severe']];
const pvTier = r => (PV_TIERS.find(t => t[0] === r) || [0, 'Rank ' + r])[1];
// which passives the roster already carries, and on how many pals
function rosterPassiveCount() {
  const m = new Map();
  for (const r of roster) for (const n of r.ps || []) m.set(n, (m.get(n) || 0) + 1);
  return m;
}

// ---------- shared card pieces ----------
function palLink(p, size, num) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'palref';
  b.append(icon(p, size));
  const n = document.createElement('span'); n.textContent = p.n; b.appendChild(n);
  // the index is in paldex order, so say so rather than leaving it arbitrary
  if (num) { const z = document.createElement('span'); z.className = 'zk'; z.textContent = zk(p); b.appendChild(z); }
  b.title = 'Open ' + p.n + '’s card';
  b.setAttribute('aria-label', 'Open ' + p.n + '’s card');
  b.addEventListener('click', () => openModal(p));
  return b;
}
function tagChips(ps, {link = true} = {}) {
  const w = document.createElement('div'); w.className = 'pst';
  // "Base Aura" already has a badge of its own on every card that carries it
  for (const t of (ps.t || []).filter(t => t !== 'Base Aura')) {
    const c = document.createElement(link ? 'button' : 'span');
    c.className = 'mchip' + (link ? ' tagbtn' : '');
    const ic = tagIcon(t, 14); if (ic) c.appendChild(ic);
    c.append(t);
    if (link) {
      c.type = 'button';
      c.title = 'Show every pal with ' + t;
      c.setAttribute('aria-label', 'Show every partner skill tagged ' + t);
      c.addEventListener('click', () => openSkillTag(t));
    }
    w.appendChild(c);
  }
  return w;
}
// "+10% → +20%" — the rank scaling in one line, for the aura cards. The work
// auras are all flat +1s, which the group blurb already says once; repeating it
// on twelve cards buries the one row that does move (Ribbuny's attack buff).
function rankStrip(p, scalingOnly, baseOnly) {
  let rows = psRankRows(p.ps);
  // On an aura card, the rows that matter are the ones aimed at the base. A pal
  // whose triggered skill also scales (Smokie Cryst's cooldown, Cinnamoth's
  // damage multiplier) would otherwise look as though its aura scaled too — so
  // narrow to the base rows first, and only then drop the flat ones. Jelliette
  // and Jellroy have no base-targeted row at all — their base effect is on
  // themselves — so they keep the full list.
  if (baseOnly && rows.some(r => r.target === 'b' || r.target === 'f')) {
    rows = rows.filter(r => r.target === 'b' || r.target === 'f');
  }
  rows = rows.filter(r => !scalingOnly || !r.flat);
  if (!rows.length) return null;
  const w = document.createElement('div'); w.className = 'rankstrip';
  // named, because a multi-clause skill's other effects scale here too and the
  // card above only quotes the base clause
  const cap = document.createElement('div'); cap.className = 'rscap';
  cap.textContent = 'Partner-skill rank 1 → 5';
  w.appendChild(cap);
  for (const r of rows) {
    const s = document.createElement('span'); s.className = 'rk';
    const l = document.createElement('b');
    l.textContent = r.label + (r.cond ? ' (' + r.cond + ')' : '');
    s.appendChild(l);
    const first = r.vals.find(v => v !== null), last = r.vals[4];
    const v = document.createElement('span');
    v.textContent = r.flat ? psVal(first, r.unit) + ' at every rank'
      : psVal(first, r.unit) + ' → ' + psVal(last, r.unit);
    if (!r.flat) v.title = 'Rank 1 → rank 5 (partner-skill enhancement)';
    s.appendChild(v);
    w.appendChild(s);
  }
  return w;
}

// ---------- skills tab ----------
let skillMode = 'auras';
const skillModeEl = document.getElementById('skillMode');
function setSkillMode(m, silent) {
  skillMode = ['auras', 'partner', 'passives'].includes(m) ? m : 'auras';
  skillModeEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.m === skillMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  document.getElementById('skillAurasBlock').hidden = skillMode !== 'auras';
  document.getElementById('skillPartnerBlock').hidden = skillMode !== 'partner';
  document.getElementById('skillPassivesBlock').hidden = skillMode !== 'passives';
  if (skillMode === 'auras') renderAuras();
  if (skillMode === 'partner') renderPS();
  if (skillMode === 'passives') renderPassives();
  if (!silent) save();
}
skillModeEl.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) setSkillMode(b.dataset.m);
});
tablistKeys(skillModeEl);

// base auras
let aurasDrawn = false;
function renderAuras() {
  if (aurasDrawn) return;                       // static content — draw once
  aurasDrawn = true;
  const host = document.getElementById('auraGroups');
  host.textContent = '';
  for (const g of AURA_GROUPS) {
    const list = AURAS.filter(a => a.group === g.k);
    if (!list.length) continue;
    if (g.k === 'work') list.sort((a, b) => WORK_LABEL(a.work).localeCompare(WORK_LABEL(b.work)));
    else list.sort((a, b) => a.p.n.localeCompare(b.p.n));
    const sec = document.createElement('section'); sec.className = 'aurasec';
    const h = document.createElement('h2');
    h.textContent = g.t;
    const c = document.createElement('span'); c.className = 'rstats';
    c.textContent = list.length + (list.length === 1 ? ' pal' : ' pals');
    h.appendChild(c);
    sec.appendChild(h);
    if (g.s) { const s = document.createElement('p'); s.className = 'viewsub'; s.textContent = g.s; sec.appendChild(s); }
    const grid = document.createElement('div'); grid.className = 'auragrid';
    for (const a of list) grid.appendChild(auraCard(a));
    sec.appendChild(grid);
    host.appendChild(sec);
  }
}
function auraCard(a) {
  const card = document.createElement('div'); card.className = 'auracard';
  const head = document.createElement('div'); head.className = 'ahead';
  if (a.work) {
    const ic = uiIcon('work', a.work, 26);
    if (ic) head.appendChild(ic);
    const t = document.createElement('span'); t.className = 'atitle';
    t.textContent = WORK_LABEL(a.work) + ' +1';
    head.appendChild(t);
  } else {
    const t = document.createElement('span'); t.className = 'atitle'; t.textContent = a.p.ps.n;
    head.appendChild(t);
  }
  if (!a.stacks) {
    const b = document.createElement('span'); b.className = 'badge nostack'; b.textContent = 'Does not stack';
    b.title = 'A second copy of this pal at the same base adds nothing';
    head.appendChild(b);
  }
  card.appendChild(head);
  card.appendChild(palLink(a.p, 34));
  if (a.work) { const sn = document.createElement('div'); sn.className = 'askill'; sn.textContent = a.p.ps.n; card.appendChild(sn); }
  const d = document.createElement('p'); d.className = 'aclause'; d.textContent = a.clause; card.appendChild(d);
  const strip = rankStrip(a.p, !!a.work, true);
  if (strip) card.appendChild(strip);
  return card;
}

// partner-skill index
const psSearch = document.getElementById('psSearch');
const psTagSel = document.getElementById('psTag');
const psOwnedBtn = document.getElementById('psOwned');
const psFamilyEl = document.getElementById('psFamily');
const psMoreBtn = document.getElementById('psMore');
let psFamily = '', psOwnedOnly = false, psShown = 60;
for (const t of [...PS_TAGS.keys()].sort()) {
  const o = document.createElement('option');
  o.value = t; o.textContent = t + ' (' + PS_TAGS.get(t) + ')';
  psTagSel.appendChild(o);
}
const psTagIsel = makeIconSelect(psTagSel, 'work', v => (TAG_ICON[v] || [])[1]);
psTagIsel.refresh();
psSearch.addEventListener('input', () => { psShown = 60; renderPS(); });
psTagSel.addEventListener('change', () => {
  // a tag and a family that disagree would just show nothing — the tag wins
  if (psTagSel.value && psFamily && tagFamily(psTagSel.value) !== psFamily) setPsFamily('', true);
  psShown = 60; renderPS();
});
function setPsFamily(f, silent) {
  psFamily = f || '';
  psFamilyEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.f === psFamily;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (!silent) { psShown = 60; renderPS(); }
}
psFamilyEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPsFamily(b.dataset.f); });
psOwnedBtn.addEventListener('click', () => {
  psOwnedOnly = !psOwnedOnly; setSwitch(psOwnedBtn, psOwnedOnly); psShown = 60; renderPS();
});
psMoreBtn.addEventListener('click', () => {
  const from = psShown;          // index of the first card about to appear
  psShown += 60; renderPS();
  if (!psMoreBtn.hidden) { psMoreBtn.focus(); return; }
  // The last press hides this button, so focus would fall to <body>. Land on
  // the first newly revealed skill instead — that is what the press asked for.
  const cards = document.querySelectorAll('#psList .skillcard');
  const c = cards[from] || cards[cards.length - 1];
  ((c && c.querySelector('.palref')) || psSearch).focus();
});
document.getElementById('psClear').addEventListener('click', () => {
  psSearch.value = ''; psTagSel.value = ''; psTagIsel.sync();
  psOwnedOnly = false; setSwitch(psOwnedBtn, false);
  setPsFamily('', true); psShown = 60; renderPS(); psSearch.focus();
});
// opened from a tag chip anywhere in the app
function openSkillTag(t) {
  closeModal(true);
  psTagSel.value = PS_TAGS.has(t) ? t : ''; psTagIsel.sync();
  setPsFamily('', true); psShown = 60;
  setSkillMode('partner', true);
  navTab('skills');
  toast(PS_TAGS.has(t) ? PS_TAGS.get(t) + ' partner skills tagged ' + t : 'Showing all partner skills');
}
function renderPS() {
  const q = psSearch.value.trim().toLowerCase();
  const tag = psTagSel.value;
  const os = ownedSpeciesSet();
  const rows = PS_PALS.filter(p => {
    if (tag && !(p.ps.t || []).includes(tag)) return false;
    if (psFamily === 'base' ? !AURA_KEYS.has(p.k)
      : psFamily && !(p.ps.t || []).some(t => tagFamily(t) === psFamily)) return false;
    if (psOwnedOnly && !os.has(p.k)) return false;
    if (q && !(p.n.toLowerCase().includes(q) || p.ps.n.toLowerCase().includes(q)
      || (p.ps.d || '').toLowerCase().includes(q) || (p.ps.t || []).some(t => t.toLowerCase().includes(q)))) return false;
    return true;
  });
  const filtered = q || tag || psFamily || psOwnedOnly;
  document.getElementById('psCount').textContent =
    filtered ? rows.length + ' of ' + PS_PALS.length + ' partner skills' : PS_PALS.length + ' partner skills';
  document.getElementById('psClear').hidden = !filtered;
  const list = document.getElementById('psList');
  list.textContent = '';
  if (!rows.length) {
    const h = document.createElement('div'); h.className = 'hint';
    h.textContent = psOwnedOnly ? 'No pals you own have this effect — clear “Owned only” to see who does.'
      : 'No partner skills match these filters.';
    list.appendChild(h);
    psMoreBtn.hidden = true;
    return;
  }
  for (const p of rows.slice(0, psShown)) list.appendChild(psCard(p));
  const left = Math.max(0, rows.length - psShown);
  psMoreBtn.hidden = !left;
  psMoreBtn.textContent = 'Show more (' + left + ' left)';
}
function psCard(p) {
  const card = document.createElement('div'); card.className = 'skillcard';
  const head = document.createElement('div'); head.className = 'shead';
  head.appendChild(palLink(p, 40, true));
  if ((p.ps.t || []).includes('Base Aura')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'badge aura';
    b.textContent = 'Base aura'; b.title = 'Lifts every other pal at the base — see the Base auras tab';
    b.addEventListener('click', () => { setSkillMode('auras'); scrollTo({top: 0, behavior: SMOOTH}); });
    head.appendChild(b);
  }
  card.appendChild(head);
  const n = document.createElement('div'); n.className = 'psn'; n.textContent = p.ps.n; card.appendChild(n);
  if ((p.ps.t || []).length) card.appendChild(tagChips(p.ps));
  const d = document.createElement('p'); d.className = 'psd'; d.append(psDesc(p.ps.d || '—')); card.appendChild(d);
  // on/off traits carry no number, so they'd be an empty row in the table
  const flags = psFlags(p.ps);
  if (flags.length) {
    const f = document.createElement('div'); f.className = 'flatnote';
    f.textContent = 'Always on: ' + flags.join(' · ');
    card.appendChild(f);
  }
  const rows = psRankRows(p.ps);
  if (rows.length) {
    const det = document.createElement('details'); det.className = 'rankdet';
    const sum = document.createElement('summary');
    sum.textContent = rows.some(r => !r.flat) ? 'Rank scaling' : 'Rank values (flat)';
    det.append(sum, psRankTable(p));
    card.appendChild(det);
  }
  return card;
}

// passive index
const pvSearch = document.getElementById('pvSearch');
const pvCatSel = document.getElementById('pvCat');
const pvOwnedBtn = document.getElementById('pvOwned');
const pvSignEl = document.getElementById('pvSign');
let pvSign = '', pvOwnedOnly = false;
for (const [k, label] of PV_CATS) {
  const o = document.createElement('option'); o.value = k; o.textContent = label; pvCatSel.appendChild(o);
}
// the category icon is the icon of the first effect key that belongs to it —
// the same passive icons the chips and the roster filter already use
const PV_CAT_ICON = {};
for (const [k] of PV_CATS) {
  const hit = Object.entries(PV_EFFECTS).find(([, e]) => e[1] === k);
  PV_CAT_ICON[k] = k === 'elem' ? 'elementboost_fire' : hit && hit[0];
}
const pvCatIsel = makeIconSelect(pvCatSel, 'passive', v => PV_CAT_ICON[v]);
pvCatIsel.refresh();
pvSearch.addEventListener('input', renderPassives);
pvCatSel.addEventListener('change', renderPassives);
function setPvSign(g, silent) {
  pvSign = g || '';
  pvSignEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.g === pvSign;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (!silent) renderPassives();
}
pvSignEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPvSign(b.dataset.g); });
pvOwnedBtn.addEventListener('click', () => {
  pvOwnedOnly = !pvOwnedOnly; setSwitch(pvOwnedBtn, pvOwnedOnly); renderPassives();
});
document.getElementById('pvClear').addEventListener('click', () => {
  pvSearch.value = ''; pvCatSel.value = ''; pvCatIsel.sync();
  pvOwnedOnly = false; setSwitch(pvOwnedBtn, false);
  setPvSign('', true); renderPassives(); pvSearch.focus();
});
function renderPassives() {
  const q = pvSearch.value.trim().toLowerCase();
  const cat = pvCatSel.value;
  const have = rosterPassiveCount();
  const rows = PV_LIST.filter(e => {
    if (pvSign && e.sign !== pvSign) return false;
    if (cat && !e.cats.includes(cat)) return false;
    if (pvOwnedOnly && !have.has(e.m.n)) return false;
    if (q && !(e.m.n.toLowerCase().includes(q) || e.fx.some(f => f.label.toLowerCase().includes(q))
      || e.m.e.toLowerCase().includes(q))) return false;
    return true;
  });
  const filtered = q || cat || pvSign || pvOwnedOnly;
  document.getElementById('pvCount').textContent =
    filtered ? rows.length + ' of ' + PV_LIST.length + ' passives' : PV_LIST.length + ' passives';
  document.getElementById('pvClear').hidden = !filtered;
  const list = document.getElementById('pvList');
  list.textContent = '';
  if (!rows.length) {
    const h = document.createElement('div'); h.className = 'hint';
    h.textContent = pvOwnedOnly ? 'None of your roster pals carry a passive matching this — clear “In my roster” to see the rest.'
      : 'No passives match these filters.';
    list.appendChild(h);
    return;
  }
  // grouped by the game's own rank, best first: rank is the honest answer to
  // "is this worth breeding for", and it's what the breeding odds key off
  for (const [r, label] of PV_TIERS) {
    const grp = rows.filter(e => e.m.r === r);
    if (!grp.length) continue;
    grp.sort((a, b) => a.m.n.localeCompare(b.m.n));
    const sec = document.createElement('section'); sec.className = 'pvsec' + (r < 0 ? ' bad' : '');
    const h = document.createElement('h2'); h.textContent = label;
    const c = document.createElement('span'); c.className = 'rstats'; c.textContent = grp.length;
    h.appendChild(c);
    sec.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'pvgrid';
    for (const e of grp) grid.appendChild(pvCard(e, have.get(e.m.n) || 0));
    sec.appendChild(grid);
    list.appendChild(sec);
  }
}
function pvCard(e, mine) {
  const card = document.createElement('div'); card.className = 'pvcard s-' + e.sign;
  const head = document.createElement('div'); head.className = 'pvhead';
  const ic = passiveIcon(e.m, 20); if (ic) head.appendChild(ic);
  const n = document.createElement('span'); n.className = 'pvn'; n.textContent = e.m.n;
  head.appendChild(n);
  const rk = document.createElement('span'); rk.className = 'mchip pvrank';
  rk.textContent = e.m.r > 0 ? '★'.repeat(e.m.r) : '▼'.repeat(-e.m.r);
  rk.title = pvTier(e.m.r);
  head.appendChild(rk);
  card.appendChild(head);
  const ul = document.createElement('ul'); ul.className = 'pvfx';
  for (const f of e.fx) {
    const li = document.createElement('li');
    const good = f.unit === 'flag' ? 0 : Math.sign(f.val * f.good);
    li.className = good < 0 ? 'dn' : good > 0 ? 'up' : '';
    li.textContent = pvText(f) + (f.party ? ' · whole party' : '');
    ul.appendChild(li);
  }
  card.appendChild(ul);
  const foot = document.createElement('div'); foot.className = 'pvfoot';
  if (e.m.mt) {
    const b = document.createElement('span'); b.className = 'badge mut'; b.textContent = '🧬 Mutation only';
    b.title = 'Only rolls onto mutation pals — you can’t catch it on an ordinary wild pal, so it has to be bred in from one';
    foot.appendChild(b);
  }
  if (mine) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'badge have';
    b.textContent = '✓ On ' + mine + ' roster pal' + (mine === 1 ? '' : 's');
    b.title = 'Show these in your roster';
    b.addEventListener('click', () => {
      rosterPassiveFilter.value = e.m.n; rosterPassiveSel.sync(); renderRoster(); navTab('roster');
    });
    foot.appendChild(b);
  }
  if (foot.childNodes.length) card.appendChild(foot);
  return card;
}

