# STATE OF BOARD — verified status of every live workstream

**Captured:** 2026-06-28. **Method:** anchored on the authoritative state docs (DECISIONS-LOG, OPEN-QUESTIONS, ENGINE-STATE, SPEC-non-race-*, ROADMAP-strength-engine, DEPLOY-OWED), then verified every claim against actual code. **Where docs and code disagree, code wins — the disagreement is recorded.** Read-only audit; no code changed.

**Companion docs (this sweep):** [STRENGTH-SCOUT-REPORT.md](STRENGTH-SCOUT-REPORT.md) (the island map) · [ENDURANCE-PROVENANCE.md](ENDURANCE-PROVENANCE.md) (the number catalog) · [UI-MAP.md](UI-MAP.md) (both builders) · [ISLAND-PROPOSAL.md](ISLAND-PROPOSAL.md) (the authority proposal).

**Live deploy:** `generate-run-plan` v140 · `create-goal-and-materialize-plan` v223 · `generate-combined-plan` v268. Host: efforts.work (Netlify). Pre-launch — Michael is the only user.

---

## The board

| # | Workstream | Claimed (docs) | Actual (code) | Evidence | Contradiction? |
|---|---|---|---|---|---|
| 1 | **Strength — protocol layer** | Solid, sourced | ✅ SOLID | D-215/D-210; 7 protocols, sets/reps/load sourced (`shared/strength-system/protocols/`) | None |
| 2 | **Strength — periodization** | Smeared (your doc) | 🔴 SMEARED — confirmed | `'Taper'` load-bearing at **30+ sites**; strength-load-by-phase logic living *outside* any strength module: `hybrid-athlete.ts:127-167`, `week-builder.ts:1829-1839` (freq cap), `science.ts:365-369`, `session-factory.ts:2226-2243`. See [STRENGTH-SCOUT-REPORT.md] | None — confirms thesis |
| 3 | **Run non-race — materialization** | Ships (~94 LOC head-swap) | ✅ REAL | Deployed run-plan v140 + create-goal v223 (commit `b10bcf9d`); verified live: 4–5 runs/wk, long-run 26–38% | None |
| 4 | **Run non-race — retest terminal** | "ends in a science-based retest"; combined intensities "copied" (SPEC:18) | 🔴 COSMETIC | `applyRetestTail` (`base-generator.ts:436-446`) renames only; `sustainable.ts:183` keeps speedwork, `:329` `find('Taper')`→undefined; `strength-overlay.ts:274/586` taper-gate misses Retest; grep `0.77`/retest in generate-run-plan = **empty** | **YES** — SPEC-non-race-run-retest.md:18 "intensity copied from combined" was **never implemented**. Recorded. |
| 5 | **Run non-race — endurance numbers** | (implied sane) | 🔴 PLACEHOLDER | **0 SOURCED**, ~78 PLACEHOLDER, ~42 DEAD, ~5 DECORATIVE. Driving tables (`WEEKLY_MILEAGE`, `LONG_RUN_PROGRESSION`, `sustainable.ts`) uncited ("Hal Higdon-inspired, not endorsed" `sustainable.ts:10`). See [ENDURANCE-PROVENANCE.md] | **YES** — proxy comment `non-race-routing.ts:88-111` says distance "nearly inert," but on the run path it **selects the volume table**. Recorded. |
| 6 | **Non-race UI(s)** | "Cuts A–G committed, not wired" (one unlock) | 🟡 TWO UIs, **neither reachable** | `NonRaceBuilder` routed `/goals/build` (`App.tsx:57`), **no GoalsScreen link**, feeds create-goal→run-non-race path. New intake (`non-race-intake-steps.tsx`) **imported nowhere, submits nothing**. See [UI-MAP.md] | **YES** — "wire the UI" is two components, not one inch; the intake is purely presentational |
| 7 | **Stashed combined single-sport cut** | Stash, step-1 for bike | ✅ Present | `stash@{0}` "F-9 provisional plumbing cut" | None |
| 8 | **Q-088** (freq cap 2-3→4+) | Queued, touches overlay | 🟡 OPEN | `OPEN-QUESTIONS.md` Q-088; fold-in proposed in [ISLAND-PROPOSAL.md]; **no collision** with retest fix (different paths, intersect only at `strength-overlay.ts:627-629`) | None |
| 9 | **Q-089** (dup strength session) | Your doc: FIXED · OPEN-QUESTIONS: OPEN | ✅ **FIXED & MOOT for run non-race** | Commit `8c518db5` (D-216), deployed v264/v265, guard test `runstrength-session-index.test.ts`. `runStrength` lives only in generate-combined-plan; generate-run-plan never calls it | **YES** — `OPEN-QUESTIONS.md:1159` is STALE (still reads "dominant non-race-builder bug"). Your doc was right. See §Q-089 below |
| 10 | **Bike non-race** | Doesn't exist | ⬜ Confirmed absent | No standalone bike generator; ~700–1000 LOC to build; no head-swap analog (see prior bike scope) | None |
| 11 | **Deploy state** | Clean | ✅ Clean | run-plan v140, create-goal v223, combined v268 | None |

---

## §Q-089 — definitive resolution (Deliverable 5)

**Verdict: FIXED in code, and MOOT for the run non-race path. Q-089 gates nothing currently shipping.**

- **Fixed:** `runStrength` now takes `sessionIndex` and selects `sessions[Math.min(idx, len-1)]` (`session-factory.ts:~2596`), mirroring `triathlonStrength`. All 3 call sites thread an index (`week-builder.ts:1902/1979/2046`). Guard test `runstrength-session-index.test.ts` asserts the two strength sessions are distinct. Fix commit **`8c518db5`**, recorded as **D-216** (`DECISIONS-LOG.md:4492`), deployed (v264/v265).
- **Moot for run non-race:** `runStrength`/`session-factory.ts` exist **only** in `generate-combined-plan`. `generate-run-plan` (the run non-race ship path) has zero dependency on them — so Q-089 never gated run non-race even before the fix.
- **Where it bit (now fixed):** run-shaped *combined* event plans (2×/wk strength) — `{A,A}`→`{A,B}`, a deliberate event-behavior change (D-216).
- **Contradiction recorded:** `OPEN-QUESTIONS.md:1159` still presents Q-089 as the open "dominant non-race-builder bug." It is stale and should be marked resolved (cross-ref D-216). The non-race builder's actual blocker is the F-12 frequency-model gap on the *combined* path — a different issue, and now sidestepped because run non-race ships on generate-run-plan instead.

---

## The two things that matter most for the next decision

1. **The strength-periodization smear is real and verified** (row 2 + scout map). 30+ phase-name match sites, strength-load logic in run/tri generators. The retest bug (row 4) is one symptom routed through it. This is the case for the strength island.
2. **The endurance science debt is larger and separate** (row 5). The numbers that actually shape the run plan are 0-sourced placeholder, and ~47 of the catalogued numbers are DEAD or DECORATIVE (defined, never read). The strength island does **not** touch this. "Defensible plan" requires both the island *and* an endurance sourcing pass (gate-#2).

---

## OPEN THREADS (recorded, not guessed)

- **T-1 — NonRaceBuilder server-side consumption not re-traced.** UI-MAP verified the client call (`create-goal-and-materialize-plan`, `mode: build_existing`, `goal_type: capacity`) but did not re-trace server-side handling end-to-end. Likely fine (it's the same boundary run non-race ships on), but unproven here.
- **T-2 — intake placement vs optimizer authority.** The new intake computes a placed week *client-side* (`non-race-intake.ts placeWeek`), but `CLAUDE.md` names `week-optimizer.ts` the *sole* authority for day assignment. Wiring the intake's placement into a real payload would conflict — needs reconciliation before merge.
- **T-3 — routing tension D-213/D-214 vs the shipped path. ✅ RESOLVED 2026-06-28 by D-218.** D-218 supersedes D-213/D-214 (in part) for single-sport run non-race: it routes through `generate-run-plan` (the b-run fork), not the combined engine, because combined can't produce a single-sport week. D-213/D-214 are annotated superseded-in-part; both still govern non-race tri. Institutional record now matches the shipped architecture.
- **T-4 — "defensible" is not yet true.** Rows 4 + 5: the retest is cosmetic and the endurance numbers are 0-sourced. Wiring either UI to external users would expose unsourced prescription. Pre-launch (Michael-only) this is fine for dogfooding; it is not fine for launch. Gate-#2 sourcing is owed before "science-based" is claimable.

---

## Doc-hygiene fixes owed (not done in this read-only pass)
- Mark `OPEN-QUESTIONS.md` Q-089 resolved (cross-ref D-216).
- Correct the `non-race-routing.ts:88-111` proxy "inert" comment for the run path (it selects the volume table).
- Reconcile SPEC-non-race-run-retest.md:18 ("intensity copied from combined") with reality (it wasn't) — or implement it via the island, not a placeholder import.
- File the retest-cosmetic defect and the endurance-placeholder debt as numbered items if not already (they live across BUILDER-SWEEP-FINDINGS + this sweep).
