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

## Layer 2 — Swim-native template (DONE — Performance tab a44f9b2d; Details tab + polish D-159/D-160, 2026-06-15)

- `build.ts`: swim build branch shipped (a44f9b2d) — land HR-drift (`:1502`) + conditions/terrain/grade (`:1546`) guarded for swims; land pace nulled (Layer 1).
- **Performance tab** (`MobileSummary`→`PoolSwimOverall`): swim-native (a44f9b2d) + D-160 polish — distance/duration headline, trend-sign display fix (`verdictSignedPct`), Apple-Health nudge gated (`source==='healthkit' || pool_length>0`) + moved to bottom, rich-detail block (pool/lengths/strokes).
- **Details tab** (`CompletedTab`): D-159 — swim detection made **type-based** (`resolvedWorkoutType==='swim'`, not `swim_data` which is NULL for Strava); mph speed chart + mile splits + map + Grade/VAM/Cadence row now hidden for swims; swim readout grid renders from scalar data. HR Zones untouched.
- **Resolved sign-offs:** display in /100yd (locale/plan-inferred); yd-vs-m auto-detection from real pool length deferred to **Q-059** (needs HealthKit `pool_length`). Pool-swim narrative left suppressed (Q-038-clouded).
- **Verify owed:** on-device against the June 15 swim after deploy.

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
- **On-device test — what FORM→HealthKit actually writes:** ✅ lap length (25yd — the value Strava NULLs), stroke count, **true duration-with-seconds**, pool location, HR. ❌ NOT per-length splits / stroke-type / SWOLF. **FORM's HealthKit write permissions confirm this** (HR, swimming distance, swimming strokes, workouts).
- **So Tier A = widen the Swift plugin** to query lap length + stroke count + HR, and **feed the resolver a real `pool_length`** (device tier, replacing the 25yd default). Bounded native iOS work on existing rails. **Worth it — reliable, automatic.** Also fixes the integer-minute duration precision (HealthKit has seconds).

### Tier B — "Swim Breakdown" screengrab (opt-in)
- **Target = the FORM app's "Swim Breakdown" aggregate screen, NOT the per-length table.** One clean fixed-layout screen with the decision-useful aggregates: SWOLF (avg/best), distance-per-stroke, stroke count/length, stroke rate, pace/100, best 50/100, avg/max HR, total lengths, **stroke type**. Ideal single-screenshot vision-extraction conditions.
- **The per-length scrolling table (was "B2") is OUT** — messy multi-screenshot OCR; and the Breakdown screen *obsoletes* it (it's the aggregate of what per-length would compute). Skip the fragile path.

### HealthKit connection model (NOT like Garmin/Strava — shapes the dedup)
- **Strava/Garmin = cloud-to-cloud:** server-side OAuth, cross-platform, always-on; ingest is **server-side** (webhook → edge fn).
- **HealthKit = on-device local read:** no cloud API — the iPhone's local store, read via our native plugin, **iOS-only, only while the app is active**; the OS already aggregates FORM + Apple Watch and dedups at the OS level. Ingest is **client-side.**
- ⇒ The dedup must reconcile a **server-ingested Strava swim** against a **client-ingested HealthKit swim** — different routes, different timing.

### ⚠ PREREQUISITE before ANY HealthKit ingest — multi-source dedup (Runna/TrainerRoad pattern)
Researched how Runna / TrainerRoad / etc. handle multi-source sync. The industry pattern is **time-window dedup + source precedence + best-field-from-each MERGE** — NOT a "pick one source" radio, and NOT choosing up front. Ingest both, recognize same-swim, reconcile to one. (Supersedes the earlier "pick-one-up-front" sketch.)

**Design goal — friction-free:** existing Strava/Garmin users change nothing; Apple users who opt in get richer swim data; duplicates never reach the user.

1. **Keep the current Garmin/Strava source preference as the PRIMARY import** — unchanged, no new decision for existing users.
2. **Add "Connect Apple Health" as an optional TOGGLE (not a 4th radio)** — off by default, framed "pull richer swim data when available."
3. **When both active, dedup AUTOMATICALLY:** the industry-standard **60-second start-time window + sport + rough distance match** — handles the Strava integer-minutes vs HealthKit seconds-precision mismatch. Same swim from two sources → one workout.
4. **Best-field-from-each MERGE (Runna model):** HealthKit's real `pool_length` + seconds-duration + stroke count win where richer; Strava fills what HealthKit lacks. **One reconciled swim, not two.**
5. **Auto-detect overlap on connect (DC Rainmaker HealthKit-enumeration move):** on connecting Apple Health, enumerate existing HealthKit workouts, detect whether Strava already feeds the same swims, dedup silently.

**Scales to Apple Watch:** Apple Watch writes to HealthKit natively (no FORM needed) — same 60s window applies. **Triple-overlap** (FORM goggles + Apple Watch + Strava all recording the same swim) is handled by the same window → one merged workout.

**Source tag (supports the merge precedence):** Strava ingest **already captures `device_name`** (→ `device_info` JSON + `workout_metadata`, `ingest-activity:526/535/1175`) — so "is this a FORM swim?" / origin-device is available with no new capture. Used to bias the merge (FORM/HealthKit fields win for FORM swims).

**Today's gap (why this is the gate):** dedup is **per-source only** (upsert `onConflict` = `user_id,strava_activity_id` / `user_id,garmin_activity_id`, `ingest-activity:1205/1208`); HealthKit doesn't ingest workouts yet. **No cross-source matching exists** — so adding HealthKit ingest without this design ships double workouts. Do NOT build Tier A until the 60s-window match + best-field merge + auto-overlap-on-connect is implemented.

### Layer 3 summary
Two reliable tiers, per-length OCR skipped: **(A) HealthKit-extend** (automatic: pool length, seconds-duration, stroke count, HR — **gated on the multi-source dedup/merge: 60s window + best-field-from-each + auto-overlap-on-connect**) + **(B) Swim Breakdown single-screenshot import** (opt-in: SWOLF, efficiency, bests, stroke type). Both reliable; the fragile per-length table is dropped.
