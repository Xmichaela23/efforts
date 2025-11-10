# End Plan Feature Implementation

## Summary

Successfully implemented the "End Plan" feature along with fixing the existing Pause/Resume functionality. Users can now properly manage their training plans with three new actions:

1. **Pause** - Temporarily pause a plan (workouts remain, plan stops materializing new ones)
2. **Resume** - Resume a paused plan
3. **End Plan** - Permanently end a plan early, removing all future workouts

---

## What Was Changed

### 1. Database Migration
**File:** `supabase/migrations/20251110120001_add_plan_status_options.sql`

- Updated the `plans.status` constraint to allow four values:
  - `'active'` - Plan is active and materializing workouts
  - `'paused'` - Plan is temporarily paused (reversible)
  - `'ended'` - Plan was ended early (permanent)
  - `'completed'` - Plan finished naturally
- Added `paused_at` timestamp column to track when plan was paused
  - Used to calculate pause duration and adjust plan dates on resume

### 2. New Edge Function: `end-plan`
**File:** `supabase/functions/end-plan/index.ts`

- Creates an edge function that:
  - Sets the plan status to `'ended'`
  - Deletes all future planned workouts (where `date >= today`)
  - Preserves past planned workouts for historical comparison
  - Returns the number of workouts deleted

### 3. AppContext Updates
**File:** `src/contexts/AppContext.tsx`

**Added:**
- `endPlan(planId: string)` function - calls the edge function and refreshes data
- Updated `updatePlan()` to invalidate week cache after updates
- Updated `Plan` type interface to include new status options

**Exported in Context:**
- `endPlan` - available to all components via `useAppContext()`

### 4. UI Implementation
**File:** `src/components/AllPlansInterface.tsx`

**Added Handlers:**
- `handleEndPlan()` - Ends the plan and updates local state
- `handlePausePlan()` - Pauses the plan (now persists to database!)
- `handleResumePlan()` - Resumes a paused plan

**UI Changes:**
- **Pause/Resume buttons** now actually work (previously only changed local state)
- **New "End Plan" button** (orange color to distinguish from Delete)
  - Shows confirmation dialog explaining the action
  - Only visible for active or paused plans
  - Styled with orange color scheme for clarity
- Buttons adapt based on plan status:
  - Active → Shows Pause + End Plan
  - Paused → Shows Resume + End Plan
  - Ended/Completed → No status change buttons

---

## How It Works

### End Plan Flow
```
User clicks "End Plan" 
  ↓
Confirmation dialog appears
  ↓
User confirms
  ↓
Frontend calls endPlan(planId)
  ↓
Edge function end-plan:
  - Calculates today's date
  - Deletes planned_workouts where date >= today AND training_plan_id = planId
  - Updates plans.status to 'ended'
  ↓
Frontend receives response
  ↓
Local state updates (plan status, selected plan detail)
  ↓
Week cache invalidates
  ↓
UI updates to show ended state
```

### Pause Flow
```
User clicks "Pause"
  ↓
Frontend calls updatePlan(planId, { status: 'paused', paused_at: now })
  ↓
Database updates plan status and records pause timestamp
  ↓
Week cache invalidates
  ↓
get-week function stops materializing workouts (only 'active' plans)
  ↓
UI updates to show "Resume" button
```

### Resume Flow
```
User clicks "Resume"
  ↓
Frontend calculates:
  - pauseDurationDays = (now - paused_at) in days
  - newStartDate = originalStartDate + pauseDurationDays
  ↓
Frontend calls updatePlan(planId, {
  status: 'active',
  paused_at: null,
  config: { ...config, user_selected_start_date: newStartDate }
})
  ↓
Database updates plan with adjusted dates
  ↓
Week cache invalidates
  ↓
get-week resumes materializing with shifted dates
  ↓
Plan continues from correct week with adjusted timeline
```

---

## Key Architectural Decisions

1. **Separate "End" from "Delete"**
   - End Plan: Removes future workouts, keeps plan record and past workouts
   - Delete Plan: Removes everything (all workouts + plan itself)

2. **Preserve Historical Data**
   - Past planned workouts are kept for comparison with completed workouts
   - Plan record remains for reference

3. **Automatic Materialization Control**
   - The `get-week` function already filters by `status='active'`
   - No additional code needed - paused/ended plans automatically stop creating workouts

4. **Smart Date Adjustment on Resume**
   - When paused: Store `paused_at` timestamp
   - When resumed: Calculate pause duration and shift plan start date forward
   - Example: Pause for 2 weeks → plan start shifts forward 2 weeks → Week 3 workouts now appear in correct calendar position
   - **No user input needed** - system handles all date math automatically (matches design principles)

5. **UI Consistency**
   - Orange color for "End Plan" (warning but not destructive)
   - Red color reserved for "Delete" (fully destructive)
   - Clear confirmation dialogs explaining each action
   - Minimal UI: no date pickers or complex forms

---

## Testing Checklist

Before deploying, test:

- [ ] Run database migration: `supabase db push`
- [ ] Deploy edge function: `supabase functions deploy end-plan`
- [ ] Test Pause button:
  - [ ] Persists status='paused' to database
  - [ ] Records paused_at timestamp
  - [ ] Stops materializing new workouts
- [ ] Test Resume button:
  - [ ] Calculates pause duration correctly
  - [ ] Shifts plan start date forward
  - [ ] Plan becomes active again
  - [ ] Workouts materialize at correct dates
- [ ] Test End Plan button:
  - [ ] Confirmation dialog appears
  - [ ] Future workouts are removed from calendar
  - [ ] Past workouts remain visible
  - [ ] Plan status shows as "ended"
  - [ ] Week cache invalidates properly
- [ ] Test that ended plans don't materialize new workouts
- [ ] Verify button visibility logic (active/paused/ended states)

---

## Deployment Steps

1. **Deploy Database Migration:**
   ```bash
   cd /Users/michaelambp/efforts
   supabase db push
   ```

2. **Deploy Edge Function:**
   ```bash
   supabase functions deploy end-plan
   ```

3. **Deploy Frontend:**
   - Commit changes to git
   - Push to main branch
   - Netlify will auto-deploy

---

## Future Enhancements

Potential improvements for later:

1. **Resume Ended Plans**: Allow users to "reactivate" an ended plan
2. **Bulk Actions**: End multiple plans at once
3. **Archive Feature**: Separate "archive" from "end" for better organization
4. **Undo Window**: Allow undo within 5 minutes of ending a plan
5. **Status Filter**: Filter plan list by status (active/paused/ended/completed)
6. **Visual Indicators**: Add status badges to plan cards in list view

