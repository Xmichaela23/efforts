/**
 * THE ENDURANCE-WEEK SCREEN — one card, replacing "How much" and "High intensity days".
 *
 * ⛔ WHY ONE SCREEN (work order stage 5, Michael's flow 2026-08-24). The two it replaces asked one
 * question in two places: "How much" took the volume and then asked *how many runs* and *how many
 * rides*, and "High intensity days" asked which of them were hard. But **the program owns the
 * count** (8-21 §3c) — the frame has four endurance slots and always four — so the count pickers
 * were asking the athlete to decide something the plan had already decided, and the answers had to
 * be reconciled afterwards. What is genuinely theirs is which SPORT fills each slot, and that is one
 * decision surface.
 *
 * ⛔ THE COUNT PICKERS ARE DELETED, NOT HIDDEN. `runDays` / `rideDays` are now DERIVED from the four
 * slots — a slot set to Run is a run — so the athlete's per-slot answer IS the mix the engine reads.
 * Two sources for one number is the thing that made the old pair contradict each other.
 *
 * ⛔ EVERY NUMBER ON THIS SCREEN COMES FROM THE ENGINE. The caps are `sessionDurationBandSeconds`
 * summed over the slots as currently assigned (stage 1's own function, whose header says it must run
 * on the client for exactly this); the rate line is his two published frame rates. **No endurance-
 * improvement percentage appears anywhere** — the work order forbids it and no source gives one.
 */
import React from 'react';
import {
  ENDURANCE_WEEK_HEADER,
  LONG_SLOT_NOTE,
  SLOT_KEYS,
  SLOT_LABEL,
  SLOT_OPTIONS,
  liftingRateLine,
  upperLowerSplitLine,
  type SlotKey,
  type SlotSport,
} from '@/lib/standing-plan-week-copy';
import { boundsLine, weekBounds } from '@/lib/standing-plan-week-bounds';

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
  /** Rendered inside the open hard-slot card — VO2 vs speed, club session. Survives from `hardday`. */
  renderHardFlavor?: (key: 'hard1' | 'hard2') => React.ReactNode;
};

const SPORT_RGB: Record<SlotSport, string> = { run: '239,138,98', ride: '120,180,255' };

export default function EnduranceWeekCard(props: EnduranceWeekCardProps) {
  const bounds = weekBounds(props.slots, {
    baselines: props.baselines as never,
    easyPaceSecPerMi: props.easyPaceSecPerMi,
  });
  const rate = liftingRateLine(props.slots, props.squat1RM);
  const split = upperLowerSplitLine(props.slots);
  const runLine = boundsLine(bounds.runMiles, props.unit === 'km' ? 'km a week' : 'miles a week');
  const rideLine = boundsLine(bounds.rideHours, 'hours a week');

  return (
    <div className="space-y-4">
      {/* ⛔ MICHAEL'S COPY, VERBATIM (2026-08-24). Rendered line by line so the four-session list
          reads as a list. Do not re-voice it — it is his, and the file it comes from says so. */}
      <div className="space-y-1.5">
        {ENDURANCE_WEEK_HEADER.map((line, i) => (
          <p
            key={i}
            className={i === 0 ? 'text-white/85 text-sm' : 'text-white/60 text-[13px] leading-snug'}
          >
            {line}
          </p>
        ))}
      </div>

      {/* ⛔ THE ONE LIVE NUMBER, AND IT IS A LIFTING RATE. It moves as the slots change, which is the
          whole reason the education sits here rather than in a paragraph nobody re-reads. */}
      <div className="rounded-xl border border-white/12 bg-white/[0.04] p-3">
        <p className="text-white/85 text-sm tabular-nums" data-testid="lifting-rate">{rate}</p>
        {split ? <p className="text-white/50 text-xs mt-1.5 leading-snug">{split}</p> : null}
      </div>

      {/* ⛔ THE FOUR SLOTS. Sport per slot is the only choice on this screen. */}
      <div className="space-y-2">
        {SLOT_KEYS.map((key) => (
          <div key={key} className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-white/85 text-sm">{SLOT_LABEL[key]}</p>
                {key === 'long' ? (
                  <p className="text-white/45 text-xs mt-0.5">{LONG_SLOT_NOTE}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                {SLOT_OPTIONS[key].map((opt) => {
                  const on = props.slots[key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={on}
                      data-testid={`slot-${key}-${opt.value}`}
                      onClick={() => props.onSlotChange(key, opt.value)}
                      className="px-3 py-1.5 rounded-xl text-sm border whitespace-nowrap"
                      style={on
                        ? {
                            borderColor: `rgb(${SPORT_RGB[opt.value]})`,
                            backgroundColor: `rgba(${SPORT_RGB[opt.value]},0.16)`,
                            color: '#fff',
                          }
                        : {
                            borderColor: 'rgba(255,255,255,0.12)',
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            color: 'rgba(255,255,255,0.75)',
                          }}
                    >{opt.label}</button>
                  );
                })}
              </div>
            </div>
            {/* ⛔ THE SESSION-FLAVOUR PICKERS SURVIVE, INSIDE THE HARD SLOT THEY BELONG TO. VO2 vs
                speed, and a club session standing in for the slot, were on the screen this replaces;
                they are a property of THAT session, so they live in its own card rather than under
                the whole page — the containment lesson `hardday` learned three layouts ago. */}
            {(key === 'hard1' || key === 'hard2') && props.renderHardFlavor
              ? <div className="mt-3">{props.renderHardFlavor(key)}</div>
              : null}
          </div>
        ))}
      </div>

      {/* ⛔ VOLUME STAYS, BOUNDED BOTH ENDS BY WHAT THE SLOTS HOLD — and the bounds recompute as the
          sports change, because the slots they are summed from just did. */}
      {bounds.runMiles ? (
        <div>
          <p className="text-white/85 text-sm mb-2">Weekly running to hold</p>
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="numeric" min={bounds.runMiles.min} max={bounds.runMiles.max}
              data-testid="run-volume"
              value={props.runVolume}
              onChange={(e) => props.onRunVolume(e.target.value)}
              placeholder={String(Math.round((bounds.runMiles.min + bounds.runMiles.max) / 2))}
              className="w-24 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
            />
            <span className="text-white/60 text-sm">{props.unit === 'km' ? 'km' : 'mi'}</span>
          </div>
          {runLine ? <p className="text-white/45 text-xs mt-1.5" data-testid="run-bounds">{runLine}</p> : null}
        </div>
      ) : null}

      {bounds.rideHours ? (
        <div>
          <p className="text-white/85 text-sm mb-2">Weekly riding to hold</p>
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="decimal" min={bounds.rideHours.min} max={bounds.rideHours.max}
              step={0.5}
              data-testid="ride-hours"
              value={props.rideHours}
              onChange={(e) => props.onRideHours(e.target.value)}
              placeholder={String(bounds.rideHours.max)}
              className="w-24 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/12 text-white text-sm"
            />
            <span className="text-white/60 text-sm">h</span>
          </div>
          {rideLine ? <p className="text-white/45 text-xs mt-1.5" data-testid="ride-bounds">{rideLine}</p> : null}
        </div>
      ) : null}

      {/* ⚠️ SAID WHEN IT IS TRUE, not always. Some sessions carry recoveries the source gives no
          duration for, so their totals are floors — and a cap built on a floor is a floor too. */}
      {bounds.isLowerBound ? (
        <p className="text-white/40 text-xs leading-snug">
          Some sessions carry recoveries with no stated length, so these are the shortest the week can be.
        </p>
      ) : null}
    </div>
  );
}
