# RESUME — 5×5 Cut 4 (the block-linear curve + deload + 2×/week)

**Status:** Cuts 1–3 committed. Build Cut 4 **fresh after /clear** (it was deferred so the curve isn't built at full context). Event plans must stay **byte-identical** throughout (5×5 is dormant — nothing selects `five_by_five` until the builder).

## Committed so far
- **Cut 1 `28f0b9eb`** — `runStrength` honors the chosen protocol (default `durability`); 3 call sites thread `athleteState.strength_protocol`.
- **Cut 2 `0a036d3d`** — `resolveTriCombinedStrengthProtocol` early-return: an explicit **registered** non-tri protocol routes directly.
- **Cut 3 `bfe2e4e6`** — register `five_by_five` (6 selector spots) + `FULLBODY_STRENGTH` intent + `five-by-five.ts` module (A/B 5×5 at `ANCHOR_PCT=75`) + `five-by-five.test.ts` (3/3).
- **Doc `38560396` + frequency correction** — `SCIENCE-5x5-linear-progression.md` (cited; now **2×/week**, Rønnestad concurrent citations added).

## Cut 4 = the progression science, all in `supabase/functions/shared/strength-system/protocols/five-by-five.ts`
1. **Block-linear curve:** replace `ANCHOR_PCT=75` with a **70→85% ramp by week-in-block** (~1–3%/wk). Weight string stays `${pct}% 1RM`; `pct` now varies by the week index within the block. (`createWeekSessions` currently ignores `weekInPhase`/`weekIndex` for load — wire the curve in.)
2. **Deeper deload:** recovery weeks drop to **40–50%** (currently placeholder `×0.6`). Rides the plan's 3:1 cadence via `isRecovery`.
3. **2×/week structure (the correction):** default 5×5 to **2 develop sessions/week**, not 3. Change `strengthFrequency >= 3 ? [lead,other,lead] : [lead,other]` → **cap 5×5 at 2× (A-B)** — the endurance-adapted develop frequency (Rønnestad; SCIENCE §1). **Also fix the stale "3×/week" strings** in the module header (line ~5) + the `description` (line ~27).
4. **Duration ceiling = `target_weeks`; retest terminal = D-213 retest** — no new logic (the non-race block is already `target_weeks`-bounded ending in retest). **Stall-detection deferred to v2** (needs `ProtocolContext.history`, currently unused).

## Verify Cut 4
- **deno suite byte-identical** — HEAD worktree (NOT stash), `~/.deno/bin/deno test --no-check --allow-all supabase/functions/generate-combined-plan/` current vs HEAD. Still dormant → must be 432/3 = baseline.
- **unit test** (extend `five-by-five.test.ts`): per-week load climbs 70→85 across a block; a deload/recovery week drops to 40–50%; **default frequency = 2 sessions** (A-B).
- **integration test (the capstone — Cuts 1–2 payoff):** a `five_by_five` non-race goal → 5×5 sessions reach the materialized plan via **both** resolver paths (`runStrength` + tri-combined), **not** durability. Model on the D-210 Cut 4 integration test in `generate-combined-plan/posture-distribution.test.ts` (buildPhaseTimeline → buildWeek loop → assert sessions).

## Anchors
- Module + curve: `five-by-five.ts` `createWeekSessions`.
- Resolver paths: `generate-combined-plan/session-factory.ts` — `runStrength` (~:2550), `resolveTriCombinedStrengthProtocol` (~:2183).
- Science: `docs/SCIENCE-5x5-linear-progression.md`. Selector gates: `shared/strength-system/protocols/selector.ts`.
- After Cut 4 ships: **Q-083** (one recovery-aware cadence-engine — Texas/Madcow/5-3-1) + the **cold-start 1RM estimator** (Option 2, needs new `ProtocolContext` fields) are the next deferred pieces.
