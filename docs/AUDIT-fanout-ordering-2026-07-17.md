# AUDIT — Ingest Fan-Out Ordering (Phase 2 prep)

**2026-07-17. DIAGNOSIS ONLY — no code changed, no deploy, no migration.** This is the ripple walkthrough authorized before the Phase 2 fix ("await what you read"). Q-185–Q-188 untouched. All file:line references verified by code trace on `main` this session.

**Bottom line:** the two bugs the banner named are real and confirmed, plus three additional findings the trace turned up. Nothing here is active data *corruption* — the failures are *absence* and *staleness*, and both self-heal on the next trigger (see §5). The interesting cost is not the reorder itself; it's that a correct serial order pulls the `analyze-{sport}` LLM call into the webhook critical path, and that the existing "correct" path (`recompute-workout`) has a latent double-snapshot race. Rulings owed on §3a/§3b/§3c before any fix.

---

## 1. The dependency map

### 1a. Every job fired on ingest, what it writes, who reads it

The primary path is `ingest-activity/index.ts` (Garmin/Strava). Two other entry paths reach the workouts table by different routes.

| # | Job | Writes | Read by (downstream) |
|---|-----|--------|----------------------|
| 1 | `auto-attach-planned` | `workouts.planned_id` | analyze-{sport}, compute-facts (planned adherence) |
| 2 | `compute-workout-summary` | `workouts.computed.overall` (incl. `execution_score`), `computed.intervals` — via `merge_computed` RPC (row-locked) | compute-facts, compute-workout-analysis |
| 3 | `compute-workout-analysis` | `workouts.computed.overall` + `computed.analysis` (HR zones, drift), `power_curve`, `best_efforts` — via `merge_computed` | compute-facts; also **fires analyze-{sport} itself** (a 2nd trigger — see F3) |
| 4 | `calculate-workload` | `workouts.workload_actual` (ACWR substrate) | compute-snapshot (ACWR band), coach |
| 5 | `compute-adaptation-metrics` | adaptation metrics (fast lane) | State/coach |
| 6 | `compute-facts` | `workout_facts` (run/ride/strength/swim facts), `session_load`, `exercise_log`, `route_progress_metrics` (run durability), fires `match-cores` + `compute-snapshot` | compute-snapshot, arc-context, coach |
| 7 | `analyze-{sport}-workout` | `workouts.workout_analysis` (grades, `bike_fitness_v1`, `heart_rate_summary`, `classified_type`, LLM narrative) | compute-snapshot (bike efficiency + run durability gate), session_detail, coach |
| 8 | `adapt-plan` action=auto | `plan_adjustments`, rewrites `computed.steps` on future plan rows via materialize | the athlete's future plan |
| 9 | `post-import-athlete-pipeline` | learned baselines/identity/memory | arc, plan gen |

### 1b. Ordering as it runs today (`ingest-activity`)

```
upsert workout row  ──────────────────────────────────── (committed; the anchor)
  1  auto-attach-planned          AWAIT      :1482
  2  compute-workout-summary      FIRE&FORGET :1508   ← writes computed.overall/intervals
  3  compute-workout-analysis     FIRE&FORGET :1521   ← writes computed.analysis
  4  calculate-workload           AWAIT      :1536
  5  compute-adaptation-metrics   AWAIT      :1560
  6  compute-facts                AWAIT      :1582   ← READS computed  (writes facts, fires snapshot)
     invalidateUserTrainingCache  AWAIT      :1600
  7  analyze-{sport}-workout      FIRE&FORGET :1624   ← writes workout_analysis
  8  adapt-plan action=auto       FIRE&FORGET :1662
  9  post-import-athlete-pipeline AWAIT (Garmin + milestone-gated) :1707
     return 200
```

`compute-facts` fires `compute-snapshot` **fire-and-forget at its own tail** (`compute-facts:1848`) — snapshot is not sequenced by ingest at all.

### 1c. The other two entry paths

- **`ingest-phone-workout:292`** — fires **only** `compute-workout-summary`. No analysis, no facts, no workload, no analyze, no snapshot.
- **`save-imported-workout:196`** — fires **only** `compute-workout-summary`. Same gap.
- **Merge-existing path** (`ingest-activity:1294–1295`, when a HealthKit/Garmin dup is merged onto an existing row): awaits `compute-workout-summary` then `compute-facts` — but **skips `compute-workout-analysis`** in between, so `computed.analysis` is not refreshed and the facts read a stale/absent analysis block.

### 1d. The one path that already does it right

**`recompute-workout` (user-triggered) is the correct template.** It awaits the chain in dependency order:

```
compute-workout-analysis  AWAIT  :88
compute-facts             AWAIT  :103
analyze-{sport}           AWAIT  :122
compute-snapshot          AWAIT  :137   (explicit, week_start-keyed)
```

`ManualSwimEntry.tsx:70`, `MobileSummary.tsx:98`, `CompletedTab.tsx:420`, `useWorkouts.ts` all already route through it. **The fix is largely: make ingest's post-processing use this shape.** (It starts at analysis because a recompute assumes `computed.overall` already exists; a fresh ingest must run `compute-workout-summary` first.)

---

## 2. The wrong awaits, and the concrete symptom of each

### The two named in the banner — CONFIRMED

**W1 — `compute-facts` races `computed`.** compute-facts is *awaited* (`:1582`) but reads `w.computed` (single SELECT, `compute-facts:1514`, no wait/retry). `computed` is written by summary (`:1508`) and analysis (`:1521`), both *fire-and-forget*. The two awaits in between (workload, adaptation) buy some time but guarantee nothing. When facts wins the race, it reads `computed?.overall ?? {}` and silently produces **partial facts**: no `execution_score` (from `computed.overall`), no `time_in_zone` / `hr_drift_pct` (from `computed.analysis`), no `intervals_hit` (from `computed.intervals`). No error, no log, no retry.
**Symptom:** on the freshly-synced workout, Details/State can show a blank execution score, missing time-in-zone, missing HR drift. Fixed forever for that workout unless something re-runs the chain.

**W2 — `compute-snapshot` reads `workout_analysis` written after it.** compute-facts fires compute-snapshot (`:1848`) before `analyze-{sport}` has run (`analyze` is fired later, at ingest `:1624`, fire-and-forget). compute-snapshot reads the current workout's `workout_analysis` for `bike_fitness_v1.{w20,hr_at_band,in_band_s,band_hi}` (`compute-snapshot:695–699`), run `heart_rate_summary` + `classified_type` (`:708–711`, `:819–820`). Those are written by `analyze-{sport}`.
**Symptom (one workout behind, by construction):** the week snapshot the athlete sees right after a sync **excludes the analysis-derived signals of the workout they just did** — bike efficiency (w20/hr-at-band) for a ride; the run's decoupling-confounded gate and classified_type for a run. It catches up only on the next trigger (next sync, or a manual recompute). This is exactly the surface the just-shipped fitness band (D-293/294/295) sits on.
> Note: the run durability *route* substrate is NOT one-behind — `route_progress_metrics` is written inside compute-facts (`:821`,`:837`) **before** it fires snapshot. Only the `workout_analysis`-sourced parts lag.

### Findings the trace added — report as findings, not folded into the fix

**F3 (new) — `compute-facts` unconditionally fires `compute-snapshot`, so any orchestrator fights its own trigger.** `compute-facts:1848` always fires snapshot fire-and-forget. `recompute-workout` *also* awaits an explicit snapshot at its end (`:137`) — so on the correct path, **two snapshot writes race**: the internal one (fired earlier, before analyze finished → one-behind data) can land *after* the explicit correct one and clobber it. Both upsert the same `user_id,week_start` row; there is no version guard. Self-heals next trigger, but it means "call snapshot after analyze" is not sufficient on its own — the internal trigger has to be suppressed or made order-safe. **This will bite the ingest fix the same way it can bite recompute today.**

**F4 (new, sharpens the orphan-path item) — the merge-existing path skips analysis.** `ingest-activity:1294–1295` refreshes summary+facts but not `compute-workout-analysis`, so `time_in_zone`/`hr_drift` (analysis-sourced) go stale on a merged workout even though facts re-ran. Distinct from the two orphan functions.

**F5 (worth checking during the fix) — `compute-adaptation-metrics` is awaited (`:1560`) before facts; if it reads `computed`, it shares W1's race.** Not confirmed as a consumer of `computed` in this pass — flagged, not asserted.

**No advisory lock on the spine jobs.** `compute-workout-summary` and `compute-workout-analysis` each take an advisory lock (dedup of the *same* job). `compute-facts`, `compute-snapshot`, `calculate-workload` have **none** — nothing serializes a facts run against a concurrent snapshot, or two snapshots for the same week. This is why F3's clobber is possible.

---

## 3. The costs, stated for ruling

### 3a. Latency — what correct ordering serializes

**Reasoned, not measured.** (A hard number needs a prod timing pass, which needs your go-ahead; I did not query prod.)

Today ingest's *awaited* critical path is: auto-attach + workload + adaptation + facts + cache + (milestone) pipeline. Summary, analysis, analyze, and snapshot are fire-and-forget — ingest returns without them. **And the webhook awaits ingest**: `strava-webhook:588` and `garmin-webhook-activities:601` both `await fetch(ingest)`, so ingest latency is the webhook's ack latency.

A correct serial order adds **summary → analysis → analyze → snapshot** to the path. The heavy ones: summary and analysis each normalize thousands of sensor samples (2000+ line functions); **`analyze-{sport}` makes an LLM narrative call.** Reasoned per-step: summary ~1–4s, analysis ~1–4s, analyze ~3–10s (LLM-dominated), snapshot ~1–3s.

- **Estimated ingest today:** ~2–5s (awaited portion).
- **Estimated if the full chain is serialized inline in ingest:** ~10–25s.

That range risks provider webhook timeouts. **Implication for the ruling:** don't serialize the chain *inside the webhook-blocking ingest call*. Decouple it — ingest fire-and-forgets a single orchestrator (the `recompute-workout` shape) that awaits the ordered chain; the webhook acks fast. Correctness comes from *ordering within the orchestrator*, not from *awaiting the orchestrator in ingest*. This keeps webhook latency roughly where it is.

### 3b. Failure semantics — proposal per job (these are the decisions for ruling)

Today every fire-and-forget failure is silent. Under an awaited orchestrator, each step needs a stated policy. The invariant I'd propose first: **the workout-row upsert must never be gated on post-processing** — it commits first, always; the orchestrator is separate and cannot lose the row. The app already has `summary_status` / `analysis_status` / `metrics_status` columns (set 'pending' at `ingest:1470`) — the proposal leans on those as the *loud* channel instead of throwing.

| Job | Proposed policy | Why |
|-----|-----------------|-----|
| compute-workout-summary | Retry ×1; on final fail set `summary_status='failed'` and STOP the chain | Everything downstream reads `computed`; a partial chain is worse than a marked failure |
| compute-workout-analysis | Retry ×1; on fail mark `analysis_status='failed'`, CONTINUE to facts with partial | analysis is degradable (drift/zones absent) but facts/grades still useful |
| compute-facts | Retry ×1; on fail mark `metrics_status='failed'` and surface | this is the spine gate — silent failure here is the whole "invisible to State" disease |
| analyze-{sport} | Retry ×1 (LLM flakes); non-fatal to facts (already written); mark `analysis_status` | narrative/grades can lag a beat without corrupting the spine |
| compute-snapshot | Retry ×1; non-fatal; self-heals next ingest; mark a status | aggregate, idempotent, cheap to redo |

Open question for you: **loud how?** Status columns only (no user-facing surface yet), or a visible "processing / retry" state on the workout card. Status-columns-only is the minimal honest version.

### 3c. The two orphan paths — what newly fires, and what downstream assumes

Wiring `ingest-phone-workout` and `save-imported-workout` into the spine means `compute-facts`, `calculate-workload`, `analyze-{sport}`, `adapt-plan` auto, and `compute-snapshot` all fire on workouts that never triggered them. Enumerated blast radius:

1. **ACWR jumps.** `workload_actual` starts populating for these workouts. Today they contribute 0 to ACWR while (per the standing finding) still counting toward `workload_total` — so the same snapshot row can already contradict itself. The moment the fix ships, past+future phone/imported workouts begin contributing → the athlete's load ratio *changes*. **Ruling owed: forward-only, or backfill `workload_actual` for historical phone/imported rows?** A bulk backfill re-triggers snapshot recomputes across many weeks (cost + load spike).
2. **`adapt-plan` action=auto newly fires on manual entries.** It silently re-prices strength loads off the `exercise_log` e1RM trend on every ingest. A manually logged lift would now drive auto-progression/deload. **Ruling owed: should manual/imported entries drive auto-adaptation at all?** (This intersects the Phase 4 "adapt-plan: one writer, athlete gets the choice" item.)
3. **State/Arc/coach change.** These workouts' facts enter the week aggregate → the fitness band, posture, adherence all shift. For `save-imported-workout` (historical bulk imports) this can fan a snapshot recompute across the whole imported history.
4. **Strength substrate.** Phone-logged strength → `session_load` + `exercise_log` rows → the e1RM trend adapt-plan reads newly includes hand-entered work.

**Cheapest safe wiring** (matches the existing workaround): have both orphan paths call `recompute-workout` after insert (as `ManualSwimEntry` already does), rather than re-implementing the fan-out — one code path, inherits the ordering fix for free.

---

## 4. Verification design (for the eventual fix)

Per the house method: **prove on deno fixtures first, keep the bug cases as permanent regressions, one Michael-driven device acceptance run at the end.** Do not verify on prod as the primary method.

- **(a) No race loss.** Replay the ingest chain for a real run fixture; assert `workout_facts` for that workout has non-null `execution_score`, `time_in_zone`, `hr_drift_pct`, `intervals_hit` (as applicable to type), and that each matches the corresponding `computed.*` source. Fixture becomes a permanent regression for W1.
- **(b) Snapshot current to THAT workout.** After the chain, assert the week's `athlete_snapshot` reflects the just-processed workout's analysis signals — a ride's `bike_fitness_v1.w20`, a run's `heart_rate_summary`/`classified_type` — i.e. the newest included ride/run is the one just synced, not the prior one. Regression for W2.
- **(c) Orphan paths reach the spine.** One phone-logged and one imported workout each: assert `workout_facts` rows exist and `athlete_snapshot` updated for each. Regressions for the two orphan functions.
- **(d) Idempotency.** Run the chain **≥3 times back-to-back** on the same workout (not once — `analyze-{sport}` has an LLM narrative, so a single clean pass is not evidence). Assert `route_progress_metrics` (now `UNIQUE(workout_id)`), `session_load`, `exercise_log`, and `athlete_snapshot` (upsert on `user_id,week_start`) do not duplicate and converge to the same values across all runs. Explicitly exercise F3: confirm the final snapshot is the *post-analyze* one, never the one-behind internal trigger.
- **Acceptance:** one real Garmin/Strava sync, you watching State — the just-synced workout's execution score, time-in-zone, HR drift, and its contribution to the fitness band all present on first look.

---

## 5. Active-corruption check (§5 of the work order)

**No finding rises to "cannot wait for the ruling."** Every issue here is data *absence* (partial facts) or *staleness* (snapshot one-behind, F3 clobber), and every one self-heals on the next ingest or a manual recompute. The workout row itself is never corrupted. Safe to hold for rulings.

---

## Rulings owed before any fix block is written

- **3a — latency:** confirm the decouple (ingest fire-and-forgets an ordered orchestrator; webhook stays fast) vs. inline serialization. Want a measured prod timing pass first? (needs a go-ahead.)
- **3b — failure semantics:** approve the per-job retry/continue/stop table, and choose the "loud" channel (status columns only vs. a visible processing state).
- **3c — orphan paths:** forward-only vs. backfill for `workload_actual`; and whether manual/imported entries may drive `adapt-plan` auto.

Plus a decision on **F3**: suppress `compute-facts`' internal snapshot trigger when an orchestrator owns ordering (add a `skip_snapshot` flag), or gate snapshot writes with a version/order guard. This also removes the latent clobber in today's `recompute-workout`.

---

# FIX BLOCK (approved 2026-07-17)

Built on the four rulings: **(1)** orchestrator, no timing pass, `recompute-workout` as the canonical shape; **(2)** a failed job halts only what reads its write, bounded retries, status columns are truth + one minimal client "analysis pending" state; **(3)** orphan paths forward-only, no adapt-plan drive yet; **(4/F3)** version guard non-negotiable, skip flag as an added optimization; **F4** folds into the orchestrator or is reported.

## The shape: one canonical orchestrator, `recompute-workout` extended

The whole audit is "stop making copies that drift." So the fix does **not** add a parallel orchestrator. The ordered chain lives in exactly one place — **`recompute-workout` becomes the canonical post-process orchestrator** — and every entry path fire-and-forgets it. It is already the proven serial shape; three changes make it cover ingest:

1. **Add step 0 (`compute-workout-summary`) + auto-attach**, gated by `include_summary` (default true). Today recompute starts at analysis because it assumes `computed.overall` exists; a fresh ingest doesn't. Running summary is idempotent (it re-normalizes `sensor_data`), so this is strictly-more-correct for existing recompute callers too.
2. **Add a trusted service-role caller path (rider 1 — two doors, one hardened).** Recompute today requires a user JWT and validates ownership (`recompute-workout:52–83`). Ingest runs as service role and cannot present a user token. Add a door that **explicitly verifies the bearer equals the service-role key** (constant-time compare) and requires an explicit `user_id` in the body — it is NOT "skip the JWT check when the token is absent/unrecognized." Anything that is neither a valid user JWT nor the exact service key is **rejected**. The user-JWT external gate stays **byte-identical** (`:52–83` untouched). This function is now invokable by every ingest path, so its auth gets its own test: an unauthenticated / non-service / wrong-key call must 401.
3. **Own the ordering end to end**, with the failure policy and the snapshot version guard below.

### Canonical order (serial; the orchestrator awaits each step)

```
0  auto-attach-planned          (planned_id before adherence/analysis)   [idempotent]
1  compute-workout-summary      writes computed.overall/intervals        [include_summary]
2  compute-workout-analysis     writes computed.analysis
3  calculate-workload           writes workload_actual (ACWR; before snapshot)
   compute-adaptation-metrics   reads computed → MUST follow 1+2 (fixes F5 for free)
4  compute-facts  {skip_snapshot:true}   writes facts, route_progress_metrics, session_load; fires match-cores
5  analyze-{sport}-workout      writes workout_analysis
6  compute-snapshot  {source_watermark: <captured after step 5>}
7  invalidateUserTrainingCache
```

Step 3's two jobs are independent of each other; run sequentially for simplicity or parallel if we want the ms. Everything else is a hard dependency edge. **F5 is fixed for free**: adaptation reads `computed` (`compute-adaptation-metrics:157`) and, in the serial chain, always runs after summary+analysis — its race disappears without a dedicated fix.

## Entry-path wiring

- **`ingest-activity`** — delete the scattered block (`:1470–1647`: the separate summary/analysis fire-and-forgets, the awaited workload/adaptation/facts, the analyze fire-and-forget). Replace with: keep the workout-row upsert and status-column init, then **fire-and-forget one call to `recompute-workout`** (`{workout_id, user_id, include_summary:true}`, service key). The webhook ack stays fast — ingest awaits nothing in the chain. Auto-attach moves into the orchestrator (step 0), so ingest's separate await at `:1482` is removed.
- **Merge-existing path (`ingest-activity:1294–1295`, F4)** — replace the two awaited invokes with the same fire-and-forget orchestrator call. This swallows F4: the merged workout now re-runs analysis, not just summary+facts. No silent exception needed.
- **`ingest-phone-workout:292`** and **`save-imported-workout:196`** — after the row is written, fire-and-forget `recompute-workout` (exactly as `ManualSwimEntry.tsx:70` already does). Forward-only; these workouts now reach facts → snapshot → State. **They do NOT drive adapt-plan** — see the guard below.

## Failure semantics (ruling 2, made concrete)

Governing rule: **a failed step halts only the steps that read its write; independent branches continue. Retries bounded to ×1 (transient-shaped failures only). The workout row is committed before the orchestrator runs and is never at risk.**

| Step | On failure | Halts | Status written |
|------|-----------|-------|----------------|
| summary | retry ×1 → stop | everything (all read `computed`) | `summary_status='failed'` |
| analysis | retry ×1 → continue | nothing hard (drift/zones degrade) | `analysis_status='failed'` |
| workload | retry ×1 → continue | snapshot ACWR band only (degrades) | — (log) |
| adaptation | no retry → continue | nothing | — (log) |
| facts | retry ×1 → stop | analyze-relevant + snapshot | `metrics_status='failed'` |
| analyze | retry ×1 → continue | snapshot one-behind (self-heals) | `analysis_status='failed'` |
| snapshot | retry ×1 → continue | State staleness (self-heals) | — (log) |

**adapt-plan** stays where it is in ingest (fire-and-forget, after the orchestrator call, Garmin/Strava only) — it is explicitly **not** added to the orphan paths' chain (ruling 3).

## The version guard (F3) — the structural fix

**Migration (gated; applied via SQL editor, never `db push`):**
```sql
ALTER TABLE athlete_snapshot ADD COLUMN IF NOT EXISTS input_watermark timestamptz;
COMMENT ON COLUMN athlete_snapshot.input_watermark IS
  'Wall-clock at which THIS snapshot''s inputs were assembled (the moment the producing chain finished its analyze step, or now() for a direct caller). "Fresher" == larger input_watermark. A write refuses to overwrite a row assembled from newer inputs. Derived in exactly one place: deriveSnapshotWatermark().';
```

**Watermark defined ONCE (rider 2).** *Fresher* = **input-assembly wall-clock**: the instant the producing computation's inputs were complete. The orchestrator captures it right after step 5 (`analyze` done) and passes `source_watermark`; a direct caller that passes none defaults to `now()` at compute-snapshot entry. This is computed by a single helper — `deriveSnapshotWatermark(body)` in `compute-snapshot` — that both the writer (the value it stamps into the row) and the guard (the value it compares) call. **No second definition exists anywhere.** The column comment above restates it verbatim so a future reader can't invent a different "fresh." *(Chosen over "latest workout timestamp in the set" — that tracks activity time, not processing freshness, so a re-analyze wouldn't bump it — and over a monotonic sequence, which needs a counter row and is overkill for a single-region single-user app. If clock skew ever bites, the upgrade path is a per-`(user_id,week_start)` sequence behind the same helper.)*

**`compute-snapshot`:** accept optional `source_watermark`; stamp `input_watermark = deriveSnapshotWatermark(body)` into the payload. **The guard is a `BEFORE UPDATE` trigger on `athlete_snapshot`**, not an app-level compare-and-set — so the existing `.upsert()` at `compute-snapshot:~978` is left byte-identical (only the payload gains one field), and the guard enforces at the DB, row-locked and race-proof, on **every** writer including ones that never heard of it. The trigger: if `OLD.input_watermark` and `NEW.input_watermark` are both non-null and `NEW < OLD`, `RETURN OLD` (refuse — keep the fresher row); else proceed. INSERTs (new week rows) don't fire it. This is strictly better than a WHERE-on-conflict (which supabase-js can't express) or a 30-column `merge_snapshot` RPC.

**`compute-facts`:** add a `skip_snapshot` flag threaded exactly like the existing `dry_run` (`compute-facts:1498,1857`). When the orchestrator owns ordering it passes `skip_snapshot:true`, so the internal one-behind trigger at `:1848` never fires. The guard is the backstop; the flag saves the wasted duplicate compute. Both, per ruling 4.

The orchestrator captures `source_watermark` immediately after step 5 (`analyze` complete) and passes it to step 6 — so the post-analyze snapshot always carries the freshest watermark and wins.

## Client — one minimal "analysis pending" state (ruling 2)

**Server signal shipped; client numeric-gate DEFERRED with reason (build finding, 2026-07-17).** `compute-facts` now flips `metrics_status='complete'` when facts are written (it was a dead column — inited to `pending`, never advanced), giving the client a precise "the numbers exist now" signal. **But `metrics_status` is not threaded to the client today** (not in `useWorkouts`/`AppContext` selects), and gating the numeric block on it hits a real trap: **historical workouts have `metrics_status = null`** (predating the column) with valid data — a naive `!== 'complete'` gate would hide their numbers forever. And `CompletedTab` already renders one honest in-flight state (the "Processing workout data…" spinner, gated on `computed.analysis.series` absence) that covers the visible ingest window.

Since the **server ordering fix removes the root cause** (facts now always follow analysis — the partial-facts window is sub-second), the client gate is a secondary honesty layer, and doing it right means threading the column through the data hooks + handling the historical-null / `failed` states carefully on a critical file. **Deferred as a scoped follow-up** rather than smuggle a regression-prone gate into this pass. Wake-trigger: if a real in-flight workout is ever seen rendering partial numbers post-fix.

## Deploy list (every importer of every touched function/shared file)

Touched: `recompute-workout`, `ingest-activity`, `ingest-phone-workout`, `save-imported-workout`, `compute-facts`, `compute-snapshot`. Plus the migration. Before deploy, run `grep -rln` for each and redeploy all importers (the `_shared` trap). No `_shared` file is edited in this plan, which bounds the blast radius — but re-verify, since `compute-facts`/`compute-snapshot` signatures change (new flags).

## Verification (deno fixtures first; ≥3 recomputes; one device acceptance)

- **(a)** run-fixture through the orchestrator → `workout_facts` has `execution_score`, `time_in_zone`, `hr_drift_pct`, `intervals_hit`, each matching its `computed.*` source. Permanent regression for W1.
- **(b)** after the chain, the week `athlete_snapshot` includes the just-processed workout's analysis signals (ride `bike_fitness_v1.w20` / run `heart_rate_summary`). Regression for W2.
- **(c)** a phone-logged and an imported fixture each produce `workout_facts` + updated snapshot. Regressions for the orphan paths.
- **(d) idempotency + F3:** run the chain **≥3× back-to-back** (analyze has an LLM narrative — one clean pass is not evidence). Assert no dup rows (`route_progress_metrics` UNIQUE(workout_id), `session_load`, `exercise_log`, snapshot upsert) and convergence.
- **(e) guard negative test (rider 3):** on real data, write a snapshot at watermark T, then fire compute-snapshot with `source_watermark = T − Δ` (a deliberately stale write) and assert the row is **REFUSED** (unchanged) — not merely that fresh writes at `T + Δ` succeed. A guard never shown refusing a stale write is trusted on faith.
- **(f) auth (rider 1):** call the orchestrator (`recompute-workout`) with (i) no token, (ii) a random non-service bearer, (iii) a user JWT for a workout the user doesn't own — assert all rejected; and (iv) the exact service key + explicit `user_id` — assert accepted.
- **Acceptance:** one real Garmin/Strava sync, Michael watching State — the just-synced workout's numbers and its fitness-band contribution present on first look; the "analysis pending" label seen and gone.

## What must not change

Everything else. No `_shared` edits, no adapt-plan behavior change, no schema change beyond the one `input_watermark` column, no touch to Q-185–Q-188. Legacy `recompute-workout` UI callers keep identical behavior (user-JWT path untouched; `include_summary` default true is the only additive change they see).

## Parked, with wake-triggers (ruling 3)

- **`workload_actual` backfill for historical phone/imported rows** — forward-only for now. *Wakes if a historical surface visibly disagrees with corrected logic.*
- **Manual/imported workouts driving `adapt-plan` auto** — parked as a trust decision above a wiring fix's pay grade. *Wakes when a real manual-heavy week visibly should have adapted the plan and didn't.*

## Build sequence

1. Migration (`input_watermark` + trigger) — **written** (`migrations/20260717_snapshot_input_watermark_guard.sql`); HOLD for Michael to apply via SQL editor.
2. ✅ `compute-snapshot`: `deriveSnapshotWatermark` (extracted to `watermark.ts`, single definition) + stamps `input_watermark`; guard is the DB trigger.
3. ✅ `compute-facts`: `skip_snapshot` flag + flips the dead `metrics_status` to `complete` on success.
4. ✅ `recompute-workout`: the orchestrator — `include_summary`, service door (pure `decideAuthDoor` in `orchestrator-lib.ts`), failure/retry policy, owns the ordered chain + snapshot watermark.
5. ✅ Rewired all four entry paths (ingest main + merge-existing, ingest-phone, save-imported) to fire-and-forget the orchestrator.
6. ⏸️ Client "analysis pending" numeric-gate — DEFERRED with reason (see the Client section); `metrics_status` made meaningful server-side.
7. ✅ **Pure-logic fixtures green — 20 tests** (`compute-snapshot/watermark.test.ts`, `recompute-workout/orchestrator-lib.test.ts`): the single-watermark definition, the guard REFUSING a stale write (e), the service door being only-a-door incl. wrong-key/missing-user_id/user-JWT (f + rider), bounded retry, routing, week-key. `recompute-workout` type-checks clean; the one `compute-snapshot` error is the pre-existing `FactRow` cast (line 334), not this change.
8. ⏳ **Live runtime verification (post-deploy, Michael's sequence):** (a) facts present on a real synced workout, (b) snapshot watermarked to THAT workout, (c) both orphan paths reaching the spine, (d) ≥3 back-to-back recomputes idempotent, (e) the guard refusing a stale write LIVE. Then device acceptance.
9. ⏳ Deploy every importer (the 6 functions); re-verify importers first.

## Fixture note — what deno CAN and cannot prove here

The deno fixtures cover the **pure logic** the rulings turn on (freshness definition, guard semantics, auth-door decision, retry bound). They deliberately do NOT fake a live Postgres + the HTTP fan-out — so (a)/(b)/(c)/(d) and the guard's LIVE refusal are the post-deploy runtime phase, not unit tests. A green fixture suite proves the decisions are right; it does not prove the chain is running on the server (the standing lesson in this repo).
