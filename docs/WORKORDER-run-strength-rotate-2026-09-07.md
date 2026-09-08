# Work order — Run + Strength asks nothing the page answers (2026-09-07, evening)

Ruled by Michael 2026-09-07: on Run + Strength the engine ROTATES the run workouts; no athlete
choice on the endurance side for now ("maybe a more surgical option later"). p112 is the rule:
hold the load, vary "across slightly different set durations and intensities" session to session.
p246 fixes the week: MLSS+ level 2 · NT level 3 · VT1 level 1 · LSD level 2 (long run under 100
minutes, p247). Nothing on the endurance step is a question the page leaves open.

## 1. Steps (`src/lib/wizard-steps.ts`, `src/components/NonRaceBuilder.tsx`)

On the Run + Strength path (`trainCard === 'run'`, program `run_strength`, frame `strength_5k`):

- `posture` comes out. It asks nothing since 32bca15d (one line of copy). The lifting line
  ("Four lifting days a week. Your endurance fits around them.") moves to the top of the schedule
  step, where days are picked, so the count is still stated before the calendar.
- `endurance` comes out. Hours, days, running experience and the two hard-session pickers are
  not asked. Rotation is the engine's ("Engine's pick" is already the default; the pickers remain
  reachable on the built week card afterwards, unchanged).
- Flow becomes: Train → Run → accessory picks → schedule → numbers → confirm. Six screens.
  ⚠️ The accessory-picks step STAYS in this order. Moving it behind Adjust on the built week is the
  remaining step to five and is a separate ruling.
- Standard Focus is untouched (it has no `endurance` hours ask and its per-session lengths are its
  own; D-457 guard stays).

## 2. What the engine receives when nothing is asked

- `enduranceExperience`: not sent → `experienceLevels(null)` → the page's levels. ✅ already the
  behaviour for an unanswered screen; assert it.
- `enduranceDaysBySport` / weekly hours: not sent → no `dayShortfall`, four runs. Assert it.
- Advanced tier (one or two extra easy runs) keeps firing from DEMONSTRATED miles only (25 mi/wk,
  ours, labelled). Nothing else adds runs.
- Swim: off, no field sent.

## 3. Copy

Schedule step, top line on this path: `Four lifting days a week. Four runs fit around them.`
No em dashes, no emojis, no imperatives, no author's name.

## 4. Guards

- `wizard-steps.test.ts`: the Run + Strength step list is exactly
  `['goal','train','program','accessory','schedule','numbers','confirm']`; Standard Focus and the
  race path unchanged.
- Composed Run + Strength block from a wizard payload with none of the removed fields: four runs,
  levels 2/3/1/2, long run ≤ 100 min, week 1 test week. Hash equal to a build that sent the
  page's levels explicitly.
- All Rounder hash unchanged (method in NOTES-stage4).

## 5. Verify, ship

Robot account through Train → Run → build; export shows four runs a week at the page's levels,
workouts differing week to week (rotation), no swim, name "Run + Strength". Client tests, `_shared`
deno tests, tsc, eslint at baseline. Push. Deploy only what changed. `npm run ios`.
Report pushed / web / functions with versions / iOS synced / not device-checked.

## 6. Out of scope

Per-row length picks or any "surgical" option (later, Michael's words). Accessory picks behind
Adjust. Ride + Strength. The red interval box on the Performance tab.
