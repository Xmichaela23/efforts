# Engine State

# ⛔ IT HAS BEEN BUILT. IT MAY NOT WORK — BUT IT HAS PROBABLY BEEN BUILT, MAYBE MORE THAN ONCE.

**"It doesn't work" is NOT evidence that "it doesn't exist."** The dominant failure mode in this codebase is a **well-built system STARVED of its inputs** — it exists, it is spec'd, it is fixtured, and it never fires because something upstream is null. It looks *missing*. **It is not missing. It is hungry.**

**Before writing any new function: grep the name you were about to give it.** It is often already taken — by the thing you were about to rebuild.

*(2026-07-12, one session, both mistakes: a session rebuilt `resolveRunEasyPace()` — **same function name** — while the real one sat in `generate-combined-plan/science.ts:110` with its own spec (`PHASE-1-RUN-PACE-SPEC.md`) and 9 pin tests. That real engine is excellent — streak gates, median gates, an ACWR gate so fatigue isn't misread as fitness decline — and it has **never once run**, because both its inputs (`learned_fitness.run_easy_pace_sec_per_km`, `athlete_snapshot.run_easy_pace_at_hr`) are null. The job was to FEED it. See Q-169.)*

**When something looks broken, ask FIRST: is it starved, or is it absent?** Trace its inputs to the write site. A null input is a plumbing job, not a build job.

---

A current snapshot of what's load-bearing, what's known broken, and what's believed-working but unverified. Read this BEFORE proposing changes — most "obvious" bugs were either already fixed (don't re-litigate), already filed (don't re-discover), or intentionally left in place (don't "fix").

---

> **📁 Older content has been moved to [`archive/ENGINE-STATE-archive.md`](archive/ENGINE-STATE-archive.md)** (split 2026-07-13 — this file was 380KB and no session could read it): the **superseded 2026-07-12 roadmap banner**, and every **Solid** entry from before July 2026.
>
> The archive is still authoritative — **Solid means "don't re-litigate"**, and that applies to the archived entries too. Grep it before you "fix" something that looks broken.
>
> ⛔ **When you supersede an entry — including an archived one — GO BACK AND ANNOTATE IT.** See `CLAUDE.md`.

---
## 🧭 NEXT SESSION — START HERE (2026-08-10 — the strength logger's session clock + the whole Strong Focus intake reworked. **12 commits, 2 edge deploys, ZERO device-verified.**)

### ⛔ YOUR JOB: THE ACCEPTANCE RUN. IT IS NOW TWO SESSIONS OVERDUE.

The 2026-08-09 banner said the same thing and the run did not happen — then a full day of screenshot-
driven UI work landed on top of it. **Everything below is pushed and live and none of it has been seen
working.** Do not start new work. If Michael opens with a new request, say this first.

⚠️ **AND THE PATTERN IN TODAY'S BUGS IS THE ARGUMENT FOR IT.** Of the nine defects fixed today, **six
were invisible to every test in the repo** — a collapsed flex child, a floating chip row, a dead
Continue button, a running clock with no off switch, a banner in the way, a missing space. Fixtures
caught none of them and could not have. **A device pass is not bookkeeping on this screen; it is the
only instrument that works.**

### WHAT SHIPPED — all PUSHED, client live via Netlify, 2 edge functions DEPLOYED

**The strength logger's session clock** — `0ddd07dd`, `9be42ee1`, `06018cef`, and **D-410**.
- Start was `useState<Date>(new Date())`: every remount restamped it while the draft restored, so an
  interrupted session saved only its **last stretch**. Durations were silently under-counted.
- Now: an explicit **Start** tap, a persisted wall-clock stamp (`src/lib/strength-session-clock.ts`),
  auto-start on the first completed set, a **Stop**, and duration **editable on the performance
  screen** — where it had never been shown at all.
- ⚠️ Also fixed, pre-existing and unrelated: **the save appeared to hang.** `finalizeSave` awaited
  `calculate-workload` and `auto-attach-planned` AFTER the row was written, and swallowed their errors
  anyway. Fire-and-forget now. A second stuck-spinner (the no-valid-exercises guard never lowered it)
  went with it.

**The Strong Focus intake** — `d0a97264`, `249b8f86`, `76efd25b`, `7f56cc78`, `49a73960`, `ce53a02a`,
and **D-409**, **D-411**.
- "Your week" is a **disclosure list** now (D-411). Three previous layouts failed the same way: parts
  in a column, competing for the fold.
- **Continue was dead on a fully built week** — the gate demanded a count the payload calls optional.
  Extracted to `src/lib/schedule-gate.ts` so it can be RUN; it returns a SENTENCE and the button is
  derived from it, so a disabled Continue can never again be silent.
- Frequency is **required** (D-409); "Auto" was naming a hardcoded `2`.
- Hard day is **single-select** (closes **Q-265**) and **optional**, and the ride branch finally
  describes itself.
- Blocks may now **start in the past** — the confirm step's `min` was refusing it while the race
  screen's identical field never had one.

**[Q-252] — CLOSED and VERIFIED today, the one thing here that IS seen working.** The State
performance section blanked every Sunday 17:00 Pacific: `compute-snapshot` gated the trend build on a
UTC calendar week (**D-413** — now a timezone-free gate). Underneath it, the ACWR `asOf` resolved in a
hardcoded `America/Los_Angeles` for every athlete because no caller passed a timezone (**D-414** — now
a stored `user_baselines.timezone`, UTC fallback, LA literal dead; Stage 3 UTC-caller audit done, no
change). PUSHED `71b083ab` + `5f63bdf2`, compute-snapshot + backfill-strength-load DEPLOYED, migration
applied. Verified: Michael's cards returned and his client wrote its zone. **This is separate from the
acceptance run above — it does not discharge it.**

**Focus screen, deload copy, build landing** — `e30c8c8a`, `b32e503a`, **D-412**.
- The live plan **vanished on small phones**: the "Start something new" block was `shrink-0` and
  starved the scroller to one line. The whole page is one list now.
- `"…the aerobic base.Deload week —"` — a missing space on weeks 4, 8 and 12. Fixed at the JOIN, not
  in the string.
- A finished build lands on the **Home calendar**, always.

**Deployed:** `create-goal-and-materialize-plan` **v315** (the Q-270 warn) and `generate-strength-plan`
**v86** (the deload space). ⚠️ The deload fix reaches **newly built** plans only — blocks already
materialized keep the old string on their rows.

### ⛔ THE CHECKS OWED — this is the acceptance run

**Strength logger**
1. Fresh logger shows **Start**, no timer, nothing ticking.
2. Tap Start → elapsed runs. Tap **Stop** → timer goes, Start returns, **logged sets untouched**.
3. Skip Start, tap Done on a set → the clock appears and starts there.
4. Stop after logging, then log another set → **it stays stopped**.
5. Leave the logger and return; background the app 2 min → time away is counted, not restarted.
6. Save a real session → spinner clears when the row is written, not after two edge calls.
7. Performance tab → four tiles, **Duration** ≈ what the header read. Tap it, type a number, Enter.
8. Mobility logger → **no Start pill, no timer** (branched deliberately).

**Strong Focus intake**
9. Never open "Runs a week" → it reads **"Pick one"**, and Continue explains what is missing.
10. Answer in order → **Continue only ever moves toward enabled**, never back.
11. Hard day: tap Run then Ride → the first turns **off**. Tap the lit one → clears to "None",
    Continue stays live.
12. Ride selected → **"What the hard ride is"**, not the hill options.
13. Row order top to bottom: Long run · Long ride · Runs a week · Rides a week · **Hard day OPTIONAL**.
14. "How much" opens straight into the inputs; the (i) sits on the label and opens **below both**.
15. Finish a build → lands on the **Home calendar**, plan's week showing, **Home lit** in the tab bar.

**Focus screen**
16. **On the small phone**: open Focus → the live plan is under CURRENT, doors a scroll below.

**A newly built block**
17. Weeks 4/8/12 read `"…holds the aerobic base. Deload week — the hard session comes off."`

### ⚠️ WHAT IS UNVERIFIED, AND WHAT WOULD SETTLE IT

- **Backdating.** The client no longer blocks a past start. I traced the server and it holds:
  `activate-plan:440` computes dates arithmetically with **no comparison against today**, and the
  auto-attach hazard its own comment names (*"a backdated plan hoovered up whatever was logged"*,
  AUDIT-performance-state-2026-07-29 **F1**) is closed — the content gate at
  `auto-attach-planned:476` exists now. ⛔ **That is a code read, not a run.** Backdate a block over
  dates you have already trained and confirm only genuinely-matching sessions attach.
- **Q-270's warn has never fired in a log.** If it appears on a goal created after 2026-08-10, the
  intake gate is leaking — chase that, not the default.
- **Two active blocks showed under CURRENT** after a build (screenshot, 2026-08-10). `complete()` on
  the intake path never passes `replace_plan_id`, though `plan-goal-conflict.ts` exists to compute one.
  **Michael deleted the old block and moved on — the question was never answered.** Hypothesis, not a
  finding: the intake has no replacement question at all.
- **`activate-plan:676`'s comment is STALE** — it says the auto-attach content check "is" the real bug.
  It was, and the check landed. One-line correction, nobody has made it.
- **The Race day field still carries the UTC `min` slip** the start-date field just lost (Q-252's
  class). Left alone deliberately: "can a race be in the past" was not asked.

### ⚠️ TWO THINGS ABOUT THE DOCS THEMSELVES

- ✅ **D-403 → D-407's stale "IN WORKING TREE" headers are CORRECTED** (2026-08-10). They claimed
  uncommitted for a day after shipping; verified against `git log` (`ae1a099e`, `eee1a86c`,
  `09796193`, `f0273584`) and each now carries a dated correction note. **A status line that outlives
  its own commit is how the next session re-does finished work** — check these before trusting any
  D-entry's header.
- `DECISIONS-LOG-2.md` is **~170KB** and past the ~150KB cap. Per `CLAUDE.md` it should freeze at its
  current number and continue in `DECISIONS-LOG-3.md`. Not done today.

---

## 🧭 PREVIOUS (2026-08-03 night — STRENGTH is functionally DONE; next is the ceiling fix, then Q-252)

### YOUR JOB
**Strength is functionally done.** A huge day shipped (11 commits, `dd703ef5` → `905b6879`) — all pushed,
deployed, and device-verified where noted (list below). **Do NOT re-open it.** Two things remain:

1. **THE ONE REAL STRENGTH ITEM — the 5/3/1 training-max CEILING reads a STALE signup 1RM.** `tmCeilingLb`
   (`wendler-531.ts:197`) caps the training max at 90% of `one_rep_maxes_at_build` — a **signup number that
   never updates.** On a perfect block, **squat (TM 90→95) and OHP (85→90) STALL after ONE cycle (~Aug 24)**
   while bench/deadlift keep climbing. Michael's bench AMRAP already implies ~160 against a stored 150.
   **Fix: feed the ceiling from the LEARNED / AMRAP-implied max, not the frozen signup.** The +5/+10
   increment stays (that's Wendler); only the *ceiling reference* changes. Filed as **[Q-256]**. ⚠️ Michael
   must rule on the approach BEFORE it's built — it changes safety logic. Not urgent: first stall is ~Aug 24.
2. **[Q-252] — the Sunday State blackout — STILL LIVE, with a deadline.** Recurs every Sunday 17:00 Pacific,
   blanks the whole State performance section. Top non-strength item. See its own entry below + Q-252.

### ⛔ THE 5/3/1 PROGRESSION "FINALE" IS ALREADY BUILT — DO NOT REBUILD IT (audited 2026-08-03)
The suggested-weight progression (advance/reset off the AMRAP, a consent sheet, rematerialize) is **already
built, deployed 2026-07-31, and current** — verified against every transitive dep. `applyVerdict` /
`workingNumberForCycles` (`wendler-531.ts`); the consent sheet in `StrengthLogger.tsx:6014` ("Your next
cycle changed", Apply → rematerialize); `rematerialize-strength-block:180` scoped to weeks not yet started.
**It has never fired for two reasons:** (a) Michael is in **week 2** — first possible trigger is ~**Aug 24**;
(b) THE SURPRISE — **Wendler's +5/+10 is automatic; the AMRAP can only WITHHOLD it (a MISS → reset), never
earn extra.** There is no "reward bump" to build; the sheet is a **miss-notice**, and a good cycle produces
nothing because the plan already forecast the climb. Integration tests added (`q223-block-advance.test.ts`,
uncommitted) pin the never-run chain before its first live run. See **[Q-223]**.

### WHAT SHIPPED TODAY — DO NOT RE-LITIGATE (all pushed + deployed; device-verified where noted)
- **[D-375]** — one strength language (role + type axes, 8 types incl. band). *(from the morning; 29 fns.)*
- **Cap fix** — OHP no longer cut from the logged-sets card. **VERIFIED.**
- **[D-376]** — swap engine **intensity-tier gate**: accessories only swap within their heaviness tier
  (light-prehab vs loaded), killing 97 unsound offers (Clamshell → Barbell Hip Thrust, etc.). Muscle axis
  left loose (Wendler). **VERIFIED on device.**
- **[D-377]** — the **65-exercise catalog reconciliation + a permanent vocabulary GUARD**: every classified
  exercise now has a config entry; the fuzzy fallback went LOUD; a test fails any future exercise that
  "borrows a neighbor." Killed a live mis-prescription (plain "Press" → Leg Press weight). Fixed Single Leg
  Hip Thrust (was two-legged-deadlift priced) + 5 real-plan names. **VERIFIED.**
- **[D-378]** — **Q-254 slice 1**: State's strength rows read the **AMRAP all-out set** (rep record +
  hedged e1RM), matching the Performance screen. **VERIFIED** (Deadlift State ≡ Performance).
- **[D-379]** — **Q-254 slice 2**: the verdict reads the **AMRAP the Wendler way** (`verdictFrom95Set`),
  NOT RIR. Killed a live bug: a main lift inheriting accessory RIR could print a tappable "back off weight"
  that moved real weights. Now consent-safe (no tap on this path). **VERIFIED** (green "top set met").
- **[D-380]** — timer: rest reads the **shared** main-lift list (Push Press / Military Press now rest as
  main lifts, not 90s); heavy main-lift rest bumped 150s → **180s** (standard). ⚠️ Side effect: DB / incline
  / decline bench now rest 90s (they're assistance, not main lifts) — Michael to confirm.
- **[D-381]** — band pricing: a band move with a blank box no longer prices as bodyweight (returns the flat
  token). **LATENT** — Michael's logged band sets all carry a value, so zero sessions changed (backfill empty).
- **Estimated-max copy rewritten** ("guess from N reps, estimates hold to about N") in both renderers.

### STILL OPEN (none blocking; Michael's calls)
- **[Q-256]** the ceiling stall (the one real strength item — see YOUR JOB above).
- **[Q-254] slice 3** — roll trap-bar into the deadlift slot. NOT done (small).
- **The dot/PR confidence hedge** — the Deadlift dot shows "PR ~225" off a 35-rep set the detail calls
  "rough"; the tone/PR doesn't carry the hedge. NOT done (small, Q-254-adjacent).
- **DB/incline/decline bench rest** — now 90s (correct per classifier); Michael to confirm keep or bump.
- **OHP Jul 28 logging gap** — a session stored `estimated_1rm = 0` (no valid weight+reps). Explained by
  Michael (missed the AMRAP first week); worth confirming next week's OHP logs cleanly. Not a live bug.
- The 5 changed logger movements (sled/dead hang) are addable now (catalog fixed) but not device-verified.

### 🗄️ HISTORY (2026-08-02 night, SECOND session) — superseded by the banner above; kept for the Q-249 / Q-246 / grep-the-exports notes still relevant below

### WHAT THIS SESSION DID

Three things shipped, all pushed and deployed and verified on device:

- **[D-372]** — the three dead LLM prompt builders deleted, 3,532 lines out, 45 in (`4424d459`).
  Verified by **database write-timestamps**, not a screenshot: three workouts recomputed 2–9 minutes
  apart, paragraphs byte-identical.
- **[D-373]** — **accessories stop issuing commands.** `computeLiftVerdict` ran every movement through
  the same RIR logic and never consulted role, so a hard Hip Thrust or Barbell Row printed a red *"back
  off weight"*. Now gated on `isMain531Lift`; verified live — Hip Thrust and Barbell Row return an
  empty verdict, the four main lifts unchanged. Coach payload **v161**, client floor raised **after**
  the server was confirmed serving it.
- **The docs were re-based.** `DECISIONS-LOG` frozen at D-372 → `DECISIONS-LOG-2.md` (D-373 →);
  `OPEN-QUESTIONS` frozen at Q-250 → `OPEN-QUESTIONS-2.md` (Q-251 →). ENGINE-STATE 197K → 92K.
  ⛔ **`CLAUDE.md`'s rule changed: freeze by number, judge nothing.** "Archive the closed ones" was
  tested and fails — it flagged Q-247 while it was live and Q-246 when half of it was open.

Two questions filed: **[Q-251]** (planned load counts three-fifths of a strength session as zero) and
**[Q-252]** below.

### ⛔ THE MISTAKE THAT COST THE MOST TONIGHT — DO NOT REPEAT IT

**`COACH_CLIENT_MIN_PAYLOAD_VERSION` was raised while the server still served the old version.** The
client rejected its own cached payload, forced a coach regeneration, and that regeneration hit [Q-252]
and **wrote null over the good cached copy** — blanking the entire State performance section, run,
ride, swim and strength at once. Reverting the floor did NOT undo it; the good copy was gone.

⛔ **That floor moves only in the same breath as deploying `coach`, and only after the server is
verified serving the new version.** `coach-contract.ts` now carries the warning. And a caution about
this whole session: an hour went into a `catch` block marked "(non-fatal)" that was never the problem.
**Before diagnosing a null, first prove the code that writes it actually RAN.**

### ⛔ READ THIS FIRST — [Q-252] IS LIVE AND IT RECURS EVERY SUNDAY

**The whole State performance section — run, ride, swim, strength — disappears every Sunday at 17:00
Pacific.** `compute-snapshot/index.ts:670` gates the trend build on `targetWeek === mondayOfToday()`,
which resolves in **UTC**. When UTC rolls into Monday, the athlete's real current week fails the test
and the build is **skipped**. Nothing throws; the `catch` two lines down says "(non-fatal)" and is a
**red herring** that cost an hour on 2026-08-02.

**It was restored by hand on 2026-08-02** (ran `compute-snapshot` for `2026-08-03`, invalidated
`coach_cache` → all four cards returned). ⚠️ **That is a patch, not a fix. It will happen again.**
Michael's objection outranks the timezone question: *the section is a rolling 7-day read and should
probably not be gated on a calendar week at all.*

### ⛔ YOUR JOB — ASK MICHAEL FIRST, BECAUSE [Q-252] IS A PRODUCT CALL, NOT A BUG FIX

**[Q-252] is the only thing with a deadline** — it fires again this Sunday at 17:00 Pacific. But do
NOT open by shifting the timezone. Michael's objection outranks it: *"this section is rolling too"* —
it is a **rolling 7-day read**, so the calendar-week gate may not belong there at all. Moving the gate
three time zones leaves a rolling window keyed to a boundary it does not use.

⚠️ **And the small fix is not small:** there is **no athlete timezone on the snapshot path today**, so
even the narrow version needs one plumbed through. Ask him which he wants before writing anything.

### ⛔ AND THE BIGGEST THING HE FOUND TONIGHT — [Q-254], THE AMRAP

Michael: *"we need to make state screen read amrap as the north star for stregnth focus right?"*
**He is right and the app already captures it.** `compute-facts:1442` writes `amrap_reps` + a
`measured` flag on every strength exercise. Then three layers ignore it:

- **The State e1RM is built from the wrong set** — `compute-facts:1429` uses `bestWeight`/`bestReps`
  ("most reps at the heaviest weight"), an aggregate. ⛔ `cycle-verdicts.ts` **already documents why
  that is wrong** and refuses to read it: do a heavy single after your AMRAP and `bestReps` becomes 1,
  *"and 1 < 5 reads as a MISS on a session that went well."* The verdict engine dodges this trap; the
  State e1RM walks into it.
- **The per-lift verdict reads RIR** — how sets *felt* — not reps on the top set.
- **[Q-223]** — the AMRAP-driven advance only runs on a REBUILD, so a live block climbs on the
  calendar.

⚠️ **Read Q-254 before touching any of the three — they are one omission at three layers**, and the
first decision is a product one (rep record vs e1RM), not a code one.

**The build queue he set, in his order:**
1. **Strength language, the rest of it.** [D-373] shipped Axis 1 (role). `SPEC-strength-language.md`
   is still locked and still holds **Axis 2 (Type)** plus the collapse of six overlapping classifiers.
   ⛔ **It is NOT blocked** — the spec says "queued after bike cleanup (Q-240/Q-241)" and **both closed
   on 2026-08-01**. Delete that line when you pick it up.
2. **Deload.** Michael named it and it is genuinely separate: `computeLiftVerdict` knows `recovery`,
   `taper`, `peak`, base/build and has **never heard of deload** — which lives on its own in
   `strength-profiles.ts` as a progression threshold. Two vocabularies for one idea.
3. **Race builder.** He is modifying it; scope is his.
4. **The swim LLM delete** — ~320 lines, `analyze-swim-workout` ~396-720, gated off by the never-set
   `SWIM_INSIGHTS_LLM`. **The last output-LLM left in the tree.** Mechanical, same method as [D-372].
   ⚠️ Also uncovered tonight and on nobody's list: `analyze-cycling-workout` holds
   **`generateAINarrativeInsights` (~1294-1476, ~180 lines) with ZERO callers** — another dead LLM
   generator no doc has ever named.

⚠️ **The swim + strength "audit" in the old banner was overstated.** It came from
`WORKORDER-session-screen-continuity-2026-08-02.md` **Part 3, whose title is "WHAT I DID NOT CHECK"** —
a gap list, not a work item. Strength has since had a real pass ([D-370], [D-371], [D-373]).

### ⛔ WHAT NOT TO DO, AND BOTH OF THESE WILL LOOK OBVIOUS TO YOU

**1. [Q-249] IS NOT YOURS TO PICK. IT NEEDS MICHAEL.** One exercise has TWO NAMES — the analyzer reads
`Face Pull` from `planned_workouts.strength_exercises`, the screen reads `Band Face Pulls` from
`computed.steps[].strength.name`. **It is now plainly visible in one glance** on Tue Jul 28's session:
the row header says `Band Face Pulls → Chin Up` and the sentence three inches above says "the Face
Pull slot." Three fixes exist and **one widens `canonicalize`, the grouping key for `exercise_log` and
the State strength trend — it would silently re-group the athlete's lifting history.** He called it
*"a huge fix on the docket"* and parked it. A surface patch is live. **Do not pick one.**

**2. DO NOT FINISH [Q-246] AS A SWEEP.** Its LLM half is closed. What is left is the **tidy half**:
five `void` sites in `session-detail/build.ts`, eleven surviving refs on
`analyze-cycling-workout:2733`, seven on `analyze-running-workout:2384` (both lines now carry a
`[Q-246]` pointer in code), plus `getAdvancedMetrics` and `AppleHealthSwimEnrichment`. ⛔
**`plannedWorkout` on the cycling line is genuinely used elsewhere — that line cannot be deleted
wholesale**, and each dead ride row's dated "why this is off" comment must move to a `D-NNN` before
the code goes. That is judgment, not mechanics.

### THE ONE METHOD LESSON FROM TONIGHT — IT COST THE MOST TIME

**The previous banner said each `ai-summary` file had "exactly one importer." That was true of
`index.ts` and FALSE OF THE REPO** — three TEST files imported them too, and two of those tests were
guarding rules (D-035, D-036) that had since been **rebuilt on the deterministic spine**, while two
others (D-037, D-038 Piece 3) were guarding the wording of a "pace vs similar" line **that no screen
renders**. A per-FILE grep found one caller. A per-EXPORT grep found the rest.

⛔ **Grep the exports, not the filename.** And when a test's subject has moved, **re-point it — do not
delete it with the old code.** `decoupling.test.ts` survived exactly because of this: half of it
covers `enrichSamplesWithGAP` / `calculateEfficiency` / `analyzeHeartRate`, including the 2026-07-14
regression where a mixed-effort run vanished from the State durability trend for 16 days.

### THE FACTS YOU NEED BEFORE YOU TOUCH ANYTHING

- **NO SESSION SCREEN HAS AN OUTPUT LLM ANY MORE — run, ride, and now strength — AND AS OF [D-372]
  THE MACHINERY IS GONE FROM THE TREE, not just bypassed.** Swim's is behind an off env flag and is
  the last one still present in code. **The coach and the race-readiness line are the last two live
  output-LLMs.** Michael: *"we may keep it in race builder so dont get rid of all of it"* —
  `_shared/llm.ts`, `coach`, `course-strategy`, `arc-setup-chat`, `extract-races` all STAY.
- **The reference set is THREE APPS: TrainingPeaks, Garmin, Strava** for endurance. For STRENGTH it is
  **Wendler's 5/3/1 book itself** (`~/Downloads/531_2nd_Edition_Hard_Copy.pdf`) plus Hevy / Strong /
  Boostcamp. Today's decisions are sourced to page numbers; keep it that way.
- **A strength session is a LEDGER.** It has no score ([D-338]), no narrative ([D-371]), and no tonnage
  verdict ([D-370]) — Wendler's own log tracks the main lifts' rep records and nothing else.

### WHAT SHIPPED — DO NOT RE-LITIGATE

**[D-370]** — assistance is prescribed as a REP TOTAL and printed as one (`Planned 25 total · by feel`);
the Planned COLUMN is dropped from those rows because there is no per-set plan; `24 of 25 reps` under
the sets; **`vs plan +11,640 lb` deleted** (it priced one lift against four, and tonnage is not a 5/3/1
measure). An **undeclared swap into an assistance slot is credited and flagged** when the movement
pattern differs — reversing the "never INFER a substitution" half of [Q-181], which is safe now only
because [D-338] deleted the score that law protected. **A main lift stays binary.** Michael: *"you
either did or you didn't."*

**[D-371]** — the strength narrative LLM and everything feeding it: the Arc fetch, the spine verdict,
the `spine_direction` tagging, an 8-week history query, seven imports. **Two DB round-trips per analysis
removed on top of the model call.** `deno check` on that file: 2 errors → 0.

### WHAT [D-372] SHIPPED, AND HOW IT WAS VERIFIED (the method matters more than the result)

Deleted `prompt-builders.ts` (852), `_shared/fact-packet/ai-summary.ts` (1,261),
`_shared/cycling-v1/ai-summary.ts` (644), plus `unplanned-workout.test.ts`,
`cycling-v1/ai-summary.test.ts` and the display-packet half of `decoupling.test.ts`.

`deno check`: run analyzer 65 → 61 errors (the four that went were inside the deleted file), cycling
10 → 10, `_shared` suite **1533 passed / 0 failed**. Then the part that actually settled it —
**recompute on device, and the DATABASE checked for `ai_summary_generated_at`** rather than trusting
the screen: Jul 27 run, Aug 2 run and Aug 1 ride all stamped 2–9 minutes old, in click order, after
the deploy, with the paragraphs byte-identical. Both strength rows correctly carried no summary
([D-371]).

⛔ **That DB check is the pattern to copy.** A screen showing text proves the READ path works; it does
not prove the deployed code WROTE it. The write timestamp does.

### STILL UNVERIFIED

- ~~**The last two copy pushes** (`8483f083`, `ac536a99`)~~ — **CONFIRMED 2026-08-02 night.** Planned
  now reads at Completed's luminosity with Previous still dim (checked on a three-set Box Jump row
  where all three levels appear at once); assistance rows say `Planned 25 total · by feel`; the swap
  sentence renders full size under "3 of 4" on Tue Jul 28 — *"Chin Up filled the Face Pull slot.
  Vertical pulling instead of horizontal pulling — same session, different stimulus."*
- **[Q-244]** — Workload 86 vs TSS 69 on the same ride. Tolerated while only one is on screen.

### 📁 THE NUMBERED LOGS WERE FROZEN TONIGHT — YOU ARE PROBABLY READING THE WRONG FILE

**[Q-247] closed for both numbered logs.** `DECISIONS-LOG.md` (D-240→D-372) and `OPEN-QUESTIONS.md`
(Q-130→Q-250) are **frozen**. New entries go in **`DECISIONS-LOG-2.md` (D-373 →)** and
**`OPEN-QUESTIONS-2.md` (Q-251 →)**. Numbering never restarts, no text was moved, and **the frozen
files are still fully authoritative.** Grep with a glob:

```bash
grep -rn "Q-183" docs/OPEN-QUESTIONS*.md docs/archive/OPEN-QUESTIONS-archive-*.md
```

⛔ **Do not "archive the closed entries" — that rule is dead and `CLAUDE.md` now says why.** It was
tested: it flagged Q-247 while it was live and Q-246 when only half was closed. **Freeze by number,
judge nothing.**

⚠️ **THIS FILE is the exception and is STILL OVER (~199K).** It must stay one file — it is the first
thing you read. Its fix is trimming **Solid** entries older than a few weeks into
`archive/ENGINE-STATE-archive.md`. **Not done. It is the last piece of Q-247.**


## 📁 Superseded handoff banners → [`archive/ENGINE-STATE-banners.md`](archive/ENGINE-STATE-banners.md)

Ten replaced `START HERE` banners (2026-07-14 → 2026-07-24, 47KB) were moved there on 2026-08-02.
They were stacking because the protocol says delete-don't-stack and nobody did. **Nothing was thrown
away** — they are a record of what each session thought its job was. ⛔ **They are not instructions;
every one is stamped SUPERSEDED. The live banner is at the top of this file.**

## WHAT SHIPPED LAST NIGHT — client only, uncommitted, do NOT re-litigate

> ⛔ **SUPERSEDED 2026-07-27 — THE TITLE IS FALSE TWICE OVER AND THAT IS THE DANGEROUS PART.**
> This work is **committed** (`784db4ae`) and **deployed**. "Uncommitted" reads as CURRENT STATUS, so
> a session trusting it would go looking for uncommitted work, find a clean tree, and conclude the
> work does not exist — which is precisely how this codebase grew four plan generators.
> **Everything below is history.** Several of these files were changed again on 2026-07-27
> (`NonRaceBuilder.tsx`, `non-race-goal-seeds.ts`, `strength-primary-plan.ts`) — read the banner at
> the top of this file before touching any of them.

**Intake (`NonRaceBuilder.tsx`):**
- **One screen per discipline.** The stacked "When can you train?" step is gone. Flow: goal → disciplines →
  Accessory work → Running → Bike → confirm (+ Swim if kept). Built from what the athlete KEPT.
- **Accessory work says why it exists** — armour and balance, in Michael's words. ⛔ It says "armor"
  deliberately; the hedged draft was rewritten OUT. See the comment above the block.
- **A hard day per discipline**, on that discipline's own card. Two max — the shape enforces it, one per
  discipline, so there is no third to gate. Both taken → the ledger line states the cost.
- **The Mulholland dialog** on the second hard day. ⛔ It bends two rules deliberately and both were
  argued; the file comment holds the reasoning and the one condition that would make it wrong.
- **All copy brightened one notch** (prose was 55% white on black and read as disabled).

**Logger + copy (`strength-focus-copy.ts`, `StrengthLogger.tsx`):**
- **Bar-speed doctrine, keyed by SET TYPE.** ⛔ Speed on a prescribed set is a QUALITY CHECK; speed on an
  AMRAP is a STOP RULE. A prescribed set must never receive "slow rep = last rep" — AMRAPs exist only in
  the anchor cycle (weeks 9/10/11). **A vocabulary lint pins it**, so editing the copy can't break the rule.
- **The 95% gate outranks the deload** in `barSpeedLineFor`, and a test derives from `setsForWeek` that
  they cannot currently collide. Suppressing the line that decides the working number is the expensive
  failure.
- **D-326 layer 1 — the difficulty tap.** Top set only (heaviest, not last — `topSetIndex`, tested),
  three words, replaces the two-step RIR-then-Done. Persists in `strength_exercises` JSON, **no
  migration**. ⛔ **Nothing reads it yet.**

---


## ⛔ THE SPEC WRITTEN LAST NIGHT — D-325 and D-326. Read them before designing anything adjacent.

> ⚠️ **STILL ACCURATE, WITH ONE ADDITION (2026-07-27).** D-325 and D-326 stand. **D-326 layer 2 — the
> earned advance — is now BUILT AND DEPLOYED**: `loading/cycle-verdicts.ts` supplies the verdicts and
> `create-goal` fetches them on a rebuild. It had zero suppliers when this section was written, which
> was the whole point of the finding. See the banner for what proves it fired.

- **D-325 — Session Cost Ledger + Penalty Scheduler** (`DECISIONS-LOG.md:1267`) ⟨A31⟩. Three ordinal axes 0–3,
  ceilings from emphasis, placement by penalty score, **breach states cost and never refuses**, ledger
  **subordinate** to the reconciler. ⚠️ **Arrived labelled D-268 — that number was taken since 2026-07-09.**
  ⚠️ **Q-205: two of the three ceiling sets are UNVALIDATED** — assume wrong until summed against their
  own default weeks, the way `strength_led`'s mech ceiling had to move 12 → 14 the moment it was checked.
- **D-326 — per-set difficulty.** ⛔ **Its three-failure table is the thing to read.** Layer 1 (the tap) is
  built. **Layer 2 — `verdictFrom95Set` wired — is BUILT (`loading/cycle-verdicts.ts:116` → `strength-primary-plan.ts:1275`); layer 3 — provenance rendered — is NOT.** ⟨A31⟩ *Shipping
  the tap does not close the blindness*, and that misreading is the most likely thing to happen next.

---


## ⚠️ THE FINDING THAT MATTERED MOST — the strength gauge's blindness, and how much of it is left

> ⛔ **RE-TRACED AGAINST CODE 2026-07-31 (doc audit). THIS SECTION WAS WRONG IN TWO WAYS AND IS NOW
> CORRECTED. Everything below has been checked; read the two corrections before acting on it.** ⟨A31⟩
>
> **1. "8 of 12 weeks" is CONDITIONAL, not a constant.** It assumes a leader/leader/anchor block.
> `leaderCount` (`wendler-531.ts:291`) returns **0 leaders** for a continuity-`continuous`,
> posture-`develop`, sub-16-week block with no `highAerobicLoad` — every cycle is then an ANCHOR, so
> the AMRAP fires in **9 of 12 weeks**, not 3. "8 of 12 blind" holds for the `unknown` / `detrained`
> tiers (a first block), and for any ≥16-week or maintain-posture block. Live block shape is built at
> `generate-strength-plan/index.ts:121`.
>
> **2. The verdict gate is WIRED. It was not, when this was written.** `verdictFrom95Set` is called at
> `loading/cycle-verdicts.ts:116`, feeding `workingNumberForCycles` (`wendler-531.ts:519`), read live by
> the composer at `strength-primary-plan.ts:1275` and by `rematerialize-strength-block/index.ts:167`,
> which the client invokes on every logger save (`StrengthLogger.tsx:4022`, `:6053`). **That is D-341
> (2026-07-30), which closed Q-223 and Q-226.** The bar no longer climbs on the calendar alone.

Found by tracing, not guessing:

- **AMRAPs exist only in the anchor cycle** — `wendler-531.ts:61`,
  `amrap: kind === 'anchor' && !isDeload && i === 2`. ✅ **Line ref re-verified exact, 2026-07-31.**
  How many weeks that blinds depends on how many cycles are anchors — see correction 1 above.
- **And a leader-week e1RM is the plan quoting itself.** The estimator is `estimated1RM`
  (`compute-facts/index.ts:141`) — ⚠️ **no longer Brzycki; D-339 moved it to Wendler/Epley**
  (`src/lib/estimate-1rm.ts:56`). With RIR scoped off by D-324, doing the prescribed 5 reps at the
  prescribed weight yields **`weight × 1.167`** (was ×1.125 under Brzycki) — still **a pure function of
  the prescription.** It carries athlete information **only on a miss.** ⟨A31⟩
- **`verdictFrom95Set` / `applyVerdict` are written, correct, and NOW CALLED** — `wendler-531.ts:454`
  and `:467`, via `loading/cycle-verdicts.ts:116`. Wendler's own rule — ⚠️ **and the threshold moved:**
  `VALIDITY_CHECK_MIN_REPS` is **1**, not 5 (`wendler-531.ts:368`, "the prescribed `95% × 1+`, p23").
  `null`→`hold`, `0`→`reset`, `1`–`8`→`advance`, `>8`→`advance_untrusted`. ⟨A31⟩
- **`workingNumberForCycle` (`wendler-531.ts:210`) still advances by bare cycle index — but only on the
  FORECAST path**, where the composer deliberately passes `unknownMeans: 'advance'` because no verdict
  can exist for a week that has not happened (`strength-primary-plan.ts:1281-1285`). On every path that
  reads logged work, the verdicts govern. ⟨A31⟩
- **The missed-reps half already exists** — Q-193, the stall, `coach/index.ts:3975+` ⟨A31⟩. Counts only sets at
  or above prescribed load; a zero-rep set is "not performed", not a failure. **Do not rebuild it.**
- ⚠️ **WHAT IS STILL OPEN:** layer 3 (provenance rendered to the athlete) is NOT built, and
  `src/lib/strength-focus-copy.ts:324` still carries a `⛔ GATED ON verdictFrom95Set BEING WIRED` block
  whose stated precondition is now met — that gate and its neighbouring comments at `:260-262` still
  cite the old `wendler-531.ts:160-200` / `workingNumberForCycle:112` line refs. **Code comments, left
  untouched by this docs-only audit — see the report.** ⟨A31⟩

---


## THE RULES MICHAEL SET — carried forward, still binding

- **Endurance absolutes are immovable; strength builds around them.** *"Get out of days-of-the-week
  headspace — we move the strength to accommodate long runs, rides and social groups."*
- **Gate it, don't warn it.** No "accept the risk" button. Present the resolved alternative, not an error.
- **A cap that refuses is a cap. A number that states the cost is a trade.**
- **Precise if you know, vibe if you don't.** No data-entry exam before a screen unlocks.
- **All endurance conversational** — the effort ceiling is what makes honouring the mileage safe.
- **Flag invented numbers and STOP.** Do not substitute a different invented number.
- **"The model is wrong, not the week."** When a known-good week breaches a threshold, fix the model.

### ⛔ STILL TRUE FROM D-324 — do not reinstate
No `1rm_test` tag on 5/3/1 sessions (it makes the logger discard planned rows). **RIR stays OFF for
`strength_primary`** — D-326 is a replacement signal, not a reversal. Volume is a trade, never a cap.
**The block description promises "speed and distance blocks unlock when this cycle closes" — neither
exists.** A knowingly-taken debt; a test asserts the line is present to keep it visible.

### Pre-existing and NOT from these sessions
7 failures in `shared/strength-system/protocols/triathlon_performance.conformance.test.ts`
(`vertical_pull` + "Band Pull-Aparts" naming). Failing before any of this work — verified by stashing.

---


## 🧭 NEXT SESSION — START HERE (roadmap as of 2026-07-13 — the app LEARNS numbers and does not READ them back)

> ## 2026-07-13 — FOUR STARVED READS ROOT-CAUSED. ONE PATTERN: the app learns a number, then doesn't read it.
>
> **The session's real finding, and it is structural: nothing was MISSING. Everything was BUILT and HUNGRY.** Four reads, four files, one disease.
>
> **SHIPPED + DEPLOYED (D-282 — `_shared/easy-hr.ts`, ONE definition of "easy", threshold-anchored):**
> - **`compute-workout-analysis` never read the learned LTHR** → every workout fell to %HRmax zones → easy RPE-3 runs at 133-141 bpm binned as **TEMPO/THRESHOLD** (a 1-hr easy run read *"54% Z3 / 44% Z4"*). `intensity_distribution` reported **7-20% easy** and called a well-polarized athlete **"high-intensity dominant"** — **the 80/20 check, inverted.** Fixed: Details now agrees with Baselines (both Friel %LTHR). ⚠ **Zone bins are stored per workout — HISTORY NEEDS A RECOMPUTE.** Deploy-forward only.
> - **`learn-fitness-profile`'s easy gate (`hr <= maxHR * 0.75`) excluded 0-of-22 runs** in its own 90d window → `run_easy_pace_sec_per_km` null forever → **the D-033 pace reconciler had NEVER RUN.** Fixed: threshold-anchored band (Friel Z2 ≤89% LTHR; %max 65-80% bootstrap). Proven: 0/22 → **5/22 qualify, learns 11:08/mi high-confidence, all 5 RPE-3.**
> - **`compute-facts:1039` read a field path that has never existed** (`learned_fitness.running.threshold_hr`) → `pace_at_easy_hr` null on **0 of 147 runs**. Fixed. **D-239's null-write in compute-snapshot un-nulled** (it was correct — it treated the symptom; nobody went one level up).
> - **`run_easy_hr = 122 "70% of observed max (estimated)", sample_count 0** — a fabrication shipped as a confident number. **Deleted** (Law 2).
> - **The ACWR/load ladder was NEVER poisoned** — `calculate-workload:228-256` ⟨A31⟩ already hydrated the learned LTHR. The same read, forty lines away, in the files that forgot it. **The BIKE is untouched and correct** (running HR sits 5-10 bpm above cycling at the same effort — one %max band works for the bike and locks the run out; do NOT unify them).
>
> **REVERTED — READ BEFORE RE-ATTEMPTING:**
> - **D-281 / Q-166 (the load verdict).** Shipped an ACWR-driven escalation → a live WK-1 card read **"pull back"** while every body row said the athlete was fine. **Reverted.** It violated D-266 ("ACWR never escalates"), Item 3's rule ("Load-high + body-fine → elevated max"), Q-137 ("do NOT patch the gauge") and Constitution Law 6. **THE RULE: the ratio DESCRIBES; the body PRESCRIBES.** Q-166 is **unproven** — filed on one WK-1 screen where the app declares its own ratio contaminated.
> - **Q-170 (the heat gate) — RESOLVED 2026-07-13, D-283. HOT RUNS ARE KEPT.** The exclusion is dead: **no shipped product AUTO-EXCLUDES on a temperature threshold** (Garmin ADJUSTS a *retained*, acclimation-scaled VO2max and ships no decoupling trend at all — patent US 11,998,802, verified real; TrainingPeaks shows Pa:Hr raw), **and the athlete's own data says there is nothing to correct**: across **81 steady runs** the heat→decoupling slope's 95% CI **straddles zero under every specification** (r² = 0.014), and median decoupling by temperature bucket **FALLS** with heat (<65°F: 4.90% → >80°F: 1.45%). **His hot runs read BEST — the filter was deleting his best data.** The "ADJUST FOR HEAT toggle" ruling is **WITHDRAWN**: there is no coefficient to fit, and a noise-fitted coefficient is what killed D-250. ⚠ **CORRECTION (verified 2026-07-13):** the first draft said *"Runalyze keeps every hot run — nobody deletes"*. **That was inherited unverified from the untrusted prior session and it is WRONG.** Runalyze's Effective VO2max IS a pace:HR ratio (**the closest market analogue to our read**), it ships **no** auto temperature correction (open feature request), and it **DOES** offer a manual per-activity exclude whose help **explicitly names "very warm" conditions.** **D-283 still stands, for a sharper reason: Runalyze's TRIGGER is OUTLIER-NESS, not the thermometer** — *"exclude if the estimated Effective VO2max differs from your shape by more than 5 points"* — heat is a listed *cause*, never the *gate*, and the call is always the **athlete's**, never automatic. D-275 auto-deleted on `tempF > 75`; nobody does that. **And his hot runs are not outliers — they read BEST — so even by Runalyze's own rule they would be KEPT.** Runalyze also **ships a per-athlete multivariate regression over temperature with significance testing** ("VO2max factor analysis", Premium) — the exact architecture D-283 argues for is **already shipping in the closest product**, and on his data it would return "not significant" too. → **Q-172** files the outlier gate as the rule D-275 *should* have been. ⚠ **n=1 — do NOT hardcode "heat doesn't matter."** A heat-naive athlete may show the textbook drift; any future correction must be a **per-athlete fitted** coefficient that applies nothing unless that athlete's data earns it (`_shared/heat-adjust.ts` already does this — and it is **NOT** the "corpse" the prior session called it: D-250 killed the *route identity*, and says in terms that "the read ENGINE is sound and reused". It ships today in `core-verdict.ts` + `session-detail/build.ts`). See D-283.
>
> **NEW: Q-167** (the strong-evidence RPE leg is a within-week ORDERING artifact — `makeTrend` splits the week in half at a 5% threshold; it is the signal D-266 requires for EVERY escalation, and it appears in **ZERO docs**). **Q-168** (three hand-rolled total-ACWRs; a post-reconcile override; the headline has no 'productive' branch). **Q-169** (the starved pace engine). **Q-170** (the heat gate).
>
> **PROCESS (the expensive lesson):** a Q-entry is a **LEAD, not a verified bug report**. D-281 was built on one screenshot, against the founding law of the subsystem it changed, without reading D-260/D-265/D-266/Q-137 — all of which forbade it. **Read the law before touching the machinery it governs.** And when something looks broken: **ask "is it STARVED or is it ABSENT?"** first.
>
> **NEXT (owed, in order):** ① **recompute/backfill** for zone bins + `pace_at_easy_hr` — now MORE urgent (D-284 changed how both are computed; history is on the old rules and the 5-week intensity window mixes two zone schemas). ② ~~Q-170 adjust-for-heat toggle~~ **CLOSED — no adjustment is owed** (D-283: no heat effect to correct; see the n=1 caveat there). ③ **Q-165** (LLM prose — basically passed; the two recomputes were consistent and the over-call is retracted). ④ **Q-164** (dead "Aerobic fitness" BODY row). ⑤ the "provisional" → "building base" wording.

---


## Solid (don't re-litigate)


> **📁 Solid entries dated 2026-06 (19 of them) live in [`archive/ENGINE-STATE-archive.md`](archive/ENGINE-STATE-archive.md)** — moved 2026-08-02, by date only, no judgment applied. **They are still authoritative: Solid means don't re-litigate, there too.** Grep both files before deciding something is broken.

### Bike efficiency is steady-aerobic-gated on State — the "-5.5% improving" artifact fixed (2026-07-11, D-275-bike / Q-117 #2, DEPLOYED + PUSHED)

Data-verified on Michael's 27 real rides: the State bike-efficiency "improving −5.5%" was an ARTIFACT (a May climbing block + a threshold-ridden "endurance" ride contaminated the HR-at-power substrate, which ate every ride type). Now gated to steady-aerobic rides (type ∈ {endurance, endurance_long, recovery} + ≥600s in-band dwell + best-20 < 90% FTP) → reads honest **"holding −1.1%"**. Both bike engines fixed + consistent: the spine HR-at-power efficiency (PERFORMANCE row) AND the coach's 7d HR-drift (BIKE "sessions went" row, coach v79) share ONE intensity gate (`bikeRideIntensityAerobic`). Standard = TrainingPeaks/Friel (EF & HR-at-power are steady-aerobic-only). Fixtures 42/42. **Don't re-litigate** "bike efficiency is improving" (it's holding) or "compute drift on all ride types" (hard rides contaminate it). Bike still has no stored *decoupling* like run — future compute+backfill (Q-117). See D-275 bike section.


### ⭐ START HERE IF YOU ARE THE NEXT SESSION — 2026-07-13 (a long day; read this before anything else)

**What this session was:** an audit of the PREVIOUS session (which the human did not trust), which turned into a rebuild of the run-pace stack's honesty. **Nothing was tuned to the primary user.** Every constant is field-sourced or copied from an existing one.

**THE THREE LAWS THIS SESSION LEARNED THE HARD WAY — read these or you will repeat them:**
1. **A citation inherited from a session you don't trust is a LEAD, not a receipt.** Two claims were repeated into a decisions log and a commit message without checking: that `heat-adjust.ts` was a "corpse" (it is alive and shipping) and that Runalyze "keeps every hot run" (it does not — it explicitly names heat as a reason to exclude, but its TRIGGER is outlier-ness, not the thermometer). **Verify against the source, not against the previous session's summary of the source.**
2. **A green test on the WRONG COPY is worse than no test.** D-284 wrote a fixture for the Friel Z2/Z3 boundary invariant, and it passed — against the one copy it had fixed. There was a **third** copy, on the screen the athlete actually looks at. It took a screenshot from the human to find it. **Grep for OTHER copies before you trust a passing fixture.**
3. **Do not tune to the primary user.** A "threshold-learner is biased low" theory was inferred from **three** of his runs and dropped the moment he called it. His `n=2` LTHR is not a bug to fix — it is what a thin dataset honestly looks like.

**WHAT SHIPPED (all deployed + pushed + backfilled):**
- **D-283** — hot runs are KEPT. D-275's heat exclusion is dead: not field-standard, AND on 81 real steady runs the heat→decoupling slope's 95% CI straddles zero under every specification (hot runs read BEST — the filter was deleting his best data). **The "adjust for heat" toggle is WITHDRAWN**: there is no coefficient to fit. ⚠ n=1 — do NOT hardcode "heat doesn't matter."
- **D-284** — the observed easy-pace side was being fed by **interval warm-ups and the HR-lag opening of hard reps**. Fixed with a run-level gate mirroring the bike's (D-275-bike had already cured this exact disease). Also: a `sample_count: 0` fabrication could anchor the easy band, and two Friel ceilings disagreed.
- **D-285 + Q-174** — the run-pace GLASS BOX. Killed **7 fabricated paces** (incl. a `catch` block that replaced the athlete's baselines with a **fictional athlete** and then GRADED their workout against him). Killed **two silent auto-writes** that rewrote the athlete's own typed numbers with no consent and no undo. Provenance now reaches the LLM. **The athlete CHOOSES** (`easy_pace_source`) and their choice outranks the learner.
- **D-286** — ONE Friel zone model (`src/lib/friel-zones.ts`). `easy ≡ Zone 1 or 2`, by construction, at every LTHR, on every surface.
- **D-288** (⚠ **COMMITTED, NOT PUSHED/DEPLOYED**) — **an EASY run is judged on HEART RATE, not pace.** The Performance card compared easy-portion PACE to baseline with a **±10 sec/mi** tolerance (TrainingPeaks' band is **±20%**; ±10 s/mi on an 11:08 pace is **±1.5%** — 13× stricter, on the metric the field says not to use). **4 of his 5 real runs came back "slower than baseline"** — one of them 1 bpm over his ceiling, i.e. executed almost perfectly. **Garmin ships this exact split as a setting: "Heart rate for slow steps, otherwise speed."** steady_state → HR band is the verdict; intervals/tempo/hills → keep the pace verdict; pace becomes a RECEIPT.
- **D-287** — the resolver is **UNIVERSAL on the server** (3 callers → 9). Three different precedences were live at once; the screen that GRADED a run and the plan that PRESCRIBED it could disagree about what "easy" even was.
- **F-9 backed out** — a stowaway `git stash` the prior session committed inside a "Revert".

**⭐ THE ORDER OF WORK (2026-07-13 — do these in this order; the reasons are load-bearing):**

| # | what | why this order | spec |
|---|---|---|---|
| **1** | **Q-176 — ONE LTHR** (+ `threshold_pace`, same pass) | **The ROOT.** Four chains, two inverted. Everything DERIVED from LTHR now agrees (D-286); the anchor itself does not. **Every later item sits on top of this number** — build the posture flag on four disagreeing LTHRs and you get a confident wrong answer, which is the one thing this codebase must never ship. | ✅ `SPEC-lthr-one-anchor.md` |
| **2** | **THE POSTURE FLAG** — "you said maintain running; you've run once in 3 weeks" | **The product.** The app currently says the OPPOSITE (`off-plan-banner.ts:66-71` returns **"On plan"** to a Get-Stronger athlete who has stopped running). Every part exists and has never been introduced. It is the one thing Garmin structurally cannot do. **Read `PRODUCT-POSITIONING-v2-DRAFT.md` FIRST — the voice is a trade made visible, NOT a compliance cop.** | ✅ `SPEC-posture-flag.md` |
| **3** | **Q-175 — the CLIENT stops re-deriving easy pace** (Law 4) | Cheap, bounded, and it closes the last easy-pace fracture. **The fix is the SERVER sending the resolved pace, NOT shipping the resolver client-side** (that would be a Law 4 violation with a nicer haircut). | Q-175 (sites listed) |
| **4** | **Q-174 — the BIKE half of the athlete's choice** | ⚠ **A naive FTP precedence flip SHIPS A REGRESSION.** Three consumers gate on `source === 'learned'` (`infer-training-fitness:32`, `race-projections:376`, `materialize-plan:3165` — ⚠️ **which already accepts `'learned' || 'manual'`, so it is NOT one of the blockers; the count is TWO, not three (re-verified 2026-07-31)** ⟨A31⟩) and would **silently kill bike race projections**. Fix those three FIRST. | Q-174 |
| **5** | **Q-172 — the outlier gate** (the rule D-275 *should* have been) | Not urgent, but a **−28.9% decoupling is in his substrate right now** and nothing catches it. Weather-agnostic. ⚠ Fit the statistic to the real distribution; do NOT improvise it (that is how D-250 died). | Q-172 |
| **6** | **Q-173 — the summer-silence stamp**, and a **`SCIENCE-run-specificity.md`** | Q-173's `as_of` half shipped. The science doc is **owed before the posture flag's Tier-2 prose** — the app's only maintenance theory (*"aerobic detrains slower → low volume holds it"*) is **discipline-blind**, and that is the claim the posture flag qualifies. | Q-173 |

**Also open, no order:** `PRODUCT-POSITIONING-v2-DRAFT.md` awaits Michael's approve/shred. **D-288 is committed but NOT pushed/deployed.**

**WHAT IS OPEN, IN PRIORITY ORDER:**
1. **Q-175** — the CLIENT still re-derives easy pace (Law 4). The fix is for the SERVER to send the resolved pace, **NOT** to ship the resolver client-side. Sites listed in the Q.
2. **Q-174 (bike half)** — `resolveCurrentFtp` still ranks learned above a typed FTP. ⚠ **A naive flip SHIPS A REGRESSION**: three consumers gate on `source === 'learned'` (`infer-training-fitness:32`, `race-projections:376`, `materialize-plan:3165` — ⚠️ **which already accepts `'learned' || 'manual'`, so it is NOT one of the blockers; the count is TWO, not three (re-verified 2026-07-31)** ⟨A31⟩) and would silently kill **bike race projections**. Fix those first.
3. **THE POSTURE FLAG (the big product one, spec'd in conversation, not yet written).** `per_discipline_posture` (`develop`/`maintain`/`out`) is **WRITE-ONLY** — read once at plan-build, then by **zero** runtime surfaces. So: the app never checks whether the athlete did what they said they'd do. Worse, `_shared/off-plan-banner.ts:66-71` **actively tells a Get-Stronger athlete who has STOPPED RUNNING that they are "On plan"** (`computePrimaryAdherence` counts strength only — it has no notion of the maintained discipline). **Every piece exists** (posture, per-discipline planned-vs-done counts in `adherence.ts:49`, and the sentence *"Running behind plan — total load carried via easy cross-training"* three lines above the bug). They have never been introduced. See `PRODUCT-POSITIONING-v2-DRAFT.md` for the VOICE this must be built in — it is a **trade made visible**, not a compliance cop.
4. **Q-172** (outlier gate — the rule D-275 *should* have been), **Q-173** (the summer silence), **Q-171** (closed).

**⚠ THE HUMAN'S OPEN TRAINING QUESTION (not a code fix):** his easy pace is 110% of threshold = Friel **Zone 3**. But his anchors are `n=2` (LTHR) and `n=3` (threshold pace), so *"the anchors are underestimated"* fits the data **equally well** — the two stories are indistinguishable. **Only a threshold test separates them. Do NOT "fix" his zones by inference.**


### The run-pace stack is a GLASS BOX, and the athlete chooses (2026-07-13, D-285 + Q-174, DEPLOYED)

**Spec:** `docs/SPEC-run-pace-glass-box.md`. **Changes no number's VALUE** — only where it comes from, who may overwrite it, and what travels with it.

**⛔ FIRST — what was REJECTED.** Deriving easy pace from threshold pace (Daniels/Friel). **Traced and killed.** It ALREADY EXISTS (`create-goal:319-325`, as the fallback; four VDOT copies in the repo); **D-033 already rejected it** in writing (`DECISIONS-LOG:691`); and it re-breaks Law 1 *permanently* — the reconciler would stop measuring fitness change and start measuring the athlete's deviation from Daniels, a fixed structural offset that never goes away (dense data → `reconciled_better` forever, a lie; sparse data → the derived slow pace goes straight into the plan). It would also require **fabricating a `sample_count`** to satisfy `baselineUsable()` — the exact Law 2 violation deleted in D-284. **The math was never the problem. The plumbing was.**

**What shipped (D-285):**
- **`resolveCurrentRunEasyPace`** (`src/lib/resolve-current-run-pace.ts`) — the run twin of `resolveCurrentFtp`, which the run never had. Owns the sec/km→sec/mi conversion **once** (the unit footgun that has bitten this repo 3×). Carries `source`/`confidence`/`sample_count`/`as_of`/`is_estimate` to every surface.
- **SEVEN fabricated paces deleted.** Worst: `analyze-running-workout:451`, a `catch` on an **unrelated** query that responded to failure by **replacing the athlete's real baselines with a fictional athlete** (easy 9:00/mi, marathon 10:00/mi) — and then **GRADED their workout against it**. Plus `|| 540` on six token-parser sites (an invented 9:00/mi written onto **planned sessions** as their pace target) and `?? 600` on two duration→miles conversions (silently rewriting the recorded peak long run by ~10%).
- **The app no longer overwrites the athlete.** Deleted two silent auto-writes in `adapt-plan` (easy pace AND FTP) that rewrote `performance_numbers` with **no consent and no un-write path**, then re-materialized the plan off the number they had just changed. Costs nothing: the athlete-gated **suggestion** already fires on a *looser* trigger (≥5% vs ≥7%). The only thing the auto-write added was the absence of consent.
- **Provenance reaches the LLM** (`arc-context`) — it used to strip confidence/samples/freshness, so a 5-run guess and a 20-run measurement looked identical to a model that is told to *quote* them.
- **A latent NaN bug** (`create-goal:2401` read the metric OBJECT, not `.value`) meant the Get Strong maintenance band had **never once fired**.

**Q-174 — THE ATHLETE CHOOSES (Michael's ruling).** `performance_numbers.easy_pace_source: 'manual' | 'learned'`, via a two-option control in Baselines. `'manual'` wins **even over a high-confidence learned pace** (an assertion outranks an inference — Garmin/TrainingPeaks both honour a value you set). `'learned'` tracks the learner and **skips the manual tier**, so a declined number cannot resurface. **Absent = byte-identical to before.** Purely additive; fixtured.
⚠ **BIKE IS THE OPEN HALF, and it is NOT a one-line flip** — three consumers gate on `source === 'learned'` (`infer-training-fitness:32`, `race-projections:376`, `materialize-plan:3165` — ⚠️ **which already accepts `'learned' || 'manual'`, so it is NOT one of the blockers; the count is TWO, not three (re-verified 2026-07-31)** ⟨A31⟩); a naive FTP flip would **silently kill bike race projections** for anyone with a manual FTP. See Q-174.

**Live-verified against deployed code** (`scripts/verify-d285-live.mjs`): `as_of` stamps land, the basis string renders, and the choice defaults to today's behavior. **What the glass box immediately exposed:** `run_threshold_hr = 151, as_of 2026-05-21 (53 days old), n=2, medium` — the athlete's **entire zone table, easy band and every derived pace hangs off a 53-day-old number learned from two efforts.** That was always true; it was simply invisible. **A threshold test is the highest-leverage action on the board** (see SPEC §6 — his easy pace is 110% of threshold = Friel **Zone 3**; but the anchors are thin enough that "the anchors are underestimated" fits the data equally well, and only a test separates the two).

**Verified:** 1056 shared tests pass (same 5 pre-existing cycling-v1 failures); client `vite build` green; zero new type errors anywhere. **Deployed** (19 fns): adapt-plan, analyze-running-workout, compute-workout-analysis, compute-facts, compute-snapshot, learn-fitness-profile, create-goal-and-materialize-plan, coach, end-plan, complete-race, get-arc-context, generate-training-context, arc-setup-chat, course-detail, course-strategy, workout-detail, generate-combined-plan, analyze-cycling-workout, analyze-strength-workout. Client live via Netlify.


### The easy-pace path is no longer contaminated, and hot runs are kept (2026-07-13, D-283 + D-284, DEPLOYED + BACKFILLED)

**This session AUDITED the prior one (which was not trusted) and found three real defects plus a stowaway.**

**D-284 — the observed easy-pace side (`compute-facts`) was fed by HARD runs.** It qualified *samples*, not *runs* (every run, 10-sample floor), so an interval session's warm-up **and the HR-lag opening of each hard rep** (HR not caught up, pace already fast) wrote a `pace_at_easy_hr` for a hard workout — feeding `run_easy_pace_at_hr` → the D-033 reconciler → **the plan's easy pace**. Fixed with `runEasyPaceEligible()` (`_shared/easy-hr.ts`): the run must qualify as a whole run, using **the same predicate the baseline learner already applies** (≥20 min + the run's own avg HR in band — Law 1: the reconciler compares the two sides, so they must measure one population), plus a real **dwell floor in seconds** (600s, mirroring the bike's `MIN_EFFICIENCY_IN_BAND_S`) instead of "10 samples". **The bike had already cured this exact disease (D-275-bike, "cardiac lag"); the run never got the fix.** Also fixed: a **`sample_count: 0` fabricated threshold** ("88% of observed max") could anchor the band and announce itself as "Friel Z2 — at or below 89% of your threshold HR" — and produced a band *tighter* than the honest bootstrap; and **two Friel Z2 ceilings** (134 vs 136) meaning a 135 bpm run was "Zone 2" on Details and "not easy" to the learner. `isEasyHr(hr) === true` ⇔ Zone 1 or 2, by construction, now.

**D-283 — HOT RUNS ARE KEPT.** D-275's heat exclusion is removed from **both** engines (spine substrate + the coach's 7d receipt — they must die together or the AERO↔PERFORMANCE fracture re-opens). It was not field-standard, and **measured on 81 real steady runs there is no heat effect on decoupling to correct** (95% CI straddles zero under every specification; median decoupling FALLS with heat; hot runs read BEST). The "adjust-for-heat toggle" is withdrawn — there is no coefficient to fit. **The July-5 bug does not return** (verified): the protection was always the min-sessions floor, and both surfaces gate on `verdict !== 'needs_data'`. ⚠ n=1 — see D-283's user-agnostic limit before generalizing.

**The F-9 stowaway — BACKED OUT.** The prior session's `c1a96b9c` ("Revert the heat work") also silently committed a popped `git stash`: the **F-9 provisional plan-generation cut** (`week-optimizer` type widening, `sport` threading into the reconciler, provisional RUNNING/CYCLING frequency matrices), unmentioned in its commit message. **D-218 had already evaluated that exact cut, found it insufficient, and routed around it.** It also **deleted the two guardrail tests** written to prevent it, and it typed `runs_per_week: 0` as legal while the optimizer places the long run and quality run **unconditionally** (matrix promises 4-5 runs / 0 bikes; the engine would deliver 3 runs / 2 bikes). Never deployed and unreachable through the live router, so prod was never wrong — but it was a **landmine** (the next unrelated `generate-combined-plan` deploy would have shipped it) and it made `ISLANDS-ORIENTATION.md` + D-218 factually wrong about the repo. Restored to pre-F-9; **the 3 guard tests are back (71/71)**. The code is preserved in git at `c1a96b9c` if the combined engine's single-sport path is ever built for real.

**Verified:** 1041 shared tests pass (the same 5 pre-existing cycling-v1 failures); 61/61 state-trend; 24/24 `easy-hr` (13 new fixtures incl. the interval-session regression, the `sample_count: 0` anchor refusal, and a **Law-1 pin asserting baseline and observed never qualify different runs**); zero new type errors in `_shared` (50→50), `coach` (11→11), `compute-facts` (34→34), `compute-workout-analysis` (2→2). `COACH_PAYLOAD_VERSION` → **95**.
**Evidence scripts (read-only, re-runnable):** `scripts/verify-heat-decoupling-evidence.mjs`, `verify-heat-decoupling-regression.mjs`, `verify-heat-decoupling-robustness.mjs`.
**DEPLOYED + PUSHED + BACKFILLED (2026-07-13).** Edge: `compute-facts` v75, `compute-snapshot` v55, `compute-workout-analysis` v165, `learn-fitness-profile` v46, `coach` v319. Client live via Netlify (F-9 backout). `generate-combined-plan` deliberately NOT redeployed — the F-9 backout restores it to the deployed v268.

**BACKFILL DONE** (`scripts/verify-d284-backfill.mjs`, deterministic chain only — `compute-workout-analysis` → `compute-facts` → `learn-fitness-profile` → `compute-snapshot`; the analyzer is deliberately NOT invoked, because it regenerates LLM narratives and none of D-283/D-284 lives there). 147/147 runs, 50/50 weeks, 0 failures. Measured before → after:

| | before | after |
|---|---|---|
| HR zone bins on `%HRmax` (stale schema) | **87** | **0** |
| HR zone bins on Friel/LTHR | 1 | **118** |
| runs carrying a `pace_at_easy_hr` | 1 | 19 |
| median `pace_at_easy_hr` | 450 s/km (**12:04/mi**) | 409 s/km (**10:58/mi**) |

**The zone split-brain is gone** (0 runs left on the old schema → `intensity_distribution` / the 80-20 read is now one substrate). And the contamination is visible in the numbers: the single pre-backfill reading was **12:04/mi** — computed under the old sample-level gate, off a hot run whose avg HR was *above* the easy band. Re-derived from 19 properly-qualified easy runs it is **10:58/mi**, adjacent to the learned easy pace (11:08/mi). **The old value was telling the D-033 reconciler he had detrained by over a minute per mile. He had not.** 128 runs correctly carry NO reading (intervals/tempo/too short/no HR) — that is the gate working, not a starvation.


### Run durability (decoupling) on State — the AERO↔spine continuity close (2026-07-11, D-275)

> ⚠️ **THE HEAT HALF OF THIS ENTRY IS SUPERSEDED (D-283, 2026-07-13). HOT RUNS ARE NO LONGER EXCLUDED.**
> The exclusion was neither field-standard nor supported by the data (81 steady runs: the heat→decoupling
> slope's 95% CI straddles zero under every specification; hot runs read BEST). It is REMOVED from both
> engines. **Everything else in this entry STANDS** — the terrain/steady/duration gates, and above all the
> AERO≡PERFORMANCE reconciliation (one substrate, one vocabulary), which is the durable win here.
> The July-5 bug does NOT return: the protection was always the min-sessions floor, not the heat filter.


State's run durability no longer stands up a red "durability gap" off a heat-confounded run, AND the AERO card now reads the SAME source as the PERFORMANCE trend (the coach↔spine gap is closed). Two parts: (1) `analyze-running-workout` stamps `decouplingConfounded` on `heart_rate_summary` (`drift.weather.factor==='hot'`, >75°F); `state-trend/run.ts` `decouplingToSeries` drops confounded runs from the substrate — same exclusion terrain-confounded (`raw`)/non-steady/<20-min runs already get; threaded through `compute-snapshot` + `useStateTrends.ts`. (2) The AERO card's steady-run durability VERDICT (coach v78) now reads the SPINE `state_trends_v1.run.decoupling.band` via the shared `decouplingBandDisplay` vocab — was the coach's own 7d average, an ungated duplicate that diverged. So AERO ≡ PERFORMANCE in value AND words. Validity gates match industry+science (Friel/TrainingPeaks, Intervals.icu, Garmin): heat/terrain/effort/duration — **RPE is NOT a gate** (removed after research; its home is the workout narrative). Fixtures: `run-decoupling.test.ts` incl. the July-5 regression + the shared-vocab pin, 37/37 green. **Verified on device:** AERO flipped red "durability gap" → neutral "building aerobic base", matching PERFORMANCE. **Don't re-litigate** "add RPE to the durability gate" (the field doesn't) or "coach computes its own durability" (it reads the spine now). See D-275.


### Coach week-headline honesty net (2026-07-11, D-274, coach v77, DEPLOYED + PUSHED)

The State screen's ONE AI sentence (the WK headline) is now guarded against its own on-screen rows. It already ran through `runGuardedNarrative` (spine rules 6/7/5/8/10); closed two holes: (1) `atypicalSignals` was hardcoded `[]` → rule 2 ("don't call the week comfortable/cruising while a signal is atypical") could never fire; now fed the CONCERNING spine verdicts (any discipline `sliding`, e.g. the AERO "durability gap"), derived from the same verdicts the rows render → the headline can't contradict its own screen. (2) Cold-start bypassed the guard entirely → now always guarded. Extended the shared `ACK_ATYPICAL` lexicon with weekly-decline words (sliding/slipping/declining/fading) so an honest "run is slipping" headline isn't falsely flagged; excluded `slow` (workout surface unweakened). Fixtures: 2 coach-net cases + 29/29 narrative-core green. **Live:** headline recomputed clean with a durability-gap row on screen (no-over-fire case). LLM-stochastic → 2 more recomputes owed to fully close. Don't re-litigate "coach is unguarded" — it isn't (that premise was stale). See D-274.


### Run HR/drift/decoupling — ONE condition-aware read on Performance (2026-07-11, D-273, DEPLOYED + PUSHED)

Consolidated the run analyzer's HR-behaviour reads into one honest, condition-aware verdict (the D-272 tail / Q-158). All shipped + fixtured + deployed (`analyze-running-workout` + `workout-detail`):
- **Phase-blind "normal for X min" verdict DELETED** — the bpm "Heart rate" row is measured description + own-baseline only; conditions-aware "is this normal" is owned by the one analyzer verdict.
- **Aerobic decoupling % surfaced** (TrainingPeaks Pa:Hr standard, <5% good) — was dormant (efficiency.ts dropped `basis`, buildSummary dropped basis+assessment); now single-source. When shown it leads + suppresses the bpm line (one HR read, not two). Live-confirmed on the 7/5 run (10.7% high).
- **Two expected-drift bands collapsed to one** — interpretation.ts reads drift.ts's terrain-adjusted, phase/weather-aware `assessment` instead of recomputing a raw-drift band; deleted `getExpectedDrift`/`assessDriftBand`. Science-backed (drift judged against conditions, one number; stimulus is a time-in-zone question not a drift one).
- **Confound guard** — hot/hilly runs name the confound instead of calling inflated drift "higher than your typical" (a fitness lie).
- **Empty-half-window guard** (drift.ts) + **deleted a dead 1,343-line `analysis/heart-rate-drift.ts`** (orphaned engine, no importers).
- **Fade-guard mixed-effort hole closed** (Q-129 progress) — `is_mixed_effort` no longer suppresses the fade guard when the "mixed" flag came from a fade's own pace variance; only real plan structure suppresses. 7/5 now names the fade + drops the "vs similar" laundering.
- **Fade prose opener** — introduces the slowdown fresh ("your pace slowed…") instead of "The fade happened…". LLM-stochastic → still needs ≥3 Michael recomputes; generalization across other faded-run types is "trust and watch" (7/5 ≈ the only clear faded run in the data).

Verification method: deterministic fixtures (`decoupling-basis`, `hr-drift-decoupling-rows`, `drift-band-single-source`, `drift-confound-guard`, `execution-honesty`) — all green; the fade opener awaits the recompute eyeball. Any type errors in these files are pre-existing `strict:false` noise (verified by stash-and-recheck). Don't re-litigate: the bands are ONE now, the % is the durability verdict, the bpm line is description. See D-273.


### State↔Performance fork sweep — the workout narrative reads the SPINE, never re-derives (2026-07-10/11, D-272, DEPLOYED + PUSHED)

Swept all 4 disciplines for the "workout narrative grew its own trend classifier that can contradict State" pattern (the D-239/D-270 class, generalized). Closed + deployed, each with a fixture: **bike easy-ride false-dip** (gate on shared `POWER_BINS`; confirmed on 2 real rides) · **run decoupling band** (workout → shared `frielBand` 5/10 tiers, finishes D-239 run-side) · **strength RIR** (one shared ±1.0 `rirVerdictFromDelta`; killed the ±1.5 table outlier) · **strength e1RM direction** (workout reads `state_trends_v1.strength.per_lift` via `spineDirectionToTrend`, finishes D-270 workout-side; numbers + test PR stay receipt) · **bike power "trending" limiter** (removed the baseline-blind §2 NP-trend fake; spine owns bike-power direction; real W/kg limiter intact). Principle: per-session = receipt, multi-week trend = the spine. Commits `e8b67eaf` / `5057b590` / `0d6b1288` / `b7715321` / `cb4eb1d5`. **Verification:** deterministic fixtures all green; bike easy-ride + limiter live-confirmed (before/after on 2 rides); RIR / e1RM / run-decoupling are LLM-prose → await Michael's ≥3-recompute eyeball (structurally the lies can't reappear — packet no longer carries them). See D-272. **Deferred to a fresh chat (low-stakes tail):** run-efficiency chart label (Q-157) + run HR-drift band (Q-158), both scoped.


### Q-154 UTC import date — evening ride landed on the adjacent local day (2026-07-10, FIXED, DEPLOYED + PUSHED)

`import-strava-history` bucketed its Strava fetch window by UTC, so an evening (local) ride only appeared when you requested the *next* calendar day (it then filed correctly under the local day via `start_date_local`). Fix (`import-strava-history/date-window.ts`): widen the UTC fetch window a day each side, then select by LOCAL calendar day — tz-agnostic. Regression fixture pins the 7/7-evening (UTC 7/8) case. Live webhook path was already correct (untouched). Commit `8b9cf3e7`.


### B1 auth boundary — 9 edge functions now derive identity from the VERIFIED JWT (2026-07-10, D-271, DEPLOYED + COMMITTED)

FOUNDATION-READINESS blocker B1 (cross-user exposure): edge functions trusted a body `user_id` under the service-role key, so a caller could pass any id. Fixed with one shared verifier `supabase/functions/_shared/require-user.ts` — `requireUser` (client-only funcs; anon key AND service key both yield no user → 401) and `resolveUser` (client-OR-service funcs; service key → trusted `isService`, human JWT → verified id + ownership guard, else 401; **robot path byte-identical** to protect ingest). **Converted:** `get-arc-context`, `sweep-user-history`, `weekly-workload`, `disconnect-connection`, `detach-planned` (+ missing ownership guard), `sweep-week` (had NO user filter — swept every user, anonymously triggerable — now caller-scoped), and the ingest trio `calculate-workload` / `auto-attach-planned` / `adapt-plan`. **Commits** `fda4922c` (batch 1) · `e335c8fb` (sweep-week) · `bca74067` (ingest trio — restored after a mid-session crash wiped the source *after* the deploy; prod had it, git didn't). **Verification method:** `deno check` clean on the restored funcs; pattern mirrors the proven save-location/readiness gate; **live-proven** — a fresh Garmin walk imported AND Strava history imports ran clean post-deploy (ingest pipeline intact, no 401 on the robot path). **STILL OPEN (not B1-complete):** Strava/Garmin webhooks need a shared-secret guard (they carry no JWT); B4 (error monitoring) untouched. See D-271.


### Architecture north star + doc framework — the anti-drift map (2026-07-10, D-269 / Q-150)
Destination written down + in CLAUDE.md priming: `TARGET-ARCHITECTURE.md` (deterministic · smart-server/dumb-client · single source of truth; yardstick "make X look like run"), `TRUTH-MAP.md` (per-fact authority + verified fractures: strength contradicts itself, bike FTP, swim broken), `FOUNDATION-READINESS.md` (scale/security/ops; blockers B1 cross-user exposure + B4 no monitoring). Companion to SCREEN-INVENTORY/CONNECTIVITY. Verified by 3 adversarial audits. **Per-discipline cohesion: RUN = clean (the model); strength = contradicting; bike = mixed; swim = broken.**


### b2 — plan-primary execution surface (State screen) — SHIPPED LIVE (Q-149, 2026-07-10, coach v73)
State execution rows (STRENGTH/AERO/BIKE) lead by the plan's primary discipline: `resolvePrimarySport` (single source) → coach `weekly_state_v1.primary_discipline`; `_shared/strength-session-types.ts` renders the strength analyzer's per-session verdict (Law-5, no new grading); cardio rows render the efficiency verdict (BIKE "0% eff" lie fixed). Fixtures green (strength-session-types + primary-sport). Deployed coach + client (Netlify). Next handoff: `HANDOFF-2026-07-10-architecture-north-star.md`.

Verified-working architecture and fixes. If you think one of these is broken, the bug is probably elsewhere — read the verification method before changing anything.


### Segment / route-core feature — BUILT + LIVE on real data (Q-132, D-250→D-258, 2026-07-07, DEPLOYED web + edge fns)

The honest "am I faster on this exact stretch" feature (now the SECONDARY lens — Best Efforts is primary, D-258). **Files:** `_shared/core-match.ts` (ordered path-match, 8 fixtures), `core-detect.ts` (consensus detection, 12), `core-effort.ts` (effort extraction + per-slice `metric_source`, 19), `core-verdict.ts` (6-month-windowed, N≥8-floored, CI-gated verdict + still_building/still_learning split, 9); edge fns `detect-cores` / `match-cores` (corridor 50m, D-257) / `compute-core-verdict`; surface `workout-detail` → `session_detail_v1.segment_verdicts[]` via `session-detail/build.ts` (`buildSegmentVerdicts`, PLURAL); client `src/components/RouteDoorway.tsx` (flag-driven — no slope under "holding", locked y-axis, gold PR, tap→date·pace·HR). Tables `route_cores` / `core_efforts` / `core_verdicts`. **Verification:** deno/node fixtures (committed) + verified LIVE end-to-end on user 45d122e7 (23 efforts, 21 in window, `still_learning`, CI [−11.7, 8.9], stable across recomputes). Verdict born on the spine (Law 5, `compute-snapshot` chokepoint); surface renders flag-driven (Law 4, governance-by-construction D-253). Calibration params (coverage_frac 0.4, min_core 600m, corridor 50m, window 183d, floor 8) flagged non-universal (Law 2). ⚠ iOS bundle NOT rebuilt — card is web-only until `npm run ios`.


### Narrative honesty + GAP integrity + plan-aware load (Q-128 / Q-130 / Q-122, D-244/245/246, 2026-07-05, DEPLOYED/SHIPPED)
Three fixes from the "the app must not lie" arc (all D-242 — label what's computed, never compute to match the label):
- **Q-128 (D-244, DEPLOYED `analyze-running-workout`):** the run `ai_summary` narrated a faded run as "clean execution / pace held steady." Guarded at `generateAISummaryV1` — prompt rule + validator-regen + deterministic seatbelt (`execution-honesty.ts`), keyed on the within-run positive split alone (20s/mi). Verified 3/3 recomputes on the 7/5 run. **Standing rule banked:** LLM-generator acceptance = ≥3 clean recomputes, never one (fooled by variance twice). Split source was the runtime bug — use the post-analysis re-read (`workoutToUse`), not the stale line-162 read.
- **Q-130 (D-245, DEPLOYED `compute-workout-analysis`):** GAP was an arithmetic mean of per-sample pace (`gapSum/gapCount`) while raw pace is time/dist — `AM ≥ HM` inflated GAP ~15s/mi on ANY pace-varying run, false "downhill" on flat routes. Fixed with distance-weighted `aggregateGapPace()`. Reproduced cold (arithmetic-mean-of-RAW = 769 vs 754). **Feeds `workload` + pace-vs-norm baseline**, so this cleaned load math broadly, not one narrative. Verified 7/5: avg_gap 772→757, bias downhill→flat, narrative clean 3/3.
- **Q-122 (D-246, SHIPPED client `665e2472`, web auto-deploy; iOS synced):** the ORIGINAL goal — high-but-on-plan build week reads "building on plan" not "back off". `planAwareVolumeLabel()`, Option (b) (word plan-aware, marker/zone raw). Fixture-proven; live-engages once ACWR is in the 1.3–1.5 band during a build week.
- **Process wins banked:** eyes-open reproduction (real data before deploying) stopped THREE wrong fixes this session — the null-split source guess, the "invented terrain" narrative guard (the "downhill" was derived, not invented — it was the GAP bug), and elevation-smoothing (only 3s/mi of the 15). **The whole arc validated `verify-before-asserting` as the load-bearing discipline.** Q-129 filed (shared honesty spine — the SUMMARY fallback + `hr_drift_interpretation` are still unguarded surfaces).


### Honest run load — easy-run planned workload reads its prescription, not the flat default (Q-125 Gap B + Q-126, D-243, 2026-07-05, DEPLOYED)
Started as Q-125 (verify Q-122's denominator: is `workload_planned` per-session or a template constant?). Answer: **per-session** — `activate-plan`'s `estimatePlannedWorkload` = `round((dur/60)×intensity²×100)`, intensity from `getStepsIntensity(steps_preset)` else the per-type default. The "flat ~56" was a symptom of two intensity holes, both now closed:
- **Gap B (`workload.ts:22`, DEPLOYED `f9ea9a0d` → activate-plan/backfill/calculate-workload/compute-facts/coach):** the substring matcher missed the generator's real token families — `run_easy_*` (×19+), `warmup_run_quality_*`, `run_mp_*` — so tokenized easy runs silently fell to the 0.75 default, reading HOTTER than a prescribed easy run (0.65 < 0.75). Added `run_easy:0.65, warmup_run_quality:0.65, run_mp:0.82`. Data-verified on real rows (user 45d122e7): 168 run rows, 109 tokenized, all `run_easy_*` were defaulting. Fixture `workload-run-tokens.test.ts` (9). **Historical race-plan rows NOT retro-fixed** — backfill is null-only; go-forward.
- **Gap A / Q-126 (`strength-primary-plan.ts`, DEPLOYED `d8d8e1b7` → generate-strength-plan, RESOLVED):** the non-race Get Strong generator's `enduranceSession()` returned run sessions with NO `steps_preset` field at all → 0.75 default for the whole live plan. Now emits `run_easy_${mins}min` / `longrun_${mins}min_easypace` (long-run day), gated `sport==='run'`. **Spine-safety proof:** strength subset byte-identical to a pre-change golden (55 sessions), locked in `strength-primary-plan.q126.test.ts` (5). **Verified end-to-end via Level B synthetic-account test** (throwaway user → deployed generate+activate → real `planned_workouts`: all 24 run rows honest 0.65, steps_preset survived the DB round-trip, cleaned up 0 residual). **Bike is FENCED** (rides still default to 0.70 — Gap A-bike, own pass).
- **Attribution lesson (banked):** the Q-126 site was mis-attributed TWICE (session-factory → week-builder) before the real site (`strength-primary-plan.ts:283`) was found by READING the emitting function. Rule: an attribution is pinned only when you've read the function that emits the field, never by eliminating a suspect.
- **Bearing on Q-122 (next):** the plan-overshoot denominator is now honest per-discipline for the live plan — Q-122's intensity-awareness is no longer dormant. Strength still duration-only by design (no `steps_preset`, structural).


### State screen cohesion — strain off the crown, one clock per place (D-240/241/242, 2026-07-05, DEPLOYED coach v67 + client `2116e9f2`)
The State top was restructured to the Whoop/Garmin model (one headline verdict, each score paired with its driver, no roll-ups, strain never the crown) — **all subtractive**. **Headline = the week only** (`buildLoadHeadline` drops the fitness clause; fitness is handed to the PERFORMANCE discipline rows, each on its own 6–8wk clock — no aggregate). **EFFORT-UP chip removed.** **PERFORMANCE `synthesizeHeadline` roll-up removed** (it committed all 3 roll-up sins — lossy/cherry-pick-via-provisional-gate/clock-mismatch; verified on real data, swim −3.6% was hidden). **Why → BODY driver** (`readiness_rpe_driver`, RPE-clause-only, paired under "how hard it feels"; constant-free rule D-241). **"N concerning signals" count fallback deleted** (`buildReadinessWhy` → null when no named driver; the `week_narrative` expand gated on narrative, traced LIVE 10/11). Verification: `load-headline.test.ts` (week-only both ways) + `readiness-receipts.test.ts` (driver rule + RPE-clause-only, both directions) — 47+ fixtures. **Follow-up = Q-122** (plan-phase-aware load verdict — the honest gap: high-but-on-plan build weeks still false-alarm as "back off").


### D-238 — cardio load is OUTPUT-FIRST; TRIMP + resting HR retired (2026-07-04, code complete + fixtured; DEPLOY PENDING before/after review)

Resting-HR-based **TRIMP was the PRIMARY cardio load metric** (tier 1 in both `calculate-workload` and `compute-facts`, above power/pace) with resting HR **fabricated `?? 60`** whenever absent — and on Michael's data it was ALWAYS fabricated (247 cardio, 0 stored RHR; 215 rides with real wattage TRIMP ignored). Deleted `calculateTRIMPWorkload` + the TRIMP-first block from both writers + every `resting_heart_rate` read; extracted the output/threshold ladder to shared `inferIntensityFromPerformance` (`_shared/workload.ts`); compute-facts gained the power/pace tier. New ladder: **power(FTP)/pace → HR%LTHR → sRPE → duration default**; HR only ever as %LTHR, never resting HR. `classifyWorkloadMethod` reordered output-first. Planned-load callers (`activate-plan`, `backfill-planned-workload`) now score from the prescription (duration×IF²), same scale as actual. **Verification:** `workload-ladder.test.ts` + updated `workload-method.test.ts` (13 pass); grep confirms zero TRIMP/resting-HR reads in the load path. **NOT YET DEPLOYED** — Michael reviews the real-history before/after (`verify-load-ladder-impact.mjs`: window ACWR shift + dramatic movers) FIRST, then `supabase functions deploy calculate-workload compute-facts activate-plan backfill-planned-workload`. Principle: **D-238** (DECISIONS-LOG) — load anchors on measurable outputs + sRPE, never fabricated physiology; do not re-introduce RHR-dependent load.


### Step 6 COMPLETE — ACWR single-authority + fact-layer reclassification + RPE dedup (D-236, 2026-07-03)

One shared ACWR authority `_shared/acwr.ts` (coupled-rolling, `acwr-state.ts` sole classifier, `ratio` + `ratioRaw`). Canonical load source = **`workouts.workload_actual`** (`workout_facts.workload` is a deferential mirror of it, `compute-facts:1489`). Formula A (calendar-decoupled) RETIRED — compute-snapshot now coupled-rolling, **persisted == live** with coach; asOf resolved athlete-local (`_shared/local-date.ts`) so it matches coach at all hours. Repoints: coach D/E onto the shared `weightFn` (byte-identical via `.ratioRaw`); fact-packet B onto the helper + `getAcwrStatus` (status 1.15→1.3, divergence (v)); coach C left as reference, generate-training-context G a deliberate variable-window keep. `buildBodyResponse` reclassified as the deterministic **fact layer** (NOT retired into narrative-core, which is prose-only); fatigue weights extracted to `_shared/fatigue-weights.ts`; golden fixture pins every body-response string. RPE dedup: `crossTrainingStressReceipt` suppresses the glance-tier "Cross-training" row when RPE is the sole distinct signal (was double-counted via `bodyConcerned`). **Verification:** 44 deno fixtures (divergences (i)–(vi), coach equivalence, compute-snapshot golden, tz boundary, body-response golden, RPE dedup) + acceptance run on Michael's real data (**1.10 coupled vs 0.67 decoupled** — coupling damps the calendar-boundary swings both directions). Deployed: compute-snapshot, coach, analyze-{running,cycling}-workout, workout-detail. Follow-up: Q-116 (EWMA option, deferred).


### RUN needs_data — floor now scales off COMPARABLE-EASY-run cadence, not total-run (2026-07-03, two-part)

State RUN read *"Not enough data yet — 3 runs in 6wk (need 3)"* while Michael had **24 completed runs in 90d**. Two fixes:
1. **Receipt honesty (`minSessions` propagation).** The "need N" floor was never carried to the client, so `trendReceipt` hardcoded `floor=3`. Now `minSessions` flows `classify.ts` → `TrendResult` → `PerfSummary` (`perfFromTrend`) → `state_trends_v1` (`toStateTrendsV1`/`DisciplineTrendCache`) → client `floor` (`StatePerformanceSection.tsx`). (`classify.ts:65` `inWindow.length < minSessions` gate unchanged; `floor` still defaults to 3 for old cache / strength no-series.)
2. **The REAL root cause — population mismatch (D-237).** My first diagnosis (REF_SPW / cadence-0) was WRONG: real-data query showed 24 completed runs/90d (cadence 1.87/wk, so `minSessions=4` was LEGIT, not a REF fallback). The bug: the GAP-pace trend counts only **comparable-EASY** runs (`run.ts` `COMPARABLE_RUN_EFFORT={'easy'}`) — 3 of his 24 — but the floor scaled off **total**-run cadence (1.87→4). A mostly-quality runner is then permanently "needs data". **Fix:** `assemble.ts` derives the run cadence from the comparable-easy **series length over the 90d window** (`runJoined` fetch widened 42d→90d in `useStateTrends.ts` + `compute-snapshot`; `classifyTrend` still windows the trend to 42d), so his ~0.5 easy-runs/wk → `minSessions=3` → 3 easy points RENDER. Plus copy: the too-few run receipt now says "N **easy-pace** runs" (`trend-receipt.ts`), so it doesn't read as total-run scarcity.
- **Verification:** `run-cadence-population.test.ts` (renders on easy cadence; reproduces the bug on total cadence), `classify-boundary.test.ts`, `trend-receipt.test.ts` (easy-pace label + real floor). Deployed: compute-snapshot; client via Netlify (client re-runs the same `assembleStateTrends`). **Possible latent follow-up:** bike/swim trends also filter to a comparable subset but still use total-discipline cadence — not observed broken (Michael has volume), unaudited.


### Axis 1 (cross-domain carryover) — BUILT + WIRING-VERIFIED; only a real-data live positive remains (D-234/D-235, 2026-07-03)

The hybrid app's signature reasoning axis — *"Monday's lift is why Wednesday's ride felt hard."* One shared detector (`_shared/cross-domain-carryover.ts`), three gated signal paths on the run/bike/swim cards: **objective** (run cadence-primary + decoupling; bike power-at-HR decoupling; swim silence-default courtesy-tier), **RPE-vs-output two-way gauge** (perceived effort vs the athlete's own comparable-intensity baseline — below suppresses, above triggers; baseline-quality gated), and **declared soreness** (Q-049, the strongest leg-feel trigger, Z-score vs own baseline). Honesty spine: the evidence gate (antecedent + genuine elevation + confound-subtracted residual + not-systemic → else silence), a **before-session provenance guard** (`resolveCarriedInSoreness` — a session's own post-log can't self-trigger; only soreness carried IN counts), and the **declared-vs-inferred split** (only a LOGGED soreness slider earns "you reported sore legs"; inferred paths stay LOAD language — same class as the "taper"/"8 weeks" fabrications we killed). **loaded-legs = COEXIST** (cards per-session, State weekly-aggregate; kept "one fact" via the shared `classifyStrengthFocus`, coach v60). **Verification:** 57 deno fixtures + a **synthetic-user acceptance run** (`cross-domain-carryover.synthetic.test.ts`) that proves the LIVE pipeline emits *"You reported sore legs after Monday's lower-body session — keeping this ride easy was the right call…"*, silences on normal soreness, and won't self-trigger. Deployed: analyze-{running,cycling,swim,strength}-workout, coach, compute-snapshot. **NOT YET: a live positive on Michael's real data** (data-gated — both declared baselines are empty until he logs; see Questioned). Design: `docs/DESIGN-cross-domain-carryover.md`, `docs/SELF-AWARENESS-MAP.md` (Axis 1).


### Wellness scale = Hooper 1–7 app-wide; sleep stays hours (D-234/D-235, 2026-07-03)

Soreness + energy standardized to the industry Hooper 1–7 scale (was 1–10); **sleep stays HOURS** (objective, documented exception — no principled hours→1–7 map). Two documented soreness fields: `readiness_checkins.soreness` (DAILY check-in → coach LEGS SORE, compute-snapshot) and `workout_metadata.readiness.soreness` (PER-WORKOUT post-completion popup → the cards' carryover). Migration `20260703120000` linear-rescaled history `round(1+(v−1)·6/9)` (7→5 exact) — **applied by Michael via SQL editor 2026-07-03**; client scale-switch (segmented-bar popup all disciplines + StrengthLogger 1–7 sliders) shipped in the same window. Consumers retuned: coach LEGS SORE ≥7→≥5; analyze-strength /10→/7 + cuts; **longitudinal-signals overreaching floor 6/10→4/7** (a consumer missed in the first pass, caught by a sanity check + fixed); the readiness scoring extracted to the unit-tested `_shared/readiness-scale.ts` (this is where the missed normalizer lived). **Verification:** `readiness-scale.test.ts` (7) incl. the overall-label matrix that guards the next skipped consumer; `workoutMetadata.test.ts` (3) the no-default popup guarantee.


### Q-097 CLOSED — the 1RM write-back fires; strength tests are their own honest class (D-227, 2026-07-02)

The strength baseline-test e1RM reaches `performance_numbers` — **live-confirmed on device: bench 160→150 and OHP 110→100 both landed through the app** (via the down-write reconciliation prompt). Blocks compound. The dogfood-hardened test path: AMRAP reps field renders (was hidden); a below-stored result **prompts Keep/Update, never silently holds** (supersedes D-223's ratchet-up-only); **RIR is gone from test sets** (the AMRAP protocol is the signal); tests read as **"TEST"** on the calendar and render a **test-result frame** on the Performance screen (no execution score/volume, no timer, no "last:" anchor, no prefill); a 0-rep test is flagged, never narrated as success. **Pull-ups** are a 5th tracked lift (`pullupMaxReps`, rep-based — D-229). **Verification:** on-device dogfood; the write path shares `user_baselines.performance_numbers` with materialize's `mergeAnchor1RmLb` reader. Files: `StrengthLogger.tsx`, `analyze-strength-workout`, `session-detail/build.ts`, `MobileSummary.tsx`, `TrainingBaselines.tsx`.


### Get Strong hybrid add-ons — glute + Hyrox accessory bias, the long-run→station combo, day-agnostic Sat/Sun long-run pick (D-225, 2026-07-02)
Deployed (`generate-strength-plan` + `create-goal-and-materialize-plan`); client (`NonRaceBuilder` add-on toggle / Sat-Sun picker / no-cap mileage copy, `GoalsScreen` CTA order) pushed to web — **on-device only after an Xcode rebuild**. 101/101 composer/guard tests + live sample plans.
- **Accessory bias (`accessoryBias: 'glute' | 'hyrox'`):** +1 qualitative accessory on **Upper A** only, skipped on deload/retest. Guard **protects the PLAIN plan** (byte-identical, no bias) — not the add-on's own days: glute = +1 accessory; hyrox = +1 accessory **plus** the combo.
- **Hyrox combo:** one **long-run → fatigued-legs station** pairing on the long-run day (run unshortened, station appended after, `fatigued_legs`+`bias:hyrox`). Only legal slot — heavy lower fixed Tue/Fri; the long run carries the leg load so the station rides real fatigue. Same-day pairing, NOT a mixed row. Station equipment-substituted (`materialize-plan:substituteExerciseForEquipment`, verified home-gym fallback live).
- **Long-run pick = Option A (Sat/Sun constrained):** composer honors `preferred_days.long_run` limited to Sat/Sun (Sat 4d from Tue squat; Sun 48h before); anything else → Saturday. **No optimizer on the strength-primary path** → a weekday pick would silently break adjacency, hence the constraint. B (composer adjacency) / C (optimizer routing) are the Q-088-lineage upgrades if the fixed grid unfixes.
- **Also:** D-222 mileage hard cap RETIRED (typed miles honored, `volume_state`, honest tradeoff copy); combo titles day-agnostic "Combo 1/2 of 2" (grouped calendar card = Q-104, client bundle); the schedule-step **add-on toggle moved ABOVE the mileage input** (was buried below a numeric input → mobile keyboard/Continue skipped it).
- **Verification:** 101/101 (`strength-primary-plan.test.ts`) + live service-role sample plans (throwaway user, cleaned up). Decisions D-225; science `SCIENCE-glute-accessory-bias.md`, `SCIENCE-hyrox-accessory-bias.md §7`; parked Q-103 (full-Hyrox engine), Q-104 (grouped card).


## Known broken (filed, not blocking)

Behaviors that are demonstrably wrong but intentionally deferred. Don't propose fixes unless you have new information — the deferral was a scoping call, and the list below documents the cost so the next implementer can pick up cleanly.

### Import dates a workout off the PROVIDER's local time, not the USER's — lands on the adjacent day (2026-07-10, Q-154, REAL BUG, not fixed)

A ride that happened on the user's local **7/7** was filed on **7/8**. `ingest-activity` `extractStravaLocalDate` (`:29-46`) + `import-strava-history` (`:585`) date the workout by splitting Strava's **`start_date_local`** — trusting the *provider's* timezone. When Strava's tz for the activity disagrees with the user's (travel / stale tz / near-local-midnight), the day is off by one. Compounded by a silent trap: delete-and-reimport does nothing because the `strava_activity_id` still exists under the wrong date → `import-strava-history:755` skips it with no error ⟨A31⟩ ("N skipped"). **Fix direction:** send the user's device timezone from the client and derive the day from UTC `start_date` in that tz (decide the traveled-activity tradeoff first). Root-caused, verification values not yet captured. Full detail + fix decision in **Q-154**.

### Dead code — retire on next touch (do NOT build on these) — filed 2026-07-04 (D-239 arc)

The threshold_hr / easy-HR thread turned out to be a tower of dead reads + formula fallbacks. RUN durability was moved to decoupling (D-239) instead. These are provably dead on real data; retire when a change next touches the file, don't wire anything new to them:
- ~~**`learned_fitness.running.threshold_hr` nested read-path**~~ — **FIXED (Q-169).** `compute-facts:1129-1132` now calls `resolveRunEasyHrBand(baselines?.learned_fitness, baselines?.performance_numbers?.threshold_heart_rate)` from `_shared/easy-hr.ts`; the dead nested lookup and its epitaph are written up at `compute-facts:1107-1127`. `calculate-workload:255-256` reads the flat `learned.run_threshold_hr.value`. ⟨A31⟩
- ~~**compute-facts easy-HR block → `pace_at_easy_hr`**~~ — **REBUILT (Q-169 / Q-171).** The block is now `compute-facts:1128-1155`: the `×0.78` sample gate is replaced by the shared `resolveRunEasyHrBand` band (`_shared/easy-hr.ts`), and the WHOLE run must pass `runEasyPaceEligible` before a pace is written (plus `pace_at_easy_hr_anchor`/`_confidence` at `:1151-1152`). Whether it now populates on real rows is UNVERIFIED — needs a DB read. ⟨A31⟩
- **`run_easy_pace_at_hr_trend` longitudinal SIGNAL** (`_shared/longitudinal-signals.ts:48-49` + `:141-144`) — **RETIRED in the D-239 reconcile**; the RUN aerobic read lives on `state_trends_v1.run.decoupling`. ⚠ The compute-snapshot AGGREGATE is *not* retired — still computed at `compute-snapshot:232`/`:456` and persisted at `:1129-1130`. Its "fed by a null field" premise is also dead: `pace_at_easy_hr` was un-starved by Q-169. ⟨A31⟩
- ~~**`run_easy_hr` 123 fallback**~~ — **DELETED (Q-169).** `learn-fitness-profile/index.ts:664-673` now sets `easy_hr = null` when fewer than 3 easy runs are observed; the "70% of observed max (estimated)" fabrication is gone and the metric re-learns from an observed median (`:655-662`). ⟨A31⟩
- **daily-ledger `session_rpe` first-preference (`:267`)** — null on all 40; harmlessly falls through to `rpe`. Dead preference, remove.
- ~~**`weekly.ts:594` "Total workload is above planned" (`wv > 120`)**~~ — **RETIRED.** Both the `wv > 120` and the `wv < 70` branches are gone from `weekly.ts`; the string "above planned" no longer exists anywhere in `supabase/` or `src/`. `week_vs_plan_pct` is now emitted at `weekly.ts:324` and read by nothing (its only other occurrence is the type at `response-model/types.ts:124`). The clamp at `adherence-plan.ts:84` `Math.min(1, …)` still stands. See Q-123. ⟨A31⟩
- **`avgReadiness.soreness` snapshot aggregate (`compute-snapshot:227`, persisted via `avgReadinessForWeek` at `:1144`)** — aggregates the post-workout popup soreness but nothing reads it; **now PROVEN dead**: the only consumer of `avg_readiness` anywhere is `recompute-athlete-memory:409-410`, which reads `.energy` only. Readiness surfaces use the separate `readiness_checkins` daily track. Popup soreness is live via Axis-1 only. See Q-124. (Safe to retire.) ⟨A31⟩

### "Spine is truth" is ~6% enforced on the coach; capacity truth is forked (audited 2026-07-02, Q-106)
- **Symptom (as audited 2026-07-02):** the coach engine read the cached spine (`state_trends_v1`) for only `fitness_direction` (1 of ~17 verdict families) and recomputed the rest in parallel — **materially outdated as of 2026-07-31:** the coach now also reads the spine for per-lift strength direction (`coach/index.ts:2288`, D-270), the e1RM verdict (`:3973`), HR response (`:2485`/`:5419`), the fitness roll-up (`:2891`), narrative validation (`:5069`), run-anchor descent (`:5418`) and the entire State display contract (`:5782`) ⟨A31⟩ — even shadowing snapshot columns it fetches (`acwr`, `strength_volume_trend`, `body_response`, `strength_top_lifts`). And there was no canonical capacity truth: `materialize` prescribes load off the typed `performance_numbers` (150) while the coach judged off `learned_fitness.strength_1rms` (125). The athlete-visible face: the State screen's "Bench 125→115 · back off" (baseline-blind — **SINCE FIXED, D-231**), two contradictory strength rows (H3 — resolved cosmetic), FATIGUED triple-echo.
- **Not blocking:** the *voice* contracts (Arc, `session_detail_v1`) read the spine faithfully; endurance micro→macro continuity is finished (the proof the bet works). This is the strength/coach axis of the migration D-151 started and stopped.
- **The fix — PARTIALLY DONE (reconciled 2026-07-04):** **step 1, the canonical capacity resolver, is BUILT + wired + acceptance-passed** (D-231, `_shared/state-trend/capacity-resolver.ts` `resolveStrengthCapacity`) — ⚠ **JUDGE PATH ONLY.** The sole importer is `coach/index.ts` (calls at `:1903`, `:2319`). `materialize-plan` still prescribes off raw typed baselines via `getBaseline1RM` (`src/lib/exercise-config.ts:1530`, called at `materialize-plan/index.ts:163` and `:735`), which has no learned gap-fill — the prescribe side never sees the resolver ⟨A31⟩ → Q-107 **H1 baseline-blindness FIXED** (the "125→115" row now cites the 150 anchor; the residual context-blind *tone* is **Q-111**). **Step 2 (move coach verdicts onto the spine) remains unbuilt, BLOCKED on Q-109**; D-236 has since advanced the **step-6 ACWR-conformance** piece (ACWR single-authority + `buildBodyResponse` reclassified) — ⚠ full satisfaction of Q-109's persisted-`body_response` bar not verified. Roadmap: Q-106 / D-230. State catalog: Q-107. Dead-layer cleanup: Q-108.

### `limiter_sport` intensity-side handling not implemented
- **Symptom:** spec at `docs/SESSION-FREQUENCY-DEFAULTS.md §4` says "Run limiter is handled through intensity, not frequency. Adding run sessions increases injury risk disproportionately. The engine addresses a run limiter by making existing run sessions more productive (longer long run, higher-quality intervals, strides on easy days) rather than adding a 4th session." Implementation today: frequency side is correctly a no-op for run limiter; intensity side has zero implementation. The +7% TSS allocation bump in `science.ts:749 getBaseDistribution()` (the limiter shift itself is `:786-793`) ⟨A31⟩ is a percentage shift across all phases, not a per-session intensity boost.
- **Files (where wiring would land):** `supabase/functions/generate-combined-plan/science.ts` (extend `brickRunTargetMiles()` and `longRunFloorMiles()` to accept `limiterSport` — note: the cycling mirror is `longRideFloorHours`; do not confuse), `session-factory.ts` (interval modulation), `week-builder.ts` (stride logic).
- **Predicted effect:** ~+65-70 TSS/week for run-limiter athlete (long run +15-20%, quality run +1 tempo interval, strides on 1-2 easy runs).
- **Why deferred:** multi-file medium-risk change; needs an architectural decision on whether the +7% TSS allocation stays additive with the new intensity dial or gets replaced by it. Documented in `docs/TICKET-B-WIRING-AUDIT.md` Field 2.

### "Run — Tempo" vs "Run Intervals 4×1000m" label divergence
- **Symptom:** Same workout renders with two different titles across surfaces. **RESOLVED (kept as the was-broken record).** All three surfaces now delegate to one canonical helper, `deriveWorkoutTitle` (`src/lib/derive-workout-title.ts:88`): `AllPlansInterface.tsx:882`, `PlannedWorkoutSummary.tsx:39`, `TodaysEffort.tsx:1556`/`:1794`. Locked by `src/lib/derive-workout-title.test.ts`. The in-code comments state it verbatim: "Closes the ENGINE-STATE Known Broken label-divergence entry." ⟨A31⟩ Compounded by Monday-May-18 swim title case ("Swim — Drills" vs "Race-Specific Aerobic Swim") which suggests the surfaces also read different upstream data shapes.
- **Files:** `src/components/PlannedWorkoutSummary.tsx:34-66`, `src/components/AllPlansInterface.tsx:881-885`, `src/components/TodaysEffort.tsx` (uses `workout.name` directly).
- **Fix shape:** consolidate the title-derivation into a single shared utility — same architectural pattern as the `useStrengthOrderingPreference` consolidation. Solving at the data layer (one canonical session name per workout, derived once at materialize time) is cleaner than patching label-by-label downstream.
- **Why deferred:** predates the universal fixes; cosmetic, not protocol-violating; queued behind higher-signal work.

### Cycling TREND dashed HR line never draws (historical `avg_hr` null)
- **Symptom:** cycling TREND shows the power line + current-ride "· {bpm}" label but no dashed HR line.
- **File:** `analyze-cycling-workout/index.ts:~2261` (today's line; was `~2108`) reads `r.computed.overall.avg_hr` (frequently null); the SELECT — now `:2224`, was `:2077` — omitted the reliable `workouts.avg_heart_rate` column. ⟨A31⟩ → all historical TREND points `avg_hr: null` → `SessionNarrative.tsx` `TrendSparkline` `hasHr (≥3)` gate fails.
- **Fix shape:** add `avg_heart_rate` to the SELECT; resolve `computed.overall.avg_hr ?? workout_analysis.fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate`. Same projection/field-source footgun class as `cead4e9e`/`41d1582d`/`f9efb893`.
- **RESOLVED (2026-05-17, `4177c05c`):** added `avg_heart_rate` to the loop SELECT; `hrH` resolves `computed.overall.avg_hr ?? fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate` (each candidate guarded). Wide backfill verified 26/26 rides-with-a-trend now have ≥3 HR points → dashed line draws. Kept here as the was-broken record (Known-broken doubles as the fix log, per the pwr20 precedent). Q-007 closed.

### Type-filtered `pwr20_trend_v1` won't populate from a single recompute
- **Symptom:** `pwr20_trend_v1` null on a reclassified ride despite `computed.power_curve['20min']` existing.
- **Cause:** the series filters historical rides by their **stored** `classified_type`; post-VI-gate, a single recompute re-derives only the current ride — historical rides keep stale stored types until re-analyzed. Not a code defect.
- **Fix shape:** historical re-analysis backfill across recent rides. See Q-008 / SESSION-CONTEXT open item #2.
- **RESOLVED (2026-05-17):** one-off script, run wide. `scripts/verify-cycling-vi-if-fix.mjs --all` (`fae293e7` + `--all` `83d07fdb`) replays the full recompute chain via service role. Wide run: 180 d / 30 rides, 0 failed, 26/26 cap-present consistent; 16 historical `null → type`; post-backfill every ride in-window has a stored type and recovery/threshold/climbing/endurance/tempo each ≥3 (pwr20-eligible). No longer broken; kept here as the data-caveat record (a fresh single recompute still only re-derives one ride — re-run `--all` after future classifier-input changes). See Q-008.

### #8 race-course segment matching — blocked on GPX dependency
- **Symptom:** no race-course-relevant tagging on segment history.
- **Cause:** needs course-segment geometry from race-course GPX (Data-Dependency ❌); not in the #6 unblock decisions. Forward hook `cycling_segment_history.race_course_relevant` is in place.
- **Why deferred:** documented blocker; product decision owed (GPS-track matcher vs Strava-only). See Q-009 / `docs/CYCLING-ANALYSIS-DESIGN.md`.

---


## Questioned (worth verifying)

Believed-working but never explicitly verified. Listed here so the next session can pick up the verification cheaply, not so anyone re-implements.

_All previously-listed entries verified 2026-05-20 and moved to Solid (Q-003 §6.1 scoping; Q-004 Full IM §3.7). Append here when a future session ends with an unverified claim._

### Axis 1 carryover — a LIVE POSITIVE on Michael's real data has NOT fired yet (2026-07-03)
- **What's verified:** the detector logic (57 fixtures) + the full live pipeline (synthetic-user acceptance run) — see Solid. The wiring is proven.
- **What's unverified:** that it fires *correctly on Michael's real workouts*. Every real recompute so far is **correctly silent** — both declared baselines are empty (0 comparable RPE rides; no soreness history until the new popup accrues ≥5 logs) and no objectively-fatigued session has occurred.
- **How to verify (cheap, but data-gated):** either (a) Michael logs soreness on ~6+ post-completion popups to seed the baseline, then a genuinely-sore-after-lift session should fire *"you reported sore legs…"*; or (b) a genuinely fatigued session (cadence sag / HR-power decoupling) fires the objective path with no declared baseline needed. Then **Michael's eyeball** closes Axis 1. Do NOT assume it's broken if it stays silent — silence on thin data is correct by design.
- **The morning-ride check (2026-07-04):** verifies the *popup* (appears, writes on tap, skips clean) — NOT a carryover fire (baseline too thin on log #1).

### Strength prefill-honoring stack (D-204 extension) — deterministic logic internally verified, ON-DEVICE test PENDING (2026-06-19, `a6b5f60d`)
- **What shipped & is live:** the strength capture → facts → Details → analyzer chain now distinguishes a *performed* set from an *untouched plan prefill*. `isPerformedStrengthSet` (now shared: `_shared/strength/performed-set.ts:47`, imported at `analyze-strength-workout/index.ts:13`, 11 call sites ⟨A31⟩ — was 9 duplicated inline predicates, each counting untouched prefills as done) drops a set that is `completed !== true && prefilled === true`; `updateSet` (`StrengthLogger.tsx:3428`, prefill clear at `:3450`) ⟨A31⟩ clears `prefilled` on any athlete edit/Done (mirrors `from_previous`); `workout-detail` carries `prefilled` through both set-map paths (`:291`, `:1633` — was stripped, "Bug B") ⟨A31⟩; the Details receipts (`StrengthCompletedView.tsx:192/204`) drop untouched-prefill sets + exercises with no performed set. Plus the resume/data-loss hardening (`didComputedPrefillRef` + resume listener no longer minting new set objects) and the delete-restore revert-by-`completed_workout_id` (`e3884ec1`). Deployed `workout-detail` + `analyze-strength-workout`; client at `a6b5f60d`. See DECISIONS-LOG D-204 extension.
- **Verified (internal, 2026-06-21):** build survived a workstation crash (HEAD `a6b5f60d`, tree clean, all 9 predicates collapsed). Deterministic logic tested with verbatim copies of all four pieces (`/tmp/d204-strength-test.mjs`, 16/16 — that scratch file is gone; the durable equivalent is `supabase/functions/_shared/strength/performed-set.test.ts`) ⟨A31⟩: untouched prefills not counted; Done/edited/legacy/timed sets counted; the "8→5 edit clears prefilled → counted as 5" path; skipped exercise vanishes from receipts; `workout-detail` preserves the flag; full-session count = 2 performed / 4 prefills dropped.
- **NOT yet verified (needs device, deferred to 2026-06-22):** (1) **Bug A** — the data-loss lifecycle race only reproduces by backgrounding the iOS app mid-edit; guard code reads sound but is not device-proven. (2) **Reported symptom (Q-076):** Michael reports a skipped exercise still rendering as "done"; screenshot was blank, so screen / build state / whether-freshly-logged are unknown — could be a stale on-device bundle, saved data lacking `prefilled`, or a read surface the filter doesn't cover. Read the DB row to localize (saved-data vs display) before changing code.
- **Verification method when resumed:** log the June-19 session deviating (edit a set, skip an exercise, set RPE), background+return once, finish & save; then read the row — performed sets carry `completed:true`/edited values, skipped stays `prefilled`/uncounted; confirm Details volume + receipts honest and the narrative doesn't fabricate RIR.

---


## When to update this doc

Append to **Solid** when a fix ships and is verified.
Append to **Known broken** when a bug surfaces and is intentionally deferred.
Append to **Questioned** when a session ends with an unverified claim.
Move items between sections as their state changes — promotion (Questioned → Solid) requires a verification method documented inline.
