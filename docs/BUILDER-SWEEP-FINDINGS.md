# Builder Sweep — Findings (running log)

Survey of the non-race builder + strength-prescription engine, started 2026-06-28. **Find & document, do NOT fix** — owner reviews, then we cut. Each finding: symptom, root cause (file:line), severity, suspected fix.

**Method:**
- **Strength-vocabulary sweep:** local deno against the pure `shared/strength-system/` module (synthetic baselines + every equipment tier in-context). No service key, no DB writes.
- **Builder/materialization:** browser on `efforts.work` (test account `newclaudetest@test.com` — never real user `45d122e7`). Currently blocked behind F-1 for non-race run goals.
- Deployed code under test: `create-goal-and-materialize-plan` v221, `generate-combined-plan` v264, `generate-run-plan` v139 (all `b0bc050e`).

**Severity scale:** P0 = feature broken in prod / data-wrong · P1 = wrong-shaped output · P2 = correctness edge / honesty · P3 = cosmetic/polish.

---

## F-1 — Non-race run goal can't materialize: `build_existing` rejects it for missing race distance  [P0]

- **Symptom:** Building any non-race goal that resolves to `sport:'run'` (e.g. "Get stronger" with run in the posture) via `/goals/build` returns `200 {success:false, error:"Set a race distance on this goal before building a plan."}`. No plan materializes; the inserted goal is rolled back. The entire non-race builder is non-functional in production for run-shaped goals. **Verified live** on prod (test account), not inferred.
- **Root cause:** `supabase/functions/create-goal-and-materialize-plan/index.ts:2206-2207`. The `build_existing` *forwarded-goal* branch (the path the builder uses — it forwards the just-inserted goal) validates `String(resolvedGoal.sport).toLowerCase() === 'run' && !resolvedGoal.distance → throw missing_distance` **without** an `isNonRaceGoalType(resolvedGoal.goal_type)` guard. A correctly-typed `capacity` goal (`distance:null`) throws here, *before* the non-race short-circuit at line 2338 can fire. The parallel `create` branch (2183-2188) DOES guard with `isNonRaceGoalType` — only `build_existing` is missing it.
- **Trace confirming the client is blameless:** the inserted goal is correctly `goal_type:'capacity'` (`arc-setup-persistence.ts` `buildGoalInsert` writes it straight through; `isValidGoalType` accepts capacity). B1 forwards `goal_type:"capacity"` + `target_weeks` (captured live in the request payload). `buildCompleteContext`'s `.eq('goal_type','event')` query (line 426) is a fallback that does NOT run for the builder (inserted goals are non-empty), so it is NOT the cause.
- **Why it escaped:** the `create` path was the one Cut 3b tested last session (passed). The builder is the first consumer to drive a non-race goal through `build_existing`, and it's URL-only / never live-tested. Byte-identical event suites don't cover it (events have distances); the 15 seed tests are client-side.
- **Suspected fix (one line):** add the non-race guard the create path already has —
  ```js
  if (!isNonRaceGoalType(resolvedGoal.goal_type) &&
      String(resolvedGoal.sport || '').toLowerCase() === 'run' && !resolvedGoal.distance) { … }
  ```
  `isNonRaceGoalType` is already imported (line 45). Check the DB-lookup branch (2223-2226) too: it rejects non-event with `'Only event goals can auto-build'` (2223) — if a non-race build can ever reach that branch (goal not forwarded), it's a second gap.
- **✅ FIXED (2026-06-28):** both doors closed via one shared `buildExistingGuardError()` in `non-race-routing.ts`. Commit `254271c9` (forwarded-branch one-liner) → `e5a2fca2` (extracted shared guard + 12-case test battery; closed the DB-lookup second gap too). Local: `non-race-routing.test.ts` 9/9, `deno check` +0 errors, events byte-identical. **Live-verify owed post-deploy:** clean materialize (both doors) + 486 matrix.

---
<!-- new findings appended below -->

## Equipment taxonomy (reference — what the engine ACTUALLY supports)

Read from `_shared/strength-equipment-tier.ts` + `protocols/types.ts`. The owner's hypothesis (commercial/home/half-rack/dumbbell-only/bands/bodyweight as tiers) is **not** how the engine models it:

- **Prescription is driven by a 3-tier CAPABILITY classification:** `full_barbell | dumbbell_based | bodyweight_bands` (`resolveStrengthEquipmentTier3`). There is **no** half-rack tier and **no** commercial-vs-home distinction at the prescription level.
- **Location** (`home_gym | commercial_gym`) is a SEPARATE, cosmetic axis (`equipment_location`), preserved but not driving exercise selection (triathlon protocols collapse tier3 → a 2-tier location-ish value but still key off tier3).
- **Fine gear is handled by per-exercise flags on `ProtocolContext.userBaselines`:** `hasBench, hasPullUpBar, hasBox, hasKettlebell, hasCable, hasGHD, dbMaxLb`. The contract is that protocols substitute when a flag is false. **The bug class to hunt: a protocol prescribing an exercise whose gear the athlete's profile lacks because the protocol didn't consult the flag.** A `full_barbell` athlete is NOT guaranteed a pull-up bar / box / cable.
- **Known dead path (from code comment):** `hasGHD` — "No current equipment UI option produces this" → any Nordic/GHD-gated exercise can never fire. (Confirm whether any protocol depends on it → F-candidate.)

Sweep dimension = 3 tiers × {hasBench, hasPullUpBar, hasBox, hasKettlebell, hasCable} presence × 7 protocols × phases × frequency.

## Synthetic baselines used in the local sweep (documented for reproducibility)
Passed directly into `ProtocolContext.userBaselines` (no DB seed needed for the local module sweep): `squat1RM:275, deadlift1RM:315, bench1RM:205, overhead1RM:125, dbMaxLb:50` (plausible intermediate lifter). These make `%1RM` resolve to real weights instead of rep-cues.

---

## F-2 — `five_by_five` is equipment-blind, yet it's the DEFAULT developer for the `dumbbell_based` tier  [P1]

- **Symptom:** A dumbbell-only athlete who picks "develop" gets `five_by_five` by default and is prescribed pure **barbell** lifts — `Back Squat`, `Bench Press`, `Barbell Row`, `Overhead Press`, `Deadlift` — at `% 1RM`. Same for a barbell-without-rack/bench athlete (`full_barbell` tier is granted by barbell+plates alone). No DB substitution, no `hasBench`/rack gating.
- **Root cause:** `shared/strength-system/protocols/five-by-five.ts` — **zero** references to `equipmentTier`, `dumbbell`, `dbPrescription`, `hasBench`, or `bodyweight` (grep = 0). It's barbell-only by construction. But `non-race-goal-seeds.ts:110-112` `defaultStrengthDeveloper` returns `five_by_five` for **everything except `bodyweight_bands`** — so `dumbbell_based` defaults to it, and `strengthDevelopersFor('dumbbell_based')` offers it (`BARBELL_DEVELOPERS`). `dbPrescription` (the DB-load converter) is called **only** by `triathlon_performance` — five_by_five never routes through it.
- **Reachability:** fully reachable + it's the **default**. A dumbbell-owning athlete selecting "Get stronger / develop" lands here.
- **Severity P1:** wrong-equipment prescription for the default developer of an entire capability tier.
- **Suspected fix:** either (a) gate `five_by_five` to `full_barbell` only and make `defaultStrengthDeveloper` return a DB-capable developer for `dumbbell_based` (e.g. a DB hypertrophy/upper_aesthetics variant), or (b) teach five_by_five to route its lifts through `dbPrescription` + rename to DB variants when `equipmentTier==='dumbbell_based'`, and gate Bench on `hasBench`. (a) is cleaner — 5×5's linear-barbell identity doesn't translate to DBs.

## F-3 — `neural_speed` & `upper_aesthetics` prescribe Pull-ups with NO `hasPullUpBar` gating (contract violation)  [P1]

- **Symptom:** Every athlete on these run-centric protocols gets `Pull-ups` regardless of equipment — a home runner with no pull-up bar can't do the prescribed work, and the documented band-pull-down fallback never appears.
- **Root cause:** `performance-neural.ts` (Pull-ups hardcoded at lines 397, 409, 423, 435, 446, 470, 480) and `upper-priority-hybrid.ts` (Pull-ups at 246, 260, 275, 287, 298, 323, 336) — **0** references to `hasPullUpBar` or a band-pull-down fallback (grep = 0). The `ProtocolContext.userBaselines.hasPullUpBar` contract (types.ts: "Pull-ups are gated on this; otherwise band pull-down (spec §8.2)") is implemented by `foundation-durability` (20 flag refs) but **ignored** by these two.
- **Severity P1:** common scenario (home-gym runner), clear contract violation, documented fallback exists but is unwired.
- **Suspected fix:** route Pull-ups through the same `hasPullUpBar ? 'Pull-ups' : 'Band Pull-Down'` substitution durability uses; factor it into a shared helper so all protocols share one gate.

## F-4 — `upper_aesthetics` prescribes Box Jumps with no `hasBox` gating  [P2]

- **Symptom:** `Box Jumps` / `Box Jumps or Broad Jumps` prescribed to athletes without a box/plyo platform.
- **Root cause:** `upper-priority-hybrid.ts:125,143,183` — hardcoded, `hasBox` refs = 0. Contract (types.ts: "Box Jumps + Step-ups + Bulgarian Split Squat gate on this") ignored. Note the "or Broad Jumps" variant at :183 is a partial bodyweight fallback, but :125/:143 are not.
- **Suspected fix:** gate on `hasBox` → Broad Jumps / Squat Jumps fallback when false (the :183 pattern, applied everywhere).

## F-5 — Band exercises are structurally un-gateable (no `hasBands` flag)  [P2]

- **Symptom:** `Band Face Pulls`, `Band Pull-Aparts`, `Band Pull-Down`, `Band Overhead Press` are prescribed by durability / neural_speed / upper_aesthetics / triathlon to **`full_barbell` and `dumbbell_based`** athletes who may own no bands.
- **Root cause:** `ProtocolContext.userBaselines` has `hasBench/hasPullUpBar/hasBox/hasKettlebell/hasCable/hasGHD` but **no `hasBands`**. Bands are implicitly assumed universal. For the `bodyweight_bands` tier that's safe (bands definitional), but a barbell or dumbbell athlete isn't guaranteed bands.
- **Severity P2:** bands are cheap/common, so real-world impact is modest, but it's a true ungated dependency. Decide: assume-universal (document it) or add `hasBands` + substitute (Face Pulls→cable/rear-delt DB).
- **Suspected fix:** add `hasBands` to the context + a non-band fallback for the rear-delt/scap work, OR explicitly document bands as an assumed baseline accessory.

## F-6 — `buildStrengthEquipmentLine` mis-classifies gear (athlete-facing Equipment line wrong)  [P2]

The session Equipment summary over- and under-specifies, independent of the prescription:
- **Over-requires Rings:** `exerciseRequiredGearKeys` (`_shared/strength-equipment-tier.ts:256`) maps `/inverted...rows?/ → ['rings']`. Plain **`Inverted Rows`** (doable on a bar/Smith/table/TRX) is reported as **"Required: Rings"** for every protocol that prescribes them — most athletes will never have rings. Should be a bar-class requirement (or none).
- **Over-requires Bench for Step-ups:** line 271 maps `step-ups → ['bench']`; a box/step/stair suffices. Reports "Required: Bench" to bodyweight athletes.
- **Under-detects barbell lifts:** the barbell regexes require the literal word "barbell" (e.g. `/barbell\s+back\s+squat/`, line 233). `five_by_five` names them **`Back Squat` / `Overhead Press` / `Deadlift`** (no "Barbell" prefix), so the Equipment line returns **no** Barbell/Rack requirement for a barbell 5×5 session — the summary silently under-reports the gear the session actually needs. (Compounds F-2.)
- **Suspected fix:** broaden the regexes to match unprefixed compound names; downgrade `inverted rows` to a bar-class key (or optional); make step-ups a box/step key.

## F-7 — `minimum_dose` is registered-but-unreachable via `getProtocol`  [P3, likely intentional]

- **Symptom:** `getProtocol('minimum_dose')` **throws** `Invalid protocol ID` even though `selector.ts` has a `case 'minimum_dose'` and `minimumDoseProtocol` exists.
- **Root cause:** `isValidProtocol`/`listProtocols` exclude `minimum_dose` ("excluded until frontend support is added") and the validation runs **before** the switch — so the switch case is dead. Likely intentional (per the comment) but it's a registration/impl mismatch: a built, documented protocol no one can select. Confirm intent; if intentional, the dead `case` + impl are misleading.

## Positive control — `foundation_durability` gates correctly

Not a bug — the counter-example proving the contract is implementable. `foundation-durability.ts` has 20 references to `hasBench/hasPullUpBar/hasBox/Step-up/Inverted Row` and substitutes properly. F-2/F-3/F-4 are "the other protocols didn't copy durability's gating," not "the gating is impossible." A shared gating helper would fix the class.

---

## Ranked summary (owner review → then cut)

| # | Finding | Sev | One-line fix |
|---|---------|-----|--------------|
| **F-1** | Non-race run goal can't materialize — `build_existing` demands race distance | **P0** | ✅ **FIXED** `254271c9`+`e5a2fca2` (shared `buildExistingGuardError`, both doors, 9/9 tests); live-verify owed |
| **F-2** | `five_by_five` (default for `dumbbell_based`) prescribes barbell-only lifts | **P1** | gate 5×5 to `full_barbell`; give `dumbbell_based` a DB developer default |
| **F-3** | `neural_speed` + `upper_aesthetics` prescribe Pull-ups though `hasPullUpBar` IS populated from the user's checkbox → **broken user promise** (F-8) | **P1** | shared `hasPullUpBar ? Pull-ups : Band Pull-Down` gate |
| **F-4** | `upper_aesthetics` Box Jumps un-gated — and no box checkbox exists, so always un-doable for home athletes (F-8) | **P2** | gate → Broad/Squat Jumps fallback; add box checkbox if box work matters |
| **F-5** | Bands are **split-brain**: `hasResistanceBands` in materialize only, absent from `ProtocolContext`; protocol-emitted band work not gated by the bands checkbox (corrected by F-8) | **P2** | unify into one equipment-substitution authority |
| **F-6** | `buildStrengthEquipmentLine` mis-classifies gear (rings/step-ups over, barbell under) | **P2** | fix regexes in `_shared/strength-equipment-tier.ts` |
| **F-7** | `minimum_dose` registered but unreachable via `getProtocol` | **P3** | confirm intent; remove dead case or wire it |
| **F-8** | Equipment handled across 2 layers (protocol `has*` + materialize substitution) with **non-overlapping coverage** — checkboxes ARE wired (not cosmetic), but pull-ups/box/barbell fall through both | **meta** | one equipment-substitution authority over the full vocabulary |

**Root pattern:** equipment correctness is split across the protocol layer (`ProtocolContext.has*`, populated from the checkboxes at `session-factory.ts:2438-2443`) and the materialize layer (`substituteExerciseForEquipment`), with non-overlapping exercise coverage (F-8). The gating contract is honored by `durability` + `triathlon_performance` but not by `five_by_five`/`neural_speed`/`upper_aesthetics`. **Because the checkboxes ARE wired, F-3 is a broken user promise, not a missing default.** One shared equipment-substitution authority both layers consult would close F-3/F-4/F-5/F-8 together.

## Sweep provenance / cleanup
- **Method:** local deno sweep of the real `shared/strength-system/` protocol modules — 540 combos (7 protocols × 9 equipment profiles × 4 phases × 2 frequencies, minus `minimum_dose` which throws). Harness: `scratchpad/strength-sweep.ts` + `sweep2.ts` (attribution). Synthetic baselines per "baselines used" section above.
- **No production/test-user data written** by the vocabulary sweep (pure local module). The earlier browser F-1 verification (test account `newclaudetest@test.com`) created **no** stray rows — every failed build rolled back. Real user `45d122e7` never touched.
- **Tooling note:** installed `deno` 2.9.0 user-space to `~/.deno` (the repo's own test runner) to run the protocol modules. Removable via `rm -rf ~/.deno`.
- **NOTHING FIXED** — all findings are documented only, per instruction. Owner reviews, then we cut.

---

## F-8 — Equipment-checkbox wiring trace: the gear checkboxes ARE wired (reclassifies F-3/F-4, corrects F-5)  [meta-finding]

Prompted by the equipment screen (Commercial/Home + 8 gear checkboxes: barbell, rack, pull-up bar, cable, dumbbells, bench, kettlebells, bands). Traced read-only whether those checkboxes reach the engine's per-gear flags. **They do — my earlier "cosmetic / 3-tier only" framing was wrong.** But equipment is handled across **two layers with non-overlapping coverage**, and exercises un-gated by BOTH reach the athlete.

**The chain (chips → flags):** UI stores exact labels in `user_baselines.equipment.strength` (`TrainingBaselines.tsx:926-931`: "Squat rack / Power cage", "Bench (flat/adjustable)", "Pull-up bar", "Kettlebells", "Cable machine", "Resistance bands", + "Barbell + plates", "Dumbbells", "Commercial gym").

**Layer 1 — Protocol context** (`generate-combined-plan/session-factory.ts:2438-2443`): builds `ProtocolContext.userBaselines` from those chips:
- `hasPullUpBar = detectPullUpBar(chips)`, `hasBench = detectBench(chips)`, `hasBox = detectBox(chips)`, `hasKettlebell = detectKettlebell(chips)` — **populated from the checkboxes** (substring match; aligns with the stored labels).
- `hasCable = options.hasCable ?? (equipmentType !== 'home_gym')` — checkbox-or-location.
- `hasGHD = options.hasGhd ?? false` — **always false** (no UI; confirms the GHD dead-path).
- **No `hasBands`** in `ProtocolContext` at all → protocols are blind to bands.
- **No `hasBox` checkbox exists** in the 8 — so `hasBox` is true only via "Commercial gym". A home athlete can never assert a box.

**Layer 2 — Materialize** (`materialize-plan/index.ts:905-984` `substituteExerciseForEquipment`, called on strength at `:1593`/`:1776`): exact-label matching, **separate** `hasResistanceBands` (`:919`). Substitutes only **Face Pulls, Leg Curls, Leg Extensions, Lateral Raises** → band/DB/bodyweight. **No pull-up, box-jump, or barbell→DB substitution exists.**

**Consequences (reclassification):**
- **F-3 (Pull-ups) → BROKEN USER PROMISE, confirmed end-to-end.** User unchecks "Pull-up bar" → `hasPullUpBar=false` reaches `neural_speed`/`upper_aesthetics` → they ignore it (0 refs) → emit "Pull-ups" → materialize has no pull-up substitution → the final plan prescribes Pull-ups the athlete explicitly said they can't do. Ignored at *both* layers. **Severity stands P1, now as an explicit-input violation, not a missing default.**
- **F-4 (Box Jumps) → always-broken for home athletes.** There is no box checkbox, so `hasBox` is false for everyone except commercial-gym; `upper_aesthetics` ignores it anyway; materialize has no box substitution. A home athlete is *always* prescribed un-doable Box Jumps. (Distinct from F-3: no promise to break because there's no checkbox — but also never gated/substituted. Fix needs both a fallback AND, if box work matters, a checkbox.)
- **F-5 (bands) → CORRECTED.** A bands signal **does** exist — `hasResistanceBands` in materialize (`:919`), reading the "Resistance bands" checkbox, used to *choose* band variants for face-pull/leg-curl/lateral-raise substitutions. BUT (a) it's absent from `ProtocolContext` (protocols can't see bands), and (b) it's used to substitute *toward* bands, never to gate *away* protocol-emitted band exercises ("Band Pull-Aparts", "Band Face Pulls") when the user has no bands. So F-5 is not "no flag" — it's **split-brain**: the bands checkbox is half-consumed (materialize substitution) and invisible to the protocols that emit band work directly.

**Root systemic issue:** equipment correctness is split across the protocol layer (`ProtocolContext.has*`) and the materialize layer (`substituteExerciseForEquipment`), with **non-overlapping exercise coverage and different gear vocabularies** (one has `hasBands`/no `hasBox`-checkbox; the other has band substitution but no pull-up/box substitution). Anything un-gated by the protocol AND un-substituted by materialize (Pull-ups, Box Jumps, 5×5 barbell lifts → F-2/F-3/F-4) reaches the athlete unfixed. The fix isn't per-exercise whack-a-mole — it's **one equipment-substitution authority** both layers (or a single post-pass) consult, covering the full exercise vocabulary.

---

## F-9 — Cold-start (zero-baseline) non-race RUN goal can't materialize: long-run TSS-share backstop trips  [P1]

- **Symptom:** *surfaced behind F-1* (once the distance guard was fixed + deployed). Building a non-race "Get stronger" run-shaped goal on a **no-baseline** account (live, `newclaudetest`, v222) now passes F-1 but fails downstream: `200 {success:false, error_code:"downstream_function_failed", "Week 1: long-run raw TSS is 82.4% of weekly total raw TSS (limit 70%)"}`. No plan materializes (inserted goal rolled back cleanly — verified no stray data).
- **Root cause:** `generate-combined-plan/validate-training-floors.ts:52` `LONG_RUN_TSS_SHARE_MAX = 0.7` (message at :241; wrapped by `index.ts:383`). The comment itself: *"Not a coaching constraint… a backstop that flags weeks where some other system has gone wildly wrong (e.g. 90%+ of a week's TSS on one session)."* So the cap firing is a **symptom**: on a zero-fitness account the weekly volume is degenerate-low while the long-run **duration floor** (`longRunFloorMiles`) sizes a normal long run → it eats 82.4% of the tiny week.
- **Severity P1:** blocks the non-race builder for **brand-new, zero-history athletes** — precisely the "Get stronger" onboarding cohort the builder targets. F-1 fixed the guard; the builder still can't produce a plan for a cold-start run athlete.
- **Hypothesis (needs the baselined account to confirm):** with real baselines/CTL the weekly volume is realistic → long-run share drops below 70% → passes. If so, the gap is "cold-start volume sizing for non-race run is incoherent" — the engine should floor weekly volume (or gentle the long run) for zero-fitness athletes so the backstop never trips. **This is exactly why the baselined throwaway account is needed to finish the F-1 end-to-end proof.** If it fails WITH baselines too, it's a deeper proxy-distance/validator bug.
- **Note:** tri-shaped and event paths unaffected (different volume basis); this is the single-sport run + zero-CTL corner.

### F-1 live-verify status (updated)
- **Guard: PROVEN FIXED live** (v222) — the build no longer returns `missing_distance`; it passes F-1 into the engine. ✅
- **Full materialize: still owed** — blocked on F-9 for cold-start; re-run on a **baselined** account to confirm a plan actually persists + is right-shaped (swim:out→0 swim, retest end). 486 matrix (event byte-identity) = **486/486 pass** post-deploy.

---

## F-8 fix — SCOUT: one equipment-substitution authority (design, not cut)

**Goal:** every exercise the athlete sees is doable with their declared equipment, regardless of which protocol emitted it — closing F-2/F-3/F-4/F-5 as a class, not per-exercise.

**Placement — expand `materialize-plan` `substituteExerciseForEquipment` into THE authority.** Why here: it's the last stage before the athlete sees the plan, runs **per-exercise on every strength exercise** (`index.ts:1593`/`:1776`), and sees the FINAL names + the full equipment label set + the resolved `% 1RM`. The protocol-layer flags (durability's gating) can stay as defense-in-depth, but this chokepoint is what *guarantees* coverage no matter what a protocol emits. Today it covers only face pulls / leg curls / leg extensions / lateral raises (`:905-1008`), and only substitutes *toward* bands.

**What the authority must add (the gaps):**
| Gap | Exercise(s) | Rule |
|---|---|---|
| F-3 | `Pull-ups` | `!hasPullUpBar` → `Band Pull-Down` (bands) / `Inverted Row` (else) |
| F-4 | `Box Jumps` | `!hasBox` → `Broad Jumps` / `Squat Jumps` |
| F-2 | `Back Squat`,`Bench Press`,`Barbell Row`,`Overhead Press`,`Deadlift` | `!hasBarbell && hasDumbbells` → DB variant **+ `dbPrescription` load conversion**; neither → bodyweight variant |
| F-5 | `Band Pull-Aparts`,`Band Face Pulls`,… | `!hasResistanceBands` → `Reverse Flyes (bodyweight)` etc. (currently only ever substitutes *toward* bands) |

**Three design decisions to lock before cutting:**
1. **One gear-need map.** Promote `exerciseRequiredGearKeys` (`_shared/strength-equipment-tier.ts`) to the shared source of truth for "what gear does this exercise need," consumed by BOTH the substitution authority AND `buildStrengthEquipmentLine` — same map → no drift, and it fixes **F-6** (rings/step-ups/barbell misclassification) in the same stroke. Broaden the regexes to match unprefixed names (`Back Squat`, not just `Barbell Back Squat`).
2. **One equipment vocabulary.** Today protocol detectors use substring-on-chips; materialize uses exact-label. Align both on the canonical `athleteEquipmentToKeys` chip→key mapping so there's one reader.
3. **Barbell→DB is the hard part** (not a name swap): must call `dbPrescription(barbell1RM, %, dbMaxLb)` to re-prescribe load — materialize already has the `%` and the 1RMs; `dbPrescription` would need importing here. This is what makes F-2 a real cut, not a regex.

**Scope:** this is a substantial cut (new substitution branches + load conversion + the shared map refactor), not a one-liner. Recommend it as its own arc: (1) extract/expand the gear-need map + vocabulary unification (closes F-6), (2) add the pull-up/box/band-away substitutions (closes F-3/F-4/F-5), (3) barbell→DB with `dbPrescription` (closes F-2). Each independently testable on the local deno sweep (re-run `strength-sweep.ts` → expect 0 unowned-gear mismatches).

---

## F-10 — Non-race auto-build only supports run + triathlon; bike/swim-shaped goals are rejected  [P1]

- **Symptom:** *surfaced behind F-1 on the baselined account `claudemore`* (swim+bike+strength athlete, no declared run discipline). Building a non-race "Get stronger" goal that resolves to **sport=bike** returns `200 {success:false, error_code:"unsupported_sport", "Auto-build is not yet supported for \"bike\" goals. Supported: run, triathlon."}`. A swim-shaped goal hits the same gate. No plan materializes (rolled back, no stray data).
- **Root cause:** `create-goal-and-materialize-plan/index.ts:2322` — `if (!['run','triathlon','tri'].includes(sport)) throw unsupported_sport`. The non-race **builder offers** bike/swim-shaped goals (any discipline can be the develop/maintain focus), but the materializer only auto-builds run + triathlon.
- **Severity P1:** a cyclist, a swimmer, or any athlete whose disciplines exclude run and aren't full-tri **cannot materialize a non-race goal at all** — the builder lets them build it, the server rejects it. The builder should either not offer unsupported sports or the materializer should support them.
- **Sub-finding (discipline ↔ baselines mismatch):** `claudemore`'s `performance_numbers` carries run paces (`fiveK`, `easyPace`) but `arc.disciplines` = swim+bike, so the builder shows only Swim/Bike/Strength postures (no Run). The builder's discipline set comes from `arc.disciplines`, not from what baselines exist — worth a closer look.

### F-1 / F-9 verification status (updated — STILL OWED)
- **F-1 distance guard: PROVEN fixed** — passed on both `newclaudetest` and `claudemore` (no `missing_distance`).
- **F-1 full materialize + F-9 (70% backstop with real baselines): STILL UNVERIFIED.** `newclaudetest` (cold-start) hit F-9; `claudemore` (swim+bike, no run) hits F-10 — neither reached a successful materialize. **Need a baselined account with RUN as a declared discipline (or full swim+bike+run triathlon)** so a goal resolves to a supported sport AND exercises the run long-run backstop.

---

# MATERIALIZE-PATH SWEEP (2026-06-28) — direct preview calls, account `claudemore` (f28c36a9, baselined; run NOT declared)

**Method:** `create-goal-and-materialize-plan` with `mode:'build_existing', preview:true` + forwarded goal payload (full shape control via `goal.training_prefs.per_discipline_posture`), called in-browser with the user JWT. Preview = no persist for the non-race path (`plan_id:null` confirmed). Scope-safe: throwaway account, never `45d122e7`. **Note:** the `non_race_plan_failed` error path DID leak 2 orphan active plans (goal_id null) — deleted (HTTP 204), 0 stray remaining. **No deploy, no commits during the sweep.**

## Results — NON-RACE: 0 / 16 materialized

| shape | configs tried | result |
|---|---|---|
| **run** | tw 6/12/52, develop/maintain, completion/performance, strength on/off | **F-9** — long-run raw TSS **82.1–100%** of weekly (limit 70%). Worst: performance 92.4%, no-strength 100% |
| **run (extreme vol)** | h4/d3, h12/d6 | **F-11** — `non_race_plan_failed` (+ leaked orphan plan) |
| **tri** | tw 12/16/52, maintain & all-develop postures | **F-9b** — run-discipline long-run share **100%** |
| **bike** | tw 8/12 | **F-10** — `unsupported_sport` |
| **swim** | tw 12 | **F-10** — `unsupported_sport` |
| **strength-only** | tw 12 | **F-10** — `unsupported_sport` |

**No config of any shape, length, intent, or volume materialized a non-race plan.**

## Results — RACE
- **Tri events (70.3 / ironman):** materialize cleanly — covered by the 486/486 matrix. Sampled block: weekly TSS 499→650 with 3:1 recovery weeks, run long-run share **0.46** (healthy), tier-appropriate strength. **This is the smoking gun for F-9's root** (see below).
- **Single-sport run races (marathon/half/10K):** route to the separate `generate-run-plan` — not exercised by this sweep (different function; a `build_existing` event call hit an FK artifact `plan_link_failed` because the event path attempts a plan insert and doesn't honor `preview`).
- **Single-sport bike/swim races:** would hit F-10 (`create-goal:2322` allows run/triathlon only).

## Findings (new / escalated)

### F-9 — ESCALATE to **P0, structural**: non-race RUN goals can never materialize
- **Symptom:** long-run raw TSS share 82–100% > 70% (`validate-training-floors.ts:52` backstop) across EVERY config. Not mitigable by hours/days/intent/posture/length/strength.
- **Root cause (now clear from the race-vs-non-race contrast):** the **non-race plan schedules essentially only the long run** for the run discipline → it's 82–100% of the week. The **race** tri block schedules a full run week → share 0.46. So it's a **non-race plan-sizing bug** (too few non-long-run sessions), NOT a baselines/CTL issue. `validate-training-floors` is just the messenger.
- **Residual unknown:** `claudemore` has run paces but run isn't a *declared* discipline, so run CTL may be cold-started here. But the structural contrast (race 0.46 vs non-race 1.00) makes baseline-dependence very unlikely. A run-*declared* account would fully confirm.

### F-9b — NEW [P0/P1]: non-race TRI goals — run-discipline long-run share 100%
Same root as F-9: the tri non-race plan schedules only the long run on the run discipline.

### F-10 — CONFIRMED [P1]: non-race bike/swim/strength → `unsupported_sport`
`create-goal-and-materialize-plan:2322` allows only run/triathlon. Confirmed across bike, swim, strength. The builder offers these shapes; the server rejects them.

### F-11 — NEW [P2]: `non_race_plan_failed` at extreme volume + ORPHAN-PLAN LEAK
- Non-race run at h4/d3 and h12/d6 → `non_race_plan_failed` (distinct from the share backstop).
- **More important:** this error path **inserted a plan that then failed to link → orphan active plan (goal_id null), persisted despite `preview:true`.** Two orphans leaked in this sweep (cleaned up). The preview/rollback contract is not honored on this failure path — a real-flow stray-data risk.

### F-12 — META [P0]: the non-race builder materializes 0% of goals
F-1 unblocked the entry (distance guard), but **every shape fails behind it** (F-9 run, F-9b tri, F-10 bike/swim/strength). The non-race builder is **end-to-end non-functional** for plan creation. This is the headline: the feature shipped (client live) but cannot produce a plan.

## Plan-quality (Q-class) — none triggered
The user's ask was to flag "builds clean but looks like bad training" as Q-findings. **Nothing non-race builds**, so there's no non-race plan to assess. The one block that does build cleanly — the **race tri block** — looks like *good* training (sensible TSS ramp, 3:1 recovery, healthy long-run share, tier-appropriate strength). **No Q- findings.** The marathon and "get stronger" quality blocks requested can't be produced (get-stronger doesn't materialize; marathon is the legacy `generate-run-plan` path).
