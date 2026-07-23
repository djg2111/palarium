# Palarium

**A Palworld breeding studio** — calculator, reverse lookup, route planner, and roster manager in one fast, dark-themed static site. A personal fan project built as a friendlier alternative to existing breeding sites.

## Features

- **Breed** — pick two parents, see the exact child, with the breeding-power math shown. Handles unique combos and gender-dependent combos (e.g. Katress × Wixen).
- **Find Parents** — every parent pair that produces a target pal, with lock-a-parent, owned-only, and text filters.
- **Planner** — pick up to 4 starting pals (merging their passives into one line, trying every merge order) and a target species; get the shortest breeding chain, preferring species you own as partners. Save plans as step-by-step checklists. Warns when a merge pairs two same-gender pals from your roster.
- **Roster** — your actual pals: species, gender, nickname, passives (full autocomplete), IVs, notes. Searchable, sortable, filterable; JSON export/import backup.
- **Paldex** — all 299 pals (including Terraria collab), sortable and filterable by element and work suitability, with full pal cards (stats, partner skill ranks, drops).
- **Guide** — breeding mechanics explained twice: ELI5 and deep-dive.

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
