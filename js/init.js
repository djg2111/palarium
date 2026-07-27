// ---------- init ----------
if (state.a && byKey.get(state.a)) pickA.set(byKey.get(state.a), true);
if (state.b && byKey.get(state.b)) pickB.set(byKey.get(state.b), true);
if (state.t && byKey.get(state.t)) pickT.set(byKey.get(state.t), true);
if (state.l && byKey.get(state.l)) pickL.set(byKey.get(state.l), true);
if (state.ownedOnly) { ownedOnly = true; setSwitch(ownedToggle, true); }
// dexOwnedOnly was a boolean; Show is a three-way. Read the old key for one
// release so a persisted "owned only" survives the change.
dexShow = state.dshow || (state.dexOwnedOnly ? 'owned' : 'all');
if (state.dv === 'table' || state.dv === 'gallery') dexView = state.dv;
if (state.rdense) { denseRows = true; setSwitch(denseToggle, true); rosterList.classList.add('dense'); }
if (state.rv === 'rows' || state.rv === 'tiles') rosterView = state.rv;
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
// `po` used to be a boolean, where true meant "only use my pals". Read both
// shapes: an old true lands on 'mine', an old false (or anything unrecognised)
// on 'any' — the two states that existed before, unchanged either way.
setPartnerMode(state.po === true || state.po === 'mine' ? 'mine'
  : state.po === 'wild' ? 'wild' : 'any', true);
if (state.ml >= 1 && state.ml <= 99) { myLevel = Math.floor(state.ml); myLevelEl.value = String(myLevel); }
if (state.ac) { avoidCollab = true; setSwitch(collabToggle, true); }
if (state.hn) { hatchNewOnly = true; setSwitch(hatchNewBtn, true); }
if (state.hd === 0 || state.hd === 2) setHatchDepth(state.hd, true);
if (state.dt) { dexType.value = state.dt; dexTypeSel.sync(); }
if (state.dw) { dexWork.value = state.dw; dexWorkSel.sync(); }
if (state.dsort && state.dsort.key && state.dsort.key !== 'own') dexSort = state.dsort;
// always run it, not just for a restored value — it also writes the visible
// line describing whichever recipe type is selected
setComboKind(state.ck === 'mix' || state.ck === 'self' ? state.ck : '', true);
if (state.sm === 'partner' || state.sm === 'passives') setSkillMode(state.sm, true);
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
