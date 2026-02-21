# Adherence / Summary Feature — Legacy & Interference Audit

**No code changes.** This document only catalogs where the feature lives, legacy checks, and what may be interfering.

---

## 1. Where summary data is written (backend)

| Location | What it writes |
|----------|----------------|
| **supabase/functions/analyze-running-workout/index.ts** | `workout_analysis`: `granular_analysis`, `performance`, `detailed_analysis`, `narrative_insights` (AI), `score_explanation` (verdict string), `adherence_summary` (verdict + technical_insights + plan_impact), `mile_by_mile_terrain`. Replaces the whole `workout_analysis` object on update. |
| **supabase/functions/analyze-cycling-workout** | Writes `workout_analysis` with `narrative_insights` (as `insights`). Different shape than running. |
| **supabase/functions/analyze-strength-workout** | Writes `workout_analysis` with `performance`, `detailed_analysis`, `narrative_insights` (array). |
| **supabase/functions/analyze-swim-workout** | Writes `workout_analysis` with `narrative_insights` (insights). |

So for **running**, the canonical summary is: `adherence_summary` (structured) + `score_explanation` (legacy verdict) + `narrative_insights` (AI). AI can fail and leave `narrative_insights` null/empty.

---

## 2. Where “new format” or “complete” is enforced (likely interference)

### TodaysWorkoutsTab.tsx

- **handleWorkoutSelect (when user clicks a workout)**  
  - `hasNewFormat = analysis?.performance && analysis?.detailed_analysis && analysis?.narrative_insights`  
  - So “complete” **requires** `narrative_insights`. If AI failed or is empty, `hasNewFormat` is false.  
  - Effect: code **re-triggers analysis** instead of selecting the workout. User may never “select” and see the panel.

- **useEffect that calls analyzeWorkout(focusWorkoutId)**  
  - `hasNewFormat` = same (performance + detailed_analysis + narrative_insights).  
  - `needsAnalysis = !workout_analysis || analysis_status !== 'complete' || !hasNewFormat`.  
  - Effect: same — any run with no `narrative_insights` is treated as needing analysis again.

- **getAnalysisMetrics()**  
  - Returns non-null content **only** when `analysis.narrative_insights` is a non-empty array.  
  - If you have `adherence_summary` + `performance` + `detailed_analysis` but no `narrative_insights`, it falls through to “No AI narrative” and either returns `{ insights: [], noInsights: true }` (if selected) or `null`.  
  - Effect: Adherence tab shows “Analysis Not Available” or empty insights even when structured summary exists.

So **TodaysWorkoutsTab** effectively treats “has a usable summary” as “has narrative_insights”. It does **not** consider `adherence_summary` or `score_explanation` for “new format” or for what to show in the panel.

---

## 3. Where summary is read and rendered (multiple paths)

| Place | What it reads | Notes |
|-------|----------------|-------|
| **MobileSummary.tsx** (used in UnifiedWorkoutView) | `workout_analysis.adherence_summary`, `narrative_insights`, `score_explanation`. Renders structured (verdict + technical_insights + plan_impact), else narrative, else legacy verdict, else fallback message. | Single place that uses **all three** (adherence_summary, narrative, score_explanation). |
| **TodaysWorkoutsTab.tsx** | `workout_analysis` for “new format” check; **only** `narrative_insights` for the Adherence panel content (`analysisMetrics.insights`). | Does not read `adherence_summary` or `score_explanation` for display. |
| **WorkoutAIDisplay.tsx** | `workout_analysis.narrative_insights` only. | Legacy / alternate UI path; narrative only. |
| **WorkoutDetail.tsx** | Passes `workout.workout_analysis` to a child (e.g. WorkoutAIDisplay). | Depends on what that child renders. |
| **UnifiedWorkoutView.tsx** | Fetches workout with `select('*, workout_analysis, rpe, gear_id')`; passes `completed={updatedWorkoutData || hydratedCompleted || workout}` to MobileSummary. | So MobileSummary **can** see `workout_analysis` if the parent passed a workout that has it. |

So you have **two main surfaces**: (1) **UnifiedWorkoutView → MobileSummary** (full summary logic), and (2) **TodaysWorkoutsTab** (list + Adherence panel, narrative-only). They use different definitions of “done” and different data for the summary.

---

## 4. auto-attach-planned and clearing analysis

**supabase/functions/auto-attach-planned/index.ts**

- After linking a workout to a planned workout it can clear analysis:  
  `hasNewFormatAnalysis = w.workout_analysis && w.workout_analysis.performance && w.workout_analysis.granular_analysis && w.analysis_status === 'complete'`.  
- If **not** `hasNewFormatAnalysis`, it sets `workout_analysis = null` (and clears analysis status/error) to “force fresh calculation”.  
- So it does **not** require `narrative_insights`; it only requires `performance`, `granular_analysis`, and status. For running, analyze-running-workout always writes those, so re-attach usually **does not** clear. But if an older or partial write had no `granular_analysis`, attach would wipe analysis.

---

## 5. Legacy / duplicate logic (no code changes, just references)

- **TodaysWorkoutsTab**  
  - “New format” and “needs analysis” are tied to **narrative_insights** in three places: handleWorkoutSelect, the focusWorkoutId useEffect, and getAnalysisMetrics.  
  - Adherence panel only renders `analysisMetrics.insights` (narrative_insights). No use of `adherence_summary` or `score_explanation`.

- **MobileSummary.tsx**  
  - Uses `adherence_summary`, then `narrative_insights`, then `score_explanation`, then a fallback string.  
  - Also hides `plan_impact.outlook` when it equals the literal `'No plan context.'` (backend still sends that in some cases; we added an “overall context” path so new runs often send a real outlook).

- **WorkoutAIDisplay.tsx**  
  - Only `narrative_insights`. Another place that would show “nothing” if AI failed and no other source is used.

- **useExecutionScore.ts / services/metrics/adherence.ts**  
  - Marked deprecated; tell callers to use `workout_analysis.performance`. Could still be imported/called somewhere and give old behavior.

---

## 6. Interference summary (why “none of this is working”)

1. **TodaysWorkoutsTab**  
   - Treats “analysis complete” and “show summary” as **narrative_insights present**.  
   - So when AI narrative is missing (or empty), it keeps re-triggering analysis and never treats the workout as “done”, and the Adherence panel has nothing to show even when `adherence_summary` and `score_explanation` exist.

2. **Two UIs, two contracts**  
   - **UnifiedWorkoutView → MobileSummary**: uses adherence_summary + narrative + score_explanation.  
   - **TodaysWorkoutsTab**: uses only narrative_insights for both “complete” and panel content. So behavior differs by entry point.

3. **Possible data path**  
   - If the user opens a workout from a path that doesn’t pass `workout_analysis` (e.g. list fetch without that column, or a different detail view), MobileSummary would get `completed` without `workout_analysis` and show the fallback message even when the backend has written a summary.

4. **Legacy “new format”**  
   - The term “new format” in TodaysWorkoutsTab is tied to the **old** contract (performance + detailed_analysis + narrative_insights). The newer contract (performance + detailed_analysis + **adherence_summary**) is not used there.

---

## 7. Files to look at when deciding how to fix (reference only)

- **TodaysWorkoutsTab.tsx**: lines ~190–192 (hasNewFormat), ~446–450 (needsAnalysis), ~646–688 (getAnalysisMetrics narrative-only), ~1093–1107 (click handler hasNewFormat).
- **MobileSummary.tsx**: ~2379–2430 (summary block: adherence_summary, narrative, score_explanation, fallback).
- **UnifiedWorkoutView.tsx**: where `completed` and `workout_analysis` come from when rendering MobileSummary.
- **analyze-running-workout/index.ts**: where `adherence_summary` and `score_explanation` are written; where “No plan context” vs “overall context” outlook is set.
- **auto-attach-planned/index.ts**: ~179–192 (when analysis is cleared on attach).

No code was changed in this audit; this file is for reference only.
