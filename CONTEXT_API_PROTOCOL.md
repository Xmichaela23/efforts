# Context API Protocol — Congruent Backend for Multisport Training

## Purpose

Leading training platforms (TrainingPeaks, Garmin, Whoop) prioritize three narrative pillars for multisport athletes: **Integrated Load**, **Functional Readiness**, and **Long-term Adaptation**. The Context API protocol goes beyond "completed vs. planned" so the **Efforts** app can act as a unified "Head Coach" that understands how different disciplines—like a heavy Tuesday leg day and a Wednesday tempo run—interact biologically.

This document defines the **State of the Athlete** protocol: a congruent vocabulary for verdicts, goal profiles, and cross-discipline interference used by both `generate-training-context` (Weekly) and `generate-overall-context` (Block).

---

## 1. Unified Goal-Profile Logic

The protocol automatically adjusts analysis based on the user's active goal profile so the Weekly Verdict is always relevant to the current mission. The server-side `_shared/goal-predictor` infers **Goal Profile** from the active plan name and drives both Weekly Readiness and Block Trajectory.

| Goal Profile | Success Metric | Core Communication |
| --- | --- | --- |
| **Marathon** | **Aerobic Efficiency** | Finish time forecast based on **0 bpm drift** and long-run consistency. Durability (strength trend) gates "Mile 20 Fade Risk." |
| **Strength** | **Structural Load** | Projected capacity gains and volume tolerance based on **Strength Overall Gain**. Block verdict = goal probability for 1RM/volume targets. |
| **Speed/Power** | **Interval Intensity** | Ability to hold high-output targets without cardiovascular decay or pace drop-off. Interference: strength volume → heavy legs; HR drift → aerobic floor. |
| **General** | **Activity Balance** | Maintaining a healthy **ACWR** while avoiding discipline neglect. Block trend (aero + long run + strength) and generic readiness messaging. |

- **Weekly verdict:** Goal-specific "Form" message (marathon: pace targets; strength: RPE on accessory work; speed/power: warm-up and pacing).
- **Block verdict:** Goal-specific "Goal Probability %" and on-track message (marathon: projected finish; strength: 1RM/volume; speed: race-pace readiness; power: balance).

---

## 2. State of the Athlete — Two Verdicts, One Protocol

Both context endpoints return verdicts that answer one of two questions. The **vocabulary** is shared; the **scope** differs.

### Weekly Readiness (Form Check — Functional Readiness)

- **Question:** *"Am I ready for today's specific work?"*
- **Key metric:** **Execution Score** (readiness %).
- **Input data:** **75% Pace Adherence** (neutral), **0 bpm HR drift** (form supportive), optional structural load in acute window.
- **Thresholds:** High/medium/low readiness from HR drift and pace adherence. High structural load + fresh cardio → adaptive guidance ("heart ready, legs need easy day").
- **Verdict:** `weekly_verdict` — `readiness_pct`, `message`, `drivers`, `label` (high | medium | low).
- **Returned by:** `generate-training-context` only.

### Block Trajectory (Probability Check — Long-term Adaptation)

- **Question:** *"Am I on track for my ultimate target?"*
- **Key metric:** **Adaptation Score** (goal probability %).
- **Input data:** Monthly trends (aerobic efficiency %, long-run %, strength overall gain %), plan target (e.g. finish time). **Interference** (e.g. high run volume suppressing strength gains) flags drift off course.
- **Verdict:** `block_verdict` — `goal_probability_pct`, `message`, `drivers`. Plus optional `race_day_forecast`, `durability_risk`, `interference`.
- **Returned by:** `generate-overall-context` only.

### Comparison

| Feature | Weekly Context Protocol | Block / Overall Protocol |
| --- | --- | --- |
| **Key metric** | **Weekly Readiness** (Execution Score) | **Goal Probability** (Adaptation Score) |
| **Input data** | HR drift, Pace adherence, ACWR, (optional) structural load acute | Monthly trends, strength gains, volume growth |
| **Verdict** | *"Ready for today's specific work"* | *"On track for the ultimate target"* |
| **Endpoint** | `generate-training-context` | `generate-overall-context` |

---

## 3. Cross-Discipline Interference

The protocol explicitly models when goals clash so the Head Coach can return adaptive guidance.

### Structural vs. Cardiovascular Adaptive Guidance

The protocol detects when the body's systems are out of sync and returns coaching guidance.

#### The "Heart Ready, Legs Tired" Insight (Weekly)

- **Scenario:** High **Structural Load** (e.g. strength workload >40 in the last 7 days) **or** **Deep Fatigue** (average **RIR** across acute strength sessions <1.5) but fresh **Cardiovascular metrics** (low HR drift, good pace adherence).
- **Protocol behavior:** Weekly verdict includes **adaptive guidance**:
  - When **avg RIR** is low: *"High structural load. Your last lifting session had an average RIR of X. Even though your HR drift is low, your muscles are in a high-repair state. Keep today's run strictly Z2 to avoid mechanical injury."*
  - Otherwise: *"Your heart is ready, but your legs need an easy day. Stick to the slow end of your pace targets to avoid mechanical injury."*
- **Implementation:** `structural_load_acute` and **`avg_rir_acute`** in weekly readiness input; goal-predictor triggers the message when cardio is fresh and (structural load >40 **or** avg_rir_acute <1.5). Response exposes `structural_load.acute` and **`structural_load.avg_rir_acute`** so clients can display "heavy legs" / "high-repair state" context. RIR is the "HR drift" for lifting — it scales strain; low RIR = high-repair state.

#### The Durability Warning (Block)

- **Scenario:** **Aerobic gains** are high (e.g. +0.95%) but **strength** is declining (e.g. -10.86%).
- **Protocol behavior:** Flags **"Mile 20 Fade Risk"**: while the engine is strong, the musculoskeletal foundation is weakening. Message: *"Aerobic potential is high, but your strength dip suggests your legs may fail before your heart does. Prioritize your next lifting session to protect durability."*
- **Implementation:** `_shared/goal-predictor` `computeDurabilityRisk(block)`; returned in `goal_prediction.durability_risk` by `generate-overall-context`.

### Strength / Speed Interference (Block)

- **Scenario:** User is on a **Speed** goal but block **strength** volume is high (+% gain).
- **Protocol behavior:** `interference.strength_speed`: *"You're pursuing a Speed goal, but your Strength volume is +X% this block. Your legs may feel heavy for track sessions; expect ~5% slower pace adherence."*

### Power / Aerobic Interference (Block)

- **Scenario:** User is on a **Power** goal but **HR drift** in base runs is elevated.
- **Protocol behavior:** `interference.power_aerobic`: *"Your Power output is a focus, but we've detected +X bpm heart rate drift in your base runs. Your aerobic floor may be dropping; consider a Z2 focus next week."*

---

## 4. Summary of Unified API Response

| Response Object | Content | User Value |
| --- | --- | --- |
| **`weekly_verdict`** | Readiness %, Message, Drivers, Label | Immediate go/no-go guidance for today's session (Functional Readiness). |
| **`goal_prediction`** | Forecast, Goal Probability %, Interference, Durability Risk | Long-term confidence and "fade risk" alerts (Long-term Adaptation). |
| **`structural_load`** | Strength Workload (Acute), **Avg RIR (Acute)** | Flags "heavy legs" / deep fatigue even when cardio feels fresh (Integrated Load). Low avg RIR = high-repair state. |

### RIR vs. RPE in Context API

| Metric | Type | Use in Context API |
| --- | --- | --- |
| **Endurance RPE** | Subjective feeling | Display-only (for now). |
| **Strength RIR** | Physiological proximity to failure | Drives **Estimated 1RM** (Epley + RIR) in block adaptation, **Strength Overall Gain %**, and **Structural Readiness**. **`avg_rir_acute`** refines weekly verdict: low RIR (<1.5) triggers "high-repair state" / "keep today Z2" even when volume isn't high. |

---

## 5. API Contract Summary

### generate-training-context

- **Input:** `{ user_id: string; date: string; workout_id?: string }`
- **Output:** `TrainingContextResponse` with protocol-aligned fields:
  - `acwr`, `sport_breakdown`, `timeline`, `week_comparison`, `insights`, `plan_progress`
  - `weekly_readiness` — raw inputs (hr_drift_bpm, pace_adherence_pct) for transparency
  - **`weekly_verdict`** — State of the Athlete (Execution Score): `readiness_pct`, `message`, `drivers`, `label`. May include structural-vs-cardio adaptive guidance when applicable.
  - **`structural_load`** — `{ acute: number; avg_rir_acute?: number | null }` — strength workload and average RIR in acute window; enables "heart ready, legs tired" and "high-repair state" (low RIR) narrative and client display.

### generate-overall-context

- **Input:** `{ user_id: string; weeks_back?: number }`
- **Output:** Same as current response, with protocol-aligned fields:
  - `performance_trends_structured`, `plan_adherence_structured`, `fitness_adaptation_structured`, `goal`, etc.
  - **`goal_prediction`** — State of the Athlete (Adaptation Score + interference):
    - `goal_profile` — resolved from plan name
    - `block_verdict` — Goal Probability %, message, drivers
    - `race_day_forecast` — marathon projected time when plan has target
    - `durability_risk` — Mile 20 Fade Risk when aero up / strength down
    - `interference` — strength_speed, power_aerobic, and `all` messages

### Shared Types (goal-predictor)

- **GoalProfile:** `'marathon' | 'strength' | 'speed' | 'power' | 'general'`
- **WeeklyVerdictResult:** readiness_pct, message, drivers, label
- **BlockVerdictResult:** goal_probability_pct, message, drivers
- **InterferenceResult:** strength_speed, power_aerobic, all
- **DurabilityRiskResult:** has_risk, label, message, drivers

---

## 6. Implementation Notes

- **Server-only math:** All verdict and interference logic lives in `supabase/functions/_shared/goal-predictor`. The client consumes precomputed verdicts only.
- **Plan-aware:** Both endpoints use the active plan (name, target time when available) to resolve goal profile and to tailor messages.
- **Congruent language:** Weekly view shows "Readiness" (Execution); Block view shows "Goal Probability" (Adaptation). Same protocol, same vocabulary, different time scales.
