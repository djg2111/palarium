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
const WORKS = {kindling:'Kindling',watering:'Watering',planting:'Planting',generatingElectricity:'Electricity',handiwork:'Handiwork',gathering:'Gathering',lumbering:'Lumbering',mining:'Mining',medicineProduction:'Medicine',cooling:'Cooling',transporting:'Transporting',farming:'Farming'};
// The element and work icons are the game's own textures. Their file names had
// to be read off the rendered art rather than taken from the EPalElementType /
// EPalWorkSuitability enums, which disagree with the icon sheet's order — see
// tools/gen-ui-icons.js. The emoji in WORKS survive because a <select> option
// can't hold an image.
const UI = 'assets/ui/';
const WORK_LABEL = k => WORKS[k] || pretty(k);
function uiIcon(dir, key, size, cls) {
  const i = new Image(size, size);
  i.className = 'uii' + (cls ? ' ' + cls : '');
  i.src = UI + dir + '/' + key + '.webp';
  i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.draggable = false;
  i.onerror = () => i.remove();
  return i;
}
const workImgTag = k =>
  `<img class="uii" src="${UI}work/${k}.webp" alt="" width="15" height="15" loading="lazy" decoding="async">`;
// A passive's icon is keyed by its primary effect type, which is already the
// first token of the effect string the dataset carries — no extra data needed.
const passiveIconKey = meta => (meta && meta.e ? meta.e.split(' ')[0] : null);
function passiveIcon(meta, size = 15) {
  const k = passiveIconKey(meta);
  return k ? uiIcon('passive', k, size) : null;
}
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
    plan: plans.length > 0 || !!localStorage.getItem('palbreed_planned'),
  };
  let all = true;
  for (const b of bar.querySelectorAll('.step')) {
    const d = !!done[b.dataset.su];
    const base = b.dataset.base || (b.dataset.base = b.textContent);
    b.classList.toggle('done', d);
    b.textContent = d ? '✓ ' + base : base;
    all = all && d;
  }
  if (all) {
    bar.hidden = true; localStorage.setItem('palbreed_tipseen', '1');
    if (!booting) toast('Setup complete — happy hatching!');
  }
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

// ---------- saved state, read defensively ----------
// localStorage outlives the dataset: js/data.js is regenerated from game files,
// so a key starred a version ago can stop existing. It's also user-writable.
// Nothing read back is trusted — bad JSON, the wrong container type and stale
// pal keys all have to degrade to "empty" instead of throwing during boot,
// because a throw up here skips the rest of init (hash routing, the "/"
// shortcut, the service worker) and leaves the app half-built.
function readStore(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    if (!v || typeof v !== 'object' || Array.isArray(v) !== Array.isArray(fallback)) return fallback;
    return v;
  } catch { return fallback; }
}

// ---------- owned set ----------
const owned = new Set(readStore('palbreed_owned', []).filter(k => byKey.has(k)));
function toggleOwned(k) {
  owned.has(k) ? owned.delete(k) : owned.add(k);
  localStorage.setItem('palbreed_owned', JSON.stringify([...owned]));
  scheduleAuto(); // owned pool feeds the planner's partner list
  updateChecklist();
}

// ---------- recently picked pals (shared across all pickers) ----------
let recentPicks = readStore('palbreed_recents', []).filter(k => byKey.has(k));
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
// egg icon files are named for the app's element keys; anything unmapped falls
// back to the plain egg rather than a broken image
const EGG_ELEM = {normal:'normal', fire:'fire', water:'water', grass:'grass', electric:'electric',
  ice:'ice', ground:'ground', dark:'dark', dragon:'dragon'};
const eggOf = p => (p.rar >= 8 ? 'Huge ' : p.rar >= 5 ? 'Large ' : '') + (EGG_NAMES[p.t[0]] || 'Common') + ' Egg';
function eggChip(p) {
  const c = document.createElement('span'); c.className = 'mchip drop';
  // the egg art is per element; size lives in the label
  c.append(uiIcon('egg', EGG_ELEM[p.t[0]] || 'normal', 18), eggOf(p));
  c.title = 'Egg this pal hatches from (bigger and rarer eggs incubate longer — match its temperature preference to speed up)';
  return c;
}
function typeDots(p) {
  const w = document.createElement('span'); w.className = 'types';
  for (const t of p.t) {
    const i = uiIcon('element', t, 14);
    i.title = t;
    w.appendChild(i);
  }
  return w;
}
function typeChips(p) {
  const f = document.createDocumentFragment();
  for (const t of p.t) {
    const c = document.createElement('span'); c.className = 'chip';
    c.style.background = TYPE_COLORS[t] || 'var(--muted)';
    // the icon is element-coloured and so is the chip, so it's knocked back to
    // the chip's ink colour rather than disappearing into the background
    c.append(uiIcon('element', t, 13), t);
    f.appendChild(c);
  }
  return f;
}
function worksEl(p, highlightKey) {
  const w = document.createElement('div'); w.className = 'works';
  for (const [k,v] of Object.entries(p.w || {}).sort((a,b) => b[1]-a[1])) {
    const s = document.createElement('span');
    s.append(uiIcon('work', k, 16), WORK_LABEL(k) + ' ' + v);
    s.title = pretty(k);
    if (k === highlightKey) s.className = 'hot';
    w.appendChild(s);
  }
  if (!w.children.length) { const s = document.createElement('span'); s.textContent = 'No base work'; w.appendChild(s); }
  return w;
}
// gender markers carry their color everywhere: ♂ = --male, ♀ = --female.
// Inline SVG instead of the ♂/♀ text glyphs — font coverage for those code
// points is small and inconsistent across platforms.
const GENDER_SVG = {
  '♂': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.2" cy="9.8" r="4.4"/><path d="M9.4 6.6 14 2M9.8 2H14v4.2"/></svg>',
  '♀': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5.8" r="4.3"/><path d="M8 10.1v4.4M5.6 12.4h4.8"/></svg>',
};
function gEl(sym) {
  const s = document.createElement('span');
  s.className = 'g ' + (sym === '♂' ? 'gm' : 'gf');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', sym === '♂' ? 'male' : 'female');
  s.title = sym === '♂' ? 'Male' : 'Female';
  s.innerHTML = GENDER_SVG[sym];
  return s;
}
// wrap any ♂/♀ inside a plain string in colored spans (warnings, tags)
function genderize(text) {
  const f = document.createDocumentFragment();
  let buf = '';
  for (const ch of text) {
    if (ch === '♂' || ch === '♀') { if (buf) { f.append(buf); buf = ''; } f.append(gEl(ch)); }
    else buf += ch;
  }
  if (buf) f.append(buf);
  return f;
}
function genderBar(p) {
  const g = document.createElement('div'); g.className = 'gbar';
  const tr = document.createElement('span'); tr.className = 'gtrack';
  const i = document.createElement('i'); i.style.width = p.m + '%'; tr.appendChild(i);
  const lab = document.createElement('span');
  lab.append(gEl('♂'), ` ${p.m}% · `, gEl('♀'), ` ${100 - p.m}%`);
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

function openModal(p, rentry) {
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

  // opened from a roster card: show that individual's recorded details
  if (rentry) {
    const rs = sec('In your roster');
    const box = document.createElement('div'); box.className = 'rosentry';
    const r1 = document.createElement('div'); r1.className = 'row1';
    if (rentry.g) r1.appendChild(gEl(rentry.g === 'M' ? '♂' : '♀'));
    if (rentry.nick) { const nk = document.createElement('b'); nk.textContent = '“' + rentry.nick + '”'; r1.appendChild(nk); }
    if (rentry.iv) {
      const ivc = document.createElement('span'); ivc.className = 'ivchip';
      ivc.textContent = 'IV ' + rentry.iv.map(v => v === null ? '–' : v).join('·');
      ivc.title = 'HP · Attack · Defense IVs'; r1.appendChild(ivc);
    }
    const ed = document.createElement('button'); ed.className = 'alink'; ed.style.marginLeft = 'auto';
    ed.textContent = '✎ Edit'; ed.title = 'Edit this roster entry';
    ed.addEventListener('click', () => { leaveModal(); openRosterEditor(rentry); });
    r1.appendChild(ed);
    box.appendChild(r1);
    if (rentry.ps.length) box.appendChild(passiveChips(rentry.ps));
    if (rentry.note) { const nt = document.createElement('div'); nt.className = 'rnote'; nt.textContent = rentry.note; box.appendChild(nt); }
    rs.appendChild(box);
    modalEl.appendChild(rs);
  }

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
  btns.appendChild(mkBtn('Plan route to this', false, () => { closeModal(true); pickPT.set(p, true); setPlanMode('new'); navTab('plan'); scheduleAuto(); }));
  btns.appendChild(mkBtn('+ Add to roster', false, () => { leaveModal(); openRosterEditor(null, p); }));
  if (MAP) {
    // one button, three honest outcomes: spawn areas, the single alpha that is
    // the only one in the world, or a straight "this one only comes from breeding"
    btns.appendChild(mkBtn('Find in the wild', false, () => {
      closeModal(true); navTab('map');
      mapLoadSpawns().then(() => {
        mapSelect(null);
        mapSetSpawn(p.k, true);
        if (!spawnEntries(p.k).length) {
          const alpha = MAP_ALPHAS.get(p.k);
          if (alpha) mapSelect(alpha[0], true);
        }
      }).catch(() => toast('Spawn data failed to load'));
    }));
  }
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
      const c = document.createElement('span'); c.className = 'mchip drop';
      // not every drop id has an icon in DT_ItemIconDataTable; those fall back
      // to the plain text chip rather than leaving a broken image behind
      const im = new Image(20, 20);
      im.src = 'assets/items/' + item.toLowerCase() + '.webp';   // see tools/gen-ui-icons.js
      im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
      im.onerror = () => { im.remove(); c.classList.remove('drop'); };
      c.append(im, `${pretty(item)} ×${mn === mx ? mn : mn + '–' + mx} (${rate}%)`);
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
// Escape dismisses the topmost layer only. The roster editor listens for Escape
// too, and it can't tell that a picker took this one — close() has already
// cleared openPicker by the time its handler runs — so stop the event here.
// Without this, backing out of the species picker inside the editor closed the
// whole dialog and threw away the nickname, passives and IVs typed into it.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openPicker) { e.stopImmediatePropagation(); openPicker.close(); }
});
// the popup is anchored to its trigger, so scrolling the page underneath it can
// walk it back under the nav bar — re-fit it (rAF-throttled) while it's open
let refitQueued = false;
addEventListener('scroll', () => {
  if (!openPicker || refitQueued) return;
  refitQueued = true;
  requestAnimationFrame(() => { refitQueued = false; openPicker && openPicker.refit(); });
}, {passive: true});

// ---------- popup placement ----------
// (bottomNavEl is declared with the nav wiring below; fitPopup only runs on click)
// A tap shouldn't summon the on-screen keyboard over the very list the popup
// opened to show, so only autofocus a search field when a keyboard is already
// in play — pointer:fine, or an explicit true from a keyboard-driven caller.
const wantsSearchFocus = () => matchMedia('(pointer: fine)').matches;
// Fit a popup between its trigger and the fixed mobile nav bar (which floats
// above the page and would otherwise clip the last rows), flipping it above the
// trigger when the space below is too cramped to be worth using.
function fitPopup(root, pop, list, cap) {
  const rr = root.getBoundingClientRect();
  const headH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 0;
  const chrome = pop.offsetHeight - list.offsetHeight; // search field, source row
  const below = window.innerHeight - bottomNavEl.offsetHeight - rr.bottom - 14;
  const above = rr.top - headH - 14;
  const up = below < 200 && above > below;
  pop.classList.toggle('up', up);
  list.style.maxHeight = Math.max(120, Math.min(cap, (up ? above : below) - chrome)) + 'px';
}

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
    const setSrc = v => { ownedOnlyPick = v; srcAll.classList.toggle('on', !v); srcOwn.classList.toggle('on', v); renderList(); if (wantsSearchFocus()) inp.focus(); };
    srcAll.addEventListener('click', () => setSrc(false));
    srcOwn.addEventListener('click', () => setSrc(true));
    row.append(srcAll, srcOwn); pop.appendChild(row);
  }
  pop.appendChild(list); root.append(btn, pop); mount.appendChild(root);

  let sel = null, hl = 0, rows = [];
  const api = { root, get: () => sel,
    set(p, silent) { sel = p; renderBtn(); if (p && !silent) pushRecent(p.k); if (!silent) onChange && onChange(p); },
    refit() { if (root.classList.contains('open')) fitPopup(root, pop, list, 340); },
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
  // Autofocusing the search box summons the on-screen keyboard, which covers
  // the pal grid the popup just opened to show. Only do it when a keyboard is
  // already in play; on touch the user taps the field when they want to type.
  api.openPop = (focusSearch = wantsSearchFocus()) => {
    if (openPicker && openPicker !== api) openPicker.close();
    root.classList.add('open'); openPicker = api;
    btn.setAttribute('aria-expanded', 'true');
    pop.style.left = ''; pop.style.right = '';
    pop.classList.toggle('flip', root.getBoundingClientRect().left + 340 > window.innerWidth - 12);
    inp.value = ''; renderList();
    if (focusSearch) inp.focus();
    // clamp to the viewport — on narrow screens flip can push the popup off-screen
    const pr = pop.getBoundingClientRect(), rr = root.getBoundingClientRect();
    if (pr.left < 8) { pop.style.left = (8 - rr.left) + 'px'; pop.style.right = 'auto'; }
    else if (pr.right > window.innerWidth - 8) { pop.style.left = 'auto'; pop.style.right = (rr.right - (window.innerWidth - 8)) + 'px'; }
    fitPopup(root, pop, list, 340);
  };
  btn.addEventListener('click', e => {
    if (root.classList.contains('open')) { api.close(); return; }
    // detail 0 means Enter/Space activated the button, so a keyboard is in use
    api.openPop(e.detail === 0 || wantsSearchFocus());
  });
  inp.addEventListener('input', renderList);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(hl + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(hl - 1); }
    else if (e.key === 'Enter' && rows.length) { api.close(); api.set(rows[hl].p); }
  });
  renderBtn();
  return api;
}

// ---------- dropdowns that can show an icon ----------
// A native <option> can't hold an image, which left the Paldex's element and
// work filters showing emoji next to columns that show the game's own icons.
// The <select> stays in the DOM as the single source of truth — every existing
// .value read and change listener keeps working — and this draws over it.
function makeIconSelect(sel, dir, keyOf) {
  sel.classList.add('nativehide');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  const wrap = document.createElement('div');
  wrap.className = 'isel';
  // ARIA 1.2 select-only combobox: role=combobox on the trigger (a plain button
  // may not carry aria-activedescendant), aria-controls pointing at the listbox.
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'isel-btn';
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'iselpop-' + sel.id);
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  const pop = document.createElement('div');
  pop.className = 'isel-pop'; pop.setAttribute('role', 'listbox');
  pop.id = 'iselpop-' + sel.id;
  // the list scrolls, and a scrollable region has to be reachable; the rows are
  // options driven by aria-activedescendant rather than tab stops of their own
  pop.tabIndex = -1;
  if (sel.getAttribute('aria-label')) pop.setAttribute('aria-label', sel.getAttribute('aria-label'));
  sel.replaceWith(wrap);
  wrap.append(sel, btn, pop);

  const rowFor = o => {
    const r = document.createElement('div');
    r.className = 'isel-row'; r.setAttribute('role', 'option');
    r.id = 'iselopt-' + sel.id + '-' + (o.value || 'any');
    r.dataset.v = o.value;
    const k = o.value && keyOf(o.value);
    if (k) r.appendChild(uiIcon(dir, k, 16));
    r.append(o.textContent);
    return r;
  };
  function paint() {
    btn.textContent = '';
    const o = sel.selectedOptions[0];
    const k = o && o.value && keyOf(o.value);
    if (k) btn.appendChild(uiIcon(dir, k, 16));
    btn.append(o ? o.textContent : '');
    pop.querySelectorAll('.isel-row').forEach(r => {
      const on = r.dataset.v === sel.value;
      r.classList.toggle('on', on);
      r.setAttribute('aria-selected', String(on));
    });
    btn.setAttribute('aria-activedescendant',
      pop.querySelector('.isel-row.on')?.id || '');
  }
  function build() {
    pop.textContent = '';
    for (const o of sel.options) pop.appendChild(rowFor(o));
    paint();
  }
  const close = () => { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  const open = () => {
    wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    pop.querySelector('.isel-row.on')?.scrollIntoView({block: 'nearest'});
  };
  const pick = v => {
    if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', {bubbles: true})); }
    paint(); close(); btn.focus();
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    wrap.classList.contains('open') ? close() : open();
  });
  pop.addEventListener('click', e => {
    const r = e.target.closest('.isel-row');
    if (r) pick(r.dataset.v);
  });
  btn.addEventListener('keydown', e => {
    const rows = [...pop.querySelectorAll('.isel-row')];
    const i = rows.findIndex(r => r.dataset.v === sel.value);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!wrap.classList.contains('open')) { open(); return; }
      const ni = Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      pick(rows[ni].dataset.v); open();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault(); pick(rows[e.key === 'Home' ? 0 : rows.length - 1].dataset.v); open();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); wrap.classList.contains('open') ? close() : open();
    } else if (e.key === 'Escape' && wrap.classList.contains('open')) {
      e.preventDefault(); close();
    }
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  // Anything that writes sel.value and fires change repaints itself. Without
  // this the button is a picture of the state at the moment it was built: a
  // saved filter restored on boot left the control reading "Any element" while
  // 255 of 299 rows were hidden.
  sel.addEventListener('change', paint);
  // options are populated after this runs for some selects, so expose a rebuild
  return {refresh: build, sync: paint};
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
// the paldex table only becomes its own scroll container when it can't fit —
// see .tablewrap.panning in the stylesheet for why that matters to the header
const tableWrapEl = document.querySelector('.tablewrap');
const dexTableEl = tableWrapEl.querySelector('table');
function syncTablePan() {
  tableWrapEl.classList.toggle('panning', dexTableEl.scrollWidth > tableWrapEl.clientWidth + 1);
  tableWrapEl.classList.toggle('atend',
    tableWrapEl.scrollLeft + tableWrapEl.clientWidth >= tableWrapEl.scrollWidth - 4);
}
tableWrapEl.addEventListener('scroll', syncTablePan, {passive: true});
new ResizeObserver(syncTablePan).observe(tableWrapEl);
new ResizeObserver(syncTablePan).observe(dexTableEl);

// ---------- state ----------
const state = readStore('palbreed', {});
function save() {
  const s = {
    tab: currentTab, a: pickA.get()?.k, b: pickB.get()?.k, t: pickT.get()?.k, l: pickL.get()?.k,
    ownedOnly, dexOwnedOnly, rgroup: typeof groupBySpecies !== 'undefined' && groupBySpecies,
    pt: pickPT.get()?.k, po: partnerOwnedOnly, ac: avoidCollab, sp: slotPassives, sg: slotGenders,
    dp: desiredPick.get(),
    ro: !!currentRoute, chain: breedChain,
    hn: typeof hatchNewOnly !== 'undefined' && hatchNewOnly,
    hd: typeof hatchDepth !== 'undefined' ? hatchDepth : 1,
    pm: typeof planMode !== 'undefined' ? planMode : 'new',
    dt: dexType.value, dw: dexWork.value, dsort: dexSort,
    ck: typeof comboKind !== 'undefined' ? comboKind : '',
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
  if (v === 'map') mapActivate();
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
const MORE_TABS = ['hatch', 'roster', 'dex', 'map', 'guide'];
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
// The logo goes home like any other site's does. It's a real <a href="./"> so
// ctrl/middle-click and "open in new tab" behave normally; a plain click stays
// in-app rather than reloading the whole PWA.
document.querySelector('.logo a').addEventListener('click', e => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navTab('breed');
  scrollTo({top: 0, behavior: SMOOTH});
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
  } else if (currentTab === 'map') {
    if (mapSel) h += '/' + mapSel.id;
    else if (mapSpawnKey) h += '/spawn/' + mapSpawnKey;
    else if (mapLayer === 'Tree') h += '/tree';
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
    let brought = false; // did this link actually change the planner's inputs?
    if (ks.length) {
      for (const n of SLOTS) {
        const k = ks[n - 1] || null;
        if ((pickS[n].get()?.k || null) !== k) {
          brought = true;
          pickS[n].set(k ? byKey.get(k) : null, true);
          slotPassives[n] = []; slotGenders[n] = null;
        }
      }
      renderSlotChips();
    }
    const tp = resolvePal(y);
    if (tp) { brought = brought || pickPT.get()?.k !== tp.k; pickPT.set(tp, true); }
    // A shared route link shows the route, not saved plans. But updateHash
    // writes this same URL for the planner's own state, so reloading your own
    // page arrives here too — and forcing "new" there threw away the sub-tab
    // you were last on, which state.pm had just restored.
    if (brought) setPlanMode('new');
    showTab('plan');
    if (ks.length && tp) computeRoute();
    return true;
  }
  if (tab === 'map') {
    showTab('map');           // the viewport has no size until its tab is shown
    if (x === 'spawn') mapOpenSpawnRef(y);
    else if (x) mapOpenRef(x);
    else { mapSelect(null); mapSetSpawn(null); }
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
  if (opts.gtag) { const t = document.createElement('div'); t.className = 'gtag'; t.appendChild(genderize(opts.gtag)); body.appendChild(t); }
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
  for (const p of pairs.slice(0, reverseShown)) {
    const row = document.createElement('button'); row.className = 'pair'; row.type = 'button';
    const side = (pal, g) => {
      const s = document.createElement('span'); s.className = 'pside';
      s.appendChild(icon(pal, 32, true));
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = pal.n;
      s.appendChild(nm);
      if (os.has(pal.k)) { const o = document.createElement('span'); o.className = 'own'; o.textContent = '★'; o.title = 'Owned'; s.appendChild(o); }
      if (g) s.appendChild(gEl(g === 'Male' ? '♂' : '♀'));
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
      if (issue) { const w = document.createElement('span'); w.className = 'warnchip'; w.append('⚠ ', genderize(issue)); row.appendChild(w); }
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
      const ic = passiveIcon(meta, 14);
      if (ic) c.appendChild(ic);
      c.append(n + ' ✕'); c.title = (meta && meta.e) || 'Remove';
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
      const nm = document.createElement('span'); nm.className = 'trow-n';
      const ic = passiveIcon(p, 15);
      if (ic) nm.appendChild(ic);
      nm.append((p.mt ? '🧬 ' : '') + p.n);
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
    fitPopup(mount, pop, pop, 260); // this popup is its own scroller — no chrome
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
    const ic = passiveIcon(meta, 14);
    if (ic) c.appendChild(ic);
    c.append(n);
    c.title = (meta && meta.e) || '';
    w.appendChild(c);
  }
  return w;
}

// ---------- roster ----------
// one shape for roster entries however they arrive — storage, or an imported
// backup written before a field existed. ps is as optional as the rest: an
// entry without it used to take renderRoster down. id isn't optional — Edit,
// Remove and the "Newest" sort all address entries by it — so an entry that
// arrives without one is issued the same kind of id the editor mints.
const newEntryId = () => Date.now() + '' + Math.floor(Math.random() * 1e4);
function normRoster(list) {
  return list.filter(r => r && byKey.has(r.k)).map(r => ({...r,
    id: r.id ? String(r.id) : newEntryId(),
    g: r.g || null, nick: r.nick || '', note: r.note || '',
    iv: Array.isArray(r.iv) ? r.iv : null, ps: Array.isArray(r.ps) ? r.ps : []}));
}
let roster = normRoster(readStore('palbreed_roster', []));
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
    roster.push({id: newEntryId(), ...entry});
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
    const h = document.createElement('div'); h.className = 'hint';
    h.style.gridColumn = '1/-1'; h.style.padding = '14px 0';
    if (roster.length) {
      h.textContent = 'No roster pals match these filters.';
    } else {
      h.append('No pals in your roster yet. ');
      const b = document.createElement('button'); b.className = 'alink primary'; b.textContent = '+ Add your first pal';
      b.addEventListener('click', () => openRosterEditor(null));
      h.appendChild(b);
      h.append(' — or use “Add to roster” on any pal card.');
    }
    list.appendChild(h);
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
    if (r.g) { nm.appendChild(gEl(gsymR(r.g))); nm.append(' '); }
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
      const entry1 = entries.length === 1 ? entries[0] : null;
      head.tabIndex = 0;
      head.setAttribute('aria-label', 'View ' + p.n + ' details');
      head.title = 'View ' + p.n + '’s full card';
      head.addEventListener('click', e => { if (e.target.closest('button, input, a')) return; openModal(p, entry1); });
      head.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); openModal(p, entry1); } });
      head.appendChild(icon(p, 36));
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
      // the whole card opens the pal's page with this entry's details;
      // inner action buttons keep their own behavior
      card.tabIndex = 0;
      card.setAttribute('aria-label', 'View ' + (r.nick || p.n) + ' details');
      card.title = 'View ' + p.n + '’s full card';
      card.addEventListener('click', e => { if (e.target.closest('button, input, a')) return; openModal(p, r); });
      card.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); openModal(p, r); } });
      card.appendChild(icon(p, 44));
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
    if (r.g) chip.appendChild(gEl(gsymR(r.g)));
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
          roster = normRoster(Array.isArray(d.roster) ? d.roster : []);
          plans = normPlans(Array.isArray(d.plans) ? d.plans : []);
          owned.clear();
          for (const k of Array.isArray(d.owned) ? d.owned : []) if (byKey.has(k)) owned.add(k);
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
  if (best !== null) { localStorage.setItem('palbreed_planned', '1'); updateChecklist(); }
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
        w.appendChild(genderize(`⚠ Your ${byKey.get(st.aK).n} and ${byKey.get(st.bK).n} are both recorded as ${sym} — a breeding pair needs one ♂ and one ♀. You'll need an opposite-gender ${byKey.get(st.aK).n} or ${byKey.get(st.bK).n} (catch or hatch one) before this merge step.`));
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
    if (g) { const gg = gEl(gsym(g)); gg.title = 'Required gender'; u.appendChild(gg); }
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
    const expl = `≈${Math.round(opts.odds.p * 100)}% per egg to inherit all ${opts.odds.keep} tracked passive${opts.odds.keep === 1 ? '' : 's'} (pool of ${opts.odds.pool}). Expect ≈${Math.max(1, Math.round(1 / opts.odds.p))} eggs. ${opts.odds.rp ? 'Partner passives from your roster are included.' : 'Assumes a passive-free partner.'} Assumes a regular Cake — a Special Cake improves the odds. Community-measured.`;
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
  for (const [txt, label, fn] of [
    ['+', 'Zoom in', () => zoomAt(...mid(), 1.25)],
    ['−', 'Zoom out', () => zoomAt(...mid(), 1 / 1.25)],
    ['⤾', 'Reset view', () => { scale = fitScale; tx = fitX(); ty = 0; apply(); }],
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
  planModeEl.hidden = !plans.length;
  planModeEl.querySelector('[data-m="saved"]').textContent = `Saved plans (${plans.length})`;
  list.innerHTML = '';
  if (!plans.length) {
    if (planMode === 'saved') setPlanMode('new');
    list.innerHTML = '<div class="hint">No saved plans yet — compute a route and save it.</div>';
    return;
  }
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
  stats.textContent = `${rows.length} species from ${own.length} owned · ${depthLbl} · ${newCount} new`;
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
    ways.textContent = r.gen === 1 ? r.ways + (r.ways === 1 ? ' pair' : ' pairs') : r.gen + ' steps';
    card.appendChild(ways);
    card.title = (expanded ? 'Hide' : 'Show') + (r.gen === 1 ? ` the pairs that produce ${r.p.n}` : ` a breeding chain to ${r.p.n}`);
    card.addEventListener('click', () => { hatchOpen = expanded ? null : r.p.k; renderHatch(); });
    list.appendChild(card);
    if (expanded) list.appendChild(r.gen === 1 ? hatchPanel(r) : hatchChainPanel(r, kids, ownSet));
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
  steps.forEach((s, i) => panel.appendChild(stepEl(s, {stepNo: i + 1, onOpen: () => openChainStep(steps, i)})));
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
    if (!partnerOwnedOnly) { partnerOwnedOnly = true; setSwitch(partnerToggle, true); }
    setPlanMode('new');
    navTab('plan');
    save(); scheduleAuto();
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
    if (issue) { const w = document.createElement('span'); w.className = 'warnchip'; w.append('⚠ ', genderize(issue)); row.appendChild(w); }
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
// '' all · 'mix' two different species · 'self' bred from two of itself
let comboKind = '';
const comboKindEl = document.getElementById('comboKind');
function setComboKind(k, silent) {
  comboKind = k || '';
  comboKindEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.k === comboKind;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (!silent) { save(); renderCombos(); }
}
comboKindEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setComboKind(b.dataset.k); });
function renderCombos() {
  const list = document.getElementById('comboList');
  list.innerHTML = '';
  const q = document.getElementById('comboSearch').value.trim().toLowerCase();
  let rows = DATA.combos
    .map(c => ({a: byKey.get(c.a), b: byKey.get(c.b), c: byKey.get(c.c), ga: c.ga, gb: c.gb}))
    .filter(r => !comboKind || (comboKind === 'self' ? r.a === r.b : r.a !== r.b))
    .filter(r => !q || r.a.n.toLowerCase().includes(q) || r.b.n.toLowerCase().includes(q) || r.c.n.toLowerCase().includes(q));
  rows.sort((x, y) => x.c.n.localeCompare(y.c.n));
  document.getElementById('comboCount').textContent =
    rows.length === DATA.combos.length ? DATA.combos.length + ' unique combos' : rows.length + ' of ' + DATA.combos.length + ' combos';
  for (const r of rows) {
    // Result first, recipe underneath. Three equal pal units on one line left
    // every name truncated to "Azuro…" and read as a wall of same-sized icons;
    // these rows are sorted by result, so lead with it and mute the parents.
    const row = document.createElement('button'); row.className = 'combo'; row.type = 'button';
    row.appendChild(icon(r.c, 40));
    const body = document.createElement('span'); body.className = 'cbody';
    const res = document.createElement('span'); res.className = 'cres'; res.textContent = r.c.n;
    const recipe = document.createElement('span'); recipe.className = 'crecipe';
    const parent = (pal, g) => {
      const s = document.createElement('span'); s.className = 'cp';
      s.appendChild(icon(pal, 20));
      const nm = document.createElement('span'); nm.textContent = pal.n;
      s.appendChild(nm);
      if (g) s.appendChild(gEl(g === 'Male' ? '♂' : '♀'));
      return s;
    };
    if (r.a === r.b && r.a === r.c) {
      // 115 of 251 combos are a legendary/sub-species bred from two of itself —
      // spelling the same name out three times per card is what made the list
      // read as noise. The result heading above already names the pal.
      const t = document.createElement('span'); t.className = 'cself'; t.textContent = 'two of the same';
      recipe.appendChild(t);
    } else if (r.a === r.b) {
      recipe.append(parent(r.a, r.ga));
      const two = document.createElement('span'); two.className = 'cx'; two.textContent = '×2';
      recipe.appendChild(two);
    } else {
      const x = document.createElement('span'); x.className = 'cx'; x.textContent = '×';
      recipe.append(parent(r.a, r.ga), x, parent(r.b, r.gb));
    }
    body.append(res, recipe);
    row.appendChild(body);
    row.title = 'Load this pair in the Breed tab';
    row.setAttribute('aria-label', `${r.a.n} × ${r.b.n} makes ${r.c.n} — load this pair in the Breed tab`);
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
// upgrade the two Paldex filters and the roster's passive filter in place, so
// their rows match the icons the table and the chips already use
const dexTypeSel = makeIconSelect(dexType, 'element', v => v);
const dexWorkSel = makeIconSelect(dexWork, 'work', v => v);
dexTypeSel.refresh(); dexWorkSel.refresh();
const rosterPassiveSel = makeIconSelect(rosterPassiveFilter, 'passive',
  v => passiveIconKey(PASSIVES.find(p => p.n === v)));
rosterPassiveSel.refresh();
dexSearch.addEventListener('input', renderDex);
dexType.addEventListener('change', () => { save(); renderDex(); });
dexWork.addEventListener('change', () => {
  if (dexWork.value) dexSort = {key: 'w', dir: -1};
  save(); renderDex();
});
dexOwnedBtn.addEventListener('click', () => { dexOwnedOnly = !dexOwnedOnly; setSwitch(dexOwnedBtn, dexOwnedOnly); save(); renderDex(); });
function clearDexFilters() {
  dexSearch.value = ''; dexType.value = ''; dexWork.value = '';
  dexTypeSel.sync(); dexWorkSel.sync();      // these two are drawn over, not native
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
    const td4 = document.createElement('td'); td4.textContent = p.r;
    if (p.ic || uniqueChildren.has(p.k)) {
      // a caption rather than inline prose — inline, it wrapped to three lines
      // in the narrow mobile column and made row heights lurch
      const u = document.createElement('span'); u.className = 'uq'; u.textContent = 'unique only';
      td4.appendChild(u);
    }
    const td5 = document.createElement('td'); td5.className = 'hn'; td5.textContent = p.m + '%';
    const td6 = document.createElement('td'); td6.className = 'tworks';
    const parts = Object.entries(p.w || {}).sort((a,b) => b[1]-a[1])
      .map(([k,v]) => k === wk ? `<b>${workImgTag(k)}${v}</b>` : workImgTag(k) + v);
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
if (state.hd === 0 || state.hd === 2) setHatchDepth(state.hd, true);
if (state.dt) { dexType.value = state.dt; dexTypeSel.sync(); }
if (state.dw) { dexWork.value = state.dw; dexWorkSel.sync(); }
if (state.dsort && state.dsort.key) dexSort = state.dsort;
if (state.ck === 'mix' || state.ck === 'self') setComboKind(state.ck, true);
if (state.chain && Array.isArray(state.chain.steps)
    && state.chain.steps.every(s => byKey.has(s.aK) && byKey.has(s.bK) && byKey.has(s.cK))
    && state.chain.idx >= 0 && state.chain.idx < state.chain.steps.length) {
  breedChain = state.chain;
}
renderBreed(); renderReverse(); renderDex(); renderRoster(); renderPlans(); renderSlotChips();
if (state.pm === 'saved' && plans.length) setPlanMode('saved');
// first-visit setup checklist (dismissible; auto-hides once all steps are done)
{
  const bar = document.getElementById('setupbar');
  if (!localStorage.getItem('palbreed_tipseen')) {
    bar.hidden = false;
    document.getElementById('tipDismiss').addEventListener('click', () => {
      bar.hidden = true; localStorage.setItem('palbreed_tipseen', '1');
    });
    bar.querySelector('[data-su="star"]').addEventListener('click', () => {
      navTab('dex');
      toast('Tap ☆ next to any pal you own — stars power every “Owned” filter.');
    });
    bar.querySelector('[data-su="breed"]').addEventListener('click', () => {
      const a = PALS.find(p => p.n === 'Relaxaurus'), b = PALS.find(p => p.n === 'Sparkit');
      if (a && b) { pickA.set(a, true); pickB.set(b, true); renderBreed(); }
      navTab('breed');
    });
    bar.querySelector('[data-su="plan"]').addEventListener('click', () => {
      setPlanMode('new');
      navTab('plan');
      toast('Pick Start pal 1 and a target species — the route computes by itself.');
    });
    updateChecklist();
  }
}
// ---------- map view ----------
// One fixed 8192x8192 "map pixel" stage under a single transform. Tiles,
// markers and the link line are all positioned in map pixels and never move —
// panning and zooming rewrite exactly one transform plus one CSS variable
// (--iz = 1/scale), which the markers read to counter-scale themselves. That
// keeps a 255-marker layer at one style write per frame instead of 255.
const MAP = window.MAPDATA || null;
const MAP_SIZE = 8192, MAP_TILE = 512, MAP_MAXZ = 4;
const LAYER_DIR = {MainMap: 'main', Tree: 'tree'};
const LAYER_NAME = {MainMap: 'Palpagos Islands', Tree: 'World Tree'};
const MTYPE_NAME = {fastTravel: 'Fast travel point', tower: 'Syndicate tower',
  middleBoss: 'World Tree boss', alpha: 'Field alpha'};
// which species have a fixed alpha spawn — read by the pal card's "Show on map"
const MAP_ALPHAS = new Map();

const mapViewEl = document.getElementById('mapView');
const mapStageEl = document.getElementById('mapStage');
const mapTilesEl = document.getElementById('mapTiles');
const mapMarksEl = document.getElementById('mapMarks');
const mapLinkEl = document.getElementById('mapLink');
const mapLinkLine = document.getElementById('mapLinkLine');
const mapInfoEl = document.getElementById('mapInfo');
const mapHelpEl = document.getElementById('mapHelp');
const mapCountEl = document.getElementById('mapCount');
const mapResultsEl = document.getElementById('mapResults');
const mapSearchEl = document.getElementById('mapSearch');
const mapLayerSeg = document.getElementById('mapLayer');
const mapFilterSeg = document.getElementById('mapFilters');
const mapLabelSeg = document.getElementById('mapLabels');

const MAP_PREFS_V = 2;   // bump when a filter chip ships, so saved sets don't hide it
const mapPrefs = readStore('palarium_map', {});
let mapLayer = LAYER_DIR[mapPrefs.l] ? mapPrefs.l : 'MainMap';
const mapTypes = new Set(mapPrefs.v === MAP_PREFS_V && Array.isArray(mapPrefs.t)
  ? mapPrefs.t : ['alpha', 'fastTravel', 'tower', 'region']);
let mapK = 0.1, mapMinK = 0.05, mapTX = 0, mapTY = 0;
let mapSel = null, mapBuilt = false, mapQuery = '';
const mapEls = new Map();    // "layer|id" -> marker button
const mapTiles = new Map();  // "dir/z/x/y" -> img
let mapTileSig = '', mapBaseImg = null, mapGlideRAF = 0;
// A pan drags the marker along under the cursor, so a drag that starts on one
// also *ends* on it and Chrome fires a click. Without this the map selected a
// marker every time you grabbed the view near one.
let mapDragged = false;

// map prefs live in their own key: save() runs during boot, before this
// section has initialised, and reading these from there would be a TDZ crash
function mapSavePrefs() {
  localStorage.setItem('palarium_map',
    JSON.stringify({v: MAP_PREFS_V, l: mapLayer, t: [...mapTypes], lb: mapLabelMode}));
}

const mapKey = m => m.layer + '|' + m.id;
// BOSS_ rows name the tower variant (Boss_Anubis); the icon is the base pal's
const mapPal = m => m.pal ? (byKey.get(m.pal) || byKey.get(m.pal.replace(/^Boss_/, '')) || null) : null;
const mapTitle = m => m.type === 'alpha' ? (mapPal(m)?.n || m.label) : m.label;
// the tower filter chip covers the three World Tree mid-bosses too
const mapTypeOn = t => mapTypes.has(t === 'middleBoss' ? 'tower' : t);
// world units are centimetres
const fmtDist = d => d >= 1000 ? (d / 1000).toFixed(d < 10000 ? 1 : 0) + ' km' : Math.round(d / 5) * 5 + ' m';
const mapDist = (a, b) => Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y) / 100;

function mapMatch(m, q) {
  if (!q) return true;
  return (m.label || '').toLowerCase().includes(q)
    || (m.boss || '').toLowerCase().includes(q)
    || (mapPal(m)?.n || '').toLowerCase().includes(q);
}

// ---- view transform ----
function mapApply() {
  mapStageEl.style.transform = `translate3d(${mapTX}px,${mapTY}px,0) scale(${mapK})`;
  mapStageEl.style.setProperty('--iz', 1 / mapK);
  mapStageEl.classList.toggle('lab', mapK >= 0.2);
  const rt = 'r' + stageTier(mapK);
  if (!mapStageEl.classList.contains(rt)) {
    mapStageEl.classList.remove('r0', 'r1', 'r2', 'r3');
    mapStageEl.classList.add(rt);
  }
  mapLinkLine.style.strokeWidth = 2.5 / mapK + 'px';
  mapLinkLine.style.strokeDasharray = `${14 / mapK} ${18 / mapK}`;
  mapRenderTiles();
  // the zone edge is baked into the canvas, so it only needs repainting when
  // the zoom bucket changes — a few times per session, not per frame
  if (mapSpawnKey && mapZonesStale()) mapQueueZones();
  mapQueueLabels();
}
// Both textures are square, but the playable area inside them isn't: the
// surface is a diamond and the World Tree fills barely two thirds. Fitting and
// clamping to the marker bounding box instead of the raw 8192 square stops the
// default view from opening on a frame of empty ocean, and stops panning off
// into the void.
const mapBoundsCache = new Map();
function mapBounds() {
  let b = mapBoundsCache.get(mapLayer);
  if (b) return b;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of MAP.markers) {
    if (m.layer !== mapLayer) continue;
    x0 = Math.min(x0, m.map.x); x1 = Math.max(x1, m.map.x);
    y0 = Math.min(y0, m.map.y); y1 = Math.max(y1, m.map.y);
  }
  if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = MAP_SIZE; }
  const pad = MAP_SIZE * 0.025;   // markers stop short of the coastline
  b = {x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad),
       x1: Math.min(MAP_SIZE, x1 + pad), y1: Math.min(MAP_SIZE, y1 + pad)};
  mapBoundsCache.set(mapLayer, b);
  return b;
}
function mapClampTo(k, tx, ty) {
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight, b = mapBounds();
  const w = (b.x1 - b.x0) * k, h = (b.y1 - b.y0) * k;
  return [
    w <= cw ? (cw - w) / 2 - b.x0 * k : Math.min(-b.x0 * k, Math.max(cw - b.x1 * k, tx)),
    h <= ch ? (ch - h) / 2 - b.y0 * k : Math.min(-b.y0 * k, Math.max(ch - b.y1 * k, ty)),
  ];
}
function mapClamp() { [mapTX, mapTY] = mapClampTo(mapK, mapTX, mapTY); }
function mapZoomTo(k, px, py) {
  k = Math.max(mapMinK, Math.min(1, k));
  if (Math.abs(k - mapK) < 1e-6) return;
  if (px == null) { px = mapViewEl.clientWidth / 2; py = mapViewEl.clientHeight / 2; }
  mapTX = px - (px - mapTX) * (k / mapK);
  mapTY = py - (py - mapTY) * (k / mapK);
  mapK = k;
  mapClamp(); mapApply();
}
function mapStopGlide() { if (mapGlideRAF) { cancelAnimationFrame(mapGlideRAF); mapGlideRAF = 0; } }
function mapGlide(tx, ty, k) {
  mapStopGlide();
  if (SMOOTH === 'auto') { mapK = k; mapTX = tx; mapTY = ty; mapApply(); return; }
  const t0 = performance.now(), k0 = mapK, x0 = mapTX, y0 = mapTY;
  const step = now => {
    const u = Math.min(1, (now - t0) / 340), e = 1 - (1 - u) ** 3;
    mapK = k0 + (k - k0) * e; mapTX = x0 + (tx - x0) * e; mapTY = y0 + (ty - y0) * e;
    mapApply();
    mapGlideRAF = u < 1 ? requestAnimationFrame(step) : 0;
  };
  mapGlideRAF = requestAnimationFrame(step);
}
function mapFit(animate) {
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!cw || !ch) return;
  const b = mapBounds();
  mapMinK = Math.min(1, cw / (b.x1 - b.x0), ch / (b.y1 - b.y0));
  const [tx, ty] = mapClampTo(mapMinK, 0, 0);
  if (animate) mapGlide(tx, ty, mapMinK);
  else { mapK = mapMinK; mapTX = tx; mapTY = ty; mapApply(); }
}
function mapFocus(m, zoom) {
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!cw || !ch) return;
  const k = Math.max(mapMinK, Math.min(1, zoom ?? Math.max(mapK, 0.34)));
  const [tx, ty] = mapClampTo(k, cw / 2 - m.map.x * k, ch / 2 - m.map.y * k);
  mapGlide(tx, ty, k);
}

// ---- tiles ----
// Pick the level whose 512px tiles render at ~512 CSS px or better. z4 is the
// source's native 8192px, so at maximum scale the viewer shows 1:1 pixels and
// never upscales — the real fix for a soft map. It costs 41 MB of the pyramid's
// 64, which is why tiles are fetched on demand rather than precached.
const mapTileZoom = k => Math.max(0, Math.min(MAP_MAXZ, Math.ceil(Math.log2(k * MAP_SIZE / MAP_TILE))));
function mapRenderTiles() {
  const dir = LAYER_DIR[mapLayer];
  const z = mapTileZoom(mapK), n = 2 ** z, span = MAP_SIZE / n;
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  const l = Math.max(0, Math.floor(-mapTX / mapK / span) - 1);
  const t = Math.max(0, Math.floor(-mapTY / mapK / span) - 1);
  const r = Math.min(n - 1, Math.floor((-mapTX + cw) / mapK / span) + 1);
  const b = Math.min(n - 1, Math.floor((-mapTY + ch) / mapK / span) + 1);
  const sig = `${dir}/${z}/${l},${t},${r},${b}`;
  if (sig === mapTileSig) return;
  mapTileSig = sig;

  const want = new Set();
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
    const key = `${dir}/${z}/${x}/${y}`;
    want.add(key);
    if (mapTiles.has(key)) continue;
    const img = new Image();
    img.alt = ''; img.decoding = 'async'; img.draggable = false;
    // +1px overlap kills the hairline seams that fractional scaling leaves
    // between neighbours; at 1/1024 of a tile the distortion is invisible
    img.style.cssText = `left:${x * span}px;top:${y * span}px;width:${span + 1}px;height:${span + 1}px`;
    img.src = `assets/map/${dir}/${z}/${x}_${y}.webp`;
    mapTiles.set(key, img);
    mapTilesEl.appendChild(img);
  }
  for (const [key, img] of mapTiles) {
    if (want.has(key)) continue;
    img.remove(); mapTiles.delete(key);
  }
}
function mapResetTiles() {
  for (const img of mapTiles.values()) img.remove();
  mapTiles.clear(); mapTileSig = '';
  if (!mapBaseImg) {
    mapBaseImg = new Image();
    mapBaseImg.className = 'base'; mapBaseImg.alt = ''; mapBaseImg.draggable = false;
    mapTilesEl.appendChild(mapBaseImg);
  }
  // z0 sits under every detail level so changing level never flashes the
  // background while the replacement tiles decode
  mapBaseImg.src = `assets/map/${LAYER_DIR[mapLayer]}/0/0_0.webp`;
  mapTilesEl.insertBefore(mapBaseImg, mapTilesEl.firstChild);
}

// ---- markers ----
function mapBuildMarkers() {
  mapMarksEl.textContent = ''; mapEls.clear();
  for (const m of MAP.markers) {
    if (m.layer !== mapLayer) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mk mk-' + m.type; b.tabIndex = -1;
    b.style.left = m.map.x + 'px'; b.style.top = m.map.y + 'px';
    const g = document.createElement('span'); g.className = 'g';
    if (m.type === 'alpha') {
      const p = mapPal(m);
      const im = new Image();
      im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.draggable = false;
      im.onerror = () => {
        const f = document.createElement('span');
        f.className = 'fb'; f.textContent = (mapTitle(m) || '?')[0];
        im.replaceWith(f);
      };
      if (p) im.src = IMG + p.img; else im.onerror();
      g.appendChild(im);
      if (m.level) {
        const lv = document.createElement('span'); lv.className = 'lvl';
        lv.textContent = 'Lv ' + m.level; b.appendChild(lv);
      }
    }
    // waypoints, towers and World Tree bosses are drawn by CSS from the game's
    // own compass icons, so .g needs nothing in it
    b.appendChild(g);
    const lb = document.createElement('span'); lb.className = 'lb';
    lb.textContent = mapTitle(m); b.appendChild(lb);
    const t = mapTitle(m) + ' — ' + MTYPE_NAME[m.type] + (m.level ? ' Lv ' + m.level : '');
    b.title = t; b.setAttribute('aria-label', t);
    b.addEventListener('click', e => { e.stopPropagation(); if (!mapDragged) mapSelect(m); });
    mapEls.set(mapKey(m), b);
    mapMarksEl.appendChild(b);
  }
}
function mapSyncMarkers() {
  mapRegionsEl.hidden = !mapTypes.has('region');
  const q = mapQuery.trim().toLowerCase();
  const counts = {alpha: 0, fastTravel: 0, tower: 0, middleBoss: 0};
  let matches = 0;
  for (const m of MAP.markers) {
    if (m.layer !== mapLayer) continue;
    const el = mapEls.get(mapKey(m)); if (!el) continue;
    const on = mapTypeOn(m.type);
    el.hidden = !on;
    const hit = mapMatch(m, q);
    el.classList.toggle('dim', on && !!q && !hit);
    if (on) { counts[m.type]++; if (hit) matches++; }
  }
  mapQueueLabels();
  if (q) {
    // a query can match a species (spawn areas) as well as places, and saying
    // "0 matches" next to a species result on screen is just wrong
    const sp = PALS.filter(p => p.n.toLowerCase().includes(q) && spawnEntries(p.k).length).length;
    const bits = [];
    if (sp) bits.push(sp + (sp === 1 ? ' species' : ' species'));
    bits.push(matches + (matches === 1 ? ' place' : ' places'));
    mapCountEl.textContent = bits.join(' · ');
  } else {
    const parts = [];
    if (mapTypes.has('alpha')) parts.push(counts.alpha + ' alphas');
    if (mapTypes.has('fastTravel')) parts.push(counts.fastTravel + ' waypoints');
    if (mapTypes.has('tower')) parts.push(counts.tower + counts.middleBoss + ' towers');
    mapCountEl.textContent = parts.join(' · ') || 'No markers shown';
  }
}

// ---- search results (cross-layer, so "where is Jetragon" works from anywhere) ----
function mapRenderResults() {
  const q = mapQuery.trim().toLowerCase();
  mapResultsEl.textContent = '';
  if (!q) { mapResultsEl.hidden = true; return; }
  // Two kinds of answer to "where is X": the place called X, and the species
  // called X. Species come first — someone typing a pal name wants its range,
  // and any alpha marker of the same name is listed right underneath.
  const species = PALS.filter(p => p.n.toLowerCase().includes(q) && spawnEntries(p.k).length);
  species.sort((a, b) =>
    (b.n.toLowerCase().startsWith(q) ? 1 : 0) - (a.n.toLowerCase().startsWith(q) ? 1 : 0)
    || a.n.localeCompare(b.n));
  const hits = MAP.markers.filter(m => mapTypeOn(m.type) && mapMatch(m, q));
  hits.sort((a, b) => {
    const an = mapTitle(a).toLowerCase(), bn = mapTitle(b).toLowerCase();
    return (bn.startsWith(q) ? 1 : 0) - (an.startsWith(q) ? 1 : 0)
      || (a.layer === mapLayer ? -1 : 0) - (b.layer === mapLayer ? -1 : 0)
      || an.localeCompare(bn);
  });
  mapResultsEl.hidden = false;
  const SPECIES_CAP = 4, MARKER_CAP = 8;
  for (const p of species.slice(0, SPECIES_CAP)) {
    const sum = mapSpawnSummary(p.k);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mres sp';
    const im = new Image(); im.src = IMG + p.img; im.alt = ''; im.loading = 'lazy';
    const tx = document.createElement('span');
    tx.textContent = p.n + ' · ' + sum.spots + ' spawn areas';
    b.append(im, tx);
    b.title = 'Show where ' + p.n + ' spawns';
    b.addEventListener('click', () => { mapSelect(null); mapSetSpawn(p.k, true); });
    mapResultsEl.appendChild(b);
  }
  for (const m of hits.slice(0, MARKER_CAP)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mres';
    const p = mapPal(m);
    if (p) {
      const im = new Image(); im.src = IMG + p.img; im.alt = ''; im.loading = 'lazy'; b.appendChild(im);
    } else {
      const g = document.createElement('span');
      g.className = 'rt ' + (m.type === 'fastTravel' ? 'ft' : 'tw');
      b.appendChild(g);
    }
    const tx = document.createElement('span');
    tx.textContent = mapTitle(m) + (m.level ? ' · Lv ' + m.level : '')
      + (m.layer === mapLayer ? '' : ' · ' + LAYER_NAME[m.layer]);
    b.appendChild(tx);
    b.addEventListener('click', () => mapSelect(m, true));
    mapResultsEl.appendChild(b);
  }
  const extra = Math.max(0, species.length - SPECIES_CAP) + Math.max(0, hits.length - MARKER_CAP);
  if (!hits.length && !species.length) {
    const s = document.createElement('span'); s.className = 'more';
    s.textContent = 'Nothing matches “' + mapQuery.trim() + '” — try a pal or waypoint name.';
    mapResultsEl.appendChild(s);
  } else if (extra) {
    const s = document.createElement('span'); s.className = 'more';
    s.textContent = '+' + extra + ' more'; mapResultsEl.appendChild(s);
  }
}

// ---- selection + detail panel ----
function mapNearest(m, type, n) {
  return MAP.markers
    .filter(f => f.type === type && f.layer === m.layer && f !== m)
    .map(f => ({f, d: mapDist(f, m)}))
    .sort((a, b) => a.d - b.d).slice(0, n);
}
function mapSelect(m, focus) {
  if (!MAP) return;
  if (m && m.layer !== mapLayer) mapSetLayer(m.layer);
  for (const el of mapEls.values()) el.classList.remove('sel', 'near');
  mapSel = m || null;
  if (!mapSel) {
    mapLinkEl.classList.add('off');
    const sp = mapSpawnKey && byKey.get(mapSpawnKey);
    if (sp) mapRenderSpawnInfo(sp);
    else { mapInfoEl.hidden = true; mapInfoEl.textContent = ''; }
    updateHash();
    return;
  }
  mapEls.get(mapKey(mapSel))?.classList.add('sel');
  mapRenderInfo(mapSel);
  if (focus) mapFocus(mapSel);
  updateHash();
}
function mapLinkTo(a, b) {
  if (!a || !b) { mapLinkEl.classList.add('off'); return; }
  mapLinkLine.setAttribute('x1', a.map.x); mapLinkLine.setAttribute('y1', a.map.y);
  mapLinkLine.setAttribute('x2', b.map.x); mapLinkLine.setAttribute('y2', b.map.y);
  mapLinkEl.classList.remove('off');
}
function mapRenderInfo(m) {
  mapInfoEl.hidden = false;
  mapInfoEl.textContent = '';
  const p = mapPal(m);

  const x = document.createElement('button');
  x.type = 'button'; x.className = 'iclose'; x.textContent = '✕';
  x.setAttribute('aria-label', 'Close marker details');
  x.addEventListener('click', () => mapSelect(null));
  mapInfoEl.appendChild(x);

  const head = document.createElement('div'); head.className = 'ihead';
  if (p) head.appendChild(icon(p, 44, true));
  const hb = document.createElement('div');
  const h3 = document.createElement('h3'); h3.textContent = mapTitle(m); hb.appendChild(h3);
  const sub = document.createElement('div'); sub.className = 'isub';
  sub.textContent = MTYPE_NAME[m.type] + (m.level ? ' · Lv ' + m.level : '')
    + (m.boss ? ' · ' + m.boss : '');
  hb.appendChild(sub);
  head.appendChild(hb);
  mapInfoEl.appendChild(head);

  if (p) {
    const crow = document.createElement('div'); crow.className = 'crow';
    crow.appendChild(typeChips(p)); crow.appendChild(tierBadge(p));
    mapInfoEl.appendChild(crow);
  }

  // an alpha or a tower wants the nearest statue; a statue wants to know what's
  // worth walking to from it
  const wantFT = m.type !== 'fastTravel';
  const list = wantFT ? mapNearest(m, 'fastTravel', 3) : mapNearest(m, 'alpha', 4);
  const lb = document.createElement('div'); lb.className = 'nlb';
  lb.textContent = wantFT ? 'Closest fast travel' : 'Alphas near here';
  mapInfoEl.appendChild(lb);
  if (!list.length) {
    const e = document.createElement('div'); e.className = 'isub';
    e.textContent = wantFT ? 'No fast travel point on this layer.' : 'No alphas on this layer.';
    mapInfoEl.appendChild(e);
  } else {
    const wrap = document.createElement('div'); wrap.className = 'near';
    list.forEach(({f, d}, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const n = document.createElement('span'); n.textContent = mapTitle(f) + (f.level ? ' · Lv ' + f.level : '');
      const dd = document.createElement('span'); dd.className = 'd'; dd.textContent = fmtDist(d);
      b.append(n, dd);
      b.title = 'Show ' + mapTitle(f) + ' on the map';
      b.addEventListener('click', () => mapSelect(f, true));
      wrap.appendChild(b);
      if (i === 0) { mapEls.get(mapKey(f))?.classList.add('near'); mapLinkTo(m, f); }
    });
    mapInfoEl.appendChild(wrap);
  }
  if (!list.length) mapLinkTo(null, null);

  const acts = document.createElement('div'); acts.className = 'iacts';
  if (p) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'alink'; b.textContent = 'Pal card';
    b.addEventListener('click', () => openModal(p));
    acts.appendChild(b);
  }
  const cp = document.createElement('button');
  cp.type = 'button'; cp.className = 'alink'; cp.textContent = 'Copy link';
  cp.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0] + '#/map/' + m.id);
      toast('Link to ' + mapTitle(m) + ' copied');
    } catch { toast('Copy failed — clipboard blocked by browser'); }
  });
  acts.appendChild(cp);
  mapInfoEl.appendChild(acts);
}

// ---- layer ----
function mapSetLayer(l) {
  if (!LAYER_DIR[l] || l === mapLayer) return;
  mapLayer = l;
  mapSavePrefs();
  mapLayerSeg.querySelectorAll('button').forEach(b => {
    const on = b.dataset.l === l;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
  mapSel = null;
  mapInfoEl.hidden = true; mapInfoEl.textContent = '';
  mapLinkEl.classList.add('off');
  mapResetTiles();
  mapBuildMarkers();
  mapBuildRegions();
  mapSyncMarkers();
  mapRenderResults();
  mapDrawZones();
  if (mapSpawnKey) { const p = byKey.get(mapSpawnKey); if (p) mapRenderSpawnInfo(p); }
  mapFit();
  updateHash();
}

// ---- activation (the container has no size until the tab is shown) ----
const mapPhone = () => matchMedia('(max-width:640px)').matches;
const mapHeadH = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hh')) || 0;
function mapSyncHeight() {
  if (!MAP) return;
  // On a phone the control stack above the map runs to half the screen, so a
  // height derived from 100dvh alone pushed the viewport's bottom edge — and
  // with it the info sheet anchored to it — under the fold. Measure instead.
  if (!mapPhone()) { mapViewEl.style.height = ''; return; }
  const navH = bottomNavEl.offsetHeight || 0;
  mapViewEl.style.height = Math.max(300, window.innerHeight - mapHeadH() - navH - 22) + 'px';
}
function mapActivate() {
  if (!MAP) return;
  mapSyncHeight();
  if (!mapBuilt) {
    mapBuilt = true;
    mapResetTiles();
    mapBuildMarkers();
    mapBuildRegions();
    mapSyncMarkers();
    mapFit();
    // the search box offers species as well as places, so the spawn table has
    // to be here before the user types — but not before they open the tab
    mapLoadSpawns().then(() => {
      mapRenderResults();
      if (mapSpawnKey) mapSetSpawn(mapSpawnKey);
    }).catch(() => toast('Spawn data failed to load — markers still work'));
  }
  // the map now owns a screenful; bring it under the header rather than
  // leaving the user staring at filter chips with the map below the fold
  if (mapPhone()) requestAnimationFrame(() => {
    const top = mapViewEl.getBoundingClientRect().top + window.scrollY - mapHeadH() - 8;
    if (Math.abs(window.scrollY - top) > 10) scrollTo({top: Math.max(0, top), behavior: SMOOTH});
  });
}
// resolves #/map/<marker-id> and #/map/tree
// #/map/spawn/<pal> — resolves the same aliases as every other pal link, and
// waits on the spawn table if the map is opening cold from this URL
function mapOpenSpawnRef(ref) {
  if (!MAP) return;
  const p = resolvePal(ref);
  if (!p) { badLink('Link not recognized — unknown pal' + (ref ? ' “' + ref + '”' : '')); return; }
  mapSelect(null);
  mapLoadSpawns().then(() => mapSetSpawn(p.k, true)).catch(() => {});
}
function mapOpenRef(ref) {
  if (!MAP || !ref) return;
  const low = String(ref).toLowerCase();
  if (low === 'tree') { mapSetLayer('Tree'); return; }
  if (low === 'main' || low === 'mainmap') { mapSetLayer('MainMap'); return; }
  const m = MAP.markers.find(k => k.id && k.id.toLowerCase() === low);
  if (m) mapSelect(m, true);
  else badLink('Link not recognized — no map marker “' + ref + '”');
}

// ---------- spawn zones ----------
// js/spawndata.js is ~120 KB and only the map ever reads it, so it loads on
// first use rather than with the shell. Everything below no-ops until it lands.
const mapZonesEl = document.getElementById('mapZones');
const mapRegionsEl = document.getElementById('mapRegions');
const spawnBarEl = document.getElementById('spawnBar');
const SPAWN_NIGHT = 1;

let SPAWN = null, spawnLoading = null;
let spawnByPal = null;                 // palKey -> [{gi, lo, hi, w, f}]
let spawnRuns = null;                  // layer -> Map(gi -> [gi, x,y, x,y, ...])
let mapSpawnKey = null;

function mapLoadSpawns() {
  if (SPAWN) return Promise.resolve(SPAWN);
  if (spawnLoading) return spawnLoading;
  spawnLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'js/spawndata.js';
    s.onload = () => {
      SPAWN = window.SPAWNDATA;
      spawnByPal = new Map();
      SPAWN.groups.forEach((entries, gi) => {
        for (const [k, lo, hi, w, f] of entries) {
          if (!spawnByPal.has(k)) spawnByPal.set(k, []);
          spawnByPal.get(k).push({gi, lo, hi, w, f});
        }
      });
      spawnRuns = {};
      for (const [layer, runs] of Object.entries(SPAWN.spots)) {
        const m = new Map();
        for (const run of runs) m.set(run[0], run);
        spawnRuns[layer] = m;
      }
      res(SPAWN);
    };
    s.onerror = () => { spawnLoading = null; rej(new Error('spawn data unavailable')); };
    document.head.appendChild(s);
  });
  return spawnLoading;
}

const spawnEntries = k => (spawnByPal && spawnByPal.get(k)) || [];
// map pixels -> metres, per layer: the World Tree texture covers a quarter the
// world span of the surface, so a pixel is worth four times less there
const mPerPx = layer => {
  const w = MAP.layers[layer].world;
  return (w.maxY - w.minY) / MAP.layers[layer].size / 100;
};

// every spawn point for a species on one layer, as a flat [x,y,...] list
function spawnPoints(palKey, layer) {
  const runs = spawnRuns && spawnRuns[layer];
  if (!runs) return [];
  const pts = [];
  for (const {gi} of spawnEntries(palKey)) {
    const run = runs.get(gi);
    if (!run) continue;
    for (let i = 1; i < run.length; i += 2) pts.push(run[i], run[i + 1]);
  }
  return pts;
}
const spawnLayersFor = k => Object.keys(MAP.layers).filter(l => spawnPoints(k, l).length);

// ---- the overlay ----
// Canvas rather than SVG: a common species like Mimog has 5,327 circles, which
// is a fine single canvas path and a terrible DOM. Circles are filled opaque
// into one path and the *element* carries the opacity, so overlapping areas
// read as one blob instead of compounding into a dark core.
// A flat wash at low opacity vanished over open water and pale terrain, so the
// union gets a hard bright edge instead. The trick that makes that cheap: every
// spot in a group is the same radius, so union(r) minus union(r - w) is exactly
// a band following the union's outline. Fill the outer union opaque, then knock
// the inner union back with a partially transparent destination-out — one
// canvas, two passes, no per-circle strokes showing through the interior.
// How likely this species is in a given spawner group: its weight over the
// group's total. A pal that's 30% of one biome's table and 3% of another's is
// worth telling apart, and the numbers were already sitting in the data unused.
function spawnShares(palKey) {
  const out = new Map();
  if (!SPAWN) return out;
  for (const {gi, w} of spawnEntries(palKey)) {
    const total = SPAWN.groups[gi].reduce((a, e) => a + e[3], 0) || 1;
    out.set(gi, w / total);
  }
  return out;
}

// Sequential encoding is one hue with monotone lightness — the previous ramp
// slid amber -> red, which is two hues doing one hue's job. Generated by
// tools/zone-ramp.js from the documented orange slot: constant hue (OKLCH 40deg),
// L climbing 0.52 -> 0.84, chroma peaking mid so the top step isn't neon.
// Orange rather than the documented blue sequential default because the surface
// is a satellite map — blue reads as ocean and green as forest.
//
// Discrete buckets, not a continuous gradient: a reader can name which bucket a
// patch is in, but not which shade. ARK's spawn maps bucket theirs too.
const ZONE_RAMP = ['#c64f1f', '#e65e28', '#ff7642', '#fe9e7c', '#ffc0ab'];
// Alpha climbs with lightness rather than sitting flat. Over imagery a constant
// alpha turns the weakest bucket into a blanket over the terrain; monotone
// alpha in the same direction as lightness keeps the encoding single-meaning —
// weak recedes, strong dominates — and lets the map read through underneath.
const ZONE_ALPHA = [0.26, 0.35, 0.43, 0.52, 0.6];
const ZONE_EDGE = '#ffd9a8';
const ZONE_OUTLINE = 'rgba(8,10,14,.82)';
// widths in *screen* pixels, converted to map units at draw time
const RING_SCREEN = 3.4, OUTLINE_SCREEN = 1.6;
// Backing-store cap. At scale 1 a 1200px viewport needs ~2800px of canvas at
// dpr 2; the cap keeps a large monitor at high dpr from allocating a surface
// that would push a phone into a decode failure.
const ZONE_MAX_PX = 3072;
let zoneView = null;          // the map rect currently drawn, in map pixels

// Redraw when the view leaves what's painted or the scale moved materially.
// Panning inside the margin costs nothing — the canvas lives in the stage and
// is positioned in map pixels, so it moves with everything else.
function mapZonesStale() {
  if (!zoneView) return true;
  if (Math.abs(zoneView.k - mapK) / mapK > 0.02) return true;
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  const vx = -mapTX / mapK, vy = -mapTY / mapK;
  return vx < zoneView.x || vy < zoneView.y ||
         vx + cw / mapK > zoneView.x + zoneView.w ||
         vy + ch / mapK > zoneView.y + zoneView.h;
}

function mapDrawZones() {
  const ctx = mapZonesEl.getContext('2d');
  if (!mapSpawnKey || !SPAWN) {
    mapZonesEl.hidden = true; zoneView = null;
    mapZonesEl.width = mapZonesEl.height = 1;
    return 0;
  }
  const runs = spawnRuns[mapLayer];
  const radii = SPAWN.radii[mapLayer];
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!runs || !radii || !cw || !ch) { mapZonesEl.hidden = true; return 0; }

  // Cover the visible map rect plus a margin, at the resolution it's displayed
  // at. A fixed 2048px canvas across the whole 8192px map was a quarter-scale
  // texture stretched 4x at maximum zoom, which is exactly what "pixelated and
  // blurry when you zoom in" looks like.
  const vw = cw / mapK, vh = ch / mapK;
  const mx = vw * 0.3, my = vh * 0.3;
  const rect = {
    x: Math.max(0, -mapTX / mapK - mx),
    y: Math.max(0, -mapTY / mapK - my),
  };
  rect.w = Math.min(MAP_SIZE - rect.x, vw + mx * 2);
  rect.h = Math.min(MAP_SIZE - rect.y, vh + my * 2);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.min(mapK * dpr, ZONE_MAX_PX / Math.max(rect.w, rect.h));
  mapZonesEl.width = Math.max(1, Math.round(rect.w * px));
  mapZonesEl.height = Math.max(1, Math.round(rect.h * px));
  mapZonesEl.style.left = rect.x + 'px';
  mapZonesEl.style.top = rect.y + 'px';
  mapZonesEl.style.width = rect.w + 'px';
  mapZonesEl.style.height = rect.h + 'px';
  // draw in map pixels; the transform handles the rest
  ctx.setTransform(px, 0, 0, px, -rect.x * px, -rect.y * px);
  ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalCompositeOperation = 'source-over';
  zoneView = {...rect, k: mapK};

  const ring = RING_SCREEN / mapK, outline = OUTLINE_SCREEN / mapK;
  const shares = spawnShares(mapSpawnKey);
  const peak = Math.max(...shares.values(), 0.0001);

  // One path per ramp bucket rather than per group: overlapping circles of the
  // same bucket are the same probability and shouldn't darken each other, and
  // buckets paint low-to-high so the better rate wins where two overlap.
  const buckets = ZONE_RAMP.map(() => null);
  const oOut = new Path2D(), oIn = new Path2D(), rOut = new Path2D(), rIn = new Path2D();
  let n = 0;
  for (const {gi} of spawnEntries(mapSpawnKey)) {
    const run = runs.get(gi);
    if (!run) continue;
    const r = Math.max(1, radii[gi]);
    const ri = Math.max(0.5, r - ring);
    const bi = Math.min(ZONE_RAMP.length - 1,
      Math.floor((shares.get(gi) || 0) / peak * ZONE_RAMP.length * 0.999));
    if (!buckets[bi]) buckets[bi] = new Path2D();
    const body = buckets[bi];
    for (let i = 1; i < run.length; i += 2) {
      const cx = run[i], cy = run[i + 1];
      // a moveTo before each arc, or every circle joins the last one
      oOut.moveTo(cx + r + outline, cy); oOut.arc(cx, cy, r + outline, 0, Math.PI * 2);
      rOut.moveTo(cx + r, cy);           rOut.arc(cx, cy, r, 0, Math.PI * 2);
      rIn.moveTo(cx + ri, cy);           rIn.arc(cx, cy, ri, 0, Math.PI * 2);
      oIn.moveTo(cx + ri - outline, cy); oIn.arc(cx, cy, Math.max(0.2, ri - outline), 0, Math.PI * 2);
      body.moveTo(cx + ri, cy);          body.arc(cx, cy, ri, 0, Math.PI * 2);
      n++;
    }
  }
  if (!n) { mapZonesEl.hidden = true; return 0; }

  // Edge as a band: every spot in a group shares a radius, so union(r) minus
  // union(r - w) is exactly the union's outline. It's sandwiched in dark so it
  // stays readable over snow and sand as well as forest and ocean — the same
  // trick the map's text labels use.
  ctx.fillStyle = ZONE_OUTLINE; ctx.fill(oOut);
  ctx.fillStyle = ZONE_EDGE;    ctx.fill(rOut);
  ctx.fillStyle = ZONE_OUTLINE; ctx.fill(rIn);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';       ctx.fill(oIn);
  ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.clip(oIn);
  for (let i = 0; i < buckets.length; i++) {
    if (!buckets[i]) continue;
    ctx.globalAlpha = ZONE_ALPHA[i];
    ctx.fillStyle = ZONE_RAMP[i];
    ctx.fill(buckets[i]);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  mapZonesEl.hidden = false;
  return n;
}

// ---- "which statue do I warp to" ----
// Ranked by how many spawn points sit within reach of each fast-travel point,
// not by raw distance: the nearest statue to one stray spawner is less useful
// than the one sitting in the middle of the herd.
function mapSpawnHubs(palKey, layer, n = 3) {
  const pts = spawnPoints(palKey, layer);
  if (!pts.length) return [];
  const reach = 1200 / mPerPx(layer);          // 1.2 km, in map pixels
  const hubs = [];
  for (const f of MAP.markers) {
    if (f.type !== 'fastTravel' || f.layer !== layer) continue;
    let near = 0, best = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i] - f.map.x, pts[i + 1] - f.map.y);
      if (d < reach) near++;
      if (d < best) best = d;
    }
    hubs.push({f, near, best});
  }
  hubs.sort((a, b) => b.near - a.near || a.best - b.best);
  return hubs.slice(0, n);
}

// ---- selection ----
function mapSetSpawn(palKey, focus) {
  const p = palKey ? byKey.get(palKey) : null;
  mapSpawnKey = p ? p.k : null;
  if (!mapSpawnKey) {
    spawnBarEl.hidden = true; spawnBarEl.textContent = '';
    mapDrawZones();
    if (!mapSel) { mapInfoEl.hidden = true; mapInfoEl.textContent = ''; }
    updateHash();
    return;
  }
  // follow the species to whichever layer it actually lives on
  const layers = spawnLayersFor(mapSpawnKey);
  if (layers.length && !layers.includes(mapLayer)) mapSetLayer(layers[0]);
  mapRenderSpawnBar(p);
  const n = mapDrawZones();
  if (!mapSel) mapRenderSpawnInfo(p);
  if (focus && n) mapFocusSpawns(mapSpawnKey);
  updateHash();
}

// frame the spawn area rather than the whole map — for a species with three
// spawners on one island, fitting the island is the answer
function mapFocusSpawns(palKey) {
  const pts = spawnPoints(palKey, mapLayer);
  if (!pts.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
  }
  const pad = 400;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  if (!cw || !ch) return;
  const k = Math.max(mapMinK, Math.min(1, Math.min(cw / (x1 - x0), ch / (y1 - y0))));
  const [tx, ty] = mapClampTo(k, cw / 2 - (x0 + x1) / 2 * k, ch / 2 - (y0 + y1) / 2 * k);
  mapGlide(tx, ty, k);
}

function mapSpawnSummary(palKey) {
  const es = spawnEntries(palKey);
  if (!es.length) return null;
  let lo = Infinity, hi = 0, spots = 0, night = true, dungeonOnly = true;
  const shares = spawnShares(palKey);
  let sLo = Infinity, sHi = 0;
  for (const v of shares.values()) { sLo = Math.min(sLo, v); sHi = Math.max(sHi, v); }
  for (const e of es) {
    lo = Math.min(lo, e.lo); hi = Math.max(hi, e.hi);
    if (!(e.f & SPAWN_NIGHT)) night = false;
    if (SPAWN.kinds[e.gi] === 0) dungeonOnly = false;
    for (const layer of Object.keys(MAP.layers)) {
      const run = spawnRuns[layer]?.get(e.gi);
      if (run) spots += (run.length - 1) / 2;
    }
  }
  return {lo, hi, spots, night, dungeonOnly, groups: es.length,
          shareLo: isFinite(sLo) ? sLo : 0, shareHi: sHi};
}

function mapRenderSpawnBar(p) {
  const sum = mapSpawnSummary(p.k);
  spawnBarEl.hidden = false;
  spawnBarEl.textContent = '';
  spawnBarEl.append(icon(p, 30, true));
  const txt = document.createElement('div'); txt.className = 'sb-txt';
  const b = document.createElement('b'); b.textContent = p.n + ' spawn areas';
  const sub = document.createElement('span');
  sub.textContent = sum
    ? `${sum.spots} areas · Lv ${sum.lo === sum.hi ? sum.lo : sum.lo + '–' + sum.hi}`
    : 'No wild spawns — breeding or raids only';
  txt.append(b, sub);
  spawnBarEl.appendChild(txt);
  if (sum && sum.night) {
    const n = document.createElement('span'); n.className = 'sbadge'; n.textContent = '🌙 Night only';
    spawnBarEl.appendChild(n);
  }
  if (sum && sum.dungeonOnly) {
    const n = document.createElement('span'); n.className = 'sbadge'; n.textContent = 'Dungeons only';
    spawnBarEl.appendChild(n);
  }
  // the shading now carries information, so it needs a key
  if (sum && sum.groups > 1) {
    const lg = document.createElement('div'); lg.className = 'sb-legend';
    const a = document.createElement('span'); a.textContent = 'less common';
    const ramp = document.createElement('span'); ramp.className = 'sb-ramp';
    ramp.title = 'Shading shows how much of each area’s spawn table this pal is';
    // discrete swatches, because the fill is discrete buckets rather than a
    // continuous gradient — the key should say what the map actually does
    for (const c of ZONE_RAMP) {
      const sw = document.createElement('i');
      sw.style.background = c;
      sw.style.opacity = ZONE_ALPHA[ZONE_RAMP.indexOf(c)];
      ramp.appendChild(sw);
    }
    const b = document.createElement('span'); b.textContent = 'more';
    lg.append(a, ramp, b);
    spawnBarEl.appendChild(lg);
  }
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'alink sb-clear'; x.textContent = '✕ Clear';
  if (!sum || sum.groups <= 1) x.style.marginLeft = 'auto';
  x.addEventListener('click', () => mapSetSpawn(null));
  spawnBarEl.appendChild(x);
}

function mapRenderSpawnInfo(p) {
  mapInfoEl.hidden = false;
  mapInfoEl.textContent = '';
  const sum = mapSpawnSummary(p.k);

  const x = document.createElement('button');
  x.type = 'button'; x.className = 'iclose'; x.textContent = '✕';
  x.setAttribute('aria-label', 'Stop showing spawn areas');
  x.addEventListener('click', () => mapSetSpawn(null));
  mapInfoEl.appendChild(x);

  const head = document.createElement('div'); head.className = 'ihead';
  head.appendChild(icon(p, 44, true));
  const hb = document.createElement('div');
  const h3 = document.createElement('h3'); h3.textContent = p.n; hb.appendChild(h3);
  const sub = document.createElement('div'); sub.className = 'isub';
  sub.textContent = sum
    ? `Wild spawns · Lv ${sum.lo === sum.hi ? sum.lo : sum.lo + '–' + sum.hi}` +
      (sum.night ? ' · night only' : '')
    : 'Not catchable in the wild';
  hb.appendChild(sub);
  head.append(hb);
  mapInfoEl.appendChild(head);

  const crow = document.createElement('div'); crow.className = 'crow';
  crow.appendChild(typeChips(p)); crow.appendChild(tierBadge(p));
  mapInfoEl.appendChild(crow);

  if (!sum) {
    // legendaries, sub-species and raid bosses genuinely have no spawner; say so
    // and hand the reader to the tab that can actually get them one
    const e = document.createElement('div'); e.className = 'isub inote';
    const alpha = MAP_ALPHAS.get(p.k);
    e.textContent = alpha
      ? 'No wild spawn area — the only one in the world is the alpha shown on the map.'
      : 'No spawner anywhere in the world files. This one comes from breeding or a raid.';
    mapInfoEl.appendChild(e);
    const acts = document.createElement('div'); acts.className = 'iacts';
    const fp = document.createElement('button');
    fp.type = 'button'; fp.className = 'alink'; fp.textContent = 'Find parents';
    fp.addEventListener('click', () => {
      pickT.set(p, true); reverseShown = 120; renderReverse(); navTab('reverse');
    });
    acts.appendChild(fp);
    mapInfoEl.appendChild(acts);
    if (alpha) mapEls.get(mapKey(alpha[0]))?.classList.add('near');
    return;
  }

  // the number that actually predicts how long you'll be standing there
  const pct = v => (v * 100 < 1 ? '<1' : Math.round(v * 100)) + '%';
  const rate = document.createElement('div'); rate.className = 'isub inote';
  rate.textContent = sum.shareHi
    ? `Makes up ${sum.shareLo === sum.shareHi ? pct(sum.shareHi)
        : pct(sum.shareLo) + '\u2013' + pct(sum.shareHi)} of the spawns in its areas` +
      (sum.groups > 1 ? ' \u2014 brighter shading is where it\u2019s most common.' : '.')
    : '';
  if (rate.textContent) mapInfoEl.appendChild(rate);

  const other = spawnLayersFor(p.k).filter(l => l !== mapLayer);
  if (other.length) {
    const e = document.createElement('div'); e.className = 'isub inote';
    e.textContent = `Also spawns on ${LAYER_NAME[other[0]]}.`;
    mapInfoEl.appendChild(e);
  }

  const hubs = mapSpawnHubs(p.k, mapLayer, 3);
  const lb = document.createElement('div'); lb.className = 'nlb';
  lb.textContent = 'Best fast travel';
  mapInfoEl.appendChild(lb);
  if (!hubs.length) {
    const e = document.createElement('div'); e.className = 'isub';
    e.textContent = 'No spawn areas on this layer.';
    mapInfoEl.appendChild(e);
  } else {
    const m = mPerPx(mapLayer);
    const wrap = document.createElement('div'); wrap.className = 'near';
    hubs.forEach((h, i) => {
      const b = document.createElement('button'); b.type = 'button';
      const n = document.createElement('span'); n.textContent = mapTitle(h.f);
      const d = document.createElement('span'); d.className = 'd';
      d.textContent = h.near ? h.near + ' areas' : fmtDist(h.best * m);
      b.append(n, d);
      b.title = h.near
        ? `${h.near} spawn areas within 1.2 km · nearest ${fmtDist(h.best * m)}`
        : `Nearest spawn area ${fmtDist(h.best * m)} away`;
      b.addEventListener('click', () => mapSelect(h.f, true));
      wrap.appendChild(b);
      if (i === 0) mapEls.get(mapKey(h.f))?.classList.add('near');
    });
    mapInfoEl.appendChild(wrap);
  }

  const acts = document.createElement('div'); acts.className = 'iacts';
  const pc = document.createElement('button');
  pc.type = 'button'; pc.className = 'alink'; pc.textContent = 'Pal card';
  pc.addEventListener('click', () => openModal(p));
  const cp = document.createElement('button');
  cp.type = 'button'; cp.className = 'alink'; cp.textContent = 'Copy link';
  cp.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('#')[0] + '#/map/spawn/' + p.k);
      toast('Link to ' + p.n + '’s spawn areas copied');
    } catch { toast('Copy failed — clipboard blocked by browser'); }
  });
  acts.append(pc, cp);
  mapInfoEl.appendChild(acts);
}

// ---------- label placement ----------
// 152 waypoints, 90 alphas and 123 regions all shouting at once is unreadable,
// and a plain on/off toggle trades one bad state for another. This is the
// approach map renderers use: rank the labels, try several anchor positions for
// each, and drop the ones that still collide.
//
// Boxes are computed analytically from measured text rather than read back from
// the DOM — 230 getBoundingClientRect calls per pan would force a layout each
// time, and the labels counter-scale so their screen size is already known.
const LABEL_MODES = ['auto', 'all', 'off'];
let mapLabelMode = LABEL_MODES.includes(mapPrefs.lb) ? mapPrefs.lb : 'auto';
const labelMeasure = document.createElement('canvas').getContext('2d');
const labelWidths = new Map();
function labelWidth(text, region) {
  const key = (region ? 'r|' : 'm|') + text;
  let w = labelWidths.get(key);
  if (w === undefined) {
    // Region labels render uppercase at 12-13px depending on zoom tier, and
    // uppercase is materially wider than the mixed-case string in the DOM.
    // Measuring what's actually drawn, at the larger size, keeps the box on the
    // conservative side — an over-wide box costs a label, an under-wide one
    // silently lets a name sit on top of a marker.
    labelMeasure.font = region
      ? '700 13px "Segoe UI", system-ui, sans-serif'
      : '700 10.5px "Segoe UI", system-ui, sans-serif';
    const t = region ? text.toUpperCase() : text;
    w = labelMeasure.measureText(t).width + (region ? t.length * 1.17 : 0);  // letter-spacing
    labelWidths.set(key, w);
  }
  return w;
}
// half the marker glyph, so a label placed beside one clears the art. Alphas
// carry a level badge above the icon, so their obstacle reaches higher than it
// is wide — without that, a label anchored above lands on the badge.
const MK_HALF = {tower: 15, middleBoss: 12, alpha: 15, fastTravel: 11};
const MK_TOP = {alpha: 28};
const halfOf = m => MK_HALF[m.type] || 12;
const topOf = m => MK_TOP[m.type] || MK_HALF[m.type] || 12;
// anchors in the order they're tried, matching the CSS classes below
const ANCHORS = ['', 'lb-t', 'lb-r', 'lb-l'];
const LABEL_PRIORITY = {tower: 0, middleBoss: 1, fastTravel: 2, alpha: 3};
const LABEL_PAD = 2;
// One margin for everything just outside the viewport. Obstacles and labels
// have to use the same number: a wider margin for labels than for markers lets
// a label at the very edge be placed against an obstacle that was skipped.
const LABEL_EDGE = 160;

// Redrawing is ~30ms for the worst species, so it's debounced like the labels:
// the canvas stays glued during a gesture (it's positioned in map pixels inside
// the stage) and only goes stale at the margins, which the 30% overscan hides.
let zoneTimer = 0;
function mapQueueZones() {
  clearTimeout(zoneTimer);
  zoneTimer = setTimeout(() => { if (mapZonesStale()) mapDrawZones(); }, 70);
}

let labelTimer = 0;
function mapQueueLabels() {
  clearTimeout(labelTimer);
  labelTimer = setTimeout(mapPlaceLabels, 90);
}
function mapPlaceLabels() {
  if (!MAP || !mapBuilt) return;
  const off = mapLabelMode === 'off';
  const all = mapLabelMode === 'all';
  const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight;
  const placed = [];
  const clear = b => {
    for (const q of placed) {
      if (b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0) return false;
    }
    return true;
  };
  const boxFor = (anchor, sx, sy, w, h, half, top) => {
    if (anchor === 'lb-t') return {x0: sx - w / 2, x1: sx + w / 2, y0: sy - top - 3 - h, y1: sy - top - 3};
    if (anchor === 'lb-r') return {x0: sx + half + 5, x1: sx + half + 5 + w, y0: sy - h / 2, y1: sy + h / 2};
    if (anchor === 'lb-l') return {x0: sx - half - 5 - w, x1: sx - half - 5, y0: sy - h / 2, y1: sy + h / 2};
    return {x0: sx - w / 2, x1: sx + w / 2, y0: sy + half + 3, y1: sy + half + 3 + h};
  };

  // Every marker glyph is an obstacle before any label is placed — the
  // equivalent of Mapbox's icon-allow-overlap:false. Without this the placer
  // happily drops a waypoint name straight across a tower.
  const markers = MAP.markers.filter(m => m.layer === mapLayer && mapTypeOn(m.type));
  if (!off) {
    for (const m of markers) {
      const half = halfOf(m);
      const sx = m.map.x * mapK + mapTX, sy = m.map.y * mapK + mapTY;
      if (sx < -LABEL_EDGE || sy < -LABEL_EDGE || sx > cw + LABEL_EDGE || sy > ch + LABEL_EDGE) continue;
      placed.push({x0: sx - half, x1: sx + half, y0: sy - topOf(m), y1: sy + half});
    }
  }

  const placedText = new Set();
  markers.sort((a, b) => (a === mapSel ? -1 : b === mapSel ? 1 : 0)
    || LABEL_PRIORITY[a.type] - LABEL_PRIORITY[b.type]
    || (b.level || 0) - (a.level || 0));

  for (const m of markers) {
    const el = mapEls.get(mapKey(m));
    if (!el) continue;
    el.classList.remove('lb-t', 'lb-r', 'lb-l');
    if (off && m !== mapSel) { el.classList.add('nolb'); continue; }
    const sx = m.map.x * mapK + mapTX, sy = m.map.y * mapK + mapTY;
    // off-screen labels are hidden and, importantly, reserve no space
    if (sx < -LABEL_EDGE || sy < -LABEL_EDGE || sx > cw + LABEL_EDGE || sy > ch + LABEL_EDGE) {
      el.classList.add('nolb'); continue;
    }
    if (all) { el.classList.remove('nolb'); continue; }
    const w = labelWidth(mapTitle(m)) + LABEL_PAD * 2, h = 15;
    const half = halfOf(m), top = topOf(m);
    let put = null;
    for (const a of ANCHORS) {
      const b = boxFor(a, sx, sy, w, h, half, top);
      if (clear(b)) { put = {a, b}; break; }
    }
    if (!put && m === mapSel) put = {a: '', b: boxFor('', sx, sy, w, h, half, top)};
    if (put) {
      el.classList.remove('nolb');
      if (put.a) el.classList.add(put.a);
      placed.push(put.b);
      placedText.add(mapTitle(m).toLowerCase());
    } else {
      el.classList.add('nolb');
    }
  }

  // regions last: they're background context, so they yield to anything
  // actionable, and they're already gated by the zoom tier in CSS
  for (const el of mapRegionsEl.children) {
    if (off) { el.classList.add('nolb'); continue; }
    const sx = +el.dataset.x * mapK + mapTX, sy = +el.dataset.y * mapK + mapTY;
    if (sx < -LABEL_EDGE || sy < -LABEL_EDGE || sx > cw + LABEL_EDGE || sy > ch + LABEL_EDGE) {
      el.classList.add('nolb'); continue;
    }
    // Read the zoom tier from the data, not from computed style: .nolb itself
    // sets display:none, so asking the DOM whether a region is "hidden by zoom"
    // returns true for anything this function suppressed last pass — which
    // silently let those through untested.
    if (+el.dataset.t > stageTier(mapK)) { el.classList.remove('nolb'); continue; }
    if (all) { el.classList.remove('nolb'); continue; }
    // ~40 regions share a name with the waypoint inside them; printing both is
    // just noise, and the waypoint is the one you can actually travel to
    if (placedText.has(el.textContent.toLowerCase())) { el.classList.add('nolb'); continue; }
    const w = labelWidth(el.textContent, true) + LABEL_PAD * 2, h = 18;
    const b = {x0: sx - w / 2, x1: sx + w / 2, y0: sy - h / 2, y1: sy + h / 2};
    if (clear(b)) { el.classList.remove('nolb'); placed.push(b); }
    else el.classList.add('nolb');
  }

  // "All" means all, overlaps included — that's the point of the mode
  if (!all && !off) mapVerifyLabels();
}

// The pass above models label boxes from measured text, which is fast but is
// still a model — it can't know about a margin someone changes in the
// stylesheet later, and it was quietly 2-3px out per anchor. This second pass
// reads the geometry the browser actually produced and drops any label still
// sitting on a marker it doesn't own. One batched layout read on a 90ms
// debounce, and it means the model drifting can only cost a label, never
// produce the overlap the whole exercise is about.
function mapVerifyLabels() {
  const glyphs = [];
  for (const el of mapMarksEl.children) {
    if (el.hidden) continue;
    // NOT firstElementChild: an alpha's level badge is appended before its
    // glyph, so that would measure the badge and miss the icon entirely
    const g = el.querySelector('.g');
    if (g) glyphs.push({owner: el, r: g.getBoundingClientRect()});
  }
  const labels = [];
  for (const el of mapMarksEl.children) {
    if (el.hidden || el.classList.contains('nolb') || el === mapEls.get(mapSel && mapKey(mapSel))) continue;
    const lb = el.querySelector('.lb');
    if (lb) labels.push({el, owner: el, r: lb.getBoundingClientRect()});
  }
  for (const el of mapRegionsEl.children) {
    if (el.classList.contains('nolb')) continue;
    labels.push({el, owner: null, r: el.getBoundingClientRect()});
  }
  for (const l of labels) {
    if (!l.r.width) continue;
    for (const g of glyphs) {
      if (g.owner === l.owner) continue;
      if (l.r.left < g.r.right - 1 && l.r.right > g.r.left + 1 &&
          l.r.top < g.r.bottom - 1 && l.r.bottom > g.r.top + 1) {
        l.el.classList.add('nolb');
        break;
      }
    }
  }
}

// ---------- region labels ----------
// 123 named areas from the game's own region volumes. They're bucketed by
// physical size so a zoomed-out map shows only the handful of big biomes and
// the small named landmarks appear as you go in — one class write per frame
// instead of 123 visibility checks.
const regionTier = r => r >= 400 ? 0 : r >= 200 ? 1 : r >= 90 ? 2 : 3;
// same thresholds mapApply uses to set the stage's r0..r3 class
const stageTier = k => k < 0.12 ? 0 : k < 0.25 ? 1 : k < 0.45 ? 2 : 3;
function mapBuildRegions() {
  mapRegionsEl.textContent = '';
  for (const r of MAP.regions || []) {
    if (r.layer !== mapLayer) continue;
    const d = document.createElement('div');
    d.className = 'rg t' + regionTier(r.r);
    d.dataset.t = regionTier(r.r);
    d.style.left = r.map.x + 'px';
    d.style.top = r.map.y + 'px';
    d.dataset.x = r.map.x; d.dataset.y = r.map.y;
    d.textContent = r.name;
    mapRegionsEl.appendChild(d);
  }
}

if (MAP) {
  // One extracted marker (the Deserted Islet tower) has no id in the world
  // files. Everything that addresses a marker — #/map/<id>, Copy link, the hash
  // updateHash writes when you select one — keys off it, so give the id-less
  // ones a stable one derived from their actor rather than putting "null" in
  // the address bar and handing out a link that resolves to nothing.
  for (const m of MAP.markers) {
    if (!m.id) m.id = (m.actor || m.type + '_' + m.label).replace(/^BP_/, '').replace(/_C$/, '');
  }
  for (const m of MAP.markers) {
    if (m.type !== 'alpha') continue;
    const p = mapPal(m);
    if (!p) continue;
    if (!MAP_ALPHAS.has(p.k)) MAP_ALPHAS.set(p.k, []);
    MAP_ALPHAS.get(p.k).push(m);
  }
  mapLayerSeg.querySelectorAll('button').forEach(b => {
    const on = b.dataset.l === mapLayer;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => mapSetLayer(b.dataset.l));
  });
  mapFilterSeg.querySelectorAll('button').forEach(b => {
    const t = b.dataset.t;
    const paint = () => {
      const on = mapTypes.has(t);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    };
    paint();
    b.addEventListener('click', () => {
      if (mapTypes.has(t)) mapTypes.delete(t); else mapTypes.add(t);
      paint(); mapSavePrefs();
      // hiding the type the open card describes leaves a card with no marker
      if (mapSel && !mapTypeOn(mapSel.type)) mapSelect(null);
      mapSyncMarkers(); mapRenderResults();
    });
  });
  mapLabelSeg.querySelectorAll('button').forEach(b => {
    const paint = () => {
      const on = b.dataset.lb === mapLabelMode;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    };
    paint();
    b.addEventListener('click', () => {
      mapLabelMode = b.dataset.lb;
      mapLabelSeg.querySelectorAll('button').forEach(x => {
        const on = x.dataset.lb === mapLabelMode;
        x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on));
      });
      mapSavePrefs();
      mapPlaceLabels();
    });
  });
  mapSearchEl.addEventListener('input', () => {
    mapQuery = mapSearchEl.value;
    mapSyncMarkers(); mapRenderResults();
  });
  mapSearchEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = mapResultsEl.querySelector('.mres');
    if (first) first.click();
  });

  // ---- gestures. No setPointerCapture: capturing on the viewport retargets
  // the follow-up click away from the marker button that was pressed. ----
  const ptrs = new Map();
  let pinchD = 0, pinchK = 0, dragged = 0;
  let helpTimer = 0;
  const hideHelp = () => { clearTimeout(helpTimer); mapHelpEl.classList.add('gone'); };
  // it's a hint, not a caption — retire it whether or not anyone touches the map
  helpTimer = setTimeout(hideHelp, 7000);
  mapViewEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.mapzoom, .mapinfo')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    dragged = 0; mapDragged = false;
    mapStopGlide();
    mapViewEl.classList.add('drag');
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y); pinchK = mapK;
    }
  });
  const onMove = e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      dragged += Math.abs(dx) + Math.abs(dy);
      if (dragged > 4) hideHelp();
      mapTX += dx; mapTY += dy; mapClamp(); mapApply();
    } else if (ptrs.size === 2 && pinchD > 0) {
      const [a, b] = [...ptrs.values()];
      const r = mapViewEl.getBoundingClientRect();
      dragged += 20; hideHelp();
      mapZoomTo(pinchK * (Math.hypot(a.x - b.x, a.y - b.y) / pinchD),
        (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    }
  };
  const onUp = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinchD = 0;
    if (ptrs.size) return;
    mapViewEl.classList.remove('drag');
    mapDragged = dragged > 4;   // read by the marker click handler, which runs next
    // a tap on open water clears the selection; a drag that ended there doesn't
    if (dragged <= 4 && !e.target.closest('.mk, .mapzoom, .mapinfo')) mapSelect(null);
  };
  window.addEventListener('pointermove', onMove, {passive: true});
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  mapViewEl.addEventListener('wheel', e => {
    e.preventDefault();
    mapStopGlide(); hideHelp();
    const r = mapViewEl.getBoundingClientRect();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    mapZoomTo(mapK * Math.exp(-d * 0.0016), e.clientX - r.left, e.clientY - r.top);
  }, {passive: false});
  mapViewEl.addEventListener('dblclick', e => {
    if (e.target.closest('.mapzoom, .mapinfo')) return;
    const r = mapViewEl.getBoundingClientRect();
    mapZoomTo(mapK * 1.9, e.clientX - r.left, e.clientY - r.top);
  });
  mapViewEl.addEventListener('keydown', e => {
    const step = e.shiftKey ? 240 : 90;
    const pan = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]}[e.key];
    if (pan) {
      e.preventDefault(); mapStopGlide(); hideHelp();
      mapTX += pan[0]; mapTY += pan[1]; mapClamp(); mapApply();
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); mapZoomTo(mapK * 1.5); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); mapZoomTo(mapK / 1.5); }
    else if (e.key === '0') { e.preventDefault(); mapFit(true); }
    else if (e.key === 'Escape' && mapSel) { e.preventDefault(); mapSelect(null); }
  });
  document.getElementById('mapIn').addEventListener('click', () => { hideHelp(); mapZoomTo(mapK * 1.6); });
  document.getElementById('mapOut').addEventListener('click', () => { hideHelp(); mapZoomTo(mapK / 1.6); });
  document.getElementById('mapReset').addEventListener('click', () => { hideHelp(); mapSelect(null); mapFit(true); });

  // the viewport only has a size once its tab is visible, and the phone
  // breakpoint sizes it off the viewport height, so refit on every resize
  addEventListener('resize', mapSyncHeight);
  new ResizeObserver(() => {
    if (!mapBuilt || !mapViewEl.clientWidth) return;
    const cw = mapViewEl.clientWidth, ch = mapViewEl.clientHeight, b = mapBounds();
    mapMinK = Math.min(1, cw / (b.x1 - b.x0), ch / (b.y1 - b.y0));
    if (mapK < mapMinK) mapK = mapMinK;
    mapClamp(); mapApply();
  }).observe(mapViewEl);
} else {
  // no mapdata.js — drop the tab rather than route to an empty view
  document.querySelectorAll('[data-v="map"]').forEach(b => b.remove());
  document.getElementById('view-map')?.remove();
}

// The guide's cake recipes are hand-written markup; each ingredient chip
// carries a data-item id so the extracted inventory icon can be dropped in
// without duplicating the recipe text in JS.
document.querySelectorAll('.recipe .mchip[data-item]').forEach(c => {
  const im = new Image(18, 18);
  im.src = 'assets/items/' + c.dataset.item.toLowerCase() + '.webp';
  im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
  im.onerror = () => im.remove();
  c.prepend(im);
  c.classList.add('drop');
});

// guide jump links: hand the reader to the tab being described
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.nav === 'combos') { navTab('dex'); setDexMode('combos'); }
  else navTab(b.dataset.nav);
}));
// in-guide anchors: open the referenced <details> section and scroll to it
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
  const d = document.getElementById(b.dataset.open);
  if (d) { d.open = true; d.scrollIntoView({block: 'start', behavior: SMOOTH}); }
}));
booting = false;
if (!applyHash(initialHash)) showTab(state.tab && document.getElementById('view-' + state.tab) ? state.tab : currentTab);
if (state.ro && pickS[1].get() && pickPT.get()) computeRoute();
// "/" focuses the active view's search box
document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  if (overlay.classList.contains('open') || roverlay.classList.contains('open') || openPicker) return;
  if (document.querySelector('.isel.open')) return;  // an icon dropdown owns the keyboard
  // tabs without a search box open the most useful pal picker instead
  if (currentTab === 'breed') {
    e.preventDefault();
    (pickA.get() && !pickB.get() ? pickB : pickA).openPop(true);
    return;
  }
  if (currentTab === 'plan') {
    e.preventDefault();
    if (planMode !== 'new') setPlanMode('new');
    const n = SLOTS.find(i => !pickS[i].get());
    const pk = n ? pickS[n] : (pickPT.get() ? pickS[1] : pickPT);
    pk.root.scrollIntoView({block: 'center'});
    pk.openPop(true);
    return;
  }
  if (currentTab === 'reverse' && !pickT.get()) {
    // no target yet — filtering pairs is useless; open the target picker instead
    e.preventDefault();
    pickT.openPop(true);
    return;
  }
  let target = {dex: '#dexSearch', hatch: '#hatchSearch', roster: '#rosterSearch', reverse: '#pairFilter', map: '#mapSearch'}[currentTab];
  if (currentTab === 'dex' && document.getElementById('dexPalsBlock').hidden) target = '#comboSearch';
  const inp = target && document.querySelector(target);
  if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
});
// PWA: offline capability + installability (http(s) only — no-op when opened as a local file)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
