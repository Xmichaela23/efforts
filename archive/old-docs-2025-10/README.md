# Efforts App — Smart Training Plans Built for Scale

A React + TypeScript fitness app that generates personalized training plans using proven methodology, with intelligent loading and caching for optimal performance.

## 🚀 The New Way Forward

**We're moving to a smarter, more scalable architecture** that loads training plans progressively instead of all at once. This solves the database performance issues and creates a better user experience.

### **Why We Changed:**
- **Old way**: Bake entire 12-week plans at once → Database crashes (Supabase CPU 100%)
- **New way**: Bake week-by-week, cache intelligently → Smooth performance, happy database

## 🏗️ New Architecture: Week-by-Week Baking

### **How It Works Now:**
1. **Plan Acceptance**: User accepts plan → Week 1 bakes instantly
2. **Progressive Loading**: User clicks Week 2 → Week 2 bakes + loads (200-300ms)
3. **Smart Caching**: Once loaded, weeks load instantly (50ms)
4. **Calendar Integration**: Basic workout info shows immediately, details load on demand

### **User Experience:**
```
Plan Catalog → Accept Plan → Week 1 (instant)
                ↓
            Click Week 2 → Loads in 200ms
                ↓
            Click Week 3 → Loads in 200ms  
                ↓
            Navigate Calendar → Smooth, cached experience
```

### **Technical Benefits:**
- **Database**: 5-15% CPU instead of 100% crashes
- **Performance**: Week 1 instant, new weeks 200-300ms, cached weeks 50ms
- **Reliability**: No more timeouts or 500 errors
- **Scalability**: Works for any plan size (12 weeks, 24 weeks, etc.)

## 🔧 Current Status

### **✅ What's Working:**
- Plan baker with 100% token recognition
- User baseline integration (paces, FTP, 1RM)
- Computed data generation (durations, targets, ranges)
- Display templates for workouts

### **🔄 What We're Building:**
- Week-by-week baking implementation
- Smart caching system
- Progressive loading UI
- Database batching

### **📅 Timeline:**
- **Phase 1**: Week-by-week baking (in progress)
- **Phase 2**: Smart caching and UI updates
- **Phase 3**: Calendar integration and performance testing

## 🗂 Plan Flow (New Architecture)

1. **Admin publishes JSON plan** (sessions_by_week, steps_preset, export_hints)
2. **User selects from catalog** → picks start date, long run/ride days
3. **On plan acceptance**:
   - Plan saved to database
   - Week 1 baked immediately with user baselines
   - User can start planning Week 1
4. **Progressive discovery**:
   - Week 2: Loads when user clicks (200-300ms)
   - Week 3: Loads when user clicks (200-300ms)
   - Once loaded = cached forever (50ms)
5. **Calendar integration**:
   - Basic workout info shows instantly
   - Click date = load detailed workout (100-200ms)
   - Navigate months = smooth, cached experience

## 🏗️ Technical Architecture

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Plan Engine**: Week-by-week baker with smart caching
- **Data**: Garmin Connect integration via webhooks
- **Maps**: MapTiler with MapLibre GL JS (no longer Mapbox)
- **Weather**: OpenWeatherMap API integration for historical weather data

## 🚀 Quick Start

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
VITE_MAPTILER_KEY=your_maptiler_token
```

## 🚀 Deploy Frontend (Netlify)

- Netlify auto‑deploys from `main` per `netlify.toml`

## 🔧 Deploy Edge Functions (Supabase CLI)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy strava-webhook --project-ref yyriamwvtvzlkumqrvpm
supabase functions deploy import-strava-history --project-ref yyriamwvtvzlqumqrvpm
supabase functions deploy send-workout-to-garmin --project-ref yyriamwvtvzlkumqrvpm
```

## 📁 Key Components

- **Plan Selection**: `src/pages/PlanSelect.tsx`
- **Plan Baking**: `src/services/plans/tools/plan_bake_and_compute.ts`
- **App Context**: `src/contexts/AppContext.tsx`
- **Workout Display**: `src/services/plans/templates/workoutDisplayTemplates.ts`

## 🎨 Design Principles

- **Minimal Scandinavian Design** - Clean, uncluttered interfaces
- **No Cards/Borders** - Direct content presentation
- **Inter Font** - Modern, readable typography
- **Responsive Layout** - Works on all device sizes

## 🌤️ Weather System

The app automatically fetches and displays historical weather data for completed workouts:

### **How It Works:**
1. **GPS Detection**: When viewing a workout with GPS coordinates (`start_position_lat`, `start_position_long`)
2. **Weather Lookup**: Calls OpenWeatherMap API using workout timestamp and location
3. **Data Storage**: Stores weather data in `workouts.weather_data` JSONB column
4. **UI Display**: Shows temperature, condition, humidity, wind above the map

### **Weather Data Includes:**
- Temperature (with fallback to device temperature if available)
- Weather condition (sunny, cloudy, rainy, etc.)
- Humidity percentage
- Wind speed and direction
- Precipitation data

### **Technical Implementation:**
- **Edge Function**: `get-weather` function in Supabase
- **Database**: `weather_data` JSONB column in `workouts` table
- **Frontend**: `useWeather` hook + `WeatherDisplay` component
- **API**: OpenWeatherMap One Call API 3.0

## 📚 Documentation

- **`QUICK_START_FOR_NEW_CHAT.md`** - Essential context for new AI assistants
- **`SYSTEM_ARCHITECTURE_DIAGRAM.md`** - Visual overview of the four systems and how they work together
- **`PLANNED_WORKOUTS_SYSTEM.md`** - Complete guide to planned workout architecture
- **`OPTIONAL_WORKOUTS_SYSTEM.md`** - Complete guide to optional workout activation system
- **`PLAN_AUTHORING.md`** - How to create training plans
- **`DATA_STRUCTURE_GUIDE.md`** - Complete data map and access patterns
- **`GARMIN_ACTIVITY_API.md`** - Garmin Connect integration details
- **`APP_BIBLE.md`** - Complete development philosophy and design rules (archived)

## 🔑 Environment Variables

- `VITE_MAPTILER_KEY` - For GPS route maps (MapTiler API key)
- `OPENWEATHER_API_KEY` - For historical weather data (set in Supabase environment)
- Supabase credentials for database and auth

---

**Status**: 🚧 **Architecture Transition** - Moving to week-by-week baking for scale
**Last Updated**: August 2025
**Next Milestone**: Week-by-week baking implementation complete

## 🛠️ Troubleshooting

- **Plan not loading?** Check if week-by-week baking is implemented
- **Database slow?** We're moving away from bulk inserts to progressive loading
- **Performance issues?** New architecture will solve this with smart caching

---

**This is the way forward** - smarter, faster, more reliable training plans that scale with your needs.

## 🧪 Temporary Dev Hydration (Completed & Summary)

While we finish full ingestion of rich Garmin details into the `workouts` table, the UI temporarily "hydrates" completed workouts at render-time.

- What this does: If a completed workout lacks samples/laps in `workouts` but has a `garmin_activity_id`, the view fetches rich fields from `garmin_activities` and merges them in-memory so charts/metrics render.
- Where it applies: `src/components/MobileSummary.tsx` and `src/components/CompletedTab.tsx`.
- Fields used: `gps_track`, `sensor_data`, `swim_data`, plus key metrics like `pool_length`, `number_of_active_lengths`, cadence, power, speeds, temperature, steps.
- Guardrails: Lists/calendar still read from `workouts` only to avoid duplicates; hydration happens only inside the detail views.

Why this is temporary
- We want a single source of truth: `workouts`. Reading `garmin_activities` directly from the client is a stopgap for development.
- It adds extra reads and complexity and can hide ingestion gaps if left in place.

Plan to remove it
1) Ensure `ingest-activity` mirrors all required details (runs/rides/swims) into `workouts` (including samples where feasible or summarized series).
2) Backfill or re-fetch recent activities to populate missing fields.
3) Replace client-side hydration with a small Edge Function that returns a single merged payload if we still need dynamic merge logic.

How to disable now (dev only)
- Remove the hydration effects that query `garmin_activities` in:
  - `src/components/MobileSummary.tsx`
  - `src/components/CompletedTab.tsx`

Action item
- Keep this section until ingestion/backfill is complete, then remove hydration and this note.