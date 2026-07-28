// ---------- planner: route ----------
const SLOTS = [1, 2, 3, 4];
const slotPassives = {1: [], 2: [], 3: [], 4: []};
const slotGenders = {1: null, 2: null, 3: null, 4: null};
const pickS = {}, slotPass = {};
// one string for the empty-route state, wherever it's shown
const ROUTE_HINT_TEXT = 'Pick at least Start pal 1 and a target species — the route appears here automatically.';
const ROUTE_HINT = '<div class="hint">' + ROUTE_HINT_TEXT + '</div>';
// recompute automatically (debounced) once a starter and target are both set
let autoTimer = null;
// Breedable now's "Plan this route" focuses the target picker, and 600ms later
// computeRoute's own scrollIntoView carries that picker 460-512px above the
// viewport at 360 — focused, announced and entirely off-screen. A one-shot flag
// rather than a timer guessing when the route lands (WCAG 2.4.11, DESIGN.md §9).
let focusRouteOnArrival = false;
function planFocusOnArrival() { focusRouteOnArrival = true; }
function scheduleAuto() {
  if (booting) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (pickPT.get() && SLOTS.some(n => pickS[n].get())) computeRoute();
    else {
      // no route is coming, so a pending hand-off must not steal the next one
      focusRouteOnArrival = false;
      if (currentRoute) { // inputs no longer complete — drop the stale route
        currentRoute = null;
        document.getElementById('routeOut').innerHTML = ROUTE_HINT; setPlanStatus(ROUTE_HINT_TEXT);
        save();
      }
    }
  }, 600);
}
for (const n of SLOTS) {
  pickS[n] = makePicker(document.getElementById('pickS' + n), {
    placeholder: n === 1 ? 'Pick a species…' : 'Add another starter…',
    // ariaLabel, or makePicker names the control after its placeholder and the
    // visible "Start pal 2" label reaches no accessible name (2.5.3)
    ariaLabel: 'Start pal ' + n,
    allowClear: true, ownedToggle: true,
    onChange: () => { slotPassives[n] = []; slotGenders[n] = null; slotPass[n].set([]); updateSlotUI(); save(); scheduleAuto(); }});
  slotPass[n] = makePassivePicker(document.getElementById('passS' + n), 4,
    // renderCarryRow, or the candidate list stays stale: the carry row is a
    // function of exactly these passives, so it has to rebuild when they change
    () => { slotPassives[n] = slotPass[n].get(); renderCarryRow(); save(); scheduleAuto(); });
}
// progressive disclosure: show the next empty slot only once the previous one is
// filled, and each slot's passive input only once its species is chosen
function updateSlotUI() {
  for (const n of SLOTS) {
    const has = !!pickS[n].get();
    if (n > 1) document.getElementById('pickS' + n).closest('.slot').hidden = !has && !pickS[n - 1].get();
    document.getElementById('passS' + n).hidden = !has;
  }
  // the carry block follows the same progressive-disclosure rule: it is a
  // question about the starters, so it appears once there is a starter to ask about
  document.getElementById('carryRow').hidden = !SLOTS.some(n => pickS[n].get());
  renderCarryRow();
}
const pickPT = makePicker(document.getElementById('pickPT'), {placeholder:'Pick a species…', ariaLabel:'Target species', allowClear:true, ownedToggle:true, onChange: () => { save(); scheduleAuto(); }});
const desiredPick = makePassivePicker(document.getElementById('carryPass'), 4,
  () => { renderCarryRow(); save(); scheduleAuto(); }, {describedBy: 'carryHint'});

// ---------- passives to carry ----------
// The union of every starter's passives — what the route would carry if the cap
// allowed it. A pal has four passive slots, so this is a candidate list, not a
// promise (see starterUnion consumers in computeRoute).
function starterUnion() {
  return [...new Set(SLOTS.flatMap(n => (pickS[n].get() ? slotPassives[n] : [])))];
}
// The set the route will actually try to carry. Empty when the starters hold
// more than four and the user hasn't chosen: with C(8,4)=70 candidate subsets
// and no signal which one is wanted, the app states the cap rather than picking
// four and then pricing them — a machine-made choice presented with odds is a
// more confident wrong answer than no answer (DESIGN.md §4).
function carryGoal() {
  const picked = desiredPick.get();
  if (picked.length) return picked;
  const union = starterUnion();
  return union.length <= 4 ? union : [];
}
function renderCarryRow() {
  const row = document.getElementById('carryFrom');
  const hint = document.getElementById('carryHint');
  const union = starterUnion(), picked = desiredPick.get();
  const lb = document.getElementById('carryFromLb');
  row.replaceChildren(lb);
  row.hidden = !union.length;
  for (const n of union) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pset';
    const on = picked.includes(n);
    b.setAttribute('aria-pressed', String(on));
    // a toggle, not add-and-vanish: a chip that disappears under a finger
    // reflows the row mid-tap, and aria-pressed gives AT the state directly
    b.setAttribute('aria-label', 'Carry ' + n);
    const meta = PASSIVES.find(p => p.n === n);
    if (meta) b.appendChild(passiveIcon(meta, 14));
    b.append(n);
    // at the cap the remaining options are refused preventively, rather than by
    // an error after the press — the reason is in #carryHint directly below
    if (!on && picked.length >= 4) b.disabled = true;
    b.addEventListener('click', () => {
      desiredPick.set(on ? picked.filter(x => x !== n) : [...picked, n]);
      renderCarryRow(); save(); scheduleAuto();
      // the row was just rebuilt — put focus back on the same chip
      const again = [...row.querySelectorAll('.pset')].find(x => x.textContent.trim() === n);
      if (again) again.focus();
    });
    row.appendChild(b);
  }
  rovingRow(row);
  hint.textContent = !union.length ? 'Nothing to carry yet — add passives under a start pal.'
    : !picked.length ? (union.length <= 4
        ? `Carrying all ${union.length} your starters hold. Pick fewer to raise the odds.`
        : `A pal holds 4 passives. Your starters hold ${union.length} — pick up to 4.`)
    : picked.length >= 4 ? 'Carrying these 4 — a pal’s limit. Remove one to swap.'
    : `Carrying ${picked.length === 1 ? 'this one' : 'these ' + picked.length}. You can add ${4 - picked.length} more.`;
}
document.getElementById('clearSlots').addEventListener('click', () => {
  clearTimeout(autoTimer);
  const had = SLOTS.some(n => pickS[n].get()) || pickPT.get() || desiredPick.get().length;
  const snap = {
    slots: SLOTS.map(n => pickS[n].get()),
    sp: SLOTS.map(n => [...slotPassives[n]]),
    sg: SLOTS.map(n => slotGenders[n]),
    pt: pickPT.get(), dp: desiredPick.get(),
  };
  for (const n of SLOTS) { pickS[n].set(null, true); slotPassives[n] = []; slotGenders[n] = null; }
  pickPT.set(null, true); desiredPick.clear();
  currentRoute = null; renderSlotChips();
  document.getElementById('routeOut').innerHTML = ROUTE_HINT; setPlanStatus(ROUTE_HINT_TEXT);
  save();
  if (had) toast('Planner inputs cleared', () => {
    for (const n of SLOTS) { pickS[n].set(snap.slots[n - 1], true); slotPassives[n] = snap.sp[n - 1]; slotGenders[n] = snap.sg[n - 1]; }
    pickPT.set(snap.pt, true); desiredPick.set(snap.dp);
    renderSlotChips(); save(); scheduleAuto();
  });
});
function setSlotAuto(rosterEntry) {
  const free = SLOTS.find(i => !pickS[i].get());
  const n = free ?? 4;
  if (!free) {
    const old = pickS[4].get();
    if (old) toast('All 4 start slots are full — replaced ' + old.n + ' in slot 4');
  }
  pickS[n].set(byKey.get(rosterEntry.k), true);
  slotPassives[n] = [...rosterEntry.ps];
  slotGenders[n] = rosterEntry.g || null;
  renderSlotChips();
  save();
  setPlanMode('new');
  navTab('plan');
  scheduleAuto();
  document.getElementById('pickS1').scrollIntoView({block:'center', behavior: SMOOTH});
}
function renderSlotChips() {
  for (const n of SLOTS) slotPass[n].set(slotPassives[n]);
  updateSlotUI();
}
// ---------- planner sub-tabs: new route vs saved plans ----------
// the bar stays hidden until a plan exists; last-used mode persists so a
// player who was tracking a plan lands straight back on their to-do list
let planMode = 'new';
const planModeEl = document.getElementById('planMode');
function setPlanMode(m) {
  planMode = m;
  planModeEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.m === m;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  document.getElementById('planNewBlock').hidden = m !== 'new';
  document.getElementById('planSavedBlock').hidden = m !== 'saved';
  save();
}
planModeEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPlanMode(b.dataset.m); });
tablistKeys(planModeEl);
// which species may be used as a chain partner:
//   'any'  — every species, whether or not the player could ever hold one
//   'wild' — owned, or catchable somewhere in the world (see partnerPool)
//   'mine' — owned only
// Three states, so a switch won't do it; .segrow is what the rest of the app
// already uses for a small exclusive choice (#hatchDepth, #comboKind).
let partnerMode = 'any';
const partnerModeEl = document.getElementById('partnerMode');
const PARTNER_WHY = {
  any: 'Routes through any species, whether or not you can get one.',
  wild: 'Routes only through species you own or could go and catch.',
  mine: 'Routes only through pals you already own.',
};
function setPartnerMode(m, silent) {
  partnerMode = m;
  partnerModeEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.m === m;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  // The line named all three options in every state, so it described the
  // control rather than the choice — the same defect the save reader's conflict
  // segrow had, and DESIGN.md 4 settles it the same way.
  document.getElementById('partnerHint').textContent = PARTNER_WHY[m] || PARTNER_WHY.any;
  if (!silent) { save(); scheduleAuto(); }
}
partnerModeEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPartnerMode(b.dataset.m); });
// "my level", optional and empty by default. It never gates anything — the app
// doesn't know your gear or sphere tier, and Palworld has no level gate on
// capture — so all it does is turn a level band into a gap you can read, and
// tip the ordering among partners that were already interchangeable.
let myLevel = 0;
const myLevelEl = document.getElementById('myLevel');
myLevelEl.addEventListener('input', () => {
  const v = Math.floor(+myLevelEl.value);
  myLevel = myLevelEl.value.trim() && v >= 1 && v <= 99 ? v : 0;
  save();
  accDecorate(document, true);
  scheduleAuto();
});
let avoidCollab = false;
const collabToggle = document.getElementById('collabToggle');
collabToggle.addEventListener('click', () => { avoidCollab = !avoidCollab; setSwitch(collabToggle, avoidCollab); save(); scheduleAuto(); });

function ownedSpeciesSet() {
  const s = new Set(owned);
  for (const r of roster) s.add(r.k);
  return s;
}
// ---------- how gettable is a species, really ----------
// The partner sort used to break ties on `rar`. Rarity was a stand-in written
// before the app had spawn data: it says how special a pal is, not whether you
// could go and find one. These tiers answer the question the sort was actually
// asking, out of the same first-party spawn table the Map tab reads.
//
// EFFORT, NOT PERMISSION. Palworld has no level gate on capture — catch rate
// falls with target level and rises with sphere tier, and a determined player
// takes things well above their own. So nothing below ever removes a candidate
// from the pool; it orders them, and says out loud why. The one place a
// species does drop out is the 'wild' pool, and that test is factual (has a
// spawner or an alpha, or doesn't), never a judgement about difficulty.
const ACC_LABEL = {
  easy:  'Easy catch',
  mid:   'Some effort',
  hard:  'Hard catch',
  grind: 'A grind',
  alpha: 'Alpha only',
  none:  'Not catchable',
};
// Score bands. Four named steps rather than a continuous number, for the same
// reason the map buckets its spawn shading: a reader can name a tier and check
// it against the stated reason, but can't name a 0.37.
const ACC_BANDS = [['easy', 0.25], ['mid', 0.45], ['hard', 0.65], ['grind', Infinity]];
// Weights, and why each. Level dominates: it is the one input that moves catch
// rate at every sphere tier. Encounter share and area count decide how long you
// stand there once you have arrived. Distance to a statue is a one-off travel
// cost, so it counts least. Night- and dungeon-only are conditions on when you
// can go at all, so they add on top rather than blend in.
const ACC_W_LEVEL = 0.42, ACC_W_SHARE = 0.24, ACC_W_SPOTS = 0.20, ACC_W_DIST = 0.14;
const ACC_NIGHT_PEN = 0.10, ACC_DUNGEON_PEN = 0.14;
// Anchors read off the real distribution over the 272 species that have spawn
// areas: share runs 1.4%–100% (median 24%), areas 1–5327 (median 88), nearest
// statue 4 m–628 m (median 22 m). Each pair is "no worse than this" -> "as bad
// as it gets"; everything between is logarithmic, because the difference
// between 4 and 40 areas matters and the one between 400 and 4000 doesn't.
const ACC_SHARE_HI = 0.5, ACC_SHARE_LO = 0.02;
const ACC_SPOTS_HI = 120, ACC_SPOTS_LO = 4;
const ACC_DIST_NEAR = 40, ACC_DIST_FAR = 300;
// A statue this far from the nearest area is worth saying out loud — the top
// ~2% of species, the ones stranded on an outlying island or deep in the volcano.
const ACC_DIST_CALLOUT = 150;
const ACC_MAX_LEVEL = 80;
// alphas aren't scored on the wild scale — one fixed fight on a respawn timer
// is a different shape of effort — but they still need a place in the order,
// above every wild spawn and below "no way to catch one at all".
const ACC_ALPHA_BASE = 0.62, ACC_ALPHA_LEVEL = 0.30;

const accClamp = x => x < 0 ? 0 : x > 1 ? 1 : x;
// log-scaled 0 (at `zero`) to 1 (at `one`), in either direction
const accLog = (v, zero, one) =>
  accClamp((Math.log10(zero) - Math.log10(Math.max(v, 1e-6))) / (Math.log10(zero) - Math.log10(one)));

let accIndex = null;      // palKey -> record, built once, the first time it's wanted
let accPending = false;   // a spawn-table load the Planner is waiting on
let accFailed = false;    // ...that never arrived, so stop asking and say so
// Progressive enhancement, and a TDZ guard in one. The first statement is a
// plain window property read on purpose: computeRoute() runs during boot to
// restore a saved route, and every spawn helper this needs is a `const` arrow
// declared ~1700 lines further down — naming one before its definition
// evaluates is a ReferenceError, not an undefined, and this project has been
// bitten by exactly that. Only mapLoadSpawns() ever sets window.SPAWNDATA, and
// nothing calls it until boot has finished, so when it is absent we return
// before touching a single one of them. Callers all fall back to today's sort.
function accessTable() {
  if (!window.SPAWNDATA || !window.MAPDATA) return null;
  if (accIndex) return accIndex;
  // How far is the nearest fast-travel statue from each spawner group? Done
  // once per group rather than per species: 265 groups against 152 statues,
  // where the same answer per species would redo the work 272 times.
  const near = new Float64Array(SPAWN.groups.length).fill(Infinity);
  for (const layer of Object.keys(MAP.layers)) {
    const runs = spawnRuns[layer];
    if (!runs) continue;
    const m = mPerPx(layer);
    const statues = MAP.markers.filter(f => f.type === 'fastTravel' && f.layer === layer);
    if (!statues.length) continue;
    for (const [gi, run] of runs) {
      let best = Infinity;
      for (let i = 1; i < run.length; i += 2) {
        for (const f of statues) {
          const d = Math.hypot(run[i] - f.map.x, run[i + 1] - f.map.y);
          if (d < best) best = d;
        }
      }
      if (best * m < near[gi]) near[gi] = best * m;
    }
  }
  accIndex = new Map();
  for (const p of PALS) {
    // mapSpawnSummary() already folds level band, area count and the night /
    // dungeon-only flags out of the same entries — reuse it rather than
    // inventing a second answer to a question the Map tab already answers.
    const sum = mapSpawnSummary(p.k);
    if (!sum) {
      const alphas = MAP_ALPHAS.get(p.k);
      if (!alphas) { accIndex.set(p.k, {tier: 'none', score: 1}); continue; }
      const lv = Math.max(...alphas.map(a => a.level || 0));
      accIndex.set(p.k, {tier: 'alpha', score: ACC_ALPHA_BASE + ACC_ALPHA_LEVEL * accClamp(lv / ACC_MAX_LEVEL),
        lo: lv, hi: lv, alphas: alphas.length});
      continue;
    }
    let dist = Infinity;
    for (const e of spawnEntries(p.k)) if (near[e.gi] < dist) dist = near[e.gi];
    // the lowest band, not the average: you can go to the easiest area it has
    let score = ACC_W_LEVEL * accClamp(sum.lo / ACC_MAX_LEVEL)
      + ACC_W_SHARE * accLog(sum.shareHi, ACC_SHARE_HI, ACC_SHARE_LO)
      + ACC_W_SPOTS * accLog(sum.spots, ACC_SPOTS_HI, ACC_SPOTS_LO)
      + ACC_W_DIST * accClamp((dist - ACC_DIST_NEAR) / (ACC_DIST_FAR - ACC_DIST_NEAR));
    if (sum.night) score += ACC_NIGHT_PEN;
    if (sum.dungeonOnly) score += ACC_DUNGEON_PEN;
    score = accClamp(score);
    accIndex.set(p.k, {tier: ACC_BANDS.find(b => score < b[1])[0], score,
      lo: sum.lo, hi: sum.hi, spots: sum.spots, share: sum.shareHi,
      night: sum.night, dungeon: sum.dungeonOnly, far: isFinite(dist) && dist > ACC_DIST_CALLOUT});
  }
  return accIndex;
}
// The stated reason behind the tier name — the facts it was computed from, in
// the order a player would want them. Share and distance only appear when they
// are the thing that hurts, so a common pal reads "Lv 1–5 · 350 areas" rather
// than a row of numbers that all say "fine".
function accReason(a) {
  if (!a) return '';
  if (a.tier === 'none') return 'no wild spawner anywhere — breed or win it from a raid';
  const parts = [];
  const band = a.lo === a.hi ? 'Lv ' + a.lo : `Lv ${a.lo}–${a.hi}`;
  // with no level on file the band is the whole honest statement; guessing at
  // difficulty from it would be inventing a player the app has never met
  parts.push(myLevel && a.lo > myLevel ? `${band} — ${a.lo - myLevel} above you`
    : myLevel ? `${band} — at or below you` : band);
  if (a.tier === 'alpha') {
    parts.push(a.alphas === 1 ? 'one field alpha, no wild areas' : `${a.alphas} field alphas, no wild areas`);
    return parts.join(' · ');
  }
  if (a.night) parts.push('night only');
  if (a.dungeon) parts.push('dungeons only');
  parts.push(a.spots === 1 ? '1 area' : a.spots + ' areas');
  if (a.share < 0.1) parts.push((a.share * 100).toFixed(1) + '% of that spawn table');
  if (a.far) parts.push('far from any statue');
  return parts.join(' · ');
}
function partnerPool() {
  const own = ownedSpeciesSet();
  if (partnerMode === 'mine') return [...own];
  const acc = accessTable();
  let keys = PALS.map(p => p.k);
  if (partnerMode === 'wild' && acc) {
    // Factual, not a judgement: a species qualifies if it has any wild spawn
    // area or a field alpha. That drops exactly the 17 pals with neither — six
    // sub-species, ten raid / tower / legendary bosses, and Eye of Cthulhu.
    // No level, share or distance enters this test; a Lv 80 filler spawn at
    // 1.4% still counts, because a determined player can go and get it.
    keys = keys.filter(k => own.has(k) || acc.get(k)?.tier !== 'none');
  }
  // collab-exclusive species aren't catchable in every game version — when
  // asked, only use them as partners if the player already owns them. Separate
  // question from catchability: 10 of the 11 do have wild spawns.
  if (avoidCollab) keys = keys.filter(k => !byKey.get(k).cb || own.has(k));
  // Owned species first, then non-collab, then whichever the player could most
  // realistically go and get, so equal-length routes prefer the cheaper one.
  // With no spawn table loaded `acc` is null and this collapses to exactly the
  // rarity ordering it has always used — same routes, same length, older taste.
  return keys.sort((a, b) => {
    const A = byKey.get(a), B = byKey.get(b);
    return (own.has(b) ? 1 : 0) - (own.has(a) ? 1 : 0)
      || (A.cb ? 1 : 0) - (B.cb ? 1 : 0)
      || (acc ? (acc.get(a)?.score ?? 1) - (acc.get(b)?.score ?? 1) : 0)
      || A.rar - B.rar
      || A.z - B.z;
  });
}
// species a route uses as parents that the player neither owns, breeds
// mid-chain, nor supplied as a starter — i.e. the catch list
function neededSpecies(steps, extraHave = []) {
  const have = ownedSpeciesSet();
  for (const k of extraHave) have.add(k);
  const bred = new Set(steps.map(s => s.cK));
  const need = [];
  for (const s of steps) for (const k of [s.aK, s.bK])
    if (!bred.has(k) && !have.has(k) && !need.includes(k)) need.push(k);
  return need;
}
function neededRow(need) {
  const nr = document.createElement('div'); nr.className = 'needrow';
  nr.append('You’ll still need: ');
  for (const k of need) {
    const p = byKey.get(k);
    const c = document.createElement('button'); c.type = 'button'; c.className = 'tchip';
    c.dataset.acc = k;
    c.appendChild(icon(p, 22));
    const nm = document.createElement('span'); nm.textContent = p.n; c.appendChild(nm);
    c.title = 'Not owned yet — view ' + p.n + '’s card';
    c.addEventListener('click', () => openModal(p));
    nr.appendChild(c);
  }
  accDecorate(nr);
  return nr;
}
// Name the tier on the chips for the species you actually have to go and get.
// A rank the reader can't see is a rank they can't trust, so the badge carries
// the name and the line beside it carries the facts it was computed from.
//
// Progressive enhancement both ways: with no spawn table there is nothing
// honest to say and the chip stays exactly as it was, and when the table lands
// later — the Map tab, or any "where do I catch one" panel — this runs again
// and fills in every chip still missing one. `force` re-does chips that
// already have a badge, for when "my level" changes what the reason says.
function accDecorate(root = document, force) {
  const acc = accessTable();
  if (!acc) return;
  for (const c of root.querySelectorAll('.tchip[data-acc]')) {
    const had = c.querySelector('.accb');
    if (had && !force) continue;
    if (had) c.querySelectorAll('.accb,.accr').forEach(n => n.remove());
    const a = acc.get(c.dataset.acc), p = byKey.get(c.dataset.acc);
    if (!a || !p) continue;
    const why = accReason(a);
    const b = document.createElement('span'); b.className = 'accb ' + a.tier; b.textContent = ACC_LABEL[a.tier];
    const r = document.createElement('span'); r.className = 'accr'; r.textContent = why;
    c.append(b, r);
    c.title = `${ACC_LABEL[a.tier]} — ${why}. Not owned yet — view ${p.n}’s card`;
  }
}
// BFS from startK to targetK over "current × partner -> child" edges
function findRoute(startK, targetK, pool) {
  if (startK === targetK) return [];
  const prev = new Map([[startK, null]]);
  let frontier = [startK];
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      const curP = byKey.get(cur);
      for (const pk of pool) {
        if (pk === cur) continue;
        const res = breed(curP, byKey.get(pk));
        for (const c of res.children) {
          const ck = c.pal.k;
          if (prev.has(ck)) continue;
          prev.set(ck, {from: cur, partner: pk, kind: res.kind, ga: c.ga, gb: c.gb, pa: c.pa, pb: c.pb});
          if (ck === targetK) {
            const steps = [];
            let at = targetK;
            while (at !== startK) {
              const e = prev.get(at);
              steps.unshift({aK: e.from, bK: e.partner, cK: at, kind: e.kind, ga: e.ga, gb: e.gb, pa: e.pa, pb: e.pb});
              at = e.from;
            }
            return steps;
          }
          next.push(ck);
        }
      }
    }
    frontier = next;
  }
  return null;
}
let currentRoute = null; // {steps, target, passives}
const stepOf = (aK, bK, child, kind) => ({aK, bK, cK: child.pal.k, kind, ga: child.ga, gb: child.gb, pa: child.pa, pb: child.pb});
// all orders for sequential merging: unordered first pair, then each order of the rest
function mergeSequences(arr) {
  if (arr.length === 2) return [arr];
  const seqs = [];
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const rest = arr.filter((_, x) => x !== i && x !== j);
    const perms = rest.length <= 1 ? [rest] : [[rest[0], rest[1]], [rest[1], rest[0]]];
    for (const pr of perms) seqs.push([arr[i], arr[j], ...pr]);
  }
  return seqs;
}
// breed two species keys, returning every possible outcome as {steps, k}
function pairOutcomes(aK, bK, prefixSteps) {
  const r = breed(byKey.get(aK), byKey.get(bK));
  return r.children.map(c => ({steps: [...prefixSteps, stepOf(aK, bK, c, r.kind)], k: c.pal.k}));
}
function computeRoute() {
  // consumed on entry, not at the tail: this function has two early returns (no
  // inputs, and the async spawn-table fetch), and a flag surviving one of those
  // stole focus from the *next* route — one the user asked for themselves
  const landOnArrival = focusRouteOnArrival;
  focusRouteOnArrival = false;
  const out = document.getElementById('routeOut');
  // "somewhere real" has to include every outcome, not just a route: this
  // function renders a hint and returns at three points before the tail, and a
  // hand-off that hit one of them landed nowhere
  const landNow = () => {
    if (!landOnArrival) return;
    const el = out.querySelector('.rsummary') || out.querySelector('.hint');
    if (el) { el.tabIndex = -1; el.focus({preventScroll: true}); }
  };
  const t = pickPT.get();
  const starters = [];
  for (const n of SLOTS) { const p = pickS[n].get(); if (p) starters.push({k: p.k, ps: slotPassives[n], g: slotGenders[n]}); }
  if (!starters.length || !t) { out.innerHTML = ROUTE_HINT; setPlanStatus(ROUTE_HINT_TEXT); return; }
  // "In the wild" is the one route option that needs the 124 KB spawn table,
  // and choosing it is a deliberate act — so it pays for the load here, in
  // front of the user, rather than every planner visit paying for it silently.
  // The other two states never reach this and never fetch it.
  if (partnerMode === 'wild' && !window.SPAWNDATA && !accFailed) {
    out.innerHTML = '';
    const h = document.createElement('div'); h.className = 'hint';
    h.setAttribute('aria-live', 'polite');
    h.textContent = 'Looking up which species you could catch…';
    out.appendChild(h);
    if (!accPending) {
      accPending = true;
      mapLoadSpawns()
        .then(() => { accPending = false; computeRoute(); })
        // a failed load must not cost the reader a route: fall through to the
        // full pool, and say so on the result rather than pretending
        .catch(() => { accPending = false; accFailed = true; computeRoute(); });
    }
    // this branch renders a "loading" line and re-enters once the fetch lands —
    // hand the pending focus to that call rather than spending it on the spinner
    focusRouteOnArrival = landOnArrival;
    return;
  }
  const pool = partnerPool();
  if (partnerMode === 'mine' && pool.length < 2) { out.innerHTML = '<div class="hint">Your owned pool is too small — star more species or switch chain partners off "Only mine".</div>'; landNow(); return; }
  const carried = starterUnion();
  const desired = desiredPick.get();
  // NOT the uncapped union: a pal has four passive slots, so carrying eight is a
  // pal the game cannot produce — and passiveOdds returns 0 for D>4, so the view
  // used to make the impossible claim AND silently drop the number that
  // contradicts it. Over the cap with nothing picked, the route still computes
  // in full; only the passive claim withdraws (DESIGN.md §4).
  const goal = carryGoal();
  const overCap = !desired.length && carried.length > 4;
  const missing = desired.filter(x => !carried.includes(x));
  let best = null;
  const consider = (steps, fromK) => {
    const rest = findRoute(fromK, t.k, pool);
    if (rest !== null && (!best || steps.length + rest.length < best.length)) best = [...steps, ...rest];
  };
  if (starters.length === 1) {
    consider([], starters[0].k);
  } else {
    // sequential merges: ((A×B)×C)×D in every order
    for (const seq of mergeSequences(starters)) {
      let outcomes = [{steps: [], k: seq[0].k}];
      for (let i = 1; i < seq.length; i++) {
        outcomes = outcomes.flatMap(o => pairOutcomes(o.k, seq[i].k, o.steps));
      }
      for (const o of outcomes) consider(o.steps, o.k);
    }
    // balanced merge for 4 starters: (A×B) × (C×D) over all pairings
    if (starters.length === 4) {
      for (const [[a, b], [c, d]] of [[[0,1],[2,3]], [[0,2],[1,3]], [[0,3],[1,2]]]) {
        for (const o1 of pairOutcomes(starters[a].k, starters[b].k, []))
          for (const o2 of pairOutcomes(starters[c].k, starters[d].k, []))
            for (const o3 of pairOutcomes(o1.k, o2.k, [...o1.steps, ...o2.steps]))
              consider(o3.steps, o3.k);
      }
    }
  }
  currentRoute = best === null ? null : {steps: best, tK: t.k, passives: goal};
  if (best !== null) { localStorage.setItem('palbreed_planned', '1'); updateChecklist(); }
  const wo = best ? walkOdds(best, starters, goal) : null;
  // what the route ACTUALLY delivers, not what was asked for. Asking for Legend
  // when nothing on the route holds it used to announce "carrying Legend" in the
  // live region while the warnbox directly below said nothing carries it.
  const truly = wo ? goal.filter(x => wo.carry.includes(x)) : goal;
  renderRoute(out, best, t, truly, {
    stepOdds: wo ? wo.odds : null,
    starterKs: starters.map(s => s.k),
    overCap: overCap ? carried.length : 0,
  });
  // say it plainly when the wild filter couldn't be applied — the toggle still
  // reads "In the wild", and a route that quietly ignored it would be a lie
  if (partnerMode === 'wild' && accFailed) {
    out.prepend(warnBox('The spawn data didn’t load, so this route used every species as a partner — it may route through pals you can’t catch anywhere. Reload the page to try again.'));
  }
  // warn when desired passives are covered by neither a starter nor a roster partner on the route
  const uncovered = best && best.length && wo ? desired.filter(x => !wo.carry.includes(x)) : missing;
  if (uncovered.length) {
    // With no route there is no "this route" and no "odds below" — the same
    // sentence pointed at content that isn't on the page.
    const them = uncovered.length === 1 ? 'it' : 'them';
    out.prepend(warnBox(best && best.length
      ? `Nothing on this route carries ${uncovered.join(', ')}. Add a starter or roster pal that has ${them}, or catch a carrier mid-chain. Odds below track only what the route carries.`
      : `Nothing you own carries ${uncovered.join(', ')}. Add a starter or roster pal that has ${them}, or catch a carrier mid-chain.`));
  }
  // warn when a merge step pairs two recorded same-gender starters
  if (best && starters.length > 1) {
    const gmap = new Map();
    for (const s of starters) if (s.g) gmap.set(s.k, [...(gmap.get(s.k) || []), s.g]);
    const starterKs = new Set(starters.map(s => s.k));
    const warned = new Set();
    for (const st of best) {
      if (!starterKs.has(st.aK) || !starterKs.has(st.bK) || st.aK === st.bK) continue;
      const ga = gmap.get(st.aK), gb = gmap.get(st.bK);
      const key = pairKey(st.aK, st.bK);
      if (ga && gb && ga.length === 1 && gb.length === 1 && ga[0] === gb[0] && !warned.has(key)) {
        warned.add(key);
        const sym = ga[0] === 'M' ? '♂' : '♀';
        out.prepend(warnBox(genderize(`Your ${byKey.get(st.aK).n} and ${byKey.get(st.bK).n} are both recorded as ${sym} — a breeding pair needs one ♂ and one ♀. You'll need an opposite-gender ${byKey.get(st.aK).n} or ${byKey.get(st.bK).n} (catch or hatch one) before this merge step.`)));
      }
    }
  }
  // Only scroll to the route when the user isn't inside the form that produced
  // it. This fires on every recompute, so with the carry chips in section 1 it
  // measured 834px of travel leaving the focused chip 467px above the viewport
  // (2.4.11). landOnArrival must stay in the condition — the "Plan this route"
  // hand-off does focus a form control and does want the scroll.
  if (landOnArrival || !document.getElementById('planNewBlock').contains(document.activeElement)) {
    out.scrollIntoView({block: 'nearest', behavior: SMOOTH});
  }
  // land inside the region that scroll just revealed — .hint when there is no
  // route, which is the sentence explaining why
  landNow();
  save();
}

// A merge step, and every step of a hatchery chain, can name a partner that an
// earlier step already hatches — so catching one wild may make that step, and
// whatever fed it, unnecessary. Work out which: a step is needed only while its
// child still feeds, directly or transitively, the pal the chain is for, so drop
// the one edge the catch replaces and keep whatever the last step can still
// reach. Anything the rest of the chain still consumes stays live, which is what
// stops this claiming a skip that isn't there.
function chainSkips(chain, s) {
  const n = chain ? chain.length : 0;
  const at = n ? chain.indexOf(s) : -1;
  if (at < 1) return {bredAt: -1, skips: []};
  const producer = (k, before) => {
    for (let i = before - 1; i >= 0; i--) if (chain[i].cK === k) return i;
    return -1;
  };
  const bredAt = producer(s.bK, at);
  if (bredAt < 0) return {bredAt: -1, skips: []};
  const parents = chain.map((x, j) => [producer(x.aK, j), producer(x.bK, j)]);
  parents[at][1] = -1;
  const live = new Set();
  const walk = j => {
    if (live.has(j)) return;
    live.add(j);
    for (const p of parents[j]) if (p >= 0) walk(p);
  };
  walk(n - 1);
  const skips = [];
  for (let i = 0; i < n; i++) if (!live.has(i)) skips.push(i);
  return {bredAt, skips};
}
let wildSeq = 0;   // ids for aria-controls on the "where do I catch one" panels
function stepEl(s, opts = {}) {
  const row = document.createElement('div'); row.className = 'rstep';
  if (opts.stepNo != null) { const no = document.createElement('span'); no.className = 'stepno'; no.textContent = opts.stepNo; row.appendChild(no); }
  const own = ownedSpeciesSet();
  const gsym = g => g === 'Male' ? '♂' : g === 'Female' ? '♀' : '';
  const unit = (k, g, isPartner) => {
    const u = document.createElement('span'); u.className = 'unit';
    const p = byKey.get(k);
    u.appendChild(icon(p, 34, true));
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.n; u.appendChild(nm);
    if (isPartner && own.has(k)) { const o = document.createElement('span'); o.className = 'own'; o.textContent = '★'; o.title = 'You own this species'; u.appendChild(o); }
    if (g) { const gg = gEl(gsym(g)); gg.title = 'Required gender'; u.appendChild(gg); }
    return u;
  };
  // orient gender info: pa/pb tell which species needs which gender
  let ga = null, gb = null;
  if (s.kind === 'gender' && s.pa) { ga = s.pa === s.aK ? s.ga : s.gb; gb = s.pb === s.bK ? s.gb : s.ga; }
  row.appendChild(unit(s.aK, ga, false));
  // NVDA reads a bare U+00D7 as "times" and U+2192 as "right arrow", which turns
  // a breeding step into arithmetic (DESIGN.md §4)
  const x = document.createElement('span'); x.className = 'sym';
  x.setAttribute('aria-hidden', 'true'); x.textContent = '×'; row.appendChild(x);
  const and = document.createElement('span'); and.className = 'sr-only'; and.textContent = 'and'; row.appendChild(and);
  row.appendChild(unit(s.bK, gb, true));
  const arr = document.createElement('span'); arr.className = 'arr2';
  arr.setAttribute('aria-hidden', 'true'); arr.textContent = '→'; row.appendChild(arr);
  const makes = document.createElement('span'); makes.className = 'sr-only'; makes.textContent = 'make'; row.appendChild(makes);
  row.appendChild(unit(s.cK, null, false));
  if (s.kind && s.kind !== 'avg') {
    const bd = document.createElement('span');
    bd.className = 'badge ' + (s.kind === 'same' ? 'same' : s.kind === 'gender' ? 'gender' : 'unique');
    bd.textContent = s.kind === 'same' ? 'Same species' : s.kind === 'gender' ? 'Gender combo' : 'Unique combo';
    row.appendChild(bd);
  }
  if (opts.carrier) { const c = document.createElement('span'); c.className = 'carrier'; c.textContent = 'passive carrier line'; row.appendChild(c); }
  if (opts.odds) {
    // a button, not a tooltip-only span: touch users have no hover
    const o = document.createElement('button'); o.type = 'button'; o.className = 'odds';
    o.append(lucide('percent', 13), `≈${Math.max(1, Math.round(opts.odds.p * 100))}%/egg`);
    const expl = `≈${Math.round(opts.odds.p * 100)}% per egg to inherit all ${opts.odds.keep} tracked passive${opts.odds.keep === 1 ? '' : 's'} (pool of ${opts.odds.pool}). Expect ≈${Math.max(1, Math.round(1 / opts.odds.p))} egg${Math.max(1, Math.round(1 / opts.odds.p)) === 1 ? '' : 's'}. ${opts.odds.rp ? 'Partner passives from your roster are included.' : 'Assumes a passive-free partner.'} Assumes a regular Cake — a Special Cake improves the odds. Community-measured.`;
    o.title = expl;
    o.setAttribute('aria-expanded', 'false');
    o.addEventListener('click', () => {
      const info = row.querySelector('.oddsinfo');
      if (info) { info.remove(); o.setAttribute('aria-expanded', 'false'); return; }
      const s = document.createElement('span'); s.className = 'oddsinfo'; s.textContent = expl;
      row.appendChild(s); o.setAttribute('aria-expanded', 'true');
    });
    row.appendChild(o);
  }
  // The partner column is the pal you have to go and *get*, and when it has no
  // ★ the route used to stop at "you don't own one". The map data already knows
  // where that species lives, so answer it here instead of sending the reader
  // to the Map tab and losing the route they were reading.
  //
  // window.MAPDATA rather than MAP: renderPlans() runs at boot and calls this,
  // and `const MAP` is declared ~800 lines further down — reading MAP here
  // would be a TDZ ReferenceError, not a null. Every other map helper is
  // touched only inside the click handler, which cannot fire before boot ends.
  if (window.MAPDATA && !own.has(s.bK)) {
    const pb = byKey.get(s.bK);
    const boxId = 'wild-' + (++wildSeq);
    const {bredAt, skips} = chainSkips(opts.chain, s);
    const w = document.createElement('button'); w.type = 'button'; w.className = 'odds wild';
    w.append(lucide('mapPin', 13), 'Where?');
    w.title = 'Where to catch a ' + pb.n;
    w.setAttribute('aria-label', 'Where to catch a ' + pb.n);
    w.setAttribute('aria-expanded', 'false');
    // the panel is appended at the end of the row, after the ↗ button, so name
    // it explicitly rather than relying on it following the trigger in the DOM
    w.setAttribute('aria-controls', boxId);
    w.addEventListener('click', () => {
      const shown = row.querySelector('.wildinfo');
      if (shown) { shown.remove(); w.setAttribute('aria-expanded', 'false'); return; }
      const box = document.createElement('div'); box.className = 'wildinfo';
      box.id = boxId;
      // the answer arrives a moment after the click, once the spawn table has
      // loaded — announce the swap rather than leaving a reader on "Looking up…"
      box.setAttribute('aria-live', 'polite');
      box.textContent = 'Looking up where ' + pb.n + ' spawns…';
      row.appendChild(box);
      w.setAttribute('aria-expanded', 'true');
      // 124 KB of spawn areas the planner deliberately doesn't ship with: the
      // first expand anywhere pays for it, and mapLoadSpawns() is idempotent,
      // so the Map tab and every other row share that one load.
      mapLoadSpawns()
        .then(() => {
          if (box.isConnected) wildInfo(box, pb, bredAt, skips);
          // the table is here now, so every catch-list chip on the page can
          // finally say how gettable its species is
          accDecorate();
        })
        .catch(() => {
          if (box.isConnected) box.textContent = 'Spawn data didn’t load — check your connection, then try again.';
        });
    });
    row.appendChild(w);
  }
  if (opts.onOpen) {
    const ob = document.createElement('button'); ob.className = 'stepopen'; ob.type = 'button'; ob.textContent = '↗';
    ob.title = 'Open this pairing in the Breed tab with the full chain';
    ob.setAttribute('aria-label', 'Open this pairing in the Breed tab with the full chain');
    ob.addEventListener('click', opts.onOpen);
    row.appendChild(ob);
  }
  return row;
}

// Fills the "where do I catch one" panel. Only ever reached from the click
// handler above, after mapLoadSpawns() has resolved — so the const-bound map
// helpers it reaches for (MAP_ALPHAS, spawnEntries, mPerPx, mapDist…) are all
// long past their definitions by the time any of this runs.
function wildInfo(box, p, bredAt = -1, skips = []) {
  box.textContent = '';
  const line = cls => {
    const d = document.createElement('div'); d.className = 'wline' + (cls ? ' ' + cls : '');
    box.appendChild(d); return d;
  };
  const mapLink = (label, hash) => {
    const a = document.createElement('a'); a.className = 'wlink'; a.href = hash; a.textContent = label;
    box.appendChild(a);
  };
  if (bredAt >= 0) {
    // Only name the steps a catch actually removes. Where the hatched one is
    // consumed elsewhere in the chain too, nothing drops out and the honest
    // claim is the weaker one.
    const ns = skips.map(i => i + 1);
    const list = ns.length === 1 ? 'step ' + ns[0]
      : 'steps ' + ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1];
    line('wnote').textContent = ns.length
      ? `Step ${bredAt + 1} hatches one — catching a wild ${p.n} instead skips ${list}.`
      : `Step ${bredAt + 1} already hatches one, and the rest of the chain still needs it — a wild ${p.n} saves the hatch, not the step.`;
  }
  // The same named tier the partner sort ranked this species by, shown on the
  // panel that lists the facts behind it — so a reader can check one against
  // the other instead of taking the ordering on faith.
  const tierBadge = () => {
    const a = accessTable()?.get(p.k);
    if (!a) return null;
    const s = document.createElement('span'); s.className = 'accb ' + a.tier;
    s.textContent = ACC_LABEL[a.tier];
    return s;
  };
  const sum = mapSpawnSummary(p.k);
  if (!sum) {
    // the same three honest outcomes the Map tab already distinguishes
    const alpha = MAP_ALPHAS.get(p.k);
    const l = line();
    if (!alpha) {
      l.textContent = `${p.n} can’t be caught in the wild — it has no spawner anywhere in the world. ` +
        'The only ways to get one are to breed it or win it from a raid.';
      l.prepend(tierBadge() || '');
      return;
    }
    const a = alpha[0];
    const near = mapNearest(a, 'fastTravel', 1)[0];
    l.textContent = `No wild spawn areas. The only ${p.n} in the world is the` +
      (a.level ? ` Lv ${a.level}` : '') + ` alpha on ${LAYER_NAME[a.layer] || 'the map'}` +
      (near ? `, nearest statue ${mapTitle(near.f)}` : '') +
      '. Beat it and catch it there.';
    l.prepend(tierBadge() || '');
    mapLink('Show the alpha on the map ↗', '#/map/' + encodeURIComponent(a.id));
    return;
  }
  const head = line();
  const b = document.createElement('b');
  b.textContent = sum.lo === sum.hi ? 'Lv ' + sum.lo : `Lv ${sum.lo}–${sum.hi}`;
  const cnt = document.createElement('span');
  cnt.textContent = `${sum.spots} spawn area${sum.spots === 1 ? '' : 's'}`;
  head.append(tierBadge() || '', b, cnt);
  // a band only becomes a gap once there's a level to measure it against; with
  // none on file, saying anything about difficulty would be inventing a player
  if (myLevel) {
    const g = document.createElement('span');
    g.textContent = sum.lo > myLevel ? `${sum.lo - myLevel} above you` : 'at or below your level';
    head.insertBefore(g, cnt);
  }
  if (sum.night) { const t = document.createElement('span'); t.className = 'wtag'; t.append(lucide('moon', 13), 'Night only'); head.appendChild(t); }
  if (sum.dungeonOnly) { const t = document.createElement('span'); t.className = 'wtag'; t.textContent = 'Dungeons only'; head.appendChild(t); }

  // Reuse the Map's statue ranking — areas within 1.2 km, not raw distance —
  // rather than inventing a second answer to the same question. Layer is
  // picked from where the species actually lives, preferring the main island,
  // so the panel reads the same whatever layer the Map tab was left on.
  const layers = spawnLayersFor(p.k);
  const layer = layers.includes('MainMap') ? 'MainMap' : layers[0];
  const hubs = layer ? mapSpawnHubs(p.k, layer, 3) : [];
  if (hubs.length) {
    const l = line('whubs');
    const lb = document.createElement('span'); lb.className = 'wlb'; lb.textContent = 'Best fast travel';
    l.appendChild(lb);
    const m = mPerPx(layer);
    hubs.forEach((h, i) => {
      const c = document.createElement('span'); c.className = 'whub';
      const n = document.createElement('span'); n.textContent = mapTitle(h.f);
      const d = document.createElement('i'); d.textContent = hubLabel(h, i, m);
      c.title = hubTitle(h, i, m);
      c.append(n, d);
      l.appendChild(c);
    });
  }
  const other = layers.filter(x => x !== layer);
  if (layer && layer !== 'MainMap') line().textContent = `These areas are on ${LAYER_NAME[layer]}.`;
  else if (other.length) line().textContent = `Also spawns on ${LAYER_NAME[other[0]]}.`;
  mapLink('Show these areas on the map ↗', '#/map/spawn/' + p.k);
}
// binary-tree diagram of a route: merge branches join into the carrier line.
// hlIdx highlights that step's child (used by the Breed tab's chain view).
function routeTree(steps, hlIdx = -1) {
  const own = ownedSpeciesSet();
  const gsym = g => g === 'Male' ? '♂' : g === 'Female' ? '♀' : '';
  const chip = (k, g, cls) => {
    const p = byKey.get(k);
    const c = document.createElement('span'); c.className = 'tchip' + cls;
    c.appendChild(icon(p, 26, true));
    const nm = document.createElement('span'); nm.textContent = p.n; c.appendChild(nm);
    if (own.has(k) && !cls.includes('final')) { const o = document.createElement('span'); o.className = 'own'; o.textContent = '★'; c.appendChild(o); }
    if (g) c.appendChild(gEl(gsym(g)));
    return c;
  };
  const made = new Map(); // species key -> subtree already built for it
  const nodeFor = (k, g) => {
    if (made.has(k)) { const n = made.get(k); made.delete(k); return n; }
    return chip(k, g, '');
  };
  let root = null;
  steps.forEach((s, i) => {
    let ga = null, gb = null;
    if (s.kind === 'gender' && s.pa) { ga = s.pa === s.aK ? s.ga : s.gb; gb = s.pb === s.bK ? s.gb : s.ga; }
    const wrap = document.createElement('span'); wrap.className = 'tn';
    const par = document.createElement('span'); par.className = 'tn-parents';
    par.append(nodeFor(s.aK, ga), nodeFor(s.bK, gb));
    const join = document.createElement('span'); join.className = 'tn-join';
    const cls = (i === steps.length - 1 ? ' final' : '') + (i === hlIdx ? ' cur' : '');
    wrap.append(par, join, chip(s.cK, null, cls));
    made.set(s.cK, wrap);
    root = wrap;
  });
  const t = document.createElement('div'); t.className = 'tree'; t.appendChild(root);
  return t;
}
// interactive viewport: drag to pan; wheel, buttons or two-finger pinch to zoom
function treeViewport(treeEl) {
  const vp = document.createElement('div'); vp.className = 'tvp';
  const inner = document.createElement('div'); inner.className = 'tvp-inner';
  inner.appendChild(treeEl);
  vp.appendChild(inner);
  let scale = 1, tx = 0, ty = 0, fitScale = 1;
  const apply = () => { inner.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
  // centre the scaled tree in the viewport, or pin it left when it still overflows
  const fitX = () => Math.max(0, (vp.clientWidth - inner.offsetWidth * scale) / 2);
  const zoomAt = (cx, cy, factor) => {
    const ns = Math.min(3, Math.max(0.35, scale * factor));
    tx = cx - (cx - tx) * (ns / scale);
    ty = cy - (cy - ty) * (ns / scale);
    scale = ns; apply();
  };
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });
  // one pointer pans, two pinch-zoom around their midpoint
  const pts = new Map(); // pointerId -> viewport-relative position
  let drag = null, pinch = null;
  const rel = e => { const r = vp.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  const startGesture = () => {
    const ps = [...pts.values()];
    if (ps.length >= 2) {
      drag = null;
      pinch = {d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y),
               cx: (ps[0].x + ps[1].x) / 2, cy: (ps[0].y + ps[1].y) / 2};
    } else if (ps.length === 1) {
      pinch = null;
      drag = {x: ps[0].x - tx, y: ps[0].y - ty};
    } else { pinch = null; drag = null; }
  };
  vp.addEventListener('pointerdown', e => {
    if (e.target.closest('.tvp-ctrl') || e.target.classList.contains('click')) return;
    e.preventDefault(); // stop native text-selection / image-drag from hijacking the pan
    pts.set(e.pointerId, rel(e));
    vp.setPointerCapture(e.pointerId);
    vp.classList.add('grabbing');
    startGesture();
  });
  vp.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, rel(e));
    const ps = [...pts.values()];
    if (pinch && ps.length >= 2) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const cx = (ps[0].x + ps[1].x) / 2, cy = (ps[0].y + ps[1].y) / 2;
      if (pinch.d > 0 && d > 0) zoomAt(cx, cy, d / pinch.d);
      tx += cx - pinch.cx; ty += cy - pinch.cy; apply(); // midpoint drift pans too
      pinch = {d, cx, cy};
    } else if (drag) { tx = ps[0].x - drag.x; ty = ps[0].y - drag.y; apply(); }
  });
  const endDrag = e => {
    pts.delete(e.pointerId);
    if (!pts.size) vp.classList.remove('grabbing');
    startGesture(); // a remaining pointer seamlessly resumes as a pan
  };
  vp.addEventListener('pointerup', endDrag);
  vp.addEventListener('pointercancel', endDrag);
  const ctrl = document.createElement('div'); ctrl.className = 'tvp-ctrl';
  const mid = () => { const r = vp.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
  // Lucide, not the three text glyphs this used: the reset arrow was outside the
  // established symbol set (DESIGN.md §7) and left one stroke weight beside two
  // font glyphs in a three-button group.
  for (const [ic, label, fn] of [
    ['plus', 'Zoom in', () => zoomAt(...mid(), 1.25)],
    ['minus', 'Zoom out', () => zoomAt(...mid(), 1 / 1.25)],
    ['rotateCcw', 'Reset view', () => { scale = fitScale; tx = fitX(); ty = 0; apply(); }],
  ]) {
    const b = document.createElement('button'); b.type = 'button'; b.appendChild(lucide(ic, 16));
    b.title = label; b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    ctrl.appendChild(b);
  }
  vp.appendChild(ctrl);
  const hint = document.createElement('span'); hint.className = 'tvp-hint';
  hint.textContent = matchMedia('(pointer: coarse)').matches ? 'drag to pan · pinch to zoom' : 'drag to pan · scroll to zoom';
  vp.appendChild(hint);
  requestAnimationFrame(() => {
    // a 700px-wide chain in a 312px phone viewport used to open clipped, with no
    // sign the rest existed — open zoomed to fit instead, then let the user zoom in
    const w = vp.clientWidth;
    if (inner.offsetWidth > w) fitScale = Math.max(0.45, w / inner.offsetWidth);
    scale = fitScale;
    // +46px keeps the zoom controls and the drag hint in a clear strip below a
    // fitted tree instead of sitting on top of its right-hand chips
    vp.style.height = Math.min(Math.max(inner.offsetHeight * scale + 46, 160), 420) + 'px';
    tx = fitX(); apply();
  });
  return vp;
}
// probability the child inherits all D desired passives from a combined parent pool of P
// (community-measured inherit-count weights; approximate)
function comb(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }
function passiveOdds(P, D) {
  if (!P || !D || D > P || D > 4) return 0;
  const w = [0.4, 0.3, 0.2, 0.1];
  const kmax = Math.min(4, P);
  const tot = w.slice(0, kmax).reduce((a, b) => a + b, 0);
  let p = 0;
  for (let k = D; k <= kmax; k++) p += (w[k - 1] / tot) * comb(P - D, k - D) / comb(P, k);
  return p;
}
// per-step inheritance odds along a route: track which passives each bred line carries.
// Kept children are assumed to inherit exactly the goal-relevant passives. Chain partners
// are passive-free only when generic — if you own the species in your roster, we assume
// you'll use your best pal of it, and its recorded passives join the pool (they can
// dilute it, or contribute desired passives mid-chain).
function walkOdds(steps, starters, goal) {
  if (!goal.length) return {odds: steps.map(() => null), carry: []};
  const goalSet = new Set(goal);
  const lineage = new Map();
  for (const s of starters) {
    const prev = lineage.get(s.k) || [];
    lineage.set(s.k, [...new Set([...prev, ...s.ps])]);
  }
  const partnerPs = k => {
    const es = roster.filter(r => r.k === k);
    if (!es.length) return [];
    let best = null, bs = -Infinity;
    for (const e of es) {
      const hit = e.ps.filter(x => goalSet.has(x)).length;
      const score = hit * 10 - (e.ps.length - hit); // most goal passives, then least junk
      if (score > bs) { bs = score; best = e; }
    }
    return best.ps;
  };
  const odds = steps.map(st => {
    let rosterPartner = false;
    const side = k => {
      if (lineage.has(k)) return lineage.get(k);
      const ps = partnerPs(k);
      if (ps.length) rosterPartner = true;
      return ps;
    };
    const pa = side(st.aK), pb = side(st.bK);
    const pool = [...new Set([...pa, ...pb])];
    const keep = pool.filter(x => goalSet.has(x));
    lineage.set(st.cK, keep);
    if (!keep.length) return null;
    const p = passiveOdds(pool.length, keep.length);
    return p > 0 ? {p, pool: pool.length, keep: keep.length, rp: rosterPartner} : null;
  });
  const carry = steps.length ? lineage.get(steps[steps.length - 1].cK) || [] : [];
  return {odds, carry};
}
// The view's one sentence, in the markup and only ever updated in place.
function setPlanStatus(txt) {
  const el = document.getElementById('planStatus');
  if (el.textContent !== txt) el.textContent = txt;
}
function renderRoute(out, steps, target, carried, ropts = {}) {
  out.innerHTML = '';
  if (steps === null) {
    const h = document.createElement('div'); h.className = 'hint';
    const narrowed = partnerMode === 'mine' ? ' with only your pals'
      : partnerMode === 'wild' ? ' with only catchable partners' : '';
    setPlanStatus(h.textContent = (target.ic || uniqueChildren.has(target.k))
      ? `${target.n} can only come from its unique combo — no averaging chain reaches it${narrowed}. Check its pairs in Find parents.`
      : `No route found${partnerMode === 'mine' ? ' using only your pals — try switching chain partners to “In the wild” or “Any species”'
        : partnerMode === 'wild' ? ' using only catchable partners — try switching chain partners to “Any species”'
        : avoidCollab ? ' without collab partners — try turning off “No Terraria collab partners”' : ' within 8 steps'}.`);
    out.appendChild(h); return;
  }
  if (!steps.length) {
    const msg = `Your start pal already is ${target.n} — no breeding needed.`;
    // this branch returned without touching the live region, so it kept
    // announcing the PREVIOUS route's carry claim
    out.innerHTML = `<div class="hint">${msg}</div>`; setPlanStatus(msg); return;
  }
  const stepOdds = ropts.stepOdds || [];
  const sum = document.createElement('div'); sum.className = 'rsummary';
  const cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'} to ${target.n}`;
  // The clause after "carrying" is what the route delivers, is never longer than
  // four names, and is omitted when empty. Over the cap it states the choice
  // waiting instead — nothing is wrong, so this is not a warning (§6: never scold).
  setPlanStatus(cnt.textContent + (ropts.overCap
    ? `. Your starters hold ${ropts.overCap} passives — pick up to 4 to carry.`
    : carried.length ? ', carrying ' + carried.join(', ') + '.' : '.'));
  sum.appendChild(cnt);
  if (ropts.overCap) {
    const jump = document.createElement('button'); jump.className = 'alink'; jump.type = 'button';
    jump.textContent = 'Pick passives to carry';
    jump.addEventListener('click', () => {
      const row = document.getElementById('carryRow');
      row.scrollIntoView({block: 'center',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
      // land on a chip, not the input: a touch user gets their own passives with
      // no keyboard, and the combobox's focus-opens-listbox would cover the row
      // this press just revealed. After the scroll, never on a guessed timer.
      const chip = document.querySelector('#carryFrom .pset:not(:disabled)');
      (chip || document.querySelector('#carryPass .taginp')).focus({preventScroll: true});
    });
    sum.appendChild(jump);
  } else if (carried.length) {
    // one word for one fact: the old goal:/carrying: switch named the same thing
    // — the set the route will carry — twice (§6)
    const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = 'carrying:';
    sum.appendChild(sub); sum.appendChild(passiveChips(carried));
  }
  out.appendChild(sum);
  const need = neededSpecies(steps, ropts.starterKs || []);
  if (need.length) out.appendChild(neededRow(need));
  if (steps.length > 1) out.appendChild(treeViewport(routeTree(steps)));
  // the "passive carrier line" tag only means something when passives are tracked
  steps.forEach((s, i) => out.appendChild(stepEl(s, {stepNo: i + 1, chain: steps, carrier: carried.length > 0, odds: stepOdds[i], onOpen: () => openChainStep(steps, i)})));
  if (carried.length) {
    const n = document.createElement('div'); n.className = 'mathline';
    n.textContent = 'At each step, hatch until a child inherits your passives (and the right gender for the next pairing), then continue with that child.';
    out.appendChild(n);
    const withOdds = stepOdds.filter(Boolean);
    if (withOdds.length) {
      const eggs = withOdds.reduce((a, o) => a + 1 / o.p, 0);
      const agg = document.createElement('div'); agg.className = 'mathline';
      agg.append(itemIcon('egg', 16), `Expected eggs across the chain: ≈${Math.ceil(eggs)} to keep all tracked passives at every step (community-measured estimate).`);
      out.appendChild(agg);
    }
  }
  const saver = document.createElement('div'); saver.className = 'saverow';
  const nameInp = document.createElement('input'); nameInp.className = 'search-inp'; nameInp.style.width = '240px';
  nameInp.setAttribute('aria-label', 'Plan name');
  nameInp.value = `${target.n}${carried.length ? ' + ' + carried.join('/') : ''}`;
  const saveBtn = document.createElement('button'); saveBtn.className = 'alink primary'; saveBtn.textContent = 'Save plan';
  saveBtn.addEventListener('click', () => {
    if (!currentRoute) return;
    const sig = r => JSON.stringify([r.tK, r.steps.map(s => [s.aK, s.bK, s.cK])]);
    const dup = plans.find(p => sig(p) === sig(currentRoute));
    if (dup) { toast('This route is already saved as “' + dup.name + '”'); return; }
    const name = nameInp.value.trim() || target.n;
    plans.push({id: Date.now() + '', name, tK: currentRoute.tK,
      passives: currentRoute.passives, steps: currentRoute.steps, done: currentRoute.steps.map(() => false)});
    savePlans(); renderPlans();
    toast('Plan “' + name + '” saved', null, {label: 'View', fn: () => setPlanMode('saved')});
    saveBtn.textContent = 'Saved ✓'; setTimeout(() => saveBtn.textContent = 'Save plan', 1500);
  });
  const linkBtn = document.createElement('button'); linkBtn.className = 'alink'; linkBtn.textContent = 'Copy route link';
  linkBtn.title = 'Copy a shareable link to this route (starters + target — passives stay local)';
  linkBtn.addEventListener('click', async () => {
    const ph = planHash();
    if (!ph) return;
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0] + ph);
      toast('Route link copied — species only, passives stay local');
    } catch { toast('Copy failed — clipboard blocked by browser'); }
  });
  saver.append(nameInp, saveBtn, linkBtn);
  out.appendChild(saver);
}

// ---------- planner: saved plans ----------
// A plan is only renderable if every species it names still exists — checking
// the target alone let a plan whose steps referenced a since-renamed pal
// through, and stepEl then threw on byKey.get(...).n during boot.
function normPlans(list) {
  return list.filter(p => p && byKey.has(p.tK) && Array.isArray(p.steps)
      && p.steps.every(s => s && byKey.has(s.aK) && byKey.has(s.bK) && byKey.has(s.cK)))
    .map(p => ({...p, passives: Array.isArray(p.passives) ? p.passives : [],
      done: Array.isArray(p.done) ? p.done : p.steps.map(() => false)}));
}
let plans = normPlans(readStore('palbreed_plans', []));
function savePlans() { localStorage.setItem('palbreed_plans', JSON.stringify(plans)); updateChecklist(); }
function renderPlans() {
  const list = document.getElementById('plansList');
  // Every re-render throws the whole list away, so remember what had focus and
  // hand it back: ticking a step or deleting a plan otherwise dropped you on
  // <body>, with the entire page between you and where you were (DESIGN.md 9).
  const ae = document.activeElement;
  let restore = null;
  if (ae && list.contains(ae)) {
    const card = ae.closest('.plan');
    restore = {
      id: card ? card.dataset.id : null,
      chk: ae.classList.contains('chk') ? ae.dataset.i : null,
      cls: ae.classList.contains('del') ? '.del' : ae.classList.contains('treebtn') ? '.treebtn' : ae.classList.contains('stepopen') ? '.stepopen' : null,
      idx: [...list.querySelectorAll('.plan')].findIndex(c => c === card),
    };
  }
  planModeEl.hidden = !plans.length;
  planModeEl.querySelector('[data-m="saved"]').textContent = `Saved plans (${plans.length})`;
  list.innerHTML = '';
  if (!plans.length) {
    if (planMode === 'saved') setPlanMode('new');
    // deleting the last plan empties the list and bounces to the route form,
    // so the restore below never runs — hand focus to where the new form starts
    if (restore) {
      const el = document.querySelector('#pickS1 .picker-btn') || document.getElementById('clearSlots');
      if (el) el.focus();
    }
    list.innerHTML = '<div class="hint">No saved plans yet — compute a route and save it.</div>';
    return;
  }
  for (const plan of plans) {
    const card = document.createElement('div'); card.className = 'plan'; card.dataset.id = plan.id;
    const head = document.createElement('div'); head.className = 'planhead';
    head.appendChild(icon(byKey.get(plan.tK), 38, true));
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = plan.name; head.appendChild(nm);
    const doneCnt = plan.done.filter(Boolean).length;
    const prog = document.createElement('span'); prog.className = 'prog';
    prog.textContent = doneCnt === plan.steps.length ? '✓ complete' : `${doneCnt}/${plan.steps.length} steps`;
    head.appendChild(prog);
    // Plans saved before the four-passive cap can list more. The data is left
    // exactly as stored — truncating to "the first 4" would discard a user
    // record to tidy the app's own arithmetic, and "first 4" is the arbitrary
    // pick this whole change exists to refuse. Presentation only; the steps,
    // tree and checklist stay live, because the route is species-only and
    // remains correct. The branch can only fire on legacy rows.
    if (plan.passives.length > 4) {
      const w = document.createElement('span'); w.className = 'mchip warn';
      w.append(`A pal holds 4 — this plan lists ${plan.passives.length}`);
      const sr = document.createElement('span'); sr.className = 'sr-only';
      sr.textContent = '. Plan a new route to choose which 4.';
      w.appendChild(sr); head.appendChild(w);
    }
    if (plan.passives.length) head.appendChild(passiveChips(plan.passives));
    const treeBtn = document.createElement('button'); treeBtn.className = 'stepopen pushr treebtn';
    treeBtn.title = 'Show this plan as an interactive tree';
    treeBtn.setAttribute('aria-expanded', 'false');
    // a Lucide chevron, not the two arrowhead glyphs this used: neither is in
    // section 7's established text-symbol set, and aria-expanded already carries
    // the state so the mark only has to point
    const setTreeLabel = open => {
      treeBtn.replaceChildren('Tree', lucide(open ? 'chevronUp' : 'chevronDown', 14));
    };
    setTreeLabel(false);
    const treeBox = document.createElement('div'); treeBox.className = 'plantree'; treeBox.hidden = true;
    treeBtn.addEventListener('click', () => {
      treeBox.hidden = !treeBox.hidden;
      treeBtn.setAttribute('aria-expanded', String(!treeBox.hidden));
      setTreeLabel(!treeBox.hidden);
      if (!treeBox.hidden && !treeBox.childElementCount) treeBox.appendChild(treeViewport(routeTree(plan.steps)));
    });
    head.appendChild(treeBtn);
    const del = document.createElement('button'); del.className = 'del danger'; del.textContent = '✕ Delete';
    del.setAttribute('aria-label', 'Delete plan ' + plan.name);
    del.addEventListener('click', () => {
      const idx = plans.findIndex(x => x.id === plan.id);
      if (idx < 0) return;
      const removed = plans[idx];
      // deleting the last plan drops the sub-tab bar and bounces you to "new";
      // undo has to put that back too, or restoring your only plan leaves you
      // on the route form looking at no evidence the undo did anything
      const mode = planMode;
      plans.splice(idx, 1); savePlans(); renderPlans();
      toast('Deleted plan “' + removed.name + '”', () => {
        plans.splice(Math.min(idx, plans.length), 0, removed);
        savePlans(); renderPlans(); setPlanMode(mode);
      });
    });
    head.appendChild(del);
    card.appendChild(head);
    card.appendChild(treeBox);
    const need = neededSpecies(plan.steps);
    if (need.length) card.appendChild(neededRow(need));
    plan.steps.forEach((s, i) => {
      const row = stepEl(s, {stepNo: i + 1, chain: plan.steps, onOpen: () => openChainStep(plan.steps, i)});
      if (plan.done[i]) row.classList.add('done');
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.className = 'chk'; chk.checked = !!plan.done[i];
      // four boxes called "Mark step done" name nothing — say which step
      chk.title = 'Mark step done';
      chk.setAttribute('aria-label', `Step ${i + 1} done — ${byKey.get(s.aK).n} and ${byKey.get(s.bK).n} to ${byKey.get(s.cK).n}`);
      chk.dataset.i = i;
      chk.addEventListener('change', () => { plan.done[i] = chk.checked; savePlans(); renderPlans(); });
      row.insertBefore(chk, row.firstChild);
      card.appendChild(row);
    });
    list.appendChild(card);
  }
  if (restore) restorePlanFocus(restore, list);
}
// The successor of whatever the press destroyed: the same control on the same
// plan, then the same control on the plan that took its place, then the list's
// first control — never <body>.
function restorePlanFocus(r, list) {
  const cards = [...list.querySelectorAll('.plan')];
  const card = (r.id && list.querySelector(`.plan[data-id="${CSS.escape(r.id)}"]`))
    || cards[Math.min(r.idx < 0 ? 0 : r.idx, cards.length - 1)];
  let el = null;
  if (card) {
    if (r.chk != null) el = card.querySelector(`.chk[data-i="${r.chk}"]`) || card.querySelector('.chk');
    else if (r.cls) el = card.querySelector(r.cls);
    el = el || card.querySelector('button, input');
  }
  el = el || list.querySelector('button, input') || document.querySelector('#planMode button.active');
  if (el) el.focus();
}

