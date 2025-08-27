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
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token
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

## 📚 Documentation

- **`APP_BIBLE.md`** - Complete development philosophy and design rules
- **`CURRENT_OPTIMIZATION_STATUS.md`** - Technical details for developers
- **`PERFORMANCE_DATA_STRUCTURE.md`** - Performance data access patterns
- **`GARMIN_ACTIVITY_API.md`** - Garmin Connect integration details
- **`PLAN_AUTHORING.md`** - How to create training plans

## 🔑 Environment Variables

- `VITE_MAPBOX_ACCESS_TOKEN` - For GPS route maps
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