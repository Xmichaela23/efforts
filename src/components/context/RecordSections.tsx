/**
 * The Record lens's sport panel: one sport at a time, its totals and its bests together
 * (2026-09-20, revised the same day after Michael saw it beside his Strava My Stats pages).
 *
 * ⛔ ONE SECTION PER SPORT. The first build had a Run/Ride/Swim switch over the totals and then
 * standalone Running and Cycling cards below it, so tapping "Ride" changed the top of the screen and
 * left a Running card sitting under it. Strava's My Stats — the screen he is comparing against —
 * puts a sport's totals and that sport's bests in one place, and switching sport switches both. Race
 * results and Strength stay their own sections underneath, because they are not per-sport.
 *
 * ⛔ IT PRINTS. Every number arrives from `athletic-record` already formatted — miles or kilometres,
 * hours, watts, a clock time, a month, a year's totals — because the athlete's unit preference, the
 * rounding and the per-year sums live on the server (`_shared/athletic-record/`). Nothing here ranks,
 * sums, converts or filters. The year control PICKS a year the server already computed; it never
 * works one out. If a figure the screen needs is missing, it is added to the payload.
 *
 * ⛔ NO BADGES, NO MEDALS, NO PR FLAGS (Michael, 2026-09-19). The three fastest print as three lines,
 * fastest at the top, each with its month. There is no "1", no "2", no "3" and no first-place mark —
 * a rank badge is a medal by another name, and this screen's frame is form and slow gain under
 * endurance stress, not a podium.
 *
 * ⛔ EVERY VISIBLE WORD IS APPROVED COPY (Michael, 2026-09-20) and this file adds none. The three
 * explainer sublines a draft carried were CUT by him, not lost — see the comments where they were.
 */
import React, { useState } from 'react';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { SPORT_COLORS, sportTint } from '@/lib/context-utils';

type Entry = { value: number; workout_id: string; date: string; name: string | null; rank: number; display: string; date_display: string | null };
type Book = Record<string, Entry[]>;
type SportTotals = { activities_display: string; distance_display: string; time_display: string; elevation_display: string };
type PeriodTotals = {
  last_4_weeks: SportTotals;
  by_year: Record<string, SportTotals>;
  years: string[];
  all_time: SportTotals;
  since_display: string | null;
};

export type RecordStandings = {
  run: { distances: Book; longest: Entry[] };
  ride: { distances: Book; power: Book; longest: Entry[]; biggest_climb: Entry[] };
};
export type RecordTotals = Record<string, PeriodTotals>;
export type RecordFtp = { watts: number; date: string; date_display?: string | null } | null;

/**
 * ⚠️ THE ORDER IS THE FIELD'S, NOT OURS, and the keys are the server's. Strava lists its running
 * best efforts shortest to longest and its ride distances the same way; printing them in any other
 * order would make the screen disagree with every app the athlete already reads.
 * The LABELS are English for the same keys — the unit inside a figure follows the athlete, the name
 * of the distance does not.
 *
 * ⛔ EVERY LABEL IN THE THREE LISTS BELOW IS APPROVED COPY (Michael, 2026-09-20), down to the
 * spelling: "1/2 mile" not "Half mile", "5K" not "5k", "5 sec" not "5s", "1 hour" not "60 min".
 * Changing one is a copy change and goes back to him first, the same as a heading. Do not tidy them.
 */
const RUN_DISTANCES: ReadonlyArray<[string, string]> = [
  ['400m', '400 m'], ['half_mile', '1/2 mile'], ['1km', '1 km'], ['1mi', '1 mile'], ['2mi', '2 miles'],
  ['5k', '5K'], ['10k', '10K'], ['15k', '15K'], ['10mi', '10 miles'], ['20k', '20K'],
  ['half_marathon', 'Half marathon'], ['30k', '30K'], ['marathon', 'Marathon'], ['50k', '50K'],
];

const RIDE_DISTANCES: ReadonlyArray<[string, string]> = [
  ['5mi', '5 miles'], ['10k', '10K'], ['10mi', '10 miles'], ['20k', '20K'], ['30k', '30K'],
  ['40k', '40K'], ['50k', '50K'], ['80k', '80K'], ['50mi', '50 miles'], ['90k', '90K'],
  ['100k', '100K'], ['100mi', '100 miles'], ['180k', '180K'],
];

const POWER_DURATIONS: ReadonlyArray<[string, string]> = [
  ['5s', '5 sec'], ['15s', '15 sec'], ['30s', '30 sec'], ['1min', '1 min'], ['2min', '2 min'],
  ['3min', '3 min'], ['5min', '5 min'], ['8min', '8 min'], ['10min', '10 min'], ['12min', '12 min'],
  ['15min', '15 min'], ['20min', '20 min'], ['30min', '30 min'], ['45min', '45 min'],
  ['60min', '1 hour'], ['120min', '2 hours'],
];

/**
 * ⛔ CARD, BUTTON AND TYPE COME FROM `DESIGN_GUIDELINES.md`, NOT FROM EYEBALLING A SCREENSHOT
 * (Michael, 2026-09-20: "the pills aren't following design rules … fonts follow our design rules
 * too"). Cards & Containers: `bg-white/[0.05]`–`[0.08]`, `backdrop-blur-lg`, `border-white/25`–`/30`,
 * `rounded-2xl`, inset + outer shadow. Typography: Inter, light (300) body, normal (400) emphasis,
 * semibold (600) headings, `tracking-wide` on buttons and navigation ONLY, normal for body text.
 */
const CARD = 'p-4 rounded-2xl bg-white/[0.05] backdrop-blur-lg border border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]';
const HEADING = 'text-sm font-semibold text-white';
const GROUP = 'text-xs font-normal text-white/70';
const ROW_LABEL = 'font-light text-gray-300';
const ROW_VALUE = 'font-normal tabular-nums text-white';
const ROW_EMPTY = 'font-light tabular-nums text-white/30';
const ROW_DATE = 'font-light text-white/40 text-xs ml-2';

/**
 * ⛔ SPORT COLOUR COMES FROM `SPORT_COLORS` (`src/lib/context-utils.ts`), THE ONE SOURCE.
 *
 * Its own rule, quoted there: "like LEDs on a 1980s lab instrument — always softly on, brighter when
 * active or completed, never flat, never neon." So an unselected pill is NOT grey — it carries its
 * own hue softly and selecting it turns that hue up. A grey rest state would be the "flat" the rule
 * forbids; inventing a hue here, or borrowing the status green that object deliberately excludes,
 * would put a second answer to "which discipline is this" into the app.
 */
const SPORTS: ReadonlyArray<[string, string, string]> = [
  ['run', 'Run', SPORT_COLORS.run],
  ['ride', 'Ride', SPORT_COLORS.ride],
  ['swim', 'Swim', SPORT_COLORS.swim],
];

/**
 * One distance, with up to three times under it. ⚠️ The three are STACKED, not laid side by side: at
 * 200% zoom three clock times and three months cannot share a phone row without one being cut off,
 * and a record the athlete cannot read is not a record (WCAG 2.2 SC 1.4.4).
 */
function StandingRow({ label, entries, onOpen }: { label: string; entries: Entry[] | undefined; onOpen: (id: string) => void }) {
  if (!entries?.length) {
    return (
      <li className="flex justify-between gap-3 py-1">
        <span className={ROW_LABEL}>{label}</span>
        <span className={ROW_EMPTY}>—</span>
      </li>
    );
  }
  return (
    <li className="py-1">
      <div className="flex justify-between gap-3">
        <span className={ROW_LABEL}>{label}</span>
        <div className="text-right">
          {entries.map((e) => (
            <button
              key={e.workout_id}
              type="button"
              onClick={() => onOpen(e.workout_id)}
              className="block w-full text-right transition-all duration-300 hover:opacity-80"
            >
              <span className={ROW_VALUE}>{e.display}</span>
              {e.date_display && <span className={ROW_DATE}>{e.date_display}</span>}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}

function SingleRow({ label, value, date }: { label: string; value: string | null; date?: string | null }) {
  return (
    <li className="flex justify-between gap-3 py-1">
      <span className={ROW_LABEL}>{label}</span>
      <span className={ROW_VALUE}>
        {value ?? <span className={ROW_EMPTY}>—</span>}
        {value && date && <span className={ROW_DATE}>{date}</span>}
      </span>
    </li>
  );
}

const first = (entries: Entry[] | undefined) => entries?.[0] ?? null;

const TOTAL_ROWS: ReadonlyArray<[string, keyof SportTotals]> = [
  ['Activities', 'activities_display'],
  ['Distance', 'distance_display'],
  ['Time', 'time_display'],
  ['Elevation', 'elevation_display'],
];

function TotalsColumn({ title, note, data, control }: {
  title: string;
  note?: string | null;
  data: SportTotals | undefined;
  control?: React.ReactNode;
}) {
  return (
    <div>
      {/* ⚠️ THE CONTROL REPLACES THE HEADING, it does not sit beside it. Strava's middle block IS the
          year control; printing "2026" as a heading and a picker showing "2026" next to it says the
          same thing twice. With one year there is nothing to pick, so it is plain text. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {control ?? <span className={GROUP}>{title}</span>}
        {note && <span className="text-[11px] font-light text-white/40">{note}</span>}
      </div>
      <ul className="text-sm mt-1">
        {TOTAL_ROWS.map(([label, key]) => (
          <li key={label} className="flex justify-between gap-3 py-0.5">
            <span className={ROW_LABEL}>{label}</span>
            <span className={ROW_VALUE}>{data ? data[key] : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The whole per-sport panel: the switch, then that sport's totals and that sport's bests.
 *
 * ⚠️ SWIM HAS NO BESTS SECTION, and that is not a bug. Swim records are parked — the stored pool
 * lengths carry no start time, so Garmin's "continuous swimming" rule cannot be measured
 * (docs/WORKORDER-record-efforts-2026-09-19.md). Swim totals are real and print here; there is no
 * empty bests block waiting to be filled.
 */
export function RecordSportPanel({ standings, totals, ftp, onOpen }: {
  standings: RecordStandings | null;
  totals: RecordTotals | null;
  ftp: RecordFtp;
  onOpen: (id: string) => void;
}) {
  const [sport, setSport] = useState('run');
  const [year, setYear] = useState<string | null>(null);
  if (!totals) return null;

  const tint = SPORTS.find(([k]) => k === sport)?.[2] ?? SPORT_COLORS.run;
  const period = totals[sport];
  const years = period?.years ?? [];
  // The newest year unless the athlete has picked one that this sport actually has.
  const shownYear = year && years.includes(year) ? year : years[0] ?? null;
  const run = standings?.run;
  const ride = standings?.ride;

  return (
    <div className={CARD}>
      {/*
        ⛔ THE PILLS FOLLOW `DESIGN_GUIDELINES.md` → Buttons & Interactive Elements: `bg-white/[0.08]`,
        `border-2`, `shadow-lg`, `tracking-wide`, `transition-all duration-300`. GalaxyButton still
        owns the SHAPE (`rounded-full`, the one chip in the app); the weight and the sport tint come
        from the guidelines on top of it. ⚠️ Wraps rather than truncates (SC 1.4.4).
      */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SPORTS.map(([key, label, color]) => {
          const active = sport === key;
          return (
            <GalaxyButton
              key={key}
              shape="chip"
              variant="secondary"
              onClick={() => setSport(key)}
              aria-current={active}
              className="whitespace-nowrap border-2 shadow-lg tracking-wide transition-all duration-300"
              style={{
                backgroundColor: active ? `${color}24` : 'rgba(255,255,255,0.08)',
                borderColor: active ? `${color}B3` : `${color}40`,
                color: active ? color : 'rgba(255,255,255,0.70)',
              }}
            >
              {label}
            </GalaxyButton>
          );
        })}
      </div>

      <div className="space-y-5">
        <div>
          <h4 className={HEADING} style={{ color: tint }}>Totals</h4>
          {/*
            ⚠️ NOT A <table>. Three columns of four figures do not fit a phone at 200% zoom, and a
            table can only solve that by scrolling sideways or cutting a number off. Blocks reflow.
          */}
          <div className="space-y-4 mt-2">
            <TotalsColumn title="Last 4 weeks (avg)" data={period?.last_4_weeks} />
            {shownYear && (
              <TotalsColumn
                title={shownYear}
                data={period?.by_year[shownYear]}
                control={
                  /*
                    ⛔ THE CONTROL ONLY PICKS. Every year's numbers were summed on the server and only
                    the years the athlete has this sport's data for are here, so the control can never
                    offer a year that prints zeroes. One year and it is not a control at all.
                  */
                  years.length > 1 ? (
                    <select
                      value={shownYear}
                      onChange={(e) => setYear(e.target.value)}
                      aria-label={`Year: ${shownYear}`}
                      className="bg-white/[0.08] border-2 rounded-full px-2 py-0.5 text-[11px] font-normal tracking-wide text-white shadow-lg transition-all duration-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                      style={{ borderColor: `${tint}40`, color: tint }}
                    >
                      {years.map((y) => (
                        <option key={y} value={y} className="bg-zinc-900 text-white">{y}</option>
                      ))}
                    </select>
                  ) : null
                }
              />
            )}
            <TotalsColumn title="All time" note={period?.since_display ?? null} data={period?.all_time} />
          </div>
        </div>

        {sport === 'run' && (
          <div>
            {/*
              ⛔ NO EXPLAINER LINE UNDER THIS HEADING, and that is a ruling, not an omission (Michael,
              2026-09-20). A draft carried "Your fastest time at each distance, from anywhere inside a
              run." to keep the marathon here from reading as a contradiction with the chip time under
              Race results. He cut it, and every other subline with it: Strava and Garmin print none,
              and the instinct to explain the most common screen in training apps is where the padding
              comes from. The headings carry it. ⚠️ Do not re-add a shorter version.
            */}
            <h4 className={HEADING} style={{ color: tint }}>Running</h4>
            <ul className="text-sm mt-2">
              {RUN_DISTANCES.map(([key, label]) => (
                <StandingRow key={key} label={label} entries={run?.distances[key]} onOpen={onOpen} />
              ))}
              <SingleRow label="Longest run" value={first(run?.longest)?.display ?? null} date={first(run?.longest)?.date_display} />
            </ul>
          </div>
        )}

        {sport === 'ride' && (
          <div className="space-y-4">
            <h4 className={HEADING} style={{ color: tint }}>Cycling</h4>
            {Object.keys(ride?.power ?? {}).length > 0 && (
              <div>
                {/* The cut subline here read "The highest average power you held for each length of
                    time." Same ruling as Running above. */}
                <p className={GROUP}>Best power</p>
                <ul className="text-sm mt-1">
                  {POWER_DURATIONS.map(([key, label]) => (
                    <StandingRow key={key} label={label} entries={ride?.power[key]} onOpen={onOpen} />
                  ))}
                </ul>
              </div>
            )}
            {Object.keys(ride?.distances ?? {}).length > 0 && (
              <div>
                <p className={GROUP}>Fastest distances</p>
                <ul className="text-sm mt-1">
                  {RIDE_DISTANCES.map(([key, label]) => (
                    <StandingRow key={key} label={label} entries={ride?.distances[key]} onOpen={onOpen} />
                  ))}
                </ul>
              </div>
            )}
            <ul className="text-sm">
              <SingleRow label="Longest ride" value={first(ride?.longest)?.display ?? null} date={first(ride?.longest)?.date_display} />
              <SingleRow label="Biggest climb" value={first(ride?.biggest_climb)?.display ?? null} date={first(ride?.biggest_climb)?.date_display} />
              <SingleRow label="FTP" value={ftp ? `${ftp.watts} W` : null} date={ftp?.date_display ? `best, ${ftp.date_display}` : null} />
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
