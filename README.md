# Efforts App — Overview, Setup, and Deployment

A React + TypeScript fitness app that integrates with Garmin Connect to display GPS routes, workout analytics, and generates training plans using proven methodology.

## 🚀 Current Status

Fully functional app with:
- Garmin integration (webhooks + send-to-Garmin edge function)
- Strava webhook (direct → workouts with gps_track, sensor_data)
- Catalog/import of deterministic JSON plans (admin)
- Baseline mapping (paces, FTP, 1RM) and deterministic alias table
- Deterministic normalizer: friendly summaries, exact targets, total duration
- Auto-spacing resolver for long run/ride with clear notes
- Swim steps → distance intervals; Strength steps → REPS with rest
- Calendar, Today’s Effort, Strength Logger with prefill

## 🔧 Deterministic Scaling (Run/Bike/Swim)

- Run alias table (from fiveK_pace/easyPace): easy, steady/aerobic, MP, tempo, threshold, cruise, VO2, rep
- Bike zones from FTP: Z1–Z2, Sweet Spot, Threshold, VO2, Anaerobic, Sprint
- Swim offsets from swimPace100: easy/steady/threshold/interval/VO2
- Explicit plan offsets always win; otherwise aliases map to concrete paces/powers automatically

## 🗂 Plan Flow

1. Admin publishes JSON (sessions_by_week, optional steps_preset, export_hints, notes_by_week)
2. User selects from catalog → picks start date, long run/ride days
3. On save we:
   - Map baselines; resolve aliases/offsets; estimate durations
   - Convert swim steps to distance intervals; strength steps to REPS
   - Auto-space hard sessions with notes; pin safe authored tempos
   - Materialize planned_workouts and prefill Strength Logger
   - Redirect to the saved plan

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Maps**: Mapbox GL JS for GPS route display
- **Charts**: Recharts for elevation profiles and data visualization
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Data**: Garmin Connect integration via webhooks

## 🚀 Quick Start (Frontend)

```bash
git clone https://github.com/Xmichaela23/efforts.git
cd efforts
npm install
npm run dev
```

Create `.env.local` in the repo root:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
```

## 🚀 Deploy Frontend (Netlify)

- Netlify auto‑deploys from `main` per `netlify.toml` (build `npm run build`, publish `dist`).

## 🔧 Deploy Edge Functions (Supabase CLI)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy strava-webhook --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy import-strava-history --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy send-workout-to-garmin --project-ref yyriamwvtvzlkumqrvpm
supabase functions list --project-ref yyriamwvtvzlkumqrvpm | cat
```

## 🔑 Environment Variables

- `VITE_MAPBOX_ACCESS_TOKEN` - For GPS route maps
- Supabase credentials for database and auth

## 📁 Key Components

- **`CompletedTab.tsx`** - Main workout detail view with map and elevation chart
- **`CleanElevationChart.tsx`** - Interactive elevation profile with metric selection
- **`ActivityMap.tsx`** - Mapbox GPS route display
- **`useWorkouts.ts`** - Data fetching and transformation hook

## 🎨 Design Principles

- **Minimal Scandinavian Design** - Clean, uncluttered interfaces
- **No Cards/Borders** - Direct content presentation
- **Inter Font** - Modern, readable typography
- **Responsive Layout** - Works on all device sizes

## ⚠️ Common Issues & Solutions

### Performance Data Not Loading?
If you're getting `[baker] Missing computed for session` errors or pace values showing as `null`:

1. **Check the data structure**: Performance data exists in TWO locations with different naming conventions
2. **See `PERFORMANCE_DATA_STRUCTURE.md`** for the complete debugging guide
3. **Quick fix**: Always check both `baselines.fivek_pace` (snake_case at root) AND `baselines.performance_numbers.fiveK` (camelCase in nested object)

This has been a recurring issue - the documentation will save you hours of debugging!

## 📚 Documentation

- **`APP_BIBLE.md`** - Complete development philosophy and architecture
- **`QUICK_START_FOR_NEW_CHAT.md`** - Quick setup for new developers
- **`PERFORMANCE_DATA_STRUCTURE.md`** - **⚠️ CRITICAL**: Performance data access patterns and common pitfalls
- **`GARMIN_ACTIVITY_API.md`** - Garmin Connect integration details
- **`GARMIN_TRAINING_API_V2.md`** - Training data API specifications
- **`GARMIN_OAUTH2_PKCE.md`** - Authentication flow documentation
- **`GARMIN_DATABASE_SCHEMA.md`** - Database structure for Garmin data
 - Plan JSON schema: `src/services/plans/contracts/universal_plan.schema.json`
 - Normalizer: `src/services/plans/normalizer.ts`
 - Plan Authoring: `PLAN_AUTHORING.md`
 - Design Guidelines: `DESIGN_GUIDELINES.md`

## Plan baking details (no-CLI)

- Translator: `src/services/plans/tools/plan_bake_and_compute.ts` (called by `PlanSelect.tsx`)
- Inputs: plan JSON (`sessions_by_week`, optional `steps_preset`, `export_hints`) + user baselines
- Outputs per session:
  - `computed.steps`: flattened steps with duration seconds and target ranges
  - `computed.total_seconds`: full workout duration (WU+main+CD)
  - Friendly `rendered_description` (one‑liner) including primary range (pace/power/swim)
- Baselines (required): `fiveK_pace_sec_per_mi`, `easy_pace_sec_per_mi`; optional `ftp`, `swim_pace_per_100_sec`, `tenK/mp`.
- No silent fallbacks: missing baselines abort compute and log the failure.

UI rendering
- Today’s Effort and Planned Workout View prefer `rendered_description` and `computed.total_duration_seconds`.
- If `computed` is missing for a tokened session, the card shows a “MISSING” indicator.

Troubleshooting
- Verify `planned_workouts` has `rendered_description text`, `computed jsonb`, `units text`.
- Ensure RLS allows INSERT/UPDATE for the user.

---

**Status**: ✅ Production Ready — Plans, Garmin/Strava ingest, spacing resolver live
**Last Updated**: August 2025
**Deploy**:
- Netlify (frontend): push to main
- Supabase CLI (edge): see section above

## 🛠️ Troubleshooting (quick refs)
- 401 from webhook (Strava): ensure function config disables JWT for webhook (`verify_jwt = false`) and tokens are valid.
- 406 from Supabase filters: prefer `filter('provider','eq','garmin')` over `.eq('provider','garmin')` in tricky cases.
- DB timeouts on `workouts`: add indexes (`workouts(user_id, date desc)` etc.) and use reasonable date windows if needed.

## Ingestion overview
- Garmin: webhook → edge function → `garmin_activities` + merged to `workouts` via app logic.
- Strava: webhook → edge function writes directly to `workouts` with `gps_track` and `sensor_data`.

## CLI quick refs
```bash
supabase functions deploy strava-webhook --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy import-strava-history --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy send-workout-to-garmin --project-ref yyriamwvtvzlkumqrvpm
supabase functions list --project-ref yyriamwvtvzlkumqrvpm | cat
```