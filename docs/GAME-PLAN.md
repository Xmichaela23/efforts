# GAME PLAN — finish the fucking thing

**2026-07-13.** Written after a full code audit (4 parallel readers) **and three hours in the live app**, which found three bugs the audit missed. This is the sequence. It is dependency-ordered, not wish-ordered.

**Read `START-HERE.md` → `LIFECYCLE.md` → `CAPABILITY-MAP.md` first. Then this.**

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

---

## PHASE 4 — ONE SOURCE PER FACT (kill the DOUBLED disease)

- [x] **One LTHR — ✅ SHIPPED 2026-07-18 (D-296).** `resolveCurrentLthr` built; all 4 anchor sites routed (easy-hr / zone-bins / coach / workload); FIT-import 0.90 seam + the run analyzer's non-Friel fallback both → canonical. `SPEC-lthr-one-anchor.md` folded to D-296 and deleted. Byte-identical for the primary user. **`threshold_pace` ✅ SHIPPED 2026-07-18 (D-300)** — `resolveCurrentRunThresholdPace`; coach + race-projections + snapshot spine routed, 3 units unified. **Max-HR resolver ✅ SHIPPED 2026-07-18 (D-299)** — `resolve-current-max-hr.ts`, one divisor + Tanaka/Gulati. Both HR-congruence tail items (#5, #6) now closed.
- [x] **One ACWR band — ✅ SHIPPED 2026-07-18 (D-301).** Traced: only **1** of the "6" was LIVE (`CoachWeekTab.SnapshotLoadBar`, re-deriving a plan-blind `back off`/`rest now` off the raw ratio); the LoadBar was already single-sourced to the reconciled verdict; the other 4 band fns were DEAD (`TrainingStateBar`, `getACWRStatus`+config, `acwrZone`, `acwrVolumeLabel`) — all deleted. CoachWeekTab now reads the reconciled two-key verdict (`statusVolumeLabel`), phase-aware + body-corroborated, no raw-ratio prescription (D-281/Q-137). Matches Garmin/TrainingPeaks (verdict leads, ACWR a bare reference).
- [~] **One zone table.** D-286 fixed three copies; **D-296 (2026-07-18) fixed two more** — the FIT-import 0.90 seam (`save-imported-workout`) and the non-Friel fallback in `analyze-running-workout:1030/:1934`, both → canonical `friel-zones.ts`. **Remaining:** delete the dead `_shared/endurance/hr-zones.ts` 0.90 copy — DEFERRED (`generate-run-plan/generators/sustainable.ts` still refs its symbols; check live/dead first).
- [ ] **`adapt-plan`: ONE writer, and the athlete gets the choice.** It silently re-prices strength on **every ingest**, skipping the fatigue gate the `suggest` path applies — while the consent path (`StrengthAdjustmentModal`, mounted) asks permission for a thing already done. **This violates the standing "prescribed load changes are sign-off-gated" rule in code.** ✅ Ruled: mirror the easy-pace chooser. Default = today's behaviour, visible, overridable.
- [ ] **FTP: route the 8 stragglers** — incl. `get-week:436` (week-view watts) and `athlete-snapshot/identity.ts:67` → **the LLM prompt** (so the coach can *speak* a different FTP than the screens show).

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

---

## PHASE 7 — HYGIENE (delete, mostly)

- [ ] 🔴 **DELETE `strava-refresh`.** Zero callers, **deployed**, **no auth check** — takes `userId` from the body and **returns that user's Strava access token**. The anon key that reaches it is public. **Delete, don't document.**
- [ ] 🔴 **DELETE `_shared/bearer-auth.ts`** — decodes JWTs **without verifying the signature**. A second, unsafe auth idiom next to the good one (`require-user`, adopted by 9 of 87).
- [ ] **Server-side admin check** — the 8 backfill functions `WorkloadAdmin` invokes are gated **client-side only**.
- [ ] **24 dead edge functions + 11 empty dirs.** Two are dangerous decoys: `analyze-workout/` (empty, the most guessable name in the repo) and `generate-training-context/` (3.4k lines, dead twin of the live `coach`).
- [ ] **5 dead run-generator classes** — and `simple-completion.ts:89` exports a class named **`SustainableGenerator`**, identical to the live one. **Editing the wrong file is a silent no-op.**
- [ ] **9 coach outputs with no mounted surface** — incl. **`reaction`**, the training-reaction axis and the centrepiece of `CANON-arc-inference-model.md`. ⚠️ *the object is load-bearing internally — delete only its dead emission.* **Mount `CoachWeekTab` or delete it. Right now it is neither, which is the worst of both.**

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
