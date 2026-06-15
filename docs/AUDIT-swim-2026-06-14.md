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
- **On-device test — what FORM→HealthKit actually writes:** ✅ lap length (25yd — the value Strava NULLs), stroke count, **true duration-with-seconds**, pool location, HR. ❌ NOT per-length splits / stroke-type / SWOLF. **FORM's HealthKit write permissions confirm this** (HR, swimming distance, swimming strokes, workouts).
- **So Tier A = widen the Swift plugin** to query lap length + stroke count + HR, and **feed the resolver a real `pool_length`** (device tier, replacing the 25yd default). Bounded native iOS work on existing rails. **Worth it — reliable, automatic.** Also fixes the integer-minute duration precision (HealthKit has seconds).

### Tier B — "Swim Breakdown" screengrab (opt-in)
- **Target = the FORM app's "Swim Breakdown" aggregate screen, NOT the per-length table.** One clean fixed-layout screen with the decision-useful aggregates: SWOLF (avg/best), distance-per-stroke, stroke count/length, stroke rate, pace/100, best 50/100, avg/max HR, total lengths, **stroke type**. Ideal single-screenshot vision-extraction conditions.
- **The per-length scrolling table (was "B2") is OUT** — messy multi-screenshot OCR; and the Breakdown screen *obsoletes* it (it's the aggregate of what per-length would compute). Skip the fragile path.

### HealthKit connection model (NOT like Garmin/Strava — shapes the dedup)
- **Strava/Garmin = cloud-to-cloud:** server-side OAuth, cross-platform, always-on; ingest is **server-side** (webhook → edge fn).
- **HealthKit = on-device local read:** no cloud API — the iPhone's local store, read via our native plugin, **iOS-only, only while the app is active**; the OS already aggregates FORM + Apple Watch and dedups at the OS level. Ingest is **client-side.**
- ⇒ The dedup must reconcile a **server-ingested Strava swim** against a **client-ingested HealthKit swim** — different routes, different timing.

### ⚠ PREREQUISITE before ANY HealthKit ingest — dedup by SOURCE PRECEDENCE (not fuzzy matching)
FORM writes the same swim to BOTH HealthKit and Strava → dup risk. **Solve by choosing the source UP FRONT — never create the duplicate** (no fuzzy time/distance reconciliation after the fact):
- **Strava only connected →** Strava (status quo).
- **HealthKit only →** HealthKit.
- **Both connected →** **HealthKit is the swim source-of-truth for FORM swims, skip Strava** (HealthKit has real `pool_length` + seconds-precise duration + stroke count).
- **Key on the FORM source tag** — Strava activities carry "FORM goggles" in `device_name`; HealthKit carries source=FORM. Applies to **FORM-originated swims only.**

**Generalizes (origin device → carriers → pick the richest, ingest once):**
- FORM swim = HealthKit + Strava (dup risk → precedence).
- Garmin swim = Strava only — **Garmin does NOT write to HealthKit by default**, so one carrier, no dup.
- Rule: identify the origin device + which carriers have the swim, pick the richest carrier, ingest once. **Degrades gracefully** (one carrier → use it; two → precedence).
- **Known hard edge (flag, do NOT build):** FORM + a Garmin watch together for open-water could put the same swim on multiple paths where "one origin" breaks — there, a source-tag + time-window fallback match may be needed.

**Audit prerequisite — ANSWERED:** our Strava ingest **does capture `device_name`** (→ `device_info` JSON + `workout_metadata`, `ingest-activity:526/535/1175`). So the FORM-vs-Garmin-vs-AppleWatch origin tag precedence keys on **is already available** — no new capture needed; precedence reads `device_info.device_name`.

**Gate:** do NOT build HealthKit ingest until this source-precedence selection (+ the FORM-source-tag detection) is designed. Scoped as part of Tier A.

### Layer 3 summary
Two reliable tiers, per-length OCR skipped: **(A) HealthKit-extend** (automatic: pool length, seconds-duration, stroke count, HR — **gated on dedup-by-precedence**) + **(B) Swim Breakdown single-screenshot import** (opt-in: SWOLF, efficiency, bests, stroke type). Both reliable; the fragile per-length table is dropped.
