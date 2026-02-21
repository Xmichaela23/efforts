# Migration Plan: Remove Client-Side Materialization

## Analysis Summary

### ✅ Good News: `ensureWeekMaterialized` is **DEAD CODE**

**Evidence:**
- No calls found: `grep` shows only the function definition, no invocations
- Comment in `WorkoutCalendar.tsx:265`: `"Materialization is server-side now; no client ensure-week"`
- Server handles materialization via `materialize-plan` edge function

### Current Usage Analysis

#### `ensureWeekMaterialized.ts` (2100+ lines)
- **Status**: ❌ **NOT CALLED ANYWHERE**
- **Uses**: `expand()`, `resolveTargets()`, `totalDurationSeconds()`
- **Action**: **DELETE ENTIRE FILE**

#### `expander.ts` (`expand()` function)
- **Status**: ❌ **ONLY USED BY DEAD CODE**
- **Used by**: 
  - `ensureWeekMaterialized.ts` (3 places) ← DEAD CODE
  - `targets.ts` (type import only)
- **Action**: **DELETE FILE** (after removing ensureWeekMaterialized)

#### `targets.ts` (`resolveTargets()` function)
- **Status**: ⚠️ **PARTIALLY USED**
- **Used by**:
  - `ensureWeekMaterialized.ts` (3 places) ← DEAD CODE
  - `AllPlansInterface.tsx` (imported but **NOT USED** - grep shows no calls)
- **Action**: **REMOVE UNUSED IMPORT** from AllPlansInterface, then **DELETE FILE**

#### `plan_bake_and_compute.ts`
- **Status**: ✅ **BUILD-TIME TOOL** (not runtime)
- **Uses**: Own `expandPresets()` function, NOT `expander.ts`
- **Action**: **KEEP** (different purpose)

## Migration Steps

### Phase 1: Remove Dead Code ✅ (Safe - no runtime impact)

1. **Delete `src/services/plans/ensureWeekMaterialized.ts`**
   - 2100+ lines of dead code
   - No calls found anywhere

2. **Remove unused import from `AllPlansInterface.tsx`**
   ```typescript
   // REMOVE THIS LINE:
   import { resolveTargets } from '@/services/plans/targets';
   ```

3. **Delete `src/services/plans/expander.ts`**
   - Only used by dead code
   - `targets.ts` imports type from it, but we'll delete targets too

4. **Delete `src/services/plans/targets.ts`**
   - Only used by dead code
   - Unused import in AllPlansInterface

### Phase 2: Verify Server Coverage

**Server already handles:**
- ✅ `materialize-plan` edge function - materializes individual workouts
- ✅ `activate-plan` edge function - materializes entire plans
- ✅ `get-week` edge function - calls materialize-plan for missing steps

**No gaps identified** - server coverage is complete.

## Result

After migration:
- **~2500+ lines of dead code removed**
- **True "dumb client, smart server" architecture**
- **Single source of truth**: Server materialization only
- **No code duplication**: Token parsing only on server

## Files to Delete

1. `src/services/plans/ensureWeekMaterialized.ts` (2100+ lines)
2. `src/services/plans/expander.ts` (~430 lines)
3. `src/services/plans/targets.ts` (~200 lines)

## Files to Modify

1. `src/components/AllPlansInterface.tsx` - Remove unused import

## Verification Checklist

- [ ] Delete ensureWeekMaterialized.ts
- [ ] Remove unused import from AllPlansInterface.tsx
- [ ] Delete expander.ts
- [ ] Delete targets.ts
- [ ] Run linter - verify no broken imports
- [ ] Test plan activation - verify server materialization works
- [ ] Test workout viewing - verify materialize-plan edge function works
- [ ] Verify no runtime errors

