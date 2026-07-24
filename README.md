# Palarium

**A Palworld breeding studio** — calculator, reverse lookup, route planner, and roster manager in one fast, dark-themed static site. A personal fan project built as a friendlier alternative to existing breeding sites.

## Features

- **Breed** — pick two parents, see the exact child, with the breeding-power math shown (including the next-closest species that lose the tie). Handles unique combos and gender-dependent combos (e.g. Katress × Wixen).
- **Find Parents** — every parent pair that produces a target pal, with lock-a-parent, owned-only, and text filters. Pairs you can actually make (both species owned) sort first.
- **Planner** — pick up to 4 starting pals (each slot takes the passives it carries) and a target species, plus an optional **desired passives** goal set; get the shortest breeding chain, preferring species you own as partners, with per-step inheritance odds and an expected-egg total (partners you own in the roster contribute their recorded passives to the pool; generic partners are assumed passive-free). Auto-recomputes as you tweak inputs. Save plans as step-by-step checklists; routes are shareable links (`#/plan/A+B/Target`). Warns when a merge pairs two same-gender pals from your roster or when no starter carries a desired passive.
- **Roster** — your actual pals: species, gender, nickname, passives (full autocomplete), IVs, notes. Searchable, sortable, filterable; JSON export/import backup. Deleting the last of a species offers to un-star it.
- **Breedable now** — everything you can breed in one step from pals you own, with a "new species only" filter. Click a result to expand your pairs inline, with gender-feasibility warnings from roster data.
- **Paldex** — all 299 pals (including Terraria collab), sortable and filterable by element and work suitability, with full pal cards (stats, partner skill ranks, drops, egg type) — plus a browsable list of all 251 unique combos.
- **Guide** — breeding mechanics explained twice: ELI5 and deep-dive, including egg mutations (1%/3%) and the mutation-exclusive passives.
- **Breeding trees** — planner routes render as branching tree diagrams; merge steps show approximate passive-inheritance odds.
- **Shareable URLs** — calcs, pal cards and planner routes are linkable (`#/breed/Lamball/PinkCat`, `#/pal/Anubis`, `#/plan/SheepBall+ElecCat/Anubis`); browser back/forward navigates tabs, including in-app jumps.
- **PWA** — installable on phone/desktop and fully offline once loaded (service worker; network-first shell, cached icons). Mobile keeps a single-row, horizontally scrollable tab bar and an icon-grid pal picker.
- **Accessible** — WCAG 2.0/2.1 A+AA clean under axe-core in every UI state; fully keyboard-operable with managed focus, including arrow-key tablists.
- **Ownership model** — ★ stars mark species you own; the Roster tracks individual pals. Every "Owned" filter reads both (stars ∪ roster). Pal pickers show ★ and a Recent section; a dismissible first-visit tip bar teaches the basics.

## Running it

It's a fully static site with no build step and no network dependency (icons are bundled):

- **Locally:** open `index.html` in a browser.
- **Hosted:** serve the folder from any static host (GitHub Pages: Settings → Pages → deploy from branch, root).

All user data (roster, plans, owned list) lives in the browser's localStorage — it does **not** transfer between origins (e.g. local file vs. hosted site). Use Roster → Export/Import to move it.

## Data provenance

- Pal stats, breeding data (CombiRank / unique-combo tables), passive skills, and icons were extracted from [palpedia.net](https://www.palpedia.net)'s public site bundles (game version 1.0.0).
- The breeding engine is a faithful port of the in-game logic: unique combos first, else the species whose breeding power is closest to `floor((A + B + 1) / 2)`, ties broken by higher `combiDuplicatePriority`; `ignoreCombi` pals and unique-combo children are excluded as averaging results.
- Palworld and all pal names/images © Pocketpair, Inc. This is an unaffiliated fan tool.

## Structure

```
index.html      markup
css/style.css   styles
js/data.js      generated dataset (pals, combos, passives) — window.PALDATA
js/app.js       all app logic (vanilla JS, no dependencies)
assets/pals/    pal icons (299)
```

To refresh data after a game update, re-extract from palpedia's Next.js chunks and regenerate `js/data.js` (`window.PALDATA = {...}`) — the pal database lives in a `JSON.parse('...')` blob in their bundled chunks, unique combos in the breeding page chunk, passives in the passive-skills page chunk.
