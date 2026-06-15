# AUDIT — Swim is mis-wired + under-built (2026-06-14)

Read-only audit triggered by live screenshots: a pool swim renders "701:00" duration, 2263% adherence, "5:03/mi" pace, "61 spm" cadence, and an mph speed chart. Grounded in the actual stored record for the 2026-06-01 swim (18 min / 800m / 875yd), which **contradicted a code-only inventory** — so findings here are from real data, not just code paths. Cross-ref **Q-038**.

## Three problems

### 1. The number bug — ROOT CAUSE (the filing's premises were both wrong)

The filing guessed "seconds-vs-minutes parse" or "wrong analyzer routing." Both wrong. The ingest is fine — the scalar `moving_time` is stored correctly (18 min). The bug: **sample-derived swim values override the correct scalar-derived ones** (same class as Q-054 / D-112 / D-115 — an unreliable sensor value beating an authoritative scalar).

- `compute-workout-summary` set `computed.overall.duration_s_moving` from the **pool-swim sample timespan** (`rows[last].t − rows[0].t` = 42060s ≈ 39× the true 1080s; pool swims have sparse/odd sample timestamps). **Priority-1 reuse made it STICKY** (recompute re-read the bad 42060 before trying `moving_time`). 42060 ÷ 60 = **701:00**; 42060 ÷ planned-1859s = **2263%**.
- `compute-facts:1276` let the sample-derived `analysis.swim.avg_pace_per_100m` (188) **override** the correct scalar pace (135 = `moving_time×60×100/distance`).

### 2. Wrong sport template — under-built

`analyze-swim-workout` IS selected (routing is fine). The problem: swim has **no swim-native render path** — it falls through the shared endurance builder.
- `build.ts` emits land metrics for swims (`avg_pace_s_per_mi`, grade/terrain rows, HR-drift) with no swim guard, while bike/run rows ARE sport-guarded (`if (sport === 'ride')` for power/VAM, run-only for pacing).
- Client `MobileSummary` routes run/ride/swim through one endurance return; the only swim gate (`is_pool_swim`, ~line 207/266) merely hides `SessionNarrative` — it does not switch templates or suppress the land rows / `EnduranceIntervalTable` / mph speed chart.
- A `PoolSwimOverall` block exists (distance/duration only) via an early-return inside `EnduranceIntervalTable`; there is **no** full swim-native view.

### 3. Rich source data — half stored, mostly not surfaced (live record corrects the code audit)

The live 2026-06-01 record: `swim_data = NULL`, `pool_length = NULL`, `number_of_active_lengths = NULL`. So the per-length / stroke / pool / SWOLF data the code *can* extract is **not actually captured for Strava swims**. What IS stored: `distance`, `moving_time` (correct), `avg_hr` (138), `max_hr`, `avg_cadence_spm` (61), and a `computed.analysis.swim` block + HR series.

| FORM/Strava field | Stored? | Surfaced? |
|---|---|---|
| distance, moving_time, avg_hr, max_hr | ✅ | partly |
| `computed.analysis.swim` + HR series | ✅ | ❌ |
| pool_length, lengths[], stroke_type, SWOLF, per-interval | ❌ **NULL** (not captured for Strava) | n/a |

So "we have more than we show" is **half true**: HR + distance + a swim-analysis block are stored-and-unshown (surface-able now); per-length/stroke/pool require **ingest work first** (the data isn't being captured).

## Layer 1 — Trustworthy numbers (SHIPPED 2026-06-14, commit `e77cb3ad`)

- **compute-workout-summary:** swim duration clamped to the authoritative scalar `moving_time` at the single `writeComputed` choke point (catches all branches, self-heals the sticky value).
- **compute-facts:** swim pace made scalar-authoritative (the analysis pace is fallback-only).
- **build.ts:** `avg_pace_s_per_mi` / `avg_gap_s_per_mi` nulled for swims (kills "5:03/mi").
- **Verified** on 3 real swims: `duration_s_moving` 42060→1080/1800/1440; `pace_per_100m` 188→135/131/129.
- Residual (cosmetic): `moving_time` stored as integer minutes → duration reads ~18:00 not 18:12 (precision lost at ingest).

## Layer 2 — Swim-native template (NEXT)

- `build.ts`: a swim build branch; **guard out** the land rows firing for swims — HR-drift (~1484), conditions/terrain/grade (~1542) — and stop emitting speed/cadence land data.
- Client `MobileSummary.tsx`: a swim render branch (or `SwimSessionView`) replacing `EnduranceIntervalTable` + the mph speed chart with a swim layout — pace/100 (yd/m), distance, HR, per-length when available.
- Sign-offs: exactly what the swim screen shows; yd-vs-m unit handling.

## Layer 3 — richer FORM swim data (scoped 2026-06-14; ingest-path problem, not display)

The rich fields (per-length, stroke, pool length, SWOLF) are **not a display gap — they never reach Efforts.** Strava strips them. So Layer 3 = "get a richer source," scoped to **two clean tiers; the per-length OCR table is explicitly SKIPPED.**

### FORM ingest reality (researched)
- **FORM captures rich at source** (stroke 99.7%, pool-length count 99.8%, per-length, SWOLF — validated).
- **Strava is the lossy path** — strips pool_length, per-length, stroke (confirmed: our NULL `pool_length`).
- **FORM→Garmin is DEAD** — one-directional (Garmin→FORM only); FORM won't sync swims TO Garmin.
- **No FORM public API** — devs can't get technical responses; FORM only consumes Garmin/Apple APIs.
- FORM syncs direct to Strava, **Apple Health**, TrainingPeaks, TriDot, Final Surge.
- ⇒ **Apple Health is the best *automatic* path** — an upgrade over Strava, but summary-level (see test below).

### Tier A — HealthKit-extend (automatic) — verdict: EXTEND, not rebuild
- **Rails already exist + work** (not abandoned): `src/services/healthkit.ts` (177 lines), native `ios/App/App/HealthKitPlugin.swift` (142 lines, registered), auto-auth in `AppContext`, `Connections.tsx` UI. But **summary-only** — `readWorkouts` returns `{ activityType, duration, totalDistance, totalCalories, sourceName }`; queries **no** lap/stroke/pool data.
- **On-device test — what FORM→HealthKit actually writes:** ✅ lap length (25yd — the value Strava NULLs), stroke count, **true duration-with-seconds**, pool location, HR. ❌ NOT per-length splits / stroke-type / SWOLF.
- **So Tier A = widen the Swift plugin** to query lap length + stroke count + HR, and **feed the resolver a real `pool_length`** (device tier, replacing the 25yd default). Bounded native iOS work on existing rails. **Worth it — reliable, automatic.** Also fixes the integer-minute duration precision (HealthKit has seconds).

### Tier B — "Swim Breakdown" screengrab (opt-in)
- **Target = the FORM app's "Swim Breakdown" aggregate screen, NOT the per-length table.** One clean fixed-layout screen with the decision-useful aggregates: SWOLF (avg/best), distance-per-stroke, stroke count/length, stroke rate, pace/100, best 50/100, avg/max HR, total lengths. Ideal single-screenshot vision-extraction conditions.
- **The per-length scrolling table (was "B2") is OUT** — messy multi-screenshot OCR; and the Breakdown screen *obsoletes* it (it's the aggregate of what per-length would compute). Skip the fragile path.

### ⚠ PREREQUISITE before ANY HealthKit ingest — same-swim dedup + source precedence
- **Today's dedup is PER-SOURCE ONLY:** upsert `onConflict` = `user_id,strava_activity_id` or `user_id,garmin_activity_id` (`ingest-activity:1205/1208`). **No cross-source matching.** HealthKit doesn't ingest workouts yet (read-only plugin).
- **The risk:** a user with BOTH Strava + HealthKit connected → FORM syncs the same swim to both → different conflict keys → **two duplicate workouts.**
- **What the match needs (tolerance, not exact ID — there's no shared external id across Strava/HealthKit):** `user_id` + discipline=swim + **start-time within a window** (Strava integer-minute vs HealthKit seconds → ±~60–90s) + **distance within tolerance** (won't be exactly equal).
- **Beyond drop-the-dup — SOURCE PRECEDENCE:** HealthKit has the richer fields (real `pool_length`, seconds-precise duration, stroke count) vs Strava's stripped version. Goal = "recognize same-swim, **keep the best fields from each**" — HealthKit's pool_length/duration/strokes win over Strava's.
- **Gate:** do NOT build HealthKit ingest until same-swim dedup + source-precedence merge is designed. Scoped as part of Tier A.

### Layer 3 summary
Two reliable tiers, per-length OCR skipped: **(A) HealthKit-extend** (automatic: pool length, seconds-duration, stroke count, HR — gated on the dedup prerequisite) + **(B) Swim Breakdown single-screenshot import** (opt-in: SWOLF, efficiency, bests). Both reliable; the fragile per-length table is dropped.
