/**
 * ⛔ THE LINE THAT SAYS A SESSION CAME IN OFF ITS PRESCRIPTION (2026-09-17, WORKORDER Stage D1).
 *
 * Michael's 2026-09-16 near-threshold run: six reps prescribed at 10:26–10:52/mi, run at 8:06–8:38/mi, heart rate
 * 153→164 against a threshold heart rate of 162. The table coloured nothing (the laps did not match — Stage B),
 * Execution read 95 from time alone, and NOTHING on the screen said the reps were far over target.
 *
 * ⚠️ IT JUDGES NOTHING AND PRESCRIBES NOTHING. It reads the bands the server has already stamped on each work rep
 * (`interval-compare.ts` — a run rep against its pace range with no allowance, p233; a ride interval against its
 * planned watts) and states, in the athlete's own units, how many fell outside and which way.
 *
 * ⚠️ OURS — the HALF-OR-MORE rule and the same-side rule (Michael, 2026-09-17). No vendor publishes a per-session
 * "off prescription" threshold (searched: TrainerRoad support and blog, Garmin manuals and support pages,
 * TrainingPeaks help centre — none defines one). Fewer than half, or a session split both ways, prints nothing:
 * the rep rows already carry it, and a line that fires on two reps out of six is noise. Ledger row in
 * docs/STATE-SOURCES.md. The threshold mints no number beyond the fraction itself — the comparison is the band
 * the page's own range already produced.
 */
import type { IntervalRow } from './types.ts';

export type OffPrescription = {
  /** 'above' = harder than asked (a run faster, a ride more watts). */
  side: 'above' | 'below';
  outside: number;
  judged: number;
  line: string;
};

const clock = (secPerMi: number) => `${Math.floor(secPerMi / 60)}:${String(Math.round(secPerMi % 60)).padStart(2, '0')}`;

const COUNT_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const countWord = (n: number) => (n < COUNT_WORD.length ? COUNT_WORD[n] : String(n));

/** OURS — half or more of the judged work reps, all on the same side (Michael, 2026-09-17). */
const OFF_PRESCRIPTION_SHARE = 0.5;

export function offPrescriptionLine(intervals: IntervalRow[] | null | undefined, isRide: boolean): OffPrescription | null {
  const work = (intervals ?? []).filter((iv) =>
    !iv?.not_done && iv?.interval_type === 'work' && (iv?.executed?.band === 'above' || iv?.executed?.band === 'below' || iv?.executed?.band === 'in'));
  if (work.length < 2) return null;

  const above = work.filter((iv) => iv.executed.band === 'above');
  const below = work.filter((iv) => iv.executed.band === 'below');
  const side: 'above' | 'below' | null =
    above.length >= work.length * OFF_PRESCRIPTION_SHARE && below.length === 0 ? 'above'
      : below.length >= work.length * OFF_PRESCRIPTION_SHARE && above.length === 0 ? 'below'
        : null;
  if (!side) return null;
  const off = side === 'above' ? above : below;

  const noun = isRide ? (work.length === 1 ? 'interval' : 'intervals') : (work.length === 1 ? 'rep' : 'reps');
  const howMany = off.length === work.length
    ? `All ${countWord(work.length)} ${noun}`
    : `${countWord(off.length).replace(/^./, (c) => c.toUpperCase())} of ${countWord(work.length)} ${noun}`;

  if (isRide) {
    const range = off[0]?.planned_power_range;
    const lo = Number(range?.lower_w), hi = Number(range?.upper_w);
    if (!(lo > 0)) return null;
    const asked = Number.isFinite(hi) && hi > lo ? `${Math.round(lo)}–${Math.round(hi)} W` : `${Math.round(lo)} W`;
    const watts = off.map((iv) => Number(iv.executed.power_watts)).filter((w) => Number.isFinite(w) && w > 0);
    if (!watts.length) return null;
    const rode = Math.min(...watts) === Math.max(...watts)
      ? `${Math.round(watts[0])} W`
      : `${Math.round(Math.min(...watts))}–${Math.round(Math.max(...watts))} W`;
    return {
      side, outside: off.length, judged: work.length,
      line: `${howMany} were ${side} the ${asked} asked for. They rode ${rode}.`,
    };
  }

  const range = off[0]?.planned_pace_range;
  const lo = Number(range?.lower_sec_per_mi), hi = Number(range?.upper_sec_per_mi);
  if (!(lo > 0) || !(hi > 0)) return null;
  const paces = off.map((iv) => Number(iv.executed.actual_pace_sec_per_mi)).filter((p) => Number.isFinite(p) && p > 0);
  if (!paces.length) return null;
  // A pace BELOW the range in seconds is a FASTER pace — `above` the prescription is the harder side.
  const ran = Math.min(...paces) === Math.max(...paces)
    ? `${clock(paces[0])}/mi`
    : `${clock(Math.min(...paces))}–${clock(Math.max(...paces))}/mi`;
  return {
    side, outside: off.length, judged: work.length,
    line: `${howMany} were ${side === 'above' ? 'faster' : 'slower'} than the ${clock(lo)}–${clock(hi)}/mi asked for. They ran ${ran}.`,
  };
}
