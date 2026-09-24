# Work order — Outdoor rides: the lap button and the effort finder (2026-09-24)

Michael, 2026-09-24, on a road ride with a 20-minute roll-out before the drills: "1 lap press would take
you to intervals?" — yes — "is this common knowledge in bike land?" — yes — "lets do both."

Companion to `docs/SPEC-outdoor-rides-2026-09-24.md` (rides build for the road by default). That spec
makes the plan road-friendly; this one makes the READ of a road ride correct. Different files; both in
the working tree uncommitted.

## The two builds

**1. The lap button on a ride, the way it already works on a run.**
- One lap press ends the warm-up. On a structured ride with exactly ONE lap, the step walk starts at
  that lap: the warm-up is everything before the press, whatever its length, and the work/recovery
  steps are laid out by time from the press, as the walk lays them today from second zero.
- Laps on every interval hold each one in place. The run-only matching rungs in
  `compute-workout-summary/index.ts` — `laps-matched`, `laps-paired`, `laps-in-order` (lines ~1657–1770,
  all gated `sport === 'run' || sport === 'walk'`) — open to `ride`. Same tolerances shape:
  `ALIGN.tol.ride` (time_work_s 2, time_rec_s 6) is the existing ride tolerance; the paired/in-order
  rungs use the run rungs' own rules (order, `order_lap_floor_frac`, no walk gate on a ride).
- Field practice, cited in the code: TrainingPeaks "end step on lap button" — an open-ended warm-up
  that ends on the press (https://help.trainingpeaks.com/hc/en-us/articles/115003385172-Open-ended-steps-for-Structured-Workouts).

**2. The effort finder — intervals found from power when there are no usable laps.**
- On a structured ride whose laps do not snap and do not anchor (zero laps, or laps that match nothing),
  find the work efforts in the power stream: contiguous stretches at or above the planned work floor for
  the family, of about the planned work length, separated by drops. Count found = count planned (±1) →
  lay the planned work steps on the found stretches, recoveries between them, warm-up before the first,
  cool-down after the last. Otherwise fall back to what happens today (the time walk).
- The floor is the family's own: `FAMILIES[family].workFloorPct` (source-rules.ts — 1.3 sprints,
  1.0 anaerobic, 1.10 VO2, 0.80 sweet spot) × the athlete's FTP, the same number the plan token prints.
  No new threshold number. Anaerobic is `floorOnly` on the page (p237) — the floor IS the prescription.
- Field practice, cited in the code: TrainingPeaks interval detection compares power to the athlete's
  threshold to find work intervals; TrainerRoad's interval search finds intervals on rides where the
  athlete forgot to lap (https://www.cyclingnews.com/features/trainerroad/). Anything ours (the ±1 count
  tolerance, the minimum stretch length, how a stretch's edges are cut) is marked OURS in the code and
  gets one ledger row in `docs/STATE-SOURCES.md`.
- The surge/crash counter in `analyze-cycling-workout/index.ts` ~425 (20% sample-to-sample, OURS) is a
  steadiness statistic, not an interval finder. Leave it.

## Order of precedence on a structured ride, after this

1. Laps snap to steps (`trySnapToLaps`, existing).
2. Laps match / pair / in-order (run rungs, now on rides).
3. One lap → anchors the walk (new).
4. No usable laps → effort finder (new); found count fits → laid on the efforts.
5. Otherwise → the time walk from second zero (existing), and the mismatch detector as today.

The `alignment_mode` / `snapMode` string says which rung fired. The analyzer
(`analyze-cycling-workout`) reads `computed.intervals` and needs no change unless a rung's output shape
differs — it must not.

## Rules
- Never touch the run path's behaviour. Every run test stays byte-identical.
- No new copy. No note ever says "lap" or "detected". The Performance rows print as they do today.
- Every number has a source or an OURS marker + ledger row.
- Never `git add -A`, never commit; leave the working tree for the PM.
- Read `docs/TRUTH-MAP.md` and the comments at the top of the step walk (~2040–2100) and the mismatch
  detector (~1895) before editing; they carry rulings (cut-short sessions, walk end at last movement).

## Verify — fixtures, three back-to-back runs each
Synthetic ride streams (1 Hz power, speed, distance), FTP 250, plan = the One-to-One Repeats L1 ride
as the composer builds it (12:30 warm-up, 10 × 1:00 @ 110% / 1:00 @ 50%, cool-down):
- A. 20-min warm-up, no laps, intervals ridden on the clock from 20:00 → effort finder lays 10 work rows
  on 20:00–39:00; every work row in range; today's walk would have put rows 1–4 on the warm-up.
- B. 20-min warm-up, ONE lap at 20:00, intervals on the clock → anchored walk; same rows as A.
- C. 20-min warm-up, ONE lap at 20:00, a 90-s stop after interval 4 → anchored walk drifts from row 5
  (expected, documented); the effort finder is NOT invoked when a lap anchored. State the drift in the
  test name.
- D. 22 laps, each within tolerance → `trySnapToLaps` as today; unchanged output.
- E. 22 laps, work laps 57–59 s (the pre-493fecc7 case on a ride) → `laps-in-order` on a ride.
- F. No laps, athlete did 6 efforts of the 10 → finder lays 6, rows 7–10 `not_done`.
- G. No laps, a steady 60-min endurance ride against a structured plan → finder finds nothing → falls to
  today's path; the mismatch detector's verdict unchanged.
- H. Every existing compute-workout-summary and analyze-cycling-workout test green; the run fixtures
  byte-identical (diff the computed JSON).
Also: the real completed rides on the throwaway accounts the sweep uses, re-computed before/after,
with a table of alignment_mode before → after per ride. No production data.

## Report
Files changed; the precedence as built; the before/after table; every OURS number and its ledger row;
anything above that did not survive contact with the code, and what you did instead.
