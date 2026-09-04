# SPEC — FTP is proposed, then accepted (bike)

**Status:** specified, not built. One terminal session.
**Date:** 2026-09-04 · follows D-372 and `docs/SPEC-ftp-estimator-2026-09-04.md`
**Michael's call:** "follow their lead" — TrainerRoad. A detected FTP is shown to the athlete and takes
only when accepted. Ours applies itself today.

---

## What happens today

`learn-fitness-profile` runs after rides land and writes `learned_fitness.ride_ftp_estimated`
(rate-limited ±5% per learn). `resolveCurrentFtp` reads it at tier 1 when confidence is medium/high, so
zones, plan targets, the coach and the analyzers all move the moment the learner moves. The athlete
finds out when they open Training Baselines. The week-6 checkpoint (`EnduranceCheckpointSheet`,
`endurance-checkpoint`) already shows "priced at → measured now" and asks accept / keep — but accept
only re-prices unstarted plan rows; the FTP itself moved weeks earlier.

## The change — one seam

**The learner proposes. The athlete accepts. Nothing reads the proposal.**

1. **Data.** Add `learned_fitness.ride_ftp_accepted`: `{ value, confidence, source, accepted_at,
   accepted_from }` where `accepted_from` is the estimate it was accepted from. `ride_ftp_estimated`
   is unchanged — it stays the live measurement, rate limit and receipt intact.
2. **Resolver.** In `src/lib/resolve-current-ftp.ts`, tier 1 reads `ride_ftp_accepted` FIRST; only
   when there is no accepted value does it fall back to `ride_ftp_estimated` (medium/high), exactly as
   now. Tier 0 (`ftp_source: 'manual'`) still outranks everything. `learned-low` unchanged. This is the
   whole seam: every consumer — zones, plan generators, coach, analyzers, send-to-Garmin — already
   goes through the resolver, so none of them change.
3. **Pending.** `pending = ride_ftp_estimated.value != ride_ftp_accepted.value` (confidence medium/high;
   `learned-low` never proposes). Expose it wherever `learned_fitness` is already read; no new endpoint.
4. **Accept — two places, one write.** Writing `ride_ftp_accepted = { ...ride_ftp_estimated,
   accepted_at: now, accepted_from: estimated.value }`:
   - **Week-6 checkpoint card** (exists). "Use the measured numbers" also accepts the FTP. "Keep the
     block as built" leaves it pending. Copy unchanged; the FTP row already reads `168 → 167`.
   - **Training Baselines, bike row** (exists: `167 watts · [176] · auto | my number`). When pending:
     `167 · measured 171 · use it` — one small button beside the current value, same voice as the row.
     Not a modal, not a banner. This is the path for an athlete with no standing block, and for
     anyone between checkpoints.
5. **Seeding.** On deploy, for every athlete who has a medium/high `ride_ftp_estimated` and no
   `ride_ftp_accepted`, the learner seeds `accepted = estimated` on its next run (one line in the
   learner, no migration). Otherwise nothing changes for anyone until they accept once; after that,
   the seam is live. ⚠️ Do NOT seed by DB write — it goes through the app (Michael's rule).

## Guardrails

- **No hard gates.** A pending number is shown, never forced; unanswered = nothing moves. Same law as
  the checkpoint sheet and `rematerialize-standing-block`.
- **Manual still wins.** An athlete on "my number" sees no pending line — the estimate is not theirs to
  accept; they chose. Their typed number is what the resolver returns.
- **One number on screen.** The Baselines row shows the ACCEPTED value as the big number; the
  measured one is the small pending line. State's bike row (`FTP · 167 W · estimated`) shows accepted
  too, via the resolver. Nowhere may the proposal and the applied value be printed as if they were the
  same thing.
- **The 5% rate limit stays on the estimate**, not on accept. Accepting jumps to the estimate.
- **Athlete-agnostic.** No constant tuned to the reference athlete.

## Blast radius

Nothing downstream of the resolver changes shape. The two risks: (a) an athlete with an accepted value
that goes stale for months because they never look — acceptable, it is what TrainerRoad does and the
checkpoint re-asks every six weeks on a block; (b) the seed step — get it wrong and every athlete's FTP
blanks. Test the no-accepted / accepted / manual / learned-low paths in the resolver's unit tests before
anything else.

## Acceptance

1. Resolver unit tests: accepted beats estimated; no accepted → estimated (today's behaviour,
   byte-identical); manual beats both; learned-low never proposes.
2. Throwaway accounts through the real pipeline: one with a block at week 6 (checkpoint accept writes
   the FTP), one with no block (Baselines accept), one on "my number" (no pending line ever), one
   whose estimate is low-confidence (no proposal).
3. Reference athlete after deploy: Baselines shows `167` big; if the next learn moves the estimate,
   the pending line appears and zones do NOT move until accepted. Screenshot both states.
