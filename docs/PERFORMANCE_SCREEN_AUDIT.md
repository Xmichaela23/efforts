# Performance Screen Audit (MobileSummary.tsx)

## Overview

The Performance tab renders a planned-vs-executed comparison table with columns: **Segments**, **Pace**, **Dist**, **Time**, **BPM**. This audit traces data flow and identifies gaps.

---

## 1. Data Sources (Priority Order)

| Column | Primary Source | Fallback |
|--------|----------------|----------|
| **Planned label** | `row?.planned_label` or `plannedLabelStrict(st)` from planned steps | — |
| **Pace** | `getDisplayPace()` → `workout_analysis.detailed_analysis.interval_breakdown.intervals[].actual_pace_min_per_mi` | `interval.executed.avg_pace_s_per_mi` (computed.intervals) |
| **Dist** | `row?.executed?.distance_m` (from computed.intervals) | `overallForDisplay.distance_m` (only when idx=0 and no row) |
| **Time** | `row?.executed?.duration_s` | `overallForDisplay.duration_s_moving` for overall/single-interval rows |
| **BPM** | `row?.executed?.avg_hr` | `overallForDisplay.avg_hr` or `completedSrc.avg_heart_rate` |

---

## 2. Pace Column – Root Cause of "—"

`getDisplayPace()` (lines 944–1047) uses **two strict paths**:

1. **Path A**: `workout_analysis.detailed_analysis.interval_breakdown.intervals[]`
   - Requires: `interval_breakdown.available === true`, non-empty `intervals` array
   - Matches by: `interval_type` (warmup/cooldown/recovery/work), `interval_id`, `planned_step_id`, or `interval_number`
   - Uses: `actual_pace_min_per_mi` from matching interval

2. **Path B** (fallback): `interval.executed.avg_pace_s_per_mi` (or variants) from `computed.intervals`

**Intentionally removed**: Client-side derivation from `distance_m / duration_s` (docstring: "STRICT: do not derive pace from distance+duration on the client").

**Issues:**
- If `interval_breakdown` is missing, unavailable, or structure differs → Path A fails
- If `computed.intervals` lacks `avg_pace_s_per_mi` → Path B fails
- For collapsed "overall" row (id='overall'), step may not match any interval → both fail
- No fallback to `computed.overall.avg_pace_m_per_s` or derived pace for single-segment runs

---

## 3. Segment Display Logic (stepsDisplay)

Steps come from (in order):

1. **plannedStepsFull** – `planned.computed.steps` (full planned structure)
2. **plannedStepsLight** – `computed.planned_steps_light` (server snapshot)
3. **stepsFromUnplanned** – `workout_analysis.detailed_analysis.interval_breakdown` for unplanned runs

**Collapse behavior** (lines 660–730):

- **looksLikeAutoSplitSteady**: When planned has 8+ similar ~1km work steps (e.g. easy long run), collapses to single "overall" row
- **easyLike**: Recovery/easy/week intent → can collapse micro-steps
- Collapsed row has: `id: 'overall'`, `kind: 'overall'`, `seconds` from planned total, `pace_range` from first step

**Row matching** (lines 2478–2490):

- `row = intervalByPlannedId.get(st.id)` or `intervalByIndex.get(st.planned_index)`
- For collapsed `id: 'overall'`, no planned_step_id match → often `row === null`
- When `row` is null but `hasServerComputed`: distCell falls back to `row?.executed?.distance_m` → "—" for idx≠0; for idx=0 uses `overallForDisplay.distance_m`

**Observed mismatch**: "Work - 7 min" with 0.62 mi, 30:00, 117 bpm. Details tab shows 3.1 mi total. Likely:
- One interval (e.g. first 1 km) used for row when collapsed, or
- Planned "7 min" step duration used while executed uses overall 30 min, and distance from one interval only

---

## 4. Overall vs Details Tab Discrepancy

| Metric | Performance tab (segment row) | Details tab (readouts) |
|--------|--------------------------------|------------------------|
| Distance | 0.62 mi (from one interval?) | 3.1 mi |
| Time | 30:00 | 30:12 moving / 30:00 |
| Pace | — | 9:49/mi |
| BPM | 117 | 132 |

Details reads from top-level workout fields (`distance`, `moving_time`, `avg_heart_rate`, `computed.overall`). Performance reads from `computed.intervals` or `workout_analysis.interval_breakdown`. When segment logic collapses or picks a single interval, it can show partial data that doesn’t match the overall run.

---

## 5. Console Logging

- `getDisplayPace` logs on every call (lines 946–951, 968–973, 1018–1022)
- `MobileSummary` logs every render (lines 291–296)

Recommend removing or gating behind a dev flag for production.

---

## 6. Recommendations

### 6.1 Pace fallback for single-segment runs

For `isSingleIntervalSteadyState` or `isOverallRow` when pace is missing:
- Use `computed.overall.avg_pace_m_per_s` or derive from `distance_m / duration_s_moving`
- Keeps strict behavior for multi-interval, adds safe fallback for steady-state

### 6.2 Align collapsed row with overall data

When collapsing to "overall":
- Use `computed.overall.distance_m`, `duration_s_moving`, `avg_hr`, `avg_pace_*` for display
- Avoid using first-interval-only data for a session that represents the whole run

### 6.3 Unified interval_breakdown handling

- Confirm analyze-running-workout writes to `detailed_analysis.interval_breakdown`
- Check alignment with `granular_analysis.interval_breakdown` if both exist
- Add defensive check: if step id is 'overall', treat as whole-workout row and use overall metrics

### 6.4 Reduce debug logging

- Remove or gate `console.log` in `getDisplayPace` and `MobileSummary` render
- Use a debug flag or dev-only logging

---

## 7. File References

- **Main component**: `src/components/MobileSummary.tsx`
- **Pace logic**: `getDisplayPace()` lines 944–1047
- **Table cells**: `execCell`, `distCell`, `timeCell`, `hrVal` lines 2536–2628
- **Step collapse**: `stepsDisplay` useMemo lines 661–774
- **Server analysis**: `supabase/functions/analyze-running-workout/index.ts` → `detailed_analysis.interval_breakdown`
