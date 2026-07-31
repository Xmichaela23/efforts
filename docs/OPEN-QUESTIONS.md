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

> ### ✅ CLOSED 2026-07-25 — `ad62947b`. Everything below is history.
> Filed 2026-07-19. Hit again independently as `strength_primary` in the D-322 session, where **only that
> second instance was fixed** — the entry here was left open and the root cause untouched. **Found twice,
> fixed at the root the third time.**
>
> **Three changes, and only the first is the one people reach for:**
> 1. `five_by_five` has its own `PROTOCOL_PROFILES` entry. Verified before/after across the phases:
>    a flat **2.5 / 2.5 / 2.5 / 2.5 / 2.5** became **2 / 1.5 / 1 / 2.5 / 3**.
> 2. **`resolveProfile()` no longer falls back SILENTLY.** It still falls back — throwing would brick
>    materialize over legacy rows — but it warns. **The silence was the root cause, not the missing key:**
>    it is what made a missing entry and a deliberate choice identical at every call site.
> 3. **`_shared/strength-protocol-registry.test.ts`** — the three hand-maintained lists (pickable /
>    buildable / has-a-profile) must agree, with nothing previously enforcing it. Hard-fails if a
>    *reachable* protocol has no profile; pins the two unreachable unprofiled ones rather than staying
>    permanently red.
>
> Also tracked as **Q-202 line 25** (likewise closed).

> **↪ CONFIRMED AND STILL OPEN, and it is not the only one (D-322, 2026-07-24).** The identical failure was hit
> independently for `strength_primary` ("Get Strong"), which also had no profile AND does not populate
> `config.strength_protocol` — so every such plan resolved to `durability`, a concurrent-support profile
> prescribing a flat RIR 2.5 across a block ending in 94% doubles. D-322 added `strength_primary` and
> `normalizePhaseKey`, and **deliberately did not touch `five_by_five`**, which remains exactly as described below.
> The class of bug is now proven live, not theoretical: **a protocol with no profile fails silently and looks fine.**
> Tracked as line 25 of the Q-202 ledger.


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

## Q-130 — GAP artifact on flat routes: ~18s/mi GAP-vs-raw on a flat loop → false `gap_terrain_bias='downhill'` (RESOLVED 2026-07-05, DEPLOYED)

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

## Q-131 — Familiar Routes: honest, heat-adjusted per-route performance-over-time (design filed 2026-07-06, NOT built — fresh-session build)

> **STATUS 2026-07-06 (later): SUPERSEDED by Q-132 / D-250.** This route-trend approach was BUILT + deployed, then proved structurally unsound (path-overlap route identity over-merges distances / fragments trailheads / double-matches → verdicts flip-flop). The honest version is the **segment model** (`DESIGN-segments.md`). Kept for institutional memory; do not build the route-trend version.

**Strava-adjacent, the honest version.** An athlete has ~5 routes they run/ride a lot (user 45d122e7: 17–40× each); they want "am I getting faster on my usual loop." Strava shows raw clock times (condition-blind — a cool-day PR vs a hot slog aren't comparable). Efforts' edge: **same-route removes hills** (constant), **heat/humidity adjustment removes the rest**, read as **pace-per-HR not raw time** → true fitness with the weather taken out. **Foundation BUILT** (D-248 path identity + backfill; per-run metrics; temp/humidity in `weather_data`; `efficiency_index`). **Feature scoped, NOT built** — full design: `docs/DESIGN-familiar-routes.md`.

**Core engineering (from the design):** heat-adjust pace-per-HR via **dew point** (temp+humidity, better than temp alone) with a bespoke coefficient `k` (same class as Q-127 DOMS coeffs — population default, tune against own hot/cool same-route runs), OR a per-route **regression-residual** for high-N routes. One schema add: `temp_f`/`humidity_pct`/`dew_point_f` on `route_progress_metrics` (written in compute-facts from `weather_data`). Surfaces: a **Routes list + route detail** (a route TREND is macro → its own view, per the CONSTITUTION; the session line stays familiarity-only = the doorway, D-249). Honesty gates tied to the CONSTITUTION/CANON: glass-box the adjustment, hedge (directional not precise), confidence-gated, one-source-of-truth with State.

**5 forks need Michael's ruling** (see §7 of the design): heat model (linear-now vs regression), reference condition (dew point ≤55°F?), `k` default + tuning, where the Routes view lives, rides (power-per-HR) now or phase 2. **Build order** in §8 (schema + heat primitive first — reusable regardless of UI).

*(The OTHER fresh-session build is the fatigue / `training_reaction` NUMBER — Q-127 heavy-legs two-witness + `CANON-arc-inference-model.md`. Both are separate fresh sessions.)*

## Q-132 — Segment model (the commercial-grade route-performance rebuild) — BUILT + LIVE (2026-07-07)

> **STATUS 2026-07-07: BUILT + LIVE on real data (steps 0–6; D-256/D-257).** Effort extraction (`core-effort.ts`, `metric_source` per-slice), verdict on the spine (`core-verdict.ts` + `compute-core-verdict` → `core_verdicts`, N≥8 floor + 6-month window + CI gate + the still_building/still_learning split), server surface (`workout-detail` → `session_detail_v1.segment_verdicts[]`, PLURAL), client (`RouteDoorway.tsx`, flag-driven), all registered at the 2 chokepoints (`compute-facts` + `compute-snapshot`, `dry_run` verified reaching each leaf). Match corridor tuned 30→50m on real GPS (D-257) → 23 efforts (21 in window); live verdict `still_learning`, −1.4%, CI [−11.7, 8.9], stable across recomputes. Card polish shipped (HR tap detail, brighter dots, working touch tap, legibility). **Segment is now the SECONDARY lens — Best Efforts is primary (D-258 / Q-135).** ⚠ iOS bundle NOT rebuilt (card web-only until `npm run ios`). ⚠ Q-133 peel-back now trivial (see Q-133).

> **STATUS 2026-07-06 (later): NOW BUILDING (was SPEC'D, NOT BUILT).** Schema live on prod (`route_cores` + `core_efforts`, tracked migration `20260706120000_create_core_model.sql`). Primitives built + fixtures green: `_shared/core-match.ts` (ordered path-match, 8/8), `_shared/core-detect.ts` (consensus detection, 12/12), `_shared/gps-points.ts` (loader, verified on real `gps_track` shape). `detect-cores` edge fn deployed; **one core frozen on real data** (user 45d122e7's 1.83mi home out-and-back, N=15), born-once freeze guard proven idempotent. Rulings recorded in D-254 (forks) + D-255 (consensus + calibration). **Remaining:** step 3 (effort extraction → `core_efforts`), step 4 (verdict on the spine, Law 5, N≥8 floor, reuse `routeHeadline`/`routeTrend`), step 5 (server surface reads spine verdict), step 6 (client `RouteDoorway`), step 7 (backfill + real-data verdict-stability verification — the acceptance bar). **STEP-3 REQUIREMENT (do not retrofit):** each `core_effort` must record its metric **provenance** — a flag/enum (e.g. `hr_aligned` true/false or a `metric_source`) distinguishing an effort computed from real time-aligned HR from one that degraded to raw-pace fallback (HR sparse/unaligned). Otherwise step 4 cannot tell a clean pace:HR decoupling from a "we never had HR" null and would silently mix different-confidence facts — the exact Law-2/3 fabrication gap the audits catch. Needs a `core_efforts` column add (ALTER) at step 3.


The Familiar Routes route-trend (Q-131) was built + deployed then found **structurally unsound** (D-250 — route identity over-merges distances, fragments trailheads, double-matches; verdict flip-flops on real data). The honest path forward is the **SEGMENT model** (Strava/Garmin precedent): compare a fixed sub-path every run covers, not a variable-length route. Full spec: **`docs/DESIGN-segments.md`** — 8 steps, 3 hard geospatial primitives (ordered path-match, segment detection, segment-effort extraction), reuses the read engine (`routeHeadline`/`routeTrend`) + `RouteDoorway` shell. **5 forks need Michael's ruling** (§8): (1) auto-detect "spine" vs user-defined segments [rec **auto**]; (2) reverse direction = separate segment [rec **yes**]; (3) confidence floor N≥8 [confirm]; (4) DB constraint audit + add migrations for the route tables [**none exist** in-repo]; (5) keep per-route "run N×" as the doorway [rec **yes**]. **Verification bar:** STABLE on his real data across recomputes (fixtures-green ≠ correct — the route saga proved it, §9 of the design). Build in a FRESH session (heavy, novel geospatial code; clean context beats this muddy one). Michael's primary run = out-and-back at VARIABLE lengths from a few trailheads (dry climate; heat parked, D-251).

## Q-133 — The route-trend feature is DEPLOYED but SUPERSEDED — leave or peel back? (2026-07-06, decision owed, defer to the segment build)

> **STATUS 2026-07-07: route-trend read-path is now DEAD DATA — peel-back is now TRIVIAL (still owed).** The segment build's step-5/6 (D-256) switched the client from `terrain.route`/`buildRouteReadout` to the new `session_detail_v1.segment_verdicts[]` (`SessionNarrative.tsx` consumer flipped). So the superseded route-trend readout is now **emitted-but-unread** — there is no consumer left to migrate; peel-back = delete the dead `buildRouteReadout` + `terrain.route` emission in `session-detail/build.ts`. Low-risk cleanup, do it when the segment dust settles; nothing depends on it now.

> **STATUS 2026-07-06 (later): STILL OWED — peel-back deferred again.** Ruled (D-254 fork 4) to defer the peel-back through the segment build rather than resolve it now. The superseded route-trend read-path remains **live on prod edge functions** (`compute-facts` / `analyze-running-workout` / `workout-detail`); the `RouteDoorway` client remains **local-only / unpushed**. Decision (peel read-path back to familiarity-only now vs leave until segments replace it) is to be resolved **with the step-5 segment read-path** that supersedes it. Open action — do NOT let this quietly persist past step 5.


This session **deployed the route-trend / temp-correction / 365-day-history / server-readout work to prod** on user 45d122e7's account (`compute-facts`, `analyze-running-workout`, `workout-detail`). D-250 supersedes the approach (→ segments). The deployed feature is mostly harmless (shows familiarity + a flip-floppy trend behind the doorway) but it's LIVE. **Decision owed** (defer to the segment build): leave it until segments replace it, or peel the read-path back to familiarity-only now. The client `RouteDoorway` UI is committed but **LOCAL-only** (not pushed to web/Netlify, iOS not rebuilt) — the trend UI is only on Michael's local dev, not on device. Note also: widened route history 90d→365d in `fact-packet/build.ts` is live and affects the AI-summary route context too.

## Q-134 — Governance lint/CI gate for Laws 1/4/5 (FILED, not built) (2026-07-06)

The durable answer to "can the constitution actually govern, or is it a friendly dictator?" Today Laws 1/4/5 (one source of truth / surfaces render / born on the spine) are enforced by **human audit, after the fact** — which is why the route-trend could mint its verdict in `build.ts` and *ship*, caught only post-deploy. Law 6 (fixtures) is the one law with real machinery. **The fix is to convert the constitution from a document into a compiler:** a CI check that (a) greps surface files (`session-detail/build.ts`, `src/components/**`) for verdict-minting signatures; (b) asserts client payload contract types carry no raw-metric fields (the D-253 payload-keys guard, generalized); (c) fails when a new read-limb bypasses the spine. This is the provenance-guard pattern already used for data-fabrication, generalized to **verdict-governance**. **Open design question owed:** what is the *detectable signature* of "minting a verdict"? (a computed comparison/threshold reaching a user-facing string in a surface file? a type carrying `ci`/`slope`/raw arrays across the client seam?) That question is real work with its own answers — **deferred to its own session**; the segment build (Q-132 / D-250) ships under governance-by-construction (D-253) in the meantime, which disarms *this* feature's surfaces without the general gate. When built, this gate is what makes the writ run without depending on a well-behaved developer.

## Q-135 — Best Efforts as the PRIMARY (cross-sport) fitness lens; segments demoted to secondary (2026-07-07, DIRECTION SET + spec written, NOT built)

The pivot from the segment feature (D-258): the fixed-route segment is correct but narrow (fires only on true route repeats), and the primary user runs an AREA, not routes — so the incumbent answer for variable running (Strava/Garmin **Best Efforts**: fastest pace at benchmark distances / power at durations within any run) becomes the PRIMARY lens; segments stay secondary. Metric = PACE / SPEED — GAP-adjusted for hills, **NO efficiency/HR** (ruled 2026-07-07; same-effort is murky on a peak effort — control effort by reading the PR frontier instead). Two lenses: raw Pace + GAP pace. **Cross-sport, one engine per-sport metric:** run/swim = best pace at distance (run GAP'd); bike = best power at duration (no GAP — power is terrain-proof). Two of three hard bricks already exist (`calculateBestRunEfforts` finder + GAP physics; `calculatePowerCurve` + `w20`/CTL/ATL/TSB on the spine); the missing brick (spine aggregation/trend) mirrors the just-built `compute-core-verdict`. **Full spec: `docs/DESIGN-best-efforts.md`** (self-contained fresh-session hand-off). **§4 forks owed Michael's rulings BEFORE building** — metric (GAP+HR), per-sport distances/durations, window, source-of-truth, UI hierarchy, and **which sport first (rec: bike — cleanest/most-built)**. NOT started — build in a fresh session. Also banked: the three aerobic dimensions (peak output = best efforts; economy = efficiency/same-effort, already in State + segment; durability = decoupling, already State's run verdict); efficiency-as-its-own-trend is a candidate third lens but must pin to a fixed distance to control the heat/effort confound.

## Q-136 — coach reads `weekIntent` from `plan_contract_v1.phase_by_week`, which combined plans never write → Gate 2 is INERT for ALL multi-sport athletes (2026-07-07 FILED; 2026-07-08 DIAGNOSED — read-time fix owed)

> ✅ **CLOSED — FIXED BY D-261, the same day it was diagnosed. This header was never updated.**
> `coach/index.ts:652-665` — `weekIntentFromContract` now calls `resolvePlanPhaseDetailed(planConfig, weekIndex)`, and the comment at `:654` cites "(Q-136 Drop A)" by name. The three-path resolver (`phase_by_week` → `config.phases` → `config.phase_structure.phases`) is live. **Gate 2 is no longer inert.** Everything below is history. *(Back-annotated 2026-07-13.)*

**Symptom:** on the LIVE path `weekIntent` resolves to `'unknown'` even in WK1 of an active plan (receipt: user 45d122e7, `coach_cache.payload` → `week_intent = unknown`, `week.index = 1`). Consequence for D-259: **Gate 2** (build/baseline plan-phase tolerance that would read WK1 ACWR 1.40 as `on_target`) fires ONLY when `weekIntent ∈ {build, baseline}`, so it does nothing. This is fail-safe BY DESIGN (unknown keeps strict bands, never over-softens), and **Gate 1 alone still fixes the reported symptom** (false running-`'high'` → `'elevated'`) — but the "reads `optimal` in a build week" benefit is unrealized.

**ROOT CAUSE (Drop A, operative — diagnosed 2026-07-08, no code):** coach's `weekIntentFromContract` (`coach/index.ts:645`) reads phase ONLY from `planConfig.plan_contract_v1.phase_by_week[weekIndex-1]`. **`generate-combined-plan` never writes that array** — it writes the phase structure to **`config.phases`** instead (`generate-combined-plan/index.ts:614`, shape `[{ name, start_week, primary_goal_id, … }]`); its `plan_contract_v1` object (line 568) has no `phase_by_week`. `weekIndex` is fine (chip shows WK 1) — the field is simply absent, so `intent` stays `'unknown'`. Standalone `generate-run-plan` (`:590`) and `generate-triathlon-plan` (`:275`) DO write `phase_by_week`, so this gap is **specific to combined/multi-sport plans → Gate 2 is inert for EVERY multi-sport athlete, not just the primary user.**

**The data is resolvable read-time — proven:** `arc-context.ts:679` already handles exactly this ("D-039 Fix 3: fallback to `config.phases` when `plan_contract_v1.phase_by_week` is missing" — pick the last phase whose `start_week ≤ weekIndex`). The Arc resolves the phase correctly today; coach just never got the same fallback. **Fix direction (when greenlit — NOT yet):** port that fallback into `weekIntentFromContract` (~15 lines: last `start_week ≤ weekIndex` from `config.phases`, then the existing name→intent map at `:651-655`). **Read-time → fixes every existing combined plan instantly, no regeneration** (strictly better than making the generator emit `phase_by_week`, which would only help future plans). When landed, the existing D-259 `build` fixtures become the live path with no test change.

**Maturity/weight orthogonality (per the receipt's "learning — 5 sessions" on rides/swims):** the ride's `0.6` fatigue weight ("notable running impact") is a STATIC constant — it is not "in a learning phase." What's "learning" is the discipline *profile's* maturity (enough 28-day history for its OWN per-discipline ACWR to be trustworthy) — a separate axis. Neither Gate 1 (`runNotOverPlan`, reads only `runLoadPct`) nor Gate 2 (reads `weekIntent`/total ACWR/readiness/body signals) touches per-discipline maturity or the fatigue weights — **fully orthogonal.** Maturity interacts with exactly one OTHER reconciler branch, the cross-training→'high' escalation (`crossTrainingEstablished`, which excludes only `'building'`, so `'learning'` counts) — and that branch was **moot for this receipt** (gated off by `running_acwr 1.52 ≥ 1.1`). The composition-blindness of interest lives in the static weight (load-system extension), not the maturity flag. See [Drop B → Q-138] for the separate dead-stub column.

## Q-137 — `'rest now'` (ACWR > 1.5) is an unconditional PRESCRIPTION from a composition-blind subsystem, contradicting the reconciled classifier (2026-07-08, FILED — direction set, do NOT patch the gauge; expected closed by the intensity-binned load work)

> ✅ **CLOSED for the CLIENT surface by D-301 (2026-07-18).** The last live spot that rendered the raw-ratio prescription — `CoachWeekTab.SnapshotLoadBar`, which emitted `back off`/`rest now` off the bare ACWR — now reads the reconciled verdict (`statusVolumeLabel`): `elevated` → "a bit high", only corroborated `high` → "pull back". The dead `acwrVolumeLabel`/`acwrZone`/`getACWRStatus` copies were deleted. The gauge no longer prescribes anywhere a user sees. (The deeper server-side intensity-binned load work Q-137 anticipated is a separate, still-open track — this closed the client symptom, not that.) Everything below is history.

Observed live on user 45d122e7 (WK1, 2026-07-08): the raw gauge showed `ACWR 1.6 · spike · rest now` → "This week: **Load very high**", while the **reconciled classifier** (D-259) called the same week **`elevated`** — because the reconciler sees composition (cross-training-dominated), readiness (not fatigued), and body signals (handling well), and the gauge sees none of that. The gauge's `'rest now'` band (`acwrVolumeLabel`/`planAwareVolumeLabel`, ACWR > 1.5) is a **hard redline that is never softened** — `planAwareVolumeLabel` only softens the `'back off'` band (1.3–1.5), and only in a build week. So a low-impact cross-training week on a thin WK1 base reads "Load very high" as an unconditional prescription, over the head of the subsystem that actually understands the week.

**Direction (ruled 2026-07-08):** the **gauge shows the NUMBER + the band WORD only** (honest raw ACWR — the Option-b dual read stays); **prescription language comes ONLY from the reconciled classifier** (the one surface that sees composition + readiness + body signals). Do NOT extend the redline with its own composition/thin-base leniency (rejected — that builds composition-awareness twice). **Expected to be CLOSED by the load-system extension** (intensity-binned per-domain load feeding the reconciler as the sole verdict authority — doc owed by Michael, D-259 is the reconciler foundation it builds on). **Also note:** the thin-base WK1 inflation is partly self-resolving — as the chronic base accumulates past the early-block ramp, the same absolute week stops reading as a spike. Verification when the load-system work lands: this exact WK1 snapshot should read a non-redline prescription while the gauge still honestly prints the raw ratio.

## Q-138 — `compute-snapshot.plan_phase` is a dead stub: written `null`, never reassigned, and no live consumer reads it (2026-07-08, FILED — low-priority cleanup, decide populate-or-remove later)

> ✅ **CLOSED — the "populate-or-remove" decision was MADE and SHIPPED (D-261): populate.**
> `compute-snapshot/index.ts:557-562` — the comment reads "D-261 / Q-138: populate plan_phase from the single resolver (was a dead…)", and `planPhase = resolvePlanPhase(planRow?.config ?? null, planWeekNumber)`. Persisted at `:806`. **It is not a stub any more.** *(Back-annotated 2026-07-13.)*

Drop B from the Q-136 trace, logged separately because it's a distinct cleanup with its own lifecycle. `compute-snapshot/index.ts:539` declares `let planPhase: string | null = null` and persists it at `:783` (`plan_phase: planPhase`), but **it is never reassigned** — so `athlete_snapshot.plan_phase` is `null` on every row (matches the `09-db-schema.md` §4 audit finding). Critically, this is **NOT** the cause of Gate 2 being inert: coach does not read this column — it re-derives `weekIntent` live from the plan config (see [[Q-136]] Drop A). So Drop B has no current functional impact on the load-status path; it's a latent trap only for any future consumer that trusts the column. **Decision owed (later, low priority):** either populate it in `compute-snapshot` (mirror the arc-context `config.phases` resolution so the persisted column matches coach's live `weekIntent`) OR drop the column to remove the trap. No urgency; revisit alongside the Q-136 read-time fix so both phase-resolution paths use one shared resolver rather than diverging again.

## Q-139 — Strength-led blocks resolve a phase but route lossily through an endurance intent model; strength progression may need its own load tolerance (2026-07-08, FILED — two-problem seam, partially touched by Item 2)

Surfaced wiring D-261: the primary user's `Get stronger` (`strength_primary_v1`) plan resolves its phase correctly now (`Base`/`Power`/`Deload`/`Peak`/`Retest` via `config.phase_structure.phases`), but those names route through `phaseNameToWeekIntent`, which is endurance-shaped. **This is really TWO problems — flagging the seam so later work doesn't conflate them:**

1. **Phase NAME mapping (lossy).** `Base → baseline` and `Deload → recovery` are honest; but `Power`/`Peak`/`Retest` have no clean endurance analog. D-261 routes them to the `'unknown'` fail-safe default (strict bands) rather than inventing a mapping — safe, but it means a strength Power/Retest week gets no plan-phase leniency at all. Nothing yet addresses this beyond the fail-safe.

2. **Load TOLERANCE (borrowed, not modelled).** Even where the name maps (`Base → baseline`), Gate 2 hands strength blocks the **endurance build-band** tolerance (`build_optimal_max 1.5`). A heavy strength block should tolerate higher acute load without reading as overload, but there's no reason its tolerance curve equals endurance's — it's borrowed, not derived. This is the D-259 theme again (endurance-shaped reasoning applied to a non-endurance athlete). **Item 2 (intensity-binned per-domain load) touches this** — per-domain strength ratios become reconciler inputs — but does not fully close it: the *band* a strength block earns is still an open modelling question.

**Log only for now** — informs the load-system extension doc. Don't engineer a fake phase or a bespoke strength band before Item 2's per-domain inputs exist; revisit tolerance (problem 2) once they do, and problem 1 (naming) separately if strength plans grow phase names worth mapping.

**Addendum (2026-07-08, demonstrated live) — plan-type-blind adherence, a THIRD facet:** the active plan is `strength_primary_v1` — **4 strength / 3 runs**, and the plan's own description says "*This is a strength plan — you won't want to marathon-train on it.*" Yet the off-plan branch graded the skipped Monday run with **run-plan severity** ("get back on schedule") while the plan's **primary objective** (strength: 3 sessions, volume up, e1RM improving) was being fully executed. The adherence logic is phase-aware (post-D-261) but **plan-TYPE-blind**: a skipped run on `strength_primary_v1` is a different-severity event than a skipped run on a marathon build, and the system can't tell them apart. **Item 2/3's verdicts need plan-type as a FRAME, not just phase** — the plan's session ratio and primary discipline should set the *weight* of any adherence fact (a run miss on a strength plan is minor; on a run plan it's the point). This is a third facet of Q-139's root (endurance-shaped reasoning on a non-endurance athlete), alongside the phase-name mapping (facet 1) and the borrowed tolerance band (facet 2). **(Item 4 copy note for someday):** the honest banner for this exact week was *"aerobic load holding via bike/swim; run-specific load at zero for N days"* — facts about what's held and what's deferred, **no inferred rationale, no prescription**. D-262 removed the contradictory prescription; the plan-type frame is what would let the *fact itself* be weighted correctly. Root fix: Item 2/3.

## Q-140 — `load_status` is run-centric: a deliberate discipline substitution reads as BOTH overload and deficit — the false-*under* mirror of D-259's false-*over* (2026-07-08, FILED — interim guard D-262, root fix Item 2)

`load_status` is computed primarily from `run_only_week_load_pct` (running actual vs planned running). So when a hybrid/strength athlete deliberately swaps planned runs for cross-training (bike/swim), the SAME week reads as: (1) **overload** — the all-discipline gauge spikes (ACWR 1.58 · "rest now") because the cross-training load is real; and (2) **deficit** — `load_status = under` → "off plan, add more" because running is −100% vs plan. Two opposite verdicts from one week. This is the **exact mirror of D-259**: Gate 1 killed the false-*over* ("you're overloaded" from a swap); this is the false-*under* ("you're under-training" from the same swap). **Same root, opposite sign** — endurance/run-shaped reasoning applied to an athlete who substituted disciplines.

**Interim:** D-262 coherence guard stops the contradictory "add more" prescription (no add-more while ACWR high) — but that's a guard against the *symptom*, not the cause. **Root fix: Item 2 (intensity-binned per-domain load)** — when the reconciler sees "running behind plan BUT total/cross-training load carried," it produces ONE coherent verdict ("you swapped running for cross-training — running's behind, but you're carrying the load") instead of two opposite ones, and `load_status` stops being run-myopic. Closes when Item 2's per-domain ratios feed the reconciler.

## Q-141 — Entire cardio pipeline routes through Strava despite live Garmin OAuth: single-vendor dependency on the load system's input layer (2026-07-08, FILED — assess Garmin as primary/redundant)

The Item 2 HR audit (user 45d122e7) found ALL cardio — run/ride/swim, 35 sessions over 8 weeks — ingests via `source = 'strava'`, even though the app runs a live **Garmin OAuth** proxy (`npm run dev` port 8080). So the load system's entire input layer (HR, power, pace, time-series) depends on a **single vendor**. Risk: Strava API approval is still **pending** (applied Apr 2026), and Strava's ToS **constrains raw-data flow** (retention / redistribution limits). If Strava access lapses or tightens, the load system loses its substrate — right as Items 1–3 make that substrate load-bearing. **Assess Garmin as a primary or redundant source:** the OAuth already exists and `ingest-activity` already handles `provider = 'garmin'` (separate write path, lines ~810–1040), so the plumbing is partly there. Log only — not Item 2's scope, but it's the input layer every load-system item builds on, so it's a standing risk to the whole arc, not a feature gap.

## Q-142 — ACWR NUMBER is single-source, but the ratio→BAND-LABEL mapping is duplicated 3× (client + server), synced by a comment — a D-264 gap (2026-07-08, FILED — collapse to one server-minted band)

SSoT verification (D-264) on the LOAD/ACWR metric across screens: **the number is clean** — State (`StateTab`) and Home (`WorkoutCalendar → LoadBar`) both read `weekly_state_v1.load.acwr` from the shared coach payload; neither re-computes the ratio. Performance/readiness trends are likewise server-computed and read by both tabs. **But the ratio→band classification is re-implemented in ≥3 places** with the same `0.8/1.3/1.5` boundaries: `src/lib/load-headline.ts` (`build more/balanced/back off/rest now`), `src/components/ui/charts.tsx:228` (`Under-reached/Optimal/Overreaching/Danger` — usage unclear, possibly dead, but a latent duplicate), and server `_shared/acwr-state.ts` `getAcwrStatus` (plan-aware). They're kept aligned **by a hand-written comment** (`load-headline.ts:48`: "Boundaries MUST match…") — the exact drift risk D-264 forbids. Per THE LAW (D-260), the band/verdict is minted ONCE (server) and read; the client should consume a server-minted band label, not re-derive it. **Fix direction:** server emits the band word alongside `load.acwr` in the payload; client renders it; the two client mappings (`load-headline` band words, `charts.tsx` zone) collapse onto it (or are deleted if dead). Not Item 2 scope, but Item 2 (per-domain bands) must NOT add a 4th mapping — it emits its bands server-side from day one. Log + collapse.

## Q-143 — `hr_quality` is re-derived from full HR series on every coach call: compute once at ingest, store, consume (2026-07-08, FILED — D-264-consistent optimization)

D-263 bs3 wiring adds `sensor_data` (full HR time-series) to coach's 28-day rolling fetch (~35 sessions/call) so `computePerDomainLoad` → `assessHrQuality` can derive dropout% per session. That's **re-derivation per request** — the same series parsed on every coach load, for a value that never changes once the workout is ingested. **Direction (D-264):** compute `hr_quality` (or just `dropout_pct` + `valid_points`) ONCE at ingest / compute-facts, store it on the workout (or `workout_facts`), and have coach consume the stored value — then the heavy `sensor_data` column drops out of the coach fetch entirely. One canonical calculation, computed at write time, read cheaply. **Fine as-is for now** (correctness first; the cost is a per-call parse, not wrong output); log so the optimization isn't lost. Ties to Item 1 (TRIMP also wants clean per-session HR at ingest).

## Q-145 — The easy/hard binning SEAM (`CARDIO_HARD_EASY_IF` 0.80) clips genuinely-easy high-Z2 runs into `hard_cardio` — a threshold-PLACEMENT problem, not anchor calibration (2026-07-08 filed; 2026-07-09 CORRECTED by Michael)

**CORRECTION (2026-07-09) — the anchor is NOT wrong.** Baselines screen: **LTHR 151** (learned), **Max HR 174**. The primary user's easy runs at 135–138 bpm are **78–79% of LTHR 151 = high-Z2 aerobic on his own zones** (Z2 = 128–136). So LTHR-151 is correctly calibrated; the earlier "anchor miscalibrated" framing was wrong. **The real problem is the SEAM placement:** `inferIntensityFromPerformance` maps 138/151 = 0.91 → IF 0.88, and `CARDIO_HARD_EASY_IF = 0.80` calls IF ≥ 0.80 hard — so a genuinely-easy run living at the *top of Z2* crosses the easy/hard seam and lands in `hard_cardio`. A 138 bpm easy run sitting right on the 0.80 seam is the exhibit. **Fix direction (Item 2 follow-up):** raise/re-place the easy/hard seam so high-Z2 aerobic stays easy — the seam should sit at the aerobic|threshold boundary (~tempo, Z3), not clip the top of Z2. Consider anchoring the seam to the athlete's zone model (%LTHR or %maxHR) rather than the D-238 IF ladder's absolute 0.80. **Also note the anchor-confidence angle survives (see Q-146):** several anchors are thin/manual, and a downstream bin/verdict should carry that confidence — but that's provenance, distinct from this seam-placement bug. Live impact: `hard_cardio` acute 58 (his Sunday run) in the D-263 receipt; only 15% share so it didn't break attribution, but it's a wrong bin.

## Q-146 — Anchor-confidence provenance: several intensity anchors are thin/manual; Key-2 verdicts (Item 3) must carry the anchor's confidence — ship-low-earn-up applied to anchors (2026-07-09, FILED — design constraint for Item 3)

The intensity anchors that Key-2 (decoupling) and Item-2 binning normalise to are **not uniformly trustworthy** on the primary user's Training Baselines: run **threshold pace 10:05 "learned from 3 runs"** (thin), **swim CSS 2:30/100 entered MANUALLY** (unvalidated by data), **FTP 176 manual = auto** (agrees, higher confidence), **LTHR 151 learned** (Q-145: correctly placed). A decoupling verdict built on a thin anchor (e.g. run decoupling vs a 3-run threshold pace) is itself low-confidence, and **must say so** — a confident-looking Pa:Hr number resting on a shaky reference is the D-242 "score that lies" one level up. **Design constraint for Item 3:** every Key-2 verdict carries the confidence of the anchor(s) it used; a low-confidence anchor caps the verdict's confidence and widens/softens its band. Ship-low-earn-up, applied to anchors — an anchor earns higher confidence as observed data validates it. Provenance the Item-4 ⓘ surfaces ("this read leans on a swim pace you set by hand, not measured"). Related but distinct from Q-145 (seam placement) — this is about the anchor's *confidence*, not its *value*.

## Q-147 — Swim CSS anchor EXISTS (`swimPace100 = "2:30"`) — Item 2's "swim unanchored → always easy" (amendment 2) was based on a false premise; swim IS pace-classifiable (2026-07-09, FILED — Item 2 follow-up)

Correction to D-263 Item 2: the swim easy/hard binning was set to "always `easy_cardio`, `bin_signal: pace_unanchored`" on the belief that no swim threshold/CSS reference existed. **It does** — `performance_numbers.swimPace100 = "2:30"` (per-100), confirmed on the Training Baselines screen and in `09-db-schema.md §3`. So swims CAN classify hard/easy by pace against the 2:30 CSS, exactly like run→LTHR and ride→FTP. **Caveat (ties to Q-146):** the 2:30 CSS is **manually entered**, low-confidence — so a swim hard/easy bin off it should carry that anchor confidence, and (per Q-145's lesson) the swim easy/hard seam needs careful placement too. **Follow-up:** revisit the swim slice — replace the `pace_unanchored → always easy` fallback with CSS-based classification (2:30 anchor), gated on anchor confidence. Not urgent (swims were landing in `easy_cardio` anyway, which is usually right for his training), but the premise is now known-false and shouldn't calcify.

## Q-148 — Full readiness-model rework: apply the D-266 weighted doctrine at the SOURCE, de-collinear the decoupling family, and purge the residual ACWR/demoted nudges on the DESCRIBE band (2026-07-09, FILED — deferred by explicit scope call, NOT missed)

D-266 closed the **prescriptive** ('high' / "back off") leak completely — the two-key cap backstops every uncorroborated 'high'. It did so with two surgical edits (`absorption.ts` gate + `computeSafetyFloor`), deliberately NOT touching the readiness tree (`coach/index.ts:2668-2703`) or the response-model assessment (`_shared/response-model/weekly.ts:347-413`). Three known-and-deferred residuals live in those untouched surfaces:

1. **Collinear double-count in `signals_concerning`** (`weekly.ts:349-357`): the pool counts **HR drift AND cardiac efficiency as two independent signals when they're one decoupling phenomenon**. A single bad steady run can flip both → `concerning >= 2` → label `overreaching` → readiness `overreached`, with RPE flat. Post-D-266 this can no longer escalate the load *verdict* (the floor now requires `primaryDeclining`), but the readiness *label itself* still over-fires for its own display/copy. Fix: collapse the decoupling family to one signal, or weight it.
2. **The readiness tree escalates its own labels on single demoted signals and on ACWR** (`coach:2685` ACWR + one demoted → `fatigued`; `coach:2691` ACWR-ramping-fast ALONE → `fatigued`; `coach:2700` any one concerning → `fatigued`). D-266 severed these from load escalation at the floor, but the tree still *produces* the labels. The weighted doctrine should apply at the source so readiness itself is honest.
3. **DESCRIBE-band residual — the conscious scope call (write it down so the next audit sees it was chosen, not overlooked).** The two-key cap only touches 'high'; it does NOT cap 'elevated'. So `reconcileLoadStatus`'s internal ladder can still nudge the **descriptive 'elevated'** band from demoted signals and — the tension worth flagging against D-260's absolute "ACWR never escalates through *any* path" — from ACWR: `ACWR-ramping → readiness fatigued → raise('elevated')` (`load-status-reconcile.ts:191-194`) and total-ACWR → `raise('elevated')` directly (`:210-212`). This was **judged acceptable and deferred on 2026-07-09** because 'elevated' is by-design the honest describe band the cap falls back *to* (D-265), not a prescription — so the ACWR-nudge here is a describe-layer heads-up, not an escalation with teeth. It is recorded here explicitly so a future audit understands the describe-band ACWR influence is a **known scope boundary of D-266, not a missed leak**. If the absolute reading of D-260 is later preferred, purge ACWR/demoted `raise('elevated')` calls from the internal ladder as part of this rework.

**Also folds in the D-266 parked tuning call:** a lone declining RPE trend currently DESCRIBES but does not floor-escalate (conservative "one witness isn't agreement"); revisit whether it should solo-escalate once **universal per-session RPE** lands (the #1 sRPE-capture dependency) — with RPE captured on every session the primary leg is always available, which also removes the "goes quiet on strength-only weeks" cost D-266 accepts. **Big blast radius** (the readiness tree is inside the 5k-line `@ts-nocheck` coach file); deferred deliberately, not urgent.

## Q-149 — D-268 Phase 4: `generate-training-context` is still plan-blind (run-only), + the `arc-context` `discipline` re-derivation — deferred to a fresh session (2026-07-09, FILED — the remaining plan-awareness surface)

D-268 (plan-primary is a system invariant) shipped Phases 1-3 + 5 — the entire **visible State card** now reads the plan, not running. **Phase 4 is the one remaining surface and is deferred to a fresh session** (this one was long; Phase 4 is a big separate function and rushing it risks the race/goal logic). It is fully specified in `docs/DESIGN-D268-plan-aware-everywhere.md` §3 (surface #5) + §5 (Phase 4) + the handoff doc `docs/HANDOFF-2026-07-09-load-plan-awareness.md`.

**What's still run-blind (`generate-training-context/index.ts`):** recent-form + key-session-audit queries filter `type in (run,running)` (`:728`, `:830`, `:1438`); `next_key_session.sport` defaults `'run'` (`:1863`/`:1865`); gap-scan copy hardcodes "Add N more run session(s)" (`:1131`). NOT on the State card — it feeds the AI narrative, the arc, and goal-prediction. **Mitigated:** D-268 Phase 3 already pushes the plan-primary fact into the LLM narrative, so the biggest prose risk is covered; Phase 4 closes the next-action defaults + the run-only inputs. **Fix pattern:** import the shared `resolvePlanPrimary` (single source), default the next-action off `planPrimary` not `'run'`, make the recent-form inputs discipline-aware. Endurance/tri: zero regression.

**Also in scope (D-268 §7 cleanup):** `arc-context.ts:683` re-derives its own `discipline` (`config.discipline || config.sport || plan_type`) independently of `resolvePlanPrimary` — a second, divergent notion of "what discipline is this plan" (D-264 single-source concern). Collapse to one.

## Q-150 — Foundation-readiness: scale + security + ops hardening backlog (2026-07-10, FILED — umbrella; blockers B1/B4 gate a 2nd paying user)

A 3-way architecture audit found the domain logic + target pattern (run + `session_detail_v1`) solid, but the layer around them not commercial-ready. Full severity-ranked list + evidence: **`docs/FOUNDATION-READINESS.md`**. Pre-launch / one user → nothing on fire today; do NOT over-alarm. Tracked items:
- **BLOCKERS (before a 2nd paying account):** B1 — ~47 edge fns take `user_id` from the request body under service-role (~24 `verify_jwt=false`) → cross-user data exposure; the JWT-derived pattern exists (`save-location`) in only ~26 of ~90 fns. B4 — no error sink/monitoring; a broken user compute is invisible.
- **Scale (~1k users):** S1 coach_cache invalidation race (stale State ≤24h); S2 `useStateTrends` recomputes ~10 queries client-side (== the dumb-client cohesion fix, first mission); S3 ingest fan-out no queue/retry/DLQ; S4 getArcContext re-invoked 2–3×/workout; S5 `route_progress_metrics` index (verify).
- **Serious/cleanup:** B2 hardcoded anon key; B3 silent sync death + Strava token-rotation bug; B6 workload `??0` score-that-lies; B7 failure illegible to user; B8–B13 (rate-limit, Garmin token-in-URL, `weekly_workload` RLS, migrations dir, `backfill-facts` unguarded).
Cross-ref (already tracked): Q-105/Q-106 (strength fork), Q-141 (single-vendor), D-186/D-194 (dumb-client), D-140–143 (readiness dual-write), Q-054/Q-057 (route_progress data).

## Q-151 — Intentional exercise substitution is read as skip + unplanned (a "score-that-lies" + a customization gap) (2026-07-10, FILED — design not built; Michael wants first-class swap/customization)

**Repro (Michael, on device 2026-07-10):** he intentionally swapped the planned **3× Front Squat** (5 reps @ 65 lb, planned vol 975) for **5× Hip Thrust** (5 reps @ 95–110 lb, +1,700 vol). The workout detail shows Front Squat as **−975 lb red "skipped"** AND Hip Thrust as **+1,700 unplanned** — two contradictory stories for one deliberate choice. Lower-Body execution still reads 93% (the hip-thrust volume IS credited — banner: "Skipped Front Squat — counts in full"), but the red "skipped" reads as a failure at something he chose to replace. That is the score-that-lies in miniature (CANON §0 / D-242 class): a deliberate substitution presented as a miss + a bonus.

**Design position (three layers, in order):**
1. **Declared beats inferred (the customization path Michael wants).** A first-class "swap this exercise" action — pick a substitute (ideally pattern/muscle-matched suggestions). Once declared it is a **substitution**, not a skip: no red −975, volume counts, done. (Today's banner points to "Adjust on the State tab" but frames it as scaling weight, not swapping a movement.)
2. **Infer as a backup, labelled as a guess.** Same session + same strength focus (the `classifyStrengthFocus` the cards/coach already share) + a planned lift missing + an unplanned lift present → "looks like you swapped these," shown as a confirmable inference, never asserted (measured vs inferred never wear the same clothes, Law 2).
3. **Stimulus honesty (the differentiator — nobody ships it).** Tier the swap by quality: **like-for-like** (same movement pattern + primary muscle — e.g. DB bench for BB bench) flows into the same trend, no fuss; **different-pattern** (this case: front squat = squat pattern → hip thrust = hip-hinge/glute) is a real change — credit the volume in full, but say the truth: "your squat pattern got no work today, and your squat trend has no new data point." Protects D-270: the swap must NOT read as the squat *declining* — it simply wasn't trained.

**Field scan (2026-07-10):** Fitbod — tap "substitute," suggests same-**muscle-group** alternatives, the sub flows into the **same progression path** (continuity, but blurs specifics); RP Hypertrophy — free mid-cycle swap for equipment/injury, big filtered alternatives library ("maintaining training continuity"). The matching logic the field uses = **movement pattern (squat/hinge/push/pull) + primary muscle**; by that rule front squat→hip thrust is NOT a clean sub (squat vs hinge). None ship the stimulus-honesty layer — that's Efforts' opening.

**Cross-ref:** D-270 (per-lift trend — a swap must not fake a squat decline), `session_detail_v1` execution/adherence (`build.ts` — where "skipped" vs "substituted" is decided), `WORKORDER-deviation-reason.md`, TARGET-ARCHITECTURE steerable plans (recurring swap → plan edit), CANON §0 (score-that-lies) + Law 2 (declared vs inferred). Repro screenshots in this session.

## Q-152 — `resolveCurrentFtp` has no freshness guard: a stale confident learned FTP beats a FRESH typed value (2026-07-10, FILED — resolver gap surfaced during FTP fracture #2 cleanup)

`resolveCurrentFtp` (`src/lib/resolve-current-ftp.ts:62-82`) is learned-first: `learned (≥medium conf) > manual > learned-low`. Its ONLY guard is the confidence tier — **no freshness/recency check.** So if an athlete does an actual FTP test today and TYPES the new number, but the app holds an old medium/high `ride_ftp_estimated` from months ago, the resolver **ignores the fresh typed value** and every surface uses the stale learned one. A freshly *measured* number should beat a stale *estimated* one.

**Why it matters:** this is the FTP analogue of the strength "typed wins" honesty (D-231) — except FTP is learned-first, so the failure mode is inverted: instead of typed silently overriding learned, *stale learned silently overrides fresh typed*. Correct for any athlete requires the resolver to weigh **recency**, not just confidence. This is the "living baselines" nuance the north star calls for (TARGET-ARCHITECTURE §Living baselines: the resolver decides how much live leads, per anchor — freshness is part of that decision).

**Design owed:** add a freshness dimension to the resolver — e.g. a typed value entered/updated more recently than the learned estimate's `as_of` wins (or at least ties-break to typed); learned only leads when it's both confident AND not stale relative to the typed entry. Needs a `last_updated`/`as_of` on both the typed FTP and the learned estimate to compare. Verify with synthetic-athlete fixtures (user-agnostic), not one account.

**Cross-ref:** D-231 (strength typed-wins — the mirror), TARGET-ARCHITECTURE living baselines, TRUTH-MAP fracture #2 (the FTP convergence this surfaced during), `resolve-current-ftp.ts` + its 8 tests (freshness case not yet covered).

## Q-153 — Residual FTP display-label bypasses: normalizer + get-week still read typed FTP raw (2026-07-10, FILED — deferred, disproportionate to value)

FTP fracture #2 is closed for everything that computes a verdict or bakes a real watt target (analyzer, compute-facts, coach, Baselines, Athletic Record, materialize-plan, AllPlansInterface). Two **display-label** sites still read `performance_numbers.ftp` raw — deferred because the fix is disproportionate to the value (cosmetic, learned-FTP-only drift; the executed watts are already resolver-correct via materialize-plan):

- **`src/services/plans/normalizer.ts` (`normalizeStructuredSession`, ~:897/:934)** — labels %FTP→watts on structured-session previews. Its callers pass only `{ performanceNumbers: pn }` (`PlannedWorkoutSummary.tsx:229/323`), so routing through `resolveCurrentFtp` requires threading `learned_fitness` through the `Baselines` type + PlannedWorkoutSummary + its render callers (multi-hop plumbing) for a cosmetic label.
- **`supabase/functions/get-week/index.ts:436`** — raw-FTP transitional FALLBACK that fills `power_range` only for rows MISSING it; materialize-plan bakes `power_range` via the resolver, so this rarely fires. `get-week` is `@ts-nocheck` and the calendar authority (higher edit risk). Route through the resolver (get-week can fetch `learned_fitness`) when next touching that file.

**Impact if left:** a rider with a confident learned FTP that differs from typed could see a structured-session preview LABEL (or an un-baked calendar-row fallback) in typed-derived watts while the executed session uses learned-derived watts. Cosmetic; the real target is correct.

**Cross-ref:** TRUTH-MAP fracture #2, `resolveCurrentFtp` (8 tests), the closed sites (this session's FTP commits). Do these when the surrounding files are touched for another reason.

## Q-154 — Import dates a workout off the PROVIDER's local time, not the USER's — an activity can land on the adjacent local day (2026-07-10, REAL BUG, root-caused, NOT fixed)

**Symptom (user-confirmed, cost hours this session):** a ride that happened on the user's local **7/7** was filed on **7/8**. Not a display artifact — the stored `workouts.date` is wrong for where/when the user actually rode.

**Mechanism:** `ingest-activity` `extractStravaLocalDate` (`:29-46`) and `import-strava-history` (`:585`) derive the calendar day by splitting the date portion straight out of Strava's **`start_date_local`** — i.e., they **trust the provider's idea of the user's local time**. Strava computes `start_date_local` from the *activity's own timezone*; when that timezone disagrees with the user's home timezone (travel, stale Strava tz, or an activity started near local midnight in the provider's tz), the workout lands on the day next to the one the user expects. The `start_date` (UTC) fallback is even commented "may be off by a day."

**Compounding UX trap (also filed here):** delete-locally-and-reimport **silently does nothing** in this case — the workout's `strava_activity_id` still exists (under the "wrong" date), so `import-strava-history:761` skips it as already-present. The toast reads "No new activities to import (N skipped)" with **no error**. This is what made the ride look "lost."

**Fix direction (what the user asked for):** the client should send the user's **device timezone** (IANA id / offset) with the import; derive the day from UTC `start_date` in *that* timezone, not from the provider's `start_date_local`. **Decision to make first:** a genuinely-traveled activity would then file under the user's *home* day rather than the activity's local day — accept (user wants own-tz consistency) or special-case by whether the activity's tz is trusted. **Verify before building:** capture the ride's raw `start_date` vs `start_date_local` to byte-confirm the flip (not captured this session).

**Cross-ref:** the delete/reimport skip guard (`import-strava-history:761`); ENGINE-STATE "Known broken."

## Q-155 — `adapt-plan` may be largely non-functional — verify it does anything, then fix-or-remove (2026-07-10, FILED)

Michael flagged that `adapt-plan` "never really worked." It runs on ingest (`action=auto`, safe-as-no-op per CLAUDE.md), on client accept/dismiss, and on cron `auto_batch`. Open question: does it actually produce useful suggestions / progressions on real data, or is it effectively inert? Verify end-to-end, then decide fix-or-remove rather than let it ride along forever. **Note:** the B1 pass (D-271) changed only its *auth*, not its behavior — this is a separate feature-quality question. **GATED (Michael, 2026-07-10):** do NOT touch adapt-plan until the app does everything it currently promises with total continuity + every number trustworthy. It resurfaced by accident during the B1 sweep; it is not the mission.

## Q-156 — Per-domain load is NOT calibrated across disciplines (the composition bar exposes it) (2026-07-11, DESIGN GAP, filed)

The State composition bar (Ride/Strength/Run/Swim %, added 2026-07-09, `LoadBar.tsx:72-88` ← coach `daily_load_7d.by_type`) is the first surface to put cardio and strength load side-by-side as percentages — and they are **not on a common scale**. Cardio load = `(minutes/60) × IF² × 100` (`_shared/workload.ts:324`); strength load = `max(tonnage/10000, 0.1) × IF² × 100` (`workload.ts:189`). The `/10000` is a hand-picked constant, **never calibrated against `duration/60`** — so strength/swim shares swing with a formula constant, and a heavy lifting week can flip the whole bar. **Traced verdict:** RUN is *not* over-counted (a 45-min run is scored like the rides, slightly less per minute); the imbalance is strength/swim being uncalibrated-small in a given window. Presenting an uncalibrated cross-sport % as if exact is mildly a "score that lies". Real fix = the per-domain-load calibration (a design task; opens with an HR-data audit, not design — see `DESIGN-load-system-extension.md`). Not a bug to bandaid.

## Q-157 — Run efficiency chart label: a competing verdict the workout shouldn't stamp (MOOT 2026-07-11 — the sparkline is already dead)

**MOOT — verified by code trace 2026-07-11.** The competing sparkline can't render: the server hardcodes `trend: null` (`session-detail/build.ts:898`, the only assignment — the pace-at-HR classifier isn't emitted), and the client `TrendSparkline` that would color `pace_at_hr_direction` is **defined but never mounted** (removed when macro trends moved to State — `SessionNarrative.tsx:597-600`; zero `<TrendSparkline` JSX uses). What actually renders on the workout screen is `discipline_trend`, read straight from the cached spine (`state_trends_v1`) — the same source State reads. So there is no live competing verdict; the fracture this Q described was already retired. Optional cleanup: delete the dead `TrendSparkline` + the server `pace_at_hr_direction` plumbing so it can't be re-wired. No behavior change. Same disposition applies to Q-025's shipped sparkline (surface retired). Original text below.

State owns run aerobic-efficiency direction via `efficiency_index` trend (`state-trend/run.ts:86`, ±3%, staleness-gated, 30–70min duration filter). The run-detail **`SessionNarrative` sparkline** labels its own direction (green/red) via `pace_at_hr_direction` — a percentile classifier (`fact-packet/pace-at-hr-direction.ts`) with **no staleness gate**, which can contradict State. Note the session-detail contract *already documents* that this read should be "State's canonical `efficiency_index` metric… a per-session ZOOM-IN on State's number, **never a competing verdict**" (`session-detail/types.ts:447`) — the chart just doesn't honor its own rule. (The AI-*prose* aerobic-efficiency claim reads the weekly spine signal `run_easy_pace_at_hr_trend`, currently retired/null — so no prose fork.) **Fix (client change, needs a visual eyeball):** feed the sparkline State's verdict, or drop the competing improving/declining color and let State own it. Low-stakes tail; deferred so it lands clean, not rushed. *(Note: the earlier fork-sweep report mis-cited `session-detail/build.ts:38` here — that line is the route readout, a different feature.)*

## Q-158 — Run HR-drift "normal for X min" uses a phase/weather-BLIND band (RESOLVED + DEPLOYED 2026-07-11)

**RESOLVED — the phase-blind band is gone, and the whole drift/decoupling room got consolidated.** Shipped this session (commits `4b77bc84` Q-158 · `552e4de2` decoupling activation · `c4e69460` drift-band collapse · `dd575492` confound guard; each fixtured, all deployed `analyze-running-workout` + `workout-detail`):
- **Q-158 itself:** dropped the duration-only "normal for X min" verdict from `session-detail/build.ts`. The bpm "Heart rate" line is now measured description + own-baseline comparison only; the phase/weather-aware verdict is owned by the analyzer's read.
- **Decoupling % surfaced as the single durability verdict** (TrainingPeaks Pa:Hr standard, <5% good): the Performance "Aerobic decoupling" row leads when a GAP-basis % exists, and suppresses the bpm line so there's one HR read, not two. It was dormant (efficiency.ts dropped `basis`; buildSummary dropped basis+assessment) — now wired single-source.
- **Two expected-drift bands collapsed into one** (the science: judge drift against conditions, one number, TrainingPeaks/Garmin). `interpretation.ts` now reads drift.ts's terrain-adjusted, phase/weather-aware `assessment` instead of recomputing a raw-drift band; `getExpectedDrift`/`assessDriftBand` deleted. Also deleted a dead 1,343-line `analysis/heart-rate-drift.ts`.
- **Confound guard** (Q-055's existing-line concern): the "higher than your typical" bpm verdict is suppressed on hot/hilly runs (names the confound, not a fitness change).
- **Empty-half-window guard** in drift.ts so a dropped-sensor half can't print a garbage drift number.

Original text below.

The workout Details HR-drift row (`session-detail/build.ts:1531`) states "normal for X min" from RAW duration bands `{8,12,15,20}` with no phase/weather adjustment, while the AI-insights drift read uses the phase/weather-AWARE band (`analyze-running-workout/lib/heart-rate/interpretation.ts` `getExpectedDrift(dur, conditionsSeverity)` + `assessDriftBand`). They diverge only on build/peak/taper/hot runs → the "normal for X min" clause disappears while the AI says "within expected range". Workout-internal, LATENT/edge, not on State. **Fix (server-side, small):** drop the phase-blind "normal for X min" verdict and let the phase-aware read own "is this normal" (or thread the adjusted range into the detail contract). Deferred with Q-157.

## Q-159 — Strength design: exercise-substitution recognition + does prescribed RIR progress down a block (2026-07-11, DESIGN, filed — ground in top apps)

Two related strength-design questions Michael raised (parked, NOT continuity): **(a) Substitution** — he swapped front barbell squats for hip thrusts intentionally; A) does the app recognize the movements, B) can it read a swap as a legit substitution and NOT dock the session, C) eventually swap it in the plan itself. Industry-standard (RP / Fitbod / Boostcamp track by movement pattern / muscle group and never penalize a swap) — a real feature (needs an exercise DB + movement-pattern map). **(b) Prescribed-RIR progression** — the logger greys out a suggested RIR; should it DECREASE as load climbs across a block? YES per RP (a mesocycle runs 3–4 RIR → 0–1 RIR over a 4–6wk wave, then deload) — verify our plan actually progresses it; if the target is static, the RIR verdict (D-272) is judging against a wrong reference. Frame: Performance = receipt, State = e1RM trend (Hevy/Strong Epley); ground any build in RP/Hevy/Strong. User-agnostic — never tune to Michael.

## Q-160 — Cleanup cluster: small honesty/hygiene items filed 2026-07-10/11 (filed)

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

> **ADDRESSED LAWFULLY 2026-07-24 (D-317 + D-318).** The observation was real (a strength/multi-sport week under-read as a run-only verdict). Fixed the RIGHT way: D-317 reads TOTAL load in the base status **descriptively** (never a `raise()`); D-318 gates prescription ("pull back") on body corroboration via the two-key cap. Michael's WK3 now reads "balanced" instead of "pull back", DEVICE-VERIFIED — without the unlawful ACWR `raise()` this Q originally proposed. The fix direction below stays flagged unlawful; the lawful path was descriptive base-status + two-key cap.

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

> **↪ Its "the swap CLEARS the weight" resolution is SUPERSEDED TWICE (D-322, 2026-07-24).** D-315 first replaced
> clearing with a seeded weight, computed by rescaling the old lift's load. **That rescale was wrong** — it multiplied
> plate-rounding error and ignored per-hand halving (45/hand against a prescribed 20). D-322 replaced it with a
> derivation from the NEW lift's own reference at the block's authored %1RM, held to one invariant: *swapping into a
> lift gives what the plan would have prescribed for that lift that week.* The "a swap is not a skip" finding below
> is unchanged and still law.


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

> **↪ THE SAME BUG RETURNED 2026-07-28 IN A THIRD FORM — see Q-210.** This close was SOUND, not
> premature: it shipped, deployed and was verified in the DB. But it covered SYNONYMS and PLURALS,
> and a real name can also be decorated with a trailing QUALIFIER or an internal separator —
> `Hip Thrusts` earned an e1RM while `Hip Thrusts (Fast Concentric)` was dropped from
> `STRENGTH_ANCHORS` entirely. ⛔ **A future occurrence is a FOURTH decoration class, not a new bug.
> File it against this lineage.** Everything below is history.
>
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

> **↪ SHARPENED by D-322 (2026-07-24): the anchor is not merely inconsistent, it is DEAD.** Audited: **zero**
> exercises in `EXERCISE_CONFIG` use `primaryRef: 'hipThrust'` — hip thrust itself derives off `deadlift × 0.90`.
> So `getBaseline1RM`'s `case 'hipThrust'` is unreachable, and `materialize-plan` computes `baselines.hipThrust`
> at :2961/:2993/:3025 every run for a consumer that cannot exist. The athlete has a measured hip-thrust e1RM
> (135, 5 sessions) that nothing reads. Making the branch reachable is line 13 of the Q-202 ledger.


Found while fixing Q-197's autofill half. `hip_thrust` is in `STRENGTH_ANCHORS` (compute-facts) — it gets an e1RM, a trend, a PR flag, and a State verdict. But the client baseline system only knows 5 lifts: `getBaselineKeyForExercise` / `baselineSeedFor` (`StrengthLogger.tsx:869/882`) cover squat, deadlift, bench, OHP, pull-ups. So hip thrust has no stored-1RM baseline and can't be seeded as a %-based baseline test, even though the app tracks and grades its e1RM. Same likely true for `trap_bar_deadlift` and `barbell_row` (also anchors, also absent from the client baseline list). Not a bug Michael reported — the day-to-day autofill (D-097, fixed in Q-197) is the path he uses — but the server/client lift lists disagree on what a "tracked lift" is. Decide whether the client baseline list should match `STRENGTH_ANCHORS`.

## Q-200 — Bike chart for endurance-only riders: chart efficiency when power can't lead? (2026-07-23, design call, not built)

D-313 shipped the bike POWER chart, but it renders only when power LEADS (a real terrain-binned w20 verdict). An endurance-only rider (Michael: 0 power-bin rides in 84d) never gets a bike chart — the row leads on efficiency (HR-at-power) and shows the "power trend ⓘ" explainer instead. To give those riders a chart, we'd plot the **efficiency** series (per-ride mean HR at the reference band). The wrinkle: efficiency is **lower-is-better** (less HR for the same watts = fitter), so the line goes DOWN when you improve — inverted from every other output chart (e1RM, run efficiency-index, bike power all go UP). Options: (a) plot it inverted-but-labeled; (b) plot 1/HR or an efficiency-factor so up=better; (c) leave endurance riders chart-less (the ⓘ already explains why). Michael's UX call — flagged, not built. The infrastructure is there (`hrPts` series already computed in `assemble.ts`; `TrendSparkline` already generalized).

## Q-201 — Week narrative vs coach's-eye can clash on a develop discipline (load read vs fitness read). Deferred: needs a coach reorder. (2026-07-24, unverified/deferred)

Found in the 2026-07-24 cross-engine audit (after the maintain-exclusion, parked-exclusion, and develop-only-fade fixes, D-306 family, coach v146→149). ONE contradiction class survives: the week narrative (`coach-week-insights.ts`) fade clause can say a `develop` discipline "came in below its recent normal" — a **load** statement (acwr < 0.8, you did less this block) — while the coach's-eye ROOM read (`cross-training-read.ts:131`) says that same discipline "is holding — room to push" — a **fitness verdict** statement. Same discipline, two windows/signals, clashing words. Triggers only when the athlete deloads their develop FOCUS (endurance) **and** a supplement is pushed (acwr > `PUSHING`) **and** the focus fitness verdict is holding. **Does NOT affect the primary user** (strength focus → the fade path is e1RM-sliding, not endurance load).

**Why deferred, not fixed:** the clean fix is for the narrative to defer any discipline the coach's-eye already owns (symmetric with the maintain→upkeep exclusion). But coach's-eye (`composeCoachEye`, `coach/index.ts:5591`) is computed AFTER the narrative (`composeCoachWeekInsight`, `coach/index.ts:3969`). Fixing it means reordering part of the ~5,800-line coach file to compute coach's-eye first and pass its owned discipline in — higher-risk than the rare cosmetic bug it closes. Duplicating the "which discipline does coach's-eye own" logic inside the narrative would be a doubled engine (the disease). **Recommended fix, for when the coach ordering is next touched with reason:** hoist coach's-eye above the narrative, pass `coachEyeDiscipline` into `composeCoachWeekInsight`, and exclude it from the fade filter (one line, same shape as the maintain exclusion). Belongs to the planned cleanup/refactor pass (GAME-PLAN Phase 7).

---

## Q-202 — THE STRENGTH-NUMBERS LEDGER (D-322). One testable line per fix; report against this, never by topic (PROCESS + ENGINE, 2026-07-24)

> **⛔ SCOPE NOW LIVES IN `docs/SPEC-get-stronger.md` + `D-323` (2026-07-24).** This ledger is the **work
> list** — it says what is true or false, line by line. It is **not** the scope, and several of its notes
> were written before the source spec was read. On any disagreement about *what Get Stronger should be*,
> the contract wins. Two corrections it makes to lines below:
> - **Line 25's reachability note is wrong.** A barbell athlete with equipment chips or compound 1RMs on
>   file routes to `strength_primary`, not `five_by_five`. The exposed case is the **dumbbell / no-signal**
>   athlete — and they get worse than a flat RIR: a barbell program they cannot perform.
> - **Line 34's parenthetical is inaccurate.** `strength-focus-split.ts` **is** in the `getProtocol`
>   switch (`selector.ts:291-294`).

> **This entry is a LEDGER, not a question.** It exists because a status report by TOPIC lied.
> "Hip thrust — done" was true of one of four fixes; the other three had never been written, and
> the topic being mentioned made it read as finished. Same shape as "deload weeks fixed" — which
> does *not* include the deload deadlift authored at 60% under a 65% header.
>
> **Rules this ledger exists to enforce:**
> 1. One line per fix, each phrased so it can be checked **true or false in one look**. If it can't, it's two lines.
> 2. Three states — **open / built / verified**. *Built* means the code changed. *Verified* means it was proven working. They are not the same, and collapsing them is how "built" gets reported as done.
> 3. **Never report status by topic.** Read this list back line by line.
> 4. **Any revert is checked against every open line before it lands.** The swap revert was correct for swaps and silently took the widened history fetch with it, breaking added-exercise prefill. Nothing flagged the dependency.
> 5. Decisions are written to DECISIONS-LOG **when decided**, not when built.

### BUILT — code changed, NOT verified on a device

| # | assertion | evidence |
|---|---|---|
| 11 | `addExercise` resolves a weight instead of `{reps:0, weight:0}` | **BLOCKED on the iOS rebuild** — client-side. |
| 12 | An added exercise resolves weight by: own measured 1RM → last logged → config proxy → blank | **BLOCKED on the iOS rebuild.** `learned_fitness.strength_1rms` now loads client-side, so (a) has a source for the first time. (a)/(c) are 1RMs and take the day's intensity; (b) is a WORKING weight used verbatim — pinned by test, since scaling it would prescribe 65 where the athlete lifted 85. |
| 14 | An added exercise picks up its last logged weight | **BLOCKED on the iOS rebuild.** Deliberately NOT the shared prefill effect: `lastLoggedWeight()` owns a single scoped query, fires only on an add and only when (a) and (c) miss. See the scoping note below. |
| 3 | A swap derives the new lift's weight from its own reference; it never scales the old lift's load | **BLOCKED on the iOS rebuild** — client-side; nobody can see it until the app bundle ships. Not actionable work. |
| 6 | Hip Thrust (+10 other config-priceable lifts) appears in the logger's exercise search | **BLOCKED on the iOS rebuild** — client-side. Not actionable work. |

### OPEN

> **🏷️ EVERY OPEN LINE IS TAGGED WITH WHAT IT IS AGAINST.** Added because the list read as one
> undifferentiated pile and Michael had to ask which lines belonged to the shipped engine and which to the
> new spec. A fresh session would have guessed.
>
> - **`[ENGINE]`** — a defect in code that exists and runs today.
> - **`[SPEC]`** — a defect in Michael's Get Stronger spec document. Fix it in the spec, not the code.
> - **`[REBUILD]`** — work the Get Stronger rebuild creates or forces a decision on.
> - **`[BLOCKS-SPEC]`** — existing engine behaviour the spec silently depends on, unverified. If it isn't
>   what the spec assumes, the spec doesn't do what it says.


| # | assertion | note |
|---|---|---|
| 9 | **[REBUILD]** The three parse sites accept a rep RANGE: `workload.ts` rep-scale, `match-exercises.ts`, the RIR derivation | **BUILT but listed open until rep ranges exist to exercise them.** All three type-checked `reps` as number and fell back silently. MUST hold before rep ranges or RIR goes dark. |
| 13 | **[ENGINE]** **A hip thrust has ONE weight source, not two that can disagree** | **RESTATED — this is worse than a dead branch.** A PLANNED hip thrust resolves server-side off `deadlift × 0.90`; an ADDED one now resolves client-side off its own measured e1RM (line 12). Two independent sources for the same lift. They agree **today by coincidence** (manual DL 150 × 0.90 = 135 = the measured hip thrust), and diverge as soon as either moves: adopt the measured deadlift 155 → **−5 (5%)**; hip thrust improves to 160 → **+20 (19%)**; trained in isolation → **+50 (48%)**. Same lift, same session, two numbers. The `getBaseline1RM` `hipThrust` case is still dead (0 exercises use `primaryRef: 'hipThrust'`) — making it reachable is the likely fix, but the assertion is the single source, not the branch. |
| 15 | **[REBUILD]** Plan creation refuses to build when a required baseline is missing | protocols must declare their required lifts |
| 16 | **[REBUILD]** That refusal surfaces a prompt naming the lift and where to enter it | not a validation error. **All three accounts lack `pullupMaxReps`, so every one hits this first.** |
| 17 | **[REBUILD]** The candidate exercise pool is filtered by the equipment profile BEFORE selection | authoring time, new plans only |
| 18 | **[REBUILD]** Render-path equipment substitution is retained for already-stored rows | legacy, no migration this pass |
| 19 | **[REBUILD]** Session prose is generated from the RESOLVED exercise, not the intended one | prose says "Sled Push 4×25 m @ Heavy"; delivered is Dumbbell Walking Lunge |
| 20 | **[REBUILD]** Prescriptions are sets × rep_range, not sets × fixed_reps | 5 lb on a 110 lb squat is 4.5%; weekly steps are 2–3.5%, so weeks repeat |
| 21 | **[REBUILD]** Entry ceilings are derived from the RPE chart at RIR 2, not hardcoded | expected ~74 / ~81 / ~87% — verify, don't literal |
| 22 | **[REBUILD]** The peak rep range is 2-3 | not 2-4; see D-322 |
| 23 | **[ENGINE]** The deload deadlift's authored % matches its session header | currently 60% vs a 65% header |
| 24 | **[ENGINE]** No other config entry has a computed baseline bypassed by a proxy derivation | audited: exactly two — hip thrust and barbell row — and **both produce the identical number today**, so fixing the precedence is a no-op on current data |
| 31 | **[SPEC]** One sentence of the science copy carries a caveat the rest of the spec already discloses | **DOWNGRADED FROM 🔴 — I OVERSTATED THIS.** The spec is well-sourced and it **already cites Schumann 2022** in its Limits (line 143: *"interference is smaller than the 2012 figures imply"*). It discloses the MAGNITUDE contest. Schumann also found no **modality** moderation, and that half isn't carried next to *"Why cyclists have more room [T1 Wilson 2012]"* (line 131), which is the spec's least-supported sentence. `SCIENCE-concurrent-training-interference.md` §2 in this repo says treat the modality split as "a plausible mechanism with split meta-analytic support, not a settled rule." **A copy refinement, not a defect.** I filed it as a contradiction before reading the spec's own Limits section — the same read-first failure as the rest of this session. |
| 32 | **[SPEC]** Optional: adopt the sourced endurance-volume figure | **NOT AN ERROR — the spec marks ~66% as `[T3]`, which is exactly honest.** Noting only that `SCIENCE-5x5-linear-progression.md` carries a sourced ~20-30% reduction (Rønnestad) if Michael would rather cite than choose. A deeper cut may well be right for a 4-day block; the T3 marker already says it's a choice. **Option, not a fix.** |
| 33 | **[BLOCKS-SPEC]** "Endurance maintain" actually means easy/zone-2 with quality parked | **THE SPEC ANSWERS WHAT IT MUST MEAN; THE ENGINE SIDE IS STILL UNCHECKED.** `seedFromGoal` sets endurance to `maintain` when strength is `develop` — whether `maintain` caps INTENSITY or only trims volume was never traced. Spec Part 2 (`get-stronger-spec-short.md` 73-91) states the target outright: intensity locked easy/conversational **[T1 Wilson 2012]**, volume ~66% **[T3]**, ~3 sessions/wk **[T3]**, lift before endurance **[T2]**, plus an opt-in default-off quality session that *replaces* an easy one (held through deload, dropped at retest). **So this is an enforcement gap, not an open design question** — trace what `maintain` does today and close the delta. Assertion unchanged; it just now has a spec'd right answer to be measured against. |
| 34 | **[ENGINE]** There is ONE implementation of "get stronger with barbells", not three | **Currently three, and the SPEC replaces all three — this is not a choice between them.** `five_by_five` (full-body A/B 2×/wk, 70→85%, the pickable default), `strength_focus_build`/`_power` (4-day U/L/U/L, *identical* load curve, unreachable, self-described as "CONVENTION" not methodology), and `strength_primary` (4-day U/L/U/L, 72→94% block, unreachable via the registry yet it built the live plan through `config.source`). `strength-focus-split.ts` isn't even in the `getProtocol` switch. **The spec's shape is four days, upper/lower, 12 or 8 weeks** (`get-stronger-spec-short.md` 16/62, `get-stronger-protocol (3).md` 66) with a five-phase array and double progression — so the closest existing shape is the 4-day pair, and `five_by_five` is the furthest off despite carrying the "5×5" name. **An earlier banner read Michael's intent as a 2×/wk 5×5 full-body block. That was wrong and is corrected** — it was written before the spec was read, off the name alone. **Was banner-only until now** — banners get superseded, so it is a ledger line. |
| 35 | **[ENGINE]** Unreachable protocols are either wired up or deleted | `minimum_dose` (buildable, has a profile, offered nowhere), `strength_focus_build`, `strength_focus_power` (buildable, **no profile**, offered nowhere). Roughly a third of the protocol surface. Not inert — two carry the same missing-profile defect as line 25 and would break identically the day anyone reaches them. CLAUDE.md's rule is "replace = delete the old". |
| 29 | **[ENGINE]** A bodyweight lift's difficulty PERIODISES across the block | **Currently INVERTED, not merely flat.** Real Get Strong Pull Up scheme against a tested max of 8: base 3×5 → RIR **3**, Power 3×3 → RIR **4**, deload 2×5 → RIR **3**, peak 2×3 → RIR **4**. Back squat over the same weeks runs 4 → 1.5 → 4 → 0.5. The composer drops reps 5→3 into the intensification, which is right for a barbell lift *because the percentage rises to compensate*; a bodyweight lift has no percentage to raise, so fewer reps is simply easier. **Peak pull-ups are the easiest work in the block and the deload is harder than the peak.** Raised by Michael off the line-26 verification output. Almost certainly the same fix as rep ranges (line 20) — a bodyweight lift periodises by climbing reps toward its max, not by cutting them. |
| 30 | **[ENGINE]** The five baseline slots hold what the engine actually reads | **Observation from lines 10/13, worth its own line.** `hipThrust` occupies a slot and **nothing reads it** (0 exercises use `primaryRef: 'hipThrust'`; hip thrust derives off deadlift × 0.90). `pullupMaxReps` needed a slot and did not have one until D-322. The assembly was carrying a number nobody wants while dropping one people need — the slot list was never audited against its consumers. |
| ~~25~~ | **✅ CLOSED 2026-07-25 (`ad62947b`)** — `five_by_five` now has its own `PROTOCOL_PROFILES` entry, `resolveProfile()` WARNS instead of falling back silently (the silence was the root cause, not the missing key), and `strength-protocol-registry.test.ts` hard-fails if a *reachable* protocol has no profile. Verified: base/build/peak/taper/recovery went from a flat 2.5 to **2 / 1.5 / 1 / 2.5 / 3**. Everything below is history. | **THE ONLY OPEN LINE ACTIVELY WRONG IN PRODUCTION, and it is the DEFAULT PATH — not dormant.** `defaultStrengthDeveloper()` returns `five_by_five` for any non-triathlon athlete with barbell/dumbbell equipment, and it is first in the `BARBELL_DEVELOPERS` picker. So the *next* "Get stronger" plan a barbell athlete builds lands on the one protocol with **no entry in `PROTOCOL_PROFILES`** — it resolves to `durability` and gets a flat RIR 2.5 for the whole block. |
| | | *Corrected 2026-07-24: this was previously filed as "no plan currently uses it, so it harms nobody today." That read the DB (1 strength_primary, 2 neural_speed, 3 unset) and mistook it for the reachable set. "Get stronger" is the GOAL; the protocol is derived from it, and for barbell the derivation is five_by_five. The existing plan escapes only because it came through the older `config.source: 'strength_primary'` path with no `strength_protocol` at all — which is why it hit the other half of this same bug and why only `strength_primary` got fixed.* |
| | | Filed as **Q-192, 2026-07-19**. Hit again independently in this session. Still open. |


> **⛔ SCOPING NOTE for lines 11/12/14 — read this before reverting any swap work.**
> An earlier attempt widened the SHARED prior-session fetch from 10 to 40 sessions and built a map
> of every lift, serving both swap history-seeding and added exercises. When swap seeding was
> reverted (correctly — a swap has a plan prescription to stay faithful to), the revert took the
> widened fetch **and** `heaviestCompletedWeight` with it, and silently broke added-exercise
> prefill. Nothing recorded the second consumer.
>
> The rebuild deliberately does **not** share: `lastLoggedWeight()` in `StrengthLogger.tsx` owns its
> own query, and `heaviestCompletedWeight` carries an ownership comment naming this as its consumer.
> **Do not consolidate them back into the shared prefill effect.** A regression test pins that the
> swap seed still takes no history arguments.


> **🕳️ LINES 13, 24, 30 AND 25 SURVIVE THE GET STRONGER REBUILD.** The spec covers 11 of the 15 open
> lines. These four are invisible from inside it: 13/24/30 are the baseline-plumbing layer (where the
> numbers come from, not what the protocol prescribes), and 25 is the protocol registry. **13 was partly
> created by line 12** — the added-exercise chain introduced a second weight source for hip thrust. **25
> has now been found twice** (Q-192, 2026-07-19; again as `strength_primary` in D-322) and fixed neither
> time at the root. If they are not tracked separately they will survive the rebuild exactly as 25 survived
> being found in July.

> **📦 LINES 9, 20, 21, 22, 29 MOVE AS ONE CLUSTER.** 21 (entry ceilings) and 22 (peak range 2-3)
> are *parameters* of 20 (rep ranges) and mean nothing without it. 29 (bodyweight periodisation,
> currently inverted) is almost certainly solved by it — a bodyweight lift periodises by climbing
> reps toward its max, which is what a rep range is. 9 (the three parse sites) is already built but
> cannot be verified until ranges exist to exercise it. Scheduling any of them separately will
> produce a half-state that reads as progress.

### VERIFIED

| # | assertion | how |
|---|---|---|
| 1 | `Pull Up` / `Push Up` / `Chin Up` resolve to the bodyweight config | **DEPLOYED — not a client-only line.** `getExerciseConfig` runs in `materialize-plan` and `strength-primary-plan` too. Live invoke with spaced names: all returned `Bodyweight`, no weight, no `resolved_from`, while Back Squat on the same row returned 155 lb from `squat`. |
| 7 | No source name carries a hyphen; every legacy hyphenated name still resolves | **DEPLOYED.** Same live invoke authored `Pull-ups` and `Push-ups` alongside `Pull Up` and `Push Up` — all four resolved identically. Stored rows carrying the old form are safe. |
| 2 | The bodyweight assertion is three-way | **Against the DEPLOYED function.** Throwaway user + 4-week plan, real `materialize-plan` invoke: Pull Up returned weight `null`, `resolved_from` null on all 4 weeks; Back Squat returned 145/165/130/190 lb from `squat` on the same rows. |
| 4 | Target RIR is derived per week from the RPE chart | **Against the DEPLOYED function.** wk1 @72%→**4**, wk4 @82%→**1.5**, wk7 @65%→**4**, wk11 @94%→**0.5**. Three distinct values across the block — the flat-constant behaviour is gone. |
| 5 | Deload weeks carry a LOOSER target RIR than base weeks | **Against the DEPLOYED function.** deload **4** > base-wk4 **1.5**; peak **0.5** < base-wk4 **1.5**. The inversion is fixed. |
| 10 | The server's baselines object carries a pull-up rep count | **DEPLOYED.** Was dropped by the five-key assembly (squat / bench / deadlift / overheadPress1RM / **hipThrust** — not ftp, which is endurance). Now passed through, deliberately NOT via `mergeAnchor1RmLb` (that picks a LOAD and defaults to pounds). `0` is valid — "your first pull-up", Q-102 — so the guard is `>= 0`. |
| 26 | A bodyweight lift derives target RIR from reps vs tested max, never a %1RM | **DEPLOYED.** `targetRirFromRepsVsMax`, checked before the chart. Max 8, prescribed 5 → **RIR 3** on all four weeks, unchanged by the session percentage. |
| 27 | A bodyweight lift's display reads "Bodyweight", not load-picking copy | **DEPLOYED.** Was *"Pick a weight you can do for 5 reps with 2 in reserve"*; now `Bodyweight` on all four weeks. |
| 28 | No bodyweight row carries a %1RM value | **DEPLOYED.** Fixed at the ORIGIN — `exer()` in `strength-primary-plan.ts` stamped the session percentage onto every lift. Now emits `'Bodyweight'`. Materialize also neutralises already-stored rows, so no migration. |
| 8 | A value entered for `pullupMaxReps` persists to `performance_numbers` and reads back | Round trip on a **throwaway auth user** (created, exercised, deleted — 0 rows left). All four hops clean: client transform → DB write → DB read → client load, `pullupMaxReps: 8` intact throughout. The write was never the problem. |

> The same run **disproved the assumption behind line 10 by execution, not inspection**: the value reaches
> the database perfectly and is then dropped by the server's five-key baseline assembly. Fixing the
> "write" would have fixed nothing.

### Also noted

- `OPEN-QUESTIONS.md` (165KB) and `DECISIONS-LOG.md` (244KB) are both past the ~150KB archive threshold in CLAUDE.md.
- 25 code comments were stamped **D-316** during this work. D-316 is *State-as-hub* (2026-07-23). Corrected to **D-322** across 8 files; the refs in `StateTab` / `StateHubTabs` / `StateAdjustLens` are the real D-316 and were left alone.

---

## Q-203 — Race plans need HARD gates, not the D-325 budget model (2026-07-25, deliberately deferred, NOT built)

> **⛔ THE PREMISE IS CORRECTED — D-325 §8, amended 2026-07-26. The question survives but it is NARROWER than written below.**
>
> This entry was filed on the reading that the strength side has **no** hard gates. **It has exactly two,
> and they are now named as gates in D-325 §8:** run VO2 within 24h of a lower-body 5/3/1 at reconciler
> `high`, and any quality session at `high` where the default week already breaches. Those are refusals,
> not budget lines.
>
> **The distinction that was missing:** *"breach never refuses"* applies **to the athlete**, not to the
> app's own output. The composer declining to auto-generate a breaching week is the app refusing to propose
> what it will not defend — the athlete can still force it. So the strength side is not the gateless
> contrast this entry assumed.
>
> **The question is therefore not "does strength need gates" but "does RACE need more than these two, and
> of what kind."** Everything below stands on that narrower framing — including the resolution path, which
> does not change: answer it where the two schedulers converge.
>
> ⚠️ **Also relevant:** D-325 §5 was rewritten to make interference **directional**, and it now defers to
> `_shared/schedule-session-constraints.ts` as the single law — **the same law the race-side optimizer
> already reads.** That removes one of the reasons the two contracts looked incompatible.

**Michael, alongside the D-325 handoff: *"race needs hard gates — we don't build this now but make a note."***

D-325 is explicit that **ceilings state cost and never refuse** (§7), and that is right for a
self-directed strength block: the athlete added it, the app prices it. **A race plan is a different
contract.** Someone eight weeks from an A-race who stacks a VO2 session onto a heavy-deadlift day is not
making a trade — they are damaging the thing they paid for. Race plans plausibly want a genuine refusal,
or at minimum a much narrower prohibited list than D-325 §8's two rules.

**Do not resolve this by loosening D-325.** The two contracts differ because the emphasis differs, and
D-325's budget model is correct inside its own scope.

**What would settle it:** the race-plan scheduler is already separate (`week-optimizer.ts`, kept as a
DEFERRAL under D-325 §6). The gate question should be answered **at the point those two schedulers
converge**, not before — otherwise we design a gate for a scheduler we are about to replace.

---

## Q-204 — Opt-in flag when an athlete breaks the easy-effort rule on their own runs (2026-07-25, Michael's note, NOT built)

**Michael: *"user gets a flag on their performance screen if they break zone 2 rules — if they opt into this."***

The Strength Focus block's whole safety argument is **conversational is the ceiling** — Hickson: cutting
intensity is what loses the aerobic base, so volume gives and effort holds. **That guardrail is currently
stated in copy and enforced by nothing.** An athlete who runs their maintenance miles hard is carrying a
different block than the one the app describes, and the app does not mention it.

**Design constraints, all pre-existing:**
- **OPT-IN.** Michael's own framing. Unrequested policing is not this app's voice.
- The surface exists — the State screen's BODY section already flags how the athlete is doing.
- **The signal exists:** D-325 §9 recomputes a session's cost from what was *executed* — a Z2 run that
  drifted to threshold recosts 1/1/0 → 2/2/1. **That recost IS the detection.** This question is the
  surfacing of it, not a new measurement.
- ⚠️ Inherits D-325 §9's known risk: the recost depends on `time_in_zone` / `hr_drift_pct`, which the
  documented ingest race can drop. **It would fail quiet, and always by under-reporting.**

**Blocked on D-325 §9.** There is nothing to flag until actuals are being recosted.

---

## Q-205 — `balanced` and `endurance_led` ceilings are UNVALIDATED (2026-07-25, from D-325, blocks trusting two of three emphases)

> ## ⛔ ANSWERED 2026-07-26 — AND THE QUESTION CANNOT BE ASKED YET. Two findings, the second is worse.
>
> **Attempted the sum. It is not possible, for a reason nobody had checked.**
>
> ### 1. ⛔ THE EMPHASIS STATES DO NOT EXIST IN THE CODEBASE
>
> `grep -rn "strength_led\|endurance_led" supabase/functions src` returns **NOTHING**. Not a type, not a
> constant, not a column. **They exist only inside D-325 and the doctrines.**
>
> ⛔ **So there is no default week to sum, because there is no emphasis to have one.** `D-325 §2` says
> *"ceilings derive from the active emphasis state only"* — **that state is not a thing the app computes.**
> Q-205 asked which of three calibrations is right; the answer is that **one of them was hand-summed off a
> composer output and the other two have no referent at all.**
>
> **What carries emphasis TODAY is `per_discipline_posture`** — `develop` / `maintain` / `out` per
> discipline, written at intake and read at `create-goal-and-materialize-plan:1428/2383`. **That is the
> real signal, and D-325's three states would have to be derived from it.** ⚠️ Note it does not map
> cleanly: posture is per-discipline and an emphasis is per-block.
>
> ### 2. ⛔ AND `balanced` IS ALREADY TAKEN — it is a load verdict shown to the athlete
>
> **`load-headline.ts:17` — `if (status === 'on_target') return 'balanced'`.** It is the word on the LOAD
> row (`LoadBar.tsx:38`, `CoachWeekTab.tsx:1019`, alongside "build more" / "productive" / "a bit high" /
> "pull back"). ⛔ **Shipping a plan emphasis called `balanced` gives the app two different `balanced`s —
> one a reconciler verdict about this week's load, one a description of the block's design.**
>
> ⚠️ **This is the D-268 collision again, one week later.** That spec arrived carrying a number already
> taken since July 9th and it was caught by reading the log. **This one is a NAME already taken in
> athlete-facing copy, and nothing would have caught it — the ledger and the load row never touch.**
>
> ⛔ **Rename before it ships.** `D-325 §4` is emphatic that the ledger must never emit a load verdict;
> **two things called `balanced` is that boundary being crossed in the vocabulary rather than the code**,
> which is worse, because it looks fine in every diff.
>
> ### What this does to the question below
>
> **It is not "sum two default weeks." It is, in order:** derive the three emphases from
> `per_discipline_posture` · rename `balanced` · build a default week for each · *then* sum. ⛔ **Steps 1
> and 2 are prerequisites nobody had written down.** The `strength_led` numbers remain the only calibrated
> set and remain trustworthy — they were summed against a real composer output.

D-325's `strength_led` ceilings were validated by summing the composer's **actual default week** — which
is how the mech ceiling moved 12 → 14, after the stock week breached by 1 before the athlete added
anything. **`balanced` (10/11/9) and `endurance_led` (8/15/8) have had no such sum run against them.**

They are inherited numbers standing next to one that had to move the moment it was checked. **Assume they
are wrong until summed the same way.**

**What settles it:** build a default week for each emphasis, sum every axis off the D-325 cost table, and
confirm the stock week sits *under* its ceiling with roughly the same headroom gradient `strength_led`
now has — one quality addition tight, the wrong quality addition over by a little. **Adjust the ceiling,
not the week** — Michael's rule from the first sum: *"the model is wrong, not the week."*

---

## Q-206 — `days_per_week` is asserted and never enforced, so 4-to-6-day plans silently lose their quality sessions (2026-07-27, VERIFIED, superseded by design — do NOT fix in place)

**Status:** verified by trace + probe. **Deliberately NOT fixed.** Superseded by SPEC-week-solver §0a.1.

**The symptom.** An athlete on a 4-day-per-week budget gets a plan with no quality bike, no quality
run and no heavy leg day. What ships is the long ride, the long run, and easy work.

**The chain, link by link.** Steps 1–4 were run; 5–7 are a code read.

1. `create-goal-and-materialize-plan:1319` → `deriveRestDaysForBudget(dpw, …)` returns exactly
   `7 − daysPerWeek` days.
2. `reconcile-athlete-state-week-optimizer.ts:189` passes them to the optimizer as
   `preferences.rest_days`.
3. `week-optimizer` consults `restDaySet` in the **strength and swim** loops only. The `quality_bike`,
   `quality_run`, `easy_run` and `easy_bike` loops never consult it, so sessions land on rest days.
   *(The D-064/D-066 comment at :1117 says the filter "belongs at every preference-driven placement
   loop." It reached six of ten.)*
4. The rest-day reclaim pass at `week-optimizer.ts:~1991` is gated on
   `if (restDays.size < restNeeded)`. **Pre-filled with exactly the needed count, this is false and
   the entire reclaim-and-displace block never runs.** The days are output as rest with sessions
   still on them, and **silently** — the 4-day case emits no trade-off and no conflict.
5. `reconcile…:290` overwrites the plan's `rest_days` with that output.
6. `week-builder.ts:786` → `makeGrid` marks those days `isRest`.
7. Emission is guarded by `!slot?.isRest` at :1432 (quality bike), :1538 (quality run), :1779 (easy
   run) and :1870 (strength). **Those sessions are never emitted.**

**The probe that isolates the cause** — identical 4-day week, only difference is whether `rest_days`
arrives pre-filled:

```
pre-filled (the real path)    rest [mon, tue, thu] — all three holding sessions, 7 active days
empty (optimizer derives)     rest [wed]           — clean
```

**Two independent defects.** Either one alone would prevent this: the missing `restDaySet` filter on
four endurance loops, and the reclaim pass gated on a count the caller always satisfies. Fixing one
leaves it broken.

**Reach:** any plan built with `days_per_week` 4–6. Below 4 the deriver returns empty and the
optimizer derives its own clean set; at 7 there are no rest days.

⛔ **WHY THIS IS NOT BEING FIXED.** Michael's call, 2026-07-27: pre-launch, single user, no live plans
to protect, and the enforcement lives in a path being deleted. **`days_per_week` becomes an OUTPUT**
(SPEC-week-solver §0a.1) — count the picks, stack what stacks, report the number. A derived number
cannot contradict the session list, so there is nothing to enforce and nothing to leak. **Fixing
enforcement here would be repairing a mechanism the derivation removes.**

⚠️ If you are here because you found the same symptom: do not add the four missing filters. Read
§0a.1 first, and note `place-week.resolveStacking()` already computes the derivation for Get Stronger.

---

## Q-212 — Assistance does not know what the main lift is: four pushing exposures inside 24 hours (2026-07-28, **CLOSED 2026-07-29**)

> ✅ **CLOSED by D-328 (`b245f79b`, `5eddff64`) — PUSHED, NOT YET DEPLOYED.** `resolveAssistance()` now
> takes the day's main lift. A colliding pick is substituted and NAMED (`substitutedFor`, §5.2b), and
> a non-colliding pick on the wrong side of the plane is rebalanced and named separately
> (`balancedFor`) — chins on bench day, rows on press day.
>
> ⚠️ **The citation in the first version was WRONG and the correction is the durable part.** Four of
> Wendler's five templates put SAME-pattern volume on the main lift's day deliberately; only p86, the
> concurrent chapter, crosses. See D-328.
>
> ⚠️ **NOT DEPLOYED.** The rule is correct in the repo and absent on the phone — a press day still
> shows Pull Up. Everything below is history.

**Assistance does not know what the main lift is — four pushing exposures inside 24 hours.**

**Status:** unverified *(the interference is reasoned from the exposure count, not measured)*

**Found:** 2026-07-28, reading a generated Strength Focus block. Michael: *"25 dips on bench day and 25 more on press day the next morning is four pushing exposures in 24 hours."*

**What happens.** `assistancePicks` is ONE pick per slot for the whole block, and `assistanceRows` applies all three slots to every lifting session identically. The push slot runs the same movement whether the day's main lift is a bench press, a squat or a deadlift. On the four-day template bench and overhead press land on consecutive days, so an athlete who picks Dips gets:

| | main lift | push assistance |
|---|---|---|
| Monday | Bench Press (horizontal push) | 25 dips |
| Tuesday | Overhead Press (vertical push) | 25 dips |

Two heavy pressing sessions and 50 reps of dips across roughly 24 hours, none of it visible as a pattern to the engine, because nothing joins the assistance slot to the main lift.

⚠️ **THIS IS THE SAME CLASS AS EVERYTHING ELSE FIXED TODAY — a constant that should derive.** The leader/anchor ratio, the accessory volume and the block narrative were all fixed numbers that the block already had the information to compute. This is the fourth instance, and Michael's note on it is the one that distinguishes it: *"it's the one that showed up as an actual training decision rather than a copy defect."* Volume being flat is a dosing question. Four pressing exposures in a day is a placement question with a fatigue cost.

⚠️ **AND WENDLER'S OWN TEMPLATES DERIVE THIS.** Assistance in 5/3/1 is conventionally chosen *against* the day's main lift — pull and leg work on a pressing day, pressing on a pull day — precisely so the assistance does not stack onto what the main lift just loaded. The 25/25/25-on-every-day shape is a simplification this block made, not something the protocol prescribes.

### ⛔ THE FIX HAS TWO SHAPES, AND MICHAEL TOOK THE SECOND (2026-07-28)

| | shape | verdict |
|---|---|---|
| 1 | **Reduce the dose** when the main lift covers the pattern | ⛔ rejected — *"the problem isn't volume, it's pattern collision."* Dips at 12 on a press day still puts the same muscles under load |
| 2 | **Substitute the MOVEMENT** — a press day gets antagonist or postural work in the push slot (face pulls, band pull-aparts, rear delt) rather than more pressing at a lower dose | ✅ **chosen** — it BALANCES the pressing instead of adding to it, and it is what 5/3/1 assistance templates conventionally put on a press day |

✅ **AND SHAPE 2 GENERALISES, WHICH IS THE REAL ARGUMENT.** The same rule catches a pull-dominant main
lift colliding with the pull slot — **which nothing in the current build would catch either.**

### ⛔ SCOPE, 2026-07-28 — THE TAXONOMY ALREADY EXISTS. DO NOT BUILD ONE.

⚠️ **THIS CORRECTS THIS ENTRY'S OWN CROSS-LINK, WRITTEN AN HOUR EARLIER**, which said the rule was
blocked on a field that had to be added. `StrengthExercise` and `AssistanceOption` do lack the field —
that part stands. **But the taxonomy and the per-exercise mapping have been in `src/lib/exercise-config.ts`
since Q-181**, and both sides' names already resolve through it. A session reading only the earlier
version would build a second vocabulary beside this one, which is `CLAUDE.md`'s opening failure mode.

| what exists | where |
|---|---|
| `MovementPattern` — a NINE-value typed union: `knee_dominant` · `hip_dominant` · `horizontal_push` · `horizontal_pull` · `vertical_push` · `vertical_pull` · `core` · `plyometric` · `calf` | `src/lib/exercise-config.ts:45` |
| the mapping — **134 of 135 entries carry a pattern** | same file |
| reachability from the edge function | the composer already imports `src/lib/assistance-menu.ts` by relative path; this is the same hop |
| ⛔ **it is ONE vocabulary already**, which is the property Michael required | `MovementPattern` is not per-consumer |

✅ **MEASURED, NOT REASONED — every name run through the real `getExerciseConfig()`.** All four main
lifts and all twelve menu options resolve today:

| main lift | pattern | | slot pick | pattern |
|---|---|---|---|---|
| Bench Press | `horizontal_push` | | Push Up · Dips · DB Bench | `horizontal_push` |
| Overhead Press | `vertical_push` | | DB Shoulder Press | `vertical_push` |
| Back Squat | `knee_dominant` | | Pull Up · Chin Up | `vertical_pull` |
| Deadlift | `hip_dominant` | | Inverted Row · DB Row | `horizontal_pull` |
| | | | Reverse Lunge · Bulgarian Split Squat | `knee_dominant` |
| | | | Single Leg Hip Thrust | `hip_dominant` |
| | | | Hanging Leg Raise | `core` |

⛔ **AND THAT TABLE CONFIRMS BOTH COLLISIONS WITH REAL VALUES, INCLUDING THE LIVE ONE.**
`Deadlift` = `hip_dominant` and `Single Leg Hip Thrust` = `hip_dominant` — **an exact pattern match, in
the block Michael is holding.** Michael: *"a push-day special case would have left it there
permanently. That's the argument for pattern-keyed slots, and it's better than mine because it's a
second instance rather than a hypothetical generalisation."* `Back Squat` / `Bulgarian Split Squat` is
the third, latent on the athlete's pick.

⚠️ **THE FIELD WAS BUILT FOR THE OPPOSITE QUESTION, AND THAT IS THE WHOLE DESIGN NOTE.** Q-181 added it
to find a *good substitute* — its own comment reads *"a horizontal push is replaced by another
horizontal push."* Q-212 needs the INVERSE: a movement whose pattern must NOT match. **Same field, same
vocabulary, negated predicate.** No new taxonomy is owed.

### ✅ STEPS 1 AND 2 SHIPPED 2026-07-28 — order set by Michael: dead site, family, pool

| step | | |
|---|---|---|
| **1. the dead site** | `strength-primary-plan.ts:804` DELETED — zero consumers, confirmed by identifier scan. Baseline `shared` 174/7 unchanged, which is the proof it was inert | ✅ |
| **2. the family** | `MovementFamily` + `movementFamilyOfPattern` / `getMovementFamily` / `sharesMovementFamily` in `exercise-config.ts`, 6 fixtures, verified red-green-red by collapsing hip into knee | ✅ |
| **3. the pool** | needs new movements and new copy — decisions below, not built | ⛔ |

⚠️ **STEP 2 HAS NO CONSUMER UNTIL STEP 3, AND THAT IS STATED IN THE CODE.** It is pinned by fixtures so
it is a derivation under test rather than dead code — ⛔ **but if step 3 is abandoned, delete it**, or
it becomes Q-211's seventh instance in the file that was scoping Q-211's sixth.

⚠️ **AND A THIRD GROUPING WAS NEARLY MINTED.** `MovementGroup` (`lower | upper | core`, D-315) already
existed. It is orthogonal — it calls a bench press and a pull-up both `upper`, which is right for
placement and blind for collision, and those two are the pair the new axis exists to tell apart. Both
now sit together with a note saying so. **Third time this week the answer was already in the codebase.**

### ⛔ THE POOL — MICHAEL'S DESIGN CALL, 2026-07-28 (recorded so step 3 is not blocked)

**The slot does not get a WEAKER version of the same pattern. It gets the BALANCING work.**

> Michael: *"A push slot on a press day should hold horizontal_pull work — face pulls, rear delt, band
> pull-aparts. Not because they're a substitute for pushing, but because the press day is already
> pushing-heavy and the balancing work is what's missing."*

| the day's main lift | what the slot holds |
|---|---|
| a press (`push` family) | **pull** work — face pulls, rear delt, band pull-aparts |
| a pull (`pull` family) | push work, by the same logic |
| `hip_dominant` (deadlift) | **knee-dominant** single-leg work |
| `knee_dominant` (back squat) | **hip-dominant** work |

⛔ **SO BULGARIAN SPLIT SQUAT AND HIP THRUST STOP BEING INTERCHANGEABLE PICKS AND BECOME DAY-DEPENDENT.**
That is the lower-body half, and it is the half a push-day special case would have left broken forever.

### ✅ THE LAST DECISION — the substitution is NAMED, not silent (Michael, 2026-07-28)

§5.2b, exactly on point: *never subtract silently*. The athlete picked Dips, the plan shows Face
Pulls, and with no line saying why **the app looks like it ignored them**.

**Register: state what happened and why, in one clause.** Michael's own wording as the model —

> *"You picked Dips — on press days it lands on the same muscles as the main lift, so this slot
> balances instead."*

**Two constraints on it:**

1. **It appears ONLY on collision days.** On squat and deadlift days the pick stands and there is
   nothing to say. Same rule as the ceiling paragraph — omitted entirely when it does not fire, never
   printed as a no-op.
2. **It NAMES the pick.** *"Something else is here"* is worse than nothing: the athlete needs to see
   their choice was READ, not overridden blind. ⛔ This is the difference between a substitution and
   an override, and it is the whole reason the line exists.

⚠️ This closes the last open decision in Q-212. Every remaining item is implementation.

### ✅ BUILT 2026-07-28 — the rule, the copy, and a third collision nobody had named

| | |
|---|---|
| the rule | `resolveAssistance(picks, mainLiftName)` — the slot's OWN menu is tried first, the balance pool is the fallback |
| the note | `assistanceSubstitutionNote()`, in the session description, collision days only |
| composer | `assistanceRows(..., lift.name)` returns `{ rows, note }`; the note is appended only when it fired |
| copy | slot `purpose` sentences now state the day-dependence; the wizard card says the picks are *"your preferences, applied where they fit"* |

⛔ **A THIRD COLLISION WAS LIVE AND UNNAMED, AND THE DEFAULTS HIT IT.** `Reverse Lunge` is the
single-leg DEFAULT and is `knee_dominant`; on a **Back Squat** day it repeated the day's own pattern.
Nobody had to pick anything unusual to trigger it — the default pick collided with the default day.
Found only because the invariant test runs every slot against every main lift rather than the two
cases the ticket named.

⚠️ **AND TWO EXISTING TESTS WERE PINNING THE DEFECT** (§0d — when a change turns an old test red,
ask which of the two is wrong). Both asserted assistance reaching every session unchanged. Updated,
with the reason written at the assertion.

⛔ **THE STORAGE KEYS DID NOT FOLLOW THE COPY.** `AssistanceSlot` stays `'push' | 'pull' |
'single_leg_core'` because those keys are persisted on `goals.training_prefs.assistance_picks` and
renaming them would strand every existing goal. The key names the PREFERENCE, the copy explains WHEN
it applies. A key is not a label.

✅ **Verified red-green-red** (§0d): disabling the collision branch turns 5 of the 8 new fixtures red.
Baselines: `_shared` 1353/0 · `shared` **182**/7 (was 174 — the 8 new) · `generate-run-plan` 33/2 ·
`generate-combined-plan` 438/3 · `npm run build` clean.

⚠️ **ONE NEW STRUCTURAL EDGE:** `assistance-menu.ts` now imports `exercise-config.ts`, the first
sibling import inside `src/lib` that Deno must also resolve — every other file there that an edge
function pulls in is a leaf. It uses the `.ts` extension Deno needs, and BOTH toolchains are checked.
It earns the edge: the collision rule and the menu it applies to are one claim.

### ⛔ TWO CONSEQUENCES TO SHIP WITH IT, NOT AFTER IT

**1. THE SLOT'S NAME BECOMES WRONG.** Michael: *"It isn't 'the push slot', it's the antagonist/balance
slot — filled with whatever complements the day's main lift. That's the honest name for what it
becomes, and it should probably say so in the athlete-facing copy too."* `AssistanceSlot`'s
`'push' | 'pull' | 'single_leg_core'` and each menu's `purpose` sentence both describe a fixed
category that will no longer be fixed.

**2. THE ATHLETE'S PICK CHANGES MEANING, AND THE COPY MUST CHANGE WITH IT.** Michael: *"the athlete's
wizard pick stops being 'your push accessory' and becomes 'your preference, where it fits.' That's a
real change to what the pick means, and the wizard copy has to change with it or the pick will read as
ignored."* ⚠️ **This is §0g's neighbourhood** — an athlete-facing field whose stated meaning and actual
behaviour diverge. A pick that silently does not apply on half the days is the same defect as a
preference the engine invented, seen from the other side.

### ⛔ SO THE COST IS NOT THE FIELD. THREE THINGS ARE ACTUALLY OWED

**1. A FAMILY GROUPING OVER THE NINE.** The rule is *"no pushing in the push slot on a press day,"* and
a press day is `horizontal_push` OR `vertical_push`. Exact-pattern comparison alone would let Dips
(`horizontal_push`) sit on an Overhead Press (`vertical_push`) day — the exact case in the block that
raised this. Needs `{horizontal,vertical}_push → push`, `…_pull → pull`, `knee_dominant`/`hip_dominant`
as their own families. ⚠️ Nine values, four or five families — small, but it is a NEW derivation and it
needs an owner (§4.1a).

**2. THE POOL — AND THIS IS THE REAL COST.** Slots stop being fixed lists and become QUERIES, which only
means something if there is something to query. ⛔ Measured against the real resolver: `Face Pull`
resolves (`horizontal_pull`), but **`Band Pull Apart` and `Rear Delt Fly` do not resolve at all.** The
menu's push slot currently offers four pushing options and nothing else, so on a press day a
substitution rule has **nothing to substitute to**. The deliverable is a taxonomy query PLUS enough
movements to make it answerable — new `exercise-config` entries, new menu options, and a decision about
what a slot's `purpose` sentence says once the slot no longer names one pattern.

**3. THE DEAD CALL SITE, FIRST.** ⛔ `strength-primary-plan.ts:804` — `const assistance =
assistanceRows(args.assistancePicks)` — is **declared and never read. Zero consumers**, confirmed by
identifier scan. The live path is the per-cycle rebuild at `:1021`. `noUnusedLocals` is off
(`CLAUDE.md`), which is why it never surfaced. **Delete it before touching either, or a fix lands in
the path nobody reads.** ⚠️ And note the shape — computed correctly, thrown away: **Q-211's sixth
instance**, found while scoping something else.

✅ **`targets` MUST NOT BE THE KEY, AND NOW IT DOES NOT HAVE TO BE.** It is prose (*"Chest, front
shoulders, triceps"*) and keying off it would be the string proxy that broke the seven conformance
tests. The typed field already exists; the rule reads `getExerciseConfig(name).pattern`, never the
description.

⛔ **BLOCKED ON Q-210'S MISSING FIELD, AND THIS IS THE CONNECTION WORTH KEEPING.** `StrengthExercise`
(`protocols/types.ts:153`) has no movement-pattern field, and neither does `AssistanceOption`
(`src/lib/assistance-menu.ts:42` — `name`, `targets`, `requires`). A rule that says *"do not fill the
push slot with pushing on a press day"* has to know both are pushing. ⚠️ **Today the only signal is a
display string, and `targets` is prose** (*"Chest, front shoulders, triceps"*) — keying off it would be
the identical proxy that broke the seven conformance tests. **Build this downstream of the pattern
field, or build it on sand.**

**Why it is not fixed here.** It belongs with the accessory model (`src/lib/assistance-menu.ts` + `assistanceRows`), NOT with the rematerializer, and the accessory work this session deliberately stopped at volume. Changing which movement runs on which day is a different decision from how many reps of it.

**What would settle the interference claim.** The exposure count is arithmetic and certain; the training cost is not. The honest version is that it is a known 5/3/1 convention being departed from without a stated reason — which is §4.1a's test (*strictness, or laxity, beyond the protocol needs an owner and a reason*), and there is no owner on record for the departure.

**Related:** the accessory volume model (2026-07-28, `assistanceTotalReps`), §0i in `docs/SPEC-week-solver.md`.

---

## Q-207 — The emphasis markers have stopped carrying information — ten principles, nearly every line marked (2026-07-28, intentional-for-now)

**The emphasis markers have stopped carrying information — `SPEC-week-solver.md` has ten principles and nearly every line is marked.**

**Status:** intentional-for-now *(noticed and left; the fix is a demotion pass, not a defect)*

**Found:** 2026-07-28, immediately after §0j was added — which made it worse by one stop sign, two triangles and three checkmarks. Michael, offered lightly: *"When everything is marked critical, the marking stops carrying information — which is the same failure §0j is about, one level up."*

**The proposed rule, for the record.** Stop sign reserved for things that have **actually cost a session**. Triangle for **unverified claims**. Nothing else marked at all. It is checkable by counting, which is the only kind of rule that has survived in this project.

⚠️ **The work is the demotion, not the rule.** Applying it means going back through the existing ten principles and unmarking most of them. That is why this is filed rather than done.

**Related:** §0j in `docs/SPEC-week-solver.md` — same defect one level down (a marker that looks derived from severity and is not).

---

## Q-208 — `plans.status = 'active'` is an IDENTITY filter on historical reads — null plan context on ended plans (2026-07-28, VERIFIED, LIVE IN PRODUCTION — ahead of the rematerializer)

**`plans.status = 'active'` is used as an IDENTITY filter on historical reads, so a workout attached to an ended plan loses its plan context — live in production today.**

**Status:** VERIFIED by code trace *(not device-verified)*. ⛔ **A LIVE BUG, NOT A REMATERIALIZER CONCERN. File and fix ahead of supersede — it does not depend on supersede shipping, and supersede makes it worse.**

**Found:** 2026-07-28, tracing the chain-vs-row question for the rematerializer. Michael: *"That's broken in production today."*

**What happens.** `fetchPlanContextForWorkout` (`_shared/plan-context.ts:189`, duplicated at `analyze-running-workout/lib/plan-context.ts:35`) is passed an explicit `planId` and *still* requires `.eq('status','active').single()`. The plan is already identified by id — `status` adds nothing but a filter that fails once the plan is no longer current.

So a workout whose `training_plan_id` points at an `ended` plan resolves to **null plan context**. The fallback `fetchPlanRaceMetaForWorkout` (`:104`) carries the same `.eq('status','active')` and also returns null. The caller (`workout-detail/index.ts:585-600`) logs `[session_detail_v1] plan context fetch failed` and moves on. **The athlete sees a session detail quietly missing its plan context and is told nothing.**

**Who is affected today.** Anyone who has used plan replacement. `create-goal-and-materialize-plan/index.ts:453` sets the replaced plan to `status: 'ended'` while deliberately KEEPING its past planned rows (it deletes only `.gte('date', weekStart)`) — so the rows survive precisely so history stays answerable, and then the reader refuses to read them.

**Why supersede makes it worse.** Supersede-not-rewrite turns "the plan" into a chain, so the number of workouts pointing at a non-active plan goes from *"only if you replaced a plan"* to *"every rematerialization, for everything before it."*

**Related.** `fetchActivePlanId` (`plan-context.ts:87`) uses `.maybeSingle()` on `status='active'` — two active plans makes that query ERROR, the `catch` swallows it, and it returns null, indistinguishable from "no plan." That is §0h/§0g's silent fallback and it is the failure mode if a supersede half-completes. `fitness_baselines` (`20260716120000`) solves the same problem with a **partial unique index** (`WHERE superseded_at IS NULL`) rather than a convention.

---

## Q-209 — Adherence's `planned_id` match misses under supersede and a `date::discipline` fallback silently rescues it (2026-07-28, VERIFIED — precondition on the supersede design)

**Under supersede, the adherence `planned_id` match misses and a `date::discipline` fallback silently rescues it — a wrong-but-plausible match feeds `matchConfidence` with nothing naming why.**

**Status:** VERIFIED by code trace. ⛔ **ANY SUPERSEDE DESIGN MUST ANSWER THIS EXPLICITLY. It is a precondition on the rematerializer, not a follow-up.**

**Found:** 2026-07-28. Michael: *"'Still answers, but for the wrong reason' is worse than failing."*

**What happens.** `_shared/adherence-plan.ts:118` builds `completedByPlannedId` from the week's completed workouts and matches each planned row by exact id. `:124-141` then falls back to a `${date}::${discipline}` key when the id match misses.

After a supersede the new plan mints NEW `planned_workouts` rows with NEW ids, while an already-logged session still carries the OLD `planned_id`:

| case | what the reader sees |
|---|---|
| the session stays on the same day, same sport | id match MISSES, date/discipline fallback matches. **Looks correct, matched for the wrong reason** |
| the rematerialization MOVED the session | counts as one planned-not-done AND one done-not-planned; `matchConfidence` falls with nothing naming the cause |

⚠️ **THIS IS §0h.** A fallback that makes a broken state indistinguishable from a healthy one. The id link is the thing that answers *"did they do what they were told"* — the whole reason supersede-not-rewrite was chosen — and the fallback is what hides its failure.

**The likely shape of the answer** *(not a decision — the decision is owed)*: the fallback should be DISTINGUISHABLE rather than silent. A match that came from date/discipline rather than from `planned_id` should say so, so `matchConfidence` can report *how* it matched and not only *how much*.

**Related:** Q-208 (the same "the link survives, the reader refuses it" shape one layer up), §0h in `docs/SPEC-week-solver.md`.

---

## Q-210 — The seven triathlon conformance failures are stale MATCHERS, not a coverage gap — and a live muscle-group mis-filing (2026-07-28, VERIFIED)

**The seven triathlon conformance failures are stale MATCHERS, not a coverage gap — and the fix is a canonical naming rule, NOT a wider regex.**

**Status:** VERIFIED by code trace — reproduced at `174 passed / 7 failed`, matching the standing baseline exactly.

**Found:** 2026-07-28, triaging the seven before building on the suite.

**The cause is a hyphen.** All seven live in `shared/strength-system/protocols/triathlon_performance.conformance.test.ts` and come from two regexes:

| regex | failures | the code emits |
|---|---|---|
| `/Pull-?ups\|Pull-?Down/i` | 5 (S-003 ×2, W-001 ×2, P-005) | `'Pull ups'` (`triathlon_performance.ts:747, 796, 994, 1038`), `'Lat Pull Down'` (`:739`) |
| `/Pull-Aparts/i` | 2 (S-004 ×2) | `'Band Pull Aparts'` (`:821, 1072, 1389, 1465`) |

`Pull-?ups` matches `Pullups` and `Pull-ups` — never a space. The failure messages indict themselves: *"missing vertical pull — got [… **Lat Pull Down**, Face Pulls, **Band Pull Aparts** …]"*. The exercise named as missing is in the list the assertion prints.

✅ **THE CONFIRMING DETAIL:** power/peak emit `'Pull-ups (Explosive)'` WITH the hyphen (`:1342, 1366`) and those tests PASS. The tests pass exactly where the spelling happens to match the regex. That rules out a real coverage gap.

⛔ **DO NOT WIDEN THE REGEX.** Michael: *"It makes seven tests green and re-arms the trap for the next rename."*

✅ **THE FIX — one canonical spelling, no hyphens** (`Pull ups`, `Band Pull Aparts`, `Pull ups (Explosive)`), applied to the code AND to `docs/STRENGTH-PROTOCOL.md §3.8`, which spells them hyphenated. ⚠️ **Spec and test agree with each other today and both disagree with the code — fixing only one side moves the disagreement rather than ending it.**

⚠️ **AND IT NEEDS ENFORCEMENT OR IT IS CONVENTION**, which has already failed three times on `preferred_days.strength` (§0g). Options are reported separately; the scope is **148 distinct name literals across ~10 protocol files, all free strings**.

⚠️ **SCOPE CAVEAT: "no hyphens" cannot be blanket.** Legitimate hyphens live in qualifiers and compound modifiers — `'Single-Leg RDL (Heavy DB)'`, `'Inverted Ring Row or Band Row (Chest-Supported)'`, `'Bodyweight Squat (3-2-X tempo)'`. The rule holds for the MOVEMENT NAME; it cannot be a global strip.

⚠️ **CORRECTION 2026-07-28 — A TYPED `MovementPattern` ALREADY EXISTS** (`src/lib/exercise-config.ts:45`,
nine values, 134 of 135 entries mapped, added under Q-181). What is missing is the field on
`StrengthExercise` (`protocols/types.ts:153`) — **not the vocabulary.** ⛔ The conformance fix is
therefore to carry the EXISTING pattern onto the emitted row, never to mint a second taxonomy. See
Q-212's scope section for the measured coverage.

⛔ **AND Q-212 IS THE REASON THE FIELD IS WORTH ADDING BEYOND FIXING TESTS.** Arrived at from the
opposite direction on 2026-07-28: Q-212's fix — substitute the assistance MOVEMENT when it collides
with the day's main lift — needs a rule that knows a bench press and a dip are both pushing. The only
thing available today is the display name. ⚠️ **So Q-212 is unbuildable cleanly until this field
exists, or it gets built on the same string proxy that just cost seven conformance tests.** A missing
field that only breaks tests is a hygiene item; one that blocks a training decision is not.

⛔ **THE PATTERN FIELD STAYS ON THE LIST, AND IT IS THE REAL FIX.** `StrengthExercise` (`protocols/types.ts:153`) has `name, sets, reps, weight, target_rir, notes` and **no movement-pattern field**, so a test asserting PATTERN COVERAGE can only regex a DISPLAY STRING. Michael: *"the naming rule makes these tests correct; it doesn't stop a legitimate rename from breaking them again"* — `Chin ups` for `Pull ups` is a real possibility and would break them a second time.

⚠️ **THIS IS §0f WITH A WORKED EXAMPLE, AND A BETTER ONE THAN THE PLACEMENT CASE, BECAUSE HERE THE PROXY HAS ALREADY FAILED.** A requirement with no field to carry it gets proxied, and the proxy is what breaks. Seven pattern-coverage assertions went red from a cosmetic spelling difference without one prescription changing.

⛔ **MEASURED 2026-07-28 — the scan is the lint minus the enforcement, so the count and a working
detector came out of one pass.** Every `name:` literal sitting next to `sets`/`reps`/`weight` across
`shared/strength-system/**` + `src/lib/assistance-menu.ts`, run through the REAL `canonicalize()`
(imported, not reimplemented — reimplementing the lookup would be the same proxy defect being measured).

| | count |
|---|---|
| distinct exercise names emitted | **111** |
| HIT the curated map | 33 |
| **MISS → slugify fallback** | **78** |
| of the misses: a curated key for the SAME movement already exists | **19** |
| of the misses: name CONTAINS a curated movement (leading modifier) | 26 — ⚠️ upper bound, needs a call per row |
| of the misses: no curated movement anywhere in the name | 33 |

✅ **SO C IS SMALL AT ITS CORE AND THE TAIL IS A JUDGEMENT CALL.** 19 rows are unambiguous map gaps —
`Lat Pull Down` → `lat pulldown`, four spellings of `Single-Leg RDL`, three of `Push-ups`. Another 26
contain a curated movement but need a human decision, because containment is not identity: `Jump Squats`
contains `squat` and **is not a squat for 1RM purposes**. The remaining 33 are genuinely outside the
vocabulary (`Foot Doming`, `Tibialis Raises`, `Skater Hops`) and `other` may be the right answer for them.

⚠️ **THE QUALIFIER SPLIT IS REAL AND IT IS THE BIGGER HALF OF THE 19.** 13 of the 19 differ from a
curated key ONLY by a trailing parenthetical — `Goblet Squat (Heavy)`, `Hip Thrusts (Fast Concentric)`,
`Bodyweight Squat (3-2-X tempo)`. Those do not want new map entries; they want the canonicaliser to strip
the qualifier before lookup. **A different fix from a missing row, exactly as Michael predicted.**

⛔ **AND THE LIVE CONSEQUENCE IS ON TICKET 2'S PATH, NOT THE MUSCLE MAP.** `'Hip Thrusts'` canonicalises
to `hip_thrust`, which **is in `STRENGTH_ANCHORS`** (`compute-facts/index.ts:869`) — so it earns an e1RM,
a trend and a State verdict. `'Hip Thrusts (Fast Concentric)'` slugifies to
`hip_thrusts_fast_concentric`, is **not** an anchor, and is **excluded from `learned_fitness.strength_1rms`
entirely**. The same lift, in the same block, is tracked or invisible depending on whether the protocol
appended a qualifier — and `strength_1rms` is the exact field Ticket 2 wants to read.
⚠️ **This is Q-197's shape recurring** (*"Squat e1RM is split across TWO canonical names"*), which was
filed 2026-07-22 and mostly closed. A fix that lives in one branch is not a fix.

⛔ **Q-197 RECURRED SIX DAYS AFTER IT WAS CLOSED, AND THE VERDICT IS: THE CLOSE WAS SOUND, THE FIX
DID NOT REACH THE GENERAL CASE.** Not premature — Q-197 shipped `3f983bc8`, was DEPLOYED, was
VERIFIED-in-DB (squat went 4→7 sessions in the 12-week window), and carried 7 fixtures. It did
everything it claimed. **What it claimed was two of three decoration classes.**

| how a real name misses the map | fixed by |
|---|---|
| **SYNONYM** — `Barbell Back Squat`, `Conventional Deadlift` | Q-197, 2026-07-23 |
| **PLURAL** — `Bulgarian Split Squats` | Q-197, 2026-07-23 |
| **QUALIFIER / SEPARATOR** — `Hip Thrusts (Fast Concentric)`, `Single-Leg RDL (Heavy DB)` | ⛔ never in scope → **this entry, 2026-07-28** |

✅ **SO THE NEXT OCCURRENCE IS NOT NEW — it is a fourth decoration class, and it should be filed
against this lineage.** The lesson is the one §0g already records in different words: a fix aimed at
the INSTANCES that were found does not cover the SHAPE. Q-197 enumerated the names it had seen;
nothing asked "what else can decorate a name?" until the count was measured.

### ✅ WHAT SHIPPED 2026-07-28 — the qualifier strip and its enforcement

⛔ **Ordered AHEAD of Ticket 2 by Michael**, because `learned_fitness.strength_1rms` is the field
Ticket 2 reads and the anchor-drop corrupts it: *"That's not a data-hygiene issue, it's a correctness
precondition."*

| | |
|---|---|
| **The strip** | `canonicalize()` now tries a candidate ladder — as-given, qualifier stripped, hyphens spaced, both — and **only ever wins on an EXPLICIT curated entry** |
| **One map gap** | `'lat pull down'` / `'lat pull-down'` added. ⚠️ Not a separator case: the curated key spells `pulldown` as ONE WORD, so no normalization reaches it. It needed a row |
| **Two properties pinned** | ⛔ never over-merge (`Jump Squats` stays its own bucket) · ⛔ never churn an unmapped slug (a name that misses anyway keeps today's key, so its history does not split) |
| **The lint** | `_shared/exercise-name-lint.test.ts` — every emitted name must resolve, or sit on an explicit `UNRESOLVED_ALLOWLIST` that **may only shrink** |
| **Result** | names resolving to a curated movement **34 → 53**; `muscleGroup() === 'other'` **78 → 59** |

✅ **THE GENERAL RULE, AND IT IS THE REUSABLE PART OF THIS TICKET — ASK THE MODULE, DO NOT RE-DERIVE
ITS ANSWER.** When a caller needs to know something a module already decides, the answer is an exported
predicate, not a local reimplementation of the module's logic. Michael: *"Recomputing the lookup
caller-side would have been this ticket's own defect one level up."*

⚠️ **AND THE TELL IS THAT THE RE-DERIVED VERSION LOOKS RIGHT.** *"Is the result different from the
slug?"* is a perfectly reasonable local check that is WRONG for every name whose curated value equals
its own slug — `Pallof Press` → `pallof_press`. It would have passed review, silently under-reported
coverage, and put the false positive inside the very lint written to catch this class. **The conformance
tests are the same shape one level up (§0f): a caller proxying a decision the owner should have been
asked for.** A proxy fails quietly; the owner cannot.

⚠️ **THE PREDICATE IS EXPORTED ON PURPOSE.** The lint asks `isCuratedName()` rather than recomputing
the lookup, because the obvious local version — *"is the result different from the slug?"* — FALSE
POSITIVES on every name whose curated value equals its own slug (`Pallof Press` → `pallof_press`).
Recomputing it on the caller's side would have been this entry's own defect, one level up.

✅ **VERIFIED RED-GREEN-RED, both halves** (§0d — these were new tests, so neither had ever failed):
the over-merge guard was broken deliberately with a containment-based merge and went **red**; the lint
was fed a fake `'Nonexistent Widget Press'` in `minimum-dose.ts` and went **red, naming the file**.
Baselines after: `_shared` **1353**/0 (was 1348 — the five new tests) · `shared` 174/7 ·
`generate-run-plan` 33/2 · `generate-combined-plan` 438/3. **The other three are unchanged.**

⛔ **IMPROVED, NOT SOLVED — 59 NAMES STILL LAND IN `other`, AND 34 → 53 MUST NOT READ AS DONE.** Just
over half the emitted vocabulary now resolves. The remaining 59 earn no e1RM trend and file their volume
outside any real muscle group. ⚠️ **The only reason this is not urgent is that the field has no live
reader** — `workout_facts.strength_facts.muscle_groups` is consumed solely by
`strengthSessionLegPosteriorRelevant`, and `buildCoachingContext` has zero call sites. **That is a
reprieve, not a resolution**, and it expires the moment that reader is wired. ⛔ The lint is what keeps
the number honest: it cannot silently grow, and the allowlist can only shrink.

⛔ **TWO THINGS ARE OWED BEFORE THIS COUNTS AS DONE, AND BOTH ARE THE WAY Q-197 HALF-LANDED.**

1. **DEPLOY — `canonicalize.ts` is a `_shared` file, so 22 edge functions carry their own frozen
   copy** (`adapt-plan`, `analyze-*`, `coach`, `compute-facts`, `compute-snapshot`,
   `create-goal-and-materialize-plan`, `generate-*`, `workout-detail`, …). ⚠️ **Until every one is
   redeployed the strip changes NOTHING in production**, and there is no error that says so.
2. **BACKFILL — the strip fixes FUTURE writes only.** Existing `exercise_log` rows keep the
   `canonical_name` they were written with, so a lift already split across
   `hip_thrust` / `hip_thrusts_fast_concentric` stays split until those workouts are recomputed.
   Q-197 closed this loop with `recompute-workout` over the 13 affected workouts and verified the
   buckets collapsed — **the same step is owed here and has not been run.** ⛔ Not a direct DB write.

⚠️ **THE 26 CONTAINMENT CASES WERE LEFT ALONE DELIBERATELY** and sit on the allowlist. Michael:
*"Leave them until someone can rule on them one at a time."*

⚠️ **CORRECTION TO THIS ENTRY'S FIRST VERSION — I OVERSTATED THE MUSCLE-GROUP CONSEQUENCE.** All 78
misses do land in `muscleGroup() === 'other'`, and `'Lat Pull Down'` genuinely files outside `back`. But
`workout_facts.strength_facts.muscle_groups` has **exactly one reader** —
`strengthSessionLegPosteriorRelevant` (`_shared/build-coaching-context.ts:29`) — and
`buildCoachingContext` has **zero call sites in the repo**. So the data is wrong where it is stored and
**nothing reads it today**. Wrong-and-unread, not wrong-and-surfaced.
⚠️ It is still worth fixing before that reader is ever wired, because the failure would be silent when it
lands: the ratio is `legs+posterior / total`, and an inflated `other` bucket sits in the DENOMINATOR — so
a mis-filed name **suppresses** a leg-day signal rather than erroring. ⛔ **And note the shape: computed,
stored, no live reader — that is Q-211 again, with the value wrong on top.**

⚠️ **AND THE SPELLING DRIFT ALREADY COSTS MORE THAN THE TESTS.** `_shared/canonicalize.ts` maps `'lat pulldown' → 'lat_pulldown'`; the protocol emits `'Lat Pull Down'`, which misses the curated map and slugifies to `'lat_pull_down'`. `MUSCLE_GROUP` (`:212`) knows `lat_pulldown` and not `lat_pull_down`, and `muscleGroup()` (`:223`) falls to `'other'` — so that exercise's volume lands outside `back` in `workout_facts.muscle_volume`. The tests are the visible symptom of a drift that is already mis-filing data.

---

## Q-211 — Computed correctly, then thrown away — five instances, and it is the house disease (2026-07-28, pattern named)

**COMPUTED CORRECTLY, THEN THROWN AWAY — five instances, and it is the house disease rather than five unrelated bugs.**

**Status:** pattern named 2026-07-28. Two instances FIXED, three OPEN.

**Found:** Michael, on the fifth instance surfacing in one day: *"That's the fifth thing found today that's computed properly and thrown away — worth naming as a pattern rather than four unrelated bugs."*

| # | what is computed | where it dies | state |
|---|---|---|---|
| 1 | `stackedWith` — label, gap hours, `order: 'lift_first'` | zero consumers; the composer reads `slots` and discards the rest | ⛔ **OPEN.** §0f's fourth instance |
| 2 | `placement_compromises` | written, then discarded before render | ✅ fixed 2026-07-28 |
| 3 | the reason a preview FAILED | swallowed by the catch | ✅ fixed 2026-07-28 |
| 4 | `learned_fitness.strength_1rms[lift].value` | `generate-strength-plan/index.ts:99-105` reads `last_logged` and `sample_count` off the same object and never `value`; maxes come from `performance_numbers` one line up at `:60` | ⛔ **OPEN** — this is Ticket 2 |
| 5 | the client e1RM on EVERY 5/3/1 AMRAP | `isAmrapBaseline` (`StrengthLogger.tsx:3394`) fires on `set.amrap === true` and computes into `baselineTestResults`; the only writer is a button gated on `isBaselineTestWorkout` (`:5457`), and the block deliberately carries no `1rm_test` tag. Discarded on unmount | ⛔ **OPEN** |

⚠️ **THE DISTINCTION FROM A STARVED SYSTEM** (`CLAUDE.md`'s opening law): a starved system never runs because its INPUTS are null. These all RUN, correctly, and produce a right answer with no reader. **Starved is a plumbing job upstream; this is a plumbing job downstream.** Both look like "the feature does not exist."

⚠️ **AND #5 IS THE ONE THAT SHOULD CHANGE HOW THIS IS SEARCHED FOR.** It is not a missing field or an unread column — it is a correct value living in React state that is discarded when the component unmounts. Grepping for unread fields would never have found it.

✅ **THE CHECK IS ALREADY WRITTEN — §0f:** *for each requirement, which field carries this, and who reads that field?* This entry is the evidence that the check needs running as a SWEEP rather than case by case.

**Related:** §0f in `docs/SPEC-week-solver.md`, Q-208 (a reader refusing a link that survived).

---

## Q-213 — `no-unused-vars` on `strength-system`: measured, and deliberately NOT enabled (2026-07-28, DECIDED — do not re-measure)

**Measured:** `deno lint`'s `no-unused-vars` reports **38** across `supabase/functions/shared/strength-system`. **28 of them are unused function PARAMETERS, not locals** — so enabling the rule would require `_` prefixes across four protocol files, and `_hasCable` asserts "deliberately ignored," which is a claim nobody has made. ⛔ Deleting them instead is worse: parameters are positional, so removing one shifts every later argument at every call site — `createSMSession(tier, hasCable, limiter, …)` would start reading `limiter` as `hasCable`, silently.

**Decision: not enabling it, and not clearing them.** The honest fix is narrowing the signatures and their call sites, which is a refactor rather than lint hygiene. The 10 genuinely-dead declarations were removed by hand (commit `86bb2a76`) after each was checked for side effects; the linter's output was the lead, never the authority.

⚠️ **AND THE OBVIOUS HYPOTHESIS ABOUT THE IGNORED EQUIPMENT FLAGS IS WRONG — CHECKED, NOT ASSUMED.** Seeing `hasCable` / `hasBox` / `hasBench` accepted and never read, the natural read is that the protocol prescribes equipment work without gating on it. It does not: **`triathlon.ts` emits ZERO cable or box exercises.** They are vestigial signature width — threaded in, never needed. This is **unrelated to F-5** in `docs/BUILDER-SWEEP-FINDINGS.md`, which is the reverse problem (band exercises with no `hasBands` flag at all). A future session will form the same hypothesis; it has already been tested.

**Client side, for completeness:** `noUnusedLocals` on `tsconfig.app.json` yields **424** errors against a baseline that is already **319** with the flag off. Not a toggle either.

---

## Q-214 — Main-lift REGION adjacency is not an input to placement: two pressing days in a row are never priced (2026-07-28, VERIFIED by enumeration, NOT built)

**Parent of Q-212.** Q-212 is assistance colliding with the day's main lift; this is **main lifts colliding with each other**. Michael: *"Two consecutive pressing days is what makes the dips collision hit twice instead of once. Fixing the assistance while the main-lift adjacency stays is treating the symptom."*

### Where the assignment happens, and what it scores on

`_shared/week-solver.ts` `solve()` (`:388`). It is a **SEARCH, not a sequence of hard rules** — exhaustive recursion over all 7 days per lift (`:470`), pruned by the hard law, keeping the lexicographically smallest score vector. ✅ **So a new scored term is a genuine addition to an existing mechanism, not a restructuring.** The vector (`scoreKey:226`), in order:

`restShortfall · breachPenalty · stackPenalty · stackHostPenalty · spreadPenalty(lower↔lower) · upperSpreadPenalty · upperLowerShortfall · shapePenalty · orderPenalty · preferredMissPenalty · canonicalAssignment`

### ⛔ THE FINDING: there is a term that LOOKS like it covers this, and it cannot move

`upperSpreadPenalty` (`:295`) measures the tightest gap from each upper day **to any other lifting day** — not upper-to-upper. Measured across four legal arrangements of Michael's own week:

| arrangement | `upperSpread` | press gap |
|---|---|---|
| **picked** — Bench mon · OHP tue · Squat wed · DL fri | **−1** | 1 |
| Bench tue · OHP thu · Squat wed · DL fri | **−1** | 2 |
| Bench tue · OHP sat · Squat wed · DL fri | **−1** | 3 |
| Bench mon · OHP thu · Squat wed · DL fri | **−1** | 3 |

**Identical for every one.** ⚠️ **This is §0e exactly — a check whose metric cannot move is not a check.** And the asymmetry is the tell: `spreadPenalty` *does* compare lower↔lower specifically. The lower region has a spacing term; the upper region has one that cannot see itself.

⛔ **AND THE LAW AFFIRMATIVELY PERMITS IT:** `upper_body_strength × upper_body_strength = 0h`. So a region-spacing term is a **preference above the law**, which is §4.1a's territory — it needs an owner and a stated reason, and Michael's proposed shape (scored, never hard) is what §4.1a asks for.

### ⚠️ TWO CORRECTIONS TO THE TICKET AS RAISED — both found by enumerating instead of reasoning

**1. The proposed alternative is ILLEGAL, not unevaluated.** *"Mon Squat, Tue OHP, Thu Bench, Fri Deadlift"* puts a lower lift 24h after the Sunday long run, and `long_run × lower_body_strength = 48h`. The solver pruned it under the hard law with a stated reason. ⛔ **For that specific week the engine did evaluate and reject it** — the "never generated the alternative" framing does not hold there.

⚠️ **The lower lifts are in fact FORCED to Wednesday and Friday** by that 48h rule plus lower↔lower 48h plus the Tuesday quality run. There is no lower-body choice to make in this week at all.

**2. The cost is not what the ticket estimates.** The stated cost was the squat moving to 24h after a long run. It isn't: of **40 legal arrangements, 36 keep a rest day and 24 both separate the presses AND keep one.** The real cost sits in `upperLowerShortfall` — picked = **3**, the nearest press-separated alternative = **6**. The solver is optimising upper↔lower spacing (mined from `week-optimizer:1638`'s preferred 3-day floor) and paying for it in press adjacency it cannot see.

### ✅ SO THE CONCLUSION STANDS, AND FOR A BETTER REASON THAN THE ONE PROPOSED

The current arrangement is defensible — it wins a real term against every press-separated alternative. **But nothing weighed the presses.** Michael: *"a defensible outcome for a reason never evaluated"* — §0j's shape, one subsystem over. ⛔ The fix is a scored region-spacing term that breaks ties when nothing more important is at stake, gets overruled when something is, **and records which happened**, so the next session reads why rather than reconstructing it from the arrangement.

### ✅ DECIDED — where the new term ranks, and the rename shipped

⛔ **THE TRADE IS REAL AND NAMING IT IS THE DESIGN.** The current arrangement wins `upperLowerShortfall` 3 vs 6 against every press-separated alternative, so a press-spacing term is not free — it has to rank somewhere in the vector.

**Michael's call: BELOW `upperLowerShortfall`, ABOVE `shapePenalty`.** *"Upper↔lower spacing came from a stated floor and has an owner; press adjacency is a real cost but a softer one. Ranking it under means it only moves the arrangement when upper↔lower is already tied — which, given 24 of 40 legal arrangements both separate the presses and keep a rest day, it often will be. That's the tie-break behaviour I wanted, not an override."*

✅ **THE RENAME SHIPPED SEPARATELY (2026-07-28), because it is a defect whether or not the new term is ever built.** `upperSpreadPenalty` → **`upperToNearestLiftPenalty`**, which is what it measures. Michael: *"Rename it to what it measures, or the next session reads it as covering presses exactly as I did."* The block comment now states the measurement, the −1-across-four-arrangements evidence, and that press-to-press remains unpriced.

**Related:** Q-212 (the symptom), §0e and §0j in `docs/SPEC-week-solver.md`.

---

## Q-215 — The easy-run placer cannot choose a FREE day, cannot see lifts, and asserts a 6h split it never asked about (2026-07-28, VERIFIED by code trace, NOT built)

⛔ **THE CODE PREDICTED THIS EXACT BEHAVIOUR BEFORE IT HAPPENED, AND THAT IS THE STRONGEST EVIDENCE HERE.** `place-week.ts:87`, written 2026-07-26:

> *"MIN_STACK_GAP_H STAYS AT 6 — it is the floor that makes a stacked day survivable when the athlete cannot split any further, **not the arrangement to aim for. A scheduler that treats 6h as equal to 24h will stack by preference and quietly cost the aerobic side.**"*

Two days later the composer stacked a 57-minute easy run onto the **Back Squat** day — the developing lift under `strength: develop` — at the 6h fallback, **while Wednesday sat completely empty.** The warning was authored before the behaviour it describes.

⚠️ **NOTHING REGRESSED, AND THE RULE WAS NEVER SQUAT-SPECIFIC.** The upper-days-only exclusion covered **both runs and rides** and closed **both squat and deadlift** days. It was lifted deliberately 2026-07-28 (`67a62bb4`, Michael's call) because it produced one ride instead of two and runs on three consecutive days. ⛔ Do not "restore" it — read that decision first.

### ⛔ CORRECTION 2026-07-28 — FINDING 1 BELOW IS WRONG. Free days ARE used first.

**Retracted before it was built on.** `strength-primary-plan.ts:874` consumes every free day for easy
runs and **reserves exactly one as the rest day** (Sunday preferred, else the last free day). The
lift-day candidate list is the **OVERFLOW** path, not the primary. In the week that raised this there
was one free day — Wednesday — and it was deliberately held as rest. A commented history sits right
there: an earlier version filled every free day and produced **seven active days with no rest**, and
the composer's own tests caught it.

⛔ **So "the search space excludes the best answer by construction" was false**, and the fix it implied
would have spent the athlete's rest day. Finding 2 is the real one and is fixed below.

### ✅ FIXED 2026-07-28 — the overflow ranking now knows what a lift is

`easyRunAnchorAdjacencyPenalty` takes three arguments and **all three are runs**. It priced distance
from the quality run and the long run, so in a Sun-long / Thu-hard week it chose the **squat** day
(score 0) over the **bench** day (score 4, for sitting beside the long run) — an easy run on the
developing lift, bought with a day of run spacing.

✅ **The law already draws the line and is now consulted.** `stackNeedsRecoveryGap` is true only when
both sessions have `leg` prime movers: an easy run beside a bench shares nothing and the matrix asks
for no gap; beside a squat it is the same legs twice and the law asks for six hours. **The session copy
has said so for weeks; only the choice of day was blind to it.**

⛔ **The magnitude is derived, not picked.** The anchor term's ceiling is 8 (+4 beside each run pin, both
at once). The leg cost sits **above** that ceiling, which makes the ordering categorical: in a block
where strength is the goal and running is held at maintenance, protecting the developing lift outranks
every easy-run spacing consideration. ⚠️ It does not FORBID a heavy-leg day — when nothing else is
free it is still chosen, and the 6h note rides with it.

**Verified:** the easy run moved from Tuesday (Back Squat) to Monday (Bench Press) on the week that
raised this. Wednesday is still the rest day. Three fixtures in `run-placement.test.ts`, red-green-red
by zeroing the penalty.

### 1. ⛔ THE SEARCH SPACE EXCLUDES THE BEST ANSWER BY CONSTRUCTION

`strength-primary-plan.ts:905` builds `runCandidates` from **lift days only**:

```
[...upperLiftDays, ...MAIN_LIFTS.filter((l) => l.isLower).map(liftDay)]
```

**A day with no session on it cannot be selected.** In the week that raised this, Wednesday was empty — the easy run could have gone there with no stack, no gap and no interference, and it was never on the ballot. Michael: *"That's not a tuning problem, it's a search space that excludes the best answer by construction."*

⚠️ Note the asymmetry with the lifts: the lifts got an exhaustive solver over all seven days (Q-214). The runs are ranked over a hand-built candidate list.

### 2. THE RANKING CANNOT SEE LIFTS AT ALL

`easyRunAnchorAdjacencyPenalty(day, qualityRunDay, longRun)` (`_shared/week-optimizer.ts:108`) takes three arguments and **all three are runs**. It prices +4 beside the quality run and +4 beside the long run. There is no term for a heavy-leg day, and none for which lift is developing.

Tuesday won with **penalty 0** — it is simply far from Thursday and Sunday. The cost of landing on the developing lift's day was never counted. ⚠️ Same shape as `upperToNearestLiftPenalty` (Q-214): a ranking that reads as though it weighed something it structurally cannot see.

### 3. `canSplitDay` IS NEVER POPULATED — and this one reaches the athlete

`place-week.ts:97` states the requirement: *"the intake must still ASK whether the day can be split rather than infer it from the athlete accepting a stack."* **Nothing in the codebase sets it.** `strength-primary-plan.ts:701` says it is deliberately not set, and `stackGapHours()` returns `0` when it is undefined.

The session note nevertheless reads *"leave 6h before the run"* as a flat instruction. ⛔ **An athlete who cannot train twice in a day is being told to do something they cannot do, stated as though it had been checked.**

### 4. ⚠️ THE NOTE'S GUIDANCE IS UNSOURCED, AND THE CODE ALREADY SAYS SO

`strength-primary-plan.ts:1095`: Robineau's 0h arm stacked lifting with **hard** endurance; this is a lift plus an **easy** run, which is not the tested condition. The comment ends: *"⛔ Do not attach a citation here without one that tested lifting + easy running same-day."*

✅ **Recorded here NOT as a reason to remove the note** — resistance-first is still correct when sessions cannot be separated — **but so nobody later attaches a citation that does not test the condition.** The guidance is reasoned; it is not evidenced.

### The evidence base, for whoever builds this

| source | finding |
|---|---|
| **Robineau 2016** (n=58, 7 wk) | half-squat 1RM **+16.8% @0h · +31.2% @6h · +25.9% @24h**; VO2peak higher at 24h than at either 0h or 6h |
| **Schumann 2022** | strength attenuation p=0.043 same-session, n.s. at ≥3h |
| **Eddens 2018** | +6.91% lower-body strength for resistance-first ordering |
| `STRENGTH-PROTOCOL §6.2` | easy run as recovery flush — lower first, 6h gap |

⛔ **24h IS THE TARGET, 6h IS THE FALLBACK. They are not equivalent**, and the aerobic side is where the difference shows.

**Related:** Q-214 (the same "term that cannot see it" shape, on lift placement), §0e and §0j in `docs/SPEC-week-solver.md`.

---

## Q-216 — The invariant: no stage rewrites a name another stage has already rendered (2026-07-28, class named, PARTIALLY closed)

**Raised by Michael while closing the `Face Pull` / `Band Face Pulls` instance:** *"The class isn't fixed by B, only this instance. The real defect is that materialize rewrites rows an earlier stage already described in prose."*

**The instance.** `materialize-plan:1109` substitutes assistance by equipment — a face pull becomes `Band Face Pulls` for an athlete with bands and no cable — and rewrites the exercise ROWS. The session description was authored a stage earlier and kept the old name, so one session card showed one movement under two names.

✅ **CLOSED FOR ASSISTANCE (option B, 2026-07-28).** The prose now names only the prescribed work — jumps and the main lift — and `strength_exercises` is the single owner of what the movements are. Garmin already built its steps from the rows (`send-workout-to-garmin:770`), so the prose was a second copy nothing downstream depended on.

⛔ **NOT CLOSED AS A CLASS, AND HERE IS THE EXPOSURE.** The substitution triggers on `face pull`, `dumbbell`, `db `, `cable`, `leg curl`, `lateral raise`, `farmers carry`, `sandbag lunge`, `sled push`, `sled pull`, `barbell hip thrust`, `band`. **None of the four main lifts matches that list — so main-lift names in prose are safe by COINCIDENCE OF THE LIST, not by design.** Add one trigger that matches a main lift and every strength description in the app goes stale silently.

⚠️ **AND THE INVARIANT IS ALREADY VIOLATED IN THE OTHER DIRECTION.** `materialize-plan:3432` rewrites `description` and `rendered_description` to correct a race-day pace. So the codebase already accepts that a later stage may edit prose an earlier stage wrote — which means the rule cannot be *"prose is immutable"*. The honest form is the one Michael stated: **no stage rewrites a name another stage has already rendered** — either the later stage updates every rendering, or the earlier stage does not render what the later stage may change.

**What would close it.** Either (a) the substitution layer becomes the single place movement names are resolved, before any prose is authored, or (b) every rewrite carries a matching prose update the way the race-day pace path already does. ⚠️ (b) is what exists and it has been applied exactly once, for one field, which is why this recurred.

**Related:** Q-212 (routed a face pull into the push slot, which is why this became reachable on every press day), Q-210 (the same "two spellings of one movement" family, one layer down).

---

## Q-217 — The ceiling paragraph is written as an exception and fires as a rule (2026-07-28, DESIGN, measured across four athletes)

**Found by generating four DIFFERENT athlete profiles rather than one.** Michael: *"That's the coverage gap I flagged earlier — every decision calibrated against one profile with unusual numbers."*

| athlete | maxes | lifts pinned |
|---|---|---|
| A — cold start, ordinary intermediate | 155 / 205 / 245 / 105 | **3 of 4** (bench, squat, OHP) at cycle 3 |
| B — strong, trains continuously | 225 / 315 / 405 / 110 | 1 of 4 (OHP) |
| C — detrained | 135 / 175 / 215 / 85 | 2 of 4 |
| D — light bars | 95 / 110 / 135 / 65 | **3 of 4**, one at cycle **2** |

**It is arithmetic, not an edge case.** The training max starts at 85% of the 1RM, the cap is 90%, and a 12-week block runs two or three increments. For anyone whose bars are not large enough for +5/+10 to be a small percentage, the gap closes inside the block. ⛔ **Most athletes will hit this.**

### ⚠️ THE PROBLEM IS THE COPY, NOT THE CAP — Michael's read, and it is the cheaper of the two

> *"Copy written as an exception, firing as a rule, is a different kind of dishonest — it tells the athlete something unusual happened when nothing did."*

The paragraph (`strength-primary-plan.ts:996`) says: *"That is usually the number on file being out of date rather than a limit — a fresh test would let it keep climbing."*

⛔ **FOR SOMEONE WHO JUST ENTERED ACCURATE MAXES AT SIGNUP, THAT SENTENCE IS FALSE.** They are pinned because 85% plus three increments reaches 90%, not because their record is stale. The engine cannot currently tell a stale max from an accurate one, so it asserts the more flattering of the two for everybody.

✅ **The honest version says what actually happened:** this block takes these lifts to the top of their allowed range, and re-testing before the next block is how they keep moving. **That is true for everyone it fires on.** The stale-max framing is true only for people who have outgrown their file.

### ✅ AND THIS RAISES TICKET 2'S VALUE

Michael: *"Once the 1RM learns from AMRAPs, the pinning resolves itself for the people who've actually gotten stronger, and the paragraph only fires on people who genuinely hit their ceiling."*

⛔ **So the two are ordered:** rewrite the copy now to something true for everyone, and Ticket 2 is what later makes the *stale-max* reading earnable — because only a learned 1RM can distinguish the two populations. Until then, asserting it is a guess wearing a diagnosis.

⚠️ **NOT PROPOSING TO MOVE THE CAP.** The 90% ceiling with truncation is D-326's decision, one day old, and it superseded a 100%-and-hold that was wrong for stated reasons. If pinning is the expected outcome then the cap is the design, not a guard — but that is a separate call and it needs the same evidence base the cap itself got.

**Related:** Ticket 2 (the 1RM-learning ticket — see the ENGINE-STATE banner), Q-211 (the client already computes the e1RM that would settle this and discards it).

---

## Q-218 — Equipment substitution reaches some plans and not others, and absent equipment is read as "bodyweight only" (2026-07-28, VERIFIED on a throwaway user)

**Found by running a throwaway account through the real edge-function chain** — the first time materialize's output has been looked at directly rather than inferred.

### The inconsistency

A throwaway athlete with **resistance bands and no cable** — the exact branch at `materialize-plan:1109` — generated a Strength Focus block whose stored rows read **`Face Pull`**, with no rename and no `light-medium resistance` note. **Michael's own block, same movement, same layer, reads `Band Face Pulls`.**

⛔ **THREE CANDIDATES WERE CHECKED AND TWO ARE RULED OUT:**

| candidate | verdict |
|---|---|
| the synthetic baselines were the wrong shape | ⛔ **ruled out** — the intake writes `equipment: { strength: [...] }` (`TrainingBaselines.tsx:991`), which is exactly what the script wrote |
| materialize never ran | ⛔ **ruled out** — `create-goal:2640` invokes `activate-plan`, which calls `materialize-plan` |
| a per-row guard skips assistance | ⛔ **ruled out** — `substituteExerciseForEquipment` is called for every entry in `exs`, with no `load_prescribed` check |

✅ **So the substitution BLOCK is not reached for these rows.** Note there are already **two** copies of the same setup (`:1878` and `:2172`) — two paths through row processing — and the strength-primary plan evidently takes a third, or an earlier return.

⚠️ **THIS IS DIRECTLY UPSTREAM OF Q-216.** That ticket assumes a later stage rewrites names an earlier stage rendered. If the rewrite fires on some plans and not others, the invariant cannot be reasoned about until this is settled — *"the same movement gets renamed on one plan and not another"* is the thing to fix first.

### ⚠️ AND A SECOND FINDING, §0h — absent equipment is indistinguishable from "I own nothing"

`materialize-plan:1878` reads `Array.isArray(baselines?.equipment?.strength) ? … : []`, and `:1103` sets `bodyweightOnly = equipment.includes('Bodyweight only') || equipment.length === 0`.

⛔ **So a MISSING equipment record and an athlete who explicitly answered "bodyweight only" produce the identical prescription.** An intake that was never completed silently downgrades every substitutable movement to its bodyweight variant — a real training decision made from the absence of a signal, with nothing saying so.

*(Michael predicted this shape and guessed it would SKIP substitution; it does the opposite and substitutes toward bodyweight. Same principle, opposite direction.)*

**Related:** Q-216 (the rename invariant this is upstream of), F-5 in `docs/BUILDER-SWEEP-FINDINGS.md` (band exercises with no `hasBands` flag — the reverse gap).

---

## Q-219 — Three names for one plan, and one of them is factually wrong (2026-07-28, Michael's, small)

**Michael:** *"Is part of the problem that we are calling Strength Focus Get Stronger, the old name 5x5 the old name?"* — raised after a session burned four failed attempts guessing the payload shape.

| name | where | status |
|---|---|---|
| **Strength Focus** | the plan header, the athlete-facing label | current |
| **Get Stronger** / `get_stronger` | the goal id and the routing path | old display name, id still load-bearing |
| **`strength_protocol: 'five_by_five'`** | stored on the goal | ⛔ **factually wrong — the protocol is 5/3/1** |

⛔ **THE THIRD IS THE ACTUAL PROBLEM.** Michael: *"`five_by_five` isn't a stale label, it's a lie about what the plan does. Anyone reading that field — or writing a rule that branches on it — would build against a protocol that isn't there."*

⛔ **DO NOT RENAME THE STORED VALUE.** Same reasoning as `AssistanceSlot` keeping `'push'` (Q-212): it is persisted on existing goals and renaming strands them. What it needs is a comment saying what it actually means and when it stopped being true, or a mapping layer that reads it correctly.

✅ **The display names are worth converging.** *"Strength Focus"* and *"Get Stronger"* for one path reads as two features to anyone who sees both.

### ✅ THE PAYLOAD RECIPE — keep this, it is what the four failed attempts bought

| | |
|---|---|
| auth | ⛔ a **service-role** call is REFUSED (`requireUserIdFromRequest`). Sign in as the user and send that access token |
| `sport` | **`'run'`**, not `'strength'` — `sportFromPosture` reads the ENDURANCE postures, and Strength Focus keeps run and bike at `maintain` |
| `goal_type` | `'capacity'` (any discipline developing) |
| protocol | `strength_protocol: 'five_by_five'` inside `training_prefs` |
| shape | `{ user_id, mode: 'create', action: 'keep', plan_start_date, goal: { name, goal_type, target_weeks, sport, priority, training_prefs } }` |

---

## Q-220 — The reset threshold cuts a training max for a session the book calls a pass (2026-07-28, VERIFIED against the primary, LIVE IN CODE)

> ✅ **RE-VERIFIED 2026-07-29 AGAINST THE BOOK ITSELF, by this session.** The 2nd-edition PDF was searched directly: the phrase *"always be able"* does not occur anywhere in the text, and no five-rep rule at 95% appears. Every prescription reads `95% x 1 or more reps`. ⚠️ **The earlier claim that "the full 134-page 2nd edition was searched" could not be reproduced** — no copy of the text had ever been in the repo, so that search was unverifiable until Michael supplied the PDF. The conclusion was right; the evidence for it was inherited. See D-337, which also found the OPPOSITE error in our own draft: Wendler DOES carry an estimated max, and it is Epley.

⛔ **`verdictFrom95Set` resets anything under five reps**, and there is no middle:

```
return repsAchieved >= VALIDITY_CHECK_MIN_REPS ? 'advance' : 'reset';   // MIN_REPS = 5
```

A reset drops the working number **10%** (`RESET_FRACTION`).

⛔ **THE BOOK PRESCRIBES 95% × 1+.** *5/3/1* 2nd ed **p23**: week three is `75% x 5 · 85% x 3 · 95% x 1 or more reps`. **One rep at 95% is the prescription being met.** An athlete who grinds out four reps has done four times the stated minimum — and we cut their training max by 10% for it.

⚠️ **AND THE RULE WE CITE FOR THE THRESHOLD IS NOT IN THE BOOK.** `SPEC-get-stronger` §1 states it as Wendler's own: *"You should always be able to hit at least five reps at 95% of your working number."* Searched the full 134-page 2nd edition — **that sentence, and any five-reps-at-95% rule, is absent.** The phrase *"always be able"* does not occur.

**What the book actually says the trigger is** (**p30**): *"You keep on increasing the max you're working from every four weeks **until you can no longer hit the prescribed sets and reps**."* The prescribed rep at 95% is one. So the honest trigger is **missing the prescribed minimum**, not falling short of an invented one.

### Why this matters more than it looks

- It is the **only** advancement gate. There is no `hold` band between advance and reset — every logged week-3 session either climbs or drops 10%.
- It fires on the athlete's own logged work, so it is the one place the engine acts on performance. Getting the threshold wrong here is worse than having no gate.
- ⚠️ **Not currently harming anyone** — it only fires on a rebuild with logged sessions, and there are none yet. But it is wired and deployed.

### What it probably should be

Not proposing a number without a decision. The shape the primary supports:

| reps at 95% | verdict |
|---|---|
| **0** — logged, failed the lift | reset |
| **1–4** | ⚠️ the prescription was met. `advance` or `hold`, **not** `reset` |
| **5+** | advance |

⚠️ `Forever` may well carry a five-rep rule — it is where leader/anchor and the 25–50 assistance range come from, neither of which is in the 2nd edition either. ⛔ **Until someone reads it, the threshold cannot be attributed to Wendler and should not behave as though it were.**

**Related:** Q-217 (the ceiling — same family: an invented guard standing in for the book's own performance test), `SPEC-get-stronger.md` §T2b.


---

## Q-221 — Cutting to 2 run days does not save a day, it inflates the long run past every coaching ceiling (2026-07-29, MEASURED — Michael DECLINED the warning, do not build it unasked)

**Measured on a 20 mi/wk athlete — an ordinary base, not an edge case:**

| shape | sessions | long run as share of the week |
|---|---|---|
| 3 runs | Hill 3.7 · Easy 7.1 · Long 9.1 mi | **45%** |
| 2 runs | Hill 3.7 · Long 16.0 mi | **80%** |

- **The day is not saved.** Every shape — 2, 3 or 4 run days, 1, 2 or 3 rides — lands on **6 training
  days, 1 rest**. Four lifting days plus the fixed endurance pins already fill the week, and the
  endurance stacks onto lift days. **Dropping an endurance day only redistributes volume.**
- **The field's ceiling** is a long run at roughly a third of weekly volume, half at the outside. 80%
  is not a maintenance long run, it is a weekly race. Michael: *"no one is running a 16 run once a
  week."*
- ⛔ **HE DECLINED THE WARNING.** A "your long run is N% of your week" flag was offered and turned
  down. **Do not build it because this entry exists** — this is a LEAD, and the reason it is written
  down is so the measurement is not redone. *(`CLAUDE.md`: a Q-entry is a lead, not a verdict.)*
- **Where it would go if ever wanted:** the `volume` step of `NonRaceBuilder`, computed off
  `targetMiles ÷ runDays`, not in the composer — it is an intake-time consequence of a pick.

> **↩ Related:** **D-330** (the scheduler screen where the pick is made) · the *"at 10 mi over 3 run
> days the long run is the same length as the easy run"* oddity in the ENGINE-STATE banner, which is
> the same arithmetic failing at the other end.

---

## Q-222 — Our stall reset lands ~18 points lower than Wendler's, because the buffer is charged twice (2026-07-29, MEASURED against the primary — NOT changed, needs a decision)

Found while verifying D-337 against the book.

| | mechanism | lands at |
|---|---|---|
| **Wendler** | on a stall, take a **fresh rep max**, estimate from it, use **90% of that** as the new training max | ~90% of 1RM |
| **Ours** | `RESET_FRACTION = 0.10` applied to the existing working number | ~**72%** of 1RM |

The gap is not rounding. Our working number **starts** at `WORKING_NUMBER_PCT_OF_1RM = 0.85` — a deliberate buffer for concurrent athletes, documented at `wendler-531.ts:86` as *"the least aggressive deviation from standard that still buys the buffer."* A reset then cuts a further 10% off that. **0.9 × 0.85 ≈ 0.72.**

**So the buffer bought the safety once and the reset charges for it again.** Every subsequent cycle climbs from the lower number.

⚠️ **TWO REASONS THIS MIGHT STILL BE RIGHT.** Conservative is the house position, and Wendler's re-estimate assumes an athlete who will actually go and take a fresh rep max — which this app cannot assume. ⚠️ **AND ONE REASON IT MIGHT NOT.** His reset **re-anchors on a performance**; ours just cuts a number, which is the calendar-not-evidence pattern the whole strength gauge is trying to leave behind.

⛔ **DO NOT PATCH THIS.** It changes prescribed weight for real athletes. It needs a `D-NNN` with a stated position on whether the 85% buffer and the 10% reset are answering the same question twice.

⚠️ Coupled to the fact that the reset path **only fires on a rebuild** — see Q-223. On a first block nothing resets at all.

---

> ✅ **CLOSED 2026-07-30 by [D-341].** The working number no longer advances on the calendar — a
> cycle with no logged evidence resolves to `hold`, pinned by fixture. Everything below is history.

## Q-223 — The earned advance only runs on a rebuild, so a first block climbs on the calendar (2026-07-29, KNOWN — now DISCLOSED in the partner doc rather than fixed)

`strength-primary-plan.ts` authors all twelve weeks **before a single set is performed**, so no logged evidence can exist for a fresh block. It passes `unknownMeans: 'advance'`, and every cycle resolves to a calendar step.

**This falsified a sentence in the partner-facing protocol** — *"Week 3 is the measurement... it is what decides whether the working number advances."* True of a rebuild, false of a first block, and it was in the positioning section rather than a footnote. The doc now says a first block carries a **projected** progression that a rebuild corrects.

⚠️ **NOT A BUG, AND NOT NOTHING.** The verdict machinery is built and correct (`computeCycleVerdicts` → `verdictFrom95Set` → `applyVerdict`, D-326 layer 2 / D-335). What is missing is a trigger: nothing recomputes mid-block off logged week-3 sets. The honest close is either a mid-block recompute, or the disclosure that now stands.

⛔ **The disclosure is load-bearing while this is open.** If the sentence goes back to claiming the AMRAP decides the advance, it is false again for every athlete's first block — which is every athlete, once.

---

## Q-224 — The run half of the deposit claim has no source (2026-07-29, SEARCHED — nothing found)

D-336 sourced the deposit claim to Llanos-Lagos et al. 2026 (*Eur J Appl Physiol* 126(1):193-222). That review is **endurance cyclists only**.

`DOCTRINE-aerobic-maintenance.md` had claimed it *"improves run and bike performance after prolonged submaximal work."* **The run half is not in that paper and no source for it was located.** Both docs now state the deposit for cyclists.

⚠️ **THIS MATTERS COMMERCIALLY, not academically.** The deposit is the strongest claim the product has and the one the positioning doc says to lead with — and the primary athlete on this path is a **runner**. Stating it to a runner is generalising past the evidence.

**What would close it:** a meta-analysis or review of heavy strength training on running economy or running performance with the same shape. Berryman et al. and Rønnestad & Mujika are the obvious places to look; neither has been read. ⛔ **Do not cite either from memory** — this is exactly how the 262-participant number ended up graded "STRONG" with no author for weeks.

---

## Q-225 — A four-day athlete should be able to condense to three mid-block (2026-07-29, Michael's ask — NOT built, deliberately deferred)

Michael, on shipping the lifting-days card: *"we can add later if you need to condense your week the 4 day guy can always 3 day it."*

**The intake choice is currently a BLOCK-LIFETIME decision.** `liftingDays` is read once by the composer, which authors all twelve weeks from it. An athlete whose life changes in week 5 — a job, a newborn, a travel stretch — has no way to fold their week down without rebuilding the whole block.

⛔ **AND IT SHOULD BE CHEAPER THAN IT SOUNDS, WHICH IS EXACTLY WHY IT NEEDS CHECKING BEFORE ANYONE BUILDS IT.** The pieces exist:

- The composer already handles both shapes and solves the test week separately (D-332).
- `create-goal` already passes `cycle_verdicts` on a **rebuild**, and a rebuild is what would re-author the remaining weeks.
- `adapt-plan` already rewrites `computed.steps` on future rows and already invokes `materialize-plan`.

**So this is probably a rebuild with a changed `lifting_days`, not new composition logic.** ⚠️ *Probably.* Trace it before proposing — `cycleVerdicts` indexing differs between rebuild-mid-block and fresh-block, which is the same reason the block-boundary training-max handoff was deferred (see ENGINE-STATE, "the block boundary discards the training max").

### ⛔ THREE THINGS THAT MUST HOLD, AND THEY ARE THE DESIGN

1. **The completed weeks are history and do not move.** Whatever shape they ran in, they ran in.
2. **The max-test week survives the fold.** The whole reason three days is defensible is that week 3 goes back to four (D-332). A condense that quietly drops that turns the option into the thing it was built to avoid — and nothing would look broken.
3. **It is a CONDENSE, not a subtraction.** All four lifts stay. §5.2b: this codebase's habit under pressure is to silently return fewer sessions than were asked for.

⚠️ **DIRECTION MATTERS TOO.** Three → four is the easier case and probably worth having in the same change: an athlete whose week opens up should be able to spread back out.

⚠️ **AND IT IS AN ADJUST-TAB FEATURE, NOT AN INTAKE ONE** (`ARCH-strength-spine.md` §3.5: build time is omakase, Adjust is à la carte, and each item states its cost). The cost here is already written — it is the copy on the intake card.

### ⛔ THIS IS A REMATERIALIZER FEATURE. DO NOT BUILD IT STANDALONE.

Michael, same day: *"thats why im down streaming it — we will ad a rematerialze option on the state screen to adjust your loads or endurance work."*

**So the home for this is the rematerializer on the State screen**, not a one-off control on the lifting card. Condensing four days to three is ONE instance of a general capability — re-author the remaining weeks of a live block from a changed input — and the same surface is meant to carry **load adjustment** and **endurance-volume adjustment** too.

⚠️ **THE REMATERIALIZER WAS CANCELLED MID-SESSION ON 2026-07-29 AND IS DEFERRED, NOT DEAD.** Michael: *"lets let go of materilizer... i would rather get all the juggle math figured out and dieals all the acceroy dialed and make sure this plan is 100% sound for 4 out of 5 hybrid coaches."* That work is now largely done (D-332 through D-337), so the reason for the deferral has mostly been spent.

⛔ **BUILDING THIS AS A LIFTING-DAYS CONTROL WOULD BE THE FOURTH PLAN-MUTATION PATH IN THIS CODEBASE.** There are already three placement authorities (`ARCH-strength-spine.md` §0.6) and four plan generators, both from exactly this move — solving one instance of a general problem in its own file. Wait for the general surface.

---

> ✅ **CLOSED 2026-07-30 by [D-341].** `rematerialize-strength-block` is the wire: it proposes, the
> athlete taps, and only weeks that have not started are rewritten. The sheet lives in the LOGGER, at
> save. Everything below is history.

## Q-226 — The rematerializer has TWO customers, and one of them closes Q-223 (2026-07-29, Michael's scoping — NOT built)

Michael: *"so the rematerializer has two customers: 1rm change during plan and state sceen for any adjustments."*

| customer | trigger | what it re-authors |
|---|---|---|
| **1. A max changes mid-plan** | the athlete tests, or a week-3 AMRAP is logged | the remaining weeks' working numbers |
| **2. The State screen** | the athlete asks | loads, endurance volume, lifting days (Q-225) |

### ⛔ CUSTOMER 1 IS THE MISSING TRIGGER IN Q-223, AND THAT MAKES IT THE LOAD-BEARING ONE

Q-223 records that the earned advance **only fires on a rebuild**: a fresh block passes `unknownMeans: 'advance'` and authors twelve weeks with the bar climbing on the calendar. The verdict machinery is built and correct — `computeCycleVerdicts` → `verdictFrom95Set` → `applyVerdict` (D-326 layer 2, D-335). **What is missing is something that runs it mid-block. That thing is customer 1.**

So this is not two features. **It is one mechanism whose first customer turns a disclosed limitation into a closed loop** — the difference between *"week 3 is the measurement"* being true and being a sentence the partner doc has to hedge.

⚠️ **AND THE 1RM SIDE IS ALREADY HALF-WIRED.** `adapt-plan action=auto` fires on every ingest, already auto-progresses strength loads off the `exercise_log` e1RM trend, writes `plan_adjustments`, and invokes `materialize-plan`. ⛔ **Trace that before designing anything** — the risk here is building a second thing next to it rather than feeding it. It also **skips the Arc fatigue/taper/adherence gate** that the `suggest` path applies, and **the athlete is never asked**, both of which matter more once a max change can move the bar.

### ⛔ WHAT MUST HOLD FOR BOTH CUSTOMERS

1. **Completed weeks are history.** `applies_from: today` — the past is never rewritten.
2. **The max-test week survives** every re-author (D-332). A rematerialize that drops it breaks the only reason three days is defensible, and nothing would look broken.
3. **All four lifts survive.** §5.2b — silent subtraction is this codebase's habit under pressure.
4. **An untrusted estimate does not compound.** D-335: `advance_untrusted` means the next standardised read SUPERSEDES that number. A rematerializer that treats every e1RM as equal quality undoes that distinction.
5. **The athlete is told what moved and why.** Customer 2 is an explicit request, so it may act; customer 1 fires on ingest, and D-326's whole argument is that the gauge must not grade its own homework silently.

⚠️ Michael cancelled the rematerializer on 2026-07-29 to get the block sound first. That reason has now largely been spent (D-332 → D-337). **This is the next real piece of work on this subsystem.**

---

## Q-227 — The strength GAIN signal reads one input, gated on a field nobody fills any more (2026-07-29, TRACED — this is the read plumbing Michael is auditing next)

Michael: *"this is how it reads the lifts to output gains — it was running on RIR and we do amraps now and 'how hard did it feel'."* Traced the same day so the audit does not start from zero. ⛔ **Nothing here was changed. This is a map, not a fix.**

### WHAT THE SIGNAL ACTUALLY IS TODAY

`_shared/state-trend/strength.ts` builds a per-lift dated series where `value = exercise_log.estimated_1rm` — Brzycki over whatever the session's top set was — and reports `latestE1rm` / `bestE1rm` plus a verdict. **That is the whole gain signal.** One input.

### ⛔ FOUR THINGS IT CANNOT SEE

1. **RIR IS STILL THE CONFIDENCE GATE, AND RIR IS NO LONGER COLLECTED.** `compute-facts/index.ts:~929-939` buckets each lift's e1RM by `avg_rir`: sessions at RIR ≥5 are "far from failure" and demoted to a low-confidence fallback (D-118 / Q-039 / Q-040). The barbell block's logger **no longer asks for RIR** (`strength-profiles.ts` `usesRir` — dropped because `brzycki(weight, reps + rir)` added phantom reps to a sub-maximal set). So the field arrives null, null falls into `preferred`, and **the gate is a no-op.** ⚠️ It fails SAFE — nothing is wrongly demoted — but it is a built system starved of its input, and anyone reading the code will believe a confidence check is running.

2. **THE DIFFICULTY TAP WRITES AND NOTHING READS.** D-326 layer 1 persists the three words into `strength_exercises` (no migration, `topSetIndex`, 11 tests). `strength_facts` still carries `avg_rir` and has **no difficulty field**. So *"how hard did it feel"* reaches the database and stops.

3. **THE SERIES CANNOT TELL A MEASUREMENT FROM AN ORDINARY DAY.** Week 3's all-out set at 95% and a week-1 top set are the same kind of point on the trend. The one number in the block that IS a measurement gets averaged in with the rest. ⛔ **This is the blocker under the other three** — like-for-like comparison, provenance, and trusted-vs-not all need this distinction to exist first, and nothing carries it.

4. **`advance_untrusted` HAS NO READER.** Shipped 2026-07-29 (D-335): above 8 reps — 5 on deadlift — the bar advances and the estimate is flagged as taken outside the range the equation holds in. The State strength row cannot say so, so a shaky number renders identically to a clean one.

### ⛔ THE THREE TRAPS, ALREADY NAMED — do not re-derive them

From D-326's *"the server half is not a port"*:
- **Difficulty has no prescription**, so the existing actual-vs-prescribed machinery does not apply to it.
- **A raw slope flags everyone every cycle.** It has to compare like-for-like — week 3 against week 3.
- **Re-including `BodyTrends.strength` before those two are solved reinstates the D-318 false-strain bug** on a new input.

### WHERE I WOULD START, AND WHY

**Mark the week-3 AMRAP points in the series.** It is the smallest change that unblocks the other three, and every one of them is impossible without it.

⚠️ **AND ONE BLOCKER THAT IS NOT ABOUT STRENGTH AT ALL: Q-208.** `plans.status = 'active'` is used as an IDENTITY filter on historical reads, so a workout attached to an older plan reads as unattached. A Performance screen showing history across blocks is exactly where that surfaces. It has been live for three days.

⚠️ **AND WHAT THE NUMBERS MEAN IS Q-223.** The State strength row already shows a per-lift verdict and a suggested weight with an adjust modal — but on a first block the working number advanced on the calendar, not on evidence. Wiring a screen to it makes the screen inherit that.

---

## Q-228 — A one-week condense for the four-day lifter, as a courtesy (2026-07-30, Michael's idea, unbuilt)

Michael: *"the 4 day person gets a lift a day- if they have a condensed scheuler it sold be great for them to be able to satack upper and lower days"* — then, narrowing it himself: *"this would be for a week this is a courtesty fo rthe 4 day person"*.

### THE ASK

A four-day lifter has a bad week — travel, a short week, whatever — and wants **that week only** condensed to three lifting days by pairing the upper lifts. The block's shape is untouched; next week returns to four.

⚠️ **THIS IS NOT Q-225.** Q-225 is condensing *the block* mid-flight and belongs on the rematerializer. This is one week, reverting on its own, and it is a much smaller and safer thing. Do not merge them.

### MOST OF IT IS ALREADY BUILT

- **The pairing rule exists.** D-332 ships three-lifting-day mode: the composer pairs Bench + Press on one day, and it already knows the cost.
- **A current-week strength re-layout path exists** — `adapt-plan`'s `maybeRelayoutStrengthForCurrentWeek`. It fires on ingest today and **nobody can ask it to run.** That is the seam: let the athlete ask.
- Everything else in the week — runs, rides, the long day — stays where the optimizer put it.

### ⛔ THE ONE RULE IT MUST REFUSE

**Never on week 3 of a cycle** (weeks 3, 7, 11 in a twelve-week block). That is the 95% week, the heaviest reading of the cycle, and stacking bench under press there means measuring the second lift fatigued — on the set whose rep count is supposed to set the next cycle's weights. `strength-primary-plan.ts` already refuses this in three-day mode (`isTestWeek`) and splits back to four lifting days; a mid-block condense has to honour the same line.

⚠️ **Michael had the week number backwards** (thought it was the week-4 deload). Worth stating plainly here because the correction matters: **week 4 is the DELOAD** — 40/50/60%, no all-out set, stack it freely. Week 3 is the protected one.

---

## Q-229 — Draggable easy sessions on the calendar (2026-07-30, Michael's idea, unbuilt)

Michael: *"could we make the calnders workouts moveable per day?"* — then, drawing the line himself: *"you cant break rules, but you can move easy rides and runs, little things"*.

### WHY THE LINE HE DREW IS THE WHOLE DESIGN

Free drag-and-drop would hand back a hand-edited week the engine never designed and cannot reason about — the same objection that keeps Q-225 on the rematerializer. **Restricting it to the flexible sessions removes that objection entirely:** the engine keeps every placement the block depends on, and nothing the athlete moves can break the design.

### WHAT EXISTS

- **The validation is done.** `validate-reschedule` + `RescheduleValidationPopup` already move a planned session and check the placement against the block's rules. This is a GESTURE on top of a working reschedule, not new logic.
- **"Which sessions may move" is already computable.** Sessions carry quality/hard/long classification (`isQualityRow` / `isHardRow`, `intensity_class`, tags) and strength days carry their clearances. Draggable = the easy run, the easy ride, the courtesy swim. Everything else pinned.
- Because only harmless sessions move, **most drops are legal by construction** — the rules check is for the edge (dropping onto a day already carrying two sessions), not the common case.

⚠️ **The cost is mobile drag on a scrolling list**, which is where this kind of feature normally eats its time — not in the logic.

---

> ✅ **CLOSED 2026-07-30 by [D-340].** Both parts shipped. Part A: `generate-strength-plan` stamps
> `strength_protocol`, one resolver (`_shared/block-identity.ts`) reads both dialects, unknown stays
> silent. Part B: `NonRaceBuilder` persists `goal_focus` on the GOAL, and it ships WITH readers —
> the coach payload's `plan.block` and `session_detail_v1.block`. Audit F9 closed with it.
> ⚠️ Existing goals are NOT backfilled: their focus was never recorded, so they read `unknown`.
> Everything below is history.

## Q-230 — The plan builder has to tell State what the block IS: one protocol answer, and the goal type (2026-07-30, unbuilt)

Michael: *"we will have numerous protocols so it has to be smart and our plan builder needs to know how to communicte sorrectly to it"* — then: *"and state knows the goal? from race to stregnth to vo2 max to speed to distance"*.

**These are ONE job.** Both are the builder failing to hand State a fact about what the block is for, and both end the same way: a surface reasoning about training it cannot identify.

### PART A — WHICH PROTOCOL

Different generators stamp it differently. Run/tri plans write `config.strength_protocol`; a strength-primary plan writes nothing and identifies itself as `config.source = 'strength_primary'`. `materialize-plan` knows both; `coach` knows only the first. **The readers are not wrong — they are being told two different things.**

Consequence, live: `readStrengthProtocol(null)` never speaks, and `protocolExpectsE1rmToDip(null)` returns false, leaving the generic *"Estimated one-rep maxes have been sliding — the one being built"* un-suppressed on a block designed to dip. Audit F3; same class as Q-166.

**Three rules:**
1. **Every builder stamps it the same way**, once. This is the root — fix the write side, not the readers.
2. **One resolver reads it**, the way `plan-phase.ts` owns phase (D-261, written after three sites disagreed).
3. ⛔ **UNKNOWN MEANS SILENT, NEVER A DEFAULT.** An unrecognised protocol says nothing about the block and logs loudly.

⚠️ **NOT A FALLBACK, AND THE WORD MATTERS HERE.** Michael, on hearing it: *"i have fallabck ptsd from early AI builds of this app that were all fallbacks and nothing worked."* He is right, and the code agrees: `resolveProfile()` returns `durability` for ANY unrecognised id, which made a missing entry and a deliberate choice indistinguishable at every call site — and caused the same bug twice (Q-192, then again as `strength_primary` in D-322). `strength-protocol-registry.test.ts` exists to end that class. A silent default is the failure mode; a single resolver that admits ignorance is the fix.

### PART B — WHAT THE GOAL IS

State knows the LEAD DISCIPLINE (`primary_discipline`) and the POSTURE per discipline (develop / maintain / out), and whether a race exists. **It does not know the goal type.**

So chasing speed and chasing distance both arrive as *"run: develop"* — indistinguishable. Same for VO2 max. State can tell strength from running; it cannot tell one running goal from another, and every read it makes about "the one being built" is blind to what is being built toward.

`goal_type` already exists on the goal (`non-race-goal-seeds.ts`: `build_endurance` / `build_speed` / `get_stronger` / `build_muscle` / `maintain` / `starting_over`). It simply never reaches the payload's plan slice (`coach/types.ts:162` — `has_active_plan`, `plan_id`, `plan_name`, `week_index`, `week_intent`, `week_focus_label`, `week_start_dow`).

⛔ **DO NOT SHIP PART B AS A FIELD ALONE.** A `goal_type` written to the payload and read by nothing is the exact disease the 2026-07-30 audit spent a day clearing (the difficulty tap, `advance_untrusted`, the RIR confidence gate — all built, all starved). Land it WITH the first reader that changes behaviour, or not at all.

### RELATED

Audit F9 (`docs/AUDIT-performance-state-2026-07-29.md`) is the same root one level down: the payload carries no protocol, no week-in-cycle and no is-measurement either. Fix the seam once and F9 closes with it.

---

## Q-231 — A Strava import lands the runs but not the ANALYSIS, so a new athlete starts on a population constant (2026-07-31, Michael's catch — unbuilt)

**Michael, on the heat coefficient being fitted per athlete:** *"yeah lets learn them its fine but if they sync their strava we should be able to read that too, but maybe thats onboarding."*

### THE GAP

[D-346] fits the heat coefficient from each athlete's own hot-vs-cool runs. Below **8 runs** the regression cannot run and the code falls back to `DEFAULT_HEAT_K` — labelled in `_shared/heat-adjust.ts:43` as an *"UNVALIDATED POPULATION PLACEHOLDER"*. **That is the one place a population number touches a rendered verdict**, and it is exactly where a brand-new athlete lands.

A Strava sync should erase the problem — most runners arrive with months of history. It does not, yet:

| what `import-strava-history` writes | what the verdict needs |
|---|---|
| ✅ `avg_heart_rate` + heart-rate stream | ✅ |
| ✅ altitude stream (so grade-adjusted pace is computable) | ✅ |
| ⛔ **no `weather_data`** — `get-weather` is never called | needed to fit the heat term |
| ⛔ **no `workout_analysis` / `run_facts`** — the analyzer and `compute-facts` are never called | needed for the efficiency index and GAP pace |

⚠️ **So imported runs arrive RAW.** They exist, they look complete on the calendar, and they are invisible to the efficiency verdict — the "built but starved" pattern, one layer earlier than usual.

### WHAT IT WOULD TAKE — wiring, not building

- **`bulk-reanalyze-workouts` already does this pass** and is not connected to the import. ⛔ Trace it before writing anything; `CAPABILITY-MAP` also names `recompute-workout` as the correct path for a *single* correct backfill.
- **Weather backfills fine** — `get-weather` resolves historical conditions from lat/lng + timestamp, so an old run gets its real temperature, not a guess.
- ⚠️ **Rate limits are the real constraint,** not correctness: Strava's API is throttled (the import already logs `X-RateLimit-*`), and an analysis pass over months of history is a lot of invocations. This wants to be a background job with progress, not a blocking onboarding step.

### WHY IT IS FILED, NOT BUILT

The floor holds without it: under 8 runs the athlete simply gets no verdict, and the chart fills as they train. This removes a placeholder constant and makes day one useful — **it is an onboarding improvement, not a correctness fix.**

⚠️ **AND IT IS WORTH MORE THAN IT LOOKS.** An athlete who syncs Strava and sees a full chart with their own learned heat coefficient on day one has been shown something no competitor gives them. An athlete who syncs and sees an empty row has been shown nothing.

---

## Q-232 — The durability read cannot be fixed the obvious way: a pinned regression forbids it (2026-07-31, ATTEMPTED AND REVERTED)

**Michael:** *"fix em."* This one could not be fixed. Recording the attempt so the next session does not spend the same hour.

### THE FAULT (real, measured)

`isQualifyingDecouplingRow` gates on `isSteadyAerobic(workout_type)`, and `workout_type` reads
`steady_state` on **all 25** of this athlete's logged runs — an 11-minute jog and a hill session
included. It excludes nothing. His 2026-07-28 hill drills entered the durability trend at **24.9%**,
which is what pushed the Friel band to `needs_work` and put *"pace fading on long efforts"* on screen.

⚠️ The durability line is currently **silenced in the client** (`durWord = null`) rather than fixed.
That is a render-level hack: the spine still computes a `needs_work` band from the polluted pool, and
any other consumer still reads it.

### ⛔ THE OBVIOUS FIX IS FORBIDDEN, BY A TEST WITH A BUG HISTORY

The only per-run measurement of "was this a constant effort" is `decoupling_mixed_effort` — the
variance gate (D-034/D-038), derived from pace CV on the grade-adjusted series, terrain and detected
intervals. It is `true` on **9 of his last 12 runs**. Gating on it was tried, and it fails
`session-detail/decoupling.test.ts:225`:

> *"REGRESSION: a mixed-effort steady run still reaches the durability substrate … Before the split it
> was deleted, and nothing said so on the screen."*

That test pins the D-037 fix: forcing `basis='raw'` to mark low confidence collided with 'raw' already
meaning terrain-confounded, the stamp read as a delete order, **3 of 3 runs were binned and the State
durability trend froze 16 days out of date.** Excluding mixed-effort runs re-creates that outcome by a
different route.

⚠️ **AND THE DOCS DISAGREE WITH EACH OTHER HERE.** [D-034] says mixed-effort sessions ARE excluded from
steady-effort comparison pools; `state-trend/run.ts` says the flag is *"A HEDGE, never a filter"*. The
durability trend is a steady-effort comparison pool, so both readings are defensible. **That is a
decision to be made, not a bug to be patched** — which is why this was reverted rather than argued
through in code.

### WHAT WOULD ACTUALLY RESOLVE IT

1. **Supersede the regression deliberately** — exclude mixed-effort AND render the exclusion count, so
   the failure the test protects against (silent deletion) cannot recur. On his data this leaves ~3
   qualifying runs against a floor of 8, so the row reads "not enough clean steady runs" — honest, and
   probably permanent for an athlete who runs hills.
2. **Or drop decoupling from State entirely.** [D-346] already moved the fitness verdict to
   speed-at-heart-rate, which is what the row was being asked for anyway; TrainingPeaks treats
   decoupling as a per-workout diagnostic and never trends it. ⚠️ This is the option most consistent
   with where the run row ended up.
3. **Or find a steadiness signal the variance gate does not own.** Three were tried and rejected on
   real data in [D-346] — HR variance (circular), pace scatter (penalises slow runners),
   HR-speed correlation (does not separate). Do not retry those.

⛔ **DO NOT "just fix the gate".** It has a regression test, a bug history, and two docs that disagree.
