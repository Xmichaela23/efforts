# SLICE 3 — Retire the weekly strength DIRECTION verdict (2026-08-12)

**Temporary build contract. Dies on ship → fold into D-420 (already written), delete this file.**
Terminal, one stage. Ships behind fixtures (Constitution Law 6). Implements the decision already recorded in **D-420** and **`docs/SCIENCE-strength-e1rm-trust.md` §6** — read both first; the *why* lives there, do not re-derive it.

## The goal, in one line
Strength progress is shown as a **record + rep PRs + a chart** — never a weekly "improving/sliding/needs_data" direction word. No commercial app computes a weekly strength direction, and on a 5/3/1 wave it reads the within-cycle weight-wave as a trend (the "1 lift trending down" / overall "sliding −8.2%" this whole thread chased).

## Why this is a clean, low-blast-radius fix
D-418 already removed strength from the overload alarm, so the direction verdict now only feeds the **strength display**. Killing it changes what the strength row *says*, nothing about load/readiness. And most of the target state already exists (D-417 §4): the e1RM number, the sparkline, the "best" tag, and rep PRs (`strength-row-text.ts composeAllOutRowText`) all render today. This slice is mostly **deletion**.

## What exists (READ before touching — Law 1, kill at the source)
- `_shared/state-trend/strength.ts` — `classifyTrend` produces the per-lift `direction` and the overall `verdict` ('improving'/'sliding'/'holding'/'needs_data'). **This is the source.** D-419 pointed it at the all-out set; that's the thing that still misreads.
- `_shared/state-trend/assemble.ts` — `liftSeriesFromExerciseLog` (the trusted e1RM series, D-417 gate) + `computeStrengthState` → `latestE1rm` / `bestE1rm`. **The record (`bestE1rm`) and the series already exist here — keep them.**
- `_shared/response-model/weekly.ts` — `computeStrength` rolls the per-lift directions into `overall.trend` + the headline **"N lifts trending down"** and reads `spine_e1rm_direction` (`:309`). This headline is a primary render of the verdict.
- `readsEffortAs` on the strength profile (D-419 infra) — **survives.** Only the weekly verdict it feeds goes.

## The work
1. **Stop emitting a weekly direction as a displayed judgment.** At the spine source (`state-trend/strength.ts`), the per-lift `direction` and overall `verdict` must no longer drive a user-facing "improving/sliding" claim. Kill it at the source so every arm (State row, `computeStrength` headline, coach, Home chip, any sparkline treatment) stops showing it — do not patch each surface (Law 1).
2. **Keep what the apps show:** the e1RM **record** (`bestE1rm`, monotonic — ticks up when beaten, never slides from a lighter week), **rep PRs** (most reps at a weight — already in `composeAllOutRowText`, make sure it surfaces on the strength row), and the **chart** (the trusted e1RM sparkline over the block).
3. **The strength headline** (`weekly.ts computeStrength`, the "N lifts trending down" line) → replace with a record/PR-framed line or drop it. No direction word. Copy decision — keep it factual (e.g. current best e1RM + latest rep PR), not a verdict.
4. **If a direction is EVER stated**, it may only be computed over a window spanning **≥2 full cycles** (so the wave is inside the window, not split). Default is: don't state one.

## Fixture (Law 6 — permanent regression)
- **Michael's bug case:** his deadlift within one cycle (105×35 → 110×25 → 115×20) → **no "sliding"/"trending down" anywhere**; the e1RM record holds (his best trusted deadlift e1RM), the high-rep sets surface as rep PRs. Permanent.
- **Real record gain:** a new best trusted e1RM across cycles → the record ticks up (no verdict needed).
- **Rep PR:** most reps at a weight → flagged.
- **No weekly direction rendered:** assert the strength row/headline contains no "improving/sliding/trending" string.
- Deterministic; ≥3 recomputes if any stochastic path.

## Do NOT touch
- `mintOverloadVerdict` (D-418) — strength is already out of the overload alarm.
- The e1RM formula + reserve gate (D-339) and the D-417 trusted-rep ceiling.
- `readsEffortAs` infrastructure (D-419) — the gauge declaration stays for future protocols.

## Acceptance
Rebuild Michael's spine + payload; the strength section shows record + rep PRs + chart, **no "sliding"/"trending down"** on his deadlift or overall. Device pass. Then fold into D-420 (mark it built), delete this file.
