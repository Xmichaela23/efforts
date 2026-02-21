# Gear System Audit

## Executive Summary

### ✅ **Overall Status: WORKING WITH MINOR ISSUES**

The gear system is **properly wired** between the details screen and hamburger menu, and distance accumulation **should be working correctly** via database triggers. However, there are some minor UX inconsistencies and a need to verify historical data.

### Key Findings:
1. ✅ **Data Source**: Both components use the same `gear` table - **CONSISTENT**
2. ✅ **Integration**: Details screen can open gear management via `onAddGear` callback - **WORKING**
3. ✅ **Distance Accumulation**: Database trigger should be accumulating distance correctly - **NEEDS VERIFICATION**
4. ⚠️ **Realtime Updates**: Details screen doesn't auto-refresh when gear distance changes - **MINOR UX ISSUE**
5. ⚠️ **Formatting**: Distance display format differs between components - **MINOR INCONSISTENCY**

### Critical Questions:
- ❓ **Have historical workouts been accumulating distance?** (Need to run verification queries)
- ❓ **Are there any gear items with incorrect total_distance?** (Need to check)

### Recommendations:
1. **HIGH**: Run verification queries to confirm distance accuracy
2. **MEDIUM**: Add realtime subscription to CompletedTab for better UX
3. **LOW**: Standardize distance formatting between components

---

## Overview
This audit examines how gear works in the details screen, its integration with the hamburger menu gear management, and whether distance has been accumulating correctly since gear was added.

## 1. Data Source Consistency

### CompletedTab (Details Screen)
- **Location**: `src/components/CompletedTab.tsx`
- **Load Function**: `loadGear()` (lines 121-166)
- **Query**: 
  ```typescript
  .from('gear')
  .select('id, type, name, brand, model, is_default, total_distance')
  .eq('user_id', user.id)
  .eq('type', gearType) // 'shoe' or 'bike'
  .eq('retired', false)
  .order('is_default', { ascending: false })
  .order('name')
  ```
- **When Loaded**: 
  - On mount (useEffect, line 117)
  - After gear_id is changed (line 207)
- **Fields Used**: `id, type, name, brand, model, is_default, total_distance`

### Gear.tsx (Hamburger Menu)
- **Location**: `src/components/Gear.tsx`
- **Load Function**: `loadGear()` (lines 142-171)
- **Query**:
  ```typescript
  .from('gear')
  .select('*') // All fields
  .eq('user_id', user.id)
  .order('is_default', { ascending: false })
  .order('name')
  ```
- **When Loaded**: 
  - On mount (useEffect, line 104)
  - Via realtime subscription to gear table updates (lines 108-139)
- **Fields Used**: All fields including `starting_distance`, `purchase_date`, `notes`, `retired`

### ✅ **VERDICT: Data Source is Consistent**
Both components query the same `gear` table with the same user_id filter. The only difference is:
- CompletedTab filters by `type` and `retired = false`
- Gear.tsx loads all gear and filters client-side
- Both use the same ordering (default first, then by name)

## 2. Integration Between Components

### CompletedTab → Gear Management
- **Connection**: `onAddGear` callback prop (line 54, 68)
- **Usage**: "Add New Shoes/Bike" button in gear dropdown (lines 1611-1626)
- **Flow**: Clicking "Add New" calls `onAddGear()` which opens the Gear management screen
- **Wiring**: In `AppLayout.tsx`, `handleGearClick` sets `setShowGear(true)` (line 801)

### Gear Management → CompletedTab
- **Realtime Updates**: Gear.tsx subscribes to gear table changes (lines 108-139)
- **Trigger**: When gear is updated (e.g., total_distance changes), Gear.tsx reloads
- **Issue**: CompletedTab does NOT subscribe to realtime updates
- **Manual Refresh**: CompletedTab only reloads gear:
  - On mount
  - After changing gear_id on a workout (line 207)

### ⚠️ **POTENTIAL ISSUE: No Realtime Sync**
If gear distance is updated via trigger while CompletedTab is open, the UI won't refresh automatically. However, this is mitigated by:
- CompletedTab reloads gear after saving a gear_id change
- User would need to navigate away and back to see trigger updates

## 3. Distance Accumulation System

### Database Trigger
- **Location**: `supabase/migrations/20260108_fix_gear_distance_trigger.sql`
- **Function**: `update_gear_distance()`
- **Trigger**: `update_gear_distance_trigger`
- **Fires On**: 
  - `INSERT` on workouts
  - `UPDATE` of `gear_id`, `distance`, or `workout_status` on workouts

### Calculation Logic
```sql
total_distance = starting_distance + SUM(workouts.distance * 1000)
```
- `starting_distance`: Initial mileage when gear was added (in meters)
- `workouts.distance`: Workout distance in kilometers
- Conversion: `distance * 1000` converts km to meters
- Only counts: `workout_status = 'completed'`

### Trigger Behavior
1. **When gear_id is set on a workout**:
   - Recalculates total_distance for the NEW gear
   - Formula: `starting_distance + SUM(all completed workouts with this gear_id)`

2. **When gear_id is changed**:
   - Recalculates total_distance for the OLD gear (removes workout from old gear)
   - Recalculates total_distance for the NEW gear (adds workout to new gear)

3. **When workout_status changes to 'completed'**:
   - Recalculates total_distance for the gear

### ✅ **VERDICT: Distance Accumulation Should Work**
The trigger logic is sound and should accumulate distance correctly. However, there are some edge cases to verify:

## 4. Potential Issues

### Issue 1: Trigger Only Fires on Specific Updates
**Problem**: The trigger fires on:
```sql
AFTER INSERT OR UPDATE OF gear_id, distance, workout_status
```

**Scenario**: If a workout is updated but `gear_id`, `distance`, and `workout_status` don't change, the trigger won't fire. This is actually correct behavior.

**Impact**: ✅ None - this is expected

### Issue 2: CompletedTab Doesn't Show Real-time Updates
**Problem**: When gear distance is updated by trigger, CompletedTab won't refresh automatically.

**Impact**: ⚠️ Minor - User needs to change gear or navigate away/back to see updated distance

**Recommendation**: Consider adding realtime subscription to CompletedTab (like Gear.tsx has)

### Issue 3: Distance Display Inconsistency
**CompletedTab** (line 1589-1593):
- Shows distance in dropdown with inline formatting:
  ```typescript
  const distanceMeters = item.total_distance || 0;
  const distanceMi = distanceMeters / 1609.34;
  const distanceText = useImperial 
    ? (distanceMi < 1 ? `${Math.round(distanceMeters)} m` : `${distanceMi.toFixed(1)} mi`)
    : `${(distanceMeters / 1000).toFixed(1)} km`;
  ```
- Handles imperial/metric units
- Shows meters for small distances (< 1 mile)

**Gear.tsx** (line 272-275):
- Uses simple `formatDistance()` function:
  ```typescript
  const formatDistance = (meters: number) => {
    const miles = meters / 1609.34;
    return `${miles.toFixed(0)} mi`;
  };
  ```
- Always shows miles (no metric option)
- Always rounds to whole miles (no decimals)

**Impact**: ⚠️ **Minor Inconsistency**
- CompletedTab shows more detailed formatting (decimals, metric option, meters for small values)
- Gear.tsx shows simpler formatting (whole miles only)
- Both are functional but could be standardized for consistency

### Issue 4: Historical Data Accumulation
**Question**: Have workouts been accumulating distance since gear was first added?

**To Verify**: Need to check:
1. When was the gear table/trigger created?
2. Are there workouts with gear_id set before the trigger existed?
3. Have backfill scripts been run?

**Scripts Found**:
- `recalculate_gear_total_distance.sql` - Recalculates all gear distances
- `backfill_gear_starting_distance.sql` - Backfills starting_distance
- `fix_gear_distances_complete.sql` - Complete fix script

**Recommendation**: Run verification query to check if distances match expected values

## 5. Verification Queries

### Check if distances are correct:
```sql
SELECT 
  g.id,
  g.name,
  g.starting_distance,
  g.total_distance,
  (SELECT COALESCE(SUM(w.distance * 1000), 0) 
   FROM workouts w 
   WHERE w.gear_id = g.id AND w.workout_status = 'completed') as calculated_workout_sum,
  (g.starting_distance + 
   (SELECT COALESCE(SUM(w.distance * 1000), 0) 
    FROM workouts w 
    WHERE w.gear_id = g.id AND w.workout_status = 'completed')) as expected_total,
  (g.total_distance - 
   (g.starting_distance + 
    (SELECT COALESCE(SUM(w.distance * 1000), 0) 
     FROM workouts w 
     WHERE w.gear_id = g.id AND w.workout_status = 'completed'))) as difference
FROM gear g
WHERE g.total_distance > 0
ORDER BY ABS(difference) DESC;
```

### Check workout coverage:
```sql
SELECT 
  COUNT(*) as total_workouts,
  COUNT(CASE WHEN gear_id IS NOT NULL THEN 1 END) as workouts_with_gear,
  COUNT(CASE WHEN gear_id IS NOT NULL AND workout_status = 'completed' THEN 1 END) as completed_with_gear
FROM workouts;
```

### Check trigger is active:
```sql
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'update_gear_distance_trigger';
```

## 6. Recommendations

### High Priority
1. ✅ **Verify distance accumulation**: Run verification queries to ensure all gear distances are correct
2. ⚠️ **Add realtime subscription to CompletedTab**: So gear distance updates are visible immediately
3. ✅ **Test gear_id changes**: Verify that changing gear_id on a workout properly updates both old and new gear distances

### Medium Priority
1. **Standardize distance formatting**: Ensure both components use the same formatting function
2. **Add loading states**: Show when gear is being reloaded after distance updates
3. **Error handling**: Add error handling if trigger fails (though this is rare)

### Low Priority
1. **Performance**: Consider caching gear data if it's loaded frequently
2. **UI feedback**: Show a toast when gear distance is updated

## 7. Summary

### ✅ What's Working
- Both components use the same data source
- Trigger logic is sound and should accumulate distance correctly
- Integration between components exists (onAddGear callback)
- Gear reloads after gear_id changes in CompletedTab

### ⚠️ Potential Issues
- CompletedTab doesn't have realtime updates (minor UX issue)
- Need to verify historical data has been accumulating correctly
- Distance formatting is inconsistent between components (minor UX issue)

### ❓ Questions to Answer
1. When was the gear system first deployed?
2. Have all historical workouts with gear_id been included in distance calculations?
3. Are there any gear items with incorrect total_distance values?
4. ✅ **ANSWERED**: `formatDistance` exists in Gear.tsx but is simpler than CompletedTab's inline formatting

## Next Steps
1. Run verification queries to check distance accuracy
2. Test changing gear_id on a workout and verify both old/new gear update
3. Consider adding realtime subscription to CompletedTab
4. Verify formatDistance function exists and is used consistently
