# SPEC — Intensity Baselines: CSS-primary swim model + null-honest cross-discipline degrade

**Status:** Layer A SHIPPED (D-199, pending deploy as of 2026-06-17); Layers B/C + the #5 null-honest work SPECCED, NOT BUILT. This is the shared spec for backlog **#1 (swim intensity → CSS)** and **#5 (onboarding null-baseline → null-honest)** — they are one workstream because both govern how an *absent* intensity baseline behaves, and worked separately they would fight (one reintroduces a fallback the other removes).

**Self-contained:** a fresh Claude Code instance must be able to execute Layers B/C and #5 from this doc alone. Reproduce-from-code first; match to a D-NNN/Q-NNN or open one; respect "smart server, dumb client."

**Relates to:**
- `docs/SPEC-honest-swim-inference.md` + `docs/SPEC-universal-narrative-inference.md` — swim HR is NOT a verdict signal; a run threshold is not a valid swim anchor (the bug Layer A fixed).
- `docs/audit/99-SUMMARY.md` §3 #1 (swim HR anchored to `run_threshold_hr`), §3 #2 (onboarding null-baseline gap), §1 area 07 (runtime cold-start fallbacks that mask the null).
- D-199 (Layer A — swim HR un-anchored; this spec's leg 1).
- `FTP-COLD-START-SPEC` (spec-only, unimplemented) — explicitly NOT to be auto-wired here (see #5 guardrail 3).

---

## THE PROBLEM (why this workstream)

Two failures, one root cause — **the app has no honest representation of "we don't know this athlete's intensity baseline yet."**

1. **Borrowed-anchor leak (swim):** swim has no native intensity model, so it borrowed running's. The analyzer anchored swim HR to `run_threshold_hr`; the baselines UI rendered the run Friel %LTHR card + a per-mile run threshold pace on the swim tab. Run HR runs ~10–15 bpm above swim HR for the same effort, so every swim read as easier than it was. **Layer A (D-199) killed the borrow** → swim HR is now neutral/unanchored and the UI shows an honest empty state. This spec finishes the job: give swim its OWN intensity model (CSS).

2. **Fabricated-fill (cross-discipline):** where a baseline is null, the code silently substitutes a generic — `ftpForZones = userFtp || 200` (`compute-workout-analysis/index.ts:1589`), `resolveCssSecPer100Yd` silently returns `105 s/100yd` (`generate-combined-plan/swim-protocol-v21.ts:138`), materialize's 5-tier pace fallback bottoms out at hardcoded `10:00/7:00/6:00` per-mi. The app invents a number and presents it as the athlete's. **#5 removes the fabrication and makes null honest** — without breaking plan generation (which genuinely needs *a* number to prescribe targets).

**The unifying principle:** *each discipline drives intensity from its OWN native metric; where that metric is unknown, the app says so honestly and degrades to a labeled estimate — it never fabricates a baseline and presents it as real.*

| discipline | native intensity metric | analog |
|---|---|---|
| Run | LTHR / threshold pace | — |
| Cycle | FTP / power | — |
| **Swim** | **CSS (Critical Swim Speed), expressed as pace/100** | CSS is to swimming what FTP is to cycling |
| Strength | e1RM / RIR | (already single-sourced via `exercise_log`) |

---

## THE LOAD-BEARING PIECE — the RPE-degrade contract (#5)

This is the keystone. It is what lets a null baseline produce an **honest** plan instead of a fake one. Build this FIRST in the #5 leg; everything else (kill the fallbacks, CSS cold-start) depends on it existing.

### The contract

> When an intensity baseline (FTP / run threshold / CSS) is **null**, any surface that needs a target emits an **explicitly-labeled RPE/estimate target** — never a silent generic, and the label nudges the athlete to seed the baseline.

Three hard rules:

1. **Labeled, always.** The degrade target must carry a visible label that says it is an estimate and why. Example target string:
   > `8×100 @ RPE 7 — no CSS set yet; add your 100 pace for paced targets`

   The run/ride analog:
   > `4×4min @ RPE 8 — no FTP set yet; add it for power/HR targets`

   The label is **required**, not optional decoration. A degrade target with no label is a silent default and is forbidden.

2. **Never silent.** There is no path where a null baseline yields a concrete pace/power/CSS number that *looks* measured. `|| 200`, `return 105`, and the hardcoded materialize paces are all silent defaults — they are deleted, not relabeled. If the generator needs a number internally to lay out a session, that number is RPE-anchored and surfaces AS RPE, never as a fabricated pace.

3. **Nudges toward seeding.** The label always points at the fix ("add your 100 pace", "set your FTP"). The degrade is a temporary honest state that actively recruits the real baseline — not a comfortable permanent default the athlete never escapes.

### Why this is load-bearing

Without it, "null stays null" is impossible — the plan generator *cannot* prescribe "swim 8×100 @ null". The generator MUST be handed something. The choice is (a) fabricate `105` (the current lie) or (b) degrade to a labeled RPE target (the honest path). The whole #5 architecture stands on (b) existing. Decided: **(a) is the chosen behavior — generator NEVER blocks, ALWAYS degrades to a labeled estimate.**

### Where it applies

- **Plan generation / materialize** — session targets (the primary site; replaces `105`, `|| 200`, hardcoded materialize paces).
- **Display surfaces** — a zone card / target readout shows the labeled-estimate state, not a fabricated band.
- **NOT the narrative** — the narrative already stays neutral when anchors are absent (D-183/D-199); it does not invent a degrade. It simply omits the missing anchor.

---

## LEG 1 — SWIM CSS MODEL (backlog #1, Layers A/B/C)

### Layer A — analyzer anchor + UI leak (SHIPPED, D-199)

Done 2026-06-17 (pending deploy):
- `analyze-swim-workout/index.ts` — removed the `run_threshold_hr` / `configured_hr_zones` fetch + the run-anchored `hrBands` builder; swim HR is now unanchored → narrative neutral on HR.
- `TrainingBaselines.tsx` — global HR Zones card hidden on the swim tab (`activeSport !== 'swimming'`); honest "no swim baseline yet" Pace Zones empty-state in its place; the per-mile "Threshold Pace" leak gone from the swim surface.

Verification (post-deploy): recompute one historical swim via `recompute-workout`, confirm the narrative no longer reads HR off the run threshold.

### Layer B — verdict source: CSS / pace-per-100 primary, HR demoted to context

- The swim intensity **verdict comes from pace vs CSS**, not HR zones. (CSS is the asymptote of the speed-duration curve — the swim analog of critical power / FTP.)
- HR remains **soft context only** — wrist optical is unreliable underwater; chest straps store-and-offload rather than stream real-time. HR may corroborate; it is NEVER the verdict.
- Until CSS exists for an athlete (cold start), the verdict degrades per the RPE contract — no HR-derived verdict substitute.

### Layer C — baseline: manual-seed FIRST, learner SECOND

**Ordering is explicit and load-bearing.** The CSS learner only converges from *hard* efforts; an athlete who swims mostly aerobic will sit at null CSS indefinitely. So the **manual seed is the critical path to lighting up swim zones** — build it first. The learner is the refinement layer that sits null until enough hard efforts are logged.

### The swim zone model (LOCKED 2026-06-17 — 5 zones, CSS-anchored)

**Sourced from `docs/SWIM-PROTOCOL.md` §4–5** so the display/verdict zones MATCH what the engine already prescribes (single-source — do NOT invent different offsets; the prescription side already uses these via the 2026-05-22 CSS-kill arc). **CSS is the ONLY measured anchor; Z1/Z2/Z3/Z5 are labeled CSS-relative offsets, not independent thresholds.**

| Zone | Internal name | CSS offset (per 100) | Engine session types that map here |
|---|---|---|---|
| Z1 | Recovery | CSS + ~12–15 s and slower | `recovery`, `kick_focused` |
| Z2 | Endurance | CSS + ~8–10 s | `endurance`, `technique_aerobic`, `css_aerobic` (aerobic end) |
| Z3 | Tempo | CSS + ~3–5 s (CSS+5 = the Z2–Z3 boundary) | `css_aerobic` (moderate) |
| **Z4** | **Threshold (CSS)** | **CSS to CSS − 2 s (≈ CSS)** | `threshold`, `race_specific_aerobic` |
| Z5 | VO2 / Speed | CSS − 3 s and faster (sprint = off-CSS, all-out) | `speed`, `sprint` |

> ✅ **RESOLVED 2026-06-17 — Decision A (Michael).** Athlete-facing labels are **plain effort words**; **"CSS" and Z-numbers stay engine-internal, never surfaced** (both 2026-05-22 locks intact). Rationale: users are triathletes/hybrid, not swim-first — "CSS"/"Z4" would glaze them; same pattern as the run card showing "Threshold Pace" (not the model name), and the swim PLAN already translating "Z3 CSS+5s" → "moderate." The card extends that existing translation layer, not a new one.
>
> **Athlete-facing band labels (LOCKED). Anchor row surfaced as "Threshold pace /100" (never "CSS"):**
>
> | Internal (engine only) | Athlete-facing label | CSS offset (per 100) |
> |---|---|---|
> | Z1 Recovery | **Recovery** | CSS + ~12–15 s and slower |
> | Z2 Endurance | **Easy** | CSS + ~8–12 s |
> | Z3 Tempo | **Moderate** | CSS + ~3–8 s |
> | Z4 Threshold (CSS) | **Threshold** ← anchor | CSS − 2 to CSS + 3 (≈ CSS) |
> | Z5 VO2 / Speed | **Fast** | CSS − 2 s and faster |
>
> The 5 bands are a finer-grained version of the plan's existing easy/moderate/hard (Recovery+Easy → "easy"; Moderate → "moderate"; Threshold+Fast → "hard"). The card is a **reference** (all 5 bands show pace targets, like the run HR-zone card) — it does NOT depend on which bands the program prescribes into. The program currently prescribing only easy/moderate is a separate program-work item ([[Q-071]]), NOT a card gap.
> **Shipped (client helper):** `src/lib/swimPaceZones.ts` (`deriveSwimPaceBands` — offsets here are the single source) + the Pace Zones card in `TrainingBaselines.tsx`, derived from the entered 100 pace (the internal CSS anchor). Layer B (server analyzer verdict) will reuse the same offsets when built.

#### C1 — manual seed field + zone derivation (BUILD FIRST)

> **✓ Persistence CONFIRMED (2026-06-17, reproduced from code — NOT a blocker):** `swimPace100` round-trips correctly — `saveUserBaselines` writes the whole `performanceNumbers` blob to `user_baselines.performance_numbers` (AppContext `:337,:380`) and `loadUserBaselines` reads it straight back (`:445,:470`); a delete-app + clean reinstall kept an entered 2:30. NO persistence bug — the earlier "didn't persist" was typed-but-unsaved local state. The CSS seed will persist via this same path. The only UX caveat for C1: the field commits on the **"Save Baselines"** tap, so consider whether the seed wants auto-save vs the explicit button.

- **Location:** the existing swim "100yd Pace" field in `TrainingBaselines.tsx` (the swim section, ~line 1421) is the right *location* — promote it from a loose number to a **CSS seed**.
- **Treatment:** the entered pace is treated as a CSS seed → swim pace zones derive from it → the learner refines over time. Serves the "I just think in 100 pace" athlete without abandoning CSS as the engine.
- **Microcopy (cold-start state)** — pin "fast" to *sustainable*, not sprint (a triathlete typing an all-out 50 inflates CSS and corrupts every zone):
  > *"Your fast-but-steady 100 {yd/m} pace — the speed you could hold for a hard 400, not an all-out sprint."*
  - `{yd/m}` follows the unit preference.
- **Microcopy (learned state)** — once CSS is learned, stop telling an experienced user to guess:
  > *"Learned from your swims — edit to override."*
- **Zone derivation:** swim pace zones derive from CSS (the swim Pace Zones card the D-199 empty-state is a placeholder for). Single-source the derivation (one helper, the `swimPacePer100Seconds` / `resolveSwimScalars` discipline) — do NOT recompute zones in more than one place.

#### C2 — CSS learner mirroring the FTP learner (BUILD SECOND)

- **Mirror the existing FTP learner almost 1:1** (`learn-fitness-profile`, FTP ratchet floor ~:329-344, learned-FTP quality gates). Same shape: accumulate qualifying efforts → fit the model → expose a confidence tier → refine as data arrives → ratchet floor so a single bad session can't tank it.
- **Model:** fit the 2-param critical-speed model — critical speed + anaerobic distance reserve (the D′ analog) — the asymptote of the speed-duration curve.
- **Converges only from hard efforts.** Easy aerobic swimming reveals nothing about threshold (same limitation as the FTP learner needing hard rides). Below the threshold of qualifying hard efforts, CSS stays **null** and `learning_status='insufficient_data'`.
- **⛔ HARD REQUIREMENT — contamination guard (non-negotiable; auto-learn does NOT go live without it).** When auto-learn is ON, the learner MUST learn ONLY from clean, continuous, full-stroke **freestyle** at **sustained hard** effort. It MUST exclude, reusing the EXISTING tags/machinery (do NOT build new tagging):
  - any set with **equipment** — fins, paddles, pull buoy, kickboard, snorkel, ankle band → `_shared/swim/swim-equipment.ts detectSwimEquipment` (the D-193 capture);
  - **drill / technique** sets → `swim-step-equipment.ts` per-step + the `technique`/`drill` intent in `rest-norm.ts`;
  - **kick-only** sets;
  - **short reps with high rest fraction** → the `rest-norm.ts` rest-fraction machinery (a fast 10×50 @ 30 s rest is NOT a threshold input).
  Same principle as the FTP learner: it converges ONLY from genuinely hard, clean efforts; easy / equipment / drill / kick swimming reveals nothing about threshold and would **inflate CSS → inflate every zone.** This filter is the gate before auto-learn ships.
- **Positive selection (the speed-duration curve):** among the clean-and-hard efforts, fit CSS from the **best sustained efforts across durations** (the critical-speed curve) — exactly as the FTP learner uses best power efforts, not the average of all clean swims.
- **Manual / auto toggle (the FTP pattern):** a checkbox on the swim baseline. **Unchecked (default):** the manually entered "Threshold 100 Pace" holds (the seed). **Checked:** the threshold number is **learned** from actual swims via this learner; the field shows the learned value, editable to override — same manual/auto pattern as FTP. Persist the flag alongside the seed.
- **Quality gate:** mirror the learned-FTP split (materialize rejects `learned-low`; only `learned` is trusted for paced targets) — a low-confidence CSS degrades per the RPE contract rather than prescribing fake-precise paces.

### Units & storage

- **Display unit:** pace-per-100, in the user's preference (**yd or m** — wire to preference; the "100yd Pace" field label must follow the toggle, not hardcode yd).
- **Storage:** store CSS in **ONE canonical internal unit** (recommend **seconds per 100 m**, SI, matching `resolveSwimScalars`' metric substrate); convert for display. **Never store "whatever the user typed"** — yd/m ambiguity at the storage layer is exactly how run-threshold-style leaks happen.
- Kill `resolveCssSecPer100Yd`'s silent `105` return (see #5 leg) — its callers either get a real learned/seeded CSS or the RPE degrade.

### Cold start

- CSS stays **null** until the learner converges OR the athlete seeds it. Null = "no intensity baseline yet," **never** a borrowed run number, never `105`.
- Manual seed lights up zones immediately (C1); the learner refines (C2).

### UI binding

- The swim tab renders its **own Pace Zones card off CSS** — not the run HR fallback (removed in Layer A), not "Two inputs, five zones / Friel %LTHR".
- The D-199 empty-state placeholder is replaced by the real CSS-derived Pace Zones card once C1 lands.
- Each discipline drives zones from its native metric: Run → LTHR/pace, Cycle → FTP/power, **Swim → CSS/pace**.

---

### The honest swim-numbers model (LOCKED 2026-06-18 — D-200/D-201)

This supersedes the "manual-seed → learner" hope in Layer C with what the data actually allows. **Read ENGINE-STATE "Swim clean per-length … UNRECOVERABLE" first** — it proves the constraint this model is built around.

- **The number = a user-entered/tested THRESHOLD = the fitness benchmark.** Swim's FTP. Drives the 5 tiers, prescription, race-leg projections, cross-discipline fitness. Threshold-only entry; tiers derive by offset (no separate moderate). Found via the CSS test (400/200 → (t400 − t200) ÷ 2 per 100; `(i)` button in `TrainingBaselines`) or best-steady-20–30-min entry.
- **Why not computed:** clean per-length / per-segment pace is **unrecoverable** from Strava (rest-inflated reconstruction, alignment fails) and the Garmin webhook (synthesized even-splits, no distance axis, empty `swimCadence`, FIT not delivered). The whole-swim `moving_time` pace is the only reliable passive signal. So we *test/enter* the number, exactly like FTP and run threshold.
- **Refresh = honored-swim-gated nudge** (Performance + State) — RULE LOCKED 2026-06-18, NOT YET BUILT:
  - **Fire when:** ≥ 4 weeks since the last swim-baseline update/test **AND** ≥ ~4 honored (clean, box-checked `swim_as_planned`) swims in that window **AND** a swim in the last ~10 days (currently active). Gating on *honored* swims (not the calendar) means the nudge only fires after real clean training — re-testing is pointless otherwise.
  - **Copy:** "You've put in ~4 weeks of steady swimming since your last update — a quick CSS test would refresh your number." Never auto-writes.
  - **Reset = elegant, no dismiss bookkeeping:** updating the threshold / logging a CSS test moves the "last update" timestamp → the window resets → the nudge clears. Acting on it IS the dismiss.
  - **Build pieces:** (1) pure helper `src/lib/swimBaselineNudge.ts` ({swims, lastUpdatedAt, now} → {show, honoredCount, weeksSince}); (2) stamp `performance_numbers.swimPace100_updated_at` in `TrainingBaselines.handleSave` ONLY when `swimPace100` changed (compare vs `originalData`) — sensitive critical save path, build carefully; (3) render a dismissible card on Performance (next to the threshold — most actionable) + State. Honored count from `useWorkouts` swims' `workout_metadata.swam_as_planned`.
  - **No urgency:** cannot fire until 4 weeks of honored swims accrue, so build it cleanly inside that runway — do NOT rush it into the save path. Reusable later for run/bike baselines.
- **Markers (secondary):** glitch-guarded whole-swim `moving_time` trend = direction between benchmark updates; motivates the re-test; never redefines the benchmark.
- **Resolver:** benchmark-first (`swim_css`/tested > manual > median) behind `SWIM_CSS_LIVE` (D-199); flip once a real tested benchmark exists; median demotes to marker substrate.
- **3 lanes by gear, one zone vocabulary** (recovery / easy / moderate / threshold / hard): Garmin/Apple native compute where possible · Strava + manual take user input. `swimSourceOverride` (D-173) + `mergeSameSwimIfExists` already implement "richest data wins for swim." Surgical per-length = future FIT/Apple project (D-201), not v1.
- **Prerequisite for any of this to matter:** the program must prescribe HARD swims (Q-071) so there's a threshold effort to test against. That's the active build.

## LEG 2 — NULL-HONEST CROSS-DISCIPLINE (backlog #5)

**Direction (decided):** No fallbacks. No generics. Null stays null. The app handles "we don't know this baseline yet" honestly rather than substituting a made-up value. A future onboarding plan-wizard step will let users supply baselines (or we derive them from real training) — but until a baseline is *real*, it reads as absent, not faked.

### The two kinds of fallback (treat differently)

1. **Display / analysis fallbacks → go to null.** Safe to remove outright; the consumer shows "baseline not set yet."
   - `compute-workout-analysis/index.ts:1589` — `ftpForZones = userFtp || 200`.
   - Swim HR-zone card (already removed on swim by D-199); run/ride zone displays that coalesce a generic.
   - Audit area 07 cold-start fallbacks: swim CSS display `105`, run targets, age-based HR band fallbacks.
2. **Generator inputs → go to the RPE degrade (NOT null, NOT a generic).** The plan generator cannot emit a target from null, so it degrades to a labeled RPE estimate (the contract above).
   - `swim-protocol-v21.ts:138` — `resolveCssSecPer100Yd` silent `105`.
   - `materialize-plan` 5-tier pace fallback → hardcoded `10:00/7:00/6:00` per-mi; swim default `120 s/100`; strength default anchors (185 lb squat).

### Build steps

1. **Inventory every silent fallback** (FTP, run threshold, CSS, swim default pace, age-HR bands). Grep `|| 200`, `105`, `120`, the materialize pace ladder, `resolveCssSecPer100Yd`, and the audit §1 area-07 list. Produce the full list before editing.
2. **Display fallbacks → null + honest empty state.** Make every consumer null-safe (degrade gracefully — "baseline not set yet" — never crash, never fabricate).
3. **Generator inputs → RPE degrade.** Route through the labeled-estimate contract. Generator NEVER blocks.
4. **Do NOT swap one generic for another**, and do NOT auto-wire `FTP-COLD-START-SPEC` as an estimator unless explicitly asked — the intent is honest absence, not a cleverer guess.
5. **Leave a clean seam** for a future onboarding plan-wizard step to write real baselines (and for the CSS learner / FTP learner to populate them from training).

### Guardrails

1. Generator never blocks — always degrades to a labeled estimate (the contract).
2. No silent default survives anywhere. Every removed `||`/`return N` either becomes null (display) or a labeled RPE target (generator).
3. `FTP-COLD-START-SPEC` stays unimplemented unless explicitly requested.
4. Null-safe every consumer before flipping a writer — removing a fallback un-masks read sites that were silently riding it; verify each.

---

## BUILD SEQUENCE (dependency-ordered)

1. **RPE-degrade contract (#5 keystone)** — labeled-estimate target type + the generator wiring. Everything depends on it.
2. **#5 kill the fallbacks** — display → null; generator → RPE degrade. Inventory first, null-safe consumers, then flip.
3. **Swim Layer C1** — manual CSS seed field (promote the 100yd Pace field) + zone derivation + microcopy. Lights up swim zones.
4. **Swim Layer B** — CSS-primary verdict in the analyzer; HR demoted to context.
5. **Swim Layer C2** — CSS learner mirroring the FTP learner; hard-efforts-only; equipment/drill hygiene; confidence gate.
6. **UI** — real CSS Pace Zones card replaces the D-199 swim empty-state.

Each step: reproduce-from-code first; verify on REAL data (no new workout needed — historical swims/rides); deploys flagged; one D-NNN per non-trivial decision.

---

## D / Q LOGGING PLAN (assign at end-of-session)

- **D-199** — Swim intensity = CSS-primary; swim HR un-anchored from run threshold (Layer A shipped; B/C staged). *(D-198 is taken by the unmerged `feat/d198-cycling-intent` branch — do not reuse.)*
- **D-200 (proposed)** — Null-honest baselines + the RPE-degrade contract (#5): no fabricated generics; generator degrades to labeled estimates; principle captured so it isn't reintroduced.
- **Q-NNN (#3, separate)** — `planned_workouts.session_type`/`hardness` NULL on swims = cosmetic (no DB read site; intent is tag-sourced per D-195; D-198 `session_intent` independent). No build.

---

## CROSS-REFS

- `docs/SPEC-honest-swim-inference.md`, `docs/SPEC-universal-narrative-inference.md` — HR is context not verdict; run threshold ≠ swim anchor (the Layer A bug).
- `docs/audit/99-SUMMARY.md` §3 #1 / #2 / §1 area 07 — the original flags.
- `docs/WORKORDER-swim-cleanup.md` — the equipment/drill hygiene (D-193 `detectSwimEquipment`, Q-061) the CSS learner reuses.
- `learn-fitness-profile` (FTP learner, ratchet floor, quality gates) — the template the CSS learner mirrors.
- `_shared/swim/` (`resolveSwimScalars`, `swimPacePer100Seconds`) — the single-source swim substrate CSS storage/derivation must align with.
