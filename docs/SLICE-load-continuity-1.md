# SLICE 1 — One overload source (2026-08-12)

**Temporary build contract. Dies on ship → fold into a D-NNN, delete this file.**
Terminal, one stage. Ships behind fixtures (Constitution Law 6). Build ON commit `7809cc12` (already pushed) — do not revert it.

## The goal, in one line
"Are you overloaded" is minted in ONE place, plan-aware, fed **only** by the athlete's own signals: RPE, measured body metrics (HR drift, cardiac efficiency, HR-at-effort), and **actual-vs-planned load**. Never absolute ACWR. Never prescribed load. Never a strength e1RM. Every card reads that one verdict.

**Michael's rule (the yardstick):** *a plan you followed can't be "too much" — the plan IS the intended load. Flag on what the body reports, never on the numbers the app handed you.*

## Why (the fracture, verified in his live payload 2026-08-12, coach_payload_version 165)
Same payload, contradicting itself: `glance.verdict_code = on_track` while `response_model.headline = "Signs of overreaching — consider backing off"`, `load_status.status = elevated` ("a bit high"), accent = "needs absorbing", `training_state.code = overstrained` — on an **ACWR 1.1, on-plan, build week 1 of 12**. Driven by two soft signals: one harder-than-usual RPE (4.8 vs 3.9) + one "lift trending down" (a 5/3/1 weight-wave, not a real loss).

There are **multiple overload authorities**, not one:
- `reconcileLoadStatus` — the D-260 sole verdict authority. **Keep as the one.** `_shared/load-status-reconcile.ts:200`.
- `computeAssessment` 'overreaching' — parallel authority. **Step 1 (7809cc12) already gated it on load corroboration.** `_shared/response-model/weekly.ts:440`.
- Raw readiness classifier — returns `'fatigued'` from a bare `bodySignalsConcerning` catch-all. `coach/index.ts` ~3124 (`if (bodySignalsConcerning) return 'fatigued'`). **This is why the accent + "a bit high" survive step 1** — readiness stays fatigued from the same soft count, independent of the label.
- `coach/index.ts:3080` — `assessment.label==='overreaching'` sets raw readiness `'overreached'`. Coupling seam.
- Inline plan-BLIND `acwr_status` — a 4th ACWR classifier. `weekly.ts:403-409`. Feeds "Load is elevated." subtext + the overreaching copy.
- Consecutive-days "N days straight — rest soon" — day-count only. `weekly.ts:780`.

## The work
1. **The overload/strain verdict keys on athlete signals only.** RPE trend, measured body metrics, and actual-vs-planned load (did you EXCEED the plan). Remove absolute-ACWR and prescribed-load as escalators. `reconcileLoadStatus` already has Gate 2 build-tolerance + D-416 refined readiness — extend that discipline; do not add a new authority (Law 5).
2. **Strength e1RM is not a strain signal.** Drop `Strength` from the declining-signals set feeding overreaching/readiness. `weekly.ts:452`. (Strength gets measured properly in Slice 2 — do not touch the trend here.)
3. **Readiness stops over-firing.** `coach/index.ts` ~3124: a bare `bodySignalsConcerning` count must not return `'fatigued'`. Require corroboration (measured metrics or actual-vs-plan), or read the reconciled verdict. This is the seam that keeps the accent + "a bit high" alive after step 1.
4. **Every card reads the one verdict** (Law 4, render-only): the WEEK/LOAD word, the BODY chip, the accent, the headline. No card mints its own.

## Fixture (Law 6 — permanent regression)
- **His case → clean:** on-plan build week, ACWR ~1.1, one harder-than-usual RPE, a 5/3/1-wave e1RM dip → NO overload on ANY lane (no "a bit high", no accent, no "overreaching/back off", no "overstrained"); glance stays on_track. This is the bug case — keep it forever.
- **Real overload → still fires:** exceeded planned load AND corroborated measured strain (HR drift up + RPE up) → 'elevated'/'high' fires on every lane together.
- Coach headline text is deterministic here (no LLM), but if any stochastic path is touched: ≥3 back-to-back clean recomputes, never one.

## Do NOT touch
- The strength trend algorithm — Slice 2 (strength gauge = protocol-declared: 5/3/1 → all-out rep record; RIR block → RIR).
- The goal `glance` lane (it's already correct — it's the honest one).
- The e1RM formula (done — reserve removed 2026-08-12).

## Acceptance
Regenerate Michael's coach payload; the six lanes agree; device pass on the State screen. Then fold into a D-NNN and delete this file.
