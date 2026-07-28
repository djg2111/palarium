// ---------- planner: passive tag input ----------
const PASSIVES = DATA.passives || [];
// display order: regular passives alphabetically, mutation-exclusives last —
// raw data order would greet users with obscure boss passives first
const PASSIVES_SORTED = [...PASSIVES].sort((a, b) => (a.mt ? 1 : 0) - (b.mt ? 1 : 0) || a.n.localeCompare(b.n));
let ptagSeq = 0;
function makePassivePicker(mount, max = 4, onChange, opts = {}) {
  mount.classList.add('ptag');
  const uid = 'ptag' + (++ptagSeq);
  const inp = document.createElement('input'); inp.className = 'taginp'; inp.placeholder = 'Add passives (e.g. Artisan)…';
  inp.setAttribute('aria-label', 'Search and add passive skills');
  // where the cap and the current count reach a screen-reader user (3.3.2) —
  // the hint changes on every recompute, so it must not be a live region
  if (opts.describedBy) inp.setAttribute('aria-describedby', opts.describedBy);
  // It already behaves like a combobox — a filtered list, one highlighted row,
  // Enter to take it — but declared as a bare textbox, so nothing said a list
  // had opened, how many options it held, or which one was current (4.1.2).
  inp.setAttribute('role', 'combobox');
  inp.setAttribute('aria-autocomplete', 'list');
  inp.setAttribute('aria-expanded', 'false');
  inp.setAttribute('aria-controls', uid);
  const pop = document.createElement('div'); pop.className = 'tpop';
  pop.id = uid; pop.setAttribute('role', 'listbox');
  pop.setAttribute('aria-label', 'Passive skills');
  // Chrome makes an overflow:auto container focusable so it can be scrolled by
  // keyboard, so Tab out of the input landed on the popup box itself. An
  // explicit -1 keeps it programmatically focusable and out of the sequence —
  // the rows are driven by arrows, and Escape or leaving closes it.
  pop.tabIndex = -1;
  const chips = document.createElement('div'); chips.className = 'pchips';
  mount.append(inp, pop, chips);
  let selected = [];
  // one place that opens or closes the list, so aria-expanded can never drift
  const setOpen = on => {
    mount.classList.toggle('open', on);
    inp.setAttribute('aria-expanded', String(on));
    if (!on) inp.removeAttribute('aria-activedescendant');
  };
  function renderChips() {
    chips.innerHTML = '';
    for (const n of selected) {
      const meta = PASSIVES.find(p => p.n === n);
      const c = document.createElement('button'); c.type = 'button';
      c.className = 'pchip' + (meta && meta.r < 0 ? ' neg' : '');
      const ic = passiveIcon(meta, 14);
      if (ic) c.appendChild(ic);
      c.append(n);
      // the glyph is decorative: the name has to SAY it removes, or the button
      // is called "Swift" and described as a stat bonus (2.4.6)
      const x = document.createElement('span'); x.setAttribute('aria-hidden', 'true'); x.textContent = ' ✕';
      c.appendChild(x);
      c.setAttribute('aria-label', 'Remove ' + n);
      c.title = 'Remove ' + n + (meta && meta.e ? ' — ' + meta.e : '');
      c.addEventListener('click', () => {
        const i = selected.indexOf(n);
        selected = selected.filter(x2 => x2 !== n); renderChips();
        // renderChips just destroyed this button — hand focus to its successor
        // rather than <body> (DESIGN.md §8), deferred a tick like makePicker
        const next = chips.children[Math.min(i, chips.children.length - 1)] || inp;
        setTimeout(() => next.focus(), 0);
        onChange && onChange();
      });
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
    rows.forEach((r, j) => { r.el.classList.toggle('hl', j === hl); r.el.setAttribute('aria-selected', String(j === hl)); });
    inp.setAttribute('aria-activedescendant', rows[hl].el.id);
    if (scroll) rows[hl].el.scrollIntoView({block: 'nearest'});
  }
  function take(p) {
    // a refusal with no words is indistinguishable from a broken control
    if (selected.length >= max) { toast(`That’s the limit — ${max} passives per pal.`); return; }
    // close after each pick: a lingering full-width list would swallow the
    // next click on whatever sits beneath it (typing again reopens it)
    selected.push(p.n); renderChips(); inp.value = '';
    setOpen(false); inp.focus();
    onChange && onChange();
  }
  function renderPop() {
    const q = inp.value.trim().toLowerCase();
    pop.innerHTML = ''; rows = [];
    const matches = PASSIVES_SORTED.filter(p => !selected.includes(p.n) && (!q || p.n.toLowerCase().includes(q))).slice(0, 30);
    if (!matches.length) { setOpen(false); return; }
    let i = 0;
    for (const p of matches) {
      const r = document.createElement('button'); r.className = 'trow'; r.type = 'button';
      // NOT in the tab order: arrows and Enter already drive the list, and with
      // 30 real tab stops the blur timer below destroyed whichever row the user
      // had just tabbed onto — dropping focus on <body> on the way out.
      r.tabIndex = -1; r.id = uid + '-o' + (i++); r.setAttribute('role', 'option');
      r.setAttribute('aria-selected', 'false');
      const nm = document.createElement('span'); nm.className = 'trow-n';
      const ic = passiveIcon(p, 15);
      if (ic) nm.appendChild(ic);
      if (p.mt) nm.append(uiIcon('egg', 'mutation', 14));
      nm.append(p.n);
      const tier = document.createElement('span'); tier.className = 'tr-r';
      tier.textContent = (p.r > 0 ? '+'.repeat(Math.min(p.r, 4)) : p.r < 0 ? '−'.repeat(Math.min(-p.r, 4)) : '·') + (p.e ? '  ' + p.e : '') + (p.mt ? '  (mutation-only)' : '');
      r.append(nm, tier);
      r.addEventListener('mousedown', e => e.preventDefault());
      r.addEventListener('click', () => take(p));
      pop.appendChild(r); rows.push({el: r, p});
    }
    setOpen(true);
    highlight(0, false);
    fitPopup(mount, pop, pop, 260); // this popup is its own scroller — no chrome
  }
  inp.addEventListener('input', renderPop);
  inp.addEventListener('focus', renderPop);
  inp.addEventListener('click', () => { if (!mount.classList.contains('open')) renderPop(); });
  // focusout on the mount, not blur on the input: a blur handler closed the list
  // even when focus had moved INTO it, destroying what it landed on
  mount.addEventListener('focusout', () => setTimeout(() => {
    if (!mount.contains(document.activeElement)) setOpen(false);
  }, 0));
  inp.addEventListener('keydown', e => {
    const open = mount.classList.contains('open');
    if (e.key === 'ArrowDown') { e.preventDefault(); open ? highlight(hl + 1) : renderPop(); }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); highlight(hl - 1); }
    else if (e.key === 'Enter' && open && rows.length) { e.preventDefault(); take(rows[hl].p); }
    // Escape closes the list, not the dialog around it — stop it reaching the
    // document handler that would dismiss the whole roster editor
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  });
  // take() has always enforced the cap; set() never did, so a stored value or a
  // programmatic set could seat more passives than a pal has slots. One clamp
  // here covers all five instances.
  return { get: () => [...selected], set(v) { selected = [...v].slice(0, max); renderChips(); }, clear() { selected = []; inp.value = ''; renderChips(); } };
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

