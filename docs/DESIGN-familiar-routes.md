# DESIGN — Familiar Routes (the honest, heat-adjusted "how am I doing on my routes")

> # ⛔ SUPERSEDED 2026-07-06 — DO NOT BUILD FROM THIS DOC. See **`DESIGN-segments.md`** (Q-132 / D-250).
> This route-trend feature was BUILT + deployed, then proved structurally unsound. Its foundation — the **path-based route identity** this doc calls a built + sound feature — is the exact flaw the audit killed: it **over-merges different distances** (2.9–5.0mi into one "route"), **fragments one trailhead into 4 clusters**, and **double-matches** runs. On real data the verdict flip-flops. The honest replacement is the **segment model** (fixed sub-path every run covers — Strava/Garmin precedent). The read *engine* built here (`heat-adjust.ts`, `routeHeadline`/`routeTrend`, 24 fixtures) is sound and reused by the segment build; **only the route-identity substrate is dead.** A fresh session must build from `DESIGN-segments.md`, NOT this doc. Kept for institutional memory (the heat-adjust / same-effort-pace / MAF reasoning is still valid — see D-251/D-252).

Status: **SUPERSEDED — see banner above.** ~~design, not built. The route *identity* foundation is built + backfilled (2026-07-06); this doc specs the feature on top of it.~~ ⚠ The claim that the path-based route identity is a sound foundation is **FALSE** (D-250 audit). Cross-refs: `DESIGN-segments.md` (the replacement), `CONSTITUTION.md` (Laws 1–6), `CANON-arc-inference-model.md`, `_shared/heat-adjust.ts` (the reused engine).

---

## 1. What it is

**Strava-adjacent: your familiar routes, and how you're doing on each over time.** An athlete has a handful of routes they run/ride repeatedly (real data, user 45d122e7: ~5 routes at 17–40× each). They want the concrete, motivating read: *"am I getting faster on my usual loop?"* Multiple routes, each with its own history.

## 2. The differentiator — why not just copy Strava

Strava's segment/route history shows **raw clock times**. Raw time is **condition-blind**: a PR on a cool morning vs a slog in July heat aren't the same effort, but Strava treats them as comparable — so its "trend" quietly lies by exactly the confound we hit. **Efforts shows the honest version:**

- **Same route already removes hills** (the hard confound — the climbs are identical every time; they cancel).
- **Heat-adjusted + effort-aware** removes the rest: read **pace-for-your-HR**, normalized for temperature/humidity, not clock time.

So: *"on this route, at the same effort, with the weather taken out — you're improving/holding."* That's the "don't lie" thesis (D-242 / the CONSTITUTION) applied to Strava's most-loved feature. It's the reason to build it rather than mimic.

## 3. What's already built (the foundation this stands on)

- ⛔ **Path-based route identity** (`_shared/route-intelligence.ts`) — "same route" = same roads (geohash overlap), tolerant of length (out-and-back builds), idempotent count, honest `first_seen`. Runs **and** rides. History backfilled. **← THIS IS THE FLAW, NOT A FEATURE (D-250).** "Tolerant of length" = it merges a 2.9mi and a 5.0mi run as "one route" (overlap coefficient bypasses the length guard above 0.9), and the unordered-set/no-direction identity fragments one trailhead into 4 clusters. The whole premise below rests on this being sound; it isn't. See the banner + `DESIGN-segments.md`.
- **Per-run route metrics** (`route_progress_metrics`) — per run on a route: `avg_pace_sec_per_km`, `effort_adjusted_pace_sec_per_km`, `avg_hr_bpm`, `distance_m`, `elevation_gain_m`, `decoupling_pct`, `metric_date`. ⚠ **`effort_adjusted_pace_sec_per_km` is NOT GAP** (an earlier draft mislabeled it). Verified in `compute-facts/index.ts:797-801`: it is `pace × (avgHr / refHr)` — an **HR normalization**, not a grade adjustment. Real GAP (Minetti grade model) lives separately in `_shared/gap.ts:36` (`paceToGAP`) and is not stored here.
- **Conditions** — `workouts.weather_data` carries temperature + humidity per workout.
- **The efficiency primitive** (`_shared/efficiency-index.ts`) — `efficiency_index = speed / HR` (State's canonical pace-per-HR).

**Missing:** (a) the heat adjustment (the deconfound), (b) temp/humidity on the route metrics rows, (c) the Routes surface.

---

## 4. The engineering

### 4.1 Data model
- **Identity:** `route_clusters` (path signature in `metadata.geohashes`, `sample_count` = true count, `first_seen_at`) + `workout_route_match` (workout → cluster, idempotent).
- **Per-run series:** `route_progress_metrics` (one row per run on the route).
- **Series keys:** `route_progress_metrics.metric_date`, `metadata.fingerprint`. **New columns needed:** `temp_f`, `humidity_pct` (and derived `dew_point_f`) — written during the compute-facts route-metrics upsert by reading the workout's `weather_data` (`{ temperature, humidity }`, verified `get-weather/index.ts:6-16,178-181`). This is the one schema add.
- ⚠ **The route tables are not in version control.** Verified 2026-07-06: there is NO `CREATE TABLE` DDL for `route_clusters`, `route_progress_metrics`, or `workout_route_match` anywhere in `supabase/migrations/` — they exist only in the live DB. So the column add above must ship as a **new migration** (not a dashboard change), and this is the moment to backfill DDL for the three existing tables into `supabase/migrations/` so the schema is finally tracked.

### 4.2 The heat adjustment (the core new piece)

> **UPDATE 2026-07-06 — ACTIVE HEAT VARIABLE IS NOW AIR TEMPERATURE, not dew point.** Proved out on real data (user 45d122e7): in his dry climate dew point barely clears its 55°F reference (`heatTerm` SD < 1.4°F on every route), while **air temperature swings 30–40°F** (50→92°F) — temperature is the heat the body actually feels. Dew-only would have made the feature a near-no-op for him and re-admitted the summer-decline lie. So the model's heat term is now `max(0, temp_f − 60)` (neutral ref 60°F; endurance optima ~50–55°F, hinged at 60 so pleasant days aren't "corrected"). **Dew point is still captured and stored (`dewPointF`), but DORMANT** — the humid-climate refinement, to be reactivated (as a second regressor / proto-WBGT) when a humid-climate user exists. Everything below about the *shape* (one-sided hinge, learned-from-data coefficient, the `k` PROHIBITION) applies unchanged to the temperature term; just read "dew point" as "air temperature" and the reference as 60°F. The dew exposition is retained as the humid-path spec + provenance.

> **PROHIBITION — load-bearing, read before touching `k`.** `k` is an **HR-side** coefficient: the *fractional rise in HR per °F of dew point above neutral, at a fixed effort*. Pace-side coefficients (Vermeer's `0.025 min/mi/°F`, RunDida's %-slowdown tables) answer a **different** question — "how much to slow down to hold effort" (the output side) — and are **structurally invalid as a source for `k`**. Dropping a pace coefficient into `k` makes the correction *confidently wrong while looking sourced* — the exact failure this doc exists to prevent. The literature validates the *shape* only; it **cannot** hand you the number. Only **same-loop paired runs** (hot vs cool, equal known effort) can supply `k`'s magnitude — that paired-run tune is the *only* valid calibration, not a fallback.
>
> **Receipts (support under the prohibition, not a substitute for it):**
> - Ely et al., *Impact of weather on marathon-running performance* — dew point, not temp/RH, is the heat-stress variable (RH misleads: 90% at 40°F is fine, 90% at 80°F is not).
> - Vermeer (`(dew−60)×0.025 min/mi`), RunDida (%-slowdown tables) — cited as **what NOT to use for `k`**: these are pace-side.
> - Garmin/Firstbeat heat model — one-sided and threshold-gated (only engages above ~72°F ambient); nobody scales cool runs *down*. Confirms the `max(0, …)` shape.
>
> **Limitation (logged so the proxy is never mistaken for the driver):** dew point is a WBGT *proxy* — it captures humidity's grip on evaporative cooling but not radiant/solar load or air temperature directly. If residual scatter on the regression path proves too wide to detect real fitness trends, **air temperature is the higher-value second heat regressor** to add. Not built now; noted so a future session reaches for temperature (not a bigger `k`) when the proxy runs out of resolution.

Reference condition: **dew point ≤ 55°F = "neutral"** — the conservative end of the 55–60°F industry consensus band (Vermeer's knee is 60°F). Dew point (derived from temp + humidity) is used because it measures the moisture that governs whether sweat can evaporate.

```
heat_penalty = k * max(0, dew_point_f - DEW_REF)     // k = FRACTIONAL HR INFLATION per °F dew pt above ref (HR-side, NOT pace); DEW_REF = 55°F
adj_efficiency = efficiency_index * (1 + heat_penalty) // heat inflates HR → deflates observed efficiency; this restores the neutral-day value
```

- **One-sided by design** (`max(0, …)`): heat only ever inflates HR, so we only ever correct *upward*. We never scale a cool run down to look artificially fast (matches Garmin's threshold-gated model, and avoids the unbounded version's failure mode).
- `k` ships as a **documented population default** first (declared as a default, D-237 / Law 2), then is tuned against the athlete's own hot-vs-cool same-route runs — same class as the Q-127 DOMS coefficients. This paired-run tune is the sole valid magnitude source (see PROHIBITION).
- **High-N routes: regress it out (BUILT, Option B).** ⚠ NOT "fit `efficiency ~ dew_point` then trend the residuals over time" — that two-step is **biased** when dew point and time are correlated (they are, for a seasonal runner: Frisch–Waugh–Lovell). Instead: **one joint fit** `efficiency ~ heatTerm + time`, both covariates partialled out simultaneously; read the **time** coefficient. The fit is robust (**Huber IRLS**, so one GPS-glitch/sick-day run can't swing the line) and reports a **confidence interval**. On this path the regression LEARNS the per-route heat coefficient from the data — no external `k`. Implemented in `_shared/heat-adjust.ts` (`routeTrend`).

### 4.3 The route metric + gating
- **Metric (BUILT):** `routeTrend()` in `_shared/heat-adjust.ts` routes each route to the honest method and returns `{ method, direction, pct, ci, points, heatCoefPctPerF, spanDays }`.
- ⚠ **Base = `efficiency_index` (raw speed/HR), never `effort_adjusted_pace_sec_per_km`.** The heat adjustment corrects the HR side (§4.2). `effort_adjusted_pace_sec_per_km` is *already* HR-normalized (`pace × avgHr/refHr`), so heat-adjusting it would correct for HR **twice** — a double-correction that reads as a confident, wrong trend. Same failure family as the pace-vs-HR coefficient. Adjust `efficiency_index` only.
- **Routing (by N and dew-point spread):**
  - `N ≥ 8` comparable runs AND heat well-identified (SD of `heatTerm` ≥ 4°F) → **joint regression** (§4.2 Option B).
  - `N ≥ 8` but heat ~constant (all-cool or all-same-heat) → **`efficiency ~ time` only** (a constant heat can't confound the slope; it's absorbed by the intercept).
  - `N ≥ 8` but heat present-yet-under-identified → **linear-`k` fallback** (don't guess β_heat).
  - `N < 8` → **linear-`k` × half-vs-half** fallback (the ≥4 floor still applies; below → familiarity only).
- **Gating (so effort is comparable):** easy/steady aerobic only — hard efforts dropped by a **blocklist** (`isComparableIntent`: intervals/tempo/threshold/race/sprint/fartlek/hills out; easy/steady/long/unlabeled kept), so an unlabeled-but-easy history still trends.
- **Verdict is CI-gated (four states):** `improving`/`declining` require the CI to clear zero AND the point to pass the ±2% band; `holding` = CI sits entirely within ±2% (confidently flat); otherwise `still_learning` (too uncertain — never a faked arrow).
- **Rides:** power-per-HR — phase 2 (paired-run calibration degrades on a bike, §7 fork 5).

---

## 5. Surfaces

1. **Routes list** — the athlete's familiar routes: name, `times_run`, `first_seen`, last run. Its own view — "Routes", Strava-segments-style. A **route trend is macro**, so by the macro/micro rule (CONSTITUTION Law: Performance = this session) it does NOT belong crammed on the session card. **Placement = earned promotion, not static** (ruling 2026-07-06): the view always exists and is always reachable (via the session doorway below), but its **top-level prominence surfaces only once the user has a qualifying route** (enough comparable runs to trend). A top-level Routes destination that is empty for a no-repeated-loops user reads as broken — so the container itself must be honest about when it has nothing to say. This is the glass-box principle applied to the *container*, not just the verdict; the "run it 40×" doorway earns the room.
2. **Route detail** — tap a route → the heat-adjusted trend over time, glass-box: "at the same effort, weather-adjusted: improving," with the adjustment visible ("adjusted for air temperature"). Plus raw context (times, best, recent).
   - **Temperature unit setting (F/C) — TO BUILD in the UI block.** Storage + engine math stay in °F (canonical; `temp_f`, `TEMP_REF_F = 60`). The user's Fahrenheit/Celsius preference is a **display** concern only — convert temperatures shown in the glass-box copy ("at 78°F" → "at 26°C"). Check for an existing units preference (km/mi already exists) to extend rather than inventing a new one; do NOT convert the stored values or the coefficient.
3. **Session pointer** — the per-session line stays **familiarity only** ("Same route · run 40× since 2025") and becomes the **doorway** into that route's detail. No verdict on the session card.

## 6. Honesty gates (from the CONSTITUTION / CANON)
1. **Heat-adjustment is a population model** → a *directional* read, never a precise number. Hedge it; show it needs a few runs.
2. **Glass-box the adjustment** (Law 2 / D-242): show that/how the weather was removed ("adjusted for dew point 68°F"), never a bare "declining."
3. **Confidence-gated** (CANON §3): low N or wild condition variance → familiarity only / "still learning this route," never a faked direction.
4. **`k` carries its provenance** (Law 2, D-237): a default coefficient is declared as such; a tuned one says so.
5. **One source of truth** (Law 1): the route efficiency metric derives from the SAME `efficiency_index` State uses (heat-adjusted), so the route read and State can't contradict on the base metric — the route view is a *conditions-controlled zoom*, State the aggregate.

## 7. Forks — RESOLVED 2026-07-06 (research + Michael's rulings)
All five original forks are now ruled. Three closed on the physiology literature + incumbent survey; two on product judgment.
1. **Heat model:** ✅ **linear correction now** (ship, tune `k`), regression-residual when a route has ≥8 comparable runs. Research-backed shape.
2. **Reference condition:** ✅ **dew point ≤ 55°F** — conservative end of the 55–60°F consensus band. (§4.2)
3. **`k` default + source:** ✅ ship a documented **population default**, tune against the athlete's own hot/cool same-route runs. **`k` is HR-side; pace-side coefficients are invalid as a source** (see §4.2 PROHIBITION).
4. **Where the Routes view lives:** ✅ **own view, earned promotion** — always reachable via the session doorway; top-level prominence surfaces only once a qualifying route exists (§5.1).
5. **Rides:** ✅ **v2, power-per-HR.** Not merely "more work later" — the paired-run calibration that supplies `k` *breaks on a bike* (coasting, drafting, wind, traffic wreck the "same effort" premise). Runs-first is the domain where the only valid k-source holds. Rides need power-per-HR *because* paired-run calibration degrades on cycling.

## 8. Build order
1. **Schema + capture:** ship a **new migration** in `supabase/migrations/` adding `temp_f`/`humidity_pct`/`dew_point_f` to `route_progress_metrics` — and in the same migration, backfill the DDL for the three currently-untracked tables (`route_clusters`, `route_progress_metrics`, `workout_route_match`) so the schema is finally version-controlled. Then write the columns in compute-facts (read `weather_data.{temperature,humidity}`, derive dew point). Backfill existing rows from `weather_data`.
2. **Heat-adjust primitive:** `adjEfficiency(efficiency_index, dew_point, k)` in `_shared` + fixtures (hot and cool runs of equal fitness read equal).
3. **Route trend read:** heat-adjusted `routeEfficiencyDirection`, easy/steady-gated, confidence-hedged.
4. **Routes list + detail UI.**
5. **Wire the session line as the doorway.**
6. **Tune `k`** against real hot/cool same-route data; **rides** (power) as the follow-on.

## 9. What this is NOT
- Not a Strava-time leaderboard (raw times lie). Not on the session card (macro belongs on its own surface). Not a precise fitness number (it's a hedged, conditions-controlled *direction*).

## Changelog
- **2026-07-06 (SUPERSEDED — D-250 / Q-132)** — This whole approach is dead. Built + deployed the route-trend, proved it out on real data, and it flip-flops. Audit found the path-based route IDENTITY structurally unsound (over-merges 2.9–5.0mi into one route; fragments one trailhead into 4 clusters; double-matches runs via orphaned `route_progress_metrics` rows). Incumbents (Strava/Garmin) use fixed SEGMENTS, not variable-length routes. **Replacement: `DESIGN-segments.md`.** The read engine + heat/same-effort-pace reasoning (D-251/D-252) carry over; the route-identity substrate does not. Do not build from this doc.
- **2026-07-06 (proved out → switched to air temperature)** — Ran the engine against real backfilled data (105 rows). Finding: NO route reached the heat-regression path — not thin data (top route 34 comparable runs) but because dew point barely clears 55°F in a dry climate (`heatterm_sd` 0.6–1.4). Confirmed air temperature carries 6–13× the spread (temp_sd 6–9°F vs dew 0–1.4; ranges 50–92°F). **Switched the active heat variable from dew point to air temperature** (`heatTerm = max(0, temp_f − 60)`); dew point stays captured but dormant (humid-climate refinement). `compute-facts` unchanged (temp_f already captured) — no redeploy. 20 deno fixtures re-based on temperature, all green. Filed the F/C display-unit setting as a UI-block to-build (storage stays °F). This is exactly the WBGT-proxy limitation the doc pre-registered.
- **2026-07-06** — Created. Scoped the honest, heat-adjusted per-route performance feature on top of the built path-based route identity. Heat-adjustment method (dew-point normalization + bespoke `k`, regression-residual for high-N), the surfaces (Routes list/detail + session doorway), honesty gates tied to the CONSTITUTION/CANON, and a 6-step build order. Forks filed for Michael.
- **2026-07-06 (later)** — All 5 forks RESOLVED (research + rulings). Grounded §4.2 in the physiology literature and an incumbent survey (Strava/Garmin/TrainingPeaks all leave heat as an *uncorrected* confounder — the competitive gap is real, this is the product, not plumbing). Added the load-bearing **PROHIBITION**: `k` is HR-side; pace-side coefficients (Vermeer, RunDida) are structurally invalid as a `k` source — only same-loop paired runs supply the magnitude. **Fixed a bug already latent in this doc:** the §4.2 code comment previously read `// k = per-°F pace penalty` (pace-side — the exact prohibited error). Ruled: runs-only v1 (paired-run calibration breaks on bikes), earned-promotion placement (empty top-level room reads as broken — glass-box the container). To be logged as a D-NNN entry at session close.
- **2026-07-06 (engine built)** — Steps 1–5 of §8 shipped as engine code (UI still pending). Schema columns added + backfilled (105 rows). `_shared/heat-adjust.ts`: `dewPointF` (Magnus), `heatTerm` (hinged one-sided), `adjEfficiency`, and `routeTrend` — the routing + **joint robust regression (Option B)**. Method calls locked with Michael: **joint fit** (not residualize-then-trend — biased under dew/time correlation, FWL); **Huber-IRLS** robustness (swapped in for Theil–Sen, which doesn't compose with a multivariate joint fit — Huber delivers the same outlier resistance in one joint model); **CI-gated four-state verdict** (improving/declining/holding/still_learning); dew-spread gate to choose regression vs linear-`k`; **no partial pooling** (cross-route shrinkage = contamination). 21 deno fixtures green incl. heat-confound removal, genuine-improvement detection, outlier robustness, and the still_learning honesty gate. `compute-facts` deployed; `routeTrend` is read-side, not yet wired to a surface (steps: UI).
- **2026-07-06 (foundation trace)** — Verified all of §3's "already built" claims against real code (path identity, per-run metrics, per-workout weather, efficiency primitive) — all VERIFIED. Two corrections landed: (a) **`effort_adjusted_pace_sec_per_km` is NOT GAP** — it's an HR normalization (`pace × avgHr/refHr`, `compute-facts:797-801`); the base metric MUST be `efficiency_index` (raw speed/HR), never the already-HR-normalized column, or the heat adjustment double-counts HR (§3, §4.3). (b) **The route tables have no DDL in `supabase/migrations/`** — they live only in the prod DB; the column add must be a new migration, and this is the moment to backfill the three tables' DDL into version control (§4.1, §8).
