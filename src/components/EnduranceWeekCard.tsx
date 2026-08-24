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
  ENDURANCE_WEEK_PREAMBLE,
  LONG_SLOT_NOTE,
  RUN_TAX_LINES,
  SLOT_KEYS,
  SLOT_LABEL,
  SLOT_OPTIONS,
  liftingRateLine,
  slotSummary,
  upperLowerSplitLine,
  type SlotKey,
  type SlotSport,
} from '@/lib/standing-plan-week-copy';
import { boundsLine, weekBounds } from '@/lib/standing-plan-week-bounds';
import { getDisciplineColor } from '@/lib/context-utils';

export type EnduranceWeekCardProps = {
  slots: Record<SlotKey, SlotSport>;
  onSlotChange: (key: SlotKey, sport: SlotSport) => void;
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
  renderHardFlavor?: (key: 'hard1' | 'hard2') => React.ReactNode;
  /** What the slot currently is, for the collapsed row. Hard slots only; others need no session. */
  hardSessionTitle?: (key: 'hard1' | 'hard2') => string | null;
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

  const bounds = weekBounds(props.slots, {
    baselines: props.baselines as never,
    easyPaceSecPerMi: props.easyPaceSecPerMi,
  });
  const rate = liftingRateLine(props.slots, props.squat1RM);
  const split = upperLowerSplitLine(props.slots);
  const runLine = boundsLine(bounds.runMiles, props.unit === 'km' ? 'km a week' : 'miles a week');
  const rideLine = boundsLine(bounds.rideHours, 'hours a week');

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
      {/* ⛔ THE PREAMBLE, TIGHTENED (2026-08-24): the focus sentence and the session list. The
          running-tax and cycling-forgiving sentences moved to the moment they are about — see
          `RUN_TAX_LINES` and the hard rows below. Michael's words either way, unedited. */}
      <div>
        <p className="text-white/90 text-[15px] leading-snug">{ENDURANCE_WEEK_PREAMBLE[0]}</p>
        {/* ⚠️ "4 sessions:" IS THE LIST'S OWN LABEL, not a bullet — it counts the three lines under
            it. Slicing it away with them lost the count, which is the half of the sentence that
            tells the athlete the week is fixed. */}
        <p className="mt-3 text-white/45 text-[11px] uppercase tracking-[0.12em]">
          {ENDURANCE_WEEK_PREAMBLE[1]?.replace(/:$/, '')}
        </p>
        <ul className="mt-1.5 space-y-1">
          {ENDURANCE_WEEK_PREAMBLE.slice(2).map((line, i) => (
            <li key={i} className="flex items-baseline gap-2.5 text-white/55 text-[13px] leading-snug">
              <span aria-hidden className="shrink-0 w-1 h-1 rounded-full bg-white/30 translate-y-[-2px]" />
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* ⛔ THE FOUR SLOTS, EACH ONE ROW UNTIL ASKED. */}
      <div className="flex flex-col gap-2">
        {SLOT_KEYS.map((key) => {
          const sport = props.slots[key];
          const color = getDisciplineColor(SPORT_DISCIPLINE[sport]);
          const isOpen = open === key;
          const session = (key === 'hard1' || key === 'hard2')
            ? props.hardSessionTitle?.(key) ?? null
            : null;
          const isHard = key === 'hard1' || key === 'hard2';
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
                borderTopColor: isOpen ? `${color}66` : 'rgba(255,255,255,0.10)',
                borderRightColor: isOpen ? `${color}66` : 'rgba(255,255,255,0.10)',
                borderBottomColor: isOpen ? `${color}66` : 'rgba(255,255,255,0.10)',
                borderLeftColor: color,
                borderLeftWidth: 3,
                backgroundColor: isOpen ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.02)',
              }}
            >
              <button
                type="button"
                data-testid={`slot-row-${key}`}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : key)}
                className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3"
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

              {isOpen ? (
                <div className="px-4 pb-4 space-y-3">
                  <div className="instrument-divider !my-0" />
                  {/* The sport, as two chips. Selected carries the sport colour; unselected neutral —
                      colouring both would read as two chosen answers. */}
                  <div className="flex items-center gap-2">
                    {SLOT_OPTIONS[key].map((opt) => {
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
                  {isHard && sport === 'run' ? (
                    <div
                      className="rounded-lg px-3 py-2.5 space-y-1"
                      style={{ backgroundColor: `${color}14`, border: `1px solid ${color}2E` }}
                      data-testid={`tax-${key}`}
                    >
                      {RUN_TAX_LINES.map((line, i) => (
                        <p key={i} className="text-white/70 text-xs leading-snug">{line}</p>
                      ))}
                    </div>
                  ) : null}

                  {isHard && props.renderHardFlavor ? props.renderHardFlavor(key) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ⛔ VOLUME, BOUNDED BOTH ENDS BY WHAT THE SLOTS HOLD — and the bounds recompute as the sports
          change, because the slots they are summed from just did.
          ⛔ ONE ROW (Michael, 2026-08-24). Stacked, they read as two separate questions and pushed the
          second toward the fold. ⚠️ `flex-wrap` with a `min-w` basis, not a fixed two-column grid: a
          narrow viewport stacks them rather than crushing both. */}
      {bounds.runMiles || bounds.rideHours ? (
        <div className="flex flex-wrap gap-4">
          {bounds.runMiles ? (
            <div className="flex-1 min-w-[150px]">
              <p className="text-white/80 text-[13px] mb-2">Weekly running to hold</p>
              <div className="flex items-baseline gap-2">
                <input
                  type="number" inputMode="numeric"
                  min={bounds.runMiles.min} max={bounds.runMiles.max}
                  data-testid="run-volume"
                  value={props.runVolume}
                  onChange={(e) => props.onRunVolume(e.target.value)}
                  placeholder={String(Math.round((bounds.runMiles.min + bounds.runMiles.max) / 2))}
                  className="w-20 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-white text-base tabular-nums"
                />
                <span className="text-white/50 text-sm">{props.unit === 'km' ? 'km' : 'mi'}</span>
              </div>
              {runLine ? <p className="text-white/40 text-xs mt-1.5" data-testid="run-bounds">{runLine}</p> : null}
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
                  placeholder={String(bounds.rideHours.max)}
                  className="w-20 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/12 text-white text-base tabular-nums"
                />
                <span className="text-white/50 text-sm">h</span>
              </div>
              {rideLine ? <p className="text-white/40 text-xs mt-1.5" data-testid="ride-bounds">{rideLine}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ⚠️ SAID WHEN IT IS TRUE, not always. Some sessions carry recoveries the source gives no
          duration for, so their totals are floors — and a cap built on a floor is a floor too. */}
      {bounds.isLowerBound ? (
        <p className="text-white/35 text-xs leading-snug">
          Some sessions carry recoveries with no stated length, so these are the shortest the week can be.
        </p>
      ) : null}

      {/**
        * ⛔⛔ THE RATE IS PINNED TO THE BOTTOM, NOT THE TOP — and that is a bug fix, not a preference
        * (Michael's phone screenshot, 2026-08-24 evening).
        *
        * It was `sticky top-0` with an opaque backdrop, directly under the preamble. On a desktop
        * column nothing scrolls and it looked right; on a phone the content is taller than the
        * viewport, so **the moment anything scrolled it covered what passed beneath it** — the
        * preamble first (*"title goes straight to the rate card"*), then the top edge of the first
        * slot row (*"the FIRST hard row is missing its colored sport edge"*). One cause, both
        * defects, and neither could reproduce in a probe that rendered the card without a scroll port.
        *
        * ⛔ THE WORK ORDER ALLOWS EITHER PLACE — *"under the header or above Continue"* — and only one
        * of them can be pinned on a short screen without hiding something. Pinned to the bottom it
        * covers nothing: the content ends above it, and it sits directly over the Continue key, which
        * is where the athlete's eye already is when they decide.
        */}
      <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-1 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent">
        <div className="instrument-card !p-3.5">
          <p className="text-white text-[13px] leading-snug tabular-nums" data-testid="lifting-rate">{rate}</p>
          {split ? <p className="text-white/50 text-[11px] leading-snug mt-1">{split}</p> : null}
        </div>
      </div>
    </div>
  );
}
