# HANDOFF — 2026-07-10 — architecture north star + first mission

**For the next chat. Start here.** This session stopped patching and set the destination. Your job is to build toward it, one contained move at a time.

## Read first (already in CLAUDE.md priming)
1. `TARGET-ARCHITECTURE.md` — the destination: deterministic · smart-server / dumb-client · single source of truth · living baselines · steerable plans · history-aware builder. Yardstick: **"make X look like run."**
2. `TRUTH-MAP.md` — where each fact lives + the cohesion fractures (strength contradicts itself; bike FTP; swim broken).
3. `FOUNDATION-READINESS.md` — the scale/security/ops hardening backlog. Two blockers gate a 2nd paying user: **B1** cross-user data exposure, **B4** no error monitoring.

## What's LIVE from today (deployed, on device)
- **b2 — plan-primary execution surface** (State screen): STRENGTH/AERO/BIKE rows lead by the plan's primary discipline (`_shared/strength-session-types.ts`, `resolvePrimarySport`, coach `weekly_state_v1`). Coach v73.
- **BIKE "0% eff" fix** — cardio rows render the efficiency verdict, not a raw score.
Everything else today was docs — nothing else deployed.

## The first mission (recommended): S2 — retire client-side math
**`useStateTrends` recomputes all per-discipline trends in the browser** (~10 history queries + verdict logic) when the server already caches the identical result in `athlete_snapshot.state_trends_v1`. Also `LoadBar` re-derives the load breakdown; `useCoachWeekContext` mirrors a divergence calc.

**Why this first:** it's simultaneously the top **scale** win and a **cohesion** fix (kills the live-vs-cached freshness fork), it's the cleanest "make the client dumb" edit, and it's lower-risk than the strength convergence (no design fork to settle). It proves the target pattern on a contained change.
- Move: the State screen reads the server-built trend contract (extend the coach `weekly_state_v1` payload, which already reads the spine cached) instead of `useStateTrends`. Client renders; computes nothing.
- Files: `src/hooks/useStateTrends.ts`, `src/components/context/StatePerformanceSection.tsx`, `src/components/LoadBar.tsx`, `coach/index.ts`.

## The immediate follow-on: fracture #1 — strength convergence
Strength shows **three engines** on State that can contradict (`TRUTH-MAP` fracture #1). **One decision to lock before coding:** where "is e1RM improving" is computed once, so the trend row and the per-lift line read the same number. Recommendation: the coach per-lift model (`response-model/weekly.ts`) — it already anchors to typed 1RMs (the one clean part) and feeds the "Bench" line. Cross-ref **Q-105/Q-106** (this is the same fork, already partly filed).

## Then: the rest, in order (per TRUTH-MAP / FOUNDATION-READINESS)
- FTP fracture #2 → route every read through `resolveCurrentFtp`.
- Hardening blockers B1 (auth boundary) + B4 (error sink) before real users — see `FOUNDATION-READINESS.md` §Track 2 + **Q-150**.
- Bike efficiency two-engine (contained by scope labels — lower priority). Swim (park — never a focus).

## Rules (don't repeat today's mistakes)
- **Nothing in a vacuum.** Before building, read `TRUTH-MAP` §3 (who owns the fact) + §5 (where it belongs). Pick the target screen FIRST.
- **The read already exists more often than you think** — extend, don't rebuild (today an endurance "engine" was built for a read that already existed, then deleted).
- Verify by fixture + a live receipt, not a device session alone. ≥3 recomputes for anything stochastic.
- Michael deploys nothing — you deploy the coach + `git push` (Netlify). Bump `COACH_PAYLOAD_VERSION` on any payload-value change.

## Owed housekeeping
`[NEW]` items in FOUNDATION-READINESS are filed under **Q-150** (umbrella). ENGINE-STATE + DECISIONS-LOG (D-269) updated this session.
