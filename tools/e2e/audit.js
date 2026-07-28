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
 *   node tools/e2e/audit.js --changed                        only what the diff can have broken
 *   node tools/e2e/audit.js --suite states --groups roster,dex
 *   node tools/e2e/audit.js --json .audit/run.json           artifact for both readers
 *   node tools/e2e/audit.js --concurrency 1                  serial, for debugging
 *
 * Needs the app served: python -m http.server 8848 from the repo root.
 *
 * Each group runs in its own context, seeded before the first paint, so groups
 * are independent — which is what lets a run take only the ones it needs, and
 * lets several run at once.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const {execSync} = require('child_process');
const {chromium} = require('../node_modules/playwright');
const {open, problems, close, BASE} = require('./lib');
const {makeReport} = require('./report');
const {changedFiles, groupsFor} = require('./scope');

// Required lazily: a suite's bottom line calls back into main() so that
// `node states.js` still works, and eager loading would be a require cycle.
const SUITES = {states: './states', a11y: './a11y'};

// Each context is a Chrome tab running axe over a 299-pal DOM, so this is
// bounded by memory rather than cores.
const DEFAULT_CONCURRENCY = Math.max(1, Math.min(6, os.cpus().length - 2));

// How long each group took last time, used only to order the queue. Advisory:
// a missing, stale or corrupt file costs nothing but the old ordering.
const TIMINGS = path.join(__dirname, '..', '..', '.audit', 'timings.json');
function readTimings() {
  try { return JSON.parse(fs.readFileSync(TIMINGS, 'utf8')); } catch (e) { return null; }
}
function writeTimings(groups) {
  try {
    const prev = readTimings() || {};
    for (const [k, v] of Object.entries(groups)) if (v.ms) prev[k] = v.ms;
    fs.mkdirSync(path.dirname(TIMINGS), {recursive: true});
    fs.writeFileSync(TIMINGS, JSON.stringify(prev, null, 2));
  } catch (e) { /* advisory only */ }
}

// Stamped into the artifact so a second reader can tell whether the run it
// found still describes the working tree, instead of trusting a stale file.
// `dirty` alone is not enough: --porcelain is a list of *files*, so editing a
// file that was already modified leaves the stamp byte-identical. A reviewer
// following §10's "if those match, the file is current" then read an artifact
// describing a tree that no longer existed. The diff hash is what actually
// moves when content does.
function stamp() {
  const git = c => { try { return execSync(c, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch (e) { return null; } };
  const diff = git('git diff HEAD') || '';
  return {commit: git('git rev-parse HEAD'), dirty: git('git status --porcelain') || '',
    diff: require('crypto').createHash('sha1').update(diff).digest('hex').slice(0, 12)};
}

function parseArgs(argv) {
  const o = {suite: 'all', groups: null, json: null, viewport: {width: 1280, height: 900},
    list: false, changed: false, base: null, concurrency: DEFAULT_CONCURRENCY};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--list') o.list = true;
    else if (a === '--changed') o.changed = true;
    else if (a === '--base') { o.base = next(); o.changed = true; }
    else if (a === '--suite') o.suite = next();
    else if (a === '--groups' || a === '--group') o.groups = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--json') o.json = next();
    else if (a === '--concurrency') o.concurrency = Math.max(1, Number(next()) || 1);
    else if (a === '--viewport') { const [w, h] = next().split('x').map(Number); o.viewport = {width: w, height: h}; }
    else { console.error(`unknown argument: ${a}`); process.exit(2); }
  }
  return o;
}

// Fixed-size worker pool: keeps `n` groups in flight and starts the next as
// each finishes, rather than running in waves that idle on the slowest member.
async function pool(items, n, worker) {
  const it = items[Symbol.iterator]();
  await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => {
    for (let x = it.next(); !x.done; x = it.next()) await worker(x.value);
  }));
}

async function main(argv) {
  const o = parseArgs(argv);
  const names = o.suite === 'all' ? Object.keys(SUITES) : o.suite.split(',').map(s => s.trim());
  for (const n of names) if (!SUITES[n]) { console.error(`unknown suite: ${n} (have ${Object.keys(SUITES).join(', ')})`); process.exit(2); }
  const suites = names.map(n => require(SUITES[n]));

  if (o.list) {
    for (const s of suites) console.log(`${s.name}: ${s.groups.map(g => g.name).join(', ')}`);
    return 0;
  }

  if (o.changed) {
    const files = changedFiles(o.base);
    if (!files.length) { console.log('nothing changed — nothing to audit'); return 0; }
    const {groups, why} = groupsFor(files, suites);
    console.log('changed:');
    for (const [f, reason] of why) console.log(`  ${f} → ${reason}`);
    if (groups && !groups.length) { console.log('\nno app code changed — nothing to audit'); return 0; }
    o.groups = groups;  // null means everything
    console.log(groups ? `\nauditing ${groups.length} group(s): ${groups.join(', ')}` : '\nauditing every group');
  }

  // A selection that matches nothing is a typo, not an empty run that passes.
  const have = new Set(suites.flatMap(s => s.groups.map(g => g.name)));
  if (o.groups) {
    const miss = o.groups.filter(g => !have.has(g));
    if (miss.length) { console.error(`unknown group(s): ${miss.join(', ')}\nhave: ${[...have].join(', ')}`); process.exit(2); }
  }

  const queue = suites.flatMap(s => s.groups.filter(g => !o.groups || o.groups.includes(g.name)).map(g => ({suite: s, g})));

  // Longest-processing-time-first. With groups of 1s to 25s, declaration order
  // leaves a long one starting last and every other worker idling behind it —
  // worth ~8s of a 43s run. Ordering is free because groups are independent;
  // the timings come from the previous run and fall back to declaration order.
  const hints = readTimings();
  if (hints) queue.sort((a, b) => (hints[`${b.suite.name}/${b.g.name}`] || 0) - (hints[`${a.suite.name}/${a.g.name}`] || 0));
  const report = makeReport();
  report.begin();
  report.hook();

  const browser = await chromium.launch({channel: 'chrome'});
  const allProblems = [];
  const conc = Math.min(o.concurrency, queue.length);
  await pool(queue, conc, async ({suite, g}) => {
    const label = `${suite.name}/${g.name}`;
    let h = null;
    try {
      h = await open({browser, storage: suite.seeds[g.seed], viewport: o.viewport});
    } catch (e) {
      suite.fail();
      await report.run(label, `\n${g.title}`, async () => { console.log(`  ✗ COULD NOT OPEN — ${g.name}: ${String(e).split('\n')[0]}`); });
      return;
    }
    await report.run(label, `\n${g.title}`, async () => {
      try {
        await g.run(h.page);
      } catch (e) {
        suite.fail();
        console.log(`  ✗ GROUP CRASHED — ${g.name}: ${String(e).split('\n')[0]}`);
      }
      const probs = problems(h);
      if (probs.length) { suite.fail(); allProblems.push(...probs.map(p => `${g.name}: ${p}`)); console.log(`  ✗ ${g.name}: ${probs.join(' | ')}`); }
    });
    await close(h);
  });
  await browser.close();
  report.unhook();

  const failed = suites.reduce((n, s) => n + s.failed(), 0);
  writeTimings(report.summary().groups);
  console.log('\nproblems:', allProblems.length ? allProblems : 'none');
  if (o.json) {
    const doc = report.write(o.json, {suites: names, groups: o.groups || 'all', groupsRun: queue.length,
      concurrency: conc, base: BASE, ...stamp()});
    console.log(`wrote ${path.resolve(o.json)} — ${doc.checks} checks, ${doc.failed} failed`);
  }
  console.log(`\n${queue.length} group(s), ${conc} at a time`);
  console.log(failed ? `${failed} FAILED` : 'all states clean');
  return failed ? 1 : 0;
}

module.exports = {main: argv => main(argv).then(c => process.exit(c), e => { console.error(e); process.exit(1); })};

if (require.main === module) module.exports.main(process.argv.slice(2));
