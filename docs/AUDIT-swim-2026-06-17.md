# Swim Board — whole-chain read-only audit (2026-06-17) + close status (2026-06-18)

Severity-ranked map of every hole in the swim intensity + contamination + capture + continuity + cross-discipline chain. Produced by four parallel read-only sweeps + a contamination trace. **Status tags reflect the 2026-06-18 close** (D-199). See `docs/SPEC-intensity-baselines.md` for the design.

Legend: ✅ shipped · ⏸ staged (needs Michael) · ⏭ deferred (next-session, sequenced) · 🔵 separate project · 🟢 already solid · 🟡 latent

## 🟢 Solid (don't re-fix)
- **Per-workout pace is single-sourced (D-182):** card / Details / narrative / mobile all read `resolveSwimScalars → swimPacePer100Seconds`.
- **Swim counts toward combined load/ACWR:** swim produces a workload (`compute-facts:1475`) feeding the combined ACWR (`compute-snapshot:121,362`).
- **One plan-gen resolver:** `swimSecPer100YdFromArcSwimInputs` (`_shared/planning-context.ts:234`); single set-site for `swim_threshold_pace`.

## 🔴 CRITICAL
- **C1 — ✅ FIXED (2026-06-18).** CSS test wrote `swimPace100` as a bare sec/100m number where every reader expects an `m:ss` /100yd string (rendered "95"; resolver `parseMmSs→null` dropped it). Now writes the canonical string (`compute-workout-analysis:776`). Latent — no css_test swim on file to recompute-prove.

## 🟠 HIGH
- **H1 — ✅ FIXED.** Learned baseline was contamination-blind while the State trend filtered. `analyzeSwims` (`learn-fitness-profile`) now excludes `pace_equipment_contaminated` swims (verified 10→9, median stable).
- **H5 — ✅ FIXED.** "Clean swim" was defined in 3 places + the learner was blind. Collapsed the inline `equipmentDir` (`analyze-swim-workout:452`) into the shared `detectSwimEquipment`; learner now reads the one flag. (Coach orphan-key M2 also fixed.)
- **H2 — ⏭ HALF DONE.** Learner needs *filter AND best-efforts fit*. Filter half ✅ (reads the flag); the **median→best-efforts critical-speed fit** is the deferred Garmin learner.
- **H3 — ⏭ DEFERRED.** `swim_facts.pace_per_100m` (`compute-facts:1277`) uses a different pace formula than `resolveSwimScalars` — D-182's single-source doesn't reach the baseline/State family. Coincides for normal pool swims; diverges for seconds-stored or distance≥1000 rows.
- **H4 — ⏭ DEFERRED (gates the learner).** Capture can't feed the filter: no drill/kick/effort flag; ad-hoc can't log kickboard; ankle band uncapturable; planned drill/kick tags not read by the contamination path; RPE/feeling captured but never reach `swim_facts` / no effort gate. **Only matters for an auto-learner — which is why the close leans on the manual number instead.**

## 🟡 MEDIUM
- **M1 — ⏭ DEFERRED.** `race-projections.ts:205` re-implements the resolver's gate instead of calling it (one-resolver holds for plan-gen, not projections).
- **M2 — ✅ FIXED.** Coach "Swim CSS" line read orphan keys; now reads canonical `swimPace100`.
- **M3 — ⏭ DEFERRED (minor).** Two missing-pace defaults: `resolveCssSecPer100Yd`→105 s/100yd vs materialize→90 s/100.
- **M4/M5/M6 — 🔵 SEPARATE PROJECT.** State Performance spine does ZERO cross-discipline synthesis (4 silo trends + a tally headline; no load/ACWR/interference). Interference is run-only (`aerobicDirection` excludes ride+swim). Swim is a sidecar in interference/fitness/headline (headline-gated, 0.2 fatigue weight, neutral in the scheduling matrix, excluded from CTL/ATL/TSB). **App-wide architecture, not swim-specific — silos run/ride/strength too. File as its own initiative.**

## 🟢/🟡 LOW (latent)
- **L1** — `useWorkoutData:104` client recompute fallback bypasses `resolveSwimScalars` for legacy rows without `display_metrics`.
- **L2** — m/yd conversion in two separate sites (any third raw reader is ~9% off).
- **L3** — `swim200Time`/`swim400Time` vestigial (presence-probed, never parsed).

## ⏸ HELD (Michael, 2026-06-18) — do NOT flip
- **Manual-threshold-wins precedence:** would flip `swimSecPer100YdFromArcSwimInputs` so the typed `swimPace100` beats the learned median. **PARKED until the equipment-aware learner produces a real threshold.** Verification found the typed `2:30/100yd` is ~30 s/100 SLOWER than the athlete's actual swimming (median ~1:58/100yd; data verified sound, not a unit bug) — a stale/placeholder number, so flipping would feed plans a too-easy basis. The learned-wins precedence already keeps the contamination-clean median feeding plans meanwhile. Revisit when the Garmin CSS learner lands a true threshold.

## ⏭ DEFERRED — next-session, sequenced (manual threshold closes swim WITHOUT these)
1. **Garmin CSS learner** (biggest build on the board): `isCleanThresholdEffort` (reuse `detectSwimEquipment` + `rest-norm`; close the gap that `analyzeSwims` doesn't yet read the flag in its *learning substrate* selection beyond the median) → critical-speed **best-efforts** fit (not median) → NEW `learned_fitness.swim_css_sec_per_100m` field (**do NOT redefine the median `swim_pace_per_100m` — 4 consumers depend on its meaning**) → auto/manual toggle. Garmin per-length data already flows; mirrors the FTP learner; verify on existing Garmin swims (no device). Needs Michael's judgment — fresh head.
2. **Apple lap extraction** (behind Garmin): native Swift `HealthKitPlugin.swift` to read `HKWorkoutEvent` lap markers → `swim_data.lengths[]`; finish the parked **Q-060** ingest. Device-test-bound, Apple-Watch-only, ongoing iOS-version tail. Most work, narrowest payoff.

## The two through-lines
1. **Swim's number wasn't single-sourced past the workout boundary** — now closed on the manual threshold (per-workout clean via D-182; baseline contamination-consistent; one clean-definition).
2. **Swim is a second-class citizen cross-discipline, and the State spine does no cross-discipline synthesis at all** — separate, app-wide initiative (M4–M6), not part of closing swim.

## Capture uncertainties (worth closing before any learner)
- Manual-swim popup timing (realtime vs nav) is wiring-correct but not runtime-verified.
- "State screen" = StatePerformanceSection (no interference) vs CoachWeekTab (shows interference) — confirm which surface the cross-discipline work targets.
- Exact drill-token→gear mapping in `swim-step-equipment.ts` not fully enumerated.
