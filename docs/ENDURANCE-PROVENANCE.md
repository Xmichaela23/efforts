# ENDURANCE-PROVENANCE.md — Hardcoded-number provenance audit: non-race RUN generation path

**Scope:** Every prescribed/hardcoded number on the LIVE non-race RUN plan generation path.
**Trigger config:** a non-race RUN goal (`goal_type ∈ {capacity, maintenance}`, `sport='run'`) →
`create-goal-and-materialize-plan/index.ts:2374-2395` invokes `generate-run-plan` with
`approach='sustainable'`, `goal='complete'`, `terminalShape='retest'`, `race_date=null`.
**Date:** 2026-06-28. **Method:** READ-ONLY static call-graph trace. No code changed.

---

## 0. The live call graph (what actually runs)

```
create-goal-and-materialize-plan/index.ts:2374  (sport==='run', non-race)
  └─ proxyDistanceForNonRaceGoal(sport, target_weeks, fitness)   non-race-routing.ts:97
       → 'half_marathon' | 'marathon'  → mapped to distance 'half' | 'marathon'  (index.ts:2380)
  └─ POST generate-run-plan { approach:'sustainable', goal:'complete', terminalShape:'retest', ... }
       generate-run-plan/index.ts:164  case 'sustainable':
         new SustainableGenerator(params).generatePlan()      sustainable.ts:90
           ├─ determinePhaseStructure()                       base-generator.ts:274  (LIVE)
           │    └─ applyRetestTail(phases)                    base-generator.ts:436  (Taper→Retest, RacePrep→Build)
           ├─ getCurrentPhase / isRecoveryWeek                base-generator.ts:451 / 464
           ├─ calculateWeeklyMileage → WEEKLY_MILEAGE         sustainable.ts:314 / 66   (LIVE, drives volume)
           │    └─ resolveEffectiveStartVolume                base-generator.ts:197    (LIVE)
           ├─ getLongRunMiles → LONG_RUN_PROGRESSION          sustainable.ts:347 / 19   (LIVE, drives long run)
           │    ├─ isAtPeakFitness / getProgressionOffset / getStructuralGovernor  base-generator.ts:178/133/164
           ├─ createSimpleLongRun / EasyRun / OptionalSpeedwork  sustainable.ts:447/495/464
           │    └─ milesToMinutes → getEasyPaceMinPerMile     base-generator.ts:850/807 (LIVE, drives durations)
           └─ assignDaysToSessions                            base-generator.ts:697
       generate-run-plan/index.ts:219  overlayStrengthLegacy (only if strength_frequency>0)
       generate-run-plan/index.ts:279  buildPlanContractV1
       generate-run-plan/index.ts:419/596 generatePreview
```

**Key structural fact the rest of this doc rests on:** `SustainableGenerator` has its OWN volume
tables (`WEEKLY_MILEAGE`, `LONG_RUN_PROGRESSION` in `sustainable.ts`) and NEVER calls the
base-generator's `calculateWeekVolume` / `distributeVolume` / `calculate*Volume` helpers. Those
helpers — and the `FITNESS_TO_VOLUME` table in `types.ts` they read — are reachable only from the
OTHER generators (`cumulative-load`, `volume-progression`, `hybrid-athlete`, `time-efficient`,
`balanced-build`), none of which is the live non-race path. Hence large parts of `base-generator.ts`
are **DEAD** on this path (defined + read elsewhere, never read here) and `quality_density` is
**DECORATIVE** (read by no code at all).

**Classification legend:** SOURCED (D-NNN / science doc / named real reference) · PLACEHOLDER
(uncited / "inspired-by" hand-wave / arbitrary) · DEAD (read somewhere, not on THIS path) ·
DECORATIVE (set on object, read by no code anywhere).

---

## 1. Phase proportions — `determinePhaseStructure` (LIVE: sets phase boundaries → which weeks get min days, when speedwork is gated, recovery placement)

`determinePhaseStructure()` IS called on the live path (`sustainable.ts:91`, `index.ts:167`). The
duration-bucket splits decide phase boundaries; `applyRetestTail` then renames Taper→Retest and Race
Prep→Build (`base-generator.ts:436-446`). The proportions themselves carry **no citation** — there is
no D-NNN and no science doc for "why 0.4 vs 0.33 vs 0.30". Sustainable is "Hal Higdon-inspired …
adaptation and not officially endorsed" (`sustainable.ts:1-11`) — an explicit hand-wave.

| Name | Value | file:line | Controls | Comment/source | Class |
|---|---|---|---|---|---|
| short base split | `*0.4` | base-generator.ts:285 | Base weeks, 4–6wk plans | none | PLACEHOLDER |
| short speed split | `*0.4` | base-generator.ts:286 | Speed weeks, 4–6wk plans | none | PLACEHOLDER |
| short taper floor | `Math.max(1, …)` | base-generator.ts:287 | min 1 taper/retest wk | none | PLACEHOLDER |
| short Base volume_multiplier | `0.7` | base-generator.ts:297 | (see §2 — DEAD field) | none | DEAD |
| short Speed volume_multiplier | `1.0` | base-generator.ts:306 | (DEAD field) | none | DEAD |
| short Taper volume_multiplier | `0.6` | base-generator.ts:315 | (DEAD field) | none | DEAD |
| medium base split | `*0.33` | base-generator.ts:320 | Base weeks, 7–11wk | none | PLACEHOLDER |
| medium speed split | `*0.33` | base-generator.ts:321 | Speed weeks, 7–11wk | none | PLACEHOLDER |
| medium racePrep split | `*0.20` | base-generator.ts:322 | RacePrep(→Build) weeks | none | PLACEHOLDER |
| medium Base volume_multiplier | `0.7` | base-generator.ts:333 | (DEAD field) | none | DEAD |
| medium Speed volume_multiplier | `0.95` | base-generator.ts:342 | (DEAD field) | none | DEAD |
| medium RacePrep volume_multiplier | `1.0` | base-generator.ts:351 | (DEAD field) | none | DEAD |
| medium Taper volume_multiplier | `0.6` | base-generator.ts:360 | (DEAD field) | none | DEAD |
| long base split | `*0.30` | base-generator.ts:365 | Base weeks, 12+wk | none | PLACEHOLDER |
| long speed split | `*0.35` | base-generator.ts:366 | Speed weeks, 12+wk | none | PLACEHOLDER |
| long racePrep split | `*0.25` | base-generator.ts:367 | RacePrep(→Build) weeks | none | PLACEHOLDER |
| long taper floor | `Math.max(2, …)` | base-generator.ts:368 | min 2 taper/retest wk | none | PLACEHOLDER |
| long Base volume_multiplier | `0.75` | base-generator.ts:378 | (DEAD field) | none | DEAD |
| long Speed volume_multiplier | `0.95` | base-generator.ts:387 | (DEAD field) | none | DEAD |
| long RacePrep volume_multiplier | `1.0` | base-generator.ts:396 | (DEAD field) | none | DEAD |
| long Taper volume_multiplier | `0.6` | base-generator.ts:405 | (DEAD field) | none | DEAD |
| recovery-week cadence | `week += 4` (from 4) | base-generator.ts:412 | every 4th week = recovery (excl. terminal) | none | PLACEHOLDER |
| min plan length | `< 4` throws | base-generator.ts:277 | hard floor | none | PLACEHOLDER |
| min-days clamp | `Math.min(6, …)` | base-generator.ts:666,680,684 | ≥1 rest day | structural, not a dosing choice | PLACEHOLDER |

Note: `sustainable.ts` itself defines NO phase proportions — it inherits `determinePhaseStructure`
wholesale. The `0.72` taper-start fraction at `sustainable.ts:363` is part of the peak-bridge arc
(§6), not the phase splitter.

---

## 2. `volume_multiplier` per phase — DEAD on the live retest path (proven two ways)

`volume_multiplier` is set on every phase object (§1) but is read in only two places:

1. `base-generator.ts:637` inside `calculateWeekVolume` — **not called by `SustainableGenerator`**
   (grep: callers are `cumulative-load.ts:61`, `volume-progression.ts:58`, `hybrid-athlete.ts:57`,
   `time-efficient.ts:230` only). Sustainable computes volume from `WEEKLY_MILEAGE` instead.
2. `index.ts:480` `buildPlanContractV1` — `taperMultipliers[w] = taperPhase.volume_multiplier ?? 0.6`,
   but `taperPhase = phases.find(p => p.name === 'Taper')` (`index.ts:476`). On the retest path
   `applyRetestTail` has renamed every `'Taper'` → `'Retest'` (`base-generator.ts:438-440`), so the
   lookup returns `undefined` → `taperMultipliers` stays empty → `volume_multiplier` is never read.

**Conclusion: every `volume_multiplier` value (0.6/0.7/0.75/0.95/1.0) is DEAD on the non-race
retest path.** The live volume math is entirely §3/§4. (The `?? 0.6` fallback at `index.ts:480/499`
is itself dead for the same reason.)

---

## 3. `quality_density` per phase — DECORATIVE (read by no code anywhere)

| Name | Value | file:line | Controls | Comment/source | Class |
|---|---|---|---|---|---|
| quality_density (all 11 phase objects) | `'low'`/`'medium'`/`'high'` | base-generator.ts:296,305,314,332,341,350,359,377,386,395,404 | nothing | none | DECORATIVE |

Grep proof: `quality_density` appears in `generate-run-plan` only as field *assignments* in
`base-generator.ts` and a type decl at `types.ts:258`. No read site exists anywhere in
`generate-run-plan/`. (The only readers in the repo are in `generate-triathlon-plan` and
`adapt-plan`, different functions with their own structs.) Pure decoration.

---

## 4. The volume tables that ACTUALLY drive the plan — `WEEKLY_MILEAGE` + `LONG_RUN_PROGRESSION` (LIVE)

These two tables in `sustainable.ts` are the real engine of the non-race plan. The proxy distance
(§9) selects the **distance** row; `params.fitness` selects the **tier** row.

### 4a. `WEEKLY_MILEAGE` (start/peak mpw) — `sustainable.ts:66-87`, consumed at `calculateWeeklyMileage:320-345`

Comment attached: `// Weekly mileage targets (conservative for completion)` (sustainable.ts:65). No
D-NNN, no science doc, no Higdon page reference. "Higdon-inspired adaptation, not endorsed"
(sustainable.ts:10-11) ⇒ PLACEHOLDER.

| distance×tier | start | peak | file:line | Class |
|---|---|---|---|---|
| marathon·beginner | 20 | 40 | sustainable.ts:68 | PLACEHOLDER |
| marathon·intermediate | 30 | 50 | sustainable.ts:69 | PLACEHOLDER |
| marathon·advanced | 40 | 60 | sustainable.ts:70 | PLACEHOLDER |
| half·beginner | 15 | 30 | sustainable.ts:73 | PLACEHOLDER |
| half·intermediate | 25 | 40 | sustainable.ts:74 | PLACEHOLDER |
| half·advanced | 35 | 50 | sustainable.ts:75 | PLACEHOLDER |
| 10k·beginner | 12 | 25 | sustainable.ts:78 | PLACEHOLDER · also DEAD on non-race path* |
| 10k·intermediate | 20 | 35 | sustainable.ts:79 | PLACEHOLDER · DEAD* |
| 10k·advanced | 30 | 45 | sustainable.ts:80 | PLACEHOLDER · DEAD* |
| 5k·beginner | 10 | 20 | sustainable.ts:83 | PLACEHOLDER · DEAD* |
| 5k·intermediate | 15 | 28 | sustainable.ts:84 | PLACEHOLDER · DEAD* |
| 5k·advanced | 25 | 40 | sustainable.ts:85 | PLACEHOLDER · DEAD* |
| default fallback mpw | 25 | — | sustainable.ts:321 | PLACEHOLDER |

\* The non-race proxy (§9) only ever emits `'half'` or `'marathon'` — `proxyDistanceForNonRaceGoal`
returns `half_marathon` (→`'half'`) or `'marathon'` (`non-race-routing.ts:112`,
`index.ts:2380`). So the **`5k` and `10k` rows are unreachable (DEAD) on the non-race path**, though
live for race-goal run plans.

`calculateWeeklyMileage` math (all LIVE, all uncited ⇒ PLACEHOLDER):

| Name | Value | file:line | Controls | Class |
|---|---|---|---|---|
| ramp progress denom | `(week-1)/max(1, taperStart-2)` | sustainable.ts:334 | linear start→peak ramp | PLACEHOLDER |
| post-taper volume | `peak * 0.5` | sustainable.ts:337 | weeks ≥ taperStart | PLACEHOLDER |
| recovery-week cut | `* 0.7` | sustainable.ts:341 | recovery week reduction | PLACEHOLDER |

Behavioral note: on the retest path there is no `'Taper'` phase, so `taperPhase` at
`sustainable.ts:329` is `undefined` and `taperStart` falls back to `duration_weeks`
(`sustainable.ts:330`). Net effect: the `peak*0.5` branch effectively never fires until the very last
week; volume ramps to peak across the whole plan. (Not a number per se, but it changes which
constants bite.)

### 4b. `LONG_RUN_PROGRESSION` (per-week long-run miles) — `sustainable.ts:19-63`, consumed at `getLongRunMiles:347-438`

Comment attached: `// Long run progression by fitness level (in miles) // SMOOTH progression: max +1
mile per week, recovery weeks reduce by ~30%` (sustainable.ts:16-18). The `+1/wk` / `-30%` shaping
*rule* is articulated but **uncited** (no source for the absolute miles). ⇒ PLACEHOLDER.

| distance×tier | array | file:line | Class |
|---|---|---|---|
| marathon·beginner | `[6,7,8,6, 8,9,10,8, 10,11,12,10, 14,16,18,13, 15,17,12,8]` | sustainable.ts:21-32 | PLACEHOLDER |
| marathon·intermediate | `[8,9,10,8, 10,11,12,10, 12,14,16,12, 16,18,20,14, 16,18,14,10]` | sustainable.ts:33-39 | PLACEHOLDER |
| marathon·advanced | `[10,11,12,10, 12,14,16,12, 16,18,20,14, 18,20,20,16, 18,20,16,12]` | sustainable.ts:40-46 | PLACEHOLDER |
| half·beginner | `[5,6,7,5, 7,8,9,7, 9,10,11,8]` | sustainable.ts:49 | PLACEHOLDER |
| half·intermediate | `[6,7,8,6, 8,9,10,8, 10,11,12,8]` | sustainable.ts:50 | PLACEHOLDER |
| half·advanced | `[8,9,10,8, 10,11,12,10, 12,13,14,10]` | sustainable.ts:51 | PLACEHOLDER |
| 10k·* (3 rows) | `[…]` | sustainable.ts:54-56 | PLACEHOLDER · DEAD on non-race path* |
| 5k·* (3 rows) | `[…]` | sustainable.ts:59-61 | PLACEHOLDER · DEAD on non-race path* |
| default long-run fallback | `10` | sustainable.ts:348 | PLACEHOLDER |
| beyond-table taper step | `lastValue - weeksBeyond*2`, floor `8` | sustainable.ts:437 | PLACEHOLDER |

\* Same reachability argument as 4a: 5k/10k long-run rows are DEAD on the non-race path.

---

## 5. `FITNESS_TO_VOLUME` (types.ts) — DEAD on the live path (Sustainable bypasses it entirely)

`FITNESS_TO_VOLUME` (`types.ts:352-373`) is read only by four base-generator helpers —
`calculateStartingVolume` (`:226`), `calculatePeakVolume` (`:237`), `getLongRunCap` (`:248`),
`getWeeklyIncrease` (`:259`). Those are called by `calculateWeekVolume`/`distributeVolume` and the
NON-sustainable generators. `SustainableGenerator` calls **none** of them (it uses §4's
`WEEKLY_MILEAGE`/`LONG_RUN_PROGRESSION`). Therefore the entire table is DEAD on the non-race path.

| distance×tier | startWeekly / peakWeekly / longRunCap / weeklyIncrease | file:line | Class |
|---|---|---|---|
| marathon·beginner | 15 / 35 / 18 / 1.5 | types.ts:354 | DEAD |
| marathon·intermediate | 35 / 55 / 22 / 2.5 | types.ts:355 | DEAD |
| marathon·advanced | 55 / 85 / 24 / 3.5 | types.ts:356 | DEAD |
| half·beginner | 12 / 28 / 12 / 1.2 | types.ts:359 | DEAD |
| half·intermediate | 25 / 40 / 14 / 2.0 | types.ts:360 | DEAD |
| half·advanced | 40 / 60 / 16 / 2.5 | types.ts:361 | DEAD |
| 10k·beginner | 10 / 25 / 10 / 1.0 | types.ts:364 | DEAD |
| 10k·intermediate | 20 / 35 / 12 / 1.5 | types.ts:365 | DEAD |
| 10k·advanced | 35 / 55 / 14 / 2.0 | types.ts:366 | DEAD |
| 5k·beginner | 8 / 20 / 8 / 0.8 | types.ts:369 | DEAD |
| 5k·intermediate | 18 / 32 / 10 / 1.2 | types.ts:370 | DEAD |
| 5k·advanced | 30 / 50 / 12 / 1.8 | types.ts:371 | DEAD |

Also DEAD on this path (the machinery that consumes the table):

| Name | Value | file:line | Why DEAD | Class |
|---|---|---|---|---|
| recovery cut (`calculateWeekVolume`) | `* 0.7` | base-generator.ts:642 | `calculateWeekVolume` not called by Sustainable | DEAD |
| long-run % of week (`distributeVolume`) | `* 0.28` | base-generator.ts:778 | `distributeVolume` not called by Sustainable | DEAD |
| `MARATHON_DURATION_REQUIREMENTS` (all of `types.ts:457-525`: minWeeklyMiles, peakLongRun 18/20, taperWeeks 2/3, startingLongRun 10/12) | various | types.ts:457-525 | `getMarathonDurationRequirements` has no caller in `generate-run-plan` (grep: definition only) | DEAD/DECORATIVE |

---

## 6. base-generator athlete-state governors — LIVE (these fire on the Sustainable path)

These ARE on the live path: `getLongRunMiles` (`sustainable.ts:347`) calls `isAtPeakFitness`,
`getProgressionOffset`, `getStructuralGovernor`; `calculateWeeklyMileage` calls
`resolveEffectiveStartVolume`. All values are uncited tuning constants — comments give *rationale*
prose but no external/D-NNN source ⇒ PLACEHOLDER.

| Name | Value | file:line | Controls | Comment attached (quoted) | Class |
|---|---|---|---|---|---|
| isAtPeakFitness threshold | `0.72` | base-generator.ts:184 | gate into peak-bridge arc | "72% threshold (vs 80%) gives tolerance for pace-conversion variance" | PLACEHOLDER |
| getProgressionOffset target | `* 0.95` | base-generator.ts:137 | week-1 entry into long-run table | "Uses a 95% target so there's a very slight pullback" | PLACEHOLDER |
| progression maxOffset | `length - duration_weeks` | base-generator.ts:152 | keeps table long enough | "old cap of duration_weeks/2 was too conservative" | PLACEHOLDER |
| structural governor heavy_lower | `0.90` | base-generator.ts:168 | wk1–2 long-run cut, heavy strength | "reduce early-week long-run volume to prevent CNS overload" | PLACEHOLDER |
| structural governor low | `0.85` (wk1) / `0.92` (wk2) | base-generator.ts:169 | wk1–2 cut | same block | PLACEHOLDER |
| structural governor moderate | `0.95` (wk1) | base-generator.ts:170 | wk1 cut | same block | PLACEHOLDER |
| governor active window | `weekNumber > 2 → 1.0` | base-generator.ts:166 | only first 2 weeks | "after that the body has adapted" | PLACEHOLDER |
| effectiveStart clamp lower | `tableStart * 0.7` | base-generator.ts:201 | clamp current-miles anchor | "Clamp to [tableStart*0.7, tablePeak*0.95]" | PLACEHOLDER |
| effectiveStart clamp upper | `tablePeak * 0.95` | base-generator.ts:201 | clamp anchor | same | PLACEHOLDER |
| ACWR fatigue trigger | `acwr > 1.3` | base-generator.ts:205 | scale-down gate | "ACWR > 1.3: scale down by up to 20% (fatigued athlete)" | PLACEHOLDER† |
| ACWR fatigue scale | `max(0.80, 1 - (acwr-1.3)*0.5)` | base-generator.ts:206 | up-to-20% cut | same | PLACEHOLDER |
| declining-trend buffer | `* 0.95` | base-generator.ts:212 | extra 5% conservative | "volume_trend 'declining': apply an extra 5% conservative buffer" | PLACEHOLDER |

† The `1.3` ACWR threshold matches the value used elsewhere in the app (D-033 / D-153 use ACWR≤1.3
as a gate), so it is *consistent with* an established internal convention, but the run-plan governor
itself cites nothing — it is not wired to those decisions. Treated as PLACEHOLDER for this path; a
reviewer could upgrade it to SOURCED-by-convention if D-033's 1.3 is accepted as the house value.

### 6b. Peak-bridge / re-entry arc constants — LIVE only when `recent_long_run_miles` set AND `isAtPeakFitness` AND `duration_weeks ≤ 10` (`sustainable.ts:355`)

All uncited; comments describe intent ("descending maintenance arc", "ascending re-entry") but no
source. ⇒ PLACEHOLDER.

| Name | Value | file:line | Controls | Class |
|---|---|---|---|---|
| short-plan taper-start (≤6wk) | `totalWeeks - 1` | sustainable.ts:362 | taper start | PLACEHOLDER |
| taper-start fraction | `round(totalWeeks * 0.72)` | sustainable.ts:363 | taper start | PLACEHOLDER |
| race-week miles | `max(4, round(recentLR * 0.30))` | sustainable.ts:357 | terminal long-run floor | PLACEHOLDER |
| re-entry trigger | `weeksSincePeak > 2` | sustainable.ts:373 | arc selection | PLACEHOLDER |
| recovery long-run (both arcs) | `max(6, round(recentLR * 0.55))` | sustainable.ts:379,405 | recovery week LR | PLACEHOLDER |
| taper entry miles | `round(recentLR * 0.70)` | sustainable.ts:386,410 | taper LR start | PLACEHOLDER |
| re-entry start pct | `max(0.55, 0.75 - (weeksSincePeak-2)*0.05)` | sustainable.ts:389 | build ramp start | PLACEHOLDER |
| re-entry target pct | `0.90` | sustainable.ts:390 | build ramp ceiling | PLACEHOLDER |
| maintenance high mark | `round(recentLR * 0.90)` | sustainable.ts:417 | descending arc top | PLACEHOLDER |
| maintenance drop mark | `round(recentLR * 0.78)` | sustainable.ts:418 | descending arc floor | PLACEHOLDER |
| post-recovery resume | `round(recentLR * 0.76)` | sustainable.ts:423 | LR after last recovery | PLACEHOLDER |
| arc long-run floor | `max(6, …)` | sustainable.ts:400,421 | min long run | PLACEHOLDER |

---

## 7. Pace tables — `getEasyPaceMinPerMile` LIVE; marathon/threshold tables DEAD/DECORATIVE

Sustainable is effort-based: it requests only `easyPace` (`sustainable.ts:111-113`,
`baselines_required.run = ['easyPace']`). The ONLY pace table it touches is the easy-pace table, via
`milesToMinutes` → `getEasyPaceMinPerMile`, which converts every session's miles into a `duration`
field (`base-generator.ts:850-851`). So the easy-pace table is LIVE and load-bearing for durations.

| Name | Value | file:line | Controls | Class |
|---|---|---|---|---|
| easy pace beginner | `11.0` min/mi | base-generator.ts:809 | all session durations (LIVE) | PLACEHOLDER |
| easy pace intermediate | `9.5` | base-generator.ts:810 | durations | PLACEHOLDER |
| easy pace advanced | `8.0` | base-generator.ts:811 | durations | PLACEHOLDER |
| easy pace default | `9.5` | base-generator.ts:813 | durations | PLACEHOLDER |
| marathon pace beginner | `10.5` | base-generator.ts:821 | `createMarathonPaceRun` only | DEAD |
| marathon pace intermediate | `9.0` | base-generator.ts:822 | `createMarathonPaceRun` only | DEAD |
| marathon pace advanced | `7.5` | base-generator.ts:823 | `createMarathonPaceRun` only | DEAD |
| marathon pace default | `9.0` | base-generator.ts:825 | `createMarathonPaceRun` only | DEAD |
| threshold pace beginner | `9.5` | base-generator.ts:833 | nothing | DECORATIVE |
| threshold pace intermediate | `8.0` | base-generator.ts:834 | nothing | DECORATIVE |
| threshold pace advanced | `6.5` | base-generator.ts:835 | nothing | DECORATIVE |
| threshold pace default | `8.0` | base-generator.ts:837 | nothing | DECORATIVE |

Proof: `getMarathonPaceMinPerMile` is read only by `createMarathonPaceRun` (`base-generator.ts:577`),
and `createMarathonPaceRun` has **no caller anywhere** in `generate-run-plan` (grep returns only its
definition) — so the MP table is dead code, and certainly never reached by Sustainable.
`getThresholdPaceMinPerMile` (`base-generator.ts:831`) has **no caller anywhere** (grep returns only
its definition) ⇒ DECORATIVE. These are "PLACEHOLDER values that are also DEAD/DECORATIVE"; classed
by reachability per the rubric.

### 7b. Session-content magic numbers actually emitted by Sustainable (LIVE)

| Name | Value | file:line | Controls | Class |
|---|---|---|---|---|
| speedwork start gate | `weekNumber >= 3 && runningDays >= 4` | sustainable.ts:185 | when optional speedwork appears | PLACEHOLDER |
| speedwork miles budget | `4` | sustainable.ts:186 | miles attributed to speed day | PLACEHOLDER |
| strides count (optional speed) | `6×100m` | sustainable.ts:474 | stride session | PLACEHOLDER |
| stride session add-on | `+10` min | sustainable.ts:475 | duration bump | PLACEHOLDER |
| fartlek pickups | `min(8, 5 + floor(week/4))` | sustainable.ts:480 | fartlek count | PLACEHOLDER |
| easy-run fill floor/cap | `max(3, min(6, …))` | sustainable.ts:527-528 | easy run mileage clamp | PLACEHOLDER |
| reduced-quality long-run cap | `min(10, …)` | sustainable.ts:176,295 | near-race LR cap | PLACEHOLDER |
| easy+strides taper add-on | `+5` min | sustainable.ts:270,289 | duration bump | PLACEHOLDER |
| shakeout duration | `25` min, `3` mi, `4×100m` | base-generator.ts:100-102 | shakeout run (race-prox) | PLACEHOLDER |

Note: the race-proximity ladder (`getRaceProximitySession`, base-generator.ts:83-91:
`≤0 race / ≤1 shakeout / ≤4 easy_short / ≤7 easy_medium / ≤14 reduced_quality`) is effectively inert
on the non-race path because `race_date=null` is passed (`index.ts:2389`) → `getDaysUntilRace`
returns `null` → always `'normal'`. So those day-thresholds (1/4/7/14) are DEAD on the non-race path
(LIVE for race-goal run plans).

---

## 8. `generatePreview` estimates — `index.ts:596-650` (LIVE: returned in the API response / shown in UI)

These are display estimates over the already-generated plan. Comments literally call them "Rough
estimate" / "assumption" ⇒ PLACEHOLDER.

| Name | Value | file:line | Controls | Comment attached | Class |
|---|---|---|---|---|---|
| long-run miles estimate divisor | `/ 9` | index.ts:614 | `long_run_peak_miles` from minutes | "Rough estimate" | PLACEHOLDER |
| avgPace assumption | `9` min/mi | index.ts:627 | `avgMilesPerWeek` from minutes | "minutes per mile assumption" | PLACEHOLDER |
| starting_volume_mpw factor | `* 0.7` | index.ts:643 | preview starting volume | none | PLACEHOLDER |
| peak_volume_mpw factor | `* 1.1` | index.ts:644 | preview peak volume | none | PLACEHOLDER |
| estimated hours upper factor | `* 1.2` | index.ts:647 | hours range top | none | PLACEHOLDER |

These preview numbers are independent of §4's real tables — `starting_volume_mpw` /
`peak_volume_mpw` are derived from average session *minutes* ÷ assumed pace, NOT from `WEEKLY_MILEAGE`.
So the preview shown to the user can disagree with the volume the plan actually prescribes. (Watch-list
item; this is a "score that lies" shape — flagged unverified, not asserted as a live user-visible bug.)

### 8b. plan_contract_v1 policy constants — `index.ts` (LIVE: written into stored contract)

| Name | Value | file:line | Controls | Class |
|---|---|---|---|---|
| per-week hard cap (week intent) | `3` | index.ts:498 | `hard_cap` per week | PLACEHOLDER |
| max_hard_per_week (policy) | `3` | index.ts:515 | contract policy | PLACEHOLDER |
| min_rest_gap_days | `1` | index.ts:516 | contract policy | PLACEHOLDER |
| taper_multiplier fallback | `?? 0.6` | index.ts:499,480 | taper weeks | DEAD (no Taper phase on retest — see §2) |
| race-distance miles map (5k 3.10686 / 10k 6.21371 / half 13.1 / marathon 26.2) | — | index.ts:359-364 | `target_time` calc | DEAD on non-race path (guarded by `effort_paces.race`, which sustainable/complete never sets) |

---

## 9. The proxy distance — `proxyDistanceForNonRaceGoal` (LIVE: SELECTS which §4 volume table row is used)

`non-race-routing.ts:97-113`. For `sport='run'`: returns `'half_marathon'` when `target_weeks < 8`,
else `'marathon'` (`:112`); the wrapper maps `'marathon'→'marathon'`, anything else `→'half'`
(`index.ts:2380`).

| Name | Value | file:line | Controls | Comment attached | Class |
|---|---|---|---|---|---|
| run proxy threshold | `w < 8` → half_marathon, else marathon | non-race-routing.ts:112 | **selects WEEKLY_MILEAGE + LONG_RUN_PROGRESSION distance row** | "run-long is CTL-driven … proxy is nearly inert" | PLACEHOLDER |
| missing-weeks default | `12` | non-race-routing.ts:101 | default target_weeks | "null/NaN/non-positive → 12" | PLACEHOLDER |
| tier/length tri ladder | 8/16 wk → olympic/70.3/ironman | non-race-routing.ts:106-107 | tri path only | (tri, not run) | DEAD on run path |

**Provenance correction (important):** the in-code comment claims the proxy distance is "nearly inert
… the long run is CTL-driven on the run-only path" (`non-race-routing.ts:88-91,110-111`). **That is
FALSE for THIS path.** That comment describes the combined/tri engine
(`generate-combined-plan`, which IS CTL/`scaledWeeklyTSS`-driven). The non-race RUN goal does NOT go
through that engine — it routes to `generate-run-plan`/`SustainableGenerator`, where `distance` is
the table key for BOTH `WEEKLY_MILEAGE` (§4a) and `LONG_RUN_PROGRESSION` (§4b). So the proxy
threshold flips the entire volume + long-run prescription between the `half` and `marathon` rows.
There is no CTL input on this path at all. The proxy is the single most load-bearing "distance"
number here, and its own documentation misdescribes its effect. (Filed as a finding; verified by
call-graph trace, not a device run.)

`target_weeks` default of `12` then flows to `duration_weeks` (`index.ts:2375,2383`); `days_per_week`
defaults to `'4-5'` when unset (`index.ts:2385-2387`).

---

## 10. Strength overlay — on the live path, but out of this catalog's number-scope

When `strength_frequency > 0`, `overlayStrengthLegacy` (`strength-overlay.ts`, 742 lines) runs
(`index.ts:219`). Its set/rep/RIR/%1RM numbers are a separate methodology and — unlike everything
above — ARE science-documented: the 7 protocols cite `docs/SCIENCE-*.md`
(`SCIENCE-5x5-linear-progression.md`, `SCIENCE-minimum-dose-maintenance.md`,
`SCIENCE-neural-speed-running-economy.md`, `SCIENCE-triathlon-strength-friel.md`, etc.) and
`SPEC-per-discipline-periodization.md §13.1`. These would mostly classify SOURCED. They are NOT
enumerated in this catalog (the task's cover list §1–§9 is volume/pace/phase; strength dosing is a
distinct, separately-sourced surface). Flagged here only so the boundary is explicit. For a non-race
run goal the default protocol is `durability` (`non-race-routing.ts:43`).

---

## COUNT

Catalogued line items (counting each table row / named constant once; the `5k`/`10k` table rows and
multi-value rows counted as single entries):

- §1 Phase proportions & structure: 24 (8 split/floor/cadence + 11 volume_multiplier fields counted in §1 list + 5 structural)
- §3 quality_density: 1 (11 sites, one classification)
- §4 WEEKLY_MILEAGE + math: 16
- §4 LONG_RUN_PROGRESSION + edges: 11
- §5 FITNESS_TO_VOLUME + consumers: 15
- §6 governors + arc constants: 23
- §7 pace tables + session magic + race-prox: ~22
- §8 preview + contract policy: 10
- §9 proxy distance: 3

**Total distinct numbers/constants catalogued: ~125** (the `volume_multiplier` set is listed in §1
and cross-referenced in §2; counted once).

By classification (distinct items):

- **SOURCED: 0** — Not one number on the non-race RUN volume/pace/phase path carries a D-NNN, a
  science-doc citation, or a named external methodology page. (The strength overlay in §10 is sourced
  but excluded from the count by scope. The ACWR `1.3` in §6 is *consistent with* D-033's house value
  but not wired to it.)
- **PLACEHOLDER: ~78** — all live-path volume tables (WEEKLY_MILEAGE, LONG_RUN_PROGRESSION), easy-pace
  table, phase splits, all governors/arc constants, session magic numbers, preview estimates, proxy
  threshold, contract policies.
- **DEAD: ~42** — every `volume_multiplier` (11), all of `FITNESS_TO_VOLUME` (12) + its consumers (3),
  marathon-pace table (4), `MARATHON_DURATION_REQUIREMENTS` block, the 5k/10k volume+long-run rows
  unreachable via the proxy (6), `calculateWeekVolume`/`distributeVolume` constants (2), the
  race-proximity day-ladder + taper_multiplier + race-distance map on the non-race path.
- **DECORATIVE: ~5** — `quality_density` (all 11 sites, one item) and the `threshold` pace table (4).

---

## DEFENSIBILITY VERDICT

Zero numbers on the live non-race RUN volume/pace/phase path are sourced — every figure that actually
shapes the plan (the `WEEKLY_MILEAGE` start/peak grid, the `LONG_RUN_PROGRESSION` arrays, the
beginner/intermediate/advanced easy paces, the phase-duration splits, and roughly twenty
athlete-state governor coefficients) is an uncited "Hal Higdon-inspired adaptation, not officially
endorsed," so the plan is internally plausible but externally indefensible against any "why this
mileage?" challenge. Compounding this, a large fraction of the surrounding code is inert on this exact
path — all `volume_multiplier` and `quality_density` fields, the entire `FITNESS_TO_VOLUME` table, the
marathon/threshold pace tables, and the 5k/10k table rows are DEAD or DECORATIVE — which means a
reader auditing `base-generator.ts`/`types.ts` will badly misjudge what governs the output unless they
trace call paths, exactly as this document did. The single most consequential defect is documentary,
not numeric: the proxy-distance comment asserts the distance is "nearly inert / CTL-driven," when on
this path it in fact selects the entire volume and long-run prescription — the load-bearing knob is
mislabeled as inert.
