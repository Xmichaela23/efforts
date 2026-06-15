# SPEC — Athlete-State Spine (app-wide continuity)

**Status:** Open spec · architectural · the unifying layer under the other specs
**Priority:** the through-line — defines how every other piece connects
**Relates to:** STATE v2 trend primitive · Arc · readiness (Q-049) · session-context spec ·
bike-fitness spec · the np_trend contamination (D-148 + Part A/B/C/D narrative fix)

---

## The problem this solves

The app's fitness reasoning has been built screen-by-screen, and a spine never got
defined. Today there are **two would-be brains that don't talk:**
- **Arc** — the narrative / context brain (drives the LLM summaries, coach prompt).
- **The trend primitive** — the deterministic fitness brain (STATE v2: terrain-binned,
  staleness-gated, claim-grounded).

They can disagree on the same athlete at the same moment: the narrative said "declining,"
STATE would say "sliding," load says "off plan," Arc says "build phase going well." Four
truths, no single source reconciling them. This isn't hypothetical — it's exactly how the
np_trend cross-type contamination survived: one screen got fixed, another kept reading the
poisoned pool, because each screen re-derives fitness independently.

So even with every screen individually correct, the app has no mechanism forcing them to
tell **one coherent story**. That's the continuity gap.

## The spine — single source of athlete truth

One deterministic athlete-state layer that every screen and the narrative read from,
instead of each re-deriving. Properties (already proven in the STATE v2 primitive — this
generalizes it):
- **Deterministic** — verdicts computed from data by code, not inferred by an LLM.
- **Terrain-binned / type-matched** — never the all-type pool (the contamination source).
- **Staleness-gated** — a trend older than its freshness window decays to needs_data.
- **Claim-grounded** — every qualitative claim must trace to a computed verdict/fact.
- **Honest-blank over confounded** — when data can't support a verdict, says so; never
  fabricates a direction.

Output: **one verdict per discipline** (improving / holding / sliding / needs_data),
plus the athlete's current state (readiness, load, adherence, race context) — computed
once, read everywhere.

## What `pctChange` measures + sign conventions (all four surfaces display it)

Every discipline runs the SAME primitive (`classifyTrend`, `_shared/state-trend/classify.ts`).
The displayed `pctChange` is computed identically everywhere:

```
pctChange = (recentAvg − earlyAvg) / earlyAvg × 100   (raw, rounded to 0.1%)
  recentAvg = mean of the 2 MOST-RECENT in-window sessions
  earlyAvg  = mean of the 2 EARLIEST in-window sessions
```

- **Recent window** = the trailing `windowDays` (the training-BLOCK length below, not cadence):
  points with `date ∈ (asOf − windowDays, asOf]`, value > 0, sorted ascending.
- **Comparison baseline** = the **2 earliest sessions inside that same window** — NOT a chronic
  28d / external / all-time baseline. So `pctChange` is a **within-window, endpoint-smoothed
  first-pair-vs-last-pair delta** (2 sessions averaged at each end so no single PR or bad day
  anchors an endpoint — the noise guard).
- **Endpoint overlap at the floor (n=3) — documented, benign.** With exactly 3 in-window
  sessions, `early = avg(p0, p1)` and `recent = avg(p1, p2)` **share the middle session p1** (the
  endpoint window is `k = min(2, n)`, so the two pairs overlap when `n < 4`). The shared point
  damps the measured delta, so at the floor `pctChange` is **conservative** — it can read a touch
  smaller than a naive first-vs-last would. This is intentional/benign, not a bug: being
  conservative exactly where data is thinnest is consistent with the **honest-blank discipline**,
  and these n∈{3,4} cases are already surfaced as `provisional` (see the per-discipline confidence
  flag). Flagged here so it isn't rediscovered later as a mystery.
- `pctChange` is always the **RAW** movement of the underlying metric (it shows the real
  direction the number moved). The **verdict** applies `lowerIsBetter` — it does NOT change the
  displayed sign.

Per-discipline substrate, window, and thresholds:

| Discipline | Metric (substrate) | Window | improve/slide % | lower=better | `+%` means | Verdict at `+%` |
|---|---|---|---|---|---|---|
| strength | e1RM, primary lifts (rolled up) | 42d (6wk) | +2.5 / −2.0 | no | stronger | improving |
| bike power | terrain-binned 20-min power (freshest bin) | 56d (8wk) | +2.0 / −2.0 | no | more watts | improving |
| bike efficiency | mean HR at the reference power band | 56d (8wk) | +3.0 / −3.0 | **yes** | higher HR (worse) | sliding (−% = improving) |
| run | GAP pace at easy effort, sec/km | 42d (6wk) | +2.0 / −2.0 | **yes** | slower pace | sliding (−% = improving) |
| swim | pace per 100, sec | 56d (8wk) | +1.5 / −1.5 | **yes** | slower pace | sliding (−% = improving) |

**Sign conventions (confirmed correct, 2026-06-14):**
- bike power **+% → improving** (higher=better, no flip)
- run pace **+% → sliding** (raw pace rose = slower; `lowerIsBetter` flips the *verdict*, not the sign — `classify.ts:77`)
- bike efficiency **−% → improving** (raw HR fell at the same power)
- swim pace same as run; strength e1RM same as bike power.

On screen this reads `bike +4.9% improving`, `run +8.1% sliding`, `efficiency −8.4% improving`:
the sign is the metric's real movement, the verdict word says whether that movement is good.

`windowDays` and the `%` thresholds are **universal** (a % is scale-free). `freshnessDays` and
`minSessions` are **cadence-scaled per athlete** (Q-052, `thresholds.ts`). A verdict can still be
forced to `needs_data` by the min-session gate or the staleness gate regardless of `pctChange`.

## What reads from the spine

- **STATE** — per-discipline performance + adherence (already does, via the primitive).
- **Session detail / per-ride** — the per-ride read describes the spine's verdict for that
  ride; the LLM narrates, doesn't judge.
- **Load / BODY** — ACWR + off-plan verdict (D-146/D-147) become part of the spine, not a
  parallel computation.
- **Coach prompt** — reads the spine's verdict, not raw trends.
- **LLM narrative** — the critical one: the LLM **describes the spine's verdict in plain
  language and never infers direction from raw numbers.** This is the Part B/C/D narrative
  fix, generalized: the spine is what the narrative consumes.

## The two-brains reconciliation

Arc doesn't disappear — it becomes the **narration layer over the spine**, not a parallel
reasoner. The spine computes truth (deterministic); Arc/LLM phrases it (descriptive). The
claim-grounding validator is the enforcement: Arc can only say what the spine licenses.

So: **spine = what's true; Arc = how it's said.** Today they're two reasoners that can
diverge; the target is one reasoner (spine) and one narrator (Arc) bound to it.

## Prerequisites (already in motion)

- **Shared-primitive relocation** (client `src/lib/state-trend/` → server
  `_shared/state-trend/`) — so server-side narrative and client screens use ONE
  implementation, no drift. This is the foundational move; it's the prereq flagged in the
  narrative-fix plan (Part B).
- **Bike-fitness build** (terrain-binned power + HR-at-power) — feeds the spine's bike
  verdict.
- **Readiness → spine** — readiness already reaches Arc weekly (Q-049); the spine should
  carry it as athlete-state alongside the fitness verdicts.

## Build order (consolidation, not new scope)

Most of this is *connecting* what's being built, not building new:
1. **Shared-primitive relocation** — unlocks server + client sharing one truth. (Prereq
   for the narrative fix's Part B anyway.)
2. **Route the narrative through the spine** — Part B/C/D: LLM describes the deterministic
   verdict, claim-grounding enforces it.
3. **Route load/BODY through the spine** — fold D-146/D-147 ACWR + off-plan verdict in, so
   it's not a parallel computation.
4. **Fold readiness + (later) context tags + per-ride reads in** — as each is built, it
   feeds the one spine, not a new silo.

## Guardrails

- The spine is **display/synthesis** — it computes and exposes truth. It does NOT drive
  prescription (adapt-plan / suggested_rir) without separate sign-off. That's
  autoregulation, a later and deliberate step.
- Don't collapse Arc's *voice* into the spine — Arc still phrases things with context and
  tone; it just can't contradict the spine's verdict.
- Every consumer migration is its own scoped commit + verification that the screen still
  reads correctly off the spine.

## The full loop — spine isn't just for display screens

The screens that surfaced this (Goals, My Record, Training Baselines) revealed the spine
must source the **whole training loop**, not just the read-only views:

1. **Training Baselines** (input/seed) — starting numbers the athlete enters.
2. **Plan builder** (consumes) — builds the plan off current fitness.
3. **Plan execution** — workouts logged.
4. **Spine** — computes current state from execution.
5. **My Record / PRs** (achievements) — should update *from* the spine, not be a separate
   manual list.
6. **Plan adjustment** (closes the loop) — uses the spine's current state to adapt.

Today this loop is **broken in the middle**: baselines seed the plan, but the *computed*
current fitness (e1RM, FTP trend) never flows back to update baselines or adjust the plan.
The proof is live and contradictory across screens:
- **FTP: 176W (My Record "best") vs ~204W (STATE / plan).** Two screens, two FTPs.
- **Strength: typed baselines (bench 160 / squat 110 / DL 150 / OHP 110) vs computed e1RM**
  (the logged 105→110 progression). Two strength truths, unreconciled.
- **Swim: recorded 100yd pace 2:30 vs computed pace-per-100** from sessions.

So Training Baselines + My Record are a **third and fourth source of athlete truth**
running parallel to the computed spine — and they already disagree with it. The spine has
to absorb them, not sit beside them.

## Hybrid update pattern (baselines + PRs)

The spine does NOT silently overwrite the athlete's own records. Pattern:
- Spine **suggests**: "your logged rides suggest FTP ~204; your baseline says 176 — update?"
- Athlete **confirms** before the baseline/PR changes.
Rationale: the record is partly the athlete's own (manually recorded), the computed value
may be wrong (the 176/204 problem), and a change to "my record" deserves consent. This also
surfaces contradictions instead of burying them — same anti-fabrication spirit as the rest
of the app.

## Phasing (the audit gates everything)

1. **Phase 1 — Reconcile the truth (DO FIRST).** Map every fitness number's sources
   (baseline value vs computed value vs displayed value) per discipline. Resolve the
   176/204 FTP contradiction and the strength/swim equivalents. The spine cannot be trusted
   to *drive* anything until its numbers are reconciled — closing the loop to adjustment off
   contradictory data would autoregulate against a lie.
2. **Phase 2 — Spine as single source, display-only.** Screens + narrative read it; hybrid
   suggest-to-baselines. No prescription effect yet.
3. **Phase 3 — Close the loop to plan adjustment.** The goal — but gated behind explicit
   sign-off, because it changes what's prescribed (autoregulation). Only after Phase 1 makes
   the spine trustworthy and Phase 2 proves it reads consistently everywhere.

Audit before trust, trust before adjustment.

## Open questions

- Does the spine live server-side (one compute, all clients read) or is it a shared lib
  both server and client run? (The relocation suggests shared-lib core + server compute for
  the narrative; confirm.)
- Caching: the coach_cache already caches narrative — does the spine verdict cache
  alongside, and how is it invalidated (the version-bump lesson from D-147)?
- How does readiness (subjective) sit alongside fitness verdicts (objective) in one state
  object without implying one drives the other (until autoregulation is a deliberate
  choice)?
- Migration risk: each screen currently re-derives — moving them to the spine one at a time
  means transient states where some read the spine and some don't. Sequence so no screen
  regresses.
- Baseline vs computed precedence: once computed fitness exists, does it supersede the typed
  baseline automatically (with confirm), and how is a stale baseline flagged?
- The 176/204 FTP split — root cause unknown; is it a "best ever" vs "current estimate"
  semantic difference (both correct, badly labeled) or a genuine bug? Audit decides.
