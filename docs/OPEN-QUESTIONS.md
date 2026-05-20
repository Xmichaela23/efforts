# Open Questions

Behaviors that look like bugs but might be intentional, or are deferred for a deliberate reason. The point of this doc is to **prevent re-litigation**: when a future session notices one of these and starts to "fix" it, this doc explains why someone already considered it and chose to leave it.

Numbered Q-001, Q-002, … in order of recording. Each entry is tagged with status:

- **cosmetic** — visible but not functionally wrong; user-facing impact is negligible.
- **intentional** — the current behavior is the design call (often paired with a D-NNN decision entry).
- **unverified** — believed correct but never explicitly tested; verification approach noted.

---

## Q-001 — Mon swim+upper renders swim above upper on weekly view

- **Status:** cosmetic
- **Why it exists:** for a strength_first hybrid athlete, the Monday swim+upper stack renders swim above upper in the weekly plan-overview view. The `computeDayTimings()` helper assigns the same AM/PM rank to both (no AM/PM ordering for swim+upper pairings — see D-006), so the discipline-rank tiebreaker takes over (swim=0, strength=3) and swim sorts first.
- **Why not a bug:** §6.1 of `docs/STRENGTH-PROTOCOL.md` only mandates AM/PM sequencing for run+lower interference, which has the real training-science weight (Wilson 2012 ES≈0.94 for running, ≈0.32 for cycling). Swim+upper has trivial physiological interference; ordering is purely visual preference.
- **What "fixing" would require:**
  - Extend `computeDayTimings()` to assign distinct AM/PM ranks to swim+strength pairs based on the athlete's `strength_ordering_preference`.
  - Justify it on training-science grounds (you can't, today — the literature doesn't establish meaningful interference).
  - OR add a "training-priority preference" question to the wizard that sets visual ordering for all stacks regardless of physiological interference.
- **Cross-ref:** D-006.

---

## Q-002 — 14+ hour athletes get a "12-14" tier prescription

- **Status:** intentional
- **Why it exists:** an athlete who declares "14+ hours" with `strength_intent='performance'` actually needs to declare ≥15.5hr to land in the matrix's `14+` tier. At declared = 15hr: 15 - (2 strength × 0.75hr) = 13.5hr endurance → tier `12-14`. Card preview reflects this correctly (per the wizard reactive card, commit e242bec6).
- **Why not a bug:** Option B endurance-hours deduction (D-001) is correct math — it's removing strength wall-clock from the endurance-only tier lookup. The "14+ tier" matrix cell is labeled by *endurance* hours, not declared hours. An athlete training 15hr/week with 1.5hr of that being strength has 13.5hr available for swim/bike/run, which IS the 12-14 tier prescription.
- **What "fixing" would require:**
  - Either change the wizard to surface tier labels as **endurance** hours rather than total declared hours, OR
  - Refactor the matrix to use total-hours brackets and bake the deduction into per-cell prescriptions.
  - Both are wizard copy / UX decisions, not engine bugs.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 3 finding #1.

---

## Q-003 — §6.1 scoping verification (protocol vs load gate)

- **Status:** unverified
- **Why it exists:** `docs/STRENGTH-PROTOCOL.md §6.1` frames "heavy Lower" as a load-magnitude qualifier (Strength Build 78-85%, M+P 70-75%, Rebuild 72-80%, with sub-maximal Hypertrophy/Deload getting relaxed adjacency). The implementation may scope it instead to performance-protocol phase **names**. If so, durability MS phase Lower (also 75-85% × 6-10 reps, equivalent load) would not get the same protective adjacency rules.
- **Why not necessarily a bug:** the load profiles are equivalent but the protocols differ in goals — durability athletes treat strength as expendable per the protocol contract. May be OK to have looser adjacency for durability MS Lower if the athlete is not optimizing for strength PRs.
- **What "fixing" would require (or verifying it's already correct):**
  - Read `_shared/week-optimizer.ts` heavy-Lower classifier.
  - Trace whether it reads protocol name or load magnitude.
  - If protocol-gated: decide whether to extend to durability MS, OR document this as intentional (durability athletes accept the looser adjacency by virtue of the support intent).
- **Estimated time:** ~30 minutes verification.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 1 question item, ENGINE-STATE.md "Questioned".

---

## Q-004 — Full IM §3.7 race-spec strength scaling verification

- **Status:** unverified
- **Why it exists:** per `docs/STRENGTH-PROTOCOL.md §3.7`, Full IM athletes in race-specific phase should get **1× upper-only at maintenance load**, with halved power volume and no depth jumps. Race-spec frequency: 1 (vs 2 for 70.3). Build phase: 1-2. Commit cf5867fa claims "v2.1 close-out — Full IM scaling" but the implementation is not verified by static read.
- **Why not necessarily a bug:** the commit message asserts the behavior was implemented; no evidence of regression has surfaced. May simply need confirmation rather than a fix.
- **What "fixing" would require (or verifying it's already correct):**
  - Read `_shared/strength-profiles.ts` (or wherever distance-aware session-factory branching lives).
  - Confirm race-distance × phase branching exists for the §3.7 Full IM path.
  - If absent: add the modifier (multi-file scope, would warrant its own ticket).
- **Estimated time:** ~30 minutes verification.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 4 question item, ENGINE-STATE.md "Questioned".

---

## Q-005 — `scaledWeeklyTSS` reads declared hours

- **Status:** intentional (deferred), known issue
- **Why it exists:** Plan #60 W6 build week landed at 11h55m vs 11hr budget — 24min over after the §2.1 swim drop. Frequency matrix correctly drops a swim slot, but `scaledWeeklyTSS()` reads declared hours (11hr) not endurance-adjusted (9.5hr), so TSS budget remains at the 10-12 tier (~700-800 build TSS). Remaining sessions absorb the freed TSS and grow longer.
- **Why not a blocking bug:** 24min/week overflow is below the ship-blocking threshold. Compounds across 12 build/peak weeks but doesn't violate any hard contract. Fix is straightforward (plumb `endurance_hours` out of `computeSessionFrequencyDefaults` as a new field, pass to `scaledWeeklyTSS`) but was scoped out of the §2.1 ship to keep that commit reviewable.
- **What "fixing" would require:**
  - Add `endurance_hours: number` to the `SessionFrequencyDefaults` interface.
  - Set it from the existing local `enduranceHours` value in `computeSessionFrequencyDefaults`.
  - Read it in `week-builder.ts:~674` and pass to `scaledWeeklyTSS()` in place of `weekly_hours_available`.
- **Predicted effect:** TSS budget scales to 8-10 tier (~550-650 build TSS), session durations shorten proportionally, hybrid 11hr athlete lands at ~11h flat instead of 11h55m.
- **Cross-ref:** ENGINE-STATE.md "Known broken", `docs/POLISH-PUNCH-LIST.md §4`.

---

## Q-006 — Athlete declares "learning swim" but has high CTL → intermediate, not beginner

- **Status:** intentional (per D-002). **Partial mitigation shipped 2026-05-19** — see Cross-ref.
- **Why it exists:** wizard `swim_experience='learning'` adds a soft `score -= 1` to `inferTrainingFitnessLevel`. For an athlete with high CTL (+2) and learning swim (-1), the net score is +1 → intermediate. This athlete will not land at the beginner-tier swim volume bands.
- **Why not a bug:** see D-002. A masters athlete with strong CTL who declares "learning swim" should get **swim** training that reflects their swim level, not a global down-shift that also affects bike/run defaults via the CTL fallback. The soft signal is bounded by score thresholds — it kicks the borderline / low-other-signal cases into beginner where it should, and leaves the strong-elsewhere cases at intermediate where they should be. The protective effect targets the population the cap was designed for.
- **What "fixing" would require:**
  - Either replace the soft signal with a hard clamp (rejected per D-002; would over-clamp strong athletes), OR
  - Add a separate `swim_fitness` tier that overrides `training_fitness` only for swim-specific decisions, leaving global inference untouched. Multi-file scope; out of the original Phase 3 budget. May be the right next step if Q-006 surfaces complaints from real athletes.
- **Partial mitigation (2026-05-19):** swim arc Slice 3d (`f53bbf34`) added §6.3 fitness-tier biasing in `pickSwimDrillInset` — beginner-tier athletes get foundation-drill bias (catchup/fingertipdrag/singlearm/616). The Q-006 athlete still resolves to `intermediate` for global training_fitness, but the swim picker itself now has *some* swim-specific tier protection independent of `training_fitness`. The Q-006 fix-shape ("separate `swim_fitness` tier") remains the proper structural fix — Slice 3d is a partial mitigation, not a substitute.
- **Cross-ref:** D-002; `docs/TICKET-B-WIRING-AUDIT.md` Phase 3 implementation log; swim arc D-020 (Slice 3d, `f53bbf34` — partial mitigation via picker-side tier biasing). Note: the swims90 null-arc fix (2026-05-20, `3b228dc8`) does NOT affect Q-006 — that fix targets the `swims90 ≤ 1` branch at `:157-165`, separate from the `wizard_swim_experience_learning` branch at `:186-190` Q-006 describes.

---

## Q-007 — Cycling TREND historical `avg_hr` resolves null (HR line never draws)

- **Status:** RESOLVED 2026-05-17 (`4177c05c`).
- **Why it existed:** the `pwr20`/`np_trend` historical loop read only `r.computed.overall.avg_hr`, frequently null (set only from an `hr_bpm` sample series); the loop SELECT didn't fetch the reliable `workouts.avg_heart_rate` column. All historical TREND points got `avg_hr: null` → `TrendSparkline`'s `hasHr (≥3)` gate failed → the dashed HR line never drew (label still showed current-ride bpm).
- **Resolution:** added `avg_heart_rate` to the loop SELECT; `hrH` now resolves `computed.overall.avg_hr ?? workout_analysis.fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate` (each candidate guarded individually so a stored 0/null falls through — `Number(null)===0`). Same SELECT-projection class as the `normalized_power_w`/`achievements`/`elevation_gain` fixes. Wide backfill verified: **26/26 rides with a TREND series now have ≥3 HR points** → the dashed line draws on every one.
- **Cross-ref:** `docs/ENGINE-STATE.md` (resolved); `docs/SESSION-CONTEXT.md` §6.

---

## Q-008 — Type-filtered `pwr20_trend_v1` needs a historical re-analysis backfill

- **Status:** RESOLVED 2026-05-17 — one-off script, run wide.
- **Why it existed:** `pwr20_trend_v1` is filtered to rides whose **stored** `classified_type` matches the current ride's. After the VI-gate classifier change, recomputing one ride re-derives only that ride's type; historical rides keep their stale stored type until they too are re-analyzed. So a single recompute can't reach the ≥3-same-type threshold and the series stays null.
- **Resolution:** one-off script over recent rides (not a triggered job). `scripts/verify-cycling-vi-if-fix.mjs --all` (committed `fae293e7`, `--all` mode `83d07fdb`) replays the full recompute chain via the service-role token, re-deriving every stored `classified_type`. Wide run 2026-05-17 (180 d, 30 rides, 0 failed, 26/26 cap-present consistent): 16 historical rides went `null → type`; post-backfill distribution = recovery 6 / threshold 6 / climbing 6 / endurance 5 / tempo 4 (all ≥3, pwr20-eligible) / vo2 2 / sweet_spot 1, **zero null**. vo2/sweet_spot below 3 only because the athlete logged few such rides — not a backfill gap.
- **Cross-ref:** `docs/SESSION-CONTEXT.md` open item #2 (closed); D-015 (VI/IF-source) + D-016 (elevation-source), the classifier-input fixes this backfill propagated.

---

## Q-009 — Race-course segment matching: GPS-track matcher vs "Strava-only segment intelligence"

- **Status:** blocked on a product decision (Build Order #8).
- **Why it exists:** #8 needs course-segment geometry extracted from race-course GPX (Data-Dependency ❌); it was not among the decisions that unblocked #6. The doc itself flags the Garmin GPS-track matcher as the "highest-leverage open question." The forward hook (`cycling_segment_history.race_course_relevant`) is in place.
- **Open question:** build the GPS-track matcher (universal, larger) or accept "segment intelligence is a Strava-connected feature" as a permanent product boundary? Decide before #8 proceeds — do not fabricate a name-match heuristic.
- **Cross-ref:** `docs/CYCLING-ANALYSIS-DESIGN.md` Primary Constraint; `docs/SESSION-CONTEXT.md` open item #3.

---

## Q-010 — EFFICIENCY/POWER dashboard rows keep technical jargon (inconsistent with plain-language INSIGHTS)

- **Status:** intentional (deferred) — cosmetic, not urgent (user-flagged "future pass" 2026-05-17).
- **Why it exists:** the 2026-05-17 plain-language brief deliberately scoped the jargon translation to **INSIGHTS only**; the dashboard rows in `_shared/session-detail/build.ts` stay technical by design — POWER `"178W normalized power at IF 1.01"` (`build.ts:~474`), EFFICIENCY `"EF 1.214 · 1.3% HR decoupling"`. With INSIGHTS now plain-language, the rows read inconsistently beside it.
- **Why not a bug:** product-confirmed dashboard rows may be more technical than the narrative; the values are correct — purely a stylistic inconsistency a future session might "fix" not knowing the INSIGHTS-only scope was a deliberate boundary.
- **What "fixing" would require:** soften the POWER/EFFICIENCY row builders in `_shared/session-detail/build.ts` (terser than INSIGHTS — rows are scannable, not prose; e.g. "178 W · ~threshold", "HR held +1.3%"). workout-detail-only, no backfill (rows rebuild per request). Related minor polish: the INSIGHTS closing clause can hedge ("suggests you're in an active recovery or base-building phase rather than a formal taper") — an anti-speculation prompt line would tighten it; substantive, not a guard-worthy defect, so not added to the 3-guard stack.
- **Cross-ref:** `docs/SESSION-CONTEXT.md` §6 (cosmetic-deferred); `docs/POLISH-PUNCH-LIST.md` cycling Open (P3).

---

## Q-011 — Brick bike legs are NOT auto-extended to the long-ride floor (hard enforcer excludes bricks by design)

- **Status:** intentional (regression-guarded). Filed as "Bug 4 — Brick-as-long-ride validator"; the user-visible defect was fixed 2026-05-12, the residual is deliberate.
- **Why it exists:** `generate-combined-plan` has two long-ride-floor surfaces. The SOFT volume warning (`validate-training-floors.ts` `maxLongRideMinutes`, ~386-402) **does** count a brick's bike leg toward long-ride durability — fixed 2026-05-12 (race-prep weeks replace the standalone `long_ride` with a brick; brick bike ≥ floor → no false "no long ride scheduled (observed=0)" warning; bike leg only — the ≤25 min run-off is transition stimulus). The HARD enforcer (`findLongRideSessionInWeek`, ~512-523, used by `enforceLongDayFloors`) **deliberately skips brick-tagged sessions** (`if (tags.includes('brick')) continue;`).
- **Why not a bug:** the two surfaces answer different questions and are consistent under the design intent — *"did the athlete get long-ride durability volume?"* (yes, the brick bike counts) vs *"is there a standalone `long_ride` session to mutate up to floor?"* (a brick is a distinct stimulus and must not be force-extended; brick durability has its own dynamics). The exclusion is **test-encoded** (`long-day-volume-floors.test.ts:603-615` asserts a 90-min brick bike is not bumped) and **regression-guarded** (`rebuild-phase.test.ts:473-485` — `BRICKS_PER_WEEK['rebuild']=0` exists *because* the enforcer skips bricks; the comment calls the exclusion "correct"; reversing it reintroduces the "week-16 long ride 1.8h instead of 2.5h" regression unless that workaround is kept).
- **What reversing it would require (do NOT do casually):** invert/remove the two tests above, re-evaluate `BRICKS_PER_WEEK['rebuild']=0`, and make a training-science call on whether brick bike legs should be auto-lengthened (currently not, by design). That is a deliberate design change warranting a D-NNN that supersedes this entry — not a bug fix.
- **Note:** the fatal/hard path has **no long-*ride* volume floor at all** (only long-*run* TSS share + WoW raw-TSS ramp). The punch-list's "build/race weeks fail floor checks" framing was inaccurate — bricks never failed a hard long-ride floor because none exists. A net-new hard long-ride floor would be separately-scoped feature work, not Bug 4.
- **Cross-ref:** `supabase/functions/generate-combined-plan/validate-training-floors.ts`; tests `long-day-volume-floors.test.ts`, `rebuild-phase.test.ts`; `docs/POLISH-PUNCH-LIST.md` (Bug 4, closed).

---

## Q-012 — Easy run + Lower strength renders Strength-before-Run regardless of `strength_ordering_preference` (deload Thursdays)

- **Status:** intentional (paired with D-006). Surfaced 2026-05-18 as "calendar ordering fix failing on Week 8 deload (Jul 6–12)"; read-only diagnosis confirmed the fix is correct and the ordering is the engine's own rule.
- **Why it exists:** on a deload (or any easy) week, the same-day Lower-strength + run pair has an **easy** run, not a quality/interval run. `decideOrdering()` (`src/lib/pairing-timing.ts:94-96`) returns `{ lowerOrdering: 'AM', partnerOrdering: 'PM' }` for the `easy_run`/`easy_bike` partner kinds **before** the `strength_ordering_preference` check at `:97-98`. So for an easy partner the preference is intentionally not consulted: Lower sorts AM, easy run PM → the calendar cell shows Strength above Run even for an `endurance_first` athlete. Build-week Thursdays render Run-first only because their run is `quality`/`vo2max`/`intervals` → it routes to the preference-*sensitive* branch (`endurance_first` → partner AM, Lower PM).
- **Why not a bug:** this is the recovery-flush training-science call — lower-body strength first, then the easy run as an aerobic flush after it (rationale at `pairing-timing.ts:81-88`; `docs/STRENGTH-PROTOCOL.md §6.2/§6.5`). The client helper is a deliberate mirror of the server's `decideOrdering` (`supabase/functions/_shared/week-builder.ts:1997-2012`), so calendar and engine agree. The 2026-05-18 read-only diagnosis ruled out every wiring suspect for the deload symptom: `events.find(e => e?._src?.training_plan_id)` resolves correctly (active plan `cb0ccb6e…` → goal `8b59fc50…` → `strength_ordering_preference = "endurance_first"`); `_src` is fully populated on deload events (same `toPlannedWorkout` shape as build weeks); `planned_workouts` has no `workout_metadata`/`timing` column so the `timingRank` fallback is never exercised; every day cell goes through `orderDayWorkoutsByTimingThenDiscipline`. The calendar fix (`2ba6c68b`) is faithfully rendering the rule — not regressing it. `endurance_first` correctly does **not** override the recovery-flush ordering for easy partners.
- **What reversing it would require (do NOT do casually):** make the `easy_run`/`easy_bike` branch of `decideOrdering()` consult `strength_ordering_preference`. That reverses the recovery-flush rationale on **both** the client (`src/lib/pairing-timing.ts:94-96`) **and** the server (`supabase/functions/_shared/week-builder.ts:1997-2012` / `decideOrdering`) — it is **not** a client-only / calendar change — and it is a training-science decision that supersedes D-006's pairing logic, so it warrants a new D-NNN, not a bug fix. Note the related, still-unreconciled drift flagged in `CLAUDE.md` → "Known doc/code drifts": `.cursor/rules/lower-body-strength-pairing.mdc:13-16` lists easy run as an allowed Lower partner while the code same-day matrix says `lower_body_strength × easy_run = 0`; `docs/SCHEDULING-RULES.md §8` resolves via conditional ⚠¹. Reconcile that drift in the same pass if this is ever reopened.
- **Cross-ref:** D-006; `src/lib/pairing-timing.ts:81-99`; `supabase/functions/_shared/week-builder.ts:1997-2012`; commit `2ba6c68b` (calendar wiring — confirmed correct, not the cause); `docs/STRENGTH-PROTOCOL.md §6.2/§6.5`; `CLAUDE.md` "Known doc/code drifts" (the cursor-rule easy-run drift); Theme B Slice 5 (`20d22e63`, 2026-05-19) — the dropped B-4 fixture re-verified that `decideOrdering` does not consume `integration_mode`, structurally guaranteeing Q-012's carve-out at the code level (see commit log and `CONSOLIDATED-MODE.md §8` Q-012 row).

---

## Q-013 — Dead inner `if (stacking)` block in `week-optimizer.ts` non-co-equal branch (~:1755) — left in place by design

- **Status:** intentional (deferred cleanup, paired with D-018). Zero runtime effect — the block is provably dead.
- **Why it exists:** Slice 2 (`1fff344b`, 2026-05-18) deleted only the duplicate QR+lower consolidation `trade_offs.push` inside this block (surgical/symmetric with the live co-equal-2× site at `:1604`). The block's guard `const stacking = qualityRunDay === lowerDay && isPerf && isCoEq;` (~`:1747`) requires `isCoEq === true`, but the enclosing branch is the `else` of `if (strengthFreq >= 2 && isCoEq)` (`:1460`) further gated by `if (strengthFreq >= 2)` (`:1687`) — only reachable when `isCoEq === false`. `isCoEq` true ∧ false ⇒ `stacking` is always false here; the entire inner `if (stacking) { … }` (the now-commented push AND the pin-divergence push it wraps) never executes.
- **Why not a bug / why left:** removing dead code was deliberately out of Slice 2's scope (one concern per slice; the user chose "surgical, symmetric only" over "also remove the full dead block"). It has no runtime effect, so leaving it is safe; bundling a larger excision would have entangled dead-code cleanup with the duplicate fix and enlarged the diff.
- **What "fixing" (excising) would require:** re-confirm the `isCoEq` mutual-exclusion still holds (the `:1460`/`:1687`/`:1747` chain), then delete the inner dead `if (stacking) { … }` block (guard + commented push + the pin-divergence push it wraps), preserving the live surrounding `if (lowerDay)` placement / `place(...)` logic. A future refactor of the non-co-equal lower placement is the natural time.
- **Cross-ref:** D-018; ENGINE-STATE Solid "Bug 1 Piece B — trade-off consolidation duplicate (Slices 1 & 2)"; Slice 2 commit `1fff344b`; the live twin at `week-optimizer.ts:1604-1606`.

---

## Q-014 — `computed.swim_equipment_suggested` is incomplete on non-`pull_focused` sessions that contain pull-buoy drills — redundant channel, primary path covers it

- **Status:** intentional (don't fix). Surfaced 2026-05-19 during the Phase 2 §6.2 drill-pool spec-compliance work (`ef91c2ee`). Read-only audit traced consumers across `src/` + `supabase/`.
- **Why it exists:** `materialize-plan/index.ts:1349-1393` `inferSwimEquipmentPack` derives the session-level `computed.swim_equipment_suggested` field from `row.tags` only (`req:buoy`, `req:board`, `optional:snorkel`, …). Those tags are emitted by `session-factory.ts` for `pull_focused` (`:936` → `req:buoy`) and `kick_focused` (`:878` → `req:fins`/`req:kickboard`) sessions, but **not** for `threshold`/`css_aerobic`/`technique_aerobic` sessions whose drill inset can rotate in pull-buoy-required drills (`swim_drills_4x50yd_scull`, `_scullfront`). Result: server-side `swim_equipment_suggested` omits `'buoy'` for those sessions even though one of their drill steps needs one.
- **Why not a bug — three downstream paths, none broken:**
  - **Garmin export** (`send-workout-to-garmin/index.ts`): zero references to `computed.swim_equipment*`. Garmin sees per-step `step.equipmentType` only, populated by `materialize-plan/index.ts:1790-1794` `inferEquipFromDrillName` which has an explicit `/scull/ → 'buoy'` branch. Per-step `SWIM_BUOY` works.
  - **Form goggles export** (`src/utils/formGogglesSwimScript.ts`): zero references. Form reads `st?.equipment` per step → `formatEquipment('buoy')` → `'Pull buoy'` appended to the drill step's description. Per-step works.
  - **In-app `PlannedWorkoutSummary` / `AllPlansInterface` "Bring" chip**: consumes `swimPlannedEquipmentFromWorkout` (`src/lib/plan-tokens/swim-drill-tokens.ts:429`), which at `:457-463` independently aggregates equipment from `workout.steps_preset` via `swimDrillEquipmentFromTokens(...)` → `DRILL_EQUIPMENT_MAP` **before** reading `computed.swim_equipment_suggested`. The client-side aggregator covers the gap regardless of whether the server-side field is complete.
- **What "fixing" would require — and why it's not worth doing:** wire `swimDrillEquipmentFromTokens` into `inferSwimEquipmentPack` so `computed.swim_equipment_suggested` reflects all drill-token-implied equipment, not just `req:*`/`optional:*` tags. Pure belt-and-suspenders: zero athlete-visible behavior change because (a) Garmin/Form don't read the field at all, and (b) the only in-app reader already derives the same data from `steps_preset` independently. Cost: enlarges the diff and creates a second derivation site for the same data, increasing drift risk.
- **Cross-ref:** Phase 2 commit `ef91c2ee` (added scull/scullfront to build pool, triggered the audit); `src/lib/plan-tokens/swim-drill-tokens.ts:398` (`swimDrillEquipmentFromTokens` — the correct DRILL_EQUIPMENT_MAP-aware aggregator, used by the in-app aggregator but NOT by the server-side field); `materialize-plan/index.ts:1349-1393`, `:1790-1794`; `send-workout-to-garmin/index.ts:925-931`; `formGogglesSwimScript.ts:99-101`.

---

## Q-015 — §6.3 "never repeat across consecutive sessions" relies on rotation salts, not recent-pick memory — accepted collision risk (Phase 3 Slice 3c deferred)

- **Status:** intentional (Phase 3 Slice 3c, deferred 2026-05-19). Scoped out of Phase 3 to ship the spec-compliant picker faster.
- **Why it exists:** `pickSwimDrillInset` (`src/lib/plan-tokens/swim-drill-tokens.ts:242`) rotates the eligible pool via `(planWeek * 3 + salt) % n` where `salt = drillSlotSalt + SWIM_DRILL_KIND_SALT[sessionKind]`. Different session kinds within a week get distinct salts (easy=0, css_aerobic=5, threshold=11), and the `*3` factor distributes the start index across weeks. But there's no tracking of recently-emitted drills — at adversarial salt × pool-size combinations, the same drill can re-appear across consecutive weeks for the same session kind.
- **Why not blocking:** pool sizes post-Phase 2 are 9 (base) / 8 (build) / 4 (peak) / 2 (taper). Collisions are infrequent in practice, and the cost is one occasional repeat — not a training-quality issue, just a §6.3 variety-rule whisper. The peak/taper pools are small enough that some repetition is unavoidable regardless.
- **What "fixing" would require (Slice 3c, deferred):** thread `prevWeekDrillTokens` through `buildWeek` options (the same in-memory pattern as `phaseBlocks`); have `pickSwimDrillInset` drop tokens that appear in the previous week's drill set before salt-rotation. Zero schema impact. Limitation: doesn't survive partial rebuilds or single-week regenerations — but those are rare. Locked posture (if picked up): **in-memory per-build** (the user's explicit preference 2026-05-19 over a persisted `planned_workouts.computed` field).
- **Cross-ref:** Phase 3 Slice 3a commit (this commit's hash); `src/lib/plan-tokens/swim-drill-tokens.ts:212` (`pickFirstDrillFittingBudget`), `:242` (`pickSwimDrillInset`); `docs/SWIM-PROTOCOL.md §6.3`.

---

## Q-016 — §2 drill/swim ratio scaling (drill yardage by intent × experience) not implemented (Phase 3 Slice 3e deferred)

- **Status:** intentional (Phase 3 Slice 3e, deferred 2026-05-19). Scoped out of Phase 3 as the highest-risk piece; warrants its own investigate-first arc.
- **Why it exists:** `docs/SWIM-PROTOCOL.md §2` prescribes drill/swim ratios from 75/25 (race-adequate + learning) down to 10/90 (race-adequate or performance + competitive). `pickSwimDrillInset` (`src/lib/plan-tokens/swim-drill-tokens.ts:242`) is athlete-experience-blind — drill yardage is fully token-static (4×50yd = 200yd, 2×50yd = 100yd, etc.). No `training_fitness` input to the picker; no ratio enforcement.
- **Why not blocking:** per-token drill yards (50-150yd typical) are aerobically inconsequential vs the 1500-3500yd main sets the protocol's session-count + band-volume layers already differentiate by experience (Slice 1 band-lerp at `c1c94cec`, fitness-tier band selection at `week-builder.ts:1092`). The drill block size matters for stroke-mechanic emphasis, not for training-load distribution; learners get more frequent technique aerobic sessions instead.
- **What "fixing" would require (Slice 3e, deferred):** new token variants for high-ratio learners (e.g. `swim_drills_6x50yd_<name>` at 300yd, `swim_drills_8x50yd_<name>` at 400yd); materialize-plan regex tolerance update (`materialize-plan/index.ts:1806` already accepts `\d+`); drill-yardage tier table mapping `(intent, experience) → multiplier`; threading `training_fitness` into `pickSwimDrillInset`. Investigate-first arc with its own slicing — drill-yards-by-tier intersects with the band-volume protocol and needs explicit scoping against double-counting.
- **Cross-ref:** `docs/SWIM-PROTOCOL.md §2 ratio table` (lines 46-53); Phase 3 Slice 3a commit; `src/lib/plan-tokens/swim-drill-tokens.ts:242`; `materialize-plan/index.ts:1806` (drill regex).

---

## When to add an entry

Add a new Q-NNN when:
- A behavior gets noticed and someone considers "fixing" it but the right call is to leave it.
- A bug is filed but explicitly deferred (note the deferral reason).
- Verification is owed but not yet done — record the verification approach so the next session can pick it up cheaply.

When the answer is established (verified, intentional, or fixed), keep the entry but mark its status. Don't delete entries; they're institutional memory.
