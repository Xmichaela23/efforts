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

## Layer 3 — FORM metrics ingest + surface (BIGGEST; ingest-first)

- **Ingest investigation FIRST:** trace why the Strava swim payload's `swim_data` (lengths, stroke_type, pool_length, per-interval) isn't populating (live record shows NULL despite extraction code). It may require the Garmin/FORM-direct path rather than Strava.
- Then store + surface: per-length pace bars, stroke type, SWOLF, pool length.
- Sign-offs: confirm the source actually sends per-length data for FORM activities before building display.
