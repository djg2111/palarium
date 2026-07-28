#!/usr/bin/env node
/* The runner and the CLI for the browser suites.
 *
 * Point of this file: an agent auditing a change should run one command and
 * read one file, not author a Playwright script, debug it, and re-run it. That
 * round trip was the slowest part of a review, and it was model time, not
 * browser time.
 *
 *   node tools/e2e/audit.js --list
 *   node tools/e2e/audit.js                                  everything
 *   node tools/e2e/audit.js --suite states --groups roster,dex
 *   node tools/e2e/audit.js --json .audit/run.json           artifact for both readers
 *
 * Needs the app served: python -m http.server 8848 from the repo root.
 *
 * Each group runs in its own context, seeded before the first paint, so the
 * groups a run selects are the only ones it pays for.
 */
const path = require('path');
const {chromium} = require('../node_modules/playwright');
const {open, problems, close, BASE} = require('./lib');
const {makeReport} = require('./report');

// Required lazily: a suite's bottom line calls back into main() so that
// `node states.js` still works, and eager loading would be a require cycle.
const SUITES = {states: './states', a11y: './a11y'};

function parseArgs(argv) {
  const o = {suite: 'all', groups: null, json: null, viewport: {width: 1280, height: 900}, list: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--list') o.list = true;
    else if (a === '--suite') o.suite = next();
    else if (a === '--groups' || a === '--group') o.groups = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--json') o.json = next();
    else if (a === '--viewport') { const [w, h] = next().split('x').map(Number); o.viewport = {width: w, height: h}; }
    else { console.error(`unknown argument: ${a}`); process.exit(2); }
  }
  return o;
}

function load(names) {
  return names.map(n => {
    const s = require(SUITES[n]);
    if (!s || !s.groups) { console.error(`suite "${n}" has no groups`); process.exit(2); }
    return s;
  });
}

async function main(argv) {
  const o = parseArgs(argv);
  const names = o.suite === 'all' ? Object.keys(SUITES) : o.suite.split(',').map(s => s.trim());
  for (const n of names) if (!SUITES[n]) { console.error(`unknown suite: ${n} (have ${Object.keys(SUITES).join(', ')})`); process.exit(2); }
  const suites = load(names);

  if (o.list) {
    for (const s of suites) console.log(`${s.name}: ${s.groups.map(g => g.name).join(', ')}`);
    return 0;
  }

  // A selection that matches nothing is a typo, not an empty run that passes.
  if (o.groups) {
    const have = new Set(suites.flatMap(s => s.groups.map(g => g.name)));
    const miss = o.groups.filter(g => !have.has(g));
    if (miss.length) { console.error(`unknown group(s): ${miss.join(', ')}\nhave: ${[...have].join(', ')}`); process.exit(2); }
  }

  const report = makeReport();
  report.begin();
  report.hook();

  const browser = await chromium.launch({channel: 'chrome'});
  let ran = 0;
  const allProblems = [];
  for (const suite of suites) {
    const groups = suite.groups.filter(g => !o.groups || o.groups.includes(g.name));
    for (const g of groups) {
      ran++;
      report.group(`${suite.name}/${g.name}`);
      console.log(`\n${g.title}`);
      const h = await open({browser, storage: suite.seeds[g.seed], viewport: o.viewport});
      suite.bind(h.page);
      try {
        await g.run();
      } catch (e) {
        suite.fail();
        console.log(`  ✗ GROUP CRASHED — ${g.name}: ${String(e).split('\n')[0]}`);
      }
      const probs = problems(h);
      if (probs.length) { suite.fail(); allProblems.push(...probs.map(p => `${g.name}: ${p}`)); console.log(`  ✗ ${g.name}: ${probs.join(' | ')}`); }
      await close(h);
    }
  }
  await browser.close();
  report.unhook();

  const failed = suites.reduce((n, s) => n + s.failed(), 0);
  console.log('\nproblems:', allProblems.length ? allProblems : 'none');
  if (o.json) {
    const out = report.write(o.json, {suites: names, groups: o.groups || 'all', groupsRun: ran, base: BASE});
    console.log(`wrote ${path.resolve(o.json)} — ${out.checks} checks, ${out.failed} failed`);
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall states clean');
  return failed ? 1 : 0;
}

module.exports = {main: argv => main(argv).then(c => process.exit(c), e => { console.error(e); process.exit(1); })};

if (require.main === module) module.exports.main(process.argv.slice(2));
