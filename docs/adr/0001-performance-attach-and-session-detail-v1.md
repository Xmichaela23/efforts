# ADR 0001: Performance UI, attach/recompute, and `session_detail_v1`

**Status:** Accepted  
**Date:** 2026-03-21  
**Scope:** Completed workout Performance tab, `workout-detail`, analysis pipeline, attach/link flows

---

## Context

Users can complete an activity on one calendar day but **attach** it to a **planned** session on another day (e.g. Thursday’s tempo done Friday). Historically:

- **Performance** could show interval math while **plan context** still read “unplanned.”
- **Context / coach** narrative could say “skipped” while the user had linked the work.
- **Client** mixed `session_detail_v1`, `workout_analysis`, and local heuristics → **drift** between chips, narrative, and weekly story.

We need one architectural rule set so engineering does not reintroduce “multiple opinions” per session.

---

## Decision

### 1. Single source of truth for Performance UI

- **`session_detail_v1`** (built server-side, returned by `workout-detail` and persisted into `workout_analysis` for downstream consumers) is the **authoritative** contract for everything the **Performance** screen shows: execution chips, narrative, plan context, strength deviations, structured interpretation, etc.
- The **client is a rendering layer** (“dumb client”): it does not assemble planned vs unplanned, execution score, or adherence by combining several sources.

**Rule:** *No Performance render that depends on conflicting sources. One server response drives the whole tab.*

### 2. Attach is a full pipeline mutation

**Attach** (`planned_id` set or changed) is **not** a metadata-only update.

Required sequence:

1. Persist the link (`planned_id` / association).
2. **Invalidate** analysis that was computed without that plan (or bump an `analysis_version` / attach timestamp used for staleness).
3. **Re-enqueue** the same analysis path used on ingest (e.g. compute → analyze discipline).

**Stale contract:** If `planned_id` exists but analysis predates attach, `workout-detail` / contract must either:

- Block until recompute completes, or  
- Return **`stale: true`** (or equivalent) so the UI shows a spinner — **never** return chips + narrative that implicitly assume the old unplanned state.

### 3. Execution vs timing (sibling fields)

- **`execution_score`** reflects **quality vs prescription** (pace/power/duration/interval adherence as designed), **not** “did you run on the scheduled day.”
- **Timing** is explicit and **sibling** to execution, e.g.:

  ```text
  adherence: {
    execution_score: 0.87,
    timing_offset_days: 1,
    timing_label: "completed 1 day late"  // omitted or null when on-day
  }
  ```

This avoids: *“I executed the workout well but scored 72 because I did it Saturday.”*

### 4. Environment: where it enters the pipeline

- **Terrain / elevation:** Use **established adjustments** (e.g. grade-adjusted pace) **inside** the comparison that feeds execution scoring **when** elevation/terrain signal exists — same family of correction as GAP in running.
- **Weather (heat, humidity, wind):** Prefer **interpretation / narrative** to explain gaps vs raw targets; **do not** embed debatable single coefficients into the score unless product explicitly owns and documents them.

### 5. Physiology cross-check

- **RPE** (and **feeling** if collected) are part of the **physiology** story alongside HR / drift: e.g. high execution score + very high RPE on a prescribed easy day is a different interpretation than moderate RPE. Surface via server-built fields or narrative, not client-only inference.

### 6. Weekly coach vs Performance

- **Coach / weekly** narrative may consume **persisted** `session_detail_v1` (and related interpretations) to **synthesize** the week; it does **not** replace the per-workout Performance contract.
- **Daily ledger** and `planned_id`-aware matching remain the factual spine for “what happened which day” at the week level; Performance remains **one workout, one contract**.

### 7. Course terrain strategy — predicted finish (SSoT)

- **State** shows `race_readiness` from coach (server-computed). **Terrain strategy** (`course-detail`, `course-strategy`) must use the **same** projected finish when pacing segments, not a second client-supplied number.
- Resolution order on the server: (1) `goals.race_readiness_projection` when present, (2) **`coach_cache.payload.race_readiness`** when `goal_context.primary_event.id` matches the course’s `goal_id` (same payload State SWR uses), (3) **stated plan / goal race target** from `resolveGoalTargetTimeSeconds`, (4) baseline-only VDOT only if no plan target exists.
- The **client does not pass** `predicted_finish_time_seconds` into course APIs; it only renders server payloads.

### 8. Arc continuity on Performance (`arc_performance`)

- Every `session_detail_v1` build in **`workout-detail`** loads **`getArcContext(workout_date)`** so Arc is temporal: goal stack / plan envelope / narrative mode reflect **what was true that day**, not the live dashboard only.
- The contract includes optional **`arc_performance`**: **`narrative_mode`**, last-race deltas, **`runs_since_last_race`** (heuristic from completed runs), heuristic **`days_until_next_block_start`**, next goal refs, framing, plus plan-week snapshot when resolvable from `plans.created_at + duration_weeks`.
- **`narrative_text`** merges Arc framing with analysis; **`analyze-running-workout`** fact-packet LLM consumes the same deterministic **`ArcNarrativeContextV1.mode`**.
- Cached `session_detail_v1` without matching `arc_performance.version` is **stale** so historical sessions refresh into correct temporal snapshots.

---

## Consequences

### Positive

- One response → one story on Performance; fewer user-visible contradictions.
- Attach becomes predictable: always “re-run analysis with plan.”
- Timing can be honest without punishing execution quality.
- Clear split: terrain in scoring math where justified; weather as explanation.

### Negative / tradeoffs

- Attach requires **compute cost** and possible **latency** until analysis completes — mitigated by `stale` UX.
- Contract versioning and invalidation must be maintained in edge functions and DB merges.

---

## Implementation notes (non-normative)

- Cursor rule: `.cursor/rules/performance-session-contract.mdc` (day-to-day enforcement).
- Related audits: `docs/SMART_SERVER_DUMB_CLIENT_AUDIT.md`, `docs/PERFORMANCE_SCREEN_AUDIT.md`.
- Persistence: `session_detail_v1` merged into `workout_analysis` via atomic RPC after `workout-detail` build (see migrations for `merge_session_detail_v1_into_workout_analysis`). The merge also sets **`session_detail_updated_at`** (JSONB sibling) for staleness.
- **`scope=session_detail`** may **serve the persisted blob** when not stale (vs workout row `updated_at`, optional `recomputed_at`, 24h TTL); **`force_refresh`** (body or query) runs the full pipeline. Client sets `force_refresh` after `workout-detail:invalidate` so recomputes are not masked by the fast path.

---

## References

- Shared builder: `supabase/functions/_shared/session-detail/`
- Entry: `supabase/functions/workout-detail/index.ts`
- Client: `useWorkoutDetail`, `UnifiedWorkoutView`, `MobileSummary`
