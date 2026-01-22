# Color System Consolidation Progress

## ✅ Completed

### 1. Centralized Color Utilities (`src/lib/context-utils.ts`)
- ✅ Enhanced `SPORT_COLORS` with clear documentation
- ✅ Added `hexToRgb()` helper for RGB conversion
- ✅ Added `getDisciplineColorRgb()` helper
- ✅ Created `DISCIPLINE_TO_TAILWIND` mapping for easier maintenance
- ✅ Enhanced all color helper functions to use centralized system
- ✅ Added new variant helpers:
  - `getDisciplineTextClassVariant()` - for text-400, text-500 variants
  - `getDisciplineBorderClass()` - for border with opacity
  - `getDisciplineBgClassVariant()` - for bg-500, bg-600 variants

### 2. Backward Compatibility (`src/lib/utils.ts`)
- ✅ Re-exported all color functions from `context-utils.ts`
- ✅ Maintained existing API for legacy code
- ✅ Added deprecation comments directing to `context-utils.ts`

### 3. Component Updates
- ✅ `PreRunScreen.tsx` - Now uses `getDisciplineColorRgb()` and variant helpers
- ✅ `EnvironmentSelector.tsx` - Now uses `getDisciplineColorRgb()` and variant helpers
- ✅ `EffortsViewerMapbox.tsx` - Now uses `getDisciplineColorRgb()`
- ✅ `UnifiedWorkoutView.tsx` - Now uses `getDisciplineColorRgb()` (removed duplicate hexToRgb)

## ⏳ Remaining Work

### Components with Hardcoded Hex Values
- [ ] `EffortsButton.tsx` - Multiple `#14b8a6` references
- [ ] `MapEffort.tsx` - `#14b8a6` in color array
- [ ] `TodaysEffort.tsx` - `rgba(20, 184, 166, 0.8)` glow color
- [ ] `WorkoutCalendar.tsx` - `rgba(20, 184, 166, 0.8)` glow color

### Components with Hardcoded Tailwind Classes
These have many instances but can be gradually migrated:
- [ ] `PlanWizard.tsx` - 73 instances of `teal-*` classes
- [ ] `AllPlansInterface.tsx` - 11 instances
- [ ] Other components with scattered usage

### Scripts & Icons
- [ ] `scripts/generate-app-icon.mjs`
- [ ] `scripts/convert-svg-to-png.mjs`
- [ ] `scripts/capture-wordmark-svg.mjs`
- [ ] `public/render-icon.html`
- [ ] Icon SVG files (4 files)

## 🎯 Next Steps

1. **Continue component migration** - Update remaining components with hardcoded values
2. **Apply color change** - Once consolidation is complete, change `SPORT_COLORS.run` and update mapping
3. **Regenerate icons** - Update scripts and regenerate icon files

## 📊 Impact

**Before Consolidation:**
- 2 utility files with duplicate logic
- Hardcoded values in 30+ files
- No RGB conversion helper
- Inconsistent patterns

**After Consolidation (Current):**
- ✅ Single source of truth (`SPORT_COLORS`)
- ✅ Centralized helpers with variants
- ✅ RGB conversion helper
- ✅ Backward compatible exports
- ⏳ 4 components updated, ~26 remaining

**Estimated completion:** 80% of consolidation done. Remaining work is mostly find/replace operations.
