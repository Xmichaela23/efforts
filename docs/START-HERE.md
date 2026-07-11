# START HERE — the one-page map for a new chat

**Read this first, before the deep docs.** Efforts has a lot of pieces and 150+ docs. This page is the whole picture in one screen, plus where to go for detail. If you read nothing else, read this.

---

## The one job right now: TOTAL CONTINUITY

Every workout that comes in gets piece-mealed out to the screens, and **every screen reads the same source data** — so nothing is fractured and no number is wrong. One workout in → every screen tells the **same** truth about it. That's the whole near-term mission. It's a plumbing/coherence job, not new features — all the major pieces already exist (see below).

**The one subtlety:** continuity does NOT mean "force live numbers everywhere." It means each screen reads the **same source** for a given workout. Where a plan **pins** a number on purpose, every screen shows **that pinned number** — consistently. (Chasing a live value into a pinned target is the one wrong turn to avoid.)

*Scope note: not building plan-adaptation right now, and not hardening (auth/ops) — not onboarding yet. Just continuity.*

---

## What the app IS (the pieces — all built)

- **Plan makers** — a **goal** plan maker + a **race** plan maker.
- **Calendar** — the plan is laid out onto the calendar as planned workouts.
- **Workouts built from baselines** — a plan's targets (watts, paces, weights) come from the user's baseline numbers, **pinned at build time** so targets stay stable across the plan's life.
- **Performance screen** — how you did on a workout.
- **Details screen** — all the details of the workout.
- **State screen** — RPE + heart rate → how you're handling the workload. Must be **plan-aware**, **session-aware** (the effect of the workout itself), and **goal-aware** (the overall goal of the plan).

## The pipeline (the mental model for continuity)

One workout comes in → the ingest orchestrator fans it out (`ingest-activity/index.ts:~1430`):

```
workout in
  ├─ compute-facts        → workout_facts, exercise_log, session_load   (pure math, no AI)
  ├─ analyze-{sport}      → workouts.workout_analysis                    (grades/adherence)
  ├─ compute-snapshot     → athlete_snapshot.state_trends_v1  ("THE SPINE": per-discipline verdicts)
  └─ invalidate coach_cache

then each screen READS:
  ├─ Performance / Details → session_detail_v1  (built by workout-detail from snapshot slice + analysis)
  └─ State                 → coach weekly_state_v1 (+ the spine trends)
```

**The continuity invariant:** for any one fact (fitness direction, load, FTP, e1RM, RPE, decoupling), there is **one** place that computes it, and every screen reads that one place. Two screens showing a different number for the same fact = a fracture. The server computes; the client renders (smart server / dumb client).

## Where it's clean vs what remains (as of 2026-07-10)

- **RUN = the model.** One source, every surface reads it. Make everything else look like run.
- **Closed recently:** strength self-contradiction (#1), FTP three-answers (#2, on the fact screens), the live-vs-cached freshness fork (#4).
- **Still open:** bike efficiency shows **two engines** on State (the one still-*visible* fracture) · planned bike watts vs the plan **pin** (a smart-server/dumb-client question, not a resolver swap) · minor latent label leftovers · a few client-side re-derivations (`LoadBar`, a divergence mirror).

## The working rules (compressed)

- **One source per fact; screens render, never re-decide.** (Constitution Law 1 + 4.)
- **The plan pin is truth for a plan's targets** — display the pinned number, don't recompute from live.
- **Deploy is gated** — edits are free; **push / commit / deploy wait for Michael.** Michael deploys nothing himself.
- **Verify by fixture + a live receipt**, not a device session alone; ≥3 recomputes for anything stochastic (LLM).
- **Don't rebuild what exists** — the read is usually already there; extend it. (A past session built a whole engine for a read that already existed, then deleted it.)

## Go deeper (only when you need the detail)

- **`TARGET-ARCHITECTURE.md`** — the north star (deterministic · smart-server/dumb-client · single source of truth).
- **`TRUTH-MAP.md`** — per-fact authority + the exact fractures (read before touching any fact).
- **`CONSTITUTION.md`** — the six laws, each with a violation-tell.
- **`ENGINE-STATE.md` / `DECISIONS-LOG.md` / `OPEN-QUESTIONS.md`** — current state / why things are / don't-"fix"-these.
- **`CLAUDE.md`** — topology, load-bearing file locations, conventions.
