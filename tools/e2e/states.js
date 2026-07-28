/* The whole-app state matrix: axe (WCAG 2.1 A+AA), horizontal overflow and
 * focus sanity for every state the app can be in — cold start first, then a
 * lived-in roster. The save reader's own eight states live in a11y.js; this
 * file covers everything else, so together they are the standing commitment:
 * axe clean in every state.
 *
 * Every state is reached through the app's public contracts — deep links
 * (#/breed/A/B, #/pal/K, #/plan/A+B/T, #/map/<id>) and the fixed ids in
 * index.html — never generated markup internals, so a view's insides can be
 * redesigned without touching this file. When a redesign DOES rename a
 * control this file drives, a state becomes unreachable and that is a
 * FAILURE, not a skip: rename it here in the same commit, the same contract
 * as index.html + the sw.js SHELL array.
 *
 *   node tools/e2e/states.js          (needs python -m http.server 8848)
 */
const {open, problems} = require('./lib');
const {makeChecks} = require('./audit');
const {audit, overflow, focusSane, focusVisible, fail, failed} = makeChecks();

// A state we can't reach is a broken contract, not a skipped test.
async function reach(page, action, what) {
  try { await action(); return true; }
  catch (e) {
    fail();
    console.log(`  ✗ UNREACHABLE — ${what}: ${String(e).split('\n')[0]}`);
    console.log('    (a redesign likely renamed a control this suite drives — update states.js in the same commit)');
    return false;
  }
}

const nav = async (page, hash, ms = 350) => {
  await page.evaluate(h => location.hash = h, hash);
  await page.waitForTimeout(ms);
};

// Lived-in seed: three ♂ SheepBall put the same-species gender chip on the
// board; passives feed the planner's odds; Anubis ♀ gives Breed a real pair.
const ROSTER = [
  {id: 'e1', k: 'SheepBall', ps: ['Musclehead'], g: 'M', nick: 'Woolly', note: 'breeding stock', iv: null},
  {id: 'e2', k: 'SheepBall', ps: [], g: 'M', nick: '', note: '', iv: null},
  {id: 'e3', k: 'SheepBall', ps: ['Artisan'], g: 'M', nick: '', note: '', iv: null},
  {id: 'e4', k: 'ElecCat', ps: ['Musclehead', 'Artisan'], g: 'F', nick: '', note: '', iv: null},
  {id: 'e5', k: 'Anubis', ps: [], g: 'F', nick: 'Ana', note: '', iv: null},
];
const OWNED = ['SheepBall', 'ElecCat', 'PinkCat', 'Anubis'];
const TABS = ['breed', 'reverse', 'plan', 'hatch', 'roster', 'dex', 'skills', 'map', 'guide'];

(async () => {
  const h = await open();
  const {page} = h;

  console.log('\nCOLD START — every tab, empty states, first-visit tip bar');
  await page.evaluate(() => localStorage.clear());
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(500);
  for (const t of TABS) {
    await nav(page, '#/' + t, t === 'map' ? 1200 : 350);
    await audit(page, `cold ${t}`);
    await overflow(page, `cold ${t}`);
  }

  console.log('\nLIVED-IN — seeding a roster and reloading');
  await page.evaluate(([roster, owned]) => {
    localStorage.clear();
    localStorage.setItem('palbreed_roster', JSON.stringify(roster));
    localStorage.setItem('palbreed_owned', JSON.stringify(owned));
    localStorage.setItem('palbreed_tipseen', '1');
  }, [ROSTER, OWNED]);
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(500);

  console.log('\nBREED — result, gender-dependent result, open picker');
  await nav(page, '#/breed/SheepBall/ElecCat');
  await audit(page, 'breed with a result');
  await overflow(page, 'breed with a result');
  await nav(page, '#/breed/Katress/Wixen');
  await audit(page, 'breed with a gender-dependent result (two cards)');
  await overflow(page, 'gender-dependent result');
  if (await reach(page, async () => {
    await page.click('#pickA .picker-btn');
    await page.waitForSelector('#pickA .picker.open .pop', {timeout: 3000});
  }, 'the pal picker popover')) {
    await audit(page, 'picker popover open');
    await focusSane(page, 'opening the picker keeps focus');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await focusSane(page, 'Escape hands focus back to the picker button');
  }

  // the chain card is a Breed state reachable only through the Planner
  console.log('\nBREED CHAIN — arriving from the Planner, and stepping');
  await nav(page, '#/plan/SheepBall+ElecCat/Anubis', 900);
  if (await reach(page, async () => {
    await page.click('#view-plan .stepopen');
    await page.waitForSelector('.chaincard', {timeout: 3000});
  }, 'the breeding chain card')) {
    await audit(page, 'breed chain, step 1');
    await overflow(page, 'breed chain');
    await focusSane(page, 'arriving from the Planner lands on the chain card');
    await page.click('.chaincard .nav button[data-d="1"]');
    await page.waitForTimeout(350);
    await audit(page, 'breed chain, after Next step');
    await focusSane(page, 'stepping keeps focus on the nav');
    const said = await page.evaluate(() => document.getElementById('breedStatus').textContent);
    if (/^Step [0-9]+ of [0-9]+: /.test(said)) console.log('  ✓ the status sentence names the step: ' + JSON.stringify(said.slice(0, 40)));
    else { console.log('  ✗ the status sentence lost its step prefix: ' + JSON.stringify(said)); fail(); }
  }

  console.log('\nPAL MODAL');
  await nav(page, '#/pal/Anubis', 500);
  if (await reach(page, () => page.waitForSelector('#overlay.open', {timeout: 3000}), 'the pal modal')) {
    await audit(page, 'pal modal open');
    await overflow(page, 'pal modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  console.log('\nFIND PARENTS — target set, owned-only toggle');
  await nav(page, '#/reverse/Anubis', 500);
  await audit(page, 'find parents with a target');
  await overflow(page, 'find parents with a target');
  if (await reach(page, () => page.click('#ownedToggle'), 'the owned-only switch')) {
    await page.waitForTimeout(300);
    await audit(page, 'find parents, pairs I can make');
    await page.click('#ownedToggle');
    await page.waitForTimeout(200);
  }

  console.log('\nROSTER — tiles, open species panel, rows, editor, validation error');
  await nav(page, '#/roster', 500);
  await audit(page, 'roster tiles (with the all-male gender chip)');
  await overflow(page, 'roster tiles');
  // A tile and its species band carry the same facts, so they must announce them
  // in the same order — and the species has to lead, because that is what you
  // scan a board of tiles for. The count badge is painted over the art, which
  // precedes the name in DOM order, so the tile used to open with a number.
  {
    const order = await page.evaluate(() => {
      const t = document.querySelector('.rostile');
      const name = t.querySelector('.tname').textContent.trim();
      // the accessible name, in announcement order
      const parts = [];
      const walk = el => { for (const c of el.children) {
        if (c.getAttribute('aria-hidden') === 'true') continue;
        const l = c.getAttribute('aria-label');
        if (l) { parts.push(l); continue; }
        if (!c.children.length) { const x = c.textContent.trim(); if (x) parts.push(x); continue; }
        walk(c); } };
      walk(t);
      return {name, parts};
    });
    if (order.parts[0] === order.name) console.log(`  ✓ a species tile leads with its name (${JSON.stringify(order.parts.slice(0, 2))})`);
    else { console.log(`  ✗ a species tile announces ${JSON.stringify(order.parts[0])} before its name ${JSON.stringify(order.name)}`); fail(); }
  }
  if (await reach(page, () => page.click('#rosterList .rostile'), 'a species tile')) {
    await page.waitForTimeout(400);
    await audit(page, 'roster tiles with a species panel open');
    await overflow(page, 'roster with a panel open');
  }
  if (await reach(page, () => page.click('#rosterView button[data-v="rows"]'), 'the rows view switch')) {
    await page.waitForTimeout(400);
    await audit(page, 'roster rows');
    await overflow(page, 'roster rows');
    await page.click('#rosterView button[data-v="tiles"]');
    await page.waitForTimeout(300);
  }
  if (await reach(page, async () => {
    await page.click('#rosterOpenAdd');
    await page.waitForSelector('#roverlay.open', {timeout: 3000});
  }, 'the roster editor')) {
    await audit(page, 'roster editor open');
    await page.click('#rosterAdd'); // no species picked → the inline error shows
    await page.waitForTimeout(200);
    const errShown = await page.$eval('#rosterErr', e => !e.hidden);
    if (!errShown) { fail(); console.log('  ✗ submitting without a species did not show the inline error'); }
    // the message must also be attached to the control it is about, and focus
    // must land there — a live region announced once is not a field you can find
    const wired = await page.evaluate(() => {
      const b = document.querySelector('#pickR .picker-btn');
      return {invalid: b.getAttribute('aria-invalid'), desc: b.getAttribute('aria-describedby'),
        focused: document.activeElement === b};
    });
    if (wired.invalid === 'true' && wired.desc === 'rosterErr' && wired.focused)
      console.log('  ✓ the invalid species field is marked, described and focused');
    else { console.log(`  ✗ the validation error is not wired to its field: ${JSON.stringify(wired)}`); fail(); }
    await audit(page, 'roster editor with the validation error');
    await page.click('#rosterCancel');
    await page.waitForTimeout(250);
    await focusSane(page, 'closing the editor restores focus');
  }

  // selection mode: empty, partial, everything, and a selection the filter hides
  if (await reach(page, async () => {
    await page.evaluate(() => { location.hash = '#/roster'; });
    await page.waitForTimeout(300);
    await page.click('#rosterSelect');
    await page.waitForSelector('.rosselall', {timeout: 3000});
  }, 'roster selection mode')) {
    await audit(page, 'roster selecting, nothing picked');
    await overflow(page, 'roster selecting');
    await focusSane(page, 'entering selection mode lands on the check-all');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.rosrow .rchk')]; if (b[0]) b[0].click(); });
    await page.waitForTimeout(200);
    await audit(page, 'roster selecting, one picked');
    await page.evaluate(() => { const a = document.querySelector('.rosselall .rchk'); a.checked = true; a.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(200);
    await audit(page, 'roster selecting, all picked');
    await page.evaluate(() => { rosterSearch.value = 'zzzz'; renderRoster(); });
    await page.waitForTimeout(250);
    const said = await page.evaluate(() => document.getElementById('bulkCount').textContent);
    if (/none shown|not shown/.test(said)) console.log('  ✓ the bar states the hidden selection: ' + JSON.stringify(said));
    else { console.log('  ✗ the bar hid a selection silently: ' + JSON.stringify(said)); fail(); }
    await audit(page, 'roster selecting, filter hides the selection');
    await page.evaluate(() => { rosterSearch.value = ''; renderRoster(); document.getElementById('bulkDone').click(); });
    await page.waitForTimeout(300);
    await focusSane(page, 'leaving selection mode returns focus');
  }

  console.log('\nPLANNER — computed route, odds explanation, saved plan with tree');
  await nav(page, '#/plan/SheepBall+ElecCat/Anubis', 900);
  await audit(page, 'planner with a computed route');
  await overflow(page, 'planner with a computed route');
  // A slot passive gives the route something to carry, which puts the odds
  // buttons on the steps — the tag input takes a passive on Enter. (The deep
  // link clears slot passives, so type one in rather than seeding it.)
  if (await reach(page, async () => {
    await page.click('#passS1 .taginp');
    await page.type('#passS1 .taginp', 'Muscle');
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#routeOut button.odds:not(.wild)', {timeout: 5000});
  }, 'the odds button (via a slot passive)')) {
    await page.waitForTimeout(300);
    await audit(page, 'route tracking a desired passive');
    await page.click('#routeOut button.odds:not(.wild)');
    await page.waitForTimeout(250);
    await audit(page, 'odds explanation expanded');
  }
  if (await reach(page, async () => {
    await page.click('#routeOut button:has-text("Save plan")');
    await page.waitForSelector('#planMode:not([hidden])', {timeout: 3000});
    await page.click('#planMode button[data-m="saved"]');
    await page.waitForSelector('#plansList .stepopen', {timeout: 3000});
  }, 'a saved plan')) {
    await page.waitForTimeout(300);
    await audit(page, 'saved plans list');
    await page.click('#plansList .stepopen');
    await page.waitForTimeout(400);
    await audit(page, 'saved plan with the tree open');
    await overflow(page, 'saved plan with the tree open');
  }

  console.log('\nPLANNER — the four-passive cap');
  // A pal has four passive slots, so a route carries at most four. The >4 state
  // is unreachable by deep link (applyHash clears slotPassives), so type them in.
  await nav(page, '#/plan/SheepBall+ElecCat/Anubis', 900);
  // the block above saved a plan, left the view on the saved sub-tab (which
  // hides #planNewBlock and every control this block drives) and left a passive
  // in slot 1 — this block counts passives, so it starts from a known set
  const resetCarry = async () => {
    await page.evaluate(() => {
      if (planMode !== 'new') setPlanMode('new');
      for (const n of SLOTS) { slotPassives[n] = []; slotGenders[n] = null; }
      carryChosen = false; desiredPick.clear();
      renderSlotChips(); computeRoute();
    });
    await page.waitForTimeout(600);
  };
  await resetCarry();
  const typePass = async (sel, names) => {
    for (const n of names) {
      await page.click(sel + ' .taginp');
      await page.type(sel + ' .taginp', n);
      await page.waitForTimeout(200);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
    }
  };
  // The default state, and the one that shipped a lie: with the union inside the
  // cap the chips must say they are pressed, because that IS what the route
  // carries — and pressing one must remove only that one.
  if (await reach(page, async () => {
    await typePass('#passS1', ['Swift', 'Runner', 'Nimble']);
    await page.waitForTimeout(1200);
    await page.waitForSelector('#carryFrom .pset', {timeout: 3000});
  }, 'three starter passives inside the cap')) {
    const def = await page.evaluate(() => ({
      pressed: document.querySelectorAll('#carryFrom .pset[aria-pressed="true"]').length,
      chips: document.querySelectorAll('#carryFrom .pset').length,
      status: document.getElementById('planStatus').textContent,
      dupChips: [...document.querySelectorAll('#carryPass .pchip')].filter(c => c.getBoundingClientRect().height > 0).length,
    }));
    if (def.pressed === def.chips && def.chips === 3 && /carrying Swift, Runner, Nimble/.test(def.status))
      console.log('  ✓ inside the cap every chip states it is carried, and the status agrees');
    else { console.log(`  ✗ the chips disagree with the route: ${JSON.stringify(def)}`); fail(); }
    if (!def.dupChips) console.log('  ✓ each carried passive renders once, in the toolbar only');
    else { console.log(`  ✗ ${def.dupChips} duplicate passive chips below the toolbar`); fail(); }
    await page.click('#carryFrom .pset[data-p="Swift"]');
    await page.waitForTimeout(1400);
    const one = await page.evaluate(() => document.getElementById('planStatus').textContent);
    if (/carrying Runner, Nimble\.$/.test(one) && !/Swift/.test(one)) console.log('  ✓ un-pressing a chip removes only that one');
    else { console.log(`  ✗ un-pressing Swift changed more than Swift: ${JSON.stringify(one)}`); fail(); }
    // un-pressing the rest must mean "carry nothing", not "re-carry everything"
    await page.click('#carryFrom .pset[data-p="Runner"]');
    await page.waitForTimeout(400);
    await page.click('#carryFrom .pset[data-p="Nimble"]');
    await page.waitForTimeout(1400);
    const none = await page.evaluate(() => ({
      status: document.getElementById('planStatus').textContent,
      pressed: document.querySelectorAll('#carryFrom .pset[aria-pressed="true"]').length,
    }));
    if (!/carrying/.test(none.status) && none.pressed === 0) console.log('  ✓ un-pressing the last chip carries nothing, not everything');
    else { console.log(`  ✗ carrying nothing did not stick: ${JSON.stringify(none)}`); fail(); }
    await audit(page, 'planner carrying nothing');
  }
  await resetCarry();
  if (await reach(page, async () => {
    await typePass('#passS1', ['Swift', 'Runner', 'Nimble', 'Lucky']);
    await typePass('#passS2', ['Artisan', 'Serious', 'Brave', 'Legend']);
    await page.waitForTimeout(1200);
    await page.waitForSelector('#carryFrom .pset', {timeout: 3000});
  }, 'eight distinct starter passives')) {
    const over = await page.evaluate(() => ({
      status: document.getElementById('planStatus').textContent,
      chips: document.querySelectorAll('#routeOut .rsummary .pchip').length,
      carrier: document.querySelectorAll('#routeOut .carrier').length,
      odds: document.querySelectorAll('#routeOut button.odds:not(.wild)').length,
      steps: document.querySelectorAll('#routeOut .rstep').length,
      psets: document.querySelectorAll('#carryFrom .pset').length,
      jump: !!document.querySelector('#routeOut .rsummary .alink'),
    }));
    // it must not claim a pal the game cannot produce...
    if (/carrying/.test(over.status)) { console.log('  ✗ over the cap the status still claims a carry set: ' + JSON.stringify(over.status)); fail(); }
    else if (!/pick up to 4 to carry/.test(over.status)) { console.log('  ✗ over the cap the status does not state the choice: ' + JSON.stringify(over.status)); fail(); }
    else console.log('  ✓ over the cap the status states the choice, claims no carry set');
    if (over.chips || over.carrier || over.odds) { console.log(`  ✗ over the cap the route still prices a set: ${over.chips} chips, ${over.carrier} carrier tags, ${over.odds} odds`); fail(); }
    else console.log('  ✓ over the cap: no chips, no carrier tags, no odds');
    // ...but the route itself is correct and must still render in full
    if (over.steps > 0 && over.psets === 8 && over.jump) console.log(`  ✓ the route still renders in full (${over.steps} steps) with 8 carry chips and a jump link`);
    else { console.log(`  ✗ the route was withheld: ${JSON.stringify(over)}`); fail(); }
    await audit(page, 'planner over the passive cap');
    await overflow(page, 'planner over the passive cap');

    await page.click('#routeOut .rsummary .alink');
    await page.waitForTimeout(700);
    await focusVisible(page, 'the jump link lands on a carry chip, on screen');

    // toggling a chip must not scroll the page out from under the user (2.4.11)
    const y0 = await page.evaluate(() => Math.round(scrollY));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1400);
    const y1 = await page.evaluate(() => Math.round(scrollY));
    if (Math.abs(y1 - y0) > 8) { console.log(`  ✗ the recompute scrolled the page under the focused chip: ${y0} -> ${y1}`); fail(); }
    else console.log('  ✓ toggling a carry chip leaves the page where it was');
    await focusVisible(page, 'the toggled chip keeps focus, on screen');

    // fill to the cap, then the rest must be refused preventively
    await page.evaluate(() => {
      const want = ['Runner', 'Artisan', 'Serious'];
      for (const n of want) {
        const b = [...document.querySelectorAll('#carryFrom .pset')].find(x => x.textContent.trim() === n && x.getAttribute('aria-pressed') === 'false');
        if (b) b.click();
      }
    });
    await page.waitForTimeout(1500);
    const at4 = await page.evaluate(() => ({
      status: document.getElementById('planStatus').textContent,
      pressed: document.querySelectorAll('#carryFrom .pset[aria-pressed="true"]').length,
      disabled: document.querySelectorAll('#carryFrom .pset[aria-disabled="true"]').length,
      // the row's one roving tab stop must be a button that can take focus —
      // assigned by index it could land on a refused chip and strand the toolbar
      reachable: [...document.querySelectorAll('#carryFrom .pset')].filter(b => b.tabIndex >= 0 && !b.disabled).length,
      odds: document.querySelectorAll('#routeOut button.odds:not(.wild)').length,
      steps: document.querySelectorAll('#routeOut .rstep').length,
      named: (document.getElementById('planStatus').textContent.match(/carrying (.+)\.$/) || [0, ''])[1].split(', ').filter(Boolean).length,
    }));
    if (at4.pressed === 4 && at4.disabled === 4) console.log('  ✓ at four carried, the remaining chips are refused preventively');
    else { console.log(`  ✗ the cap is not enforced: ${at4.pressed} pressed, ${at4.disabled} refused`); fail(); }
    if (at4.reachable === 1) console.log('  ✓ the carry row still has exactly one reachable tab stop at the cap');
    else { console.log(`  ✗ the carry row has ${at4.reachable} reachable tab stops at the cap — it must have exactly 1`); fail(); }
    if (at4.named > 0 && at4.named <= 4) console.log(`  ✓ the status names ${at4.named} passives, never more than four`);
    else { console.log(`  ✗ the status names ${at4.named}: ${JSON.stringify(at4.status)}`); fail(); }
    if (at4.odds === at4.steps) console.log('  ✓ every step is priced again once a set is chosen');
    else { console.log(`  ✗ ${at4.odds} odds for ${at4.steps} steps`); fail(); }
    await audit(page, 'planner with four passives carried');
    // a passive nothing on the route carries must not be announced as carried
    if (/Legend/.test(at4.status)) { console.log('  ✗ the status names a passive the route does not carry'); fail(); }
  }

  console.log('\nBREEDABLE NOW — results, expanded pairs');
  await nav(page, '#/hatch', 600);
  await audit(page, 'breedable now with results');
  if (await reach(page, () => page.click('#hatchList .hcard'), 'a breedable result card')) {
    await page.waitForTimeout(400);
    await audit(page, 'breedable now with pairs expanded');
    await overflow(page, 'breedable now with pairs expanded');
    await focusVisible(page, 'expanding a card keeps focus on it, on screen');
    // the panel spans the grid, so it must sit on a row of its own — appended
    // straight after its own card it left up to cols-1 empty cells beside it
    const gap = await page.evaluate(() => {
      const list = document.getElementById('hatchList');
      const pn = list.querySelector('.hatchpanel');
      if (!pn) return 'no panel';
      const cards = [...list.querySelectorAll('.hcard')];
      const rows = {};
      for (const c of cards) { const t = Math.round(c.getBoundingClientRect().top); rows[t] = (rows[t] || 0) + 1; }
      const counts = Object.keys(rows).sort((a, b) => a - b).map(k => rows[k]);
      const full = Math.max(...counts);
      // every row but the last must be full
      return counts.slice(0, -1).every(n => n === full) ? null : counts.join(',');
    });
    if (gap) { console.log(`  ✗ the open panel left a hole in the board: rows ${gap}`); fail(); }
    else console.log('  ✓ the open panel sits on its own row, board resumes underneath');
  }
  // "Plan this route" crosses tabs, then the route it renders 600ms later scrolls
  // itself into view — the hand-off has to survive that scroll (WCAG 2.4.11)
  await nav(page, '#/hatch', 600);
  await page.evaluate(() => setHatchDepth(0));
  await page.waitForTimeout(900);
  if (await reach(page, async () => {
    const ok = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.hcard')].find(x => /steps/.test(x.textContent));
      if (!c) return false; c.click(); return true;
    });
    if (!ok) throw new Error('no multi-step card');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.hatchpanel .alink')].find(x => /Plan this route/.test(x.textContent));
      b.click();
    });
  }, 'a multi-step chain and its Plan this route')) {
    await page.waitForTimeout(1800);
    await focusVisible(page, 'Plan this route lands on the route, on screen');
    await audit(page, 'planner after Plan this route');
    const said = await page.evaluate(() => document.getElementById('planStatus').textContent);
    if (/steps? to /.test(said)) console.log('  ✓ the route announced itself: ' + JSON.stringify(said.slice(0, 40)));
    else { console.log('  ✗ the route arrived silently: ' + JSON.stringify(said)); fail(); }
    const undo = await page.evaluate(() => !!document.querySelector('.toast .undo'));
    if (undo) console.log('  ✓ the planner overwrite offers Undo');
    else { console.log('  ✗ the planner overwrite offers no Undo'); fail(); }
  }

  console.log('\nPALDEX — gallery with owned tiles, table, unique combos');
  await nav(page, '#/dex', 600);
  await audit(page, 'paldex gallery, lived-in');
  await overflow(page, 'paldex gallery');
  // an aria-live count re-announces even when the string has not changed, so a
  // render inside a keystroke handler must not rewrite it (4.1.3)
  {
    // A count that genuinely changes per keystroke SHOULD announce. What must
    // never happen is a rewrite to the string already there — that re-announces
    // without saying anything new. #dexOwnedCount is the case in point: no
    // filter can change it, so it should never fire while typing at all.
    const muts = await page.evaluate(async () => {
      const seen = [], last = {};
      const obs = ['dexOwnedCount', 'dexCount'].map(id => {
        last[id] = document.getElementById(id).textContent;
        const o = new MutationObserver(() => {
          const now = document.getElementById(id).textContent;
          seen.push({id, redundant: now === last[id]});
          last[id] = now;
        });
        o.observe(document.getElementById(id), {childList: true, characterData: true, subtree: true});
        return o;
      });
      const inp = document.getElementById('dexSearch');
      for (const c of 'lamb') { inp.value += c; renderDex(); await new Promise(r => setTimeout(r, 40)); }
      obs.forEach(o => o.disconnect());
      inp.value = ''; renderDex();
      return {total: seen.length, redundant: seen.filter(x => x.redundant).length,
        owned: seen.filter(x => x.id === 'dexOwnedCount').length};
    });
    if (!muts.redundant && !muts.owned)
      console.log(`  ✓ the Paldex live counts announce only real changes (${muts.total} in 4 keystrokes, none redundant)`);
    else { console.log(`  ✗ live counts re-announced without changing: ${JSON.stringify(muts)}`); fail(); }
  }
  if (await reach(page, () => page.click('#dexView button[data-v="table"]'), 'the table view switch')) {
    await page.waitForTimeout(500);
    await audit(page, 'paldex table');
    await overflow(page, 'paldex table');
    const named = await page.evaluate(() => {
      const t = document.querySelector('#dexTableWrap table');
      const cap = t.querySelector('caption');
      return {name: t.getAttribute('aria-label') || (cap && cap.textContent) || null,
        cols: document.querySelectorAll('#dexTableWrap thead th[scope="col"]').length,
        heads: document.querySelectorAll('#dexTableWrap thead th').length};
    });
    if (named.name && named.cols === named.heads)
      console.log(`  ✓ the species table is named and every header is scoped (${named.cols}/${named.heads})`);
    else { console.log(`  ✗ the species table is unnamed or unscoped: ${JSON.stringify(named)}`); fail(); }
    await page.click('#dexView button[data-v="gallery"]');
    await page.waitForTimeout(300);
  }
  if (await reach(page, () => page.click('#dexMode button[data-m="combos"]'), 'the unique-combos mode')) {
    await page.waitForTimeout(500);
    await audit(page, 'unique combos');
    await overflow(page, 'unique combos');
    // §4: a grid board is ONE tab stop with a roving tabindex, like .dexgrid
    // in the same view. 250 combos otherwise cost 250 stops.
    const board = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#comboList .combo')];
      return {n: items.length, stops: items.filter(c => c.tabIndex >= 0).length};
    });
    if (board.n > 1 && board.stops === 1) console.log(`  ✓ the combos board is one tab stop for ${board.n} recipes`);
    else { console.log(`  ✗ the combos board costs ${board.stops} tab stops for ${board.n} recipes`); fail(); }
    await page.evaluate(() => document.querySelector('#comboList .combo').focus());
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const moved = await page.evaluate(() => document.activeElement.classList.contains('combo'));
    if (moved) console.log('  ✓ arrows move within the combos board');
    else { console.log('  ✗ ArrowDown left the combos board'); fail(); }
  }

  console.log('\nSKILLS — all three sections');
  for (const m of ['auras', 'partner', 'passives']) {
    await nav(page, '#/skills/' + m, 500);
    await audit(page, `skills · ${m}`);
  }
  await overflow(page, 'skills · passives');

  console.log('\nMAP — base, marker selected, spawn overlay');
  await nav(page, '#/map', 1200);
  await audit(page, 'map');
  await overflow(page, 'map');
  await nav(page, '#/map/ForestBoss', 900);
  if (await reach(page, () => page.waitForSelector('#mapInfo:not([hidden])', {timeout: 4000}), 'the marker info panel')) {
    await audit(page, 'map with a marker selected');
  }
  await nav(page, '#/map/spawn/SheepBall', 900);
  if (await reach(page, () => page.waitForSelector('#spawnBar:not([hidden])', {timeout: 8000}), 'the spawn overlay')) {
    await page.waitForTimeout(400);
    await audit(page, 'map with a spawn overlay');
  }

  console.log('\nTOAST — a bad deep link says so');
  await nav(page, '#/pal/Xyzzy', 400);
  if (await reach(page, () => page.waitForSelector('#toasts .toast', {timeout: 3000}), 'the bad-link toast')) {
    await audit(page, 'toast visible');
  }

  console.log('\nMOBILE (360px) — tab bar, more sheet, icon-grid picker');
  await page.setViewportSize({width: 360, height: 740});
  await nav(page, '#/breed/SheepBall/ElecCat', 500);
  await audit(page, 'breed at 360');
  if (await reach(page, async () => {
    await page.click('#moreBtn');
    await page.waitForSelector('#moresheet.open', {timeout: 3000});
  }, 'the more sheet')) {
    await audit(page, 'more sheet open at 360');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  if (await reach(page, async () => {
    await page.click('#pickA .picker-btn');
    await page.waitForSelector('#pickA .picker.open .pop', {timeout: 3000});
  }, 'the icon-grid picker at 360')) {
    await audit(page, 'picker at 360 (icon grid)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await nav(page, '#/roster', 500);
  await audit(page, 'roster at 360');
  // Undo, at a width where the desktop tab bar is display:none. toast()'s last
  // resort focused #tabs button.active, which exists but is unfocusable there,
  // so every undo that reached it dropped the user on <body> — and the suite
  // never pressed Undo, so nothing caught it.
  if (await reach(page, async () => {
    await page.click('#rosterView button[data-v="rows"]');
    await page.waitForTimeout(400);
    await page.click('.rosrow .acts button[data-act="remove"]');
    await page.waitForSelector('.toast .undo', {timeout: 3000});
  }, 'a roster remove and its Undo at 360')) {
    await page.click('.toast .undo');
    await page.waitForTimeout(700);
    await focusVisible(page, 'Undo at 360 lands on the restored row');
    await audit(page, 'roster after undo at 360');
  }

  const probs = problems(h);
  console.log('\nproblems:', probs.length ? probs : 'none');
  if (probs.length) fail();
  await h.browser.close();
  console.log(failed() ? `\n${failed()} FAILED` : '\nall states clean');
  process.exit(failed() ? 1 : 0);
})();
