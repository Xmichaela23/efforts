# Mobile Logger Save Functionality Audit

## Issues Identified

### 1. JSON Parse Error: "Unexpected EOF"

**Location**: `src/hooks/useWorkouts.ts` lines 1440-1442

**Problem**: 
The code attempts to parse JSON from database responses without checking:
- If the value is already parsed (Supabase JSONB can return objects/arrays directly)
- If the value is an empty string `""` (which causes "Unexpected EOF")
- If the value is `null` or `undefined` properly

**Current Code**:
```typescript
intervals: data.intervals ? JSON.parse(data.intervals) : [],
strength_exercises: data.strength_exercises ? JSON.parse(data.strength_exercises) : [],
mobility_exercises: ((): any[] => { 
  try { 
    return data.mobility_exercises ? JSON.parse(data.mobility_exercises) : []; 
  } catch { 
    return Array.isArray((data as any).mobility_exercises) ? (data as any).mobility_exercises : []; 
  } 
})(),
```

**Issues**:
1. `intervals` and `strength_exercises` don't check if the value is already an array/object before parsing
2. If `data.intervals` or `data.strength_exercises` is an empty string `""`, `JSON.parse("")` throws "Unexpected EOF"
3. `mobility_exercises` has a try-catch but the other two don't
4. No handling for when Supabase returns already-parsed JSONB (which it can do)

**Root Cause**: Supabase JSONB columns can be returned as:
- Already parsed objects/arrays (when using `.select()` with proper handling)
- JSON strings (when serialized)
- Empty strings `""` (edge case but possible)
- `null` or `undefined`

### 2. Wrong Day Issue

**Location**: `src/components/StrengthLogger.tsx` lines 613-619 and 2347

**Problem**:
The `getStrengthLoggerDateString()` function uses the device's local timezone instead of normalizing to PST (America/Los_Angeles), which can cause workouts to be saved on the wrong day.

**Current Code**:
```typescript
const getStrengthLoggerDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
```

**Issues**:
1. Uses `new Date()` which gets the local device timezone
2. If user is in EST (3 hours ahead of PST) and it's 11 PM EST, the local date is already the next day, but PST is still the previous day
3. The codebase elsewhere uses `'America/Los_Angeles'` timezone (see lines 2355, 2383, 2396 in StrengthLogger.tsx)
4. Inconsistent with other date handling in the codebase

**Usage**:
```typescript
const workoutDate = (targetDate || scheduledWorkout?.date || getStrengthLoggerDateString());
```

**Impact**: 
- Workouts saved late at night in timezones ahead of PST will be saved with tomorrow's date
- Workouts saved early morning in timezones behind PST might be saved with yesterday's date

## Additional Findings

### Date Handling Inconsistencies

The codebase has mixed approaches to date handling:

1. **PST Normalization** (used in some places):
   - `new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })`
   - `new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })`

2. **Local Timezone** (used in `getStrengthLoggerDateString`):
   - `new Date().getFullYear()`, `getMonth()`, `getDate()`

3. **Date String with Time** (used to avoid timezone issues):
   - `new Date(dateStr + 'T12:00:00')` or `new Date(dateStr + 'T00:00:00')`

### JSONB Parsing Inconsistencies

Different parts of the codebase handle JSONB parsing differently:

1. **Safe parsing with type checking** (calculate-workload function):
   ```typescript
   if (typeof exercises === 'string') {
     try {
       exercises = JSON.parse(exercises);
       if (typeof exercises === 'string') {
         exercises = JSON.parse(exercises); // Handle double-encoded
       }
     } catch (e) {
       // Handle error
     }
   }
   ```

2. **Unsafe parsing** (useWorkouts.ts):
   ```typescript
   intervals: data.intervals ? JSON.parse(data.intervals) : [],
   ```

3. **Try-catch with fallback** (mobility_exercises):
   ```typescript
   try { 
     return data.mobility_exercises ? JSON.parse(data.mobility_exercises) : []; 
   } catch { 
     return Array.isArray((data as any).mobility_exercises) ? (data as any).mobility_exercises : []; 
   }
   ```

## Recommended Fixes

### Fix 1: Safe JSONB Parsing

Create a helper function to safely parse JSONB values:

```typescript
function safeParseJSONB(value: any, defaultValue: any = null): any {
  // Already parsed or null/undefined
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  // Already an array or object
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value;
  }
  
  // Empty string
  if (typeof value === 'string' && value.trim() === '') {
    return defaultValue;
  }
  
  // Try to parse string
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      // Handle double-encoded JSONB
      if (typeof parsed === 'string') {
        return JSON.parse(parsed);
      }
      return parsed;
    } catch (e) {
      console.warn('Failed to parse JSONB:', e, value);
      return defaultValue;
    }
  }
  
  return defaultValue;
}
```

Then use it:
```typescript
intervals: safeParseJSONB(data.intervals, []),
strength_exercises: safeParseJSONB(data.strength_exercises, []),
mobility_exercises: safeParseJSONB(data.mobility_exercises, []),
```

### Fix 2: PST-Normalized Date Function

Update `getStrengthLoggerDateString()` to use PST timezone:

```typescript
const getStrengthLoggerDateString = () => {
  const now = new Date();
  // Get PST date
  const pstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const year = pstDate.getFullYear();
  const month = String(pstDate.getMonth() + 1).padStart(2, '0');
  const day = String(pstDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
```

Or use the date string approach:
```typescript
const getStrengthLoggerDateString = () => {
  const now = new Date();
  const pstString = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  // Returns YYYY-MM-DD format
  return pstString;
};
```

## Testing Recommendations

1. **JSON Parse Error**:
   - Test with empty string values
   - Test with already-parsed arrays/objects
   - Test with null/undefined values
   - Test with malformed JSON strings

2. **Date Issue**:
   - Test saving workouts at 11 PM EST (should use PST date, not EST date)
   - Test saving workouts at 1 AM PST (should use correct PST date)
   - Test with different device timezones
   - Verify saved date matches expected PST date

## Files to Modify

1. `src/hooks/useWorkouts.ts` - Fix JSONB parsing:
   - `addWorkout` function (lines 1440-1442)
   - `updateWorkout` function (lines 1744-1746) - **Same issue exists here**
2. `src/components/StrengthLogger.tsx` - Fix date function (line 613-619)
3. Consider creating a shared utility file for:
   - Safe JSONB parsing helper
   - PST-normalized date helpers

## Additional Issue in updateWorkout

The `updateWorkout` function has the same JSON parsing vulnerability on lines 1744-1746:

```typescript
intervals: data.intervals ? JSON.parse(data.intervals) : [],
strength_exercises: data.strength_exercises ? JSON.parse(data.strength_exercises) : [],
mobility_exercises: (() => { try { return data.mobility_exercises ? JSON.parse(data.mobility_exercises) : []; } catch { return Array.isArray((data as any).mobility_exercises) ? (data as any).mobility_exercises : []; } })(),
```

Same fixes should be applied here as well.

## Related Code Locations

- `src/hooks/useWorkouts.ts:1440-1442` - Unsafe JSON parsing
- `src/hooks/useWorkouts.ts:1650+` - updateWorkout likely has similar issues
- `src/components/StrengthLogger.tsx:613-619` - Date function
- `src/components/StrengthLogger.tsx:2347` - Date usage
- `supabase/functions/calculate-workload/index.ts:931-965` - Example of safe JSONB parsing
