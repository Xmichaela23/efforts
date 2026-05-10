# Session Handoff — 2026-05-10

Snapshot of the plan-engine work shipped and pending across this session, written so a future agent can pick up without context loss.

---

## What shipped this session

Three commits on `main`, all pushed to `origin/main`. Edge functions deployed to project `yyriamwvtvzlkumqrvpm`.

### `86efc956` — `feat(schedule): wire SESSION-FREQUENCY-DEFAULTS through optimizer + builder`

Phase A + Phase A.5 in one commit.

**Phase A — session frequency wiring** (engine-side):
- New `supabase/functions/_shared/session-frequency-defaults.ts` — pure helper computing `SessionFrequencyDefaults` (swims/bikes/runs/strength counts + `bricks_per_week_by_phase`) from `weekly_hours_available`, `limiter_sport`, `swim_intent`, `strength_intent`. Implements §2 (base table), §4 (limiter shifts), §5 (swim-intent floor), §7 (strength integration) of `docs/SESSION-FREQUENCY-DEFAULTS.md`.
- `_shared/week-optimizer.ts`: `WeekOptimizerInputs.preferences` extended with `bikes_per_week` / `runs_per_week`. Optimizer skips `easy_bike` when bikes < 3, `easy_run` when runs < 3.
- `generate-combined-plan/reconcile-athlete-state-week-optimizer.ts`: computes defaults, passes counts into optimizer inputs, persists onto `AthleteState.session_frequency_defaults`. Athlete-pinned anchor counts treated as a floor (`max`), not a ceiling.
- `generate-combined-plan/week-builder.ts`: respects `bikes_per_week` / `runs_per_week` for easy-session generation.
- `generate-combined-plan/types.ts`: `AthleteState` extended with `session_frequency_defaults?`.

**Phase A.5 — fixes the audit caught**:
- Builder's third-swim path fires on `swims_per_week >= 3` (not just `swim_intent === 'focus'`). 12-14 / 14+ tier athletes get 3 swims regardless of intent per §2.
- Brick placement is tier-aware via `bricks_per_week_by_phase` (5-7 = 0 all phases; 14+ = 2 in race_specific only). Builder consumes via `min(BRICKS_PER_WEEK[phase], tierCap)`.
- `swimProgramIntentForAnchorSlots` returns 'focus' (3-slot templates) when `swimsBudget >= 3 && anchorSlots >= 3`, even for race-intent athletes.
- `deriveOptimalWeekWithCoEqualRecovery` no longer treats `strength_preferred_days:` transparency lines as blocking conflicts. The 1× retry's correctly-placed grid (incl. 3rd swim) was being discarded.

**Tests / verification**:
- 32 new unit tests for `computeSessionFrequencyDefaults`.
- `scripts/audit-plans.ts` extended with §9 rule (S/B/R count vs hours-derived defaults) and C8 (7hr) + C9 (12hr) acceptance configs. Both reach 7/7.
- All 27 existing contract tests still pass.

### `b64d9f0c` — `feat(wizard): athlete-driven weekly hours + session frequency defaults`

Phase B — wizard wiring.

- **`create-goal-and-materialize-plan/index.ts`**:
  - `limiter_sport` promotion (~line 1583): pulls from `goal.training_prefs.limiter_sport` into the `athlete_state` payload. **Closes a pre-existing dead-code path** — the §4 limiter shift in `resolveSessionFrequencyDefaults` and the `+0.07` sport-distribution shift in `phase-structure.ts` had never executed in production because `limiter_sport` wasn't being threaded into `AthleteState`.
  - `weekly_hours_available` resolution (~line 1450): prefers `training_prefs.weekly_hours_available` when present, falls back to the legacy `{beginner: 6, intermediate: 10, advanced: 14}` fitness-bucket mapping for goals without an explicit wizard answer.
- **`src/components/ArcSetupWizard.tsx`** Step7BHours: 5-tier picker (5-7 / 8-10 / 10-12 / 12-14 / 14+) writing midpoints (6 / 9 / 11 / 13 / 15) to `training_prefs.weekly_hours_available`. `assemblePayload` calls `computeSessionFrequencyDefaults` and persists `session_frequency_defaults` onto `training_prefs`.
- **`src/lib/session-frequency-defaults.ts`** (new): frontend mirror of the `_shared` helper, matching the established codebase pattern for the Vite/Deno boundary.

### `4599d4aa` — `fix: phase-aware long-run TSS cap + hours tier card UI`

- **`validate-training-floors.ts`**: new `LONG_RUN_TSS_SHARE_MAX_BY_PHASE = { base: 0.30, build: 0.32, race_specific: 0.35, taper: 0.40 }`. Applied to both 30%-base paths (single-sport vs total weekly TSS, and tri vs run-discipline TSS). The 40% tri-fallback for low-run-volume weeks is unchanged. Was failing in Week 17 / 18 taper weeks where the long run holds while bike, swim, and quality work deliberately drop. Error message now names the phase.
- **`ArcSetupWizard.tsx`** Step7BHours UI rewrite: replaced flat 5-button list with stacked cards. Each card shows tier label, session-count summary (`2 swims · 2 bikes · 2 runs`), and one-line benefit/tradeoff. Midpoint values and engine wiring unchanged — UI only.

### Edge function deploys (project `yyriamwvtvzlkumqrvpm`)

- `generate-combined-plan` — deployed twice this session (Phase A, then long-run cap fix).
- `arc-setup-chat` — deployed once (Phase A; picks up updated `_shared/week-optimizer.ts`).
- `create-goal-and-materialize-plan` — deployed once (Phase A + B mix).

Frontend (Netlify) auto-deploys from `main` — wizard tier-card UI rolls out with the next build.

### Docs added or updated

- **`docs/SCHEDULING-RULES.md`** — prescriptive scheduling spec with confidence tags. Authoritative for placement rules.
- **`docs/SCHEDULING-RULES-EXTRACTED.md`** — descriptive snapshot of code state pre-2026-05-09 consolidation. Marked outdated at the top.
- **`docs/SESSION-FREQUENCY-DEFAULTS.md`** — prescriptive spec for hours-derived session counts.
- **`docs/PLAN-AUDIT-RESULTS.md`** — regenerated each audit run.
- **`CLAUDE.md`** — orientation map for future Claude Code sessions.
- **`notes/docs-audit-2026-05-09.md`** — the docs audit that surfaced PLAN-CONTRACT.md drift.

---

## Where the engine stands today

### Audit acceptance (`scripts/audit-plans.ts`)

| ID | Configuration | Pass | Fail |
|---|---|---:|---:|
| C1 | Wed group ride (quality) | 6 | 1 |
| C2 | 6d, fitness, supplementary strength, no group ride | 5 | 2 |
| C3 | Olympic, 5d, performance, no strength | 6 | 1 |
| C4 | Mon group ride (quality) | 4 | 3 |
| C5 | Wed group ride (hammer) | 6 | 1 |
| C6 | Wed group run (quality) | 4 | 3 |
| C7 | Wed group ride + Thu group run | 6 | 1 |
| C8 | **7hr/wk acceptance — 6 S/B/R** | **7** | **0** ✓ |
| C9 | **12hr/wk acceptance — 9 S/B/R** | **7** | **0** ✓ |

Total: 51 / 63 checks pass. C8 and C9 acceptance criteria for SESSION-FREQUENCY-DEFAULTS are met.

### Tests

- 59/59 pass: anchor-contract 6/6, tri-optimizer-prefs 8/8, prefs-to-collision 1/1, resolve-schedule-collisions 7/7, swim-cutoff 4/4, scheduler-anchor 1/1, session-frequency-defaults 32/32.
- `npm run build` clean. Frontend bundle within size budget.

---

## Pending work / known gaps

These are real and surfaced during this session but not addressed. None block production today.

### Audit findings still open

1. **§4.15 strength reduction not propagated to per-week trade-offs.** When `deriveOptimalWeekWithCoEqualRecovery` retries 2× → 1× successfully, the recovery line lives in `optimal.trade_offs` and the reconciler telemetry log only — it does not propagate into per-week `week_trade_offs` for athlete-facing UI. C1 / C3 / C5 / C7 §4.15 audit findings stem from this. **Spec gap, not bug** — the engine reduces correctly; the UI just doesn't see why.
2. **Validator check 3** (`validator.ts:267`) hardcoded `true`; `checkTSSWithinBudget` (`validator.ts:69-77`) never called. Pre-existing dead code.
3. **`enforceHardEasy`'s consolidated-hard exception is unreachable** (`week-builder.ts:2174`) because `allowConsolidatedHardException = false` literal at the call site.
4. **Diagonal matrix lookups** in `_shared/schedule-session-constraints.ts:47-58` are dead — short-circuited at `:144`.

### Spec implementation gaps (Phase B follow-ups)

1. **Wizard `limiter_sport` question.** The LLM-driven Arc setup chat sometimes asks; the React wizard doesn't. The server-side `inferLimiterSportFromArc` enrichment fills it from Arc context, so production works — but athlete override via wizard is not yet wired.
2. **§3 distance scaling in `computeSessionFrequencyDefaults`.** Sprint / olympic / full modifiers from spec §3 are not implemented. Today the helper assumes 70.3 base table for all distances.
3. **§8 recent training history ceiling.** Cap defaults by recent actual behavior to prevent overreach. Requires `workouts` table read; not implemented.
4. **§10 group ride / group run anchor modifications.** Already partially handled by anchor placement logic; spec §10 documents the orthogonal interaction but no explicit wiring exists.
5. **Existing goals pre-Phase-B** continue to use the fitness-bucket fallback for `weekly_hours_available`. No backfill migration. They pick up the new wizard-supplied value on next plan regeneration.

### Doc / code reconciliation

- **Cursor rule on `lower_body × easy_run`** (`.cursor/rules/lower-body-strength-pairing.mdc:13-16` says easy run is allowed; matrix at `schedule-session-constraints.ts:56` says it's not). `SCHEDULING-RULES.md §8` resolves via conditional ⚠¹; the cursor rule itself has not been reconciled.
- **`STRENGTH_FREQUENCY_RULES_TEXT`** mentions "If Wed = quality_bike, Wed must be upper-only" in prose; no standalone Wed-specific code path. Matrix already enforces implicitly via `quality_bike × lower_body_strength = 0`.

---

## Next task: minimum volume floors for long ride and long run

User-stated next task. No spec doc on disk yet; the title is the only signal. Likely scope based on session-context inference:

The current engine has **maximum** caps on long-day TSS share (`LONG_RUN_TSS_SHARE_MAX_BY_PHASE` for runs; long-ride hours capped via `expectedBikeDurationHours()` in `science.ts:113-123` and `week-builder.ts:776-787`). The system has **no minimum floors** — a long ride or long run can shrink to near-zero without triggering a violation.

This matters because:
- The §9 default-shape tables in `SESSION-FREQUENCY-DEFAULTS.md` show explicit long_ride / long_run sessions in every tier. If the optimizer or builder accidentally drops them (e.g. dense schedule, recovery overcap, taper aggressively trimmed), the audit doesn't catch it.
- The `longRunFloorMiles(distance, phase)` function exists at `science.ts:156-182` but is only used as an upward floor *within* week-builder's run-distance computation, not as a *validator* gate.
- Race-week cap (`<=45min, 3-5mi`) exists; pre-A-race taper cap (`<=5mi`) exists. Both are caps, not floors.

**Likely shape of the work**:

1. Define minimum long_ride hours and long_run minutes per phase + race distance (probably as a new constant table mirroring the existing `expectedBikeDurationHours` / `longRunFloorMiles` shapes).
2. Add a validator check (likely a new `LONG_DAY_VOLUME_FLOOR` violation code in `validate-training-floors.ts`) that fires when the computed long_ride or long_run falls below the phase-appropriate floor.
3. Surface the violation through the same `physiologicalFloorRebuild` path that long-run share violations use today.
4. Add audit harness rule (§4.x) and tests.

**Open questions for the next session**:
- Is this a hard validator (fails the build) or a soft trade-off (logs and continues)? Long-run share is hard; this might want to be soft for the first iteration.
- Per-tier minimums (5-7hr tier has shorter long days than 12-14hr) or per-distance minimums (sprint long-ride floor differs from full-distance)?
- Does the floor scale with `loading_pattern`? (3:1 build weeks ramp differently than 2:1.)
- Recovery weeks: should the floor apply at all, or skip like §4.19 does?

**Recommended starting point** for the next agent: ask the user for a spec doc (similar pattern to `SESSION-FREQUENCY-DEFAULTS.md`) before implementing. The numerical thresholds (what's the minimum long_ride for a 7hr/wk 70.3 athlete in build phase?) need product input, not engineering inference.

---

## Session metadata

- Branch: `main`
- Latest commit: `4599d4aa` (already pushed to `origin/main`)
- Working tree clean as of writing this doc.
- Settings: `.claude/settings.local.json` carries project-local Bash auto-approve for common patterns (deno test/check/run, npm run, npx eslint, sed read patterns, git add/commit). Push and supabase deploy still prompt.
- No active background tasks.
