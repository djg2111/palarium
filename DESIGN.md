# Palarium Design Standards

The single source of truth for how Palarium looks, feels, and reads. Every UI change
follows this document; the `.claude/agents` (ux-designer, design-reviewer,
a11y-auditor) enforce it. When this doc and the code disagree, the doc wins — fix the
code or amend the doc in the same commit, never silently diverge.

Grounding: Nielsen heuristics, WCAG 2.1 AA + WCAG 2.2 AA additions, Material dark-theme
guidance (elevation via lighter surfaces, desaturated accents), Refactoring UI
(constrained scales, hierarchy via weight/color), Carbon/Primer button conventions.


This file is the core standard: the rules that bind every UI change. Three sections
live in their own files because most changes do not need them — **section numbers
are canonical repo-wide and unchanged**, so a code comment citing "DESIGN.md §4"
still means §4, it just lives one file over.

| § | | where |
|---|---|---|
| 1–3 | Color tokens · Spacing · Typography | here |
| 4 | **Components** — the reuse canon | [design/components.md](design/components.md) |
| 5–9 | Motion · Copy · Icons · Accessibility · Layout | here |
| 10 | **Verification recipes** — how to get evidence | [design/verification.md](design/verification.md) |
| 11 | **Known-clunky backlog** — ux-designer starts here | [design/backlog.md](design/backlog.md) |

Read this file always. Read §4 when you touch a component, §10 when you verify a
claim, §11 when you redesign a flow.

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

**An element colour used outside element typing takes the same two alphas.** Two
ramps borrow from the element palette and are not element typing: the rarity
ladder (`.tier.common/rare/epic/legendary` — grey → blue → purple → gold, the
game's own ordering, so the hues are recognition rather than decoration) and the
catch-difficulty ramp (`.accb`, green → neutral → gold → pink, with `alpha`
purple off that scale as a different kind of answer, not a harder one). Between
them they carried six hand-written `rgba()`s — five fills at `.12`/`.14` and one
border at `.35`; `--neutral-tint/line`, `--water-tint/line` and `--dark-tint/line`
now cover them at the standard alphas. Only `--dark-line` has a consumer today
(`.accb.alpha`'s border): `--neutral-line` and `--water-line` are declared for
recipe symmetry, because "exactly two alphas and no others" is the rule and a
hue with a tint but no line is the asymmetry that lets the next `rgba()` in.
Nothing else may reach into the element palette — an element colour on anything
that is not an element, a rarity or a catch tier needs a role and a matrix row
here first. Moving to `.08` *raised* every ratio (epic on `--raised` went 4.80 →
5.34), so this cost nothing but the drift; what it does cost is fill delta —
those tints are now 1.11–1.16:1 against a plain surface, firmly atmosphere, and
the uppercase word in the badge is what carries the meaning. **`.accb` never
renders on `--surface`**: `.tchip` is `--bg` and `.wildinfo` sits inside
`.rstep`, also `--bg`, so its governing numbers are the `--bg` column (6.78 and
6.57), not the surface one.

**One backdrop in the app is not flat, and the matrix cannot describe it.**
`#mapInfo` is `rgba(22,27,34,.96)` with `blur(8px)` over map art, so axe returns
`incomplete` for anything inside it ("background could not be determined") and
**the suite structurally cannot gate it** — a clean run is not a clearance here.
Measured by pixel it is 5.91 at 1280 and 5.85 at 360; the analytic worst case,
pure white map art under the `.96` panel, is 5.28. AA holds, but a pairing whose
`--surface` number is already near 4.5 must be checked against that 5.28 ceiling
before it goes in this panel.

**Elevation = lighter surface, never shadow alone.** The ladder is
bg → surface → raised → overlay; popovers/toasts sit on raised/overlay with a border
plus shadow. Don't invent intermediate grays.

**A card nested in a card takes the next rung.** A `--surface` card on a
`--surface` `.pcard` has no fill delta at all, which leaves a sub-3:1 border as
the sole boundary of a control — forbidden by the `--border-strong` row below.
The steps are small by design and that is fine: **`--surface` on `--bg` is
1.09:1** (`.pair` inside `.hatchpanel`, `#smPick`'s choice rows) and **`--raised`
on `--surface` is 1.10:1** (`.hcard` inside its `.pcard`). A rung of the ladder
is not the boundary on its own either — it is the *second* indicator that lets
the hairline count, alongside the card's own art, bold name and hover
(`--border-strong`). Note the trade, because it is not free: going up a rung
costs the hairline some of its own contrast — `--border` on `.hcard` fell from
**1.36:1** against `--surface` to **1.24:1** against `--raised`. That is the
right way round (a fill delta the eye reads plus a fainter line beats no delta
and a slightly stronger one), but it is why the rung is a *pairing* rule and not
a licence to drop the border. Nesting three deep is the smell, not the rung:
flatten instead. **A recessed well is the documented exception** — `.hatchpanel`
and `.rospanel` take `--bg`, a rung *down* from the `.pcard` they sit in, because
a disclosure panel is a hole in the board rather than something on top of it, and
its own children (`.pair`, `.rosband`) then climb back to `--surface`.

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
| `--neutral` on `--neutral-tint` | 6.78 | 6.08 | 5.50 | 4.95 | AA — `.tier.common` (Paldex `th`, so **`--bg`**; `--surface` when the row is hovered) and `.accb.mid` (**`--bg`** — see the `.accb` note below) |
| `--water` on `--water-tint` | 7.50 | 6.73 | 6.07 | 5.46 | AA — `.tier.rare` |
| `--dark` on `--dark-tint` | 6.57 | 5.90 | 5.34 | 4.80 | AA — `.tier.epic`, `.accb.alpha`. The tightest of the three, and the reason this is a matrix **row** and not one number: a `.tier` sits on the pal card's `--surface` (5.90) and on `.hcard`'s `--raised` (5.34), and `.accb.alpha` on `--bg` (6.57) — 1.23 apart end to end |
| `--border-strong` | 1.99 | 1.82 | 1.66 | 1.50 | **Decorative only** — a border below 3:1 must never be the sole indicator of a control's boundary or state; pair with a fill, icon, or text change. On the phone tab bar it is also the *floor*: `--border` measured **1.33–1.49:1** against `.bottomnav`'s composited fill depending on what scrolled under it (1.49 over the surface ladder, 1.33 over the Paldex's pal art), a hairline drawing nothing; `--border-strong` measures **1.78–1.99** over the same range. A composited bar's contrast is always a range — sample it over real scrolled content, not over the four flat surfaces |

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

**A gutter between two focusable siblings wants more than `--sp-2`.** The focus
ring is `outline:2px` at `offset:2px` — 4px of bleed per side, so at an 8px gap
two adjacent rings touch exactly and read as one box. `.mbtns` takes `--sp-3` for
this reason and is the pal card's only 12px gutter; `.rentacts` beside it is 8px
and its rings do touch. Don't unify them downward. This is also why a
migration's *horizontal* step needs checking at 320 even when the vertical one
is safe: `.mbtns .alink`/`.rentacts .alink` went `9px 10px` → `8px 12px`, and
the 2px of extra horizontal padding put four of seven buttons onto two lines at
320 (`.mbtns` 215px → 234px) while 360 and 390 showed nothing at all.

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
- **The lexicon reserves the *noun* "save"; the verb is free.** The entry above is
  about *a save* — the Palworld file. *To save* is the universal word for committing
  an edit and has no competitor, so `✓ Save changes` and `+ Save & add another` keep
  it and sit in the same roster flow as `Read my save` without ambiguity: one is what
  you do, the other is what you read. What the entry enforces is that **the noun
  always means the game file** — never "your saved data", never a backup, never a
  plan. The heading over the backup hub was `Save a backup`, which broke no rule
  about *save* but put a second verb on the **backup** entry's own action six pixels
  above a button reading `Export data`; it is `Export a backup` now, so one action
  has one verb.
- The Paldex counts **species**; the Roster counts **pals**. Never say "pals"
  for a Paldex count — 299 is a species total, not an individual one.
- Sentence case for all labels, buttons, and tab names. Title Case is not used.
- **The ≤15-word cap is for microcopy** — labels, buttons, status lines, hints,
  empty states. **Both caps are per sentence, not per string.** A paragraph of
  three short sentences is not over the cap; one 30-word sentence is, however
  short the paragraph around it.
- **Two surfaces are longform and cap at 25 words: the Guide and the save
  reader.** The Guide is prose by design. The save reader's dialog is prose by
  necessity — a privacy promise, a where-is-my-file guide and a set of parse
  errors that have to say what happened and what to do next. Measured over the
  Guide's 90 sentences the median is 14; measured over every string in the save
  reader and `savparse.js`, the median is well inside the cap and exactly **one**
  sentence was over it (27 words, the file-picker explanation), now split.
  **Anything past the cap gets split.** So the cap is the exception on both, and
  the earlier reading — seven strings at 16–27 words — was counting whole
  paragraphs against a per-sentence rule. The prose
  stays in the dialog rather than moving to the Guide: a privacy promise has to
  be where the file is chosen, and one reachable only by leaving the dialog is
  not a promise.
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
   font, no full pack in the repo). Sizes **12/13/14** inside a chip or beside a
   `--fs-sm` label, **16/18/20/24** at body size and above. **A stroke icon reads
   larger than a text symbol at the same nominal size** — Lucide's box is 20 of 24
   units plus stroke (≈0.92× nominal) where a Segoe symbol glyph runs ≈0.78×, so
   `copy` at 14 measured a 13.0px ink box against `✎`'s 9.75 in the same toolbar,
   1.33× linear and 1.5× the ink. Step a stroke icon **down one** where it sits
   among `★ ☆ ✕ ✎` rather than matching the number. Use for:
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

