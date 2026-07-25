# Palarium data pipeline

Everything in `js/data.js`, the pal icons, and the map assets is extracted from
**Palworld's own game files**. Nothing is scraped from another site. This folder
is the pipeline that produces them, kept so the data can be regenerated when
Pocketpair ships an update.

Last run against **Palworld 1.0.1** (game 1.0 released 2026-07-10).

---

## What you need

| | |
|---|---|
| Palworld | Steam install. Paks live at `…\steamapps\common\Palworld\Pal\Content\Paks` |
| `.usmap` mappings | Must match the game build — see below |
| .NET SDK | 8.0+ (the extractor targets `net10.0`; edit `palex.csproj` to retarget) |
| Node | 18+ |

**The mappings file is the one thing you can't automate.** Palworld ships
unversioned properties, so without a schema nothing deserialises — CUE4Parse
can't even name a field. Mappings are build-specific and must be re-fetched
after a game update.

- [Nexus: Palworld mappings](https://www.nexusmods.com/palworld/mods/2854) (needs a free account)
- Or generate your own: install UE4SS, launch the game once, dump from its Dumper tab
- Public GitHub archives ([TheNaeem/Unreal-Mappings-Archive](https://github.com/TheNaeem/Unreal-Mappings-Archive))
  exist but lag badly — they were still on 0.6.6 when 1.0 shipped

No AES key is needed; Palworld's paks are unencrypted.

---

## 1. Extract

`extractor/` is a headless replacement for the FModel GUI, built on the same
library FModel uses (CUE4Parse).

```bash
cd tools/extractor
export PAL_PAKS="C:/Program Files (x86)/Steam/steamapps/common/Palworld/Pal/Content/Paks"
export PAL_USMAP="C:/path/to/Mappings.usmap"

dotnet run -- list "<regex>" [max]        # find asset paths
dotnet run -- json "<regex>" <outDir>     # export packages as JSON
dotnet run -- png  "<regex>" <outDir>     # export textures as PNG
dotnet run -- enum "<regex>"              # dump enum value->name maps from the .usmap
dotnet run -- scan "<pathRx>" "<typeRx>" <outFile>   # sweep many packages, keep matches
```

`enum` reads the mappings rather than any asset — it's how you get the authoritative
order of `EPalElementType`, `EPalWorkSuitability` and friends. (Read the warning
about icon indices below before you trust that order for *file names*.)

`scan` exists for World Partition. `PL_MainWorld5` is only the persistent level;
the rest of the world lives in ~10,000 per-cell `.umap` packages with generated
names, so you can't select the ones you want by path. `scan` walks them all and
writes a single JSON keyed by package path, keeping **every** export of any
package that contains a type match — the actor alone is useless, since its
transform lives on a sibling component addressed by export index.

Expect ~185,000 mounted files. Everything below assumes output lands in
`tools/extract/{dt,l10n,level,maps,icons}`.

```bash
# datatables
dotnet run -- json "Pal/DataTable/(Character/DT_PalMonsterParameter|Character/DT_PalCombiUnique|Character/DT_PalDropItem|UI/DT_BossSpawnerLoactionData|WorldMapUIData/DT_WorldMapUIData|WorldMapAreaData/DT_WorldMapAreaData|Spawner/DT_PalWildSpawner|Spawner/DT_PalSpawnerPlacement|Item/DT_ItemIconDataTable)\.uasset$" ../extract/dt

# english text
dotnet run -- json "L10N/en/Pal/DataTable/Text/(DT_PalNameText_Common|DT_PalLongDescriptionText|DT_SkillNameText_Common|DT_SkillDescText_Common|DT_PartnerSkillAppendText|DT_MapRespawnPointInfoText|DT_UniqueNPCText_Common|DT_WorldMap_Common_Text_Common|DT_ItemNameText_Common)\.uasset$" ../extract/l10n

# world level (~171 MB of JSON, 31k objects) and map textures
dotnet run -- json "Maps/MainWorld_5/PL_MainWorld5\.umap$" ../extract/level
dotnet run -- png "Texture/UI/Map/(T_WorldMap|T_TreeMap)\.uasset$" ../extract/maps
dotnet run -- png "Texture/PalIcon/Normal/.*\.uasset$" ../extract/icons

# UI icon sets: elements and work suitability
dotnet run -- png "Texture/UI/(Main_Menu/T_Icon_element_0[0-8]|InGame/T_icon_palwork_(0[0-9]|1[0-3]))\.uasset$" ../extract/ui

# map markers, passive-skill icons, egg icons (separate dirs; gen-ui-icons.js
# picks the ones it needs out of each)
dotnet run -- png "Texture/UI/(InGame|Map)/T_icon_compass_[^/]*\.uasset$" ../extract/compass
dotnet run -- png "SkillIcon/T_icon_skill_pal_[^/]*\.uasset$" ../extract/passive
dotnet run -- png "InventoryItemIcon/Texture/T_itemicon_Material_PalEgg[^/]*\.uasset$" ../extract/egg

# region volumes: only 13 of ~124 are in the persistent level (see traps)
dotnet run -- scan "MainWorld_5/PL_MainWorld5/_Generated_/.*\.umap$" "PalRegionTrigger" "../extract/out/regionCells.json"

# item icons — the exact set is emitted by parse-spawns' sibling step; see below
```

## 2. Generate

```bash
cd tools
npm install                                  # sharp, for image work

node gen-data.js ../js/data.js               # rebuild the pal dataset
node --max-old-space-size=6144 parse-map.js  # markers + regions -> ../js/mapdata.js
node parse-spawns.js                         # spawn zones    -> ../js/spawndata.js
node tile-map.js ../assets/map lossless      # slice map textures into WebP tiles (z0-z4)
node z4-requant.js ../assets/map 95 --apply  # optional: halve the pyramid (see below)
node gen-ui-icons.js                         # UI + item icons -> ../assets/{ui,items}
```

`parse-map.js` needs `extract/out/regionCells.json` from the `scan` above, or it
emits a map labelled with a seventh of its regions and says so.

`gen-ui-icons.js` reads `extract/out/itemIcons.json` (item id -> texture name),
which is produced from `DT_ItemIconDataTable` against the drop lists already in
`js/data.js`. Item icons are written under the **item id**, not the texture name,
so the app can address `assets/items/<id>.webp` with no lookup table.

## 3. Verify — do not skip this

```bash
node datadiff.js <old data.js> <new data.js>   # what changed, engine fields called out
node breeding-diff.js                          # app vs game: CombiRank / combos
node calibrate.js                              # re-derive the map coordinate transform
node format-bench.js                           # size/quality per encode option
node sharpen-bench.js                          # unsharp settings for the tiler
node vector-test.js                            # raster vs traced SVG for the icon sets
```

`sharpen-bench.js` and `vector-test.js` answer questions rather than producing
assets. Both write a contact sheet — look at it, the numbers alone will happily
recommend something that has visible halos or misregistered colour seams.

`datadiff.js` separates **breeding-engine fields** (`r`, `pr`, `ic`, and the
combo table) from cosmetic ones, because a silent change to those changes every
prediction the calculator makes. It also warns when a pal key disappears —
saved rosters, plans and owned-stars are stored by key and get dropped on load.

---

## Traps this pipeline already accounts for

Each of these silently corrupts the data if you don't handle it.

**The game's own tables disagree on casing.** `WindChimes` in
`DT_PalMonsterParameter` vs `Windchimes` in L10N; `BluePlatypus` vs
`Blueplatypus` in `DT_PalCombiUnique`. Exact-match lookups drop real pals. All
lookups here are case-insensitive.

**Unreleased content sits in the shipped files.** ~87 rows have
`ZukanIndex = -1`, `CombiRank = 9999` and untranslated `en_text` names. Seven of
them have unique-combo recipes. Importing those adds phantom pals to the
Paldex, Planner and Breedable-now. The filter requires a real `PAL_NAME_*`
entry and a positive `ZukanIndex`. See `docs/unreleased-pals.md`.

**Boss/raid/gym rows look like pals.** `IsPal` is true for ~454
`RAID_`/`GYM_`/`BOSS_`/`PREDATOR_` variants, plus `_Oilrig` and `_Tower`
re-skins that share a ZukanIndex with their base species. All excluded by
prefix/suffix.

**Descriptions are rich text with exactly three tag shapes:**
`<characterName id=|Key|/>`, `<activeSkillName id=|Key|/>`, and
`<://Error_Code:126DC>` — the last is **literal text** in Xenolord's entry, not
markup. A blanket `<[^>]*>` strip eats both the skill name and that error code.

**Internal element names differ from display names:** `Leaf`→grass,
`Electricity`→electric, `Earth`→ground.

**Drops span multiple rows per pal** (one per level band); they're concatenated.

**The map is two layers, not one.** `DT_WorldMapUIData` defines `MainMap`
(`T_WorldMap`) and `Tree` (`T_TreeMap`) with disjoint world bounds. Sunreach is
*not* a third layer — it's a mask overlay on MainMap. Markers are assigned to
whichever layer's bounds contain them.

**World bounds change between versions.** 1.0 moved them ~99,000 units on X
(~562 px on the 8192 px map), so a pre-1.0 transform misplaces every marker.
Always take them from `DT_WorldMapUIData`, never hardcode.

**The projection is `swap + flipX`:** screen X tracks world Y, screen Y tracks
world X *inverted*. Established empirically by `calibrate.js`, which scores all
8 axis-swap/flip combinations by how many markers land on non-ocean pixels —
75% for MainMap and 89% for Tree, against 44% for the runner-up. Re-run it if
markers ever look offset.

**The fast-travel marker is `FTtower`, not `Teleport`.** `T_icon_compass_Teleport`
is the blue portal vortex (the one on top of Feybreak Tower); the winged emblem
the game shows for a travel point is `T_icon_compass_FTtower`, which also matches
the actor these markers come from (`BP_LevelObject_TowerFastTravelPoint_C`).
`FTUnlockMap` is the third winged variant, the map-unlocking statue.

**Passive-skill icons have no mapping table.** `T_icon_skill_pal_*` is the
passive set, keyed by effect type, but nothing in the data tables links effect
type to texture. `DT_partnerSkillIconDataTable` exists and covers all 299 pals,
but its `TextureID` (0-209) indexes a UI sprite atlas defined in a widget, not
any exported asset, so partner-skill icons are *not* shipped. The passive map in
`gen-ui-icons.js` was read off the rendered textures. The element rows are safe
(`009_NN` boost / `012_NN` resist, in the icon sheet's display order); the rest
are judgement calls, and a wrong one is cosmetic. There is no separate *active*
skill icon set — the game draws attack skills with the element icons.

**Numbered icon sets are indexed by UI display order, not by the enum.** This is
the one that will silently mislabel your whole Paldex. `EPalWorkSuitability` runs
`... Mining=8, OilExtraction=9, ProductMedicine=10 ...`, but `T_icon_palwork_08`
is the medicine flask and `09` is the oil barrel. Elements diverge earlier:
`T_Icon_element_03` is the lightning bolt, where `EPalElementType` has `Leaf` in
that slot. The orders in `gen-ui-icons.js` were read off the rendered textures.
Re-render a contact sheet and look at it before trusting any renumbering.

**Region volumes are mostly not in the level you dumped.** `PL_MainWorld5` holds
13 of ~124 `BP_PalRegionTriggerBox_C` actors; World Partition puts the other 111
in per-cell `.umap` packages. Hence `palex scan`. An actor's `AreaName.Key` joins
to `DT_WorldMapAreaData`, whose `MsgID` joins to `REGION_*` in
`DT_WorldMap_Common_Text_Common`.

**`Weight` is per row, and the useful number is its share of the group.** A pal
with weight 20 in a group totalling 60 is a third of what spawns there; the same
weight in a group totalling 600 is filler. The map shades spawn areas by that
share, so don't drop `Weight` from `spawndata.js` thinking it's unused.

**Spawners are two tables joined on `SpawnerName`.** `DT_PalSpawnerPlacement` is
where they sit (8,253 instances, 372 distinct groups); `DT_PalWildSpawner` is
what comes out (1,691 weighted rows, up to 3 pals each, with a night-only flag).
Radius and placement type are constant per group — verified 0 of 273 groups mix
them — which is what lets `spawndata.js` store bare x,y pairs. Re-check that
assumption after an update rather than assuming it still holds.

**Boss placement types are excluded from spawn zones on purpose.** `FieldBoss`,
`DungeonBoss` and `ImprisonmentBoss` are already drawn as alpha and tower
markers. Including them would double-draw every legendary.

**The pyramid goes to native (z4) and that is most of its weight.** z0-z3 total
23 MB; z4 alone is 41 MB of the 64. It's there because stopping at z3 means the
browser upscales 2x at maximum zoom, which no amount of sharpening fixes — the
map just looks soft. Individual z4 tiles average 64 KB (main) / 98 KB (tree), so
on-demand fetching stays cheap even though the set is large. If the repo size
ever becomes the problem, `z4-requant.js ../assets/map 95 --apply` re-encodes
that level to q95 in place: 41 MB -> 16 MB, mean error 1.6/255, and it is the
one level only ever viewed at 1:1. z0-z3 stay lossless either way.

**Sharpening applies only to levels that are downscales.** `tile-map.js` skips
the unsharp mask when `dim === size`, because z4 is native pixels and sharpening
those just looks processed.

**An 8192² image costs ~268 MB of RAM decoded**, regardless of file size — it
will kill mobile Safari. Hence the tile pyramid.

---

## Passives

Generated from `DT_PassiveSkill_Main`, filtered to `Category ==
SortDisplayable` — the game's own "show this in the passive list" flag, which
yields **115** rows.

- `e` is built from `EffectType1..4` / `EffectValue1..4`, lower-cased, joined
  with commas. **`(party)` is appended per individual effect**, not to the skill
  as a whole — Lucky is party-wide on defence only, so a single trailing marker
  would misattribute it.
- `mt` (mutation-exclusive) is `AddMutationPal && !AddPal && !AddRarePal &&
  !AddWorldTreePal`. Matches all five known mutation passives exactly.
- Verified: reproduces the previous 114 entries with **zero** effect-string,
  rank or mutation-flag mismatches, and adds **Mercy Hit** (`NonKilling`,
  Rank −1), which the old dataset was missing. Confirmed breedable in-game.

## The one remaining carry-over

`ps.rl` / `ps.re` — partner-skill **rank tables** (214 of 299 pals) are still
inherited from the pre-1.0 dataset. `ps.n` and `ps.d` are first-party.

What's known, so a future attempt doesn't start cold:

- The values **are** in `DT_PassiveSkill_Main`, under rows named
  `<Effect>_Partnerskill_<Archetype>_<rank>`. Verified exactly for Cattiva:
  `MaxInventoryWeight_up_Partnerskill_PinkCat_1..5` → 100/120/140/160/200,
  matching the shipped `ps.re` precisely.
- There are **62 such archetypes**. Only ~50 are named after the pal itself; the
  rest are shared skill types (`Ride`, `Otomo`, `Coop`, `SpecificElement`…).
- The blocker is the **pal → archetype link**. It is *not* in
  `DT_PalMonsterParameter` (`OverridePartnerSkillNameTextID` is `None` for the
  pals that need it), *not* in `DT_PartnerSkill` (50 rows, cooldowns/costs only),
  and *not* in the pal's own Blueprint as a readable property — `BP_PinkCat`
  contains none of the rank values.
- Matching by value-signature covers 85/214, but that is inference, not a
  linkage, so it isn't used. Guessed data shouldn't masquerade as sourced data.

The rank tables only feed a display table on the pal card. Nothing about
breeding, planning or search depends on them.
