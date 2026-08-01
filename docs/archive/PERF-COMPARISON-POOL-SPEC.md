# Comparison-pool composition + downstream interpretation for run sessions — spec

Status: **APPROVED — decisions locked 2026-05-24, implementation in progress.** Proposed: D-038.

**Scope (one architectural fix in three coordinated pieces).** Three closely-related defects diagnosed end-to-end on workout `b70658b0` (2026-05-21, see §1). All three live in the comparison-pool layer that feeds INSIGHTS for run sessions; fixing one without the others leaves the narrative wrong for a different reason.

1. **Detection widening** — HR analyzer's `detectWorkoutType` misses unplanned executed-pace fartleks. Result: D-037's `forMixedEffort` decoupling path never engages on this whole class of sessions, and decoupling is computed via the steady-state route on data it wasn't designed for.
2. **Pool intensity filter** — `vs_similar` pool matches by type and duration but NOT by intensity. Result: a 9:24/mi fartlek today gets compared against 11–13 min/mi recovery jogs from the same "fartlek/intervals" type bucket, and the structurally-expected HR delta gets misinterpreted as fatigue.
3. **Pool pace context** — D-034's mixed-effort `pace_delta` suppression hides the "you ran much harder than your pool" context from the LLM. Result: the LLM falls back on arc-context framing ("post-race window") to explain a HR delta that's actually pure pace-mismatch.

**Not in scope:** cycling parity (cycling has its own `_shared/cycling-v1/queries.ts` pool — file a separate spec if needed); changes to the variance gate itself (D-034 is correct); resurrecting raw `pace_delta` as a verdict-class signal under mixed-effort (rejected — see §3.3); pool changes for non-run sports.

---

## 1. The bug — diagnosed on workout `b70658b0`

User `michaela@test.com`, run on 2026-05-21, 5.649 mi / 33 min / 76°F, 7 detected intervals alternating 7:21–10:07/mi, average 9:24/mi. No linked plan. 32 days post-Ojai-marathon (`runs_since_last_race: 8`, so `is_first_post_race_run: false`).

Post-recompute under current code (D-037 + POST-RACE COMPARISON shipped):

```
heart_rate_summary.workoutType: steady_state        ← !! (despite 7 alternating intervals)
session_state_v1.glance.is_mixed_effort: true        ← variance gate correctly fired
fact_packet_v1.derived.decoupling_basis: gap        ← should be 'raw' per D-037 spec
fact_packet_v1.derived.decoupling_pct: 9.3
fact_packet_v1.derived.decoupling_assessment: high  ← contaminated by alternating efforts

vs_similar:
  sample_size: 3, hr_delta_bpm: +16, pace_delta_sec: -109 (109 sec/mi faster)
  trend_points:
    2026-03-16   12:13/mi   138 bpm
    2026-03-26   13:17/mi   ?
    2026-04-14   11:21/mi   134 bpm
    2026-04-18   11:51/mi   132 bpm
    2026-05-21    9:24/mi   151 bpm   ← CURRENT
```

The LLM, given (a) `+16 bpm vs similar`, (b) no pace context (D-034 suppression), (c) `days_since_last_goal_race=32`, narrated:

> "...this 3.5-miler shows HR running 16 bpm higher than your similar efforts from this phase, which is typical early in the return window when cardiovascular load feels elevated even at modest perceived effort."

This framing is wrong. The +16 bpm reflects pace mismatch (2 min/mi faster than the pool), not post-race cardiovascular load. The pool labels these "similar" but they aren't — they're easier-intensity sessions sharing only the type + duration tags.

### 1.1 Why each piece breaks independently

| Layer | Verdict | Criteria | Why it's the wrong answer |
|---|---|---|---|
| Run analyzer `_varGate` (`analyze-running-workout/index.ts:~2040`) | `is_mixed_effort: true` | pace CV ≥ 8% at GAP basis — got 21.2% | Correct |
| HR analyzer `detectWorkoutType` (`lib/heart-rate/detect-workout-type.ts:19`) | `steady_state` | Requires `role==='work'`/`'recovery'` literals, or planned `paceRange`, or `'fartlek'` in description, or `hasAlternatingPattern` on `paceRange` (planned, not executed) | This session has `role='lap'` on all intervals, no planned workout (no `paceRange`, no description) — all four detection paths miss it; defaults to `steady_state` |
| D-037 `forMixedEffort` flag | Doesn't fire | Only fires when HR analyzer routes to `analyzeMixedWorkout` or `analyzeIntervalWorkout`-with-unplanned | HR analyzer routes `steady_state`, so the flag never gets set; basis stays detected (`'gap'`) instead of forced (`'raw'`); the AEROBIC DECOUPLING raw-branch prompt rule doesn't fire |
| `vs_similar` pool (`_shared/fact-packet/queries.ts:213-481`) | 5 trend_points, 3 sample_size | type match + duration band (0.7×–1.3×) + terrain class + route overlap. **No intensity filter.** | Pool spans 11–13 min/mi recovery efforts and current is 9:24/mi — pace mismatch is the dominant driver of HR delta, but the pool acts as if everything in the type bucket is comparable intensity |
| D-034 `pace_delta` suppression (`ai-summary.ts:876-892`) | LLM sees `hr_delta=+16`, `pace_delta=null` | Mixed-effort → null the pace fields to prevent "average-of-fartlek-pace" verdict misuse | Correct as a verdict-prevention rule but leaves the LLM with no signal that pool composition is uneven across pace; LLM fabricates a fatigue/post-race framing to explain the HR delta |

Two detection paths disagree (`_varGate` vs HR analyzer); one filter is missing (intensity); one suppression is correct-but-incomplete (no replacement context offered).

---

## 2. Design

### 2.1 Piece 1 — Detection widening

`lib/heart-rate/detect-workout-type.ts:detectWorkoutType` gets two narrow extensions; both fail-open (return existing answer when not enough data).

**Change A: `hasAlternatingPattern` falls back to executed pace when `paceRange` is null.**

Today (`detect-workout-type.ts:131-157`):

```ts
const prevPace = prev.paceRange ? (prev.paceRange.lower + prev.paceRange.upper) / 2 : 0;
const currPace = curr.paceRange ? (curr.paceRange.lower + curr.paceRange.upper) / 2 : 0;
```

Proposed:

```ts
const prevPace = prev.paceRange
  ? (prev.paceRange.lower + prev.paceRange.upper) / 2
  : (prev.executed?.avgPaceSPerMi ?? 0);
const currPace = curr.paceRange
  ? (curr.paceRange.lower + curr.paceRange.upper) / 2
  : (curr.executed?.avgPaceSPerMi ?? 0);
```

The function already returns `true` only if ≥2 alternations of >15% pace-diff exist (`:155`). That threshold is conservative on executed pace too; this just makes the function usable when no plan is linked.

**Change B: thread the variance-gate result into the HR analyzer.**

The run analyzer computes `_varGate.is_mixed_effort` at `analyze-running-workout/index.ts:~2040` using the canonical CV-on-GAP predicate (or pace CV ≥ 8%, or detected-intervals signal). This is **strictly more rigorous** than `detectWorkoutType`'s heuristics. Pass it down.

- Extend `HRAnalysisContext` (`lib/heart-rate/types.ts:27`) with `varianceGate?: { isMixedEffort: boolean }` (optional, back-compat).
- In `analyzeHeartRate` (`lib/heart-rate/index.ts:82`), the workoutType-detection cascade becomes:
  - `context.workoutType` (still wins if explicitly set by caller — current behavior)
  - then if `context.varianceGate?.isMixedEffort === true` and `detectWorkoutType` returned `'steady_state'`, **override to `'fartlek'`** (the route into `analyzeMixedWorkout`, which now correctly calls `calculateEfficiency` with `forMixedEffort: true`)
  - else use `detectWorkoutType` result as today

This is a one-way override (gate true → reclassify), not a replacement of `detectWorkoutType`. Planned interval sessions (where `detectWorkoutType` returns `'intervals'` correctly) keep going through `analyzeIntervalWorkout`'s gate. The override only catches the `_varGate=true` AND `detectWorkoutType=steady_state` disagreement case — exactly the b70658b0 class.

**Decision: Change A + Change B.** A is the minimum diff; B is the architectural alignment. Together they make D-037's path engage on the b70658b0 class. A alone would catch this specific session (alternating executed pace, no plan), but B is needed when the HR analyzer is called from other contexts (recompute paths, future callers) where the variance gate has already been computed and we want it to be the authority.

#### 2.1.1 Footgun

`varianceGate` is optional and back-compat. If a future caller passes `varianceGate?.isMixedEffort === true` but the session genuinely is steady (e.g., a steady tempo with one slow finish dropping pace CV below 8% threshold but spiking the gate via interval_execution), the route flips from `steady_state` to `fartlek`/`mixed`. That changes drift analysis (`analyzeMixedWorkout` doesn't compute `drift`) — losing the drift signal for a session that would have benefited from it. Mitigations:

- Only override when **both** conditions hold: `varianceGate.isMixedEffort === true` AND `detectWorkoutType` returned `'steady_state'`. If `detectWorkoutType` already returned `'intervals'`/`'tempo_finish'`/`'progressive'`, leave that alone (it's a more specific verdict than the gate).
- The override is `'fartlek'` (routes to `analyzeMixedWorkout`), not `'intervals'` (routes to `analyzeIntervalWorkout`). Mixed gets the zone-distribution + forMixedEffort-decoupling path which is the right shape for a session that looks mixed in CV but unstructured by intervals.

### 2.2 Piece 2 — Pool intensity filter

`_shared/fact-packet/queries.ts` pool builder gains a pace-proximity filter, mirroring the existing terrain/route fallback pattern.

#### 2.2.1 Filter logic

After current type-match + duration-band filtering (queries.ts:280-305), before terrain filtering (`:306-313`):

```
Compute paceTolerance = 15% of currentAvgPaceSecPerMi (or currentAvgGapSecPerMi when GAP basis).
Filter durationMatch to rows where:
  abs(rowPace - currentPace) / currentPace <= paceTolerance
where rowPace uses the same basis (GAP if current has GAP and row has GAP; raw fallback).

If pace-filtered pool >= 3 hits: use it.
Else: fall back to durationMatch unfiltered (current behavior).
```

15% is the proposed starting threshold — it would let 9:24/mi current match 8:00–10:48/mi historicals while excluding 11+ min/mi recovery jogs. Subject to tuning after observation. The 3-hit floor matches the existing terrain/route fallback policy.

The trend pool uses the wider duration band (0.4×–1.6×); apply the same 15% pace filter there with a fallback at 3 hits (same rule, separate band).

#### 2.2.2 What gets persisted

Add `pool_intensity_filter: { applied: boolean, tolerance_pct: number, basis: 'gap' | 'raw', pool_size_before: number, pool_size_after: number }` to the `vs_similar` block. Diagnostic only — lets us inspect what the filter did on any given session without re-running the pool. Lands in `fact_packet_v1.derived.comparisons.vs_similar.pool_intensity_filter`.

#### 2.2.3 What does NOT change

- Type-match logic (`getComparableTypeKeys`) stays as-is.
- Duration band thresholds stay as-is.
- D-034 mixed-effort row filter (current-easy-like excludes mixed-effort historicals at `queries.ts:299`) stays as-is — that's a separate concern (type contagion in the easy pool).
- GAP-aware basis selection (`:391-417`) stays as-is — pace filter operates on whichever basis is being used for comparison.

#### 2.2.4 Footgun

15% is one number — too tight and we get sparser pools (more frequent fallback to unfiltered), too loose and recovery jogs still pool against fartleks. Initial value should be conservative-loose (15%) and we tune down based on production observation. The diagnostic field lets us measure the impact:

- "How often does the filter actually fire?" (`pool_size_after < pool_size_before`)
- "How often does it fail back to unfiltered?" (`applied: false` because filtered pool < 3)
- Empirical tuning needs 2 weeks of production data, then re-decide.

Do NOT tune the threshold per session-type (`'easy'` gets 10%, `'fartlek'` gets 20%, etc.) without a clear empirical justification — that's the path to a config explosion.

### 2.3 Piece 3 — Pool pace context field

`vs_similar` block gains a new `pool_pace_context` sub-object. Always populated when `vs_similar.sample_size > 0`, regardless of `isMixedEffort` — it's diagnostic context for the LLM, not a verdict.

```ts
pool_pace_context: {
  current_avg_pace_sec: number,
  pool_avg_pace_sec: number,
  delta_sec: number,          // current - pool; negative = current was faster
  delta_pct: number,           // delta / pool, as a percentage
  basis: 'gap' | 'raw',
  intensity_match: 'matched' | 'current_much_faster' | 'current_much_slower' | 'mixed'
}
```

`intensity_match` is the LLM-facing summary (10% boundary, locked per §8):
- `'matched'` when `abs(delta_pct) < 10%`
- `'current_much_faster'` when `delta_pct ≤ -10%` (current faster than pool)
- `'current_much_slower'` when `delta_pct ≥ +10%`
- `'mixed'` is reserved — when pool is heterogeneous (pool intensity variance high relative to mean). Defer the heuristic for `'mixed'` to a follow-up; for v1 use the three-tier classification.

#### 2.3.1 What the LLM sees

Surface `pool_pace_context` on `signals.comparisons.vs_similar.pool_pace_context` in `ai-summary.ts:toDisplayFormatV1`. **Always pass-through** — no `isMixedEffort` gating. The whole point is that the LLM needs this signal precisely *because* the verdict-class `pace_delta` is suppressed for mixed-effort.

For unplanned mixed-effort sessions with `intensity_match: 'current_much_faster'` (the b70658b0 case), the LLM gets:

```
vs_similar:
  hr_delta: "16 bpm"
  pace_delta: null              ← D-034 suppression (unchanged)
  pace_basis: null              ← D-034 suppression (unchanged)
  assessment: null              ← D-034 suppression (unchanged)
  pool_pace_context:
    intensity_match: "current_much_faster"
    delta_pct: -19.3
    basis: "gap"
    // current_avg_pace_sec and pool_avg_pace_sec also present but
    // numbers-as-verdict not the framing concern here
```

That's enough for the LLM to honestly say "HR ran +16 bpm vs your comparison runs, but you ran ~19% faster than those efforts — so the gap reflects intensity, not a fitness change."

#### 2.3.2 Prompt rule

New rule, appended to `COACHING_SYSTEM_PROMPT` in `_shared/fact-packet/ai-summary.ts`, between MIXED-EFFORT MODE and AEROBIC DECOUPLING (RUN):

```
POOL INTENSITY CONTEXT — when signals.comparisons.vs_similar is present AND
pool_pace_context is populated, anchor any HR-delta interpretation against
pool_pace_context.intensity_match:
- "current_much_faster": the comparison pool was significantly easier than this
  session. HR running higher than pool is structurally expected and reflects
  intensity, not fitness change. Say so plainly. Do NOT frame the HR delta as
  fatigue, post-race recovery, aerobic decline, or any longitudinal signal.
- "current_much_slower": pool was significantly harder than this session. HR
  running lower than pool is structurally expected — easier effort. Do NOT
  frame this as a fitness improvement signal in isolation.
- "matched": pool intensity comparable to current session. HR delta is a
  legitimate cross-session comparison; interpret normally (use drift signals,
  arc context, etc.).
- This rule takes priority over generic vs_similar HR interpretation. It
  composes with POST-RACE COMPARISON and MIXED-EFFORT MODE — if any of them
  apply, all apply.
```

#### 2.3.3 Footgun

`pool_pace_context` is NOT a substitute for `pace_delta`. It's deliberately not numeric in the LLM's primary read path (the `intensity_match` enum is what the prompt rule keys off). Numbers are present in the field for diagnostics + future tuning but the prompt should NOT instruct the LLM to print "you ran X% faster" — that re-opens the verdict-class problem D-034 closed. The prompt rule says "say plainly that HR delta reflects intensity"; it doesn't say "quote the percentage."

If a future LLM eval shows the model leaning on `delta_pct` as a quoted number, tighten the prompt rule to say "do not print delta_pct or delta_sec" — same defense-in-depth pattern as `cardiac_decoupling`'s "translate, never print the percentage."

---

## 3. Alternatives considered / rejected

### 3.1 Just fix detection (Piece 1 only)

Considered as a smaller first ship. Rejected — even with D-037's forMixedEffort path engaging on this session, the decoupling output would correctly flip to `'raw'`/inconclusive but the +16 bpm HR delta would still surface with no pace context for the LLM to interpret it against. The narrative defect (post-race cardiovascular framing) is downstream of the pool composition, not the decoupling fix. Shipping piece 1 alone leaves the user with the same wrong narrative for a different reason — exactly the "fixing one layer at a time" anti-pattern that motivated the bundling decision.

### 3.2 Just fix the pool (Piece 2 only)

Considered as the architectural-root fix. Rejected for similar reasons — Piece 2 alone reduces the magnitude of HR delta (the filtered pool is closer in intensity), but the `vs_similar` block still wouldn't surface intensity context to the LLM, and the decoupling field would still be 'gap'-basis nonsense on the b70658b0 class (because D-037 doesn't engage). The narrative defect would be smaller but still present.

### 3.3 Un-suppress `pace_delta` under mixed-effort

Considered and explicitly rejected (per user direction). D-034's reasoning stands: a fartlek's whole-workout average pace is a meaningless verdict-class signal because it averages hard intervals + easy intervals into one number. Re-surfacing `pace_delta` to the LLM under mixed-effort would re-open the "you ran 8:30 pace, slower than your typical 8:00 fartlek pace" framing — a misleading effort-quality claim, exactly the bug D-034 killed.

Piece 3 (`pool_pace_context`) is the middle ground: surface the context the LLM needs to interpret HR delta honestly without re-introducing pace_delta as a verdict signal. The `intensity_match` enum forces the LLM to engage with pool composition, not raw pace difference.

### 3.4 Add intensity-match to the type-match logic instead of as a filter

I.e., extend `getComparableTypeKeys` to return per-intensity sub-types ('fartlek_hard', 'fartlek_easy'). Rejected — type taxonomy is already a pain point, and pace-intensity is a continuous variable that doesn't bucket cleanly. Pace-proximity filtering on a continuous metric (Piece 2) handles this naturally.

### 3.5 Backfill historical workout_analysis rows

Considered for the b70658b0-class sessions specifically. Rejected per the existing D-034 / D-035 / D-036 precedent — lazy stale-until-touched is the policy for analyzer-output changes. Workouts re-analyze naturally on next ingest or recompute. The diagnostic field `pool_intensity_filter` will be undefined on stale rows; the LLM rule handles missing context gracefully (the rule fires only when present).

---

## 4. Test plan

Three new deno test files. All against `_shared/`, no analyzer test fixtures yet (POLISH coverage gap stays open).

### 4.1 Detection widening — `analyze-running-workout/lib/heart-rate/detect-workout-type.test.ts` (NEW)

- `hasAlternatingPattern` returns true on executed-pace alternations when `paceRange` is null (positive case, mirrors b70658b0)
- `hasAlternatingPattern` still returns false on steady executed pace with no planned data (negative case)
- `hasAlternatingPattern` prefers `paceRange` over `executed.avgPaceSPerMi` when both are present (back-compat: planned signal still wins)
- `hasAlternatingPattern` returns false when both `paceRange` and `executed.avgPaceSPerMi` are missing (no false positives from null data)

### 4.2 HR analyzer variance-gate override — extend `_shared/session-detail/decoupling.test.ts`

- `varianceGate.isMixedEffort=true` + `detectWorkoutType` returns `'steady_state'` → route flips to `analyzeMixedWorkout`, `efficiency.decoupling.basis === 'raw'` (the D-037 forMixedEffort path engages)
- `varianceGate.isMixedEffort=true` + `detectWorkoutType` returns `'intervals'` → no override (more specific verdict wins), route stays `analyzeIntervalWorkout`
- `varianceGate=undefined` (legacy caller) + `detectWorkoutType` returns `'steady_state'` → no override, current behavior preserved (back-compat)

### 4.3 Pool intensity filter — extend `_shared/fact-packet/queries.test.ts` (new file if absent)

- Pool of 5 candidates within 15% pace of current → filter keeps all 5, `applied: true`
- Pool of 5 candidates with 3 within ±15% and 2 outside → filter keeps 3, `applied: true`, `pool_size_before: 5, pool_size_after: 3`
- Pool of 5 candidates with 2 within ±15% and 3 outside → filter fails-back to unfiltered (5), `applied: false`, `pool_size_before: 5, pool_size_after: 5`
- GAP basis preserved when both current and ≥3 candidates have GAP (no regression to D-034 basis-selection)
- Diagnostic field `pool_intensity_filter` populated correctly in all cases

### 4.4 Pool pace context — extend `_shared/session-detail/decoupling.test.ts`

- `pool_pace_context.intensity_match: 'current_much_faster'` when current is 20% faster than pool average → surfaces on display packet under `isMixedEffort: true` (NOT suppressed)
- `pool_pace_context.intensity_match: 'matched'` when current is within ±5% of pool average → surfaces
- `pool_pace_context.intensity_match: 'current_much_slower'` when current is 20% slower than pool average → surfaces
- `pool_pace_context` is null/undefined when `vs_similar.sample_size === 0` (no pool, no context)
- `buildUserMessage` renders the `pool_pace_context` line in the COMPARED TO SIMILAR section when `intensity_match !== 'matched'`

### 4.5 b70658b0 regression pin

Snapshot the b70658b0 derived shape (post-spec implementation) as an end-to-end regression test fixture. Run the full vs_similar pool builder against a fixture that reproduces the (5.649mi @ 33min, 7 alternating laps role='lap', no planned workout) + 4 historicals at 11–13 min/mi. Assert:

- `is_mixed_effort: true`
- `decoupling_basis: 'raw'`
- `decoupling_assessment` reflects raw-basis treatment (likely `'high'` but with the LLM prompt path treating it as inconclusive)
- `pool_pace_context.intensity_match: 'current_much_faster'`
- `pool_pace_context.delta_pct` in the -15% to -25% range

This fixture is the canary — if a future change breaks any of the three pieces, this pin fires.

---

## 5. Out of scope

- **Cycling parity.** Cycling has its own `_shared/cycling-v1/queries.ts` pool builder and a parallel MIXED-EFFORT MODE rule. If/when production observation surfaces an equivalent narrative defect on the ride side, file a separate spec following the same three-piece pattern. Don't bundle preemptively.
- **`vs_similar` pool count cap.** Currently 8 trend_points max (queries.ts:407). Not changed by this spec.
- **Variance gate predicate tuning.** `_varGate` thresholds (CV ≥ 8% at GAP basis, etc.) stay as-is. This spec consumes the gate's output; it doesn't tune the gate.
- **Detection of intent vs. detection of effort variance.** This spec doesn't try to recover "the athlete *intended* a fartlek" vs "the route happened to have rolling pace." `_varGate` makes a single mixed-effort verdict from observed CV; this spec respects that verdict.
- **`run_easy_hr_trend` rename.** Still a separate cleanup (POLISH-PUNCH-LIST follow-up).
- **`aerobic_direction` wiring into INSIGHTS.** Still a separate cleanup (POLISH-PUNCH-LIST follow-up). The longitudinal-fitness signal is conceptually adjacent to pool composition but the wiring is independent.

---

## 6. Deploy + rollback

**Deploy set** (same as D-037 / POST-RACE COMPARISON):
- `analyze-running-workout`
- `workout-detail`
- `recompute-workout`
- `bulk-reanalyze-workouts`
- `ingest-activity`

**No client changes.** All three pieces are server-side; the display packet additions land on `session_detail_v1.signals.comparisons.vs_similar.pool_pace_context` and the existing client (`AdherenceChips.tsx`, `SessionNarrative.tsx`) doesn't render it (it's an LLM-input field, not a UI element).

**No backfill.** Per D-034/D-035/D-036 precedent. Sessions re-analyze naturally on next ingest or recompute. Stale rows lack `pool_intensity_filter` + `pool_pace_context` fields; the LLM prompt rule fires only when those fields are present, so stale rows degrade to current behavior (no new framing, no regression).

**Rollback shape.** If the pace filter proves too aggressive (sparse pools at production scale), the threshold (15%) is a single constant; the filter itself can be disabled at the diagnostic-flag level (`pool_intensity_filter.applied: false` everywhere) via a one-line constant change. The detection widening and pool_pace_context pieces are additive and have no rollback urgency. POST-RACE COMPARISON and D-037 stay in place either way.

---

## 7. Footguns (consolidated)

- **`varianceGate.isMixedEffort` override is one-way and narrow.** Override only when `_varGate=true` AND `detectWorkoutType=steady_state`. Don't extend the override to other `detectWorkoutType` verdicts without re-evaluating — the more specific verdicts have their own rationale.
- **Pace filter is `Math.min`-style overlay on the pool.** Filter NEVER expands the pool (only narrows or fails-back). Don't change the filter to add candidates outside the duration band "to compensate" — that breaks the type+duration semantics.
- **`pool_pace_context` is diagnostic context, not a verdict.** The prompt rule says "use to interpret HR delta," not "quote the numbers." If a future eval shows the LLM quoting `delta_pct`, tighten the prompt — don't gate `pool_pace_context` off.
- **Three rules compose (MIXED-EFFORT MODE + POST-RACE COMPARISON + POOL INTENSITY CONTEXT).** A session can hit all three. The prompt rules are designed to be additive — none of them invalidate the others. Don't add "priority" / "exclusion" language between them without testing the cross-combinations explicitly.
- **15% threshold is one number.** Don't per-type-bucket it; don't extract it into env config; don't make it user-configurable. Single constant in `queries.ts`, tunable via redeploy once we have 2 weeks of production observation. Add a comment with the next-review date.
- **The b70658b0 regression fixture is load-bearing.** Same role as D-031's e2e convergence fixture: refuses to silently pass on the wrong reason. If any of the three pieces regresses (detection narrows back, pool filter disables, pool_pace_context goes null under mixed-effort), the fixture fires.
- **No client changes — keep it that way.** All three pieces are server-side. If a future surface needs to render `pool_pace_context` (e.g., a "pool composition" tooltip on the Performance tab), that's a separate UI ship with its own design pass; don't bolt it on.

---

## 8. Decision points — LOCKED 2026-05-24

1. **15% pace-proximity threshold (Piece 2).** ✅ LOCKED at 15%. Conservative-loose to start; tune after 2 weeks of production observation via the `pool_intensity_filter` diagnostic field.
2. **Override target = `'fartlek'` vs `'mixed'` (Piece 1B).** ✅ LOCKED at `'fartlek'`. More semantically faithful when `detectWorkoutType` said `'steady_state'` and `_varGate` disagreed — implies "unstructured variable effort detected after the fact." Routes to `analyzeMixedWorkout`.
3. **`pool_pace_context.intensity_match` boundary (Piece 3).** ✅ LOCKED at **10%** (corrected from spec-draft 8%). Aligns with PACING's "uneven" band in D-034. Threshold structure:
   - `'matched'`: `abs(delta_pct) < 10%`
   - `'current_much_faster'`: `delta_pct ≤ -10%` (current faster than pool)
   - `'current_much_slower'`: `delta_pct ≥ +10%`
4. **`pool_pace_context` always-on vs gated.** ✅ LOCKED always-on. Populate whenever `vs_similar.sample_size > 0`, no `isMixedEffort` gate. The prompt rule only fires when `intensity_match !== 'matched'`, so always-on adds no narrative weight to balanced pools.

Implementation proceeds as a single ship: `_shared/fact-packet/queries.ts`, `_shared/fact-packet/ai-summary.ts`, `_shared/fact-packet/types.ts`, `analyze-running-workout/lib/heart-rate/detect-workout-type.ts`, `analyze-running-workout/lib/heart-rate/index.ts`, `analyze-running-workout/lib/heart-rate/types.ts`, `analyze-running-workout/index.ts` (varianceGate threading), plus tests.
