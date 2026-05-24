# Run within-workout HR drift (aerobic decoupling), GAP-corrected — spec

Status: **DRAFT — awaiting approval.** Proposed: D-036.

**Scope (one thing, fully).** Make the run analyzer's aerobic-decoupling computation grade-adjusted, surface the sample-level value to INSIGHTS, give the LLM a run-specific decoupling prompt rule. Out: per-segment HR-vs-history (writer chain is broken, see §6), whole-route HR-vs-history (feature build), `run_easy_hr_trend` rename (separate cleanup, §6).

---

## 1. The bug

Two decoupling values are computed per run today; both use raw pace, both lie on hilly terrain.

| Site | Method | Persisted to | LLM-surfaced? |
|---|---|---|---|
| `analyze-running-workout/lib/heart-rate/efficiency.ts:21 calculateEfficiency` | Sample-level. Splits paced-HR samples in half after 10 min warmup; `pace_s_per_mi / hr` ratio first vs second half; decoupling % = `(early − late) / early`. Skipped for intervals/hill_repeats. Needs ≥20 min after warmup. | `workout_analysis.heart_rate_summary.decouplingPct` (via `heart-rate/index.ts:512`) | **No** |
| `_shared/fact-packet/utils.ts:125 calculateCardiacDecouplingPct` | Segment-level. Filters `facts.segments[]` to non-warmup/non-cooldown, splits in half, weights `pace/hr` by duration. | `workout_analysis.fact_packet_v1.derived.cardiac_decoupling_pct` (`build.ts:876`) | **Yes** — `ai-summary.ts:834` ships it as `signals.cardiac_decoupling: "X%"`; the COACHING prompt at `:417-432` translates the drift signal but doesn't single out decoupling. |

Both read **raw pace**. The HR analyzer call at `analyze-running-workout/index.ts:1115` passes raw `sensorData`; the GAP-enriched `effectiveSensorData` constructed inside `granular-pace.ts:873-885` never escapes the pace-adherence path. The segment-level computation reads `facts.segments[].pace_sec_per_mi` which is the raw `it.executed.avg_pace_s_per_mi` from `computed.intervals` (`build.ts:329`).

On a run with climbs late, raw pace slows for terrain reasons → `pace/hr` drops in the second half → decoupling reads high. The athlete didn't lose aerobic efficiency; the route did. Descents late → decoupling reads suspiciously low. Either way the LLM gets a contaminated number and INSIGHTS makes a fitness claim about a terrain artifact.

---

## 2. Design

### 2.1 GAP-correct the sample-level decoupling

Lift the GAP enrichment out of `calculatePrescribedRangeAdherenceGranular` so the HR analyzer can see it too. Two viable shapes:

- **Option α** — compute the GAP-enriched sample series once at the top of `analyze-running-workout/index.ts` (after sensor extraction at `:540-582`, before the HR analyzer call at `:1115`); pass the enriched series in. Both the HR analyzer and the pace-adherence calculator consume the same `effectiveSensorData`. Cleanest; lifts a shared concern up.
- **Option β** — leave the GAP enrichment inside `calculatePrescribedRangeAdherenceGranular`, have it return the enriched series alongside the adherence result, thread it into `analyzeHeartRate`. Smaller diff; awkward returning a sample array.

**Choose α.** GAP enrichment is a sample-level transform with no dependency on the pace-adherence calculation; it shouldn't be locked inside one consumer.

After α: `analyzeHeartRate(effectiveSensorData, hrAnalysisContext)` at `:1115`. `calculateEfficiency` then reads `s.pace_s_per_mi` from the GAP-corrected samples — same code, terrain-neutral output.

When `hasUsableElevation(sensorData) === false` (no usable elevation series), `effectiveSensorData === sensorData` (the existing identity case at `granular-pace.ts:873`) and the analyzer runs on raw pace as before. No regression for flat-area users or no-GPS sessions.

### 2.2 Decoupling basis flag

Persist `decoupling_basis: 'gap' | 'raw' | null` alongside the existing `decouplingPct` so downstream consumers (and tests) know which input fed the ratio.

- Set on `workout_analysis.heart_rate_summary.decouplingBasis`.
- Mirror through the fact-packet `derived` block as `derived.decoupling_basis`.
- Surface on `session_detail_v1` (see §2.4).

Basis is `'gap'` when `hasUsableElevation(sensorData) === true` at the analyzer entry; `'raw'` when it's false; `null` when decoupling itself is null (e.g., interval workout, < 20 min of samples).

### 2.3 Point INSIGHTS at the sample-level decoupling

Today's LLM input pulls `cardiac_decoupling` from the segment-level path (`derived.cardiac_decoupling_pct`). Switch to the sample-level value, which is more rigorous (warmup-skipped, sample-level granularity, gated on data sufficiency).

- In `analyze-running-workout/index.ts`, after sample-level decoupling lands on `heart_rate_summary.decouplingPct`, write that same value into `fact_packet.derived.cardiac_decoupling_pct` (replacing the segment-level value). One source of truth; the segment-level `calculateCardiacDecouplingPct` becomes unused for runs.
- Cycling continues to use its own path; this change is run-only.
- `ai-summary.ts:834` already reads `derived.cardiac_decoupling_pct` — no change needed there. The output is now sample-level + GAP-corrected automatically.
- Add `derived.decoupling_basis` to the display packet (new field in `signals` block) so the prompt can gate on it.

### 2.4 Run-specific decoupling prompt rule

Append to `COACHING_SYSTEM_PROMPT` in `_shared/fact-packet/ai-summary.ts` (mirroring the cycling rule at `_shared/cycling-v1/ai-summary.ts:298-303`):

```
AEROBIC DECOUPLING (when packet has signals.cardiac_decoupling with decoupling_basis === 'gap'):
- This is grade-adjusted: pace input to the decoupling ratio used GAP, not raw pace.
  Terrain effects are removed. The number reflects real cardiovascular efficiency drift.
- Translate the value, never print the percentage:
  • < 3% → "heart rate stayed controlled as effort held — strong aerobic efficiency."
  • 3-5% → "modest efficiency drift over the second half — typical for the duration."
  • 5-8% → "noticeable efficiency drop — your body worked harder to maintain effort late."
  • ≥ 8% → "significant decoupling — this effort pushed your aerobic limits, or fatigue accumulated."
- DO NOT use this rule when decoupling_basis === 'raw' — the number includes terrain, you can't
  attribute it to fitness honestly. Treat raw-basis decoupling as inconclusive; describe what
  HR did in plain terms instead.
- Connect it to the existing HR drift narrative: drift = "did HR climb?", decoupling = "did
  efficiency drop?" — they're related but distinct. Drift can be terrain-driven (use the
  existing drift_explanation field); decoupling at GAP basis can't.
```

### 2.5 session_detail_v1 surface

Surface decoupling and its basis on the contract so future client/state surfaces can render off it (per the D-034 / D-035 server-computes-client-renders pattern):

```ts
// In SessionDetailV1.classification (alongside is_mixed_effort, is_unplanned):
decoupling: {
  pct: number | null;
  basis: 'gap' | 'raw' | null;
  assessment: 'excellent' | 'good' | 'moderate' | 'high' | null;
} | null;
```

The `assessment` already exists in `efficiency.calculateEfficiency` output but isn't persisted today — pull it through. Client doesn't render anything new in this slice; the field is there for downstream consumers (a future "Aerobic" row on the Performance screen, a State signal, etc.).

---

## 3. Affected files

| File | Change |
|---|---|
| `analyze-running-workout/index.ts` | Lift GAP enrichment from inside `calculatePrescribedRangeAdherenceGranular` to top-level after sensor extraction. Pass `effectiveSensorData` to `analyzeHeartRate`. Write sample-level decoupling + basis + assessment into `heart_rate_summary` and `fact_packet.derived`. |
| `analyze-running-workout/lib/adherence/granular-pace.ts` | The lift means `calculatePrescribedRangeAdherenceGranular` either accepts pre-enriched samples or does no-op re-enrichment. |
| `analyze-running-workout/lib/heart-rate/efficiency.ts` | Surface `decoupling.assessment` upward (already computed at `:84-95`, just thread through). |
| `analyze-running-workout/lib/heart-rate/index.ts` | Build summary surfaces `decouplingPct`, `decouplingAssessment`, `decouplingBasis`. |
| `_shared/fact-packet/build.ts` | Stop calling `calculateCardiacDecouplingPct` for runs; use the sample-level value from analyzer output. Persist `decoupling_basis` on `derived`. |
| `_shared/fact-packet/types.ts` | Add `derived.decoupling_basis: 'gap' \| 'raw' \| null`. |
| `_shared/fact-packet/ai-summary.ts` | Surface `decoupling_basis` in display packet. Add the AEROBIC DECOUPLING prompt rule. |
| `_shared/session-detail/types.ts` | Add `classification.decoupling: { pct, basis, assessment } \| null`. |
| `_shared/session-detail/build.ts` | Surface from `heart_rate_summary` into `classification.decoupling`. |

No client changes. (Per D-034 / D-035 precedent — server computes, client renders. The decoupling field is on the contract for future surfaces; the LLM narrative renders as INSIGHTS prose via the existing path.)

---

## 4. Deploy scope

```
supabase functions deploy \
  analyze-running-workout \
  workout-detail \
  recompute-workout \
  bulk-reanalyze-workouts \
  ingest-activity \
  --project-ref yyriamwvtvzlkumqrvpm
```

Cycling and swim analyzers untouched. `_shared/fact-packet/ai-summary.ts` is the only shared file that materially changes prompt behavior for both sports — but the new AEROBIC DECOUPLING rule is gated on `decoupling_basis === 'gap'` which only the run analyzer sets, so cycling narratives are unaffected.

No backfill — stale-until-touched per D-034 / D-035 precedent. Old workouts keep their segment-level decoupling number until next recompute. The contract guard (basis flag) means the LLM treats older-row data correctly even before re-analysis.

---

## 5. Test cases

Add `*.test.ts` under `_shared/session-detail/`.

- **GAP-corrected decoupling** — synthetic flat run with HR drift → `decouplingPct > 0`, `decouplingBasis === 'gap'`.
- **GAP-corrected on hilly terrain** — synthetic hilly run, GAP pace constant, raw pace varies → `decouplingPct ≈ 0` (terrain neutralized), `decouplingBasis === 'gap'`.
- **No usable elevation** — synthetic run with elevation series absent → `decouplingBasis === 'raw'`, decoupling computed on raw pace (regression case).
- **Interval workout** — `workoutType === 'intervals'` → `decouplingPct === null` (existing skip behavior preserved).
- **< 20 min after warmup** — short run → `decouplingPct === null` (existing data-sufficiency gate preserved).
- **session_detail_v1.classification.decoupling** populated correctly from `heart_rate_summary` for each of the above.
- **ai-summary display packet** — `signals.cardiac_decoupling` is the sample-level value, basis flag surfaced, segment-level path no longer wins.
- **AEROBIC DECOUPLING prompt rule** is included only when basis is 'gap' (string presence check).

---

## 6. Out of scope

### Per-segment HR-vs-history — separate follow-up
Investigation found the column exists (`grade_adjusted_pace_s_per_km`, with `_s_per_km`) and 42 rows from 3 workouts are populated. But the writer chain in `compute-facts/index.ts:421-451 writeSegmentProgressMetric` references columns that don't exist on the live table (`grade_adjusted_pace_sec_per_km` at `:666`, plus `metric_date` and `avg_pace_sec_per_km` in the Variant C fallback). PostgREST returns `42703 column does not exist`, the try/catches swallow the error, and recent workouts have not been writing to this table at all. The 42 historical rows are from a one-off backfill or older code path.

Wiring the discarded GAP through the comparison output (`build.ts:633-678` → `segment_comparisons[]`) is small — but useless until the writer is fixed and segments are backfilled for any workout the comparison wants history against. Separate spec needed.

### Whole-route HR-vs-history — separate feature
No GAP column on `route_progress_metrics` (uses `effort_adjusted_pace_sec_per_km` which is HR-adjusted, not grade-adjusted). No "today vs route average at GAP" comparison computed anywhere. Real feature: new migration, new compute, new contract field, new LLM block.

### `run_easy_hr_trend` rename
The snapshot field at `compute-snapshot/index.ts:529 run_easy_hr_trend` is misnamed — its value is the % change in *pace* at easy HR, not an HR trend. Recommended rename to `run_easy_pace_at_hr_trend`, ideally with a new real `run_easy_hr_trend` computed as HR-delta-at-constant-pace. **Not a one-liner** (snapshot field, consumers in `compute-snapshot:407-427` aerobicDirection, D-033's `resolveRunEasyPace`, and any State surface that reads it would need updating). Filed as a standalone cleanup; not folded into this spec.

---

## 7. Decision log entry (draft)

> **D-036 — Run aerobic decoupling computed on grade-adjusted pace; INSIGHTS interprets it as a real fitness signal, not a terrain artifact.**
>
> Why: Run decoupling exists in two places (sample-level in `efficiency.calculateEfficiency`, segment-level in `_shared/fact-packet/utils.ts`), both consume raw pace. On hilly terrain, decoupling reads high not because efficiency dropped but because raw pace slowed up the climbs in the second half. INSIGHTS today surfaces the segment-level value to the LLM; the COACHING prompt has no specific decoupling rule for runs (the cycling prompt does); the athlete reads a fitness claim about a terrain artifact.
>
> Decision: GAP enrichment lifted out of `calculatePrescribedRangeAdherenceGranular` to the top of the run analyzer; the HR analyzer now reads GAP-corrected samples. Sample-level decoupling (more rigorous than segment-level) becomes the single source of truth for runs; segment-level path stays for cycling only. Persist a `decoupling_basis: 'gap' \| 'raw' \| null` flag. New AEROBIC DECOUPLING prompt rule, gated on `basis === 'gap'`, gives the LLM a run-specific translation table and explicitly tells it to treat raw-basis decoupling as inconclusive (not a fitness claim).
>
> Alternatives considered:
> - **Keep raw-pace decoupling with a "terrain noisy" caveat in the prompt.** Rejected — the number itself is wrong; no caveat in the world makes a contaminated input read honestly.
> - **Compute decoupling on segment-level GAP via segment_progress_metrics.** Rejected — the underlying writer chain is broken (see SPEC §6); fixing it is a separate, larger piece of work and unrelated to within-workout decoupling.
> - **Add a new field `grade_adjusted_decoupling_pct` alongside the existing one.** Rejected — splits the signal; the segment-level `cardiac_decoupling_pct` becomes vestigial. Replacing the run-side value with the GAP-corrected sample-level value is the right move; cycling-side path is separate code.

---

## 8. Open questions

1. **Confirm Option α (lift GAP enrichment to top of run analyzer) is the right shape** vs Option β (return enriched series from `calculatePrescribedRangeAdherenceGranular`). Default α. Confirm.
2. **`decoupling.assessment` thresholds** in `efficiency.ts:84-95` (excellent < 3%, good < 5%, moderate < 8%, high ≥ 8%) match the prompt translation table verbatim. Confirm these stay, or want to retune now that they're GAP-corrected (the new numbers will be smaller on hilly routes — old "moderate" might become "good"). Default: keep as-is for now, retune after 2 weeks of production data.
3. **Persist `decoupling_basis` only on run analyzer output**, or also on cycling's path for symmetry? Default: run only — cycling has no terrain-confound problem (NP smooths it). Confirm.

---

## 9. Non-goals (explicit)

- Per-segment HR-vs-history comparison.
- Whole-route HR-vs-history comparison.
- `run_easy_hr_trend` rename.
- State surface that consumes `classification.decoupling`.
- Backfill of older `workout_analysis` rows to populate the new fields.
- Any cycling-side changes.
