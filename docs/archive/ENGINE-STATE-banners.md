# Superseded handoff banners — ENGINE-STATE

Every **`🧭 NEXT SESSION — START HERE`** banner that has been replaced, newest first. Moved out of
`docs/ENGINE-STATE.md` on 2026-08-02 (47KB, nine banners, a quarter of that file).

## What these are, and what they are NOT

Each one is **a set of orders for a session that has already ended.** The end-of-session protocol in
`CLAUDE.md` says one banner exists at a time and the old one is deleted, not stacked. That did not
happen — every session wrote a new banner and left the previous one in place, so nine accumulated.

⛔ **DO NOT TAKE INSTRUCTIONS FROM THIS FILE.** Every banner here was explicitly stamped SUPERSEDED by
the session that replaced it. The live banner is at the top of `ENGINE-STATE.md` and is the only one
that describes your job. **These are kept as a record, not as guidance** — the facts inside them were
true on their date and several were corrected afterwards.

## Why keep them at all

Read top to bottom they are a **diary of what the project thought it was doing**, week by week —
which job looked urgent, what was believed shipped, and what turned out to be wrong. That history is
the only place some reversals are visible, since the docs have forward pointers and no back-pointers.

---

## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-24 LATE — the strength-numbers audit moved the session; the copy-voice work below still stands as history) (2026-07-24 EVE — APP-WIDE COPY VOICE RESET + WEEK-NARRATIVE POSTURE FIXES SHIPPED (coach v149) · NEXT = DEVICE-VERIFY THE COPY, THEN RESUME THE STATE-AS-HUB **ADJUST** TAB)

> ## READ `docs/COPY-VOICE.md` (the new voice template) + **D-319 → D-321** (this session), then the still-valid Adjust-tab banner below.
>
> **Your JOB:** (1) DEVICE-VERIFY this session's copy/voice sweep on a FRESH bundle — the coach narrative + posture sentence are server-verified, but the ~45 CLIENT strings need Michael's eyes (web hard-refresh, or `npm run ios` for the phone). (2) Then resume the roadmap: build the State-as-hub **Adjust** tab (see the banner below + `CONCEPT-adapt-plan-strength.md`).
>
> ### WHAT SHIPPED — do NOT re-litigate (coach DEPLOYED v145→149, compute-snapshot + workout-detail DEPLOYED, client PUSHED to Netlify, snapshot recomputed, narrative + posture SERVER-VERIFIED via live coach call):
> - **App-wide copy voice reset to the "quant who trains" template** — new `docs/COPY-VOICE.md` (10 rules + banned idiom/jargon lists). ~45 live strings rewritten across State / Adjust / CoachWeek / BlockSummary / workout-detail + server prose (posture, week-narrative, cross-training, strength-protocol). Michael-calibrated: no "you said", no idioms, present-participle ("fading" not "fades"), "fell short by N", cause as "as a result of". The hard-check `voiceViolation` lives in `week-accent.ts`; wiring it app-wide is the NEXT enforcement step (NOT built).
> - **Posture diagnosis (D-292/Q-179) rewritten fact-first AND finally surfaced** — renders in the run efficiency ⓘ tap-down (`StatePerformanceSection.RunFitnessRow`). Orphaned always-visible `PostureLine` (F10) DELETED.
> - **State continuity — client fallback DELETED** (`useStateTrends.ts`): the server display contract is the single source; loading state when absent, zero client re-derivation.
> - **`overall_training_read` "This week" fallback DELETED (F8)** — the ~25-branch imperative tree duplicating the load bar. Client render + server function + emission gone; type nullable.
> - **Week-narrative posture GOVERNMENT (3 device-caught bugs, all `coach-week-insights.ts`, 32 tests green):** (a) MAINTAIN disciplines excluded from the plan-adherence line — killed "Running came in heavier than planned" over "under what holds it"; (b) PARKED ('out') disciplines stay silent — fixed 'out'→'dropped' + bike/ride alias (took 2 tries: v147 keyed 'bike', but disciplines canonicalize to 'ride'); (c) the fade clause fires ONLY for a `develop` discipline you're building (was: any undeclared one). Deleted the dead `MIN_SHARE_PCT` guard.
>
> ### ⛔ STILL UNVERIFIED / OPEN:
> - **CLIENT copy on device** — the ~45 client strings are server-correct + build-clean but NOT device-seen. Michael must be on the fresh bundle (iOS needs `npm run ios`).
> - **Copy stragglers (deliberately left):** the dead `buildVerdict` taper cues (shown nowhere → deletion pass), the `ai-summary` LLM prompt example text, `longitudinal-signals.ts` "efficiency factor".
> - **Q-201** — one rare cross-engine contradiction (narrative load-read vs coach's-eye fitness-read on a develop focus); DEFERRED, needs a coach reorder → Phase 7.
> - **Voice check not wired app-wide** — `voiceViolation` gates only week-accent today.
>
> ### ▶ THE PLAN (Michael, end of session): lock in behavior, THEN a dedicated DEAD-CODE / REFACTOR pass (GAME-PLAN Phase 7 — dead edge functions, orphaned components, 150+ one-off scripts). Its OWN careful pass with tests, never mixed into feature work.


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-24 EVE — the copy/voice + continuity + week-narrative-bug session moved the work; the load/strain multi-sport fix + Adjust-tab roadmap below still stand as history)

> ## READ `docs/CONCEPT-adapt-plan-strength.md` (the **State-as-hub** section) + **D-316** (the three-tab design), then **D-317 → D-318** (this session's engine fix).
>
> **Your JOB:** build the **Adjust** tab of the State-as-hub — the *steer* half. Status (read) is shipped and live; Adjust is a **v0 scaffold only** (`src/components/context/StateAdjustLens.tsx`, wired into `StateHubTabs.tsx` / `StateTab.tsx`). The work is to **re-home the strength edits that currently live in the LOGGER** (swap / add / weight — `StrengthLogger.tsx`, `persistPlanSwap`/`persistPlanAdd`) onto the State strength row, same disciplines/order as Status. Build strength first (re-homes what exists → writes through `adapt-plan`/`materialize`, reads the spine), then clone for run/bike/swim. **Schedule** (sliding-cards week over `week-optimizer`, needs a per-move re-solve endpoint + a touch drag layer like `@dnd-kit`) is its own later build. Full design + diagram: the State-as-hub section of the CONCEPT doc.
>
> ### WHAT SHIPPED THIS SESSION — do NOT re-litigate (DEPLOYED + DEVICE-VERIFIED on Michael's WK3 screen):
> - **D-317 — LOAD is multi-sport.** `body-response.ts` computed `load_status` from a **run-only** block (`running_acwr>1.3 → high`) → a strength week with a bunched maintenance run read "pull back". Now `computeTotalLoadStatus(totalAcwr, totalPct, phase)` (`body-response.ts:40`) reads TOTAL load, phase-aware, descriptive; goal-cost stays in the coach's eye. Necessary but not sufficient →
> - **D-318 — STRAIN is multi-sport.** The **reconciler** (`load-status-reconcile.ts`, THE LAW, applied `coach/index.ts:3625` ⟨A31⟩) re-escalated off run-brain strain: it counted **"RIR declining"** as strain (in a strength block that's the INTENT — a *systematic* false "a bit high" for any progressing strength athlete) and **"HR drift declining"** even when the absorption engine had excluded drift. `computeDecliningSignals(bodyTrends, opts{planPrimary,driftUsable})` drops both; threaded into escalation **and** safety floor; the absorption ledger is neutralized for strength-primary so `corroborated_strain` can't stay true off the same RIR signal. Result: WK3 → **"balanced" · ACWR 1.2** (was "pull back").
> - **v144 copy** — BODY HR-response "settling — HR easing…" → "settling — **lower HR** at the same effort" (killed the "easing" clash with the efficiency word "easing off").
> - **Cache-floor trap (the "not budging" cause):** `COACH_CLIENT_MIN_PAYLOAD_VERSION` (`coach-contract.ts`) had drifted to **35** while the server was at 142 → the client served stale "pull back" rows. Now pinned WITH `COACH_PAYLOAD_VERSION` (144), "bump both" comment. ⚠️ **THEY HAVE DRIFTED AGAIN (re-verified 2026-07-31): server `COACH_PAYLOAD_VERSION = 155` (`coach/index.ts:137`) vs client `COACH_CLIENT_MIN_PAYLOAD_VERSION = 144` (`src/lib/coach-contract.ts:5`). The client value is a FLOOR, not an equality, so this is not necessarily the same bug — but the "bump both" habit the entry describes is not being kept.** ⟨A31⟩ **Deploy note:** `coach` is the ONLY importer of the touched shared files — no `_shared` fan-out.
> - Tests: 4 new permanent regressions in `load-status-reconcile.test.ts` (incl. the "Michael WK3" bug case); +6 `computeTotalLoadStatus` in `body-response.test.ts`; all 60 prior pass.
>
> ### ⛔ STILL UNVERIFIED (carried from 2026-07-23, NOT closed this session — the session pivoted to the load bug before the strength-track client UI was device-seen):
> - The **D-315 strength-track CLIENT UI** — the logger's RIR **range display**, the **swap** "just today / rest of plan" sheet, and the **＋ Add to plan** button — is burner-verified server-side but **still not confirmed rendering + firing on a real device.** Verify this alongside the Adjust-tab build (it re-homes exactly these controls). If the ＋ button is missing → stale bundle.
>
> ### ▶ AFTER THAT (still teed up): the **impact-read** (a permission engine with confident guardrails — chronic interference ~null; only acute timing + load cost; discipline-aware voice) and **Schedule** tab. See D-316's impact-read bullet + `SCIENCE-concurrent-training-interference`.


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-24 — the load/strain engine fix moved the session; the "adapt a plan" strength-track detail below still stands as history and is STILL client-unverified)

> ## READ `docs/GAME-PLAN.md` + `docs/CONCEPT-adapt-plan-strength.md`, then **D-315** (this batch) and back-annotated **D-285**.
>
> **What happened:** built the whole "adapt a plan" **strength** track. All PUSHED (`db912150` Step 0, `430c717a` the rest), edge functions DEPLOYED (`generate-combined-plan`, `materialize-plan`, `adapt-plan`), migration APPLIED (`plan_adjustments` +`substitute_exercise_name` +`add_meta`). **Burner-verified 11/11 on the LIVE pipeline** (`scripts/_burner-strength-adapt.mjs`, gitignored — a throwaway user, real materialize, deleted after).
>
> ### WHAT SHIPPED — do NOT re-litigate (server burner-verified; NOT device-seen yet):
> - **Step 0 — phase + lift-aware RIR target, single-sourced (D-315).** `getTargetRir` gains a phase arg (`PHASE_RULES.targetRirOffset`, clamped [0.5,4]); stamped at BUILD (`session-factory`) AND at MATERIALIZE (`materialize-plan`, via `resolvePlanPhase`+`resolveProfile`) so existing mid-plan athletes pick it up on re-materialize (no regen). Logger renders half-steps as a field-standard RANGE ("2–3") via `src/lib/rir-format.ts`; logged values stay whole reps. Burner: squat base 2.5 → build 2.0. **This closed the STARVATION** — the RIR grade had no target before; now the logger preload = analyzer grade = State verdict, all on the one stamped value.
> - **#1 SWAP (D-315).** Reversible override on `plan_adjustments.substitute_exercise_name`. Logger swap sheet gains "just today / rest of plan" (chips + typed). `materialize` renames the slot before weight resolution and re-seeds from the NEW lift's reference. Burner: bench → dumbbell bench, original gone, weight reseeded.
> - **#2 ADD (D-315).** `plan_adjustments.add_meta`. Logger "＋ Add to plan" on a hand-added lift → `materialize` injects it into future strength days whose focus matches the lift's movement group (`getMovementGroup` in `exercise-config`), **capped 2×/week (Schoenfeld 2016)**, weight seeded from baseline. Idempotent (never persisted into `strength_exercises`). Burner: hip thrust on lower days only, 2 placements, seeded.
> - **#3 CONSENT-FIRST WEIGHTS (D-315, extends D-285).** DELETED `adapt-plan`'s silent auto-progression/deload writes. Weights change ONLY on the athlete's tap now (State adjust modal / swap / add). Michael's ruling: "we shouldn't auto change weights, the user needs to know."
> - **Continuity fix:** `adapt-plan` suggest now passes `phaseTag` to `getTargetRir` — the suggestion engine graded on BASE RIR while everything else used the phase-aware value (a quiet split). One target everywhere now.
>
> ### ⛔ UNVERIFIED — this is JOB #1 for the device: the CLIENT UI + the GENERATE path.
> The burner proves the DEPLOYED materialize (RIR stamp + swap + add) on synthetic data. It does NOT prove: (a) the logger's range display / swap toggle / ＋ button render + fire on a real device; (b) `generate-combined-plan`'s build-time stamp on a REAL plan (burner hand-built the plan + ran materialize only — same `getTargetRir`, low risk). **Michael is adding hip thrusts tomorrow on his week-3 plan** — that add triggers the re-materialize that ALSO surfaces RIR on his upcoming weeks. He must be on the FRESH client (web/PWA hard-refresh, or `npm run ios`). If the ＋ button is missing → stale bundle.
>
> ### ⚠️ WATCH:
> - **Do NOT back-date / rebuild to "see" the features** — they work on the existing plan via re-materialize (that's why the materialize-side stamp exists). A rebuild re-derives weights from typed baseline (could start lighter than his progressed loads) and creates orphan past planned rows. Logged history/e1RM is user-scoped, never at risk.
> - **Typed-name swap edge case:** a swap recorded against a slot renamed by equipment-substitution could miss the name match. Rare.
> - **Single-row materialize** (`planned_workout_id` path) can't see sibling days, so the 2×/week add cap is only exact on a full-plan re-materialize (which the add flow triggers). Fine in practice.
>
> ### ▶ NEXT JOB — STATE-AS-HUB (the architecture, designed 2026-07-23, NOT yet built). Read the **State-as-hub** section of `CONCEPT-adapt-plan-strength.md` (it SUPERSEDES the old "separate refine hub / Adjust-plan button" sketch). **State itself is the hub** — see AND steer on one surface, via the existing segmented-tab control (reuse the `Planned/Performance/Details` tabs). Three lenses: **Status** (read, default — today's State screen) · **Adjust** (same disciplines, now steerable — pull back/push load, add intensity, swap/add — the strength edits currently in the LOGGER re-home here) · **Schedule** (sliding-cards week over `week-optimizer`; scope = this-week vs rest-of-plan; needs a touch drag layer like `@dnd-kit`, NOT the desktop-only calendar drag). Bottom 4 (HOME/STATE/GOALS/+) always there; STATE = gateway. Build Adjust's strength lens first (re-homes what exists), then run/bike/swim; Schedule is its own build (new per-move re-solve endpoint). ALSO teed up: the **impact-read** (adding leg strength near a key run/ride = acute timing cost only; chronic interference is ~null per `SCIENCE-concurrent-training-interference` — so it's a permission engine with confident guardrails, not a warning engine) and the **add periodization already shipped** (see D-315 addendum).


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-23 EVENING — strength charts below still stand; the session moved to the "adapt a plan" strength track)

> ## READ `docs/GAME-PLAN.md`, then **D-312 → D-314** (this session) and **Q-200** (the one open design call).
>
> **What happened:** a long Michael-driven session that (1) fixed a real data bug, (2) shipped the strength + bike OUTPUT charts the last session teed up, and (3) did a UX pass on the whole FITNESS section. All PUSHED, edge functions DEPLOYED (`compute-facts`, `compute-snapshot`, `coach`), coach cache rebuilt, iOS rebundled. Michael SAW most of it on device.
>
> ### WHAT SHIPPED — do NOT re-litigate (device-seen unless flagged):
> - **Q-197 CLOSED — the exercise-name split (D-312).** Squat/deadlift/OHP verdicts were running on partial history because raw names never canonicalized: `barbell_back_squat`, `conventional_deadlift`, `standing_barbell_overhead_press`, and plural forms slugged into lone buckets and dropped out of `STRENGTH_ANCHORS`. Fixed `_shared/canonicalize.ts` (synonyms + a general plural fallback) + `canonicalDisplayName` (one clean label per lift). Recomputed the 13 affected workouts; squat 4→7 sessions in the 12wk window. **Also fixed the SAME bug on the client** (`StrengthLogger.tsx` `normalizeExerciseName` drops a trailing 's') so "Hip Thrusts"/"Hip Thrust" autofill matches. 8 canonicalize fixtures.
> - **Strength e1RM charts (big-4) + bike power chart (D-313).** 12-week output sparklines: strength = per-lift e1RM; bike = terrain-binned 20-min power (`w20`) of the winning bin. Generalized the run `EfficiencySparkline` → `TrendSparkline` (run render byte-identical via defaults). Noise floor (`minSpanFraction`) so small moves on slow lifts don't look like cliffs. 12 bike fixtures incl. full-assembly integration.
> - **Endurance-rider "power trend ⓘ" (D-313).** When bike power is `needs_data` (all-aerobic riding), a tap-ⓘ NAMES what unlocks the chart (a hard 20-min effort) instead of silently omitting it. Fact-first, no imperative.
> - **State layout widened (D-314).** Discipline name is now a HEADER above full-width content (was a ~94px left gutter), so the 12-week charts use the horizontal room. Headers bumped (13.5px/16px icon) for scanning. Shared `Row`, so all disciplines moved together.
> - **Week-blurb copy fix.** `coach-week-insights.ts:168` under-plan line lost its consoling closer ("the plan reflects where you are now, not where you were scheduled to be") — now just the fact. Verified live in the coach payload.
>
> ### ⛔ Q-200 — THE ONE OPEN DESIGN CALL: bike EFFICIENCY chart for endurance-only riders. The power chart only renders when power leads; a rider like Michael (0 power-bin rides) never sees a bike chart. Charting HR-at-power efficiency would fix that — but efficiency is lower-is-better (line goes DOWN when you improve), inverted from the power/e1RM charts. Michael's UX call, not built.
>
> ### ⚠️ UNVERIFIED / WATCH:
> - **Bike POWER chart — DEPLOYED-PIPELINE VERIFIED via burner (2026-07-23).** A throwaway user with 6 rising threshold rides run through the LIVE `compute-snapshot` produced `power.series` = 225→232→238→244→250→256 W, verdict "improving", recent-4 flagged — then deleted, no trace. So the deployed pipeline renders it correctly; the client sparkline is the same `TrendSparkline` already device-seen for strength. **Michael's OWN row stays chart-less until he logs hard 20-min efforts** (0 power-bin rides) — correct, not a gap. `bike-power-chart.test.ts` (7 fixtures) still pins the shaping.
> - **Deferred UX items (Michael-flagged, not blockers):** (1) *believability* — cross-lift e1RM reads bench(150) > squat(100), which athletes distrust; likely the squat e1RM under-reads off working sets at higher RIR. A data/estimation question, not UI. (2) *density* — four always-open strength charts push RUN down; could collapse-by-default with tap-to-expand.
> - **The bike efficiency verdict already leads for Michael** ("holding", 6 rides) — the row is correct, just chart-less until Q-200 or power rides.


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-23 — STATE RUN ROW + FITNESS: BIG UX/CRAFT + CHART PASS · MOSTLY DEVICE-SEEN · STRENGTH CHART BLOCKED ON A DATA-SPLIT BUG)

> ## READ `docs/GAME-PLAN.md`, then **D-307 → D-311** (this session's decisions) and **Q-197** (the squat split — a real data bug).
>
> **What happened:** a long, Michael-driven, device-iterated pass on the State screen — the RUN row and the whole FITNESS section. `COACH_PAYLOAD_VERSION` **135 → 141**. Every step: pushed, edge functions deployed (`compute-snapshot` + `coach`), iOS synced, and Michael's snapshot recomputed via `scripts/_trigger-snapshot.mjs`. Michael SAW most of it on device (screenshots), so it's closer to VERIFIED than usual — but read "unverified" below.
>
> ### WHAT SHIPPED — do NOT re-litigate (device-seen unless flagged):
> - **Precise verdict words (D-307):** `classifyTrend` gains `recentlyFlat`; "sliding" is retired as a *display* word → **"easing off"** (still dropping) vs **"settled lower"** (dropped then flat). Shared engine — every discipline. Fixtures: `classify-recently-flat.test.ts`.
> - **Run pace-at-HR line + GAP toggle (D-308):** the row shows the **raw** pace the watch recorded ("~12:46/mi at 134 bpm"), derived from the *same* index as the verdict; a "GAP" chip toggles the grade-adjusted twin. Field-standard split (raw displayed, graded under the hood). `recentEfficiencyPaceHr`, `run-efficiency-pace.test.ts`.
> - **Projected race times (D-309):** **goal-free** VDOT — `projectStandardRaces` (`_shared/race-readiness/index.ts`) reuses the shipped engine (`estimateVdotFromPace` → `getTargetTime`) with NO goal race. 5k/10k/half/marathon off current fitness; longer distances **UNLOCK** on estimated long-run distance. `project-standard-races.test.ts`.
> - **State color system (D-310):** discipline = a small colored **ICON** on the row label (matches WorkoutCalendar's set), label text WHITE; verdicts are **traffic-light** — green=improving, **GRAY**=holding/steady/settled-lower (was amber: a false caution AND a collision with run-gold), amber=easing-off/declining. Cross-training sentence colored by its **subject discipline** (was blue = swim's color). Two load bars unified (one word "bike", one casing, labeled windows).
> - **12-week efficiency chart (D-311):** `run.efficiency.series` (same points as the verdict, 84d window, recent-6 flagged). Sparkline on the RUN row — verdict answers "is my *current* training working" (6wk), chart answers "am I *trending up over the block*" (12wk). Charts **OUTPUT** (efficiency), not TP's **LOAD** (CTL/ATL/TSB). **Fills-as-you-build** for new users. `EfficiencySparkline` (self-contained SVG).
> - **Readability:** uniform brightness/size bump + `tabular-nums` + aligned grid columns + left-aligned prose across FITNESS + BODY.
>
> ### ⛔ Q-197 — REAL DATA BUG, fix before the strength chart: squat e1RM is split across TWO canonical names (`squat` AND `barbell_back_squat`) in `exercise_log`. It fragments any squat series AND may be skewing today's "Back Squat" verdict (best/trend on half the sessions). Trace `computeStrengthState` + the canonicalizer.
>
> ### OPEN THREADS (Michael-approved direction, NOT yet built) — see Q-198:
> - **Tap-to-expand** the efficiency sparkline into the full detail-screen chart pattern (toggle chips).
> - **Strength e1RM chart** — same `EfficiencySparkline`, building state — AFTER Q-197.
> - A **load/form-over-time chart** is the one thing TP charts that we don't (ACWR is on the spine) — optional TP-parity.
>
> ### ⚠️ UNVERIFIED / WATCH:
> - Cross-training discipline color needed the coach cache to re-source (v141) — confirm the line renders **gold** (run), not white, on device after a refresh.
> - `bikeEfficiencyDisplay` (`bike-fitness.ts:100`) ⟨A31⟩ still tones holding=`warning`; the FITNESS bike verdict renders via the **client** VERDICT map (now gray), so it's fine there — but if bike "holding" shows amber on any *other* surface, that's the server path.
> - Chart data-depth is athlete-specific: Michael has ~12wk run efficiency (14 pts) but only ~5wk strength e1RM/lift. The "building" state handles this honestly.
> - Two throwaway diagnostic scripts left on disk (`scripts/_trigger-snapshot.mjs`, `_check-run-pace.mjs`, `_chart-data-depth.mjs`) — read `.env` service key, no secrets in them; delete when convenient.
>
> ### ⛔ DOCS OVER THE CAP: `DECISIONS-LOG` 210KB · `ENGINE-STATE` 162KB · `OPEN-QUESTIONS` 155KB — all past the ~150KB archive line. Next session that edits them should move closed/superseded entries to the `-archive` files (CLAUDE.md rule).

---


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-22 — the deterministic-prose/composer work below still stands; this session moved to the RUN row + FITNESS craft/chart pass)

> ## READ `docs/GAME-PLAN.md`, `START-HERE.md`, `LIFECYCLE.md`, then **D-306 + its AMENDMENT**, and **Q-189 → Q-196**.
>
> **What happened:** the LLM was removed from State's prose. `coach.narrative` is now `composeCoachWeekInsight` (deterministic, protocol-aware, focus-aware) and `intent_summary` — a ~130-line tree of ~25 mostly-IMPERATIVE strings — is now just **plan name + week N of M**. All pushed and deployed. `COACH_PAYLOAD_VERSION` **117 → 122** across the night.
>
> ### ⛔ READ Q-195 BEFORE YOU BUILD ANYTHING. It is the load-bearing lesson of this session.
> Six times in one night this session hand-rolled something that already existed — the partial-week gate (solved in payload `v100`/`v102`, in the same file's own comment), the week-to-date load compare (`computeWtdLoadSummary`, called 2,800 lines above), a stall detector whose data was already plumbed, an endurance read that `adaptation_score` already does better, a load synopsis that `buildLoadHeadline` renders on the NEXT LINE, and a voice check that already exists in three places. **The anti-rebuild warning did not prevent this, and the session had read and quoted it.** You grep a NOUN you are about to name; you do not grep a PROBLEM you are about to solve. **Before writing any comparison, aggregation or gate: grep the SHAPE (`wtd|by_today|planned_reps|_label|headline`) and read the `COACH_PAYLOAD_VERSION` comment chain — it is a de-facto changelog of every trap already solved in that file.**
>
> ### ⛔ YOUR JOB #1 — SEE THE PARAGRAPH ACTUALLY SPEAK. It has never been observed in its current form.
> Two device sightings exist and NEITHER covers the shipped logic:
> - **Wk 2 (2026-07-19):** rendered *"The week was led by running — 44% of your load… Every discipline landed inside the range the plan asked for."* That build is **GONE** — the mix sentence was deleted (restated the LOAD bar above it) and the all-clear was rewritten (it over-claimed across off-plan disciplines).
> - **Wk 3 (2026-07-20, 03:30):** **SILENT** — correctly. The planned-vs-actual `actual` bar was empty; the week had just started, so the calendar-week read had nothing to say.
> **So the v120 window fix (calendar week via `computeWtdLoadSummary`, per discipline) has NEVER been seen producing a sentence.** Look mid-week, once sessions are logged. If it stays silent with real work on the board, that is a bug — start at the `disciplines[]` mapping in `coach/index.ts` (~:3880) and check `plannedLoad`/`actualLoad` are non-zero per discipline.
>
> ### ⚠️ DESIGN DECISION OWED (Michael, not you): **the paragraph is absent every Monday** and fills in as the week goes, because it reads calendar-week-to-date. Honest, possibly too quiet. Decide before "fixing" it.
>
> ### JOB #2 — THE ENDURANCE READ IS THE LAST DUMB HALF, and it should NOT be built.
> `coach-week-insights.ts:~231` judges every endurance discipline by `acwr < 0.8`, full stop. **`getBlockAdaptation` already does this far better and the coach ALREADY CALLS IT at `coach/index.ts:2619` ⟨A31⟩** — then keeps three raw percentages at `:2521` and throws away `adaptation_score`, `focus` and `drivers`. That score is focus-weighted, and its hybrid branch is a graded concurrent-training read ("don't rob Peter to pay Paul": strength −3% → ×0.75 coefficient, −10% → ×0.20; strength holding + aerobic improving → ×1.12 bonus) — where `compute-snapshot` has a binary interference flag off two diverging arrows (Q-191). ⚠️ It is called with **no focus**, and `deriveFocusFromCounts` can only return `hybrid`/`unknown`, so the `base`/`marathon_prep` weightings have **never run**. Wire the score + focus + drivers; delete the ratio.
>
> ### JOB #3 — the last two LLM lines: `coaching.headline` and `next_session_guidance`. Then State computes end to end, and only then does the CLEANUP SWEEP unblock (`narrative-core` stays alive until the headline goes). Fold Q-194's SHARED voice enforcer in here.
>
> ### 👀 TWO THINGS SEEN ON THE Wk-3 SCREEN, NEITHER TRACED — leads, not findings:
> - **The upkeep line reads "Running's at about 6 of your 18-mile upkeep" on a `Get stronger` plan.** If run posture is `maintain`, that is flagging a shortfall against a target the plan deliberately deprioritises — the Q-179 shape, on a DIFFERENT code path (`upkeepCandidate`, `week-accent.ts:263+` ⟨A31⟩) from the posture work. Trace before touching; it may be correct (6 of 18 is a real gap against a declared upkeep).
> - **Run durability anchor reads "auto · steady run · May 20"** on a 20 Jul screen. Inside the 12-week range so probably intended, but confirm it is not stale.
>
> ### WHAT SHIPPED TONIGHT — do NOT re-litigate:
> - **D-306 + AMENDMENT** — the composer, the protocol layer (`strength-protocol-read.ts`), the stall signal, the calendar-week fix, the deleted mix sentence, the scoped all-clear. 30 deno tests.
> - **`intent_summary` → position only** (v121 built a synopsis; v122 deleted it — `buildLoadHeadline` already renders one on the next line).
> - **Q-189…Q-196 filed.** Q-196 was **filed wrong and corrected in place** — the LOAD row renders the RECONCILED verdict correctly (`LoadBar.tsx:73`) ⟨A31⟩; I asserted the client's behaviour from the server's code without opening the client.
> - `SCIENCE-concurrent-training-interference.md` has a 2026-07-19 addendum (Schumann 2022 contests §2/§3; adds the reverse direction + the measurement ceiling).
>
> ### ⚠️ STILL TRUE, DO NOT OVERSTATE:
> - The composer is **fixture-verified (30 tests) and only partly device-verified.** Green tests proved the code did what it was told; **every real defect this session was found by looking at the rendered screen.** Render it and read it, next to whatever else that screen already says.
> - The **stall code has never fired** — needs a session with missed reps at the prescribed load.
> - **Protocol readings cover 5 of 7**; `triathlon` / `triathlon_performance` return null BY CHOICE (untraced intent), not by oversight.
> - A **stale raw-ACWR `label`** survives at `coach/index.ts:5593` ⟨A31⟩ with `back off`/`rest now` — a ratio prescribing alone (the D-281 bug Q-166 reverted). No client consumer found. **Trace every consumer, then delete — do not reword in place.**

---

---


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-19 NIGHT — run + bike composers still stand; the sweep moved to JOB #2 behind the coach composer)

> ## READ `docs/GAME-PLAN.md`, `START-HERE.md`, `LIFECYCLE.md`. **The product decision this session: LOSE THE LLM from all output narration.** Michael's call, after a year of proving the deterministic spine — the insight was always the engine's VERDICT, the LLM only phrased it (and drifted: "pace held steady" on a run whose pace ran 13:07→15:50). Research backs it (users hate AI-narrative fluff; DIS-2026 paper "Who Gets to Interpret the Workout"). Positioning: "the app that doesn't make anything up." **Keep the LLM ONLY for INPUT PARSING** (onboarding goal-parse `llm-arc-setup.ts`, `extract-races`) — unstructured→structured is the one thing it's good at, and the user confirms the parse. Never structured→prose again.
>
> ### ⛔ YOUR JOB #1 — THE CLEANUP SWEEP. Run + bike composers shipped and VERIFIED on device; the LLM per-workout generators are now DEAD but still in the tree (bypassed, `void`'d). Delete them.
> **DELETE (dead after the composers):** ⛔ **MOSTLY DONE — [D-372], 2026-08-02 night. Everything below except SWIM is deleted, deployed and verified on device.** `_shared/fact-packet/ai-summary.ts` and `_shared/cycling-v1/ai-summary.ts` are **gone**, along with `analyze-running-workout/lib/narrative/prompt-builders.ts` (852 lines, zero references, which this list never named). Both `void` lines lost their LLM symbol. **What remains of this bullet is (a) the SWIM block and (b) the non-LLM `void`'d refs, which are [Q-246]'s tidy half and must NOT be swept — `plannedWorkout` on the cycling line is live.** ⚠ SWIM: it had its OWN per-workout LLM narrative that the first pass MISSED — now disabled (facts only, no composer, per D-304), still in the tree. Confirm it's gone (recompute a swim → INSIGHTS should be just "Average pace … / N intervals").
> **⛔ KEEP — do NOT delete (a cold chat WILL get this wrong):**
> - `_shared/insights/run-insights.ts` + `bike-insights.ts` — the composers (the whole point).
> - `pacingVerdict` — lives in `run-insights.ts`, imported by `session-detail/build.ts` (the PACING row single-sources off it). Load-bearing.
> - `_shared/narrative-core/*` — SHARED with the **coach narrative** (still live LLM). Delete it and State's coach prose breaks.
> - `_shared/fact-packet/execution-honesty.ts` bits still imported by `analyze-cycling-workout` + `cycling-v1/cross-workout-types.ts` — trace before touching.
> - `llm-arc-setup.ts`, `extract-races` — input parsing, stays.
> **CONSTRAINTS:** trace every importer before deleting a shared file; redeploy ALL importers (the `_shared` deploy trap); typecheck each touched function (baseline-vs-change error count, they carry pre-existing errors); after, recompute a run AND a ride and confirm both still analyze.
>
> ### JOB #2 (after the sweep) — THE COACH NARRATIVE, the LAST output-LLM. It's the multi-week prose on the STATE screen (`coach/index.ts`, `athlete-snapshot/coaching.ts`). Same treatment: deterministic composer over the verdicts. This is a bigger composer (cross-discipline, multi-week) — its own job.
>
> ### STATE SCREEN STATUS (Michael asked twice — VERIFIED): everything on State is deterministic EXCEPT one line. Its fitness reads (strength per-lift, run durability, bike, swim, load bar, week-accent) are templates/verdicts; the `intent_summary` headline (`StateTab:1402`) is ALSO deterministic (an inline builder off readiness/intent/load verdicts in `coach/index.ts:5227`, no LLM). The ONE LLM element on State is the **coach narrative** — `weekNarrative = wsv.coach?.narrative`, rendered at `StateTab.tsx:1423`, minted in `coach/index.ts` (JOB #2). Replace that one line's source with a composer and State is 100% deterministic. The sweep does NOT touch State.
>
> ### WHAT SHIPPED + DEPLOYED + VERIFIED-ON-DEVICE this session. Do NOT re-litigate:
> - **RUN insights composer** (`_shared/insights/run-insights.ts`, D-304) — deterministic, replaces the LLM `ai_summary`. Three families (steady/easy/long · interval/tempo/hills/etc · fartlek-mixed), verdict-per-clause, silent when thin. `pacingVerdict` single-sourced with the PACING row (build.ts). LLM call removed from `analyze-running-workout`. Verified: "even effort across rolling terrain… HR held, pace swing was terrain not fatigue."
> - **BIKE insights composer** (`_shared/insights/bike-insights.ts`, D-304) — same, plus a POWER-vs-HR switch (full read with a meter: NP/IF/TSS/"watts didn't cost you HR"; HR-only: zone read, never a fabricated watt). LLM removed from `analyze-cycling-workout`. Verified on device. Fixed a live doubling: INSIGHTS printed raw HR drift (−8.4%) while the EFFICIENCY row shows Friel aerobic decoupling (−4.6%) — the paragraph no longer prints a drift number; the row owns it.
> - **Guards from earlier today are now DEAD** (they policed the LLM): the run HR-gate, the pace-steady/pacing-verdict guard, execution-honesty. Their LOGIC lives in the composers; the CODE dies in the sweep.
>
> ### ⚠️ RESIDUAL / WATCH:
> - Bike composer's `hrHeld` decision uses raw HR drift as a proxy, not the exact `aerobic_decoupling_pct` the EFFICIENCY row shows (they agreed in direction on the verified ride; could diverge on some ride). Wiring the exact figure into the decision is a follow-up — it's not a clean var at compose-time.
> - Run composer consciously dropped "out-and-back" specificity (no clean signal) and the "maintenance" closer (posture not in the packet) — silence over a guess. Optional polish.
> - iOS bundle stale caveat persists; verify client work on web/PWA.

---


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-19 LATE — see the LLM-teardown banner above; the strength-read + fan-out work below still stands as history)

> ## READ `docs/GAME-PLAN.md`, `START-HERE.md`, `LIFECYCLE.md`. Today the audit-the-posture-reads job (previous banner) got DONE and then went further — the strength read was rebuilt.
>
> ### ⛔ YOUR JOB — two open follow-ups, neither urgent:
> 1. **Goal-picks-instrument (the one real design piece left).** The strength read now leads with e1RM, which is correct for a **get_stronger** goal. For a **build_muscle** goal the field reads VOLUME, not e1RM (hypertrophy peaks on volume; e1RM is fatigue-suppressed mid-block). The goal already exists (`non-race-goal-seeds.ts`: `get_stronger` vs `build_muscle`); the read just doesn't switch on it yet. Wire: goal=get_stronger → e1RM leads (today), goal=build_muscle → `computeStrengthVolumeState` leads. Verified vs field+science this session.
> 2. **PR flag needs a fresh snapshot.** `bestE1rm` is a NEW field on `StrengthPerLift` (D-303). The per-lift numbers/directions render from the existing contract, but the **PR badge** only lights once `compute-snapshot` writes a snapshot carrying `bestE1rm` — i.e. Michael's next sync/recompute. Not a bug; confirm it appears after a sync.
>
> ### WHAT SHIPPED + DEPLOYED + VERIFIED-ON-DEVICE this session (2026-07-19). Do NOT re-litigate:
> - **Fan-out D-298 a/c/d VERIFIED.** Wrote a throwaway-user end-to-end harness (`scripts/fanout-audit.mjs`) — creates a fake user, pushes a synthetic run through the real pipeline ×3, asserts facts complete (hr_drift/time-in-zone/workload), snapshot written, no dupes, values converge. ALL PASS on real infra. The "one-workout-stale" + "orphan paths invisible" bugs are structurally fixed AND behavior-verified. (b — "reflects THAT workout vs a prior one" — not covered by a single-workout harness; low risk, watermark-guarded.)
> - **Strength read rebuilt (D-303), VERIFIED on device (Michael screenshotted it):**
>   - **e1RM noise guard** — the e1RM trend now must clear the lift's own within-window scatter (same `noiseGuardStdev` run decoupling uses). Killed a LIVE misread: squat read "sliding −2.5%" on σ=4.1% scatter, which made the overall verdict flip on any single session. 3 regression pins; 145/145 state-trend green. On Michael's real data: squat → holding, overall → getting stronger, twitchiness gone (was 3-of-4 pokes flipping, now 0).
>   - **Grinding moved onto the read** — `strength_rir_below_prescription` now renders as the FATIGUE line on the strength read (distinct from e1RM), pulled from the nudge allow-list (`nudge-policy.ts`) AND the coach prompt (`coach/index.ts`) so it lives in ONE place — client reads the coach-computed signal, no recompute.
>   - **Per-lift estimated-1RM read** (supersedes D-302's develop word-map + baseline dot) — each main lift: its `~`-marked estimated 1RM, noise-guarded 6-week change, PR flag, per-lift receipts. Referenced to the athlete's OWN best (`bestE1rm`), NOT a typed baseline (the field doesn't use one). Verified vs Strong/Hevy + RTS/RP + the 1RM-estimation/RIR science (sources in D-303). e1RM itself is RIR-adjusted Brzycki (compute-facts) + near-failure-weighted (D-118) — the science's own caveats, already coded.
>   - **`~` estimate marker** — the number reads "~150 lb": a projection off logged sets (e.g. Michael's bench = 120×5 @ 2.5 RIR → Brzycki ~150), not a tested max. Firms up as sessions stack + a near-failure top set is logged.
>
> ### ⚠️ WATCH / NOT DONE:
> - **Goal-picks-instrument** — see JOB #1. Only get_stronger is wired.
> - **Copy:** the grinding line wording is a PLACEHOLDER tuned-to-voice pending ("Reps in reserve have run below target…"). The posture "trade" sentence layer (`posture.ts`) is client-orphaned by design (Michael dislikes that reassuring register — see the copy-voice memory); do NOT resurface it.
> - **iOS builds go stale** (Xcode not re-bundling) — verify client work on the web/PWA (hard-refresh) or `npm run dev`; iOS needs `npm run ios` + Xcode ▶.
> - Q-185 / Q-186 / Q-187 / Q-188 still open, untouched.

---


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-19 midday — STATE SCREEN REFRAMED FOR THE GENERALIST · AUDIT OWED → the audit got done, then the read got rebuilt; see the banner above)

> ## READ `docs/GAME-PLAN.md`, then `START-HERE.md` + `LIFECYCLE.md`, and the new north star in **`docs/PRODUCT-POSITIONING.md`** (the 2026-07-18 block: the GENERALIST athlete, "fitness is an emergent process," cerebral-not-bro, the four questions, refuse-the-metric-firehose).
>
> ### ⛔ YOUR JOB — AUDIT THE STATE SCREEN ANALYSIS (Michael asked for it explicitly). The whole session pushed the State screen toward the generalist frame, but the last batch (posture-aware reads) is **SHIPPED-PENDING-AUDIT — grounded but NOT verified.** Audit before treating any of it as truth. What to check:
> 1. **Do the underlying verdicts hold?** The new wording sits on top of the engine's e1RM / decoupling / efficiency verdicts. If e1RM "holding" is noise (e1RM off working sets on a 5×5 IS noisy), the nice new word is confidently wrong. Trace the e1RM verdict + decoupling.
> 2. **Posture-aware reads correct per intent + science?** The strength read (`StrengthFitnessRow`, `StatePerformanceSection.tsx`): develop → getting stronger / on plan / gains flat / easing off. Line up vs the field (RTS/RIR, plateau = 3–4wk, gains lag early — all sourced in the transcript).
> 3. **Thresholds grounded or just plausible?** `planWeek ≥ 4` (plateau gate), `activeDisciplines` = session in last **28d** (detraining-onset), `sustained`. Michael picked the numbers; validate.
> 4. **Data check** — recompute vs his REAL data (the LoadBar numbers audited clean earlier this session: Run 40/Str 24/Ride 23/Swim 13, 354 pts, ACWR 1.3 — all matched). DB access = the `!`-prefix read-only curl pattern (service key in `.env`; classifier blocks Claude running it, so Michael runs it).
> 5. **Missing layer:** the strength read has NO RIR/deload fatigue signal yet — so "on plan" can hide grinding. `strength_rir_below/above_prescription` exist in `longitudinal-signals.ts`; wiring them is the owed second slice.
>
> ### THEN, still owed from before the State work:
> - **VERIFY THE FAN-OUT (a–d)** — needs ONE real Garmin/Strava sync (`AUDIT-fanout-ordering-2026-07-17.md` §4). D-298 shipped+deployed, guard verified live (e); a–d unverified.
> - **GAME-PLAN Phase 4 remainder:** `adapt-plan` one writer (silently re-prices strength every ingest, skips the sign-off gate); delete dead `_shared/endurance/hr-zones.ts` (⚠ `generate-run-plan/generators/sustainable.ts` refs its symbols — live/dead check first).
>
> ### WHAT SHIPPED THIS SESSION (2026-07-18 → 19) — pushed + (server) deployed. Fixture-verified UNLESS flagged:
> - **Max-HR single-source (D-299)** + **Threshold-pace single-source (D-300)** — resolvers; fixture-verified; byte-identical for a data-rich account. HR-congruence audit #5/#6 CLOSED.
> - **FTP stragglers routed** (identity.ts→LLM prompt, get-week, course-strategy, PlanSelect, normalizer) — FTP now single-source. **ACWR band (D-301)** — CoachWeekTab reads the reconciled verdict (no raw-ratio "back off"); the 4 other band fns were dead, deleted.
> - **RACE gate** (only renders for a real race), **SIGNAL gate** (allow-list — only distinct/actionable signals nudge; the redundant ones suppressed), **upkeep SLIP GATE (refines D-297)** — measured "aerobic base has started to slip" only when hr_drift declining, gated, `COACH_PAYLOAD_VERSION` 117.
> - **State UI pass** — edge-to-edge (instrument-panel/surface padding trimmed), all text +1px, tap-ⓘ explainers on ACWR / e1RM / bike efficiency.
> - **⚠️ State posture-aware reads (SHIPPED-PENDING-AUDIT)** — see YOUR JOB. Fitness rows: focus-first, dropped+inactive dims to bottom (never penalised), active-but-"out" shows normally. Strength read posture-aware. `useStateTrends` now always-fetches declared posture + last-4wk activity. **NO fixtures, thresholds are judgment calls, RIR layer missing.**
> - **Positioning north star + speed-plan State note** logged (`PRODUCT-POSITIONING.md`, `POLISH`). Course→watch pacing PARKED in POLISH (full analysis: Garmin sealed-workout limits, PacePro no-API, cycling = power-model upgrade, Apple-Watch-easier-but-wrong-audience).
>
> ### ⚠️ UNVERIFIED / WATCH — do NOT report as done:
> - **State posture-aware reads** — the whole point of the audit above. Grounded + reads right on device, NOT proven.
> - **Fan-out a–d** — needs a real sync.
> - **iOS builds were STALE all session** (Xcode wasn't re-bundling web assets) — the client work only showed once we used the **Vite dev server (`npm run dev` → localhost:8080, hot-reload)**. Use that for client iteration; don't trust an unrebuilt iOS app to reflect a push. iOS bundle refreshed via `npm run ios` (build+cap sync); Michael runs the Xcode ▶.
> - Q-185 / Q-186 / Q-187 / Q-188 still open, untouched.

---


## 🧭 NEXT SESSION — START HERE (SUPERSEDED 2026-07-14 EOD — POSTURE SHIPPED. THE STALE-DURABILITY MYSTERY IS SOLVED. NEXT: PHASE 2 (FAN-OUT) or the STATE v3 REDESIGN.)

> ## READ `docs/GAME-PLAN.md` (dependency-ordered), then `START-HERE.md` + `LIFECYCLE.md`. **New this session: `docs/STATE-SOURCE-MAP.md` and `docs/SPEC-state-fitness-band.md` — read both before touching State.**
>
> ### WHAT HAPPENED TODAY — the "as of Jun 27" mystery from the LAST banner is SOLVED, and it opened the whole product.
>
> The last banner said *"the run durability read is 16 days stale, DO NOT GUESS, get a DB query."* We did. **It was not the fan-out.** It was a WORD COLLISION: `decouplingBasis='raw'` meant "no elevation" to `state-trend/run.ts` (which DROPS raw) but the 2026-07-12 D-037 restore ALSO forced `basis='raw'` to mark a mixed-effort run low-confidence. The variance gate fires on **10 of 11 real outdoor runs**, so every run was silently binned and the trend froze. **A confidence flag was read as an exclusion order.** Fixed: the two facts travel apart now (`basis`=terrain, `decouplingMixedEffort`=confidence). Verified: 3 runs recomputed, `newestAgeDays 16→1`, `sampleCount 5→8`. **See D-291.**
>
> **Then the run trend showed "sliding" and Michael asked why.** Chasing it root-caused the whole thing: **he ran ~3x/MONTH since June (declared 3x/WEEK), so he's slower at the same HR — he DETRAINED, on purpose, to build strength.** Heat/humidity/dew-point/strength-block all tested and REJECTED as causes (`scripts/`, n=67 steady runs). The app was **grading his running like a marathon PR while his own plan said run=maintain.** That is Q-179, and we shipped its fix. **See D-292.**
>
> ### YOUR JOB — two good options, Michael's call:
>
> **OPTION A — PHASE 2, FIX THE FAN-OUT** (still owed; `GAME-PLAN.md`). The fan-out awaits the wrong things: `compute-facts` (awaited, `ingest-activity:1582`) reads `workouts.computed` written by two fire-and-forget calls (`:1508`,`:1521`); `compute-snapshot` reads `workout_analysis` written fire-and-forget AFTER it → run durability is one workout behind BY CONSTRUCTION. Plus `ingest-phone-workout`/`save-imported-workout` never reach the spine, and `workload_actual` is written by one job from two places (a snapshot row can contradict itself on ACWR). **This is real and still unfixed — the stale-durability bug was a SEPARATE cause, so Phase 2 is not "already done."**
>
> **OPTION B — STATE v3, THE FITNESS BAND + PROGNOSIS** (`docs/SPEC-state-fitness-band.md`, written today, sign-off gated). Two sections: Fitness (dot on your 12wk range + trend arrow) and Plan (the posture read, shipped). Tap → prognosis (ghost dot, "if this trend holds", + THE LEVER connecting the slide to the 1.6-vs-3 trade). **The lever is the payoff of today's posture work — it could not exist yesterday.** Biggest new piece: the `positionInRange` band scalar (needs a backfill). **This is the product Michael got excited about.**
>
> ### ⚠️ FILED, NOT CHASED — a real pre-existing bug found while shipping posture:
> The coach reads the athlete_snapshot with **MAX `week_start`** (`coach:2209`), but a **stray non-Monday snapshot row** (e.g. `2026-07-14`) has no `state_trends_v1` → the coach forwards `display: null` → the client falls to its LIVE in-browser path EVERY load. **So the entire S2 server-render optimization has been silently inactive for the primary user.** The posture render fix works regardless (live path now reads the goal too). **This predates all of today's work — file as a Q and fix separately. Do NOT confuse it with anything shipped today.**
>
> ---
>
> ### ✅ SHIPPED + DEPLOYED + PUSHED 2026-07-14. VERIFIED IN DB (not yet on device by Michael — see `POLISH-PUNCH-LIST.md`). Do NOT re-litigate.
>
> - **D-291 — the durability trend was DELETING runs.** `basis='raw'` collision (confidence vs terrain). Now split: `decouplingMixedEffort` carries the hedge, `basis` stays terrain-only. `state-trend/run.ts` drops only true no-elevation runs. Commit `4fece5da`.
> - **The grade-adjusted pace mislabel.** `gap_pace_s_per_km` was fed from `route_progress_metrics.effort_adjusted_pace_sec_per_km` — which is `pace × (avg_hr/threshold_hr)`, **HR-normalized, NOT grade-adjusted**. Real GAP (`computed.overall.avg_gap_s_per_mi`, Minetti, `_shared/gap.ts`) now feeds the route chart; a **Grade-Adj Pace tile** was added to Details (`CompletedTab`, reads the server number, never re-derives). Effort-adjusted keeps its own honest name. **See D-291.** Commit `4fece5da`.
> - **D-292 / Q-179 — POSTURE. The app now reads the athlete's DECLARED per-discipline intent** (`goals.training_prefs.per_discipline_posture` — read at RUNTIME for the first time; it was write-once at plan build). `_shared/state-trend/posture.ts` joins declared intent + what they DID + how it went. A `maintain` discipline that slips is a **TRADE, stated not scolded**; a `develop` one that slips is a concern. **Behaviour (sessions/wk vs declared target) outranks the trend** — a false-comfort bug ("you're maintaining" while he'd stopped) was caught in review before ship. No jargon, no cause asserted (verified vs Garmin: consumer apps use NONE of our words). Commits `856b5c1d` (engine+client) + `746c3685` (render fix + coach v97). **SPEC-posture-flag.md Tier 1 is shipped; Tier 2 (consequence prose) still owed.**
> - **`docs/STATE-SOURCE-MAP.md`** — every State row, its real substrate, every gate that can silently drop a session. **Four verified findings** for later: (1) the "as of" date drifts OPTIMISTIC (server sends an AGE, client renders vs TODAY); (2) the deload exclusion has **NEVER fired** (reads a `meta` field nothing sets → a deload week can read "sliding"); (3) the whole RUN column is gated on `route_progress_metrics` (a treadmill athlete is 100% invisible to State); (4) run efficiency excludes the long run by construction (30–70min gate).
> - **`docs/SPEC-state-fitness-band.md`** — the State v3 redesign (Option B above).
>
> ### ⚠️ METHOD — TWO LESSONS BANKED TODAY
> 1. **I burned the session budget on THREE unapproved deep-research passes; the third hit the session limit and returned nothing, costing ~4 hours.** Deep research + big Workflows now need Michael's explicit go-ahead (saved to memory). A quick WebSearch for one fact is fine; a fan-out is not.
> 2. **The deep research WAS worth it where it ran:** consumer apps use zero of our jargon ("decoupling"/"efficiency factor"/"aerobic base"/"durability" = 0 hits on Garmin); Garmin refuses to name a cause even WITH sleep/HRV; and NO app (TrainingPeaks/Garmin/TrainerRoad, firm) grades a discipline against declared intent — **posture is a genuine market gap.** (Hybrid apps + market-pain unconfirmed — the pass that would have closed that is the one that failed.)
>
> ---
>
> ### ✅ SHIPPED + DEPLOYED 2026-07-13/14 (strength + the docs). Do NOT re-litigate.
>
> - **Q-177** — the "strength volume down" signal was a **partial-week artifact** (a cumulative SUM of the current week vs the average of COMPLETE prior weeks → ~−75% on a Monday) firing at **CONCERN** severity every Monday, forever. Retired — same move D-239 already made one field over. The `structuralDirection` fallback that fed `interferenceScore` off the same artifact is gone too. `COACH_PAYLOAD_VERSION` 95 → 96.
> - **Q-178** — a set flagged `completed` with **zero reps/weight/duration** counted as PERFORMED. Live repro: zero Farmers Carries → `98% · Strong` → *"sets landed on target across all three lifts."* ⚠️ **The LLM was not lying — THE FACT PACKET WAS.** `narrative-core/validate.ts` validates prose against the FACTS, so **it cannot catch a lie that is already IN the facts.** The containment is sound and **only as honest as the packet.**
> - **Q-180** — the logger could not record a carry (no weight box, no duration persisted, RIR prompted on a timed set, wrong shape on hand-add, an apostrophe defaulting it to *barbell*, and `'40 m'` being read as 40 **seconds**). Fixed. ⚠️ **The Q-126 golden caught a copy regression AND a second, unfixed copy of the carry** (`FATIGUED_LEGS_STATION`). **Two definitions of one exercise — if you change one, GREP FOR THE OTHER.**
> - **D-289 / D-290** — **a SWAP IS NOT A SKIP.** The **SLOT** is the unit of strength adherence, not the exercise name (field standard). Swap button, in-slot alternatives, no dock, credit for the work, load/RIR not graded on an un-anchored substitute, and one honest sentence when the athlete goes out-of-slot. ⛔ **The guard matters more than the feature: an UNDECLARED miss is STILL a skip.**
> - **Q-TIMER** — the rest/duration timer lost the time you were away, then cancelled the notification that would have told you. **Seconds-remaining is a DERIVED value; the authority is `endsAt`.** Reconcile from the wall clock on every foreground, not just on mount.
> - **THE DOCS.** `CAPABILITY-MAP` rebuilt **from code** (the old one asserted a deleted path was live and cited a decision never written). `LIFECYCLE.md` — **the loop, drawn for the first time.** `GAME-PLAN.md`. Living docs **1.6MB → 420KB** (archive split, nothing lost). Six lying entries back-annotated.
>
> ### ⛔ THREE RULES NOW IN `CLAUDE.md`. They are load-bearing.
> 1. **DEPLOY EVERY IMPORTER.** Supabase bundles `_shared` **at deploy time**. Editing a shared file changes NOTHING until every importer is redeployed. This stranded **17 functions**, one for a month, and made D-287's *"the resolver is UNIVERSAL on every surface"* **false in production**.
> 2. **BACK-ANNOTATE.** When you supersede an older `D-NNN`/`Q-NNN`, **go back and mark the OLD entry.** Forward pointers were always good here; back-pointers never existed. That is how all five docs rotted.
> 3. **A SPEC DIES ON SHIP.** Fold it into a `D-NNN` and DELETE the file. `docs/` has ~149 files and most are stale **because specs never die.**
>
> ### ⚠️ METHOD — IT COST US REPEATEDLY
> **Run ALL FOUR suites, every time.** `supabase/functions/_shared` (1090) · `supabase/functions/shared` (106 — **a DIFFERENT directory, and it was a blind spot all day**) · `generate-run-plan` (33) · `src/lib` (198).
>
> **A code trace is right about what EXISTS and blind to what is BITING.** The four-agent audit found the architecture and **none of the three worst bugs** — those came from opening the app. **And a plausible mechanism found in code is a HYPOTHESIS, not a finding, until the data agrees.**
>
> ### AWAITING MICHAEL (shipped, human-unverified) — see the top of `POLISH-PUNCH-LIST.md`.

---

