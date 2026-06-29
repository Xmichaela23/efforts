# SPEC — E3a: non-race prescription gains HR + pace zones (first consumer of the shared spine)

**Status: SPEC — review before cut. Not approved, not implemented.** First consumer wiring of the shared endurance model (`_shared/endurance/`, committed E1+E2 / `819d2ebf`). Implements the first half of SUB-DECISION A (approved). Companion: `SPEC-shared-endurance-model.md` §10. **Captured:** 2026-06-28.

---

## 1. Intent
The non-race generator (`sustainable`) stops prescribing effort-only strings and starts prescribing **real dual-anchor zones** (HR via Friel %LTHR / Karvonen %HRR; pace via Daniels VDOT) drawn from the shared spine. RPE drops to the **no-data fallback**. This is E3a — **zones into the prescription only**; volume stays the existing table (E3b does the bottom-up rebuild). **Races stay byte-identical.**

## 2. Scope boundary
- **In:** thread the athlete's learned zone inputs into the generator; compute zones from the spine; inject zone targets into the three `sustainable` session descriptions; RPE fallback.
- **Out (E3b):** the bottom-up volume rebuild — `WEEKLY_MILEAGE` / `LONG_RUN_PROGRESSION` stay untouched in E3a, so **session mileage is identical to today**. Only the descriptions change.
- **Out (deferred):** the forgiving/sharp distribution *shift values* (dial stays neutral); structuring zones as materialize-plan tokens (E3a uses description text).

## 3. The cut

### Piece 1 — resolve zone inputs the SAME WAY the baselines screen does
`generate-run-plan/index.ts` resolves the athlete's HR/pace inputs from `user_baselines` and threads them into `GeneratorParams` (new fields `lthr / max_hr / resting_hr / vdot`). **The resolution must mirror `TrainingBaselines.tsx:1869-1875` exactly — the plan uses whatever baselines holds, including age-estimated zones, not only learned:**
- **maxHR** = `configured_hr_zones.manual_run_max_hr` → `learned_fitness.run_max_hr_observed` → age-est (`220 − age`)
- **LTHR** = `configured_hr_zones.manual_run_lthr` → `learned_fitness.run_threshold_hr` → age-est (`round(maxHR × 0.88)`)
- **restingHR** = `performance_numbers.restingHeartRate` → `resting_hr` → `configured_hr_zones.resting_heart_rate` → 60
- **VDOT** (pace) = learned threshold pace → 5K-derived score → none. **Pace has no age-est tier** (can't estimate pace from age), so no learned pace = RPE pace.
- age-est needs `user_baselines.birthday`.

The seam this closes: the first cut read *only* the learned slot and ignored the age-estimated zones the screen shows. No new learning — read what baselines holds, the way the screen reads it.

### Piece 2 — wire the shared spine into `sustainable`
`generators/sustainable.ts` imports `_shared/endurance/`: compute the athlete's zone set once per plan —
- HR: `hrZones(lthr, maxHR, restingHR)` → Friel (preferred) or Karvonen.
- Pace: `paceZonesFromVdot(vdot)` (or the threaded `effort_paces`).
This is the **first consumer wiring** of the shared module (until now dead code).

### Piece 3 — inject zone targets per session type (RUN-PROTOCOL §7.3 / §5)
Inject into the three creators (`createSimpleLongRun:448`, `createSimpleEasyRun:496`, `createOptionalSpeedwork:465`):

| Session | Zone | Source band |
|---|---|---|
| Long Run | **Z2** aerobic | `frielZones[1]` HR + `paceZonesFromVdot.base` pace |
| Easy Run | **Z1–Z2** | Z2 ceiling (HR + base pace) |
| Strides (in Easy+Strides) | **Z5** for the strides | `frielZones[4]` HR / `paceZonesFromVdot.speed` |
| Fartlek pickups | **Z4–Z5** | `frielZones[3-4]` / `power`–`speed` |

Description becomes e.g. *"8 miles — Z2 aerobic (HR 134–142 · 8:30–9:00/mi). Conversational throughout."*

### RPE fallback (no-data)
- No LTHR/maxHR → omit HR band.
- No VDOT/paces → keep the effort label ("conversational"). RPE is the graceful fallback (RUN-PROTOCOL §7.4), never the default when data exists.

## 4. Races byte-identical (the guarantee)
- `performance_build` (race) generator: **untouched**. `effort-score.ts`: untouched. The shared module is imported **only** by `sustainable`.
- `sustainable` **mileage + tokens unchanged** (E3a edits descriptions only; volume is E3b). So non-race *miles* are identical to today; only descriptions gain zones.
- ⇒ Race plans byte-identical; non-race plans change (gain zones) — exactly SUB-DECISION A. Combined/tri untouched.

## 5. Verification
- **Non-race:** snapshot a non-race plan — descriptions carry HR+pace zones when learned data present; RPE fallback when absent; **assert per-session miles identical to pre-E3a** (volume untouched).
- **Races:** a `performance_build` plan **byte-identical** before/after (structural diff). Matrix 486/486 (combined untouched) + the run-plan test suite stays green.
- New test: `sustainable` long-run/easy/strides descriptions contain the correct zone for a known LTHR/VDOT; RPE fallback path covered.

## 6. Out of scope / deferred
- **E3b** — bottom-up volume rebuild (retire `WEEKLY_MILEAGE` / `LONG_RUN_PROGRESSION`).
- Forgiving/sharp distribution *shift values* (dial neutral).
- Zones as structured materialize-plan tokens (E3a = description text).
