/**
 * THE HARD SLOT'S SESSION CHOICES — what a Hard 1 / Hard 2 slot actually is.
 *
 * ⛔ RESTORED, NOT REBUILT (Michael's screenshot review, 2026-08-24). The endurance-week screen
 * shipped with the sport toggle and nothing under it, so picking Ride on a hard slot revealed no
 * session at all. **The plumbing was never the problem:** `state.hardDays` already holds
 * `{discipline, role, goal, ownership}` per slot and `create-goal` already forwards it. What was
 * missing was the buttons, and these write the same fields the old "High intensity days" card wrote,
 * off the same option tables (`singleSlotOptions`, `RUN_GROUND_OPTIONS`).
 *
 * ⚠️ ITS OWN FILE so the wizard and a browser probe can render the SAME component. Sixty lines of
 * JSX inline in a six-thousand-line file is also how the screen it came from lost three layouts.
 */
import React from 'react';
import { Check } from 'lucide-react';
import { getDisciplineColor } from '@/lib/context-utils';
import { hardSlotOptions, type HardSlotValue } from '@/lib/hard-slot-choices';

export type HardSlotChoicesProps = {
  /** The slot's sport, as the endurance screen has it. */
  sport: 'run' | 'ride';
  value: HardSlotValue;
  onChange: (patch: HardSlotValue) => void;
  /** For the test ids — `hard1` / `hard2`. */
  slotKey: string;
};

export default function HardSlotChoices(props: HardSlotChoicesProps) {
  const club = props.value.ownership === 'club';
  const color = getDisciplineColor(props.sport === 'ride' ? 'bike' : 'run');
  const opts = hardSlotOptions(props.sport);
  /**
   * ⚠️ AN OPTION IS CHOSEN WHEN BOTH FIELDS MATCH. Matching on `role` alone would light two run
   * options at once — VO2 and speed are both `intensity`, and the `goal` is the whole difference.
   */
  const chosen = (o: { role: string; goal?: string }) =>
    !club && (o.goal ? props.value.goal === o.goal && props.value.role === o.role
      : props.value.role === o.role && !props.value.goal);

  return (
    <div className="space-y-1.5">
      {opts.map((o) => {
        const on = chosen(o);
        return (
          <button
            key={o.id}
            type="button"
            data-testid={`hard-${props.slotKey}-${o.id}`}
            aria-pressed={on}
            // ⚠️ `goal` IS WRITTEN EVERY TIME, including as `undefined` — leaving a stale one on a
            // threshold slot is how the composer ends up hearing "speed" for a session nobody picked.
            onClick={() => props.onChange({ ownership: 'prescribed', role: o.role, goal: o.goal })}
            className="w-full text-left px-2.5 py-2 rounded-xl border"
            style={on
              ? { borderColor: color, backgroundColor: `${color}29` }
              : { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)' }}
          >
            <span className="block text-white/90 text-sm">{o.title}</span>
            <span className="block text-white/50 text-xs leading-snug mt-0.5">{o.body}</span>
          </button>
        );
      })}
      {/* ⛔ A CLUB SESSION REPLACES A SLOT, NEVER ADDS ONE (work order stage 5, his own Crit rule).
          Same control the old card carried, same `ownership` field. */}
      <button
        type="button"
        data-testid={`hard-${props.slotKey}-club`}
        aria-pressed={club}
        onClick={() => props.onChange({ ownership: club ? 'prescribed' : 'club' })}
        className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-white/12 bg-white/[0.03]"
      >
        <span
          className="shrink-0 w-[20px] h-[20px] rounded-md border-2 grid place-items-center"
          style={{
            borderColor: club ? color : 'rgba(255,255,255,0.35)',
            backgroundColor: club ? `${color}4D` : 'transparent',
          }}
        >
          {club && <Check className="h-3.5 w-3.5 text-white" />}
        </span>
        <span className="text-white/85 text-sm leading-snug">A club session I already attend</span>
      </button>
    </div>
  );
}
