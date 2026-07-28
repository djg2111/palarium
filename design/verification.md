# 10 · Verification recipes

How a claim about the running app gets evidence. Split out of DESIGN.md because
only the reviewing agents need it. Section numbers are canonical repo-wide:
"DESIGN.md §10" means this file.

---

## 10 · Verification recipes

Serve first — 8848 is the port `tools/e2e/lib.js` expects. If it is already bound,
a parallel agent started it: reuse it, don't kill it.

```sh
python -m http.server 8848
```

### The standing gate

`tools/e2e/audit.js` is the runner and the CLI. **Run it; do not write a Playwright
script to do what it already does.**

```sh
node tools/e2e/audit.js --list                     # the group names
node tools/e2e/audit.js --changed --json .audit/run.json
node tools/e2e/audit.js                            # both suites, every group (~50s)
node tools/e2e/audit.js --suite states --groups roster,dex
node tools/e2e/audit.js --concurrency 1            # serial, when debugging a group
```

`--changed` maps the diff to the groups it could have broken (`tools/e2e/scope.js`);
a shared file — `index.html`, `css/`, `core.js`, `router.js`, `init.js`, `data.js` —
or any file not in that map runs everything, so it never quietly under-tests.

Two suites sit behind it: `states.js` (the whole app — every tab cold and lived-in,
breed results, picker, pal modal, roster editor and its validation error, planner
route/odds/saved-plan tree, map marker and spawn overlay, toasts, the mobile pass)
and `a11y.js` (the save reader's own states). Each is a list of groups; each group
runs in its own context, seeded before the first paint, six at a time.

**Read the artifact, don't re-run.** `--json` writes every check as
`{group, ok, message}` in `results[]`, with axe rule ids under `violations`,
overflowing widths under `bad`, and measured rects on the focus checks. It stamps
the `commit` and `dirty` tree it described — if those match what you are reviewing,
the file is current and a second run is waste.

A state neither suite reaches is a missing group, not a reason to write a scratch
script: add it to `states.js` and it is covered from then on. A group that reports
UNREACHABLE means a redesign renamed a control it drives — fixing the suite is part
of that change, the same contract as the `SHELL` array in `sw.js`.

### Driving it yourself

For what the artifact cannot see — hierarchy, token compliance, density, visual
regressions — `tools/e2e/lib.js` is the harness (Playwright, installed in
`tools/node_modules`; never npm-install anything):

```js
const {open, problems, close} = require('/abs/path/tools/e2e/lib.js');
const h = await open({viewport: {width: 360, height: 740}, hash: 'roster',
                      storage: {palbreed_owned: JSON.stringify(['SheepBall'])}});
```

`open()` seeds localStorage before the app boots, captures console errors,
pageerrors and 404s, and blocks the service worker. `storage: {}` is a cold start.

Canonical viewports: **320 · 360 · 390 · 768 · 1366** (320 is the 1.4.10 reflow
floor). Lived-in state seeds through `palbreed_owned` (array of species keys),
`palbreed_roster`, `palbreed_plans`, `palbreed_tipseen='1'`. Deep links worth
exercising: `#/breed/SheepBall/ElecCat` · `#/pal/Anubis` ·
`#/plan/SheepBall+ElecCat/Anubis` · `#/map/ForestBoss`.

Measure claims (`getBoundingClientRect` / `getComputedStyle`); screenshot evidence
for visual claims; contrast ratios computed, not eyeballed.

### The two focus checks are not interchangeable

`tools/e2e/checks.js` exposes both. `focusSane` asks only whether focus **exists** —
it catches the `<body>` drop. `focusVisible` asks whether the user can **see** it:
at least half the control, or 24px, below the sticky header and inside the viewport.
Every hand-off that crosses tabs or is followed by an author-initiated scroll wants
the second one, because focus on a real control that a later `scrollIntoView`
carries off-screen passes the first and is still a 2.4.11 failure — which is how it
shipped twice.

Animations settle before `axe.run` (see `checks.js`); sampling mid-fade composites
every label over the scrim and flakes contrast checks.
