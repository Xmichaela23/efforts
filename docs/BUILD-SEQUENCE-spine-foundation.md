# BUILD SEQUENCE — Athlete-State Spine foundation slice

**Status:** Plan only · not started · sign off thresholds, then build with fresh eyes
**Frames:** the concrete first slice of `SPEC-athlete-state-spine.md` — the shared-primitive
relocation + bike-fitness signals + narrative routing (Part B/C/D) + per-ride HR-at-power read,
sequenced as one coherent build. The spine spec is the *why*; this is the *order*.

These four were scoped separately (bike-fitness audit; narrative Part B/C/D; per-ride read) but
share one foundation, so they build as one sequence. **Nothing here is started.**

---

## Dependency graph

```
Phase 0  Shared-primitive relocation ───────────────┐  (unblocks everything; prereq for Part B)
                                                     │
Phase 1  Truth-reconciliation AUDIT (read-only) ─────┤  (spine Phase 1; gates "drive", not display)
                                                     │
Phase 2a Bike-fitness signals (binned + HR@power) ───┤  needs P0 + approved thresholds
            │                                        │
            ├── Phase 2b Per-ride HR@power read ──────┤  needs 2a
            │                                        │
Phase 2c Narrative → spine (Part B/C/D) ─────────────┤  needs P0 + 2a/2b
Phase 2d Load/BODY + readiness → spine ──────────────┘  needs P0
                                                     │
Phase 3  Close loop to plan adjustment ── GATED ─────┘  separate sign-off (autoregulation)
```

---

## Phase 0 — Shared-primitive relocation *(foundation; do first)*
Move the pure, dependency-free trend core so client AND server Deno run ONE implementation.
- **Move:** `classify` · `types` · `thresholds` · `deload` · `headline` (pure, no Node/browser
  deps — already Deno-safe; uses `Date.parse`, fine).
- **Stays client-only:** `useStateTrends` (data-fetch hook), `StatePerformanceSection`. Server
  grows its own thin data-adapters feeding the same primitive.
- **DECISION (confirm):** canonical location. Recommend `supabase/functions/_shared/state-trend/`
  (Deno-native relative imports), client imports via Vite/tsconfig alias `@/lib/state-trend` → that
  path. Alt: a repo-root `shared/`. One source, no copy/drift.
- **Verify:** client `npm run build` + `deno check` on a server consumer both green; the shipped
  STATE row renders identically (regression — no behavior change in Phase 0).

## Phase 1 — Truth-reconciliation audit *(read-only; spine Phase 1; gates "drive")*
The spine can't be trusted to drive until its numbers reconcile. **Audit, no fixes** (same pattern
as tonight). Map per discipline: baseline value vs computed value vs displayed value.
- **FTP 176W (My Record) vs ~204W (STATE/plan)** — is it "best-ever" vs "current-estimate"
  (semantic, badly labeled) or a bug? Root-cause it.
- **Strength** typed baselines (bench 160 / squat 110 / DL 150 / OHP 110) vs computed e1RM.
- **Swim** recorded 100yd 2:30 vs computed pace-per-100.
- **Output → sign-off:** reconciliation rules (precedence, "best vs current" semantics, the hybrid
  suggest-to-baseline-with-confirm pattern). Runs parallel to P0/P2-display; **blocks Phase 3.**

## Phase 2a — Bike-fitness signals *(the clean bike verdict)* — needs P0 + thresholds
Computed once, feeds STATE row (client) AND narrative (server) — the payoff of P0.
- **Terrain-binned power:** bins `CLIMBING={climbing}` · `FLAT_SUSTAINED={threshold,sweet_spot,tempo}`;
  exclude `{vo2, endurance, endurance_long}` from power. Per-bin `classifyTrend`, surface freshest
  dense bin, ±3% dead-band, staleness-gated, thin-bin provisional flag. (Approved design; from the
  bike audit it gave FLAT_SUSTAINED improving +11.9% fresh, killing the cross-terrain artifact.)
- **HR-at-power clean metric:** per-ride mean HR in a per-rider reference band, from
  `computed.analysis.series.power_watts`/`hr_bpm` (retained; 10/10 coverage, CV 4.4% vs raw EF 7.8%).
  `lowerIsBetter`, ±3%, staleness-gated.
- **Supersedes** the shipped single-type `pickBestPwr20` bike adapter (D-148) — note the swap.
- **SIGN-OFF:** per-rider reference-band derivation method; min-points-per-bin (≥3?); show-both +
  disagreement display (binned power vs EF can disagree — the audit showed power improving / EF
  worsening); thin-bin provisional. (±3% bands + 21d freshness already approved.)

## Phase 2b — Per-ride HR-at-power read — needs 2a
This ride's HR-at-power + its trend context → a grounded per-ride efficiency line ("130 bpm at
113 W — HR-at-power holding vs recent endurance"). Replaces the quiet narrative's generic filler
(proven thin on the 06-13 ride). Feeds the narrative + optionally a session-detail row (session-context
Layer 2).

## Phase 2c — Narrative routes through the spine (Part B/C/D) — needs P0 + 2a/2b
- **Part B:** `analyze-cycling-workout` reads the spine's bike verdict (binned/HR@power, staleness-
  gated), injects `{verdict, metric, basis, freshness}` into the packet. (Part A already killed the
  np_trend fallback; this replaces the gap with the deterministic verdict.)
- **Part C:** demote LLM to *describing* the verdict, not judging. Keep D-092 anti-Arc lede.
- **Part D:** `validateClaimsGrounded()` — direction words must trace to a computed verdict.
  **Regression unit-test: the 2026-06-02 VO2 "declining" lie must never reappear.**

## Phase 2d — Load/BODY + readiness fold into spine — needs P0
D-146/D-147 ACWR + off-plan verdict become spine fields (not a parallel computation); readiness
(Q-049) carried as athlete-state alongside the fitness verdicts; coach prompt reads the spine verdict.

## Phase 3 — Close loop to plan adjustment — GATED, separate sign-off
Spine's current state feeds plan adjustment + suggest-to-baseline writes. **Out of this sequence** —
changes what's prescribed (autoregulation), gated behind explicit sign-off, only after P1 reconciles
and P2 proves consistent reads everywhere.

---

## Sign-off checklist (before build)
- [ ] Phase 0 canonical shared-primitive location (recommend `_shared/state-trend/`).
- [ ] Bike: per-rider reference-band method; min-points-per-bin; show-both + disagreement rule; thin-bin provisional. (±3%, 21d already approved.)
- [ ] HR-at-power: min sessions (≥4?), reference band. (±3% approved.)
- [ ] Phase 1 audit findings → reconciliation rules (FTP semantics, hybrid suggest-to-baseline).

## Guardrails (carried from the spec)
- Display/synthesis only — no prescription without separate sign-off (Phase 3).
- Honest-blank over confounded; never the all-type pool.
- Every consumer migration = its own scoped commit + regression that the screen still reads right.
- Arc keeps its voice; it just can't contradict the spine.
