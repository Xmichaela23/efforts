# Context API Protocol — Congruent Backend for Multisport Training

**Single source of truth:** This document is the **authoritative specification** for Context API behavior: verdict logic, goal profiles, implementation reality (ACWR from actual workload, pace adherence from `planned_id`, single readiness algorithm), and API contract. Code and other docs (e.g. **CONTEXT_METRICS_INVENTORY.md**) should align with this protocol. For "what metrics exist and how they feed context," see the inventory; for "how the coach interprets them," this doc is the source of truth.

**Smart server, dumb client:** All Context API logic runs on the server. The server computes ACWR, 3-run readiness, structural load, goal-predictor verdicts, and messaging; the client **only** fetches and displays the returned `weekly_verdict`, `goal_prediction`, `structural_load`, `acwr`, etc. The client does **no** readiness math, no verdict interpretation, and no goal-profile logic—display only.

---

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

### Temporal Synchronicity (7-Day Boundary)

The **weekly_verdict** must be derived solely from data within the **acute** window (current 7 days, or current plan week when a plan is active). This ensures the Head Coach interprets metabolic and mechanical stress within the same timeframe as **ACWR** and **Structural Load**.

- **Rule:** All inputs to the weekly verdict (3-run average HR drift/pace, structural load, avg_rir_acute) use the acute window. No data from 10+ days ago may drive the readiness score.
- **Rationale:** Prevents a "halo effect" where high performance from 10+ days ago masks a current systemic over-reach. Readiness answers *"Am I ready *this week*?"* — so only this week’s workload and run quality apply.
- **Integrated logic:** When **ACWR > 1.3** (elevated systemic risk) and the **3-run HR drift trend** is increasing (worsening), the server should prioritize a "Systemic Fatigue" / over-reaching interpretation over a simple "Low Readiness" score — i.e. the coach sees that volume and aerobic strain are rising together.

### Implementation Reality (Technical)

The protocol’s math relies on **actual workload** and **ID-matching**, not learned baselines. Engineering distinctions:

- **ACWR source:** The **ACWR ratio** is derived strictly from **Actual Workload** — acute and chronic **totals of `workload_actual`** from completed workouts. It does **not** use "Learned Fitness" or user baselines for this calculation.
- **Pace adherence logic:** "Plan pace targets" are used **only when a completed run is explicitly linked to a `planned_id`** (and that planned workout has pace/steps). Otherwise, the analyzer uses structure-based adherence (e.g. Z2 gating, workout type).
- **Unified algorithm:** There are **not** two separate code paths for "plan mode" vs "no-plan mode." There is a **single readiness logic**; **messaging** (and ACWR insight wording) adjusts based on `goal_profile` and plan context (e.g. "on plan" vs "below base").

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

### Integrated Verdict — How the Three Signals Work Together (7-Day Window)

All three signals use the same acute 7-day window so the verdict reflects one coherent "state of the athlete" for the week.

| Signal | Window | Role in "The Verdict" |
| --- | --- | --- |
| **3-Run Average** | 7 Days | **Aerobic Form:** Average HR drift and pace adherence across the last 3 runs in the acute window. Detects if the engine is handling pace/heat; trend (improving/worsening) can boost or contextualize readiness. |
| **Structural Load** | 7 Days | **Mechanical Strain:** Strength workload sum + **avg_rir_acute**. Protects the chassis: high load or low RIR → "heart ready, legs need easy day" even when cardio is fresh. |
| **ACWR** | 7 Days | **Systemic Risk:** Acute vs chronic workload ratio (from **actual workload** only). Checks if volume is building too fast for the athlete’s base; when high (e.g. >1.3) and 3-run drift is worsening, supports a "systemic over-reaching" message. |

### Refined Stability Logic (Technical View)

The **Training Stability (7d)** card interprets the same metrics differently depending on whether the user has an active plan. Same algorithm; different **interpretation** and messaging.

| Pillar | With Active Plan | Without Plan (General) |
| --- | --- | --- |
| **Aerobic Form** | Uses **planned vs. actual** adherence when the run is linked to `planned_id`; otherwise 3-run average and trend. | Uses **3-run average** and trend (improving / stable / worsening). |
| **Structural Load** | Detects if strength **workload / RIR** interferes with goal-specific tasks (e.g. "heart ready, legs need easy day" before a quality session). | Acts as a **biological guardrail** to prevent mechanical injury (same threshold: acute &gt;40 or avg_rir_acute &lt; 1.5). |
| **Systemic Risk** | Evaluates **7-day volume** relative to plan’s ramp (ACWR insight wording; plan week vs rolling window). | Evaluates **7-day volume** (ACWR) relative to chronic base; flags spikes &gt;1.3. |

### Integrated Verdict Behavior

The system remains protective of the athlete regardless of plan status:

- **No plan ("Trend as Truth"):** The coach relies on the **3-run average** and **ACWR** to indicate whether current habits are stable or risky. Messaging is goal_profile `general`.
- **With plan ("Execution"):** The coach acts as a filter: **Structural Load** and **RIR** (deep fatigue) are checked so they don’t cause a "mechanical failure" before the next planned quality session. Messaging is goal-specific (e.g. marathon, strength).

### Summary of Unified API Data Flow

| Object | Implementation Detail | User Value |
| --- | --- | --- |
| **`weekly_verdict`** | 3-run average (HR drift, pace adherence) + acute **avg_rir_acute** &lt; 1.5 threshold; single readiness logic; message varies by `goal_profile`. | Go/no-go based on current systemic strain. |
| **`structural_load`** | Derived from **`workload_actual`** (acute strength sum) and **avg_rir_acute** from `strength_exercises` in acute window. | Identifies "heavy legs" to protect the chassis. |
| **`acwr`** | **Acute total / Chronic total** of completed workouts’ `workload_actual`. No Learned Fitness in formula. | Flags volume spikes that exceed historical base. |

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
