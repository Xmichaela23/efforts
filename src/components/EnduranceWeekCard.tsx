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
import { ChevronDown, X } from 'lucide-react';
import {
  ENDURANCE_WEEK_PREAMBLE,
  LONG_SLOT_NOTE,
  VOLUME_HONESTY_LINES,
  runnerMileageLine,
  SLOT_KEYS,
  SLOT_LABEL,
  SLOT_OPTIONS,
  liftingRateLine,
  slotSummary,
  upperLowerSplitLine,
  allSlotsChosen,
  defaultSportForAddedSlot,
  HARD_SESSIONS_OPT_IN_LINE,
  HARD_SLOT_KEYS,
  MAX_HARD_SESSIONS,
  REQUIRED_SLOT_KEYS,
  hardSessionCount,
  type SlotKey,
  type SlotSelection,
  type SlotSport,
} from '@/lib/standing-plan-week-copy';
import { weekBounds, RUN_MILES_BLOCK_CAP, OVER_CAP_LINE } from '@/lib/standing-plan-week-bounds';
import { getDisciplineColor } from '@/lib/context-utils';

export type EnduranceWeekCardProps = {
  slots: SlotSelection;
  /**
   * ⛔ `null` CLEARS THE SLOT — it is how a hard session is REMOVED (2026-08-25). Only the two hard
   * slots are ever cleared; easy and long are the frame's and Continue is gated on both.
   */
  onSlotChange: (key: SlotKey, sport: SlotSport | null) => void;
  /** The athlete's baselines row — the caps resolve every session against their own anchors. */
  baselines?: unknown;
  easyPaceSecPerMi?: number | null;
  squat1RM?: number | null;
  /** Weekly running, in the athlete's own display unit. */
  runVolume: string;
  onRunVolume: (v: string) => void;
  rideHours: string;
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
   * ⛔ WHAT WAS OPEN WHEN "+ Add" WAS TAPPED, so dismissing that card puts the screen back EXACTLY
   * as it was (Michael, 2026-08-25). Adding a session opens it, which collapses whatever the athlete
   * already had open; X-ing straight back out would otherwise leave that card closed — a curiosity
   * tap that quietly costs them their place. ⚠️ Cleared once the added card is dismissed or the
   * athlete opens anything else, so it can never restore a stale row much later.
   */
  const [restoreOnDismiss, setRestoreOnDismiss] = React.useState<
    { added: SlotKey; prevOpen: SlotKey | null } | null
  >(null);

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
  });
  const rate = liftingRateLine(props.slots, props.squat1RM);
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
              {/* ⛔⛔ THE DISMISS SITS ON THE HEADER, BESIDE THE CHEVRON (Michael, from a device
                  screenshot 2026-08-25): *"+ Add a hard session costs a curiosity tap too much"*.
                  The only exit used to be a text link at the bottom of the EXPANDED card, so an
                  athlete who tapped Add to see what it was had to open the card, scroll it and read
                  for the way out. **Tapping Add and immediately X-ing out returns the screen to
                  exactly its pre-tap state.**

                  ⛔ IT IS A SIBLING OF THE DISCLOSURE BUTTON, NOT INSIDE IT. A button nested in a
                  button is invalid HTML and the inner click would toggle the row on its way out —
                  the card would collapse and vanish in one frame, which reads as a glitch rather
                  than as a dismissal. The header is a flex row holding both controls. */}
              <div className="flex items-stretch">
                <button
                  type="button"
                  data-testid={`slot-row-${key}`}
                  aria-expanded={isOpen}
                  onClick={() => {
                    // ⚠️ TOUCHING ANY ROW ENDS THE UNDO. The restore only means "this add was a
                    // curiosity tap"; once the athlete has worked the screen it is stale.
                    setRestoreOnDismiss(null);
                    setOpen(isOpen ? null : key);
                  }}
                  className="flex-1 min-w-0 text-left pl-4 pr-2 py-3.5 flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    {/* ⛔ THE ROW STATES ITS WHOLE ANSWER — never "Hard 1". See `slotSummary`. */}
                    <span className="block text-white/90 text-sm leading-snug truncate">
                      {slotSummary(key, sport, session)}
                    </span>
                    {key === 'long' ? (
                      <span className="block text-white/40 text-xs mt-0.5">{LONG_SLOT_NOTE}</span>
                    ) : null}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-white/35 transition-transform"
                    style={isOpen ? { transform: 'rotate(180deg)' } : undefined}
                  />
                </button>
                {/* ⚠️ VISIBLE WHETHER THE CARD IS OPEN OR CLOSED — the exit must not be something
                    you have to expand the card to find. ⛔ Hard slots only: recovery and long are
                    the frame's own and are not dismissible. */}
                {isHard ? (
                  <button
                    type="button"
                    data-testid={`dismiss-hard-${key}`}
                    aria-label="Remove this hard session"
                    onClick={() => {
                      props.onSlotChange(key, null);
                      // ⛔ BACK TO THE PRE-TAP STATE. If this is the card "+ Add" just opened, the
                      // row that was open before it re-opens; otherwise the dismissal only closes
                      // this one. ⚠️ A blanket `setOpen(null)` would close somebody else's expanded
                      // card as a side effect of dismissing this one.
                      if (restoreOnDismiss?.added === key) {
                        setOpen(restoreOnDismiss.prevOpen);
                        setRestoreOnDismiss(null);
                      } else if (isOpen) {
                        setOpen(null);
                      }
                    }}
                    /* A 44px-wide target — the row is already tall enough, and a 16px icon alone is
                       under the thumb minimum this wizard uses everywhere else. */
                    className="shrink-0 w-11 flex items-center justify-center text-white/35"
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                ) : null}
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
                      nonsense to get to what you're picking"). The volume note below the slots now
                      carries the same fact ("More running will slow your strength progress…"), so
                      here they were the message said twice, standing between the chips and the
                      choices. `RUN_TAX_LINES` stays exported — the copy tests pin his sentences. */}
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
      {/* ⛔ THE PREAMBLE IS ONE SENTENCE (Michael, 2026-08-24 evening). The session list left with
          it — the four rows below carry the same words as their labels, and the list's height is
          what pushed the fourth row off a phone screen. The running-tax sentences stay at the
          moment they are about — `RUN_TAX_LINES`, inside the hard rows. */}
      <p className="text-white/90 text-[15px] leading-snug">{ENDURANCE_WEEK_PREAMBLE[0]}</p>

      {/* ⛔⛔ THE DECISION LEADS THE SCREEN (Michael, from a device screenshot 2026-08-25).
          ═══════════════════════════════════════════════════════════════════════════════════════
          The hard-session block sits FIRST, directly under the subtitle: his copy line, any added
          sessions, then the add control. **It is the only decision on this screen.** Recovery and
          long are passive cards — the frame's own two, a sport tap each — and with them on top the
          one thing the athlete is here to choose sat underneath them, below the fold on a phone.

          ⚠️ THIS IS THE SECOND TIME THE ORDER HAS MOVED, for a different reason each time. The
          earlier pass separated the two KINDS of row (opt-in vs the frame's own), which was right;
          it then put the frame's own first, which reads as "here is your week, and also…". The
          kinds stay separate — what changed is which block LEADS. */}
      {/* ⛔⛔ THE ADD CONTROLS — HARD SESSIONS ARE OPT-IN (Michael, 2026-08-25).
          ═══════════════════════════════════════════════════════════════════════════════════════
          They sit BELOW the frame's own sessions and read as an addition to the week, which is what
          they are. ⚠️ An unadded hard session is not an unanswered row: nothing is blocked, nothing
          is highlighted, and Continue is live from the moment easy and long are set.

          ⛔ ADD / REMOVE, NOT TAP-TO-CLEAR ON THE SPORT CHIP. Michael asked whether a second tap on
          the chosen sport should clear the slot. It should not, and the reason is that it conflates
          two different intents: *"I want the other sport"* and *"I do not want this session at all"*.
          A chip that clears on a second tap also loses the session to a mis-tap, with no undo and no
          warning — and it leaves no affordance saying removal is possible, so an athlete who wants
          zero has to guess. An explicit dismiss is the inverse of an explicit Add, which is the
          pattern the rest of this wizard already uses ("+ Add a run"), and it keeps the sport chips
          doing exactly one thing. */}
      <div className="flex flex-col gap-2">
        <p className="text-white/70 text-[13px] leading-relaxed" data-testid="hard-opt-in">
          {HARD_SESSIONS_OPT_IN_LINE}
        </p>
        {/* ⛔ THE ADDED SESSIONS SIT BETWEEN THE LINE AND THE ADD CONTROL — the copy explains the
            choice, the cards are the choices made, and the control adds another. An added card
            below the "+ Add" button would read as the next empty one. */}
        {HARD_SLOT_KEYS.filter((k) => !!props.slots[k]).map(slotRow)}
        {hardSessionCount(props.slots) < MAX_HARD_SESSIONS ? (
          <button
            type="button"
            data-testid="add-hard-session"
            onClick={() => {
              // The first unadded hard slot, in the frame's own order.
              const next = HARD_SLOT_KEYS.find((k) => !props.slots[k]);
              if (!next) return;
              // ⛔ IT OPENS ON A SPORT THE ATHLETE ACTUALLY HAS — `defaultSportForAddedSlot`, which
              // is `SLOT_OPTIONS`' own order filtered by the mix. Ride leads a hard slot when riding
              // is in their week (p280); Run leads when it is not. ⚠️ This read `allowedSports[0]`
              // for one commit and handed a mixed athlete Run, because that array is built run-first
              // by the POSTURE step and its order carries no preference.
              const lead = defaultSportForAddedSlot(next, props.allowedSports);
              if (!lead) return;
              props.onSlotChange(next, lead);
              setRestoreOnDismiss({ added: next, prevOpen: open });
              setOpen(next);
            }}
            className="w-full px-4 py-3 rounded-xl border border-white/35 bg-white/[0.06] text-white/90 text-sm font-medium text-left"
          >
            + Add a hard session
          </button>
        ) : null}
      </div>


      {/* ⛔ THE FRAME'S OWN TWO — the passive half of the screen. A sport tap each and nothing to
          decide beyond that, which is exactly why they no longer lead it. **Hard sessions are
          opt-in and are not the same kind of thing as these**, which is why they are not in this
          list. Easy and long are the week; the hard ones are an addition to it. */}
      <div className="flex flex-col gap-2">
        {REQUIRED_SLOT_KEYS.map(slotRow)}
      </div>

      {/* ⛔ VOLUME, BOUNDED BOTH ENDS BY WHAT THE SLOTS HOLD — and the bounds recompute as the sports
          change, because the slots they are summed from just did.
          ⛔ ONE ROW (Michael, 2026-08-24). Stacked, they read as two separate questions and pushed the
          second toward the fold. ⚠️ `flex-wrap` with a `min-w` basis, not a fixed two-column grid: a
          narrow viewport stacks them rather than crushing both. */}
      {/* ⛔ THE VOLUME QUESTION ARRIVES WHEN THE WEEK DOES. Its caps are summed from the slots, so
          before all four are answered it would show a bound for a week the athlete has not described
          — and it would move under them as they answered. */}
      {allSlotsChosen(props.slots) && (bounds.runMilesInput || bounds.rideHours) ? (
        <div ref={volumeRef}>
          {/* ⛔ THE HONESTY NOTE, BESIDE THE NUMBER IT IS ABOUT (moved off the tier screen,
              Michael, 2026-08-24 evening). His words, verbatim. */}
          <div className="mb-3 space-y-0.5">
            {VOLUME_HONESTY_LINES.map((line) => (
              <p key={line} className="text-white/70 text-[13px] leading-snug">{line}</p>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
          {bounds.runMilesInput ? (
            <div className="flex-1 min-w-[150px]">
              <p className="text-white/80 text-[13px] mb-2">Weekly running to hold</p>
              <div className="flex items-baseline gap-2">
                <input
                  type="number" inputMode="numeric"
                  min={bounds.runMilesInput.min} max={bounds.runMilesInput.max}
                  data-testid="run-volume"
                  value={props.runVolume}
                  onChange={(e) => props.onRunVolume(e.target.value)}
                  /* ⛔ NO NUMBER IN AN EMPTY BOX (Michael, 2026-08-24 night). A grey midpoint read
                     as a suggestion — the athlete types their own week or nothing. */
                  className="w-20 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-white text-base tabular-nums"
                />
                <span className="text-white/50 text-sm">{props.unit === 'km' ? 'km' : 'mi'}</span>
              </div>
              {/* ⛔ "This week holds X to Y" CUT (Michael, 2026-08-24 evening: "it's confusing").
                  The input keeps its min/max and placeholder; the mileage bands below are the
                  guidance. `boundsLine` still exists for the engine's own tests. */}
              {/* ⛔ THE 20-MILE CEILING'S SIGNAGE (Michael, 2026-08-24): typing above the block's
                  running cap gets one factual line, not a refusal — and a link when the
                  endurance-leading frame exists. */}
              {Number(props.runVolume) > RUN_MILES_BLOCK_CAP ? (
                <p className="text-white/55 text-xs mt-1.5" data-testid="over-cap">{OVER_CAP_LINE}</p>
              ) : null}
              {/* ⛔ THE REALITY CHECK, ONE LINE, UNDER THE NUMBER IT CHECKS (moved off the tier
                  screen, 2026-08-24 evening). A three-row table here would re-create the height
                  problem it arrived to fix. */}
              <p className="text-white/40 text-xs mt-1.5" data-testid="mileage-check">
                {runnerMileageLine(props.unit)}
              </p>
            </div>
          ) : null}

          {bounds.rideHours ? (
            <div className="flex-1 min-w-[150px]">
              <p className="text-white/80 text-[13px] mb-2">Weekly riding to hold</p>
              <div className="flex items-baseline gap-2">
                <input
                  type="number" inputMode="decimal"
                  min={bounds.rideHours.min} max={bounds.rideHours.max} step={0.5}
                  data-testid="ride-hours"
                  value={props.rideHours}
                  onChange={(e) => props.onRideHours(e.target.value)}
                  /* ⛔ Same — no suggested hours in the empty box. */
                  className="w-20 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-white text-base tabular-nums"
                />
                <span className="text-white/50 text-sm">h</span>
              </div>
              {/* ⛔ Same cut as the run side — no "holds X to Y" line. */}
            </div>
          ) : null}
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
 * ⛔ THE LIVE RATE, RENDERED IN THE STEP'S CHROME RATHER THAN IN ITS BODY (2026-08-24).
 *
 * It is the only thing on this screen that TEACHES — it moves when a slot moves, and a number that
 * changes off-screen has taught nobody anything. ⚠️ It was `sticky` inside the scrolling body and
 * lifted up over the volume inputs the moment the content passed the port height; `StepLayout`'s
 * `footer` slot is outside the scroll, so it cannot overlap anything by construction.
 */
export function EnduranceWeekRate(props: {
  slots: SlotSelection;
  squat1RM?: number | null;
}) {
  const rate = liftingRateLine(props.slots, props.squat1RM);
  const split = upperLowerSplitLine(props.slots);

  return (
    <div className="instrument-card !p-3.5">
      <p className="text-white text-[13px] leading-snug tabular-nums" data-testid="lifting-rate">{rate}</p>
      {split ? <p className="text-white/50 text-[11px] leading-snug mt-1">{split}</p> : null}
    </div>
  );
}
