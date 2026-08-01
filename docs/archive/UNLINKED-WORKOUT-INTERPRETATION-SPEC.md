# Unlinked workout interpretation spec

Status: **APPROVED 2026-05-23. D-035.**
Scope: run + cycling + swim analyzers + `_shared/session-detail` + `_shared/fact-packet/ai-summary` + cycling-v1 `ai-summary` + client display.
Out of scope (separate decision): the workout-to-plan matching logic in `auto-attach-planned/index.ts` (date tolerance, duration band, ambiguity guard). Genuinely unplanned workouts exist regardless of matching quality; this spec fixes how the system *analyzes* them.

---

## 1. Confirmed bug surface (all three analyzers — different mechanisms, same wrong outcome)

The root failure: all three sport analyzers compute and return adherence values for workouts that have no linked plan, then surface those values as if they were honest measurements of plan compliance. The three sports do it differently:

### Run — invents a target and scores against it
`analyze-running-workout/index.ts:504-538`. When `intervals.length === 0` (no planned), the analyzer **synthesizes** a fake target based on duration alone:

```
> 1 hour    → long_run    at baselines.marathon_pace || 600 s/mi
30-60 min  → tempo_run   at baselines.tenK_pace     || 480 s/mi
< 15 min   → interval_run at baselines.fiveK_pace    || 450 s/mi
else        → easy_run    at baselines.easyPace      || 540 s/mi
```

Single fabricated interval, `pace_range = [target × 0.95, target × 1.05]`. Then everything downstream — `pace_adherence`, `execution_adherence`, the `pace_vs_range: slower_than_prescribed | faster_than_prescribed` signal in the fact packet — computes against this fiction. INSIGHTS then scolds the athlete for missing a target they never set.

An unplanned 40-minute easy run lands in the 30-60 min bucket → tempo_run at 10K pace → "slower_than_prescribed" → narrative reads as a failed tempo workout.

### Cycling — no synthesis, but emits 0% adherence
`analyze-cycling-workout/index.ts:1530-1627` does NOT invent a target. When `workout.planned_id` is missing, `intervals = []` and `calculateSteadyStatePowerAdherence` (`:736-757`) returns `overall_adherence: 0` because `plannedPowerRange` is null. That 0 propagates to `performance.power_adherence: 0`, `execution_adherence: 0` at `:1730-1757`. Client chips currently hide via the `allZero` short-circuit in `AdherenceChips.tsx:70-72`, so the visible failure is milder — but the LLM prompt still sees zero-adherence signals and a `derived.execution.assessed_against: 'plan'` flag, with no caveat that there was no plan.

### Swim — defaults to 100% adherence (opposite-direction lie)
`analyze-swim-workout/index.ts:340-344`:
```
const overallAdherence = intervalsWithAdherence.length > 0 ?
  ... :
  100;   // ← perfect score when no planned intervals
```
Then at `:474-477`:
```
pace_adherence: Math.round(overallAdherence),     // 100
duration_adherence: 100,                          // hardcoded TODO
execution_adherence: Math.round(overallAdherence) // 100
```
An unlinked swim renders as a perfect-execution workout, regardless of what actually happened. Hardcoded `duration_adherence: 100` at `:476` is also wrong for *linked* swims, but is out of this spec (filed as a follow-up).

### The two display paths
- `AdherenceChips.tsx:55` already returns null when `noPlannedCompare === true`.
- `AdherenceChips.tsx:88-89` returns null per-chip when `pct == null`.
- `AdherenceChips.tsx:70-72` `allZero` short-circuit hides chips when all four adherence fields are 0.

So the client is already null-safe. The display problem is that the server doesn't emit nulls — it emits 0 (run/cycling) or 100 (swim) or a synthesized-target percentage (run). With true nulls from the server, the chips disappear cleanly.

---

## 2. Design

### 2.1 Stop synthesizing targets — all three analyzers

**Hard rule — workout_type stays a descriptive label only.** The fact-packet's duration-derived `workout_type` (`fact-packet/build.ts:340-345`) is preserved as a soft hint for the LLM. It MUST NEVER be turned back into a pace target, an adherence baseline, or any other quantitative anchor. It exists for the narrative to say "this looked like a long run" — not for the analyzer to score "you missed your tempo target." Any future change that would resurrect a synthesized target from this label needs to supersede this spec with a new D-NNN.

**Run** (`analyze-running-workout/index.ts:504-538`). Delete the fake-interval block entirely. The downstream paths must accept the empty-intervals state and return null adherence values, not zero. Specifically:
- `performance.execution_adherence = null`
- `performance.pace_adherence = null`
- `performance.duration_adherence = null`
- `performance.gap_adjusted = false` (no series was assessed)
- `performance.completed_steps = null` (not 0 — there were no planned steps)
- `performance.total_steps = null`

The single fact-packet step that still uses the duration heuristic to label `workout_type` (`fact-packet/build.ts:340-345`) stays — it's a classification label for the LLM, not a target. But it must not feed back into adherence scoring.

**Cycling** (`analyze-cycling-workout/index.ts:1530-1757`). Already doesn't synthesize. The path that currently emits 0% needs to emit null:
- When `!workout.planned_id` (or `plannedWorkout === null`): skip the whole adherence-calculation block at `:1711-1757`. Set:
  - `performance.execution_adherence = null`
  - `performance.execution_score = null` (the alias)
  - `performance.power_adherence = null`
  - `performance.duration_adherence = null`
  - `performance.completed_steps = null`
  - `performance.total_steps = null`
- Power variability (CV, VI) keeps computing on actual ride data — those are honest single-workout signals, not adherence. They still feed the variance gate for `is_mixed_effort` (D-034).

**Swim** (`analyze-swim-workout/index.ts:340-477`). Replace the `100` default with `null` AND kill the hardcoded `duration_adherence: 100`:
- `:342-344` — when `intervalsWithAdherence.length === 0`, `overallAdherence = null` (not 100).
- `:474-477` — adherence fields are null when `overallAdherence === null`:
  - `pace_adherence: null`
  - `duration_adherence: null` for unlinked. **Linked swims:** compute duration_adherence from planned vs actual swim duration (mirror the run/cycling formula at `granular-pace.ts:471-482` — ratio in [0.9, 1.1] → linear interpolation, otherwise asymmetric clamp). The hardcoded `100` is the exact bug this spec exists to kill; leaving it for linked swims would be incoherent. Per user direction 2026-05-23.
  - `execution_adherence: null` when unlinked; for linked, blend pace_adherence + duration_adherence the same way run does.
  - `overall_adherence: null` when unlinked.

### 2.2 `is_unplanned` flag on the session_detail contract

New field on `session_detail_v1`:

```ts
classification: {
  is_structured_interval: boolean;
  is_easy_like: boolean;
  is_auto_lap_or_split: boolean;
  is_pool_swim: boolean;
  is_mixed_effort: boolean;                           // D-034
  variance_signal: ... | null;                        // D-034
  classified_type_variance_override: boolean;         // D-034
  /**
   * D-NNN: true when the workout has no linked planned session.
   * Server-computed; client renders. When true: no adherence chips, no
   * "missed target" narrative — INSIGHTS interprets the workout on its
   * own terms (HR-to-pace efficiency, terrain, conditions, route history).
   */
  is_unplanned: boolean;
}
```

Computed in `_shared/session-detail/build.ts` from existing `match?.planned_id` resolution — it's `!plan_context.planned_id`. Surfaced into the contract so the client and LLM both have one canonical signal.

### 2.3 LLM input gate (run + cycling)

In `_shared/fact-packet/ai-summary.ts:toDisplayFormatV1` (run) and `_shared/cycling-v1/ai-summary.ts:toDisplayPacket` (cycling), thread an `isUnplanned` flag — derived from the absence of a linked plan in the source — and use it to swap the LLM input shape.

**Drop from the LLM input when `isUnplanned`:**

Run:
- `signals.execution.pace_vs_range` — the prescribed-range signal that produces "slower_than_prescribed" / "faster_than_prescribed". Without a plan, there is no prescribed range.
- `signals.execution.distance_deviation` — same reason; the deviation is from a fiction.
- `signals.execution.note` — the "assessed against actual" caveat doesn't apply because there was nothing to deviate from.
- `signals.interval_execution` block — execution_score / pace_adherence / completed_steps are all null; nothing to surface.

Cycling:
- `signals.execution.*` analog (whatever cycling exposes about plan compliance).
- `cross_workout` already drops when `is_mixed_effort` — same drop here when `is_unplanned`. Whole-workout NP vs typical rides is a legitimate comparison even for unplanned rides, BUT the comparison should use the variance-gate-filtered pool (D-034) — so the existing cross_workout block stays as-is for unplanned steady rides, drops for unplanned mixed-effort rides.

**Add an unplanned-mode prompt rule** to `COACHING_SYSTEM_PROMPT` (run) and the cycling prompt:

```
UNPLANNED MODE — when the user message includes "UNPLANNED SESSION" and NO "EXECUTION vs PLAN" block:
- This workout has no linked plan. There was no prescribed target.
- DO NOT scold the athlete for "missing a target" or "running outside the prescribed range." There was no range.
- DO NOT invent what the workout "should have been" from duration alone (a 40-min run is not necessarily a tempo).
- INTERPRET the run on its own terms:
  • HR-to-pace efficiency: did HR stay controlled for the pace held? Use the pace-normalized drift values that already account for pace changes.
  • Terrain reading: when elevation data is present, did the pace variance TRACK the elevation profile (slow miles on climbs, fast miles on descents)? GAP pace is the truth — raw pace swings on rolling terrain are not effort variation. Read the climb→pace and descent→pace correspondence directly. The TERRAIN row tells you what happened underfoot; the GAP value tells you what the body actually did.
  • Conditions: heat/humidity/wind contributions are still load signals.
  • Route history: if ROUTE / FAMILIAR SEGMENTS context is present, compare today against past efforts on the same ground.
- LEAD with the most interesting observation visible in the actual data, not with a verdict on plan compliance.
```

The terrain-in-narrative gap (raised in the State/Performance audit) folds in here: when `is_unplanned`, the LLM is explicitly told to read pace variance through the elevation profile rather than treating raw pace swings as effort variation.

**User-message block change** in `buildUserMessage` (`ai-summary.ts:455-559`):
- When `isUnplanned`, skip the entire `EXECUTION vs PLAN` section (`:492-506`).
- Emit a one-liner `UNPLANNED SESSION` block at the top so the LLM sees the mode flag clearly.

### 2.4 Display

No client changes required. `AdherenceChips.tsx` already null-safe:
- `:55` returns null when `noPlannedCompare`.
- `:88-89` returns null per-chip when value is null.
- `:70-72` `allZero` short-circuit hides chips when all four are 0 (the cycling-current-case fallback that becomes unneeded once nulls flow through).

After this spec ships:
- An unlinked run: server returns `{ execution_score: null, pace_adherence: null, duration_adherence: null }`. Chips disappear. (Today: chips render with the synthesized-target percentages.)
- An unlinked ride: same nulls. Chips disappear cleanly. (Today: chips show "0% / 0% / 0%" technically, hidden by the `allZero` short-circuit. After this spec, the short-circuit becomes redundant — leave it as defense-in-depth.)
- An unlinked swim: same nulls. Chips disappear. (Today: chips show "100% / 100% / 100%" — the most misleading of the three.)

### 2.5 What stays computed for unlinked workouts

Single-workout signals that don't depend on a plan are still honest and still surfaced:
- Pace, distance, duration, GAP pace.
- HR drift (pace-normalized), terrain contribution.
- Pacing CV, variability index, power variability.
- TERRAIN row, ROUTE history, weather.
- `is_mixed_effort` (D-034) — computed from variance signals, not from plan adherence.
- `vs_similar` pool comparison — but only against the same-category pool (already type-filtered via `getComparableTypeKeys`); for unlinked workouts the LLM should anchor on this when sample size is sufficient.

---

## 3. Affected files

Server only.

| File | Change |
|---|---|
| `analyze-running-workout/index.ts` | Delete fake-interval synthesis block (`:504-538`). Adherence fields become null when no linked plan. |
| `analyze-cycling-workout/index.ts` | Skip adherence calculation block (`:1711-1757`) when `!workout.planned_id`. Emit null fields. |
| `analyze-swim-workout/index.ts` | Change `100` default to `null` (`:342-344`). Null-propagate adherence fields (`:474-477`). |
| `_shared/session-detail/types.ts` | Add `classification.is_unplanned: boolean`. |
| `_shared/session-detail/build.ts` | Compute `is_unplanned = !plan_context.planned_id`. Surface on contract. |
| `_shared/fact-packet/ai-summary.ts` | Thread `isUnplanned` through `toDisplayFormatV1` + `buildUserMessage`. Drop `signals.execution.pace_vs_range` / `distance_deviation` / `note` and the `interval_execution` block when unplanned. New `UNPLANNED MODE` rule in `COACHING_SYSTEM_PROMPT`. |
| `_shared/cycling-v1/ai-summary.ts` | Same shape — `isUnplanned` parameter, drop execution-vs-plan signals from LLM input, new UNPLANNED MODE rule. |
| `_shared/fact-packet/build.ts` | `execution.assessed_against` should be `'actual'` when unplanned (not `'plan'`). This makes the existing client guard in `AdherenceChips.tsx:60` fire too, as a defense-in-depth layer. |

No client changes. Spec contract is server-side; client renders off the new `is_unplanned` flag and the null adherence values.

---

## 4. Deploy scope

Per `CLAUDE.md` deploy policy:

```
supabase functions deploy \
  analyze-running-workout \
  analyze-cycling-workout \
  analyze-swim-workout \
  workout-detail \
  recompute-workout \
  bulk-reanalyze-workouts \
  ingest-activity \
  --project-ref yyriamwvtvzlkumqrvpm
```

- Run + cycling + swim analyzers — primary changes.
- `workout-detail` — picks up `_shared/session-detail/build.ts` change (`is_unplanned` surfacing).
- `recompute-workout`, `bulk-reanalyze-workouts`, `ingest-activity` — route to the analyzers per orchestrator pattern.
- `coach`, `compute-snapshot`, `compute-facts` — don't consume `is_unplanned` (yet). No redeploy.

**No backfill** — stale-until-touched:
- Old rows render with synthesized-target adherence numbers until next ingest/recompute touches them.
- Acceptable per D-034 precedent. The defense-in-depth `assessed_against = 'actual'` flag on the client (`AdherenceChips.tsx:60`) catches the worst-case case for newly-built session_detail; older `workout_analysis` rows with the bug are unchanged until re-analyzed.

---

## 5. Test cases

Add to existing `_shared` test files; new file if needed.

**Run:**
- `unlinked easy 40-min run → performance.execution_adherence === null` (no synthesized tempo target).
- `unlinked easy 40-min run → ai-summary input has no signals.execution.pace_vs_range`.
- `linked easy 40-min run → existing behavior preserved (no regression)`.

**Cycling:**
- `unlinked ride → performance.execution_score === null AND power_adherence === null`.
- `unlinked ride → power_variability still computed (NP, CV, VI)`.
- `linked ride → existing behavior preserved`.

**Swim:**
- `unlinked swim → performance.execution_adherence === null` (NOT 100).
- `unlinked swim → pace_adherence === null`.
- `linked swim with intervals → existing behavior preserved`.

**Shared:**
- `session_detail_v1.classification.is_unplanned === true when no planned_id`.
- `session_detail_v1.execution.assessed_against === 'actual' when unplanned`.
- `ai-summary.toDisplayFormatV1 with isUnplanned=true drops signals.execution.pace_vs_range`.
- `ai-summary.toDisplayFormatV1 with isUnplanned=true emits UNPLANNED SESSION block in buildUserMessage`.

---

## 6. Decision log entry (draft)

Filed as D-035 (D-034 is the previous most-recent decision per `docs/DECISIONS-LOG.md`):

> **D-035 — Unlinked workouts return null adherence, not synthesized or default values; INSIGHTS interprets them on their own terms.**
>
> Why: Three different analyzers handled the no-linked-plan case three different wrong ways. Run synthesized a fake target (`tempo_run` at 10K pace for a 30-60 min run, etc.) and scored against it, then INSIGHTS scolded the athlete for "missing the target." Cycling emitted 0% adherence (hidden by a client `allZero` short-circuit, but the LLM saw zeros). Swim defaulted to 100% adherence — perfect score for any unlinked swim, regardless of execution.
>
> Decision: All three analyzers return `null` for `execution_adherence`, `pace_adherence`, `duration_adherence`, `completed_steps`, `total_steps` when no linked plan exists. New `is_unplanned` flag on `session_detail_v1.classification` for one canonical signal. LLM input drops the prescribed-range signal when unplanned and gains a UNPLANNED MODE prompt rule that tells the LLM to interpret on the workout's own terms — HR-to-pace efficiency, terrain via GAP, conditions, route history. The terrain-in-narrative gap (raised earlier) folds in here: the prompt explicitly tells the LLM to read pace variance through the elevation profile rather than treating raw pace swings as effort variation.
>
> Alternative considered: keep synthesizing targets but flag them as "estimated." Rejected — the synthesized target IS the bug. There is no honest way to grade adherence to a target the athlete never set. Returning null is the right shape; the LLM has plenty of other signals to interpret the workout (single-workout signals stay computed: GAP, HR drift, variability, vs_similar comparisons).
>
> Alternative considered: client-side hiding of synthesized-target chips via a new flag. Rejected — the bug is in the data, not the display. Fixing it at the source means the LLM input is also honest, which fixes the INSIGHTS narrative as a side effect. Per the D-034 precedent (server computes, client renders).
>
> Plan intent is sacred (D-034 carryover) — this spec doesn't change classification rules for linked workouts. It only changes what happens when there's nothing to be linked to.

---

## 7. Open questions

1. **`workout_type` from duration heuristic** — the fact-packet builder labels unlinked workouts with `workout_type: easy_run | tempo_run | long_run | interval_run` from duration alone (`fact-packet/build.ts:340-345`). Should this also be dropped for unlinked workouts (just label as `'run'` or `'unknown'`), or kept as a soft hint for the LLM with no adherence consequence? Spec proposal: **keep the label** but ensure the LLM prompt treats it as a hint, not a target. Confirm.
2. **vs_similar for unlinked workouts** — sample-size + variance-gate filter from D-034 already applies. Unlinked steady runs get a legitimate "vs your typical runs" comparison; unlinked mixed-effort runs drop `vs_similar` per D-034. No new rule needed. Confirm.
3. **Swim `duration_adherence: 100` hardcode** — this is wrong for *linked* swims too (`analyze-swim-workout/index.ts:476` has a TODO). Fix here, or file as a separate follow-up? Spec proposal: **null when unplanned only; leave the linked-swim TODO as-is** to keep scope tight.
4. **Cycling cross_workout vs_similar in unplanned mode** — keep showing whole-ride NP-vs-typical comparison even when unplanned (it's a legitimate single-workout signal), or drop in unplanned mode the way we drop in mixed-effort mode? Spec proposal: **keep it** — comparing today's unplanned tempo ride to your recent same-classified-type rides is honest signal, unlike adherence-to-a-fake-target. Confirm.

---

## 8. Non-goals (explicit)

- **Workout-to-plan matching logic.** Out of scope. Date tolerance, duration band, ambiguity guard all stay as-is. Genuinely unplanned workouts exist regardless of matching quality.
- **Swim `duration_adherence` calculation for linked swims** — separate follow-up.
- **State-side consumption of `is_unplanned`** (e.g., a State BODY note "3 of 5 runs this week were unplanned"). Separate change if desired.
- **Backfill of older rows with synthesized adherence numbers.** Stale-until-touched, per D-034 precedent.
