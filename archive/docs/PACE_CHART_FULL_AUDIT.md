# Pace Chart Full Audit

## Overview
This document provides a complete audit of how the pace chart works, from data source to final rendering, and identifies why the Y-axis domain doesn't match the splits table.

## Data Flow

### 1. Data Source
- **Server**: `pace_s_per_km` array (seconds per kilometer) from `compute-workout-analysis`
- **Component Input**: `samples` prop can be either:
  - `Sample[]` array with `pace_s_per_km` field
  - Raw series object: `{pace_s_per_km: number[]}`
- **Normalization**: `normalizedSamples` converts both formats to `Sample[]` (lines 687-828)
- **Raw Metric**: `metricRaw` extracts pace values: `normalizedSamples.map(s => s.pace_s_per_km)` (line 1064)

### 2. Splits Calculation
- **Function**: `computeSplits(normalizedSamples, metersPerSplit)` (line 628)
- **Split Distance**: `useMiles ? 1609.34 : 1000` meters (1 mile or 1 km)
- **Pace Calculation**: `avgPace_s_per_km = time_s / (dist_m / 1000)` (line 623)
- **Storage**: Splits stored with `avgPace_s_per_km` in seconds per kilometer
- **Display**: Splits table uses `fmtPace(sp.avgPace_s_per_km, useMiles)` (line 1961)

### 3. Domain Calculation (Current Implementation)

**Location**: `yDomain` useMemo (lines 1148-1371)

**For Pace Tab** (lines 1160-1193):
1. **Compute splits inline** (line 1163):
   ```typescript
   const splitsForDomain = computeSplits(normalizedSamples, useMiles ? 1609.34 : 1000);
   const splitPaces = splitsForDomain
     .map(s => s.avgPace_s_per_km)
     .filter((p): p is number => p !== null && Number.isFinite(p));
   ```

2. **Get min/max from splits** (lines 1169-1173):
   ```typescript
   const splitPaceRange = {
     min: Math.min(...splitPaces),  // in sec_per_km
     max: Math.max(...splitPaces)   // in sec_per_km
   };
   ```

3. **Add 10% padding** (lines 1175-1178):
   ```typescript
   const range = splitPaceRange.max - splitPaceRange.min;
   lo = Math.max(0, splitPaceRange.min - (range * 0.1));
   hi = splitPaceRange.max + (range * 0.1);
   ```

4. **Round to 30-second intervals** (lines 1289-1336):
   - Converts domain to display units (sec/mi or sec/km)
   - Rounds boundaries to 30-second intervals
   - **EXPANDS domain** to ensure span is multiple of 120 seconds (4 steps)
   - Converts back to `pace_s_per_km`
   - **Problem**: This rounding can expand the domain significantly beyond the splits range

5. **Add MORE padding** (lines 1361-1370):
   ```typescript
   const padFrac = (tab === 'pace') ? (isOutdoorGlobal ? 0.08 : 0.05)  // 8% or 5%
   const pad = Math.max((hi - lo) * padFrac, 1);
   return [lo - pad, hi + pad];
   ```

**Total Expansion**:
- Initial: splits min/max
- +10% padding
- +Rounding expansion (can add 30-60 seconds on each side)
- +8% padding (outdoor) or 5% padding (indoor)

**Result**: Domain can be 20-30% wider than splits range!

### 4. Tick Generation

**Location**: `yTicks` useMemo (lines 1393-1429)

**Process**:
1. Takes final domain `[a, b]` from `yDomain`
2. Creates 5 evenly spaced ticks:
   ```typescript
   const step = (b - a) / 4;
   const ticks = new Array(5).fill(0).map((_, i) => a + i * step);
   ```
3. Ticks are in `pace_s_per_km` units (seconds per kilometer)

### 5. Rendering

**Y-Axis Labels** (line 1829):
- Uses `fmtYAxis(v, tab, workoutType, useMiles, useFeet)`
- For pace: calls `fmtPaceYAxis(value, useMiles)` (line 225)
- `fmtPaceYAxis` converts `secPerKm` to display units:
  ```typescript
  let spU = toSecPerUnit(secPerKm, useMi);  // Convert to sec/mi or sec/km
  let m = Math.floor(spU / 60);
  let s = Math.round(spU % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
  ```

**Chart Line** (lines 1432-1458):
- Uses `yFromValue(v)` to map pace value to Y coordinate
- **Inverts Y-axis** for pace (line 1385): `t = 1 - t` (faster pace = higher on chart)
- Pace values come from `metricRaw` (raw `pace_s_per_km` from samples)

## Root Cause Analysis

### The Problem
The Y-axis domain is **significantly wider** than the splits table range because:

1. **Double Padding**: 10% padding + 8% padding = 18%+ expansion
2. **Rounding Expansion**: Rounding to 30-second intervals expands domain to ensure clean tick spacing
3. **Minimum Span Enforcement**: Line 1260 enforces minimum span of 60 seconds (outdoor), which can expand narrow ranges

### Example Calculation
If splits range is **9:59-11:01/mi** (62 seconds span):
- In sec_per_km: ~372-410 sec_per_km (38 second span)
- After 10% padding: ~368-414 sec_per_km (46 second span)
- After rounding to 30s intervals: Could expand to ~360-420 sec_per_km (60 second span)
- After 8% padding: ~355-425 sec_per_km (70 second span)
- **Final display**: ~9:20-11:40/mi (140 second span) - **2.3x wider than splits!**

### Why This Happens
The code prioritizes:
1. Clean tick spacing (30-second intervals)
2. Visual padding (to avoid clipping)
3. Minimum span (to prevent too-narrow charts)

But these priorities **conflict** with matching the splits table range.

## Solution

### Option 1: Minimal Padding Only (Recommended)
- Use splits min/max directly
- Add small padding (2-3%) for visual breathing room
- Skip aggressive rounding - let ticks be slightly uneven if needed
- Skip extra padding at the end

### Option 2: Constrain Rounding
- Calculate domain from splits
- Round to intervals, but **don't expand** - only round inward if needed
- Add minimal padding after rounding

### Option 3: Match Splits Exactly
- Use splits min/max
- Add fixed padding (e.g., 5 seconds on each side in display units)
- No rounding, no percentage-based padding
- Accept that ticks might not be perfectly spaced

## Unit Conversion Verification

**Conversion Functions**:
- `toSecPerUnit(secPerKm, useMiles)`: `useMiles ? secPerKm * 1.60934 : secPerKm`
- `fromSecPerUnit(secPerUnit, useMiles)`: `useMiles ? secPerUnit / 1.60934 : secPerUnit`

**Verification**: ✅ Correct
- 1 mile = 1.60934 km
- If pace is 300 sec/km, then pace per mile = 300 * 1.60934 = 482.8 sec/mi = 8:03/mi

**Data Consistency**: ✅ Correct
- Server stores `pace_s_per_km` (seconds per kilometer)
- Splits calculate `avgPace_s_per_km` (seconds per kilometer)
- Chart domain uses `pace_s_per_km` (seconds per kilometer)
- Display converts to `sec/mi` or `sec/km` for labels

## Current State Summary

| Component | Unit | Status |
|-----------|------|--------|
| Server data | `pace_s_per_km` (sec/km) | ✅ Correct |
| Splits calculation | `avgPace_s_per_km` (sec/km) | ✅ Correct |
| Domain calculation | `pace_s_per_km` (sec/km) | ⚠️ Too wide |
| Tick generation | `pace_s_per_km` (sec/km) | ✅ Correct |
| Label formatting | Display units (min:sec/mi or /km) | ✅ Correct |
| Chart line | `pace_s_per_km` (sec/km) | ✅ Correct |

**Issue**: Domain calculation expands too much, making chart range wider than splits table.
