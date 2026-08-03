# Accessory swap soundness audit — 2026-08-03

**Findings only. No code was changed by this audit, nothing was pushed or deployed.**

Measured against the field standard for accessory substitution: Wendler 5/3/1 (push / pull /
single-leg-or-core buckets), Fitbod ("same muscle, equivalent intensity, change only equipment"),
RP ("same muscle, similar rep range"). A pure equipment change at the same muscle and tier is SOUND.

## Headline

| | |
|---|---|
| Distinct accessories in the config | 90 |
| Accessories offering swaps | 79 |
| Accessories offering none | 11 |
| Total swap offers | 764 |
| **Unsound offers** | **350 (46%)** |
| Breaks CATEGORY | 0 |
| Breaks TIER | 230 |
| Breaks MUSCLE | 253 |
| **TIER-only breaks — invisible to the current engine** | **97** |
| of those, prehab offered a loaded lift | 32 |

### The answer to the question this was commissioned for

**Yes. The engine needs an intensity-tier gate.** 97 of 764 offers are
sound on every axis the engine can currently see and unsound only on tier. No amount of tuning the
existing pattern filter reaches them — there is no field to tune.

### Why CATEGORY shows zero, and why that is not a clean bill of health

`getInSlotAlternatives` filters on `pattern` equality, and this audit's category axis is *derived
from* `pattern`. The engine's filter is strictly narrower than Wendler's three buckets (it separates
horizontal from vertical push), so a category break is impossible **by construction**. The axis
cannot fail. That is a property of the measurement, not evidence the engine reasons about category.

## How each axis was decided

**CATEGORY** — the config's own `pattern` field. The engine's field, so it agrees by definition.

**TIER** — the config has no tier field; this is the audit's own, derived from data already present:
band / isometric / mobility type, or `displayFormat: 'band'` → prehab · `displayFormat: 'bodyweight'`
with no `primaryRef` → prehab (a bird dog), with one → hypertrophy (a push-up) · loaded with ratio
≤ 0.2 → prehab · ratio > 0.2 → hypertrophy. **The 0.2 line is read off the existing entries,
not chosen**: every named prehab movement (ytw raise .15, external rotation .15, rear delt fly 0)
sits at or below it, every working accessory (dumbbell row .45, lat pulldown .65, barbell row .80)
sits above it.

**MUSCLE** — the audit's own table (146 entries). The app's `muscleGroup()` in `canonicalize.ts` is
six coarse buckets and answers `other` for most accessories; it cannot tell a side delt from a rear
delt, which is the distinction this axis needs. Names not in the table resolve to `unclassified` and
the axis is **skipped** for them rather than guessed — so the MUSCLE count is a floor, not a total.

## Worst cases — a prehab movement offered a loaded barbell lift

| Accessory (prehab) | Offered (loaded) |
|---|---|
| clamshell | Hip Thrust |
| clamshell | Barbell Hip Thrust |
| clamshell | Glute Bridge |
| clamshell | Kettlebell Swing |
| clamshell | Dumbbell Swing |
| clamshell | Db Swing |
| clamshell | Kb Swing |
| clamshell | Single Leg Glute Bridge |
| lateral band walk | Hip Thrust |
| lateral band walk | Barbell Hip Thrust |
| lateral band walk | Glute Bridge |
| lateral band walk | Kettlebell Swing |
| lateral band walk | Dumbbell Swing |
| lateral band walk | Db Swing |
| lateral band walk | Kb Swing |
| lateral band walk | Single Leg Glute Bridge |
| weighted single leg calf raise | Calf Raise |
| weighted single leg calf raise | Single Leg Calf Raise |
| band pull down | Explosive Lat Pull Down |
| band pull down | Band Assisted Pull Up |
| band overhead press | Dumbbell Press |
| band overhead press | Kettlebell Press |
| band overhead press | Pike Push Up |
| band lateral raise | Lateral Raise |
| band lateral walk | Hip Thrust |
| band lateral walk | Barbell Hip Thrust |
| band lateral walk | Glute Bridge |
| band lateral walk | Kettlebell Swing |
| band lateral walk | Dumbbell Swing |
| band lateral walk | Db Swing |
| band lateral walk | Kb Swing |
| band lateral walk | Single Leg Glute Bridge |

## The 58 newly-added entries — are their movement-patterns sound?

Checked by comparing each addition's `pattern` against the sibling entry its ratio was derived
from. Same movement under two names must land in the same swap pool, or the app offers different
substitutes depending on which spelling the plan happened to use.

**40 of 45 agree with their sibling. 5 differ — 2 are defects, 3 are improvements.**

### Defect — same movement, two patterns, two different swap pools

| Added entry | its pattern | Sibling | sibling's pattern |
|---|---|---|---|
| `prone y t w raise` | horizontal_pull | `ytw raise` | vertical_push |
| `external rotation` | horizontal_pull | `ytw raise` | vertical_push |

### Not a defect — the sibling was the one missing a pattern

| Added entry | its pattern | Sibling | sibling's pattern |
|---|---|---|---|
| `db swing` | hip_dominant | `kb/db swings` | *(none)* |
| `kb swing` | hip_dominant | `kb/db swings` | *(none)* |
| `kb db swing` | hip_dominant | `kb/db swings` | *(none)* |

`kb/db swings` is the single pre-existing entry in the whole config with no pattern, and it reads as
an oversight rather than a decision. The three new swing entries classify it correctly; the old one
still offers no swaps and receives none.

`prone y t w raise` and `ytw raise` are **the same exercise spelled two ways**. One is now offered
rear-delt/row swaps, the other is offered overhead-press swaps. This was introduced by the
2026-08-03 additions and is a real defect, not a judgement call.

⚠️ Which of the two is *correct* is a separate question. `ytw raise` sitting in `vertical_push`
is itself doubtful — a Y-T-W is a scapular/rear-delt movement, not a press — so the pre-existing
entry may be the wrong one. That is why this is reported and not fixed.

### Sound by design — 11 additions carry no pattern

`backpack carry`, `dead hang`, `farmer carry`, `farmer walk`, `farmers carry`, `foot doming`, `sled pull`, `sled push`, `suitcase carry`, `wall angel`, `wall sit`

These are the holds and carries. `pattern: null` means "no swap slot": they offer no alternatives
and are offered as none. `MovementPattern` has no `hold` or `carry` member, so this was the
conservative choice rather than filing a wall sit under `knee_dominant` and having it offered as a
substitute for a Back Squat. **It leaves an open taxonomy question, and this audit confirms the
choice is at least inert** — none of the 11 appears anywhere in the swap table.



## Caveats on the numbers

**The MUSCLE axis is the softest of the three and its count is the least actionable.** It flags a
Single Leg RDL (hamstrings) offered a Hip Thrust (glutes) — both hip-dominant, and Wendler's own
standard would accept both as posterior-chain assistance. RP and Fitbod would not. Where the two
standards disagree, this audit followed the stricter one, so treat MUSCLE as a shortlist to review
rather than a defect list.

**The MUSCLE count is a floor, not a total.** 17 accessories resolve to `unclassified` and the axis
is skipped for them entirely.

**One known TIER artifact.** `weighted single leg calf raise` carries `ratio: 0` — which in this
config means "no derivable number", not "light" — so the tier rule reads it as prehab and flags its
swaps. That is the audit's rule meeting an ambiguous field, not a real mis-offer.


## Full table

| Accessory | Swap offered | Verdict | Axis broken |
|---|---|---|---|
| **bulgarian split squat** <br><sub>single-leg/core · hypertrophy · quads</sub> | Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **walking lunges** <br><sub>single-leg/core · hypertrophy · unclassified</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **lateral lunge** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **goblet squat** <br><sub>single-leg/core · hypertrophy · quads</sub> | Leg Press <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Back Squat <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Front Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **step up** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Box Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **leg press** <br><sub>single-leg/core · hypertrophy · quads</sub> | Squat <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Back Squat <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Front Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Goblet Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **leg extension** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **hip thrust** <br><sub>single-leg/core · hypertrophy · glutes</sub> | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
| **romanian deadlift** <br><sub>single-leg/core · hypertrophy · hamstrings</sub> | Deadlift <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Conventional Deadlift <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Trap Bar Deadlift <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Sumo Deadlift <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Rdl <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
| **single leg rdl** <br><sub>single-leg/core · hypertrophy · hamstrings</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
| **single leg romanian deadlift** <br><sub>single-leg/core · hypertrophy · hamstrings</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
| **glute bridge** <br><sub>single-leg/core · hypertrophy · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
| **leg curl** <br><sub>single-leg/core · hypertrophy · hamstrings</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
| **bench** <br><sub>push · hypertrophy · unclassified</sub> | Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Barbell Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Close Grip Bench Press <br><sub>hypertrophy · triceps</sub> | sound | — |
|  | Incline Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Dumbbell Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Dumbbell Incline Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | sound | — |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **dumbbell bench press** <br><sub>push · hypertrophy · chest</sub> | Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Bench <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Barbell Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Close Grip Bench Press <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Incline Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Dumbbell Incline Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Db Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **incline bench press** <br><sub>push · hypertrophy · chest</sub> | Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Bench <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Barbell Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Close Grip Bench Press <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Dumbbell Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Dumbbell Incline Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Incline Bench <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **dumbbell incline press** <br><sub>push · hypertrophy · chest</sub> | Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Bench <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Barbell Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Close Grip Bench Press <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Incline Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Dumbbell Bench Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **dips** <br><sub>push · hypertrophy · chest</sub> | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **chest fly** <br><sub>push · hypertrophy · chest</sub> | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Dumbbell Fly <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **barbell row** <br><sub>pull · hypertrophy · lats_midback</sub> | Bent Over Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Dumbbell Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Chest Supported Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **dumbbell row** <br><sub>pull · hypertrophy · lats_midback</sub> | Barbell Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Chest Supported Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **rows** <br><sub>pull · hypertrophy · unclassified</sub> | Barbell Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Dumbbell Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Chest Supported Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **face pull** <br><sub>pull · prehab · rear_delt</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | sound | — |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Band Pull Apart <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
| **rear delt fly** <br><sub>pull · prehab · rear_delt</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | sound | — |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Rear Delt Flye <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
| **chest supported row** <br><sub>pull · hypertrophy · lats_midback</sub> | Barbell Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Dumbbell Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **dumbbell shoulder press** <br><sub>push · hypertrophy · front_delt</sub> | Shoulder Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Push Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Db Shoulder Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | MUSCLE |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | TIER |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
| **shoulder press** <br><sub>push · hypertrophy · front_delt</sub> | Overhead Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Push Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Dumbbell Shoulder Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | MUSCLE |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | TIER |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
| **lateral raise** <br><sub>push · hypertrophy · side_delt</sub> | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | MUSCLE |
|  | Dumbbell Lateral Raise <br><sub>hypertrophy · side_delt</sub> | sound | — |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | MUSCLE |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | TIER |
| **reverse fly** <br><sub>push · prehab · rear_delt</sub> | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Reverse Flye <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | MUSCLE |
| **ytw raises** <br><sub>push · prehab · rear_delt</sub> | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | MUSCLE |
| **jump squat** <br><sub>other · power · unclassified</sub> | Box Jump <br><sub>power · unclassified</sub> | sound | — |
|  | Skater Hop <br><sub>power · unclassified</sub> | sound | — |
| **plank** <br><sub>single-leg/core · prehab · core</sub> | Hanging Leg Raise <br><sub>prehab · core</sub> | sound | — |
|  | Side Plank <br><sub>prehab · core</sub> | sound | — |
|  | Pallof Press <br><sub>prehab · core</sub> | sound | — |
|  | Copenhagen Plank <br><sub>prehab · core</sub> | sound | — |
| **side plank** <br><sub>single-leg/core · prehab · core</sub> | Plank <br><sub>prehab · core</sub> | sound | — |
|  | Bird Dog <br><sub>prehab · core</sub> | sound | — |
|  | Pallof Press <br><sub>prehab · core</sub> | sound | — |
|  | Copenhagen Plank <br><sub>prehab · core</sub> | sound | — |
| **pallof press** <br><sub>single-leg/core · prehab · core</sub> | Plank <br><sub>prehab · core</sub> | sound | — |
|  | Side Plank <br><sub>prehab · core</sub> | sound | — |
|  | Copenhagen Plank <br><sub>prehab · core</sub> | sound | — |
| **clamshell** <br><sub>single-leg/core · prehab · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | **UNSOUND** | TIER |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | sound | — |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | sound | — |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
| **calf raise** <br><sub>single-leg/core · hypertrophy · calves</sub> | Weighted Single Leg Calf Raise <br><sub>prehab · calves</sub> | **UNSOUND** | TIER |
|  | Single Leg Calf Raise <br><sub>hypertrophy · calves</sub> | sound | — |
|  | Soleus Raise <br><sub>hypertrophy · calves</sub> | sound | — |
| **single leg calf raise** <br><sub>single-leg/core · hypertrophy · calves</sub> | Weighted Single Leg Calf Raise <br><sub>prehab · calves</sub> | **UNSOUND** | TIER |
|  | Calf Raise <br><sub>hypertrophy · calves</sub> | sound | — |
| **pull up** <br><sub>pull · hypertrophy · lats</sub> | Lat Pulldown <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Chin Up <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Explosive Lat Pull Down <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Band Pull Down <br><sub>prehab · lats</sub> | **UNSOUND** | TIER |
|  | Band Assisted Pull Up <br><sub>hypertrophy · lats</sub> | sound | — |
| **chin up** <br><sub>pull · hypertrophy · lats</sub> | Lat Pulldown <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Pull Up <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Explosive Lat Pull Down <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Band Pull Down <br><sub>prehab · lats</sub> | **UNSOUND** | TIER |
|  | Band Assisted Pull Up <br><sub>hypertrophy · lats</sub> | sound | — |
| **lat pulldown** <br><sub>pull · hypertrophy · lats</sub> | Pull Up <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Chin Up <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Explosive Lat Pull Down <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Band Pull Down <br><sub>prehab · lats</sub> | **UNSOUND** | TIER |
|  | Band Assisted Pull Up <br><sub>hypertrophy · lats</sub> | sound | — |
| **inverted row** <br><sub>pull · hypertrophy · lats_midback</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **push up** <br><sub>push · hypertrophy · chest</sub> | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **diamond push up** <br><sub>push · hypertrophy · triceps</sub> | Db Floor Press <br><sub>hypertrophy · chest</sub> | **UNSOUND** | MUSCLE |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | **UNSOUND** | MUSCLE |
|  | Push Up <br><sub>hypertrophy · chest</sub> | **UNSOUND** | MUSCLE |
|  | Decline Push Up <br><sub>hypertrophy · chest</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | **UNSOUND** | MUSCLE |
| **archer push up** <br><sub>push · hypertrophy · chest</sub> | Db Floor Press <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
| **pike push up** <br><sub>push · hypertrophy · front_delt</sub> | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | MUSCLE |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | TIER |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
| **skater hop** <br><sub>other · power · unclassified</sub> | Jump Squat <br><sub>power · unclassified</sub> | sound | — |
|  | Jump Lunge <br><sub>power · unclassified</sub> | sound | — |
| **lateral band walk** <br><sub>single-leg/core · prehab · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | **UNSOUND** | TIER |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Clamshell <br><sub>prehab · glutes</sub> | sound | — |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | sound | — |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
| **copenhagen plank** <br><sub>single-leg/core · prehab · core</sub> | Plank <br><sub>prehab · core</sub> | sound | — |
|  | Side Plank <br><sub>prehab · core</sub> | sound | — |
|  | Pallof Press <br><sub>prehab · core</sub> | sound | — |
| **single leg glute bridge** <br><sub>single-leg/core · hypertrophy · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
| **kettlebell swing** <br><sub>single-leg/core · hypertrophy · unclassified</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
| **dumbbell swing** <br><sub>single-leg/core · hypertrophy · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
| **kb/db swings** <br><sub>other · hypertrophy · glutes</sub> | *(none offered)* | — | — |
| **squat jump** <br><sub>single-leg/core · power · unclassified</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Step Up <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Bodyweight Squat <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | **UNSOUND** | TIER |
| **dumbbell press** <br><sub>push · hypertrophy · front_delt</sub> | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Db Push Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | MUSCLE |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | TIER |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
| **kettlebell press** <br><sub>push · hypertrophy · front_delt</sub> | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | MUSCLE |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | sound | — |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | TIER |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
| **db row** <br><sub>pull · hypertrophy · lats_midback</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **light db row** <br><sub>pull · hypertrophy · lats_midback</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **single arm row** <br><sub>pull · hypertrophy · lats_midback</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **explosive lat pull down** <br><sub>pull · hypertrophy · lats</sub> | Band Pull Down <br><sub>prehab · lats</sub> | **UNSOUND** | TIER |
|  | Band Assisted Pull Up <br><sub>hypertrophy · lats</sub> | sound | — |
| **db floor press** <br><sub>push · hypertrophy · chest</sub> | Chest Fly <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
|  | Diamond Push Up <br><sub>hypertrophy · triceps</sub> | **UNSOUND** | MUSCLE |
|  | Archer Push Up <br><sub>hypertrophy · chest</sub> | sound | — |
| **db romanian deadlift** <br><sub>single-leg/core · hypertrophy · hamstrings</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
| **db swing** <br><sub>single-leg/core · hypertrophy · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
| **kb swing** <br><sub>single-leg/core · hypertrophy · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
| **barbell hip thrust** <br><sub>single-leg/core · hypertrophy · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | sound | — |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | MUSCLE |
| **barbell walking lunge** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **dumbbell walking lunge** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **sandbag lunge** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **explosive step up** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
|  | Single Leg Squat <br><sub>hypertrophy · quads</sub> | sound | — |
| **cable face pull** <br><sub>pull · prehab · rear_delt</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
| **external rotation** <br><sub>pull · prehab · rotator_cuff</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
| **prone y t w raise** <br><sub>pull · prehab · rear_delt</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | sound | — |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | sound | — |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Ring Row <br><sub>hypertrophy · lats_midback</sub> | **UNSOUND** | TIER + MUSCLE |
| **weighted single leg calf raise** <br><sub>single-leg/core · prehab · calves</sub> | Calf Raise <br><sub>hypertrophy · calves</sub> | **UNSOUND** | TIER |
|  | Single Leg Calf Raise <br><sub>hypertrophy · calves</sub> | **UNSOUND** | TIER |
| **band pull down** <br><sub>pull · prehab · lats</sub> | Explosive Lat Pull Down <br><sub>hypertrophy · lats</sub> | **UNSOUND** | TIER |
|  | Band Assisted Pull Up <br><sub>hypertrophy · lats</sub> | **UNSOUND** | TIER |
| **band overhead press** <br><sub>push · prehab · front_delt</sub> | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER |
|  | Band Lateral Raise <br><sub>prehab · side_delt</sub> | **UNSOUND** | MUSCLE |
| **band lateral raise** <br><sub>push · prehab · side_delt</sub> | Dumbbell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Kettlebell Press <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Raise <br><sub>hypertrophy · side_delt</sub> | **UNSOUND** | TIER |
|  | Reverse Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Ytw Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | MUSCLE |
|  | Pike Push Up <br><sub>hypertrophy · front_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Band Overhead Press <br><sub>prehab · front_delt</sub> | **UNSOUND** | MUSCLE |
| **band lateral walk** <br><sub>single-leg/core · prehab · glutes</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | **UNSOUND** | TIER |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Clamshell <br><sub>prehab · glutes</sub> | sound | — |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | sound | — |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | TIER |
|  | Nordic Hamstring Curl <br><sub>hypertrophy · hamstrings</sub> | **UNSOUND** | TIER + MUSCLE |
| **band assisted pull up** <br><sub>pull · hypertrophy · lats</sub> | Explosive Lat Pull Down <br><sub>hypertrophy · lats</sub> | sound | — |
|  | Band Pull Down <br><sub>prehab · lats</sub> | **UNSOUND** | TIER |
| **inverted ring row** <br><sub>pull · hypertrophy · lats_midback</sub> | Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Light Db Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Single Arm Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
|  | Cable Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | External Rotation <br><sub>prehab · rotator_cuff</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Prone Y T W Raise <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Rear Delt Fly <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Face Pull <br><sub>prehab · rear_delt</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Inverted Row <br><sub>hypertrophy · lats_midback</sub> | sound | — |
| **nordic hamstring curl** <br><sub>single-leg/core · hypertrophy · hamstrings</sub> | Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Barbell Hip Thrust <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Leg Curl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Rdl <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Single Leg Romanian Deadlift <br><sub>hypertrophy · hamstrings</sub> | sound | — |
|  | Kettlebell Swing <br><sub>hypertrophy · unclassified</sub> | sound | — |
|  | Dumbbell Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Db Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Kb Swing <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Clamshell <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Lateral Band Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Single Leg Glute Bridge <br><sub>hypertrophy · glutes</sub> | **UNSOUND** | MUSCLE |
|  | Band Lateral Walk <br><sub>prehab · glutes</sub> | **UNSOUND** | TIER + MUSCLE |
|  | Back Extension <br><sub>hypertrophy · spinal_erectors</sub> | **UNSOUND** | MUSCLE |
| **single leg squat** <br><sub>single-leg/core · hypertrophy · quads</sub> | Bulgarian Split Squat <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Reverse Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Barbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Dumbbell Walking Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Sandbag Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Explosive Step Up <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Leg Extension <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Lateral Lunge <br><sub>hypertrophy · quads</sub> | sound | — |
|  | Squat Jump <br><sub>power · unclassified</sub> | **UNSOUND** | TIER |
| **dead hang** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **wall sit** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **wall angel** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **foot doming** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **farmers carry** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **farmer carry** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **suitcase carry** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **backpack carry** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **sled push** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
| **sled pull** <br><sub>other · prehab · unclassified</sub> | *(none offered)* | — | — |
