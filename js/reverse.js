// ---------- reverse view ----------
const pickT = makePicker(document.getElementById('pickT'), {placeholder:'Pick a species…', ariaLabel:'Target species', allowClear:true, ownedToggle:true, onChange:() => { reverseShown = {}; renderReverse(); }});
const pickL = makePicker(document.getElementById('pickL'), {placeholder:'Any species', allowClear:true, ownedToggle:true, onChange:() => { reverseShown = {}; renderReverse(); }});
// #pairFilter is gone: it substring-matched either parent name, which is what
// pickL already does exactly — and pickL's own popover has a search box.
const GROUP_PAGE = 20, GROUP_MORE = 40;
let reverseShown = {};           // groups shown per tier key, not pairs
// Lucide triangle-alert, replacing the ⚠ this view used (DESIGN.md §7 tier 2).
// One implementation, in core's LU table — every other ⚠ in the app now draws
// the same shape through it.
const warnGlyph = () => lucide('triangleAlert', 16, 'wglyph');
let ownedOnly = false;
const ownedToggle = document.getElementById('ownedToggle');
ownedToggle.addEventListener('click', () => { ownedOnly = !ownedOnly; setSwitch(ownedToggle, ownedOnly); reverseShown = {}; renderReverse(); });

function reversePairs(target) {
  const out = [];
  for (const c of (comboByChild.get(target.k) || [])) {
    out.push({a: byKey.get(c.a), b: byKey.get(c.b), kind: c.ga ? 'gender' : 'unique', ga: c.ga, gb: c.gb});
  }
  const hasSelf = out.some(p => p.a.k === target.k && p.b.k === target.k);
  if (!hasSelf) out.push({a: target, b: target, kind: 'same'});
  if (!target.ic && !uniqueChildren.has(target.k)) {
    for (let i = 0; i < PALS.length; i++) for (let j = i; j < PALS.length; j++) {
      const a = PALS[i], b = PALS[j];
      if (a.k === b.k) continue;
      if (comboByPair.has(pairKey(a.k, b.k))) continue;
      if (nearestByRank(Math.floor((a.r + b.r + 1) / 2)).k === target.k) out.push({a, b, kind: 'avg'});
    }
  }
  return out;
}
function setReverseStatus(...parts) {
  document.getElementById('reverseStatus').replaceChildren(...parts);
}
// Greedy set cover: repeatedly take the species that covers the most remaining
// pairs and emit it as one group. Anchoring on, say, the lower Paldex number
// instead would split the long runs this exists to collapse — measured, the
// same left parent repeated 21 times in a row for one target.
// `pin` forces the anchor (tier 2 anchors on the parent you actually own).
function groupPairs(list, pin) {
  // Bucket once and shrink the buckets, rather than recounting every remaining
  // pair per iteration: at 1,271 pairs the recount cost 35ms, over budget.
  const buckets = new Map();
  const add = (k, p) => { if (!buckets.has(k)) buckets.set(k, new Set()); buckets.get(k).add(p); };
  for (const p of list) {
    if (pin) add(pin(p).k, p);
    else if (p.a.k === p.b.k) add(p.a.k, p);
    else { add(p.a.k, p); add(p.b.k, p); }
  }
  const out = [];
  for (;;) {
    let bestK = null, bestN = 0;
    for (const [k, set] of buckets) {
      // ties break on Paldex order, so the same roster always renders the same
      if (set.size > bestN || (set.size === bestN && bestK !== null && byKey.get(k).z < byKey.get(bestK).z)) { bestK = k; bestN = set.size; }
    }
    if (!bestK) break;
    const items = [];
    for (const p of [...buckets.get(bestK)]) {
      if (pin) buckets.get(pin(p).k).delete(p);
      else { buckets.get(p.a.k).delete(p); if (p.b.k !== p.a.k) buckets.get(p.b.k).delete(p); }
      items.push({p, other: p.a.k === p.b.k ? p.a : (p.a.k === bestK ? p.b : p.a), self: p.a.k === p.b.k});
    }
    items.sort((x, y) => x.other.z - y.other.z);
    out.push({pal: byKey.get(bestK), items});
  }
  return out.sort((x, y) => y.items.length - x.items.length || x.pal.z - y.pal.z);
}

function renderReverse() {
  save();
  const zone = document.getElementById('reverseResult');
  // Every re-render destroys whatever was focused inside the list. Only step in
  // when focus was actually in here — arriving from another view must not have
  // its focus stolen (DESIGN.md §9).
  const hadFocus = zone.contains(document.activeElement);
  zone.innerHTML = '';
  const t = pickT.get();
  const linkrow = (...btns) => {
    const lr = document.createElement('div'); lr.className = 'linkrow';
    lr.append(...btns); zone.appendChild(lr); return lr;
  };
  const act = (label, primary, fn) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'alink' + (primary ? ' primary' : ''); b.textContent = label;
    b.addEventListener('click', fn); return b;
  };
  if (!t) {
    document.getElementById('reverseHow').hidden = true;
    setReverseStatus('Pick a target species to see every pair that makes it.');
    linkrow(act('Pick a target species', true, () => pickT.openPop()));
    restoreReverseFocus(hadFocus, zone);
    return;
  }

  const os = ownedSpeciesSet();
  const all = reversePairs(t);
  document.getElementById('reverseHow').hidden = false;
  const total = all.length;
  const lock = pickL.get();
  let pairs = lock ? all.filter(p => p.a.k === lock.k || p.b.k === lock.k) : all;
  const score = p => (os.has(p.a.k) ? 1 : 0) + (os.has(p.b.k) ? 1 : 0);
  if (ownedOnly) pairs = pairs.filter(p => score(p) === 2);

  if (!pairs.length) {
    if (lock) {
      setReverseStatus('No ', strongName(t.n), ' pair includes ' + lock.n + '.');
      linkrow(act(`Show all ${total.toLocaleString()} pairs`, false, () => {
        pickL.set(null, true); renderReverse();
        const a = zone.querySelector('.pgroup .anchor'); if (a) a.focus();
      }));
    } else if (!lock && !ownedOnly) {
      // unreachable today (measured: every one of the 299 species has at least
      // one pair) — but leaving the previous target's sentence in the live
      // region would be a stale answer, not an empty one
      setReverseStatus('No pair makes ' + t.n + '.');
    } else if (ownedOnly) {
      setReverseStatus('None of the ', strongName(total.toLocaleString() + ' pairs'), ' that make ' + t.n + ' use only pals you own.');
      linkrow(act('Show every pair', false, () => {
        ownedOnly = false; setSwitch(ownedToggle, false); renderReverse();
        const a = zone.querySelector('.pgroup .anchor'); if (a) a.focus();
      }));
    }
    restoreReverseFocus(hadFocus, zone);
    return;
  }

  // ---- ownership tiers, named on screen instead of only sorted ----
  // A pair you own both halves of but whose genders can't work is NOT one you
  // can breed now — counting it there made the headline sentence false.
  const blocked = p => score(p) === 2 && !!pairGenderIssue(p.a.k, p.b.k);
  const tiers = [
    {key: 'now', label: 'Breed now', list: pairs.filter(p => score(p) === 2 && !blocked(p))},
    {key: 'blocked', label: 'Blocked by gender', list: pairs.filter(blocked)},
    {key: 'one', label: 'One parent missing', list: pairs.filter(p => score(p) === 1), pin: p => os.has(p.a.k) ? p.a : p.b},
    {key: 'none', label: 'Both parents missing', list: pairs.filter(p => score(p) === 0)},
  ].filter(x => x.list.length);

  // ---- the answer, in one sentence ----
  const selfOnly = total === 1 && all[0].a.k === all[0].b.k;
  const uniqueOnly = all.every(p => p.kind === 'unique' || p.kind === 'gender');
  const n = pairs.length, shown = n.toLocaleString(), tot = total.toLocaleString();
  // The denominator has to describe the same population as the numerator: with
  // a species filter on, "1 of 58" compared a filtered count to an unfiltered
  // one. So it can only ever qualify a TIER count — a branch whose numerator is
  // already the shown count has nothing to compare itself to, and printing both
  // read "2 of the 2 shown pairs make Lamball".
  const of = n === total ? '' : ' of the ' + shown + ' shown';
  const plural = k => k === 1 ? '' : 's';
  const makes = k => k === 1 ? ' makes ' : ' make ';
  if (selfOnly) {
    setReverseStatus(t.n + ' can’t be bred from other species — only from two ' + t.n + '.');
  } else if (tiers[0] && tiers[0].key === 'now') {
    const c = tiers[0].list.length;
    if (ownedOnly) {
      // every shown pair uses pals you own by definition here, so the old
      // predicate measured the set against itself. Ready vs blocked is the
      // number that still means something.
      const rest = n - c;
      setReverseStatus('You can breed ' + t.n + ' now — ', strongName(String(c)),
        ' pair' + plural(c) + ' ready' + (rest ? ', ' + rest + ' blocked by gender.' : '.'));
    } else {
      // the noun follows the denominator when there is one: keyed to c it wrote
      // "1 of the 2 shown pair"
      setReverseStatus('You can breed ' + t.n + ' now — ', strongName(String(c)),
        of + ' pair' + plural(of ? n : c) + ' use' + (c === 1 ? 's' : '') + ' pals you own.');
    }
  } else if (tiers[0] && tiers[0].key === 'blocked') {
    const c = tiers[0].list.length;
    setReverseStatus('You own both halves of ', strongName(String(c)), ' pair' + plural(c) + ', but the genders don’t work yet.');
  } else if (tiers[0] && tiers[0].key === 'one') {
    const g1 = groupPairs(tiers[0].list, tiers[0].pin).length;
    setReverseStatus('No pair is ready yet. ', strongName(String(g1)), ' of your pals need' + (g1 === 1 ? 's' : '') + ' one more partner.');
  } else if (!os.size) {
    setReverseStatus(strongName(shown), ' pair' + plural(n) + makes(n) + t.n + '. Star pals you own to see which you can breed.');
  } else if (uniqueOnly) {
    setReverseStatus('Only ', strongName(shown), ' pair' + plural(n) + makes(n) + t.n + ' — all fixed unique combos.');
  } else {
    setReverseStatus('None of your pals make ' + t.n + '. ', strongName(shown), ' pair' + plural(n) + (n === 1 ? ' does.' : ' do.'));
  }
  if (!os.size && !selfOnly) linkrow(act('Star pals you own in the Paldex', false, () => navTab('dex')));

  // ---- the groups ----
  const band = txt => { const h = document.createElement('h3'); h.className = 'slotlb mt'; h.textContent = txt; zone.appendChild(h); };
  for (const tier of tiers) {
    const groups = groupPairs(tier.list, tier.pin);
    const cap = reverseShown[tier.key] || GROUP_PAGE;
    const c = tier.list.length;
    if (tiers.length > 1) {
      const cut = groups.length > cap ? ` · showing ${cap} of ${groups.length.toLocaleString()} parents` : '';
      band(`${tier.label} · ${c.toLocaleString()} pair${c === 1 ? '' : 's'}${cut}`);
    }
    const ul = document.createElement('ul'); ul.className = 'pairs';
    for (const g of groups.slice(0, cap)) ul.appendChild(pairGroup(g, os, t));
    zone.appendChild(ul);
    // One .more per tier, directly under the list it expands. A single shared
    // one sat up to 3,400px below the band it partly grew, promised a fixed 40
    // when 20 remained, and revealed 80 at once by expanding every tier.
    const left = groups.length - cap;
    if (left <= 0) continue;
    const m = document.createElement('button'); m.type = 'button'; m.className = 'more';
    const step = Math.min(GROUP_MORE, left);
    m.textContent = `Show ${step} more · ${left.toLocaleString()} hidden`;
    m.setAttribute('aria-label', `Show ${step} more parents under ${tier.label} · ${left.toLocaleString()} hidden`);
    m.addEventListener('click', () => {
      reverseShown = {...reverseShown, [tier.key]: cap + GROUP_MORE};
      renderReverse();
      // this button is rebuilt further down, so it is never the restore target
      const gs = zone.querySelectorAll('.pgroup .anchor');
      const el = gs[cap] || gs[gs.length - 1];
      if (el) el.focus();
    });
    zone.appendChild(m);
  }
  restoreReverseFocus(hadFocus, zone);
}
// If the control that had focus is gone, land on the first thing in the list
// rather than <body> — measured: pressing .more used to strand focus at the top
// of the document with 300+ buttons between you and where you were.
function restoreReverseFocus(hadFocus, zone) {
  if (!hadFocus || zone.contains(document.activeElement)) return;
  const el = zone.querySelector('.pgroup .anchor') || zone.querySelector('.alink') || zone.querySelector('.more');
  if (el) el.focus();
}

// One parent, then every partner that works with it. Two tab stops: the anchor
// (opens that species' card) and the partner strip (a roving toolbar).
function pairGroup(g, os) {
  const li = document.createElement('li'); li.className = 'pgroup';

  const anchor = document.createElement('button');
  anchor.type = 'button'; anchor.className = 'anchor';
  anchor.setAttribute('aria-label', g.pal.n + ', open species card');
  anchor.title = 'Open ' + g.pal.n + '’s card';
  // so closing a modal opened from here can find this same row again after the
  // re-render, instead of dropping you back at the top of a 40-row list
  anchor.dataset.k = g.pal.k;
  anchor.appendChild(icon(g.pal, 28, false, true));
  const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = g.pal.n;
  anchor.appendChild(nm);
  // aria-hidden, not role=img: the anchor's own aria-label prunes the subtree,
  // so a role and label here are dead weight that only look like coverage
  if (os.has(g.pal.k)) { const o = document.createElement('span'); o.className = 'own';
    o.textContent = '★'; o.setAttribute('aria-hidden', 'true'); anchor.appendChild(o); }
  anchor.addEventListener('click', () => openModal(g.pal));
  li.appendChild(anchor);

  const x = document.createElement('span'); x.className = 'x';
  x.setAttribute('aria-hidden', 'true'); x.textContent = '×';
  li.appendChild(x);

  const anchorNeeds = new Set();
  const strip = document.createElement('div'); strip.className = 'chiprow';
  strip.setAttribute('role', 'toolbar'); strip.setAttribute('aria-orientation', 'horizontal');
  strip.setAttribute('aria-label', 'Pairs with ' + g.pal.n);
  for (const it of g.items) {
    const p = it.p;
    // the gender warning is no longer gated behind the owned filter: telling
    // someone a pair is ready and only admitting it isn't if they flip a
    // switch is hiding the answer, not filtering it
    const issue = pairGenderIssue(p.a.k, p.b.k);
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'tchip' + (issue ? ' warn' : '');
    // The art stays on a warn chip: a pal is a game concept (§7 tier 1) and
    // that recognition is how you find the row again. The glyph joins it rather
    // than replacing it — swapping made warn chips 3px shorter than their
    // siblings in the same strip.
    chip.appendChild(icon(it.other, 22, false, true));
    if (issue) chip.appendChild(warnGlyph());
    const s = document.createElement('span');
    // "Jetragon × two of the same" parses as arithmetic — three Jetragon.
    // "another Jetragon" reads correctly in the row's own grammar.
    s.textContent = it.self ? 'another ' + g.pal.n : it.other.n;
    chip.appendChild(s);
    if (!it.self && os.has(it.other.k)) { const o = document.createElement('span'); o.className = 'own';
      o.textContent = '★'; o.setAttribute('aria-hidden', 'true'); chip.appendChild(o); }
    const ga = p.a.k === g.pal.k ? p.ga : p.gb, gb = p.a.k === g.pal.k ? p.gb : p.ga;
    // BOTH genders, drawn on the chip. Rendering only the partner's left the
    // anchor's requirement visible to AT (via the label below) and to nobody
    // else, so the pair as drawn wasn't actionable.
    const gsym = x => x === 'Male' ? '♂' : '♀';
    // Only the partner's mark goes on the chip. The anchor's own requirement is
    // hoisted onto the anchor below — drawn here it sat after the ×, right
    // before the partner's art, and read as a second mark on the partner.
    if (ga) anchorNeeds.add(gsym(ga));
    if (gb) chip.appendChild(gEl(gsym(gb)));
    const partnerName = it.self ? g.pal.n : it.other.n;
    const say = g => g ? ' (' + (g === 'Male' ? 'male' : 'female') + ')' : '';
    // The name must contain the visible text (2.5.3) — "two of the same" is what
    // the chip says, so it leads. And the warning has to live in the NAME: an
    // .sr-only span inside a button carrying aria-label is never announced,
    // which had this chip sitting under "Breed now" telling AT users a pair was
    // ready with nothing anywhere saying it wasn't.
    // "and", never the × glyph — NVDA reads U+00D7 as "times".
    const why = issue ? ' — ' + issue.replace(/♂/g, 'male').replace(/♀/g, 'female') : '';
    chip.setAttribute('aria-label', (it.self
      ? `${g.pal.n}${say(ga)} and another ${g.pal.n}${say(gb)}`
      : `${g.pal.n}${say(ga)} and ${partnerName}${say(gb)}`) + why + ' — open in Breed');
    // the reason has to be on screen too: in the aria-label alone, sighted and
    // touch users saw a pink chip under "Breed now" and no words at all
    if (issue) { const w = document.createElement('span'); w.className = 'why';
      w.appendChild(genderize(issue)); chip.appendChild(w); }
    chip.addEventListener('click', () => {
      pickA.set(p.a, true); pickB.set(p.b, true); renderBreed(); navTab('breed');
      // land on the answer, not <body> — navTab alone leaves focus on a button
      // this render has just destroyed
      const c = document.querySelector('#breedResult .cardopen'); if (c) c.focus();
    });
    strip.appendChild(chip);
  }
  rovingRow(strip);
  // one mark only when every pair in this group agrees; the two gender-kind
  // targets in the dataset each hold exactly one pair, so they always do
  if (anchorNeeds.size === 1) {
    const sym = [...anchorNeeds][0];
    anchor.insertBefore(gEl(sym), nm.nextSibling);
    anchor.setAttribute('aria-label', `${g.pal.n} (${sym === '♂' ? 'male' : 'female'}), open species card`);
  }
  li.appendChild(strip);
  return li;
}

