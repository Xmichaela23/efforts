# SPEC — Swim source tiers, tiered rendering, SWOLF, multi-source reconciliation + FORM→Apple nudge

Status: **design locked, build pending** (2026-06-16). Investigation verified against the dev athlete's real data (177 Strava / 70 Garmin / 103 manual workouts; 10 Strava + 14 Garmin swims). Read `AUDIT-swim-2026-06-14.md` + the ENGINE-STATE "Swim sweep consolidation" entry first.

## The problem

Swim data richness depends **entirely on source**. Sources are NOT interchangeable. Treating them as such produced the recurring "NULL swim field renders as junk / land-metric fallback" class. The fix: one tiered model — derive the tier from origin, compute each metric at the tier its inputs support, make the source legible, never render a broken/NULL field.

## Verified source → tier model

`workouts.source` ∈ `strava | garmin | healthkit | manual` (written by `ingest-activity`; manual workouts already use `'manual'`). Provenance is derived from `source`; the FORM origin is in `device_info.device_name` (`"FORM goggles"`).

| source | provenance label | carries (verified) | data tier |
|---|---|---|---|
| `strava` | `via Strava` | distance, moving, elapsed, HR; pool/lengths ONLY if popup-filled (D-162). **No strokes, no per-length.** | `basic` |
| `garmin` | `via Garmin` | + per-length array `swim_data.lengths[] = [{distance_m, duration_s}]` (per-length **time/distance** → splits), pool, lengths count. **No strokes.** | `full` (splits) |
| `healthkit` | `via Apple Health` | pool, **strokes** (`swimmingStrokeCount`), HR, seconds-duration. No per-length. | `+SWOLF` |
| `manual` | `Manual` | distance + duration + optional (pool/strokes/RPE) | `courtesy` |

**Tier badge** = provenance (from `source`) + a data-presence suffix (NOT just source): `via Strava · basic`, `via Strava · +SWOLF` (if merged or popup-enriched), `via Garmin · full`, `via Apple Health · +SWOLF`, `Manual`. The badge replaces silent NULL cells: a thin source declares its ceiling so missing metrics read as expected, not broken.

## ⚠ THE STROKES GAP (load-bearing finding)

**Strokes are absent across every current automatic source:** Strava strips them; Garmin's per-length array has duration/distance but **no strokes**; HealthKit has them but there are **0 HealthKit swims** (paused). Therefore **session-SWOLF renders for nobody today** without one of:
1. **Popup manual strokes** (D-171) — Strava/manual swimmers who type "total strokes".
2. **Apple Health connect** (Phase 2 / Q-060) — FORM writes strokes to HealthKit; the **only automatic** strokes/SWOLF pipe.
3. Garmin strokes — NOT in the stored per-length array; would need an ingest extension to extract from the FIT (unconfirmed it's even in the source).

⇒ This is **the** justification for re-opening Q-060: the payoff is SWOLF + auto-richest-source + no-doubles, not pool length (which the popup already solves). It's also why per-length **SWOLF** is NOT a Garmin tier — Garmin gives per-length **splits/pace** only.

## Metric → input map (compute what you can, omit cleanly what you can't)

Each metric renders **only if its inputs exist**; otherwise omit (no synthesis, no zero, no land fallback).

| metric | inputs | available from |
|---|---|---|
| distance, pace/100, HR | base (dist, moving, HR) | all sources |
| pool length | `pool_length`/`pool_length_m` (source or popup) | garmin, healthkit, popup |
| lengths count | distance ÷ pool | wherever pool known |
| work:rest | moving vs elapsed | all sources |
| per-length splits (pace) | `swim_data.lengths[]` (time/dist) | garmin |
| **session SWOLF** | strokes + lengths + time | healthkit, or popup-strokes, or merged |
| per-length SWOLF | per-length strokes | **none today** (needs Apple-Watch-grade; defer) |

## Single-source SWOLF (D-170)

`session SWOLF = (avg sec/length) + (avg strokes/length)`, normalized to 25 (industry standard). **Single-source it** in a new shared fn (e.g. `_shared/swim/swim-swolf.ts`) — same pattern as `swimPacePer100Seconds`. **FOOTGUN:** computing SWOLF (or pace, or pool length) in more than one place reinstates the D-156/D-164/D-167 divergence class. Comparison-to-self only, never cross-athlete.

**Folds in Q-061:** finned/equipped sessions are flagged OUT of the SWOLF trend pool (a fin-assisted SWOLF isn't comparable to unaided) — same equipment exclusion as the pace trend; the data dependency (`workout_metadata.swim_steps_equipment_confirmed`) is already captured (D-162).

## Multi-source reconciliation + FORM→Apple nudge

Intent: (a) never show double workouts when the same swim arrives from two sources; (b) automatically determine + use the richest source; (c) nudge FORM users to connect Apple Health (their richest pipe, off by default).

**Honest dependency chain:** (a)+(b) ARE the HealthKit ingest + dedup/merge (Q-060) — there's no "auto-pull the rich Apple copy without doubling" that doesn't read HealthKit and match it against the Strava copy. (c) the *nudge* is just detection + suggestion and ships independently, ahead of the native work, creating the demand Phase 2 fulfils.

### Phase 1 — tier + badge + clean rendering + NUDGE (no native, ships now)
- D-169: tier model + source badge + tier-gated rendering (the structural NULL-junk fix for everyone today).
- **Nudge:** when the badge logic detects a FORM swim via Strava (`device_name` ~ FORM + `source=strava` + thin fields) AND Apple Health isn't connected, show a one-time, dismissible suggestion (swim card or Connections): *"This swim came from FORM via Strava. FORM also writes to Apple Health, which carries stroke count and SWOLF. Connect Apple Health for richer swim data."* Gate: show once, respect dismiss, hide if Apple Health already connected. Primes users to enable the pipe Phase 2 consumes.

### Phase 2 — re-open Q-060 (now justified)
The dedup/merge (`mergeSameSwimIfExists`) + HealthKit plugin **already exist** (D-157) — Phase 2 finishes/verifies that native path. Build per the audit: **60-second start-window + sport + ±10% distance match; best-field-from-each merge** (Apple's pool_length/strokes/SWOLF/seconds win, Strava fills gaps); auto-detect overlap on connect. Same FORM swim from Strava + Apple → one reconciled workout, richest fields surfaced, zero doubles. The badge then reads the **merged** tier (`via Apple Health · +SWOLF`, having absorbed the Strava row).

### ⚠ FOOTGUN — the merge is load-bearing
**Any swim ingest path that bypasses the 60s-window dedup ships double workouts.** Per-source `onConflict` (`user_id,strava_activity_id` etc.) only dedups *within* a source; cross-source reconciliation is the explicit dedup gate. Never add a swim ingest that skips it.

## Manual swim entry (D-171, courtesy tier)
"Log swim manually" from the + / add-workout menu. **Minimal:** distance (yd/m) + duration. Optional: pool length (→ lengths), strokes (→ SWOLF), RPE/feel. **Reuse the D-162 popup component** — manual = the same form entered *before* a synced workout exists. `source='manual'`, badge `Manual`. One screen. A courtesy so a pool swim isn't missing from the week — NOT a full logger.

## Build sequence
1. **D-169** — tier model + badge + tier-gated rendering + the nudge (Phase 1, no deploy risk).
2. **D-170** — session SWOLF (shared fn, Q-061 exclusion).
3. **D-171** — popup optional-strokes field + manual swim entry.
4. **Phase 2 (Q-060)** — HealthKit ingest + merge, AFTER Phase 1 ships and users opt in. Do NOT build speculatively ahead of the nudge.

## Strategic context — Strava can't be the universal swim source (D-172)

- **Strava API is gated at 10 users** and slow/resistant to opening data access → structurally CANNOT be the universal swim pipe. It's basic-tier and capped.
- **Garmin (live, full)** and **Apple Watch (integration in place, NEEDS TESTING)** are the real universal rich pipes (native per-length recording). **Today the only LIVE rich swim source is Garmin.**
- **FORM reaches us only via Strava (thin) or Apple Health (modest).** ⚠ **FORM via Apple Health is NOT "rich"** — it adds only **pool length + total stroke count + seconds-duration** (→ session-average SWOLF at best). FORM keeps **per-length splits/SWOLF in its own app**; it does NOT export them to HealthKit. So:
  - The genuinely rich AUTOMATIC path is **Apple Watch** (native per-length), not FORM-via-anything.
  - **Q-060's payoff is smaller than "rich" implied** — a modest pool+session-strokes bump for FORM users, plus the no-doubles merge. Still worth it (it's the only automatic strokes path for FORM), but don't oversell it.
  - FORM's real value is the **in-pool HUD experience + stroke-type accuracy**, not HealthKit export depth.

## Connections source matrix + honest framing (D-172) — SHIPPED (Phase 1, display-only)

`SwimSourceMatrix` in Connections: a warm one-liner ("swim data's messy… add one by hand") + five honest rows (Garmin Full / Apple Watch Full · needs-testing / FORM via Apple Health:+pool,strokes-coming-soon · via Strava:basic / Strava Basic / Manual). Turns the fragmented data story into a trust moment. **No source overstated.** Decisions locked:
- **Pending labels = honest hybrid, truthful per-source:** Apple Watch reads "Needs testing" (integration exists, rides the D-157 HealthKit sync); FORM-via-Apple-Health is stated as **coming soon** (ingest unbuilt) — NOT a connect button that delivers nothing.
- **FORM = one entry**, corrected value (pool + stroke count, not "rich"), points to Apple Health as the somewhat-better pipe.
- Dual-source reassurance line: "use both FORM and Apple Watch? we'll merge into one swim — no duplicates" (Phase 2 / Q-060 intent, stated not built).

## "Choose the richest data" — the three-layer model (D-172 cont.)

Richest-data-wins is **three layers**, not one feature. They must not contradict — and they don't:
1. **INFORMS — the swim matrix** (`SwimSourceMatrix`): shows what each source gives (the richness column). Sits *with* the source toggles (below them), not as the screen's opening.
2. **CHOOSES — Activity Source Preference** (`user_baselines.preferences.source_preference` = garmin/strava/both): the user steers swims to their richest available source. **Enforced at ingest**: `strava-webhook` skips when pref=`garmin` (`:177`/`:267`); `garmin-webhook-activities` skips when pref=`strava` (`:211`). So a Garmin-source swim is NOT double-ingested from Strava.
3. **PROTECTS — auto-merge backstop**: when overlaps slip through anyway, richest fields win → one swim. **All swim ingests route through `ingest-activity`** (Strava webhook calls it directly `:571`; Garmin swims via `swim-activity-details`→ingest), where `mergeSameSwimIfExists` (D-157, `:1304`) reconciles same-swim cross-source (60s window + ±10% distance + different source).

**Verified, no contradiction:** matrix informs, preference chooses, merge protects — complementary halves of one story.

### ⚠ Honesty constraint + the residual gap
- The Garmin↔Strava layer (preference + merge) is **LIVE** → can promise "one swim, pick your source."
- The **HealthKit/FORM richest-merge is gated on Q-060** (HealthKit ingest unbuilt) → frame as **"coming," never "done."** The matrix dedup line says exactly: *"…we aim to keep it to one — pick your source above. (FORM + Apple Health merge coming soon.)"*
- **Residual gap:** `mergeSameSwimIfExists` keys on a 60-sec start-window, but Strava rounds start times to integer minutes while Garmin has seconds — the same swim's starts can differ >60s → merge misses → double. The "both" default leans entirely on this merge. Widening the window / matching on date+distance+duration is the Q-060-area fix.

## Manual swim escape hatch (D-172 item 4) — courtesy tier

Dead-simple **completed**-swim entry from the planned screen (NOT a full logger, NOT `WorkoutBuilder` which makes *planned* workouts). Minimal: distance (yd/m) + duration; pool optional (→ lengths). Inserts `type='swim', source='manual', workout_status='completed'`; badge `Manual`. Reuses the D-162 popup for the optional RPE/feel/equipment enrichment after the row exists. One screen.

## Open gaps / unknowns
- **Strokes**: no automatic source today (see the gap above). SWOLF is sparse until D-171/Phase-2.
- **Garmin strokes**: not in the stored per-length array; extracting from the FIT is unconfirmed + out of scope.
- **HealthKit fields unverified on real data** (0 HK swims) — rely on the D-157 plugin's documented output (pool + strokes + HR) until a real HK swim lands.
- **Per-length SWOLF**: not achievable from any current source; deferred.
