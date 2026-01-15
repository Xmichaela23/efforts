# RPE System Audit

## Executive Summary

### ✅ **Overall Status: WORKING WITH DUAL STORAGE SYSTEM**

The RPE system is **functioning correctly** in the details screen, but there's a **dual storage system** that needs clarification:
- **Primary**: `workouts.rpe` column (INTEGER, 1-10)
- **Secondary**: `workout_metadata->>'session_rpe'` (JSONB, number)

Both are used, but the `rpe` column is the primary source for details screen edits.

### Key Findings:
1. ✅ **Details Screen**: RPE can be changed via dropdown - **WORKING**
2. ✅ **Save Flow**: Changes save to database via `updateWorkout` hook - **WORKING**
3. ✅ **Persistence**: RPE persists when navigating away/back - **WORKING**
4. ⚠️ **Dual Storage**: Both `rpe` column and `workout_metadata.session_rpe` exist - **NEEDS CLARIFICATION**
5. ✅ **Validation**: RPE is constrained to 1-10 in database - **WORKING**

### Critical Questions:
- ❓ **Which is the source of truth?** `rpe` column or `workout_metadata.session_rpe`?
- ❓ **Are both kept in sync?** When one is updated, is the other updated too?

---

## 1. Details Screen Implementation

### Location
- **Component**: `src/components/CompletedTab.tsx`
- **Lines**: 1534-1561 (RPE Select component)
- **Handler**: `handleFeedbackChange` (line 168)

### UI Component
```typescript
<Select
  value={((hydrated || workoutData) as any)?.rpe ? String(((hydrated || workoutData) as any).rpe) : undefined}
  onValueChange={(value) => handleFeedbackChange('rpe', value ? parseInt(value) : null)}
  disabled={savingFeedback}
>
  <SelectTrigger>
    <SelectValue placeholder="N/A">
      {((hydrated || workoutData) as any)?.rpe ? String(((hydrated || workoutData) as any).rpe) : 'N/A'}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rpe) => (
      <SelectItem key={rpe} value={String(rpe)}>
        {rpe}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Features
- ✅ Dropdown with values 1-10
- ✅ Shows current RPE value or "N/A" if not set
- ✅ Disabled state while saving (`savingFeedback`)
- ✅ Uses `undefined` instead of empty string for controlled component (fixed in recent commit)

---

## 2. Save Flow When RPE is Changed

### Handler Function
**Location**: `src/components/CompletedTab.tsx`, line 168

```typescript
const handleFeedbackChange = async (field: 'gear_id' | 'rpe', value: string | number | null) => {
  try {
    setSavingFeedback(true);
    const updateData: any = { [field]: value };

    // Use updateWorkout hook which handles user_id check and proper error handling
    if (!updateWorkout) {
      // Error handling...
      return;
    }

    await updateWorkout(workoutData.id, updateData);

    // Update local hydrated state immediately so UI reflects the change
    setHydrated((prev: any) => {
      if (!prev || prev.id !== workoutData.id) return prev;
      return { ...prev, [field]: value };
    });

    // Invalidate and refetch workout-detail query cache
    await queryClient.invalidateQueries({ queryKey: ['workout-detail', workoutData.id] });
    await queryClient.refetchQueries({ queryKey: ['workout-detail', workoutData.id] });
    
    // Dispatch events to trigger refresh in parent components
    window.dispatchEvent(new CustomEvent('workout-detail:invalidate'));
    window.dispatchEvent(new CustomEvent('workout:invalidate'));
    window.dispatchEvent(new CustomEvent('workouts:invalidate'));
  } catch (e: any) {
    // Error handling with toast...
  } finally {
    setSavingFeedback(false);
  }
};
```

### Save Process
1. **User selects RPE** → `onValueChange` fires
2. **Parse value** → `parseInt(value)` or `null` if cleared
3. **Call handler** → `handleFeedbackChange('rpe', parsedValue)`
4. **Update database** → `updateWorkout(workoutData.id, { rpe: value })`
5. **Update local state** → `setHydrated` for immediate UI update
6. **Invalidate cache** → Refresh query cache for persistence
7. **Dispatch events** → Notify parent components

### ✅ **VERDICT: Save Flow is Correct**
- Uses `updateWorkout` hook (proper user_id check, RLS handling)
- Updates local state immediately (good UX)
- Invalidates cache (ensures persistence)
- Has error handling with toast notifications

---

## 3. Database Storage

### Primary Column: `workouts.rpe`
**Migration**: `supabase/migrations/20260106_add_workout_feedback.sql`

```sql
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10);
```

**Properties**:
- Type: `INTEGER`
- Constraint: `CHECK (rpe >= 1 AND rpe <= 10)`
- Nullable: Yes (optional field)
- Index: `workouts_rpe_idx` (for querying)

### Secondary Storage: `workout_metadata->>'session_rpe'`
**Migration**: `supabase/migrations/20250130000000_add_workout_metadata.sql`

```sql
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS workout_metadata jsonb DEFAULT '{}'::jsonb;
```

**Properties**:
- Type: `JSONB`
- Path: `workout_metadata->>'session_rpe'`
- Index: `idx_workouts_metadata_rpe` (GIN index)

### ⚠️ **DUAL STORAGE ISSUE**

Both storage locations exist:
1. **`rpe` column**: Used by CompletedTab for details screen edits
2. **`workout_metadata.session_rpe`**: Used by StrengthLogger, MobilityLogger, PilatesYogaLogger

**Question**: Are they kept in sync?

---

## 4. Update Hook Implementation

### Location
**File**: `src/hooks/useWorkouts.ts`
**Function**: `updateWorkout` (line 1640)

### RPE Handling
```typescript
// Handle RPE and gear_id (used in CompletedTab feedback)
if ((updates as any).rpe !== undefined) updateObject.rpe = (updates as any).rpe;
```

### Database Update
```typescript
const { data, error } = await supabase
  .from("workouts")
  .update(updateObject)
  .eq("id", id)
  .eq("user_id", user.id)
  .select('...,rpe,gear_id,...')
  .single();
```

### ✅ **VERDICT: Update Hook is Correct**
- Updates `rpe` column directly
- Includes `user_id` check (RLS compliance)
- Returns updated `rpe` in response
- **Note**: Does NOT update `workout_metadata.session_rpe`

---

## 5. Data Normalization

### Location
**File**: `src/hooks/useWorkouts.ts`
**Function**: Various normalization functions

### RPE Normalization Logic
The codebase has normalization logic that tries to sync between `rpe` and `workout_metadata.session_rpe`:

```typescript
// From useWorkouts.ts normalization
if (!parsed.session_rpe && (typeof (w as any).rpe === 'number' || typeof (w as any).session_rpe === 'number')) {
  parsed.session_rpe = (w as any).rpe || (w as any).session_rpe;
}

if (typeof (w as any).rpe === 'number' || typeof (w as any).session_rpe === 'number') {
  normalized.session_rpe = (w as any).rpe || (w as any).session_rpe;
}
```

**This suggests**:
- The code tries to use `rpe` column as fallback for `session_rpe`
- But when `rpe` is updated, `session_rpe` is NOT automatically updated
- This could lead to inconsistency

### ⚠️ **POTENTIAL INCONSISTENCY**

When RPE is changed in details screen:
- ✅ `rpe` column is updated
- ❌ `workout_metadata.session_rpe` is NOT updated
- ⚠️ Other parts of the app might read from `session_rpe` and see old value

---

## 6. Other RPE Entry Points

### StrengthLogger
- Uses `workout_metadata.session_rpe`
- Saves via `createWorkoutMetadata({ session_rpe: rpe })`
- Does NOT set `rpe` column

### MobilityLogger
- Uses `workout_metadata.session_rpe`
- Saves via `createWorkoutMetadata({ session_rpe: rpe })`
- Does NOT set `rpe` column

### PilatesYogaLogger
- Uses `workout_metadata.session_rpe`
- Saves via `createWorkoutMetadata({ session_rpe: rpe })`
- Does NOT set `rpe` column

### PostWorkoutFeedback
- Uses `rpe` column directly
- Updates via direct Supabase update (no `updateWorkout` hook)
- Does NOT update `workout_metadata.session_rpe`

### ⚠️ **INCONSISTENCY ACROSS COMPONENTS**

Different components use different storage:
- **CompletedTab**: Uses `rpe` column
- **PostWorkoutFeedback**: Uses `rpe` column
- **StrengthLogger**: Uses `workout_metadata.session_rpe`
- **MobilityLogger**: Uses `workout_metadata.session_rpe`
- **PilatesYogaLogger**: Uses `workout_metadata.session_rpe`

---

## 7. Potential Issues

### Issue 1: Dual Storage Not Synced
**Problem**: When RPE is changed in details screen, only `rpe` column is updated, not `workout_metadata.session_rpe`.

**Impact**: 
- If other parts of the app read from `session_rpe`, they'll see stale data
- Normalization tries to use `rpe` as fallback, but it's one-way

**Recommendation**: 
- Option A: Update both when RPE changes
- Option B: Choose one as source of truth and migrate all code to use it
- Option C: Add database trigger to sync them

### Issue 2: Different Entry Points Use Different Storage
**Problem**: Different components save RPE to different locations.

**Impact**: 
- Inconsistent data storage
- Harder to query all RPE values
- Potential confusion about which value is "correct"

**Recommendation**: Standardize on one storage location.

### Issue 3: No Validation on Client Side
**Problem**: Client doesn't validate RPE is 1-10 before sending to server.

**Impact**: 
- Database constraint will catch it, but user gets error after submit
- Could validate in UI for better UX

**Recommendation**: Add client-side validation (though database constraint is sufficient).

---

## 8. Recommendations

### High Priority
1. **Decide on single source of truth**: Choose either `rpe` column OR `workout_metadata.session_rpe`
2. **Sync both locations**: If keeping both, ensure they're always in sync (trigger or application logic)
3. **Standardize entry points**: All components should save to the same location

### Medium Priority
1. **Add client-side validation**: Validate RPE is 1-10 before submitting
2. **Add migration script**: If consolidating, create script to migrate existing data
3. **Update documentation**: Document which field is the source of truth

### Low Priority
1. **Add RPE analytics**: Query RPE values for training load analysis
2. **Add RPE trends**: Show RPE trends over time
3. **Add RPE validation in UI**: Show validation errors before submit

---

## 9. Verification Queries

### Check RPE Storage Consistency
```sql
-- Find workouts where rpe and session_rpe don't match
SELECT 
  id,
  type,
  date,
  rpe,
  workout_metadata->>'session_rpe' as session_rpe,
  CASE 
    WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NULL THEN '✅ Both NULL'
    WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NOT NULL THEN '⚠️ Only session_rpe'
    WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NULL THEN '⚠️ Only rpe'
    WHEN CAST(rpe AS TEXT) = workout_metadata->>'session_rpe' THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM workouts
WHERE workout_status = 'completed'
  AND (rpe IS NOT NULL OR workout_metadata->>'session_rpe' IS NOT NULL)
ORDER BY date DESC
LIMIT 20;
```

### Count RPE Sources
```sql
-- Count how many workouts have RPE from each source
SELECT 
  COUNT(*) as total_completed,
  COUNT(CASE WHEN rpe IS NOT NULL THEN 1 END) as has_rpe_column,
  COUNT(CASE WHEN workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as has_session_rpe,
  COUNT(CASE WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as has_both,
  COUNT(CASE WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NULL THEN 1 END) as only_rpe_column,
  COUNT(CASE WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as only_session_rpe
FROM workouts
WHERE workout_status = 'completed';
```

---

## 10. Summary

### ✅ What's Working
- RPE can be changed in details screen
- Changes save to database correctly
- RPE persists when navigating away/back
- Database constraint ensures valid values (1-10)
- Error handling with toast notifications

### ⚠️ Potential Issues
- Dual storage system (`rpe` column vs `workout_metadata.session_rpe`)
- Not kept in sync when updated in details screen
- Different components use different storage locations
- Could lead to inconsistent data

### ❓ Questions to Answer
1. Which is the intended source of truth: `rpe` column or `workout_metadata.session_rpe`?
2. Should both be kept in sync, or should we consolidate to one?
3. Are there any parts of the app that read RPE and might see stale data?

### Next Steps
1. Run verification queries to check for inconsistencies
2. Decide on single source of truth
3. Implement sync mechanism or migration to consolidate
