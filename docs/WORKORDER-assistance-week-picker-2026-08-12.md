# WORKORDER — Assistance Week Picker (Wendler Forever model)

**Date:** 2026-08-12 · **From:** PM chat · **For:** terminal engineer
**Status: ALL FIVE SLICES BUILT 2026-08-13.** Working tree only — **not committed, not pushed, not
deployed, not device-verified.** Decisions landed as **D-423** (the model) and **D-424** (the gate);
D-385 / D-404 / D-405 back-annotated as superseded; F-5 in `BUILDER-SWEEP-FINDINGS.md` back-annotated
as answered. ⚠️ **This doc is now scaffolding.** Its substance is in the two D-entries — delete it once
the acceptance run passes, per the spec lifecycle in CLAUDE.md.
**Mock (interactive, verified):** https://claude.ai/code/artifact/37d4fb7d-f82a-4312-ad11-e0a18e96b787

---

## What this is

Replace the current block-wide 3-pick assistance model with a **per-day picker** built on Wendler's
5/3/1 **Forever** assistance system: three categories (push / pull / single-leg-core), **one movement
per category per day**, athlete picks the movement, weight stays **by feel** (D-406 intact — no load
prescribed, ever). This is the athlete's own spreadsheet, digitized — nothing beyond what the book asks.

⛔ **This SUPERSEDES the current re-roling model (D-385 / D-404 / D-405).** Today the athlete makes 3
block-wide picks that `resolveAssistance` re-roles across days. The new model has the athlete pick per
day inside a locked frame, so the re-roling machinery (`ROLE_BY_DAY`, `resolveRole`, `fitsRole`,
`substitutedFor`/`balancedFor`, most of `ROLE_FALLBACK`) is retired. Write a superseding D-entry; do
not silently delete.

## Decisions locked this session

- **Frame:** 4 lift-days (Press / Bench / Squat / Deadlift), each = Push · Pull · Single-Leg/Core, one
  movement each. Source: Forever p.24. Same three categories every day (not muscle-per-day like 2nd ed).
- **By feel:** 50 reps/slot, no weight prescribed. D-406 unchanged.
- **Focus chips (body-part emphasis):** Balanced + Arms · Chest · Shoulders · Back · Glutes · Abs.
  Multi-select, **cap 3**. A focus re-points the matching category's movements across the week
  (targeting = movement choice within the category, not a new axis). Reuses the D-323 accessory-bias
  mechanism. Push serves Chest/Shoulders/triceps; Pull serves Back/biceps; Single-Leg/Core serves
  Glutes/Abs. No Legs/Quads chip (endurance user), Glutes covers hamstrings (p.29).
- **Add-abs:** default is his **3 slots**. Optional **4th = abs** — a *second movement in the
  single-leg/core category* (Forever p.32 "one or two per category"; reps split within the slot, e.g.
  25/25). Stays three categories; it is NOT a fourth category and must not stack a fresh 50 (that would
  add fatigue against the endurance budget).
- **Long-scroll fix:** collapsible day cards, matching the `StrengthLogger.tsx` accordion pattern
  (`expandedExercises` / chevron / one `overflow-y-auto` region). First day open, rest collapse to a
  one-line movement summary.
- **Design:** route buttons/chips through `GalaxyButton` (`src/components/ui/galaxy-button.tsx`) —
  white-alpha fills, state via brightness, buttons rounded-xl / chips rounded-full. Amber is the top
  bleed + small accents only (matches commit 170a2608), never a control fill. No emojis. Lowercase brand.

## Open decisions (settle before slice 5)

- Storage: per **day-type** (4×3, reused each week) vs per calendar session. (PM assumes day-type.)
- Add-abs: auto-surface when a focus collides in a category, or manual only.
- Equipment gating (slice 4): does menu-gating **replace** `substituteExerciseForEquipment` or sit in
  front of it as primary with substitution as backstop.

---

## The verified movement catalog (all Wendler)

Every movement below is from Forever "Assistance Work" (pp.24–32) unless noted. **Token status** = does
it resolve in `src/lib/exercise-config.ts` (D-322: an unresolved name silently borrows another entry).

⛔ **TOKEN COLUMN VERIFIED AND CLOSED 2026-08-13 (slice 1).** Every name below now resolves `exact` or
`folded` — checked by running all 25 through `resolveExerciseConfig` and asserting `via`, not by eye.
The **Movement (display)** column is now the string slice 5 must store: three names were renamed to
their canonical entry as this doc instructed, so display and stored name are the same string
everywhere. Three of the ✅s in the original column were wrong — see the corrections under the table.

| Category | Movement (display = stored) | Primary muscle | Source | Token |
|---|---|---|---|---|
| Push | Dips | triceps / chest | p.24 | ✅ exact |
| Push | Push-Up | chest | p.25 | ✅ folded → `push up` |
| Push | DB Bench Press | chest | p.25 | ✅ exact |
| Push | DB Incline Press | chest | p.25 | ✅ exact **(key added)** |
| Push | DB Shoulder Press | shoulders | p.25 | ✅ exact |
| Push | Plate Raise | shoulders | p.26 | ✅ exact **(config added)** |
| Push | Triceps Pushdown | triceps | p.26 | ✅ exact **(key added)** |
| Push | Triceps Extension | triceps | p.26 | ✅ exact **(key added)** |
| Pull | Chin-Up | lats / biceps | p.26 | ✅ folded → `chin up` |
| Pull | Dumbbell Row | upper back | p.27 | ✅ exact |
| Pull | Barbell Row | upper back | p.27 | ✅ exact |
| Pull | Lat Pulldown | lats | p.27 | ✅ exact |
| Pull | Inverted Row | back | p.26 | ✅ exact |
| Pull | Face Pull | upper back | p.28 | ✅ exact |
| Pull | **Dumbbell Curl** *(was "Curls")* | biceps | p.27 | ✅ exact |
| SL/Core | Reverse Lunge | legs | p.30 | ✅ exact |
| SL/Core | Bulgarian Split Squat | legs | p.30 | ✅ exact |
| SL/Core | Front Squat | legs | p.30 (leg) | ✅ exact |
| SL/Core | Glute-Ham Raise | glutes | p.29 | ✅ folded → `glute ham raise` **(config added)** |
| SL/Core | **Back Extension** *(was "Back Raise")* | lower back / glutes | p.29 | ✅ exact |
| SL/Core | Reverse Hyper | glutes | p.29 | ✅ exact **(key added)** |
| SL/Core | Hanging Leg Raise | abs | p.30 | ✅ exact |
| SL/Core | **Ab Wheel Rollout** *(was "Ab Wheel")* | abs | p.30 | ✅ exact |
| SL/Core | Weighted Sit-Up | abs | 2nd ed p.43/45 | ✅ folded → `weighted sit up` **(key added)** |
| SL/Core | DB Side Bend | abs/obliques | 2nd ed p.43/51 | ✅ exact **(config added)** |

**Three ✅s in the original column were wrong**, and the first is the D-322 bug class live:

- **DB Incline Press** did not resolve to `dumbbell incline press`. It **fuzzy-matched the bare `press`
  key — the barbell overhead press, ratio 1.0, counted as a total.** Its siblings `db bench press` and
  `db shoulder press` were already in the table; the incline one was missed. Now an exact key.
- **Triceps Pushdown / Triceps Extension** (Wendler's anatomically-correct plural) resolved to
  **nothing at all** — neither string contains `tricep …`, so even the fuzzy pass returned null.
- **Reverse Hyper** fuzzy-matched `reverse hyperextension`. Right movement, wrong route.

**Two names Wendler uses were changed to a non-Wendler word** — "Back Raise" → **Back Extension**, and
"Curls" → **Dumbbell Curl**. That is this doc's own instruction and it is what makes display and stored
name one string. Flagging it because the guardrail below says stay strictly Wendler on movement names:
the *movement* is his, the *spelling* is the config's.

**Display names = Wendler's words; stored name = config canonical (decided 2026-08-13).** Store the
canonical so the token resolves; **display Wendler's word** where they differ: `Back Extension`→"Back
Raise", `Dumbbell Curl`→"Curls", `Ab Wheel Rollout`→"Ab Wheel". A display alias, not a second token.

**DB Side Bend load (decided 2026-08-13):** "start light" = a **flat, low, overwritable default** in the
logger entry box — NOT a main-lift-derived ratio. Keeps D-406 honest (the app never presents a
fabricated calculated number) while a beginner isn't left with a blank box. `primaryRef: null`, no ratio.

**Muscle-label honesty:** where Wendler itemizes muscles, the label is his. Three movements he names
but doesn't assign a muscle — label uses his movement-*family* word, not invented anatomy: Push-Up→chest
(press), Face Pull→upper back (row), Reverse Lunge→legs (single-leg). Abs menu (4, all his): Hanging Leg
Raise, Ab Wheel, Weighted Sit-Up, DB Side Bend.

---

## The slices (dependency order)

### Slice 1 — Tokens ✅ DONE 2026-08-13 (pushed? no — working tree)
Make every catalog name resolve exactly in `exercise-config.ts`. Add configs: **Plate Raise,
Glute-Ham Raise, DB Side Bend**. Map display→canonical: **Curls→Dumbbell Curl, Back Raise→Back
Extension, Ab Wheel→Ab Wheel Rollout**. No fuzzy matches (D-322).

**Shipped:** 11 keys added at the tail of `EXERCISE_CONFIG` (`src/lib/exercise-config.ts`), under a
`WENDLER FOREVER ASSISTANCE CATALOG` section header — 3 new movements, 2 second-spelling siblings
(`dumbbell side bend`, so both the DB and Dumbbell forms resolve), and 6 display-spelling keys the
punctuation fold cannot reach. All 25 catalog names verified `exact` or `folded`; the three renames
are applied to the table above. **Nothing else was touched** — `assistance-menu.ts` still holds the
old 3-pick menu, which is slice 5's job to replace.

### Slice 2 — Equipment additions ✅ DONE 2026-08-13 (working tree; not pushed, not deployed)
Add **incline bench, decline bench, ab wheel** to the equipment inventory. Touch: the picker list
(`src/components/PlanWizard.tsx:520/726`, `TrainingBaselines.tsx:972`), the detectors
(`supabase/functions/_shared/strength-equipment-tier.ts`), and the substitution map
(`substituteExerciseForEquipment`, `materialize-plan/index.ts:1086`). Note: incline exists as an
exercise ratio (materialize-plan:844) but not as selectable equipment today; ab wheel is not equipment
at all.

### Slice 3 — `requires` tagging ✅ DONE 2026-08-13 (working tree; not pushed, not deployed)
Give every assistance movement an accurate `requires` that maps to the real equipment list. Today
`requires` in `assistance-menu.ts` is **advisory — nothing filters on it, and it's incomplete**. This
is the prerequisite for gating.

**Shipped:** `ASSISTANCE_GEAR` + `gearRoutesFor()` in `src/lib/assistance-menu.ts` — 44 movements,
keyed by folded NAME. Shape is **OR of ANDs** (`GearRoutes = GearKey[][]`): `[['dumbbells',
'incline_bench']]` is one route needing both, `[['ghd'], ['decline_bench'], ['barbell']]` is three ways
to do the same movement. A flat list could not express the decline-bench alternative at all.

⛔ **The per-option `requires` field is GONE, not fixed.** It could not do the job: everything in
`ROLE_FALLBACK` (Leg Curl, Nordic Curl, Sit Up…) and everything `substituteExerciseForEquipment`
emits reaches a session without passing through `ASSISTANCE_MENU`, so half the vocabulary was
untaggable by construction — and a movement in two lists would have carried two answers. Nothing read
the old field. Name-keyed, there is one answer, and it survives slice 5 retiring the menu.

⚠️ **`ASSISTANCE_GEAR` and `exerciseRequiredGearKeys` answer DIFFERENT questions — do not reconcile
them.** The shared map builds the athlete-facing *Equipment —* line and is generous (it names the
bench beside a DB row). `ASSISTANCE_GEAR` is the MINIMUM TO PERFORM and is what a gate may read (a DB
row needs dumbbells; the bench is a brace). Gating on the generous answer would delete the row from
every athlete with dumbbells and no bench. Both docblocks say so.

**Vocabularies are pinned by a contract test**, since `src/` cannot value-import `supabase/functions/`:
`strength-equipment-tier.test.ts` fails if `ASSISTANCE_GEAR` uses a key the shared map cannot label or
no chip can produce. It caught `rings` on first run — a labelled, matchable key with **no chip behind
it, pre-dating this slice**.

⛔ **FOUR KEYS HAVE NO INVENTORY CHIP — slice 4 must rule on them.** `dip_bars` and
`leg_curl_machine` arrive with "Commercial gym"; **`ghd` and `rings` arrive with nothing**, so no
athlete can declare them. Gating naively deletes **Dips** and **Leg Curl** from every home-gym menu.
Options: add chips, or treat a movement whose every route is unownable as ungated. Not pre-decided.

**Decline bench now has its consumer** — Nordic Curl, Glute-Ham Raise and Back Extension each carry
`[['ghd'], ['decline_bench'], ['barbell']]`, and a test asserts incline does **not** qualify. Slice 2's
"delete-if-unclaimed" note is closed.

⚠️ **SIDE FINDING, NOT FIXED (outside slice 3): `substituteExerciseForEquipment` emits two names that
do not resolve.** `Band Leg Curls` fuzzy-borrows `leg curls` — **a band priced at 0.3× the DEADLIFT
and displayed as a total load**, the same bug class as the slice-2 incline find. `Bent-Over Reverse
Flyes` borrows `reverse flye` (same movement, harmless prescription). The assistance path never prices
anything (D-406), so the exposure is the protocol paths that also emit Leg Curl. Fix = two keys in
`exercise-config.ts`. The vocabulary guard misses both because it does not read substitution outputs —
worth adding as a seventh corpus source.

⛔ **DECLINE BENCH IS NOT DEAD — give it a consumer (decided 2026-08-13).** Slice 2 parked decline as
"delete-if-unclaimed." It has a real use: a decline bench's **ankle rollers** anchor the feet for
**Nordic Curl** and **Back Raise / hamstring raise** (kneel/hinge with feet hooked under — the standard
home substitute for a GHD/GHR). So map **Nordic Curl and Back Raise to accept a decline bench** as one
equipment route (alongside a GHD/GHR machine, or feet under a loaded barbell). ⚠️ It's the *ankle
anchor* that qualifies, not incline — an incline-only bench does NOT unlock these. Keep decline.

⛔ **CARRY LEG CURL THROUGH THE MIGRATION (Slice 5 risk, flagged here).** Leg Curl is Wendler's hamstring
pick and it currently lives in the OLD `assistance-menu.ts` `leg_match` fallback that Slice 5 retires —
and its no-machine substitution to **Nordic / Band Leg Curl** rides on it (`substituteExerciseForEquipment`).
The new single-leg/core pool must carry Leg Curl AND keep that Nordic/band swap, or hamstring-via-curl
drops out. The GHR / Back Raise / Reverse Hyper path survives via the Glutes focus regardless.

### Slice 4 — Picker gating ✅ DONE 2026-08-13 (working tree)

**Shipped.** Chips added for **Dip bars · Leg curl machine · GHD · Gymnastic rings · Plyo box**
(`TrainingBaselines.tsx`) — no "ungate if unownable" workaround. A contract test now asserts BOTH
directions: every chip produces a gear key, every gear key comes from a chip. It found a FIFTH
unreachable key on its first run — `box`, used by the performance protocol's Box Jumps, same hole,
closed the same way.

**The gate is one function on both surfaces.** `canPerform` (`src/lib/strength-gear.ts`) reads
`ASSISTANCE_GEAR`'s OR-of-ANDs routes; the builder's picker calls it through `optionsFor`, the swap
sheet through `canSetUp` beside the existing coarse `canDo`. ⛔ **`canDo` was NOT deleted** — it still
covers the ~300 library movements that carry no gear tag, using the only signal they have.

⛔ **THE VOCABULARY MOVED, AND THE SLICE-3 CONTRACT TEST'S PREMISE WITH IT.** Slice 3 kept a duplicate
key union on the client because `src/` cannot value-import `supabase/functions/`, and pinned the two
with a test. Gating from both sides made a duplicate unsurvivable, so the whole vocabulary moved to
`src/lib/strength-gear.ts` and `_shared/strength-equipment-tier.ts` re-exports it — every edge importer
unchanged, one definition. A tripwire over a copy is not the same thing as one definition.

⚠️ **Unknown degrades to UNGATED.** An empty `equipment.strength` means "we never asked", not "owns
nothing"; a strict reading hands every new athlete four days of push-ups.


⛔ **PREREQUISITE — ADD THE MISSING CHIPS FIRST (decided 2026-08-13, Michael).** Slice 3 found four gear
keys with no inventory chip: **dip bars, leg-curl machine, GHD, rings**. Add inventory chips for them
(same pattern as Slice 2's incline/decline/ab-wheel — the picker list, the detectors, `athleteEquipmentToKeys`)
so a home-gym athlete can declare them. **Do NOT use the "ungate if unownable" workaround** — add the
chips so gating reads a real answer. (Gym-goers already get dip_bars + leg_curl_machine via "Commercial
gym"; the gap is home owners of a dip station / leg-curl attachment / GHD / rings.)

Then filter the assistance menu by the athlete's equipment. ⛔ **Reverses a deliberate call** — the menu
is ungated on purpose today (assistance-menu.ts / F-5 in `docs/BUILDER-SWEEP-FINDINGS.md`); reasons were
bands have no flag and menu-gating-plus-substitution was a "half-rule." Overturn it explicitly.
`substituteExerciseForEquipment` becomes the backstop for edge cases, not the primary fix.

⛔ **TWO GATING PATHS — don't fix one and leave the other (Slice 2 engineer's flag).** `canDo` in
`src/lib/exercise-alternatives.ts:194` (the swap sheet) derives equipment from **displayFormat only**
(barbell / dumbbell / band / bodyweight) and **defaults to true** — it can't see the new gear keys, so
it offers e.g. Ab Wheel Rollout (bodyweight) to everyone. Route BOTH the picker and the swap sheet
through `exerciseRequiredGearKeys` + `athleteEquipmentToKeys` (which now know the keys), or it's a
half-rule again.

### Slice 5 — The per-day picker feature ✅ DONE 2026-08-13 (working tree)

**Shipped.** `src/lib/assistance-catalog.ts` — the 25-movement catalog, focus pools derived from the
catalog's own tags, the balanced default week, the storage shape + migration, per-day resolution and
the swap-sheet peers. `assistance-menu.ts` is gutted to the rep scaling and `ASSISTANCE_GUIDANCE`; the
re-roling machinery is deleted with its reasoning recorded in D-423 and in the file's own header.
Composer reads the new shape (`strength-primary-plan.ts:assistanceRows`); the builder card at
`NonRaceBuilder.tsx` is the per-day grid with focus chips, collapsible days and per-day add-abs.

**Rep scaling KEPT** (floor 50 → ceiling 75 off `pullupMaxReps`, anchor holds the floor), with a test
that fails if it is ever flattened to the mock's 50. **Add-abs SHARES** the single-leg/core budget
(50 → 25/25), asserted. **Migration** covers v2, the old flat 3-pick shape, and nothing — falling back
per slot per day so one bad key cannot wipe eleven good choices.

⚠️ **THE MOCK COULD NOT BE READ** (the artifact URL needs auth), so the focus→movement pools were
DERIVED from the catalog's own muscle column rather than copied: Push serves chest/shoulders/triceps,
Pull serves back/biceps, Single-leg/core serves glutes/abs, exactly as this doc specifies. The one
example the doc gives — *Chest → dips/pushup/DB bench/incline* — matches the derived pool exactly,
which is the only cross-check available. **If the mock's pools differ anywhere else, that is the place
to look.**

- New storage shape (per day-type × 3 categories) on `goals.training_prefs.assistance_picks`; **migrate
  or fall back** so existing goals don't strand (the keys are persisted — D-322 class).
- Wizard UI (per-day 12-slot grid, focus chips, collapsible days, add-abs) — extend the card at
  `NonRaceBuilder.tsx:~2862`.
- Composer wiring: `strength-primary-plan.ts` (sole production caller of `resolveAssistance`) reads the
  new shape.
- **Focus→movement pools: take them from the MOCK, don't reinvent.** The mock's `pools`/`focusMap`
  (which movement fills each category per focus — Chest→dips/pushup/DB bench/incline, etc.) is the
  spec. Wire to the catalog with the D-322 guardrail.
- **Rep scaling — DECIDE, then wire.** The current engine scales assistance reps to capacity
  (`assistanceTotalReps`, floor 50 → ceiling 75 off `pullupMaxReps`, anchor-cycle aware). The mock
  shows a flat 50. Keep the capacity scaling (preserves the existing behaviour) unless Michael says
  flatten. Do not silently drop it.
- **Add-abs rep split:** the 4th (abs) shares the single-leg/core slot's rep budget (~25/25), never a
  fresh 50 — see Guardrails.
- Retire the re-roling machinery; write the superseding D-entry for D-385/404/405.

## Open decisions (Michael, before Slice 5)
- **Storage granularity — DECIDED 2026-08-13: per day-type, reused each week (set once, repeats).**
  Wendler allows varying workout-to-workout (Forever p.24, "it is the work that matters"), so repeating
  is a fine default, not a constraint.
- **Add-abs surfacing — DECIDED 2026-08-13: a per-day ADD-ON, not a headline.** Removed from the lede.
  On any day the athlete taps "+ abs" to append one ab move (Hanging Leg Raise, Ab Wheel, Weighted
  Sit-Up, Side Bend) beside the leg move; reps split (~25/25); the leg move is not replaced. Per-day,
  so it adds abs only on the days chosen (balanced already carries abs once, on Press day).
- **Gating relationship — DECIDED (engineering): menu-gate is primary, `substituteExerciseForEquipment`
  stays as backstop.** Not a product call.

## Cleanup fixes — fold into the run (approved 2026-08-13, do not defer)

- **`substituteExerciseForEquipment` emits two unresolvable names (D-322 class).** "Band Leg Curls"
  fuzzy-borrows `leg curls` and gets **priced off the deadlift as a fake total load** — real exposure is
  the protocol paths that also emit Leg Curl (assistance never prices — D-406). "Bent-Over Reverse Flyes"
  borrows `reverse flye` (harmless). **Fix = add the two keys** so both resolve exact.
- **Vocabulary guard has a blind spot:** it doesn't read `substituteExerciseForEquipment` outputs, which
  is why it missed both above. **Add substitution outputs as a 7th corpus source** so emitted names are
  checked.

## Guardrails (do not violate)
- No load on assistance, ever (D-406). Output is movement + rep total, "by feel."
- Stay strictly Wendler for movements + muscle words. No Plank (not his). Sit-Up/Side Bend are his (2nd ed).
- Three categories. Add-abs shares the slot's rep budget; never a fresh 50, never a 4th category.
- GalaxyButton for controls; amber for bleed/accents only; no emojis; lowercase brand.
