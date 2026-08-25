/**
 * THE HARD SLOT'S SESSION — STATED, NOT ASKED — AND THE ONE CONTROL THAT REMAINS.
 *
 * ⛔ THE CHOICE CONTROL IS GONE (Michael's A4 ruling, 2026-08-24). This card offered top-end versus
 * sustained as buttons and **the athlete never owned that decision**: p246 fixes the two hard slots
 * as different families — `run_mlss` on frame day 1, `run_near_threshold` on day 3 — and the composer
 * builds those whatever the card writes. A button over a settled decision means the screen and the
 * plan disagree the moment it is tapped, which is the defect this file has now been rebuilt around
 * three times.
 *
 * ⛔ WHAT IS STILL A REAL CONTROL: **a club session, because it REPLACES the slot** (his own Crit
 * rule, work order §club) — and the SPORT, which lives on the row above this component. Everything
 * else on this card is a read-out.
 *
 * ⚠️ WITHIN-FAMILY VARIANT SELECTION STAYS THE ENGINE'S (gap #5, deferred by the same ruling). Which
 * VO2 shape a hard run takes is not asked here or anywhere else.
 *
 * ⚠️ ITS OWN FILE so the wizard and a browser probe can render the SAME component. Sixty lines of
 * JSX inline in a six-thousand-line file is also how the screen it came from lost three layouts.
 */
import React from 'react';
import { Check } from 'lucide-react';
import { getDisciplineColor } from '@/lib/context-utils';
import { HARD_SLOT_FACT_NOTE, slotFamilyFact, slotVariantOptions, VARIANT_BODY, type HardSlotKey, type HardSlotValue } from '@/lib/hard-slot-choices';

export type HardSlotChoicesProps = {
  /** The slot's sport, as the endurance screen has it. */
  sport: 'run' | 'ride';
  value: HardSlotValue;
  onChange: (patch: HardSlotValue) => void;
  /** ⛔ `hard1` / `hard2` — the frame's two hard slots are POSITIONAL and carry different sessions. */
  slotKey: HardSlotKey;
};

export default function HardSlotChoices(props: HardSlotChoicesProps) {
  const club = props.value.ownership === 'club';
  const color = getDisciplineColor(props.sport === 'ride' ? 'bike' : 'run');
  const fact = slotFamilyFact(props.slotKey, props.sport);

  return (
    <div className="space-y-1.5">
      {/* ⛔ THE SESSION, AS A FACT. No border colour, no pressed state, no tap target — a panel that
          looked pressable would be the control this ruling removed, wearing different paint.
          ⚠️ DIMMED WHILE A CLUB SESSION HOLDS THE SLOT, not hidden: the athlete should be able to see
          what they are replacing, and a row that vanishes on tap is a row they cannot compare. */}
      {/* ⛔ UNBOXED (Michael, 2026-08-24 evening) — same ruling as the tax lines: boxed, the fact
          read as the FIRST OPTION above the real choices, so "Engine's pick" looked second. Plain
          text — information looks like information, and the first bordered row below is the first
          choice. */}
      {fact && (
        <div
          data-testid={`hard-${props.slotKey}-fact`}
          className="px-1 py-1"
          style={club ? { opacity: 0.45 } : undefined}
        >
          <span className="block text-white/90 text-sm">{fact.title}</span>
          <span className="block text-white/50 text-xs leading-snug mt-0.5">{fact.body}</span>
          <span className="block text-white/30 text-[10px] mt-1">{fact.cite}</span>
        </div>
      )}
      {/* ⛔ THE VARIANT IS A CHOICE (Michael, 2026-08-24 — "missing are the speed drills we had").
          The family is the frame's fact above; WHICH of the family's own page-cited workouts fills
          it is the athlete's. Options come from the library's archetypes — one list, no copy.
          "Engine's pick" is the default and rotates week to week. */}
      {!club && (() => {
        const variants = slotVariantOptions(props.slotKey, props.sport);
        if (variants.length < 2) return null;
        return (
          <div className="space-y-1.5" data-testid={`hard-${props.slotKey}-variants`}>
            {[{ id: '', label: "Engine's pick — rotates week to week" }, ...variants].map((v) => {
              const on = (props.value.archetype ?? '') === v.id;
              return (
                <button
                  key={v.id || 'engine'}
                  type="button"
                  aria-pressed={on}
                  data-testid={`hard-${props.slotKey}-variant-${v.id || 'engine'}`}
                  onClick={() => props.onChange({ archetype: v.id || undefined })}
                  className="w-full text-left px-2.5 py-2 rounded-xl border text-sm"
                  style={on
                    ? { borderColor: color, backgroundColor: `${color}1F`, color: '#fff' }
                    : { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.70)' }}
                >
                  <span className="block">{v.label}</span>
                  {VARIANT_BODY[v.id] ? (
                    <span className="block text-xs mt-0.5" style={{ color: on ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.45)' }}>
                      {VARIANT_BODY[v.id]}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })()}
      <span className="block text-white/35 text-[11px] leading-snug px-0.5">{HARD_SLOT_FACT_NOTE}</span>
      {/* ⛔ A CLUB SESSION REPLACES A SLOT, NEVER ADDS ONE (work order stage 5, his own Crit rule).
          Same control the card has always carried, same `ownership` field.
          ⚠️ UN-CHECKING RETURNS THE SLOT TO `prescribed` AND NOTHING ELSE — the role and goal are the
          frame's now and `syncHardDays` writes them, so sending them from here would be a second
          owner of a fact that has one. */}
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
