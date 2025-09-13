# Efforts — Quick Start

## 🚀 **Status: LIVE & WORKING**

Plan JSON import and on‑demand week materialization are implemented. Optional toggles/XOR, Today/Calendar filtering, and Strava “never disconnect” are live.

## 🧭 Assistant Brief (cold‑start context)

- What this app is: training plans and workouts (React + Supabase + Edge Functions)
- Core rules: client‑side baking, week‑by‑week materialization, idempotent UPSERTs (no delete/replace)
- Optional logic: sessions tagged `optional` are hidden until activated; XOR swaps (swim ↔ quality bike)
- Durations: computed from `steps_preset` via the normalizer; totals exclude `optional` until activated
- Calendar/Today: show only non‑optional planned rows; calendar uses compact abbreviations
- Data model: `plans`, `planned_workouts`, `library_plans`, `workouts`, `user_baselines`, `device_connections`
- Important files: `AllPlansInterface.tsx`, `TodaysEffort.tsx`, `services/plans/normalizer.ts`, `ensureWeekMaterialized.ts`, `services/plans/plan_dsl.ts`
- Authoring: import JSON → validate with `universal_plan.schema.json` → DSL/macros expanded → store
- Strava: auto‑rotate refresh_token + proactive refresh; webhook ingests activities into `workouts`
- Constraints: avoid heavy SQL; keep baking client‑side or Edge; use UPSERT; tags may arrive as JSON strings

## 🏗️ Planned Workouts System (Recent Architecture)

### Core Data Flow
- **`planned_workouts` table**: Stores training plan sessions with status (`planned`/`completed`/`in_progress`/`skipped`)
- **`workouts` table**: Stores completed workout data with `planned_id` linking back to planned workout
- **Auto-association**: When user completes workout, system automatically links to matching planned workout
- **Cache layers**: React Query + memory cache + localStorage for performance

### Key Hooks
- **`usePlannedWorkouts()`**: Global planned workout context (excludes completed from UI)
- **`usePlannedRange()`**: Calendar-specific planned workouts (includes completed for display)
- **`useWorkouts()`**: Completed workout management with auto-association logic

### Recent Fixes (Jan 2025)
- **Auto-association**: Fixed to include completed planned workouts in search
- **Cache invalidation**: Added comprehensive cache clearing for deleted workouts
- **UI filtering**: Completed workouts hidden from selection dropdowns
- **Data structure**: Simplified queries to prevent 400 Bad Request errors

## 🔬 Auto-Attachment System (Critical Backend Math)

### Purpose
Links completed workouts to planned workouts for segment-by-segment comparison in Summary tab.

### How It Works
1. **Workout Completed** → `autoAttachPlannedSession()` runs
2. **Finds Matching Planned** → Within ±2 days, same type
3. **Links Both Ways** → `planned_id` ↔ `completed_workout_id`
4. **Triggers Backend Math** → `compute-workout-summary` Edge Function
5. **Summary Comparison** → Planned vs executed segments appear

### Backend Math System
- **`compute-workout-summary`**: Compares each segment (warm-up, intervals, cool-down)
- **`compute-workout-analysis`**: Generates analytics and derived metrics
- **Result**: Side-by-side comparison table in Summary tab

### Critical Issues
- **"Source: waiting for server"** = Auto-attachment not working
- **Empty comparison table** = Backend math system failed
- **Must include completed planned workouts** in `usePlannedWorkouts()` context

### Common Issues
- **Planned workout not showing**: Check context loading, type/date filters, status
- **Association not working**: Check auto-attach function, existing links, database queries
- **Cache persistence**: Clear plannedRange localStorage keys, dispatch invalidation events

## 🎯 The Different "Options" in Efforts App

### 1. **Optional Workouts** (Plan-Level Choices)
- **What**: Workouts marked as optional in training plan
- **Examples**: "Optional — Endurance 50 min", "Optional — Technique Swim"
- **Behavior**: Hidden by default, visible when user clicks "Add to week"
- **Purpose**: Let users customize their week

### 2. **Strength Logger "Workouts • Add-ons"** (Scheduling Choices)
- **What**: Planned strength workouts you can select to do on different days
- **Examples**: "Tuesday — Squat & Bench", "Thursday — Deadlift & OHP"
- **Behavior**: Shows planned workouts in dropdown, populates logger with exercises
- **Purpose**: Schedule strength workouts on different days than planned

### 3. **XOR Options** (Either/Or Choices)
- **What**: Mutually exclusive workout choices
- **Example**: "Swim OR Quality Bike" - choose one, not both
- **Behavior**: Selecting one hides the other, reversible
- **Purpose**: Weekly quality cap (max 1 quality bike/week)

### 4. **Workout Status Options** (Completion States)
- **What**: Different states a planned workout can be in
- **States**: `planned`, `completed`, `in_progress`, `skipped`
- **Purpose**: Track workout progress and linking

### 5. **Association Options** (Linking System)
- **What**: Ways to link completed workouts to planned workouts
- **Types**: Auto-attachment, manual association, re-association
- **Purpose**: Enable planned vs executed comparison in Summary tab

## 🎯 Optional Workouts System (Critical Understanding)

### Core Concept
- **Optional workouts** are hidden by default and only appear when user explicitly selects them
- **Activation flow**: User clicks "Add to week" → removes 'optional' tag → appears in Today's Efforts + Calendar
- **Deactivation flow**: User clicks "Remove" → adds 'optional' tag back → hidden from UI

### Key Components
- **AllPlansInterface**: Manages optional workout activation/deactivation
- **WorkoutCalendar**: Filters out optional workouts (only shows activated ones)
- **TodaysEffort**: Should only show activated workouts (currently broken)
- **usePlannedWorkouts**: Should filter out optional workouts (currently broken)

### Current Issues (Jan 2025)
- **Optional workouts showing in Today's Efforts** without being activated
- **usePlannedWorkouts hook** shows all workouts including optional ones
- **Inconsistent filtering** across components

### Tag System
- **`optional`**: Workout is optional and hidden by default
- **`opt_active`**: Optional workout has been activated by user
- **`xor:swim_or_quality_bike`**: XOR group for swim vs quality bike selection
- **`bike_intensity`**: Quality bike workout tag

### XOR Logic
- **Swim vs Quality Bike**: User can choose one or the other, not both
- **Reversible**: User can switch between options
- **Weekly Quality Cap**: Maximum 1 quality bike workout per week
- **Spacing Guards**: 24h minimum before long run/ride

## ✅ **Highlights**

- Plan import: validate with `universal_plan.schema.json`, expand Swim DSL/macros, strip author‑only fields
- Client‑side bake: materialize Week 1 on accept; later weeks on view; idempotent UPSERT
- Optional workouts: toggle in week view; XOR (swim ↔ quality bike); Today/Calendar hide `optional`
- Summaries: calendar cell abbreviations; strength/swim durations computed accurately
- Strava: automatic token rotation and proactive refresh in Edge Functions

## 🏗️ **Key Components**

- **Plan views**: `TodaysEffort.tsx`, `AllPlansInterface.tsx`, `PlannedWorkoutView.tsx`
- **Normalizer**: `src/services/plans/normalizer.ts`
- **Workouts data**: `src/hooks/useWorkouts.ts`

## 🚀 **Run Frontend**

```bash
npm install
npm run dev
```
Create `.env.local` in the repo root:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
```

## 🚀 **Deploy Frontend**

- Netlify auto‑deploys from `main` per `netlify.toml` (build `npm run build`, publish `dist`).

## 🔧 **Deploy Edge Functions (Supabase CLI)**

```bash
# Install CLI (once)
brew install supabase/tap/supabase

# Login and link (once per machine)
supabase login
supabase link --project-ref yyriamwvtvzlkumqrvpm

# Deploy functions
supabase functions deploy strava-webhook --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy import-strava-history --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy send-workout-to-garmin --project-ref yyriamwvtvzlkumqrvpm

# Verify
supabase functions list --project-ref yyriamwvtvzlkumqrvpm | cat
```

## 📚 **Essential Files**

- **`README.md`** — Run/deploy instructions and project status
- **`PLAN_AUTHORING.md`** — How to write JSON plans (tokens, DSL/macros)
- **Schema** — `src/services/plans/contracts/universal_plan.schema.json`

## ✍️ **Authoring Plans (Plug‑and‑Play)**

See `PLAN_AUTHORING.md` for token grammar and `export_hints`. The normalizer renders friendly summaries and computes durations.

---

**Status**: ✅ Production Ready