# Open Questions — Part 2 (Q-251 onward)

Don't "fix" intentional behaviors. Numbered `Q-NNN`, tagged cosmetic / intentional / unverified.

⛔ **A `Q-NNN` is a LEAD, not a verified bug.** The point of this doc is to stop the next session from
"fixing" something that someone already considered and chose to leave. **Read the entry before acting
on it** — Q-166 was picked up as an obvious bug and produced a live false "pull back" that had to be
reverted.

---

## 📁 WHERE TO FIND A QUESTION

**The number tells you the file. Numbering NEVER restarts — a `Q-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **Q-001 → Q-129** | [`archive/OPEN-QUESTIONS-archive-Q001-Q129.md`](archive/OPEN-QUESTIONS-archive-Q001-Q129.md) | frozen, **still authoritative** |
| **Q-130 → Q-250** | [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md) | frozen 2026-08-02, **still authoritative** |
| **Q-251 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN ANSWERED.** The frozen file is mostly **live questions** — that was measured,
not assumed. Of its 120 entries, the genuinely finished pile is roughly **10–15**; the rest are open,
half-open, or marked *intentional* (which are the ones you most need to find, because they are what
stops you "fixing" a deliberate choice). **Always grep both:**

```bash
grep -rn "Q-183" docs/OPEN-QUESTIONS*.md docs/archive/OPEN-QUESTIONS-archive-*.md
```

> **Why this file exists (2026-08-02).** The old rule said "archive the closed entries." Detecting
> "closed" was tested against this file and **it does not work**: the check flagged **Q-247 as closed
> while it was the live question being worked on**, and **Q-246 as closed when only half of it was** —
> and the open half is the one warning that `plannedWorkout` must not be deleted. Burying it would
> have cost a broken ride analyzer. **Judging entries is where the danger is, so we stopped judging.
> Freeze at a number, start the next file, move no text.**

---

## Q-251 — Planned load counts three-fifths of a strength session as ZERO, so planned-vs-actual is not a real comparison (2026-08-02) — **PARKED as a deep dive. Michael: not the next area of focus.**

⛔ **DO NOT "FIX" THIS BY PUTTING A SET COUNT ON ASSISTANCE ROWS.** That is the obvious patch and it is
the wrong one — it would re-prescribe work that is deliberately unprescribed. Read the direction at the
bottom before touching anything.

### The trace (verified against the live DB, 2026-08-02)

The Jul 31 strength prescription, as stored in `planned_workouts.strength_exercises`:

| row | sets | reps | weight |
|---|---|---|---|
| Box Jump | 3 | 5 | Bodyweight |
| Deadlift | 3 | `5+` | 105 |
| Dips | **absent** | `25 total` | By feel |
| Chin Up | **absent** | `25 total` | By feel |
| Reverse Lunge | **absent** | `25 total` | By feel |

`calculatePlannedStrengthWorkload` (`_shared/workload.ts`) gates on `sets > 0 && reps > 0`. The three
assistance rows carry **no `sets` field**, so they price at **ZERO**. The completed side prices them in
full — 4,000 lb each on that session.

**Measured, this week:** planned strength **57**, actual **267** — 4.7×, and 12× on Jul 30 (planned 6,
actual 75). Session level, Aug 1: planned ≈ 3,975 against actual 18,925.

### Two of our own decisions collide, and neither is wrong on its own

- **[D-348]** (2026-08-01) made bodyweight count as load and wrote the law: *"All three or none: fixing
  the completed side alone makes every session read heavier than planned."* It even pinned it
  (`workload-strength-planned.test.ts`).
- **[D-370]** (2026-08-02) made assistance a **rep total with no per-set plan** — Michael: *"you either
  did or you didn't"* — which removed the exact field D-348's planned pricing depends on.

The law held. The **shape of the prescription changed underneath it**, so the guard never fired: the
rows are not mispriced, they are *invisible*.

### ⚠️ SCOPE — SMALLER THAN IT FIRST LOOKS. Do not repeat this session's overstatement.

**NOT affected — these read `workouts.workload_actual` only and are trustworthy:** ACWR, the load
verdict, readiness, the load-mix bars. `_shared/acwr.ts` says it outright — *"CANONICAL is
`workouts.workload_actual`."* **Michael confirmed the "load a bit high" read matched how he actually
felt.** An earlier claim in this session that the bug fed ACWR was WRONG and was retracted.

**Affected — anything comparing planned to actual:** the State planned-vs-actual bars, and the coach's
one LLM sentence, which on 2026-08-02 read *"Strength came in heavier than planned — it carries into
next week's rolling load."* ⛔ **That sentence is not an LLM hallucination.** It narrated the broken
number faithfully. Deleting the sentence would hide the symptom and leave the distortion — the model is
not the bug here.

### The direction Michael set (2026-08-02) — this is the design, not a patch

> *"we should be able to accept what user enters for the vibed out accessory work and track it as they
> go and look for their own reporting of soreness or not making the numbers and use that"*

Accessory work is **deliberately vibed** — prescribed as a rep total, done by feel. So the answer is
**not** to manufacture a planned number so the ratio balances. It is:

1. **Accept what the athlete enters** as the truth for accessory work — it is the only real number.
2. **Track it as they go**, rather than scoring it against a prescription that was never made.
3. **Read the signal from the athlete, not the ratio** — their own soreness reporting, and whether they
   are missing the numbers they set themselves.

⚠️ Which means the open question is **what "adherence" even means for work that was never prescribed** —
and that is a product question, not a maths one. That is why it is parked rather than queued.

### To close

Rule on (3) first — what earns an adherence statement for by-feel work. Then decide whether the planned
side should price accessories at all, or whether planned-vs-actual should simply **stop being shown**
for them (it is already dropped from the session screen's Planned COLUMN per [D-370] — State did not
get the memo). See also [Q-233] (deliberate bodyweight imprecisions) and [D-351].

## Q-252 — ⛔ THE STATE TRENDS VANISH EVERY SUNDAY AT 5PM PACIFIC. A UTC WEEK BOUNDARY DECIDES THE ATHLETE'S WEEK IS HISTORY (2026-08-02) — **ROOT-CAUSED, REPRODUCED, NOT FIXED**

**Symptom:** the entire State performance section — run, ride, swim AND strength cards — disappears.
No error on screen, no error in the app. `StatePerformanceSection` returns `null` and the screen
simply ends. Michael, live: *"we lost all the perfmace metrics!!! run ride swim and strgnth gone!!!"*

### The cause, in one line

`compute-snapshot/index.ts:670` — **`if (targetWeek === mondayOfToday())`**.

The trend build only runs for what the SERVER thinks is the current week. `mondayOfToday()`
(`_shared/parse-local-date.ts`) resolves against the runtime clock, and **edge functions run in UTC.**
At **17:00 Pacific on Sunday**, UTC ticks into Monday. From that moment `mondayOfToday()` returns the
NEXT week, the athlete's actual current week fails the equality check, and the whole block is
**skipped** — `state_trends_v1` stays `null`.

⛔ **NOTHING THROWS. NOTHING IS LOGGED.** The block's own `catch` writes *"(non-fatal)"* and was the
obvious suspect for an hour of this session — it is a red herring. **The code never runs at all.**

**Proved on 2026-08-02 at 04:20 UTC** (21:20 Sunday Pacific): `compute-snapshot` for `2026-07-27`
returned `success: true` with `state_trends_v1: null`; the identical call for `2026-08-03` returned a
full contract — `run`, `bike`, `swim`, `strength`, `display`, 4 cards. **The assembler is fine. The
gate is the bug.**

### Why it looked intermittent, and why it hid for so long

`coach_cache` holds the last good contract and the client renders that. So after the Sunday rollover
the screen keeps showing a copy built earlier in the day — **the cache masks it completely** until
something forces a coach regeneration. That is why Michael watched his run move the bar earlier the
same day and then saw it gone. It also explains the ragged history: `athlete_snapshot` week `2026-07-20`
carries a contract, `2026-07-14` and `2026-07-27` do not — whichever weeks happened to be last written
after a rollover are empty.

⚠️ **HOW IT SURFACED, recorded because it is not the athlete's fault and not the bug's doing.** A
session raised `COACH_CLIENT_MIN_PAYLOAD_VERSION` to 161 while the server still served 160. The client
rejected its cached payload (`useCoachWeekContext.ts:699`), forced a coach regeneration, and the
regeneration hit this gate and **wrote null over the good cached copy.** The floor was reverted; the
damage was not undoable, because the good copy was gone. See the warning now on `coach-contract.ts`.

### ⛔ THE DEEPER OBJECTION — MICHAEL'S, AND IT OUTRANKS THE TIMEZONE FIX

> *"this section is rolling too, so there s that"*

**The section is a ROLLING 7-DAY read. It has no business being gated on a calendar week at all.**
Fixing the gate to resolve the athlete's local Monday would stop the Sunday-night blackout, but it
would leave a rolling window keyed to a calendar boundary it does not use. The honest fix is to ask
why the gate exists, not to move it three time zones.

### To close — in this order

1. **Decide whether the gate should exist.** A rolling window arguably needs no week equality test at
   all; the comment above it ("the verdict is 'as of now'; historical snapshots leave it null, unread")
   is about not wasting work on backfilled weeks, which is a different problem than the one it causes.
2. If it survives, it must resolve **the athlete's** week, not the server's. There is no user timezone
   on the snapshot path today — that is the real cost of this fix and the reason it is not a one-liner.
3. **A skipped build must not be silent.** Whatever replaces this, the null case needs a reason
   attached, or the next person spends an hour on the innocent `catch` the way this session did.
4. ⚠️ Check every other `mondayOfToday()` / `todayISO()` caller for the same assumption — `todayISO()`
   is `new Date().toISOString()`, i.e. UTC, and is used as `asOf` throughout the trend code.

**Live state (2026-08-02):** restored by hand — `compute-snapshot` run for `2026-08-03` and
`coach_cache` invalidated, which put all four cards back. **That is a patch on a Sunday night, not a
fix, and it will recur next Sunday.**

## Q-253 — Accessories now have NO home on State, and that is a gap, not a resolution (2026-08-02) — **opened by [D-374]**

[D-373] stopped accessories issuing commands. [D-374] removed them from **"from your logged sets"**
entirely, because every row in that section reads `Working ~120 vs your 150 baseline` — a comparison
against a **tested 1RM**, which exists for the four barbell lifts and does not exist for a Hip Thrust.
An accessory could never fill that column; before D-373 it fell through and printed a red command
instead.

⚠️ **So the section is now honest and accessories are now invisible.** Michael did the work. Nothing
on State reflects it.

**What the field does:** Strong and Hevy show every exercise, but framed against **the athlete's own
history** — heaviest set, best reps at a weight, volume over time — never against a tested max. That
is the frame accessories can actually participate in.

**And it is already the direction Michael set on [Q-251]:** *"we should be able to accept what user
enters for the vibed out accessory work and track it as they go and look for their own reporting of
soreness or not making the numbers and use that."*

⛔ **Do NOT solve this by putting accessories back into the baseline section.** The column is the
problem, not the filter.

**To close:** decide whether accessories earn their own row, and on what frame — reps-at-weight,
volume trend, or nothing at all until [Q-251]'s adherence question is answered. This is a product
call. Related: [Q-251], [D-373], [D-374].

## Q-254 — ⛔ THE AMRAP IS THE MEASUREMENT IN 5/3/1, AND STATE DOES NOT READ IT (2026-08-02, Michael) — **THE NORTH STAR FOR STRENGTH FOCUS. Three gaps, one shape.**

Michael: *"we need to be using amraps for this plan to really set the growth"* → *"we need to make
state screen read amrap as the north star for stregnth focus right?"*

**He is right, and the app already captures everything needed.** `compute-facts/index.ts:1442-1464`
writes **`amrap_reps`** (the set stamped `amrap: true` from the plan's `set_plan`) and **`measured`**
(true when a real all-out set happened) onto every strength exercise. The evidence is there. Three
separate places then fail to use it.

### Gap 1 — the e1RM on State is built from the WRONG SET

`compute-facts/index.ts:1429`:

```
const est1rm = bestWeight > 0 && bestReps > 0 ? estimated1RM(bestWeight, bestReps, avgRir ?? 0) : 0;
```

`bestReps` is **"the most reps at the heaviest weight"** — an aggregate, not the AMRAP. `amrap_reps`
is computed thirteen lines later and never reaches this.

⛔ **THE CODEBASE ALREADY DOCUMENTS WHY THIS IS WRONG**, at the top of
`shared/strength-system/loading/cycle-verdicts.ts`: that module **refuses to read `exercise_log`**
because *"best_weight / best_reps ... is the heaviest set, and the most reps at that weight — NOT the
AMRAP. In 5/3/1 those usually [diverge] ... single afterwards: `best_reps` becomes 1, and 1 < 5 reads
as a MISS on a session that went well."* **The verdict engine avoids this trap. The State e1RM walks
straight into it.**

### Gap 2 — the per-lift verdict reads RIR, not the AMRAP

`computeLiftVerdict` (`_shared/response-model/weekly.ts`) decides on **RIR deviation** — how hard the
sets *felt*. That is a self-reported proxy, collected on the top set only. In 5/3/1 the progression
signal is **reps on the top set at a known percentage**; Wendler's own log tracks rep records and
nothing else. So the number that decides growth and the words on the screen read different signals.
([D-373] narrowed this to main lifts; it did not change what it reads.)

### Gap 3 — the AMRAP-driven advance only runs on a rebuild ([Q-223], already filed)

`verdictForCycle` / `amrapRepsForLift` are correct and wired — but only into
`create-goal-and-materialize-plan` and `rematerialize-strength-block`. `strength-primary-plan.ts`
authors all twelve weeks **before a single set is performed**, so a running block climbs on the
calendar, not on evidence. Q-223 records that this **falsified a sentence in the partner-facing
protocol** claiming week 3's AMRAP decides what comes next.

### Why this is one job and not three tickets

All three are the same omission at different layers: **the app collects the one measurement 5/3/1 is
built on and then reasons from something else.** Fixing the e1RM without the verdict leaves the screen
still talking about feel; fixing the verdict without Q-223 leaves the plan still climbing on schedule.

### ⚠️ What has to be decided, not just coded

1. **Weeks with no AMRAP.** Not every week prescribes one. What does the row say then — carry the last
   measured value with its date, or go quiet? ⛔ It must not silently fall back to the `bestReps`
   aggregate, or Gap 1 returns wearing a different hat.
2. **`measured` is already the honest flag** for "a real all-out set happened" ([D-338]). Use it as the
   gate rather than inventing a second one.
3. **Rep records vs e1RM.** Wendler tracks *reps at a weight*, not an estimated max. An e1RM from 35
   reps is arithmetic, not a measurement — the app already hedges this on screen (*"rough — over 5 reps
   no formula holds up"*). Decide whether the north star is the **rep record** or a formula built on it.
4. ⚠️ **Do not re-price history without checking.** Changing the e1RM basis moves every trend that
   reads it (State strength dot, [D-270] per-lift direction, the coach's strength maxes). Same class of
   change as [D-348], which shipped a backfill *with* it for exactly this reason.

**To close:** rule on (3) first — rep record or e1RM. Everything else follows. Related: [Q-223],
[D-338], [D-370], [D-373], [D-374], [Q-251].

## Q-255 — ⛔ THE BIKE ROW GOES SILENT WHILE A GOOD CYCLING FITNESS NUMBER SITS ONE FIELD AWAY (2026-08-02, Michael) — **CTL/ATL/TSB are computed, populated, and unread by State**

Michael, looking at the row the night after it was "finished": *"i thought we fixed this"* … *"isnt there
another metric for cycling beyond aerbic effeciency that could read here"*. **There is, and it is
already in his snapshot.**

### What the row says, and why every word of it is correct

`6 rides in 8 weeks · newest 19d ago · A few more and this reads your aerobic fitness` — on a night he
rode **yesterday**. Verified against the data:

| ride | classified | why it does not count |
|---|---|---|
| Aug 1 | `threshold` | efficiency is **steady-aerobic only** — HR on a hard ride is dragged up by effort |
| Jul 20 | `recovery` | 9.6 min in band, under the **10-minute dwell floor** |
| Jul 15 | `endurance`, 19.3 min | ✅ counts — and it is **19 days ago** |

Power is silent for the same class of reason: `POWER_BINS` counts only `climbing` / `threshold` /
`sweet_spot` / `tempo`, and he has **two** in the window against a floor of three (`sampleCount: 0`,
`series: []` at the time of writing — his endurance riding is deliberately excluded because a 20-min
"best" on an aerobic ride is not a fitness max).

**All of that is [D-359] working as designed.** The row refuses to assert a direction it cannot
support. ⛔ **The problem is not the gate. It is that nothing else was given to say.**

### The read that already exists and is NOT wired

`athlete_snapshot` carries **`ctl` / `atl` / `tsb`** — populated right now (12 / 9 / 3), computed by
`computeCtlAtl` (`_shared/cycling-v1/ride-physiology.ts:91`) off ride TSS. `arc-context.ts:1171`
already assembles them into a `cycling_fitness` object **with a form band**. It is built, populated,
and **the State bike row does not read it.**

⛔ **CTL COUNTS EVERY RIDE.** It does not care about ride type, dwell time, or terrain bin. It is the
one bike number that does **not** go quiet when the athlete rides the "wrong" kind of ride — and it is
the number TrainingPeaks, Intervals.icu and every cycling app lead with. Yesterday's threshold ride
*would* register.

⚠️ **This is the house disease, not a new bug** — a well-built system starved of a consumer. The
computation, the storage and the assembly all exist. Nothing renders it.

### What has to be decided

1. **Does CTL become the bike row's lead when the type-filtered reads are withheld**, or a third read
   that always shows? ⚠️ A form band (`fresh`/`neutral`/`fatigued`) is close to a readiness claim —
   check it does not contradict the BODY row, which already owns that language.
2. **CTL 12 is LOW.** On six rides in eight weeks that is honest, and it must not be dressed up. The
   number has to be allowed to say "there is not much here" without going silent about it.
3. ⚠️ **`arc-context`'s TSB band is currently the only bike form band in the app** ([D-372] deleted the
   ai_summary mirror). If State renders one too, they must read the same source or they will diverge —
   the exact failure `CONSTITUTION` Law 1 exists to prevent.

**To close:** rule on (1). Related: [D-359] (the gate), [Q-241] (closed — the gate's own ticket),
[D-360] (the FTP choice the row already discloses), [Q-244].
