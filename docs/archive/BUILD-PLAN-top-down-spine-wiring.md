# BUILD PLAN — Top-Down Spine Wiring (master sequence)

**Status:** Master plan · execute granularly against this
**Frames:** SPEC-athlete-state-spine · BUILD-SEQUENCE-spine-foundation · AUDIT-truth-reconciliation-2026-06-14
**Approach:** Top-down. The infrastructure exists (trend primitive, Arc, screens, plan
builder, learned_fitness tables). This is **wiring existing limbs up to a new center of
authority (the spine)** — not building from scratch. Define the brain as authority, then
connect each limb, scaling per-athlete as we go.

---

## The principle

We have ground infrastructure. We wire from above:
1. Establish the spine as the single authority.
2. Bind the voice (Arc) to it.
3. Migrate each limb to read it — carrying per-athlete scaling so no limb hardcodes one
   athlete's numbers.
4. Close the loop.

Each limb migration is small *because the limb already exists* — we're changing what it
reads (the spine) not rebuilding it. The "smarts to scale the limbs" = every threshold a
limb uses is either a universal constant or scales to the athlete's own baseline (per the
audit's magic-number flags).

## Per-athlete scaling contract (applies to EVERY step)

From the truth-reconciliation audit — these must scale, not be constants:
- **CHRONIC_LOAD_FLOOR** → scale to the athlete's own 28d chronic base, not fixed 500.
- **HR reference band** → per-rider (% of FTP or athlete's Z2 power), no hardcoded watts.
- **Freshness windows + min-session gates** → scale to athlete's per-discipline session
  frequency (a 3x/wk athlete shouldn't read perpetual needs_data).
- **Keep as universal constants:** % trend thresholds (scale-free) and plausibility bands
  (physiological). Do NOT scale these.

Every limb wired must honor this. No step ships with a me-specific magic number.

## The sequence

### Step 0 — Spine foundation (the authority exists)
- Relocate the deterministic core to a shared location (`_shared/state-trend/`) so server
  + client run ONE implementation. (Already the Part-B prereq.)
- Bake per-athlete scaling into the core from day one (the contract above).
- Output: a spine that computes one verdict per discipline, scaled per athlete, callable
  everywhere.

### Step 1 — Reconcile the senses (inputs honest before the brain trusts them)
- Apply the signed-off reconciliation rules: hybrid suggest-with-confirm for strength &
  swim, gated on computed confidence + freshness (never suggest off one stale session).
- Fix the swim learned-aggregate pipeline gap (learn-fitness-profile not populating
  swim_pace_per_100m) — the swim sense is currently unwired.
- FTP already single-sourced (176); Garmin-native ingestion (204, Q-037) is a separate
  decision, not a blocker.

### Step 2 — Bind the voice (Arc → spine)
- Narrative reads the spine's verdict; LLM describes, never infers direction. (Part B/C/D.)
- Claim-grounding validator enforces it; regression-test the VO2 "declining" lie.
- This stops the live narrative contradictions soonest.

### Step 3 — Migrate the limbs (one at a time, each reads the spine)
Order by impact / independence:
- **STATE** — already on the primitive; point it at the shared spine.
- **Session detail / per-ride** — the per-ride HR@power read describes the spine verdict.
- **Load / BODY** — fold ACWR + off-plan (D-146/D-147) into the spine, not parallel.
- **My Record / PRs** — update from the spine via hybrid confirm (never silent overwrite).
- **Coach** — reads the spine verdict.
- Each migration: scoped commit, verify the limb still reads correctly, no regression, no
  hardcoded athlete numbers.

### Step 4 — Close the loop
- **Plan builder** reads the spine for current fitness (not stale typed baselines). This
  fixes the live miscalibration: deadlift under-prescribed (~25lb), bench over (~30lb).
- **Plan adjustment** writes back / adapts from the spine — **GATED behind explicit
  sign-off** (autoregulation changes prescription).

## Migration risk (the one hazard of top-down)

Wiring limbs one at a time means transient states where some limbs read the spine and some
still re-derive — temporarily the exact inconsistency we're killing. Mitigate:
- Spine + Arc (Steps 0–2) land as one coherent unit before limb migration starts, so
  there's a stable authority to migrate toward.
- During Step 3, a limb either fully reads the spine or fully doesn't — no half-wired limb.
- Verify each limb post-migration against real data before the next.

## Sign-offs still owed (gates within the steps)

- Phase 0 canonical location (rec: `_shared/state-trend/`).
- Bike: per-rider reference-band method · min-points-per-bin · disagreement display ·
  thin-bin provisional. (±3% / 21d approved.)
- HR@power: min sessions · reference band. (±3% approved.)
- Reconciliation rules: signed off (hybrid suggest-with-confirm, confidence+freshness
  gated).
- Step 4 plan-adjustment writeback: explicit sign-off required before it changes anything.

## What this delivers

When done: the app knows its athlete. One truth, computed once, scaled per athlete, read by
every screen, spoken by Arc without contradiction, seeding the plan and closing the loop —
gated where it changes what's prescribed. The fragmentation that let the np_trend lie
survive, and the miscalibration under-prescribing deadlift, both structurally gone.
