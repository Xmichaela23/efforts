# Efforts

Triathlon training app. React + TypeScript + Supabase.

## Architecture

**Smart server, dumb client.**
- Two sources: `planned_workouts` table, `workouts` table
- One view: `get-week` endpoint merges them
- React just renders

## Quick Start

```bash
npm install
npm run dev
```

`.env.local`:
```env
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
VITE_MAPTILER_KEY=your_token
```

## Design

Minimal Scandinavian aesthetic. See [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md).

## Deploy

- **Frontend**: Netlify auto-deploys from `main`
- **Functions**: `supabase functions deploy <name>`

---

## 🤖 For AI Assistants

**New to this codebase?** Start here:

### Essential Reading (in order)

1. **[APP_ARCHITECTURE.md](APP_ARCHITECTURE.md)** - 📖 **START HERE** - Complete system overview
   - Architecture principles (Smart Server, Dumb Client)
   - Data flow diagrams
   - JSONB data structures reference
   - Edge functions catalog
   - Frontend patterns
   - Analysis system architecture
   - Plan system with token DSL

2. **[DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md)** - UI/UX principles
   - Minimal Scandinavian aesthetic
   - Typography and spacing
   - Component patterns

3. **[GARMIN_DATABASE_SCHEMA.md](GARMIN_DATABASE_SCHEMA.md)** - Database schema reference
   - Core tables structure
   - JSONB field examples
   - Integration patterns

### Specialized Topics

- **[WORKLOAD_SYSTEM.md](WORKLOAD_SYSTEM.md)** - Training load tracking
- **[SUMMARY_SCREEN_FLOW.md](SUMMARY_SCREEN_FLOW.md)** - Workout analysis data flow
- **[COMPLETE_SYSTEM_UNDERSTANDING.md](COMPLETE_SYSTEM_UNDERSTANDING.md)** - Three screens + analysis functions (historical reference)

### Key Concepts

**Smart Server Pattern:**
```typescript
// ❌ DON'T: Client-side data merging
const planned = await supabase.from('planned_workouts').select();
const executed = await supabase.from('workouts').select();
const merged = mergePlannedExecuted(planned, executed);

// ✅ DO: Server returns merged data
const { data } = await supabase.functions.invoke('get-week', {
  body: { from: '2025-01-06', to: '2025-01-12' }
});
// data.items already has { planned, executed } merged
```

**Critical Files:**
- `supabase/functions/get-week/index.ts` - THE unified view (calendar data)
- `supabase/functions/materialize-plan/index.ts` - Plan token expansion
- `supabase/functions/compute-workout-summary/index.ts` - Interval creation
- `supabase/functions/analyze-running-workout/index.ts` - Deep analysis
- `src/services/workoutAnalysisService.ts` - Analysis routing
- `src/hooks/useWeekUnified.ts` - Calendar data fetching

**Common Patterns:**
- Server does ALL computation, client just renders
- JSONB for flexible data structures
- Direct discipline routing (no orchestrator)
- Status tracking for async operations
- On-demand materialization

### Quick Reference

**Data Flow:**
```
Garmin/Strava → ingest-activity → auto-attach-planned → 
compute-workout-summary → analyze-running-workout → 
get-week → React UI
```

**Analysis System:**
- Stage 1: `compute-workout-summary` (fast, basic intervals)
- Stage 2: `analyze-running-workout` (on-demand, deep insights)

**Plan System:**
- Plans stored with token DSL: `"warmup_run_easy_15min"`, `"5kpace_4x1mi_R2min"`
- `materialize-plan` expands tokens → resolved paces from user baselines
- On-demand materialization in `get-week`

### Questions?

Read `APP_ARCHITECTURE.md` first - it's comprehensive and answers most questions about how the system works.
