# LIFECYCLE — the loop

**Written 2026-07-13, from code.** This doc did not exist. `SCREEN-CONNECTIVITY.md` maps each screen as a node. `TRUTH-MAP.md` maps each fact to its owner. **Neither one draws the circle** — and the circle is the app.

Read this before wiring anything, because **every fracture found on 2026-07-13 lived on one line in this doc: the boundary between FROZEN and LIVE.**

---

## The circle

```
   ┌──────────────┐
   │  BASELINES   │  typed numbers + learned numbers
   └──────┬───────┘  learned wins at medium/high confidence; athlete can override and their override wins
          │
          ▼
   ┌──────────────┐
   │  PLAN BUILD  │  targets computed ONCE and FROZEN onto every planned session
   └──────┬───────┘  a March plan keeps March numbers
          │
          ▼
   ┌──────────────┐
   │   YOU TRAIN  │  workout lands → fans out to ~8 jobs → becomes a row of hard facts
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ PERFORMANCE  │  graded against the FROZEN target, not a live one
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │    STATE     │  facts → weekly spine → every screen renders what the spine decided
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │   LEARNING   │  the app learns a new pace / FTP / 1RM from what you actually did
   └──────┬───────┘
          │
          └────────────────► back into BASELINES → the NEXT plan uses it
```

**The arc closes.** If the app learns you got fitter, the next plan you build uses that number — provided `learn-fitness-profile` stamped it medium or high confidence. At low confidence, or if you explicitly chose "use my number", your typed value wins. That is by design (D-285, Q-174).

---

## THE ONE LINE THAT MATTERS: frozen vs live

The app asks two different questions, and they need **different numbers**:

| question | which number | why |
|---|---|---|
| **"Did you do what the plan asked?"** | the **FROZEN** pin | the plan promised you a target in March; you get graded on March |
| **"How are you doing right now?"** | the **LIVE** resolved number | trends, zones, fitness direction — these must reflect today |

**Live numbers are not the bug.** The bug is answering an *adherence* question with a *live* number, on the same card that answered the previous question with the pin — with no label. That is where every 2026-07-13 fracture lived.

### Verified live/pin splits (as of 2026-07-13, NOT fixed)

- **`analyze-running-workout`** — the interval grid grades against the **pinned** `computed.steps[].pace_sec_per_mi` (`:665`), but the *"your easy portion vs your baseline"* bullet re-resolves a **live** pace (`:345` → `:2580`). A plan pinned in March and a run analyzed in July are judged against two different definitions of "easy" **on the same card**.
- **`analyze-cycling-workout`** — power adherence uses the **pinned** `power_range` (`:736`); the efficiency and zone bands use a **live** `resolveCurrentFtp` (`:1561`). Same split.
- **`adapt-plan`** — reads learned numbers **raw** (`:944-949`, `:974-975`), bypassing both resolvers and the confidence gate. The one function allowed to *mutate your plan* is the one not obeying the precedence rules.

---

## Where the freeze actually holds (and where it doesn't)

The pin is `plans.config.athlete_snapshot`, written by `buildAthleteSnapshot` (`_shared/athlete-snapshot.ts:158`) at generation, and read back by **exactly one consumer**: `materialize-plan:2745` (`readAthleteSnapshotOrLive`).

**Three holes:**

1. **Only 3 of 8 categories are actually pinned.** `performance_numbers` (5 lifts), `bike.ftp_w`, `run.{threshold, easy}`. The other five — **swim, equipment, intent, capacity, bio** — are hardcoded `null` (`athlete-snapshot.ts:178-182`) and **re-resolve live on every materialize**. So a mid-plan baseline edit silently moves your swim targets and equipment substitutions.
2. **Strength plans have no pin at all.** `generate-strength-plan` never calls `buildAthleteSnapshot`. Get Stronger and Hyrox plans re-resolve their 1RMs live, every time.
3. **Legacy plans have no pin.** Anything built before the snapshot existed gets **re-priced against whatever the app believes that day**, every time something re-materializes it (`sweep-week`, `auto-attach-planned`, `adapt-plan`, `StrengthAdjustmentModal`).

---

## Who can change a plan after it's built

**The athlete believes the plan is locked. It is not.**

| what changes | trigger | athlete asked? |
|---|---|---|
| **strength working weights** | `adapt-plan` action=`auto` — fire-and-forget on **every workout ingest** + a cron. e1RM trends up → writes `plan_adjustments` → `materialize-plan` rewrites every future row. | **NO. Silent.** |
| strength week layout | `adapt-plan:750`, on plan-JSON fingerprint change | NO on auto |
| a lift's weight | `StrengthAdjustmentModal.tsx:82` → mounted at `StateTab.tsx:1370` | **YES** ✅ |
| which day a session sits on | drag-reschedule (`validate-reschedule` → confirm) | **PARTLY** — the popup shows severity, but confirm also **deletes same-type conflicting planned rows** without saying so |
| future sessions exist at all | `pause-plan`, `end-plan` — both **delete all future planned rows** | YES, except `GoalsScreen.tsx:911/971` which auto-ends |

**Two safety notes on the auto path:**
- The adjustment is stamped `applies_from: today` and `materialize-plan` honours it (`applyAdjustment:61`), so **past sessions are NOT rewritten**. Good.
- But the auto path **skips the Arc fatigue/taper/adherence gate** (`buildAdaptSuggestionGates:484` is only called in the `suggest` branch). **A load bump the app considers too risky to *suggest* still gets *written*.**

**And the consent path is half-unreachable.** `adapt-plan` `suggest`→`accept` includes *"you got fitter — update your easy pace / FTP?"* It is well-built, confidence-gated and fatigue-gated. Its **only** Accept button lives in `CoachWeekTab.tsx:914`, which is **unmounted**. `useCoachWeekContext.ts:570` fetches those suggestions on every State mount and **drops them on the floor**.

> **The path that asks you is dead. The path that doesn't ask you runs on every upload.**

---

## The fan-out — what happens when one workout lands

`ingest-activity/index.ts:1345-1712` (**not** 1430-1580 — that range is doc drift and truncates it).

```
workout in
  ├─ auto-attach-planned          AWAITED  (deliberate — deterministic ordering)
  ├─ compute-workout-summary      fire-and-forget  ─┐
  ├─ compute-workout-analysis     fire-and-forget  ─┤ ⚠️ RACE
  ├─ calculate-workload           AWAITED           │    compute-facts reads what
  ├─ compute-adaptation-metrics   AWAITED           │    these two write, and does
  ├─ compute-facts                AWAITED  ◄────────┘    not wait for them
  │    ├─ match-cores             (starved — see below)
  │    └─ compute-snapshot        → state_trends_v1 (THE SPINE)
  │         └─ compute-core-verdict
  ├─ invalidate coach_cache + block_adaptation_cache
  ├─ analyze-{run,ride,swim,strength}-workout   fire-and-forget → workout_analysis
  ├─ adapt-plan action=auto       fire-and-forget  ⚠️ NOT a no-op — see above
  └─ post-import-athlete-pipeline AWAITED, but GARMIN-ONLY + milestone-gated
```

**Then each screen reads:**
- **Performance / Details** → `session_detail_v1`, built by `workout-detail` from a snapshot slice + `workout_analysis`. 🟢 The healthiest contract in the app: one builder, one fetch, many dumb renderers.
- **State** → `coach` → `weekly_state_v1` (+ the spine trends).
- **Calendar** → `get-week`. The **only** calendar path. Never query the two tables directly for calendar data.

### Three holes in the fan-out

1. **The race.** `compute-facts` is *awaited* but reads `workouts.computed`, written by two *fire-and-forget* calls. When it loses, `time_in_zone`, `intervals_hit/total`, `hr_drift_pct` and `execution_score` are **silently absent** from that workout. No error anywhere.
2. **Two ingest paths never reach the spine.** `ingest-phone-workout` and `save-imported-workout` fire **only** `compute-workout-summary`. Those workouts get **no `workout_facts` row** and are invisible to the snapshot, the Arc and the coach. (`ManualSwimEntry.tsx:70` works around this by calling `recompute-workout`. The other two don't.)
3. **The load substrate is starved.** `workouts.workload_actual` — what ACWR is computed from — is written by **one** job (`calculate-workload`), called from **two** places. Anything arriving another way contributes **zero to ACWR** while still counting toward `workload_total` (which reads a different column). **The same weekly snapshot row can contradict itself.**

---

## The continuity invariant

> For any one fact — fitness direction, load, FTP, LTHR, e1RM, RPE, decoupling — there is **ONE** place that computes it, and every screen reads that one place.
>
> **The server computes. The client renders. Two screens showing a different number for the same fact is a fracture.**

Which facts currently honour this, and which don't, is the FACTS table in `CAPABILITY-MAP.md`. As of 2026-07-13: **fitness direction, the ACWR ratio and the 1RM anchor are clean.** HR zones, LTHR, threshold pace, the ACWR band and FTP are not.

---

## The three diseases

Every problem in this app is one of these. Name which one you're looking at before you write a line of code.

**STARVED** — built, spec'd, tested, and never fires because an input upstream is null. *It looks missing. It is not missing. It is hungry.* Trace the input to its write site. A null input is a **plumbing** job, not a build job.
*Current: the segment engine (stage 1 has no caller), `pace_at_easy_hr`, `workload_actual`, swim CSS.*

**DEAD** — computed, shipped, and read by nobody. Nine coach outputs. A scoring module that runs on every snapshot and every render and is discarded by both. An LLM call you pay for and use a third of.
*Ask: mount it, or delete it? Right now it is neither, which is the worst of both.*

**DOUBLED** — two engines, one fact. **The dangerous one, because it doesn't fail — it disagrees, quietly, and both answers look confident.** Three Zone 2 ceilings. Four LTHR chains. Six load-band tables.

> **Every fracture in this app began life as a copy that was correct on the day it was made.**
