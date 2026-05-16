# Cycling Analysis Design — Intent-Aware Modes, Segment Intelligence, Arc Integration

**Status:** Design spec. Date: 2026-05-16. No code in this document.

**Grounding:** every data claim here is backed by the read-only pipeline audit performed 2026-05-16 (file:line citations in §"Ground Truth"). Where a capability does not exist yet, it is marked ❌ and traced to the absence, not assumed.

---

## Principle

Every ride has an intent — prescribed or inferred. Analysis grades against that intent. Arc is the connective tissue across all surfaces: per-workout narrative, coach, STATE screen, plan generation.

A ride is never analyzed "in a vacuum." The questions worth answering are always relative:

- *Did you do what the plan asked?* (plan-linked)
- *Are you getting stronger?* (unplanned, fitness-trend)
- *Are you faster on this terrain at lower cost?* (segment)
- *Are you adapting to the race course?* (race-segment)

Power, heart rate, and speed are **analysis inputs**, not display metrics. The same 210 W means different things at 138 bpm vs 158 bpm, on a 6% grade vs flat, in week 2 of base vs three days from an A race. The job of this system is to interpret the number, not echo it.

---

## Primary Architectural Constraint — Strava vs Garmin

**This is the single biggest design constraint and it shapes every mode below.** Segment-level intelligence is only possible for rides synced through Strava.

| Capability | Strava | Garmin Edge 1040 |
|---|---|---|
| Segment efforts (the basis of Modes 3 & 4) | ✅ `workouts.achievements` (`ingest-activity:403,426-439,520`) | ❌ not exposed by Garmin API |
| Normalized power | ✅ native (`weighted_average_watts`) | ❌ not sent — we recompute from power samples in `compute-workout-analysis` |
| Map polyline / route geometry | ✅ encoded polyline | ❌ GPS-track reconstruction only |
| Indoor/trainer flag | ✅ | ❌ |
| Elevation loss | ❌ | ✅ |
| Power / HR / speed / distance / elevation / laps / cadence | ✅ | ✅ (parity, different field names; normalized in ingest) |

**Implications, load-bearing for the rest of this doc:**

1. **Modes 3 and 4 (segment intelligence) cannot rely on a single source of truth.** A Garmin-only rider has *no segment efforts at all*. Any segment feature must either (a) degrade gracefully to Mode 2 for Garmin rides, or (b) build a route-geometry segment-matcher that works from the GPS track both providers do supply. The doc treats (a) as the near-term answer and (b) as the eventual unifier.
2. **Normalized power parity is achieved post-ingest, not at ingest.** Garmin NP is derived by our own `compute-workout-analysis` from the power-sample series. Anything reading NP must read the *computed* canonical path (`computed.analysis.power.normalized_power`), never the raw `workouts.normalized_power` column (null for Garmin).
3. **Race-course matching (Mode 4) is hardest for Garmin** because it lacks the polyline; matching must run off the reconstructed GPS track.
4. The honest framing for users: *segment and race-terrain intelligence is a Strava-connected feature today.* Don't promise it uniformly until the GPS-track matcher exists.

---

## Signal Types

Three signal families. Each is an input to analysis, interpreted in context — not a row to print.

### Power
The primary cycling load signal. Canonical normalized power lives at `computed.analysis.power.normalized_power` (`compute-workout-analysis:1388-1398`); also `variability_index` (NP/AP), `intensity_factor` (NP/FTP). Power-duration bests (`power_curve`: 5s/1min/5min/20min/60min) at `compute-workout-analysis:86-120` (requires ≥60 power samples). Power alone answers "how hard," not "how fit" or "how efficient" — it needs HR and terrain to become meaningful.

### Heart rate — a performance signal, not a metric
- **HR at a given power = aerobic efficiency.** Same segment, same watts, lower HR over time = the athlete is adapting. This is the highest-value physiological read and it does **not exist today** — `hr_bpm` and `power_watts` are stored as *unpaired* series (`compute-workout-analysis:1356`); nothing correlates them.
- **HR decoupling on long efforts = fatigue detection.** If HR drifts up while power holds, the athlete is working harder to sustain the same output. Today only a raw, non-power-controlled `hr_drift_pct` exists (`compute-facts`); true power-held decoupling is ❌.
- **For triathlon specifically:** arriving at T2 with a low HR after the bike leg is as important as the bike split itself. Riding the Santa Cruz climb at 200 W and reaching T2 at 138 bpm — not 158 bpm — is the result that matters. **HR trend on race-course segments is a primary signal, not a secondary one.**

### Speed — context-dependent
- **On flat terrain, speed alone is weak** — it's a function of power, CdA, weight, and wind. Not interesting in isolation.
- **On climbs, speed normalizes via VAM** (vertical ascent metres per hour). VAM accounts for gradient and is comparable across *different* climbs and across rides. It does **not exist today** — per-split `avgGrade_pct` exists (`compute-workout-analysis:1306`) but no vertical-rate aggregation.
- **Power + speed + gradient together** reveal bike fit, weight, and equipment efficiency in a way none reveals alone. Segment speed trend at the same physiological cost = "are you faster on this terrain for the same effort?"

The series needed to build HR-at-power, decoupling, and VAM **already exist** as raw 1 Hz channels (`series.hr_bpm`, `series.power_watts`, `series.grade_percent`, `series.speed_mps`; `compute-workout-analysis:1340-1361`). The gap is purely the *correlation/aggregation layer*, not data capture.

---

## Four Analysis Modes

Mode is selected per ride. Detection inputs already exist (`fact_packet_v1.derived.plan_context` + planned-session link); the branching logic is ❌ not yet wired.

### Mode 1 — Plan-linked ride
Arc knows the prescribed session. Grade execution against intent.
- **Power:** adherence — actual vs target zone; interval completion.
- **HR:** was the prescribed power held at the *expected* HR? Elevated HR at on-target power = under-recovered or hot; lower HR at target power = adapting (this needs HR-at-power, ❌).
- **Speed/VAM:** only relevant if the prescription was terrain-specific (e.g., a climb repeat) — then VAM vs prior executions of the same prescribed session.
- **Trend:** same session type, this training block.
- **Narrative example:** *"Threshold ride — hit 96% of target power, best adherence this block. HR held 4 bpm lower than your last threshold session at the same output."*

### Mode 2 — Unplanned ride, no segments
Fall back to the TrainingPeaks/Strava model.
- **Power:** TSS-normalized fitness curve (CTL/ATL — requires TSS, ❌, delta-map #28). Power-curve PRs (1/5/20 min bests over 90 days) — already in `achievements_v1` (`analyze-cycling-workout:2181`).
- **HR:** session-level efficiency factor (NP/HR) trend — partially exists weekly (`ride_efficiency_factor`, `compute-snapshot:538`); decoupling on the ride as a fatigue read (❌ power-controlled version).
- **Speed/VAM:** weak on a mixed unplanned ride unless it contained a notable climb; if it did, surface that climb's VAM even absent a defined segment.
- **Trend:** 20-min power best over time — comparable across *all* ride types, the right default fitness signal.
- **Narrative example:** *"Your 20-min power ceiling has risen 22 W over 90 days — FTP is trending up. Efficiency factor improved alongside it, so the gain is aerobic, not just freshness."*

### Mode 3 — Unplanned ride, with segments *(Strava-synced only — see Primary Constraint)*
Segment-aware comparison. A climb is always the same climb — it controls for terrain and distance, which is exactly what makes it analytically clean.
- **Power:** on-segment avg/best watts vs previous attempts; pacing profile — did power decay over the climb (went out too hard) or hold (good execution)?
- **HR:** on-segment HR vs previous *at the same power* — same watts, lower HR = aerobic efficiency improving. This is the headline read for Mode 3 and depends on HR-at-power (❌).
- **Speed/VAM:** segment VAM vs previous — "faster on this terrain"; combined with power+HR, separates fitness gain from equipment/weight change.
- **Trend:** power (and HR-at-power, and VAM) on *this segment* over time.
- **Narrative example:** *"This climb — 8:23, your 3rd best of 12 attempts. Avg 210 W, up 18 W. HR down 6 bpm at the same power, VAM up 40 m/h — you're adapting, not just pushing harder."*
- **Garmin degradation:** no segment efforts → this ride is analyzed as Mode 2. The narrative must not imply segment history that doesn't exist for that sync path.

### Mode 4 — Race-course segments *(highest value; Strava-synced; Garmin needs GPS-track matcher)*
Segment history tied to Arc race-course data.
- Arc knows the target race course (Santa Cruz 70.3, Redding 70.3).
- If the athlete rides segments matching the race course, flag it.
- **Power:** trend on race-specific terrain over time.
- **HR — primary here:** the triathlon question is not "how much power on the climb" but "what HR cost to produce race-day power on race-day terrain." Lower HR at race power on the race climb = ready to start the run. **HR trend on race-course segments outranks power trend for triathlon.**
- **Speed/VAM:** race-terrain VAM as a readiness proxy and a pacing-plan input.
- **Narrative example:** *"You've ridden the key climb on the Santa Cruz course 4 times. Power up 15 W, HR down 8 bpm at race effort — you're adapting to race terrain and should reach T2 fresher than your first attempt."*

---

## The TREND Sparkline — Resolved

The sparkline metric is **mode-dependent**, not fixed. HR and speed are first-class trend metrics, not afterthoughts.

| Context | Show |
|---|---|
| Plan-linked ride | Power adherence trend across same session type, this block |
| Unplanned, no segments | 20-min power best over last 90 days |
| Unplanned, with segments | Power **and HR-at-power** trend on this segment over time |
| Race-course segment | Power + **HR** + VAM trend on this specific race terrain (HR weighted highest for triathletes) |
| No power data | HR drift / decoupling trend (aerobic-efficiency proxy) |

Current implementation (`_shared/session-detail/build.ts:574-603`) emits a single NP series from `np_trend_v1`. The resolved design makes the series selection a function of mode; the existing `np_trend_v1` covers the "unplanned, no segments" row only.

---

## Arc's Role

Arc is the connective tissue. It currently knows: plan phase, week intent, race proximity, post-race recovery window, limiter signal (threaded into the cycling analyzer's narrative via `arc_narrative_context`).

Arc needs to also know:

- **CTL/ATL/TSB** (fitness / fatigue / form) — requires TSS (delta-map #28).
- **Power-curve trend** — is the athlete getting stronger on the bike? (20-min best trajectory).
- **HR-at-power trend** — aerobic efficiency direction, the adaptation signal power alone can't show.
- **Segment history tied to the race course** — Mode 4's substrate.
- **Whether today's ride was plan-linked or unplanned** — mode, and whether an unplanned ride was *additive* (productive extra stimulus) or *disruptive* (unplanned load against a recovery/taper intent).

Arc surfaces this into:

- Per-workout INSIGHTS narrative.
- Coach responses ("how's my bike fitness?").
- STATE screen fitness trajectory.
- Plan-generation fitness baseline.

**Today the bike side of Arc is thin:** the `athlete_snapshot` bike pin is `{ ftp_w }` only (`_shared/athlete-snapshot.ts:237`); weekly aggregates are `ride_avg_power`, `ride_efficiency_factor`, `ride_long_ride_duration`, `ride_interval_adherence` (`compute-snapshot:537-540`). No power-curve trend, no segment history, no CTL/ATL in the snapshot. Extending Arc means extending the snapshot writer *and* the Arc context assembler *and* a backfill — the same three-part pattern as every other Arc extension.

---

## Build Order

### Immediate (no new infrastructure)
1. **Mode-aware TREND**: replace the single raw NP sparkline with mode selection. The "unplanned, no segments" path (20-min power best) is fully backed by `achievements_v1` today.
2. **Mode detection** (plan-linked vs unplanned): the linked-plan-session signal already exists in `fact_packet_v1.derived.plan_context`; wire the branch.

### Short term (new infrastructure, scoped)
3. **TSS computation** (delta-map #28) — foundation for CTL/ATL. Open: simplified NP-based TSS vs full xPower/BikeScore.
4. **HR-at-power + decoupling metrics** — pair the already-stored `series.hr_bpm` / `series.power_watts` (`compute-workout-analysis:1340-1361`) in a new computed block. Net-new analysis layer, but no new data capture.
5. **VAM computation** — aggregate `series.grade_percent` + elevation + time into vertical-ascent-rate; per-split and per-climb. Data exists; aggregation is new.
6. **Segment ingestion (Strava)** — Strava `segment_efforts` are already landing in `workouts.achievements` (`ingest-activity:426-439`) but are never matched/trended. Build the matcher and history.

### Medium term (Arc integration)
7. **CTL/ATL curve** — once TSS exists.
8. **Race-course segment matching** — Arc knows the race course; flag matching segments. Strava polyline first; GPS-track matcher to cover Garmin.
9. **Arc exposure** — surface CTL/ATL, power-curve trend, HR-at-power trend, and segment history into the snapshot + Arc context (three-part: snapshot writer + assembler + backfill).

### Deferred (needs product decision)
10. Segment leaderboards / social comparison.
11. W′ (W-prime) depletion modelling on climbs.

---

## Open Questions

- Does Strava's API provide segment-effort data for our *existing* imports, or only new webhook activities? (Audit confirms `segment_efforts` is read at ingest for current Strava activities — backfill of historical rides is unverified.)
- Minimum viable TSS: simplified NP-based TSS, or full xPower/BikeScore? (NP-based is sufficient for CTL/ATL trend; precision matters less than consistency.)
- How are rides with *partial* race-course overlap handled vs full-course rides? (Mode 4 needs a match-confidence threshold.)
- Should segment history be its own table or live in `workout_analysis`? (History is cross-workout and queried by segment id over time — a dedicated table is the natural shape; `workout_analysis` is per-workout and would force scatter-gather.)
- **Garmin segment parity:** is the GPS-track route-matcher worth building, or is "segment intelligence = Strava feature" an acceptable permanent product boundary? This is the highest-leverage open question because it determines whether Modes 3–4 are universal or Strava-gated forever.

---

## Data Dependencies

Grounded in the 2026-05-16 audit. ✅ exists / ⚠️ partial / ❌ not built.

| Dependency | State | Source of truth (writer) |
|---|---|---|
| `achievements_v1` — 1/5/20 min power bests | ✅ | `analyze-cycling-workout:2181` (from `computed.power_curve`, `compute-workout-analysis:86-120`) |
| `np_trend_v1` — dated NP series | ⚠️ exists; needs mode-aware filtering | `analyze-cycling-workout:2185`; resolver `_shared/cycling-v1/np-trend.ts` (canonical `computed.analysis.power.normalized_power`, mirrors `compute-facts:1124`) |
| Canonical ride NP | ✅ | `computed.analysis.power.normalized_power` (`compute-workout-analysis:1388-1398`) |
| Power zones (% FTP) | ✅ | `computed.analysis.zones.power.bins[]` (`compute-workout-analysis:1549-1564`) |
| Per-split grade / elevation / HR | ✅ | `computed.analysis.events.splits.{km,mi}` (`compute-workout-analysis:1286-1330`) |
| Raw 1 Hz series (hr, power, speed, grade) | ✅ | `computed.analysis.series.*` (`compute-workout-analysis:1340-1361`) |
| Strava segment efforts | ✅ (Strava only) | `workouts.achievements` (`ingest-activity:403,426-439,520`) |
| Garmin segment efforts | ❌ | not exposed by Garmin API |
| HR-at-power / aerobic efficiency | ❌ | series stored *unpaired* (`compute-workout-analysis:1356`) |
| HR decoupling (power-controlled) | ❌ | only raw `hr_drift_pct` exists (`compute-facts`) |
| VAM / climbing rate | ❌ | per-split `avgGrade_pct` only; no vertical-rate aggregation |
| Segment matching / segment history | ❌ | `segment_efforts` stored raw, never matched/trended |
| TSS / CTL / ATL / TSB | ❌ | not computed (delta-map #28) |
| Mode detection (plan-linked vs unplanned) | ❌ | inputs exist (`fact_packet_v1.derived.plan_context`); branch unwired |
| Arc bike context (power-curve/segment/CTL) | ❌ | snapshot bike pin is `{ ftp_w }` only (`_shared/athlete-snapshot.ts:237`); aggregates `compute-snapshot:537-540` |
| `race_debrief_text` (cycling) | ❌ | persisted `null` (`analyze-cycling-workout:2176`); structural `is_goal_race`/`course_strategy_zones` shipped (`:2175,:2177`) |
| `ride_easy_power` (delta-map Tier 2 #5) | ❌ | D-009 design only; not in `compute-snapshot` |

---

## Ground Truth — Data Source Map (audit appendix)

Condensed from the 2026-05-16 read-only pipeline audit so this doc is self-grounding.

- **`workouts` columns (rides):** `avg_power`, `normalized_power` (int; Strava-populated, Garmin null), `elevation_gain`, `elevation_loss`, `gps_track`/`sensor_data`/`laps` (jsonb), `computed`, `workout_analysis`, `achievements` (jsonb), `avg_speed`/`max_speed`, `avg_heart_rate`/`max_heart_rate`, `distance`, `moving_time`, `type`, `workout_status`, `date`, `user_id`.
- **`computed` (writer `compute-workout-analysis`):** `overall.*` (duration/distance/HR; pace null for rides); `analysis.power.{normalized_power,variability_index,intensity_factor,avg_power_pedaling_w,pct_time_pedaling}` (`:1388-1398`); `analysis.zones.{power,hr}.bins[]` (`:1402-1564`); `analysis.events.laps[]` raw passthrough (`:1363`); `analysis.events.splits.{km,mi}` (`:1286-1330`); `power_curve` 5s/1min/5min/20min/60min (`:86-120`, ≥60 samples); `series.*` unpaired 1 Hz (`:1340-1361`). Segment efforts are **not** in `computed`.
- **`workout_analysis` (writer `analyze-cycling-workout`):** `granular_analysis` (`:2161`), `performance` (`:2162`), `detailed_analysis` (`:2163`), `adherence_analysis` (`:2164`), `adherence_summary` (`:2170`), `is_goal_race` (`:2175`), `race_debrief_text:null` (`:2176`), `course_strategy_zones` (`:2177`), `achievements_v1` (`:2181`), `vs_similar_v1` (`:2182`), `limiter_v1` (`:2183`), `np_trend_v1` (`:2185`), `fact_packet_v1` (`:2237`), `session_state_v1` (`:2241`), `ai_summary` (markdown-stripped).
- **`session_detail_v1` (writer `_shared/session-detail/build.ts`):** `trend` from `np_trend_v1` (`:574-603`); `analysis_details.rows` — Power (`:1008`), Heart rate (`:1030`), Power zones (`:1055`), Conditions/Terrain (`:1083`), Pacing (`:1064`), vs-similar (`:1092`); `narrative_text` (`:536`, fallback `:456`); `adherence.technical_insights` (`:553`).
- **`athlete_snapshot`:** bike pin `{ ftp_w }` (`_shared/athlete-snapshot.ts:237` write / `:311` read); ride aggregates `ride_avg_power`/`ride_efficiency_factor`/`ride_long_ride_duration`/`ride_interval_adherence` (`compute-snapshot:537-540`).
- **Ingest:** Strava `strava-webhook` → `ingest-activity` (`segment_efforts` → `achievements`, `:403,426-439,520`); Garmin `garmin-webhook-activities` → `ingest-activity` (samples-based; NP recomputed; no segments; has `elevation_loss`).

---

## When this doc becomes stale

File line numbers drift. The structural claims — segment intelligence is Strava-gated; HR-at-power / VAM / decoupling / TSS / CTL-ATL are not computed; the Arc bike pin is `{ ftp_w }` only; mode detection is unwired — hold until those specific items ship. Re-audit the pipeline before starting Mode 3/4 work; the Strava↔Garmin gap table is the part most likely to change first (if a GPS-track matcher lands).
