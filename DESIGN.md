# Palarium Design Standards

The single source of truth for how Palarium looks, feels, and reads. Every UI change
follows this document; the `.claude/agents` (ux-designer, design-reviewer,
a11y-auditor) enforce it. When this doc and the code disagree, the doc wins — fix the
code or amend the doc in the same commit, never silently diverge.

Grounding: Nielsen heuristics, WCAG 2.1 AA + WCAG 2.2 AA additions, Material dark-theme
guidance (elevation via lighter surfaces, desaturated accents), Refactoring UI
(constrained scales, hierarchy via weight/color), Carbon/Primer button conventions.

---

## 1 · Color tokens & roles

Defined in `css/style.css :root`. **Never introduce a raw hex in a rule — use a token.
Never add a token without a role and a contrast entry here.**

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0d1117` | App background (level 0) |
| `--surface` | `#161b22` | Card / surface (level 1) |
| `--raised` | `#1c2330` | Raised control, hover fill (level 2) |
| `--overlay` | `#232b3a` | Popover / menu surface (level 3) |
| `--scrim` | `rgba(5,8,12,.82)` | Modal backdrop |
| `--border` | `#2a3342` | Hairline borders, dividers (decorative) |
| `--border-strong` | `#3a465c` | Emphasized borders, control outlines |
| `--text` | `#e6edf3` | Primary text |
| `--text-2` | `#c3ccd8` | Body copy inside dialogs and cards |
| `--muted` | `#8b98a9` | Secondary text, labels |
| `--faint` | `#5f6d80` | Placeholder / absent-value text only — never load-bearing |
| `--ink` | `#0d1117` | Text **on** a solid accent or colored chip |
| `--accent` / `--accent-hover` | `#58b6ea` / `#6fc1ee` | Interactive / primary actions / focus rings / links |
| `--success` | `#7fd49e` | Positive: passives, success, "new" |
| `--gold` | `#d9b25c` | Ownership (★), rarity, unique combos |
| `--danger` | `#ef8fb8` | Warnings, destructive hover |
| `--male` / `--female` | `#6aa8f0` / `#e0708f` | Gender glyphs only |
| `--neutral` + element colors | various | Element typing only (chips/dots) |

**Tint recipe.** Each semantic color gets exactly two alphas and no others:
`--<name>-tint` (`.08`, fills) and `--<name>-line` (`.35`, borders) — defined for
`accent`, `success`, `gold`, `danger`. Don't write a new `rgba()` in a rule.

**Elevation = lighter surface, never shadow alone.** The ladder is
bg → surface → raised → overlay; popovers/toasts sit on raised/overlay with a border
plus shadow. Don't invent intermediate grays.

**Contrast matrix (WCAG ratios, computed 2026-07-26).** Approved pairings — anything
not in this table needs a computed ratio before merge:

| Foreground | on `--bg` | on `--surface` | on `--raised` | on `--overlay` | Verdict |
|---|---|---|---|---|---|
| `--text` | 16.02 | 14.64 | 13.34 | 12.02 | AA/AAA all sizes |
| `--text-2` | 11.67 | 10.67 | 9.72 | 8.76 | AA/AAA all sizes |
| `--muted` | 6.45 | 5.90 | 5.37 | 4.85 | AA all sizes |
| `--accent` | 8.38 | 7.66 | 6.98 | 6.29 | AA all sizes |
| `--success` | 10.65 | 9.73 | 8.87 | 7.99 | AA all sizes |
| `--gold` | 9.44 | 8.63 | 7.86 | 7.09 | AA all sizes |
| `--danger` | 8.37 | 7.65 | 6.97 | 6.29 | AA all sizes |
| `--male` | 7.63 | 6.98 | 6.36 | 5.73 | AA all sizes |
| `--female` | 6.20 | 5.67 | 5.17 | 4.66 | AA all sizes |
| `--ink` on `--accent` | — | 8.38 | — | — | AA — the solid-primary pairing |
| `--faint` | 3.59 | 3.28 | 2.99 | 2.70 | **Below AA — non-essential text only.** Placeholders and decorative hints. A fact the user needs (an absent value, a count, a state) must be `--muted` or better. |
| `--text` on `--accent-tint` over `--raised` | — | — | 12.80 | — | AA/AAA — the open roster tile |
| `--muted` on `--accent-tint` over `--raised` | — | — | 5.16 | — | AA |
| `--female` on `--accent-tint` over `--raised` | — | — | 4.96 | — | AA — the tightest pairing in the app |
| `--danger` on `--danger-tint` over `--surface` | — | 6.72 | — | — | AA — the blocked partner chip. At `opacity:.9` (its `.why` reason line) 5.72, still AA |
| `--text` on `--accent-tint` over `--bg` | 14.29 | — | — | — | AA — the selected roster row. `--male` 6.81, `--muted` 5.76, `--success` chip 8.04. The tint itself is 1.12:1 against a plain row, so it is atmosphere; the checkbox carries the state |
| `--success` on `--success-tint` over `--surface` | — | 8.31 | — | — | AA — the pressed `.pset` carry chip. Its `--success-line` border is only 2.27 against its own fill, so the border is not the state: the text colour changes with it, the border goes dashed→solid, and `aria-pressed` carries it programmatically |
| `--danger` on `--danger-tint` over `--bg` | 7.48 | — | — | — | AA — the legacy-plan `.mchip.warn` |
| `--text` on `--gold-tint` over `--surface` | — | 14.15 | — | — | AA — the owned Paldex tile |
| `--muted` on `--gold-tint` over `--surface` | — | 5.70 | — | — | AA — a tinted fill costs ~0.2 against the plain surface |
| `--border-strong` | 1.99 | 1.82 | 1.66 | 1.50 | **Decorative only** — a border below 3:1 must never be the sole indicator of a control's boundary or state; pair with a fill, icon, or text change |

Dark-theme rules: accents stay in this desaturated range — no saturated pure hues
(they vibrate on dark). Text is dimmed white (`--text`), never `#fff`. Large solid
areas of accent color are avoided; accents are for interactive elements and meaning.

**Contrast methodology.** The matrix is computed with WCAG 2.x ratios — the
commitment (§8) is 2.1 AA, so 2.x math is what gates a pairing. Know its limit:
WCAG 2 contrast is least accurate on dark backgrounds, and APCA (the candidate
WCAG 3 model) rates dark-UI pairings more faithfully. Any future palette retune
runs candidates through **both** models and keeps pairs that clear 2.x AA *and*
hold up under APCA — cheap insurance against tuning to the weaker formula, not a
new gate on day-to-day work.

**The theme door stays open.** Palarium is dark-only today, and nothing here
plans otherwise — but the no-raw-hex rule above is also what keeps a second
theme (light, high-contrast) cheap if one is ever wanted: with every rule on
semantic tokens, a theme is a second `:root` block plus a recomputed contrast
matrix, not a rewrite. A stray hex in a rule is invisible today and a bug the
day a second theme lands, which is why the rule is absolute rather than a
preference. (Same logic covers the game-art caveat: pal tiles and extracted
icons were composed against dark surfaces — a light theme must re-verify their
legibility, not assume it.)

## 2 · Spacing & radius

Spacing tokens: `--sp-1…7` = **4 · 8 · 12 · 16 · 20 · 24 · 32**. New rules use the
scale; existing off-scale values (7, 9, 11, 13, 14, 18, 22, 26…) migrate
opportunistically when a rule is already being touched — no mass rewrites. One
deliberate exception: the roster's `.rosband` / `.rosselall` / `.rosrow.selectable`
share `padding-left:15px` so all three checkbox levels sit on one vertical rule.
Alignment across components outranks the scale; don't "fix" one of the three.

Radius tokens — reuse the nearest, don't add new ones:

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 6px | inline code, chips inside chips, level/IV chips |
| `--r-md` | 10px | small controls, buttons, segmented items |
| `--r-lg` | 14px | inputs, pickers, cards inner, list rows |
| `--r-xl` | 18px | cards, modals |
| `--r-full` | 999px | pills, count badges, switches |

## 3 · Typography

System stack (`"Segoe UI", system-ui, sans-serif`) — webfonts only if self-hosted,
subset, and justified (offline PWA). Base body: 15px/1.5.

Scale — seven tokens: `--fs-xs` **11** (micro labels/badges) ·
`--fs-sm` **12.5** (meta, captions) · `--fs-md` **14** (secondary UI, buttons) ·
`--fs-base` **15** (body/controls) · `--fs-lg` **17** · `--fs-h2` **19** (card
headings) · `--fs-h1` **24** (display, result cards/modal titles). The heading jumps
are ≥1.26×. Weights: 400 (body), 600 (emphasis, buttons, names), 700–800 (headings,
uppercase micro-labels). Hierarchy comes from weight + color (`--text` vs `--muted`),
not from adding font sizes. Uppercase micro-labels always pair with
`letter-spacing: .5–.7px` and 700+. New rules use the tokens; the ~20 remaining
literal `font-size:*px` declarations migrate opportunistically, as in §2.

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
| `.rstep` | One route step — the skeleton Breed's chain card shares. Its `×` and `→` are `aria-hidden` with spoken "and"/"make" beside them. |
| `.wildinfo` family | The catch panel behind `Where?`, with its own `.accb` difficulty tier. |
| `.resline` `#planStatus` | The view's one sentence, **in the markup and never rebuilt**. The route computes 600ms after the last input change, so nothing the user pressed correlates to it appearing — without this the whole result arrived silently. Says the step count and what is carried, the no-route sentence, or the empty-form prompt. **Invariant: the clause after `carrying` is what the route actually delivers (`wo.carry`), is never longer than four names, and is omitted when empty.** Every branch that renders a result writes it — the "already is the target" branch used to return early and leave the previous route's claim standing. |
| `#carryRow` | A `.slot` — the same dashed card every other field group in this view uses; as a bare block between six cards its label read as a section heading. The passive goal, in § 1 with the passives it governs — it is a function of the start slots directly above it, not of the target species, and at 350px (1366) / 668px (360) away in § 2 the problem was created long before the control that solves it came into view. A pal has **four passive slots**, so a route carries at most four. When the starters' distinct passives exceed that and the user has picked nothing, the app **states the cap** rather than claiming a pal the game cannot produce: the route still renders in full, and only the passive claim withdraws — no chips, no `.carrier` tags, no odds, no expected-eggs line, one `.alink` back to the row. It does not auto-pick four. With eight distinct passives there are 70 candidate subsets and no signal which is wanted, and a machine-made choice would then be *priced* — `≈22%/egg` for four passives the user never chose is a more confident wrong answer than none. Not a `.warnbox`: nothing is wrong, a choice is waiting (§6 — never scold). **"Has the user chosen?" is stored (`dpc`), not inferred from an empty picker**: empty means "carry everything that fits" before a choice and "carry nothing" after one, and conflating them made un-pressing the last chip silently re-carry the whole union. A save written before `dpc` migrates on a non-empty `dp`, which was the only way to say "these specific ones". |
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
| `.chiprow` | The chip line inside a header band, a tile, or a Find parents group. A low-specificity global base rule. It sets `flex-wrap:wrap`, which `.rostile` re-declares but `.rosband` did **not** — so the base rule silently gave the roster's species band wrapping it never had, +28px per section at 360. `.rosband .chiprow` now pins `nowrap`. When you add a property to a shared base, check every variant re-declares it; inheriting one is how a component in another view grows. |
| `.roslist` / `.rosrow` | The section's `<ul>` and one pal per `<li>`. Fixed grid tracks (identity · passives · note · actions) so columns align down the whole section. Replaces the former `.rospal` **and** `.gentry`. **A row never repeats the species — except when it has nothing else to say.** With no nickname, no save name and no level chip, the identity cell was a lone 25px gender glyph in a 240px track, and two ♂ siblings rendered identically; the species then stands in as `.nmfb`, `--muted` at 400, so it reads as a fallback rather than the band's name (`--text`/700) repeated. |
| Naming an entry | One helper, `entryName(r) = r.nick ‖ r.gname ‖ species`, in the order the row renders. Every control, title, toast and sort that names a pal uses it. The row button honoured `gname` and nothing else did, so a row reading “Sparky” answered Remove with *Removed Sparkit from roster*. |
| `.mchip.warn` | A meta chip carrying a warning — `--danger` text, tint fill, `--danger-line` border. It keeps its pill where the plain `.mchip` beside it does not, so shape and not only hue separates them. States the warning in words wherever the width allows, and in an `.sr-only` tail where it does not — never in colour alone. Gender glyphs inside it inherit `--danger` rather than `--male`/`--female`: a pink ♀ on a pink chip stops reading as a gender colour, and the pairing lands on 4.50. |
| `.skip` / `.setup` | The page's two first-run affordances. **The hash is the router**, so `Skip to content`'s own `href="#main"` was a route — pressing it answered the app's own accessibility affordance with a *Link not recognized* toast and left the URL somewhere a reload could not restore. The `href` stays for the no-JS case; in-app the click is intercepted and moves focus, and `#main` carries `tabindex="-1"` so it can receive it (without that the browser only moves the sequential starting point and `activeElement` stays `<body>`). The checklist is one named `role="group"`, not three loose buttons after a text node, and both ways it goes away — ✕ and finishing the last step — run through `hideChecklist`, which lands focus on the current tab: hiding a bar that holds the focus leaves it on a hidden button. Its three chips stay put across a tab change (they live in `<main>`, outside the views), so unlike every other cross-tab jump they need no landing of their own. |
| `.toast` / `.tacts` | Feedback ≤8s. Its actions travel as one `.tacts` block that never shrinks, so a long message and the buttons are **two flex items, not four**: when they stop fitting, the block wraps whole to a second row instead of the buttons being squeezed. At 320 “Un-star Lamball” had been pressed to 27px and rendered as a column of single letters, and Undo sat on its 24px `min-width` with the word clipped inside it; letting the message shrink instead cost 15 lines. No breakpoint governs the wrap — it happens exactly where the two no longer fit. Verified: Alt+Z still reaches the buttons through the wrapper, and it cycles newest-first. |
| `.bottomnav` / `.moresheet` | The phone layout's primary navigation (≤640, where `.tabs` is `display:none`). Three views sit in the bar and **six live behind More**, so on two thirds of the app the bar's only “where am I” was the accent hue on the More button: no `aria-current` anywhere, and the sheet button that holds the real one is `display:none`. More now stands in for the view it hides and names it (`aria-label="More — Map"`, keeping the visible word first for 2.5.3), and the current tab carries `box-shadow:inset 0 2px 0` — the top tabs already mark theirs with a fill and a ring, and colour alone is 1.4.1. The sheet is a **disclosure, not a menu**: it had `aria-haspopup="true"` promising a menu it did not implement, so that is now `aria-controls` on a labelled `role="group"`. Closing it hides the button that was pressed, so it hands focus back to More — but only when it actually held the focus, since a pointer user tapping elsewhere has already chosen where focus goes. |
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

**Grid boards are one tab stop.** `.roster.tileview`, `.dexgrid` and `.combos`
all use a roving `tabindex` over their items. **One stop is only half the
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
| `.hcard` | One breedable species: a `<button aria-expanded>` carrying **decorative, inert** art, the name, an optional `.tier`, `New`, and the pair count or step count. `aria-controls` is set **only while expanded** — the panel does not exist before that, and an unresolvable IDREF is a no-op that "move to controlled element" walks into. Art inside a button is never clickable: a second action no keyboard can reach, whose `alt` announces the species twice. |
| `.hatchpanel` | The expanding panel. Same contract as `.rospanel` — a `<section role="region" aria-labelledby>` spanning `1/-1`, placed after the **last card of the open card's visual row**, re-placed on resize behind a `previousElementSibling` guard so the `ResizeObserver` can't loop. Appended straight after its own card it left up to `cols-1` empty cells beside it. |
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

## 5 · Motion

Durations 120–250ms, ease-out for entrances (`pop` keyframe: .15–.18s), color/border
transitions .12–.15s. Nothing animates position on scroll except `scrollIntoView`
smooth. **All new animation respects `prefers-reduced-motion: reduce`** (wrap
non-essential animation; keep opacity-only fallbacks). No animation longer than 300ms,
no looping/attention animation, ever.

## 6 · Language & copy

- Tone: a calm, knowledgeable friend. Short sentences (≤15 words). Never scold.
- Say the user's goal, not the UI: "Star pals to mark what you own", not "Click the
  star button in the table".
- Lexicon (one concept, one name): **species** (a kind of pal) · **pal** (an
  individual) · **owned** (★ or in roster) · **target species** (what you're breeding
  toward — not "target child") · **passives** · **route** (computed) · **plan**
  (saved route) · **pair** (two parent species that produce a target — never
  "combination", which the Paldex owns for its fixed unique-combo list) ·
  **partner** (non-line parent in a step) · **missing** (a species
  you have not starred and do not have in your roster — the complement of
  *owned*) · **backup** (Palarium's own
  JSON file — you export and restore it) · **save** (the Palworld game file — Palarium
  only ever reads it). Never use the bare word "import" as a button label for either:
  it named two unrelated jobs and told the user nothing about which one they were in.
- The Paldex counts **species**; the Roster counts **pals**. Never say "pals"
  for a Paldex count — 299 is a species total, not an individual one.
- Sentence case for all labels, buttons, and tab names. Title Case is not used.
- **The ≤15-word cap is for microcopy** — labels, buttons, status lines, hints,
  empty states. The Guide is the app's only longform surface: prose there caps at
  **25 words**, and anything past that gets split. Measured over the Guide's 90
  sentences the median is 14, so the cap is the exception, not the rule.
- **"child", not "baby"**, for what hatches — except in the Guide's first card,
  whose register is deliberately plainer than the rest of the app. Nowhere else.
- Empty states: 1 sentence of what this is + 1 action button. Errors: what happened +
  the next step, colored `--danger` *plus* text (never color alone).
- Icons & glyphs: see §7. Emoji are last-resort placeholders, never design elements
  in new work.

## 7 · Iconography

Priority order — always exhaust a tier before falling to the next:

1. **Extracted game assets** (`assets/ui/*`, `assets/items/*`, `assets/pals/*`) for
   anything that *is* a game concept: elements (`ui/element/`), work suitability
   (`ui/work/`), egg types incl. mutation (`ui/egg/`), passives (`ui/passive/`), map
   markers (`ui/map/`), items like cake (`items/`), pals (`pals/`). Players already
   know these shapes from the game — that recognition is free UX. Render 16–20px
   inline with a text label (`alt=""`/`aria-hidden` when the label is adjacent;
   `alt`/`aria-label` when standalone).
2. **Open-source SVG icons for generic UI** — standardize on **Lucide** (ISC
   license): stroke-based, `fill="none" stroke="currentColor" stroke-width="2"`, so
   icons inherit text color and sit naturally on the dark palette. Self-host by
   inlining only the icons used as `<svg>` markup (offline PWA — no CDN, no icon
   font, no full pack in the repo). Sizes 16/18/20/24 to match type scale. Use for:
   search, close, edit, swap, external/link, upload/download, warning, dice/odds,
   tree/branch, settings, chevrons.
3. **Emoji — last resort only.** Acceptable as a temporary placeholder during
   development; flagged for replacement before the work is called done. Never in new
   polished UI. **The migration is complete** — the only emoji left in the app are
   in `WORKS`, because a `<select>` option cannot hold an image. Two rules came out
   of finishing it: a container that swaps an emoji for an icon has to become
   `inline-flex` (a glyph sits on the text baseline where a stroke icon does not),
   and a **repeated** emoji is never a bar chart — the food stat drew up to eight
   🍖, announced "cut of meat" eight times, and was the one stat tile in eight
   that hid its own number.

JS-built Lucide icons go through `lucide(name, size, cls)` in `js/core.js` — add the
shapes to the `LU` table beside it, so the repo carries only the icons it draws (an
entry is a list of shapes: a bare string is a `<path d>`, `[tag, attrs]` gets you a
circle or a rect). Every one carries `.lui`, the stroke-icon twin of `.uii` — one
alignment rule for the whole app instead of a per-component patch. Markup-authored
ones inline the same attribute set by hand (`#swapBtn`). Game art goes through
`uiIcon(dir, key, size)` for `assets/ui/` and `itemIcon(key, size)` for
`assets/items/`; both drop themselves rather than render a broken image. Icons are
always `aria-hidden`: the control carries the label. A control whose visible text
sits beside an icon must keep that text **inside** its accessible name — an
`aria-label` that paraphrases it ("Previous chain step" over "Prev step") fails
2.5.3 Label in Name, and axe cannot see it (`label-content-name-mismatch` is
experimental and off by default, so a clean suite is not a clearance).

**`↗` means this control leaves the view you are on.** Breed, Breedable now, the
Planner and the Guide all mark their cross-tab jumps with it; an in-page jump (the
Guide's "See the new cakes", which only opens a section below) stays bare.

**Every such jump goes through `landAfterNav(selector)`** — never a raw
`focus({preventScroll:true})`. `navTab` hides the control that was pressed, so a
bare jump ends on `<body>`; and `preventScroll` alone is not enough either,
because the page keeps the scroll position of the view you left — pressed from a
card far down Breedable now, a raw focus left the Find-parents picker **1974px
above the viewport at 360**, focused and entirely off-screen. `landAfterNav`
scrolls only when the target is out of sight. **A jump that names a sub-view has
to select it too**: "See breeding power in the Paldex" landed on the gallery,
which shows no breeding power, and "Browse every passive" landed on whichever
Skills section was last used — Base auras on a cold start, with no passive on
screen. Gate these with `focusVisible`, never `focusSane`.

`focusOnScreen(el)` is the same guard without the navigation, and it holds the
**same bar `focusVisible` does** — half the control or 24px, between the header
and the tab bar. "Not entirely hidden" is not the bar: 30px of a 45px combobox
under the sticky header passes that and fails this. (`offsetParent` is `null`
for a `position:fixed` element, so read the bottom bar's rect, not its
`offsetParent`.) `landAfterNav` is a thin wrapper over it.

**A press that moves the control it is standing on lands on its own result, not
on itself.** Skills' "Show more" appends 60 cards *above* its button, so
re-focusing the button dragged the page 14,757px over 1,654ms — past the 60
cards the press had just revealed, to a place where none were visible. Landing
on the first new card costs **0px**: it is already on screen, which is the point.
§4's hidden-control rule covers sub-tab switches too, not just `navTab` — what
matters is that the control is gone, not which function removed it.

Plain **text symbols** (★ ☆ ♂ ♀ ✕ → ✓ ⇄ ✎ ↗ ×) are typography, not emoji — they
render monochrome, inherit color, and remain allowed where established (ownership
stars, gender marks, close/clear, step arrows). Don't add new ones when a Lucide
icon exists for the concept.

Rules: never mix an emoji and an SVG/asset icon within the same component family;
interactive icon-only controls keep ≥24px hit areas and `aria-label`; decorative
icons are `aria-hidden="true"`; game-asset icons keep their original art (no
recoloring/filters).

## 8 · Accessibility commitments (non-negotiable)

- **axe-core clean (WCAG 2.1 A + AA) in every state** — cold start, lived-in, every
  modal/popover open. This is a gate, not a goal.
- WCAG 2.2 AA additions honored for new work: targets ≥ **24×24 CSS px** (44px
  preferred for primary mobile actions; use padding + negative margin to enlarge hit
  areas without visual change); every drag interaction has a non-drag alternative
  (tree pan ↔ zoom/reset buttons); focused elements never fully obscured by sticky
  header/overlays; help affordances in consistent locations; never ask users to
  re-enter data the app already has.
- Fully keyboard operable: pickers/popovers restore focus on close (deferred a tick —
  see the Enter-synthesized-click bug note in `js/core.js` makePicker.close), Escape
  closes topmost layer only, tab is trapped in dialogs, roving tabindex on tablists,
  re-renders re-focus the successor of the focused element. A trap also has to
  **recover**: it watched only its own two ends, so focus stranded on `<body>` by a
  rebuild tabbed straight into the page the dialog had hidden from screen readers.
- **Finding the control you came from again** (`refocusAfterModal`) has three traps,
  and the app hit all three: the element carrying `data-k` is often not the
  focusable one (a Paldex tile is an `<li data-k>` around a `<button>`), `tabIndex`
  is `-1` both for “focusable but out of the tab order” and for an ordinary `<li>`
  so it cannot test focusability, and `querySelector`'s first match may be in a
  hidden sibling block (Skills keeps all three sub-blocks in the DOM). Match all
  candidates, take the first that is focusable **and** has client rects. A deep
  link has no opener at all, so the pal the card was showing is the last clue —
  and the tab bar that is actually showing is the floor under everything.
- Tooltips (`title`) are enhancement only — any load-bearing information also exists
  inline, on tap, or in visible text (touch has no hover).
- `aria-live="polite"` on counts/status that change from filtering; toasts live in the
  existing polite region. `#toasts` is also a `role="region"` labelled
  *Notifications* **while it holds something** — an empty labelled landmark is a
  dead end — so a screen reader's own landmark key reaches Undo. `Alt+Z` moves
  focus to the newest toast's first action and cycles on repeat; it **focuses
  rather than fires**, because `toast()`'s third argument carries non-undo actions
  and a key that "does the action" would do something different every time. A
  toast never takes focus on its own. Rejected on the way here: `role="alertdialog"`
  (a dialog that self-destructs after 8s while holding focus is a trap that
  empties), F6 (a browser-chrome key — overriding it removes the route to the
  address bar), and moving `.toasts` earlier in `<body>` (same distance, opposite
  direction).

## 9 · Layout & structure

- Max width 1200px; view content in `.pcard`s. Every view leads with a recognizable
  header block (heading or controls) that answers "where am I, what do I do first".
- Mobile (≤640px): no horizontal page scroll ever — wide content scrolls inside its
  own container. Primary actions within thumb reach where feasible. The tab bar fades
  its clipped edge (`fadeL/fadeR`).
- A control that hides itself when its work is done must not also be the thing
  focus returns to. Check `.hidden` after the re-render and hand focus to what
  the press actually revealed.
- A `<details>` rebuilt by a renderer echoes a `toggle` event for every section
  that opens, and the event is a queued task — a timing flag cannot catch it.
  Distinguish the renderer's own output from a user press by comparing the new
  state against the state you already hold, never by a timer. A disclosure whose
  panel cannot be the summary's sibling uses `aria-expanded` + `aria-controls` on
  a `<button>` instead — which also removes the echo, because there is no
  browser-fired event to hear. `<summary>`'s whole keyboard contract is Enter and
  Space, so a button costs nothing to replace it with.
- A board and a list are **two views**, not two states of one disclosure. Users
  read them as different things, so give them a `.viewseg`; a control that
  toggles between them reads as neither.
- Group controls by proximity, split by what they act on: `.dex-controls` holds
  controls that change how the list is **filtered, ordered or presented** (search,
  filter, sort, collapse, density); `.collacts` holds actions on the **data itself**
  (add, read a save, backup & restore). Never mixed.
- A view-style switch (gallery vs table) is a `.segrow.viewseg` right-aligned in
  that view's heading block (`margin-left:auto`), so it costs no extra vertical
  space and reads as a property of the view rather than a filter. It is hidden
  when the pane it governs is not showing. `.dexcontrols` becomes a 2-column
  grid at ≤640px, which is worth ~79px against the same controls in a
  single-column stack; controls whose text cannot shrink (search, sort, a
  segmented group) take `.ctlwide` and span both columns.
- A control in `.dex-controls` whose purpose isn't obvious from its own text carries
  a visible `.ctl` label. A bare select whose only label is a prefix inside its own
  options ("Sort: Name") is not labelled. A self-describing button ("Collapse all")
  or switch ("Compact rows") takes a `<label aria-hidden="true">&nbsp;</label>`
  spacer instead — that is alignment, not a label, and it is hidden on mobile.
- A `<label for>` pointing at a control that `makeIconSelect` has replaced names
  nothing: the native select is `aria-hidden`. `makeIconSelect` re-points the label
  at the button it draws — don't remove an `aria-label` assuming the label covers it.
- Progressive disclosure for optional complexity (`.moredet` details, slot reveal).

## 10 · Verification recipes

```sh
# serve — 8848 is the port tools/e2e/lib.js expects; reuse the server if already bound
python -m http.server 8848
# console-error smoke test
msedge --headless=new --disable-gpu --enable-logging=stderr --virtual-time-budget=5000 --dump-dom http://localhost:8848/index.html
# the standing gate — the whole-app state matrix (axe + overflow + focus, cold and
# lived-in, every view/modal/popover, mobile pass): node tools/e2e/states.js
# The save reader's own state matrix: node tools/e2e/a11y.js
# Both build on tools/e2e/lib.js + audit.js (Playwright + axe-core, installed in
# tools/node_modules — no scratch npm install). For states beyond the matrix,
# require() lib.js by absolute path from a scratch script; open({viewport, hash})
# returns a page with console errors, pageerrors and 404s captured and the service
# worker cleared. audit.js settles animations before axe.run — mid-fade sampling
# flakes contrast checks.
# Canonical viewports: 320 · 360 · 390 · 768 · 1366 (320 is the 1.4.10 reflow floor).
# Seed lived-in state via localStorage keys:
#   palbreed_owned (array of species keys), palbreed_roster, palbreed_plans, palbreed_tipseen='1'
# deep links to exercise: #/breed/SheepBall/ElecCat  #/pal/Anubis  #/plan/SheepBall+ElecCat/Anubis
```

Measure claims (getBoundingClientRect / getComputedStyle); screenshot evidence for
visual claims; contrast ratios computed, not eyeballed.

`audit.js` exposes two focus checks and they are not interchangeable. `focusSane`
asks only whether focus **exists** — it catches the `<body>` drop. `focusVisible`
asks whether the user can **see** it: at least half the control, or 24px, below
the sticky header and inside the viewport. Every hand-off that crosses tabs or is
followed by an author-initiated scroll wants the second one, because focus on a
real control that a later `scrollIntoView` carries off-screen passes the first and
is still a 2.4.11 failure — which is how it shipped twice.

## 11 · Known-clunky backlog (ux-designer: start here)

- **Breedable now is 239 tab stops at "Any chain"** — 234 result cards plus the five
  controls, one stop per card, measured on the §10 seed (4 owned; a 34-species
  roster gives 263). §4 settles that a grid board is **one** stop with a
  roving `tabindex`, which `.dexgrid` and `.roster.tileview` both do through
  `gridStep`. `.hatchgrid` is the last grid in the app that doesn't, and it is the
  hardest one: its cards are disclosures whose panel is appended **into** the grid
  between them, so the roving model has to survive a full-width row appearing
  mid-board — the same problem `.rospanel` solved, and the reason geometric
  movement exists.
- **`.hcard` renders at two heights, 62px and 94px**, because a card carrying both
  a rarity badge and its `.ways` count wraps to a second line. At "Any chain" that
  is most of the board, so rows come out ragged (216 of 253 cards tall at 1366;
  three columns at 900 is the worst case). Either let the count sit under the name
  always, or drop the rarity badge from a card whose job is "can I breed it".
- **`.hcard` is the one canon card with no fill delta from its container.** It is
  `--surface` on a `--surface` `.pcard`, so `--border` at **1.36:1** (and
  `--border-strong` at 1.82:1 on hover) is the only thing delimiting the control —
  §1 forbids a sub-3:1 border as the *sole* boundary indicator. Every other card
  has the delta (`.pair` is `--surface` on the panel's `--bg`). The art and bold
  name still read as a discrete item, so this wants a §1 decision on card-on-card
  nesting rather than a one-off patch.

- **The Planner's start slots reflow every time one is revealed.** `.slotgrid` is
  `auto-fit`, and `[hidden]` slots collapse their tracks — so slot 1 alone is a
  1076px species picker at 1366, and filling it halves the width of the control
  under the user's cursor. Fixed `repeat(4,…)` tracks would hold the row still and
  advertise how many starters the planner takes; needs a look at 768–900 first.
- **`.spal` and `.strip` duplicate `.tchip` and `.chiprow`** to within 1–1.5px, and
  `.prog` duplicates `.mchip`. Now that the strip is a roving toolbar it is doing
  `.chiprow`'s documented job under a second name.
- **"passive carrier line" renders on every step of a carrying route** — it is a
  property of the route, not the step, which §4 already settles for Find parents'
  badge column. `.rsummary` says it once. A per-row signal would have to be one
  that varies, e.g. only the steps where the odds actually drop.
- **The route tree eats vertical swipes at 360**: `.tvp` is `touch-action:none` and
  23% of the viewport height, sitting in the scroll path. `pan-y` would keep page
  scroll and the horizontal pan these trees actually need.
- **`Clear inputs` sits in section 1 and clears section 2 as well.** Reduced, not
  closed: two of the three things it clears (the start pals, the passives to
  carry) now live in section 1, and its title names all three. Only the target
  still reaches across a section band.
- **`.accb.mid` / `.accb.alpha` and `.tier.common/rare/epic` carry six raw
  `rgba()`s** between them, outside §1's two-alpha tint recipe, and use
  `--neutral`/`--water`/`--dark` (*element* colours) for catch difficulty and
  rarity. Computed 6.33 / 6.15 / 5.98 / 5.31:1, so this is token discipline, not
  contrast — wants `--neutral-tint/line` and `--dark-tint/line` and matrix rows.

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
- **`.recipe` is a `<div>` of `<span>`s** — five ingredient lists AT cannot count
  or navigate, with no "Recipe" noun anywhere. `<ul aria-label="Cake recipe">` +
  `<li class="mchip">` costs nothing; `.recipe{display:flex}` already handles it.
  The Ancient Breeding Facility's ingredients are inline prose while the five
  cakes are chips — same content, two presentations (§4 reuse-first).

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

- **Duplicate uses `⧉` (U+29C9), which is not on §7's plain-symbol allowlist**
  (`★ ☆ ♂ ♀ ✕ → ✓ ⇄ ✎ ↗ ×`), and §7 says not to add one where a Lucide icon
  exists — it has `copy`. It does render (13×16px in Segoe UI), so this is a
  policy deviation rather than a broken glyph; `.tchev` in the same component
  family is already inline SVG, so the swap is consistent as well as compliant.
- **"Save" is a verb in three roster controls while §6 reserves it for the
  Palworld game file** — `✓ Save changes`, `+ Save & add another` and `Read my
  save` sit in one flow. "Save changes" is unambiguous and universal, so the
  likely resolution is amending §6 to reserve the *noun* only. Logged so the
  decision is made rather than drifting.

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

- **The pal card's CSS carries a dozen off-scale values.** §2's scale is 4·8·12·16·20·24·32
  and the card predates it: `.msec{margin-top:18px}`, `.msec h3{margin-bottom:9px}`,
  `.stat{padding:7px 12px}`, `.pskill{padding:14px 16px}`, `.mbtns{gap:10px}`,
  `.mbtns .alink{padding:9px 18px}`, `.crow{gap:7px;margin-top:7px}`. The dialog
  chrome was moved onto tokens in 302765a (`.overlay`, `.modal`, `.mbar`, `.mnav`,
  `.mtitle`, and `.zk`'s off-scale 16px → `--fs-lg`); the section interiors were
  left alone deliberately, because each is a 1–2px change across seven rules and
  the visual diff is worth reviewing on its own rather than buried in a focus fix.

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
