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
  /** The level picked on a ride the page prints as a range (p279 day 1), by row key. Absent = the ride's own level. */
  slotLevels?: Partial<Record<SlotKey, number>>;
  onSlotLevel?: (key: SlotKey, level: number) => void;
  /** The version picked on an endurance ride p239 prints two ways, by the row key the pick is stored under. */
  slotVersions?: Partial<Record<SlotKey, string>>;
  onSlotVersion?: (key: SlotKey, version: string) => void;
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
  // ⛔ ONE SET OF VERSION CHIPS PER PICK (2026-09-28): a ride that follows another's version shows it, not the chips.
  const versionOn = new Set<string>();
  const versionAsked = new Set<string>();
  for (const row of week.rows) {
    if (isOff(row) || !row.version) continue;
    if (!versionAsked.has(row.version.key)) { versionAsked.add(row.version.key); versionOn.add(row.key); }
  }
  /** The version this row builds, and the option it names (the server's default until the rider picks). */
  const versionOf = (row: (typeof week.rows)[number]) => {
    if (!row.version) return null;
    const id = props.slotVersions?.[row.version.key] ?? row.version.default;
    return row.version.options.find((o) => o.id === id) ?? row.version.options.find((o) => o.id === row.version!.default) ?? null;
  };

  return (
    <div className="space-y-3">
      {week.sub_line ? <p className="text-white/55 text-sm leading-relaxed">{week.sub_line}</p> : null}
      <div className="space-y-2">
        {week.rows.map((row) => {
          const rowOff = isOff(row);
          const version = rowOff ? null : versionOf(row);
          // ⛔ A VERSION PRINTED AT ONE LENGTH (p239's structured ride) TAKES NO LENGTH CHIPS; its length is shown instead.
          const fixedLabel = version?.fixed_label ?? null;
          const len = rowOff || fixedLabel ? null : row.length;
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
              {/* ⛔ THE VERSION CHIPS (p239's two rides; 2026-09-28) on the first ride that asks; a follower names its pick. */}
              {row.version && version && versionOn.has(row.key) ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {row.version.options.map((o) => (
                    <GalaxyButton
                      key={o.id}
                      shape="chip"
                      variant={version.id === o.id ? 'primary' : 'secondary'}
                      data-testid={`${row.version!.key}-version-${o.id}`}
                      onClick={() => props.onSlotVersion?.(row.version!.key, o.id)}
                    >
                      {o.label}
                    </GalaxyButton>
                  ))}
                </div>
              ) : null}
              {row.version && version && (fixedLabel || !versionOn.has(row.key)) ? (
                <p className="text-white/55 text-xs mt-1.5 leading-relaxed">
                  {/* A follower names its version; "Same length as Day 2." rides here only when no length line carries it. */}
                  {[!versionOn.has(row.key) ? version.label : null, fixedLabel, !versionOn.has(row.key) && fixedLabel ? row.version.same_as : null]
                    .filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {/* ⛔ THE LEVEL CHIPS (p279 day 1, the rider picks 2 or 3) — drawn only when the server sends their words. */}
              {row.level && row.level.label && row.level.options.every((o) => o.label) ? (
                <div className="mt-2.5">
                  <p className="text-white/80 text-[13px] mb-2">{row.level.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {row.level.options.map((o) => (
                      <GalaxyButton
                        key={o.level}
                        shape="chip"
                        variant={(props.slotLevels?.[row.level!.key] ?? row.level!.default) === o.level ? 'primary' : 'secondary'}
                        data-testid={`${row.level!.key}-level-${o.level}`}
                        onClick={() => props.onSlotLevel?.(row.level!.key, o.level)}
                      >
                        {o.label}
                      </GalaxyButton>
                    ))}
                  </div>
                </div>
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
      {week.easy_line ? <p className="text-white/55 text-sm leading-relaxed">{week.easy_line}</p> : null}
    </div>
  );
}
