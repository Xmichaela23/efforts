# HANDOFF — "Your week" screen UX pass (Strong Focus intake, step 7 of 8)

2026-08-25. Michael audited the screen from a screenshot and approved the fix direction below.
This is a UX/optics pass on one screen. Scope is the screen; the solver is not the job.

## Where it lives

- `src/components/NonRaceBuilder.tsx` (~6,950 lines) — the whole wizard. "Your week" step:
  title at :4183 and :5452, subtitle at :5458.
- Day-pill role codes (H / LR / LB / E / B / S) derived around :2640–2650; the ×2 badge at :538–540.
- Legend line ("H hard · LR/LB long · … · ×2 = two sessions") at :6332.
- "No scheduling conflicts" banner at :6350.
- "High intensity days" summary row label at :2257. Hard days are chosen on a separate earlier
  'hardday' step (see :5452, :3057, :5049) — this row on "Your week" is a summary of that choice.
- `src/components/EnduranceWeekCard.tsx` (500 lines) — the "Long ride" card with the day pills.
- Engine (context only): `_shared/week-model/` (model.ts = law, resolve.ts = score),
  `shared/strength-system/place-week.ts` (anchors). ⚠️ week-model runs ON THE CLIENT via the
  `@shared` Vite alias — the wizard runs the real solver, so any change to how the wizard calls
  it moves the built plan too. This pass should not touch the engine.

## Task 0 — trace the contradiction BEFORE any layout work

In the screenshot the "High intensity days" row says hard run **Fri**, hard ride **Tue** — but the
placed week has the hard run **Mon** and the hard ride **Wed**, and the banner says "No scheduling
conflicts."

Hypothesis (not a finding): the row renders `state.hardDays` (the athlete's *choice* from the
'hardday' step) while the day list renders the *solved* week, and the solver moved the sessions.
Trace it: does `resolve()` / `place-week` treat hardDays as a hard constraint or a preference?
Then pick the fix by what the trace shows:

- If the engine can move a chosen hard day: the row must say so, inline, at the moment it happens
  ("hard run moved to Mon — Fri conflicts with lower lifting" — flat, fact-first). The
  "No scheduling conflicts" banner must not render as-is when a choice was overridden.
- If the engine must honor the choice and didn't: that's a solver bug — STOP, report to Michael,
  do not fix the engine inside this UX pass.

The answer decides whether the high-intensity row is an input control or a result line, which
shapes the layout below. Do Task 0 first.

## The restructure — question zone / answer zone

The screen currently fuses input and summary: the day pills are simultaneously the picker (tap to
move the long ride) and a report of the finished week (state codes on every pill). Split it:

**Question zone (top):** the two or three actual choices — long ride day, long run day if present,
hard days (per Task 0). Plain selectors: seven day chips, no state codes on them, one clearly
selected. A chip is either pickable or disabled-with-reason; nothing else rides on it.

**Answer zone (bottom):** ONE representation of the resulting week — the existing worded day list
(Mon "Test: Upper 45m · Hard Run 41m" …). The coded pill strip and the legend at :6332 disappear
entirely. A legend is a symptom; if the answer zone needs decoding, reword the answer zone.

Feedback placement: the conflict banner stays pinned with the selectors (feedback lands where the
choice was made), not down with the preview.

## Punch list (from the audit)

1. Kill the letter codes + legend (recognition over recall; no mainstream training app puts
   single-letter codes on a week strip). Words or icon + sport color in whatever chips remain.
2. Make pickable things look pickable — the current selected-state cue is a faint outline only.
3. "Run · Fri · Ride · Tue" is unparseable — sport and day alternate with the same separator.
   → "Run Fri · Ride Tue". Also make it visually clear whether the row is editable (it links back
   to the 'hardday' step or it doesn't — pick one and show it).
4. Sat row is cut off behind the sticky Continue button — bottom padding on the list equal to the
   button height.
5. Exercise-name capitalization is inconsistent ("Bench Press · … · tricep extensions · glute
   bridge") — one convention.
6. "DE: Upper" — dynamic-effort is a Westside term most Strong/Hevy lifters won't know.
   "Speed: Upper" or spell it out. Bro-friendly rule applies.
7. Subtitle "Your days. The lifting is placed around them." undersells the screen — it places
   endurance anchors too. Reword once the zones exist.

## Respect these recent calls — do not relitigate

- ×2 badge wording was Michael's own call, 2026-08-24 (comment at :538). If the coded pills die
  wholesale that's fine, but don't redesign ×2 in isolation.
- Strength got its own card 2026-08-06 (:1069, :4338) — keep that separation.
- Comment at :432 says "the dimming is the distinguisher, not a colour legend" — prior intent that
  agrees with killing the legend; extend it, don't fight it.
- `docs/CONCEPT-plan-your-week.md` is the *future* drag-board concept (scoping only, unbuilt).
  This pass is not that. Don't start it.

## Constraints

- Copy voice: `docs/COPY-VOICE.md` — fact-first, no imperatives, no encouragement, banned-word
  check. No emojis anywhere.
- Client-only change. No engine edits, no new deps unless the chip selector genuinely needs one
  (it shouldn't).
- Edits are free; commit/push/deploy wait for Michael.

## Acceptance

Optics pass = screenshot round. Build it, run the dev preview, screenshot the rebuilt step for
Michael. Do not run fixtures or generators for this without asking — the verification is visual.
Michael reviews the screenshot; iterate from his notes.
