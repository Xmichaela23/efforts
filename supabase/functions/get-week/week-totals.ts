/**
 * ═══ THE WEEK BAR'S TWO TOTALS, COUNTED ON THE SERVER (2026-09-10, audit H-T03) ══════════════════
 *
 * ⛔ THE PHONE SUMMED THESE OFF THE ROWS ON SCREEN, AND "PLANNED" MOVED AS THE ATHLETE TRAINED. The
 * Week tab hid a finished session's planned row and counted the completed row in BOTH totals, so a
 * 60-minute planned run finished in 72 added 72 to "Planned". A plan does not grow because it was
 * done.
 *
 * ⚠️ WHAT EACH TOTAL IS NOW:
 *   · planned minutes / metres — every session the plan holds this week, at its PLANNED length
 *     (`planned_duration_seconds`, the one ladder) and its planned distance where the prescription
 *     states one (the distance steps), whether done yet or not.
 *   · done minutes / metres — every executed session (`is_executed`), at its moving time and its
 *     recorded distance, planned or not.
 *   · lifts — counted, not timed: planned lifts, and executed ones. The plyo day is not a lift.
 * ⚠️ PER SESSION, MINUTES ARE ROUNDED BEFORE THEY ARE ADDED, as the bar did.
 */
import { clock, displayFormat, durationClock, M_PER_MI, M_PER_YD, type DisplayFormat } from '../_shared/display-format.ts';

// deno-lint-ignore no-explicit-any
type Item = Record<string, any>;

export type WeekBarTotals = {
  planned_minutes: number;
  done_minutes: number;
  planned_meters: number;
  done_meters: number;
  lifts_planned: number;
  lifts_done: number;
  /** "18 mi" / "29 km"; null under 0.05 of the unit. */
  planned_distance_display: string | null;
  done_distance_display: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function weekBarTotals(items: ReadonlyArray<Item> | null | undefined, fmt: DisplayFormat = displayFormat(false)): WeekBarTotals {
  const out: WeekBarTotals = {
    planned_minutes: 0, done_minutes: 0, planned_meters: 0, done_meters: 0, lifts_planned: 0, lifts_done: 0,
    planned_distance_display: null, done_distance_display: null,
  };
  for (const it of items ?? []) {
    const type = String(it?.type ?? '').toLowerCase();
    const planned = it?.planned && typeof it.planned === 'object' ? it.planned : null;
    const done = it?.is_executed === true;
    if (type === 'strength') {
      // The plyo day is stored as `strength` and is not a lift — excluded by its `plyo` tag, never by its name
      // (the rule `_shared/week-one-summary.ts` keeps).
      if (isPlyoDay(it)) continue;
      if (planned) out.lifts_planned += 1;
      if (done) out.lifts_done += 1;
      continue;
    }
    if (planned) {
      out.planned_minutes += Math.round(num(planned.planned_duration_seconds) / 60);
      const steps = Array.isArray(planned.steps) ? planned.steps : [];
      out.planned_meters += steps.reduce((s: number, st: Item) => s + num(st?.distanceMeters), 0);
    }
    if (done) {
      out.done_minutes += Math.round(num(it?.moving_seconds) / 60);
      out.done_meters += doneDistanceMeters(it) ?? 0; // the one distance each row prints
    }
  }
  out.planned_meters = Math.round(out.planned_meters);
  out.done_meters = Math.round(out.done_meters);
  // ⛔ THE BAR'S DISTANCE, IN THE ATHLETE'S UNIT, PRINTED HERE (2026-09-16, Stage 7 session 1) — the Week tab converted it.
  out.planned_distance_display = fmt.distanceWhole(out.planned_meters, WEEK_BAR_MIN_DISTANCE_UNITS);
  out.done_distance_display = fmt.distanceWhole(out.done_meters, WEEK_BAR_MIN_DISTANCE_UNITS);
  return out;
}

// OURS — the bar hides a distance under 0.05 mi / km so a week with no distance reads no "0 mi"; the Week tab's display rule, no outside source.
const WEEK_BAR_MIN_DISTANCE_UNITS = 0.05;

const pos = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * ═══ A FINISHED SESSION'S LINES, PRINTED ON THE SERVER (2026-09-16, Stage 7 session 1) ══════════════
 *
 * ⛔ THREE SCREENS CONVERTED THESE ON THE PHONE: Today's metric line, the done session card's headline and
 * the Week row. Each picked its own distance and its own unit maths. The item now carries the words.
 *   · `done_metrics`  — Today: distance · pace / speed / per-100 · bpm · climb (up to four).
 *   · `done_distance` — "5.0 mi" (1 dp mi / km); the session card and the Week row.
 *   · `done_volume`   — a lift's "3,725 lb"; the Week row.
 *   · `done_headline` — the session card: "5.0 mi · 48:00" or "3,725 lb · 3 lifts" ("3 exercises" on the plyo day).
 * ⚠️ ONE DISTANCE: `executed.overall.distance_m` — the analysis's stored total, the device's own first (rule 7) —
 * which is also what Performance's `completed_totals.distance_m` is built from. The stored session detail is read
 * only when the overall carries none: a stored detail is rebuilt when the session is opened, so after a
 * recalculation it can hold the old figure until then (2026-09-16, Stage 7 session 3).
 */
export type DoneLines = {
  done_metrics: string[];
  done_distance: string | null;
  done_volume: string | null;
  done_headline: string | null;
};

/** The plyo day: a `strength` row whose plan carries the `plyo` tag. */
export function isPlyoDay(item: Item): boolean {
  const tags = item?.planned?.tags ?? item?.tags;
  return Array.isArray(tags) && tags.some((t: unknown) => String(t).toLowerCase() === 'plyo');
}

export function doneDistanceMeters(item: Item): number | null {
  const totals = item?.workout_analysis?.session_detail_v1?.completed_totals ?? null;
  return pos(item?.executed?.overall?.distance_m) ?? pos(totals?.distance_m);
}

export function doneLines(item: Item, fmt: DisplayFormat): DoneLines {
  const none: DoneLines = { done_metrics: [], done_distance: null, done_volume: null, done_headline: null };
  // ⚠️ NOT GATED ON STATUS: each screen prints these only on a row it shows as done, and the lift's pounds and
  // the moving time are already gated on `completed` in `unify`.
  const type = String(item?.type ?? '').toLowerCase();

  if (type === 'strength') {
    const done_volume = fmt.weightGrouped(item?.strength_volume_lb);
    const exercises = Array.isArray(item?.executed?.strength_exercises) ? item.executed.strength_exercises : [];
    const lifts = exercises.filter((ex: Item) => Array.isArray(ex?.sets) && ex.sets.length > 0).length;
    // Jumps are not lifts: the plyo day counts "exercises" (Michael, 2026-09-17, approved "3 exercises").
    const [one, many] = isPlyoDay(item) ? ['exercise', 'exercises'] : ['lift', 'lifts'];
    const parts = [done_volume, lifts > 0 ? `${lifts} ${lifts === 1 ? one : many}` : null].filter(Boolean);
    return { ...none, done_volume, done_headline: parts.length ? parts.join(' · ') : null };
  }

  const totals = item?.workout_analysis?.session_detail_v1?.completed_totals ?? null;
  const overall = item?.executed?.overall ?? {};
  const distM = doneDistanceMeters(item);
  const done_distance = fmt.distance(distM, type === 'swim');
  const headParts = [done_distance, durationClock(item?.moving_seconds)].filter(Boolean);

  const durS = pos(totals?.moving_s) ?? pos(item?.moving_seconds);
  const avgHr = pos(totals?.avg_hr) ?? pos(overall?.avg_hr);
  const elevM = pos(overall?.elevation_gain_m);
  const isRun = type === 'run' || type === 'walk';
  const isRide = type === 'ride' || type === 'bike' || type === 'cycling';
  const metrics: string[] = [];
  if (done_distance != null) metrics.push(done_distance);
  if (durS != null && distM != null) {
    if (isRun) {
      const paceMi = pos(overall?.avg_pace_s_per_mi) ?? pos(totals?.avg_pace_s_per_mi);
      const p = fmt.pacePerUnit(paceMi != null ? paceMi / (M_PER_MI / 1000) : durS / (distM / 1000));
      if (p) metrics.push(p);
    } else if (isRide) {
      const s = fmt.speedFromMpsShort(pos(overall?.avg_speed_mps) ?? distM / durS);
      if (s) metrics.push(s);
    } else if (type === 'swim') {
      // The server's per-100 (built in the athlete's unit) when the detail exists; the division otherwise.
      const per100 = pos(totals?.swim_pace_per_100_s) ?? durS / ((fmt.metric ? distM : distM / M_PER_YD) / 100);
      metrics.push(`${clock(per100)} /100${fmt.metric ? 'm' : 'yd'}`);
    }
  }
  if (avgHr != null) metrics.push(`${Math.round(avgHr)} bpm`);
  if ((isRun || isRide) && elevM != null) {
    const e = fmt.elevation(elevM);
    if (e) metrics.push(e);
  }

  return {
    done_metrics: metrics.filter(Boolean).slice(0, 4),
    done_distance,
    done_volume: null,
    done_headline: headParts.length ? headParts.join(' · ') : null,
  };
}
