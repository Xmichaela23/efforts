# Design Guidelines

## Principles
- **Glassmorphism Dark Theme**: Translucent, blurred elements with subtle borders and shadows create depth on a dark gradient background.
- **Dark Gradient Background**: Monochromatic gradient from `#27272a` → `#18181b` → `#000000` with subtle radial overlays for depth.
- **Friendly summaries**: Never show raw JSON/tokens; resolve paces/power and show ranges + total duration.
- **Deterministic outputs**: Same formulas everywhere (Today, Plan, Detail, Export).
- **High contrast**: White text on dark backgrounds ensures readability.

## Typography & Color

### Typeface
- **Primary**: Inter (system fallback acceptable)
- **Weight**: Light (300) for body text, normal (400) for emphasis, semibold (600) for headings
- **Tracking**: Wide (`tracking-wide`) for buttons and navigation, normal for body text

### Color Palette
- **Background**: Dark gradient (`#27272a` → `#18181b` → `#000000`)
- **Text Primary**: White (`text-white`, `text-foreground`) - `#f5f5f5`
- **Text Secondary**: Light gray (`text-gray-300`, `text-muted-foreground`) - `#a3a3a3`
- **Completed Workouts**: Cyan-600/700 (`bg-cyan-600/20`, `border-cyan-500/40`, `text-cyan-600`)
- **Accents**: Rare and functional (e.g., links, alerts, completed indicators)

## Glassmorphism Styling Patterns

### Cards & Containers
- **Background**: `bg-white/[0.05]` to `bg-white/[0.08]` (translucent white overlay)
- **Backdrop Blur**: `backdrop-blur-lg` or `backdrop-blur-md` for depth
- **Borders**: `border border-white/25` to `border-white/30` (subtle white borders)
- **Shadows**: 
  - Inset: `shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]` for inner glow
  - Outer: `0_4px_12px_rgba(0,0,0,0.2)` for depth
- **Border Radius**: `rounded-2xl` for cards, `rounded-full` for pills/buttons

### Buttons & Interactive Elements
- **Default State**:
  - Background: `bg-white/[0.08]`
  - Border: `border-2 border-white/35`
  - Text: `text-gray-300` or `text-white`
  - Shadow: `shadow-lg`
- **Hover/Active State**:
  - Background: `bg-white/[0.10]` to `bg-white/[0.12]`
  - Border: `border-white/45` to `border-white/50`
  - Text: `text-white`
  - Shadow: `hover:shadow-xl`
- **Transitions**: `transition-all duration-300` for smooth interactions

### Completed Workouts
- **Background**: `bg-cyan-600/20` (translucent cyan)
- **Border**: `border-cyan-500/40` (cyan border)
- **Checkmark**: `text-cyan-600`
- **Shadow**: `shadow-[0_0_0_1px_rgba(6,182,212,0.1)_inset,0_4px_12px_rgba(0,0,0,0.2)]`

### Navigation Buttons
- **Base**: `bg-white/[0.08] backdrop-blur-lg border-2 border-white/35`
- **Active**: `border-white/50 text-white bg-white/[0.12]`
- **Hover**: `hover:bg-white/[0.10] hover:text-white hover:border-white/45`
- **Font**: `font-light tracking-wide`

## Components & Layout

### Page Structure
- **Container**: Edge-to-edge on mobile; generous spacing on desktop
- **Header**: Fixed at top with glassmorphism (`bg-white/[0.03] backdrop-blur-12px`)
- **Content**: Scrollable with proper padding and spacing
- **Bottom Navigation**: Glassmorphism buttons with consistent styling

### Cards & Lists
- **Workout Cards**: 
  - Planned: `bg-white/[0.05] border-white/25`
  - Completed: `bg-cyan-600/20 border-cyan-500/40`
  - Padding: `p-3`
  - Rounded: `rounded-2xl`
- **Action Buttons**: Capsule-style (`rounded-full`) with glassmorphism
- **Spacing**: Generous gaps between elements for clarity

### Prominence & Hierarchy
- Show workout duration and primary target next to the title
- Use white text for primary information, gray for secondary
- Completed workouts use cyan accents for distinction
- Badges: minimal; avoid duplicating information already in the line summary

## Copy & Formatting

### Pacing Format
- Format: "6 × 800 m @ 7:30–8:10 w/ 2:00 rest"
- Use white text for readability

### Units & Conversions
- Swim units respect plan `swim_unit` (yd/m) and convert as needed for export
- Strength: show absolute weights derived from %1RM; include rest where relevant
- Duration: Plain text (not pills) - `text-white font-light`

### Notes
- Concise, user-facing (no internal codes or control tags)
- Use muted text color for less important information

## Navigation & Behavior

### Client-Side Navigation
- Use client-side navigation (`useNavigate`) to avoid full reloads
- Maintain glassmorphism styling across all views

### Content Display
- Keep Today/Calendar light: truncate long details; avoid repetition
- Realtime updates should not flicker—defer global spinners on background refresh
- Use scroll fade overlays (dark gradient) for visual depth

### Interactive Elements
- All buttons use glassmorphism styling
- Hover states provide clear feedback
- Completed workouts are clickable and navigate to details

## Accessibility

### Touch Targets
- Hit targets ≥ 44px on touch surfaces
- Generous padding on interactive elements

### Color Contrast
- White text on dark backgrounds ensures high contrast
- Completed workouts use cyan for distinction (not color-only signaling)
- Maintain sufficient contrast for all text

### Keyboard Navigation
- Keyboard navigable components (focus outlines on interactive elements)
- Focus states should be visible with glassmorphism styling

## Visual Effects

### Gradients & Overlays
- Background: Monochromatic gradient with radial overlays
- Fade overlays: Dark gradient (transparent to 80% black) for scroll indicators
- Glassmorphism: Translucent backgrounds with backdrop blur

### Shadows & Depth
- Inset shadows for inner glow effect
- Outer shadows for depth and elevation
- Layered shadows create glass-like appearance

## Authoring Guidance

### Plans
- Plans are JSON templates; see `PLAN_AUTHORING.md`
- Use `steps_preset` + `export_hints`; normalizer handles friendly text and duration

### Styling Consistency
- Use Tailwind utility classes for glassmorphism patterns
- Maintain consistent opacity levels (`/[0.05]`, `/[0.08]`, `/[0.12]`)
- Border opacity should match background opacity for cohesive look

## Do/Don't

### Do
- ✅ Show resolved targets, ranges, and total duration
- ✅ Use glassmorphism styling for all cards and buttons
- ✅ Apply cyan accents for completed workouts
- ✅ Maintain high contrast with white text on dark backgrounds
- ✅ Use consistent border and shadow patterns
- ✅ Remove bracketed code tokens from user-facing views

### Don't
- ❌ Render raw formulas like `{5k_pace}+0:45/mi`
- ❌ Nest cards or repeat the same labels in multiple places
- ❌ Use solid backgrounds - always use translucent glassmorphism
- ❌ Mix different opacity levels inconsistently
- ❌ Use green for completed workouts (use cyan-600/700)
- ❌ Make duration text look like buttons (use plain white text, not pills)
