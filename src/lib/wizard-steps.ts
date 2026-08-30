/**
 * THE WIZARD'S STEP FLOW — which screens a build walks through, and in what order.
 *
 * ⛔⛔ IT LIVES HERE SO IT CAN BE RUN (2026-08-30). It sat inside `NonRaceBuilder.tsx`, which imports
 * React and a dozen components, so no test could ever CALL it — the wizard's route was asserted by
 * reading that file's SOURCE TEXT instead. **That is how the Standard Focus card shipped landing on
 * the Strength Focus tier screen while four green tests said the focus travelled correctly: they
 * pinned the PAYLOAD, and nothing pinned where the tap goes.**
 *
 * ⚠️ NO REACT, NO PATH ALIASES, NO COMPONENT IMPORTS — that is the whole point. The moment this file
 * needs one it stops being runnable and the route stops being tested.
 * ⚠️ THE STATE SHAPE IS NARROW BY DESIGN. The route reads four fields; taking the wizard's whole
 * state type would drag everything that type imports back in here.
 */

/** ⚠️ THE FIELDS THE ROUTE READS. The wizard's own state satisfies this structurally. */
export type StepRouterState = {
  goal: string | null | undefined;
  entry: string | null | undefined;
  /**
   * ⛔ WHICH FOCUS — Standard or Run. It decides the FRAME, and it decides whether the tier screen
   * is in the flow at all. Absent is `run`, which is every build that predates the Standard card.
   */
  focus?: 'standard' | 'run';
  posture: Partial<Record<string, string | null | undefined>>;
};

type Discipline = string;

export type StepKey =
  // ⛔ `goal` IS NOW THE ENTRY SCREEN — Train / Race / Build (SPEC §B, 2026-08-05). The key keeps its
  // name because every `stepNo`/`steps.indexOf` caller and the back-to-close behaviour at `:830` key
  // off it; renaming it is a bigger diff than it is worth for a screen whose job did not change (it
  // is still "the first card, and the one Back closes the builder from").
  | 'goal'
  // ⛔ THE TRAIN DRILL-DOWN — Run / Ride / Strength / Athletic. Only reachable from the Train entry
  // card, and only Strength opens anything today. It sits between `goal` and the picked goal's own
  // flow, so the Strength path is: entry → train → tier → posture → … → confirm.
  | 'train'
  // ⛔ THE STRENGTH TIER — Strong / Heavy / Definition (SPEC §A). Only on the Strength path, and only
  // Strong is live: it is today's block, so the step is a pass-through that sends nothing new.
  | 'tier'
  // ⛔ THE RACE ITSELF — distance, date, level. Its own card, immediately after the goal, because
  // every screen after it is shaped by the answers: the date owns the block length (so the `length`
  // step drops out), and the level picks the volume table the plan is built from.
  | 'race'
  // ⛔ SPLIT OUT OF `race` (2026-08-04). One question per card: the race card asks WHICH RACE, the
  // level card asks WHERE THEY ARE, the intent card asks WHAT IT IS FOR. They were stacked on one
  // scrolling card and the level question — the one that seeds every number in the plan — sat
  // below the fold.
  | 'level' | 'intent'
  | 'posture' | 'commitment' | 'length'
  // The old single `schedule` step, split one card per screen (below).
  | 'days' | 'accessory' | 'run' | 'bike' | 'swim'
  /**
   * ⛔ THE ENDURANCE WEEK — ONE SCREEN, REPLACING `volume` + `hardday` ON THE STRENGTH PATH
   * (Michael's flow, 2026-08-24). Those two asked one question in two places: how much, then how
   * many of each, then which were hard. **The program owns the count** (8-21 §3c) — the frame has
   * four endurance slots, always — so the count pickers asked the athlete to decide something the
   * plan had already decided. What is theirs is which SPORT fills each slot. See
   * `EnduranceWeekCard.tsx`.
   * ⚠️ `volume` and `hardday` still exist for every OTHER goal; only the strength path stops using
   * them.
   */
  | 'endurance'
  // ⛔ STRENGTH, ON ITS OWN CARD (2026-08-06) — one primary decision per screen. It was the fifth
  // question on "Your week" and got missed on a device.
  | 'strength'
  // ⛔ THE WEEK WAS BRIEFLY THREE STEPS AND IS ONE AGAIN (2026-08-06). Those step keys are gone.
  // Michael: *"i thought we were doing one week 3 questions."* Three cards each holding a single
  // seven-chip row is three taps to answer what is visibly one thing, with the phone empty beneath.
  // The card stays and the week is drawn once; the three questions sit under it and you pick one
  // (`weekQuestion`) before tapping days. `weekStage` — the Next-tap version — is gone too. [D-398]
  // ⛔ THE SCHEDULER — one screen, rebuilt 2026-07-28, replacing `run` + `bike` + `hardday` on the
  // strength path. Those three asked the same question in three places and none of them could show
  // the answer: how many endurance sessions fit around the lifting days, and where the one that
  // does not fit lands. Michael: *"this is a rebuild, one simple scheduler."*
  //
  // ⚠️ VOLUME STAYS SEPARATE. Miles and hours are HOW MUCH; this card is WHEN. Deciding the second
  // while looking at the first is what made the old run card scroll past the fold.
  // ⛔ HARD DAYS GET THEIR OWN PAGE (Michael, 2026-08-18) — "so when they get to scheduler it's just
  // picking, and hard days can be explained better in their own section". It renders the SAME
  // disclosure list as `schedule`, filtered to the one row: the control, its rationale, the
  // ownership question and the terrain menu are ~500 lines of JSX that already work, and copying
  // them into a second block would be the doubled disease. One renderer, two steps, filtered.
  | 'hardday'
  | 'schedule' | 'volume'
  // ⛔ THE 'lifting' STEP IS DELETED (§1f-0, 2026-08-16). It asked four days or three, and there is
  // no longer a choice to make: every Strong Focus block is three — Squat · Bench · Deadlift + Press.
  // Do not reintroduce it, and do not keep a four-day branch "for later" — the option is gone from
  // the engine (`StrengthPrimaryArgs` has no `liftingDays`), so a card offering it would be a screen
  // asking a question nothing downstream can answer.
  | 'confirm';

// ⛔ ONE DISCIPLINE, ONE SCREEN. Michael, 2026-07-25: *"everything should have its own card, no
// scroll"* — then, having walked it: *"run can all sit on the same card, as with bike and swim, each
// just has one card where you work it out."*
//
// The schedule step used to stack Strength / Run / Bike / Fixed / Swim in one scrolling column, so a
// triathlete met a form long enough that the controls below the fold read as absent. Each is now its
// own step, and the flow is built from what the athlete KEPT — someone who dropped the bike never
// sees a bike screen. The unit is the DISCIPLINE, not the question: run holds its day and its volume
// together, because deciding one without seeing the other is deciding half of it.
// This is grouping, not new logic: every control here was already gated on posture.
function scheduleSteps(state: StepRouterState, isStrengthFocus: boolean, isRaceGoal = false): StepKey[] {
  const kept = (d: Discipline) => state.posture[d] != null && state.posture[d] !== 'out';
  const strengthDevelop = state.posture?.strength === 'develop';
  const out: StepKey[] = [];
  // ⛔ NOT ON THE STRENGTH PATH. Lifting is three days fixed by the protocol (§1f-0) and the
  // endurance days are typed per discipline, so a total would only contradict both.
  // *"how many days is redundant."*
  if (!isStrengthFocus) out.push('days');
  // ⚠️ ON THE STRENGTH PATH THIS MOVED DOWN, to after the volume — see the block below. Every other
  // goal keeps it here: there is no endurance tier deciding its numbers.
  if (strengthDevelop && !isStrengthFocus) out.push('accessory');
  // ⛔ ONE SCHEDULER ON THE STRENGTH PATH. Every other goal keeps the per-discipline cards, because
  // there the endurance IS the plan and there is no lifting frequency to fit it around.
  /**
   * ⛔⛔ THE ENDURANCE LOAD IS GATHERED BEFORE THE STRENGTH ACCESSORIES, AND THE CALENDAR IS LAST
   * (Michael, 2026-08-17). Strength path: goal → train → tier → posture → **volume (incl. swim) →
   * accessory → schedule** → confirm.
   *
   * ⛔ IT IS A DATA DEPENDENCY, NOT A PREFERENCE. The accessory card's rep totals come from the
   * ENDURANCE TIER — hard days plus total weekly hours (`resolveEnduranceTier`, and
   * `docs/SPEC-viada-ingestion-order.md`). Asked before the volume, that card cannot state the
   * number the athlete is signing up for, and the swim gate's warning on the pull-up progression
   * cannot fire at all because the swim answer arrives two screens later. The ENGINE was put in this
   * order on 2026-08-17; this is the screen catching up.
   *
   * ⚠️ AND IT GROUPS THE HUMAN DECISIONS: how much you do, then what you want to work on, then when.
   * The calendar is the last thing because it is the only step that depends on all of the others.
   *
   * ⚠️ BACK-ANNOTATED 2026-08-26 — THIS ORDER IS NOW A DEFERRAL, NOT A SETTLED RULING. Michael has
   * queued a SWAP (accessory before endurance) and deferred building it, so the order above is what
   * currently ships rather than what was last decided. ⛔ The data dependency stated above does not
   * evaporate if the swap lands: the accessory card's rep totals come from the endurance tier, so a
   * swap has to move the DEPENDENCY too, not just the screens. Read this whole comment before
   * reordering anything — the 2026-08-17 reasoning is still the constraint the swap must satisfy.
   */
  if (isStrengthFocus && (kept('run') || kept('bike'))) {
    // ⛔ ONE SCREEN NOW (2026-08-24). `volume` + `hardday` were two cards asking one question; see
    // the `endurance` StepKey. They are untouched for every other goal.
    out.push('endurance');
    // ⚠️ `hardday` IS GONE FROM THIS PATH. Its two jobs — which sessions are hard, and their flavour
    // — moved into the endurance screen's slot cards, where each sits inside the session it is
    // about. The accessory card's data dependency is unchanged: it still runs after the endurance
    // answer, which is now one step instead of two.
    if (strengthDevelop) out.push('accessory');
    out.push('schedule');
  } else {
    if (kept('run')) out.push('run');
    if (kept('bike')) out.push('bike');
  }
  // Swim sits last — booked, not coached. It is the slot we merely hold, so it follows the work.
  // ⛔ UNGATED FOR A RACE GOAL (2026-08-04). The condition was `strengthDevelop && swim === 'maintain'`,
  // so on a marathon block the athlete could opt the swim IN on the posture card and then never be
  // asked how many — `swim_days` went out unset and the engine guessed. The swim hold card is the
  // same mechanic whichever goal is leading; what gates it is whether the swim is KEPT, not which
  // discipline develops. Strength-path behaviour is unchanged (`maintain` is the only non-out state
  // that path seeds for swim).
  // ⛔ THE STANDALONE SWIM CARD IS OFF THE STRENGTH PATH (2026-08-17). Michael: the swim belongs on
  // the same card as the miles and the hours — it is a VOLUME question in its own unit, not a screen
  // of its own. It renders as the third row of `volume`.
  // ⚠️ THE RACE PATH KEEPS ITS CARD: that flow has no `volume` step to fold it into.
  const swimKept = state.posture?.swim != null && state.posture?.swim !== 'out';
  if (isRaceGoal && swimKept) out.push('swim');
  return out;
}

/**
 * ⛔ EXPORTED FOR ITS TEST (2026-08-30). It is a pure function of the state and it decides WHICH
 * SCREEN A TAP LANDS ON — the Standard Focus card shipped landing on the Strength Focus tier screen,
 * and nothing asserted the route because every test on this path asserted the PAYLOAD instead.
 * See `focus-frame-travel.test.ts`.
 */
export function getSteps(state: StepRouterState): StepKey[] {
  // ⛔ STRENGTH FOCUS SKIPS "What can you sustain?". That step converts a Light/Moderate/Committed
  // tier into `weekly_hours_available` — and on this path nothing reads it. The lifting is three days,
  // fixed by the protocol; the endurance volume is TYPED two screens later (run miles, run days,
  // swims). So the tier decides nothing and its only effect was a stale "≈ 6 h/wk" on the confirm
  // screen. Michael, 2026-07-25: *"not necessary, user enters these."* Every other goal keeps it —
  // there the tier really does set the volume.
  // ⚠️ On step 1 no goal has been chosen yet, so this returned the FULL six-step flow and the
  // progress bar read "1 of 6" — then jumped to "2 of 4" the moment the athlete tapped. With one
  // goal offered, the flow it produces is knowable before it is picked. Count that.
  // ⚠️ THE `GOAL_ORDER.length === 1` FALLBACK IS GONE (2026-08-05). It existed to make the progress
  // bar countable on step 1 before a goal was picked, and it was already wrong with two cards. The
  // entry and train screens now both `hideProgress` — there is no honest count until a discipline is
  // chosen, so there is nothing left to guess a goal for. See `seededPosture` (`:816`), which still
  // passes a REAL goal id and must keep doing so.
  const effective = state.goal;
  const isStrengthFocus = effective === 'get_stronger';
  const isRaceGoal = effective === 'marathon';
  // ⛔ AND NO LENGTH SLIDER on this path. Twelve weeks is not a preference — the previous program's ratios are
  // 2:1, 3:2 and 2:2 over four-week cycles, so 12 is the only length that runs leader-leader-anchor
  // as designed. The slider offered 8-52 while the composer rounds DOWN to whole cycles, so 10
  // silently became 8 and 14 became 12: the athlete picked a number the engine never built. 8 ships
  // later as the short, off-ratio option, labelled as such.
  // ⛔ AND NO LENGTH SLIDER ON A RACE EITHER, FOR A DIFFERENT REASON (2026-08-04). Strength Focus
  // skips it because 12 is the protocol; a race skips it because THE DATE ALREADY DECIDED. The
  // server computes `durationWeeks = max(floor, min(weeksOut, 20))` from the race date
  // (`create-goal…:3293`) and never reads `target_weeks` on the event path. Showing a slider that
  // moves a number the engine discards is the exact failure this file has produced twice before —
  // "Days Per Week: 5" and "Weekly Hours Available: 6" printed as constraints the athlete never set.
  // The confirm screen states the derived length instead.
  // ⛔ THE RACE FLOW IS DECLARED WHOLE, NOT ASSEMBLED (2026-08-04). Michael's five screens:
  // race+date, days (with the long-run day), level, intent, preview. It does NOT go through
  // `scheduleSteps` — that builds a per-discipline flow from posture, which is the strength path's
  // shape and produced three cards a race build does not want.
  //
  // ⛔ WHAT CAME OUT, AND WHY:
  //   • `commitment` (the hours tier) — CUT. Screen 3 now carries volume as miles and a long run,
  //     and `days` carries frequency. Asking hours after that is a THIRD estimate of the same
  //     quantity, and it is the one athletes are worst at. `weekly_hours_available` is derived
  //     from the miles instead (see `assemblePayload`).
  //   • `posture` (the hold cards) — MOVED, not cut. Bike/swim maintenance is a decision about
  //     disciplines outside the plan's primary, and it belongs after the athlete has seen the
  //     plan. It now lives on the confirm card, under the preview.
  //   • `length` — already skipped on a race; the date owns it.
  // ⛔ RACE SKIPS THE TRAIN PICKER. It is reached from the entry card directly — racing is an intent
  // that spans disciplines, not one of the four ongoing focuses (SPEC §B).
  // ⛔ STRENGTH IS ITS OWN CARD (2026-08-06). It sat at the bottom of "Your week" — three stacked
  // options with two-line descriptions, below the day count, the long-run day, the club night and
  // two conditional notices — and Michael's device pass found it missed entirely. §2.1 recorded the
  // accretion that put it there and kept the OUTCOME on his review; this moves the question, not the
  // decision. The week card gets the training-day picker in the same pass, so it is not re-loaded.
  // Capacity (level + weekly miles + days-a-week) comes BEFORE the week anchors and strength — Runna
  // and the hybrid apps ask availability up front, since everything downstream is placed inside it
  // (2026-08-07). Order: goal → race → level(capacity) → days(anchors) → strength → intent → confirm.
  if (isRaceGoal) return ['goal', 'race', 'level', 'intent', 'days', 'strength', 'confirm'];

  // The drill-down only exists on the Train branch, and it stays in the array after a discipline is
  // picked so Back walks entry ← train ← flow instead of jumping to the door.
  const door: StepKey[] = state.entry === 'train' ? ['goal', 'train'] : ['goal'];
  // The tier sits between the discipline and the block's own questions — it is WHICH strength block,
  // so it has to be answered before anything shaped by it. Only on the Train→Strength path; a goal
  // reached another way (standalone route, a stored goal) keeps the old flow.
  /**
   * ⛔⛔ THE TIER SCREEN IS THE 5K PATH'S QUESTION, NOT EVERY STRENGTH PATH'S (fixed 2026-08-30).
   *
   * ⛔ WHAT SHIPPED AND WHAT MICHAEL SAW. Standard Focus seeds the same goal as Strength Focus, so
   * `isStrengthFocus` was true for it, so its tap landed on the Strong / Heavy card — *"it just
   * takes you to strong focus or the unbuilt build."* The card was right, the payload was right, and
   * the athlete could not reach the frame at all.
   *
   * ⛔ AND THE TIER GENUINELY DOES NOT APPLY. Strong maps to Strength + 5K (p246) and Heavy to
   * Hypertrophy + 5K (p244) — **both are 5K programmes.** There is no Strong/Heavy split of the All
   * Rounder anywhere in the book, so the screen would be asking a question with no answer for it.
   * Standard Focus goes straight to the posture card, then the endurance week with its five rows.
   *
   * ⚠️ NOTHING IS MISSING FOR IT. Every step after the tier is shared, and the endurance screen is
   * already frame-driven — the flow is complete without a Standard-only screen.
   */
  const asksTier = isStrengthFocus && state.entry === 'train' && (state.focus ?? 'run') !== 'standard';
  const head: StepKey[] = isStrengthFocus
    ? [...door, ...(asksTier ? ['tier' as StepKey] : []), 'posture']
    : [...door, 'posture', 'commitment', 'length'];
  return [...head, ...scheduleSteps(state, isStrengthFocus, isRaceGoal), 'confirm'];
}
