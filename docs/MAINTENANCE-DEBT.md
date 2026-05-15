# Maintenance Debt

Tracking items that aren't urgent but should be addressed before they cause a nasty surprise. Each entry: where it lives, what it is, why it's deferred, and an estimate for the cleanup pass.

This file replaces the inline "Maintenance debt" section in `docs/RUNNING-CYCLING-DELTA.md` going forward — that section was a placeholder until a dedicated file warranted creation. The migration tracking divergence (filed there 2026-05-14) stays linked from there for now; future entries land here.

---

## Migration tracking divergence — `supabase/migrations/` vs `schema_migrations`

**Status:** open, not blocking. Surfaced 2026-05-14 during Tier 2 items 3+4 deploy.

**Problem:** Local `supabase/migrations/` has 35+ migration files going back to 2026-01-06 that the remote `schema_migrations` tracking shows as unapplied — but the schema is clearly in production. The migrations were applied via the Supabase SQL editor or another path that bypassed `supabase migration up`, so the CLI-tracked state diverged from reality.

**Why it bites:** `supabase db push` walks the unapplied list. If anyone runs it (especially in CI or a fresh environment seed), it will attempt to re-run all 35+ — many will no-op via `IF NOT EXISTS` guards but several `CREATE TABLE` / `CREATE FUNCTION` statements without those guards will throw, leaving the migration in a partial-applied state. Caught 2026-05-14 by inspecting `supabase migration list` before running `db push`; pivoted to applying the new ALTER TABLE statements directly via SQL editor.

**Fix:** for each of the 35+ historical timestamps, run `supabase migration repair --status applied <timestamp>` to mark them as applied without re-running. After reconciliation, future `supabase db push` would only apply genuinely-new migrations.

**Estimate:** 30-60 min to script the 35 repair commands and run them.

**Cross-ref:** also linked from `docs/RUNNING-CYCLING-DELTA.md` "Maintenance debt" section.

---

## `analyze-cycling-workout/index.ts` — 13 pre-existing deno-check type errors

**Status:** open, not blocking. Catalogued 2026-05-14 during Tier 3 item 9 audit. One additional error (TS2304 `Cannot find name 'zoneTime'`) was a real latent runtime bug — fixed in commit `bb711092`. The remaining 13 are type-drift items.

**Why it matters:** the file ships and works at runtime, but each error is a place where the declared types don't match what runtime code actually constructs/reads — a future change in those areas could ship a real bug that the type system would have caught if the types were aligned.

**The 13 errors group into 5 categories:**

### Cat A — `performance.execution_score` not on local type (5 occurrences) — ✅ DONE

**Resolved** in the Tier 3 item 10 commit (cycling cross-workout queries) on 2026-05-14. The new vs-similar code reads `performance.execution_score`, which surfaced this debt; fixed by adding `execution_score: executionAdherence` (alias of execution_adherence) to the performance object construction site at `analyze-cycling-workout/index.ts:1738`. Net: 5 pre-existing + 1 new error from cross-workout queries → 0. Same value, two field names — closes the structural narrowness gap without changing runtime semantics.

Original problem (kept for institutional memory):
> `performance` was locally typed as `{ execution_adherence: number; power_adherence: number; duration_adherence: number; completed_steps: any; total_steps: any }` but runtime constructs it with an additional `execution_score` field that downstream code reads. Type declaration was narrower than reality.

### Cat B — `trend_points` not in `VsSimilarV1` shared type (3 occurrences in `_shared/fact-packet/queries.ts`)

The `VsSimilarV1` shared interface in `_shared/fact-packet/types.ts` doesn't declare `trend_points`, but multiple call sites in queries.ts construct objects with that field. Drift in a shared interface that needs widening.

**Fix:** add `trend_points?: ...[]` to the `VsSimilarV1` interface declaration. ~2-3 lines. Closes all 3.

### Cat C — Implicit `any` on `intervals.filter(i => …)` callbacks (2 occurrences at lines 1669, 1675)

```ts
const workIntervals = intervals.filter(i => …);
const allIntervalsWithPower = intervals.filter(i => i.power_range && i.executed);
```
`intervals` is typed loosely upstream so `i` infers as `any`. Cosmetic — runtime fine.

**Fix:** annotate `i: any` explicitly, or tighten the upstream `intervals` type. ~2 lines. Closes both.

### Cat D — `weekIntent === 'unknown'` against narrower union (2 occurrences in `_shared/plan-context.ts`)

The union for `weekIntent` doesn't include `'unknown'` but defensive checks for it remain in code. The check can never succeed per the type system, but the runtime data shape might still produce 'unknown' strings (legacy plans?). Worth investigating before fixing — either remove the dead check, or widen the type to `'unknown' | …`.

**Fix:** investigate first (5 min), then either remove the check or widen the type. ~1-3 lines.

### Cat E — `max_heart_rate` on `{}` (1 occurrence at line 1679)

```ts
const hrAnalysis = analyzeHeartRate(sensorData, intervals, baselines.max_heart_rate);
```
`baselines` is typed as `{}` (empty object) at this call site so accessing `max_heart_rate` flags as missing-property. Underlying issue: `baselines` arrives loosely-typed from upstream resolution. Likely the source object IS that field set, just the type lost it.

**Fix:** type `baselines` properly at the call site (cast or interface) to include the fields actually used. ~1 line.

**Total cleanup time estimate:** ~1 hour for all 13 (most are one-line type-declaration fixes; Cat D needs the 5-min investigation first). Worth doing as a single focused pass when someone next has reason to touch this file. Not urgent — runtime behavior is fine for all 13.

---

## Cross-sport analysis-key bleed — spread-merge preserves stale foreign-discipline keys

**Status:** 🔧 fix in progress (2026-05-14). Surfaced by a real bug: cycling workout
`4ddc3305-b9ea-4ed1-9542-6865d88311b6` rendered running pacing copy ("130s/mi faster,
Mile 9 at 2:51/mi") in the UI.

**Problem:** All `analyze-{sport}-workout` functions merge into `workout_analysis`
(`{ ...existingAnalysis, ...analysisPayload }`) rather than replacing — by design, to
preserve cross-cutting fields. But when a workout is analyzed by the *wrong* sport's
analyzer historically (mis-routed `type`, or a `recompute-workout` / `bulk-reanalyze`
mis-classification), that analyzer's sport-specific keys get written. A later *correct*
re-analysis can't overwrite keys it doesn't produce, so they persist:

- `analyze-running-workout` writes `mile_by_mile_terrain`, `score_explanation`,
  `summary`, top-level `classified_type`, `heart_rate_summary`, `recomputed_at`.
- `analyze-cycling-workout`'s payload has none of those keys → spread-merge leaves them.
- Display layer (`_shared/session-detail/build.ts` + `SessionNarrative.tsx` /
  `UnifiedWorkoutView.tsx`) reads several of them without a discipline guard → run
  pacing copy renders on a ride.

**Why it matters:** any sport pair has this exposure (run↔ride↔swim↔strength). The
display fix only patches one screen; the data fix stops bad data propagating to *every*
consumer. Same class as the "Run — Tempo vs Run Intervals" divergence in
`docs/ENGINE-STATE.md` (multiple surfaces, one bad upstream source).

**Fix (2026-05-14):**
- Fix 1 (contract): `analyze-cycling-workout` explicitly nulls run-only keys in its
  payload so the spread-merge scrubs stale run analysis. Converts the silent merge-gap
  into an explicit cross-sport scrub. Unit-tested (`_shared/cross-sport-key-scrub.test.ts`).
- Fix 2 (display): `session-detail/build.ts` sport-guards the run-shaped reads so even
  a dirty row can't render run copy on a ride. Three guard sites:
  - 2a: `race_debrief_text` (`type === 'run' &&`, ~line 312).
  - 2b: `workout-detail` goal-race mile-split debrief block (`isRunSession` gate).
  - **2c (the actual symptom source): `buildAnalysisDetailRows` pacing-split block
    (~lines 772-848).** This builds the "Pacing" row — `Negative split — pacing Ns/mi
    faster`, `Fastest: Mile N at M:SS/mi`, structured `Work intervals faded Ns/mi`. It
    reads `computed.analysis.events.splits.mi`, which `compute-workout-analysis`
    populates for ANY GPS workout including a ride, so it rendered on the cycling
    goal-race workout. `buildAnalysisDetailRows` had no discipline parameter at all;
    fixed by threading a `sport` arg from the call site and bailing the whole
    pace-per-mile block when `sport !== 'run'`.

  **Process note for institutional memory:** the symptom string was first mis-traced
  to `race_debrief_text` (2a) and the goal-race debrief block (2b) and "fixed" + shipped
  in commit `0a358d49` — the UI still showed the bug because neither path generated the
  rendered "Pacing" row. The real source (2c) is a separate, parameter-less helper.
  Lesson: confirm the *exact rendered string's* generator (grep the literal copy →
  `rows.push({ label: 'Pacing', … })`) before declaring a display-path root cause;
  plausible adjacent paths are not proof.

**Follow-up not in this pass:** the same scrub is needed in `analyze-swim-workout` and
`analyze-strength-workout` (and run's analyzer should scrub cycling-only keys like
`fact_packet_v1` power facts / `limiter_v1` / `achievements_v1`). A shared
`stripForeignDisciplineKeys(discipline)` helper would generalize this — deferred until a
second sport pair shows the symptom. Filed here so it's not lost.

---

## Cycling NP field misnamed `normalized_power` vs persisted `normalized_power_w` — ✅ DONE

**Status:** ✅ fixed 2026-05-15 (commit below). Found while diagnosing why the new
cycling Power row never rendered on workout `4ddc3305`.

**Problem:** `buildCyclingFactPacketV1` (`_shared/cycling-v1/build.ts:173`) persists
normalized power into `fact_packet_v1.facts` under the key **`normalized_power_w`**
(rounded int). But `analyze-cycling-workout/index.ts` read `facts.normalized_power`
(no `_w`) in two places — the guard at `:288` and the value at `:292` — *and* declared
the param type at `:225` as `normalized_power?: number` (also no `_w`). Because the
type annotation matched the (wrong) reads, `strict: false` / `noImplicitAny` off meant
no compile error ever surfaced. Net effect: the analyzer's "Intensity" technical
insight (`Normalized power {NP}W at IF {x.xx} — {type} effort`) was **silently dead for
every cycling workout** — the guard `typeof facts.normalized_power === 'number'` was
always false. `session-detail/build.ts`'s new Power row mirrored the broken read and
inherited the same defect.

**Why it matters:** classic quietly-misnamed-field bug masked by a type annotation that
agreed with the wrong code instead of the data producer. It silently suppressed a
user-facing insight with zero error signal. Any future reader copying the analyzer's
read pattern (as the Power row did) propagates the bug.

**Fix (2026-05-15):** `facts.normalized_power` → `facts.normalized_power_w` at
`index.ts:288` and `:292`; type at `:225` corrected to `normalized_power_w?`;
`build.ts` Power row read corrected to `cf?.normalized_power_w` (dropped the now-redundant
`Math.round` — the field is already a rounded int). Display fix (build.ts → workout-detail)
is live without a recompute; the analyzer fix takes effect on next recompute.

---

## When to add an entry

Add to this doc when you find:
- A latent issue that's not blocking but should be fixed before it surprises someone
- Type drift / dead code / quietly-misnamed fields
- Schema or migration tracking that diverges from operational reality
- "Works in production but only because [accidental fallback / try-catch / dead branch]"

Don't add for:
- Real bugs — fix them
- Style preferences — those go in code review
- Future feature ideas — those go in the relevant punch list / delta map

When an item is fixed, mark it ✅ done with the commit hash and date; keep the entry for institutional memory rather than deleting.
