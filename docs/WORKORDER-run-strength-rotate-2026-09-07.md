# Work order — Run + Strength asks nothing the page answers (2026-09-07, evening)

> **STATUS: SHIPPED 2026-09-07/08** — `ef27ede3` (§1-6), `d4b8fc51` (§8), `0539ad91` (§9). Record in `ENGINE-STATE.md`, top block.

Ruled by Michael 2026-09-07: on Run + Strength the engine ROTATES the run workouts; no athlete
choice on the endurance side for now ("maybe a more surgical option later"). p112 is the rule:
hold the load, vary "across slightly different set durations and intensities" session to session.
p246 fixes the week: MLSS+ level 2 · NT level 3 · VT1 level 1 · LSD level 2 (long run under 100
minutes, p247). Nothing on the endurance step is a question the page leaves open.

## 1. Steps (`src/lib/wizard-steps.ts`, `src/components/NonRaceBuilder.tsx`)

⚠️ AMENDED the same evening (Michael): *"they choose the length of the runs instead."* The endurance
screen STAYS, cut down to the one thing the page leaves to the athlete: how long the long run is.

On the Run + Strength path (`trainCard === 'run'`, program `run_strength`, frame `strength_5k`):

- `posture` comes out. It asks nothing since 32bca15d (one line of copy). The lifting line
  ("Four lifting days a week. Your endurance fits around them.") moves to the top of the
  endurance screen.
- `endurance` stays and becomes four run rows, one per run day, in the frame's day order. Hours,
  days, running experience and the hard-session pickers come OFF it.
  - Easy run (VT1 level 1, p235): LOCKED at 30 minutes. No control; the row states it.
  - Long run (LSD level 2, p235; p247 cap): length chips `60 min` · `75 min` · `90 min`. Default 75.
    ⚠️ 100 is his stated top; 90 is the highest chip so the cap is never touched by default.
  - The two hard runs (MLSS+ level 2, NT level 3): NO control. The row shows the rotating
    workout's name and its length as a fact ("about 45 min", from the variant's own steps). The
    engine rotates the variants (p112). The pickers remain reachable on the built week afterwards.
- Flow: Train → Run → endurance (lengths) → accessory picks → schedule → numbers → confirm.
  Seven screens. ⚠️ The accessory-picks step STAYS; moving it behind Adjust is a separate ruling.
- Standard Focus is untouched (its own per-session lengths; D-457 guard stays).

### What the length pick does in the engine
`levelOverrides` is NOT the mechanism (a level is a band, not a minute count). The chosen minutes
travel as the slot's prescribed duration for `run_lsd` only (the easy run is a constant 30), the same field the
Standard Focus per-session length already writes; the composer builds the easy run to that time
and the long run to that time inside the LSD level-2 shape (the sets ride inside the chosen
length). Hard slots carry no duration override. Assert: a chosen 90 never produces more than 90.

## 2. What the engine receives when nothing is asked

- `enduranceExperience`: not sent → `experienceLevels(null)` → the page's levels. ✅ already the
  behaviour for an unanswered screen; assert it.
- Run lengths: `run_lsd` duration from the chip; `run_vt1` fixed at 30; nothing for the hard slots.
- `enduranceDaysBySport` / weekly hours: not sent → no `dayShortfall`, four runs. Assert it.
- Advanced tier (one or two extra easy runs) keeps firing from DEMONSTRATED miles only (25 mi/wk,
  ours, labelled). Nothing else adds runs.
- Swim: off, no field sent.

## 3. Copy

Endurance step on this path, top line: `Four lifting days a week. Four runs fit around them.`
Under it: `Pick how long the long run is. The easy run is 30 minutes. The two hard runs rotate.`
No em dashes, no emojis, no imperatives, no author's name.

## 4. Guards

- `wizard-steps.test.ts`: the Run + Strength step list is exactly
  `['goal','train','program','endurance','accessory','schedule','numbers','confirm']`; Standard
  Focus and the race path unchanged.
- Length chip: long 60/75/90 → the long run is that long and never over it; the easy run is 30
  every week; hard runs unchanged by any chip.
- Composed Run + Strength block from a wizard payload with none of the removed fields: four runs,
  levels 2/3/1/2, long run ≤ 100 min, week 1 test week. Hash equal to a build that sent the
  page's levels explicitly.
- All Rounder hash unchanged (method in NOTES-stage4).

## 5. Verify, ship

Robot account through Train → Run → build; export shows four runs a week at the page's levels,
workouts differing week to week (rotation), no swim, name "Run + Strength". Client tests, `_shared`
deno tests, tsc, eslint at baseline. Push. Deploy only what changed. `npm run ios`.
Report pushed / web / functions with versions / iOS synced / not device-checked.

## 6. Out of scope

Any control on the hard runs (the "surgical" option, later, Michael's words). Accessory picks behind
Adjust. Ride + Strength. The red interval box on the Performance tab.

---

## 7. WHAT SHIPPED, AND THE THREE PLACES IT DIFFERS FROM §1-§4 (2026-09-07 evening)

Executed after `cc9419df`. Everything in §1-§3 shipped as written except the three items below, each
measured rather than argued.

### 7a. The long-run chips are **68 · 75 · 90**, not 60 · 75 · 90

`run_lsd` at level 2 is a SINGLE ladder rung of **68 to 100 minutes**. An ask of 60 resolves to 68
(`rungForMinutes`), so a chip reading "60 min" would sit over a plan building 68 — the ask-15-get-20
defect, and the whole reason `slotMinuteOptions` exists. The chips are the ladder's own options
capped at 90, so every one of them builds exactly; the ceiling and the default (75) are unchanged.
Swept through `composeWeek` in `src/lib/run-strength-lengths.test.ts` and through the live chain on a
robot account.

### 7b. The two hard rows state **"length varies week to week"**, with no number

§1 asked them to show the rotating workout's length as a fact. Both were checked against real
materialized rows before a number was printed, and neither can back one:

- **Day 1 genuinely rotates** — three different p237 shapes across weeks 2 to 6, 39 to 45 minutes.
  There is no single true length to state.
- **Day 3 is pinned** (`below_threshold`) and `slotFixedMinutes` returns **59**, but every built plan
  row reads **25 minutes**. ⚠️ **THE LADDER AND THE MATERIALIZED SESSION DISAGREE ON THAT SLOT.**
  Printing 59 over a plan that says 25 is the defect `slotFixedMinutes`'s own note was written about.

⛔ **THE DAY-3 DISAGREEMENT IS A FINDING, NOT A FIX** — it is upstream of this screen (the token
`cruise_8x1mi_threshold` cannot be 25 minutes with a 10-minute warm-up and an 8-minute cool-down) and
it is not this order's to close. It needs its own trace through `materialize-plan`'s expander.

### 7c. The calendar row is the ask **plus its warm-up**, and that is pre-existing

Asked 68 / 75 / 90, the plan rows read **74 / 83 / 98**. The composer honours the ask exactly (the
unit sweep asserts equality on `composeWeek`); `materialize-plan` expands the session's own warm-up
and cool-down on top. ⚠️ **Standard Focus does the same** — measured the same evening: it asks 90 and
its long-run row reads 99 — so this is the per-session-length mechanism as shipped 2026-08-30 and not
something this order introduced. It is also why the chips stop at 90: at 90 the row is 98 and p247's
100 is still untouched.

### 7d. Guards, run

- All Rounder composed block hash **`ad54b512…5443`**, unchanged before and after.
- Live Standard Focus block hash **`3d58e52a…cef51`** from a robot account, unchanged.
- Run + Strength flow is exactly `goal · train · program · endurance · accessory · schedule ·
  numbers · confirm` (`wizard-steps.test.ts`).
- Robot account, live chain: name "Run + Strength", four runs a week and no ride or swim row, week
  one a test week, four lifting days, the plyo day, the easy run 30 minutes every week, the day-1
  hard run rotating through three shapes.

---

## 8. THE WEDNESDAY RUN — traced and fixed (2026-09-08)

**Root cause, in one sentence:** the near-threshold session was emitted as a DISTANCE token, and
turning its 240-second reps into miles needs a threshold pace this athlete does not have, so the work
reps reached the row with neither a distance the engine believed nor a time at all — and the row's
duration, which is the sum of its steps, came out as the warm-up plus the default rests plus the
cool-down.

### 8a. The arithmetic, exactly

p246 day 3 is `run_near_threshold` level 3 pinned to `below_threshold`: **8 reps of 240 s at 90% of
threshold, 75 s recovery between** (pp233-234), inside a 10-minute warm-up and an 8-minute cool-down.
The composer sizes it at **59 minutes** and always did.

| | before | after |
|---|---|---|
| token | `cruise_8x1mi_threshold` | `interval_8x240s_90pct_R75s` |
| steps on the row | 16 (8 distance reps with no pace, 7 rests at the materializer's 60 s DEFAULT) | 17 (8 × 240 s, 7 × 75 s) |
| row duration | **25 min** (600 + 7×60 + 480) | **59 min** (600 + 8×240 + 7×75 + 480 = 3525 s) |

⛔ **THE `: 1` FALLBACK IS WHERE THE ONE MILE CAME FROM.** With no threshold pace the emitter wrote
one mile per rep — and it did so for EVERY archetype in the family, so a 75-second rep and an
810-second rep both arrived as `N x 1mi`. Seven prescriptions flattened into one.

⚠️ **A NULL THRESHOLD IS THE DESIGNED STATE, NOT A DATA GAP.** Michael ruled 2026-09-02 that a
threshold is *"either learned or entered"* with no 5K math, and that a hard run then ships with an
effort target and no pace. That ruling is intact: the fix keeps the session's TIME, which survives a
missing pace, and the pace is still absent until a test, a race or an entry.

### 8b. The fix is the shape, not the row

`session-vocabulary.ts`, `run_near_threshold`. It emits `interval_{n}x{s}s_{pct}pct_R{rest}s` — a
shape that already existed for p235's long-run inserts, is already parsed by `expandRunToken`, and is
already in both materializer caches. It carries the reps, the rep's own seconds, the source's
percentage and the source's rest. **No parser, exporter or view needed a change.**

⚠️ `cruise_` IS STILL PARSED and is no longer emitted. Rows built before this keep it; a rebuild or a
restate re-materializes them. Fix-forward.

### 8c. Why Wednesday does not rotate and Monday does

**The frame pins it.** `frames.ts` day 3 carries `archetype: 'below_threshold'`; day 1 carries none,
so `rotatedArchetype` walks `run_mlss`'s three shapes week to week. It is not a filter and nothing is
being excluded: **all seven near-threshold variants exist at level 3** — `short_above`,
`race_repeats`, `race_repeats_long`, `below_threshold`, `below_threshold_long`, `surge_embedded`,
`surge_opener` — and the page names one.

⚠️ **AND THE "5 TO 8" IS A REP COUNT, NOT A REP LENGTH.** `repsBand` is 5-8 (level 3 → 8) and
`repBand` is 210-240 seconds, cited to pp233-234. The comment table at the top of
`session-vocabulary.ts` reads *"p247 asks for 5-8 minute work intervals"*, which does not match the
library's own numbers. **Recorded, not changed** — which of the two p247 actually says is a source
question, and inventing an answer is what the corpus rule forbids.

### 8d. Standard Focus IS touched, and here is the before and after

p274's day 3 is also `run_near_threshold` — level 2, unpinned, so it rotates. Its rows carried the
same fabricated mile. **The composed All Rounder block hash therefore changes, legitimately:**
`ad54b512…5443` → `5ca20bb1…69e2`.

| variant at level 2 | before | after |
|---|---|---|
| rotation default (`short_above`) | `cruise_16x1mi_threshold` | `interval_16x75s_105pct_R30s` |
| `race_repeats` | `cruise_4x1mi_threshold` | `interval_4x390s_105pct_R240s` |
| `race_repeats_long` | `cruise_2x1mi_threshold` | `interval_2x810s_95pct_R240s` |
| `below_threshold` | `cruise_6x1mi_threshold` | `interval_6x225s_90pct_R75s` |
| `below_threshold_long` | `cruise_5x1mi_threshold` | `interval_5x435s_88pct_R75s` |
| `surge_embedded` | `cruise_8x1mi_threshold` | `interval_8x270s_95pct_R60s` |
| `surge_opener` | `cruise_6x1mi_threshold` | `interval_6x280s_92pct_R60s` |

⚠️ **NOTHING ELSE ABOUT THE ALL ROUNDER MOVED** — the hash difference is this row.

### 8e. Verified

- Robot account through the deployed chain: Wednesday reads **59 min**, 17 steps, 8 × 240 s work and
  7 × 75 s recovery, every step time-based with no distance on any of them. Account deleted.
- Monday checked the same way and is unchanged at 45 min: it emits `round_`, which was already
  time-based. That is why day 1 never showed this defect.
- Garmin: the export prefers `computed.steps` and a step with seconds and no distance is a `TIME`
  step; a distance DERIVED from a time prescription is exported as TIME too (`distanceDerived`).
- `near-threshold-is-time.test.ts` — every variant at both levels, the numbers matched against the
  session's own, the row's arithmetic reaching the composer's duration, every frame's near-threshold
  slot in both columns, the MLSS slot beside it, and the materializer's cache still matching.

---

## 9. WEDNESDAY'S SESSION ITSELF — the pin was wrong on the page (2026-09-08)

§8 fixed the DIMENSION the work travels in. This fixes WHICH SESSION it is.

### 9a. What was wrong

The slot was pinned to `below_threshold`, whose four-minute repeat is p234's **level 2** line
(*"6 rounds of: 4 min @ 90% / 1 min @ VT1"*). At level 3 the rep count climbed to eight and the
length did not, so the slot built **8 × 4 min @ 90%** — a session p234 prints at no level.

p247 asks this slot for **5- to 8-minute work intervals**. p234's level-3 list holds ten sessions
and exactly three satisfy it:

| session | token | length |
|---|---|---|
| 8 rounds of: 5 min @ 90% / 1:30 @ VT1 | `interval_8x300s_90pct_R90s` | 69 min |
| 6 rounds of: 6 min @ 88% / 1 min @ VT1 | `interval_6x360s_88pct_R60s` | 59 min |
| 4 rounds of: 8:30 @ 85% / 1 min @ VT1 | `interval_4x510s_85pct_R60s` | 55 min |

The other seven are out, and each for a stated reason: three are DISTANCE sessions (1200 m, 1600 m,
the 1000/800/400/200 ladder) which need a threshold pace this athlete may not have; three have
work intervals of one minute, twenty seconds and two minutes and fail the filter; the
race-specific set is what p247 reserves for within six weeks of a race, which is the taper column.

⚠️ **THE 8 × 5 MIN SESSION IS 69 MINUTES, NOT INSIDE 55-65.** Forty minutes of work plus seven
ninety-second recoveries plus the 10-minute warm-up and 8-minute cool-down. That is p234's own line
and it is reported rather than trimmed.

### 9b. How it is built

- Three new archetypes in `source-rules.ts`, each with **degenerate bands** (`lo === hi`) so it
  builds the line it was transcribed from and nothing else, each citing its own page line, all
  `levels: [3]`.
- `EnduranceSlot.archetypes` — a slot may name the shapes it rotates through. The frame states the
  p247 filter because it is a fact about **this programme's Wednesday**; the All Rounder's day 3 is
  the same family under no such rule.
- `frameRotatedArchetype` in `compose.ts`, called at BOTH the bounds spec and the built session, as
  that file's own note demands. It is filtered to the RESOLVED level: the low-volume tier drops this
  slot to level 1, where these three do not exist, and an unfiltered list threw inside the library
  and failed the whole week.

### 9c. Three holes the change exposed, all closed

1. **`applyVariantPicks` did not check the level.** An athlete pick naming a level-3 shape on a
   level-2 slot threw and took the week down. It now asks `archetypesFor` and ignores a pick the
   level does not offer, which is that field's own stated contract.
2. **The workout picker did not filter by level.** `experience-tier-travel.test.ts` carried a
   tripwire saying exactly this would happen; `slotVariantOptions` now asks the library.
3. **The experience chip measured the family, not the block.** It quoted *"up to 89 min"* for a slot
   whose three sessions top out at 69. `FrameSlot.archetypes` and `SlotSpec.rotation` carry the
   frame's list to the screen so the chip measures the block's own sessions.

### 9d. Numbers that moved on screen

| | before | after |
|---|---|---|
| experienced chip, longest hard run | 59 min | **69 min** |
| newer chip, longest hard run | 41 min | **46 min** |

⚠️ The newer tier's move is a CORRECTION rather than a new session: at that tier the three do not
apply, the composer falls back to the family's rotation at the lowered level, and 41 was
under-claiming any week that rotated onto a longer shape.

### 9e. Verified

- **Standard Focus untouched, proven:** composed All Rounder block hash `5ca20bb1…69e2`, identical
  before and after. Its day 3 is level 2 and the three new shapes are `levels: [3]`.
- **Robot account, deployed chain, four consecutive weeks:** 59 · 55 · 69 · 59 — the three sessions
  in rotation, coming round on the fourth. Every step time-based, no distance on any of them, the
  10-minute warm-up and 8-minute cool-down on all three. Account deleted.
- The comment table at the top of `session-vocabulary.ts` now states the page's answer: the 5-to-8
  is a REP LENGTH, and the library's `repsBand` of 5-8 is a different number that reads the same.


---

## 10. THE SAME RULING ON STANDARD FOCUS (2026-09-11)

Michael applied §0's rotate-only rule to Standard Focus (frame `all_rounder`) on the builder's
endurance step. `HARD_SHAPE_IS_ENGINES` (`standing-plan-week-copy.ts`) is the switch, and it now
covers both programmes.

- **Off the hard rows:** the shape list, its *"Engine's pick — rotates week to week"* head, that
  phrase's short form on the closed row, and every shape's description. Each hard row keeps its
  Ride / Run choice exactly as it had it — including p274's day 2, which offers Ride only because
  `assignSports` still has no ride-to-run conversion (that measurement is unchanged).
- **On them instead**, under the sport choice, one line the SERVER sends (`HARD_ROW_LINE` in
  `intake-readout.ts`, printed verbatim by `EnduranceWeekCard`), approved 2026-09-11:
  hard run — *"A series of near-threshold efforts. Choose the workout on the day."*;
  hard ride — *"A series of efforts near or above threshold. Choose the workout on the day."*
- The easy and long rows are untouched and keep their length pickers.

### 10a. Verified live, throwaway account, deployed chain

A Standard Focus block built with no picks — the payload carries no `endurance_slot_archetypes` and
no archetype on any `hard_days` entry — **rotates all three hard slots across the twelve weeks**:
day 1 through three `run_mlss` shapes, day 2 through three `ride_anaerobic` shapes, day 3 through
all seven `run_near_threshold` shapes (16x75s, 4x390s, 2x810s, 6x225s, 5x435s, 8x270s, 6x280s), each
coming round again on its own period. Account deleted.

### 10b. ⛔ THE LINE'S SECOND HALF IS A PROMISE THE APP CANNOT KEEP TODAY — a finding, not a fix

*"Choose the workout on the day"* has no path behind it, and this was searched for rather than
assumed. `slotVariantOptions` has three callers and all three are the BUILDER (`HardSlotChoices`,
`NonRaceBuilder`, its own lib); `applyVariantPicks` is called only from `sport-slots.ts` at compose
time; no `.tsx` outside the two builder cards mentions `archetype`. On the deployed chain, the
Instead sheet for a built Standard Focus hard run returned exactly two options — **Treadmill**
(`kind: venue`) and **Ride instead** (`kind: discipline`) — and `swap-session`'s option kinds are
`discipline`, `venue`, `hike` and `revert`. **Nothing changes a built session's SHAPE, on either
frame.** §1's *"the pickers remain reachable on the built week afterwards"* is not true and appears
never to have been.

Not built here, per the order. It is the one piece of work the copy now depends on.
