# WORK ORDER — Accessory rep-total: blank sets + a counting-down total (2026-08-11)

**Roles:** architect = Michael; PM = this doc; engineer = terminal, device-verified.
**Surface:** `src/components/StrengthLogger.tsx`. Client-only; no edge functions, no migration.

## The idea (Michael, 2026-08-11)

Assistance work in 5/3/1 is a **rep TOTAL**, not fixed sets — pick a number (25/50/100) and hit it
across as many sets as you need, by feel, never to failure (Wendler, 5/3/1 Forever assistance
guidelines). The logger already stores this correctly: `exercise.target_reps` is a string like
`"50 total"` (see the model note at `StrengthLogger.tsx:1611` — "a movement and a total, never a
weight"; some assistance is loaded, e.g. Romanian Deadlift, so a weight CAN still be present).

Two changes so the screen matches how it's actually trained:

### 1. Accessory sets START BLANK (don't prefill the total into set 1)

Today set 1 prefills reps = the total (50), which reads as "one set of 50." For an assistance
rep-total, the **reps** should start empty so the athlete logs each chunk (15 / 15 / 12 / 8…).
- In `prePopulatedExercises` (`~:2650`) AND the resume/second load path (`~:2899`): when the exercise
  is assistance (`/total/i.test(exercise.target_reps)`), the initial set **reps = undefined** (blank).
  Keep the weight prefill for LOADED assistance (RDL) — only the reps start blank.
- Draft restore must not re-inject the total. Start with **one** blank set; the athlete taps Add Set.

### 2. A rep-total that COUNTS DOWN above the sets

Put the number up top of the accessory's sets and decrement it as sets complete.
- Parse the total: `const total = parseInt(String(exercise.target_reps))` when it matches `/total/i`.
- `remaining = total − sum(reps of COMPLETED sets)` (only `set.completed` sets count).
- Render it under the exercise title, where the bar-speed cue sits on main lifts (same vertical line,
  for symmetry): e.g. **"32 of 50 reps left"**, and **"50 reps done"** (or a checkmark tone) once
  `remaining <= 0`. Amber, updates live as each set's check flips.
- This REPLACES the per-set "target 50 total" detail-line label for assistance (the countdown is the
  better version of it).

### 3. Wendler's wording for break-out + feel

One line, under the title beside/near the countdown, describing how to break it out and how it should
feel — **Wendler's assistance instruction**, not invented: split into as many sets as needed, leave a
rep or two, never to failure. Proposed:

> **Break it into as many sets as you need. Leave a rep or two — never to failure.**

Source it to the 5/3/1 assistance guidance (same provenance rule as `strength-focus-copy.ts` /
`bar-speed-copy.test.ts`); if it lands in `BAR_SPEED_COPY`-style copy, add a pin.

## ⛔ Must not break

- **Main lifts unchanged.** All of this gates on the assistance signal (`/total/` in `target_reps`);
  a main 5/3/1 lift has a number, never a total, so it's untouched — its AMRAP/RIR/e1RM path is
  exactly as shipped.
- **Loaded assistance keeps its weight** (RDL shows 75 lb) — only reps start blank; the countdown is
  on reps.
- e1RM / RIR / execution wiring (`updateSet`, `handleSetComplete`) untouched — reps still flow through
  them; blank just means "athlete enters it."
- The `/total/` assistance detection already exists (`:1646`); reuse it, don't mint a second.

## Verify (device)

A real accessory session: Romanian Deadlift (loaded, rep-total) and Sit Up (bodyweight, rep-total).
Confirm sets open blank, the countdown starts at the total and drops by each completed set's reps,
hits done at/under zero, the Wendler line reads right, and a main lift in the same session is
visually and behaviorally unchanged.
