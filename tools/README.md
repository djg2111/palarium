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
dotnet run -- json "Pal/DataTable/(Character/DT_PalMonsterParameter|Character/DT_PalCombiUnique|Character/DT_PalDropItem|PassiveSkill/DT_PassiveSkill_Main|PassiveSkill/DT_PartnerSkillParameter|UI/DT_BossSpawnerLoactionData|WorldMapUIData/DT_WorldMapUIData|WorldMapAreaData/DT_WorldMapAreaData|Spawner/DT_PalWildSpawner|Spawner/DT_PalSpawnerPlacement|Item/DT_ItemIconDataTable|Item/DT_ItemDataTable)\.uasset$" ../extract/dt

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
node zone-ramp.js                            # regenerate the spawn-density ramp
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
node partner-diff.js                           # app vs game: partner-skill rank tables
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
Its partner-skill section spells out tag and rank-table changes one by one
rather than counting them, since the Skills catalog is built on those.

---

## Traps this pipeline already accounts for

Each of these silently corrupts the data if you don't handle it.

**The game's own tables disagree on casing.** `WindChimes` in
`DT_PalMonsterParameter` vs `Windchimes` in L10N; `BluePlatypus` vs
`Blueplatypus` in `DT_PalCombiUnique`. Exact-match lookups drop real pals. All
lookups here are case-insensitive.

**A partner-skill effect can be filtered in three different fields.**
`Parameters.PalTribeIds`, `Parameters.TriggerParam.TargetTribeIds` and
`Parameters.OtherOtomoConditionParam.PalTribeIds` all narrow an effect, and a
given pal uses only one of them — Sekhmet's Anubis restriction is in the second,
with the first empty. Read one field and conclude the effect is unrestricted and
you will "find" bugs in the game that aren't there.

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

**The spawn overlay is a sequential encoding, so it is one hue.** `zone-ramp.js`
holds the hue constant (OKLCH, taken from the documented orange slot) and steps
lightness and alpha monotonically. An earlier version slid amber to red, which
is two hues doing one hue's job, and varied alpha independently of lightness so
the two channels fought. Orange rather than the conventional blue because the
surface is a satellite map: blue reads as ocean, green as forest. Five discrete
buckets, not a continuous gradient — the same call ARK's spawn maps make.

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
- **Not every EffectValue is a percentage.** Writing one on all of them said
  "+2%" where Skymarcher gives two extra mount jumps, and "+0%" where Night Owl
  is a plain on/off trait. The unit comes from the same effect table the partner
  skills use (`partner-skills.js`), so the shape of each effect says which it
  is: `craftspeed +50%` a percentage, `ridejumpcount_increase +2` a count,
  `nightowl` a flag with no number. A passive effect type with no entry in that
  table fails the build.
- `mt` (mutation-exclusive) is `AddMutationPal && !AddPal && !AddRarePal &&
  !AddWorldTreePal`. Matches all five known mutation passives exactly.
- Verified: reproduces the previous 114 entries with **zero** effect-string,
  rank or mutation-flag mismatches, and adds **Mercy Hit** (`NonKilling`,
  Rank −1), which the old dataset was missing. Confirmed breedable in-game.

## Partner skills

Everything under `ps` is first-party. The rank tables and effect tags used to be
the one pre-1.0 carry-over here, because the pal → rank-values link looked
missing: it is *not* in `DT_PalMonsterParameter`, *not* in `DT_PartnerSkill`
(50 rows, cooldowns and costs only), and not readable out of the pal Blueprint.

It is **`DT_PartnerSkill/../PassiveSkill/DT_PartnerSkillParameter`**, 682 rows
keyed by tribe, and it carries three things:

| field | what it gives |
|---|---|
| `PassiveSkills[rank].SkillAndParametersArray[].SkillName.Key` | the `DT_PassiveSkill_Main` row for that rank — five entries, one per partner-skill rank |
| `TextReferencePassiveSkills[rank].PassiveSkillIds[n]` | the rows the description text quotes, i.e. what `{ReferencePassive1_EffectValue1}` means |
| `ActiveSkill.*ByRank` | the triggered half: `MainValue`, `OverWriteCoolTime`, `OverWriteEffectTime` |

`tools/partner-skills.js` walks it. Rebuilding the carried-over tables from this
reproduced **all 215 of them exactly**, which is what made it safe to generate
the 39 that were missing as well.

Two things fall out of it that the old data couldn't express:

- **`TargetType` per effect.** Sekhmet has two `CraftSpeed` effects in one rank,
  +20% `ToBaseCampPal` and +30% `ToSelf`; the carry-over only had one of them.
  It also separates the pal's own attack (`ToSelf` → `Attack++`) from the
  player's (`ToTrainer` → `Player Atk++`), which is how those two tags were
  originally derived. Shipped as `ps.rt`.
- **Base auras are sourced.** An effect aimed at `ToBaseCampPal` or
  `ToBuildObject` reaches the rest of the base — 19 pals, tagged `Base Aura`.
  Reading the prose instead finds 23: the extra four are Jelliette and Jellroy
  (who buff only themselves, and only when both are home), Panthalus (who just
  patrols), and Sekhmet, whose base-wide effect is filtered to Anubis.

The filter is the catch here. `Parameters.PalTribeIds` is empty on Sekhmet's
row and the tribe sits in `Parameters.TriggerParam.TargetTribeIds` instead, so
checking only the first field says the +20% work speed lands on the entire
base — it does not, and the description was right all along. Conditions are
shipped as `ps.rc` and a tribe-filtered row does not earn the `Base Aura` tag.
The same block also holds `WorkType` (Jelliette's watering) and `MapObjectId`
(Sekhmet's workbenches, Ribbuny Botan's weapon factories); the last is left out
because those descriptions already name the facilities and the ids have no
display names in the data.

`ps.ru` carries the **unit** per row (`%`, `lv`, `s`, `x`, `flag`, or bare),
because the game stores every `EffectValue` as a naked number and the unit is
only implied. The map in `partner-skills.js` is the one curated part of this,
and `checkUnits` tests each one against the prose: if a description spells the
rank-1 value as "20%" the unit must be `%`, and if it spells it bare it must
not be. A wrong guess fails the build.

Two guards, both fatal rather than advisory, so a game update surfaces instead
of silently dropping data: an effect type with no entry in the table, and the
same effect+target listed twice in one rank with different values.

`node partner-diff.js` re-walks the game tables independently of the generator
and checks every shipped rank value against them — 312 rows, no mismatches.
`node probe-units.js` prints each effect type with the evidence its description
gives about the unit; run it after an update before trusting a new entry.

---

## Reading a save file

`js/savparse.js` reads a Palworld save in the browser. It isn't part of this
pipeline — it ships — but several tools here exist to check it and to map the
parts of a save nothing reads yet.

**The format itself is documented in [docs/save-format.md](../docs/save-format.md).**
**How to map more of it is [docs/save-reverse-engineering.md](../docs/save-reverse-engineering.md).**
Both are worth reading before touching any of this; the headline is that
Palworld 1.0 saves are **Oodle, not zlib** (magic `PlM`, not `PlZ`), which is
what breaks every pre-0.6 tool.

```bash
node sav-oodle.js  <Level.sav> --arrays        # census the container without decompressing
node sav-explore.js <Level.sav> [path] --raw   # walk the property tree — the mapping tool
node sav-check.js  <Level.sav> [Level.gvas]    # cross-check the reader two independent ways
node make-fixture.js                           # (re)write the synthetic saves in tests/

cd oodle-ref
dotnet run -- <in.sav> <out.gvas>              # reference decompression (OodleSharp, MIT)
dotnet run -- --oracle                         # decode oracle, for format experiments
dotnet run -- --patch <sav> <ref.gvas>         # byte-patcher, reports first changed output
```

Browser tests, all of which need a served site (`file://` breaks fetches and the
service worker) and the Chrome channel of Playwright:

```bash
node e2e/b1-import.js [Level.sav]     # benchmarks 1-2: import, then filter 200 entries
node e2e/b3-b4-merge.js               # benchmarks 3-4: collisions, and nick/note survival
node e2e/b5-b6-rest.js [Level.sav]    # benchmarks 5-6: planner, and the failure cases
node e2e/b6-scale.js 400 3000         # time and peak memory on a 400 MB save
node e2e/cancel-test.js               # cancelling a big read must not clobber the next one
node e2e/b7-folder.js [SaveGames dir] # the folder picker and the world list
node e2e/a11y.js                      # axe, keyboard and overflow across nine states
```

`sav-check.js` is the one to run after touching the reader. It diffs our
decompression against `oodle-ref` — a different implementation, in a different
language — *and* re-reads every pal with a string scanner that never walks the
property tree, because "my parser agrees with my parser" is not evidence. That
cross-check is what caught `Level` and the three `Talent_*` IVs being
`ByteProperty` rather than `IntProperty`, which otherwise reads as a silent 0 on
every pal.

A real save must stay out of the repo — it carries a Steam ID, a world GUID and
player names. `tools/saves/` is gitignored for exactly this; `tests/` holds
synthetic saves instead, and they are the only `.sav` files git will accept.
