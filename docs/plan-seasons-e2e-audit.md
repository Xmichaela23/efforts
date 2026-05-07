# Plan your seasons — end-to-end audit

**Why plans feel wrong.** The pipeline from **Arc Setup Wizard → goals → optimizers → plan rows → calendar** has multiple **forks**, **silent overrides**, and **fields that never reach the generator**. Below is a grounded trace (code-reviewed May 2026) of where **user choices**, **baselines**, and **week coherence** break down — without prescribing fixes here.

---

## Intended pipeline (happy path)

```mermaid
flowchart LR
  W[ArcSetupWizard] --> P[persistArcSetup goals.training_prefs]
  P --> C[create-goal-and-materialize-plan]
  C --> O[backfillTriTrainingPrefsDefenseInDepth plus deriveOptimalWeek]
  O --> G[generate-combined-plan buildWeek]
  G --> A[activate-plan planned_workouts]
```

Reality: **two plan engines** (`generate-combined-plan` vs **`generate-triathlon-plan` / `tri-generator.ts`**) and **conditional routing** mean many athletes never hit the path the wizard was designed around.

---

## 1. Wizard → database (`training_prefs`)

**Source:** `src/components/ArcSetupWizard.tsx` → `assemblePayload` → `src/lib/arc-setup-persistence.ts` (`persistArcSetup`, `normalizeGoalInput`).

### 1.1 `preferred_days` is intentionally sparse

The wizard computes **`inferDays()`** (fallback Tue/Wed/Thu quality bike, etc.) but **`preferred_days` only stores “fixed” anchors**: long days, optional group ride/run slots, swim array, and **hard-coded `strength: ['monday','thursday']`** when strength is on.

Mid-week **quality_bike / easy_bike / quality_run / easy_run** from `inferDays` are **not written** to `preferred_days` (comment: leave placement to planner + resolver).

**Effect:** The DB rarely holds a “full week declaration.” Downstream code treats prefs as **incomplete** almost always → heavy reliance on **re-derivation** (see §3).

### 1.2 Assessment week preference may never touch the goal row

The wizard sets **`assessment_week_preference`** on the **top-level payload** (`ArcSetupWizard`).

**It is not merged into `goals[].training_prefs`** in `assemblePayload`. **`arc-setup-persistence` does not lift it into inserts.**

`generate-combined-plan` only sees **`athlete_state.assessment_week_preference`** if it appears on **`training_prefs`** (`create-goal-and-materialize-plan` reads `newGoal.training_prefs` / backfilled prefs).

**Effect:** **Assessment-first can be silently ignored** for wizard-created goals — calendar starts as “normal” week 1, contradicting the athlete’s answer.

### 1.3 Strength “off” vs protocol defaults

`normalizeGoalInput` maps **`strength_frequency === 0`** → `strength_protocol: 'none'` and `strength_frequency: 0` in **`training_prefs`** (client persist path). That part is coherent.

**Contradiction arrives server-side** (§3.2).

### 1.4 Conflict / preview loop skipped after wizard save

`src/hooks/useArcSetupComplete.ts` explicitly **skips conflict detection** and invokes **`create-goal-and-materialize-plan`** immediately (“wizard already captured scheduling preferences”).

**Effect:** Optimizer **`conflicts` / `trade_offs`** and **`generation_trade_offs`** can change the week **without** an athlete confirmation step on this path — feels like “the app ignored me.”

---

## 2. Dual routing: combined vs standalone tri

**Source:** `buildCompleteContext` → `combine = eventGoals.length >= 2` (`src/lib/arc-setup-persistence.ts`).  
**Server:** `create-goal-and-materialize-plan` calls **`buildCombinedPlan`** only when **`combine === true`** and **`buildCombinedPlan`** succeeds.

| Scenario | Engine |
|----------|--------|
| **One active event goal** | `combine === false` → **standalone** `generate-triathlon-plan` / **`tri-generator.ts`** |
| **Two+ goals inserted in same flow** | `combine === true` → **`generate-combined-plan`** |
| **`combine === true` but `buildCombinedPlan` returns null** | **Silent fallthrough** to standalone tri generation (unless preview-only shortcut returns empty `combined_preview`) |

**`buildCombinedPlan` returns null** when fewer than **two** active event goals are read back (`allEventGoals.length < 2`) — e.g. timing, dedupe, or single-race reality.

**Effect:** **Same wizard UX → different algorithms**, different defaults, different honoring of `preferred_days`. Explains “it worked once / two-race season vs one race feels totally different.”

---

## 3. Server backfill: `backfillTriTrainingPrefsDefenseInDepth`

**Source:** `supabase/functions/create-goal-and-materialize-plan/index.ts`.

### 3.1 “Incomplete preferred_days” triggers full optimizer rewrite

`hasFullPreferred` requires **every** slot: long ride/run, quality + easy bike, quality + easy run, strength array, swim array.

Wizard-authored prefs **normally fail this** → **`deriveOptimalWeekWithCoEqualRecovery`** runs and **writes a new `preferred_days`** onto the goal.

Pins attempt to restore user **`quality_bike`**, etc., but **only when those keys existed on the incoming candidate**. Sparse wizard payloads mean **many pins are no-ops**.

**Effect:** Athlete-visible schedule is often **algorithm output**, not **wizard output**, even when they thought they “set everything.”

### 3.2 Strength frequency bug (high severity)

Optimizer input uses:

```ts
strength_frequency: strengthDaysIn?.length ?? 2
```

(not `training_prefs.strength_frequency`).

If **`preferred_days.strength` is absent** (e.g. user turned strength **off** — wizard omits the array) → **`length` is undefined → defaults to `2`**.

**Effect:** **Zero-strength intent can still produce a 2× strength week in the optimizer** — directly violates user choice.

### 3.3 Swim count coupling

Similarly, **`swims_per_week`** uses **`swimDays?.length ?? 2`**. Wizard usually fills **`swim`** for tri, so this is less brittle than strength — but any path with missing `swim` array defaults to **2 swims**.

### 3.4 Merge defaults can contradict wizard

**`mergeTrainingPrefsWithArcDefaults`** (and client **`enrichGoalInsertWithArcContext`**) force **`strength_frequency = 2`** for tri when missing/NaN — interacts badly with any partial saves.

---

## 4. Building `athlete_state` for `generate-combined-plan`

**Source:** `buildCombinedPlan` → `mergeCombinedSchedulePrefs` → **`freshCombinedPrefs`** patch from **`newGoal`** for bike days → `invokeFunction(..., 'generate-combined-plan', { athlete_state: { ... } })`.

### 4.1 Physiological baselines omitted on combined path

The **`athlete_state`** object passed here includes CTL proxy, weekly hours, schedule indices, strength protocol, swim multiplier, etc.

It **does not populate** `bike_ftp`, `run_threshold_pace`, or `swim_threshold_pace` from Arc / `user_baselines` in the reviewed block.

Types in **`generate-combined-plan/types.ts`** allow those fields; **`week-builder.ts` / `session-factory.ts`** (spot-checked) **do not reference `bike_ftp` / run threshold** for prescription shaping — plans trend toward **generic zones / durations**.

**Effect:** **Baselines in Arc don’t tighten prescriptions** on the combined engine path — “cohesive personalized plan” vs **template physics**.

*(Standalone tri path later reads `user_baselines` for seeding — another divergence between engines.)*

### 4.2 Primary vs newly created goal merge

Comments warn: **A-priority goal owns skeleton**; **`newGoal` patches bike anchors** so stale DB rows don’t steal Wednesday group ride. Other fields can still come from **merged sibling prefs** — subtle drift if two goals carry conflicting `training_prefs`.

---

## 5. Plan generation: `generate-combined-plan`

### 5.1 Duplicated scheduling logic

**`week-builder.ts`** explicitly **duplicates sequential/placement rules** from **`week-optimizer.ts`** (same-day matrix is shared via **`schedule-session-constraints.ts`**).

**Effect:** Optimizer can emit **`preferred_days`** that **`buildWeek`** **re-interprets or overrides** (defaults Tue bike quality, Thu swim quality, Thu run-only easy run, narrative coupling Wed group ride → Thu quality run). **Coherence breaks** when two layers disagree.

### 5.2 Progression / phase cohesion

**Strength:** **`toStrengthPhase`** maps combined phase → protocol phase with **fixed `start_week: 1`, `weeks_in_phase: 4`** — progression can **reset at phase boundaries**, fighting long-range “one macrocycle” mental model.

**Endurance caps:** flags like **`returnFromRecoveryDeload`** cap long-run / long-ride behavior — can interact badly with “week after recovery should rebound” expectations.

---

## 6. Activation

**`activate-plan`** expands **`sessions_by_week`** → **`planned_workouts`** and calls **`materialize-plan`** for steps.

If upstream **`session_kind`** / **`intensity_class`** are missing or legacy rows rely on **name regex**, Arc surfaces can infer wrong “quality vs easy” — **`summarizeAnchorsHonoredFromWeekSessions`** documents reliance on **`session_kind`** first.

---

## 7. Symptom → likely cause (quick map)

| Symptom | Likely causes |
|---------|----------------|
| Group ride / anchor moved | Sparse prefs → full **`deriveOptimalWeek`**; **`week-builder`** defaults; pin restore skipped when matrix invalid |
| Strength sessions despite “off” | **`strengthDaysIn?.length ?? 2`** bug |
| Assessment week ignored | **`assessment_week_preference`** only on payload root, **not `training_prefs`** |
| Plan feels generic vs FTP/threshold | Combined **`athlete_state`** **doesn’t pass baselines**; builder doesn’t consume them heavily anyway |
| Different behavior one vs two races | **`combine`** toggles **entire engine** |
| No warning when schedule impossible | Wizard path **skips conflict UX**; **`co_equal_provisional_1x`** may downgrade without athlete-led §8.5-style resolution |

---

## 8. Architectural recommendations (directional)

1. **Single routing policy:** Either always **`generate-combined-plan`** for wizard-origin tri goals, or **explicitly document** dual paths and align inputs/outputs.
2. **Single scheduling authority:** Stop duplicating sequential rules — **`week-builder`** should consume **optimizer output as law** or share one module.
3. **Persist what you mean:** Put **complete `preferred_days`** (or an explicit “sparse + anchors only” contract) on the goal; thread **`assessment_week_preference`** into **`training_prefs`**.
4. **Honor scalar prefs:** Optimizer **`strength_frequency`** must read **`training_prefs.strength_frequency`**, not infer only from array length.
5. **Pass Arc baselines** into **`athlete_state`** and **use them** in session factories — or drop the promise from UX copy.
6. **Re-enable or replace conflict loop** for wizard saves when **`conflicts.length > 0`** or **`generation_trade_offs`** imply athlete-visible compromise.

---

## 9. Related docs

- `docs/plan-engine-contract-audit.md` — clause-by-clause vs **`PLAN-CONTRACT.md`**
- Workspace rule: Arc **`getArcContext()`** as single athlete truth — combined **`athlete_state`** currently under-ships that truth for physiology.

---

*Audit method: static code trace across wizard, persistence hooks, `create-goal-and-materialize-plan`, `generate-combined-plan`, and activation; no production changes.*
