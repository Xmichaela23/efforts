# Dashboard layout audit

How the home dashboard is built from root to workload section, and where height/scroll can break.

---

## 1. Entry and root

- **Index** → **AuthWrapper** → **AppLayout** (no extra wrappers).
- **AppLayout** root:
  ```html
  <div class="mobile-app-container synth-texture">
  ```
- **CSS (index.css):**
  - `.mobile-app-container`: `position: relative`, `height: 100vh` / `100dvh`, `overflow: hidden`.
  - No `display: flex` here; it’s just a sized box. Header and main are fixed, so they don’t affect this div’s flow.

So the “page” root is a full-viewport box with `overflow: hidden`. It does not define the flex chain; it just contains fixed children.

---

## 2. Siblings inside `.mobile-app-container`

1. **MobileHeader** – `position: fixed`, `top: 0`, height `calc(var(--header-h) + env(safe-area-inset-top))`. Out of flow.
2. **UnifiedWorkoutView** – conditional; when shown it’s outside main. Out of flow when present.
3. **`<main class="mobile-main-content">`** – `position: fixed`, `top/left/right/bottom: 0`, so **height = viewport**. This is the only box that actually gets “remaining” height; padding then defines the content area.
4. **Tab bar** – `position: fixed`, `bottom: 0`, height `calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--tabbar-extra))`. Out of flow.

So the only in-viewport “content” height is defined by **main**.

---

## 3. Main content: `.mobile-main-content`

- **CSS:**
  - `position: fixed; top: 0; left: 0; right: 0; bottom: 0` → height = viewport.
  - `display: flex; flex-direction: column`.
  - `overflow: hidden` (so no page scroll from this block).
  - `padding-top: calc(var(--header-h) + env(safe-area-inset-top))`.
  - `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--tabbar-extra))`.

So:

- **Content height** = viewport − top padding − bottom padding. That’s the height available for the single flex child.
- **Single flex child:** the **PullToRefresh** wrapper div.

---

## 4. Flex chain inside main (dashboard path)

When **home** and **no** plan builder / logger / etc.:

```
main.mobile-main-content                    ← flex column, overflow hidden, padding
  └ PullToRefresh div                       ← flex: 1, minHeight: 0, flex column
      └ div.w-full.flex-1.min-h-0.flex.flex-col.px-2   ← flex-1, min-h-0
          └ div.w-full.flex-1.min-h-0.flex.flex-col    ← flex-1, min-h-0
              └ div (home wrapper)                      ← flex: 1, minHeight: 0, flex column
                  └ div (main card)                     ← flex: 1, minHeight: 0, flex column
                      ├ div (TodaysEffort wrapper)      ← height: var(--todays-h), flexShrink: 0
                      ├ div (divider)                  ← height: 1px, margin 8px 0
                      └ div (calendar wrapper)         ← flex: 1, minHeight: 0, flex column
                          └ WorkoutCalendar (root)     ← flex-1, flex flex-col, min-h-0
```

Every level that’s supposed to “fill remaining space” has **flex: 1** (or Tailwind `flex-1`) and **minHeight: 0** (or `min-h-0`). That’s required so flex doesn’t use content height as a minimum and block shrinking.

---

## 5. WorkoutCalendar internal structure

WorkoutCalendar root:

- **Class:** `w-full flex-1 flex flex-col touch-pan-y bg-transparent relative min-h-0`
- So: flex child that grows (`flex-1`), flex column container, can shrink (`min-h-0`).

Children (in order):

1. **Decorative span** – `position: absolute`, so not in flex flow.
2. **Week nav div** – no `flex: 1`; height = content.
3. **Grid div** – `display: grid`, `gridTemplateRows: repeat(7, auto)`, `flexShrink: 0`. Height = content (7 rows).
4. **Workload wrapper** – `flex: 1`, `minHeight: 0`, `display: flex`, `flexDirection: column`.

So inside WorkoutCalendar:

- Week nav and grid are “content-sized” and don’t grow (`flexShrink: 0` on grid).
- Workload wrapper is the only flex-grow child and should get **all remaining vertical space** in the WorkoutCalendar root.

Workload content:

- Inner div: `height: 100%`, `flex flex-col justify-end`, plus a `flex-1` spacer and the Total Workload + metrics block. So the block is pinned to the bottom of the workload area; the spacer fills the rest.

---

## 6. Where height is defined (summary)

| Level | Height / behavior |
|-------|--------------------|
| Viewport | Browser |
| main | `top:0; bottom:0` → viewport height |
| main content area | viewport − main’s padding (header + tabbar + safe areas) |
| PullToRefresh → … → main card | All `flex: 1` + `minHeight: 0` → share that content height |
| TodaysEffort wrapper | Fixed: `var(--todays-h)` = `clamp(10rem, 20vh, 14rem)` (overridden in media queries) |
| Divider | 1px + 8px margin top/bottom |
| Calendar wrapper | Rest of card height |
| WorkoutCalendar root | Fills calendar wrapper (only child, flex-1) |
| Week nav + grid | Content height; grid has `flexShrink: 0` |
| Workload wrapper | Rest of WorkoutCalendar height (`flex: 1`) |

So in principle the workload section **is** the “flex child that fills the rest” and should stretch to the bottom of the card.

---

## 7. What can go wrong

### 7.1 Main not actually constraining (no overflow: hidden)

If `main` didn’t have `overflow: hidden`, and some descendant grew past the viewport, the **document** could scroll. We’ve added `overflow: hidden` on main, so this should be fixed.

### 7.2 Missing minHeight: 0 in the chain

Any flex child that’s supposed to shrink but has default `min-height: auto` can refuse to shrink below its content height and push the layout (or cause overflow). Every “fill remaining” div in the chain above has `minHeight: 0` / `min-h-0` in the current code.

### 7.3 Calendar (week nav + grid) too tall

WorkoutCalendar root height = “card height minus Today and divider”. If **week nav + grid** height is ≥ that, then:

- Remaining space for the workload wrapper = 0 (or negative, clamped to 0).
- Workload wrapper gets 0 height; its content can still be visible if overflow isn’t hidden, but the “stretch” area is gone.

So the gap you see could be:

- Workload section only getting **content height** (no extra stretch), and
- The “gap” below = main’s bottom padding + tabbar, with the card not extending into it because the **card** (or something above the workload) is not actually getting the full content height.

That usually means either:

- The flex chain is still broken somewhere (one element not getting a definite height), or
- The calendar block (nav + grid) is so tall it leaves no room for the workload wrapper to grow.

### 7.4 TodaysEffort and scroll

TodaysEffort sits in a wrapper with fixed `height: var(--todays-h)` and has an inner div with `overflowY: auto`. So Today can scroll internally; that doesn’t change the height of the dashboard card.

### 7.5 Position/stacking

Header and tab bar are `position: fixed` and sit on top of main. Main’s padding is there so content isn’t hidden. No extra wrapper is needed for that; the important thing is that main’s content height (after padding) is exactly the space we’re dividing with flex.

---

## 8. Recommended checks (without code changes)

1. **In DevTools, on the live dashboard:**
   - Select `main.mobile-main-content` and check **computed** height. It should be viewport height (e.g. ~844px on a tall phone).
   - Check **computed** padding-top and padding-bottom; subtract from height to get “content height”.
   - On the PullToRefresh div (first child of main): computed height should equal that content height.
   - Walk down: each `flex: 1` div should have a computed height that fills its parent until you reach the main card, then the calendar wrapper, then WorkoutCalendar root, then the workload wrapper.
   - On the workload wrapper: computed height should be “WorkoutCalendar root height − week nav height − grid height”. If that’s 0 or tiny, the calendar block is consuming everything.

2. **If the workload wrapper has a reasonable height but content doesn’t fill it:**
   - The inner workload div has `height: 100%` and a `flex-1` spacer. So the block is at the bottom. If the wrapper is tall, the spacer should be tall; check that the inner div’s computed height equals the wrapper.

3. **If the workload wrapper height is 0 or very small:**
   - Measure week nav + grid height. If their sum is close to or larger than the WorkoutCalendar root height, the layout is correct but there’s no “remaining” space. Fix would be to give the **scrollable** region a max-height (e.g. week nav + grid in a scroll container with `flex: 1; min-height: 0; overflow: auto`) so the workload wrapper is guaranteed some space.

4. **If main’s computed height is wrong (e.g. not viewport):**
   - Check that no other global style overrides `position`/`top`/`bottom` for `.mobile-main-content`, and that the viewport (e.g. `100dvh`) is what you expect on that device.

---

## 9. Summary

- **Designed behavior:** Main is fixed and full-viewport with padding; one flex child (PullToRefresh) gets the content height; a long flex chain with `flex: 1` and `minHeight: 0` passes that height down to the main card; inside the card, Today is fixed height, the rest goes to the calendar wrapper; WorkoutCalendar fills that; inside it, week nav + grid are content-sized and the workload wrapper has `flex: 1` so it should stretch to the bottom of the card.
- **Most likely causes of “workload doesn’t stretch”:** (1) One level in the chain missing a definite height (often due to missing `minHeight: 0` or a non-flex parent), or (2) week nav + grid taller than the space left for WorkoutCalendar, so the workload wrapper gets no space.
- **Next step:** Use the DevTools checks above on the real dashboard to see which of these is happening; then either fix the broken link in the chain or add a scroll cap (max-height) on the calendar so the workload section always gets some stretch space.
