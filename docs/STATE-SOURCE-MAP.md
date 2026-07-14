# STATE SOURCE MAP — what feeds every row, and what it silently drops

**Built 2026-07-14 from a code trace, with the load-bearing claims re-verified by hand.** Written because a live State row went 16 days stale and the screen never said so.

> **THE RULE THIS DOC EXISTS TO ENFORCE:** *a confidence flag is not an exclusion order, and an exclusion is not allowed to be silent.* If a workout does not count toward a row, the row says so. Anything else is a screen that lies by omission — and it will lie **confidently**, because the number it shows is real. It is just old.

**Read with:** `LIFECYCLE.md` (frozen vs live) · `CONSTITUTION.md` (Law 1: one source per fact) · `ENGINE-STATE.md`.

---

## The map

| Row (as the athlete sees it) | Substrate (the actual column) | Gates that EXCLUDE a session | Does the screen SAY it dropped one? |
|---|---|---|---|
| **RUN · aerobic base** (durability / decoupling) | `workouts.workout_analysis.heart_rate_summary.decouplingPct`, **listed from `route_progress_metrics`** (`compute-snapshot:667`) | no route row · `basis='raw'` (no elevation) · non-steady type · <20 min · implausible % | **Staleness yes** ("last steady run Nd ago"). **Exclusions no.** |
| **RUN · efficiency** | `workout_facts.run_facts.efficiency_index` | non-steady · **duration outside 30–70 min** (`run.ts:81`) · corrupt HR | **No.** The clause just vanishes. |
| **BIKE · power** | `workout_analysis.bike_fitness_v1.w20` | only climbing / threshold / sweet-spot / tempo rides | No — but see "not a bug" below. |
| **BIKE · efficiency** | `bike_fitness_v1.hr_at_band` | only endurance / recovery · ≥10 min in-band · not hard-ridden · HR not corrupt | Partial (shows a clean-HR count when it differs). |
| **SWIM · pace** | `workout_facts.swim_facts.pace_per_100m` | equipment-contaminated · not-as-planned · implausible | **No** — the drop count is computed (`swim.ts:29`) and never rendered. |
| **STRENGTH · volume** | `workout_facts.strength_facts.total_volume_lbs` | zero-volume sessions | **No.** Empty-state copy also misstates the floor ("2+ sessions"; the real floor is 3–5). |
| **STRENGTH · e1RM** | `exercise_log.estimated_1rm` | **primary lifts only** (squat/bench/DL/trap-bar/OHP) · bodyweight lifts score 0 and drop out | **No.** A dumbbell-only lifter gets no read and is never told why. |
| **LOAD / ACWR** | `workouts.workload_actual` | completed only · **chronic floor 500** · phone/imported workouts never get a value at all | Thin base yes ("provisional"). The phone/import hole **no**. |
| **BODY · heart-rate response** | run decoupling + bike efficiency | inherits every gate above | **Yes — the best row on the screen.** Names each discipline, its age, and stamps the OLDEST contributor. |
| **BODY · aerobic fitness** | — | **dead row.** Coach hardcodes `null / sample_size 0` (`coach:2131`) so the render gate can never be true. | n/a — invisible to everyone. |

---

## The four findings, verified

**1. The "as of" date drifts, and it always drifts optimistic.** The server stores an *age in days* relative to when the snapshot was computed (`classify.ts:56`). The client renders it as `today − age` (`StatePerformanceSection.tsx:49-54`). So if the snapshot is N days old, every "as of" on the screen is N days too fresh. **Live receipt:** on 2026-07-13 the screen read *"as of Jun 27"* while the newest qualifying run was **Jun 28**. Off by one, in the flattering direction. **Fix: ship the newest data DATE, not its age.** A date cannot rot; an age computed against the wrong clock always does.

**2. The deload exclusion has never once fired.** `isDeloadWeek` reads `point.meta.name` (`deload.ts:15`) and **no adapter in the trend layer ever sets `meta`** (verified: zero non-test matches). Every `{ exclude: isDeloadWeek }` evaluates `/deload/i.test('')` → false, always. The file's own comment describes behaviour that does not happen. **Consequence, and it is the exact failure the file says it prevents: a deliberately light deload week can read as "sliding".**

**3. The whole run column is built on the routes table.** `compute-snapshot:667` seeds the run substrate from `route_progress_metrics` and joins everything else onto it. Familiar Routes is a *courtesy feature*; it is currently a **gate on fitness**. A run that fails the route write — **no GPS distance, under 1 km, treadmill** (`route-intelligence.ts:133`) — does not exist for State, even though `workout_facts` holds a perfectly good decoupling number for it. **For a treadmill athlete this excludes 100% of runs.** The one column the routes table actually owns (`effort_adjusted_pace_sec_per_km`) is fetched and **no longer read by any rendered verdict** — State pays the exclusion cost for a column it doesn't use.

**4. The run efficiency read excludes the long run.** Duration must be 30–70 minutes (`run.ts:81`). For a marathon athlete, the most informative session of the week is excluded from the efficiency trend **by construction**, every week.

---

## Not a bug — do not "fix" this

**The bike power/efficiency split is deliberate and correct.** Power counts only hard rides (climbing / threshold / sweet-spot / tempo); efficiency counts only easy ones (endurance / recovery). Every ride feeds exactly one of the two. An endurance-only cyclist gets an efficiency read, not a power read — that is the design, not a starvation. `bike-fitness.ts:18-23` states the reason: an endurance ride's 20-minute "best" is not a fitness maximum. **Leave it.**

---

## The systemic rules that come out of this

1. **A confidence flag is not an exclusion order.** (The 2026-07-14 bug: `basis='raw'` meant "no elevation" to one file and "low confidence" to another. The trend took the harsher reading and deleted the run.)
2. **No silent drops.** If a gate excludes a session, the row says how many and why. The drop counts already exist in code (`swim.ts:29`) — they are simply never rendered.
3. **Ship dates, not ages.** Any freshness value computed against one clock and rendered against another will drift.
4. **A courtesy feature may never gate a fitness verdict.** The run column must read the spine (`workout_facts`), not `route_progress_metrics`.
5. **Every gate must be justified by the field, then checked against data — never fitted from data.** Data confirms or refutes. It does not get to design. And never tune a gate to one athlete's numbers.
