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

  // The hash IS the router, so the skip link's own href was a route: it used to
  // answer the app's accessibility affordance with "Link not recognized".
  {
    await page.evaluate(() => document.querySelector('.skip').focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const sk = await page.evaluate(() => ({
      landed: document.activeElement === document.getElementById('main'),
      hash: location.hash,
      toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.replace(/\s+/g, ' ').trim()),
    }));
    if (sk.landed && sk.hash === '#/guide' && !sk.toasts.length)
      console.log('  ✓ Skip to content lands on <main> and leaves the route alone');
    else { console.log(`  ✗ Skip to content: ${JSON.stringify(sk)}`); fail(); }
  }

  // Dismissing the checklist hides the button that was pressed.
  await nav(page, '#/breed', 350);
  {
    const bar = await page.evaluate(() => {
      const b = document.getElementById('setupbar');
      return {shown: !b.hidden, role: b.getAttribute('role'), named: !!b.getAttribute('aria-labelledby')};
    });
    if (bar.shown && bar.role === 'group' && bar.named) console.log('  ✓ the setup checklist is one named group');
    else { console.log(`  ✗ the setup checklist: ${JSON.stringify(bar)}`); fail(); }
    if (bar.shown) {
      await page.evaluate(() => { const d = document.getElementById('tipDismiss'); d.focus(); d.click(); });
      await page.waitForTimeout(300);
      await focusVisible(page, 'dismissing the checklist');
    }
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
    // Focus stays in the search box while the arrows move a highlight through
    // 299 options, so the highlight has to be named — otherwise you arrow blind
    // and press Enter on a row you were never told about.
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const ad = await page.evaluate(() => {
      const inp = document.querySelector('#pickA .pop input');
      const id = inp.getAttribute('aria-activedescendant');
      const el = id && document.getElementById(id);
      return {role: inp.getAttribute('role'), points: !!el, isHl: !!(el && el.classList.contains('hl')),
        says: el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 18) : null};
    });
    if (ad.role === 'combobox' && ad.points && ad.isHl) console.log(`  ✓ the arrow keys name what they land on: ${JSON.stringify(ad.says)}`);
    else { console.log(`  ✗ the picker's highlight is unnamed: ${JSON.stringify(ad)}`); fail(); }
    // a listbox may hold only options — the "no pals match" line used to sit in it
    await page.evaluate(() => { const i = document.querySelector('#pickA .pop input'); i.value = 'zzzzq'; i.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(300);
    await audit(page, 'picker with no matches');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await focusSane(page, 'Escape hands focus back to the picker button');
  }

  // Clearing a picker was pointer-only: a <span> with a title inside the
  // trigger button, and the popup offers no "none" row, so a keyboard user who
  // set a parent could not unset it.
  {
    await page.evaluate(() => document.querySelector('#pickA .picker-btn').focus());
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    const onClear = await page.evaluate(() => {
      const a = document.activeElement;
      return {isClear: a.classList.contains('pclear'), name: a.getAttribute('aria-label')};
    });
    if (onClear.isClear && /^Clear /.test(onClear.name || '')) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const done = await page.evaluate(() => ({
        empty: !pickA.get(), gone: document.querySelector('#pickA .pclear').hidden,
        back: document.activeElement.classList.contains('picker-btn'),
      }));
      if (done.empty && done.gone && done.back) console.log(`  ✓ ${JSON.stringify(onClear.name)} is a real button, and hands focus back`);
      else { console.log(`  ✗ clearing with the keyboard: ${JSON.stringify(done)}`); fail(); }
    } else { console.log(`  ✗ Tab from the picker does not reach a clear: ${JSON.stringify(onClear)}`); fail(); }
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

  console.log('\nPAL MODAL — stepping, the Tab trap, the star');
  await nav(page, '#/pal/Anubis', 500);
  if (await reach(page, () => page.waitForSelector('#overlay.open', {timeout: 3000}), 'the pal modal')) {
    await audit(page, 'pal modal open');
    await overflow(page, 'pal modal');

    // ‹ › rebuild the card without the dialog opening or closing. The button
    // that was pressed is destroyed in the rebuild, so it has to be handed the
    // focus back, and something has to say which pal you are now looking at.
    await page.evaluate(() => document.querySelector('#modal .mnav.next').focus());
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.querySelector('#modal .mnav.next').click());
      await page.waitForTimeout(220);
    }
    await audit(page, 'pal modal after stepping');
    const step = await page.evaluate(() => ({
      onNext: document.activeElement === document.querySelector('#modal .mnav.next'),
      said: (document.querySelector('#modal [aria-live]') || {}).textContent || '',
      name: document.querySelector('#modal h2').firstChild.textContent.trim(),
    }));
    if (step.onNext) console.log('  ✓ stepping hands focus back to ›');
    else { console.log('  ✗ stepping dropped focus off ›'); fail(); }
    if (step.said.startsWith(step.name)) console.log(`  ✓ the step is announced: ${JSON.stringify(step.said)}`);
    else { console.log(`  ✗ nothing announced the new pal: ${JSON.stringify(step.said)}`); fail(); }

    // aria-modal="true" hides the page behind from screen readers, so Tab must
    // not reach it — including from <body>, where a rebuild can strand focus.
    let escaped = 0;
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(30);
      if (!await page.evaluate(() => document.getElementById('overlay').contains(document.activeElement))) escaped++;
    }
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
    const backIn = await page.evaluate(() => document.getElementById('overlay').contains(document.activeElement));
    if (!escaped && backIn) console.log('  ✓ Tab stays in the dialog, and comes back to it from <body>');
    else { console.log(`  ✗ Tab left the dialog ${escaped}/24 times; recovered from <body> = ${backIn}`); fail(); }

    // One paintStar for the tile, the row and the card. ROSTER[0] is both
    // starred and held in the roster, so un-starring it must land on "still
    // owned, through the roster" — not on the hollow ☆ that a card drawing its
    // own star from owned.has() alone produced.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await nav(page, '#/pal/' + ROSTER[0].k, 500);
    const rd = () => page.evaluate(() => {
      const s = document.querySelector('#modal .star');
      return {glyph: s.textContent, label: s.getAttribute('aria-label'), pressed: s.getAttribute('aria-pressed'),
        kept: document.activeElement === s};
    });
    const s1 = await rd();
    if (/^Unmark /.test(s1.label)) console.log(`  ✓ a starred species names the way out: ${JSON.stringify(s1.label)}`);
    else { console.log(`  ✗ the card's star does not flip its name: ${JSON.stringify(s1)}`); fail(); }
    await page.evaluate(() => { const s = document.querySelector('#modal .star'); s.focus(); s.click(); });
    await page.waitForTimeout(250);
    const s2 = await rd();
    if (s2.glyph === '★' && /in your roster/.test(s2.label) && s2.kept)
      console.log(`  ✓ un-starring it still reads as owned: ${JSON.stringify(s2.label)}`);
    else { console.log(`  ✗ un-starring a roster-held species: ${JSON.stringify(s2)}`); fail(); }
    await page.evaluate(() => document.querySelector('#modal .star').click());
    await page.waitForTimeout(250);
    if (/^Unmark /.test((await rd()).label)) console.log('  ✓ and starring it again comes back');
    else { console.log('  ✗ the star did not come back'); fail(); }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  // Every one of the 299 cards is taller than the viewport at 360, so the way
  // out has to survive scrolling — touch has no Escape, and the controls used
  // to be absolutely positioned at the top of the card and left the screen 85px
  // in. The card is the scrollport and its bar is sticky.
  await page.setViewportSize({width: 360, height: 640});
  await nav(page, '#/pal/Mimog', 600);
  if (await reach(page, () => page.waitForSelector('#overlay.open', {timeout: 3000}), 'the tallest pal card')) {
    await audit(page, 'tallest pal card at 360');
    const deep = await page.evaluate(() => {
      const m = document.getElementById('modal');
      m.scrollTop = m.scrollHeight;
      const c = document.querySelector('#modal .close').getBoundingClientRect();
      const at = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return {scrolls: m.scrollHeight > m.clientHeight + 1, by: Math.round(m.scrollTop),
        closeOnScreen: c.top >= 0 && c.bottom <= innerHeight, closeIsTopmost: !!(at && at.closest('.close'))};
    });
    if (deep.scrolls && deep.closeOnScreen && deep.closeIsTopmost)
      console.log(`  ✓ ✕ is still on top after scrolling the card ${deep.by}px`);
    else { console.log(`  ✗ the card's way out after scrolling: ${JSON.stringify(deep)}`); fail(); }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  await page.setViewportSize({width: 1280, height: 900});
  await page.waitForTimeout(150);

  // A shared #/pal/K link has no opener at all — applyHash opens the card with
  // nothing focused, and every way out of one used to end on <body>.
  for (const how of ['Escape', 'close', 'scrim']) {
    await nav(page, '#/dex', 300);
    await nav(page, '#/pal/Anubis', 500);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else if (how === 'close') await page.evaluate(() => document.querySelector('#modal .close').click());
    else await page.evaluate(() => document.getElementById('overlay').click());
    await page.waitForTimeout(600);
    await focusVisible(page, `a deep-linked card closed by ${how}`);
  }

  // The card carries the roster row's own actions. They run with the card
  // closing under them, so renderRoster's focus restore has nothing to read.
  console.log('\nPAL CARD ACTIONS — the four roster actions land somewhere real');
  for (const act of ['✎ Edit', '⧉ Duplicate', 'Use as planner start', '✕ Remove']) {
    // ✎ leaves the editor open over the list
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await nav(page, '#/roster', 400);
    const ok = await reach(page, async () => {
      // the open species stays open across a tab change, and clicking its tile
      // again would close it
      if (!await page.$('#rosterList .rosrow .nm')) await page.click('#rosterList .rostile');
      await page.waitForSelector('#rosterList .rosrow .nm', {timeout: 3000});
      await page.click('#rosterList .rosrow .nm');
      await page.waitForSelector('#modal .rentacts button', {timeout: 3000});
    }, 'a roster entry’s card');
    if (!ok) break;
    await page.evaluate(a => {
      [...document.querySelectorAll('#modal .rentacts button')].find(x => x.textContent.trim() === a).click();
    }, act);
    await page.waitForTimeout(700);
    await focusVisible(page, `“${act}” from the card`);
    // put the entry back before the next one runs
    await page.evaluate(() => { const u = document.querySelector('.toast .undo'); if (u) u.click(); });
    await page.waitForTimeout(400);
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
    if (board.n > 1 && board.stops === 1) console.log(`  ✓ the combos board is one tab stop for ${board.n} combos`);
    else { console.log(`  ✗ the combos board costs ${board.stops} tab stops for ${board.n} combos`); fail(); }
    // one stop is only half the contract — the board also has to say the arrows
    // exist, and report its size (§4)
    const told = await page.evaluate(() => {
      const l = document.getElementById('comboList');
      const d = l.getAttribute('aria-describedby');
      return {tag: l.tagName, named: !!l.getAttribute('aria-label'),
        help: !!(d && document.getElementById(d))};
    });
    if (told.tag === 'UL' && told.named && told.help) console.log('  ✓ the combos board is a named list with keyboard help');
    else { console.log(`  ✗ the combos board is undocumented: ${JSON.stringify(told)}`); fail(); }
    await page.evaluate(() => document.querySelector('#comboList .combo').focus());
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const moved = await page.evaluate(() => document.activeElement.classList.contains('combo'));
    if (moved) console.log('  ✓ arrows move within the combos board');
    else { console.log('  ✗ ArrowDown left the combos board'); fail(); }
    // the board's one action crosses tabs, and navTab hides the control pressed
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await focusVisible(page, 'a combo lands on the pair it loaded');
    await nav(page, '#/dex', 500);
    await page.click('#dexMode button[data-m="pals"]');
    await page.waitForTimeout(300);
  }
  // A star under a filter that removes its row: the gallery had the successor
  // branch, the table swallowed the miss with ?. and dropped focus on <body>.
  if (await reach(page, async () => {
    await page.click('#dexView button[data-v="table"]');
    await page.waitForTimeout(400);
    await page.click('#dexShow button[data-v="missing"]');
    await page.waitForSelector('#dexBody tr .star', {timeout: 3000});
  }, 'the table under Show: missing')) {
    await page.evaluate(() => { const s = document.querySelector('#dexBody tr .star'); s.focus(); s.click(); });
    await page.waitForTimeout(600);
    await focusVisible(page, 'starring a table row under a filter lands on its successor');
    // and the pal name is the row's header, so a cell is not announced bare
    const heads = await page.evaluate(() => ({
      rows: document.querySelectorAll('#dexBody tr').length,
      headers: document.querySelectorAll('#dexBody th[scope="row"]').length,
      sticky: getComputedStyle(document.querySelector('#dexBody th')).position}));
    if (heads.headers === heads.rows && heads.sticky === 'static')
      console.log(`  ✓ every table row has a row header (${heads.headers}/${heads.rows}), unstyled by the sticky column rule`);
    else { console.log(`  ✗ table row headers: ${JSON.stringify(heads)}`); fail(); }
    await page.click('#dexShow button[data-v="all"]');
    await page.waitForTimeout(300);
    await page.click('#dexView button[data-v="gallery"]');
    await page.waitForTimeout(300);
  }

  console.log('\nGUIDE — its jumps out, and its jump within');
  await nav(page, '#/guide', 500);
  await audit(page, 'guide');
  await overflow(page, 'guide');
  // Every cross-tab jump lands on the control it set (§4). All five of these
  // ran a bare navTab and ended on <body>, and the in-guide one scrolled the
  // page while leaving focus on a button now above the viewport.
  {
    const navs = await page.evaluate(() => [...document.querySelectorAll('#view-guide [data-nav]')].map(b => b.dataset.nav));
    for (const n of navs) {
      await nav(page, '#/guide', 400);
      await page.evaluate(x => { const b = document.querySelector(`[data-nav="${x}"]`); b.focus(); b.click(); }, n);
      await page.waitForTimeout(600);
      await focusVisible(page, `the guide's "${n}" jump lands on screen`);
    }
    await nav(page, '#/guide', 400);
    await page.evaluate(() => { const b = document.querySelector('#view-guide [data-open]'); b.focus(); b.click(); });
    await page.waitForTimeout(700);
    await focusVisible(page, "the guide's in-page jump lands on the section it opened");
    const opened = await page.evaluate(() => {
      const d = document.getElementById('g-cakes');
      return {open: d.open, onSummary: document.activeElement === d.querySelector('summary')};
    });
    if (opened.open && opened.onSummary) console.log('  ✓ it opened the target section and focused its summary');
    else { console.log(`  ✗ the in-page jump left ${JSON.stringify(opened)}`); fail(); }
  }
  await nav(page, '#/guide', 400);
  await page.evaluate(() => document.querySelectorAll('#view-guide details').forEach(d => d.open = true));
  await page.waitForTimeout(300);
  await audit(page, 'guide, every section open');
  await overflow(page, 'guide, every section open');

  console.log('SKILLS — all three sections');
  for (const m of ['auras', 'partner', 'passives']) {
    await nav(page, '#/skills/' + m, 500);
    await audit(page, `skills · ${m}`);
    // Opening a pal card from here re-renders the catalog on the way back, so
    // the card has to find the rebuilt button — and Skills keeps all three
    // sub-blocks in the DOM, so it must find one that is actually rendered.
    const from = await page.evaluate(sel => {
      const b = document.querySelector(sel + ' .palref');
      if (!b) return null;
      b.focus(); b.click(); return b.textContent.replace(/\s+/g, ' ').trim().slice(0, 20);
    }, '#skill' + m[0].toUpperCase() + m.slice(1) + 'Block');
    if (!from) continue;
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    await focusVisible(page, `a card opened from skills · ${m} comes back to ${JSON.stringify(from)}`);
  }
  await overflow(page, 'skills · passives');

  // The view names itself, so its group headings are one level down — without
  // an h2 the first heading here was a GROUP heading and the view was unnamed.
  {
    const hs = await page.evaluate(() => {
      const v = document.getElementById('view-skills');
      const all = [...v.querySelectorAll('h1,h2,h3,h4')].filter(e => e.getBoundingClientRect().height > 0);
      return {first: all[0] && all[0].tagName + ':' + all[0].textContent.trim(),
        groups: all.slice(1).map(e => e.tagName)};
    });
    if (/^H2:Skills/.test(hs.first || '') && hs.groups.every(t => t === 'H3'))
      console.log(`  ✓ Skills names itself in an h2 and its ${hs.groups.length} groups sit at h3`);
    else { console.log(`  ✗ Skills heading structure: ${JSON.stringify(hs)}`); fail(); }
  }
  // "Show more" appends 60 cards ABOVE its own button, so the control the user
  // is standing on moves off the bottom of the page
  if (await reach(page, async () => {
    await page.click('#skillMode button[data-m="partner"]');
    await page.waitForTimeout(400);
    await page.waitForSelector('#psMore:not([hidden])', {timeout: 3000});
  }, "the partner list's Show more")) {
    await page.evaluate(() => { const b = document.getElementById('psMore'); b.scrollIntoView({block: 'center'}); b.focus(); });
    await page.waitForTimeout(400);
    const y0 = await page.evaluate(() => Math.round(scrollY));
    await page.evaluate(() => document.getElementById('psMore').click());
    await page.waitForTimeout(700);
    await focusVisible(page, 'Show more lands on the first card it revealed');
    const moved = await page.evaluate(() => Math.round(scrollY)) - y0;
    // the press reveals 60 cards where the user is looking; chasing the button
    // to the new end of the list instead travelled 14,757px over 1,654ms (§5)
    if (Math.abs(moved) < 40) console.log(`  ✓ Show more scrolls ${moved}px — the new cards are where the user was`);
    else { console.log(`  ✗ Show more scrolled ${moved}px away from the cards it revealed`); fail(); }
    await audit(page, 'skills partner, paged');
  }
  // A rank table is wider than its card at every viewport, so the pannable box
  // needs its own tab stop — axe's scrollable-region-focusable, in a state no
  // suite had ever opened.
  if (await reach(page, async () => {
    await page.evaluate(() => { const i = document.getElementById('psSearch'); i.value = 'Astegon'; i.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(500);
    await page.waitForSelector('#psList .rankdet', {timeout: 3000});
  }, 'a rank disclosure')) {
    await page.evaluate(() => document.querySelectorAll('#psList .rankdet').forEach(d => { d.open = true; }));
    await page.waitForTimeout(400);
    await audit(page, 'skills, rank table open');
    await overflow(page, 'skills, rank table open');
    const sc = await page.evaluate(() => {
      const all = [...document.querySelectorAll('#psList .rankscroll')];
      const pan = all.filter(x => x.scrollWidth > x.clientWidth + 1);
      return {pan: pan.length, tabbable: pan.filter(x => x.tabIndex >= 0).length,
        named: pan.filter(x => x.getAttribute('aria-label')).length};
    });
    if (!sc.pan || (sc.tabbable === sc.pan && sc.named === sc.pan))
      console.log(`  ✓ every pannable rank table is a named tab stop (${sc.pan})`);
    else { console.log(`  ✗ pannable rank tables unreachable by keyboard: ${JSON.stringify(sc)}`); fail(); }
    await page.evaluate(() => { const i = document.getElementById('psSearch'); i.value = ''; i.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(400);
  }

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

  // Every view names itself in an h2 — Map had no heading at all, so heading
  // navigation skipped straight past the app's largest surface.
  {
    const hd = await page.evaluate(() => {
      const v = document.getElementById('view-map');
      const h = [...v.querySelectorAll('h1,h2,h3')].filter(e => e.getBoundingClientRect().height > 0)[0];
      return h ? h.tagName + ':' + h.textContent.trim() : 'NONE';
    });
    if (hd === 'H2:Map') console.log('  ✓ the Map names itself in an h2');
    else { console.log(`  ✗ the Map's first heading is ${hd}`); fail(); }
  }
  // the visible help named only pointer gestures while the keyboard route
  // existed solely in the region's aria-label
  {
    const kb = await page.evaluate(() => {
      const v = document.getElementById('mapView');
      const d = v.getAttribute('aria-describedby');
      const help = document.getElementById('mapHelp');
      return {help: help.textContent, label: v.getAttribute('aria-label'),
        describedBy: d, resolves: !!(d && document.getElementById(d)),
        faded: help.classList.contains('gone')};
    });
    // The keyboard route has to be in the VISIBLE line, not only in the region's
    // name — and the name should identify, not instruct. One string, described.
    const named = /arrow/i.test(kb.help) && /zoom/i.test(kb.help);
    if (named && kb.resolves && kb.label.split(/\s+/).length <= 6)
      console.log('  ✓ the map help names the keyboard route and describes the region');
    else { console.log(`  ✗ map help/label: ${JSON.stringify(kb)}`); fail(); }
  }
  // The help is once per session by design, and the cold-start loop above has
  // already opened the Map — so check the real first-visit path on a fresh load.
  // It used to start its timer at BOOT, so it was gone before the Map appeared.
  {
    await page.reload({waitUntil: 'load'});
    await page.waitForTimeout(400);
    await nav(page, '#/map', 1200);
    const shown = await page.evaluate(() => {
      const h = document.getElementById('mapHelp');
      return {gone: h.classList.contains('gone'), opacity: getComputedStyle(h).opacity};
    });
    if (!shown.gone && shown.opacity !== '0') console.log('  ✓ the help is on screen when the Map is first opened');
    else { console.log(`  ✗ the help had already faded before the Map appeared: ${JSON.stringify(shown)}`); fail(); }
  }
  // arrows pan once there is somewhere to pan to
  {
    const moved = await page.evaluate(async () => {
      document.getElementById('mapView').focus();
      const press = k => document.getElementById('mapView').dispatchEvent(
        new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true}));
      press('+'); press('+');
      await new Promise(r => setTimeout(r, 400));
      const before = Math.round(mapTX);
      press('ArrowRight');
      await new Promise(r => setTimeout(r, 300));
      return Math.round(mapTX) - before;
    });
    if (moved !== 0) console.log(`  ✓ arrow keys pan the map (${moved}px)`);
    else { console.log('  ✗ ArrowRight did not pan the map'); fail(); }
  }
  // The MAP block had no focus assertion at all, and six routes out of the info
  // panel dropped focus on <body>: both close buttons, the nearest-marker
  // buttons, Escape from inside it, and the spawn bar's Clear.
  if (await reach(page, async () => {
    await page.evaluate(() => { const i = document.getElementById('mapSearch'); i.value = 'statue'; i.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(600);
    await page.waitForSelector('#mapResults button', {timeout: 3000});
    await page.evaluate(() => { const b = document.querySelector('#mapResults button'); b.focus(); b.click(); });
    await page.waitForTimeout(1200);
  }, 'a marker chosen from map search')) {
    await focusVisible(page, 'choosing a marker lands on its panel, on screen');
    const acts = await page.evaluate(() => {
      const a = document.querySelector('#mapInfo .iacts');
      if (!a) return {ok: false};
      const r = a.getBoundingClientRect();
      const nv = document.getElementById('bottomnav'); const nr = nv && nv.getBoundingClientRect();
      const bot = nr && nr.height ? nr.top : innerHeight;
      return {ok: r.bottom <= bot + 1 && r.top >= 0, bottom: Math.round(r.bottom), bot: Math.round(bot)};
    });
    if (acts.ok) console.log("  ✓ the panel's actions are on screen");
    else { console.log(`  ✗ the panel's actions are off screen: ${JSON.stringify(acts)}`); fail(); }
    await page.evaluate(() => { const b = document.querySelector('#mapInfo .iclose'); b.focus(); b.click(); });
    await page.waitForTimeout(600);
    await focusVisible(page, 'closing the panel hands focus to the map');
    await audit(page, 'map after closing the info panel');
    await page.evaluate(() => document.getElementById('mapView').dispatchEvent(
      new KeyboardEvent('keydown', {key: '0', bubbles: true, cancelable: true})));
    await page.waitForTimeout(300);
  }

  console.log('\nTOAST — a bad deep link says so, and the widest toast at 320');
  await nav(page, '#/pal/Xyzzy', 400);
  if (await reach(page, () => page.waitForSelector('#toasts .toast', {timeout: 3000}), 'the bad-link toast')) {
    await audit(page, 'toast visible');
  }
  // The longest real message the app can produce, with both actions, at the
  // narrowest supported width. The actions used to be squeezed to 27px there
  // and rendered as a column of single letters.
  await page.setViewportSize({width: 320, height: 760});
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    toast('Removed Woolly the Lamball from your roster — the species is still ★ owned in the Paldex',
      () => {}, {label: 'Un-star Lamball', fn: () => {}});
  });
  await page.waitForTimeout(350);
  await audit(page, 'a long two-action toast at 320');
  const tw = await page.evaluate(() => {
    const t = document.querySelector('.toast');
    // +2: scrollWidth is an integer and the rect is fractional, so a button
    // sized exactly to its text reads as 36 vs 37
    return {narrow: [...t.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width + 2 < b.scrollWidth).map(b => b.textContent.trim()),
      lines: Math.round(t.querySelector('span').getBoundingClientRect().height / 20)};
  });
  if (!tw.narrow.length && tw.lines <= 4) console.log(`  ✓ its actions keep their labels and the message stays ${tw.lines} lines`);
  else { console.log(`  ✗ toast at 320: clipped ${JSON.stringify(tw.narrow)}, message ${tw.lines} lines`); fail(); }
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await page.setViewportSize({width: 1280, height: 900});
  await page.waitForTimeout(150);

  console.log('\nMOBILE (360px) — tab bar, more sheet, icon-grid picker');
  await page.setViewportSize({width: 360, height: 740});
  await nav(page, '#/breed/SheepBall/ElecCat', 500);
  await audit(page, 'breed at 360');
  if (await reach(page, async () => {
    await page.evaluate(() => { const b = document.getElementById('moreBtn'); b.focus(); b.click(); });
    await page.waitForSelector('#moresheet.open', {timeout: 3000});
  }, 'the more sheet')) {
    await audit(page, 'more sheet open at 360');
    // closing hides the button that was pressed — all three routes out
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await focusSane(page, 'Escape hands the sheet’s focus back to More');
    await page.evaluate(() => { const b = document.getElementById('moreBtn'); b.focus(); b.click(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => { const b = document.querySelector('#moresheet button[data-v="map"]'); b.focus(); b.click(); });
    await page.waitForTimeout(900);
    await focusVisible(page, 'picking a view from the sheet');
    // six of the nine views live behind More; the bar has to say so in words,
    // not in the accent hue alone
    const bar = await page.evaluate(() => {
      const m = document.getElementById('moreBtn');
      return {current: m.getAttribute('aria-current'), name: m.getAttribute('aria-label') || m.textContent.trim(),
        ring: getComputedStyle(m).boxShadow};
    });
    if (bar.current === 'page' && /^More/.test(bar.name) && / Map$/.test(bar.name))
      console.log(`  ✓ the bar names the view behind More: ${JSON.stringify(bar.name)}`);
    else { console.log(`  ✗ on a sheet view the bar says: ${JSON.stringify(bar)}`); fail(); }
    if (bar.ring && bar.ring !== 'none') console.log('  ✓ the current tab is marked by more than its colour');
    else { console.log('  ✗ the current tab is marked by colour alone (1.4.1)'); fail(); }
    await nav(page, '#/breed/SheepBall/ElecCat', 400);
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
