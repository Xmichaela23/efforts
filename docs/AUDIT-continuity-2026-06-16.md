# AUDIT — Continuity / Single-Source (2026-06-16)

**Type:** READ-ONLY mapping pass. Nothing was changed. This catalogs where every meaningful value is computed, whether it is single-sourced, and whether all surfaces read the same value or re-derive it.

**Principle being audited:** *meaningful values computed once, server-side; the client formats but never recomputes; every surface reads one source.*

**Method:** three parallel read-only Explore passes (endurance server-side; strength + load + trend; client-side math) + direct vetting of the high-stakes claims against code (the swim work showed agent passes over-flag "active" — every ACTIVE claim here was checked by hand). Classifications below are my vetted verdicts, not the raw agent output. Where I downgraded an agent flag, it's noted in §Vetting.

**Reference pattern (the bar):** the swim arc (D-167/D-182) is the exemplar — pace via ONE fn `_shared/swim/swim-pace.ts swimPacePer100Seconds()` fed by ONE input resolver `_shared/swim/swim-scalars.ts resolveSwimScalars()` (raw `workouts` columns), read identically by card / narrative / Details. Guardrail: `docs/SPEC-honest-swim-inference.md`.

---

## HEADLINE

- **No confirmed ACTIVE divergence** — I could not find a single value where two surfaces demonstrably show *different numbers today*. All three "ACTIVE" flags the agents raised (run decoupling, client GAP recompute, useWorkoutData swim pace) were vetted and **downgraded** (see §Vetting). Treat "ACTIVE" as **empty** until a repro shows otherwise.
- **The real story is LATENT + STRUCTURAL:** the swim-D-182 class (card reads `computed.overall`, narrative recomputes from samples) **exists structurally for RUN**, currently consistent because both trace to the same samples. Run has **no single-source resolver** like swim's `resolveSwimScalars` or ride's `rideComputedNp` — it's the brittlest endurance surface and the most worthy of the swim treatment.
- **Cleanest areas (genuinely single-sourced, verified):** **ride power/NP/IF** (`rideComputedNp` resolver), **strength e1RM** (`brzycki1RM`→`exercise_log`), **load/ACWR verdict** (`acwrVolumeLabel`, D-153), and the **state-trend spine** (`assembleStateTrends`, one path client+server, D-150/D-151). These are the proof the pattern works when applied.
- **Client-side:** ~80% of client math is pure formatting (clean). The one real concentration of client *recompute* is the **Details tab (`CompletedTab.tsx`)**, which re-derives GAP / VAM / SWOLF / swim-set detection / total-work from raw data with its **own formulas** — a parallel client math layer beside the server contract. Latent divergence risk (Details vs Performance card), several paths muted by guards.

**Counts (vetted):** CLEAN ≈ majority · LATENT ≈ 14 distinct values/sites · ACTIVE = 0 confirmed.

---

# HALF 1 — Server-side determinism / single-source

## RUN

| Value | Where computed | Single-sourced? | Consumers read same source? | Flag |
|---|---|---|---|---|
| **Pace (s/mi)** | `compute-facts` from `computed.overall.avg_pace_*` (write by compute-workout-summary); narrative `analyze-running-workout` re-derives from sensor samples (`enrichSamplesWithGAP`/granular) | **NO** (two derivations) | Card reads `compOverall.avg_pace_s_per_mi ?? fpFacts` (`build.ts:458`); narrative reads sample-derived. Same upstream samples → currently agree | **LATENT** (swim-D-182 class; no resolver) |
| **GAP (s/mi)** | `_shared/gap.ts enrichSamplesWithGAP` (memory-only during analysis); not persisted as a scalar; `compute-facts` writes an *effort*-adjusted (HR-ratio) pace to `route_progress_metrics.effort_adjusted_pace_sec_per_km` (a DIFFERENT concept) | **NO** | Card reads `compOverall.avg_gap_s_per_mi ?? fpFacts.avg_gap_sec_per_mi` (`build.ts:459`) — **often null** (compute-facts doesn't populate GAP scalar); narrative uses live sample GAP for decoupling | **LATENT** (card GAP frequently absent; "GAP" and "effort-adjusted pace" are two different things sharing vocabulary) |
| **HR avg** | `compute-facts` first-positive of `avg_heart_rate`/`computed.overall.avg_hr` | **YES** | Card `build.ts:461`; narrative same raw column | **CLEAN** |
| **Decoupling / HR drift** | `compute-facts:~1120` computes `hr_drift_pct`; analyzer `lib/heart-rate` computes `heart_rate_summary.decouplingPct` (D-036, GAP-based, warmup-skipped) — **two computations** | **NO** | Card reads the **analyzer's** `heart_rate_summary` (`build.ts:~704`); `facts.hr_drift_pct` has no confirmed display consumer | **LATENT** (dual compute, single display; agent's "ACTIVE" downgraded — see §Vetting) |
| **Adherence (pace/duration/execution)** | `analyze-running-workout/lib/adherence/granular-pace.ts` → `workout_analysis.{granular_analysis,performance}` | **YES** | Card (`build.ts:190-217`), narrative, Details all read `workout_analysis.performance` | **CLEAN** |
| **Interval breakdown** | `granular-pace.ts` → `workout_analysis` | **YES** | Card (with a synth fallback `build.ts:319-359`), narrative, Details | **CLEAN** |

## RIDE

| Value | Where computed | Single-sourced? | Consumers read same source? | Flag |
|---|---|---|---|---|
| **NP (normalized power)** | resolver `rideComputedNp()` (`_shared/.../np-trend.ts`) — canonical read order (top-level col → `computed.analysis.power`); `compute-facts` uses it | **YES** | fact-packet, trend, card fallback all go through the resolver / `factPacket.facts` | **CLEAN** (the ride exemplar) |
| **Avg power** | `compute-facts` first-positive of `avg_power`/`computed.overall.avg_power_w` | **YES** | factPacket → card/narrative/Details | **CLEAN** |
| **IF** | `compute-facts` = NP / `resolveCurrentFtp(baselines)` | **YES** | factPacket | **CLEAN** |
| **TSS** | formula `_shared/cycling-v1/ride-physiology.ts computeTSS()`; **not persisted** to facts | single formula, **no stored value** | not surfaced on card/Details; internal CTL/ATL only | **LATENT** (missing-field; if ever surfaced, each surface would recompute) |
| **Power adherence** | `analyze-cycling-workout` (`calculate*PowerAdherence`) → `workout_analysis.performance` + per-interval | **YES** | card (`build.ts` cycling branch), narrative (`generateCyclingAdherenceSummary`), Details | **CLEAN** |
| **HR drift** | `compute-facts hr_drift_pct` AND analyzer `analyzeHeartRate` (`hr_drift_bpm`) — narrative converts bpm→% itself | **NO** (two compute) | narrative/adherence-summary use the **analyzer's** bpm-derived %; facts version not the display source | **LATENT** |
| **VI (variability index)** | analyzer `calculatePowerVariability` (= NP/AP) → `workout_analysis`; fact-packet may also carry it | likely single (analyzer) | card fallback reads `factPacket.facts.variability_index` | **LATENT** (confirm one writer; agent unverified) |
| **Interval breakdown** | `analyze-cycling-workout generateIntervalBreakdown` → `workout_analysis` | **YES** | card/narrative/Details | **CLEAN** |

## SWIM (reference — already single-sourced, D-182)

| Value | Where computed | Single-sourced? | Consumers | Flag |
|---|---|---|---|---|
| **Pace /100** | `swimPacePer100Seconds()` fed by `resolveSwimScalars()` (raw cols) | **YES** | card (`build.ts:462` via `workout-detail`), narrative (`analyze-swim:331`), Details — all one fn/one input | **CLEAN** |
| **HR avg** | `resolveSwimScalars()` (raw `avg_heart_rate`) | **YES** | card `build.ts:461`, narrative | **CLEAN** |
| **Adherence (pace/duration/exec)** | `analyze-swim-workout` → `workout_analysis.performance` (duration vs **elapsed**, D-163) | **YES** | card/narrative/Details | **CLEAN** |
| **Trend substrate `pace_per_100m`** | `compute-facts buildSwimFacts` (blended, **fin-blind**) | YES (one writer) | state-trend/swim | **LATENT integrity** (Q-061 — fin-blind; Q-065 fixed the stale-methodology variant) |

## CROSS-CUTTING — Strength / Load / Trend

| Value | Where computed | Single-sourced? | Consumers | Flag |
|---|---|---|---|---|
| **e1RM** | `compute-facts brzycki1RM` → `exercise_log.estimated_1rm` → agg `learned_fitness.strength_1rms` | **YES** (canonical) | `useExerciseLog`, `assembleStateTrends`, plan loads (`materialize-plan`), coach | **CLEAN** — but a **dead Epley path** exists (`compute-adaptation-metrics estimate1Rm` → `computed.adaptation`, read only by `block-adaptation`); D-116/Q-041. **LATENT** dual-path (isolated; verify the two never need to agree) |
| **avg RIR / session volume / session_load** | `compute-facts` + `_shared/session-load.ts` → `exercise_log` / `session_load` | **YES** | `useExerciseLog`, snapshot aggregation | **CLEAN** |
| **workload per session** | `compute-facts computeWorkload` → `workout_facts.workload` | **YES** | `compute-snapshot` weekly/chronic agg | **CLEAN** |
| **ACWR** | `compute-snapshot` = currentWeek workload / chronic(4wk avg) → `athlete_snapshot.acwr` | **YES** | home LoadBar, STATE LoadBar, coach — all read the cache | **CLEAN** |
| **Volume verdict (`acwrVolumeLabel`)** | `src/lib/load-headline.ts` deterministic bands | **YES** | LoadBar + headline + coach all import the one fn (D-153) | **CLEAN** |
| **Per-discipline trend / verdict / pctChange** | `_shared/state-trend/assemble.ts assembleStateTrends()` (one assembler) | **YES** | client `useStateTrends` AND server `compute-snapshot` call it identically; cached `state_trends_v1` read by STATE / session-detail `discipline_trend` (pass-through, not re-derived) / coach `fitness_direction` (D-150/D-151) | **CLEAN** (strongest single-source in the app) |
| **Headline / fitness_direction rollup** | `headline.ts synthesizeHeadline` / `assemble.ts rollupFitnessDirection` | **YES** | STATE + coach read cache | **CLEAN** |

**Structural fracture note:** each discipline analyzer is its own silo (run/ride/swim/strength) with **no shared helpers** for pace/HR/adherence — defensible (domains differ: run=GAP, ride=power, swim=no-GPS), but it means a fix in one (swim D-182) does **not** propagate. Ride and swim each grew a single-source resolver; **run did not** — run pace/GAP/decoupling are the only endurance values still read off `computed.overall` on the card without a resolver mediating.

---

# HALF 2 — Client-side math (format vs recompute)

**Rule:** FORMAT a server value = fine. RECOMPUTE the value from raw inputs = drift risk. The server ships a pre-formatted contract `session_detail_v1` (`build.ts`); the **Performance tab** (`MobileSummary`) renders it. The **Details tab** (`CompletedTab.tsx`) is a separate, older surface that does its own math off `workoutData.computed` — that's where the recompute cluster lives.

### RECOMPUTE cluster — Details tab (`CompletedTab.tsx`) — LATENT divergence vs the Performance card

| Site | Value | Note | Flag |
|---|---|---|---|
| `CompletedTab.tsx:1216-1289` | **GAP** | Client re-derives GAP from total distance/duration/elevation with **its own coefficients** (1.2 up / 0.8 down) — a *different* formula than the server's sample-level GAP. **BUT** gated `if (!swim_data && !walk_data) return null` → **inert for normal Strava runs**. Where it fires (walks) it can disagree with the card. | **LATENT** (divergent formula; largely dead path — agent "ACTIVE" downgraded) |
| `CompletedTab.tsx:1322-1325`, `:1183` | **VAM** | recompute `elevation/(dur/3600)`; server has `workout_facts.vam_m_per_hour`, not read | **LATENT** |
| `CompletedTab.tsx:1008-1028`, `:894`, `:1024` | **SWOLF / strokes-per-length / sec-per-length** | recompute from raw counts; server `swim_facts` not read | **LATENT** |
| `CompletedTab.tsx:948-1005`, `:960-970` | **Swim set detection + per-set pace** | client clusters laps (±5%) into warmup/main/cooldown; server has structured sets | **LATENT** (intentional drill-down heuristic) |
| `CompletedTab.tsx:993-995`, `:914` | **Pool length / lengths-per-split inference** | derives pool length from distance/count; server has `pool_length_m` | **LATENT** |
| `CompletedTab.tsx:1149-1157` | **Total work (kJ)** | prefers `total_work/1000`, falls back to `avg_power*dur/1000` | **LATENT** (fallback only) |

### RECOMPUTE — other components

| Site | Value | Note | Flag |
|---|---|---|---|
| `utils/workoutDataDerivation.ts:106-107` / `useWorkoutData.ts:106-107` | **Swim pace /100** | client computes `dur/(dist/100)` — **mirrors the server `resolveSwimScalars` formula** (same raw inputs), preferred over stale `computed.analysis.swim` (D-162/D-182 intent). Consistent because it copies the server formula. | **LATENT** (agent "ACTIVE" downgraded — it matches the server by construction; risk only if one formula changes) |
| `StrengthCompareTable.tsx:36-43`, `:211-212`, `:248` | **Strength volume + avg RIR** | client sums per-set volume and averages RIR; server has `exercise_log.avg_rir` / volume. (This file intentionally queries tables directly per CLAUDE.md, but the **math** duplicates the server.) | **LATENT** |
| `context/StateTab.tsx:1438-1441` | **e1RM % of peak** | `Math.round(current/peak*100)` from server scalars — a display ratio of server values | **LATENT** (borderline; it's a ratio of two server numbers, not a re-derived e1RM) |
| `TrainingBaselines.tsx:561-571`, `:609-615` | **HR zones (Friel/Karvonen) + power zones (Coggan)** | client derives zone bands from threshold/FTP for the **baselines editor**; falls back to server `configured_hr_zones` override when present | **LATENT / arguably CLEAN** (this is a config-authoring surface computing a *proposal*, not a display-of-record; reads the server override when it exists) |

### FORMAT (clean) — representative

| Site | Value | Why clean |
|---|---|---|
| `EnduranceIntervalTable.tsx:470,496,613` | m↔yd, pool length display | unit conversion of a server value |
| `MobileSummary.tsx:33-35`, `StatePerformanceSection.tsx:25-27`, `EnduranceIntervalTable.tsx:517-518` | **trend % sign** | D-160 — re-signs server `pctChange` by verdict for display (sign only; magnitude is the server's) |
| `LoadBar.tsx:34-83,136-151`, `ui/charts.tsx:225-229` | ACWR gauge / bar / label | reads server `acwr`, applies the shared `acwrVolumeLabel()` |
| `useWorkoutData.ts:39-89` | display metrics, avg speed/pace/max-pace | **prefers `display_metrics` from server; recomputes ONLY when the server field is null** (correct smart-server/dumb-client fallback) |
| `useStateTrends.ts:123-131` | bike/run/swim/adherence assembly | calls the **shared** `assembleStateTrends()` (same fn as the server cache) — single-source by construction |
| `AthleticRecordPage.tsx`, time formatters | sec→m:ss | pure formatting |

---

## Vetting (what I downgraded from the agent passes, and why)

1. **Run decoupling "ACTIVE" → LATENT.** Agent: "card reads analyzer decoupling, facts also compute hr_drift." Verified: the card reads the **analyzer's** `heart_rate_summary.decouplingPct`; `compute-facts.hr_drift_pct` has **no confirmed display consumer**. Two computations exist (latent), but no two surfaces show different drift today. Same for ride HR drift.
2. **Client GAP "ACTIVE" → LATENT/near-dead.** Verified `CompletedTab.tsx:1218` guard `if (!swim_data && !walk_data) return null` — for a normal Strava run (no swim_data/walk_data) it returns null, so the divergent-formula GAP doesn't render. Real recompute, but inert for the discipline it would matter for.
3. **useWorkoutData swim pace "ACTIVE" → LATENT.** It recomputes from the **same raw scalar the server uses** (`resolveSwimScalars` formula), so it agrees by construction; risk only if one side's formula changes.
4. **Could NOT fully verify (agent-reported, left LATENT):** ride VI single-writer; exact line numbers in `granular-pace.ts`; whether `compute-facts` ever populates `avg_gap_sec_per_mi` (I believe not). Flagged honestly rather than asserted.

---

## The picture (for prioritization — NOT a fix list)

**Clean and proven (leave alone):** ride power/NP/IF; strength e1RM/RIR/load; ACWR + `acwrVolumeLabel`; the state-trend spine; swim pace/HR (post-D-182); run adherence/intervals.

**Latent, structural — the swim-D-182 pattern not yet applied to RUN:** run **pace/GAP/decoupling** are read off `computed.overall` on the card while the narrative recomputes from samples, with no resolver mediating. Currently consistent; the highest-leverage place to apply the swim treatment (a `resolveRunScalars`-style single source) if/when it's judged worth it.

**Latent, client parallel-math — the Details tab:** `CompletedTab.tsx` is a second math layer (GAP/VAM/SWOLF/sets/work) beside the server contract. Some paths are dead (GAP guard), some intentional drill-down heuristics (swim set clustering), but it's the structural opposite of "client formats, never recomputes." Consolidating Details onto `session_detail_v1` would erase the whole cluster.

**Latent, isolated:** the dead Epley e1RM path (`compute-adaptation-metrics`, Q-041); ride TSS not persisted; `StrengthCompareTable` volume/RIR re-summing.

**Integrity (already filed):** swim trend substrate is fin-blind (Q-061) — a correctness gap, not a single-source one.

**Active divergences:** none confirmed. Any future "the card and the Details tab disagree" report most likely traces to the run `computed.overall`-vs-samples latent class or the Details-tab parallel math — start there.
