# WORKORDER — the race builds: half marathon and marathon from the book (2026-09-30)

**Owner:** the PM chat reviews each stage before it is pushed. **One stage per terminal session.** Read the
`🧭 NEXT SESSION — START HERE` banner in `ENGINE-STATE.md` first.

**Michael's go, 2026-09-30.** The Race card offers **Half marathon** and **Marathon**. Both are built from the book's
half-marathon weeks — Long Run + Strength (`strength_half`, p250–251) and Long Run + Muscle (`hyp_half`, p252–253) —
counting down to a race date. The two programme cards stay training programmes with no date (his 2026-09-24 ruling,
`WORKORDER-run-programs-2026-09-23.md` Stage 2). The old marathon builder (`generate-run-plan`) comes off the Race card;
plans already built on it keep working and its code stays.

## What today's marathon build is (traced 2026-09-30, do not re-trace)

- Race card → `NonRaceBuilder.tsx` `RACE_DISTANCES = ['Marathon']` (:498) → `create-goal-and-materialize-plan`
  (:4260 approach, :4442 invoke) → `generate-run-plan` `SustainableGenerator` / `PerformanceBuildGenerator`.
- **No Viada page anywhere on that path** (grepped `generate-run-plan/**`, `src/lib/run-volume-tables.ts`,
  `race-readout.ts`, `non-race-routing.ts` for `Viada|p[0-9]{3}`: zero). Volume, long runs and taper are Higdon /
  Pfitzinger / Daniels tables; paces VDOT; strength the old protocol overlay. Session text (VDOT) and steps
  (threshold / goal time) can disagree on one card (`materialize-plan/index.ts:816-865`).
- The book frames today: fixed 12-week rolling blocks, `target_date: null`, `taperWeeks: []`
  (`generate-strength-plan/index.ts:1078-1080`). **No week-over-week run growth** — `rungForSlot` / `levelForFamily`
  never read the week (`compose.ts:3584-3638`, `:3307-3309`); the long run is one chip, same every week.
  `race_pace_finish` (`source-rules.ts:1304-1328`) is never built on these frames; `race_repeats_long` was deleted
  2026-09-11 for blending the half and marathon lines (`source-rules.ts:1051`).
- **A half-marathon race build already exists, tabled:** branch `worktree-agent-a0a867e464367783c`, commit `9b0c68716`
  — `_shared/standing-plan/race-week.ts` (taper weeks, race week, race row), `src/lib/race-weeks.ts`, the `race_date`
  wizard step, `generate-strength-plan` wiring, a 283-line test, SOURCE Part E3c (the p251 taper reading). **Start from
  it.** It was tabled because it put the race on the Run Lead card; here the race lives on the Race card instead.

## What the book says (pages read off the photographs 2026-09-30)

| Rule | Page | Words |
|---|---|---|
| Change each bucket by less than 10% a week, ideally 5% | p148 | *"aiming to change each of these by less than 10 percent per week, though ideally 5 percent is as high as I will usually go"* (p150 repeats "10 percent per bucket per week") |
| Too-fast increases are the main failure | p149 | *"Too rapid increases in any category is the greatest source of program failure"* |
| A marathon build raises mileage while lifting eases down | p151 | *"a progressive marathon program that steadily increases mileage … peaking at high mileage"*; doubling mileage over 8–12 weeks; 30→60 mi/wk with hypertrophy reps 50 upper / 60 lower → ~15–16 / 20; maintenance ≈ one-third of productive volume, at least once a week; keep skill / DE speed work; *"you could drop … to the one-third 'maintenance' level, it's unnecessary"* |
| Easy runs rarely over 2 hours; longer for fuelling and experience | p108 | *"I rarely prescribe more than two hours of VT1 work in a single session"*; *"many valid reasons to train longer … practicing fueling strategies"* |
| Marathon long run up to 3 hours | p251, p253 | *"Marathon runners can extend the weekend LSD up to 3 hours as blended 'strategy sessions,' with fast finishes and food/drink tolerance"* |
| The long run grows; quality matters as much | p251 | *"progressive increases in the duration of the longer weekend run is an important variable, increases in run quality are just as vital … race pace portions of the LSD"* |
| Race-pace finish by level | p235 | L1 30 min + 5 min race pace · L2 60 min, 5 min @95% mid, 10 min race pace · L3 90–120 min, 10 min @95% mid, 15 min race pace |
| Threshold band by race | p251, p253 | half 92–97% · marathon 89–94% |
| Race-specific NT | p233–234 | half: L1 2×12′, L2 3×10′, L3 3×12′ @95% · marathon: L1 2×15′, L2 2×20′, L3 3×15′ @92% · 3–5 min walk/jog between |
| Advanced marathoners | p251 / p253 | Mon + Wed up to 80–90 min with longer VT1 warm-up/cooldown (p251); Monday VT1 L2 → L3, extended VT1 cooldown Wednesday (p253) |
| Running tapers pay off over more than a week | p120 | *"running tapers may allow for delayed performance gain … the timeline here is much more than a week!"* |
| **Taper length** | — | **not printed** for a half or marathon (p251's "4 to 5 weeks out" is a powerlifting meet; p247 / p269 say 2 weeks for a 5K / short cycle) |

## The calls Michael made (2026-09-30)

- **Taper:** marathon **3 weeks**, half **2 weeks**, of the frame's TAPER/DELOAD column. FIELD — Pfitzinger and Higdon
  (3-week marathon taper); Smyth & Lawlor 2021 (~158k Strava marathoners: a disciplined 3-week taper ≈ 2.6% faster);
  Bosquet et al. 2007 meta-analysis (≈2 weeks optimal, volume −41–60%, intensity kept). Ledger row, FIELD.
- **3-hour marathon run** ends with **15 minutes at race pace** (p235 L3's finish, the closest printed number).
- **No six-week switch:** the threshold work is set by race distance for the whole plan (p251 / p253). p247's "within
  six weeks … race pace, recovery +25%" is the 5K programme's and is not carried.
- **Late starters get a plan** with a note, never a greyed-out date (field: Nike Run Club and TrainingPeaks let you join
  partway; only days off are absolute — memory `project_efforts_no_hard_gates`).

## Stages

### Stage 0 — The book, written down (docs only)
**✅ DONE 2026-09-30 — `66d0fb47a`.** SOURCE Part K + E3c; Part B's "not yet found" list back-annotated.

- Add a SOURCE Part for p108, p148–151, p120's taper line, p235's race-pace finishes, and the p251/p253 re-read.
- ⛔ Back-annotate SOURCE Part B §"NOT YET FOUND ON A PAGE": the 10% rule is **found, p148**; the 2-hour ceiling is
  **p108**; the one-third maintenance is **p151**.
- Port the tabled branch's Part E3c.

### Stage 1 — The Race card builds a dated book block (half and marathon)
**BUILT 2026-09-30 (branch `race-builds`, from `9b0c68716`).** Race cards `race_half` / `race_marathon` → "Which week?"
(p250 / p252 cards) → "Race day" → the programme screens. `generate-strength-plan` takes `race_date` + `race_distance` on
`strength_half` and `hyp_half`; taper 2 / 3 weeks (`race-week.ts`); a rebuild keeps the race's taper weeks. The Goals
race door opens the Run list. **Words approved by Michael 2026-09-30** (cards: "Race a {half marathon|marathon} and keep
lifting four days a week. Two threshold sessions a week build your speed. The running builds toward race day. …"; "Which
week?"; "Race day"; "{weeks} weeks of training."). ⛔ **The race cards stay OFF the Run list until Stages 2–4 ship**
(the cards promise running that builds and lifting that decreases) — `RUN_GROUPS` keeps the old marathon card until then.
The goal row stays non-event (race in `training_prefs` + `config.standing_plan.race`); Stage 2 decides the goal row.
- Cherry-pick the useful parts of `9b0c68716` onto main; move the race from the Run Lead card to the Race card:
  `RUN_GROUPS` race group → `['half_marathon', 'marathon']`, both opening a frame choice (Long Run + Strength / Long Run +
  Muscle — words for Michael) and the race-date screen.
- `generate-strength-plan` takes `race: { date, distance }`: weeks from the start week to race week; `taperWeeks` = the
  last 3 (marathon) / 2 (half) weeks; race week from `race-week.ts` (race day carries the race; nothing after it).
- The goal row stores the race (`goal_type: 'event'`, `target_date`, `distance`) so race-pace and the race-readiness
  readout can read it. Check every reader of `goal_type: 'event'` first — today they all assume `generate-run-plan`.
- The marathon card no longer reaches `generate-run-plan`. Existing plans built there keep working (no migration).
- ✅ **RULED (Michael, 2026-09-30: "whatever the book says"): the taper weeks are the page's column as printed** — on p250
  no long run in the taper weeks; on p252 its LSD L1. Below is the question as it was put.
- `STRENGTH_HALF_TAPER` (p250's taper column) **has no long run at all**
  (`frames.ts:832-887`; `HYP_HALF_TAPER` keeps an L1 LSD). A 3-week marathon taper on p250 means three weeks with no long
  run. Bring him the two readings: the page as printed, or the taper column's runs with the standard week's long run
  kept at a reduced length (that reduction would be field-sourced, not the book's).

### Stage 2 — The long run grows to race length
**PUSHED + DEPLOYED 2026-10-01 (`d6df884b3`, `c24289af3`); CHECKED LIVE on a throwaway account (deleted):** half 12 wk p250 long run 105→145, taper 11–12; marathon 16 wk p250 105→180 by wk 9, p252 by wk 8, taper 14–16; race day ends the block; threshold 7:30 → race pace 7:54 (half) / 8:09 (marathon) on the 15-min finish, 95% insert 7:54. A 14+ week marathon first ran out of edge compute (the held hard cycle re-solved every grown week) — fixed in `c24289af3`.
 `raceStandardWeeks` (compose.ts) + `raceGrowthSchedule` (race-week.ts): the
sub-VT1 bucket (easy runs + long run) grows 5% a week (p148), easy runs first to their level's printed top (p235 VT1
L1 30, L2 60), then the long run; taper weeks untouched. The long run is p235's `race_pace_finish` at level 3 (10 min
@95% mid, 15 min race pace). Half: 105 → 145 (p107's two hours of easy running). Marathon: 105 → 180 — p251/p253's
"up to 3 hours" lifts p107's cap for that one session (`SessionRequest.easyBoutCapSeconds`, ceiling 180).
⛔ **Race pace (Michael, 2026-09-30, "Yeah"): the athlete's current threshold at the book's race percentage** —
half 95%, marathon 92% (pp233–234), in materialize-plan for any plan whose config carries `standing_plan.race`;
`qualityRunSteps` prices the race-pace step from it. No goal-time field (the field starts from current ability:
Runna asks for a recent race time and does not train to a goal time). A newcomer gets a threshold from week one's
time trial (p210), so the pace is real from the first run it appears in. Other plans keep the goal-time rule.
- New: a run long slot that grows week to week. The athlete's long-run chip becomes **"your long run now"**; each standard
  week grows it by **5%** (p148's "ideally 5 percent"; never over 10%) up to the cap, and the peak lands in the last
  standard week. Cap: half = the frame's existing ceiling (`planCeilingFor` run_lsd long = 150); marathon = **180 min**
  (p251). Reuse `length-step.ts` / `EnduranceSlot.growth` (today cycling-only) before writing anything new.
- The long run's archetype becomes `race_pace_finish` at the athlete's level (p235); the marathon's 3-hour runs end
  with 15 min at race pace.
- **Race pace source:** the goal's target time ÷ distance when given (`materialize-plan` `goalRacePaceSecPerMi`,
  :756-770, :4242-4255 — today read only by the marathon branch at :838-848; wire it into `qualityRunSteps`). With no
  target time: threshold ÷ 0.95 (half) / 0.92 (marathon) — the race-specific NT percentages on p233–234. Label the
  fallback in the ledger.
- Advanced marathoners (p251 / p253 options) only if the experience answer is asked on this path; today it is not.

### Stage 3 — Threshold work by race
**BUILT 2026-10-01 (branch `race-stage2`).** `race_repeats_half` / `race_repeats_marathon` (pp233–234, `raceOnly` —
`archetypesFor` leaves them out of every other plan); `raceNtRotation` (race-week.ts) rotates a race block's NT slot
through the sessions whose work sits in p251/p253's band plus the race's line. Half: 3×10′@95%, Surge into Steady 92%,
Threshold with a Surge 92–95%. Marathon: 2×20′@92%, those two, Sub-Threshold Repeats 90%. Non-race plans unchanged.
- NT band per race: half 92–97%, marathon 89–94% (p251 / p253) — today only a frame comment (`frames.ts:784`, `:1132`).
- Rebuild the race-specific NT lines **unblended, one per distance** (p233–234), offered only on a race block of that
  distance. The 5K `race_repeats` stays the 5K's.

### Stage 4 — Lifting eases as the miles climb (p151)
**BUILT 2026-10-01 (branch `race-stage2`).** `hypertrophySetFactor` + `composeBlock`: the week's HYP sets come down one at
a time as the running rises (the highest ratio so far, so never back up); ME/DE/SKILL/plyo untouched. Marathon p250
21 → 17 HYP sets a week, p252 57 → 45; half p250 21 → 18. Taper weeks are the page's column as printed.
- As the week's running minutes rise above week one's, HYP sets step down toward one-third of week one's, never below
  one set a week per movement; ME / DE / SKILL rows and the plyo stay (p151: keep skill and speed work). p151 prints the
  endpoints (≈ 30→60 mi, 50/60 → 15–16/20 reps), not the curve: **the straight line between them is OURS** — ledger row.
- The p251 rate (1% every 4 weeks) is unchanged.

### Stage 5 — Length, late and early starts (words through Michael)
- Late start: build anyway; one note when the weeks are under the field minimum — marathon **12**, half **8** (Nike Run
  Club recommends 12 for a marathon; Runna's fast-track plans 12 / 8). The note names no app.
- ✅ Early start (Michael, 2026-09-30: "good"): race more than **26 weeks** away — FIELD, Runna caps plans at 26 weeks
  and puts a base plan first. The athlete starts on the matching training programme now (Long Run + Strength or Long
  Run + Muscle, the same book week with no date) and the race block takes over 26 weeks out (p151: the programme
  evolves toward the race). Offered on the race-date screen, e.g. "Your race is 34 weeks away. You start on Long Run +
  Strength now, and the race plan begins on [date]." — words for Michael's yes.
- ✅ Running weekly volume (Michael, 2026-09-30: "whatever the book says"): p151 raises the **mileage**, not only the long
  run, so the easy runs grow too, every bucket under p148's 10% a week (5% the usual step). Stage 2 covers both.

### Stage 5b — Remove the old marathon builder (Michael, 2026-09-30: "I don't want it haunting us down the road")
A relic left reachable gets worked on, gets in the way, or gets its work done twice. So it goes, whole:
- **At once (with Stage 1's push), DONE on branch `race-builds`:** off every door — the Run list has no Race group and the
  Goals race card and "Running a race?" button are hidden (`RACE_PLANS_OFFERED = false`, `src/lib/race-weeks.ts`) until
  the race cards go live. ⚠️ A one-marathon season in the season wizard still reaches it through `create-goal`; that door
  closes with the deletion below.
- **When the race builds are live:** delete `generate-run-plan` and everything only it uses (VDOT tables `effort-score.ts`,
  `src/lib/run-volume-tables.ts`, the marathon branch of `create-goal-and-materialize-plan`, `race-readout.ts` /
  `non-race-routing.ts` parts that serve it, the old `level`/`intent`/`days`/`strength` race screens, `PROGRAM_COPY.marathon`).
  Grep every name before deleting; the deploy closure (`INVENTORY.md`) lists who imports what.
- **Two readers outside it borrow its pace math and move first:** the race-time projection (`_shared/race-readiness`,
  `recompute-goal-race-projections.ts`) and the intake readout — both to threshold-based paces.
- Plans already built on it keep their calendar rows; nothing after the deletion can build or rebuild one.
- Done = a grep for `generate-run-plan`, `SustainableGenerator`, `PerformanceBuildGenerator`, `VDOT` finds nothing live.

### Stage 6 — Seen on real builds
- Throwaway accounts, through the real path, each read end to end: marathon 16 weeks on p250 and on p252; marathon 6
  weeks; half 12 weeks; half 26+ weeks out. Check: no session on a day off; the long run's week-by-week minutes; the 3
  (or 2) taper weeks; race week ends on race day; race pace printed on the finish; HYP sets falling as minutes rise.
- Then: deploy every importer (`docs/INVENTORY.md` rows) from a clean worktree, phone build, and the Race card on his
  phone.

## Rules for every stage
- The book first: a page cite beside every number, or `OURS` + a `STATE-SOURCES.md` row, or a FIELD source.
- Every athlete-facing word printed for Michael's yes before it ships (`book-lines.pinned.json` / provenance check).
- One stage per terminal session; trace before build (`CAPABILITY-MAP.md`, then grep).

## Out of scope
- Deleting `generate-run-plan` or the season wizard's combined path (`generate-combined-plan` — multi-race seasons).
- The Runner (p258) as a pre-race pivot; ultra (p254).
