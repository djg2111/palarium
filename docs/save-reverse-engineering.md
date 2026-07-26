# How to map the rest of a Palworld save

[save-format.md](save-format.md) is what is known. This is how it was found out,
and how to find out the next bit. Written for whoever picks this up next,
including a future me who has forgotten all of it.

The short version: **never trust a lead, and never trust yourself.** The brief
that produced this work confidently said the saves were zlib. They were not.
Every fact in save-format.md that survived did so because it was checked against
the bytes, and the two most damaging bugs were caught by a second implementation
disagreeing with the first.

---

## 0. What you need

| | |
|---|---|
| A real save | Ask the user. `Level.sav` from `%LOCALAPPDATA%\Pal\Saved\SaveGames\...`. **Keep it out of the repo** — put it in `tools/saves/`, which is gitignored. Never paste its contents anywhere. |
| Node 18+ | for everything in `tools/*.js` |
| .NET SDK 8+ | for `tools/oodle-ref`, the reference decompressor |
| Chrome | `tools/node_modules/playwright`, for the browser tests |

First thing, always:

```bash
cd tools
node sav-oodle.js saves/Level.sav --arrays                  # is the container still what we think?
(cd oodle-ref && dotnet run -- ../saves/Level.sav ../saves/Level.gvas)   # ground truth
node sav-check.js saves/Level.sav saves/Level.gvas          # does our reader still agree?
```

If `sav-check.js` is green, the format hasn't moved and you can go straight to
exploring. If it isn't, start at §3.

---

## 1. The tools, and what each is for

| tool | use it when |
|---|---|
| [`sav-oodle.js`](../tools/sav-oodle.js) | the container might have changed. Walks the framing without decompressing and tells you whether it lands exactly on the file length. |
| [`oodle-ref`](../tools/oodle-ref/) | you need ground truth. A ~40-line C# program over **OodleSharp** (MIT), a managed reimplementation of Oodle. Also has `--oracle` and `--patch`, see §3. |
| [`sav-check.js`](../tools/sav-check.js) | you changed the reader. Diffs our decompression against `oodle-ref` **and** re-reads every pal with a string scanner that shares no code with the parser. |
| [`sav-explore.js`](../tools/sav-explore.js) | **you are mapping something new.** This is the main instrument. |
| [`make-fixture.js`](../tools/make-fixture.js) | you want a test that doesn't depend on personal data, or you want to hand the reader a shape it has never seen. |

---

## 2. Mapping a new region — the actual loop

Say you want base camps.

**Step 1 — look at its shape.**

```bash
node sav-explore.js saves/Level.sav worldSaveData --depth 1
```

Sizes and counts for every child. Pick your target, then go down:

```bash
node sav-explore.js saves/Level.sav worldSaveData.BaseCampSaveData --depth 4 --values
```

The explorer reports what it *found*, not what it assumed: whether a map's
struct keys are a property list or a bare Guid, whether an array holds property
lists or PODs, and where a `RawData` blob stops parsing. Those notes are the
map's edges.

**Step 2 — go deeper, and turn on `--raw`.**

```bash
node sav-explore.js saves/Level.sav worldSaveData.BaseCampSaveData --depth 8 --raw --values --limit 5
```

`--raw` parses `RawData` byte arrays as the nested property trees they usually
are. Most of the interesting per-entity data is behind one.

**Step 3 — find where a name occurs.**

```bash
node sav-explore.js saves/Level.sav --find OwnerMapObjectInstanceId
```

This searches the raw bytes for the string and confirms each hit is really a
property name by checking its length prefix. It finds names inside `RawData`
blobs that a structural walk would have to opt into, and it tells you the
property type and how many times it occurs. Cheap and very fast.

**Step 4 — correlate with something you can see in game.**

This is the step that turns structure into meaning, and there is no substitute
for it. Note something checkable — a base's name, a pal in slot 3 of the party,
an item count — then find the number in the save. If you can, save again after
changing exactly one thing and diff the two decompressed files: whatever moved
is what you just changed.

```bash
node sav-explore.js saves/Level.sav  --gvas /tmp/before.gvas
#   ... change one thing in game, save, copy the new Level.sav ...
node sav-explore.js saves/Level2.sav --gvas /tmp/after.gvas
cmp -l /tmp/before.gvas /tmp/after.gvas | head -40
```

**Step 5 — write it down in save-format.md, including what you did *not*
establish.** "SlotNum 5 is probably the party, unverified" is worth far more
than silence, and far more than a confident guess.

---

## 3. When the container changes

Palworld has already changed compression once (`PlZ`→`PlM` at 0.6). Assume it
will again.

`node sav-oodle.js <save> --arrays` is the first move. It will tell you either
"framing is understood ✓" or the exact offset where the walk went wrong.

If the framing is genuinely new, the instruments that cracked it last time are
in `tools/oodle-ref`:

**`--oracle`** — a decode oracle. Feed it `<uncompressedSize> <hexOodleStream>`
lines on stdin; it prints the decoded length, the first 192 bytes, and a hash.
Use it to test a hypothesis about the framing by *constructing* a stream and
seeing whether the reference decoder accepts it. This is how the 8 raw seed
bytes at the start of a stream were found: the same chunk failed standalone and
succeeded with eight bytes prepended.

```bash
cd tools/oodle-ref && dotnet run -- --oracle
```

**`--patch`** — a byte patcher. Give it a save and a reference `.gvas`; feed it
`<offset> <byte>` lines; it decompresses the patched file and reports the
**first output offset that changed**. That single number is extremely
informative:

- patch a literal byte → you learn exactly where that literal lands in the
  output, and doing that for a run of literals recovers the whole parse:
  literal runs, match lengths, and the gaps between them
- patch a control byte → the decode usually fails outright, which itself tells
  you the byte is load-bearing

```bash
cd tools/oodle-ref && PATCH_LIMIT=131072 dotnet run -- --patch ../saves/Level.sav ../saves/Level.gvas
```

Set `PATCH_LIMIT` to bound the comparison to the first N bytes — comparing 7.7 MB
per experiment is what makes a few thousand experiments slow.

**Two warnings.** The oracle's unsafe code will hard-crash the CLR on malformed
input, so drive it from a parent process that restarts it and records the input
as "crash". And run the compiled `.exe` directly rather than `dotnet run` —
MSBuild's startup dominates when you are restarting after every crash.

**The order that worked**, in case it helps: census the framing until the walk
lands exactly on EOF; census the sub-block headers to find how many streams
there are; use `--patch` on literals to recover a real parse; only then work out
how the control stream encodes it. Getting a byte-exact target first
(`oodle-ref`) is what made all of it checkable.

---

## 4. Rules that earned their place

**Verify against something that isn't you.** `sav-check.js` compares our
decompression to a different implementation in a different language, then
re-reads every pal with a string scanner that never walks the property tree. Two
implementations that fail differently agreeing on 202 pals is evidence; one
implementation agreeing with itself is not. The scanner caught `Level` and the
Talents being `ByteProperty` — the parser had it right and the scanner did not,
and either way the disagreement is what surfaced the fact.

**When a field looks absent, look for it under another name or another shape
before concluding it isn't there.** `SlotID` "didn't exist". The field is
`SlotId`, and it is a struct rather than a number. One letter and one level of
nesting.

**A missing field is a default, not an error.** Unreal only serialises
non-default values. 10 of 202 pals have no `Level` because they are level 1.

**Make the walk fail locally.** Every container walk in `sav-explore.js` is
bounded by that container's own declared size, so a mis-parse produces one
"unreadable" node instead of garbage for the rest of the file. Before that
change, one bad map key took the whole tree down and hid three other bugs.

**Sniff, don't assume, and say which you found.** Struct map keys and struct
array elements come in two incompatible shapes with nothing in the header to
distinguish them. The explorer sniffs and prints `key: bare Guid` or
`key: property list` — that label is a fact about the format worth recording.

**An unmapped blob is a finding, not a failure.** The explorer says "starts as a
property tree but does not parse to the end — unmapped" rather than throwing.
That is a to-do item with an address.

**Never write a save.** Read-only, always. If a future feature genuinely needs
to write one, it needs its own design conversation, its own backups, and its own
very loud warnings — not a quiet extension of this code.
