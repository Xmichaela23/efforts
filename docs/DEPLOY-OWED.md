# Deploy-Owed / Post-Deploy Verification

Changes committed locally but **not yet pushed/deployed**, plus verifications that can only run **against the deployed code** (not the local working tree). When a push/deploy happens, work this list: deploy the named functions, then run the post-deploy checks here. This is the bucket for "local-verified, deployed-equals-local still owed."

> Convention: nothing here blocks local work. These are the checks that close the loop once code is live.

---

## Owed

### 5×5 strength protocol (Cuts 1–4) — deploy `generate-combined-plan` + post-deploy end-to-end check (safe, not urgent)
- **What:** the `five_by_five` protocol (block-linear 70→85% curve, 40–50% deload, 2×/week) + the two resolver generalizations (`runStrength`, the tri-combined resolver) + the `FULLBODY_STRENGTH` intent all live in `generate-combined-plan` and the shared `strength-system/protocols/` module it imports. **Deploy `generate-combined-plan`** to make them live. (`create-goal-and-materialize-plan` needs no change yet — nothing populates `strength_protocol='five_by_five'` until the non-race builder lands.)
- **Post-deploy check:** against deployed code, generate a plan for a throwaway athlete with `strength_protocol='five_by_five'` and confirm the strength sessions materialize as 5×5 (name "5×5 Workout", `protocol:five_by_five` tag), **not** durability — the local integration test (`generate-combined-plan/five-by-five-integration.test.ts`) proved this in-tree; the deploy check confirms local-equals-deployed. Use a throwaway test user; never touch real user `45d122e7`.
- **Why safe-but-not-urgent:** **dormant** — no client path sets `strength_protocol='five_by_five'` yet (the builder selects it later), so deploying changes nothing for existing athletes (event plans byte-identical, verified `432/3 = baseline` across all four cuts). Deploy when convenient; it's a prerequisite for the builder, not a live-bug fix.
- **Cross-ref:** Cuts 1–4 (`28f0b9eb`, `0a036d3d`, `bfe2e4e6`, `5f6570a2`), `SCIENCE-5x5-linear-progression.md`, `RESUME-5x5-cut4.md`, Q-083 (the cadence-engine follow-up).

### D-212 divergence render — verifiable only on a REAL disagreement (genuinely blocked)
- **What:** the spine↔projection `fitness_verdict_divergence` renders in the State RACE-block verdicts subsection **only when the two brains actually disagree**. The coach is deployed (payload v46) and the client render path is in production (StateTab) — but it's been verified **by reading, not by runtime**, because **no real divergence exists for the sole athlete** (the block-verdict line shows the dormant "needs more comparable sessions" today).
- **Why it stays here:** there is nothing to *do* — it can't be tested until a genuine spine-vs-projection disagreement occurs in real data. Confirm the render the first time one appears. Not actionable until then; left as a standing reminder, not a task.
- **Cross-ref:** D-212 (`SPEC-fitness-verdict-reconciliation.md`), `arc-context.ts` (`computeFitnessVerdictDivergence`), `StateTab.tsx` (the render).

---

## Done

### 2026-06-26 — the full D-213 non-race arc + D-212 deploy, live and verified
- **Pushed:** the whole arc (22 commits, D-212 work + D-213 Cuts 1–5 + the Cut 3b fix) through `3c7a55f8` → `origin/main`. Netlify build triggered (client diff = the dormant D-212 block_verdict/divergence render in `StateTab.tsx` + `useCoachWeekContext.ts` — additive, dormant, safe).
- **Cut 2 migration applied:** `goals.target_weeks` is live; existing goals NULL-safe; nothing rode along (the 4 recent older migrations were already present). Verified via REST.
- **Functions deployed:** `generate-combined-plan` (Cuts 3/4/5), `create-goal-and-materialize-plan` (Cut 3b routing — redeployed once for the D-214-amendment fix), `coach` (divergence payload v45→46). All ACTIVE with fresh versions.
- **Cut 3b non-race END-TO-END: PASS** (deploy-gated test, run as a throwaway test user — never touched real user `45d122e7`). All four criteria green: (1) routed through `buildCombinedPlan` (`combined:true`, `multi_sport`); (2) contiguous 1..12, `base→build→race_specific→retest`, no taper, no race date; (3) volumes present + CTL-shaped (57 sessions, 3:1 loading + retest ramp-down); (4) real user byte-identical (no plan retired — D-214 scoping held). Test data cleaned up; real user byte-identical post-cleanup. **This test first caught the per-sport-legacy-gate bug, then verified its fix (D-214 amendment / `3c7a55f8`).**
- **486-matrix:** `node scripts/plan-generation-matrix.mjs` → **486/486 pass, errored=0**, freshly generated against the deployed code (974 stale cached files cleared first). Confirms deployed **event** generation is byte-identical / unregressed by the non-race arc.
