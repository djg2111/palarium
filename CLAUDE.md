# Palarium — project instructions

Static vanilla-JS Palworld breeding tool. No build step, no dependencies, dark-only,
offline PWA. `index.html` (markup) · `js/*.js` (logic, one file per view — see
README) · `css/style.css` · `js/data.js`, `js/mapdata.js`, `js/spawndata.js`
(generated — regenerate via `tools/`, never hand-edit) · `sw.js` · `assets/pals/`.

The logic files are classic `<script>`s sharing one global scope, loaded in the
order listed at the bottom of `index.html`. That order is a real contract: a file
may call anything defined in an earlier file, but top-level code must not reach
forward into a later one. Not ES modules — `type="module"` is CORS-blocked over
`file://`, and the app must keep working opened straight off disk.

Serve with `python -m http.server 8848` — the port `tools/e2e` expects — or open
`index.html` directly. Syntax check: `node --check js/<file>.js`. Browser regression
suite: `tools/e2e/` (Playwright + axe-core, already installed in `tools/node_modules`
— never npm-install a browser harness elsewhere). `node tools/e2e/states.js` runs the
whole-app axe/overflow/focus matrix — **run it before committing any UI change**;
`node tools/e2e/a11y.js` runs the save reader's. Both are lists of self-contained
state groups over one runner, `tools/e2e/audit.js`, which is also the command line:
`--list` names the groups, `--changed` runs only the groups the current diff can
have broken (mapping in `tools/e2e/scope.js`; a shared or unmapped file runs
everything), `--groups a,b` picks by hand, `--json <path>` writes the results so one
run can answer several reviewers instead of each driving its own browser. Groups run
six at a time; both suites take ~50s. Adding a view means adding a group to the suite
**and** a line to `scope.js`. The suites reach states through deep links and the fixed ids in
`index.html`; renaming an id a suite drives means updating the suite in the same
commit — the same contract as `index.html` + the `SHELL` array in `sw.js` (plus
bumping `VERSION`) when adding a JS file. Synthetic save fixtures live in `tests/`
(`tools/make-fixture.js`).

## Design workflow (this is the point — follow it)

`DESIGN.md` is the binding design standard (tokens, component tiers, copy lexicon,
WCAG commitments). For any user-facing change:

1. **New feature, new view, or flow rework** → run the **ux-designer** agent first
   and implement its spec. Don't design ad hoc in the main loop.
2. **Implement** following DESIGN.md: reuse canon components (§4), tokens only (§1),
   copy lexicon (§6), icon policy (§7 — game assets first, Lucide SVG for generic
   UI, no new emoji). No new one-off styles without documenting them in DESIGN.md in
   the same change.
3. **Before committing UI changes** → run the audit once, from here, then hand both
   reviewers the artifact:

   ```bash
   node tools/e2e/audit.js --changed --json .audit/run.json
   ```

   Then run **design-reviewer** and **a11y-auditor** in parallel; both read
   `.audit/run.json` rather than driving their own browser. Running it here is what
   makes that true — two agents starting together would each find no artifact and
   each run the matrix, which is the duplication this replaced. Fix P0/P1 findings
   and any a11y FAIL before commit; note deliberately skipped P2/P3 in the commit
   message.
4. If a change makes DESIGN.md wrong, amend DESIGN.md in the same commit.

Trivial non-visual changes (data regen, README, comments) skip the agents.

## Hard constraints

- Vanilla JS, no frameworks, no build step, no CDN/network assets (offline PWA).
- axe-core must stay clean (WCAG 2.1 A+AA) in every state; keyboard operability and
  focus management must not regress. WCAG 2.2 AA for new work (targets ≥24px, drag
  alternatives, focus not obscured).
- Breeding math and dataset are correct — out of scope for UI work.
- All user data is localStorage (`palbreed*` keys); never break existing stored state
  without a migration.

## Conventions

- Commit style: short imperative subject, body explains the why (see git log).
- Deep links: `#/breed/A/B`, `#/pal/K`, `#/plan/A+B/T` — keys or display names.
- Test both cold start and a lived-in state (seed keys: DESIGN.md §10).
