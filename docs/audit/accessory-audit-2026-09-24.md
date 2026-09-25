# Accessory audit — every strength row the standing-plan composer builds (2026-09-24)

Read-only. Repo `/Users/michaelambp/efforts` at `d1cde4377`. Nothing edited.

## 0. How the rows were produced

- `composeBlock` from `supabase/functions/_shared/standing-plan/compose.ts:4480`, 12 weeks, `taperWeeks: []` (the server's own call, `supabase/functions/generate-strength-plan/index.ts:1035,1038`).
- Competition lifts: Bench Press / Back Squat / Deadlift. Tested working numbers on file (fixture figures; they set weights, not movements).
- Picks: the wizard's zero-touch path — `defaultViadaPicks(kit, [], frame)` → `normalizeViadaPrefs` → `slotPicks` + `accessoryPicks = flattenViadaPicks(...)` (`generate-strength-plan/index.ts:858-889`).
- Kit A, **minimum kit**: `["Barbell + plates", "Squat rack / Power cage", "Dumbbells"]` → gear keys `barbell, rack, dumbbells`. No bench, no pull-up bar.
- Kit B, **commercial gym**: `["Commercial gym"]` → `barbell, rack, bench, dumbbells, cable, pull_up_bar, incline_bench, machine, bands, kettlebell, suspension_trainer, stability_ball, back_extension_bench, sled, sandbag` (`src/lib/strength-gear.ts:230-262`).
- Frames: `all_rounder`, `hyp_5k`, `cycling_base`, `strength_half`. All four compose (281 / 303 / 186 / 247 strength rows per kit).
- Columns: **slot** = `source_row` (the page's cell, hinge/push swapped on even weeks); **shown** = `execution_name ?? name`; **implement** = `implementOnKit` (`strength-grid/grid.ts:334`); **logs** = `displayFormat` (`src/lib/exercise-config.ts`) plus "each" when `usesTwoDumbbellsOnKit` is true (`grid.ts:308`); **bar** = `barIsTheLoad` (`src/lib/strength-gear.ts:1046`); **cite** = `FILING` basis + page (`strength-grid/taxonomy.ts:211`). **SS** = the row carries `superset_group`.
- Scripts and raw output: `scratchpad/audit.ts`, `scratchpad/audit-rows.json`, `scratchpad/picks.ts`.
- With no picks sent at all the built rows are the same except the slots the wizard defaults touch (listed in `audit-rows.json` → `noPicksDiff`); the athlete never takes that path, so the rows below are the wizard-default ones.

Rows common to every frame and kit:

- **Test week (week 1)**: `Test: Upper` Monday = the frame's tested upper lifts (Bench Press; Overhead Press where the frame tests it: all_rounder, strength_half). `Test: Lower` Tuesday = Back Squat, Deadlift. All barbell, total, bar chip on. On kit A the Bench Press row is built on a kit with no bench (see §2.4).
- **Plyo warm-up** (Wednesday; strength_half also Monday and Saturday for the first drill): slot 1 rotates Stiff-Legged Run (wk 1,5,9) → A-Skip (2,6,10) → B-Skip (3,7,11) → Bounding (4,8,12); slot 2 rotates Pogo Hops (1,6,11) → Rebound Jumps (2,7,12) → Lunge Hops (3,8) → Single-Leg Hops (4,9) → Skater Hops (5,10). Bodyweight, no gear tag, not in the movement filing (p227 drills).

---

## 1. Every strength row, by kit and frame

Legend: `bar=yes` the bar chip + plate math draw; `each` = the logger prints LB/KG EACH.

### 1A. Minimum kit (barbell + rack + dumbbells)

#### all_rounder (Viada pp274-275)

**Monday — Upper body: Push** (weeks 2–12)

| # | slot as printed | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary push | Bench Press | barbell (route `barbell+bench` — **kit has no bench**) | total | yes | printed p218 |
| 2 | 1 x DE: secondary push | Arnold Press | dumbbells | total, each | no | printed p220 |
| 3 | 1 x HYP: braced push | DB Floor Press | dumbbells | per hand, each | no | variant p220 (dumbbell bench press from the floor) |
| 4 | 2 x HYP: focused push/pull (arms) superset **SS** | Behind The Neck DB Triceps Extension | dumbbells (one) | total | no | printed p222 |
| 5 | 2 x HYP: focused push/pull (arms) superset **SS** | DB Drag Curl (canonical: Drag Curl) | dumbbells | total, each | no | printed p222 |
| 6 | 1 x HYP: focused push | Dumbbell Lateral Raise (canonical: Lateral Raise) | dumbbells | per hand, each | no | printed p222 |

**Tuesday — Lower body: Hinge** (weeks 2–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary hinge | Deadlift | barbell | total | yes | printed p219 |
| 2 | 2 x HYP: braced hinge / braced lower push superset **SS** | Back Extension | barbell **as anchor** (floor, feet under a loaded bar) | bodyweight | no | printed p222 (filed "machine back extension, on a bench") |
| 3 | 2 x HYP: braced hinge / braced lower push superset **SS** | Front Squat | barbell | total | yes | printed p219 (primary) |
| 4 | 1 x HYP: focused hamstring | Nordic Hamstring Curl | barbell as anchor | bodyweight | no | variant p223 (single-joint hamstring) |
| 5 | 1 x DE: braced push (asymmetrical) | Reverse Lunge | bodyweight route; dumbbells in hand | per hand, each | no | printed p220 |

**Thursday — Upper body: Pull** (weeks 1–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary pull | Barbell Row | barbell | total | yes | printed p218 |
| 2 | 1 x DE: secondary pull | Kroc Row | dumbbells (one) | total | no | printed p220 |
| 3 | 1 x HYP: braced pull | DB Row | dumbbells (one) | per hand | no | variant p220 (dumbbell barbell row) |
| 4 | 2 x HYP: focused push/pull (arms) superset **SS** | Behind The Neck DB Triceps Extension | dumbbells (one) | total | no | printed p222 |
| 5 | 2 x HYP: focused push/pull (arms) superset **SS** | DB Drag Curl | dumbbells | total, each | no | printed p222 |
| 6 | 1 x HYP: focused pull | Bent-Over Dumbbell Rear Delt Fly (canonical: Rear Delt Machine) | dumbbells | total, each | no | printed p222 |

**Friday — Lower body: Push** (weeks 1–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary push | Back Squat | barbell | total | yes | printed p219 |
| 2 | 2 x HYP: braced hinge / braced lower push superset **SS** | Back Extension | barbell as anchor | bodyweight | no | printed p222 |
| 3 | 2 x HYP: braced hinge / braced lower push superset **SS** | Front Squat | barbell | total | yes | printed p219 |
| 4 | 1 x HYP: focused quadriceps | Bulgarian Split Squat | bodyweight route; dumbbells in hand | per hand, each | no | judged p220 (split squat, rear foot raised) |
| 5 | 1 x SKILL: braced push (asymmetrical) | Reverse Lunge | bodyweight route; dumbbells in hand | per hand, each | no | printed p220 |

No slot rotates across the block on this frame: every row above is the same movement weeks 1–12 (2–12 for Monday/Tuesday, which the test week replaces).

#### hyp_5k (Viada pp244-245)

**Monday — Upper body hypertrophy: Push primary** (weeks 2–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: Secondary push | Bench Press | barbell (no bench on kit) | total | yes | printed p218 |
| 2 | 1 x HYP: Braced push | DB Floor Press | dumbbells | per hand, each | no | variant p220 |
| 3 | 1 x HYP: Braced pull | DB Row | dumbbells (one) | per hand | no | variant p220 |
| 4 | 2 x HYP: Focused push/pull (arms) superset **SS** | Behind The Neck DB Triceps Extension | dumbbells (one) | total | no | printed p222 |
| 5 | 2 x HYP: Focused push/pull (arms) superset **SS** | DB Drag Curl | dumbbells | total, each | no | printed p222 |
| 6 | 1 x HYP: Focused push | Dumbbell Lateral Raise | dumbbells | per hand, each | no | printed p222 |

**Tuesday — Lower body hypertrophy: Hinge primary** (weeks 2–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x DE: Secondary hinge | Deadlift | barbell | total | yes | printed p219 |
| 2 | 1 x HYP: Secondary hinge | Romanian Deadlift | barbell | total | yes | printed p220 |
| 3 | 2 x HYP: Braced hinge/braced lower push superset **SS** | Back Extension | barbell as anchor | bodyweight | no | printed p222 |
| 4 | 2 x HYP: Braced hinge/braced lower push superset **SS** | Front Squat | barbell | total | yes | printed p219 |
| 5 | 1 x HYP: Focused hamstring | Nordic Hamstring Curl | barbell as anchor | bodyweight | no | variant p223 |
| 6 | 1 x DE: Braced push (asymmetrical) | Reverse Lunge | bodyweight route; dumbbells | per hand, each | no | printed p220 |

**Thursday — Upper body hypertrophy: Pull primary** (weeks 1–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: Secondary pull | Barbell Row | barbell | total | yes | printed p218 |
| 2 | 1 x HYP: Braced pull | DB Row | dumbbells (one) | per hand | no | variant p220 |
| 3 | 1 x HYP: Braced push | DB Floor Press | dumbbells | per hand, each | no | variant p220 |
| 4 | 2 x HYP: Focused push/pull (arms) superset **SS** | Behind The Neck DB Triceps Extension | dumbbells (one) | total | no | printed p222 |
| 5 | 2 x HYP: Focused push/pull (arms) superset **SS** | DB Drag Curl | dumbbells | total, each | no | printed p222 |
| 6 | 1 x HYP: Focused pull | Bent-Over Dumbbell Rear Delt Fly | dumbbells | total, each | no | printed p222 |

**Friday — Lower body hypertrophy: Push primary** (weeks 1–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x DE: Secondary push | Back Squat | barbell | total | yes | printed p219 |
| 2 | 1 x HYP: Secondary hinge | Romanian Deadlift | barbell | total | yes | printed p220 |
| 3 | 2 x HYP: Braced hinge/braced lower push superset **SS** | Back Extension | barbell as anchor | bodyweight | no | printed p222 |
| 4 | 2 x HYP: Braced hinge/braced lower push superset **SS** | Front Squat | barbell | total | yes | printed p219 |
| 5 | 1 x HYP: Focused quadriceps | Bulgarian Split Squat | bodyweight route; dumbbells | per hand, each | no | judged p220 |
| 6 | 1 x SKILL: Braced push (asymmetrical) | Reverse Lunge | bodyweight route; dumbbells | per hand, each | no | printed p220 |

No rotation across weeks.

#### cycling_base (Viada p278)

**Monday — ME Upper** (weeks 2–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: Primary push | Bench Press | barbell (no bench on kit) | total | yes | printed p218 |
| 2 | 1 x ME: Accessory: primary pull | Barbell Row | barbell | total | yes | printed p218 |
| 3 | 1 x DE: Accessory: secondary push | Military Press | barbell | total | yes | printed p218 (primary; admitted by name on this cell) |
| 4 | 1 x HYP: Accessory: focused pull, focused push | Bent-Over Dumbbell Rear Delt Fly | dumbbells | total, each | no | printed p222 |
| 5 | 1 x HYP: Accessory: focused pull, focused push | Dumbbell Lateral Raise | dumbbells | per hand, each | no | printed p222 |

**Tuesday — ME Lower** (weeks 2–12; slots 1–2 rotate)

| # | slot | shown | weeks | implement | logs | bar | cite |
|---|---|---|---|---|---|---|---|
| 1 | 1 x ME: Primary push lower (rotate with primary hinge) | Back Squat | 2,4,6,8,10,12 | barbell | total | yes | printed p219 |
| 1 | 1 x ME: Primary hinge lower (rotate with primary push) | Deadlift | 3,5,7,9,11 | barbell | total | yes | printed p219 |
| 2 | 1 x ME: Accessory: primary hinge lower (rotate…) | Trap Bar Deadlift | 2,4,6,8,10,12 | barbell (route `barbell`; the kit chip does not name a trap bar) | total | yes | printed p219 |
| 2 | 1 x ME: Accessory: primary push lower (rotate…) | Front Squat | 3,5,7,9,11 | barbell | total | yes | printed p219 |
| 3 | 1 x DE: Accessory: secondary hinge lower | Romanian Deadlift | all | barbell | total | yes | printed p220 |
| 4 | 1 x HYP: Accessory: accessory lower | Split Squat | all | dumbbells | **total, no "each"** | no | printed p220 |

**Thursday — DE: Full** (weeks 1–12; slots 2 and 4 rotate)

| # | slot | shown | weeks | implement | logs | bar | cite |
|---|---|---|---|---|---|---|---|
| 1 | 1 x DE: Primary push | Bench Press | all | barbell (no bench on kit) | total | yes | printed p218 |
| 2 | 1 x DE: Primary push lower (rotate…) | Back Squat | 1,3,5,7,9,11 | barbell | total | yes | printed p219 |
| 2 | 1 x DE: Primary hinge lower (rotate…) | Deadlift | 2,4,6,8,10,12 | barbell | total | yes | printed p219 |
| 3 | 1 x DE: Accessory: primary pull | Barbell Row | all | barbell | total | yes | printed p218 |
| 4 | 1 x DE: Accessory: primary hinge lower (rotate…) | Trap Bar Deadlift | 1,3,5,7,9,11 | barbell | total | yes | printed p219 |
| 4 | 1 x DE: Accessory: primary push lower (rotate…) | Front Squat | 2,4,6,8,10,12 | barbell | total | yes | printed p219 |
| 5 | 1 x SKILL: Carry | Farmers Carry | all | dumbbells | per hand, each | no | printed p226 |

#### strength_half (Viada pp250-251)

**Monday — ME: Upper** (weeks 2–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: Primary push | Bench Press | barbell (no bench on kit) | total | yes | printed p218 |
| 2 | 1 x SKILL: Accessory: primary pull | Barbell Row | barbell | total | yes | printed p218 |
| 3 | 1 x DE: Accessory: braced push | DB Shoulder Press | dumbbells | per hand, each | no | variant p220 (dumbbell military press) |
| 4 | 1 x HYP: Accessory: focused pull, focused push | Bent-Over Dumbbell Rear Delt Fly | dumbbells | total, each | no | printed p222 |
| 5 | 1 x HYP: Accessory: focused pull, focused push | Dumbbell Lateral Raise | dumbbells | per hand, each | no | printed p222 |

**Tuesday — ME: Lower** (weeks 2–12; slots 1–2 rotate)

| # | slot | shown | weeks | implement | logs | bar | cite |
|---|---|---|---|---|---|---|---|
| 1 | 1 x ME: Primary push lower (rotate…) | Back Squat | 2,4,6,8,10,12 | barbell | total | yes | printed p219 |
| 1 | 1 x ME: Primary hinge lower (rotate…) | Deadlift | 3,5,7,9,11 | barbell | total | yes | printed p219 |
| 2 | 1 x SKILL: Accessory: primary hinge lower (rotate…) | Trap Bar Deadlift | 2,4,6,8,10,12 | barbell | total | yes | printed p219 |
| 2 | 1 x SKILL: Accessory: primary push lower (rotate…) | Front Squat | 3,5,7,9,11 | barbell | total | yes | printed p219 |
| 3 | 1 x DE: Accessory: braced hinge lower | Back Extension | all | barbell as anchor | bodyweight | no | printed p222 |
| 4 | 1 x HYP: Accessory lower | Split Squat | all | dumbbells | total, no "each" | no | printed p220 |

**Thursday — DE: Upper** (weeks 1–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x DE: Primary push | Bench Press | barbell (no bench on kit) | total | yes | printed p218 |
| 2 | 1 x DE: Accessory: braced pull | DB Row | dumbbells (one) | per hand | no | variant p220 |
| 3 | 1 x HYP: Accessory: secondary push | Arnold Press | dumbbells | total, each | no | printed p220 |
| 4 | 1 x HYP: Accessory: focused pull, focused push | DB Drag Curl | dumbbells | total, each | no | printed p222 |

**Friday — DE: Lower** (weeks 1–12; slots 1–2 rotate)

| # | slot | shown | weeks | implement | logs | bar | cite |
|---|---|---|---|---|---|---|---|
| 1 | 1 x DE: Primary push lower (rotate…) | Back Squat | 1,3,5,7,9,11 | barbell | total | yes | printed p219 |
| 1 | 1 x DE: Primary hinge lower (rotate…) | Deadlift | 2,4,6,8,10,12 | barbell | total | yes | printed p219 |
| 2 | 1 x SKILL: Accessory: braced hinge lower (rotate with braced push lower) | Back Extension | 1,3,5,7,9,11 | barbell as anchor | bodyweight | no | printed p222 |
| 2 | 1 x SKILL: Accessory: braced push lower (rotate with braced hinge lower) | Bulgarian Split Squat | 2,4,6,8,10,12 | bodyweight route; dumbbells | per hand, each | no | judged p220 |
| 3 | 1 x HYP: Accessory: secondary push lower | Walking Lunge | all | bodyweight route; dumbbells | per hand, each | no | judged p220 (forward lunge, travelling) |
| 4 | 1 x HYP: Accessory: focused push | Weighted Knee Raise | all | dumbbells (2nd route; no pull-up bar on kit) | total | no | printed p223 (weighted knee raises, hip flexors) |

### 1B. Commercial gym

#### all_rounder

**Monday — Upper body: Push** (weeks 2–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary push | Bench Press | barbell | total | yes | printed p218 |
| 2 | 1 x DE: secondary push | Seated DB Press | dumbbells | per hand, each | no | printed p220 |
| 3 | 1 x HYP: braced push | Smith Machine Press | machine | total | no | printed p221 |
| 4 | 2 x HYP: focused push/pull (arms) superset **SS** | Triceps Pushdown | cable | total | no | printed p222 |
| 5 | 2 x HYP: focused push/pull (arms) superset **SS** | Preacher Curl | machine (station owned; first route is dumbbells+bench) | total | no | printed p222 |
| 6 | 1 x HYP: focused push | Dumbbell Lateral Raise | dumbbells | per hand, each | no | printed p222 |

**Tuesday — Lower body: Hinge** (weeks 2–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary hinge | Deadlift | barbell | total | yes | printed p219 |
| 2 | 2 x HYP: braced hinge / braced lower push superset **SS** | Reverse Hyperextension | machine | bodyweight | no | printed p222 |
| 3 | 2 x HYP: braced hinge / braced lower push superset **SS** | Leg Press | machine | total | no | printed p221 |
| 4 | 1 x HYP: focused hamstring | Machine Hip Thrust | machine | total | no | printed p223 |
| 5 | 1 x DE: braced push (asymmetrical) | Bulgarian Split Squat | bodyweight route; dumbbells | per hand, each | no | judged p220 |

**Thursday — Upper body: Pull** (weeks 1–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary pull | Pull Up | bodyweight (pull-up bar) | bodyweight | no | printed p218 |
| 2 | 1 x DE: secondary pull | Kroc Row | dumbbells (one) | total | no | printed p220 |
| 3 | 1 x HYP: braced pull | Lat Pulldown | cable | total | no | printed p221 |
| 4 | 2 x HYP: focused push/pull (arms) superset **SS** | DB Skull Crusher (canonical: Skull Crusher) | dumbbells | total, each | no | printed p222 |
| 5 | 2 x HYP: focused push/pull (arms) superset **SS** | DB Drag Curl | dumbbells | total, each | no | printed p222 |
| 6 | 1 x HYP: focused pull | Rear Delt Machine | machine | total | no | printed p222 |

**Friday — Lower body: Push** (weeks 1–12)

| # | slot | shown | implement | logs | bar | cite |
|---|---|---|---|---|---|---|
| 1 | 1 x ME: secondary push | Back Squat | barbell | total | yes | printed p219 |
| 2 | 2 x HYP: braced hinge / braced lower push superset **SS** | Reverse Hyperextension | machine | bodyweight | no | printed p222 |
| 3 | 2 x HYP: braced hinge / braced lower push superset **SS** | Leg Press | machine | total | no | printed p221 |
| 4 | 1 x HYP: focused quadriceps | Leg Extension | machine | total | no | printed p223 |
| 5 | 1 x SKILL: braced push (asymmetrical) | Reverse Lunge | bodyweight route; dumbbells | per hand, each | no | printed p220 |

#### hyp_5k

**Monday — Push primary** (weeks 2–12): Bench Press (barbell, bar yes) · Smith Machine Press (machine, total) · Lat Pulldown (cable, total) · **SS** Triceps Pushdown (cable, total) + Preacher Curl (machine, total) · Dumbbell Lateral Raise (dumbbells, per hand, each). Slots: `1 x ME: Secondary push`, `1 x HYP: Braced push`, `1 x HYP: Braced pull`, `2 x HYP: Focused push/pull (arms) superset` ×2, `1 x HYP: Focused push`.

**Tuesday — Hinge primary** (weeks 2–12): Deadlift (`1 x DE: Secondary hinge`, bar yes) · Romanian Deadlift (`1 x HYP: Secondary hinge`, barbell, bar yes, p220) · **SS** Reverse Hyperextension (machine, bodyweight) + Leg Press (machine, total) · Machine Hip Thrust (`1 x HYP: Focused hamstring`, machine, total, p223) · Bulgarian Split Squat (`1 x DE: Braced push (asymmetrical)`, per hand, each, judged p220).

**Thursday — Pull primary** (weeks 1–12): Pull Up (`1 x ME: Secondary pull`, bodyweight) · Lat Pulldown (`1 x HYP: Braced pull`) · Smith Machine Press (`1 x HYP: Braced push`) · **SS** DB Skull Crusher + DB Drag Curl (dumbbells, total, each) · Rear Delt Machine (`1 x HYP: Focused pull`, machine, total).

**Friday — Push primary lower** (weeks 1–12): Back Squat (`1 x DE: Secondary push`, bar yes) · Romanian Deadlift (`1 x HYP: Secondary hinge`) · **SS** Reverse Hyperextension + Leg Press · Leg Extension (`1 x HYP: Focused quadriceps`, machine) · Reverse Lunge (`1 x SKILL: Braced push (asymmetrical)`, per hand, each).

#### cycling_base

**Monday — ME Upper** (weeks 2–12): Bench Press (`1 x ME: Primary push`) · Pull Up (`1 x ME: Accessory: primary pull`, bodyweight, p218) · Seated DB Press (`1 x DE: Accessory: secondary push`, dumbbells, per hand, each, p220) · Rear Delt Machine (`focused pull, focused push`, machine, total) · Dumbbell Lateral Raise (`focused pull, focused push`, per hand, each).

**Tuesday — ME Lower** (weeks 2–12): slot 1 Back Squat (even weeks) / Deadlift (odd 3–11) · slot 2 Trap Bar Deadlift (even) / Front Squat (odd) — barbell, bar yes, p219 · KB Swing (`1 x DE: Accessory: secondary hinge lower`, kettlebell, total, printed p220) · Machine Hip Thrust (`1 x HYP: Accessory: accessory lower`, machine, total, p223).

**Thursday — DE: Full** (weeks 1–12): Bench Press · Back Squat (odd) / Deadlift (even) · Pull Up (`1 x DE: Accessory: primary pull`) · Trap Bar Deadlift (odd) / Front Squat (even) · Farmers Carry (`1 x SKILL: Carry`, dumbbells, per hand, each, p226).

#### strength_half

**Monday — ME: Upper** (weeks 2–12): Bench Press (`1 x ME: Primary push`) · Pull Up (`1 x SKILL: Accessory: primary pull`) · Smith Machine Press (`1 x DE: Accessory: braced push`, machine, total, p221) · Rear Delt Machine (machine, total) · Dumbbell Lateral Raise (per hand, each).

**Tuesday — ME: Lower** (weeks 2–12): Back Squat (even) / Deadlift (odd) · Trap Bar Deadlift (even) / Front Squat (odd) · Ground-based Deadlift Machine (`1 x DE: Accessory: braced hinge lower`, machine, total, printed p222) · Machine Hip Thrust (`1 x HYP: Accessory lower`, machine, total).

**Thursday — DE: Upper** (weeks 1–12): Bench Press (`1 x DE: Primary push`) · Chest Supported Row (`1 x DE: Accessory: braced pull`, **machine**, **per hand, no "each"**, printed p221) · Arnold Press (`1 x HYP: Accessory: secondary push`, dumbbells, total, each) · DB Drag Curl (`1 x HYP: Accessory: focused pull, focused push`, dumbbells, total, each).

**Friday — DE: Lower** (weeks 1–12): Back Squat (odd) / Deadlift (even) · Ground-based Deadlift Machine (`1 x SKILL: … braced hinge lower`, odd) / Leg Press (`… braced push lower`, even) — machine, total · Walking Lunge (`1 x HYP: Accessory: secondary push lower`, per hand, each, judged p220) · Leg Extension (`1 x HYP: Accessory: focused push`, machine, total, p223).

---

## 2. The six checks

### 2.1 Total-format rows where the bar chip does not draw (`barIsTheLoad` false)

Every row with `displayFormat: 'total'` and `barIsTheLoad === false`. The "kit routes" column is what the kit can hold it with; a row whose shown name states the implement, or whose kit reaches one implement only, is listed for completeness.

| kit | rows (frame / day) | shown | kit routes reached | shown name says implement? | logger |
|---|---|---|---|---|---|
| A | cycling_base Tue; strength_half Tue | **Split Squat** | dumbbells, barbell (`strength-gear.ts:801`) | no | one total, no "each", no bar |
| A | all_rounder Mon; strength_half Thu | Arnold Press | dumbbells only | no (dumbbells is the only form) | total + "each" |
| A | all_rounder Thu | Kroc Row | dumbbells only | no (one dumbbell) | total |
| A | all_rounder Mon+Thu; hyp_5k Mon+Thu | Behind The Neck DB Triceps Extension | dumbbells only | yes (DB) | total |
| A | all_rounder Mon+Thu; hyp_5k Mon+Thu; strength_half Thu | DB Drag Curl | dumbbells, barbell (`strength-gear.ts:895`) | yes (DB) | total + "each" |
| A | all_rounder Thu; hyp_5k Thu; cycling_base Mon; strength_half Mon | Bent-Over Dumbbell Rear Delt Fly | dumbbells | yes | total + "each" |
| A | strength_half Fri | Weighted Knee Raise | dumbbells (pull-up-bar route unreachable; `strength-gear.ts:850`) | no | total |
| B | all_rounder Mon; hyp_5k Mon | **Preacher Curl** | dumbbells+bench, machine (`strength-gear.ts:886`) | no | one total, no "each", no bar |
| B | all_rounder Mon; hyp_5k Mon+Thu; strength_half Mon | Smith Machine Press | machine | yes (machine) | total, no bar chip |
| B | all_rounder Thu; hyp_5k Thu | DB Skull Crusher | dumbbells+bench, barbell+bench (`strength-gear.ts:867`) | yes (DB) | total + "each" |
| B | all_rounder Thu+Mon; hyp_5k; strength_half Thu | DB Drag Curl | dumbbells, barbell | yes (DB) | total + "each" |
| B | all_rounder Thu | Kroc Row | dumbbells | no (one dumbbell) | total |
| B | all_rounder Thu; hyp_5k Mon+Thu | Lat Pulldown | cable | station name | total |
| B | all_rounder Mon; hyp_5k Mon | Triceps Pushdown | cable | station name | total |
| B | all_rounder Thu; hyp_5k Thu; cycling_base Mon; strength_half Mon | Rear Delt Machine | machine | yes | total |
| B | all_rounder Tue+Fri; hyp_5k Tue+Fri; strength_half Fri (even) | Leg Press | machine | yes | total |
| B | all_rounder Fri; hyp_5k Fri; strength_half Fri | Leg Extension | machine | yes | total |
| B | all_rounder Tue; hyp_5k Tue; cycling_base Tue; strength_half Tue | Machine Hip Thrust | machine | yes | total |
| B | cycling_base Tue | KB Swing | kettlebell | yes | total |
| B | strength_half Tue; Fri (odd) | Ground-based Deadlift Machine | machine | yes | total |
| B | strength_half Thu | Arnold Press | dumbbells | no | total + "each" |

The two rows where more than one implement is reachable and the name says none are **Split Squat (kit A)** and **Preacher Curl (kit B)**.

Rules that produce them:
- `barIsTheLoad` step 4: a bar and another implement both reach it → bar only when the bar is the first route AND `primaryRef` is set (`src/lib/strength-gear.ts:1067-1072`). Split squat's first route is dumbbells (`strength-gear.ts:801`) so no bar; preacher curl has no `primaryRef` (`src/lib/exercise-config.ts:2579`) and its first route is dumbbells+bench (`strength-gear.ts:886`).
- "each" is read only for names in `TWO_DUMBBELLS` (`strength-grid/grid.ts:294-302`); `split squat` is not in that set while `bulgarian split squat`, `walking lunge`, `reverse lunge` are (`grid.ts:301`).
- `executionName` renames only names in `EXECUTION_NAME` (`grid.ts:587-608`); `split squat` and `preacher curl`-on-the-station have no entry (`grid.ts:739` names the home route only, and `grid.ts:604` keeps his name when the station is owned).
- Related: **Chest Supported Row** (kit B strength_half Thu) resolves to the machine (`implementOnKit` station-first, `grid.ts:334-346`) but its config is `displayFormat: 'perHand'` (`exercise-config.ts:473`), so the logger draws a per-hand box on a machine row with no "each".

### 2.2 A barbell movement supersetted with another barbell movement

| kit | frame / days | superset (page text) | rows | weeks |
|---|---|---|---|---|
| A | all_rounder Tue + Fri | 2 x HYP: braced hinge / braced lower push superset | **Back Extension** (`implementOnKit` = barbell, as the anchor under the feet) + **Front Squat** (barbell, loaded) | Tue 2–12, Fri 1–12 |
| A | hyp_5k Tue + Fri | 2 x HYP: Braced hinge/braced lower push superset | Back Extension + Front Squat | Tue 2–12, Fri 1–12 |

Kit B pairs Reverse Hyperextension (machine) + Leg Press (machine); the arms superset on both kits is dumbbells + dumbbells or cable + machine. No other superset holds two barbell rows.

Rules:
- Back extension's only route is `[['barbell']]` (`src/lib/strength-gear.ts:465`; how-to "feet hooked under a loaded barbell", `strength-grid/grid.ts:805`). Front squat `[['barbell']]` (`strength-gear.ts:382`).
- The braced-hinge pick offers only `back extension` on kit A (`accessory-picks.ts:899-911`, `hisList` is four machine movements, none reachable; muscle-narrowing substitutes from the cell's own category, `accessory-picks.ts:1928-1958`).
- The braced-leg pick's `subLeadWith: ['front squat', …]` (`accessory-picks.ts:959`) is the first option on kit A, and the default is `opts[0]` (`accessory-picks.ts:2052`).
- The barbell-sharing sort exists only for the arms cell: `armsCell && inSuperset ? armsOnTheBar(...) : 0` (`compose.ts:1649-1651`). The lower superset has no such key; the two rows get `superset_group` from the page text alone (`compose.ts:2002-2005`, frames `frames.ts:1220,1222,1278,1280`; hyp_5k `frames.ts:850-851,886-887`).

### 2.3 A movement built on an implement that is not its usual form

"Usual form" = the first route in `ASSISTANCE_GEAR` (`src/lib/strength-gear.ts:300`), which the file itself calls "natural-first" (`strength-gear.ts:978-979`), or the name's own implement.

| kit | rows | canonical → shown | usual form | built as | rule |
|---|---|---|---|---|---|
| A + B | every arms superset row; strength_half Thu | Drag Curl → **DB Drag Curl** | the route list now leads with dumbbells (`strength-gear.ts:891-895`, marked OURS, 2026-09-24); the drag curl's how-to says "a barbell or dumbbells" (`grid.ts:896`) | two dumbbells, "each" | route order `strength-gear.ts:895`; name `grid.ts:718-721`; rank `accessory-picks.ts:1142-1144` + `compose.ts:1649-1651` |
| B | all_rounder Thu; hyp_5k Thu | Skull Crusher → **DB Skull Crusher** | dumbbells+bench first, barbell+bench second (`strength-gear.ts:867`); the gym owns both | two dumbbells, "each" | `strength-gear.ts:858-867`; `grid.ts:707-717` |
| A | all_rounder Thu; hyp_5k Thu; cycling_base Mon; strength_half Mon | Rear Delt Machine → **Bent-Over Dumbbell Rear Delt Fly** | machine by name; route list leads with dumbbells (`strength-gear.ts:849`) | bent-over with dumbbells | `grid.ts:692-706` (dumbbells+incline route → chest-supported; dumbbells alone → bent-over; kit A has no incline bench) |
| A | all_rounder Tue+Fri; hyp_5k Tue+Fri; strength_half Tue, Fri (odd) | **Back Extension** (p222 prints "machine back extension") | machine / 45° bench | on the floor, feet under a loaded bar | route `strength-gear.ts:463-465`; name `grid.ts:649`; how-to `grid.ts:805`. The filing cite reads "machine back extension, on a bench" (`taxonomy.ts:283`) while the how-to is the floor version |
| A | all_rounder Tue; hyp_5k Tue | **Nordic Hamstring Curl** | bodyweight, ankles anchored | feet under a loaded bar | `strength-gear.ts:452-463`; only option in the `ham_iso` cell on kit A. The cell's `excludes: ['nordic curl', 'nordic curls']` (`accessory-picks.ts:1019`) does not match it: `canonicalize('nordic hamstring curl')` = `nordic_hamstring_curl`, `canonicalize('nordic curl')` = `nordic_curl` |
| A | strength_half Fri | **Weighted Knee Raise** | hanging from a pull-up bar (first route) | dumbbell route (second route) — kit has no pull-up bar | `strength-gear.ts:850`; no how-to (`executionHowTo` returns null) |
| B | all_rounder Mon; hyp_5k Mon | **Preacher Curl** | first route dumbbells+bench | machine (station owned → `implementOnKit` returns the station) | `grid.ts:334-346`; name kept `grid.ts:604` |
| B | strength_half Thu | **Chest Supported Row** | first route dumbbells+incline bench | machine; config `perHand` | `grid.ts:334-346`; `exercise-config.ts:473` |
| A + B | every lunge / split-squat row | Reverse Lunge, Walking Lunge, Bulgarian Split Squat | route `ALWAYS` (bodyweight, `strength-gear.ts:385,388,692`) | shown as dumbbells-in-hand ("each") because the kit has dumbbells | `grid.ts:320` ("needs nothing: dumbbells if the kit has them") |

### 2.4 A machine / cable movement on a kit that has none — and other gear the kit did not declare

Kit B owns every station; nothing to flag there. Kit A:

| rows | movement | what the page names | what the kit has | rule |
|---|---|---|---|---|
| all_rounder Mon (2–12); hyp_5k Mon (2–12); cycling_base Mon (2–12) + Thu (1–12); strength_half Mon (2–12) + Thu (1–12); **Test: Upper** week 1, every frame | **Bench Press** | barbell + bench (`strength-gear.ts:540`); `canPerform` = false on kit A | no bench | competition lifts are placed by name with no kit check: `compose.ts:1714-1717` ("never deduped away — the frame asks for it by name"); the test week reads `testedLifts` (`frames.ts:1740,1706,1750,1692`) |
| cycling_base Tue (even) + Thu (odd); strength_half Tue (even) | **Trap Bar Deadlift** | a trap bar | "Barbell + plates" only; route is `[['barbell']]` (`strength-gear.ts:537`) | grid order for the primary hinge accessory (`grid.ts:228-262`), role filter excludes the competition deadlift (`compose.ts:1720-1722`) |
| all_rounder Thu; hyp_5k Thu; cycling_base Mon; strength_half Mon | **Rear Delt Machine** (canonical name; the stored `name` field) | a machine | none; shown renamed to the dumbbell fly | `grid.ts:692-706`; the canonical name is what the logger keys on and what the Swap sheet lists |
| all_rounder Tue+Fri; hyp_5k Tue+Fri; strength_half Tue, Fri | **Back Extension** (filed as p222's "machine back extension") | a machine or bench | neither; floor version | `strength-gear.ts:463-465`, `taxonomy.ts:283` |

### 2.5 The same movement twice on one day

None, on either kit, any frame, any week (checked by `canonicalize(name)` across every strength session on a weekday, including plyo and test sessions). Nearest cases, not duplicates: kit A all_rounder Thursday carries three rows (Barbell Row ME, Kroc Row DE, DB Row HYP); kit A hyp_5k Monday and Thursday each carry DB Floor Press + DB Row (two upper days, same two movements). The guard is `takenToday` (`compose.ts:1523-1524`, `1647`, `1808-1819`) and the wizard's own same-day dedupe (`accessory-picks.ts:2099-2110`).

### 2.6 A variant / judged movement picked while a page-printed one was reachable

| kit | rows | picked (basis) | printed movements reachable in the same cell | rule that ordered them |
|---|---|---|---|---|
| A | all_rounder Thu; hyp_5k Mon+Thu; strength_half Thu (DE braced pull) | **DB Row** (variant p220, `taxonomy.ts:246`) | Kroc Row, T-bar Row, Meadows Row, Gorilla Row (printed p220) — the wizard list reads `db row > kroc row > t-bar row > meadows row > gorilla row` | braced-pull `hisList` (`accessory-picks.ts:886`) reaches nothing on kit A → substitute step widens to the secondary category (`accessory-picks.ts:1928-1958`); all substitutes share one rank so `resolveSlot` order decides (`accessory-picks.ts:1772-1790`, `1966-1968`); that order is `poolFor` = equipment fit then catalogue order (`grid.ts:159`, `228-262`); default = `opts[0]` (`accessory-picks.ts:2052`). On all_rounder Thursday the DE slot already holds Kroc Row (`frames.ts:1257-1258` prefer list; `compose.ts:1746-1749`) |
| A | all_rounder Fri; hyp_5k Fri | **Bulgarian Split Squat** (judged, `taxonomy.ts:266`) in `focused quadriceps` | Reverse Lunge, Lunge, Zercher Squat, Split Squat (printed p220); wizard list `bulgarian split squat > walking lunge > reverse lunge > lunge > zercher squat > split squat > goblet squat` | `quad_iso` `hisList` is four machine/station movements (`accessory-picks.ts:802-803`), none reachable → stepped widening to secondary/braced (`accessory-picks.ts:1928-1958`), catalogue order (`grid.ts:228`); default `opts[0]`. The Friday SKILL slot takes Reverse Lunge by `prefer` (`frames.ts:1282`, hyp_5k `frames.ts:889`) |
| A | strength_half Fri (even weeks) | **Bulgarian Split Squat** in `SKILL: Accessory: braced push lower` | Reverse Lunge, Split Squat (printed) | no pick key for a SKILL cell (`compose.ts:1502-1511`); braced press_lower pool empty on kit A → ladder to secondary (`grid.ts:356-420`, `SUBSTITUTION_LADDER` `grid.ts:127-134`); first not-taken option in pool order (`compose.ts:1749`) |
| A + B | strength_half Fri | **Walking Lunge** (judged, `taxonomy.ts:264`) in `secondary push lower` | Reverse Lunge, Split Squat, Zercher Squat (printed) | `single_leg_b.leadWith` is written `['walking lunge', 'reverse lunge', 'zercher squat', 'split squat']` (`accessory-picks.ts:761`); the spec text calls the walking lunge "his forward lunge performed travelling" (`accessory-picks.ts:736-739`) |
| B | all_rounder Tue; hyp_5k Tue | **Bulgarian Split Squat** in `DE: braced push (asymmetrical)` | Reverse Lunge, Split Squat (printed) | the frame's own `prefer: ['bulgarian split squat', 'reverse lunge']` (`frames.ts:1233`; hyp_5k `frames.ts:858,928`), read at `compose.ts:1746-1749` |
| A | strength_half Mon | **DB Shoulder Press** (variant p220, `taxonomy.ts:237`) in `DE: Accessory: braced push` | Arnold Press (printed p220, reachable; it is built on Thursday of the same frame) | the cell names no muscle (`frames.ts:671`); braced push_upper empty on kit A → ladder to secondary (`grid.ts:356-420`); pool order (`grid.ts:228-262`); first option not taken (`compose.ts:1749`) |
| A | all_rounder Mon; hyp_5k Mon+Thu | **DB Floor Press** (variant p220, `taxonomy.ts:238`) in `braced push` | none on the cell's muscle (chest); Arnold Press is reachable but tagged deltoids, so the muscle law (`accessory-picks.ts:1888-1891`, `compose.ts:1362-1380`) removes it. Listed for completeness, not a hit |
| A | all_rounder Tue; hyp_5k Tue | **Nordic Hamstring Curl** (variant p223) | none printed reachable on kit A (leg curl, hip thrusts, cable kickback all need a station) — not a hit under this check; see 2.3 for the exclusion spelling |

---

## 3. Facts outside the six checks, recorded because they change what the athlete sees

- Kit A cycling_base Monday `1 x DE: Accessory: secondary push` builds **Military Press** (a p218 primary) because the cell admits it by name (`frames.ts:488-493`) and a named movement outranks a muscle match (`compose.ts:1428-1430`). On kit B the same cell builds Seated DB Press.
- Kit A strength_half Friday `1 x HYP: Accessory: focused push` builds **Weighted Knee Raise** (tagged core in the wizard list) because `quad_iso` on this frame has no muscle and the kit reaches nothing else on the cell's `hisList` (`accessory-picks.ts:802-803`).
- Kit A cycling_base / strength_half `accessory lower` builds **Split Squat** with one total number; kit B builds Machine Hip Thrust there (`frames.ts:518-524`, `687-688`; `accessory-picks.ts:729-751`).
