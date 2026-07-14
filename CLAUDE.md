# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ⛔ IT HAS BEEN BUILT. IT MAY NOT WORK — BUT IT HAS PROBABLY BEEN BUILT, MAYBE MORE THAN ONCE.

**READ THIS BEFORE YOU WRITE A SINGLE NEW FUNCTION. Every session that skipped it has burned hours and shipped a regression.**

**"It doesn't work" is NOT evidence that "it doesn't exist."** The dominant failure mode in this codebase is a **well-built system STARVED of its inputs** — it exists, it is spec'd, it is fixtured, and it never fires because something upstream is null. It looks *missing*. It is not missing. **It is hungry.**

**The proof, from 2026-07-12 (one session, both mistakes):**
- Claude decided the app needed a `resolveRunEasyPace()` and built one — **while `resolveRunEasyPace()` already existed** (`generate-combined-plan/science.ts:110`, D-033, its own spec doc `PHASE-1-RUN-PACE-SPEC.md`, **9 pin tests**). Same capability. **Same function name.** It had been warned about false starts one hour earlier.
- That existing engine is *excellent* — streak gates, median gates, an ACWR gate so fatigue isn't misread as fitness decline. It has **never once run**, because both of its inputs (`learned_fitness.run_easy_pace_sec_per_km` and `athlete_snapshot.run_easy_pace_at_hr`) are null. **The job was to FEED it, not to rebuild it.**

**THE HARD RULE — before writing any new function, helper, or resolver:**
1. `grep -rn "<theFunctionNameYouAreAboutToWrite>" supabase/functions src` — **the name you would naturally pick is often the name that is already there.**
2. `grep` the *capability* (2-3 different words for it), and check `docs/CAPABILITY-MAP.md`.
3. Search `docs/` for a **DESIGN-\*/SPEC-\*** doc on it. If one exists, the thing exists.
4. If you find something that looks broken: **ask "is it starved or is it absent?"** Trace its inputs to the write site. A null input is a plumbing job, not a build job.
5. State in writing what you found **before** proposing to build. No exceptions.

If you are about to say "the app needs X" — you are probably about to rebuild X.

---

## STOP — this app is BUILT. The job is wiring, not features.

Efforts is a mature, largely-complete app. The near-term mission is **continuity**: verify every capability is wired together and reads one truth — NOT building new features. Before you propose to build ANYTHING, obey this:

1. **Trace-before-build (hard rule).** No build proposal until you have traced and *stated in writing* what already exists for that capability. Start at `docs/CAPABILITY-MAP.md` (the "does X exist and where" index), then grep the entry point, then read it. "I think we should build X" without a preceding "here's what's already wired for X" finding is a process failure — it wastes hours re-inventing shipped infrastructure (this has happened repeatedly).
2. **Default posture: find where it lives, don't design a solution.** When something seems missing or wrong, the first move is a code trace to locate the existing implementation — assume it exists until the trace proves it doesn't. Most "we should add X" instincts are already built in a form you haven't found yet (e.g. FTP-learned-from-riding + user-adopt: fully built via `learn-fitness-profile` → `ride_ftp_estimated` → `TrainingBaselines` adopt UI).
3. **Ground design calls in commercial-app practice + training science, verified — never hand-picked** (see the metric/threshold decisions in DECISIONS-LOG). But do #1 FIRST — check what's built before researching what's ideal.
4. **Update `docs/CAPABILITY-MAP.md`** when you discover a capability's status/entry-point, or ship something that changes it. Keep it terse (one line per capability) so it stays alive and trusted.

## Product Identity

Efforts is a hybrid endurance + strength training app for intermediate athletes (runners, cyclists, triathletes) who want to integrate strength training into their endurance training. It is **not** a triathlon-only app. Strength is always present — core to every athlete profile, not an add-on. Race goal is optional. The engine manages interference between endurance and strength automatically. See `docs/PRODUCT-POSITIONING.md` for the full product identity.

## Project

**Efforts** — hybrid endurance + strength training app (run / cycling / triathlon / duathlon + integrated strength). React + TypeScript on Vite/Netlify; Supabase (Postgres + Deno edge functions); iOS via Capacitor.

## Context-priming for new sessions

**Read `docs/START-HERE.md` FIRST — the one page.** What the app is (all major pieces exist), the loop, the three diseases (starved / dead / doubled), what's clean vs fractured, and which docs lie. It orients you in one screen; everything below is the depth behind it.

Then, before wiring anything: **`docs/LIFECYCLE.md`** — the loop (baselines → plan → **frozen** pins → performance → state → learning → next plan), and the FROZEN-vs-LIVE boundary that every fracture found in the 2026-07-13 audit lived on. And **`docs/CAPABILITY-MAP.md`** — "does X exist and where", rebuilt from code 2026-07-13, starting with its **"I almost rebuilt this"** list.

**The thesis first (read before the state docs — this is the frame everything else sits inside).** Efforts' product *is* coherent reasoning about an athlete: nothing happens in a vacuum — every surface is plan-aware, performance-aware, and reads one shared truth instead of minting its own. "Completely self-aware" is the north star, defined finitely (not a vibe), and it is a target being migrated toward surface by surface — not an achieved state. Hold it before you touch any feature:

- **`docs/TARGET-ARCHITECTURE.md`** — THE north star: a living, coherent, steerable system that is **deterministic, smart-server / dumb-client, single source of truth**. The destination every change is aimed at; the yardstick is "does this move a discipline toward the run model." Read FIRST.
- **`docs/TRUTH-MAP.md`** — where the app is vs that target: per-fact authority (who owns each fact) + the verified fractures (strength contradicts itself; bike FTP; swim broken). Read before touching fitness/load/RPE/FTP/strength or wiring a screen.

- **`docs/CONSTITUTION.md`** — the six laws that make Efforts *a system* not a pile of features (one source of truth per claim; surfaces render, never re-decide; new reasoning born on the spine; each law has a violation-tell).
- **`docs/SELF-AWARENESS-MAP.md`** — what "self-aware" means, made finite: five reasoning axes on one shared substrate. Substrate built; most axes **partial** with named gaps. The app is "self-aware" when all five are built and gated.
- **`docs/CANON-arc-inference-model.md`** — how it infers without becoming "the score that lies": one confidence-stamped `training_reaction` fact, born on the spine, every surface an arm that renders it. §12 = the continuity invariant (one government, states as arms; divergence is the lie).

Then the state docs (in order) — they prevent re-litigating settled choices and re-discovering already-filed bugs:

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

After any change that affects production, ship it, and `git push origin main` (Netlify auto-deploys). Don't end a task with "you should deploy."

### ⛔ The `_shared` deploy trap — read this every time you touch a shared file

**Supabase bundles `_shared/` and `src/lib/` into each edge function AT DEPLOY TIME. Each function carries its own frozen copy.** Editing a shared file changes nothing in production until **every function that imports it** is redeployed. There is no warning, no error, and no test that catches it.

On 2026-07-13 this was found to have silently stranded **17 functions** — including both plan generators (running a month-old copy of the pace resolver, so D-287's "the resolver is UNIVERSAL on every surface" was **false in production**) and `ingest-activity` (last deployed a month earlier).

**So: deploy every function you touched PLUS everything that imports what you touched.** To find them:

```bash
grep -rln "the-shared-file-you-changed" supabase/functions --include=index.ts
```

Then verify prod matches main — compare `supabase functions list --project-ref yyriamwvtvzlkumqrvpm` timestamps against the newest commit touching each function's transitive deps. **A green test suite proves nothing about what is running on the server.**

## End-of-session protocol

Before any session ends — when the human says "we're done," "closing the laptop," "good for today," "stopping here," or any equivalent — Claude Code MUST:

1. Propose updates to `docs/ENGINE-STATE.md`, `docs/DECISIONS-LOG.md`, and `docs/OPEN-QUESTIONS.md` based on what shipped this session:
   - **ENGINE-STATE.md:** new fixes go to **Solid** (with file paths + verification method); new known-broken bugs go to **Known broken** (with deferred-reason); new unverified claims go to **Questioned** (with verification approach).
   - **DECISIONS-LOG.md:** new D-NNN entry per non-trivial design choice — coefficient picked deliberately, alternative pattern rejected, scoping call made.
   - **OPEN-QUESTIONS.md:** new Q-NNN entry per behavior that was noticed and intentionally left, or per bug deferred with a reason.
2. **⛔ BACK-ANNOTATE. This is the step that keeps the docs honest, and it is the one that has never been done.**
   If anything you shipped **supersedes, reverses, or closes** an older `D-NNN` / `Q-NNN` — **go back and mark the OLDER entry.** Not just the new one.
   > *The docs' forward pointers are excellent and their back-pointers do not exist. D-283 knew it killed D-275; D-275 had never heard of D-283, and sat for two days presenting a reversed decision — with its full justification intact — to anyone who searched for "heat". Q-136, Q-138 and Q-169 were all fixed and all still read as open. **A fix that does not return to close the thing it fixed is how every one of these docs rotted.***

   Write the back-annotation as a `>` blockquote at the TOP of the old entry: what changed, where in code, and "everything below is history."
3. Show the proposed diff.
4. Wait for human approval.
5. Commit + push as `docs: end-of-session context update for YYYY-MM-DD`.

Also update `docs/POLISH-PUNCH-LIST.md` if items closed (mark `[x]` with date) or new items were added during the session, and `docs/CAPABILITY-MAP.md` if a capability's status/entry-point changed or you discovered its real status (keep rows terse — one line each).

**The 5 living docs** (updated ~every session; everything else in `docs/` is reference, often stale — verify before trusting): `DECISIONS-LOG.md`, `OPEN-QUESTIONS.md`, `ENGINE-STATE.md`, `POLISH-PUNCH-LIST.md`, `CAPABILITY-MAP.md`.

If the human ends the session without triggering this, prompt before stopping:

> "Before you go — should I update the context docs with what we shipped today?"

This is the institutional-memory backbone. The next session reads what this session writes.

## Topology

### Ingest is the orchestrator

`supabase/functions/analyze-workout/` is **empty** (one of 11 empty dirs — see `docs/CAPABILITY-MAP.md`). Real fan-out lives in **`ingest-activity/index.ts:1345-1712`**. Per ingest, ~8 things happen:

- `auto-attach-planned` (**awaited** — deliberate, for deterministic ordering)
- `compute-workout-summary` + `compute-workout-analysis` (**fire-and-forget**)
- `calculate-workload` → `workouts.workload_actual` (**awaited**) — this is the ACWR substrate
- `compute-adaptation-metrics` (awaited)
- `compute-facts` (**awaited**; writes `workout_facts`, `exercise_log`, `session_load`) → then fires `compute-snapshot` → the spine
- Invalidate `block_adaptation_cache` and `coach_cache`
- Route to `analyze-{running,cycling,strength,swim}-workout` (NOT `analyze-swimming-workout`) — fire-and-forget
- **`adapt-plan` action=auto** — fire-and-forget
- `post-import-athlete-pipeline` — awaited, but **Garmin-only and milestone-gated**

⚠️ **`adapt-plan` action=auto is NOT a no-op.** (This file claimed it was, and that claim was false.) It auto-progresses/deloads strength loads off the `exercise_log` e1RM trend, writes `plan_adjustments`, and invokes `materialize-plan`, which rewrites `computed.steps` on the plan's future rows. **The athlete is never asked.** The adjustment is stamped `applies_from: today`, so the past is safe — but the auto path **skips the Arc fatigue/taper/adherence gate** that the `suggest` path applies. See `docs/LIFECYCLE.md`.

⚠️ **There is a RACE.** `compute-facts` is *awaited* but reads `workouts.computed`, which is written by the two *fire-and-forget* calls above. When it loses, `time_in_zone`, `intervals_hit/total`, `hr_drift_pct` and `execution_score` are silently absent from that workout.

⚠️ **Two ingest paths bypass all of this.** `ingest-phone-workout` and `save-imported-workout` fire **only** `compute-workout-summary` → no `workout_facts`, invisible to the spine, and **zero contribution to ACWR** while still counting toward `workload_total`.

Routing also exists in `recompute-workout/index.ts:21-25` and `bulk-reanalyze-workouts/index.ts:40-50` — **three hand-maintained routing tables.** Any new cache or downstream system MUST register in all of them or it goes stale.

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
- Plan token expansion → **`materialize-plan/index.ts:1123+` (its OWN inline expander)**. ⚠️ `_shared/token-parser.ts` is a *different* thing — it serves the **analysis** path (`compute-workout-analysis`, `analyze-running-workout`), and `materialize-plan` does not import it. This file used to point at the wrong one.
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
