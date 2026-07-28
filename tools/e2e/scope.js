// Which groups a change could possibly have broken.
//
// This works here because the view files are close to 1:1 with the states —
// README's "one file per view" list is the map. What makes it safe rather than
// merely fast is the default: a file nobody has classified runs everything. An
// unknown file is not evidence that nothing broke.
const {execSync} = require('child_process');

// Touched by everything, so they audit everything: the shell, the styles, and
// the three files README describes as shared across all views (core.js is
// toasts + the species modal + the pickers; router.js is tabs and deep links;
// init.js runs the first render of every view). data.js is the dataset every
// view reads.
const FANOUT = [
  /^index\.html$/,
  /^css\//,
  /^js\/(core|router|init|data)\.js$/,
];

// Cannot change what the suites see: the harness itself, docs, fixtures. sw.js
// is here because the harness blocks the service worker outright (lib.js), so a
// change to it is invisible to these states by construction — its own contract
// is the SHELL array, checked by reading, not by axe.
const IGNORE = [
  /^tools\//, /^docs\//, /^tests\//, /^\.github\//, /\.md$/, /^sw\.js$/, /^\.gitignore$/,
];

const TOUCHES = {
  'js/breed.js': ['breed', 'chain'],
  'js/reverse.js': ['reverse'],
  'js/planner.js': ['planner', 'chain'],
  'js/hatch.js': ['hatch'],
  'js/roster.js': ['roster', 'card-actions'],
  'js/dex.js': ['dex'],
  'js/combos.js': ['dex'],
  'js/skills.js': ['skills'],
  'js/map.js': ['map'],
  'js/mapdata.js': ['map'],
  'js/spawndata.js': ['map'],
  // README: the passive tag picker, shared by exactly these two views
  'js/passives.js': ['roster', 'planner'],
  // README: guide wiring, the initial hash, the "/" shortcut
  'js/boot.js': ['guide', 'cold'],
  'js/save.js': ['suite:a11y'],
  'js/savparse.js': ['suite:a11y'],
};

function changedFiles(base) {
  // stdio: git's CRLF advice on this repo is a paragraph per file, and it is not
  // an error — keep it out of the reviewer's transcript.
  const run = cmd => { try { return execSync(cmd, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch (e) { return ''; } };
  const diff = base ? `git diff --name-only ${base}` : 'git diff --name-only HEAD';
  const files = [run(diff), run('git ls-files --others --exclude-standard')]
    .join('\n').split('\n').map(s => s.trim()).filter(Boolean);
  return [...new Set(files)];
}

/* -> {groups: string[] | null, why: [file, reason][]}
 *    groups === null means "everything" — the caller runs the full matrix.  */
function groupsFor(files, suites) {
  const why = [];
  const picked = new Set();
  let all = false;
  for (const raw of files) {
    const f = raw.replace(/\\/g, '/');
    if (IGNORE.some(re => re.test(f))) { why.push([f, 'not app code']); continue; }
    if (FANOUT.some(re => re.test(f))) { why.push([f, 'shared — every group']); all = true; continue; }
    const hit = TOUCHES[f];
    if (!hit) { why.push([f, 'unmapped — every group, to be safe']); all = true; continue; }
    const names = hit.flatMap(h => h.startsWith('suite:')
      ? (suites.find(s => s.name === h.slice(6)) || {groups: []}).groups.map(g => g.name)
      : [h]);
    names.forEach(n => picked.add(n));
    why.push([f, names.join(', ')]);
  }
  return {groups: all ? null : [...picked], why};
}

module.exports = {changedFiles, groupsFor, TOUCHES, FANOUT, IGNORE};
