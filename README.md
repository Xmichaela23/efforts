# Efforts App — Overview, Setup, and Deployment

A React + TypeScript fitness app that integrates with Garmin Connect to display GPS routes, workout analytics, and generates training plans using proven methodology.

## 🚀 Current Status

Fully functional app with:
- Garmin integration (webhooks + send-to-Garmin edge function)
- Catalog/import of deterministic JSON plans (admin)
- Baseline mapping (paces, FTP, 1RM) and deterministic alias table
- Auto-spacing resolver for long run/ride with clear notes
- Swim steps → distance intervals; Strength steps → REPS with rest
- Calendar, Today’s Effort, Strength Logger with prefill

## 🔧 Deterministic Scaling (Run/Bike/Swim)

- Run alias table (from fiveK_pace/easyPace): easy, steady/aerobic, MP, tempo, threshold, cruise, VO2, rep
- Bike zones from FTP: Z1–Z2, Sweet Spot, Threshold, VO2, Anaerobic, Sprint
- Swim offsets from swimPace100: easy/steady/threshold/interval/VO2
- Explicit plan offsets always win; otherwise aliases map to concrete paces/powers automatically

## 🗂 Plan Flow

1. Admin publishes JSON (sessions_by_week, optional steps, notes_by_week)
2. User selects from catalog → picks start date, long run/ride days
3. On save we:
   - Map baselines; compute offsets; estimate durations
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

## 📚 Documentation

- **`APP_BIBLE.md`** - Complete development philosophy and architecture
- **`QUICK_START_FOR_NEW_CHAT.md`** - Quick setup for new developers
- **`GARMIN_ACTIVITY_API.md`** - Garmin Connect integration details
- **`GARMIN_TRAINING_API_V2.md`** - Training data API specifications
- **`GARMIN_OAUTH2_PKCE.md`** - Authentication flow documentation
- **`GARMIN_DATABASE_SCHEMA.md`** - Database structure for Garmin data

---

**Status**: ✅ Production Ready — Plans, Garmin exports, spacing resolver live
**Last Updated**: August 2025
**Deploy**:
- Netlify (frontend): push to main
- Supabase (edge): `supabase functions deploy send-workout-to-garmin`