# DESIGN — Best Efforts (the "am I getting fitter, on any workout" primary lens — cross-sport)

Status: **spec, not built.** Authored 2026-07-07 after building the segment feature (`DESIGN-segments.md`) and discovering it's the *narrow* case. This doc is self-contained: a fresh session should build from it + the repo alone. Cross-refs: `DESIGN-segments.md` (the sibling, now the SECONDARY lens), `CONSTITUTION.md` (Laws 1–6), `_shared/core-verdict.ts` + `compute-core-verdict/` (the spine-verdict pattern to MIRROR), `_shared/heat-adjust.ts` (`routeHeadline`/`routeTrend` — the honesty engine, reused verbatim).

---

## 0. Why this exists — the segment feature is correct but narrow

The segment feature (`DESIGN-segments.md`, D-250, built 2026-07-06/07) answers *"am I faster on THIS exact stretch"* — a fixed frozen sub-path, matched by ordered GPS traversal. It's honest and it matches how Strava/Garmin **Segments** work. But it only fires when the athlete genuinely repeats a route.

The primary user (Michael) doesn't run routes — he runs an **area**: a familiar corridor with a ~consistent core distance he always covers and **variable edges** (variable-length out-and-backs, a few trailheads, dry climate). Forcing a route-matcher onto not-a-route led to per-user tuning (corridor 30→50m to catch runs that GPS-drifted off the frozen line) — the smell that the *primitive* is wrong for how he runs. Two of his instincts drove the pivot: **(a) "don't tune to me"** (a feature that only works calibrated to one person's GPS jitter is a demo, not a feature); **(b) "don't do weird things other apps don't."**

**Incumbent research (2026-07-07):** Strava/Garmin solve variable-length running with **Best Efforts**, not tighter route-matching. Best Efforts finds your **fastest time at benchmark distances (1mi, 5K, 10K…) within ANY run**, regardless of route/length, and trends them. It's the standard, it generalizes, it needs no route. Strava/Garmin run **both** (Segments + Best Efforts) — so do we. **Decision: Best Efforts is the PRIMARY lens; segments stay as the secondary lens for true repeats.** (Sources: Strava Best Efforts / Matched Activities / GAP help; Garmin Segments.)

**Metric = PACE / SPEED, hills out — NOT efficiency (ruled 2026-07-07).** Best Efforts trends your **best GAP-adjusted pace at distance** (grade-adjusted so a hilly 5K and a flat 5K compare — the terrain objection stands and GAP answers it). It does **NOT** HR-normalize (the "same-effort" layer the segment uses). Reason: a best effort is by definition a *peak* — HR-normalizing a max effort to "typical HR" is conceptually backwards (adjusting an all-out effort as if it were submaximal) and muddies a clean speed number. Effort is controlled a cleaner way — by reading the **PR frontier** (your *fastest* efforts), which self-selects for hard days; an easy-run week just doesn't produce a PR (exactly how Strava Best Efforts works), it sits low on the chart and the fast frontier carries the trend. **Two clean lenses, both speed:** raw **Pace** (what you ran) and **GAP pace** (hills out). This also keeps the three fitness dimensions cleanly separated: Best Efforts = **peak output (speed)**; economy (efficiency) and durability (decoupling) stay in State + the segment card, where effort-normalization belongs. Residual terrain GAP misses (surface/trail/wind) is accepted noise.

**Cross-sport — this is ONE idea, one metric per sport.** "Best output over time" generalizes across the triathlete's disciplines; only the per-workout metric changes. Build the verdict/trend engine ONCE and feed it each sport's metric:

| sport | metric | terrain adjustment | already computed? | on the spine? |
|---|---|---|---|---|
| **Run** | best pace at distance (1mi / 5K / 10K) | **GAP** (hills) — NO HR/efficiency | finder yes (raw pace); GAP not wired in | no |
| **Bike** | best power at duration (5s / 1min / 5min / 20min / 60min) | **NONE** — power is inherently terrain-proof (watts is watts uphill) | `calculatePowerCurve` yes | **partly** — `w20`, CTL/ATL/TSB already in `athlete_snapshot` |
| **Swim** | best pace at distance (pool) | none (no terrain) | — | no |

**Cycling is the cleanest and most-built case:** the power curve already exists, needs **no GAP** (the running hills problem doesn't exist for power), and cycling fitness (`w20`, CTL/ATL/TSB) is *already* on the spine — running has none of that. Do bike first if you want the fastest honest win; the run GAP-wiring is the only genuinely new physics.

---

## 1. The head start — TWO of the three hard bricks already exist

This is NOT a from-scratch build. Verify each before building:

- **The RUN sliding-window best-effort finder EXISTS.** `calculateBestRunEfforts` (`compute-workout-analysis/index.ts:128`) slides a window along each run's `distance_m`/`time_s`/`hr_bpm` series to find the fastest **1mi / 5K / 10K**, captures avg HR, and stores it in `workouts.computed.best_efforts` (atomic JSONB merge) on every run. O(n) two-pointer. **Rough edge:** it only considers windows within ±2% of the exact distance (`meters*0.98..1.02`) — on choppy GPS it can miss the true best; consider tightening the finder during backfill. Uses **raw pace, no GAP.**
- **The BIKE analog EXISTS too — and it's cleaner.** `calculatePowerCurve` (`compute-workout-analysis`) computes best power at **5s / 1min / 5min / 20min / 60min** (`rollingMaxAverage`) on every ride → `computed.power_curve` + `achievements_v1`. **No GAP needed** (power is terrain-proof). And cycling fitness is **already partly on the spine:** `compute-snapshot` pushes `w20` (20-min power) + **CTL/ATL/TSB** into `athlete_snapshot` (`:668`, `:797`). So for bikes, brick 1 (finder) is done and brick 3 (spine) is partly done — the honest per-duration TREND/verdict is the gap.
- **The GAP physics EXISTS.** Per-sample GAP (Minetti) is computed and reduced to `overall.avg_gap_s_per_mi` (`compute-workout-analysis:1823`; `resolveRunGap` in `_shared/run/run-scalars.ts:72`). But only at the **whole-run** level — the best-effort finder never sees a grade series.
- **The honesty engine EXISTS and is reused verbatim.** `_shared/heat-adjust.ts` `routeHeadline`/`routeTrend` (robust regression, CI-gated 4-state verdict, `MIN_REGRESSION_N=8`) + `_shared/efficiency-index.ts` `computeEfficiencyIndex` (same-effort). `_shared/core-verdict.ts` already wraps these with 6-month windowing, lead-with-same-effort, and the below-floor→`still_building` gate. **Mirror it.**
- **The spine-verdict + surface pattern EXISTS (just built for segments).** `compute-core-verdict/` (edge fn) reads `core_efforts` → writes `core_verdicts` (one per core) → `workout-detail` reads it → `session_detail_v1.segment_verdicts` → `RouteDoorway.tsx` renders it, flag-driven. **Best Efforts mirrors this exactly**, with `best_effort` in place of `core`.

**Missing third brick:** best_efforts is **NOT on the spine.** Grep confirms nothing in `compute-snapshot` / `arc-context.ts` / `athlete-snapshot/` / `compute-facts` reads `best_efforts` — it lives only on the workout and feeds the AI narrative (`generate-overall-context`). It is a per-run number, never aggregated or trended into a verdict. **That aggregation is the main build** — and it's the same shape as `core_efforts → compute-core-verdict → core_verdicts`.

---

## 2. What the user sees (mirror the segment card)
Best Efforts becomes the **primary** fitness lens (segments demoted to secondary/"when you repeat a route"):
- **Tier 1 — headline verdict per distance**, server-authored, rendered verbatim: "Your 5K's getting faster" / "Holding" / "Still building a read." CI-gated, N≥8 floor, **no directional verdict under the floor** (reuse `core-verdict.ts` gate). Same "stay quiet until it's real" honesty.
- **Tier 2 — one chart per distance, two-lens toggle** (both min/mi, both SPEED): **Pace** (what you ran) and **GAP pace** (hills out). NO same-effort/efficiency lens (ruled out — §0). Read the **PR frontier** (fastest efforts carry the trend; easy-day best-efforts sit low and are ignored). Gold PR dot; trend line ONLY when `show_slope` (a confident direction) — never a slope under "holding." Y-axis locked across the toggle.
- **Metric selector (per sport)** — Run/Swim: distance (1mi / 5K / 10K). Bike: duration (5s / 1min / 5min / 20min / 60min). The finder/curve already produces these.
- **Works on every workout** including travel/variable ones (no route/detection needed) — the whole point.

Reuse `RouteDoorway.tsx`'s flag-driven render (copy headline + demoted quiet chart, faded dots, gold PR, tap-for-detail with HR). The `render_flags` / provenance / `chart_points` contract from `session-detail/types.ts` (`SegmentVerdictV1`) is the template.

---

## 3. Build order (mirrors the segment build; 3 real steps, the rest reuse)
0. **GAP-adjust the RUN finder.** Feed the per-sample grade/GAP series (already computed in `compute-workout-analysis`) into `calculateBestRunEfforts` (or a new `calculateBestRunEffortsGap`) so each best-effort window carries **GAP pace** + raw pace + avg HR, not just raw pace. *(the hill fix — non-negotiable given the hilly running)* — **BIKE skips this step entirely** (power needs no GAP); the power curve is already build-ready.
1. **Spine aggregation + verdict.** New `compute-best-effort-verdict/` edge fn (mirror `compute-core-verdict/`): read each run's `computed.best_efforts` across the user's runs → per distance, build the effort series (date, gap_pace, same-effort pace, hr, is_best) → window 6mo → feed `routeHeadline` → write a verdict row. New table `best_effort_verdicts` (one per user per distance) — mirror `core_verdicts` (NOT NULL direction + CHECK, UNIQUE(user_id, distance), spine-authored RLS, no owner write). *(the missing brick)*
2. **Register at the 2 chokepoints** (same as segments — see `core_verdicts` migration banner): `compute-facts` tail already fires per-run; the best-effort VERDICT rides `compute-snapshot`'s tail (born where State's verdict lives, Law 5). Thread `dry_run` through for write-free verification.
3. **Surface (Law 4).** `session_detail_v1` gains `best_effort_verdicts: BestEffortVerdictV1[]` (mirror `segment_verdicts`); `workout-detail` loads them (the only DB reader); `build.ts` maps flag-driven; a client card (reuse/adapt `RouteDoorway`).
4. **Backfill + verify STABLE on real data** (§5). Recompute best_efforts across history (fix the ±2% finder edge here), aggregate, and confirm the verdict is stable across recomputes — the acceptance bar.

---

## 4. Open forks — DECIDE FIRST (Michael's rulings, before building)
1. **Metric — RULED (2026-07-07): PACE / SPEED, hills out, NO efficiency.** Two lenses: raw **Pace** + **GAP pace**. Same-effort/HR normalization is OUT (murky on a peak effort — §0); effort is controlled by reading the PR frontier, not by HR-normalizing. Bike = power at duration (already no efficiency, no GAP). This fork is closed — the rest of §4 is still open.
2. **Metrics per sport.** Run/Swim: the finder's existing **1mi / 5K / 10K** (his "~4 miles always the same" ≈ the 5K–10K band — confirm his real benchmark). Bike: the curve's **5s / 1min / 5min / 20min / 60min** (20-min = threshold proxy, the key one). Add distances/durations later.
3. **Window.** Reuse segments' **6-month recency** + N≥8 floor + CI gate (calibration params, non-universal). Confirm.
4. **Source of truth.** Aggregate from the per-workout `computed.best_efforts` (already written every run) vs a dedicated store. Rec: read `computed.best_efforts`, aggregate on the spine (like `core_efforts`). Improve the finder's ±2% edge during backfill.
5. **UI hierarchy.** Best Efforts primary, segments secondary — how they coexist on the session card / a "Fitness" view. Rec: distance selector primary; the segment doorway appears only on runs that matched a core.
6. **NOT tuned to the user** — this is the whole point. Best Efforts must work with universal-ish defaults (benchmark distances/durations, GAP, HR) — NOT per-user GPS calibration. If a fork tempts a per-user constant, that's the segment mistake repeating.
7. **Which sport first?** Rec **bike** — the power curve exists, needs no GAP, and cycling fitness (`w20`, CTL/ATL/TSB) is already partly on the spine → the fastest honest win, and it proves the cross-sport verdict engine before the run GAP-wiring. Run second (GAP is the only new physics). Swim last.

---

## 5. Constitution conformance + what NOT to repeat
- **Law 5 (born on the spine).** The best-effort VERDICT is computed in `compute-best-effort-verdict` on the spine (rides `compute-snapshot`), NOT minted in `build.ts`. The per-run best_efforts FACTS stay in `compute-workout-analysis` (facts, Law 2). Same split as segments.
- **Law 1 (one government).** The trend uses State's canonical efficiency metric (`computeEfficiencyIndex`); it's a zoom, never a competing verdict.
- **Law 4 (surfaces render).** Client gets render-ready `{copy, render_flags, chart_points, ...}` — no slope/CI/raw recompute client-side (D-253 governance-by-construction).
- **Law 6.** Deterministic fixtures for the GAP-window finder + the trend, AND a real-data recompute pass (fixtures-green ≠ correct — the segment saga proved it twice: the elapsed-vs-moving-time bug and the 30m-corridor undercount only showed on real GPS).
- **Don't tune to the user** (the segment lesson). **Don't over-claim** (N≥8 floor, "stay quiet"). **No raw pace in the UI** — GAP/same-effort, min/mi. **No slope under "holding."** **Verify on real data, not just fixtures.**

## Changelog
- **2026-07-07** — Created. Best Efforts decided as the PRIMARY lens (matches Strava/Garmin; fits area-based/variable running; doesn't tune to the user); segments demoted to secondary. Two of three hard bricks already in the repo (the window finder + GAP physics); the missing brick is the spine aggregation, which mirrors the just-built `compute-core-verdict`. Written as a hand-off for a fresh build session.
- **2026-07-07 (later)** — Made CROSS-SPORT. One idea, one metric per sport: run/swim = best pace at distance (run GAP-adjusted), bike = best power at duration (no GAP — power is terrain-proof). Bike is the cleanest/most-built case (`calculatePowerCurve` exists; `w20`/CTL/ATL/TSB already on the spine) → recommended first. The verdict/trend engine is built once and fed each sport's metric.
- **2026-07-07 (metric ruled)** — Best Efforts is **PACE / SPEED only** (raw Pace + GAP pace), NOT efficiency. Same-effort/HR normalization dropped — it's murky on a peak effort (adjusting a max as if submaximal); effort is controlled by reading the PR frontier instead. Keeps the three fitness dimensions clean: Best Efforts = peak output; efficiency + decoupling stay in State/segment. §4 fork 1 closed.
