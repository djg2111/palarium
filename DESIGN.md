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
| `--bg2` | `#161b22` | Card / surface (level 1) |
| `--bg3` | `#1c2330` | Raised control, hover fill (level 2) |
| `--border` | `#2a3342` | Hairline borders, dividers (decorative) |
| `--border2` | `#3a465c` | Emphasized borders, control outlines |
| `--text` | `#e6edf3` | Primary text |
| `--dim` | `#8b98a9` | Secondary text, labels |
| `--accent` | `#4cc2ff` | Interactive / primary actions / focus rings / links |
| `--accent2` | `#7ee0a3` | Positive: passives, success, "new" |
| `--gold` | `#e3b341` | Ownership (★), rarity, unique combos |
| `--pink` | `#ff7eb6` | Warnings, destructive hover, ♀ gender |
| `--neutral` + element colors | various | Element typing only (chips/dots) |

**Elevation = lighter surface, never shadow alone.** The ladder is bg → bg2 → bg3;
popovers/toasts sit on bg2/bg3 with a border plus shadow. Don't invent intermediate
grays.

**Contrast matrix (WCAG ratios, computed 2026-07).** Approved pairings — anything not
derivable from this table needs a computed ratio before merge:

| Foreground | on `--bg` | on `--bg2` | on `--bg3` | Verdict |
|---|---|---|---|---|
| `--text` | 16.0 | 14.6 | 13.3 | AA/AAA all sizes |
| `--dim` | 6.5 | 5.9 | 5.4 | AA all sizes |
| `--accent` | 9.4 | 8.6 | 7.9 | AA all sizes |
| `--accent2` | 11.8 | 10.8 | 9.8 | AA all sizes |
| `--gold` | 9.7 | 8.9 | 8.1 | AA all sizes |
| `--pink` | 8.0 | 7.3 | 6.7 | AA all sizes |
| `--border2` | 2.0 | 1.8 | 1.7 | **Decorative only** — a border below 3:1 must never be the sole indicator of a control's boundary or state; pair with a fill, icon, or text change |

Dark-theme rules: accents stay in this desaturated range — no saturated pure hues
(they vibrate on dark). Text is dimmed white (`--text`), never `#fff`. Large solid
areas of accent color are avoided; accents are for interactive elements and meaning.

## 2 · Spacing & radius

Target scale (px): **4 · 8 · 12 · 16 · 20 · 24 · 32**. New rules use the scale;
existing off-scale values (7, 9, 11, 13, 14, 18, 22, 26…) migrate opportunistically
when a rule is already being touched — no mass rewrites. Radii: `4` (inline code/small),
`8` (small controls), `12` (inputs, cards inner), `14` (`--radius`, inputs/pickers),
`18–20` (cards, modals), `20px+`/pill (chips). Reuse the nearest existing radius;
don't add new ones.

## 3 · Typography

System stack (`"Segoe UI", system-ui, sans-serif`) — webfonts only if self-hosted,
subset, and justified (offline PWA). Base body: 15px/1.5.

Scale (px): **11 (micro labels/badges) · 12 (meta) · 13.5 (secondary UI) · 15 (body/controls)
· 19 (card headings) · 23–25 (display, result cards/modal titles)**. Weights: 400
(body), 600 (emphasis, buttons, names), 700–800 (headings, uppercase micro-labels).
Hierarchy comes from weight + color (`--text` vs `--dim`), not from adding font sizes.
Uppercase micro-labels always pair with `letter-spacing: .5–.7px` and 700+.

## 4 · Components

**Reuse-first rule: before styling anything, map it to an existing component class.
A new class requires a role no existing class covers — and gets documented here.**

Button tiers (one primary per view, never mix tiers inside one button group):

| Tier | Class | Look | Use |
|---|---|---|---|
| Primary | `.alink.primary` | accent border + accent text, hover accent tint fill | The one main action of a view/dialog |
| Secondary | `.alink` | bg2 + border, hover accent border | Everything actionable but not primary |
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
  (saved route) · **partner** (non-line parent in a step).
- Sentence case for all labels, buttons, and tab names. Title Case is not used.
- Empty states: 1 sentence of what this is + 1 action button. Errors: what happened +
  the next step, colored `--pink` *plus* text (never color alone).
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
- Group controls by proximity: filter controls in one `.dex-controls` row, actions in
  `.collacts`, never mixed.
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

- **Save-import & backup flows** (Roster header: "Read my save", "Backup &
  restore"): flows work but feel bolted-on — wants a designed sequence: what will be
  read/replaced, merge-vs-replace choice, progress state, success summary with
  counts, and clear separation between "read game save" and "Palarium backup".
- **Roster "Group by species" layout**: `.rosgroup` rows cram identity, passives,
  note, and actions into one wrapping line — poor scannability at exactly the moment
  the user has many pals.
- **Emoji migration (§7)**: replace remaining pictographic emoji with game assets or
  Lucide SVGs — 🎮 (Read my save), 🍰 (guide; `items/cake.webp` exists), 🧬 mutation
  marks (`ui/egg/mutation.webp`), 🐣, 🔍, 🗺, 🌙 nocturnal, 🌳 tree button,
  🍖 food stat, ⚠ warnboxes, 🎲 odds, 📦, 📍.
- View heading inconsistency (Breed / Find parents have no heading block).
- Toggle label grammar varies across views (§4 switch rule).
- Select conventions: "All elements" vs "Any work suitability"; "Sort:" prefix exists
  only in Roster.
