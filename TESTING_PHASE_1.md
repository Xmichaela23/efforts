# Phase 1 Testing Guide: Shared Library Integration

## 🎯 Goal
Verify that `extractSensorData()` and `normalizeSamples()` work identically after moving to shared library.

---

## ✅ What Changed
- ✅ `analyze-running-workout` now imports `extractSensorData` from shared lib
- ✅ `compute-workout-analysis` now imports `normalizeSamples` from shared lib
- ✅ Old functions commented out (kept as backup)

---

## 🧪 Testing Strategy

### Option 1: Manual Testing (Quickest)
**Best for**: Quick verification that everything still works

#### Step 1: Test `compute-workout-analysis` (Details Screen)
1. **Find a test workout** with sensor data:
   ```sql
   SELECT id, type, sensor_data, computed 
   FROM workouts 
   WHERE type = 'run' 
   AND sensor_data IS NOT NULL 
   LIMIT 1;
   ```

2. **Clear computed data** (to force recomputation):
   ```sql
   UPDATE workouts 
   SET computed = NULL 
   WHERE id = '<workout_id>';
   ```

3. **Trigger analysis** via frontend or direct call:
   - Open workout in Details screen (should trigger `compute-workout-analysis`)
   - OR call edge function directly:
     ```bash
     curl -X POST https://<project>.supabase.co/functions/v1/compute-workout-analysis \
       -H "Authorization: Bearer <anon_key>" \
       -H "Content-Type: application/json" \
       -d '{"workout_id": "<workout_id>"}'
     ```

4. **Verify Details screen**:
   - ✅ Charts display correctly (pace, HR, elevation)
   - ✅ Splits table shows correct data
   - ✅ Zone charts display correctly
   - ✅ No errors in console

#### Step 2: Test `analyze-running-workout` (Summary + Context Screens)
1. **Find a test workout** with planned workout:
   ```sql
   SELECT w.id, w.type, w.planned_id, pw.computed
   FROM workouts w
   JOIN planned_workouts pw ON w.planned_id = pw.id
   WHERE w.type = 'run' 
   AND w.planned_id IS NOT NULL
   LIMIT 1;
   ```

2. **Clear workout_analysis** (to force reanalysis):
   ```sql
   UPDATE workouts 
   SET workout_analysis = NULL, analysis_status = NULL
   WHERE id = '<workout_id>';
   ```

3. **Trigger analysis** via frontend:
   - Open workout → Click "View context" or navigate to Context tab
   - Should trigger `analyze-running-workout`

4. **Verify Summary screen**:
   - ✅ Execution scores display (Execution %, Pace %, Duration %)
   - ✅ Planned vs completed table shows correct data
   - ✅ No errors in console

5. **Verify Context screen**:
   - ✅ AI insights display correctly
   - ✅ Interval breakdown OR mile-by-mile breakdown shows correctly
   - ✅ Red flags and strengths display
   - ✅ No errors in console

---

### Option 2: Database Comparison (Most Thorough)
**Best for**: Verifying outputs are byte-for-byte identical

#### Step 1: Save "Before" State
1. **Restore old code** (uncomment local functions, remove imports)
2. **Run test workout** through both functions
3. **Save database state**:
   ```sql
   -- Save computed data
   SELECT id, computed 
   FROM workouts 
   WHERE id = '<workout_id>' 
   \gset
   
   -- Save workout_analysis
   SELECT id, workout_analysis 
   FROM workouts 
   WHERE id = '<workout_id>' 
   \gset
   ```

4. **Export to JSON files**:
   ```bash
   # Save computed.json
   # Save workout_analysis.json
   ```

#### Step 2: Test "After" State
1. **Use new code** (with shared library imports)
2. **Clear data**:
   ```sql
   UPDATE workouts 
   SET computed = NULL, workout_analysis = NULL, analysis_status = NULL
   WHERE id = '<workout_id>';
   ```

3. **Run test workout** through both functions again
4. **Compare outputs**:
   ```sql
   -- Compare computed
   SELECT id, computed 
   FROM workouts 
   WHERE id = '<workout_id>';
   
   -- Compare workout_analysis
   SELECT id, workout_analysis 
   FROM workouts 
   WHERE id = '<workout_id>';
   ```

5. **Verify fields match**:
   - ✅ `computed.series` - identical arrays
   - ✅ `computed.analysis.splits` - identical splits
   - ✅ `computed.analysis.zones` - identical zones
   - ✅ `workout_analysis.performance` - identical scores
   - ✅ `workout_analysis.narrative_insights` - similar AI insights (may vary slightly)

---

### Option 3: Automated Test Script (Future)
**Best for**: Continuous testing

Create a test script that:
1. Finds test workouts (interval, long run, single-target)
2. Calls edge functions
3. Compares outputs
4. Reports differences

---

## 🎯 Test Cases

### Test Case 1: Interval Workout
**Workout**: `4 × 1 mile @ 5K pace` with recovery jogs

**Expected Results**:
- ✅ `compute-workout-analysis`: Charts, splits, zones
- ✅ `analyze-running-workout`: Execution scores, interval breakdown
- ✅ Summary screen: Shows all 4 intervals + execution scores
- ✅ Context screen: Shows interval breakdown (NOT mile-by-mile)

---

### Test Case 2: Long Run (Range)
**Workout**: `10 miles @ 7:00-8:00/mi` (single step, pace range)

**Expected Results**:
- ✅ `compute-workout-analysis`: Charts, splits, zones
- ✅ `analyze-running-workout`: Execution scores, mile-by-mile breakdown
- ✅ Summary screen: Shows single step + execution scores
- ✅ Context screen: Shows mile-by-mile terrain breakdown (NOT interval breakdown)

---

### Test Case 3: Long Run (Single-Target)
**Workout**: `90 minutes @ 7:00/mi` (single step, exact pace)

**Expected Results**:
- ✅ `compute-workout-analysis`: Charts, splits, zones
- ✅ `analyze-running-workout`: Execution scores, consistency analysis
- ✅ Summary screen: Shows single step + execution scores
- ✅ Context screen: Shows consistency analysis (NOT interval breakdown)

---

## ✅ Success Criteria

### Must Pass:
1. ✅ **No runtime errors** - Functions execute without crashing
2. ✅ **Details screen works** - Charts, splits, zones display correctly
3. ✅ **Summary screen works** - Execution scores display correctly
4. ✅ **Context screen works** - AI insights display correctly
5. ✅ **Database writes succeed** - No write errors

### Nice to Have:
6. ✅ **Outputs identical** - Database writes match old code (if comparing)
7. ✅ **Performance same** - No significant slowdown

---

## 🐛 Troubleshooting

### Issue: Import Error
**Error**: `Cannot find module '../../lib/analysis/sensor-data/extractor.ts'`

**Fix**: Verify import path is correct:
- From `supabase/functions/analyze-running-workout/index.ts`
- To `supabase/lib/analysis/sensor-data/extractor.ts`
- Path: `../../lib/analysis/sensor-data/extractor.ts` ✅

### Issue: Function Not Found
**Error**: `extractSensorData is not a function`

**Fix**: 
1. Check import statement is correct
2. Verify function is exported in `extractor.ts`
3. Check for TypeScript compilation errors

### Issue: Different Outputs
**Error**: Database writes differ from expected

**Fix**:
1. Compare function signatures (should be identical)
2. Check for any logic differences
3. Verify shared library code matches old code exactly

---

## 📋 Testing Checklist

- [ ] Test `compute-workout-analysis` with interval workout
- [ ] Test `compute-workout-analysis` with long run
- [ ] Test `analyze-running-workout` with interval workout
- [ ] Test `analyze-running-workout` with long run
- [ ] Verify Details screen displays correctly
- [ ] Verify Summary screen displays correctly
- [ ] Verify Context screen displays correctly
- [ ] Check console for errors
- [ ] Compare database outputs (if doing comparison testing)

---

## 🎯 Next Steps After Testing

If all tests pass:
1. ✅ Phase 1 complete
2. ✅ Proceed to Phase 2: Extract pace/duration calculators
3. ✅ Keep old functions commented as backup for 1-2 weeks

If tests fail:
1. ❌ Rollback: Uncomment old functions, remove imports
2. ❌ Debug: Compare shared library code to old code
3. ❌ Fix: Update shared library to match old code exactly
4. ❌ Retest: Run tests again

---

**Ready to test!** 🚀





