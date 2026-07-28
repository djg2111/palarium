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
// One warning box, one glyph. Each caller used to write its own '⚠ ' + string,
// so the mark was an emoji in some views and a Lucide triangle in others.
// The glyph is decorative — .warnbox is already coloured and worded as a
// warning, and DESIGN.md §6 forbids carrying that in colour or icon alone.
function warnBox(...parts) {
  const w = document.createElement('div'); w.className = 'warnbox';
  w.append(lucide('triangleAlert', 16), ...parts);
  return w;
}
// Inventory art (assets/items/), the other half of §7 tier 1. Same contract as
// uiIcon: decorative, disappears rather than showing a broken image.
function itemIcon(key, size, cls) {
  const i = new Image(size, size);
  i.className = 'uii' + (cls ? ' ' + cls : '');
  i.src = 'assets/items/' + key + '.webp';
  i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.draggable = false;
  i.onerror = () => i.remove();
  return i;
}
// Lucide (ISC) as inline SVG — DESIGN.md §7 tier 2, for generic UI concepts no
// game asset covers. Self-hosting is by construction here: the table below holds
// only the icons this app draws, so no icon font and no full pack ever ships.
// Always decorative — the control carries the label.
// An entry is a list of shapes: a bare string is a <path d>, anything else is
// [tag, attrs] so an icon can use circles and rects too.
const LU = {
  chevronLeft: ['m15 18-6-6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronUp: ['m18 15-6-6-6 6'],
  triangleAlert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  search: [['circle', {cx: 11, cy: 11, r: 8}], 'm21 21-4.3-4.3'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  egg: ['M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z'],
  route: [['circle', {cx: 6, cy: 19, r: 3}], 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15', ['circle', {cx: 18, cy: 5, r: 3}]],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  mapPin: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z', ['circle', {cx: 12, cy: 10, r: 3}]],
  percent: ['M19 5 5 19', ['circle', {cx: 6.5, cy: 6.5, r: 2.5}], ['circle', {cx: 17.5, cy: 17.5, r: 2.5}]],
  rotateCcw: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
};
const SVGNS = 'http://www.w3.org/2000/svg';
function lucide(name, size, cls) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  // .lui is the alignment base, the stroke-icon twin of .uii — one rule keeps
  // every inline icon off the text baseline instead of per-component patches
  s.setAttribute('class', 'lui' + (cls ? ' ' + cls : ''));
  for (const shape of LU[name]) {
    const [tag, attrs] = typeof shape === 'string' ? ['path', {d: shape}] : shape;
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    s.appendChild(el);
  }
  return s;
}
// A passive's icon is keyed by its primary effect type, which is already the
// first token of the effect string the dataset carries — no extra data needed.
// An effect with no number is written as the bare key ("nightowl"), so the first
// token can end at the comma rather than at a space.
const passiveIconKey = meta => (meta && meta.e ? meta.e.split(/[\s,]/)[0] : null);
function passiveIcon(meta, size = 15) {
  const k = passiveIconKey(meta);
  return k ? uiIcon('passive', k, size) : null;
}
// Vertical movement across a grid board goes by geometry, not by index. Index
// math (i ± columns) clamps to the last item when the row below is short — so
// ArrowUp lands in a column you were never in — and it cannot see a full-width
// panel splitting the board into rows of unequal length. One implementation for
// every grid board in the app (DESIGN.md §4).
function gridStep(items, cur, dir) {
  const rowOf = el => Math.round(el.getBoundingClientRect().top);
  const midOf = el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
  const here = rowOf(cur), x = midOf(cur);
  const away = items.filter(t => dir > 0 ? rowOf(t) > here : rowOf(t) < here);
  if (!away.length) return null;                    // no row that way: stay put
  const target = dir > 0 ? Math.min(...away.map(rowOf)) : Math.max(...away.map(rowOf));
  let best = null;
  for (const t of away) {
    if (rowOf(t) !== target) continue;
    if (!best || Math.abs(midOf(t) - x) < Math.abs(midOf(best) - x)) best = t;
  }
  return items.indexOf(best);
}

// honor prefers-reduced-motion in JS-driven scrolls (CSS handles animations)
const SMOOTH = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// ---------- toasts (aria-live region) & switch helper ----------
const toastsEl = document.getElementById('toasts');
// The stack is a landmark only while it holds something. An empty labelled
// region is a dead end for landmark navigation, and the landmark is the whole
// point: it gives a screen-reader user the one-key route their software already
// has (NVDA D, JAWS R, VO rotor) to a control that is otherwise dozens of tab
// stops away at the end of <body>.
function syncToastRegion() {
  if (toastsEl.firstChild) {
    toastsEl.setAttribute('role', 'region');
    toastsEl.setAttribute('aria-label', 'Notifications');
  } else {
    toastsEl.removeAttribute('role');
    toastsEl.removeAttribute('aria-label');
  }
}
// Writing an aria-live region re-announces it even when the string is
// identical, so an unguarded assignment inside a render function fires on every
// keystroke. Every polite count in the app goes through this (4.1.3).
function liveText(el, txt) {
  const n = typeof el === 'string' ? document.getElementById(el) : el;
  if (n && n.textContent !== txt) n.textContent = txt;
}
let toastReturn = null;                  // where focus was when Alt+Z was pressed
function restoreFromToast() {
  const next = toastsEl.lastElementChild;
  const btn = next && next.querySelector('.undo, .tx');
  if (btn) { btn.focus(); return; }
  if (toastReturn && toastReturn !== document.body && document.contains(toastReturn)) { toastReturn.focus(); return; }
  // Last resort. #tabs exists in the DOM at every width but is display:none at
  // ≤640, so focus() there was a silent no-op and every undo that reached this
  // line dropped the user on <body> on a phone (2.4.3). The bottom nav is the
  // tab bar at those widths — fall through to whichever one is really showing.
  const bar = document.querySelector('#tabs button.active')
    || document.querySelector('#bottomnav button.active')
    || document.querySelector('#bottomnav button');
  if (bar && bar.offsetParent) bar.focus();
}
// opts.ms overrides the dwell — a bulk Undo covers more than one record and
// needs longer to notice, read and reach (DESIGN.md §4)
function toast(msg, undoFn, action, opts = {}) {
  const t = document.createElement('div'); t.className = 'toast';
  const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
  const ms = opts.ms || (undoFn || action ? 8000 : 3500);
  let timer;
  const close = () => {
    clearTimeout(timer);
    const held = t.contains(document.activeElement);
    t.remove(); syncToastRegion();
    if (held) restoreFromToast();
  };
  // A toast the user has just reached must not expire under their hands (2.2.1).
  // Full duration on leave rather than the remainder: they were reading it.
  const arm = () => { clearTimeout(timer); timer = setTimeout(close, ms); };
  t.addEventListener('mouseenter', () => clearTimeout(timer));
  t.addEventListener('mouseleave', arm);
  t.addEventListener('focusin', () => clearTimeout(timer));
  t.addEventListener('focusout', e => { if (!t.contains(e.relatedTarget)) arm(); });
  // A callback may place focus itself — the roster's undo re-renders and
  // re-focuses a row. Only take focus back if it left it on the dying toast.
  const fire = fn => () => {
    fn();
    const stray = document.activeElement === document.body || t.contains(document.activeElement);
    clearTimeout(timer); t.remove(); syncToastRegion();
    if (stray) restoreFromToast();
  };
  if (undoFn) {
    const u = document.createElement('button'); u.className = 'undo'; u.textContent = 'Undo';
    u.addEventListener('click', fire(undoFn));
    t.appendChild(u);
  }
  if (action) {
    const a = document.createElement('button'); a.className = 'undo'; a.textContent = action.label;
    a.addEventListener('click', fire(action.fn));
    t.appendChild(a);
  }
  const x = document.createElement('button'); x.className = 'tx'; x.textContent = '✕'; x.setAttribute('aria-label', 'Dismiss notification');
  x.addEventListener('click', close);
  t.appendChild(x);
  t.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  arm();
  toastsEl.appendChild(t); syncToastRegion();
}
// Alt+Z moves focus to the newest toast's first action; pressed again inside the
// stack it walks to the next one, newest first. It focuses rather than fires:
// the third argument carries non-undo actions ("Un-star Cattiva", "Edit it"), so
// a key that "does the action" would do something different on every toast.
// Alt, not Ctrl+Z — this app has a search box, a nickname field and a note field.
document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'z' && e.key !== 'Z')) return;
  const toasts = [...toastsEl.children];
  // no toast: no preventDefault either, or Option+Z stops typing Ω on macOS
  if (!toasts.length) return;
  // a modal traps Tab; pulling focus outside the trap would break it. The live
  // region still announces.
  if (overlay.classList.contains('open') || roverlay.classList.contains('open')
      || document.getElementById('soverlay').classList.contains('open')) return;
  e.preventDefault();
  const inside = toastsEl.contains(document.activeElement);
  if (!inside) toastReturn = document.activeElement;
  const order = toasts.reverse();                    // newest sits last in the DOM
  const cur = inside ? order.indexOf(document.activeElement.closest('.toast')) : -1;
  const btn = order[(cur + 1) % order.length].querySelector('.undo, .tx');
  if (btn) btn.focus();
});
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
    b.classList.toggle('done', d);
    // The mark is its own node. Rebuilding the label as textContent flattened
    // whatever markup it carried — which silently undid the breed chip's
    // aria-hidden × and its spoken "and", printing "×and" on screen.
    let mk = b.querySelector('.ck');
    if (d && !mk) { mk = document.createElement('span'); mk.className = 'ck'; mk.textContent = '✓ '; b.prepend(mk); }
    else if (!d && mk) mk.remove();
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
// size comes through as --ico rather than an inline width/height, so a rule can
// resize the art at a breakpoint. The missing-image fallback has to carry the
// same property: as an inline style it outranked every selector, which left a
// letter-circle at the wrong size next to correctly-sized neighbours.
// decorative: the label is already adjacent, so the image must not repeat it.
function icon(p, size, clickable, decorative) {
  const img = document.createElement('img');
  img.className = 'pico' + (clickable ? ' click' : '');
  img.width = size; img.height = size;
  img.style.setProperty('--ico', size + 'px');
  img.draggable = false;
  img.loading = 'lazy'; img.src = IMG + p.img; img.alt = decorative ? '' : p.n;
  if (clickable) { img.title = 'View ' + p.n; img.addEventListener('click', e => { e.stopPropagation(); openModal(p); }); }
  img.onerror = () => {
    const d = document.createElement('div');
    d.className = 'pico f' + (clickable ? ' click' : '');
    // carry only the size the caller actually left on the image: if it stripped
    // --ico so a rule could size the art, the fallback must not put it back
    const ico = img.style.getPropertyValue('--ico');
    if (ico) d.style.setProperty('--ico', ico);
    d.textContent = p.n[0];
    if (decorative) d.setAttribute('aria-hidden', 'true');
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
  const restore = lastFocusModal;
  lastFocusModal = null;
  if (keepHistory) { modalPushed = false; refocusAfterModal(restore, false); return; }
  const popping = modalPushed;
  if (modalPushed) { modalPushed = false; history.back(); }
  else if (location.hash.startsWith('#/pal/')) history.replaceState(null, '', '#/' + currentTab);
  refocusAfterModal(restore, popping);
}
// history.back() re-renders the view through applyHash, and a re-render destroys
// the node we came from — so restoring focus synchronously (as this used to)
// left Escape and Back dropping focus onto <body>. A plain setTimeout is not
// enough either: back() is asynchronous, so the timeout lands BEFORE the
// popstate. Wait for the popstate, with a fallback so nothing is stranded.
function refocusAfterModal(el, popping) {
  let done = false;
  const land = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', onPop);
    // offsetParent, not just contains: closeModal(true) is used when the caller
    // is navigating away, so the opener is often inside a display:none view and
    // focusing it silently does nothing, leaving <body> focused.
    if (el && document.contains(el) && el.offsetParent !== null) { el.focus(); return; }
    const view = document.querySelector('.view.active');
    if (!view) return;
    // the opener is gone, but the row it belonged to was probably rebuilt —
    // find it again rather than dumping you at the top of a 40-row list
    const k = el && el.dataset && el.dataset.k;
    const same = k && view.querySelector(`[data-k="${CSS.escape(k)}"]`);
    const alt = same || view.querySelector('.cardopen, .pgroup .anchor');
    if (alt) alt.focus();
  };
  const onPop = () => setTimeout(land, 0);
  if (popping) window.addEventListener('popstate', onPop);
  // also covers the case where no popstate ever arrives
  setTimeout(land, popping ? 200 : 0);
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
  // Terraria collab keeps no glyph: the tree emoji it carried read as a grass
  // element beside the type chips, and the words say it on their own (§7).
  const meta = [[`Size ${p.sz}`, null], ...(p.noct ? [['Nocturnal', 'moon']] : []), ...(p.cb ? [['Terraria collab', null]] : [])];
  for (const [m, ic] of meta) {
    const c = document.createElement('span'); c.className = 'mchip';
    if (ic) c.appendChild(lucide(ic, 14));
    c.append(m); crow.appendChild(c);
  }
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
    // The row in the Roster carries only ✎ ⧉ ✕; the rest of an entry's
    // actions live here, at comfortable size, where there is room to name them.
    const acts = document.createElement('div'); acts.className = 'rentacts';
    const mk = (label, title, fn) => {
      const b = document.createElement('button'); b.className = 'alink';
      b.textContent = label; b.title = title;
      b.addEventListener('click', fn); acts.appendChild(b);
    };
    mk('✎ Edit', 'Edit this roster entry', () => { leaveModal(); openRosterEditor(rentry); });
    // leaveModal() first, both times: closing restores focus to the row that
    // opened the card, and that row has to still exist when it does.
    mk('⧉ Duplicate', 'Another with the same passives, gender and note',
      () => { leaveModal(); duplicateEntry(rentry); });
    mk('Use as planner start', 'Add to the next free Planner start slot',
      () => { leaveModal(); setSlotAuto(rentry); });
    mk('✕ Remove', 'Remove this pal from your roster',
      () => { leaveModal(); removeEntry(rentry); });
    r1.appendChild(acts);
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
  btns.appendChild(mkBtn('Find parents', true, () => { closeModal(true); pickT.set(p, true); reverseShown = {}; renderReverse(); navTab('reverse'); }));
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
    // Food amount was drawn as up to eight 🍖, which announced as "cut of meat"
    // eight times and was the only stat in the grid not showing its number.
    const val = document.createElement('div'); val.className = 'vl'; val.textContent = v;
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
    const n = document.createElement('div'); n.className = 'psn'; n.textContent = p.ps.n;
    if ((p.ps.t || []).includes('Base Aura')) {
      const b = document.createElement('span'); b.className = 'badge aura'; b.textContent = 'Base aura';
      b.title = 'Lifts every other pal at the base while this one is assigned there';
      n.appendChild(b);
    }
    card.appendChild(n);
    // the tags are the catalog's filter, so each one is a way into it
    if (p.ps.t.length) card.appendChild(tagChips(p.ps));
    const d = document.createElement('div'); d.className = 'psd'; d.append(psDesc(p.ps.d)); card.appendChild(d);
    const flags = psFlags(p.ps);
    if (flags.length) {
      const f = document.createElement('div'); f.className = 'flatnote';
      f.textContent = 'Always on: ' + flags.join(' · ');
      card.appendChild(f);
    }
    const tbl = psRankTable(p);
    if (tbl) card.appendChild(tbl);
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
  // The name can come from an aria-label or from a visible <label for>. The
  // select itself is aria-hidden, so a <label for> pointing at it names
  // nothing — the label has to be re-pointed at the button we actually draw.
  const srcLabel = sel.id ? document.querySelector(`label[for="${CSS.escape(sel.id)}"]`) : null;
  const selName = sel.getAttribute('aria-label') || (srcLabel && srcLabel.textContent.trim()) || '';
  if (selName) btn.setAttribute('aria-label', selName);
  if (srcLabel) {
    srcLabel.removeAttribute('for');
    srcLabel.addEventListener('click', () => btn.focus());
  }
  const pop = document.createElement('div');
  pop.className = 'isel-pop'; pop.setAttribute('role', 'listbox');
  pop.id = 'iselpop-' + sel.id;
  // the list scrolls, and a scrollable region has to be reachable; the rows are
  // options driven by aria-activedescendant rather than tab stops of their own
  pop.tabIndex = -1;
  if (selName) pop.setAttribute('aria-label', selName);
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

