# ISLANDS — Orientation Map

**The one page that says where everything stands.** Read this before building. Top half is plain English. Bottom half is the wiring detail a new Claude needs — Michael can skip it.

---

## The story so far (read this part)

We're building one thing right now: a training plan for someone who just wants to **get fitter** — no race, no finish line. We call it the non-race plan.

It works. It builds. It's smart about heart rate and pace. But it's **half-finished in a specific way**, and that's the whole picture you need to hold:

- The plan is **real on top, cardboard underneath.** It prescribes real zones (heart rate, pace) — that part is wired and live. But the part that decides *how much* you train each week is still a placeholder. A stand-in number, not a real model.
- **Nobody can reach it in the app yet.** The engine makes the plan, but there's no door from the goals screen to walk through and get one.

So: the engine is good. The way in, and the part that sizes your week — those are the unfinished rooms.

### The two "islands"

Think of an island as **one shared brain** that every engine asks, instead of each engine guessing on its own. We built two this session. Both are **seeds** — small on purpose. Both are wired into **only one engine so far: the run engine.**

**The strength brain.** Its job today is narrow: it answers one question — *"is this a rest-and-recover week?"* That one answer fixed a real bug: the recovery week used to keep piling on hard work because nothing recognized it as a recovery week. Now it does. That's all this brain does so far. It does **not** yet decide how often you lift or how heavy. Those rooms are locked.

**The endurance brain.** Its job is zones and volume — heart rate, pace, and how much. The **zones half is live** (that's the "real on top"). The **volume half is built but not plugged in** (that's the "cardboard underneath"). Plugging in the volume half is the next real move.

### The next real move

The thing that should size your week is **your time** — how many hours you've got. That's how a real coach thinks: not "here's a magic mileage number," but "you've got six hours, let's spend them well." The engine doesn't listen to your hours yet. Teaching it to is the job that turns cardboard into a real floor.

One sharp edge to know about: sizing by hours means converting distance into time, and that needs your pace. If we don't know your pace yet, the engine needs a sane fallback so it doesn't choke. That's a decision to make when we build it, not a surprise to discover later.

### What's parked (locked rooms, on purpose)

Bike plans. The strength frequency unlock (how often you lift — the Hyrox-relevant one). Merging the big combined engine onto these brains. All scoped, all understood, all **deliberately not being touched** until the non-race run loop is closed and dogfoodable.

### The one correction owed

The project's own written record still describes an **old path we abandoned for good reasons** — it says non-race plans run through the big combined engine. They don't. They run on the run engine, by deliberate choice, because the combined engine can't make a single-sport week. The record needs one line crossing out the old story, or the next person (or the next Claude) reads it and tries to walk backward.

---

## Wiring map (for a new Claude — Michael can skip)

> Audience note: this section is the precise handoff. Verified against code this session via shell. Where a fact is carried from session notes rather than re-grepped, it's marked *(session-asserted)*.

### Island 1 — `supabase/functions/_shared/periodization/`

**Role:** phase classifier + one terminal decision. Phase 1 of the strength-periodization authority only. NOT the full authority — owns no frequency, no load curves, no taper logic yet.

**Exports:**
- `PhaseKind` — enum: `base | speed | build | race_prep | taper | retest | recovery`
- `canonicalizePhaseName(name) → PhaseKind` — maps any engine's phase string (capitalized run names + lowercase combined enum) into one kind
- `isRestedTerminal(kind) → boolean` — true for `taper | retest`
- `protocolPhaseName(kind, name)` — bridge that hands a rested terminal the name the strength protocols expect (`'Taper'`-shaped)

**The win it powers:** the run retest week is a real rested week, not a cosmetic rename. Consumers used to string-match `=== 'Taper'` and miss `'Retest'`, so retest weeks kept speedwork + full strength load. Now they ask the brain.

**Consumers (wired):**
- `generate-run-plan/generators/sustainable.ts` — the speedwork gate and the volume-taper anchor
- `generate-run-plan/strength-overlay.ts` — the two strength step-down triggers + the protocol-name bridge

**Not wired:** combined (`generate-combined-plan`), tri (`generate-triathlon-plan`). They still string-match phase names locally.

### Island 2 — `supabase/functions/_shared/endurance/`

**Role:** the sourced source-of-truth for zones, volume, intensity. Every piece is a parity-proven lift of logic that already lived elsewhere — nothing newly invented.

**Exports (4 files):**
- `hr-zones.ts` — `frielZones(lthr)` (Friel %LTHR) + `karvonenZones(maxHR, restingHR)` + `hrZones(...)` selector. Lifted from the baselines screen.
- `pace-zones.ts` — `paceZonesFromVdot(vdot)` (Daniels VDOT zone paces). Lifted from `effort-score.ts`.
- `volume.ts` — `longRunMilesForWeek(...)` + `longRunFloorMiles(...)` + `longRunPeakTarget(distance)` (within-phase ramp + per-distance peaks). Lifted from the combined engine.
- `distribution.ts` — `PHASE_ZONE_DIST` + `phaseDistribution(phase, dial)` — the polarized 80/20 + the forgiving↔sharp dial. **Dial currently neutral.**

**Wins:**
- **LIVE:** run non-race plans prescribe real HR + pace zones, resolved from baselines the way the baselines screen does (manual → learned → age-estimated → RPE fallback). The `hr-zones` + `pace-zones` halves are plugged in.
- **WIRED (E3b, 2026-06-28):** the hours budget sizes the non-race run week — `volume.ts` (long-run ramp) + a budget→miles conversion via pace, within RUN-PROTOCOL bounds (easy 3–5mi on ≤3 slots), glass-box on excess (`plan.volume_notes`), strength reserved off the top. Committed + pushed (`4a9a63e8`/`f7377311`), proven live via preview probe, **NOT yet deployed** (engine-first — deploy when the intake faders supply the budget). The placeholder `WEEKLY_MILEAGE`/`LONG_RUN_PROGRESSION` tables are now the **no-budget fallback only**. See D-219.

**Consumers (wired):** `generate-run-plan/generators/sustainable.ts` only (zones).

**Not wired:** combined, tri, future bike.

### Two facts a new Claude must NOT get wrong

1. **The islands are NOT composed in code.** `endurance` defines its own `PhaseKey`; it does **not** import `periodization`. The intended `endurance → periodization` one-way dependency is a comment/future, not wired. Two separate phase enums currently coexist.
2. **Both islands are consumed ONLY by `generate-run-plan`.** Combined and tri use neither. Migrating them is the deferred endgame.

### Deploy + commit stamps (where the live code is)

- **Live edge functions:** `generate-run-plan` v143 · `create-goal-and-materialize-plan` v223 · `generate-combined-plan` v268 (the F-9 provisional was reverted off prod; combined is clean).
- **Commit trail (main):** run non-race materializes `b10bcf9d` · board audit `77f2f3c0` · strength island Phase 1 / D-217 `b743edb6` · endurance spine E1+E2 `819d2ebf` · E3a zones `94f1c58f` · non-race intake UI `f95a049e`.
- **Stash:** `git stash` holds the F-9 provisional combined single-sport cut — **step-1 for bike, not lost.**

### The next cut — non-race volume from the hours budget

**Verified this session:** the run engine has **no hours-budget input at all.** `generate-run-plan` only *outputs* `estimated_hours_per_week` (computed from the plan, ~`:711`); it never takes a budget in. The non-race run branch doesn't pass `weekly_hours`. The intake faders (`allocateTime`) feed nothing. The time budget IS wired — but only into the combined/tri engine (`create-goal:~1680`), never the run path.

**So the real volume cut is not "swap two tables" — it's "teach the run engine about the hours budget."** Three connected pieces:
1. Thread `weekly_hours` into `generate-run-plan`.
2. Make it the weekly-load cap, reconciled against distance-precise long-runs via pace (glass-box on conflict; never silently exceed the stated budget).
3. The ramp tier (Gentle / Steady / Progressive) as the build-slope dial.
4. *(later)* Wire the intake faders to actually supply the budget.

**The one real edge:** reconciliation is `distance ÷ pace = time`, so it depends on the pace anchor. Pace has **no age-estimate tier** (you can't estimate pace from age). An athlete with no pace data has no VDOT → no distance↔time conversion. The budget model needs a defined fallback for that case (default pace band, or degrade to a time-only week). Decide it in the spec, don't discover it in prod.

**The stale spec warning:** the E3b spec on disk (`SPEC-e3b-bottom-up-volume.md`) is written on the OLD model — "the long-run ramp drives the week, total emerges bottom-up." That was overturned this session. Do **not** cut it as written. The ramp logic survives, but as the long-run *shape inside the budget*, not the thing that sizes the week. Rewrite the spec to budget-anchored before treating it as a cut sheet.

### The record correction owed

The decision log says non-race routes through the combined "one engine." The shipped reality is the **run-engine fork** (deliberate: combined can't produce a single-sport week). The log still tells the old story. A superseding decision is owed — "run non-race runs on `generate-run-plan` by deliberate exception, here's why" — owed in `DECISIONS-LOG.md` against **D-213 / D-214**, and already flagged as open thread **T-3** in `STATE-OF-BOARD.md`. Or the next reader tries to route back through combined.

### Engine-first vs. UI-first (decided)

**Engine-first.** The budget *logic* (cap, reconciliation, glass-box-on-conflict) is where the risk lives, and it's testable via preview-sweep with an injected budget — no UI needed to prove it. The faders are thin plumbing that supplies a value; connect them once the consumer is proven. Matches the "smart server, dumb client" stance. Requirement: give the engine a **sane no-budget default** so other callers don't break.

---

*This file is the orientation handoff. If it drifts from code, code wins — re-verify and update this.*

---

## Addendum — where this session landed

This started with a worry: too many things built at once, lost in the sauce. It ends with the opposite — a map on the wall, code-verified, every room labeled. The worry was the problem to beat. This page is how it got beaten.

The state of play, clean:

- The **run plan** is real and breathing — builds, knows heart rate and pace.
- The **strength brain** does its one honest job (knows a rest week is a rest week) and does it right.
- The **endurance brain** has zones live and volume waiting in the wings — parity-proven, ready to plug in.

Nothing's broken. Nothing's bleeding. Everything half-built is half-built **on purpose**, and now it's written down where the next person finds it.

The locked rooms — bike, the strength frequency unlock, the big merge — aren't cliffhangers. They're sequels. The doors are visible, the contents known, and opening one is a choice, not a debt.

**The first move when work resumes** is already written into the map above: teach the run engine to listen to the hours budget. The pace fallback is flagged. The stale volume spec is flagged. The no-budget default is the guardrail. Whoever picks this up — future-Michael or a new Claude — lands oriented in about thirty seconds.

That's the bow. The rest keeps.
