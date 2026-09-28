/**
 * ⛔ THE RIDE + STRENGTH WEEK — SHAPED LIKE THE RUNS SCREEN (Michael, 2026-09-27).
 *
 * One row per ride — a day's two workouts are one ride, named "{first}, then {second}" — length chips on the long ride and
 * on the midweek easy ride (Friday's follows Tuesday's, p281), and a switch on each optional ride (p278's Day 2 easy ride).
 * It replaced the six/seven ride-count chips.
 * ⛔ THE SWITCH SITS ON THE OPTIONAL RIDE'S OWN ROW (Michael, 2026-09-28), so the card itself says it is optional. Switched
 * off, the row stays with its name, its line and the switch, and drops its length; the chips move to the next ride held
 * to that length.
 * ⛔ EVERYTHING ON THIS CARD IS THE SERVER'S (`ride_strength_week`): the rows, the chips, the default and every line.
 * The card renders them and holds no words of its own. See `RunStrengthWeekCard` for the layout it follows.
 */
import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { Switch } from '@/components/ui/switch';
import type { EnduranceIntakeReadout } from '@/lib/builder-readout';
import type { SlotKey } from '@/lib/standing-plan-week-copy';

type Props = {
  readout: EnduranceIntakeReadout['ride_strength_week'];
  /** The picked lengths, in minutes, by the row key each pick is stored under (`row.length.key`). */
  slotMinutes?: Partial<Record<SlotKey, number>>;
  onSlotMinutes: (key: SlotKey, minutes: number) => void;
  /** The optional rides switched off (screen row keys). Absent = all on, the week as printed. */
  slotsOff?: SlotKey[];
  onSlotOn: (key: SlotKey, on: boolean) => void;
};

export default function RideStrengthWeekCard(props: Props) {
  const rideColor = getDisciplineColor('ride');
  const week = props.readout;
  if (!week) return null;
  const off = new Set(props.slotsOff ?? []);
  const isOff = (row: (typeof week.rows)[number]) => row.optional && off.has(row.key);
  // ⛔ ONE SET OF CHIPS PER LENGTH: rides held to one length (p281's Tuesday and Friday) share a pick, shown on the first
  // of them still in the week — Friday's row when Day 2 is switched off.
  const chipsOn = new Set<string>();
  const asked = new Set<string>();
  for (const row of week.rows) {
    if (isOff(row)) continue;
    if (row.length && !asked.has(row.length.key)) { asked.add(row.length.key); chipsOn.add(row.key); }
  }

  return (
    <div className="space-y-3">
      <p className="text-white/55 text-sm leading-relaxed">{week.sub_line}</p>
      <div className="space-y-2">
        {week.rows.map((row) => {
          const rowOff = isOff(row);
          const len = rowOff ? null : row.length;
          const picked = len ? props.slotMinutes?.[len.key] : undefined;
          return (
            <div
              key={row.key}
              data-testid={`ride-row-${row.key}`}
              className="rounded-xl border border-white/12 bg-white/[0.02] p-3 border-l-2"
              style={{ borderLeftColor: rideColor }}
            >
              {row.optional ? (
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className={rowOff ? 'text-white/55 text-[15px]' : 'text-white text-[15px]'}>{row.line}</p>
                    {row.optional_line ? <p className="text-white/55 text-xs mt-1 leading-relaxed">{row.optional_line}</p> : null}
                  </div>
                  <Switch
                    data-testid={`ride-optional-${row.key}`}
                    checked={!rowOff}
                    onCheckedChange={(on) => props.onSlotOn(row.key, on)}
                  />
                </div>
              ) : (
                <p className="text-white text-[15px]">{row.line}</p>
              )}
              {len && picked != null && len.options.includes(picked) ? (
                <p className="text-white/55 text-xs mt-1 leading-relaxed">
                  {/* "Same length as Day 2." while Day 2 carries the chips; on its own when it has them. */}
                  {[len.labels[String(picked)], !chipsOn.has(row.key) ? len.same_as : null].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {len && chipsOn.has(row.key) && len.options.length > 0 ? (
                <div className="mt-2.5">
                  <p className="text-white/80 text-[13px] mb-2">{week.length_label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {len.options.map((m) => (
                      <GalaxyButton
                        key={m}
                        shape="chip"
                        variant={picked === m ? 'primary' : 'secondary'}
                        data-testid={`${len.key}-ride-${m}`}
                        onClick={() => props.onSlotMinutes(len.key, m)}
                      >
                        {len.labels[String(m)]}
                      </GalaxyButton>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-white/55 text-sm leading-relaxed">{week.easy_line}</p>
    </div>
  );
}
