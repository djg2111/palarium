// ---------- state ----------
const state = readStore('palbreed', {});
function save() {
  const s = {
    tab: currentTab, a: pickA.get()?.k, b: pickB.get()?.k, t: pickT.get()?.k, l: pickL.get()?.k,
    ownedOnly, dshow: typeof dexShow !== 'undefined' ? dexShow : 'all',
    dv: typeof dexView !== 'undefined' ? dexView : 'gallery',
    rdense: typeof denseRows !== 'undefined' && denseRows,
    rv: typeof rosterView !== 'undefined' ? rosterView : 'tiles',
    pt: pickPT.get()?.k, po: partnerMode, ml: myLevel, ac: avoidCollab, sp: slotPassives, sg: slotGenders,
    // dpc, because an empty dp is ambiguous on its own: before a choice it means
    // "carry everything that fits", after one it means "carry nothing"
    dp: desiredPick.get(), dpc: typeof carryChosen !== 'undefined' && carryChosen,
    ro: !!currentRoute, chain: breedChain,
    hn: typeof hatchNewOnly !== 'undefined' && hatchNewOnly,
    hd: typeof hatchDepth !== 'undefined' ? hatchDepth : 1,
    pm: typeof planMode !== 'undefined' ? planMode : 'new',
    dt: dexType.value, dw: dexWork.value, dsort: dexSort,
    ck: typeof comboKind !== 'undefined' ? comboKind : '',
    sm: typeof skillMode !== 'undefined' ? skillMode : 'auras',
  };
  for (const n of SLOTS) s['s' + n] = pickS[n].get()?.k;
  localStorage.setItem('palbreed', JSON.stringify(s));
  updateHash();
}

// ---------- tabs ----------
let currentTab = 'breed';
const tabsEl = document.getElementById('tabs');
function showTab(v) {
  // A selection you cannot see is a trap, and the bulk bar is viewport-fixed so
  // it would otherwise follow you onto another tab.
  if (v !== 'roster' && typeof selecting !== 'undefined' && selecting) exitSelect(false);
  if (v === 'roster') setTimeout(placeRosterPanel, 0);   // tracks resolve once .active lands
  currentTab = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  tabsEl.querySelectorAll('button').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    // Scroll the strip, never ask the button to scroll itself: in Chrome
    // scrollIntoView SETS THE SEQUENTIAL FOCUS NAVIGATION STARTING POINT, so
    // running it at boot meant the first Tab of the session started after the
    // tab strip — the skip link was never offered at any width where .tabs is
    // rendered, and the strip itself could only be reached backwards. At 900
    // and 1280 the call was a pure no-op scroll (scrollWidth == clientWidth)
    // that cost the affordance for nothing; the strip only overflows at
    // roughly 641-830px.
    if (on && tabsEl.scrollWidth > tabsEl.clientWidth) {
      const r = b.getBoundingClientRect(), c = tabsEl.getBoundingClientRect();
      if (r.left < c.left) tabsEl.scrollLeft += r.left - c.left;
      else if (r.right > c.right) tabsEl.scrollLeft += r.right - c.right;
    }
  });
  syncBottomNav(v);
  closeMoreSheet();
  if (v === 'hatch') renderHatch();
  if (v === 'map') mapActivate();
  // owned stars and roster passives change under both indexes — redraw on entry
  if (v === 'skills') setSkillMode(skillMode, true);
  save();
}
// in-app jumps push a history entry so Back returns to where you came from
function navTab(v) {
  if (currentTab !== v) history.pushState(null, '', '#/' + v);
  showTab(v);
}
// roving arrow-key navigation for role=tablist containers
// One tab stop for a strip of buttons: arrows/Home/End move inside it, Tab
// leaves. Used by roster row toolbars and Find parents' partner strips, so a
// row costs two stops (its identity and its actions) however many buttons it
// holds — the convention DESIGN.md §4 settles for rows and tiles.
function rovingRow(container) {
  const all = () => [...container.children].filter(b => b.tagName === 'BUTTON');
  // The single tab stop must be a button that can actually take focus. Assigned
  // by index, it landed on a `disabled` chip whenever the first one happened to
  // be disabled — every other button sat at -1, so the row had ZERO keyboard
  // stops and could not be reached or left by Tab at all (2.1.1).
  const live = () => all().filter(b => !b.disabled);
  const stop = live()[0] || all()[0];
  all().forEach(b => { b.tabIndex = b === stop ? 0 : -1; });
  // Called again on every re-render by #carryFrom, #rosterStrip and Find
  // parents' chip rows, so bind once and read the buttons live — capturing the
  // array at call time stacked a dead listener per render and left the handler
  // looking at buttons that are no longer in the DOM.
  if (container.dataset.roving) return container;
  container.dataset.roving = '1';
  container.addEventListener('keydown', e => {
    const btns = live();
    const i = btns.indexOf(e.target);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % btns.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + btns.length) % btns.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = btns.length - 1;
    if (j === null) return;
    e.preventDefault();
    // clear every button, not just btns[i]: a re-render between presses moves the
    // stop to the first chip, so clearing only the focused one left two at 0 and
    // the row cost two tab stops with no visible reason
    all().forEach(b => { b.tabIndex = b === btns[j] ? 0 : -1; });
    btns[j].focus();
  });
  return container;
}
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
const MORE_TABS = ['hatch', 'roster', 'dex', 'skills', 'map', 'guide'];
// Closing hides the button that was pressed, so the sheet has to hand focus
// back — every route out of it (Escape, picking a view, clicking away with the
// keyboard inside) left the phone layout's primary navigation on <body>.
// Only when it actually held the focus: a pointer user who taps elsewhere has
// put focus where they want it.
function closeMoreSheet() {
  if (!moreSheetEl.classList.contains('open')) return;
  const held = moreSheetEl.contains(document.activeElement);
  moreSheetEl.classList.remove('open');
  moreBtnEl.setAttribute('aria-expanded', 'false');
  syncSheetHeight();
  // the sheet no longer claims the current page; its own entry still does
  if (MORE_TABS.includes(currentTab)) moreBtnEl.setAttribute('aria-current', 'page');
  if (held) moreBtnEl.focus();
}
// A toast is 331px wide and centred; the sheet is 190px hard against the right
// edge. They overlapped, and .toasts is z-index 300 to the sheet's 95 — so the
// toast won the hit test over the bottom three entries and left 5.4px of
// tappable width for "Map" at 360 (2.5.8 wants 24). Tapping its centre closed
// the sheet and navigated nowhere. The sheet is a layer the user opened;
// passive feedback gets out of its way.
function syncSheetHeight() {
  const h = moreSheetEl.classList.contains('open') ? Math.round(moreSheetEl.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--sheet-h', h + 'px');
}
function syncBottomNav(v) {
  bottomNavEl.querySelectorAll('button[data-v]').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  // Six of the nine views live behind More, and on those the bar said nothing:
  // the accent colour marked the button and no control carried aria-current, so
  // the only "where am I" in the phone layout was a hue. More stands in for the
  // view it is hiding, and names it — the sheet that holds the real button is
  // display:none, so it cannot.
  const inSheet = MORE_TABS.includes(v);
  moreBtnEl.classList.toggle('active', inSheet);
  let here = null;
  moreSheetEl.querySelectorAll('button[data-v]').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    if (on) { b.setAttribute('aria-current', 'page'); here = b.textContent.trim(); }
    else b.removeAttribute('aria-current');
  });
  if (inSheet) {
    moreBtnEl.setAttribute('aria-current', 'page');
    // starts with the visible word, so the visible label is still in the name (2.5.3)
    if (here) moreBtnEl.setAttribute('aria-label', 'More — ' + here);
  } else {
    moreBtnEl.removeAttribute('aria-current');
    moreBtnEl.removeAttribute('aria-label');
  }
}
moreBtnEl.addEventListener('click', e => {
  e.stopPropagation(); // keep the document-level close handler from undoing the toggle
  const open = !moreSheetEl.classList.contains('open');
  moreSheetEl.classList.toggle('open', open);
  moreBtnEl.setAttribute('aria-expanded', String(open));
  // Two controls claiming "current page" in one navigation context reads as a
  // stutter; while the sheet is open the real button is on screen and says it.
  if (open) moreBtnEl.removeAttribute('aria-current');
  else if (MORE_TABS.includes(currentTab)) moreBtnEl.setAttribute('aria-current', 'page');
  syncSheetHeight();
});
bottomNavEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (b) navTab(b.dataset.v);
});
moreSheetEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (b) navTab(b.dataset.v); // showTab closes the sheet
});
// The hash is the router, so the skip link's own href was a route: pressing it
// set location.hash = '#main', which applyHash could not parse — it answered
// the app's own accessibility affordance with a "Link not recognized" toast and
// left the URL somewhere a reload could not restore. Keep the href for the
// no-JS case; in-app, just move the focus. #main carries tabindex="-1" so it
// can actually receive it — without that the browser only moves the sequential
// starting point and activeElement stays <body>.
document.querySelector('.skip').addEventListener('click', e => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  // tabindex on demand, removed on blur. Left on the element it made <main> the
  // nearest focusable ancestor of every paragraph in the app, so an ordinary
  // click on body text focused it — and the next Tab jumped to the first
  // control of the view, scrolling 1800px back to the top of the Guide.
  const m = document.getElementById('main');
  m.setAttribute('tabindex', '-1');
  m.addEventListener('blur', () => m.removeAttribute('tabindex'), {once: true});
  m.focus();
  scrollTo({top: 0, behavior: SMOOTH});
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
// closeMoreSheet is a no-op when the sheet is shut, so this stays out of the
// way of the other layers' Escape handlers (§8 — topmost layer only)
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
  } else if (currentTab === 'skills') {
    h += '/' + skillMode;
    if (skillMode === 'partner' && psTagSel.value) h += '/' + tagSlug(psTagSel.value);
    else if (skillMode === 'passives' && pvCatSel.value) h += '/' + pvCatSel.value;
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
  if (tab === 'skills') {
    // #/skills/<section>[/<effect tag | passive category>] — validate the whole
    // ref before touching any control, so a bad link leaves the view alone
    const mode = x || 'auras';
    if (!['auras', 'partner', 'passives'].includes(mode)) return badLink('Link not recognized — no “' + x + '” section in Skills');
    let tag = null, cat = null;
    if (y) {
      if (mode === 'partner') {
        tag = TAG_BY_SLUG.get(y.toLowerCase());
        if (!tag) return badLink('Link not recognized — unknown partner-skill effect “' + y + '”');
      } else if (mode === 'passives') {
        cat = PV_CATS.some(c => c[0] === y) ? y : null;
        if (!cat) return badLink('Link not recognized — unknown passive category “' + y + '”');
      } else return badLink('Link not recognized');
    }
    if (mode === 'partner') {
      psTagSel.value = tag || ''; psTagIsel.sync();
      setPsFamily('', true); psShown = 60;
    }
    if (mode === 'passives') { pvCatSel.value = cat || ''; pvCatIsel.sync(); }
    setSkillMode(mode, true);
    showTab('skills');
    return true;
  }
  if (tab === 'breed') {
    // A slot the link doesn't name is empty, not "leave whatever is there".
    // updateHash writes '-' for an empty slot, so Back out of a two-parent
    // state has to clear one; and #/breed with no keys is the empty state,
    // which was otherwise reachable only from a cold start.
    const pa = resolvePal(x), pb = resolvePal(y);
    // Clearing a slot is right, but doing it silently for a key that simply
    // didn't resolve is not — updateHash then rewrites the URL and the typo is
    // gone. Say so, the way #/pal and #/skills do.
    if (x && x !== '-' && !pa) badLink('Link not recognized — unknown pal “' + x + '”');
    else if (y && y !== '-' && !pb) badLink('Link not recognized — unknown pal “' + y + '”');
    pickA.set(pa || null, true);
    pickB.set(pb || null, true);
    renderBreed();
  } else if (tab === 'reverse' && resolvePal(x)) {
    pickT.set(resolvePal(x), true); reverseShown = {}; renderReverse();
  }
  showTab(tab);
  return true;
}
// hashchange and popstate BOTH fire for one back/forward navigation, and each
// ran the whole dispatch — so every view's polite live region was rebuilt with
// identical text about 2ms apart, which is exactly the condition under which a
// screen reader reads it twice. Collapse the pair into one dispatch.
// A timer rather than a "same hash as last time" guard: updateHash rewrites the
// hash between the two events, so the second one no longer looks like a repeat.
let navQueued = false;
function navApply() {
  if (navQueued) return;
  navQueued = true;
  setTimeout(() => { navQueued = false; applyHash(); }, 0);
}
window.addEventListener('hashchange', navApply);
tabsEl.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) navTab(b.dataset.v); // back/forward navigates tabs
});
window.addEventListener('popstate', navApply);

