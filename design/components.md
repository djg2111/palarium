# 4 · Components

The component canon, split out of DESIGN.md so that reviews which do not touch a
component need not read it. Section numbers are canonical repo-wide — code
comments cite "DESIGN.md §4" and mean this file. Do not renumber.

---

## 4 · Components

**Reuse-first rule: before styling anything, map it to an existing component class.
A new class requires a role no existing class covers — and gets documented here.**

Button tiers (one primary per view, never mix tiers inside one button group):

| Tier | Class | Look | Use |
|---|---|---|---|
| Primary | `.alink.primary` | solid `--accent` fill, `--ink` text, 700; hover `--accent-hover` | The one main action of a view/dialog |
| Secondary | `.alink` | `--surface` + `--border`, `--muted` text; hover accent border | Everything actionable but not primary |
| Destructive | `.alink.danger` | `--danger` text and `--danger-line` border; hover fills `--danger-tint` | The one destructive action of a view or bar. **Never `.alink.primary`** — a solid accent fill on a destructive default invites the mis-press the control exists to make safe |
| Quiet/tertiary | `.tx`, `.thbtn`, text-styled buttons | no border until hover | Dismiss, inline meta actions |
| Icon | `.star`, `.tvp-ctrl button`, `.mnav`, `.close` | square/round, ≥24px hit area | Single-glyph actions, always `aria-label` |
| Switch | `.toggle` (+ `.kn`) | pill + knob, `role="switch"` | Boolean filters/options; label states the *outcome*, and the outcome it names must be the one it delivers — "Pairs I can make" became **"Pairs from pals I own"** because it kept gender-blocked pairs, which §4's own band rule says are not pairs you can make |
| Segmented | `.segrow`, `.srcrow` | joined buttons, one `.on` | Mutually exclusive small sets |

Required state coverage for every interactive element: default · hover · focus-visible
(2px `--accent` outline, offset 2 — global rule exists, don't suppress it) · active ·
disabled (`opacity:.45`, no hover). Hover on touch devices must not gate any
information (see §8 tooltips).

Breed (one skeleton, four fillings — every result kind produces *status sentence →
card(s) → why → next → footnote*; the kind changes the copy and the card count,
never the shape):

| Class | Role |
|---|---|
| `.resline` | The one-sentence answer, in the heading block beside the `h2`, and the view's `aria-live="polite"` region. **Lives in `index.html` and is never rebuilt** — `renderBreed`'s `zone.innerHTML=''` would destroy the live region, and a re-inserted one announces unreliably. Update it with `replaceChildren`. While a breeding chain is active **and has more than one step**, the sentence carries a leading `Step N of M: ` clause — inside a chain the answer only means something relative to the step, and the step count has nowhere else to be announced (`#chainTtl` is the card's accessible name, not a live region, and focus deliberately stays on the nav button after a step). A second live region on the card was rejected: two polite regions changing on the same press are read as two disconnected utterances. Whether the chain is still live must be answered **before** the sentence is written — `chainStep(a, b)` — or a picker change announces a step the pickers have already left. |
| `.resrail` | The secondary column beside the answer: `.slotlb` "why" label, `.sub` reasoning, `.linkrow` next steps, then the footnote. Two columns above 900px, stacked below. |
| `.result-zone` / `.result-zone.two` | The answer grid. `.two` is the gender kind — two equal card columns with the rail spanning `1/-1` beneath. |
| `.cardopen` | A whole-card press target laid **over** the card (`position:absolute;inset:0`), never wrapped around it. `role="button"` on the card itself made its `aria-label` replace every heading and chip inside, and buried an `h3` in a button. Same idea as `.dextile-open`, different family. It must be `pointer-events:none` with the click handler on the **card** — as the only positioned descendant it otherwise hit-tests above every chip, silently killing their tooltips and text selection. Keyboard activation of the button bubbles a click to the card, so both routes still work. |
| `.gtag` | The condition line on a gender-combo card ("If Katress is ♂ and Wixen is ♀"). It is the **only** thing telling the two cards apart, so it leads the body at `--fs-md`/`--text-2` — not a footnote under the chips. |
| `.chaincard` | The Planner's route, opened one step at a time in Breed. Spans `1/-1` under the answer. A `role="group"` with `tabindex="-1"` labelled by its own title, because **every route into and out of it destroys the control that was pressed**: the Planner's `↗` is on a tab this navigation hides, and Prev/Next step rebuild the whole card. Focusing the card announces which step you landed on; the nav buttons re-focus the same direction after a step, and the opposite one at the end of the chain where their own press has just disabled them. |

Write `×` between two pal names as a visible `aria-hidden` glyph plus an `.sr-only`
"and": NVDA reads U+00D7 as "times", which turns a sentence into arithmetic.

Find parents:

| Class | Role |
|---|---|
| `.pgroup` | One parent and every partner that pairs with it. A `<li>` holding an `.anchor` button (opens that species' card) and a `role="toolbar"` `.chiprow` of `.tchip` partner buttons (each opens that pair in Breed). **Two tab stops per row**, as a roster row. Replaces one `.pair` per combination, which repeated the same left parent up to 21 rows running and carried a badge that stole width from both names. Groups are cut by greedy set cover — take the species covering the most remaining pairs — with ties broken on Paldex order so the same roster always renders the same. |
| `.resline` (Find parents) | The status sentence, same contract as Breed's. Its **"of the N shown" clause only ever qualifies a tier count** — a branch whose numerator is already the shown count has nothing to compare itself to, and printing both read "2 of the 2 shown pairs make Lamball". Under the owned filter the clause is dropped entirely: every shown pair uses pals you own by definition, so the old predicate measured the set against itself. Where a fraction is printed, the **noun follows the denominator and the verb follows the numerator** — "1 of the 2 shown pairs uses pals you own". |
| `<h3 class="slotlb">` band | The ownership tier: `Breed now` · `Blocked by gender` · `One parent missing` · `Both parents missing`, each carrying its pair count and, when truncated, `showing N of M parents`. Bands render only when two or more tiers are non-empty. This replaces a sort that was real but invisible, and announced only in prose. **A pair whose genders can't work is not in `Breed now`** — owning both species isn't the same as being able to breed them, and counting them together made the headline sentence false. |
| `.tchip.warn` | A partner chip whose pair is blocked — `--danger` text, tint fill, `--danger-line` border, a `.wglyph` triangle, and the reason in **visible** `.why` text. The reason also goes in the chip's `aria-label`, and must **not** be an `.sr-only` child: `aria-label` prunes the subtree, so a hidden span in there is never announced. The pal art stays (§7 tier 1) — swapping it for the triangle cost the recognition the row is scanned by, and made warn chips 3px shorter than their siblings. |
| `.pgroup .x` | The `×` between anchor and chips, `aria-hidden`. **Hidden at ≤640**, where the chips wrap to their own line and it parks in the card's top-right corner reading as a close button. |

`.pgroup .tchip` fills `--raised` — the only `.tchip` in the app lighter than its
parent, because here the parent is a `--surface` card and §1's ladder is
bg → surface → raised. Don't "fix" it back to the `--bg` base.

**`.tchip` is the pal chip everywhere, including the Planner's quick-add strip.**
That strip had its own `.spal` and `.strip` — the same component and the same
row, 1–1.5px apart, under a second name — and the saved-plan progress pill had
its own `.prog` for a job `.mchip` already did. They are gone: the strip is a
`.chiprow` of `.tchip`, the pill is an `.mchip`, and `button.tchip` carries the
pointer/hover recipe once instead of `.pgroup` and `.needrow` each declaring it.
The pill did **change** — pill radius, `--bg` fill, a `--border-strong` hairline
and weight 600, where `.prog` was a `--r-sm` `--raised` block — which is the
point: it now matches the `.mchip.warn` and `.pchip` beside it. One property the
strip cannot inherit is `.tchip`'s `white-space:nowrap`: a nickname is free text
with no length cap, and at 320 a 38-character one floored the chip at its
min-content width and pushed the page to 322. It wraps at ≤640, like
`.needrow .tchip`.

**A badge that is constant across a list is a property of the result set, not of a
row.** Measured over all 299 targets: no target mixes `avg` with `unique`/`gender`,
so a Find parents badge column read `UNIQUE` on every row or nothing on every row
but one. It belongs in the status line, and the one exception (`SAME SPECIES`)
says itself once the names stop truncating.

Planner (a form that computes itself, so the result has no press to correlate it to):

| Class | Role |
|---|---|
| `.plansec` | A numbered section band ("1 · Starting pals"). Uppercase, `--accent`, trailing rule. |
| `.slot` / `.slotlb` | One dashed form slot and its micro-label. Start slots reveal progressively: only the next empty one shows, and a slot's passive input only once its species is chosen. |
| `.slotgrid` | The start-slot row. `repeat(auto-**fill**, minmax(220px,1fr))` — **never `auto-fit`**, which collapses the tracks the hidden slots would have taken, so slot 1 alone rendered as a 1106px picker and filling it halved the width of the control under the user's cursor (−559px at 1366, −409px at 900, −343px at 768). `auto-fill` keeps the tracks sized and the row still. Fixed `repeat(4,…)` would hold it still too, but at 900 that is four 192.5px tracks — under the rule's own 220px minimum — so the *column count* still has to be responsive while the *track size* does not. **Any grid whose items reveal progressively wants `auto-fill`.** |
| `#clearSlots` | `✕ Clear start pals` — **section 1 only**: the start pals and the passives to carry. It used to clear the target as well, a control in one section band reaching into the next. Nothing became unreachable: the target picker owns a `.pclear` beside it. Destructive, so it follows the canon pattern — do it, say so, offer Undo — and the toast **names both halves** (`Start pals and carry passives cleared`), because the button's label names one and a `title` is not a warning on touch. With nothing in section 1 to clear it **says so** rather than doing nothing silently, which the target-out-of-scope change made a reachable state. |
| `.rstep` | One route step — the skeleton Breed's chain card shares. Its `×` and `→` are `aria-hidden` with spoken "and"/"make" beside them. It carries **no "passive carrier line" tag**: that is a property of the route, not the step, so it read identically on every row of a carrying route — the same thing §4 settles for Find parents' badge column. `.rsummary` says it once (`carrying: …`), and the per-step signal that actually varies is the odds badge. |
| `.tvp` | The route-tree viewport. `touch-action:pan-y`, **not `none`**: it is 23% of the viewport height at 360 and sits in the page's scroll path, so `none` meant a vertical swipe starting anywhere on the tree scrolled nothing. `pan-y` returns vertical swipes to the page and keeps the horizontal pan these trees actually need — they are wide, not tall — and pinch still reaches the app, since `pan-y` does not imply `pinch-zoom`. **`pan-y` costs a cancel-revert and cannot ship without it**: Chrome delivers one or two `pointermove`s before it claims the gesture, and those are already written into `ty`, so every vertical swipe nudged the tree ~24px and six emptied the viewport. `pointercancel` is the browser saying the gesture was never the app's — restore the transform snapshot taken at `pointerdown`. |
| `.wildinfo` family | The catch panel behind `Where?`, with its own `.accb` difficulty tier. |
| `.resline` `#planStatus` | The view's one sentence, **in the markup and never rebuilt**. The route computes 600ms after the last input change, so nothing the user pressed correlates to it appearing — without this the whole result arrived silently. Says the step count and what is carried, the no-route sentence, or the empty-form prompt. **Invariant: the clause after `carrying` is what the route actually delivers (`wo.carry`), is never longer than four names, and is omitted when empty.** Every branch that renders a result writes it — the "already is the target" branch used to return early and leave the previous route's claim standing. |
| `#carryRow` | A `.slot` — the same dashed card every other field group in this view uses; as a bare block between six cards its label read as a section heading. The passive goal, in § 1 with the passives it governs — it is a function of the start slots directly above it, not of the target species, and at 350px (1366) / 668px (360) away in § 2 the problem was created long before the control that solves it came into view. A pal has **four passive slots**, so a route carries at most four. When the starters' distinct passives exceed that and the user has picked nothing, the app **states the cap** rather than claiming a pal the game cannot produce: the route still renders in full, and only the passive claim withdraws — no chips, no odds, no expected-eggs line, one `.alink` back to the row. It does not auto-pick four. With eight distinct passives there are 70 candidate subsets and no signal which is wanted, and a machine-made choice would then be *priced* — `≈22%/egg` for four passives the user never chose is a more confident wrong answer than none. Not a `.warnbox`: nothing is wrong, a choice is waiting (§6 — never scold). **"Has the user chosen?" is stored (`dpc`), not inferred from an empty picker**: empty means "carry everything that fits" before a choice and "carry nothing" after one, and conflating them made un-pressing the last chip silently re-carry the whole union. A save written before `dpc` migrates on a non-empty `dp`, which was the only way to say "these specific ones". |
| `.pset[aria-pressed]` | The carry chips: the roster editor's Reuse row as a **toggle**, not add-and-vanish. A chip that disappears under a finger reflows the row mid-tap. **`aria-pressed` states what the route is carrying, which before an explicit choice is the whole union — not what is in the picker.** Reading the picker instead made every chip say "not pressed" for passives the status line, the summary and the hint all said were being carried, and pressing one seeded from the empty set, so "turn Swift on" turned the other two *off* (4.1.2 **Value**). At four the rest go **`aria-disabled`, never `disabled`** — a real `disabled` drops the chip out of AT's reach, so it announced "unavailable" with no reason and could take the row's single roving tab stop with it. A refused press still **says so**, like the combobox 40px away: a refusal with no words is indistinguishable from a broken control. One tab stop via `rovingRow`; up to 16 chips would otherwise cost 16. **The toolbar is the single chip display** — `#carryPass .pchips` is hidden, because it renders the identical pill and every carried passive appeared twice, 40px apart, one toggling and one removing. |
| `#carryHint` | The consequence line, reached by AT through `aria-describedby` on the combobox input (3.3.2). **Never `aria-live`** — it changes on every recompute. |

The passive tag input (`makePassivePicker`, five instances in this view alone) is a
**declared combobox**: `role="combobox"` + `aria-expanded` + `aria-controls` on the
input, `role="listbox"` on the popup, `role="option"` + `aria-activedescendant` on
the rows. Its rows and the popup itself are `tabIndex=-1` — arrows and Enter drive
the list, and with 30 real tab stops the close-on-blur timer destroyed whichever
row a user had just tabbed onto, dropping focus on `<body>` on the way out.

Other canon components: `.pcard` (view card), `.hint` (empty state — must include a
next action; **a view with a persistent status line puts its empty-state sentence
there instead**, or the sentence is announced twice — Breed does this), `.warnbox` (inline warning), `.toast` (feedback ≤8s, with Undo for
destructive; **12s when one Undo covers more than one record**, and the dwell
pauses while the toast has hover or focus so a toast you have just reached
cannot expire under your hands), `.pchip` (passive), `.tchip` (pal chip), `.badge` (outcome kinds),
`.mchip` (meta), `.picker` (pal select), `.ptag` (tag input), `.needrow`, `.rsummary`
(the route's headline — prints **what the route actually delivers**, never the
requested goal and never more than four passives; its label is invariantly
`carrying:`, since the old `goal:` branch named the same fact under a second word).

**A segmented choice whose options differ in consequence carries one visible line
under it, naming the consequence of the selection** — sized to the block it
explains (`--fs-md` under a dialog section, `--fs-sm` inside a conflict row where
its siblings are `--fs-sm`), not to a single global value — `#smBackupEffect` for restore
mode, `.confeff` for a save-reader conflict. A `title` per option is not enough:
touch has no hover, and these are the controls deciding whether a nickname
survives. The line is **not** a live region where its own renderer rebuilds it —
a re-inserted polite region announces unreliably (same reason as `.resline`).

`.worldlist` / `.worldbtn` — a vertical stack of **choice rows**. One row is a title
(`.wname`, optional leading 18px Lucide icon), a consequence line (`.wsub`), an
optional second `.wsub` caveat in `--muted`, and an optional faint detail (`.wpath`,
single-line, ellipsised). The whole row is the press target. The name and captions
reach AT either through `aria-labelledby`/`aria-describedby` (`#smPickList`, where the
copy is authored in the markup) or through a composed `aria-label` (`#smWorldList`,
where the caption is generated). Used for the two ways into the save reader and for
the worlds a folder produces — the same shape twice, so both screens read alike.

**A view whose whole job is choosing a route has no primary button** — the first
choice row is the recommendation. `#smPick` and `#smWorlds` are both this shape.
This is a deliberate reading of "one primary per view" as *at most* one, not at
least one: two `.alink.big` buttons side by side made the second look like a
lesser fallback, when it is simply the other route.

The picker's `@media(max-width:640px)` grid is a **second density of the species
tile, not a copy of `.dextile`** — measured, the two share three declarations
(column flex, centred art, centred name) and disagree on every other one. The
popover caps itself at `min(340px, 100vw - 24px)`, so its fixed `repeat(4,1fr)`
yields 74–85px tiles from 320 all the way up, which is what `auto-fill` would
compute anyway; and `.dextile`'s card border and `--surface` fill would be a card
drawn on an `--overlay` popover. Keep them separate, and keep the shared idea —
art over a centred name — reading the same at both densities.

Paldex (two views over one pipeline — recognising 299 distinct arts to mark
what you own, versus comparing seven columns of numbers; a grid cannot do the
second and a table is worst at the first):

| Class | Role |
|---|---|
| `.star` | The ownership toggle, in both Paldex views and on the pal card. Every visual and spoken property comes from one `paintStar(star, p)` (in `js/core.js`, because three views draw it) — a species can be owned two ways (starred here, or held in the roster), and the in-place branch that repaints without a re-render used to read `owned.has()` where the tile read `ownedSpeciesSet()`, leaving a hollow `☆` inside a gold owned tile. **A gold ring beside an empty ☆ reads as a broken control**, so the two must never be painted from different predicates. `aria-pressed` reports only "starred here"; the roster case is carried in words by the accessible name — never `aria-pressed="mixed"`, which means partially pressed. The glyph is the button's entire visual rendering, so it is a state indicator and takes `--muted`, not `--faint` (which measured 2.99:1 over the hover fill). |
| `.dexgrid` / `.dextile` | The species gallery and one species tile. `.dextile.on` is owned. `.dextile-open` is the whole-tile press target (`::after{inset:0}`); the `.star` sits above it as a sibling, never nested. Arrow keys move between tiles (roving `tabindex`), Tab reaches the focused tile's star — the same two-stops-per-item convention as a roster row. |
| `.viewseg` | The gallery/table switch. A `.segrow` pinned to the end of a heading block. |
| `.sr-only` | Visually hidden, still announced. **`.nativehide` is the opposite job** — it hides a control from AT while leaving it on screen. |

**Ownership is a ring and a filled ★, never a filter on the art.** The game greys
out un-captured pals; Palarium does not, because §7 forbids recolouring game
art and desaturating 260 of 299 tiles would destroy the recognition the grid
exists for. Owned = `--gold-line` ring + a filled ★, over a `--gold-tint` fill
that is 1.03:1 against the plain tile — the tint is atmosphere, not a signal,
and must never be counted as one of the redundant cues.

A species can be owned two ways, and the tile must not let them disagree: a
star set here (`owned`) and a pal held in the roster (`ownedSpeciesSet()`).
Roster-derived ownership renders `.star.viaroster` — same gold, lighter weight,
and an `aria-label` saying why — because a gold ring beside an empty ☆ reads
as a broken control.

Roster list (one layout, always grouped by species — a breeding roster is made of
siblings, so grouping is the shape of the data, not a preference):

| Class | Role |
|---|---|
| `.rosgrp` | One species section in **Rows** view: a `<section>` with an `<h3 class="rosband">` and its `.roslist`. No disclosure — Rows shows every pal. |
| `.rostile` | One species in **Tiles** view: a `<button aria-expanded aria-controls="rosPanel">` carrying art, a count badge on the art, the name and the gender tally. The whole tile is the press target. |
| `.rospanel` | The expanding panel. A `<section role="region" aria-labelledby>` spanning `1/-1`, placed as a real sibling **after the last tile of the open tile's visual row** — so grid auto-placement puts it on its own row, the board resumes underneath, and DOM order stays visual order. `grid-auto-flow:dense` remains **forbidden**, and is not needed. |
| View headings | **Every view names itself in an `h2`**, so group headings inside it are `h3`. Skills had no view heading at all, which put its section titles ("Work suitability +1 for every other pal") at the level every other view uses for its name; Map had none at all, so heading navigation skipped the app's largest surface entirely. |
| `#mapHelp` / `#mapView` | **One string, not two hand-synced ones.** `#mapView`'s `aria-label` is the region's *name* ("Interactive map") and `#mapHelp` is its `aria-describedby` — a name identifies, instructions describe, and a 21-word name is what a screen reader reads out of the landmark list every time focus enters. The help must name every route, keyboard included: it said "drag to pan · scroll to zoom" while the keys lived only in the label. It also has to be **on screen when the Map opens** — its timer ran from boot, and Map is the ninth tab, so it had already faded. |
| `.mapinfo` | The marker/spawn panel: the `.chaincard` shape, because **every route into and out of it destroys the control that was pressed** — both close buttons, the nearest-marker buttons, Escape, and the spawn bar's Clear all dropped focus on `<body>`. `role="group"` + `tabindex="-1"` + `aria-labelledby` its own `h3`; a press that opens it lands on it, a press that closes it lands on `#mapView`. **Not** an `aria-live` region — it holds seven controls and ~330 characters and re-announced all of it on every press; `#mapCount` carries the short utterance. And it is anchored to the map's bottom edge, so "take me there" must scroll the **panel** into view: a map judged visible enough (312 of 647px at 360) still had its answer 745px down, below the tab bar. |
| `.rankscroll` | The focusable box around a `.ranktbl` inside a `.rankdet`. A table wider than its card is a scrollport, and `.ranktbl` holds no focusable cell — so the box itself takes `tabindex="0"` + `role="group"` + a name, or the clipped columns are pointer-only (axe `scrollable-region-focusable`; 156 of 249 tables overflow at 360). `role="group"`, not `region`: 249 landmarks would be worse than the bug. The Paldex's `.tablewrap` escapes this only because its rows are focusable. |
| `.rosband` | The species header band. One implementation, two homes: a Rows section and the panel header — **so its responsive rules are written unscoped**. The ≤640 wrap fix was scoped to `.rospanel .rosband`, and in a Rows section the one-gender warn chip ate the row the same way: at 360 the header read `La…` and nothing on screen named the species. The `✕` is a sibling **after** the `<h3>`, never inside it — a control is not part of a heading's name. |
| `.roster` | The grid. `.tileview` auto-fills a **single 120px track** above 640px and 96px below; `.rowview` is a single `minmax(0,1fr)` column. One track, not a ladder — every extra breakpoint steps the tile up and the column count down, so a wider window produces a *taller* board. **`minmax(0,1fr)`, never a bare `1fr`**: `1fr` floors the track at the widest section's min-content, so one long passive chip row pushed the whole page to 356px and broke 1.4.10 Reflow at 320. |
| `.chiprow` | The chip line inside a header band, a tile, a Find parents group, or the Planner's quick-add strip. A low-specificity global base rule. It sets `flex-wrap:wrap`, which `.rostile` re-declares but `.rosband` did **not** — so the base rule silently gave the roster's species band wrapping it never had, +28px per section at 360. `.rosband .chiprow` now pins `nowrap`. When you add a property to a shared base, check every variant re-declares it; inheriting one is how a component in another view grows. |
| `.roslist` / `.rosrow` | The section's `<ul>` and one pal per `<li>`. Fixed grid tracks (identity · passives · note · actions) so columns align down the whole section. Replaces the former `.rospal` **and** `.gentry`. **A row never repeats the species — except when it has nothing else to say.** With no nickname, no save name and no level chip, the identity cell was a lone 25px gender glyph in a 240px track, and two ♂ siblings rendered identically; the species then stands in as `.nmfb`, `--muted` at 400, so it reads as a fallback rather than the band's name (`--text`/700) repeated. |
| Naming an entry | One helper, `entryName(r) = r.nick ‖ r.gname ‖ species`, in the order the row renders. Every control, title, toast and sort that names a pal uses it. The row button honoured `gname` and nothing else did, so a row reading “Sparky” answered Remove with *Removed Sparkit from roster*. |
| `.mchip.warn` | A meta chip carrying a warning — `--danger` text, tint fill, `--danger-line` border. It keeps its pill where the plain `.mchip` beside it does not, so shape and not only hue separates them. States the warning in words wherever the width allows, and in an `.sr-only` tail where it does not — never in colour alone. Gender glyphs inside it inherit `--danger` rather than `--male`/`--female`: a pink ♀ on a pink chip stops reading as a gender colour, and the pairing lands on 4.50. |
| `#smResult` (the save preview) | Arriving here focuses the **result**, not the button that commits it: `#smApply` scrolled the dialog 161px (1366) / 524px (360) past its own summary, the scope filter and the first conflict row — and `.mbar` carries only ✕, so nothing on screen named the dialog either. `tabindex="-1"` + `role="group"` + `aria-labelledby` its summary, the `.chaincard` / `.mapinfo` shape. It is also the only focusable here that can be **disabled** (a save with nothing importable), where `focus()` is a no-op. **Everything the button writes is previewed** — starring runs over every species in the save whatever the scope filter says, and the preview never mentioned it; the toast afterwards was the first the user heard. Nothing importable is an **empty state**, not a disabled primary over a live filter: the filter and the button go, a sentence says why, and Cancel becomes Close — a verb for undoing something, when nothing happened. |
| `.picker` | The pal combobox, eight of them across four views. **Clearing is a real `.pclear` button, a sibling of the trigger** — as a `<span>` with a `title` inside the trigger it was pointer-only: the control has exactly one tab stop and the popup offers no “none” row, so a keyboard user who set a parent could not unset it (2.1.1). It cannot be nested, because a button inside a button is invalid and the trigger's own `aria-label` prunes the subtree, which hid the ✕ from AT entirely. Focus stays in the search box while the arrow keys move a highlight through 299 rows, so the box is a `role="combobox"` with `aria-controls` and a live `aria-activedescendant` — without it a screen reader was told nothing at all and you pressed Enter on a row you could not hear. The “no pals match” line lives **outside** the `role="listbox"`: a listbox may only contain options, and it sat inside one in every picker in the app. |
| `.skip` / `.setup` | The page's two first-run affordances. **The hash is the router**, so `Skip to content`'s own `href="#main"` was a route — pressing it answered the app's own accessibility affordance with a *Link not recognized* toast and left the URL somewhere a reload could not restore. The `href` stays for the no-JS case; in-app the click is intercepted and moves focus, and `#main` is given `tabindex="-1"` **on demand and loses it on blur** — without the attribute the browser only moves the sequential starting point and `activeElement` stays `<body>`, but left on the element it makes `<main>` the nearest focusable ancestor of every paragraph in the app, so an ordinary click on body text focuses it and the next Tab jumps to the top of the view. Two things quietly decide whether the link is reachable at all: **`scrollIntoView` sets the sequential focus navigation starting point**, so `showTab` scrolling the active tab at boot meant the first Tab of a session began *after* the tab strip — at ≥641px only, where `.tabs` is rendered, which is why a 360-only check pronounced it fixed when it was not. Scroll the strip (`tabsEl.scrollLeft`), never the button. Check this at several widths: it is invisible at the one most likely to be tested. The checklist is one named `role="group"`, not three loose buttons after a text node, and both ways it goes away — ✕ and finishing the last step — run through `hideChecklist`, which lands focus on the current tab: hiding a bar that holds the focus leaves it on a hidden button. Its three chips stay put across a tab change (they live in `<main>`, outside the views), so unlike every other cross-tab jump they need no landing of their own. |
| `.toast` / `.tacts` | Feedback ≤8s. Its actions travel as one `.tacts` block that never shrinks, so a long message and the buttons are **two flex items, not four**: when they stop fitting, the block wraps whole to a second row instead of the buttons being squeezed. At 320 “Un-star Lamball” had been pressed to 27px and rendered as a column of single letters, and Undo sat on its 24px `min-width` with the word clipped inside it; letting the message shrink instead cost 15 lines. No breakpoint governs the wrap — it happens exactly where the two no longer fit. Verified: Alt+Z still reaches the buttons through the wrapper, and it cycles newest-first. |
| `.bottomnav` / `.moresheet` | The phone layout's primary navigation (≤640, where `.tabs` is `display:none`). Three views sit in the bar and **six live behind More**, so on two thirds of the app the bar's only “where am I” was the accent hue on the More button: no `aria-current` anywhere, and the sheet button that holds the real one is `display:none`. More now stands in for the view it hides and names it (`aria-label="More — Map"`, keeping the visible word first for 2.5.3), and the current tab carries `box-shadow:inset 0 2px 0` — the top tabs already mark theirs with a fill and a ring, and colour alone is 1.4.1. The sheet is a **disclosure, not a menu**: it had `aria-haspopup="true"` promising a menu it did not implement, so that is now `aria-controls` on a labelled `role="group"`. **A toast must not sit on the open sheet**: `.toasts` is `z-index:300` to the sheet's 95, the toast is 331px wide and centred while the sheet is 190px hard against the right edge, so the toast took the hit test over the bottom three entries and left 5.4px of tappable width for *Map* at 360 — a tap at its centre closed the sheet and navigated nowhere (2.5.8). The sheet publishes `--sheet-h` and the stack lifts clear of it. Only one control claims `aria-current` at a time: while the sheet is open its own entry does, not the button that stands in for it. Closing it hides the button that was pressed, so it hands focus back to More — but only when it actually held the focus, since a pointer user tapping elsewhere has already chosen where focus goes. |
| `.overlay` / `.modal` | **The dialog is the scrollport, not the overlay.** Every one of the 299 pal cards is taller than the viewport at 360 (median 1581px, tallest 2332px), and with the controls absolutely positioned at the top of the card they left the screen 85px in — touch has no Escape, so at the bottom of a card the only way out was a 16px strip of scrim down each edge, under 2.5.8's floor and undiscoverable. `.modal{max-height:calc(100dvh - var(--sp-6)*2);overflow-y:auto}` with the overlay centring it and clipping. All three dialogs open a `.mbar` — a sticky top bar carrying the dialog's own controls, bled out to the padding box with negative margins so it spans the full width and can hold the surface. |
| `#modal` (the pal card) | One dialog, five tabs. `‹ ›` and the arrow keys **rebuild it in place** — the dialog never opens or closes, so nothing announces the change and the button that was pressed is destroyed under the finger that pressed it. Every focusable carries a stable `data-mfk`, and a rebuild hands focus back to the same key (`›››` walks three pals) while an `.sr-only` polite region inside the dialog says the new name and number. That region is the one child a rebuild must not destroy, it is cleared on close (`liveText` writes only on a difference, so a stale name made the next visit to that same pal silent), and it has to sit **inside** `#modal`: `aria-modal="true"` hides everything outside it. The step goes through `focusOnScreen`, not a bare `focus()` — `.mdesc` is per-species flavour text, so the same button sits at a different y on every card and landed up to 40px below the fold on a 640-high phone. The **star is a sibling after the `<h2>`, never inside it** (the `.rosband` rule): inside, the dialog's only level-2 heading announced as “Anubis#139Unmark Anubis as owned” and changed its own name on a press that did not change the pal. ‹ › are **Lucide chevrons** (§7) in a `.mbar` with a resting fill — as bare `--muted` glyphs with no fill or border, what they did lived entirely in a `title`, and touch has no hover. They say **species**, not “pal” (§6): they walk `PALS` in Paldex order, and on a roster card the pal you are looking at is an individual. The roster entry is **held across steps** (`modalEntry`), so › then ‹ comes back to the same species with “In your roster” intact rather than losing it through a silent one-way door. The drop list **merges byte-identical rows** with a `· N rolls` tail — Mimog lists one item seven times over, 90 of the 298 pals with drops repeat at least one row; the data is the game's, printing it verbatim is what reads as a bug. The card also carries the roster row's own actions (`.rentacts`), which run with the card closing under them — they pass `leaveModal(true)` (“I place focus myself”) and land on the row they acted on, because `renderRoster`'s own restore reads `document.activeElement` and by then it is `<body>`. |
| `.rentacts` | The full, named action set for one entry, inside its pal card. Row toolbars stay to three glyphs; everything else lives here at comfortable size. |
| `.bulkbar` | The action bar over a transient selection. Fixed to the bottom of the viewport on the **toast surface recipe** — `--overlay`, a hairline, the same shadow — so the bottom of the screen reads as one family; `z-index` under `.toasts` and over the mobile tab bar. **DOM-placed immediately before `#rosterList`**, which renders it as the list's header for 1.3.2 and puts it one Shift+Tab from any row; the alternative measured 38 Tab presses. Its `Remove` is **not** `.alink.primary` — a solid accent fill on a destructive default invites the mis-press the mode exists to prevent. |
| `.rosselall` | The check-all row at the head of the list. Reuses `.rosband`'s padding and its 28px lead column so all three checkbox levels sit on one vertical rule, but is a `<div>`, not an `<h3>`: it is a control, and a heading here would inject a phantom section into the outline. |
| `.chk` / `.rchk` | One checkbox recipe, shared by the plan's step ticks and the roster's selection. Native `<input type="checkbox">` throughout — the only HTML control that exposes `mixed`, which the two tristate levels need for 4.1.2. `:indeterminate` is a dash, not a tick. |

**The gender chip states a same-species limit, never a breeding limit.** In Palworld
any ♂ pairs with any ♀ whatever the species, so a roster of three ♂ Lamball is only
barred from *pairing with each other* — which is how you make more Lamball. Say that
and nothing wider. The chip has two lengths because the reason wraps to four lines in
a 97px tile and adds ~35px to **every** row of the board: a tile shows `all 3 ♂` with
the reason in an `.sr-only` tail, while the header band and the open panel show
`3♂ · can’t pair with each other` outright. Both keep the tally — a warning that eats
the number it is warning about leaves nothing to act on.

**Grid boards are one tab stop.** `.roster.tileview`, `.dexgrid`, `.combos` and
`.hatchgrid` all use a roving `tabindex` over their items. **One stop is only half the
contract**: the board also carries a name and an `.sr-only` line saying the
arrows exist (`#dexGridHelp`, `#comboListHelp`), and it is a `<ul>` so AT can
report its size. Removing 249 tab stops without those leaves 249 controls
depending on a convention nothing states. Vertical movement is **geometric** — find the
adjacent row by `getBoundingClientRect().top`, then the nearest column by centre
x — never `index ± columns`, which clamps to the first/last item when a row is
short and strands you in a column you were never in, and cannot see a full-width
panel splitting the board into rows of unequal length. Both boards call
`gridStep(items, cur, dir)` in `js/core.js`; a `null` return means "no row that
way, stay put" and must still `preventDefault`, or the page scrolls instead.

**Row action toolbars** use `role="toolbar"` with roving `tabindex` (arrows/Home/End
move within, Tab leaves), so a row costs **two** tab stops — its name and its
toolbar — not one per action. `rovingRow` picks that stop from the buttons that
can **take** focus, not by index: assigned to index 0 it landed on a `disabled`
button whenever the first one happened to be disabled, leaving every other button
at `-1` and the row with zero keyboard stops — unreachable and unleavable. Prefer
`aria-disabled` inside a roving row for the same reason. It also binds its
`keydown` **once** (`dataset.roving`) and reads its buttons live, because three
call sites re-render and re-call it. **Except in the roster's selection mode**, where
neither is rendered — Edit and Duplicate are the wrong verbs while you are
operating on a set — so a row costs **zero**, and the whole list is one stop with
a roving `tabindex` like the grid boards. Measured on a 36-pal roster: 82 stops
in Rows, 10 while selecting. Selection lives in Rows **only**, and entering hides
the `.viewseg` for the duration: Tiles shows one tile per *species* and no pals,
so a checkbox there would either mean "all 6 Lamball" (§6 — a species is not a
pal) or be a second focusable inside a one-stop board. A filter never clears a
selection — narrow-then-pick is the whole workflow — and the bar states the
discrepancy in words (`12 selected — 4 not shown`) rather than resolving it
silently. Leaving the Roster tab does clear it: a selection you cannot see is a
trap, and the bar is viewport-fixed. Actions are revealed on hover only under
`@media (hover:hover)`; under `@media (hover:none)` they are always visible, and the
gutter is reserved in both cases so nothing shifts.

Breedable now (a board of disclosures, so it inherits the roster's panel rules):

| Class | Role |
|---|---|
| `.hatchgrid` | The board: a `<ul>` that is **one tab stop**, with the full grid-board contract above (name, `#hatchGridHelp`, geometric `gridStep`). The grid item is an `li.hcell`, not the card, because the panel is an `li.hpanelcell` in the same list. This is the hardest board in the app to rove: its items are disclosures and a full-width row can appear **between** them, which is precisely why vertical movement is geometric — `i ± cols` cannot see that row. The panel is **not** in the ring; Tab reaches it, because every other card sits at `-1` and the panel follows the open card in DOM order. 239 stops at "Any chain" became 6. |
| `.hcard` | One breedable species: a `<button aria-expanded>` carrying **decorative, inert** art, the name, an optional `.tier`, `New`, and the pair count or step count. **A fixed two-row grid** — art spanning both rows, name on row 1, `.hmeta` (rarity, `New`, count) on row 2 — so every card is 68px whatever badges it carries. Sharing one line they wrapped, and the board came out at 62px and 94px, 216 of 253 cards tall at 1366. `.ways` is on every card, so the meta row never collapses, and it keeps `margin-left:auto` — the count is the card's one varying quantity, and packed behind two optional badges its x wandered over 103px of the board. `--raised`, one rung above its `.pcard` (§1). `aria-controls` is set **only while expanded** — the panel does not exist before that, and an unresolvable IDREF is a no-op that "move to controlled element" walks into. Art inside a button is never clickable: a second action no keyboard can reach, whose `alt` announces the species twice. The roving stop **follows the press**: open, close and Escape all re-seed it onto the card acted on, or a close would hand Tab back to the first card on the board. |
| `.hatchpanel` | The expanding panel. Same contract as `.rospanel` — a `<section role="region" aria-labelledby>` spanning `1/-1`, placed after the **last card of the open card's visual row**, re-placed on resize behind a `previousElementSibling` guard so the `ResizeObserver` can't loop. Appended straight after its own card it left up to `cols-1` empty cells beside it. Escape from anywhere inside it closes and returns focus to the card — arrows never open or close, like the roster's board. |
| `.pair .x` | The `×` between the two sides, `aria-hidden` with an `.sr-only` "and". **Hidden at ≤640** for the same reason as `.pgroup .x`: once the sides wrap it parks in the top-right of a row that is itself a press target and reads as a close button. |
| `#hatchStats` | The view's `aria-live` count. States the population it actually counted — `N species from M owned` unfiltered, `N of M species match “q”` with a search. A search-filtered numerator under an ownership denominator produced `0 species from 11 owned`, which says the roster breeds nothing. Same denominator rule as Find parents' `.resline`. |

**Every cross-tab jump from a panel restores focus.** `navTab` hides the control
that was pressed, so a bare `navTab(…)` always ends on `<body>`. Land on the
control the press just set — `#pickA`/`#pickT`'s trigger for Breed and Find
parents. "Plan this route" is the exception: the route it hands off to renders
600ms later and `scrollIntoView`s itself, which carried the focused picker 460px
above the viewport at 360 — focused, announced and entirely off-screen. It sets a
one-shot `planFocusOnArrival()` flag that `computeRoute` consumes **after** its
own scroll, so focus lands inside what the scroll revealed. Never a `setTimeout`
guessing when the debounce fires. It also replaces four start slots, every slot's
passives and genders, the target and both modes — a destructive default whose
only warning was a `title`, which does not exist on touch — so it fires the canon
`.toast` with **Undo** over a snapshot taken before the overwrite.

`[hidden]{display:none!important}` is set globally in the reset. The UA's own
rule is a bare attribute selector, so **any** class that sets `display` outranks
it and the element stays on screen — which shipped three separate visible-but-
"hidden" controls before this was made structural. Don't rely on writing
`.cls[hidden]` per class, and don't remove the global rule.

Pal art sizes from a `--ico` custom property set by `icon()`, so a rule can
resize it per presentation. Never write an inline `width`/`height` **or an
inline `--ico`** on a `.pico` you want a rule to size: either outranks every
selector, which is what stranded the missing-image fallback at the wrong size.
A caller that wants CSS to own the size strips the property, and the fallback
only re-applies what it finds still set. `icon(p, size, clickable, decorative)`
— pass `decorative` when a text label sits directly beside the image, or the
name is announced twice.

