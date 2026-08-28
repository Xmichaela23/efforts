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

## Q-252 — The State trends vanished every Sunday at 5pm Pacific — UTC week-boundary gate (2026-08-02) — **✅ CLOSED 2026-08-10, [D-413]/[D-414], verified on device**

> ✅ **CLOSED 2026-08-10 — all three stages shipped. See [D-413] (the timezone-free gate — fixes the
> blackout) and [D-414] (stored athlete timezone, LA default killed, Stage 3 UTC-caller audit).**
> Verified: Michael's cards returned on device; his client wrote `America/Los_Angeles` to the new
> `user_baselines.timezone` column and the server resolves it. One residual filed inside D-414 (a
> Sunday-evening compute still *labels* its row with the UTC Monday — harmless, reader agrees).
> **Everything below is history.**

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

## Q-254 — The AMRAP is the measurement in 5/3/1 (2026-08-02, Michael) — **✅ NORTH STAR SHIPPED: State reads the AMRAP ([D-378]) and the verdict reads it the Wendler way ([D-379]), both device-verified 2026-08-03. Three residuals open — see note.**

> **Status 2026-08-13:** what remains open, precisely:
> 1. **Slice 3** — trap-bar (and variants) roll into their primary-lift slot. Ruled by Michael, small, not built.
> 2. **Gap 1's structure** — `compute-facts` still builds the e1RM from "most reps at heaviest
>    weight", not the `amrap_reps` it computes lines later. The RIR-inflation half was fixed
>    2026-08-12 (positive protocol gate), and on a clean 5/3/1 session the two selections coincide —
>    but an added heavy single after the top set would still poison the estimate.
> 3. **Gap 3** — a running block climbs on the calendar, not evidence. That is
>    `SLICE-strength-b-auto-recalibrate-2026-08-12.md`, unblocked 2026-08-13.
> The 2026-08-03 additions: item 2 (RIR deprecated) shipped in [D-379]; item 1 (stale typed
> baseline in the logged-sets rows) — verify on current StateTab before assuming open.

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

### Added 2026-08-03 — three findings from the strength-language ship, all landing in this Q

Surfaced during Michael's device acceptance of the strength-language work. All three are the same job:
**reason from the AMRAP / learned max, not from the wrong number.**

1. **The "from your logged sets" section reads working-weight vs a STALE TYPED baseline.** Live (Michael's
   screen, 2026-08-03): Deadlift reads *"Working ~120 vs your 150 baseline"* while his logged e1RM is
   already ~225 — the section compares to `performance_numbers.deadlift` (typed, old) and ignores the
   learned max. So it measures effort against a number he's blown past, and in a light 5/3/1 week it just
   says "you're going light." **Rebuild each row on the AMRAP top set + the learned/climbing e1RM**
   ("top set hit X reps, max is climbing/holding") — the real "am I getting stronger" read.
   `StateTab.tsx` logged-sets list (~1233-1247) + its baseline source.

2. **RIR is deprecated in favor of AMRAP as the strength-currency signal (Michael, 2026-08-03):** *"rir
   arent valid anymore — 5-3-1 uses amrap."* D-118's RIR-based exclusion (`avg_rir ≥ 5` → fallback
   bucket) is the wrong lens for a 5/3/1 block where the top set is AMRAP at a fixed %. Currency/verdict
   should read AMRAP reps, not RIR deviation. (This is Gap 2 of this Q, now with an explicit ruling.)

3. **Trap-bar deadlift double-counts the strength dot — RULED (Michael, 2026-08-03):** a **variant
   aggregates into its slot** — trap-bar deadlift is a deadlift OPTION, contributes to the deadlift max,
   never a 5th tracked lift (same as Front Squat → squat slot). Fix `PRIMARY_LIFTS` / `computeE1rmBand`
   to roll variants into the four slots (do NOT delete the name — an athlete who only trap-bars must
   still get a deadlift signal). Measured today: squat+deadlift dot 0.750 → 0.833 from logging the variant.

⚠️ **Separate, NOT this Q — a logger/compute-facts bug found the same day:** the Jul 28 OHP session stored
`estimated_1rm = 0` (no valid weight+reps pair, `compute-facts:1434`), so it never updated the learned max
and left `last_logged` at Jul 23. A logging-capture gap, not an AMRAP-reasoning problem — track separately.

## Q-255 — The bike row went silent while CTL/ATL/TSB sat computed and unread (2026-08-02, Michael) — **✅ CLOSED 2026-08-13 night: pushed + deployed + VERIFIED on Michael's screen ("Bike load holding · steady · newest 1d ago · fitness 12 · form −3")**

> **2026-08-13:** the load floor shipped — `_shared/state-trend/load-floor.ts` (verdict words over
> the CTL/TSB the app already computes; Friel/intervals.icu bands, sources in the module header),
> fed by compute-snapshot, rendered by the bike row's silent state ("Bike load building · fresh ·
> fitness 42 · form +8"). Deployed: compute-snapshot, coach, workout-detail, analyze-cycling-workout,
> analyze-running-workout, compute-facts. **Verify:** Michael's bike row after the next snapshot
> recompute (next ride ingest). Residual, filed deliberately: ride stress is POWER-only — an HR-only
> ride contributes zero (Strava/TP both fall back to HR); that fallback is its own future slice.
> Run/swim adoption of the floor: one line each, when wanted.

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

## Q-256 — ⛔ THE 5/3/1 TRAINING-MAX CEILING READS A STALE SIGNUP 1RM, so lifts stall after one cycle (2026-08-03, Michael) — **THE ONE REAL STRENGTH ITEM LEFT. Not urgent (first stall ~Aug 24), but real.**

> ⛔ **CLOSED 2026-08-12 BY SLICE a — BY A THIRD OPTION NEITHER (a) NOR (b): THE CEILING IS DELETED.**
>
> This entry framed the ceiling as *"the RIGHT kind of safety"* whose only fault was reading a frozen reference, and asked Michael to rule between (a) feed it a learned max, or (b) a periodic recalibration. **The premise did not survive the book.** Wendler has no training-max ceiling — p30: increase every four weeks *"until you can no longer hit the prescribed sets and reps."* The brake is a missed prescription. And the stall this entry describes is **structural, not stale-data**: whenever ONE plate step covers the five points between the 85% start and a 90% bound, cycles come out byte-identical — a press max ≲ 100 or a squat ≲ 110 freezes for **every** athlete, however fresh their number is. Feeding it a better 1RM would have moved the freeze, not removed it.
>
> **In code:** `TM_CEILING_PCT_OF_1RM` / `tmCeilingLb` and the percentage step-shrink are deleted (`wendler-531.ts`, superseded banner at the top). The brake is now hold-then-drop: `STALL_CONFIRM_SESSIONS = 2` — one miss holds the weight (p33), a second consecutive miss drops it 10% and rebuilds (p31). Regression: `strength-primary-plan.cycle-climb.test.ts`. See the back-annotation on [D-421].
>
> ⚠️ **THE ONE TRUE OBSERVATION IN HERE OUTLIVES THE ENTRY:** `one_rep_maxes_at_build` is a signup number nothing updates. It no longer gates anything, but it is still what a calibration offer would replace — slice b's job.

Found while auditing the progression finale ([Q-223]). The 5/3/1 training max advances +5/+10 per cycle
(Wendler, correct), but `tmCeilingLb` (`wendler-531.ts:197`) caps the TM at **90% of `one_rep_maxes_at_build`**
— the athlete's **signup 1RM, which never updates.** So on a perfect block:

- Squat TM 90 → 95 → **stops** (1RM 110 on file → ceiling ~99)
- Overhead Press 85 → 90 → **stops** (1RM 100 → ceiling 90)
- Bench and Deadlift have room.

**Two of four lifts park after a single advance**, on a number nobody has verified since signup. Michael's
bench AMRAP already implies ~160 against the stored 150. The code half-knows this — its own comment: *"a
guard on a number nobody verified is a guard with a hypothesis inside it."*

⛔ **The ceiling is the RIGHT kind of safety** (stop the TM running past a real 1RM). The bug is only that
it reads a **frozen reference.** The fix: feed the ceiling from the **learned / AMRAP-implied max** (the app
already computes it — "Estimated max 160") instead of the signup number. **The +5/+10 increment stays
untouched — that's Wendler.** Over-performance is exactly the evidence the stored max is too low, and today
it's ignored.

⚠️ **Michael must rule on the approach before it's built — it changes safety logic.** Options: (a) ceiling
reads the confirmed/learned max with a confidence gate; (b) a periodic TM recalibration (Wendler's own
7th-week / reset protocol). **To close:** rule on (a) vs (b). Related: [Q-223], [Q-254], [D-338].

---

## Q-257 — The Strength Focus preconditions are now unsaid (2026-08-05, **deferred, needs a design call**)

**Tag: deferred — the rule it came from still stands.**

The Strength Focus card on the Train screen carried a paragraph naming what the block **needs**:
*12 weeks of Wendler's 5/3/1, four lifting days. Needs a barbell, a rack and a bench — and your squat,
bench, deadlift and overhead press maxes on file.* Michael, 2026-08-05: **"lose this."** It made one
card three times the height of its three neighbours, which a picker screen cannot afford.

⚠️ **The reason it existed has not gone away.** The 2026-07-25 rule was to state a block's
requirements **at the door**, because finding out on step three that you need four 1RMs on file is
worse than knowing before you start. That requirement is **now unsaid on this path.**

**The obvious home is the tier screen** — the next tap, still before any work, and currently a very
short screen with room. Not built: it is a design call, and guessing it is how screens grow by
accretion. **Ask before placing it.**

---

## Q-258 — Nothing from 2026-08-05's front-door work is device-verified (2026-08-05, **verification debt**)

Eight commits shipped the Focus front door (D-382 / D-383 / D-384), all **pushed and
client-deployed via Netlify**. No edge function was touched, so there is no Supabase deploy in any of
it. **None of it has been confirmed on a device** beyond Michael's screenshots during the build, and
those were taken mid-iteration — several were of states that have since changed.

**What would settle it** (see the AWAITING MICHAEL block in `POLISH-PUNCH-LIST.md`): open Focus, tap
each of the three cards, confirm Run / Ride / Athletic / Build genuinely do not respond, walk
Train → Strength → Strong into the existing block, and Back out one screen at a time.

⚠️ **The one with real consequence is the Race path.** `reseed('marathon')` now fires from a mount
effect on a deep link rather than from a tap, and the goal is seeded in the initial state so the
right screen renders on the first frame. It typechecks and builds; **nobody has watched a marathon
plan get built through the new door.**

---

## Q-259 — A hill session's planned duration excludes its own open recoveries (2026-08-06, **intentional, cosmetic**)

`total_s` in `materialize-plan` is `steps.reduce((s, st) => s + (Number(st.duration_s) || 0), 0)`. The lap-button descents carry no `duration_s` by design ([D-390]), so they contribute **0**. A 4 × 3 min hill reads ~32 min on the calendar and takes ~40.

⚠️ **`Number(undefined) || 0` is 0, not `NaN` — nothing is broken.** The total is honest about what it cannot know: an open step's length is the athlete's.

**Options if it ever matters:** a nominal per-descent estimate used for DISPLAY only (never written to the step, or the whole point is lost), or a session-level `duration` override — `HILL_SESSION_MIN = 35` already exists and is closer to the truth than the computed total. **Not built; nobody has been misled yet.**

---

## Q-260 — The second hard-session option is an unsolved protocol, and the obvious fix is the wrong one (2026-08-06, **VERIFIED against our own doctrine, NOT built**)

> **✅ SOLVED 2026-08-06 night by [D-391] — everything below is history.** The answer was NOT a different single session (which is what this entry, correctly, could not find). It was a **four-option menu** revealed under Hard day = Run: 3-min hill (preselected) · treadmill · short hill (`10×1 min`) · flat. The 40 s format this entry warns against was never built. The runner without a 3-minute climb picks what they actually have; the flat option keeps full VO2 and is separated from heavy legs by a scored preference. Pushed + deployed; cards device-verified. See D-391.

The strength-primary block has ONE hard aerobic session. It has **one** configuration — `4 × 3 min` uphill — and that needs **a climb you can run for three minutes.** An athlete without one is currently handed a session they cannot run, and is never asked.

⛔ **DO NOT WIRE THE DOCTRINE'S "10–12 × 40 s" AND CALL IT DONE. That was built on 2026-08-06 and reverted the same day** (intake question + `run_hills_10x40s_rlap` branch, both removed). Three reasons, all from `DOCTRINE-aerobic-maintenance-run-only.md` **two sections above where the fallback is named**:

1. **Long beats short AT EQUAL WORK TIME.** 12 highly trained runners, 4 × 3 min at 95% vVO2max vs 24 × 30 s at 100%, both 12 min: time >90% VO2max **327.9 ± 146.8 s vs 201.3 ± 268.4 s**. Time >90% HRmax went the OTHER way (545 vs 820) and RPE was identical — *the short session feels harder, reads harder on HR, and delivers 40% less stimulus.*
2. **40 s is in the "moderate" band** (>30 s to <2 min), which the meta puts on the same inferior side as short (≤30 s).
3. **The rationale for the short float is RETIRED IN OUR OWN DOC.** "VO2 stays elevated through the recovery" is struck through. So **neither** a 20 s float **nor** a lap-button descent is backed for a 40 s rep.

⚠️ **AND CUTTING IT TO 6:40 STACKS A SECOND PENALTY** on an already-inferior format. That is not "effective, not maximal" — that is two.

### The question, stated properly

**Maximize VO2max gain at the least mechanical cost to the legs, for an athlete with no long climb.** The two halves pull against each other:

- **Wen et al. 2019** (PMID 30733142): long-interval (≥2 min) **AND** high-volume (≥15 min) **AND** 4–12 weeks → significantly larger effects. Long and more is better.
- **Fyfe et al. 2016** (PMC5093324): work-matched hard and easy endurance interfere with maximal lower-body strength almost identically. Intensity is not the mediator; total work may be. ⚠️ **It was cycling.**
- **The discount:** uphill is concentrically biased and loses the impact transient, which is why the long form is a hill at all. **A flat substitute gives that up.**

**Candidates, none evaluated** (first two are the doctrine's own table): `8–10 × 60 s hard / 60 s easy @ 4–6%` · `2 × 8 min sustained @ 3–4%` · flat long intervals · treadmill incline (never discussed; the intake has never asked).

⛔ **TWO LOAD-BEARING SOURCES IN THAT DOCTRINE ARE UNNAMED** — the time-at-VO2max meta-analysis and the 12-runner head-to-head. **Find them before deciding.** A likely match for the meta is *"Time spent at or near VO2max during high-intensity interval training — a systematic review and meta-analysis"* (BMC Sports Sci Med Rehabil) — **unverified, do not cite without checking.**

---

## Q-261 — Nothing in the lap-button hill export is device-verified (2026-08-06, **verification debt**)

There was **no `OPEN` step anywhere in this codebase** before 2026-08-06, so there is nothing to check the behaviour against and no prior export to compare. Everything about it is reasoned:

- that Garmin accepts `durationType: 'OPEN'` with no `durationValue`
- that the watch shows the step counting **up** and waits for the lap press rather than skipping it
- that the three exporter fixes produce a well-formed workout rather than a rejected one

**What settles it:** send one hill session to the watch and look at the descent step. Fixtures pin the token expansion and the step construction; **neither can prove Garmin accepts the payload.**

---

## Q-262 — Intermediate and advanced marathon blocks have no prerequisite walked end to end (2026-08-06, **unverified — engine gap**)

`marathonPrerequisiteFor` ([D-392]) is level-general and returns sane numbers for all three tiers
(intermediate 34 mi/wk + 12 mi long run at 9 weeks; advanced 41 + 12). **Only the beginner case has
been walked end to end**, and only beginner has been checked against a built plan.

**Why it matters:** a 9-week BEGINNER block peaks at 18. A 9-week INTERMEDIATE block, entering from
the athlete's own long run rather than a prescription, peaks at about 12. A beginner out-building an
intermediate on the same timeline is incoherent, and it is the shape an athlete would notice.

**What would settle it:** run the same fixture matrix used for beginner (6/8/9/11/12/14/16/18 weeks)
at intermediate and advanced, and confirm the peak lands 18-20 with the share at 40% / 33%. The
matrix script pattern is in the D-392 verification.

⚠️ **NOT A BUG YET** — the tables and the function already carry the numbers. It is unwalked, not
missing.

---

## Q-263 — An advanced athlete cannot reach a 60 mi/wk peak on four run days, and nothing says so (2026-08-06, **verified arithmetic, intentional-for-now**)

The legal week is `long run + (days − 1) × easy ceiling`, and the easy ceiling is half the long run
capped at 10 ([D-393]). At four run days that is `20 + 3×10 = 50`, against an advanced peak target of
60. Beginner (40) fits at four days; intermediate (50) needs five; advanced (60) needs six.

So an advanced athlete picking four days gets a ~44-50 mile peak and a 45% long-run share instead of
33%, **and the intake does not mention it.** Same class as the long-run ceiling line that D-392's
prerequisite made unnecessary — a stated consequence, not a wall.

**Options when it is picked up:** state it on the week card ("six days carries the volume this level
builds to"), or let the easy ceiling rise with the weekly target rather than only with the long run.
⚠️ The second changes every sustainable plan's easy-run sizing — do not do it casually.

---

## Q-264 — Nothing from the 2026-08-06 mobile pass is device-verified (2026-08-06, **unverified**)

> **⤳ 2026-08-07:** the "Your week" card was restructured again — **anchors-only** (run days
> read-only "Auto"; only long-run + standing-session tappable; [D-399] + the [D-398] back-annotation),
> so the chip-readability question now targets THAT card. And today's whole visual pass (marathon
> galaxy flow + Strong Focus amber + gold/green sport chips + Gauge Train icon + Focus eye-mark) is
> ALSO pushed and NOT device-verified. **One device pass through Focus settles all of it.**

Six structural fixes to the marathon intake shipped on reasoning + a clean build, with no device
between them and production: the horizontal-scroll clamp (`min-w-0` at the shared wizard chrome), the
Continue-button padding, the week card's layout ([D-398]), the role letters, the day-count gate copy,
and `WeekGrid`'s durations.

**Michael saw the week card and reported two of them fixed** (the untappable long-run/club days, the
blank week). **He did NOT confirm:** whether the chips read cleanly at ~46px, whether any screen still
scrolls sideways, whether the Continue button still covers the last field on the level and strength
cards, or whether the preview week's durations render.

**What would settle it:** one pass through the marathon flow on the phone, looking at those four.

⚠️ **HIS LAST QUESTION WAS "are the chips more readable now?" AND IT WAS NEVER ANSWERED.** If they
are not: delete the 9px role letters entirely — the three question rows underneath already state
`Sun` / `None` in words, so the letters are decoration carrying a load they cannot hold.

---

## Q-265 — The Strong Focus hard-day toggle lets an athlete pick BOTH a run and a ride hard day (2026-08-07, **✅ CONFIRMED AND CLOSED 2026-08-10**)

> ✅ **CLOSED 2026-08-10 — it was real, it was reproduced on device, and it is fixed.** The lead was
> right: the toggle wrote each discipline independently, both chips lit, and Michael hit it on a
> device screenshot. It is a **radio group** now — picking a discipline REPLACES the other
> (`NonRaceBuilder.tsx`, the hard-day row's `role="radiogroup"`); tapping the lit one still clears it,
> because the whole row is optional.
>
> ⚠️ **AND IT WAS WORSE THAN THE COPY MISMATCH THIS ENTRY NOTICED.** Three things broke together
> whenever both were selected: D-327 has no answer for two hard disciplines; `hardDaySport` resolves
> run-first, so the day row wrote only to `run` and left `bike` holding `''` — which the Continue gate
> then blocked on, invisibly; and the terrain menu is gated on `'run' in qualityDays`, so an athlete
> who had just tapped Ride was reading *"What you can run it on"*. The answer to this entry's own
> question — intended or not — is **single-select**, and the copy was right all along.
>
> Everything below is history.

On the Strong Focus scheduler ("Your week"), the copy says *"One hard session a week holds top-end
aerobic fitness"* — singular. But the Hard-day control (`NonRaceBuilder.tsx` ~3026) toggles `run` and
`bike` **independently** (`d in qualityDays`), so an athlete can select both and get TWO hard sessions
(a run club AND a ride club). Question: is that intended — a two-discipline athlete legitimately has
both — or should it be single-select to match the copy? Left untouched (the session was on the icon
fix). Noticed while sport-colouring those chips [D-399]; not chased, per "stay on the fix".

---

## Q-266 — Placement + deletion unification are queued for the engineer stage (2026-08-07, **tracked in the handoff, not yet built**)

> **CLOSED 2026-08-07 — both tasks built.** Task 2 → [D-401] (and the causal claim below did not
> survive the trace — see [Q-268]; the fix runs toward `week-optimizer.ts`, not
> `strength-system/placement`). Task 3 → [D-402], committed `65facc83`: one `deletePlanCascade` path
> routing through `delete-goal`, and the phantom's real cause was an unguarded `fetch` in
> `delete-goal`'s `invokeFunction`, not a dangling plan-ref. Neither is pushed or deployed.
> Everything below is history.

Two VERIFIED findings homed in `docs/HANDOFF-placement-unification-2026-08-07.md` (this Q exists so a
future session greps OPEN-QUESTIONS and finds them):
- **Placement fork (Task 2).** `generate-combined-plan/week-builder.ts` uses its own strength
  placement (~280–492) and imports no `strength-system/placement`, so lower strength landed ON the
  long-run day on a real marathon build. Run-dispersion cause is marked UNCONFIRMED in the handoff.
- **Deletion split (Task 3).** The weekly-planner delete (`AppLayout.handlePlanDeleted:1453`)
  name-matches workouts + `deletePlan`, never touches the goal → a phantom goal survives on Focus. The
  robust path is `delete-goal`; route the planner delete through it.

Server-side, gated deploy. Task 1 of that handoff (the [D-400] crash-guard) is already done.

---

## Q-267 — Plan-generator fragmentation: four generators, opaque routing — clean it up + make it clear (2026-08-07, **LEAD — Michael-directed, AFTER Task 2/3 land**)

Four generators with overlapping logic — `generate-combined-plan`, `generate-run-plan`,
`generate-triathlon-plan`, `generate-plan` — and the routing between them is non-obvious. A single
marathon (race + non-race run) goes to **`generate-run-plan`**, not `generate-combined-plan`
(`create-goal-and-materialize-plan:3786`/`:2801`); `generate-combined-plan` is only the multi-sport
develop path; `generate-triathlon-plan` is a separate legacy generator (`:3108`).

**This session is the evidence the cleanup is real:** the routing confused the assistant, the
`HANDOFF-placement-unification-2026-08-07.md` mis-attributed the marathon symptom to
`generate-combined-plan`, and a placement fix nearly landed in the wrong generator. Michael: *"we need
to clean up the bunk plans and make this clear."*

**Scope (a LEAD, not yet designed):** make the routing explicit and/or consolidate toward fewer
generators (CLAUDE.md "Plan generation is fragmented"; north star = single source of truth,
`TARGET-ARCHITECTURE.md`). ⛔ **Do NOT start until Task 2 (placement) + Task 3 (deletion) land** —
Task 2 is actively rewriting generator internals (`week-optimizer.ts`, `generate-combined-plan`), so
consolidating now would be consolidating a moving target.

---

## Q-268 — "Lower-body strength on the long-run day": NOT reproducible from any generator — look downstream (2026-08-07, **UNVERIFIED — needs the plan artifact**)

`HANDOFF-placement-unification-2026-08-07.md` reported a real marathon build with lower-body strength
placed ON the Sunday long run, and marked it **CONFIRMED**, attributing it to
`generate-combined-plan/week-builder.ts` having its own strength placement instead of
`strength-system/placement`.

**The fork is real. The causation is not.** A sweep of 640 configs × full plan length (~30,720
generated weeks — days_per_week 4-7 × hours × support/performance × long-run Sun/Sat × five
`strength_preferred_days` pin sets incl. pins ON the long-run day × separated/consolidated ×
both ordering preferences) produced **zero** instances. The optimizer's guard holds
(`_shared/week-optimizer.ts` `lowerBodyBlockedDays` — long_run is blocked; `sequentialOk` enforces the
24/48h windows), and the builder's legacy fallback only considers Mon–Fri with `longRunActualDay`
blocked. `generate-run-plan` is also clean: `placement/strength-slot-resolver.ts:buildEasyDays`
excludes the long-run day before any slot is scored.

**Where it most likely DID come from — downstream re-layout, not generation:**
- **`adapt-plan` → `maybeRelayoutStrengthForCurrentWeek`** (`adapt-plan/index.ts:820`, fires on the
  `action=auto` ingest path). It re-places the CURRENT week's strength via
  `buildStrengthSessionsForPlanWeek` → `simplePlacementPolicy`, deriving the week shape from
  `extractPrimaryScheduleForWeekSessions` (`generate-run-plan/strength-overlay.ts:523`). That extractor
  votes on `type === 'run'` + a `long_run` tag; if it fails to identify the long run in a
  combined-plan week, `longRunDay` falls back to a template default and the exclusion then protects
  **the wrong day** — which would put lower work on the real long run. Untested against
  combined-plan session shapes.
- **`rematerialize-strength-block`** — same family, not traced this session.
- The relayout is **schedule-triggered** (it fires when the week's run signature changes vs
  `cfg.strength_primary_sig_by_week`), which fits a plan that looked fine at build time and drifted.

**What would settle it:** the actual plan row — `plans.sessions_by_week` for the offending week plus
`config.strength_primary_sig_by_week` — or a `[tri-generator]`/`[adapt-plan]` log line from that build.
Without it this stays a hypothesis; do not "fix" the generators again, they are covered by the
regression locks in [D-401].

⚠️ **Do NOT read this as "the generators were fine."** [D-401] fixed two real placement defects found
while chasing this one, including the standalone-tri generator's missing long-run guard, which is the
one place the reported symptom WAS reachable. It just isn't the marathon path Michael was on.

---

## Q-269 — 3-day Strength Focus pulls ONCE a week, and that is by the book (2026-08-09, **INTENTIONAL — DO NOT "FIX"**)

⛔ **THE INSTRUCTION FIRST, BECAUSE THIS ONE IS BUILT TO BE RE-CHASED: do NOT add a pull to the leg
days to "balance" the 3-day shape.** If you have arrived here from a table showing one pull exposure
a week and it looks like a hole, it is not. Read this entry, then leave it alone.

**What it looks like.** D-405 took the pull off squat and deadlift days (p.51: *Deadlift day →
hamstrings, quads, abs. Squat day → low back, quads, abs* — no pull on either). The pull now lives on
the press days. On the **4-day** shape that is two exposures a week, 100 reps. On the **3-day** shape
bench and press share a day, so there is exactly **one upper day** — one pull exposure, 50 reps.

And none of the four main lifts pulls, so that single slot is the entire block's pulling volume. It
reads alarming. **I raised it as a concern on 2026-08-09 and I was wrong to.**

✅ **VERIFIED AGAINST THE PRIMARY, Michael 2026-08-09: Wendler's own 3-day rotation (2nd ed. p.76)
pulls once a week in some weeks**, and the chapter's own instruction is that **assistance stays the
same — "don't overthink it."** A single weekly pull on a fixed 3-day week is not a gap in our
implementation of the template; it *is* the template. The 3-day shape has fewer sessions and
therefore fewer accessory slots, which is what choosing it means.

⚠️ **WHY THE WRONG FIX IS TEMPTING.** p.46's *"if you train your chest, train your back"* is easy to
read as a weekly balance quota, and a table comparing 100 reps against 50 makes the 3-day column look
broken. It is a within-SESSION principle, and the 3-day session already carries a pull. Reaching for
"add a pull to the leg days" reverses **D-405** on a misreading — the same class of mistake D-385's
own back-annotation records, one page over.

⛔ **What WOULD be a real finding, and neither has been observed:** an athlete on the 3-day shape whose
pull capacity measurably regresses across a block, or a Wendler page prescribing pulling on a lower
day in a standard template. A rep-count table is not either of those.

**Where this is pinned in code:** `src/lib/assistance-menu.ts`, the `ROLE_BY_DAY.lower` block — the
one place a future session would edit to put a pull back on the leg days. It carries a pointer here.

---

## Q-270 — The endurance-frequency default chain is FOUR layers deep and it is intentional (2026-08-10, **INTENTIONAL — DO NOT "FIX"**)

> ⚠️ **UPDATED 2026-08-19 ([D-444]) — THE RANGES IN THIS ENTRY MOVED, THE FOUR LAYERS DID NOT.**
> Opening the picker to ONE session a week exposed that layer 1 is the only one of the four that
> VALIDATES rather than merely falls back, so it was the only one that could reject a legal answer:
> `run_days >= 2` turned a 1 into a 2 and logged a warning blaming the intake for carrying it
> correctly. It is `>= 1` now, and `ride_days <= 3` became `<= 4` for the same reason. The
> composer's `DEFAULT_ENDURANCE_SESSIONS` FLOOR also moved to 1. **The entry's point stands: four
> layers, deliberately, and the warn still earns its keep on a genuinely absent value.**


⛔ **This entry exists because the outermost layer looks exactly like a bug, and one session already
came within a commit of removing it.** Read this before touching any of the four.

An unset `run_days` on a Strength Focus build becomes **two runs a week**, via four independent
fallbacks, each of which would separately produce the same 2:

| # | where | what it does |
|---|---|---|
| 1 | `create-goal-and-materialize-plan/index.ts:~2583` | `run_days` absent or outside 2–4 → `2` |
| 2 | `generate-strength-plan/index.ts:136` | `endurance_frequency` non-finite → `2` |
| 3 | `generate-strength-plan/index.ts:257` | stored on the plan row as `endurance_frequency ?? 2` |
| 4 | `shared/strength-system/strength-primary-plan.ts:1531` | `DEFAULT_ENDURANCE_SESSIONS = 2` |

⚠️ **#4 IS A FLOOR, NOT A FALLBACK** — `Math.max(2, Math.min(4, …))`. A *selected* run block never
runs fewer than two days, by design. So **removing #1 alone changes nothing observable**: #2 supplies
2 and #4 floors at 2 anyway. Anyone "cleaning this up" has to understand they are proposing to change
the minimum run frequency of the block, not to delete a stray literal.

### The two legitimate callers, traced 2026-08-10

The branch is reached only for `posture.strength === 'develop'` with no endurance discipline
developing. Eight call sites exist across `GoalsScreen.tsx`, `useArcSetupComplete.ts` and
`useConflictResolutionLoop.ts`; two of them arrive with no `run_days` **correctly**:

1. **A bike-only Strength Focus block.** `assemblePayload` sends `run_days` only when
   `strength === 'develop' && runDays >= 2`, and an athlete who dropped running has no count to send.
   Downstream `runSelected` is false (`strength-primary-plan.ts:1341`) and `askedRunDays` is `0` — the
   value is computed and never read. Failing loudly here would kill a build over a meaningless field.
2. **`mode: 'build_existing'` on a goal row stored before 2026-08-10.** Four of the eight sites
   rebuild from the goal's stored `training_prefs`. Every Strength Focus goal already in the database
   predates the intake gate, so none carry `run_days`. Refusing would break rebuild and
   conflict-resolution on existing goals.

### What DID change, and it is the actual fix

The hole was never the fallback — it was the **intake**, which let an athlete finish "Your week"
without answering *"Runs a week"* while the card said **"Auto"**, a word that named this literal as
though it were a decision. Frequency is not optional: weekly volume ÷ sessions = session length, and
25 miles over 2 runs is a different plan from 25 over 4. The count is **required** now
(`src/lib/schedule-gate.ts`, pinned by `schedule-gate.test.ts`), so a NEW build cannot reach #1 unless
running is out of the block entirely.

### The one thing that is not settled

#1 now `console.warn`s when it fires **on a run-sport block** (the case where the value is actually
read). Nobody has confirmed by log whether that branch is ever hit in production — the trace above is
a code read, not a runtime observation. **If that warning appears on a build created after
2026-08-10, the intake gate is leaking and THAT is the bug to chase — not the default.**

⚠️ The warn is in an edge function and is **not live until `create-goal-and-materialize-plan` is
deployed.**

## Q-271 — Assistance names don't state the implement they resolved to (2026-08-13, Michael) — **LEAD**

Michael's Friday squat day prescribed "Triceps Extension" with no implement. The equipment system had
already resolved it as the DUMBBELL movement for his kit (dumbbells owned, no cable; the band route
buried by the last-resort rule) — but the plan/logger show only the bare name, so the athlete can't
tell the dumbbell version from the cable/band one, and it reads as a movement he told the equipment
chat to keep off. The principle, per Michael: no per-exercise exceptions — "use what equipment the
user has and adjust accordingly," and the NAME should carry what it resolved to (e.g. "Triceps
Extension (dumbbell)") wherever a movement spans implements. Scope when picked up: display-side
naming at plan/logger surfaces, driven by the same `strength-gear.ts` route that won the pick — no
pool or gating changes.


---

## Q-272 — The `resolve.ts` score weights have never been swept (2026-08-19) — **LEAD**

The six Layer-2 terms at `resolve.ts:130` carry hand-picked multipliers — `* 20` on
`sameSportDoubles`, `* 25` on `longDoubles`, `* 2` on `clustering`, `* 5` on `longOnWeekend`, `* 3` on
`interleaving`. They were chosen to DOMINATE, not measured, and nobody has ever varied one and
looked at the output.

`scripts/dump-plans.ts` builds 61 athlete shapes in about a second and already exists. A sweep would
say which terms are load-bearing and which are decoration. ⛔ **This is a Layer 2 question only** —
the weights can only choose between weeks that are already legal, so a sweep cannot produce an
illegal week and is safe to run. Named for the scheduling-optimisation session.

---

## Q-273 — "Renders, but wrong" has no checker, and it reached the device twice in one session (2026-08-19) — **LEAD**

Two defects reached Michael's device on 2026-08-18/19 that a green suite could not see: a
half-allocated pair that lit BOTH allocation buttons and built two intensity sessions, and a white
screen from an IIFE reading a const declared 500 lines below it.

`scripts/check-tdz.mjs` now catches the second class — `tsc` cannot, because it permits
use-before-declaration inside a function body and an IIFE is called immediately. **The first class
has nothing.** A smoke test that mounts `NonRaceBuilder` with a null arc and asserts it renders would
have caught the white screen in seconds and is the cheapest next step; component-level assertions
about what renders would catch the rest. No test infrastructure for React components exists in this
repo today, which is why this is a lead rather than a task.

---

## Q-274 — A one-session week with a hard day under-delivers the typed mileage, silently (2026-08-19) — **LEAD**

One run a week plus a hard run builds ~3.5 mi against a 12-mile ask: the hard session is a fixed cost
(Hickson — intensity is the protected variable) and there is no easy volume left to absorb the
remainder. The same shape appears at 2 runs with 2 hard days: ~8 mi against 12.

⚠️ **This is arguably correct behaviour and is filed as a COPY gap rather than an engine one.** The
week is what the athlete asked for in SESSIONS; it is not what they asked for in MILES, and no
surface says so. `run-mileage.test.ts` asserts the week never EXCEEDS the ask and says nothing about
falling short. Noticed while opening the count to 1; not chased.


---

## Q-275 — `analyze-running-workout` can permanently null the columns the new curves live on (2026-08-20)

**HYPOTHESIS, NOT A FINDING — never observed.** A memory-saving step blanks
`computed.best_efforts` / `power_curve` / `raw_laps` on the in-memory copy (`:585`), and a rare
legacy duration-repair path writes that same object back to the DB (`:2146`). By code trace they
share a reference (`workoutForFact = {...workout}` is a shallow spread), so on that path the blanked
fields would save as **null, permanently**.

It fires only when `duration_s_moving` is off by ≥3×. **It matters more now:** the run pace curve
(D-437) and the bike's threshold HR (D-441) both live on the columns it blanks.

**What would settle it:** a workout with a 3× duration mismatch, or a targeted read of `computed`
before/after that repair path runs. The file is 5,002 lines with **zero test files** — it is the
next session's job per the ENGINE-STATE banner.

---

## Q-276 — Wrist optical HR can cadence-lock and feed a jog into the run fit (2026-08-20)

Cadence lock makes a wrist sensor track step rate instead of pulse, producing a plausible-but-wrong
elevated reading. Since D-437 removed the HR gate, HR only affects CONFIDENCE, so a locked reading
can lift a fit from `moderate` to `high` without changing the number. The curve's own gates
(monotonic, R², faster-than-easy) should reject a jog regardless — **unproven.**

**What would settle it:** a fixture shaped like cadence lock — easy-paced windows carrying elevated
HR — asserting the fit still abstains and that confidence does not reach `high`.

---

## Q-277 — The typed 5K still has no honest date (2026-08-20)

`effort_updated_at` exists but `materialize-plan:3396` refreshes it on a recompute from an unchanged
`effort_score`, so it dates the recompute, not the athlete's input. The "5K Time" box writes no stamp
at all.

⛔ **If added it must be a RACE date the athlete enters, not an auto-stamp.** An auto-stamp records
when they typed it; type a 2019 PB today and the app calls it fresh, which is worse than no date.
Low priority — the retest flag (D-436) works by disagreement with training, which is stronger
evidence than an age, and only fails for an athlete with almost no run history.

---

## Q-278 — The shared `threshold_heart_rate` field is closed for readers, open as a model (2026-08-20)

Nothing bike-related reads it (D-439). But `TrainingBaselines` **still writes it** — now only when a
single sport has an anchor, so it cannot be the wrong sport's, yet the field is still there and still
filled from the run number in the single-sport case, waiting for the next reader that trusts it.

**The real fix is the WRITER emitting per-sport fields only** — not another guard on a reader.
⛔ Do not record this as "closed"; the next session reads closed and stops looking.

## Q-279 — The export tool skips a week (2026-08-24)

`strong-focus-3.md` jumped Week 6 → Week 8; the calendar shows week 7 fully populated, so the PLAN
is whole and the export/download path drops a page. Cosmetic until someone shares an export.

## Q-280 — Week 1 wears a "Taper" label on the home header (2026-08-24)

The Standing Plan's test week renders "Week 1 • Taper" — old phase-labeling machinery misreading a
week that is neither. Cosmetic. Trace where the home header derives its phase word.

## Q-281 — Stale goal prefs echo on Standing Plan goals (2026-08-24)

The goal records `Long Run: sunday`, `Hard Days: friday; tuesday` etc. from old wizard drafts on a
block whose built week has neither — the week is right, the record lies about its inputs. Also the
plan description repeats the test-week sentence twice. Provenance hygiene, not behavior.

## Q-282 — The accessory picker accepts duplicate movements (2026-08-24)

A second `Chin-Up` pick buys nothing (the composer places each movement once). The picker should
refuse or flag the duplicate instead of silently wasting the slot.

## Q-283 — Session B's new tests are not mutation-tested (2026-08-24)

Stated exception during the live-review batch (screens + engine wires: swim add-on, focus bias,
archetype overrides, 20-mi cap, chips). The suites are green; the mutation pass is owed.

## Q-284 — Baselines still shows the pre-test 1RMs; the test sheet said "updated" (2026-08-24)

Training Baselines shows bench 150 / OHP 100 while the week-1 test produced e1RM 155 / 110 (State
and workout detail show the new numbers). Trace (2026-08-24) says this is DESIGN, with one lying
surface: nothing in the logger save chain writes `performance_numbers` — the chain writes
`learned_fitness.strength_1rms` (auto), and promotion to `performance_numbers` requires the
athlete's tap (`AthleticRecordPage.tsx:411` confirm, or the separate "Save as baseline" button /
`save-baseline-test`). BUT `analyze-strength-workout:801-805` stamps `outcome: 'updated'` by
COMPARING against `performance_numbers` without writing, so `StrengthTestResult.tsx:37` prints
"updated to N" while the stored number is unchanged. The outcome word, not the write policy, is
the defect candidate.

## Q-285 — Week-2 ME: Upper sheet rendered blank weights + the "no weight prescribed" cue (2026-08-24)

> **CLOSED 2026-08-24 night — real bug, root-caused and fixed.** The restate wrote weights into
> `planned_workouts.strength_exercises` but the logger's every prefill path reads
> `computed.steps` — a build-time cache nothing refreshed. Both rematerializers now re-invoke
> materialize-plan after writing rows (commit `bdd442f4`, both deployed); Michael's block was
> patched with a one-time materialize and bench ME **verified at 135 in the logger on device**.
> Everything below is history.

Screenshot, same day as the test save: "Log: ME: Upper" dated 08/24 shows the accessory cue ("No
weight is prescribed — find the load…") at session level and blank LB on Bench (target 1-5),
despite the acceptance verifying the test wrote working numbers (bench 149 / OHP 102) and
`rematerialize-standing-block` restating weeks 2-12. Unresolved: artifact of opening next Monday's
session early via Pick planned, or a real starvation (sheet not reading the restated
`planned_workouts.strength_exercises`, or ME rows never stamped). A LEAD, not a verified bug —
check what next Monday's session shows on-date before touching anything.

---

## Q-286 — Alternate-week Friday DE leads with deadlift on the hard-RUN day (2026-08-25)

The default plan's ME/DE lift rotation puts Deadlift + front squat on Friday's DE: Lower on
even weeks — the day the hard run shares. The pairing law (model.ts PAIRING) says deadlift belongs
with the ride, squat with the run. Squat-weeks match the law; deadlift-weeks don't. May be
intentional rotation arithmetic (the weekly ME/DE swap can't hold both pairings both weeks).
A LEAD — one-line trace of the rotation vs PAIRING before calling it a bug.

## Q-287 — Phantom seed preferences + export brief describes the wrong plan (2026-08-25)

> **HALF-CLOSED 2026-08-26 — the phantom-seed half is FIXED in the client** (confirmed live by
> Michael: "I made NO adjustments to the schedule handed to me", yet compromise notes fired on his
> untouched seeds). `assemblePayload` now ships a hard/long day only when the athlete tapped it
> (`touchedUnits`, the same ledger `wizardSolveInput` already used) or a club owns it; an untouched
> slot ships day-less ("engine, propose one", slice 8). The race-path long-day tap now records the
> touch too. Two false compromise sentences that narrated the discarded rotation step (missed hard
> pin, missed long pin) were deleted the same night — pins are honoured downstream
> (`compose.ts` `enduranceDayFor`), so they could never describe the built week. **Still open: the
> export brief's static run-only intro + duplicated test-week sentence.**

An untouched wizard writes seed defaults into `preferred_days` (hard days friday/tuesday,
quality_bike tuesday) that read as athlete choices in the stored config and the .md export. And the
export's intro paragraph is static run-only text ("four runs", "the hard sessions are on the bike")
pasted onto every mix, with the test-week sentence duplicated. Export is a dev feature — low
priority. A terminal paste for both exists (2026-08-25 chat) but the work was NOT done; the fuzz
harness took that session instead.

## Q-288 — Keystone-gets-the-freshest-slot is not verifiably encoded in the solver (2026-08-25)

The source's strongest scheduling rule (p131: keystone sessions get the most-recovered slot) has no
identified counterpart in week-model/resolve.ts score terms. The default frame happens to honor it
(ME days land straight off the rest day), but nothing appears to *score* it under athlete pins.
UNVERIFIED — trace before building anything; may be implicitly covered by the clearance costs.

## Q-289 — "Holding" is stated for two different facts, and the payload cannot tell them apart (2026-08-28)

⛔ **THE BRANCH:** `_shared/state-trend/classify.ts:100-107`. When a computed `improving`/`sliding`
fails to beat `noiseGuardStdev` × the series' own standard deviation, the verdict is rewritten to
**`holding`**. Nothing records that the guard fired.

So the screen prints **a claim** — "holding" — where the honest answer is *"the movement was smaller
than this metric's own run-to-run scatter and we cannot separate it."* Those are different facts and
they want different responses from the athlete. **A genuinely flat metric and a suppressed one are
indistinguishable on `TrendResult` today**, so no surface can say which it is even if it wanted to.

⚠️ **THREE ROWS SHARE IT**, all passing `noiseGuardStdev`: run decoupling (`run.ts:298`, 1.0) and both
bike signals — terrain-binned power and efficiency (`bike-fitness.ts:193`, `:237`,
`BIKE_NOISE_GUARD_STDEV`). The fix belongs at the shared word, not at one call site.

⚠️ **AND IT IS THE EXPECTED STATE ON EASY TRAINING, NOT A FAULT.** Zone-2 running produces small true
movement against normal day-to-day scatter, so the guard doing its job is the correct outcome. Any
copy written here must read as a description of the athlete's training, never as a complaint about
their data. ⛔ **Do not loosen the guard to make a verdict appear** — the guard is right; only the
explanation is missing.

**WHAT IT WOULD TAKE:** a `noiseSuppressed` flag on `TrendResult`, set at that branch and carried to
the display contract, plus the copy on every row that prints "holding". ⛔ **Both halves go together
— carrying the flag without a reader is a field nobody reads**, which is the other disease this
codebase names.

⚠️ **FOUND WHILE FIXING SOMETHING ELSE**, and deliberately parked: it lands on rows nobody asked to
touch, and it was found hours before a block rebuild. Not urgent, not cosmetic, and not started.
⚠️ **RELATED BUT ALREADY CORRECT:** the run efficiency row's own two-reasons split (D-346) is fine —
`withheld` (too few) and the route engine's interval straddling zero are separate branches with
separate copy. Only its opening three words were wrong, and those were fixed the same day.

## Q-290 — Run threshold pace has no history, so the run card has no reference line (2026-08-28)

⛔ **THIS IS WHY THE RUN CARD LOOKS THINNER THAN THE RIDE CARD, and it is a storage gap, not an
oversight in the card.**

The reference number is the endurance twin of the estimated 1RM: every percentage the plan
prescribes is a percentage OF it, so it moving is the improvement. The RIDE has one —
`fitness_baselines` supersedes rather than overwrites (`metric: 'ftp'`, `baseline-derive.ts:105`), so
bike FTP accumulates a dated trail by construction: six readings over six weeks on the primary
athlete, 176 → 153 → 168.

⛔ **THE RUN DOES NOT.** `learned_fitness.run_threshold_pace_sec_per_km` is a single `LearnedMetric`
in the `user_baselines.learned_fitness` JSONB, **overwritten in place** on every re-learn
(`learn-fitness-profile:490`). The previous value is gone. There is no series to draw, so the run
card ships with two rows instead of three rather than fabricating a line from one number.
⚠️ And the run's entry in `fitness_baselines` is `decoupling` (`baseline-derive.ts:97`), not pace —
so the table that would give it a history is anchoring the run on a different metric entirely.

**WHAT THE FIX WOULD TOUCH** (traced, not estimated):
- `learn-fitness-profile` — what it writes, and it currently overwrites in place.
- `baseline-derive.ts` — the run would gain a second anchored metric beside `decoupling`.
- `fitness_baselines` — a new `metric` value. **No schema change**: the column is free text.
- Every surface reading a current pace must keep reading the ACTIVE row, not the trail.

⚠️ **IT MAY NOT NEED DOING.** His threshold pace is empty because the critical-speed fit needs two
hard efforts in different duration bands and he has been training zone 2 only. His Wednesday session
carries 5-8 minute intervals, which is exactly what that fit waits for — so the number may start
populating on its own. That changes whether it is worth storing history, not whether the gap is real.

⛔ RAISED DELIBERATELY RATHER THAN BUILT: it changes what a learner writes, which reaches every
surface that reads a pace, and it must not ride in on a card. See also [[Q-289]].

⛔⛔ **AND ITS WEIGHT IS HIGHER THAN THE STANDING-PLAN CASE SUGGESTS — see [[Q-292]].** On a standing
plan this is one missing row. **On a RACE plan it is the whole card**: a periodised block has no
repeated session to compare, so the reference number climbing across the block is the only honest
read left — and for the run, that number is exactly the one with no history. Decide Q-290 on the race
case, not on the standing-plan one.

## Q-291 — The strength/endurance read is a PLAN-HOLDER'S screen; an athlete on no plan sees none of it (2026-08-28)

⛔ **EVERY CARD ON THE NEW READ NEEDS A PLAN.** The lift cards read a block's prescription; the word
(`meSessionOutcome`) judges a session AGAINST that prescription; and both endurance cards identify
their session by the plan's own family tag (`family:run_near_threshold` / `family:ride_sweet_spot`).
No plan → no cards at all.

⚠️ **AND THE OFF-PLAN STRENGTH HOLE COMPOUNDS IT.** The e1RM gate fails closed on a null
`slot_intent`, and nothing stamps `ME` outside the Standing Plan composer — so an athlete logging a
heavy bench off-plan gets **no strength line either**. Two independent mechanisms, same outcome.

⛔ **THE USEFUL HALF, AND IT IS THE SHAPE OF THE FIX: three of the rows do NOT need a plan.** They are
computed from workouts and care nothing about prescriptions —
- **FTP history** off `fitness_baselines` (superseded rows, dated),
- **efficiency per session** (`run_facts.efficiency_index` / `ride_facts.efficiency_factor`),
- **drift per session** (`hr_drift_pct`).

So an off-plan rider could have a real card today — FTP climbing, watts per beat, fade against p107.
What they could NOT have is *"your Monday session is costing you less"*, because that sentence needs
a repeated prescribed session to point at. **The split is: the measurements survive without a plan;
the comparison does not.**

⚠️ Relevant to the product direction Michael named — *"I ride a lot, I want to get stronger, I want
the scaffolding of a program"* — a rider evaluating the app before committing to a block sees an
empty screen today. See also [[Q-292]], [[Q-290]].

## Q-292 — A race plan breaks the read's premise structurally, and the answer is the other read (2026-08-28)

⛔ **THE WHOLE READ RESTS ON THE PLAN HOLDING STILL.** A standing block prescribes twelve identical
weeks by design (p120), which is exactly why any change in the line is the athlete. **A race plan does
the opposite on purpose:** it builds, peaks and tapers.

Consequences, and they are structural rather than fixable by tuning:
- **No repeated session to compare.** The endurance cards have nothing to identify week to week.
- **A falling heart rate in week 10 may be the taper**, not fitness — the card would read a
  deliberate unload as an improvement.
- **Same on the lifting side.** Strength is maintenance on a race plan: no ME/DE structure, so no
  word, no expected curve, and (per the closed gate) no `ME` stamps either.

⛔ **THE ANSWER IS THE OTHER READ, NOT A PATCH TO THIS ONE.** What a periodised plan is trying to move
is the reference number — threshold pace and FTP climbing across the block — which is also what every
endurance platform shows for race training. That is a different card answering a different question,
and it is the honest one for that plan type.

⛔⛔ **WHICH PROMOTES [[Q-290]].** On a standing plan the run's missing threshold-pace history is a
gap in one row. **On a race plan it is the whole card.** Weigh Q-290 on that basis, not on the
standing-plan case alone.
