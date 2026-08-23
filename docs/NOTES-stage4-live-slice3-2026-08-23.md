# Stage 4, slice 3 — making the block live end to end

**2026-08-23.** Work order: `WORKORDER-the-standing-plan-2026-08-22.md` stage 4.
Design: `DECISIONS-2026-08-22-standing-plan-pivot.md`, plus **one ruling Michael gave 2026-08-23
that postdates the slice-2 banner** (the test-week skip, §1.4 below).
Slices 1 and 2: `NOTES-stage4-composer-strength5k-2026-08-23.md`,
`NOTES-stage4-wiring-slice2-2026-08-23.md`.

## STATE — three ways

| | |
|---|---|
| **pushed** | **NO.** |
| **deployed** | **NO.** |
| **verified on a device** | **NO.** |

---

# ⛔ PART 1 — WHAT I FOUND, WRITTEN DOWN BEFORE ANYTHING CHANGED

Read in full first: `src/components/StrengthLogger.tsx` (the save path and the calibration sheet),
`src/hooks/useStrengthCalibration.ts`, `supabase/functions/activate-plan/index.ts` (the day → date
mapping), `src/components/NonRaceBuilder.tsx` (the preview and `payloadNow`),
`src/lib/strength-focus-copy.ts`, `supabase/functions/_shared/strength/all-out-set.ts`,
`shared/strength-system/loading/wendler-531.ts` (the trusted-rep ceiling).

## 1.1 How Get Stronger's rematerializer is CALLED — three call sites, one shape

| where | body | what it is |
|---|---|---|
| `StrengthLogger.tsx:4291` | `{ apply: true }` | **the trigger.** Fires on every strength save, right after the workout row is written |
| `StrengthLogger.tsx:6320` | `{ undo_lift }` | the per-lift Undo inside the sheet |
| `useStrengthCalibration.ts:85` | `{}` | a **dry run** — State and Performance read the numbers without writing |

**The trigger shape, exactly:**

```
save the workout
  → invoke(fn, { apply: true })
  → if (success && changes.length > 0)  → show the sheet, and RETURN (the sheet owns the close)
  → otherwise                            → the normal 1.5s success close, silently
  → catch → swallow; "a supplier that cannot read must never block a saved workout"
```

⛔ **AUTO-APPLY, ANNOUNCE, UNDO — and the file explains why it is not a consent gate.** It used to
be a dry run plus an "Apply" button; that was inverted on 2026-08-15 with the field cited in the
comment (StrongLifts auto-deloads and tells you, Juggernaut recalculates without manual input, Fitbod
and Hevy auto-adjust — *"no major app puts a decision gate in front of it"*). The thing that was
DELETED for being wrong was the **silent** version: *"the athlete opened the logger to a number they
never agreed to."* The difference is announcement + undo + pattern-gating.

⚠️ **Silent on an ordinary session** — no changes, no sheet. That is what makes firing on every save
tolerable, and it is why the Standing Plan can use the identical trigger: after week one the restater
returns nothing on every subsequent save, because the weights already match what it would write.

## 1.2 What the Standing Plan's announcement can and cannot borrow

The two functions return **different change shapes**, and they mean different things:

|  | Get Stronger | Standing Plan |
|---|---|---|
| `changes[]` | `{week, cycle, lift, ref, from_top_set, to_top_set}` | `{week, day, movement, from, to}` |
| what moved | a bar the athlete has been lifting | ⛔ **nothing moved — a hole was filled** (`from: null`) |
| what to show | the per-lift step and its reason | the working numbers the test produced |
| undo | per lift, server-side, suppressed forever | ⛔ **there is nothing to undo TO** |

⛔ **SO THE STANDING PLAN'S SHEET HAS NO UNDO, AND THAT IS A DIFFERENCE IN THE FACTS, NOT A CORNER
CUT.** Get Stronger's Undo exists because a number the athlete was already running on changed under
them. Here the block opened on "By feel" — undoing would mean putting eleven weeks back to no
prescription, which is not a thing anybody wants. **The correction path is retaking the test**, and
`readTestWeek` already takes the LAST attempt. The copy says so.

⚠️ Reusing the calibration sheet by widening it to two change shapes is exactly how one surface
starts lying about two facts. A second, smaller sheet, with the same close semantics.

## 1.3 The weekday problem is a ROTATION, and rotating is more faithful than what is there now

`activate-plan/index.ts:437-440` is the whole mapping:

```ts
const dow = DAY_INDEX[String(s.day)] || 1        // Monday:1 … Sunday:7
const date = addDaysISO(anchorMonday, (weekNum - 1) * 7 + (dow - 1))
```

So `PlanSession.day` is a **weekday name** and the calendar week is Monday-anchored.
`compose.ts` writes `DAY_NAMES[day.day - 1]` — frame day 1 is hard-wired to Monday, and the long run
(frame day 6) is therefore always Saturday.

⛔ **THE FIX IS A PURE ROTATION AND IT PRESERVES THE FRAME EXACTLY.** The work order's own words:
*"THE DAY ORDER IS NOT THE LAW. THE PAIRINGS ARE. He numbers days 1–7 and never names a weekday;
Rule 8 calls a fixed seven-day microcycle an artificial constraint."* Mapping frame day `d` to
weekday `((d - 1 + r) mod 7) + 1` moves every day by the same amount, so **every pairing, every gap
and the rest day's position survive untouched**. A pinned Sunday long run is `r = 1`; the block then
opens on Tuesday and rests on Monday. Nothing about p246 is compromised — and the current
Monday-start is itself an unlabelled choice of `r = 0` that nobody made.

⚠️ **A SECOND PIN CAN FIGHT THE FIRST, AND ONE ROTATION CANNOT SATISFY BOTH.** The frame carries the
hard run on day 1 and the near-threshold on day 3. Once `r` is fixed by the long-run pin, those land
where they land. That is the case that goes down the compromise channel.

⚠️ **AND A ROTATION INTERACTS WITH A MID-WEEK START.** `activate-plan:441` — `if (weekNum === 1 &&
date < startDate) continue` — silently DROPS week-1 sessions that fall before the start date. Rotate
the test days later in the week and they survive; rotate them earlier and a mid-week start could
delete the test week outright, leaving the block on "By feel" with nothing said.
⚠️ **Not reachable from the live builder:** `NonRaceBuilder.tsx:994` `planWeekStartISO()` always
sends a Monday, and the screen says so. It is reachable by a direct caller. **Recorded, guarded in
the rotation chooser, not chased further.**

## 1.4 The skip ruling — what "evidence-backed and fresh" can mean with no stored stamp

Michael, 2026-08-23: *the test week can be SKIPPED only when the number on file is EVIDENCE-BACKED
and FRESH — derived from logged sets within a window (4–6 weeks, labelled OURS). A typed-in max NEVER
skips. Skip = offered, default remains the test. The provenance check derives from logged history at
read time — no stored stamp, no schema.*

⛔ **THE STORED NUMBER'S PROVENANCE IS UNKNOWABLE FROM THE STORED NUMBER.** `performance_numbers`
carries a bare figure and the ruling forbids stamping one. `wendler-531.ts:244` states the write
sites: *"the only writes to `user_baselines.performance_numbers` for strength are the athlete's own
typed number and `save-baseline-test`."* A typed max and a tested max are the same shape on disk.

**So the check cannot ask "where did this number come from". It asks the only question history can
answer: is there a trustworthy logged set in the window?** If yes, the working number is derived from
**that set**, through p215's own two-formula average — and the stored number never enters at all.
A typed-in max therefore cannot skip **by construction**, not by a rule that could be got round.

⛔ **THE TRUST CEILING ALREADY EXISTS AND MUST NOT BE RE-INVENTED.** `trustedMaxRepsFor`
(`wendler-531.ts:651`) — **8 reps general, 5 on the deadlift** — with its derivation written out:
LeSuer 1997, Reynolds 2006, Mayhew 2008, and the deadlift's directional underestimation. Picking a
fresh number here would be a second answer to a question the app has already answered carefully.
⚠️ The Standing Plan module may not import `wendler-531` (its own source lint), so **the ceiling is
passed in as an argument** and the edge function supplies it from the one owner.

## 1.5 The compromise channel already exists and already reaches the athlete

`placement_compromises` — `Array<{kind: 'breach'|'cost'|'ceiling', text}>` — read in two places:

- `NonRaceBuilder.tsx:2716` — the **preview** panel, off the returned plan
- `strength-focus-copy.ts:237` — folded into the plan's own `description`

⚠️ **The Standing Plan row does not emit that key.** Slice 2 put its warnings in
`config.standing_plan_notes`, which nothing renders, and `describeBlock` only lifts `kind: 'source'`
notes into the description. **A cost the athlete pays and cannot see is not disclosed** — that
sentence is `strength-focus-copy.ts`'s own. Emitting `placement_compromises` makes the existing
preview honest with no client change.

⛔ `kind: 'ceiling'` is dropped by the copy layer **by kind, never by regex on the prose** — a
comment there records a real bug where a tightened sentence broke a phrase-matching filter. The
Standing Plan maps its `warning` notes to `cost`, which is the kind that renders.

---

# PART 2 — WHAT WAS BUILT

## 2.1 Job 1 — the call is wired, with Get Stronger's exact trigger shape

`StrengthLogger.tsx`, in the same block that already fires the Get Stronger rematerializer on save:

```ts
const [gs, sp] = await Promise.allSettled([
  supabase.functions.invoke('rematerialize-strength-block',  { body: { apply: true } }),
  supabase.functions.invoke('rematerialize-standing-block',  { body: { apply: true } }),
]);
```

⛔ **BOTH ARE ASKED AND EACH REFUSES THE OTHER'S BLOCK** — `not_a_strength_block` /
`not_a_standing_plan_block`, which is the same shape `useStrengthCalibration` already relies on where
a refusal is the common case and renders nothing. Asking first which block this is would be a third
round trip and a second place that decides.

⚠️ **`allSettled`**, so a rejection on either cannot cost the athlete the other's sheet or the save.
⚠️ **They cannot both have something to say** — a plan is one block or the other.
⚠️ **Silent on an ordinary session.** After week one the restater returns nothing on every later save
because the weights already match. That is what makes firing on every save tolerable.

**The sheet is separate, and it carries no Undo.** `src/lib/standing-plan-copy.ts`, with the reason at
the top: Get Stronger's Undo exists because a bar the athlete was already lifting moved. Here nothing
moved — the block opened on "by feel" and this fills the hole. Undoing would mean putting eleven
weeks back to no prescription. **The correction path is retaking the test** (`readTestWeek` takes the
last attempt) and the scope note says so.

⛔ **The `afterWeek` pin is untouched** — `Math.max(TEST_WEEK_INDEX, currentWeek)`, history and the
live week stand.

## 2.2 Job 2 — pinned weekdays are honoured by rotating the frame

`_shared/standing-plan/day-map.ts`. Frame day `d` → weekday `((d - 1 + offset) mod 7) + 1`.

⛔ **A ROTATION COSTS THE FRAME NOTHING**, and a test asserts it for all seven offsets: every pairing,
every gap and the rest day's position survive exactly. p246 numbers its days and names no weekday;
the work order says *"THE DAY ORDER IS NOT THE LAW. THE PAIRINGS ARE."*
⚠️ **The old fixed Monday start was itself a rotation — offset zero — that nobody chose.** Absent
pins is still offset zero, so an athlete who asked for nothing gets exactly the week slice 2 built.

**The chooser scores three things, in order, ties broken by the smallest offset so the same answers
never produce two different weeks:**

1. the long-run pin — ⚠️ **the long day wins when pins fight**, which is this app's existing order
   (`preferred_days.long_run` is the anchor `place-week` solves around), not a new judgement
2. how many pinned hard days land on a frame hard day
3. ⚠️ **week one's test days surviving the start date** — see §2.4

**The anchors are read off `FRAMES`, not hardcoded**: the long day is the frame day carrying the LSD
family, the hard days are the ones carrying MLSS or near-threshold. A table naming "day 6" would go
stale the first time a frame is added.

⛔ **THE COST GOES DOWN THE CHANNEL THE ATHLETE ALREADY READS.** `placement_compromises`, `kind:
'cost'` — rendered by `NonRaceBuilder.tsx:2716` off the preview and folded into the description by
`strength-focus-copy.ts:237`. Slice 2's warnings sat in `config.standing_plan_notes`, which nothing
renders. ⚠️ Absent when nothing was compromised, never `[]` for "we did not look".

**Proven end to end** (esbuild browser bundle, 245 kB, RUN): long run pinned to Sunday → offset 1,
long run **on Sunday**, rest day **Monday**, test week **Tuesday and Wednesday**, and the conflicting
Wednesday hard-day pin stated as: *"The hard session is on Tuesday and Thursday rather than Wednesday.
The week's order is fixed and the long day is placed first, so Wednesday could not also be reached."*

## 2.3 Job 3 — the skip, on evidence only

`_shared/standing-plan/test-skip.ts`.

⛔ **IT NEVER READS THE STORED 1RM.** The ruling forbids a stamp, and a typed max and a tested max are
the same shape on disk (`wendler-531.ts:244` names the write sites). So the check asks the only
question history can answer — *is there a trustworthy logged set in the window?* — and derives the
working number **from that set**. **"A typed-in max never skips" is therefore true by construction,
not by a rule that could be got round.** A test proves it: a block with nothing logged has no offer.

| | |
|---|---|
| **window** | ⚠️ **42 days, OURS — and tied to his own rate rather than picked freely.** p247 puts this frame's working max at 1% every three weeks, so six weeks is exactly two of his steps: a max measured that long ago is still within ~2% of where the plan would have taken it. He states a rate, not a staleness limit; turning one into the other is our step. |
| **which sets count** | completed, weight > 0, integer reps, **and inside the app's own trust ceiling** |
| **trust ceiling** | ⛔ **NOT RE-INVENTED.** `trustedMaxRepsFor` — 8 general, 5 on the deadlift, with LeSuer 1997 / Reynolds 2006 / Mayhew 2008 written out at `wendler-531.ts:605-655`. ⚠️ The module may not import that file (its own source lint), so **the ceiling is passed in as an argument** and the edge supplies it from the one owner. |
| **which lifts** | only the ones the block prescribes from — three, because the overhead press is tested and never loaded in this frame |
| **the number** | ⛔ **p215's own two-formula average × 96%**, so nothing downstream can tell which route a block took by looking at its numbers |
| **which set wins** | the strongest in the window. Every set inside it is fresh by definition, so the best effort is the better measurement |

**Skip = offered, default = the test**, in three places:

- `compose.ts` refuses `skipTestWeek` when no working numbers came with it — that combination would
  drop the test AND prescribe nothing, which is worse than either branch alone
- `generate-strength-plan` re-reads the evidence **server-side** and builds the test week anyway when
  it is not there. A client answer alone cannot skip
- the preview returns `skip_test_week: { available, taken, summary, missing, window_days }`

**The offer is placed**, not just built: `create-goal` forwards `training_prefs.skip_test_week` (only
`true`, the allowlist discipline every other field on that body uses), the preview carries the offer
back out through `useArcSetupComplete`, and `NonRaceBuilder` renders a checkbox under the week
preview, off by default. ⚠️ **Stage 5 rebuilds that wizard — this is the seam, not its final form.**

## 2.4 One bug the end-to-end probe caught that no test would have

⛔ **`rematerialize-standing-block` re-composed at offset zero.** `restateFromTest` matches a composed
session to a calendar row on week + **weekday** + movement. A block running on offset one, re-composed
at offset zero, puts every session on the wrong weekday: nothing matches, the whole block comes back
`unmatched`, and the athlete sees a test week that produced nothing — **a silent no-op that looks
exactly like "there was nothing to fill in."** It now reads `sp.day_offset` off the block's own config
(⚠️ read, not re-derived from the pins — the athlete's pinned days can change after the block was
built; the calendar cannot), and carries `test_skipped` so a restate cannot grow a test week onto a
block that skipped one.

## 2.5 The mid-week-start hazard, guarded rather than chased

`activate-plan:441` — `if (weekNum === 1 && date < startDate) continue` — silently DROPS a week-one
session dated before the block's start. Rotate the test days early on a mid-week-started block and
the test is **deleted**, leaving eleven weeks on "by feel" with nothing said.
⚠️ **Not reachable from the live builder** (`NonRaceBuilder.tsx:994` `planWeekStartISO()` always sends
a Monday, and the screen says so). Reachable by a direct caller. The rotation chooser prefers an
offset whose test days survive, and states the cost when no such offset is free.

---

# PART 3 — THE GATE

**87 tests** (30 slice 1, 29 slice 2, 28 new). `deno test --no-check --allow-read
supabase/functions/_shared/standing-plan/`

**38 mutations, 38 killed by their intended test.** Harness at `<scratchpad>/mutate-slice3.py`;
restores the tree on every exit path.

### ⛔ GET STRONGER IS BYTE-IDENTICAL — BOTH DIRECTIONS

- **Output:** a `git worktree` at HEAD and the working tree each composed three Get Stronger blocks
  (a runner, a cyclist, strength-only) and hashed the lot. Both
  `f7ece1aa801e60d8cb5f99761db787c8e6de091585118ea7057c50528fa322fb` — the same hash slice 2 recorded,
  so neither slice moved it.
- **Routing:** an athlete whose frame does not resolve still reaches `composeStrengthPrimaryPlan`
  (source lint on the fork), and one whose frame does resolve still reaches the Standing Plan. Both
  directions pinned by test, and both mutation-killed.

### Six mutations survived first time — every one a real test weakness

| what survived | why | fix |
|---|---|---|
| the plan row stops passing the rotation to the composer | the pin test called `composeBlock` directly with an offset it computed itself — it never crossed the wire that can break | the test now asserts the pinned day through `buildStandingPlanRow`'s own `sessions_by_week` |
| an unhonoured long pin goes silent | with seven offsets and seven weekdays a long pin is **always reachable** — so no test could reach the branch | it is not dead: **the taper column has no LSD** (p247 replaces it with a VT1), so a long pin there is asking for a session the week does not contain. Tested on that column |
| the logger stops calling the standing rematerializer | the lint grepped the raw file, and the function name still appeared in the comment explaining the call | comments stripped first. **A lint its own documentation can satisfy is not a lint** |
| the two calls become serial and coupled | same cause | same fix |
| the copy grows a second person | the voice gate scraped `export const` strings by regex, so a "Your" inside a copy **function** walked through | the module is imported and **called**; every sentence it can produce is generated and checked |
| the rotation is off by one | `chooseDayMap` computes its offset through the same function, so the pin still landed — self-consistent | killed by the direct-arithmetic test; the mutation was retargeted there rather than papered over |

### ⛔ CLIENT-REACHABLE AND RUN — the whole slice, end to end

esbuild browser bundle, **245 kB, executed**, both paths:

| | |
|---|---|
| **test path** | offset 1 · long run **Sunday** · rest **Monday** · test week **Tuesday + Wednesday** · one stated cost · **0 prescribed weights in week 2 at build** (correct — the test has not happened) · restate then fills **44 rows** from week 2, bench **205 lb**, **week 1 untouched** |
| **skip path** | offer available · **no test week** · **4 prescribed weights in week one** · bench **205 lb** · description says *"Week one is prescribed from sets already on file, so there is no test week."* |
| **both** | no `training_max` anywhere on either row |

⚠️ The probe was temporary; **this is a thing that was RUN, not a thing that is watched.**

### Everything else

- `npm run lint` on the three touched client files: **215 problems before, 215 after** — no new ones.
- Wider deno suite: **2595 passed, 2 failed**, and **both fail identically at HEAD** (verified by
  stashing this work): `anchor-resolver-lint` (`lthr::TrainingBaselines.tsx`) and `hard-run-terrain`
  (an uncaught error from `materialize-plan:3319`).
- `deno check` on the new modules reports only the pre-existing `state-trend/assemble.ts:1134` error.
- `strength-calibration-copy.test.ts` still green — the new copy is a separate file and did not
  disturb it.

---

# ⛔ PART 4 — IS THE BLOCK STARTABLE FOR REAL ON A DEVICE?

**Not yet, and the reason is deployment, not code.** Nothing here is pushed and nothing is deployed;
the phone is running the old bundle and the old edge functions.

**What is now true in the code**, which was not true this morning:

1. an athlete on the live builder can pick a long-run day and **get it**
2. a cost that cannot be honoured **reaches them**, in the panel they already read
3. the block's test week **fills the block in**, automatically, on the save that completes it
4. an athlete with recent logged lifts is **offered** a start with no test week, and taking it
   produces the same numbers the test would

**What deployment needs** — ⛔ the `_shared` trap applies, and it is wide this time:

**The list, resolved rather than guessed** — `grep -rln "standing-plan" supabase/functions
--include=index.ts` (three of its hits are comments only, in the closed run/tri/combined builders) and
`grep -rln "strength-profiles" supabase/functions --include=index.ts`:

```
supabase functions deploy \
  generate-strength-plan create-goal-and-materialize-plan rematerialize-standing-block \
  compute-snapshot analyze-strength-workout coach materialize-plan adapt-plan \
  --project-ref yyriamwvtvzlkumqrvpm
```

⚠️ **The last five are there because of SLICE 2, not this slice** — `_shared/strength-profiles.ts`
gained the `standing_plan` protocol entry and each of those functions carries its own frozen copy.
Until they are redeployed they resolve the new protocol to `durability` (a flat RIR 2.5) and read
`protocolKnown: false`. That is the `_shared` deploy trap in `CLAUDE.md`, and it is exactly the shape
that stranded 17 functions for a month.
`rematerialize-standing-block` is a **NEW function and has never been deployed at all**; the logger
calls it on every strength save, so until it exists the call returns a transport error — ⚠️ caught and
swallowed by design, so the save is safe, but the block never fills in.

**And then it needs a human.** Build a block with a pinned Sunday long run, look at the calendar, log
the two test sessions, and see the sheet. Nothing below that counts as verified.
