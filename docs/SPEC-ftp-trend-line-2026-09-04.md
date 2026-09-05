# SPEC — Replace the bike FTP dot with an FTP-over-time trend line

**Status:** specified, not built. One terminal session.
**Date:** 2026-09-04

## Why
The bike card's `FitnessDotBlock` places FTP as a dot in its own 12-week min/max range
(`positionInRange` → `fitness.range`). Two problems, both found this session:
1. The dot is positioned by best-20-min power but the label reads "167 W threshold" — number and marker
   disagree (acceptance run, 2026-09-04).
2. "Position in your own 12-week min/max" is the last method on State with NO field source (STATE-SOURCES).

TrainingPeaks' actual FTP view is a **threshold-history line** — FTP plotted over time as it changes
(TrainingPeaks "track previous thresholds"; WKO5 sFTP History chart). That is the same shape as the
efficiency and drift charts already on the cards. Replacing the dot with an FTP trend line is fully
sourced and kills the mislabel by construction.

## The data already exists
`fitness_baselines` supersedes rather than overwrites, so bike FTP already accumulates a dated trail
(176 → 153 → 168). `compute-snapshot/index.ts` (~line 1645) already reads it into a `reference` series
`{ metric:'ftp', unit:'W', points:[{date,value,status}] }` and attaches it to `namedSessions`. It is
NOT on the bike trend row. This is wiring, not new computation.

## Build
1. **compute-snapshot:** attach the same FTP `reference` series to the bike display row (the way
   `loadByDiscipline` is attached post-assembly — `stateTrendsV1.display` / the bike object the client
   reads). New field, e.g. `bike.ftpHistory: { date, value }[]`. Reuse the existing query (line ~1645);
   do not add a second read.
2. **Client (`StatePerformanceSection.tsx`):** where the bike row renders `FitnessDotBlock` (showDot
   branch, ~line 331), when `ftpHistory` has ≥ 2 points render a `TrendSparkline` with `trendline`
   + `trendWord="FTP"` + `unit=" W"` + `fmtVal={Math.round}` instead of the dot — caption becomes
   "FTP over 12 weeks: 160 → 167" via the shared `fitTrend`. Keep the "167 W · estimated" headline text.
   With < 2 points (one reading), show the number alone, no line, as today's fallback.
3. **Remove the dot for FTP:** `FitnessDotBlock`, `fitness.range` / `positionInRange` for bike, and
   the "The dot is where this number sits in your last 12 weeks" legend come off the bike card. Check
   `positionInRange` has no OTHER live consumer before deleting it (run decoupling had a `range` too —
   confirm it is unused on screen; if unused everywhere, delete it; if run still uses it, leave the
   function and only stop calling it for bike).
4. **Cache:** bump `COACH_PAYLOAD_VERSION` + the client min gate (new field on the payload).
5. **Ledger:** in STATE-SOURCES, the "The dot: position in the 12-week range — OURS" row becomes
   "FTP trend line over time — FIELD, TrainingPeaks threshold history / WKO5 sFTP chart." In
   STATE-NUMBERS, update the BIKE section. This removes the LAST OURS from the run/ride surface.

## Guardrails
- No new number: the line plots stored FTP readings; the fitted trendline is the same `fitTrend`
  the efficiency/drift charts use (WKO5 least squares).
- < 2 points → the number alone, never a line through one dot (the existing "two points is not a line"
  rule at line ~1657).
- Athlete-agnostic; a new rider with one FTP reading shows the number, no line, no crash.

## Acceptance
Throwaway rider with ≥ 3 FTP readings over weeks → bike card shows an FTP line with "FTP over N weeks:
X → Y", no dot, and the caption's X/Y recomputed by hand from `fitness_baselines`. A rider with one
reading → number only. Screenshot both. STATE-SOURCES has zero OURS on the run/ride surface.
