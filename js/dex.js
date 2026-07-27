// ---------- dex view ----------
const dexBody = document.getElementById('dexBody');
const dexSearch = document.getElementById('dexSearch');
const dexType = document.getElementById('dexType');
const dexWork = document.getElementById('dexWork');
const dexSortSel = document.getElementById('dexSort');
const dexGrid = document.getElementById('dexGrid');
const dexTableWrap = document.getElementById('dexTableWrap');
let dexSort = {key: 'z', dir: 1};
// 'all' | 'owned' | 'missing' — replaces the old dexOwnedOnly boolean
let dexShow = 'all';
// 'gallery' | 'table'. Two jobs, measurably different: recognising 299 unique
// arts to mark what you own, versus comparing seven columns of numbers. The
// grid cannot do the second and the table is bad at the first.
let dexView = 'gallery';

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

// One sort, two ways to set it: the select, and (in table view) the column
// headers, which mirror it rather than owning it.
const SORT_OPTS = {z: {key: 'z', dir: 1}, n: {key: 'n', dir: 1}, t: {key: 't', dir: 1},
  'r-': {key: 'r', dir: -1}, 'r+': {key: 'r', dir: 1},
  'm-': {key: 'm', dir: -1}, 'm+': {key: 'm', dir: 1},
  'w-': {key: 'w', dir: -1}, 'w+': {key: 'w', dir: 1}};
const sortValue = () => Object.keys(SORT_OPTS).find(v =>
  SORT_OPTS[v].key === dexSort.key && SORT_OPTS[v].dir === dexSort.dir) || 'z';
function syncSortSel() {
  dexSortSel.value = sortValue();
  // the work options name the filtered work, because that is what they sort by
  const wl = dexWork.value ? WORKS[dexWork.value] : null;
  for (const o of dexSortSel.options) {
    if (o.value === 'w-') o.textContent = wl ? `${wl} level (high to low)` : 'Work total (high to low)';
    if (o.value === 'w+') o.textContent = wl ? `${wl} level (low to high)` : 'Work total (low to high)';
  }
}

dexSearch.addEventListener('input', renderDex);
dexType.addEventListener('change', () => { save(); renderDex(); });
let dexSortBeforeWork = null;
dexWork.addEventListener('change', () => {
  // Picking a work filter sorts by that work, which is almost always what you
  // meant. Clearing it puts back the sort you had chosen yourself.
  if (dexWork.value) {
    if (dexSort.key !== 'w') dexSortBeforeWork = {...dexSort};
    dexSort = {key: 'w', dir: -1};
  } else if (dexSortBeforeWork) {
    dexSort = dexSortBeforeWork; dexSortBeforeWork = null;
  }
  save(); renderDex();
});
dexSortSel.addEventListener('change', () => {
  dexSort = {...SORT_OPTS[dexSortSel.value] || SORT_OPTS.z};
  save(); renderDex();
});
document.getElementById('dexShow').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  dexShow = b.dataset.v;
  setSeg(document.getElementById('dexShow'), dexShow, 'v');
  save(); renderDex();
});
document.getElementById('dexView').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  dexView = b.dataset.v;
  setSeg(document.getElementById('dexView'), dexView, 'v');
  save(); renderDex();
  b.focus();   // the pressed segment survives the re-render; keep focus on it
});
function clearDexFilters() {
  dexSearch.value = ''; dexType.value = ''; dexWork.value = '';
  dexTypeSel.sync(); dexWorkSel.sync();      // these two are drawn over, not native
  dexShow = 'all'; setSeg(document.getElementById('dexShow'), 'all', 'v');
  save(); renderDex();
  dexSearch.focus();
}
document.getElementById('dexClear').addEventListener('click', clearDexFilters);
document.querySelectorAll('th[data-s]').forEach(th => {
  th.addEventListener('click', () => {
    const k = th.dataset.s;
    dexSort = {key: k, dir: dexSort.key === k ? -dexSort.dir : (k === 'w' ? -1 : 1)};
    save(); renderDex();
    th.querySelector('.thbtn')?.focus();   // renderDex rewrote this header

  });
});

// what the active sort is sorting by, so the value you were reading survives
// a view switch instead of vanishing with the column
function dexMetric(p, wk) {
  const k = dexSort.key;
  if (k === 'r') {
    const w = document.createElement('span'); w.textContent = 'Power ' + p.r;
    if (p.ic || uniqueChildren.has(p.k)) { const u = document.createElement('span'); u.className = 'uq'; u.textContent = 'unique only'; w.appendChild(u); }
    return w;
  }
  if (k === 'm') { const s = document.createElement('span'); s.textContent = '♂ ' + p.m + '%'; return s; }
  if (k === 't') return typeChips(p);
  if (k === 'w') {
    const s = document.createElement('span');
    if (wk) s.innerHTML = workImgTag(wk) + (p.w?.[wk] || 0);
    else s.textContent = 'Work ' + Object.values(p.w || {}).reduce((a, b) => a + b, 0);
    return s;
  }
  const s = document.createElement('span'); s.textContent = zk(p); return s;
}

// A species can be owned two ways: starred here, or held in the roster. The
// table never showed ownership on the row, so the split was invisible; on a
// tile the ring and the star sit 6px apart and must not disagree.
function dexStar(p, onToggle) {
  const star = document.createElement('button');
  const starred = owned.has(p.k);
  const viaRoster = !starred && roster.some(r => r.k === p.k);
  star.className = 'star' + (starred ? ' on' : '') + (viaRoster ? ' viaroster' : '');
  star.type = 'button';
  star.textContent = starred || viaRoster ? '★' : '☆';
  star.title = viaRoster ? 'In your roster — already counts as owned' : 'Mark as owned';
  star.setAttribute('aria-label', viaRoster
    ? p.n + ' is in your roster and already counts as owned'
    : 'Mark ' + p.n + ' as owned');
  star.setAttribute('aria-pressed', String(starred));
  star.addEventListener('click', e => { e.stopPropagation(); onToggle(star); });
  return star;
}
// the grid is one composite widget: exactly one tile and its star are in the
// tab order at a time, and they move together
function focusTile(tile, moveFocus) {
  if (!tile) return;
  for (const t of dexGrid.querySelectorAll('.dextile-open')) t.tabIndex = -1;
  for (const st of dexGrid.querySelectorAll('.dextile .star')) st.tabIndex = -1;
  tile.tabIndex = 0;
  const st = tile.parentElement.querySelector('.star');
  if (st) st.tabIndex = 0;
  if (moveFocus) tile.focus();
}

function renderDex() {
  const q = dexSearch.value.trim().toLowerCase();
  const ty = dexType.value, wk = dexWork.value;
  const os = ownedSpeciesSet();
  const rows = PALS.filter(p => (!q || p.n.toLowerCase().includes(q)) && (!ty || p.t.includes(ty))
    && (!wk || (p.w && p.w[wk]))
    && (dexShow === 'all' || (dexShow === 'owned' ? os.has(p.k) : !os.has(p.k))));
  const {key, dir} = dexSort;
  const wval = p => wk ? (p.w?.[wk] || 0) : Object.values(p.w || {}).reduce((a, b) => a + b, 0);
  rows.sort((a, b) => {
    let va, vb;
    if (key === 't') { va = a.t[0]; vb = b.t[0]; }
    else if (key === 'z') { va = a.z * 10 + (a.zs ? 1 : 0); vb = b.z * 10 + (b.zs ? 1 : 0); }
    else if (key === 'w') { va = wval(a); vb = wval(b); }
    else { va = a[key]; vb = b[key]; }
    if (va === vb) { return a.z - b.z; }
    return (va < vb ? -1 : 1) * dir;
  });

  syncSortSel();
  setSeg(document.getElementById('dexView'), dexView, 'v');
  setSeg(document.getElementById('dexShow'), dexShow, 'v');
  document.querySelectorAll('th[data-s]').forEach(th => {
    const base = th.dataset.label || (th.dataset.label = th.textContent);
    const active = dexSort.key === th.dataset.s;
    th.innerHTML = `<button type="button" class="thbtn" aria-label="Sort by ${base}">${base}` +
      (active ? ` <span class="arr" aria-hidden="true">${dexSort.dir > 0 ? '▲' : '▼'}</span>` : '') + '</button>';
    th.setAttribute('aria-sort', active ? (dexSort.dir > 0 ? 'ascending' : 'descending') : 'none');
  });

  const filtering = !!(q || ty || wk || dexShow !== 'all');
  document.getElementById('dexCount').textContent =
    filtering ? `${rows.length} of ${PALS.length} species` : '';
  // a visible way out of persisted filters ("1 of 299" a week later)
  document.getElementById('dexClear').hidden = !filtering;
  document.getElementById('dexOwnedCount').textContent = `${os.size} of ${PALS.length} owned`;
  // said once to someone who has starred nothing, then gone for good
  document.getElementById('dexIntro').hidden = owned.size > 0;

  // the phone table shows one value column; it says which one
  const SORT_SHORT = {z: '#', n: '#', t: 'Element', r: 'Power', m: '♂', w: 'Work'};
  document.getElementById('dexMetricTh').textContent = SORT_SHORT[dexSort.key] || '#';

  const gallery = dexView === 'gallery';
  dexGrid.hidden = !gallery || !rows.length;
  dexTableWrap.hidden = gallery || !rows.length;
  dexGrid.innerHTML = ''; dexBody.innerHTML = '';

  const empty = document.getElementById('dexEmpty');
  empty.innerHTML = '';
  if (!rows.length) {
    const h = document.createElement('div'); h.className = 'hint';
    const act = (label, fn) => { const b = document.createElement('button'); b.className = 'alink'; b.textContent = label; b.addEventListener('click', fn); h.appendChild(b); };
    const showAll = () => {
      dexShow = 'all'; setSeg(document.getElementById('dexShow'), 'all', 'v');
      save(); renderDex();
      // the button that was pressed lived in the empty state this just cleared,
      // so hand focus to the control that now carries the same state
      document.querySelector('#dexShow button[data-v="all"]').focus();
    };
    if (dexShow === 'owned' && !os.size) {
      h.append('You haven’t starred any species yet. Pals in your roster count automatically. ');
      act('Show all species', showAll);
    } else if (dexShow === 'missing' && !(q || ty || wk)) {
      h.append('You own every species that matches. Nice. ');
      act('Show all species', showAll);
    } else {
      h.append('No species match these filters. ');
      act('✕ Clear filters', clearDexFilters);
    }
    empty.appendChild(h);
    return;
  }

  if (gallery) emitGallery(rows, wk, os); else emitTable(rows, wk);
}

function emitGallery(rows, wk, os) {
  for (const p of rows) {
    const li = document.createElement('li');
    li.className = 'dextile' + (os.has(p.k) ? ' on' : '');
    li.dataset.k = p.k;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dextile-open'; b.tabIndex = -1;
    b.setAttribute('aria-label', 'View ' + p.n + ' details');
    b.appendChild(icon(p, 52, false, true));
    const nm = document.createElement('span'); nm.className = 'dt-name'; nm.textContent = p.n; b.appendChild(nm);
    const meta = document.createElement('span'); meta.className = 'dt-meta';
    meta.appendChild(dexMetric(p, wk)); b.appendChild(meta);
    b.addEventListener('click', () => openModal(p));
    li.appendChild(b);
    const st = dexStar(p, star => {
      toggleOwned(p.k); renderReverse();
      // Show=All keeps the tile, so mutate it in place: a re-render would
      // destroy the button under the user's finger and drop focus.
      if (dexShow === 'all') {
        const now = owned.has(p.k);
        star.classList.toggle('on', now);
        star.textContent = now ? '★' : '☆';
        star.setAttribute('aria-pressed', String(now));
        li.classList.toggle('on', ownedSpeciesSet().has(p.k));
        const oc = ownedSpeciesSet();
        document.getElementById('dexOwnedCount').textContent = `${oc.size} of ${PALS.length} owned`;
        document.getElementById('dexIntro').hidden = owned.size > 0;
      } else {
        // the tile leaves the set; hand focus to whatever takes its place
        const at = [...dexGrid.children].indexOf(li);
        renderDex();
        const next = dexGrid.children[Math.min(at, dexGrid.children.length - 1)];
        if (next) focusTile(next.querySelector('.dextile-open'), false);
        (next ? next.querySelector('.star') : document.querySelector('#dexEmpty .alink') || dexSearch).focus();
      }
    });
    st.tabIndex = -1;
    li.appendChild(st);
    dexGrid.appendChild(li);
  }
  focusTile(dexGrid.querySelector('.dextile-open'), false);
}

// The grid is one composite widget, not 299 tab stops: arrows move between
// species, Tab reaches the focused species' star. Same two-stops-per-item
// convention the roster's row toolbars use.
dexGrid.addEventListener('keydown', e => {
  const cur = e.target.closest('.dextile-open');
  if (!cur) return;
  const tiles = [...dexGrid.querySelectorAll('.dextile-open')];
  const i = tiles.indexOf(cur);
  const first = dexGrid.querySelector('.dextile');
  const second = first && first.nextElementSibling;
  const gap = parseFloat(getComputedStyle(dexGrid).columnGap) || 0;
  // read the column count off the layout rather than hard-coding a breakpoint
  const cols = second && second.getBoundingClientRect().top === first.getBoundingClientRect().top
    ? Math.max(1, Math.round((dexGrid.getBoundingClientRect().width + gap)
        / (first.getBoundingClientRect().width + gap))) : 1;
  let j = null;
  if (e.key === 'ArrowRight') j = Math.min(i + 1, tiles.length - 1);
  else if (e.key === 'ArrowLeft') j = Math.max(i - 1, 0);
  // geometry, not i ± cols: 299 tiles rarely fill the last row, and index math
  // clamped ArrowUp off that short row into a column you were never in
  else if (e.key === 'ArrowDown') j = gridStep(tiles, cur, 1);
  else if (e.key === 'ArrowUp') j = gridStep(tiles, cur, -1);
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = tiles.length - 1;
  else if (e.key === 'PageDown') j = Math.min(i + cols * 4, tiles.length - 1);
  else if (e.key === 'PageUp') j = Math.max(i - cols * 4, 0);
  // an arrow with no row that way still belongs to the grid, not to the page
  if (j === null) { if (e.key.startsWith('Arrow')) e.preventDefault(); return; }
  e.preventDefault();
  focusTile(tiles[j], true);
  tiles[j].scrollIntoView({block: 'nearest',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
});

function emitTable(rows, wk) {
  for (const p of rows) {
    const tr = document.createElement('tr');
    tr.dataset.k = p.k;
    const td0 = document.createElement('td');
    td0.appendChild(dexStar(p, () => {
      toggleOwned(p.k); renderDex(); renderReverse();
      // the re-render destroyed the clicked button — put focus back on its successor
      dexBody.querySelector(`tr[data-k="${p.k}"] .star`)?.focus();
    }));
    const td1 = document.createElement('td'); td1.className = 'tnum'; td1.textContent = zk(p);
    const td2 = document.createElement('td');
    const nm = document.createElement('div'); nm.className = 'tname'; nm.appendChild(icon(p, 24, false, true));
    const s = document.createElement('span'); s.textContent = p.n; nm.appendChild(s);
    nm.appendChild(tierBadge(p)); td2.appendChild(nm);
    const td3 = document.createElement('td'); td3.className = 'hn'; td3.appendChild(typeChips(p));
    const td4 = document.createElement('td'); td4.className = 'tpow'; td4.textContent = p.r;
    if (p.ic || uniqueChildren.has(p.k)) {
      // a caption rather than inline prose — inline, it wrapped to three lines
      // in the narrow mobile column and made row heights lurch
      const u = document.createElement('span'); u.className = 'uq'; u.textContent = 'unique only';
      td4.appendChild(u);
    }
    const td5 = document.createElement('td'); td5.className = 'hn'; td5.textContent = p.m + '%';
    const td6 = document.createElement('td'); td6.className = 'tworks';
    const parts = Object.entries(p.w || {}).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => k === wk ? `<b>${workImgTag(k)}${v}</b>` : workImgTag(k) + v);
    td6.innerHTML = parts.join(' ');
    // the phone table is three columns; this one carries whatever the sort is
    const tdm = document.createElement('td'); tdm.className = 'tmetric';
    tdm.appendChild(dexMetric(p, wk));
    tr.append(td0, td1, td2, td3, td4, td5, td6, tdm);
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', 'View ' + p.n + ' details');
    tr.addEventListener('click', e => { if (e.target.closest('button')) return; openModal(p); });
    tr.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); openModal(p); } });
    dexBody.appendChild(tr);
  }
}

