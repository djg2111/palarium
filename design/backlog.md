# 11 · Known-clunky backlog

The live backlog of flows known to need rework — ux-designer starts here. Split
out of DESIGN.md because only ux-designer reads it. Section numbers are
canonical repo-wide: "DESIGN.md §11" means this file.

---

## 11 · Known-clunky backlog (ux-designer: start here)

- **The Paldex table is 598 tab stops** — 299 `tr[tabindex="0"]` rows plus 299
  stars — in the same view whose gallery is **one**, over the same 299 species.
  §4 settles that a grid board is one stop, but a data table is a different
  component and the rule does not simply transfer: rows also carry AT's own
  table-navigation mode. It cannot be halved either — a `.star` inside a `<td>`
  becomes keyboard-unreachable the moment it goes to `-1` unless a roving model
  owns the row too. Note the rows are `role="row"` carrying `tabindex="0"`, an
  `aria-label` and their own Enter/Space handler: a custom widget on a
  non-interactive role. axe is clean, so it is not a gate — but "make only the
  name cell a button, as `.dextile-open` already is" is the option that removes
  that as well as the stops.

- **Nine Guide sentences run 26–36 words against §6's 25-word longform cap.**
  Measured over `#view-guide`'s `p`/`li` with the same per-sentence splitter the
  save reader was cleared with; the longest is the "Not every pal can be a 'math
  result'…" bullet at 36. All pre-existing. Splitting them is copy work, not a
  spec — logged so the cap has a record rather than a silent exception.

- **The Guide's Deep dive hides 82% of itself behind five presses** — 6,399
  characters across six `<details>`, of which 1,143 are visible at rest, and
  nothing persists across a reload. It also has no per-section address: the app
  navigates to `#g-mutations` itself (Breed's footnote does), but a reader
  cannot link to one. Wants an `Expand all` and a `#/guide/<id>` route, at which
  point Breed's footnote becomes a plain hash navigation.
- **Should a `<summary>` carry an `<h3>`?** The Guide is 1,440 words behind two
  headings, so heading navigation gets "Breeding, start here" and "Deep dive"
  and nothing about which of six sections is which. Wrapping the summary text in
  an `<h3>` was measured in Chrome to keep `role=DisclosureTriangle`, `expanded`,
  the accessible name and Enter/Space — while adding six level-3 landmarks. It
  collides with §4's reasoning for `.cardopen` ("buried an `h3` in a button"),
  so this needs a §4 ruling, not a patch.
- **The partner-skill list is 999 tab stops fully paged** — 299 pal links, 421
  tag chips, 249 rank disclosures and 30 controls. This is **not** the Paldex
  table's question (§11 above): that is a data table with AT's own navigation
  mode and two stops per uniform row. Nor is `.skillgrid` a §4 grid board —
  `.dextile`, `.combo` and `.rostile` are each one press target, while a
  `.skillcard` holds a pal link, up to four independent tag-filter chips and a
  disclosure, so a roving `tabindex` over cards cannot reach three kinds of
  control without a second axis. The cheap 40% is a roving `role="toolbar"` on
  each card's tag row, which `rovingRow` already does elsewhere: −421 stops for
  +53.
- **The two sections page by item count, at a threshold no user can see.**
  Measured at 360: one page of partner skills (60 cards) is **15,064px** —
  *longer* than the entire unpaginated Passives section at 12,975px. Meanwhile
  the Paldex renders 299 items in 9,553px with no pager at all. Card height, not
  list length, is what decides whether a list needs paging, so a page size
  counted in cards will always drift. Paging by scroll distance (~6–8 viewports)
  would give both sections the same rule and put the mobile pager before the
  19th screen instead of after it.

- **`#mapCount` and `#mapResults` answer the same query differently.**
  `mapSyncMarkers` counts only the current layer; `mapRenderResults` searches
  across layers by design. Measured: "Celesdir" announces *1 species · 1 place*
  in the live region while three marker buttons sit 8px above it, two of them
  tagged *World Tree*. The empty case is worse — the only actionable sentence
  ("Nothing matches ... — try a pal or waypoint name") is in the results row,
  not the live region, so AT hears "0 places" and nothing to do about it.
- **The map's 123 region names have no textual route.** `#mapRegions` is
  `aria-hidden` and `mapMatch` tests only marker label, boss and pal name, so
  searching a real region ("Bamboo Groves") returns nothing. The input's label
  says "pal or waypoint", so nothing is over-promised — but a whole layer of
  named places is sighted-only.
- **Five words for one concept on the Map**: the fast-travel statue is
  *Waypoints* (filter chip), *Fast travel point* (every marker's accessible
  name), *fast travel statues* (title), *Closest/Best fast travel* (panel), and
  *statue* (footnote). Pick one — *waypoint* matches the chip the user sets —
  and add it to §6's lexicon.

- **Find parents is dominated by Terraria collab species, with no way to filter
  them.** Measured over the full pair lists: **22 of Lamball's 30 pairs (73%)**
  and **44 of Chikipi's 46 (96%)** need a collab pal, and they crowd the tiers a
  player is most likely to read — one group under *Both parents missing* was
  eleven collab partners in a row. The Planner already owns this problem and
  solves it with the `No Terraria collab partners` switch (`avoidCollab`), because
  those species can't be caught in every game version. Find parents needs the
  same escape, and the design questions are real: filter or de-prioritise, share
  `avoidCollab` with the Planner or keep a separate control, and what the status
  sentence says once a filter can empty a tier. Needs a spec before code.

- **`#smPick`'s two choice rows are the quietest "forward" on any view**: fill 1.10:1
  and border 1.36:1 against the dialog surface, since a route-choice view carries no
  primary button (§4). Legal — the rows are identified by their text, and hover
  (7.66:1) and focus (14.64:1) both clear 3:1 — but if any route-choice view ever
  grows past two options, the resting affordance needs revisiting first.

- **`pretty()` leaves the index glued to internal item ids.** The card's drop chips
  read `Pal Upgrade Stone3`, `Exp Boost 04`, `World Tree Relic 01`, `Technology
  Book G2`. `pretty()` (`js/core.js`) splits camelCase and underscores but has no
  rule for a trailing number, and it can't get one blindly — `Exp Boost 04` wants
  the digits dropped, `Technology Book G2` does not, and some are genuine tiers the
  player sees in-game. Wants a small display-name map in `tools/`, generated
  against the item table, not a regex.

- **"In your roster" names a species-scoped fact and shows one individual.** Open a
  card from a roster row when you hold two of that species and you get the entry
  you clicked, under a heading that reads as though it covers your roster. §6 keeps
  species and pal apart everywhere else. `Your "Woolly"` or `This pal` says what it
  is, but the honest fix may be listing the siblings — which is a layout question
  inside an already long card, so it needs a spec.

- **The toast dwell is not a conformant 2.2.1 "extend" mechanism, deliberately.**
  Hover and focus pause it and re-arm the full duration, and Alt+Z reaches it,
  but 3.5s/8s with no warning is not the 20-second-plus-ten-extensions the SC
  describes. §4's "feedback ≤8s" is the standing position and Undo is never the
  only route to the action — recorded here so it stays a decision rather than an
  oversight.
