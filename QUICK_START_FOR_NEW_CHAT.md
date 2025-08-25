# Efforts — Quick Start

## 🚀 **Current Status: LIVE & WORKING**

The app is deployed and functioning. Current focus is on deterministic, user‑friendly plan rendering and reliable data ingestion.

## 🎯 **Current Focus**

- Deterministic normalizer across Today / Plan Detail / Full Plan
- Reliable Strava webhook ingestion via CLI deploy
- JSON plug‑and‑play templates using `steps_preset` + `export_hints`

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

- **`README.md`** - Run/deploy instructions and project status
- **`PLAN_AUTHORING.md`** - How to write JSON plans
- **Schema**: `src/services/plans/contracts/universal_plan.schema.json`

## ✍️ **Authoring Plans (Plug‑and‑Play)**

- See `PLAN_AUTHORING.md` for token grammar and `export_hints`. The normalizer renders friendly summaries and computes duration automatically.

## ⚠️ **Important Notes**

- Keep UI friendly: no raw tokens; show resolved targets + total duration
- Test webhook flows after deploying edge functions

---

**Status**: ✅ **Production Ready**
**Focus**: Deterministic plan rendering, reliable Strava ingestion, plug‑and‑play templates