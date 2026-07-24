# TARGET-ARCHITECTURE — the north star

**What this is.** The destination every change is aimed at. Not the current state (`TRUTH-MAP.md`), not the laws (`CONSTITUTION.md`) — **the shape the app is being built toward.** The yardstick: *if a change doesn't move a discipline (or the client) toward this, don't make it.* Read this before designing anything.

**Why it exists.** The app got fragmented by features built one at a time in a vacuum, each minting its own calculation. This doc is the target that stops that — so every fix is a step toward one architecture instead of another patch away from it.

---

## The goal, in one line

**A living, coherent, steerable training system — deterministic, smart-server / dumb-client, single source of truth.**

## The three non-negotiable principles (the backbone)

1. **Deterministic.** Every fact, verdict, and prescription is computed by deterministic math on the server. The LLM only *narrates* settled facts — it never computes or alters one. (Constitution Law 2/4.)
2. **Smart server, dumb client.** The server computes everything; the client **renders and nothing else** — zero math on truth. No client-side trend, verdict, breakdown, or re-derivation. *(Current violations to retire: `useStateTrends` computes per-discipline trends live in the browser; `LoadBar` re-derives the load breakdown; `useCoachWeekContext` re-implements a divergence calc.)*
3. **Single source of truth.** Each fact is computed **once, in one place.** Every surface reads that one place. (Constitution Law 1/5.)

## The four parts of the destination

1. **One truth, every screen.** Dashboard, the workout you tap, baselines, record — every number agrees, every number traces to one source, no screen contradicts another.
2. **Living baselines.** Baselines aren't frozen numbers typed once — they **move as you train**, per discipline. The app learns your real FTP / pace / CSS / strength and the number tracks the actual you.
3. **Steerable plans.** At **any stage** of a plan you can push **any single discipline** harder or easier — bump the bike without touching the run — and the app absorbs it coherently: adjusts, explains why, never breaks the plan's structure.
4. **History-aware plan building.** The plan builder reads your **full history + your live baselines** before it builds — never in a vacuum, always from the same one-truth every screen reads.

## The architecture that delivers it

- **One brain per fact** — server-side, deterministic. Fitness direction, load, effort, per-lift strength: each computed once.
- **Screens are windows, not calculators** — every surface renders the server's answer; none does its own math.
- **One resolver per baseline** — FTP, 1RM, CSS, thresholds each have exactly one function that decides the value, and that resolver is where "typed vs live" is settled (see Living Baselines).
- **The Arc reads the spine, wraps context around it, never competes** — it assembles goals/plan/memory/projections around the one per-discipline truth; it does not re-derive verdicts.

## The two proven templates (we already have them — copy them)

- **RUN = the fact model.** One authority (the spine's decoupling), computed once, every surface reads it, the old duplicate was deliberately deleted (D-239). This is what strength/bike/swim must become.
- **`resolveStrengthCapacity` = the resolver model.** One function owns the 1RM anchor; typed wins today. **To evolve:** the resolver stays the single owner, but the **live/learned value must be able to lead** as fitness moves (Living Baselines) — the deliberate version of what the FTP fracture does by accident.

## Living baselines — the resolver's job

Each anchor has one resolver. The resolver decides how much the **live (learned) value leads the typed one**, per discipline, and every consumer reads the resolver's output — never the raw column. The value **tracks the athlete as they train**. This is a deliberate, per-anchor decision (how fast live leads, when a stale typed value is overridden) — settled in the resolver, never by accident across screens.

## Steerable plans

A user adjustment to one discipline, at any stage, in either direction, flows through **one adaptation path**: it re-materializes the plan coherently, is explained ("you eased the bike this week"), respects the plan's structure and the interference model, and every screen reflects it because they all read the one truth. State changes the plan; the change is legible (Self-Awareness Axis 5).

> **First built slice — STRENGTH (2026-07-23, D-315).** The "adapt a plan" strength track is the first of this destination actually built + deployed + burner-verified: phase+lift-aware RIR (one stamped target the logger, analyzer, and State verdict all read), reversible swap + add on `plan_adjustments`, and consent-first weights (no silent auto-changes). Every edit writes through `adapt-plan`/`materialize-plan` and reads the spine — the one adaptation path, exactly as above. **The loading model, RIR model, frequency cap, and swap grouping are grounded + verified — the receipts ledger is in `CONCEPT-adapt-plan-strength.md`.** Run/bike/swim clone this pattern next; the refine-hub UI (State → per-discipline screens) is the outstanding surface.

## History-aware plan building

The plan generators read the **full picture** — history + live baselines + the spine — through the same layer everything else reads, so a generated plan is built from the same truth the app judges you against. No generator builds from partial or stale inputs. (Consolidating the four fragmented generators serves this.)

## What "done" looks like

Every discipline looks like **run does today**: one server authority, every screen agrees, the client computes nothing. Baselines track you. You can steer any discipline at any time. Plans build from your whole picture. The app tells **one coherent, living story** about you, everywhere.

## Distance from target (current — per `TRUTH-MAP.md`)

| Area | Where it is | Move toward target |
|---|---|---|
| **Run** | ✅ at target | the model — leave it, copy it |
| **Strength** | 3 engines (one client-live) | collapse to one server authority; client renders |
| **Bike** | efficiency = 2 visible engines; FTP resolver bypassed | one efficiency authority; all FTP reads through `resolveCurrentFtp` |
| **Swim** | provisional single engine, orphaned CSS, no native screen | build the read + wire CSS through its resolver |
| **Client math** | `useStateTrends`, `LoadBar`, divergence mirror compute on the client | move computation to the server; client renders |
| **Baselines** | typed vs learned fork (FTP live), typed-frozen (1RM) | one living resolver per anchor |
| **Plans** | 4 generators, partial history awareness | one history+baseline-aware path |

## The rule

Every change moves a discipline (or the client) toward this picture. Nothing that doesn't. Each fix is **"make X look like run."**

## The other half — the foundation must carry it
This doc is the *destination*. `FOUNDATION-READINESS.md` is whether the *foundation* can carry paying users — the scale (orchestration/cache) + security/ops hardening backlog. The two tracks run together: **cohesion** ("make X look like run") + **hardening** (close the trust boundary, fix the cache race, move compute to the server). Two blockers gate a second paying account: **B1** cross-user data exposure, **B4** no error monitoring.

## Cross-refs
`FOUNDATION-READINESS.md` (the hardening backlog) · `CONSTITUTION.md` (the laws this serves) · `TRUTH-MAP.md` (where we are vs here) · `SELF-AWARENESS-MAP.md` (the reasoning axes) · `SCREEN-CONNECTIVITY.md` (wiring)
