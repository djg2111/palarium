// ---------- hatchery ----------
const hatchSearch = document.getElementById('hatchSearch');
const hatchNewBtn = document.getElementById('hatchNewOnly');
let hatchNewOnly = false;
hatchSearch.addEventListener('input', renderHatch);
hatchNewBtn.addEventListener('click', () => { hatchNewOnly = !hatchNewOnly; setSwitch(hatchNewBtn, hatchNewOnly); save(); renderHatch(); });
// chain depth: 1 = one step (default), 2 = up to two steps, 0 = any chain
let hatchDepth = 1;
const hatchDepthEl = document.getElementById('hatchDepth');
function setHatchDepth(d, silent) {
  hatchDepth = d;
  hatchDepthEl.querySelectorAll('button').forEach(b => {
    const on = +b.dataset.d === d;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (!silent) { save(); renderHatch(); }
}
hatchDepthEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setHatchDepth(+b.dataset.d); });
let hatchOpen = null; // childK of the expanded card
function renderHatch() {
  const list = document.getElementById('hatchList');
  const stats = document.getElementById('hatchStats');
  list.innerHTML = '';
  const own = [...ownedSpeciesSet()].filter(k => byKey.has(k));
  if (own.length < 1) {
    stats.textContent = '';
    const h = document.createElement('div'); h.className = 'hint'; h.style.gridColumn = '1/-1';
    h.append('Mark what you own first — then this page shows everything you can hatch from it. ');
    const bd = document.createElement('button'); bd.className = 'alink'; bd.textContent = '★ Star pals in the Paldex';
    bd.addEventListener('click', () => navTab('dex'));
    const br = document.createElement('button'); br.className = 'alink'; br.textContent = '+ Add roster pals';
    br.addEventListener('click', () => navTab('roster'));
    h.append(bd, ' ', br);
    list.appendChild(h);
    return;
  }
  const ownSet = new Set(own);
  // generation 1: every owned pair, keeping the full pair list per child
  const kids = new Map(); // childK -> {gen:1, ways, pairs} | {gen>=2, wa, wb (witness pair)}
  for (let i = 0; i < own.length; i++) for (let j = i; j < own.length; j++) {
    const res = breed(byKey.get(own[i]), byKey.get(own[j]));
    for (const c of res.children) {
      const e = kids.get(c.pal.k) || kids.set(c.pal.k, {gen: 1, ways: 0, pairs: []}).get(c.pal.k);
      e.ways++; e.pairs.push([own[i], own[j]]);
    }
  }
  // deeper generations: bred children join the parent pool. Only species you
  // own (or have already bred in the chain) ever act as parents, so the set
  // stays honest — one witness pair per species is enough to rebuild a chain.
  const maxGen = hatchDepth === 0 ? 6 : hatchDepth;
  let pool = [...own];
  let added = [...kids.keys()].filter(k => !ownSet.has(k));
  for (let gen = 2; gen <= maxGen && added.length; gen++) {
    pool = pool.concat(added);
    const next = [];
    for (const a of added) for (const b of pool) {
      const res = breed(byKey.get(a), byKey.get(b));
      for (const c of res.children) {
        const k = c.pal.k;
        if (kids.has(k) || ownSet.has(k)) continue;
        kids.set(k, {gen, wa: a, wb: b});
        next.push(k);
      }
    }
    added = next;
  }
  const q = hatchSearch.value.trim().toLowerCase();
  let rows = [...kids.entries()].map(([k, e]) => ({p: byKey.get(k), gen: e.gen, ways: e.ways, pairs: e.pairs, isNew: !ownSet.has(k)}))
    .filter(r => (!hatchNewOnly || r.isNew) && (!q || r.p.n.toLowerCase().includes(q)));
  rows.sort((a, b) => (b.isNew - a.isNew) || (a.gen - b.gen) || a.p.z - b.p.z);
  const newCount = rows.filter(r => r.isNew).length;
  const depthLbl = hatchDepth === 1 ? 'one step' : hatchDepth === 2 ? '≤2 steps' : 'any chain';
  // with the filter on every shown species is new by definition, so the tail
  // counted the same set twice
  stats.textContent = `${rows.length} species from ${own.length} owned · ${depthLbl}`
    + (hatchNewOnly ? ' · new only' : ` · ${newCount} new`);
  if (!rows.length) {
    const h = document.createElement('div'); h.className = 'hint'; h.style.gridColumn = '1/-1';
    h.append('Nothing matches these filters. ');
    const b = document.createElement('button'); b.className = 'alink'; b.textContent = '✕ Clear filters';
    b.addEventListener('click', () => {
      hatchSearch.value = ''; hatchNewOnly = false; setSwitch(hatchNewBtn, false);
      save(); renderHatch();
    });
    h.appendChild(b);
    list.appendChild(h);
    return;
  }
  for (const r of rows) {
    const expanded = hatchOpen === r.p.k;
    const card = document.createElement('button'); card.className = 'hcard' + (expanded ? ' expanded' : ''); card.type = 'button';
    card.setAttribute('aria-expanded', String(expanded));
    // aria-controls, so the card says WHAT it expands — the panel is a sibling
    // appended after it, a relationship nothing else made programmatic
    const panelId = 'hpanel-' + r.p.k;
    card.setAttribute('aria-controls', panelId);
    // so the re-render this press triggers can find the same card again
    card.dataset.k = r.p.k;
    // decorative and inert: clickable art inside a button is a second action no
    // keyboard can reach and none announces, and a non-decorative alt made every
    // card announce its species twice (DESIGN.md §4)
    card.appendChild(icon(r.p, 40, false, true));
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.p.n; card.appendChild(nm);
    if (r.p.rar >= 5) card.appendChild(tierBadge(r.p));
    if (r.isNew) { const nb = document.createElement('span'); nb.className = 'newb'; nb.textContent = 'NEW'; card.appendChild(nb); }
    const ways = document.createElement('span'); ways.className = 'ways';
    ways.textContent = r.gen === 1 ? r.ways + (r.ways === 1 ? ' pair' : ' pairs') : r.gen + ' steps';
    card.appendChild(ways);
    card.title = (expanded ? 'Hide' : 'Show') + (r.gen === 1 ? ` the pairs that produce ${r.p.n}` : ` a breeding chain to ${r.p.n}`);
    card.addEventListener('click', () => {
      hatchOpen = expanded ? null : r.p.k;
      renderHatch();
      // renderHatch wipes the whole list, so the card just pressed is gone and
      // focus fell to <body> on every open AND every close — on the view's one
      // interaction (DESIGN.md §9)
      const again = list.querySelector(`.hcard[data-k="${CSS.escape(r.p.k)}"]`);
      if (again) again.focus();
    });
    list.appendChild(card);
    if (expanded) {
      const panel = r.gen === 1 ? hatchPanel(r) : hatchChainPanel(r, kids, ownSet);
      panel.id = panelId;
      list.appendChild(panel);
    }
  }
}
// rebuild one concrete chain to a multi-step species from its witness pairs;
// owned species terminate the recursion, so steps come out hatch-order
function chainStepsFor(k, kids, ownSet) {
  const steps = [], seen = new Set();
  const mkStep = (aK, bK, cK) => {
    const res = breed(byKey.get(aK), byKey.get(bK));
    const c = res.children.find(x => x.pal.k === cK) || res.children[0];
    return {aK, bK, cK, kind: res.kind, ga: c.ga, gb: c.gb, pa: c.pa, pb: c.pb};
  };
  const build = key => {
    if (ownSet.has(key) || seen.has(key) || !kids.has(key)) return;
    seen.add(key);
    const e = kids.get(key);
    const [a, b] = e.gen === 1 ? e.pairs[0] : [e.wa, e.wb];
    build(a); build(b);
    steps.push(mkStep(a, b, key));
  };
  build(k);
  return steps;
}
function hatchChainPanel(r, kids, ownSet) {
  const panel = document.createElement('div'); panel.className = 'hatchpanel';
  const steps = chainStepsFor(r.p.k, kids, ownSet);
  const ttl = document.createElement('div'); ttl.className = 'hpttl';
  ttl.textContent = `One way to reach ${r.p.n} from your pals — ${steps.length} step${steps.length === 1 ? '' : 's'}:`;
  panel.appendChild(ttl);
  steps.forEach((s, i) => panel.appendChild(stepEl(s, {stepNo: i + 1, chain: steps, onOpen: () => openChainStep(steps, i)})));
  const lr = document.createElement('div'); lr.className = 'linkrow'; lr.style.justifyContent = 'flex-start';
  const planBtn = document.createElement('button'); planBtn.className = 'alink';
  planBtn.textContent = 'Plan this route ↗';
  planBtn.title = 'Open the Planner with this target, these starters, and owned-only partners — replaces current planner inputs';
  planBtn.addEventListener('click', () => {
    const bred = new Set(steps.map(s => s.cK));
    const leaves = [];
    for (const s of steps) for (const k of [s.aK, s.bK])
      if (!bred.has(k) && !leaves.includes(k)) leaves.push(k);
    const use = leaves.slice(0, 4);
    for (const n of SLOTS) {
      pickS[n].set(use[n - 1] ? byKey.get(use[n - 1]) : null, true);
      slotPassives[n] = []; slotGenders[n] = null;
    }
    renderSlotChips();
    pickPT.set(r.p, true);
    if (partnerMode !== 'mine') setPartnerMode('mine', true);
    setPlanMode('new');
    navTab('plan');
    save(); scheduleAuto();
    // navTab alone leaves focus on a button this navigation hides, so it fell to
    // <body>. Land on the control this press just set — the route itself arrives
    // 600ms later and announces itself through #planStatus (DESIGN.md §9).
    const el = document.querySelector('#pickPT .picker-btn');
    if (el) el.focus();
  });
  lr.appendChild(planBtn);
  panel.appendChild(lr);
  return panel;
}
function hatchPanel(r) {
  const panel = document.createElement('div'); panel.className = 'hatchpanel';
  const ttl = document.createElement('div'); ttl.className = 'hpttl';
  ttl.textContent = `Your pairs that produce ${r.p.n} — click one to load it in the Breed tab:`;
  panel.appendChild(ttl);
  const wrap = document.createElement('div'); wrap.className = 'pairs';
  for (const [aK, bK] of r.pairs) {
    const a = byKey.get(aK), b = byKey.get(bK);
    const row = document.createElement('button'); row.className = 'pair'; row.type = 'button';
    // decorative and inert: clickable art inside a button is a second action no
    // keyboard can reach and no screen reader announces. Find parents renders the
    // same art the same way — the button owns the press (DESIGN.md §4).
    const side = pal => {
      const s = document.createElement('span'); s.className = 'pside';
      s.appendChild(icon(pal, 32, false, true));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = pal.n; s.appendChild(nm);
      return s;
    };
    row.appendChild(side(a));
    // NVDA reads a bare U+00D7 as "times", turning the row into arithmetic
    const x = document.createElement('span'); x.className = 'x';
    x.setAttribute('aria-hidden', 'true'); x.textContent = '×'; row.appendChild(x);
    const and = document.createElement('span'); and.className = 'sr-only'; and.textContent = 'and';
    row.appendChild(and);
    row.appendChild(side(b));
    const issue = pairGenderIssue(aK, bK);
    if (issue) { const w = document.createElement('span'); w.className = 'warnchip'; w.append(lucide('triangleAlert', 13), genderize(issue)); row.appendChild(w); }
    row.addEventListener('click', () => { pickA.set(a, true); pickB.set(b, true); renderBreed(); navTab('breed'); });
    wrap.appendChild(row);
  }
  panel.appendChild(wrap);
  const lr = document.createElement('div'); lr.className = 'linkrow'; lr.style.justifyContent = 'flex-start';
  const all = document.createElement('button'); all.className = 'alink';
  all.textContent = `All parent pairs of ${r.p.n} ↗`;
  all.title = 'Open Find parents with every pair, not just your pals';
  all.addEventListener('click', () => { pickT.set(r.p, true); reverseShown = {}; renderReverse(); navTab('reverse'); });
  lr.appendChild(all);
  panel.appendChild(lr);
  return panel;
}

