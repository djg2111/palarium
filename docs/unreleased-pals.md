# Unreleased pals in Palworld 1.0.1

Palworld's shipped data tables contain **28 pal rows that the game never
exposes** — they have no Paldex number, and most have no name. They are not
bugs in our extraction; they are content sitting in the files.

This document exists because they are a live trap for anyone regenerating
`js/data.js`: seven of them have **unique breeding recipes**, so a naive import
adds phantom pals to the Paldex, Planner and Breedable-now. See
[`tools/README.md`](../tools/README.md) for how the pipeline filters them.

Extracted from **Palworld 1.0.1** (Steam), 2026-07-24.

---

## Answering the question directly

**Are these just placeholder values, or is there real content behind them?**

Both — it's a spectrum, and the split is sharp:

| | Rows | Data | Blueprints / rig | Art (mesh, texture, icon) |
|---|---|---|---|---|
| **Tier 1 — partially built** | 3 | real | **yes** | **no** |
| **Tier 2 — named stubs** | 7 | partly real | one skill BP | no |
| **Tier 3 — template rows** | 18 | copy-paste defaults | no | no |

**Not one of the 28 has a single art asset.** No skeletal mesh, no texture, no
icon — I checked all 424 extracted icon textures and none match. Whatever these
become, none of them can currently be *rendered*.

What Tier 1 does have is substantial: animation blueprints, boss variants,
movement blend spaces, and rigs.

---

## Tier 1 — partially implemented

These have real names, real descriptions, and a working character skeleton with
movement logic. Someone has built the mechanics; the art isn't in the shipped
build.

### Dragostrophe (`BlackFurDragon`) — 22 assets
Dark/Dragon · HP 130 / ATK 130 / DEF 110 · Rarity **10** (legendary tier) · Size L

> *"A silent beast born of the abyss. Thou shall not stand before the beast.
> Thou shall not heed the beast."*

The most complete of the three. Ships `BP_BlackFurDragon` **and**
`BP_BlackFurDragon_BOSS`, an animation blueprint pair, a skeleton, and five
blend spaces — `Move`, `AimMove`, `Riding`, `FlyingRiding`, and `Transport`.
Those last two mean it is designed as a **rideable flying mount that can carry
cargo**. Rarity 10 puts it in legendary territory.

### Boltmane (`ElecLion`) — 14 assets
Electricity · HP 100 / ATK 110 / DEF 70 · Size M · Partner skill: **Ride**

Full BP + BOSS variant, animation blueprint, skeleton, and `Move` + `Riding`
blend spaces. A rideable ground mount.

### `DarkMutant` — 14 assets
Dark · HP 100 / ATK 100 / DEF 100 · Rarity 5 · Size M · Partner skill: **Teleki Explosion**

Name is still the `en_text` placeholder, but it has a real description:

> *"Some say a beam from a DarkMutant that has perfected its technique can tear
> holes into other dimensions."*

BP + BOSS variant, animation blueprint, skeleton, `Move` + `Transport` blend
spaces. Note the partner skill has a **finished name** while the pal's own name
does not.

---

## Tier 2 — named stubs

Real or deliberately-obscured names and some authored data, but no character
blueprints or rig.

| Key | Name | Elements | Work suitability | Notes |
|---|---|---|---|---|
| `CandleWitch` | *Unidentified Pal* | Dark/Fire | Kindling 4, Handiwork 4, Medicine 3 | Only asset is a partner-skill effect BP |
| `StrawHatCat` | *Unidentified Pal* | Normal | Gathering 2, Farming 3 | — |
| `VolcanicTurtle` | *Unidentified Pal* | Fire/Earth | Kindling 5, Mining 4 | — |
| `GrassDragon` | `en_text` | Leaf | Medicine 1 | HP 130 / ATK 120 |
| `BeardedDragon` | `en_text` | Dragon | — | Size XL. Desc: *"This Pal is under investigation."* |
| `PinkKangaroo` | `en_text` | Normal | — | — |
| `WaterLizard` | `en_text` | **Fire** | — | Element contradicts the name |

*"Unidentified Pal"* is the game's own in-fiction placeholder for unknown
species, and *"This Pal is under investigation."* is its matching description —
so these three are deliberately hidden rather than merely unfinished. Four
others carry the literal developer placeholder `en_text`, and four have partner
skills named **"Tentative text"**.

---

## Tier 3 — template rows

Eighteen rows that are near-certainly copy-paste defaults: **HP 100 / ATK 100 /
DEF 100, rarity 3, size S**, no name, no description, no assets. The work
suitabilities are the only varying field, which suggests design notes jotted
into a spreadsheet rather than implementation.

`ArmorWoodlouse` · `BlueWoolRabbit` · `CuteOrca` · `ElecSnail_Fire` ·
`FrozenBear` · `IceVeilDragon` · `KingCrab` · `LeafBird` · `MedjedBird` ·
`MexicanSalamander` · `MonochromeMushroom` · `RockCheetah` · `SnakeQueen`

Five of the eighteen are **not new species at all** — they are NPC-side variants
of existing pals, and belong in this list only because they share the "no Paldex
number" trait:

| Key | What it is |
|---|---|
| `AmaterasuWolf_Dark_Quest_Enemy` | Quest-scripted Kitsun Noct |
| `AmaterasuWolf_Dark_Quest_Friend` | Quest-scripted Kitsun Noct |
| `POLICE_HawkBird` | Police-owned variant (`MaleProbability -1`) |
| `POLICE_ThunderDog` | Police-owned variant (`MaleProbability -1`) |
| `Monkey_Ice` | Ice variant of an existing monkey species |

`MaleProbability = -1` marks a pal that is never wild-caught.

---

## Why the breeding calculator is unaffected

All 28 rows have **`IgnoreCombi = true`**, which is the game's own flag for
"exclude from the breeding-average pool". Twenty-six also carry
`CombiRank = 9999`, the exclusion sentinel.

The two exceptions are the Amaterasu Wolf quest variants, which carry a real
`CombiRank` of 800 — identical to the released **Kitsun Noct**, whose species
they duplicate. Even those are `IgnoreCombi = true`, so they never enter the
pool.

**Palarium's exclusion therefore matches the game's own behaviour exactly.**
Verified: our 299 pals and their CombiRank / CombiDuplicatePriority / IgnoreCombi
values are identical to 1.0.1's.

The seven unique recipes that reference these pals (`PinkKangaroo`,
`BeardedDragon`, `BlackFurDragon`, `WaterLizard`, `ElecLion`, `GrassDragon`,
`DarkMutant` — all self-pairs, `X + X → X`) are dropped by `gen-data.js`
because their child isn't a known pal. That is why our combo count is 250 and
the raw table's is 258.

---

## How this was determined

```bash
node tools/unreleased.js          # writes extract/out/unreleased.json
```

- Rows from `DT_PalMonsterParameter` where `IsPal` is true and `ZukanIndex ≤ 0`
- Excluding `RAID_` / `GYM_` / `BOSS_` / `PREDATOR_` / `SUMMON_` / `NPC_` /
  `Quest_` prefixes, `_Oilrig` / `_Tower` suffixes, and the `Yakushima*`
  Terraria collab pals (which legitimately ship with `ZukanIndex -1` and are
  given synthetic numbers 900+)
- Names/descriptions from `DT_PalNameText_Common` and
  `DT_PalLongDescriptionText`
- Asset presence by listing every path in the pak matching each key

## Caveats

Everything above is **observation of shipped files**, not inside knowledge.
Presence of a rig does not guarantee a pal ever ships — studios cut content, and
some of these may be scrapped, renamed, or repurposed. `BeardedDragon` and
`GrassDragon` in particular look like early concepts given how generic their
data is.

The one firm inference: **Dragostrophe, Boltmane and DarkMutant have had real
engineering time spent on them**, well beyond a data row. Rideable mounts with
finished boss variants and transport blend spaces are not something you build
by accident.
