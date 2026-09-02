# STATE SCREEN — NUMBERS AUDIT (2026-09-01)

⛔ **AUDIT, NOT A BUILD.** Every number traced to its source; the point is the DUPLICATE-SOURCE column.
Evidence class on every claim: **[code-traced]** / **[inferred]** / **[computed-and-unrendered]**.
No production reads. Fix nothing until ruled — except a provably-wrong one-line fix, reported first.

---

## THE THREE ON HIS SCREEN NOW

### 1. RUN — "pace per heartbeat down 22%" — [code-traced]
- **What renders it:** the collapsed run line → `efficiencySummary()` → `runFitness.efficiency.pctChange`
  with `verdict === 'sliding'` (`sport-summary.ts`, built tonight). It prints the % whenever the
  verdict is improving/sliding.
- **Where the −22% comes from:** `computeRunEfficiencyState` → `classifyTrend` over the efficiency
  series, slide threshold **−3%** (`run.ts:183`). So −22% is arithmetically real **over the POOLED
  efficiency series (all steady runs)**.
- **Why it's the trust-killer, two mechanisms:**
  1. ⛔ It's the **pooled** efficiency, not the easy-run group. `runFitness.efficiency.groups[]`
     already carries a **per-group** `pctChange` (easy / long / quality) — the summary ignores it and
     leads with the pooled number, which a single hot/hilly run (the exact case the card's own caution
     warns about) swings hard.
  2. ⛔ My summary applies **no sample/confidence gate** — it shows the direction+% on any
     improving/sliding verdict regardless of how few or how confounded the points are. `efficiency`
     has a `sampleCount` the line does not consult.
- **Verdict:** COMPUTED, correct arithmetic over the wrong population, misleading as a headline.
  ⚠️ Likely fix (report-first, not one line): lead the run line off the **easy-run group**, and gate
  the headline direction on sample adequacy. Design call — his ruling.

### 2. BIKE — "power · 5 rides", no number — [code-traced]
- **What renders it:** `efficiencySummary()` bike branch. Its FALLBACK — `"{label} · N rides"` — fires
  when the verdict calls **no direction** (holding / needs_data). Bike power is in that state, so the
  line shows a count and no value.
- **Why no number:** the summary scope has **no power/FTP value to show**. `BikeFitness.power` is a
  `BikeSignal` (verdict / pctChange / sampleCount) — the FTP watts are resolved separately in
  `BikeFitnessRow` via `resolveCurrentFtp`, not on the payload object the summary reads. So when power
  is holding, the collapsed line has nothing to lead with.
- **Verdict:** MISSING by construction — my fallback states a count, never the value. ⚠️ Fix
  (report-first): thread the FTP value into the summary, or lead bike off **efficiency** ("watts per
  heartbeat") which IS on the object, when power has no direction.

### 3. STRENGTH — "Back Squat 125", no change, and it picked squat — [code-traced]
- **What renders it:** `summaryFor('strength')` picks the representative lift as **min
  `newestAgeDays`** — the most-recently-updated lift. He tested squat tonight, so Back Squat is
  newest → it leads.
- **Why no delta:** `strengthSummary` computes "up from" from `series[len-2]` (the previous weekly
  point). A **freshly-tested** lift has one point in its window → no prior → no delta. So the lift
  most likely to lead (newest) is the one **least likely to have a change to show**.
- **Two sub-faults:** (a) "lead with the change" but the selector picks the lift with no change;
  (b) it compares to the prior weekly series point, not to the prior **test** / all-time best
  (`allTimeBestE1rm` is on the payload and unused here) — "up from 180" wanted a test-to-test delta.
- **Verdict:** the number (125) is right; the SELECTION and the DELTA SOURCE are wrong for "lead with
  the change." ⚠️ Fix (report-first): pick the lift with the largest recent change, and source the
  delta from the prior test / all-time best, not the in-window series tail.

⛔ **ALL THREE ARE IN TONIGHT'S COLLAPSED SUMMARY LINES** (`sport-summary.ts` + `summaryFor`), each
surfacing a server number that is thin (bike), single-point (strength), or pooled/ungated (run). None
is a one-line fix; each is a small design call. Reporting before any change.

---

## FULL AUDIT — every number, its source, and its DUPLICATE-SOURCE risk
*(in progress — the duplicate-source column is the deliverable)*

### Already-known duplicate sources (found earlier today, consolidated here)
| quantity | source A | source B | status |
|---|---|---|---|
| deadlift e1RM | Performance path Epley/Brzycki avg → 185 | block path × 0.96 working max → 176 | different QUANTITIES, unlabelled — SPEC-test-day §4 |
| test result | `save-baseline-test` (reads real sets) → squat 125 | `readTestWeek` (amrap-gated) → squat dropped | fracture — SPEC-test-day |
| lift name | `canonicalDisplayName` "Back Squat" | `LIFT_DISPLAY` "Squat" (S2) | two maps |
| weekly lifting window | plan week (fixed) | performed rolling (fixed 2026-09-01) | reconciled |

### ⛔ NEW DUPLICATE-SOURCE FINDINGS (code-traced 2026-09-01)

**D1 — TWO e1RM FORMULA IMPLEMENTATIONS. This is the root of the deadlift 185-vs-176 shape.**
- `src/lib/estimate-1rm.ts` `estimate1RM` — Epley/Brzycki average, rep-capped. D-339 calls it **"the
  app's ONE 1RM formula, the standard."** Used by the Performance path (`save-baseline-test`).
- `supabase/functions/_shared/standing-plan/working-number.ts` `predictedTrue1RM` = its OWN
  `epley1RM` + `brzycki1RM` averaged (`:131-152`). A **second implementation of the same math**, used
  by the block/test path (then ×0.96 for the working number).
- They agree today (both Epley/Brzycki avg) but are two copies that can drift, and D-339's "ONE
  formula" is already false. ⚠️ [code-traced] **FIX (report-first): `working-number.ts` should import
  `estimate1RM`, not re-derive Epley/Brzycki.** Server change (working-number is in the 4-fn closure).
  The ×0.96 working-max stays; only the underlying e1RM formula unifies.
- ✅ **BUILT 2026-09-01 as Take A** (unify, KEEP 0.0333): `predictedTrue1RM` now delegates to
  `estimate1RM`; the inline copy is gone. Constant stays 0.0333 (the book's printed value — see below).
  Deploy = the 4-fn working-number closure (coach · compute-snapshot · generate-strength-plan ·
  rematerialize-standing-block). ⚠️ **PRESCRIPTION IMPACT, NAMED:** the block's working number shifts
  by the coefficient (185×5: working 204→203); the TRAINING MAX is unchanged (215); a boundary sweep
  (round-half-up, realistic reps) found **~16 of 3456 weight/rep/% combos tip one 5-lb step** — only
  values sitting exactly on a rounding boundary, underlying shift ≤ 0.051 lb. Held for the go.
- ⛔ **THE LESSON, for the record (PM, 2026-09-01):** three "the maths is wrong" instincts this day
  were wrong — the O'Conner guess, the ×0.96 "hidden shave", and "0.0333 is a truncation". Each was
  contradicted by a comment sitting next to the code. **Read the comment before correcting a constant.**
  The 0.0333 stays because the book prints it and the athlete verifies against their own copy; there is
  an explicit ⛔ on the constant saying so.

**D2 — FTP: one client resolver, but verify it matches the FTP the server's power bands rest on.**
- Displayed FTP (`ftpNow`) = `resolveCurrentFtp(learned_fitness, performance_numbers)`
  (`StatePerformanceSection:283`), "the same resolver the coach uses" — single client source, and the
  row resolves it once (`:481`). Good within the client.
- ⛔ [code-traced 2026-09-01] CONFIRMED TWO FTP SOURCES. The bike power verdict gates each ride on
  **that ride's own recorded `band_hi`** (`FTP = band_hi / 0.75`, `bike-fitness.ts:67`) — a per-ride
  FTP. The DISPLAYED "N W threshold" is **`resolveCurrentFtp`** (learned_fitness / performance_numbers),
  a different scalar from a different source. They serve different jobs (a trend gate vs the shown
  number) and can legitimately differ. **Report-not-fix** per the ruling: it is a real second source
  but not a wrong number today; unifying (drive the display off the same FTP the gate uses, or vice
  versa) is a server change and a design call. Filed here, not built.

**D3 — the load SPLIT % is aggregated client-side** (`LoadBar` sums `load.daily_load_7d.by_type`),
while the load VERDICT is the server reconciler (D-260 sole authority). The split is presentational
(not a verdict), so this is acceptable — noting it so it is not mistaken for a second verdict source.
[code-traced]

### To trace next (per block)
- LOAD: `training load` points, ACWR — one source? (reconciler D-260 sole authority — verify no client re-derive).
- BODY: soreness / RPE driver — server signals, single source?
- RUN: efficiency (pooled vs groups — see fault 1), decoupling, drift.
- BIKE: power/FTP (resolveCurrentFtp vs server), efficiency, load floor.
- STRENGTH: e1RM per lift, all-time best, sessions, all-out — vs the block's working numbers.
- SWIM: counts (single source; recency field missing — S7).
- HEADER/NEXT/planned-vs-actual: week index, counts.

## HOW MANY CALCULATIONS PER NUMBER — the duplication count [code-traced 2026-09-01, whole-repo sweep]

Michael: *"how many different calculations are being run right now?"* Answer, by quantity:

| number | how many places compute it | verdict |
|---|---|---|
| **Estimated 1-rep max** | **THREE.** (1) `src/lib/estimate-1rm.ts` — the standard, writes stored `estimated_1rm` (compute-facts) + baselines + now the block. (2) `working-number.ts predictedTrue1RM` — its own inline average; **D1 merges this into (1)**. (3) `compute-adaptation-metrics/index.ts:102` — its OWN Epley × an RIR fatigue factor, for adaptation analytics. | ⛔ 3 → after D1, 2. (3) is a different purpose (RIR-adjusted) but still a separate e1RM — consolidate next. |
| **FTP** | **ONE** — `resolveCurrentFtp` (many callers, one resolver). Separately, the bike verdict gates per-ride on `band_hi/0.75` (D2) — a different job, not a duplicate of the number. | ✅ one number; D2 is a display-vs-gate question, not a dup. |
| **ACWR / load** | **ONE** — `_shared/acwr.ts` (reconciler D-260 sole authority, many readers). | ✅ clean. |
| **Working weight (96%)** | **ONE** — `working-number.ts` (× the shared e1RM). | ✅ clean. |
| **Run/bike efficiency** | **ONE SOURCE** — `compute-facts` writes `efficiency_index` per workout — but **several downstream re-derivations** off it in different shapes: `state-trend/run.ts` (pace-at-HR), `fact-packet/queries.ts` + `utils.ts`, `core-effort.ts` (speed-per-bpm), `block-adaptation` (week1-vs-week4 %). | ⚠️ one stored number, 4-ish re-derivations — tighten, but not "many maxes". |
| **Run threshold / easy pace** | **ONE** — `learn-fitness-profile`. ⛔ but overwritten in place, no history (Q-290) — the silent-move problem, a different fault than duplication. | one calc, no audit trail. |

⛔ **THE HEADLINE:** the only number computed multiple genuinely-conflicting ways is the **1-rep max
(3 places)** — which is exactly the "185 vs 176" he saw. Everything else is one calculation with many
readers, or one stored value re-shaped downstream. D1 takes the max from 3 → 2; the third
(adaptation-metrics, RIR-adjusted) is the next consolidation.

## WHAT IS EXCLUDED, PER METRIC — [code-traced 2026-09-01, verified not assumed]

⛔ **THE ONE THAT DROPPED A MAJORITY IS GONE.** The 30-minute run floor (Q-295) is REMOVED
(`run.ts:117` says so, and the filters carry no duration floor) — it had dropped ~2 of every 3 of his
runs. Run efficiency now reads EVERY run, grouped easy / quality / long. ✅ Verified, not recalled.
**No current exclusion drops a majority of an athlete's sessions.**

| metric | excluded before it computes | why |
|---|---|---|
| RUN efficiency | efficiency index outside 0.5–5.0; missing/zero HR. NO duration floor. | sanity bounds only; corrupt/implausible points |
| — grouping | easy / quality / long computed SEPARATELY (not dropped) | a hard run isn't comparable to an easy one |
| — recent read | last 2 points in a 42-day window (series itself runs longer) | the "now" value vs the trend |
| RUN durability (decoupling) | needs a steady effort + a min session count; stale → carry-forward, never a live verdict | one hilly/interval run isn't a durability read |
| STRENGTH e1RM | sets over **10 reps** (was 5 DL / 8 else until 2026-08-29); warm-ups; all but the **week's heaviest** set per ISO week; deload weeks excluded from the DIRECTION | >10 reps the formula is unreliable AND it prescribes next week; speed days drop by arithmetic, not a gate |
| — card gate | a lift needs ≥ 2 logged weeks to draw a trend | one point is not a line |
| BIKE efficiency | rides whose 20-min power says it wasn't aerobic (band gate); HR-corrupt rides | efficiency is a same-power-HR read; a hard ride isn't one |
| BIKE power | rides with no 20-min figure / no power bin | can't read power off a ride with no power |
| LOAD / ACWR | chronic base too short → shown "provisional", not dropped | a ratio on < ~4 weeks isn't trustworthy |
| SWIM | window count only — nothing computed, nothing excluded | described, not graded |
| ALL trends | `needs_data` (too few), `stale` (enough but too old), `provisional` (thin base) | the confidence gate — no verdict the sample can't support |

⚠️ STRENGTH still scrapes every logged set for a max (subject to the 10-rep ceiling); the destination
(Viada) is that the max comes from the PRETEST only, no scraping, no ceiling — open (Q-H).

## COSMETIC (do NOT let these displace the numbers)
- Two stacked headings above the sports: "trends · the arc behind this week" (StateTab) + "FITNESS /
  trends over recent weeks" (StatePerformanceSection). One should go.
- Orphan "STANDARD FOCUS" label alone at the bottom of the scroll.
