# CONCEPT — "Adapt a Plan" (strength first)

Status: **design doc, uncommitted. No code written.** Written 2026-07-23 from a full trace (server + client + docs). This is the plan we build against; it captures what already exists so the build is wiring, not re-invention. Read `TARGET-ARCHITECTURE.md` (steerable plans), `LIFECYCLE.md` (frozen-vs-live) and `CONCEPT-plan-your-week.md` (the reschedule half) alongside it.

---

## The frame

"Adapt a plan" is the app's stated north star, not a new idea. `TARGET-ARCHITECTURE.md` #3 calls it **steerable plans**: *at any stage you can push any single discipline harder or easier, and the app absorbs it coherently — adjusts, explains why, never breaks structure.* The mandate attached to it: every adjustment flows through **one adaptation path**, re-materializes coherently, respects the interference model, and is **legible**.

The honest current state: **the machinery to change a plan exists and runs constantly — but the half that runs silently doesn't ask you, and the half that asks you is wired to a dead button.** So this is mostly surfacing and consent, plus two genuinely new surfaces.

## The architecture split (decided)

- **Goals = build from scratch.** Plan creation stays where it is (`create-goal-and-materialize-plan` → `generate-combined-plan` → `activate-plan`). Untouched.
- **State = refine.** The dashboard gets an **"Adjust plan"** button → a **refine hub** → **one screen per discipline**. Creation in one place, modification in the other. Maps onto the lifecycle: Goals = birth, State = life.

### Front-door shape

- State stays a glanceable dashboard (it is already dense — editing does not belong on it).
- A top-level "Adjust plan" entry, **plus** each discipline row deep-links straight to its own refine screen.
- Each discipline screen is its own space — breathing room for mods (swap sheets, add-exercise, target tuning). Build **strength first** (deepest machinery, the four asks below), then clone the pattern for run/bike/swim.

### The rule the whole build is held to

Full continuity **and** clean autonomous functions are the same principle, not a trade-off:
- **Continuity = one writer per fact.** Each fact (e1RM, load, RIR target, plan primary) computed in exactly one place; every surface reads it.
- **Autonomy = each function owns one thing and exposes it** — never keeps its own copy of someone else's fact. "Self-sufficient" recomputation is the doubled disease that spawned the fractures here.
- Screens do **not** talk to each other (coupling = mess). They all read the same shared truth, so they agree without knowing about each other. The spine is the coordination layer.
- Concretely: every refine edit **writes through `adapt-plan`/`materialize-plan`** and **reads the one spine**. No screen edits `planned_workouts` directly; no screen recomputes a verdict.

---

## What already exists (traced — do not rebuild)

**Server**
- `adapt-plan/index.ts` — the adaptation engine. Actions `suggest` / `accept` / `dismiss` / `auto` / `auto_batch`.
  - `auto` fires on every ingest, re-prices strength off e1RM+RIR trend, writes `plan_adjustments`, re-materializes. **Not gated, not asked.** Endurance auto-writes were deliberately deleted (D-285).
  - `suggest`→`accept` is well-built, confidence- and fatigue-gated. Its only Accept UI is on the **unmounted** `CoachWeekTab` — dead.
- `plan_adjustments` table — strength load-override channel. Written only by `adapt-plan`; read only by `materialize-plan:2822` (`applyAdjustment`, honours `applies_from: today` so the past is safe).
- `materialize-plan` — expands `sessions_by_week` tokens → `computed.steps` on `planned_workouts`; applies `plan_adjustments`. The frozen→live boundary sits here.
- `getTargetRir(profile, lift, phase)` (`_shared/strength-profiles.ts:178`) — the canonical, protocol/phase/lift-aware RIR target. Used on the analysis side only (see step 0).
- `getInSlotAlternatives` (`src/lib/exercise-alternatives.ts`) — like-for-like swap options, filtered by movement pattern + equipment. **Already wired into the logger.**

**Client**
- `StrengthLogger.tsx` — the **swap sheet is live** (`swapFor` state; sheet ~`:4131`). Bulgarian split squat → walking lunge is a passing test. Picking a swap renames the exercise and clears the weight (a lunge is not loaded like a split squat). Free search box = out-of-slot allowed. **But the swap changes only that day's logged session — it does not persist forward.**
- `StrengthAdjustmentModal.tsx` — the built weight-edit path: writes `plan_adjustments` → re-materializes. Surfaced today as a dotted-underline link on the State strength row, **only when the engine already has a suggestion** (not a general editor).
- `WorkoutBuilder.tsx` — manual session builder, 6 disciplines, interval/pace builder. Reachable but buried in the plans hub.
- `usePlannedWorkouts.ts` — generic add/update/delete primitives (`updatePlannedWorkout` accepts arbitrary partials).
- Optional-session mechanism (`TodaysEffort.tsx:1086` + `optional-ui-spec.json`) — activate an optional session, swim↔ride XOR swap, spacing guard, auto-move off a hard day. **Working, spec-driven — the bones for "add a session / swap discipline."**

## Migration verdict — `AllPlansInterface`

Almost nothing migrates. Its "editing" is dead or fake: **Modify** button (no onClick), **+ Add Workout** (gated behind a hardcoded-empty list, never renders), **Adjustments chat** (a 2s timeout returning canned strings, writes nothing), **edit mode** (`{false ? …}` scaffolding). The only uniquely-live refinement is the "remove optional session" toggle; the *activate* twin lives in `TodaysEffort`. So:
- State-refine does **not** absorb `AllPlansInterface`. It builds on the logger swap + `StrengthAdjustmentModal` + `adapt-plan`.
- `AllPlansInterface` stays pure catalog/lifecycle (pause/resume/end/delete, selection, goal display).
- Its dead edit scaffolding is hygiene to delete.
- Reuse (not migrate) the `TodaysEffort` optional/swap mechanism for add-session/swap-discipline.

---

## The four strength asks → build shape

### Step 0 — RIR wiring (confirmed fracture; foundation)
**Finding:** the plan builder never calls `getTargetRir`. In `session-factory.ts:2273` and both `materialize-plan` strength branches (`:1783`, `:1959`), `target_rir` is only **passed through** (`ex.target_rir ?? undefined`) — it forwards whatever the template carried, or nothing. Meanwhile the analyzer grades against `getTargetRir`. So the RIR **preloaded in the logger** and the RIR **you're graded against** are not sourced from the same function, and for lower-vs-upper lifts they are *supposed* to differ.
- **Unverified:** whether it visibly bites today depends on the template values — confirm those before calling it a live wrong-number (it is a confirmed *structural* single-source gap regardless).
- **Fix (pure wiring):** builder stamps every planned lift with `getTargetRir(profile, lift, phase)` so the logger preloads exactly the number the analyzer judges against. One source, both ends. Do this first — the swap/add features sit on top of it.

### 1. Permanent swap (like-for-like + full custom)
The one-session swap exists in the logger. The new bit is **persistence**: promote a swap to "just this week" or "rest of the plan," written to the plan (`sessions_by_week` / adjustment-style override), so every future instance changes. Offer both scopes (today's-only vs forever). Equipment filter already present → the traveler case (below) reuses it.

### 2. Add an exercise → map to baseline → progressive overload
Genuinely new as a plan edit. Weight can seed off baselines — `exercise-config` carries a loading reference per movement (e.g. hip thrust ≈ 90% of deadlift), so a no-history exercise gets a first weight. Progression logic already runs (see #3). Missing: the UI to add the exercise and keep it in future weeks.
- **Open call:** is an added exercise a fixed accessory the user owns, or a first-class slot the engine progresses like a main lift? Decides how much of auto-progression it plugs into.

### 3. Auto-heavier when RIR surpasses prescription — already runs, silently
Not a new build. `adapt-plan auto` already bumps weight when e1RM trends up + RIR sits above target. GAME-PLAN Phase 4 already ruled the handling: **make it visible and consented — mirror the easy-pace chooser; default = today's behaviour, shown and overridable.** So this = surface + consent, and it revives the dead accept path.

---

## Back-pocket (not v1, keep in view)

- **A. Swap days / weird week.** Rides the reschedule + optimizer path (single-day move exists via `validate-reschedule`; whole-week re-arrange is bigger). A natural tab on the refine hub ("this week's shape"). Note: `validate-reschedule` does **not** yet run the `week-optimizer` placement matrix — the per-move validator over the optimizer is the one net-new backend piece (`CONCEPT-plan-your-week.md:62`).
- **B. Hotel subs (traveler).** Less lofty than it sounds: the swap sheet is already equipment-filtered. "Hotel mode" = temporarily narrow the equipment set → the same engine re-offers the session with available gear. Lofty part is a whole-trip / all-discipline sweep. Bones exist.

---

## Invariants any edit must not violate (from the docs)

1. **Optimizer is the sole "what day" authority** — reshuffle through it, never hand-place.
2. **The reconciler is the sole load/verdict authority** (D-267 THE LAW) — editing which discipline leads changes `planPrimary` (`config.source`), resolved once and threaded; no surface re-derives "are you doing enough."
3. **Single source of truth per fact** — strength direction = spine, prescription = coach, both off `exercise_log.estimated_1rm` (D-270). A hardcoded discipline or run-only query is a bug.
4. **Frozen-vs-live** — re-materialize stamps `applies_from: today`, rewrites only future rows; executed workouts are immutable.
5. **Science owns the session's insides** (PLAN-CONTRACT §1.2) — athlete owns schedule/anchors/intent; making an easy day hard or overriding a taper is not theirs. Hard constraints (same-day matrix, no two consecutive hard, 80/20 floor, phase-can't-regress, race-week) hold against a user edit.
6. **Honesty over silent degradation** — every edit-induced conflict surfaces named tradeoffs with a path back.

## Known-broken substrate to watch
- `toStrengthPhase` resets the mesocycle every phase (breaks weight-progression continuity) — any "adjust weights" feature inherits it.
- Non-race / multi-discipline shapes barely materialize (`SPEC-non-race-goal-plan-contract`: 0/16 non-race combos) — "add a discipline" to a non-tri plan crosses two engines today.
- `GOALS_SYSTEM_BLUEPRINT`'s rolling-generation design is fiction; the real path is one full materialization at activation.

---

## Open decisions (for Michael)
1. Added exercise = fixed accessory, or engine-progressed slot? (blocks #2 depth)
2. Swap scopes — offer both "today" and "rest of plan"? (assumed yes)
3. Confirm step-0 RIR is the first thing built.
4. Whether reviving the consent/accept path (#3) mounts `CoachWeekTab` or a new surface.

## Sequencing
Design the hub to hold all four disciplines, build **strength only** first: **Step 0 (RIR wiring) → 1 (permanent swap) → 3 (surface+consent auto-progress) → 2 (add exercise)**. Prove the pattern, then clone for run/bike/swim. Everything writes through `adapt-plan`/materialize, reads the spine.
