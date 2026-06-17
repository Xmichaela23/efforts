# Feature Audit — Consolidated Summary

Cross-area synthesis of `01`–`08`. Derived from code, read-only. **Uncommitted — Michael reviews and commits.** Everything below is *descriptive*: it records what the code does and flags what looks surprising. Nothing was fixed, changed, or deleted. Where a behavior could not be confirmed from code, it says so.

Run: overnight, 2026-06-16. All 8 areas mapped (coverage honesty per area at the bottom).

---

## 1. THE EDGE-CASE PROTECTION LIST (the point of this audit)

Every dormant / conditional / rare path found, consolidated. **This is the list that makes future cleanup safe** — before deleting or "simplifying" any of these, understand the path. Grouped by area; file:line as cited by the area auditors (spot-verify lines in the largest files).

### Ingestion & sync (area 01)
- **Swim cross-source merge gate** `mergeSameSwimIfExists` (`ingest-activity:1221`): merges when ±60s + ±10% across devices, OR same-date manual (D-184 noon-UTC path). The 60s window can miss when Strava minute-rounds vs Garmin seconds → duplicate swim survives (Q-060).
- **Non-swim runs/rides have NO cross-source merge** — only source-preference skip + the newly-ported bulk-import gate protect them (Q-066/067).
- **Post-import pipeline milestone gate is Garmin-ONLY** (`ingest-activity:1685`); Strava ingest never triggers the memory/snapshot warm-up there.
- **auto-attach planned-link**: exact-date-only (no tolerance); duration band actually 0.50–1.50 though comment says 85–115%; ambiguity gate delta < 0.06; unknown workout type defaults to `run`; candidate pre-fetch matches on normalized sport vs the raw `type` column.
- **Strava/Garmin deauthorize events are no-ops** — no token cleanup on disconnect webhook.
- **Empty verify-token disables Strava subscription validation.**
- **ingest-phone-workout / save-imported-workout**: plain insert, NO dedup; phone path floors duration to 1 minute.
- **Garmin swim inline reconstruction fallback** + `STRICT_SWIM_DELEGATION` skip; `GARMIN_ENABLE_SINGLE_SUMMARY` gate.

### Analyzers (area 02)
- **GAP guards** (run): negligible-grade (<0.3%) short-circuit, extreme-downhill (cost ≤ 0.5) clamp, idempotency marker, `hasUsableElevation` (≥60 samples, >50% coverage, ≥5m range) before GAP is trusted.
- **Run pace-adherence is asymmetric by interval type** (work / recovery / easy / warmup); recovery-slower-than-target always scores 100%.
- **Duration 60× unit-bug repair** (mutates state) implemented separately in BOTH run and ride analyzers.
- **Strength rep edge cases**: weight-only set with no reps still counts "completed"; AMRAP `Number("max") = NaN` fails silently; bodyweight forced to 0 if < 10 lb; unilateral volume halved.
- **Cycling cross-workout queries** all non-fatal try/catch; mixed-effort gate drops the cross_workout block.
- **Swim pool-length 4-tier cascade** + yd/m display heuristic; **Strava swims have `swim_data = NULL`** (SWOLF/stroke null downstream).

### Spine / state-trend / snapshot (area 03)
- **`state_trends_v1` is written ONLY when `targetWeek === mondayOfToday()`** (`compute-snapshot:584`). Any invocation with an explicit past `week_start` writes the row with `state_trends_v1 = null`.
- **`classifyTrend` three guards**: min-session gate → needs_data; staleness gate (newest point older than cadence-scaled `freshnessDays`) → needs_data + `stale`; dead-band between slide/improve. `lowerIsBetter` flips verdict only, not the raw pctChange sign.
- **Discipline trend guards**: run gated to `classified_type==='easy'` + 150–750 s/km plausibility (drops corrupt GAP); swim 40–240 s/100m (Q-038) + headline-gated; bike power binned to climbing/flat_sustained, surfaces freshest bin, falls back to efficiency.
- **CTL/ATL/TSB and readiness-rollup** written via separate guarded, fully non-fatal blocks (note manual/unmigrated columns).
- **`rollupFitnessDirection(null)` → 'stable'** (cold-start contract).

### Planning engine (area 04)
- **Combined-plan physiological-floor rebuild loop**: up to 12 `'normal'` passes → 1 `'deep'` pass → HTTP 400 (`index.ts:346-390`); §8.4 race-day invariant breach → 500.
- **Week-optimizer reconciler self-short-circuits when `long_run_day` missing** → minimal legacy strength fallback (`reconcile-…:232-235`).
- **Co-equal 2× strength that won't fit retries at 1×** with `strength_sessions_cap=1` (`week-optimizer.ts:2083`); §4.7 CLEAN→SOFT→SANDWICH spacing tier ladder.
- **`bikes/runs_per_week < 3` silently drops** easy_bike/easy_run (treated as not-a-conflict).
- **ACWR cold-start** (`chronic ≤ 0` → null); CTL is a 42-day EMA; run-pace reconciler (D-033) needs streak + median + ACWR ≤ 1.3 gates and swallows exceptions.
- **Materialize 5-tier pace fallback** ends at hardcoded 10:00/7:00/6:00 per-mi; swim default 120 s/100; strength default anchors (185 lb squat).
- **Distance-tuned collision resolver** throws `SCHEDULE_GRIDLOCK_*`, falls back by dropping one easy_swim.
- **Assessment-first plan shifts all weeks +1**; taper `tssMultiplier` 0.65 ramped 0.10/wk, floor 0.45.

### Compute & contracts (area 05)
- **compute-workout-summary** 3–4 nested fallback levels; always writes *something* (`summary_status='complete'` even on the error path, `:2244`); swim duration-inflate fix Q-038 (`:906`); decoupling guards (interval/HR-count/duration); mobility→strength remap.
- **compute-facts**: HR ≤ 0 and pace ∉ [150,750] → null (Q-054); GPS < 8 / status ≠ completed / dist < 1000m skips terrain-route; 3-variant `segment_progress_metrics` write (D-059 relic); strength-1RM confidence ladder (D-118).
- **session_detail_v1**: goal-race mode nulls narrative/plan-impact; swim forces pace-per-mile null (D-182); run GAP honest-null (D-185); `isSessionDetailStale` 6-condition gate + 24h age; `race_readiness` 42s budget; response-only `stale` keys stripped before persist.

### Screens / client (area 06)
- **Auth approval gate**: missing-row → error, not "denied".
- **Strength-logger reopen AND-gate** (D-109); **feedback popup** 7-day / no-RPE / realtime gating.
- **State screen** empty / aimless states; **`useWeekUnified`** placeholder-vs-loading distinction; reschedule validation path.
- **OAuth** Safari/Chrome/PKCE branching; **iOS-only HealthKit**; **wizard 14hr/5day `gate_block`**.
- **FitFileImporter** does all FIT extraction client-side (note km→m ascent ×1000).

### Baselines & athlete records (area 07)
- **Onboarding gap (confirmed)**: a new athlete leaves the wizard with **null FTP, null run threshold pace, null CSS** in both `performance_numbers` and `learned_fitness`. Wizard collects none of these (only `db_max_lb` → `goals.training_prefs`).
- **Runtime cold-start fallbacks that mask the null**: FTP display `|| 200` (`compute-workout-analysis:1589`); swim CSS silently `105 s/100yd` (`swim-protocol-v21.ts:138`); run targets drop to RPE; `materialize-plan` leaves `baselines.ftp` unset (`:2606-2608`).
- **`learn-fitness-profile` writes nothing until ≥3 workouts/discipline**; below that, all-null metrics + `learning_status='insufficient_data'`; band-empty HR fallbacks (0.70/0.88/0.90 × max, low confidence).
- **FTP ratchet floor** (`learn-fitness-profile:329-344`); learned-FTP quality-gate split (materialize rejects `learned-low`, infer-fitness accepts only `learned`); user-confirmed identity never overwritten (`:346-350`).

### Cross-cutting (area 08)
- **`coach_cache` keyed by `user_id` only** — request date ignored, so a payload built for date X can serve for date Y while < 24h old (`coach/index.ts:1161-1165,5136`).
- **Cache invalidation is an UPDATE of `invalidated_at`, not a delete**; the coach read honors it, but `course-detail:212`, `course-strategy:309`, `resolve-server-predicted-finish.ts:92`, `goal-race-completion.ts:67` read `coach_cache.payload` directly and can serve stale projections.
- **`get-weather` 15-minute expiry** despite a "30-minute TTL" comment (`:184-189`); both weather flows use archive only (no forecast); `TodaysEffort` archive-for-today likely always empty.
- **`ADAPTIVE_MARATHON_DECISIONS_ENABLED` (default ON)** makes the marathon feasibility reject at `create-goal…:2726` unreachable.
- **`complete-race` accepts already-completed states** — not idempotent (`:68,85`).
- **Post-race chain** idempotent on `{goal_id, finish_seconds} ±1s`; LLM helpers never throw, degrade to null/deterministic fallback.
- **Feedback popup**: single newest qualifying workout, 7-day window, `rpe IS NULL AND feedback_dismissed_at IS NULL`.

---

## 2. TOP REDUNDANCIES (duplicate computation / single-source violations)

Observed and located, not consolidated. Ranked by how load-bearing / drift-prone they are.

1. **VDOT / pace projection embedded 3+ ways.** Client `effort-score.ts` VDOT table, an inline copy in `GoalsScreen` calibration, and the server `riegel.ts` power-law — *not mirrors of each other* (different math), no shared source. Pace resolution overall is implemented ≥4× across planning, with the `effort-score` VDOT table the sole copy on the plan path (area 02/04/06).
2. **Three independent single-source scalar resolvers** for the same bug class: `resolveRunScalars`, `rideComputedNp`, `resolveSwimScalars` (strength reads `exercise_log`). By design, but `rideComputedNp` candidate list duplicates `compute-facts:1124` (area 02/05).
3. **Two e1RM formulas both writing `exercise_log.estimated_1rm`**: Brzycki (`compute-facts:116-125`, live) and Epley (`compute-adaptation-metrics:94-102`, dormant). Whether they can race on a shared row is unverified (area 02/07).
4. **Strava token refresh in 3 places with 3 different skew windows** (600s / 300s / none); the webhook doesn't use the shared helper (area 01).
5. **Three date+type workout matchers** (auto-attach / reassociate / sweep-week) with different rules; auto-default-gear and merge_computed+trigger blocks copy-pasted across ingest paths (area 01).
6. **Four plan generators with overlapping phase/gate/strength logic** (only combined uses the optimizer); ACWR computed/interpreted ≥3×; `estimatePlannedWorkload` duplicated (activate-plan vs `_shared/workload.ts`); TSS multipliers restated in 3 spots; two same-day rule systems (matrix vs collision resolver) (area 04).
7. **HR-zone math in ≥3 places with different coefficients** (Friel/Karvonen in TrainingBaselines, inline %LTHR in run analyzer, Coggan bands in cycling); Friel %LTHR zone construction duplicated in run and swim (area 02/07).
8. **Three colliding "snapshot" namespaces**: `athlete_snapshot` table, `_shared/athlete-snapshot.ts` (plan-pinned), `_shared/athlete-snapshot/` (LLM coaching) (area 03).
9. **Three Sonnet model ids across coach** (`claude-sonnet-4-6` alias unused; `claude-sonnet-4-20250514` Path A; `claude-sonnet-4-5-20250929` Path B), defeating the `MODELS` alias; two narrative generators in coach; `authenticatedSubFromBearer` copied with divergent anon handling (area 08).
10. **`COMPUTED_VERSION` exists in two non-enforced forms** (`"v1.0.4"` string vs int 1003), duplicated across two writers, nothing checks they agree (area 05).

---

## 3. TOP DISCREPANCIES (ranked for human attention)

These are *flags*, not verdicts. Each is something that looks surprising, contradicts a doc, or whose trigger couldn't be confirmed. **None were acted on.** Verify before treating any as a bug.

**Resolved since the 2026-06-16 snapshot:**
- **Q-061** (swim pace trend blended equipment/drill sets as if unaided) — **Resolved by D-193, 2026-06-17.** `compute-facts` flags contaminated swims (both directions, via shared `detectSwimEquipment`); `compute-snapshot` excludes them from the trend substrate. Verified on real data; deployed.

1. **Swim HR zones anchor to `run_threshold_hr`** (`analyze-swim index.ts:432`) — the spec explicitly warns swim HR ≠ run HR. (area 02) **High.**
2. **`FTP-COLD-START-SPEC` is spec-only, unimplemented** — `grep wizard_estimated` = zero code hits; ENGINE-STATE D-077 confirms "saved for future work." The onboarding gap (#null baselines for new athletes) is real and masked only by runtime fallbacks. (area 07) **High.**
3. **FTP precedence is inconsistent across screens** — `TrainingBaselines` is manual-first while `resolve-current-ftp` is confidence-gated, so the same athlete can show different FTP on different screens. (area 06/07) **High.**
4. **`recompute-workout` passes the workout's OWN week to compute-snapshot**, so recomputing an old workout never refreshes the current-week spine — contradicts its own "reaches the athlete-state spine" comment. Unverified. (area 03) **High.**
5. **compute-facts has NO advisory lock** while compute-workout-summary does, and facts reads `computed` with no ordering guard — a concurrent-trigger race is possible. Also relates to the strength e1RM read-before-write ordering (analyzer reads `exercise_log`, compute-facts writes it). (area 02/05) **High.**
6. **`coach_cache` date-blind serving + direct payload reads bypass invalidation** → stale race projections can surface. (area 08) **Medium-High.**
7. **`create-goal-and-materialize-plan` returns HTTP 200 for ALL outcomes** (including 401/409); `complete-race` is non-idempotent. (area 08) **Medium.**
8. **Doc/code drifts**: e1RM code is Brzycki but STRENGTH-ANALYSIS.md says Epley; RIR verdict threshold ±1.5 (analyzer) vs ±1.0 (strength-profiles); readiness type drift (`trend_7d` vs `trend_7d_pct`); coach payload-version floor server 45 vs client 35. (area 02/07/08) **Medium.**
9. **Dead / empty / unreachable code (reachability flagged, not removed):**
   - Empty directories that look like functions: `sweep-attach-history/`, `garmin-webhook-activity-details/`, `analyze-workout/`, `analyze-workout-ai/`, `generate-daily-context/` (area 01/02/03/08).
   - `garmin-webhook-activities-working.ts` dead incomplete snippet; `analyze-user-profile` dead 65-line stub; `generate-plan` orphaned validation stub; `build-coaching-context.ts` never imported. (area 01/04/07/08)
   - Unmapped-but-present: `run-migration` (directory empty — no arbitrary-SQL fn actually exists), `test-db-connection`, `save-location`, `readiness`, `Garmin-Workout-Export` (latter two likely native/iOS callers, not in-repo). (area 08)
   - No-caller / reachability unclear: `strava-refresh`, `restore-gps-track`, `enrich-history`, `reingest-activity`, `import-connect-history`. (area 01)
   - Cycling `computeRideEfficiency`/decoupling/VAM never called; strength `protocols/`+`placement/` never imported; cycling `chronicRideEF` computed but never written. (area 02/03)
10. **`process-workouts-batch` calls only `compute-workout-analysis`, never an analyzer** — purpose vs bulk-reanalyze unclear. **`MARATHON_DURATION_REQUIREMENTS`** defined but never consumed at gen time; possible NaN in end-plan tombstone (`end-plan-core.ts:75-77`, no zero-guard). (area 02/04) **Low-Medium.**
11. **Security-flavored flags (review, don't assume):** `swift-task` passes Garmin token in URL; `bright-service` logs token prefixes; `send-workout-to-garmin` trusts client `userId` and imports from `src/`; GarminDataService has a `||`/`?:` precedence bug + hardcoded anon JWT ×4. (area 06/08) **Review.**
12. **`plan_phase` always null in compute-snapshot** (`:685`) — stub or dropped, unclear. `useAthleteSnapshot.ts` typed interface omits many written columns though it `select('*')`. (area 03/05) **Low.**

---

## 4. COVERAGE NOTE (honest)

| Area | Coverage | Caveat |
|------|----------|--------|
| 01 Ingestion & sync | **Full** | ingest-activity both halves read directly; merge gate, webhooks, token flow, sweeps, native bridges all mapped. |
| 02 Analyzers | **Full** | All four analyzers (run 4642L, ride 2741L, swim 820L, strength 2805L) + shared primitives mapped. e1RM lives in area 05, cited here. |
| 03 Spine / snapshot | **Full (named files)** | All named files read in full; schema/migration state and the "recompute refreshes spine for old weeks" behavior could not be confirmed from code — flagged. |
| 04 Planning | **Full (structural)** | Orchestration, formulas, lifecycle, scheduling authority mapped with file:line. The two largest files (`week-builder.ts` 119KB, `session-factory.ts` 108KB) mapped at branch level, not line-by-line. |
| 05 Compute & contracts | **Full (contracts)** | Contract shapes, resolvers, version markers, session_detail_v1 build/consume fully mapped. compute-snapshot internals + swim-learned-fitness population only spot-checked (owned by 03/07). |
| 06 Screens | **Full (display surfaces)** | Display/Home/onboarding/Goals/baselines/Connections/PlanSelect mapped. Line cites inside 1500–3000-line components came from parallel sweeps — tagged `(sweep)`, spot-verify exact lines. Shallower: WorkoutExecutionView template path, chart leaf components. |
| 07 Baselines | **Full (core)** | Inference, resolvers, wizard persistence, e1RM, cold-start path mapped with file:line. Not exhaustively traced: every `learned_fitness` *read* site across ~98 functions; Epley-vs-Brzycki race on shared row (flagged, unverified). |
| 08 Cross-cutting | **Full (attribution)** | Every non-empty edge function attributed to an area; goals/coach/weather mapped in depth. `shared/` (distinct from `_shared/`) not separately inspected. |

**Overall:** all eight areas mapped; no area left partial. The two honest soft spots — both flagged inline above, not papered over — were (a) **schema/migration ground-truth** (the audit is code-derived; it does not query the DB, so column existence was inferred, not confirmed), and (b) **exact line numbers inside the very large files** (combined-plan builders, big React components), which were branch-mapped or sweep-cited and should be spot-verified before anyone acts on a specific line.

**Update (2026-06-17):** soft spot (a) is now **resolved** for the audited tables by `09-db-schema.md` — a read-only live-DB pass (queries run by Michael in the dashboard) that ground-truthed 44 tables and confirmed the headline flags at the data level: `state_trends_v1` is current-week-only, `coach_cache` is date-blind (one row per user, PK = user_id), `swim_data` is a `workouts` column (null for Strava swims), and the onboarding null-baseline gap is structural (this athlete is not in it). It also corrected several code-assumed table names (`activities`→`workouts`; `performance_numbers`/`learned_fitness` are JSONB columns on `user_baselines`; `session_detail_v1` is never persisted). It also confirmed `plan_phase` is an always-null stub at the data level (null on every row even with `plan_id`/`plan_week_number` populated), closing the last "unverified" discrepancy. No row-level audit items remain open. Soft spot (b) stands.

---

## 5. HOW TO USE THIS IN THE MORNING

- The **protection list (§1)** is the safety rail: before deleting/simplifying anything, check whether it's on that list and understand the path first.
- The **discrepancies (§3)** are a triage queue, ranked. They are *flags for you* — the audit deliberately did not decide whether any is a real bug, because that needs the product owner's intent. Several (#1 swim-HR anchor, #2 onboarding gap, #4 recompute-spine) are worth a closer look.
- The **redundancies (§2)** are consolidation candidates — but per the work order, several are *intentional* single-source parity (client/server snapshot, the three scalar resolvers). Don't consolidate without confirming intent against DECISIONS-LOG.
- Cross-reference into DECISIONS-LOG (D-033, D-059, D-077, D-109, D-118, D-157/161/162/166/171/173/174/182/184/185) and OPEN-QUESTIONS (Q-038, Q-054, Q-060, Q-066, Q-067) as cited per area.
