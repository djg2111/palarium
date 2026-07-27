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
  if (e.key === 'Escape' && openSpecies && rosterList.contains(e.target)) {
    e.stopPropagation(); closePanel(); return;
  }
  const cur = e.target.closest('.rostile');
  if (!cur) return;
  const tiles = [...rosterList.querySelectorAll('.rostile')];
  const i = tiles.indexOf(cur);
  const cols = getComputedStyle(rosterList).gridTemplateColumns.split(' ').length;
  // Vertical moves go by geometry, not by index. Index math clamps to the last
  // tile when the row below is short — so ArrowUp came back somewhere you had
  // never been — and it cannot see that the open panel splits the board into
  // rows of unequal length.
  const rowOf = el => Math.round(el.getBoundingClientRect().top);
  const midOf = el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
  const step = dir => {
    const here = rowOf(cur), x = midOf(cur);
    const away = tiles.filter(t => dir > 0 ? rowOf(t) > here : rowOf(t) < here);
    if (!away.length) return null;                    // no row that way: stay put
    const target = dir > 0 ? Math.min(...away.map(rowOf)) : Math.max(...away.map(rowOf));
    let best = null;
    for (const t of away) {
      if (rowOf(t) !== target) continue;
      if (!best || Math.abs(midOf(t) - x) < Math.abs(midOf(best) - x)) best = t;
    }
    return tiles.indexOf(best);
  };
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
  if (ae && list.contains(ae)) {
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
  rosterViewEl.hidden = !roster.length;
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
    renderRosterStrip(); return;
  }

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
    li.className = 'rosrow' + (r.id === editingId ? ' editing' : '');
    li.dataset.id = r.id;

    const who = document.createElement('div'); who.className = 'who';
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
    const ic = icon(p, 28, false, true);
    ic.style.removeProperty('--ico');
    h.appendChild(ic);
    const nm = document.createElement('span'); nm.className = 'gname2'; nm.textContent = p.n;
    h.appendChild(nm);
    h.appendChild(chipsFor(p.k, entries, total));
    return {h, nm};
  };

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

