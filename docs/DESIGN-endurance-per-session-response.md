# DESIGN — the per-session endurance read (two honest lines)

> **⏸ PARKED (2026-07-09) — NOT BUILT, no code exists.** A prototype engine was written and then
> **deleted**: the app already does this read (spine `run.decoupling` + the carryover RPE-vs-typical
> gauge in `cross-domain-carryover.ts`), so a from-scratch engine duplicated existing logic and was
> aimed at a screen never pinned down. Kept only as a record of the design + the precedent research
> (`RESEARCH-session-interpretation-precedents-2026-07-09.md`). **If this is ever revived: EXTEND the
> existing spine + carryover reads, do NOT rebuild — and pick the target screen (workout Performance
> tab) FIRST.** See `TRUTH-MAP.md` §5 "where does X belong."

**Status:** PARKED — designed, not built. **This is the concrete design for Load-System Item 3's Key-2 ("the RESPONSE")** — the per-session endurance quality read — informed by the precedent survey (`docs/RESEARCH-session-interpretation-precedents-2026-07-09.md`) and consistent with `docs/CANON-arc-inference-model.md` and the Constitution (Law 1 one-source, Law 4 render-don't-decide).

**The problem it fixes (verified 2026-07-09):** today the State/Performance endurance interpretation is split-brain — steady runs read on decoupling (intrinsic), targeted sessions read on plan-adherence execution % (which excludes unplanned), RPE is only a weekly aggregate (never per-session), bike within-session durability is computed but never surfaced as a verdict, and non-steady runs drop out entirely. So an **unplanned or off-plan hard session goes uninterpreted**, and "quality" leans on "did you hit the plan" instead of the session's own signals.

---

## The principle (from the research)

**Every endurance session gets TWO separate, honest lines — never fused into one score:**

1. **BODY** — how the body held up, from the session's objective internal signal.
2. **EFFORT** — how hard it felt, from RPE vs the athlete's own typical.

This is Polar's model (Cardio / Perceived shown in parallel), which is the industry standard and matches our "no single grand number, show the witnesses" law. **We do not average them. When they disagree, we show both and say so — we do not arbitrate.** (No app in the field does, and the science says pair-don't-substitute.)

Both lines are computed from the **session's own data** → **plan-independent by design**. An unplanned session gets the identical read.

---

## Line 1 — BODY (objective)

| Session shape | Signal | Read |
|---|---|---|
| Steady aerobic, >~20 min (run/bike) | HR-vs-pace decoupling (run) / HR-vs-power drift (bike) | durability band |
| Interval / targeted / short | decoupling is **NOT valid** here (research caveat) | **abstain** — "not a steady effort, no durability read" (never fake it) |
| Swim | no reliable in-water HR | provisional pace-based, or abstain (swim is never a focus) |

- **Reconcile the bands.** Today run uses Friel 5/10 and bike uses 3/5/8 — unreconciled. Pick **one** band family (TrainingPeaks convention: <5% solid / 5–10% developing / >10% gap) and apply it to both, so a run and a ride "durability" verdict mean the same thing.
- **Surface bike durability as a verdict** (parity with run) — it's already computed per session, just never shown as the State read.

## Line 2 — EFFORT (subjective)

- **Per-session RPE vs the athlete's own typical for that discipline + session type** — not the current 7-day/28-day aggregate. "Felt harder than your usual easy run" is the read.
- Needs a per-discipline/per-type RPE baseline. **Cold start → abstain** ("still learning your typical effort"), per Garmin "No Status" precedent.

## When the two lines disagree
Show both. If they diverge (felt easy but body drifted, or vice versa), surface it softly — **"felt easy, but your body worked harder than usual — worth watching."** No fused verdict, no arbitration. This is the field ceiling and the honest one.

---

## What stays exactly as-is (research confirmed — do NOT rebuild)
- **Trend / fitness direction:** rolling windows (already have). **No per-session outlier exclusion** — the smoothing dilutes a bad day (~2.4% weight on the long window). This kills the earlier "discount vs exclude" question.
- **Escalation:** pattern via rolling ratio — already have (`_shared/acwr-state.ts` is our own classifier; keep it). The precedent to honor is "ratio-based, pattern not single-session," NOT any specific vendor band set (Polar's product bands and Gabbett's research thresholds differ — see the research doc's Corrections). Never escalate on one session.
- **Cold start:** abstain / provisional — already the posture ("provisional" / "needs data").

## One source, every surface (Law 1 — the continuity fix)
The two-line per-session read is computed **once, on the spine**, and State + Performance + the workout Details screen all **render** it (Law 4). This is what stops the endurance side from fragmenting the way strength did (three pipelines, Issue #3). No surface re-derives the body or effort line.

---

## Build sequence

0. **Trace-confirm** where decoupling (run), HR-drift (bike), and per-session RPE already live, and pick the one spine object to write the two-line read into.
1. **BODY line:** one reconciled durability band over run decoupling + bike drift, steady-effort-gated; honest abstain on intervals/short/swim.
2. **EFFORT line:** per-session RPE-vs-typical (build the per-discipline/type RPE baseline); cold-start abstain.
3. **One object, spine-first:** emit the two-line read (with provenance + confidence per CANON) once; every surface reads it.
4. **Surface + close the gaps:** State, Performance, Details render the two lines; unplanned/off-plan and interval sessions now get an honest read (body abstains on intervals rather than the session vanishing); non-steady runs no longer drop out.
5. **Fixtures + zero-regression:** cold-start abstains; unplanned session reads identically to planned; endurance/tri unaffected; ≥3 recomputes for any LLM narration.

**Then (separate pass):** Issue #3 — converge the three strength pipelines onto one authority (same Law-1 fix, strength side).

## Cross-refs
- Research: `RESEARCH-session-interpretation-precedents-2026-07-09.md`
- `DESIGN-load-system-extension.md` (Item 3 — this is its Key-2 detail)
- `CANON-arc-inference-model.md` (per-session inference, confidence ladder, glass box)
- `CONSTITUTION.md` (Law 1 one-source, Law 4 render-don't-decide)
