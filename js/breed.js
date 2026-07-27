// ---------- breed view ----------
const pickA = makePicker(document.getElementById('pickA'), {placeholder:'Pick a species…', ariaLabel:'Parent 1', allowClear:true, ownedToggle:true,
  onChange: p => { renderBreed(); if (p && !pickB.get()) setTimeout(() => pickB.openPop(), 0); }});
const pickB = makePicker(document.getElementById('pickB'), {placeholder:'Pick a species…', ariaLabel:'Parent 2', allowClear:true, ownedToggle:true, onChange:renderBreed});
document.getElementById('swapBtn').addEventListener('click', () => {
  const a = pickA.get(), b = pickB.get();
  pickA.set(b, true); pickB.set(a, true); renderBreed();
});

// ---------- breeding chain view (opened from Planner / saved plans) ----------
let breedChain = null; // {steps, idx}
function openChainStep(steps, idx) {
  const st = steps[idx];
  breedChain = {steps: steps.map(s => ({...s})), idx};
  pickA.set(byKey.get(st.aK), true);
  pickB.set(byKey.get(st.bK), true);
  renderBreed();
  navTab('breed');
  // The press happened on another tab, on a button this navigation hides, so
  // focus would fall to <body>. Land the reader on what the press revealed —
  // the card is labelled by its own title, so focusing it says which step it is.
  // preventScroll, then scroll the view instead: letting the browser reveal a
  // 442px card pushed the heading, the answer sentence and the result card off
  // the top of a phone screen, so you arrived at a bare tree diagram.
  const cc = document.querySelector('.chaincard');
  if (cc) {
    cc.focus({preventScroll: true});
    document.getElementById('view-breed').scrollIntoView({block: 'start', behavior: SMOOTH});
  }
}
// The chain nav rebuilds itself on every step, so the button that was just
// pressed is gone by the time it takes effect. Re-focus the same direction, or
// the other one where this end of the chain has just disabled it (DESIGN.md §9).
function focusChainNav(dir) {
  const btns = [...document.querySelectorAll('.chaincard .nav button')];
  const b = btns.find(x => +x.dataset.d === dir && !x.disabled) || btns.find(x => !x.disabled);
  if (b) b.focus();
}
// After a press that re-renders the zone and destroys its own button, hand focus
// to the answer the press produced rather than letting it fall to <body>.
function focusResult() {
  const el = document.querySelector('#breedResult .cardopen') ||
             document.querySelector('#breedResult .linkrow button');
  if (el) el.focus(); else focusPicker(pickA);
}
// The step the chain is on, or null once the pair on screen stops being that
// step — changing a picker mid-chain ends the chain. This has to be answered
// BEFORE the status sentence is written, not after: the check used to live in
// appendChainCard, which runs last, so a "Step 2 of 4:" prefix would announce a
// step the pickers had already left.
function chainStep(a, b) {
  if (!breedChain) return null;
  const st = breedChain.steps[breedChain.idx];
  if (!st || !a || !b || pairKey(a.k, b.k) !== pairKey(st.aK, st.bK)) { breedChain = null; return null; }
  return st;
}
function appendChainCard(zone, a, b) {
  if (!chainStep(a, b)) return;
  const n = breedChain.steps.length;
  const target = byKey.get(breedChain.steps[n - 1].cK);
  const card = document.createElement('div'); card.className = 'chaincard';
  // focusable and named, so arriving from the Planner announces where you landed
  card.tabIndex = -1; card.setAttribute('role', 'group'); card.setAttribute('aria-labelledby', 'chainTtl');
  const head = document.createElement('div'); head.className = 'chainhead';
  const ttl = document.createElement('span'); ttl.className = 'ttl'; ttl.id = 'chainTtl';
  ttl.textContent = `Breeding chain — step ${breedChain.idx + 1} of ${n} toward ${target.n}`;
  head.appendChild(ttl);
  const nav = document.createElement('div'); nav.className = 'nav';
  const go = d => {
    const ni = breedChain.idx + d;
    if (ni < 0 || ni >= n) return;
    breedChain.idx = ni;
    const s2 = breedChain.steps[ni];
    pickA.set(byKey.get(s2.aK), true);
    pickB.set(byKey.get(s2.bK), true);
    renderBreed();
    focusChainNav(d);
  };
  // Lucide chevrons, not ◀ ▶: those two aren't in the established text-symbol
  // set, they carry an emoji presentation on some platforms, and §7 names
  // chevrons as a tier-2 icon outright.
  // No aria-label: one that didn't contain the visible words ("Previous chain
  // step" over "Prev step") fails 2.5.3 Label in Name, so speech input couldn't
  // say what it could see. The group's own name already supplies the context.
  const mk = (txt, d, disabled) => {
    const bt = document.createElement('button'); bt.type = 'button';
    bt.disabled = disabled; bt.dataset.d = d;
    if (d < 0) bt.append(lucide('chevronLeft', 16), txt);
    else bt.append(txt, lucide('chevronRight', 16));
    bt.addEventListener('click', () => go(d));
    return bt;
  };
  nav.append(mk('Previous step', -1, breedChain.idx === 0),
             mk('Next step', 1, breedChain.idx === n - 1));
  head.appendChild(nav);
  card.appendChild(head);
  card.appendChild(treeViewport(routeTree(breedChain.steps, breedChain.idx)));
  const exit = document.createElement('button'); exit.className = 'alink'; exit.textContent = '✕ Leave chain view';
  exit.addEventListener('click', () => { breedChain = null; renderBreed(); focusResult(); });
  card.appendChild(exit);
  zone.appendChild(card);
}

let cardSeq = 0;
function childCard(p, opts = {}) {
  const card = document.createElement('div'); card.className = 'child-card clickable';
  // A real <button> laid over the card, not role="button" wrapped around it.
  // Wrapping made the card's own name ("View X details") replace everything
  // inside it, buried a heading in a button, and left no room for the card to
  // ever hold an interactive chip. Same pattern as .dextile-open (DESIGN.md §4).
  const hid = 'ccn' + (++cardSeq);
  const open = document.createElement('button');
  open.type = 'button'; open.className = 'cardopen';
  open.setAttribute('aria-labelledby', hid);
  const sr = document.createElement('span'); sr.className = 'sr-only';
  sr.id = hid + 'd'; sr.textContent = 'Opens the full card';
  open.setAttribute('aria-describedby', sr.id);
  // inside the button, not beside it — as a sibling, browse mode read the
  // description once for the button and again as loose text before the heading
  open.appendChild(sr);
  card.appendChild(open);
  // on the card, not the button: the button is pointer-events:none so chips
  // keep their tooltips, and Enter/Space on it bubbles a click up to here
  card.addEventListener('click', () => openModal(p));
  // decorative: the heading beside it already says the name
  card.appendChild(icon(p, 84, false, true));
  const body = document.createElement('div');
  const h = document.createElement('h3'); h.id = hid; h.textContent = p.n;
  // the space matters — without it the accessible name reads "Daedream#22"
  const z = document.createElement('span'); z.className = 'zk'; z.textContent = ' ' + zk(p); h.appendChild(z);
  body.appendChild(h);
  // The condition is the only thing telling two gender-combo cards apart, so it
  // leads the body instead of sitting under the chips styled as a footnote.
  if (opts.gtag) { const t = document.createElement('div'); t.className = 'gtag'; t.appendChild(genderize(opts.gtag)); body.appendChild(t); }
  const crow = document.createElement('div'); crow.className = 'crow';
  crow.appendChild(typeChips(p));
  if (opts.badge) { const bd = document.createElement('span'); bd.className = 'badge ' + opts.badge[0]; bd.textContent = opts.badge[1]; crow.appendChild(bd); }
  crow.appendChild(eggChip(p));
  body.appendChild(crow);
  body.appendChild(genderBar(p));
  body.appendChild(worksEl(p));
  card.appendChild(body);
  return card;
}
// "A × B" for the status sentence. NVDA reads U+00D7 as "times", which turns
// the sentence into arithmetic — so the glyph is shown and "and" is announced.
function pairPhrase(a, b) {
  const f = document.createDocumentFragment();
  f.append(a.n + ' ');
  const x = document.createElement('span'); x.setAttribute('aria-hidden', 'true'); x.textContent = '×';
  const s = document.createElement('span'); s.className = 'sr-only'; s.textContent = 'and';
  f.append(x, s, ' ' + b.n);
  return f;
}
const strongName = n => { const e = document.createElement('b'); e.textContent = n; return e; };
// a button that navigates away is destroyed by the re-render, so focus has to
// be placed deliberately or it falls to <body> (DESIGN.md §9)
const focusPicker = pk => { const el = pk.root.querySelector('.picker-btn'); if (el) el.focus(); };
function setBreedStatus(...parts) {
  const el = document.getElementById('breedStatus');
  el.replaceChildren(...parts);
}

function renderBreed() {
  save();
  const zone = document.getElementById('breedResult');
  zone.innerHTML = '';
  zone.classList.remove('two');
  const a = pickA.get(), b = pickB.get();

  if (!a || !b) {
    // The sentence lives in the persistent status line, so .hint — which is a
    // sentence plus an action — would say it twice (DESIGN.md §4).
    const lr = document.createElement('div'); lr.className = 'linkrow';
    if (a || b) {
      const n = a ? '2' : '1', pk = a ? pickB : pickA;
      setBreedStatus('Now pick parent ' + n + '.');
      const go = document.createElement('button'); go.type = 'button'; go.className = 'alink';
      go.textContent = 'Pick parent ' + n;
      // a thumb-reachable target, so the phone user doesn't scroll back up
      go.addEventListener('click', () => pk.openPop());
      lr.appendChild(go);
    } else {
      setBreedStatus('Pick two parents to see what their egg hatches.');
      const exA = PALS.find(p => p.n === 'Relaxaurus'), exB = PALS.find(p => p.n === 'Sparkit');
      if (exA && exB) {
        const ex = document.createElement('button'); ex.type = 'button'; ex.className = 'alink';
        ex.append('Try an example: ', pairPhrase(exA, exB));
        // the button destroys itself in the re-render, so hand focus to the answer
        ex.addEventListener('click', () => { pickA.set(exA, true); pickB.set(exB, true); renderBreed(); focusResult(); });
        lr.appendChild(ex);
      }
      const rev = document.createElement('button'); rev.type = 'button'; rev.className = 'alink';
      rev.textContent = 'Work backwards from a target species';
      rev.addEventListener('click', () => { navTab('reverse'); focusPicker(pickT); });
      lr.appendChild(rev);
    }
    zone.appendChild(lr);
    return;
  }

  localStorage.setItem('palbreed_bred', '1'); updateChecklist();
  const res = breed(a, b);
  const kids = res.children;
  const one = kids.length === 1 ? kids[0].pal : null;

  // ---- the answer, in one sentence ----
  // Inside a chain the answer only means something relative to the step, and the
  // step count has nowhere else to be announced: #chainTtl is the card's
  // accessible name, not a live region, and focus deliberately stays on the nav
  // button after a step. So the one sentence carries it (DESIGN.md §4).
  // A colon, not a dash — the unique kind already ends in an em-dash clause.
  // No prefix on a one-step chain: a position that cannot change is noise.
  const stepN = chainStep(a, b) && breedChain.steps.length > 1
    ? `Step ${breedChain.idx + 1} of ${breedChain.steps.length}: ` : '';
  if (res.kind === 'gender') {
    // species, not pals — one egg hatches one pal; what varies is which species
    setBreedStatus(stepN, pairPhrase(a, b), ' hatches one of two species.');
  } else if (res.kind === 'same') {
    setBreedStatus(stepN + 'Two ' + a.n + ' hatch ', strongName(one.n), '.');
  } else if (res.kind === 'unique') {
    setBreedStatus(stepN, pairPhrase(a, b), ' hatches ', strongName(one.n), ' — a unique combo.');
  } else {
    setBreedStatus(stepN, pairPhrase(a, b), ' hatches ', strongName(one.n), '.');
  }

  // ---- the card, or two of them ----
  if (res.kind === 'gender') {
    zone.classList.add('two');
    for (const ch of kids) {
      const gs = g => g === 'Male' ? '♂' : '♀';
      // Orient onto the picked slots, the way planner.js stepEl does. ch.pa/pb
      // come from the dataset combo, whose own order is arbitrary — so the one
      // line that tells the two cards apart could name the parents backwards
      // from the status sentence and the pickers directly above it.
      const ga = ch.pa === a.k ? ch.ga : ch.gb, gb = ch.pb === b.k ? ch.gb : ch.ga;
      // No .badge.gender: it repeats on both cards so it distinguishes nothing,
      // and it is --danger pink for a fact that is not a warning.
      zone.appendChild(childCard(ch.pal, {gtag: `If ${a.n} is ${gs(ga)} and ${b.n} is ${gs(gb)}`}));
    }
  } else {
    const badge = res.kind === 'unique' ? ['unique', 'Unique combo'] : res.kind === 'same' ? ['same', 'Same species'] : null;
    zone.appendChild(childCard(one, {badge}));
  }

  // ---- why, then what next, then the footnote ----
  const rail = document.createElement('div'); rail.className = 'resrail';
  const lb = document.createElement('div'); lb.className = 'slotlb';
  lb.textContent = res.kind === 'gender' ? 'Why two results' : 'Why ' + one.n;
  rail.appendChild(lb);
  const sub = html => { const s = document.createElement('p'); s.className = 'sub'; s.innerHTML = html; rail.appendChild(s); return s; };
  if (res.kind === 'gender') {
    // species, not pal — the two cards are two species (§6 lexicon), and the
    // status sentence this explains already says "one of two species"
    sub('Which species you get depends on each parent’s gender.');
  } else if (res.kind === 'unique') {
    sub('This is a unique combo. It ignores the breeding-power math.');
  } else if (res.kind === 'same') {
    sub('Two of the same species always hatch that species.');
    // Say it is universal. Stated bare here and nowhere else, it reads as an
    // extra rule that same-species pairs carry and mixed pairs don't.
    const s = document.createElement('p'); s.className = 'sub';
    s.appendChild(genderize('Every pair needs one ♂ and one ♀ — this one included.'));
    rail.appendChild(s);
  } else {
    sub(`Breeding power <b>${a.r}</b> + <b>${b.r}</b> averages to <b>${res.target}</b> — closest is <b>${one.n}</b> (${one.r}).`);
    const alts = CANDS.filter(c => c.k !== one.k)
      .map(c => ({c, d: Math.abs(c.r - res.target)}))
      .sort((x, y) => x.d - y.d || y.c.pr - x.c.pr).slice(0, 2);
    if (alts.length) sub('Next closest: ' + alts.map(al => `${al.c.n} (${al.c.r})`).join(' · ') + ' — they lose the tie.');
  }

  const lr = document.createElement('div'); lr.className = 'linkrow';
  // With two children the pair is already on screen, so "find all parents"
  // answers a question nobody asked; every child gets a way to continue.
  if (one) {
    const b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'alink';
    b2.textContent = `Find all parents of ${one.n}`;
    b2.addEventListener('click', () => {
      // the target is already chosen, so land on the answer, not back on the
      // picker asking the question the user just answered
      pickT.set(one, true); reverseShown = {}; renderReverse(); navTab('reverse');
      const a = document.querySelector('#reverseResult .pgroup .anchor'); if (a) a.focus();
    });
    lr.appendChild(b2);
  }
  for (const ch of kids) {
    const p = ch.pal;
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'alink';
    bt.textContent = `Breed ${p.n} with…`;
    bt.title = 'Use this pal as Parent 1 and pick its partner';
    bt.addEventListener('click', () => {
      breedChain = null;
      pickA.set(p, true); pickB.set(null, true); renderBreed();
      setTimeout(() => pickB.openPop(), 0);
    });
    lr.appendChild(bt);
  }
  rail.appendChild(lr);

  // True of every pair in the game, so it is a footnote, not a finding.
  const g = document.createElement('button'); g.type = 'button'; g.className = 'alink gjump';
  g.appendChild(uiIcon('egg', 'mutation', 18));
  g.append('About 1% of eggs mutate ↗');
  g.setAttribute('aria-label', 'About 1% of eggs mutate — open the Guide');
  g.title = '3% with an Extravagant Vegetable Cake';
  g.addEventListener('click', () => {
    navTab('guide');
    const d = document.getElementById('g-mutations');
    if (d) {
      d.open = true; d.scrollIntoView({block: 'start', behavior: SMOOTH});
      const s = d.querySelector('summary'); if (s) s.focus();
    }
  });
  rail.appendChild(g);
  zone.appendChild(rail);
  appendChainCard(zone, a, b);
}

