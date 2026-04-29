# ADR 0002: `PhaseBlock` rows are one week each

**Status:** Accepted  
**Date:** 2026-04-27  
**Scope:** Combined plan phase timeline (`phase-structure.ts`), `week-builder.ts`, strength protocol context (`weekInPhase`)

---

## Decision

`pushBlockRange` emits **one `PhaseBlock` per calendar week** with `startWeek === endWeek === w`. Therefore **`block.startWeek` is that week’s index**, not the start of the phase or mesocycle.

Any code needing **week within phase** must walk the **`phaseBlocks` timeline** backward while `phase`, `primaryGoalId`, and `isRecovery` match — see **`weekInPhaseForTimeline`** in `week-builder.ts`.

**Do not** use `weekNum - block.startWeek + 1` for phase-relative calculations. It will always return `1`.

---

## Context (brief)

A mistaken assumption that `startWeek` equals “phase start” breaks strength copy, progression, and anything else keyed off `weekInPhase`. One-week rows are intentional for per-week TSS multiplier and distribution; consumers must align with that shape.
