# Performance Data Structure Guide

## Overview
This document explains how performance data is stored and accessed in the Efforts application, particularly focusing on the data structure differences between the database and application layers.

## The Problem
Performance data exists in **TWO different locations** with **different naming conventions**, which has caused multiple debugging issues in the past.

## Database Structure

### Root Level (snake_case)
The database stores some performance data at the root level of the `user_baselines` table:

```sql
{
  "id": "ae328cc6-c245-4318-9c53-87999bb164bc",
  "user_id": "45d122e7-a950-4d50-858c-380b492061aa",
  "age": 56,
  "fivek_pace": "7:43",        -- ⚠️ snake_case at root
  "fivek_time": "24:00",       -- ⚠️ snake_case at root
  "weight": 160,
  -- ... other fields
}
```

### Performance Numbers Object (camelCase)
The main performance data is stored in a nested `performance_numbers` object:

```sql
{
  "performance_numbers": {
    "ftp": 220,                    -- ✅ camelCase in nested object
    "bench": 160,                  -- ✅ camelCase in nested object
    "fiveK": "24:00",             -- ✅ camelCase in nested object
    "squat": 115,                  -- ✅ camelCase in nested object
    "deadlift": 170,               -- ✅ camelCase in nested object
    "easyPace": "10:30",          -- ✅ camelCase in nested object
    "swimPace100": "2:10",        -- ✅ camelCase in nested object
    "overheadPress1RM": 110       -- ✅ camelCase in nested object
  }
}
```

## Application Layer Expectations

The application code expects data in **camelCase** format and looks for it in the `performance_numbers` object:

```typescript
// ❌ WRONG - This will return null
const fiveK = baselines?.fiveK_pace;  // Looking for snake_case at root

// ✅ CORRECT - This will work
const fiveK = baselines?.performanceNumbers?.fiveK;  // Looking for camelCase in nested object
```

## Common Pitfalls

### 1. Field Name Mismatches
- **Database**: `fivek_pace` (snake_case)
- **Application**: `fiveK` (camelCase)

### 2. Data Location Confusion
- **Root level**: Some legacy fields like `fivek_pace`, `fivek_time`
- **Nested object**: Main performance data in `performance_numbers`

### 3. Inconsistent Access Patterns
Different parts of the code access data differently:
```typescript
// Some components expect:
baselines.performanceNumbers.fiveK

// Others expect:
baselines.fiveK

// The correct approach is to check both:
const fiveK = baselines.fivek_pace || baselines.performanceNumbers?.fiveK;
```

## Best Practices

### 1. Always Check Both Locations
```typescript
const pn = baselines || {};
const pnObj = pn.performance_numbers || {};

// Try both locations for each field
const fiveK = pn.fivek_pace || pn.fivek_time || pnObj.fiveK || null;
const easyPace = pnObj.easyPace || null;
const ftp = pnObj.ftp || null;
```

### 2. Use Consistent Field Names
- **Database fields**: snake_case (e.g., `fivek_pace`)
- **Application fields**: camelCase (e.g., `fiveK`)
- **Always map between them explicitly**

### 3. Document Field Mappings
```typescript
// Field mapping reference
const FIELD_MAPPING = {
  // Database (snake_case) -> Application (camelCase)
  'fivek_pace': 'fiveK',
  'fivek_time': 'fiveK',
  'easy_pace': 'easyPace',
  'swim_pace_100': 'swimPace100'
};
```

## Debugging Checklist

When performance data is `null` or missing:

1. ✅ **Check database**: Does the `user_baselines` record exist?
2. ✅ **Check field names**: Are you using the correct case (snake_case vs camelCase)?
3. ✅ **Check data location**: Is the data at root level or in `performance_numbers`?
4. ✅ **Check mapping**: Are you mapping between database and application field names?
5. ✅ **Check fallbacks**: Are you trying both locations for each field?

## Example Fix

### Before (Broken)
```typescript
// ❌ This will fail
const fiveK = baselines?.fiveK_pace;  // Looking for camelCase at root
const easyPace = baselines?.easyPace;  // Looking for camelCase at root
```

### After (Working)
```typescript
// ✅ This will work
const pn = baselines || {};
const pnObj = pn.performance_numbers || {};

const fiveK = pn.fivek_pace || pn.fivek_time || pnObj.fiveK || null;
const easyPace = pnObj.easyPace || null;
```

## Related Issues

This data structure mismatch has caused:
- `[baker] Missing computed for session` errors
- Pace values showing as `null` in training plans
- Plan baking failures due to missing performance data
- Multiple debugging sessions trying to figure out why data exists but isn't accessible

## Future Improvements

1. **Standardize on one location** for all performance data
2. **Create a data access layer** that handles the mapping automatically
3. **Add validation** to ensure data consistency between database and application
4. **Update database schema** to use consistent naming conventions
