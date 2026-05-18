# Open Questions

Behaviors that look like bugs but might be intentional, or are deferred for a deliberate reason. The point of this doc is to **prevent re-litigation**: when a future session notices one of these and starts to "fix" it, this doc explains why someone already considered it and chose to leave it.

Numbered Q-001, Q-002, … in order of recording. Each entry is tagged with status:

- **cosmetic** — visible but not functionally wrong; user-facing impact is negligible.
- **intentional** — the current behavior is the design call (often paired with a D-NNN decision entry).
- **unverified** — believed correct but never explicitly tested; verification approach noted.

---

## Q-001 — Mon swim+upper renders swim above upper on weekly view

- **Status:** cosmetic
- **Why it exists:** for a strength_first hybrid athlete, the Monday swim+upper stack renders swim above upper in the weekly plan-overview view. The `computeDayTimings()` helper assigns the same AM/PM rank to both (no AM/PM ordering for swim+upper pairings — see D-006), so the discipline-rank tiebreaker takes over (swim=0, strength=3) and swim sorts first.
- **Why not a bug:** §6.1 of `docs/STRENGTH-PROTOCOL.md` only mandates AM/PM sequencing for run+lower interference, which has the real training-science weight (Wilson 2012 ES≈0.94 for running, ≈0.32 for cycling). Swim+upper has trivial physiological interference; ordering is purely visual preference.
- **What "fixing" would require:**
  - Extend `computeDayTimings()` to assign distinct AM/PM ranks to swim+strength pairs based on the athlete's `strength_ordering_preference`.
  - Justify it on training-science grounds (you can't, today — the literature doesn't establish meaningful interference).
  - OR add a "training-priority preference" question to the wizard that sets visual ordering for all stacks regardless of physiological interference.
- **Cross-ref:** D-006.

---

## Q-002 — 14+ hour athletes get a "12-14" tier prescription

- **Status:** intentional
- **Why it exists:** an athlete who declares "14+ hours" with `strength_intent='performance'` actually needs to declare ≥15.5hr to land in the matrix's `14+` tier. At declared = 15hr: 15 - (2 strength × 0.75hr) = 13.5hr endurance → tier `12-14`. Card preview reflects this correctly (per the wizard reactive card, commit e242bec6).
- **Why not a bug:** Option B endurance-hours deduction (D-001) is correct math — it's removing strength wall-clock from the endurance-only tier lookup. The "14+ tier" matrix cell is labeled by *endurance* hours, not declared hours. An athlete training 15hr/week with 1.5hr of that being strength has 13.5hr available for swim/bike/run, which IS the 12-14 tier prescription.
- **What "fixing" would require:**
  - Either change the wizard to surface tier labels as **endurance** hours rather than total declared hours, OR
  - Refactor the matrix to use total-hours brackets and bake the deduction into per-cell prescriptions.
  - Both are wizard copy / UX decisions, not engine bugs.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 3 finding #1.

---

## Q-003 — §6.1 scoping verification (protocol vs load gate)

- **Status:** unverified
- **Why it exists:** `docs/STRENGTH-PROTOCOL.md §6.1` frames "heavy Lower" as a load-magnitude qualifier (Strength Build 78-85%, M+P 70-75%, Rebuild 72-80%, with sub-maximal Hypertrophy/Deload getting relaxed adjacency). The implementation may scope it instead to performance-protocol phase **names**. If so, durability MS phase Lower (also 75-85% × 6-10 reps, equivalent load) would not get the same protective adjacency rules.
- **Why not necessarily a bug:** the load profiles are equivalent but the protocols differ in goals — durability athletes treat strength as expendable per the protocol contract. May be OK to have looser adjacency for durability MS Lower if the athlete is not optimizing for strength PRs.
- **What "fixing" would require (or verifying it's already correct):**
  - Read `_shared/week-optimizer.ts` heavy-Lower classifier.
  - Trace whether it reads protocol name or load magnitude.
  - If protocol-gated: decide whether to extend to durability MS, OR document this as intentional (durability athletes accept the looser adjacency by virtue of the support intent).
- **Estimated time:** ~30 minutes verification.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 1 question item, ENGINE-STATE.md "Questioned".

---

## Q-004 — Full IM §3.7 race-spec strength scaling verification

- **Status:** unverified
- **Why it exists:** per `docs/STRENGTH-PROTOCOL.md §3.7`, Full IM athletes in race-specific phase should get **1× upper-only at maintenance load**, with halved power volume and no depth jumps. Race-spec frequency: 1 (vs 2 for 70.3). Build phase: 1-2. Commit cf5867fa claims "v2.1 close-out — Full IM scaling" but the implementation is not verified by static read.
- **Why not necessarily a bug:** the commit message asserts the behavior was implemented; no evidence of regression has surfaced. May simply need confirmation rather than a fix.
- **What "fixing" would require (or verifying it's already correct):**
  - Read `_shared/strength-profiles.ts` (or wherever distance-aware session-factory branching lives).
  - Confirm race-distance × phase branching exists for the §3.7 Full IM path.
  - If absent: add the modifier (multi-file scope, would warrant its own ticket).
- **Estimated time:** ~30 minutes verification.
- **Cross-ref:** `docs/COVERAGE-AUDIT-2026-05-13.md` Profile 4 question item, ENGINE-STATE.md "Questioned".

---

## Q-005 — `scaledWeeklyTSS` reads declared hours

- **Status:** intentional (deferred), known issue
- **Why it exists:** Plan #60 W6 build week landed at 11h55m vs 11hr budget — 24min over after the §2.1 swim drop. Frequency matrix correctly drops a swim slot, but `scaledWeeklyTSS()` reads declared hours (11hr) not endurance-adjusted (9.5hr), so TSS budget remains at the 10-12 tier (~700-800 build TSS). Remaining sessions absorb the freed TSS and grow longer.
- **Why not a blocking bug:** 24min/week overflow is below the ship-blocking threshold. Compounds across 12 build/peak weeks but doesn't violate any hard contract. Fix is straightforward (plumb `endurance_hours` out of `computeSessionFrequencyDefaults` as a new field, pass to `scaledWeeklyTSS`) but was scoped out of the §2.1 ship to keep that commit reviewable.
- **What "fixing" would require:**
  - Add `endurance_hours: number` to the `SessionFrequencyDefaults` interface.
  - Set it from the existing local `enduranceHours` value in `computeSessionFrequencyDefaults`.
  - Read it in `week-builder.ts:~674` and pass to `scaledWeeklyTSS()` in place of `weekly_hours_available`.
- **Predicted effect:** TSS budget scales to 8-10 tier (~550-650 build TSS), session durations shorten proportionally, hybrid 11hr athlete lands at ~11h flat instead of 11h55m.
- **Cross-ref:** ENGINE-STATE.md "Known broken", `docs/POLISH-PUNCH-LIST.md §4`.

---

## Q-006 — Athlete declares "learning swim" but has high CTL → intermediate, not beginner

- **Status:** intentional (per D-002)
- **Why it exists:** wizard `swim_experience='learning'` adds a soft `score -= 1` to `inferTrainingFitnessLevel`. For an athlete with high CTL (+2) and learning swim (-1), the net score is +1 → intermediate. This athlete will not land at the beginner-tier swim volume bands.
- **Why not a bug:** see D-002. A masters athlete with strong CTL who declares "learning swim" should get **swim** training that reflects their swim level, not a global down-shift that also affects bike/run defaults via the CTL fallback. The soft signal is bounded by score thresholds — it kicks the borderline / low-other-signal cases into beginner where it should, and leaves the strong-elsewhere cases at intermediate where they should be. The protective effect targets the population the cap was designed for.
- **What "fixing" would require:**
  - Either replace the soft signal with a hard clamp (rejected per D-002; would over-clamp strong athletes), OR
  - Add a separate `swim_fitness` tier that overrides `training_fitness` only for swim-specific decisions, leaving global inference untouched. Multi-file scope; out of the original Phase 3 budget. May be the right next step if Q-006 surfaces complaints from real athletes.
- **Cross-ref:** D-002, `docs/TICKET-B-WIRING-AUDIT.md` Phase 3 implementation log.

---

## Q-007 — Cycling TREND historical `avg_hr` resolves null (HR line never draws)

- **Status:** RESOLVED 2026-05-17 (`4177c05c`).
- **Why it existed:** the `pwr20`/`np_trend` historical loop read only `r.computed.overall.avg_hr`, frequently null (set only from an `hr_bpm` sample series); the loop SELECT didn't fetch the reliable `workouts.avg_heart_rate` column. All historical TREND points got `avg_hr: null` → `TrendSparkline`'s `hasHr (≥3)` gate failed → the dashed HR line never drew (label still showed current-ride bpm).
- **Resolution:** added `avg_heart_rate` to the loop SELECT; `hrH` now resolves `computed.overall.avg_hr ?? workout_analysis.fact_packet_v1.facts.avg_hr ?? r.avg_heart_rate` (each candidate guarded individually so a stored 0/null falls through — `Number(null)===0`). Same SELECT-projection class as the `normalized_power_w`/`achievements`/`elevation_gain` fixes. Wide backfill verified: **26/26 rides with a TREND series now have ≥3 HR points** → the dashed line draws on every one.
- **Cross-ref:** `docs/ENGINE-STATE.md` (resolved); `docs/SESSION-CONTEXT.md` §6.

---

## Q-008 — Type-filtered `pwr20_trend_v1` needs a historical re-analysis backfill

- **Status:** RESOLVED 2026-05-17 — one-off script, run wide.
- **Why it existed:** `pwr20_trend_v1` is filtered to rides whose **stored** `classified_type` matches the current ride's. After the VI-gate classifier change, recomputing one ride re-derives only that ride's type; historical rides keep their stale stored type until they too are re-analyzed. So a single recompute can't reach the ≥3-same-type threshold and the series stays null.
- **Resolution:** one-off script over recent rides (not a triggered job). `scripts/verify-cycling-vi-if-fix.mjs --all` (committed `fae293e7`, `--all` mode `83d07fdb`) replays the full recompute chain via the service-role token, re-deriving every stored `classified_type`. Wide run 2026-05-17 (180 d, 30 rides, 0 failed, 26/26 cap-present consistent): 16 historical rides went `null → type`; post-backfill distribution = recovery 6 / threshold 6 / climbing 6 / endurance 5 / tempo 4 (all ≥3, pwr20-eligible) / vo2 2 / sweet_spot 1, **zero null**. vo2/sweet_spot below 3 only because the athlete logged few such rides — not a backfill gap.
- **Cross-ref:** `docs/SESSION-CONTEXT.md` open item #2 (closed); D-015 (VI/IF-source) + D-016 (elevation-source), the classifier-input fixes this backfill propagated.

---

## Q-009 — Race-course segment matching: GPS-track matcher vs "Strava-only segment intelligence"

- **Status:** blocked on a product decision (Build Order #8).
- **Why it exists:** #8 needs course-segment geometry extracted from race-course GPX (Data-Dependency ❌); it was not among the decisions that unblocked #6. The doc itself flags the Garmin GPS-track matcher as the "highest-leverage open question." The forward hook (`cycling_segment_history.race_course_relevant`) is in place.
- **Open question:** build the GPS-track matcher (universal, larger) or accept "segment intelligence is a Strava-connected feature" as a permanent product boundary? Decide before #8 proceeds — do not fabricate a name-match heuristic.
- **Cross-ref:** `docs/CYCLING-ANALYSIS-DESIGN.md` Primary Constraint; `docs/SESSION-CONTEXT.md` open item #3.

---

## Q-010 — EFFICIENCY/POWER dashboard rows keep technical jargon (inconsistent with plain-language INSIGHTS)

- **Status:** intentional (deferred) — cosmetic, not urgent (user-flagged "future pass" 2026-05-17).
- **Why it exists:** the 2026-05-17 plain-language brief deliberately scoped the jargon translation to **INSIGHTS only**; the dashboard rows in `_shared/session-detail/build.ts` stay technical by design — POWER `"178W normalized power at IF 1.01"` (`build.ts:~474`), EFFICIENCY `"EF 1.214 · 1.3% HR decoupling"`. With INSIGHTS now plain-language, the rows read inconsistently beside it.
- **Why not a bug:** product-confirmed dashboard rows may be more technical than the narrative; the values are correct — purely a stylistic inconsistency a future session might "fix" not knowing the INSIGHTS-only scope was a deliberate boundary.
- **What "fixing" would require:** soften the POWER/EFFICIENCY row builders in `_shared/session-detail/build.ts` (terser than INSIGHTS — rows are scannable, not prose; e.g. "178 W · ~threshold", "HR held +1.3%"). workout-detail-only, no backfill (rows rebuild per request). Related minor polish: the INSIGHTS closing clause can hedge ("suggests you're in an active recovery or base-building phase rather than a formal taper") — an anti-speculation prompt line would tighten it; substantive, not a guard-worthy defect, so not added to the 3-guard stack.
- **Cross-ref:** `docs/SESSION-CONTEXT.md` §6 (cosmetic-deferred); `docs/POLISH-PUNCH-LIST.md` cycling Open (P3).

---

## Q-011 — Brick bike legs are NOT auto-extended to the long-ride floor (hard enforcer excludes bricks by design)

- **Status:** intentional (regression-guarded). Filed as "Bug 4 — Brick-as-long-ride validator"; the user-visible defect was fixed 2026-05-12, the residual is deliberate.
- **Why it exists:** `generate-combined-plan` has two long-ride-floor surfaces. The SOFT volume warning (`validate-training-floors.ts` `maxLongRideMinutes`, ~386-402) **does** count a brick's bike leg toward long-ride durability — fixed 2026-05-12 (race-prep weeks replace the standalone `long_ride` with a brick; brick bike ≥ floor → no false "no long ride scheduled (observed=0)" warning; bike leg only — the ≤25 min run-off is transition stimulus). The HARD enforcer (`findLongRideSessionInWeek`, ~512-523, used by `enforceLongDayFloors`) **deliberately skips brick-tagged sessions** (`if (tags.includes('brick')) continue;`).
- **Why not a bug:** the two surfaces answer different questions and are consistent under the design intent — *"did the athlete get long-ride durability volume?"* (yes, the brick bike counts) vs *"is there a standalone `long_ride` session to mutate up to floor?"* (a brick is a distinct stimulus and must not be force-extended; brick durability has its own dynamics). The exclusion is **test-encoded** (`long-day-volume-floors.test.ts:603-615` asserts a 90-min brick bike is not bumped) and **regression-guarded** (`rebuild-phase.test.ts:473-485` — `BRICKS_PER_WEEK['rebuild']=0` exists *because* the enforcer skips bricks; the comment calls the exclusion "correct"; reversing it reintroduces the "week-16 long ride 1.8h instead of 2.5h" regression unless that workaround is kept).
- **What reversing it would require (do NOT do casually):** invert/remove the two tests above, re-evaluate `BRICKS_PER_WEEK['rebuild']=0`, and make a training-science call on whether brick bike legs should be auto-lengthened (currently not, by design). That is a deliberate design change warranting a D-NNN that supersedes this entry — not a bug fix.
- **Note:** the fatal/hard path has **no long-*ride* volume floor at all** (only long-*run* TSS share + WoW raw-TSS ramp). The punch-list's "build/race weeks fail floor checks" framing was inaccurate — bricks never failed a hard long-ride floor because none exists. A net-new hard long-ride floor would be separately-scoped feature work, not Bug 4.
- **Cross-ref:** `supabase/functions/generate-combined-plan/validate-training-floors.ts`; tests `long-day-volume-floors.test.ts`, `rebuild-phase.test.ts`; `docs/POLISH-PUNCH-LIST.md` (Bug 4, closed).

---

## When to add an entry

Add a new Q-NNN when:
- A behavior gets noticed and someone considers "fixing" it but the right call is to leave it.
- A bug is filed but explicitly deferred (note the deferral reason).
- Verification is owed but not yet done — record the verification approach so the next session can pick it up cheaply.

When the answer is established (verified, intentional, or fixed), keep the entry but mark its status. Don't delete entries; they're institutional memory.
