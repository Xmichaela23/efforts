# AREA — Reachability sweep (audit section 1 of 4)

> Read-only sweep, 2026-08-30. Question: of everything in the repo, what does the running app actually reach, and what is a stale layer left over from an earlier build? Nothing was deleted or edited. Method: knip (client dead-code scanner, config in `knip.json`) + exhaustive grep for every edge function's invocation sites across `src/`, `scripts/`, `supabase/functions/`, `supabase/migrations/`, `supabase/config.toml`, `netlify.toml`, and `ios/`.

## Headline

The codebase is substantially cleaner than the "layers of rebuilds" fear. Of 93 edge functions, ~76 have live callers. Of 377 client source files, 5 are dead. The real accumulation is **inside live files** (386 exported-but-never-imported functions/constants — old versions kept alongside new) — that is section 2's job, not deletion candidates here.

## A. Edge functions — 93 total

### A1. Zero invocation sites anywhere in the repo (17)

No `invoke('name')`, no `functions/v1/name` URL, no server-to-server call, no migration cron, no config.toml entry, no iOS call. Name-mentions exist for some (e.g. `readiness` appears 781 times) but every one is a field name or comment, not a call.

| Function | Note |
|---|---|
| `readiness` | Biggest surprise. Superseded by `compute-snapshot`/`coach`? Verify before delete — it's referenced as "the proven pattern" in `_shared/require-user.ts` comments. |
| `planning-context` | 16 mentions, all comments. |
| `arc-setup-chat` | Prompt file `_shared/arc-setup-prompt.ts` still exists too. |
| `analyze-user-profile` | |
| `backfill-facts`, `backfill-planned-workload`, `backfill-week-summaries`, `backfill-strength-load`, `backfill-routes` | One-off backfill tools, likely historically curl-invoked. Archive candidates rather than delete. |
| `detect-cores` | `match-cores` (its sibling) IS live. Comment in `_shared/core-detect.ts` describes detect-cores as the caller of that shared lib — stale? |
| `enrich-history`, `import-connect-history`, `process-workouts-batch`, `restore-gps-track` | |
| `reingest-activity` | `recompute-workout` (55 refs) may have replaced it. |
| `save-location` | Cited in comments as a reference pattern; no caller. |
| `notify-admin-signup` | **VERIFIED LIVE** — DB trigger on public.users calls it on every signup. KEEP. |

**Dashboard verification — DONE 2026-08-30** (read-only: SQL editor + logs explorer + auth config, approved by Michael):

- **No pg_cron**: `cron.job` does not exist — zero scheduled jobs anywhere.
- **No auth hooks** configured.
- **One DB trigger**: `otify-admin-new-user` (AFTER INSERT ON public.users) → calls `notify-admin-signup`. **notify-admin-signup is LIVE — off the delete list.**
- **7-day traffic** (logs explorer, `function_edge_logs`, all 45 functions with any calls captured): `backfill-strength-load` had **9 calls** (and was redeployed 2026-08-29 — in active use as an admin/terminal tool; **off the delete list**). The other **15 candidates had ZERO calls in 7 days**: readiness, planning-context, arc-setup-chat, analyze-user-profile, backfill-facts, backfill-planned-workload, backfill-week-summaries, backfill-routes, detect-cores, enrich-history, import-connect-history, process-workouts-batch, reingest-activity, restore-gps-track, save-location. Caveat: 7 days is the retention window checked; combined with zero code references and April-2026 last-deploy dates, these are confirmed-dead to the strength of available evidence.

### A1b. GHOSTS — deployed in prod but NOT in the repo at all (10)

`supabase functions list` shows 100+ deployed vs 93 repo dirs. Deployed-and-ACTIVE with no repo source:

| Deployed name | Note |
|---|---|
| `OLD garmin-webhook-activities` (slug `quick-responder`) | Sept 2025 copy of the webhook |
| `generate-plan` | earliest-era generator, v92, last deploy 2026-04-03 |
| `analyze-workout` | replaced by per-sport analyzers, last deploy Oct 2025 |
| `generate-overall-context` | old AI context builder |
| `generate-weekly-summary` | old AI summary, Mar 2026 |
| `generate-training-context` | old AI context builder |
| `calculate-workout-metrics` | Jan 2026 |
| `test-db-connection` | dev utility |
| `run-migration` | **SECURITY: remotely executes SQL; still ACTIVE.** Delete first. |
| `disconect-connection` (typo) + `backfill-week-summaries-` (trailing dash) | misdeploy twins of real functions |

These cannot be cleaned by repo edits — they need `supabase functions delete <slug> --project-ref yyriamwvtvzlkumqrvpm` per function (gated on Michael).

### A2. Externally invoked — zero code refs is EXPECTED, keep

`garmin-webhook-activities` (config.toml entry; Garmin pushes to it), `strava-webhook` (live, 13 refs incl. manager).

### A3. Everything else (~74) — live

Call-graph spine confirmed: client → `coach` / `get-week` / `compute-snapshot` / `readiness`-replacement chain; plan path client → `create-goal-and-materialize-plan` → `generate-run-plan` / `generate-strength-plan` / `generate-combined-plan` (server-side `invokeFunction`) → `materialize-plan`. All four generators reachable, consistent with AUDIT-plan-generators-2026-08-07.

### A4. Stray file

`supabase/functions/garmin-webhook-activities-working.ts` — an old working-copy backup sitting loose in the functions dir; a copy also exists in `archive/`. Delete candidate (repo root of functions should contain only function dirs + shared).

## B. Client (`src/`) — 377 files

### B1. Dead files (5) — unreachable from `main.tsx`/`App.tsx`

- `src/components/StrengthAdjustmentModal.tsx` (name appears in 3 live files — comments only)
- `src/components/ui/charts.tsx`, `src/components/ui/popover.tsx`, `src/components/ui/progress.tsx` (unused shadcn stubs)
- `src/lib/run-critical-speed.ts`
- `src/types/fitness.ts`

NOT dead despite the scanner flag: `src/lib/native-fetch-shim.ts` — aliased over `@supabase/node-fetch` in `vite.config.ts:17` (iOS/WKWebView fix, per CLAUDE.md Conventions). Add it to knip's entry list.

### B2. Test-only libs (2) — imported only by their tests

`src/lib/strength-language.harness.ts` (deliberate test harness — keep), `src/lib/strength-row-text.ts` (superseded? section 2 question).

### B3. False positives — do not delete

~85 `src/**/*.test.ts` files flagged "unused" by knip: they run under `deno test` (see `deno.json`), which knip doesn't model. Add a knip ignore for `**/*.test.ts` so future runs are clean. `@fontsource/*` packages flagged unused are live via `src/index.css` `@import`s.

### B4. Unused exports — 386 (the "code painted over code" signal)

Full list in knip output (rerun `npx knip`). These are old versions of functions still exported from live files (e.g. four component variants in `EffortsButton.tsx`, dead helpers in `PlannedSessionHeader.tsx`). **This is section 2's worklist**, not a delete list — each needs a "which twin is live" verdict.

### B5. Broken maintenance script

`scripts/seed-exercises.ts` imports `../supabase/functions/materialize-plan/exercise-config.ts`, which no longer exists (moved to `src/lib/exercise-config.ts`). `npm run seed:exercises` would fail. Fix or archive.

### B6. Unused deps

`@radix-ui/react-progress` (real, pairs with dead `ui/progress.tsx`), `playwright` (devDep, no config/tests found). `tsx` and `open` are used by npm scripts but not declared.

## C. Local clutter (gitignored, not in the repo — purge any time)

`test-outputs/` 9.5M, `dist/` 5.7M. `archive/` (1.5M) is tracked and is the intended quarantine — fine.

## D. Proposed actions (nothing done yet — Michael approves)

1. Delete the 5 dead client files + `@radix-ui/react-progress` + the stray `garmin-webhook-activities-working.ts`.
2. DONE: dashboard verification (see A1). Remaining: `git mv` the 15 confirmed-dead functions to `archive/functions/` and delete them + the 10 ghosts from the deployed project (`run-migration` first — it executes SQL remotely and is a standing security hole).
3. Fix or archive `scripts/seed-exercises.ts`.
4. Add `**/*.test.ts` handling to `knip.json` so the scanner stays useful.
5. Hand the 386 unused exports to section 2 (duplicate-logic sweep).
