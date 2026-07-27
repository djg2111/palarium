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
  // one row is always highlighted, so typing a prefix and pressing Enter takes
  // the passive — the tag input is driven far more often from the keyboard
  // (four passives per pal, over and over) than it is browsed with a mouse
  let rows = [], hl = 0;
  function highlight(i, scroll = true) {
    if (!rows.length) return;
    hl = Math.max(0, Math.min(rows.length - 1, i));
    rows.forEach((r, j) => r.el.classList.toggle('hl', j === hl));
    if (scroll) rows[hl].el.scrollIntoView({block: 'nearest'});
  }
  function take(p) {
    if (selected.length >= max) return;
    // close after each pick: a lingering full-width list would swallow the
    // next click on whatever sits beneath it (typing again reopens it)
    selected.push(p.n); renderChips(); inp.value = '';
    mount.classList.remove('open'); inp.focus();
    onChange && onChange();
  }
  function renderPop() {
    const q = inp.value.trim().toLowerCase();
    pop.innerHTML = ''; rows = [];
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
      r.addEventListener('click', () => take(p));
      pop.appendChild(r); rows.push({el: r, p});
    }
    mount.classList.add('open');
    highlight(0, false);
    fitPopup(mount, pop, pop, 260); // this popup is its own scroller — no chrome
  }
  inp.addEventListener('input', renderPop);
  inp.addEventListener('focus', renderPop);
  inp.addEventListener('click', () => { if (!mount.classList.contains('open')) renderPop(); });
  inp.addEventListener('blur', () => setTimeout(() => mount.classList.remove('open'), 150));
  inp.addEventListener('keydown', e => {
    const open = mount.classList.contains('open');
    if (e.key === 'ArrowDown') { e.preventDefault(); open ? highlight(hl + 1) : renderPop(); }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); highlight(hl - 1); }
    else if (e.key === 'Enter' && open && rows.length) { e.preventDefault(); take(rows[hl].p); }
    // Escape closes the list, not the dialog around it — stop it reaching the
    // document handler that would dismiss the whole roster editor
    else if (e.key === 'Escape' && open) { e.stopPropagation(); mount.classList.remove('open'); }
  });
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

