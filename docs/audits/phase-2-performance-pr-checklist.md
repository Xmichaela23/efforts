# Phase 2 PR checklist: Performance → `session_detail_v1` only

Maps **[performance-screen-data-sources.md](./performance-screen-data-sources.md)** legacy tentacles to shippable PRs. Goal: **one contract** for Performance; **no silent fallbacks** to `session_state_v1` / raw `workout_analysis` for interpretation.

**ADR / rule:** `docs/adr/0001-performance-attach-and-session-detail-v1.md`, `.cursor/rules/performance-session-contract.mdc`.

---

## How to use

- [ ] Check boxes when merged.
- Each PR should **update the audit doc** (§6 + table) for anything removed.
- Prefer **small PRs** in the order below; later PRs assume earlier ones where noted.

---

## PR-1 — Always fetch `session_detail_v1` (kill `fromContext` skip) ✅ *implemented*

**Maps to:** Audit §6A, summary item 1.

| Task | Detail |
|------|--------|
| [x] Remove or narrow `fromContext` short-circuit in `useWorkoutDetail` | Query is **always** enabled (when `id` + session). Renamed preview row to `contextPreview` — it no longer disables the edge call. |
| [x] Never return `session_detail_v1: null` solely because context has GPS/sensors | `session_detail_v1` comes **only** from `query.data` (null only if server omits it). |
| [x] Keep merge behavior | `queryFn` still merges context + `remote`; **preserves** context `gps_track`, `samples`, and `sensor_data` when the edge returns empty. |
| [x] Prefer server merge over context when query succeeded | `stableWorkout` uses `query.data.workout` first, then `contextPreview` while pending. |

**Acceptance:** Opening a completed workout from feed with full GPS still receives non-null `session_detail_v1` after load (or explicit loading/error state — not silent fallback to old shapes only).

**Files:** `src/hooks/useWorkoutDetail.ts`

**What to verify next (feeds PR-3/PR-4 scope):** After load, check Performance for workouts that previously relied on fallbacks — note any **null** sd fields (server gaps) vs UI gaps. Optional: network tab should show `workout-detail` on every open, including list rows that already had GPS.

---

## PR-2 — Performance tab loading / error for contract

**Maps to:** Audit §3, §6C (`detailLoading` not passed to `MobileSummary`).

| Task | Detail |
|------|--------|
| [ ] Pass `detailLoading` (and optional `detailError`) into `MobileSummary` | Skeleton or spinner for contract-dependent sections until `session_detail_v1` is ready. |
| [ ] Avoid painting chips/narrative from legacy sources **while** contract is still loading | Unless you explicitly allow “row-only” preview — product call. |

**Acceptance:** No flash of `workout_analysis`-only UI that contradicts post-load `session_detail_v1`.

**Files:** `src/components/UnifiedWorkoutView.tsx`, `src/components/MobileSummary.tsx`

---

## PR-3 — `MobileSummary`: chips + narrative from `session_detail_v1` only

**Maps to:** Audit §6B (large), summary items 2–3.

| Task | Detail |
|------|--------|
| [ ] Run chips: drop fallback to `performance` / `session_state_v1` | If field missing in sd, show “—” or hide chip per `display` flags, not alternate source. |
| [ ] Ride chips: same | Align with run branch. |
| [ ] **Swim (open water) chips:** use `session_detail_v1.execution` | Extend server builder if OW fields missing today. |
| [ ] Narrative + bullets + plan context line | From sd only (`narrative_text`, `observations`, `plan_context`). |
| [ ] Remove / gate `session_state_v1` narrative and `adherence_summary` duplicate blocks | Or behind single “legacy debug” flag removed before release. |
| [ ] `getWeeklyIntentLabel` | Move to sd (e.g. `plan_context` / metadata) **or** drop from Performance until server exposes it on contract. |

**Acceptance:** Grep `MobileSummary.tsx` for `session_state_v1` / `workout_analysis?.performance` in Performance render paths → **zero** (or documented exception list).

**Files:** `src/components/MobileSummary.tsx`, possibly `supabase/functions/_shared/session-detail/*`, `workout-detail`

---

## PR-4 — Intervals table: single server shape

**Maps to:** Audit §2 table (interval rows), §6B (~583–807, ~960–988, ~2058+, ~2405–2421).

| Task | Detail |
|------|--------|
| [ ] Prefer `session_detail_v1.intervals` for table body | Planned/actual columns from contract. |
| [ ] Remove `detailed_analysis.interval_breakdown` / `fact_packet_v1` fallbacks for primary table | Unplanned: ensure sd includes interval rows or explicit “analysis-only” section owned by server. |
| [ ] Pacing variability ⚠️ | Either move into sd as flags **or** drop from UI until it exists on contract. |

**Acceptance:** Interval table does not read `workout_analysis.detailed_analysis` for default path.

**Files:** `src/components/MobileSummary.tsx`, `session-detail` builder, analyzers feeding builder

---

## PR-5 — Recompute + attach → refresh contract

**Maps to:** Audit §3 (recompute), summary item 4.

| Task | Detail |
|------|--------|
| [ ] After `MobileSummary` recompute success | `invalidateQueries(['workout-detail', id])` or call `workout-detail` once and set parent state so `session_detail_v1` updates. |
| [ ] After attach / `updatedWorkoutData` refresh | Same invalidation so Performance matches new `planned_id`. |
| [ ] Optional: `workout-detail` returns `stale: true` | Wire UI spinner (ADR); track as follow-up if not in PR-5. |

**Acceptance:** Recompute or attach never leaves Performance showing pre-mutation interpretation without user refetching app.

**Files:** `src/components/MobileSummary.tsx`, `src/components/UnifiedWorkoutView.tsx`, optionally `workout-detail`

---

## PR-6 — `StrengthCompletedView`: deviation + stats

**Maps to:** Audit §6D.

| Task | Detail |
|------|--------|
| [ ] Remove client weight-only deviation fallback | When sd null, show loading or “Analysis updating…” not invented copy. |
| [ ] Volume/summary line | Prefer sd fields if you add them; else keep **pure display** from row without “interpretation” (tonnage only). |

**Acceptance:** No `session_detail_v1 == null` branch that implies plan adherence text from client math.

**Files:** `src/components/StrengthCompletedView.tsx`, `session-detail` for strength

---

## PR-7 — Legacy entry: `WorkoutSummary` / `WorkoutDetail`

**Maps to:** Audit §6F, §5 secondary entry.

| Task | Detail |
|------|--------|
| [ ] Route desktop/legacy flows through `useWorkoutDetail` + pass `session_detail_v1` | Or deprecate surface and link to `UnifiedWorkoutView`. |
| [ ] Remove / replace `WorkoutAIDisplay` raw `workout_analysis` on Performance-equivalent tab | Same contract as mobile. |

**Acceptance:** No user-facing path shows AI copy from `ai_summary` / old insights **when** unified path uses sd.

**Files:** `src/components/WorkoutSummary.tsx`, `src/components/WorkoutDetail.tsx`, callers

---

## PR-8 — Details tab (optional / Phase 2b)

**Maps to:** Audit §6E, summary item 5.

| Task | Detail |
|------|--------|
| [ ] Document scope | Details remains **telemetry + charts**; Phase 2 can be Performance-only. |
| [ ] If converging Details | Move GAP / readout grid to server `computed` or sd sub-object; stop client GAP in `CompletedTab`. |

**Acceptance:** Separate PR when product wants “dumb client” for Details too.

**Files:** `src/components/CompletedTab.tsx`, `src/hooks/useWorkoutData.ts`, edge compute pipeline

---

## PR-9 — Stop writing deprecated shapes (Phase 5 prep; after reads are gone)

**Maps to:** ADR consequences.

| Task | Detail |
|------|--------|
| [ ] Grep consumers of `session_state_v1` / duplicate narrative fields | Must be zero outside migration/tests. |
| [ ] Analyzers write **into** builder inputs only | Per ADR plugin model; one write path to merged `workout_analysis` + sd persistence. |

Do **not** start until PR-3–PR-7 have removed reads.

---

## Quick verification commands (after Phase 2)

```bash
# Performance paths still reading legacy (should trend to zero)
rg "session_state_v1|workout_analysis\?\.performance|fact_packet_v1" src/components/MobileSummary.tsx

# Hook must not null sd on context hydration
rg "fromContext" src/hooks/useWorkoutDetail.ts
```

---

*Companion to [performance-screen-data-sources.md](./performance-screen-data-sources.md).*
