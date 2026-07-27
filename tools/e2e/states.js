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
const {audit, overflow, focusSane, fail, failed} = makeChecks();

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
    await audit(page, 'roster editor with the validation error');
    await page.click('#rosterCancel');
    await page.waitForTimeout(250);
    await focusSane(page, 'closing the editor restores focus');
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

  console.log('\nBREEDABLE NOW — results, expanded pairs');
  await nav(page, '#/hatch', 600);
  await audit(page, 'breedable now with results');
  if (await reach(page, () => page.click('#hatchList .hcard'), 'a breedable result card')) {
    await page.waitForTimeout(400);
    await audit(page, 'breedable now with pairs expanded');
    await overflow(page, 'breedable now with pairs expanded');
  }

  console.log('\nPALDEX — gallery with owned tiles, table, unique combos');
  await nav(page, '#/dex', 600);
  await audit(page, 'paldex gallery, lived-in');
  await overflow(page, 'paldex gallery');
  if (await reach(page, () => page.click('#dexView button[data-v="table"]'), 'the table view switch')) {
    await page.waitForTimeout(500);
    await audit(page, 'paldex table');
    await overflow(page, 'paldex table');
    await page.click('#dexView button[data-v="gallery"]');
    await page.waitForTimeout(300);
  }
  if (await reach(page, () => page.click('#dexMode button[data-m="combos"]'), 'the unique-combos mode')) {
    await page.waitForTimeout(500);
    await audit(page, 'unique combos');
    await overflow(page, 'unique combos');
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

  const probs = problems(h);
  console.log('\nproblems:', probs.length ? probs : 'none');
  if (probs.length) fail();
  await h.browser.close();
  console.log(failed() ? `\n${failed()} FAILED` : '\nall states clean');
  process.exit(failed() ? 1 : 0);
})();
