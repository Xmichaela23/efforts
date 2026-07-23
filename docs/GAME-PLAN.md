# GAME PLAN — finish the fucking thing

**2026-07-13.** Written after a full code audit (4 parallel readers) **and three hours in the live app**, which found three bugs the audit missed. This is the sequence. It is dependency-ordered, not wish-ordered.

**Read `START-HERE.md` → `LIFECYCLE.md` → `CAPABILITY-MAP.md` first. Then this.**

> **2026-07-23 status:** current active work is the **State screen → 100%** track (per the roadmap in Michael's memory: State → plan builder → intro flow → freeballer). 2026-07-22 shipped the RUN row + FITNESS craft/chart pass (D-307 → D-311). 2026-07-23 fixed the exercise-name split bug (Q-197 → D-312) and shipped the **strength e1RM + bike power output charts** (D-313) + full-width layout (D-314). State FITNESS output charts now cover run/strength/bike. Remaining State chart threads: bike POWER is fixture-only until Michael logs power rides (or a burner run); the bike EFFICIENCY chart for endurance riders is the one open design call (**Q-200**); plus deferred tap-to-expand + PMC-parity. See **D-312 → D-314**, **Q-200**, and the ENGINE-STATE banner. The phase list below (the 2026-07-13 continuity plan) is still valid but is not what's currently being worked.

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

- [x] **Q-178 — a skipped exercise counts as PERFORMED.** `analyze-strength-workout:89` — `completed === true` short-circuits, so a `0 reps / 0 weight / 0 duration` set reads as done. **Live repro: he did ZERO Farmers Carries and the app said `98% · Strong — "sets landed on target across all three lifts"`.**
  **Fix:** a set with `reps === 0 && !weight && !duration` is not performed, whatever the flag says. Upstream: the logger must not write an RIR onto a zero-rep set. ⚠️ Read D-204 — change the *predicate*, not the 6 call sites.
  ⛔ **This is the one that matters most, and not for the score.** The fact packet said the exercise was performed → the LLM faithfully repeated it. **`narrative-core/validate.ts` validates prose against the FACTS, so it cannot catch a lie already IN the facts.** The containment is sound and **only as honest as the packet**. Corrupt the packet and the guard becomes a laundering step.
- [x] **Q-177 — the Monday alarm.** `compute-snapshot:445` compares a **partial-week cumulative SUM** against **complete prior weeks** → ≈ −75% on a Monday → fires `concern` severity every Monday and Tuesday, forever. It measures *what day you looked*. **Fix: delete the signal.** The spine's 6-week per-workout volume trend already exists, is immune, and said `steady`. **Do not widen the threshold — that hides a structural artifact behind a magic number.**
- [ ] **Q-164 — the dead "Aerobic fitness" BODY row.** *(⏭️ DEFERRED to Phase 4 — it is DEAD, not LYING. A row that never renders tells no one anything false.)* `coach:2131` `cardiac_efficiency_current: null, sample_size: 0` → the render gate can never be true. **Feed it or delete it.**
- [x] **The 5 red tests** (`_shared/cycling-v1/*`) assert an NP-trend fallback that `cb4eb1d5` deliberately deleted. **Green must mean green.**

### REOPENED 2026-07-20 — the Monday alarm survived, in the GRAPHICS. See `AUDIT-state-screen-2026-07-20.md`.

> **Q-177 was killed in the signal layer and left standing in the picture.** The guard was written for the sentence and never applied to the bar. **Twice.** Both are live on a real screen (device shots, 2026-07-20 09:21).

- [ ] **The planned-vs-actual bar compares a 7-day plan to a 0-day result** (F21). `coach/index.ts:5223` counts the WHOLE week as `planned`; `done` is bounded to `[weekStart, asOfDate]` (`:5219`). `StateTab.tsx:174` `WeekMixBar` draws both on ONE scale with **no partial-week guard and no numbers** — so every Monday shows a full planned bar over an empty actual bar. Directly beneath a LOAD bar reporting 288 pts across four sports. **The composer HAS a `partialWeek` flag for exactly this. Give the bar one.**
- [ ] **A no-plan athlete gets an empty bar labelled "planned", forever** (F26). `coach/index.ts:5227` keeps a discipline when `planned > 0 || done > 0`; `StateTab.tsx:1636` gates only on `counts.length === 0 && !accent` — **no `hasPlan` check**. Positioning is explicit that plan-absence is never a deficit, and the PROSE honours it (the composer's no-plan branch). The picture does not.
- [ ] **The upkeep sentence measures the bad news over 4 weeks and the good news over 0 days** (F15). `coach/index.ts:5300-5337`: shortfall from a 28-day trailing window, but `carriers` is built from **this week's** `counts`. On a Monday the credit clause silently drops. **This is the flagship sentence of `PRODUCT-POSITIONING-v2-DRAFT.md` §4** — "your aerobic engine is holding, that's the riding and swimming" — and the window bug deletes the permission half, leaving only the warning. **Highest-value single fix on the screen.**
- [ ] **VERIFY: a dormant load gate woke up via an unrelated fix, and its own doc still says it's inert** (F25). `_shared/load-status-reconcile.ts` header still reads *"Gate 2 is inert until phase labeling is populated upstream"*. **That is no longer true** — `compute-snapshot/index.ts:581` now populates `plan_phase` from the single resolver (D-261/Q-138, "was a dead null stub"), the coach resolves `weekIntent` off the same resolver (`coach/index.ts:1045`), and `plan-phase.ts:141-143` confirms `build`/`baseline` are reachable. **So Gate 2 now fires**, softening an uncorroborated 'high'/'elevated' in a build week — i.e. it changes whether the athlete is told to pull back. **Nobody re-verified it when it woke up, and no doc in either subsystem records the crossing.** This is the "every fix opens a hole" pattern caught in the act. **Not a fix — a verification, then correct the stale header.**
- [ ] **"Handling combined load well" over-claims what it checked** (F17). `coach/index.ts:5566` fires on five STRESS signals being absent; it never looks at volume, adherence or upkeep. Renders in green two inches above the upkeep shortfall. **Same class as the composer all-clear fixed 2026-07-19 — scope the claim to what was examined.**

---

## PHASE 2 — FIX THE FAN-OUT (this is "the analysis problem")

*Everything downstream is only as good as this. It is the root of the analysis complaints.*

> **✅ SHIPPED 2026-07-18 (D-298) — a–d UNVERIFIED.** `recompute-workout` is now the one ordered orchestrator; every entry path (incl. both orphans) fires it; the snapshot version guard (migration `20260717…`, applied) refuses stale overwrites and was **verified live**. All three items below are addressed by the orchestrator. **What's left is VERIFICATION on a real sync**, not more building — see `AUDIT-fanout-ordering-2026-07-17.md` §4 (a–d) and the top-of-ENGINE-STATE banner. The stale "16-day durability" symptom (item 4) was a SEPARATE cause (D-291, the `basis='raw'` collision) already fixed — Phase 2 is the ordering, and it shipped.

- [x] **The fan-out awaits the wrong things.** ✅ D-298 — the orchestrator serializes to data dependencies.
  1. `compute-facts` is **awaited** (`ingest-activity:1582`) but reads `workouts.computed`, written by two **fire-and-forget** calls (`:1508`, `:1521`). When it loses the race: **no time-in-zone, no interval hits, no HR drift, no execution score. No error anywhere.**
  2. `compute-snapshot` (fired *from* `compute-facts:1844`) reads `workouts.workout_analysis` (`:689`) — written by `analyze-{sport}`, which is fired **after**, fire-and-forget (`ingest-activity:1624`). **So the run durability trend is ALWAYS AT LEAST ONE WORKOUT BEHIND, by construction.**
  **Fix: order the fan-out to match its data dependencies.** Await what you read.
- [ ] **Two ingest paths never reach the spine.** `ingest-phone-workout` and `save-imported-workout` fire only `compute-workout-summary` → **no `workout_facts`**, invisible to snapshot/arc/coach. *(`ManualSwimEntry` already works around it by calling `recompute-workout`. Do that, or fix the fan-out properly.)*
- [ ] **`workouts.workload_actual` is starved.** The ACWR substrate is written by **one** job called from **two** places. Anything ingested another way contributes **zero to ACWR** while still counting toward `workload_total`. **The same weekly snapshot row can contradict itself.**
- [ ] ⚠️ **UNEXPLAINED, needs a DB query, not a theory:** the run durability read is **`as of Jun 27` — 16 days stale**, and the one-workout lag above does not account for that. **Two theories have already been wrong today. Get the data.**

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

**The contradictions on this screen are ASSEMBLY bugs.** Every unit fixture passes. The 23 test files under `_shared/state-trend/` and `_shared/insights/` are good and they all go green — because each piece is right in isolation. **Nothing anywhere renders the assembled screen for a synthetic athlete**, and that is precisely where every one of these lives.

**Why nothing can:** the logic that decides what the cards SAY together is written inline, in anonymous IIFEs, inside `coach/index.ts` — **5,771 lines, `@ts-nocheck`**. No test can reach it. `load-status-reconcile.ts` was extracted from that same file for exactly this reason (D-259: *"a private ~200-line function buried in the ~5k-line coach edge file [that] could not be unit-run"*). **That extraction is the precedent. Do it again for the week-level composition, then build one harness that prints the whole screen as text for ~25 synthetic athletes** — sports, goal types, plan/no-plan, Monday/midweek/Sunday, thin/rich/stale/returning, develop/maintain/dropped. Read it like a page. The contradictions sit next to each other there the way they do on the phone.

---

## PHASE 4 — ONE SOURCE PER FACT (kill the DOUBLED disease)

- [x] **One LTHR — ✅ SHIPPED 2026-07-18 (D-296).** `resolveCurrentLthr` built; all 4 anchor sites routed (easy-hr / zone-bins / coach / workload); FIT-import 0.90 seam + the run analyzer's non-Friel fallback both → canonical. `SPEC-lthr-one-anchor.md` folded to D-296 and deleted. Byte-identical for the primary user. **`threshold_pace` ✅ SHIPPED 2026-07-18 (D-300)** — `resolveCurrentRunThresholdPace`; coach + race-projections + snapshot spine routed, 3 units unified. **Max-HR resolver ✅ SHIPPED 2026-07-18 (D-299)** — `resolve-current-max-hr.ts`, one divisor + Tanaka/Gulati. Both HR-congruence tail items (#5, #6) now closed.
- [x] **One ACWR band — ✅ SHIPPED 2026-07-18 (D-301).** Traced: only **1** of the "6" was LIVE (`CoachWeekTab.SnapshotLoadBar`, re-deriving a plan-blind `back off`/`rest now` off the raw ratio); the LoadBar was already single-sourced to the reconciled verdict; the other 4 band fns were DEAD (`TrainingStateBar`, `getACWRStatus`+config, `acwrZone`, `acwrVolumeLabel`) — all deleted. CoachWeekTab now reads the reconciled two-key verdict (`statusVolumeLabel`), phase-aware + body-corroborated, no raw-ratio prescription (D-281/Q-137). Matches Garmin/TrainingPeaks (verdict leads, ACWR a bare reference).
- [~] **One zone table.** D-286 fixed three copies; **D-296 (2026-07-18) fixed two more** — the FIT-import 0.90 seam (`save-imported-workout`) and the non-Friel fallback in `analyze-running-workout:1030/:1934`, both → canonical `friel-zones.ts`. **Remaining:** delete the dead `_shared/endurance/hr-zones.ts` 0.90 copy — DEFERRED (`generate-run-plan/generators/sustainable.ts` still refs its symbols; check live/dead first).
- [ ] **`adapt-plan`: ONE writer, and the athlete gets the choice.** It silently re-prices strength on **every ingest**, skipping the fatigue gate the `suggest` path applies — while the consent path (`StrengthAdjustmentModal`, mounted) asks permission for a thing already done. **This violates the standing "prescribed load changes are sign-off-gated" rule in code.** ✅ Ruled: mirror the easy-pace chooser. Default = today's behaviour, visible, overridable.
- [ ] **FTP: route the 8 stragglers** — incl. `get-week:436` (week-view watts) and `athlete-snapshot/identity.ts:67` → **the LLM prompt** (so the coach can *speak* a different FTP than the screens show).

### ADDED 2026-07-20 — the DOUBLED disease on STATE. See `AUDIT-state-screen-2026-07-20.md`.

> Phase 4 killed six duplicate ACWR bands and five zone tables — **numbers**. This is the same job on **prose and pictures**, and nobody has done it.

- [ ] **FIVE engines narrate the same week** (F9). `intent_summary` (coach) · `buildLoadHeadline` (**client**, `src/lib/load-headline.ts`) · `coach.narrative` (the composer) · `overall_training_read.summary` (`response-model/weekly.ts:526`) · `week_execution_v1.accent` (week-accent). Different substrates, no engine can see what the other four said. The composer's clause-suppression only guards against itself. **Decide which one speaks; the rest derive from it or die.** ⚠️ Michael's call — this is what the top of the screen SAYS.
- [ ] **The imperative string tree survived the LLM teardown** (F8). `response-model/weekly.ts:526` `computeOverallTrainingRead` — ~25 branches emitting "Sharpen, don't strain", "Recovery week — easy movement only", "Add a goal to direct training". **Identical shape to the `intent_summary` tree cut on 2026-07-19** for exactly this reason. It survived because it isn't the LLM. D-155 bans the register.
- [ ] **TWO stacked mix bars, same visual language** (F22). `LoadBar` = load points, rolling 7d, % shares. `WeekMixBar` = session counts, calendar week-to-date, raw counts. Same bar shape, same `getDisciplineColor`, inches apart, distinguished by two grey captions. **The doubling disease drawn literally.**
- [ ] **Two engines answer "how is it going"** (F7). `adaptation_score` (block-adaptation, focus-weighted 4-week blend) vs the composer's per-discipline ACWR floor (`coach-week-insights.ts:~231`). The coach computes the score every run and **discards it** (`coach/index.ts:2521`), keeping three raw percentages. ⚠️ **Recommend ABANDON, not fix** — see Phase 6 note on its substrate.
- [ ] **The load headline is composed on the CLIENT** (F3). `src/lib/load-headline.ts` via `StateTab.tsx:1249`. It reads reconciled verdicts rather than re-deriving (so it is formatting, not deciding) — but it is the one week-level verdict not owned by the server. Constitution Law 4.

---

## PHASE 5 — THE ONBOARDING GATE (before user #2 exists)

> **Every LATENT fracture in Phase 4 fires on exactly one person: the first new user.** They are not separate work — **they are the onboarding blast radius.**

- [ ] **⛔ MAKE THE APP REFUSE INSTEAD OF INVENT. This gates the flow.**
  Today, give the app nothing and it **invents, silently**: squat/bench/deadlift **135 lb**, OHP **95 lb** (`materialize-plan:2699-2726`), swim **1:30/100** (`:2352`), and HR zones that fall through to the non-Friel model. **Console log only. The athlete is never told.**
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
- [ ] **The Fitness section is handed the athlete's goal and ignores it** (F18/F19). `StatePerformanceSection.tsx:514` accepts `primaryDiscipline` and `planWeek` — **neither is referenced**. Order is hardcoded `ORDER_IDX = { strength: 0, run: 1, swim: 2, bike: 3 }` (`:533`). And the goal TYPE never reaches State at all: `grep build_muscle|get_stronger` across `state-trend/`, `response-model/` and the State components returns **nothing**. The "goal picks the instrument" job (e1RM leads for get_stronger, volume for build_muscle) is not half-wired — it is absent.
- [ ] **Five of twelve ride types feed NO fitness read** (Michael's ask — social rides). Power counts `climbing / threshold / sweet_spot / tempo`; efficiency counts `endurance / endurance_long / recovery` (`state-trend/bike-fitness.ts:21,33`). **`group`, `vo2`, `anaerobic`, `sprint`, `over_under` fall between the two buckets** — they add to load and contribute to nothing, silently. A group-ride rider and an interval-heavy rider are both invisible to the bike trend. ⚠️ The power/efficiency SPLIT is deliberate and correct (`bike-fitness.ts:18-23`) — the gap is that nothing catches what falls between. **Violates the "no silent drops" law in `STATE-SOURCE-MAP.md`.**
- [ ] **The adaptation substrate is run-only** (F4). `compute-adaptation-metrics/index.ts:359` branches on `run|running|walk|hike`; `:407` on `strength`. **No ride branch, no swim branch.** Rides and swims get a record stamped poor/0-confidence with no `workout_type`, so `block-adaptation` drops them from every lane — not even into the excluded counts. Compounding: an EMPTY lane scores as **worst, not unknown** (`block-adaptation/index.ts:~178`, zero long-run samples → `-1`), and three of five focus weightings are unreachable (`:91-98` can only return `hybrid`/`unknown`, so the `marathon_prep` guardrail has never run). **Recommend: abandon `adaptation_score` rather than repair it** — the per-discipline reads are better and already honest about their windows.

---

## PHASE 7 — HYGIENE (delete, mostly)

- [ ] 🔴 **DELETE `strava-refresh`.** Zero callers, **deployed**, **no auth check** — takes `userId` from the body and **returns that user's Strava access token**. The anon key that reaches it is public. **Delete, don't document.**
- [ ] 🔴 **DELETE `_shared/bearer-auth.ts`** — decodes JWTs **without verifying the signature**. A second, unsafe auth idiom next to the good one (`require-user`, adopted by 9 of 87).
- [ ] **Server-side admin check** — the 8 backfill functions `WorkloadAdmin` invokes are gated **client-side only**.
- [ ] **24 dead edge functions + 11 empty dirs.** Two are dangerous decoys: `analyze-workout/` (empty, the most guessable name in the repo) and `generate-training-context/` (3.4k lines, dead twin of the live `coach`).
- [ ] **5 dead run-generator classes** — and `simple-completion.ts:89` exports a class named **`SustainableGenerator`**, identical to the live one. **Editing the wrong file is a silent no-op.**
- [ ] **9 coach outputs with no mounted surface** — incl. **`reaction`**, the training-reaction axis and the centrepiece of `CANON-arc-inference-model.md`. ⚠️ *the object is load-bearing internally — delete only its dead emission.* **Mount `CoachWeekTab` or delete it. Right now it is neither, which is the worst of both.**

### ADDED 2026-07-20 — DEAD on State. All consumer-checked. See `AUDIT-state-screen-2026-07-20.md`.

- [ ] **The stale raw-ACWR label** (F11). `coach/index.ts:5460-5466` mints `label` from the bare ratio: `back off` / `rest now` — **the D-281 bug Q-166 reverted, still shipping in the payload.** Consumer check: `LoadBar.tsx:37` `loadVolumeColor` handles only the RECONCILED words (`balanced/productive/build more/a bit high/pull back`); neither `back off` nor `rest now` appears anywhere in the client. **No consumer. Delete** (trace non-client readers first).
- [ ] **`PostureLine`** (F10). `StatePerformanceSection.tsx:503` — defined, **never called**. Carries a 12-line comment explaining the Q-179 bug it closes. It closes nothing. Client-orphaned on purpose (Michael rejected the consoling register) — but the code and comment will convince the next session that posture speaks on screen.
- [ ] **`readinessColor`** (F24). `StateTab.tsx:1237` — five-branch colour map, **zero references.** Left behind when the readiness chip was removed.
- [ ] **Two file headers claiming "NOT YET SHIPPED — under review"** (F12) on shipped, rendering code: `StatePerformanceSection.tsx:5` and `StateTab.tsx:1653`.
- [ ] **`docs/SPEC-state-headline.md`** (F13) — the code shipped; per the SPEC LIFECYCLE in `CLAUDE.md` the substance folds into a `D-NNN` and the file dies.
- [ ] **Three generations of the race projection renderer, all live** (F29). `StateTab.tsx:526` (grouped, current) → `:544` (`projection_facts`, explicitly "legacy flat list still supported") → `:555` (`mismatch_blurb`). Each with its own gate. Nothing records which is current. **Confirm the live path, delete the other two.**
- [ ] **153 files in `scripts/`** (F27) — `_d183-verify.mjs`, `_coach-dbg2.ts`, `_dbg-apr19.ts` … one-off debug scripts from individual investigations, none ever removed. Not a State defect; the same accretion, and it buries the real harnesses (`fanout-audit.mjs`).

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
