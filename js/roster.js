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
  if (!editingId) setAddTitle(p);
  renderPsetRow(); // the offered passive sets depend on which species is picked
}});
const rosterPassives = makePassivePicker(document.getElementById('passivePick'), 4, () => renderPsetRow());

// ---------- reusable passive sets ----------
// The whole point of a breeding line is that the passives repeat, so the sets
// you have already typed are offered back as one tap. Two sources, in order:
// the sets already recorded on the species you just picked ("another one from
// this line"), then the last few sets you entered on anything. This is a
// device convenience like the picker's Recent list, so it lives outside the
// export — the export carries what you typed in, not how you typed it.
const setKey = ps => [...ps].sort().join('|');
let recentSets = readStore('palbreed_psets', []).filter(s => Array.isArray(s) && s.length);
function rememberSet(ps) {
  if (!ps.length) return;
  recentSets = [[...ps], ...recentSets.filter(s => setKey(s) !== setKey(ps))].slice(0, 6);
  localStorage.setItem('palbreed_psets', JSON.stringify(recentSets));
}
function renderPsetRow() {
  const row = document.getElementById('psetRow');
  row.innerHTML = '';
  const p = pickR.get();
  const seen = new Set([setKey(rosterPassives.get())]); // never offer what's already in the field
  const offers = [];
  const src = p ? roster.filter(r => r.k === p.k && r.ps.length).map(r => r.ps) : [];
  for (const s of src.concat(recentSets)) {
    if (seen.has(setKey(s))) continue;
    seen.add(setKey(s)); offers.push(s);
    if (offers.length === 3) break;
  }
  row.hidden = !offers.length;
  if (!offers.length) return;
  const lb = document.createElement('span'); lb.className = 'psetlb'; lb.textContent = 'Reuse';
  row.appendChild(lb);
  for (const s of offers) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pset';
    b.textContent = s.join(' · ');
    b.title = 'Fill the passives with ' + s.join(', ');
    b.setAttribute('aria-label', 'Use passives ' + s.join(', '));
    b.addEventListener('click', () => { rosterPassives.set(s); renderPsetRow(); });
    row.appendChild(b);
  }
}
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
// ---------- add another: carry the batch-level fields forward ----------
// A breeding line is by definition a run of pals that share their passives, so
// re-driving the tag input from empty after every save was the tax. What is
// kept is exactly what stays visible in the dialog and describes the batch —
// species, gender, passives, note. What is dropped is per-individual: the
// nickname, and the IVs, which sit inside a collapsed <details> where a stale
// value would be a silent lie about a pal you actually measured.
let carried = null;
function describeCarried() {
  if (!carried) return '';
  const bits = [];
  if (carried.g) bits.push(carried.g === 'M' ? 'male' : 'female');
  if (carried.ps.length) bits.push(carried.ps.join(', '));
  if (carried.note) bits.push('“' + carried.note + '”');
  return bits.join(' · ');
}
function renderCarryNote() {
  const el = document.getElementById('carryNote');
  const txt = describeCarried();
  el.hidden = !txt;
  if (txt) document.getElementById('carryText').textContent = 'Kept from the last one: ' + txt;
}
function setAddTitle(p) {
  rmTitle.textContent = p ? (carried ? 'Add another ' + p.n : 'Add ' + p.n + ' to roster') : 'Add a pal';
}
document.getElementById('carryClear').addEventListener('click', () => {
  setGender(''); rosterPassives.clear(); noteInp.value = '';
  carried = null; renderCarryNote(); renderPsetRow(); setAddTitle(pickR.get());
  // the button that was just pressed is now hidden — hand focus somewhere real
  document.querySelector('#passivePick .taginp').focus();
});
function openRosterEditor(entry, presetPal) {
  editingId = entry ? entry.id : null;
  carried = null;
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
    setAddTitle(presetPal || null);
    rosterAddBtn.textContent = '+ Add to roster';
  }
  pickR.root.querySelector('.picker-btn').classList.remove('invalid');
  document.getElementById('rosterErr').hidden = true;
  document.getElementById('rosterAddAnother').style.display = entry ? 'none' : '';
  renderCarryNote(); renderPsetRow();
  // worth saying once, to someone who hasn't decided this is worth the typing;
  // dead weight in the dialog of anyone already keeping a roster
  document.getElementById('rosterWhy').hidden = !!entry || roster.length >= 3;
  lastFocusEditor = document.activeElement;
  roverlay.classList.add('open'); roverlay.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  renderRoster();
  pickR.root.querySelector('.picker-btn').focus();
}
let lastFocusEditor = null;
function closeRosterEditor() {
  editingId = null; carried = null;
  roverlay.classList.remove('open');
  document.body.style.overflow = '';
  // renderRoster() destroys whatever opened the editor, so document.contains
  // always failed here and focus fell to <body>. Remember what it was, then
  // find its replacement in the freshly built list.
  const row = lastFocusEditor && lastFocusEditor.closest ? lastFocusEditor.closest('.rosrow') : null;
  const want = row ? {id: row.dataset.id, act: lastFocusEditor.dataset.act || 'name'} : null;
  const wasBody = !lastFocusEditor || lastFocusEditor === document.body;
  renderRoster();
  let back = null;
  if (lastFocusEditor && document.contains(lastFocusEditor)) back = lastFocusEditor;
  else if (want) {
    const r = document.querySelector(`#rosterList .rosrow[data-id="${CSS.escape(want.id)}"]`);
    back = r && (r.querySelector(`[data-act="${want.act}"]`) || r.querySelector('.nm'));
  }
  (back || (wasBody ? null : document.getElementById('rosterOpenAdd')) || document.getElementById('rosterOpenAdd')).focus();
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
  rememberSet(entry.ps);
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
  // per-individual fields only (see `carried` above); moreDetails is left open
  // if it was, so a batch you are recording IVs for doesn't reopen every time
  nickInp.value = ''; ivEls.forEach(e => e.value = '');
  carried = {g: genderVal, ps: rosterPassives.get(), note: noteInp.value.trim()};
  const kept = describeCarried();
  // the toast is the live region, so say what was kept there too — the note
  // below the title is silent to a screen reader that has moved past it
  toast('Added ' + p.n + (kept ? ' — kept ' + kept + ' for the next one' : ' to roster'));
  setAddTitle(p); renderCarryNote(); renderPsetRow(); renderRoster();
  // land on the field that actually differs between siblings in a line
  (genderSeg.querySelector('button.on') || genderSeg.children[0]).focus();
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
// A breeding roster is made of duplicates — siblings from the same line — so
// grouping by species is not a preference, it is the shape of the data. What
// used to be the "Group by species" switch is now a density switch: the
// question worth asking is how much of each pal you want to see at once.
// An older stored state.rgroup is simply ignored; nothing to migrate.
let denseRows = false;
let lastSections = [];
let lastCount = -1;   // section count at the previous render
let autoOpened = false;   // the open panel came from a filter, not a press
// Two views, not one disclosure with two skins. Opening a species used to turn
// its tile into a full-width block, which broke the board — and made the
// collapse control unrecognisable, because nobody reads a board and a list as
// two states of one thing.
let rosterView = 'tiles';      // 'tiles' | 'rows'
let openSpecies = null;        // session only; never written to palbreed
// ---------- bulk selection ----------
// Session only, like openSpecies. Entry ids, not indices: a re-sort or an edit
// must not move the selection to a different pal.
let selecting = false;
let selected = new Set();
let preSelectView = null;      // the view and panel to restore on exit
let lastToggledId = null;      // anchor for Shift+click / Shift+Arrow ranges
const rosterList = document.getElementById('rosterList');
const rosterViewEl = document.getElementById('rosterView');
const denseToggle = document.getElementById('denseToggle');
denseToggle.addEventListener('click', () => {
  denseRows = !denseRows;
  setSwitch(denseToggle, denseRows);
  rosterList.classList.toggle('dense', denseRows);
  save();
});
rosterViewEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  rosterView = b.dataset.v;
  setSeg(rosterViewEl, rosterView, 'v');
  save(); renderRoster();
  b.focus();   // the pressed segment survives its own re-render
});

const bulkBar = document.getElementById('bulkbar');
const bulkCount = document.getElementById('bulkCount');
const bulkRemove = document.getElementById('bulkRemove');
const bulkDone = document.getElementById('bulkDone');
const rosterSelectBtn = document.getElementById('rosterSelect');
// Selection lives in Rows only. Tiles shows one tile per SPECIES and no pals at
// all, so a checkbox there would either mean "all 6 Lamball" — conflating a
// species with a pal (§6) — or be a second focusable inside a board that §4
// keeps to one tab stop. Entering forces Rows and hides the view switch for the
// duration, the same way §9 hides a view switch over a pane that isn't showing.
function enterSelect() {
  if (selecting || !roster.length) return;
  selecting = true;
  selected.clear(); lastToggledId = null;
  preSelectView = {view: rosterView, open: openSpecies};
  rosterView = 'rows'; openSpecies = null;
  document.body.classList.add('selecting');
  renderRoster();
  const first = rosterList.querySelector('.rchk');
  if (first) first.focus();
}
function exitSelect(refocus = true) {
  if (!selecting) return;
  selecting = false;
  selected.clear(); lastToggledId = null;
  document.body.classList.remove('selecting');
  if (preSelectView) { rosterView = preSelectView.view; openSpecies = preSelectView.open; preSelectView = null; }
  renderRoster();
  // §9: the button hides itself on entry, so it has to be back on screen
  // before it can be the thing focus returns to. renderRoster just did that.
  // §9 again, from the other side: the button is hidden exactly when the roster
  // just emptied, so "don't focus a hidden control" has to name a successor
  // rather than silently do nothing.
  if (refocus) (rosterSelectBtn.hidden
    ? (rosterList.querySelector('.hint button') || document.getElementById('rosterOpenAdd'))
    : rosterSelectBtn).focus();
}
// the bar's height feeds the list's bottom padding and the toast offset, so a
// wrapped count line can never hide the last row or the Undo
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--bulkbar-h', Math.round(bulkBar.getBoundingClientRect().height) + 'px');
}).observe(bulkBar);
// the tab bar carries env(safe-area-inset-bottom) itself, so its measured height
// is the exact offset the bulk bar needs to sit flush on it
new ResizeObserver(() => {
  const n = document.getElementById('bottomnav');
  const h = Math.round(n.getBoundingClientRect().height);
  if (h) document.documentElement.style.setProperty('--nav-h', h + 'px');
}).observe(document.getElementById('bottomnav'));
// Escape exits the mode from anywhere in the view, not only from the list:
// the bar is one Shift+Tab from any row, so it is exactly where a keyboard user
// stands when they reach for it.
document.getElementById('view-roster').addEventListener('keydown', e => {
  if (selecting && e.key === 'Escape' && !rosterList.contains(e.target)) {
    e.stopPropagation(); exitSelect();
  }
});
rosterSelectBtn.addEventListener('click', enterSelect);
bulkDone.addEventListener('click', () => exitSelect());
bulkRemove.addEventListener('click', () => removeEntries([...selected]));

// ---------- the expanding panel ----------
// The panel is a real sibling placed after the last tile of the open tile's
// visual row, and spans every column. Grid auto-placement then starts it on a
// fresh row and resumes the following tiles below it — so DOM order equals
// visual order and Tab order is correct without grid-auto-flow:dense.
function placeRosterPanel() {
  const panel = document.getElementById('rosPanel');
  if (!panel) return;
  // gridTemplateColumns resolves to the repeat() source, not a track list,
  // while any ancestor is display:none — which .view is on every inactive tab
  if (!document.getElementById('view-roster').classList.contains('active')) return;
  const cols = getComputedStyle(rosterList).gridTemplateColumns.split(' ').length;
  const tiles = [...rosterList.querySelectorAll('.rostile')];
  const i = tiles.findIndex(t => t.dataset.k === openSpecies);
  if (i < 0) return;
  const anchor = tiles[Math.min(tiles.length - 1, Math.floor(i / cols) * cols + cols - 1)];
  // Mandatory guard: re-placing unconditionally mutates the DOM, which changes
  // the list height, which fires the ResizeObserver again — a loop.
  if (panel.previousElementSibling !== anchor) anchor.after(panel);
}
new ResizeObserver(() => placeRosterPanel()).observe(rosterList);

// the board is one tab stop; arrows move within it
function seedTiles(active) {
  const tiles = [...rosterList.querySelectorAll('.rostile')];
  for (const t of tiles) t.tabIndex = -1;
  (active && tiles.includes(active) ? active : tiles[0] || {}).tabIndex = 0;
}
function closePanel(refocus = true) {
  const k = openSpecies;
  openSpecies = null;
  renderRoster();
  if (!refocus || !k) return;
  const t = rosterList.querySelector(`.rostile[data-k="${CSS.escape(k)}"]`);
  if (t) { seedTiles(t); t.focus(); }
}
// Arrowing across the board never opens or closes anything — this is a set of
// disclosures, not a menu. Only Enter, Space, click, ✕ and Escape do that.
rosterList.addEventListener('keydown', e => {
  if (selecting) { selectKeys(e); return; }
  if (e.key === 'Escape' && openSpecies && rosterList.contains(e.target)) {
    e.stopPropagation(); closePanel(); return;
  }
  const cur = e.target.closest('.rostile');
  if (!cur) return;
  const tiles = [...rosterList.querySelectorAll('.rostile')];
  const i = tiles.indexOf(cur);
  const cols = getComputedStyle(rosterList).gridTemplateColumns.split(' ').length;
  // geometry, not index math — gridStep in core.js, shared with the Paldex
  const step = dir => gridStep(tiles, cur, dir);
  let j = null;
  if (e.key === 'ArrowRight') j = Math.min(i + 1, tiles.length - 1);
  else if (e.key === 'ArrowLeft') j = Math.max(i - 1, 0);
  else if (e.key === 'ArrowDown') j = step(1);
  else if (e.key === 'ArrowUp') j = step(-1);
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = tiles.length - 1;
  else if (e.key === 'PageDown') j = Math.min(i + cols * 4, tiles.length - 1);
  else if (e.key === 'PageUp') j = Math.max(i - cols * 4, 0);
  if (j === null) { if (e.key.startsWith('Arrow')) e.preventDefault(); return; }
  e.preventDefault();
  seedTiles(tiles[j]); tiles[j].focus();
  tiles[j].scrollIntoView({block: 'nearest',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
});
// The rows a filter is currently showing, in render order — what "select all"
// and a band checkbox act on. Selecting is done AFTER narrowing, which is why
// filtering must never clear the selection; the bar states the discrepancy.
function shownRows() {
  return [...rosterList.querySelectorAll('.rosrow')].map(li => li.dataset.id);
}
// A mouse click moves focus but not the roving tab stop, so Shift+Tab from a
// clicked row went to the check-all instead of the bar. Keep them together.
rosterList.addEventListener('focusin', e => {
  if (!selecting) return;
  const cb = e.target.closest && e.target.closest('.rchk');
  if (!cb) return;
  for (const b2 of rosterList.querySelectorAll('.rchk')) b2.tabIndex = b2 === cb ? 0 : -1;
});
function toggleRow(id, on, range) {
  const ids = shownRows();
  // Shift extends from the last toggled row to this one, setting all to the new
  // state. A pointer/modifier convenience only — every row is reachable alone.
  if (range && lastToggledId && lastToggledId !== id) {
    const a = ids.indexOf(lastToggledId), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) for (const k of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? selected.add(k) : selected.delete(k);
  } else on ? selected.add(id) : selected.delete(id);
  lastToggledId = id;
  syncSelectUI();
}
// null = every shown row; a species key = that section's shown rows
function toggleGroup(k, on) {
  for (const li of rosterList.querySelectorAll('.rosrow')) {
    if (k && li.closest('.rosgrp')?.dataset.k !== k) continue;
    on ? selected.add(li.dataset.id) : selected.delete(li.dataset.id);
  }
  syncSelectUI();
}
// Repaint the checkboxes and the bar without re-rendering the list: a full
// re-render on every tick would throw away focus mid-selection.
function syncSelectUI() {
  if (!selecting) return;
  const shown = shownRows();
  for (const li of rosterList.querySelectorAll('.rosrow')) {
    const on = selected.has(li.dataset.id);
    li.classList.toggle('on', on);
    const cb = li.querySelector('.rchk'); if (cb) cb.checked = on;
  }
  const tri = (cb, ids) => {
    const n = ids.filter(id => selected.has(id)).length;
    cb.checked = n > 0 && n === ids.length;
    cb.indeterminate = n > 0 && n < ids.length;
  };
  for (const sec of rosterList.querySelectorAll('.rosgrp')) {
    const cb = sec.querySelector('.rosband .rchk'); if (!cb) continue;
    tri(cb, [...sec.querySelectorAll('.rosrow')].map(li => li.dataset.id));
  }
  const allCb = rosterList.querySelector('.rosselall .rchk');
  if (allCb) tri(allCb, shown);

  const n = selected.size;
  const hidden = [...selected].filter(id => !shown.includes(id)).length;
  // hidden-ness outranks "all of them": a selection you cannot see is the fact
  // that changes what Remove will do
  const next = !n ? 'Select the pals you want to remove.'
    : hidden === n ? `${n} selected — none shown`
    : hidden ? `${n} selected — ${hidden} not shown`
    : n === roster.length ? `${n} selected — all of them`
    : `${n} selected`;
  // aria-atomic re-speaks the whole sentence on any change, and renderRoster runs
  // per keystroke while filtering — only write when it actually differs
  if (bulkCount.textContent !== next) bulkCount.textContent = next;
  bulkRemove.textContent = n ? 'Remove ' + n : 'Remove';
  bulkRemove.disabled = !n;
}
// The list is one tab stop in selection mode: arrows walk the flat sequence of
// checkboxes (check-all, band, rows, band, rows…), Tab leaves. Same convention
// as the grid boards, and gridStep degrades to ±1 in a single column.
function selectKeys(e) {
  if (e.key === 'Escape') { e.stopPropagation(); exitSelect(); return true; }
  const boxes = [...rosterList.querySelectorAll('.rchk')];
  const cur = e.target.closest('.rchk');
  if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && rosterList.contains(e.target)) {
    e.preventDefault();
    const shown = shownRows();
    toggleGroup(null, !shown.every(id => selected.has(id)));
    return true;
  }
  if (!cur) return false;
  const i = boxes.indexOf(cur);
  let j = null;
  if (e.key === 'ArrowDown') j = gridStep(boxes, cur, 1);
  else if (e.key === 'ArrowUp') j = gridStep(boxes, cur, -1);
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = boxes.length - 1;
  else if (e.key === 'PageDown') j = Math.min(i + 10, boxes.length - 1);
  else if (e.key === 'PageUp') j = Math.max(i - 10, 0);
  if (j === null) { if (e.key.startsWith('Arrow')) e.preventDefault(); return true; }
  e.preventDefault();
  // Shift+Arrow paints the box it passes over with the anchor's state
  if (e.shiftKey && boxes[j].dataset.kind === 'row' && cur.dataset.kind === 'row') {
    toggleRow(boxes[j].dataset.key, cur.checked, false);
  }
  boxes.forEach(b => { b.tabIndex = -1; });
  boxes[j].tabIndex = 0; boxes[j].focus();
  boxes[j].scrollIntoView({block: 'nearest', behavior: SMOOTH});
  return true;
}

// One pal, two places to act on it — the Roster row and the pal card. Both go
// through these, so a duplicate always stars its species and a removal always
// offers the same Undo and the same "species still ★ owned" follow-up.
function duplicateEntry(r) {
  const p = byKey.get(r.k);
  // Passives, gender and the note describe the line and come along; the
  // nickname and the IVs belong to the individual you copied and would be
  // wrong on its sibling.
  const copy = {id: newEntryId(), k: r.k, ps: [...r.ps], g: r.g || null, nick: '', note: r.note || '', iv: null};
  const at = roster.findIndex(x => x.id === r.id) + 1;
  roster.splice(at < 1 ? roster.length : at, 0, copy);
  if (!owned.has(copy.k)) toggleOwned(copy.k);
  saveRoster(); renderRoster(); renderDex(); renderReverse();
  toast('Added another ' + p.n, () => {
    const i = roster.findIndex(x => x.id === copy.id);
    if (i >= 0) roster.splice(i, 1);
    saveRoster(); renderRoster(); renderDex(); renderReverse();
  }, {label: 'Edit it', fn: () => { const e2 = roster.find(x => x.id === copy.id); if (e2) openRosterEditor(e2); }});
}
// One Undo for the whole batch. Capture in ascending original index, splice
// descending so earlier indices stay valid, and restore ascending so positions
// and the "Newest first" sort come back exactly as they were.
function removeEntries(ids) {
  const set = new Set(ids);
  const taken = [];
  roster.forEach((r, i) => { if (set.has(r.id)) taken.push({i, entry: r}); });
  if (!taken.length) return;
  // exactly one falls through to the single-entry path, so the two can never
  // disagree about wording or about the still-starred follow-up
  if (taken.length === 1) {
    selected.delete(taken[0].entry.id); removeEntry(taken[0].entry); renderRoster();
    // the same two handoffs the batch path does below: syncSelectUI disables the
    // button under the user's focus, so without this it falls to <body> — and a
    // remove that empties the roster must not leave the mode running over the
    // empty state, announcing "Pick the pals you want to remove"
    if (!roster.length) exitSelect();
    else { const chk = rosterList.querySelector('.rchk'); if (chk) chk.focus(); }
    return;
  }
  const speciesGone = [...new Set(taken.map(t => t.entry.k))]
    .filter(k => !roster.some(r => r.k === k && !set.has(r.id)) && owned.has(k));
  for (let i = taken.length - 1; i >= 0; i--) roster.splice(taken[i].i, 1);
  selected.clear(); lastToggledId = null;
  saveRoster(); renderRoster(); renderDex(); renderReverse();
  const undo = () => {
    for (const t of taken) roster.splice(Math.min(t.i, roster.length), 0, t.entry);
    saveRoster(); renderRoster(); renderDex(); renderReverse();
    const chk = rosterList.querySelector('.rchk'); if (chk) chk.focus();
  };
  const n = taken.length;
  const all = !roster.length;
  let msg = all ? `Removed all ${n} pals from your roster` : `Removed ${n} pals from your roster`;
  let action = null;
  if (!all && speciesGone.length) {
    msg = speciesGone.length === 1
      ? `Removed ${n} pals — ${byKey.get(speciesGone[0]).n} is still ★ owned`
      : `Removed ${n} pals — ${speciesGone.length} species are still ★ owned`;
    action = {
      label: speciesGone.length === 1 ? 'Un-star ' + byKey.get(speciesGone[0]).n : 'Un-star ' + speciesGone.length + ' species',
      fn: () => {
        for (const k of speciesGone) if (owned.has(k)) toggleOwned(k);
        renderDex(); renderReverse();
        toast('Un-starred ' + speciesGone.length + ' species');
      },
    };
  }
  // 12s, not 8: undoing a batch is the highest-stakes reversal in the app and
  // 8s is not enough to notice it, read it and reach it (DESIGN.md §4)
  toast(msg, undo, action, {ms: 12000});
  if (!roster.length) exitSelect();
  else { const chk = rosterList.querySelector('.rchk'); if (chk) chk.focus(); }
}
function removeEntry(r) {
  const idx = roster.findIndex(x => x.id === r.id);
  if (idx < 0) return;
  const removed = roster[idx];
  roster.splice(idx, 1); saveRoster(); renderRoster(); renderDex(); renderReverse();
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
}
const ivSum = r => (r.iv || []).reduce((a, b) => a + (b || 0), 0);
const ROSTER_SORTS = {
  z: (a, b) => byKey.get(a.k).z - byKey.get(b.k).z,
  n: (a, b) => byKey.get(a.k).n.localeCompare(byKey.get(b.k).n),
  new: (a, b) => +b.id.slice(0, 13) - +a.id.slice(0, 13),
  ps: (a, b) => b.ps.length - a.ps.length,
  iv: (a, b) => ivSum(b) - ivSum(a),
};
// Within a species the species-level keys (Paldex #, name) say nothing, so
// they fall through to "newest first" — the sibling you just hatched.
const ROW_SORTS = {
  z: (a, b) => +b.id.slice(0, 13) - +a.id.slice(0, 13),
  n: (a, b) => (a.nick || '').localeCompare(b.nick || '') || +b.id.slice(0, 13) - +a.id.slice(0, 13),
  new: (a, b) => +b.id.slice(0, 13) - +a.id.slice(0, 13),
  ps: (a, b) => b.ps.length - a.ps.length,
  iv: (a, b) => ivSum(b) - ivSum(a),
};
// How a whole section ranks: its best row under the active sort.
const SECTION_RANK = {
  z: es => byKey.get(es[0].k).z,
  n: es => byKey.get(es[0].k).n,
  new: es => -Math.max(...es.map(r => +r.id.slice(0, 13))),
  ps: es => -Math.max(...es.map(r => r.ps.length)),
  iv: es => -Math.max(...es.map(ivSum)),
};

function renderRoster() {
  const list = document.getElementById('rosterList');
  const stats = document.getElementById('rosterStats');

  // A re-render throws the whole list away, so remember what had focus and
  // hand it back afterwards — DESIGN.md §7. Every caller gets this for free.
  const ae = document.activeElement;
  let restore = null;
  // In selection mode the list is one roving tab stop, so the successor is a
  // checkbox index, not a row's named action. Captured separately, and the
  // legacy path below is skipped — it would hunt for a .nm this mode doesn't
  // render and drop focus on the header's Add button instead.
  let chkIdx = selecting && ae && list.contains(ae) && ae.classList.contains('rchk')
    ? [...list.querySelectorAll('.rchk')].indexOf(ae) : -1;
  if (ae && list.contains(ae) && !selecting) {
    const row = ae.closest('.rosrow');
    const tile = ae.closest('.rostile');
    const band = ae.closest('.rosband');
    if (row) restore = {id: row.dataset.id, act: ae.dataset.act || 'name',
      idx: [...list.querySelectorAll('.rosrow')].indexOf(row)};
    else if (tile) restore = {k: tile.dataset.k, idx: [...list.querySelectorAll('.rostile')].indexOf(tile)};
    else if (band) restore = {k: openSpecies, close: true};
  }
  list.innerHTML = '';
  list.classList.toggle('dense', denseRows);

  const q = rosterSearch.value.trim().toLowerCase();
  const pf = rosterPassiveFilter.value;
  const filtering = !!(q || pf);
  const rows = roster.filter(r => {
    const p = byKey.get(r.k);
    const hit = !q || p.n.toLowerCase().includes(q) || (r.nick && r.nick.toLowerCase().includes(q)) || r.ps.some(x => x.toLowerCase().includes(q));
    return hit && (!pf || r.ps.includes(pf));
  });

  const shownSpecies = new Set(rows.map(r => r.k));
  stats.textContent = !roster.length ? ''
    : filtering
      ? `${rows.length} of ${roster.length} pal${roster.length === 1 ? '' : 's'} · ${shownSpecies.size} species`
      : `${roster.length} pal${roster.length === 1 ? '' : 's'} · ${new Set(roster.map(r => r.k)).size} species`;

  const controls = document.querySelector('.roscontrols');
  if (controls) controls.hidden = !roster.length;
  // the view switch is hidden while selecting: selection only exists in Rows,
  // so a control offering the other view would offer to lose the selection
  rosterViewEl.hidden = !roster.length || selecting;
  rosterSelectBtn.hidden = !roster.length || selecting;
  bulkBar.hidden = !selecting;
  // nothing for it to compact until a panel or the Rows view supplies rows
  denseToggle.disabled = rosterView === 'tiles' && !openSpecies;
  setSeg(rosterViewEl, rosterView, 'v');
  list.classList.toggle('tileview', rosterView === 'tiles');
  list.classList.toggle('rowview', rosterView !== 'tiles');

  if (!rows.length) {
    lastSections = [];
    lastCount = 0;
    openSpecies = null;
    const h = document.createElement('div'); h.className = 'hint';
    if (roster.length) {
      // an empty state without a way out is a dead end (DESIGN.md §4).
      // The count stays a count — the sentence belongs to the hint, and the
      // header is the only place that says how much you actually own.
      stats.textContent = `0 of ${roster.length} pal${roster.length === 1 ? '' : 's'}`;
      h.append('No pals match these filters. ');
      const b = document.createElement('button'); b.className = 'alink'; b.textContent = 'Clear filters';
      b.addEventListener('click', () => {
        rosterSearch.value = ''; rosterPassiveFilter.value = '';
        if (rosterPassiveSel) rosterPassiveSel.sync();
        renderRoster(); rosterSearch.focus();
      });
      h.appendChild(b);
    } else {
      h.append('No pals in your roster yet. ');
      const b = document.createElement('button'); b.className = 'alink primary'; b.textContent = '+ Add your first pal';
      b.addEventListener('click', () => openRosterEditor(null));
      h.appendChild(b);
      h.append(' Or use “Add to roster” on any pal card.');
      // the cheapest improvement for someone about to grind the dialog for
      // pals they only need marked as owned is telling them not to
      const w = document.createElement('div'); w.className = 'emptywhy';
      const wt = document.createElement('span');
      wt.textContent = 'You don’t need an entry for every pal. Star a species ★ in the Paldex to satisfy every owned filter. An entry is for when one pal’s passives, gender or IVs matter.';
      w.appendChild(wt);
      const b2 = document.createElement('button'); b2.className = 'alink'; b2.textContent = 'Open the Paldex';
      b2.addEventListener('click', () => navTab('dex'));
      w.appendChild(b2);
      h.appendChild(w);
    }
    list.appendChild(h);
    // an early return is still a re-render — focus must not land on <body>
    if (restore) (h.querySelector('button') || document.getElementById('rosterOpenAdd')).focus();
    // …and the bar still has to describe a selection this filter now hides,
    // or it keeps announcing a count from before the filter was typed
    if (selecting) syncSelectUI();
    renderRosterStrip(); return;
  }

  // ---- selection helpers ----
  // A native checkbox throughout: it is the only HTML control that exposes
  // `mixed`, which the two tristate levels (band, check-all) need for 4.1.2.
  const mkChk = (kind, key) => {
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'rchk'; cb.tabIndex = -1;
    cb.dataset.kind = kind; if (key != null) cb.dataset.key = key;
    if (kind === 'row') cb.checked = selected.has(key);
    cb.addEventListener('change', e => {
      if (kind === 'row') toggleRow(key, cb.checked, e.shiftKey);
      else toggleGroup(kind === 'all' ? null : key, cb.checked);
    });
    return cb;
  };

  // ---- one row's action cluster: a single tab stop, arrows move inside ----
  const mkActs = r => {
    const p = byKey.get(r.k);
    const who = r.nick || p.n;
    const acts = document.createElement('div');
    acts.className = 'acts'; acts.setAttribute('role', 'toolbar');
    acts.setAttribute('aria-label', 'Actions for ' + who);
    acts.setAttribute('aria-orientation', 'horizontal');
    const mk = (act, glyph, label, title) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = glyph; b.dataset.act = act;
      b.setAttribute('aria-label', label); b.title = title;
      acts.appendChild(b); return b;
    };
    mk('edit', '✎', 'Edit ' + who, 'Edit').addEventListener('click', () => openRosterEditor(r));
    // "another one like that" in one click — see duplicateEntry
    mk('dup', '⧉', 'Duplicate ' + who, 'Duplicate — another with the same passives, gender and note')
      .addEventListener('click', () => duplicateEntry(r));
    mk('remove', '✕', 'Remove ' + who + ' from roster', 'Remove from roster')
      .addEventListener('click', () => removeEntry(r));
    rovingRow(acts);
    return acts;
  };

  // ---- one pal, one row ----
  const mkRow = r => {
    const p = byKey.get(r.k);
    const li = document.createElement('li');
    li.className = 'rosrow' + (r.id === editingId ? ' editing' : '') + (selecting ? ' selectable' : '');
    li.dataset.id = r.id;

    // In selection mode the row's own name button and its action toolbar are not
    // rendered: Edit and Duplicate are the wrong verbs while you are operating
    // on a set. So a row costs ZERO tab stops, not three — the whole list is one
    // stop with a roving tabindex, like the grid boards (DESIGN.md §4).
    if (selecting) {
      const cb = mkChk('row', r.id);
      // aria-label, so gender goes in as a word: a label prunes the subtree and
      // a gEl glyph inside it would never be announced. Level and passives are
      // what a dud is judged on, so they are what tells six rows apart.
      const bits = [r.g === 'M' ? 'male ' : r.g === 'F' ? 'female ' : '', r.nick ? '“' + r.nick + '”' : (r.gname ? '“' + r.gname + '”' : p.n)];
      let lbl = 'Select ' + bits.join('');
      if (!r.g) lbl += ', gender not recorded';
      if (r.lv) lbl += ', level ' + r.lv;
      lbl += ' — ' + (r.ps.length ? r.ps.join(', ') : 'no passives');
      cb.setAttribute('aria-label', lbl);
      li.appendChild(cb);
      // the whole row is a pointer target too; the checkbox stays the real
      // control, so nothing is pointer-gated
      li.addEventListener('click', e => {
        if (e.target.closest('.rchk')) return;
        toggleRow(r.id, !selected.has(r.id), e.shiftKey);
        // the <li> isn't focusable, so a pointer user who then reached for Space
        // or an arrow key was scrolling the page instead of driving the list
        cb.focus();
      });
    }

    const who = document.createElement('div'); who.className = 'who';
    if (selecting) {
      // static identity: same information, no controls
      const n2 = document.createElement('span'); n2.className = 'nm';
      if (r.g) { n2.appendChild(gEl(gsymR(r.g))); n2.append(' '); }
      else { const u = document.createElement('span'); u.className = 'gu'; u.textContent = '?'; u.setAttribute('aria-hidden', 'true'); n2.appendChild(u); n2.append(' '); }
      n2.append(r.nick ? '“' + r.nick + '”' : (r.gname ? '“' + r.gname + '”' : p.n));
      who.appendChild(n2);
      if (r.lv) { const lc = document.createElement('span'); lc.className = 'lvchip'; lc.textContent = 'Lv ' + r.lv; who.appendChild(lc); }
      if (r.iv) { const ivc = document.createElement('span'); ivc.className = 'ivchip'; ivc.textContent = 'IV ' + r.iv.map(v => v === null ? '–' : v).join('·'); who.appendChild(ivc); }
      li.appendChild(who);
      const pc2 = document.createElement('div'); pc2.className = 'pscol';
      if (r.ps.length) pc2.appendChild(passiveChips(r.ps));
      else { const none = document.createElement('span'); none.className = 'nops'; none.textContent = 'No passives'; pc2.appendChild(none); }
      li.appendChild(pc2);
      const nt2 = document.createElement('div'); nt2.className = 'note';
      if (r.note) { nt2.textContent = r.note; nt2.title = r.note; }
      li.appendChild(nt2);
      return li;
    }
    const nm = document.createElement('button');
    nm.type = 'button'; nm.className = 'thbtn nm'; nm.dataset.act = 'name';
    // The accessible name has to contain what the button visibly says, or
    // speech input can't reach it (WCAG 2.5.3). A save-imported pal shows its
    // in-game name, so that name has to be in the chain too.
    nm.setAttribute('aria-label', 'View ' + (r.nick || r.gname || p.n) + ' details');
    nm.title = 'View ' + p.n + '’s full card';
    // The section header already says the species, so a row never repeats it.
    // A pal with no recorded gender says so instead of falling back to a name
    // that is on every row above it.
    if (r.g) { nm.appendChild(gEl(gsymR(r.g))); nm.append(' '); }
    else {
      const u = document.createElement('span'); u.className = 'gu';
      u.textContent = '?'; u.title = 'Gender not recorded';
      u.setAttribute('role', 'img'); u.setAttribute('aria-label', 'gender not recorded');
      nm.appendChild(u); nm.append(' ');
    }
    if (r.nick) { const nk = document.createElement('span'); nk.textContent = '“' + r.nick + '”'; nm.appendChild(nk); }
    // The save has a nickname field of its own. It is shown here rather than in
    // the nick field, because a pal renamed in-game must not overwrite the name
    // you typed — and hiding the disagreement would be worse than showing it.
    else if (r.gname) { const gn = document.createElement('span'); gn.className = 'gname'; gn.textContent = '“' + r.gname + '”'; gn.title = 'Name from your save file'; nm.appendChild(gn); }
    nm.addEventListener('click', () => openModal(p, r));
    who.appendChild(nm);
    if (r.lv) {
      const lc = document.createElement('span'); lc.className = 'lvchip';
      lc.textContent = 'Lv ' + r.lv; lc.title = 'Level, from your save file'; who.appendChild(lc);
    }
    if (r.iv) {
      const ivc = document.createElement('span'); ivc.className = 'ivchip';
      ivc.textContent = 'IV ' + r.iv.map(v => v === null ? '–' : v).join('·');
      ivc.title = 'HP · Attack · Defense IVs'; who.appendChild(ivc);
    }
    li.appendChild(who);

    // the passive column is what you are actually scanning for, so it is
    // always in the same place and never blank — an empty cell reads as a bug
    const pc = document.createElement('div'); pc.className = 'pscol';
    if (r.ps.length) pc.appendChild(passiveChips(r.ps));
    else { const none = document.createElement('span'); none.className = 'nops'; none.textContent = 'No passives'; pc.appendChild(none); }
    li.appendChild(pc);

    const nt = document.createElement('div'); nt.className = 'note';
    if (r.note) { nt.textContent = r.note; nt.title = r.note; }
    li.appendChild(nt);

    li.appendChild(mkActs(r));
    return li;
  };

  // ---- shared bits of a species header ----
  const chipsFor = (k, entries, total, tile) => {
    const wrap = document.createElement('span'); wrap.className = 'chiprow';
    if (!tile) {
      const cnt = document.createElement('span'); cnt.className = 'cntb';
      const x = document.createElement('span'); x.setAttribute('aria-hidden', 'true'); x.textContent = '×';
      cnt.appendChild(x); cnt.append(String(entries.length));
      const sr = document.createElement('span'); sr.className = 'sr-only';
      sr.textContent = ' pal' + (entries.length === 1 ? '' : 's') + (entries.length < total ? ' of ' + total : '');
      cnt.appendChild(sr);
      wrap.appendChild(cnt);
    }
    // The breeding question. The tally always counts the whole species, so
    // while a filter is on it says so — two numbers in one header must not
    // describe two different populations.
    const gi = speciesGenderInfo(k);
    if (gi) {
      // A one-sided roster blocks exactly one thing: pairing two of THESE.
      // Any ♂ breeds with any ♀ whatever the species, so the old "No ♀ to
      // breed with" was flatly untrue — it read as "these pals are unusable"
      // when only same-species pairing (how you make more of this species)
      // is off the table. The tally stays either way; a warning that eats
      // the number it is warning about leaves nothing to act on.
      const oneSided = gi.n >= 2 && !gi.U && (!gi.M || !gi.F);
      const chip = document.createElement('span');
      chip.className = 'mchip' + (oneSided ? ' warn' : '');
      const tally = [gi.M ? gi.M + '♂' : '', gi.F ? gi.F + '♀' : '', gi.U ? gi.U + ' ?' : ''].filter(Boolean).join(' · ');
      const counts = entries.length < total ? `of all ${total}: ${tally}` : tally;
      // The reason wraps to four lines in a 97px tile and adds ~35px to every
      // row of the board, so a tile states the fact and the panel states why.
      // Sighted: the plain tally has no chip chrome, the warning keeps it, so
      // shape carries it as well as hue. AT gets the words either way.
      chip.appendChild(genderize(!oneSided ? counts
        : tile ? `all ${gi.n} ${gi.M ? '♂' : '♀'}`
        : `${counts} · can’t pair with each other`));
      if (oneSided && tile) {
        const sr = document.createElement('span'); sr.className = 'sr-only';
        sr.textContent = ' — can’t pair with each other';
        chip.appendChild(sr);
      }
      wrap.appendChild(chip);
    }
    return wrap;
  };
  const chev = () => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'tchev'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', '16'); s.setAttribute('height', '16');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm6 9 6 6 6-6');
    s.appendChild(path);
    return s;
  };

  // ---- sections, ordered by the active sort ----
  const groups = new Map();
  for (const r of rows) (groups.get(r.k) || groups.set(r.k, []).get(r.k)).push(r);
  const sortKey = ROSTER_SORTS[rosterSort.value] ? rosterSort.value : 'z';
  const rank = SECTION_RANK[sortKey];
  const sections = [...groups.entries()].sort((a, b) => {
    const ra = rank(a[1]), rb = rank(b[1]);
    return typeof ra === 'string' ? ra.localeCompare(rb) : ra - rb;
  });
  lastSections = sections.map(([k]) => k);

  // A filter that leaves one species has nothing to choose between, so open it.
  // Only at the render where that becomes true — reopening it every render
  // would fight a user who then closed it.
  if (sections.length === 1 && filtering && lastCount !== 1) { openSpecies = sections[0][0]; autoOpened = true; }
  // the user never chose this one, so it goes when the filter that caused it does
  if (autoOpened && !filtering) { openSpecies = null; autoOpened = false; }
  lastCount = sections.length;
  // the open species may have just been filtered or removed away
  if (openSpecies && !lastSections.includes(openSpecies)) openSpecies = null;

  const band = (p, entries, total) => {
    const h = document.createElement('h3');
    h.className = 'rosband';
    // In selection mode the band is a checkbox BESIDE a heading, never one
    // inside it: prepending the control made the computed heading name read
    // "Select all 6 Lamball Lamball 6 pals …" to heading navigation. Same
    // ruling as .rosselall — a control is not a heading.
    let bandWrap = null, bandCb = null;
    if (selecting) {
      bandCb = mkChk('band', p.k);
      bandCb.setAttribute('aria-label', entries.length === 1
        ? 'Select ' + p.n : `Select all ${entries.length} ${p.n}`);
      bandWrap = document.createElement('div');
      bandWrap.className = 'rosbandsel';
      bandWrap.append(bandCb, h);
      // the whole band selects its species, the way a row and the check-all do
      bandWrap.addEventListener('click', e => {
        if (e.target.closest('.rchk')) return;
        bandCb.checked = !bandCb.checked; toggleGroup(p.k, bandCb.checked); bandCb.focus();
      });
    }
    const ic = icon(p, 28, false, true);
    ic.style.removeProperty('--ico');
    h.appendChild(ic);
    const nm = document.createElement('span'); nm.className = 'gname2'; nm.textContent = p.n;
    h.appendChild(nm);
    h.appendChild(chipsFor(p.k, entries, total));
    return {h: bandWrap || h, nm};
  };

  if (selecting) {
    // A control, not a heading: an <h3> here would inject a phantom section into
    // the document outline. Reuses .rosband's padding and its lead column so all
    // three checkbox levels line up on one vertical rule.
    const sa = document.createElement('div'); sa.className = 'rosselall';
    const cb = mkChk('all');
    const lb = document.createElement('span'); lb.className = 'salb';
    lb.textContent = filtering ? `Select all ${rows.length} shown` : `Select all ${rows.length}`;
    // The label never flips to "Clear selection" — the tristate box carries that
    cb.setAttribute('aria-label', lb.textContent);
    sa.append(cb, lb);
    sa.addEventListener('click', e => { if (!e.target.closest('.rchk')) { cb.checked = !cb.checked; toggleGroup(null, cb.checked); } });
    list.appendChild(sa);
  }

  if (rosterView === 'rows') {
    for (const [k, entries] of sections) {
      const p = byKey.get(k);
      entries.sort(ROW_SORTS[sortKey]);
      const total = roster.filter(r => r.k === k).length;
      const sec = document.createElement('section');
      sec.className = 'rosgrp'; sec.dataset.k = k;
      sec.appendChild(band(p, entries, total).h);
      const ul = document.createElement('ul');
      ul.className = 'roslist';
      ul.setAttribute('aria-label', `${p.n} — ${entries.length} pal${entries.length === 1 ? '' : 's'}`);
      for (const r of entries) ul.appendChild(mkRow(r));
      sec.appendChild(ul);
      list.appendChild(sec);
    }
  } else {
    let panel = null;
    for (const [k, entries] of sections) {
      const p = byKey.get(k);
      entries.sort(ROW_SORTS[sortKey]);
      const total = roster.filter(r => r.k === k).length;

      const tile = document.createElement('button');
      tile.type = 'button'; tile.className = 'rostile'; tile.dataset.k = k;
      tile.tabIndex = -1;
      if (openSpecies === k) tile.setAttribute('aria-controls', 'rosPanel');
      tile.setAttribute('aria-expanded', String(openSpecies === k));
      const art = document.createElement('span'); art.className = 'tart';
      const ic = icon(p, 44, false, true); ic.style.removeProperty('--ico');
      art.appendChild(ic);
      const cnt = document.createElement('span'); cnt.className = 'cntb';
      const x = document.createElement('span'); x.setAttribute('aria-hidden', 'true'); x.textContent = '×';
      cnt.appendChild(x); cnt.append(String(entries.length));
      const sr = document.createElement('span'); sr.className = 'sr-only';
      sr.textContent = ' pal' + (entries.length === 1 ? '' : 's') + (entries.length < total ? ' of ' + total : '');
      cnt.appendChild(sr);
      art.appendChild(cnt);
      tile.appendChild(art);
      const nm = document.createElement('span'); nm.className = 'tname'; nm.textContent = p.n;
      tile.appendChild(nm);
      tile.appendChild(chipsFor(k, entries, total, true));
      tile.appendChild(chev());
      tile.addEventListener('click', () => {
        openSpecies = openSpecies === k ? null : k;
        renderRoster();
        const t = list.querySelector(`.rostile[data-k="${CSS.escape(k)}"]`);
        if (t) { seedTiles(t); t.focus(); }
        const pn = document.getElementById('rosPanel');
        // Anchor on the tile, not the panel. A panel taller than the viewport
        // aligns its own top to y=0 under 'nearest', which scrolls the tile
        // off-screen and parks the band behind the sticky header — leaving a
        // bare list of pals, the exact confusion this rework removed.
        if (t && pn && pn.getBoundingClientRect().top > innerHeight - 120) {
          t.scrollIntoView({block: 'start',
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        }
      });
      list.appendChild(tile);

      if (openSpecies === k) {
        panel = document.createElement('section');
        panel.className = 'rospanel'; panel.id = 'rosPanel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-labelledby', 'rosPanelName');
        const b = band(p, entries, total);
        b.nm.id = 'rosPanelName';
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'pclose'; close.textContent = '✕';
        close.setAttribute('aria-label', 'Close ' + p.n);
        close.addEventListener('click', () => closePanel());
        b.h.appendChild(close);
        panel.appendChild(b.h);
        const ul = document.createElement('ul'); ul.className = 'roslist';
        for (const r of entries) ul.appendChild(mkRow(r));
        panel.appendChild(ul);
      }
    }
    if (panel) { list.appendChild(panel); placeRosterPanel(); }
    seedTiles(list.querySelector('.rostile'));
  }

  // ---- hand focus back ----
  if (restore) {
    let target = null;
    if (restore.k) {
      target = list.querySelector(`.rostile[data-k="${CSS.escape(restore.k)}"]`);
      if (!target) {
        const all = [...list.querySelectorAll('.rostile')];
        target = all[Math.min(restore.idx || 0, all.length - 1)] || null;
      }
      if (target) seedTiles(target);
    } else if (restore.id) {
      const row = list.querySelector(`.rosrow[data-id="${CSS.escape(restore.id)}"]`);
      if (row) target = row.querySelector(`[data-act="${restore.act}"]`) || row.querySelector('.nm');
      else {
        // the row is gone (removed, or filtered away) — take the next one,
        // then the previous, then the section, and never <body>
        const all = [...list.querySelectorAll('.rosrow')];
        const near = all[Math.min(restore.idx, all.length - 1)];
        target = near ? near.querySelector('.nm') : list.querySelector('.rostile, .rosband');
      }
    }
    // A fresh toolbar always seeds tabIndex=0 on its first button. If focus
    // lands on a different one, move the tab stop with it — otherwise the
    // toolbar holds a focused -1 button and a separate 0 elsewhere.
    const bar = target && target.closest && target.closest('.acts');
    if (bar) for (const b of bar.querySelectorAll('button')) b.tabIndex = b === target ? 0 : -1;
    (target || document.getElementById('rosterOpenAdd')).focus();
    if (target && target.scrollIntoView) target.scrollIntoView({block: 'nearest'});
  }

  if (selecting) {
    const boxes = [...rosterList.querySelectorAll('.rchk')];
    const keep = chkIdx >= 0 ? Math.min(chkIdx, boxes.length - 1) : 0;
    boxes.forEach((b2, n) => { b2.tabIndex = n === keep ? 0 : -1; });
    if (chkIdx >= 0 && boxes[keep]) boxes[keep].focus();
    syncSelectUI();
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

