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
- **State** — **`ContextTabs`** → **`StateTab`**, fed by **`useCoachWeekContext`** (coach / weekly state; plan adaptation cards also merge **`adapt-plan`** `suggest` when an active plan exists — see [Plan adaptation cards](#plan-adaptation-cards-state)).
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

### Plan generation — swim drills

Combined plans (**`generate-combined-plan`** → **`session-factory`**) and standalone tri plans (**`generate-triathlon-plan`** → **`tri-generator`**) both pick inserted drill tokens through **`src/lib/plan-tokens/swim-drill-tokens.ts`**: **`resolveSwimDrillPhase`** maps phase labels (e.g. combined `race_specific` and tri `Race-Specific` / contract `peak`) into shared **base / build / peak / taper** pools so methodology is consistent — early plan emphasizes technique and water feel, mid-plan shorter drills, near-race minimal reminders, taper nearly none — not a single random pool rotation.

**Equipment:** Current phase pools use only **`swim_drills_*`** bodyweight drills (catch-up, fingertip drag, fist, kick, etc.); they do **not** expand to pull-buoy or paddle main sets in **`materialize-plan`**. When adding pull-buoy or paddle drill tokens later, **gate** them on the athlete’s swim equipment (e.g. **`user_baselines.equipment`** / Arc equipment snapshot) before those tokens are eligible for any pool, so prescription never assumes gear the athlete does not have.

**Performance contract:** Endurance Performance leans on **`session_detail_v1`**. Strength/mobility Performance uses **`StrengthPerformanceSummary`** / **`StrengthCompareTable`** from completed row fields (notably `strength_exercises`), merged carefully with `useWorkoutDetail` and refresh paths.

---

## Where Arc shows up on the client today

**Direct `fetchArcContext` / `get-arc-context`:**

- **`TodaysEffort`** — home Arc line / goals-setup hints (`buildArcLine`, etc.).
- **`ArcSetupChat`**, **`TrainingBaselines`**, **`useArcSetupContext`**.

**Arc-shaped server payloads (not necessarily the same HTTP call as `get-arc-context`):**

- **`StateTab`** via **`useCoachWeekContext`** (`weekly_state_v1`, goals, race readiness, etc.) — stays aligned with Arc because **`coach`** loads **`getArcContext`** on the primary path.

### Arc grounding (server — `getArcContext`)

| Function | Loads `getArcContext` on primary path |
|----------|----------------------------------------|
| `coach` | ✅ |
| `workout-detail` | ✅ (non-blocking `.catch → null`) |
| `adapt-plan` | ✅ (`action: suggest`; non-blocking try/catch; QA override `ADAPT_PLAN_FORCE_ARC_NULL`; Arc-gated progression/deload on suggest) |
| `get-week` | ❌ |

### Plan adaptation cards (State)

When **`weekly_state_v1.plan.has_active_plan`**, **`useCoachWeekContext`** calls **`adapt-plan`** with **`action: suggest`** after **`coach`**, then merges selected suggestions into **`weekly_state_v1.coach.plan_adaptation_suggestions`** for **`PlanAdaptationCard`** (**Got it** / **Dismiss** → **`adapt-plan`** **`accept`** where wired, plus dismissal cooldown in **`coach`**).

Merged from **`adapt-plan`** today: **`strength_relayout`** (prepended if missing), **`end_easy_pace`** and **`end_ftp`** (appended; types **`endurance_pace_update`** / **`endurance_ftp_update`**). Server fields **`id`** / **`description`** map to card **`code`** / **`details`**. Endurance rows only appear when learnings vs manual baselines and Arc gates allow (e.g. meaningful delta, not suppressed for load/taper); no row is a valid outcome.

**Got it → persistence:** Endurance accepts update **`performance_numbers`** directly (**easyPace**, **FTP**). Strength accepts write **`plan_adjustments`** scaling factors, not stored 1RMs. **Baseline drift card** is a separate accept path for lift numbers.

**Swim:** **`adapt-plan`** does not yet emit swim baseline suggestions — additive later.

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
| **`adapt-plan` swim / CSS suggestions** | Not in suggest payload today; run + bike endurance baselines only. |

Everything else in recent sprints is either **done** or an explicit **known tradeoff** (e.g. partial invalidation vs full `invalidateWorkoutScreens()`).

---

## Changelog (manual)

- **2026-05-03** — Initial check-in from chat audit: architecture snapshot, Arc usage, `get-week` gap, follow-up table.
- **2026-05-04** — Arc grounding table: `adapt-plan` (suggest) now loads `getArcContext`; `get-week` remains the main server gap.
- **2026-05-05** — State tab: `useCoachWeekContext` merges `adapt-plan` endurance suggestions (`end_easy_pace`, `end_ftp`) into plan adaptation card; swim still out of scope on `adapt-plan`; doc section for plan adaptation flow.
- **2026-05-06** — Plan adaptation: document endurance vs strength persistence (`performance_numbers` vs `plan_adjustments`) and baseline drift card.
- **2026-05-07** — Plan generation: phase-aware swim drill selection (`swim-drill-tokens.ts`), equipment-safe pools; note future gating for pull buoy / paddles on baselines / Arc equipment.
