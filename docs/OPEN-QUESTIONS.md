# Open Questions

Behaviors that look like bugs but might be intentional, or are deferred for a deliberate reason. The point of this doc is to **prevent re-litigation**: when a future session notices one of these and starts to "fix" it, this doc explains why someone already considered it and chose to leave it.

Numbered Q-001, Q-002, … in order of recording. Each entry is tagged with status:

- **cosmetic** — visible but not functionally wrong; user-facing impact is negligible.
- **intentional** — the current behavior is the design call (often paired with a D-NNN decision entry).
- **unverified** — believed correct but never explicitly tested; verification approach noted.

---

> **📁 Q-001 → Q-129 have been moved to [`archive/OPEN-QUESTIONS-archive-Q001-Q129.md`](archive/OPEN-QUESTIONS-archive-Q001-Q129.md)** (split 2026-07-13 — this file was 423KB and unreadable).
> The archive still matters: its whole purpose is to stop you "fixing" something someone already considered and chose to leave. **Grep it before changing an intentional behaviour.** This file holds **Q-130 onward**.
>
> ⚠️ **A Q-entry is a LEAD, not a verified bug report.** D-281 was built on one screenshot, against four decisions that forbade it, and was reverted the same day. **Read the D-NNN law before touching the machinery it governs.**
>
> ⛔ **When you close or supersede a Q — including one in the archive — GO BACK AND ANNOTATE IT.** Q-136, Q-138, Q-169 and Q-100 were all fixed or superseded and all still read as open until 2026-07-13.

---

## Q-196 — CORRECTED: the LOAD row is FINE. A stale raw-ACWR `label` survives server-side with no known consumer (ENGINE, 2026-07-20)

> ⛔ **THIS ENTRY WAS FILED WRONG AND IS CORRECTED IN PLACE.** The original claimed State's LOAD row renders a raw ACWR band and could contradict the reconciled verdict. **It does not.** `LoadBar.tsx:71` renders `statusVolumeLabel(loadStatus?.status)` — the RECONCILED verdict, exactly as D-260/D-266 require. "balanced" on screen is reconciled `on_target`, not an ACWR band. I asserted the client's behaviour from the server's code without opening the client. Filed, and corrected, in the same session that catalogued this failure mode (Q-195).

**What is actually true.** `coach/index.ts:5464-5470` still computes a raw-ACWR `label` (`<0.8` "build more" / `<=1.3` "balanced" / `<=1.5` "back off" / `>1.5` "rest now"). Two of those four words are PRESCRIPTIONS minted from a ratio alone, which is what D-281 shipped and Q-166 reverted — **THE RULE: the ratio DESCRIBES; the body PRESCRIBES** (Item 3: "escalates only when both keys agree; Load-high + body-fine → `elevated` max, descriptive copy only").

**No client consumer was found** for that field in `LoadBar.tsx` or `StateTab.tsx`. `src/lib/load-headline.ts:48-49` still carries defensive fallbacks FOR "back off"/"rest now", which suggests it was once wired and is now vestigial.

**What to settle:** trace every consumer of that payload field. If none, DELETE it — a prescriptive raw-ratio label sitting in the payload is a loaded gun for the next surface that renders it "because it's there". If something does consume it, align it to `statusVolumeLabel`'s reconciled, descriptive vocabulary. **Do not simply reword it in place** without knowing who reads it.

## Q-194 — the BANNED-WORD VOICE CHECK is enforced in three places and NOT on the most prominent line on State (PRODUCT, 2026-07-19 — code-verified, LIVE on screen)

The banned-word list is the app's copy law made mechanical ("a quant who trains, not a coach who encourages"). It is enforced in `_shared/state-trend/week-accent.ts:56`, in `_shared/insights/run-insights.ts:84`, and in `bike-insights.ts` / `coach-week-insights.ts`. **It does not run on `intent_summary`** — the headline rendered at the TOP of State (`StateTab.tsx:1401`), above everything else.

**Live proof, screenshotted 2026-07-19:** State reads **"Establishing your baseline — body is ready, stay consistent."** That is a literal template at **`coach/index.ts:5492`** (the deterministic `intent_summary` IIFE — NOT the LLM; confirmed by the string being in source). It contains **two banned phrases**: `stay consistent` (banned in `week-accent.ts:56`) and `body is ready` (banned in the insight composers). The neighbouring branch at `:5493` is clean ("Establishing your baseline — consistency is the goal.").

**Two more, same class, in `_shared/marathon-readiness/index.ts`:** `:273` "Training base looks solid — **stay consistent** and trust the taper." and `:296` "Hit that and **stay consistent** on easy runs." Both also carry IMPERATIVES ("trust the taper", "Hit that"), which the describe-don't-prescribe rule (D-155) bans independently.

**The point is not the three strings — it is that the law is per-surface.** Every new deterministic surface re-implements or forgets the check. **The fix is a SHARED enforcer** (one exported predicate the composers, the accent, `intent_summary` and marathon-readiness all call) rather than three copies and several gaps. ⛔ **Copy not changed — the replacement wording is Michael's call, not a silent edit.**

## Q-195 — THE ANTI-REBUILD WARNING DID NOT WORK ON A SESSION THAT HAD READ IT: three rebuilds in one night (PROCESS, 2026-07-19)

`CLAUDE.md` and the top of `ENGINE-STATE.md` both open with "IT HAS BEEN BUILT… grep the name you were about to give it." The 2026-07-19 D-306 session read both, cited both, **and still hand-rolled three things that already existed**:

1. **A stall detector.** Built a per-set reps-vs-prescribed comparison believing nothing recorded it. `planned_reps` was already written by `analyze-strength-workout:2748-2753`, already on `exercise_log` (`compute-facts:1346`), and already reaching the coach (`coach/index.ts:4343-4353`). The DATA existed; only the comparison was missing. *(Partial credit: the comparison genuinely did not exist.)*
2. **A partial-week gate.** Wrote a day-of-week "only compare on Sundays" guard for the Q-177 trap. **That trap was solved months earlier** — payload `v100` ("gates on planned-BY-TODAY, not the whole week") and `v102` ("counts days STRICTLY before today"), both recorded in the version comment in the SAME FILE being edited.
3. **A week-to-date load comparison.** Summed planned-vs-actual by hand off `acute7_by_type`. `computeWtdLoadSummary` (`_shared/adherence-plan.ts:60`) already returns `planned_wtd_load` / `actual_wtd_load` bounded to today, and is **called at `coach/index.ts:1075`** — 2,800 lines above the code that reimplemented it.

**Why the warning failed, and it is not "didn't read the docs":** in all three cases the session was not asking "does X exist?" It was asking "how do I express Y?" — and the answer arrived as a *design idea*, which never triggers the grep reflex. **You grep a NOUN you are about to name. You do not grep a PROBLEM you are about to solve.** All three existed under names the session would not have guessed (`computeWtdLoadSummary` for "compare planned to actual so far"; a payload-version comment for "handle partial weeks").

**Cheap mitigation to try:** before writing any comparison/aggregation, grep the SHAPE not the name — `planned_wtd|wtd_load|by_today|beforeToday|planned_reps` — and read the `COACH_PAYLOAD_VERSION` comment chain, which is a de-facto changelog of every trap already solved in that file. **Not yet adopted anywhere; filed so the next session knows the warning alone is insufficient.**

## Q-189 — the coach narrative's TEN honesty validators run and are then DISCARDED (ENGINE, 2026-07-19 — code-verified, live)

`generateCoaching` (`_shared/athlete-snapshot/coaching.ts:415-430`) runs `validateNarrative` + a coach-only `add`-ban, and on failure retries ONCE with the violations named — then **accepts whatever comes back regardless.** The comment at `:428` states it outright: *"retry-then-soft-accept (never regress to the deterministic fallback over a rule miss)."* So on the PRIMARY narrative path the validators are advisory. This includes **rule 6, `spine_contradiction`** — the check that stops the prose disagreeing with the engine's own fitness verdict. The strict "return null rather than lie" policy documented in `narrative-core/orchestrate.ts:1-4` governs only the LEGACY fallback path (`coach/index.ts:4846`), which fires only when the primary path throws.

**Why it matters beyond the copy:** the cache-version comments (`coach/index.ts:125-126`) describe the drop policy as if it covers the week narrative generally. It does not. **Moot if the deterministic composer (D-306) lands** — a composer has nothing to validate. Filed so nobody trusts the guard in the meantime.

## Q-190 — there are TWO LLM narrative paths, not one; and the deterministic fallback emits the tally the app bans (ENGINE, 2026-07-19 — code-verified)

The ENGINE-STATE banner named one output-LLM on State. There are two. **Primary:** `coaching.ts:408` (`claude-sonnet-4-20250514`, passed as a raw string, bypassing the `MODELS` alias map in `_shared/llm.ts:33-38` — so the coach is pinned to an older Sonnet than the app's alias). **Legacy:** an inline fetch at `coach/index.ts:4826` (`claude-sonnet-4-5-20250929`), reached only when the primary throws or returns empty (`:3827`). **Delete one and the other silently takes over.**

Separately, `fallbackCoaching` (`coaching.ts:477-491`) — reached when the LLM call itself fails or `ANTHROPIC_API_KEY` is unset — emits `` `${done} of ${planned} planned sessions completed so far.` `` That is exactly the **NO RAW COMPLETION TALLIES** form the prompt bans at `coach/index.ts:4732` as scolding. The safety net says the one thing the design forbids.

## Q-191 — the interference verdict is POSTURE-BLIND and makes a causal claim the evidence cannot carry (ENGINE + SCIENCE, 2026-07-19 — code-verified)

`compute-snapshot/index.ts:537` computes `interferenceScore` from two trend arrows: aerobic improving + structural declining → `endurance_dominating`; the reverse → `strength_dominating` ("Heavy lifting may be limiting endurance adaptation"). Two problems.

**1. Posture-blind — the Q-179 bug class, one level down.** The declared `per_discipline_posture` is read in the SAME FILE at `:775`, into a different consumer (`assembleStateTrends`). The interference score never sees it. So an athlete who declares run=maintain / strength=develop and **executes that plan perfectly** produces exactly the divergence the engine labels interference. D-292 fixed this for the run row; this path was missed.

**2. It is not a claim the data supports.** Divergence is not interference. Attribution needs a control condition; an app has one uncontrolled athlete. Worse, the outcome measure is e1RM, whose measurement CV is 2.4–9.7%, while the interference effect on explosive strength is SMD −0.28 — **the effect is smaller than the instrument's error bar**, and the literature states directly that daily 1RM prediction cannot detect fatigue. What IS sayable is scheduling STRUCTURE (same-session pairing, order, hours of separation), because that is recorded exactly. See the 2026-07-19 addendum in `SCIENCE-concurrent-training-interference.md`.

**Live reach is limited:** the interference line reaches prose only via the legacy path (`coach/index.ts:4610`). A second consumer at `:3452` was NOT traced. **D-306 supersedes this rather than repairing it** — the composer answers "what is affecting what" from declared focus + scheduling instead.

## Q-192 — `five_by_five` is MISSING from `strength-profiles.ts` and silently falls back to DURABILITY (ENGINE, 2026-07-19 — code-verified, impact untraced)

`_shared/strength-profiles.ts` calls itself "single source of truth for protocol-specific progression/deload thresholds," consumed by **`adapt-plan`** (auto weight adjustments) and **`response-model/weekly`** (lift verdicts). Its `StrengthProtocolId` union lists six protocols and **`five_by_five` is not one of them** (0 occurrences in the file). `resolveProfile()` (`:163-166`) falls through to `DEFAULT_PROFILE`, which is `PROTOCOL_PROFILES.durability` (`:91`).

So a 5×5 plan is progressed and graded against durability's numbers — target RIR 2.5, `minGainPct` 3%, deload at deviation ≤ −1.0 over 3 sessions — where durability is described in that same file as "high rep, endurance support, conservative progression." For a linear block whose load is supposed to climb ~1.25%/week on a schedule (`protocols/five-by-five.ts`), an RIR-gated progression model is the wrong shape.

⚠️ **What is verified:** the absence and the fallback. **What is NOT:** whether it changes behaviour. The 5×5 ramp is computed at plan build in `five-by-five.ts:loadForWeek`, so the PRESCRIPTION may be correct and only the ADAPTATION layer wrong. **Needs an `adapt-plan` trace before anyone edits the table** — and the right numbers should come from `SCIENCE-5x5-linear-progression.md`, not invention.

## Q-193 — THE STALL IS INVISIBLE: two separate aggregations each round away "prescribed 5, did 3" (ENGINE, 2026-07-19 — code-verified)

On a linear block the **stall** — missing reps at the prescribed load — is the protocol's own terminal event (`SCIENCE-5x5-linear-progression.md` §4 → retest). The data to detect it is present and reaches the coach. Nothing compares it.

- `planned_reps` reaches the coach per exercise (`coach/index.ts:4343-4353`, from `workout_analysis.strength_facts`; written by `analyze-strength-workout:2748-2753`, and also on `exercise_log` via `compute-facts:1346`).
- Actual per-set reps are in the same loop (`coach/index.ts:4361-4368`).
- **But `bestReps = Math.max(...reps)` (`:4370`)** — so 5×5 executed as 5,5,5,4,3 reports "5 reps" and reads perfect.
- **And `adherence_pct` is `ea.adherence.set_completion`** (`analyze-strength-workout:2753`) — SET completion, not rep completion. All 5 sets were performed, so that reads 100% too.

The existing code DOES compare weight against plan (`coach/index.ts:4386-4391`, "exceeded plan by / below plan by / on target") — it simply never does the same for reps. **The signal is one per-set subtraction away, on data already loaded at narrative-mint time:** any set with `reps < planned_reps` at `weight >= planned_weight`. Wanted by D-306's protocol read; not yet built.

## Q-183 — a STRAY non-Monday `athlete_snapshot` row silently disables the ENTIRE S2 server-render path for the primary user (ENGINE, 2026-07-14 — found while shipping D-292, deliberately NOT chased)

**Status: unverified root cause, real symptom.** The coach reads the athlete_snapshot with **MAX `week_start`** (`coach/index.ts:2209`, `order('week_start', desc).limit(1)`). But there is a snapshot row keyed to a **non-Monday** date (`2026-07-14`, a Tuesday) that has **no `state_trends_v1`** (the spine block only computes for `week_start === mondayOfToday()`, i.e. the Monday row `2026-07-13`). So the coach grabs the stray row → `state_trends_v1.display` is null → `weekly_state_v1.trends.display` is null → **the client falls back to its LIVE in-browser assembly on EVERY load.** The whole S2 optimization (server-assembled cards, ~9 fewer client queries, D-260-era) has been **silently inactive** for this user.

**Why it wasn't chased:** it predates all of 2026-07-14's work, and the posture render fix (D-292) made the live path read the goal too, so posture is correct on BOTH paths regardless. **Two things to settle in a dedicated pass:** (1) WHERE does the non-Monday row come from — who writes an athlete_snapshot with a non-Monday `week_start`? (2) the coach should select the CURRENT-WEEK snapshot (`mondayOfToday`), not `max(week_start)` — but guard for the case where this week's row doesn't exist yet. **Do NOT confuse this with anything shipped 2026-07-14.**

## Q-185 — orphan NULL-`workout_id` rows in `route_progress_metrics` (2026-07-17, deferred — data hygiene, non-blocking)

D-295 set `UNIQUE(workout_id)` on `route_progress_metrics`, but a UNIQUE index permits MULTIPLE NULLs — so pre-existing rows with a null `workout_id` survive the dedup. They are harmless to every rendered read (no workout join → no decoupling row → never a baseline candidate and never in the trend series). A cleanup pass can delete them, but there is no read-path reason to rush it. Wake-trigger: any future query that trusts `route_progress_metrics` row COUNTS (nothing does today).

## Q-186 — the anchor-descent accent's FIRST REAL firing is unobserved; only test-triggered (2026-07-17, unverified — watch)

The `anchor_descent` accent (D-294) fired live ONLY because I reset the anchor to re-trigger it during verification (it then self-healed). It has never fired on a NATURAL descent (the athlete's crown source aging out on its own). ⛔ This is DEPLOYED, not VERIFIED. What settles it: watch for it on the next real anchor descent and check the credit gate (`aerobicCarriers.length>0 && hrResp.verdict!=='sliding'`) once against real cross-signals — confirm the credit clause renders only when the aerobic work genuinely covered the load.

## Q-187 — ~2 stray superseded rows in `fitness_baselines` lineage from the live-verify reset (2026-07-17, deferred — prune carefully)

Verifying the descent accent required resetting the run anchor on real data, which left ~2 extra superseded rows in `fitness_baselines`' history for Michael's run/decoupling. The ACTIVE crown is correct (3.4%, Jul 12) — only the audit lineage has test artifacts. ⚠️ Prune WITH Michael, not blind: the stray rows' `superseded_at` timestamps overlap genuine supersedes from the same session, so a naive "delete recent superseded rows" would eat real history.

## Q-188 — swim anchor stays in calibration until a first RPE≥7 swim (2026-07-17, intentional — not a bug)

`deriveSwim` (D-293/D-294) anchors on the 2nd-fastest CONFIRMED-HARD swim (RPE≥7, crown-from-N). Michael has no qualifying hard swim on record in-window, so the swim fitness mode is `facts_only` with no anchor — correct and honest (no dot invented from easy swims). Wake-trigger: the first RPE≥7 swim gives it a second hard effort → a provisional swim anchor appears automatically. Nothing to fix; noted so the next session doesn't "fix" the missing swim dot.

## Q-184 — four SILENT-DROP / staleness fractures on the State screen, catalogued in `STATE-SOURCE-MAP.md` (ENGINE, 2026-07-14 — code-verified, deferred)

Found while building the State source map. All four verified in code; none blocking; all worth a pass:

1. **The "as of" date drifts OPTIMISTIC.** The server stores an AGE in days (`classify.ts:56`); the client renders it as `today − age` (`StatePerformanceSection.tsx:49`). If the snapshot is N days old, every "as of" reads N days too fresh. Live receipt: "as of Jun 27" when the newest qualifying run was Jun 28. **Fix: ship the DATE, not the age.**
2. **The deload exclusion has NEVER fired.** `isDeloadWeek` (`deload.ts:15`) reads `point.meta.name`; **no adapter in the trend layer ever sets `meta`** → `/deload/i.test('')` is always false. A deliberately light deload week can therefore read as "sliding" — the exact failure the file's comment claims it prevents.
3. **The entire RUN column is gated on the ROUTES table.** `compute-snapshot:667` seeds the run substrate from `route_progress_metrics` (a courtesy feature), so a run that fails the route write — no GPS distance, sub-1km, **treadmill** (`route-intelligence.ts:133`) — is invisible to State even though `workout_facts` holds a good decoupling number. A treadmill athlete is 100% invisible. The one column routes owns (`effort_adjusted_pace_sec_per_km`) is fetched and **no longer read by any rendered verdict**.
4. **Run efficiency excludes the long run by construction** (`run.ts:81`, duration 30–70 min). For a marathon athlete the most informative session is dropped from the efficiency trend every week.

⛔ **NOT a bug (do not "fix"):** the bike power/efficiency split (power = hard rides only, efficiency = easy rides only) is deliberate and correct — every ride feeds exactly one. See `STATE-SOURCE-MAP.md §"Not a bug"`.

---

### Q-130 — GAP artifact on flat routes: ~18s/mi GAP-vs-raw on a flat loop → false `gap_terrain_bias='downhill'` (RESOLVED 2026-07-05, DEPLOYED)

**ROOT CAUSE + FIX (shipped `291a7228`, deployed `compute-workout-analysis`):** it was NOT a grade/elevation bug — it was an **aggregation-method mismatch**. `overall.avg_gap_s_per_mi` was computed as `gapSum/gapCount` — an **arithmetic mean of per-sample GAP pace** — while raw `avg_pace` is `total_time/total_distance` (harmonic/distance-weighted). `AM ≥ HM` by the variance of pace, so GAP read ~15s/mi slower than raw on ANY pace-varying run **regardless of grade**. Reproduced on the real 2709-sample track: arithmetic-mean-of-RAW-pace alone = 769 vs true 754 (15s/mi from aggregation, zero grade). Fix: pure `aggregateGapPace()` in `gap.ts` (total flat-equivalent time / total distance) → on a flat run GAP ≈ raw exactly; real grades still adjust. Fixture `gap.test.ts` (4). **Verified 7/5:** avg_gap 772→757, `gap_terrain_bias` downhill→flat, narrative drops "net downhill" (3/3 recomputes). **Two smaller siblings deferred:** the per-split GAP fallback (`compute-workout-analysis:1883`) + `compute-workout-summary.gap_pace_s_per_mi` weight differently (time-weighted / separate field) — reconcile later; neither fed the false-downhill symptom. The eyes-open reproduction stopped two wrong fixes (elevation smoothing → only 3s/mi; the terrain narrative guard → papering over a bad number).

**SYMPTOM:** 7/5 Silver Lake Reservoir LOOP (flat, 43ft gain, returns to start) produces `gap_terrain_bias='downhill'`. GAP pace `772 s/mi` vs raw `754 s/mi` = **18s/mi slower**, which `computeGapTerrainBias` (`ai-summary.ts:738`) reads as net-downhill (GAP slower than raw → grade assisted raw pace). The narrative then faithfully says "the route's net downhill bias" (prompt injects it at `ai-summary.ts:543` when `gap_terrain_bias='downhill'`).

**WHY IT'S A BUG (not a true claim):** the route is a LOOP → ends at start → NO net elevation drop; `terrain_type='flat'`, 43ft gain → no net grade to assist pace. So the 18s/mi GAP-vs-raw delta has no elevation justification — **GAP is producing a ~18s/mi artifact on a flat loop.** The number is wrong, not the sentence.

**NOT A NARRATIVE FIX (record so nobody re-adds it):** a Q-128-style terrain "fabrication" guard was built AND REVERTED this session — there is no fabrication; the narrative correctly reports a bad GAP number. The lesson banked: `terrain_type='flat'` (low grade *variance*, "not rolling") ≠ no net grade; and GAP-vs-raw is real signal — verify GAP before calling terrain "invented." Fix is UPSTREAM in GAP, not the narrative honesty layer.

**SCOPE / WHY IT MATTERS (Q-127 dependency):** GAP pace feeds load (`workload`) AND the pace-vs-norm baseline math — the **SWC baseline + Witness 2** of Q-127's two-witness fatigue read. A systematic GAP error on flat routes corrupts the exact inputs the peripheral-fatigue read depends on. **Q-130 is effectively a prerequisite for Q-127's accuracy on flat routes** — build note added there.

**INVESTIGATE:**
- Why is GAP 18s/mi slower than raw on a flat loop? (per-sample grade-stream noise? GPS elevation jitter that doesn't net to zero on a loop? GAP mis-integrating small grades?)
- **Wrinkle found:** the per-split `avgGapPace_s_per_km` is NULL for all 3 miles, yet the AGGREGATE `avg_gap_sec_per_mi=772` is present. Why does the aggregate GAP compute but the per-split doesn't — and is the aggregate integrating noise the per-split path rejects?
- Flat-route-specific or broader? Pull 2–3 other flat runs, check GAP-vs-raw delta. Consistently non-zero on flat → systematic.
- Confirm the `gap_adjusted=true` path — is `avg_gap` computed off a noisy per-sample grade that doesn't net to zero on a loop?

**DELIVERABLE:** GAP should net ≈ raw on a flat loop (`|GAP − raw|` within noise, not 18s/mi). Fixture: a known flat loop → `|GAP − raw| < threshold`.

### Q-131 — Familiar Routes: honest, heat-adjusted per-route performance-over-time (design filed 2026-07-06, NOT built — fresh-session build)

> **STATUS 2026-07-06 (later): SUPERSEDED by Q-132 / D-250.** This route-trend approach was BUILT + deployed, then proved structurally unsound (path-overlap route identity over-merges distances / fragments trailheads / double-matches → verdicts flip-flop). The honest version is the **segment model** (`DESIGN-segments.md`). Kept for institutional memory; do not build the route-trend version.

**Strava-adjacent, the honest version.** An athlete has ~5 routes they run/ride a lot (user 45d122e7: 17–40× each); they want "am I getting faster on my usual loop." Strava shows raw clock times (condition-blind — a cool-day PR vs a hot slog aren't comparable). Efforts' edge: **same-route removes hills** (constant), **heat/humidity adjustment removes the rest**, read as **pace-per-HR not raw time** → true fitness with the weather taken out. **Foundation BUILT** (D-248 path identity + backfill; per-run metrics; temp/humidity in `weather_data`; `efficiency_index`). **Feature scoped, NOT built** — full design: `docs/DESIGN-familiar-routes.md`.

**Core engineering (from the design):** heat-adjust pace-per-HR via **dew point** (temp+humidity, better than temp alone) with a bespoke coefficient `k` (same class as Q-127 DOMS coeffs — population default, tune against own hot/cool same-route runs), OR a per-route **regression-residual** for high-N routes. One schema add: `temp_f`/`humidity_pct`/`dew_point_f` on `route_progress_metrics` (written in compute-facts from `weather_data`). Surfaces: a **Routes list + route detail** (a route TREND is macro → its own view, per the CONSTITUTION; the session line stays familiarity-only = the doorway, D-249). Honesty gates tied to the CONSTITUTION/CANON: glass-box the adjustment, hedge (directional not precise), confidence-gated, one-source-of-truth with State.

**5 forks need Michael's ruling** (see §7 of the design): heat model (linear-now vs regression), reference condition (dew point ≤55°F?), `k` default + tuning, where the Routes view lives, rides (power-per-HR) now or phase 2. **Build order** in §8 (schema + heat primitive first — reusable regardless of UI).

*(The OTHER fresh-session build is the fatigue / `training_reaction` NUMBER — Q-127 heavy-legs two-witness + `CANON-arc-inference-model.md`. Both are separate fresh sessions.)*

### Q-132 — Segment model (the commercial-grade route-performance rebuild) — BUILT + LIVE (2026-07-07)

> **STATUS 2026-07-07: BUILT + LIVE on real data (steps 0–6; D-256/D-257).** Effort extraction (`core-effort.ts`, `metric_source` per-slice), verdict on the spine (`core-verdict.ts` + `compute-core-verdict` → `core_verdicts`, N≥8 floor + 6-month window + CI gate + the still_building/still_learning split), server surface (`workout-detail` → `session_detail_v1.segment_verdicts[]`, PLURAL), client (`RouteDoorway.tsx`, flag-driven), all registered at the 2 chokepoints (`compute-facts` + `compute-snapshot`, `dry_run` verified reaching each leaf). Match corridor tuned 30→50m on real GPS (D-257) → 23 efforts (21 in window); live verdict `still_learning`, −1.4%, CI [−11.7, 8.9], stable across recomputes. Card polish shipped (HR tap detail, brighter dots, working touch tap, legibility). **Segment is now the SECONDARY lens — Best Efforts is primary (D-258 / Q-135).** ⚠ iOS bundle NOT rebuilt (card web-only until `npm run ios`). ⚠ Q-133 peel-back now trivial (see Q-133).

> **STATUS 2026-07-06 (later): NOW BUILDING (was SPEC'D, NOT BUILT).** Schema live on prod (`route_cores` + `core_efforts`, tracked migration `20260706120000_create_core_model.sql`). Primitives built + fixtures green: `_shared/core-match.ts` (ordered path-match, 8/8), `_shared/core-detect.ts` (consensus detection, 12/12), `_shared/gps-points.ts` (loader, verified on real `gps_track` shape). `detect-cores` edge fn deployed; **one core frozen on real data** (user 45d122e7's 1.83mi home out-and-back, N=15), born-once freeze guard proven idempotent. Rulings recorded in D-254 (forks) + D-255 (consensus + calibration). **Remaining:** step 3 (effort extraction → `core_efforts`), step 4 (verdict on the spine, Law 5, N≥8 floor, reuse `routeHeadline`/`routeTrend`), step 5 (server surface reads spine verdict), step 6 (client `RouteDoorway`), step 7 (backfill + real-data verdict-stability verification — the acceptance bar). **STEP-3 REQUIREMENT (do not retrofit):** each `core_effort` must record its metric **provenance** — a flag/enum (e.g. `hr_aligned` true/false or a `metric_source`) distinguishing an effort computed from real time-aligned HR from one that degraded to raw-pace fallback (HR sparse/unaligned). Otherwise step 4 cannot tell a clean pace:HR decoupling from a "we never had HR" null and would silently mix different-confidence facts — the exact Law-2/3 fabrication gap the audits catch. Needs a `core_efforts` column add (ALTER) at step 3.


The Familiar Routes route-trend (Q-131) was built + deployed then found **structurally unsound** (D-250 — route identity over-merges distances, fragments trailheads, double-matches; verdict flip-flops on real data). The honest path forward is the **SEGMENT model** (Strava/Garmin precedent): compare a fixed sub-path every run covers, not a variable-length route. Full spec: **`docs/DESIGN-segments.md`** — 8 steps, 3 hard geospatial primitives (ordered path-match, segment detection, segment-effort extraction), reuses the read engine (`routeHeadline`/`routeTrend`) + `RouteDoorway` shell. **5 forks need Michael's ruling** (§8): (1) auto-detect "spine" vs user-defined segments [rec **auto**]; (2) reverse direction = separate segment [rec **yes**]; (3) confidence floor N≥8 [confirm]; (4) DB constraint audit + add migrations for the route tables [**none exist** in-repo]; (5) keep per-route "run N×" as the doorway [rec **yes**]. **Verification bar:** STABLE on his real data across recomputes (fixtures-green ≠ correct — the route saga proved it, §9 of the design). Build in a FRESH session (heavy, novel geospatial code; clean context beats this muddy one). Michael's primary run = out-and-back at VARIABLE lengths from a few trailheads (dry climate; heat parked, D-251).

### Q-133 — The route-trend feature is DEPLOYED but SUPERSEDED — leave or peel back? (2026-07-06, decision owed, defer to the segment build)

> **STATUS 2026-07-07: route-trend read-path is now DEAD DATA — peel-back is now TRIVIAL (still owed).** The segment build's step-5/6 (D-256) switched the client from `terrain.route`/`buildRouteReadout` to the new `session_detail_v1.segment_verdicts[]` (`SessionNarrative.tsx` consumer flipped). So the superseded route-trend readout is now **emitted-but-unread** — there is no consumer left to migrate; peel-back = delete the dead `buildRouteReadout` + `terrain.route` emission in `session-detail/build.ts`. Low-risk cleanup, do it when the segment dust settles; nothing depends on it now.

> **STATUS 2026-07-06 (later): STILL OWED — peel-back deferred again.** Ruled (D-254 fork 4) to defer the peel-back through the segment build rather than resolve it now. The superseded route-trend read-path remains **live on prod edge functions** (`compute-facts` / `analyze-running-workout` / `workout-detail`); the `RouteDoorway` client remains **local-only / unpushed**. Decision (peel read-path back to familiarity-only now vs leave until segments replace it) is to be resolved **with the step-5 segment read-path** that supersedes it. Open action — do NOT let this quietly persist past step 5.


This session **deployed the route-trend / temp-correction / 365-day-history / server-readout work to prod** on user 45d122e7's account (`compute-facts`, `analyze-running-workout`, `workout-detail`). D-250 supersedes the approach (→ segments). The deployed feature is mostly harmless (shows familiarity + a flip-floppy trend behind the doorway) but it's LIVE. **Decision owed** (defer to the segment build): leave it until segments replace it, or peel the read-path back to familiarity-only now. The client `RouteDoorway` UI is committed but **LOCAL-only** (not pushed to web/Netlify, iOS not rebuilt) — the trend UI is only on Michael's local dev, not on device. Note also: widened route history 90d→365d in `fact-packet/build.ts` is live and affects the AI-summary route context too.

### Q-134 — Governance lint/CI gate for Laws 1/4/5 (FILED, not built) (2026-07-06)

The durable answer to "can the constitution actually govern, or is it a friendly dictator?" Today Laws 1/4/5 (one source of truth / surfaces render / born on the spine) are enforced by **human audit, after the fact** — which is why the route-trend could mint its verdict in `build.ts` and *ship*, caught only post-deploy. Law 6 (fixtures) is the one law with real machinery. **The fix is to convert the constitution from a document into a compiler:** a CI check that (a) greps surface files (`session-detail/build.ts`, `src/components/**`) for verdict-minting signatures; (b) asserts client payload contract types carry no raw-metric fields (the D-253 payload-keys guard, generalized); (c) fails when a new read-limb bypasses the spine. This is the provenance-guard pattern already used for data-fabrication, generalized to **verdict-governance**. **Open design question owed:** what is the *detectable signature* of "minting a verdict"? (a computed comparison/threshold reaching a user-facing string in a surface file? a type carrying `ci`/`slope`/raw arrays across the client seam?) That question is real work with its own answers — **deferred to its own session**; the segment build (Q-132 / D-250) ships under governance-by-construction (D-253) in the meantime, which disarms *this* feature's surfaces without the general gate. When built, this gate is what makes the writ run without depending on a well-behaved developer.

### Q-135 — Best Efforts as the PRIMARY (cross-sport) fitness lens; segments demoted to secondary (2026-07-07, DIRECTION SET + spec written, NOT built)

The pivot from the segment feature (D-258): the fixed-route segment is correct but narrow (fires only on true route repeats), and the primary user runs an AREA, not routes — so the incumbent answer for variable running (Strava/Garmin **Best Efforts**: fastest pace at benchmark distances / power at durations within any run) becomes the PRIMARY lens; segments stay secondary. Metric = PACE / SPEED — GAP-adjusted for hills, **NO efficiency/HR** (ruled 2026-07-07; same-effort is murky on a peak effort — control effort by reading the PR frontier instead). Two lenses: raw Pace + GAP pace. **Cross-sport, one engine per-sport metric:** run/swim = best pace at distance (run GAP'd); bike = best power at duration (no GAP — power is terrain-proof). Two of three hard bricks already exist (`calculateBestRunEfforts` finder + GAP physics; `calculatePowerCurve` + `w20`/CTL/ATL/TSB on the spine); the missing brick (spine aggregation/trend) mirrors the just-built `compute-core-verdict`. **Full spec: `docs/DESIGN-best-efforts.md`** (self-contained fresh-session hand-off). **§4 forks owed Michael's rulings BEFORE building** — metric (GAP+HR), per-sport distances/durations, window, source-of-truth, UI hierarchy, and **which sport first (rec: bike — cleanest/most-built)**. NOT started — build in a fresh session. Also banked: the three aerobic dimensions (peak output = best efforts; economy = efficiency/same-effort, already in State + segment; durability = decoupling, already State's run verdict); efficiency-as-its-own-trend is a candidate third lens but must pin to a fixed distance to control the heat/effort confound.

### Q-136 — coach reads `weekIntent` from `plan_contract_v1.phase_by_week`, which combined plans never write → Gate 2 is INERT for ALL multi-sport athletes (2026-07-07 FILED; 2026-07-08 DIAGNOSED — read-time fix owed)

> ✅ **CLOSED — FIXED BY D-261, the same day it was diagnosed. This header was never updated.**
> `coach/index.ts:652-665` — `weekIntentFromContract` now calls `resolvePlanPhaseDetailed(planConfig, weekIndex)`, and the comment at `:654` cites "(Q-136 Drop A)" by name. The three-path resolver (`phase_by_week` → `config.phases` → `config.phase_structure.phases`) is live. **Gate 2 is no longer inert.** Everything below is history. *(Back-annotated 2026-07-13.)*

**Symptom:** on the LIVE path `weekIntent` resolves to `'unknown'` even in WK1 of an active plan (receipt: user 45d122e7, `coach_cache.payload` → `week_intent = unknown`, `week.index = 1`). Consequence for D-259: **Gate 2** (build/baseline plan-phase tolerance that would read WK1 ACWR 1.40 as `on_target`) fires ONLY when `weekIntent ∈ {build, baseline}`, so it does nothing. This is fail-safe BY DESIGN (unknown keeps strict bands, never over-softens), and **Gate 1 alone still fixes the reported symptom** (false running-`'high'` → `'elevated'`) — but the "reads `optimal` in a build week" benefit is unrealized.

**ROOT CAUSE (Drop A, operative — diagnosed 2026-07-08, no code):** coach's `weekIntentFromContract` (`coach/index.ts:645`) reads phase ONLY from `planConfig.plan_contract_v1.phase_by_week[weekIndex-1]`. **`generate-combined-plan` never writes that array** — it writes the phase structure to **`config.phases`** instead (`generate-combined-plan/index.ts:614`, shape `[{ name, start_week, primary_goal_id, … }]`); its `plan_contract_v1` object (line 568) has no `phase_by_week`. `weekIndex` is fine (chip shows WK 1) — the field is simply absent, so `intent` stays `'unknown'`. Standalone `generate-run-plan` (`:590`) and `generate-triathlon-plan` (`:275`) DO write `phase_by_week`, so this gap is **specific to combined/multi-sport plans → Gate 2 is inert for EVERY multi-sport athlete, not just the primary user.**

**The data is resolvable read-time — proven:** `arc-context.ts:679` already handles exactly this ("D-039 Fix 3: fallback to `config.phases` when `plan_contract_v1.phase_by_week` is missing" — pick the last phase whose `start_week ≤ weekIndex`). The Arc resolves the phase correctly today; coach just never got the same fallback. **Fix direction (when greenlit — NOT yet):** port that fallback into `weekIntentFromContract` (~15 lines: last `start_week ≤ weekIndex` from `config.phases`, then the existing name→intent map at `:651-655`). **Read-time → fixes every existing combined plan instantly, no regeneration** (strictly better than making the generator emit `phase_by_week`, which would only help future plans). When landed, the existing D-259 `build` fixtures become the live path with no test change.

**Maturity/weight orthogonality (per the receipt's "learning — 5 sessions" on rides/swims):** the ride's `0.6` fatigue weight ("notable running impact") is a STATIC constant — it is not "in a learning phase." What's "learning" is the discipline *profile's* maturity (enough 28-day history for its OWN per-discipline ACWR to be trustworthy) — a separate axis. Neither Gate 1 (`runNotOverPlan`, reads only `runLoadPct`) nor Gate 2 (reads `weekIntent`/total ACWR/readiness/body signals) touches per-discipline maturity or the fatigue weights — **fully orthogonal.** Maturity interacts with exactly one OTHER reconciler branch, the cross-training→'high' escalation (`crossTrainingEstablished`, which excludes only `'building'`, so `'learning'` counts) — and that branch was **moot for this receipt** (gated off by `running_acwr 1.52 ≥ 1.1`). The composition-blindness of interest lives in the static weight (load-system extension), not the maturity flag. See [Drop B → Q-138] for the separate dead-stub column.

### Q-137 — `'rest now'` (ACWR > 1.5) is an unconditional PRESCRIPTION from a composition-blind subsystem, contradicting the reconciled classifier (2026-07-08, FILED — direction set, do NOT patch the gauge; expected closed by the intensity-binned load work)

> ✅ **CLOSED for the CLIENT surface by D-301 (2026-07-18).** The last live spot that rendered the raw-ratio prescription — `CoachWeekTab.SnapshotLoadBar`, which emitted `back off`/`rest now` off the bare ACWR — now reads the reconciled verdict (`statusVolumeLabel`): `elevated` → "a bit high", only corroborated `high` → "pull back". The dead `acwrVolumeLabel`/`acwrZone`/`getACWRStatus` copies were deleted. The gauge no longer prescribes anywhere a user sees. (The deeper server-side intensity-binned load work Q-137 anticipated is a separate, still-open track — this closed the client symptom, not that.) Everything below is history.

Observed live on user 45d122e7 (WK1, 2026-07-08): the raw gauge showed `ACWR 1.6 · spike · rest now` → "This week: **Load very high**", while the **reconciled classifier** (D-259) called the same week **`elevated`** — because the reconciler sees composition (cross-training-dominated), readiness (not fatigued), and body signals (handling well), and the gauge sees none of that. The gauge's `'rest now'` band (`acwrVolumeLabel`/`planAwareVolumeLabel`, ACWR > 1.5) is a **hard redline that is never softened** — `planAwareVolumeLabel` only softens the `'back off'` band (1.3–1.5), and only in a build week. So a low-impact cross-training week on a thin WK1 base reads "Load very high" as an unconditional prescription, over the head of the subsystem that actually understands the week.

**Direction (ruled 2026-07-08):** the **gauge shows the NUMBER + the band WORD only** (honest raw ACWR — the Option-b dual read stays); **prescription language comes ONLY from the reconciled classifier** (the one surface that sees composition + readiness + body signals). Do NOT extend the redline with its own composition/thin-base leniency (rejected — that builds composition-awareness twice). **Expected to be CLOSED by the load-system extension** (intensity-binned per-domain load feeding the reconciler as the sole verdict authority — doc owed by Michael, D-259 is the reconciler foundation it builds on). **Also note:** the thin-base WK1 inflation is partly self-resolving — as the chronic base accumulates past the early-block ramp, the same absolute week stops reading as a spike. Verification when the load-system work lands: this exact WK1 snapshot should read a non-redline prescription while the gauge still honestly prints the raw ratio.

### Q-138 — `compute-snapshot.plan_phase` is a dead stub: written `null`, never reassigned, and no live consumer reads it (2026-07-08, FILED — low-priority cleanup, decide populate-or-remove later)

> ✅ **CLOSED — the "populate-or-remove" decision was MADE and SHIPPED (D-261): populate.**
> `compute-snapshot/index.ts:557-562` — the comment reads "D-261 / Q-138: populate plan_phase from the single resolver (was a dead…)", and `planPhase = resolvePlanPhase(planRow?.config ?? null, planWeekNumber)`. Persisted at `:806`. **It is not a stub any more.** *(Back-annotated 2026-07-13.)*

Drop B from the Q-136 trace, logged separately because it's a distinct cleanup with its own lifecycle. `compute-snapshot/index.ts:539` declares `let planPhase: string | null = null` and persists it at `:783` (`plan_phase: planPhase`), but **it is never reassigned** — so `athlete_snapshot.plan_phase` is `null` on every row (matches the `09-db-schema.md` §4 audit finding). Critically, this is **NOT** the cause of Gate 2 being inert: coach does not read this column — it re-derives `weekIntent` live from the plan config (see [[Q-136]] Drop A). So Drop B has no current functional impact on the load-status path; it's a latent trap only for any future consumer that trusts the column. **Decision owed (later, low priority):** either populate it in `compute-snapshot` (mirror the arc-context `config.phases` resolution so the persisted column matches coach's live `weekIntent`) OR drop the column to remove the trap. No urgency; revisit alongside the Q-136 read-time fix so both phase-resolution paths use one shared resolver rather than diverging again.

### Q-139 — Strength-led blocks resolve a phase but route lossily through an endurance intent model; strength progression may need its own load tolerance (2026-07-08, FILED — two-problem seam, partially touched by Item 2)

Surfaced wiring D-261: the primary user's `Get stronger` (`strength_primary_v1`) plan resolves its phase correctly now (`Base`/`Power`/`Deload`/`Peak`/`Retest` via `config.phase_structure.phases`), but those names route through `phaseNameToWeekIntent`, which is endurance-shaped. **This is really TWO problems — flagging the seam so later work doesn't conflate them:**

1. **Phase NAME mapping (lossy).** `Base → baseline` and `Deload → recovery` are honest; but `Power`/`Peak`/`Retest` have no clean endurance analog. D-261 routes them to the `'unknown'` fail-safe default (strict bands) rather than inventing a mapping — safe, but it means a strength Power/Retest week gets no plan-phase leniency at all. Nothing yet addresses this beyond the fail-safe.

2. **Load TOLERANCE (borrowed, not modelled).** Even where the name maps (`Base → baseline`), Gate 2 hands strength blocks the **endurance build-band** tolerance (`build_optimal_max 1.5`). A heavy strength block should tolerate higher acute load without reading as overload, but there's no reason its tolerance curve equals endurance's — it's borrowed, not derived. This is the D-259 theme again (endurance-shaped reasoning applied to a non-endurance athlete). **Item 2 (intensity-binned per-domain load) touches this** — per-domain strength ratios become reconciler inputs — but does not fully close it: the *band* a strength block earns is still an open modelling question.

**Log only for now** — informs the load-system extension doc. Don't engineer a fake phase or a bespoke strength band before Item 2's per-domain inputs exist; revisit tolerance (problem 2) once they do, and problem 1 (naming) separately if strength plans grow phase names worth mapping.

**Addendum (2026-07-08, demonstrated live) — plan-type-blind adherence, a THIRD facet:** the active plan is `strength_primary_v1` — **4 strength / 3 runs**, and the plan's own description says "*This is a strength plan — you won't want to marathon-train on it.*" Yet the off-plan branch graded the skipped Monday run with **run-plan severity** ("get back on schedule") while the plan's **primary objective** (strength: 3 sessions, volume up, e1RM improving) was being fully executed. The adherence logic is phase-aware (post-D-261) but **plan-TYPE-blind**: a skipped run on `strength_primary_v1` is a different-severity event than a skipped run on a marathon build, and the system can't tell them apart. **Item 2/3's verdicts need plan-type as a FRAME, not just phase** — the plan's session ratio and primary discipline should set the *weight* of any adherence fact (a run miss on a strength plan is minor; on a run plan it's the point). This is a third facet of Q-139's root (endurance-shaped reasoning on a non-endurance athlete), alongside the phase-name mapping (facet 1) and the borrowed tolerance band (facet 2). **(Item 4 copy note for someday):** the honest banner for this exact week was *"aerobic load holding via bike/swim; run-specific load at zero for N days"* — facts about what's held and what's deferred, **no inferred rationale, no prescription**. D-262 removed the contradictory prescription; the plan-type frame is what would let the *fact itself* be weighted correctly. Root fix: Item 2/3.

### Q-140 — `load_status` is run-centric: a deliberate discipline substitution reads as BOTH overload and deficit — the false-*under* mirror of D-259's false-*over* (2026-07-08, FILED — interim guard D-262, root fix Item 2)

`load_status` is computed primarily from `run_only_week_load_pct` (running actual vs planned running). So when a hybrid/strength athlete deliberately swaps planned runs for cross-training (bike/swim), the SAME week reads as: (1) **overload** — the all-discipline gauge spikes (ACWR 1.58 · "rest now") because the cross-training load is real; and (2) **deficit** — `load_status = under` → "off plan, add more" because running is −100% vs plan. Two opposite verdicts from one week. This is the **exact mirror of D-259**: Gate 1 killed the false-*over* ("you're overloaded" from a swap); this is the false-*under* ("you're under-training" from the same swap). **Same root, opposite sign** — endurance/run-shaped reasoning applied to an athlete who substituted disciplines.

**Interim:** D-262 coherence guard stops the contradictory "add more" prescription (no add-more while ACWR high) — but that's a guard against the *symptom*, not the cause. **Root fix: Item 2 (intensity-binned per-domain load)** — when the reconciler sees "running behind plan BUT total/cross-training load carried," it produces ONE coherent verdict ("you swapped running for cross-training — running's behind, but you're carrying the load") instead of two opposite ones, and `load_status` stops being run-myopic. Closes when Item 2's per-domain ratios feed the reconciler.

### Q-141 — Entire cardio pipeline routes through Strava despite live Garmin OAuth: single-vendor dependency on the load system's input layer (2026-07-08, FILED — assess Garmin as primary/redundant)

The Item 2 HR audit (user 45d122e7) found ALL cardio — run/ride/swim, 35 sessions over 8 weeks — ingests via `source = 'strava'`, even though the app runs a live **Garmin OAuth** proxy (`npm run dev` port 8080). So the load system's entire input layer (HR, power, pace, time-series) depends on a **single vendor**. Risk: Strava API approval is still **pending** (applied Apr 2026), and Strava's ToS **constrains raw-data flow** (retention / redistribution limits). If Strava access lapses or tightens, the load system loses its substrate — right as Items 1–3 make that substrate load-bearing. **Assess Garmin as a primary or redundant source:** the OAuth already exists and `ingest-activity` already handles `provider = 'garmin'` (separate write path, lines ~810–1040), so the plumbing is partly there. Log only — not Item 2's scope, but it's the input layer every load-system item builds on, so it's a standing risk to the whole arc, not a feature gap.

### Q-142 — ACWR NUMBER is single-source, but the ratio→BAND-LABEL mapping is duplicated 3× (client + server), synced by a comment — a D-264 gap (2026-07-08, FILED — collapse to one server-minted band)

SSoT verification (D-264) on the LOAD/ACWR metric across screens: **the number is clean** — State (`StateTab`) and Home (`WorkoutCalendar → LoadBar`) both read `weekly_state_v1.load.acwr` from the shared coach payload; neither re-computes the ratio. Performance/readiness trends are likewise server-computed and read by both tabs. **But the ratio→band classification is re-implemented in ≥3 places** with the same `0.8/1.3/1.5` boundaries: `src/lib/load-headline.ts` (`build more/balanced/back off/rest now`), `src/components/ui/charts.tsx:228` (`Under-reached/Optimal/Overreaching/Danger` — usage unclear, possibly dead, but a latent duplicate), and server `_shared/acwr-state.ts` `getAcwrStatus` (plan-aware). They're kept aligned **by a hand-written comment** (`load-headline.ts:48`: "Boundaries MUST match…") — the exact drift risk D-264 forbids. Per THE LAW (D-260), the band/verdict is minted ONCE (server) and read; the client should consume a server-minted band label, not re-derive it. **Fix direction:** server emits the band word alongside `load.acwr` in the payload; client renders it; the two client mappings (`load-headline` band words, `charts.tsx` zone) collapse onto it (or are deleted if dead). Not Item 2 scope, but Item 2 (per-domain bands) must NOT add a 4th mapping — it emits its bands server-side from day one. Log + collapse.

### Q-143 — `hr_quality` is re-derived from full HR series on every coach call: compute once at ingest, store, consume (2026-07-08, FILED — D-264-consistent optimization)

D-263 bs3 wiring adds `sensor_data` (full HR time-series) to coach's 28-day rolling fetch (~35 sessions/call) so `computePerDomainLoad` → `assessHrQuality` can derive dropout% per session. That's **re-derivation per request** — the same series parsed on every coach load, for a value that never changes once the workout is ingested. **Direction (D-264):** compute `hr_quality` (or just `dropout_pct` + `valid_points`) ONCE at ingest / compute-facts, store it on the workout (or `workout_facts`), and have coach consume the stored value — then the heavy `sensor_data` column drops out of the coach fetch entirely. One canonical calculation, computed at write time, read cheaply. **Fine as-is for now** (correctness first; the cost is a per-call parse, not wrong output); log so the optimization isn't lost. Ties to Item 1 (TRIMP also wants clean per-session HR at ingest).

### Q-145 — The easy/hard binning SEAM (`CARDIO_HARD_EASY_IF` 0.80) clips genuinely-easy high-Z2 runs into `hard_cardio` — a threshold-PLACEMENT problem, not anchor calibration (2026-07-08 filed; 2026-07-09 CORRECTED by Michael)

**CORRECTION (2026-07-09) — the anchor is NOT wrong.** Baselines screen: **LTHR 151** (learned), **Max HR 174**. The primary user's easy runs at 135–138 bpm are **78–79% of LTHR 151 = high-Z2 aerobic on his own zones** (Z2 = 128–136). So LTHR-151 is correctly calibrated; the earlier "anchor miscalibrated" framing was wrong. **The real problem is the SEAM placement:** `inferIntensityFromPerformance` maps 138/151 = 0.91 → IF 0.88, and `CARDIO_HARD_EASY_IF = 0.80` calls IF ≥ 0.80 hard — so a genuinely-easy run living at the *top of Z2* crosses the easy/hard seam and lands in `hard_cardio`. A 138 bpm easy run sitting right on the 0.80 seam is the exhibit. **Fix direction (Item 2 follow-up):** raise/re-place the easy/hard seam so high-Z2 aerobic stays easy — the seam should sit at the aerobic|threshold boundary (~tempo, Z3), not clip the top of Z2. Consider anchoring the seam to the athlete's zone model (%LTHR or %maxHR) rather than the D-238 IF ladder's absolute 0.80. **Also note the anchor-confidence angle survives (see Q-146):** several anchors are thin/manual, and a downstream bin/verdict should carry that confidence — but that's provenance, distinct from this seam-placement bug. Live impact: `hard_cardio` acute 58 (his Sunday run) in the D-263 receipt; only 15% share so it didn't break attribution, but it's a wrong bin.

### Q-146 — Anchor-confidence provenance: several intensity anchors are thin/manual; Key-2 verdicts (Item 3) must carry the anchor's confidence — ship-low-earn-up applied to anchors (2026-07-09, FILED — design constraint for Item 3)

The intensity anchors that Key-2 (decoupling) and Item-2 binning normalise to are **not uniformly trustworthy** on the primary user's Training Baselines: run **threshold pace 10:05 "learned from 3 runs"** (thin), **swim CSS 2:30/100 entered MANUALLY** (unvalidated by data), **FTP 176 manual = auto** (agrees, higher confidence), **LTHR 151 learned** (Q-145: correctly placed). A decoupling verdict built on a thin anchor (e.g. run decoupling vs a 3-run threshold pace) is itself low-confidence, and **must say so** — a confident-looking Pa:Hr number resting on a shaky reference is the D-242 "score that lies" one level up. **Design constraint for Item 3:** every Key-2 verdict carries the confidence of the anchor(s) it used; a low-confidence anchor caps the verdict's confidence and widens/softens its band. Ship-low-earn-up, applied to anchors — an anchor earns higher confidence as observed data validates it. Provenance the Item-4 ⓘ surfaces ("this read leans on a swim pace you set by hand, not measured"). Related but distinct from Q-145 (seam placement) — this is about the anchor's *confidence*, not its *value*.

### Q-147 — Swim CSS anchor EXISTS (`swimPace100 = "2:30"`) — Item 2's "swim unanchored → always easy" (amendment 2) was based on a false premise; swim IS pace-classifiable (2026-07-09, FILED — Item 2 follow-up)

Correction to D-263 Item 2: the swim easy/hard binning was set to "always `easy_cardio`, `bin_signal: pace_unanchored`" on the belief that no swim threshold/CSS reference existed. **It does** — `performance_numbers.swimPace100 = "2:30"` (per-100), confirmed on the Training Baselines screen and in `09-db-schema.md §3`. So swims CAN classify hard/easy by pace against the 2:30 CSS, exactly like run→LTHR and ride→FTP. **Caveat (ties to Q-146):** the 2:30 CSS is **manually entered**, low-confidence — so a swim hard/easy bin off it should carry that anchor confidence, and (per Q-145's lesson) the swim easy/hard seam needs careful placement too. **Follow-up:** revisit the swim slice — replace the `pace_unanchored → always easy` fallback with CSS-based classification (2:30 anchor), gated on anchor confidence. Not urgent (swims were landing in `easy_cardio` anyway, which is usually right for his training), but the premise is now known-false and shouldn't calcify.

### Q-148 — Full readiness-model rework: apply the D-266 weighted doctrine at the SOURCE, de-collinear the decoupling family, and purge the residual ACWR/demoted nudges on the DESCRIBE band (2026-07-09, FILED — deferred by explicit scope call, NOT missed)

D-266 closed the **prescriptive** ('high' / "back off") leak completely — the two-key cap backstops every uncorroborated 'high'. It did so with two surgical edits (`absorption.ts` gate + `computeSafetyFloor`), deliberately NOT touching the readiness tree (`coach/index.ts:2668-2703`) or the response-model assessment (`_shared/response-model/weekly.ts:347-413`). Three known-and-deferred residuals live in those untouched surfaces:

1. **Collinear double-count in `signals_concerning`** (`weekly.ts:349-357`): the pool counts **HR drift AND cardiac efficiency as two independent signals when they're one decoupling phenomenon**. A single bad steady run can flip both → `concerning >= 2` → label `overreaching` → readiness `overreached`, with RPE flat. Post-D-266 this can no longer escalate the load *verdict* (the floor now requires `primaryDeclining`), but the readiness *label itself* still over-fires for its own display/copy. Fix: collapse the decoupling family to one signal, or weight it.
2. **The readiness tree escalates its own labels on single demoted signals and on ACWR** (`coach:2685` ACWR + one demoted → `fatigued`; `coach:2691` ACWR-ramping-fast ALONE → `fatigued`; `coach:2700` any one concerning → `fatigued`). D-266 severed these from load escalation at the floor, but the tree still *produces* the labels. The weighted doctrine should apply at the source so readiness itself is honest.
3. **DESCRIBE-band residual — the conscious scope call (write it down so the next audit sees it was chosen, not overlooked).** The two-key cap only touches 'high'; it does NOT cap 'elevated'. So `reconcileLoadStatus`'s internal ladder can still nudge the **descriptive 'elevated'** band from demoted signals and — the tension worth flagging against D-260's absolute "ACWR never escalates through *any* path" — from ACWR: `ACWR-ramping → readiness fatigued → raise('elevated')` (`load-status-reconcile.ts:191-194`) and total-ACWR → `raise('elevated')` directly (`:210-212`). This was **judged acceptable and deferred on 2026-07-09** because 'elevated' is by-design the honest describe band the cap falls back *to* (D-265), not a prescription — so the ACWR-nudge here is a describe-layer heads-up, not an escalation with teeth. It is recorded here explicitly so a future audit understands the describe-band ACWR influence is a **known scope boundary of D-266, not a missed leak**. If the absolute reading of D-260 is later preferred, purge ACWR/demoted `raise('elevated')` calls from the internal ladder as part of this rework.

**Also folds in the D-266 parked tuning call:** a lone declining RPE trend currently DESCRIBES but does not floor-escalate (conservative "one witness isn't agreement"); revisit whether it should solo-escalate once **universal per-session RPE** lands (the #1 sRPE-capture dependency) — with RPE captured on every session the primary leg is always available, which also removes the "goes quiet on strength-only weeks" cost D-266 accepts. **Big blast radius** (the readiness tree is inside the 5k-line `@ts-nocheck` coach file); deferred deliberately, not urgent.

### Q-149 — D-268 Phase 4: `generate-training-context` is still plan-blind (run-only), + the `arc-context` `discipline` re-derivation — deferred to a fresh session (2026-07-09, FILED — the remaining plan-awareness surface)

D-268 (plan-primary is a system invariant) shipped Phases 1-3 + 5 — the entire **visible State card** now reads the plan, not running. **Phase 4 is the one remaining surface and is deferred to a fresh session** (this one was long; Phase 4 is a big separate function and rushing it risks the race/goal logic). It is fully specified in `docs/DESIGN-D268-plan-aware-everywhere.md` §3 (surface #5) + §5 (Phase 4) + the handoff doc `docs/HANDOFF-2026-07-09-load-plan-awareness.md`.

**What's still run-blind (`generate-training-context/index.ts`):** recent-form + key-session-audit queries filter `type in (run,running)` (`:728`, `:830`, `:1438`); `next_key_session.sport` defaults `'run'` (`:1863`/`:1865`); gap-scan copy hardcodes "Add N more run session(s)" (`:1131`). NOT on the State card — it feeds the AI narrative, the arc, and goal-prediction. **Mitigated:** D-268 Phase 3 already pushes the plan-primary fact into the LLM narrative, so the biggest prose risk is covered; Phase 4 closes the next-action defaults + the run-only inputs. **Fix pattern:** import the shared `resolvePlanPrimary` (single source), default the next-action off `planPrimary` not `'run'`, make the recent-form inputs discipline-aware. Endurance/tri: zero regression.

**Also in scope (D-268 §7 cleanup):** `arc-context.ts:683` re-derives its own `discipline` (`config.discipline || config.sport || plan_type`) independently of `resolvePlanPrimary` — a second, divergent notion of "what discipline is this plan" (D-264 single-source concern). Collapse to one.

### Q-150 — Foundation-readiness: scale + security + ops hardening backlog (2026-07-10, FILED — umbrella; blockers B1/B4 gate a 2nd paying user)

A 3-way architecture audit found the domain logic + target pattern (run + `session_detail_v1`) solid, but the layer around them not commercial-ready. Full severity-ranked list + evidence: **`docs/FOUNDATION-READINESS.md`**. Pre-launch / one user → nothing on fire today; do NOT over-alarm. Tracked items:
- **BLOCKERS (before a 2nd paying account):** B1 — ~47 edge fns take `user_id` from the request body under service-role (~24 `verify_jwt=false`) → cross-user data exposure; the JWT-derived pattern exists (`save-location`) in only ~26 of ~90 fns. B4 — no error sink/monitoring; a broken user compute is invisible.
- **Scale (~1k users):** S1 coach_cache invalidation race (stale State ≤24h); S2 `useStateTrends` recomputes ~10 queries client-side (== the dumb-client cohesion fix, first mission); S3 ingest fan-out no queue/retry/DLQ; S4 getArcContext re-invoked 2–3×/workout; S5 `route_progress_metrics` index (verify).
- **Serious/cleanup:** B2 hardcoded anon key; B3 silent sync death + Strava token-rotation bug; B6 workload `??0` score-that-lies; B7 failure illegible to user; B8–B13 (rate-limit, Garmin token-in-URL, `weekly_workload` RLS, migrations dir, `backfill-facts` unguarded).
Cross-ref (already tracked): Q-105/Q-106 (strength fork), Q-141 (single-vendor), D-186/D-194 (dumb-client), D-140–143 (readiness dual-write), Q-054/Q-057 (route_progress data).

### Q-151 — Intentional exercise substitution is read as skip + unplanned (a "score-that-lies" + a customization gap) (2026-07-10, FILED — design not built; Michael wants first-class swap/customization)

**Repro (Michael, on device 2026-07-10):** he intentionally swapped the planned **3× Front Squat** (5 reps @ 65 lb, planned vol 975) for **5× Hip Thrust** (5 reps @ 95–110 lb, +1,700 vol). The workout detail shows Front Squat as **−975 lb red "skipped"** AND Hip Thrust as **+1,700 unplanned** — two contradictory stories for one deliberate choice. Lower-Body execution still reads 93% (the hip-thrust volume IS credited — banner: "Skipped Front Squat — counts in full"), but the red "skipped" reads as a failure at something he chose to replace. That is the score-that-lies in miniature (CANON §0 / D-242 class): a deliberate substitution presented as a miss + a bonus.

**Design position (three layers, in order):**
1. **Declared beats inferred (the customization path Michael wants).** A first-class "swap this exercise" action — pick a substitute (ideally pattern/muscle-matched suggestions). Once declared it is a **substitution**, not a skip: no red −975, volume counts, done. (Today's banner points to "Adjust on the State tab" but frames it as scaling weight, not swapping a movement.)
2. **Infer as a backup, labelled as a guess.** Same session + same strength focus (the `classifyStrengthFocus` the cards/coach already share) + a planned lift missing + an unplanned lift present → "looks like you swapped these," shown as a confirmable inference, never asserted (measured vs inferred never wear the same clothes, Law 2).
3. **Stimulus honesty (the differentiator — nobody ships it).** Tier the swap by quality: **like-for-like** (same movement pattern + primary muscle — e.g. DB bench for BB bench) flows into the same trend, no fuss; **different-pattern** (this case: front squat = squat pattern → hip thrust = hip-hinge/glute) is a real change — credit the volume in full, but say the truth: "your squat pattern got no work today, and your squat trend has no new data point." Protects D-270: the swap must NOT read as the squat *declining* — it simply wasn't trained.

**Field scan (2026-07-10):** Fitbod — tap "substitute," suggests same-**muscle-group** alternatives, the sub flows into the **same progression path** (continuity, but blurs specifics); RP Hypertrophy — free mid-cycle swap for equipment/injury, big filtered alternatives library ("maintaining training continuity"). The matching logic the field uses = **movement pattern (squat/hinge/push/pull) + primary muscle**; by that rule front squat→hip thrust is NOT a clean sub (squat vs hinge). None ship the stimulus-honesty layer — that's Efforts' opening.

**Cross-ref:** D-270 (per-lift trend — a swap must not fake a squat decline), `session_detail_v1` execution/adherence (`build.ts` — where "skipped" vs "substituted" is decided), `WORKORDER-deviation-reason.md`, TARGET-ARCHITECTURE steerable plans (recurring swap → plan edit), CANON §0 (score-that-lies) + Law 2 (declared vs inferred). Repro screenshots in this session.

### Q-152 — `resolveCurrentFtp` has no freshness guard: a stale confident learned FTP beats a FRESH typed value (2026-07-10, FILED — resolver gap surfaced during FTP fracture #2 cleanup)

`resolveCurrentFtp` (`src/lib/resolve-current-ftp.ts:62-82`) is learned-first: `learned (≥medium conf) > manual > learned-low`. Its ONLY guard is the confidence tier — **no freshness/recency check.** So if an athlete does an actual FTP test today and TYPES the new number, but the app holds an old medium/high `ride_ftp_estimated` from months ago, the resolver **ignores the fresh typed value** and every surface uses the stale learned one. A freshly *measured* number should beat a stale *estimated* one.

**Why it matters:** this is the FTP analogue of the strength "typed wins" honesty (D-231) — except FTP is learned-first, so the failure mode is inverted: instead of typed silently overriding learned, *stale learned silently overrides fresh typed*. Correct for any athlete requires the resolver to weigh **recency**, not just confidence. This is the "living baselines" nuance the north star calls for (TARGET-ARCHITECTURE §Living baselines: the resolver decides how much live leads, per anchor — freshness is part of that decision).

**Design owed:** add a freshness dimension to the resolver — e.g. a typed value entered/updated more recently than the learned estimate's `as_of` wins (or at least ties-break to typed); learned only leads when it's both confident AND not stale relative to the typed entry. Needs a `last_updated`/`as_of` on both the typed FTP and the learned estimate to compare. Verify with synthetic-athlete fixtures (user-agnostic), not one account.

**Cross-ref:** D-231 (strength typed-wins — the mirror), TARGET-ARCHITECTURE living baselines, TRUTH-MAP fracture #2 (the FTP convergence this surfaced during), `resolve-current-ftp.ts` + its 8 tests (freshness case not yet covered).

### Q-153 — Residual FTP display-label bypasses: normalizer + get-week still read typed FTP raw (2026-07-10, FILED — deferred, disproportionate to value)

FTP fracture #2 is closed for everything that computes a verdict or bakes a real watt target (analyzer, compute-facts, coach, Baselines, Athletic Record, materialize-plan, AllPlansInterface). Two **display-label** sites still read `performance_numbers.ftp` raw — deferred because the fix is disproportionate to the value (cosmetic, learned-FTP-only drift; the executed watts are already resolver-correct via materialize-plan):

- **`src/services/plans/normalizer.ts` (`normalizeStructuredSession`, ~:897/:934)** — labels %FTP→watts on structured-session previews. Its callers pass only `{ performanceNumbers: pn }` (`PlannedWorkoutSummary.tsx:229/323`), so routing through `resolveCurrentFtp` requires threading `learned_fitness` through the `Baselines` type + PlannedWorkoutSummary + its render callers (multi-hop plumbing) for a cosmetic label.
- **`supabase/functions/get-week/index.ts:436`** — raw-FTP transitional FALLBACK that fills `power_range` only for rows MISSING it; materialize-plan bakes `power_range` via the resolver, so this rarely fires. `get-week` is `@ts-nocheck` and the calendar authority (higher edit risk). Route through the resolver (get-week can fetch `learned_fitness`) when next touching that file.

**Impact if left:** a rider with a confident learned FTP that differs from typed could see a structured-session preview LABEL (or an un-baked calendar-row fallback) in typed-derived watts while the executed session uses learned-derived watts. Cosmetic; the real target is correct.

**Cross-ref:** TRUTH-MAP fracture #2, `resolveCurrentFtp` (8 tests), the closed sites (this session's FTP commits). Do these when the surrounding files are touched for another reason.

### Q-154 — Import dates a workout off the PROVIDER's local time, not the USER's — an activity can land on the adjacent local day (2026-07-10, REAL BUG, root-caused, NOT fixed)

**Symptom (user-confirmed, cost hours this session):** a ride that happened on the user's local **7/7** was filed on **7/8**. Not a display artifact — the stored `workouts.date` is wrong for where/when the user actually rode.

**Mechanism:** `ingest-activity` `extractStravaLocalDate` (`:29-46`) and `import-strava-history` (`:585`) derive the calendar day by splitting the date portion straight out of Strava's **`start_date_local`** — i.e., they **trust the provider's idea of the user's local time**. Strava computes `start_date_local` from the *activity's own timezone*; when that timezone disagrees with the user's home timezone (travel, stale Strava tz, or an activity started near local midnight in the provider's tz), the workout lands on the day next to the one the user expects. The `start_date` (UTC) fallback is even commented "may be off by a day."

**Compounding UX trap (also filed here):** delete-locally-and-reimport **silently does nothing** in this case — the workout's `strava_activity_id` still exists (under the "wrong" date), so `import-strava-history:761` skips it as already-present. The toast reads "No new activities to import (N skipped)" with **no error**. This is what made the ride look "lost."

**Fix direction (what the user asked for):** the client should send the user's **device timezone** (IANA id / offset) with the import; derive the day from UTC `start_date` in *that* timezone, not from the provider's `start_date_local`. **Decision to make first:** a genuinely-traveled activity would then file under the user's *home* day rather than the activity's local day — accept (user wants own-tz consistency) or special-case by whether the activity's tz is trusted. **Verify before building:** capture the ride's raw `start_date` vs `start_date_local` to byte-confirm the flip (not captured this session).

**Cross-ref:** the delete/reimport skip guard (`import-strava-history:761`); ENGINE-STATE "Known broken."

### Q-155 — `adapt-plan` may be largely non-functional — verify it does anything, then fix-or-remove (2026-07-10, FILED)

Michael flagged that `adapt-plan` "never really worked." It runs on ingest (`action=auto`, safe-as-no-op per CLAUDE.md), on client accept/dismiss, and on cron `auto_batch`. Open question: does it actually produce useful suggestions / progressions on real data, or is it effectively inert? Verify end-to-end, then decide fix-or-remove rather than let it ride along forever. **Note:** the B1 pass (D-271) changed only its *auth*, not its behavior — this is a separate feature-quality question. **GATED (Michael, 2026-07-10):** do NOT touch adapt-plan until the app does everything it currently promises with total continuity + every number trustworthy. It resurfaced by accident during the B1 sweep; it is not the mission.

### Q-156 — Per-domain load is NOT calibrated across disciplines (the composition bar exposes it) (2026-07-11, DESIGN GAP, filed)

The State composition bar (Ride/Strength/Run/Swim %, added 2026-07-09, `LoadBar.tsx:72-88` ← coach `daily_load_7d.by_type`) is the first surface to put cardio and strength load side-by-side as percentages — and they are **not on a common scale**. Cardio load = `(minutes/60) × IF² × 100` (`_shared/workload.ts:324`); strength load = `max(tonnage/10000, 0.1) × IF² × 100` (`workload.ts:189`). The `/10000` is a hand-picked constant, **never calibrated against `duration/60`** — so strength/swim shares swing with a formula constant, and a heavy lifting week can flip the whole bar. **Traced verdict:** RUN is *not* over-counted (a 45-min run is scored like the rides, slightly less per minute); the imbalance is strength/swim being uncalibrated-small in a given window. Presenting an uncalibrated cross-sport % as if exact is mildly a "score that lies". Real fix = the per-domain-load calibration (a design task; opens with an HR-data audit, not design — see `DESIGN-load-system-extension.md`). Not a bug to bandaid.

### Q-157 — Run efficiency chart label: a competing verdict the workout shouldn't stamp (MOOT 2026-07-11 — the sparkline is already dead)

**MOOT — verified by code trace 2026-07-11.** The competing sparkline can't render: the server hardcodes `trend: null` (`session-detail/build.ts:898`, the only assignment — the pace-at-HR classifier isn't emitted), and the client `TrendSparkline` that would color `pace_at_hr_direction` is **defined but never mounted** (removed when macro trends moved to State — `SessionNarrative.tsx:597-600`; zero `<TrendSparkline` JSX uses). What actually renders on the workout screen is `discipline_trend`, read straight from the cached spine (`state_trends_v1`) — the same source State reads. So there is no live competing verdict; the fracture this Q described was already retired. Optional cleanup: delete the dead `TrendSparkline` + the server `pace_at_hr_direction` plumbing so it can't be re-wired. No behavior change. Same disposition applies to Q-025's shipped sparkline (surface retired). Original text below.

State owns run aerobic-efficiency direction via `efficiency_index` trend (`state-trend/run.ts:86`, ±3%, staleness-gated, 30–70min duration filter). The run-detail **`SessionNarrative` sparkline** labels its own direction (green/red) via `pace_at_hr_direction` — a percentile classifier (`fact-packet/pace-at-hr-direction.ts`) with **no staleness gate**, which can contradict State. Note the session-detail contract *already documents* that this read should be "State's canonical `efficiency_index` metric… a per-session ZOOM-IN on State's number, **never a competing verdict**" (`session-detail/types.ts:447`) — the chart just doesn't honor its own rule. (The AI-*prose* aerobic-efficiency claim reads the weekly spine signal `run_easy_pace_at_hr_trend`, currently retired/null — so no prose fork.) **Fix (client change, needs a visual eyeball):** feed the sparkline State's verdict, or drop the competing improving/declining color and let State own it. Low-stakes tail; deferred so it lands clean, not rushed. *(Note: the earlier fork-sweep report mis-cited `session-detail/build.ts:38` here — that line is the route readout, a different feature.)*

### Q-158 — Run HR-drift "normal for X min" uses a phase/weather-BLIND band (RESOLVED + DEPLOYED 2026-07-11)

**RESOLVED — the phase-blind band is gone, and the whole drift/decoupling room got consolidated.** Shipped this session (commits `4b77bc84` Q-158 · `552e4de2` decoupling activation · `c4e69460` drift-band collapse · `dd575492` confound guard; each fixtured, all deployed `analyze-running-workout` + `workout-detail`):
- **Q-158 itself:** dropped the duration-only "normal for X min" verdict from `session-detail/build.ts`. The bpm "Heart rate" line is now measured description + own-baseline comparison only; the phase/weather-aware verdict is owned by the analyzer's read.
- **Decoupling % surfaced as the single durability verdict** (TrainingPeaks Pa:Hr standard, <5% good): the Performance "Aerobic decoupling" row leads when a GAP-basis % exists, and suppresses the bpm line so there's one HR read, not two. It was dormant (efficiency.ts dropped `basis`; buildSummary dropped basis+assessment) — now wired single-source.
- **Two expected-drift bands collapsed into one** (the science: judge drift against conditions, one number, TrainingPeaks/Garmin). `interpretation.ts` now reads drift.ts's terrain-adjusted, phase/weather-aware `assessment` instead of recomputing a raw-drift band; `getExpectedDrift`/`assessDriftBand` deleted. Also deleted a dead 1,343-line `analysis/heart-rate-drift.ts`.
- **Confound guard** (Q-055's existing-line concern): the "higher than your typical" bpm verdict is suppressed on hot/hilly runs (names the confound, not a fitness change).
- **Empty-half-window guard** in drift.ts so a dropped-sensor half can't print a garbage drift number.

Original text below.

The workout Details HR-drift row (`session-detail/build.ts:1531`) states "normal for X min" from RAW duration bands `{8,12,15,20}` with no phase/weather adjustment, while the AI-insights drift read uses the phase/weather-AWARE band (`analyze-running-workout/lib/heart-rate/interpretation.ts` `getExpectedDrift(dur, conditionsSeverity)` + `assessDriftBand`). They diverge only on build/peak/taper/hot runs → the "normal for X min" clause disappears while the AI says "within expected range". Workout-internal, LATENT/edge, not on State. **Fix (server-side, small):** drop the phase-blind "normal for X min" verdict and let the phase-aware read own "is this normal" (or thread the adjusted range into the detail contract). Deferred with Q-157.

### Q-159 — Strength design: exercise-substitution recognition + does prescribed RIR progress down a block (2026-07-11, DESIGN, filed — ground in top apps)

Two related strength-design questions Michael raised (parked, NOT continuity): **(a) Substitution** — he swapped front barbell squats for hip thrusts intentionally; A) does the app recognize the movements, B) can it read a swap as a legit substitution and NOT dock the session, C) eventually swap it in the plan itself. Industry-standard (RP / Fitbod / Boostcamp track by movement pattern / muscle group and never penalize a swap) — a real feature (needs an exercise DB + movement-pattern map). **(b) Prescribed-RIR progression** — the logger greys out a suggested RIR; should it DECREASE as load climbs across a block? YES per RP (a mesocycle runs 3–4 RIR → 0–1 RIR over a 4–6wk wave, then deload) — verify our plan actually progresses it; if the target is static, the RIR verdict (D-272) is judging against a wrong reference. Frame: Performance = receipt, State = e1RM trend (Hevy/Strong Epley); ground any build in RP/Hevy/Strong. User-agnostic — never tune to Michael.

### Q-160 — Cleanup cluster: small honesty/hygiene items filed 2026-07-10/11 (filed)

Low-severity, noticed-and-deferred: **(1)** tri athlete missing bodyweight → nudge "add your weight for a bike-limiter read" instead of the honest-but-blank 'none' (D-272 limiter follow-up). **(2)** `DEFAULT_SWIM_PER100_SEC = 120` (`services/plans/normalizer.ts:49`) feeds a swim's *displayed planned duration* with no "~/est" tag when no swim baseline (the same file already suppresses the analogous strength placeholder — inconsistent with its own bar). **(3)** `run_easy_pace_at_hr` is retired/null but one reader still consumes `run_facts.pace_at_easy_hr` (`recompute-athlete-memory/index.ts:372,389`) — D-239's dead read-path isn't fully dead. **(4)** `athlete_snapshot.workload_total` carries no measured/estimated provenance stamp (`compute-snapshot:759`) — LATENT (never rendered as a measured number; only feeds LLM coaching prose alongside ACWR). **(5)** 3 stale cycling trend tests in `cycling-v1/ai-summary.test.ts` were already red before this session (they test the removed `npTrend`-fallback trend API) — update to the current spine-verdict API or delete.

## Q-161 — Run decoupling bands overreach Friel + State (5/10%) vs coach-prompt (3/5/8%) may disagree (SCIENCE, 2026-07-11)

- **Status:** RESOLVED 2026-07-12 (D-276). Research pass confirmed the 5% line is the only authored/platform/literature-backed cutoff; collapsed `frielBand` to two states (`sound` <5% / `needs_work` ≥5%) across State + coach + workout card, dropped the `<0 excellent` + `>10 gap` convention tiers, added a State "i" explainer. The "two band sets" fear was already-inert doc-drift (the analyzer wrapped the same frielBand). Ideal future refinement noted in D-277: a Variability-Index gate for steadiness. LLM prose owes a ≥3-recompute eyeball.
- *(original)* filed 2026-07-11 (audit-surfaced) · science-band sign-off owed · not a lie for Michael, a rigor gap.
- **The finding (science audit):** the run card's core verdict — decoupling bands — is the **least science-defensible** read of run/bike. `frielBand` (`run.ts:110-114`) uses `<5% strong / 5–10 base / >10 gap`, but Friel/TrainingPeaks publish essentially a **single ~5% cutoff**; the 5–10 vs >10 tiers are app convention, not published science (`run.ts` already self-flags PROVISIONAL). Separately, the coach's LLM *prompt* (D-036) describes decoupling as `excellent<3 / good<5 / mod<8 / high≥8` — a **different band set for the same metric**. Verify whether that's just prompt-wording (harmless) or two numbers reaching the user; if the latter, reconcile to one cited set. Also hand-picked: efficiency ±3% improve/slide (`run.ts:91`, `bike-fitness.ts:76`), run efficiency duration band 30–70min. **Bike is BETTER grounded** (Coggan 90%/75% FTP zone boundaries + Coggan TSS are real). **Fix:** a science sign-off pass on the run bands — either cite the 5/10 tiers or collapse toward Friel's 5% + label the rest as convention. Grounded in commercial-app + science ([[feedback_apps_science_default]]).

## Q-162 — Overall fitness rollup is un-weighted — inherits fragile/provisional inputs (STABILITY, 2026-07-11)

- **Status:** RESOLVED 2026-07-12 (D-276). `rollupFitness` (supersedes `rollupFitnessDirection`): the confident `fitness_direction` is decided by SOLID verdicts only — a provisional/thin discipline can't assert it — and any held-out thin mover is named (`thinHeldOut`) so the narrative flags the data gap instead of silently reading 'stable'. coach v83. `rollup-fitness.test.ts` 9/0.
- *(original)* filed 2026-07-11 (audit-surfaced) · robustness gap (user-agnostic), not a live Michael lie · rollup is architecturally single-source (one compute site, `assemble.ts:319` → coach), just quality-fragile.
- **The finding (stability audit):** `rollupFitnessDirection` OR-combines the 4 discipline verdicts into improving/holding/sliding/mixed but **ignores the per-discipline `provisional` flag** — so a fragile input (bike power resting on a stale effort) or a Q-038-clouded swim verdict counts FULLY toward the composite "your fitness is improving." For an athlete with corrupt swims (FORM→Strava, not Michael) a bad swim verdict leaks into the headline. `needs_data` is already ignored; provisional is not. **Fix:** make the rollup respect provisional (down-weight or mark the composite provisional when a leading input is provisional), so the composite is only as confident as its inputs. Cross-ref Q-038 (swim), the bike-power effort-presence fragility.

## Q-163 — `⟨diag⟩` diagnostic string leaks into the user-facing workout INSIGHTS narrative (POLISH, 2026-07-11)

- **Status:** RESOLVED 2026-07-12 (D-276). The glass-box carryover diagnostic in `analyze-cycling-workout` was appending `⟨diag⟩ …` onto `ai_summary`; redirected to `console.log` (grep confirms no `⟨diag⟩`→ai_summary path remains).
- *(original)* filed 2026-07-11 (spotted on a bike ride, survives recompute → structural) · small clean fix.
- **The finding:** the workout Performance INSIGHTS prose ends with a raw internal diagnostic, e.g. *"⟨diag⟩ carryover silent — no lift in window (last leg session 7d ago) · no carried-in soreness"* — the cross-domain carryover reasoning (`analyze-*-workout` carryover axis) bleeding into the athlete-facing narrative. It persists across recomputes so it's not a transient glitch. **Fix:** strip/gate the `⟨diag⟩`-tagged text out of the rendered narrative (keep it as a log/debug field if wanted), so users never see it. Not a lie, cosmetic, low-effort.

## Q-164 — Dead "Aerobic fitness" BODY signal + a Variability-Index steadiness gate (CLEANUP / REFINEMENT, 2026-07-12)

- **Status:** filed 2026-07-12 (noticed while auditing BODY / the fartlek fix) · deferred, both low-stakes.
- **Dead row:** `computeVisibleSignals` (`weekly.ts`) builds an "Aerobic fitness" endurance signal from `endurance.cardiac_efficiency`, but `cardiac_efficiency_current` is **hardcoded null** in the coach (coach:2125/2139) → the signal is always `insufficient` and never renders. Dead code; either wire cardiac_efficiency for real or delete the row (Q-108 retire-dead-layers class).
- **VI refinement:** D-277 raised the mixed-effort CV gate 8%→13% on raw/GAP pace, but the field-standard steadiness metric is **Variability Index** (NGP÷avg pace, ~30s-rolling, 4th-power → grade-adjusted + GPS-jitter-resistant; steady ≈ ≤1.05). Raw-pace CV and VI are not interchangeable. If a decoupling-steadiness gate ever needs to be tighter/cleaner, build VI rather than tune the CV number. Grounded in the 2026-07-12 research pass ([[feedback_apps_science_default]]).

## Q-165 — LLM prose ≥3-recompute eyeball owed (VERIFICATION, 2026-07-12)

- **Status:** filed 2026-07-12 · verification owed, not a code gap.
- **The finding:** the 2026-07-12 batch changed stochastic LLM prose in two places — the workout-card decoupling phrasing (D-276, `ai-summary.ts`/`interpretation.ts` → "aerobic base sound / needs work") and the run analyzer's honest-type/fartlek framing (D-277). Per the standing rule ([[feedback_llm_generator_n_recomputes]]) these need ≥3 back-to-back clean recomputes on a real run before being logged as verified. The deterministic spine is fixtured; only the courtesy narration is unverified. Recompute a recent steady run + eyeball.

## Q-166 — Load verdict under-reads a real TOTAL-load elevation when the spike is cross-training-heavy (ENGINE, 2026-07-12)

- **⚠ STATUS 2026-07-12 (later) — ATTEMPTED, SHIPPED, REVERTED (D-281). The observation may stand; THE FIX DIRECTION BELOW IS UNLAWFUL. Read D-281 before touching this.**
  - The fix as written ("productive 1.3–1.5 / elevated-absorbed >1.5 / strain → high") was implemented literally as an ACWR-driven `raise()` in the reconciler. It produced a **false "pull back" on a live WK-1 card** while every body row said the athlete was fine, and it violates: **D-266** ("ACWR never escalates through any path"), **Item 3's Rule** ("Load-high + body-fine → `elevated` max, descriptive copy only"), **Q-137** (already filed: "'rest now' (ACWR > 1.5) is an unconditional PRESCRIPTION from a composition-blind subsystem" — *"do NOT patch the gauge"*), and the load system's founding posture (*"strip its authority to prescribe"*). Reverted in `b0d33ceb`.
  - **The only lawful instrument** for "a real elevation shouldn't read 'balanced'" is the **descriptive relabel** — `'productive'` (D-280): rank-1, applied outside the escalation ladder, structurally incapable of prescribing. **The ratio may not `raise()`.**
  - **The evidence is still not in.** This entry was filed on ONE screen, ONE week — and that week was a **plan transition (WK 1)**, where the app declares its own ratio contaminated (7d = the new plan, 28d = half the old cycle). So the 1.64 it was filed on may itself be a transition artifact. It also fenced itself ("do with multi-athlete fixtures, NOT tuned to one week") — and the fixtures written for D-281 *were* synthetic and multi-athlete, yet **none was in a plan transition**, so none caught the failure. A screenshot did.
  - **What is NOT in dispute:** the athlete's chronic base IS real (the coach nulls the ACWR below a 500-pt chronic base; the card renders 1.6, so it clears the floor). D-280's bullet 3 ("thin cross-training base") is **stale** — superseded by its own v89 refinement. Corrected in D-281.
  - **Before anyone calls this a bug again:** get a real receipt — an athlete OUT of the plan-transition window, on an established base, whose total elevation reads "balanced". Not a screenshot; a query.
- *(original)* **Status:** filed 2026-07-12 · reconciler-core slice, deferred (do with multi-athlete fixtures, NOT tuned to one week).
- **The finding:** the LOAD section is a TOTAL 7d-vs-28d load ratio (all disciplines; needs no runs). For an athlete whose acute spike is cross-training-heavy but whose TOTAL chronic base is established, the reconciler's per-discipline escalation (running_acwr gate + cross-training-maturity) leaves a genuine total-load elevation at 'on_target' → reads flat "**balanced**", when it should surface as **'elevated'/'productive'** (the D-280 states). Verified: the athlete's ACWR 1.64 sits on months of real load across every discipline (ride 141/76/339/218/305…, run+swim+strength steady), body absorbing — yet reads "balanced". The D-280 'productive' relabel only fires when status already reached elevated/high, so a spike parked at on_target never gets it.
- **Fix (general):** the load verdict should reflect what the TOTAL-load ACWR band earns on a REAL base (Gabbett/COROS), gated by absorption (→ productive 1.3–1.5 / elevated-absorbed >1.5) and strain (→ high), independent of the per-discipline attribution dance. Reconciler-core (THE LAW) — build with synthetic-athlete fixtures across compositions/plans, never Michael's numbers ([[feedback_user_agnostic_design]]). Note the >1.5 vs 1.3–1.5 band nuance (COROS: 1.0–1.49 "optimized/productive", >1.5 "excessive" — even absorbed, >1.5 may warrant 'elevated · handling it' not green 'productive').
- **Also owed:** clearer wording than "provisional" for the thin-base flag (Whoop "building baseline" / Garmin "needs more data" — candidate "building base"), and whether to swap the vague "prov" tag app-wide (swim/run) to one consistent voice. Cross-ref D-280.

## Q-167 — The strong-evidence leg (RPE) is a WITHIN-WEEK ORDERING artifact, and it appears in zero docs (ENGINE, 2026-07-12)

- **Status:** filed 2026-07-12, surfaced by the D-281 post-mortem. **Not fixed — do not swing at it without a receipt.** This is D-265/D-266 machinery; Q-121 is a standing warning that a prior session already misdiagnosed an RPE read once (*"there is NO readiness-RPE bug… a query-side MISDIAGNOSIS"*).
- **The finding.** `effort_perception = makeTrend(allActual, s => s.rpe, 'lower')` (`body-response.ts:369`). `makeTrend` (`:293-315`) takes **this week's sessions**, splits them **in order** into first half / second half, compares the averages, and trips at a **5% threshold** (~0.2 RPE points). So an athlete whose hard days land later in the week reads `'declining'` — i.e. **strained** — every week. That is the *plan's shape*, not fatigue.
- **Why it matters.** `effort_perception` is the **strong-evidence leg**: D-266 requires it for EVERY escalation (`computeSafetyFloor` needs `primaryDeclining`; `absorption.ts` needs `effort.elevated`). Nothing escalates without it. So a scheduling artifact sits underneath the only signal licensed to prescribe. It also **contradicts the BODY row the user reads**, which compares the week's mean RPE to the 28-day typical (a *baseline-relative* question) and correctly said "about as hard as usual — 3.9 vs 4.3 typical" on the same card that said "pull back".
- **Compounding:** the cold-start HR-drift corroborator threshold is **8 bpm** (`absorption.ts:42`) while the primary athlete's benign drift is **11 bpm** — D-265 chose 8/14 so 11 would never *solo*-escalate; it doesn't solo, it **corroborates, permanently**. Combined with the above, `corroborated_strain` is chronically true for this athlete. It was harmless only because load could not reach `'high'` on its own (see D-281 for what happened when it could).
- **Zero doc coverage.** `makeTrend` and `effort_perception` appear **0 times** across every doc. The code knows; the institutional memory does not. That gap is the actual filing here.
- **Do NOT assume it's broken.** The trend may be intentionally within-week ("is this week ramping"). Nobody has written down which question it is meant to answer. **Establish the intent first**, then decide whether it should be baseline-relative (matching the BODY row) or stay as-is. Cross-ref Q-148 (universal per-session RPE — the named, unlanded dependency), D-265, D-266, D-281.

## Q-168 — Load-verdict audit leftovers: three hand-rolled ACWRs, a post-reconcile override, a headline with no 'productive' branch (AUDIT, 2026-07-12)

- **Status:** filed 2026-07-12 from the D-281 post-mortem audit. All PRE-EXISTING (none introduced by D-281, all survive its revert). None verified as user-visible harm. **Filed, not fixed.**
- **(a) The TOTAL ACWR is hand-rolled 3× inside `coach/index.ts` and never routes through the shared `_shared/acwr.ts` authority** — a D-264 violation ("a metric with two implementations has two truths"):
  - `:2366` `acwrEarly` — **no thin-base floor** — feeds `computeWeeklyResponse`, so `response_model.load.acwr_status` can band an inflated ratio.
  - `:2650` `rawAcwr`/`acwr` — same formula **plus** the `CHRONIC_LOAD_FLOOR = 500` null-out. This is the one the reconciler and the LoadBar see.
  - `:2024` per-discipline `discAcwr` — hand-rolled, no floor.
  - (`runningAcwr`/`cyclingAcwr` and the per-domain slices DO go through `computeAcwr`. The total does not.) Cross-ref Q-142 (the ratio→band mapping duplicated 3× on the client — same class).
- **(b) `load_status` is mutated a SECOND time after the reconciler** (`coach/index.ts:3814-3828`): the `earlyRunAdherenceArtifact` branch overwrites `status: 'on_target'` and rewrites `interpretation`. That is a write to the verdict *after* THE LAW (D-260) has spoken — and it is coupled to LLM availability (`earlyRunAdherenceArtifact` is only ever set inside the `if (anthropicKey)` block). Verify whether this is intentional before touching it.
- **(c) The State headline has no `'productive'` branch.** `statusVolumeLabel('productive')` returns `'productive'` (`load-headline.ts:28`), but `stateSlot` (`:63-71`) has no case for it → on a `productive` week `buildLoadHeadline` **silently drops the load slot** from the headline. The LoadBar shows "productive"; the headline above it shows no load at all. Reachable today via D-280's relabel (it does not need D-281).

## Q-169 — The run-pace reconciler EXISTS, is excellent, and has NEVER RUN: both its inputs are null (STARVED, 2026-07-12)

> ✅ **BOTH ROOT CAUSES ARE FIXED (D-282 / D-284). WHAT REMAINS IS A HISTORY BACKFILL, NOT A CODE FIX.**
> - **Root cause A — the dead field path.** `compute-facts` read `learned_fitness.running.threshold_hr`, a nested path that **has never existed**. Fixed: `compute-facts/index.ts:1041` documents the dead lookup; `facts.pace_at_easy_hr` is now written at `:1081` with anchor + confidence at `:1084`.
> - **Root cause B — the easy gate that excluded every run.** `learn-fitness-profile`'s `hr <= maxHR * 0.75` qualified **0 of 22** runs. Fixed: it now imports `resolveRunEasyHrBand` / `isEasyHr` from `_shared/easy-hr.ts` (`:38`, used `:640-660`). Proven: **0/22 → 5/22 qualify**, learns 11:08/mi high-confidence, all 5 RPE-3.
> - The observed-side null-write is gone: `compute-snapshot:786` now writes `run_easy_pace_at_hr` for real (D-239's forced null is dead).
>
> ⚠️ **STILL OWED: a recompute/backfill.** History was computed on the old rules, and zone bins are stored per workout. Mechanism: `scripts/verify-d284-backfill.mjs` — **deterministic chain only, NEVER the analyzer** (it regenerates LLM narratives).
>
> ⚠️ **AND THE ENGINE IS STILL CONDITIONALLY STARVED**, for a different reason: `learn-fitness-profile` runs from `ingest-activity` for **Garmin only**, milestone-gated (`:1685-1705`). A HealthKit athlete never learns from ingest at all.
>
> **Everything below is the original diagnosis — accurate as history, false as present tense.** CLAUDE.md, ENGINE-STATE and START-HERE all quote this entry as the canonical "starved engine" example; that framing is still pedagogically right, but **the specific bug is fixed.** *(Back-annotated 2026-07-13.)*

- **Status:** filed 2026-07-12. **The archetype of this codebase's dominant failure mode: a built, spec'd, fixtured system starved of its inputs.** It looks missing. It is not missing. It is hungry.
- **What exists (do NOT rebuild it — a session already did, same function name):**
  - `resolveRunEasyPace(baseline, observed)` — `generate-combined-plan/science.ts:110`. D-033, spec `docs/PHASE-1-RUN-PACE-SPEC.md`, **9 pin tests** (`run-pace-feedback.test.ts`).
  - It reconciles the athlete's BASELINE easy pace against their OBSERVED weekly paces and decides whether they have genuinely slowed: `baseline` / `reconciled_worse` / `reconciled_better` / `observed_no_baseline` / `baseline_acwr_gated`.
  - It is **well-built**: a 2-week streak gate AND a 4-week median gate must BOTH cross before the plan is displaced, plus an **ACWR gate** (>1.3) so an elevated-workload slowdown is attributed to fatigue, not fitness decline. This is exactly the "notice the athlete detrained" machine.
- **Why it has never fired — BOTH inputs are null (verified on real data, user 45d122e7, 2026-07-12):**
  1. **Baseline side:** `learned_fitness.run_easy_pace_sec_per_km` = **null**. `learn-fitness-profile/index.ts:699-712` qualifies an easy run as `avg_hr <= observedMaxHR * 0.75`. Observed max 174 → gate 130.5 bpm. His genuine easy runs (RPE 2-3) are 133-141 bpm (76-81% of max). **0 of 77 runs pass. 16 fail on the HR line alone.** It needs 3. It can never get 3.
  2. **Observed side:** `athlete_snapshot.run_easy_pace_at_hr` = **null on all 8 weeks queried**. The reconciler needs ≥3. It gets 0. (Cross-ref: `longitudinal-signals.ts:48` retired `run_easy_pace_at_hr_trend` under D-239 precisely because it was "fed by the null pace_at_easy_HR" — the TREND was retired; **the underlying null was never fixed**.)
- **Why the bike works and the run doesn't (the physiology, not the code):** the bike easy-HR learner uses a **65-75% band** and finds 6 rides (bike easy HR 130 = 74% of bike max 175). Running HR sits **5-10 bpm higher than cycling at the same perceived effort** (upright, more active muscle mass, weight-bearing), so his run easy HR is ~135 = **78%** of run max. **The same %max gate works for the bike and locks the run out.** FTP, swim pace, run *threshold* pace, max HR — all learn fine. **Run-easy is the only starved fact.**
- **What the field does (researched + adversarially verified 2026-07-12 — see `DESIGN-run-easy-pace-truth.md` §2/§9):** no shipped app uses an HR **ceiling** to qualify an easy run (COROS, the only vendor publishing gates, uses an intensity **FLOOR**); where schemes express aerobic in %max the ceiling is **80%, not 75%** (MyProCoach, Garmin); Friel — whose zones TrainingPeaks defaults to — says verbatim *"Do not use 220 minus your age... as likely to be wrong as right"* and anchors to **LTHR**, which this app **already has** (151) and **already renders** ("Friel %LTHR" on the Baselines screen). COROS documents this exact starvation bug (a wrong Max HR makes the gate unreachable so metrics never arrive) and tells users to fix the anchor manually — Efforts has **no escape hatch**.
- **The job is to FEED the engine, not replace it. BOTH root causes are now found (2026-07-12) and BOTH are plumbing, not builds:**

  **ROOT CAUSE A — the OBSERVED side: a dead field path in `compute-facts`.** `compute-facts/index.ts:1039`:
  ```ts
  const thresholdHR = baselines?.learned_fitness?.running?.threshold_hr        // ← DOES NOT EXIST
    ?? baselines?.performance_numbers?.threshold_heart_rate;                   // ← also absent
  if (thresholdHR && w.sensor_data?.samples) { /* writes facts.pace_at_easy_hr */ }
  ```
  `learned_fitness` has **no `running` key**. The real key is **`run_threshold_hr.value`** (= 151), top level. So `thresholdHR` is `undefined`, the block **never executes**, and `pace_at_easy_hr` is never written.
  **Receipt (real data):** of 370 `workout_facts` rows, 147 have `run_facts`; **`pace_at_easy_hr` is set on 0 of them.** `efficiency_index` — computed in the *very next block from the same `sensor_data.samples`* — is set on **146**. So the sensor data is present and fine. **It is purely the field path.**
  **The chain it starves:** `compute-facts.pace_at_easy_hr` (null) → `compute-snapshot.runEasyPaceAtHR = avg(nothing)` (null) → **D-239** sees the null and *deliberately* writes `run_easy_pace_at_hr: null` ("persist null so no garbage reaches the Arc", `compute-snapshot:769-775`) → the D-033 reconciler's observed side is starved. **D-239 was CORRECT — it stopped persisting garbage. It treated the symptom; nobody went one level up to ask why the input was null.** Fixing the path makes D-239's null-write unnecessary (`compute-snapshot:774` un-nulls with it).

  **ROOT CAUSE B — the BASELINE side: the easy-run HR *ceiling* in `learn-fitness-profile`.** `learn-fitness-profile/index.ts:699-712` qualifies an easy run at `avg_hr <= observedMaxHR * 0.75` → 130.5 bpm. The athlete's genuine easy runs (RPE 2-3) are 133-141 bpm. **0 of 77 pass; 16 fail on the HR line alone.** Needs 3. Can never get 3.

- **⚠ TWO THRESHOLD RULINGS ARE OWED (Michael) — do NOT pick these unilaterally. Both are the same family, both must be decided off the FIELD + the SCIENCE, never off the primary user's numbers ([[feedback_user_agnostic_design]] — he is the builder AND the guinea pig; his baselines are a construction site):**
  1. **The learner's easy-run qualification band** (Root Cause B). Proposal: anchor on **LTHR** (which the app already has and already renders as "Friel %LTHR"), Friel run Z2 ceiling **≤89% LTHR** + a floor (~70% LTHR) to exclude walks. Field says: no shipped app uses an HR *ceiling* (COROS uses a **floor**); where %max is used the aerobic ceiling is **80%, not 75%**. Honest consequence: his 133-136 bpm runs start counting; his **141 bpm runs correctly still do not** (genuinely Z3).
  2. **The per-sample "easy HR" gate inside `compute-facts`** (Root Cause A). It is `heartRate <= thresholdHR * 0.78` → **118 bpm** for this athlete, whose easy runs average 135. Fixing the field path alone would therefore capture **only warm-up samples** and report a misleadingly slow "pace at easy HR" — i.e. **replace no-data with wrong-data.** Friel Z2 is **85-89% of LTHR (128-134 bpm)**, not 78%. This threshold must move with ruling 1 or the fix is worse than the bug.

- **Where this is GOING (Michael, 2026-07-12) — the destination, not this slice:** a **plan REMATERIALIZER**. The plan pin is *correct* (targets must not shift under the athlete mid-week — START-HERE: "chasing a live value into a pinned target is the one wrong turn to avoid"). The honest answer to "it won't re-map" is therefore **not** live pins — it is an explicit action: *"your easy pace has drifted 11:30 → 12:10. Rebuild the rest of the plan?"* The athlete pulls the trigger; the plan rebuilds from that week; they can pull back or dial up. **D-033's reconciler — with its streak gates and its ACWR gate so a fatigued week is not mistaken for real fitness decline — IS the rematerializer's brain.** It is already built. It is already starving. Sequence: (1) feed the engine [this slice], (2) the engine notices the drift [already built], (3) the rematerializer acts on it [the heavy lift, later]. **Do not build (3) before (1).**
- **⚠ The false start, recorded so it isn't repeated:** on 2026-07-12 a session wrote `_shared/run-pace.ts` — a SIXTH pace-resolution chain, **with the same function name as the shipped one** — before finding `science.ts:110`. Deleted. The banner now at the top of CLAUDE.md / START-HERE / ENGINE-STATE exists because of this.
- **Also true, and separate (still open):** four different stored "easy pace" values disagree for one athlete — manual `performance_numbers.easyPace` = **11:30/mi** (the field the UI shows, labelled "Easy pace (manual)"), `effort_paces.base` = **11:08/mi** (what `materialize-plan` and `analyze-running-workout` actually USE — the manual entry is LAST in their chain and never wins), a **10:00/mi** literal in `strength-primary-plan`, a **540** literal in `token-parser`. He actually runs **12:11/mi**. Whether `effort_paces` should survive at all is an open ruling. Full consumer trace (20 sites, file:line): `docs/DESIGN-run-easy-pace-truth.md` §4.

## Q-170 — The heat gate: D-275's exclusion is NOT field-standard, and its cost is a blind trend. The fix is an ADJUSTMENT, not a filter. (ENGINE, 2026-07-13)

- **Status: RESOLVED 2026-07-13 (D-283) — but NOT the way this entry predicted. Read the resolution before the body below.**
- **✅ THE EXCLUSION IS DEAD.** Hot runs are KEPT in the durability substrate (and in the coach's 7d receipt). This entry was RIGHT that no shipped app deletes a session for heat.
- **❌ THE FIX WAS NOT AN ADJUSTMENT.** The "athlete-selectable ADJUST FOR HEAT toggle" ruling below is **WITHDRAWN on the evidence.** We measured it (`scripts/verify-heat-decoupling-*.mjs`): across **81 steady runs**, the heat→decoupling slope's 95% CI **straddles zero under every specification**, r² = 0.014, and the median decoupling by temperature bucket **FALLS** with heat instead of rising (<65°F: 4.90% → >80°F: 1.45%). **His hot runs read BEST.** There is no coefficient to fit — anything fitted would be noise, which is exactly what killed D-250. The exclusion was not shielding him from a hot-run lie; **it was deleting his best data.**
- **⚠ The "measured cost" claimed below was a FORECAST, not a measurement.** The exclusion was only firing on **1 of 92** runs — history was never re-analyzed after D-275 shipped (2026-07-11), so the flag is almost entirely unset. The thin July substrate was caused by **low run frequency + the fartlek/steady gate**, not by heat. The blindness this entry describes was **latent** (it would have bitten on the next backfill), not realized.
- **⚠ n=1 — do NOT hardcode "heat doesn't matter."** A heat-**naive** athlete may well show the textbook drift. What generalizes is only "nobody deletes the session". Any future correction must be a **per-athlete fitted coefficient that applies nothing unless that athlete's data earns it** — machinery already exists (`_shared/heat-adjust.ts`). Not built now: the correction branch has no real athlete to validate against. **See D-283 for the full ruling.**

<details><summary>The original entry (retained — its research was right, its prescription was not)</summary>

- **Status:** filed 2026-07-13. **Attempted and REVERTED same night** (`bea95d06` → `c1a96b9c`).
- **The finding — D-275's justification is false.** `state-trend/run.ts` drops heat-confounded runs from the run durability substrate (`.filter((r) => r.decoupling_confounded !== true)`), and ENGINE-STATE called this "confirmed field-standard (NOT over-correcting)". **It is not.** Research (2026-07-13, adversarially verified) found **NO shipped product discards a session from a decoupling / efficiency / fitness trend because it was hot**:
  - **Garmin ADJUSTS a RETAINED estimate.** Above 22°C/72°F it applies heat corrections to VO2max + Training Status. **Patent US 11,998,802** (Firstbeat Analytics Oy, granted 2024-06-04 — *verified real*): heat dose from live weather + training history → an acclimatization state → a **multiplicative correction** to the retained value. Firstbeat's own stated rationale is the anti-exclusion argument: without correction the number falls in heat and gives the athlete **"false discouraging feedback."**
  - **TrainingPeaks** computes and SHOWS Pa:Hr regardless of conditions (fixed 5% band). It does **NOT** auto-flag heat — the athlete interprets. (⚠ A claim made mid-session that TP "flags conditions" was **WRONG and is retracted**. TP also ships no decoupling *trend* at all.)
  - **Runalyze** includes every hot run in its rolling 30-day shape, ships no correction, and openly eats the ~2-point summer sag. It HAS a per-activity exclude switch — **heat never triggers it**.
  - The code comment justifying the filter *cites Garmin* — and then does the opposite of what Garmin does. The citation refutes the line it justifies.
- **The measured cost (real data, user 45d122e7, July):** every run is hot, so every run was dropped. The durability substrate fell to **4 samples, newest 15 DAYS OLD**, `provisional: true` — while State printed **"aerobic base needs work"** as a flat fact with no staleness and no provisional tag. **Excluding data does not make a verdict honest. It makes it blind.**
- **The athlete cannot behave their way out of it.** Decoupling is a pace-per-heartbeat **RATIO**. Hold pace → HR climbs. Slow down to hold HR → pace falls. **The ratio degrades either way.** The metric measures the COST of the heat and is structurally blind to its CAUSE. And at ~80°F the heat effect (~4-6% HR drift; science: ~2% at 22°C vs ~11% at 35°C, same subjects/workload) is **roughly the size of the 5% threshold it is tested against.** An unqualified "your aerobic base needs work" in July is not cautious — it is **unfalsifiable**.
- **THE FIX (Michael's ruling, 2026-07-13): an athlete-selectable "ADJUST FOR HEAT" toggle.**
  - **ON (adjust)** — correct the decoupling for temperature so the read reflects the aerobic base, not the weather. (Garmin's posture.)
  - **OFF (raw)** — show the number exactly as measured; the athlete knows it was hot. (TrainingPeaks/Runalyze's posture.)
  - **NOT include/exclude.** Nobody ships that fork. It is the wrong toggle.
- **⚠ WHAT NOT TO BUILD:**
  - **Do NOT copy Garmin's method.** Heat dose + acclimatization state + multiplicative correction is **patented** (US 11,998,802), Efforts is a **Garmin/Strava data partner**, and the patent number is now on the record here — which converts naive infringement into *willful* infringement. Build any adjustment from **published dose-response curves**, and get a freedom-to-operate read before shipping one.
  - **Do NOT improvise the adjustment.** `_shared/heat-adjust.ts` already exists (`heatTerm`, `adjEfficiency`, `dewPointF`) — from **D-250**, the route-trend heat adjustment that was built, deployed, and then **FLIP-FLOPPED on real data** and was superseded. There is a corpse behind this. It needs evidence, not enthusiasm.
  - **Do NOT remove the exclusion without an adjustment behind it.** That was tried (`bea95d06`) and pulled: hot runs inflate decoupling, so "needs work" would fire MORE often all summer, carrying only a label. **Labelling a number you could have corrected is not honesty — it is an excuse.**
- **Also retracted from that attempt:** the "· N of M runs were hot" naming + warning-tone drop was **an invention**, presented as the TrainingPeaks model. No shipped app does it. If it ever returns, it returns as an explicit, owned design decision — not a citation.

</details>

## Q-171 — The observed easy-pace side was contaminated by HARD runs, and an invented number could anchor the band (ENGINE, 2026-07-13)

- **Status: RESOLVED 2026-07-13 (D-284).** Filed and fixed the same session. Kept as the record of what D-282 shipped wrong, because all three defects sat on the path into the engine that sets the plan's easy pace.
- **The contamination (the one with teeth).** `compute-facts` qualified *samples*, not *runs*: every run, 10-sample floor. So an interval session's warm-up (in-band HR, slow) and the **HR-lag opening of each hard rep** (HR not caught up, pace already fast) both wrote a `pace_at_easy_hr` for a HARD workout — feeding `run_easy_pace_at_hr` → the D-033 reconciler → **the plan's easy pace**. A noisy-slow patch trips `reconciled_worse` and slows the athlete down. **The bike already had this exact fix (D-275-bike, "cardiac lag"); the run never got it.**
- **The invented anchor.** `learn-fitness-profile` can write `run_threshold_hr` = "88% of observed max (estimated)", `sample_count: 0`. The band accepted it and announced *"Friel Z2 — at or below 89% of your threshold HR"* over a pure formula — and the resulting band (62-78% of max) was **tighter than the honest bootstrap it replaced**, drifting back toward the Q-169 starvation.
- **The 1 bpm seam.** Easy topped at 134; the analyzer's Zone 3 began at 136. A 135 bpm run was Zone 2 on Details and "not easy" to the learner.
- **Don't re-litigate:** the easy gate is intensity-based, not label-based (an unlabeled interval session must still be caught, and `compute-facts` can run before the analyzer classifies). The `sample_count` gate is **measured-vs-invented**, not weak-vs-strong — a low-confidence *measured* threshold still anchors.
- **Still owed:** the recompute/backfill (`pace_at_easy_hr` + LTHR zone bins are stored per workout; history is on the old rules, and the 5-week intensity window currently mixes two zone schemas).

## Q-172 — The gate D-275 SHOULD have been: drop a reading that is an OUTLIER against the athlete's own shape, not one that was HOT (ENGINE, 2026-07-13)

- **Status:** IDEA, not a bug. Filed off the Runalyze verification in D-283 so it does not evaporate. **Do not build without the evidence step below.**
- **Where it comes from.** Verifying D-283 against Runalyze's own docs turned up the rule we should probably have had all along. Runalyze's **Effective VO2max is a pace:HR ratio** — the closest market analogue to our decoupling / efficiency read — and its guidance for dropping a bad session is:
  > *"You should exclude an activity if the estimated Effective VO2max differs from your shape by more than 5 points."*
  Heat, wind, cold, terrain, stoppages and drills are all listed as *causes* of a bad reading. **None of them is the gate.** The gate is **"this number is far from your own normal"** — weather-agnostic, cause-agnostic, athlete-owned (a manual per-activity switch, never automatic).
- **Why this is the RIGHT shape and D-275's was the wrong one.** D-275 gated on the **thermometer**, which is a *proxy* for "the reading might be bad". The proxy is (a) unnecessary when the reading is fine anyway — **this athlete's hot runs read BEST, and would be KEPT under Runalyze's rule** — and (b) blind to every *other* way a reading goes bad: a dead HR strap, a stop-and-go city run, a run where he stopped to stretch. An outlier gate catches all of those and needs no weather data at all.
- **What it would look like:** in `state-trend/run.ts`, drop a decoupling point whose value sits more than N (robust) units from the athlete's own recent central tendency — e.g. > k × MAD from the rolling median — rather than the current fixed plausibility band (`value >= -30 && value <= 50`, which is so wide it catches essentially nothing: **a −28.9% and a +19.5% both currently pass**).
- **⚠ THE EVIDENCE STEP, BEFORE ANY BUILD (do not skip — this is how D-250 died):**
  1. Pull the decoupling series (`scripts/verify-heat-decoupling-evidence.mjs` already dumps it) and look at the actual distribution. His steady runs span **−28.9% to +19.5%** — a decoupling of −28.9% is not physiology, it is a broken reading, and it is **currently in the substrate**.
  2. Decide the robust statistic and k **from that distribution**, not from Runalyze's "5 points" (their metric is VO2max, ours is a %; the number does not transfer — only the SHAPE does).
  3. Confirm on real data that it drops the junk and **keeps the good hot runs** (the D-283 invariant). If it starts eating hot runs again, it is the same bug wearing a new coat.
- **Do NOT re-litigate:** this is **not** a heat gate and must not become one. D-283 stands — hot runs are kept. And per Runalyze/[[feedback_apps_science_default]], if an exclusion ever becomes athlete-visible it should be **athlete-owned** (a switch), not silent.

## Q-173 — In summer the easy-pace learner goes SILENT, and the surface does not say so (ENGINE, 2026-07-13)

- **Status:** filed, unbuilt. Noticed live off Michael's 2026-07-12 run.
- **The mechanism.** Heat pushes his HR **4–7 bpm** above his cool-weather HR at the same effort. His easy ceiling is **134** (89% of LTHR 151). So his hot runs land at **135–141 bpm** and are **all excluded from the easy band** — while his cool runs land at 133–134 and qualify. Verified across his last 8 runs: every run ≥76 °F is out; every run ≤68 °F is in. The 2026-07-12 run (78 °F, 54% RH, dew point ≈60 °F) came in at **138 bpm / 12:14 per mile** and was correctly excluded — *he had deliberately slowed down to hold HR and STILL ran 4 bpm over the ceiling.*
- **The GOOD news (this is not the bug).** The HR band is accidentally **self-protecting**: a heat-depressed pace cannot drag the learned easy pace slow, because heat disqualifies the run before it is counted. `run_easy_pace_sec_per_km` = **11:08/mi**, learned from cool runs — the un-confounded truth. Do **not** "fix" this by widening the band to let hot runs in; that would import the exact bias the exclusion accidentally prevents.
- **THE ACTUAL DEFECT: it does not say it has gone quiet.** Through a hot summer almost no runs qualify, so the learner simply stops updating and the surface keeps showing a number that **looks current and is months old**. That is a Law-2/Law-3 freshness failure, not a physiology problem. The honest fix is a **staleness stamp** — *"Easy pace 11:08/mi — as of May 27"* — the same "as of {date}" treatment the BODY rows already got (coach v85/v87). **Cheap, honest, and requires inventing no physiology.**
- **⚠ What we could NOT measure (be honest about this).** Does heat slow his pace *at a given HR*? Almost certainly yes — physiology says so, and his own run proves the cost (slowed to 12:14, still hit 138). But **it is unmeasurable on his data**, because heat ejects the runs from the band: only **n=2** hot runs qualify as easy. The regression returns +0.53 sec/mi per °F, *not significant*, CI straddling zero — a number with no evidentiary weight. **Do not build a pace-heat correction off it.**
- **The irony worth remembering:** D-283 removed the heat exclusion that *didn't* matter (decoupling — measured, no effect). The one that *might* matter (pace-at-HR) is still standing, hidden inside the HR ceiling — and it cannot be measured for exactly the reason it exists.

## Q-174 — Should the athlete's TYPED pace beat the app's LEARNED one? (PRODUCT, 2026-07-13)

- **Status: DECIDED + SHIPPED 2026-07-13 (Michael): THE ATHLETE CHOOSES, and their choice wins.** Implemented for the RUN. **⚠ BIKE IS NOT DONE — see the blast-radius note at the bottom; do not "finish the job" without reading it.**
- **The ruling.** `performance_numbers.easy_pace_source: 'manual' | 'learned'`, set by a two-option control in Baselines. `'manual'` is honored **even over a high-confidence learned pace** — an assertion outranks an inference (Law 2 draws exactly that line, and Garmin/TrainingPeaks both respect a value you set). `'learned'` tracks the learner live and **deliberately SKIPS the manual tier entirely**, so a stale typed number the athlete explicitly declined cannot resurface just because the learner momentarily thins out.
- **Purely additive.** An **absent** choice behaves byte-identically to the old learned-first precedence. No migration, no regression, no backfill. Pinned by fixture.
- **⚠ THE BIKE IS THE OPEN HALF — AND IT IS NOT A ONE-LINE FLIP.** `resolveCurrentFtp` shares the learned-first ranking, so run and bike now answer the same question differently (a Law 1 fracture, accepted knowingly and temporarily). The reason it was NOT flipped: **three consumers gate on `source === 'learned'` specifically** —
  - `_shared/infer-training-fitness.ts:32` — returns the FTP **only** when `source === 'learned'`
  - `_shared/race-projections.ts:376` — same
  - `materialize-plan/index.ts:2654` — accepts `'learned'` **or** `'manual'`
  A naive precedence flip would make an athlete-chosen manual FTP resolve as `'manual'` → the first two return **null** → **bike race projections and fitness inference silently stop working** for anyone who sets a manual FTP. Fix those three FIRST (they should accept an athlete-CHOSEN value — an assertion is not a low-quality inference), then mirror `easy_pace_source` as `ftp_source`.
- **Also owed:** the manual field carries **no `as_of`** (the learned one now does, Q-173). If the athlete's number is going to win, it should be dated too, or it goes stale invisibly — which is the exact argument that justified learned-first in the first place.
- **The question.** `resolveCurrentRunEasyPace` (and `resolveCurrentFtp` before it) rank a **medium/high learned value ABOVE the athlete's manual entry**. So if the athlete types 11:30 and the app has learned 11:08, **the typed value is kept but never applied.** D-285 made that state *visible* ("Your runs are being used instead") rather than hiding the field — but it did not change the ranking.
- **The case for flipping it (athlete wins):** a manual entry is an **assertion**, not an inference (Law 2 draws exactly that line). The field standard supports it — Garmin lets you set a manual max HR / FTP and respects it; TrainingPeaks never auto-overrides what you set; Runalyze estimates but lets you choose. An app that keeps a field it will not honour is a subtler kind of lie than one that hides it.
- **The case for leaving it (learned wins):** the athlete's typed number goes stale silently (it carries **no `as_of`** — a real gap), and a measured value from their own runs is usually truer than a number they entered months ago. This is why `resolveCurrentFtp` was written this way.
- **The honest middle:** an explicit per-field **override toggle** ("use my number"), which is what the FTP flow's "Clear to use auto-learned" button gropes toward but inverts.
- **⚠ Blast radius if flipped:** `resolveCurrentFtp` shares the ranking, so a change would want to move BIKE too, or the two disciplines diverge on the same question (a Law 1 fracture). Decide once, for both.
- **Related:** the manual field has no `as_of`. If the athlete's number is going to win, it should be dated, like the learned one now is (Q-173).

## Q-175 — The CLIENT still re-derives the easy pace (Law 4: surfaces render, they never re-decide) (ENGINE, 2026-07-13)

- **Status:** OPEN. Filed by D-287, which made the resolver universal on the SERVER and deliberately stopped there rather than half-doing this.
- **The gap.** These client surfaces expand `{easy_pace}` / pace tokens by reading `performance_numbers.easyPace` **directly**, with their own `||` chains:
  - `src/services/plans/normalizer.ts:54` (`resolvePaceToken`)
  - `src/components/StructuredPlannedView.tsx:352`
  - `src/pages/PlanSelect.tsx:585, 609, 652, 722`
  - `src/components/PlanWizard.tsx:470, 509`
  - `src/components/AllPlansInterface.tsx:664, 791`
- **Why they can't just call `resolveCurrentRunEasyPace`.** The client is only handed `performanceNumbers` — it **never receives `learned_fitness`**. So the resolver would be running on a third of its inputs and would silently answer `manual` for everyone, which is worse than the status quo.
- **⚠ THE FIX IS NOT "ship the resolver to the client."** That would make the client re-decide a verdict the server already owns — a Law 4 violation with a nicer haircut. **The server should send the already-resolved pace** (with its `source` / `confidence` / `as_of`, per Law 3), and the client should render it. The plan contract is the natural home.
- **Blast radius:** display + token expansion only. It cannot currently *prescribe* a wrong pace (the server materializes the targets); it can *display* a pace that disagrees with the one the plan was built on.

## Q-176 — LTHR resolves FOUR different ways, and two are inverted. It is the root of the run stack. (ENGINE, 2026-07-13)

- **Status:** OPEN, **spec'd** (`docs/SPEC-lthr-one-anchor.md`). **The highest-leverage continuity work left.**
- **The fracture.** `_shared/easy-hr.ts` (the EASY BAND) resolves LTHR **learned → manual**. `compute-workout-analysis:1578` (the ZONE BINS on Details) resolves it **configured/manual → workout → learned**. **Inverted.** Plus `calculate-workload:241` (workout-first) and `coach:2087` (learned-only) — four chains.
- **The realised bug:** an athlete who **types** an LTHR in Baselines gets their **zone bins** from the typed value and their **easy band** from the learned one. **Two LTHRs, two zone tables, one athlete.** That is D-286's bug at the root, where it propagates into every zone, the 80/20 read, and which runs qualify as "easy".
- **Latent for the primary user only by accident** — he has typed no LTHR, so both chains fall through to learned (151) and agree.
- **⚠ A scare that is NOT real — do not "fix" it.** Strava writes `configured_hr_zones` on connect, and the analyzer trusts that object first, so a synced 220-age default *looked* like it could outrank a measured LTHR. **It cannot:** `strava-token-exchange:139` writes `threshold_heart_rate: null`. Strava supplies zone boundaries and a max HR, never an LTHR.
- **The fix** is the pattern already proven three times (`resolveCurrentFtp`, `resolveCurrentRunEasyPace`, `friel-zones.ts`): one `resolveCurrentLthr()` in `src/lib/`, four call sites routed. **Do `threshold_pace` in the same pass — it has NO resolver at all** (read directly in ~15 files).
- **✅ DECIDED 2026-07-13 (Michael): LET THE ATHLETE CHOOSE — mirror Q-174.** Default **learned** (byte-identical to today); an explicit `lthr_source` toggle, honoured over even a high-confidence learned value. Rationale: a real threshold **test** beats a passive learn off ambient runs (his LTHR is **n=2**), but the app **cannot tell a tested number from a guessed one and never will** — so it must not pretend to. The athlete knows which theirs is; ask them. (Per Q-174: choosing `'learned'` must SKIP the manual tier, so a declined number cannot resurface.)
- **⚠ This makes four surfaces AGREE about the number. It does not make the number BETTER.** Only a threshold test does that. **Do not fix his zones by inference.**

## When to add an entry

Add a new Q-NNN when:
- A behavior gets noticed and someone considers "fixing" it but the right call is to leave it.
- A bug is filed but explicitly deferred (note the deferral reason).
- Verification is owed but not yet done — record the verification approach so the next session can pick it up cheaply.

When the answer is established (verified, intentional, or fixed), keep the entry but mark its status. Don't delete entries; they're institutional memory.

---

## Q-177 — The "strength volume down" SIGNAL is a PARTIAL-WEEK ARTIFACT. It fires at CONCERN severity every Monday, for every athlete, by construction. (ENGINE, 2026-07-13 — FOUND BY LOOKING AT THE APP)

**Found on the live account, on a Monday.** State showed, on the same screen, at the same time:

> `STRENGTH · Volume · steady` *(the spine)*
> `SIGNAL: Strength volume well below recent baseline (-64.4% vs chronic)` *(a nudge, with a "Review with Arc →" button)*

**Two engines, one fact, opposite answers, one screen.** Law 1.

### The arithmetic — it cannot NOT fire

`compute-snapshot/index.ts:445` — `const strengthVolumeTrend = pctChange(current.strengthVolume, chronicStrVol);`

- **`current.strengthVolume` is a CUMULATIVE SUM** of the CURRENT week's sessions (`:117` `let strengthVolume = 0`, `:183` `strengthVolume += f.strength_facts.total_volume_lbs`). `targetWeek = mondayOfToday()` (`:293`), so on a Monday this is **one day of data**.
- **`chronicStrVol` is the average of COMPLETE prior weeks** (`:443-444`).

**A partial-week sum compared against full-week sums is systematically negative.** Monday, 1 of 4 sessions done → **≈ −75%**. The observed value was **−64.4%**.

`_shared/longitudinal-signals.ts:148-156` fires it at `tStr < -12` (warning) and **`tStr < -22` → `severity: 'concern'`** — the top tier.

> **So the highest-severity strength nudge in the app fires every Monday and Tuesday of every week, for every athlete, forever. It is measuring WHAT DAY YOU LOOKED, not what you did.** It then decays to nothing by Sunday, and re-arms.

**This is "the score that lies" (`CANON-arc-inference-model.md`), live and on screen.**

### Why the spine is right and this is wrong
`_shared/state-trend/strength.ts` reads **per-workout** `total_volume_lbs` over a **6-week** window with ±8% bands and endpoint smoothing — **immune to the partial-week problem.** It said `steady`. It was correct.

### Blast radius — the nudge is not the only consumer
- 🔴 **LIVE:** the SIGNAL nudge (`longitudinal-signals.ts:146` → ArcContext → `StateTab.tsx:1700-1735`).
- 🟡 **LATENT:** `compute-snapshot:507` — `structuralDirection` falls back to `strengthVolumeTrend` (`> 5` improving / `< -5` declining) **when top-lift e1RM data is absent**. `structuralDirection` then feeds **`interferenceScore`** (`:511+`, "one system improving while the other declines"). So for an athlete with no lift history, **a Monday makes the app believe their strength is declining, and it will call that interference.** *(Dodged on the primary account only because he has e1RM data, which wins the branch.)*
- ⚫ `BlockSummaryTab.tsx:140` — unmounted, dead.

### Scope note — the sibling trends are NOT broken the same way
`compute-snapshot:428` `rpeTrend` and `:440` `runEasyPaceAtHrTrend` use the same `pctChange(current, chronic)` shape, **but their `current` is an AVERAGE, not a sum** — an average over a partial week is noisy, not systematically biased. **`strengthVolume` is the only cumulative total in the set. That is the whole bug.**

### The fix direction (NOT a decision — needs a call)
Either (a) **normalize** — compare per-session or per-day volume, not a week-to-date sum; (b) **gate** — don't emit the signal until the week is complete (or until N sessions land); or (c) **delete the signal** and let the spine's 6-week volume trend be the single source, which is what Law 1 actually wants. **(c) is the cheapest and most Law-1 compliant.** Do not just widen the threshold — that hides a structural artifact behind a magic number.

### ⚠️ How this was found, and why it matters for method
**The code audit missed it entirely.** Four parallel readers traced the whole spine and never flagged it, because in code `pctChange(current, chronic)` looks completely reasonable. **It was found by opening the app on a Monday.** See the note at the top of `POLISH-PUNCH-LIST.md §1`: a code trace is right about EXISTENCE and blind to SEVERITY. Some bugs are only visible from a chair.

---

## Q-178 — Q-076 ROOT-CAUSED WITH A LIVE REPRO: a skipped exercise counts as PERFORMED, because `completed === true` outranks "zero reps". The score forgives it and the narrative asserts the opposite of what happened. (ENGINE, 2026-07-13 — FOUND BY LOOKING AT THE APP)

**Q-076 ("skipped exercise still shows as done") has sat unverified since 2026-06-21 because the only screenshot was blank.** Here is the repro, live, on the primary account.

### The session — Strength Focus — Upper A, Mon 2026-07-13

| exercise | planned | completed |
|---|---|---|
| Bench Press | 5×5 @ 120 lb | **4 sets** (set 5 = `—`). Volume **−600 lb**. |
| Barbell Row | 3×5 @ 95 lb | 3 sets ✅ |
| **Farmers Carry** *(the HYROX accessory)* | 3 × 40 reps | set 1 `—` · set 2 **`0 reps (RIR 3)`** · set 3 `—` |

**He did ZERO Farmers Carries.** The app said:

> **EXECUTION 98% · Strong**
> *"Sets landed on target across all three lifts, with loads held to plan…"*

### ROOT CAUSE — `analyze-strength-workout/index.ts:89` (`isPerformedStrengthSet`, D-204)

```ts
if (s?.completed !== true && s?.prefilled === true) return false;
return s?.completed === true ||          // <- SHORT-CIRCUITS. The flag outranks the data.
  (s?.reps != null && s.reps > 0) ||
  (s?.weight != null && s.weight > 0) ||
  (s?.duration_seconds != null && s.duration_seconds > 0);
```

A set with **0 reps, 0 weight, 0 duration** but `completed: true` returns **PERFORMED**. *(Deductively certain: with `completed !== true` this set could only return false — every data branch is zero. So that row carries `completed: true, reps: 0`.)*

**The tell is `0 reps (RIR 3)` — an RIR value on a set with no reps.** The logger wrote the reps-in-reserve and never wrote the reps.

### Why the SCORE forgives it
`:1337` — D-208 role-weighted exercise completion: each planned exercise contributes its role weight (primary/secondary **1.0**, accessory **0.5**) to numerator and denominator, and the numerator counts exercises where `ex.matched`. Because the 0-rep set reads as performed, **Farmers Carry MATCHES**, so `exerciseCompletion = 100%` and the 30%-weighted term pays out in full for an exercise that never happened. `overallExecution = exercise×0.3 + sets×0.2 + load×0.3 + rir×0.2` (`:1341`) → **98%** → `>= 85` → **"Strong"** (`:2811`).

*(Even correctly counted, Farmers Carry is an accessory at 0.5 weight → exerciseCompletion 80% → ~92%, still "Strong". **So the score is the smaller problem. The narrative is the bigger one.**)*

### 🔴 Why the NARRATIVE is the real damage — and why the guard cannot catch it
The prose says *"Sets landed on target across all three lifts."* **The LLM is not hallucinating.** It is being handed a fact packet that already records the exercise as performed. **`_shared/narrative-core/validate.ts` validates prose against the FACTS — so it cannot catch a lie that is already IN the facts.**

> **This is the failure mode the whole LLM containment strategy is built to prevent, arriving through the one door it does not watch: garbage in, confident out.** The containment (LLM writes prose only, validated against the spine, dropped on contradiction) is sound — **and it is only as honest as the packet.** Corrupt the packet and the guard becomes a laundering step.

### The fix (direction, not a decision)
A set is **not performed** if it has `reps === 0 && !weight && !duration`, **regardless of the `completed` flag**. The flag records that the athlete *touched the row*; it must not outrank the fact that they logged nothing. **Also fix upstream:** the logger should not write an RIR onto a set with zero reps.

⚠️ **Read D-204 before touching `isPerformedStrengthSet` — it was deliberately centralized out of 6 copies.** Change the predicate, not the call sites.

### ⚠️ Method note
**The code audit did not find this.** `isPerformedStrengthSet` reads as a careful, well-commented, deliberately-centralized predicate — and it is. **It was found by opening a completed workout and reading the table.** Same lesson as Q-177: a code trace is right about EXISTENCE and blind to SEVERITY.

---

## Q-179 — THE CONTINUITY FRACTURE, WATCHED LIVE: the plan knows running is "maintenance only (held so strength leads)". State says "aerobic base needs work". `per_discipline_posture` is read ZERO times at runtime. (ENGINE + PRODUCT, 2026-07-13 — FOUND BY LOOKING AT THE APP)

> **✅ TIER 1 CLOSED 2026-07-14 — see D-292.** `per_discipline_posture` is now read at runtime (`_shared/state-trend/posture.ts`) and the State run row frames a maintained discipline's decline as a declared TRADE, not "aerobic base needs work". Shipped + deployed + pushed + verified in DB. **Tier 2 (the "consequence" prose — what we can no longer see when a discipline stops) is STILL OPEN**, blocked on `PRODUCT-POSITIONING-v2-DRAFT.md` + `SCIENCE-run-specificity.md`. The full State v3 vision (band + prognosis + the "lever") is `SPEC-state-fitness-band.md`. Everything below is the original 2026-07-13 finding, still accurate as history.

**This is the single clearest instance of the continuity problem in the app.** One athlete, one week, one question — *how is your running?* — and **three surfaces answer differently**, because the athlete's declared intent is read once at plan-build and then discarded.

### What is on screen, right now, simultaneously

| surface | what it says | does it know the posture? |
|---|---|---|
| **The plan's session copy** (swim card → "Next") | *"Easy Run — ~60 min easy aerobic, conversational — **maintenance only (held so strength leads)**."* | ✅ **YES** — generated at plan build, which DID read `per_discipline_posture` |
| **State → PERFORMANCE → run** | *"Easy — **aerobic base needs work**"* (`_shared/state-trend/run.ts:139`, driven purely by decoupling > 5%; his is **7.8%**) | ❌ **NO** |
| **`off-plan-banner.ts:66-71`** (strength-primary path) | *"On plan — strength on track; endurance via cross-training"* — while he ran **zero** of his two planned runs in Jul 6-12 | ❌ **NO** (`computePrimaryAdherence` counts the primary discipline only — see `SPEC-posture-flag.md §2`) |

### THE PROOF — one grep

```
per_discipline_posture  in  supabase/functions/_shared/state-trend/   -> 0 occurrences
per_discipline_posture  in  supabase/functions/coach/index.ts         -> 0 occurrences
```

**The entire verdict engine is posture-blind.** It grades a `maintain` discipline exactly as it would grade a `develop` one. `SPEC-posture-flag.md §3` already said this in the abstract — *"BUILT — but WRITE-ONLY. Read once at plan-build; ZERO runtime surfaces read it."* **This entry is the receipt.**

### It is worse than posture-blind — the number is also STALE
The 7.8% decoupling driving "needs work" is **`as of Jun 27`** — **16 days old** on the day it was read. Because the durability substrate only accepts **steady** runs and drops `decoupling_basis === 'raw'` (terrain), and the athlete (a) barely runs during a strength block and (b) runs rolling terrain when he does. **So the app is scolding him about a discipline he deliberately parked, on a two-week-old reading, in the middle of the strength block he planned.**

> ### ⛔ CORRECTION (same session): my first theory was WRONG, and the real finding is better.
> **I guessed the terrain/raw-basis filter was starving the trend. It is not — I had it backwards.** `gap.ts:195-204`: `basis = 'raw'` means **NO USABLE ELEVATION** (treadmill, or a device that didn't record it). **Rolling terrain HAS elevation → `basis = 'gap'` → the run is KEPT.** The Jul 13 run passes every gate: `isSteadyAerobic('easy run')` ✅ (`run.ts:148` drops only interval/tempo/fartlek/threshold/vo2/speed/track/race/surge), 48 min ≥ 20 ✅, elevation present ✅.
>
> **✅ WHAT IS VERIFIED — A STRUCTURAL ONE-WORKOUT LAG.** The spine reads a run's decoupling from `workouts.workout_analysis` (`compute-snapshot:689`). But `workout_analysis` is written by **`analyze-running-workout`**, which `ingest-activity` fires **fire-and-forget at `:1624`** — *after* it **awaits `compute-facts` at `:1581`*, and `compute-facts:1844` is what **fires `compute-snapshot`**.
> **So on every ingest, `compute-snapshot` reads the analysis of the run that has just landed — before that analysis has been written.** The newest run's decoupling is silently absent from the series, and only enters on a LATER snapshot pass (the next time any workout is ingested).
> **The run durability trend is therefore ALWAYS AT LEAST ONE WORKOUT BEHIND, by construction.** This is the SAME disease as the `compute-facts`-reads-`computed` race already filed: **the fan-out awaits the wrong things.**
>
> ⚠️ **STILL UNEXPLAINED, and I am not going to guess:** a one-workout lag does not explain **16 days**. Many workouts have been ingested since Jun 27. **Something else is also suppressing his recent runs from the decoupling series. This needs a DB query, not another theory.**

### This is the SAME shape as Garmin calling him "Unproductive"
`PRODUCT-POSITIONING-v2-DRAFT.md` opens on exactly this: *"Garmin tells a lifting, swimming athlete running in summer heat that he is Unproductive. It cannot see the lifting, cannot see the swimming... and it never asked what you wanted."*

**Efforts DID ask. It stored the answer. And then it judged him on the axis he told it to deprioritize anyway.** *(D-288's commit message named this class — "right about the number, wrong about the athlete" — and fixed it for the Performance screen. **It was never fixed on State.**)*

### What this means for the roadmap
**The posture flag is not a new feature. It is the fix for this.** And it should be understood as **making the verdict engine posture-aware**, not as adding a banner. The banner is the smallest part.

**Do NOT ship the flag before the verdict engine can read posture at runtime** — otherwise the app will flag "you said maintain running and you haven't" on one row while still saying "aerobic base needs work" on the row above it. **Two posture-aware surfaces and one posture-blind one is not continuity; it is a third opinion.**

### ⚠️ Method note
Found by **opening a swim session and reading the "Next" card**, then comparing it to State. The code audit had all the pieces (`SPEC-posture-flag` documented the write-only field; the spine trace covered `run.ts`) and **never put them next to each other** — because in code they live in different files, and only on screen do they live in the same eye.

---

## Q-180 — THE LOGGER CANNOT RECORD A CARRY. The Hyrox station is prescribed in METRES; the logger has a timer and a reps box, and nothing else. The athlete's work is silently lost. (ENGINE + PRODUCT, 2026-07-13 — FOUND BY MICHAEL, from his own session)

**This is the disease behind Q-178.** Q-178 fixed the analyzer (it must not fabricate work from a `completed` flag). **This is why the data was missing in the first place.**

> **Michael, on his own Mon 2026-07-13 session: "I DID complete the farmers carry — it felt a little glitchy on the logger."**
> **He did the work. The app threw it away.**

### The chain

1. **`shared/strength-system/strength-primary-plan.ts:193` — `HYROX_ROTATION` prescribes carries in METRES, in the `reps` field, as a string:**
   `Sled Push '20 m'` · **`Farmers Carry '40 m'`** · `Sandbag Lunge '20 m'` · `Sled Pull '20 m'` · `Back Extension '15'`
2. **The equipment substitution WORKS — and it is well built** (`materialize-plan:1006-1032`). Michael has dumbbells and no sled/turf, so sled + sandbag were correctly swapped out and **Farmers Carry correctly survived** (*"works with any load (DB/KB/barbell); only fall back when there is none at all"*), with honest notes. **His session was Bench, BB Row, Farmers Carry. Exactly right.**
3. 🔴 **THE LOGGER HAS NO DISTANCE INPUT.** `grep -cniE "distance|metres|meters" src/components/StrengthLogger.tsx` → **0**. It has exactly two modes (`:3955`): `isDurationBased` → a **timer**; else → a **numeric reps box**. **A 40-metre carry fits neither.**
4. → He carried 40 m, had no field to put it in, tapped Done, and D-203's friction-free auto-save wrote `completed: true, rir: 3, reps: 0`.
5. → The old analyzer predicate read the flag and called it PERFORMED → `98% · Strong` → *"sets landed on target across all three lifts."* **(Q-178.)**

### ⚠️ THIS IS WHY Q-178 CANNOT SHIP ALONE

The Q-178 fix (a 0-rep set is not performed) is **correct** — the app must not claim work it has no record of. **But deployed on its own it now correctly reports that his carries were not recorded, which means it MARKS HIM DOWN FOR WORK HE ACTUALLY DID.**

**The old behaviour lied in his favour. The fixed behaviour lies against him. Neither is true.** The truth is: **the app does not know, because it never gave him a way to tell it.**

> ### THE RULE THIS ESTABLISHES
> **If the app structurally CANNOT capture an exercise, it must not GRADE the athlete on it.**
> Exclude it from the denominator and **say so** — *"carry work isn't recorded yet."*
> Same principle as refusing to invent a 1RM (Law 2). **Do not penalise what you cannot measure.**

### Also found — a LATENT unit bug in the same block
**The substitution rewrites the exercise NAME and the NOTES. It never rewrites the `reps` UNIT** (`reps rewrites inside the fallback block: 0`).
- `Sled Pull ('20 m')` → **`Dumbbell Row`** — still prescribed **`20 m`**. **A dumbbell row in metres.**
- `Sled Push ('20 m')` → `Dumbbell Walking Lunge` — 20 m is arguably fine for a walking lunge, but it is luck, not design.
- Also: `repScaleFor` (`materialize-plan:834`) does `Number(reps)` → **`Number('40 m')` = NaN** on every distance-prescribed set.
- The rotation cycles weekly (`rot[(week - 1) % rot.length]`), so **Michael hits the Dumbbell-Row-in-metres in week 4.**

### The fix — three pieces, and (1) must not ship without (3)
1. ✅ **Analyzer: don't fabricate work from a flag.** *(Q-178 — done, committed, held.)*
2. 🔴 **Logger: a THIRD input mode — distance.** The real fix. `duration_seconds` already exists as the precedent for a non-rep unit (`StrengthLogger.tsx:21`); this needs `distance_m` alongside it, threaded through the set shape, volume, and the analyzer.
3. 🔴 **Analyzer: exclude un-capturable exercises from the score, and disclose.** This is what makes (1) safe to ship. Without it, the honesty fix punishes the athlete.
4. 🟡 **Substitution must rewrite the UNIT, not just the name.** A row is reps; a carry is metres.

### ⚠️ Method note — the third overclaim of the day
I first wrote this up as *"4 of 5 Hyrox stations are unloggable"*. **Wrong.** The equipment substitution filters them, and it does so correctly — **Michael only ever saw the one station his kit supports.** The real finding is narrower and sharper: **whatever station survives substitution is still prescribed in a unit the logger cannot capture.**

**Michael caught it, from his own session, in one sentence.** The code audit missed it, the device session missed it, and I overstated it twice before he corrected me. **The athlete in the chair is a load-bearing part of this method.**

---

## Q-181 — A SWAP IS NOT A SKIP: the app docks the athlete TWICE for an honest exercise substitution (PRODUCT + ENGINE, 2026-07-13 — RAISED BY MICHAEL)

> **Michael:** *"I'm gonna swap Bulgarian split squats for hip thrust… I don't think the app should dock the user for substitutions if they are actual substitutions. Now it does."*

**Verified.** `analyze-strength-workout:520` `matchExercises` links planned↔executed **BY NAME ONLY** (exact, then a fuzzy `includes()`), and **no substitution concept exists anywhere in the codebase** (`grep substituted_for|swapped_from|original_name` → **0 hits**).

So a declared, honest swap is read as **two separate failures**:

| | | |
|---|---|---|
| **Bulgarian Split Squat** (planned) | `matched: false` (`:554`) | counts as a **SKIP** → drags `exerciseCompletion` (`:1337`), which is **30% of the execution score** (D-208, role-weighted) |
| **Hip Thrust** (executed) | `{ planned: null }` (`:593`) → excluded from `plannedEntries` (`:1332`) | **ZERO CREDIT for work actually done** |

**Penalised for what he didn't do, and unpaid for what he did.** The app cannot tell a substitution from a skip **because nobody ever told it.**

> ### ⚠️ SPEC v1 WAS WRONG — CORRECTED 2026-07-14 AFTER RESEARCHING THE FIELD (Michael: *"follow whatever pattern a commercial strength app would follow, let's not invent anything"*).
>
> **v1 designed:** free swap + the app *names the trade* on every swap. **The field does the OPPOSITE — it CONSTRAINS the swap so there is no trade to name.**
>
> **THE INSIGHT: no commercial strength app treats the EXERCISE as the unit of adherence. They treat the SLOT** — the movement pattern the program actually prescribed. The exercise is one instantiation of it. **Swap within the slot and NOTHING WAS MISSED**, so the penalty question never arises. *(ABC Trainerize's filters are literally "Same muscle group / Same Equipment / Same movement". Fitbod auto-substitutes same-muscle at equivalent intensity. RP Hypertrophy swaps mid-cycle from a library. Built with Science: swap "while keeping the plan structurally sound". Consensus on a good substitute: match the MOVEMENT PATTERN.)*
>
> **Efforts docks the athlete only because `matchExercises` matches by exercise NAME — a unit no serious programmed app uses.**
>
> **AND THE SLOT TAXONOMY ALREADY EXISTS:** `exercise-config.ts` `primaryRef` (`squat | deadlift | bench | overhead | hipThrust`, ~135 research-cited entries) IS the movement-pattern slot, and `materialize-plan:1006` already does slot-preserving equipment swaps with honest notes. **Adherence simply doesn't use it.** Built, and never introduced to the thing next to it.

**SPEC: `docs/SPEC-exercise-substitution.md` (v2).** Field-standard mechanic: a first-class **Swap** action (not delete-and-re-add); the app **OFFERS** in-slot alternatives filtered by `primaryRef` + role + equipment; a free-library override is still allowed; and **adherence is measured against the SLOT**, so a declared swap is not a deviation and is never docked. An **in-slot** swap is **SILENT** — nothing was missed.

**The ONE thing the field does not do, and the only Efforts-invented part:** an **out-of-slot** override gets no dock and **one honest sentence** — *"Swapped Bulgarian Split Squat → Hip Thrust. Hip-dominant instead of knee-dominant — same session, different stimulus."* (`primaryRef` in `exercise-config.ts` already knows this: BSS = `squat`, hip thrust = `deadlift`.)

⛔ **DO NOT infer equivalence from the movement pattern.** It is tempting — `primaryRef` is right there — and it is wrong: knee-dominant and hip-dominant are genuinely different stimuli, and a "heavy squat swapped for a leg extension" would sail through as compliance. **Ask the athlete. Don't guess.** (Law 2.)

**This is `SPEC-posture-flag.md`'s thesis at the scale of one exercise: a trade made visible, not a compliance cop.** Sign-off gated (it changes prescription-adherence semantics).

---

## Q-182 — A "+1 ACCESSORY" CANNOT BE A FOCUS. Specialization is REDISTRIBUTION, not addition. (PRODUCT + ENGINE, 2026-07-14)

> **Michael:** *"We were gonna add a glute focus, pull-up focus along with hyrox — in Get Stronger."* (Q-100's original three.) *"Follow whatever pattern a commercial strength app would follow. Let's not invent anything."*

**Glute + Hyrox shipped (D-225) as a `+1 accessory` on Upper A, rotating weekly.** Q-103 called it *"a thin delta."* **The field says it is the WRONG PRIMITIVE.**

### The field standard (researched 2026-07-14 — volume landmarks, Israetel/RP, broadly adopted)
| | weekly sets / muscle group | |
|---|---|---|
| **MEV** | ~8–12 | below this you **maintain**, you do not grow |
| **MAV** | ~12–20 | the growth band |
| **MRV** | ~18–25+ | the ceiling — past it, regression. Highly individual. |

**Specialization:** push **1–2** targets toward MRV · **hold everything else at MEV** · **rotate every 8–12 weeks** · and, decisively:

> *"If you're training every body part for 20 sets and that's your MRV, and you want to bring biceps to 25 — **you need to take 5 sets out from somewhere else.** Once you're at your system MRV you cannot simply add more."*

**⛔ A FOCUS TAKES SETS FROM SOMEWHERE. If nothing went down, nothing was focused.**

**So `+1 accessory` is not a small focus — it is not a focus at all.** One added set, one week in three, is **below MEV** (grows nothing) and it **ADDS** to systemic volume rather than redistributing. *(Keep `accessory_bias` — as the movement-familiarity add-on it is honestly labelled as. A FOCUS is a different feature.)*

### THE INSIGHT — the right primitive is a vocabulary Efforts ALREADY OWNS
**MEV = "maintain". MAV/MRV = "develop".** **That is `per_discipline_posture`, one level down** — and `exercise-config.ts` `primaryRef` is already the movement-pattern taxonomy. A strength focus = **develop one pattern toward MAV, hold the rest at MEV, total systemic volume flat.** Nothing new is invented.

**And the receipt falls out for free** — a redistribution has a source: *"Glute focus on. Moved 4 sets from pressing into hip work. Your pressing is at maintenance for this block — it will hold, not grow."* **The trade made visible.**

### ⚠️ AND THE SAME DISEASE AS Q-179 — declared intent is WRITE-ONCE
`accessory_bias` is written by the wizard (`NonRaceBuilder.tsx:145`), read only at plan-build (`create-goal…:2423` → `generate-strength-plan:59`), and `GoalsScreen:1653` merely **displays** it. **There is NO edit path — changing your focus means rebuilding the whole plan.** `per_discipline_posture` has the identical problem (Q-179). **The app asks the athlete what they want, captures it once, and then neither reads it again nor lets them change their mind. Fix one edit path; serve both.**

**SPEC: `docs/SPEC-strength-focus.md`.** Sign-off gated (changes prescribed volume). **Open before building:** `vertical_pull` is not a `primaryRef` value today (a pull-up focus needs it) · where a per-athlete MRV comes from (do NOT fabricate one) · interference with concurrent endurance.

---

## Q-197 — Squat e1RM is split across TWO canonical names (data bug) (2026-07-22, UNVERIFIED-cause / CONFIRMED-symptom)

> **CLOSED 2026-07-23 (commit `3f983bc8`, DEPLOYED, VERIFIED-in-DB).** Confirmed a canonicalizer miss, and it hit THREE anchors + one non-anchor, not just squat:
> - `barbell_back_squat` (3 sessions), `conventional_deadlift` (5), `standing_barbell_overhead_press` (2) all slugged to lone buckets and were dropped from `STRENGTH_ANCHORS` — so squat/deadlift/OHP verdicts each ran on partial history.
> - Plural class: `bulgarian_split_squats`, `walking_lunges` split off their singulars.
> **Fix (`_shared/canonicalize.ts`):** added the synonyms (back squat / conventional deadlift / standing OHP / high+low bar) + a general plural fallback (trailing-s folds into a mapped singular; never over-merges an unmapped name). 7 deno fixtures (`canonicalize.test.ts`). Recomputed the 13 affected workouts through `recompute-workout` (no direct DB write); verified the buckets collapsed and squat went 4→7 sessions in the 12wk window. Genuinely-distinct lifts (Romanian DL, DB bench, front/goblet squat) correctly stayed separate.
> **Also fixed the same bug on the CLIENT** (`StrengthLogger.tsx` `normalizeExerciseName`): the D-097 prefill + D-122 "last:" anchor matched on raw name, so "Hip Thrusts" ≠ "Hip Thrust" and autofill silently failed for plural-logged lifts. Now drops a trailing plural 's'. Michael confirmed the symptom (hip thrust weight not auto-filling when adding). PUSHED, client not yet VERIFIED on device.
> **Left open → Q-199** (hip thrust is a server anchor but not a client baseline-test lift).
> Everything below is the original lead.


Found while tracing chart data-depth for D-311. Michael's `exercise_log` logs squat under **both** `squat` (4 sessions) **and** `barbell_back_squat` (3 sessions) over the last 12 weeks. Two consequences:
1. **Any squat e1RM chart fragments** into two half-series (blocks the strength chart, D-311 open thread).
2. **The current "Back Squat" verdict may be wrong** — `computeStrengthState` picks a `canonical`, and best/trend/PR-flag would compute on only *one* of the two name-buckets, i.e. half the sessions. The "→ flat · 4 sessions" reading Michael sees may be missing 3 sessions under the other name.

**Before touching:** confirm the canonicalizer (whatever maps raw exercise names → canonical in `compute-facts`/exercise-config) — is `barbell_back_squat` supposed to fold into `squat`? If yes, it's a canonicalizer miss; fix at the write site so future logs merge, and decide whether to backfill. If they're *intentionally* distinct (e.g., a specific bar variant), then the chart just treats them as separate lifts and there's no verdict bug. **Trace, don't assume** — this is a LEAD with a confirmed symptom (the split counts), not yet a confirmed bug (the verdict impact).

## Q-198 — State chart: open threads after the first sparkline (2026-07-22, intentional-deferral)

> **MOSTLY CLOSED 2026-07-23 (D-313).** Thread #2 (strength e1RM chart) SHIPPED — big-4 sparklines, gated on Q-197 which is now fixed. A **bike power chart** was added on the same generalized `TrendSparkline` (not originally in this list). Thread #1 (tap-to-expand into the full detail-screen chart) and thread #3 (load/form PMC chart) remain deferred. New: the bike chart only renders when power leads → **Q-200** (efficiency chart for endurance-only riders). Everything below is the original.


D-311 shipped the run-efficiency 12-week sparkline. Three Michael-approved follow-ons, deliberately not built this session:
1. **Tap-to-expand** the sparkline into the full detail-screen chart pattern (the `PACE/BPM/ELEV/CAD/PWR`-style toggle chips + draggable line). The component already toggles a taller SVG; the full detail-chart reuse is the next step.
2. **Strength e1RM chart** — reuses `EfficiencySparkline` in its building state — **gated on Q-197** (points must be correct before charting).
3. **Load/form-over-time chart** — the one thing TP's PMC charts that we don't (CTL/ATL/TSB / freshness). ACWR + load are already on the spine, so it's a render + a retained-window question, not new logic. Optional TP-parity; only if Michael wants the "am I fresh/peaked?" axis, distinct from the "am I improving?" (output) charts we now have.

Also: the chart series is 84d because that's what `runJoined`'s ~90d window carries. A *season-length* (year) chart — TP's real timescale — would need a wider retained window. Out of scope unless asked.

## Q-199 — Hip thrust is a server anchor but not a client baseline-test lift (2026-07-23, inconsistency, deferred)

Found while fixing Q-197's autofill half. `hip_thrust` is in `STRENGTH_ANCHORS` (compute-facts) — it gets an e1RM, a trend, a PR flag, and a State verdict. But the client baseline system only knows 5 lifts: `getBaselineKeyForExercise` / `baselineSeedFor` (`StrengthLogger.tsx:869/882`) cover squat, deadlift, bench, OHP, pull-ups. So hip thrust has no stored-1RM baseline and can't be seeded as a %-based baseline test, even though the app tracks and grades its e1RM. Same likely true for `trap_bar_deadlift` and `barbell_row` (also anchors, also absent from the client baseline list). Not a bug Michael reported — the day-to-day autofill (D-097, fixed in Q-197) is the path he uses — but the server/client lift lists disagree on what a "tracked lift" is. Decide whether the client baseline list should match `STRENGTH_ANCHORS`.

## Q-200 — Bike chart for endurance-only riders: chart efficiency when power can't lead? (2026-07-23, design call, not built)

D-313 shipped the bike POWER chart, but it renders only when power LEADS (a real terrain-binned w20 verdict). An endurance-only rider (Michael: 0 power-bin rides in 84d) never gets a bike chart — the row leads on efficiency (HR-at-power) and shows the "power trend ⓘ" explainer instead. To give those riders a chart, we'd plot the **efficiency** series (per-ride mean HR at the reference band). The wrinkle: efficiency is **lower-is-better** (less HR for the same watts = fitter), so the line goes DOWN when you improve — inverted from every other output chart (e1RM, run efficiency-index, bike power all go UP). Options: (a) plot it inverted-but-labeled; (b) plot 1/HR or an efficiency-factor so up=better; (c) leave endurance riders chart-less (the ⓘ already explains why). Michael's UX call — flagged, not built. The infrastructure is there (`hrPts` series already computed in `assemble.ts`; `TrendSparkline` already generalized).
