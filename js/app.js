const DATA = window.PALDATA;
const IMG = 'assets/';
const PALS = DATA.pals;
const byKey = new Map(PALS.map(p => [p.k, p]));
const byName = new Map(PALS.map(p => [p.n.toLowerCase(), p]));
// deep links accept internal keys or display names (case-insensitive)
function resolvePal(x) {
  if (!x) return null;
  if (byKey.has(x)) return byKey.get(x);
  try { x = decodeURIComponent(x); } catch {}
  return byName.get(x.toLowerCase()) || null;
}
const TYPE_COLORS = {normal:'var(--neutral)',fire:'var(--fire)',water:'var(--water)',electric:'var(--electric)',grass:'var(--grass)',dark:'var(--dark)',dragon:'var(--dragon)',ground:'var(--ground)',ice:'var(--ice)'};
const WORKS = {kindling:'🔥 Kindling',watering:'💧 Watering',planting:'🌱 Planting',generatingElectricity:'⚡ Electricity',handiwork:'🛠️ Handiwork',gathering:'🧺 Gathering',lumbering:'🪓 Lumbering',mining:'⛏️ Mining',medicineProduction:'💊 Medicine',cooling:'❄️ Cooling',transporting:'📦 Transporting',farming:'🐄 Farming'};
const workIcon = k => (WORKS[k] || k).split(' ')[0];
// honor prefers-reduced-motion in JS-driven scrolls (CSS handles animations)
const SMOOTH = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// ---------- toasts (aria-live region) & switch helper ----------
const toastsEl = document.getElementById('toasts');
function toast(msg, undoFn, action) {
  const t = document.createElement('div'); t.className = 'toast';
  const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
  let timer;
  const dismiss = () => { clearTimeout(timer); t.remove(); };
  if (undoFn) {
    const u = document.createElement('button'); u.className = 'undo'; u.textContent = 'Undo';
    u.addEventListener('click', () => { undoFn(); dismiss(); });
    t.appendChild(u);
  }
  if (action) {
    const a = document.createElement('button'); a.className = 'undo'; a.textContent = action.label;
    a.addEventListener('click', () => { action.fn(); dismiss(); });
    t.appendChild(a);
  }
  const x = document.createElement('button'); x.className = 'tx'; x.textContent = '✕'; x.setAttribute('aria-label', 'Dismiss notification');
  x.addEventListener('click', dismiss);
  t.appendChild(x);
  timer = setTimeout(dismiss, undoFn || action ? 8000 : 3500);
  toastsEl.appendChild(t);
}
function setSwitch(el, on) { el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }

// ---------- first-run setup checklist ----------
// chips mark themselves done from real signals; all three done → gone for good
function updateChecklist() {
  const bar = document.getElementById('setupbar');
  if (!bar || bar.hidden) return;
  const done = {
    star: ownedSpeciesSet().size > 0,
    breed: !!localStorage.getItem('palbreed_bred'),
    plan: plans.length > 0,
  };
  let all = true;
  for (const b of bar.querySelectorAll('.step')) {
    const d = !!done[b.dataset.su];
    const base = b.dataset.base || (b.dataset.base = b.textContent);
    b.classList.toggle('done', d);
    b.textContent = d ? '✓ ' + base : base;
    all = all && d;
  }
  if (all) { bar.hidden = true; localStorage.setItem('palbreed_tipseen', '1'); }
}

const pairKey = (a,b) => a < b ? a+'|'+b : b+'|'+a;
const comboByPair = new Map(), comboByChild = new Map();
for (const c of DATA.combos) {
  const pk = pairKey(c.a, c.b);
  (comboByPair.get(pk) || comboByPair.set(pk, []).get(pk)).push(c);
  (comboByChild.get(c.c) || comboByChild.set(c.c, []).get(c.c)).push(c);
}
const uniqueChildren = new Set(DATA.combos.map(c => c.c));
const CANDS = PALS.filter(p => !p.ic && !uniqueChildren.has(p.k)).sort((x,y) => x.r - y.r);

function nearestByRank(target) {
  let lo = 0, hi = CANDS.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; CANDS[mid].r < target ? lo = mid + 1 : hi = mid; }
  let best = CANDS[lo], bd = Math.abs(best.r - target);
  const consider = p => { const d = Math.abs(p.r - target); if (d < bd || (d === bd && p.pr > best.pr)) { best = p; bd = d; } };
  for (let i = lo - 1; i >= 0 && target - CANDS[i].r <= bd; i--) consider(CANDS[i]);
  for (let i = lo + 1; i < CANDS.length && CANDS[i].r - target <= bd; i++) consider(CANDS[i]);
  return best;
}
function breed(a, b) {
  if (a.k === b.k) return {kind:'same', children:[{pal:a}]};
  const combos = comboByPair.get(pairKey(a.k, b.k)) || [];
  if (combos.length) {
    const plain = combos.filter(c => !c.ga);
    if (plain.length) return {kind:'unique', children:[{pal: byKey.get(plain[0].c)}]};
    return {kind:'gender', children: combos.map(c => ({pal: byKey.get(c.c), ga:c.ga, gb:c.gb, pa:c.a, pb:c.b}))};
  }
  const target = Math.floor((a.r + b.r + 1) / 2);
  return {kind:'avg', children:[{pal: nearestByRank(target)}], target};
}

// ---------- owned set ----------
const owned = new Set(JSON.parse(localStorage.getItem('palbreed_owned') || '[]'));
function toggleOwned(k) {
  owned.has(k) ? owned.delete(k) : owned.add(k);
  localStorage.setItem('palbreed_owned', JSON.stringify([...owned]));
  scheduleAuto(); // owned pool feeds the planner's partner list
  updateChecklist();
}

// ---------- recently picked pals (shared across all pickers) ----------
let recentPicks = JSON.parse(localStorage.getItem('palbreed_recents') || '[]').filter(k => byKey.has(k));
function pushRecent(k) {
  recentPicks = [k, ...recentPicks.filter(x => x !== k)].slice(0, 8);
  localStorage.setItem('palbreed_recents', JSON.stringify(recentPicks));
}

// ---------- shared rendering ----------
function icon(p, size, clickable) {
  const img = document.createElement('img');
  img.className = 'pico' + (clickable ? ' click' : '');
  img.width = size; img.height = size;
  img.draggable = false;
  img.loading = 'lazy'; img.src = IMG + p.img; img.alt = p.n;
  if (clickable) { img.title = 'View ' + p.n; img.addEventListener('click', e => { e.stopPropagation(); openModal(p); }); }
  img.onerror = () => {
    const d = document.createElement('div');
    d.className = 'pico f' + (clickable ? ' click' : ''); d.style.width = d.style.height = size+'px'; d.textContent = p.n[0];
    if (clickable) d.addEventListener('click', e => { e.stopPropagation(); openModal(p); });
    img.replaceWith(d);
  };
  return img;
}
const zk = p => p.cb ? '#T' + (p.z - 899) : '#' + p.z + (p.zs || '');
const pretty = s => s.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
const tierOf = r => r >= 20 ? 'legendary' : r >= 8 ? 'epic' : r >= 5 ? 'rare' : 'common';
function tierBadge(p) {
  const t = tierOf(p.rar);
  const s = document.createElement('span'); s.className = 'tier ' + t; s.textContent = t; s.title = 'Rarity ' + p.rar;
  return s;
}
const EGG_NAMES = {normal:'Common', fire:'Scorching', water:'Damp', grass:'Verdant', electric:'Electric', ice:'Frozen', ground:'Rocky', dark:'Dark', dragon:'Dragon'};
const eggOf = p => (p.rar >= 8 ? 'Huge ' : p.rar >= 5 ? 'Large ' : '') + (EGG_NAMES[p.t[0]] || 'Common') + ' Egg';
function eggChip(p) {
  const c = document.createElement('span'); c.className = 'mchip';
  c.textContent = '🥚 ' + eggOf(p);
  c.title = 'Egg this pal hatches from (bigger and rarer eggs incubate longer — match its temperature preference to speed up)';
  return c;
}
function typeDots(p) {
  const w = document.createElement('span'); w.className = 'types';
  for (const t of p.t) { const d = document.createElement('i'); d.className = 'dot'; d.style.background = TYPE_COLORS[t] || 'var(--muted)'; d.title = t; w.appendChild(d); }
  return w;
}
function typeChips(p) {
  const f = document.createDocumentFragment();
  for (const t of p.t) { const c = document.createElement('span'); c.className = 'chip'; c.style.background = TYPE_COLORS[t] || 'var(--muted)'; c.textContent = t; f.appendChild(c); }
  return f;
}
function worksEl(p, highlightKey) {
  const w = document.createElement('div'); w.className = 'works';
  for (const [k,v] of Object.entries(p.w || {}).sort((a,b) => b[1]-a[1])) {
    const s = document.createElement('span'); s.textContent = (WORKS[k] || k) + ' ' + v; s.title = pretty(k);
    if (k === highlightKey) s.className = 'hot';
    w.appendChild(s);
  }
  if (!w.children.length) { const s = document.createElement('span'); s.textContent = 'No base work'; w.appendChild(s); }
  return w;
}
function genderBar(p) {
  const g = document.createElement('div'); g.className = 'gbar';
  const tr = document.createElement('span'); tr.className = 'gtrack';
  const i = document.createElement('i'); i.style.width = p.m + '%'; tr.appendChild(i);
  const lab = document.createElement('span'); lab.textContent = `♂ ${p.m}% · ♀ ${100 - p.m}%`;
  g.append(tr, lab); return g;
}

// ---------- modal ----------
const overlay = document.getElementById('overlay');
const modalEl = document.getElementById('modal');
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal(); });
let currentModalPal = null, lastFocusModal = null, modalPushed = false;
// keepHistory: the caller is navigating anyway (hash change / navTab), so leave
// the history stack alone; otherwise pop the entry the modal pushed so Back
// behaves as if the modal was never opened.
function closeModal(keepHistory) {
  if (!overlay.classList.contains('open')) { modalPushed = false; return; }
  overlay.classList.remove('open'); document.body.style.overflow = '';
  currentModalPal = null;
  if (lastFocusModal && document.contains(lastFocusModal)) lastFocusModal.focus();
  lastFocusModal = null;
  if (keepHistory) { modalPushed = false; return; }
  if (modalPushed) { modalPushed = false; history.back(); }
  else if (location.hash.startsWith('#/pal/')) history.replaceState(null, '', '#/' + currentTab);
}
// close without touching history, then point the hash back at the current tab
// (used when another overlay opens on top, e.g. the roster editor)
function leaveModal() {
  closeModal(true);
  if (location.hash.startsWith('#/pal/')) history.replaceState(null, '', '#/' + currentTab);
}
document.addEventListener('keydown', e => {
  if (!overlay.classList.contains('open') || roverlayOpen()) return;
  if (openPicker || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const idx = PALS.indexOf(currentModalPal);
    if (idx < 0) return;
    openModal(PALS[(idx + (e.key === 'ArrowRight' ? 1 : -1) + PALS.length) % PALS.length]);
  }
});
function roverlayOpen() { const r = document.getElementById('roverlay'); return r && r.classList.contains('open'); }
function sec(title) { const s = document.createElement('div'); s.className = 'msec'; const h = document.createElement('h3'); h.textContent = title; s.appendChild(h); return s; }

function openModal(p) {
  const wasOpen = overlay.classList.contains('open');
  if (!wasOpen) lastFocusModal = document.activeElement;
  currentModalPal = p;
  modalEl.setAttribute('aria-label', p.n + ' details');
  modalEl.innerHTML = '';
  const close = document.createElement('button'); close.className = 'close'; close.textContent = '✕';
  close.setAttribute('aria-label', 'Close dialog'); close.addEventListener('click', closeModal);
  modalEl.appendChild(close);
  const idx = PALS.indexOf(p);
  const mkNav = (label, delta, cls, sym) => {
    const b = document.createElement('button'); b.className = 'mnav ' + cls; b.type = 'button';
    b.textContent = sym; b.title = label + ' (arrow keys)'; b.setAttribute('aria-label', label);
    b.addEventListener('click', () => openModal(PALS[(idx + delta + PALS.length) % PALS.length]));
    return b;
  };
  modalEl.append(mkNav('Previous pal', -1, 'prev', '‹'), mkNav('Next pal', 1, 'next', '›'));

  const head = document.createElement('div'); head.className = 'mhead';
  head.appendChild(icon(p, 96));
  const hb = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = p.n;
  const z = document.createElement('span'); z.className = 'zk'; z.textContent = zk(p); h2.appendChild(z);
  const star = document.createElement('button'); star.className = 'star' + (owned.has(p.k) ? ' on' : '');
  star.textContent = owned.has(p.k) ? '★' : '☆'; star.title = 'Mark as owned';
  star.setAttribute('aria-label', 'Mark ' + p.n + ' as owned'); star.setAttribute('aria-pressed', String(owned.has(p.k)));
  star.addEventListener('click', () => {
    toggleOwned(p.k); star.classList.toggle('on'); star.textContent = owned.has(p.k) ? '★' : '☆';
    star.setAttribute('aria-pressed', String(owned.has(p.k)));
    renderDex(); renderReverse();
  });
  h2.appendChild(star);
  hb.appendChild(h2);
  const crow = document.createElement('div'); crow.className = 'crow';
  crow.appendChild(typeChips(p));
  crow.appendChild(tierBadge(p));
  const meta = [`Size ${p.sz}`]; if (p.noct) meta.push('🌙 Nocturnal'); if (p.cb) meta.push('🌳 Terraria collab');
  for (const m of meta) { const c = document.createElement('span'); c.className = 'mchip'; c.textContent = m; crow.appendChild(c); }
  hb.appendChild(crow);
  hb.appendChild(genderBar(p));
  head.appendChild(hb);
  modalEl.appendChild(head);

  if (p.d) { const d = document.createElement('div'); d.className = 'mdesc'; d.textContent = p.d; modalEl.appendChild(d); }

  // breeding meta + actions
  const bs = sec('Breeding');
  const bm = document.createElement('div'); bm.className = 'breedmeta';
  const power = document.createElement('span'); power.className = 'mchip'; power.textContent = 'Breeding power ' + p.r; bm.appendChild(power);
  bm.appendChild(eggChip(p));
  if (p.ic || uniqueChildren.has(p.k)) {
    const u = document.createElement('span'); u.className = 'badge unique'; u.textContent = 'Unique combos only'; bm.appendChild(u);
  }
  bs.appendChild(bm);
  const btns = document.createElement('div'); btns.className = 'mbtns';
  const mkBtn = (label, primary, fn) => { const b = document.createElement('button'); b.className = 'alink' + (primary ? ' primary' : ''); b.textContent = label; b.addEventListener('click', fn); return b; };
  btns.appendChild(mkBtn('Find parents', true, () => { closeModal(true); pickT.set(p, true); reverseShown = 120; renderReverse(); navTab('reverse'); }));
  btns.appendChild(mkBtn('Set as Parent 1', false, () => { closeModal(true); pickA.set(p, true); renderBreed(); navTab('breed'); }));
  btns.appendChild(mkBtn('Set as Parent 2', false, () => { closeModal(true); pickB.set(p, true); renderBreed(); navTab('breed'); }));
  btns.appendChild(mkBtn('Plan route to this', false, () => { closeModal(true); pickPT.set(p, true); navTab('plan'); scheduleAuto(); }));
  btns.appendChild(mkBtn('+ Add to roster', false, () => { leaveModal(); openRosterEditor(null, p); }));
  btns.appendChild(mkBtn('Copy link', false, async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0] + '#/pal/' + p.k);
      toast('Link to ' + p.n + ' copied');
    } catch { toast('Copy failed — clipboard blocked by browser'); }
  }));
  bs.appendChild(btns);
  modalEl.appendChild(bs);

  // stats
  const ss = sec('Stats');
  const grid = document.createElement('div'); grid.className = 'statgrid';
  const labels = ['HP', 'Attack', 'Defense', 'Support', 'Craft speed', 'Max stomach', 'Food amount', 'Gold value'];
  (p.st || []).forEach((v, i) => {
    const d = document.createElement('div'); d.className = 'stat';
    const l = document.createElement('div'); l.className = 'lb'; l.textContent = labels[i];
    const val = document.createElement('div'); val.className = 'vl'; val.textContent = i === 6 ? '🍖'.repeat(Math.min(v, 8)) || v : v;
    d.append(l, val); grid.appendChild(d);
  });
  ss.appendChild(grid);
  modalEl.appendChild(ss);

  // work
  const ws = sec('Work suitability');
  ws.appendChild(worksEl(p));
  modalEl.appendChild(ws);

  // partner skill
  if (p.ps) {
    const ps = sec('Partner skill');
    const card = document.createElement('div'); card.className = 'pskill';
    const n = document.createElement('div'); n.className = 'psn'; n.textContent = p.ps.n; card.appendChild(n);
    if (p.ps.t.length) {
      const tt = document.createElement('div'); tt.className = 'pst';
      for (const t of p.ps.t) { const c = document.createElement('span'); c.className = 'mchip'; c.textContent = t; tt.appendChild(c); }
      card.appendChild(tt);
    }
    const d = document.createElement('div'); d.className = 'psd'; d.textContent = p.ps.d; card.appendChild(d);
    if (p.ps.re && p.ps.re.length && p.ps.rl.length) {
      const tbl = document.createElement('table'); tbl.className = 'ranktbl';
      const thead = document.createElement('thead'); const hr = document.createElement('tr');
      const th0 = document.createElement('th'); th0.textContent = 'Rank'; hr.appendChild(th0);
      for (const l of p.ps.rl) { const th = document.createElement('th'); th.textContent = l; hr.appendChild(th); }
      thead.appendChild(hr); tbl.appendChild(thead);
      const tb = document.createElement('tbody');
      p.ps.re.forEach((row, ri) => {
        const tr = document.createElement('tr');
        const td0 = document.createElement('td'); td0.textContent = ri + 1; tr.appendChild(td0);
        const vals = new Map();
        for (const [li, v] of row) vals.set(li, vals.has(li) ? vals.get(li) + ' / ' + v : String(v));
        p.ps.rl.forEach((_, li) => { const td = document.createElement('td'); td.textContent = vals.has(li) ? vals.get(li) : '—'; tr.appendChild(td); });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb); card.appendChild(tbl);
    }
    ps.appendChild(card);
    modalEl.appendChild(ps);
  }

  // drops
  if (p.dr && p.dr.length) {
    const ds = sec('Drops');
    const dl = document.createElement('div'); dl.className = 'droplist';
    for (const [item, rate, mn, mx] of p.dr) {
      const c = document.createElement('span'); c.className = 'mchip';
      c.textContent = `${pretty(item)} ×${mn === mx ? mn : mn + '–' + mx} (${rate}%)`;
      dl.appendChild(c);
    }
    ds.appendChild(dl);
    modalEl.appendChild(ds);
  }

  overlay.classList.add('open');
  overlay.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if (!wasOpen) close.focus();
  // reflect the open pal in the URL so browser Back closes the modal
  const ph = '#/pal/' + p.k;
  if (location.hash !== ph) {
    // hash already points at this pal under a non-canonical name (#/pal/anubis):
    // pushing would make Back land on that alias and reopen the modal
    const aliasSame = location.hash.startsWith('#/pal/') && resolvePal(location.hash.slice(6))?.k === p.k;
    if (wasOpen || modalPushed || aliasSame) history.replaceState(null, '', ph);
    else { history.pushState(null, '', ph); modalPushed = true; }
  }
}

// ---------- picker ----------
let openPicker = null;
document.addEventListener('click', e => { if (openPicker && !openPicker.root.contains(e.target)) openPicker.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openPicker) openPicker.close(); });

function makePicker(mount, {placeholder, allowClear, onChange, ownedToggle, ariaLabel}) {
  const root = document.createElement('div'); root.className = 'picker';
  const btn = document.createElement('button'); btn.className = 'picker-btn'; btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const pop = document.createElement('div'); pop.className = 'pop';
  const inp = document.createElement('input'); inp.placeholder = 'Search…'; inp.setAttribute('aria-label', 'Search pals');
  const list = document.createElement('div'); list.className = 'list'; list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Matching pals');
  let ownedOnlyPick = false, srcAll = null, srcOwn = null;
  pop.appendChild(inp);
  if (ownedToggle) {
    const row = document.createElement('div'); row.className = 'srcrow';
    srcAll = document.createElement('button'); srcAll.type = 'button'; srcAll.textContent = 'All pals'; srcAll.className = 'on';
    srcOwn = document.createElement('button'); srcOwn.type = 'button';
    const setSrc = v => { ownedOnlyPick = v; srcAll.classList.toggle('on', !v); srcOwn.classList.toggle('on', v); renderList(); inp.focus(); };
    srcAll.addEventListener('click', () => setSrc(false));
    srcOwn.addEventListener('click', () => setSrc(true));
    row.append(srcAll, srcOwn); pop.appendChild(row);
  }
  pop.appendChild(list); root.append(btn, pop); mount.appendChild(root);

  let sel = null, hl = 0, rows = [];
  const api = { root, get: () => sel,
    set(p, silent) { sel = p; renderBtn(); if (p && !silent) pushRecent(p.k); if (!silent) onChange && onChange(p); },
    close() {
      // if focus is inside the popup (keyboard select, Escape, row click), hand it
      // back to the trigger button so keyboard users aren't dropped at <body>.
      // Deferred: focusing the button during the Enter keydown would make the
      // browser deliver the synthesized click to it and reopen the popup.
      const inside = root.contains(document.activeElement);
      root.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      if (openPicker === api) openPicker = null;
      if (inside) setTimeout(() => { if (!root.classList.contains('open')) btn.focus(); }, 0);
    } };

  function renderBtn() {
    btn.innerHTML = '';
    btn.setAttribute('aria-label', (ariaLabel || placeholder) + ': ' + (sel ? sel.n : 'none selected'));
    if (!sel) {
      const s = document.createElement('span'); s.className = 'ph'; s.textContent = placeholder; btn.appendChild(s);
      const c = document.createElement('span'); c.className = 'caret'; c.textContent = '▾'; btn.appendChild(c);
    } else {
      const box = document.createElement('span'); box.className = 'sel';
      box.appendChild(icon(sel, 34));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = sel.n;
      const z = document.createElement('span'); z.className = 'zk'; z.textContent = zk(sel);
      box.append(nm, z); btn.appendChild(box);
      if (allowClear) {
        const x = document.createElement('span'); x.className = 'clear'; x.textContent = '✕'; x.title = 'Clear';
        x.addEventListener('click', e => { e.stopPropagation(); api.set(null); });
        btn.appendChild(x);
      }
    }
  }
  function renderList() {
    const q = inp.value.trim().toLowerCase();
    list.innerHTML = ''; rows = []; hl = 0;
    const os = ownedSpeciesSet();
    if (srcOwn) srcOwn.textContent = `★ Owned (${os.size})`;
    const addRow = p => {
      const r = document.createElement('button'); r.className = 'row'; r.type = 'button';
      r.setAttribute('role', 'option'); r.setAttribute('aria-selected', String(!!(sel && sel.k === p.k)));
      r.appendChild(icon(p, 30));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.n;
      const z = document.createElement('span'); z.className = 'zk'; z.textContent = zk(p);
      r.append(nm, z);
      if (os.has(p.k)) { const o = document.createElement('span'); o.className = 'own'; o.textContent = '★'; o.title = 'Owned'; r.appendChild(o); }
      r.appendChild(typeDots(p));
      // close first: close() schedules its deferred refocus before any popup a
      // set() side effect opens (e.g. Parent 2 auto-open), which must win focus
      r.addEventListener('click', () => { api.close(); api.set(p); });
      list.appendChild(r); rows.push({el:r, p});
    };
    const addGroup = label => {
      const g = document.createElement('div'); g.className = 'lgroup'; g.textContent = label;
      g.setAttribute('aria-hidden', 'true'); list.appendChild(g);
    };
    const matches = PALS.filter(p => (!ownedOnlyPick || os.has(p.k))
      && (!q || p.n.toLowerCase().includes(q) || zk(p).includes(q) || p.t.some(t => t.startsWith(q))));
    const recent = q ? [] : recentPicks.map(k => byKey.get(k)).filter(p => p && (!ownedOnlyPick || os.has(p.k)));
    if (!matches.length && !recent.length) {
      const e = document.createElement('div'); e.className = 'empty';
      e.textContent = ownedOnlyPick && !os.size ? 'No owned pals yet — star some in the Paldex or add roster pals.' : 'No pals match.';
      list.appendChild(e); return;
    }
    if (recent.length) { addGroup('Recent'); recent.forEach(addRow); addGroup('All pals'); }
    matches.forEach(addRow);
    highlight(0);
  }
  function highlight(i) {
    if (!rows.length) return;
    hl = Math.max(0, Math.min(rows.length - 1, i));
    rows.forEach((r, j) => r.el.classList.toggle('hl', j === hl));
    rows[hl].el.scrollIntoView({block:'nearest'});
  }
  api.openPop = () => {
    if (openPicker && openPicker !== api) openPicker.close();
    root.classList.add('open'); openPicker = api;
    btn.setAttribute('aria-expanded', 'true');
    pop.style.left = ''; pop.style.right = '';
    pop.classList.toggle('flip', root.getBoundingClientRect().left + 340 > window.innerWidth - 12);
    inp.value = ''; renderList(); inp.focus();
    // clamp to the viewport — on narrow screens flip can push the popup off-screen
    const pr = pop.getBoundingClientRect(), rr = root.getBoundingClientRect();
    if (pr.left < 8) { pop.style.left = (8 - rr.left) + 'px'; pop.style.right = 'auto'; }
    else if (pr.right > window.innerWidth - 8) { pop.style.left = 'auto'; pop.style.right = (rr.right - (window.innerWidth - 8)) + 'px'; }
  };
  btn.addEventListener('click', () => { root.classList.contains('open') ? api.close() : api.openPop(); });
  inp.addEventListener('input', renderList);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(hl + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(hl - 1); }
    else if (e.key === 'Enter' && rows.length) { api.close(); api.set(rows[hl].p); }
  });
  renderBtn();
  return api;
}

// ---------- layout: keep sticky offsets in sync with real header height ----------
const headerEl = document.querySelector('header');
function syncHeaderHeight() {
  document.documentElement.style.setProperty('--hh', headerEl.offsetHeight + 'px');
}
new ResizeObserver(syncHeaderHeight).observe(headerEl);
syncHeaderHeight();
// fade the tab bar's clipped edge on narrow screens so hidden tabs are discoverable
const tabsFadeEl = document.getElementById('tabs');
function updateTabsFade() {
  tabsFadeEl.classList.toggle('fadeL', tabsFadeEl.scrollLeft > 4);
  tabsFadeEl.classList.toggle('fadeR', tabsFadeEl.scrollLeft + tabsFadeEl.clientWidth < tabsFadeEl.scrollWidth - 4);
}
tabsFadeEl.addEventListener('scroll', updateTabsFade, {passive: true});
new ResizeObserver(updateTabsFade).observe(tabsFadeEl);
updateTabsFade();

// ---------- state ----------
const state = JSON.parse(localStorage.getItem('palbreed') || '{}');
function save() {
  const s = {
    tab: currentTab, a: pickA.get()?.k, b: pickB.get()?.k, t: pickT.get()?.k, l: pickL.get()?.k,
    ownedOnly, dexOwnedOnly, rgroup: typeof groupBySpecies !== 'undefined' && groupBySpecies,
    pt: pickPT.get()?.k, po: partnerOwnedOnly, ac: avoidCollab, sp: slotPassives, sg: slotGenders,
    dp: desiredPick.get(),
    ro: !!currentRoute, chain: breedChain,
    hn: typeof hatchNewOnly !== 'undefined' && hatchNewOnly,
    dt: dexType.value, dw: dexWork.value, dsort: dexSort,
  };
  for (const n of SLOTS) s['s' + n] = pickS[n].get()?.k;
  localStorage.setItem('palbreed', JSON.stringify(s));
  updateHash();
}

// ---------- tabs ----------
let currentTab = 'breed';
const tabsEl = document.getElementById('tabs');
function showTab(v) {
  currentTab = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  tabsEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on) b.scrollIntoView({block: 'nearest', inline: 'nearest'});
  });
  syncBottomNav(v);
  closeMoreSheet();
  if (v === 'hatch') renderHatch();
  save();
}
// in-app jumps push a history entry so Back returns to where you came from
function navTab(v) {
  if (currentTab !== v) history.pushState(null, '', '#/' + v);
  showTab(v);
}
// roving arrow-key navigation for role=tablist containers
function tablistKeys(container) {
  container.addEventListener('keydown', e => {
    const tabs = [...container.querySelectorAll('button')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let ni = null;
    if (e.key === 'ArrowRight') ni = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') ni = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') ni = 0;
    else if (e.key === 'End') ni = tabs.length - 1;
    if (ni === null) return;
    e.preventDefault(); tabs[ni].focus(); tabs[ni].click();
  });
}
tablistKeys(tabsEl);
// ---------- mobile bottom tab bar (≤640px; hidden by CSS elsewhere) ----------
const bottomNavEl = document.getElementById('bottomnav');
const moreSheetEl = document.getElementById('moresheet');
const moreBtnEl = document.getElementById('moreBtn');
const MORE_TABS = ['hatch', 'roster', 'dex', 'guide'];
function closeMoreSheet() {
  moreSheetEl.classList.remove('open');
  moreBtnEl.setAttribute('aria-expanded', 'false');
}
function syncBottomNav(v) {
  bottomNavEl.querySelectorAll('button[data-v]').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  moreBtnEl.classList.toggle('active', MORE_TABS.includes(v));
  moreSheetEl.querySelectorAll('button[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === v));
}
moreBtnEl.addEventListener('click', e => {
  e.stopPropagation(); // keep the document-level close handler from undoing the toggle
  const open = !moreSheetEl.classList.contains('open');
  moreSheetEl.classList.toggle('open', open);
  moreBtnEl.setAttribute('aria-expanded', String(open));
});
bottomNavEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (b) navTab(b.dataset.v);
});
moreSheetEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (b) navTab(b.dataset.v); // showTab closes the sheet
});
document.addEventListener('click', e => {
  if (moreSheetEl.classList.contains('open') && !moreSheetEl.contains(e.target)) closeMoreSheet();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMoreSheet(); });
// ---------- shareable URLs ----------
let booting = true;                    // suppress hash writes until init has applied the incoming hash
const initialHash = location.hash;
function planHash() {
  const ks = SLOTS.map(n => pickS[n].get()).filter(Boolean).map(p => p.k);
  const t = pickPT.get();
  return ks.length && t ? '#/plan/' + ks.join('+') + '/' + t.k : null;
}
function updateHash() {
  if (booting) return;
  if (overlay.classList.contains('open')) return; // the modal owns the hash (#/pal/…) while open
  let h = '#/' + currentTab;
  if (currentTab === 'breed') {
    const a = pickA.get(), b = pickB.get();
    if (a || b) h += '/' + (a ? a.k : '-') + '/' + (b ? b.k : '-');
  } else if (currentTab === 'reverse') {
    const t = pickT.get();
    if (t) h += '/' + t.k;
  } else if (currentTab === 'plan') {
    h = planHash() || h;
  }
  if (location.hash !== h) history.replaceState(null, '', h);
}
let lastBadLink = '';
function badLink(msg) {
  // hashchange + popstate both fire for one navigation — toast it once
  if (location.hash !== lastBadLink) { lastBadLink = location.hash; toast(msg); }
  return false;
}
function applyHash(hash) {
  const parts = (hash ?? location.hash).replace(/^#\/?/, '').split('/').filter(Boolean);
  if (!parts.length) return false;
  const [tab, x, y] = parts;
  if (tab === 'pal') {
    const p = resolvePal(x);
    if (!p) return badLink('Link not recognized — unknown pal' + (x ? ' “' + x + '”' : ''));
    showTab('dex'); openModal(p); return true;
  }
  // navigating anywhere else dismisses whichever dialog is up (browser Back = close)
  closeModal(true);
  if (roverlay.classList.contains('open')) closeRosterEditor();
  if (!document.getElementById('view-' + tab)) return badLink('Link not recognized');
  if (tab === 'plan' && x) {
    const ks = x.split('+').map(resolvePal).filter(Boolean).map(p => p.k).slice(0, 4);
    if (ks.length) {
      for (const n of SLOTS) {
        const k = ks[n - 1] || null;
        if ((pickS[n].get()?.k || null) !== k) {
          pickS[n].set(k ? byKey.get(k) : null, true);
          slotPassives[n] = []; slotGenders[n] = null;
        }
      }
      renderSlotChips();
    }
    const tp = resolvePal(y);
    if (tp) pickPT.set(tp, true);
    showTab('plan');
    if (ks.length && tp) computeRoute();
    return true;
  }
  if (tab === 'breed') {
    const a = resolvePal(x), b = resolvePal(y);
    if (a) pickA.set(a, true);
    if (b) pickB.set(b, true);
    renderBreed();
  } else if (tab === 'reverse' && resolvePal(x)) {
    pickT.set(resolvePal(x), true); reverseShown = 120; renderReverse();
  }
  showTab(tab);
  return true;
}
window.addEventListener('hashchange', () => applyHash());
tabsEl.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) navTab(b.dataset.v); // back/forward navigates tabs
});
window.addEventListener('popstate', () => applyHash());

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
}
function appendChainCard(zone, a, b) {
  if (!breedChain) return;
  const st = breedChain.steps[breedChain.idx];
  if (!st || !a || !b || pairKey(a.k, b.k) !== pairKey(st.aK, st.bK)) { breedChain = null; return; }
  const n = breedChain.steps.length;
  const target = byKey.get(breedChain.steps[n - 1].cK);
  const card = document.createElement('div'); card.className = 'chaincard';
  const head = document.createElement('div'); head.className = 'chainhead';
  const ttl = document.createElement('span'); ttl.className = 'ttl';
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
  };
  const mk = (txt, label, d, disabled) => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = txt;
    bt.setAttribute('aria-label', label); bt.disabled = disabled;
    bt.addEventListener('click', () => go(d));
    return bt;
  };
  nav.append(mk('◀ Prev step', 'Previous chain step', -1, breedChain.idx === 0),
             mk('Next step ▶', 'Next chain step', 1, breedChain.idx === n - 1));
  head.appendChild(nav);
  card.appendChild(head);
  card.appendChild(treeViewport(routeTree(breedChain.steps, breedChain.idx)));
  const exit = document.createElement('button'); exit.className = 'alink'; exit.textContent = '✕ Leave chain view';
  exit.addEventListener('click', () => { breedChain = null; renderBreed(); });
  card.appendChild(exit);
  zone.appendChild(card);
}

function childCard(p, opts = {}) {
  const card = document.createElement('div'); card.className = 'child-card clickable';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', 'View ' + p.n + ' details');
  card.title = 'View ' + p.n + '’s full card';
  card.addEventListener('click', () => openModal(p));
  card.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); openModal(p); } });
  card.appendChild(icon(p, 84));
  const body = document.createElement('div');
  const h = document.createElement('h2'); h.textContent = p.n;
  const z = document.createElement('span'); z.className = 'zk'; z.textContent = zk(p); h.appendChild(z);
  body.appendChild(h);
  const crow = document.createElement('div'); crow.className = 'crow';
  crow.appendChild(typeChips(p));
  if (opts.badge) { const bd = document.createElement('span'); bd.className = 'badge ' + opts.badge[0]; bd.textContent = opts.badge[1]; crow.appendChild(bd); }
  crow.appendChild(eggChip(p));
  body.appendChild(crow);
  if (opts.gtag) { const t = document.createElement('div'); t.className = 'gtag'; t.textContent = opts.gtag; body.appendChild(t); }
  body.appendChild(genderBar(p));
  body.appendChild(worksEl(p));
  card.appendChild(body);
  return card;
}
function renderBreed() {
  save();
  const zone = document.getElementById('breedResult');
  zone.innerHTML = '';
  const a = pickA.get(), b = pickB.get();
  if (!a || !b) {
    const h = document.createElement('div'); h.className = 'hint';
    h.textContent = 'Pick two parents to see their child. Click the result card for full details.';
    zone.appendChild(h);
    const lr = document.createElement('div'); lr.className = 'linkrow';
    const exA = PALS.find(p => p.n === 'Relaxaurus'), exB = PALS.find(p => p.n === 'Sparkit');
    if (exA && exB) {
      const ex = document.createElement('button'); ex.className = 'alink';
      ex.textContent = 'Try an example: Relaxaurus × Sparkit';
      ex.title = 'A unique combo — the gold UNIQUE badge means the pair ignores the breeding math';
      ex.addEventListener('click', () => { pickA.set(exA, true); pickB.set(exB, true); renderBreed(); });
      lr.appendChild(ex);
    }
    const rev = document.createElement('button'); rev.className = 'alink';
    rev.textContent = '…or work backwards from a target pal';
    rev.addEventListener('click', () => navTab('reverse'));
    lr.appendChild(rev);
    zone.appendChild(lr);
    return;
  }
  localStorage.setItem('palbreed_bred', '1'); updateChecklist();
  const res = breed(a, b);
  const mutNote = () => {
    const m = document.createElement('div'); m.className = 'mathline';
    m.append('🧬 ~1% of bred eggs mutate (3% with an Extravagant Vegetable Cake) — ');
    const g = document.createElement('button'); g.type = 'button'; g.className = 'alink gjump';
    g.textContent = 'Egg mutations ↗'; g.title = 'Open the Guide section on egg mutations';
    g.addEventListener('click', () => {
      navTab('guide');
      const d = document.getElementById('g-mutations');
      if (d) { d.open = true; d.scrollIntoView({block: 'start', behavior: SMOOTH}); }
    });
    m.appendChild(g);
    zone.appendChild(m);
  };
  if (res.kind === 'gender') {
    const note = document.createElement('div'); note.className = 'gender-note';
    note.textContent = 'This pair breeds differently depending on parent genders:';
    zone.appendChild(note);
    const wrap = document.createElement('div'); wrap.className = 'multi';
    for (const ch of res.children) {
      const pa = byKey.get(ch.pa), pb = byKey.get(ch.pb);
      const gsym = g => g === 'Male' ? '♂' : '♀';
      wrap.appendChild(childCard(ch.pal, {badge:['gender','Gender combo'], gtag:`${pa.n} ${gsym(ch.ga)} × ${pb.n} ${gsym(ch.gb)}`}));
    }
    zone.appendChild(wrap);
    mutNote();
    appendChainCard(zone, a, b);
    return;
  }
  const ch = res.children[0].pal;
  const badge = res.kind === 'unique' ? ['unique','Unique combo'] : res.kind === 'same' ? ['same','Same species'] : null;
  zone.appendChild(childCard(ch, {badge}));
  if (res.kind === 'avg') {
    const m = document.createElement('div'); m.className = 'mathline';
    m.innerHTML = `breeding power: <b>${a.r}</b> + <b>${b.r}</b> → target <b>${res.target}</b> → closest pal <b>${ch.n}</b> (${ch.r})`;
    zone.appendChild(m);
    const alts = CANDS.filter(c => c.k !== ch.k)
      .map(c => ({c, d: Math.abs(c.r - res.target)}))
      .sort((x, y) => x.d - y.d || y.c.pr - x.c.pr).slice(0, 2);
    if (alts.length) {
      const m2 = document.createElement('div'); m2.className = 'mathline';
      m2.textContent = 'next closest — they lose the tie to ' + ch.n + ': ' + alts.map(al => `${al.c.n} (${al.c.r})`).join(' · ');
      zone.appendChild(m2);
    }
  }
  mutNote();
  const lr = document.createElement('div'); lr.className = 'linkrow';
  const b2 = document.createElement('button'); b2.className = 'alink'; b2.textContent = `Find all parents of ${ch.n}`;
  b2.addEventListener('click', () => { pickT.set(ch, true); reverseShown = 120; renderReverse(); navTab('reverse'); });
  const b3 = document.createElement('button'); b3.className = 'alink'; b3.textContent = `Continue: breed ${ch.n} with…`;
  b3.title = 'Use this child as Parent 1 and pick its partner';
  b3.addEventListener('click', () => {
    breedChain = null;
    pickA.set(ch, true); pickB.set(null, true); renderBreed();
    setTimeout(() => pickB.openPop(), 0);
  });
  lr.append(b2, b3);
  zone.appendChild(lr);
  appendChainCard(zone, a, b);
}

// ---------- reverse view ----------
const pickT = makePicker(document.getElementById('pickT'), {placeholder:'Pick a species…', ariaLabel:'Target species', allowClear:true, ownedToggle:true, onChange:() => { reverseShown = 120; renderReverse(); }});
const pickL = makePicker(document.getElementById('pickL'), {placeholder:'Any parent', allowClear:true, ownedToggle:true, onChange:() => { reverseShown = 120; renderReverse(); }});
const pairFilter = document.getElementById('pairFilter');
pairFilter.addEventListener('input', () => { reverseShown = 120; renderReverse(); });
let reverseShown = 120;
let ownedOnly = false;
const ownedToggle = document.getElementById('ownedToggle');
ownedToggle.addEventListener('click', () => { ownedOnly = !ownedOnly; setSwitch(ownedToggle, ownedOnly); reverseShown = 120; renderReverse(); });

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
function renderReverse() {
  save();
  const zone = document.getElementById('reverseResult');
  zone.innerHTML = '';
  const t = pickT.get();
  if (!t) { zone.innerHTML = '<div class="hint">Pick a target pal to list every parent combination that produces it. Click any pal picture for its full card.</div>'; return; }
  const os = ownedSpeciesSet();
  let pairs = reversePairs(t);
  const total = pairs.length;
  const lock = pickL.get();
  if (lock) pairs = pairs.filter(p => p.a.k === lock.k || p.b.k === lock.k);
  if (ownedOnly) pairs = pairs.filter(p => os.has(p.a.k) && os.has(p.b.k));
  const q = pairFilter.value.trim().toLowerCase();
  if (q) pairs = pairs.filter(p => p.a.n.toLowerCase().includes(q) || p.b.n.toLowerCase().includes(q));
  // pairs you can actually make come first: own both, then own one, then the rest
  const ownScore = p => (os.has(p.a.k) ? 1 : 0) + (os.has(p.b.k) ? 1 : 0);
  pairs.sort((x, y) => ownScore(y) - ownScore(x) || (y.kind !== 'avg') - (x.kind !== 'avg') || x.a.z - y.a.z || x.b.z - y.b.z);
  const makeable = pairs.filter(p => ownScore(p) === 2).length;

  const sum = document.createElement('div'); sum.className = 'rsummary';
  const cnt = document.createElement('span'); cnt.className = 'cnt';
  cnt.textContent = `${pairs.length}${pairs.length !== total ? ' of ' + total : ''} combination${total === 1 ? '' : 's'}`;
  const sub = document.createElement('span'); sub.className = 'sub';
  sub.textContent = `produce ${t.n}` + (makeable && !ownedOnly ? ` · ★ ${makeable} makeable with your pals (listed first)` : '')
    + (pairs.length ? ' · tap a pair to open it in Breed' : '');
  sum.append(cnt, sub); zone.appendChild(sum);
  if (!pairs.length) {
    const h = document.createElement('div'); h.className = 'hint';
    if (ownedOnly && !os.size) {
      h.append('You haven’t starred any pals yet — mark owned pals in the ');
      const b = document.createElement('button'); b.className = 'alink'; b.textContent = 'Paldex';
      b.addEventListener('click', () => navTab('dex'));
      h.appendChild(b); h.append(' or add them to your Roster.');
    } else h.textContent = 'No combinations with these filters.';
    zone.appendChild(h); return;
  }

  const grid = document.createElement('div'); grid.className = 'pairs';
  const gsym = g => g === 'Male' ? ' ♂' : g === 'Female' ? ' ♀' : '';
  for (const p of pairs.slice(0, reverseShown)) {
    const row = document.createElement('button'); row.className = 'pair'; row.type = 'button';
    const side = (pal, g) => {
      const s = document.createElement('span'); s.className = 'pside';
      s.appendChild(icon(pal, 32, true));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = pal.n;
      s.appendChild(nm);
      if (os.has(pal.k)) { const o = document.createElement('span'); o.className = 'own'; o.textContent = '★'; o.title = 'Owned'; s.appendChild(o); }
      if (g) { const gg = document.createElement('span'); gg.className = 'g'; gg.textContent = gsym(g); s.appendChild(gg); }
      return s;
    };
    row.appendChild(side(p.a, p.ga));
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; row.appendChild(x);
    row.appendChild(side(p.b, p.gb));
    if (p.kind !== 'avg') {
      const bd = document.createElement('span');
      bd.className = 'badge ' + (p.kind === 'same' ? 'same' : p.kind === 'gender' ? 'gender' : 'unique');
      bd.textContent = p.kind === 'same' ? 'Same species' : p.kind === 'gender' ? 'Gender combo' : 'Unique';
      row.appendChild(bd);
    }
    if (ownedOnly) {
      const issue = pairGenderIssue(p.a.k, p.b.k);
      if (issue) { const w = document.createElement('span'); w.className = 'warnchip'; w.textContent = '⚠ ' + issue; row.appendChild(w); }
    }
    row.addEventListener('click', () => { pickA.set(p.a, true); pickB.set(p.b, true); renderBreed(); navTab('breed'); });
    grid.appendChild(row);
  }
  zone.appendChild(grid);
  if (pairs.length > reverseShown) {
    const m = document.createElement('button'); m.className = 'more';
    m.textContent = `Show ${Math.min(200, pairs.length - reverseShown)} more (${pairs.length - reverseShown} hidden)`;
    m.addEventListener('click', () => { reverseShown += 200; renderReverse(); });
    zone.appendChild(m);
  }
}

// ---------- planner: passive tag input ----------
const PASSIVES = DATA.passives || [];
// display order: regular passives alphabetically, mutation-exclusives last —
// raw data order would greet users with obscure boss passives first
const PASSIVES_SORTED = [...PASSIVES].sort((a, b) => (a.mt ? 1 : 0) - (b.mt ? 1 : 0) || a.n.localeCompare(b.n));
function makePassivePicker(mount, max = 4, onChange) {
  mount.classList.add('ptag');
  const inp = document.createElement('input'); inp.className = 'taginp'; inp.placeholder = 'Add passives (e.g. Artisan)…';
  inp.setAttribute('aria-label', 'Search and add passive skills');
  const pop = document.createElement('div'); pop.className = 'tpop';
  const chips = document.createElement('div'); chips.className = 'pchips';
  mount.append(inp, pop, chips);
  let selected = [];
  function renderChips() {
    chips.innerHTML = '';
    for (const n of selected) {
      const meta = PASSIVES.find(p => p.n === n);
      const c = document.createElement('button'); c.type = 'button';
      c.className = 'pchip' + (meta && meta.r < 0 ? ' neg' : '');
      c.textContent = n + ' ✕'; c.title = (meta && meta.e) || 'Remove';
      c.addEventListener('click', () => { selected = selected.filter(x => x !== n); renderChips(); onChange && onChange(); });
      chips.appendChild(c);
    }
  }
  function renderPop() {
    const q = inp.value.trim().toLowerCase();
    pop.innerHTML = '';
    const matches = PASSIVES_SORTED.filter(p => !selected.includes(p.n) && (!q || p.n.toLowerCase().includes(q))).slice(0, 30);
    if (!matches.length) { mount.classList.remove('open'); return; }
    for (const p of matches) {
      const r = document.createElement('button'); r.className = 'trow'; r.type = 'button';
      const nm = document.createElement('span'); nm.textContent = (p.mt ? '🧬 ' : '') + p.n;
      const tier = document.createElement('span'); tier.className = 'tr-r';
      tier.textContent = (p.r > 0 ? '+'.repeat(Math.min(p.r, 4)) : p.r < 0 ? '−'.repeat(Math.min(-p.r, 4)) : '·') + (p.e ? '  ' + p.e : '') + (p.mt ? '  (mutation-only)' : '');
      r.append(nm, tier);
      r.addEventListener('mousedown', e => e.preventDefault());
      r.addEventListener('click', () => {
        if (selected.length >= max) return;
        // close after each pick: a lingering full-width list would swallow the
        // next click on whatever sits beneath it (typing again reopens it)
        selected.push(p.n); renderChips(); inp.value = '';
        mount.classList.remove('open'); inp.focus();
        onChange && onChange();
      });
      pop.appendChild(r);
    }
    mount.classList.add('open');
  }
  inp.addEventListener('input', renderPop);
  inp.addEventListener('focus', renderPop);
  inp.addEventListener('click', () => { if (!mount.classList.contains('open')) renderPop(); });
  inp.addEventListener('blur', () => setTimeout(() => mount.classList.remove('open'), 150));
  return { get: () => [...selected], set(v) { selected = [...v]; renderChips(); }, clear() { selected = []; inp.value = ''; renderChips(); } };
}
function passiveChips(names, readonly = true) {
  const w = document.createElement('div'); w.className = 'pchips';
  for (const n of names) {
    const meta = PASSIVES.find(p => p.n === n);
    const c = document.createElement('span');
    c.className = 'pchip ro' + (meta && meta.r < 0 ? ' neg' : '');
    c.textContent = n; c.title = (meta && meta.e) || '';
    w.appendChild(c);
  }
  return w;
}

// ---------- roster ----------
let roster = JSON.parse(localStorage.getItem('palbreed_roster') || '[]')
  .filter(r => byKey.has(r.k)).map(r => ({g: null, nick: '', note: '', iv: null, ...r}));
function saveRoster() {
  localStorage.setItem('palbreed_roster', JSON.stringify(roster));
  scheduleAuto(); // roster changes partner passives/genders the route may use
  updateChecklist();
}
// gender feasibility from recorded roster genders (star-only species = unknown, no warning)
function speciesGenderInfo(k) {
  const es = roster.filter(r => r.k === k);
  if (!es.length) return null;
  return {n: es.length, M: es.filter(r => r.g === 'M').length, F: es.filter(r => r.g === 'F').length, U: es.filter(r => !r.g).length};
}
function pairGenderIssue(aK, bK) {
  const A = speciesGenderInfo(aK);
  if (aK === bK) {
    if (!A) return null;
    if (A.n < 2) return `needs two ${byKey.get(aK).n} (♂ + ♀) — you have 1`;
    if (!A.U && (!A.M || !A.F)) return `all your ${byKey.get(aK).n} are ${A.M ? '♂' : '♀'}`;
    return null;
  }
  const B = speciesGenderInfo(bK);
  if (!A || !B || A.U || B.U) return null;
  const aOne = (A.M && !A.F) || (!A.M && A.F), bOne = (B.M && !B.F) || (!B.M && B.F);
  if (aOne && bOne && !!A.M === !!B.M) return `both recorded ${A.M ? '♂' : '♀'}`;
  return null;
}
const pickR = makePicker(document.getElementById('pickR'), {placeholder:'Pick a species…', allowClear:true, ownedToggle:true, onChange: p => {
  if (p) { document.getElementById('rosterErr').hidden = true; pickR.root.querySelector('.picker-btn').classList.remove('invalid'); }
}});
const rosterPassives = makePassivePicker(document.getElementById('passivePick'));
const nickInp = document.getElementById('nickInp');
const noteInp = document.getElementById('noteInp');
const ivEls = ['ivH', 'ivA', 'ivD'].map(id => document.getElementById(id));
const moreDetails = document.getElementById('moreDetails');
const roverlay = document.getElementById('roverlay');
const rmTitle = document.getElementById('rmTitle');
let genderVal = '';
const genderSeg = document.getElementById('genderSeg');
function setGender(v) {
  genderVal = v || '';
  [...genderSeg.children].forEach(b => {
    b.classList.toggle('on', b.dataset.g === genderVal);
    b.setAttribute('aria-pressed', String(b.dataset.g === genderVal));
  });
}
genderSeg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setGender(b.dataset.g); });
const rosterAddBtn = document.getElementById('rosterAdd');
const rosterCancelBtn = document.getElementById('rosterCancel');
const gsymR = g => g === 'M' ? '♂' : g === 'F' ? '♀' : '';
let editingId = null;
function openRosterEditor(entry, presetPal) {
  editingId = entry ? entry.id : null;
  if (entry) {
    const p = byKey.get(entry.k);
    pickR.set(p, true); rosterPassives.set(entry.ps); setGender(entry.g);
    nickInp.value = entry.nick || ''; noteInp.value = entry.note || '';
    ivEls.forEach((e, i) => e.value = entry.iv && entry.iv[i] !== null ? entry.iv[i] : '');
    moreDetails.open = !!(entry.iv || entry.note);
    rmTitle.textContent = '✎ Editing ' + (entry.nick || p.n);
    rosterAddBtn.textContent = '✓ Save changes';
  } else {
    pickR.set(presetPal || null, true); rosterPassives.clear(); setGender('');
    nickInp.value = ''; noteInp.value = ''; ivEls.forEach(e => e.value = '');
    moreDetails.open = false;
    rmTitle.textContent = presetPal ? 'Add ' + presetPal.n + ' to roster' : 'Add a pal';
    rosterAddBtn.textContent = '+ Add to roster';
  }
  pickR.root.querySelector('.picker-btn').classList.remove('invalid');
  document.getElementById('rosterErr').hidden = true;
  document.getElementById('rosterAddAnother').style.display = entry ? 'none' : '';
  lastFocusEditor = document.activeElement;
  roverlay.classList.add('open'); roverlay.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  renderRoster();
  pickR.root.querySelector('.picker-btn').focus();
}
let lastFocusEditor = null;
function closeRosterEditor() {
  editingId = null;
  roverlay.classList.remove('open');
  document.body.style.overflow = '';
  renderRoster();
  if (lastFocusEditor && document.contains(lastFocusEditor)) lastFocusEditor.focus();
  lastFocusEditor = null;
}
// keep Tab cycling inside whichever dialog is open
function trapTab(e, container) {
  if (e.key !== 'Tab') return;
  const f = [...container.querySelectorAll('button,[href],input,select,summary,[tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', e => {
  if (roverlay.classList.contains('open')) trapTab(e, roverlay);
  else if (overlay.classList.contains('open')) trapTab(e, overlay);
});
document.getElementById('rmClose').addEventListener('click', closeRosterEditor);
document.getElementById('rosterOpenAdd').addEventListener('click', () => openRosterEditor(null));
roverlay.addEventListener('click', e => { if (e.target === roverlay) closeRosterEditor(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && roverlay.classList.contains('open')) closeRosterEditor(); });
function readIVs() {
  const vals = ivEls.map(e => e.value === '' ? null : Math.max(0, Math.min(100, +e.value)));
  return vals.every(v => v === null) ? null : vals;
}
rosterCancelBtn.addEventListener('click', closeRosterEditor);
function commitRosterEntry() {
  const p = pickR.get();
  if (!p) {
    pickR.root.querySelector('.picker-btn').classList.add('invalid');
    document.getElementById('rosterErr').hidden = false; // color alone isn't a message
    return null;
  }
  const entry = {k: p.k, ps: rosterPassives.get(), g: genderVal || null, nick: nickInp.value.trim(),
    note: noteInp.value.trim(), iv: readIVs()};
  if (editingId) {
    const r = roster.find(x => x.id === editingId);
    if (r) Object.assign(r, entry);
  } else {
    roster.push({id: Date.now() + '' + Math.floor(Math.random() * 1e4), ...entry});
  }
  if (!owned.has(p.k)) toggleOwned(p.k);
  saveRoster(); renderDex(); renderReverse();
  return p;
}
rosterAddBtn.addEventListener('click', () => {
  const wasEditing = !!editingId;
  const p = commitRosterEntry();
  if (!p) return;
  closeRosterEditor();
  toast(wasEditing ? 'Saved changes to ' + p.n : 'Added ' + p.n + ' to roster');
});
const rosterAddAnotherBtn = document.getElementById('rosterAddAnother');
rosterAddAnotherBtn.addEventListener('click', () => {
  const p = commitRosterEntry();
  if (!p) return;
  toast('Added ' + p.n + ' to roster');
  // keep the dialog open and the species selected — clear per-pal details for the next entry
  rosterPassives.clear(); setGender(''); nickInp.value = ''; noteInp.value = '';
  ivEls.forEach(e => e.value = ''); moreDetails.open = false;
  renderRoster();
});
const rosterSearch = document.getElementById('rosterSearch');
const rosterPassiveFilter = document.getElementById('rosterPassiveFilter');
const rosterSort = document.getElementById('rosterSort');
for (const ps of PASSIVES) {
  const o = document.createElement('option'); o.value = ps.n; o.textContent = ps.n; rosterPassiveFilter.appendChild(o);
}
rosterSearch.addEventListener('input', renderRoster);
rosterPassiveFilter.addEventListener('change', renderRoster);
rosterSort.addEventListener('change', renderRoster);
let groupBySpecies = false;
const groupToggle = document.getElementById('groupToggle');
groupToggle.addEventListener('click', () => {
  groupBySpecies = !groupBySpecies;
  setSwitch(groupToggle, groupBySpecies);
  save(); renderRoster();
});
const ivSum = r => (r.iv || []).reduce((a, b) => a + (b || 0), 0);
const ROSTER_SORTS = {
  z: (a, b) => byKey.get(a.k).z - byKey.get(b.k).z,
  n: (a, b) => byKey.get(a.k).n.localeCompare(byKey.get(b.k).n),
  new: (a, b) => +b.id.slice(0, 13) - +a.id.slice(0, 13),
  ps: (a, b) => b.ps.length - a.ps.length,
  iv: (a, b) => ivSum(b) - ivSum(a),
};

function renderRoster() {
  const list = document.getElementById('rosterList');
  const stats = document.getElementById('rosterStats');
  const species = new Set(roster.map(r => r.k));
  stats.textContent = roster.length ? `${roster.length} pal${roster.length === 1 ? '' : 's'} · ${species.size} species` : '';
  list.innerHTML = '';
  const q = rosterSearch.value.trim().toLowerCase();
  const pf = rosterPassiveFilter.value;
  let rows = roster.filter(r => {
    const p = byKey.get(r.k);
    const hit = !q || p.n.toLowerCase().includes(q) || (r.nick && r.nick.toLowerCase().includes(q)) || r.ps.some(x => x.toLowerCase().includes(q));
    return hit && (!pf || r.ps.includes(pf));
  });
  rows.sort(ROSTER_SORTS[rosterSort.value] || ROSTER_SORTS.z);
  if (!rows.length) {
    list.innerHTML = '<div class="hint" style="grid-column:1/-1;padding:14px 0">' +
      (roster.length ? 'No roster pals match these filters.' : 'No pals registered yet — hit "+ Add pal", or use "Add to roster" on any pal card.') + '</div>';
    renderRosterStrip(); return;
  }
  const mkActs = r => {
    const acts = document.createElement('div'); acts.className = 'acts';
    const b1 = document.createElement('button'); b1.textContent = '+ Start'; b1.title = 'Add to the next free Planner start slot';
    b1.addEventListener('click', () => setSlotAuto(r));
    const be = document.createElement('button'); be.textContent = '✎'; be.title = 'Edit';
    be.addEventListener('click', () => openRosterEditor(r));
    const bx = document.createElement('button'); bx.textContent = '✕'; bx.title = 'Remove from roster';
    bx.setAttribute('aria-label', 'Remove ' + (r.nick || byKey.get(r.k).n) + ' from roster');
    bx.addEventListener('click', () => {
      const idx = roster.findIndex(x => x.id === r.id);
      if (idx < 0) return;
      const removed = roster[idx];
      roster.splice(idx, 1); saveRoster(); renderRoster();
      const undo = () => {
        roster.splice(Math.min(idx, roster.length), 0, removed);
        saveRoster(); renderRoster(); renderDex(); renderReverse();
      };
      const name = removed.nick || byKey.get(removed.k).n;
      // last roster entry of a species: offer to also drop the owned ★
      if (!roster.some(x => x.k === removed.k) && owned.has(removed.k)) {
        toast('Removed ' + name + ' — species still ★ owned', undo, {
          label: 'Un-star ' + byKey.get(removed.k).n,
          fn: () => {
            if (owned.has(removed.k)) toggleOwned(removed.k);
            renderDex(); renderReverse();
            toast('Un-starred ' + byKey.get(removed.k).n);
          },
        });
      } else {
        toast('Removed ' + name + ' from roster', undo);
      }
    });
    acts.append(b1, be, bx);
    return acts;
  };
  const identity = r => {
    const nm = document.createElement('div'); nm.className = 'nm';
    if (r.g) { const g = document.createElement('span'); g.className = 'g ' + (r.g === 'M' ? 'gm' : 'gf'); g.textContent = gsymR(r.g) + ' '; nm.appendChild(g); }
    if (r.nick) { const nk = document.createElement('span'); nk.textContent = '“' + r.nick + '” '; nm.appendChild(nk); }
    if (r.iv) {
      const ivc = document.createElement('span'); ivc.className = 'ivchip';
      ivc.textContent = 'IV ' + r.iv.map(v => v === null ? '–' : v).join('·');
      ivc.title = 'HP · Attack · Defense IVs'; nm.appendChild(ivc);
    }
    return nm;
  };
  if (groupBySpecies) {
    const groups = new Map();
    for (const r of rows) (groups.get(r.k) || groups.set(r.k, []).get(r.k)).push(r);
    for (const [k, entries] of groups) {
      const p = byKey.get(k);
      const g = document.createElement('div'); g.className = 'rosgroup';
      const head = document.createElement('div'); head.className = 'ghead';
      head.appendChild(icon(p, 36, true));
      const nm = document.createElement('span'); nm.textContent = p.n; head.appendChild(nm);
      const cnt = document.createElement('span'); cnt.className = 'cntb'; cnt.textContent = '×' + entries.length; head.appendChild(cnt);
      g.appendChild(head);
      for (const r of entries) {
        const row = document.createElement('div'); row.className = 'gentry' + (r.id === editingId ? ' editing' : '');
        const who = document.createElement('span'); who.className = 'who';
        who.appendChild(identity(r));
        row.appendChild(who);
        if (r.ps.length) row.appendChild(passiveChips(r.ps));
        if (r.note) { const nt = document.createElement('span'); nt.className = 'nick'; nt.textContent = r.note; nt.title = r.note; row.appendChild(nt); }
        row.appendChild(mkActs(r));
        g.appendChild(row);
      }
      list.appendChild(g);
    }
  } else {
    for (const r of rows) {
      const p = byKey.get(r.k);
      const card = document.createElement('div'); card.className = 'rospal' + (r.id === editingId ? ' editing' : '');
      card.appendChild(icon(p, 44, true));
      const body = document.createElement('div'); body.className = 'body';
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = p.n + ' ';
      const id = identity(r);
      while (id.firstChild) nm.appendChild(id.firstChild);
      body.appendChild(nm);
      if (r.ps.length) body.appendChild(passiveChips(r.ps));
      if (r.note) { const nt = document.createElement('div'); nt.className = 'note'; nt.textContent = r.note; body.appendChild(nt); }
      card.appendChild(body);
      card.appendChild(mkActs(r));
      list.appendChild(card);
    }
  }
  renderRosterStrip();
}
function renderRosterStrip() {
  const strip = document.getElementById('rosterStrip');
  strip.innerHTML = '';
  const lb = document.querySelector('.quicklb');
  if (lb) lb.hidden = !roster.length;
  if (!roster.length) {
    const h = document.createElement('div'); h.className = 'hint'; h.style.padding = '6px 0';
    h.append('No pals in your roster yet — ');
    const b = document.createElement('button'); b.className = 'alink'; b.textContent = 'open the Roster tab';
    b.addEventListener('click', () => navTab('roster'));
    h.appendChild(b);
    strip.appendChild(h);
    return;
  }
  for (const r of [...roster].sort((a, b) => byKey.get(a.k).z - byKey.get(b.k).z)) {
    const p = byKey.get(r.k);
    const chip = document.createElement('button'); chip.className = 'spal'; chip.type = 'button';
    chip.appendChild(icon(p, 30));
    const nm = document.createElement('span'); nm.textContent = r.nick || p.n; chip.appendChild(nm);
    if (r.g) { const g = document.createElement('span'); g.className = 'g ' + (r.g === 'M' ? 'gm' : 'gf'); g.textContent = gsymR(r.g); chip.appendChild(g); }
    if (r.ps.length) { const c = document.createElement('span'); c.className = 'zk'; c.textContent = r.ps.length + '◆'; c.title = r.ps.join(', '); chip.appendChild(c); }
    chip.title = p.n + (r.ps.length ? ' — ' + r.ps.join(', ') : '');
    chip.addEventListener('click', () => setSlotAuto(r));
    strip.appendChild(chip);
  }
}

// ---------- backup export / import ----------
document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({app: 'palarium', savedAt: new Date().toISOString(),
    roster, plans, owned: [...owned]}, null, 1)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'palarium-backup.json';
  a.click(); URL.revokeObjectURL(a.href);
});
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (d.app !== 'palarium' && d.app !== 'palbreed') throw new Error('not a Palarium backup');
      const nr = (d.roster || []).length, np = (d.plans || []).length;
      toast(`Import backup (${nr} pal${nr === 1 ? '' : 's'}, ${np} plan${np === 1 ? '' : 's'})? This replaces your current roster, plans and owned list.`, null, {
        label: 'Import',
        fn: () => {
          roster = (d.roster || []).filter(r => byKey.has(r.k)).map(r => ({g: null, nick: '', note: '', iv: null, ...r}));
          plans = (d.plans || []).filter(p => byKey.has(p.tK));
          owned.clear(); for (const k of d.owned || []) if (byKey.has(k)) owned.add(k);
          saveRoster(); savePlans(); localStorage.setItem('palbreed_owned', JSON.stringify([...owned]));
          renderRoster(); renderPlans(); renderDex(); renderReverse();
          toast('Backup imported — ' + roster.length + ' pals, ' + plans.length + ' plans restored');
        },
      });
    } catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = '';
  };
  rd.readAsText(f);
});

// ---------- planner: route ----------
const SLOTS = [1, 2, 3, 4];
const slotPassives = {1: [], 2: [], 3: [], 4: []};
const slotGenders = {1: null, 2: null, 3: null, 4: null};
const pickS = {}, slotPass = {};
// one string for the empty-route state, wherever it's shown
const ROUTE_HINT = '<div class="hint">Pick at least Start pal 1 and a target species — the route appears here automatically.</div>';
// recompute automatically (debounced) once a starter and target are both set
let autoTimer = null;
function scheduleAuto() {
  if (booting) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (pickPT.get() && SLOTS.some(n => pickS[n].get())) computeRoute();
    else if (currentRoute) { // inputs no longer complete — drop the stale route
      currentRoute = null;
      document.getElementById('routeOut').innerHTML = ROUTE_HINT;
      save();
    }
  }, 600);
}
for (const n of SLOTS) {
  pickS[n] = makePicker(document.getElementById('pickS' + n), {
    placeholder: n === 1 ? 'Pick a species…' : 'Add another starter…',
    allowClear: true, ownedToggle: true,
    onChange: () => { slotPassives[n] = []; slotGenders[n] = null; slotPass[n].set([]); updateSlotUI(); save(); scheduleAuto(); }});
  slotPass[n] = makePassivePicker(document.getElementById('passS' + n), 4,
    () => { slotPassives[n] = slotPass[n].get(); save(); scheduleAuto(); });
}
// progressive disclosure: show the next empty slot only once the previous one is
// filled, and each slot's passive input only once its species is chosen
function updateSlotUI() {
  for (const n of SLOTS) {
    const has = !!pickS[n].get();
    if (n > 1) document.getElementById('pickS' + n).closest('.slot').hidden = !has && !pickS[n - 1].get();
    document.getElementById('passS' + n).hidden = !has;
  }
}
const pickPT = makePicker(document.getElementById('pickPT'), {placeholder:'Pick a species…', ariaLabel:'Target species', allowClear:true, ownedToggle:true, onChange: () => { save(); scheduleAuto(); }});
const desiredPick = makePassivePicker(document.getElementById('desiredPass'), 4, () => { save(); scheduleAuto(); });
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
  document.getElementById('routeOut').innerHTML = ROUTE_HINT;
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
  navTab('plan');
  scheduleAuto();
  document.getElementById('pickS1').scrollIntoView({block:'center', behavior: SMOOTH});
}
function renderSlotChips() {
  for (const n of SLOTS) slotPass[n].set(slotPassives[n]);
  updateSlotUI();
}
let partnerOwnedOnly = false;
const partnerToggle = document.getElementById('partnerToggle');
partnerToggle.addEventListener('click', () => { partnerOwnedOnly = !partnerOwnedOnly; setSwitch(partnerToggle, partnerOwnedOnly); save(); scheduleAuto(); });
let avoidCollab = false;
const collabToggle = document.getElementById('collabToggle');
collabToggle.addEventListener('click', () => { avoidCollab = !avoidCollab; setSwitch(collabToggle, avoidCollab); save(); scheduleAuto(); });

function ownedSpeciesSet() {
  const s = new Set(owned);
  for (const r of roster) s.add(r.k);
  return s;
}
function partnerPool() {
  const own = ownedSpeciesSet();
  if (partnerOwnedOnly) return [...own];
  let keys = PALS.map(p => p.k);
  // collab-exclusive species aren't catchable in every game version — when
  // asked, only use them as partners if the player already owns them
  if (avoidCollab) keys = keys.filter(k => !byKey.get(k).cb || own.has(k));
  // owned species first, then common catchable pals before rare/collab ones,
  // so equal-length routes prefer partners the player can realistically get
  return keys.sort((a, b) => {
    const A = byKey.get(a), B = byKey.get(b);
    return (own.has(b) ? 1 : 0) - (own.has(a) ? 1 : 0)
      || (A.cb ? 1 : 0) - (B.cb ? 1 : 0)
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
    c.appendChild(icon(p, 22));
    const nm = document.createElement('span'); nm.textContent = p.n; c.appendChild(nm);
    c.title = 'Not owned yet — view ' + p.n + '’s card';
    c.addEventListener('click', () => openModal(p));
    nr.appendChild(c);
  }
  return nr;
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
  const out = document.getElementById('routeOut');
  const t = pickPT.get();
  const starters = [];
  for (const n of SLOTS) { const p = pickS[n].get(); if (p) starters.push({k: p.k, ps: slotPassives[n], g: slotGenders[n]}); }
  if (!starters.length || !t) { out.innerHTML = ROUTE_HINT; return; }
  const pool = partnerPool();
  if (partnerOwnedOnly && pool.length < 2) { out.innerHTML = '<div class="hint">Your owned pool is too small — star more pals or turn off "only my pals".</div>'; return; }
  const carried = [...new Set(starters.flatMap(s => s.ps))];
  const desired = desiredPick.get();
  const goal = desired.length ? desired : carried;
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
  const wo = best ? walkOdds(best, starters, goal) : null;
  renderRoute(out, best, t, goal, {
    label: desired.length ? 'goal:' : 'carrying:',
    stepOdds: wo ? wo.odds : null,
    starterKs: starters.map(s => s.k),
  });
  // warn when desired passives are covered by neither a starter nor a roster partner on the route
  const uncovered = best && best.length && wo ? desired.filter(x => !wo.carry.includes(x)) : missing;
  if (uncovered.length) {
    const w = document.createElement('div'); w.className = 'warnbox';
    w.textContent = `⚠ Nothing on this route carries ${uncovered.join(', ')}. Add a starter or roster pal that has ${uncovered.length === 1 ? 'it' : 'them'}, or catch a carrier mid-chain. Odds below track only what the route carries.`;
    out.prepend(w);
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
        const w = document.createElement('div'); w.className = 'warnbox';
        w.textContent = `⚠ Your ${byKey.get(st.aK).n} and ${byKey.get(st.bK).n} are both recorded as ${sym} — a breeding pair needs one ♂ and one ♀. You'll need an opposite-gender ${byKey.get(st.aK).n} or ${byKey.get(st.bK).n} (catch or hatch one) before this merge step.`;
        out.prepend(w);
      }
    }
  }
  out.scrollIntoView({block: 'nearest', behavior: SMOOTH});
  save();
}

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
    if (g) { const gg = document.createElement('span'); gg.className = 'g'; gg.textContent = gsym(g); gg.title = 'Required gender'; u.appendChild(gg); }
    return u;
  };
  // orient gender info: pa/pb tell which species needs which gender
  let ga = null, gb = null;
  if (s.kind === 'gender' && s.pa) { ga = s.pa === s.aK ? s.ga : s.gb; gb = s.pb === s.bK ? s.gb : s.ga; }
  row.appendChild(unit(s.aK, ga, false));
  const x = document.createElement('span'); x.className = 'sym'; x.textContent = '×'; row.appendChild(x);
  row.appendChild(unit(s.bK, gb, true));
  const arr = document.createElement('span'); arr.className = 'arr2'; arr.textContent = '→'; row.appendChild(arr);
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
    o.textContent = `🎲 ≈${Math.max(1, Math.round(opts.odds.p * 100))}%/egg`;
    const expl = `≈${Math.round(opts.odds.p * 100)}% per egg to inherit all ${opts.odds.keep} tracked passive${opts.odds.keep === 1 ? '' : 's'} (pool of ${opts.odds.pool}). Expect ≈${Math.max(1, Math.round(1 / opts.odds.p))} eggs. ${opts.odds.rp ? 'Partner passives from your roster are included.' : 'Assumes a passive-free partner.'} Community-measured.`;
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
  if (opts.onOpen) {
    const ob = document.createElement('button'); ob.className = 'stepopen'; ob.type = 'button'; ob.textContent = '↗';
    ob.title = 'Open this pairing in the Breed tab with the full chain';
    ob.setAttribute('aria-label', 'Open this pairing in the Breed tab with the full chain');
    ob.addEventListener('click', opts.onOpen);
    row.appendChild(ob);
  }
  return row;
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
    if (g) { const gg = document.createElement('span'); gg.className = 'g'; gg.textContent = gsym(g); c.appendChild(gg); }
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
  let scale = 1, tx = 0, ty = 0;
  const apply = () => { inner.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
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
  for (const [txt, label, fn] of [
    ['+', 'Zoom in', () => zoomAt(...mid(), 1.25)],
    ['−', 'Zoom out', () => zoomAt(...mid(), 1 / 1.25)],
    ['⤾', 'Reset view', () => { scale = 1; tx = ty = 0; apply(); }],
  ]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
    b.title = label; b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    ctrl.appendChild(b);
  }
  vp.appendChild(ctrl);
  const hint = document.createElement('span'); hint.className = 'tvp-hint';
  hint.textContent = matchMedia('(pointer: coarse)').matches ? 'drag to pan · pinch to zoom' : 'drag to pan · scroll to zoom';
  vp.appendChild(hint);
  requestAnimationFrame(() => {
    const h = Math.min(Math.max(inner.offsetHeight, 140), 420);
    vp.style.height = h + 'px';
    // start centered horizontally if the tree is narrower than the viewport
    const w = vp.clientWidth;
    if (inner.offsetWidth < w) { tx = (w - inner.offsetWidth) / 2; apply(); }
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
function renderRoute(out, steps, target, carried, ropts = {}) {
  out.innerHTML = '';
  if (steps === null) {
    const h = document.createElement('div'); h.className = 'hint';
    h.textContent = (target.ic || uniqueChildren.has(target.k))
      ? `${target.n} can only come from its unique combo — no averaging chain reaches it${partnerOwnedOnly ? ' with only your pals' : ''}. Check its pairs in Find Parents.`
      : `No route found${partnerOwnedOnly ? ' using only your pals — try turning off "Only use my pals as partners"'
        : avoidCollab ? ' without collab partners — try turning off "Avoid Terraria collab partners"' : ' within 8 steps'}.`;
    out.appendChild(h); return;
  }
  if (!steps.length) {
    out.innerHTML = `<div class="hint">Your start pal already is ${target.n} — no breeding needed.</div>`; return;
  }
  const stepOdds = ropts.stepOdds || [];
  const sum = document.createElement('div'); sum.className = 'rsummary';
  const cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'} to ${target.n}`;
  sum.appendChild(cnt);
  if (carried.length) { const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = ropts.label || 'carrying:'; sum.appendChild(sub); sum.appendChild(passiveChips(carried)); }
  out.appendChild(sum);
  const need = neededSpecies(steps, ropts.starterKs || []);
  if (need.length) out.appendChild(neededRow(need));
  if (steps.length > 1) out.appendChild(treeViewport(routeTree(steps)));
  // the "passive carrier line" tag only means something when passives are tracked
  steps.forEach((s, i) => out.appendChild(stepEl(s, {stepNo: i + 1, carrier: carried.length > 0, odds: stepOdds[i], onOpen: () => openChainStep(steps, i)})));
  if (carried.length) {
    const n = document.createElement('div'); n.className = 'mathline';
    n.textContent = 'At each step, hatch until a child inherits your passives (and the right gender for the next pairing), then continue with that child.';
    out.appendChild(n);
    const withOdds = stepOdds.filter(Boolean);
    if (withOdds.length) {
      const eggs = withOdds.reduce((a, o) => a + 1 / o.p, 0);
      const agg = document.createElement('div'); agg.className = 'mathline';
      agg.textContent = `🎲 Expected eggs across the chain: ≈${Math.ceil(eggs)} to keep all tracked passives at every step (community-measured estimate).`;
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
    toast('Plan “' + name + '” saved');
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
let plans = JSON.parse(localStorage.getItem('palbreed_plans') || '[]').filter(p => byKey.has(p.tK));
function savePlans() { localStorage.setItem('palbreed_plans', JSON.stringify(plans)); updateChecklist(); }
function renderPlans() {
  const list = document.getElementById('plansList');
  list.innerHTML = '';
  if (!plans.length) { list.innerHTML = '<div class="hint">No saved plans yet — compute a route and save it.</div>'; return; }
  for (const plan of plans) {
    const card = document.createElement('div'); card.className = 'plan';
    const head = document.createElement('div'); head.className = 'planhead';
    head.appendChild(icon(byKey.get(plan.tK), 38, true));
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = plan.name; head.appendChild(nm);
    const doneCnt = plan.done.filter(Boolean).length;
    const prog = document.createElement('span'); prog.className = 'prog';
    prog.textContent = doneCnt === plan.steps.length ? '✓ complete' : `${doneCnt}/${plan.steps.length} steps`;
    head.appendChild(prog);
    if (plan.passives.length) head.appendChild(passiveChips(plan.passives));
    const treeBtn = document.createElement('button'); treeBtn.className = 'stepopen pushr'; treeBtn.textContent = 'Tree ⌄';
    treeBtn.title = 'Show this plan as an interactive tree';
    treeBtn.setAttribute('aria-expanded', 'false');
    const treeBox = document.createElement('div'); treeBox.className = 'plantree'; treeBox.hidden = true;
    treeBtn.addEventListener('click', () => {
      treeBox.hidden = !treeBox.hidden;
      treeBtn.setAttribute('aria-expanded', String(!treeBox.hidden));
      treeBtn.textContent = treeBox.hidden ? 'Tree ⌄' : 'Tree ⌃';
      if (!treeBox.hidden && !treeBox.childElementCount) treeBox.appendChild(treeViewport(routeTree(plan.steps)));
    });
    head.appendChild(treeBtn);
    const del = document.createElement('button'); del.className = 'del danger'; del.textContent = '✕ Delete';
    del.setAttribute('aria-label', 'Delete plan ' + plan.name);
    del.addEventListener('click', () => {
      const idx = plans.findIndex(x => x.id === plan.id);
      if (idx < 0) return;
      const removed = plans[idx];
      plans.splice(idx, 1); savePlans(); renderPlans();
      toast('Deleted plan “' + removed.name + '”', () => {
        plans.splice(Math.min(idx, plans.length), 0, removed);
        savePlans(); renderPlans();
      });
    });
    head.appendChild(del);
    card.appendChild(head);
    card.appendChild(treeBox);
    const need = neededSpecies(plan.steps);
    if (need.length) card.appendChild(neededRow(need));
    plan.steps.forEach((s, i) => {
      const row = stepEl(s, {stepNo: i + 1, onOpen: () => openChainStep(plan.steps, i)});
      if (plan.done[i]) row.classList.add('done');
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.className = 'chk'; chk.checked = !!plan.done[i];
      chk.title = 'Mark step done';
      chk.addEventListener('change', () => { plan.done[i] = chk.checked; savePlans(); renderPlans(); });
      row.insertBefore(chk, row.firstChild);
      card.appendChild(row);
    });
    list.appendChild(card);
  }
}

// ---------- hatchery ----------
const hatchSearch = document.getElementById('hatchSearch');
const hatchNewBtn = document.getElementById('hatchNewOnly');
let hatchNewOnly = false;
hatchSearch.addEventListener('input', renderHatch);
hatchNewBtn.addEventListener('click', () => { hatchNewOnly = !hatchNewOnly; setSwitch(hatchNewBtn, hatchNewOnly); save(); renderHatch(); });
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
  const kids = new Map(); // childK -> {ways, pairs:[[aK,bK],…]}
  for (let i = 0; i < own.length; i++) for (let j = i; j < own.length; j++) {
    const res = breed(byKey.get(own[i]), byKey.get(own[j]));
    for (const c of res.children) {
      const e = kids.get(c.pal.k) || kids.set(c.pal.k, {ways: 0, pairs: []}).get(c.pal.k);
      e.ways++; e.pairs.push([own[i], own[j]]);
    }
  }
  const ownSet = new Set(own);
  const q = hatchSearch.value.trim().toLowerCase();
  let rows = [...kids.entries()].map(([k, e]) => ({p: byKey.get(k), ways: e.ways, pairs: e.pairs, isNew: !ownSet.has(k)}))
    .filter(r => (!hatchNewOnly || r.isNew) && (!q || r.p.n.toLowerCase().includes(q)));
  rows.sort((a, b) => (b.isNew - a.isNew) || a.p.z - b.p.z);
  const newCount = rows.filter(r => r.isNew).length;
  stats.textContent = `${rows.length} species from ${own.length} owned · ${newCount} new`;
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
    card.appendChild(icon(r.p, 40, true));
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.p.n; card.appendChild(nm);
    if (r.p.rar >= 5) card.appendChild(tierBadge(r.p));
    if (r.isNew) { const nb = document.createElement('span'); nb.className = 'newb'; nb.textContent = 'NEW'; card.appendChild(nb); }
    const ways = document.createElement('span'); ways.className = 'ways';
    ways.textContent = r.ways + (r.ways === 1 ? ' pair' : ' pairs'); card.appendChild(ways);
    card.title = (expanded ? 'Hide' : 'Show') + ` the pairs that produce ${r.p.n}`;
    card.addEventListener('click', () => { hatchOpen = expanded ? null : r.p.k; renderHatch(); });
    list.appendChild(card);
    if (expanded) list.appendChild(hatchPanel(r));
  }
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
    const side = pal => {
      const s = document.createElement('span'); s.className = 'pside';
      s.appendChild(icon(pal, 32, true));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = pal.n; s.appendChild(nm);
      return s;
    };
    row.appendChild(side(a));
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; row.appendChild(x);
    row.appendChild(side(b));
    const issue = pairGenderIssue(aK, bK);
    if (issue) { const w = document.createElement('span'); w.className = 'warnchip'; w.textContent = '⚠ ' + issue; row.appendChild(w); }
    row.addEventListener('click', () => { pickA.set(a, true); pickB.set(b, true); renderBreed(); navTab('breed'); });
    wrap.appendChild(row);
  }
  panel.appendChild(wrap);
  const lr = document.createElement('div'); lr.className = 'linkrow'; lr.style.justifyContent = 'flex-start';
  const all = document.createElement('button'); all.className = 'alink';
  all.textContent = `All parent pairs of ${r.p.n} ↗`;
  all.title = 'Open Find Parents with every combination, not just your pals';
  all.addEventListener('click', () => { pickT.set(r.p, true); reverseShown = 120; renderReverse(); navTab('reverse'); });
  lr.appendChild(all);
  panel.appendChild(lr);
  return panel;
}

// ---------- unique combos browser ----------
const dexModeEl = document.getElementById('dexMode');
function setDexMode(m) {
  dexModeEl.querySelectorAll('button').forEach(x => {
    const on = x.dataset.m === m;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', String(on));
    x.tabIndex = on ? 0 : -1;
  });
  document.getElementById('dexPalsBlock').hidden = m !== 'pals';
  document.getElementById('dexCombosBlock').hidden = m !== 'combos';
  if (m === 'combos') renderCombos();
}
dexModeEl.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) setDexMode(b.dataset.m);
});
tablistKeys(dexModeEl);
setDexMode('pals');
document.getElementById('comboSearch').addEventListener('input', renderCombos);
function renderCombos() {
  const list = document.getElementById('comboList');
  list.innerHTML = '';
  const q = document.getElementById('comboSearch').value.trim().toLowerCase();
  const gsym = g => g === 'Male' ? ' ♂' : g === 'Female' ? ' ♀' : '';
  let rows = DATA.combos
    .map(c => ({a: byKey.get(c.a), b: byKey.get(c.b), c: byKey.get(c.c), ga: c.ga, gb: c.gb}))
    .filter(r => !q || r.a.n.toLowerCase().includes(q) || r.b.n.toLowerCase().includes(q) || r.c.n.toLowerCase().includes(q));
  rows.sort((x, y) => x.c.n.localeCompare(y.c.n));
  document.getElementById('comboCount').textContent =
    rows.length === DATA.combos.length ? DATA.combos.length + ' unique combos' : rows.length + ' of ' + DATA.combos.length + ' combos';
  for (const r of rows) {
    const row = document.createElement('button'); row.className = 'pair'; row.type = 'button';
    const side = (pal, g) => {
      const s = document.createElement('span'); s.className = 'pside';
      s.appendChild(icon(pal, 30, true));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = pal.n + (g ? gsym(g) : '');
      s.appendChild(nm); return s;
    };
    row.appendChild(side(r.a, r.ga));
    const x1 = document.createElement('span'); x1.className = 'x'; x1.textContent = '×'; row.appendChild(x1);
    row.appendChild(side(r.b, r.gb));
    const arr = document.createElement('span'); arr.className = 'x'; arr.textContent = '→'; row.appendChild(arr);
    row.appendChild(side(r.c));
    row.title = 'Load this pair in the Breed tab';
    row.addEventListener('click', () => { pickA.set(r.a, true); pickB.set(r.b, true); renderBreed(); navTab('breed'); });
    list.appendChild(row);
  }
}

// ---------- dex view ----------
const dexBody = document.getElementById('dexBody');
const dexSearch = document.getElementById('dexSearch');
const dexType = document.getElementById('dexType');
const dexWork = document.getElementById('dexWork');
const dexOwnedBtn = document.getElementById('dexOwned');
let dexSort = {key: 'z', dir: 1};
let dexOwnedOnly = false;
for (const t of Object.keys(TYPE_COLORS)) {
  const o = document.createElement('option'); o.value = t; o.textContent = t[0].toUpperCase() + t.slice(1); dexType.appendChild(o);
}
for (const [k, label] of Object.entries(WORKS)) {
  const o = document.createElement('option'); o.value = k; o.textContent = label; dexWork.appendChild(o);
}
dexSearch.addEventListener('input', renderDex);
dexType.addEventListener('change', () => { save(); renderDex(); });
dexWork.addEventListener('change', () => {
  if (dexWork.value) dexSort = {key: 'w', dir: -1};
  save(); renderDex();
});
dexOwnedBtn.addEventListener('click', () => { dexOwnedOnly = !dexOwnedOnly; setSwitch(dexOwnedBtn, dexOwnedOnly); save(); renderDex(); });
function clearDexFilters() {
  dexSearch.value = ''; dexType.value = ''; dexWork.value = '';
  dexOwnedOnly = false; setSwitch(dexOwnedBtn, false);
  save(); renderDex();
}
document.getElementById('dexClear').addEventListener('click', clearDexFilters);
document.querySelectorAll('th[data-s]').forEach(th => {
  th.addEventListener('click', () => {
    const k = th.dataset.s;
    dexSort = {key: k, dir: dexSort.key === k ? -dexSort.dir : (k === 'w' || k === 'own' ? -1 : 1)};
    save(); renderDex();
  });
});
function renderDex() {
  const q = dexSearch.value.trim().toLowerCase();
  const ty = dexType.value, wk = dexWork.value;
  const os = ownedSpeciesSet();
  let rows = PALS.filter(p => (!q || p.n.toLowerCase().includes(q)) && (!ty || p.t.includes(ty)) && (!wk || (p.w && p.w[wk])) && (!dexOwnedOnly || os.has(p.k)));
  const {key, dir} = dexSort;
  const wval = p => wk ? (p.w?.[wk] || 0) : Object.values(p.w || {}).reduce((a,b) => a+b, 0);
  rows.sort((a, b) => {
    let va, vb;
    if (key === 't') { va = a.t[0]; vb = b.t[0]; }
    else if (key === 'z') { va = a.z * 10 + (a.zs ? 1 : 0); vb = b.z * 10 + (b.zs ? 1 : 0); }
    else if (key === 'w') { va = wval(a); vb = wval(b); }
    else if (key === 'own') { va = os.has(a.k) ? 1 : 0; vb = os.has(b.k) ? 1 : 0; }
    else { va = a[key]; vb = b[key]; }
    if (va === vb) { return a.z - b.z; }
    return (va < vb ? -1 : 1) * dir;
  });
  document.querySelectorAll('th[data-s]').forEach(th => {
    const base = th.dataset.label || (th.dataset.label = th.textContent);
    const active = dexSort.key === th.dataset.s;
    th.innerHTML = `<button type="button" class="thbtn" aria-label="Sort by ${base === '★' ? 'owned' : base}">${base}` +
      (active ? ` <span class="arr" aria-hidden="true">${dexSort.dir > 0 ? '▲' : '▼'}</span>` : '') + '</button>';
    th.setAttribute('aria-sort', active ? (dexSort.dir > 0 ? 'ascending' : 'descending') : 'none');
  });
  document.getElementById('dexCount').textContent =
    rows.length === PALS.length ? PALS.length + ' pals' : rows.length + ' of ' + PALS.length + ' pals';
  // a visible way out of persisted filters ("1 of 299 pals" a week later)
  document.getElementById('dexClear').hidden = !(q || ty || wk || dexOwnedOnly);
  dexBody.innerHTML = '';
  for (const p of rows) {
    const tr = document.createElement('tr');
    tr.dataset.k = p.k;
    const td0 = document.createElement('td');
    const star = document.createElement('button'); star.className = 'star' + (owned.has(p.k) ? ' on' : '');
    star.textContent = owned.has(p.k) ? '★' : '☆'; star.title = 'Mark as owned';
    star.setAttribute('aria-label', 'Mark ' + p.n + ' as owned'); star.setAttribute('aria-pressed', String(owned.has(p.k)));
    star.addEventListener('click', e => {
      e.stopPropagation(); toggleOwned(p.k); renderDex(); renderReverse();
      // the re-render destroyed the clicked button — put focus back on its successor
      dexBody.querySelector(`tr[data-k="${p.k}"] .star`)?.focus();
    });
    td0.appendChild(star);
    const td1 = document.createElement('td'); td1.textContent = zk(p);
    const td2 = document.createElement('td');
    const nm = document.createElement('div'); nm.className = 'tname'; nm.appendChild(icon(p, 34));
    const s = document.createElement('span'); s.textContent = p.n; nm.appendChild(s);
    nm.appendChild(tierBadge(p)); td2.appendChild(nm);
    const td3 = document.createElement('td'); td3.className = 'hn'; td3.appendChild(typeChips(p));
    const td4 = document.createElement('td'); td4.textContent = p.ic || uniqueChildren.has(p.k) ? p.r + ' (unique only)' : p.r;
    const td5 = document.createElement('td'); td5.className = 'hn'; td5.textContent = p.m + '%';
    const td6 = document.createElement('td'); td6.className = 'tworks';
    const parts = Object.entries(p.w || {}).sort((a,b) => b[1]-a[1]).map(([k,v]) => k === wk ? `<b>${workIcon(k)}${v}</b>` : workIcon(k)+v);
    td6.innerHTML = parts.join(' ');
    tr.append(td0, td1, td2, td3, td4, td5, td6);
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', 'View ' + p.n + ' details');
    tr.addEventListener('click', () => openModal(p));
    tr.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); openModal(p); } });
    dexBody.appendChild(tr);
  }
  if (!rows.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7;
    const h = document.createElement('div'); h.className = 'hint';
    h.append('No pals match these filters. ');
    const b = document.createElement('button'); b.className = 'alink'; b.textContent = '✕ Clear filters';
    b.addEventListener('click', clearDexFilters);
    h.appendChild(b);
    td.appendChild(h); tr.appendChild(td); tr.style.cursor = 'default';
    dexBody.appendChild(tr);
  }
}

// ---------- init ----------
if (state.a && byKey.get(state.a)) pickA.set(byKey.get(state.a), true);
if (state.b && byKey.get(state.b)) pickB.set(byKey.get(state.b), true);
if (state.t && byKey.get(state.t)) pickT.set(byKey.get(state.t), true);
if (state.l && byKey.get(state.l)) pickL.set(byKey.get(state.l), true);
if (state.ownedOnly) { ownedOnly = true; setSwitch(ownedToggle, true); }
if (state.dexOwnedOnly) { dexOwnedOnly = true; setSwitch(dexOwnedBtn, true); }
if (state.rgroup) { groupBySpecies = true; setSwitch(groupToggle, true); }
// planner, chain, and filter state
for (const n of SLOTS) {
  const k = state['s' + n];
  if (k && byKey.has(k)) {
    pickS[n].set(byKey.get(k), true);
    slotPassives[n] = (state.sp && state.sp[n]) || [];
    slotGenders[n] = (state.sg && state.sg[n]) || null;
  }
}
if (state.pt && byKey.has(state.pt)) pickPT.set(byKey.get(state.pt), true);
if (Array.isArray(state.dp) && state.dp.length) desiredPick.set(state.dp);
if (state.po) { partnerOwnedOnly = true; setSwitch(partnerToggle, true); }
if (state.ac) { avoidCollab = true; setSwitch(collabToggle, true); }
if (state.hn) { hatchNewOnly = true; setSwitch(hatchNewBtn, true); }
if (state.dt) dexType.value = state.dt;
if (state.dw) dexWork.value = state.dw;
if (state.dsort && state.dsort.key) dexSort = state.dsort;
if (state.chain && Array.isArray(state.chain.steps)
    && state.chain.steps.every(s => byKey.has(s.aK) && byKey.has(s.bK) && byKey.has(s.cK))
    && state.chain.idx >= 0 && state.chain.idx < state.chain.steps.length) {
  breedChain = state.chain;
}
renderBreed(); renderReverse(); renderDex(); renderRoster(); renderPlans(); renderSlotChips();
// first-visit setup checklist (dismissible; auto-hides once all steps are done)
{
  const bar = document.getElementById('setupbar');
  if (!localStorage.getItem('palbreed_tipseen')) {
    bar.hidden = false;
    document.getElementById('tipDismiss').addEventListener('click', () => {
      bar.hidden = true; localStorage.setItem('palbreed_tipseen', '1');
    });
    bar.querySelector('[data-su="star"]').addEventListener('click', () => navTab('dex'));
    bar.querySelector('[data-su="breed"]').addEventListener('click', () => {
      const a = PALS.find(p => p.n === 'Relaxaurus'), b = PALS.find(p => p.n === 'Sparkit');
      if (a && b) { pickA.set(a, true); pickB.set(b, true); renderBreed(); }
      navTab('breed');
    });
    bar.querySelector('[data-su="plan"]').addEventListener('click', () => navTab('plan'));
    updateChecklist();
  }
}
// guide jump links: hand the reader to the tab being described
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.nav === 'combos') { navTab('dex'); setDexMode('combos'); }
  else navTab(b.dataset.nav);
}));
booting = false;
if (!applyHash(initialHash)) showTab(state.tab && document.getElementById('view-' + state.tab) ? state.tab : currentTab);
if (state.ro && pickS[1].get() && pickPT.get()) computeRoute();
// "/" focuses the active view's search box
document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  if (overlay.classList.contains('open') || roverlay.classList.contains('open') || openPicker) return;
  // tabs without a search box open the most useful pal picker instead
  if (currentTab === 'breed') {
    e.preventDefault();
    (pickA.get() && !pickB.get() ? pickB : pickA).openPop();
    return;
  }
  if (currentTab === 'plan') {
    e.preventDefault();
    const n = SLOTS.find(i => !pickS[i].get());
    const pk = n ? pickS[n] : (pickPT.get() ? pickS[1] : pickPT);
    pk.root.scrollIntoView({block: 'center'});
    pk.openPop();
    return;
  }
  if (currentTab === 'reverse' && !pickT.get()) {
    // no target yet — filtering pairs is useless; open the target picker instead
    e.preventDefault();
    pickT.openPop();
    return;
  }
  let target = {dex: '#dexSearch', hatch: '#hatchSearch', roster: '#rosterSearch', reverse: '#pairFilter'}[currentTab];
  if (currentTab === 'dex' && document.getElementById('dexPalsBlock').hidden) target = '#comboSearch';
  const inp = target && document.querySelector(target);
  if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
});
// PWA: offline capability + installability (http(s) only — no-op when opened as a local file)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
