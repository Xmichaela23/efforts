# STATE v2 — Trend-threshold proposal (strength + bike) + swim→load read-only check

**Date:** 2026-06-13
**Status:** Part 1 thresholds **APPROVED 2026-06-13** (build gated on status-headline — see top of Part 1). Part 2 swim check **RESOLVED 2026-06-13** (load NOT polluted — see §2.5). **Still nothing built.**
**Relates to:** SPEC-state-screen-v2-performance.md · D-146/D-147 (load verdict) · Q-038 (swim ingest) · D-118 (RIR pref) · D-111 (FTP cliff/ratchet)

This is read-only/report-only. No DB was queried (per the standing rule: no prod Supabase reads without an explicit go-ahead — see the one settling fact in §2.5).

---

# PART 1 — Trend-threshold proposal (strength + bike only)

> ## ✅ APPROVED 2026-06-13 — locked for build (build itself gated on status-headline decision)
>
> Michael approved the thresholds below ("strength 6wk asymmetric, bike pwr20 8wk") and directed: **build simple now, structured so it scales — no corner-painting.** Build does NOT start until the status-headline decision (two-part vs single word) is given.
>
> **Locked numbers:** strength 6wk · Improving ≥+2.5% / Holding −2.0…+2.5% / Sliding ≤−2.0% · ≥4 sessions. Bike (pwr20, shown as "power at threshold") 8wk · Improving ≥+2.0% / Holding ±2.0% / Sliding ≤−2.0% · ≥3 same-type rides. Shared noise guard: min-session gate + 2-point endpoint averaging + dead-band.
>
> **Architecture contract (the scalability lever — "one shared shape, each discipline feeds its metric"):**
> 1. **One shared trend primitive.** A single shape `{ window, points[], pctChange, noiseGuard, verdict }` and one `classify()` (Improving/Holding/Sliding/NeedsData) that ALL disciplines call. A discipline = a small adapter that produces the dated metric series + its window/thresholds and feeds the shared primitive. Adding run/swim later (post-Q-038) = a new adapter, not new scaffolding.
> 2. **Strength roll-up: simple now = overall verdict follows the primary lift(s).** But the per-lift trend output must be a **list of per-lift verdicts** (not a pre-collapsed single value), so a richer roll-up (weighted/modal) later is a change to the roll-up function only, not to the trend layer.
> 3. **Deload: exclude deload weeks now, but isolate it.** One predicate (e.g. `isDeloadWeek(session)` — today name-based `/deload/i`, D-124) used to filter trend endpoints. When the server `WeekPhase` flag (`_shared/athlete-snapshot/body-response.ts`) gets plumbed to the client, swapping exclude → "Holding (deload)" must be a one-spot change in/around that predicate + the verdict labeler — not a refactor.
> 4. **Bike source-agnostic.** The verdict/threshold code consumes an abstract `{date, value}[]` series; the **source** (pwr20 now; a future `ftp_history` table later) is a swappable adapter input. Changing the source must not touch trend/threshold/verdict code.
>
> **Reasoning detail for each number is unchanged below.** This box is the build contract; the proposal text is the rationale.

Scope: only the two disciplines with real live performance data. Run/swim trend rows are out of scope per the task (they'll ride the hybrid adherence fallback until data exists).

The verdict states are **Improving / Holding / Sliding / Needs data** (per spec). A proposal needs four things per discipline: **(a) trend window, (b) % cutoffs, (c) a noise guard so one session can't flip the verdict, (d) a "needs data" gate.**

## Shared noise-guard design (applies to both)

Three layers, so no single session flips a verdict (directly honoring the load-bug lesson — "don't escalate off one data point"):

1. **Minimum-session gate** → below it, the verdict is "Needs data," not a guess.
2. **Endpoint smoothing** → compare the **average of the 2 earliest** qualifying points in the window vs the **average of the 2 most-recent**, NOT raw first-vs-last. A one-off PR or one bad day gets averaged with its neighbor instead of anchoring an endpoint.
3. **Dead-band "Holding" zone** → a symmetric-ish neutral band around 0% so normal week-to-week wobble (and a planned deload) reads as Holding, not Sliding.

% change formula (both): `(recentAvg2 − earlyAvg2) / earlyAvg2 × 100`.

---

## 1A. STRENGTH

### Data reality (verified — grounds the numbers)
- **Per-session e1RM exists and is dated.** `exercise_log` has one row per lift per session: `{ date, canonical_name, estimated_1rm, best_weight, best_reps, avg_rir, ... }` (`compute-facts/index.ts:~1695-1710`). A real per-lift time-series — slope is directly computable.
- **`useExerciseLog` already computes a trend.** It returns `{ entries[], current1RM, peak1RM, trend, latestRir }` where `trend = ((current − first)/first)×100` over a default **12-week** window (`src/hooks/useExerciseLog.ts:~37,94`). So v2 doesn't need new compute for strength — it needs **cutoffs + a better noise guard** than raw first-vs-last (today's `trend` uses literal first/last, which IS single-session-anchored — see noise guard).
- **Aggregate per lift:** `learned_fitness.strength_1rms[lift] = { value, confidence(low/med/high), source, sample_count, last_logged }`, **84-day (12-wk)** window; confidence = high at `sample_count≥6`, medium at `≥3`, low `<3`; only-RIR≥5 sessions forced to "low" (D-118) (`compute-facts/index.ts:~960-1034`).
- **Per-lift, 7 anchors** (squat, bench, deadlift, trap-bar DL, OHP, hip thrust, row); a typical user trains **2–4** of them. **No composite "overall strength" number exists** — so the STATE "Strength" row needs a roll-up rule (flagged as a design decision below, not a number).

### Proposed thresholds (per lift)
| Param | Proposed value | Why |
|---|---|---|
| **Trend window** | **6 weeks (42d)** | e1RM moves slowly; 4wk is too few sessions per lift and a single deload week dominates. 6wk gives ~4–8 sessions/lift while staying "current." (Store holds 12wk, so headroom exists.) |
| **Min-session gate** ("Needs data") | **< 4 qualifying sessions** of that lift in the window | Below this the slope is noise. Also treat **only-RIR≥5 / low-confidence** lifts (D-118) as Needs-data, since their e1RM is autoregulation-grade, not max. |
| **Improving** | **≥ +2.5%** | One RIR of estimation error ≈ ~3% on a Brzycki e1RM, so the signal must clear roughly one-RIR of noise. +2.5% over 6wk is a real intermediate gain that's clearly above measurement noise. |
| **Holding** | **−2.0% < x < +2.5%** | Dead-band absorbs RIR/readiness wobble and a deload dip. |
| **Sliding** | **≤ −2.0%** | Asymmetric (tighter than the +2.5% improve gate) on purpose: a real e1RM decline is more actionable than a gain is celebratory, so catch detraining slightly earlier — but the dead-band still protects a deload. |
| **Noise guard** | 2-session endpoint averaging (see shared design) | A one-off PR single or one under-recovered day can't define an endpoint. |

### Two strength decisions that are design calls, not numbers (need your steer)
- **Multi-lift roll-up → one "Strength" verdict.** Options: (i) modal direction, ties → Holding; (ii) "Improving if ≥half of qualifying lifts improving AND none sliding hard; Sliding if any trained anchor sliding ≤−2% AND none improving; else Holding." I lean (ii) — it won't call the discipline "Improving" while a main lift is dropping. Your call.
- **Deload awareness** (the spec's open question). A planned deload mechanically lowers recent e1RM (lighter prescribed load, higher RIR) → could false-read as Sliding. Recommend either (a) exclude deload-week sessions from the trend endpoints, or (b) label "Holding (deload)" via the existing name-based `/deload/i` detection (D-124) — same plan-awareness the load fix needed. Pick one.

---

## 1B. BIKE

### Data reality (verified — and there's a blocker)
- **⚠ There is NO stored FTP history.** Only the single current value `learned_fitness.ride_ftp_estimated = { value, confidence, source, sample_count }` exists (`learn-fitness-profile/index.ts:~110,265`). It's re-estimated every ride over a **90-day** window with a **downward ratchet** (D-111) so it's deliberately sticky and won't reflect real declines well. **A literal "FTP went 200→210 over 4 weeks" readout is NOT computable from stored data today** — it would need a new `ftp_history` table + backfill (build work, out of scope).
- **What DOES exist as a trend substrate:** `workout_analysis.pwr20_trend_v1 = { points:[{ date, value(20-min best W), avg_hr, is_current }], classified_type }` — **90-day rolling, ≤12 points, requires ≥3 same-type rides** or it's null (`analyze-cycling-workout`). 20-min best power is exactly the physiological substrate FTP is derived from (FTP ≈ 0.95 × 20-min best), and it's already a dated series filtered to one ride type.

### Recommendation: trend the pwr20 substrate, not the resolved FTP
Use `pwr20_trend_v1.points[].value` as the bike trend source for v2 now. Reasons: (a) it's the only dated cycling-power series stored; (b) the resolved `ride_ftp_estimated` is ratchet-sticky and single-valued, so it can't show a trend honestly; (c) it already filters by `classified_type`, avoiding indoor/outdoor + easy/hard mixing. If you want a true FTP-history line later, that's a separate build (new table).

### Proposed thresholds (on the 20-min-power / pwr20 series)
| Param | Proposed value | Why |
|---|---|---|
| **Trend window** | **8 weeks (56d)** within the 90d series | Rides of a given threshold-type are sparser than strength sessions; 8wk collects enough points. |
| **Min-session gate** ("Needs data") | **< 3 qualifying same-type rides** (i.e. `pwr20_trend_v1` null/short) | Mirrors the existing ≥3 requirement — if the substrate can't form, the row is honestly Needs-data (→ hybrid adherence fallback). |
| **Improving** | **≥ +2.0%** | Power is a *direct* measurement (less noisy than rep-based e1RM), so the band can be a touch tighter. +2% over 8wk (e.g. 200→204W) is a genuine fitness move for a trained rider. |
| **Holding** | **−2.0% < x < +2.0%** | Absorbs ride-to-ride 20-min wobble (motivation/course/fatigue ≈ ±3–5%; and note the known power-ingest noise history — D-112 NP inflation, D-111 cliff). |
| **Sliding** | **≤ −2.0%** | Symmetric here (vs strength's asymmetry) because the ratchet already resists phantom declines upstream; no need to over-bias. |
| **Noise guard** | 2-ride endpoint averaging + ≥3-ride gate | Doubly important here — the load bug burned on single-data-point escalation; no single ride may flip the verdict. |

### Bike caveat to surface
The numbers above assume we trend **20-min power (pwr20)**, framed on-screen as "power at threshold," NOT the resolved FTP number. If you specifically want the verdict tied to the displayed FTP, flag it — that needs the new history table first, and I'd want your sign-off on building it.

---

## What needs YOUR sign-off vs what's mine to wire

- **Sign-off (numbers):** the windows (6wk strength / 8wk bike), the % cutoffs (+2.5/−2.0 strength; ±2.0 bike), the min-session gates (4 / 3). These are the "500-floor-class" judgment calls.
- **Sign-off (design):** strength multi-lift roll-up rule; deload handling; bike-trends-pwr20-vs-FTP framing.
- **Mine once you sign off:** the 2-point endpoint smoothing, the dead-band mechanics, wiring to `useExerciseLog` / `pwr20_trend_v1`. (Not built — awaiting numbers.)

---

# PART 2 — Read-only swim check: does Q-038 pollute the load/ACWR math?

**Question:** Is the Q-038 swim duration bug only a *display* problem, or is bad swim duration/load also feeding `acute7Load` / `chronic28Load` / ACWR — the exact pipeline D-146/D-147 just fixed?

## 2.1 The load pipeline is exposed to swim duration (verified in code)

1. **Load source — swim is NOT filtered out.** `coach/index.ts:2031-2042` queries `workouts(workload_actual, date, workout_status, type, …)` and sums `workload_actual` for every `workout_status='completed'` row. The only filter is completed-status; **`type` is selected but never used to exclude swim.** `acute7Load` / `chronic28Load` therefore include swim, and `rawAcwr = (acute7Load/7)/(chronic28Load/28)` (`:2553`).
2. **Workload is duration-derived for swim.** `calculate-workload/index.ts:90-110`: for cardio, `effectiveDuration = workout.moving_time` (line 104-105; the HR/TRIMP branch at :92 also uses `moving_time` as `durationMinutes`). Swim is cardio → its `workload_actual` = `calculateDurationWorkload(moving_time, intensity)` = `(moving_time/60) × intensity² × 100` (`_shared/workload.ts`, `calculateDurationWorkload`; matches the D-146 "hours × intensity² × 100" note). **No swim special-case, no cap.**
3. **Net:** a swim's stored `moving_time` directly drives its `workload_actual`, which flows unfiltered into `acute7Load` / `chronic28Load` / ACWR. **The pipeline is structurally exposed** — if a swim's `moving_time` is corrupt, the load math is corrupt by roughly the same factor.

## 2.2 The unit fragility (why this is a real risk, not theoretical)

`moving_time`'s unit is **not agreed across consumers**:
- `calculate-workload` treats `moving_time` as **minutes** (divides by 60 to get hours).
- `analyze-swim-workout` (~`:337-340`) treats it as **seconds if ≥1000, else minutes** (`actualMv < 1000 ? actualMv*60 : actualMv`).
- The Garmin/native ingest path **stores `moving_time` in minutes** (explicit `/60` at `ingest-activity/index.ts:187, 953, 957, 961`). On that path everything is internally consistent → a Garmin swim of 18 min stores `18`, workload reads 0.3h, fine.

Q-038 is specifically the **FORM goggles → Strava webhook** path, a *different* ingest route. If that path lands `moving_time` in the wrong unit (e.g. seconds, or a double-counted lengths sum), the value is wrong for BOTH the display (701:00) AND `workload_actual`.

## 2.3 The numeric signature

Q-038 display = **701:00 (701 min ≈ 42,060 s)** vs Strava truth **18:12 (1,092 s ≈ 18.2 min)** — a ~38× inflation (not a clean 60× seconds↔minutes swap), which matches the spec's own hypothesis of "a per-length aggregation that double-counts" rather than a simple unit flip. If `workouts.moving_time` for that swim holds ~701 (or 42,060), `calculate-workload` reads it as minutes → ~701/60 ≈ **11.7 hours** → workload ≈ `11.7 × intensity² × 100` (≈hundreds of points for one swim vs ~12 expected) → **a single swim would dwarf a normal week** and spike ACWR.

## 2.4 Corroborating evidence it is NOT *currently* polluting the observed case

The D-147 real-account trace (this week, `scripts/d146-load-trace.mjs`) showed **ACWR 0.49** — acute load ≈ *half* a normal week. A 38× swim spike anywhere in that 7-day window would have driven ACWR sharply **high**, not to 0.49. So in the specific week that validated D-147, **either there was no swim in the window, or the swim's stored `moving_time` was fine.** This is evidence the path isn't *actively* corrupting that user's current load — but it does **not** prove the path is safe in general (a future FORM→Strava swim could still land a bad `moving_time`).

## 2.5 Verdict — RESOLVED 2026-06-13: load is NOT polluted (Q-038 is display-only)

Ran the authorized read-only query (`scripts/q038-swim-read.mjs`, SELECT-only, user `45d122e7`). **Every swim — including all Strava-sourced rows — has a plausible stored `moving_time` (≤40 min). None exceed 180.** The affected FORM→Strava swim is identified:

| field | stored value |
|---|---|
| date / name | 2026-06-01 · "Afternoon Swim" |
| source | strava |
| **`moving_time`** | **18** (minutes — correct; matches Strava's 18:12) |
| `duration` | 18 |
| `elapsed_time` | 24 |
| `distance` | 0.8 (≈800m — matches the Q-038 FORM figure) |
| **`workload_actual`** | **29** (a normal swim load — NOT inflated) |

So the **701:00 mangling is NOT in `workouts.moving_time`.** The stored field that feeds workload is correct (18 min → `workload_actual = 29`, in line with the other swims' 4–42 range). The 701:00 / 2263% duration-adherence bug therefore lives in the **session_detail render / adherence computation path** (which reads some other field or recomputes from lengths), exactly as the spec's "OR session_detail render" branch anticipated.

**Conclusion: Q-038 is display-only. It does NOT pollute `acute7Load` / `chronic28Load` / ACWR — the D-146/D-147 load math is clean.** Swim is *architecturally* exposed (unfiltered, duration-derived — §2.1) so a future bad ingest *could* pollute, but no current swim does.

(Side data-shape note: Strava swims store `moving_time == duration`; Garmin swims store `moving_time < duration` (moving vs total). Cosmetic, not load-relevant.)

## 2.6 Second-order note (not load, but related)
Q-038 also routes the swim through the **wrong analyzer** (generic run/ride path → "5:03/mi", mph chart). If the analyzer that writes the swim's `workout_analysis` / intensity inputs is wrong, that's a *separate* avenue by which a swim's `intensity` (the other workload term) could be off. Out of scope to chase here — flagging for the Q-038 session.

---

---

# STEP 1 — built 2026-06-13 (shared trend primitive + strength & bike adapters)

**Not wired into the screen, not pushed** — awaiting Michael's look + the two flags below before step 2 (run/swim fallback + headline synthesis + screen).

**Module:** `src/lib/state-trend/` — `types.ts` · `classify.ts` (the one shared primitive, pure, `asOf` passed in) · `thresholds.ts` (approved numbers) · `deload.ts` (isolated predicate, contract #3) · `strength.ts` (per-lift verdicts + primary-lift roll-up, contract #2) · `bike.ts` (source-agnostic + `pwr20ToSeries` adapter, contract #4) · `index.ts`. One shared shape, each discipline a thin adapter (contract #1).
**Verify:** type-clean (`tsc -p tsconfig.app.json`, no module errors); esbuild links; ran live read-only via `scripts/state-trend-trace.mjs` (untracked, bundles the real module).

**Live result (user 45d122e7):** everything reads **needs_data** — the account is sparsely logged *in-window* (each lift n≤1 in the 6wk window; bike has only 1 pwr20 point inside 56d). The gate behaving correctly, and a concrete argument for why the **hybrid adherence fallback (next step) matters** — without it this user's STATE would be all-blank today. Logic demo (synthetic series → same primitive) confirms improving/holding/sliding bands fire correctly.

**TWO FLAGGED BEHAVIORS — STEERS CONFIRMED 2026-06-13 (Michael):**
1. **End-of-window single PR can still tip holding→improving.** The 2-point endpoint average damps a final-session spike (230→216 averaged with its neighbor) but the spike keeps 50% weight as the last point → demo case read `improving +7.7%`. **STEER: leave for v1; bump to 3-point/median only if it misfires on real data.** No change now.
2. **Deload-exclude can drop a lift under the min-session gate.** Excluding a deload session takes n 4→3 → `needs_data` (demo). Honest (genuinely <4 non-deload sessions), but a deload week can *mute* a lift rather than show "holding (deload)". **STEER: document, no change — resolves when `WeekPhase` lands and exclude→label (contract #3).**

**DATA OBSERVATION (pre-existing, not step-1 scope):** `canonical_name` splits the same lift across multiple keys — squat appears as `Back Squat` AND `Barbell Back Squat`, deadlift as `trap_bar_deadlift` AND `Conventional Deadlift`, OHP as `overhead_press` AND `Standing Barbell Overhead`. The primary-lift roll-up keys on canonical, so split + non-canonical variants dilute the in-window count and can suppress a verdict. Flagging for a separate canonicalization pass — it will affect roll-up accuracy once data thickens.

---

# STEP 2 — built 2026-06-13 (adherence fallback axis + hybrid discipline resolver)

**Not wired into the screen, not pushed** — checkpoint for Michael's review.

**Decision basis (Michael, 2026-06-13):** adherence & performance are the *same axis at two maturity levels, gated by data*. Ship STATE v2 **hybrid-fallback now** (adherence is correctly the fallback while it's just counts), but build the adherence row as a **first-class component, co-equal-ready** — not a stub. Two structural requirements, both satisfied:
1. **Context field in the data shape** (empty today, reads Layer 1 tags later) → `AdherenceState.context: SessionContextTag[]` (`adherence.ts`), `[]` today.
2. **Display prominence is a one-spot flip** → `DISPLAY_MODE: 'fallback' | 'co-equal'` in `discipline.ts`. Today `'fallback'` (adherence shown only where performance absent); flip to `'co-equal'` = both axes always shown, nothing else changes.

**Module added:** `adherence.ts` (adapter + `SessionContextTag` placeholder for SPEC-session-context-behavioral-trends Layer 1) · `discipline.ts` (`resolveDisciplineCard` hybrid resolver + `DISPLAY_MODE` one-spot prominence + `perfFromTrend` normalizer) · `ADHERENCE_WINDOW_DAYS` in `thresholds.ts`. Strength/bike code untouched (additive).
**Verify:** type-clean; live trace shows all four disciplines correctly falling back to honest adherence ratios (strength 1/2, bike 2/3, run 0/3, swim 0/2 this week — never blank), `context tags: 0` confirming the co-equal hook is wired-but-empty.

**ONE DECISION I DEFAULTED — needs your review:** `ADHERENCE_WINDOW_DAYS = 7` ("this training week"). It's a product call (7d week vs 28d rolling) I defaulted rather than guessed silently. Flag at checkpoint.

**Held / not done:** run+swim **performance** adapters, the two-part headline synthesis (step 3), `StateTab` wiring. Session-context spec builds nothing now. Not pushed.

---

# STEP 3 — built 2026-06-13 (run + swim adapters · headline synthesis · StateTab wiring)

**Built + builds clean, NOT pushed** — first user-visible wiring; checkpoint for review before ship.

**Model added (pure):** `run.ts` (GAP pace at comparable effort, `routeMetricsToSeries`) · `swim.ts` (pace per 100, `swimPaceToSeries` with a Q-038 plausibility guard [40–240 s/100m] + `droppedImplausible` count) · `headline.ts` (`synthesizeHeadline` → two-part "status — movers"). The shared primitive gained a **`lowerIsBetter`** flag (pace: a *decrease* is improving; `pctChange` stays raw). Strength/bike untouched.

**Wiring (isolated, minimal blast radius):** `src/hooks/useStateTrends.ts` (assembles cards + headline from read-only client fetches — strength via `useExerciseLog`, bike pwr20, run `route_progress_metrics` easy, swim `workout_facts`, adherence from this-week planned/actual counts) · `src/components/context/StatePerformanceSection.tsx` (renders headline + per-discipline rows, Row/Chip convention replicated locally) · `StateTab.tsx` +2 lines (import + `<StatePerformanceSection/>` between AERO and SIGNAL).
**Verify:** type-clean; `npm run build` clean; live trace runs all four disciplines + headline.

**TWO DECISIONS — RESOLVED 2026-06-13 (Michael):**
1. **Thresholds APPROVED.** **RUN** 6wk / ±2.0% / min 4 / lowerIsBetter — now trusted (not gated). **SWIM** 8wk / ±1.5% / min 3 / lowerIsBetter — **stays provisional until Q-038 is fixed**; gated from the headline, row shows verdict tagged "provisional".
2. **Headline gating = option (a).** `HEADLINE_GATED_DISCIPLINES = {swim}` (`headline.ts`) — gated disciplines never drive the status OR the movers. **Empty state = neutral** `NEUTRAL_HEADLINE = "No trend yet"` (never a fabricated direction). Remove swim from the gate set when Q-038 lands + swim is trusted — one spot. Verified on live data (swim improving → headline `"No trend yet"`) and synthetic (strength up + swim up → `"Building — strength up"`; bike sliding + run up → `"Mixed — bike sliding, run up"`; all thin → `"No trend yet"`).

**Also for review:** headline placement — currently rendered at the top of the PERFORMANCE section, NOT replacing the existing header `intent_summary` (the D-147 off-plan line stays authoritative + separate). Off-plan is deliberately NOT synthesized in the headline.

**Held / not done:** confidence model · the swim-headline gating policy (awaiting decision #2) · server-side relocation of the assembly (client fetches work now; the pure model can move to arc-context later unchanged). Not pushed.

---

# STEP 4 — staleness gate SHIPPED 2026-06-14 (+ data audit findings)

**Audit (read-only, `scripts/state-trend-audit.mjs`) found:** no discipline showed a fresh verdict. Strength/bike/run = needs_data; **swim showed "improving −2.5%" but on sessions 13–39 days old** (last swim 13d ago). Root cause: `classifyTrend` only checked window *membership*, never recency of the *newest* point — **no staleness gate**. A discipline kept its last-known verdict until points aged out of the window.

**Fix shipped:** `classifyTrend` now decays an otherwise-real verdict to `needs_data` (flagged `stale: true`, with `newestAgeDays`) when the newest qualifying point is older than a per-discipline **`freshnessDays`**. Decay → needs_data → adherence fallback (a stale "improving" is worse than an honest needs_data — Michael). New TrendResult fields `newestAgeDays` + `stale`; no new verdict enum, no UI change (swim row now falls to adherence).
**Freshness thresholds (my proposed values — tunable, one constant each):** strength 14d · bike 21d · run 14d · swim 10d. Verified: swim 13d>10d → decays to needs_data on live data. Type-clean, build clean.
**Follow-up option (not built):** show "last trended Nd ago" in the row instead of silently falling to adherence — `newestAgeDays`/`stale` already carry the data.

**Pipeline findings (diagnoses pending — report-before-fix):**
- **RUN:** 11 runs in window, all 11 reach `route_progress_metrics` (gap 0), but **`workout_intent = null` on all 11** → 0 pass the easy gate → needs_data. (Diagnosing: null at source vs lost before RPM.)
- **BIKE:** 15 rides in window but `pwr20_trend_v1` has only 3 points ever, 1 in-window, anchored to a 15-day-old ride. (Diagnosing: legit type-filter sparsity vs population gap.)
- **STRENGTH:** left as-is (pre-existing: canonical split + per-lift min-4), separate track.

---

## What I did NOT do (per task guardrails)
- No code built or changed; thresholds are a proposal awaiting your sign-off.
- Did not touch run/swim trend rows, did not fix Q-038, did not query the DB, did not push.
- Did not touch D-139 / adapt-plan / suggested_rir / auto-attach-planned.
