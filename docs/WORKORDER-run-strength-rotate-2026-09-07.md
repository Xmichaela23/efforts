# Work order — Run + Strength asks nothing the page answers (2026-09-07, evening)

Ruled by Michael 2026-09-07: on Run + Strength the engine ROTATES the run workouts; no athlete
choice on the endurance side for now ("maybe a more surgical option later"). p112 is the rule:
hold the load, vary "across slightly different set durations and intensities" session to session.
p246 fixes the week: MLSS+ level 2 · NT level 3 · VT1 level 1 · LSD level 2 (long run under 100
minutes, p247). Nothing on the endurance step is a question the page leaves open.

## 1. Steps (`src/lib/wizard-steps.ts`, `src/components/NonRaceBuilder.tsx`)

⚠️ AMENDED the same evening (Michael): *"they choose the length of the runs instead."* The endurance
screen STAYS, cut down to the one thing the page leaves to the athlete: how long the long run is.

On the Run + Strength path (`trainCard === 'run'`, program `run_strength`, frame `strength_5k`):

- `posture` comes out. It asks nothing since 32bca15d (one line of copy). The lifting line
  ("Four lifting days a week. Your endurance fits around them.") moves to the top of the
  endurance screen.
- `endurance` stays and becomes four run rows, one per run day, in the frame's day order. Hours,
  days, running experience and the hard-session pickers come OFF it.
  - Easy run (VT1 level 1, p235): LOCKED at 30 minutes. No control; the row states it.
  - Long run (LSD level 2, p235; p247 cap): length chips `60 min` · `75 min` · `90 min`. Default 75.
    ⚠️ 100 is his stated top; 90 is the highest chip so the cap is never touched by default.
  - The two hard runs (MLSS+ level 2, NT level 3): NO control. The row shows the rotating
    workout's name and its length as a fact ("about 45 min", from the variant's own steps). The
    engine rotates the variants (p112). The pickers remain reachable on the built week afterwards.
- Flow: Train → Run → endurance (lengths) → accessory picks → schedule → numbers → confirm.
  Seven screens. ⚠️ The accessory-picks step STAYS; moving it behind Adjust is a separate ruling.
- Standard Focus is untouched (its own per-session lengths; D-457 guard stays).

### What the length pick does in the engine
`levelOverrides` is NOT the mechanism (a level is a band, not a minute count). The chosen minutes
travel as the slot's prescribed duration for `run_lsd` only (the easy run is a constant 30), the same field the
Standard Focus per-session length already writes; the composer builds the easy run to that time
and the long run to that time inside the LSD level-2 shape (the sets ride inside the chosen
length). Hard slots carry no duration override. Assert: a chosen 90 never produces more than 90.

## 2. What the engine receives when nothing is asked

- `enduranceExperience`: not sent → `experienceLevels(null)` → the page's levels. ✅ already the
  behaviour for an unanswered screen; assert it.
- Run lengths: `run_lsd` duration from the chip; `run_vt1` fixed at 30; nothing for the hard slots.
- `enduranceDaysBySport` / weekly hours: not sent → no `dayShortfall`, four runs. Assert it.
- Advanced tier (one or two extra easy runs) keeps firing from DEMONSTRATED miles only (25 mi/wk,
  ours, labelled). Nothing else adds runs.
- Swim: off, no field sent.

## 3. Copy

Endurance step on this path, top line: `Four lifting days a week. Four runs fit around them.`
Under it: `Pick how long the long run is. The easy run is 30 minutes. The two hard runs rotate.`
No em dashes, no emojis, no imperatives, no author's name.

## 4. Guards

- `wizard-steps.test.ts`: the Run + Strength step list is exactly
  `['goal','train','program','endurance','accessory','schedule','numbers','confirm']`; Standard
  Focus and the race path unchanged.
- Length chip: long 60/75/90 → the long run is that long and never over it; the easy run is 30
  every week; hard runs unchanged by any chip.
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

Any control on the hard runs (the "surgical" option, later, Michael's words). Accessory picks behind
Adjust. Ride + Strength. The red interval box on the Performance tab.

---

## 7. WHAT SHIPPED, AND THE THREE PLACES IT DIFFERS FROM §1-§4 (2026-09-07 evening)

Executed after `cc9419df`. Everything in §1-§3 shipped as written except the three items below, each
measured rather than argued.

### 7a. The long-run chips are **68 · 75 · 90**, not 60 · 75 · 90

`run_lsd` at level 2 is a SINGLE ladder rung of **68 to 100 minutes**. An ask of 60 resolves to 68
(`rungForMinutes`), so a chip reading "60 min" would sit over a plan building 68 — the ask-15-get-20
defect, and the whole reason `slotMinuteOptions` exists. The chips are the ladder's own options
capped at 90, so every one of them builds exactly; the ceiling and the default (75) are unchanged.
Swept through `composeWeek` in `src/lib/run-strength-lengths.test.ts` and through the live chain on a
robot account.

### 7b. The two hard rows state **"length varies week to week"**, with no number

§1 asked them to show the rotating workout's length as a fact. Both were checked against real
materialized rows before a number was printed, and neither can back one:

- **Day 1 genuinely rotates** — three different p237 shapes across weeks 2 to 6, 39 to 45 minutes.
  There is no single true length to state.
- **Day 3 is pinned** (`below_threshold`) and `slotFixedMinutes` returns **59**, but every built plan
  row reads **25 minutes**. ⚠️ **THE LADDER AND THE MATERIALIZED SESSION DISAGREE ON THAT SLOT.**
  Printing 59 over a plan that says 25 is the defect `slotFixedMinutes`'s own note was written about.

⛔ **THE DAY-3 DISAGREEMENT IS A FINDING, NOT A FIX** — it is upstream of this screen (the token
`cruise_8x1mi_threshold` cannot be 25 minutes with a 10-minute warm-up and an 8-minute cool-down) and
it is not this order's to close. It needs its own trace through `materialize-plan`'s expander.

### 7c. The calendar row is the ask **plus its warm-up**, and that is pre-existing

Asked 68 / 75 / 90, the plan rows read **74 / 83 / 98**. The composer honours the ask exactly (the
unit sweep asserts equality on `composeWeek`); `materialize-plan` expands the session's own warm-up
and cool-down on top. ⚠️ **Standard Focus does the same** — measured the same evening: it asks 90 and
its long-run row reads 99 — so this is the per-session-length mechanism as shipped 2026-08-30 and not
something this order introduced. It is also why the chips stop at 90: at 90 the row is 98 and p247's
100 is still untouched.

### 7d. Guards, run

- All Rounder composed block hash **`ad54b512…5443`**, unchanged before and after.
- Live Standard Focus block hash **`3d58e52a…cef51`** from a robot account, unchanged.
- Run + Strength flow is exactly `goal · train · program · endurance · accessory · schedule ·
  numbers · confirm` (`wizard-steps.test.ts`).
- Robot account, live chain: name "Run + Strength", four runs a week and no ride or swim row, week
  one a test week, four lifting days, the plyo day, the easy run 30 minutes every week, the day-1
  hard run rotating through three shapes.

