# WORK ORDER — ONE VOCABULARY, FOUR SPORTS (2026-08-02)

> ⛔ **STATUS, 2026-08-02 EVENING: PART 1 IS DONE AND DEVICE-VERIFIED. ONLY THE SWIM + STRENGTH AUDIT
> REMAINS.**
>
> All five bike gaps shipped ([D-367]), plus four decisions the audit did not anticipate: the easy
> governor ([D-364]), one verdict per session ([D-365]), readouts instead of marks ([D-366]), the two
> grades and the coach's fatigue path ([D-368]), and the three-number row ([D-369]). Run and ride are
> verified on a device.
>
> **What is left of this document is PART 3 — swim and strength, never audited for any of it.** Read
> Part 1 for the shape the bike ended up with; read Part 2 for the continuity findings, several of which
> are now filed as [Q-242] … [Q-247]. **Everything in Part 0's "what shipped" table is history.**

**Rewritten 2026-08-02 midday**, read-only, while Michael was out running. The morning half of this
file described work that has since SHIPPED; leaving it standing would have sent the next session to
re-fix it. What follows is: what is true now, the bike spec, and an audit of run ↔ ride ↔ State
including the dead code that is flagged but still wired.

⚠️ **No code was touched producing this document.** Every file:line below was read today. Claims are
tagged **[verified in code]**, **[verified on device]** or **[unverified]** — nothing else is asserted.

---

## PART 0 — WHAT SHIPPED TODAY (do not re-litigate)

All eight are **PUSHED + DEPLOYED**, and the first six are **verified on a device by Michael**.

| what | where | state |
|---|---|---|
| **The easy governor for runs.** An easy run is judged on heart rate, as time under a ceiling — not pace, not average HR. | `_shared/time-under-ceiling.ts`, `analyze-running-workout` | verified on device |
| **The intent gate.** Easy / recovery / long → heart rate. Tempo / threshold / intervals / hills → pace, badge and all. | `_shared/easy-hr.ts` `isEasyPrescribedRun` | verified on device |
| **A tempo run is no longer graded against the easy ceiling.** The old gate asked a helper that returns `steady_state` for everything except intervals and hills. | `analyze-running-workout:2639` | pinned by test |
| **Execution is 50/50 intensity + duration on an easy run.** Four later blocks recompute it from pace+duration, so the override sits at the serialization boundary. | `analyze-running-workout`, just above `analysisV2` | verified on device |
| **One verdict per session.** The per-row pace percentage and its colour come off when the easy governor judged the session. The prescription and the executed pace both still render. | `_shared/session-detail/build.ts` `judgedOnIntensity` | verified on device |
| **A lone work step is "Steady", not "Interval 1".** An interval is a repeat. | `build.ts` `humanizePlannedSegmentLabel` | verified on device |
| **Easy is a readout, not a mark** — `17 of 35 min · under 134 bpm · measured`. Minutes are measured server-side; `total_s` is HR coverage, not session length. | `timeUnderCeiling`, `AdherenceChips` | verified on device |
| **One temperature per screen, and it says when it moved** — `74 → 78°F`. | `build.ts` `formatSessionTemp` | ⚠️ server verified on device; **the HEADER was still showing `74°F` in the 08:33 screenshot** — believed to be Netlify mid-build, **[unverified]** |

**Two client-side rules were deleted, not replaced:** the table's own "Steady" override (it overwrote
labels the plan had genuinely named), and the chip's fallback to the percentage when the measured
seconds are absent. **No measurement, no chip.**

**Deliberately NOT done:** a bulk re-analysis backfill. It rewrites `heart_rate_summary`, which is
State's durability substrate — too much movement to tidy two chips.

---

## PART 1 — THE BIKE SPEC: FINAL TOUCHES TO MIRROR RUN

### ⛔ Read this first: the deterministic composer already exists and is already wired

`_shared/insights/bike-insights.ts` (173 lines) is a **deterministic** bike insights composer written
2026-07-19, and `analyze-cycling-workout/index.ts:8` imports and calls it **[verified in code]**. There
is **no LLM in the bike Insights path**, exactly as there is none in the run's.

**So this is not a build. It is a clause-set job.** Run's composer is 258 lines and can emit ~16
clauses; bike's is 173 and can emit ~11. The bike screen reads thin because the *interval* family has
almost nothing to say when a ride has no structured reps — which is most rides.

**The receipt, from Michael's 2026-08-01 Long Ride [verified on device]:**

> INSIGHTS — *"Ridden at threshold — 141 W normalized at 0.8 intensity, 69 TSS."*

One sentence. Tracing it: the ride classified `threshold` → family `interval` → no reps, so the
rep clauses (`bike-insights.ts:107-111`) are skipped → only the zone clause (`:113`) fires → done.
**Nothing else in that branch exists.**

### GAP 1 — the sentence that should have led, and does not exist in either composer

That ride was **prescribed easy** (the Easy chip fired: `9 of 64 min under 131 bpm`) and **ridden at
threshold** (the Insights line says so). The screen holds both facts three lines apart and **never
connects them.**

That connection is the single most useful sentence the screen can carry, and neither composer has a
clause for it. It is not a bike gap — it is a gap in both, and the bike is where it shows.

**Spec:** a prescription-vs-execution clause, first in the paragraph when they disagree.

> *"Prescribed easy, ridden at threshold — 9 of 64 minutes stayed under your 131 bpm ceiling."*

⚠️ **It must read the existing fields, not re-derive.** The prescription comes from the same intent
signal the governor uses; the execution zone comes from `classified_type`, which
`rideZoneLabel()` (`bike-insights.ts:~24`) already reads. **No second opinion about what zone the
ride was.**

⚠️ **And it is a FACT, not a scolding.** Voice law: no imperatives, conditional consequences. State
the mismatch; the cost belongs to State, not here.

### GAP 2 — conditions as load: the bike composer has no clause at all

Run has one (`run-insights.ts:156`) that fires on heat + climbing + RPE together:

> *"Warming from 74 to 78°F — both add a little load, and you carried it at RPE 2."*

Michael's ride was **81°F with 958 ft of climbing** and the paragraph said nothing about either
**[verified on device]**. The bike composer's input type has no conditions field.

**Spec:** port the run clause. Same shape, same thresholds, same voice. Bike-specific note: 958 ft
over 15.7 mi is a real climbing load and the existing run gate (`gain >= 150`) would fire.

### GAP 3 — heart-rate drift has no row of its own

Run gets a **HEART RATE** row. Bike's drift is `0.4%` buried inside the **EFFICIENCY** row
(*"Watts per heartbeat 0.967 · HR drift 0.4%"*) **[verified on device]**.

**Spec:** split it out, matching run's row name. Efficiency keeps watts-per-heartbeat; heart rate gets
the drift.

⚠️ **Units differ across the screens on purpose or by accident — decide which.** Run's session screen
says drift in **bpm** (`Drifted +11 bpm`); bike says **%**; State's durability read uses **%**. Someone
should rule. **[unverified]** whether the bpm/% split was ever a decision.

### GAP 4 — Pacing fires only on rides with intervals

`formatCyclingPacingRow(intervals)` needs structured work intervals (`build.ts:~1634`)
**[verified in code]**, so an unstructured ride gets no Pacing row — and the Long Ride above got none.

Power fade across halves is measurable on any ride with a power meter, and it is the bike's exact
analogue of run's positive/negative split.

**Spec:** first-half vs second-half normalized power when no intervals exist. ⚠️ **Do not copy run's
wording** — run's split is pace-based and grade-adjusted; the bike's is a power comparison and should
say so.

### GAP 5 — ⛔ A DIVERGENCE INTRODUCED TODAY, AND IT IS OURS

The **run** Terrain row now renders the temperature through `formatSessionTemp` (`74 → 78°F`).
The **ride** Terrain row still reads `weatherTempF` directly and prints one number (`81°F`)
(`build.ts:~1660`) **[verified in code + on device]**.

Two sports, one screen family, two temperature vocabularies — introduced this morning by the fix that
was meant to end exactly that. **Point the ride row at `formatSessionTemp` too.**

⚠️ The comment above that block reads *"temp is not persisted for rides — omitted"*. **That is false**
— the ride screen prints 81°F. Stale comment; delete it.

### Bike row shape, target state

| row | run today | bike today | bike target |
|---|---|---|---|
| **Insights** | multi-clause: shape, HR, conditions+RPE, intent | 1 clause on an unstructured ride | + prescription-vs-execution, + conditions, + fade |
| **Pacing** | always (splits) | intervals only | + power fade across halves |
| **Heart rate** | own row, bpm | inside Efficiency, % | own row; settle bpm vs % |
| **Terrain** | `74 → 78°F`, humidity, heat stress | `81°F`, no humidity | shared formatter |
| **Efficiency** | — | watts/heartbeat + drift | watts/heartbeat only |

---

## PART 2 — AUDIT: RUN ↔ RIDE ↔ STATE

### A. Where the session screen and State disagree

**A1. "Efficiency" means two different things on the two screens. [verified in code]**

- Ride **session** screen: *"Watts per heartbeat 0.967"* — `efficiency_factor`, normalized power ÷ HR.
- Ride **State** row: *"N bpm at easy power"* — `bike_fitness_v1.hr_at_band`.

Different numerators, different denominators, one word. A rider comparing the two screens has no way
to know they are not the same measurement. The **heading** was aligned on 2026-08-01 (the session
block says *"Heart rate at easy power"*, State's words) — but the **Efficiency row** still speaks the
other metric under the shared name.

**A2. The run session screen never names the number that feeds its State row. [verified in code]**

The bike does: `MobileSummary.tsx:338` — *"Lower over time means fitter — this feeds your bike read on
State."* There is no run equivalent. State's run row trends **grade-adjusted pace ÷ HR**; the run
session screen shows **drift in bpm**. Same athlete, same run, no stated relationship.

**This is the one place the bike is AHEAD of the run**, and it was true before today.

**A3. State's run and bike rows still cannot see a deload week. [verified in code — and the doc is now wrong in the other direction]**

`isDeloadWeek` (`deload.ts:26-29`) reads `meta.phase`, falling back to `meta.name`. D-338 wired
`meta.phase` for **strength** (`assemble.ts:210`, `strength.ts:65`).

**Run and bike series still carry no `meta` at all** — `run.ts:50`, `run.ts:86`, `run.ts:273`,
`bike.ts:37` all build `{date, value}`. So `{ exclude: isDeloadWeek }` evaluates false on every run and
bike point, every time.

**Consequence: a deliberately light week can still read as "sliding" on the run and bike rows** — the
exact failure D-338 fixed for strength.

⚠️ `STATE-SOURCE-MAP.md` finding #2 says this exclusion "has never once fired". That is **half stale**
— it fires for strength now. The doc should say *which* series, or the next session will either
re-fix strength or trust run and bike.

**A4. State never scores a session; the session screen does. [verified in code]**

State produces a direction and a change against the athlete's own range. Execution / Duration are
marks out of 100. This is now a deliberate asymmetry (Easy was demoted to a readout today), but
**Execution on an easy session is still a percentage built half from a heart-rate stand-in**. Whether
Execution should exist at all on an easy session is **an open product question**, not a bug.

### B. Legacy and dead code — flagged, and still wired

**B1. `getAdvancedMetrics` — dead, and wrong inside. [verified in code]**
`CompletedTab.tsx:1034`. Assigned to `advancedMetrics` at `:1136` and **never read again** — the whole
block renders nothing. Inside it, `:1035` reads `const isRun = workoutData.swim_data` — identical to
the `isSwim` line two rows down. So swims take the run branch and the `else if (isSwim)` branch is
unreachable. **Harmless today because nothing renders it**, which is exactly why it will be trusted by
whoever revives it. Delete the block, or fix the flag and wire it deliberately.

**B2. `AppleHealthSwimEnrichment` is imported and never rendered. [verified in code]**
`MobileSummary.tsx:11` imports it; the JSX comment at `:385` says it was left *"in the tree
(unrendered) for the cleanup sweep."* The sweep has not happened. It is dead weight in the bundle.

**B3. Four computed-then-discarded blocks in the ride path. [verified in code]**
`build.ts:1545, 1569, 1627, 1674` — normalized-power row, avg/max HR row, the seven-band power-zone
distribution, and the VAM climbing row. Each computes its value fully and then `void`s it.

**These are documented decisions, not accidents** — each carries a dated comment explaining why it is
not shown. ⚠️ **But they still run on every ride.** They are wasted work and, more importantly, they
are four rows a future session will find "already built" and switch on without reading why they were
switched off. **Recommendation: keep the reasoning, move it to a `D-NNN`, and delete the code.** That
is the spec-lifecycle rule applied to code.

**B4. `is_easy_like` is now a second, looser easy signal. [verified in code]**
`build.ts:~781` derives it from `workout_type` + `week_intent` regex. The authoritative easy signal is
now the presence of `intensity_adherence`, which the analyzer emits only on a true easy prescription.
`AdherenceChips` no longer keys the Easy chip off `is_easy_like` — but `showPaceChip` still does, and
`EnduranceIntervalTable:108` still reads it. **Two definitions of "easy", one strict and one loose.**
Not currently causing a visible fault; it is the shape that caused today's tempo bug.

**B5. Three hand-maintained analyzer routing tables. [from CLAUDE.md, not re-verified today]**
`ingest-activity`, `recompute-workout/orchestrator-lib.ts:16`, `bulk-reanalyze-workouts/index.ts:40`.
Any new sport or cache must be registered in all three. **[unverified] today.**

### C. Doc drift found while auditing

- `STATE-SOURCE-MAP.md` finding #2 — half stale (B3/A3 above).
- `build.ts` ride-Terrain comment — *"temp is not persisted for rides"* is false.
- `RUNNING-CYCLING-DELTA.md` (2026-05-13) — large parts have shipped. It is still an accurate *shape*
  document and a dangerous *task list*. It needs a banner saying so.
- `analyze-running-workout` carries a 2026-07-03 comment describing the header-vs-terrain temperature
  fix as done. It was done for two call sites of three. Today's shared formatter is the version that
  cannot be half-applied — **the comment should point at it.**

---

## PART 3 — WHAT I DID NOT CHECK

Said plainly so nobody reads absence as clearance:

- **Swim and strength.** Still never audited for any of this. The morning's version of this file made
  that the first task and it remains untouched.
- **Whether the bike gaps above are visible on a ride that HAS intervals.** Every bike observation
  here comes from one unstructured Long Ride. A structured ride may already render Pacing and reps.
- **Any of the four `void`ed ride blocks' correctness.** I read that they do not render; I did not
  check whether their maths is right.
- **The `~1.5% power delta vs Garmin`** (avg 113 vs 115 W, max matching exactly at 424 W). Still
  filed, still uninvestigated.
- **`Workload 86` reading as TSS** on the ride readouts. Still a label problem, still open.

## PART 4 — SUGGESTED ORDER

1. **GAP 5** (ride Terrain → shared formatter). Smallest, and it closes a divergence we opened today.
2. **GAP 1** (prescription-vs-execution clause). Highest value per line, and it serves both sports.
3. **GAP 2 + 3 + 4** (conditions clause, HR row, power fade). The bike row-shape work proper.
4. **A3** (deload metadata on run + bike series). A correctness bug on State, independent of the above.
5. **B1 + B2 + B3** (delete the dead paths, move the reasoning to decisions). Cheap, and it stops the
   next session switching four rows back on.
