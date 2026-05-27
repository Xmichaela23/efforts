# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Identity

Efforts is a hybrid endurance + strength training app for intermediate athletes (runners, cyclists, triathletes) who want to integrate strength training into their endurance training. It is **not** a triathlon-only app. Strength is always present — core to every athlete profile, not an add-on. Race goal is optional. The engine manages interference between endurance and strength automatically. See `docs/PRODUCT-POSITIONING.md` for the full product identity.

## Project

**Efforts** — hybrid endurance + strength training app (run / cycling / triathlon / duathlon + integrated strength). React + TypeScript on Vite/Netlify; Supabase (Postgres + Deno edge functions); iOS via Capacitor.

## Context-priming for new sessions

Before doing any non-trivial work, read these in order — they prevent re-litigating settled choices and re-discovering already-filed bugs:

1. **`docs/ENGINE-STATE.md`** — current state. Three sections: Solid (don't re-litigate), Known broken (filed, not blocking), Questioned (worth verifying). If you think one of the Solid items is broken, the bug is probably elsewhere — read the verification method before changing anything.
2. **`docs/DECISIONS-LOG.md`** — why things are the way they are. Numbered D-NNN. Records non-obvious design choices, coefficients picked deliberately, architectural patterns rejected. If you're about to reverse one of these, find the entry first and either supersede it explicitly (new D-NNN) or talk to the human.
3. **`docs/OPEN-QUESTIONS.md`** — don't "fix" intentional behaviors. Numbered Q-NNN. Tagged cosmetic / intentional / unverified. The point of this doc is to stop the next session from "fixing" something that someone already considered and chose to leave.
4. **`docs/POLISH-PUNCH-LIST.md`** — work queue. Read after the three above, since the punch list assumes the context they provide.

## Commands

```bash
npm run dev            # Vite dev server, port 8080 (Garmin OAuth proxy)
npm run build          # Production build → dist/
npm run lint           # ESLint
npm run bake[:all]     # Bake library plans (scripts/bake-*.mjs)
npm run plan:validate  # Validate library plan JSON
npm run ios            # build + cap sync ios

# Edge functions (project ref yyriamwvtvzlkumqrvpm)
supabase functions deploy <name> [<name> ...] --project-ref yyriamwvtvzlkumqrvpm
```

No `npm test`. Some `*.test.ts` / `*.contract.test.ts` live under `supabase/functions/_shared/` and run with `deno test`.

## Deploy policy (the user does NOT deploy)

After any change that affects production, ship it: deploy every edge function you touched plus its callers, and `git push origin main` (Netlify auto-deploys). Don't end a task with "you should deploy."

## End-of-session protocol

Before any session ends — when the human says "we're done," "closing the laptop," "good for today," "stopping here," or any equivalent — Claude Code MUST:

1. Propose updates to `docs/ENGINE-STATE.md`, `docs/DECISIONS-LOG.md`, and `docs/OPEN-QUESTIONS.md` based on what shipped this session:
   - **ENGINE-STATE.md:** new fixes go to **Solid** (with file paths + verification method); new known-broken bugs go to **Known broken** (with deferred-reason); new unverified claims go to **Questioned** (with verification approach).
   - **DECISIONS-LOG.md:** new D-NNN entry per non-trivial design choice — coefficient picked deliberately, alternative pattern rejected, scoping call made.
   - **OPEN-QUESTIONS.md:** new Q-NNN entry per behavior that was noticed and intentionally left, or per bug deferred with a reason.
2. Show the proposed diff.
3. Wait for human approval.
4. Commit + push as `docs: end-of-session context update for YYYY-MM-DD`.

Also update `docs/POLISH-PUNCH-LIST.md` if items closed (mark `[x]` with date) or new items were added during the session.

If the human ends the session without triggering this, prompt before stopping:

> "Before you go — should I update the context docs with what we shipped today?"

This is the institutional-memory backbone. The next session reads what this session writes.

## Topology

### Ingest is the orchestrator

`supabase/functions/analyze-workout/` is **empty**. Real fan-out lives in `ingest-activity/index.ts:~1430-1580`. Per ingest, ~8 things happen (mostly fire-and-forget):

- `compute-facts` (writes `workout_facts`, `exercise_log`, `session_load`)
- Invalidate `block_adaptation_cache` and `coach_cache` rows for the user
- Route to `analyze-{running,cycling,strength,swim}-workout` (NOT `analyze-swimming-workout`)
- `adapt-plan` action=auto (auto strength/endurance progression; safe-as-no-op because activity ingest doesn't mutate plan JSON — break this assumption and adapt-plan starts mis-firing silently)
- Milestone-gated `post-import-athlete-pipeline` (memory + snapshot warm-up)

Routing also exists in `recompute-workout/index.ts:21-25` and `bulk-reanalyze-workouts/index.ts:40-50`. Any new cache or downstream system MUST register here or it goes stale.

### Four storage layers for "what we know about a workout"

These are not interchangeable. Different consumers; partial overlap.

- `workouts.computed` (JSONB) — sensor-derived intervals/series; written by `compute-workout-summary`.
- `workouts.workout_analysis` (JSONB) — analyzer output (adherence, grades); written by `analyze-{sport}-workout`.
- `workout_facts` (table) — deterministic per-workout facts (no AI, pure math); written by `compute-facts`.
- `athlete_snapshot` (table, keyed by `user_id` + `week_start`) — weekly aggregate of facts + exercise_log; written by `compute-snapshot`. This is the substrate `getArcContext` reads from.

Plus secondary state: `coach_cache`, `block_adaptation_cache`, `session_load`, `exercise_log`, `plan_adjustments`, `athlete_memory`, `user_baselines.{performance_numbers,athlete_identity,learned_fitness}`.

### `session_detail_v1` is a fully pre-formatted display contract

Type at `supabase/functions/_shared/session-detail/types.ts` (~377 lines, ~30 nested fields). Built by `workout-detail/index.ts:598` from an athlete-snapshot slice + `workout_analysis` via `_shared/session-detail/build.ts` (1276 lines). Client renders verbatim.

### Scheduling: optimizer is the sole authority

After the 2026-05-09 consolidation, `_shared/week-optimizer.ts` owns every "what day does X go on" decision. `generate-combined-plan/week-builder.ts` reads day assignments from `AthleteState` fields populated by `reconcile-athlete-state-week-optimizer.ts` and only generates session content (intervals, paces, durations, flavor by phase, brick targets, swim templates). The reconciler now runs unconditionally inside `generate-combined-plan/index.ts`; it self-short-circuits when `long_run_day` is missing, in which case the builder's minimal legacy strength fallback fires for that contained edge case.

The same-day matrix is in `_shared/schedule-session-constraints.ts` (`ROWS` table around lines 47-58); sequential rules + placement live in `week-optimizer.ts` (`sequentialOk`, `canPlaceWithModifier`, `deriveOptimalWeek`). Spec: `docs/SCHEDULING-RULES.md`. Descriptive snapshot of current code: `docs/SCHEDULING-RULES-EXTRACTED.md`.

Other plan generators (`generate-run-plan`, `generate-triathlon-plan`, `generate-plan`) **do not yet route through the optimizer** — they are separate edge functions with their own pipelines. Wiring them is explicitly scoped out of the consolidation pass and is a follow-up.

### Plan generation is fragmented

Four generators with overlapping logic: `generate-combined-plan/` (multi-sport, the most active surface — has its own `phase-structure`, `week-builder`, `validator`, `validate-training-floors`, `science`, `swim-protocol-v21`), `generate-triathlon-plan`, `generate-run-plan`, `generate-plan`. Wrapper: `create-goal-and-materialize-plan`. They share `PlanContractV1` (defined in `generate-run-plan/types.ts:184` despite the name).

### "Smart server, dumb client" is a calendar invariant, not a universal rule

`get-week` is the only path for calendar data — never query `planned_workouts` / `workouts` directly for calendar reads. Other surfaces DO query tables directly today (don't "fix" them without a reason): `useWorkouts.ts:231`, `usePlannedWorkouts.ts`, `usePlannedWorkoutLink.ts`, `AppContext.tsx:834`, `AthleticRecordPage.tsx:102`, `PostWorkoutFeedback.tsx`, `AssociatePlannedDialog.tsx`, `StrengthCompareTable.tsx`, `AllPlansInterface.tsx`. Treat the principle as: client never re-derives planned-vs-executed adherence; client never merges the two tables for the calendar.

### The Arc

`getArcContext()` (`_shared/arc-context.ts`, 1028 lines) assembles goals + race courses + plan position + identity + learned fitness + memory + longitudinal signals + projections + gear. It reads from `athlete_snapshot` plus inferred layers. "Extending the Arc" usually means extending the snapshot AND `arc-context.ts` (and often a backfill).

### Pace-unit footgun

`learned_fitness` stores run paces as **sec/km**; `performance_numbers.fiveK_pace` is **sec/mi**; old (`fiveK_pace`) and new (`fiveK`) shapes coexist in `performance_numbers`. `arc-context.ts` deliberately exposes both `per_km` and `per_mile` strings with a literal `_unit_note` warning to prevent LLM mis-labeling.

## Known doc/code drifts

Audit details: `notes/docs-audit-2026-05-09.md`.

- `docs/PLAN-CONTRACT.md` is **superseded** by `docs/SCHEDULING-RULES.md` (prescriptive) + `docs/SCHEDULING-RULES-EXTRACTED.md` (descriptive). Its §5 matrix disagrees with the code matrix on 4 cells; the new docs match the code. Don't rely on `PLAN-CONTRACT.md` for placement rules.
- `APP_ARCHITECTURE.md` is broadly stale (Nov 2025): missing files, wrong function names, ~25 of 98 edge functions documented. **Verify before relying.**
- `plans.sessions_by_week` is a top-level column, not nested under `config` (despite older docs).
- `analyze-swimming-workout` doesn't exist; the function is `analyze-swim-workout`.
- `.cursor/rules/lower-body-strength-pairing.mdc:13-16` lists easy run as an allowed lower-body partner; the code matrix says `lower_body_strength × easy_run = 0`. `SCHEDULING-RULES.md §8` resolves via conditional ⚠¹; the cursor rule itself has not been reconciled (deferred).

## Critical paths use `@ts-nocheck`

27 of 286 edge files opt out of type-checking, including `get-week`, `ingest-activity`, `materialize-plan`, `generate-combined-plan`. Type errors in these surface only at runtime. Don't assume tsc has your back here.

## Load-bearing code locations

Read these before touching the corresponding subsystem:

- Session contract → `supabase/functions/_shared/session-detail/types.ts`, `build.ts`
- Schedule placement → `supabase/functions/_shared/schedule-session-constraints.ts` (matrix + sequential prose), `_shared/week-optimizer.ts` (sole authority), `generate-combined-plan/reconcile-athlete-state-week-optimizer.ts` (plumbing)
- Arc / athlete state → `supabase/functions/_shared/arc-context.ts`, `_shared/athlete-snapshot/`, `compute-snapshot/`, `compute-facts/`
- Coach (deterministic week-context engine, LLM on top) → `supabase/functions/coach/`, `coach/methodologies/`
- Plan generation → `generate-combined-plan/`, `generate-run-plan/types.ts` (`PlanContractV1`)
- Plan token expansion → `materialize-plan/`, `_shared/token-parser.ts`
- Workload → `_shared/workload.ts`, `calculate-workload/`
- Ingest fan-out → `ingest-activity/index.ts:~1430-1580`

## Conventions

- TypeScript with **strict: false** (`noImplicitAny`, `noUnusedLocals/Params` off). Don't chase warnings as a goal.
- Replace = delete the old. New file replacing existing? Delete the old and update imports same-change.
- No speculative npm deps.
- Files routinely exceed 1000 lines. The "≤400 lines, propose extraction" rule is aspirational; honor it for new files but don't auto-refactor existing ones without a reason.
- Path alias `@/*` → `./src/*` (`vite.config.ts`, `tsconfig.app.json`).
- `lib/native-fetch-shim.ts` is aliased over `@supabase/node-fetch` so iOS/WKWebView avoids the XHR polyfill.
- RLS: `auth.uid() = user_id` on user tables; webhooks use service role.

## Reference docs

- `docs/SCHEDULING-RULES.md` — **prescriptive scheduling spec** (what the engine should do, with confidence tags + override gates). Authoritative for placement rules.
- `docs/SCHEDULING-RULES-EXTRACTED.md` — descriptive snapshot of what the code currently enforces, with file:line citations. Pair with the prescriptive doc when reasoning about a rule.
- `APP_ARCHITECTURE.md` — **stale Nov 2025; verify before relying**
- `docs/PLAN-CONTRACT.md` — **superseded** by `SCHEDULING-RULES.md`; do not rely on its matrix or rules
- `DETERMINISTIC_LAYER_ARCHITECTURE.md` — mostly accurate (workout_facts model)
- `docs/adr/` — architecture decision records (0001 attach + session_detail_v1; 0002 phase block one-week-rows)
- `WORKLOAD_SYSTEM.md`, `SECURITY_RLS.md`, `DESIGN_GUIDELINES.md`, `GARMIN_DATABASE_SCHEMA.md`
