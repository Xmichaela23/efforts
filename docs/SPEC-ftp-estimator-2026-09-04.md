# SPEC — Compound FTP estimator (bike)

**Status:** specified, not built. One terminal session.
**Date:** 2026-09-04

---

## The problem

The learned bike FTP is `95% × the single best 20-minute effort inside a recent window`
(`learn-fitness-profile/index.ts`, `analyzeRides` STEP 4, tier 1). It can only ever report what
the athlete already produced. An athlete who rides easy for a season has no qualifying effort,
so the estimate sags — not because fitness fell, but because nothing measured it.

Observed on the reference athlete 2026-09-04 (verification only — nothing below is tuned to
these values, and no threshold may be chosen to make one athlete's number land):

| source | value | how it got there |
|---|---|---|
| app, learned | 168 W | 95% of best 20-min (177 W) across 15 efforts |
| app, typed | 176 W | ignored — no `ftp_source` preference set, so tier 1 outranks it |
| Garmin | 204 W | Firstbeat HR↔power model, needs no hard effort |
| best 20-min on record | 208 W (2025-09-06) | → 198 W, i.e. Garmin is near his own all-time best |
| best 20-min since | 185 W (2026-05-06) | → 176 W |

Garmin's advantage is not a better maximal effort. It is that **an easy ride still informs it**,
because it reads the heart-rate-to-power relationship rather than the peak. Firstbeat's model is
proprietary and is not being reproduced; the two open signals below are.

---

## What to build — compound two signals, do not pick one

### Signal A — power at threshold heart rate (the Garmin-shaped read)

Per ride, over aerobic steady segments only, regress power on heart rate and evaluate that fit at
the athlete's learned `ride_threshold_hr`. Every ride with HR + power contributes, including easy
ones. That is the whole point of this signal.

- **Segment selection:** exclude the first ~10 min (HR lag), coasting samples, and anything above
  threshold HR. Require ≥15 min of usable samples or the ride abstains.
- **Fit:** ordinary least squares, power ~ HR, with an intercept. HR has a non-zero resting
  intercept; a through-origin fit systematically overstates. Reject the ride if r² is weak or the
  HR range inside it is too narrow to extrapolate from — a ride held at one heart rate cannot
  produce a slope.
- **Cap the extrapolation.** Refuse to project more than a bounded distance beyond the highest HR
  actually observed in that ride. This is the signal's main failure mode.
- **Decouple:** an aerobically drifting ride (rising HR at flat power) biases the slope. Reuse
  the existing `aerobic_decoupling_pct` and drop rides above the usual field cutoff.
- **Aggregate:** median across the qualifying rides in the window, not the max.

### Signal B — power-duration fit (the whole curve, not one effort)

Assemble a power-duration curve from the BEST value at each duration across the window — different
rides may supply different durations, which is how TrainerRoad and Xert both do it — then fit the
2-parameter critical power model `P(t) = CP + W'/t` and convert CP to FTP.

- Use durations in the aerobic band only. `power_curve` currently stores 5s / 1min / 5min / 20min /
  60min; 5s and 1min are anaerobic and must be excluded from the fit. That leaves 5/20/60min —
  thin. **Widen `calculatePowerCurve` to add 2, 3, 8, 10, 12, 30 and 45 min** so the fit has
  something to hold on to. That widening is a prerequisite, and it backfills for free on recompute.
- Require ≥3 distinct durations, and reject a fit whose W' is physiologically absurd.
- Conversion: FTP is conventionally slightly below CP. Take the field convention rather than
  inventing a coefficient, and record which convention in the source string.

### Combining

Both signals carry a value and a confidence. Publish the higher-confidence one; when both are
confident and disagree by more than a set margin, publish the LOWER and mark confidence medium —
an FTP set too high poisons every zone, every workout target and every plan downstream, while one
set too low only makes sessions easy.

**Hard ceiling:** never publish an estimate above the best 20-minute power actually recorded in the
window. Both signals extrapolate; that number does not.

**Never silently overrule the athlete.** `resolve-current-ftp.ts` tier 0 already honours
`performance_numbers.ftp_source`. Do not touch that precedence. The reference athlete typed 176 and
is being shown 168 purely because he never expressed a preference — that is a separate UI gap
(the control exists for running as `easy_pace_source`), worth filing but not part of this build.

---

## Guardrails

- **Athlete-agnostic.** No constant may be chosen because it makes one athlete's number land on
  204, or on any other target. Every cutoff comes from published practice or from the data's own
  scatter, and the source goes in the comment.
- **No hard gate.** A low-confidence estimate is published as low-confidence, not withheld.
- **Rate limit.** Cap how far the published FTP may move per update — real FTP does not jump 20%
  in a week, and a single odd ride must not drag every zone with it.

---

## Blast radius

`resolve-current-ftp.ts` feeds the coach, the analyzers, the plan generators and every power-zone
calculation — including the 56-75% aerobic band the bike's HR read is taken in. Changing the tier-1
value changes all of them at once. Ship the estimator writing its value and confidence FIRST and
compare against the current one over real rides; only then let it take tier 1.

---

## Acceptance

Not "it returned a number."

1. Unit tests for both signals on synthetic streams with a known answer, including the abstain
   paths: too-narrow HR range, decoupled ride, too few durations, absurd W'.
2. Run over ≥3 throwaway accounts with different shapes — a rider with recent hard efforts, one
   with none, and one with power but no HR — and confirm each lands somewhere defensible and that
   the no-HR athlete falls through to signal B rather than erroring.
3. Back-run over real ride history and show the series of estimates over time. The bar is that it
   does NOT sag through a block of easy riding. That is the entire reason for the build.
4. State the estimate it produces for the reference athlete and why. **It may not be 204.** If the
   honest answer is 175, that is the answer, and Garmin is the one that is optimistic.
