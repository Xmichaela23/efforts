# 🎯 Strength Logger "Pick Planned" Audit

## Overview
The "Pick planned" feature in the Strength Logger allows users to select a planned strength workout from the next 14 days and automatically prefill the logger with exercises, sets, reps, and other details from that planned workout.

---

## 🔍 Current Implementation

### **1. UI Component (Button & Menu)**

**Location:** `src/components/StrengthLogger.tsx` (lines 2634-2683)

**Button:**
- Text: "Pick planned"
- Position: Top-right of the logger header, next to the title
- Styling: Rounded button with glassmorphic design (`bg-white/[0.08]`, `border-white/20`)
- Click handler: Toggles `showPlannedMenu` state

**Menu Dropdown:**
- Appears below the button when clicked
- Width: `w-72` (288px)
- Max height: `max-h-56` (224px) with scroll
- Header shows: "Strength (Next 14 days)"
- "Start Fresh" button in header to clear current session

---

### **2. Data Source**

**Hook:** `usePlannedWorkouts()` from `src/hooks/usePlannedWorkouts.ts`

**Query Details:**
- Fetches from `planned_workouts` table
- Date window: Last 7 days to next 120 days (~4 months)
- Filters: `user_id`, date range
- Order: By date ascending
- Limit: 1000 rows
- **Important:** Does NOT fetch `computed` field in the initial query (line 37)

**Data Structure:**
```typescript
{
  id: string;
  name: string;
  type: string;
  date: string; // ISO date (YYYY-MM-DD)
  workout_status: 'planned' | 'completed' | ...
  // ... other fields
  computed: null // ⚠️ NOT fetched in initial query
}
```

---

### **3. Filtering Logic**

**Location:** `src/components/StrengthLogger.tsx` (lines 2659-2667)

**Filters Applied:**
1. **Type filter:** Only `type === 'strength'`
2. **Date range:** Today to +14 days
3. **Status filter:** Excludes `workout_status === 'completed'`
4. **Sort:** By date ascending

**Code:**
```typescript
const allStrength = plannedWorkouts
  .filter(w => String(w.type).toLowerCase() === 'strength');
const today = getStrengthLoggerDateString();
const next14 = addDaysYmd(today, 14);
const upcoming = allStrength.filter(w => w.date >= today && w.date <= next14);
const notCompleted = upcoming.filter(w => 
  String(w.workout_status || '').toLowerCase() !== 'completed'
);
```

---

### **4. Selection Handler**

**Location:** `src/components/StrengthLogger.tsx` (lines 2670-2676)

**On Click:**
1. Calls `prefillFromPlanned(w)` with the selected workout
2. Sets `sourcePlannedName` (e.g., "Mon — Upper Body: Strength")
3. Sets `sourcePlannedId` (workout ID)
4. Sets `sourcePlannedDate` (workout date)
5. Closes the menu (`setShowPlannedMenu(false)`)

---

### **5. Prefill Function**

**Location:** `src/components/StrengthLogger.tsx` (lines 1203-1214)

**Function:** `prefillFromPlanned(row: any)`

**Process:**
1. Clears session progress (localStorage)
2. Sets `lockManualPrefill` to `true` (prevents auto-prefill from interfering)
3. **Checks for `row.computed.steps`:**
   - If exists and is an array → calls `parseFromComputed(row.computed)`
   - If successful → sets exercises and returns
4. **If no `computed.steps`:** Does nothing (no fallback)

**Critical Issue:** ⚠️
- The `usePlannedWorkouts` hook does NOT fetch the `computed` field
- The menu items only have basic metadata (id, name, date, status)
- When a workout is selected, `prefillFromPlanned` expects `row.computed.steps` to exist
- **This will fail silently** if `computed` is not present

---

### **6. Parse Function**

**Location:** `src/components/StrengthLogger.tsx` (lines 1056-1143)

**Function:** `parseFromComputed(computed: any): LoggedExercise[]`

**Process:**
1. Extracts `steps` array from `computed.steps`
2. Groups steps by exercise name (handles multiple sets of same exercise)
3. For each step:
   - Extracts exercise name from `step.strength.name`
   - Parses reps (handles numbers, strings like "20/side", "8-10", AMRAP)
   - Rounds weight to nearest 5lb (`round5`)
   - Extracts sets count
   - Handles duration-based exercises (planks, holds, carries)
   - Extracts notes, target RIR, resistance level (for bands)
4. Creates `LoggedExercise` objects with sets
5. Returns array of exercises ready for the logger

**Expected `computed` Structure:**
```typescript
{
  steps: [
    {
      strength: {
        name: "Bench Press",
        reps: 8,
        sets: 3,
        weight: 185,
        notes: "RPE 7",
        target_rir: 2,
        duration_seconds?: 60 // for duration-based exercises
      }
    },
    // ... more steps
  ]
}
```

---

## ⚠️ Issues Identified

### **Issue 1: Missing `computed` Field in Query**

**Problem:**
- `usePlannedWorkouts` does not fetch `computed` field (line 37 of `usePlannedWorkouts.ts`)
- Menu items only have basic metadata
- When selected, `prefillFromPlanned` expects `row.computed.steps` but it's `null`

**Impact:**
- "Pick planned" will fail silently
- No exercises will be prefilled
- User sees no error message

**Solution:**
- Add `computed` to the SELECT query in `usePlannedWorkouts.ts`
- Or fetch `computed` on-demand when a workout is selected

---

### **Issue 2: No Error Feedback**

**Problem:**
- `prefillFromPlanned` has a try-catch that swallows all errors
- If `computed` is missing or malformed, user gets no feedback

**Impact:**
- User clicks "Pick planned" → nothing happens
- No indication of why it failed

**Solution:**
- Add error handling with user-visible feedback
- Show toast/alert if prefill fails

---

### **Issue 3: No Fallback to `strength_exercises`**

**Problem:**
- `prefillFromPlanned` only uses `computed.steps`
- If `computed` is missing, it does nothing
- `strength_exercises` field exists in the data but is not used as fallback

**Impact:**
- Planned workouts without `computed` cannot be prefilled
- Even if `strength_exercises` has the data

**Solution:**
- Add fallback to parse `strength_exercises` if `computed` is missing
- Or ensure all planned workouts have `computed` populated

---

### **Issue 4: Date Window Mismatch**

**Problem:**
- Menu shows "Next 14 days" but query fetches up to 120 days
- Filtering happens client-side, which is fine, but could be optimized

**Impact:**
- Unnecessary data fetched (not critical, but inefficient)

**Solution:**
- Could optimize query to only fetch next 14 days for this use case
- Or keep as-is for consistency with other views

---

## ✅ What Works Correctly

1. **UI/UX:**
   - Button styling matches app aesthetic
   - Menu positioning and scrolling work well
   - "Start Fresh" button clears session properly

2. **Filtering:**
   - Correctly filters by type, date range, and status
   - Sorts by date ascending

3. **State Management:**
   - `sourcePlannedName`, `sourcePlannedId`, `sourcePlannedDate` are set correctly
   - These are used when saving the workout to link it to the planned workout

4. **Parse Logic:**
   - `parseFromComputed` handles various rep formats correctly
   - Supports duration-based exercises
   - Handles AMRAP, resistance bands, target RIR

---

## 🔧 Recommended Fixes

### **Priority 1: Fix Missing `computed` Field**

**Option A: Add to Query (Recommended)**
```typescript
// In usePlannedWorkouts.ts, line 37
.select('id,name,type,date,...,computed') // Add 'computed'
```

**Option B: Fetch On-Demand**
```typescript
// In prefillFromPlanned, fetch computed if missing
if (!row.computed) {
  const { data } = await supabase
    .from('planned_workouts')
    .select('computed')
    .eq('id', row.id)
    .single();
  row.computed = data?.computed;
}
```

### **Priority 2: Add Error Feedback**

```typescript
const prefillFromPlanned = async (row: any) => {
  try {
    // ... existing code ...
    if (row?.computed?.steps && Array.isArray(row.computed.steps)) {
      const exs = parseFromComputed(row.computed);
      if (exs.length) { 
        setExercises(exs); 
        return; 
      }
    }
    // Show error if no exercises parsed
    toast({
      title: 'Unable to prefill',
      description: 'This planned workout does not have exercise details.',
      variant: 'destructive'
    });
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to load planned workout details.',
      variant: 'destructive'
    });
  }
};
```

### **Priority 3: Add Fallback to `strength_exercises`**

```typescript
const prefillFromPlanned = (row: any) => {
  try {
    // Try computed first
    if (row?.computed?.steps && Array.isArray(row.computed.steps)) {
      const exs = parseFromComputed(row.computed);
      if (exs.length) { setExercises(exs); return; }
    }
    // Fallback to strength_exercises
    if (row?.strength_exercises && Array.isArray(row.strength_exercises)) {
      const exs = parseFromStrengthExercises(row.strength_exercises);
      if (exs.length) { setExercises(exs); return; }
    }
    // Show error if both fail
    toast({ ... });
  } catch {}
};
```

---

## 📊 Data Flow Summary

```
1. User clicks "Pick planned"
   ↓
2. Menu opens showing filtered planned workouts
   ↓
3. User selects a workout
   ↓
4. prefillFromPlanned(row) called
   ↓
5. Checks for row.computed.steps
   ↓
6. If exists → parseFromComputed() → setExercises()
   ↓
7. If missing → silently fails (no exercises loaded)
   ↓
8. Source tracking set (sourcePlannedId, sourcePlannedName, sourcePlannedDate)
   ↓
9. Menu closes
```

---

## 🎯 Expected Behavior vs. Actual

**Expected:**
- User clicks "Pick planned" → sees list of upcoming strength workouts
- User selects one → exercises are prefilled in the logger
- User can see which planned workout they're logging ("Source: Mon — Upper Body")

**Actual:**
- User clicks "Pick planned" → sees list ✅
- User selects one → **exercises may not prefill** ❌ (if `computed` missing)
- Source tracking works ✅

---

## 🔍 Testing Checklist

- [ ] Verify `computed` field is fetched in `usePlannedWorkouts`
- [ ] Test selecting a workout with `computed.steps` → should prefill
- [ ] Test selecting a workout without `computed` → should show error or fallback
- [ ] Test "Start Fresh" → should clear exercises and source tracking
- [ ] Test date filtering → only shows next 14 days, excludes completed
- [ ] Test status filtering → completed workouts don't appear
- [ ] Verify source tracking persists when saving workout

---

## 📝 Notes

- The `computed` field is populated by the materializer/edge functions when planned workouts are created/updated
- If a planned workout doesn't have `computed`, it may be from an older schema or not yet materialized
- The `sourcePlannedId` is used when saving the completed workout to link it back to the planned workout via `planned_id` field
