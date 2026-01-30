# Context API — Metrics Inventory

**Single source of truth for behavior:** For verdict logic, implementation reality (ACWR source, pace adherence, single readiness algorithm), and API contract, **CONTEXT_API_PROTOCOL.md** is the authoritative spec. This inventory lists **what metrics we have** in the system and **which we use** to power Context API predictions (Weekly Readiness, Block Trajectory, Structural Load, Interference, Durability). It aligns with the protocol; when in doubt, protocol wins. **Smart server, dumb client:** all verdict and readiness logic runs server-side; the client only displays the API response.

---

## 1. Metrics We Have (Sources)

### A. Workouts table (per workout)

| Metric | Source | Description |
|--------|--------|-------------|
| `workload_actual` | `workouts.workload_actual` | Completed workload (TRIMP / duration×intensity²×100 / strength volume-based). |
| `workload_planned` | `workouts.workload_planned` | Planned workload when workout was planned. |
| `intensity_factor` | `workouts.intensity_factor` or `computed` | 0–1+; used for workload and “quality day” detection. |
| `duration`, `moving_time` | `workouts` | Minutes. |
| `type` | `workouts.type` | run, running, ride, strength, etc. |
| `date`, `planned_id` | `workouts` | For plan matching and date windows. |
| `avg_heart_rate`, `max_heart_rate` | `workouts` | Used for TRIMP, Z2 gating in adaptation. |
| `avg_pace`, `avg_power` | `workouts` | For pace adherence, aerobic efficiency. |
| `strength_exercises` | `workouts` | Sets/reps/weight/RIR for strength adaptation. |

### B. workout_analysis (run/cycling analysis, JSONB on workouts)

| Metric | Path | Description |
|--------|------|-------------|
| **HR drift** | `workout_analysis.granular_analysis.heart_rate_analysis.hr_drift_bpm` | Cardiac drift on steady runs (0 = stable). From `analyze-running-workout` (heart-rate-drift pipeline). |
| **Pace adherence** | `workout_analysis.performance.pace_adherence` | % (e.g. 75). From granular pace vs target. |
| **Duration adherence** | `workout_analysis.performance.duration_adherence` | % duration in range. |
| **Execution adherence** | `workout_analysis.performance.execution_adherence` | (pace + duration) / 2. |
| **Interval breakdown** | `workout_analysis.granular_analysis` (intervals) | Per-interval pace_adherence_percent, HR; used for interval narratives. |

*Note: `workout_analysis` is populated by `analyze-running-workout` (and cycling/swim analyzers). HR drift and pace adherence are computed there; context reads them from the **last 3 runs** in the acute window (see Data Availability below).*

### C. Planned workouts

| Metric | Source | Description |
|--------|--------|-------------|
| `workload_planned` | `planned_workouts.workload_planned` | Planned load per session. |
| `date`, `type`, `training_plan_id` | `planned_workouts` | For plan progress and matching. |

### D. workouts.computed.adaptation (per-workout adaptation lane)

Written by **compute-adaptation-metrics** (per workout). Used by **block-adaptation** to build block trends.

| Metric | Path | Description |
|--------|------|-------------|
| **Aerobic efficiency** | `computed.adaptation.aerobic_efficiency`, `avg_pace_at_z2`, `avg_hr_in_z2` | For easy Z2 runs: pace/HR ratio. |
| **Workout type** | `computed.adaptation.workout_type` | `easy_z2`, `long_run`, etc. |
| **Long run** | `computed.adaptation` (long-run lane) | Duration, pace, HR for long-run endurance trend. |
| **Strength** | `computed.adaptation` (from strength_exercises) | Weight, RIR, estimated 1RM per exercise; rolled up to block. |

### E. User-logged strength (workouts.strength_exercises)

Users log strength workouts with **exercises** and **sets**. That data is stored, then turned into workload and block progression.

| What we store | Source | Description |
|---------------|--------|-------------|
| **strength_exercises** | `workouts.strength_exercises` (JSONB array) | Per exercise: `name` / `exercise`, `sets` (or `working_sets` / `performance.sets`) with `weight`, `reps`, `rir` (reps in reserve). Optional **session_rpe** in `workout_metadata` for intensity. |
| **Lift names** | Normalized in compute-adaptation-metrics | Squat, Bench Press, Deadlift, Overhead Press (others skipped for block progression). |

| What we compute from it | Where | How it feeds context |
|------------------------|--------|----------------------|
| **workload_actual** | **calculate-workload** | Volume (weight×reps×sets) + intensity (RIR or session RPE). Strength workload = volume_factor × intensity² × 100. Sum of strength workload in **acute window** → **structural_load.acute** and “heart ready, legs tired” (Weekly). |
| **computed.adaptation.strength_exercises** | **compute-adaptation-metrics** (per workout) | Best set per major lift → `weight`, `avg_rir`, `estimated_1rm` (Epley + RIR). Written to `workouts.computed.adaptation`. |
| **avg_rir_acute** | **generate-training-context** | Average RIR across all sets (from `strength_exercises`) in strength workouts in the **acute window**. Returned as **structural_load.avg_rir_acute** and passed to goal-predictor. When **avg_rir_acute < 1.5** (deep fatigue), we trigger "high-repair state" / "keep today Z2" even if **structural_load.acute** isn't high — RIR is the "HR drift" for lifting. |
| **strength_progression.overall_gain_pct** | **block-adaptation** (4-week) | Buckets by exercise and week; week 1 vs week 4 estimated 1RM → % gain per exercise; average → **overall_gain_pct**. Feeds **block verdict**, **durability risk** (strength down = “Mile 20 Fade”), **strength/speed interference** (Block). |

So **user-logged strength** is used in three ways for context:

1. **Weekly (Integrated Load):** Sum of strength **workload** in the last 7 days → **structural_load.acute**. When that’s high (>40) and cardio is fresh, we show “heart ready, legs tired” and flag “High structural load (strength) in last 7 days”.
2. **Weekly (Deep Fatigue / RIR):** **avg_rir_acute** = average RIR over acute strength sessions. When **avg_rir_acute < 1.5** and cardio is fresh, we show: *"Your last lifting session had an average RIR of X. Even though your HR drift is low, your muscles are in a high-repair state. Keep today's run strictly Z2."* So we move from "work done" to **strain incurred**.
3. **Block (Long-term Adaptation):** Per-workout **weight/RIR/estimated 1RM** → 4-week **strength_progression.overall_gain_pct** → goal probability, durability warning, and strength/speed interference messages.

*If a strength workout has no `strength_exercises` (or only non-major lifts), it can still get a workload from duration + default intensity, but it won’t contribute to block strength progression.*

### F. Block adaptation (aggregated 4-week)

From **getBlockAdaptation** (reads `block_adaptation_cache` or computes from `workouts.computed.adaptation`). Strength piece comes from user-logged **strength_exercises** via **compute-adaptation-metrics** (see E above).

| Metric | Path | Description |
|--------|------|-------------|
| **Aerobic efficiency improvement %** | `fitness_adaptation_structured.aerobic_efficiency.improvement_pct` | Week 1 vs week 4 efficiency trend. |
| **Long run improvement %** | `fitness_adaptation_structured.long_run_endurance.improvement_pct` | Long-run efficiency/duration trend. |
| **Strength overall gain %** | `fitness_adaptation_structured.strength_progression.overall_gain_pct` | Strength progression over block. |
| **Weekly trends** | `aerobic_efficiency.weekly_trend`, `long_run_endurance.weekly_trend`, `strength_progression.by_exercise` | Raw series for display/confidence. |

### G. User-logged RPE after endurance (run/ride)

Users can log **RPE (1–10)** after **run** and **ride** workouts via post-workout feedback. We store it but do **not** use it for workload or Context API predictions.

| What we store | Source | Description |
|---------------|--------|-------------|
| **workouts.rpe** | Top-level column (1–10) | Post-workout RPE for run/ride. Captured via **check-feedback-needed** (finds most recent completed run/ride without RPE in last 7 days) and **PostWorkoutFeedback** / CompletedTab. Optional; user can dismiss. |
| **workout_metadata.session_rpe** | JSONB on workouts | Used for **strength** and **pilates_yoga** in calculate-workload. Client normalizes so `workout.rpe` is also exposed as `session_rpe` when reading. |

| What we do with it today | Used for context? |
|--------------------------|-------------------|
| **Display** in WorkoutSummary, TodaysEffort, PlannedWorkoutSummary (e.g. “RPE 7/10”). | No. |
| **Workload:** Endurance (run/ride/swim) does **not** use RPE. calculate-workload: “Runs/rides/swims don’t use RPE - they use performance-based intensity” (TRIMP, power, pace). | No. |
| **Context API:** Weekly readiness uses HR drift + pace adherence from **workout_analysis**; we do not pass `workouts.rpe` into goal-predictor. | No. |

So **user-logged RPE after endurance** exists and is prompted/displayed, but is **not** used for workload or for any Context API prediction. Possible future use: sRPE-based load (duration × RPE) for runs without HR, or a subjective “how hard did that feel” signal alongside HR drift/pace for readiness.

### H. user_baselines

| Metric | Source | Description |
|--------|--------|-------------|
| **performance_numbers** | `user_baselines.performance_numbers` | fiveK, easyPace, marathon, ftp, threshold_heart_rate, squat/deadlift/bench 1RM, etc. |
| **learned_fitness** | `user_baselines.learned_fitness` | Auto-learned run easy HR, threshold HR, easy pace, FTP. |
| **effort_paces** | `user_baselines.effort_paces` | Base, race, steady, power, speed (sec/mi). |

*Used for: workload (TRIMP/threshold), adaptation Z2 gating, plan materialization. **Not** currently passed into goal-predictor; plan `target_finish_time` comes from plan config.*

### I. Plan config (active plan)

| Metric | Source | Description |
|--------|--------|-------------|
| **Plan name** | `plans.name` | Used to infer goal profile (marathon, strength, speed, power, general). |
| **Target time** | `plans.config.target_time` or `marathon_target_seconds` | Baseline for race-day forecast (seconds). |
| **Goal date, phases** | `plans.config` | For weeks remaining, phase labels. |

---

## 2. Metrics We USE for Context API Predictions

### Weekly Readiness (Form) — `generate-training-context` → `weekly_verdict`

| Input | Source | How it’s used |
|-------|--------|----------------|
| **HR drift (bpm)** | **Average** over last 3 runs in acute window: `workout_analysis.granular_analysis.heart_rate_analysis.hr_drift_bpm` | 0 = best; +N bpm reduces readiness score. Thresholds: high/medium/low. |
| **Pace adherence (%)** | **Average** over same 3 runs: `workout_analysis.performance.pace_adherence`. Plan pace targets used **only when run is linked to `planned_id`**; otherwise structure-based (e.g. Z2 gating). | ~75% = neutral; &gt;75% boosts, &lt;75% reduces score. |
| **Structural load (acute)** | Sum of **strength** `workload_actual` in acute window (`sport_breakdown.strength.workload`) | If &gt;40 and cardio “fresh” → append “heart ready, legs need easy day” and driver. |
| **Trend (optional)** | HR drift from oldest to newest of the 3 runs | Improving → small readiness boost; worsening → contextualizes low readiness (e.g. systemic over-reaching when ACWR high). |

*If there’s no run with `workout_analysis` in the acute window, we have no HR drift or pace adherence → no weekly_verdict (client shows “complete a run with HR…”).*


#### Data Availability (Low-Volume Weeks)

Weekly readiness uses only data **within the acute 7-day window** so the verdict stays aligned with ACWR and structural load.

- **1–2 runs in acute window:** The system calculates **Recent Form** by averaging the available sessions (HR drift and pace adherence). A **Trend** (improving / stable / worsening) is only computed when there are **at least 2 runs** with HR drift in the window.
- **0 runs in acute window:** The `weekly_verdict` is not computed so "Weekly" readiness reflects only current-week data. The UI shows an **Action Required** state: *"Complete a run with HR to see how ready you are for this week's intensity."*

This keeps the coach from using old runs to mask a bad week and ensures that when the AI sees a "bad run," it considers the 7-day volume and strength history before issuing a verdict.

### Block Trajectory (Probability) — `generate-overall-context` → `goal_prediction`

| Input | Source | How it’s used |
|-------|--------|----------------|
| **Aerobic efficiency improvement %** | `fitness_adaptation_structured.aerobic_efficiency.improvement_pct` | Block verdict and race-day forecast; durability risk (aero up). |
| **Long run improvement %** | `fitness_adaptation_structured.long_run_endurance.improvement_pct` | Block verdict and race-day forecast; durability (long-run up). |
| **Strength overall gain %** | `fitness_adaptation_structured.strength_progression.overall_gain_pct` | Block verdict; durability risk (strength down); strength/speed interference. |
| **Plan name** | Active plan `plans.name` | Infer goal profile (marathon, strength, speed, power, general). |
| **Target finish time (s)** | `plans.config.target_time` or `marathon_target_seconds` | Race-day projected time and improvement. |

### Interference (Block)

| Signal | Source | How it’s used |
|--------|--------|----------------|
| **Strength/speed** | `strength_overall_gain_pct` &gt; 10 and goal profile = speed | Message: high strength volume → heavy legs for track; ~5% slower pace adherence. |
| **Power/aerobic** | Weekly `hr_drift_bpm` &gt; 5 and goal profile = power | Message: HR drift in base runs → aerobic floor dropping; suggest Z2 focus. |

*Note: Power/aerobic uses weekly HR drift; block endpoint doesn’t fetch weekly readiness, so that interference is only present when block view has access to recent HR drift (e.g. if we later pass weekly snapshot into overall-context).*

### Durability (Block)

| Signal | Source | How it’s used |
|--------|--------|----------------|
| **Aerobic gains + strength dip** | `aerobic_efficiency_improvement_pct` or `long_run_improvement_pct` &gt; 0, and `strength_overall_gain_pct` &lt; -5 | “Mile 20 Fade Risk”: engine strong, legs weakening; message + label. |

### Structural load in response

| Output | Source | Purpose |
|--------|--------|---------|
| **structural_load.acute** | `sport_breakdown.strength.workload` (acute window) | Exposed in API so client can show “heavy legs” / Integrated Load; also used inside goal-predictor for “heart ready, legs tired” message. |

---

## 3. Metrics We Have but Don’t Use for Context Predictions (Yet)

| Metric | Source | Possible use |
|--------|--------|--------------|
| **Duration adherence** | `workout_analysis.performance.duration_adherence` | Could fold into weekly readiness (e.g. with pace) or separate “session completeness” signal. |
| **Execution adherence** | `workout_analysis.performance.execution_adherence` | Alternative or complement to pace_adherence for “Form” score. |
| **Intensity factor (IF)** | `workouts.intensity_factor` or computed | Already used for ACWR, quality days, timeline; could feed “readiness” (e.g. recent high-IF load). |
| **ACWR** | Computed in generate-training-context from **actual workload** (acute/chronic sums of `workload_actual`). Does **not** use Learned Fitness. | Used for insights and gauge; not passed into goal-predictor. Could gate or weight verdict (e.g. very high ACWR → cap readiness). |
| **RIR / estimated 1RM** | Strength exercises, computed.adaptation | Block: strength_progression. Weekly: **avg_rir_acute** (from acute strength workouts) is passed to goal-predictor and drives "deep fatigue" message when < 1.5. |
| **user_baselines (FTP, threshold HR, 1RMs)** | user_baselines | Used for workload and adaptation gating; not used in goal-predictor. Could support “target vs current” messaging. |
| **Plan progress (matched %, behind/ahead)** | generate-training-context | Used for insights and UI; not passed into goal-predictor. Could adjust verdict (e.g. “on track” vs “behind plan”). |
| **Swim / bike workout_analysis** | Swim/cycling analyzers | Pace/adherence for those sports; currently only run HR drift and pace adherence feed weekly readiness. |
| **User-logged RPE after endurance** | `workouts.rpe` (run/ride) | Post-workout RPE (1–10) from feedback flow. Stored and displayed; **not** used for workload (endurance uses TRIMP/power/pace) or for Context API. Could use for sRPE load or as subjective “how hard” signal. |

---

## 4. Summary Table — Used for Prediction

| Prediction | Metrics used | Source |
|------------|-------------|--------|
| **Weekly Readiness (score + message)** | HR drift (avg), Pace adherence (avg), Trend | Last 3 runs with `workout_analysis` in acute window |
| **Structural vs. cardio message** | Structural load acute &gt; 40 **or** avg RIR acute &lt; 1.5, cardio fresh | `sport_breakdown.strength.workload`, **avg_rir_acute** (from acute strength workouts), weekly readiness |
| **Block Goal Probability** | Aero %, Long-run %, Strength % | `fitness_adaptation_structured` (block-adaptation) |
| **Race-day forecast** | Aero %, Long-run %, Target time | Block adaptation + plan config |
| **Durability risk** | Aero up, Long-run up, Strength down | Block adaptation |
| **Interference (strength/speed)** | Strength % &gt; 10, goal = speed | Block adaptation + goal profile |
| **Interference (power/aerobic)** | HR drift &gt; 5, goal = power | Weekly readiness (when available in block flow) |
| **Goal profile** | Plan name | `plans.name` |

---

## 5. Data Flow (Concise)

1. **Weekly context**  
   - Load workouts (acute/chronic), planned week, plan context.  
   - ACWR (acute/chronic sums of `workload_actual` only; no Learned Fitness), sport_breakdown, timeline, plan_progress, insights from workloads and dates.  
   - Last 3 runs in acute window → `workout_analysis` → average `hr_drift_bpm`, `pace_adherence` + trend → goal-predictor **weekly** input.  
   - Acute strength workouts → **avg_rir_acute** (average RIR across sets in acute window).  
   - goal-predictor **weekly** input: `structural_load_acute` = `sport_breakdown.strength.workload`, **avg_rir_acute**.  
   - Goal-predictor → `weekly_verdict`; response includes `structural_load` (`acute`, **avg_rir_acute**).

2. **Block context**  
   - Load planned/completed workouts, user_baselines (for block-analysis), active plan.  
   - Block-analysis → performance_trends, adherence, focus_areas, etc.  
   - getBlockAdaptation → `fitness_adaptation_structured` (aerobic_efficiency, long_run_endurance, strength_progression).  
   - Goal-predictor **block** input = improvement_pct / overall_gain_pct; **plan** = name + target_finish_time from config.  
   - Goal-predictor → `goal_prediction` (block_verdict, race_day_forecast, durability_risk, interference).

All verdict and interference math is server-side in `_shared/goal-predictor`; clients only consume the returned verdicts and optional `structural_load`.
