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

// Guide jump links: hand the reader to the tab being described — and land them
// on it. navTab hides the button that was pressed, so a bare navTab() ends on
// <body>; all five of these did. The Breed footnote that jumps the other way
// (js/breed.js) already gets this right, so it was drift, not a missing rule.
const GUIDE_LANDING = {
  breed: '#pickA .picker-btn',
  reverse: '#pickT .picker-btn',
  dex: '#dexSearch',
  combos: '#comboSearch',
  skills: '#skillMode button.active',
};
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
  const n = b.dataset.nav;
  // Both Paldex links name a sub-pane, so both have to select it. "dex" used to
  // only call navTab, so after following "Browse all unique combos" it landed on
  // the Paldex still showing combos — with #dexSearch hidden, so nowhere at all.
  if (n === 'combos') { navTab('dex'); setDexMode('combos'); }
  else if (n === 'dex') { navTab('dex'); setDexMode('pals'); }
  else navTab(n);
  landAfterNav(GUIDE_LANDING[n] || '#tabs button.active');
}));
// in-guide anchors: open the referenced <details> section and scroll to it —
// then move focus onto the summary. Left on the button, focus sat above the
// scrolled viewport at 0px visible (2.4.11), which is exactly what the same
// jump in js/breed.js avoids by focusing the summary it just opened.
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
  const d = document.getElementById(b.dataset.open);
  if (!d) return;
  d.open = true;
  d.scrollIntoView({block: 'start', behavior: SMOOTH});
  const s = d.querySelector('summary');
  if (s) s.focus({preventScroll: true});
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
  if (currentTab === 'reverse') {
    // No target yet: narrowing pairs is useless, so open the target picker.
    // With one set, "/" means the only narrowing control this view still has.
    e.preventDefault();
    (pickT.get() ? pickL : pickT).openPop(true);
    return;
  }
  let target = {dex: '#dexSearch', hatch: '#hatchSearch', roster: '#rosterSearch', reverse: null, map: '#mapSearch'}[currentTab];
  if (currentTab === 'dex' && document.getElementById('dexPalsBlock').hidden) target = '#comboSearch';
  // the base-aura section is a read-only list — it has no search box to reach
  if (currentTab === 'skills') target = {partner: '#psSearch', passives: '#pvSearch'}[skillMode];
  const inp = target && document.querySelector(target);
  if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
});
// PWA: offline capability + installability (http(s) only — no-op when opened as a local file)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
