# Decisions Log — Part 1 (D-240 → D-372)

## ⛔ FROZEN 2026-08-02 AT D-372. NEW ENTRIES GO IN [`DECISIONS-LOG-2.md`](DECISIONS-LOG-2.md) STARTING AT D-373.

**Frozen does NOT mean superseded.** Every entry below is as binding as anything in Part 2. This file
was closed at 484KB — about 120k tokens, most of a context window — because past that size it stops
being read at all. **Grep all three parts before reversing anything:**
`docs/DECISIONS-LOG*.md` + `docs/archive/DECISIONS-LOG-archive-D001-D239.md` (D-001 → D-239).

⛔ **Back-annotating still applies to this file.** If you supersede something below, come back and mark
it here.

---

Append-only record of architecture / design decisions worth preserving across sessions. Each entry captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the next session doesn't re-debate (or worse, undo) settled choices.

Numbered D-001, D-002, … in order of recording. Entries are not removed; if a decision is reversed, add a new entry that supersedes the old one and reference it.

---

> **📁 D-001 → D-239 have been moved to [`archive/DECISIONS-LOG-archive-D001-D239.md`](archive/DECISIONS-LOG-archive-D001-D239.md)** (split 2026-07-13 — this file was 830KB and unreadable).
> They are still authoritative history — **grep the archive before reversing anything**. This file holds **D-240 onward**.
>
> ⛔ **When you supersede an older entry — including one in the archive — GO BACK AND ANNOTATE IT.** See the end-of-session protocol in `CLAUDE.md`.

---

### D-240 — State screen "one clock, one place" cohesion restructure (2026-07-05, DEPLOYED coach v64→67 + client `52cd8eeb`→`2116e9f2`)

The top of State had grown three overlapping ways to say the same thing: a `WEEK · EFFORT UP` chip, a headline fusing two clocks (`This week: Balanced load. Over 6 weeks: fitness mixed`), and a "Why:" accordion. Whoop/Garmin UX research ([925studios WHOOP breakdown], the5krunner, Wareable) prescribes the opposite: ONE headline verdict, each score paired with its own driver, no nested accordions, strain is a supporting score never the crown. Restructured to match — **all subtractive**:

- **Chip removed.** Readiness ("effort up") is strain-class — never headline/crown material. The `readinessLabel` span in `StateTab` deleted; "WEEK" stays a plain section header.
- **Headline = THE WEEK only.** `buildLoadHeadline` drops the "Over 6 weeks: fitness" clause (removed `fitnessSlot`). One clock — the week's load verdict. Fitness is a *different* clock, handed to the PERFORMANCE discipline rows.
- **PERFORMANCE roll-up removed.** The synthesized `Building — bike up, run up` header (`synthesizeHeadline`) committed all three roll-up sins on real data: (1) **lossy** — collapses to one word; (2) **cherry-picking** — gates out "provisional" disciplines (`HEADLINE_GATED_DISCIPLINES`), so a declining-but-provisional swim (−3.6%) vanished from the headline; (3) **clock-mismatch** — averaged run's 42d/6wk window with bike's 56d/8wk. Rows now speak per-discipline, each owning its window; swim's decline is visible.
- **Why → BODY driver (Whoop pairing).** The RPE driver ("Monday's strength session (you rated it 9) pushed the week's effort up") moved from the headline accordion to a dim always-visible sub-line under BODY's "how hard it feels" verdict. New `readiness_rpe_driver` field (`bodyRpeDriver`), RPE-clause-ONLY (D-241). `buildReadinessWhy(rpeUnderBody:true)` drops the RPE clause from the Why so it never double-shows.
- **"N concerning signals" count fallback DELETED.** It generated the confusing amber "Why: 1 concerning signal" — a WHOOP-class non-answer (alarms without informing; contradicts a "Balanced load" headline). `buildReadinessWhy` now returns null when no NAMED driver. The `week_narrative` expand survives only when there IS narrative (traced LIVE: 10/11 coach_cache rows non-empty → gate, not delete). Section clock labels added: LOAD/BODY "last 7 days vs your typical"; PERFORMANCE "trends over recent weeks".

Files: `src/lib/load-headline.ts`, `StateTab.tsx`, `StatePerformanceSection.tsx`, `readiness-receipts.ts`, `coach/index.ts`. Fixtures: `load-headline.test.ts`, `readiness-receipts.test.ts`.

### D-241 — Constant-free RPE driver rule + RPE-clause-only under BODY (2026-07-05)

The Why NAMES the session that moved the week, not a restated verdict. Rule (`rpeWhyClause`/`bodyRpeDriver`, `readiness-receipts.ts`): the driver = the session whose excess over the athlete's own 28-day RPE baseline **exceeds all other positive contributors' excess COMBINED** — only when the verdict is elevated. Near-tie → receipt; not elevated → silent. **Rejected** the "≥2 points above typical" (and lowered "≥0.5") absolute thresholds: RPE is a 1–10 cross-discipline average, so a swim-3 next to a lift-9 is normal spread, not an anomaly — an absolute Δ gate is the wrong model. Validated on the real distribution: 7d `[9,5,4,3,3]` vs baseline 4.31 → the 9's +4.69 > the rest's +0.69 → names Monday.

**BODY driver = the RPE CLAUSE ONLY** (`bodyRpeDriver`): it sits under BODY's "how hard it feels" (RPE) row, so it must never borrow a non-RPE factor (execution, HR-drift) — that would be a mislabel (D-242). Returns null when rpe isn't declining. Pinned both directions (`readiness-receipts.test.ts`): execution-down + effort-up → only the effort clause; purely non-RPE → null.

### D-242 — The law: "label what's computed, never compute to match the label" (2026-07-05)

First-class principle, earned three times this arc: (1) the RUN decoupling lead (D-239 — led with the metric actually calculated, not the `pace_at_easy_hr` we wished we had); (2) **STRENGTH-B** — the State strength volume is genuinely a 42-day/6-week `classifyTrend`; when asked to label it "vs 28-day typical," we KEPT the 42d computation and labeled it honestly "over 6wk" rather than fabricate a 7d read to match an improvised label; (3) the fitness-verdict cohesion (D-240 — deleted the roll-up rather than compute a cross-discipline aggregate to justify a single-verdict headline). **The code is the source of truth; the label describes it, never the reverse.** This is the "no unexamined constants" law stated for computations. Corollary: if a label needs a computation that doesn't exist, that's NEW scope (its own decision), not a label fix.

### D-243 — Planned run load reads its prescription: token vocabulary + generator emission (Q-125 Gap B + Q-126, 2026-07-05, DEPLOYED)

- **Decision:** a planned run's `workload_planned` must reflect its prescribed intensity, not the flat 0.75 per-type default. Two coordinated changes: (Gap B) add the generator's real token families as substring keys in `INTENSITY_FACTORS.run` — `run_easy:0.65, warmup_run_quality:0.65, run_mp:0.82`; (Gap A / Q-126) make the non-race `enduranceSession()` EMIT a token (`run_easy_${mins}min`, or `longrun_${mins}min_easypace` on the long-run day), gated `sport==='run'`.
- **Why 0.65 for easy runs:** it matches the existing `easypace` factor — an easy run is an easy run. Critically, the OLD default (0.75) was HIGHER than the true easy intensity, so the bug INFLATED easy-run load (read hotter than prescribed), not just flattened it. `run_mp` → 0.82 mirrors `marathon_pace`.
- **Alternatives rejected:** (a) reuse `session-factory.easyRun` (miles-based `PlannedSession`; `enduranceSession` is minutes-native — a duration-native token helper is smaller and coupling-free); (b) force-recompute historical rows (rewrites planned-load history feeding adherence/ACWR — pre-launch, no live surface reads it, so go-forward-only); (c) add quality tokens to non-race easy runs (they're genuinely easy — no false intensity); (d) fix the `longrun_easypace:0.70` dead key / bike ride default in the same pass (scope-fenced — Gap A-bike is its own entry).
- **Tradeoff accepted:** strength sessions (no `steps_preset`, structural) and bike rides (fenced) stay on their per-type defaults for now; the long run computes 0.65 not 0.70 (the `longrun_easypace` key is shadowed by `easypace` matching first — a known, deferred refinement).
- **Guard:** spine-safety proven by a byte-identical strength-subset golden (`strength-primary-plan.q126.test.ts`), permanent regression — any future strength drift fails loudly. Token matching guarded by `workload-run-tokens.test.ts`.
- **Process lesson (banked, see ENGINE-STATE):** the Q-126 emitting site was mis-attributed twice by elimination before being found by reading the function. An attribution is pinned only when you've read the code that emits the field.

### D-244 — Narrative-honesty guard: enforce D-242 in the analyzer with belt-and-suspenders (Q-128, 2026-07-05, DEPLOYED)

The run `ai_summary` narrated a faded (positive-split) run as "clean execution / pace held steady" — a live D-242 violation contradicted by its own PACING/TREND rows. **Decision:** enforce D-242 at the ONE generator that owns the narrative (`generateAISummaryV1`), three layers: (1) PRIMARY — a deterministic within-run positive-split flag feeds a hard prompt rule (forbid clean/steady, name the slowdown), same mechanism as the D-092/D-093 structured-mode rules; (2) BACKSTOP — a validator that triggers the existing corrective-regen loop; (3) SEATBELT — a final deterministic strip/append (`execution-honesty.ts`) so the banned claim can never reach the screen and the fade is always named. **Rejected:** a post-hoc strip alone (when the lie is the whole sentence, stripping leaves a hole — worse than the lie), and keying "below-baseline" on `vs_similar.assessment` (it launders a much-slower run into "typical" — the confound). **Keyed on the within-run positive split ALONE** (threshold 20s/mi, tied to `build.ts`'s >15=real-split; general, not tuned). Split sourced from the post-analysis re-read (`workoutToUse`), not the stale pre-analysis read. **Standing rule banked:** an LLM-generator "it passes" claim requires ≥3 back-to-back clean recomputes, never one (fooled by variance twice here). Q-129 filed: generalize to a shared honesty spine across all narrative surfaces (the SUMMARY fallback + `hr_drift_interpretation` are unguarded).

### D-245 — GAP aggregated distance-weighted, not arithmetic-mean-of-pace (Q-130, 2026-07-05, DEPLOYED)

`overall.avg_gap_s_per_mi` was `gapSum/gapCount` — an arithmetic mean of per-sample GAP pace — while raw `avg_pace` is `total_time/total_distance` (harmonic/distance-weighted). `AM ≥ HM` by the variance of pace, so GAP read ~15s/mi slower than raw on ANY pace-varying run **regardless of grade** → false `gap_terrain_bias='downhill'` on flat routes. **Decision:** aggregate GAP the same way raw pace is — total flat-equivalent time / total distance (new pure `aggregateGapPace()` weighting each GAP pace by 1/pace). On a flat run GAP ≈ raw exactly; real grades still adjust. **Reproduced cold before fixing:** arithmetic-mean-of-RAW-pace alone = 769 vs true 754 (15s/mi, zero grade). **Rejected:** elevation smoothing (only moved it 3s/mi — the Minetti-asymmetry-on-noise residual, not the real bug) and a narrative terrain guard (would paper over a bad number). Matters beyond one narrative: GAP feeds `workload` (load/ACWR) + the pace-vs-norm baseline. Two smaller GAP siblings (per-split fallback, summary's `gap_pace_s_per_mi`) weight differently — deferred, don't feed the symptom.

### D-246 — Plan-phase-aware load verdict: "building on plan" via a separate label, marker stays raw (Q-122, 2026-07-05, SHIPPED)

> ⛔ **ITS ARTIFACT WAS DELETED. `planAwareVolumeLabel()` NO LONGER EXISTS.** Removed by the D-266 cleanup — the only surviving mention is its obituary at `src/lib/load-headline.ts:34` ("the client-side plan-phase softening (`planAwareVolumeLabel`, Q-122) was REMOVED"). D-266 never said it superseded this entry, and this entry still reads as SHIPPED.
> **Residue:** `load-headline.ts:67` still carries an **unreachable** `'building on plan'` branch in `stateSlot`, for a label nothing can produce. *(Back-annotated 2026-07-13.)*

`acwrVolumeLabel` was ACWR-only, so a high-but-on-plan build week false-alarmed as "back off." **Decision:** a NEW pure `planAwareVolumeLabel()` — ACWR in the back-off band (1.3–1.5) + `week.intent==='build'` + on-plan (`wtd_actual ≤ 120% × wtd_planned`) → "building on plan". **Option (b) coherence:** only the WORD (headline + gauge label) is plan-aware; the gauge MARKER + `acwrZone` stay RAW ACWR — honest dual read ("ACWR 1.35 · pushing" + "building on plan"). `acwrVolumeLabel` is UNTOUCHED (shared with the marker → can't desync). **Constants:** 120% overshoot (the codebase's existing threshold, not the spec's 115%); ≥1.5 redline never overridden; early-week floor (`wtd_planned_load < 150` → raw ACWR, gates Mon/Tue when the planned sum is untrustworthy). Verified the `load` object actually carries `wtd_planned_load` at runtime before building (spec claim held). Fixture-proven; live-engages once ACWR is actually in the band during a build week.

### D-247 — Narrative honesty extended to hr_drift + the SUMMARY fallback, STEADY-EFFORT gated (Q-129 point-fixes, 2026-07-06, DEPLOYED)

The 7/5 faded run lied on two more surfaces beyond `ai_summary` (Q-128): the deterministic `hr_drift_interpretation` ("Solid aerobic work") and the SUMMARY fallback (led with "Typical vs similar workouts", laundering the pace collapse). Both now guarded via the shared `execution-honesty.ts` primitive: `guardNarrativeHonesty` NAMES the fade on hr_drift while KEEPING the true HR statement (D-246 honest dual read — "Solid aerobic work" isn't a banned clean/steady EXECUTION claim); new `fadeLeadBullets` leads the fallback with the fade and drops the `vs_similar` bullet. **STEADY-EFFORT GATE:** `tripsHonestyGuard` now suppresses on `isMixedEffort` — a structured run (tempo / interval / fartlek / warmup→work→easy-cooldown) has a slower second half by design, so "fade" there would be its own lie. One gate in the primitive covers all three surfaces PLUS Q-128's `ai_summary`, closing a latent false-positive in the original guard too. Deterministic, 13 deno fixtures. Deployed `analyze-running-workout`. This is Q-129's "each point fix teaches the shared spine" step — NOT the full shared honesty spine (still Q-129).

### D-248 — Route identity is the PATH, not distance; idempotent count; runs + rides; history backfilled (2026-07-06, DEPLOYED)

The route foundation lied: "same route" was a **distance-bucket fingerprint** (200m) + distance-fuzzy match, so the SAME roads run at 4.0 vs 4.9mi split into separate "routes" (user saw "120×" / "19×"), and `sample_count` **inflated on every recompute** (non-idempotent `+1`). It read GPS but used only start/end/distance — never the path. **Rebuilt:** identity = the GPS PATH as a set of ~150m **geohash cells**, matched by overlap coefficient (`_shared/geohash.ts` + `_shared/route-match.ts`). Same roads at ANY length = one route — **full containment (overlap ≥0.9) bypasses the length guard** so out-and-back builds stay one route (Michael's "further and further out"); partial overlaps keep a 2.5× length guard. `sample_count` is now a **true recount** from `workout_route_match` (idempotent — recompute can't inflate). Honest `first_seen` = earliest RUN date. Path-created clusters carry a **path fingerprint** (`p-<hash of geohash set>`) to avoid the `user_id+fingerprint` unique-constraint collision with deactivated old clusters. Extracted to `_shared/route-intelligence.ts` (`resolveRouteCluster`) — ONE implementation for the live path (compute-facts) AND the backfill. **Rides folded into identity** (run-only efficiency metrics stay in compute-facts). **Backfilled user 45d122e7** via `backfill-routes` (batched, non-destructive — old clusters *deactivated*, not deleted; efficiency metrics re-pointed to new clusters): 225 workouts → **before** 55 fake clusters with impossible inflated counts (summed ≫225), **after** 59 real path-routes with true counts (top 40×/29×/21×, sum = 225). Deployed `compute-facts` + `backfill-routes`. **Displayed** route data on an OLD run updates on its next recompute (stored fact packet); new runs immediately. 21 fixtures (geohash + route-match + efficiency-index).

### D-249 — Efficiency direction removed from the Performance route line; State owns efficiency trends (2026-07-06, DEPLOYED)

The per-session same-route efficiency direction (raw pace-per-HR over 90 days) read **summer heat as "efficiency declining"** — same-route controls hills but NOT heat — AND **contradicted State's decoupling-led "Efficiency holding"** (scope + confound). **Removed it.** The Performance route line now shows **FAMILIARITY only** ("Same route · run 40× since 2025"), gated on the cluster total (`times_run`) not recent history (fixes the missing-line case: a route run a lot but not lately still shows). State owns efficiency trends (done carefully, decoupling-led). The honest heat-adjusted per-route trend is a REAL feature — specced separately in `archive/DESIGN-familiar-routes.md` / Q-131, not the confounded raw version. Deployed `workout-detail` + client.

### D-250 — Route-performance TREND can't rest on path-overlap route identity; adopt the SEGMENT model (2026-07-06, SPEC — `DESIGN-segments.md`; supersedes the Q-131 route-trend approach)

Built + deployed the honest heat-adjusted per-route trend (Q-131 / Familiar Routes): `_shared/heat-adjust.ts` (`dewPointF`, `heatTerm`, `adjEfficiency`, `routeTrend` = Huber-IRLS joint regression + CI-gated verdict, `routeHeadline`), the `temp_f`/`humidity_pct`/`dew_point_f` schema add + 105-row backfill, the `RouteDoorway` UI, the server `readout` in `session-detail/build.ts`. **Then proved it out on real data and it FLIP-FLOPS** ("improving" one week, "not" the next). Audit (`route-intelligence.ts` / `route-match.ts` / `geohash.ts`) found the route IDENTITY is structurally unsound: **(1) over-merges distances** — overlap coefficient on the SMALLER run's cells (`route-match.ts:39`), threshold 0.6, distance guard **bypassed above 0.9 overlap** (`:66`), 2.5× ratio otherwise → one cluster held runs **2.9–5.0mi**; **(2) fragments one trailhead into ≥4 clusters** — unordered geohash SET (precision 7), no start/direction anchor → different directions = disjoint sets = separate clusters (real: 4 IDs at 34.087,−118.181); **(3) double-counts** — `route_progress_metrics` conflicts on `(cluster, workout)` not `workout` (`compute-facts:859`) and **nothing deletes rows**, so a re-matched workout orphans a stale row (the June-14 run appeared twice). Incumbent research: Strava + Garmin both use fixed **SEGMENTS** (defined start→path→end→distance, ORDERED match); nobody uses distance-blind unordered overlap. **DECISION:** the honest "am I faster on this" for a variable-length out-and-back runner is a fixed SEGMENT (the common sub-path every run covers), NOT a variable-length route. Full spec: `docs/DESIGN-segments.md` (8 steps; 3 hard geospatial primitives — ordered path-match, segment detection, segment-effort extraction; reuses the read engine + `RouteDoorway`). The read ENGINE (`routeHeadline`/`routeTrend`, 24 fixtures) is sound and reused; the SUBSTRATE (route identity) is replaced. Build in a FRESH session (Q-132).

### D-251 — Heat variable = air TEMPERATURE, not dew point (dry-climate proof-out) (2026-07-06, in the parked engine)

`archive/DESIGN-familiar-routes.md` specced dew-point heat correction (dew point > temp/RH as the humidity-aware heat-stress signal — correct physiology). **Proved out on user 45d122e7's real data:** in his arid climate dew point barely clears the 55°F reference (`heatTerm` SD < 1.4°F on every route) while AIR TEMPERATURE swings 30–40°F (50→92°F, temp_sd 6–9). Dew-only made the feature a near-no-op and re-admitted the summer-decline lie. Switched the model's heat term to `max(0, temp_f − 60)` (`TEMP_REF_F=60`; endurance optima ~50–55°F). Dew point stays CAPTURED (`dewPointF`, stored) but DORMANT — the humid-climate refinement (WBGT proxy: temperature is the higher-value regressor when dew runs out of resolution, pre-registered). `k` stays HR-side (the PROHIBITION: pace-side coefficients like Vermeer's 0.025 are structurally invalid as a `k` source — only same-loop paired runs supply magnitude). Also decided: joint fit `efficiency ~ heatTerm + time` (Huber-IRLS), NOT residualize-then-trend (biased under dew/time correlation, Frisch–Waugh–Lovell).

### D-252 — The fitness metric shown to users is SAME-EFFORT PACE (min/mi), never an abstract efficiency index (2026-07-06)

Efficiency = speed/HR is the right UNDERLYING metric (= TrainingPeaks Efficiency Factor; State's `efficiency_index`, Law 1) but "1.83" means nothing to a runner ("no one understands it"). Pin HR to the athlete's typical effort and it becomes a PACE: "at ~145 bpm you'd run 10:20/mi." Same math, human units — the passive form of the **MAF test** (fixed HR, watch pace improve). UI shows two paces (Pace / Same-effort pace), both min/mi, temp-corrected, glass-box ("at ~145 bpm, temp-adj"). Rejected: raw efficiency index (abstract), index-to-100 (still a score nobody feels). Also banked (UI honesty): the chart draws a trend line ONLY for a confident direction — **never a sloped line under a "Holding" verdict** (the D-242 lie in UI form); and **no directional verdict under N≥8 comparable efforts** (the flip-flop was 4-effort verdicts owned by one outlier). Progressive disclosure (WHOOP/Strava research): glanceable headline → one toggle chart → tappable deep-dive.

### D-253 — Governance by construction: surfaces are disarmed, not trusted (2026-07-06, doctrine for the segment build + retroactive lens on the Q-106/107/108 debt)

The honor system already failed once: the superseded route-trend minted its verdict in `session-detail/build.ts` **while the CONSTITUTION forbade it** (Law 5). A law that depends on a well-behaved developer is a norm, and norms die at 11pm under deadline. **Doctrine:** don't forbid defection — make it *unrepresentable*. Three mechanisms, all structural:
1. **Render-ready payload — the client's contract carries no army.** The surface (`RouteDoorway`) receives ONLY `{ headline, familiarity, chart:{ points:{dateLabel,paceLabel,isBest}[], trendLine:{x,y}[]|null } }` — display strings + pre-computed trend geometry (null unless a confident direction). No slope, no CI, no raw pace/HR arrays. The client can't re-derive a verdict because it's handed *nothing to re-derive from*; it can't draw a slope under "Holding" because it isn't given one. Law 4 moves from rulebook to physics. Same guard on the server seam: the spine→`build.ts` contract passes a finished `SegmentVerdict`, never the efforts — so `build.ts` authors copy, it cannot assemble a verdict. No effort-array field in the input type = no re-derivation in review-visible code.
2. **Sub-floor verdict is type-unreachable.** `SegmentVerdict = { state:"still_building"; n } | { state:"settled"; direction:"improving"|"holding"|"declining"; ci:[number,number]; n }`. A discriminated union where the sub-floor branch has **no `direction` field to populate**. Under N<8 or an uncleared CI, a faked arrow isn't discouraged — it's unrepresentable. Six lines carry the whole floor (D-252 / §5).
3. **Defection fixtures pin the ABSENCE of capability.** Not just happy-path: `N=7 → state==="still_building" && !("direction" in v)`; `N=9, CI straddles 0 → still_building`; and a **payload-keys golden** asserting `SegmentReadout` has no `slope`/`ci`/`rawPace` key. Pinning the absence of a key is what stops a future edit from re-arming the province without review noticing.

**Sovereign caveat (keeps the doctrine from over-claiming):** construction governs the **surfaces**, not the **sovereign**. No payload contract stops the spine itself from computing the wrong verdict — construction only guarantees the wrong answer is the *same* wrong answer everywhere, so it's findable and fixable in one place. Construction stops defection; the glass box + audit receipts keep the center accountable. The pairing is the system — neither alone is enough, and this session needed both to catch what it caught. The general lint/CI gate that would enforce Laws 1/4/5 across the codebase (not just this feature) is filed as **Q-134**, deliberately NOT built here (scope discipline); segments build under governance-by-construction meanwhile.

### D-254 — Segment-model forks ruled against the LIVE DB, not the doc's word (2026-07-06, `DESIGN-segments.md` §8 / Q-132)

The five forks were ruled after a hand-run live-DB introspection (the route saga's lesson: every load-bearing claim taken on the doc's word hid something). Results, grounded in what the DB actually showed (420 fragmented `terrain_segments` micro-segments; `segment_progress_metrics` ~92% dead at 42/546 rows; correct idempotency keys on the segment tables vs the buggy `(route_cluster_id, workout_id)` on `route_progress_metrics`):

1. **Substrate — GREENFIELD, and this is SITUATIONAL, not a blanket stance.** Built new tracked tables `route_cores` + `core_efforts` rather than adopt/extend the pre-existing terrain trio (`terrain_segments` / `workout_segment_match` / `segment_progress_metrics`). The reason is specific to *that* substrate being the wrong shape for a sliced-effort claim: it stores **apportioned whole-run averages** (structurally cannot carry a sliced segment pace/HR), **folds reverse**, is a **within-run terrain-CHUNK profiler** (a different question), serves a **live consumer** (`fact-packet` terrain profiling), and its effort writer was **~92% dead** on real data. Adopting it would entangle this feature with terrain profiling and inherit its shape drift. **This is NOT a general "never migrate legacy / always build from empty prod" rule** — that would be a fabricated principle, broader than anything decided, and self-contradicting: the Constitution's annexation principle (*new code obeys; old code migrates*) still governs, and legacy WAS reused this same session where sound — the route tables kept for the familiarity line (fork 5), the read engine (`_shared/heat-adjust.ts` `routeHeadline`/`routeTrend`) reused verbatim, and `RouteDoorway` reused. **Greenfield here = "this legacy is the wrong shape for this claim,"** a per-substrate call, not a doctrine.
2. **Detection — AUTO-CORE, FROZEN, standalone pass.** Auto-detected (no creation UI); geometry frozen at birth; detection is a separate occasional pass (backfill + gated re-runs), NOT wired into per-ingest fan-out. Amendment = **insert-new-version** (`version`/`superseded_by`/`is_active`), never an in-place edit of geometry.
3. **Separate direction** — cores are direction-bucketed; a reverse traversal is a different core (the terrain trio folded reverse; we do not — enforced structurally by the forward-only ordered match, `core-match.ts`).
4. **Q-133 peel-back deferred** — the superseded route-trend read-path stays live for now; the peel-back is still owed (open action, see Q-133).

Verified end-to-end on real data, not just fixtures: one core frozen (1.83mi / N=15, his home out-and-back), and the born-once freeze guard proven idempotent (re-invoke → detected 1, frozen 0, skipped 1).

### D-255 — Consensus core detection, the floor-margin principle, and per-user calibration flagged non-universal (2026-07-06)

- **Consensus detection adopted** over the spec's LCS-over-cells (`DESIGN-segments.md` §4.2 proposed LCS/suffix-automaton; rejected as jitter-brittle and fragment-prone — the texture that made 420 micro-segments). A core is the arc-length sub-path a **strong majority of same-direction runs agree on within a corridor**, detected on **OUTBOUND legs only** — a non-obvious correctness point: on an out-and-back the return leg retraces the same geography, so including it lets a synchronized-turnaround majority form a **false backward consensus**. Yields exactly one core per (trailhead, direction) by construction (criterion 4 / the 420-fragment antidote).
- **Principle (general, reusable): freeze the LONGEST stretch that still clears the N≥8 verdict floor with margin.** Pace over a longer stretch averages out the GPS/pacing noise that swamps a short read; more efforts each carrying more per-effort noise is a worse trade than fewer efforts measured cleanly. Real-data sweep of his home stretch (37 same-direction runs) by coverage fraction: 2949m/15eff → 1101m/23 → 306m/25 → 170m/34. Chose **1.83mi / 15 efforts** (clears the floor with margin, best signal-to-noise, and it is his actual out-and-back).
- **Per-user calibration, flagged NON-UNIVERSAL (Law 2 — do not launder a fitted value as a measured constant):** `coverage_frac=0.4` and `min_core_distance_m=600` were fit to user 45d122e7's trailhead + GPS jitter via the sweep. They encode a real principle but the **numbers are per-profile**; encoded as request params with defaults in `detect-cores`, commented as calibrated-not-constant, with a `TODO(multi-user)` to move them to a per-user calibration record. A future user's different GPS/run profile MUST get its own sweep — today's good-fit values must not silently harden into everyone's defaults. Also decided: trailhead cluster radius **150m** (jitter spans ~140m; his distinct trailheads are ~8km apart, so no risk of merging distinct trailheads), and the **487m SW stub dropped** as sub-floor / too-short-to-trend (the 600m min encodes "too short to trend reliably" as a distance truth, not a data-count accident).

### D-256 — Segment build shipped LIVE (steps 0–6): 6-month recency window, N≥8 floor, the still_building/still_learning split, flag-driven surface (2026-07-07, `DESIGN-segments.md`; Q-132 BUILT)

Built end-to-end and verified LIVE on user 45d122e7's real data (not just fixtures). **Verdict taxonomy (5 states, honesty by construction):** `still_building` (below the N≥8 floor — a discriminated-union branch with NO `direction` field, D-253), `still_learning` (≥floor but CI straddles zero — the honest "holding, no confident trend"), and `improving`/`holding`/`declining` (CI clears zero). **Window = 6-month recency (183d):** his effort history is sparse-early/dense-recent, which gave one early point outsized slope leverage; a hard recency window fixes MAGNITUDE leverage (not sign). N≥8 counted WITHIN the window. Both are calibration params (tunable, non-universal, per D-255). **Metric:** leads `same_effort_pace` (efficiency pinned to typical HR, D-252); `raw_pace` fallback only when HR constant/absent (`metric_source` per-effort, computed per-slice not row-level). **Surface (Law 4, D-253):** `session_detail_v1.segment_verdicts[]` (PLURAL — a run can traverse >1 core), each render-ready `{copy, render_flags{show_arrow,show_slope,show_pct}, chart_points[], runs_all_time}`; `workout-detail` is the ONLY DB reader of `core_verdicts`/`core_efforts`; `RouteDoorway.tsx` renders flag-driven (no slope under "holding", y-axis locked across the same-effort/pace toggle, faded dots, gold PR, tap→date·pace·HR). **Registered at the 2 chokepoints:** `compute-facts` (per-ingest match) + `compute-snapshot` (verdict born on the spine, Law 5), `dry_run` threaded hub→leaf and verified visibly reaching each leaf. Live result: `still_learning`, N=21, −1.4%, CI [−11.7, 8.9] — honest, stable across recomputes. Card polish same day (HR in tap detail, brighter dots, working touch tap, legibility). Client on web (Netlify); **iOS bundle NOT rebuilt** (card is web-only until `npm run ios`).

### D-257 — Match corridor 30m→50m: real GPS exposed the 30m corridor as too strict (2026-07-07, calibration, `match-cores`)

Verifying on real data (D-255's bar) caught it: the June-28 run genuinely covered the core but its GPS ran **46–50m off the frozen line** (normal run-to-run spread — other side of the road, satellite drift), so the 30m corridor **dropped a genuine same-stretch run** → an undercount (20 matched should have been 23). Buffer sweep on that run: 30m→miss, 45m→miss, 50m→catch, 60/100/150m→catch. Set the match corridor default to **50m** (`match-cores` `bufferM`, request-param with default, flagged tunable/non-universal like the D-255 params — "verify per-user"; 50 catches his real spread without grabbing a different road). Re-matched all runs → **23 efforts (21 in window)**; verdict UNCHANGED (`still_learning`, CI tightened). Lesson (again): the fixtures were all clean geometry so 30m looked fine — only real GPS exposed it. This is also the smell that motivated D-258 — a per-user GPS-jitter constant to make a route-matcher catch variable runs is the primitive fighting the athlete's actual behavior.

### D-258 — Best Efforts becomes the PRIMARY fitness lens (cross-sport); the segment feature is demoted to SECONDARY (2026-07-07, `DESIGN-best-efforts.md`; supersedes segment-as-primary)

The segment (fixed-route) model is correct but **narrow** — it only fires when the athlete repeats an exact route. The primary user runs an **AREA** (a ~4mi shared spine, variable-length out-and-back edges, a few trailheads), not routes; forcing a route-matcher onto not-a-route produced per-user tuning (D-257's 30→50m corridor) — the tell that the PRIMITIVE is wrong for how he runs. Two user instincts drove the pivot: **"don't tune to me"** (a feature that only works calibrated to one person's GPS jitter is a demo) and **"don't do weird things other apps don't."** Incumbent research (Strava/Garmin): they solve variable-length running with **Best Efforts** (fastest pace at benchmark distances / power at durations *within any run*), NOT tighter route-matching, and they run **both** (segments + best efforts). **DECISION: Best Efforts is the primary lens; segments stay as the secondary "when you truly repeat a route" lens.** Metric (ruled same day, 2026-07-07): **PACE / SPEED — GAP-adjusted for hills, NOT HR/efficiency-normalized.** Same-effort/HR is OUT — it's murky on a *peak* effort (adjusting a max as if it were submaximal); effort is instead controlled by reading the **PR frontier** (fastest efforts carry the trend). Two lenses, both speed: raw **Pace** + **GAP pace**. This keeps the three fitness dimensions clean (Best Efforts = peak output; economy/durability stay in State + the segment). **Cross-sport (one engine, one metric per sport):** run/swim = best pace at distance (run GAP'd); **bike = best power at duration — NO GAP** (power is inherently terrain-proof). **Head start (2 of 3 hard bricks already in the repo):** `calculateBestRunEfforts` (sliding-window finder, 1mi/5K/10K + HR — raw pace, no GAP yet, `compute-workout-analysis:128`) + the GAP physics (`avg_gap_s_per_mi`/Minetti); `calculatePowerCurve` (bike, 5s–60min, no GAP) + `w20`/CTL/ATL/TSB **already on the spine**. The MISSING brick is the spine aggregation/trend, which **mirrors the just-built `compute-core-verdict`** 1:1. Spec: `docs/DESIGN-best-efforts.md` (cross-sport; §4 forks owed Michael's rulings; **bike recommended first** — cleanest, most-built). NOT built — next session. **Also banked (the three aerobic dimensions, all already measured):** peak output (best efforts — this feature), economy (efficiency/same-effort — already in State + the segment card), durability (decoupling/HR-drift — already State's primary RUN aerobic verdict, `state_trends_v1.run.decoupling`). Efficiency-as-its-own-trend is a candidate third lens but must be pinned to a fixed distance/stretch to control the heat/effort confound (exactly why State leads with within-run decoupling).

### D-259 — Load-status reconciliation: extracted to a testable module + two gates fixing the `runBodyOk` single-point-of-failure (2026-07-07, `_shared/load-status-reconcile.ts`; from real-data trace on user 45d122e7)

**Trigger (real data, D-255 bar):** the State card told the primary user "Load is high — back off and recover before your next key session" in WK1 of a new plan — after he'd run ONCE (easy Sunday), swapped Monday's run for an easy bike *because* his legs were fatigued, and swum on his own. His acute-7 load was 314 (only **58 running**, 82% cross-training), chronic 894, **ACWR 1.40**. The banner is running-framed; he'd deliberately backed off running.

**Root cause (single point of failure):** `reconcileLoadStatus` both ESCALATED unplanned load to `'high'` (harsh branch) and DE-ESCALATED it back down only via the SAME predicate — `runBodyOk && excessIsCrossTraining`, where `runBodyOk` requires **≥2 quality runs this week**. That condition is UNSATISFIABLE exactly when an athlete substitutes cross-training FOR running (few/no runs) — so the "it's just cross-training, you're fine" softener could never fire in the one case it's most true, and the load fell through to the running-overload message. The D-147 `ACWR ≥ 1.0` gate didn't help (he was at 1.40); D-146 spike-on-empty-base didn't either (chronic 894 clears the 500 floor).

**Fix — extracted `reconcileLoadStatus` (was a private ~200-line fn inside the ~5k-line coach edge file, un-unit-runnable) to `_shared/load-status-reconcile.ts`, then added TWO gates:**
- **Gate 1 — `runNotOverPlan` (phase-INDEPENDENT):** `runLoadPct == null || runLoadPct <= 0`. If you're at/under planned running (or there's no run signal), the excess *definitionally cannot be running* — so the cross-training escalation + de-escalation branches use `excessNotFromRunning = runNotOverPlan || (runBodyOk && excessIsCrossTraining)` instead of requiring two runs to "prove" it.
- **Gate 2 — build-band plan-phase tolerance (fires ONLY for `weekIntent ∈ {build, baseline}`):** mirrors `acwr-state.ts` build bands via `ACWR_RATIO_THRESHOLDS` — an uncorroborated volume `'high'/'elevated'` softens to the band the ACWR earns (`≤ build_optimal_max 1.5` → `on_target`, `≤ build_elevated_max 1.7` → `elevated`, else `high`). Applied once, after the ceiling; only ever softens.

**Null-semantics decision (chosen judgment, documented so it's findable):** Gate 1 treats `runLoadPct == null` (no planned-run match / no run-vs-plan signal) as **"not over plan" — i.e., safe to soften.** The alternative (treat null as "unknown, don't soften") was rejected because the softening is bounded on three sides: it caps at `'elevated'` (never lower on its own), requires non-fatigued readiness (`fresh/adapting/normal`), and the body-signal (`nDeclining ≥ 2`) + `'fatigued'/'overreached'` readiness raises **bypass both gates** and act as a hard ceiling. So a null run signal can never turn a genuine overload into a green light — the worst it does is decline to *raise* a purely-volume alarm. That containment is what makes null-as-safe the right default rather than a hazard.

**Fail-safe (verified by fixture matrix):** Gate 2 does NOT fire for `weekIntent 'unknown'`/other → strict general bands stand (see Q-136 — `plan_phase` is null on all snapshot rows, so `'unknown'` is the LIVE production path and Gate 2 is currently inert; Gate 1 alone still clears the false running-`'high'`, landing his real week at `'elevated'` instead of `'high'`, and at `'on_target'` once phase labeling is fixed). Suite: `{build, unknown} × {cross-training-swap, genuine-overload}` + recovery-week (gates inert) + fatigued-readiness bypass + the two Michael-WK1 regressions, all in `_shared/load-status-reconcile.test.ts` (8 passing, `deno test`). **No behavioral change during the wire** — the extracted module is the sole authority; `coach/index.ts` imports it, the inline fn + shared types/`LOAD_RANK` were deleted, the call site is unchanged (identical signature). Full `deno check supabase/functions/coach/index.ts` error count unchanged (10, all pre-existing) before/after the wire.

### D-260 — THE LAW: the reconciled classifier is the SOLE authority that mints a load verdict or prescription (2026-07-08, architectural; binds all load-system-extension work)

`_shared/load-status-reconcile.ts` is the ONLY place a verdict or prescription WORD is minted. Every other layer — raw ACWR, the per-domain ratios (Item 2), the TRIMP cross-check (Item 1), the gauge — is an **input** to it or a **display of a number**, never a source of advice. Gauges show numbers + band words ("load reading"); only the reconciler speaks. **Literature basis (the split, on the record — this is a defensible corrective, not a house quirk):** ACWR is scientifically CONTESTED, not settled. The IOC 2016 consensus endorsed it; a 2025 meta-analysis across 22 cohorts recommends using it with caution; a Bayesian re-analysis found sRPE-ACWR no better than a random-denominator control and argues against using it in isolation. Our stance threads that split — **keep the ratio as an honest descriptive number, strip its authority to prescribe, and require body-response corroboration before any cautionary verdict** (Item 3's two-key rule). This is why no gauge/label path may issue advice, why Q-137 (the `'rest now'` redline speaking over the reconciler) is closed by this law + Item 2, and why the design deliberately has **NO single grand number** ("Efforts Score"): a collapsed score can't be decomposed, so it forces trust — the glass box (witnesses + receipts + the ⓘ, Item 4) only exists because we refuse to collapse. **Vocabulary (locked):** WITNESSES = the inputs (load, HR/pace decoupling, effort-vs-typical, muscular ledger, TRIMP); LOAD READING = the LOAD row (number + band word, Item 2); RESPONSE = the BODY row (a state, not a score, Item 3 key-2); THE RECONCILER = the sole authority (off-screen). "ACWR" is internal-only — never a user-facing label again. Full spec: `docs/DESIGN-load-system-extension.md`. Consequence: any new load signal is wired as a reconciler INPUT carrying its own source + uncertainty provenance, never as a parallel verdict surface.

### D-261 — Single plan-phase resolver: fixes Q-136 Drop A (Gate 2 inert for all multi-sport AND strength plans) + Q-138 (dead `plan_phase` stub), one lineage (2026-07-08, `_shared/plan-phase.ts`)

Three sites resolved plan phase independently and disagreed: arc-context had `phase_by_week` + a `config.phases` fallback (D-039 Fix 3, and gated the contract read on `version === 1`); coach's `weekIntentFromContract` read ONLY `plan_contract_v1.phase_by_week` (no version gate); compute-snapshot wrote `plan_phase = null` and never resolved it. Real-data receipt (user 45d122e7): coach `week_intent = unknown` in WK1 of an active plan → D-259 Gate 2 permanently inert. **Root cause (Q-136 Drop A):** the primary user's active plan is `Get stronger` (`strength_primary_v1`) — it has NEITHER `phase_by_week` NOR `config.phases`; its block structure lives under a THIRD path, `config.phase_structure.phases = [{name, start_week, ...}]`. Combined/multi-sport plans use `config.phases`; standalone run/tri use `phase_by_week`; strength-primary use `phase_structure`. Coach read only the first, so **every multi-sport and strength plan resolved `'unknown'`.**

**Fix:** one shared `resolvePlanPhase(config, weekIndex)` (contract `phase_by_week` → `config.phases` → `config.phase_structure.phases` → null), consumed by coach (→ `week_intent`), compute-snapshot (→ populates the `plan_phase` column, Q-138), and arc-context (its inline copy deleted — **one lineage**; the reconciliation settles arc-context onto coach's no-`version`-gate behaviour). **Read-time** → fixes every existing plan, no regeneration. **Two deliberate map changes** (in `phaseNameToWeekIntent`, previously `else → 'build'`): (1) `deload → recovery` — a deload IS an easy week; the old fallthrough handed it Gate 2 build-band leniency on the one week you deliberately back off; (2) **default flipped to `'unknown'` (D-242 fail-safe)** — an unrecognised phase name (`Power`/`Retest`/an invented `Accumulation`) resolves to `'unknown'` → strict bands, NEVER `'build'` → lenient; only explicitly-known phases earn a mapping. **Provenance:** the resolver emits an enumerated `phase_source` tag (`'phase_by_week' | 'config_phases_fallback' | 'phase_structure' | 'unknown'`, never null) — the machine fact only (Item-4 narration maps it to English server-side, D-260 boundary); exposed in the coach payload `weekly_state_v1.week.phase_source` as the deploy receipt (like `run_only_week_load_pct: -100` proved Gate 1). **Live result for the primary user:** `Get stronger` WK1 → phase `Base` (via `phase_structure`) → intent `baseline` → Gate 2 fires (`on_target` at ACWR ≤1.5; at his current 1.578 both paths land `elevated`, so no visible change until ≤1.5). Strength-phase semantics (`Power`/`Peak`/`Retest`, and whether strength blocks need their own load tolerance vs a borrowed build-band) deferred to Q-139. Fixtures: `_shared/plan-phase.test.ts` (16, incl. real block-periodization vocab hitting the fail-safe), a `baseline`→Gate-2 reconciler fixture in `load-status-reconcile.test.ts`, and a CONSUMER-level `_shared/arc-context-phase.test.ts` (4) driving `buildActivePlanSummary` directly (pins the two arc behavior changes: phase_structure now resolves; version-less `phase_by_week` now resolves). Zero new type errors across coach/compute-snapshot/arc-context.

**BUNDLED-DEP DEPLOY HAZARD (learned here — read before editing `_shared/arc-context.ts` or any hot `_shared/` module):** edge functions bundle their imports **at deploy time**. Changing `arc-context.ts` (or deleting its inline copy of logic, as here) means every importer NOT redeployed keeps running the STALE bundle — source says one resolver, prod runs two, invisibly (split-brain). The transitive set that bundles `arc-context.ts` and MUST be redeployed together (computed 2026-07-08, 20 entrypoints): `adapt-plan, analyze-cycling-workout, analyze-running-workout, analyze-strength-workout, arc-setup-chat, coach, course-detail, course-strategy, create-goal-and-materialize-plan, delete-plan, generate-combined-plan, generate-training-context, generate-triathlon-plan, get-arc-context, import-strava-history, learn-fitness-profile, planning-context, refresh-goal-race-projections, strava-webhook, workout-detail` (+ `compute-snapshot` for its own `plan-phase` import). **Partial deploy = split-brain between source and prod bundles.** Recompute the set (import-graph closure to the changed `_shared/` file) before any future shared-module change; don't trust a direct-import grep — it misses transitive bundlers (here it found 12 of 20).

### D-262 — Off-plan adherence coherence guard: no "add more" prescription while load reads high (2026-07-08, `_shared/off-plan-banner.ts`)

Surfaced live after D-261: the primary user's WK1 rendered "Off plan this week — planned sessions skipped. **Get back on schedule before adding extra**" (the D-147 adherence branch, `load_status = under` from `run_only_week_load_pct = -100`) **at the same time** as the LOAD gauge read "ACWR 1.58 · spike · rest now." Two claims that logically can't both be true — "add more" and "rest now" on one screen. Root: he **deliberately substituted** planned runs for bike/swim (calendar-confirmed), and `load_status` is run-centric, so the swap reads as a running deficit even though total load is high (Q-140).

**Fix (pure coherence guard, NOT week-tuning):** the off-plan branch may STATE THE FACT ("planned sessions skipped") but must not PRESCRIBE ("get back on schedule before adding extra") when `unweightedAcwr ≥ 1.3`. One condition, mirroring the existing D-147 ACWR gate. It encodes **nothing** about why sessions were swapped (the app doesn't know the athlete's rationale and shouldn't) — it only forbids the self-contradiction. Extracted from coach's `intent_summary` IIFE to `_shared/off-plan-banner.ts` so it's unit-testable (7 fixtures incl. the live case: `{under, -100, baseline, 1.58} → fact only`). **THE LAW (D-260):** the off-plan branch reports a fact; only the reconciler prescribes, and it can't prescribe two opposite things. **Survives Item 2** — per-domain load replaces composition reasoning, not the don't-contradict-yourself rule, so this is NOT a Q-137 build-twice violation (the higher bar of a literal self-contradiction, vs Q-137's tolerated same-direction imprecision, justifies the interim guard). Before/after on the live week: prescription clause dropped, fact + "Load very high" + "rest now" retained (all honest, non-contradictory). Deploy: coach only (`off-plan-banner.ts` imported by coach alone). coach `deno check` unchanged (10, pre-existing).

### D-263 — Item 2: intensity-binned per-domain load — slices as reconciler inputs, composition-primary; the Q-140 kill (2026-07-08, `_shared/{hr-quality,per-domain-load,off-plan-banner}.ts`)

The load system's per-domain view (the LOAD READING substrate, D-260 vocabulary). Built in steps, all `_shared` + coach: **(bs1) measured HR quality** — `assessHrQuality` (dropout% + physiological range → `ok/low/none`), replacing the abandoned `device_name → hr_source` map (device is the RECORDER not the SENSOR — the primary user records chest-strap HR on a Garmin watch, so device inference was structurally wrong for everyone; the peek's per-device quality stats showed all HR clean incl FORM). Named `HR_MAX_DROPOUT_PCT` (15) / `HR_PLAUSIBLE_RANGE` (40–210); dropout is percentage-only in v1 (distribution nuance documented). **(bs2) per-domain slicing** — `computePerDomainLoad` runs the shared `computeAcwr` on three slices: strength / hard_cardio / easy_cardio, binned by the discipline's PRIMARY signal (generalizes the D-238 ladder: run→HR/LTHR, ride→power/FTP, swim→pace, strength→sRPE). HR gated by `hr_quality` ANY time HR is used incl ride's no-power fallback; swim UNANCHORED (no CSS) → always easy, never hard-on-a-guess; missing signal cascades to sRPE, row never dropped. Easy/hard seam `CARDIO_HARD_EASY_IF` (0.80, anchored to D-238's tempo band). Slices always all three present; `insufficient_base` is the honest empty (chronic < 500 floor), never a silent null. **(bs3) the Q-140 kill** — the off-plan/under banner (`offPlanAdherenceBanner`) consults per-domain to mint the coherent verdict ("running behind, load carried via easy cross-training") instead of the contradictory "add more," **retiring D-262**; the bidirectional supersede fixture proves add-more (⟹ total < 1.0) can never co-occur with rest-now (⟹ total > 1.5).

**PREMISE reframe (from the live receipt, the verification gate doing its job):** per-slice ACWR is null-by-floor in prod (live: easy 468 / hard 269 / strength 221 chronic, all `insufficient_base`) — a single slice rarely clears the 500 total-tuned floor, and **lowering it was rejected** (thin-base ratios are the manufactured confidence fork 2(b) refused). So the primary always-available per-domain signal is **COMPOSITION — acute-load share per slice**, not the ratio. **Attribution keys on composition:** the carrier is the slice with acute-load share ≥ `ATTRIBUTION_DOMINANT_SHARE` (**0.5** = a majority; rationale: a single slice holding the majority of acute load IS the carrier); below it there's no dominant carrier and the generic "across your training" line is CORRECT, not a fallback. Per-slice ACWR is a bonus that appears as history matures a slice's chronic base past the floor. Reconciler inputs = composition always + ratios when earned. Live receipt verification: easy_cardio acute 252/378 = 67% → "easy cross-training" (was wrongly generic when the logic keyed on the null ratio — the gate caught it). Named constants live in `per-domain-load.ts` (D-264: one home). Per-domain exposed at `weekly_state_v1.load.per_domain` (receipt + Item-4 provenance). Fixtures grounded on the real null-ratio receipt + one cleared-floor maturing case. Deferred: Q-143 (compute hr_quality at ingest, drop the per-call `sensor_data` fetch), Q-145 (intensity-anchor calibration — LTHR-150 mis-binned an easy run as hard, live-confirmed).

### D-264 — Single source of truth: one canonical calculation per metric; every surface (and every audit) reads from it, none re-derives (2026-07-08, architectural; generalizes D-236/D-259/D-261)

**One canonical calculation per metric. Everything reads from it — screens, coaching copy, provenance, AND audits. Nothing re-derives it independently.** A metric with two implementations has two truths, and they drift silently. This is not new — it's the pattern under this whole arc, now named so it binds future work: D-236 (five ACWR formulas → one `computeAcwr`), D-259 (one reconciler mints every load verdict — THE LAW/D-260), D-261 (one plan-phase resolver, three callers), D-263 (one measured `hr_quality`, not per-surface device guesses). **The swim-HR false alarm is the cautionary tale:** the audit eyeballed one raw sample and declared FORM a "trap," a second ad-hoc read of a metric that should have had ONE canonical quality calculation — which, once written (`assessHrQuality`), showed FORM was clean. An ad-hoc audit read IS a second source of truth; it lies exactly like a second production path. **Rule for all load-system work (and beyond):** a new metric ships as one shared function in `_shared/`; consumers import it; a divergent inline copy is a bug, not a shortcut; when you audit a metric, audit it THROUGH its canonical function, never with a fresh hand-rolled read. **Corollary (the open verification, 2026-07-08):** confirm that every user-facing surface showing a shared metric (LOAD/ACWR on State AND Home, the per-discipline PERFORMANCE trends, readiness) reads the same server computation rather than re-deriving client-side — the "smart server, dumb client" calendar invariant extended to the load system. Divergences get filed and collapsed to the canonical source.

### D-265 — Item 3: the two-key rule — a cautionary verdict requires load-high AND corroborated body strain (2026-07-09, `_shared/absorption.ts` + reconciler two-key cap + cardiac read-path fix)

The escalation half of THE LAW (D-260). A LOAD reading being 'high' is Key 1; it may **describe** on its own but may not **escalate** to a cautionary/prescriptive verdict without Key 2 — corroborated body-response strain. Built as one lineage: **(step 0) the cardiac read-path fix** — the consumer read a top-level `decoupling_pct` that the analyzer never wrote (coverage was structurally 0); repointed `daily-ledger.ts` to the real nested `hr_drift_bpm`, switched `body-response.ts`'s cardiac trend to `makeTrend(runs, s => s.hr_drift_bpm, 'lower')`, and threaded it through `session-detail` so the per-run receipt carries it. Step 0 got its OWN live receipt before Item 3 built on it (the verification gate). **(1) `absorption.ts`** emits ONE object — the RESPONSE row (worst-signal-wins DESCRIBE: one elevated signal → "responding — effort elevated," prescribes nothing) plus `corroborated_strain` (the ESCALATION gate) plus provenance (full/partial/load_only). The asymmetry IS the false-positive defense: describe is generous, escalate demands agreement. **(2) HR-drift judged vs the athlete's OWN typical steady drift** (`computeTypicalSteadyDrift`, gate-filtered — baseline built only from full-steady-gate sessions so it inherits the gate's honesty), with a universal cold-start fallback (`HR_DRIFT_ELEVATED_BPM_STEADY_COLDSTART` 8 / `..._STRONG_...` 14) calibrated against the primary user's known-benign high drift (11 bpm) so cold-start never solo-escalates a normal-high drift. Drift is not pace-corrected → valid on steady-state ONLY; the steady gate does double duty (relevance + validity); thin-anchor drift may DESCRIBE but never SOLO-escalate (Q-146 — weakest link can't feed strongest action). **(3) the reconciler two-key cap** — `corroboratedStrain` (default `true` = inert for callers that don't pass it) folds in the D-264 shared safety floor (`computeSafetyFloor`: nDeclining≥2 / fatigued / overreached), and a load-driven 'high' without it is capped to 'elevated' (descriptive). **(4) coach wiring** feeds effort/ledger trend signals + current-week steady drift + safety floor into `assessAbsorption`, passes `corroborated_strain` to the reconciler, exposes the object at `load_status.absorption`. Original escalation rule was a **co-equal quorum** (≥2 signals elevated, OR one strong, OR safety floor) — superseded by D-266.

### D-266 — Weighted corroboration: the strong-evidence leg (effort) is NECESSARY to escalate; ACWR never escalates through any path (2026-07-09, `_shared/absorption.ts` + `load-status-reconcile.ts::computeSafetyFloor`; supersedes the D-265 quorum)

The "do some research" report (2026-07-09, adversarially fact-checked) overturned the prior that D-265 rested on: it graded **effort-vs-typical (RPE) as the one strong-evidence body signal**, and left **HR-drift/decoupling (refuted as a fatigue discriminator) and the muscular ledger (RIR/1RM, no independent validation) as corroborators only**. The D-265 co-equal quorum predated that grading, and the grading exposed **three back doors** where the demoted signals escalated with effort flat: in `absorption.ts` — `elevatedCount >= 2` (ledger + drift alone), `ledger.strong` solo, `drift.strong` solo; and — traced during this pass — the **safety floor carried the same leak on BOTH clauses**: `computeDecliningSignals().length >= 2` trips on two demoted trends (HR drift + RIR), and `readiness ∈ {fatigued, overreached}` is itself worst-of over a pool including the demoted signals AND ACWR (a lone declining HR-drift, or ACWR ramping fast alone via `coach/index.ts:2691`, produces `fatigued`). The latter is an **ACWR-escalation leak** — ACWR, stripped of prescriptive authority by D-260, was still escalating load_status through `readiness → safetyFloor`.

**Doctrine (supersedes the D-265 quorum):** any body-response *escalation* requires the strong-evidence leg (effort) to be one of the firing signals; corroborators (HR drift, cardiac efficiency, RIR, execution) may CONFIRM, never DRIVE; and **ACWR never escalates through any path, readiness included**. The DESCRIBE layer is unchanged — the glass-box still shows every signal (worst-signal-wins); only escalation is gated. **Two edits:** (1) `absorption.ts` gate → `corroborated_strain = safetyFloor || effort.strong || (effort.elevated && (ledger.elevated || drift.elevated))` — removes the three solo/quorum back doors. (2) `computeSafetyFloor` → requires `primaryDeclining` (effort_perception declining, ≥2 sessions) on both arms: `corroboratedDecline = primaryDeclining && nDeclining≥2`, `readinessHardFloor = readiness === 'overreached' && primaryDeclining`; `'fatigued'` dropped from the floor entirely (its productions were the leaks). Because ACWR cannot make RPE decline, requiring `primaryDeclining` neutralizes the ACWR-via-readiness leak WITHOUT editing the 35-line readiness tree (`coach:2668-2703`) — that rework is Q-148. **The prescriptive ('high') band is fully protected:** the two-key cap (`load-status-reconcile.ts:325`) is the universal backstop — applied unconditionally to every uncorroborated 'high' regardless of which raise() produced it — so with an honest `corroboratedStrain`, nothing reaches the "back off" band on demoted-signals-alone or ACWR-alone. **Conservative call, PARKED for revisit post universal-RPE (Q-148):** a lone declining RPE trend DESCRIBES but does not floor-escalate (one witness isn't agreement); relax to solo if warranted once RPE is captured on every session. Verified: 29 fixtures green (`absorption.test.ts` + `load-status-reconcile.test.ts`), including the named ledger+drift-alone regression, the ACWR/single-demoted readiness regression, and the end-to-end `load-high + demoted-only → capped to elevated, never high`.

### D-267 — The load verdict reads the plan's PRIMARY discipline, not hardcoded running (2026-07-09, `_shared/load-status-reconcile.ts` + `coach/index.ts`; full design + all amendments: `docs/DESIGN-D267-plan-primary-load-verdict.md`)

**Root cause (live-verified on the primary user's real "Get stronger" plan):** the load verdict was hardcoded run-first — `body-response.ts:461` "Primary signal: run-only load vs run plan". A strength-primary athlete (`config.source === 'strength_primary'`) maintaining strength and swapping runs for rides/swims (total ACWR 1.3, `volume_state: above`) was told to **"build more"** because running fell below its sub-plan. The verdict never received, and never read, the plan's primary discipline. The mirror of D-259's false "back off": D-259 taught the engine "a swap isn't overload"; nothing taught it "a swap isn't under-training", and nothing told it running is not the primary.

**Fix (reconciler stays sole authority — D-260; `body-response.ts` UNCHANGED, its run-only status is a raw input):** `resolvePlanPrimary(planConfig)` (from `config.source`/`plan_version` → strength/endurance/hybrid/unknown) + `computePrimaryAdherence` (WTD-prorated) thread `planPrimary` + `primaryAdherence` INTO the reconciler via `planPosition`. **INVARIANT (§5):** `planPrimary==='strength'` AND `primaryAdherence.met` ⟹ a raw `under` NEVER survives — covered (ACWR ≥ `ENDURANCE_COVERED_ACWR_MIN` 1.0) → `on_target` + cross-training evidence; uncovered → `on_target` + headroom evidence. `under` requires `met=false` AND ACWR < `UNDER_TOTAL_ACWR_MAX` 0.8. Endurance/hybrid/unknown: byte-identical current behavior. **Fix 1 (live-verified bug):** adherence `met` is SESSION-based; the veto is a genuine performance-decline signal — `e1rmDirection === 'declining'` (from `weeklyResponseModel.strength.overall.trend`, e1RM-derived) — NOT `bodyTrends.strength.trend` (RIR-direction, reads 'declining' when RIR drops / pushing harder, which wrongly vetoed a met athlete). Constants `STRENGTH_ADHERENCE_TOLERANCE=1`, `ENDURANCE_COVERED_ACWR_MIN=1.0`, `UNDER_TOTAL_ACWR_MAX=0.8` named in the reconciler. Shipped + live-confirmed (coach v290/v291): the primary user's Wk1 flips from "build more" to "balanced" with evidence "strength 3/4 sessions · e1RM steady; endurance load carried by cross-training (total ACWR 1.27)". 37 fixtures green. **Cache lesson:** a value-changing coach edit REQUIRES a `COACH_PAYLOAD_VERSION` bump or cached rows serve stale (learned when the first Fix-1 deploy didn't show).

### D-268 — Plan-primary is a SYSTEM invariant: every copy surface reads the plan-aware read; nothing re-derives from running (2026-07-09, phased; full design + surface map + phase plan: `docs/DESIGN-D268-plan-aware-everywhere.md`)

**Michael: "everything in the app must be like this."** The Constitution applied to plan-awareness: **Law 1** (one source, every surface reads it) + **Law 4** (surfaces render, they never re-decide). A hardcoded `'run'` / "Running behind plan" / run-only query in a copy surface is a bug (the D-264 class). A 3-part read-only audit (docs + State-card + system-wide) found `planPrimary` reached exactly ONE consumer (the reconciler); every text surface was still run-centric, rooted in `body-response.ts`'s run-only status.

**Phased remediation (each: reconciler stays sole authority, fixtures green, endurance/hybrid/unknown zero-regression, verify on live data). SHIPPED 2026-07-09 (coach v291/v293 + client):**
- **Phase 1 (the root)** — the reconciler rewrites the interpretation: for `planPrimary==='strength'` it strips the run-only lead ("Running load X% below plan") and leads plan-aware; keeps the cross-training breakdown. `body-response.ts` unchanged.
- **Phase 2 (the banner)** — `off-plan-banner.ts` takes `planPrimary`+`primaryAdherence`; strength-primary → "On plan — strength on track; endurance via cross-training" (met+loaded), headroom (met+light), or "Behind on strength" (not met). Also HOISTED `planPrimary` resolution to ONE place in coach (single source, D-264), read by both reconciler and banner.
- **Phase 3 (coach copy)** — a `narrativeFact` tells the LLM the plan is strength-primary ("a light/swapped running week is deliberate, not behind plan; do not tell the athlete to run more"); intent_summary high-load line names the primary discipline.
- **Phase 5 (client "you have headroom")** — `observationSlot` gates the headroom claim on load being genuinely light (acwr < 1.0, the server-computed number) — no longer claims headroom at ACWR 1.3.

**REMAINING — Phase 4 (deferred to a fresh session):** `generate-training-context` (run-only queries `:728/:830/:1438`, `next_key_session.sport` defaults `'run'` `:1863`, "Add N run sessions" `:1131`) — NOT on the State card (feeds the AI/arc/goal-prediction); Phase 3 already gives the LLM the plan-primary fact. Do it as its own tested pass. Also the D-268 §7 cleanup: `arc-context.ts:683` re-derives `discipline` separately from `resolvePlanPrimary` (a second notion — D-264 concern). Tracked in Q-149 + the handoff doc.

## D-269 — Target architecture ratified: deterministic, smart-server / dumb-client, single source of truth (2026-07-10)

The north star, made explicit and written to `docs/TARGET-ARCHITECTURE.md` (+ CLAUDE.md priming): a living, coherent, steerable training system — every fact computed once on the server (deterministic), delivered as a pre-built contract, rendered by a **dumb client** (no client math on truth); **living baselines** (one resolver per anchor, live/learned value can lead); **steerable plans** (per-discipline, any stage, one adaptation path); **history-aware plan builder**. **Template ratified from existing code:** RUN (spine `run.decoupling`, one authority, duplicate deleted D-239) + `session_detail_v1` (server-built display contract) — the strongest existing implementation; every discipline migrates to look like it. **Rejected:** inventing a new pattern — the foundation already exists; the work is *annexing* the client-compute mirrors (`useStateTrends`, `LoadBar`, `useCoachWeekContext`) + the strength/FTP forks + the 4 plan generators into it, one at a time behind Law 6. Gap map: `TRUTH-MAP.md`. Hardening backlog: `FOUNDATION-READINESS.md` (Q-150). Also this session: shipped **b2** (plan-primary execution surface, coach v73) + the BIKE efficiency-verdict fix; and **deleted** a prototype endurance per-session engine (built for a read that already existed — the vacuum antipattern this architecture exists to prevent). Verified by three adversarial audits (pattern inventory / scalability / commercial-readiness).

## D-270 — Strength convergence (TRUTH-MAP fracture #1) (ratified 2026-07-10, commit `bdab1874`, coach v74 — **folded into the log 2026-07-31** from `docs/archive/DESIGN-strength-convergence.md`)

> ⛔ **WRITTEN 21 DAYS LATE.** This entry was owed from 2026-07-10 (see the doc-debt note in D-271) and
> was the only gap in the D-sequence — while five code sites cited it as law. Filed 2026-07-31 by
> Michael; substance from the ratified design doc, not reconstructed from the diff.

**Problem:** the State screen judged the same lift with **two competing verdicts reading two different
tables** — `exercise_log.estimated_1rm` vs `learned_fitness.strength_1rms` — so they could disagree.
And the per-lift *"getting stronger"* verdict was **dead**: `previous_e1rm` was null, so it always
resolved to `stable`. Q-107 H2/H3.

**Decision — two facts, one substrate:**
- **Direction** (*"is e1RM improving"*, per lift) = **the spine's**, persisted per-lift
  (`state_trends_v1.strength.per_lift`). Surfaces **read** it, never re-derive it.
- **Prescription** (*"add weight / back off"*, per session) = **the coach's**, RIR-driven, and it
  **reads the direction to frame itself**.
- Both off `exercise_log.estimated_1rm`. Prescription renders **inside** the direction (*"getting
  stronger — ease off today"*), never against it.

**Why two, not one:** autoregulation science and every serious app model direction and dose as
**distinct facts with a fixed relationship, never competing** — backing off a bad day protects a
rising trend. Verified against current practice (2026-07-31): Strong/Hevy show a 1RM trend chart with
working weight separate/manual; Juggernaut/RP run one feedback loop (performance in → direction +
prescription out). **The contradiction was presentation, not real.** (RTS/Tuchscherer, JuggernautAI,
RP, Zourdos/Helms.)

**Respects** D-231, D-236 (pattern copied), D-239 (run = the model). **Annexes** Q-107 H2/H3;
**advances** Q-106 step 5. **Finished workout-side** by the 2026-07-29 sweep (`b7715321`).

**Later — display superseded (D-347, 2026-08-01):** the per-lift direction **chip** was removed from
the State strength row — on a 5/3/1 block the once-per-cycle e1RM reflects the **prescribed weight**,
not fitness, so a light week read as a decline. **The direction FACT stays live** (spine-owned, D-338
deload-excluded): it guards the per-workout *"getting stronger"* narrative (fires only on a real
trend) and keeps surfaces from contradicting each other. State shows number + block context + volume
direction; the 12-week chart and the PR remain.

## D-271 — B1 auth boundary: identity from the VERIFIED JWT, never the request body (2026-07-10)

**Problem (FOUNDATION-READINESS blocker B1):** ~15 user-facing edge functions trusted a `user_id` supplied in the request body while running under the service-role key (RLS bypassed) — a caller could pass *any* id and read/act on another user's data; ~7 were reachable with no login at all. Cross-user exposure; gates a second real user.

**Fix — one shared verifier, `supabase/functions/_shared/require-user.ts`, two entry points:**
- **`requireUser(req)`** — for CLIENT-ONLY functions. Derives the user from `auth.getUser(jwt)`. The key property that closes the hole with no config: the **public anon key** (role `anon`, no `sub`) AND a **service-role key** (no `sub`) both return no user → 401. Only a real logged-in session passes. So convert ONLY client-facing functions to this (an edge-to-edge caller presenting the service key would 401).
- **`resolveUser(req)`** — for functions called by BOTH the client AND internal service callers (ingest / sweep / cron, which present the service-role key — a server-only secret never in the client bundle). Returns `{userId, isService}`: service key → `isService=true, userId=null` (trusted; uses the body id); human JWT → `isService=false, userId=verified` (ignore body id, ownership-check entities); anything else (forged/missing token, or the anon key) → 401. **The service/robot path is byte-identical to before**, which is what protects the ingest pipeline.

**Converted this arc (9 functions):** batch 1 client-only — `get-arc-context`, `sweep-user-history`, `weekly-workload`, `disconnect-connection`, `detach-planned` (also added the missing ownership guard); `sweep-week` (had NO user filter → swept EVERY user's week and was anonymously triggerable → now caller-scoped, fixing a real over-reach); ingest trio via `resolveUser` — `calculate-workload`, `auto-attach-planned`, `adapt-plan` (identity only; DB client stays pure service-role; the human path adds an ownership guard).

**Commits:** `fda4922c` (batch 1), `e335c8fb` (sweep-week), `bca74067` (ingest trio). Note: the ingest-trio source was **wiped by a mid-session machine crash AFTER the deploy had gone out** — production ran the new code while git did not; `bca74067` restored source to match the deployed version (verified against the transcript, `resolveUser` variable-scope re-checked).

**Verification:** `deno check` clean on all three restored funcs (new identifiers resolve; pre-existing strict-mode noise ignored); the pattern mirrors the already-proven `save-location` / readiness gate; **live-verified** — a fresh Garmin walk imported and Strava history imports ran clean post-deploy, proving the robot path is intact.

**Rejected:** converting the webhook / edge-to-edge callers the same way — they present the service key or no token, so `requireUser` would 401 them and `resolveUser` treats the service key as trusted. **Still open:** Strava/Garmin **webhooks** need a shared-secret guard (not a JWT); **B4** (error monitoring) untouched.

**Owed doc-debt (flagged, not fabricated):** ~~D-270 (strength convergence, commit `bdab1874`)~~ **[PAID 2026-07-31 — the entry is above]** and FTP fracture #2 (commits `d278cadd` / `eae2d9aa` / `00dbc9f2`, **still owed**) are referenced in commit messages but still owe formal DECISIONS-LOG entries — write them from the commits next session.

> ✅ **D-270 HALF PAID — 2026-07-31.** The entry now exists, in sequence, above D-271. It was filed by
> Michael from the ratified design doc (`docs/archive/DESIGN-strength-convergence.md`), not
> reconstructed from the diff — which is why the audit flagged it rather than writing it. The five
> citations now resolve.
>
> ⚠️ **THE FTP FRACTURE #2 HALF IS STILL OWED** — commits `d278cadd` / `eae2d9aa` / `00dbc9f2` still
> have no entry. Deliberately left; only the D-270 half was closed.
>
> *(Historical: this note sat unpaid for 21 days. D-270 was the only gap in the D-sequence while being
> cited as settled law in five places. `Q-144` remains the only gap in the Q-sequence, and is believed
> to be a skipped number rather than a lost entry — it is referenced nowhere.)*

## D-272 — State↔Performance fork sweep: the workout narrative reads the SPINE, never re-derives (2026-07-10/11)

**The pattern found (a sweep, code-traced across all 4 disciplines).** Every discipline's per-workout narrative had quietly grown its OWN trend classifier for a fact the State spine already owns — same class as D-239 (run decoupling) and D-270 (strength e1RM), just un-generalized. The two used cruder math (no staleness gate, no terrain match, wrong window) and could contradict State for the same fact on the same athlete. Root cause is the feature-by-feature accumulation this whole architecture arc exists to reverse (each surface minted its own calc). **The fix template, applied uniformly:** the per-session read is a RECEIPT (the workout's own numbers, this session vs prior); the multi-week DIRECTION/TREND is the SPINE's (State owns it); the workout either reads the spine or shares the spine's band. Two display *vocabularies* are allowed where they serve different surfaces (e.g. strength: workout DESCRIBES "too easy", State PRESCRIBES "add weight" — both standard autoregulation registers) but there is ONE threshold/authority underneath.

**Closed this session (each deployed + pushed + fixtured):**
- **Bike easy-ride false-dip** (`cycling-v1/ai-summary.ts`) — the ride-detail trended 20-min power across ALL rides, so an intentionally-easy block read as a "fitness dip". Gated the fitness-direction claim on the shared `POWER_BINS` (hard-effort types only), the same rule State uses; easy rides carry no fitness-trend claim. Confirmed on 2 real rides (before/after). Commit `e8b67eaf`.
- **Run decoupling band** (finishes D-239 run-side; `analyze-running-workout/lib/heart-rate/efficiency.ts` + `fact-packet/ai-summary.ts`) — the workout rated decoupling on an ad-hoc `abs()` 3/5/8 scale while State/coach used the Friel 5/10 band. Repointed the workout to the SAME `frielBand` (imported), so a given % lands in one tier everywhere; `abs()` erased the negative-is-excellent case (fixed). The 5%/10% bands are the documented coaching standard (`SCIENCE-run-decoupling-durability.md`, Friel/TrainingPeaks — a convention, NOT a lab cutoff). Commit `5057b590`.
- **Strength RIR verdict** (`strength-profiles.ts` `rirVerdictFromDelta` + `analyze-strength-workout`) — the Details TABLE used a ±1.5 band while the AI prose + State used ±1.0 (the exported `VERDICT_DEVIATION`), so a set with RIR delta in (1.0, 1.5] read "on target" in the table but "too easy" in the prose on the SAME screen. One shared helper on the ±1.0 band across table/prose/State; the ±1.5 outlier was undocumented. Vocabularies kept (receipt vs prescription — both standard RP/RIR language). Commit `0d6b1288`.
- **Strength e1RM direction** (finishes D-270 workout-side; `state-trend/strength.ts` `spineDirectionToTrend` + `analyze-strength-workout` + `narrative-core/adapters/strength.ts`) — D-270 converged only the COACH per-lift model onto the spine; the per-workout narrative still computed direction its own way (this session vs single-most-recent-prior, 2.5lb dead-band), so one down day amid a rising trend read "bench down" on the workout while State said "getting stronger". The narrative now reads the spine per-lift direction (the analyzer already loads `state_trends_v1.strength.per_lift`); the e1RM *numbers* + the strength TEST-result PR stay session-local (receipts). Commit `b7715321`.
- **Bike power "trending" limiter** (`cycling-v1/cross-workout-queries.ts`) — the §2 "NP-trend limiter" wasn't a limiter, it was a SECOND bike-power trend (±5% of a 14-day NP mean vs a 90-day ALL-ride NP mean, no terrain match, no staleness gate) that emitted "Power trending down — review recovery" off easy-ride-dragged NP and ignored the athlete's FTP/weight baselines entirely. Removed it (universal, not tuned to one athlete): the spine owns bike-power direction; the real W/kg limiter (§1, tri + baselines) is intact; missing baselines → honest 'none'. Filed follow-up: nudge "add your weight" instead of silence (Q-160). Commit `cb4eb1d5`.

**Also fixed (not a fork — a real ingest bug):** Q-154 UTC import — `import-strava-history` bucketed its Strava fetch window by UTC, so an evening (local) ride only appeared when you requested the *next* calendar day (it then filed correctly under the local day). Now widens the UTC window a day each side and selects by local calendar day (`import-strava-history/date-window.ts`). Regression fixture pins the 7/7-evening case. Commit `8b9cf3e7`.

**Verification:** deterministic fixtures on all; bike easy-ride + limiter live-confirmed on 2 rides (before/after); the LLM-prose ones (RIR, e1RM direction, run decoupling) await Michael's ≥3-recompute eyeball on a matching workout — structurally the lies can't reappear (the packet no longer carries them + the validators block invented directions). **Two forks deliberately deferred** to a fresh chat (low-stakes tail): run-efficiency chart label (Q-157, client change) + run HR-drift band (Q-158) — see OPEN-QUESTIONS for scoped detail.

## D-273 — Run HR/drift/decoupling: ONE condition-aware read on the Performance screen (2026-07-11)

**The room this cleaned.** The run analyzer + session-detail layer had accumulated THREE things doing the same "how did HR behave" job with different, sometimes-contradicting math (the D-272 tail, Q-158). Swept and consolidated in one session, each fixtured + deployed (`analyze-running-workout` + `workout-detail`; commits `4b77bc84` / `552e4de2` / `c4e69460` / `dd575492` / `ef8b102c` / `a3f193a9`):

- **Killed the phase-blind "normal for X min" verdict** (`session-detail/build.ts`, Q-158). It rated drift on a duration-only band (`{8,12,15,20}`) that ignored heat + plan phase — so it could contradict the analyzer's own conditions-aware read on exactly the hard/hot runs. The bpm "Heart rate" line is now measured description + own-baseline comparison only; "is this drift normal" is owned by the one analyzer verdict.
- **Surfaced aerobic decoupling % as the single durability verdict** (TrainingPeaks Pa:Hr / Garmin standard, <5% = solid base). It was DORMANT: `efficiency.ts` computed the % on GAP-corrected pace + an assessment but dropped `basis`, and `buildSummary` dropped basis+assessment → the row's `basis==='gap'` gate never passed. Fixed single-source (efficiency owns basis). When the % shows it leads and SUPPRESSES the bpm line → one HR read, never two. (`decoupling-basis.test.ts`, `hr-drift-decoupling-rows.test.ts`.)
- **Collapsed two expected-drift bands into one, science-backed.** `interpretation.ts` recomputed its OWN band on RAW drift (`getExpectedDrift`/`assessDriftBand`, phase-blind) driving ~10 narrative branches incl. an "aerobic stimulus" heuristic; drift.ts already computes the ONE verdict on TERRAIN-ADJUSTED drift vs a duration+phase+weather band. Research (TrainingPeaks, Garmin, Uphill Athlete, Good Coach): judge drift AGAINST conditions, as ONE number, trend-first — and "did I get a stimulus" is a time-in-zone/TRIMP question, not a drift question, so the raw-drift heuristic was the wrong tool anyway. The narrative now reads drift.ts's `assessment` (mapped: excellent/good→below_expected); deleted `getExpectedDrift`+`assessDriftBand`. Money regression pinned (`drift-band-single-source.test.ts`): a hilly run with high RAW but normal ADJUSTED drift no longer false-reads "elevated".
- **Confound guard on the own-baseline comparison** (Q-055's existing-line concern). Heat/terrain INFLATE drift (never lower it), so only the "higher than your typical" branch was confoundable → on a hot (>75°F) or hilly run it now names the confound ("above your typical +6, but the heat drove it — not a fitness change") instead of implying a fitness decline. (`drift-confound-guard.test.ts`.)
- **Empty-half-window guard** in `drift.ts` (D-242 defense-in-depth): an all-dropout HR half returns invalid drift, never a garbage bpm; production already pre-filters zeros, so this makes the invariant local, not dependent on an upstream filter.
- **Deleted a dead 1,343-line `analysis/heart-rate-drift.ts`** — an orphaned drift engine superseded by `lib/heart-rate/drift.ts`, imported by nobody.
- **Fade-guard mixed-effort hole** (Q-129 progress, `ef8b102c`) — `is_mixed_effort` suppressed the fade-honesty guard, but it trips on `pace_cv` (a fade IS a big pace swing) and on a mislabelled unplanned `detected_intervals` — the exact faded runs it must catch. Now only real plan structure (`interval_execution`/`plan_intent_intervals`) suppresses (`structuredBySignalSuppressesFade`). The 7/5 run now leads with the named fade, drops the "vs similar" laundering. Live-confirmed.
- **Fade prose opener** (`a3f193a9`, cosmetic prompt-only) — the AI consistently opened "The fade happened despite…" (definite article presumes the reader knows). Nudged `executionHonestyPromptRule` to OPEN by introducing the slowdown as a fresh observation, then interpret. Structural (not tuned to the run); guard/seatbelt logic unchanged (16/16 fixtures). LLM-stochastic → acceptance = ≥3 clean recomputes; generalization across other faded-run types is "trust and watch" (7/5 is ~the only clear faded run in the data).

**Frame banked (drives future LLM work):** deterministic FLOOR (facts/verdicts, computed, can't lie) + LLM CEILING (thin courtesy narration of settled facts, never decides). Verified against industry practice — the conservative apps compute deterministically and let the LLM explain "why"; the aggressive "LLM decides" end is where hallucination complaints cluster. See memory `feedback_small_ai_footprint` (keep AI footprint small, also to protect Strava/Garmin partner data-use terms).

**Verification:** deterministic fixtures green across all pieces (basis, rows, band mapping, confound guard, fade-guard hole); bike/run type errors touched are pre-existing `strict:false` noise. The LLM prose pieces (fade opener) await ≥3 Michael recomputes. Q-158 RESOLVED; Q-157 MOOT (sparkline dead); Q-055 existing-line closed (Read-3 build still open); Q-129 3-of-4 surfaces guarded (coach remains).

**Post-D-273 cleanup (same session, `c6bac6e3`):** deleted the dead client `TrendSparkline` (the retired raw-pace / pace-at-HR-direction chart, D-050/Q-025) + its `TrendData`/`TrendPoint` types + the `trend` prop field from `SessionNarrative.tsx`. Already switched off (server emits `trend:null`, component never mounted after macro trends moved to State) but a latent re-wire hazard — a future session could have re-mounted a workout-screen chart stamping a direction that contradicts State. Client build green; no behavior change. Q-157 fully cleaned (moot + code gone). Server-side `pace_at_hr_direction` plumbing left inert (emits null, read by nobody) — a separate optional cleanup.

## D-274 — Coach week-headline honesty net: guard the ONE AI sentence against its own on-screen rows (2026-07-11)

**Context.** The State screen is the Whoop-sweet-spot pattern (verified vs incumbents): ONE AI-written sentence — the WK headline — sitting on a stack of deterministic, glass-box rows (LOAD + composition, BODY/RPE, STRENGTH exec %, AERO/BIKE verdicts). Everything but the headline is computed and can't lie. So "coach honesty" = guarding one sentence, not a narrative surface.

**Finding (code-traced, corrected a stale premise).** Q-129 called the coach "a 4th unguarded generator" — STALE. The headline already ran through the shared `runGuardedNarrative` (narrative-core rules 6/7 spine-contradiction/recap, 5 grounding, 8/10 plan/phase). But two real holes:
1. **`atypicalSignals: []` hardcoded** (`coach/index.ts:~4682`) → rule 2 (don't call the week "comfortable / steady / cruising / in control" while a signal is atypical, unacknowledged) could **never fire on the coach**. So the exact intra-surface class Q-129 flagged (a headline contradicting the concerning ROW right below it — e.g. "you're cruising" over an AERO "durability gap") was unguarded.
2. **Cold-start bypass** — `spineVerdicts.length ? guarded : generate(null)` emitted a **fully unguarded** narrative for a data-less athlete (LLM free to invent readiness/fitness/phase).

**Decision + fix.**
- Feed the CONCERNING spine verdicts (any discipline `sliding`) into `atypicalSignals`, **derived from the same verdicts the rows render** (one source — the headline can't diverge from its own screen). `holding`/`improving`/`needs_data` are not atypical.
- **Always** run guarded (empty verdicts → rules 6/7/2 no-op; 5/8/10 still hold) — no more cold-start hole.
- Extended the shared `ACK_ATYPICAL` lexicon (`narrative-core/validate.ts`) with weekly-decline acknowledgment words (`slid*`/`slipp*`/`declin*`/`fad*`/`worth watching`) so an honest "run is slipping" headline that also uses "easy/comfortable" isn't falsely flagged — the old list only knew per-session drift language (drift/elevated/climbed). Deliberately excluded `slow*` (a pace word, over-broad for a fitness-decline ack) — keeps the workout surface unweakened.
- COACH_PAYLOAD_VERSION 76→77.

**Rejected:** the full "formal `_shared` honesty pass every generator subscribes to" (Q-129's grand version) — over-scoped for the actual gap. Wiring the coach into the existing guard + populating its signals achieves the honesty outcome (the one sentence is now guarded against its rows) without a shared-interface refactor. The formal version stays a future consolidation, not a blocker.

**Sequencing intent met (Michael):** honesty FOUNDATION first — the headline is now provably honest, so building the State coaching OUT later is safe. (Corrected a mid-session mis-read where this was recorded as "don't build, wait for a caught lie" — the actual call was build-the-net-now.)

**Verification.** 2 new fixtures (`validate-guard.test.ts`): cruising-while-sliding fails rule 2; a plain plan-state headline + an acknowledged-slide headline don't over-fire. 29/29 narrative-core green (workout rule 2 unaffected). Deployed coach + the 3 analyzers bundling narrative-core (`analyze-cycling/strength/swim`). LLM-stochastic → the headline itself needs Michael's ≥3 recomputes; 1 done live (recomputed clean, reads human, with a durability-gap row on screen — the no-over-fire case). Q-129: coach surface now guarded (3 workout surfaces closed earlier this session; the formal shared-pass is the only remainder, non-blocking).

## D-275 — Run durability (decoupling) is heat-confound-aware on State — one 80°F run can't stand up a red "durability gap" (2026-07-11)

> # ⛔ REVERSED. THIS DECISION IS DEAD. DO NOT IMPLEMENT IT.
> **Superseded by D-283 (2026-07-13): HOT RUNS ARE KEPT.** The heat exclusion described below was **removed from the code** (`_shared/state-trend/run.ts:165-200` — the filter chain drops only raw-basis, non-steady and <20min; there is **no heat filter**). `COACH_PAYLOAD_VERSION 95` confirms.
>
> **Why it was wrong, on the two grounds it claimed:** (a) it is **not** field-standard — no shipped product auto-excludes a session on a temperature threshold (Garmin *adjusts* a retained, acclimation-scaled VO2max — patent US 11,998,802; TrainingPeaks shows Pa:Hr raw), and the "Runalyze does it" claim was inherited unverified and is **false**; (b) the athlete's own data says there is nothing to correct — across **81 steady runs** the heat→decoupling slope's 95% CI straddles zero under every specification (r² = 0.014), and median decoupling by temperature bucket **falls** with heat.
>
> **No heat adjustment is owed.** Q-170 is closed. Do not rebuild the toggle. Read D-283 before touching anything below.
>
> *(Back-annotated 2026-07-13. This entry sat for two days presenting a reversed decision, with its full justification intact, to anyone who Ctrl-F'd "heat".)*

**The seam.** State's AERO row read the July-5 run's raw 10.7% decoupling → Friel band `durability_gap` → red home-screen flag, while the SAME run's workout Performance screen said "fatigue and heat likely explain the deceleration" (80°F, positive split). Two screens, same run, contradicting verdicts — a TRUTH-MAP continuity fracture on a discipline previously marked "run — clean." Root cause: heat-confound awareness was built on the workout side (`session-detail` / `heat-adjust`, D-273/Q-055) and **never propagated to the State durability band** (`state-trend/run.ts` banded the raw % with zero temperature awareness). Compounded: the BAND renders even when the trend verdict is `needs_data`, so one confounded run stood up a standing flag.

**Decision (industry + science, not a judgment call).** A decoupling % is only a valid DURABILITY read in controlled conditions. TrainingPeaks/Friel (who defined Pa:Hr), Intervals.icu (Seiler), Garmin, and the research agree the validity gates are OBJECTIVE conditions — **heat, terrain, effort-type, duration** — and that heat/dehydration/fatigue drift the number for reasons unrelated to base. Garmin *normalizes* heat rather than reading a false decline; Friel says don't test in heat. So State now DROPS heat-confounded runs from the durability substrate, exactly like it already drops terrain-confounded (`basis==='raw'`) and non-steady/<20-min runs. When that leaves no clean run, AERO reads `needs_data` (honest "no clean read yet"), never a red gap off one hot run.

**Scope calls.** (1) **RPE deliberately EXCLUDED** as a gate — it is NOT a decoupling-validity gate in any major or the literature (it's a load/narrative metric; its home is the workout screen's "why," which already uses it). An earlier draft added an own-baseline RPE arm; removed after research. (2) Terrain already handled (GAP-corrected pace + `raw`-drop) — no new flag. (3) Duration ≥20 min already gated (the documented minimum). (4) Fueling/hydration also invalidate but are unmeasurable → honest-blank. Heat was the one missing gate.

**Implementation (single-source — reuse, don't re-derive).** `analyze-running-workout` stamps `decouplingConfounded` onto `heart_rate_summary` from its OWN weather read (`drift.weather.factor==='hot'`, >75°F; Garmin's line ~72°F) — no new heat math. `state-trend/run.ts` `decouplingToSeries` drops confounded rows. Threaded through `compute-snapshot`'s `runJoined` (server spine) AND `useStateTrends.ts`'s client fallback (same `assembleStateTrends`, so client + server stay identical).

**Verification.** `run-decoupling.test.ts` +2 fixtures incl. the July-5 regression (lone hot 10.7% run → substrate empty → `needs_data`, band `null`, not `durability_gap`); 37/37 state-trend green. Analyzer typecheck clean (62 pre-existing `strict:false` errors untouched). Deployed `analyze-running-workout` + `compute-snapshot` (+ the 4 functions bundling `state-trend`); pushed.

**Follow-on close — the AERO↔spine continuity gap (coach v78, Michael-verified 2026-07-11).** The first fix corrected the spine trend (PERFORMANCE row), but the State **AERO** row stayed red "durability gap" — because AERO is a SEPARATE surface: the coach's `run_session_types_7d` computed its OWN 7d decoupling average (`coach/index.ts:1518`), with no confound/freshness/min-session gating, and rendered its own band. D-239 had reconciled the LABEL thresholds coach↔spine but left two SUBSTRATES → they diverged (AERO "gap" while PERFORMANCE said "holding 7.8%" with the hot run excluded). **Closed properly:** the AERO durability VERDICT for steady-aerobic types (`easy/z2/long/progressive`) now reads the SPINE `state_trends_v1.run.decoupling.band` (confound-excluded, freshness-gated), rendered via a NEW shared `decouplingBandDisplay` vocabulary in `state-trend/run.ts` that the PERFORMANCE row also uses — so AERO ≡ PERFORMANCE in value AND words (both "building aerobic base"). Stale/`needs_data` → no verdict (not a carried-forward gap); intervals/hills keep execution %; the raw 7d avg stays an LLM receipt (still confound-skipped). Fixture pins the shared band words. **Verified on device:** AERO flipped red "durability gap" → neutral "building aerobic base", matching PERFORMANCE. This is why "run — clean" was overstated — one fact, two computations; now genuinely one substrate.

**Bike engines (D-275-bike, Q-117 #2 closed, 2026-07-11 — data-verified, deployed).** The State bike reads had the SAME disease. Pulled Michael's 27 real rides (SQL) and proved the PERFORMANCE bike-efficiency "improving −5.5%" was an ARTIFACT: the HR-at-power substrate (`assemble.ts:118`) ate EVERY ride type, so a May CLIMBING block (144–153 bpm in-band, incidental) + one threshold-RIDDEN "endurance" ride (May 30, 165W/94% FTP, 145 bpm) faked the gain. Gated the substrate to steady-aerobic (type ∈ {endurance,endurance_long,recovery} + ≥600s in-band dwell + best-20 < 90% FTP / Coggan Z4 floor, FTP derived per-ride from band_hi) → on his data flips to **"holding −1.1%"** (truth). Threaded `in_band_s`/`band_hi` through compute-snapshot + useStateTrends. The SECOND engine — the coach's BIKE 7d HR-drift row (`ride_session_types_7d`) — shares the SAME `bikeRideIntensityAerobic` gate (coach v79) so a hard-ridden ride can't pollute drift either; both bike engines now agree on "too hard to count as aerobic." (Power-targeted types already showed execution %, not drift.) Standard: TrainingPeaks/Friel — EF & HR-at-power are steady-aerobic-only, no threshold work. Fixtures: `bike-efficiency-hr-filter.test.ts` (42/42 state-trend), incl. the May-30 repro. NOTE: bike still lacks a stored *decoupling* (Pw:Hr durability) read like run's — the coach 7d drift is the stand-in; a real spine bike-decoupling is a future compute+backfill (Q-117).

**Bike row reconciliation (coach v80, 2026-07-11) — the last run↔bike continuity gap closed.** An architecture audit found the one remaining asymmetry: the run AERO→spine reconciliation (v78) was never mirrored onto bike, so the coach BIKE "sessions went" row still rendered its OWN within-ride HR-drift verdict (local ≤3/5/8% bands) while the PERFORMANCE bike Efficiency row read the spine HR-at-power trend — two "efficiency" verdicts that could contradict on one screen. Fix: the BIKE row's steady-aerobic types (`recovery/endurance/endurance_long`) now render the SPINE `bike.efficiency` verdict via a new shared `bikeEfficiencyDisplay` (improving/holding/sliding, tone matched to the PERFORMANCE VERDICT coloring), not the drift bands. Power-targeted types keep execution %; tempo/brick keep their drift read; raw `avg_hr_drift_pct` stays an LLM receipt. Trade-off (accepted, mirrors run): the BIKE row wording shifts from "Held power efficiently" → the efficiency direction word, in exchange for BIKE ≡ PERFORMANCE. Fixture `bike-efficiency-hr-filter.test.ts` pins the vocab; 43/43 green. Deployed coach v80. **Run and bike are now verifiably continuous end-to-end across State + Performance.**

## When to add an entry

Add a new D-NNN when:
- A non-trivial design choice was made that someone could reasonably reverse later.
- A coefficient or threshold was picked deliberately (not just the default).
- An architectural pattern was rejected — record what was rejected and why.
- A scoping call was made (e.g., "ship narrow now, generalize later" — D-004).

Don't add entries for:
- Routine bug fixes where there's only one sane fix.
- Choices documented adequately in the protocol spec already (link to it instead).
- Tactical implementation details (file layout, variable names) — those live in commit messages.

---

## D-276 — State honesty batch: 5% decoupling band (Q-161) · provisional-aware fitness rollup (Q-162) · ⟨diag⟩ strip (Q-163)

- **Date:** 2026-07-12
- **Q-161 — decoupling banded to the ONE science line.** Research pass (TrainingPeaks/Friel, Intervals.icu, Uphill Athlete AeT drift test, Muniz-Pumares durability lit): the 5% cutoff is the only authored/platform/literature-backed line; the 5–10 "base" and >10 "gap" tiers and a separate `<0 excellent` tier are convention (the `<0` tier is arguably misleading — a negative usually reflects a soft start). Collapsed `frielBand` (`_shared/state-trend/run.ts`) from 4 tiers to **two states**: `sound` (<5%) / `needs_work` (≥5%). Rippled to every surface off the one band: State durability row, coach AERO receipt (`decouplingLabel`/`decouplingBandDisplay`), and the workout card's `decouplingAssessmentFromPct` ('good'/'needs_work', was excellent/good/moderate/high) + `buildEfficiencyStatement` prose + the fact-packet/session-detail types + the `⟨diag⟩` carryover regex. `>5%` is amber (a "build base" cue, or a residual confound), never red. Added a **State "i" tap-expand** on the run durability row (`StatePerformanceSection.tsx`) explaining decoupling + its heat/hills/short-run caveat.
- **Q-162 — the composite is only as confident as its inputs.** `rollupFitness` (`assemble.ts`, supersedes `rollupFitnessDirection` which is now a thin wrapper): a PROVISIONAL (thin/clustered — `isProvisionalTrend`) discipline can no longer ASSERT the confident `fitness_direction`; the headline is decided by SOLID verdicts only, and any thin mover held out is named (`thinHeldOut`) so the narrative flags the data gap instead of silently reading 'stable'. coach v83.
- **Q-163 — ⟨diag⟩ leak.** The glass-box carryover diagnostic (`analyze-cycling-workout`) was appending `⟨diag⟩ carryover silent — …` onto `ai_summary` (user-facing). Redirected to `console.log`; the string can no longer reach the workout INSIGHTS prose.
- **Migration crash (hotfix, same day):** the Q-161 band shrink broke the client — a cached `state_trends_v1` still carried a pre-Q-161 band string (`strong`/`base`/`durability_gap`), and `DECOUPLING_BAND[oldValue].cls` threw, blanking the app. `StatePerformanceSection` now looks the band up defensively (unknown → falls to the "needs data" copy). Lesson: a client map keyed on a server enum MUST tolerate stale cached values across a vocab change.
- **Verification:** new `rollup-fitness.test.ts` (9); `run-decoupling` + `efficiency` fixtures rewritten to the 2-state model; 157/0 across state-trend + heart-rate + session-detail; client `tsc` + build clean. LLM workout-card prose owes a ≥3-recompute eyeball.
- **Note:** Q-157 + Q-158 were found already closed by D-273/D-274 (punch-list header lagged its own living docs) — no work.

## D-277 — Regression restore (a8bf025b clobber) + pace-variance no longer mislabels easy runs "fartlek"

- **Date:** 2026-07-12
- **The regression:** commit `a8bf025b` (2026-06-14, "STATE #4 deterministic glance headline") — an unrelated State-headline change — silently reverted the D-037/D-038 mixed-effort work across `analyze-running-workout/lib/heart-rate/efficiency.ts` + `index.ts` + `detect-workout-type.ts` (~156 lines; nothing in its message about any of it). Since there is no `npm test` (deno tests are manual), the D-037/D-038 tests went red for a month unnoticed. Effects since June 14: mixed/fartlek runs lost their whole-session decoupling read, and unplanned executed-pace-alternating interval runs mis-classified as steady. **Restored, reconciled with the D-273 consolidation:** `forMixedEffort` decoupling (basis forced 'raw'), the `analyzeMixedWorkout` call to `calculateEfficiency`, and the `pickPace` executed-pace fallback in `hasAlternatingPattern`. Also realigned a stale cycling EFFICIENCY-row test to its shipped D-062 plain-language output.
- **Then corrected the design (research-backed):** the restored variance override RE-LIT a "steady_state → fartlek" relabel that was itself wrong. Research (fartlek = deliberate speed play per Holmér/TrainingPeaks; zero of 7 apps — Garmin/TrainingPeaks/Stryd/COROS/Runna/Strava/Polar — name a run "fartlek" from variance): **pace variance must NEVER re-label the run type.** New behavior in `analyzeHeartRate`: the variance gate keeps the honest type and only forces the DECOUPLING low-confidence (basis='raw') via the steady path — the metric carries the uncertainty, the label stays honest (the Garmin/Firstbeat/TrainingPeaks/Stryd/Whoop pattern). Supersedes the D-038 Piece 1B override; its test updated. Also **raised the CV threshold 8% → 13%** — 8% is elite-5K-race tightness and normal easy runs run 5–10% CV on raw/GAP pace (GPS noise + hills + lights), so it misfired constantly; low-mid teens separates genuinely-variable efforts (marathons ~16%). Ideal future gate = Variability Index (NGP÷avg, jitter-resistant) — noted, not built.
- **Verification:** deno 48/0 (the 4 originally-red regression tests + the updated Piece 1B); pre-existing `interpretation.ts` loose-typing errors (pace-profile / lateRepsSlow) predate this and are unrelated.

## D-278 — "Run quality" removed from the BODY section (adherence ≠ body response)

- **Date:** 2026-07-12
- **Decision:** deleted the "Run quality" BODY signal (`computeVisibleSignals`, `weekly.ts`). It was `execution_score` (plan adherence) vs baseline, filed under BODY/readiness. Research (Garmin/Whoop/COROS/TrainingPeaks/Polar): the field universally keeps plan-adherence in a separate execution/consistency lane and reserves "run quality / performance vs baseline" for the PHYSIOLOGICAL pace-at-HR read — never body response. Ours mislabeled a confounded adherence number (inflated by easier prescriptions/conditions/cherry-picking; and it aggregated ALL-discipline execution, not runs) as a body signal, colliding in name with the decoupling/efficiency read already in PERFORMANCE.
- **Coverage intact:** per-run execution shows in the "how your sessions went" RUN row; run physiology in the PERFORMANCE decoupling/efficiency reads. The underlying `endurance.execution` trend stays computed for load-status reconcile — just no longer a BODY row. coach v84.

## D-279 — Holistic, spine-sourced BODY "Heart-rate response" + honest "as of" stamp

- **Date:** 2026-07-12
- **Decision:** BODY's heart-rate read was RUN-only AND re-derived in the coach (its own `driftBpms` over this week's steady runs) — incomplete (no bike) and a continuity fracture (re-computes instead of reading the spine). Replaced with `rollupHrResponse` (`assemble.ts`): ONE BODY signal built from the SPINE's per-discipline HR verdicts — run aerobic decoupling + bike HR-at-power efficiency (each discipline's correct HR instrument). Swim excluded (in-water HR unreliable), named in the provenance so it's honest, not silent. Provisional-aware (thin read can't assert the verdict but is still listed). coach v86.
- **"As of" = OLDEST contributor (not freshest).** First cut stamped `Math.min` age (freshest); confirmed on real data that masked a stale half (run decoupling 14d old / bike efficiency 5d → stamped "as of Jul 7", hiding the 2-week-old run). Changed to `Math.max` age so a combined read is never shown fresher than its stalest input; per-discipline ages added to the provenance. Also added `as_of_date` to the other rolling BODY rows (RPE / HR-drift) — they're a trailing 7d / calendar-week window, so a reading can be several days old (coach v85/v87). Dead "Aerobic fitness" BODY signal (cardiac_efficiency hardcoded null) noted for cleanup.

## D-280 — Load verdict: "productive" state + provisional-ACWR flag (field-standard)

- **Date:** 2026-07-12
- **Decision (research-backed — Garmin/Whoop/COROS/TrainingPeaks/Intervals + Gabbett ACWR lit):** the load verdict lacked the field's THIRD state between "balanced" (sweet-spot 0.8–1.3) and an alarm. A REAL load elevation the body is absorbing (no corroborated strain AND readiness fresh/adapting/normal AND <2 declining signals) now reads **'productive'** (Garmin "Productive" / COROS "Optimized" / Intervals "Optimal") — surfaces the elevation as a positive instead of hiding it under "balanced" or crying "back off". Added as the FINAL relabel in `reconcileLoadStatus` (additive — doesn't touch the escalation ladder; `LOAD_RANK` gives it on_target's rank; a thin/empty-base spike is downgraded to 'under' above, so it can't fire off noise). The two-key false-back-off defense is preserved for the not-genuinely-fine case (fatigued / ≥2 declining → stays 'elevated').
- **Provisional ACWR:** an elevated ratio (≥1.3) resting on a thin/empty chronic base is too short-based to trust (Gabbett: ~4wk chronic; Garmin/COROS/Intervals gate on an established base). `reconcileLoadStatus` returns `acwrProvisional`; the LoadBar renders "· provisional" so a bare high number isn't read as a real spike. **Refined same day (coach v89):** first cut keyed the flag on "the verdict stayed on_target/under" — a proxy that wrongly flagged REAL-base athletes whose spike is cross-training-attributed (Michael's 1.64 sits on months of established load, got flagged). Re-keyed on `spikeOnEmptyBase` (the actual thin-base signal): real base → never provisional, any composition. The deeper "'balanced' under-reads a real total-load elevation" issue is a separate reconciler-core slice — **Q-166**.
- **Verified on real data:** the athlete's 1.64 is a thin cross-training base → "balanced · ACWR 1.6 · provisional" (honest); a genuine absorbed elevation → "productive". reconciler 25/0; coach type-check + client build clean. coach v88.

## D-281 — Total-load ACWR band: SHIPPED, THEN REVERTED SAME DAY. The ratio may never reach the prescriptive band.

> **BACK-ANNOTATION (2026-07-24, D-317 + D-318):** total load is now READ again — but the LAWFUL way, so this revert still stands. D-281's sin was a reconciler **`raise()`** off total ACWR (the ratio prescribing). D-317 instead surfaces total load in the **base** `load_status` **descriptively** (`computeTotalLoadStatus` → "total load building / on target / ramping quickly", `body-response.ts:40`), and D-318's **two-key cap** still requires body corroboration before it can say "pull back". So "the ratio DESCRIBES; the body PRESCRIBES" holds — no total-ACWR `raise()` was reintroduced. This is the correct resolution of **Q-166** that D-281 botched. Everything below is history.

- **Date:** 2026-07-12 (shipped `216812d7` + hotfix `a4d08358`; **reverted `b0d33ceb`**)
- **Status: REVERTED. Do not rebuild.** Recorded so the next session does not re-derive it. Cross-ref Q-166, Q-137, D-265, D-266.
- **What was built:** an attribution-independent TOTAL-load ACWR band in `reconcileLoadStatus` — `>1.3 → raise('elevated')`, `>1.5 → raise('high')` — on the reasoning that a real elevation on a real base is real regardless of which disciplines produced it, and that the two-key cap would still prevent a false "back off". Q-166's stated fix direction ("productive 1.3–1.5 / elevated-absorbed >1.5 / strain → high") was implemented literally.
- **What happened:** a live WK-1 card read **"pull back · ACWR 1.6"** while every body row on the same screen said the athlete was fine (HR response holding steady; effort EASIER than typical, 3.9 vs 4.3; cross-training "handling combined load well"). A false prescription — the exact failure the two-key rule exists to prevent.
- **Why the cap did not hold (the real lesson).** The band made a load-only signal reach `'high'`, so the two-key cap became the *only* wall — and `corroborated_strain` is not the honest signal the cap assumes:
  - `effort_perception = makeTrend(allActual, s => s.rpe)` splits **this week's** sessions **first-half vs second-half** at a **5% threshold** (`body-response.ts:293,369`). Hard days landing later in the week read as `'declining'`. That is the plan's *shape*, not fatigue — and it is the **strong-evidence leg** D-266 requires for every escalation. Filed as **Q-167**.
  - The athlete's benign **11 bpm** HR drift sits above the **8 bpm** cold-start corroborator threshold (`absorption.ts:42`). D-265 set 8/14 so 11 would never *solo*-escalate — it doesn't solo, it **corroborates, permanently**.
  - Net: `corroborated_strain` is chronically true for this athlete. Harmless while load could not reach `'high'`; fatal once it could. **The cap was a backstop, never designed to be load-bearing for a load-driven high.**
- **The laws it broke** (all pre-existing, all found only *after* the fact — the process failure):
  - `DESIGN-load-system-extension.md`, §"why authority is stripped from the ratio": *"keep the ratio as an honest descriptive number, **strip its authority to prescribe**, require body-response corroboration before any cautionary verdict."* (ACWR is contested: a Bayesian re-analysis found sRPE-ACWR no better than a random-denominator control.)
  - **Item 3's Rule:** *"the reconciler escalates to a cautionary/prescriptive verdict **only when both keys agree**. Load-high + body-fine → `elevated` max, descriptive copy only."*
  - **D-266:** *"ACWR never escalates through any path."*
  - **Q-137** (already filed as KNOWN-BROKEN): *"'rest now' (ACWR > 1.5) is an unconditional PRESCRIPTION from a composition-blind subsystem"* — tagged **"do NOT patch the gauge."** The band re-created this bug by hand, inside the reconciler.
  - **Constitution Law 6:** a verdict change ships behind a fixture proving the output **did not move**. The fixtures proved the *new* behavior. They were synthetic and multi-athlete (as Q-166 instructed) — but **none was in a plan transition**, so none caught it. A real screenshot did.
- **THE RULE, restated for whoever comes next.** The ratio DESCRIBES; the body PRESCRIBES. If a future slice wants to stop a real elevation reading "balanced", the only lawful instrument is the **descriptive relabel** — `'productive'` (D-280), which is rank-1 (`LOAD_RANK` = on_target's), applied as the FINAL relabel *outside* the escalation ladder, and therefore incapable of producing a prescription. **A `raise()` driven by the ratio is not available.**
- **Cache note:** the revert bumped `COACH_PAYLOAD_VERSION` **forward to 92**, not back to 89 — the gate is `cachedVer >= COACH_PAYLOAD_VERSION`, so restoring 89 would have left the bad v90/v91 rows valid and the false "pull back" would have kept being served from cache. **Any future revert of a payload-shaping change has this same trap.**
- **Also corrected here — D-280 contradicts itself.** Its bullet 3 ("the athlete's 1.64 is a **thin** cross-training base → 'balanced · provisional' (honest)", tagged coach v88) is **stale**: bullet 2's v89 refinement supersedes it ("wrongly flagged REAL-base athletes… Michael's 1.64 sits on **months of established load**"), and the code agrees — the coach nulls the ACWR below a 500-pt chronic base, and the card renders 1.6, so the base clears the floor. **The base is real.** Treat D-280 bullet 3 as superseded.
- **Verified (the revert):** all 10 touched files byte-identical to `45487d50`; 1015 shared tests pass (the 5 cycling-v1 failures are pre-existing, identical on a clean baseline); coach type errors back to 11; `coach` + `workout-detail` redeployed.


## D-282 — "Easy" is anchored to THRESHOLD HR, not max HR — one definition, four starved reads un-starved

- **Date:** 2026-07-13
- **The pattern (the session's real lesson): the app LEARNS a number and then DOESN'T READ IT BACK.** Four separate reads were starved by this, in four different files. Not one of them was *missing*. Every one was built, spec'd, and hungry. See the banner now at the top of CLAUDE.md / START-HERE / ENGINE-STATE.
- **Decision — `_shared/easy-hr.ts`, ONE definition of "is this heartbeat easy":** THRESHOLD-anchored (Friel run Z2, easy = ≤89% LTHR, floor 70%); **%max band 65-80% as the cold-start bootstrap** (the field's aerobic ceiling is 80%, **not** the 75% that starved it); **null when neither anchor exists** (Law 2 — we do not know, so we do not invent); anchor + confidence travel with the number (Law 3).
- **Field receipts (adversarially verified):** **NO shipped app uses an HR CEILING to qualify an easy run** — COROS, the only vendor publishing its gates, uses an intensity **FLOOR**. Where schemes use %max the aerobic ceiling is **80%** (MyProCoach, Garmin). Friel, verbatim: *"Do not use 220 minus your age to find max heart rate as this is as likely to be wrong as right."* **And Efforts had already chosen threshold** — the Baselines screen renders "Friel %LTHR". The learner simply never followed its own zones screen.
- **What was starved, and the receipts:**
  1. **`learn-fitness-profile`** qualified an easy run at `avg_hr <= observedMaxHR * 0.75` (= 131 bpm for a 174 max). The athlete's genuine easy runs (RPE 2-3) are 133-141. **0 of 22 in the learner's own 90-day window.** It needs 3. It could never get 3. → `run_easy_pace_sec_per_km` null forever → the **D-033 pace reconciler** (`generate-combined-plan/science.ts:110` — streak gates, median gate, ACWR gate; the machine that notices an athlete detrained) **had never once run.**
  2. **`compute-facts:1039`** read `learned_fitness.running.threshold_hr` — **a nested path that has never existed** (the real key is top-level `run_threshold_hr.value`). `thresholdHR` was undefined, the block never executed, and `pace_at_easy_hr` was written on **0 of 147 runs** — while `efficiency_index`, the very next block using the same sensor samples, computed fine on 146.
  3. **`compute-snapshot`** then (correctly, D-239) hard-nulled `run_easy_pace_at_hr` to stop persisting garbage. **D-239 treated the symptom; nobody went one level up.** Un-nulled now that the input is real.
  4. **`compute-workout-analysis`** looked for threshold HR **only** in `configured_hr_zones` and the workout's own `threshold_heart_rate` column — both null for a Strava/Garmin-imported athlete — so **every workout silently fell to %HRmax zones** (Z3 = 122-139, Z4 = 139-157). The athlete's easy RPE-3 runs at 133-141 bpm were binned as **TEMPO and THRESHOLD**: a 1-hour easy run read as *"54% Z3 / 44% Z4"*. Downstream, `intensity_distribution` reported **7-20% easy** and labelled him **"high-intensity dominant"** (he is well-polarized) — **the 80/20 check, inverted** — and `session-load` scored the run `pHard=0.44` → the **"hard" 1.2× modifier** instead of the 0.5× recovery one.
- **`calculate-workload:378` was ALREADY correct** — it hydrates `threshold_heart_rate` from `learned_fitness` before inferring intensity. **Which is why the ACWR / load ladder was never poisoned.** The same read, forty lines away, in the files that forgot it.
- **THE BIKE IS UNTOUCHED and NOT routed through the shared band.** Its 65-75%-of-max band + power filter *works* (bike easy HR learned: 130 bpm, 6 rides, high confidence). **Running HR sits 5-10 bpm above cycling at the same perceived effort** (upright, more active muscle mass, weight-bearing) — which is exactly why one %max band works for the bike and locks the run out. **Do not "unify" them.**
- **Also killed (Law 2):** `learn-fitness-profile`'s run `easy_hr` fallback invented `70% of observed max (estimated)`, **sample_count 0**, and shipped it as a confident-looking number (`run_easy_hr = 122` for an athlete who runs easy at ~135). It fired *precisely because* the broken gate found no easy runs: the app failed to observe, filled the hole it had just dug with a guess, and labelled itself **"confident"**. Now null until 3 easy runs land.
- **Proven on real data (the learner's actual 90-day window):** old gate `hr<=131` → **0 of 22** qualify. New band `106-134` → **5 of 22** qualify, learner FIRES, learns **11:08/mi** at high confidence — and **all 5 qualifying runs are RPE 3**. 80 runs correctly **excluded** as too hard (>134 bpm = above Friel Z2). *The gate got RIGHT, not merely looser.*
- **A correction to the session's own narrative:** Claude claimed the athlete had detrained (11:30 → 12:10) and that the plan was prescribing a fabricated pace. **The measurement says otherwise.** His easy pace at controlled HR is 11:08, stable across April/May/June — which is **exactly what the plan prescribes** (`effort_paces.base = 668 s/mi`). The outlier is his **manual 11:30** entry. Today's 12:11 was run at 138 bpm in 80°F — above the easy band; a hot run, not evidence of detraining. **Narrative lost to measurement.**
- **Deploy-forward only.** Zone bins and `pace_at_easy_hr` are stored per workout; history needs a recompute (D-238 posture: watch a few live ingests, THEN decide about backfill).
- Fixtures: 11 (`easy-hr.test.ts`), synthetic HR profiles, never tuned to the primary user. Deployed: `compute-facts`, `learn-fitness-profile`, `compute-snapshot`, `compute-workout-analysis`.

---

## D-283 — HOT RUNS ARE KEPT. D-275's heat exclusion is dead — it was not field-standard, and the athlete's own data says there is nothing to correct. (2026-07-13, supersedes the heat gate in D-275; resolves Q-170)

- **Date:** 2026-07-13. **Supersedes:** D-275's heat-confound exclusion **only**. D-275's other gates (terrain `raw`-drop, steady-aerobic, ≥20 min) and its whole AERO↔spine continuity close **STAND**.
- **What changed:** `state-trend/run.ts` `decouplingToSeries` no longer drops `decoupling_confounded` runs, and `coach/index.ts`'s 7d decoupling receipt no longer skips them. Both died **together** — they are the two engines D-275's own follow-on reconciled, and dropping the filter from one alone would re-open the AERO-vs-PERFORMANCE fracture. `COACH_PAYLOAD_VERSION` → **95**. The analyzer still STAMPS `decouplingConfounded` (the workout screen still says "it was 80°F") — it is simply no longer a substrate filter.

### Why — two independent reasons, and the second one is measured

**1. No shipped product AUTO-EXCLUDES on a temperature threshold.** (⚠ **CORRECTED 2026-07-13 — the first draft of this entry overstated this as "no shipped product discards a session for heat." That was WRONG, and it was inherited unverified from the prior session. Runalyze DOES tell you to exclude hot runs. See below. The decision is unchanged; the justification is narrower and sharper.**)
- **Garmin** ADJUSTS a **retained** estimate, and only on **VO2max / Training Status** — a smoothed multi-week fitness score. It ships **no decoupling trend at all**. Critically, its correction is **acclimation-scaled**: acclimation builds over ~4 weeks of heat exposure and the correction **shrinks toward zero as the athlete adapts**. An acclimated summer runner is, *by Garmin's own model*, owed almost no correction. (Patent **US 11,998,802** — *verified real*: "Method and apparatus for assessing acclimatization to environmental conditions and to assess fitness level taking into account the environmental conditions and the level of acclimatization.")
- **TrainingPeaks** invented Pa:Hr (the metric this trend uses) and shows it **raw**, against a flat 5% band. No heat flag, no correction.
- **RUNALYZE — the closest analogue in the market, and the one we got wrong.** Its "Effective VO2max" is *estimated from the ratio of pace and heart rate* — the same family as our decoupling / efficiency read, so it is the **most relevant precedent of all of them**. Verified against their own docs (2026-07-13):
  - It ships **NO automatic temperature correction.** Temperature correction is an **open feature request** on their public ideas board. Shipped corrections are an individual **HR correction factor** (fitted from your best race HR, typically 0.85–0.95) and an optional **elevation** adjustment.
  - It **DOES** offer a per-activity **manual** exclude ("VO2max for shape" checkbox), and its help **explicitly names heat**: estimates are unreliable *"especially in particularly challenging conditions (very warm/cold/windy, challenging terrain)"*.
  - **BUT ITS ACTUAL TRIGGER IS OUTLIER-NESS, NOT THE THERMOMETER:** *"you should exclude an activity if the estimated Effective VO2max differs from your shape by more than 5 points."* Heat is a listed **cause** of a bad reading, never the **gate** — and the decision is always the **athlete's**, never automatic.
  - **This still refutes D-275**, which auto-deleted on `tempF > 75`. And note: **his hot runs are not outliers** — they read BETTER than his cool ones — so **even by Runalyze's own rule they would be KEPT.** The filter was deleting data Runalyze would have retained.
  - **It VINDICATES the architecture in the user-agnostic limit below:** Runalyze ships a **"VO2max factor analysis"** tool (Premium) — a **multivariate linear regression** over factors *including temperature*, reporting **effect size and statistical significance** — purely to tell the athlete whether temperature affects **them**. Their published example: **−0.29 VO2max points per 8 °C**, with an explicit caveat that they fit linear where quadratic is likelier. **That is the same analysis this decision ran on 81 runs, and it is shipping in a real product.** Run on this athlete, it returns "not significant" — which is exactly what we found.
- D-275's code comment **cited Garmin** and then did the opposite of what Garmin does. The citation refuted the line it justified.
- **Sources (verified 2026-07-13):** runalyze.com/help/article/vo2max · runalyze.com/help/article/when-should-i-exclude-an-activity-for-vo2max-shape · ideas.runalyze.com/posts/208 · blog.runalyze.com/features/new-tool-vo2max-factor-analysis/
- **⚠ PROCESS NOTE (the real lesson).** The original "Runalyze keeps every hot run; heat never triggers its exclude switch" line was **repeated from the untrusted prior session without verification**, and reached a commit message and this log before anyone checked it. It is the *same* failure that produced the "heat-adjust.ts is a corpse" claim. **A citation inherited from a session you don't trust is a LEAD, not a receipt.** See [[feedback_trace_before_build]].

**2. There is no heat effect to correct for — measured, not assumed** (`scripts/verify-heat-decoupling-evidence.mjs`, `verify-heat-decoupling-regression.mjs`, `verify-heat-decoupling-robustness.mjs`; read-only, re-runnable). Regressing decoupling on `heatTerm = max(0, tempF − 60)` across the athlete's **81 steady runs**:

| specification | n | slope (%/°F) | t | 95% CI |
|---|---|---|---|---|
| all steady runs | 81 | −0.135 | −1.07 | [−0.389, +0.118] — straddles 0 |
| trimmed (−10..+20%) | 74 | −0.030 | −0.29 | [−0.233, +0.174] — straddles 0 |
| tightly trimmed (−5..+15%) | 62 | +0.036 | +0.50 | [−0.108, +0.180] — straddles 0 |
| positive decoupling only | 60 | −0.063 | −0.78 | [−0.224, +0.098] — straddles 0 |

r² = **0.014** — heat explains ~1% of the variance. The textbook dose-response (~+0.39 %/°F, from ~2% drift at 22 °C → ~11% at 35 °C) sits **OUTSIDE every CI**. And the outlier-proof median-by-bucket **falls** with heat instead of rising: `<65 °F: 4.90% · 65-70: 3.60% · 70-75: 6.90% · 75-80: 1.60% · >80: 1.45%`. **His hot runs read BEST.** The exclusion was not shielding him from a hot-run lie — **it was deleting his best data.**

**Why his data looks like this (hypothesis, not claimed as proven):** he is a Los Angeles runner who trains through summer, i.e. **heat-acclimated** — exactly the athlete Garmin's acclimation model owes a ~zero correction. Possible second cause: on hot days he simply runs easier, so heat is paid in **pace**, not in **drift**, and a pace:HR ratio is structurally blind to which.

### Why the July-5 bug does NOT come back (verified, not assumed)
D-275 existed to stop one hot 10.7% run standing up a red "durability gap". Removing the filter **does not restore that bug**, because the protection was never the heat filter — it was the **min-sessions floor**. A lone run yields `verdict: 'needs_data'`, and **both** surfaces (`StatePerformanceSection.tsx`, the coach AERO gate at `coach/index.ts`) gate on `verdict !== 'needs_data'` before rendering a band. Probed directly, and now pinned by a fixture that asserts the **outcome** (no surface speaks off one run) rather than the old **mechanism** (substrate empty) — a strictly stronger test.

### What was REJECTED
- **An "adjust for heat" toggle (the standing Q-170 ruling).** Withdrawn on the evidence. There is no coefficient to fit; anything fitted would be **noise**, and a noise-fitted coefficient is precisely what flip-flopped in **D-250**. A toggle also has no second state to toggle to — ADJUST would be multiplying by ~1.
- **A population heat curve.** We have one athlete; we cannot fit a population. (Garmin can — millions of users.)
- **Naming the heat on the State card** ("· 2 of 6 runs were hot"). Retracted in the Q-170 revert as an invention; not resurrected here. The **workout** screen already explains conditions — that is the right home for it.

### ⚠ THE USER-AGNOSTIC LIMIT (read before generalizing this)
**"Heat does not affect decoupling" is an n=1 finding and MUST NOT be hardcoded.** A heat-**naive** athlete (first summer, humid climate) plausibly *does* show the textbook drift. What generalizes is only reason (1): *nobody deletes the session* — that is field-standard and true for every user.
So if a heat correction is ever built, it must be a **per-athlete fitted coefficient that applies nothing unless that athlete's own data earns it.** The machinery **already exists** — `_shared/heat-adjust.ts` fits the coefficient by Huber-IRLS regression, guards identifiability (`HEAT_SPREAD_MIN`, `MIN_REGRESSION_N`), and CI-gates the verdict. Same code, three right answers: acclimated athlete → CI straddles zero → no correction; heat-naive athlete → real coefficient → correction; cold-start athlete → not separable → refuse, show raw.
**Not built now, deliberately:** the "apply a correction" branch has **no real athlete to validate against** (Efforts has one user, and he demonstrably needs no correction). Shipping an unvalidatable correction path tuned on the one athlete who doesn't need one is exactly how D-250 died. Build it when a second user shows a real heat effect; this athlete then becomes the regression proving it correctly does **nothing**.

- **Fixtures:** `run-decoupling.test.ts` — the inverted D-275 pin (hot runs KEPT, kept RAW), the rewritten July-5 outcome regression, a "the OTHER gates still hold" pin (terrain/steady/duration still drop; heat is not a licence to keep junk). 61/61 state-trend green.

---

## D-284 — The observed easy-pace side must qualify the RUN, not the sample; and an INVENTED number may not anchor the band (2026-07-13, Q-171)

- **Date:** 2026-07-13. **Extends D-282** (the shared easy-HR band), fixing three defects found auditing it.
- **Context:** D-282 correctly un-starved the run-pace learner, but shipped three holes. All three are on the path into `resolveRunEasyPace()` (D-033) — **the engine that sets the plan's easy pace** — so all three could move real training.

**1. The observed side qualified SAMPLES, not RUNS (the contamination).** `compute-facts` harvested easy-band samples from **every** run behind a **10-sample** floor (~10 s at 1 Hz). On an interval/tempo session that captures two lies at once: the **warm-up/cool-down** (in-band HR, genuinely slow) and the **HR-lag opening of each hard rep** (HR hasn't caught up, pace already fast). Result: a `pace_at_easy_hr` written for a HARD workout, noisy in an unpredictable direction, flowing to `athlete_snapshot.run_easy_pace_at_hr` → the D-033 reconciler. A noisy-slow patch is exactly what trips `reconciled_worse` and **slows the athlete's plan down**.
  - **This is the same disease D-275-bike already cured**, in nearly the same words — *"a threshold-level segment jacks in-band HR via cardiac lag"* (`state-trend/bike-fitness.ts`). The run side never got the fix. Cured the same way: qualify the **session**, not the sample.
  - **Fix:** `runEasyPaceEligible()` in `_shared/easy-hr.ts`. The intensity gate is **deliberately the same predicate the BASELINE learner already applies** (`learn-fitness-profile`: `duration >= 20` **and** the run's own avg HR inside the band) — the reconciler *compares* baseline against observed, so they **must** measure one population (Law 1). Before this, baseline qualified whole runs and observed qualified loose samples: it was comparing two different athletes. Plus a real **dwell floor** — `MIN_EASY_PACE_IN_BAND_S = 600`, mirroring the bike's constant, in **seconds** derived from the file's own sample cadence (Garmin smart-recording is not 1 Hz, so a raw sample count means different amounts of time on different files).
  - Intensity-gated, **not label-gated**, on purpose: an unlabeled interval session is caught the same, and nothing depends on the analyzer having classified the run before `compute-facts` runs.

**2. An INVENTED number could anchor the band (Law 2 violation).** `learn-fitness-profile` has a last-resort branch writing `run_threshold_hr` = *"88% of observed max (estimated)"*, confidence `low`, **`sample_count: 0`**. `easy-hr.ts` accepted it with no gate and then announced *"Friel Z2 — at or below 89% of your threshold HR"* over a number nobody measured. **And it was not conservative:** `0.89 × 0.88 = 78%` of max ceiling and `0.70 × 0.88 = 62%` floor — **tighter and lower than the honest %max bootstrap (65-80%)**, i.e. it drifted straight back toward the very Q-169 starvation it claimed to cure. D-282 killed the twin fabrication (`run_easy_hr`, sample_count 0) and left this one load-bearing.
  - **Fix:** a metric declaring **`sample_count === 0`** cannot anchor; fall through to the bootstrap, which at least says it is one. **The gate is measured-vs-invented, not weak-vs-strong** — the 95th-percentile fallback (low confidence, `sample_count >= 3`) is a *weak measurement* and still anchors. An **absent** `sample_count` means "not stated", not "measured nothing", and is accepted (the in-pass synthetic band passes no count). Precedent: `generate-combined-plan/science.ts` `baselineUsable` already refuses `confidence === 'low'` for the same class of call.

**3. Two Friel Z2 ceilings, shipped 40 minutes apart.** `easy-hr.ts` topped easy at `round(0.89 × LTHR)` = 134 while `compute-workout-analysis`'s Friel zone array began Zone 3 at `round(0.90 × LTHR)` = 136 (LTHR 151). **A 135 bpm run was Zone 2 on the Details screen and "not easy" to the learner** — one fact, two screens, opposite answers: the exact failure the shared band was written to end. Both are defensible Friel (Z2 = 85-89%, Z3 starts at 90%); the bug is that they were **two numbers**.
  - **Fix:** `runEasyZone3FloorBpm(lthr) = easyCeiling + 1`, exported from `easy-hr.ts` and consumed by the analyzer. **`isEasyHr(hr) === true` ⇔ hr bins to Zone 1 or 2, by construction, permanently.** No number was hand-picked; the boundary is now *derived* from the one ceiling.

- **Fixtures:** 13 new in `easy-hr.test.ts` (24 total, all green) — incl. the interval-session regression, the tempo refusal, the dwell-floor-is-TIME pin, the `sample_count: 0` anchor refusal (which also asserts the fabricated anchor would have been *strictly tighter* than the honest bootstrap), and a **Law-1 pin sweeping runs through both the baseline predicate and the observed predicate and asserting they never diverge.**
- **Blast radius / backfill:** `pace_at_easy_hr` and the LTHR zone bins are **stored per workout**. History was computed under the old rules, so a recompute is owed — see ENGINE-STATE "owed". Deploy-forward alone leaves the 5-week intensity window mixing two zone schemas.

---

## D-285 — The run-pace stack: ONE resolver, NO silent writes, NOTHING hidden from the athlete (2026-07-13, SPEC-run-pace-glass-box)

> **↪ EXTENDED to STRENGTH by D-315 (2026-07-23).** This decision deleted the silent ENDURANCE auto-writes; D-315 applied the same rule to STRENGTH — deleting `adapt-plan`'s silent auto-progression/deload writes so working weights change only on the athlete's tap. The "no silent write, the athlete gets the choice" principle now covers both endurance and strength.

- **Date:** 2026-07-13. **Spec:** `docs/SPEC-run-pace-glass-box.md`. **Changes no number's VALUE** — only where it comes from, who may overwrite it, and what travels with it.

### ⛔ FIRST: what this decision REJECTED (read before "improving" it)
A proposal to **derive easy pace from threshold pace** (Daniels/Friel) instead of learning it. **Traced and killed.** Do not resurrect:
1. **It already exists.** `create-goal-and-materialize-plan/index.ts:319-325` already does `learned threshold → estimateVdotFromPace → getPacesFromScore → .base`, as the FALLBACK, with learned-easy overriding it at `:340-347`. There are **four** copies of the VDOT model in the repo. The proposal was never "build it" — it was "invert its precedence."
2. **D-033 already rejected it** (`DECISIONS-LOG.md:691`, verbatim): *"**Threshold pace as the signal, not easy pace. Rejected** — Easy pace at HR is the cleanest read on aerobic fitness; threshold prescriptions inherit via Daniels ratios anyway."*
3. **It re-breaks Law 1 permanently.** The D-033 reconciler compares BASELINE vs OBSERVED, and D-284 spent real effort forcing both to *measure one population*. A Daniels table value is an inference with a **fixed structural offset** from the measured observed side. The reconciler would stop measuring *fitness change* and start measuring *the athlete's deviation from Daniels* — which never goes away. Dense data → `reconciled_better` fires forever (a lie). Sparse data (the norm) → the derived slow pace goes **straight into the plan**. Same change, opposite failure, decided by how much the athlete happened to run. It also **blunts detraining detection by the full 20-60 s/mi** — the exact thing that machine exists to catch.
4. **`baselineUsable()` (`science.ts:70-79`) requires `confidence !== 'low'` AND `sample_count >= 2`.** A table lookup has neither. Shipping it would require **fabricating a sample_count** — the precise Law 2 violation deleted in D-284.

**The math was never the problem. The plumbing was.**

### What shipped

**1. `resolveCurrentRunEasyPace` (`src/lib/resolve-current-run-pace.ts`) — the run twin of `resolveCurrentFtp`.** Pure, no I/O, client+edge. Precedence: learned(med/high) → manual → effort_paces(`is_estimate: true`) → learned-low → **null**. Carries `source` / `confidence` / `sample_count` / `as_of` / `is_estimate` to every surface (Law 3). **It owns the sec/km → sec/mi conversion, once** — the unit footgun that has bitten this repo three times (`learned_fitness` is sec/km; `performance_numbers.easyPace` is sec/mi and is sometimes a `"9:30"` string). 11 fixtures, incl. an explicit "a sec/km value must never leak to the surface unconverted" pin.

**2. SEVEN FABRICATED PACES DELETED (Law 2).** A number with no provenance was reaching verdicts the athlete reads:
- `analyze-running-workout/index.ts:451` — **the worst one.** A `catch` block guarding an *unrelated* historical-drift query responded to failure by **replacing the athlete's real `performance_numbers` with a hardcoded fictional athlete** (5K 7:30/mi, easy 9:00/mi, marathon 10:00/mi) — and the analyzer then **GRADED their workout against it** ("N/mi faster than your baseline base pace"). A transient DB error swapped in a stranger's paces and judged the run by them. Now: the drift context is lost, the truth is not.
- `_shared/token-parser.ts` ×3 and `lib/analysis/running/token-parser.ts` ×3 — `baselines.easyPace || 540`, an invented 9:00/mi written onto the **planned session** as its pace target. Now the segment ships with **no target** when the pace is unknown (`RunSegment.target_pace` is optional exactly so this is expressible). "10 min warm up", not "10 min warm up @ 9:00/mi". *(Note `getPaceFromReference` in the same files already returned `null` honestly — one file, two philosophies. Now one.)*
- `_shared/end-plan-core.ts:72` and `_shared/planning-context.ts:380` — `effort_paces.base ?? 600`. These convert a long-run **duration** into **miles** (`miles = min × 60 / paceSec`), so an invented 10:00/mi silently rewrites the athlete's recorded peak long run by ~10% (a 90-min run reads 9.0 mi instead of 8.1 mi at a real 11:08/mi) — and that fiction feeds volume/progression reasoning. Unknown pace → **we do not convert**.

**3. THE APP NO LONGER OVERWRITES THE ATHLETE (`adapt-plan/index.ts`).** Deleted **two** silent auto-writes (easy pace AND FTP). Each one, on a ≥7% divergence with a `high`-confidence learned value, **wrote `user_baselines.performance_numbers`** — the athlete's own typed number — with **no prompt, no consent, and no un-write path**, then re-materialized the plan off the number it had just changed behind their back. The easy-pace one cascaded into token targets, materialize-plan's chain, client token expansion, and (via `materialize-plan:543`, `easyPace - 30`) **the marathon-pace target**.
**Deleting it costs nothing:** the athlete-gated SUGGESTION path (`end_easy_pace`, `adapt-plan:349` → apply at `:935`) already fires on a **strictly looser** trigger — ≥5% at ≥medium confidence vs this block's ≥7% at high. **Every case the auto-write caught was already a suggestion.** The only thing the auto-write added was the absence of consent. No commercial app does this; Garmin/TrainingPeaks/Runalyze all suggest and let the athlete adopt.

**4. Provenance reaches the LLM (`_shared/arc-context.ts`, Law 3).** `buildRunPaceForCoach` stripped `confidence`/`sample_count`/`as_of`, so the model received threshold and easy **identically and indistinguishably** — a 5-run medium read looked exactly like a 20-run high one, and a pace unmoved since May looked current. The prompt tells the model to *quote* these paces. Now each entry carries its confidence, sample count and `as_of`, plus an in-band `_confidence_note` forbidding the model from asserting above them.

**5. A latent NaN bug (`create-goal-and-materialize-plan:2401`).** `Number(learned_fitness.run_easy_pace_sec_per_km)` read the **metric object**, not `.value` → `NaN` → `NaN > 0` false → the Get Strong maintenance-endurance band **had never once been applied**. Silent and invisible. Now routed through the resolver.

**6. The athlete can see and edit their own number again (`TrainingBaselines.tsx`).** The manual easy-pace input was gated on `!hasEasyLearned` — so the moment the app learned a pace, **the athlete's field vanished**: no accept, no reject, no override. Both are now rendered, and the one actually **in use** is named, because precedence gives a medium/high learned value the win. (Q-174 asks whether that precedence is right — the athlete's explicit assertion arguably *should* beat an inference. Not decided here.)

### What this deliberately does NOT touch
D-033's reconciler, the easy band (`easy-hr.ts`), the VDOT tables, and **no number's value**. Existing plans are unaffected *except* that (3) removes a silent mutation that was moving them — a fix, not a regression.

### Verification
1052 shared tests pass (the same 5 pre-existing cycling-v1 failures); 11 new resolver fixtures; client `vite build` green; zero new type errors in `_shared` (50→50), `adapt-plan` (0→0), `arc-context` (0→0), `token-parser` (0→0/4→4), `analyze-running-workout` (62→62), `create-goal` (47→47), `TrainingBaselines` (1→1).

---

## D-286 — ONE Friel zone model. The zone table the athlete READS and the band the engine APPLIES cannot disagree again. (2026-07-13)

- **Date:** 2026-07-13. **Completes D-284's third fix**, which was only half-done.
- **The bug (live on the athlete's own screen).** The Friel Z2/Z3 boundary was hardcoded in **three** places that rounded independently:

| file | boundary | @ LTHR 151 |
|---|---|---|
| `_shared/easy-hr.ts` | easy ceiling = `round(0.89 × LTHR)` | **134** |
| `compute-workout-analysis/index.ts` | Z3 floor = `round(0.90 × LTHR)` | **136** |
| `src/components/TrainingBaselines.tsx` `getFrielZones` | Z2 max = `round(0.90 × LTHR)` | **136** |

  So a **135 bpm run was "Zone 2 Aerobic" on the athlete's Baselines screen and "too hard to be easy" to the learner that sets their plan's pace.** One fact, two screens, opposite answers — the exact failure the shared easy band was written to end.
- **D-284 claimed to fix this and fixed only ONE of the two divergent copies** (the analyzer). It missed `TrainingBaselines.tsx` — **the copy the athlete actually looks at.** Caught when Michael sent a screenshot of his own Baselines screen showing `Z2 128-136` while the engine was cutting easy at 134.
- **The fix.** `src/lib/friel-zones.ts` — one model, client + edge. `easy-hr.ts` re-exports from it (so every existing importer is unchanged); `TrainingBaselines.getFrielZones` renders it; the analyzer's `runEasyZone3FloorBpm` delegates to it. **Z2's ceiling IS `easyCeilingBpm`, and Z3 begins one beat above it — derived, never rounded independently.** So:

  > **`easy` ≡ `Zone 1 or Zone 2` ≡ `hr <= easyCeilingBpm(lthr)`** — by construction, at every LTHR, on every surface.

- **Shared-code direction (load-bearing):** the client **never** imports from `supabase/functions/_shared`; shared code lives in **`src/lib/`** and edge functions import *from* it (the `resolve-current-ftp.ts` / `session-frequency-defaults.ts` precedent). That is why the model landed in `src/lib/`, not `_shared/`.
- **No number was hand-picked and NOTHING is tuned to the primary user.** All three copies were defensible Friel (Z2 = 85-89% of LTHR; Z3 begins at 90%). **The bug was never the number — it was that there were three numbers.** Z4/Z5 boundaries (0.95 / 1.05) are carried over untouched; only the fractured Z2/Z3 seam is consolidated.
- **Verified:** a sweep across LTHR 140-180 asserts, at every value, that `Z2.max === band.ceiling`, that the last beat of Z2 **is** easy, and that the first beat of Z3 **is not**. 24/24 `easy-hr` fixtures green (incl. the D-284 boundary pin, which now passes against the shared model); 1056 shared tests; client `vite build` green.

---

## D-287 — The run-pace resolver is now UNIVERSAL on the server. One truth, every surface. (2026-07-13, completes D-285)

- **Date:** 2026-07-13. **Completes D-285**, which created `resolveCurrentRunEasyPace` and wired only **3** consumers. **D-285 stopped the app LYING (killed 7 fabricated paces). It did not stop the app DISAGREEING WITH ITSELF.** This closes that.
- **The disease, measured.** Three *different* precedences were live simultaneously:

| surface | its own precedence | consequence |
|---|---|---|
| `analyze-running-workout:337` (**GRADES the workout card**) | `effort_paces` → manual → learned | the card judged the run against one pace… |
| `_shared/athlete-snapshot.ts:258,404` (**writes the PLAN PIN**) | **learned ONLY** — ignored manual AND the Q-174 choice entirely | …while the plan prescribed off another. A plan could be pinned to a pace the athlete had **expressly rejected**. |
| `resolveCurrentRunEasyPace` | choice → learned → manual → effort_paces | the agreed one |

  This is exactly the disease `resolveCurrentFtp` was written to cure — *"8 different ad-hoc `||`/`??` fallback chains that previously chose differently per consumer"* — reproduced on the run side, and D-285 only cured a third of it.

- **Routed through the ONE resolver (3 callers → 9):**
  - `analyze-running-workout` — the pace the workout card **grades** against. (`base` only; steady/power/speed/race have no resolver yet.)
  - `_shared/athlete-snapshot.ts` — **both** the pin writer (`extractRun`) and the live read (`resolveLiveRun`). **Pin semantics are unchanged** (a plan freezes its pace for its lifetime — correct, D-033); only *which value* gets frozen is corrected.
  - `materialize-plan` — a `_resolvedEasySecPerMi` stamp mirroring the existing `resolveCurrentFtp` precedent, read at **§1b**: below the snapshot pin (a pinned plan still wins) and **above** the old `effort_paces → manual` chain. So an **unpinned** plan now agrees with every other surface.
  - `generate-strength-plan` — **DELETED a whole private ad-hoc resolver** (Q-105) with its own sec/km→min/mi conversion and its own unit-sniffing regex.
  - `course-detail` — restructured so the athlete's **explicit choice outranks the learned value** (previously learned always won and a chosen manual number was silently ignored).
  - `_shared/block-adaptation` — **deliberately NOT routed** (it is a *divergence detector*: it needs BOTH learned and manual; the resolver returns one). But: it no longer **nags an athlete to reverse a choice they made** (Q-174 guard), and its `evidence` string no longer **hardcodes** *"Learned from recent easy runs"* regardless of the value's actual provenance or age (Law 2).
  - (Already wired in D-285: `create-goal-and-materialize-plan`, `planning-context`, `end-plan-core`.)

- **⚠ BEHAVIOR CHANGES, named honestly.** No number was invented, but two real behaviors moved:
  1. The **workout card's easy-pace verdict** now grades against the resolved pace, not `effort_paces`-first. A run previously called "faster than your baseline base pace" may now read differently — because it is now being compared to the pace the *plan* actually used.
  2. An **unpinned plan's** easy targets now resolve learned-first (or athlete-chosen-first) instead of `effort_paces`-first. **Pinned plans are untouched.**

- **⚠ STILL OPEN — the CLIENT re-derives (Law 4).** `src/services/plans/normalizer.ts:54`, `StructuredPlannedView.tsx:352`, `PlanSelect.tsx:585`, `PlanWizard.tsx:470`, `AllPlansInterface.tsx` all still read `performance_numbers.easyPace` directly to expand `{easy_pace}` tokens. They **cannot** call the resolver — the client is only handed `performanceNumbers`, never `learned_fitness`. **The right fix is not to ship the resolver to the client; it is for the SERVER to send the already-resolved pace** (Law 4: surfaces render, they never re-decide). Filed as **Q-175**. Deliberately not half-done here.

- **Verified:** 1056 shared tests pass (same 5 pre-existing cycling-v1 failures); client `vite build` green; **zero new type errors** — `analyze-running-workout` 62→62, `materialize-plan` 0→0, `athlete-snapshot` 0→0, `block-adaptation` 0→0, `generate-strength-plan` 0→0, `course-detail` 2→2 (both pre-existing).

---

## D-288 — An EASY run is judged on HEART RATE, not pace (2026-07-13, SHIPPED + DEPLOYED)

> ⚠️ **Written 2026-07-14, a day late.** This decision shipped in `cde3f761`, was cited by `CAPABILITY-MAP`, and **was never actually written to this log** — the log ended at D-287 while the code was already at D-288. Caught while retiring `SPEC-exercise-substitution`. A decision that exists only in a commit message is a decision the next session cannot find.

- **Context:** the Performance screen judged an easy run on **pace** and told a strength-primary athlete he was *"1:06/mi slower"* — while his heart rate said the run was exactly as easy as prescribed, and his RPE said 3/10.
- **Decision:** an EASY run's verdict reads **HEART RATE**, not pace. Pace on an easy run is an outcome (of heat, terrain, fatigue, and the day); the *intent* is an aerobic intensity, and HR is what measures it. (`analyze-running-workout`.)
- **The class this belongs to — and it is the most useful thing in the entry.** D-288 was the **third** *"right about the number, wrong about the athlete"* bug found that day. **Garmin** judges VO2max and cannot see his lifting → *"Unproductive."* **State** judged aerobic base without knowing he is strength-primary → *"needs work."* **Performance** judged pace and ignored his HR → *"1:06/mi slower."* **Each is right about the number and wrong about the athlete.**
- ⚠️ **The class is NOT closed.** D-288 fixed it on **Performance only**. State is still posture-blind — see **Q-179**, where the plan's own copy says *"maintenance only (held so strength leads)"* while State says *"aerobic base needs work"* about the same discipline in the same week. **`per_discipline_posture` appears ZERO times in the spine and ZERO times in the coach.**
- **Verified:** simulated across 5 real steady runs (old vs new, side by side).

---

## D-289 — A SWAP IS NOT A SKIP: the SLOT is the unit of strength adherence, not the exercise name (2026-07-14, SHIPPED + DEPLOYED)

**Supersedes `docs/SPEC-exercise-substitution.md` slices 1 + 3.** *(Slice 2 — the Swap sheet with offered in-slot alternatives — is still an open contract in that spec. When it ships, it becomes a D-entry and the spec is DELETED. See the SPEC lifecycle rule in `CLAUDE.md`.)*

- **The bug (a DOUBLE penalty).** `matchExercises` linked planned↔executed **by exercise NAME only**, and no substitution concept existed anywhere. So an honest swap — hip thrust instead of a planned Bulgarian split squat — read as **two** failures: the planned lift became a **SKIP** (dragging D-208's 30%-weighted completion term), and the work actually done was dropped from the denominator entirely (**zero credit**). *Penalised for what he didn't do, and unpaid for what he did.*
- **The decision, and it is the field's, not ours.** **No commercial strength app treats the EXERCISE as the unit of adherence. They treat the SLOT** — the movement pattern the program prescribed. *(ABC Trainerize's substitution filters are literally "Same muscle group / Same Equipment / Same movement". Fitbod auto-substitutes same-muscle at equivalent intensity. RP Hypertrophy swaps mid-cycle from a library. Built with Science: swap "while keeping the plan structurally sound." Consensus on a good substitute: **match the movement pattern**.)* **Swap within the slot and NOTHING WAS MISSED** — which is why the field has no "should a swap be docked?" debate. The question never arises.
- **And the taxonomy already existed.** `exercise-config.ts` `primaryRef` (`squat | deadlift | bench | overhead | hipThrust`, ~135 research-cited entries) **is** the movement-pattern slot. **Nothing was invented — adherence had simply never met it.** *(Moved `materialize-plan/` → `_shared/strength/`, since two functions now need it.)*
- **The declaration, with NO new UI.** The exercise name field is already an editable search box — so typing over a prescribed exercise **is** the declaration, and it is meaningfully different from skipping the lift and adding a separate one. It was simply invisible. A prefilled exercise now carries `planned_name`; a changed name derives `substituted_for` at save. **A hand-added exercise has no `planned_name` and can therefore NEVER become a swap.** *(Law 2: record what the athlete told us; never infer.)*
- **Never grade what you cannot anchor (the Q-180 rule).** A declared swap counts as **COMPLETED** — but is **excluded from load/RIR adherence**: the substitute carries no prescription of its own, and grading a hip thrust against a split squat's target is nonsense. With no anchored match, load goes **silent at 100** (no signal → no penalty, no reward), exactly as `rirAdherence` already does with no RIR data.
- **The wedge — the one thing the field does NOT do.** In-slot swap → **SILENT** (nothing was missed; narrating it would make the app a nag). Out-of-slot → **no dock**, and one **deterministic** sentence computed from `primaryRef`, never LLM prose: *"Swapped Bulgarian Split Squat → Hip Thrust. Hip-dominant instead of knee-dominant — same session, different stimulus."* **It names the trade; it never predicts its cost** — a fixture asserts the sentence contains no consequence claim (the Tier-2 trap of `SPEC-posture-flag.md §4`).
- ⛔ **THE GUARD, and it matters more than the feature.** `matchExercises` is the core of **every** strength execution score and had **no fixture at all**. It was extracted to `_shared/strength/match-exercises.ts` and pinned — the **first two tests** are *"an undeclared miss is STILL a skip"* and *"logging a different exercise with no declaration is a skip PLUS an unplanned extra."* **Forgiving a real skip would be a score that lies in the athlete's favour** — the failure mode `CANON-arc-inference-model.md` exists to prevent, and far worse than the bug this fixes. Those guards were written and passing **before** the matcher was changed.
- **Note for a future session:** an athlete who **adds** an exercise instead of renaming the prescribed one still eats the dock. That is **correct** (the planned lift genuinely went undone) — but the rename gesture is **undiscoverable**, which is exactly what slice 2 exists to fix. **Delete-and-re-add destroys the link; that is precisely why the field makes Swap a first-class action.**
- **Verified:** 19 new fixtures (12 matcher, 7 note). Suite 1069 → 1088, 0 failed.

---

## D-290 — The SWAP SHEET, and the `primaryRef` bug it exposed: a LOADING reference is not a MOVEMENT PATTERN (2026-07-14, SHIPPED + DEPLOYED)

**Completes D-289. `SPEC-exercise-substitution.md` is now DELETED** — the scaffolding came down (see the SPEC lifecycle in `CLAUDE.md`).

### 🔴 The bug D-289 shipped, and how it was caught

Michael: *"Did we open a can of worms with Bulgarian Split Squat being the only exercise with options?"*

**He was right, and it was worse than thin coverage.** Measured: **54 exercises had alternatives, 38 had ZERO** — and almost every zero was a **bodyweight** movement. Chasing why exposed a real bug in already-deployed code:

```
Barbell Row  ->  primaryRef: 'bench'          // because a row LOADS at ~80% of your bench
```

The config's own section header says it in terms: **`// UPPER PULL (Bench Reference AS PROXY)`.**

**`primaryRef` answers "which 1RM do I derive the working weight from." It is a LOADING reference, not a movement pattern.** D-289 built the substitution slot filter on it and called it a pattern taxonomy. So:

- `getInSlotAlternatives('Barbell Row')` → **Bench Press · Dumbbell Bench Press · Incline Bench · Dip · Chest Fly.** **A PUSH FOR A PULL.**
- **`substitution-note.ts`, already deployed,** read a row and a bench press as the **same slot** and would have stayed **SILENT** on that swap — quietly blessing it. *(Latent only because the swap fires on a rename and nobody had renamed anything.)*
- And every bodyweight movement had `primaryRef: null` → no pattern → **no options at all — including PULL-UPS, which the research says are the most commonly substituted exercise in the gym.**

### The fix — TRANSCRIPTION, not invention

A real `pattern` field (`MovementPattern`): `knee_dominant | hip_dominant | horizontal_push | horizontal_pull | vertical_push | vertical_pull | core | plyometric | calf`.

**Nothing invented.** The vocabulary is transcribed from `exercise-config.ts`'s **own section headers** — KNEE DOMINANT / HIP DOMINANT / UPPER PUSH / UPPER PULL / SHOULDERS / PULL-UPS / PUSH-UPS / CORE / CALF / PLYOMETRIC. **The taxonomy had been sitting in that file as comments the whole time.** It also matches the field's own rule for a good substitute: *"a horizontal push is replaced by another horizontal push."* 135 entries stamped, with explicit overrides where a section header lies (lat pulldown sits under UPPER PULL but is a **vertical** pull; inverted row sits under PULL-UPS but is **horizontal**; pike push-up is a **vertical** press).

| | before | after |
|---|---|---|
| Barbell Row | Bench Press, Dips, Chest Fly | Bent Over Row · Dumbbell Row · Face Pull · Inverted Row |
| Pull-up | *(nothing)* | Chin-up · **Lat Pulldown** *(the field's #1 pull-up substitute)* |
| coverage | 54 with / 38 without | **89 with / 1 without** |

### ⛔ And the ROLE filter was REMOVED

1. **The field does not filter on role.** Trainerize's filters are *"Same muscle group / Same Equipment / Same movement."* Fitbod matches *"same muscles at equivalent intensity."* Neither uses load tier. *"An accessory can't be swapped for a main lift"* was **my** judgment, not the field's — and the brief was explicitly *"follow whatever a commercial strength app would do, let's not invent anything."*
2. **`roleForExercise` is too noisy to filter on anyway:** `barbell row` → **primary**, `bent over row` → **accessory**. *The same movement.* Filtering on it produced **empty lists**. ⚠️ **That inconsistency is a real data bug in `exercise-role.ts` — filed, not papered over.**

### The sheet (slice 2)

A **Swap** action on any **prescribed** exercise (a hand-added one was never prescribed → nothing to substitute for → an undeclared miss stays a skip). It offers in-slot alternatives filtered by pattern + the athlete's equipment. **Picking one just RENAMES the exercise — the exact same data path the manual rename already used.** One data path, two doors. The free-library override stays: the name field is still a search box, so the athlete can pick **anything**, including out-of-slot. **The app does not block.**

**A swap CLEARS the prescribed weight.** That number was computed for a *different* exercise (BSS = 50% of squat; hip thrust = 90% of deadlift) — carrying it across would show a weight the app cannot stand behind, and one the athlete might actually load. Even an in-slot swap shifts the ratio. **Law 2: do not display a number you cannot anchor.** Reps/duration are kept — the volume prescription still stands.

### ⚠️ Stated, not faked
Pure **shorthand aliases** survive the dedupe ("Bench" next to "Bench Press") because their configs differ only in `notes`. Every option shown is **correct**; the list is just slightly noisy. Every cleverer rule broke something real (`squat` is a substring of `front squat`, which is **not** an alias of it), so I stopped rather than invent one.

### Also still open (from the deleted spec)
**The schedule-aware contradiction check.** The plan protects the athlete by **PLACEMENT, not by exercise** (`strength-primary-plan.ts:182` — the bias slot lands on Upper A *"maximally removed from the long run… for ANY selection"* [Wilson 2012]), **so an in-slot swap cannot break it — the day did not move.** The real risk is a **cross-region** swap (lower-body work onto an upper day, with heavy Lower tomorrow). ⛔ **And it does NOT belong on Performance** — telling an athlete after they trained that their swap conflicts with tomorrow is useless. **That is a nag, not a coach.** It belongs in the Swap sheet, at the moment of choosing. **BLOCKED ON:** the logger sees `scheduledWorkout` but **not the week**, so it cannot know what is tomorrow.

**Verified:** all four suites green (`_shared` 1090 · `shared` 106 · `generate-run-plan` 33 · `src/lib` 198). Q-126 golden byte-identical.

---

## D-291 — A CONFIDENCE FLAG IS NOT AN EXCLUSION ORDER; and grade-adjusted ≠ effort-adjusted pace (2026-07-14, SHIPPED + DEPLOYED + PUSHED, VERIFIED IN DB)

Two run-stack fractures, one commit (`4fece5da`). Both are word collisions — a label meaning two things, and the harsher reading winning.

### Part 1 — the durability trend was silently DELETING runs

**The last banner's "as of Jun 27, 16 days stale, DO NOT GUESS" mystery, solved by a DB query, not a theory.** `decouplingBasis='raw'` meant ONE thing in `state-trend/run.ts:196` (which DROPS `basis='raw'` from the durability substrate): *no usable elevation → pace never grade-adjusted → terrain-confounded.* But the 2026-07-12 D-037 restore ALSO forced `basis='raw'` whenever the variance gate flagged a run mixed-effort — a *"this number is low-confidence"* stamp that deliberately KEEPS the honest `steady_state` label. **The variance gate fires on ~10 of 11 real outdoor runs** (pace CV 12–29% is just running: hills, lights, corners). So after 2026-07-12 every run was binned and the trend froze. **The low-confidence stamp was read as a delete order.**

- **Fix:** the two facts travel on separate channels. `decoupling.basis` = TERRAIN ONLY (was the pace grade-adjusted). New `decoupling.mixedEffort` (persisted as `heart_rate_summary.decouplingMixedEffort`, carried to the spine as `decoupling_mixed_effort`) = the confidence hedge. `decouplingToSeries` drops only true no-elevation `'raw'` runs; a mixed-effort STEADY run keeps its point, hedged in prose not erased.
- **Verified:** 3 runs recomputed → all `basis='gap'` (the elevation was there all along), `newestAgeDays 16→1`, `sampleCount 5→8`.
- **THE RULE (now also in `STATE-SOURCE-MAP.md`):** if a metric should be dropped, drop it on the fact that makes it wrong — never on a label that happens to be spelled the same. Field standard (Garmin/TrainingPeaks): hedge the metric, never silently delete the session.
- **Fixtures:** `session-detail/decoupling.test.ts` rewritten — the old test PINNED the bug (asserted `forMixedEffort` forces `basis='raw'`). New tests pin the split + a regression that a mixed-effort steady run survives the durability filter.

### Part 2 — the route chart never removed hills at all

`gap_pace_s_per_km` (the "GAP" on the route sparkline, `fact-packet/build.ts`) was fed from `route_progress_metrics.effort_adjusted_pace_sec_per_km`, which `compute-facts` computes as `pace × (avg_hr / threshold_hr)` — **HR-NORMALIZED. There is no hill in that formula.** Three places (the display contract, the client, D-105's own comment) documented it as grade-adjusted. So "am I faster on this loop" moved with how hard the heart worked, and a hilly route stayed hilly.

- **The real grade-adjusted pace existed all along, read by nobody:** `workouts.computed.overall.avg_gap_s_per_mi` (`_shared/gap.ts`, Minetti metabolic cost — the model behind Strava GAP / TrainingPeaks NGP), populated on 13/13 runs.
- **Fix:** GAP now feeds the route sparkline (`gap_pace_s_per_km`); the effort-adjusted number keeps its own honest name (`effort_adjusted_pace_s_per_km`); a **Grade-Adj Pace tile** was added to Details (`CompletedTab`, `useWorkoutData` reads the server number — D-186: the client never re-derives GAP). ⚠ Units: `avg_gap_s_per_mi` is sec/MILE; the contracts are sec/KM.
- **Heat: explicitly NOT built.** No app rewrites pace for heat, and D-283 already ruled it. Tested and rejected on n=67 steady runs (temp, dew point, strength-block all fail to explain the decline). If ever built it is a per-athlete fitted coefficient that applies nothing unless earned (`heat-adjust.ts` already refuses on this athlete).

## D-292 — POSTURE: grade each discipline against what the athlete DECLARED, and a maintained discipline's decline is a TRADE, not a failure (2026-07-14, SHIPPED + DEPLOYED + PUSHED, VERIFIED IN DB — closes Q-179 Tier 1)

**The live receipt for Q-179, root-caused on real data.** Michael declared `run='maintain', strength='develop'` on his active goal (`goals.training_prefs.per_discipline_posture`). He ran ~3×/MONTH (declared 3×/WEEK), so his speed-at-HR fell — he **detrained on purpose to build strength.** State graded his running like a marathon PR ("aerobic base needs work", amber) because `per_discipline_posture` was **read ZERO times at runtime** — written once at plan build (D-210) and thrown away.

- **The join (`_shared/state-trend/posture.ts`):** declared intent + what they DID + how it went → what it MEANS. `develop`+sliding = a concern; `maintain`+slipping = a stated trade; `maintain`+STOPPED = the Tier-1 fact ("you said 3/wk, you're doing ~1.6/wk — a trade, make it on purpose"); `out` = parked, silent; no posture = `unknown` = today's behaviour byte-for-byte (additive, no regression).
- **⛔ BEHAVIOUR OUTRANKS THE TREND** for `maintain`. A false-comfort bug was caught in review: the first cut joined posture to the PERFORMANCE VERDICT ('improving', from within-run drift), which would have said *"you're maintaining running, and you are"* while he'd stopped. A trend cannot answer "did you keep doing it" — only the calendar can. Same class as `off-plan-banner.ts:66` ("strength on track" to an athlete running zero planned runs). Pinned by a test named after the bug. Also fixed a float trap (`3 × 0.8 = 2.4000…4` told an athlete doing EXACTLY their target that they'd stopped) → compare the ratio with an epsilon.
- **`MAINTAIN_SHORTFALL_BAND = 0.8`** — not hand-picked: TrainingPeaks grades compliance on ±20%, so a fifth of declared volume is the field's line between "close enough" and "a different thing happened". A DISPLAY threshold, not a physiological claim.
- **Honesty (verified via deep research vs Garmin/TrainingPeaks/Runalyze):** no jargon (consumer apps use ZERO of "decoupling"/"efficiency factor"/"aerobic base"/"durability"); no cause asserted (we can't see sleep/HRV — and Garmin, which CAN, still refuses); not a compliance cop (a trade is not a failure — `SPEC-posture-flag.md §6`). NO app grades against declared intent → genuine market gap (firm for TP/Garmin/TrainerRoad).
- **Server-minted (Law 4), client renders one line.** Threaded through both the cached display contract AND the client live-fallback path (`useStateTrends` now reads the goal too — Law 1, one code path). Coach `COACH_PAYLOAD_VERSION 96→97`. 24 posture fixtures + the real-goal-row end-to-end case.
- **STILL OWED:** Tier 2 (the "consequence" prose — "we haven't had a clean read on your running in N weeks"), blocked on `PRODUCT-POSITIONING-v2-DRAFT.md` + a `SCIENCE-run-specificity.md`. See `SPEC-posture-flag.md` and the State v3 redesign in `SPEC-state-fitness-band.md` (the "lever" is this work's payoff).

## D-293 — SWIM is DESCRIBED, not GRADED: volume facts, no fitness dot, an equipment caveat where pace is contaminated (2026-07-17, DEPLOYED + VERIFIED on device)

**Swim pace is not an honest fitness signal for this athlete, so State does not grade it.** Fins/paddles/pull-buoy move pace independent of fitness, and consumer apps (Garmin/Strava, verified) grade none of it — they show volume (distance, longest, moving vs total). Efforts matches that: the swim State row shows FACTS (a `facts_only` fitness mode — no dot, no arrow, no verdict), never "improving/holding".

- **Session screen keeps an equipment caveat** (`_shared/session-detail/build.ts` → `swimPaceEquipmentNote` via `detectSwimEquipment`): a fins/equipment swim reads "with fins — reads faster than unaided", so a fast time isn't mistaken for a fitness jump.
- **Root-fixed the equipment-capture gap.** Unplanned Strava/FORM swims never captured gear, so the caveat couldn't fire. `PostWorkoutFeedback.tsx` now asks "Used any equipment?" (chip row → writes `swim_equipment_unplanned`); default is a normal swim, the athlete checks only if they used something that moved pace. The "Normal swim" checkbox is gated to PLANNED swims (they already carry declared gear).
- Swim still gets a provisional ANCHOR later (fastest confirmed-hard effort, `baseline-derive.ts` `deriveSwim`), but it stays in calibration until a first RPE≥7 swim (Q-188) — the anchor is for the athlete's own trend, never a textbook grade.

## D-294 — AUTO-DERIVED, ROLLING FITNESS ANCHORS: the dot comes from the athlete's OWN best-reached-twice, tracks CURRENT capacity, and withholds a direction it can't back (2026-07-17, DEPLOYED + VERIFIED on device)

**Reverses the manual-only baseline rule (same-day reversal of an intra-session 24wk design).** The State fitness band was going to render a bare arrow with no reference line until the athlete manually set a baseline. Instead the coach DERIVES a provisional anchor from the athlete's own history (Garmin-style), confirmable/changeable with one tap, honestly labeled `auto · source · date`. Three fitness modes: **ANCHORED** (dot), **TREND-ONLY** (arrow + "no baseline set"), **FACTS-ONLY** (swim, D-293). Textbook norms are NEVER the reference line.

- **New table `fitness_baselines`** (`20260716120000_create_fitness_baselines.sql`): UNIQUE partial index `(user_id, discipline, metric) WHERE superseded_at IS NULL`; `status provisional|confirmed`; `superseded_at`/`superseded_by` lineage. Derivation + reconcile: `_shared/state-trend/baseline-derive.ts`.
- **⛔ CROWN-FROM-N (rule b): the crown is the level reached AT LEAST TWICE** — the 2nd-best qualifying value, not the single best. A benchmark you hit once is an EVENT, not a level; a lone kind day is structurally uncrownable. `<2` qualifying efforts → no crown (calibration). Applies to run (lowest decoupling) and swim (fastest hard) identically.
- **Derivation reuses each analyzer's OWN qualifier — never a looser copy.** Run uses `isQualifyingDecouplingRow` (the exact steady/≥20min/terrain rule the durability trend uses, extracted to one source in `run.ts`). Bike anchors on the learned FTP estimate itself. Nothing is loosened to manufacture a dot.
- **⛔ VOLUME GATE → `withheld` (a 4th `TrendVerdict` state).** Below `runDirectionMinRuns = 8` qualifying steady runs in the window, `classifyTrend({directionFloor})` returns `withheld` — the row speaks in counts ("N runs in 6wk — too few to read direction"), NO arrow. `withheld` is NOT `holding`: holding is "measured flat"; withheld is "not measured". `rollupFitness`/`rollupHrResponse` treat it as non-directional.
- **⟳ ROLLING ANCHOR (the reversal).** An intra-session design used a 24wk `baselineWindowDays` "established level" horizon; it was REVERSED same-day. The anchor now shares the BAND's ~12wk `cadenceDays` window and tracks CURRENT capacity — descending as strong old runs age out. Rationale: a months-old anchor is a scold about a fitness the athlete no longer has. `baselineWindowDays: 168` stays in config marked SUPERSEDED (no longer read).
- **DESCENT ACCENT — a descent that arrives with an explanation, not a scold.** When the anchor eases because its source aged out (`compute-snapshot` detects new-crown-worse AND old-source-aged-out → `state_trends_v1.run_anchor_descent = {agedOutMonth}`, JSONB, no schema change), the coach composer emits an `anchor_descent` candidate (tier 3.5, `week-accent.ts`) with a GATED credit clause — the "aerobic carriers covered the load, durability is the part they don't cover" line renders ONLY when cross-signals support it (`aerobicCarriers.length>0 && hrResp.verdict!=='sliding'`), else the bare template.
- **⛔ IDEMPOTENT RECONCILE (`reconcileBaseline`).** A provisional row is superseded ONLY when the pick genuinely changes (source event or value) — never every pass, or the audit lineage fills with no-op supersedes. A CONFIRMED baseline is NEVER auto-touched. Noop branch still refreshes the provisional label/date in place.
- **Band-floor one-per-axis (Fix A).** The band's coordinate frame is floored with the SAME `CROWN_MIN_DECOUPLING = 0` constant (imported, one definition) so a sub-zero confounded run can't define the "stronger" edge and pin the tick mid-band. The trend series is untouched (keeps the fuller data for slope). Negative decoupling (`< 0`) is uncrownable — a confounded/under-warmed start, not superhuman durability.
- Coach `COACH_PAYLOAD_VERSION 108→114` across the arc. Client: `useStateTrends` fetches active `fitness_baselines` → `fitnessMode` + `fitnessAnchors`; `StatePerformanceSection.tsx` renders the dot (`tickPct`/`overflow`), the `withheld` row, the `NoBaselineTag`, and the `auto · source · date` label.

## D-295 — `route_progress_metrics` is ONE ROW PER WORKOUT, and the coach reads the CURRENT-week snapshot it wrote (2026-07-17, DEPLOYED + VERIFIED — closes the FILED coach-reads-MAX bug from the 2026-07-14 banner)

**Two root-fixes found while shipping D-294, both "fix the cause, not the read."**

- **Schema root fix:** `route_progress_metrics` had `UNIQUE(route_cluster_id, workout_id)`, so re-clustering a run inserted a SECOND metrics row for the same workout. That doubled a run in the decoupling series → a phantom "reached twice" crown (crown-from-N counted one run as two) and inflated the run count against the volume gate. Now `UNIQUE(workout_id)` (`compute-facts` upsert onConflict changed; dedup applied via SQL editor, recorded in `20260717120000_fitness_baselines_and_route_metrics.sql`). ⚠️ Orphan NULL-`workout_id` rows survive (UNIQUE permits multiple NULLs) — harmless to reads (no workout join), Q-185.
- **Read=write fix:** the coach read the athlete_snapshot with `MAX(week_start)`, but a stray non-Monday row (e.g. `2026-07-14`) shadowed the real current-week row and its anchors. Now the snapshot read is bounded `.lte('week_start', mondayOfToday())` (`coach/index.ts`). Michael's ruling: fix the responsible side — the read was picking the wrong row.

---

## D-296 — ONE LTHR: the run threshold-HR anchor is single-source (2026-07-17, SHIPPED + DEPLOYED)

**Folds in and DELETES `docs/SPEC-lthr-one-anchor.md` (the scaffolding came down — SPEC-lifecycle rule). Closes the top item of `docs/AUDIT-hr-congruence-2026-07-17.md`.**

- **The fracture.** The audit found the raw logged HR is one authority everywhere (never fabricated), but the LTHR that INTERPRETS it resolved **four different ways**, two inverted: zone bins read configured/typed-first, the easy band read learned-first. Type an LTHR in Baselines → two thresholds, one athlete. Same disease `resolveCurrentFtp` and `resolveCurrentRunEasyPace` already cured.
- **The fix.** `src/lib/resolve-current-lthr.ts` — one pure resolver (client + edge). Precedence: athlete's explicit `lthr_source` choice (Q-174 mechanism, reused) → learned (medium/high, sample_count>0) → manual/typed → learned-low → device → **null (never 220-age, Law 2)**. The **D-284 sample_count:0 gate** lifted in and made universal — explicit 0 rejected (a formula, not a measurement), **absent accepted** ("not stated", the in-pass synthetic band; this distinction was caught by the easy-hr golden mid-build).
- **Routed all four consumers:** `easy-hr.ts` (easy band), `compute-workout-analysis` (zone bins — RUN only; bike keeps its own `ride_threshold_hr`), `coach` (HR bins), `calculate-workload` (run intensity — unconditional, so it also nulls a zero-sample learned the old ungated read accepted).
- **Zone-seam leaks closed in the same pass:** `save-imported-workout` now writes Friel boundaries from the canonical `friel-zones.ts` (`zone3FloorBpm`) not a local 0.90 seam — it writes the Priority-1 `configured_hr_zones` that overrode everything, re-seeding the D-286 bug on the FIT-import path. And `analyze-running-workout`'s Priority-2 fallback (`hrZonesFromBaseline` + `aerobicCeilingBpm`) now uses the canonical model instead of a local non-Friel table (0.75/0.85/0.92/0.98 + a 0.85 ceiling) — it was a SECOND run-zone distribution surfacing next to the facts bins.
- **Law 6.** The anchor routing is **byte-identical for the primary user** (all four chains already resolved to 151, still do). 13 resolver fixtures (precedence, the sample_count refusal, the Law-1 "all callers → one bpm" pin, the real baseline); src/lib (210) + _shared (1170) green. ⚠️ **The `analyze-running-workout` fallback is NOT byte-identical for the primary user** (he has no configured zones → his run-debrief zones move from the non-Friel table to canonical Friel, which is a CORRECTION that makes his debrief agree with his facts bins) — a deterministic history recompute is owed for old debriefs.
- **Still open (separate annexations, one at a time):** `threshold_pace` (no resolver, ~15 files, 3 units); delete the dead `_shared/endurance/hr-zones.ts` 0.90 copy (deferred — a run generator `sustainable.ts` still references its symbols, needs a live/dead check first); the `lthr_source` toggle UI (the Q-174 chooser; the resolver already honours it).

> Supersedes the four ad-hoc LTHR chains named in `SPEC-lthr-one-anchor.md §1`. Max-HR unification (literal 180 / 220-age / Tanaka / obsMax÷0.95) folds into the next pass.

---

## D-297 — The UPKEEP read: a maintain discipline measured against its OWN target, compliance-only (2026-07-18, SHIPPED + DEPLOYED)

**New: `docs/SCIENCE-upkeep-maintenance.md`** (the receipted, discipline-agnostic science POV — seeds the future glass-box science section). Reaffirms `STATE-WEEK-EXECUTION.md` §7.

- **The bug (found by Michael reading his own State).** The week accent read a MAINTAIN discipline by SESSION COUNT ("Running came in at 1 of 3") and warned "run-specific speed fades" — for a **strength-primary** athlete whose run posture is **maintain** with a stored **`target_weekly_miles: 18`**. Three errors: wrong unit (sessions, not the miles he set), wrong lens (run-speed warning to a strength athlete), and it credited swim/bike (declared **out**) as a planned trade. Verified against data: he'd run ~4 mi/wk for 6 weeks against 18 — genuinely under his own target, but the app measured and framed it wrong. (Aerobic base is HOLDING — decoupling flat 7–8% — because cross-training holds the central engine; only run-specific volume is under.)
- **The fix — `upkeepCandidate` (`_shared/state-trend/week-accent.ts`, tier 3.8).** Measures a maintain discipline against its **own stored target, in its own unit** (run = `target_weekly_miles`, miles), on the **trailing 4-week pattern** — never this week's session count. Fires only after a **pattern** (≥2 weeks under, ≥15% below). Discipline-agnostic: extends to any discipline that gains a stored target. Coach wires it (`coach/index.ts`) by looping over `per_discipline_posture` == 'maintain'. Nothing tuned to running or to any athlete — target and volume are read.
- **⛔ COMPLIANCE-ONLY, no weekly adaptation consequence (the §7 call).** Grounded in commercial-app practice (Michael): TrainingPeaks/Garmin/Intervals show weekly **compliance** + a **measured** status; **none** push a weekly prose prediction that fitness "may fade" — that's coach behaviour, and it risks re-introducing the nag we just removed. So the accent states the **fact** only ("at ~4 of your 18-mile upkeep — 4 weeks now; swimming and cycling carried the endurance load"). The **measured "has"** is owned by the **Fitness card**; the **specificity science** ("what erodes and why") lives in the **glass-box section**, on tap — never a weekly line. One claim, one home. Considered and rejected: the "may/has" conditional-consequence-in-accent (built, then pulled when it failed the apps-practice test).
- **Voice + continuity.** Passes the hard voice check (no imperatives). One source (coach accent, reads stored posture/target — no re-derive). Cannot contradict the Fitness card (compliance vs measured trend — different axes). `COACH_PAYLOAD_VERSION` 114 → 115.
- **Verified:** 19 accent fixtures (compliance fact, the ≥2-week + ≥15% gates, no-target → silence, voice) + full `_shared` suite (1176). ⚠️ Science-doc figures are search-level — confirm magnitudes against the primary papers before any go user-facing.

---

## D-298 — Fan-out ordering: one canonical post-process orchestrator + a snapshot version guard (2026-07-17, SHIPPED + DEPLOYED; a–d UNVERIFIED)

**Full design + verification: `docs/AUDIT-fanout-ordering-2026-07-17.md`** (the walkthrough, the FIX BLOCK, and the a–f verification plan). This entry is the pointer + the rulings.

- **The bug (two races, one disease).** The ingest fan-out awaited the wrong things: `compute-facts` (awaited) read `workouts.computed` written by two fire-and-forget calls → when it won the race, `execution_score` / `time_in_zone` / `hr_drift` / `intervals_hit` silently vanished. And `compute-snapshot` (fired from `compute-facts`) read `workout_analysis` written by `analyze-{sport}` AFTER it → the weekly snapshot was **one workout behind by construction**. Two paths (`ingest-phone-workout`, `save-imported-workout`) never reached the spine at all. Trace also found F3 (compute-facts fires snapshot unconditionally, so any orchestrator fights its own trigger), F4 (the merge-existing path skipped analysis), F5 (adaptation also races `computed`).
- **The fix — "await what you read," one orchestrator.** `recompute-workout` became THE canonical post-process orchestrator (already the proven serial shape): auto-attach → [summary] → analysis → workload ∥ adaptation → facts(`skip_snapshot`) → analyze → snapshot(`source_watermark`) → cache. Every entry path fire-and-forgets it, so the webhook ack stays fast — correctness comes from ordering *inside* the chain, not the webhook awaiting it. F5 fixed for free by serialization; F4 swallowed by routing the merge path through it.
- **Rulings (Michael):** (1) **orchestrator, not inline** — never serialize the `analyze` LLM call into the webhook-blocking path. (2) **Failure semantics** — a failed step halts only what reads its write; bounded retry ×1; status columns are the truth + one minimal client "pending" state (the client numeric-gate was DEFERRED — `metrics_status` threading + a historical-null trap; server signal shipped). (3) **Orphans forward-only**, and they do NOT drive `adapt-plan` (parked, named trigger). (4/F3) **version guard is non-negotiable** (protects the class), skip flag is the optimization.
- **The guard (F3).** `athlete_snapshot.input_watermark` + a `BEFORE UPDATE` trigger `trg_guard_snapshot_watermark` (migration `20260717…`, applied via SQL editor) that refuses to overwrite a row assembled from newer inputs. "Fresher" defined ONCE (`deriveSnapshotWatermark`, `compute-snapshot/watermark.ts`); the comparison lives ONLY in the trigger. The service-role door on `recompute-workout` verifies the caller IS the service role (constant-time), never "JWT skipped" (`decideAuthDoor`, fixtured).
- **Verified:** 20 pure fixtures (watermark definition, guard refusal, auth-door-is-only-a-door, bounded retry). The guard's **stale-refusal was verified LIVE** on a synthetic snapshot row (non-destructive). ⚠️ **a–d UNVERIFIED** (facts-present on a real sync, snapshot-current-to-that-workout, orphans reaching the spine, idempotency) — need one real Garmin/Strava sync. See the audit §4.

---

## D-299 — One max-HR resolver: unify the %HRmax fallbacks (2026-07-18, SHIPPED + DEPLOYED + fixture-verified)

Closes `AUDIT-hr-congruence-2026-07-17.md` #5. Max HR is a **last-resort yardstick** — only fires when there is no LTHR (the Friel path owns zones otherwise), so it matters for data-less/new athletes and internal congruence, not for a data-rich account.

- **The scatter (all disagreed).** `compute-workout-analysis` (configured → learned → FIT → observed/0.95 → literal 180), `analyze-running/.../zones.ts` (observed/**0.90** → 180 — a different divisor), `compute-adaptation-metrics` (220−age, age→35), `generate-run-plan` (220−age), client `TrainingBaselines` (220−age) vs `HRZoneChart` (Tanaka) — so two run paths made two maxes from one peak, and Baselines disagreed with its own zone chart.
- **The fix — `src/lib/resolve-current-max-hr.ts`.** Precedence: manual/configured → learned observed peak (sample_count:0 gate, mirrors LTHR) → device FIT → this-session peak ÷ **one** `PEAK_TO_MAX` (0.95) → **one** age formula → null. `ageEstimateMaxHr` = **Tanaka** (208−0.7·age), **Gulati** (206−0.88·age) for female — matches `HRZoneChart` "auto"; **220−age (Fox) retired** everywhere it was a value. Age tier is `is_estimate:true` and opt-in (`allowAgeEstimate`), so a surface that must not invent falls to null (Law 2).
- **Left separate on purpose:** `resolveMaxHrCeiling` (`hr-plausibility.ts`) is a corruption ceiling, not a value; cycling's per-interval zones are display. Neither is the fracture.
- **Routed:** `compute-workout-analysis`, `analyze-running/.../zones.ts` (divisor), `compute-adaptation-metrics` (formula), `generate-run-plan`, client `TrainingBaselines` (now = the chart).
- **Verified:** 11 fixtures (precedence, the ONE divisor congruence pin, Tanaka/Gulati, Law-2 null). Byte-identical for a data-rich account (fallbacks don't fire). Deployed: the 4 edge fns + client.

---

## D-300 — Threshold pace single-source: the sibling resolver (2026-07-18, SHIPPED + DEPLOYED + fixture-verified)

Closes `AUDIT-hr-congruence-2026-07-17.md` #6. The LTHR disease in the **pace** layer: threshold pace read raw across the app in 3 units, and the two authorities that matter read **disjoint fields** — `coach:4445` read `effort_paces` (wizard) only; `race-projections:370` read learned only. So a wizard-typed pace drove the coach while race-projections predicted off the learned one.

- **The fix — `resolveCurrentRunThresholdPace` (in `src/lib/resolve-current-run-pace.ts`, beside the easy twin).** Precedence mirrors easy pace: Q-174 choice → learned (measured) → typed → `effort_paces.threshold`/`.z4` (wizard, `is_estimate`) → learned-low → null. Swallows all 3 unit spellings (learned sec/km, perf sec/mi *or* sec/km, a "7:30" min/mi string, wizard sec/mi) → normalizes to sec/MILE, and carries **both** `sec_per_mi` and `sec_per_km` (race-projections needs km; the km-native learned tier keeps its exact value, no lossy round-trip). A bare `min_per_mi` number is ignored (ambiguous), not mis-read as seconds.
- **The inversion fixed:** the coach read the wizard pace FIRST; now measured wins, printed `m:ss` (was a raw number labeled min/mi). `COACH_PAYLOAD_VERSION` 115 → 116.
- **Routed (slices):** coach + race-projections (the disjoint authorities); the **snapshot spine** (`athlete-snapshot.ts` — both `extractRun` pin + `resolveLiveRun` live paths, mirroring the D-287 easy-pace fix line-for-line, so plans/state inherit one source); `infer-training-fitness` (bespoke helper → the shared resolver).
- **Deliberately LEFT (traced, not fractures):** `arc-context.buildRunPaceForCoach` (learned-provenance view, Law 3 / D-285); `create-goal` gates (presence checks); `generate-run-plan:193` VDOT (routing a wizard pace = circular; `effortScore` already the fallback); `race-readiness` (picks a race *target* — `effort_paces.steady`, different semantics); `course-detail`/`course-strategy` (already learned-first display w/ fiveK fallback). The "~30 readers" were mostly writers, types, presence-checks, or already-learned-first — the fracture is closed by fixing the spine + the two authorities.
- **Verified:** 12 fixtures (units, precedence, the "coach-shape ≡ race-projections-shape" congruence pin) + full `_shared` suite (1188). Byte-identical for a learned-pace account except the coach's baseline line (now measured + formatted). Deployed across all touched fns.

---

## D-301 — One ACWR band: kill the last live raw-ratio prescription + delete the dead band copies (2026-07-18, SHIPPED + pushed, client-only)

Closes GAME-PLAN Phase 4 "One ACWR band." **Grounded in field practice (Michael):** Garmin / TrainingPeaks / COROS lead with a reconciled STATUS and demote the ratio to a bare reference number; none let an acute:chronic ratio alone command "rest." (ACWR is contested science — Bayesian re-analyses find it barely beats a random denominator — so the move is to make it consistent + descriptive, never louder.)

- **The trace corrected the premise.** GAME-PLAN said "the band is re-derived 6×." In fact: the **LoadBar** already single-sources to the reconciled verdict (ACWR shown as a bare number, no zone word — D-260/D-266); **one** live surface re-derived a plan-blind band; the other **four** were dead code. So this was 1 live fix + a dead-code sweep, not a 6-way rebuild.
- **The live fix — `CoachWeekTab.SnapshotLoadBar`.** It was handed the reconciled `status` but ignored it, re-deriving `build more`/`balanced`/**`back off`/`rest now`** off the raw ratio with fixed 0.8/1.3/1.5 cutoffs — the exact composition-blind client PRESCRIPTION D-281 reverted and Q-137 tagged "do NOT patch the gauge." Now maps `status` via `statusVolumeLabel` like the main LoadBar: reconciled `elevated` → "a bit high" (never a scold), only a corroborated `high` → "pull back". Phase-awareness + body-corroboration come free (they live in the reconciler). ACWR stays a bare reference number.
- **Dead code deleted (the phantom "6 places"):** `TrainingStateBar` (`ui/charts.tsx`), `getACWRStatus` + `ACWR_STATUS_CONFIG` + `ACWRStatus` (`context-utils.ts`), `acwrZone` + `acwrVolumeLabel` (`load-headline.ts`) + the `acwrZone` fixture. All had zero live importers (grep-verified); `acwrVolumeLabel`'s own comment falsely claimed the LoadBar imported it (it imports `statusVolumeLabel`).
- **Law check:** no `raise()`, no new escalation — the ratio still only DESCRIBES (D-281's rule holds). This is a congruence + prescription-removal change; outputs move ONLY where they were wrong (elevated/taper weeks stop scolding). Client build green; `load-headline` fixtures green (11).
- **Verified:** client build compiles; fixtures green. Byte-identical for a week where reconciled verdict == old raw-ratio band (most weeks); the visible change is elevated/phase weeks now read the reconciled word. Client-only → Netlify auto-deploy.

---

## D-302 — State screen reframed for the GENERALIST: posture-aware fitness reads (2026-07-19, SHIPPED-PENDING-AUDIT, client-only)

> ⚠️ **SUPERSEDED IN PART by D-303 (2026-07-19 EOD), after the audit this entry asked for.** The posture-aware STRENGTH develop word-map below (`getting stronger / on plan / gains flat / easing off`, the `planWeek≥4` plateau gate) was REPLACED by the per-lift estimated-1RM read — the field (Strong/Hevy) shows per-lift numbers, not a rolled-up mood verdict, and the `planWeek` gate counted whole-plan weeks not strength-block weeks. The noise-in-the-e1RM concern (caveat 2 below) and the missing RIR/deload layer (caveat 4) were both FIXED in D-303. STILL STANDING from this entry: the dimmed-dropped-discipline sort, `useStateTrends` always-fetching posture/activity, and the run/bike/swim posture logic (only the STRENGTH read changed).

Grounds in the new north star (`PRODUCT-POSITIONING.md`, 2026-07-18: the generalist athlete, "fitness is an emergent process," the four questions). **This is the first real implementation of the posture-aware verdict the `SPEC-posture-flag` / POLISH §5 item calls for** ("make the verdict engine posture-aware at runtime, not a banner over a posture-blind verdict") — partial: the STRENGTH develop-read is done; the rest of that spec (all disciplines, the RIR layer, the plan-join lever) remains owed.

- **The reframe (client display only — no engine/verdict change).** `StatePerformanceSection.tsx` + `StateTab.tsx` + `useStateTrends.ts`.
  - **No "Building/Holding" labels** — Michael's call: the athlete knows their focus, and "HOLDING" collided with the "→ holding" verdict word. Kept the existing focus-first sort; the only structural change is that a **DROPPED discipline** (not in plan AND no session in ~4wk, the detraining-onset window) **dims to the bottom, never graded/penalised.** An active-but-`out` discipline (you're still doing it) shows normally — **behaviour beats the stale label.**
  - **Posture-aware STRENGTH read** (`StrengthFitnessRow`, `develop` posture): e1RM rising → "getting stronger"; flat but early → "on plan"; flat past **~4 PLAN-WEEKS** (not session count — a block needs time before you judge it; no app calls a plateau at week 2) → "gains flat" (gentle plateau, never alarm); sliding → "easing off". Kills the intent-blind "holding".
  - **`useStateTrends` now ALWAYS fetches** declared posture (`per_discipline_posture`) + last-4wk activity — config, fetched even when the server contract drives cards, because the contract's `card.posture` lagged a stale snapshot (root cause of the 3 failed attempts before we found it).
- **Grounded in (transcript has sources):** RTS/RIR autoregulation (Tuchscherer), plateau = 3–4wk / 3-session flat, strength gains lag early, detraining VO2max onset 2–4wk (Garmin's own "Detraining" gate). Fade-awareness follows INTENT: flag a `maintain` discipline that slips (the D-297 slip gate); stay quiet on a deliberately-dropped `out` one (beats Garmin, which nags regardless).
- **⚠️ SHIPPED-PENDING-AUDIT — do NOT treat as verified.** Reads right on device + grounded, but: (1) NO fixtures; (2) sits on top of the engine's e1RM/decoupling verdicts, so it inherits any noise there (e1RM off working sets IS noisy); (3) thresholds (planWeek≥4, 28d active) are judgment calls; (4) the **RIR/deload fatigue layer is NOT built** — so "on plan" can hide grinding. Audit is the explicit next job (see ENGINE-STATE banner).

---

## D-303 — Strength read rebuilt to commercial-app standard: per-lift e1RM + noise guard + grinding moved onto the read (2026-07-19 EOD, PUSHED + DEPLOYED + VERIFIED-ON-DEVICE)

Supersedes D-302's STRENGTH develop word-map. Michael asked the read to "mimic what a commercial strength app would say," grounded in **both** app practice and training science (verified this session, not asserted). Three shipped pieces, one arc.

**1. e1RM noise guard** (`_shared/state-trend/strength.ts` `computeStrengthState`). The e1RM trend now passes `noiseGuardStdev: 1.0` to `classifyTrend` — the SAME gate run decoupling already uses. A directional verdict must clear ~1 within-window SD of the lift's own scatter, else it reads holding. **Why:** e1RM off working sets scatters ~4–8% session-to-session (RIR-estimate wobble, best-set selection, thin per-lift n). Measured LIVE on Michael's data: Back Squat read `sliding −2.5%` on σ=4.1% scatter — noise wearing a verdict — and it dragged the overall to a false "holding" that flipped on any single-session perturbation (3 of 4 pokes flipped). Post-guard: squat → holding, overall → improving, 0 flips. 3 regression pins in `strength-fitness.test.ts`; 145/145 state-trend green. Strength volume trend deliberately NOT guarded (wider ±8% bands already).

**2. Grinding moved onto the strength read** (`StatePerformanceSection.tsx`, `StateTab.tsx`, `nudge-policy.ts`, `coach/index.ts`). `strength_rir_below_prescription` (already computed in `longitudinal-signals.ts`) now renders as the FATIGUE line on the strength read — the RTS/RP autoregulation axis, distinct from the e1RM number (grinding shows in RIR before it shows in e1RM). **Moved, not duplicated:** pulled from the nudge allow-list (`STATE_NUDGE_ALLOWED`) AND stripped from the coach LLM prompt (kept in the client payload). Client renders the coach-computed signal — no recompute, single home, minimal LLM. Wording is a tune-to-voice placeholder.

**3. Per-lift estimated-1RM read** (`StrengthFitnessRow`, + spine `bestE1rm`). Replaces the rolled-up "getting stronger" verdict + the typed-baseline dot with the Strong/Hevy shape: each **main lift** (primaries) shows its `~`-marked estimated 1RM, its noise-guarded 6-week change, a **PR** flag, and per-lift receipts (sessions · as of). **Referenced to the athlete's OWN best (`bestE1rm`, new field on `StrengthPerLift` = window max), NOT a typed baseline** — the field doesn't use a separately-typed baseline, and Efforts' baseline pegged the dot dumb once you passed it. Dropped: the develop word-map, the `planWeek` plateau gate, the baseline dot/band. The `~` marks it an ESTIMATE (e.g. Michael's bench = 120×5 @ 2.5 RIR → Brzycki ~150 lb, never a tested max); `provisional` clears as sessions stack.

**Field + science grounding (verified, sources):**
- Apps: Strong/Hevy compute estimated 1RM per lift (Epley/Brzycki, not proprietary), graph it per-exercise over time, flag best sets — no rolled-up mood verdict, no typed baseline. [Hevy 1RM docs; PRPath Strong-vs-Hevy 2026].
- Science: 1RM-from-submax is a validated proxy BUT only trustworthy near failure / low reps; RIR is the accepted scale (Zourdos 2016) but noisy (novices under-predict 4–5 reps). Efforts already handles both caveats — RIR-adjusted Brzycki + D-118 near-failure preference (the "trust near-failure" caveat) + the D-303 noise guard (the "one session isn't diagnostic" caveat). [Zourdos NSCA 2016; PMC RPE-vs-%1RM; PMC velocity-1RM].

**Instrument-follows-goal (designed, only get_stronger wired — the owed follow-up).** e1RM leads for a `get_stronger` goal (correct — max strength IS 1RM). A `build_muscle` goal should lead with VOLUME (hypertrophy peaks on volume; e1RM is fatigue-suppressed mid-block) — the science's own strength-vs-hypertrophy distinction. Goal exists (`non-race-goal-seeds.ts`); the read doesn't switch on it yet. See ENGINE-STATE banner JOB #1.

**Also this session (not a D-entry):** fan-out D-298 a/c/d VERIFIED end-to-end via a throwaway-user harness (`scripts/fanout-audit.mjs`) — real infra, ×3 idempotent, all pass. And `scripts/strength-e1rm-check.ts` (read-only e1RM derivation/twitchiness diagnostic).

---

## D-304 — Lose the LLM from output narration: deterministic run + bike insight composers (2026-07-19 LATE, PUSHED + DEPLOYED + VERIFIED-ON-DEVICE)

**The product decision (Michael, after a year building the deterministic spine):** the LLM leaves all OUTPUT narration. The insight was always the engine's VERDICT — the LLM only phrased it, added zero information, and introduced drift ("pace held steady" on a run whose pace ran 13:07→15:50; a self-rewriting narrative every recompute). Grounded in both app practice and research: users reject AI-narrative fluff ("highlights things they already know" — Strava Athlete Intelligence reception; DIS-2026 "Who Gets to Interpret the Workout"), and want substance/transparency. **Positioning: "the app that doesn't make anything up" — every insight a computed fact with its receipt.**

**The principle (the line, not a whim):** interpret in proportion to how trustworthy the input is.
- **Strength** — you TYPE the weight/reps. Self-explanatory; the lift table is the story. No composer.
- **Run / bike** — reliable sensors. Trustworthy → deterministic composers.
- **Swim** — unreliable sensors (equipment, lap detection). Show the numbers, interpret NOTHING (Michael: "if you really care, you have your own system").
- **Input parsing** (onboarding goal-parse, race extraction) — the ONE legitimate LLM use: unstructured→structured, which templates can't do, and the user confirms the parse. KEPT. Never structured→prose again.

**Run composer** (`_shared/insights/run-insights.ts`): three families — steady/easy/long (aerobic story: pacing-as-effort, decoupling, terrain), interval/tempo/hills/track/vo2/threshold (work story: reps hit, consistency), fartlek/surge (mixed BY DESIGN — never graded for steadiness, the trap). Verdict-per-clause, banned-word check, silent when thin. `pacingVerdict()` extracted as the SINGLE SOURCE the PACING row (build.ts) and the paragraph both call — they can't diverge. Maps from `fact_packet_v1`. LLM `generateAISummaryV1` call removed from `analyze-running-workout`.

**Bike composer** (`_shared/insights/bike-insights.ts`): same three families + the fork running lacks — POWER vs HR. With a meter: NP/IF/TSS/VI, held-target intervals, "the watts didn't cost you HR." HR-only: zone read, decoupling, never a fabricated watt. Maps from `CyclingFactPacketV1` + analyzer extras (TSS, HR-drift, interval breakdown). LLM `generateCyclingAISummaryV1` removed from `analyze-cycling-workout`. Fixed a doubling caught on device: the paragraph printed raw HR drift while the EFFICIENCY row shows Friel aerobic decoupling — the paragraph now prints NO drift number, the row owns it.

**The guards built earlier today (D-303's HR-gate, the pace-steady/verdict guard, execution-honesty) are now DEAD** — they existed to police the LLM output that no longer exists. Their LOGIC lives in the composers (terrain-vs-fatigue, the fartlek trap); the CODE dies in the cleanup sweep.

**Verified on device:** run reads "even effort across rolling terrain… HR held, the pace swing was terrain not fatigue"; bike reads "steady aerobic ride at 112 W… heart rate stayed in step with the power." Both STABLE across recomputes — the whole point (deterministic = same inputs, same words, forever). Composer tests: run 7/7, bike 6/6; `pacingVerdict` shared with build.ts.

**Next:** the CLEANUP SWEEP (delete the dead LLM per-workout layer — see the ENGINE-STATE banner for the keep/delete/caveat list; `narrative-core` stays, it's shared with the still-live coach narrative), then JOB #2 the COACH NARRATIVE (the last output-LLM, on State).

---

## D-305 — The app must not contradict itself: run-row level-vs-trend fix + "a fade is an HR claim" (2026-07-19, PUSHED + DEPLOYED + VERIFIED)

Two related fixes this session under one principle — a surface may not say two things that disagree, and a claim must be judged by the metric that actually owns it. Logged because they live otherwise only in commits `a8a4153b` and `3e1d7060` (a decision in a commit message doesn't exist).

**Run-row level-vs-trend contradiction (State, `StatePerformanceSection.tsx`, LIVE).** The run durability row showed "too few to read direction" (the trend arrow withheld, `runDirectionMinRuns=8`, only 6 qualifying steady runs) next to a CONFIDENT dot near "stronger" — reading as the app not being able to read you while planting a confident verdict. Fix: the dot is the LEVEL (readable from ONE steady run — decoupling is a single-run measurement), the arrow is the TREND (needs 8 steady runs). Reworded the withheld line to a trend receipt — "N of 8 steady runs for a trend" (`RUN_TREND_MIN_RUNS`) — and expanded the durability ⓘ to teach both reads. The level dot stays (verified real on Michael's data: today's 80-min run, decoupling 4.4% = genuinely strong). Only the arrow waits on volume. Open, NOT tuned to Michael: whether 8 is too high now that decoupling ALSO has the noise guard — a universal call, deferred.

**"A fade is an HR claim, not a pace claim" (Performance + State parity, `session-detail/build.ts` + `run-insights.ts`, LIVE).** A grade-adjusted half-vs-half FALSELY reads a "positive split" on an out-and-back — GAP credits the uphill leg and penalizes the downhill return, a terrain artifact, not a fade. Verified on Michael's run: raw split −37s/mi (2nd half FASTER), GAP +93 (the artifact), HR flat (decoupling 4.4%). So a slowdown is only NAMED a fade when HR agrees it drifted up. `pacingVerdict()` (in `run-insights.ts`) is the SINGLE SOURCE the PACING row and the deterministic paragraph both call — effort=HR, decoupling ≤5% (Friel) = even effort. This is what makes Performance and State tell ONE story off ONE number, and it is LIVE (the run composer embeds it; not dead with the LLM guards). The LLM-era guards that policed this (the honesty seatbelt, the pace-steady validator) ARE dead — see D-304 — but the PRINCIPLE and the `pacingVerdict` mechanism stay.

---

## D-306 — The coach week narrative goes deterministic: a PROTOCOL-AWARE, FOCUS-AWARE week composer (2026-07-19 LATE, BUILT + FIXTURE-VERIFIED · NOT WIRED · NOT DEPLOYED)

Finishes what D-304 started. D-304 replaced the per-workout LLM narration (run + bike); this is the **last output-LLM**, the multi-week coach paragraph on State (`StateTab.tsx:1423`). New files: **`_shared/insights/coach-week-insights.ts`** (the composer) + **`_shared/insights/strength-protocol-read.ts`** (the protocol layer), 29 deno tests green. ⛔ **Nothing is wired yet — `coach.narrative` is still the LLM.** See the ENGINE-STATE banner for the wiring job.

### What it says — four questions, one swapped yardstick

Grounded in a 2026-07-19 research pass over commercial practice + the concurrent-training literature (below). The read answers: **where did the week go · does it match what you meant · is anything quietly disappearing · is the lifting still moving.**

**The plan-follower and the no-plan athlete are NOT two composers.** They are the same four questions with the reference swapped — the plan, or the athlete's own trailing baseline. Same idiom as the bike composer's power-vs-HR fork: fork on what data EXISTS, never on what it says. This is the "generalist" positioning expressed as code rather than copy.

### The instrument is per-discipline, and this is the whole point

**Endurance is judged by volume** (acute:chronic vs its own trailing normal) — aerobic adaptation is dose-response to accumulated duration, so a volume ratio is the right tool. **Strength is judged by e1RM** (the spine's noise-guarded `StrengthFitness.e1rm` verdict, D-303) — lifting adapts to load and progressive overload, not time-under-load. Judging strength by a volume ratio imports the endurance model onto the barbell, which is the exact two-lane failure the product exists to fix. *(First draft did precisely that. Caught by Michael.)*

Also: **adherence does not suppress the e1RM verdict.** Doing every prescribed session and STILL sliding is the most informative case there is — the work happened and it is not producing. But a prescribed lighter week (deload), executed, is never a shortfall.

### THE PROTOCOL OWNS ITS OWN READING (`strength-protocol-read.ts`)

A read that looks only at trend lines is a robot: it sees a number move and grades it with no idea what the block was DESIGNED to make that number do. The same observation inverts by protocol:

- **`five_by_five`** — load climbs 70→85% at ~1.25%/wk (`protocols/five-by-five.ts`). So RIR falls BY DESIGN, and the RIR-adjusted e1RM estimate falls with it. **A dipping e1RM here is the ramp, and is never reported.** The real events are the **stall** (reps missed at the prescribed load) and the **85% ceiling** that ends the block → retest (`SCIENCE-5x5-linear-progression.md` §2/§4).
- **`minimum_dose`** — the block's one job is to hold. **Sliding IS the story.** Low volume is never a shortfall; spending less time is the point.
- **`neural_speed`** — 85-90% 1RM, volume deliberately too low for hypertrophy. Volume shortfall never reported; e1RM is the correct instrument.
- **`durability`** — the RIR TARGET itself steps 3→2 across Base, and the adaptation is tendon/tissue, not a 1RM. No e1RM claim is made at all.
- **`upper_aesthetics`** — e1RM is fatigue-suppressed for the block's duration by design; volume is the instrument.
- **`triathlon` / `triathlon_performance` / unrecognised** — **UNGROUNDED, returns null.** Their intent was not traced closely enough to invert or endorse a trend honestly. Silence beats a confident misread. A named gap, not an oversight.

`protocolExpectsE1rmToDip()` defaults **TRUE** for unknown protocols — the safe direction is to say nothing, not to accuse.

### What it REFUSES to say (each is a documented failure in a shipped product)

- **No raw completion tally.** Runna's model: *"When you skip a run, Runna notes it and moves on… a plan that reflects where you are now, not where you were supposed to be."* Fact + consequence, no score.
- **Never "you have no plan"**, and plan-absence is never a deficit state. Lowest-value item in the research ranking; the BJHP 2025 study (58,881 posts, 13,799 negative) ties prescriptive framing to shame, avoidance, and disengagement from the BEHAVIOUR, not just the app.
- **No shortage/excess verdict against an ideal the athlete never agreed to** — the largest single source of resentment in the corpus (Garmin has had to post *"An Unproductive Training Status does not mean we hate you"*).
- **No monotony risk claim.** The systematic review is explicit: *"the role of monotony and strain in monitoring and injury prevention is not currently supported by the literature."* It is also content-blind — 3 runs + 3 lifts at similar RPE×duration score as "monotonous" despite maximal stimulus diversity. Fatal for a hybrid app.
- **No injury risk off a ramp number** (ACWR contested as a predictor). **No claim that interference HAPPENED** (see Q-191).
- **A `maintain` discipline drifting down is not reported at all** — not as a warning and **not as reassurance**. The consoling "that's a trade, not a mistake" register was rejected on purpose (client-orphaned `posture.ts`); the honest move is not to raise it. A `dropped` discipline is invisible.

### What it CAN say, that nothing else does

**Credit.** Strength work does not cost aerobic fitness and improves running economy (ES −0.27 high-load, −0.43 combined) and cycling efficiency (0.35) with VO2max unchanged. When endurance is the declared focus and the lifts are holding, that is a CONTRIBUTION. The app's positioning has always implied this and never said it. Fires only on a POSITIVE e1RM verdict — absence of a sliding verdict is not evidence of holding.

### Thresholds are field-standard, not hand-picked

±20% planned-vs-actual is where **TrainingPeaks, Intervals.icu and Final Surge independently converged** (green 80–120%, amber 50–150%). The 0.8 floor is the conventional ACWR under-training line, used **purely descriptively** ("below your own normal"), never as a risk claim.

### The competitive finding that justifies the whole thing

**No commercial platform connects strength to endurance in a weekly narrative. Not one.** Intervals.icu excludes strength from fitness *by design* (developer, verbatim: *"That change was by design. By default strength workouts now only count towards fatigue and not fitness"*); Coros documents that its TRIMP model "has not been designed to accurately estimate the load for anaerobic or power activities"; Garmin's Training Status is gated on run/bike VO2max; TrainingPeaks shipped a *manually entered* strength TSS field in May 2026 after a 187-vote request; Athletica's founder — a published sports scientist — states on record that strength load quantification is *"apples and oranges"* against TRIMP/TSS, *"with nobody yet to crack it,"* and *"down on our list of dev items."* The weekly-narrative slot itself is unoccupied: two Intervals.icu feature requests for exactly this sit with zero developer replies.

**And the bar for narrative is one question:** *could I have gotten this by pasting a screenshot into a general LLM?* Every rejected implementation fails it, in near-identical words across platforms — *"This isn't particularly wrong, but neither is it useful in any way"* / *"I certainly don't need to be told what I can read from the graphs."*

### Anti-doubling rules learned by RUNNING it (not from the tests)

Three defects the 22 green tests did not catch, found by reading the output: (1) clause 2 and clause 3 both naming the same discipline (the said-twice bug); (2) warning that a discipline dipped and then calling the down week healthy — the app arguing with itself (D-305); (3) "mostly" claimed at 49% share. Fixed: clause 3 is decided FIRST so clause 2 can defer, a whole-week-down suppresses per-discipline dips, "mostly" is earned only above 50%, and the generic all-clear fires **only when no specific finding did**. ⚠️ **Green means the code does what I told it to, not that what I told it was right.** Read the sentences.


> **AMENDED 2026-07-19 NIGHT (same session, after seeing it on a real screen).** Three changes below, all
> from looking at the rendered paragraph rather than at the tests. **30 tests were green through every one
> of these defects.** See the amendment at the end of this entry.

## D-306 AMENDMENT — what changed once it was on a screen (2026-07-19 NIGHT, PUSHED + DEPLOYED + VERIFIED)

**1. THE MIX SENTENCE IS DELETED.** It read *"The week was led by running — 44% of your load, then strength 22%, riding 22%"* — while the LOAD bar **directly above it** rendered `Run 44% · Strength 22% · Ride 22% · Swim 12%` as a labelled bar. It restated the dashboard, and did it worse (it dropped swim). This is the exact failure the D-306 research documented across five platforms, in users' own words: *"I don't need to be told what I can read from the graphs."* A regression test now forbids any `N% of your load` / `led by` construction. ⛔ If a mix sentence ever returns it must say what the bar CANNOT — how the mix moved against this athlete's own normal — which needs a trailing-share figure nothing currently carries.

**2. THE ALL-CLEAR STOPPED OVER-CLAIMING.** *"Every discipline landed inside the range the plan asked for"* only ever examined disciplines with a planned load. It fired on a week where **bike and swim carried real off-plan work** — and the upkeep line three rows below said so out loud (*"Cycling and swimming carried the endurance load"*). Now: `"What the plan asked for landed in range, and riding and swimming went in on top of it."` Names its scope; keeps the off-plan work visible instead of absorbing it into an all-clear.

**3. THE PARAGRAPH AND THE PLAN NOW DESCRIBE THE SAME WEEK — the real defect, caught by Michael.** State renders TWO windows: *"where your load is going"* is the **ROLLING last 7 days**; *"this week · planned vs actual"* is the **CALENDAR week**. The composer read plan-vs-actual off `acute7_by_type` (rolling) — so consecutive sentences described two different spans and both called them "the week". Plan comparison now runs `computeWtdLoadSummary` (`_shared/adherence-plan.ts:60`) **per discipline**, the same shipped helper the rest of the coach reads. ACWR deliberately stays ROLLING: "drifting below its own normal" is a trailing question.

**4. THE HAND-ROLLED SUNDAY GATE IS RETIRED.** v118 shipped a day-of-week guard so the plan clause only fired on complete weeks. `planned_wtd_load` already bounds the plan to sessions due **on or before today** — the partial-week problem was solved in this codebase months ago (payload `v100`/`v102`, the Q-177 trap). The clause now speaks every day instead of once a week. **See Q-195: this was one of three things rebuilt in a single session that already existed.**

**Cache:** `COACH_PAYLOAD_VERSION` 117 → **120** across the night (118 wiring · 119 redundancy/over-claim · 120 window).

**The transferable lesson, and it is the one worth keeping:** *green tests proved the code did what I told it to; they could not tell me that what I told it was wrong.* Every defect above was invisible to 30 passing tests and obvious in one screenshot. **Render the output and read it. On the real screen, next to whatever else that screen already says.**


---

## D-307 — Precise verdict words: "settled lower" vs "easing off" (`recentlyFlat`) (2026-07-22, PUSHED + DEPLOYED + DEVICE-SEEN)

Michael: *"all the words for every scenario has to be precise."* The trend verdict is the NET early→recent change; on its own it can't tell a metric STILL declining from one that DROPPED then STEADIED. `classifyTrend` now carries **`recentlyFlat`** — true when the SECOND HALF of the window sits inside the holding band (`classify.ts`). The display splits the moving verdict:
- **improving** — rising · **holding** — flat the whole window · **easing off** — still drifting down (sliding + still moving) · **settled lower** — dropped, then levelled (sliding + `recentlyFlat`).

"sliding" is **retired as a display word**; its non-alarming default everywhere is "easing off" (softer than Garmin's "Detraining"). Shared engine — every discipline's trend gains the flag; run efficiency renders it via `verdictLabel` (`StatePerformanceSection.tsx`). Industry map: improving≈Garmin Productive, holding≈Maintaining, "settled lower"=our edge (nobody distinguishes it), "easing off"=neutral Detraining. Fixtures: `classify-recently-flat.test.ts` (Michael's real efficiency series 1.76→1.55 → "settled lower"). Payload `v135→136`.

## D-308 — Run row: pace-at-HR line, RAW by default, GAP toggle (2026-07-22, PUSHED + DEPLOYED + DEVICE-SEEN)

The efficiency index is a real fitness signal but "1.55" means nothing to a human, so the RUN row shows the recent steady-run **pace + HR** behind it ("pace ~12:46/mi at 134 bpm"). `recentEfficiencyPaceHr` (`run.ts`) derives pace from the SAME index the verdict reads (`efficiency_index ?? gap_efficiency_index`) and `hr_avg` — `pace_s_per_km = 100000 / (index × hr)` — averaged over the last-2 in-window steady runs, so the pace line CANNOT disagree with the number above it.

**Field-standard split (Strava/TrainingPeaks):** the efficiency VERDICT stays grade-adjusted (TP's NGP÷HR), but the DISPLAYED pace is **RAW** — what the watch recorded — because that's what every platform shows and what the athlete recognizes. A **GAP toggle** carries the grade-adjusted twin (`recentGapPaceSecPerKm`); suppressed when any recent run lacks GAP or the two differ <3 s/km. `run-efficiency-pace.test.ts`. Payload `v136→138` (137 pace line, 138 raw+toggle).

## D-309 — Projected race times on the RUN row: goal-free VDOT + long-run unlock (2026-07-22, PUSHED + DEPLOYED + DEVICE-SEEN)

For the "varied runner" the efficiency row can't serve. `projectStandardRaces` (`_shared/race-readiness/index.ts`) **reuses the shipped VDOT engine** (`estimateVdotFromPace` → `getTargetTime`, the same path `computeRaceReadiness` uses) but needs **no goal race** — the goal's `target_date` was only ever used to say "on track", never to compute the number. Projects 5k/10k/half/marathon off current fitness (threshold pace → VDOT), with the engine's own hedges (durability + confidence) so thin/fatigued data reads conservative.

**UNLOCK by distance (Michael's idea — and the honest move):** a projection is only trustworthy near the distances you actually run; a marathon estimate off 5-mile long runs is a fantasy (VDOT/Riegel error grows with extrapolation). Longer distances unlock as the long run grows (10k ~6mi, half ~10mi, marathon ~16mi — estimated from the longest recent run's DURATION at easy pace, avoiding the codebase's inconsistent raw-distance units). Computed in `compute-snapshot` (kept OFF the client-math fallback), attached to `display.runFitness.projections`. `project-standard-races.test.ts`. Payload `v138→139`. **Why VDOT not Riegel:** VDOT works off training pace (no race result needed); Riegel needs an anchor performance. Both are field-standard; VDOT was already wired.

## D-310 — State color system: discipline ICON + traffic-light verdicts (categorical vs semantic collision) (2026-07-22, PUSHED + DEPLOYED + DEVICE-SEEN)

Introducing per-discipline color created a collision: green meant both "improving" (verdict) AND "bike" (discipline); amber meant both "holding" AND "run-gold". **Resolution (the textbook one — reserve semantic hues, contain categorical color):**
- **Discipline = a small colored ICON** on the row label (`getDisciplineColor`, icons match WorkoutCalendar's app-wide set: run=Activity, strength=Dumbbell, swim=Waves, bike=Bike); **label text stays WHITE** for legibility. Category is a contained icon, not competing text.
- **Verdicts = traffic-light, one meaning each:** improving=green (good), **holding/steady/settled-lower = neutral GRAY** (was amber — a false caution that *also* read as run-gold, and made "steady" look identical to "slipping"), easing-off/declining=amber (mild bad). `VERDICT` + `VOLUME_WORD` maps.
- **Cross-training sentence** colored by its **subject discipline** (`cross_training_signal.discipline`, new field) instead of blue — blue is swim's own color, so a blue sentence about running collided. Warnings stay amber.
- **Two load bars unified:** LoadBar (rolling-7d composition) said "Ride" (capitalized); WeekMixBar (this-week planned-vs-actual) said "bike". One word **"bike"** (swim-bike-run is the tri canon), one lowercase casing, each keeps its distinct window label. Discipline word "ride" purged from user-facing labels (`LoadBar.tsx` DISPLAY_NAME).

Also: uniform readability bump (brightness +~20%, size +1 step), `tabular-nums`, aligned grid columns (strength e1RM, race times), left-aligned wrapping prose in BODY (was right-aligned — the cardinal sin). Payload `v139→140` (cross-training discipline field). Rest is client-only.

## D-311 — The 12-week efficiency chart: OUTPUT not LOAD, two-horizon, fills-as-you-build (2026-07-22, PUSHED + DEPLOYED + DEVICE-SEEN)

TP's gap-closer, on our terms. `run.efficiency.series` carries the SAME efficiency points the verdict reads, over an **84d (12wk)** window vs the verdict's **42d (6wk)**, each flagged `recent` when inside the verdict window (`assemble.ts`). The RUN-row sparkline (`EfficiencySparkline`, self-contained SVG) draws recent-6 in the run color (the slice the verdict judges) + older weeks dim (context), so **chart and word are one truth** — the chart's recent tail IS the verdict's data, they can't contradict.

**Two horizons, two questions:** verdict = "is my *current* training working?" (acute, 6wk, reacts fast); chart = "am I *trending up over the block*?" (chronic, 12wk = one training block). Most apps blur these.

**Charts OUTPUT, not LOAD.** TP's PMC (CTL/ATL/TSB) charts training *load* — "you trained more", not "you got faster". This charts the actual performance output. It's the chart TP's model skips. (TP *can* build an EF-over-time chart, but makes you configure it and decode acronyms; we curate + surface + plain-language + strength-capable.)

**FILLS-AS-YOU-BUILD:** designed for new users first, not veterans. A 12-week canvas that shows what exists, honestly labeled ("building · N of 12 weeks"); **<2 points draws no line** (no fabricated trend through one dot). Michael's data revealed the value immediately — a June efficiency PEAK (~1.90) the recent-6 verdict ("settled lower") can't show. Payload `v140→141` (`run.efficiency.series`).

**Data-integrity gate (Michael: "if we are 100% on the data"):** traced actual depth before building — run efficiency 14 pts / 11-of-12 weeks (chart is real); strength e1RM only ~5wk/lift + the Q-197 split (NOT ready → strength chart deferred). The gate did its job: run passed, strength didn't.

---

## D-312 — Exercise-name canonicalization: merge synonyms + plurals, one clean display label (Q-197) (2026-07-23, PUSHED + DEPLOYED + DEVICE-SEEN)

Closes Q-197. Several lifts fragmented across canonical buckets because raw names never mapped and slugified into lone buckets — dropping sessions from their e1RM verdict AND breaking last-session autofill. Found in Michael's real `exercise_log`: `Barbell Back Squat`→`barbell_back_squat` (3 sessions), `Conventional Deadlift`→`conventional_deadlift` (5), `Standing Barbell Overhead Press`→`standing_barbell_overhead_press` (2), plus plural `Bulgarian Split Squats`/`Walking Lunges`. The three anchor cases were dropped from `STRENGTH_ANCHORS` entirely, so squat/deadlift/OHP verdicts each ran on partial history.

**Fix (`_shared/canonicalize.ts`):**
- Added the missing synonyms (back squat / barbell back squat / bb squat / high+low bar → `squat`; conventional + barbell deadlift → `deadlift`; standing/barbell OHP → `overhead_press`).
- A **general plural fallback**: a trailing-`s` name whose singular is a mapped lift folds into it (`bulgarian split squats`→`bulgarian_split_squat`), and it can NEVER over-merge an unmapped name (only fires when the de-pluralized form is explicitly mapped).
- `canonicalDisplayName(canonical)` — one clean label per lift ("Back Squat", "Deadlift", "Overhead Press", explicit map for abbreviations/variant-clarity, Title-Case fallback). Used in `liftSeriesFromExerciseLog` so the row shows a stable name, not whichever raw name was logged first.

**The same bug on the CLIENT (`StrengthLogger.tsx`):** the D-097 prefill + D-122 "last:" anchor matched on raw `normalizeExerciseName`, so "Hip Thrusts" ≠ "Hip Thrust" → autofill silently failed for plural-logged lifts. Now drops a trailing plural 's'. Michael confirmed the symptom (hip thrust weight not auto-filling).

**Backfill:** recomputed the 13 affected workouts through `recompute-workout` (no direct DB write) — squat 4→7 sessions in the 12wk window; deadlift/OHP verdicts now read full history. Genuinely-distinct lifts (Romanian DL, DB bench, front/goblet squat) correctly stayed separate. 8 `canonicalize.test.ts` fixtures pin it. **Left open → Q-199** (hip thrust is a server anchor but not a client baseline-test lift).

## D-313 — Strength e1RM + bike power 12-week OUTPUT charts; generalized sparkline (2026-07-23, PUSHED + DEPLOYED · strength DEVICE-SEEN, bike POWER fixture-only)

Extends D-311 (run efficiency chart) to strength and bike — the same "OUTPUT over 12 weeks, fills-as-you-build" pattern.

- **Strength:** per-lift e1RM series (big-4: squat/bench/deadlift/OHP) added to `StrengthPerLift.series` in `assemble.ts` (84d window, recent-6wk flagged). One sparkline under each big-4 lift.
- **Bike:** `bikePowerChartSeries` charts the w20 points of the **winning terrain bin** (the one the verdict reads), so chart and word agree; 84d window, recent-8wk flagged. Renders only when power LEADS.
- **`EfficiencySparkline` → `TrendSparkline`** (generalized): props for color / value formatter / unit / `dotNoun` / `recentLabel`. Run render is byte-identical via defaults (verified). **Noise floor** (`minSpanFraction`, 0.25 strength / 0.15 bike): the domain spans at least that fraction of the center value, so a 10lb wobble on a 100lb lift no longer fills the height and reads as a crash. Run passes 0 → unchanged.
- **Endurance-rider "power trend ⓘ":** when bike power is `needs_data`, a tap-ⓘ names what unlocks the chart (a hard 20-min effort) rather than silently omitting it. Fact-first, conditional, no imperative (copy voice).

**Believability caveat (deferred):** cross-lift e1RM can read bench > squat, which athletes distrust; the `~` marks it an estimate, but the squat likely under-reads off working sets at higher RIR. A data/estimation question, filed for later, not a chart bug.

**Verification:** strength device-seen. Bike power is **fixture-only** — Michael has 0 power-bin rides, so it has never rendered live. `bike-power-chart.test.ts` (7 tests) proves shaping + full-assembly (structured rider fills / endurance rider empty). Deno state-trend suite 165 green.

## D-314 — State FITNESS layout: discipline name as a full-width header (2026-07-23, PUSHED · DEVICE-SEEN)

The discipline label sat in a ~94px left gutter (`Row` = label column + indented content), so the 12-week charts rendered in a narrower column than necessary. Restructured `Row`: the discipline name is now a **header above** full-width content, and headers are bumped (13.5px text / 16px icon, brighter) so they read as the scanning landmark (previously smaller than the lift names below them — inverted hierarchy). Shared component, so run/strength/bike/swim + the generic card all moved together. Subtractive of the indent; adds ~90px of chart width.

> **↪ UPHELD, NOT SUPERSEDED, by D-322 (2026-07-24) — and its swap weight math was WRONG.** D-322 examined whether
> double progression forces an engine-side weight change and concluded it does not: the plan authors one entry
> weight + rep range per phase, materialize stays stateless, and the weight increase rides this decision's own
> consent-gated suggestion path. **The "no silent write" rule stands.**
>
> The half that did not survive is this entry's swap seeding. Its client rescale (`curW × newRatio / oldRatio`)
> multiplied plate-rounding error and ignored `ratioIsTotal` entirely — a barbell→dumbbell swap put the TOTAL load
> in each hand (45/hand against a prescribed 20). Three of eight offered alternatives were wrong. D-322 replaced it
> with a derivation from the new lift's own reference at the authored %1RM. Everything below is otherwise current.

## D-315 — "Adapt a plan" strength track: phase-aware RIR, reversible swap/add, consent-first weights (2026-07-23, PUSHED `db912150`+`430c717a` · DEPLOYED `generate-combined-plan`/`materialize-plan`/`adapt-plan` · migration applied · BURNER-VERIFIED 11/11, NOT device-seen)

The first four slices of "steerable plans" (`TARGET-ARCHITECTURE` #3), on the STRENGTH discipline. Full design + trace: `docs/CONCEPT-adapt-plan-strength.md`. Every edit routes through `plan_adjustments` → `materialize-plan` and reads one truth; nothing mutates the frozen `sessions_by_week`.

**Step 0 — phase + lift-aware RIR target, single source.** The RIR grading engine (analyzer + State `computeLiftVerdict`) was well-built but **starved** — the plan never stamped a `target_rir`, so it graded against nothing. Fix: `getTargetRir` (`_shared/strength-profiles.ts`) gains an optional `phaseTag` → `PHASE_RULES.targetRirOffset` (base 0, build −0.5, peak −1.0, taper +0.5, recovery +1.0; RP/RTS mesocycle shape), clamped [0.5, 4]; 3-arg callers unchanged (byte-identical). Stamped at BUILD (`session-factory.ts intentToPlanned`, mapping combined-plan `Phase`→`PlanPhaseId` — `race_specific`→peak) AND at MATERIALIZE (`materialize-plan`, resolving protocol from `config.strength_protocol` + phase via the canonical `resolvePlanPhase`) — the materialize stamp is what lets an existing mid-plan athlete pick it up on re-materialize without a regen. Client renders half-steps as a **range** ("2–3", `src/lib/rir-format.ts`) — field convention (RIR ranges + Tuchscherer 0.5-RPE); logged values stay whole reps. **Continuity proven by trace**: analyzer (`analyze-strength-workout:535` "target_rir is the source of truth") + verdict both read the stamped value, so logger preload = grade = verdict.

**#1 — swap (reversible override).** New nullable `plan_adjustments.substitute_exercise_name`. Logger swap sheet gains "just today / rest of plan" (chips + typed-name path). `materialize` renames the slot BEFORE weight resolution (skips the qualitative + pre-resolved branches when swapped) so the weight re-seeds from the NEW lift's own reference — no old weight carried across. Field-standard (RP/Fitbod/Trainerize substitution) and matches D-289 ("the slot is the unit, not the name").

**#2 — add (smart placement).** New nullable `plan_adjustments.add_meta {sets,reps}`. Logger "＋ Add to plan" on a hand-added lift. `materialize`'s `planAddInjections` decides across the whole plan which strength days each add lands on: matching movement group (`getMovementGroup` in `exercise-config`, lower/upper/core) contained to days that already hold that group, capped **2×/week (Schoenfeld/Ogborn/Krieger 2016 — 2×>1× at equated volume, 3× no added benefit)**, weight seeded from baseline via the lift's loading reference (or `baseline_missing`). Idempotent — never persisted into `strength_exercises`, re-injected fresh each materialize, so fully reversible.

**#3 — consent-first weights (extends D-285 to strength).** DELETED the silent auto-progression/auto-deload writes in `adapt-plan` `autoAdapt` (they re-priced working weight on every ingest, skipping the fatigue gate the suggest path applies). Mirrors the endurance ruling below. Weight now changes ONLY on the athlete's tap (State adjust modal / accept / swap). Michael's ruling: *"we shouldn't auto change weights, the user needs to know."* No strength app (RP/Fitbod/Juggernaut) silently rewrites your loads — they suggest.

**Continuity seam closed:** `adapt-plan` suggest called `getTargetRir(profile, lift)` with no phase → graded on BASE RIR while the plan/logger/verdict used the phase-aware value. Now passes `phaseTag`. One target everywhere.

**Rejected:** a new table for swaps/adds (reused `plan_adjustments` +2 columns — same scope/reversibility machinery); an uncapped add frequency ("plan dictates" was the instinct, but the science caps it at 2×/week); rebuilding a plan to surface the features (the materialize-side stamp makes re-materialize enough — avoids re-deriving weights from a stale typed baseline).

**Verified:** RIR fixtures 6/6, classification 7/7, burner 11/11 on the live pipeline, all touched fns type-check clean. **NOT device-verified** — the logger UI (range/swap toggle/＋ button) and the `generate-combined-plan` build-stamp on a real plan are the outstanding proof; Michael's hip-thrust add tomorrow is the acceptance test.

> **↪ ADDENDUM (2026-07-23, DEPLOYED `materialize-plan` `cb6898d1`) — swap weight math + curated families + add periodization.**
> - **Swap grouping + weight math.** Direct swaps use a curated equivalence map (`exercise-alternatives.ts DIRECT_FAMILIES` — Leg Press is a direct Back Squat swap; Hip Thrust is an *Alternative*, not a deadlift), ranked over the movement-pattern filter. A swap now fills a **rackable weight**: `reference 1RM × the lift's ratio × your working %`, rounded to 5 lb / 2.5 kg. Same-ref scales off the current load; cross-ref/fresh uses baselines. Supersedes Q-181's "always clear." Verified: squat 250 → leg press 375 / front squat 215; cross-ref squat → chest fly 65; fresh hip thrust 255. Buttons: ⇄/＋ got visible "Swap"/"Add" labels (no hover on touch).
> - **Add periodization — TWO CLOCKS (`materialize-plan planAddInjections`).** An added lift no longer sits flat: (1) its OWN age → block-linear ramp (70%→85% at ~1.25%/wk, `SCIENCE-5x5-linear-progression`) from a conservative start the week you drop it in, so it starts light at any insertion point; (2) the PLAN's deload weeks (`phase_by_week` recovery/taper) → ~15% cut alongside the already-looser RIR (gentler than a main-lift 45% — the accessory isn't the primary stressor). Two independent clocks, composes at any drop-in point. Verified: hip thrust added wk3 → 255 (start) / 220 (wk4 deload) / 265→275 (ramp) / 235 (wk8 deload).

## D-316 — State-as-hub: see + steer on one surface, three lenses as tabs (2026-07-23, DESIGN ONLY — not built)

Supersedes the earlier "separate refine hub / Adjust-plan button → one screen per discipline" idea. **State itself is the hub**, because the insight and the handle belong in the same place — State is where the app reasons about you, so it's where the impulse to steer is born. Full design + diagram: the **State-as-hub** section of `CONCEPT-adapt-plan-strength.md`.

- **Nav = two standard levels:** bottom 4 (HOME/STATE/GOALS/+) always present; **STATE is the gateway**; inside it, three lenses via the app's existing segmented-tab control (the `Planned/Performance/Details` tabs — reused, not rebuilt).
- **Three tabs (look / what / when):** **Status** (read-only, default — today's State screen; most athletes never tab away) · **Adjust** (the *same* disciplines/order as Status, now steerable — pull back/push load, add intensity, swap/add; the strength edits currently in the logger re-home here) · **Schedule** (sliding-cards week, a thin UI over `week-optimizer` via a new per-move re-solve endpoint; scope toggle *this week* vs *rest of plan*; needs a touch drag layer — do NOT reuse the calendar's desktop-only HTML5 drag).
- **Layering:** Glance (Status) · Steer (Adjust — the 90%) · Tweak (Schedule + deep options — for the tinkerer, invisible to the casual). Progressive disclosure: dashboard at rest, cockpit on tap.
- **Naming cue:** verbs for action tabs (Adjust/Schedule), noun for the read tab (Status/Now).
- **Rejected:** a separate refine-hub destination behind a button (adds a seam between seeing and steering); bolting the arranger onto `WorkoutCalendar` (calendar stays a display; the arranger is its own touch-drag surface).
- **Impact-read (teed up, not built):** a **permission engine with narrow confident guardrails**, not a warning engine — concurrent-training science says chronic interference is ~null (max-strength SMD −0.06, hypertrophy −0.01; only explosive/lower-body −0.28, smaller in trained athletes). Honest read is mostly "adding this is largely free for your goal," with two confident costs: **acute timing** (heavy legs before a key session — the optimizer already spaces it) and **load** (measurable). Discipline-aware voice: rides lean "strength helps you"; runs add "don't show up sore." See `SCIENCE-concurrent-training-interference`.

## D-317 — Load verdict is MULTI-SPORT: the base load_status reads TOTAL load, phase-aware (2026-07-23 NIGHT → 2026-07-24, PUSHED + DEPLOYED + DEVICE-VERIFIED)

**The bug (Michael, on device):** a *Get stronger* week — runs on/under plan, one added swim, days moved — read **"pull back · ACWR 1.3"**. His words: "this shoud be a multi sprt engine not a run engine."

**Root cause:** `_shared/athlete-snapshot/body-response.ts` computed `load_status` from a **run-only** block ("Primary signal: run-only load vs run plan"; `running_acwr > 1.3 → 'high'`). A strength/multi-sport athlete on plan, with a bunched maintenance run, tripped the run-ACWR gate and read overload.

**The fix:** `computeTotalLoadStatus(totalAcwr, totalPct, phase)` (exported, `body-response.ts:40`) replaces the run-only block. Reads **total** ACWR (all disciplines), **phase-aware** Gabbett bands — easy tightens (`elev 1.15 / high 1.3`), build tolerates (`elev 1.4 / high 1.6`), default `elev 1.3 / high 1.5` — descriptive words ("total load on target / building / ramping quickly"), never prescriptive. Goal-cost judgment stays OUT of load and IN the coach's eye (the Cross-training row). **Not goal-aware by design** — Michael's call: "follow a basic load principle that isn't a run engine," phase-aware yes, goal-aware no.

`COACH_PAYLOAD_VERSION 141 → 142`; client floor matched (it had drifted to 35 — see the D-318 note on the cache-floor trap). Tests: `body-response.test.ts` (+6 `computeTotalLoadStatus`), golden updated ("running load" → "total load"). **Necessary but NOT sufficient** — see D-318: the reconciler still re-escalated off run-brain STRAIN signals.

## D-318 — Strain verdict is MULTI-SPORT: de-run-brain the reconciler's two run-only strain signals (2026-07-24, PUSHED + DEPLOYED + DEVICE-VERIFIED)

**Why D-317 wasn't enough:** with the load block fixed to "total load on target", the same week STILL read "pull back", then (after a data shift) "a bit high". The verdict is not owned by the load block — the **reconciler** (`_shared/load-status-reconcile.ts`, THE LAW / sole authority, applied at `coach/index.ts:3564`) overrode it. It re-escalated off **strain** signals via `computeDecliningSignals`, and two of them are run-brain:

1. **"RIR declining" counted as strain.** In a strength-primary plan, RIR dropping = pushing closer to failure = the *intent* of a build, not overreaching. (Parallels `computePrimaryAdherence` Fix 1, which already refused to treat RIR-direction as negative and reads e1RM instead.) On a progressing strength block RIR is *always* dropping → a **systematic** false "load a bit high" for any strength athlete making progress, not just this week.
2. **"HR drift declining" counted even when the absorption engine had excluded drift.** `absorption.ts` gates drift on a usable steady session (`steadyGate(...).describe`); on this week it reported `available:false / no_data` ("no steady aerobic effort to corroborate") — yet the reconciler's looser all-runs cardiac trend counted it anyway. Two engines, two rules for one signal.

**The fix:** `computeDecliningSignals(bodyTrends, opts)` gains `opts {planPrimary, driftUsable}` — strength-primary drops RIR-as-strain; an unusable drift gate drops HR-drift-as-strain. Threaded into **both** the escalation (`reconcileLoadStatus` new `driftUsable` param) **and** the safety floor (`computeSafetyFloor` same opts) so they read ONE de-run-brained set (D-264). Both default to pre-D-318 behavior (any caller omitting opts is byte-identical). At the coach call site, `driftUsable = steadyGate(_driftSession).describe`, and the **absorption ledger is neutralized for strength-primary** (`elevated:false`) so `corroborated_strain` can't stay true off the same RIR signal we just removed (else the two-key cap never fires and the verdict stalls at 'elevated' instead of 'productive').

**Effect (verified on device):** Michael's WK3 → **"balanced" · ACWR 1.2** (recon: 3 declining signals → 1 (RPE) → 'productive'/'on_target'; the clean-body ACWR-1.2 screen → 'on_target'). `COACH_PAYLOAD_VERSION 142 → 143`. Tests: 4 new permanent regressions in `load-status-reconcile.test.ts` (the two units + `computeSafetyFloor` opts + the "Michael WK3" bug case), all 60 pre-existing pass.

**Cache-floor trap (both D-317 and D-318):** `COACH_CLIENT_MIN_PAYLOAD_VERSION` (`src/lib/coach-contract.ts`) must be bumped **with** `COACH_PAYLOAD_VERSION` — it had silently drifted to 35 while the server climbed to 142, so the client accepted stale cached "pull back" rows without re-invoking the fixed coach. Both are now pinned together with a "bump both" comment. This is why the first D-317 fix "wasn't budging" on device.

**v144 (copy rider):** BODY heart-rate response "improving" detail `"settling — HR easing at the same effort"` → `"settling — lower HR at the same effort"` (`coach/index.ts:2462`). "easing" collided with the efficiency verdict word "easing off" (`StatePerformanceSection.tsx:20`, a deliberate app-wide declining-trend label — kept) — same word, opposite valence, adjacent on State.

---

## D-319 — App-wide COPY VOICE reset to the "quant who trains" template + `docs/COPY-VOICE.md` (2026-07-24)

Michael on device: the app's generated copy read punitive and non-native ("You said 3 a week. You've been doing about 1.6 a week. That's a trade, not a mistake." / "surgey power delivery" / "aerobic base needs work"). Two Explore sweeps (server prose + client microcopy) surfaced ~69 offenders in five patterns: banned jargon, machine phrasing ("X detected"), punitive second-person, imperatives/consoling closers, dev-leak.

**Decision:** codify ONE voice and rewrite against it. New canonical doc **`docs/COPY-VOICE.md`** — 10 rules distilled from Michael's own redlines: subject is the metric never "you"; no interrogation; cause only if observable, phrased "as a result of"; ongoing state = present participle ("fading" not "fades"); quantify the gap ("fell short by 3"); no filler ("lots of"); no imperatives; no consoling closers; no jargon; **no idioms** (his emphasis). The enforcement seam already exists — `voiceViolation()` in `week-accent.ts`; **lifting it into a shared module + wiring every composer through it is the next step, NOT built.**

~45 confirmed-live strings rewritten this pass: run row (jargon: "aerobic base"/"durability"/"aerobic engine" → plain), workout-detail ("you went heavier — intentional?" → "Heavier than the plan called for"; VI-jargon → "Power came in uneven as a result of surging"), CoachWeek/BlockSummary/StateAdjust/StateTab microcopy, and server prose (posture, week-narrative, cross-training, strength-protocol). **Deliberately deferred:** the dead `buildVerdict` taper cues (shown nowhere — deletion pass), `ai-summary` LLM prompt examples, one `longitudinal-signals` "efficiency factor".

**Riders in the same batch:**
- **`overall_training_read` "This week" fallback DELETED (closes F8).** The ~25-branch imperative tree (`response-model/weekly.ts` `computeOverallTrainingRead`) rendered only as a no-signals BODY fallback on State and duplicated the load bar. Client render (`StateTab.tsx`), the function, and its emission removed; `overall_training_read` type made nullable. BODY reads "not enough data" when no signals.
- **Posture diagnosis (D-292/Q-179) rewritten fact-first AND surfaced** — `posture.ts` `postureSentence` reworked ("Running's at about half the 3-a-week plan. Easy pace drifts slower at lower volume, and picks back up when the running does."), now rendered in the run efficiency ⓘ tap-down (`RunFitnessRow`), opt-in so it doesn't duplicate the week-execution line. The always-visible `PostureLine` (F10, client-orphaned since it was written) is DELETED. **This supersedes the posture.ts copy back-annotated below.**

`COACH_PAYLOAD_VERSION` 144→145. Tests: posture 16, coach-week-insights + response-model green. Client build clean.

## D-320 — Week-narrative POSTURE GOVERNMENT: one owner per discipline (2026-07-24, 3 device-caught contradictions)

The reworded week narrative (`coach-week-insights.ts`) made three false/contradictory signals legible that the old clunky copy had hidden. All fixed by making posture govern which clause may speak:

1. **MAINTAIN → the upkeep line owns it.** "Running came in heavier than planned" (this-week load over a small maintenance plan) rendered two inches above the coach's-eye "Running's under what holds it" (28-day upkeep) — same discipline, opposite verdicts, two windows. Clause 3 now excludes `maintain`-posture disciplines from the plan-adherence over/under line (their story is the trailing upkeep target, D-297/D-130). `COACH_PAYLOAD_VERSION` 145→146.
2. **PARKED ('out') → silence.** "Riding came in below its recent normal" fired on a strength plan where bike posture is `out`. Root cause was a NAMING + KEY mismatch: the composer's vocabulary is `dropped` (not posture.ts's `out`), AND disciplines arrive canonicalized to `ride` while posture is keyed by the athlete's word `bike`. Fix: map `out`→`dropped` at every posture-map build site, and `postureOf` in `composeCoachWeekInsight` now resolves bike/ride/cycling as aliases before normalizing. **Took two takes** — v147 fixed the value but not the key mismatch. v146→148.
3. **Fade fires ONLY for a `develop` discipline you're building.** The "quietly disappearing" clause used to state a fade even for a discipline with no declared stake — the exact "why are you telling me about this, it's not my plan" reaction (bikes, off-plan dips). Now: develop → flag; maintain → upkeep line; dropped/parked/undeclared → silent (matches `posture.ts` `isConcern`: only a develop discipline can be "failing"). **Reverses the older "state the fact even without a declared intent" design choice** — Michael's reaction twice over is the better signal. Deleted the never-wired `MIN_SHARE_PCT` guard (the acwr floor subsumes it). v148→149.

All pinned with regression tests (32 green). Every fix SERVER-VERIFIED via a live `skip_cache` coach call for the primary user (narrative reads clean, then correctly silent). **One residual cross-engine contradiction logged as Q-201 (deferred — needs a coach reorder).**

## D-321 — State trends: the client-side fallback assembly is DELETED (single source of truth) (2026-07-24)

`useStateTrends.ts` had a legacy fallback: when the server display contract (`weekly_state_v1.trends.display`) was absent, the client re-ran `assembleStateTrends` itself off ~11 in-browser queries. Two problems: it violated smart-server/dumb-client (Constitution Law 4 — the one place run math still ran on the client), and it was fed WORSE inputs than the server (dropped `gap_efficiency_index` + `hr_avg`), so when it fired it silently degraded to a raw, pace-at-HR-less trend. Michael: "we're in dev, we shouldn't be relying on fallbacks... they are a cancer."

**Decision:** delete the client assembly entirely. The hook is now a pure renderer — server contract present → render it; absent → loading state (never re-derive). Verified the contract is reliably produced (`compute-snapshot` writes `state_trends_v1.display` every snapshot via the SAME `assembleStateTrends`; coach forwards it; the cache gate re-sources anything below the current version, so a loaded payload always carries it). The only client fetches left are two config reads (declared posture + active disciplines). Build clean, no regression on the primary user (whose payload always carries the contract).

---

## D-322 — Strength numbers: swaps derive, target RIR is read off the RPE chart, and names lose their hyphens (2026-07-24, PUSHED `f77f3cc3`+`aa6baa58`+`b027d7f6` · DEPLOYED materialize-plan/adapt-plan/analyze-strength-workout/coach · NOT device-seen)

**Working ledger: `OPEN-QUESTIONS.md` Q-202.** Report progress against that list line by line, never by topic — a topic-level "hip thrust: done" covered one of four fixes and read as all four.

### The decisions

**1. A swap DERIVES; it never rescales.** The invariant: *swapping into a lift gives the weight the plan would have prescribed for that lift, that week, had it been the authored slot all along.* One shared `resolveSwapSeedWeight` serves the logger and `materialize-plan`, so the two paths agree by construction.

`curW × newRatio / oldRatio` is algebraically the same derivation **only on unrounded numbers**. Real prescriptions round to the plate first, so the rescale multiplies the rounding error and rounds again (front squat 73.4 → shown 75 → ×1.176 → 90, where the plan says 85). It also ignored `ratioIsTotal` entirely, so a barbell→dumbbell swap skipped the per-hand halving and put the TOTAL load in each hand — 45/hand against a prescribed 20. Three of eight offered alternatives were wrong.

**Back-inferring the intensity from the displayed load has the same defect one step removed** (75 / (110 × 0.85) = 0.802 vs an authored 0.785). The authored `percent_1rm` is the only intensity not downstream of a rounding step. It was already on the planned step; the logger was discarding it.

**2. Target RIR is DERIVED, not chosen.** Reps, %1RM and RIR are three views of one thing; the mapping is the published Tuchscherer/Helms chart. RIR = 10 − RPE.

> This reverses a set of per-phase constants written earlier the same day. Michael's ruling: *"you don't make calls, the training science does."* He was right — checked against a real block, the constants were wrong on **10 of 11 weeks**, holding RIR flat at 2 across a base phase whose own percentages ramp 72% → 82%.

The profile/phase defaults **remain correct** for rows that state no intensity — accessories, bodyweight work, "Heavy" carries. Precedence: explicit per-exercise target → derived from the prescription → protocol/phase default.

Inherits the anchor's accuracy: the chart is relative to a TRUE 1RM, so a stale stored max drifts the target with it. Same exposure the prescribed weight already carries, and it **surfaces** rather than hides it — a high anchor reads consistently below target, which is the "back off" signal the RIR loop exists to produce.

**3. RIR 2 (RPE 8) is the entry-ceiling anchor.** Deriving the ceiling from "top-of-range at target RIR" is circular, because target RIR is itself derived from (reps, %). It needs one fixed constant. RIR 2 is the standard working-set anchor and reproduces the expected ~74 / ~81 / ~87%.

**4. The peak rep range is 2-3, not 2-4.** At an 84% entry the bottom of a 2-4 range sits near RIR 5, making peak the lightest per-rep work in the block and inverting the phase's purpose. A four-week peak also has no room to climb a wide range and earn a jump. 2-3 derives to ~87%.

**5. D-315 is NOT superseded.** Double progression needs no engine-side weight change and no per-lift progression state. The plan authors ONE entry weight + rep range per phase; that materializes identically from baselines every time. The athlete progresses REPS inside a fixed prescription. The weight increase rides the existing consent-gated suggestion path. Logger carry-forward holds the actual working weight; the plan holds the entry weight, and divergence between them is expected.
> *A case where this framing doesn't hold is a stop-and-report, not a licence to build progression state.*

**6. History-seeding is WRONG for swaps and RIGHT for added exercises.** A swap has a plan prescription to stay faithful to; seeding from the log silently leaves the protocol, agreeing only on lifts trained at the block's intensity. An added exercise has no prescription, so the athlete's own log is the only real signal. Built for swaps, then reverted.
> ⚠️ **That revert took the widened history fetch with it and silently broke added-exercise prefill.** Nothing flagged the dependency. This is why Q-202 rule 4 exists.

**7. Rows → bench at ~80% and lateral raises → overhead are INTENTIONAL.** Audited every `resolved_from` that differs from the lift's own family; these two are documented proxies, not bugs. Exactly two entries have a measured baseline bypassed by a proxy — hip thrust and barbell row — and **both produce the identical number on current data**, so correcting the precedence is a no-op today and only matters as real ratios drift from the table.

**8. Hyphens are removed from exercise names, everywhere.** The table was written hyphenated (`pull-up`, `push-up`, 17 keys) while callers wrote the spaced form, so `getExerciseConfig('Pull Up')` returned null and dropped into the legacy barbell fallback — pricing a PULL-UP off the athlete's BENCH at "110 lb". 176 literals renamed across 20 files, with a punctuation-fold underneath so every legacy stored name still resolves. The sweep surfaced six duplicate keys and one genuine regression (the equipment matcher's `/^pull-?ups?\b/` stopped requiring a pull-up bar).

### What this does NOT cover

~~`five_by_five` is still missing from `PROTOCOL_PROFILES` and still falls back to `durability` — **Q-192, filed 2026-07-19, same root cause, not fixed here.** D-322 added `strength_primary` only.~~

> **✅ SUPERSEDED 2026-07-25 (`ad62947b`).** Fixed, and at the root this time: `five_by_five` got its entry, `resolveProfile()` now WARNS instead of falling back silently (that silence was the actual root cause), and `strength-protocol-registry.test.ts` fails the build if a reachable protocol has no profile. Q-192 and Q-202 line 25 both closed.

> **↩ Related:** **Q-192** (five_by_five profile missing — same failure mode, still open) · **Q-199** (hip thrust is a server anchor but not a client baseline-test lift — the `hipThrust` `getBaseline1RM` branch is confirmed DEAD: 0 exercises use it) · **D-315** (consent-first weights — upheld, not superseded) · **D-289** (a swap is not a skip) · **Q-181** ("swap clears the weight" — superseded; the swap now seeds a derived weight).

---

## D-324 — Strength Focus V1: Wendler 5/3/1 replaces the ATR block, per-set weights reach the phone, RIR scoped off, and volume is a trade rather than a cap (2026-07-25, PUSHED + DEPLOYED, **not device-seen**)

> ⚠️ **The ASSISTANCE half is superseded by D-328 (2026-07-29).** The three slots here are day-blind:
> the athlete's pick stood on every lifting day, so push-ups followed a bench press and chin-ups ran
> four days a week. Assistance is now resolved **against the day's main lift** — collisions are
> substituted, and a pick on the wrong side of the plane is rebalanced. Everything else below stands.
> ⛔ **The citation D-324 would have implied is also wrong** — see D-328; four of Wendler's five
> templates do the opposite of crossing, and only the concurrent template (p86) supports this.

> **↪ AMENDED SAME DAY — see D-326. Scoping RIR off left a hole this entry did not know about, and the
> hole is bigger than the bug that was fixed.**
>
> Killing RIR was right: it was **auto-filled** and fed `brzycki1RM`, so a suggested value on a
> deliberately submaximal opener read back as a much heavier lift. **But `effectiveReps = reps + rir`
> means that with RIR gone, e1RM on a LEADER week is `weight × 1.125` — a pure function of the
> prescription.** It climbs every cycle because the plan raises the bar, not because the athlete did
> anything. Combined with §2's own finding that AMRAPs fire **only in the anchor cycle** (`wendler-531.ts:61`
> — weeks 9/10/11 of twelve), **the strength gauge is near-blind for weeks 1–8 and nothing said so.**
>
> **D-326 was the intended replacement signal — and it was BUILT (D-338) then DELETED (D-344, 2026-07-30). Per-set difficulty no longer exists.** The gauge's real fix landed as [D-341]: the AMRAP rep count now moves the working number (`loading/cycle-verdicts.ts:116` → `workingNumberForCycles`). Per-set difficulty in three words, ⟨A31⟩
> feeding the body read, never the 1RM maths. §3's "RIR is OFF for `strength_primary`" **still stands and
> must not be undone.** Everything below is unchanged and correct.

**Folds in `docs/SPEC-get-stronger.md` §1 as built.** Twelve commits, `eb7db0df` → `90c48ee5`. Deployed: `generate-strength-plan` v34, `create-goal-and-materialize-plan` v250, `materialize-plan` v218, `coach` v398, `analyze-strength-workout` v137, `compute-snapshot` v99, `adapt-plan` v33.

### 1. The protocol is replaced, not tuned
The ATR block (base→power→deload→peak, a 72→94% ramp, a separate AMRAP retest week) is gone. V1 is Wendler's 5/3/1 in his endurance-athlete configuration: 12 weeks = leader, leader, anchor (his 2:1), each cycle ending in a deload. Working number **85% of the true 1RM, rounded down, STORED** in `plans.config.training_max` and stepped +5 upper / +10 lower per cycle. Derived instead of stored, the AMRAP write-back that lifts `performance_numbers` would drag it and the controlled progression would be gone. **The frozen-retest-weight problem deleted itself with the retest week** — under 5/3/1 the last set of every third week IS the test. Zero DB migrations.

Loading lives in `shared/strength-system/loading/wendler-531.ts`, deliberately outside the composer, so race plans can reach the same protocol at a maintenance dose (`ARCH-strength-spine.md` Layer 2).

### 2. ⛔ THE PER-SET PRESCRIPTION — the app could not express the protocol
5/3/1 is three sets at three weights and a row held one. Copying the top set onto all three prefills a weight the athlete was not asked to lift, **twice a session, four days a week, for twelve weeks**. Rows now carry `set_plan`; `weight`/`reps` stay the TOP set so every pre-existing consumer is unchanged. `materialize-plan` carries it through (`carrySetPlan`, rescaling the ramp if anything moved the top set); the logger prefills each set from ONE reader (`plannedSetsFor`) used by all four prefill paths — the same row was being mapped in four places.

**No `1rm_test` tag on the measured week, deliberately.** The tag makes the logger DISCARD the planned rows and rebuild the session as a warm-up ramp plus one all-out set — the old separate-retest shape — which would delete the prescription the block is built on. The e1RM still lands: `set_plan[].amrap` flags the open set and the write-back fires off that flag alone.

### 3. RIR is OFF for this protocol and NOTHING else
5/3/1 is deterministic; the engine never reads a reserve estimate to decide anything here, so it is a second instruction that can contradict the first — on the exact set whose prescription reads "as many as you can". **And it was not inert:** learned-1RM is `brzycki(weight, reps + rir)`, so an auto-filled reserve on a deliberately sub-maximal opener read back as a far heavier lift, into the number that seeds the next block. Eight of twelve weeks are sub-maximal by design.

`usesRir: false` on `strength_primary` alone — **opt-out, not opt-in**, so a protocol added later keeps its targets. The switch sits at the STAMP seam (`protocolUsesRir`) rather than inside `getTargetRir`, which returns a plain number to ~a dozen callers: making it nullable would push a null check into every one, and the ones that forgot would read `0` — "grind to failure" — the worst possible failure direction.

### 4. Assistance carries NO prescribed load
Only the four main lifts are dictated by percentages of the training max. Tie a dumbbell row to a percentage and you force progression on a secondary movement; the athlete arrives at the next main lift already fatigued and the fatigue budget their endurance needs is gone. A row states a MOVEMENT and a REP TOTAL; the athlete splits 25 reps however the day suits and loads by feel. This also dissolved two known-wrong config entries (`Single Leg Hip Thrust` carries the two-legged 0.9× deadlift ratio; `Dumbbell Overhead Press` resolves to the barbell entry) — nothing on the menu is ever priced.

Three slots, athlete-chosen from a shared menu (`src/lib/assistance-menu.ts`, read by the picker AND the composer). They are also the Adjust-tab holes: an add-on REPLACES a slot rather than adding a fourth. A glute emphasis is now reachable as a single-leg hip thrust — which is what the removed Glutes add-on was supposed to do and could not.

### 5. Volume is a TRADE, never a cap
A ceiling was proposed (30-35 mi, 6-8 h) and **rejected**. D-222's ceiling was already retired 2026-07-01, and this repo's science doc says plainly: *"Volume-dependence is directionally supported and mechanistically sensible; any numeric threshold the app states would be invented."* So `volume_state` — computed and returned by the composer for months, **never rendered** — now renders live as they type. Band is ~⅔ of the athlete's OWN usual week when they give one [Hickson, SPEC §2], absolute fallback when they don't, and **"Not sure" is a valid answer** that starts at the maintenance floor and lets the app learn them. The effort ceiling (all conversational, every session) is what makes honouring the mileage safe: a high-volume EASY week is not the interference case.

### 6. The week builds around endurance absolutes — `place-week.ts` (BUILT, **NOT WIRED**)
Michael: *"we build around them, that's the whole point."* Long runs, long rides and club days are set by daylight, weather and other people; the four lifting days are solved into what is left. Heavy legs placed first (48h off long days, 24h off quality, apart from each other); upper days take the rest.

**Not built into `_shared/week-optimizer.ts`, deliberately:** its `strength_frequency` is typed `1|2|3` and this is a four-day week, and it has no immovable pin — every anchor it takes is a preference it may overrule. Widening either changes the contract every race plan flows through. The LAW is not duplicated: clearances are imported from `_shared/schedule-session-constraints.ts`.

**The six-hour safeguard.** Stacking is offered only on a day the athlete SAID they can split. Robineau 2016: 0h between lifting and cardio produced lower strength gains; 6h and 24h performed the same. `canSplitDay: undefined` behaves as false — inferring consent from someone accepting a stack is how the app would prescribe the one arrangement shown to make people weaker. `stacksRequired = pins + lifts − 6`, and when it cannot be resolved the athlete gets the honest arithmetic choice, **not an override button**.

### 7. The flow: six steps to four
One goal card (the other five were placeholders); strength assumed and endurance cannot develop (picking develop silently routes the plan somewhere else entirely); no protocol picker (inert, and the confirm screen was reporting the dead choice back as fact); no hours tier (nothing reads it); no length slider (12 is the only length that runs Wendler's ratio, and the slider offered lengths the composer rounds down).

### ⛔ What this SUPERSEDES
- **D-323 stands** — this is its build. Its "the one real change is double progression" is **wrong**: the protocol was replaced outright, and double progression moved to the dumbbell plan.
- **`SPEC-get-stronger.md` §1 is now built** — fold and delete per the spec lifecycle. What survives unbuilt: §1b (the week-12 transition), the 8-week option, the quality-session opt-in.
- **`SPEC-strength-focus.md`** (accessory specialisation) is still the reference for re-homing add-ons to Adjust — but its mechanism changed: an add-on now REPLACES an assistance slot rather than redistributing set counts.

> **↩ Related:** D-322 (the numbers audit this sits on) · D-323 (the scope lock) · D-315 (consent-first; upheld) · D-222 (the retired ceiling — **do not reinstate**) · Q-192 (the registry hole; the phase-vocabulary test is the class fix) · Q-202 (the ledger).

## D-323 — Get Stronger scope lock: omakase strength / à la carte endurance, run-in-miles / bike-in-hours, add-ons out (2026-07-24, DECIDED — not built. Contract: `docs/SPEC-get-stronger.md`)

> **↪ BUILT 2026-07-25 — see D-324.** This entry stands, with one correction: *"the one real change is
> double progression"* is **WRONG**. The protocol was REPLACED, not re-parameterised — the ATR block
> is gone and V1 is Wendler's 5/3/1. Double progression moved to the dumbbell plan. Everything else
> here (omakase strength, à la carte endurance, run-in-miles / bike-in-hours, add-ons re-homed) was
> built as written. Everything below is history.

**Written when decided, not when built** (CLAUDE.md). Nothing in this entry has shipped. It exists because the Get Stronger scope had been re-decided across banners, Q-202 lines and chat with no single home — Michael: *"we need some clarity and part of the problem is the 100000 iterations it took to get here."* **`docs/SPEC-get-stronger.md` is now the only place the scope lives.**

### The governing principle — and it settles design questions, it is not a style note

> **"this whole app will be a sushi menu."** · **"strength is Omakase."** — Michael, 2026-07-24

- **Endurance is à la carte.** The athlete sets volume, days, and whether to keep a quality session. Everything optional is opt-in with its cost stated. Nothing bundled because it seemed nice; nothing on by default because it is cheap.
- **Strength is omakase.** No lift chooser, no split chooser, no seasoning at build time. Baselines + availability in, whole block out.

**Boundary to hold:** the logger's in-session swap / add / weight controls (**D-315**) stay — they are *deviations from* a designed block, not menu choices. **Do not let them grow into a build-time picker.** D-315 is upheld, not superseded.

### The decisions

1. **Get Stronger is a strength block, nothing else.** 8 or 12 weeks, four lifting days, endurance held not trained. One door: the non-race *Add a goal* path.
2. **Accessory-bias add-ons come OUT of the flow** — the Glutes / Hyrox picker (`NonRaceBuilder.tsx:391-408`), the Hyrox fatigued-legs combo, the Upper-A bias slot. **Rejected here on omakase grounds:** they are the athlete reaching into the strength plan. Not deleted as an idea — **the Hyrox bias is SHIPPED and works** — they re-home to their own selectable section later. ⚠️ Michael has a LIVE Hyrox-biased plan; removal must not corrupt stored sessions.
3. **The optional quality session is OFF by default.** Rejected: default-on for anyone with a bike, which is defensible on cost (bike quality is nearly free) but hands over a trade the athlete never chose. Making them choose surfaces it.
4. **Its promise is VO2 maintenance, not race sharpness.** Sharpened from the source spec's *"keep some of your speed."* The smaller claim is the one the research supports; *"base stays"* still may not extend to threshold or race pace.
5. **Swim is a scheduling courtesy.** Get Stronger stops forcing swim to `out`. Days + rough length in, slots booked, nothing prescribed — no yardage, no sets, no drills, no week-to-week adjustment. **The copy must say it is upkeep.** Swim is **not** an option for the weekly quality session (hard swimming competes with upper-body lifting) — which also keeps it honest: we don't claim to train it, so we don't hand them a hard one.
6. **⛔ Run is asked in MILES; bike is asked in HOURS.** The researched call, and the one place a same-shape input would have been wrong.

### Why the units differ — researched 2026-07-24, not picked

| | asked in | why |
|---|---|---|
| **Run** | miles + days | Consumer running products land on miles near-universally (Runna asks weekly mileage + days); races are distances. **And the app already learns a runner's easy pace**, so miles convert cleanly into session lengths. Coaches argue for time ([TrainingPeaks](https://www.trainingpeaks.com/blog/minutes-or-miles-why-you-should-train-by-time-not-distance/): distance pushes people to run harder to finish the total) — the field still ships miles. |
| **Bike** | hours + days | Not close. **~99% of pro riders train on time, not mileage** ([Cycling Weekly](https://www.cyclingweekly.com/fitness/training/distance-versus-time-which-is-best-for-keeping-track-of-your-training-volume)) — terrain and wind distort distance badly. TrainerRoad and every structured cycling platform organise by hours + days. **And `learn-fitness-profile` learns ride HR and FTP but NO ride speed**, so bike miles cannot become a session length without guessing — 20 miles is 65 min flat and 2 h+ in hills. |

**The tension and the resolution.** *"Everyone talks about their 100-mile rides; they don't talk about their five hour rides."* People **talk** in miles and **train** in hours → **ask hours, say miles.** Rides carry distance and duration, so a ride speed is learnable later; show the mile equivalent beside the hours once it is known.

**And the input is a starting position, not a commitment** — Michael: *"modify after you have the meal."* The athlete sees the built week and adjusts it, which takes the pressure off the intake number entirely.

7. **Volume distribution is never asked, always derived.** Athlete gives a total and a day count; the engine divides. Run: long run ≈45% + easy fill (`distributeRunMiles`, unchanged). Bike: long ride takes a **bigger** share (≈half) because easy riding costs far less than easy running — **with a duration ceiling**, since three hours of easy riding is still three hours of legs in a week carrying heavy squats and heavy deadlifts. Long day on the weekend for both (heavy lower is Tue/Fri).

### What this corrects in the existing docs

- **The ENGINE-STATE banner called this a REBUILD.** It is a **re-parameterisation and gap-fill**: `composeStrengthPrimaryPlan` already has the 4-day U/L/U/L split, the exact lift pairing, the five-phase ATR arc, the AMRAP retest and easy-only endurance. **The one real behavioural change is double progression** — the engine ramps the *percentage* weekly at fixed reps; the spec enters at a fixed % and adds *reps*.
- **An earlier banner read Michael's intent as a 2×/wk 5×5 full-body block.** Wrong — written off the protocol's *name* before the spec was read. The spec is four days, upper/lower. Corrected in the banner and in Q-202 line 34.
- **Q-202 line 25's reachability note is wrong.** A barbell athlete with equipment chips or compound 1RMs on file lands on `strength_primary`, not `five_by_five`. **The exposed case is the dumbbell / no-signal athlete** — and they get worse than a bad RIR target: `five_by_five` prescribes Back Squat, Bench, Barbell Row, OHP and Deadlift at %1RM to someone with dumbbells.
- **Q-202 line 34's parenthetical is inaccurate** — `strength-focus-split.ts` **is** in the `getProtocol` switch (`selector.ts:291-294`).
- **The intake already asks the quality question and throws it away.** *"Keep a fixed hard session?"* (`NonRaceBuilder.tsx:462+`) writes `preferred_days.quality_*`; the Get Strong composer never reads it. **Reuse it as the §5 opt-in — do not add a second question.**

### The thing that survives all of it

`resolveProfile()` returns `durability` for any unrecognised key, so a missing entry and a deliberate choice are **indistinguishable at every call site**, with three hand-maintained lists agreeing by hand. Filed **Q-192 (2026-07-19)**, hit again in D-322, root-fixed neither time. **The source spec has no reason to cover this** — it is engine bookkeeping, not a training protocol, and it is the one place to use judgement rather than the spec. **One test asserting the three lists agree + a fallback log line.** Adding an entry ends the instance; the test ends the class.

> **↩ Related:** **D-315** (consent-first weights + swap/add — upheld; the omakase boundary is drawn around it) · **D-322** (the strength-numbers audit this scope sits on top of) · **D-285** (no silent weight writes) · **Q-202** (the working ledger — report line by line, never by topic) · **Q-192** (the registry hole, twice found) · **D-316** (State-as-hub — unrelated; do not confuse the citation, D-322 mis-stamped 23 comments with it).

---

## D-325 — The Session Cost Ledger + Penalty Scheduler: three ordinal axes, ceilings from emphasis, placement by penalty score, and the ledger is SUBORDINATE to the reconciler (2026-07-25, SPEC — not built; **AMENDED 2026-07-26**)

**Michael's spec, verbatim in structure. This entry is the contract; deviations need a new D-NNN.**

> ⛔ **Numbered D-325, not D-268.** The spec arrived labelled D-268 — **already taken** (*"Plan-primary is a
> SYSTEM invariant"*, 2026-07-09, with its own design doc `DESIGN-D268-plan-aware-everywhere.md`). Caught
> before writing. The log was at D-324.

> ## ⛔ AMENDED 2026-07-26 — eight changes, decided by Michael. The sections below are amended IN PLACE; this block is the index.
>
> The spec was checked against the training-science literature and against the code it claims to
> consolidate. **The physiology held. The encoding of it did not, in one specific way, and two stated
> facts were arithmetically wrong.**
>
> 1. **⛔ LAW RECONCILIATION — blocking, do first (§5 rewritten).** `_shared/schedule-session-constraints.ts`
>    and the original penalty table price **different harms** and both encoded them as **symmetric
>    adjacency**. That is the bug. **Interference is DIRECTIONAL.** Penalties are now **ordered pairs**.
>    `schedule-session-constraints.ts` **remains the single law**; the penalty table is a **rendering of it
>    into costs, not a second ranking. Do not fork it.**
> 2. **Mech has one definition (§1).** *Cumulative eccentric tissue loading — force × repetitions*, spanning
>    barbell and running. Run VO2 **stays 3**. The long-run duration split **stays**. The ordinal/cardinal
>    weakness is now logged as a weakness, not defended as a design.
> 3. **Cardio scales with duration (§1).** Long run > 90 min: **3/2/2 → 3/3/2**. The stock week uses the
>    ≤ 90 row, so **no downstream change**.
> 4. **`strength_led` cardio 8 is a DOSE CAP, not an interference guard (§2).** It exists so a strength
>    block does not become a tri block. **Documented so it is never tuned against physiology. Do not raise it.**
> 5. **Breach output must name the argument (§7).** When more than one axis breaches, the output says which
>    axis carries the **real reason** and which is dose. Ranked, both stated.
> 6. **Three corrections to stated fact (§2, §7).** **Bike VO2 alone is LEGAL** — 12/7/9 against 14/8/9; the
>    claim that it was refused was wrong and it is a feature that shipped into intake. **Run VO2 breaches
>    TWO axes**, mech 15/14 *and* cns 10/9, not one. The **§7 example string arithmetic was wrong.**
> 7. **The place-week rationale is RETRACTED (§6).** The stated reason for retiring it — *"walls are why it
>    could return nothing"* — **is false.** It already never returns empty and already emits
>    `compromises: string[]`. It is consolidated because **two placers reading one law is still two placers**,
>    not because it fails. **The real outlier is the hardcoded Mon/Tue/Thu/Fri grid, which ignores the law
>    and wins by default.**
> 8. **The gates are named and reconciled with Q-203 (§8).** *"Breach never refuses"* applies **to the
>    athlete, not to the app's own output.** The two prohibited rules **are hard gates** and are the only two
>    on the strength side.
>
> **What did NOT change:** the three axes, the no-scalar-collapse rule, the cost values other than long-run
> cardio, all three ceiling sets, the reconciler deltas, §4's subordination to `reconcileLoadStatus`, and
> the 6h stack gap. **The bike-mech-0 call and the 6h gap are the two best-supported cells in the model** —
> Wilson 2012 separates modality cleanly (running interferes with strength and hypertrophy; cycling
> essentially does not), and Robineau 2016 found 0h worse while 6h and 24h tied, which is exactly
> `MIN_STACK_GAP_H = 6` already in `place-week.ts:82`.

### Why it exists

Placement in the strength block is decided by **three claimants that have never been reconciled** — the
hardcoded Mon/Tue/Thu/Fri grid in `strength-primary-plan.ts` (wins today by default), `place-week.ts`
(built, 12 tests, **imported by nothing**), and `_shared/week-optimizer.ts` (which `SCHEDULING-RULES.md`
*declares* the sole authority, and which the strength path does not route through). They agree today only
because nothing has stressed them. **A hard conditioning day that must dodge a heavy squat is exactly the
case where they diverge** — and it would work for a week, then fail with no traceable owner.

D-325 is the resolution: **one scheduler that prices sessions and places them by score.** It is not a
fifth opinion — it *absorbs* two of the three.

### 1. Session cost vector — three ordinal values, 0–3, hardcoded

> **⛔ MECH HAS ONE DEFINITION AND THIS IS IT (amended 2026-07-26).**
> **Mech = cumulative eccentric tissue loading — force × repetitions.** It spans barbell and running, and
> it is the axis that drives clearance from lifting.
>
> **The amendment exists because the axis was being used two ways at once.** The long-run duration split
> was justified on **foot strikes** — a cumulative model. Run VO2 then carried mech 3, the same as a 2:30
> long run, on an **intensity** model. One axis, two definitions, and it was the row that does the
> refusing. **Resolved by force × repetitions: run VO2 stays 3** — the force term is high enough at 5K
> pace and faster to carry the row on its own — **and the long-run rows stay split by duration.**
>
> ⚠️ **STATED WEAKNESS, not a defended design.** The model **sums ordinal values, which is a cardinal
> operation on an ordinal scale.** A mech 3 is not "one and a half" mech 2s and the arithmetic pretends it
> is. **This is acceptable only because the ceilings are calibrated EMPIRICALLY against known-good weeks,
> not derived from the axis.** The sum is a bookkeeping device that happens to rank weeks correctly at the
> calibrated point; it is not a measurement. ⛔ **Anyone who later derives a ceiling from the table rather
> than from a summed real week has broken the only thing holding it up.**

| session | mech | cardio | cns |
|---|---|---|---|
| 5/3/1 lower, top set | 3 | 0 | 2 |
| 5/3/1 upper, top set | 1 | 0 | 1 |
| Run VO2 | 3 | 3 | 3 |
| Run threshold | 2 | 2 | 1 |
| Long run ≤ 90 min | 2 | 2 | 1 |
| Long run > 90 min | 3 | **3** | 2 |
| Bike VO2 | 0 | 3 | 2 |
| Bike sweet spot | 0 | 2 | 1 |
| Zone 2 run | 1 | 1 | 0 |
| Zone 2 bike | 0 | 1 | 0 |
| Swim | 0 | 1 | 0 |

> **Long run > 90 min cardio was 2 and is 3 (amended 2026-07-26).** Mech and cns both stepped up with
> duration while cardio held flat, and **metabolic cost is the axis that most obviously scales with time.**
> ⚠️ **The stock `strength_led` week uses the ≤ 90 row, so nothing downstream moves** — the default stays
> **12 / 4 / 7**. The row matters the moment a race plan hosts the block, which is §0.2 of
> `ARCH-strength-spine.md` and still open.

**No formula, no scalar collapse, no exchange rate between axes.** Same shape as the existing
role-weighted exercise table: a visible editorial choice, not a fake measurement. Nothing to defend that
is not on the page.

**Rows are valid only at their spec'd duration.** Quality sessions are fixed-duration — threshold run
45 min, sweet-spot ride 90 min. **Duration must not float**, or the row stops meaning what it says.

⚠️ **Known flattening, accepted:** one row covers both squat and deadlift. **Deadlift is the more
systemically costly lift and Wendler spaces it deliberately.** 5/3/1 runs both regardless, so the
flattening does not change a placement today. Split the row only if a block ever runs one without the other.

### 2. Emphasis ceilings — weekly sum per axis

| emphasis | mech | cardio | cns |
|---|---|---|---|
| strength_led | **14** | 8 | 9 |
| balanced | 10 | 11 | 9 |
| endurance_led | 8 | 15 | 8 |

Ceilings derive from the **active emphasis state only**. No user-configurable ceiling, no slider anywhere.

> ## ⛔ THE ACTIVE EMPHASIS STATE DOES NOT EXIST. Traced 2026-07-26 — `strength_led`, `balanced` and `endurance_led` appear NOWHERE in the codebase.
>
> Not a type, not a constant, not a column — **they live only in this entry and the doctrines.** So the
> sentence above describes a derivation from a state the app does not compute.
>
> **What actually carries emphasis today is `per_discipline_posture`** (`develop` / `maintain` / `out` per
> discipline — `create-goal-and-materialize-plan:1428`, `:2383`). ⚠️ **It does not map cleanly: posture is
> per-DISCIPLINE, an emphasis is per-BLOCK.** Deriving one from the other is unwritten work.
>
> ⛔ **AND `balanced` IS ALREADY TAKEN, in athlete-facing copy.** `load-headline.ts:17` maps the reconciler's
> `on_target` to the word **"balanced"** on the LOAD row (`LoadBar.tsx:38`, `CoachWeekTab.tsx:1019`). **Ship
> an emphasis called `balanced` and the app has two — one a verdict about this week's load, one a
> description of the block.**
>
> ⚠️ **§4 forbids the ledger emitting a load verdict. Two things called `balanced` is that boundary crossed
> in the VOCABULARY instead of the code — which is worse, because it looks fine in every diff.**
> ⛔ **Rename before build.** *(Same class as this entry arriving numbered D-268, which was taken. That was
> caught by reading the log; this one nothing would have caught — the ledger and the load row never meet.)*
>
> **Consequence for Q-205:** the two "unvalidated" ceiling sets cannot be validated yet — **there is no
> default week to sum for an emphasis that does not exist.** `strength_led`'s numbers stay the only
> calibrated set. See Q-205.

> **The strength_led mech ceiling was 12 and is 14, and the reason is the method.** Summing the composer's
> ACTUAL default week — 2 lower (6) + 2 upper (2) + long run (3) + 2 easy runs (2) — gave **13 against a
> ceiling of 12**: a known-good week breaching before the athlete adds anything. Michael's call: *"the
> model is wrong, not the week."* Two fixes: the long-run row split by duration (mechanical load scales
> with foot strikes — one row for a 70-min maintenance run and a 2:30 build run was always wrong), and the
> ceiling to 14. Default now lands **mech 12/14, cardio 4/8, cns 7/9** — two units of headroom. **That
> gradient is the intended behaviour.** *(This note originally said "a threshold run lands exactly at the
> ceiling, a run VO2 breaches by 1." The first half is right; the second was wrong on the count. Corrected
> in the matrix below, 2026-07-26.)*

> **⛔ `strength_led` cardio 8 is a DOSE CAP. It is NOT an interference guard (amended 2026-07-26). DO NOT RAISE IT.**
>
> It exists for one reason: **so a strength block does not quietly become a triathlon block.** It is a
> statement about what the athlete signed up for, not a claim about physiology.
>
> **This has to be written down because the number does not behave like an interference guard and will be
> "corrected" by someone who assumes it is one.** Two bike quality sessions cost the barbell **nothing**
> mechanically — `Bike VO2` and `Bike sweet spot` are both mech 0, which is Wilson 2012 encoded honestly —
> and the pair still breaches, on cardio. Read as physiology that looks backwards. **Read as dose it is
> exactly right: three hard sessions in a strength block is a different block.**
>
> ⚠️ **The interference argument on that same pair lives on the cns axis, not this one.** See §7 — when both
> breach, the output must say which one is the argument.

#### The full opt-in matrix for `strength_led` — corrected 2026-07-26

> ## ⛔ HALF THIS TABLE IS NOW UNREACHABLE BY CONSTRUCTION — read before tuning anything from it.
>
> **`DOCTRINE-aerobic-maintenance.md` §6 (decided 2026-07-26) allows a strength-led block EXACTLY ONE hard
> aerobic session.** Bike if the athlete has one, hill repeats if not. **"Both" means a choice, not two.**
>
> **This is a state the DOCTRINE closed, not one the ledger closed** — which means the multi-quality rows
> below are **unreachable by construction on `strength_led`**, not merely unreached in practice. ⛔ **They
> remain live and correct for `balanced` and `endurance_led`, where two qualities is still a real
> configuration.**
>
> ### And the consequence for the ceiling itself, stated plainly:
>
> > **`strength_led` 14 / 8 / 9 does NOTHING at `on_target`. No verdict, no placement change, no refusal.**
>
> **Every ceiling in this system was calibrated to bind at exactly one margin — the second quality session —
> and on this block that margin no longer exists.** Any single quality fits with room.
>
> ✅ **What survives is `elevated` and `high`, where the STOCK WEEK ITSELF breaches, and that was always the
> more honest job for it:** the ledger's remaining function on a strength block is to notice that **the BASE
> is too much — not that the extras are.**
>
> ⚠️ **Do not read the inert ceiling as a calibration failure and "fix" it by lowering it.** It is inert
> because the doctrine upstream removed the case it was built to catch. **Lowering it would make the stock
> week breach at `on_target`, which is the exact error `strength_led` mech 12 → 14 corrected.**

Stock week **12 / 4 / 7** against ceilings **14 / 8 / 9**.

| athlete opts into | week lands at | verdict |
|---|---|---|
| nothing (stock) | 12 / 4 / 7 | legal — headroom 2 / 4 / 2 |
| sweet-spot ride alone | 12 / 6 / 8 | legal, room to spare |
| threshold run alone | 14 / 6 / 8 | legal — **mech exactly at ceiling** |
| **bike VO2 alone** | **12 / 7 / 9** | ✅ **LEGAL — cns exactly at ceiling** |
| threshold run **+** sweet-spot ride | 14 / 8 / 9 | legal — **at ceiling on all three axes** |
| threshold run **+** bike VO2 | 14 / 9 / 10 | breach: cardio +1, cns +1 |
| sweet-spot ride **+** bike VO2 | 12 / 9 / 10 | breach: cardio +1, cns +1 |
| **run VO2**, alone or with anything | **15 / 7 / 10** | breach: **mech +1 AND cns +1** |

⛔ **Two corrections, both load-bearing:**

1. **Bike VO2 alone is LEGAL.** The source spec said *"Bike VO2 → CNS 10, also refused."* **That is only
   true when it is the SECOND quality session** — on its own it lands at exactly 9. **This matters because
   bike VO2 is a feature that shipped into intake**; the ledger permits it, and an implementation that
   refuses it would break something already offered to the athlete.
2. **Run VO2 breaches TWO axes, not one.** mech 15/14 **and** cns 10/9. Both source and this entry said
   mech only. §7's ranking rule now governs what the athlete is told.

⚠️ **`balanced` and `endurance_led` are UNVALIDATED** — neither has been summed against its own default
week the way `strength_led` was. **Pending calibration (Q-205).** Do not trust them until that sum is done.

### 3. Reconciler deltas — applied uniformly to all three axes

| reconciler state | ceiling delta |
|---|---|
| `under` | +2 |
| `on_target` | 0 |
| `productive` | 0 |
| `elevated` | −2 |
| `high` | −4 |

**Bound to the five states `reconcileLoadStatus` actually emits** (`load-status-reconcile.ts:42`).
⛔ **The spec originally said amber/red. THOSE STATES DO NOT EXIST.** Do not invent them or any
intermediate. `under` grants headroom because it is real capacity — but it can never *cause* a session to
be added; it only stops a normal week being called over-budget.

### 4. Ledger ↔ reconciler boundary — THE LAW is unchanged

- `reconcileLoadStatus` remains **sole authority** on athlete load state (D-260).
- The ledger is **scheduling-scope only**. It reads reconciler output, **never writes load claims, never
  emits a status string.**
- **No ledger output may be surfaced as a load verdict.** Two governments is the failure this app has
  spent a month removing.

### 5. Penalty scheduler — score every candidate week, take the minimum, never return empty

> ## ⛔ REWRITTEN 2026-07-26 — INTERFERENCE IS DIRECTIONAL, AND THE LAW IS NOT THIS TABLE
>
> **The original table and `_shared/schedule-session-constraints.ts` price different harms, and both
> encoded them as SYMMETRIC ADJACENCY. That is the bug.** It surfaced as an apparent inversion: the law's
> **strictest** single clearance — *after `lower_body_strength`, 48 hours before `quality_bike`*
> (`schedule-session-constraints.ts:374`, §4.4 cycling-power impairment 24–48h post-heavy-lower) — was the
> **cheapest** row in the penalty table, at +1 and 0.
>
> **Both were right about their own direction and wrong to be symmetric:**
>
> - **Bike quality AFTER lower-body strength is expensive.** Cycling power is impaired 24–48h post-heavy-lower
>   (Robineau 2016, Petré et al. 2021). **The existing law is correct.** The ride is the session that suffers.
> - **Lower-body strength AFTER bike quality is cheaper.** ⚠️ **This half rests on a CONTESTED claim and
>   must not be written as settled** — see the boxed warning below. The order should still be preferred; it
>   should not be priced as free.
> - **Run VO2 is expensive in BOTH orders.** It interferes bidirectionally: eccentric damage degrades force
>   production going forward, and pre-fatigued legs degrade the interval session going back.
>
> ### ⛔ `_shared/schedule-session-constraints.ts` REMAINS THE SINGLE LAW.
>
> **The table below is a RENDERING of that law into costs. It is not a second ranking. DO NOT FORK IT.**
> When a clearance in the law changes, this table is regenerated from it — never edited beside it. A
> penalty that cannot be traced to a clearance in the law is a bug in this table, not a new rule.
> **The law is also what the race-side optimizer reads**, so forking it re-ranks the physiology on one side
> of the app only — which is the failure this whole entry exists to prevent.

**Ordered pairs, first → second, on consecutive days. `lower` = a lower-body 5/3/1 day.**

| ordered pair (first → second) | penalty | traced to |
|---|---|---|
| `lower` → run VO2 | +6 | leg-dominant quality ≥ 24h; legs pre-damaged, the interval session is degraded |
| run VO2 → `lower` | +6 | **bidirectional** — eccentric damage from fast running impairs force production |
| `lower` → long run | +3 | leg-dominant long ≥ 48h; mech stacks and the run is degraded |
| long run → `lower` | +3 | glycogen depletion + muscle damage on top of the signalling window |
| `lower` → run threshold | +2 | leg-dominant quality ≥ 24h, same prime movers at intensity |
| run threshold → `lower` | +2 | same, lower magnitude than VO2 |
| **`lower` → bike VO2** | **+4** | ⛔ **the law's strictest rule** — 48h, cycling-power impairment 24–48h post-heavy-lower |
| **`lower` → bike sweet spot** | **+3** | same 48h clearance, submaximal so less power-dependent |
| **bike VO2 → `lower`** | **+1** | the cheap order — ⚠️ **+1 not 0, see the citation warning below** |
| **bike sweet spot → `lower`** | **+1** | same — **the scheduler should prefer this ordering; it must not price it as free** |

> ## ⛔ THE REVERSE-ORDER DISCOUNT RESTS ON A CLAIM THIS REPO ALREADY DOWNGRADED. Corrected 2026-07-26, same day it was written.
>
> **The cheap-order rows were first written as `0`, cited to Wilson 2012 — *"cycling does not attenuate
> strength adaptation."* That citation was checked against this repo's own register and does not carry the
> weight that was put on it.**
>
> `SCIENCE-concurrent-training-interference.md`, **2026-07-19 addendum**: Wilson 2012 found the modality
> split, but **Schumann et al. 2022 (*Sports Med*, 43 studies, larger and better-controlled) found NO
> modality moderation** — results independent of aerobic mode, frequency, training status and age. The
> register's verdict is explicit and it is a standing instruction: **"Treat as a plausible mechanism with
> split meta-analytic support, not a settled rule… do not cite it as established, and do not build a NEW
> claim on it."**
>
> **A `0` is a new claim built on it.** It asserts the order is free, which is the **non-conservative**
> direction of a split question — the register's tolerance for the existing rule is that it *errs safe*, and
> asserting no cost does not. **Priced at +1: still by far the cheapest ordering, still actively preferred
> by the scorer, no longer a claim the evidence cannot carry.**
>
> ⚠️ **The expensive direction is UNAFFECTED and stays at +4 / +3** — but ⛔ **its citation was wrong too,
> corrected the same day.** *"Cycling power impaired 24–48h post-heavy-lower"* was attributed to **Petré
> 2021, which is a strength-development meta-analysis by training status and contains nothing on clearance
> windows.** Same bad attribution sits in `schedule-session-constraints.ts:28` and `week-optimizer.ts`
> (×3) — see `DOCTRINE-aerobic-maintenance.md` §3 sweep box.
>
> **What actually carries the expensive direction:** Robineau 2016 (0h worst, 6h suboptimal), Schumann 2022
> (attenuation **especially same-session**), and soreness from strength work impairing endurance
> performance up to 72h. ⛔ **The asymmetry survives on those. Do not weaken a placement because its
> citation was bad — replace the citation.**
>
> ### ⚠️ AND THE REASON FOR THE WHOLE PENALTY TABLE DOWNGRADED ON 2026-07-26 — the magnitudes were never re-derived
>
> **Schumann 2022: concurrent training does not compromise hypertrophy or maximal strength.** Explosive
> strength may be attenuated, especially same-session, **independent of modality. 5/3/1 is maximal-strength
> work** — so the adaptation this table was built to protect is **not** being blunted the way the penalties
> imply.
>
> **The placements survive on a different argument: separate the sessions so the athlete PERFORMS WELL IN
> EACH.** A hard ride 24h after a heavy squat is a worse ride, and that is reason enough. **Same placement,
> weaker claim — a downgrade in *why*, not in *what*.**
>
> ⛔ **These penalty magnitudes were sized against adaptation blunting and have NOT been re-derived against
> session quality, which is a real cost but a smaller one. Assume they bite too hard until re-checked.**
>
> *(The register also notes the reverse relationship — strength training improving running economy and
> cycling efficiency with VO2max unchanged — is **the best-supported material in the domain**, and that the
> honest frame for a hybrid app is **credit, not hazard** (D-306). That is the claim to lean on, not this one.)*

**Non-directional — these price the gap or the density, not the order:**

| conflict | penalty |
|---|---|
| Same-day double under 6h apart | +4 |
| Same-day double, non-emphasis quality first | +2 |
| Two consecutive days at cns ≥ 2 | +2 |

> **The 6h row is genuinely non-directional and that is Robineau, not an oversight.** The finding was about
> **the gap**: 0h produced lower strength gains, **6h and 24h performed the same as each other.** Order
> within a split day is handled by the emphasis rule below; the gap is handled here. Already encoded as
> `MIN_STACK_GAP_H = 6` in `place-week.ts:82`.

⚠️ **The two bike-after-lower magnitudes (+4 / +3) are the one place this table was AUTHORED rather than
derived.** The law states a single 48h clearance for `quality_bike` without splitting VO2 from sweet spot;
the split preserves the distinction the original table drew (+1 / 0) while correcting its direction.
**If that split is wrong, it is wrong here and nowhere else.**

Non-zero total is **allowed and surfaced**. Within a same-day double, **the quality matching the active
emphasis goes first**.

> **Placement is pin-first, and that is Michael's framing:** *"we need to get out of days-of-the-week
> headspace — we move the strength to accommodate long runs / rides and social groups."* Endurance
> absolutes and other people's sessions are the fixed points; the lifting is what moves.

### 6. Consolidation — what this retires

> ## ⛔ THE ORIGINAL RATIONALE FOR RETIRING `place-week.ts` IS RETRACTED (2026-07-26). The consolidation stands; the reason given for it was false.
>
> It said: *"Walls are why it could return nothing; costs are what makes 'never empty' achievable."*
> **Read the file. It does not have walls, and it already never returns empty.**
>
> - It already emits **`compromises: string[]`**, with a comment stating that every clearance it could not
>   honour must be named in plain words and ⛔ **NEVER SILENTLY SWALLOWED** (`place-week.ts:123-127`) —
>   *"quietly producing a worse plan is how a scheduler lies."*
> - It already degrades rather than fails: when no full rest day survives, it **places the week and says so**
>   (`:329`).
> - **It is already a cost model.** The rationale was describing a different file.
>
> **And it is NOT an independent authority on the physiology.** `place-week.ts:25` says so itself: *"What is
> NOT duplicated is the LAW. The clearance rules come from `_shared/schedule-session-constraints.ts` — the
> same table the optimizer reads."*
>
> ⚠️ **Which means `ARCH-strength-spine.md` §0.6's "three placement authorities" overstates the disorder.**
> The true shape is **two placers reading one shared law, plus one hardcoded grid that reads nothing.**

- **`place-week.ts` is CONSOLIDATED, and the honest reason is that two placers reading one law is still two
  placers** — not that it fails. Its adjacency rules are re-expressed as the §5 ordered pairs; **the intents
  survive unchanged and the direction is corrected.** Its 12 tests re-point accordingly. ⛔ **Do not carry
  the retracted "walls" reasoning forward into the build** — it would justify discarding the
  `compromises[]` contract, which is the part worth keeping and is the same contract §7 requires.
- **⛔ THE REAL OUTLIER IS THE HARDCODED Mon/Tue/Thu/Fri GRID in `strength-primary-plan.ts`, and it is the
  one that wins today by default.** It ignores the law entirely — no clearance table, no compromises, no
  pins. **That is the thing being replaced.** The scheduler owns placement.
- ⛔ **Race plans retain `week-optimizer.ts`. THIS IS A DEFERRAL, NOT A DESIGN.** Recorded explicitly at
  Michael's instruction, because *"otherwise it reads as intentional in six months and nobody merges it."*
  **Direction of travel: race plans converge on the same scorer.** Two schedulers with a written direction
  is acceptable; three with no owner was not.

### 7. Breach behaviour — states cost, never refuses

- **Ceilings are budgets, not gates.** The solver runs regardless, places the week, and reports the
  overdraft per axis.
- Breach output names **the axis, the overage, and the largest contributing sessions on that axis**.
  Shape: *"Mech 15 of 14 — both lower lifts and the run VO2 are 9 of it."*
  > ⛔ **The example string was arithmetically wrong and is corrected (2026-07-26).** It read *"the long run
  > and both lower lifts are 11 of it"* — two lower lifts are 6 and the long run is 2, which is 8, not 11.
  > The actual top contributors to a mech-15 week are **the two lower lifts (6) and the run VO2 (3) = 9.**
  > **This string is the template the athlete-facing copy will be built from. It has to add up.**

> ## ⛔ WHEN MORE THAN ONE AXIS BREACHES, THE OUTPUT MUST NAME WHICH ONE IS THE ARGUMENT (added 2026-07-26).
>
> **State both. Rank them. The real reason goes first.** A list of breached axes with no ranking hands the
> athlete arithmetic and makes them do the reasoning — and they will reason from the wrong number.
>
> **Worked case — the second bike quality** (sweet spot + bike VO2 → 12 / 9 / 10). ⚠️ **Drawn from
> `balanced` / `endurance_led`, where two qualities is reachable — `strength_led` allows one hard aerobic
> session only (`DOCTRINE-aerobic-maintenance.md` §6). The RANKING RULE is general; only this illustration
> is configuration-specific:**
> - **cns 10 of 9 is THE ARGUMENT.** It is a third hard day in a strength block. That is the real objection.
> - **cardio 9 of 8 is DOSE** (§2) — a statement about what block they signed up for, not about interference.
>
> ⚠️ **Get this backwards and the app says "your cardio is too high" to an athlete whose actual problem is a
> third hard day** — and they will fix it by shortening the ride, which changes nothing that matters.
>
> **General rule: mech and cns carry interference arguments. Cardio carries dose.** When cardio breaches
> alongside either of the others, **cardio is never the headline.**

- **Breach affects placement, not admission**: penalty weights increase on the breaching axis so the
  arrangement degrades gracefully instead of the week being rejected.
- **Never silently remove or shrink a session to fit.** The athlete added it; the app says what it costs.

> **This is the same call as every retired cap.** D-222's ceiling was retired for refusing; the volume band
> replaced it by stating the trade. *"A cap that refuses is a cap. A number that states the cost is a
> trade."*

### 8. Composer posture — regulated; overrides libertarian

> ## ⛔ THE GATES, NAMED — and this reconciles §7 with Q-203 (added 2026-07-26).
>
> **"Breach never refuses" applies TO THE ATHLETE. It does not apply to the app's own output.** Those are
> two different actors and conflating them is why this entry read as if it had no gates at all.
>
> - **The composer declining to auto-generate a breaching week is the app refusing to propose what it will
>   not defend.** That is not a cap on the athlete. It is the app declining to put its own name on a week
>   it would have to argue against. **The athlete may always force it, with the confirm below.**
> - **The two prohibited rules are HARD GATES, and they are the only two on the strength side.** Not budget
>   lines, not penalties — refusals. Naming them as gates is the point; an unnamed gate is the one that gets
>   deleted by someone who read §7 and concluded nothing here refuses.
>
> ⚠️ **Q-203 is filed on the premise that the strength side has no hard gates and only race plans need them.
> That premise is now corrected — the strength side has exactly two.** The open question is narrower than it
> was written: **not "does strength need gates" but "does race need MORE than these two, and of what kind."**
> Back-annotated at Q-203.
>
> ### The `high` case, decided — this was the line the source spec asked for and the first write-up lost
>
> At reconciler `high` the deltas take `strength_led` to **10 / 4 / 5** while the stock week is **12 / 4 / 7**.
> **The default week breaches on mech and cns before the athlete has added anything.** That is not a
> calibration failure — *the model is wrong, not the week* does **not** apply here, because the ceiling is
> being deliberately pulled down by the athlete's own load state.
>
> **The decided behaviour: every week at `high` requires the confirm.** The composer will not auto-generate
> it, because at `high` it will not defend it. **That is the app saying your baseline is too much right
> now** — which is the correct thing for it to say, and it says it without removing anything.
>
> *(At `elevated` the behaviour is already clean and needs no rule: ceilings 12 / 6 / 7 against a stock week
> of 12 / 4 / 7 fill mech and cns exactly, so quality drops out on arithmetic alone. **That is the design
> working.**)*

- The composer **will not auto-generate a breaching week.** The athlete may force it with an explicit
  confirm **that shows the axis arithmetic before acceptance.**
- **Manual overrides and logged actuals are never blocked** — priced and placed, always.
- **The prohibited list is exactly two rules. No more:**
  1. Run VO2 within 24h of a lower-body 5/3/1 session at reconciler state `high`
  2. Any quality session at reconciler state `high` where the default week already breaches
- Opting into **both** a quality run and a quality ride must surface that the week has **zero remaining
  headroom on all three axes BEFORE acceptance**, not after.
  > ⛔ **SCOPE CORRECTED 2026-07-26 — this clause is UNREACHABLE on `strength_led` and LIVE on the other two.**
  >
  > It originally read *"on a `strength_led` block."* **`DOCTRINE-aerobic-maintenance.md` §6 allows that
  > block exactly ONE hard aerobic session**, so an athlete can no longer opt into both there. **The clause
  > stays — `balanced` and `endurance_led` still permit two qualities, and it is correct for them.**
  >
  > ⚠️ **This is why it was re-scoped rather than left alone.** *A rule describing a state nobody can reach
  > is the thing that gets tuned in six months by someone who assumes it fires.* ⛔ **Do not read a rule
  > that never triggers on `strength_led` as evidence it is broken.**

> ### ⛔ THE DOWNSTREAM BAR — what is actually left to build (Michael, 2026-07-26)
>
> *"We just need to build the downstream bar — react to the user — gate the ability to build a crazy weekly
> schedule."*
>
> **The ledger prices. The bar is what the athlete meets.** Everything above is the model; none of it is
> reachable by a person yet. The build is: the intake reacts as options are taken, the arithmetic is shown
> **before** acceptance rather than reported after, and a week that cannot be defended cannot be built
> without the athlete explicitly taking it on. ⚠️ **That surface does not exist** — the intake collects a
> hard day per discipline today and says nothing back about what it costs together.

### 9. Reconcile against actuals

- Ingest **recomputes the vector from what was executed, not what was planned.**
- A Zone 2 run that drifted to threshold recosts **1/1/0 → 2/2/1**.
- Overdraft **debits the remaining days' ceilings** for that week.
- ⛔ **Never retroactively flag a completed session as invalid.**

⚠️ **KNOWN RISK, and it fails quiet.** The recost depends on `time_in_zone` / `hr_drift_pct`, which are
exactly the fields the **documented ingest race** can drop (`compute-facts` is awaited but reads
`workouts.computed`, written by two fire-and-forget calls — see `CLAUDE.md` Topology). When the race is
lost, a drifted Z2 run recosts as 1/1/0 and the overdraft never happens. **The failure is silent and
always in the same direction: under-costing.**

### 10. Out of scope for D-325

- **Personal calibration of cost weights.** Ship the fixed table. Months of clean data are needed, and
  *"you can't distinguish 'this athlete tolerates load' from 'this athlete under-reported.'"*
- Any scalar / weighted-sum collapse of the three axes.
- Merging the race-plan scheduler (§6 — deferral, direction recorded).

> **↩ Related:** **D-260** (THE LAW — the reconciler is the sole verdict authority; §4 is subordination to
> it) · **D-222** (the retired volume cap — §7 is the same call) · **D-324** (Strength Focus V1, the block
> being scheduled) · **D-317/D-318** (multi-sport load + strain, which is what `elevated`/`high` now mean)
> · **`ARCH-strength-spine.md` §0.6** (the three-authorities problem this resolves).

---

## D-326 — SUPERSEDED: BUILT THEN REMOVED IN ONE DAY

> ⛔ **BUILT by [D-338] (2026-07-30) and REMOVED by [D-344] the same day.** The three-word difficulty
> tap no longer exists — `src/components/StrengthLogger.tsx:5556` carries the deletion note. Nothing on
> the advance path ever read `difficulty`; the verdict that moves the bar reads the REP COUNT.
> ⚠️ Layer 2 of the table below ("wire `verdictFrom95Set`") WAS built — see [D-341]. Everything below
> is history; do not treat it as the current plan.

## D-326 (original) — Per-set difficulty replaces the RIR prompt on the barbell block: three words on the complete tap, feeding the BODY read and never the 1RM estimate (2026-07-25, SPEC — not built) ⟨A31⟩

### The hole this fills, and it was found by tracing not guessing

Michael asked whether AMRAP sets give the app enough of a read on strength to keep an eye on the athlete.
**They do not, and the reason is worse than expected.**

- **`wendler-531.ts:61` — `amrap: kind === 'anchor' && !isDeload && i === 2`.** AMRAPs exist **only in the
  anchor cycle, and not on its deload.** In a 12-week leader/leader/anchor block that is **weeks 9, 10 and
  11. Nothing in weeks 1–8.**
- **And e1RM on a leader week is the plan quoting itself.** `brzycki1RM(weight, reps, rir)` is
  `effectiveReps = reps + rir` (then `brzycki1RM`; the function is now `estimated1RM`, `compute-facts/index.ts:143`, and the formula became Wendler/Epley in D-339 — `src/lib/estimate-1rm.ts:56`, so the multiplier below is ×1.167 today, not ×1.125). With RIR scoped off by D-324, an athlete ⟨A31⟩
  who does the prescribed 5 reps at the prescribed weight yields `weight × 1.125` — **a pure function of
  the prescription.** It rises every cycle because the plan raises the bar, whether they are thriving or
  barely holding on. **It carries athlete information only when they MISS.**
- The trend itself is session-to-session with a 2.5 lb dead band (`analyze-strength-workout.ts:688-727`) —
  no multi-point fit, and under 5/3/1's weekly percentage changes it swings by design.

**So on a leader/leader/anchor block the strength gauge is close to blind for eight of twelve weeks, and nothing said so.** ⚠️ **NOT EVERY BLOCK IS THAT SHAPE** — `leaderCount` (`wendler-531.ts:291`) returns 0 leaders for a continuity-'continuous', 'develop', <16-week block, so every cycle is an anchor and AMRAPs land in 9 of 12 weeks. The 8-of-12 case is the 'unknown'/'detrained' tier, a 16-week block, a non-'develop' posture, or `highAerobicLoad`. ⟨A31⟩

### The decision

**The top set completes with one of three words instead of a tick.** Label: *"Select difficulty to mark
done."*

> **Moved well · Worked for it · Grind**

- **Top set only.** Asking how a 65% opener felt is information-free — the athlete was told to leave reps
  in the tank, so the answer is always "easy". **Four taps a session**, two on the lower-body days that
  carry the real cost.
- **It replaces a two-step flow with one.** Today completing a set opens a RIR prompt, then a confirm
  (`StrengthLogger.tsx:827-831` state, `:3582` handlers). Michael: ⟨A31⟩ *"we have a two-step process now — forced RIR pick and then
  hit done. This is smoother."* **The tap the athlete was already making becomes the answer.**

### Why words, not a number — and this is field practice, not preference

Numbers (RPE 6–10 in half points, RIR 0–4) are standard **where the answer drives load** — Juggernaut,
Hevy, Strong. That precision exists because the number sets next week's weight. **It does not here: 5/3/1
already dictates the weight.** The apps that optimised for people actually answering moved to plain
language — **RP's app runs the most aggressive auto-regulation in the industry and asks in words**
(none / low / moderate / high), because a lifter mid-set does not reliably separate an 8 from an 8.5.

Ten points of scale to detect *"this is trending wrong"* is precision we cannot use and cannot defend.
And **"RIR" is jargon by `COPY-VOICE.md` rule 9.**

### ⛔ THE THREE RULES THAT KEEP IT FROM BECOMING THE BUG D-324 REMOVED

1. **It NEVER feeds `brzycki1RM`.** D-324 killed RIR because it was **auto-filled** and then entered the
   1RM maths — a suggested number on a deliberately submaximal opener came back out as a much heavier
   lift. **The bug was never "asking how it felt." It was a guess entering the arithmetic.**
2. **Never auto-filled. Blank is a legal answer.** No value the athlete did not choose.
3. **Stored as a plain ordinal, never rendered back as a number.**

### Where it lives — no migration required

- Sets already persist as **JSON** on the workout (`workouts.strength_exercises`, carrying reps/weight/rir
  per set), so `difficulty` rides alongside. **No new column.**
- The aggregate lands in `strength_facts` (a `Record<string, any>` in `compute-facts`) — **also JSON, also
  no column.**
- **The consumer already exists and is idle:** the reconciler watches `BodyTrends.strength`
  (`load-status-reconcile.ts:55-60`), which reads the RIR trend and is deliberately excluded for
  strength-primary (D-318 — declining RIR in a strength block is the *intent*, not strain). **Difficulty
  replaces it as that input.** The wiring has been sitting there unfed.

### ⛔ THREE FAILURES, THREE FIXES — and shipping the tap does NOT close the other two

**The single most likely misreading of this entry**, and Michael named it before a line of logger code
was written: *"it'd be easy to ship the tap and feel like the blindness got solved."* It would not be.

| # | failure | fix | status |
|---|---|---|---|
| 1 | **No continuous signal.** Weeks 1-8 have no measured input at all. | **The tap** (this entry) — a weekly athlete-sourced reading from week one. | D-326 |
| 2 | **The number issued itself.** `workingNumberForCycle` (`wendler-531.ts:210`) advances by cycle index. The plan raised the bar, then reported the bar back as fitness. | **Wire `verdictFrom95Set`** (`wendler-531.ts:454`, with `applyVerdict` at `:467`) into the advance path. Five at 95% or the number comes down 10%. | ✅ **BUILT — D-341 (2026-07-30).** Supplier: `loading/cycle-verdicts.ts:116`; consumer: `workingNumberForCycles` (`wendler-531.ts:519`) via `strength-primary-plan.ts:1275` and `rematerialize-strength-block/index.ts:167` | ⟨A31⟩
| 3 | **The number hides its age.** Even once earned, between gates it is rendered as current with no fresh measurement behind it. | **Provenance on the surface** — *earned at week 3, unmeasured since* is true; a bare `325` is not. | NOT BUILT |

**They are not interchangeable and they do not substitute for each other.**

- The tap makes the mirror **higher-resolution**. It does not make it a gauge.
- The verdict makes the number **earned**. It does not make it **fresh**.
- Both can ship and the screen can still read `325` flat with nothing indicating it is five weeks old.

**#3 is Laws 2 and 3, by name** — *measured and inferred never wear the same clothes*, and *confidence
travels with every inference, all the way to the surface*. ⚠️ **And it is a pattern this app already
owns on the run side** — learned vs entered baselines are rendered differently, with suggest-and-confirm
rather than a silent overwrite (`AthleticRecordPage.tsx` `SuggestionLine`, D-303's noise-guarded verdict).
**Reuse that rendering. Do not invent a second provenance vocabulary.**

⛔ **Do not mark the strength-gauge blindness closed until all three have shipped.**

### ⚠️ THE SERVER HALF IS NOT A PORT — the plumbing exists but is shaped around RIR

**Michael, 2026-07-25 (deferred): *"we have to plug it into state — the plumbing is there, it's tuned
to RIR so we will have to finesse. Not tonight's work."*** Read this before starting it; the naive wiring
is wrong in three separate ways.

**1. The existing signal is ACTUAL-vs-PRESCRIBED, and difficulty has no prescription.**
`longitudinal-signals.ts:540-570` builds a map of *prescribed* RIR per lift (`buildPrescribedRirByName`)
and flags when logged `avg_rir` sits ≥0.9 below it. **5/3/1 prescribes a weight and a rep count. It does
not prescribe a feel.** There is nothing to compare a difficulty against, so the whole comparison model
has to be replaced, not re-pointed.

**2. Difficulty RISING inside a cycle is the program, not a warning.** Percentages climb 65 → 95 across
weeks 1-3 and reset on week 4 (`PCT_BY_WEEK`). A raw slope would flag **every athlete, every cycle,
forever** — the same shape as the false "pull back" D-318 removed, where declining RIR in a strength
block was read as strain when it was the intent.

**⛔ The comparison must be LIKE-FOR-LIKE: same week-in-cycle, across cycles.** Week 3 of cycle 2 against
week 3 of cycle 1 is the same *relative* load at a heavier absolute weight — which is precisely the
question worth asking, *is the working number still honest*. **And it lands on the same set as Wendler's
95% gate**, so the two signals corroborate rather than compete.

**3. The consumer is one boolean.** `coach/index.ts:5824` — ⟨A31⟩
`strength: { declining: weeklyResponseModel.strength.overall.trend === 'declining' }`. That feeds
`BodyTrends.strength`, which `computeDecliningSignals` currently **excludes** for strength-primary
(D-318). Re-including it is a one-line change **and must not happen until 1 and 2 are solved** — it would
reinstate the exact false-strain bug D-318 fixed, on a different input.

### What it makes possible

The question Michael actually asked — *when do we tell someone to drop a quality session?* — needs **two
independent observers agreeing**: missed reps on a lower-body lift **and** the reconciler at `elevated` or
`high`. Either alone is a Tuesday. Difficulty gives the first observer a weekly voice from **week one**
instead of week nine.

> **↩ Related:** **D-324** (scoped RIR off — this is the replacement signal, not a reversal; see the
> back-annotation there) · **D-318** (why the strength body-trend is excluded for strength-primary) ·
> **D-315** (consent-first: nothing is written the athlete did not choose) · **D-325** (the ledger that
> consumes reconciler state).

---

## D-327 — One hard aerobic day: the second one is GREYED, not warned. The intake gate for the aerobic-maintenance doctrine (2026-07-26, BUILT — client, not device-seen)

**Michael's spec. The doctrine decided the rule; this is where an athlete meets it.**

> **The spec, verbatim:** *"Step 5 follows step 4. If a hard run day was set in step 4, grey the Hard ride
> day section. Note in place of the day chips: 'You've got a hard run Tuesday. One hard day a week — pick a
> ride instead and we'll clear the run.' [Pick a hard ride day]. Tapping it: show the chips, athlete picks
> a day, clear the hard run day."*

### Why it is a GATE and not a price — the first one in this flow

`D-325 §7` is emphatic that **breach states cost and never refuses**, and `POLISH-PUNCH-LIST` records
Michael's rule *"gate it, don't warn it — no accept-the-risk button."* **Those are not in tension here.**

`DOCTRINE-aerobic-maintenance.md` §6 allows a strength-led block **exactly one hard aerobic session** —
bike if the athlete has one, hill repeats if not. **"Both" means a choice, not two.** That is a doctrine
decision, not a budget one, so it is enforced by **construction** rather than priced.

⛔ **It is legitimate to refuse here ONLY because the swap is one tap away.** The athlete is never stuck
and never has to back out: they tap a day on the greyed section and the other discipline's day is released
for them, in a single state write. **Steered, not blocked.** A gate that made them go back a screen to
change their mind would be the accept-the-risk button wearing different clothes.

### The offer is NOT neutral, and that is the doctrine

The note says the ride is the one worth keeping, and says **why**: *hard riding costs your legs less than
hard running does.* **The athlete with both modalities who keeps the run is making the worse choice, and
the app knows it.** Stating the reason is what separates a steer from a nag — and it is
`COPY-VOICE`-shaped: fact, then the conditional consequence, no imperative.

*(⚠️ The mechanism behind "costs your legs less" is the modality separation that
`DOCTRINE-aerobic-maintenance.md` §5 records as **CONTESTED** — Wilson 2012 vs Schumann 2022. The copy
says "costs less", never "costs nothing", which is the claim the evidence supports.)*

### Symmetric, though the spec named only one direction

Running is step 4 and Bike is step 5, so **forward-only greying looks sufficient.** It is not: **tapping
Back from the bike card reaches the run section with a bike day already set** — the one path a
forward-only gate cannot see. **The gate belongs to the pair, not to the screen.** Both sections carry it,
with the bike's note written as the primary case and the run's as the back-navigation case.

### Where it lives

`NonRaceBuilder.tsx` — `QualityDayPicker` gains a `blockedBy` prop *(the other discipline's day, the note,
the CTA, and the swap)*; `swapQualityDay()` writes the new day and drops the old one in **one** state
update, so there is no render where both are set. Revealing the chips is **local** UI state — backing out
of the reveal commits nothing.

### ⛔ WHAT THIS KILLS — and it is a piece of copy Michael deliberately kept

**`hardDayCount === 2` is now UNREACHABLE BY CONSTRUCTION.** Everything keyed on it is dead:

- **The Mulholland dialog** (*"we can hand you the keys to the Porsche…"*) — it fires on the transition to
  two hard days, and there is no longer a transition to two.
- **`TWO_HARD_DAYS_LINE`** — *"Two hard days alongside four lifting days is the ceiling"* — now states a
  ceiling of two where the rule is one. ⛔ **It is not merely dead, it is WRONG.**

⚠️ **Both are LEFT IN PLACE pending Michael's call, marked in code — not overlooked.** The dialog was
argued twice and kept on purpose (it bends `COPY-VOICE` rule 10 knowingly). **Deleting it is his decision,
not a cleanup.** But it is now precisely what he named the same day: *"a rule describing a state nobody can
reach is the thing that gets tuned in six months by someone who assumes it fires."*

⛔ **Decide it: delete, or re-scope to `balanced` / `endurance_led`, where two qualities is still real.**

> **↩ Related:** **`DOCTRINE-aerobic-maintenance.md` §6** (the rule this enforces) ·
> **`DOCTRINE-aerobic-maintenance-run-only.md`** (what the no-bike athlete's one session is) ·
> **D-325 §2/§7/§8** (the ledger clauses this makes unreachable on `strength_led`) · **D-315**
> (consent-first — the swap is the athlete's tap, never a silent rewrite).

---

## D-328 — Assistance CROSSES THE PLANE on a lifting day — and the citation behind it was wrong twice before it was right (2026-07-28/29, PUSHED `b245f79b`+`87b2b068` · **NOT DEPLOYED — see the banner**)

**Extends Q-212 past collision.** Q-212 fixed the case where the athlete's pick loaded the *same* thing as the day's main lift (push-ups after bench). This is the case Q-212 leaves alone and should not: a **chin-up does not collide with an overhead press** — one pulls, one pushes — so the slot stood, and an athlete whose clean max is six reps got chin-ups on all four lifting days. **100 reps a week of one movement.**

- **The rule.** On a day with no collision, the slot still checks the *plane*. Bench (horizontal push) → the pull slot wants a **vertical** pull (chin-up). Press (vertical push) → it wants a **horizontal** pull (row). `complementFor()` in `exercise-config.ts`; applied in `resolveAssistance()`, `src/lib/assistance-menu.ts`.
- **It needs no new movements.** The pull slot already carries both planes (Pull Up / Chin Up vertical; Inverted Row / Dumbbell Row horizontal). Where a slot has nothing in the complementary plane the pick **stands** — a preference is not overridden to satisfy a rule that has no answer.
- **Named, never silent (§5.2b).** A plane swap sets `balancedFor`, distinct from `substitutedFor`, because the reasons differ and the copy says which.

### ⛔ THE CITATION WAS WRONG TWICE, AND THIS IS THE DURABLE PART OF THE ENTRY

Michael: *"the code has to be evidence based keep runing them get it right."* Both wrong versions read as authoritative when written.

1. **First I cited "Wendler's assistance principle" generally.** Reading the primary (`531_2nd_Edition`) killed it: **four of five templates do the OPPOSITE.** Boring But Big — bench, then 5×10 bench (p47). The Triumvirate — press, then dips (p48). The Periodization Bible — squat, then leg press (p51). Same-pattern volume on the main lift's day **is the hypertrophy dose**, deliberately.
2. **The one template that crosses is p86 — the CONCURRENT chapter**, and only there: one assistance movement, conditioning to follow, no room for volume, so the slot buys **balance** instead. Bench → chin-ups; press → bent-over rows. *That is our athlete exactly.*

**So the rule is right HERE and would be wrong in a general strength block.** The narrowing is the finding — a rule that is correct only inside its condition, with the four contradicting templates listed beside it in the source so the next session cannot re-widen it by accident.

> **↩ Supersedes** the assistance framing in **D-324** (Strength Focus V1), which knew nothing of the day's main lift. **Closes the extension half of Q-212.**

---

## D-329 — The week grid carries NO interference warning: the citation behind it was OUT OF CONDITION (2026-07-29, PUSHED `e34db3a8`)

A warning fired when an endurance session landed on a heavy-leg day, citing **Robineau 2016**. It came out entirely, and the adjacency penalty was re-weighted **9 → 4** ("one anchor adjacency — a tiebreak, not an override").

- **The citation did not test this.** Robineau's 0h arm stacked lifting with **hard** endurance. The session that triggered the warning is an **easy ride**. `strength-primary-plan.ts:1095` already said so in terms — *"Do not attach a citation here without one that tested lifting + easy running same-day"* — and I attached one anyway, **twice**, on two different features.
- **And stacking is NORMAL.** Wendler's own concurrent template is main lift → assistance → conditioning, **same session, zero gap** (p87), and he explicitly does not care whether conditioning lands on a lifting day (p75). Michael: *"plenty of programs stack and i believe riding is the most forgiving."*
- **What survives is the sound part:** lift first, leave time if you can. That rides on the session itself, where the law computes the real pair — not on a grid that only renders.

⛔ **THE CLASS: a citation out of condition is worse than no citation.** It launders a guess as evidence, and it is unfalsifiable to a reader who does not fetch the paper. When a source is attached, the **condition it tested** must be stated next to it.

---

## D-330 — ONE scheduler screen: three cards become one, and the week draws live underneath (2026-07-28/29, PUSHED — `bcd0e6d7` and follow-ups)

Michael: *"its cleaner two and they can see the whole thing needs days of the wee do— long runs rides etc"*, then *"no no dont try and fix what there, this is a rebilt one simple scheuler."*

- **What it replaces:** separate `run`, `bike` and `hardday` steps, each asking for days in isolation, so the athlete never saw the week their answers produced until after the plan was built.
- **What it is:** `volume` (how much) and `schedule` (which days) — deciding WHEN while looking at HOW MUCH is what made the old card scroll past the fold. `WeekGrid` renders the solver's returned week under the controls, debounced 400 ms.
- ⛔ **`WeekGrid` PLACES NOTHING.** It prints the solver's own compromise strings **verbatim**, never paraphrased. It is standalone on purpose: the same component is meant to serve rescheduling on the State screen, so the athlete learns one picture. *A second placement authority on the client is the disease this codebase spent weeks removing.*
- **Also:** the confirm step's posture card was deleted (four rows restating answers in the engine's vocabulary; the week says it in days), and the protocol name moved to the subtitle because it was the one fact the grid cannot show.

### The two process failures worth keeping

- **I built the smallest edit twice instead of what was described.** Michael: *"you burnt out?"* It was not fatigue — it was hedging on a rebuild he had asked for plainly.
- **`npm run build` does not typecheck.** A removed prop stayed at its call sites and the build went green. **Run `npx tsc --noEmit -p tsconfig.app.json`** — and read only your own files out of it, because the repo has pre-existing errors elsewhere.

---

## D-331 — Compromise notes group by FACT, not by lift: one sentence per (anchor, distance), one per ceiling (2026-07-29, PUSHED `2b73a612`)

> ⚠️ **THE STATUS IN THIS TITLE WAS WRONG WITHIN THE HOUR.** It read *"UNCOMMITTED at time of writing"*, which is a CURRENT-STATUS claim in a permanent record — a later session would go looking for uncommitted work, find a clean tree, and conclude this does not exist. It is committed and pushed as `2b73a612`. **Still not deployed.** Never write a transient state into a title; put it in the body with a date.

Michael, reading a real generated block: *"does this copy actualy refect and plan concessions or does it just never change, its dense i cant read it."*

**The copy was fully computed and always had been** — real lift names, real cycle index, the athlete's own maxes, and a week with room to spare says nothing at all. **The density was a REPORTING bug:** two generators each emitted one paragraph *per lift*, so two lifts wrote the same sentence twice with a name and number swapped.

- `week-solver.ts` — at-the-floor notes group on **(anchor, distance, side)**. ⚠️ Not on anchor alone: two lifts can sit at the floor against the same anchor at *different* distances, and merging those prints a distance that is wrong for one of them.
- `strength-primary-plan.ts` — ceiling hits collect and emit **once**. ⚠️ The cycle is stated **only when the lifts agree**; two lifts pinning at different cycles drop the clause rather than pick a number that lies about one of them (§0f).
- **The ceiling sentence also lost its hardcoded "25 reps"** — `assistanceTotalReps()` scales to 50 on a tested capacity, so that number was wrong for exactly the athletes it scaled for.

⛔ **THE DANGEROUS HALF IS THE FIX, NOT THE BUG.** Grouping is a **subtraction at the output boundary** — §5.2b and §0f both live there. A merge that quietly drops a lift is far worse than the density it cures: the athlete then has no idea that lift is at its floor. So the load-bearing fixture is *"grouping never drops a lift"*, which recomputes at-the-floor membership **from the matrix**, independently of the note builder.

- **Swept, not spot-checked (§0d.1).** The screenshot was one arrangement; both tests enumerate every arrangement the solver accepts.
- **Red-green-red, both directions.** Disabling grouping failed the duplicate test; making the merge drop trailing lifts failed the §5.2b test. Restored: 22 pass.
- ⚠️ **One test was wrong, not the code** — I keyed duplicates on anchor+distance, which called "the day *before* squat" and "the day *after* deadlift" a duplicate. They are different facts. And a first draft hardcoded the floors instead of asking `requiredAdjacencyHours` — *a test that invents the rule it checks tests the invention.*

> **↩ Does NOT close Q-217.** The ceiling sentence still says the max is "usually out of date" — untrue for an athlete who never logged a lift, where it was never *tested*. Grouping made that sentence shorter, not correct.

---

## D-332 — Lifting days is 3 OR 4, and the test week always runs on four (2026-07-29, PUSHED `ff1ea583` · **NOT DEPLOYED**)

Michael: *"can we offer 3 stregnth trainingdays for anyone who is schedele dependent?"* — then, on why 4 stays the default, *"i see the single lift focus gives you the amrap test."*

**Four lifting days was a HARD CONSTANT** (`SPEC-week-solver.md` §0a constraint 4: *"a fixed count, lift frequency is not negotiable"*). `ENGINE-STATE` called making it a real number the single biggest unlock left in this subsystem. It is now a **default**.

### ⛔ WHY 4 WAS RIGHT, AND NOBODY HAD WRITTEN IT DOWN

Not tradition, and not frequency. **5/3/1 is a MEASUREMENT.** The top set is an AMRAP and week 3's 95% set is the programme's validity check — it is what reads whether the working number has been earned. One lift a day means every lift is trained FIRST, so every top set is a clean read. **Stacking does not merely cost load on the second lift; it corrupts the gauge.**

### WHY 3 IS STILL LEGITIMATE

Frequency is not the mechanism. Grgic et al.'s volume-equated meta-analysis found **no significant effect of training frequency on strength gain** — 1 d/wk and 3+ d/wk produce similar results when weekly volume matches. What costs is **exercise order**: the movement performed first adapts most, and the later one gives up load and reps.

⚠️ **The three-day setting does not fully equate volume**, by that same order effect. So the literature BOUNDS the option; it does not license it. The protocol doc states the trade rather than claiming it away.

### THE SHAPE

```
most weeks   Squat · Deadlift · Bench + Press
week 3       Squat · Deadlift · Bench · Press
```

- The **upper lifts pair** because they have least to give up — lighter and far less systemically taxing than a squat or deadlift.
- The **heavy lower lifts keep their own days**, where the AMRAP matters most and fatigue costs most.
- **Bench goes first** and the session says so. The order IS the cost.
- **Week 3 splits back onto four days.** Fatigue status is a named standardisation variable in 1RM testing, and test-retest reliability holds (ICC ≥ 0.90) only when the protocol is standardised — hence EVERY test week, not some of them.

### ⛔ THE SOLVER NEEDED NO CHANGE, AND ITS OWN COMMENT SAID SO

`week-solver.ts:527` refuses two lifts on a day, with the comment: *"the matrix permits `upper_body_strength × lower_body_strength` to share a day and that permission is real, but it belongs to a different block shape."* **This is that shape.** So it gets ONE paired upper slot rather than a relaxed rule — one lift per day still holds, the clearance maths is identical (an upper day is an upper day whether it holds one press or two), and the composer expands the slot afterwards. The test week is simply solved a second time.

### WHAT IS OURS

Nobody has trialled *"train three, test on a fourth."* The components are measured; the join is a **scheduling choice made to protect a measurement**, not a claim about the body. Wendler does not write it either: at three days HE rotates the four lifts and lets the cycle run past four weeks; at two days he stacks two lifts per session and keeps the calendar. **We are using his two-day trade one day up, and keeping his calendar.**

### PLUMBING

`liftingDays?: 3 | 4` on the composer · `lifting_days` through `generate-strength-plan` and `create-goal` · its own intake card before accessory. ⚠️ **NOT `strength_frequency`** — that is the retired D-323 dial and branches downstream still clamp it to 2; a distinct key is the point. Only a literal 3 does anything; absent is 4, pinned by a test asserting byte-identical `sessions_by_week`.

⚠️ **`SPEC-week-solver.md` §0a constraint 4 now contradicts the code and needs superseding.**

---

## D-333 — Above 25 miles a week the engine stops shaping the run week (2026-07-29, PUSHED `aa2ac29c` · **NOT DEPLOYED**)

Michael: *"do peple run 16 miles on maintence"* — then *"i think anone that runs more than 25 miles a week can self regulate"* and *"we dont do the math."*

### THE DEFECT, MEASURED

`distributeRunMiles` weights the **easy budget**, and `runDayList` **excludes the hard day**. So a "4 run day" week was really a 3-way split at 1.5/1.0/0.85 and the long run took **45% of the budget** — 16 miles, **40% of the week**. At 3 run days it is a 2-way split at 1.4/1.0: **21 miles, 3h09**.

The field cap is **25–30% of weekly mileage** (Daniels; the Hansons guidance rests on the same work) with a **2:30–3:00 time limit** beside it. Strength-led hybrid programmes run the long session **60–90 minutes**. The weights were roughly double any published number and the denominator was wrong underneath them.

### THE FIX IS NOT A CAP

At or above 25 mi/wk the share is **EVEN** and the athlete places their own miles. The engine still names WHICH day is long — that is their pick, and the solver needs the kind to place the lifting around it. **Below 25 the weighting stands**: a 12-mile-a-week runner getting four equal jogs is a worse answer, and 45% of a small budget is not the same defect.

40 miles over 4 run days: the long run goes **16 → 12**. Thirty percent.

⛔ **25 IS A PRODUCT DECISION.** No literature exists on the volume at which a runner can self-regulate. ⛔ **AND IT IS NOT A CEILING** — typed mileage is honoured in full, which is D-222's retirement (`maintenance-volume-band.ts` carries the standing warning that a cap was built once and must never return).

### THE NOTE, AND THE NUMBER THAT WAS DROPPED FROM IT

Michael proposed *"you can hold your run for 15 weeks at 63% of volume."* **63% is arithmetic off the 40-mile example (25 of 40), not Hickson's number** — his duration arms were 40 min → 26 and → 13, two-thirds and one-third, and both held VO2max for 15 weeks. Two further corrections folded in: he cut **duration** in one experiment and **frequency** in another, so "volume" merges them; and what held was **top-end fitness, not the run wholesale** — the one-third arm lost ~10% of long-duration endurance.

**Copy:** the above-band line now carries their own dose named (the suggestion, no imperative), all of it conversational, and what the extra volume costs. *"conversational"* not *"zone two"* — COPY-VOICE rule 9, and the Running screen already says conversational.

---

## D-334 — Ride hours are the hours the athlete asked for (2026-07-29, PUSHED `eb4a5fb6` · **NOT DEPLOYED**)

Found by running every intake combo through the composer and reading what came back. Three faults, all the run side's own history one discipline over.

### ⛔ THE SEVERE ONE, AND IT WAS EVERY BIKE-ONLY ATHLETE

`create-goal:2487` sets `gsBikeKept = bike maintain && gsSport !== 'bike'`, so a bike-**ONLY** athlete never gets a `bike{}` object — their hours arrive as `target_weekly_ride_hours` alone. `hasBike` tested `!!args.bike`, so the pass that turns hours into rides **never ran**, and the generic fallback handed them two fixed 45-minute rides. **6h asked, 1.5h built.** Not an edge case: it is the only path that athlete takes.

### THE OTHER TWO

- **`targetWeeklyRideHours` had ZERO readers.** Its own doc comment said it was carried *"so the bike pass has it to consume."* It never did. Same collected-and-dropped shape as `hardDay` and `quality_run` before it.
- **Two emitters, nothing subtracting.** Where a `bike{}` object DID arrive, the generic fallback fired as well as the bike pass. The pass built the ask exactly (6h → 103 + 154 + 103 = 360 min); the fallback added its own two 45-minute rides. **6h → 7.5h.** ⛔ **And it scaled with FREE DAYS rather than the ask** — at three lifting days the same 6h became 8.3h over six rides. *A volume that moves when the LIFTING moves is not a volume.*
- **The hard ride sat outside the budget** — the hill-session defect fixed on the run side 2026-07-28, unfixed here. **6h → 6.8h.** Michael rejected the run version at 27%. It does NOT shrink to fit: intensity is paid first at its full 45 and the easy hours flex. `BIKE_QUALITY_MIN` now owns that number so the subtraction and the session cannot drift.

⚠️ **NOT FIXED, BECAUSE NOT REACHABLE:** a bike-primary athlete with run volume gets no runs. `gsSport` is run-if-kept, so bike-primary implies run is out. A hand-built fixture produced that combo; intake cannot. **Reported as a bug first and retracted** — the fixture was wrong, not the engine.

---

## D-335 — A big 95% set advances the bar and marks the ESTIMATE untrusted (2026-07-29, PUSHED `8a9ea796` · **NOT DEPLOYED**)

Found by writing the partner-facing protocol: the doc asserted the engine flagged a double-digit 95% set instead of advancing. **It did not.** `verdictFrom95Set` was `reps >= 1 ? 'advance' : 'reset'` with no upper bound, so a 12-rep set and a 2-rep set returned the same verdict.

### ⛔ AND THE FIRST FIX WAS THE WRONG BEHAVIOUR

Michael, catching it: *"A 12-rep set at 95% means the athlete is genuinely much stronger than the TM says. Withholding the advance punishes them for it."*

| | says | so |
|---|---|---|
| **Physiologically** | big set → stronger than the training max, and that is Wendler's own read | **advance** |
| **Measurement-wise** | the e1RM off that set is above the range the equation holds in | **do not trust THIS number** |

Two questions, opposite answers, and **only the measurement one is in doubt.** Hence `advance_untrusted`: the bar climbs exactly as on a plain advance, and the estimate is marked so the next standardised read **supersedes** rather than compounds.

⚠️ `applyVerdict`'s guard was `verdict !== 'advance'` — it would have swallowed the new verdict and held the bar, the exact defect the verdict exists to avoid. The **1RM ceiling still binds**: a set outside the reliable range must not become a route around it.

### DEADLIFT GETS LESS ROPE, AND THE ERROR IS DIRECTIONAL

**LeSuer et al. 1997** (*JSCR* 11(4):211-213) tested seven equations across bench, squat and deadlift: correlations uniformly high (r > 0.95) and **every equation significantly UNDERESTIMATED the deadlift.** That is a bias with a direction, not scatter — and it **compounds with Brzycki's own downward bias**, so a deadlift e1RM is systematically low rather than merely uncertain. Trusted to **5 reps** rather than 8; 5 is where **Reynolds et al. 2006** found prediction strongest (R² = 0.993 bench). `trustedMaxRepsFor` matches on the lift name so *"Trap Bar Deadlift"* cannot slip through, and an unrecognised lift gets the **tighter** general ceiling.

⚠️ **8 AND 5 ARE BOTH OURS.** The literature gives a degradation zone, not a line.

⚠️ The allowlist in `generate-strength-plan` had to learn the verdict or it would be dropped at the door and fall to `unknownMeans: 'advance'` — the bar would still have climbed and **nothing would have looked broken** while the provenance flag went missing.

### ⛔ AND A JUSTIFICATION IN `compute-facts` MAY HAVE BEEN BACKWARDS

It read: *"Brzycki is more accurate than Epley at the low rep ranges (2-5)."* At that exact range some work puts **Epley and Wathen CLOSER** to a tested 1RM. Rewritten; **formula unchanged at the time.** ⛔ **IT CHANGED THE NEXT DAY — [D-339] IS THE ENTRY THIS ASKED FOR.** Brzycki is gone; the estimate is now Wendler's own (Epley), `src/lib/estimate-1rm.ts:56`. The "erring low" argument below is history, and the deadlift ceiling above no longer compounds with a Brzycki downward bias — `trustedMaxRepsFor` (`wendler-531.ts:461`) stands on the LeSuer finding alone. ⟨A31⟩

---

## D-336 — The deposit claim has a paper, and it is narrower than the doctrine said (2026-07-29, PUSHED `17301cdf`)

*"17 studies, 262 participants"* sat in `DOCTRINE-aerobic-maintenance.md` in **four places**, graded **"Literature, STRONG"**, with **no author anywhere**. The count was right and the citation was absent — which is the same fault as a wrong attribution, and it was the doc's own instruction to *"lead with it."*

**It is:** Llanos-Lagos C, Ramirez-Campillo R, Sáez de Villarreal E (2026). *Heavy strength training effects on physiological determinants of endurance cyclist performance: a systematic review with meta-analysis.* **Eur J Appl Physiol 126(1):193-222.** DOI 10.1007/s00421-025-05883-2. 17 studies, 262 participants (60 female), 5-25 weeks at 1-3 sessions/wk.

| outcome | effect size | p |
|---|---|---|
| Cycling performance (TTE / TT) | 0.463 | 0.016 |
| Cycling efficiency | 0.353 | 0.012 |
| Anaerobic power | 0.560 | 0.024 |
| **VO2max** | **no significant effect** | **≥ 0.263** |

### TWO CORRECTIONS, BOTH NARROWING

- ⛔ **NOT "STRONG."** The authors rate the certainty of evidence **LOW**. The register row now carries the authors' grade, not ours.
- ⛔ **CYCLING ONLY.** The doctrine's *"improves run and bike performance after prolonged submaximal work"* half is **not in this review**, and no source for it has been located. Stated for cyclists now, not for every athlete. **Anywhere the product states the deposit to a runner, it is generalising past the source.**

Still the best-evidenced claim in the domain, and still the one to lead with — for the athlete it was measured on.

---

## D-337 — Wendler HAS an estimated max, and it is Epley (2026-07-29, PUSHED `17301cdf` — VERIFIED AGAINST THE PRIMARY)

> ⛔ **THE "OUR BRZYCKI IS A DEVIATION" HALF IS DEAD — [D-339] (2026-07-30) ADOPTED WENDLER'S OWN FORMULA.**
> `src/lib/estimate-1rm.ts:56` (`WENDLER_EPLEY_COEFF = 0.0333`) is now the single source, imported by
> `compute-facts` and the client baseline test. The primary-source verification below stands; the
> statements that we use Brzycki, and that it is a stated deviation, do not. ⟨A31⟩

⛔ **A CLAIM IN OUR OWN DRAFT, STRUCK BEFORE PUBLICATION.** The protocol doc asserted *"5/3/1 has no estimated max of its own"* — that our whole e1RM layer filled a gap Wendler left. **It is wrong.** The 2nd-edition text was searched directly (Michael supplied the PDF; no copy had ever been in the repo, so the previous session's search could not be reproduced).

**He carries a rep-max calculator**, in three places — comparing rep maxes (p33), resetting after a stall (p31), and setting a training max for band or chain work (p99):

```
Weight × Reps × .0333 + Weight = Estimated 1RM
```

⛔ **THAT IS EPLEY.** `.0333` is 1/30. **We use Brzycki**, so our conversion is a **deviation from the source programme**, not a gap we filled — and the doc states it as one. The reason stands: Epley overestimates, Brzycki underestimates, and for a number that sets an athlete's next working load with nobody watching, we take the conservative direction.

✅ **AND HE HEDGES IT HIMSELF**, which backs the trust ceiling better than any paper does: *"This formula is not necessarily an accurate predictor of your 1RM, but it affords you a good general way to gauge your progress."* The programme this block derives from does not treat the estimate as a measurement either.

### THE OTHER TWO ATTRIBUTIONS, NOW ON PRIMARY EVIDENCE

- **"Always be able to hit five reps at 95%"** — the phrase *"always be able"* **does not occur in the text**, and no five-rep rule at 95% appears anywhere. Every prescription reads `95% x 1 or more reps`. **Q-220's strike stands, now verified rather than inherited.**
- **The stall trigger** is failing to hit the prescribed sets and reps. Confirmed.

### ⛔ AND A DIVERGENCE WE DID NOT KNOW WE HAD

His stall reset **re-estimates from a fresh rep max and takes 90% of that.** Ours cuts the existing working number by 10% — and our working number starts at **85%** of 1RM (`WORKING_NUMBER_PCT_OF_1RM`, the concurrent-athlete buffer), so a reset lands near **72% of 1RM** where his lands near **90%**.

**The buffer bought that safety once and the reset charges for it again.** Not changed: it moves prescribed weight for real people. Filed as Q-222.

---

## D-338 — PARTIALLY SUPERSEDED

> ⚠️ **SUPERSEDED IN PART BY [D-344] (2026-07-30, one day later): the three-word difficulty tap is
> REMOVED.** The verdict that moves the bar reads the REP COUNT, and nothing ever read `difficulty` —
> an input with no reader. **The rest of D-338 stands**: RIR abandoned for 5/3/1, the AMRAP captured as
> a saved fact, and the deload exclusion. Everything below is history.
>
> ⚠️ **Also relevant: [D-339]** replaced the Brzycki estimate this entry's facts feed.

## D-338 (original) — The three words replace RIR, the AMRAP is the measurement, and both finally reach the screens (2026-07-30)

Michael: *"app will adopt this as our language to communicate how user handled load we abadon RIR — moved well worked for it or grind — this is the langauge of other stregnth apps. AMRAP determines whether to pump up beyond 1rm. none of this is seen or understood by performance or state."*

### THE DECISION

**RIR is abandoned for 5/3/1** — not hidden, abandoned. The split is not "reps and load", it is **who picks the weight**: RIR programs prescribe a rep target and leave the load to the athlete, so RIR reports whether they chose right. 5/3/1 sets the load off the training max, so there is nothing for RIR to decide.

**The replacement is `Moved well / Worked for it / Grind`** — one tap, heaviest set, optional (blank stays legal). **The AMRAP rep count is the measurement** that moves the training max, and a training max meeting the 1RM on file is evidence the RECORD is stale, not that the athlete has maxed out.

⚠️ **PER PROTOCOL, NOT UNIVERSAL.** `usesRir` is a profile flag and stays one. An autoregulated block gets RIR back automatically.

### GROUNDED, AND THE DEVIATIONS NAMED

- **Not using RIR on 5/3/1 is field practice.** Boostcamp runs core 5/3/1 purely on percentages and reads the session off the AMRAP; RPE/RIR appear only on autoregulated variants (Beyond 5/3/1). ⚠️ Most trackers (Hevy, Trainerize) DO offer RIR — this is right for THIS protocol, not a claim about the market.
- **Words instead of a number has a validated precedent:** RISE (Resistance Intensity Scale for Exercise) — easy/low/moderate/hard/maximal, concurrently validated against velocity, load, reps and HR. RP autoregulates volume off categorical feedback.
- ⛔ **TWO THINGS ARE OURS AND MUST KEEP SAYING SO:** **three** levels, not RISE's five; and a **top-set tap** rather than a post-session rating. RISE's validation was elastic-band squats, so it grounds the APPROACH, never our exact labels. Three was kept deliberately: the two extra levels buy resolution we would not act on, and "low" is not a word anyone says about a top set.

### WHAT WAS ACTUALLY BUILT

⛔ **The gap was total: BOTH signals were written and read by NOTHING.**

1. **`compute-facts`** now writes `difficulty`, `amrap_reps` and `measured` onto `workout_facts.strength_facts` (JSONB — no migration), per exercise plus a session-level `measured`. Difficulty is read off the top set by the SAME `topSetIndex` the logger stamps with — imported, not re-derived, or the word lands on a different set than the one answered about.

2. **The deload exclusion fires for the first time.** `computeStrengthState` has always passed `exclude: isDeloadWeek`, and `deload.ts` has always read `point.meta.name` — while `liftSeriesFromExerciseLog` built its points `{date, value}` with **no meta at all**. Dead since the series was written. `compute-snapshot` now resolves the phase **per date** off the single resolver (`plan-phase.ts`, D-261) and threads it through, so it holds whether or not the session was ever attached. The VOLUME series had the identical dead exclusion; fixed with it.
   ⚠️ **Why it matters on 5/3/1:** week 4 is 40/50/60% of the working number, so its estimate lands ~30% below its neighbours. Pinned in `strength-deload-exclusion.test.ts`: the week after a deload read **sliding at −14%** on a week followed exactly. Those fixtures are the bug case and stay permanently.

3. **The strength Performance screen stops grading.** Execution % is DELETED for strength (endurance keeps it — compliance against prescribed pace/duration is real there). It was generating three wrongs at once: **117%** on a session with no plan, off analysis left over from a wrong attachment that nothing recomputes on detach; **a fifth of the score given away** (the RIR term scores 100 when absent, on a protocol that never asks); and a paragraph about *"skipped Dips"* for a plan the athlete is not on. Replaced by a recomputed FACT — "Completed 4 of 5 exercises" — plus a per-row **"not logged"** / **"not in the plan"** mark. ⛔ **And nothing at all when there is no plan**, which is D-035's law that strength never obeyed.

4. **The ramp is shown truthfully.** The Planned column read the aggregate `weight` (the TOP set) and replicated it, so a correct 170/180/190 session showed its first two sets as under-plan and printed a **negative volume delta**. It now reads the authored `set_plan` that materialize already carries; planned volume is derived from the rendered sets so the delta can never disagree with the column above it.

5. **The three words render** on the row, as the athlete's own word. Never a number, never a score.

### STILL OPEN — NOT DONE HERE

- **State does not render difficulty yet.** The fact exists; the trend does not read it.
- ~~**`advance_untrusted` still has no reader** (D-335), and Wendler's `verdictFrom95Set` is still called by nothing~~ — ✅ **BOTH CLOSED BY [D-341] (2026-07-30).** `verdictFrom95Set` is called at `loading/cycle-verdicts.ts:116` and reaches the composer via `workingNumberForCycles` (`strength-primary-plan.ts:1275`, `rematerialize-strength-block/index.ts:167`); `advance_untrusted` is honoured at `wendler-531.ts:481` and allowlisted at `generate-strength-plan/index.ts:157`. ⟨A31⟩
- **The freestyle default** (three words for a no-plan session instead of RIR) is unbuilt. ⚠️ This is the one recommendation that goes AGAINST common practice — other trackers do offer RIR there — argued on the grounds that RIR needs a target to mean anything.
- **The five name-matchers** (audit F5) are untouched, so a lift can still appear twice.
- **The calendar squat-day-not-done** is reverted and parked; the detail screen must stop treating a planned row as completed first.

Audit: `docs/AUDIT-performance-state-2026-07-29.md`. Supersedes the RIR half of D-324/D-326 layer 1 for this protocol.

---

## D-339 — ONE 1RM FORMULA, AND IT IS WENDLER'S OWN (2026-07-30, SHIPPED + DEPLOYED)

**Michael:** *"use wendler."*

### The finding: THREE answers to one question

| where | formula | rep cap |
|---|---|---|
| `compute-facts` — every logged session | Brzycki, `w × 36/(37 − reps)` | 30 |
| `StrengthLogger` — the baseline TEST | a CLUSTER of Epley + Brzycki averaged | **10** |
| 5/3/1 2nd edition p32 | `weight × reps × 0.0333 + weight` | none |

**So the number that SET the working weights and the number that JUDGED the work against them came
from different equations, on different machines.** That is a Law 1 violation on the most load-bearing
number in the strength system, and it was invisible because each site looked reasonable alone.

### Why switch, given `compute-facts` carried an explicit DO-NOT-SWITCH note

That note's reasoning: *"Brzycki tends to UNDERESTIMATE and Epley to OVERESTIMATE, and for a number
that sets an athlete's next working load, erring low is the safe direction."* Sound reasoning, **half-
true premise** — it holds below ten reps and INVERTS above:

| reps | Brzycki | Epley/Wendler | |
|---|---|---|---|
| 5 | ×1.125 | ×1.167 | Brzycki lower — the note's case holds |
| **10** | ×1.333 | ×1.333 | ⛔ IDENTICAL |
| 15 | ×1.636 | ×1.500 | Brzycki HIGHER — reverses |
| 20 | ×2.118 | ×1.666 | Brzycki runs away |

Brzycki has `37 − reps` in a denominator and climbs toward a singularity; Epley is linear. **The
all-out set is the one place reps are deliberately open-ended**, so the high-rep range is exactly
where this number lives — and there Brzycki is the AGGRESSIVE one. Switching therefore serves the old
note's own stated goal.

⚠️ **NOT AN ACCURACY CLAIM.** The literature conflicts by population and lift, and LeSuer et al. (1997,
JSCR 11(4):211-213) found EVERY tested equation significantly underestimates a deadlift 1RM. This is a
product decision about which way to be wrong, and whose arithmetic the athlete's own programme is
written in.

⚠️ **WENDLER'S 0.0333 IS EPLEY'S 1/30**, printed short — 0.1% below, so our estimate is a hair lower
than textbook Epley. We keep the book's digits: the athlete can check our arithmetic against his own
copy, and the gap is far below the 5 lb rounding. **He also TRUNCATES**: p32 prints 322 for 322.932.
Both worked examples are pinned as fixtures.

⚠️ **NO REP CAP ANY MORE.** The old server cap existed because Brzycki blows up; Wendler's is linear
and cannot. The client's 10-rep cap was worse than useless — it reported a 15-rep set as a 10-rep one,
silently understating a real effort. **Reliability above ~10 reps is carried as PROVENANCE**
(`trustedMaxRepsFor` / `advance_untrusted`), never by rewriting the rep count.

⛔ **NOT BACKFILLED.** Existing sessions keep their Brzycki numbers; recomputing is the athlete's call
(per-session Recompute reruns `compute-facts`).

**Home:** `src/lib/estimate-1rm.ts`, imported by both `compute-facts` and the client.
**Verified:** 9 fixtures including both of the book's printed examples and the exact 10-rep crossover.

---

## D-340 — THE BLOCK IDENTITY CARD: one place says what block you are in (2026-07-30, SHIPPED + DEPLOYED)

**Closes Q-230 Parts A and B. Closes audit F3, F4, F9 and F10.** *(`docs/AUDIT-performance-state-2026-07-29.md`)*

**Michael:** *"the whole point is for this app to be smart to know everything."* The pattern behind
every finding that day: **the app KNEW something and never told the next screen.**

### The card

`_shared/block-identity.ts` — given a plan and a DATE, answers once: which protocol, what the goal is,
week, week-in-cycle, leader or anchor, deload, whether the week carries an all-out set, whether THIS
is the 95% reading, and **how the block reads effort** (`amrap` | `rir` | `none`).

- **Read-only by construction.** Nothing that consumes it may move a session or change a weight
  (Law 4). Efforts is a hybrid app and the endurance/strength balance is a solved arrangement made at
  build time; a read surface that starts steering it is a second builder.
- **It READS the block shape the builder stored** (`config.phase_structure`) rather than re-deriving
  it. The leader/anchor split depended on continuity and posture AT BUILD TIME; re-deriving now could
  describe a structure that is not on the athlete's calendar. The only math it does is `setsForWeek`,
  the same pure function the composer wrote the sets with.
- **Unknown is silent, never a default.** `resolveProfile()` returns `durability` for ANY unrecognised
  id, which made a missing entry and a deliberate choice indistinguishable and caused the same bug
  twice (Q-192, then `strength_primary` in D-322). Every field here is nullable with its own
  "do we know?" boolean.

### The write side

- `generate-strength-plan` now stamps `strength_protocol: 'strength_primary'`. It only ever said so in
  `config.source`, which is why `coach` resolved a null protocol on every Strength Focus block.
  **The `source` fallback STAYS** — every live block identifies itself that way.
- `NonRaceBuilder` persists `goal_focus` **on the GOAL**, which owns what the athlete is chasing. It
  was collapsed to `capacity`/`maintenance` at the builder and never recorded, so "build speed" and
  "build endurance" both arrived as *"run: develop"*.

### What changed on screen

- **F3** — the generic *"estimated one-rep maxes have been sliding"* no longer fires on 5/3/1. That
  block prescribes 40→95% by design; two weeks in four are deliberately sub-maximal.
- **F4** — the Cross-training row can no longer prescribe *"easing the running"* off a dip the plan
  caused. `verdictTrusted` gates the CEILING clause only; the floor and the trend line are untouched.
- **And two readers that had NEVER FIRED on any protocol now can:** the coach fed `strengthProtocol`
  3 of its 6 fields, so the deload suppression and the 5×5 ceiling clause were dead code.
- **F10 / Q-208** — the per-session plan lookup no longer requires `plans.status = 'active'`, so a
  session on a finished block keeps its framing instead of reading as unplanned.

### ⛔ THE LESSON THAT COST FOUR ROUND TRIPS THROUGH MICHAEL

The card shipped, deployed, and showed **nothing**, three times running:

1. `workout-detail` has a session-detail **CACHE FAST PATH** — a stored copy that is not stale is
   served verbatim and the pipeline never runs. Every copy written before that day lacked the new
   fields, so correct deployed code was unreachable.
2. The block lookup read `training_plan_id` off the planned row and stopped. A planned row can be
   linked and carry no `training_plan_id` — the plan-context fetch twenty lines below has handled that
   for months, with a log line saying so.
3. The staleness rule that fixed (1) was `!block && !block_checked` — refresh once, then stop asking.
   Twenty minutes later a new field shipped, and **every copy stamped by that first run was now
   considered fresh.** The guard against an infinite refresh had become a guard against the fix.

⛔ **A NEW FIELD ON `session_detail_v1` NEEDS A STALENESS RULE OR IT WILL NEVER APPEAR ON AN EXISTING
SESSION. Deploying is not shipping here.** `BLOCK_CARD_VERSION` now versions it — bump on any addition.

⛔ **AND AN EMPTY PANEL MUST SAY WHY.** All three failures looked identical to "this session had no
all-out set". An invisible failure is indistinguishable from a correct absence, which is what turned a
one-line bug into four screenshots.

---

## D-341 — THE ALL-OUT REPS MOVE THE WEIGHT (2026-07-30, SHIPPED + DEPLOYED)

**Closes Q-226 and Q-223.**

**The block advanced on the CALENDAR.** `workingNumberForCycle` steps +5 upper / +10 lower every four
weeks and nothing could stop it — miss the reps and the bar climbed anyway, then the next all-out set
measured that bar and wrote it back as the athlete's max. **The plan graded its own homework.**

⛔ **NOTHING NEW WAS COMPUTED.** Four pieces, all built, all tested, none ever called:
`verdictFrom95Set` · `groupSessionsByCycle` · `verdictsForBlock` · `workingNumberForCycles`.
`rematerialize-strength-block` is the wire between them. **The reader could never live in the
composer** — it authors twelve weeks up front, so no verdict CAN exist for weeks that have not
happened. Something had to come back afterwards.

- **It PROPOSES; it does not silently write.** The auto-progression that moved strength load on every
  ingest was DELETED because it changed prescribed weight with no prompt and no consent — *"the
  athlete opened the logger to a number they never agreed to."* Default is a dry run; `apply: true` is
  the tap.
- **Only weeks that have not started.** History is not editable and a session already logged keeps the
  prescription it was judged against.
- ⚠️ **`unknownMeans: 'hold'`, pinned.** With `'advance'` an empty block walks the bar up while
  appearing to have earned it — the failure looks exactly like normal operation.

**Where the athlete meets it:** the LOGGER, at save. Michael: *"people might not check either, could
the logger give you a pop up when its changed?"* State and Performance are both places you have to go
looking; the moment the reps are worth something is the moment they are logged.

### ⛔ THE COPY DECISION — the fact is the celebration

Michael: *"my urges are to gamify but i also wanna be the growup in the room."*

**The game is already in the programme.** Wendler built rep records into it (p10: *"If your squat goes
from 225x6 to 225x9, you've gotten stronger. Don't get stuck just trying to increase your one rep
max."*). So **gamify the substance, not the tone.** No confetti, no streak, no praise word.

- Up: *"Back Squat 90 → 95 lb. Earned the step."*
- Down: *"Back Squat 90 → 80 lb. Resets, and the next cycle builds from there."*

**A reset is not a penalty** — p30: you keep adding weight until you cannot hit the prescribed reps,
and the miss is the SIGNAL. Same sheet, same tone, no apology. **An app that inflates the score on the
way up cannot be trusted on the way down.**

---

## D-342 — NO CLIENT MATH: four decisions and two writes moved to the server (2026-07-30, SHIPPED + DEPLOYED)

**Michael:** *"we are doing math in the client? … dumb client smart server."*

### The audit (asked for by name, over the week's changed files)

| what the phone decided | why it matters |
|---|---|
| the tested **1RM** from a baseline test, then WROTE it | the number a whole block's weights derive from |
| the **weight** for an added or swapped lift, incl. a hardcoded **0.70** default and a 20-session query | it puts weight on the bar |
| what counts as a **PR** | a verdict |
| whether a planned lift was **done or skipped** | adherence |

### The rule, for when it gets muddy

**Does this number get SAVED, or shown as a FACT? → server.** Only affects how something LOOKS
(rounding, pace strings, chart pixels) → the phone is fine.
**Sharper test: if two screens both did this, could they disagree?** If yes, it belongs on the server.

⚠️ **A SHARED PURE FUNCTION IN `src/lib` THAT BOTH SIDES IMPORT IS NOT CLIENT MATH** — it is one
formula with two callers. `maintenance-volume-band.ts` and `exercise-config.ts` both work this way,
correctly. **The violation is a phone-only DECISION or a phone-written FACT.**

**New:** `save-baseline-test` (two-phase — nothing is written while any lift needs the athlete's
Keep/Update call, so an abandoned dialog cannot leave a half-applied save) and
`resolve-exercise-weight` (returns WHICH branch answered, so a derived number and a guessed one are
never indistinguishable).

⚠️ **THE COST, ACCEPTED:** the live "Estimated 1RM" preview while typing a baseline test is gone, and
an added exercise's weight fills a beat later. One number, computed once, by the machine that stores it.

---

## D-343 — SWAPS FOLLOW THE PROGRAMME, NOT THE LIBRARY (2026-07-30, SHIPPED + DEPLOYED)

**Michael:** *"we arent offering the right swaps for accessories, reads them as traditional lifts"* →
*"we need to work with the framework of the plan"* → *"yeah it should be smart, no?"*

Three faults, found in that order:

1. **An accessory offered the main lifts.** Hip Thrust → Deadlift; Bulgarian Split Squat → Back Squat.
   The uncurated fallback was `loadable ? 'direct' : 'lighter'` — SYMMETRIC — so every loadable lift
   sharing a movement pattern was called a direct swap, sorted heaviest-first. **Measured before
   fixing:** excluding main lifts empties 2 of 110 accessory lists, and both were an alias gap.
   ⚠️ ONE-DIRECTIONAL: a main lift still offers accessories — swapping DOWN is a legitimate call.
2. **An assistance row got the whole library instead of the plan's three-option shortlist.**
   `materialize-plan` builds each planned exercise from a **WHITELIST** and `load_prescribed: false`
   was not on it — the flag reached that function (it is read twenty lines earlier, to stop a weight
   being derived) and died on the way out. ⚠️ **The fix alone would not have helped the live block**,
   so the client reads a second signal present on every assistance row ever authored: the prescription
   is a rep TOTAL, because assistance states a movement and a total and never a weight.
3. **It did not know what day it was.** The block never offers a slot's raw menu — on a bench day the
   push slot PULLS, on a squat day the single-leg slot HINGES (Q-212 / p86). Same function the
   composer applies, not a second reading of it.

⚠️ **OPT-IN VIA THE ROW.** The first cut keyed off the exercise NAME and broke five pinned tests: four
menu movements (Pull Up, Push Up, Dumbbell Row, Bulgarian Split Squat) are ALSO ordinary library
exercises. A Pull Up as a main vertical pull and a Pull Up filling the `pull` slot are the same name in
two different jobs, **and only the ROW knows which.**

---

## D-344 — THE THREE WORDS ARE GONE; the count is the verdict (2026-07-30, SHIPPED)

> **Supersedes D-338's difficulty tap after one day.** The rest of D-338 — RIR abandoned for 5/3/1,
> the AMRAP captured as a fact, the deload exclusion — stands.

**Michael:** *"lets kill it, i dont want any useless buttons."*

Replacing RIR was right: a deterministic protocol has nothing for reps-in-reserve to decide. But **the
verdict that moves the bar reads the REP COUNT** (p30), and nothing on that path ever read
`difficulty`. A question asked every session whose answer changed nothing — **an input with no reader,
which is the same disease as a reader with no input.**

⚠️ **Gating weight on how it felt would be AUTOREGULATION, which belongs to a different programme.**
Checked, not assumed: Boostcamp exposes RPE/RIR only on *Beyond 5/3/1* autoregulated templates, not on
core 5/3/1.

⚠️ **SESSION RPE STAYS** — `calculate-workload` reads it to score the session, which feeds ACWR.
Checked before touching anything.

⚠️ Nothing is lost: the plain Done button always finished the set. Sessions that already recorded a
word still display it — deleting the render would erase what was honestly logged.

---

## D-345 — SUPERSEDED THE NEXT DAY

> ⛔ **THE FIELD THIS WROTE IS READ BY NOTHING, AND THE PREMISE WAS FALSE. Corrected by [D-346]
> (2026-07-31).**
>
> This entry writes `run_facts.workout_type` and states that the field *"was NEVER WRITTEN, so every
> run was excluded from the efficiency/decoupling read and the trend sat 16 days stale."* Measured the
> next day against real data: **the field the gate actually reads is
> `workout_analysis.heart_rate_summary.workoutType`, and it was populated on all 25 runs — with
> `steady_state`.** So nothing was ever excluded; the opposite was true, and hill sessions were being
> counted as steady.
>
> ⚠️ `run_facts.workout_type` has no reader. `route_progress_metrics.workout_intent`, written by the
> same session's follow-up fix, has none on this path either. **Three sessions in three days each wrote
> a run's intent to a different unread field** — which is the fault [D-346] exists to end.
>
> Everything below is history. The classifier itself is sound; it is aimed at nothing.

## D-345 (original) — A RUN'S INTENT COMES FROM THE PLAN IT IS ATTACHED TO (2026-07-30, SHIPPED + DEPLOYED)

**Michael, reading his own State screen:** *"heart rate drifting up? does it see the hill drills and
not know what?"*

**It saw nothing at all.** `state-trend/run.ts` restricts the efficiency and decoupling reads to steady
aerobic efforts — correct, and the field standard: **TrainingPeaks requires a sustained steady effort
over 20 minutes, fully aerobic, low variability**, or the number is not valid. But the gate is
`isSteadyAerobic(workout_type)` and **nothing ever wrote `workout_type`.** `String(null)` is empty, the
gate returns false, and EVERY run in his history was excluded. **His heart-rate row sat on a July 14
reading, in red, for sixteen days.**

⛔ **THE PLAN IS THE SOURCE, NOT THE DATE.** Verified: Intervals.icu does exactly this — *"When an
activity is paired with a planned workout, any tags from the workout are added to the activity."*
Keying off the LINK rather than the calendar is what makes it survive an athlete moving a session or a
plan being rebuilt around them. **Both happened to Michael the same day.**

Order: the plan's own words → the file's interval structure when nothing is attached → the athlete's
title last (it is usually "Morning Run"). **A hill session run slowly is still a hill session; the plan
knows that and the data does not.**

⚠️ **`null` STAYS A REAL ANSWER.** An unattached, unstructured run is excluded from the steady read
rather than guessed into it — the same failure direction the gate already chose.


---

### AMENDMENT (same day) — the sorting rule: DEFINITION vs POSITION

**Michael:** *"anything specific to where the user is needs to go to more; ⓘ simply shows what the
metric is."*

⛔ **THE TEST, and every future addition to these rows has to pass it:** a sentence belongs in **ⓘ**
only if it would be true for **an athlete who has never opened the app.** Anything measured *about this
person* — their dot, their basis, their freshness, their trend, their pace — is **"more"**.

**What that caught:**
- **Both bike ⓘ strings** ended with *"the dot is where it sits versus your baseline; the arrow is the
  direction"* — a legend for this athlete's position, not a definition. Moved to "more", rendered only
  when there is a dot to explain.
- **The bike POWER string went further:** *"how your cycling power is TRENDING VERSUS YOUR OWN
  BASELINE"* is also position. It now says what power is and stops.
- **The run ⓘ already passed** — metric only, unchanged.
- **The run PACE line** (`pace ~12:49/mi at 134 bpm`) moved under "more". It was added in July as the
  plain-English *"what"* beneath an efficiency INDEX, when the row led with `1.55`. The row now leads
  with a direction and a percent, so the pace had stopped being a translation and become a second,
  more concrete-looking number competing with the one the row is about.

**The bike row was restructured to the same shape as run** — headline + one receipt line visible, the
rest behind "more". ⚠️ **Contents differ because the material differs** (run's detail is a read; bike's
is provenance) — the RULE is what is shared, not the items. ⚠️ **The empty state stays VISIBLE:**
*"no baseline set · accept your FTP to anchor"* is actionable, and hiding an actionable gap behind a tap
is how a missing dot starts reading as a bug.

## D-363 — THE SESSION SCREEN IS NOT THE STATE SCREEN (2026-08-02, Michael — **PUSHED + DEPLOYED, not device-verified**)

> ⚠️ **THE SAME LAW APPLIED ONE FLOOR UP, 2026-08-02 — see [D-368].** This entry moved a
> cross-discipline fatigue judgement off the session screen. The COACH was doing the identical thing:
> reading a per-session adherence average and returning readiness `'fatigued'` *"regardless of ACWR"*,
> plus a caution telling the athlete to dial back intensity because *"your execution suggests you're not
> absorbing the work"*. Both paths are now **deleted**. Fatigue is State's, from trends over time.
>
> ⚠️ Its row-shape half was also superseded: the ride's **Efficiency** row lost the drift figure to its
> own **Heart rate** row, and the **prescribed-versus-ridden** sentence was added — see [D-367].
>
Michael, on the ride Performance tab: *"this is too dense — see how running handles it, works there."*
A run's Performance tab renders **one** analysis row and a sentence:

> `Conditions · Rolling (33 ft gain) · 82°F (mild heat stress)` + *"Warm at 82°F — both add a little
> load, and you carried it."*

The ride rendered **nine**. "Cycling parity rows" had been added so the bike would not feel empty, and
overshot into a data table. Cut to running's shape: **Insights, Terrain, Efficiency**.

| cut | why |
|---|---|
| Power | said "141W (80% of threshold)" one row under an Insights line already reading "141 W normalized at 0.8 intensity" |
| Heart rate | "Avg 144 · Max 166" is already on the DETAILS tab — a bare avg/max belongs with raw readouts |
| Power zones | a seven-band distribution is a data table wearing a sentence; running shows none either |
| Climbing (VAM) | a specialist's metric; Terrain already states the gain. `formatCyclingClimbingRow` KEPT (tested) |

**And three rules came out of it that generalise beyond the bike:**

1. ⛔ **FATIGUE BELONGS TO STATE.** *"Accumulated fatigue is elevated (6 training days without rest…)"*
   is a cross-discipline, multi-day judgement that renders **identically on every session opened that
   week**. State owns the athlete's condition; a session page owns what happened in the session. Two
   screens asserting one verdict is the divergence the spine exists to prevent, and the session page is
   the one with no context to qualify it. Filtered by **category**, not message text, in BOTH doors (the
   Flag row and the narrative fallback that appended the first flag to Insights).
2. ⛔ **DO NOT SHOW A READING THE ENGINE THREW AWAY.** Michael: *"why would you say 146 is heart rate at
   easy power?"* Because on a hard ride it is not. In-band time on a threshold ride is incidental —
   warmup, descents, the sag between efforts — and HR there is dragged up by the work around it. The
   STATE trend has excluded such rides since D-275-bike (`bikeEfficiencyRideEligible`). **The session
   card did not know**, so it printed the number under a label claiming it was measured at easy power
   AND told the athlete it fed a read that had already discarded it. The analyzer now decides with the
   same gate and ships `counts_toward_trend`; the card renders only when true. **The client does not
   re-derive eligibility** — that is how the two drift apart.
3. **NAME THE ZONE THE ATHLETE ACTUALLY RODE IN.** `classified_type: threshold` had been computed all
   along and never printed. Insights now leads with *"Ridden at threshold — …"*, read from the
   classification, never re-derived from IF (that would be a second opinion on a settled question).
   ⚠️ It matters most when it **contradicts the prescription**: prescribed "easy, all conversational",
   ridden at threshold, 14% held under the easy ceiling — one coherent story instead of three numbers
   that never met.

**Also:** `at Z2 power · 99–132 W` was the SAMPLING WINDOW, not a verdict — on a threshold ride the
most prominent label said "Z2", the opposite of the truth. Now *"measured in your 99–132 W range"*.
**And the two tabs disagreed about elevation** — 958 ft on Details, 942 ft on Performance, because
Details read the provider total and Performance derived its own. One number now (`providerElevationGainM`).

## D-362 — SCORE WHAT WAS PRESCRIBED (2026-08-02, Michael — **PUSHED + DEPLOYED, not device-verified**)

> ⚠️ **EXTENDED TO RUNNING 2026-08-02 — see [D-364].** This entry made the RIDE score what was
> prescribed. The run had the same idea in prose only, off AVERAGE heart rate, while this one used time
> under the ceiling — so an easy run showed two chips and an easy ride three. The measurement now lives
> in `_shared/time-under-ceiling.ts` and both sports call it. ⛔ **The gate is the load-bearing part:**
> do NOT gate on `mapClassifiedTypeToHrWorkoutType()`, which returns `steady_state` for everything but
> intervals and hills — a TEMPO run took the easy branch and was graded against a prescription it was
> never given.
>
A ride prescribed *"~108 min easy, all conversational"* scored **0%**. The chain of reasons is the
entry; the rule is the title.

### 1. The planned duration was not where cycling looked

`analyze-running-workout` reads `plannedWorkout.computed.total_duration_seconds`
(`lib/adherence/granular-pace.ts`). `analyze-cycling-workout` summed the STEPS and nothing else. An
unstructured session has no steps, so it resolved to 0 planned seconds → 0%. **A run in the same shape
scores fine** (a real one: duration 53, execution 72). Not a missing feature — one of two readers
looking in one place.
→ `_shared/planned-duration.ts`: steps → `computed.total_duration_seconds` → the column → `duration`
(minutes). **`auto-attach-planned` reads the same resolver** ([D-361]); it had the identical hole,
which is how one session managed to be both unattachable AND unscoreable.
⚠️ **And the analyzer's query never SELECTED `duration`** — the resolver had nothing to resolve. Third
time one missing column caused this in a night.

### 2. It graded power that was never prescribed

70/30 power/duration assumes power targets exist. With none, a rider who did 59% of the prescribed time
scored `0.7×0 + 0.3×59 = 18%` — **wrong, not lenient**: graded against a prescription never given.
With no graded power interval, `power_adherence` is **NULL, not 0** ("not measured" ≠ "you scored
zero", and the chips hide when everything is 0).

### 3. ⛔ AN EASY PRESCRIPTION IS GOVERNED BY HEART RATE

Michael: *"I went too hard — heart rate should probably be the governor. It was prescribed as easy."*
The field's rule: power is what the bike sees, heart rate is what the body did to produce it. For an
easy ride the target is physiological → HR leads; for intervals the target is external → power leads.
Decide in advance which governs (TrainingPeaks/Friel practice). Execution = **50/50 intensity+duration**,
mirroring running's 50/50 pace+duration.

- ⛔ **TIME UNDER THE CEILING, NEVER THE AVERAGE.** The ride climbed 958 ft; an average punishes terrain
  and reads a hilly easy ride as indiscipline. A test pins exactly this (average says "not easy", the
  honest answer is two thirds held).
- ⛔ **THE CEILING IS NOT `ride_easy_hr`.** That learned 130 bpm is a **median of past easy rides** — as
  a gate it fails half the athlete's own easy rides by construction. Anchor: threshold-first (Friel
  cycling Z2, 89% of LTHR), **75% of max** as bootstrap — NOT the run's 80%, because cycling HR sits
  5–10 bpm below running at the same effort and this app's own ride learner already uses a 65–75% band.
  `_shared/easy-hr.ts` says outright: do not unify them.
- **`ride_easy_hr` was written by `learn-fitness-profile` and read by NOTHING.** Another built-and-
  starved capability, now consumed.

### 4. A large deviation is not a reason to stop scoring

`assessed_against` flips to `'actual'` in two unrelated cases (`fact-packet/build.ts:848`): no planned
workout at all, **or** distance deviated ≥30% ("intentional"). `AdherenceChips` treated them the same
and returned null for both. Case 2 is backwards: there IS a plan, the comparison DID run, and pace 90 /
duration 78 / execution 84 sat in the contract unrendered — while the same screen printed *"36 of 46 min
planned (78%)"* and a 90% interval row two lines above. Michael: *"if it attached it should adhere to
something."* Only the display guard moved; `assessed_against` still drives stimulus criteria and the
LLM note.

**Grounding for the numbers, checked not recalled:** a 20-min TT repeats at CV ~2.9% in a lab (IJSPP
2019); 220−age has no scientific merit (Robergs & Landwehr 2002, error 7–11 bpm) and Tanaka
(208 − 0.7×age, n=18,712) still puts this athlete 7 bpm under a heart rate he has actually ridden at.
**Measurement beats prediction — which is the argument for a threshold test, and why the Easy chip now
prints "est. from your max HR" until one exists.**

## D-361 — A SESSION MUST BE ABLE TO ATTACH, AND THE ANALYZER MUST FOLLOW IT (2026-08-01, Michael — **PUSHED + DEPLOYED, not device-verified**)

> ⚠️ **EXTENDED 2026-08-02 — THERE WAS A FOURTH READER, AND IT WAS MISSED.** This entry fixed three
> surfaces that each answered "how long was this planned" in one place. `buildPlannedTotals`
> (`_shared/session-detail/build.ts`) was never wired to `resolvePlannedDurationSeconds` and is the same
> bug's fourth face: the cycling analyzer resolved 59% duration adherence correctly THROUGH the shared
> resolver while the session contract's `planned_totals.duration_s` came back null from its own private
> lookup — one fact, two answers, in the same request. ⛔ **And the fix was itself starved for an hour:**
> `workout-detail` selects `total_duration_seconds` and NOT `duration`, in three places, so the resolver
> ran and found nothing. See [D-366].
>
Michael: *"bike is kind of a mess — didn't attach to planned workout."* Three defects in one chain, all
found with the row in hand.

**1. The planned Long Ride was found and refused.** Right date, type `ride`, status `planned`, nothing
claiming it — and: `computed: null · intervals: [] · total_duration_seconds: null · duration: 108`.
`sumPlanned` read only `computed.steps` / `intervals`, so it saw no duration and the caller declined.
⛔ **Every UNSTRUCTURED endurance session in the app was unattachable** — base miles, most of an
endurance week, not an edge case. (The ride was 64 min of 108 = ratio 0.59, well inside the 0.50–1.50
window. It should have attached.)

**2. The refusal lied.** `ratio == null` returned `duration_out_of_range`, which reads as *"the athlete
rode too short"* — it cost an hour of debugging and sent two hypotheses the wrong way. Now
`planned_has_no_duration` / `completed_has_no_duration`, carrying both seconds.

**3. A session pushed to Garmin was invisible.** `send-workout-to-garmin` sets
`workout_status: 'sent_to_garmin'` (`index.ts:175`) and **nothing in the codebase ever sets it back** —
the string appears in exactly two places. The candidate query listed only `planned`/`in_progress`/
`completed`, so the sessions an athlete deliberately pushed to their head unit — the ones most likely to
be ridden and come back — were the only ones that could never auto-attach. The inverse of the intent.

**4. And attaching did not re-score anything but runs.** All three attach paths ended in
`if (finalSport === 'run')`. Adherence and execution are the only outputs needing a planned session, so
a **ride or swim that attached after its analysis had run never got them, permanently** — on screen, a
Performance tab with every plan-free number present and the execution chips simply absent, which reads
as a deleted feature. All three now route through `resolveAnalyzeEdgeFn(w.type)`.

⛔ **That helper moved to `_shared/analyze-routing.ts`.** Its old header said it was kept local *"so it
bundles only here — no cross-function deploy trap"*. **That trade cost more than it saved:** attach
needed the same routing, could not import it, and grew a second table that was a one-line `if` with a
silent hole. `CLAUDE.md` names three hand-maintained routing tables as a standing hazard; this pays down
one. `orchestrator-lib` re-exports it, so its callers and 19 tests are untouched.

## D-360 — CYCLING FTP: THE ATHLETE CHOOSES, AND THEIR CHOICE WINS (2026-08-01, Michael — **PUSHED + DEPLOYED + VERIFIED ON DEVICE**)

**Closes [Q-240].** Bike was the only baseline where the app decided and the athlete could not answer
back. `resolveCurrentFtp` read learned-first, confidence-gated, so a confident estimate outranked the
number the athlete typed — and their only lever was **"Clear entry"**, which deletes their number
without giving them the one they wanted. Michael, comparing our 176 W against Garmin's 181 W:
*"yes choose auto or your entry need to add."*

**Running has had this since [Q-174]** (`easy_pace_source`), with the principle in its own comment: an
assertion beats an inference, and Garmin and TrainingPeaks both honour a value you set. This is that
pattern **copied, not reinvented** — one stored preference, honoured by the one resolver.

**TIER 0** in `src/lib/resolve-current-ftp.ts`: `performance_numbers.ftp_source` (`'learned' | 'manual'`)
outranks all existing tiers. Two pills on Baselines when both numbers exist — *Use my rides 176 W* /
*Use my number 181 W* — replacing the Clear-entry line, above a line stating that the choice sets power
zones and plan targets.

### The three properties that are pinned by tests, in order of what they'd cost

1. ⛔ **NO CHOICE IS BYTE-IDENTICAL TO BEFORE.** This resolver feeds the coach, the analyzers, the plan
   generators and every power-zone calculation — including the **56–75% aerobic band the bike's
   heart-rate read is taken in** ([D-359]). A moved default would move all of them for every athlete at
   once, silently.
2. **A preference with no value behind it falls THROUGH, never to null.** Choosing "my number" and then
   clearing the field must mean "nothing to prefer", not "this athlete has no FTP" — returning null
   would strip power zones and plan targets app-wide.
3. **Choosing "auto" does not launder a low-confidence estimate.** The `source` label still reports
   confidence (`learned-low`), so quality-gated consumers (race projections, plan materialization) can
   still refuse it. The preference selects WHICH number, not what it is worth.

### ⛔ THE FIELD COULD NOT BE EDITED, AND THAT BUG PREDATES THIS TICKET

Michael: *"it won't let me change my number."* Correct. `TrainingBaselines.tsx` had:

```
value={manualFtp || learnedFtp || ''}
onChange={... ftp: parseInt(e.target.value) || undefined}
```

Clearing the box parsed to `NaN` → `ftp` removed → **the value prop instantly re-rendered the LEARNED
number**. Backspacing snapped back to 176, so the field was only editable by overwriting it in one
gesture without ever passing through empty. The learned number is now the **placeholder**; the field
edits the typed anchor only, which is what its own comment already claimed it did.

**And typing now sets `ftp_source: 'manual'`.** An athlete who enters a number has asserted it;
requiring them to type it AND tap a pill before it counts is the same "the app decided" complaint one
step later. Reversible — the pills stay. Clearing the field drops the preference with the value.

⚠️ **VERIFIED ON DEVICE (2026-08-01, Michael):** typed 181 → "Use my number" became active → Z2 moved
from 97–132 W to 100–136 W. Switched back to "Use my rides" → zones returned. The choice reaches the
zone maths.

⚠️ **WHAT IT DOES NOT DO — and this is the part to state before someone reads it as a bug.** Each
ride's HR-at-band was recorded against the FTP in force **when that ride was analysed**. Changing the
preference does NOT re-price history: the bike read stays mixed until the window fills with rides
priced the new way. Retroactive correctness would mean a re-analysis pass, which was not attempted.

## D-359 — THE BIKE DIRECTION IS GATED AND FLOORED, AND THE ROW NAMES WHAT IT CAN READ (2026-08-01, Michael — **PUSHED + DEPLOYED; the BUILDING state device-verified, the other two unseen**)

**Closes [Q-241]** — and ⛔ **Q-241 NAMED THE WRONG FILE.** It pointed at `bike.ts:78`, which is the
SESSION-detail direction (`analyze-cycling-workout`). The STATE row reads `bike-fitness.ts` —
terrain-binned power, with HR-at-power efficiency leading whenever power is thin. **Both were ungated.**
Fixing only the filed line would have left the screen exactly as wrong and the ticket reading as closed.
*(The lesson is the standing one: a Q-entry is a LEAD. Trace the surface, don't trust the line number.)*

### 1. THE GATE — a direction must beat the metric's own scatter

Bike was the only discipline whose direction was never checked against its own noise; run durability
(`run.ts:299`) and strength e1RM (`strength.ts:191`) both require the early→recent shift to clear ~1
within-window SD. `noiseGuardStdev: 1.0` now passes at all three bike sites. **1.0, not a bike-specific
number** — a second constant would be a second definition of "beats its own noise".

**The evidence, checked rather than recalled.** A 20-min TT repeated a week apart by trained,
familiarised cyclists **in a lab** has a CV of ~**2.9%** (IJSPP 2019, n=8: TEM 4.6 W, ICC 0.99; a second
study, n=25: CV 2.9%, ICC 0.97). Our substrate is the best 20-min inside an **ordinary ride** — pacing,
motivation, drafting, heat and terrain ride on top. Our verdict band is **±2.0%**. So a band-clearing
move was evidence of nothing.
⚠️ **An earlier draft of the code comment attributed "±5%" to Coggan. That was from memory and could not
be verified; it was replaced, not softened.** A fake citation in a comment becomes the next session's fact.

### 2. THE FLOOR — 8 qualifying rides, and it is DERIVED

Below `STATE_TREND_WINDOWS.bikeDirectionMinRides` (8) the direction is `withheld`.

- The verdict compares the mean of the 2 oldest points to the mean of the 2 newest. Typical error of a
  mean falls with **√n** (Hopkins), so the error on that comparison is TE × √(2/n) per end.
- At TE 3%: **n=2 per end → ±3.0%, WIDER than the entire ±2.0% band.** n=3 → ±2.45%. **n=4 → ±2.12%**,
  the first point where a band-clearing move is at least the size of its own error. 4 × 2 ends = **8**.
- It lands on run's floor of 8 from unrelated reasoning — a check, not a coincidence.
- Coaching practice agrees from the other end: FTP is re-tested every 4–8 weeks because a threshold
  change needs a block to appear. 8 rides across the 56d window ≈ 1/wk in that bin.

**What the field does NOT give us is a published count**, and that is not for want of looking: Strava
and TrainingPeaks draw a curve and never assert a direction (nothing to gate), and **Garmin gates on
RECENCY** — 1–2 weeks of history with ~2 qualifying sessions a week, else "No Status". We already have
Garmin's half (the 21d staleness decay). **The count is ours because the CLAIM is ours.**

⚠️ **The number still soft is the ±2.0% BAND, not this floor** — it sits at or below the measurement
error of its own substrate. Filed as the honest next question, not fixed here.

**Selection rule added with it:** a QUALIFIED terrain bin outranks a FRESHER under-floor one (one climb
yesterday must not mute eight flat rides), and a `withheld` power read no longer hides a usable
efficiency read.

### 3. THE THREE READS — name the reason, never report the absence

Michael: *"a user focusing on strength may never hit that 20 minutes — so a user may joy ride. FTP is
the north star for serious riders, they don't care about heart rate like runners. But those zone 2
rides?"* Two athletes read one row and only one of them will ever produce a threshold effort. The other
would have seen **"too few to read" forever** — the app reporting its own failure at someone training
perfectly well, just not hard.

| state | what it says |
|---|---|
| THRESHOLD | `212 W threshold ↑ +3%` — watts and a direction |
| AEROBIC | `142 bpm at easy power → Holding steady`, + *"No hard efforts yet, so there is no threshold read"* |
| BUILDING | `6 rides in 8 weeks · newest today` + *"A few more and this reads your aerobic fitness"* |

⛔ **"No hard efforts yet" is a fact about HOW THEY RIDE. "Too few to read" is the app failing.** Same
data, one of them true. There are two silent reasons (`no_hard_efforts` vs `too_few_rides`) and they
must not collapse into one string.

**This is the endurance-app standard for that athlete, not an invention:** heart rate at a given power
is the efficiency-factor / aerobic-decoupling family (Friel's *Training Bible*, built into
TrainingPeaks) — the ordinary zone 2 ride **is** the test, no testing required.

### 4. ⛔ THE BIKE ROW NOW CARRIES WORDS — THIS REVERSES PART OF [D-356]

D-356 kept `NUMERIC` wordless for bike *"which has no confidence interval yet"*. **The CI was the wrong
bar.** Run durability and strength carry words with no CI because they clear the noise guard instead —
and bike now clears it. `BIKE_AEROBIC_WORDS` is a SEPARATE map (like `RUN_EFF_WORDS`); the POWER read
stays wordless, so D-356's rule is intact where it applies.

### 5. CONTINUITY — the server decides, both screens render

- `BikeFitness` gains `lead` / `powerSilent` / `hardRideCount`, and `BikeSignal` gains `recentValue`.
  **Both screens were re-deriving "is power leading" from `power.verdict !== 'needs_data'`** — a second
  copy of a rule that went wrong the moment `withheld` existed. They read the server's answer now.
- `recentValue` comes off the SAME series as the direction, so the number and the arrow cannot disagree.
- **Performance's per-ride block was renamed to State's words** ("Heart rate at easy power") and says
  *"Counts toward your bike read on State"*. It was already the exact value State trends; only the
  vocabulary diverged, which is enough to make one measurement look like two.

### What the live screen then caught, in order

1. **"over 8wk · 0 rides" under "6 rides in 8 weeks"** — `lead` falls back to POWER when neither signal
   asserts, so the receipt cited the empty hard-ride pool. Two counts contradicting each other, the
   wrong one looking official. Receipt dropped in that state.
2. **Dropping the whole receipt was an over-correction** — Michael: *"this include today?"*, which the
   row could no longer answer. Recency is back (`newest today` / `newest 3d ago`); only the count is gone.
3. **The FTP line was pulled from the aerobic read, then put back.** The first reasoning ("FTP has
   nothing to do with a heart-rate verdict") was wrong: the aerobic band **is** 56–75% of FTP, so the FTP
   is what "easy power" MEANS. The sentence changes with the read instead — *"Easy power is set from your
   estimated FTP of 176 W"* — stating a definition, not implying a measurement.

⚠️ **Payload 159 → 160, BOTH constants** ([D-355]).

## D-358 — THE BIKE ROW NAMES ITS FTP, AND SAYS ONLY WHAT IT CAN PROVE (2026-08-01, Michael — **PUSHED + DEPLOYED, not device-verified**)

The bike row said `est (FTP)` and never said *which* FTP. It now reads:

> Your estimated FTP is 176 W — not one you confirmed.

…and the ⓘ adds how that number is made: **"FTP is estimated from your hard rides — 95% of your best
20 minutes."** ⚠️ Conditional — appended only when the basis IS an estimate, because telling an athlete
who tested and typed their own FTP that it was guessed is a confident falsehood.

**The method, traced from `learn-fitness-profile` STEP 4 rather than described from memory:** best
20-min power × 0.95, hard efforts only, rides 20–120 min, ≥2 efforts (≥3 for high confidence). Coggan's
field protocol — the same arithmetic as a 20-minute test, taken from 20 minutes the athlete already
rode hard instead of asking them to go and test.

### Why the number was missing: nobody hid it, nothing asked for it

`FitnessAnchor` exists to answer ONE question — *where does the tick sit on the band*. Run's anchor
metric IS the band metric, so it places. Bike's is FTP (watts) against a watts-per-heartbeat band — a
metric mismatch, explicitly deferred at `assemble.ts:588`. So bike got `tickPct: null` and the value —
which the placement is computed FROM — was carried in and dropped one line later. **Third instance of
this shape today**, after HRV and resting HR: not absent, not rejected, just never routed anywhere.
`FitnessAnchor` now carries `value` + `metric` for run, bike and swim — including rows that render
neither, because the ask was continuity, not one row.

### ⛔ THE CORRECTION, and it is the part worth keeping

I shipped *"Measured against an estimated FTP of 176 W"* and told Michael that number was **"provably
the one behind the −0.4%."** **I had not checked, and it is not.** `anchor.value` is the
`fitness_baselines` record; the per-ride power BAND is `workout_analysis.bike_fitness_v1.band_source`,
written by `analyze-cycling-workout` at ANALYSIS time from whatever FTP resolved then. Two separately
derived numbers — probably equal, not verified equal, and rides analysed weeks apart need not agree
with each other, in which case **there is no single number to name.**

**So the sentence was rewritten to state the FTP ON RECORD and the fact that the basis is an estimate**
— two claims that are each true independently. ⚠️ **This matters more than the wording:** the whole
point of the row's rework was removing numbers that sound more certain than they are, and a specific,
confident sentence gets believed *because* it is specific. **The fix is invisible in the diff.** Nothing
in the current code shows that a stronger sentence existed, was wrong, and why — which is exactly how
someone re-adds it later thinking it is an improvement.

*(Incidentally: Michael's typed and learned FTP are both 176 W, so no discrepancy was live on his
screen. The rule stands regardless — it was luck, not correctness.)*

### ⚠️ AND IT SHIPPED BROKEN FIRST, FOR THE SAME REASON

The first cut rendered **nothing**. I gated the value on `anchor.metric === 'ftp'` — a string that
comes straight from the `fitness_baselines` row, **which I never checked**. Wrong guess, silent
failure, a sentence with a hole in it that reached Michael's screen.

⛔ **SAME ROOT AS THE OVERCLAIM ABOVE, one hour apart: acting on an assumed value instead of a traced
one.** The overclaim asserted something unverified and sounded confident; this asserted something
unverified and rendered blank. **One of those is louder, neither is safer.**

The guard is gone. That branch already sits inside `src`, which is derived from
`efficiency.basis === 'coggan_ftp'`, so the anchor in scope IS the FTP — the value being present is the
honest gate, and the string was guessing at a fact that was one query away.

### The client fallback, and why it only became honest afterwards

`fitnessAnchors` is written by `compute-snapshot` and only rewritten on an **ingest**; the coach
FORWARDS it. So the value lands after the athlete's next sync, and a field that appears "sometime after
your next ride" reads as broken. The row now prefers `anchor.value` and falls back to
`resolveCurrentFtp` on the client.

⛔ **I argued AGAINST exactly this an hour earlier, and was right to.** A client-resolved FTP cannot
promise it is the number the measurement used — but the copy no longer claims that. It reports the FTP
**on record**, which is precisely what `resolveCurrentFtp` returns. **The objection died with the copy
that caused it.** Uses the one resolver (FTP fracture #2), never a second read of the raw column, and
only fires when the server has not supplied a value — so it disappears on its own as snapshots catch up.

**Also cleaned up:** `cappedSignalColor` (the STEP 1 stopgap from [D-353]) is deleted. It forced the
BODY heart-rate row grey while the server fix deployed; the server fix landed and then the row itself
was deleted ([D-354]), so it was guarding something that no longer exists.

## D-357 — TWO CUES, TWO ANSWERS: ⓘ is the definition, "more" is the read (2026-08-01, Michael — **PUSHED + DEPLOYED, not device-verified**)

**On a fitness row, ⓘ and the read were one blob behind the metric word.** An athlete who wanted *"what
is this metric"* got the whole diagnosis; an athlete who wanted the diagnosis had to tap a glyph that
promises a definition. Two questions, one cue.

- **ⓘ → the DEFINITION.** One sentence. *"Efficiency is your speed per heartbeat, adjusted for hills and
  for heat — rising means faster at the same effort."* Nothing else.
- **"more" → the READ.** Plan context first (the posture sentence), then what the trend is saying.

**"more" is a WORD, not a glyph.** ⓘ already promises a definition; a second symbol would have been a
second mystery. It sits at the right of the receipt line so the header keeps one cue, and it is **gated
on there being something behind it** — a cue that opens an empty panel is worse than no cue.

⛔ **BIKE IS DELIBERATELY UNCHANGED, AND SOMEONE WILL TRY TO "FIX" THAT.** The request was *"run + bike,
same treatment"*, and the trace said otherwise: bike has **no blob to split**. `FitnessDotBlock` renders
`explain` alone — already definition-only — and `postureSentence` is passed only to the run row
(`StatePerformanceSection.tsx:1039`). Giving bike a "more" would mean **writing a read it does not
have**, and its trend prose is precisely what [D-356] deferred until the bike has a confidence interval
of its own. **The asymmetry is the correct state, not an oversight.**

**Also this change, same row:** *"grade-adjusted"* is gone from the chart caption — accurate, and
jargon. It is replaced by a plain sentence beside the heat line: *"Evened out for hills, so a hilly week
doesn't read as slower."* The two sit together because they answer one question — **what has already
been taken out of this number**, so the athlete knows what *not* to explain away. Heat is stated as a
cost still carried; hills as removed, because they are. ⚠️ Gated on `eff.route` (the grade adjustment is
the route engine's, so the claim is untrue on the fallback path), and the caption now renders nothing
under an 8°F spread rather than falling back to the bare method word.

## D-356 — A SHOWN NUMBER ALWAYS SHOWS ITS UNCERTAINTY: the run efficiency row gets plain words, a whole percent, and its CI (2026-08-01, Michael — **PUSHED + DEPLOYED, not device-verified**)

> ⚠️ **PARTLY REVERSED SAME DAY — the BIKE clause only ([D-359]).** This entry kept `NUMERIC` wordless
> for the bike *"which has no confidence interval yet"*. **The CI was the wrong bar**: run durability
> and strength carry words with no CI because they clear the noise guard instead, and bike now clears
> it too (`bike-fitness.ts`). The bike's AEROBIC read has words via a separate `BIKE_AEROBIC_WORDS`
> map; its POWER read is still wordless. **Rules 1–3 below are untouched and still govern the run row.**

**Three rules, and the third is the one that generalises:**
1. **Lead with the direction in plain language.** *"Slower at the same effort"*, not a trend word.
   Efficiency is speed per heartbeat, so the phrase says what the number means to a runner.
2. **Round the headline magnitude to a whole percent.** A tenth of a percent on a regression slope
   across three months is false precision.
3. ⛔ **Always pair a shown number with its cached confidence interval.** Every state that renders a
   number renders its uncertainty. **No exceptions** — that is the rule that makes the rest trustworthy.

### AMENDMENT (same day) — the range is ALWAYS-VISIBLE; the tap-gated placement is SUPERSEDED

⛔ **The original placement — "the range lives in the ⓘ expand" — is SUPERSEDED, not merely added to.**
The range now renders on the always-visible receipt line directly under the headline:

> `range −24% to −6% · over 12wk · 25 runs · 1d ago`

**Why the first placement failed its own rule.** Rule 3 is *a shown number always shows its
uncertainty*. The headline percent is on screen **without a tap** — so gating its interval behind one
left the default view showing a **naked, precise-looking number**, which is the exact thing the rule
exists to prevent. A range the athlete has to go looking for does not satisfy it.

**It stays in the expand as well.** The expand carries the fuller *"why"* sentence; the visible line
carries the number's own uncertainty, next to the number.

⚠️ **THIS IS RECORDED BECAUSE A FUTURE CLEANUP WILL READ THE TWO AS REDUNDANT AND STRIP ONE.** They are
not a duplication — they answer different questions in different places, and removing the visible one
silently reinstates the naked number. **If you are about to delete one, delete neither.**

**They cannot disagree:** both call the same `ciRange(eff.route.ci)` — one helper, one rounding, two
call sites (`StatePerformanceSection.tsx:719` visible, `:814` expand). Printing two different intervals
for the same number would have been worse than showing none.

⚠️ **A `holding` range may straddle zero** (`−3% to +2%`). Shown deliberately — that is the honest
picture of a verdict meaning *"no real change"*, and hiding it would make a flat read look more certain
than it is.

### ⚠️ THIS PARTLY REVERSES A DECISION THAT WAS NEVER WRITTEN DOWN

Earlier the same day, the fitness rows were stripped of verdict words entirely — *"arrow + number, no
word"*, applied to run and bike, with the down arrow recoloured from amber to neutral. **That call
lives only in commit `6e6faf6a`.** It was never given a D-entry, which is the exact failure the
overnight audit had just finished cataloguing (see [D-270]). Recording it here so the sequence is
legible:

- **REVERSED for the run row:** the words are back, as plain phrases rather than trend jargon.
- **STILL STANDS:** the down arrow is **neutral, not amber** — a decline here is a direction, and heat
  or a base block routinely cause it.
- **STILL STANDS for the BIKE**, deliberately. Bike remains wordless **until it has a confidence
  interval of its own**, which it does not. That is why the words went into a NEW `RUN_EFF_WORDS` map
  rather than into the shared `NUMERIC` — adding them there would have silently changed the bike row.

### The overrule, and it is the sharp part

The first build left the range OFF the `sliding + recentlyFlat` state, keeping only *"dropped earlier,
steady recently"*. **Michael overruled it, and the reasoning is the useful record:** that state renders
a **flat arrow** beside a precise-looking −15%, which makes a **net figure over the whole window** look
settled and certain when its recent half is flat. **It was the worst state to drop the range on, not
the safest** — the false precision this change existed to kill, quietly reappearing on the one state
that reads most confident.

### The load-bearing verification

**The range brackets the number actually shown**, which was the only way this could have quietly lied.
`assemble.ts:391` sets `pctChange: runRoute.pct`; `heat-adjust.ts:203` documents `ci` as the 95% CI **of
that same pct**. Same figure, not a sibling estimate. ⚠️ `ci` is **null** on the `linear_k` fallback and
on the non-route path — those states show **no range rather than a fabricated one**.

**Display only.** No computation moved; `eff.pctChange` stays raw on the object and rounding happens at
the render call (`verdictSignedPct` gained an opt-in `dp`, so swim, rest and bike keep their decimal).
The CI was already computed and already cached — and in fact was **already on screen**, phrased as a
footnote. This makes it the confidence statement it always was.

## D-355 — THE CLIENT CACHE FLOOR MUST TRACK THE SERVER VERSION, OR DEPLOYS SILENTLY DO NOT LAND (2026-08-01, **PUSHED + DEPLOYED**)

**Michael, on a screen that had not changed after a correct deploy:** *"still see heart rate response."*
The code was right. The row was deleted, built, pushed and deployed. **It could not reach him.**

**THE MECHANISM, and it invalidates a ritual this log repeats four times.** On a tab mount the client
does **not** call the `coach` function. `useCoachWeekContext.ts:~699` reads the `coach_cache` row
**directly** and gates it on `COACH_CLIENT_MIN_PAYLOAD_VERSION`, then returns. That constant sat at
**144** while the server had reached **157**. A cached v156 row clears 144, renders, and the function
that would have recomputed it is never invoked.

So *"bump `COACH_PAYLOAD_VERSION` so cached rows re-source"* — the instruction in ~20 version notes —
**only works when the edge function is the reader.** On mount it is not. **Thirteen versions of server
changes could sit cached and unreachable, each deploy looking like it had silently failed.**

**THE RULE: bump both, always.** `coach-contract.ts` already said *"must match / bump both"* and it
drifted anyway, so the comment now explains **why** rather than asserting the rule — the next person
will reason exactly the way I did below.

⛔ **THE AUDIT FOUND THIS DRIFT THAT MORNING AND TALKED ITSELF OUT OF IT.** `AUDIT-docs-vs-code-2026-07-31.md`
flagged server 155 vs client 144 and concluded: *"the client value is a FLOOR, not an equality, so this
is not necessarily the same bug."* **It is the bug.** A floor below the server version is precisely a
window in which corrected rows cannot reach a device. Filed here because the softening — not the
drift — is what cost the session.

---

## D-354 — BODY IS WHAT YOU LOGGED: the heart-rate and cross-training rows are DELETED (2026-08-01, Michael — **PUSHED + DEPLOYED, not device-verified**)

**Michael:** *"body is simply how you've been reporting."* The section is now **one row** carrying the
two things the athlete reports — effort and soreness — and nothing measured.

### Why the heart-rate row went

It was a **pure rollup**: since D-346 its contributors were `run.efficiency` + `bike.efficiency`, the
same two verdicts the RUN and BIKE rows render beneath it, with **no number of its own** (speed-per-
heartbeat and watts-per-heartbeat cannot honestly be combined). It died in three steps, each removing
something it could not support — it could not out-alarm the rows below (D-353), could not restate them
(v156), could not use words (the no-verdict-word rule). What remained was an arrow duplicating the two
rows under it, pointing a direction its own contributors **split on** (Q-238), stamped with a date that
**hid its stale half** (Q-239).

⛔ **THE DURABLE REASON IS THE INSTRUMENT, and it is why the tombstone says DO NOT REBUILD.**
Overreached athletes show submaximal HR going **down** and HR recovery getting **faster** while RPE
rises (`SCIENCE-concurrent-training-interference.md`) — an HR-based fatigue read can be **actively
backwards in the exact case it is wanted.** Subjective measures outperform it (BJSM review, cited in
`longitudinal-signals.ts`). That is the whole argument for BODY reading reported effort and soreness.
Within-session fading is a **RUN** signal — sport-specific, confounded by heat and terrain — and
already renders on the RUN row.

### Why cross-training went

*"People know if they are hitting their numbers."* It compared declared targets against GPS mileage —
not reporting, and not something the athlete needs told. ⚠️ **It never detected interference between
disciplines**; that verdict was retired in v126 because the effect is smaller than the measurement
error on e1RM. The name invites a rebuild, so both deletions carry tombstones.

### What the row says now

> **What you've logged** — Effort about as usual: 3.6 of 10 avg vs 3.8 typical. Soreness normal for
> you: 2.1 of 7. Logged on 4 sessions.

- **Scales are shown** — "3.6" with no denominator is not a number anyone can read.
- **Coverage is PROVENANCE, not a nudge.** *"If we are clear that these numbers are the accumulation of
  what's logged, that will encourage people."* Compliance is the documented weakness of subjective
  monitoring, and the post-session prompt does **not** force an answer, so partial coverage is normal.
- **Soreness is against the athlete's OWN baseline** (`resolveCurrentSoreness`), never a population
  norm — a 3 means different things to different people. Silent until 5 entries, and it **says so**
  rather than dropping out.

⚠️ **BUILT AS A SIBLING, NOT A SECOND BASELINE.** The plan was a soreness average on the 28-day norms
beside RPE's. `resolveCarriedInSoreness` already did soreness as a Z-score against the athlete's own
history, so that would have put a cruder baseline next to a better one — the "second vocabulary beside
the first" pattern `CLAUDE.md` names. The new accessor sits next to it and shares its guards.

### The persistence line

Soreness above the athlete's own normal on **4 of the last 6** logged sessions →

> Soreness above your normal on 4 of your last 6 sessions.   Adjust ›

**It states a fact and points at a door.** No diagnosis, no cause — soreness clustering around lifting
days is an observation; *"your lifting caused this"* is the causal claim v126's evidence bar rejects.
**4-of-6 is the monitoring standard**, not a number chosen here; `longitudinal-signals.ts` uses that
shape against an absolute floor and its header says the floor should become baseline-relative once
history exists. This is that. **Counted per session, not from the window average** — a mean can be
dragged over the line by one very sore day, which is what a persistence gate exists to ignore.
**Advisory only:** it can never move the fitness read, or the honest reporting stops.

⚠️ **THE LINE ONLY. The endurance steer behind Adjust is NOT built** — `adapt-plan` can progress/deload
strength, re-lay-out a strength week and update paces, and has nothing that reduces endurance volume.
Adjust is a scaffold for endurance; sending someone there is honest because that tab says so itself.
A dead button would not have been.

## D-353 — A ROLLUP MAY NOT OUT-ALARM ITS OWN EVIDENCE: severity is capped at the contributors (2026-08-01, Michael — SHIPPED; its subject row was deleted hours later)

> ⚠️ **THE ROW THIS WAS WRITTEN ABOUT IS GONE — [D-354], same day.** The BODY heart-rate row was
> deleted once it became clear it could not out-alarm the rows below it (this entry), could not
> restate them, and could not use words. **THE RULE SURVIVES AND IS STILL LIVE:** `capRollupTone`
> (`_shared/state-trend/severity.ts`, 5 tests) applies at the composer to every rollup, present and
> future. ⚠️ It currently has **no caller** — the only rollup that used it was that row. Do not
> delete it as dead code; it is a rule waiting for the next rollup, and its two known gaps are
> filed as [Q-236] and [Q-237].
> ⚠️ STEP 1's client stopgap (`cappedSignalColor`, `StateTab.tsx`) is now doubly redundant and can
> be deleted whenever.

**Found by Michael on his own screen.** The State BODY row said *"Running easing off (1d ago) · bike
holding (17d ago)"* in **amber**. Two inches below, the RUN row said **"↓ −15.2%"** in neutral grey —
the same measurement, rendered as a non-event.

**⛔ THIS IS NOT A VOCABULARY MISMATCH, WHICH IS WHAT IT LOOKS LIKE.** The BODY row is a **pure
rollup**: since D-346 its contributors ARE `run.efficiency` and `bike.efficiency`
(`_shared/state-trend/assemble.ts:837-843`) — the very verdicts the RUN and BIKE rows render. Its
verdict is derived from those and nothing else (`dirOf`, `assemble.ts:850-858`; **verified before
implementing** — it computes no metric of its own). So the row was **manufacturing a severity its own
evidence does not support.** Michael: *"Fixing the color as a one-off leaves the mechanism intact."*

**How it got there, and why it was invisible:** the tone was a bare literal in the composer —
`declining ? 'warning' : …` — carrying a comment that pinned it to a *different row's* appearance:
*"WARNING, NOT DANGER — the RUN row renders the same movement in amber."* True when written. The RUN
row went neutral on 2026-08-01 and the literal did not, and nothing could have caught it: **an
assumption about another surface's rendering, hardcoded, with no link back to the thing it assumed.**

### THE RULE

> **A rollup row's severity may never exceed the maximum severity of its contributors.**
> Less severe is legitimate aggregation. **More severe is invention.** If every contributor renders
> neutral, the rollup renders neutral.

Encoded as `capRollupTone` / `severityOfVerdict` (`_shared/state-trend/severity.ts`, **5 regression
tests including the exact bug case**), applied **at the composer** so every rollup inherits it —
present and future. `positive` ranks as severity 0: it is a *valence*, not an alarm, so the cap never
flattens a green row. No contributors → capped at neutral, because a rollup of nothing should not be
the loudest thing on the screen.

**The companion decision, same place, different problem:** the contributor clause is **deleted**. It
restated the two rows directly beneath it — the redundancy already killed in coach v119 (restating
the LOAD bar) and v131 (the running story told twice). It only *became* redundancy when D-346 pointed
this row at `run.efficiency`; before that the row had its own metric and naming its inputs was honest.
**Glass-box is not weakened:** the evidence is rendered adjacent and tappable directly below, and
glass-box requires evidence be *reachable*, not *restated*. The ages and the stale-half naming move to
the provenance (one tap), so nothing is lost — only demoted.

**Shipped in two pieces, deliberately** — *"I want the screen correct before the deploy lands."*
- **STEP 1 (client, `c2d6df90`, PUSHED + DEPLOYED):** the cap enforced at the render edge
  (`cappedSignalColor`, `StateTab.tsx`) + one minus glyph (`verdictSignedPct`'s holding branch printed
  an ASCII hyphen beside the sliding branch's U+2212). ⚠️ **A STOPGAP, MARKED FOR DELETION** — it fixes
  the screen, not the mechanism; anything else reading `trend_tone` still saw `warning`.
  ⚠️ **The clamp had to cap DIRECTION as well as tone** — `trendColor` falls *through* a neutral tone
  to `dir === 'declining' → amber`, so clamping tone alone was decorative. Caught in review, not on
  the screen.
- **STEP 2 (server, coach **v156**, PUSHED — ⛔ NOT DEPLOYED):** the cap at the composer + the clause
  deleted + STEP 1's stopgap now removable. **Deploy owed:** `coach`, and — per the `_shared` trap —
  the other three importers of `state-trend/index.ts` (`compute-snapshot`, `workout-detail`,
  `analyze-cycling-workout`) whose bundled copy changed, though the added export is inert for them.

**Supersedes** the tone literal introduced in coach v154. **Does not touch** the efficiency
thresholds, the RUN/BIKE rows, or D-346's contributor wiring.

⚠️ **TWO GAPS IN THE CAP, FILED THE SAME DAY AND DELIBERATELY OUT OF SCOPE** — Michael, on reviewing
the implementation. Both are the D-353 argument applied where D-353 did not reach:
- **[Q-236]** — the cap is **one-directional**. `positive` ranks at severity 0 (so green rows are
  never flattened), which means a rollup can still assert `improving` over all-neutral contributors.
  Same class, opposite sign, far lower stakes — nobody backs off training over false good news.
- **[Q-237]** — an **empty** rollup resolves to `neutral`, and neutral is still a verdict. Under
  glass-box a row with zero evidence should render nothing, not "holding". Currently **unreachable**
  (`coach/index.ts:2486` gates on `contributors.length > 0`), so the branch is defensive only — but
  the guard lives in the CALLER, not the RULE, and the rule is meant to be general.

## D-352 — THE IN-SESSION CUES: SURFACED, NARROWED, AND THE AMRAP RULE REVERSED (2026-08-01, **PUSHED + VERIFIED ON DEVICE 2026-08-01, Michael**)

> ✅ **VERIFIED ON A DEVICE, 2026-08-01 (Michael): "it works."** The logger checks in
> `POLISH-PUNCH-LIST.md` were walked in a real session — the bar-speed lines render and are legible,
> the open set reads AMRAP, a Box Jump carries no bar-speed cue, and the accessory line sits above the
> block with the exercise name visible. The verification is *seen and accepted*, not line-by-line copy
> review.

**⛔ THE BAR-SPEED DOCTRINE HAD NO `D-NNN` UNTIL NOW.** It was written on 2026-07-25, argued in a
long comment at the top of `src/lib/strength-focus-copy.ts`, pinned by `bar-speed-copy.test.ts`, and
recorded nowhere a session would look. It was also **rendered by nothing for a week** — `barSpeedLineFor`
was reachable only from its own test. Both halves of that are the failure this log exists to prevent:
*a decision that lives only in a comment does not exist, and a capability that reaches no screen is
starved, not built.*

- **Decision 1 — the AMRAP ends SHORT OF FAILURE, not at the first slow rep. This reverses the
  2026-07-25 rule deliberately.** The original was *"slow rep = last rep"* (Michael's own phrasing —
  "the AMRAP terminator and the whole doctrine in four words"), justified as *"speed is the earliest
  sign of form breakdown"*. **It was stricter than the source it cited.** Wendler's instruction for
  the "+" set is to **grind it out, not to failure** (5/3/1 2nd ed. p.24). A grinding rep is a rep,
  and the rep count off that set is what moves the training max — so a speed-stop **systematically
  under-reports the number the whole block runs on.** Copy: `Grind it out. Stop before failure.`
  ⚠️ **THE STOP RULE NEVER MOVED — only its position.** Not-to-failure is still the ceiling; it now
  sits at the edge of failure rather than at the first sign of effort. `BAR_SPEED_AMRAP_AFTER` was
  realigned for the same reason ("Not to failure — you train tomorrow"): the old closer carried the
  retired speed-stop and would have argued with the new opener on the same set.

- **Decision 2 — the cue renders on the FOUR MAIN LIFTS ONLY, gated by `isMain531Lift`.** The first
  cut gated on "not an assistance row", which let it onto everything the block prescribes that is not
  an accessory: Michael's **Box Jump** read *"Every rep at the same speed as the first"* — advice for
  a barbell set under a percentage of a training max.
  ⛔ **DELIBERATELY NOT `roleForExercise(x) === 'primary'`,** and this is the reusable part.
  `primary` is wide on purpose (goblet squat, RDL, trap-bar deadlift, DB bench all qualify) **and it
  DEFAULTS unmapped names to `primary`** so scoring never silently discounts. Gate a cue on a
  permissive default and every exercise the library later gains inherits a 5/3/1 instruction — the
  bug grows on its own. `isMain531Lift` is a curated set that **misses to FALSE**: no cue beats the
  wrong cue. Not a containment test either — "Jump Squat" contains "squat" (same trap
  `canonicalize.ts` documents for 1RM purposes).

- **Decision 3 — plyometrics are their own equipment type and show reps only.** `getExerciseType`
  gained `plyo`; box/broad/depth/tuck jumps, jump squats, skater hops, bounding and plyo push-ups
  render **no weight column, no equipment strip, no plate calculator, no cue.** A jump has no
  external load to record, and its intent is maximal every rep by definition, so a "keep every rep
  the same speed" line describes a different kind of exercise.
  ⛔ **CHECKED FIRST, ABOVE EVERY OTHER PATTERN — and that ordering IS the fix.** Box Jump fell
  through every rule to the `barbell` DEFAULT, drawing a 45 lb bar and a plate calculator.
  **That default has now caused three separate bugs**: the dumbbell Farmers Carry (Q-180), the
  single-leg hip thrust (D-351 Decision 6), and this one. ⚠️ **Next session to touch
  `getExerciseType`: consider whether the default should be "unknown → no equipment UI" rather than
  "barbell".** Three strikes is a pattern, not a coincidence.

- **Decision 4 — the assistance cue is a SECTION note, not a per-exercise property.** Rendered once
  above the first assistance card. Two bugs came from getting this wrong on first attempt: placed in
  the header's flex row it **took width from the exercise-name search box until the name was
  invisible**, and rendered per card it repeated three times on one screen. Copy:
  *"Split these into as many sets as you need. Leave a rep or two — never to failure."*
  Basis: Wendler 5/3/1 2nd ed. p.24 / p.102 — assistance runs across as many sets as needed and is
  explicitly not taken to failure; too much assistance is named as the most common mistake with the
  programme.
  ⚠️ It contains "as many" and "failure", which `bar-speed-copy.test.ts` bans on the PRESCRIBED-set
  lines. **Not a lint miss:** there those words mean rep-chasing; here "as many" governs SETS and
  "failure" is a stop rule. `strength-accessory-copy.test.ts` pins the intent so nobody widens that
  lint over this constant.

- **Decision 5 — the deload line stops conceding.** "Nothing to prove. Move it fast anyway." →
  **"Light on purpose. Move it fast."** The concession was the part an athlete reads, and it framed a
  prescribed light day as a write-off rather than as the plan working.

- **Decision 6 — "all out" is displayed as "AMRAP".** The field's term; the strength surfaces are
  meant to read as familiar to a Strong/Hevy lifter.

- **⛔ `validity_set` REMAINS UNRENDERED, AND THIS IS THE ONE TO NOT "FIX".** Its line — *"Five at
  ninety-five. This one decides the number."* — is true only once `verdictFrom95Set` is wired, and it
  is WIRED as of D-341 — `loading/cycle-verdicts.ts:116` supplies the verdict and the composer reads it
  (`strength-primary-plan.ts:1275`, verdicts from `generate-strength-plan/index.ts:149`). ⚠️ The bare
  `workingNumberForCycle` (`wendler-531.ts:210`) still governs the FORECAST path, where
  `unknownMeans: 'advance'` deliberately preserves old behaviour for weeks that have not happened. Re-check
  this gate before leaving the line unrendered. ⟨A31⟩ The flag is
  never passed and the call site says exactly when to pass it. Same gate as `STRENGTH_ADVANCE_COPY`.

- **Verification:** 25 pins green across `bar-speed-copy`, `strength-accessory-copy` and the new
  `exercise-role.main-lift` suites, including one that fails if `isMain531Lift` ever starts
  defaulting true. **Not device-verified.**

- **Cross-ref:** D-351 (the same pass's record fixes), D-326 (the difficulty tap, same logger),
  D-324 (RIR removed from this protocol), Q-180 (the first `barbell`-default bug),
  `exercise-role.ts` (D-208's table, which this deliberately does not reuse for the gate).

---

## D-351 — THE BAND CARRIES A NUMBER THE ATHLETE ENTERED, AND TYPED REPS STOP VANISHING (2026-08-01, **PUSHED + DEPLOYED; the LOGGER half VERIFIED ON DEVICE 2026-08-01, Michael**)

> ✅ **THE LOGGER HALF IS DEVICE-VERIFIED, 2026-08-01 (Michael): "it works."** The Assist (lb) box, the
> plain weight box on the Single Leg Hip Thrust, and the save prompt for typed-but-unticked reps were
> seen in a real session.
> ⚠️ **The PERFORMANCE half was NOT part of that pass** — chin-ups/dips showing pounds, the assisted
> set pricing below bodyweight and the loaded set pricing above it are still unseen. They stay in the
> punch list's awaiting block.

**Context.** The screens were made honest first (D-347 / D-349 / D-350). What remained was upstream:
the logger's *record* of what happened was lossy in two ways, and everything downstream — volume,
load, ACWR, the reconciler, the coach's verdicts — inherits whatever it writes.

**⛔ FIELD GROUNDING, BECAUSE THIS REVERSES TWO OF OUR OWN DECISIONS.** Every major tracker computes
volume as `weight × reps`, where "weight" is body weight for a plain bodyweight move, `(bodyweight +
added)` when loaded, and `(bodyweight − assist)` when assisted. Hevy's assisted formula is literally
`(bodyweight − assisted weight) × reps`, and it computes **no volume at all** when body weight is
unset. Strong behaves the same. Two constants from the field decided the shape here:

1. **The assist number is USER-ENTERED.** No tracker (Strong, Hevy, Jefit) maps a band colour or a
   light/medium/heavy level to pounds, because no such table exists across manufacturers.
2. **Assisted sets produce no 1RM or weight PR** — reps only. Efforts already enforces this
   (`best_weight` moves only on external weight) and it is unchanged.

*Sources: help.hevyapp.com "Assisted Bodyweight Exercises — How it Calculates Volume and PRs";
help.hevyapp.com "Exercise Performance Tracking"; strong.app.*

- **Decision 1 — bands go to NUMBERS, one rule, direction from the exercise.** A band carries a
  pounds value. On an assist-capable move (`chinup`/`pullup`/`dip`) it SUBTRACTS; on an
  add-resistance move it MULTIPLIES like any weighted set. The code already knew the direction —
  `bandMeansAssistance` (D-348) — so this adds a magnitude to an axis that existed, not a new axis.
  **Why non-negotiable:** a level cannot be subtracted from a body weight without us inventing the
  pounds, which is the one thing the pricing rule refuses to do. Three levels could therefore only
  ever be *recorded*, never *counted* — which is exactly what happened: a band-assisted chin-up
  priced identically to an unassisted one, so the block's actual progression (walking the tension
  down, Wendler's own instruction) was invisible to the score.

- **Decision 2 — NO preloaded level→pounds table.** The field does not have one and neither do we.
  A number the athlete recorded is measurement; a number derived from the word "Heavy" would be a
  fabrication wearing measurement's clothes — the precise failure Q-233 was written to avoid, which
  is why that entry's conclusion was wrong rather than its reasoning.

- **Decision 3 — ⛔ HISTORY IS NOT MIGRATED, AND THIS IS A DELIBERATE EXCEPTION TO D-348.** D-348
  established that shipping a pricing change without re-pricing history makes an identical week read
  differently and the trend lie. **That rule is suspended here on purpose** (Michael): one week of
  data, a single pre-launch user, no trend to break. So `resistance_level` holds WORDS on every row
  written before today and POUNDS after it, forever. `bandLoadLb` (`_shared/workload.ts`) is the one
  place that reads both encodings, and an unparseable value prices exactly as it did before.
  **Why it is written down:** the next session will find two encodings in one column and read it as
  rot. It is not rot; it is a decision. Do not "clean it up" with a migration.
  ⚠️ The consequence, stated: a word-era assisted chin-up still over-counts at full bodyweight. That
  is the old behaviour, deliberately preserved, not a bug.

- **Decision 4 — an assisted set floors above zero** (`MIN_ASSISTED_EFFECTIVE_LB = 5`). A band that
  cancels nearly all of an athlete's body weight still leaves a set that was performed, so it may not
  price at zero — but the remainder is not measurable either. Same philosophy as
  `BAND_SET_VOLUME_TOKEN`: visible, far too small to move a verdict.

- **Decision 5 — the missed-Done prompt ASKS, it does not auto-tick.** Michael's 30 Jul session had
  three hip-thrust sets with 10/5/10 reps typed and none ticked Done. They saved (the save filter
  keeps any set carrying a number, `StrengthLogger.tsx:~3730`) and they RENDERED under "Completed" —
  and the volume rule dropped all three, because it counts a set only when `completed !== false`.
  **The gap is between two honest rules**: the save layer says a typed number is worth keeping; the
  scoring layer says an unconfirmed set is not a receipt (D-204, and it is right — an untouched
  PREFILL must never count). The athlete falls through the middle.
  ⛔ **Auto-ticking on save was rejected.** It substitutes the app's word for the athlete's (Law 2),
  and it would quietly undo D-204's protection the first time a prefill picked up an edit. The prompt
  names the exact sets, states the consequence, and offers both answers. Prefills are excluded by
  construction.
  ⚠️ **Confirmed before building: the typed reps ARE persisted** — they were read back out of
  `workouts.strength_exercises` for the 30 Jul session. Nothing was lost; it was uncounted.

- **Decision 6 — a single-leg hip thrust is not a barbell lift.** `getExerciseType` matched no
  pattern for it and hit the `barbell` default, so the logger drew a 45 lb bar and a plate calculator
  over a movement loaded with one implement on the hip. Classified `goblet` — single weight, no bar,
  no plate math, and **no `lb/hand` label**, which a `dumbbell` classification would have printed and
  which is wrong in the other direction. Bilateral barbell hip thrusts are untouched. ⚠️ **Second
  time the default has been the bug** (Q-180, the dumbbell carry that got a barbell).

- **Decision 7 — the dead `done` field is deleted** (`StrengthLogger.tsx`). Written on every
  prescribed set, read by nothing — verified across `src` and `supabase` before removal. ⛔ **It is
  not the Done button**, which writes `completed` and is untouched. Two fields for one idea, one of
  them dead, adjacent in the stored JSON, is how the next session fixes the wrong one.

- **Decision 8 — a WEIGHTED chin-up prices `(bodyweight + added) × reps`, and this reverses my own
  "filed, not fixed" the same day.** The first cut left the mirror case asymmetric — assistance
  subtracted from body weight while added weight REPLACED it, so a +25 lb chin-up priced *below* the
  same athlete's bodyweight set — and filed it on the grounds that "rule 1 governs every weighted set
  in the app, so changing it is a far wider blast radius than this pass."
  ⛔ **That reasoning was wrong and Michael caught it.** The blast radius is a property of the GATE,
  not of the formula. `bandIsAssistance` is true for exactly `{pullup, chinup, dip}`, so every
  barbell and dumbbell lift arrives with it false and falls through to rule 1 **byte-identical**.
  Three movements change; a squat cannot move by a pound. **The lesson worth keeping: when a fix
  looks too wide, check whether an existing flag already narrows it before filing it as deferred.**
  ⚠️ `bw > 0` is required — with no recorded body weight there is nothing to add TO, and rule 1 still
  governs. Pinned both ways, including an explicit zero-blast-radius test that fails if the gate is
  ever loosened.
  ⚠️ This does change how a HISTORIC weighted chin-up prices on read paths. Michael has none logged
  (every chin-up/dip in his history carries `weight: 0`), so nothing moved; noted because the
  history-untouched promise in Decision 3 is about BANDS, not about this clause.

- **Verification:** 9 new pins in `workload-strength-bodyweight.test.ts` (subtract, floor, word-era
  unchanged, blank assist, null bodyweight → 0, add-resistance with lb, blank band → token, external
  weight still wins). 36 green across the strength/volume suites. **No backfill was run — history is
  intentionally untouched.**

- **Cross-ref:** D-348 (the set rule + the re-pricing law this suspends), D-349 (the screen that
  reads it), D-204 (prefills), Q-233 (imprecision #2 closed, #1 still open), Q-180 (the previous
  exercise-type default bug), D1 of `AUDIT-state-screen-2026-08-01.md` (band clause superseded).

---

## D-350 — TWO "CLIENT RE-DERIVATIONS" THAT WEREN'T: AN UNREACHABLE THRESHOLD AND A COMPONENT NOTHING RENDERED (2026-08-01, **PUSHED + DEPLOYED, not device-verified**)

**Context.** Stage 2 of `docs/AUDIT-state-screen-2026-08-01.md` named three client-side re-derivations
to delete. Traced first, on Michael's instruction (*"one stage, trace first, report before coding"*).
**Two of the three were not what the audit said, and the doc's own instruction for a third would have
caused a regression** — that one is D-349. This entry records the two that turned out to be non-bugs,
because "we deleted it and nothing changed" is exactly the finding a future session will re-litigate.

- **Decision 1 — `buildLoadHeadline` STAYS. It formats; it does not decide.** The audit called it
  "the LOAD verdict composed on the client" (F3). Every input is a server verdict: the reconciled
  `load_status` word (D-260, sole verdict authority) plus the readiness chip label. What it adds is a
  taper/peak override and a silence rule — **presentation, both kept.** ⚠️ **It is also already a
  SHARED file:** `_shared/state-trend/state-screen-print.ts` imports `src/lib/load-headline.ts`. One
  copy, not a client second opinion. **Why non-negotiable:** moving it server-side buys a
  `COACH_PAYLOAD_VERSION` bump — 24h of cache invalidation on every athlete — to relocate string
  formatting. The continuity law is *one source per fact*, and the fact already has one.

- **Decision 2 — the `acwr < 1.0` "headroom" threshold is DELETED, not moved.** This was the one real
  holdout: a training threshold living in a display file (D-268 Phase 5). **It could not fire.** Since
  2026-07-20 the headline returns early unless the load deviates ('a bit high' / 'pull back' / 'back
  off' / 'rest now'), and the observation slot only answered to `balanced` — never a deviating label.
  **Verified by exhaustion, not by reading: 8,316 combinations of label × readiness × chip label ×
  acwr × taper flag emitted the string zero times.** ⛔ **Why deleted rather than moved:** moving dead
  code to the server creates a payload field nothing can use and still costs the version bump. **If a
  headroom reading is ever wanted it is a NEW FEATURE and belongs beside the reconciler** — a sweep
  test now fails if the branch returns or if the silence rule is relaxed enough to let it speak.

- **Decision 3 — `BlockSummaryTab.tsx` is DELETED (1,184 lines), and its blocker had expired.**
  Unmounted since 2026-03-31 (`96db8469`), no importer anywhere in the repo, cited as unmounted by
  five separate docs. ⚠️ **`AUDIT-state-screen-2026-07-02.md` said do NOT delete it** — per D-212 it
  was the only reader of `block_verdict`, the goal-predictor axis. **That reason was stale:**
  `StateTab.tsx:1805` reads `goal_prediction.block_verdict` on a live surface, with the seeded-verdict
  honesty gate at `:694`. D-212 and `SPEC-fitness-verdict-reconciliation.md:41` are back-annotated.

- **Decision 4 — `useExerciseLog` no longer computes a direction.** `trend`, `current1RM`, `peak1RM`
  and `latestRir` were read by the deleted component alone. ⛔ **`trend` was the same lie D-347
  deleted from State**: first-point-to-last-point across a block that prescribes ~65%→95% of a
  training max reads a correctly-executed light week as a decline. It survived only because nothing
  rendered it. **Why it matters beyond the deletion:** D-347 removed the *rendering* of that
  computation on one surface and left the *computation* alive on another. **Deleting a display is not
  deleting a derivation** — the next session to mount a strength screen would have found a
  ready-made, wrong direction sitting in a hook and rendered it.

- **⚠️ Found and filed, NOT fixed: [Q-234].** `StateTab.tsx:1311` gates a per-lift bar on `lt.peak1RM`
  — camelCase on a snake_case server object, so always `undefined`, silently falling through to
  measuring against *last session × 1.1*. **The obvious fix is a trap** (`allTimeBestE1rm` exists, and
  using it would print "72% of your best" on a deliberately light week — D-347's bug in new clothes).
  Shape decision first; deliberately not touched in this pass.

- **Cross-ref:** D-349 (the one target that WAS real), D-347 (the direction chip this finishes),
  D-260/D-266 (the reconciler that owns the load verdict), D-212 + `SPEC-fitness-verdict-reconciliation.md`
  (back-annotated), Q-234.

---

## D-349 — THE COMPARE TABLE'S lb COLUMN IS PRICED BY THE ONE SET RULE: THE SERVER PRICES, THE CLIENT PAIRS (2026-08-01, **PUSHED + DEPLOYED, not device-verified**)

**The bug.** D-348 made bodyweight count in ONE function (`strengthSetVolume`), shared by the load
score, the planned score and `compute-facts`' `total_volume_lbs` — *"so the load number and the volume
number on the same screen cannot disagree."* **It never reached the Performance screen.**
`StrengthCompareTable` carried its own `calcVolume` (`weight × reps`, the pre-D-348 rule), so a chin-up
counted toward the session's LOAD and read as **zero lb** in the table on that same session.
`StrengthPerformanceSummary`'s "Volume (lbs)" tile — inches below the table — carried a **fourth copy**
of the same stale rule. Volume now ships pre-priced on `session_detail_v1.strength_volume`.

- **Decision 1 — the payload is TWO FLAT LISTS, not pre-paired rows. THE SERVER PRICES, THE CLIENT
  PAIRS.** ⛔ **The audit's own instruction — "route the matcher through the server" — would have
  caused a regression.** `session-detail/build.ts`'s `matchPlannedToCompleted` is lowercase-exact: it
  pairs *nothing* for "Barbell Back Squat" against a logged "Back Squat". The client's table already
  pairs correctly through `canonicalize` plus declared swaps (audit F5, 2026-07-30). **Pairing on the
  server would have replaced the stronger matcher with the weaker one and silently re-opened F5** —
  and a pairing miss renders as "no volume", not as an error. **Why non-negotiable:** the two jobs are
  genuinely separate. Pricing is a rule (one place, server). Pairing is identity resolution (already
  solved, client). Neither re-derives the other's job.

- **Decision 2 — entries are keyed by the exercise's own NAME, not by a canonical key.** ⚠️ **The two
  `canonicalize` functions are NOT the same rule.** `_shared/canonicalize.ts` carries a curated
  synonym/plural/parenthetical ladder (Q-197/Q-210); `src/lib/canonicalize.ts` is a small map plus a
  slugify. They agree on plain names and **diverge on exactly the decorated ones the ladder exists
  for** — so a server-canonical key is not reliably a client-canonical key. Shipping the raw name and
  letting the client re-key it with the function it already pairs with makes the mismatch
  structurally impossible. **Why non-negotiable:** the existing Previous-column handshake already
  depends on both sides keying identically, and its failure mode is silence.

- **Decision 3 — PLANNED is priced off the AUTHORED RAMP (`setPlan`), not the aggregate.** 5/3/1
  prescribes three different weights and the table renders three rows. Pricing
  `sets × reps × topWeight` server-side would put a delta on screen that disagrees with the rows above
  it — **the exact bug D-338 fixed**, and moving this number to the server is precisely how it would
  return. Pinned both ways in `session-detail-strength-volume.test.ts`.

- **Decision 4 — null body weight prices exactly as before D-348.** Carried through from D-348 rather
  than re-decided: an athlete who never recorded a weight keeps today's scoring, because the
  alternative is inventing a body weight for a real person. `bodyweight_lb` is surfaced on the payload
  so a screen *can* say why a chin-up reads zero instead of looking broken.

- **⚠️ The set filter must match `compute-facts`** (D-204: an untouched prefill is not a receipt), or
  the footer total stops equalling the rows above it. Pinned.

- **Q-233 is unchanged here:** an isometric hold still scores zero on this surface too — a per-rep
  rule has nothing to multiply. Pinned so it is not rediscovered as a bug.

- **⚠️ `_shared` DEPLOY TRAP APPLIES.** `session-detail/build.ts` and `workload.ts` are shared —
  **every function importing them must be redeployed**, not just `workout-detail`.

- **Cross-ref:** D-348 (the set rule), D-338 (the authored ramp), D-204 (prefills), F5 in
  `AUDIT-state-screen-2026-07-20.md` (the matcher this deliberately did not touch), Q-197/Q-210
  (the canonicalize ladder), D-350.

---

## D-348 — BODYWEIGHT IS LOAD, AND RE-PRICING HISTORY IS PART OF THE CHANGE (2026-08-01, **PUSHED + DEPLOYED, measured on real data, NOT device-verified**)

**The decision (D1 of `docs/AUDIT-state-screen-2026-08-01.md`).** Strength load stays **volume load** —
sets x reps x load, the basis Strong and Hevy score on — and **bodyweight fills in as the load** for
calisthenics. Rejected: TIME (a bench session logged a 2-minute duration; logged-after-the-fact
duration is garbage) and PER-SET EFFORT (only collected on the top/AMRAP set of the four main lifts, so
it cannot score the accessories that read zero). Banded sets got a small flat per-set token — bands have
no standardised tension, and assistance is deliberately minor, so precision is not worth buying.
⛔ **REVERSED BY [D-351] (2026-08-01): a band now carries an athlete-entered POUNDS value** (`bandLoadLb`,
`_shared/workload.ts:376`), subtracting on `{pullup, chinup, dip}` and multiplying elsewhere; the flat token
survives only as the unparseable fallback (`:429`). ⚠️ **D-351 Decision 3 also SUSPENDS this entry's
re-pricing law on purpose** — band history is NOT migrated, so `resistance_level` holds words before
2026-08-01 and pounds after. Do not "clean it up" with a migration. ⟨A31⟩

**The fault.** `calculateStrengthWorkload` summed `weight x reps`; a chin-up has weight 0. Measured on a
real 13-set squat day: **10 points, against 61 for a 47-minute easy run** — on a strength block. Run 87%
/ strength 8% of his load, feeding ACWR, the load verdict and the reconciler.

**One rule, one file.** `strengthSetVolume` (`_shared/workload.ts`) is used by the load score, the
PLANNED score (`calculatePlannedStrengthWorkload`) and `compute-facts`' `total_volume_lbs`. All three or
none: fixing the completed side alone makes every session read heavier than planned (pinned by
`workload-strength-planned.test.ts`), and fixing load without facts puts two numbers about the same
session on one screen disagreeing.

**Body weight from `user_baselines.weight` + `units`. NULL SCORES AS BEFORE.** An athlete who never
recorded a weight keeps today's behaviour rather than having one invented for them (Law 2). The
effort multiplier was deliberately NOT touched — changing the basis and the damping together would make
the movement unattributable.

**⛔ THE BACKFILL IS THE DELIVERABLE, NOT THE FORMULA.** Scores are STORED and the verdict is a ratio of
7 days against 28. Ship the pricing without re-pricing history and an identical week reads **1.00 ->
1.47, "total load building"** — the fix manufacturing the false alarm it was written to remove. Pinned
BOTH ways in `workload-strength-bodyweight.test.ts`; the hazard case is a permanent regression fixture.
`backfill-strength-load` re-prices both sides and computes nothing itself.

**Measured after the pass, his real data:** ratio **0.83 -> 1.05, still `on_target`** (build and normal);
strength **8% -> 38%** of 28-day load. Known imprecisions: Q-233.

## D-347 — THE PER-LIFT TREND CHIP IS DELETED, AND THE SCREENS READ THE BLOCK CARD (2026-08-01, **PUSHED + DEPLOYED, not device-verified**)

> ↩︎ **This removed [D-270]'s State-screen display.** D-270 made the per-lift direction a spine-owned
> FACT and put a chip on the State strength row; this entry deletes **the chip, not the fact** — the
> direction is still computed, still spine-owned, and still guards the per-workout narrative.

> ⚠️ **STILL STANDS — BUT IT ONLY DELETED THE RENDERING, AND THE COMPUTATION LIVED ON (D-350, same
> day).** The reasoning below is unchanged and correct. What it did not catch: `useExerciseLog.ts`
> computed the SAME first-point-to-last-point direction across 12 weeks, in the client, and
> `BlockSummaryTab` rendered it with an arrow and a percentage. That component had been unmounted
> since 2026-03-31, so the wrong chip was invisible rather than absent. **Both are deleted now.**
>
> ⛔ **The general lesson, and it is why this back-annotation exists: deleting a display is not
> deleting a derivation.** A future session mounting any strength screen would have found a
> ready-made direction sitting in a hook, with no warning attached, and rendered it.
>
> ⚠️ **A THIRD copy of the same class is still live and is FILED, NOT FIXED — [Q-234].**
> `StateTab.tsx:1311` gates a per-lift bar on `lt.peak1RM`, a field the server does not send, so it
> silently measures against *last session × 1.1*. **Read Q-234 before "fixing" it** — the obvious
> rename makes a correct number appear that would still read a prescribed light week as a shortfall.

**Stage 1 of `docs/AUDIT-state-screen-2026-08-01.md`.** `_shared/block-identity.ts` has answered "what
block is this, on this date" since 2026-07-30 (Q-230/D-339) and the coach's verdicts already read it —
**the State fitness rows and the Performance table did not.** The coach payload has carried the card at
`plan.block` since v150; the client type never described it, so the browser discarded it. A wire, not a
build.

**The card supplies the WORD (`phaseWord`).** `phase` is the plan's own name and half of those are
internal — 'Leader' and 'Anchor' are Wendler's, and mean nothing to an athlete. The word is resolved
through `normalizePhaseKey` (D-322) — **the same table the effort rules already use, asked a second
question rather than copied** — so no screen keeps a translation table, a non-5/3/1 plan renders through
the identical path, and an unplaceable week renders "week 3 of 12" with no word.

**The per-lift direction chip is DELETED, not made protocol-aware.** It read an e1RM produced ONCE PER
CYCLE, off a top set a 5/3/1 block deliberately runs from 65% to 95% — so it was mostly reading the
PRESCRIPTION, sampled ~4 times, and called a correctly-executed light week a decline (bench "flat" with
a dropping line, week 1). A smarter chip keeps a directional claim alive on data too sparse to carry
one, and every future protocol then owes it an exception. **The number, the 12-week chart and the PR
stay** (a PR is a measured fact, not a trend). The spine still computes the direction and still excludes
deloads (D-338); this row simply no longer renders it.

**Fixed at the strength CALL SITE, never in the shared component** — `TrendSparkline` is shared with run
and bike, and its "building · N of 12 weeks" label is honest for run (data coverage) and reads as block
progress for a lift. Run and bike are byte-identical.

## D-346 — THE RUN ROW IS ON THE WRONG INSTRUMENT. Decoupling out, speed-at-heart-rate in (2026-07-31, **SHIPPED + DEPLOYED**)

> ⚠️ **STILL CORRECT FOR THE RUN ROW. ITS SIDE EFFECT ON THE BODY ROW ENDED IN A DELETION ([D-354],
> 2026-08-01).** Pointing the heart-rate rollup at `run.efficiency` was right — but it made that row
> a restatement of the RUN row rather than a second reading, and one day later that was the argument
> for deleting it. **The run-side change stands unchanged**; only the rollup that borrowed from it
> is gone. Everything below is unaffected.

> ✅ **BUILT AND DEPLOYED THE SAME DAY, after this entry was first written as a decision-only record.**
> Thirteen commits (`de8b486d` … `7ea6170b`), 22 edge functions, coach payload 150 → 154. What shipped
> is in **§SHIPPED** at the end; the diagnosis and the three rejected approaches above it are unchanged
> and are the reason the build took the shape it did.
>
> ⚠️ **The remaining fault is DURABILITY, and it is not a patch — see [Q-232].**

**Michael, on the State row telling him his heart rate was drifting up:** *"this shits wrong no"* —
then, after four hours: *"this is the 209th fucking time ive treid to make this wrk, and it keeps
coming back."*

### ⛔ WHY IT KEEPS COMING BACK, MEASURED

**Fifteen decision entries touch this one row** — D-036, D-037, D-039, D-040, D-105, D-106, D-107,
D-239, D-273, D-275, D-276, D-283, D-295, D-311, D-345 — plus two design docs and a spec.

⛔ **AND EVERY DOC A FRESH SESSION READS FIRST SAID THE AREA WAS HEALTHY.** `TRUTH-MAP` called RUN
*"CLEAN … the model the others should copy."* `AUDIT-hr-congruence` marked run durability ✅ CLEAN.
`CAPABILITY-MAP` said D-345 had fixed the intent. `STATE-SOURCE-MAP` described a substrate that moved
ten days earlier. `session-detail/build.ts` claims in a comment that it uses *"the SAME metric State
uses"* — it does not. **Five false claims, all confident, none with a receipt.**

So each session opens the map, reads "clean", concludes the symptom in front of it must come from
somewhere new, and builds something new. **A doc that says "clean" about a broken thing does not
merely fail to help — it routes every future session away from the fault.** All five are corrected.

### ⛔ THE DECISION: THE INSTRUMENT IS WRONG, NOT THE WIRING

| | what it asks | what it needs |
|---|---|---|
| **DECOUPLING** (what State reads) | did you fade *within* one run | a pristine steady effort — which most real running is not |
| **SPEED AT A GIVEN HEART RATE** (Garmin/Firstbeat) | how fast are you at 134 bpm | ordinary running |

Decoupling is a TrainingPeaks per-workout diagnostic; TrainingPeaks does not trend it, and you
highlight the steady section by hand. Firstbeat mines the reliable segments of any run and reads the
HR-to-speed relationship — 95% accuracy (MAPE ~5%) across 2,690 freely-performed runs from 79 runners
(`assets.firstbeat.com/firstbeat/uploads/2017/06/white_paper_VO2max_30.6.2017.pdf`).

⛔ **AND WE ALREADY HAVE GARMIN'S SHAPE.** `_shared/heat-adjust.ts` + `docs/archive/DESIGN-familiar-routes.md`:
same route (terrain cancels rather than being modelled), a heat coefficient **learned per route by
regression**, and a confidence-interval gate that returns `still_learning` instead of asserting.
**It is complete, tested, and wired only to the per-workout screen. State does not call it.**

**THE DECISION: State's run row stops computing its own verdict and reads that engine.** Its own
first, deliberate change — with the render path included. ⚠️ `StatePerformanceSection` renders
`fitness.efficiency`, NOT the card-level verdict; a swap that misses that line changes nothing on screen.

### ⛔ THREE APPROACHES TRIED AND REJECTED THE SAME DAY — recorded so they are not retried

1. **Window the run by steady HEART RATE.** Circular: HR drift is what decoupling measures, so
   filtering for it deletes the signal and every run reads clean.
2. **Window by pace SCATTER against a fitted threshold.** ⛔ Not universal. Pace scatter scales with
   speed — at 13:30/mi an ordinary stride wobble is ~18%, the identical wobble at 8:00/mi is ~10%, so
   it systematically rejects slow runners' easy runs. Michael: *"we shouldnt be tuning to me either …
   it should be universal."*
3. **Window by HR↔speed CORRELATION** (dimensionless, so scale-free — the right instinct).
   ⛔ **Measured on 25 real runs it does not separate:** 0.4–0.9 on hill sessions and dead-flat easy
   runs alike. Detrending both series first did not fix it. On rolling ground you slow on the climbs
   and your heart rate rises — that is real coupling at genuinely constant effort.

⚠️ **AND FIRSTBEAT'S RULE IS THE OTHER WAY UP.** They DISCARD low-correlation segments (they need a
clean HR-to-speed relationship to extrapolate from). Reading it as "discard high correlation" builds a
filter that throws away exactly what Garmin uses. That inversion survived several hours here.

### ⚠️ FACTS ABOUT THE SUBSTRATE, MEASURED 2026-07-31

- `heart_rate_summary.workoutType` reads `steady_state` on **all 25** of his runs — an 11-minute jog
  and a hill session included. ⛔ **The `isSteadyAerobic` gate excludes nothing.** Hill drills entered
  the durability trend at 24.9% and the screen reported declining fitness. **Still unfixed.**
- **Four fields answer "what kind of run was this"** and the gate reads a fifth. Three sessions in
  three days each wrote the intent to a different unread field.
- On 164 `route_progress_metrics` rows: `temp_f` on 115, `decoupling_pct` on 83, and
  `effort_adjusted_pace_sec_per_km` — the one column that table owns — on **8**.
- ⚠️ **The heat engine's `still_learning` is NOT caused by the missing temperatures.** Repairing them
  changed no verdict. It is scatter: on his main loop the CI is −12%…+5% across 14 runs over 200 days
  with a four-month gap. **An honest "cannot tell yet", and the correct answer.**

### ✅ WHAT ACTUALLY SHIPPED WITH THIS ENTRY (small, verified, unrelated to the build above)

1. **The "as of" stamp shows the NEWEST contributor, not the oldest** (`assemble.ts:695`). His run
   side was one day old and his bike sixteen; the row stamped itself two weeks stale and read as
   *"nothing here is current"* about current data. The stale half is still named in the line beneath.
2. **`get-weather` backfills the route row's conditions at fetch time.** `compute-facts` wrote the
   route row from `workouts.weather_data` while the weather is fetched by the analyzer, which the
   ingest fan-out does not await — so a third of rows stamped null. Recorded in CAPABILITY-MAP on
   2026-07-17; nothing acted on it until now.
3. **Five false doc claims corrected**, each carrying what it used to say and why it was wrong.

⚠️ **THE ONE PLACE A POPULATION CONSTANT STILL TOUCHES A VERDICT:** below 8 runs the regression cannot
fit, and `DEFAULT_HEAT_K` (self-declared *"unvalidated population placeholder"*) is used instead. The
floor holds — under 8 runs no verdict renders at all — and **[Q-231]** covers closing it properly by
running the analysis pass over an athlete's imported Strava history.

⛔ **AND ONE BUILT-THEN-DELETED, DELIBERATELY.** A steady-window module was written, tested (10 tests)
and removed the same day once its criterion failed on real data. **Keeping it would have made a
sixteenth implementation of this row.** The decision it was serving is this entry; the code was a
wrong first attempt at it, and a wrong attempt left on disk is how the next session inherits a fork.

---

### ✅ SHIPPED — what the run row is now, and what it took

**THE VERDICT.** `compute-snapshot` builds `runEffHistory` — every run with a grade-adjusted pace and
an HR, plus that day's temperature — and `assemble.ts` runs it through `routeTrend`, which fits
`efficiency ~ heat + time` jointly (Huber-robust, CI-gated). The result **overrides
`runFitness.efficiency.verdict / pctChange / sampleCount / newestAgeDays`**.

⛔ **THE OVERRIDE LANDS ON `efficiency`, AND THAT PLACEMENT IS THE FIX.** An earlier cut set the
CARD-level verdict — real, and invisible: `StatePerformanceSection` renders `fitness.efficiency`. **A
fix landing where nothing reads is the fault this row was rebuilt fifteen times by, and it must not be
the fix for it.** It shipped that way once and had to be corrected.

**HIS NUMBERS, MEASURED:** −15.2% across 26 runs over 13 weeks, CI clearing zero, heat coefficient
**−0.28 %/°F** learned from his own runs. Published work puts the cost near −0.22 %/°F — **his data and
the literature agreed independently, which is the strongest evidence today that the engine is sound.**

**THE HEAT LINE.** *"Heat costs you about 20s a mile per 10°F warmer, measured on your own runs."* The
regression already computed the coefficient in order to remove it and then threw it away. Garmin
corrects silently and never states the size; TrainingPeaks says "consider temperature". ⚠️ Rounded to
5s and hedged (the fit moves ±25% by window), and gated to a NEGATIVE coefficient inside the published
band — an unstable fit came back POSITIVE in development, which would have told an athlete heat makes
them faster.

**THE CHART** plots the same rows the verdict read, so the two cannot contradict. Conditions are
CAPTIONED, never corrected (*"grade-adjusted · 60–85°F across these runs"*) — Intervals.icu's pattern;
nobody in the field heat-adjusts an efficiency chart.

**THE HEART-RATE ROW** now reads the same number. Its run half was decoupling — the broken filter — so
it said *"drifting up"* in RED beside the RUN row's *"easing off"* in AMBER, **one number, two
vocabularies, two severities**. It now states its contributors in the shared trend words
(*"Running easing off (today) · bike holding (16d ago)"*) and mints no verdict of its own.

**TWO SEPARATE FIXES RODE ALONG:**
1. The "as of" stamp shows the NEWEST contributor, not the oldest. His run side was one day old and his
   bike sixteen; the row stamped itself two weeks stale about current data.
2. `get-weather` backfills the route row's conditions at fetch time — `compute-facts` wrote that row
   before the analyzer fetched the weather, so 49 of 164 rows stamped null.

### ⛔ THE PATTERN THAT COST THE MOST, AND MICHAEL NAMED IT

> *"the pattern is, you look, say its wrong, fix it, then break it, then see it was right, and then see
> there is a lot of code happening there."*

It happened repeatedly and it is worth more than any single fix here:

- **Three separate stale LABELS** shipped, each found by him on a screenshot: `over 6wk` (hardcoded 42
  days), `last 12 weeks` (clamped), `1d ago` (from the replaced pool). ⚠️ **Same cause every time: the
  data moved and a hardcoded number stayed.** A stale label on fresh data is believed *because*
  everything around it is right.
- The pace receipt was fixed onto the verdict's pool, then **broke** — a mean of two runs swung a
  minute a mile when one recovery jog synced. Now a median of five.
- A **payload-version bump was forgotten**, so the first copy fix deployed and changed nothing. That
  file warns about this trap three times in its own notes.
- The durability gate was "fixed" and **a pinned regression test caught it** — see [Q-232]. That is the
  system working; it should not have taken a test.

⛔ **THE LESSON: after moving a data source, SWEEP the surface once against the new pool — every label,
date, unit and claim — instead of shipping and waiting to be told.** The sweep that was finally done
found three more (the ⓘ still said "steady runs" and "than 6 weeks ago"; a dead GAP toggle; `0d ago`).

### ⚠️ AND ONE FEATURE WAS REMOVED RATHER THAN FIXED

**Projected race times are hidden below 8 threshold readings** (he has 3). They printed a finish time
to the SECOND off a pace stamped `confidence: high` from three runs. Michael: *"its not a necessary
featre unless it robust."* ⛔ The floor is the app's OWN — `runDirectionMinRuns` = 8, the same bar State
already requires to assert a direction — **not a new number picked for this.** A TYPED target never
qualifies at all: projecting race times off an aspiration is a fabricated number in measured clothes.

---

## D-364 — AN EASY SESSION IS JUDGED ON HEART RATE, AS TIME UNDER A CEILING (2026-08-02, Michael — **VERIFIED ON DEVICE**)

The app already knew this and said it in the wrong place. The run's Insights paragraph dropped the pace
verdict on a steady run and spoke to the easy band instead; the client already hid the Pace chip. But the
read was **prose only, off AVERAGE heart rate**, while the ride had shipped the same idea a day earlier
as a scored chip off **time under the ceiling** ([D-362]). An easy run showed two chips, an easy ride
three, and the run's score was still half-built from a pace number the same screen refused to display.

**Three things, the ride's three, applied to running:**

1. **TIME under the ceiling, never the average.** A hilly run averages under the bar while a third of it
   was over — the average calls that clean. `_shared/time-under-ceiling.ts`, shared by both sports.
2. **Its own chip, naming the ceiling and its provenance** — `measured` when a threshold test anchors
   it, `est.` off max HR. That distinction is the whole argument for doing a threshold test.
3. **The score is built from what was prescribed**, not from pace.

**THE GATE IS PLAN INTENT, AND THIS IS THE LOAD-BEARING PART.** `isEasyPrescribedRun`
(`_shared/easy-hr.ts`) reads `classifiedTypeKey` — easy / recovery / long_run. ⛔ **Do NOT gate on
`mapClassifiedTypeToHrWorkoutType()`**: it returns `steady_state` for everything except intervals and
hills, so a TEMPO run took the easy branch and was told it "ran 22 bpm over your easy ceiling" — graded
against a prescription it was never given. Fixed and pinned.

⚠️ **LONG RUNS ARE IN, SCORED STRAIGHT** (Michael: *"straight — that's the whole point"*). They drift, so
a well-executed long run will not read 100. No shipped app corrects for this: they report time-in-zone
straight and report decoupling separately, which the HR row already does. Correcting here would invent
a number nobody measured.

⚠️ **THE CEILING IS PER-SPORT AND STAYS THAT WAY.** Running HR sits 5–10 bpm above cycling at the same
effort. `easy-hr.ts` and `ride-easy-hr.ts` both say do not unify them.

⛔ **THE SCORE MUST BE WRITTEN LAST.** The first version set it beside the measurement, ~400 lines early;
**four** later blocks in `analyze-running-workout` recompute `execution_adherence` from
`(pace + duration) / 2` and overwrote it every time. The chip rendered, the suite was green, and the
number on screen was the old one. The override now sits at the serialization boundary.

---

## D-365 — ONE VERDICT PER SESSION, AND THE INTENT DECIDES WHICH (2026-08-02, Michael — **VERIFIED ON DEVICE**)

The screen printed two answers to "did you do this session right" and they disagreed by 51 points: the
Easy chip read 49% while the row below showed a green **100%** pace badge. Michael had run 11:28/mi
inside a prescribed 11:15–11:43 — on a 76°F rolling morning at RPE 2, which is exactly why heart rate sat
above the easy ceiling. He did what was asked.

**All three reference apps agree, and none would print both.** TrainingPeaks does not grade pace at all
(compliance is duration and distance); Garmin gives a step ONE target, pace or heart rate, never both;
Strava shows time in heart-rate zones and never scores a session against a plan.

So on a session judged by the easy governor, the per-row pace percentage and its colour come off. **The
prescription and the executed pace both still render** — the row still reads `11:15-11:43/mi` and
`11:28/mi`. Nothing is hidden; it stops being a mark.

⚠️ **INTENT-GATED, NOT A BLANKET RULE.** The signal is the presence of `intensity_adherence`, which the
analyzer emits only for an easy prescription. Tempo, threshold, intervals and hills were GIVEN a pace and
are still graded on it, badge and all — a different paradigm for a different intent, which is the point.
The client does not re-derive the rule.

---

## D-366 — READOUTS, NOT MARKS: EASY, DURATION, AND ONE TEMPERATURE (2026-08-02, Michael — **VERIFIED ON DEVICE**)

**Easy stopped being a score.** Every other chip answers "how close to plan, out of 100". Easy never
could: it is time under a heart-rate ceiling on a session whose purpose is aerobic work at the lowest
cost. Printed as 49%, it put a failing grade on a run executed exactly as prescribed. None of the three
reference apps score an easy session — Strava shows the zone bar, Garmin time in zone, TrainingPeaks
grades duration and distance and nothing else. It reads `17 of 35 min · under 134 bpm · measured`.

⚠️ **THE MINUTES ARE MEASURED, NOT BACK-CONVERTED.** `easy_total_s` is HEART-RATE COVERAGE, not session
length. Deriving "17 of 35" from a percentage against moving time would claim minutes the strap never
recorded.

**Duration stopped being a score, and the old one could not answer its own question.**
`duration_adherence` is distance-from-100 via `Math.abs()`, so against a 46-minute plan a 35-minute and a
57-minute session **both read 76%**. `volume_ratio_pct` is the plain ratio; the chip reads
`64 of 108 min · Moving time vs plan`. ⚠️ Moving minutes, said out loud — a session with long stops reads
short for that reason alone.

**One temperature per screen, and it says when it moved.** The header read the START (74°F) and the
Terrain row the AVERAGE (76°F) on the same run. `formatSessionTemp` is called by both: `74 → 78°F` when
the reading moved, one number when it did not. ⛔ **No threshold** — any "only show the range if it moved
more than N degrees" invents an N.

⚠️ **A 2026-07-03 comment in `analyze-running-workout` already described this fix as done** ("the
header-76 vs terrain-78 disagreement") — it had pointed two call sites of three at the same field. A
shared formatter is the version that cannot be half-applied.

---

## D-367 — THE BIKE MIRRORS THE RUN (2026-08-02, Michael — **VERIFIED ON DEVICE**)

⛔ **THE DETERMINISTIC BIKE COMPOSER ALREADY EXISTED AND WAS ALREADY WIRED** (`_shared/insights/
bike-insights.ts`, called from `analyze-cycling-workout:8`). There is **no LLM in either endurance
Insights path**. This was a clause-set job, not a build — run's composer emits ~16 clauses, bike's ~11,
and almost none fired on a ride without structured intervals, which is most rides.

**Five gaps, one screen:**

1. **Terrain speaks one temperature vocabulary** — the ride was left on a single number by the morning's
   own fix. Both call `formatSessionTemp` now.
2. **Heart rate is its own row, as a percentage, on both sports** (Michael: *"drift as a percentage on
   both sports, with a plain sentence around it"*). The bike buried drift inside the Efficiency figure;
   the run split the same question across two DIFFERENT row names — "Aerobic decoupling" when the number
   was trustworthy, "Heart rate" when it was not, so the jargon appeared exactly when there was most to
   say. One name, sentence first, number as receipt.
   ⛔ **And the bike gained the trust gate it never had.** It printed "HR drift 0.4%" on a ride the
   engine had classified THRESHOLD. Decoupling is a steady-aerobic measurement; on a threshold effort
   the number is real and the question was never asked. Gated on `classified_type` — the same field the
   zone label reads. On a hard ride the row is **absent**, never substituted.
3. **Prescribed versus ridden — the sentence neither sport had.** The 2026-08-01 Long Ride was prescribed
   easy and ridden at threshold; the screen held both facts three lines apart and never joined them.
   It leads the paragraph, is silent when they agree, and names no consequence — the cost is State's.
4. **Conditions as load** — a clause the composer has accepted since 2026-07-19 while the mapper
   hardcoded `conditions: null`, so it could never once have fired. An 81°F ride with 958 ft of climbing
   read as though it happened in a lab. **Starved, not absent.**
5. **Unstructured rides get a Pacing row** — mean pedalling watts per half. ⚠️ NOT halved NP (a 30-second
   rolling average is baked into it), and zero-power samples excluded from both halves so a
   descent-heavy second half is not a fade that never happened.

⛔ **TWO INVENTED NUMBERS, CORRECTED THE SAME DAY** (Michael: *"ensuring you are not tuning any of this
to me or this ride"*). The climbing gate shipped as `gain >= 500 ft` with a comment claiming 500 was the
classifier's own bar. **It was not** — the classifier uses elevation DENSITY, ≥ 40 ft/mi
(`cycling-v1/build.ts:113`) — and an absolute foot count is also the wrong SHAPE: 600 ft over 60 miles is
flat and passed; 450 ft over 8 miles is steep and failed. And the Pacing row called a ≥5% drop a "fade",
citing 5% as a drift boundary — that is Friel's aerobic-DECOUPLING line, a different idea, and no
reference app publishes a power-fade bar. The row now states the watts and grades nothing.

> **THE LESSON, AND IT IS THE EXPENSIVE ONE:** both misses had the same shape — a number picked at the
> keyboard with a justification written beside it that *sounded sourced and was not*. The wrong number is
> recoverable. **The false citation is what survives review**, including mine.

---

## D-368 — TWO GRADES, AND THE COACH STOPS DIAGNOSING FROM THEM (2026-08-02, Michael — **PUSHED + DEPLOYED**)

Michael: *"duration is one grade, time in prescribed anything is another grade"* — and, on fatigue,
*"we have addressed all this in state"*.

Execution was those two averaged, and the weighting was a number nobody chose: the ride's comment said it
mirrors running's 50/50, running's cites nothing. **Three files pointing at each other with no ground
under any of them** — and there is no field answer to reach for, because none of the three reference apps
produces a single execution score at all.

**So they are reported separately and never merged:** `avg_intensity_adherence` (time at the prescribed
effort) and `avg_volume_ratio` (moving time as a ratio of planned). Both readiness-driver tones are
**neutral** — a driver row states a fact; the readiness verdict is reached elsewhere, from body signals.

⛔ **AND THE EXECUTION-DRIVES-FATIGUE PATH IS DELETED, NOT GATED.** Two places read a per-session
adherence average and concluded about the athlete's BODY: `execution_low` → readiness `'fatigued'`
explicitly *"regardless of ACWR"*, and a caution verdict telling him to *"dial back intensity for
24-48h"* because *"your execution suggests you're not absorbing the work"*. That is a cross-session
verdict and **State owns it** — [D-363] moved exactly this off the session screen the night before; both
were the same violation one floor up. The input could not support the claim either: a warm 35-minute run
in place of 46, effort held exactly right, dragged the average down and came out as "you look fatigued".

⚠️ **NOT REPLACED BY A SPLIT-GRADE VERSION.** The thresholds (65/70/75 per methodology) were fitted to
the blended number; carrying them across to an intensity-only grade would reuse a bar that no longer
measures what it was set against. `min_execution_score_ok` is now **unread**.

⚠️ **The app never changed training from this** — `adapt-plan` does not read it. It coloured a card,
shifted wording toward "fatigued", and offered a suggestion gated on body signals agreeing. Claimed
otherwise from a code comment before tracing it; corrected.

---

## D-369 — THREE NUMBERS ON A SESSION, AND LOAD HAS SOMETHING TO BE READ AGAINST (2026-08-02, Michael — **VERIFIED ON DEVICE**)

Michael, at seven numbers on one screen: *"omfg what the fuck are all these score"*. He was right, and
the fault was handing him one decision at a time instead of proposing a set.

**Three questions, three numbers, no blends:**

| chip | answers |
|---|---|
| **Workload** | what it cost you |
| **Duration** | did you do the amount asked |
| **Easy / Power** | did you do it at the intensity asked |

**Execution came off** — the other two averaged. **TSS came out of the ride's Insights** — the ride
carried two load numbers, "69 TSS" there and "Workload 86" on Details, disagreeing by a quarter because
Workload takes intensity from a banded ladder and TSS from the exact ratio. Two answers to one question,
and only rides had the second: **a run has no TSS at all.**

⛔ **WORKLOAD IS NOT A HOUSE INVENTION — IT IS THE TSS FORMULA.** `hours × IF² × 100`, the same anchor
TrainingPeaks uses (100 = one hour at threshold). The only difference is where intensity comes from:
TrainingPeaks needs power-vs-FTP or pace-vs-threshold-pace; ours takes the best signal each sport HAS —
power, HR vs threshold HR, swim pace, else the prescribed intensity. That is why it works on every sport,
and why **rTSS was rejected**: it needs a learned threshold pace, so a new athlete would get load on rides
and nothing on runs for weeks.

⚠️ **Having a house load unit is field-normal, not a compromise.** TrainingPeaks calls it TSS, Garmin
Training Load, Strava Relative Effort. Different names, different scales, none interchangeable.

**AND IT NOW HAS A COMPARISON.** "86" cannot be high or low alone. The chip shows the athlete's OWN band
for the same sport — `typically 68–117` — which is how Strava frames Relative Effort and Garmin bands
Training Load: **where it sits among yours, never a verdict.**

⚠️ Same sport, 90 days, completed only. ⚠️ The **middle half** (25th–75th), not min–max — one four-hour
ride would stretch a min-max band until every ordinary session looked tiny. ⚠️ **Under five sessions
there is no band** and the chip makes no claim.

⛔ **NO TRAFFIC LIGHT, ASKED AND DECLINED** (Michael: *"do we want to color code it green yellow red?"*).
A high workload is not bad — a long ride SHOULD be the biggest number of the week, and red on a
correctly-executed long run tells the athlete off for following the plan. There is no "right" workload
for a session; it depends what the session was for. Garmin does colour load, but on a **seven-day
rolling** total against an optimal range, where too little and too much are both genuinely suboptimal.
One session is not that question. If scannability needs more, the honest answer is a **position marker**
in the band, not a colour that judges.

---

## D-370 — AN UNDECLARED SWAP INTO AN ASSISTANCE SLOT IS CREDITED, AND FLAGGED WHEN THE PATTERN DIFFERS (2026-08-02, Michael) — **NOT YET VERIFIED ON DEVICE**

**Supersedes the "we never INFER a substitution" half of [Q-181].** That clause is still law for main
lifts and for every planned row that is not an assistance slot. Read the back-annotation on Q-181.

### THE SCREEN THAT CAUSED IT

Michael's 2026-08-02 bench day. Plan: Bench Press + three assistance slots — Band Face Pulls (push
slot), Chin Up (pull), Single Leg Hip Thrust (single-leg). He did the chin-ups and the hip thrusts,
skipped the face pulls, and did **Dips** instead without tapping Swap.

The screen read: `Band Face Pulls — NOT LOGGED` and `Dips — NOT IN THE PLAN`, three rows apart, with
the count saying 3 of 4. **He was docked for a slot he filled and unpaid for the work that filled
it** — the exact double-fault Q-181 was written to end, surviving in the one case Q-181 declined to
cover.

### WHY THE OLD LAW COULD BE REVERSED, AND WHY IT COULD NOT HAVE BEEN BEFORE

Q-181's stated reason for refusing inference was *"a score that lies in the athlete's FAVOUR"* — a
forgiven skip inflating the strength execution percentage. **[D-338] deleted that percentage.** No
strength surface grades a session any more; what remains is a count and a row label, and both were
under-reporting. The thing the law protected no longer exists.

### WHY ASSISTANCE IS NOT A MAIN LIFT

A main lift is prescribed BY NAME at a percentage of a training max. An assistance slot is
prescribed as a **category with a menu** — Wendler writes it as *"Lats, Upper Back, Triceps — 5 sets
of 10-20 reps (DB rows, Bent Over Rows, Chins, T-bar Rows, Lat Pulldowns, Face Pulls, Shrugs)"*
(2nd ed. p50-51). Filling that slot off the menu **is** the prescription. The gate in code is
`load_prescribed === false`, stamped by the Get Stronger composer on assistance rows only —
`!== false` rather than `=== true`, because absent means "not stated" and a reader that treats
absent as assistance turns every main lift into one.

### FIELD STANDARD (re-checked 2026-08-02)

Every app credits the swap; **none of them flag a bad one.** Boostcamp carries the working weights
and rep targets straight over to the substitute. Hevy, TrainHeroic and Juggernaut all
replace-and-continue. TrainHeroic's own writeup names the gap — athletes improvising *"sometimes
choose movements that don't match the original training goal"* — and answers it with
coach-preselected alternatives, **not** with a warning. Crediting is the field. The flag is the part
the field does not do.

### WHAT SHIPPED

**Tier 3 in `_shared/strength/match-exercises.ts`.** Runs last, on leftovers only, so it can never
take a row from a declared swap or a name match. Two passes: same movement family first (a pull for
a pull is the field's own definition of a valid substitute), then anything else still unpaired. A
main lift may never fill an assistance slot (`isMain531Lift`). The match carries `inferred: true`.

**The flag was already built and starved.** `buildSubstitutionNote` has compared MOVEMENT PATTERN
and written the honest sentence since Q-181 slice 3 — it had simply never been reached, because
nothing ever produced an undeclared swap for it to describe. Tier 3 feeds it. ⛔ Do not write a
second pattern comparison.

**The verb changes on an inferred pairing.** *"Swapped X → Y"* reports something the athlete did; on
an inferred pairing they did no such thing. It now reads **"Dips filled the Band Face Pulls slot.
Pushing instead of pulling — same session, different stimulus."** An in-slot fill stays silent,
exactly as a declared one does.

### THE VERNACULAR CALL

⛔ **Movement-pattern words decide; plain words speak.** The big apps label by MUSCLE GROUP — Hevy
takes one primary and several secondary muscles; Strong and Fitbod the same. Movement pattern
(horizontal push / vertical pull) is coach vocabulary; Trainerize users have been asking for a
movement-pattern filter for years and do not have one. Printing `horizontal_push` on a strength row
would break the bro-friendly rule for no gain. The sentence teaches the idea without the taxonomy.

### GUARDS

`match-exercises.test.ts` — the old blanket guard is **narrowed, not relaxed**, and its header says
so: a main lift with something else logged is still a skip, a planned row with no assistance marker
is never inferred into, and a main lift may not fill an assistance slot. Six new tests pin the other
side. 31 pass. `substitution-note.test.ts` pins the inferred wording (12 pass).

### RIPPLE

`analyze-strength-workout` and `auto-attach-planned` both import the changed file and both must be
redeployed (the `_shared` deploy trap). **`auto-attach-planned` uses only
`strengthSessionsShareTheWork`, which was NOT touched** — attach behaviour is unchanged, verified by
reading its single call site (`auto-attach-planned/index.ts:477`).

### WHAT WAS REJECTED

- **Inferring on main lifts too.** A skipped bench is a skipped bench. Q-181's guard survives intact
  there and its test is unchanged.
- **Client-side inference.** "Do not write a second matcher" is written at the top of the matcher.
  `StrengthCompareTable` now READS the server's pairing (`session_detail_v1.execution.substitutions`)
  and re-homes the row off it; it decides nothing.
- **A special rule for the day's main lift.** The push slot was balanced to Face Pulls *because*
  bench already pressed, so crediting Dips there looked like it needed its own exception. It does
  not: Dips are `horizontal_push`, Face Pulls are `horizontal_pull`, so the pattern comparison
  already catches it and says something truer than a bench-specific rule would.

### ⚠️ FOLLOW-UP, SAME DAY — THE FLAG-ONLY GATE SHIPPED, DEPLOYED, AND CHANGED NOTHING

First cut gated everything on `load_prescribed === false`. Pushed, both functions deployed, Michael
recomputed — **the screen was identical.** The `vs plan` line WAS gone, which proved the bundle was
fresh and the fault was the data, not the deploy. (That one line was the whole diagnostic: it is the
only change in the set that depends on no data at all.)

**A four-day hole in the plumbing.** The composer has written `load_prescribed: false` since
2026-07-25 (`eb7db0df`) and the `sets: undefined` / `reps: "25 total"` shape since 2026-07-26
(`57d7d447`) — but `materialize-plan` did not CARRY the flag into `computed.steps` until 2026-07-30
(`739df704`); until then it read the flag, used it to stop deriving a weight, and dropped it, because
the object it builds is a whitelist. **A plan materialized 07-26..07-29 has the assistance shape and
no assistance flag.** Michael's block is one. Nothing re-materializes plan history, so those sessions
keep that shape permanently.

**The fix is `src/lib/assistance-slot.ts` — flag first, then the composer's authored shape.** The
shape is not a heuristic: `reps: "N total"` with no set count is what the composer deliberately
writes so that no surface can render a set count that was never prescribed. Both halves are required
— a missing set count alone would let a malformed row credit a skipped main lift, which is pinned by
its own test.

⛔ **It is SHARED, and that is the point.** The server matcher's Tier 3 gate and the session screen's
planned-row extractor now call the same function. This exact question — "is this an assistance slot"
— decides whether work gets credited on one side and whether the rep total gets printed on the
other; two private copies would drift into "the app credited it but won't say what it was for."

⛔ **Do not delete the shape branch** when new plans all carry the flag. The old sessions do not heal.

---

## D-371 — THE STRENGTH NARRATIVE LLM IS DELETED; THE SCREEN IS A LEDGER (2026-08-02, Michael) — **VERIFIED ON DEVICE**

Michael: *"we are stripping all the ai out of the app... i heard strength uses it for the synopsis it
doesnt even show, we dont need it, it should be a ledger."*

### WHAT WAS DELETED

`generateEnhancedStrengthInsights` and everything that fed it — **845 lines out of
`analyze-strength-workout`**. The function was a Claude call (`model: 'sonnet'`, 300 tokens) with a
system prompt, an e1RM block, a novel-movement block, an unplanned block, a register block, a
**2-attempt validator loop** and `capNarrative` to trim the result to four sentences. It ran on every
strength analysis and **every recompute**, twice whenever the first draft broke a reasoning rule.

### THE FINDING: IT HAD REACHED NOBODY SINCE 2026-07-30

The client stopped rendering the strength narrative that day ([D-338] + the deletion note in
`MobileSummary.tsx`). The paragraph kept being generated for a month, billing on every recompute,
written into `session_state_v1.narrative.text` / `summary.bullets` / `ai_summary` — all read by
nothing on a strength surface.

⚠️ **This is the third form of the codebase's standing disease.** Not *starved* (built, never fed) and
not *doubled* (built twice) — **orphaned**: still running, still costing, output arriving nowhere. The
tell was cheap and nobody looked: grep the field it writes for a reader.

### WHAT WENT WITH IT, AND WHY THAT MATTERS MORE THAN THE MODEL CALL

- The **Temporal Arc fetch** (`getArcContext`) and `strength_spine_verdict`.
- The **`spine_direction` tagging** of `e1rmTrend` rows — whose only consumer in the entire codebase is
  `_shared/narrative-core/adapters/strength.ts`, the reasoning scaffold the prompt was built from.
- **`novelFact`** — an **8-week history query per analysis**, existing solely to hand the validator a
  list of movement names the prose was obliged to mention (Q-111 §2 rule 9).
- `isUnplannedSession`, the flag for prompt rule 8.
- **Seven imports**, each verified dead by reference count before removal, not assumed.

**Two database round-trips removed from every strength analysis and every recompute**, on top of the
model call. `deno check` on the file: **2 errors before, 0 after** — one was real and had been hiding
behind the arc import chain.

⛔ **`getE1rmTrend` STAYS.** `buildStrengthTestResult` reads it and the e1RM numbers are the receipt
behind the all-out set. Only the spine TAGGING of its rows was for the paragraph.

### THE EMPTY STATE IS THE OLD FAILURE STATE

`insights` is now always `[]`, so `narrative.text` → null (`source: 'none'`), `summary.bullets` → `[]`,
`ai_summary` → null. **Those were already the values whenever the LLM call failed or returned empty**,
so no consumer meets a shape it has not always handled. Verified on device: nothing changed on screen.

### SCOPE — THIS IS NOT A BAN ON LLMs

Michael, in the same message: *"we may keep it in race builder so dont get rid of all of it."*
`_shared/llm.ts` and every other caller stand — the **coach**, the **race-readiness** line,
`course-strategy`, `arc-setup-chat`, `extract-races`. What died is **the output-LLM on the strength
session screen**. Run and ride were already deterministic; swim's is behind an env flag and off.

### WHAT SAYS THINGS ON THIS SCREEN NOW

The set rows, the all-out set with its rep record, the assistance totals ([D-370]) — and the swap
receipt, which is **deterministic prose** (`_shared/strength/substitution-note.ts`) computed from the
movement-pattern table and checkable by hand.

⛔ **That is the model for anything this screen ever says again.** Do not restore a paragraph by wiring
a deterministic composer into `insights` without first deciding the screen wants prose at all — the run
and ride composers exist because those sports have a story about pacing and drift. **A strength ledger
does not.**

---

### D-372 — The three dead LLM prompt builders are deleted, and the tests that guarded their wording go with them (2026-08-02 night, PUSHED `4424d459` + DEPLOYED `analyze-running-workout` / `analyze-cycling-workout` + VERIFIED on device)

3,532 lines out, 45 in. The run and ride session paragraphs have been written by the **deterministic
composers** since 2026-07-19 ([D-304] lineage); the prompt builders they replaced were left in place
"for the cleanup pass" and had sat there ever since. This is that pass. It finishes what [D-371]
started on strength the same night — **no session screen has an output LLM any more.**

**DELETED, in the confidence order they were verified:**

| file | lines | why it was safe |
|---|---|---|
| `analyze-running-workout/lib/narrative/prompt-builders.ts` | 852 | **ZERO references repo-wide**, verified per-EXPORT not per-file. The one near-match is `course-strategy`'s own local `buildPrompt` (`index.ts:99`), defined in that file, unrelated. |
| `_shared/fact-packet/ai-summary.ts` | 1,261 | the run prompt builder; its only live importer void'd the symbol at `index.ts:2384`, and `composeRunInsight` was already the sole producer of `ai_summary`. |
| `_shared/cycling-v1/ai-summary.ts` | 644 | the ride equivalent, same shape, void'd at `index.ts:2733`, `composeBikeInsight` producing the real text. |

⛔ **THE HANDOFF BANNER WAS WRONG ABOUT THE IMPORTERS, AND THAT IS THE PART WORTH REMEMBERING.** It
said each `ai-summary` file had "exactly one importer." True of `index.ts`; **false of the repo** —
three TEST files also imported them. A per-file grep found one caller; a **per-export** grep found the
rest. *Grep the exports, not the filename.*

**THE TESTS, AND THE QUESTION THAT ACTUALLY MATTERED.** Those tests pinned four decisions
(D-035, D-036, D-037, D-038 Piece 3). A test whose subject was rebuilt elsewhere should be
**re-pointed, not deleted** — so each was traced before anything was cut:

- **D-035 (unplanned) and D-036 (decoupling) WERE rebuilt and are live** on the deterministic spine —
  `session-detail/types.ts:351`, `build.ts:1038`, `build.ts:766/1041/1809`, plus four client
  components. Their display-packet tests were a **second, dead copy**. ⛔ Do not "restore" them.
- **D-037 and D-038 Piece 3 pin the wording of a "pace vs similar" line, and NO SCREEN RENDERS ONE.**
  Verified absent from `session-detail/build.ts` and every client component. They were guarding text
  that does not exist.

So `unplanned-workout.test.ts` and `cycling-v1/ai-summary.test.ts` are deleted whole.
**`decoupling.test.ts` is NOT** — it also covers `enrichSamplesWithGAP`, `calculateEfficiency` and
`analyzeHeartRate`, **including the 2026-07-14 regression where a mixed-effort run was dropped from
the State durability trend for 16 days.** Only its display-packet half was cut; 14 live tests remain.

**WHAT WAS DELIBERATELY NOT SWEPT.** The other eleven void'd refs on `analyze-cycling-workout:2733`
stay — `plannedWorkout` among them is genuinely used elsewhere — as do the seven on
`analyze-running-workout:2384`. Both lines now carry a `[Q-246]` pointer. That is Q-246's **tidy
half**, and each dead ride row's dated "why this is off" comment must move to a `D-NNN` before the
code goes. Judgment, not mechanics.

**VERIFICATION — the method, since "it compiles" proves nothing here.**
`deno check analyze-running-workout` 65 → 61 errors (the four that vanished were inside the deleted
file); `analyze-cycling-workout` 10 → 10; full `_shared` suite **1533 passed / 0 failed**. Then the
real one: recompute on device, and **the database checked for write timestamps** rather than trusting
the screen — Jul 27 run, Aug 2 run and Aug 1 ride all carried `ai_summary_generated_at` stamped
2–9 minutes old, in click order, after the deploy. **Paragraphs came back byte-identical.** Both
strength rows correctly carried no summary at all ([D-371]).

**WHAT STAYS, AND IT IS NOT NEGOTIABLE FROM A CLEANUP PASS.** `_shared/llm.ts`, `coach`,
`course-strategy`, `arc-setup-chat`, `extract-races`. Michael: *"we may keep it in race builder so
dont get rid of all of it."* The coach and the race-readiness line are the last two live output-LLMs.

**WHY THIS IS WORTH DOING AT ALL**, since nothing on screen changes: the dominant failure mode in this
codebase is a session finding something that looks alive and either rebuilding it or wiring to the
wrong copy — four plan generators exist because of it. A 1,261-line file named `ai-summary.ts` sitting
beside a working composer **is** that trap: it reads as a description of what the app does, and it
described what the app used to do. The return is not performance. It is that the next session is not
lied to.
