# Efforts — app flow & data architecture

Living baseline for how the client is structured, how data moves, and where **Arc** fits. Update this when navigation, primary edge contracts, or Arc grounding changes materially.

---

## Principles

- **Smart server, dumb client:** Heavy logic and athlete truth live in Supabase + Edge Functions. The app renders payloads, runs mutations, and **invalidates** caches (`workout-detail`, `planned` / `workouts` / `week` events, and bundled `invalidateWorkoutScreens()` where a full triple bust is intended).
- **Arc** (see `.cursor/rules/arc-intelligence-layer.mdc`) is the deterministic athlete-intelligence layer — not a screen. Server-side **`getArcContext`** (`supabase/functions/_shared/arc-context.ts`) is the implementation. The thin HTTP entry for a client snapshot is **`get-arc-context`** → `fetchArcContext()` (`src/lib/fetch-arc-context.ts`).

---

## Entry & routing

| Route | Loads |
|--------|--------|
| `/`, `/goals`, `/profile/athletic-record` | `Index` → `AuthWrapper` → (signed in + approved) **`AppLayout`** |
| `/connections` | Integrations |
| `/onboarding/profile` | Profile onboarding |
| `/plans/*` | Plan select, catalog, build, wizard, admin, mobility builder |
| `/arc-setup` | Arc setup |
| OAuth callbacks | Strava / Garmin |

Daily use is mostly **`AppLayout`**, not standalone routes.

---

## Signed-in shell (`AppLayout`)

- **`AppContext`:** Workouts (via `useWorkouts`), plans bundle, baselines helpers, add/update workout. This is **client cache** for lists and mutations — not the full Arc object.

**Home (typical):**

- **`TodaysEffort`** — day strip for selected date; week range from **`useWeekUnified`** → **`get-week`** (server-merged planned + completed).
- **`WorkoutCalendar`** — same **`get-week`** for the visible week; `week:navigate` syncs date; adjacent weeks may be prefetched.

**Bottom nav:**

- **Home** — `TodaysEffort` + `WorkoutCalendar` (+ overlays: selected workout, strength logger, import, etc.).
- **State** — **`ContextTabs`** → **`StateTab`**, fed by **`useCoachWeekContext`** (coach / weekly state).
- **Goals** — goals stack UI; plan/goals invalidation events as needed.

**Deep workout UI:**

- **`UnifiedWorkoutView`** — Planned / Performance / Details. **Performance** uses **`useWorkoutDetail`** → **`workout-detail`** (`scope: workout`, optional `session_detail`). **Details** uses **`CompletedTab`** / **`StrengthCompletedView`** with merged **`completedData`**.

**Other surfaces** (flags inside `AppLayout`): all plans, plan builder, baselines, athletic record, gear, context modals, etc.

---

## Primary data pipelines

| Concern | Edge / source | Client |
|--------|----------------|--------|
| Week grid (home / calendar) | **`get-week`** | `useWeekUnified` |
| Single workout + analysis | **`workout-detail`** | `useWorkoutDetail` |
| Arc snapshot (subset for UI) | **`get-arc-context`** | `fetchArcContext` |
| Weekly coach / load / race framing | **`coach`** (+ cache) | `useCoachWeekContext` |
| Plans lifecycle | plan edges + bundle loaders | `AppContext`, plan/goal screens |

**Performance contract:** Endurance Performance leans on **`session_detail_v1`**. Strength/mobility Performance uses **`StrengthPerformanceSummary`** / **`StrengthCompareTable`** from completed row fields (notably `strength_exercises`), merged carefully with `useWorkoutDetail` and refresh paths.

---

## Where Arc shows up on the client today

**Direct `fetchArcContext` / `get-arc-context`:**

- **`TodaysEffort`** — home Arc line / goals-setup hints (`buildArcLine`, etc.).
- **`ArcSetupChat`**, **`TrainingBaselines`**, **`useArcSetupContext`**.

**Arc-shaped server payloads (not necessarily the same HTTP call as `get-arc-context`):**

- **`StateTab`** via **`useCoachWeekContext`** (`weekly_state_v1`, goals, race readiness, etc.) — should stay aligned with Arc **if** the coach edge is Arc-grounded internally.

---

## Honest gap: single narrative vs cache alignment

- The **server** is Arc-grounded **inconsistently across edges**: e.g. **`coach`** and **`workout-detail`** use Arc; **`get-week`** today does **not** start from the same Arc snapshot (it is optimized for calendar/week materialization and unified rows).
- **Screens stay coherent** largely because **invalidation** and **shared DB truth** keep React Query / context caches aligned — not because every edge function receives the same Arc payload on every request.

That is an acceptable tradeoff until you narrow the gap; the **next frontier** for a true single narrative is **`get-week`** optionally consuming **narrow Arc fields** (planned work: item #6 — still parked when not yet implemented).

---

## Known follow-ups (architectural)

| Item | Notes |
|------|--------|
| **`get-week` + narrow Arc fields** | Ground calendar/week responses in Arc where useful without bloating payload; original plan #6, parked until designed. |
| **`mergeSessionDetailRaceReadiness` removal** | Wait until **`stale`** / session_detail contract is trusted in prod; then remove client-side merge of race readiness into `session_detail_v1`. |
| **`WorkoutSummary` legacy fork** | Retire or converge with Unified / Mobile summary paths — avoid two competing “summary” stories. |

Everything else in recent sprints is either **done** or an explicit **known tradeoff** (e.g. partial invalidation vs full `invalidateWorkoutScreens()`).

---

## Changelog (manual)

- **2026-05-03** — Initial check-in from chat audit: architecture snapshot, Arc usage, `get-week` gap, follow-up table.
