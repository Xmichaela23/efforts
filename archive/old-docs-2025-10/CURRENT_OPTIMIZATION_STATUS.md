# Current Optimization Status - August 26, 2025

## 🚨 Current Issue: Supabase CPU Overload

**Status**: Baker functional but overwhelming database with large plan processing

### **What We Fixed:**
- ✅ All `steps_preset` tokens recognized (50+ tokens)
- ✅ Baker generates proper computed data with user baselines
- ✅ Workout durations calculated correctly
- ✅ No more unknown token warnings

### **What's Breaking:**
- ❌ Database crashes on 95-workout plan inserts
- ❌ Supabase CPU spikes to 100%
- ❌ 500 errors and statement timeouts
- ❌ Plan page can't load due to database overload

## 🔧 Architecture Changes Needed

### **Current Approach (Broken):**
```typescript
// Bakes entire plan at once
const bakedPlan = augmentPlan(entirePlan); // 95 workouts
// Tries to insert all at once - CRASHES SUPABASE
```

### **New Approach (In Progress):**
```typescript
// Bake week by week, on-demand
const loadWeek = async (weekNum: number) => {
  if (!weekCache.has(weekNum)) {
    const weekData = await bakeWeek(weekNum); // 9 workouts max
    weekCache.set(weekNum, weekData);
  }
  return weekCache.get(weekNum);
};
```

## 📱 New User Experience Flow

### **1. Plan Acceptance:**
- Plan saved to database
- Week 1 baked immediately (9 workouts)
- User can start planning Week 1

### **2. Progressive Loading:**
- Week 2: Load when user clicks (200-300ms)
- Week 3: Load when user clicks (200-300ms)
- Week 4: Load when user clicks (200-300ms)
- Once loaded = cached forever (50ms)

### **3. Calendar Integration:**
- Basic workout info shows instantly
- Click date = load detailed workout (100-200ms)
- Navigate months = smooth, cached experience

## 🏗️ Technical Implementation

### **Smart Caching Strategy:**
```typescript
const weekCache = new Map();
// Structure: weekCache.set(weekNum, { baked: true, workouts: [...], lastAccessed: Date })

// Cache invalidation:
// - User baselines changed
// - Plan template changed
// - Cache expired (>24 hours)
// - Week not in cache
```

### **Database Optimization:**
- **Before**: 95 workouts × complex JSON = Database crash
- **After**: 9 workouts × complex JSON = Database happy
- **Result**: No more Supabase CPU warnings

### **Fallback Removal:**
- **Before**: Silent fallbacks hiding baker failures
- **After**: App crashes if baker fails (forces real data)
- **Benefit**: Truth comes out, no more hidden failures

## 🎯 Performance Targets

### **Loading Times:**
- **Week 1**: Instant (already loaded on plan accept)
- **New weeks**: 200-300ms (first time, needs baking)
- **Cached weeks**: 50ms (instant)
- **Calendar click**: 100ms (basic) + 200ms (full workout if not cached)

### **Database Impact:**
- **CPU usage**: 5-15% (normal) instead of 100% (crash)
- **Insert time**: <1s instead of timeout
- **Reliability**: 100% success instead of 500 errors

## 📋 Implementation Status

### **✅ Completed:**
- Baker token recognition (100% coverage)
- User baseline integration
- Computed data generation
- Fallback removal

### **🔄 In Progress:**
- Week-by-week baking implementation
- Smart caching system
- Progressive loading UI
- Database batching

### **📅 Next Steps:**
1. Implement week-by-week baking
2. Add smart caching
3. Update plan page UI
4. Test with large plans
5. Monitor Supabase CPU

## 🚀 Benefits of New Architecture

### **For Users:**
- Instant plan access (Week 1)
- Progressive discovery (load as needed)
- Reliable performance (no crashes)
- Smooth navigation (cached data)

### **For Database:**
- Manageable load (small batches)
- Consistent performance (no spikes)
- Reliable operation (no timeouts)
- Scalable (works for any plan size)

### **For Development:**
- Debuggable (real error messages)
- Maintainable (clear data flow)
- Testable (isolated week processing)
- Extensible (easy to add features)

## 📚 Related Documentation

- **Baker Implementation**: `src/services/plans/tools/plan_bake_and_compute.ts`
- **Plan Selection**: `src/pages/PlanSelect.tsx`
- **App Context**: `src/contexts/AppContext.tsx`
- **Design Rules**: `APP_BIBLE.md`

---

**Last Updated**: August 26, 2025
**Status**: Development - Baker functional, implementing smart loading
**Next Review**: After week-by-week implementation complete
