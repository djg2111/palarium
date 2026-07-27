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
  // both describe the species list; on the combos pane they governed nothing
  document.getElementById('dexView').hidden = m !== 'pals';
  document.getElementById('dexOwnedCount').hidden = m !== 'pals';
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
  // the choice explained itself only in title attributes, which touch can't
  // reach — one visible line describes whichever option is selected
  document.getElementById('comboKindWhy').textContent =
    comboKind === 'mix' ? 'Recipes you can plan a route to.'
    : comboKind === 'self' ? 'Legendaries and sub-species — each needs two of itself.'
    : 'Every unique recipe in the game.';
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
    rows.length === DATA.combos.length ? DATA.combos.length + ' combos' : rows.length + ' of ' + DATA.combos.length + ' combos';
  if (!rows.length) {
    const h = document.createElement('div'); h.className = 'hint';
    h.append('No combos match. ');
    const b = document.createElement('button'); h.appendChild(b);
    b.className = 'alink'; b.textContent = '✕ Clear filters';
    b.addEventListener('click', () => {
      document.getElementById('comboSearch').value = '';
      setComboKind('');
      document.getElementById('comboSearch').focus();
    });
    list.appendChild(h);
    return;
  }
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

