# Handoff — 2026-09-09 / 2026-09-10 (PM chat; two terminals + in-chat workers)

Read `docs/ENGINE-STATE.md` banner first. Memory files carry the rules (never use ours; smart server dumb
client enforced; never commit -a; full plain sentences).

## State at close (2026-09-10 late)
- PUSHED: everything, main = `d5e03769` + docs.
- DEPLOYED: 2026-09-09 seven functions; 2026-09-10 47 (stages 1–3), then 42 (stage 4 + row bugs + gate +
  ledger), then 35 (concentration curl route). Migrations pasted by Michael: `goals.completed_at`,
  `workouts.display_series`.
- iOS SYNCED after the last push; Xcode build is Michael's.
- DATA re-run through the app's own pipeline on Michael's account (approved): 106 sessions via
  recompute-workout twice (before and after the display_series fix), 45 lifts after the bar-in-ledger fix,
  six weekly summaries twice. The July 10 walk fails (no analyser); nothing else.
- VERIFIED on a device: State scrolls from the Today card; the Today lift card. Everything else: throwaway
  accounts against the live DB, headless Chromium/WebKit at 390×844.

## Work orders (all in docs/, all BUILT unless noted)
- WORKORDER-today-screen-2026-09-09.md — §1–3i built (deck replaced by the expandable lift card §3h; LOAD
  off Today §3g then the status card; Week tab §3f; spacing chevron; upper-body day; superset line §3i).
- WORKORDER-kill-ours-2026-09-09.md — §A, §B, §B2, §C built; addenda: kit gate strict, home routes
  (rear delt fly ×2, dumbbell pullover, concentration curl), test row reshaped.
- WORKORDER-de-row-by-feel-2026-09-09.md — built; rebuild fix 70b28aea (rows without the marker).
- WORKORDER-endurance-swaps-2026-09-09.md — built incl. §7 (library session) and §8; moved to the server
  in swap-session (9096bff0).
- WORKORDER-garmin-strava-attribution-2026-09-09.md — built incl. §7 (Open-Meteo credit, B14).
- WORKORDER-booms-2026-09-09.md — built with the revised lines; computed at ingest (compute-session-boom).
- AUDIT-client-decisions-2026-09-10.md — 31/31 built (status banner at top lists commits 1–28; stage 4:
  42892c66, b7d33cf3, bc1aa473, 405095af).

## Approved copy this session (all Michael's yes; the docs carry the exact strings)
ME/DE/SKILL/HYP cues; spacing lines; anaerobic ride, endurance ride (two archetypes), hard run, long run, easy
run, sweet spot; DE no-bar variant; test row and blank-lift set 1; plyo note; the four warning lines; plan-card
description lines; swap sheet lines and confirmations; booms lines (revised); "1 to 2 in reserve"; form card
sentence; State window labels; Planned/Done; the three home-route how-tos and the concentration curl how-to.

## Pending Michael
- Club-night and season-wizard sentences (never checked against a page).
- Flip DRAFT on the concentration curl how-to (approved 2026-09-10 late).
- Device walk.

## Open / found, not fixed
- Heavy-set good-news line ordering vs the ladder write (may be blank until next recompute).
- Multi-swim day: session detail can compare the wrong planned swim (pre-existing).
- `week-builder.ts decideOrdering` AM/PM at activation is a second copy of day order.
- FOUNDATION-READINESS B4 monitoring, B14 weather licence, error handling on every call.
- Pre-existing test failures: 58 client / 5 standing-plan (with --allow-read --allow-env), unchanged.
