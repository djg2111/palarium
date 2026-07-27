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
| `--text` on `--gold-tint` over `--surface` | — | 14.15 | — | — | AA — the owned Paldex tile |
| `--muted` on `--gold-tint` over `--surface` | — | 5.70 | — | — | AA — a tinted fill costs ~0.2 against the plain surface |
| `--border-strong` | 1.99 | 1.82 | 1.66 | 1.50 | **Decorative only** — a border below 3:1 must never be the sole indicator of a control's boundary or state; pair with a fill, icon, or text change |

Dark-theme rules: accents stay in this desaturated range — no saturated pure hues
(they vibrate on dark). Text is dimmed white (`--text`), never `#fff`. Large solid
areas of accent color are avoided; accents are for interactive elements and meaning.

## 2 · Spacing & radius

Spacing tokens: `--sp-1…7` = **4 · 8 · 12 · 16 · 20 · 24 · 32**. New rules use the
scale; existing off-scale values (7, 9, 11, 13, 14, 18, 22, 26…) migrate
opportunistically when a rule is already being touched — no mass rewrites.

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
| Quiet/tertiary | `.tx`, `.thbtn`, text-styled buttons | no border until hover | Dismiss, inline meta actions |
| Icon | `.star`, `.tvp-ctrl button`, `.mnav`, `.close` | square/round, ≥24px hit area | Single-glyph actions, always `aria-label` |
| Switch | `.toggle` (+ `.kn`) | pill + knob, `role="switch"` | Boolean filters/options; label states the *outcome* ("Pairs I can make") |
| Segmented | `.segrow`, `.srcrow` | joined buttons, one `.on` | Mutually exclusive small sets |

Required state coverage for every interactive element: default · hover · focus-visible
(2px `--accent` outline, offset 2 — global rule exists, don't suppress it) · active ·
disabled (`opacity:.35`, no hover). Hover on touch devices must not gate any
information (see §8 tooltips).

Other canon components: `.pcard` (view card), `.hint` (empty state — must include a
next action), `.warnbox` (inline warning), `.toast` (feedback ≤8s, with Undo for
destructive), `.pchip` (passive), `.tchip` (pal chip), `.badge` (outcome kinds),
`.mchip` (meta), `.picker` (pal select), `.ptag` (tag input), `.needrow`, `.rsummary`.

Paldex (two views over one pipeline — recognising 299 distinct arts to mark
what you own, versus comparing seven columns of numbers; a grid cannot do the
second and a table is worst at the first):

| Class | Role |
|---|---|
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
| `.rosband` | The species header band. One implementation, two homes: a Rows section and the panel header. |
| `.roster` | The grid. `.tileview` auto-fills a **single 120px track** above 640px and 96px below; `.rowview` is a single column. One track, not a ladder — every extra breakpoint steps the tile up and the column count down, so a wider window produces a *taller* board. |
| `.chiprow` | The chip line inside a header band or a tile. |
| `.roslist` / `.rosrow` | The section's `<ul>` and one pal per `<li>`. Fixed grid tracks (identity · passives · note · actions) so columns align down the whole section. Replaces the former `.rospal` **and** `.gentry`. |
| `.mchip.warn` | A meta chip carrying a warning — `--danger` text, tint fill, `--danger-line` border. Always states the warning in words; colour is never the only signal. |
| `.rentacts` | The full, named action set for one entry, inside its pal card. Row toolbars stay to three glyphs; everything else lives here at comfortable size. |

**Grid boards are one tab stop.** `.roster.tileview` and `.dexgrid` both use a
roving `tabindex` over their items. Vertical movement should be **geometric** —
find the adjacent row by `getBoundingClientRect().top`, then the nearest column
by centre x — never `index ± columns`, which clamps to the last item when a row
is short and strands you somewhere you were never focused, and cannot see a
full-width panel splitting the board into rows of unequal length.
`.roster.tileview` does this; **`.dexgrid` still uses index arithmetic** and is
listed in §11.

**Row action toolbars** use `role="toolbar"` with roving `tabindex` (arrows/Home/End
move within, Tab leaves), so a row costs **two** tab stops — its name and its
toolbar — not one per action. Actions are revealed on hover only under
`@media (hover:hover)`; under `@media (hover:none)` they are always visible, and the
gutter is reserved in both cases so nothing shifts.

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
  (saved route) · **partner** (non-line parent in a step) · **missing** (a species
  you have not starred and do not have in your roster — the complement of
  *owned*) · **backup** (Palarium's own
  JSON file — you export and restore it) · **save** (the Palworld game file — Palarium
  only ever reads it). Never use the bare word "import" as a button label for either:
  it named two unrelated jobs and told the user nothing about which one they were in.
- The Paldex counts **species**; the Roster counts **pals**. Never say "pals"
  for a Paldex count — 299 is a species total, not an individual one.
- Sentence case for all labels, buttons, and tab names. Title Case is not used.
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
   polished UI.

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
  see the Enter-synthesized-click bug note in `js/app.js` makePicker.close), Escape
  closes topmost layer only, tab is trapped in dialogs, roving tabindex on tablists,
  re-renders re-focus the successor of the focused element.
- Tooltips (`title`) are enhancement only — any load-bearing information also exists
  inline, on tap, or in visible text (touch has no hover).
- `aria-live="polite"` on counts/status that change from filtering; toasts live in the
  existing polite region.

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
# serve
python -m http.server 8123
# console-error smoke test
msedge --headless=new --disable-gpu --enable-logging=stderr --virtual-time-budget=5000 --dump-dom http://localhost:8123/index.html
# axe + interaction harness (scratch dir): npm i puppeteer-core axe-core
# then drive Edge at 360/390/768/1366px; seed lived-in state via localStorage keys:
#   palbreed_owned (array of species keys), palbreed_roster, palbreed_plans, palbreed_tipseen='1'
# deep links to exercise: #/breed/SheepBall/ElecCat  #/pal/Anubis  #/plan/SheepBall+ElecCat/Anubis
```

Measure claims (getBoundingClientRect / getComputedStyle); screenshot evidence for
visual claims; contrast ratios computed, not eyeballed.

## 11 · Known-clunky backlog (ux-designer: start here)

- **The save reader's conflict segrow** (`js/app.js`, `renderSavePreview`): Combine /
  Keep mine / Use the save's explain themselves only in `title` attributes. On touch
  that is three unexplained words deciding whether a nickname survives. Wants one
  visible line under the segrow describing the selected option — the same fix the
  backup flow's `#smBackupEffect` already uses.
- **Port the roster's geometric grid navigation to `.dexgrid`** (§4). The Paldex
  still uses `index ± columns`, so on any width where 299 % columns ≠ 0, ArrowUp
  off the short last row returns to a column you were never in.
- **Bulk select & remove in the roster**: after reading a save you often want to drop
  a dozen duds; that is a dozen separate ✕ presses and a dozen toasts. Wants a
  checkbox column and one bulk action bar with a single Undo. New selection model, so
  it did not belong in the layout pass.
- **Toast Undo is far from the keyboard**: `.toasts` sits at the end of `<body>` and
  is never focused, so reaching Undo means tabbing past the whole page. App-wide, not
  specific to one view.
- **Emoji migration (§7)**: replace remaining pictographic emoji with game assets or
  Lucide SVGs — 🎮 (Read my save), 🍰 (guide; `items/cake.webp` exists), 🧬 mutation
  marks (`ui/egg/mutation.webp`), 🐣, 🔍, 🗺, 🌙 nocturnal, 🌳 tree button,
  🍖 food stat, ⚠ warnboxes, 🎲 odds, 📦, 📍.
- View heading inconsistency — Breed and Find parents still have no heading block
  (Paldex now has one).
- Toggle label grammar varies across views (§4 switch rule).
- Select conventions: the Roster's and Paldex's selects now carry visible `.ctl`
  labels (§9); **Skills** still uses bare, unlabelled selects and should follow.
- The picker's `@media(max-width:640px)` block (`.pop .list` / `.pop .row`) is a
  species tile hard-coded into a popover at one breakpoint. It should be
  refactored onto `.dexgrid`/`.dextile` so there is one tile implementation.
