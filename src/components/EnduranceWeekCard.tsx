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
import { ChevronDown } from 'lucide-react';
import {
  ENDURANCE_WEEK_INTRO_CONSEQUENCE,
  ENDURANCE_WEEK_INTRO_STRUCTURE,
  EXPERIENCE_HEADING,
  EXPERIENCE_SUBTITLE,
  experienceChipLine,
  experienceGatedLine,
  experiencedIsReachable,
  HARD_1_SLOT_NOTE,
  LONG_SLOT_NOTE,
  VOLUME_HONESTY_LINES,
  SLOT_KEYS,
  SLOT_LABEL,
  slotFrameDay,
  SLOT_OPTIONS,
  slotSummary,
  upperLowerSplitLine,
  allSlotsChosen,
  REQUIRED_SLOT_DISPLAY_ORDER,
  type SlotKey,
  type SlotSelection,
  type SlotSport,
} from '@/lib/standing-plan-week-copy';
import { experienceChips, weekBounds } from '@/lib/standing-plan-week-bounds';
import type { EnduranceExperience, ExperienceTier } from '../../supabase/functions/_shared/standing-plan/frames.ts';
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
  renderHardFlavor?: (key: 'hard1' | 'hard2' | 'long') => React.ReactNode;
  /** What the slot currently is, for the collapsed row. Hard slots only; others need no session. */
  hardSessionTitle?: (key: 'hard1' | 'hard2' | 'long') => string | null;
  /**
   * ⛔ THE ATHLETE-TYPE ANSWER PRE-SHAPES THIS SCREEN (Michael, 2026-08-24): "Run only" never
   * renders Ride chips, "Ride only" never renders Run. With one sport allowed, every slot is
   * auto-assigned to it — the four-choices screen only exists for the mixed athlete.
   */
  allowedSports?: SlotSport[];
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
  const volumeRef = React.useRef<HTMLDivElement | null>(null);
  const chosen = allSlotsChosen(props.slots);
  React.useEffect(() => {
    if (!chosen) return;
    // ⚠️ next frame — the section renders in this commit; scrolling in the same tick measures
    // the layout before it exists.
    const t = window.setTimeout(() => {
      volumeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [chosen]);

  const bounds = weekBounds(props.slots, {
    baselines: props.baselines as never,
    easyPaceSecPerMi: props.easyPaceSecPerMi,
    experience: props.experience,
  });
  /**
   * ⛔⛔ THE TWO CHIPS' NUMBERS, COMPUTED — never typed. `experienceChips` runs the engine's own
   * `ladderOf` and `weekVolumeBounds` against the slot answers four rows above and the athlete's own
   * baselines, so a run on the first hard slot and a run on the second give different numbers.
   * ⚠️ NULL FOR A SPORT THAT FILLS NO SLOT — there is nothing for the answer to size, so no chip.
   */
  const chips = experienceChips(props.slots, {
    baselines: props.baselines as never,
    // ⛔ THE VARIANT THE ATHLETE PICKED INSIDE THE HARD ROW BEATS THE FRAME'S OWN SHAPE, in the
    // composer and therefore here. Without it the chip quotes the session they just replaced.
    archetypes: props.hardArchetypes,
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
  const split = upperLowerSplitLine(props.slots);

  /**
   * ⛔ ONE ROW RENDERER, TWO BLOCKS (2026-08-25). The hard sessions lead the screen and the frame's
   * own two follow, but a row is a row — extracting this is what keeps the added hard cards and the
   * recovery/long cards from drifting into two slightly different components.
   */
  const slotRow = (key: SlotKey) => {
          const sport = props.slots[key];
          /**
           * ⛔ NO SPORT, NO COLOUR (Michael, 2026-08-24). A row the athlete has not answered carries
           * the neutral edge — the colour is what says "you chose this", so painting it before they
           * chose is the screen answering its own question.
           */
          const color = sport ? getDisciplineColor(SPORT_DISCIPLINE[sport]) : null;
          const isOpen = open === key;
          const isHard = key === 'hard1' || key === 'hard2';
          /**
           * ⛔ THE LONG SLOT SHOWS ITS SESSION TITLE TOO (slice 2b, 2026-08-25). It was hard-only,
           * so a long slot the athlete had marked as their club ride showed the sport and nothing
           * else — the one fact they had just entered was the one the closed row did not carry.
           */
          const session = (isHard || key === 'long')
            ? props.hardSessionTitle?.(key) ?? null
            : null;
          // ⛔ THE FRAME OWNS THE DAY — see `slotFrameDay`. `null` on a column with no such slot
          // (the taper carries three, not four), which renders no prefix rather than a wrong one.
          const dayNumber = slotFrameDay(key);
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
              <div className="flex items-stretch">
                <button
                  type="button"
                  data-testid={`slot-row-${key}`}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : key)}
                  className="flex-1 min-w-0 text-left pl-4 pr-2 py-3.5 flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    {/* ⛔ THE ROW STATES ITS WHOLE ANSWER — never "Hard 1". See `slotSummary`. */}
                    {/* ⛔ AND WHICH DAY OF THE WEEK'S SEVEN IT IS (Michael, 2026-08-30: *"lets number
                        the days in this section"*). Read off the frame by `slotFrameDay`, never
                        hardcoded, and a NUMBER rather than a weekday — the frame rotates onto the
                        calendar after this screen, so a weekday here is a promise the next screen
                        breaks. ⚠️ Its own element, not folded into `slotSummary`: the slot labels are
                        frozen and this adds a fact to the row rather than renaming anything. */}
                    <span className="block text-white/90 text-sm leading-snug truncate">
                      {dayNumber != null ? (
                        <span className="text-white/45 tabular-nums">{`Day ${dayNumber} · `}</span>
                      ) : null}
                      {slotSummary(key, sport, session)}
                    </span>
                    {key === 'long' ? (
                      <span className="block text-white/40 text-xs mt-0.5">{LONG_SLOT_NOTE}</span>
                    ) : null}
                    {/* ⛔ ONLY SLOT ONE. It is the row the intro's 3-4% is about — day 1 sits before
                        the heavy leg day. Slot 2 is followed by an upper day and its sport costs the
                        lifts nothing, so it stays silent rather than carrying a line that would read
                        as the same warning twice. */}
                    {key === 'hard1' ? (
                      <span className="block text-white/40 text-xs mt-0.5">{HARD_1_SLOT_NOTE}</span>
                    ) : null}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-white/35 transition-transform"
                    style={isOpen ? { transform: 'rotate(180deg)' } : undefined}
                  />
                </button>
              </div>

              {isOpen ? (
                <div className="px-4 pb-4 space-y-3">
                  <div className="instrument-divider !my-0" />
                  {/* The sport, as two chips. Selected carries the sport colour; unselected neutral —
                      colouring both would read as two chosen answers. */}
                  <div className="flex items-center gap-2">
                    {SLOT_OPTIONS[key].filter((opt) =>
                      !props.allowedSports || props.allowedSports.includes(opt.value)
                    ).map((opt) => {
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
                  {(isHard || key === 'long') && props.renderHardFlavor
                    ? props.renderHardFlavor(key)
                    : null}

                </div>
              ) : null}
            </div>
          );
  };

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
          <p className="text-white/90 text-[15px] leading-snug">{ENDURANCE_WEEK_INTRO_STRUCTURE[0]}</p>
          {/* ⚠️ A LIST BECAUSE HE WROTE ONE — one line per slot, not a paragraph. No bullet glyphs:
              he wrote bare lines and a bullet is punctuation he did not use. */}
          <div className="mt-1.5 space-y-0.5">
            {ENDURANCE_WEEK_INTRO_STRUCTURE.slice(1).map((line) => (
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
      <div className="flex flex-col gap-2">
        {REQUIRED_SLOT_DISPLAY_ORDER.map(slotRow)}
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
      {(sportsWithHours.length > 0) ? (
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
            const line = sport === 'run' ? props.runFixedLine : props.rideFixedLine;
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
                {allSlotsChosen(props.slots) && chips[sport] ? (() => {
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
                  return (
                    <div className="mt-3" data-testid={`${sport}-experience`}>
                      <p className="text-white/80 text-[13px]">{EXPERIENCE_HEADING[sport]}</p>
                      <p className="text-white/55 text-xs mt-0.5 leading-snug">{EXPERIENCE_SUBTITLE[sport]}</p>
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
                            >{experienceChipLine(chip.tier, chip.longestMin, chip.needsHours)}</button>
                          );
                        })}
                      </div>
                      {/* ⛔ THE REASON THE TOP CHIP IS DEAD, SAID ONCE AND BESIDE IT. */}
                      {!canExperienced ? (
                        <p className="text-white/40 text-xs mt-1.5" data-testid={`${sport}-experience-gated`}>
                          {experienceGatedLine(sport, pair.experienced.needsHours)}
                        </p>
                      ) : null}
                    </div>
                  );
                })() : null}
                {/* ⚠️ THIS is the half that genuinely needs every slot answered — it is summed from
                    them. Before that it would state a figure for a week the athlete has not
                    described, and it would move under them as they answered. */}
                {allSlotsChosen(props.slots) && line ? (
                  <p className="text-white/55 text-xs mt-1.5" data-testid={`${sport}-fixed-hours`}>{line}</p>
                ) : null}
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
