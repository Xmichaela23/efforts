# DESIGN — Segments (the commercial-grade "am I getting faster on this stretch")

Status: **spec, not built.** Supersedes the route-performance approach in `DESIGN-familiar-routes.md` (see §0). Authored 2026-07-06 after an audit + incumbent research proved the route-identity model can't carry an honest trend. This doc is self-contained: a fresh session should be able to build from it + the repo alone.

Cross-refs: `CONSTITUTION.md` (don't-lie, Laws 1–6), `CANON-arc-inference-model.md` (confidence ladder, abstain-not-fill), `_shared/route-intelligence.ts` (the current model being replaced), `_shared/heat-adjust.ts` (parked; see §7).

---

## 0. Why this exists — the audit that killed the route approach

The prior feature (`DESIGN-familiar-routes.md`) trended per-**route** performance. It flip-flops on real data (says "improving" one week, "declining" the next) because the route-**identity** model is not commercial-grade. Audited 2026-07-06 (`route-intelligence.ts`, `route-match.ts`, `geohash.ts`):

1. **Over-merges different distances.** Matching is an *overlap coefficient* — shared cells ÷ the SMALLER run's cells (`route-match.ts:39`), threshold 0.6. Above 0.9 overlap the distance guard is **bypassed entirely** (`route-match.ts:66`); in the 0.6–0.9 band it only rejects >2.5× (`ROUTE_LENGTH_MAX_RATIO`). Real data: one cluster held runs from **2.9 to 5.0 miles**. No distance banding exists.
2. **Fragments one trailhead into many clusters.** Identity is an *unordered set* of ~150m geohash cells (precision 7) with **no start/direction anchor** in the primary path. Different directions from one trailhead → near-disjoint sets → overlap <0.6 → separate clusters. Real data: **4 cluster IDs at 34.087,−118.181**.
3. **Double-counts runs (data bug).** `route_progress_metrics` conflicts on `(cluster, workout)` not `workout` (`compute-facts:859`) and **nothing deletes rows**. On re-match, a new stats row is inserted and the old orphans → one run under two clusters. Real data: the June-14 run appears twice.
4. **Out-and-backs are a knife-edge.** The geohash SET folds the return path onto the outbound (no order/direction). Variable-length out-and-backs *sometimes* merge (intended) but GPS jitter / a different turnaround pushes them into the 2.5× guard band and splits them; the over-merge also absorbs unrelated runs. Unstable by construction.

**Incumbent precedent (Strava, Garmin):** everyone solves "am I faster here" with a **fixed SEGMENT** — a defined start→path→end→distance, matched only when an activity traverses that exact piece (ordered, with a GPS buffer). Strava's whole-route matcher additionally keys on **start + end + direction + distance** and *splits* variable lengths rather than lumping them. **Nobody uses distance-blind unordered path overlap.** Sources: Strava Segments / Matched Activities help; Garmin Segments/Courses.

**Conclusion:** to honestly compare an out-and-back run of *variable length*, you compare a **fixed sub-path every run covers**, not "the route." That is a segment. This doc specs the segment model.

---

## 1. The primary user (build + verify against this)

User 45d122e7 (Michael, sole user, pre-launch). His primary run is an **out-and-back at variable lengths** from a few trailheads (e.g. 34.087,−118.181), plus travel runs (Austin TX, Santa Barbara incl. a 26mi marathon) that must NOT pollute. Dry climate (heat parked, §7). **The acceptance bar is his real data: the same-segment verdict must be stable across recomputes and must not flip week-to-week.** Verify with deno fixtures for the primitives AND a real-data recompute pass (the whole route saga proved fixtures-green ≠ correct-on-real-data).

## 2. The product (what the user sees) — unchanged shape, new substrate
Progressive disclosure, phone-first (WHOOP/Strava research, already validated this session):
- **Tier 1 — glanceable headline**, server-authored, rendered verbatim ("arm of State"): "You're faster on this stretch" / "Holding" / "Still building." CI-gated; **no directional verdict under the confidence floor** (see §5). Honest words carry the uncertainty.
- **Tier 2 — one chart, one metric toggle**, both in min/mi: **Pace** and **Same-effort pace** (pace normalized to the athlete's typical HR on the segment; the human form of Efficiency Factor / a passive MAF test). Personal best = gold dot. Trend line **only** for a confident direction (never a sloped line under "Holding").
- **Tier 3 — every effort**, each dot tappable → that workout.
- **Doorway:** the session card's familiarity line ("Ran this stretch N×") taps into the above.

The client shell for all of this already exists — `src/components/RouteDoorway.tsx` (reuse ~wholesale; it already does the tiers, toggle, gold best, verdict-gated line, temp-adjust, month axis). The work is the SUBSTRATE beneath it.

## 3. Data model (needs a real migration — none exist for the current route tables!)
> ⚠ There are **no migrations** in `supabase/migrations/` for `route_clusters`/`route_progress_metrics`/`workout_route_match` — they live only in prod. Step 0 of the build is to (a) introspect + backfill DDL for whatever we keep, and (b) add the new tables as tracked migrations. Do not add more untracked tables.

- **`segments`** — identity of a fixed sub-path: `id`, `user_id`, `polyline`/`geohash_seq` (ORDERED cell sequence, not a set), `start_cell`, `end_cell`, `distance_m`, `direction_bearing`, `first_seen_at`, `effort_count`, `metadata`.
- **`segment_efforts`** — one row per (segment, workout): `segment_id`, `workout_id`, `user_id`, `effort_date`, `duration_s`, `distance_m`, `avg_pace_sec_per_km`, `avg_hr_bpm`, `temp_f`, `decoupling_pct`, `metadata`. **Unique on `workout_id, segment_id`; DELETE stale rows on re-derive (fixes the orphan bug).** A workout may legitimately have efforts on several segments.

## 4. The three new primitives (the hard steps) — build as tested `_shared` modules

**4.1 Ordered path-match** (`_shared/segment-match.ts`). Given an activity's ordered GPS polyline and a segment's ordered polyline: does the activity traverse the segment start→…→end, in order, within a buffer? Return entry/exit indices or null. This is Strava's model and it is fundamentally different from today's unordered-set overlap. Spec: resample both to fixed spacing; require the activity to pass within ~25–40m of the segment start, then follow the segment's ordered points to the end without a gap exceeding a buffer; direction matters (a reverse traversal is a different segment or explicitly excluded). Fixtures: exact traverse matches; partial/no-end fails; reverse fails; a longer run containing the segment matches; GPS jitter within buffer still matches.

**4.2 Segment detection** (`_shared/segment-detect.ts`). **KEY FORK — decide first (see §8):** auto-detect vs user-defined.
- *Auto (recommended v1, no creation UI):* per start-cluster, find the **longest ordered cell-subsequence shared by ≥ K runs** (K≈5) — the "spine" every out-and-back covers. That spine IS the segment. Handles variable length (the spine is the common core) and direction (ordered). Algorithm: align runs' ordered geohash sequences (LCS / suffix-automaton over cells), keep the longest recurring contiguous run; band by direction bearing.
- *User-defined (Strava-classic):* the user draws/selects a segment; simpler engine, needs creation UI.
Fixtures: 5 variable-length out-and-backs on one road → one spine segment covering the common core; two directions from one trailhead → two segments; travel/marathon one-offs → no segment (below K).

**4.3 Segment-effort extraction** (`_shared/segment-effort.ts` + wire into `compute-facts` ingest fan-out). For each segment an activity matches, slice the GPS+time series between entry/exit indices and compute duration, distance, avg pace, avg HR, temp (from `weather_data`), decoupling — over just the segment. Write `segment_efforts` (delete-then-write per workout to avoid orphans). Register in `ingest-activity` fan-out (`~1430-1580`) AND `recompute-workout`/`bulk-reanalyze` so it can't go stale.

## 5. The read (mostly REUSE — this session already built it)
- **Metric:** same-effort pace / pace over the segment, per effort. Efficiency = `computeEfficiencyIndex` (`_shared/efficiency-index.ts`) — the SAME metric State uses (Law 1). Reuse `routeHeadline`/`routeTrend` (`_shared/heat-adjust.ts`) verbatim, fed `segment_efforts` instead of `route_progress_metrics`.
- **Confidence floor (fixes the flip-flop):** **no directional verdict (improving/declining) under N≥8 comparable efforts.** Below that → "still building history." This is the single most important gate — the whole flip-flop was 4-effort verdicts. (Today's `routeHeadline` fires a half-vs-half direction at N≥4; raise it.)
- **CI-gated four-state verdict:** improving / holding / declining / still_learning, verdict must clear the CI AND the ±band. Never a faked arrow.
- **Arm of State:** the segment read is State's efficiency metric zoomed to one stretch — it must never contradict State's aggregate; scope the copy ("on this stretch…").
- **Server-authored copy** in `session-detail/build.ts` (the `buildRouteReadout` pattern already there), rendered verbatim.

## 6. Build order (8 steps; 3 hard, 5 reuse)
0. **Schema/migrations:** new `segments` + `segment_efforts` (tracked migrations); backfill DDL for retained tables.
1. **4.1 ordered path-match** primitive + fixtures. *(hard)*
2. **4.2 segment detection** (auto-spine) + fixtures. *(hardest — pick the fork first)*
3. **4.3 segment-effort extraction** in compute-facts + fan-out registration. *(hard)*
4. **Read:** feed `segment_efforts` into `routeHeadline`/`routeTrend`; raise the floor to N≥8 for a direction.
5. **Server surface:** `build.ts` serves segment list + per-segment readout (reuse `buildRouteReadout`).
6. **Client:** point `RouteDoorway` (or a `SegmentDetail`) at segment efforts. Mostly reuse.
7. **Backfill:** detect segments + extract efforts across history; **then recompute + verify the verdict is STABLE on his real data** (the acceptance bar, §1).

## 7. Explicitly parked / out of scope
- **Heat correction** — `_shared/heat-adjust.ts` (temperature-based, `adjEfficiency`, `heatTerm`, `TEMP_REF_F=60`, `DEFAULT_HEAT_K=0.005` population placeholder + the `k`-is-HR-side PROHIBITION). Keep it available; apply it to same-effort pace as a refinement AFTER the segment substrate is stable. Do not let it block v1. Dew point stays captured but dormant (dry-climate finding).
- **Leaderboards / shared segments** — the identity supports it later; not v1.
- **The current route tables** — `route_progress_metrics` etc. can stay for the familiarity line ("run N×") but the TREND moves to segments. The `RouteSparkline` is already deleted (dead since D-249).

## 8. Open forks (decide before building)
1. **Auto-detect vs user-defined segments** (§4.2). Recommend **auto-spine v1** (no creation UI, fits the out-and-back). Ruling needed — it sizes step 2.
2. **Direction:** treat a reverse traversal as a separate segment, or fold it in? Recommend separate (Strava does).
3. **Confidence floor value:** N≥8 proposed. Confirm.
4. **DB constraint audit:** verify the live unique constraints on the current tables (unverifiable from repo) before trusting any idempotency; add migrations.
5. **Familiarity line scope:** keep per-route "run N×" (cluster total) as the doorway even though the trend is per-segment? Recommend yes.

## 9. What NOT to repeat (lessons from the route saga)
- **Fixtures green ≠ correct.** Every step must be re-verified on his real data (recompute + look); the data bit back at every turn.
- **Don't over-claim on thin data** — the floor (§5) is non-negotiable.
- **No abstract numbers in the UI** — pace, not an efficiency index (users don't feel "1.83").
- **Chart must not contradict the headline** — no sloped line under "Holding."
- **The route history is built at ANALYSIS time and persisted** — a change needs `analyze-running-workout` (or wherever detection lands) redeployed AND a recompute, not just a read-path deploy. Plan deploys accordingly.
- **"Route"/"loop" is wrong copy** — these are out-and-backs; say "stretch"/"segment"/"route" carefully, never "loop."

## Changelog
- **2026-07-06** — Created. Specs the segment model (full "A") after the route-identity audit + incumbent research. Supersedes the route-trend approach; heat parked; reuses this session's read engine + `RouteDoorway` shell. Written as a hand-off for a fresh build session.
