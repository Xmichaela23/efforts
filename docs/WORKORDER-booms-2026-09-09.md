# Work order — One line of good news on a done session (2026-09-09)

Michael: "a little achievement dopamine thingy … a ride or run or even a lift, just a little booms." Field
practice: Strava's best efforts and segment records, TrainingPeaks' peak-power and peak-pace flags, Garmin's
personal records. Ours: ONE line on the done session card on Today (and the Week row's drawer), a fact,
shown only when it is true, otherwise nothing. No badge, no trophy, no colour, no streak. Facts only, in
the app's flat voice (docs/COPY-VOICE.md). Strength stays in the hybrid frame (memory
project_efforts_strength_display_frame): form, bar speed, slow gain under cross-stress, never a 1RM PR flag.

## What exists

- Bike power curve: computed per ride (`calculatePowerCurve`, compute-workout-summary path; see
  docs/DESIGN-best-efforts.md table). Best 5 s / 1 min / 5 min / 20 min / 60 min power.
- Segment records (docs/DESIGN-segments.md, D-250): fixed stretches, matched by ordinal.
- Ride card: heart rate at easy power ("lower over time means fitter"), drift vs p107's 5%.
- Run best efforts: spec only (docs/DESIGN-best-efforts.md), needs grade-adjusted pace; NOT built.
- Strength: logged sets with reps and RIR (`exercise_log`), the ME bar ladder (`progression.ts`
  `barLadderStep`: a set earned after two clean sessions at a weight), e1RM trend, session work-set
  count against p86's 6–8 / 14 anchors.
- The done card on Today (`SessionDeck.tsx`) already renders name, numbers, the four tiles, attribution.

## The lines (facts; exact wording pending Michael)

One per session, the first true one in this order. Windows are stated in the line.

Ride:
1. `Best 20-minute power since [month]: [N] W` (also 5 min / 1 min / 5 s, the longest duration that is a
   best wins). Window: since the block started, else this year.
2. `Longest ride since [month]`.
3. `Heart rate [N] bpm lower at easy power than your last eight rides` (the ride card's own read).
4. `Drift under 5 percent for [N] rides running`.

Run (after best efforts is built; until then only 3 and 4):
1. `Fastest [mile / 5K / 10K] since [month]` (grade-adjusted).
2. `Longest run since [month]`.
3. `Heart rate [N] bpm lower at easy pace than your last eight runs`.
4. `Drift under 5 percent for [N] runs running`.

Lift:
1. `A set earned on [lift]: two clean sessions at [weight]` (the ladder's own event, the day it fires).
2. `Every heavy set with reps to spare` (all ME sets logged with RIR ≥ 1).
3. `Speed sets all fast` (every DE set logged; no RIR 0). Wording pending.
4. `Most work sets this block: [N]` (only if still under 14, p86; never celebrate 14+).
5. `[N] sessions on [lift] without a miss` (no failed ME set; window this block).

Never: a 1RM number, "PR", "record", "crushed", exclamation marks, emoji.

## Where

- Done card on Today: under the numbers line, above the tiles, 14 px, white.
- The session drawer: same line under the header.
- Week row: nothing (the row is already full).

## Verification

- Throwaway with a built plan and seeded rides/lifts that hit each line once; a session that hits none
  shows nothing.
- Michael's account untouched; he sees lines on his next done session.
