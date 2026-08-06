# GAME PLAN — finish the fucking thing

**2026-07-13.** Written after a full code audit (4 parallel readers) **and three hours in the live app**, which found three bugs the audit missed. This is the sequence. It is dependency-ordered, not wish-ordered.

**Read `START-HERE.md` → `LIFECYCLE.md` → `CAPABILITY-MAP.md` first. Then this.**

> **2026-08-06 — THE STRENGTH FIX IS BUILT. THE SECOND HARD-SESSION OPTION IS THE OPEN QUESTION.**
> `SPEC-assistance-fix.md` §0–§7 SHIPPED — press days carry a real push, no leg work on upper days,
> legs vary across the two lower days, reps floor 50 / ceiling 75. [D-385]. Q-214 built and two
> solver terms deleted for contradicting Wendler p.11 [D-386]; the 3-day block is genuinely three
> days [D-387]; "Strength Focus" → "Strong Focus" [D-388]; the hill descent ends on the lap button
> [D-390]. Six commits `a0d1baec` → `a5a1f19d`, **pushed + deployed, NOT device-verified** —
> checklist at the top of `POLISH-PUNCH-LIST.md`.
>
> ⛔ **NEXT IS NOT A BUILD, IT IS A DECISION: the second hard-session option ([Q-260]).** The block's
> one hard aerobic session is `4 × 3 min` uphill and needs a climb you can run for three minutes; an
> athlete without one gets a session they cannot run and is never asked. **The doctrine's "10–12 ×
> 40 s" fallback is NOT the answer** — it was built and reverted the same day, because at equal work
> time the long form gives 327.9 s above 90% VO2max against the short form's 201.3 s, 40 s sits in
> the band the meta calls inferior, and the rationale for its short float is struck through as
> retired in our own doc. **Maximize VO2max at the least mechanical cost. Two sources in that
> doctrine are unnamed and load-bearing — find them first.**
>
> ⚠️ **[Q-256] STILL HAS A DATE ON IT** — the 5/3/1 training-max ceiling reads a stale signup 1RM and
> squat/OHP stall after one cycle (~Aug 24). Michael rules on the approach before it is built.

---

> **2026-08-05 — THE FOCUS FRONT DOOR IS BUILT. THE STRENGTH FIX BEHIND IT IS NOT.**
> Goals is now **Focus**, opening to **Train · Race · Build**; Train drills down to Run / Ride /
> Strength / Athletic Focus; Strength opens **Strong / Heavy / Definition**. [D-382] / [D-383] /
> [D-384], 8 commits, **pushed + client-deployed, NOT device-verified** ([Q-258], checklist at the top
> of `POLISH-PUNCH-LIST.md`). Client only — no edge function touched.
>
> ⛔ **STRONG IS A PASS-THROUGH — it is today's block and picking it sends no new field.** Heavy and
> Definition ship DARK because what separates the three is the accessory work that
> `SPEC-assistance-fix.md` §0–§7 is about to rewrite. Shipping them first would be three names for one
> block.
>
> ⛔ **NEXT: `SPEC-assistance-fix.md` §0–§7 — the accessory rework.** Four defects confirmed in code:
> a press day **structurally cannot show a push** (`assistance-menu.ts:224` — all four "push"
> replacements are pulls), legs land on upper days, the same leg pattern repeats, and the rep floor is
> **25 against the book's 50**. ⚠️ **One number is Michael's before §5 is built: the ceiling, 50 or 75.**
>
> Untouched today and still queued: **[Q-256]** the training-max ceiling stall (has a date — ~Aug 24)
> and **[Q-252]** the Sunday blackout.

> **2026-08-03 (night) — STRENGTH IS FUNCTIONALLY DONE. The AMRAP is the measurement, end to end.**
> A full day past the language: swap intensity-tier gate ([D-376]), the 65-exercise catalog + a permanent
> vocabulary GUARD ([D-377], kills "borrow a neighbor" prescriptions by name at build time), Q-254 slice 1
> (State reads the AMRAP all-out set, [D-378]) + slice 2 (the verdict reads the AMRAP not RIR, killing a
> live tappable-weight bug, [D-379]), the timer ([D-380]) and band pricing ([D-381]). All pushed + deployed
> + device-verified where noted.
>
> ⛔ **AND THE PROGRESSION FINALE WAS ALREADY BUILT** (deployed 2026-07-31). Do NOT rebuild it — Wendler's
> +5/+10 is automatic; the AMRAP only withholds it on a miss. See the ENGINE-STATE banner + [Q-223].
>
> ⛔ **NEXT: [Q-256], the ceiling fix** — the TM ceiling reads a stale signup 1RM, stalling squat/OHP after
> one cycle (~Aug 24). Feed it the learned/AMRAP max instead. Michael rules on the approach first. THEN
> **[Q-252]** (the Sunday blackout, still live with a deadline). Small polish: [Q-254] slice 3 (trap-bar),
> the dot/PR hedge, the DB/incline-bench rest call.

> **2026-08-03 — THE STRENGTH LANGUAGE IS SHIPPED. ONE VOCABULARY, ACROSS THE WHOLE APP.**
> **[D-375]** completed `SPEC-strength-language.md`: the 6→8 overlapping classifiers collapsed onto one
> role axis + one type axis (8 types incl. band), read by the card, logger, swapping and load. Built as 7
> ordered steps, PUSHED + DEPLOYED (29 fns) + card VERIFIED on device. The fitness-section name sets are
> **three questions, not one** (coach 16 / tracked-max 4 / dot 5). A band-assist pricing bug (200-vs-700,
> corrupting stored `total_volume_lbs`) fixed; history checked clean. Cap fix restored OHP to the card.
>
> ⛔ **NEXT: [Q-254], THE AMRAP CURRENCY JOB — this is the real strength north star.** Three named pieces
> (Q-254's 2026-08-03 addendum): rebuild the logged-sets rows on AMRAP + learned e1RM (they currently read
> working-weight vs a stale typed baseline), drop RIR for AMRAP, roll trap-bar into the deadlift slot.
> **Plus two fresh acceptance bugs** (ENGINE-STATE Known-broken): the OHP logging gap (Jul 28 e1RM=0) and
> the add-picker catalog gap (band/sled/dead-hang not addable, blocking logger verification). And **[Q-252]
> is STILL LIVE** — the Sunday blackout, untouched this session.

> **2026-08-02 (night, third pass) — STRENGTH SAYS LESS AND MEANS MORE, AND THE REAL WORK IS NAMED.**
> **[D-373]** — coaching language is main-lifts-only. A hard accessory (Hip Thrust, Barbell Row) no
> longer prints a red *"back off weight"*; the gate is `isMain531Lift`, whose unknown-default is
> silence. Deployed, coach **v161**, verified live in the payload. **[D-374]** — "from your logged
> sets" drops accessories entirely: every row there is *"Working ~120 vs your 150 baseline"*, and you
> do not test a max on a hip thrust. Filtered at the display, not the source, because `per_lift` feeds
> the coach's own reasoning.
>
> ⛔ **NEXT IS A PRODUCT CALL, NOT A BUILD — [Q-254], THE AMRAP.** Michael: *"we need to make state
> screen read amrap as the north star for stregnth focus."* The app already writes `amrap_reps` +
> `measured` on every strength exercise (`compute-facts:1442`) and then reasons from something else at
> three layers: the State e1RM is built from `bestWeight`/`bestReps` (an aggregate — and
> `cycle-verdicts.ts` already documents why that is wrong), the per-lift verdict reads RIR (how it
> FELT), and [Q-223] means the AMRAP advance only fires on a rebuild. **Decide rep-record vs e1RM
> first; everything else follows.**
>
> ⚠️ **[Q-252] HAS A DEADLINE — it recurs this Sunday at 17:00 Pacific.** The State performance section
> blanks because `compute-snapshot:670` gates the trend build on a UTC week. Restored by hand tonight;
> that is a patch. **Do not open by shifting the timezone** — Michael: *"this section is rolling too"*.
>
> Also filed: **[Q-251]** (planned load counts three-fifths of a strength session as zero) and
> **[Q-253]** (accessories now have no home on State — a gap, not a resolution).

> **2026-08-02 (night, second session) — THE LLM MACHINERY IS OUT OF THE TREE, NOT JUST BYPASSED.**
> [D-372] deleted the three dead prompt builders (3,532 lines) — `prompt-builders.ts` (852, zero
> references repo-wide), `_shared/fact-packet/ai-summary.ts` (1,261) and
> `_shared/cycling-v1/ai-summary.ts` (644) — plus the tests that guarded wording no screen renders.
> Pushed `4424d459`, both analyzers deployed, and **verified by DB write-timestamp, not by screenshot**:
> run and ride paragraphs came back byte-identical from a live recompute. The three copy items from
> the earlier session are **confirmed on screen** and closed in `POLISH-PUNCH-LIST.md`.
>
> ⛔ **NEXT: THE SWIM + STRENGTH AUDIT** (`WORKORDER-session-screen-continuity-2026-08-02.md` Part 3) —
> smaller than it was, since strength got a real pass and the LLM sweep is off the board. **[Q-246] is
> half-closed**: its tidy half survives and must NOT be swept (`plannedWorkout` is live; each dead ride
> row's reasoning must land in a `D-NNN` first). **[Q-250]** is new and is a design call, not cleanup:
> the pool-intensity signal is still computed and now has no reader at all.
>
> ⛔ **[Q-249] STILL PARKED AND STILL NOT A FREE PICK** — and it is now visible in one glance on Tue
> Jul 28 (`Band Face Pulls → Chin Up` above a sentence saying "the Face Pull slot"). One of its three
> fixes widens `canonicalize` and would silently re-group the athlete's lifting history. **Wait for him.**

> **2026-08-02 (night) — STRENGTH IS A LEDGER NOW, AND THE SESSION SCREENS HAVE NO LLM LEFT.**
> The assistance prescription is printed (`Planned 25 total · by feel`), an undeclared swap into an
> assistance slot is credited and flagged by movement pattern, `vs plan` tonnage is gone, and the
> **strength narrative LLM is deleted** — 845 lines, plus two DB round-trips per analysis ([D-370],
> [D-371]). Run and ride were already deterministic; swim's LLM is behind an off env flag. **The coach
> and the race-readiness line are the last two live output-LLMs, and both STAY** (Michael: *"we may
> keep it in race builder so dont get rid of all of it"*).
>
> ⛔ **NEXT: AN AUDIT, NOT A FIX.** Michael: *"maybe a new chat audits everything and then tackles
> this."* Read the code before opening the queue. The queue, in confidence order, is in the
> ENGINE-STATE banner: three verifiably-dead LLM files → [Q-246]'s non-LLM dead code → the swim +
> strength audit.
>
> ⛔ **[Q-249] IS PARKED AND IS NOT A FREE PICK.** One exercise carries two names across two sources;
> one of the three fixes widens `canonicalize` and would silently re-group the athlete's lifting
> history. Michael called it *"a huge fix on the docket"*. A surface patch is live. **Wait for him.**

> **2026-08-02 (evening) — THE SESSION SCREEN IS DONE, AND DEVICE-VERIFIED ON BOTH ENDURANCE SPORTS.**
> Run and ride answer the same questions with the same words. The Performance row is **three numbers,
> no blends** — `Workload · Duration · Easy/Power` — and every one answers a distinct question
> ([D-364] … [D-369]). Execution and TSS are gone; both were second answers to questions already asked.
>
> ⛔ **NEXT: SWIM AND STRENGTH.** They have still never been audited for the four shared questions that
> split run and ride apart. That was the first task in the morning's work order and it is the only part
> of it left. **Audit before rows** — `docs/WORKORDER-session-screen-continuity-2026-08-02.md`.
>
> ⛔ **AND ONE LIVE BUG, CHEAP: [Q-245].** State's run and bike trends cannot see a deload week, so a
> deliberately light week can read as "sliding". Strength was fixed by D-338; those two were never
> wired.

> **2026-08-02 (morning) — SUPERSEDED BY THE ENTRY ABOVE. The session screen, both sports at once.**
> A night of reading the live screen turned up one disease in four forms: each sport had grown its own
> private answer to a question both were asking. Attach, execution scoring, screen density and trend
> eligibility all fixed for bike ([D-361], [D-362], [D-363]) — **and swim and strength were never
> checked for the same thing.**
>
> ⛔ **NEXT: `docs/WORKORDER-session-screen-continuity-2026-08-02.md`.** One session, both sports, audit
> before rows. Michael's framing: *"a wide continuity."*

> **2026-08-01 (late) — THE BIKE ROW IS FINISHED, AND THE NEXT JOB IS UPSTREAM OF THE SCREEN.**
> Gate + floor + three reads ([D-359]) and the FTP choice ([D-360], closes Q-240) all shipped and
> deployed. The bike row now refuses to assert a direction it cannot support, and names WHY when it
> cannot — the pattern to carry to swim and strength, once Michael rules on it.
>
> ⛔ **NEXT IS THE ATTACH FAILURE, not another row.** Tonight's ride did not attach to the planned Long
> Ride, so it has no planned-vs-executed and drops out of adherence. A screen that reads a broken loop
> honestly is still reading a broken loop. See the ENGINE-STATE banner for the entry points.

> **2026-08-01 — THE STATE-SCREEN PASS IS DONE, AND THE TRACK MOVED UPSTREAM INTO THE LOGGER.**
> `AUDIT-state-screen-2026-08-01.md` Stages 0–3 and 5 shipped (D-347 … D-350): the screens read one
> number and stopped disagreeing. Stage 2's own instructions turned out to be wrong on all three
> targets and the doc is rewritten — **read its Stage 2 before trusting any "delete the client math"
> line anywhere else.**
>
> The remaining faults were all UPSTREAM, in what the logger records — so that is where the day
> ended (D-351 / D-352): bands carry a user-entered number, typed-but-unticked reps stop vanishing,
> and the bar-speed cues render for the first time since they were written on 2026-07-25.
>
> ⛔ **NEXT IS `verdictFrom95Set`.** It is WIRED, not starved: `verdictFrom95Set` (`wendler-531.ts:454`) is called at `loading/cycle-verdicts.ts:116` → `workingNumberForCycles` (`wendler-531.ts:519`) → `strength-primary-plan.ts:1275` / `rematerialize-strength-block/index.ts:167`, which the client invokes at `StrengthLogger.tsx:4022` and `:6053`. What is left is DEVICE VERIFICATION, not wiring. ⟨A31⟩ Two pieces of copy
> (`STRENGTH_ADVANCE_COPY`, the `validity_set` cue) are written and **gated off** waiting for it —
> both call sites say exactly where to pass the flag. Until it lands the block's advance rule is a
> calendar, not a measurement.

> **2026-07-25/26 status — THE PLAN BUILDER IS THE ACTIVE TRACK, and it moved off the State screen.**
> The roadmap order was State → **plan builder** → intro flow → freeballer. The State screen work paused
> at "Adjust tab next"; **the plan builder is now what's being built**, because Strength Focus V1 shipped
> (D-324) and the front door is the thing an athlete meets first.
>
> **2026-07-25 (late) — SPEC-HEAVY SESSION, CLIENT WORK UNCOMMITTED.** Intake rebuilt one screen per
> discipline; hard conditioning days collected per discipline; bar-speed doctrine + the per-set difficulty
> tap (D-326 layer 1) built in the logger. **Nothing pushed, nothing deployed, no plan built end to end.**
> Two large specs written and NOT built: **D-325** (session cost ledger + penalty scheduler — this also
> resolves the three-placement-authorities problem) and **D-326** (the strength gauge is near-blind for 8
> of 12 weeks ONLY for the 'unknown'/'detrained' continuity tiers — `leaderCount` (`wendler-531.ts:291`) returns 0 leaders on tier 'continuous', so every cycle is an anchor and AMRAPs land in 9 of 12; three failures, three fixes, layers 1 AND 2 built). ⟨A31⟩
>
> ⛔ **AND THE ARCHITECTURE FRAME CHANGED — `ARCH-strength-spine.md` §0.** The barbell block is the BODY
> and a goal is a TUNING of it; the four plan generators are cover versions of one original
> (`generate-combined-plan/session-factory.ts`). Read §0 before any structural call.
>
> **NEXT (Michael, at close): finish the flow, lock in quality options, wire the bike** — then build ONE
> plan end to end. See the ENGINE-STATE banner.
>
> **2026-07-29 — THE FLOW IS BUILT AND THE BAR MOVED. The rematerializer is OFF.**
> The scheduler is one screen (D-330), the week draws live under the controls, and the confirm step
> shows the week rather than a card restating the athlete's answers. Michael's bar for what comes next
> is no longer "does it run":
>
> > *"i would rather get all the juggle math figured out and dieals all the acceroy dialed and make
> > sure this plan is 100% sound for 4 out of 5 hybrid coaches."*
>
> ⛔ **The rematerializer and the 1RM-learning ticket are DEFERRED, not dropped.** The previous banner
> named them as the job; they are behind getting the block itself defensible.
>
> **The single biggest unlock left: lifting days is a HARD CONSTANT of 4.** It blocks Wendler's 3-day
> and 2-day templates, the 10-day rolling week, and the "3 lifting days" trade-off. Michael has raised
> 5-vs-4 twice without it being actionable.
>
> Earlier State work stands and is not being re-litigated: load/strain multi-sport (D-317/D-318,
> device-verified), the "adapt a plan" strength track (D-315), the State-as-hub three-tab design (D-316,
> **Adjust tab still unbuilt**), RUN row + charts (D-307 → D-314). Open chart threads: Q-200, tap-to-expand,
> PMC-parity. The phase list below (the 2026-07-13 continuity plan) is still valid but is not what's
> currently being worked.

---

## Why the app is like this (say it once, then stop re-litigating it)

**A year of different LLM builders, each with no context, while the models caught up.** Every one of them was competent. None of them could see what already existed. So they rebuilt it.

That is the whole diagnosis, and it produces exactly three diseases:

- **STARVED** — built, tested, never fires. An input is null. *Plumbing, not building.*
- **DEAD** — computed, shipped, read by nobody.
- **DOUBLED** — two engines, one fact. **It doesn't fail. It disagrees, quietly, and both answers look confident.**

> **Every fracture in this app began life as a copy that was correct on the day it was made.**

**Nothing below is a new feature. Every item is a deletion, a rename, or an introduction between two things that already exist.**

---

## PHASE 1 — STOP THE LIES ✅ **DONE 2026-07-14 — deployed, not yet human-verified**

*The app is actively telling its only user false things. Nothing else matters until it stops.*

> **Closed 2026-07-14.** Three of the four shipped and are live. **Q-164 was deliberately left** — it is a dead row, not a lie, and it belongs with the other DEAD findings in Phase 4.
>
> **A whole phase's worth of strength work rode along that was NOT on this plan** — it came from Michael opening the logger, and it is the argument for doing that more often. **Q-180**: the logger could not record a Farmers Carry at all (no weight box, duration never persisted, RIR prompted on timed work, `'40 m'` read as 40 *seconds*). **D-289/D-290**: a **SWAP IS NOT A SKIP** — the SLOT is the unit of strength adherence, not the exercise name. **Q-TIMER**: the rest timer lost the time you were away, then cancelled the notification that would have told you.
>
> ⚠️ **The four-agent code audit that produced THIS PLAN found none of those three.** They were found by using the app. **A code trace is right about what EXISTS and blind to what is BITING.**

- [x] **Q-178 — a skipped exercise counts as PERFORMED.** `analyze-strength-workout:89` (as of 2026-07-13; the predicate now lives in `_shared/strength/performed-set.ts`) — `completed === true` short-circuited ⟨A31⟩, so a `0 reps / 0 weight / 0 duration` set reads as done. **Live repro: he did ZERO Farmers Carries and the app said `98% · Strong — "sets landed on target across all three lifts"`.**
  **Fix:** a set with `reps === 0 && !weight && !duration` is not performed, whatever the flag says. Upstream: the logger must not write an RIR onto a zero-rep set. ⚠️ Read D-204 — change the *predicate*, not the 6 call sites.
  ⛔ **This is the one that matters most, and not for the score.** The fact packet said the exercise was performed → the LLM faithfully repeated it. **`narrative-core/validate.ts` validates prose against the FACTS, so it cannot catch a lie already IN the facts.** The containment is sound and **only as honest as the packet**. Corrupt the packet and the guard becomes a laundering step.
- [x] **Q-177 — the Monday alarm.** `compute-snapshot:445` compares a **partial-week cumulative SUM** against **complete prior weeks** → ≈ −75% on a Monday → fires `concern` severity every Monday and Tuesday, forever. It measures *what day you looked*. **Fix: delete the signal.** The spine's 6-week per-workout volume trend already exists, is immune, and said `steady`. **Do not widen the threshold — that hides a structural artifact behind a magic number.**
- [ ] **Q-164 — the dead "Aerobic fitness" BODY row.** *(⏭️ DEFERRED to Phase 4 — it is DEAD, not LYING. A row that never renders tells no one anything false.)* `coach:2131` `cardiac_efficiency_current: null, sample_size: 0` → the render gate can never be true. **Feed it or delete it.**
- [x] **The 5 red tests** (`_shared/cycling-v1/*`) assert an NP-trend fallback that `cb4eb1d5` deliberately deleted. **Green must mean green.**

### REOPENED 2026-07-20 — the Monday alarm survived, in the GRAPHICS. See `AUDIT-state-screen-2026-07-20.md`.

> **Q-177 was killed in the signal layer and left standing in the picture.** The guard was written for the sentence and never applied to the bar. **Twice.** Both are live on a real screen (device shots, 2026-07-20 09:21).

- [ ] **The planned-vs-actual bar compares a 7-day plan to a 0-day result** (F21). `coach/index.ts:5357` counts the WHOLE week as `planned`; `done` is bounded to `[weekStart, asOfDate]` (`:5352-5354`) ⟨A31⟩. ✅ PARTIAL-WEEK GUARD SHIPPED — `StateTab.tsx:176` `WeekMixBar({ counts, hasPlan, partialWeek })`; the result bar is labelled "so far" on an open week (`:192`), with `partialWeek` computed at `:1697` and passed at `:1704`. **Remaining:** the bar still renders NO NUMBERS (`:209-215` is a colour legend only). ⟨A31⟩
- [x] **A no-plan athlete gets an empty bar labelled "planned", forever** (F26). ✅ **FIXED** — `StateTab.tsx:186` `showPlanned = hasPlan && totalPlanned > 0` gates the planned bar; `:1692`/`:1699` supply `hasPlan` and drop the "planned vs actual" section label. *(was:* ⟨A31⟩ `coach/index.ts:5359` keeps a discipline when `planned > 0 || done > 0` ⟨A31⟩; `StateTab.tsx:1636` gates only on `counts.length === 0 && !accent` — **no `hasPlan` check**. Positioning is explicit that plan-absence is never a deficit, and the PROSE honours it (the composer's no-plan branch). The picture does not.
- [x] **The upkeep sentence measures the bad news over 4 weeks and the good news over 0 days** (F15). ✅ **FIXED** (payload v123) — `coach/index.ts:5457` `resolveAerobicCarriers(disc, completedRolling)` reads the SAME 28-day trailing window as the shortfall. *(was:* ⟨A31⟩ `coach/index.ts:5300-5337`: shortfall from a 28-day trailing window, but `carriers` is built from **this week's** `counts`. On a Monday the credit clause silently drops. **This is the flagship sentence of `PRODUCT-POSITIONING-v2-DRAFT.md` §4** — "your aerobic engine is holding, that's the riding and swimming" — and the window bug deletes the permission half, leaving only the warning. **Highest-value single fix on the screen.**
- [ ] **VERIFY: a dormant load gate woke up via an unrelated fix, and its own doc still says it's inert** (F25). `_shared/load-status-reconcile.ts` header still reads *"Gate 2 is inert until phase labeling is populated upstream"*. **That is no longer true** — `compute-snapshot/index.ts:581` now populates `plan_phase` from the single resolver (D-261/Q-138, "was a dead null stub"), the coach resolves `weekIntent` off the same resolver (`coach/index.ts:1045`), and `plan-phase.ts:141-143` confirms `build`/`baseline` are reachable. **So Gate 2 now fires**, softening an uncorroborated 'high'/'elevated' in a build week — i.e. it changes whether the athlete is told to pull back. **Nobody re-verified it when it woke up, and no doc in either subsystem records the crossing.** This is the "every fix opens a hole" pattern caught in the act. **Not a fix — a verification, then correct the stale header.**
- [x] **"Handling combined load well" over-claims what it checked** (F17). ✅ **FIXED** (payload v124) — `coach/index.ts:5769` now says "No interference between disciplines", scoped to the five signals it actually inspects. *(was:* ⟨A31⟩ `coach/index.ts:5566` fires on five STRESS signals being absent; it never looks at volume, adherence or upkeep. Renders in green two inches above the upkeep shortfall. **Same class as the composer all-clear fixed 2026-07-19 — scope the claim to what was examined.**

---

## PHASE 2 — FIX THE FAN-OUT (this is "the analysis problem")

*Everything downstream is only as good as this. It is the root of the analysis complaints.*

> **✅ SHIPPED 2026-07-18 (D-298) — a–d UNVERIFIED.** `recompute-workout` is now the one ordered orchestrator; every entry path (incl. both orphans) fires it; the snapshot version guard (migration `20260717…`, applied) refuses stale overwrites and was **verified live**. All three items below are addressed by the orchestrator. **What's left is VERIFICATION on a real sync**, not more building — see `AUDIT-fanout-ordering-2026-07-17.md` §4 (a–d) and the top-of-ENGINE-STATE banner. The stale "16-day durability" symptom (item 4) was a SEPARATE cause (D-291, the `basis='raw'` collision) already fixed — Phase 2 is the ordering, and it shipped.

- [x] **The fan-out awaits the wrong things.** ✅ D-298 — the orchestrator serializes to data dependencies.
  1. `compute-facts` is **awaited** (`ingest-activity:1582`) but reads `workouts.computed`, written by two **fire-and-forget** calls (`:1508`, `:1521`). When it loses the race: **no time-in-zone, no interval hits, no HR drift, no execution score. No error anywhere.**
  2. `compute-snapshot` (fired *from* `compute-facts:1844`) reads `workouts.workout_analysis` (`:689`) — written by `analyze-{sport}`, which is fired **after**, fire-and-forget (`ingest-activity:1624`). **So the run durability trend is ALWAYS AT LEAST ONE WORKOUT BEHIND, by construction.**
  **Fix: order the fan-out to match its data dependencies.** Await what you read.
- [x] **Two ingest paths never reach the spine.** ✅ **FIXED (D-298)** — both now fire the orchestrator: `ingest-phone-workout/index.ts:297` and `save-imported-workout/index.ts:206` call `recompute-workout`, whose ordered chain runs `compute-facts` (`recompute-workout/index.ts:154`). ⟨A31⟩
- [x] **`workouts.workload_actual` is starved.** ✅ **RESOLVED BY D-298** — `calculate-workload` is now step 3a of the one orchestrator (`recompute-workout/index.ts:138-142`), and every entry path fires that orchestrator, so no ingest route can skip the ACWR substrate. ⟨A31⟩
- [x] ⚠️ **The 16-day-stale run durability read — EXPLAINED AND FIXED.** Separate cause: [D-291] (the `basis='raw'` collision), SHIPPED + DEPLOYED + VERIFIED IN DB 2026-07-14. Not a fan-out symptom. ⟨A31⟩

---

## PHASE 3 — MAKE THE VERDICT ENGINE POSTURE-AWARE (this is "the continuity problem")

*And this is also the product. They turned out to be the same thing.*

> **✅ TIER 1 SHIPPED 2026-07-14 (D-292).** `per_discipline_posture` is now read at runtime; a `maintain` discipline's decline is framed as a declared TRADE, not "aerobic base needs work". Deployed + pushed + verified in DB. The posture flag (`SPEC-posture-flag.md` Tier 1) is live.
> **✅ STATE v3 FITNESS BAND SHIPPED + ACCEPTED ON DEVICE 2026-07-17 (D-293/294/295).** The fitness band's dot + arrow, three anchoring modes, auto-derived ROLLING anchors, the `withheld` volume gate, the descent accent, and the swim facts-only ruling all landed. `SPEC-state-fitness-band.md` now holds only the PARKED remainder (change-affordance UI, prognosis ghost dot/lever).
> **What remains of Phase 3:** Tier 2 (consequence prose) — blocked on `PRODUCT-POSITIONING-v2-DRAFT.md` + `SCIENCE-run-specificity.md` — and the prognosis expand (ghost dot + "lever") from the SPEC's parked remainder.
>
> ⚠️ **Note for whoever picks up Phase 2:** the "run durability is one workout behind / 16 days stale" symptom that motivated Phase 2 was TWO bugs. The 16-day freeze was a SEPARATE cause (D-291, the `basis='raw'` collision) and is FIXED. The structural one-workout-behind fan-out race is still real and still unfixed — Phase 2 stands.

- [x] **Q-179 — the verdict engine is POSTURE-BLIND.** ✅ D-292.
  ```
  per_discipline_posture  in  _shared/state-trend/   -> 0 occurrences
  per_discipline_posture  in  coach/index.ts         -> 0 occurrences
  ```
  The athlete's declared intent is read **once, at plan build**, and thrown away. So the plan copy says *"maintenance only (held so strength leads)"* while State says *"aerobic base needs work"* — **about the same discipline, in the same week, on the same athlete.** Three surfaces, three opinions.
  **Fix: thread posture into the spine and the coach.** A `maintain` discipline must not be graded as a `develop` one.
- [ ] **THEN the posture flag** (`SPEC-posture-flag.md`).
  ⛔ **IT IS NOT A BANNER AND IT IS NOT A NEW FEATURE. It is the surface of the item above.** The banner is the last 5%.
  ⛔ **DO NOT SHIP IT FIRST.** A posture-aware banner sitting on top of a posture-blind verdict is not continuity — **it is a third opinion.**
  **Blocked on:** `PRODUCT-POSITIONING-v2-DRAFT.md` (approve or shred — the voice comes from it) and `SCIENCE-run-specificity.md` (owed before Tier-2 prose: the app's only maintenance theory is **discipline-blind** — true of the engine, false of the legs).

> ### THIS BLOCK NOW GATES MORE THAN IT DID (2026-07-20)
> The v2 draft has sat unapproved since 2026-07-13. Its §4 worked example is **the sentence State already tries to say**:
> *"You're 11 miles under your run target. Your aerobic engine is holding — that's the riding and swimming. But running is specific: if you want to keep the running, you have to run it."*
> The live screen (device, 2026-07-20) renders: *"Running's at about 6 of your 18-mile upkeep — 4 weeks now."* — the number, with the permission half deleted by the window bug in Phase 1's reopened list (F15).
> **So the highest-value fix on State is the execution of a positioning that is still marked DRAFT.** Approve or shred it; the fix's wording depends on which.

---

## THE METHOD NOTE, EARNED TWICE (2026-07-20)

**It happened again.** A full code trace of State produced 29 findings with file:line — real ones. But the two biggest only became clear from **two screenshots**: the empty "actual" bar under a 288-point load bar, and the upkeep sentence rendering as a scold. Both had been read in code and neither was understood until they were seen on a phone, next to what sits above and below them.

**The contradictions on this screen are ASSEMBLY bugs.** Every unit fixture passes. The 29 test files under ⟨A31⟩ `_shared/state-trend/` and `_shared/insights/` are good and they all go green — because each piece is right in isolation. **Nothing anywhere renders the assembled screen for a synthetic athlete**, and that is precisely where every one of these lives.

**Why nothing can:** the logic that decides what the cards SAY together is written inline, in anonymous IIFEs, inside `coach/index.ts` — **~6,000 lines** ⟨A31⟩. No test can reach it. `load-status-reconcile.ts` was extracted from that same file for exactly this reason (D-259: *"a private ~200-line function buried in the ~5k-line coach edge file [that] could not be unit-run"*). **That extraction is the precedent. Do it again for the week-level composition, then build one harness that prints the whole screen as text for ~25 synthetic athletes** — sports, goal types, plan/no-plan, Monday/midweek/Sunday, thin/rich/stale/returning, develop/maintain/dropped. Read it like a page. The contradictions sit next to each other there the way they do on the phone.

---

## PHASE 4 — ONE SOURCE PER FACT (kill the DOUBLED disease)

- [x] **One LTHR — ✅ SHIPPED 2026-07-18 (D-296).** `resolveCurrentLthr` built; all 4 anchor sites routed (easy-hr / zone-bins / coach / workload); FIT-import 0.90 seam + the run analyzer's non-Friel fallback both → canonical. `SPEC-lthr-one-anchor.md` folded to D-296 and deleted. Byte-identical for the primary user. **`threshold_pace` ✅ SHIPPED 2026-07-18 (D-300)** — `resolveCurrentRunThresholdPace`; coach + race-projections + snapshot spine routed, 3 units unified. **Max-HR resolver ✅ SHIPPED 2026-07-18 (D-299)** — `resolve-current-max-hr.ts`, one divisor + Tanaka/Gulati. Both HR-congruence tail items (#5, #6) now closed.
- [x] **One ACWR band — ✅ SHIPPED 2026-07-18 (D-301).** Traced: only **1** of the "6" was LIVE (`CoachWeekTab.SnapshotLoadBar`, re-deriving a plan-blind `back off`/`rest now` off the raw ratio); the LoadBar was already single-sourced to the reconciled verdict; the other 4 band fns were DEAD (`TrainingStateBar`, `getACWRStatus`+config, `acwrZone`, `acwrVolumeLabel`) — all deleted. CoachWeekTab now reads the reconciled two-key verdict (`statusVolumeLabel`), phase-aware + body-corroborated, no raw-ratio prescription (D-281/Q-137). Matches Garmin/TrainingPeaks (verdict leads, ACWR a bare reference).
- [~] **One zone table.** D-286 fixed three copies; **D-296 (2026-07-18) fixed two more** — the FIT-import 0.90 seam (`save-imported-workout`) and the non-Friel fallback in `analyze-running-workout:1030/:1934`, both → canonical `friel-zones.ts`. **Remaining:** delete the dead `_shared/endurance/hr-zones.ts` 0.90 copy — DEFERRED (`generate-run-plan/generators/sustainable.ts` still refs its symbols; check live/dead first).
- [x] **`adapt-plan`: ONE writer, and the athlete gets the choice.** ✅ **DONE 2026-07-23 (D-315).** The silent auto-progression/deload writes were DELETED (not "default-on-overridable" — Michael's ruling went further: *"we shouldn't auto change weights, the user needs to know"*). Weights now change only on the athlete's tap (State adjust modal / accept / swap / add), extending D-285's endurance rule to strength. The `suggest` signal is now phase-aware (matches the stamped target).
- [~] **FTP: route the stragglers.** The two named ones SHIPPED: `get-week/index.ts:439` and `_shared/athlete-snapshot/identity.ts:70` both call `resolveCurrentFtp`. **Re-count what remains before working this item — the "8" is a 2026-07-13 number.** ⟨A31⟩

### ADDED 2026-07-31 — the RUN row was the DOUBLED disease in its purest form. See [D-346].

> Not two engines narrating one week — **one row whose verdict, chart, pace line, three labels and the
> BODY row above it each read a DIFFERENT pool**, and five docs saying the area was clean. Fifteen
> decision entries had accumulated on it.

- [x] **The run verdict, chart and receipts all read ONE pool.** ✅ **SHIPPED + DEPLOYED 2026-07-31
      ([D-346]).** Speed-at-heart-rate over every run, grade-adjusted, heat coefficient fitted per
      athlete and removed. The BODY heart-rate row reads the same number in the same words. ⛔ The
      lesson: **after moving a data source, sweep the surface once** — three stale labels shipped and
      were each caught by Michael on a screenshot.
- [x] **Five docs corrected**, each carrying what it used to claim. `TRUTH-MAP` called this row *"the
      model the others should copy"* while its gate excluded nothing.
- [ ] **Durability still reads the broken gate** — silenced, not fixed. **[Q-232]**: the obvious fix
      fails a pinned regression, and [D-034] vs `state-trend/run.ts` disagree. A decision, not a patch.

### ADDED 2026-07-20 — the DOUBLED disease on STATE. See `AUDIT-state-screen-2026-07-20.md`.

> Phase 4 killed six duplicate ACWR bands and five zone tables — **numbers**. This is the same job on **prose and pictures**, and nobody has done it.

- [ ] **FOUR engines narrate the same week** (F9). `intent_summary` (coach) · `buildLoadHeadline` (**client**, `src/lib/load-headline.ts`) · `coach.narrative` (the composer) · `week_execution_v1.accent` (week-accent). *(The fifth, `overall_training_read.summary`, was deleted 2026-07-24 — D-319, `response-model/weekly.ts:787`.)* ⟨A31⟩ Different substrates, no engine can see what the other four said. The composer's clause-suppression only guards against itself. **Decide which one speaks; the rest derive from it or die.** ⚠️ Michael's call — this is what the top of the screen SAYS.
- [x] **The imperative string tree survived the LLM teardown** (F8). ✅ **DELETED 2026-07-24 (D-319).** `computeOverallTrainingRead` (`response-model/weekly.ts`) rendered only as a no-signals BODY fallback on State and duplicated the load bar. Client render + function + emission removed; `overall_training_read` type nullable; BODY reads "not enough data" when no signals. *(was: ~25 branches emitting "Sharpen, don't strain", "Recovery week — easy movement only", "Add a goal to direct training" — the D-155-banned register that survived because it isn't the LLM.)*
- [ ] **TWO stacked mix bars, same visual language** (F22). `LoadBar` = load points, rolling 7d, % shares. `WeekMixBar` = session counts, calendar week-to-date, raw counts. Same bar shape, same `getDisciplineColor`, inches apart, distinguished by two grey captions. **The doubling disease drawn literally.**
- [ ] **Two engines answer "how is it going"** (F7). `adaptation_score` (block-adaptation, focus-weighted 4-week blend) vs the composer's per-discipline ACWR floor (`coach-week-insights.ts:~231`). The coach computes the score every run and **discards it** (`coach/index.ts:2605`) ⟨A31⟩, keeping three raw percentages. ⚠️ **Recommend ABANDON, not fix** — see Phase 6 note on its substrate.
- [ ] **The load headline is composed on the CLIENT** (F3). `src/lib/load-headline.ts` via `StateTab.tsx:1249`. It reads reconciled verdicts rather than re-deriving (so it is formatting, not deciding) — but it is the one week-level verdict not owned by the server. Constitution Law 4.

---

## PHASE 5 — THE ONBOARDING GATE (before user #2 exists)

> **Every LATENT fracture in Phase 4 fires on exactly one person: the first new user.** They are not separate work — **they are the onboarding blast radius.**

- [ ] **⛔ MAKE THE APP REFUSE INSTEAD OF INVENT. This gates the flow.**
  Today, give the app nothing and it **invents, silently**: squat/bench/deadlift **135 lb**, OHP **95 lb** (`materialize-plan:3200-3215`), swim **1:30/100** (`:2834`) ⟨A31⟩, and HR zones that fall through to the non-Friel model. **Console log only. The athlete is never told.**
  **The honest pattern already ships:** *"Run durations estimated at 10:00/mi until we learn your easy pace."* **Copy it. It is the only disclosed fallback in the app.**
  **Frictionless + inventing = confidently wrong.** That is Law 2, and it is the whole product claim.
- [ ] **The onboarding flow.** ⚠️ **Mostly BUILT — this is wiring.** `OnboardingProfilePage` collects **identity only** and never asks for one performance number. The numbers live on `TrainingBaselines`, and **nothing walks a new user there.**
  **And both halves of what Michael wants are already shipped and working** *(verified live)*: the app learns from training (*"11:09/mi — pace at easy HR (5 runs; Friel Z2 ≤89% of your threshold HR)"*), and the athlete can choose (`Use my runs` / `Use my number`). **Reuse the mechanism. Do not design a second one.**
  *(Also: the strength baseline TEST week exists — but only fires when **both** bench AND squat are missing.)*

---

## PHASE 6 — PLUG IN THE THREE FINISHED ENGINES (free wins, do them whenever)

*Fully built. Fully tested. Spec'd. **Never executed once.** Each is a plumbing job.*

- [ ] **Consolidated strength mode** — *"put my lifting on the same day as a hard leg session, so my other days stay free."* Rule set ships, fixtures pass, server threads the field. **No wizard writes `integration_mode`** → hardcoded `'separated'` for everyone. **Job: one wizard question + the payload leg.**
- [ ] **The day-count gate** — *stops the wizard silently accepting an impossible week.* 260 lines, 30+ tests, own spec, **ZERO importers**. **Job: mount it + write the warn/block copy.** ⚠️ **Ships AFTER consolidated mode** — its matrix keys on `integration_mode`.
- [ ] **The segment engine** — *"am I getting faster on this stretch?"* Three stages, spine-wired. **`detect-cores` has zero callers** → `route_cores` always empty → the whole feature produces nothing, on web and iOS. **Job: invoke stage 1.** *(A `npm run ios` rebuild will NOT surface the card — it is starved at the source.)*

### ADDED 2026-07-20 — STARVED and STRANDED on State. See `AUDIT-state-screen-2026-07-20.md`.

- [ ] **Swim HR is resolved and then thrown away** (Michael's ask, 2026-07-20). `_shared/swim/swim-scalars.ts:40` exposes `avgHr`. `compute-facts/index.ts:1207` `buildSwimFacts` **calls `resolveSwimScalars`** (for `rest_fraction`) and never records the HR. So swim has no HR-based read for the same reason run durability had none: **the number exists, is computed, and is discarded one line before it would be saved.** Plumbing, not building. *(Swim is currently volume-only BY DESIGN — D-295 / Q-038. This does not overturn that ruling; it makes the ruling reconsiderable, because an HR-at-pace read is not corrupted by fins the way raw pace is.)*
- [ ] **The readiness label machine is fully built and effectively never renders** (F23). Server: `coach/index.ts:5586` — OVERREACHED / LEGS LOADED / LEGS SORE / EFFORT UP / FATIGUED / LOW FATIGUE / ABSORBING / TAPER / RECOVERY / LOW vs BASELINE, plus D-232's loaded-legs detection and novel-movement naming, refined across **five payload version bumps** (v49, v52, v53, v56, v58). Client: `StateTab.tsx:1232` reads it and passes it to ONE place — `buildLoadHeadline` — where `stateSlot` discards it whenever a load word exists (`load-headline.ts:60`, `if (l) return l;`). The header chip that showed it was removed (`StateTab.tsx:1382`) and nothing replaced it. **Not starved — STRANDED ON THE OUTPUT SIDE.** Surface it or delete it; leaving it is the worst option. ⚠️ Michael's call.
- [ ] **The Fitness section is handed the athlete's goal and ignores it** (F18/F19). **F18 is FIXED (2026-07-21):** `StatePerformanceSection.tsx:877` `orderIdx` puts the athlete's `primaryDiscipline` first (`:871-875`), with `BLOCK_PRIORITY` as the fallback; `planWeek` is used at `:902`. **F19 still stands:** ⟨A31⟩ And the goal TYPE never reaches State at all: `grep build_muscle|get_stronger` across `state-trend/`, `response-model/` and the State components returns **nothing**. The "goal picks the instrument" job (e1RM leads for get_stronger, volume for build_muscle) is not half-wired — it is absent.
- [ ] **Five of twelve ride types feed NO fitness read** (Michael's ask — social rides). Power counts `climbing / threshold / sweet_spot / tempo`; efficiency counts `endurance / endurance_long / recovery` (`state-trend/bike-fitness.ts:21,33`). **`group`, `vo2`, `anaerobic`, `sprint`, `over_under` fall between the two buckets** — they add to load and contribute to nothing, silently. A group-ride rider and an interval-heavy rider are both invisible to the bike trend. ⚠️ The power/efficiency SPLIT is deliberate and correct (`bike-fitness.ts:18-23`) — the gap is that nothing catches what falls between. **Violates the "no silent drops" law in `STATE-SOURCE-MAP.md`.**
- [ ] **The adaptation substrate is run-only** (F4). `compute-adaptation-metrics/index.ts:359` branches on `run|running|walk|hike`; `:407` on `strength`. **No ride branch, no swim branch.** Rides and swims get a record stamped poor/0-confidence with no `workout_type`, so `block-adaptation` drops them from every lane — not even into the excluded counts. Compounding: an EMPTY lane scores as **worst, not unknown** (`block-adaptation/index.ts:~178`, zero long-run samples → `-1`), and three of five focus weightings are unreachable (`:91-98` can only return `hybrid`/`unknown`, so the `marathon_prep` guardrail has never run). **Recommend: abandon `adaptation_score` rather than repair it** — the per-discipline reads are better and already honest about their windows.

---

## PHASE 7 — HYGIENE (delete, mostly)

- [ ] 🔴 **DELETE `strava-refresh`.** Zero callers, **deployed**, **no auth check** — takes `userId` from the body and **returns that user's Strava access token**. The anon key that reaches it is public. **Delete, don't document.**
- [ ] 🔴 **DELETE `_shared/bearer-auth.ts`** — decodes JWTs **without verifying the signature**. A second, unsafe auth idiom next to the good one (`require-user`, adopted by 13 of 96; `bearer-auth.ts` has one importer left — `fetch-strava-route`) ⟨A31⟩.
- [ ] **Server-side admin check** — the 8 backfill functions `WorkloadAdmin` invokes are gated **client-side only**.
- [ ] **Dead edge functions.** The empty dirs are GONE (0 remain, `analyze-workout/` deleted). The live decoy is still there: `generate-training-context/index.ts` (3,423 lines, dead twin of the live `coach`). **Re-count the dead functions before working this — "24" is a 2026-07-13 number against a tree that now has 96 dirs.** ⟨A31⟩
- [ ] **5 dead run-generator classes** — and `simple-completion.ts:89` exports a class named **`SustainableGenerator`**, identical to the live one. **Editing the wrong file is a silent no-op.**
- [ ] **9 coach outputs with no mounted surface** — incl. **`reaction`**, the training-reaction axis and the centrepiece of `CANON-arc-inference-model.md`. ⚠️ *the object is load-bearing internally — delete only its dead emission.* **Mount `CoachWeekTab` or delete it. Right now it is neither, which is the worst of both.**

### ADDED 2026-07-20 — DEAD on State. All consumer-checked. See `AUDIT-state-screen-2026-07-20.md`.

- [ ] **The stale raw-ACWR label** (F11). `coach/index.ts:5594-5600` mints `label` from the bare ratio ⟨A31⟩: `back off` / `rest now` — **the D-281 bug Q-166 reverted, still shipping in the payload.** Consumer check: `LoadBar.tsx:37` `loadVolumeColor` handles only the RECONCILED words (`balanced/productive/build more/a bit high/pull back`); neither `back off` nor `rest now` appears anywhere in the client. **No consumer. Delete** (trace non-client readers first).
- [x] **`PostureLine`** (F10). ✅ **DELETED** (coach payload v145) — the posture sentence now renders opt-in inside the RUN efficiency ⓘ tap-down; the orphaned always-visible component is gone (`StatePerformanceSection.tsx:845` records it). ⟨A31⟩
- [ ] **`readinessColor`** (F24). `StateTab.tsx:1237` — five-branch colour map, **zero references.** Left behind when the readiness chip was removed.
- [ ] **Two file headers claiming "NOT YET SHIPPED — under review"** (F12) on shipped, rendering code: `StatePerformanceSection.tsx:5` and `StateTab.tsx:1653`.
- [ ] **`docs/SPEC-state-headline.md`** (F13) — the code shipped; per the SPEC LIFECYCLE in `CLAUDE.md` the substance folds into a `D-NNN` and the file dies.
- [ ] **Three generations of the race projection renderer, all live** (F29). `StateTab.tsx:526` (grouped, current) → `:544` (`projection_facts`, explicitly "legacy flat list still supported") → `:555` (`mismatch_blurb`). Each with its own gate. Nothing records which is current. **Confirm the live path, delete the other two.**
- [ ] **193 files in `scripts/`** ⟨A31⟩ (F27) — `_d183-verify.mjs`, `_coach-dbg2.ts`, `_dbg-apr19.ts` … one-off debug scripts from individual investigations, none ever removed. Not a State defect; the same accretion, and it buries the real harnesses (`fanout-audit.mjs`).

---

## The two rules that keep this from happening again

1. **⛔ BACK-ANNOTATE.** When you supersede an older `D-NNN`/`Q-NNN`, **go back and mark the older entry.** Forward pointers were always good here; back-pointers never existed. That is how all five docs rotted. *(Now step 2 of the end-of-session protocol in `CLAUDE.md`.)*
2. **⛔ DEPLOY EVERY IMPORTER.** Supabase bundles `_shared` **at deploy time** — each function carries its own frozen copy. Editing a shared file changes **nothing** until every importer is redeployed. This silently stranded **17 functions**, one for a month, and made D-287's *"the resolver is UNIVERSAL on every surface"* **false in production.**

---

## And the method, because it cost us twice today

**The code audit found the architecture. It found NONE of the three worst bugs.**

`pctChange(current, chronic)` reads as reasonable — until you notice it's Monday. `isPerformedStrengthSet` reads as a careful, deliberately-centralized predicate — and it is one — until you see a zero-rep set marked done.

**A code trace is right about what EXISTS and blind to what is BITING. A plausible mechanism found in code is a HYPOTHESIS, not a finding, until the data agrees.** *(Two were wrong today: the zone claim, and the terrain theory. Both looked airtight in code.)*

**Do both. Neither alone is honest.**
