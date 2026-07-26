# The Palworld save format, as far as it is understood here

Everything below was established against real Palworld **1.0.1** saves and, where
it says so, verified byte-for-byte against a second implementation. Where
something is a guess it says it is a guess. Where something is unmapped it says
it is unmapped — that is the interesting part, and the point of this document is
to let the next person pick up mapping it.

The shipped reader is [`js/savparse.js`](../js/savparse.js). It reads exactly one
thing — the pal list — and deliberately ignores the rest. Everything else in a
save is still open.

**Read-only, always.** Nothing here writes a save, and nothing here should. A
corrupted `Level.sav` is somebody's world.

**A real save never enters the repo.** It carries a Steam ID, a world GUID and
player names. `.gitignore` blocks `*.sav` with a single carve-out for the
synthetic fixtures in `tests/`.

---

## 1. Where saves live

```
%LOCALAPPDATA%\Pal\Saved\SaveGames\<steam64>\<worldGUID>\
    Level.sav          the world — this is the one with the pals in it
    LevelMeta.sav      a small header: world name, player count, timestamps
    LocalData.sav      per-device settings and loadouts
    WorldOption.sav    the world's difficulty settings
    Players\<uid>.sav  one per player character
%LOCALAPPDATA%\Pal\Saved\SaveGames\<steam64>\
    GlobalPalStorage.sav   cross-world pal storage (mostly empty slots)
```

---

## 2. The container

| offset | size | meaning |
|---|---|---|
| 0 | u32 LE | uncompressed size |
| 4 | u32 LE | compressed size — equals `fileLength - 12` |
| 8 | 3 bytes | magic |
| 11 | 1 byte | compression type |

**The magic is `PlM` on Palworld 0.6 and later, including 1.0.** It was `PlZ`
before that. This single fact breaks every pre-0.6 tool and script, because:

- `PlZ` + `0x31` → the payload is **zlib**. `0x32` means zlib twice (an inner
  12-byte header then a second stream). Browsers read this natively with
  `DecompressionStream('deflate')`.
- `PlM` + `0x31` → the payload is **Oodle**, which no browser can read and which
  has no published format description. Hence the port in `js/savparse.js`.

In a long-running world you will see both, because a file keeps its old format
until the game rewrites it. `WorldOption.sav` in a world created in 2024 is
still `PlZ` while `Level.sav` beside it is `PlM`.

Run [`tools/sav-oodle.js`](../tools/sav-oodle.js) on any save to see which.

### 2.1 Oodle framing

Verified byte-exact on five real saves — the walk lands on the file length to
the byte in every case, which is the check to run first on anything new.

```
per block of at most 256 KB of OUTPUT:
    u8  b0        (b0 & 0x0F) must be 0x0C
                  (b0 >> 6) & 1  = block is stored uncompressed
                  (b0 >> 7) & 1  = decoder restart
    u8  b1        b1 & 0x7F      = decoder type   (10 = Mermaid/Selkie)
                  b1 >> 7        = quantum CRCs present
  per quantum:
    3 bytes big-endian v
        compressed length = (v & 0x3FFFF) + 1
        bits 18,19 are flags
        if CRCs are present, 3 more bytes follow
    if compressed length == block length -> the block is stored verbatim
    if compressed length == 0            -> the block is all zero
```

Every block in every Palworld save seen so far is **decoder type 10**.

The stored-verbatim case is worth knowing: it is what lets
[`tools/make-fixture.js`](../tools/make-fixture.js) write a valid save without an
Oodle compressor, which does not exist outside Rad Game Tools.

### 2.2 Mermaid/Selkie, inside a quantum

```
per chunk of at most 128 KB of output:
    3 bytes big-endian h
    if h >= 1<<23:
        chunk type = (h >> 19) & 0xF     0 = sub literals, 1 = raw literals
        comp len   =  h & 0x7FFFF
        if comp len >= chunk len -> the chunk is stored verbatim
        else -> the LZ layer below
    else:
        the whole chunk is one entropy-coded literal array
```

The LZ layer, per chunk:

```
if this chunk starts at output offset 0:
    8 bytes copied raw          <- there is no history to match against yet
array: literals                 <- see 2.3
array: packets                  <- see 2.3
if chunk length > 64 KB: u16 LE  count of packets belonging to the first half
u16 LE numOff16
    0xFFFF -> two arrays follow, the high and low bytes of the offsets
    else   -> 2*numOff16 bytes of little-endian offsets, inline
u24 LE off24 header
    0 -> no escape offsets
    else: counts n1 = h>>12, n2 = h&0xFFF, each 0xFFF meaning "u16 follows"
          then n1 then n2 escape offsets, each u24 LE, and if the value is
          >= (1<<24)-(1<<22) one more byte shifted left 22
everything remaining is the excess stream
```

The chunk is then decoded in **two halves of at most 64 KB each**, using the
packet split above; escape offsets are per half, and are measured from the start
of that half rather than from the current output position.

Packet grammar, one byte each:

| packet | meaning |
|---|---|
| ≥ 128 | literal run `p & 7`, match length `(p >> 3) & 0xF`, **reuse** the last offset |
| 24–127 | literal run `p & 7`, match length `(p >> 3) & 0xF`, take a **new** offset from the off16 stream |
| 3–23 | match of `p - 3 + 8`, offset from the escape-offset stream |
| 2 | long match: `21 + 8 + excess`, offset from the escape-offset stream |
| 1 | long match: `91 + excess`, new offset from the off16 stream |
| 0 | long literal run: `64 + excess` |

Whatever is left of the half after the last packet is literals.

An excess value is one byte, or — if that byte is > 251 — that byte plus
`u16 LE << 2`.

The minimum offset is 8, which is why the decoder can copy matches eight bytes
at a time and why a plain forward byte copy gives the same answer.

### 2.3 Arrays

Every array begins with a header that gives its type and length:

```
first byte >= 0x80:  type = (b >> 4) & 7
    type 0 -> u16 BE header, length = h & 0xFFF, data follows
    else   -> u24 BE header, comp len = h & 1023, out len = ((h>>10)&1023)+compLen+1
first byte <  0x80:  type = b >> 4
    type 0 -> u24 BE header, length = h & 0x3FFFF, data follows
    else   -> 5-byte header: v = (b0 << 32) | u32BE(b1..b4)
              type must equal v >> 36
              comp len = v & 0x3FFFF, out len = ((v >> 18) & 0x3FFFF) + 1
```

| type | what |
|---|---|
| 0 | uncompressed |
| 1 | TANS — **never seen in a Palworld save; not implemented** |
| 2 | Huffman, 3 streams |
| 3 | RLE |
| 4 | Huffman, 6 streams |
| 5 | split / multi-array — **never seen; not implemented** |

**The trap: "Selkie means raw literals" does not mean "no entropy coding".**
Palworld's literal arrays are type 0, but its **packet arrays are type 4**. A
decoder that skips the Huffman layer dies on the second array of the first
chunk. Across four real saves the types present are 0, 3 and 4.

`js/savparse.js` raises a named error rather than guessing if it ever meets 1 or
5. `tools/sav-oodle.js --arrays` will tell you if a new save uses them.

---

## 3. GVAS

The decompressed bytes are a standard Unreal `GVAS` save.

```
"GVAS"
u32  save game file version        (3)
u32  package file version UE4      (522)
u32  package file version UE5      (1008)
u16 u16 u16                        engine 5.1.1
u32  changelist                    (0)
FString branch                     "++UE5+Release-5.1"
u32  custom format version         (3)
u32  custom version count          (85 in Level.sav, 0 is legal)
     count × (16-byte GUID + i32)
FString save game class            "/Script/Pal.PalWorldSaveGame"
then the root property list
```

### 3.1 Strings

An `FString` is an `i32` length then the bytes.

- **positive** — that many bytes of ASCII/latin-1, including a trailing NUL
- **negative** — that many *characters* of **UTF-16LE**, including a trailing NUL

Get the negative case wrong and every save with a non-ASCII nickname reads as
garbage. `tests/fixture-before.sav` carries a deliberately non-ASCII nickname so
this is covered by a test rather than by trust.

- **zero** — the empty string, and no bytes follow

### 3.2 Properties

```
FString name          "None" ends the list
FString type
u64     size          the size of the VALUE only
...type-specific header...
value
```

The type-specific header is where almost every parser bug lives:

| type | between size and value |
|---|---|
| `StructProperty` | FString struct type, 16-byte GUID, 1 flag byte |
| `ArrayProperty` | FString inner type, 1 flag byte |
| `MapProperty` | FString key type, FString value type, 1 flag byte |
| `EnumProperty` | FString enum name, 1 flag byte |
| `ByteProperty` | FString enum name, 1 flag byte |
| `BoolProperty` | **the value byte**, then 1 flag byte — and `size` is 0 |
| everything else | 1 flag byte |

**Three traps, all of which desync every property after them:**

1. `EnumProperty` and `ByteProperty` carry an enum-name string before the flag
   byte. Skipping by `size` alone lands short by the length of that string.
2. `BoolProperty` has `size == 0` and occupies two bytes that `size` does not
   account for. Skipping by `size` lands one byte short.
3. `size` counts the value, not the header. To step over a property you need
   `dataStart + size`, not `propertyStart + size`.

All three were found by [`tools/sav-explore.js`](../tools/sav-explore.js) walking
a real save and running off the end.

### 3.3 Containers

**Array of struct** — `u32` count, then a full property header (name, type,
size, struct type, GUID, flag), then the elements.

**Map** — `u32` "keys to remove" (always 0), `u32` count, then key/value pairs.

**Inside a map or a non-struct array, values are stored BARE**: no name, no
type, no size, no flag byte. Just the value. Reading them with the
property-header-aware reader eats a byte that is not there.

**A struct key or a struct array element is stored one of two ways, and nothing
in the header says which:**

- a property list terminated by `"None"` — e.g. `CharacterSaveParameterMap`'s
  `{PlayerUId, InstanceId}`, `ItemContainerSaveData`, `CharacterContainerSaveData`
- the raw bytes of a known struct — a bare 16-byte `Guid` for
  `BaseCampSaveData`, `GroupSaveDataMap`, `GuildExtraSaveDataMap`; 4-byte
  `Color` for a palette array

You have to sniff it. `sav-explore.js` does, and reports which form it found;
a real parser needs a per-map rule.

Known POD struct types: `Guid` (16), `Vector` (3×f64), `Quat` (4×f64),
`LinearColor` (4×f32), `DateTime` (u64), `Color` (4 bytes).

---

## 4. What is in `Level.sav`

`worldSaveData` is a `StructProperty<PalWorldSaveData>`. Its children, with
sizes from a lightly-played 202-pal world — the proportions are the point, not
the absolute numbers:

| child | type | size | mapped? |
|---|---|---|---|
| `CharacterSaveParameterMap` | Map | 749 KB · 203 | **yes** — §5 |
| `MapObjectSaveData` | Array | 1.6 MB | no |
| `FoliageGridSaveDataMap` | Map · 389 | 221 KB | no |
| `MapObjectSpawnerInStageSaveData` | Map · 1 | 4.0 MB | no |
| `WorkSaveData` | Array | 12 KB | no |
| `BaseCampSaveData` | Map · 2 | 6 KB | no — Guid keys |
| `ItemContainerSaveData` | Map · 477 | 648 KB | no |
| `DynamicItemSaveData` | Array | 170 KB | no |
| `CharacterContainerSaveData` | Map · 5 | 52 KB | partly — §6 |
| `GroupSaveDataMap` | Map · 5 | 8 KB | no — guilds, Guid keys |
| `GuildExtraSaveDataMap` | Map · 1 | 4 KB | no |
| `GameTimeSaveData` | Struct | 123 B | no |
| `EnemyCampSaveData` | Struct | 20 KB | no |
| `DungeonPointMarkerSaveData` | Array | 57 KB | no |
| `DungeonSaveData` | Array | 216 KB | no |
| `DungeonLevelVersion` | Enum | — | no |
| `InvaderSaveData` | Map · 2 | 346 B | no |
| `OilrigSaveData` | Struct | 3 KB | no |
| `SupplySaveData` | Struct | 1 KB | no |

The pal list is the **first** child, and Oodle matches only ever reach
backwards, so the reader can decompress a prefix and stop. That is what makes a
400 MB save cost ~3 MB of buffer instead of several GB.

### 4.1 `RawData` is a second property tree

Many values carry a `RawData` field: an `ArrayProperty` of `ByteProperty` whose
bytes are **themselves a property tree** and must be parsed again. This is the
step naive parsers miss, and it is where every per-pal field lives.

`CustomVersionData` sits right beside it and is **not** a property tree — it is
a version blob. Sniff before parsing; `sav-explore.js --raw` does.

---

## 5. A pal

`worldSaveData.CharacterSaveParameterMap`, 203 entries in a 202-pal world.

**Key** — a property list:

| field | type | |
|---|---|---|
| `PlayerUId` | Guid | the owning player, all-zero for unowned |
| `InstanceId` | Guid | **stable per-instance id** — what the roster links to |
| `DebugName` | Str | usually empty |

**Value** — `{RawData, CustomVersionData}`. `RawData` parses to a single
`SaveParameter : StructProperty<PalIndividualCharacterSaveParameter>`:

| field | type | notes |
|---|---|---|
| `CharacterID` | Name | `SheepBall`, `BOSS_Anubis`, `BluePlatypus_Fire` |
| `Gender` | Enum | `EPalGenderType::Male` / `::Female` |
| `Level` | **Byte** | not Int |
| `Exp` | Int64 | |
| `Talent_HP` | **Byte** | the 0-100 IV |
| `Talent_Shot` | **Byte** | |
| `Talent_Defense` | **Byte** | |
| `PassiveSkillList` | Array[Name] | internal keys, not display names |
| `NickName` | Str | the in-game name |
| `IsPlayer` | Bool | present only on the player row |
| `IsRarePal` | Bool | lucky pal |
| `OwnerPlayerUId` | Guid | |
| `OldOwnerPlayerUIds` | Array[Guid] | |
| `SlotId` | Struct | `{ContainerId: {ID: Guid}, SlotIndex: Int}` |
| `Rank`, `Rank_HP`, `Rank_Attack`, `Rank_Defence` | Byte | condenser / souls |
| `EquipWaza`, `MasteredWaza` | Array[Enum] | active skills |
| `Hp` | Struct FixedPoint64 | |
| `FullStomach` | Float | |
| `FriendshipPoint` | Int | |
| `GotStatusPointList`, `GotExStatusPointList` | Array[Struct] | stat points spent |
| `WorkerSick`, `CurrentWorkSuitability` | | base workers |

**Traps:**

- **`SlotID` does not exist.** It is `SlotId`, and it is a struct, not a number.
- **`Level` and the three `Talent_*` are `ByteProperty`.** Reading them as ints
  yields a silent 0 for every pal, which looks exactly like a world full of
  level-1 pals with no IVs.
- **Unreal only serialises non-default values.** Of 202 pals: 192 have `Level`,
  199 have `Talent_Shot`, 180 have `PassiveSkillList`. A missing field means the
  default — level 1, IV 0, no passives — not a parse failure.
- **The player is in this map**, with `IsPlayer` and **no `CharacterID`**.
  Filter on both.
- **`BOSS_` prefixes an alpha.** `RAID_`, `GYM_`, `PREDATOR_` and the `_Oilrig`
  / `_Tower` suffixes also appear and are not in the Paldex.
- Passive keys are `DT_PassiveSkill_Main` row names. `js/data.js` ships them as
  `passives[].k`; see `tools/gen-data.js`.

---

## 5a. `LevelMeta.sav` — naming a world

Two kilobytes beside every `Level.sav`, and the only cheap way to tell one
world folder from another. **Mapped and in use** — it is what the folder picker
lists worlds by.

```
Version    Int
Timestamp  Struct<DateTime>              when the world was last saved
SaveData   Struct<PalWorldBaseInfoSaveData>
    WorldName        Str    "Palpagos Islands"
    HostPlayerName   Str    "Horus"
    HostPlayerLevel  Int    34
    InGameDay        Int    73
```

`Timestamp` is a UE `DateTime`: 100-nanosecond ticks since year 1, so
`ms = ticks / 10000 - 62135596800000`.

**Getting at the folder at all is its own problem, and the obvious API is the
wrong one.** Palworld saves live under `%LOCALAPPDATA%`, and Chrome blocklists
the entire AppData tree as system files — `showDirectoryPicker` refuses it
outright with "this folder contains system files", which makes the File System
Access API useless for exactly the one folder that matters. The older
`<input webkitdirectory>` is not on that blocklist, works in every browser
here, and hands back a flat `FileList` with `webkitRelativePath`. The cost is
that there is no handle to keep, so the folder cannot be remembered between
visits. Chrome also words its confirmation as "upload", which the UI has to
pre-empt: nothing is uploaded.

Skip anything under a `backup/` segment. Palworld keeps timestamped copies of
every save there, and they are not worlds anybody is playing.

---

## 5b. Per-player records — `Players/<uid>.sav`

`SaveData : PalWorldPlayerSaveData`. **Surveyed, not consumed.** The joins
below were checked against a real save; nothing in the app reads them yet.

| field | what | joins to |
|---|---|---|
| `RecordData.PalCaptureCount` | Map Name→Int, how many of each species caught | **78/78 keys join to `data.js` pal keys** |
| `RecordData.PaldeckUnlockFlag` | Map Name→Bool, registered in the Paldex | same keys |
| `RecordData.FastTravelPointUnlockFlag` | Map Name→Bool, waypoints unlocked | **keys are GUIDs** — see below |
| `RecordData.TowerBossDefeatFlag` | Map Name→Bool | `BOSS_BATTLE_NAME_GrassBoss` etc., needs a small lookup |
| `RecordData.RelicObtainForInstanceFlag` | Map Name→Bool, 69 Lifmunk effigies | unchecked |
| `RecordData.NoteObtainForInstanceFlag` | Map Name→Bool, 11 notes | unchecked |
| `UnlockedRecipeTechnologyNames` | Array[Name], 106 | unchecked |
| `CompletedQuestArray_FullRelease` | Array[Name], 16 | unchecked |
| `PalStorageContainerId`, `OtomoCharacterContainerId` | the palbox and party containers | `CharacterContainerSaveData` |

**The one join that does not exist yet.** `FastTravelPointUnlockFlag` is keyed
by 32-hex-character GUIDs, while `js/mapdata.js` keys its fast-travel markers by
actor name (`WorldTree_MiddleBoss_1`). Nothing currently shipped can connect the
two. It looks solvable — `tools/parse-map.js` already walks the
`BP_LevelObject_TowerFastTravelPoint_C` actors these markers come from, so
capturing each actor's GUID alongside its transform would close it — but that is
a pipeline change, not app work.

**No field/alpha boss defeat flag was found.** `Level.sav` has
`EnemyCampSaveData…RespawnBossTimeAt`, which suggests they respawn rather than
staying dead, so "alphas I have beaten" may simply not be recorded. Worth
confirming before promising it.

---

## 5c. Fog of war — `LocalData.sav`

**Found and confirmed; nothing reads it yet.** This is the most directly usable
unmapped thing in a save.

```
SaveData.WorldMapUISaveDataMap : Map<Name → Struct>   2 entries
    "MainMap" -> MaskTextureData : Array[Byte]  4,194,304 bytes = 2048 x 2048
    "Tree"    -> MaskTextureData : Array[Byte]  1,048,576 bytes = 1024 x 1024
```

The keys are **literally `MainMap` and `Tree`** — the same two layer names the
app's map already uses, which come from `DT_WorldMapUIData`. Values are `0x00`
unexplored and `0xFF` explored, with a small fraction of intermediate bytes
feathering the edges (0.4% on the sample world, which was 24% explored).

5.2 MB uncompressed, inside a 29 KB file, so it is cheap to read.

Two things to settle before trusting it: the mask lives in `LocalData.sav`,
which is **per device**, so it is one player's exploration and not the world's;
and the mask's orientation has not been checked against the map's
`swap + flipX` projection. That is a `tools/calibrate.js`-shaped job — score the
candidate transforms and see which lines the explored region up with land.

Other per-device state, unmapped: `Local_HiddenLocationFlagMap` (125),
`Local_PalEncountFlag` (92, encountered rather than caught),
`Local_NewUnlockedTechs` (206).

---

## 6. Containers

`CharacterContainerSaveData` maps a container GUID to
`{bReferenceSlot, Slots[], SlotNum, RawData, CustomVersionData}`. A pal's
`SlotId.ContainerId.ID` joins here.

`SlotNum` distinguishes them — a 5-slot container is the party. **This is
inferred from one world and is not verified**; the palbox in that world holds
slots numbered past 90. If you need party / palbox / base / viewing cage
reliably, this is the first thing to nail down, and it is not hard: dump
`CharacterContainerSaveData` with `sav-explore.js` on a save whose in-game
layout you know.

---

## 7. What is still unmapped

Essentially everything except the pal list. In rough order of how much a
breeding tool would gain:

1. **Container types** — party vs palbox vs base vs viewing cage (§6). Small,
   and it would let an import be filtered by where a pal actually is. The
   player save names two of them outright (`PalStorageContainerId`,
   `OtomoCharacterContainerId`), which is most of the answer.
2. **`GroupSaveDataMap`** — guilds, and which players belong to them. Needed for
   anything multiplayer.
3. **`ItemContainerSaveData` + `DynamicItemSaveData`** — the item stacks. Eggs
   live here, so "which eggs are incubating" is reachable.
4. **`BaseCampSaveData` + `WorkSaveData`** — bases and what pals are assigned to
   them.
5. **`MapObjectSaveData`** — 1.6 MB of world objects; breeding pens are in here.
6. **`FoliageGridSaveDataMap`, `DungeonSaveData`, `EnemyCampSaveData`** — large,
   and of no obvious use to a breeding tool.

Already surveyed and ready to use, needing app work rather than format work:
the fog-of-war masks (§5c) and the capture/Paldex records (§5b). The only
piece with a genuine unknown is the fast-travel GUID join.

The method for attacking any of them is
[save-reverse-engineering.md](save-reverse-engineering.md).
