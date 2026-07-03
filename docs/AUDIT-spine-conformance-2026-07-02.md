# AUDIT — "Spine is truth, Arc is voice": app-wide conformance, 2026-07-02

Commissioned after the State-screen audit surfaced that the coach computes strength verdicts in parallel to the spine and blind to the typed baseline. Question: **is "spine is truth, arc is voice" (D-149/150/151) actually enforced app-wide, or is the State mess one instance of a systemic fork?** Code-derived from a 4-way parallel trace (spine definition · coach conformance · Arc/session_detail conformance · capacity fragmentation). Anchors are `file:line`.

---

## TL;DR — the one-number answer

**The spine is real and cached, the "voice" contracts read it faithfully — but the shared *coach engine* honors it for ~6% of its output.** Of the ~17 verdict families the coach emits (the numbers the State screen and Context surface actually show you), **exactly one — `fitness_direction` — reads the cached spine.** The other ~16 (readiness/FATIGUED, the strength per-lift verdict, endurance signals, load/ACWR, `body_response`, race projection, goal prediction) are re-derived from raw `workouts` / `learned_fitness` / logged sets / self-computed ACWR. The coach even **fetches spine columns it then ignores** and recomputes.

Underneath sits a second fork: **there is no canonical answer to "how strong/fast is this athlete."** Three substrates (typed `performance_numbers`, learned `learned_fitness`, raw `exercise_log`) with **inverted precedence** — the plan *prescribes* your load off the **typed** number (150) and the coach *grades* it off the **learned** number (125). You train off one number and get judged off another.

So: **"spine is truth" is ratified but operationally shallow.** D-151 unified *one* axis (fitness direction) and stopped. This is fixable without a rewrite — the machinery (spine, cache, reconcile layer) exists; the work is moving verdicts onto it and unifying the capacity resolver.

---

## 1. The yardstick — what the spine is and what was decided

- **The spine** = `athlete_snapshot` (keyed user_id + week_start), written by `compute-snapshot`. Its verdict layer is **`state_trends_v1`** — a per-discipline `{verdict, pctChange, provisional}` cache (strength/run/swim/bike, bike+swim carry nested sub-trends), computed by the shared `assembleStateTrends` **for the current week only** (`compute-snapshot/index.ts:583-673`).
- **The decision (D-151, the load-bearing one):** when the spine shipped, the coach's `fitness_direction` was converted to `rollupFitnessDirection(state_trends_v1)` and *"the old 7d-vs-28d response-model derivation was removed, not kept alongside — two coexisting fitness verdicts is exactly how contradictions survived; one truth."* Intended readers of the ONE cache: **coach, session_detail_v1 builder, arc-context** — each must *read*, not re-derive. The client `useStateTrends` is the only sanctioned re-compute, and only because it runs the *identical* `assembleStateTrends` code path (structural equality).
- **The reconcile layer** (`_shared/state-trend/reconcile.ts`) is the intended bridge between the **typed** baseline and the **learned** aggregate — it *suggests* updating the typed baseline when the learned aggregate diverges (≥3 samples, ≥5% divergence), **never auto-applies, never reads raw per-session e1RM**.

**The rule to measure against:** any consumer that re-derives a verdict instead of reading `state_trends_v1` (or its roll-up), and any place capacity is judged/prescribed off a different number than the canonical one, is a violation.

---

## 2. Conformance scoreboard

| Surface | Reads the spine? | Verdict |
|---|---|---|
| **`arc-context` (getArcContext)** | `cycling_fitness` ← snapshot ctl/atl/tsb; `state_trends_v1` ← passthrough; `fitness_verdict_divergence` ← built *on* the cached spine | ✅ **CONFORMANT** |
| **`session_detail_v1` builder** | `discipline_trend` ← `workout-detail` pre-reads `state_trends_v1`, builder passes through (no re-derive) | ✅ **CONFORMANT** |
| **client `useStateTrends` (STATE screen)** | re-computes off *live* tables — but same code path as the cache | ⚠️ **structural-equal** (freshness-skew gap between ingest and next `compute-snapshot`) |
| **coach engine** | 1 of ~17 verdict families (`fitness_direction`) | ❌ **~6% CONFORMANT** |
| **capacity truth** (strong/fast) | no canonical resolver; 3 substrates, inverted precedence | ❌ **FRAGMENTED** |

**The voice reads the spine. The brain that fills the voice doesn't.**

---

## 3. The coach engine — the ~6% (the core violation)

The coach fetches the spine row selecting `state_trends_v1, interference, intensity_distribution, acwr, rpe_trend, run_easy_pace_at_hr_trend, strength_volume_trend, strength_top_lifts` (`coach/index.ts:2713`). Of those it **consumes only `state_trends_v1` (→ `fitness_direction`)** as a verdict, plus `interference`/`intensity_distribution` as *prose facts*. **`acwr, rpe_trend, strength_volume_trend, run_easy_pace_at_hr_trend, strength_top_lifts` are SELECTed and never read** — each is recomputed from raw `workouts`.

| Coach verdict family | Substrate | Class |
|---|---|---|
| `fitness_direction` | `rollupFitnessDirection(state_trends_v1)` | ✅ SPINE |
| readiness_state / **FATIGUED** | response-model `assessment` + self-computed ACWR (`isAcwrFatiguedSignal`) — spine has no vote | ❌ PARALLEL |
| **strength `per_lift`** (best_weight / suggested_weight / verdict) | `learned_fitness.strength_1rms` + logged RIR; **never `performance_numbers` or `state_trends_v1`** | ❌ PARALLEL |
| endurance (hr_drift/execution/rpe) | `reaction.*` from raw `workouts` 7d-vs-28d | ❌ PARALLEL |
| load / ACWR | self-computed from raw `workload_actual`; **`snapshot.acwr` unused** | ❌ PARALLEL |
| `body_response` (load_status, weekly_trends) | `buildBodyResponse` from raw ledger; **persisted `body_response` never read** | ❌ PARALLEL |
| assessment / headline / visible_signals / cross_domain / cross_training_signal / training_state | downstream of the parallel response model | ❌ PARALLEL |
| race_readiness / race_finish_projection | `performance_numbers` + plan paces + parallel readiness label | ❌ PARALLEL |
| goal_prediction / block_verdict | `runGoalPredictor(parallel weekly, block)`; block reads raw workouts + baselines; **never `state_trends_v1`** | ❌ PARALLEL |

**The most actionable finding:** the coach doesn't lack the data — it **shadows** it. It recomputes its own ACWR while `snapshot.acwr` sits fetched-and-unused; recomputes `body_response` while the persisted one is ignored; recomputes strength trend while `strength_volume_trend`/`strength_top_lifts` sit unused. A large slice of the fix is literally *"read the columns you already fetch, and delete the parallel derivation"* — exactly the D-151 move, applied to the other 16 axes.

The coach **never writes** the spine (only `coach_cache` + `goals.race_readiness_projection`). It's a pure reader — that reads ~6% of what it should.

---

## 4. Capacity truth — three substrates, inverted precedence

There is no canonical "how strong/fast is this athlete." Three writers, no shared resolver:
- **Typed** `performance_numbers` (bench 150, fiveK, easyPace, ftp, pullupMaxReps) — TrainingBaselines + Q-097 StrengthLogger write-back.
- **Learned** `learned_fitness` (`strength_1rms`≈125 from logged sets via compute-facts; run paces sec/km; ride FTP) — `learn-fitness-profile`/`compute-facts`.
- **Raw** `exercise_log.estimated_1rm` — per-session.

**The inversion (the flagship):**
- **Plan PRESCRIBES off typed-first.** `materialize-plan` `mergeAnchor1RmLb` = typed > learned > default → your loads are sized off **150**.
- **Coach JUDGES off learned-first.** The strength verdict reads `learned_fitness.strength_1rms` ≈**125** and suggests `125 × 0.9 = 115`.
- So the plan loads you at 150-derived percentages while the coach tells you to *back off* a 125-derived weight already ~17% under your true max. **The number that sets your weight and the number that grades it are, by design, different numbers.** (State also renders "needs data" from the *raw* substrate beside the coach's "125→115" — a third answer.)

**Convergence is blocked until Q-097's write-back fully lands** (learned↔typed can't reconcile otherwise) — the down-write prompt we built today is part of closing that.

**Footguns the fragmentation carries** (no shared type = per-consumer discipline):
1. **`fiveK` = a 5K *time* misread as a *pace*.** TrainingBaselines writes `performance_numbers.fiveK` as a race clock ("5K Time", `25:00`); arc reads it as a total, but materialize's legacy fallback parses it as `25:00/mi`. Same key, two quantities. Latent (snapshot/effort_paces usually win) but bites a legacy plan.
2. **sec/km vs sec/mi** — `learned_fitness` is sec/km, `performance_numbers.fiveK_pace` is sec/mi. Guarded correctly *where hardened* (arc dual-string + `_unit_note`, generate-strength/run ×1.60934) but it's per-consumer, not a shared type — any new reader mislabels ~1.6×.
3. **Strength read-keys re-aliased at every read.** Q-097/D-224 canon (`squat/bench/deadlift/overheadPress1RM/pullupMaxReps`) is enforced at the *write*, but every reader carries its own alias fan (`bench_press/benchPress`, `ohp/overhead_press`, `squat1RM`) — the OHP-into-the-void risk D-224 fixed at write is re-litigated at each read, no shared canonicalizer.
4. **A fourth 5K key** (`coach/index.ts:4213` reads `five_k_pace_min_per_mi`) matching neither writer key → coach's baseline line is ~always stale.
5. **`pullupMaxReps`** (reps, Q-102) is a typed capacity no load-resolver consumes — orphaned.

---

## 5. The secondary fork — two trend vocabularies on the spine

`state_trends_v1` (the new per-discipline verdict) coexists with the **older scalar columns** (`strength_volume_trend`, `rpe_trend`, `run_easy_pace_at_hr_trend`, `ride_efficiency_factor`) still written by `compute-snapshot`. `arc-context`'s `longitudinal_signals` reads the **old scalars**, not `state_trends_v1`. Not a D-151 violation (different purpose — longitudinal patterns vs current-week verdict), but two trend representations on one spine is exactly the kind of fork the principle exists to prevent; worth collapsing or documenting the boundary.

---

## 6. Recommendation — enforce the invariant you already ratified

The good news: **the house is built; only one room is wired to the main.** The spine, the cache, the shared `assembleStateTrends`, and the `reconcile.ts` typed↔learned bridge all exist. This is a wiring job, not a rebuild. Sequenced:

1. **One canonical capacity resolver (highest value).** A single shared function — "how strong/fast is this athlete for lift/discipline X" — with ONE precedence: **typed `performance_numbers` is the anchor**, `learned_fitness` feeds the *trend* and the reconcile *suggestion*, raw is never truth. **Both** `materialize` (prescribe) and the coach (judge) call it. Collapses the 150-vs-125 inversion, the State strength contradiction (audit H1/H3), and folds the key-alias/unit footguns into one canonicalizer. *This is the same "score that lies" family as the entire Q-097 arc.*
2. **Move coach verdicts onto the spine, axis by axis — start with "read the columns you already fetch."** The coach fetches `acwr`, `body_response`, `strength_volume_trend`, `strength_top_lifts` and ignores them. For each: read the cached column, delete the parallel derivation (the D-151 move). Order by athlete-visibility: readiness/FATIGUED and the strength verdict first (they're the ones misrepresenting today).
3. **Finish Q-097's write-back** so learned↔typed converge (in progress — today's down-write is part of it).
4. **Collapse the vestigial scalar trend columns** (or make `longitudinal_signals` read `state_trends_v1`) — one trend vocabulary.
5. **A shared capacity/pace type** carrying units + canonical keys, so the sec/km-vs-sec/mi and alias footguns can't recur per-consumer.

**Framing for the target state:** the coach should be a *narrator of the spine*, not a *parallel reasoner*. Today it reasons in parallel for 94% of what it says. Every axis moved onto the spine is one fewer way the app can tell you two different stories about yourself at the same moment — which is the exact failure D-149 was written to end.

---

## 7. Sequenced fix list

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | **Canonical capacity resolver** (typed-anchored; prescribe & judge call it) | collapses 150-vs-125 app-wide + State H1/H3 + key/unit footguns | large |
| 2 | Coach readiness + strength verdicts → read the spine (`state_trends_v1`, `body_response`, `acwr`); retire parallel derivations | kills the two most-visible misrepresentations | med (per axis) |
| 3 | Close Q-097 write-back (learned↔typed convergence) | unblocks #1's reconciliation | small (in progress) |
| 4 | Collapse remaining coach verdicts onto the spine (load, endurance, cross-domain, goal-pred) | full "spine is truth" for the coach | large, incremental |
| 5 | Collapse vestigial scalar-trend columns / one trend vocabulary | removes the second fork | small |
| 6 | Shared capacity/pace type (units + canonical keys) | prevents footgun recurrence | med |

**The one to start with:** #1 (or #2 for the athlete-facing win first). Both are the "spine is truth" principle applied where it currently isn't — and #1 is the systemic root of the bench bug you caught, generalized to every capacity number in the app.
