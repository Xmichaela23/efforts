# Contract Row — "Get Stronger" (non-race goal #3)

**Status:** **APPROVED 2026-06-29 (Michael).** The FIRST filled non-race contract row — the cut sheet for the F-9 plumbing build. Realizes `SPEC-non-race-goal-plan-contract.md §3` (which defined the structure; this fills + sources the cells). Dependency **Q-088 = done + proven live** (`generate-run-plan` v146; ENGINE-STATE Q-088).
**Scope:** ONE goal row — strength leads (develop), endurance maintained, 1RM retest. Not the 7-gate spec. Every cell traces to a science doc; convention is flagged (same discipline as the freq-4 composition table in `SPEC-q088-freq4-run-path.md`).

---

## User-facing copy (APPROVED — strength/BUILD language, NOT power)

> **Get Stronger** — built on the classic 5×5: squat, bench, deadlift, press, row, loaded heavy and progressed weekly, ending in a 1RM retest.

**Why this exact framing (do not drift):** the goal routes to **`strength_focus_build`** (the 5×5-derived build lane). Calling it "power-focused" would promise the **neural lane** (`strength_focus_power` / `neural_speed` — explosive / RFD) and deliver the build lane — the label would contradict the engine. It's also the version a real lifter trusts. A **POWER goal** (explosive / RFD, neural lane) is a **SEPARATE goal tile** with its own door, later — never folded into this label. No emojis in the copy.

---

## Standalone strength = ALWAYS BALANCED (locks D-220; resolves audit gap #6)

**Decision 2026-06-29 (Michael):** standalone strength is **always a balanced U/L/U/L** — real upper, never leg-dominant. The D-220 build lane already realizes this:
- **Upper:** Bench Press · Barbell Row · Overhead Press · Pull-Up — compound press/pull, horizontal + vertical.
- **Lower:** Back Squat · Romanian Deadlift · Deadlift.
- **All compound, posture-justified** (rows/pull-ups = posterior chain/posture for running; presses = position-holding for the bike). **Zero isolation / mirror work.**

**The aesthetic ("the look") comes FREE from balanced heavy compound work** — it is NOT a separate lane. Product may skew *which compounds and how framed* lightly toward it, but:
- **HARD LINE:** upper stays **compound + posture-justified** (press / pull / posterior-chain), never isolation. The skew is framing, not an aesthetic lane.
- **Copy is functional/posture only** — the aesthetic payoff is **never stated in copy.**
- **`upper_aesthetics` stays supplementary** (per `SCIENCE-upper-aesthetics-hypertrophy.md`) — **never promoted to the developer.**
- **Audit gap #6 ("look better" / hypertrophy) = RESOLVED-BY-BALANCE → stays PARKED. No hypertrophy build.** The balance is the aesthetic engine.

---

## Track 1 — STRENGTH (the lead)
| Cell | Value | CITED / CONVENTION |
|---|---|---|
| Protocol | `strength_focus_build` — 5×5-derived U/L/U/L | **CITED** `SCIENCE-5x5-linear-progression.md` §1 (compound lifts) + D-220 |
| Frequency | **3–4×/wk** (4 = the U/L/U/L split) | **CITED bound** `SCIENCE-concurrent-training-interference.md` §3 (≥2 strength preserves max strength; cycling permissive → room for 4) · **CONVENTION** exact 4 (Q-088 cap) |
| Sets×reps | 5×5 compounds (deadlift 1×5 reduced volume) | **CITED** SCIENCE-5x5 §1 |
| Load | 70→85% 1RM, ~1.25%/wk linear | **CITED** SCIENCE-5x5 §2 |
| Deload | every 4–6 wks → ~45% | **CITED** SCIENCE-5x5 §3 |
| Block length | ~16–20 wks (linear ceiling) | **CITED** SCIENCE-5x5 §4 |
| Terminal | **1RM / strength retest** | **CITED** SCIENCE-5x5 §4 |

## Track 2 — ENDURANCE (bike, maintained)
| Cell | Value | CITED / CONVENTION |
|---|---|---|
| Modality | **bike** is the compatible concurrent discipline; run bounded harder | **CITED** concurrent §2 (Wilson 2012; Frontiers 2025 — running's eccentric damage interferes, cycling tolerated) |
| Frequency | **~2 sessions/wk** | **CITED** concurrent §3 (≈2 aerobic + 2 strength → no max-strength interference) |
| Intensity | mostly easy/aerobic; bounded to protect strength recovery | **CITED** concurrent §3 + minimum-dose principle · **CONVENTION** exact mix |
| Volume | maintenance — **~20–30% below a develop block**; bounded, not a ratio | **CONVENTION** (concurrent scope note: bounds only; the retest calibrates) |
| Decay note | aerobic detrains slower than strength → low volume holds it | **CITED** Mujika & Padilla 2000 |

## Track 3 — INTERFERENCE contract
| Cell | Value | CITED / CONVENTION |
|---|---|---|
| Priority | strength leads; bike scheduled around strength recovery (inverse of the race case) | **CITED** concurrent (whole doc) + spec §3 |
| Same-day spacing | **≥3 h**, or put bike on non-consecutive leg days | **CITED** concurrent §4 (≥3 h dissipates interference) |
| Intent → cardio cap | get-stronger = max-strength → **permissive** bike; a power block would bound tighter | **CITED** concurrent §1/§3 |
| Same-day order | optional resistance-first; otherwise ignore | **CITED** concurrent §5 |

## Sizing & arc
| Cell | Value | CITED / CONVENTION |
|---|---|---|
| Budget | time = hard cap; **strength reserved off the top** (freq × ~1 h), bike = remainder | **CITED** E3b/D-219 `budgetSplit` |
| Prescription | easy/recovery by **time**, quality by **distance** | **CITED** SPEC-non-race-goal-plan-contract addendum |
| Block arc | strength linear-progression leads → bike maintained → ends in **1RM retest** | **CITED** SCIENCE-5x5 §4 + spec §3 |

**Two CONVENTION cells (Michael-set, flagged):** bike maintenance *volume* (bounds only in the literature — ~2×/wk, ~20–30% reduced; exact hours from the time budget + retest) and *strength freq 4 specifically* (CITED that ≥2 preserves strength + cycling permissive; 4 itself is the Q-088 cap).

---

## F-9 plumbing (the build — no sign-off; against the cells above)
Root cause of the collapse: `computeSessionFrequencyDefaults` is **triathlon-only**, and `sport` is never threaded → a bike/run shape inherits the tri run-count and the week collapses to the long session (`BUILDER-SWEEP-FINDINGS.md` F-9).
1. **Thread `sport`** through `buildCombinedPlan` → the frequency model.
2. **Add the bike (and run) shape cells** above into the frequency model — the ~2×/wk bike-maintenance track + the strength track — replacing the tri-only stub.
3. **Wire the strength track to `strength_focus_build` @ freq 4** in the combined path (the protocol chassis is shared; the lane proven live in `generate-run-plan` just needs to be reachable from `buildCombinedPlan`).
4. **Tri byte-identical** — only the missing run/bike shapes get filled; tri cells untouched (the 486-matrix discipline).

---

*Cross-ref: `SPEC-non-race-goal-plan-contract.md` §3 (the contract this fills), `SCIENCE-5x5-linear-progression.md`, `SCIENCE-concurrent-training-interference.md`, `SCIENCE-minimum-dose-maintenance.md`, `SPEC-q088-freq4-run-path.md` (the strength lane), D-220, D-219 (budget), `BUILDER-SWEEP-FINDINGS.md` (F-9).*
