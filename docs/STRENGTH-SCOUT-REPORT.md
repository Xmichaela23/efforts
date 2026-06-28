# STRENGTH-SCOUT-REPORT — where strength periodization & phase-name sniffing live

**Type:** read-only map. No code changed. Method: read the four start points in full, then grep
the whole repo (`supabase/functions/**`, `src/`) for string-matches against phase names
(`Base/Speed/Prep/Race Prep/Build/Taper/Peak/Retest/recovery`). Every row cites `file:line`.
Where docs and code disagree, **code wins** and the disagreement is recorded.

**Scope note on "Retest":** the token `'Retest'` (capitalized) is produced in exactly ONE place —
`generate-run-plan/base-generator.ts:439` (`applyRetestTail`, a pure string rename of `Taper`→`Retest`
and `Race Prep`→`Build`). The lowercase combined-plan enum `'retest'` is a separate, first-class
`Phase` value (`generate-combined-plan/types.ts:16`) emitted by `phase-structure.ts:241`. The two are
different mechanisms and are mapped separately below. "Handles Retest?" in the run tables means
"does this site recognize the capitalized `'Retest'` name produced by `applyRetestTail`?"

---

## The symptom, traced (the live run non-race path)

`generate-run-plan` accepts `terminalShape: 'taper' | 'retest'` (`types.ts:16,110`) and passes it into
`determinePhaseStructure` (`base-generator.ts:424`). When `terminalShape === 'retest'`,
`applyRetestTail` (`base-generator.ts:436-446`) **renames** `Taper`→`Retest` and `Race Prep`→`Build`
in place — changing only `name` and `focus`. No volume, intensity, frequency, or day count moves.

Downstream consumers in the same engine key off the literal string `'Taper'`. After the rename there is
no `'Taper'` phase, so they fall through to their build/non-terminal branches:

| consumer | what it does on a real Taper | what it does on the renamed Retest |
|---|---|---|
| `sustainable.ts:183` speedwork gate (`phase.name !== 'Taper'`) | suppresses optional speedwork | **leaves speedwork ON** (Retest ≠ Taper) |
| `sustainable.ts:329` `find(p => p.name === 'Taper')` | `taperStart` = taper week → volume backs off across taper | **`find` returns undefined → `taperStart = duration_weeks`**; build mileage holds until the final calendar week only |
| `strength-overlay.ts:274` / `:586` (`phase.name === 'Taper'`) | runs `getTaperStrengthParams` → cuts strength freq + load | **no taper params → full build strength load in the retest week** |
| shared strength protocol (`isTaper = phase.name === 'Taper'`) | returns `createTaperSessions` | **emits full build-phase sessions** |
| `base-generator.ts:679` `getRunningDaysForWeek` | min days on Taper | **handled** — explicitly also checks `'Retest'`, so day count IS reduced |

Net: a "retest" terminal week gets **fewer days (correct)** but each remaining day keeps
**speedwork on + full strength load + near-build mileage** — the incoherent terminal described in the
brief. The only site that was taught the new name is the day-count helper (`:679`); every
periodization decision (volume, speedwork, strength back-off) was not.

---

## Engine 1 — `generate-run-plan` (legacy run fork; the live `approach='sustainable'` path)

Routing: `index.ts:163` switch on `approach`; `'sustainable'` → `SustainableGenerator` (`:164`),
`'performance_build'` → `PerformanceBuildGenerator` (`:183`). Strength bolted on via
`overlayStrengthLegacy` (`index.ts:219`).

### base-generator.ts (shared base class for all run generators)

| file:line | decision | phase name(s) keyed | handles `'Retest'`? | notes |
|---|---|---|---|---|
| `base-generator.ts:283-408` `determinePhaseStructure` | **builds** the phase list (Base/Speed/Race Prep/Taper) + volume_multiplier per phase | emits `Base/Speed/Race Prep/Taper` | n/a (producer) | the canonical run phase vocabulary |
| `base-generator.ts:414` recovery-week exclusion | `find(p => p.name === 'Taper')` to keep taper weeks out of recovery list | `Taper` | **no** — runs BEFORE the rename (`:424` after), so correct by ordering | comment at `:421-423` documents the ordering dependency |
| `base-generator.ts:424` | gate: only rename tail when `terminalShape==='retest'` | — | producer | calls `applyRetestTail` |
| `base-generator.ts:436-446` `applyRetestTail` | **pure rename** Taper→Retest, Race Prep→Build; changes name+focus only, no volume/intensity | `Taper`, `Race Prep` → `Retest`, `Build` | producer of `'Retest'` | the root of the smear |
| `base-generator.ts:679` `getRunningDaysForWeek` | min running days for the week | `Taper`, `Retest` (+ isRecovery) | **YES** — the one site taught the new name | scheduling decision |
| `base-generator.ts:893` `generatePlanDescription` | cosmetic: joins phase names into prose | all names | n/a | display only |
| `base-generator.ts:705-709,908` | hard/easy classification by **tag** (`hard_run/intervals/tempo/threshold`), not phase | none (tags) | n/a | tag-based, not phase-based |

### sustainable.ts (the live non-race generator)

| file:line | decision | phase name(s) keyed | handles `'Retest'`? | notes |
|---|---|---|---|---|
| `sustainable.ts:183` | **speedwork on/off** — adds optional strides/fartlek unless recovery or Taper | `Taper` | **no** → speedwork stays ON in retest | the symptom's speedwork half |
| `sustainable.ts:329` | **volume taper anchor** — `find(p => p.name === 'Taper')` sets `taperStart` | `Taper` | **no** → `taperStart = duration_weeks`, build mileage holds | the symptom's volume half |

### Other run generators (parallel copies of the same gates)

| file:line | decision | phase name(s) keyed | handles `'Retest'`? | notes |
|---|---|---|---|---|
| `simple-completion.ts:183` | speedwork on/off | `Taper` | no | sibling of sustainable:183 |
| `simple-completion.ts:326` | volume taper anchor (`find 'Taper'`) | `Taper` | no | sibling of sustainable:329 |
| `cumulative-load.ts:133,228,269` | long-run + quality volume taper cut | `Taper` | no | Hansons-style |
| `balanced-build.ts:186` | marathon-pace finish only in `Race Prep` | `Race Prep` | n/a (rename makes it `Build`) | after rename, MP finish suppressed |
| `balanced-build.ts:402-456` `switch(phase.name)` | per-phase workout flavor (Base/Speed/Race Prep/Taper) | all four | no `Retest`/`Build` case → `default` | |
| `balanced-build.ts:609,725` | volume taper anchor | `Taper` | no | |
| `volume-progression.ts:74` | MP long-run finish | `Race Prep` | n/a after rename | |
| `volume-progression.ts:87-93` | quality session type by phase | `Base/Speed/Race Prep` | no | |
| `volume-progression.ts:105-106,146` | speedwork gate + long-run taper cut | `Taper`, `Speed`, `Race Prep` | no | |
| `time-efficient.ts:107,186,245,249` | speed/tempo/long-run taper cuts | `Taper` | no | |
| `performance-build.ts:1126,1285,1413,1475` | volume taper anchors (`find 'Taper'`) | `Taper` | no | the other live approach |
| `performance-build.ts:1340,1357` | recovery-week + peak-week detection | `Race Prep`, `Taper` | no | |
| `hybrid-athlete.ts:76` | speedwork gate | `Taper` | no | |
| `hybrid-athlete.ts:77-79` | quality flavor | `Base/Speed` | no | |
| `hybrid-athlete.ts:127-145` `getStrengthFrequencyForPhase` | **strength FREQUENCY by phase** (Base/Speed/Race Prep/Taper → 2/2/1/1, recovery→1) | all four | no | **strength-periodization decision living in a run generator** — note this engine is a self-contained strength path that does NOT use strength-overlay.ts |
| `hybrid-athlete.ts:147-167` `getStrengthIntensity` | **strength load/sets/reps by phase** (%1RM per phase) | all four | no | same — strength periodization inside a run generator |

### strength-overlay.ts (the run engine's strength bolt-on)

| file:line | decision | phase name(s) keyed | handles `'Retest'`? | notes |
|---|---|---|---|---|
| `strength-overlay.ts:274-284` | **taper step-down trigger** — `isTaperPhase = phase.name === 'Taper'` → log taper params | `Taper` | **no** → retest week never enters taper branch | |
| `strength-overlay.ts:586-593` | **taper step-down apply** — same gate inside `computeStrengthForPlanWeek`; builds `taperParams` only when `phase.name==='Taper'` | `Taper` | **no** | drives `applyTaperLoadScale` + `filterToTaperFrequency` |
| `strength-overlay.ts:129-237` `getTaperStrengthParams` / `applyTaperLoadScale` / `filterToTaperFrequency` | **the actual taper periodization logic** — sensitivity-gated frequency (0/1/2) + load scale | reached only via `'Taper'` gate above | no | this is real strength periodization, gated entirely on the string `'Taper'` |
| `strength-overlay.ts:578` | recovery-week detection via `recovery_weeks` array (not name) | none (array) | n/a | numeric, not name |

**Note:** `strength-overlay.ts` itself owns ZERO phase-by-phase strength prescription (Base/Speed load
curves). It delegates that to the shared protocol modules (Engine 2) via `protocol.createWeekSessions`.
Its only periodization role is the **taper step-down** (freq + load), and that is gated on `'Taper'`.

---

## Engine 2 — `shared/strength-system/protocols/*` (the protocol modules; called by BOTH the run overlay and the combined plan)

These receive a `StrengthPhase` whose `.name` is a CAPITALIZED string. From the run path it is the
post-rename name (so `'Retest'` can arrive here). From combined-plan it is mapped via
`session-factory.ts:toStrengthPhase` (Engine 3). Every module gates its taper behavior on
`phase.name === 'Taper'` and its build behavior on `Base/Speed/Race Prep/Build`.

| file:line | decision | phase name(s) keyed | handles `'Retest'`? | notes |
|---|---|---|---|---|
| `protocols/types.ts:17` | declares `name: string // 'Base'\|'Speed'\|'Race Prep'\|'Taper'` | (the vocabulary contract) | no — `'Retest'` not in the contract | |
| `upper-priority-hybrid.ts:72` | `isTaper` → `createTaperSessions` (light maintenance) | `Taper` | **no** → full build sessions on Retest | run default-ish protocol |
| `upper-priority-hybrid.ts:73,94,239` | Friday optional / upper-peak only in `Speed`/`Race Prep` | `Speed`, `Race Prep` | no | |
| `upper-priority-hybrid.ts:129-181,253-330,416-464,610-616` | per-phase sets/reps/load (Base/Speed/Race Prep/Taper) | all four | no → `default` | strength load periodization |
| `foundation-durability.ts:56` | `isTaper` → `createTaperSessions` | `Taper` | **no** | run "durability" protocol (D-215 maintain default) |
| `foundation-durability.ts:117,152,181-347,408-429,549-559` | per-phase sets/reps + RIR (Base/Speed/Race Prep/Taper) | all four | no | |
| `five-by-five.ts:85,95` | `isTaper` → deload curve (`load = loadForWeek(.., isRecovery \|\| isTaper)`) | `Taper` | **no** | D-215 standalone-developer default |
| `minimum-dose.ts:55,99-145,342-348` | `isTaper` → taper; per-phase volume | `Taper`, `Base`, `Speed`, `Race Prep` | no | maintenance dose |
| `performance-neural.ts:67,201` | `phaseName === 'recovery'` → recovery session | `recovery` (lowercase) | n/a | this one keys lowercase |
| `performance-neural.ts:232-256,403-475,636-653` | **strength frequency + load by phase** (`switch`: Base/Build/Speed/Race Prep/Recovery/Taper → freq 2/2/1/3/3/4) | all + `Build`/`Recovery` | no `Retest` | a full per-phase frequency table inside a protocol |
| `triathlon.ts:83,750` | `phaseName === 'recovery'` branch | `recovery` (lowercase) | n/a | tri protocol |
| `triathlon.ts:599,996` | phase label `reducedVolume ? 'Race-Specific' : 'Build'` | derived | n/a | |
| `triathlon_performance.ts:138` | `phaseName === 'recovery'` branch | `recovery` (lowercase) | n/a | |

**Key cross-engine fact:** the combined-plan path NEVER lets `'Retest'` reach these modules — it maps
`retest → 'Taper'` before calling them (Engine 3, `session-factory.ts:2238`), so the protocols behave
correctly there. The run path lets the renamed `'Retest'` flow straight in, so the SAME modules emit
full build sessions. The leak is the run path's rename, not the protocols.

---

## Engine 3 — `generate-combined-plan` (the ONE engine; lowercase `Phase` enum)

Vocabulary: `types.ts:16` — `Phase = 'base'|'build'|'race_specific'|'taper'|'recovery'|'rebuild'|'retest'`.
Here `retest` is a **first-class phase**, not a rename.

| file:line | decision | phase name(s) keyed | handles `retest`? | notes |
|---|---|---|---|---|
| `phase-structure.ts:241` | **emits the terminal**: `lastAIsNonRace ? 'retest' : 'taper'` (D-213 Cut 4) | producer of `'retest'` | yes | **CODE WINS over a stale comment — see Disagreements** |
| `phase-structure.ts:346,364,401` | terminal block placement keyed on `terminalShape` | `taper`/`retest` | yes | |
| `phase-structure.ts:431,595,657,675-677` | volume/intensity multipliers; `recovery`/`taper`/`rebuild` cases | `recovery/taper/rebuild` | **no `retest` case** → falls to default | potential combined-plan leak (see below) |
| `session-factory.ts:2226-2243` `toStrengthPhase` | **maps combined phase → protocol StrengthPhase name**; `retest → 'Taper'` (`:2238`) | all; `retest`→`Taper` | **yes — strength is taper-shaped on retest** | the correct handling the run path lacks |
| `week-builder.ts:1829` | **strength frequency = 0 on recovery** (`if (phase === 'recovery') strFreq = 0`) | `recovery` | n/a | strength-frequency periodization decision |
| `week-builder.ts:1830-1839` | `recoveryRebuildWeek1` skip + `strength_sessions_cap` clamp (0–3) | derived | n/a | **the frequency CAP lives here** (relevant to Q-088) |
| `week-builder.ts:665,810,2134` | brick/quality gating on `recovery` | `recovery` | n/a | |
| `science.ts:608-619` `longRunFloorMiles` | **long-run volume floor by phase** (base/build/race_specific/rebuild/taper/recovery) | those six | **no `retest`** → `default 0.75` (build-like floor) | combined-plan volume leak on retest |
| `science.ts:638-648` `longRideFloorHours` | bike long-ride floor by phase | same | no `retest` → `default 0` | |
| `science.ts:365-369` strength volume share by phase | base/build/race_specific/taper | those | no `retest` | |
| `science.ts:730-736` `POSTURE_TERMINAL_PHASES` | posture-protocol terminal set — **includes `retest`** | `taper/recovery/rebuild/retest` | **yes** | one combined-plan site that DOES list retest |
| `validator.ts:60,131,157,302` | structural validation skips `recovery`/`taper` | `recovery/taper` | no `retest` | validator may not special-case retest |
| `validate-training-floors.ts:381,530,763` | floor checks skip/relabel `recovery` | `recovery` | n/a | |
| `swim-protocol-volumes.ts:120` / `swim-protocol-v21.ts:21` | swim phase remap (`recovery/deload → taper/recovery`) | `recovery/deload` | n/a | |

---

## Engine 4 — `generate-triathlon-plan` (legacy tri fork)

Capitalized phase names like the run fork (`Base/Build/Taper`); no `Race Prep` in the 3-phase shapes.
No `Retest` concept in this fork at all (non-race tri goals are meant to route through Engine 3 per D-213).

| file:line | decision | phase name(s) keyed | handles `Retest`? | notes |
|---|---|---|---|---|
| `tri-generator.ts:256-283` | builds phases (Base/Build/Taper) + volume_multiplier | producer | no | |
| `tri-generator.ts:296,360,486,500,549,697` | volume/day taper cuts on `Taper` | `Taper` | no | |
| `tri-generator.ts:393,592,688,779,834` | per-phase quality/brick flavor | `Base/Build` | no | |
| `tri-generator.ts:1084-1095` | maps tri phase → protocol StrengthPhase name | `Base/Build/Race-Specific/Taper` | no | feeds Engine 2 |
| `index.ts:225,252,257` | recovery-week + taper detection; `focus_code` by phase | `Taper`/`recovery` | no | |

---

## Leak summary

**Strength-periodization decisions living OUTSIDE a strength module:**

1. `generate-run-plan/generators/hybrid-athlete.ts:127-167` — a complete **strength frequency + load
   per-phase table** baked into a run *endurance* generator, bypassing `strength-overlay.ts` and the
   shared protocols entirely. This is the most isolated copy of strength periodization in the repo.
2. `generate-combined-plan/week-builder.ts:1829-1839` — strength **frequency = 0 on recovery** and the
   `strength_sessions_cap` clamp (0–3) live in the week-builder, not in a strength module. This is the
   physical location of the "2–3 cap" Q-088 wants to lift.
3. `generate-combined-plan/science.ts:365-369` — strength **volume share by phase** lives in the
   endurance science module.
4. `generate-combined-plan/session-factory.ts:2226-2243` — the **phase→strength-phase name mapping**
   (incl. the load-bearing `retest→'Taper'`) lives in the session factory; the protocols receive
   whatever name this hands them.
5. `strength-overlay.ts:129-237` — the **taper step-down** (sensitivity-gated frequency + load scale)
   is real periodization, but it is reachable ONLY through a `phase.name === 'Taper'` string gate at
   `:274`/`:586`. The logic is fine; its trigger is a string-match that the run-retest rename defeats.

**Load-bearing phase names, by number of distinct sites that string-match them:**

- **`'Taper'` (capitalized)** — the single most load-bearing token. Matched at **~30+ distinct sites**
  across Engines 1, 2, 4: every run generator's volume anchor + speedwork gate, both
  `strength-overlay.ts` taper gates, every shared protocol's `isTaper`, every tri-generator taper cut.
  The `applyRetestTail` rename breaks ALL of these at once for the run-retest path. The day-count helper
  (`base-generator.ts:679`) is the only one taught to also accept `'Retest'`.
- **`'Race Prep'` (capitalized)** — ~10 sites (MP-finish gates, quality flavor, peak-week detection).
  Renamed to `'Build'` by `applyRetestTail`, silently disabling MP-finish + peak logic on retest plans.
- **`'Base'` / `'Speed'`** — ~20 sites, all per-phase strength/quality load curves in Engines 1, 2.
- **`'retest'` (lowercase)** — emitted at exactly ONE site (`phase-structure.ts:241`); consumed
  correctly at `session-factory.ts:2238` (strength) and `science.ts:730` (posture), but MISSING a case
  at `science.ts:608/638` (volume floors) and `phase-structure.ts:431+` multipliers → falls to defaults.
- **`'Retest'` (capitalized)** — emitted at exactly ONE site (`applyRetestTail`, `base-generator.ts:439`);
  consumed (recognized) at exactly ONE site (`base-generator.ts:679`). Every other run/protocol consumer
  silently misses it.

---

## Disagreements & open threads (code wins)

- **D1 — stale comment, retest is NOT dead.** `session-factory.ts:2236-2238` comment says
  `retest` is "Dead until a producer emits 'retest' (Cut 4)." **Code wins:** `phase-structure.ts:241`
  (D-213 Cut 4) DOES emit `'retest'` (`lastAIsNonRace ? 'retest' : 'taper'`). The mapping is live, not dead.
- **D2 — combined-plan retest volume floor leak.** `science.ts:608-619 longRunFloorMiles` and
  `:638-648 longRideFloorHours` have no `retest` case → `retest` falls to `default` (0.75 build-like
  long-run floor; 0 ride floor). So in the combined engine a retest terminal gets a **build-shaped
  long-run floor**, not a taper-shaped one — a smaller-scale echo of the same run-path leak, on the
  volume side. Recorded as a thread, not fixed.
- **D3 — combined-plan phase multipliers.** `phase-structure.ts:431,595,657,675-677` enumerate
  `recovery/taper/rebuild` but not `retest`. Whether retest should share taper's multiplier or its own
  is unresolved in code (falls to default). Open thread.
- **D4 — routing tension (not resolved here).** D-213/D-214 say non-race goals route through
  `generate-combined-plan`, yet `generate-run-plan` carries a full `terminalShape='retest'` path
  (`types.ts:16,110`, `applyRetestTail`) with its own retest handling. Code shows BOTH paths exist. The
  brief states the *live* run non-race path is `approach='sustainable'` through `generate-run-plan`.
  Whether `generate-run-plan`'s retest path is still reachable in production vs. superseded by the
  combined short-circuit (D-214 amendment) is not determinable from static code alone — flagged as an
  open thread, not asserted either way.
- **D5 — protocol vocabulary contract excludes Retest.** `protocols/types.ts:17` documents the legal
  names as `Base|Speed|Race Prep|Taper`. `'Retest'` is outside the contract yet is passed in by the run
  path. The protocols don't validate the name; they silently `default`. Open thread on whether the
  contract or the producer is wrong.
</content>
