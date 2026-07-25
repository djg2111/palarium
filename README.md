# Palarium

**A Palworld breeding studio** — calculator, reverse lookup, route planner, and roster manager in one fast, dark-themed static site. A personal fan project built as a friendlier alternative to existing breeding sites.

## Features

- **Breed** — pick two parents, see the exact child, with the breeding-power math shown (including the next-closest species that lose the tie). Handles unique combos and gender-dependent combos (e.g. Katress × Wixen).
- **Find Parents** — every parent pair that produces a target pal, with lock-a-parent, owned-only, and text filters. Pairs you can actually make (both species owned) sort first.
- **Planner** — pick up to 4 starting pals (each slot takes the passives it carries) and a target species, plus an optional **desired passives** goal set; get the shortest breeding chain, preferring species you own as partners, with per-step inheritance odds and an expected-egg total (partners you own in the roster contribute their recorded passives to the pool; generic partners are assumed passive-free). Auto-recomputes as you tweak inputs. Save plans as step-by-step checklists; routes are shareable links (`#/plan/A+B/Target`). Warns when a merge pairs two same-gender pals from your roster or when no starter carries a desired passive.
- **Roster** — your actual pals: species, gender, nickname, passives (full autocomplete), IVs, notes. Searchable, sortable, filterable; JSON export/import backup. Deleting the last of a species offers to un-star it.
- **Breedable now** — everything you can breed in one step from pals you own, with a "new species only" filter. Click a result to expand your pairs inline, with gender-feasibility warnings from roster data.
- **Paldex** — all 299 pals (including Terraria collab), sortable and filterable by element and work suitability, with full pal cards (stats, partner skill ranks, drops, egg type) — plus a browsable list of all 250 unique combos, filterable by whether a recipe needs two species or two of the same.
- **Map** — the game's own world map, tiled from the shipped textures, across both layers (Palpagos Islands and the World Tree interior). Pan/pinch/scroll, filter, and search.
  - **Markers**: 152 fast-travel statues, 90 field alphas (icon, species, level), every syndicate tower, and 123 named regions that reveal themselves as you zoom. Waypoint and tower markers are the game's own compass icons.
  - **Labels declutter themselves.** *Auto* ranks names (towers → waypoints → alphas → regions), tries four anchor positions for each, and drops any that still collide — with marker icons treated as obstacles, so a name never lands on a pin. *All* shows everything, *Off* shows nothing; hovering a marker always reveals its name regardless. At one representative zoom that's 55 names with zero overlaps, against 82 names and 24 overlaps unmanaged.
  - The tile pyramid runs to the source's native 8192px, so maximum zoom shows 1:1 pixels and never upscales; the downscaled levels below it carry an unsharp mask. That native level is 41 MB of the 64 — `tools/z4-requant.js` re-encodes it to q95 (41 → 16 MB, imperceptible at 1:1) if the repo size ever matters more than the last fraction of fidelity.
  - **Spawn zones**: drawn as a union with a hard edge rather than a flat wash (a low-opacity tint disappears over open water and pale sand), and **shaded by how much of each area's spawn table the pal actually is** — the weights were already in the game data. Brighter means more common. Pick any of **272 species** and its wild spawn areas are drawn as blobs — 7,847 spawner placements from `DT_PalSpawnerPlacement`, with level band and night-only flag. Search a pal by name, or hit **Find in the wild** on any pal card.
  - **Where to warp**: selecting an alpha or tower lists the three closest fast-travel points with distances and draws a line to the nearest. Selecting a *species* instead ranks statues by how many of its spawn areas are within 1.2 km — the answer to "where do I actually go to catch one".
  - The 18 species with no spawner anywhere (raid bosses, sub-species, collab pals) say so plainly and link to Find Parents.
  - Everything is linkable: `#/map/<marker-id>`, `#/map/spawn/<pal>`.
- **Guide** — breeding mechanics explained twice: ELI5 and deep-dive, including egg mutations (1%/3%) and the mutation-exclusive passives.
- **Breeding trees** — planner routes render as branching tree diagrams; merge steps show approximate passive-inheritance odds.
- **Shareable URLs** — calcs, pal cards and planner routes are linkable (`#/breed/Lamball/PinkCat`, `#/pal/Anubis`, `#/plan/SheepBall+ElecCat/Anubis`); browser back/forward navigates tabs, including in-app jumps.
- **PWA** — installable on phone/desktop and fully offline once loaded (service worker; network-first shell, cached icons). Map tiles are cached as you view them rather than precached — 22 MB up front would be a poor trade for a tab you may never open. Mobile keeps a single-row, horizontally scrollable tab bar and an icon-grid pal picker.
- **Accessible** — WCAG 2.0/2.1 A+AA clean under axe-core in every UI state; fully keyboard-operable with managed focus, including arrow-key tablists.
- **Game icons throughout** — elements, work suitability, passive skills, eggs, inventory items and map markers are all the game's own art, including inside the filter dropdowns (a native `<option>` can't hold an image, so those are an ARIA 1.2 combobox over the original `<select>`, which stays as the state).
- **Ownership model** — ★ stars mark species you own; the Roster tracks individual pals. Every "Owned" filter reads both (stars ∪ roster). Pal pickers show ★ and a Recent section; a dismissible first-visit tip bar teaches the basics.

## Running it

It's a fully static site with no build step and no network dependency (icons are bundled):

- **Locally:** open `index.html` in a browser.
- **Hosted:** serve the folder from any static host (GitHub Pages: Settings → Pages → deploy from branch, root).

All user data (roster, plans, owned list) lives in the browser's localStorage — it does **not** transfer between origins (e.g. local file vs. hosted site). Use Roster → Export/Import to move it.

## Data provenance

- Pal stats, breeding data (CombiRank / unique-combo tables), pal icons, element and work-suitability icons, item icons, wild spawn zones, region names and the world map are all extracted **directly from the game's own data tables and textures** (Palworld 1.0.1, Steam). No third-party site is used as a source. The pipeline lives in [`tools/`](tools/) — see [`tools/README.md`](tools/README.md) to regenerate after a game update.
- One field is still inherited from the pre-1.0 dataset: partner-skill *rank* tables (`ps.rl`/`ps.re`). The values exist in `DT_PassiveSkill_Main` but the pal→skill linkage isn't in any data table — see [`tools/README.md`](tools/README.md). It only feeds a display table on the pal card; nothing about breeding depends on it.
- The breeding engine is a faithful port of the in-game logic: unique combos first, else the species whose breeding power is closest to `floor((A + B + 1) / 2)`, ties broken by higher `combiDuplicatePriority`; `ignoreCombi` pals and unique-combo children are excluded as averaging results.
- The game files also contain 28 unreleased pals that are deliberately excluded — importing them would add phantom species. Documented in [`docs/unreleased-pals.md`](docs/unreleased-pals.md).
- Palworld and all pal names/images © Pocketpair, Inc. This is an unaffiliated fan tool.

## Structure

```
index.html      markup
css/style.css   styles
js/data.js      generated dataset (pals, combos, passives) — window.PALDATA
js/mapdata.js   generated map markers, regions + layer bounds — window.MAPDATA
js/spawndata.js generated wild spawn zones (loaded on demand) — window.SPAWNDATA
js/app.js       all app logic (vanilla JS, no dependencies)
assets/pals/    pal icons (299, lossless WebP)
assets/map/     map tile pyramid (170 lossless WebP tiles, z0–z3)
assets/ui/      element, work, map-marker, passive-skill and egg icons (lossless WebP)
assets/items/   inventory item icons for drops and recipes (lossless WebP)
tools/          extraction + generation pipeline (not part of the site)
docs/           notes on the extracted data
```

The site itself still has **no build step** — `tools/` is only run by hand when the game updates. See [`tools/README.md`](tools/README.md) for the full runbook.
