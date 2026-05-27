# Strength Analysis Spec

**Efforts — Post-Session Strength Performance Layer**

- **Status:** Draft — 2026-05-27
- **Companion doc:** `docs/STRENGTH-PROTOCOL.md` (prescription layer — what to assign)
- **Scope:** Everything after the session ends — logging UX, performance tab, analytics, INSIGHTS narrative.

---

## 0. Design principle

Strength performance in Efforts is **not a workout log**. It's a **coaching read**.

Every pure strength app (Hevy, Strong) tells you what you lifted. Efforts tells you what you lifted, **whether that was right for this phase of your training**, and **what it means given everything else you did this week**. The endurance context is always present.

The performance tab for a strength session should answer three questions:

1. **Did you execute the plan?** (load adherence, RIR actual vs target)
2. **Are you progressing?** (1RM trend, volume trend, per-exercise history)
3. **What does this mean given your full training week?** (endurance load context, phase position)

---

## 1. Logger — what gets captured

The logger captures per-set data for each exercise:

```ts
interface LoggedSet {
  exercise_name: string
  set_number: number
  reps_completed: number
  weight_lb: number
  rir_actual: number | null       // Rate of Perceived Exertion in Reserve
  rest_seconds: number | null     // actual rest taken
  equipment_used: string          // 'barbell' | 'dumbbell' | 'bodyweight' | 'band'
  completed_at: string            // ISO timestamp
}
```

### 1.1 Logger UX requirements

- **Previous session inline** — before logging a set, show last session's weight × reps for that exercise. The athlete sees "Last time: 85 lb × 8" before they enter today's numbers. This is the single highest-value UX feature in Hevy/Strong. Without it the athlete is guessing.

- **One interaction per set** — all three fields (reps, weight, RIR) in a single bottom sheet with a number pad. Current implementation opens three separate pickers — too slow for gym use. The flow should be:
  1. Tap set row
  2. Bottom sheet opens with reps / weight / RIR fields and numpad
  3. Enter reps → tab to weight → tab to RIR → tap Done
  4. Set logged, rest timer starts automatically

- **Auto rest timer** — starts on set completion without a tap. Shows countdown on the active session header. Timer duration from the planned session's rest prescription.

- **Session persistence** — strength session state must survive app backgrounding. If the athlete locks their phone between sets and returns, the session is exactly where they left off. State saved to local storage on every set completion.

- **Plate calculator** — for barbell exercises, show the plate math when weight is entered. "135 lb = 45 + 2×20 + 2×2.5" saves mental arithmetic between sets.

---

## 2. Planned vs actual — the Performance tab

### 2.1 What the planned column should show

Currently shows "—" for all sets. The planned data exists in `planned_workouts` — it needs to surface.

For each exercise and set:

| Column | Source | Example |
|---|---|---|
| Planned | `planned_workouts.exercises[i].sets[j]` | 8 reps @ 85 lb (RIR 3) |
| Completed | logged set data | 8 reps @ 85 lb (RIR 2) |
| Previous | last session's logged set for same exercise | 8 reps @ 80 lb (RIR 3) |

- **Adherence badge** — per-exercise, not per-set. Green if all sets hit planned reps and within ±5% of planned weight. Yellow if partial. Red if significantly under.
- **RIR delta** — actual RIR vs planned RIR. A consistently lower actual RIR (athlete working harder than planned) is a fatigue signal. A consistently higher actual RIR (athlete working easier than planned) is either a load calibration issue or deload behavior.

### 2.2 Session-level metrics

Shown at the top of the Performance tab, parallel to the cycling adherence chips:

- **Volume adherence** — total sets completed vs planned (e.g., 18/21 sets — athlete skipped 3 sets)
- **Load adherence** — % of sets within ±5% of planned weight
- **RIR adherence** — actual avg RIR vs planned avg RIR (negative delta = working harder than planned)
- **Estimated 1RM** — Epley formula from best set per exercise: `weight × (1 + reps/30)`

### 2.3 Per-exercise view

Tapping an exercise row expands to show:

- All sets for this session (planned vs actual)
- Previous session sets inline
- Mini trend: last 6 sessions' best set per exercise (weight × reps → estimated 1RM)
- PR flag if this session's best set is a new personal record

---

## 3. Analytics — what Efforts tracks over time

### 3.1 Per-exercise tracking

For each exercise the athlete has logged:

- **1RM estimate trend** — Epley-estimated 1RM from best set each session, plotted over time. The equivalent of the cycling NP trend. Shows whether the athlete is getting stronger.
- **Volume trend** — total sets × reps × weight per session over time. Volume is the primary hypertrophy driver; this is the load management signal.
- **Set records** — heaviest weight for each rep target (1RM, 3RM, 5RM, 8RM, 10RM)

### 3.2 Session-level tracking

- **Total session volume** — sum of (sets × reps × weight) across all exercises
- **Phase progression** — where in the current mesocycle this session falls
- **Weekly strength load** — rolling 7-day strength volume, used in the endurance load calculation

### 3.3 Phase-aware progression

The 1RM estimate trend is interpreted in phase context:

- **Hypertrophy phase** — volume is rising, 1RM estimates may be flat or rising modestly. Normal.
- **Strength Build phase** — 1RM estimates should be rising. Flat or falling = load calibration issue.
- **Maintenance phase** — 1RM estimates should be stable. Rising = under-prescribed load.
- **Deload week** — 1RM estimates meaningless; skip in trend display.

---

## 4. INSIGHTS narrative — the coaching read

### 4.1 Data inputs to the LLM

The strength fact packet should include:

```ts
interface StrengthFactPacket {
  // Session identity
  session_name: string              // "Base Hypertrophy (Upper)"
  phase: string                     // "hypertrophy" | "strength_build" | "maintenance" | "power" | "deload"
  week_in_phase: number
  protocol: string                  // "performance" | "durability"

  // Adherence
  sets_completed: number
  sets_planned: number
  volume_adherence_pct: number      // sets_completed / sets_planned
  load_adherence_pct: number        // % sets within ±5% of planned weight
  rir_actual_avg: number | null
  rir_planned_avg: number | null
  rir_delta: number | null          // negative = working harder than planned

  // Progression signals
  exercises: {
    name: string
    best_set: { weight_lb: number, reps: number, estimated_1rm: number }
    planned_set: { weight_lb: number, reps: number, rir_target: number }
    pr_this_session: boolean
    trend_direction: 'improving' | 'stable' | 'declining' | null  // last 4 sessions
  }[]

  // Endurance context (from athlete_snapshot)
  endurance_load_today: number | null    // TSS from endurance sessions same day
  endurance_load_7d: number             // rolling 7-day endurance TSS
  consecutive_training_days: number
  days_to_next_race: number | null

  // Phase context
  is_deload_week: boolean
  weeks_until_race_specific: number | null
}
```

### 4.2 Narrative shape

Same 3-4 sentence structure as cycling and run. Template by session outcome:

**Clean execution (all sets hit, RIR on target):**

> "S1 — What happened: You completed all [N] sets of [main lifts] at [planned load] — on target for [phase] week [W]. S2 — Physiological read: [RIR observation — e.g., 'RIR averaged 2.8, right at the planned 3, which means load calibration is accurate for this phase']. S3 — Load context: [endurance context if relevant — e.g., 'You rode 2 hours this morning; any RIR drift toward 2 is expected and not a concern']. S4 — Forward: [phase position or race countdown — e.g., '6 weeks until race-specific phase — keep executing the hypertrophy block cleanly']."

**Under-executed (missed sets or weight significantly below plan):**

> "S1 — What happened: You completed [N/planned] sets — [reason if clear, e.g., 'the session was cut short']. S2 — Load context: [endurance load that day / week]. S3 — What it means: [phase position — e.g., 'One under-executed session in hypertrophy doesn't affect the block outcome; the volume is cumulative']. S4 — Forward: [recovery or next session note]."

**PR session:**

> "S1 — PR flag: You set a new [exercise] record — [weight × reps, estimated 1RM]. S2 — Phase context: [what this means in the current phase]. S3 — Endurance context: [whether the PR is meaningful given load or should be expected to hold]. S4 — Forward."

**Deload week:**

> "S1 — Deload confirmation: Load and volume are intentionally reduced this week. S2 — What to expect: [1-2 sentences on what deload does]. S3 — Forward: Next week returns to [next phase]."

### 4.3 Prompt rules

- **Never compare strength performance to endurance metrics** — don't say "like your Z2 ride"
- **RIR is a fatigue signal, not a failure signal** — low RIR (working harder than planned) is not bad; it's information. High RIR (easier than planned) may mean load is too light.
- **Phase context always present** — the athlete should always know where they are in the mesocycle
- **Endurance load context when material** — if same-day TSS from endurance is >80, mention it; if it's a rest day for endurance, skip it
- **No jargon** — 1RM is "your estimated max," RIR is "reps in reserve (how many more you could have done)," phase names in plain English ("base strength-building phase")
- **PRs are called out** — if any exercise hit a personal record, it leads S1

---

## 5. Integration with endurance load management

### 5.1 Strength load in the weekly TSS budget

Strength sessions contribute to weekly load. The current approximation:

- Performance (hybrid) upper session: ~40 TSS equivalent
- Performance (hybrid) lower session: ~50 TSS equivalent
- Durability session: ~25 TSS equivalent

These feed into the `consecutive_training_days` count and the weekly load flag that gates recovery recommendations.

### 5.2 Strength → endurance interference signals

The analyzer should flag when logged strength data suggests the upcoming endurance sessions may be compromised:

- **Lower body session the day before a long run** — flag: "Yesterday's lower body session may add residual fatigue to today's long run. If legs feel heavy in the first 20 minutes, it's expected — not a fitness signal."
- **RIR delta trending low over 3+ sessions** — flag: "Your RIR is consistently running 1-2 below target. This may reflect accumulated endurance fatigue — consider whether the strength load needs adjusting or a deload is due."

### 5.3 Endurance → strength interference signals

The opposite direction — when endurance load should inform how the athlete interprets their strength session:

- **Same-day endurance TSS > 80** — note in INSIGHTS: "You trained [X] hours of endurance before this session. Any reduction in strength output is load-appropriate, not a regression."
- **7-day endurance TSS > plan target** — note: "High training load this week. If loads feel heavier than the phase targets suggest, that's the cumulative fatigue — not a strength regression."

---

## 6. Previous session display — the "PREVIOUS" column

The single highest-impact UX improvement over current state. Before the athlete logs a set, they should see what they did last time for that exercise.

- **Display:** Inline on each set row in the logger. Format: "Last: 85 lb × 8 (RIR 2)"
- **Source:** Most recent completed session that included this exercise, same set number.
- **When no previous data exists:** Show "—" (first time logging this exercise).
- **Progressive overload signal:** If today's weight for a given set is higher than last session's, show a small upward arrow. If lower, show a downward arrow. Neutral if same.

---

## 7. Implementation surfaces

### 7.1 Files that need changes

**Logger (existing, needs UX redesign):**

- `src/components/StrengthLogger.tsx` (or equivalent) — bottom sheet, previous session inline, auto rest timer, local storage persistence

**Performance tab:**

- `src/components/StrengthPerformanceTab.tsx` (or equivalent) — planned vs actual table, adherence chips, per-exercise expansion
- `_shared/session-detail/build.ts` — add strength fact packet assembly
- `analyze-strength-workout/index.ts` (may need creation if not exists) — parallel to cycling/run analyzers

**Analytics:**

- `src/components/ExerciseHistory.tsx` (or equivalent) — per-exercise trend, 1RM chart, set records

**LLM prompt:**

- `_shared/strength-v1/ai-summary.ts` (new) — parallel to `_shared/cycling-v1/ai-summary.ts`
- `_shared/fact-packet/build.ts` — add strength fact packet

### 7.2 Data sources

| Data | Source |
|---|---|
| Planned exercises / sets / load | `planned_workouts.exercises` (JSONB) |
| Logged sets | `workouts.computed.logged_sets` or `exercise_log` table |
| Previous session | Query last completed strength workout with same exercise names |
| Endurance load context | `athlete_snapshot.{ctl, atl, tsb}` + today's workout TSS |
| Phase context | `planned_workouts.{phase, week_number}` |
| 1RM data | `user_baselines.performance_numbers.{squat_1rm, deadlift_1rm, etc.}` |

### 7.3 Known gaps (do not fix yet)

- Strength session TSS approximation is currently a rough constant — not computed from actual logged load. A true strength TSS (based on volume × intensity) would be more accurate but requires calibration data. Deferred.
- The `analyze-strength-workout` edge function may not exist yet — needs verification before speccing the analyzer pipeline.
- Exercise history query performance — querying all previous sessions for a given exercise may need indexing on `exercise_name` within the JSONB `logged_sets` structure.

---

## 8. What makes Efforts different from Hevy/Strong

| Feature | Hevy | Strong | Efforts |
|---|---|---|---|
| Previous session inline | ✓ | ✓ | ✓ (to implement) |
| Auto rest timer | ✓ | ✓ | ✓ (to implement) |
| 1RM trend | ✓ | ✓ | ✓ (to implement) |
| Volume analytics | ✓ | ✓ | ✓ (to implement) |
| Planned vs actual | ✗ | ✗ | ✓ — Efforts has a plan |
| Phase-aware load context | ✗ | ✗ | ✓ — knows the mesocycle |
| Endurance load context | ✗ | ✗ | ✓ — sees the full week |
| Interference signals | ✗ | ✗ | ✓ — run/bike fatigue flagged |
| INSIGHTS narrative | ✗ | ✗ | ✓ — coaching read, not just data |

The **planned vs actual** column and the **endurance load context** are the two things no pure strength app can offer. Everything else is table stakes. Build the table stakes first, then the differentiators.
