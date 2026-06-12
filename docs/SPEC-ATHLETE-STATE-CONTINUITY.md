# SPEC — Athlete State Continuity (check-in → Arc → every screen)

**Status:** Open spec · not yet built · pick up when the atmosphere's right
**Priority:** 1 (foundational)
**Relates to:** Arc temporal context system · open "adaptive plan adjustment" item · D-126 (target_rir) · Q-049
**Filed:** 2026-06-12 (from the check-in wiring audit)

---

## The goal

Every screen should *know* the athlete's current state — not just record it. Today the
Quick check-in (energy / soreness / sleep) is saved and echoed into the summary, but the
engine and Arc never read it. So the app records readiness; it doesn't *act* aware of it.

The fix is to make check-in a first-class readiness signal that flows into Arc, and make
Arc the single source every other surface reads from.

## Where it stands today (from the audit)

> **⚠ Corrected 2026-06-12 — the first audit understated the wiring.** A weekly readiness
> time-series **does** exist (`athlete_snapshot.avg_readiness`, written by `compute-snapshot`),
> and it has two narrow consumers (`recompute-athlete-memory`: `taperSensitivity` + injury
> flags). So "no time-series exists / orphaned for the engine" below is **inaccurate**. The
> real dead-end is `arc-context.ts` not reading `avg_readiness`. Full corrected flow map +
> options: **`SPEC-ATHLETE-STATE-CONTINUITY-OPTIONS.md`**. The original (flawed) summary is
> kept below for the record.

- **Write — wired.** `handleReadinessSubmit` embeds `{energy, soreness, sleep}` into
  `workout_metadata.readiness` (JSONB on the workouts row). Keyed to the workout, not a
  standalone record. No time-series exists.
- **Read — wired.** `compute-facts` echoes it into `workout_facts`;
  `analyze-strength-workout` derives readiness levels.
- **Effect — narrative only / orphaned for the engine.** It colors the post-workout
  summary text ("capacity for load progression" vs "maintain current loads"), but drives
  no engine behavior: not suggested RIR, not load, not adapt-plan, not Arc.
- **Naming trap:** the server-computed `ReadinessSnapshotV1` (muscular load / energy
  systems) is a *different* thing — not these sliders. Don't conflate them.

So: the plumbing exists, but the signal dead-ends in narrative.

## What "done correctly" looks like

1. **Check-in feeds Arc as a readiness signal** — not just summary text. Arc's temporal
   context carries today's energy/soreness/sleep as structured state.
2. **Arc is the single source** other surfaces read — logger, summary, plan suggestions
   all reflect today's state from one place, rather than each re-deriving or ignoring it.
3. **A readiness time-series exists** — today's check-in is trapped per-workout in JSONB
   with no history. Promote it to something queryable by date/session so trends are
   visible, not just snapshots. (Enables "your soreness has been climbing all week.")
4. **The engine *can* consult it** — wire the path so suggested RIR / load *can* read
   readiness, even if adjustments stay conservative at first. The point is it's no longer
   orphaned; the wiring is there to tune later.

## Deliberate, not a bolt-on

A check-in that silently changes prescribed load needs a real model, or it undermines
trust in the numbers. Recommended sequencing:

- **Phase 1 — make it visible everywhere.** Check-in → Arc → screens read athlete state.
  No automatic load changes yet. This alone delivers Priority 1 (continuity).
- **Phase 2 — autoregulation.** Only once the signal is trustworthy and trended, let it
  *influence* suggested RIR / load. This is the "adaptive plan adjustment" feature — spec
  the adjustment model separately when you get there (how much, when, with what guardrails).

## Open questions to resolve when building

- Where does the readiness time-series live? (New table vs. promoting the JSONB to a
  queryable shape.)
- Does Arc store readiness as raw sliders or as a derived "readiness score"?
- What's the minimum useful Phase-2 adjustment, and what are its guardrails (e.g. never
  move load on a single bad night; require a trend)?
- How does an *unfilled* check-in read downstream — neutral, or "no data"?

---

## Code entry points (from the audit — for whoever builds this)

- **Write:** `src/components/StrengthLogger.tsx` — `ReadinessCheckBanner` (`~:158`), `handleReadinessSubmit` (`~:2706`), payload `workout_metadata.readiness` (`~:2763` → save `~:2791`). Source of truth today = `workouts.workout_metadata.readiness` JSONB.
- **Readers:** `compute-facts/index.ts:~1555` (echoes into `workout_facts`); `analyze-strength-workout/index.ts:~1255` `analyzeReadinessCheck` + narrative use `~:1832–2104`.
- **Where Arc would read it:** `supabase/functions/_shared/arc-context.ts` (+ `_shared/athlete-snapshot/`) — currently does NOT read the check-in; this is the wiring gap. Snapshot is keyed `user_id + week_start` (the natural home for a readiness time-series / trend).
- **Where the engine would consult it:** the live RIR/load path is `compute-facts/brzycki1RM` → `learned_fitness.strength_1rms` (plan loads); `target_rir` comes from the plan prescription (D-126). Phase 2 autoregulation would tap one of these, deliberately.
- **DO NOT conflate** with `_shared/session-detail/readiness-*` / `readiness-thresholds.ts` / `ReadinessSnapshotV1` — that's the server-computed muscular-load model, a different signal.
