# OPTIONS — Athlete State Continuity (read-only prep for the check-in → Arc spec)

**Status:** Investigation only · no code, no schema, no decisions · for review on return
**For:** `SPEC-ATHLETE-STATE-CONTINUITY.md` / Q-049
**Prepared:** 2026-06-12 (read-only, per the "investigate, don't build" handoff)

> These are **options with tradeoffs, not recommendations.** The data-model questions are
> yours to answer first. Where the existing codebase already leans one way, that's noted as
> *context*, not a decision.

---

## ⚠ Correction to the first audit

The original audit said *"no time-series exists"* and *"orphaned for the engine."* Both are
**wrong** — a closer read found more wiring. The corrected map below supersedes it.

## Corrected as-is flow map (where readiness actually goes today)

```
Quick check-in (StrengthLogger ReadinessCheckBanner, optional)
  │  {energy, soreness, sleep}
  ▼
workout_metadata.readiness        (JSONB on the workouts row; per-workout, not standalone)
  │
  ├─► compute-facts:1555           → workout_facts.readiness        (echo, per-workout/date)
  │       │
  │       └─► compute-snapshot:115–118, 197–201, 551
  │               → athlete_snapshot.avg_readiness {energy,soreness,sleep}
  │                 (WEEKLY AVG, keyed user_id + week_start)   ◄── a weekly time-series DOES exist
  │               │
  │               ├─► recompute-athlete-memory:409–413
  │               │      week-over-week avg_readiness.energy → `taperSensitivity`
  │               │      (narrow: energy rebound after a ≥20% load drop)
  │               │
  │               └─► recompute-athlete-memory:456
  │                      per-workout readiness → extractInjuryFlagsFromBlob (injury flags)
  │
  ├─► analyze-strength-workout:1832–2104
  │      per-workout readiness → strength summary NARRATIVE text
  │      ("capacity for progression" vs "maintain current loads")
  │
  └─► useAthleteSnapshot.ts:30      client TYPES avg_readiness (client CAN read the weekly aggregate)
```

**Where it actually dead-ends (the real gaps):**
- **`arc-context.ts` does NOT read `avg_readiness`** → the **Arc temporal context never carries
  readiness.** This is the true "check-in → Arc" gap (not "no data anywhere").
- **No engine prescription effect** — readiness does not move suggested RIR (plan `target_rir`,
  D-126), prescribed load, or `adapt-plan`. (`taperSensitivity` is a memory metric, not a
  load/RIR lever.)
- **Granularity:** the existing series is **weekly avg** (athlete_snapshot). True **per-day**
  exists only inside `workout_facts.readiness`, and only on days a workout was logged with a
  filled check-in — there is no standalone daily check-in.

So: the signal already reaches `athlete_snapshot` and has two narrow consumers; it just never
reaches Arc's exposed context and never touches prescription.

---

## Options per open question (tradeoffs, no pick)

### Q1 — Where does the readiness time-series live?

| Option | What it is | Tradeoffs |
|---|---|---|
| **A. Use the existing weekly `avg_readiness`** | Wire `arc-context.ts` to read `athlete_snapshot.avg_readiness` (already computed). | Cheapest — no schema, no new write. But **weekly granularity only**: can't do day-by-day ("soreness climbing all week" is week-over-week, not daily). Misses days with no logged workout. |
| **B. Per-workout from `workout_facts.readiness`** | Query the per-workout JSONB by date for a finer series. | Per-date where workouts exist; no new table. But it's **per-workout, not per-day** — a rest day or an unlogged session = gap; check-in is bound to the workout save, not a daily ritual. |
| **C. New `readiness_checkins` table** | Dedicated `(user_id, date, energy, soreness, sleep, source)` written at check-in time, independent of the workout. | True **daily** series; decouples check-in from a workout (enables a morning check-in with no session). Cost: new schema + migration + a new write path + backfill question; the check-in UI would need a non-workout entry point to fully exploit it. |

*Context, not a decision:* a weekly aggregate (raw energy/soreness/sleep averaged) already lands
in `athlete_snapshot.avg_readiness`, so Option A is "finish the wire that's 80% there"; B and C
are about adding day-level resolution the snapshot can't give.

### Q2 — Does Arc store readiness as raw sliders or a derived "readiness score"?

| Option | What it is | Tradeoffs |
|---|---|---|
| **A. Raw** | Arc carries `{energy, soreness, sleep}` (mirrors `avg_readiness`). | Lossless; each consumer derives meaning. But every consumer re-derives, and there's no single "how ready" number. |
| **B. Derived score** | Arc carries one normalized score (an `overall_readiness` already exists in `analyze-strength-workout:calculateOverallReadiness`, 0–1 / Excellent…Poor). | One number, easy to act on. But lossy, and the derivation is opinionated — you'd be blessing one formula as canonical (and there are already two candidate shapes: the strength analyzer's labels vs a raw 0–1). |
| **C. Both** | Raw three + a derived score. | Richest for consumers; trivially larger payload. Most future-proof, least committal. |

*Context:* the existing weekly aggregate is **raw** (avg of each slider). The only existing
*derived* formula is `calculateOverallReadiness` in the strength analyzer — not currently
written to the snapshot or Arc.

### Q3 — How does an *unfilled* check-in read downstream?

| Option | What it is | Tradeoffs |
|---|---|---|
| **A. "No data" (null)** | Absence = unknown; consumers must handle null and say nothing. | Honest; matches the codebase's anti-fabrication pattern (D-035 null-not-synthesized, D-122 anchor blank-not-faked, the D-112/D-100 index-0 footgun). But every consumer needs a null branch, and Arc can't assert readiness. |
| **B. Neutral default** | Treat unfilled as baseline/typical. | Consumers always have a value. But it **asserts "fine" when it's just unfilled** — the exact trust problem the spec warns about; conflicts with the project's "don't fabricate signal" norm. |
| **C. "No data" + coverage signal** | Null, plus a "checked in N of M sessions this week" coverage field. | Honest *and* informative (Arc can say "limited check-in data"). More plumbing; needs the series to count sessions. |

*Context:* the established pattern across the engine is **A-style honesty** (never synthesize a
missing signal). B would be a departure worth being explicit about.

---

## Interdependencies (worth deciding together)

- **Q1 gates the rest.** If you stay weekly (A), Arc can't do daily trends regardless of Q2/Q3.
  Per-day (B/C) is what unlocks "soreness climbing all week."
- **Q2 ↔ existing consumers.** `taperSensitivity` reads `avg_readiness.energy` raw — if you add
  a derived score, decide whether it replaces or sits beside the raw values these already use.
- **Q3 ↔ trust.** Whatever Q3 picks, it should be consistent with how the rest of the engine
  treats missing signals (currently: never fabricate).

## Out of scope here (your sign-off / separate spec)

- **Phase 2 autoregulation** (readiness → suggested RIR / load). Untouched — it affects
  prescription and reverses no-influence behavior, so it's yours to greenlight and needs its
  own adjustment-model spec (how much, when, guardrails: "never move load on one bad night,
  require a trend").
- **No schema, no engine commits made.** This doc is the only output.
