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