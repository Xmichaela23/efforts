# Protocol Audit — 2026-05-27

**Scope:** read-only cross-reference of `generate-combined-plan/` engine code against `docs/CYCLING-PROTOCOL.md` and `docs/RUN-PROTOCOL.md`.

**Methodology:** delegated to the Explore agent with a structured checklist (§5 helper signatures, §5 defaults, §7 zones, §4.5 ramp endpoints, §3 frequency tables, §9/§10 race week gates, cross-doc refs). Verified the most-material findings directly before reporting. Excluded: the protocols' own §10.2/§11.2 "what changes in future phases" tables (already-acknowledged future work) and the §8 Cadence gap (already documented in CYCLING-PROTOCOL §8.4).

**Outcome:** the engine is ahead of the docs. The ramps, the `bikeOpeners` gate, the rep progressions — all shipped. The spec just never got updated to reflect it. No code fixes needed. Doc cleanup follow-up tracked.

---

## Most material — three findings

### 1. CYCLING-PROTOCOL §4.2 / §5.4 / §5.5 / §5.6 claim ramps are "dormant — Phase 1 work." The ramps are LIVE in the code.

**Verified:** `session-factory.ts:740-747` (`groupRideQualityBikeSession`). The dispatcher applies these per-phase ramps to the cycling quality session:

| Session | Spec says | Actual code |
|---|---|---|
| VO2 (race_specific) | "hardcoded 5-min reps today, count flat at 6. Within-phase rep ramp dormant; Phase 1 work proposes `reps = clamp(3, 6, 3 + (weekInPhase − 1))`" | `Math.max(3, Math.min(6, 3 + (wip - 1)))` — **exact match to "proposed"** |
| Threshold (build) | "currently **flat** (3×20m every build week); within-phase rep ramp is dormant — Phase 1 work mirrors the run-interval rep ramp formula (`clamp(2, 4, 2 + floor((weekInPhase − 1) / 2))` proposed; locked when Phase 1 lands)" | `Math.max(2, Math.min(4, 2 + Math.floor((wip - 1) / 2)))` × 20 min — **exact match to "proposed"** |
| Sweet spot (base) | "Defaults `2 × 15 min` in base… Within-phase progression is dormant — Phase 1 work." | Same `2 + floor((wip-1)/2)` × 15 formula — **live** |

These ramps fire whenever `groupRideQualityBikeSession` is called. The spec is stale on its own implementation status. D-028 (2026-05-21) shipped the cycling-arc Phase 1 within-phase ramp work; the spec was not updated to reflect completion.

### 2. CYCLING-PROTOCOL §5.8 + §10.1 + §11.4 say `bikeOpeners` race-week-only gating is "deferred." It was fixed.

POLISH-PUNCH-LIST has it closed as **D-043 item 10 / 2026-05-25**: "Gate at `week-builder.ts:1461` now scopes to `phase === 'taper' && raceThisWeek`." But three places in CYCLING-PROTOCOL still list this as a "Known footgun (deferred)":

- §5.8 Openers — "the `bikeOpeners` gate at `week-builder.ts:~1298`… fires every taper week, not just the race week"
- §10.1 A-race week — "**Known footgun (deferred):**"
- §11.4 Phased plan — "Phase 3 — `bikeOpeners` race-week-only gating (closes the §10.1 footgun…)"

Phase 3 of the cycling arc is done.

### 3. Systematic +176-line drift in CYCLING-PROTOCOL session-factory line refs

| Helper | Spec says | Actual | Drift |
|---|---|---|---|
| `longRide` | ~394 | 570 | +176 |
| `sweetSpotBike` | ~433 | 609 | +176 |
| `tempoBike` | ~512 | 688 | +176 |
| `easyBike` | ~525 | 701 | +176 |
| `bikeOpeners` | ~554 | 752 | +198 |
| `brick` | ~1232 | 2008 | **+776** |

Helpers exist with correct signatures, but every line reference is stale. The +176 looks like a single insertion event upstream in the file that displaced everything below. `brick` at +776 has drifted further — separate insertions in its region.

`thresholdBike` (583) and `vo2Bike` (596) are not cited with line numbers in the spec; only by name. They exist.

## Other findings

### CYCLING-PROTOCOL §4.5 ramp endpoints — clean

`science.ts` `LONG_RIDE_RAMP_ENDPOINTS` matches the spec's locked table (base 0.65→0.75, build 0.75→0.85, race_specific 0.85→1.00). Verified at `science.ts:658-662`.

### CYCLING-PROTOCOL §7.3 zone percent bands — clean

Session description text matches spec values: sweet spot "88-94% FTP", VO2 "110-120% FTP", etc. No drift detected.

### RUN-PROTOCOL §5.7 brick — stale internal cross-reference

RUN-PROTOCOL §5.7 says "the code at `science.ts:143-152` is correct (race_specific multiplier 0.42)." Verified: lines 143-152 of `science.ts` are unrelated to brick (run pace divergence logic). The 0.42 multiplier is at `science.ts:365` (inside `brickRunTargetMiles`).

### RUN-PROTOCOL §4 rep ramps — clean

Spec formulas match code exactly:
- Base interval ramp: spec `clamp(4, 8, 4 + floor((weekInPhase − 1) / 2))` → `week-builder.ts:1599` exact match
- Build VO2 ramp: spec `N = clamp(3, 6, 3 + (weekInPhase − 1))` → `vo2Run(...)` with `weekInPhase` threaded; ramp lives in the helper itself

### Cross-doc references — clean

`RACE-WEEK-PROTOCOL.md`, `STRENGTH-PROTOCOL.md`, `BRICK-PROTOCOL.md` all exist. Section references within them not deep-audited.

### Could not verify

- §3 frequency-by-hours tables — distributed across `swim-protocol-volumes.ts`, `index.ts`, and helper modules in `src/lib/`. Targeted re-audit would need a longer dive.
- `vo2Run` internal ramp — function signature includes `weekInPhase: number = 1` so the ramp is plumbed, but whether the per-rep formula inside matches the spec needs a direct read.

## Summary

| Category | Count |
|---|---|
| Stale "deferred / dormant / Phase N work" claims that are actually live | **5** (sweet-spot ramp, threshold ramp, VO2 ramp, bikeOpeners gating in §5.8/§10.1/§11.4) |
| Stale line-number references | **7** (six +176 cycling refs + one wrong RUN-PROTOCOL §5.7 cite) |
| Clean | §4.5 ramp endpoints, §7 zone bands, RUN §4 rep ramps, cross-doc refs |
| Could not verify | §3 frequency table, internal `vo2Run` ramp formula |

**The headline:** CYCLING-PROTOCOL.md is materially stale on implementation status — multiple sections describe ramps and gates as "dormant" or "deferred" when they've actually shipped (D-028 cycling-arc Phase 1 + D-043 cycling-arc Phase 3 bikeOpeners). The spec hasn't been updated to reflect Phase 1+3 completion.

**Follow-up:** spec-status sweep applied same session — see commit accompanying this audit. Every "dormant / Phase 1 work" claim updated to "shipped — D-028" or "shipped — D-043" as appropriate; +176-line drift corrected; RUN-PROTOCOL §5.7 cite fixed.
