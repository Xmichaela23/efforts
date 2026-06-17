# AREA — Baselines & athlete records

> Read-only reverse-documentation per `docs/WORKORDER-feature-audit.md`. Describes what the
> code does, not what it should do. Suspected problems live in **Discrepancies & flags** — not
> fixed. "Unclear from code" is used where the code does not settle the question.

## What this area does (plain-language overview)

This area covers every athlete physiological number the engine relies on: cycling FTP, run
threshold/easy pace and threshold/easy/max HR, swim CSS (sec/100), HR zones, strength 1RMs /
e1RM, equipment tier, and the derived "training fitness" tier. These values come from three
distinct origins — **user input** (the Training Baselines screen and a thin set of wizard
fields), **inferred from logged activity** (`learn-fitness-profile`, `compute-facts`), and
**hardcoded population defaults / fallbacks**. Almost everything that is *learned* lands in one
JSONB column: `user_baselines.learned_fitness`. User-entered numbers land in
`user_baselines.performance_numbers` (FTP, 5K pace, 1RMs) and `user_baselines.configured_hr_zones`
(manual HR). Reads are mediated by precedence resolvers — most prominently
`resolveCurrentFtp` — so different consumers can accept or reject low-confidence values. The
load-bearing finding for the onboarding gap: **a brand-new athlete leaves onboarding with null
FTP / null threshold pace / null CSS** because the wizard collects almost no fitness numbers and
the documented `FTP-COLD-START-SPEC` seeding is unimplemented.

## Features / flows

### Learned fitness inference (`learn-fitness-profile`)
- **What it does:** Derives HR anchors, paces, FTP, and swim pace from the athlete's logged
  workouts and writes them to `user_baselines.learned_fitness`. This is the authoritative
  *inferred* baseline writer.
- **How it works:** `supabase/functions/learn-fitness-profile/index.ts` (~1109 lines). Hard gate:
  `analyzeRuns`/`analyzeRides` return all-null below 3 workouts of that type (`index.ts:459`,
  `:697`); `analyzeSwims` publishes null below 3 usable swims (`:1075`). FTP is a 4-tier
  hierarchy (`:886-1023`): Tier 1 = `0.95 × best 20-min power` from `computed.power_curve['20min']`
  (`:914-933`), Tiers 2-4 fall to NP-based estimates with confidence capped at `medium`/`low`.
  HR anchors are medians of efforts inside %-of-observed-max bands (run threshold band 85-92%
  `:507-508`; ride threshold band 85-95% `:755-756`; easy/race bands similar). When a band yields
  no candidates, low-confidence `% of max` estimates are written (e.g. run threshold fallback
  `0.88 × max` `:541-549`). A **ratchet floor** (`:329-344`) blocks an overwrite only when the new
  value is *both* lower *and* lower-confidence than the prior. `strength_1rms` and
  `swim_pace_per_100m` are merge-preserved across runs (`:321-327`).
- **Inputs / outputs:** Reads `workouts` (sensor/computed), `workout_facts.swim_facts.pace_per_100m`
  (`:206-221`). Writes (UPDATE `:385-392` / INSERT `:402-411`) `user_baselines.learned_fitness`
  plus identity siblings `disciplines`, `training_background`, `athlete_identity` via
  `inferAthleteIdentityV1` (skipped when `athlete_identity.confirmed_by_user === true`, `:346-350`).
  Run paces stored as **sec/km**.
- **Triggers:** POST `{ user_id }`. Callers: `_shared/post-import-athlete-pipeline.ts:43`
  (milestone-gated post-import — main automated path), `_shared/race-feedback.ts:276`,
  `src/components/TrainingBaselines.tsx:410` (manual "refresh learned profile" button). On success
  fires `recomputeRaceProjectionsForUser` (`:423-427`).

### Manual baselines entry (Training Baselines screen)
- **What it does:** Lets the athlete enter/override FTP, 5K pace, body metrics, equipment, and
  manual HR (max HR / LTHR per sport) → computed HR zones.
- **How it works:** `src/components/TrainingBaselines.tsx`. FTP input at `:1256-1271`
  (`performanceNumbers.ftp`). 5K pace at `:1144` (`performanceNumbers.fiveK`). `handleSave`
  (`:619`) calls `saveUserBaselines` (defined `src/contexts/AppContext.tsx:332-397`) which
  upserts `user_baselines.performance_numbers` (coercing `fiveK` → `fiveK_pace` with a unit
  suffix, `:336-359`) plus body/equipment columns. When manual HR overrides exist, a *separate*
  update writes `user_baselines.configured_hr_zones` (`:662-665`) — a Friel %LTHR table
  (`getFrielZones`, `:560`) when an LTHR anchor is present, else Karvonen %HRR (`getKarvonenZones`,
  `:569`) from max HR + resting HR. `source: 'manual'`, `custom_zones: true` (`:648-659`).
- **Inputs / outputs:** Writes `user_baselines.{performance_numbers, configured_hr_zones,
  weight, height, birthday, gender, units, equipment, disciplines, …}`. Reads `learned_fitness`
  and Arc nudges for the inline "training data suggests" hints.
- **Triggers:** User edits + Save. Also a one-tap "update 5K from training data" path
  (`:452-461`) that writes `performanceNumbers.fiveK` from an Arc-supplied learned-divergence nudge.

### FTP read precedence (`resolveCurrentFtp`)
- **What it does:** Single resolver for "what is the athlete's current FTP," replacing ~8 ad-hoc
  fallback chains.
- **How it works:** `src/lib/resolve-current-ftp.ts` (pure, no I/O). Precedence: (1) learned
  `ride_ftp_estimated` if confidence ∈ {medium, high} → `'learned'`; (2) `performance_numbers.ftp`
  >0 → `'manual'`; (3) any-confidence learned → `'learned-low'`; (4) null. Quality-gated consumers
  reject `'learned-low'`; permissive consumers accept it. Tests: `resolve-current-ftp.test.ts`.
- **Inputs / outputs:** Pure function over already-loaded baselines.
- **Triggers:** Called by `materialize-plan` (`:2605`, rejects `learned-low` `:2606`),
  `compute-workout-analysis`, `send-workout-to-garmin`, `calculate-workload`, `compute-facts`,
  `_shared/athlete-snapshot.ts`, `_shared/infer-training-fitness.ts` (accepts only `'learned'`,
  `:27-33`), `_shared/race-projections.ts`, client `AthleticRecordPage.tsx` /
  `enrichArcGoalTrainingPrefs.ts`.

### Training-fitness tier inference (`infer-training-fitness`)
- **What it does:** Derives `beginner|intermediate|advanced` for plan generation; not stored.
- **How it works:** `_shared/infer-training-fitness.ts:94`. Wizard `beginner`/`advanced` override
  first (`:114-119`, source `wizard_beginner`/`wizard_advanced`). Otherwise a summed score over
  CTL, learned FTP (only if `source==='learned'`), learned run threshold pace (≤258 sec/km), swim
  sessions in 90d, tri race history, training-background regex, intent, structural-load hint
  (`:122-212`); tier at score ≥2 / ≤−2 (`:214`) with comeback/first_race + low-load caps. Swim
  tier via `deriveSwimFitness` (`:250`): `swim_experience` 'learning'→beginner, 'strong'→advanced.
- **Inputs / outputs:** Returns a value consumed at `create-goal-and-materialize-plan/index.ts:1615`
  & `:1814` and `generate-combined-plan/week-builder.ts:1242`. No DB write.
- **Triggers:** Called inline during plan generation.

### Strength baselines & e1RM
- **What it does:** Maintains per-lift strength numbers from both user input and logged sets.
- **How it works:** **User-entered 1RMs** live in `performance_numbers.{squat,bench,deadlift,ohp}`
  (and aliases), read by `materialize-plan/exercise-config.ts:1102-1126 getBaseline1RM` and by
  `strength-equipment-tier.ts:50-67 hasCompound1RMSignals`. **Inferred e1RM** is computed per
  logged set: Brzycki in `compute-facts/index.ts:116-125` (`weight × 36/(37 − effectiveReps)`,
  `effectiveReps = reps + round(rir)`) → `exercise_log.estimated_1rm` (insert `:1724/:1729`) →
  rolled up by `updateLearnedStrengthFromExerciseLog` (`:985-1072`) into
  `user_baselines.learned_fitness.strength_1rms` (`{value, confidence, source:'exercise_log',
  sample_count, last_logged}`). A **second, separate** Epley formula exists in
  `compute-adaptation-metrics/index.ts:94-102` also writing `exercise_log.estimated_1rm`.
- **Inputs / outputs:** Reads `exercise_log` (last 12 wk, `:995-1000`); writes
  `learned_fitness.strength_1rms` (`:1061-1071`). materialize-plan precedence: manual
  `performance_numbers` > `learned_fitness.strength_1rms` > hardcoded defaults
  (`materialize-plan/index.ts:2610-2624`).
- **Triggers:** `compute-facts` (per ingest); `materialize-plan` (per plan bake).

### Equipment tier resolution (`strength-equipment-tier`)
- **What it does:** Resolves `full_barbell | dumbbell_based | bodyweight_bands`.
- **How it works:** `_shared/strength-equipment-tier.ts:181-198`. Barbell capability OR ≥2
  positive compound 1RMs → `full_barbell`; dumbbells → `dumbbell_based`; `commercial_gym` tag →
  `full_barbell`; else `bodyweight_bands`. `equipment_location` (home/commercial) preserved
  separately from capability (`:6-11`). Intent gate: performance intent + `bodyweight_bands` →
  downgraded to `support` (`:382-391`).
- **Inputs / outputs:** Reads `athlete_state.equipment_type` / `baselines.equipment` /
  `performance_numbers`; pure resolver (no write here).
- **Triggers:** Called during plan generation / strength prescription.

### Readiness (residual-stress) thresholds
- **What it does:** Per-target stress ceilings for the readiness engine. NOT HR zones.
- **How it works:** `_shared/readiness-thresholds.ts` — 100% hardcoded population defaults
  (`BASE_THRESHOLDS` `:3-27`), modulated only by plan-phase multipliers (`:29-36`). `readiness.ts
  buildReadiness` is read-only over `session_load`; exponential decay
  `magnitude × exp(−3.0 × hrs / decay_hours)` (`:49-53`).
- **Inputs / outputs:** Reads `session_load`, `workouts`, active plan, `planned_workouts`. No
  baseline writes. No per-athlete override of thresholds exists.
- **Triggers:** `readiness/index.ts` edge function (POST `{user_id, as_of?}`).

### Race-readiness fitness inference
- **What it does:** Predicts race finish from threshold pace → VDOT, adjusted by HR-drift
  durability + confidence.
- **How it works:** `_shared/race-readiness/index.ts`. `resolveThresholdPaceSecPerMi`
  (`:123-185`) precedence: learned `run_threshold_pace_sec_per_km` (`source:'observed'`) → plan
  effort paces → `performance_numbers.threshold_pace` → goal-time fallback (`source:'plan_targets'`).
  Pure function, no storage. Marathon-readiness checklist
  (`_shared/marathon-readiness/index.ts`) is run-distance/volume only with `DISTANCE_DEFAULTS`
  (`:20-27`) as the no-plan fallback.
- **Inputs / outputs:** Reads `workout_facts` (run). No baseline writes.
- **Triggers:** Race-projection / readiness assembly.

### HR-at-power zone seam (`resolveZoneBand`) — cycling only
- **What it does:** Resolves a cycling HR-at-power reference band, designed as the personal-zones
  seam.
- **How it works:** `_shared/state-trend/zones.ts:30-45`. `athlete.personalZones?.[sport]` →
  `source:'personal'`; else Coggan % FTP (`COGGAN_Z2 = {0.56, 0.75} × FTP`, `:22`) →
  `source:'coggan_ftp'`; else `source:'none'`. Today only the Coggan default fires (no
  `personalZones` writer found). Callers: `analyze-cycling-workout`, `_shared/state-trend/*`.
- **Inputs / outputs:** Reads FTP via the resolver; no write.
- **Triggers:** Cycling analysis / state-trend.

### Onboarding / arc-setup wizard (cold-start collection)
- **What it does:** The live onboarding/season-setup surface; collects goals, scheduling,
  intent, strength prefs.
- **How it works:** `src/App.tsx:55` → `ArcSetupPage.tsx` (19-line wrapper) → `ArcSetupWizard.tsx`
  (2951 lines, live). Persistence: "build my plan" → `useArcSetupComplete.ts:106` →
  `persistArcSetup` (`src/lib/arc-setup-persistence.ts:295-397`), which inserts `goals` rows
  (`:329`) and updates/inserts `user_baselines.athlete_identity` (`:364-384`, seeding an **empty**
  `performance_numbers: {}` on insert). `OnboardingProfilePage.tsx` is a separate post-Strava
  "confirm inferred profile" screen (`Connections.tsx:608`) whose only write is
  `athlete_identity.confirmed_by_user = true` (`:52-53`). The conversational `arc-setup-chat` flow
  is referenced as legacy (`arc-setup-persistence.ts:3`).
- **Inputs / outputs:** The only numeric baseline-ish input the wizard collects is `db_max_lb`
  (`ArcSetupWizard.tsx:2305-2320`), which flows into `goals.training_prefs` (`:694`), **not**
  `user_baselines`. FTP/threshold/CSS/1RM fields are read-only hint displays, never inputs.
- **Triggers:** New athlete onboarding; re-run from GoalsScreen / StateTab.

## Edge cases & conditional handling

- **Cold-start FTP — null path (the onboarding gap).** New athlete completes wizard →
  `performance_numbers.ftp` null (wizard never writes it; insert seeds `{}` at
  `arc-setup-persistence.ts:376`), `learned_fitness.ride_ftp_estimated` null (only
  `learn-fitness-profile` writes it, requires ≥3 powered rides). `resolveCurrentFtp` returns
  `{value:null}`. The documented `FTP-COLD-START-SPEC` seeding is **not implemented** (see flags).
- **FTP display fallback = 200W.** `compute-workout-analysis/index.ts:1589` `const ftpForZones =
  userFtp || 200;` — display-only power zones when FTP is null. Not used for planning
  (materialize-plan leaves `baselines.ftp` unset, `:2606-2608`).
- **Swim CSS cold-start = 105 s/100yd.** `generate-combined-plan/swim-protocol-v21.ts:135-139`
  `resolveCssSecPer100Yd` SILENTLY returns 105 when CSS missing/invalid (valid window
  40<sec<600). `hasValidSwimThresholdPace` (`:154`) exposes the missing state so session copy can
  drop to the §7.5 RPE cue instead of a fabricated numeric target.
- **Learned-FTP quality gate split.** `materialize-plan/index.ts:2606` accepts `learned`/`manual`
  but rejects `learned-low`; `infer-training-fitness.ts:27-33` accepts ONLY `learned`. Same stored
  value is trusted differently per consumer by design.
- **FTP ratchet floor.** `learn-fitness-profile/index.ts:329-344` keeps prior FTP only when the
  new value is both lower AND lower-confidence; a real decline at equal/higher confidence still
  writes. No-op on insert.
- **Insufficient history per discipline.** <3 runs/rides → all-null metrics written for that
  discipline (`:459-468`, `:697-704`); `learning_status='insufficient_data'`, `workouts_analyzed=0`
  but the row still upserts. <3 usable swims → swim pace null but prior value carried forward
  (`:325-327`).
- **Band-empty HR fallbacks (low confidence).** When no efforts fall in a %-of-max band:
  run threshold `0.88×max` (`:541-549`), run easy `0.70×max` (`:583`), ride threshold `0.90×max`
  (`:798-806`), ride easy `0.70×max` (`:867`) — all `confidence:'low'`, only fire once ≥3 workouts
  exist (need an observed max HR).
- **User-confirmed identity never overwritten.** `learn-fitness-profile/index.ts:346-350` skips the
  identity write when `athlete_identity.confirmed_by_user === true`.
- **Manual HR zone model selection.** TrainingBaselines: Friel %LTHR when an LTHR anchor exists,
  else Karvonen %HRR if max HR + resting HR known, else no zones (`getHRZones` `:582-586`). Resting
  HR uses manual override → Garmin value → none; never guessed (`getRestingHR` `:596-604`). Manual
  zones default `restingHR = customRestingHR || garminRestingHR || 60` at save (`:630`).
- **Analyzer HR-zone precedence.** `analyze-running-workout/index.ts:992-1018`: (1)
  `configured_hr_zones.zones` if ≥4 ordered bands; (2) Friel %LTHR from learned threshold HR; (3)
  undefined. Validity check `z1Max>0 && z2Max>z1Max && …` (`:1003`).
- **RIR ≥5 e1RM divergence.** Epley path (`compute-adaptation-metrics:98`) returns null for
  `avgRir≥5` (Q-039); Brzycki path (`compute-facts`) folds RIR into reps instead. The two formulas
  can disagree on the same row.
- **Age-based HR estimate exists but unused for zones.** `getAgeBasedHREstimates`
  (TrainingBaselines `:535`, `maxHR=220−age`, `thresholdHR=0.88×maxHR`) — display helper; not the
  zone source.
- **Pace-unit divergence (footgun).** `learned_fitness` run paces are sec/km;
  `performance_numbers.fiveK_pace` is sec/mi; race-readiness converts learned km→mi
  (`race-readiness/index.ts:128`). Per CLAUDE.md the Arc deliberately exposes both with a
  `_unit_note`.
- **Marathon-readiness no-history.** Returns `null` when no run facts in the 6-wk window
  (`marathon-readiness/index.ts:97-99`); otherwise plan peak numbers win over `DISTANCE_DEFAULTS`.
- **Readiness degraded modes.** No `session_load` → `degraded_reason='no_load_data'`
  (`readiness.ts:315-320`); no active plan → early return with `no_plan_context` (`:413-415`); 96h
  window falls back to 14d (`:296`). No synthetic default-athlete baseline.
- **Equipment cold-start.** `normalizeEquipmentTier3(unknown)` → `dumbbell_based`
  (`strength-equipment-tier.ts:166`); empty inputs to `resolveStrengthEquipmentTier3` →
  `bodyweight_bands` (`:197`).

## Redundancies / duplication (observed, not judged)

- **Two e1RM formulas.** Brzycki (`compute-facts/index.ts:116-125`, feeds
  `learned_fitness.strength_1rms`) and Epley (`compute-adaptation-metrics/index.ts:94-102`), both
  writing `exercise_log.estimated_1rm`. ENGINE-STATE notes the Epley/adaptation path is dormant
  (Q-041) but it still exists in code.
- **HR-zone math implemented in multiple places.** TrainingBaselines client (`getFrielZones`
  `:560`, `getKarvonenZones` `:569`) and the run analyzer's inline Friel %LTHR
  (`analyze-running-workout/index.ts:1010-1014`) both derive zones from a threshold/LTHR anchor,
  with different coefficients (client Friel Z1≤0.85×LTHR; analyzer Z1≤0.75×thr). The cycling power
  zones in `getPowerZones` (`:607`) and the Coggan band in `state-trend/zones.ts` are separate
  again.
- **Strength 1RM read field-aliasing repeated.** `materialize-plan/index.ts:2617-2622`,
  `materialize-plan/exercise-config.ts:1109-1123`, and `strength-equipment-tier.ts:50-67` each
  independently read `performance_numbers.{squat|squat1RM|squat_1rm, bench|bench_press|…}` aliases.
- **Threshold-pace resolution exists in ≥2 forms.** `resolveThresholdPaceSecPerMi`
  (`race-readiness/index.ts:123`) and the learned `run_threshold_pace_sec_per_km` consumers in
  `infer-training-fitness.ts:151` each re-resolve "current threshold pace" with their own
  precedence and units.
- **FTP `|| 200` and `|| learnedFtp` fallbacks coexist with the central resolver.**
  `compute-workout-analysis:1589` and TrainingBaselines `:1249` (`manualFtp || learnedFtp`) bypass
  `resolveCurrentFtp`'s confidence logic for display.

## Discrepancies & flags (for human review)

- **THE ONBOARDING GAP (confirmed).** A new athlete with no history finishes onboarding with
  **null FTP, null run threshold pace, null CSS** in both `performance_numbers` and
  `learned_fitness`. The wizard collects none of these as inputs (only `db_max_lb` → goal prefs),
  and `learn-fitness-profile` only writes once ≥3 workouts of a type exist.
  - `docs/FTP-COLD-START-SPEC.md` specifies the fix (W/kg-tier × bodyweight × 0.90, stored as
    `learned_fitness.ride_ftp_estimated {confidence:'low', source:'wizard_estimated'}`) but **it is
    not implemented**: `grep -rn "wizard_estimated"` over `src/` and `supabase/` returns **zero
    code hits** (only docs: FTP-COLD-START-SPEC, DECISIONS-LOG:1937, ENGINE-STATE:369).
    ENGINE-STATE D-077 (`:369`) records the spec as "saved for future wizard FTP seeding work." So
    the spec's four "Files touched" do not contain the seeding code, and the spec's Q3 assumption
    ("weight already in the wizard") is false — the wizard collects no body weight.
  - Runtime consequence at Week 1 for a cold-start athlete: FTP display falls to `200`
    (`compute-workout-analysis:1589`), swim duration math falls to CSS 105 s/100yd
    (`swim-protocol-v21.ts:138`), run targets drop to effort/RPE, and plan materialization leaves
    `baselines.ftp` unset (`materialize-plan:2606-2608`). No crash; silently un-personalized.
- **`analyze-user-profile` appears dead.** `supabase/functions/analyze-user-profile/index.ts` is a
  65-line validation-only stub (no DB I/O, computes no baselines). Grep finds no caller in source.
  Reachability unclear from code.
- **Two e1RM formulas can disagree** (Brzycki vs Epley) on the same `exercise_log.estimated_1rm`
  row — see Redundancies. Worth confirming the dormant Epley path can't write over the live
  Brzycki value.
- **Readiness thresholds have no personal-override path.** Every athlete uses the same hardcoded
  `BASE_THRESHOLDS` (`readiness-thresholds.ts:3-27`), modulated only by plan phase. This contradicts
  the "respect the athlete's own data" principle in `SPEC-personal-zones-outlier-detection.md` for
  the readiness surface specifically (the spec's `resolveZoneBand` seam covers cycling HR-at-power,
  not readiness stress thresholds).
- **`resolveZoneBand` personal-zones seam has no writer.** `personalZones` is read
  (`state-trend/zones.ts:36`) but no code path writes it; the outlier-detection / personal-zone
  feature in `SPEC-personal-zones-outlier-detection.md` is seam-only, unimplemented. There is no
  analogous personal-zone resolver for **run HR** (TrainingBaselines `configured_hr_zones` is the
  closest thing, and it is manual-only).
- **Readiness type drift.** `readiness.ts` writes energy entries with field `trend_7d` (`:383`)
  while `readiness-types.ts:29` declares `trend_7d_pct`. Cosmetic/unverified shape mismatch.
- **Body weight is never collected for FTP estimation.** Even if the cold-start seeding were
  implemented, the W/kg formula needs weight, which the wizard does not gather (`saveUserBaselines`
  writes `weight` only from the Training Baselines screen, not the onboarding wizard).
- **`OnboardingProfilePage` vs `ArcSetupWizard` vs `ArcSetupChat`.** Three onboarding-adjacent
  surfaces coexist; only `ArcSetupWizard` is the live baseline-relevant collector. `ArcSetupChat`
  is referenced as legacy. Confirm none of the dormant ones are still routed in some flow.

## Cross-references

- `docs/FTP-COLD-START-SPEC.md` — spec for cold-start FTP seeding; **unimplemented** (this audit).
- `docs/SPEC-personal-zones-outlier-detection.md` — personal-zones / `resolveZoneBand` seam; seam
  exists (cycling), feature unimplemented.
- `docs/WIZARD-AUDIT.md` — step-by-step wizard UX audit; corroborates that the wizard collects no
  FTP/CSS/threshold inputs.
- `docs/PHASE-1-RUN-PACE-SPEC.md`, `docs/PACE-AT-HR-TREND-SPEC.md` — run pace / pace-at-HR learning
  (consumers of `learned_fitness` run paces).
- `docs/ENGINE-STATE.md` — D-077 (cold-start spec saved, not built, `:369`), D-111 (FTP ratchet
  floor), D-118 (RIR-aware e1RM), Q-039/Q-040/Q-041 (e1RM / RIR / dormant adaptation path).
- `docs/DECISIONS-LOG.md` — `resolveCurrentFtp` 3-tier precedence (2026-05-13), D-085 (FTP→power
  zones routed through resolver).
- CLAUDE.md — "Pace-unit footgun" (sec/km vs sec/mi); four storage layers; secondary state list
  including `user_baselines.{performance_numbers, athlete_identity, learned_fitness}`.
- Audit cross-area: `02-analyzers.md` (HR-zone consumption in analyzers, e1RM in compute-facts),
  `03-spine-snapshot.md` (`athlete-snapshot` reads of FTP), `04-planning.md` (materialize-plan FTP
  /1RM gates, CSS fallback), `05-compute-contracts.md` (compute-facts strength rollup).
