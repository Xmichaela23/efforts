# Run Color Reference Audit

## Current Run Color
- **Hex**: `#14b8a6` (teal-500)
- **RGB**: `20,184,166` or `rgb(20,184,166)`
- **Tailwind**: `teal-500`, `teal-400`, `teal-600` variants

## Difficulty Assessment: **MODERATE** ⚠️

The run color is referenced in multiple places with varying levels of centralization. Changing it would require updates across:
- ✅ **Easy**: Central color definitions (2 files)
- ⚠️ **Moderate**: Hardcoded hex/RGB values (6+ files)
- ⚠️ **Moderate**: Tailwind classes (13+ files, ~109 instances)
- ⚠️ **Hard**: Icon files (4 SVG files)
- ⚠️ **Hard**: Build/script files (4 files)

---

## 1. Central Color Definitions (EASY - Change Here First) ✅

### `src/lib/context-utils.ts`
**Lines 21-23**: Main definition
```typescript
export const SPORT_COLORS = {
  run: '#14b8a6',      // teal-500
  running: '#14b8a6',  // alias
  ...
}
```
**Impact**: This is the primary source. Many components import from here.

### `src/lib/utils.ts`
**Lines 20, 25**: Legacy function (still used)
```typescript
if (t === 'run' || t === 'running') return '#14b8a6'; // teal-500
if (t === 'walk') return '#14b8a6'; // teal-500 (same as run)
```
**Impact**: Used by older components. Should be updated to use `SPORT_COLORS` from context-utils.

---

## 2. Hardcoded Hex Values (MODERATE) ⚠️

### `src/components/EffortsButton.tsx`
- **Line 535**: `const accentColor = '#14b8a6'; // teal-500`
- **Line 725**: `run: '#14b8a6', // teal` (in colorDefinitions)
- **Line 872**: `fill="#14b8a6"` (SVG)
- **Line 987**: `stopColor="#14b8a6"` (gradient)
- **Line 994**: `stopColor="#14b8a6"` (gradient)
- **Line 1085**: `fill="#14b8a6"` (SVG)
- **Note**: Line 248 uses `'#00FFC8'` (different bright cyan for wordmark gradient)

### `src/components/EffortsViewerMapbox.tsx`
- **Line 1786**: Comment `// Run color: #14b8a6 (teal-500) = rgb(20,184,166)`
- **Line 1831**: `'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)'` (teal-600 to teal-500)

### `src/components/MapEffort.tsx`
- **Line 371**: `'#14b8a6'` in color array

### `scripts/generate-app-icon.mjs`
- **Line 18**: `run: '#14b8a6', // teal`

### `scripts/convert-svg-to-png.mjs`
- **Line 49**: `background: #14b8a6;`
- **Line 86**: `run: '#14b8a6',`

### `scripts/capture-wordmark-svg.mjs`
- **Line 40**: `run: '#14b8a6',`

### `public/render-icon.html`
- **Line 30**: `run: '#14b8a6',`

---

## 3. Hardcoded RGB Values (MODERATE) ⚠️

### `src/components/EffortsViewerMapbox.tsx`
- **Line 1787**: `const primaryColorRgb = isRunOrWalk ? '20,184,166' : '34,197,94';`
- **Line 1786**: Comment with RGB conversion

### `src/components/workout-execution/PreRunScreen.tsx`
- **Line 171**: Comment `// Discipline colors - teal for run (20,184,166), green for ride (22,163,74)`
- **Line 172**: `const rgb = isRun ? '20,184,166' : '22,163,74';`

### `src/components/workout-execution/EnvironmentSelector.tsx`
- **Line 24**: Comment `// Discipline colors - teal for run (20,184,166), green for ride (22,163,74)`
- **Line 25**: `const rgb = isRun ? '20,184,166' : '22,163,74';`

### `src/components/UnifiedWorkoutView.tsx`
- **Line 775**: Fallback `return '20,184,166'; // fallback to teal`

### `src/components/TodaysEffort.tsx`
- **Line 1089**: `glowColor = 'rgba(20, 184, 166, 0.8)'; // teal-500`

### `src/components/WorkoutCalendar.tsx`
- **Line 896**: `glowColor = 'rgba(20, 184, 166, 0.8)'; // teal-500`

---

## 4. Tailwind Classes (MODERATE - Many Instances) ⚠️

**Total**: ~109 instances across 13 files

### Files with Tailwind teal classes:
1. `src/components/TodaysEffort.tsx` - 1 instance
2. `src/components/AllPlansInterface.tsx` - 11 instances
3. `src/components/PlanWizard.tsx` - 73 instances (most usage!)
4. `src/lib/context-utils.ts` - 2 instances (helper functions)
5. `src/components/EffortsButton.tsx` - 1 instance
6. `src/components/WorkloadAdmin.tsx` - 3 instances
7. `src/components/EffortsButtonDemo.tsx` - 1 instance
8. `src/lib/utils.ts` - 3 instances (helper functions)
9. `src/components/workout-execution/PreRunScreen.tsx` - 1 instance
10. `src/components/workout-execution/EnvironmentSelector.tsx` - 1 instance
11. `src/components/context/BlockSummaryTab.tsx` - 7 instances
12. `src/components/TrainingBaselines.tsx` - 4 instances
13. `CONTEXT_SCREEN_IMPLEMENTATION.md` - 1 instance (documentation)

### Common Tailwind patterns:
- `text-teal-400`, `text-teal-500`
- `bg-teal-500`, `bg-teal-500/20`, `bg-teal-500/30`
- `border-teal-500`, `border-teal-500/30`, `border-teal-500/50`
- `hover:border-teal-400`, `hover:bg-teal-500/10`
- `ring-teal-500`, `focus:ring-teal-500/50`
- `from-teal-500`, `to-teal-500`, `via-teal-500` (gradients)

**Note**: If changing to a non-Tailwind color, you'd need to either:
- Use arbitrary values like `text-[#NEWCOLOR]`
- Extend Tailwind config with custom color
- Replace with inline styles using the new color

---

## 5. Icon Files (HARD - Requires Regeneration) ⚠️

### SVG Icon Files (4 files):
- `public/icons/icon-180.svg` - Line 11, 45
- `public/icons/icon-1024.svg` - Line 11, 45
- `public/icons/icon-512.svg` - Line 11, 45
- `public/icons/icon-192.svg` - Line 11, 45

**Impact**: These are app icons. Changing requires regenerating icons or manually editing SVGs.

---

## 6. Components Using SPORT_COLORS.run (EASY - Auto-update) ✅

These components import from `context-utils.ts`, so they'll automatically use the new color:

- `src/components/PostWorkoutFeedback.tsx` - Line 90
- `src/components/Gear.tsx` - Lines 277, 311, 312, 313, 322
- `src/components/TrainingBaselines.tsx` - Lines 561, 831, 1495

---

## 7. Special Cases

### `src/components/EffortsButton.tsx` - Wordmark Gradient
**Line 248**: Uses `'#00FFC8'` (bright cyan) instead of `#14b8a6` for the wordmark gradient ring. This is intentionally different for visual effect.

### Walk Color
Walk uses the same color as run (`#14b8a6`). If you change run color, consider if walk should change too.

---

## Recommended Change Strategy

### Phase 1: Update Central Definitions (EASY)
1. Update `SPORT_COLORS.run` in `src/lib/context-utils.ts`
2. Update `getDisciplineColor()` in `src/lib/utils.ts` to use `SPORT_COLORS` or update hardcoded value

### Phase 2: Update Hardcoded Values (MODERATE)
1. Search and replace `#14b8a6` → new color in all component files
2. Convert new hex to RGB and replace `20,184,166` → new RGB
3. Update helper functions that return hardcoded values

### Phase 3: Update Tailwind Classes (MODERATE-HARD)
**Option A**: If new color is a Tailwind color:
- Find/replace `teal-500` → `newcolor-500` (and variants)
- Update helper functions in `context-utils.ts` and `utils.ts`

**Option B**: If new color is custom:
- Replace Tailwind classes with inline styles using `SPORT_COLORS.run`
- Or extend Tailwind config with custom color
- Or use arbitrary values like `text-[#NEWCOLOR]`

### Phase 4: Update Icons & Scripts (HARD)
1. Regenerate icons using updated color in scripts
2. Update script files that hardcode the color
3. Test icon generation

### Phase 5: Testing
- Check all workout displays (run/walk)
- Verify calendar, charts, maps
- Test workout execution screens
- Verify icons display correctly

---

## Summary

**Total Files to Update**: ~25-30 files
**Estimated Effort**: 2-4 hours depending on new color choice

**Difficulty Factors**:
- ✅ Good centralization in `SPORT_COLORS`
- ⚠️ Many hardcoded values in components
- ⚠️ Heavy Tailwind usage (109 instances)
- ⚠️ Icon regeneration required
- ⚠️ Script files need updates

**Easiest Path**: Choose a Tailwind color (e.g., `blue-500`, `cyan-500`) to minimize Tailwind class replacements.
