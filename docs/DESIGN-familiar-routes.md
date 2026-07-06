# DESIGN — Familiar Routes (the honest, heat-adjusted "how am I doing on my routes")

Status: **design, not built.** The route *identity* foundation is built + backfilled (2026-07-06); this doc specs the feature on top of it — the per-route performance-over-time read and its surface. Cross-refs: `CONSTITUTION.md` (Laws 1–6), `CANON-arc-inference-model.md` (confidence ladder, abstain-not-fill), `_shared/route-intelligence.ts` (identity), `_shared/efficiency-index.ts` (pace-per-HR).

---

## 1. What it is

**Strava-adjacent: your familiar routes, and how you're doing on each over time.** An athlete has a handful of routes they run/ride repeatedly (real data, user 45d122e7: ~5 routes at 17–40× each). They want the concrete, motivating read: *"am I getting faster on my usual loop?"* Multiple routes, each with its own history.

## 2. The differentiator — why not just copy Strava

Strava's segment/route history shows **raw clock times**. Raw time is **condition-blind**: a PR on a cool morning vs a slog in July heat aren't the same effort, but Strava treats them as comparable — so its "trend" quietly lies by exactly the confound we hit. **Efforts shows the honest version:**

- **Same route already removes hills** (the hard confound — the climbs are identical every time; they cancel).
- **Heat-adjusted + effort-aware** removes the rest: read **pace-for-your-HR**, normalized for temperature/humidity, not clock time.

So: *"on this route, at the same effort, with the weather taken out — you're improving/holding."* That's the "don't lie" thesis (D-242 / the CONSTITUTION) applied to Strava's most-loved feature. It's the reason to build it rather than mimic.

## 3. What's already built (the foundation this stands on)

- **Path-based route identity** (`_shared/route-intelligence.ts`) — "same route" = same roads (geohash overlap), tolerant of length (out-and-back builds), idempotent count, honest `first_seen`. Runs **and** rides. History backfilled.
- **Per-run route metrics** (`route_progress_metrics`) — per run on a route: `avg_pace_sec_per_km`, `effort_adjusted_pace_sec_per_km` (GAP), `avg_hr_bpm`, `distance_m`, `elevation_gain_m`, `decoupling_pct`, `metric_date`.
- **Conditions** — `workouts.weather_data` carries temperature + humidity per workout.
- **The efficiency primitive** (`_shared/efficiency-index.ts`) — `efficiency_index = speed / HR` (State's canonical pace-per-HR).

**Missing:** (a) the heat adjustment (the deconfound), (b) temp/humidity on the route metrics rows, (c) the Routes surface.

---

## 4. The engineering

### 4.1 Data model
- **Identity:** `route_clusters` (path signature in `metadata.geohashes`, `sample_count` = true count, `first_seen_at`) + `workout_route_match` (workout → cluster, idempotent).
- **Per-run series:** `route_progress_metrics` (one row per run on the route).
- **GAP:** `route_progress_metrics.metric_date`, `metadata.fingerprint`. **New columns needed:** `temp_f`, `humidity_pct` (and derived `dew_point_f`) — written during the compute-facts route-metrics upsert by reading the workout's `weather_data`. This is the one schema add.

### 4.2 The heat adjustment (the core new piece)
Heat's effect on HR is well-studied and **directional**: HR rises with heat, worse with humidity; **dew point** (from temp + humidity) is the better heat-stress signal than temperature alone. The adjustment normalizes each run's pace-per-HR to a **reference condition** (proposed: dew point ≤ 55°F = "neutral"):

```
heat_penalty = k * max(0, dew_point_f - DEW_REF)          // k = per-°F pace penalty, DEW_REF ≈ 55°F
adj_efficiency = efficiency_index * (1 + heat_penalty)     // undo the heat drag → what it'd be neutral
```

- `k` is a **bespoke tuning coefficient** — same class as the Q-127 DOMS coefficients: an estimate with **declared provenance**, validated against the athlete's own hot-vs-cool runs on the same route (fit `k` so hot and cool runs of equal known fitness read equal). Ship a documented population default first, tune later.
- **Alternative (higher-N routes): regress it out.** Fit `efficiency ~ dew_point` across the route's runs, then trend the **residuals** over time (the fitness signal after the weather is removed). Cleaner statistically; needs ~8+ runs. The linear correction is the low-N fallback.

### 4.3 The route metric + gating
- **Metric:** heat-adjusted pace-per-HR on the route, direction over a window (reuse `routeEfficiencyDirection`, fed `adj_efficiency`).
- **Gating (so effort is comparable, per the confounds):**
  - **Easy/steady aerobic runs only** (drop intervals/races on the route — different effort, not comparable).
  - Reuse the 90-day / recency window OR the regression-residual for longer history.
  - Min run count before a direction (≥4, the half-vs-half floor); below → familiarity only.
  - **Rides:** same idea but power-based (power-per-HR) — phase 2.

---

## 5. Surfaces

1. **Routes list** — the athlete's familiar routes: name, `times_run`, `first_seen`, last run. (Its own view — "Routes", Strava-segments-style.) Where it lives: a top-level or State-adjacent view; a **route trend is macro**, so by the macro/micro rule (CONSTITUTION Law: Performance = this session) it does NOT belong crammed on the session card.
2. **Route detail** — tap a route → the heat-adjusted trend over time, glass-box: "at the same effort, weather-adjusted: improving," with the adjustment visible ("adjusted for dew point"). Plus raw context (times, best, recent).
3. **Session pointer** — the per-session line stays **familiarity only** ("Same route · run 40× since 2025") and becomes the **doorway** into that route's detail. No verdict on the session card.

## 6. Honesty gates (from the CONSTITUTION / CANON)
1. **Heat-adjustment is a population model** → a *directional* read, never a precise number. Hedge it; show it needs a few runs.
2. **Glass-box the adjustment** (Law 2 / D-242): show that/how the weather was removed ("adjusted for dew point 68°F"), never a bare "declining."
3. **Confidence-gated** (CANON §3): low N or wild condition variance → familiarity only / "still learning this route," never a faked direction.
4. **`k` carries its provenance** (Law 2, D-237): a default coefficient is declared as such; a tuned one says so.
5. **One source of truth** (Law 1): the route efficiency metric derives from the SAME `efficiency_index` State uses (heat-adjusted), so the route read and State can't contradict on the base metric — the route view is a *conditions-controlled zoom*, State the aggregate.

## 7. Open forks (need Michael's ruling)
1. **Heat model:** simple linear correction (ship now, tune `k`) vs per-route regression-residual (cleaner, needs N). Recommend: linear default now, regression when a route has ≥8 comparable runs.
2. **Reference condition:** dew point ≤ 55°F? (or temp-based?) — sets what "neutral" means.
3. **`k` default + tuning:** ship a documented population `k`, then validate against your own hot/cool same-route runs (a bespoke tune, like the DOMS coefficients).
4. **Where the Routes view lives:** own tab, under State, or a section — a navigation call.
5. **Rides:** power-per-HR route trend — phase 2, or in from the start?

## 8. Build order
1. **Schema + capture:** add `temp_f`/`humidity_pct`/`dew_point_f` to `route_progress_metrics`; write them in compute-facts (read `weather_data`). Backfill from existing `weather_data`.
2. **Heat-adjust primitive:** `adjEfficiency(efficiency_index, dew_point, k)` in `_shared` + fixtures (hot and cool runs of equal fitness read equal).
3. **Route trend read:** heat-adjusted `routeEfficiencyDirection`, easy/steady-gated, confidence-hedged.
4. **Routes list + detail UI.**
5. **Wire the session line as the doorway.**
6. **Tune `k`** against real hot/cool same-route data; **rides** (power) as the follow-on.

## 9. What this is NOT
- Not a Strava-time leaderboard (raw times lie). Not on the session card (macro belongs on its own surface). Not a precise fitness number (it's a hedged, conditions-controlled *direction*).

## Changelog
- **2026-07-06** — Created. Scoped the honest, heat-adjusted per-route performance feature on top of the built path-based route identity. Heat-adjustment method (dew-point normalization + bespoke `k`, regression-residual for high-N), the surfaces (Routes list/detail + session doorway), honesty gates tied to the CONSTITUTION/CANON, and a 6-step build order. Forks filed for Michael.
