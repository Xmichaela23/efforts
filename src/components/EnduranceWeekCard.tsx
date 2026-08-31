/**
 * THE ENDURANCE-WEEK SCREEN — an instrument, not a form.
 *
 * ⛔ WHY ONE SCREEN (work order stage 5, Michael's flow 2026-08-24). The two it replaces asked one
 * question in two places: "How much" took the volume and then asked *how many runs* and *how many
 * rides*, and "High intensity days" asked which of them were hard. But **the program owns the
 * count** (8-21 §3c) — the frame has four endurance slots and always four — so the count pickers
 * were asking the athlete to decide something the plan had already decided. What is genuinely theirs
 * is which SPORT fills each slot, and that is one decision surface.
 *
 * ── ⛔ THE SCREEN OPENS FINISHED (redesign, 2026-08-24) ─────────────────────────────────────────
 *
 * Michael's verdict on the first build: *"it just needs to be much better UI."* It read as a long
 * form because it WAS one — every slot's every option on screen at once, four stacked blocks of
 * radio buttons under a seven-line preamble.
 *
 * ⛔ SO EVERY SLOT ARRIVES ANSWERED AND COLLAPSED — *"Hard session · Ride · Sustained threshold"* —
 * and the default path is **read, glance at the rate, Continue**. Tapping a row opens it; opening
 * one closes the rest, so the screen never grows past a phone. The choices are all still there; what
 * changed is that the athlete now has to want them.
 *
 * ⛔ AND THE RATE LINE IS PINNED, because it is the only thing on the screen that TEACHES. It moves
 * when a slot moves, and a number that changes off-screen has taught nobody anything.
 *
 * ⛔ EVERY NUMBER HERE COMES FROM THE ENGINE. The caps are `sessionDurationBandSeconds` summed over
 * the slots as currently assigned (stage 1's own function, whose header says it must run on the
 * client for exactly this); the rate line is his two published frame rates. **No endurance-
 * improvement percentage appears anywhere** — the work order forbids it and no source gives one.
 */
import React from 'react';
/**
 * ⛔⛔ THIS FILE IMPORTS NO FRAME-BOUND SLOT CONSTANT, AND THAT IS THE FIX (2026-08-30).
 *
 * `SLOT_KEYS`, `SLOT_LABEL`, `SLOT_OPTIONS`, `REQUIRED_SLOT_DISPLAY_ORDER` and `HARD_SLOT_KEYS` are
 * `strength_5k`'s membership. This card read them while its completion gate read the CHOSEN frame,
 * so Standard Focus drew four rows and demanded five answers: **Continue was disabled and could not
 * be satisfied.** Everything the card needs now comes from `frame` — see the derivations at the top
 * of the component. `standing-plan-week-copy.test.ts` asserts this file imports none of them.
 */
import { ChevronDown } from 'lucide-react';
import {
  ENDURANCE_WEEK_INTRO_CONSEQUENCE,
  introStructureFor,
  EXPERIENCE_HEADING,
  // ⚠️ `EXPERIENCE_SUBTITLE` IS NO LONGER READ HERE. The screen asks `experienceSubtitle`, which
  // picks the sentence off what the answer actually moves — the constant is still that function's
  // hard arm and is still pinned verbatim by the copy test.
  experienceMovement,
  experienceSubtitle,
  experienceAsksFor,
  experienceChipTextFor,
  restIsEasyLine,
  experienceGatedLine,
  experiencedIsReachable,
  HARD_1_SLOT_NOTE,
  LONG_SLOT_NOTE,
  VOLUME_HONESTY_LINES,
  slotFrameDay,
  slotSummary,
  upperLowerSplitLine,
  allSlotsChosen,
  slotPrecedesHeavyLowerDay,
  slotOptionsNow,
  displayOrderFor,
  frameWeekDays,
  weekIsDayOrdered,
  QUIET_DAY_LABEL,
  forcedSportFor,
  FIXED_SPORT_LINE,
  RUN_HOURS_LAND_ON_THE_LONG_RUN_LINE,
  perSessionIntroFor,
  WEEKLY_VOLUME_IS_THE_SUM_LINE,
  sessionLengthLabel,
  SESSION_LENGTH_LABEL,
  SESSION_LENGTH_VARIES,
  hardSlotKeysFor,
  frameSlots,
  type SlotKey,
  type SlotSelection,
  type SlotSport,
} from '@/lib/standing-plan-week-copy';
import { experienceChips, weekBounds, slotLengthOptions, slotFixedMinutes } from '@/lib/standing-plan-week-bounds';
import type { EnduranceExperience, ExperienceTier, FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';
/**
 * ⛔ HOW MANY DAYS ONE SPORT CAN RUN OVER. Seven is the week; the engine caps what it can actually
 * place at the two days the frame leaves clear plus the rest day, and says so when the ask exceeds
 * what those hold.
 */
const ENDURANCE_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
/**
 * ⛔ THE OPTION LIST IS THE ENGINE'S, NOT THIS SCREEN'S. One list, so the hours offered here and the
 * hours the composer can build are the same list by construction.
 */
import { WEEKLY_HOUR_OPTIONS } from '../../supabase/functions/_shared/standing-plan/volume-bounds.ts';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';

export type EnduranceWeekCardProps = {
  slots: SlotSelection;
  /**
   * ⛔⛔ A SLOT IS ANSWERED, NEVER CLEARED (2026-08-26 evening). The `null` arm is gone with the
   * dismiss control: all four slots are the frame's, Continue is gated on all four, and there is no
   * gesture on this screen that empties a row. ⚠️ The type is what makes that unreachable rather
   * than merely unused.
   */
  onSlotChange: (key: SlotKey, sport: SlotSport) => void;
  /**
   * ⛔ WHICH FRAME THIS SCREEN IS DESCRIBING. Absent keeps `strength_5k`, which is every caller that
   * predates a second frame — the rows, their days and their options all come off it.
   */
  frame?: FrameId;
  /** The athlete's baselines row — the caps resolve every session against their own anchors. */
  baselines?: unknown;
  easyPaceSecPerMi?: number | null;
  /**
   * ⛔⛔ THE ATHLETE'S OWN EXPERIENCE ANSWER, PER SPORT — the sole input to how long the hard sessions
   * and the long session are (Michael, 2026-08-27). The hours this screen quotes come from the levels
   * that answer picks, so the screen and the block read one input.
   * ⚠️ IT REPLACED A MEASUREMENT. This prop was `demonstratedWeeklyMinutes` — the last 28 days of
   * logged training — and history was ruled out of the level entirely: *"im coming off a marathon a
   * few months ago I was training less, this is the wrong thing."*
   */
  experience: EnduranceExperience;
  onExperienceChange: (sport: SlotSport, tier: ExperienceTier) => void;
  /** ⛔ THE VARIANT PICKED IN EACH HARD ROW, when the athlete has picked one — the chip's duration
   *  is measured on the shape the composer will actually build. Absent leaves the frame's own. */
  hardArchetypes?: Partial<Record<SlotKey, string | undefined>>;
  /** Weekly running, in the athlete's own display unit. */
  runVolume: string;
  onRunVolume: (v: string) => void;
  /** ⛔ HOW MANY DAYS A WEEK THIS SPORT HAPPENS — the count the hours are divided across. */
  runDays: string;
  onRunDays: (v: string) => void;
  rideDays: string;
  onRideDays: (v: string) => void;
  rideHours: string;
  /** ⛔ THE ENGINE'S OWN SENTENCE per sport — `fixedHoursLine`. Null when the sport fixes nothing. */
  runFixedLine?: string | null;
  rideFixedLine?: string | null;
  onRideHours: (v: string) => void;
  unit: 'mi' | 'km';
  /** Rendered inside the open hard-slot row — VO2 vs speed, club session. */
  /** ⚠️ WIDENED FOR THE LONG SLOT (slice 2b) — the club toggle is not hard-only. */
  // ⚠️ ANY SLOT KEY — the frame owns how many quality rows there are (`HARD_SLOT_KEYS`), so a
  // three-value union here would silently drop the third row's flavour.
  /**
   * ⛔ THE SECOND ARGUMENT CLOSES THE ROW (Michael, off the screen 2026-08-31: picking a workout
   * should collapse it). The open row is this card's own state, so the body cannot close itself —
   * it is handed the gesture rather than the state. ⚠️ Optional to call: the club toggle and the
   * sport chips deliberately do NOT close, because both change the very list underneath them.
   */
  renderHardFlavor?: (key: SlotKey, ctl: { close: () => void }) => React.ReactNode;
  /** What the slot currently is, for the collapsed row. Hard slots only; others need no session. */
  /** ⚠️ ANY SLOT KEY — see `renderHardFlavor`. */
  hardSessionTitle?: (key: SlotKey) => string | null;
  /**
   * ⛔ THE ATHLETE-TYPE ANSWER PRE-SHAPES THIS SCREEN (Michael, 2026-08-24): "Run only" never
   * renders Ride chips, "Ride only" never renders Run. With one sport allowed, every slot is
   * auto-assigned to it — the four-choices screen only exists for the mixed athlete.
   */
  allowedSports?: SlotSport[];
  /**
   * ⛔⛔⛔ HOW LONG THE ATHLETE WANTS EACH EASY AND LONG SESSION TO BE, in minutes (Michael,
   * 2026-08-30). It replaces the weekly-hours ask on the frames that draw the week by day: the book
   * scales these sessions by time — conversation pace, duration is the dose — so the length IS the
   * question, and a weekly total was the app asking it sideways and then solving backwards.
   * ⚠️ THE THREE QUALITY ROWS CARRY NO ENTRY. Their dose is the page's; the row states it and asks
   * nothing. `slotLengthOptions` returns null for them, which is the frame's own `role` answering.
   */
  slotMinutes?: Partial<Record<SlotKey, number>>;
  onSlotMinutes?: (key: SlotKey, minutes: number) => void;
};

/**
 * ⛔ THE APP'S OWN SPORT COLOURS, NOT NEW ONES. `SPORT_COLORS` (`context-utils.ts:27`) is the one
 * table: run `#FFD700`, bike/ride `#50C878` — the same hues the "Which endurance are you keeping"
 * screen paints two steps earlier in this wizard. ⚠️ `ride` goes through `bike` so this reads like
 * every other call site.
 */
const SPORT_DISCIPLINE: Record<SlotSport, string> = { run: 'run', ride: 'bike' };

export default function EnduranceWeekCard(props: EnduranceWeekCardProps) {
  /**
   * ⛔ ACCORDION, ONE OPEN AT A TIME. Two open rows is a form again — and on a phone the second one
   * pushes the first's controls off the top while the athlete is still using them.
   * ⚠️ NOTHING IS OPEN ON ARRIVAL: the screen's whole claim is that it is already answered.
   */
  const [open, setOpen] = React.useState<SlotKey | null>(null);
  // ⚠️ DECLARED BEFORE `slotsNow`, WHICH READS IT INSIDE A `useMemo` FACTORY THAT RUNS DURING
  // THIS RENDER — below it, that is a temporal-dead-zone throw rather than a stale value.
  const frame: FrameId = props.frame ?? 'strength_5k';
  /**
   * ⛔⛔⛔ THE FRAME'S ANSWER WINS ON A ROW THE FRAME ANSWERS — FOUND ON THE RENDERED PAGE,
   * 2026-08-31, and it is the screen-vs-plan disagreement this whole area exists to prevent.
   *
   * `forcedSportFor` states that p274's day 2 and day 4 are rides. `slotSports` is written by an
   * effect in the wizard, so on the render BEFORE that effect — and on any draft saved before this
   * shipped — those rows still carry whatever the old screen let the athlete tap. Rendered from
   * `props.slots` they read *"Hard session 2 · Run · 1h05"* and drew the RUN length ladder, while
   * `assignSports` builds a ride regardless. **The screen would have promised a run and the plan
   * would have delivered a ride, with nothing said** — see `optionsFor`.
   *
   * ⛔ SO IT IS OVERRIDDEN ONCE, HERE, AND EVERY READER BELOW USES THE CORRECTED MAP: the summary
   * line, the length ladder, the bounds, the experience chips. Correcting it at one call site and
   * not the others is how the row's words and the row's picker came to disagree in the first place.
   * ⚠️ IT WRITES NOTHING BACK. State is the wizard's to fix (it does, in its own effect); this is
   * the card refusing to RENDER a sport the frame does not offer.
   * ⚠️ `strength_5k` HAS NO FIXED ROW, so this is the identity map there — measured in
   * `wizard-screen-agreement`, not assumed.
   */
  const slotsNow = React.useMemo(() => {
    const out = { ...props.slots } as SlotSelection;
    for (const s of frameSlots(frame)) {
      const forcedHere = forcedSportFor(s.key, frame);
      if (forcedHere) out[s.key] = forcedHere;
    }
    return out;
  }, [props.slots, frame]);
  /**
   * ⛔⛔ THE ADD/UNDO STATE IS DELETED (2026-08-26 evening). It remembered which row was open when
   * "+ Add a hard session" was tapped, so dismissing the added card put the screen back exactly as
   * it was. With every slot required there is no Add and no dismiss, so there is nothing to undo.
   */

  /**
   * ⛔ THE VOLUME SECTION ANNOUNCES ITSELF (Michael, 2026-08-24 evening: "the miles and hours are
   * getting lost"). It only renders once all four slots are answered — which on a phone is below
   * the fold, so it appeared silently and the athlete never saw the question arrive. When it
   * mounts, scroll it into view once. `chosen` gates the effect so it fires on the transition,
   * not on every re-render while the athlete edits a number.
   */
  /**
   * ⛔⛔ THE FRAME, RESOLVED ONCE AND BEFORE EVERY READER (2026-08-30). See the note at `rowKeys`.
   */
  const rowKeys = displayOrderFor(frame);
  const hardKeys = hardSlotKeysFor(frame);
  /**
   * ⛔⛔ THE WEEK AS SEVEN DAYS, ON THE FRAMES RULED ONTO IT (Michael, 2026-08-30). See
   * `weekIsDayOrdered` for the ruling and `frameWeekDays` for where the days come from.
   *
   * ⛔ WHAT IT FIXES: Standard Focus drew five rows for a seven-day week, in role order, and the two
   * days it left out were left out silently — day 5 lifts with no endurance, day 7 is the rest day.
   * The frame states both; the screen was not asking. ⚠️ AND `rowKeys` STAYS for `strength_5k`, whose
   * screen must render exactly as it does today.
   */
  const dayOrdered = weekIsDayOrdered(frame);
  const weekDays = frameWeekDays(frame);
  // ⛔ HIS FOUR LINES WITH THE FRAME'S OWN COUNTS — see `introStructureFor`. Byte-identical for the
  // 5K frame; the header said "4 endurance slots … Two hard sessions" above five rows otherwise.
  /**
   * ⛔⛔ TWO HEADERS, AND THE FRAME PICKS — see `perSessionIntroFor` (Michael, 2026-08-30). The
   * slot-count opening was right while the next act was a weekly-hours box; a screen that asks a
   * length per session opens by saying so. ⚠️ `strength_5k` keeps `introStructureFor` verbatim.
   */
  const introLines = weekIsDayOrdered(frame) ? perSessionIntroFor(frame) : introStructureFor(frame);

  const volumeRef = React.useRef<HTMLDivElement | null>(null);
  const chosen = allSlotsChosen(slotsNow, frame);
  React.useEffect(() => {
    if (!chosen) return;
    // ⚠️ next frame — the section renders in this commit; scrolling in the same tick measures
    // the layout before it exists.
    const t = window.setTimeout(() => {
      volumeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [chosen]);

  const bounds = weekBounds(slotsNow, {
    baselines: props.baselines as never,
    easyPaceSecPerMi: props.easyPaceSecPerMi,
    experience: props.experience,
    frame,
  });
  /**
   * ⛔⛔ THE TWO CHIPS' NUMBERS, COMPUTED — never typed. `experienceChips` runs the engine's own
   * `ladderOf` and `weekVolumeBounds` against the slot answers four rows above and the athlete's own
   * baselines, so a run on the first hard slot and a run on the second give different numbers.
   * ⚠️ NULL FOR A SPORT THAT FILLS NO SLOT — there is nothing for the answer to size, so no chip.
   */
  const chips = experienceChips(slotsNow, {
    baselines: props.baselines as never,
    // ⛔ THE VARIANT THE ATHLETE PICKED INSIDE THE HARD ROW BEATS THE FRAME'S OWN SHAPE, in the
    // composer and therefore here. Without it the chip quotes the session they just replaced.
    archetypes: props.hardArchetypes,
    frame,
  });

  /**
   * ⛔⛔ WHICH HOUR DIALS EXIST — THE SPORTS THE ATHLETE KEEPS, NOT THE SPORTS THEIR SLOTS CARRY.
   *
   * This read `bounds.runMilesInput || bounds.rideHours`, which is derived from the SLOTS — so on a
   * mixed athlete both dials were absent until a slot had been answered, and the ungating alone
   * would have moved the friction from four taps to one rather than removing it.
   *
   * ⛔ AND THE SLOTS ARE THE WRONG QUESTION ANYWAY. The hours are the week's TOTAL; the slots are
   * the structured sessions inside it. Michael's own line on this screen says so: *"Your miles and
   * hours default to easy pace and recovery if none is picked."* An athlete keeping the bike has
   * riding hours whether or not one of the four slots happens to be a ride.
   *
   * ⚠️ `allowedSports` IS THE POSTURE STEP'S ANSWER, given before this screen — so it is available
   * on arrival, which is the whole point. ⚠️ It is a UNION with the old test, never a replacement:
   * a dial that used to appear still appears, and an unrestricted athlete is unchanged.
   */
  const sportsWithHours: SlotSport[] = (['run', 'ride'] as const).filter((sp) =>
    (props.allowedSports?.includes(sp) ?? false)
    || (sp === 'run' ? !!bounds.runMilesInput : !!bounds.rideHours));
  /**
   * ⛔ THE ONE LINE THAT SURVIVED THE RATE LINE (Michael, 2026-08-26: *"E kill it"* — this was not
   * what he killed). It is a real p247 fact and the only thing on the screen naming WHICH lifts the
   * running costs. It renders in the volume note; see there for why that is its honest home.
   */
  const split = upperLowerSplitLine(slotsNow);

  /**
   * ⛔ ONE ROW RENDERER, TWO BLOCKS (2026-08-25). The hard sessions lead the screen and the frame's
   * own two follow, but a row is a row — extracting this is what keeps the added hard cards and the
   * recovery/long cards from drifting into two slightly different components.
   */
  /**
   * ⛔ WHY THE FRAME IS A NAMED CONST AT THE TOP RATHER THAN `props.frame` READ INLINE. The card
   * shipped reading the frame in three places and MODULE CONSTANTS in five others, so Standard Focus
   * rendered the 5K frame's four rows while the completion gate demanded five: **Continue was
   * disabled and could not be satisfied, because the fifth row it named was not on the screen.**
   * A constant imported at the top of a file is one frame's answer, and nothing at the call site
   * distinguishes it from a derived one.
   */
  /**
   * ⛔⛔ `themeTag` IS THE FRAME'S WORD FOR THE DAY'S LIFTING, PASSED IN RATHER THAN LOOKED UP
   * (2026-08-30). p274 names each day by its movement pattern — push, hinge, jumps, pull, legs — and
   * a lifter reads the week faster with them on it. The card does not know them: `frameWeekDays`
   * reads `FrameDay.themeTag` off the chosen frame, so a frame that states none renders none rather
   * than the other frame's words. **That is trap one from the handoff, and it is the reason this is
   * an argument and not a table in this file.**
   * ⚠️ IT RENAMES NOTHING. The strength SLOT labels are frozen pending Michael; this is new
   * day-level copy that sits beside them and must not be read as a replacement for any of them.
   */
  /**
   * ⛔⛔ THE LENGTH CONTROL, EXTRACTED (2026-08-31) BECAUSE IT NOW HAS TWO HOMES. It sits inside the
   * accordion on a row the athlete opens, and directly on the face of a FIXED row — day 4's easy
   * ride has no other question, so it does not open, and its minutes control would have had nowhere
   * to live. **Michael's ruling is that only the SPORT is fixed there; the length is still theirs.**
   * ⚠️ ONE COPY, so the two placements cannot drift into two slightly different controls — the same
   * reason `slotRow` itself is one renderer for two blocks.
   */
  const lengthPicker = (
    key: SlotKey,
    lengths: { options: number[] } | null,
    picked: number | null,
    sport: SlotSport | null | undefined,
  ) => (lengths ? (
    <div>
      <p className="text-white/80 text-[13px] mb-2">{SESSION_LENGTH_LABEL}</p>
      <div className="flex items-baseline gap-2">
        <select
          data-testid={`slot-${key}-minutes`}
          value={picked != null ? String(picked) : ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) props.onSlotMinutes?.(key, n);
          }}
          className="w-28 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-white text-base tabular-nums focus:outline-none focus:border-[var(--fc)]"
          style={{ ['--fc' as string]: `rgb(${getDisciplineColorRgb(SPORT_DISCIPLINE[sport ?? 'run'])})` }}
        >
          <option value="">—</option>
          {lengths.options.map((m) => (
            <option key={m} value={String(m)}>{sessionLengthLabel(m)}</option>
          ))}
        </select>
      </div>
    </div>
  ) : null);

  const slotRow = (key: SlotKey, themeTag?: string | null) => {
          /**
           * ⛔⛔ THE SPORT THIS ROW IS FIXED AT, OR NULL — see `forcedSportFor` for the ruling and for
           * why it reads the FRAME's options rather than this row's options right now.
           */
          const forced = forcedSportFor(key, frame);
          const sport = slotsNow[key];
          /**
           * ⛔ NO SPORT, NO COLOUR (Michael, 2026-08-24). A row the athlete has not answered carries
           * the neutral edge — the colour is what says "you chose this", so painting it before they
           * chose is the screen answering its own question.
           *
           * ⛔⛔ A FIXED ROW **IS** COLOURED — MICHAEL, OFF THE SCREEN, 2026-08-31: *"day 2 should
           * carry the bike colour on its edge like day 1 carries the run colour — a ride row reads as
           * a ride at a glance."* This reverses the reading I shipped on 2026-08-31 morning, which
           * took "grey it like day 5/7" to cover the edge as well as the type.
           * ⚠️ IT IS NOT A BREAK IN THE 2026-08-24 RULE, it is a correction to what the rule is ABOUT.
           * The colour answers *"what sport is this day"* — a fact — and greying answers *"is there a
           * choice here"*. Days 5 and 7 are grey because they carry **no session at all**; day 2
           * carries a ride, and the athlete reading the week needs to see a ride.
           */
          const color = sport ? getDisciplineColor(SPORT_DISCIPLINE[sport]) : null;
          const isOpen = open === key;
          /**
           * ⛔ THE OPTIONS THIS ROW OFFERS RIGHT NOW — the frame's, minus anything the impact floor
           * holds given the answers on the other rows. `strength_5k` never withholds anything, so
           * its four rows are exactly what they were.
           */
          const floored = slotOptionsNow(key, slotsNow, frame);
          /**
           * ⛔⛔ THE FLOOR NEVER EMPTIES A ROW. `allowedSports` is the posture step's answer, and a
           * ride-only athlete on a frame that prescribes riding could have both filters land on the
           * same row at once — the floor withholding `ride` and the posture withholding `run` — and
           * the athlete would be left with no chip to tap and no way past the screen.
           * ⚠️ THE POSTURE WINS THAT TIE, because it is the athlete's own earlier answer about what
           * they can do at all, and the impact floor is a recommendation we chose to enforce. Held
           * against a stated impossibility, the recommendation gives.
           */
          const allowed = (o: SlotSport) => !props.allowedSports || props.allowedSports.includes(o);
          const optionsNow = floored.options.some((o) => allowed(o.value))
            ? floored
            : { options: frameSlots(frame).find((x) => x.key === key)?.options ?? [], reason: null };
          // ⚠️ THIS FRAME'S HARD ROWS — three where the frame prescribes three quality sessions.
          const isHard = hardKeys.includes(key);
          /**
           * ⛔⛔ A FIXED ROW STILL OPENS **IF IT HAS SOMETHING ELSE TO CHOOSE**, AND THIS IS A
           * DELIBERATE NARROWING OF THE RULING — flagged, not silent (2026-08-31).
           *
           * Michael's words were *"no chevron"* on both fixed rows. Measured, that is right for the
           * day 4 easy ride, whose only question is its length. It is **wrong for the day 2 hard
           * ride**, which carries three named session choices off p237 — Progressive repeats,
           * One-to-one repeats, Surge-sustain-surge — reachable from nowhere else in the flow. An
           * inert grey row there would have deleted three real answers to fix a lone button, so the
           * ruling is applied to the part it was about: **the sport is a fact on both rows; the
           * chevron goes only where the sport was the whole question.**
           *
           * ⚠️ THE TEST IS THE SAME ONE `renderHardFlavor` IS ALREADY CALLED UNDER, so a row that
           * opens always has a body and a row that does not open never had one.
           */
          const expandable = !forced || isHard || key === 'long';
          // ⚠️ ONE NAME FOR "this row is a label, not a question" — the header reads it three times.
          const dim = !expandable;
          /**
           * ⛔ THE LONG SLOT SHOWS ITS SESSION TITLE TOO (slice 2b, 2026-08-25). It was hard-only,
           * so a long slot the athlete had marked as their club ride showed the sport and nothing
           * else — the one fact they had just entered was the one the closed row did not carry.
           */
          const session = (isHard || key === 'long')
            ? props.hardSessionTitle?.(key) ?? null
            : null;
          /**
           * ⛔⛔ THE LENGTHS THIS ROW MAY BE SET TO, OR THE ONE IT IS FIXED AT (Michael, 2026-08-30).
           * Both come off the SAME ladder the composer resolves the answer against, so the number on
           * the row and the number in the plan are one number by construction — an agreement test
           * sweeps every offered length through `composeWeek` and asserts the built session matches.
           * ⚠️ `lengths` IS NULL ON A QUALITY ROW and `fixed` is null on every other, because the
           * frame's own `role` decides which question a row is: p246 and p274 own the quality doses.
           */
          const lengths = dayOrdered
            ? slotLengthOptions(key, slotsNow, { baselines: props.baselines as never, frame })
            : null;
          /**
           * ⛔⛔ THE ROW'S OWN PIN TRAVELS INTO THE LENGTH (2026-08-31). Without the athlete's picked
           * shape this asked an archetype-less ladder and printed one week's answer as the session's
           * dose — see `slotFixedMinutes`. `null` back means the session rotates and the row says so.
           */
          const fixed = dayOrdered
            ? slotFixedMinutes(key, slotsNow, {
              baselines: props.baselines as never, frame,
              archetype: props.hardArchetypes?.[key] ?? null,
            })
            : null;
          const varies = dayOrdered && hardKeys.includes(key) && lengths == null && fixed == null
            && slotsNow[key] != null;
          /**
           * ⛔ THE ROW STATES ITS LENGTH, ANSWERED OR NOT. A quality row shows the dose it is fixed
           * at; an easy or long row shows what the athlete set. ⚠️ A row with a pick and no answer
           * yet shows nothing rather than a default — a number in an untouched control reads as a
           * suggestion, which is this screen's own standing rule for the hours box.
           */
          /**
           * ⚠️⚠️ AND IT MUST BE A LENGTH THIS ROW ACTUALLY OFFERS. Found on the rendered page: with the
           * long session switched from a ride to a run, the row still read *"Long run · 2h30"* over a
           * picker offering 1h08 to 1h40 — `run_lsd` caps at 100 minutes (p247). `prunedSlotMinutes`
           * is what stops the stale value being SENT; this is what stops it being SHOWN, and both are
           * needed because the screen must not print a session the picker underneath it disagrees
           * with even for the render between the tap and the state update.
           */
          const picked = lengths && props.slotMinutes?.[key] != null
            && lengths.options.includes(props.slotMinutes[key]!)
            ? props.slotMinutes[key]!
            : null;
          const lengthNow = fixed != null
            ? sessionLengthLabel(fixed)
            : (picked != null ? sessionLengthLabel(picked) : (varies ? SESSION_LENGTH_VARIES : null));
          // ⛔ THE FRAME OWNS THE DAY — see `slotFrameDay`. `null` on a column with no such slot
          // (the taper carries three, not four), which renders no prefix rather than a wrong one.
          const dayNumber = slotFrameDay(key, 'standard', frame);
          /**
           * ⛔ THE LABEL IS BUILT ONCE AND PLACED TWICE — inside the button on a row that opens, and
           * inside a plain div on a fixed row that does not. Two JSX copies of a nine-part label is
           * how the two would drift, and it also hid a real thing from the compiler: with the copies
           * inline, TypeScript could prove `key === 'long'` was dead in the fixed branch, because a
           * long row is always expandable. One definition, one narrowing, one truth.
           */
          const labelSpan = (
                    <span className="min-w-0">
                      {/* ⛔ THE ROW STATES ITS WHOLE ANSWER — never "Hard 1". See `slotSummary`. */}
                      {/* ⛔ AND WHICH DAY OF THE WEEK'S SEVEN IT IS (Michael, 2026-08-30: *"lets number
                          the days in this section"*). Read off the frame by `slotFrameDay`, never
                          hardcoded, and a NUMBER rather than a weekday — the frame rotates onto the
                          calendar after this screen, so a weekday here is a promise the next screen
                          breaks. ⚠️ Its own element, not folded into `slotSummary`: the slot labels are
                          frozen and this adds a fact to the row rather than renaming anything. */}
                      {/* ⛔⛔ THE DAY LINE AND THE ANSWER LINE ARE SEPARATE (2026-08-30, off the
                          rendered harness). They were one line — `Day 1 · push day (upper) · Hard
                          session 1 · Ride · Sustained threshold` — and on a 430px phone the answer
                          truncated to *"Hard sessi…"*, which is the one thing on the row the athlete
                          came to read. **The day number and the lifting theme are both facts the FRAME
                          states about the day; the line under them is the athlete's own answer.**
                          Splitting them by that seam gives the answer the full width and reads as two
                          kinds of information rather than a five-part string. */}
                      {/* ⚠️⚠️ THE TWO-LINE SEAM IS PER **LIST**, NOT PER ROW, AND BOTH HALVES OF THAT
                          WERE FOUND ON THE RENDERED PAGE.

                          ⛔ IT IS GATED ON `dayOrdered` SO `strength_5k` IS BYTE-IDENTICAL. Applied
                          unconditionally, its rows became `Day 6` over `Long session · Long run` where
                          they had been one line — a visible change to a screen Michael ruled is not to
                          be touched.
                          ⛔ AND IT IS THE WHOLE LIST RATHER THAN "rows that have a tag", because days 6
                          and 7 carry no lifting and therefore no tag: keyed on the tag, Standard Focus
                          would have drawn five two-line rows and then a one-line row six, which reads as
                          a rendering fault rather than as a week. */}
                      {dayOrdered ? (
                        <span className={`block ${dim ? 'text-white/30' : 'text-white/45'} text-xs leading-snug truncate`}>
                          {dayNumber != null ? (
                            <span className="tabular-nums">{`Day ${dayNumber}`}</span>
                          ) : null}
                          {/* ⛔ THE DAY'S LIFTING THEME, IN THE FRAME'S OWN WORDS — see `themeTag`. It
                              sits with the day number because it describes the DAY, not the session
                              the row is asking about, and it is greyed for the same reason. */}
                          {themeTag ? (
                            <span className={dim ? 'text-white/25' : 'text-white/35'}>
                              {`${dayNumber != null ? ' · ' : ''}${themeTag}`}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      <span className={`block ${dim ? 'text-white/40' : 'text-white/90'} text-sm leading-snug truncate`}>
                        {(dayNumber != null && !dayOrdered) ? (
                          <span className="text-white/45 tabular-nums">{`Day ${dayNumber} · `}</span>
                        ) : null}
                        {/**
                        * ⛔⛔ THE CHOOSABLE PART OF THE ROW IS THE COLOURED PART (Michael, 2026-08-31:
                        * *"it shouldn't have its own thing, it should just be clear"*).
                        *
                        * ⛔ THE PROBLEM, EXACTLY. Closed, day 2 read *"Hard session 2 · Ride ·
                        * Anaerobic · length varies week to week"* — four segments in one weight, of
                        * which the sport is fixed, the length is fixed, and **the session name is the
                        * one thing the athlete can change.** Nothing said which.
                        *
                        * ⛔ NO NEW ELEMENT AND NO NEW LANGUAGE: this card already rules that
                        * **colour means "you chose this"** (2026-08-24, the edge). The session name
                        * takes the sport colour and the fixed parts stay muted, so the row carries
                        * exactly one coloured word — the answer — and the chevron opens it.
                        * ⚠️ HARD ROWS ONLY. The long row's session word is its club answer and the
                        * easy row has none; neither is a workout choice, so neither is coloured.
                        */}
                      {slotSummary(key, sport)}
                      {session ? (
                        /**
                         * ⛔⛔ COLOURED ONLY WHEN IT IS THE ATHLETE'S OWN PICK (2026-08-31). The card's
                         * rule is that **colour means "you chose this"**, and an unpicked row says
                         * *"Engine's pick"* — which is precisely NOT their choice. Painting that in
                         * their sport colour would claim an answer they have not given, which is the
                         * same defect as colouring an unanswered row's edge.
                         * ⚠️ SO THE COLOUR APPEARING IS THE FEEDBACK: the row is muted while the
                         * engine holds it and takes the sport colour the moment they choose.
                         * ⚠️ READ OFF `hardArchetypes`, the athlete's own pick per row — never off the
                         * title string, which would make the rule depend on copy.
                         */
                        <span
                          style={isHard && color && props.hardArchetypes?.[key] ? { color } : undefined}
                          className={isHard && props.hardArchetypes?.[key] ? undefined : 'text-white/45'}
                        >{` · ${session}`}</span>
                      ) : null}
                      {lengthNow ? <span className="text-white/45">{` · ${lengthNow}`}</span> : null}
                      </span>
                      {key === 'long' ? (
                        <span className="block text-white/40 text-xs mt-0.5">{LONG_SLOT_NOTE}</span>
                      ) : null}
                      {/* ⛔ THE ROW THAT SITS THE DAY BEFORE A HEAVY LEG DAY, asked of the frame —
                          see `slotPrecedesHeavyLowerDay`. It was `key === 'hard1'`, which is the same
                          answer for this frame and a positional guess for any other. A quality session
                          followed by an upper day costs the lifts nothing and stays silent. */}
                      {slotPrecedesHeavyLowerDay(key, frame) ? (
                        <span className="block text-white/40 text-xs mt-0.5">{HARD_1_SLOT_NOTE}</span>
                      ) : null}
                    </span>
          );

          return (
            <div
              key={key}
              className="rounded-xl border overflow-hidden transition-colors"
              style={{
                /**
                 * ⛔ A COLOURED EDGE ON THE ROW, READABLE ACROSS THE ROOM. The left border carries
                 * the sport; the other three stay neutral so the screen has one accent per row.
                 *
                 * ⛔⛔ **NO `borderColor` SHORTHAND HERE, AND THAT IS A BUG FIX** (Michael's phone
                 * screenshot, 2026-08-24 evening: *"the FIRST hard row is missing its colored sport
                 * edge; the second has it"*).
                 *
                 * This object carried `borderColor` AND `borderLeftColor`. React diffs inline styles
                 * key by key and only patches what CHANGED — so when a row opened and closed, the
                 * shorthand changed, the longhand did not, and React applied `border-color` alone.
                 * **The shorthand rewrites all four edges, including the left one it was not asked
                 * about**, and the longhand was never re-applied. Only a row whose open state had
                 * changed lost its edge, which is exactly the row Michael had tapped.
                 *
                 * ⚠️ Longhands only. A shorthand beside its own longhand in a React style object is
                 * a latent version of this bug wherever it appears.
                 */
                borderTopColor: isOpen && color ? `${color}66` : 'rgba(255,255,255,0.10)',
                borderRightColor: isOpen && color ? `${color}66` : 'rgba(255,255,255,0.10)',
                borderBottomColor: isOpen && color ? `${color}66` : 'rgba(255,255,255,0.10)',
                // ⛔ THE EDGE APPEARS WITH THE PICK. Unanswered rows read neutral, all four alike.
                borderLeftColor: color ?? 'rgba(255,255,255,0.10)',
                borderLeftWidth: 3,
                backgroundColor: isOpen ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.02)',
              }}
            >
              {/* ⛔⛔ THE DISMISS CONTROL IS DELETED (2026-08-26 evening), AND THE HEADER IS STILL A
                  FLEX ROW because the chevron is laid out against the label.

                  ⛔ WHAT WAS HERE AND WHY IT IS NOT COMING BACK: an X beside the chevron on the two
                  hard rows, so tapping "+ Add a hard session" out of curiosity and X-ing straight
                  back returned the screen to its pre-tap state. Both quality sessions are the
                  frame's now (p119, see `REQUIRED_SLOT_KEYS`) — there is no Add, and a control that
                  empties a required row would put the athlete back on the week the source forbids.

                  ⚠️ THE OTHER HALF OF THAT NOTE STILL STANDS, and it is about the sport chips: a
                  second tap on the chosen sport must NOT clear the slot. It conflates "I want the
                  other sport" with "I do not want this session", and it loses the answer to a
                  mis-tap with no undo. The chips do exactly one thing. */}

              {/* ⛔⛔ THE HEADER IS A BUTTON ONLY WHERE THERE IS SOMETHING BEHIND IT (2026-08-31).
                  A fixed row with no other question is a LABEL — no button element, no chevron, no
                  hit target, nothing that invites a tap that would do nothing. It is the same shape
                  as `quietRow` and for the same reason: it states what the frame decided. */}
              <div className="flex items-stretch">
                {expandable ? (
                  <button
                    type="button"
                    data-testid={`slot-row-${key}`}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : key)}
                    className="flex-1 min-w-0 text-left pl-4 pr-2 py-3.5 flex items-center justify-between gap-3"
                  >
                  {labelSpan}
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-white/35 transition-transform"
                    style={isOpen ? { transform: 'rotate(180deg)' } : undefined}
                  />
                  </button>
                ) : (
                  /* ⚠️ `aria-hidden` IS DELIBERATELY NOT SET, same as `quietRow`: the row carries a
                     real fact about the athlete's week and a non-sighted athlete must get it too. */
                  <div
                    data-testid={`slot-row-${key}`}
                    className="flex-1 min-w-0 pl-4 pr-4 py-3.5"
                  >
                  {labelSpan}
                  {/* ⛔ THE LENGTH IS STILL THE ATHLETE'S ON A FIXED ROW, so it renders on the face of
                      it rather than behind a chevron this row does not have. ⚠️ It is `lengths`, not
                      `dim`, that decides — a fixed QUALITY row is dosed by the page and offers
                      nothing here, and this stays silent rather than drawing an empty control. */}
                  {lengths ? (
                    <div className="mt-3">{lengthPicker(key, lengths, picked, sport)}</div>
                  ) : null}
                  </div>
                )}
              </div>

              {/* ⚠️ `expandable` IS RE-TESTED HERE AND NOT ONLY ON THE HEADER. `open` is a single key
                  of component state, so a row that stops being expandable while it is the open one —
                  a sport change on another row narrowing this one — would otherwise render an
                  accordion body under a header with no chevron to close it. */}
              {isOpen && expandable ? (
                <div className="px-4 pb-4 space-y-3">
                  <div className="instrument-divider !my-0" />
                  {/* The sport, as two chips. Selected carries the sport colour; unselected neutral —
                      colouring both would read as two chosen answers. */}
                  {/* ⛔⛔ NO CHIPS AT ALL ON A FIXED ROW — see `forcedSportFor`. Not "one chip, already
                      selected": a lone button that cannot change anything is the exact thing Michael
                      called out on the live screen. The sport is stated in the header and the reason
                      is stated below, where the chips were. */}
                  {forced ? (
                    <p className="text-white/45 text-xs leading-snug">{FIXED_SPORT_LINE[forced]}</p>
                  ) : (
                  <div className="flex items-center gap-2">
                    {optionsNow.options.filter((opt) => allowed(opt.value)).map((opt) => {
                      const on = sport === opt.value;
                      const c = getDisciplineColor(SPORT_DISCIPLINE[opt.value]);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={on}
                          data-testid={`slot-${key}-${opt.value}`}
                          onClick={() => props.onSlotChange(key, opt.value)}
                          className="flex-1 px-3 py-2 rounded-xl text-sm border whitespace-nowrap"
                          style={on
                            ? { borderColor: c, backgroundColor: `${c}29`, color: '#fff' }
                            : {
                                borderColor: 'rgba(255,255,255,0.12)',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                color: 'rgba(255,255,255,0.70)',
                              }}
                        >{opt.label}</button>
                      );
                    })}
                  </div>
                  )}

                  {/* ⛔⛔ WHY THE OTHER CHIP IS NOT THERE — the impact floor (p275, enforcement OURS;
                      see `IMPACT_FLOOR_IS_OURS`). A control that is simply absent reads as a bug or
                      as the screen having forgotten this row; the athlete reads his reason instead,
                      and it is his reason rather than ours. It appears only on the row that is
                      actually the week's last run. */}
                  {optionsNow.reason ? (
                    <p className="text-white/45 text-xs leading-snug">{optionsNow.reason}</p>
                  ) : null}

                  {/* ⛔ THE TAX LINE, AT THE MOMENT IT IS ABOUT (2026-08-24). His two sentences left
                      the preamble — where they were read before there was anything to apply them to —
                      and appear here, once, when a hard slot is set to Run. **Same words, unedited.** */}
                  {/* ⛔ NOT A PILL (Michael, 2026-08-24): boxed, the info read as a selectable
                      option among the real choices. Plain text — information looks like
                      information. */}
                  {/* ⛔ THE TAX LINES LEFT THE SLOT ROW (Michael, 2026-08-24 night: "too much
                      nonsense to get to what you're picking"). They were the message said twice,
                      standing between the chips and the choices. `RUN_TAX_LINES` stays exported —
                      the copy tests pin his sentences.
                      ⚠️ THE LINE THIS NOTE USED TO POINT AT IS ALSO GONE (2026-08-27): the volume
                      note's "More running will slow your strength progress" was cut, because
                      nothing in this block actually advances the bar more slowly for running. What
                      running costs is stated at the TOP of the screen now — the 3-4% reduction on
                      the day before heavy legs. */}
                  {/* ⛔ THE LONG SLOT GETS THE EXPANSION TOO (slice 2b). A club ride can BE the
                      long ride — Michael, after field research: a 2.5-3h weekend club ride is
                      routinely an athlete's long day. So the club toggle is not a property of hard
                      sessions, it is a property of a session whose day the world fixes. */}
                  {/* ⛔⛔ THE LENGTH, PICKED ON THE ROW IT IS ABOUT (Michael, 2026-08-30). Every value
                      offered is a length the engine actually builds — `slotMinuteOptions` walks the
                      ladder's own rungs, so p239's gap between a 100-minute ride and a 130-minute one
                      is simply not in the list. A round-number grid would offer 115, the plan would
                      build 100 or 130, and the screen would have promised a session that does not
                      exist: the ask-15-get-20 defect in a new place.
                      ⚠️ THE EMPTY OPTION STAYS FIRST, the same rule the hours box had: no number in an
                      untouched control, because a preselected value reads as a recommendation. */}
                  {lengthPicker(key, lengths, picked, sport)}

                  {(isHard || key === 'long') && props.renderHardFlavor
                    ? props.renderHardFlavor(key, { close: () => setOpen(null) })
                    : null}

                </div>
              ) : null}
            </div>
          );
  };

  /**
   * ⛔⛔ A DAY WITH NO ENDURANCE CHOICE, DRAWN RATHER THAN OMITTED (Michael, 2026-08-30).
   *
   * ⛔ IT IS NOT A CONTROL AND MUST NOT LOOK LIKE ONE. No button, no chevron, no accordion entry, no
   * sport colour on the edge — it is a label row that states what the frame already decided. The
   * screen's own rule is that colour means "you chose this", so a row nobody chooses carries none.
   * ⚠️ `aria-hidden` IS DELIBERATELY NOT SET. The row carries a real fact about the athlete's week —
   * that day 7 is rest — and hiding it from a screen reader would give a non-sighted athlete the
   * five-row week this change exists to end.
   */
  const quietRow = (day: number, quiet: 'rest' | 'lifting', themeTag: string | null) => (
    <div
      key={`quiet-${day}`}
      data-testid={`quiet-day-${day}`}
      className="rounded-xl border overflow-hidden"
      style={{
        // ⚠️ LONGHANDS ONLY, same as the slot row — see the note there on the shorthand bug.
        borderTopColor: 'rgba(255,255,255,0.06)',
        borderRightColor: 'rgba(255,255,255,0.06)',
        borderBottomColor: 'rgba(255,255,255,0.06)',
        borderLeftColor: 'rgba(255,255,255,0.06)',
        borderLeftWidth: 3,
        backgroundColor: 'rgba(255,255,255,0.012)',
      }}
    >
      {/* ⚠️ THE SAME TWO-LINE SEAM AS A PICKER ROW — frame facts on top, what the day IS underneath —
          so the quiet days read as part of the same list rather than a different component. */}
      <div className="pl-4 pr-4 py-3">
        <span className="block text-white/30 text-xs leading-snug truncate">
          <span className="tabular-nums">{`Day ${day}`}</span>
          {themeTag ? <span>{` · ${themeTag}`}</span> : null}
        </span>
        <span className="block text-white/40 text-sm leading-snug truncate">
          {QUIET_DAY_LABEL[quiet]}
        </span>
      </div>
    </div>
  );

  return (
    /**
     * ⚠️ `StepLayout`'s own `pb-24` IS NOT ENOUGH ON A PHONE. Its Continue bar adds
     * `env(safe-area-inset-bottom)` on top of a 52 px key and its padding, so on a device with a home
     * indicator the bar is taller than the padding meant to clear it — which is why the club option
     * sat half under it. This adds the inset explicitly rather than guessing a bigger number.
     */
    <div
      className="flex flex-col gap-5"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      {/* ⛔⛔ THE INTRO — MICHAEL'S OWN WORDING, VERBATIM (2026-08-26), replacing both paragraphs
          that stood here. See `ENDURANCE_WEEK_INTRO_*` for his text and what its removal took with
          it.

          ⛔⛔ AND IT IS **TWO PARTS, NOT ONE WALL** — that is the point of the change, not a
          decoration on it. Three kinds of information were at one visual weight and the eye could
          not find the seams: what the week IS (the slots), what a choice COSTS, and the
          instruction. Same words, same place, read as two things.

          ⛔ THE CONSEQUENCE LINES STAY UP HERE and do not move onto the hard-session card. Michael:
          *"they already went into the restaurant so they will feel they should order something."*
          By the time that card is open the athlete has committed — the tradeoff has to be readable
          BEFORE the Add tap. A later pass will want to move them "beside the control they are
          about"; that is the tidy-up this note exists to stop. */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-white/90 text-[15px] leading-snug">{introLines[0]}</p>
          {/* ⚠️ A LIST BECAUSE HE WROTE ONE — one line per slot, not a paragraph. No bullet glyphs:
              he wrote bare lines and a bullet is punctuation he did not use. */}
          <div className="mt-1.5 space-y-0.5">
            {introLines.slice(1).map((line) => (
              <p key={line} className="text-white/70 text-[14px] leading-snug pl-3">{line}</p>
            ))}
          </div>
        </div>
        {/* ⚠️ SEPARATED BY SPACE AND WEIGHT BOTH — the gap says "different kind of thing" and the
            lighter tone says "this is not more of the list". */}
        <div className="space-y-0.5">
          {ENDURANCE_WEEK_INTRO_CONSEQUENCE.map((line) => (
            <p key={line} className="text-white/60 text-[13px] leading-relaxed">{line}</p>
          ))}
          {/* ⛔ WHERE THE WEEKLY NUMBER WENT. The hours boxes are gone from this frame and volume is
              no longer an ask — an athlete who arrives looking for that field finds the answer here
              rather than a control that has vanished. ⚠️ No number in it, deliberately. */}
          {dayOrdered ? (
            <p className="text-white/60 text-[13px] leading-relaxed" data-testid="weekly-volume-is-sum">
              {WEEKLY_VOLUME_IS_THE_SUM_LINE}
            </p>
          ) : null}
        </div>
      </div>

      {/* ⛔⛔ ONE BLOCK OF FOUR ROWS (2026-08-26 evening). The screen used to be two blocks — the
          frame's own two, then an opt-in "+ Add a hard session" control under them — because hard
          sessions were an ADDITION to the week and a different kind of thing.

          ⛔ p119 ENDS THAT DISTINCTION: *"it's crucial to continue to train running economy…
          maintain your threshold performance… and base… no quality should be allowed to deteriorate
          completely."* Both quality sessions are the frame's, so all four rows are one kind of thing
          and read as one list. Michael: *"lets not make them optional that was not understanding
          things on my part."*

          ⛔ THE ADD CONTROL IS DELETED, NOT HIDDEN, and so is the dismiss on the hard rows. What is
          gone with them: the add-then-undo restore, the "up to two" cap, and the count of added
          sessions. See `REQUIRED_SLOT_KEYS` for the whole tombstone.

          ⛔ THE ORDER IS LONG · RECOVERY · HARD 1 · HARD 2 — his own intro's order, so the list
          above the rows and the rows themselves read the same way. ⚠️ Long still leads for the
          reason it was moved there: it is the row most likely to be the athlete's fixed weekend
          session. */}
      {/* ⛔⛔ TWO ORDERS, ONE ROW RENDERER, AND THE FRAME PICKS (Michael, 2026-08-30).

          ⛔ STANDARD FOCUS DRAWS ALL SEVEN DAYS IN DAY ORDER. Its week is p274's week and an athlete
          reads it against their own calendar; five rows in role order left day 5 and day 7 off the
          screen with nothing said. The choice-free days are drawn greyed and inert — see `quietRow`.

          ⛔ AND `strength_5k` IS UNTOUCHED — `rowKeys` is `displayOrderFor`, which is still his
          2026-08-26 long-first ruling, and its screen renders exactly as it did. **That is the
          acceptance test for this change and it is pinned.** ⚠️ The two orders genuinely conflict:
          day order puts the gating hard rows first, long-first was chosen to put them first for a
          different reason. Michael ruled per-frame rather than picking one. */}
      <div className="flex flex-col gap-2">
        {/* ⚠️ FLAT, NOT NESTED. A day can carry more than one endurance row, and an array returned
            inside a `map` becomes an unkeyed fragment — `flatMap` keeps every row a direct sibling
            with its own key, which is what the accordion's one-open-at-a-time state assumes. */}
        {dayOrdered
          ? weekDays.flatMap((d) => (d.quiet
            ? [quietRow(d.day, d.quiet, d.themeTag)]
            : d.slotKeys.map((k) => slotRow(k, d.themeTag))))
          : rowKeys.map((k) => slotRow(k))}
      </div>

      {/* ⛔ VOLUME, BOUNDED BOTH ENDS BY WHAT THE SLOTS HOLD — and the bounds recompute as the sports
          change, because the slots they are summed from just did.
          ⛔ ONE ROW (Michael, 2026-08-24). Stacked, they read as two separate questions and pushed the
          second toward the fold. ⚠️ `flex-wrap` with a `min-w` basis, not a fixed two-column grid: a
          narrow viewport stacks them rather than crushing both. */}
      {/* ⛔⛔ THE DIALS ARE NOT GATED ANY MORE (Michael, 2026-08-26, off the audit). They were, on
          `allSlotsChosen`, and the reason given was that the CAPS are summed from the slots — true
          of the LINE under each dial, and not true of the dial itself.
          ⛔ WHAT IT COST: the hours are the primary thing this screen collects, and on a mixed
          athlete they did not exist until Recovery and Long had both been expanded and answered —
          four taps to reach the main control, with Continue blocked the whole way.
          ⚠️ SO THE SPLIT IS BY WHAT ACTUALLY NEEDS THE SLOTS: the dial renders always, and
          `fixedHoursLine` — the only thing here summed from them — stays behind `allSlotsChosen`
          below. The bounds still decide WHICH dials exist, because a sport nobody is doing has no
          hours to set. */}
      {/* ⛔⛔⛔ THE WEEKLY HOURS AND DAYS BOXES ARE GONE FROM THIS FRAME (Michael, 2026-08-30), AND SO
          IS EVERYTHING THAT HUNG OFF THEM.

          ⛔ WHY, IN HIS OWN TERMS: the easy and long sessions scale by TIME in the book, so the length
          is the question. A weekly total asked it sideways — the athlete typed hours, the engine
          solved backwards for a dial position, and the two warnings that had to exist (*"you asked
          for 6h, the week holds 4h15"* in both directions) were the cost of that indirection. **A
          per-session pick bounded by that session's own ladder cannot be over or under anything, so
          the class of error those sentences report ceases to exist.**

          ⛔ WHAT GOES WITH THEM ON THIS FRAME, all correctly and none of it deleted from the module:
          the two hour dials, the two day dials, the running-hours line added earlier today, the whole
          experience control, and `restIsEasyLine`. The over-ask and under-ask notes in `compose.ts`
          are untouched and simply stop firing here — they are gated on a finite hours ask, and they
          still serve `strength_5k` and every other caller.
          ⚠️ THE CONTINUE GATE MOVED WITH THEM. `NonRaceBuilder`'s `volumeMissing` blocked Continue
          until hours were typed; leaving that in place with the boxes gone is a Continue that cannot
          be satisfied, which is the exact defect that cost 2026-08-30 its morning. It is re-scoped in
          the same change, not after. */}
      {(!dayOrdered && sportsWithHours.length > 0) ? (
        <div ref={volumeRef}>
          {/* ⛔ THE HONESTY NOTE, BESIDE THE NUMBER IT IS ABOUT (moved off the tier screen,
              Michael, 2026-08-24 evening). His words, verbatim — the first line reworded from
              miles to hours on 2026-08-26 and the other two untouched. */}
          <div className="mb-3 space-y-0.5">
            {VOLUME_HONESTY_LINES.map((line) => (
              <p key={line} className="text-white/70 text-[13px] leading-snug">{line}</p>
            ))}
            {/* ⛔⛔ THE UPPER/LOWER SPLIT, REHOMED HERE (Michael, 2026-08-26). It rode in the chrome
                beside the lifting-rate line; that line was killed and this one was not — it is a
                real p247 fact and the only thing on the screen naming WHICH lifts the running costs.
                ⛔ AND IT IS THE ONLY ONE OF THE THREE LEFT HERE. It used to sit under "More running
                will slow your strength progress; riding is much more forgiving", which was cut on
                2026-08-27 — with the intro's own two lines that made a filled-in screen state
                "running costs your legs" three separate ways. This one is the specific claim, it
                names the lifts that pay, and it only appears once a hard run is actually picked.
                ⚠️ IT KEEPS ITS OWN GATE: null when no hard slot is a run, because then there is no
                split to explain. */}
            {split ? (
              <p className="text-white/70 text-[13px] leading-snug" data-testid="upper-lower-split">{split}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-4">
          {(['run', 'ride'] as const).map((sport) => {
            if (!sportsWithHours.includes(sport)) return null;
            const value = sport === 'run' ? props.runVolume : props.rideHours;
            const onChange = sport === 'run' ? props.onRunVolume : props.onRideHours;
            return (
              <div key={sport} className="flex-1 min-w-[150px]">
                <p className="text-white/80 text-[13px] mb-2">
                  Weekly {sport === 'run' ? 'running' : 'riding'} to hold
                </p>
                <div className="flex items-baseline gap-2">
                  {/* ⛔⛔ A DROPDOWN OF WHOLE HOURS, SAME LIST BOTH SPORTS (Michael, 2026-08-26,
                      final): *"no time buckets — 1,2,3,4,5,6 hours for both ride and run"*, tops
                      per sport: *"8 for runs 12 for rides, I mean its silly but not unheard of."*
                      ⛔ ALWAYS THE FULL LIST — no filtering to what the picks can build. An ask
                      under the week's fixed sessions simply builds those sessions, which is his own
                      worst case: *"if someone runs an hour a week and they only pick one run,
                      worst case they get the cap on the hard session."*
                      ⚠️ THE EMPTY OPTION STAYS FIRST. No number in an untouched box (Michael,
                      2026-08-24 night) — a preselected value reads as a suggestion. */}
                  <select
                    data-testid={sport === 'run' ? 'run-volume' : 'ride-hours'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-24 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-white text-base tabular-nums focus:outline-none focus:border-[var(--fc)]"
                    style={{ ['--fc' as string]: `rgb(${getDisciplineColorRgb(sport === 'run' ? 'run' : 'bike')})` }}
                  >
                    <option value="">—</option>
                    {WEEKLY_HOUR_OPTIONS[sport].map((h) => (
                      <option key={h} value={String(h)}>{h}</option>
                    ))}
                  </select>
                  <span className="text-white/50 text-sm">{Number(value) === 1 ? 'hour' : 'hours'}</span>
                </div>
                {/* ⛔⛔ OVER HOW MANY DAYS (Michael, 2026-08-27): *"I run for three hours a week over
                    the course of three days. I ride for four hours a week over the course of two
                    days and then we chop it up according to the plans numbers."* The hours say how
                    much; this says across how many sessions, and the engine divides.
                    ⚠️ IT SITS UNDER THE HOURS IT DIVIDES, not in its own block — one question about
                    this sport, answered in one place.
                    ⚠️ THE EMPTY OPTION STAYS FIRST, same as the hours: no number in an untouched box
                    means no opinion, and the frame's own count stands. */}
                <div className="flex items-baseline gap-2 mt-2">
                  <select
                    data-testid={sport === 'run' ? 'run-days' : 'ride-days'}
                    value={sport === 'run' ? props.runDays : props.rideDays}
                    onChange={(e) => (sport === 'run' ? props.onRunDays : props.onRideDays)(e.target.value)}
                    className="w-24 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-white text-base tabular-nums focus:outline-none focus:border-[var(--fc)]"
                    style={{ ['--fc' as string]: `rgb(${getDisciplineColorRgb(sport === 'run' ? 'run' : 'bike')})` }}
                  >
                    <option value="">—</option>
                    {ENDURANCE_DAY_OPTIONS.map((d) => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                  <span className="text-white/50 text-sm">
                    {Number(sport === 'run' ? props.runDays : props.rideDays) === 1 ? 'day' : 'days'}
                  </span>
                </div>
                {/* ⛔⛔ THE HOURS DIAL DOES DIFFERENT THINGS FOR THE TWO SPORTS, AND THE SCREEN NOW
                    SAYS SO — see `RUN_HOURS_LAND_ON_THE_LONG_RUN_LINE` for the measurements.
                    Riding hours land; running hours have only the long run to land on and it caps.
                    The same fact already reached the athlete AFTER the plan was built; this is it
                    beside the control that is about to disappoint them.
                    ⛔ RUNNING ONLY — a riding counterpart would warn about a control that works.
                    ⚠️ GATED ON THE SAME PER-FRAME RULING AS THE LAYOUT (`weekIsDayOrdered`), and NOT
                    because the fact is false on the other frame — it is true there too. Michael ruled
                    on 2026-08-30 that the 5K screen is not to be touched, so its copy is unchanged. */}
                {sport === 'run' && dayOrdered ? (
                  <p className="text-white/45 text-xs mt-2 leading-snug" data-testid="run-hours-land">
                    {RUN_HOURS_LAND_ON_THE_LONG_RUN_LINE}
                  </p>
                ) : null}
                {/* ⛔ THE ONE LINE THAT REMAINS — what the book fixes, and where the rest goes.
                    Michael's own shape: *"copy say hard hours cap at 1.38 or whatever for the run
                    and same for bike, rest will be easy."* It replaces every cap, floor and
                    over-cap sentence this screen used to carry. ⚠️ Written by the ENGINE
                    (`fixedHoursLine`), so the number here and the number the block states cannot
                    come apart. */}
                {/* ⛔⛔ THE EXPERIENCE CONTROL — TWO CHIPS, UNDER THE HOURS AND DAYS THEY ANSWER FOR
                    (Michael's screen, 2026-08-27). It is the sole input to how long this sport's hard
                    sessions and long session are; the last 28 days of logged training used to decide
                    it and no longer do.

                    ⛔ CHIPS, NOT A DROPDOWN. With two options a dropdown costs two taps and hides
                    half the choice. The Run/Ride pair inside each slot row is the same control.
                    ⛔ THE DURATION SITS ON THE CHIP AND THERE IS NO TABLE UNDER IT. A lookup table
                    makes the athlete find their own answer — rejected explicitly.
                    ⛔ THE MAXIMUM, NOT A RANGE OR A TYPICAL. Ranges overlap between tiers because the
                    session shape rotates weekly; maxima ladder cleanly.
                    ⚠️ IT NEEDS EVERY SLOT ANSWERED for the same reason the fixed-hours line does —
                    both numbers are summed from the slots, and before that they would describe a week
                    the athlete has not yet described. */}
                {allSlotsChosen(slotsNow, frame) && chips[sport] ? (() => {
                  const pair = chips[sport]!;
                  const picked = props.experience[sport] ?? null;
                  const hours = Number(sport === 'run' ? props.runVolume : props.rideHours);
                  /**
                   * ⛔⛔ THE TOP TIER GREYS OUT BELOW ITS OWN MINIMUM, AND THE LOWER ONE NEVER GATES
                   * (Michael: *"lower never gates just top"*). The lower tier is the plan's own floor
                   * — if the hours do not reach even that, the problem is the hours ask and the week
                   * flags it there rather than leaving both chips dead.
                   * ⚠️ THE GREYED CHIP KEEPS ITS "needs Xh/wk" READABLE. A dead control with no
                   * reason on it sends the athlete back up the screen guessing.
                   */
                  const canExperienced = experiencedIsReachable(hours, pair.experienced.needsHours);
                  /**
                   * ⛔⛔ WHAT THIS ANSWER ACTUALLY MOVES FOR THIS SPORT — see `experienceMovement`.
                   * One derivation feeding the subtitle, the two chip lines and the equal-tiers guard,
                   * so the heading, the numbers and the sentence underneath cannot end up describing
                   * three different sessions. The riding pair on the All Rounder is why: its hard ride
                   * is pinned at level 1 by the page and measures 65 min at both tiers, so a subtitle
                   * claiming the hard rides was false and the control read as dead.
                   */
                  const movement = experienceMovement(pair);
                  /**
                   * ⛔⛔⛔ ON STANDARD FOCUS THIS IS ONE CONDITIONAL QUESTION AND IT IS THE RIDE'S —
                   * Michael's final ruling, 2026-08-30. See `experienceAsksFor` for the measurements:
                   * the run answer moves two sessions by 5-8 min and the long run's own 100-min cap
                   * washes the rest out, and the week's other rides are identical at both tiers. Where
                   * nothing is asked, `EXPERIENCE_WHEN_UNASKED` is stored — by the WIZARD, so the
                   * composer receives a tier on every path.
                   * ⚠️ `plain` IS THE SAME PER-FRAME RULING AS THE LAYOUT (`weekIsDayOrdered`), so
                   * `strength_5k` keeps both questions, its headings and its labelled chips.
                   */
                  const plain = dayOrdered;
                  if (!experienceAsksFor(sport, movement, plain)) return null;
                  /**
                   * ⛔⛔⛔ NOTHING IS ASKED ON A PER-SESSION FRAME (Michael, 2026-08-30). The tier is
                   * dead as an input there — the easy and long rows carry a direct minutes pick and
                   * the quality rows carry the page's own dose — so `experienceAsksFor` returns false
                   * and this whole control does not render. `'experienced'` is what the wizard stores.
                   * ⚠️ THE CONTINUE GATE READS THE SAME PREDICATE. A question that is required but not
                   * drawn is a Continue that cannot be satisfied — the defect that cost 2026-08-30 its
                   * morning, and the reason one owner answers "is this asked" for both.
                   */
                  if (!experienceAsksFor(sport, movement, dayOrdered)) return null;
                  const subtitle = experienceSubtitle(sport, movement);
                  return (
                    <div className="mt-3" data-testid={`${sport}-experience`}>
                      <p className="text-white/80 text-[13px]">{EXPERIENCE_HEADING[sport]}</p>
                      {subtitle ? (
                        <p className="text-white/55 text-xs mt-0.5 leading-snug">{subtitle}</p>
                      ) : null}
                      <div className="flex items-stretch gap-2 mt-2">
                        {([pair.newer, pair.experienced]).map((chip) => {
                          const dead = chip.tier === 'experienced' && !canExperienced;
                          const on = picked === chip.tier && !dead;
                          const c = getDisciplineColor(SPORT_DISCIPLINE[sport]);
                          return (
                            <button
                              key={chip.tier}
                              type="button"
                              aria-pressed={on}
                              disabled={dead}
                              data-testid={`experience-${sport}-${chip.tier}`}
                              onClick={() => props.onExperienceChange(sport, chip.tier)}
                              className="flex-1 px-3 py-2 rounded-xl text-xs border leading-snug text-left"
                              style={dead
                                ? {
                                    borderColor: 'rgba(255,255,255,0.08)',
                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                    color: 'rgba(255,255,255,0.35)',
                                  }
                                : on
                                  ? { borderColor: c, backgroundColor: `${c}29`, color: '#fff' }
                                  : {
                                      borderColor: 'rgba(255,255,255,0.12)',
                                      backgroundColor: 'rgba(255,255,255,0.03)',
                                      color: 'rgba(255,255,255,0.70)',
                                    }}
                            >{experienceChipTextFor(
                                sport,
                                movement,
                                chip,
                                /* ⛔ THE REQUIREMENT ONLY WHERE IT BLOCKS — `dead` is
                                   `experiencedIsReachable`'s answer, already computed above. */
                                dead ? chip.needsHours : null,
                              )}</button>
                          );
                        })}
                      </div>
                      {/* ⛔ THE REASON THE TOP CHIP IS DEAD, SAID ONCE AND BESIDE IT. */}
                      {!canExperienced ? (
                        <p className="text-white/40 text-xs mt-1.5" data-testid={`${sport}-experience-gated`}>
                          {experienceGatedLine(sport, pair.experienced.needsHours)}
                        </p>
                      ) : null}
                      {/* ⛔⛔ THE EQUAL-TIERS LINE IS DELETED FROM HERE (Michael, 2026-08-30), and the
                          reason is that the state it explained no longer draws a control: the question
                          renders only where the long session is a ride, and there the two floors always
                          split. See the tombstone on the constant in `standing-plan-week-copy.ts`. */}
                    </div>
                  );
                })() : null}
                {/* ⛔⛔ WHAT THE REST OF THE HOURS ARE FOR, AND IT LEFT THE QUESTION BLOCK (2026-08-30).
                    It was rendered inside the experience control, so when Michael's ruling made that
                    control conditional this sentence would have vanished with it — on Standard Focus it
                    would have disappeared for BOTH sports, taking the only answer to *"what fills the
                    hours I just typed"* with it. It is about the HOURS, so it lives under the hours.
                    ⚠️ STILL GATED ON EVERY SLOT BEING ANSWERED: the sentence differs by sport because
                    the long run carries faster inserts and the long ride does not, and before the slots
                    are answered there is no week to be right about.
                    ⚠️ NO NUMBER IN IT, deliberately — see `restIsEasyLine`. */}
                {allSlotsChosen(slotsNow, frame) && chips[sport] ? (
                  <p
                    /* ⚠️ THE OLD GAP WHERE THE OLD LAYOUT STILL STANDS. Inside the experience block
                       this sat `mt-1.5` under the chips; on `strength_5k` it still follows chips and
                       keeps that spacing, so the screen is unchanged. On the day-ordered frame it can
                       follow a select instead, which needs the wider gap. */
                    className={`text-white/40 text-xs ${dayOrdered ? 'mt-3' : 'mt-1.5'}`}
                    data-testid={`${sport}-rest-easy`}
                  >
                    {restIsEasyLine(sport)}
                  </p>
                ) : null}
                {/* ⛔⛔ THE FIXED-HOURS SENTENCE IS DELETED (Michael, 2026-08-30). It printed the
                    SUM of this sport's hard sessions — "The hard runs come to about 1h40" — beside a
                    chip printing the LONGEST single one, with nothing saying they were different
                    quantities. Two true numbers that cannot be reconciled by looking read as the app
                    contradicting itself, and counting the numbers on this screen is his acceptance
                    test. The chip now carries the count as well as the duration, so the sum has
                    nothing left to add. ⚠️ `fixedHoursLine` still exists and is still the engine's
                    own arithmetic; it is the SCREEN that stopped printing a second figure. */}
              </div>
            );
          })}
          </div>
        </div>
      ) : null}

      {/* ⚠️ SAID WHEN IT IS TRUE, not always. Some sessions carry recoveries the source gives no
          duration for, so their totals are floors — and a cap built on a floor is a floor too. */}
      {bounds.isLowerBound ? (
        <p className="text-white/35 text-xs leading-snug">
          Some sessions carry recoveries with no stated length, so these are the shortest the week can be.
        </p>
      ) : null}

    </div>
  );
}


/**
 * ⛔⛔ `EnduranceWeekRate` IS DELETED (Michael, 2026-08-26: *"E kill it"*), and this note is here so
 * the footer is not rebuilt for the sentence that survived it.
 *
 * It was a pinned footer holding the lifting-rate line, on the argument that the rate was the one
 * thing on the screen that TAUGHT and *"a number that changes off-screen has taught nobody
 * anything."* The rate is gone — see `standing-plan-week-copy.ts` for the measurements that killed
 * it — and with it the reason for a pinned element at all.
 *
 * ⚠️ THE SPLIT LINE DID NOT GO WITH IT. It moved INTO the card, beside the volume note, because a
 * pinned footer is for something LIVE and that sentence is static: it appears when a hard slot is a
 * run and does not change again. Pinning a fixed fact would hold it permanently over the athlete's
 * controls, which is the opposite of what the footer was for.
 */
