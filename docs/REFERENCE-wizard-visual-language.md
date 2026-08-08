# Reference — wizard visual language ("digital galaxy") + how to apply it

**What this is:** the implementation recipe for the galaxy/gold look applied to the marathon flow (2026-08-07), so it can be applied to the other `NonRaceBuilder` paths (Strong Focus first) consistently. Aesthetic intent lives in memory `project_efforts_visual_language.md`; **this doc is the how, not the why.**

---

## Where the look lives (3 places — do not scatter it further)

1. **`src/components/wizard/StepLayout.tsx`** — the frame every step renders in. Owns:
   - `accent?: string` prop → `const A = \`var(--wiz-accent-rgb, ${UNIVERSAL_RGB})\`` (`UNIVERSAL_RGB = '236, 233, 227'`, the off-white fallback).
   - Instrument-key CTA (border / backlight / inner-highlight inline style from `A`), progress bar accent, and the commit-step shimmer (`.wizard-key-shine`).
2. **`src/index.css`** — `.wizard-galaxy` + `::before` (nebula / light / stars) + `::after` (grain) = the deep-space layer. Plus `.wizard-key-shine` / `@keyframes wizardKeySweep`, and the nav-lock (`body.wizard-active .mobile-tabbar { display:none }` + `--tabbar-h:0px`).
3. **`--wiz-accent-rgb` CSS var** — set on the wizard root in `NonRaceBuilder.tsx`:
   ```
   const wizAccent = state.discipline ?? (state.goal === 'marathon' ? 'run' : undefined)
   style={wizAccent ? { ['--wiz-accent-rgb']: getDisciplineColorRgb(wizAccent) } : undefined}
   ```
   The accent is **discipline-driven** — it reads `SPORT_COLORS` (`src/lib/context-utils.ts`) via `getDisciplineColorRgb()`. **Never hand-pick a hex.** run=gold, strength=amber `#FF8C42`, bike=green, swim=blue.

Chrome that tints uses the var directly in Tailwind arbitrary values, e.g. `rgb(var(--wiz-accent-rgb,236,233,227))`.

---

## Strong Focus — what's already on it vs what needs a pass

Strong Focus is the **Train → Strength branch of `NonRaceBuilder`** — same builder, same `StepLayout`. So:

**Inherited free (already live):** galaxy background, amber instrument CTA, progress bar, lowercase "efforts", phosphor plate styling. Amber comes automatically because `state.discipline === 'strength'` drives the accent var.

**Still needs the pass (~3 screens — the real work):**
- **Tier / "which strength block" picker** — option-card refinement, spacing, copy.
- **Strength intent screen** — the "Keep it heavy / Keep it together" cards got heavy-first reorder + rename on marathon; confirm the strength-path rendering matches.
- **Strength scheduler card** — the strength path uses a *different, single scheduler* (see `NonRaceBuilder.tsx` ~line 615 "ONE SCHEDULER ON THE STRENGTH PATH"), NOT the marathon "Your week" anchors card. It needs its own look pass; do **not** paste the marathon week card onto it.

**Accent-timing gotcha:** early steps (entry / train card) render before `state.discipline` is 'strength', so they show the off-white universal fallback until the discipline is set. Marathon papered over this with the `goal === 'marathon' ? 'run'` fallback. If amber-from-step-1 is wanted on the strength path, add the equivalent early seed; otherwise it snaps to amber once strength is chosen (acceptable).

---

## Do / Don't
- **Do** reuse `StepLayout`'s `accent` + the CSS var — never restyle a CTA inline per screen.
- **Do** pull colour from `SPORT_COLORS` via `getDisciplineColorRgb`.
- **Don't** hand-pick a hex, and **don't** copy the marathon "Your week" card onto the strength scheduler — it's a different scheduler.
- **Don't** touch this from a server/terminal stage — this is client-only, owned by the wizard chat.
