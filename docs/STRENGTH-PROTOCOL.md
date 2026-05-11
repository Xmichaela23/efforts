# Strength Protocol — Triathlon Performance

How the plan engine prescribes periodized strength for triathletes running the `triathlon_performance` protocol. Companion to `docs/SCHEDULING-RULES.md` (placement) and `docs/SWIM-PROTOCOL.md` (swim). Code: `supabase/functions/shared/strength-system/protocols/triathlon_performance.ts`.

This doc is being populated section by section as the strength architecture stabilizes. The active prescriptive section right now is §3.1.

---

## 3.1 Within-phase progression (active weeks only)

**Architecture:** within each strength phase, %1RM progresses **linearly across active training weeks only**. Recovery weeks emit through a separate session arm (`createPerfRecoverySession`) with ~10% volume + load reduction and a different exercise shape. The two arms never stack — the dispatcher's `isRecovery` check at `triathlon_performance.ts:101` short-circuits to the recovery session before the within-phase emit can run.

**Tables** (source: `BASE_PCT_TABLE`, `BUILD_PCT_TABLE`, `RACE_PCT_TABLE` in `triathlon_performance.ts`):

| Phase                  | Active week 1 | Active week 2 | Active week 3 | Active week 4 | Notes |
| ---------------------- | ------------- | ------------- | ------------- | ------------- | ----- |
| Hypertrophy (`base`)   | **65%**       | **68%**       | **70%**       | **72%**       | Deadlift, Squat, Row, Bench |
| Strength Build (`build`) | **78%**     | **80%**       | **83%**       | **85%**       | Same lifts; reps 4-6, RIR 2 |
| Maintenance + Power (`race`) | **70%** | **72%**       | **75%**       | (clamp 75%)   | Main compound only — plyo / Push Press stay flat |
| Taper Priming (`taper`)| 50-60% (single week, no progression) | — | — | — | — |
| Rebuild                | 0.90 × build source | 0.95 × build source | (clamp 1.0) | — | Source build% pinned to wip=2 (80%); ramp owned by `scaleSessionToRebuildLoads` |

`pctForActiveWeek` clamps `weekInPhase` to the last table index when the phase runs longer than the table — so a 5-week base phase emits 65/68/70/72/72.

**Index semantics.** `weekInPhase` is the absolute count from phase start. If a recovery week sits mid-phase (e.g., active W1, active W2, active W3, recovery W4, active W5), the dispatcher diverts the recovery week to the recovery session arm and the next active week still reads index W5 → clamped to the table's last entry. We don't compress the index across recovery — the table just runs out and clamps.

**Description↔delivered contract.** The session description quotes the literal %1RM emitted for that week (e.g., "Build Week 7 — Two heavy compounds only (3 working sets each, 80% 1RM)"). The exercise's `weight` field is the same `"${pct}% 1RM"` string. The materializer reads from `plan.config.athlete_snapshot` for the 1RM, so percent × 1RM × snapshot is deterministic from one point of resolution. Description ≡ delivered by construction.

**Why linear, not undulating / block.** Conservative linear progression is appropriate for hybrid endurance + strength athletes — NASM intermediate-athlete guidance and the Crawley/OMNIA hybrid methodology both default to it. We can swap models later by changing the tables; the contract (linear within phase, recovery separate, materializer single-source) stays the same.

**Secondary lifts.** Overhead Press / OHP-anchored lifts (Push Press, DB Shoulder Press) keep their original fixed %1RM (72% baseline) — they don't track the main compound progression because shoulder mechanics tolerate a different curve. Plyometric exercises in the race phase rotation (Box Jumps, Broad Jumps, KB Swings) stay flat — they have no %1RM and progression there is rep / contact quality, not load.

**Rebuild.** Rebuild reads the build phase's "default" source % (pinned to wip=2 in `BUILD_PCT_TABLE` → 80% 1RM). The actual rebuild ramp comes from `scaleSessionToRebuildLoads` reading the rebuild phase's own wip: 0.90 factor at W1, 0.95 at W2 (capped at 1.0). This decouples rebuild loads from within-phase build progression so the rebuild emit stays load-neutral across changes to the build table. Per-week math for 150 lb deadlift 1RM: W1 = 80% × 0.90 = 72% → 110 lb; W2 = 80% × 0.95 = 76% → 115 lb.
