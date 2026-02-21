# Light Yellow Run Color - Preview

## ✅ Yes, it can be light yellow!

The consolidated system makes this **extremely easy**. Here's what would change:

## Light Yellow Options

### Tailwind Yellow Shades (Light to Medium)
- **yellow-300**: `#FDE047` - Bright light yellow (very light)
- **yellow-400**: `#FACC15` - Light yellow (recommended for visibility)
- **yellow-500**: `#EAB308` - Medium yellow (good balance)
- **yellow-200**: `#FEF08A` - Very light yellow (might be too light on white)

### Custom Light Yellow Options
- `#FFEB3B` - Material Design light yellow
- `#FFF176` - Light yellow
- `#FFD54F` - Amber yellow (warmer)

## Recommended: `#FACC15` (yellow-400)

This is a good balance - light enough to be "light yellow" but visible on both light and dark backgrounds.

## What Would Change (Super Easy!)

### 1. Update Color Constant (1 line)
In `src/lib/context-utils.ts`:
```typescript
export const SPORT_COLORS = {
  run: '#FACC15',      // yellow-400 ← CHANGE THIS
  running: '#FACC15',  // alias
  // ...
}
```

### 2. Update Tailwind Mapping (1 line)
In the same file:
```typescript
const DISCIPLINE_TO_TAILWIND: Record<string, string> = {
  run: 'yellow',  // ← CHANGE from 'teal' to 'yellow'
  running: 'yellow',
  walk: 'yellow',
  // ...
}
```

### 3. That's It! 🎉

All components will automatically:
- Use the new yellow color
- Generate correct RGB values (`250, 204, 21`)
- Use correct Tailwind classes (`text-yellow-400`, `bg-yellow-500`, etc.)
- Apply correct glow colors
- Update all visual elements

## Visual Impact

With yellow-400 (`#FACC15`):
- **RGB**: `250, 204, 21`
- **Tailwind classes**: `yellow-400`, `yellow-500`, `yellow-600` variants
- **Glow effects**: Will automatically use yellow
- **All components**: Automatically updated

## Comparison

| Current (Teal) | Proposed (Yellow) |
|----------------|-------------------|
| `#14b8a6` | `#FACC15` |
| `rgb(20, 184, 166)` | `rgb(250, 204, 21)` |
| `teal-500` classes | `yellow-400` classes |

## Notes

- Yellow works well on dark backgrounds (your app's dark theme)
- Might need to adjust contrast in some places
- Icon regeneration would use the new yellow color
- All existing components will work automatically

## Ready to Apply?

Just say the word and I'll update:
- `SPORT_COLORS.run` to `#FACC15` (or your preferred shade)
- `DISCIPLINE_TO_TAILWIND.run` to `'yellow'`

Everything else happens automatically! 🚀
