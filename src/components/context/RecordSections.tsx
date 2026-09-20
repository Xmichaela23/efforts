/**
 * The Record lens's new sections: Totals, Running and Cycling (2026-09-20, stage 3).
 *
 * ⛔ IT PRINTS. Every number arrives from `athletic-record` already formatted — miles or kilometres,
 * hours, watts, a clock time, a month — because the athlete's unit preference and the rounding live
 * on the server (`_shared/athletic-record/display.ts`). Nothing here ranks, sums or converts. If a
 * figure the screen needs is missing, it is added to the payload, never worked out in this file.
 *
 * ⛔ NO BADGES, NO MEDALS, NO PR FLAGS (Michael, 2026-09-19). The three fastest print as three lines,
 * fastest at the top, each with its month. There is no "1", no "2", no "3" and no first-place mark —
 * a rank badge is a medal by another name, and this screen's frame is form and slow gain under
 * endurance stress, not a podium.
 */
import React, { useState } from 'react';
import { GalaxyButton } from '@/components/ui/galaxy-button';

type Entry = { value: number; workout_id: string; date: string; name: string | null; rank: number; display: string; date_display: string | null };
type Book = Record<string, Entry[]>;
type SportTotals = { activities_display: string; distance_display: string; time_display: string; elevation_display: string };
type PeriodTotals = { last_4_weeks: SportTotals; this_year: SportTotals; all_time: SportTotals; since_display: string | null };

export type RecordStandings = {
  run: { distances: Book; longest: Entry[] };
  ride: { distances: Book; power: Book; longest: Entry[]; biggest_climb: Entry[] };
};
export type RecordTotals = Record<string, PeriodTotals>;

/**
 * ⚠️ THE ORDER IS THE FIELD'S, NOT OURS, and the keys are the server's. Strava lists its running
 * best efforts shortest to longest and its ride distances the same way; printing them in any other
 * order would make the screen disagree with every app the athlete already reads.
 * The LABELS are English for the same keys — the unit inside a figure follows the athlete, the name
 * of the distance does not.
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

const card = 'p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]';
const heading = 'text-sm font-semibold text-white/90 tracking-wide';
const subhead = 'text-xs text-white/45 leading-relaxed mt-1';

/**
 * One distance, with up to three times under it. ⚠️ The three are STACKED, not laid side by side: at
 * 200% zoom three clock times and three months cannot share a phone row without one being cut off,
 * and a record the athlete cannot read is not a record (WCAG 2.2 SC 1.4.4).
 */
function StandingRow({ label, entries, onOpen }: { label: string; entries: Entry[] | undefined; onOpen: (id: string) => void }) {
  if (!entries?.length) {
    return (
      <li className="flex justify-between gap-3 py-1">
        <span className="text-white/50">{label}</span>
        <span className="text-white/30 tabular-nums">—</span>
      </li>
    );
  }
  return (
    <li className="py-1">
      <div className="flex justify-between gap-3">
        <span className="text-white/50">{label}</span>
        <div className="text-right">
          {entries.map((e) => (
            <button
              key={e.workout_id}
              type="button"
              onClick={() => onOpen(e.workout_id)}
              className="block w-full text-right hover:text-white transition-colors"
            >
              <span className="tabular-nums">{e.display}</span>
              {e.date_display && <span className="text-white/35 text-xs ml-2">{e.date_display}</span>}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}

function SingleRow({ label, entries }: { label: string; entries: Entry[] | undefined }) {
  const best = entries?.[0];
  return (
    <li className="flex justify-between gap-3 py-1">
      <span className="text-white/50">{label}</span>
      <span className="tabular-nums">
        {best ? best.display : <span className="text-white/30">—</span>}
        {best?.date_display && <span className="text-white/35 text-xs ml-2">{best.date_display}</span>}
      </span>
    </li>
  );
}

const SPORTS: ReadonlyArray<[string, string]> = [['run', 'Run'], ['ride', 'Ride'], ['swim', 'Swim']];

export function RecordTotalsCard({ totals }: { totals: RecordTotals | null }) {
  const [sport, setSport] = useState('run');
  const p = totals?.[sport];
  if (!totals) return null;

  const COLUMNS: ReadonlyArray<[string, string | null, SportTotals | undefined]> = [
    ['Last 4 weeks', 'a typical week', p?.last_4_weeks],
    ['This year', null, p?.this_year],
    ['All time', p?.since_display ?? null, p?.all_time],
  ];
  const ROWS: ReadonlyArray<[string, keyof SportTotals]> = [
    ['Activities', 'activities_display'],
    ['Distance', 'distance_display'],
    ['Time', 'time_display'],
    ['Elevation', 'elevation_display'],
  ];

  return (
    <div className={card}>
      <h3 className={heading}>Totals</h3>

      {/* ⚠️ Wraps rather than truncates, same rule as the lens tabs above it (SC 1.4.4). */}
      <div className="flex flex-wrap gap-2 mt-3 mb-4">
        {SPORTS.map(([key, label]) => (
          <GalaxyButton
            key={key}
            shape="chip"
            variant={sport === key ? 'primary' : 'secondary'}
            onClick={() => setSport(key)}
            aria-current={sport === key}
            className="whitespace-nowrap"
          >
            {label}
          </GalaxyButton>
        ))}
      </div>

      {/*
        ⚠️ NOT A <table>. Three columns of four figures do not fit a phone at 200% zoom, and a table
        can only solve that by scrolling sideways or cutting a number off. Stacked blocks reflow.
      */}
      <div className="space-y-4">
        {COLUMNS.map(([title, note, data]) => (
          <div key={title}>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-white/70">{title}</span>
              {note && <span className="text-[11px] text-white/35">{note}</span>}
            </div>
            <ul className="text-sm text-white/80 mt-1">
              {ROWS.map(([label, key]) => (
                <li key={label} className="flex justify-between gap-3 py-0.5">
                  <span className="text-white/50">{label}</span>
                  <span className="tabular-nums">{data ? data[key] : '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecordRunningCard({ standings, onOpen }: { standings: RecordStandings | null; onOpen: (id: string) => void }) {
  const run = standings?.run;
  const anything = run && (Object.keys(run.distances).length > 0 || run.longest.length > 0);
  return (
    <div className={card}>
      <h3 className={heading}>Running</h3>
      {/*
        ⛔ THIS LINE IS HOW THE TWO MARATHON TIMES STOP LOOKING LIKE A DISAGREEMENT. The race card
        below prints the chip time, gun to line; this prints the fastest 26.2 anywhere inside a run,
        and it is normally the quicker of the two. Each section says what it measures, once. A note
        pointing from one to the other would create the contradiction it was trying to explain.
      */}
      <p className={subhead}>Your fastest time at each distance, from anywhere inside a run.</p>
      {!anything ? (
        <p className="text-sm text-white/45 leading-relaxed mt-3">No runs with a recorded track yet.</p>
      ) : (
        <ul className="text-sm text-white/80 mt-3">
          {RUN_DISTANCES.map(([key, label]) => (
            <StandingRow key={key} label={label} entries={run?.distances[key]} onOpen={onOpen} />
          ))}
          <SingleRow label="Longest run" entries={run?.longest} />
        </ul>
      )}
    </div>
  );
}

export function RecordCyclingCard({ standings, ftp, onOpen }: {
  standings: RecordStandings | null;
  ftp: { watts: number; date: string } | null;
  onOpen: (id: string) => void;
}) {
  const ride = standings?.ride;
  const hasPower = ride && Object.keys(ride.power).length > 0;
  const hasDistances = ride && Object.keys(ride.distances).length > 0;
  return (
    <div className={card}>
      <h3 className={heading}>Cycling</h3>
      <div className="space-y-4 mt-3">
        {hasPower && (
          <div>
            <p className="text-xs font-semibold text-white/70">Best power</p>
            <p className={subhead}>The highest average power you held for each length of time.</p>
            <ul className="text-sm text-white/80 mt-2">
              {POWER_DURATIONS.map(([key, label]) => (
                <StandingRow key={key} label={label} entries={ride?.power[key]} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        )}
        {hasDistances && (
          <div>
            <p className="text-xs font-semibold text-white/70">Fastest distances</p>
            <ul className="text-sm text-white/80 mt-2">
              {RIDE_DISTANCES.map(([key, label]) => (
                <StandingRow key={key} label={label} entries={ride?.distances[key]} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        )}
        <ul className="text-sm text-white/80">
          <SingleRow label="Longest ride" entries={ride?.longest} />
          <SingleRow label="Biggest climb" entries={ride?.biggest_climb} />
          <li className="flex justify-between gap-3 py-1">
            <span className="text-white/50">FTP</span>
            <span className="tabular-nums">
              {ftp ? `${ftp.watts} W` : <span className="text-white/30">—</span>}
              {ftp?.date && <span className="text-white/35 text-xs ml-2">best, {ftp.date}</span>}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
