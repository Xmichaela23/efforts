# Session notes — check-in → Arc data-model check-in (2026-06-12)

**Status:** Paused mid-check-in. User stepped away. **No data-model decisions made by Claude;
auto-attach-planned untouched.** Q1 answered by the user (below); Q2/Q3 still open.

This file is a scratch handoff, NOT an authoritative doc. The authoritative specs are
`docs/SPEC-ATHLETE-STATE-CONTINUITY.md` + `-OPTIONS.md` (Q-049) and
`docs/SPEC-PICK-PLANNED-RECONCILIATION.md` (Q-050).

---

## Tree state (orientation)

- Specs were committed at `52408f51` (docs only — parked specs Q-049/Q-050 + read-only
  check-in→Arc options).
- HEAD is two commits past that: `aaf066c5` (haptics SPM registration, D-139 native
  completion) and `25c3c952` (end-of-session doc update for 2026-06-12). Specs are in place;
  nothing pending on them.

## Catch-up understanding

### SPEC-ATHLETE-STATE-CONTINUITY (Q-049, Priority 1)
Make the Quick check-in (energy / soreness / sleep) a first-class readiness signal that flows
into Arc, with **Arc as the single source** every screen reads. Phased deliberately:
- **Phase 1** — make it visible everywhere (check-in → Arc → screens). No automatic load
  changes. Delivers Priority 1 (continuity) on its own.
- **Phase 2** — autoregulation (readiness *influences* suggested RIR / load). Separate spec,
  separate sign-off; needs a real adjustment model + guardrails ("never move load on one bad
  night, require a trend"). Out of scope until Phase 1 is trustworthy + trended.

### Corrected as-is flow (the OPTIONS doc supersedes the first audit)
- Check-in writes `workout_metadata.readiness` (JSONB on the workouts row; per-workout).
- `compute-facts:1555` echoes → `workout_facts.readiness` (per-workout/date).
- `compute-snapshot` aggregates → `athlete_snapshot.avg_readiness {energy,soreness,sleep}`
  (**weekly avg**, keyed user_id + week_start). **A weekly time-series DOES exist.**
- Two narrow consumers of the weekly avg: `recompute-athlete-memory` →
  `taperSensitivity` (energy rebound after ≥20% load drop) + injury flags.
- `analyze-strength-workout` uses per-workout readiness for summary NARRATIVE text only.
- **Real dead-ends:** (1) `arc-context.ts` does NOT read `avg_readiness` → Arc context never
  carries readiness (the true "check-in → Arc" gap); (2) no engine prescription effect
  (doesn't move `target_rir` / load / adapt-plan). Granularity today is weekly; true per-day
  exists only inside `workout_facts.readiness` and only on logged-workout days.

### SPEC-PICK-PLANNED-RECONCILIATION (Q-050, Priority 2)
Core pick mechanic is correctly wired. Three edges, all from the date-fixed plan model:
1. Coverage gap / silent swap (pick Thu, do Tue → Tue left unclaimed).
2. Slot-date ≠ performed-date attribution mismatch (display, not corruption).
3. **Start Fresh re-attaches by date** — UI unlinks (`planned_id = null`) but
   `auto-attach-planned`'s date-matching branch can silently re-claim the slot.
Fix order: edge 3 (correctness/trust) → edge 1 (out-of-order confirm UX) → edge 2 (cosmetic).
**Per user instruction this session: do NOT touch `auto-attach-planned`.**

---

## Data-model questions (Q-049 / OPTIONS doc)

### Q1 — Where does the readiness time-series live? **ANSWERED → Option C**
**User's decision: C — new `readiness_checkins` table.**
Dedicated `(user_id, date, energy, soreness, sleep, source)`, written at check-in time,
independent of the workout. Gives a true **daily** series; decouples check-in from a workout
(enables a morning check-in with no session). Known cost to plan for: new schema + migration
+ new write path + a backfill question, and the check-in UI would need a **non-workout entry
point** to fully exploit it. (This was the gating question — C unlocks daily trends like
"soreness climbing all week," which A/weekly forecloses.)

### Q2 — Does Arc store readiness as raw sliders or a derived score? **OPEN**
- A. Raw `{energy, soreness, sleep}` — lossless; every consumer re-derives; no single number.
- B. Derived score — one normalized 0–1 / Excellent…Poor (an `overall_readiness` already
  exists in `analyze-strength-workout:calculateOverallReadiness`). One number to act on, but
  lossy + blesses one opinionated formula as canonical.
- C. Both raw + derived — richest, future-proof, larger payload, least committal.
- *Context:* existing weekly aggregate is **raw**; the only existing derived formula is
  `calculateOverallReadiness` (not currently written to snapshot/Arc).
- *Interdep:* `taperSensitivity` reads `avg_readiness.energy` raw — if a derived score is
  added, decide whether it replaces or sits beside the raw values those consumers use.

### Q3 — How does an *unfilled* check-in read downstream? **OPEN**
- A. "No data" (null) — honest; matches the engine's anti-fabrication norm (D-035
  null-not-synthesized, D-122 anchor blank-not-faked, D-112/index-0 footgun). Every consumer
  needs a null branch; Arc can't assert readiness.
- B. Neutral default — always a value, but asserts "fine" when it's just unfilled (the trust
  problem the spec warns about; departs from project norms).
- C. "No data" + coverage signal ("checked in N of M sessions this week") — honest AND
  informative; more plumbing; needs the series to count sessions.
- *Context:* established engine pattern is A-style honesty (never synthesize a missing signal).

---

## BUILD STATUS — 2026-06-12 (Phase 1 steps 1–4 built, committed; deploy/push/apply pending)

Q1=C build executed per the human's directive. Four scoped commits on `main` (not pushed):
- `9ce58550` **D-140** step 1 — `readiness_checkins` table migration (source of truth, daily-keyed).
- `17d0c40d` **D-141** step 2 — compute-snapshot `avg_readiness` rollup over the table + facts fallback. **Verified:** 18/18 `aggregateWeek` deno tests pass; the only `deno check` error (line-311 `FactRow[]` cast) is pre-existing at HEAD. Consumers shape-preserved (taperSensitivity reads `avg_readiness.energy`; injury flags read per-workout `f.readiness`, never this field).
- `867e990d` **D-142** step 3 — client dual-write in `StrengthLogger.finalizeSave` (keeps JSONB, adds table row, fail-soft). **Verified:** `npm run build` clean.
- `9f9db981` **D-143** step 4 — backfill SQL (latest-check-in-per-day, ON CONFLICT DO NOTHING).

**Guardrails honored:** no prescription effect (didn't touch adapt-plan / suggested_rir); `auto-attach-planned` untouched; JSONB write kept so injury-flag + compute-facts consumers are unchanged; rollup designed to deploy safely before the SQL lands.

### STEP 5 (Arc wire) — DONE (Q2/Q3 answered)
- **Q2 answered:** raw + distinct (energy/soreness/sleep separate, never collapsed; derived score optional/later).
- **Q3 answered:** unfilled = no-data/absent (no neutral default). Sleep slider stays.
- `7b4e159b` **D-144** — `getArcContext` reads `readiness_checkins` over a 14-day window → `ArcContext.readiness {latest, recent, window_days}` (raw distinct; absent omitted; latest=null on no recent; null only on query failure). Additive field; `deno check` clean; ArcContext-stub test 13/13.
- **Phase-1 guardrail held:** visible-only — `readiness` is populated into Arc but NOTHING consumes it for prescription. adapt-plan / suggested_rir untouched.

### DONE this session (live in prod)
1. ✅ **Migration 1** (table) applied via SQL editor.
2. ✅ **compute-snapshot deployed** (`yyriamwvtvzlkumqrvpm`).
3. ✅ **Pushed through D-143** (`9f9db981`) → Netlify shipping the client dual-write.

### STILL PENDING (gated — need the human)
1. **Push D-144** (`7b4e159b`, committed, unpushed): `git push origin main`. (Edge-only change; push alone doesn't deploy edge fns.)
2. **Deploy arc-context consumers** so the Arc payload actually carries `readiness` — shared lib, so its callers redeploy: `get-arc-context`, `coach`, `workout-detail`, `analyze-{running,cycling,strength,swim}-workout`, `generate-training-context`, `arc-setup-chat`, `course-detail`, `create-goal-and-materialize-plan`. *No user-visible effect until a consumer SURFACES readiness, so not auto-deployed — decide whether to deploy now or batch with surfacing.*
3. **Migration 2 (backfill)** via SQL editor LAST: `supabase/migrations/20260612130000_backfill_readiness_checkins.sql`. (Optional read-only dry-run SELECT first — needs prod-query go-ahead.)

### NEXT INCREMENT (not built — needs decisions, deliberately not guessed)
**Surface readiness so it's actually "visible everywhere"** (the Phase-1 goal). D-144 only POPULATES `ArcContext.readiness`; nothing renders it yet. Surfacing in the coach prompt and the STATE screen needs copy/UI decisions (what to say, where, how trend is shown). Still Phase 1 (visible-only); Phase 2 autoregulation remains separately gated.

### Sub-decisions I made (flagged, not reserved Q1–Q3 calls — change if you disagree)
- `source` values: `'workout_logger'` (live) / `'backfill'` (migrated); free-text column, room for a future `'daily_checkin'`.
- Backfill dedup = **latest** workout's check-in per day. Change the `ORDER BY created_at DESC` if you want earliest/average.
- `energy/soreness/sleep` are `integer NOT NULL`; the table stores **raw sliders only** (any derived score is a Q2 read-time concern, not stored).

## Resume here next session
0. **Apply/deploy/push the 4 pending actions above** (gated; need your OK) — then Phase 1 data path is live end-to-end except the Arc wire.
1. Get user's Q2 + Q3 answers → build step 5 (Arc wire in `arc-context.ts`).
2. With Q1=C locked, the table design + the non-workout check-in entry point become real
   build items (Phase 1). Still no Phase-2 autoregulation without separate sign-off.
3. Pick-planned (Q-050) is untouched and parked; do not modify `auto-attach-planned` until
   the user re-engages it.
