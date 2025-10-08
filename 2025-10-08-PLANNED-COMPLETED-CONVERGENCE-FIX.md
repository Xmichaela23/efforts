# Planned/Completed Workout Convergence Fix

**Date:** October 8, 2025

## Problem

When a planned workout was completed, the UI showed it as "done" (removed from Today's Efforts, checkmark in calendar), but the database link (`workouts.planned_id` ↔ `planned_workouts.completed_workout_id`) was not being established. Users had to manually re-attach completed workouts.

### Root Causes

1. **Client-side filtering in TodaysEffort**: Hid planned workouts based on date+type match, ignoring actual database link status
2. **get-week not returning unlinked items**: Only returned ONE item per date+type, suppressing planned workouts when unlinked completed workouts existed
3. **Broken pre-attach code in StrengthLogger**: Attempted to update database links before workout was saved/assigned an ID
4. **Missing planned_id in manual logs**: StrengthLogger and MobilityLogger didn't pass source planned ID through to auto-attach
5. **Redundant fallback in AssociatePlannedDialog**: Client-side DB updates bypassed the server-side auto-attach logic

## Solution

### 1. Fixed `get-week` (Server - Single Source of Truth) ✅

**File:** `supabase/functions/get-week/index.ts`

- Now tracks which planned IDs are actually linked via `workouts.planned_id`
- Returns **TWO items** when a completed workout exists but is NOT linked to the planned workout:
  - One with `status='completed'`, `executed={...}`, `planned=null`
  - One with `status='planned'`, `planned={...}`, `executed=null`
- Server now tells the truth about what's linked

### 2. Fixed TodaysEffort (Client - Dumb Display) ✅

**File:** `src/components/TodaysEffort.tsx`

- **REMOVED** client-side filtering logic that hid planned workouts based on date+type
- Now **trusts get-week completely** - just maps items without filtering
- If get-week returns both planned and completed, both will display (indicating they're unlinked)

### 3. Fixed StrengthLogger (Manual Logging) ✅

**File:** `src/components/StrengthLogger.tsx`

- **DELETED** broken pre-attach code (lines 1436-1453) that tried to update DB before workout was saved
- **ADDED** `planned_id: sourcePlannedId` to completed workout object
- Now relies on `addWorkout` → `autoAttachPlannedSession` → `auto-attach-planned` edge function

### 4. Fixed MobilityLogger (Manual Logging) ✅

**File:** `src/components/MobilityLogger.tsx`

- **ADDED** logic to distinguish editing completed vs creating from planned
- **ADDED** `planned_id: sourcePlannedId` to completed workout object
- Prevents ID collision when creating from planned workout

### 5. Enhanced autoAttachPlannedSession (Attachment Flow) ✅

**File:** `src/hooks/useWorkouts.ts`

- **ADDED** extraction of `planned_id` from workout object
- Passes `planned_id` to `auto-attach-planned` edge function when available
- Edge function will use explicit planned_id instead of heuristics

### 6. Simplified AssociatePlannedDialog (Manual Attachment) ✅

**File:** `src/components/AssociatePlannedDialog.tsx`

- **REMOVED** redundant fallback that did direct DB updates
- Now **only uses** `auto-attach-planned` edge function
- Throws error if attachment fails (will show to user)

## Architecture Reinforced

**Smart Server, Dumb Client**

```
┌─────────────────────────────────────────────────────────────┐
│ Two Sources of Truth (Database)                             │
│  • planned_workouts table                                   │
│  • workouts table                                           │
│  • Bidirectional sync via DB triggers                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ One Unified View (Server)                                    │
│  • get-week edge function merges both tables                │
│  • Returns status based on actual planned_id link           │
│  • Returns TWO items if workout exists but unlinked         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Dumb Client (React)                                          │
│  • useWeekUnified hook fetches from get-week                │
│  • TodaysEffort, Calendar, etc. just display what's returned│
│  • NO client-side filtering or logic                        │
└─────────────────────────────────────────────────────────────┘
```

## Attachment Flow Unified

All paths now converge to **ONE server-side function**:

```
Manual Logs (Strength/Mobility)
  ↓
  completedWorkout.planned_id = sourcePlannedId
  ↓
  addWorkout(completedWorkout)
  ↓
  autoAttachPlannedSession(completedWorkout)
  ↓
┌─────────────────────────────────────────────────┐
│ auto-attach-planned edge function              │
│  • Uses explicit planned_id if provided        │
│  • Falls back to heuristics (date+type+duration)│
│  • Updates both sides via triggers             │
│  • Calls materialize + compute-summary         │
└─────────────────────────────────────────────────┘
  ↑
  │
Webhook Ingestion (Garmin/Strava)
  ↓
  ingest-activity
  ↓
  autoAttachPlannedSession (heuristics only)
```

## Expected Behavior

### Before Fix
- ✅ Planned workout shows in Today's Efforts
- 🏃 User completes workout
- ❌ Planned workout disappears (based on date+type match)
- ❌ Calendar shows checkmark (any completed workout)
- ⚠️ **Database link is NULL** (attachment failed silently)
- 😡 User must manually attach via dialog

### After Fix
- ✅ Planned workout shows in Today's Efforts
- 🏃 User completes workout
- ✅ **If linked**: Planned workout disappears, replaced by completed
- ✅ **If unlinked**: BOTH show (clear visual indicator)
- ✅ Calendar only shows checkmark when actually linked
- 😊 User sees when attachment didn't work and can easily re-attach

## Testing Checklist

- [ ] Manual strength log from planned workout → auto-attaches
- [ ] Manual mobility log from planned workout → auto-attaches
- [ ] Garmin webhook run → auto-attaches if heuristics match
- [ ] Manual log with NO planned workout → no attachment (correct)
- [ ] Unlinked workout shows BOTH items in Today's Efforts
- [ ] Manual attachment via dialog works
- [ ] Calendar checkmark only appears when linked

## Notes

- Database triggers (`sync_planned_to_workout_link`, `sync_workout_to_planned_link`) ensure bidirectional consistency
- Edge function `auto-attach-planned` handles materialization, attachment, and summary computation
- Client invalidation events (`planned:invalidate`, `workouts:invalidate`, `week:invalidate`) refresh UI
