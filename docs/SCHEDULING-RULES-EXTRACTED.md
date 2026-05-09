# Scheduling Rules — Extracted from Code

> **⚠️ SNAPSHOT OUTDATED — 2026-05-09**
> This document describes scheduling logic as it existed before the consolidation pass on 2026-05-09. Builder-owned guards, swim bump logic, and tri-specific overrides described here have been removed. The optimizer is now the sole scheduling authority. For current behavior, read the code directly. Kept for historical reference only.

Snapshot of scheduling logic in the plan-generation pipeline as of 2026-05-09.
Descriptive: this records what the code does, not what the spec wishes it did.
Cite file:line for every rule.

Files inspected:
- `supabase/functions/_shared/schedule-session-constraints.ts`
- `supabase/functions/_shared/week-optimizer.ts`
- `supabase/functions/_shared/week-conflict-resolver.ts`
- `supabase/functions/generate-combined-plan/week-builder.ts`
- `supabase/functions/generate-combined-plan/validator.ts`
- `supabase/functions/generate-combined-plan/validate-training-floors.ts`
- `supabase/functions/generate-combined-plan/science.ts`
- `supabase/functions/generate-combined-plan/phase-structure.ts`
- `supabase/functions/generate-combined-plan/swim-protocol-v21.ts`
- `supabase/functions/generate-combined-plan/index.ts`
- `.cursor/rules/lower-body-strength-pairing.mdc`, `performance-session-contract.mdc`, `arc-intelligence-layer.mdc`, `keep-it-tight.mdc`, `deploy-after-shipping.mdc`

---

## 1. Hard constraints (code refuses to violate)

### 1.1 Same-day matrix
- Two sessions on the same calendar day must satisfy the 10×10 same-day compatibility matrix — `_shared/schedule-session-constraints.ts:47-58`. Lookup is symmetric (`SAME_DAY_COMPATIBLE`, `areSameDayCompatible`) — `_shared/schedule-session-constraints.ts:60-79`.
- The full matrix is rendered in §4.
- A pair is rejected as incompatible by `arePlannedSessionsCompatible` after mapping each planned session to a matrix slot via `plannedSessionToScheduleSlot` — `_shared/schedule-session-constraints.ts:180-274`.
- `quality_swim` is its own row — it is *not* aliased to `easy_swim` — `_shared/schedule-session-constraints.ts:23-35`.
- `race_event` is treated as compatible with anything (race day clears the calendar) — `_shared/schedule-session-constraints.ts:142`.
- A planned session with both legs tagged `brick` whitelists itself for same-day pairing — `_shared/schedule-session-constraints.ts:253`.
- Long-course (`70.3` / `full`) kick-focused swim tagged `kick_tri_long_course` is whitelisted to share a day with a `long_run` session — `_shared/schedule-session-constraints.ts:258-266`.
- A brick leg and a non-brick session may share a day iff exactly one is tagged `brick` — `_shared/schedule-session-constraints.ts:270-272`.
- New / beginner swimmers (`learnerSwimExperience`): a swim above `LEARNER_HEAVY_SWIM_YARDS = 1500` is mapped to `quality_swim` for the same-day matrix instead of `easy_swim` — `_shared/schedule-session-constraints.ts:117,210-217`.

### 1.2 Sequential rules (week-optimizer.ts `sequentialOk`)
These are enforced when placing a new session in the optimizer; they are not all duplicated in `week-builder.ts` (see §9).
- After `long_ride`: today cannot be HIGH (`long_ride`, `long_run`, `quality_bike`, `quality_run`, `lower_body_strength`) — except the canonical Sat→Sun `long_ride → long_run` pairing is allowed — `_shared/week-optimizer.ts:333-335`.
- After `long_run`: today cannot be `easy_run` (unless `allow_easy_run_after_long_run`); and not HIGH except `long_ride` — `_shared/week-optimizer.ts:336-340`.
- After `quality_bike`: today cannot be `quality_bike`; today cannot be `quality_run` unless the consolidated AM-run / PM-lower-strength relax flag is on — `_shared/week-optimizer.ts:344-350`.
- After `quality_run`: today cannot be `quality_run` and cannot be `quality_bike` — `_shared/week-optimizer.ts:352-355`.
- The day before an anchored `quality_bike` cannot be `quality_run`; symmetrically, day before an anchored `quality_run` cannot be `quality_bike` — `_shared/week-optimizer.ts:359-360`.
- 48-hour gap **after** `lower_body_strength` before placing another `lower_body_strength` or a `long_run` (yesterday and 2-back days checked) — `_shared/week-optimizer.ts:363-367`.
- 48-hour gap **before** `long_ride` or `long_run`: `lower_body_strength` cannot land in the next 1 or 2 calendar days — `_shared/week-optimizer.ts:372-377`.
- `lower_body_strength` cannot sit the calendar day before a day that already pairs `quality_bike` + `quality_run` — `_shared/week-optimizer.ts:380-383`.
- The fatigue tier definitions used by sequential rules: HIGH = `long_ride`, `long_run`, `quality_bike`, `quality_run`, `lower_body_strength`; MODERATE = `quality_swim`, `upper_body_strength`; LOW = the easy variants — `_shared/schedule-session-constraints.ts:6-18` and mirrored at `_shared/week-optimizer.ts:161-169`.

### 1.3 Lower-body 48h floor in week-builder
- In `week-builder.ts`, the second strength slot (heavy lower) is rejected if it lands within 48h of `longRunActualDay` or any `brick`-tagged day, via `heavyLowerBlockedWithin48hOfLongRunOrBrick` — `generate-combined-plan/week-builder.ts:140-151`. Used in `pool2` filtering at `generate-combined-plan/week-builder.ts:1986-1991`.
- Lower-body strength may not sit the calendar day before a day with both non-easy bike and non-easy run via `lowerBlockedImmediatelyBeforeBikeRunQuality` — `generate-combined-plan/week-builder.ts:157-171,1990`.
- These guards relax in stages: preferred-day filter → drop preferred filter → drop the 48h guard but keep density guard → drop the density guard too. Each fallback emits a `console.warn` and a `heavy-lower-<day>` `ConflictEvent` — `generate-combined-plan/week-builder.ts:1996-2067`.

### 1.4 Hard/Easy day rule (validator + builder)
- Validator check 1: no two consecutive calendar days both classified HARD, including Sunday-of-week-N → Monday-of-week-N+1 — `generate-combined-plan/validator.ts:37-55`.
- Validator check 11: no two HARD same-sport sessions within 48h (same day or adjacent day) — `generate-combined-plan/validator.ts:208-228`.
- Validator check 9: brick day cannot be adjacent to a HARD run — `generate-combined-plan/validator.ts:165-188`.
- Builder enforcement: `enforceHardEasy` downgrades a HARD-on-day-N session to MODERATE when day N-1 was already HARD — `generate-combined-plan/week-builder.ts:315-333`. The exception flag `allowConsolidatedHardException` is hard-coded `false` at the call site — `generate-combined-plan/week-builder.ts:2174-2175`.
- `hardEasyOk(prev, next)` returns false only when both are HARD — `generate-combined-plan/science.ts:404-407`.

### 1.5 Physiological floors (rejected with `success:false` after retries)
- Long-run TSS share, single-sport / marathon: `LONG_RUN_TSS_SHARE_MAX = 0.30` of weekly total raw TSS — `generate-combined-plan/validate-training-floors.ts:16`.
- Long-run TSS share, tri (run-discipline basis): `LONG_RUN_TSS_SHARE_MAX_RUN_DISCIPLINE = 0.30` of run-sport raw TSS, used when weekly run raw TSS ≥ `TRI_RUN_DISCIPLINE_SHARE_MIN_RUN_TSS = 40` — `generate-combined-plan/validate-training-floors.ts:22,28,137-140`.
- Long-run TSS share, tri (fallback for low-run weeks): `LONG_RUN_TSS_SHARE_MAX_TRI_TOTAL_WEEK = 0.40` of weekly total raw TSS — `generate-combined-plan/validate-training-floors.ts:25,141-145`.
- Week-over-week ramp cap, single-sport / run-heavy: `WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX = 0.15` — `generate-combined-plan/validate-training-floors.ts:41,118-120`.
- Week-over-week ramp cap, tri: `WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI = 0.20` — `generate-combined-plan/validate-training-floors.ts:48,118-120`.
- Recovery weeks (`isRecovery`) are skipped for LR-share gating — `generate-combined-plan/validate-training-floors.ts:124-125`.
- Ramp gate skipped when prior week was `isRecovery`, when weekNum 1 is the prior, when phase changes between prev and current week, and when prior raw < 120 TSS — `generate-combined-plan/validate-training-floors.ts:177-189`.
- Floor rebuild path tightens long-run share to `FLOOR_REBUILD_LONG_RUN_SHARE_OF_BUDGET = 0.17` of weekly TSS budget; deep pass to `FLOOR_REBUILD_DEEP_LONG_RUN_SHARE_OF_BUDGET = 0.14` — `generate-combined-plan/validate-training-floors.ts:35,38`. Applied in `buildWeek` long-run miles cap — `generate-combined-plan/week-builder.ts:748-763`.
- Each rebuild pass multiplies block `tssMultiplier` by `FLOOR_REBUILD_TSS_MULTIPLIER_FACTOR = 0.87`, floored at `FLOOR_REBUILD_MIN_MULTIPLIER = 0.30` — `generate-combined-plan/validate-training-floors.ts:51,54,218-226`.
- Generator runs up to `MAX_PHYSIOLOGICAL_FLOOR_PASSES = 12` normal rebuild passes, then one deep pass; if still failing, returns HTTP 400 — `generate-combined-plan/index.ts:159-192`.

### 1.6 Maintenance floors (validator check 7)
- Non-recovery / non-taper weeks must meet per-sport minimum sessions per `MAINTENANCE_FLOORS`: swim ≥ 1, bike ≥ 1, run ≥ 2, strength ≥ 1 — `generate-combined-plan/science.ts:250-255` and `generate-combined-plan/validator.ts:121-145`.
- Swim floor only applies to tri goals — `generate-combined-plan/validator.ts:134`.
- Bike floor skipped when bike raw TSS = 0 and not a tri — `generate-combined-plan/validator.ts:135`.
- Strength floor waived in weeks 1–2 when `transition_mode === 'recovery_rebuild'` — `generate-combined-plan/validator.ts:137-139`.

### 1.7 Phase progression (validator check 12)
- Phase rank must not decrease as weeks advance, except: recovery (rank 0) may appear anywhere; after a taper cycle (rank ≥ 4 reached), `maxSeen` resets so a new base/build cycle is permitted — `generate-combined-plan/validator.ts:233-251`.

### 1.8 Cursor rules (user-imposed; not all enforced in code)
These live under `.cursor/rules/` and are treated as instructions to coding agents, not runtime gates.
- "Lower body strength may only pair with easy endurance; never with quality, long, or brick; auto-pick day" — `.cursor/rules/lower-body-strength-pairing.mdc:1-36`. The matrix at `_shared/schedule-session-constraints.ts:56` enforces this for `lower_body_strength` row vs `quality_*` and `long_*` (all 0). The `easy_run` cell in that row is also 0 (matrix forbids easy run + lower body, contrary to the rule's "easy run allowed" claim — see §9).
- "Performance & session contract (smart server, dumb client)" — `.cursor/rules/performance-session-contract.mdc:1-41`. Aspirational; describes contract shape, not scheduling rules.
- "The Arc is Efforts' deterministic intelligence layer" — `.cursor/rules/arc-intelligence-layer.mdc:1-39`. Aspirational.
- "Keep It Tight" — `.cursor/rules/keep-it-tight.mdc:1-19`. Codebase hygiene, not scheduling.
- "Deploy after shipping" — `.cursor/rules/deploy-after-shipping.mdc:1-21`. Workflow, not scheduling.

---

## 2. Soft preferences (code prefers, can relax)

### 2.1 Anchor and weekday defaults
- Default long ride: Saturday — `_shared/week-optimizer.ts:409`, `generate-combined-plan/week-builder.ts:683-684`.
- Default long run: Sunday — `_shared/week-optimizer.ts:410`, `generate-combined-plan/week-builder.ts:677-678`.
- Default `quality_bike` candidates: Tuesday, Wednesday, Thursday — `_shared/week-optimizer.ts:468`. Builder default: Tuesday — `generate-combined-plan/week-builder.ts:1215`.
- Default `quality_run`: Wednesday — `generate-combined-plan/week-builder.ts:943`. Optimizer default priority: 2 days after `quality_bike`, then day before, then `nDaysAfter(longRide,-2)` — `_shared/week-optimizer.ts:572-579`.
- Default `easy_bike`: Wednesday in builder — `generate-combined-plan/week-builder.ts:1221`. Optimizer order: Wed, Tue, Thu, Mon, Fri — `_shared/week-optimizer.ts:602`.
- Default `easy_run`: Friday — `generate-combined-plan/week-builder.ts:949`, `_shared/week-optimizer.ts:628`.
- Default `swim_easy_day`: Monday; default `swim_quality_day`: Thursday — `generate-combined-plan/week-builder.ts:894-901`.
- Swim base order in optimizer: Tue, Thu, Fri, Wed, Mon, Sun, Sat (then less-loaded day bias, then HIGH-day penalty +5) — `_shared/week-optimizer.ts:925-935`.
- Default rest-day fill order: Mon, Thu, Tue, Fri, Wed, Sun, Sat — `_shared/week-optimizer.ts:979`.
- Default upper-body strength order: Mon, Thu, Tue, Wed, Fri — `_shared/week-optimizer.ts:720,812`.
- Default lower-body candidate order (non-perf): Thu, Fri, Tue, Wed, Mon — `_shared/week-optimizer.ts:752,840`.

### 2.2 Quality-bike / quality-run anchor bumping (week-builder)
- `bikeQualityDay` is bumped off `longRideDay`, `longRunActualDay`, or any rest day, scanning forward up to 6 steps — `generate-combined-plan/week-builder.ts:1231-1243`. Skipped when `enforce_optimizer_anchor_days === true`.
- `bikeEasyDay` bumped off `bikeQualityDay`, `longRideDay`, rest days — `generate-combined-plan/week-builder.ts:1265-1276`.
- When `bike_quality_day` is pinned but `bike_easy_day` is not, `bikeEasyDay` is biased to the day before quality bike — `generate-combined-plan/week-builder.ts:1227-1229`.
- `swim_quality_day` is bumped off `longRideDay`, `longRunActualDay`, rest days, scanning forward — `generate-combined-plan/week-builder.ts:903-913`.
- Swim quality is bumped off `runQualityDay` for completion/support athletes (not allowed to share even though matrix says so for completion strict) — `generate-combined-plan/week-builder.ts:957-975`.
- High-stress group ride day (route snapshot): swim quality bumped off the day after `bikeQualityDay` — `generate-combined-plan/week-builder.ts:1505-1547`.
- `runQualityDay` bumped off `bikeQualityDay` (matrix forbids `quality_run + quality_bike`) — `generate-combined-plan/week-builder.ts:1278-1338`. Priority list: Thu, Fri, Tue, Mon, then ±2 from bike day.
- `runQualityDay` bumped off the calendar day immediately after `bikeQualityDay` (sequential HARD geometry) — `generate-combined-plan/week-builder.ts:1340-1444`. Skipped when athlete preference is `keep_quality_run_*`, when `run_quality_placement === 'standalone_midweek'`, or when `enforce_optimizer_anchor_days === true`.
- Standalone-midweek `quality_run` cannot share `swim_easy_day` (matrix would otherwise allow it) — `generate-combined-plan/week-builder.ts:1446-1503`.
- Newer-swimmer (`learnerSwimExperience`) easy swim is bumped off `runQualityDay` if its yards exceed `LEARNER_HEAVY_SWIM_YARDS` — `generate-combined-plan/week-builder.ts:1685-1733`.

### 2.3 Strength preferred-day honoring
- `strength_preferred_days` filters slot-1 candidates Mon–Fri; if filter empties the pool, falls back to all non-blocked weekdays — `generate-combined-plan/week-builder.ts:1922-1933`.
- For slot 2 (heavy lower), preferred filter applies on top of the 48h+density guards; if no preferred passes guards, drops preferred filter — `generate-combined-plan/week-builder.ts:1992-2010`.

### 2.4 EXPERIENCE MODIFIER soft expansions
- `allowQualityRunQualitySwimSameDay` (performance or co-equal): `quality_run` + `quality_swim` may share a day — `_shared/schedule-session-constraints.ts:158-163` and `_shared/week-optimizer.ts:278-282`.
- Performance + co-equal (`training_intent === 'performance' && strength_intent === 'performance'`): `quality_run` + `lower_body_strength` may share a day (AM run / PM lift consolidated hard day) — `_shared/week-optimizer.ts:284-292`. Builder mirror: only when `isPerformanceCoequal` is true does the matrix-resolution loop preserve QR + LB pair instead of dropping strength — `generate-combined-plan/week-builder.ts:441-456`.
- Performance + co-equal also unlocks `quality_run` the day after `quality_bike` when same-day lower body is placed (relax flag `quality_run_day_after_qb_with_same_day_lower`) — `_shared/week-optimizer.ts:308,345-349`.
- In tri builds, `allowQualityRunSwimSameDay` is forced false even for performance — `generate-combined-plan/week-builder.ts:957-960`.

### 2.5 Phase / approach soft tuning
- `tri_approach === 'base_first'`: race-specific block uses 15% of plan; `race_peak`: 25% — `generate-combined-plan/phase-structure.ts:225-227`.
- `base_first` keeps brick-leg phase at `'build'` (Z2) until final 2 weeks of race-specific — `generate-combined-plan/week-builder.ts:813-818`.
- `preferStandaloneBikeEndurance`: build-phase tri, non-recovery, odd weeks of block — replaces brick with standalone long ride — `generate-combined-plan/week-builder.ts:820-825`.

---

## 3. Conflict resolution priority

### 3.1 Optimizer placement order (`deriveOptimalWeek`)
1. Place `long_ride` (default Sat) and `long_run` (default Sun) — `_shared/week-optimizer.ts:412-413`.
2. Place anchors that may conflict: `quality_bike` anchor day; `group_run` anchor; `masters_swim` anchor — `_shared/week-optimizer.ts:423-463`. If anchor collides with long-day or fails matrix, push to `conflicts[]` and try algorithmic placement instead.
3. Algorithmic `quality_bike` if not anchored: scan candidates Tue/Wed/Thu honoring `hard_bike_avoid_days`; if no fit, retry without that filter and log trade-off — `_shared/week-optimizer.ts:466-489`.
4. `quality_run`: blocked days = long_ride day, long_run day, day-before-long_ride, and (if quality_bike placed) bracketing days. Honor athlete `preferences.quality_run` first using only same-day matrix; log trade-off if sequential rule would object — `_shared/week-optimizer.ts:498-523`.
5. Performance + co-equal: try consolidated `quality_run + lower_body_strength` on day-after `quality_bike` first — `_shared/week-optimizer.ts:529-568`.
6. Standard `quality_run` priority: 2 days after qb, then day before qb, then `nDaysAfter(longRide,-2)`, then all weekdays — `_shared/week-optimizer.ts:570-590`.
7. `easy_bike` mid-week — `_shared/week-optimizer.ts:600-616`.
8. Strength placement (with co-equal-first ordering when applicable) — `_shared/week-optimizer.ts:618-891`.
9. `easy_run` (deferred when `placeStrengthBeforeEasyRun`) — `_shared/week-optimizer.ts:625-679`.
10. Swims (easy first, quality last) — `_shared/week-optimizer.ts:899-963`.
11. Rest-day budget fill: pass 1 claims empty days; pass 2 displaces LOW-only days (never anchors / quality / long); leftover unmet → `conflicts[]` — `_shared/week-optimizer.ts:972-1008`.

### 3.2 Same-day matrix repair in builder (`tryResolveSameDayMatrixConflicts`)
- After everything is placed, if any same-day pair fails the matrix, the resolver iterates up to 32 passes — `generate-combined-plan/week-builder.ts:432`.
- On each pass it picks the first incompatible pair and removes the **strength** session (preferring the `i` strength, else the `j` strength) — `generate-combined-plan/week-builder.ts:457-509`.
- Performance + co-equal exception: do not remove the QR + LB pair — `generate-combined-plan/week-builder.ts:441-456`.
- Each removal records a `ConflictEvent` with `applied_resolution.type='dropped'` — `generate-combined-plan/week-builder.ts:461-501`.

### 3.3 Athlete-preference codes (`conflict_preferences`)
- `PREF_ACCEPT_ACTIONS` — silent accept (no event re-emitted) — `generate-combined-plan/week-builder.ts:215-241`.
- `PREF_DROP_ACTIONS` — drop the session this week — `generate-combined-plan/week-builder.ts:244-250`.
- `PREF_KEEP_QUALITY_RUN_ACTIONS` — keep quality run on preferred day even though it abuts an anchor — `generate-combined-plan/week-builder.ts:253-257`.
- `shift_quality_to_long_run` action: skip mid-week quality run; long run becomes race-pace — `generate-combined-plan/week-builder.ts:1364-1366`, applied at `1610-1626`.

### 3.4 Resolver patterns (`week-conflict-resolver.ts`)
Order of pattern selection — `_shared/week-conflict-resolver.ts:43-65`:
1. Race week → `no_options_race`.
2. Recovery / taper / post-race-rebuild → `no_options_recovery`.
3. `pre_long_run_48h` or `pre_brick_48h` → `offer_alternate_stimulus`.
4. `consecutive_same_discipline` → `offer_adjacent_day`.
5. `consecutive_cross_discipline` or `anchor_conflict` → `athlete_choice_quality_or_stimulus`.
6. `no_clean_day` → `offer_drop_explained`.
7. Default → `offer_drop_explained`.

### 3.5 Co-equal 1× fallback
- `deriveOptimalWeekWithCoEqualRecovery`: if 2× co-equal strength can't fit (`CO_EQUAL_STRENGTH` conflict), retries at `strength_frequency: 1`. If retry also conflicts, both conflict lists are merged. If retry succeeds, returns the 1× week with a `recoveryLine` trade-off — `_shared/week-optimizer.ts:1099-1154`.

---

## 4. Same-day session compatibility matrix

The 10×10 matrix — values copied verbatim from `ROWS` in `_shared/schedule-session-constraints.ts:47-58`. ✓ = may share a day; ✗ = may not.

|                       | easy_bike | easy_run | easy_swim | quality_swim | quality_bike | quality_run | long_ride | long_run | lower_body_strength | upper_body_strength |
|-----------------------|-----------|----------|-----------|--------------|--------------|-------------|-----------|----------|---------------------|---------------------|
| **easy_bike**         | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| **easy_run**          | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **easy_swim**         | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| **quality_swim**      | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| **quality_bike**      | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **quality_run**       | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **long_ride**         | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| **long_run**          | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| **lower_body_strength** | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **upper_body_strength** | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |

Source: `_shared/schedule-session-constraints.ts:47-58`. Diagonal ✗ entries (e.g. `easy_bike × easy_bike` is shown as ✓; `quality_bike × quality_bike` is ✗ in the row table) are only consulted when `a !== b`; identical kinds short-circuit to compatible at `_shared/schedule-session-constraints.ts:144`.

### 4.1 Pairwise overrides applied elsewhere
- `race_event` paired with anything → ✓ — `_shared/schedule-session-constraints.ts:142`.
- Both legs tagged `brick` → ✓ regardless of matrix — `_shared/schedule-session-constraints.ts:253`.
- `kick_tri_long_course`-tagged swim + `long_run` → ✓ — `_shared/schedule-session-constraints.ts:258-266`.
- One-of-pair tagged `brick` + non-brick session → ✓ — `_shared/schedule-session-constraints.ts:270-272`.
- `strictStandaloneQualityRun` (when `run_quality_placement === 'standalone_midweek'`): `quality_run × easy_swim` and `quality_run × easy_bike` are forced to ✗ even though the matrix says ✓ — `_shared/schedule-session-constraints.ts:148-154`.
- `allowQualityRunQualitySwimSameDay` (performance / co-equal, non-tri only in builder): `quality_run × quality_swim` becomes ✓ — `_shared/schedule-session-constraints.ts:158-163`, `generate-combined-plan/week-builder.ts:957-960`.
- Performance + co-equal in optimizer: `quality_run × lower_body_strength` becomes ✓ — `_shared/week-optimizer.ts:288-291`.
- Heavy swim (>1500 yd) for a `learnerSwimExperience` athlete remaps `easy_swim` row to `quality_swim` row for the lookup — `_shared/schedule-session-constraints.ts:117,210-217`.
- `race_event` row maps to `easy_run` row for lookup purposes (used only when comparing race vs another race-event-mapped slot) — `_shared/schedule-session-constraints.ts:88-90`.
- `walk` / `hike` types map to `easy_run`; unknown types map to `easy_bike` — `_shared/schedule-session-constraints.ts:236-238`.

---

## 5. Phase progression

### 5.1 Phase TSS budgets
`PHASE_TSS_RANGES` (raw TSS, midpoint scaled by CTL × hours × `tssMultiplier`) — `generate-combined-plan/science.ts:25-31`:
- base: 250–450
- build: 400–600
- race_specific: 450–700
- taper: 200–400
- recovery: 80–200

`scaledWeeklyTSS`: `mid * ctlFactor * hourFactor * tssMultiplier`, where `ctlFactor = clamp(currentCTL/60, 0.5, 1.5)` and `hourFactor = clamp(weeklyHours/10, 0.5, 1.5)`, then clipped to `[min, max]` — `generate-combined-plan/science.ts:61-72`.

### 5.2 Loading patterns (3:1 / 2:1)
Multipliers for week-within-block — `generate-combined-plan/science.ts:385-391`:
- `'3:1'`: weeks 1–4 → `[1.00, 1.08, 1.15, 0.65]`. Week 4 marked `isRecovery`.
- `'2:1'`: weeks 1–3 → `[1.00, 1.10, 0.65]`. Week 3 marked `isRecovery`.
- Default loading pattern: `'3:1'` — `generate-combined-plan/index.ts:74`.
- Validator check 5: build / base / race_specific weeks must hit a recovery within `blockSize + 1` (4+1 for 3:1, 3+1 for 2:1) — `generate-combined-plan/validator.ts:95-107`.

### 5.3 Tapers
`taperWeeks(distance, priority)` — `generate-combined-plan/science.ts:277-325`. A-priority defaults: sprint/olympic/10k/5k = 1; 70.3/half/half_marathon = 2; ironman/full/marathon = 3. B = halved roughly. C = 1 across the board. Default fallback when distance not found = 2.
- Validator check 6: every plan with an A-race-equivalent block must have a taper block — `generate-combined-plan/validator.ts:111-117`.
- Pre-A-race long-run cap (taper, hasTri, not race week): long-run ≤ 5 mi — `generate-combined-plan/week-builder.ts:743-746`.
- Per-week taper TSS multiplier inside the block: `max(0.45, 1.0 - (w - startWeek) * 0.10)` — `generate-combined-plan/phase-structure.ts:397-399`.

### 5.4 Post-race recovery
`recoveryDaysPostRace(distance, priority)` — `generate-combined-plan/science.ts:328-376`. A-priority defaults: sprint=5, olympic=7, 70.3=14, ironman=21, marathon=21, half_marathon=14, 10k=7, 5k=5. B/C scale shorter.
`recoveryWeeksPostRace = ceil(recoveryDays/7)`, min 1 — `generate-combined-plan/science.ts:379-381`.
- Validator check 8: a `taper → build` transition without a `recovery` block in between fails — `generate-combined-plan/validator.ts:149-161`.
- Recovery block `tssMultiplier`: 0.5 in `insertRecoveryBlock`, 0.45 elsewhere — `generate-combined-plan/phase-structure.ts:285,398-399`.

### 5.5 Phase boundaries (`buildPhaseTimeline`)
- Total plan length: ends in the A-race week, clamped to `[4, 52]` weeks — `generate-combined-plan/phase-structure.ts:107`.
- Two chronological tri goals, w2 > w1: full macrocycle to first → recovery → abbreviated build/taper to second; no quality after w1 — `generate-combined-plan/phase-structure.ts:127-148`.
- Single A or sequential (>16 wk gap): each gets its own full cycle — `generate-combined-plan/phase-structure.ts:149-165`.
- Overlapping (8–16 wk gap): full cycle to first → recovery → abbreviated build → taper to second — `generate-combined-plan/phase-structure.ts:175-181`.
- Compressed (4–8 wk gap): shared peak, separate tapers via `buildSharedPeakBlocks` — `generate-combined-plan/phase-structure.ts:182-184,325-343`.
- Single-peak / tight (≤4 wk gap): full to first, recovery, abbreviated to second — `generate-combined-plan/phase-structure.ts:186-200`.
- `classifyEventRelationship`: >16 sequential, >8 overlapping, >4 compressed, ≤4 single_peak — `generate-combined-plan/phase-structure.ts:68-73`.
- Single-event back-to-front layout: taper → race_specific → build → base. RS weeks = `clamp(floor(totalWeeks * rsPct), 3, 6)`. Build weeks = `clamp(floor(totalWeeks * 0.30), 4, 8)`. `rsPct` 0.15 for `base_first`, 0.25 for `race_peak`. `buildPct = 0.30` — `generate-combined-plan/phase-structure.ts:225-251`.
- Abbreviated post-B-A blocks (no `build`): base + race_specific + taper. RS weeks = `clamp(floor(preTaperWeeks * 0.4), 1, 3)` — `generate-combined-plan/phase-structure.ts:291-323`.

### 5.6 Sport distribution
- Tri midpoints — `generate-combined-plan/science.ts:102-107`: sprint (22/38/32/8), olympic (22/42/30/6), 70.3 (18/50/26/6), ironman (13/55/26/6).
- Run-only midpoints — `generate-combined-plan/science.ts:185-190`: marathon 82% run, half_marathon 84%, 10k/5k 86% — strength always 10%.
- Limiter shift: limiter sport +0.07 (capped at 0.65), other sports reduced equally — `generate-combined-plan/science.ts:234-244`.
- Swim-intent focus shifts (tri only): `split` → swim+0.06, bike-0.04, run-0.02; `protect_run` → swim+0.06, bike-0.06, run 0; `protect_bike` → swim+0.06, run-0.06, bike 0 — `generate-combined-plan/science.ts:200-207`.

### 5.7 Other phase rules
- `BRICKS_PER_WEEK`: base=0, build=1, race_specific=2, taper=1, recovery=0 — `generate-combined-plan/science.ts:268-274`.
- `PHASE_ZONE_DIST` (low/tempo/high): base 87/8/5, build 80/10/10, race_specific 77/13/10, taper 83/7/10, recovery 95/5/0 — `generate-combined-plan/science.ts:259-265`.
- 80/20 enforcement: weekly hard-minutes (HARD × 0.65 + MODERATE × 0.50) ≤ `total * (1 - target.low)`. Downgrade priority: swim → bike → run. Protected sessions: race, brick, long_run, long_ride, quality-tagged — `generate-combined-plan/week-builder.ts:347-396`.
- Validator check 2: `eighty_twenty_ratio < 0.70` fails (i.e. <70% Z1-2 minutes) — `generate-combined-plan/validator.ts:59-65`.
- Validator check 4: each week's projected CTL increase must not exceed `rampThresholds(ctl).moderate` — `generate-combined-plan/validator.ts:81-91`. Thresholds — `generate-combined-plan/science.ts:76-81`: ≤45 → mod 6; ≤70 → 7; ≤100 → 8; >100 → 10.
- Validator check 3 (`tss_within_budget`) is hardcoded `true` — see §10 — `generate-combined-plan/validator.ts:267`.

---

## 6. Discipline-specific rules

### 6.1 Triathlon / multi-sport

**Brick placement:**
- `BRICKS_PER_WEEK[phase]` determines weekly count — `generate-combined-plan/science.ts:268-274`. Recovery / race-week / `recoveryRebuildWeek1` force 0 — `generate-combined-plan/week-builder.ts:687-691`.
- Brick placed on `longRideDay` (default Saturday), unless `preferStandaloneBikeEndurance` swaps it for a long ride — `generate-combined-plan/week-builder.ts:828-853`.
- Brick run length: `brickRunTargetMiles(distance, phase)` — clamped to `[1.5, 8]` mi. Multipliers vs race-run distance: base 0.20, build 0.30, race_specific/peak 0.42, taper 0.22 — `generate-combined-plan/science.ts:126-153`.
- `base_first` approach: brick stays at "build" intensity (Z2 run) until last 2 weeks of race_specific — `generate-combined-plan/week-builder.ts:813-818`.
- Late-race brick week (`weeksToRace ≤ 3 && useBrickThisWeek`): mid-week run becomes a tempo, not VO2 — `generate-combined-plan/week-builder.ts:1641-1644`.
- Validator check 9: brick day cannot be adjacent to a HARD run — `generate-combined-plan/validator.ts:165-188`.
- AMPK ordering (performance + co-equal): same-day non-easy bike + non-easy run → run AM, bike PM — `generate-combined-plan/week-builder.ts:174-201`.

**Long-ride caps for tri:**
- `expectedBikeDurationHours(distance)`: sprint 1.0, olympic 1.5, 70.3/half 3.0, ironman/full 6.0, default 3.0 — `generate-combined-plan/science.ts:113-123`.
- Long-ride hours capped to `max(raceBikeDuration * 0.8, min(raceBikeDuration * 1.1, weeklyHours * 0.45))` — `generate-combined-plan/week-builder.ts:776-782`.
- Recovery / return-from-deload tri: long-ride scaled to 85% — `generate-combined-plan/week-builder.ts:784-787`.
- `recoveryRebuildWeek1` tri: long-run ≤ 50 min, long-ride ≤ 90 min — `generate-combined-plan/week-builder.ts:797-804`.

**Long-run floors:**
- `longRunFloorMiles(distance, phase)` — `generate-combined-plan/science.ts:156-182`. Peak target by distance (sprint 4, olympic 7, 70.3/half 11, ironman/full 18). Phase multipliers: base 0.50, build 0.75, race_specific 1.00, taper 0.45, recovery 0.40.
- Tri non-recovery, non-race-week: `longRunMiles = max(longRunMiles, longRunFloor)` — `generate-combined-plan/week-builder.ts:726-730`.
- Recovery tri: cap long run ≤ 8 mi. Return-from-deload tri: ≤ 9 mi. Taper non-race-week tri: ≤ 5 mi — `generate-combined-plan/week-builder.ts:732-746`.
- Race-week long run: ≤ 45 min and 3-5 mi — `generate-combined-plan/week-builder.ts:721-724`.

**Multi-event taper / chronology:**
- Two chronological tri goals: post-first-race recovery, then abbreviated build to second — `generate-combined-plan/phase-structure.ts:127-148,166-201`.
- `triRaceNextPlanWeek` and `weeksToRace ≤ 3`: structured race-pace long run is gated off (Z2 only) — `generate-combined-plan/week-builder.ts:861-870`.
- `useStructuredRacePaceLong` requires phase=`race_specific`, not recovery, no tri race next week, weeksToRace > 3 — `generate-combined-plan/week-builder.ts:861-870`.

### 6.2 Swim

**Frequency by intent / level:**
- `swims_per_week` is set in athlete preferences (0–3) — `_shared/week-optimizer.ts:84`.
- 3rd swim slot only when `swim_intent === 'focus'` and tri — `generate-combined-plan/week-builder.ts:1010-1013`.
- Recovery week tri + learner swimmer: maintain 2 swim slots via `getTwoSlotRecoveryLearnerSwimTemplates` — `generate-combined-plan/week-builder.ts:1098-1106`.
- Single recovery swim otherwise — `generate-combined-plan/week-builder.ts:1107-1108`.
- `swimPct === 0` (run-primary in tri): downscale all templates to `max(800, target_yards * 0.35)` — `generate-combined-plan/week-builder.ts:1127-1134`.
- Open-water practice substitution: tri, race_specific or taper-not-race-week, even week-in-block — `generate-combined-plan/week-builder.ts:1772-1778`.

**Swim TSS / yards:**
- TSS/hour: easy 35, moderate 55, hard 75 — `generate-combined-plan/science.ts:36-42`.
- `SWIM_TSS_PER_HR = 55`; `SWIM_YDS_PER_MIN = 30` (~1650 yd/hr) — `generate-combined-plan/week-builder.ts:1137-1138`.
- `swimMult = clamp(swim_volume_multiplier, 0.48, 1.0)` — `generate-combined-plan/week-builder.ts:711`.
- `applyOverdistanceIfApplicable`: only for Full IM advanced endurance slot in build wk≥4 OR race_specific wk≤2 → fixed `OD_VOLUME_YD = 4600` — `generate-combined-plan/swim-protocol-v21.ts:12,33-54`.
- Kick-focus IF: `0.75` for sprint/olympic, `0.60` for 70.3/full — `generate-combined-plan/swim-protocol-v21.ts:68-70`.
- Pull-focus IF: `0.80` — `generate-combined-plan/swim-protocol-v21.ts:86`.
- Endurance IF: `0.70` — `generate-combined-plan/swim-protocol-v21.ts:89`.
- Default CSS pace if unknown: `105 sec/100yd` — `generate-combined-plan/swim-protocol-v21.ts:134-138`.
- Kick gear required: sprint/olympic → `kickboard`; 70.3/full → `fins` — `generate-combined-plan/swim-protocol-v21.ts:94-96`.
- Pull gear required: `pull buoy` — `generate-combined-plan/swim-protocol-v21.ts:99-101`.

**Cutoff pressure / 70.3 floors:**
- `apply703SlowSwimmerWeeklyFloors` enforces minimum yards for 70.3 athletes flagged with cutoff pressure — used at `generate-combined-plan/week-builder.ts:1176-1189`.
- `promote703SwimIntentForCutoffRisk` may upgrade `swim_intent` to focus pre-reconcile — `generate-combined-plan/index.ts:86`.

**Schedule pairing hints (kick-focus):**
- `getSwimBlockingRulesKickFocus`: 70.3/full → blocks `lower_body_strength` only; sprint/olympic → blocks both `long_run` and `lower_body_strength` — `generate-combined-plan/swim-protocol-v21.ts:128-131`.

### 6.3 Bike

- `quality_bike` defaults Tuesday in builder; optimizer scans Tue/Wed/Thu — `generate-combined-plan/week-builder.ts:1215`, `_shared/week-optimizer.ts:468`.
- Bumping rules: see §2.2.
- `groupRideQualityBikeSession` vs `groupRideSession(label, route)`: when `bike_quality_label` is non-empty, the anchor is rendered as a labeled group ride (no structured intervals) — `generate-combined-plan/week-builder.ts:1575-1593`.
- Group-ride hours resolution priority: route_estimated_hours → route_estimated_minutes → explicit hours → explicit minutes → default 1.5 hr; clamped per source — `generate-combined-plan/week-builder.ts:2305-2339`.
- High-vertical-stress group ride bumps `swim_quality_day` off the next day — see §2.2.
- Easy-bike TSS gate: `remaining > 50` unless `bike_easy_day` is explicitly set; recovery/`recoveryRebuildWeek1` always places a 45-min spin — `generate-combined-plan/week-builder.ts:2123-2142`.
- Easy bike duration: `clamp(remaining*0.50/55, 0.75, 2.5)` hours — `generate-combined-plan/week-builder.ts:2133-2138`.
- Validator check 10: every run session must have `weighted_tss = tss * 1.3` (`SPORT_IMPACT_MULTIPLIER.run`) — `generate-combined-plan/validator.ts:193-204`. SPORT_IMPACT_MULTIPLIER: run 1.3, bike 1.0, swim 0.8, strength 1.0, race 1.0 — `generate-combined-plan/science.ts:12-18`.

### 6.4 Run

- `quality_run` placement: see §2.2 and §3.1.
- Long-run anchor day shifts -1 if it collides with an existing brick session — `generate-combined-plan/week-builder.ts:858-861`.
- Long-run minutes: recovery → `min(60, runTotalMin*0.50)`; taper → `min(75, runTotalMin*0.55)`; else `min(150, runTotalMin*0.60)` — `generate-combined-plan/week-builder.ts:714-718`.
- Long-run miles derived from 9.5 min/mi — `generate-combined-plan/week-builder.ts:719`.
- Mid-week easy run for run-only plans: fixed Thursday, not driven by swim prefs — `generate-combined-plan/week-builder.ts:1758-1764`.
- Mid-week easy run mileage: recovery → 25% of long; `recoveryRebuildWeek1` → `min(30, max(3, longMi*0.35))`; else `max(3, longMi*0.30)` — `generate-combined-plan/week-builder.ts:1804-1813`.
- Quality-run flavor by phase / approach — `generate-combined-plan/week-builder.ts:1635-1679`:
  - `recoveryRebuildWeek1` / recovery / taper / `recoveryRebuildWeek2EasyRunOnly` → easy run only.
  - Late-race brick week (`weeksToRace ≤ 3 && useBrickThisWeek`) → tempo.
  - `base_first` approach: race_specific = race-pace; base = interval ladder progressing to 8 reps; build = tempo.
  - `race_peak`: race_specific = race-pace; build (tri) = VO2; otherwise interval ladder.
- TSS-per-hour by sport × intensity — `generate-combined-plan/science.ts:36-42`. Run: easy 55, moderate 75, hard 100. Bike: 50/70/100. Strength: 40/55/75.
- `estimateSessionTSS` halves strength via `STRENGTH_BUDGET_FRACTION = 0.5` — `generate-combined-plan/science.ts:21,44-53`.

---

## 7. Strength integration

### 7.1 Frequency by phase
- base: 2× — `generate-combined-plan/week-builder.ts:1825-1826`.
- build / race_specific: 1× default; 2× when `strength_intent === 'performance'` — `generate-combined-plan/week-builder.ts:1827-1830`.
- taper / recovery: 1× — `generate-combined-plan/week-builder.ts:1830-1832`.
- Tri + `isRecovery`: capped at 1 — `generate-combined-plan/week-builder.ts:1836`.
- `recoveryRebuildWeek1`: forced to 0 — `generate-combined-plan/week-builder.ts:1837`.
- `strength_sessions_cap` clamp to `[0, 3]` if set — `generate-combined-plan/week-builder.ts:1839-1843`.

### 7.2 Slot ordering
- Tri (week-builder, non-optimizer path): slot 1 = upper (`sessionIndex: 1`); slot 2 = lower (`sessionIndex: 0`) — `generate-combined-plan/week-builder.ts:1944-1960,2080-2096`.
- Optimizer mirror: Mon upper, Thu lower (default order for performance + co-equal) — `_shared/week-optimizer.ts:720,752`.
- Optimizer export order: all upper days first (Mon→Sun), then all lower days (Mon→Sun) — `_shared/week-optimizer.ts:194-209`.
- Legacy `DayName[]` form: index 0 = upper, rest = lower — `_shared/week-optimizer.ts:140-141,231-235`.

### 7.3 Pairing rules
- Same-day with lower-body strength matrix row (✓ cells): `easy_bike`, `easy_swim`, `quality_swim`, `upper_body_strength` — `_shared/schedule-session-constraints.ts:56`. (`easy_run` is ✗ — see §9 disagreement with the cursor rule.)
- Same-day with upper-body matrix row (✓ cells): `easy_bike`, `easy_swim`, `quality_swim`, `quality_bike`, `quality_run`, `lower_body_strength` — `_shared/schedule-session-constraints.ts:57`.
- Performance + co-equal exception: `quality_run + lower_body_strength` allowed AM/PM — `_shared/week-optimizer.ts:288-291`, `generate-combined-plan/week-builder.ts:441-456`.
- Support strength tri: lower-body cannot share `runQualityDay` — `generate-combined-plan/week-builder.ts:1980-1982`.

### 7.4 Spacing
- Optimizer: 2× requires ≥3 days between upper and lower (wrap-min) — `_shared/week-optimizer.ts:729-732,773-775`.
- Optimizer 3× upsell / placement: 2-day spacing across all three strength days (wrap-min) — `_shared/week-optimizer.ts:698-702,1033-1036`.
- Optimizer SEQUENTIAL: 48h between consecutive `lower_body_strength`; 48h after `lower_body_strength` before `long_run`; 48h before `long_ride` / `long_run` (lower cannot be in the next 1 or 2 days) — `_shared/week-optimizer.ts:363-377`.
- Builder heavy-lower 48h floor vs `longRunActualDay` and brick days — see §1.3 — `generate-combined-plan/week-builder.ts:140-151,1986-1991`.
- Builder day-before bike+run quality density block — `generate-combined-plan/week-builder.ts:157-171,1990`.

### 7.5 Strength fallback location when no slot fits
- Optimizer 3rd-strength: if no day has 2-day spacing AND passes `noLowerBody` (long_ride, long_run, day-before-each), surface `CO_EQUAL_STRENGTH … session 3 of 3` in `conflicts[]`, push trade-off "Strength frequency reduced from 3× to 2×" — `_shared/week-optimizer.ts:710-715`.
- Optimizer 2nd-strength (non-coequal path): same pattern, "reduced to 1×" — `_shared/week-optimizer.ts:879-886`.
- Optimizer 1st-strength: if no upper day fits, "reduced to 0×" — `_shared/week-optimizer.ts:828-834`.
- Optimizer co-equal 2× failure: `CO_EQUAL_STRENGTH` conflict triggers `deriveOptimalWeekWithCoEqualRecovery` to retry at 1× — `_shared/week-optimizer.ts:805-808,1099-1154`.
- Builder heavy-lower fallback chain: preferred → drop preferred → drop 48h guard → drop density guard. Each step warns to console and emits a `heavy-lower-<day>` ConflictEvent — `generate-combined-plan/week-builder.ts:1996-2067`.
- Builder same-day matrix repair: drops the **strength** session (preserving QR + LB pair only when `isPerformanceCoequal`) — `generate-combined-plan/week-builder.ts:432-509`.

### 7.6 Optimizer-driven strength placement (tri reconciler path)
- When `strength_optimizer_slots` is set on AthleteState, builder uses those weekdays directly without local placement — `generate-combined-plan/week-builder.ts:1845-1895`.
- `enforce_optimizer_anchor_days = true` is set by the reconciler — `generate-combined-plan/reconcile-athlete-state-week-optimizer.ts:159`. This skips bumping logic at `generate-combined-plan/week-builder.ts:1232-1243,1265-1276,1343-1352,1448,1513`.

### 7.7 Strength frequency text (prompt-only)
`STRENGTH_FREQUENCY_RULES_TEXT` describes valid weekday tuples for prompts — `_shared/schedule-session-constraints.ts:305-309`:
- 2×: ≥3 days between sessions. Valid Mon+Thu, Mon+Fri, Tue+Fri, Tue+Sat. Invalid Mon+Tue, Mon+Wed, Tue+Wed.
- 3×: ≥2 days; alternate U/L. Valid Mon+Wed+Fri, Tue+Thu+Sat. Invalid Mon+Tue+Wed.
- If Wed = quality_bike, Wed-strength must be upper-only.

---

## 8. Known impossible configurations / fallbacks

### 8.1 "No valid placement" sites
- Optimizer `quality_run` failure → conflict `quality_run: no valid placement — even consolidated AM run / PM lower could not be scheduled` — `_shared/week-optimizer.ts:594-598`.
- Optimizer `easy_bike` failure → `easy_bike: no matrix-clean weekday available` — `_shared/week-optimizer.ts:611-616`.
- Optimizer `easy_run` failure → `easy_run: no matrix-clean weekday available` — `_shared/week-optimizer.ts:669-674`.
- Optimizer `upper_body_strength` failure → `upper_body_strength: no matrix-clean weekday found` and "Strength frequency reduced … to 0×" — `_shared/week-optimizer.ts:828-834`.
- Optimizer 2× lower failure (non-coequal) → "reduced to 1×" — `_shared/week-optimizer.ts:879-886`.
- Optimizer 3× failure → "reduced to 2×" — `_shared/week-optimizer.ts:710-715`.
- Optimizer co-equal 2× failure → `CO_EQUAL_STRENGTH` conflict; recovery layer retries at 1× — `_shared/week-optimizer.ts:805-808,1099-1154`.
- Optimizer swim failure → "Swim frequency reduced from N× to M×" — `_shared/week-optimizer.ts:954-961`.
- Optimizer rest-day budget failure → "Couldn't fit N rest days into a Mday week without dropping anchors" — `_shared/week-optimizer.ts:1003-1007`.
- Builder same-day matrix unresolved after strength removal → `console.warn` + `matrix-post-N` `ConflictEvent` with `applied_resolution.type='none'` — `generate-combined-plan/week-builder.ts:2226-2250`.
- Builder heavy-lower with all guards dropped → `lower-density-guard-dropped` warning logged — `generate-combined-plan/week-builder.ts:2026-2040`.
- Floor rebuild after 13 passes (12 normal + 1 deep) still failing → HTTP 400 with `physiological_floor_violations` — `generate-combined-plan/index.ts:174-192`.

### 8.2 Silent re-assignments
- Default-day collisions are bumped silently when `enforce_optimizer_anchor_days === true` (the reconciler sets this for tri).
- `swimQualityDay === swimEasyDay` collision: forced to Thursday — `generate-combined-plan/week-builder.ts:902`.
- `runQualityDay === runEasyDay` collision: easy run shifts +1 day — `generate-combined-plan/week-builder.ts:950-952,1318-1320`.

### 8.3 "Should never happen" / accept-silently branches
- Validator check 3 (`tss_within_budget`) is hardcoded `true: // budget built-in to week builder; always within` — `generate-combined-plan/validator.ts:267`. The `checkTSSWithinBudget` function exists at `generate-combined-plan/validator.ts:69-77` but is not called.
- Soft validation: failures are logged via `console.warn` but the plan still ships — `generate-combined-plan/index.ts:204-209`.

---

## 9. Code duplications and disagreements

The header comment at `_shared/week-optimizer.ts:1-9` warns: *"This file implements scheduling logic that is also implemented in generate-combined-plan/week-builder.ts. The same-day matrix is shared via schedule-session-constraints.ts but sequential rules and placement logic are duplicated. Any rule change MUST be applied to both files."* The corresponding warning is at `generate-combined-plan/week-builder.ts:1-13`.

### 9.1 Same-day matrix
- Single source: `_shared/schedule-session-constraints.ts:47-58`. Both `_shared/week-optimizer.ts` and `generate-combined-plan/week-builder.ts` import it. **Agree** on values.

### 9.2 Sequential rules
- `_shared/week-optimizer.ts:311-386` (`sequentialOk`): full set, including 48h post-lower, 48h pre-long_ride/long_run, day-before-combined-quality_bike+quality_run.
- `generate-combined-plan/week-builder.ts`: implements the 48h-pre-long_run/brick rule via `heavyLowerBlockedWithin48hOfLongRunOrBrick` (`140-151`) and the day-before-combined-quality density rule via `lowerBlockedImmediatelyBeforeBikeRunQuality` (`157-171`); does **not** explicitly enforce the optimizer's "after long_ride → no HIGH today (except long_run)" rule at placement time — instead it relies on the static `longRideDay = Saturday`, `longRunDay = Sunday` defaults plus `enforceHardEasy` to catch HARD-on-HARD adjacents — `generate-combined-plan/week-builder.ts:315-333`.
- **Disagree on coverage**: builder has no explicit "after quality_run → no quality_bike tomorrow" check; it relies on bumping `bikeQualityDay`/`runQualityDay` separation via §2.2 logic. The optimizer encodes both directions.

### 9.3 Strength placement
- Optimizer (`_shared/week-optimizer.ts:618-891`) and builder (`generate-combined-plan/week-builder.ts:1816-2112`) both place strength. **Agree** on default Mon-upper / Thu-lower geometry. **Agree** on the performance + co-equal AM-run / PM-lower exception.
- Optimizer enforces ≥3-day upper/lower spacing (`_shared/week-optimizer.ts:729-732,773-775`). Builder does **not** enforce that explicitly — it picks slot 2 from a Mon–Fri pool with 48h-vs-long-run + density guards but no minimum-distance check from slot 1 — `generate-combined-plan/week-builder.ts:1986-1991`.
- Builder respects `strength_preferred_days` (`1922-1933`). Optimizer ignores athlete preferred-days and chooses by its own priority.
- **Reconciler unifies them**: when `strength_optimizer_slots` is set, builder skips its own placement and uses optimizer days verbatim — `generate-combined-plan/week-builder.ts:1845-1895`, `generate-combined-plan/reconcile-athlete-state-week-optimizer.ts:159-160`.

### 9.4 Anchor-day defaults
- Long ride: both default Saturday — agree (`_shared/week-optimizer.ts:409`, `generate-combined-plan/week-builder.ts:683-684`).
- Long run: both default Sunday — agree (`_shared/week-optimizer.ts:410`, `generate-combined-plan/week-builder.ts:677-678`).
- `quality_bike`: optimizer scans Tue→Wed→Thu; builder defaults Tuesday — agree on Tuesday as first choice.
- `quality_run`: optimizer prefers `nDaysAfter(qb,2)`; builder defaults Wednesday — disagree on standalone default but equivalent when qb is Tuesday.

### 9.5 Cursor rule vs matrix
- `.cursor/rules/lower-body-strength-pairing.mdc:13-16` says lower-body strength may share a day with **easy bike, easy run, easy swim**. The matrix at `_shared/schedule-session-constraints.ts:56` has `lower_body_strength × easy_run = 0` (✗). The matrix is enforced at runtime; the cursor rule is documentation only.

### 9.6 Per-discipline tri overrides
- Builder forces `allowQualityRunSwimSameDay = false` for tri (`generate-combined-plan/week-builder.ts:957-960`); optimizer does not have an equivalent tri-only flag — it derives `allowQrQs` purely from `training_intent` / `strength_intent` (`_shared/week-optimizer.ts:278-280`). For a tri performance athlete with `quality_run` and `quality_swim`, the optimizer would put them on the same day; the builder bumps swim quality.

### 9.7 Plain text vs code
- `SEQUENTIAL_RULES_TEXT` (`_shared/schedule-session-constraints.ts:295-303`): the prose includes "After long_ride → keep spacing from long_ride and quality_bike per recovery" for `lower_body_strength`. The optimizer enforces 48h post-lower-vs-long via `_shared/week-optimizer.ts:363-367` but does **not** enforce a 48h gap between `lower_body_strength` and `quality_bike` despite the prose mention.
- `STRENGTH_FREQUENCY_RULES_TEXT` (`_shared/schedule-session-constraints.ts:305-309`): the "If Wed = quality_bike, Wed must be upper-only" rule is described in prose. The matrix at `_shared/schedule-session-constraints.ts:52,56` already enforces this implicitly: `quality_bike × lower_body_strength = 0` and `quality_bike × upper_body_strength = 1`. No standalone Wed-specific code path was found.

---

## 10. Possibly-unreachable code

- `generate-combined-plan/validator.ts:69-77` — `checkTSSWithinBudget` is defined but never called; `validatePlan` returns hardcoded `true` for that key at line 267. Suspicion: the comment says "budget built-in to week builder; always within" — the function exists for future re-enable.
- `generate-combined-plan/week-builder.ts:2174` — `allowConsolidatedHardException = false` is a literal at the call site of `enforceHardEasy(grid, allowConsolidatedHardException)`. The exception branch in `enforceHardEasy` (`generate-combined-plan/week-builder.ts:323-324`) is therefore unreachable from this call site. The comment at `2172-2173` explicitly says this was disabled.
- `_shared/week-optimizer.ts:1010-1041` — `can_offer_third_strength` upsell is only consumed by arc-setup chat (per the comment); not consulted by `generate-combined-plan` callers. Search confirms no consumer in `generate-combined-plan/` reads `can_offer_third_strength`.
- `_shared/week-optimizer.ts:1168-1264` — `validatePreferredDays` exports a standalone validator. Used by external materialize / arc-setup paths; no caller inside `generate-combined-plan/`. Suspicion: it's a defense-in-depth shim for arc-setup (per the doc comment at `1158-1167`).
- `generate-combined-plan/week-builder.ts:2352-2441` — `buildAssessmentWeekSessions` is exported and called from `index.ts:277`, but only when `assessment_week_preference === 'assessment_first'`. Reachable; flagged here only because there is no scheduling-rule logic in it (it bypasses all matrix/sequential gates by emitting fixed Mon/Wed/Fri test slots).

---
