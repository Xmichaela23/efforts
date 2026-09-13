/**
 * ═══ DRIFT ON A LONG RUN OR RIDE THAT CARRIES SETS ═════════════════════════════════════════════
 *
 * p107 makes cardiac drift the dose guide for *"easy/VT1 work in a given session"*, and p235's LSD is
 * *"primarily below VT1"* — so a long session ALWAYS gets a drift reading, including the ones the
 * page builds with sets in them ("1h VT1 run with 2 sets added at any point; the sets are 2 rounds of
 * 1:30 @ 115% / 30s @ VT1").
 *
 * ⛔ BUT NOT OVER THE WHOLE FILE. A reading that includes the 115% sets is a number about a session
 * the athlete did not do: the sets raise heart rate by prescription, so the whole-file figure reports
 * a durability failure every week on an athlete following the page exactly. The reading is taken over
 * the VT1 PORTIONS ONLY — the sets and their recoveries come out, and what is left is split first
 * half against second half. Field practice: TrainingPeaks reads decoupling over the steady section
 * rather than the whole recording.
 *
 * ⚠️ A PLAIN LONG SESSION IS NOT TOUCHED. With no sets in it there is nothing to remove, so it keeps
 * the whole-session read it has always had. This file returns `not_applicable` and the caller falls
 * through to `resolveSessionDrift`'s ordinary precedence.
 *
 * ⛔⛔ WHICH ROWS ARE THE SETS, AND THE TWO TESTS THAT DO NOT WORK (traced 2026-09-12).
 *
 * ⛔ THE STEP'S OWN KIND DOES NOT SAY. `buildContinuousWithInserts` gives the VT1 body and the
 * inserted set the SAME role — both are `'work'` (`generate.ts:622` and `:646`). Only the recovery
 * between sets carries a role of its own. So the stored kind separates a recovery from everything
 * else and nothing more.
 * ⚠️ THE LABEL DOES SAY, AND IS NOT SAFE TO READ. The VT1 body is labelled 'Easy' on a run, 'Steady'
 * or 'Easy spin' on a ride, against the archetype's own name on the insert. But `source-rules.ts`
 * carries an explicit warning on those labels — *"DISPLAY NAME ONLY… the same double-naming trap
 * `Cut-downs` had"* — and they were renamed once already on 2026-08-25 while the ids stayed put.
 * A rule keyed to a display string breaks the next time one is reworded, silently.
 * ⛔ AND THE PRESCRIBED PERCENTAGE IS GONE BY THE TIME THIS RUNS. `materialize-plan` resolves the
 * library's percentages into ABSOLUTE watts and paces against the athlete's numbers and drops the
 * percentage, so a stored step says "150-170 W" and not "65-75% of threshold". Recovering it means
 * resolving the athlete's anchor at read time, which this builder cannot do (Law 4).
 *
 * ⛔ SO THE TEST IS RELATIVE TO THE SESSION ITSELF. A work step whose target is harder than the
 * session's EASIEST work step is a set; its following recovery goes with it. The comparison is on
 * the band's upper value — the fastest pace, or the highest watts — so a band that starts at zero
 * ("below 75%") and a single value (a VT1 step resolves to one pace) compare on the same footing.
 * ⚠️ WHY RELATIVE IS SAFE HERE AND WOULD NOT BE ACROSS SESSIONS. One session is built by one
 * generator, so the two encodings of a resolved band never meet inside it. Comparing a row against
 * another session's rows would put them side by side, and this never does.
 * ⛔ NO TARGETS ON THE ROWS = NO WINDOW. The session keeps its whole-session read, the same
 * fallback a single-row VT1 block takes. Guessing which rows were the sets from their shape is the
 * thing this file will not do.
 *
 * ⚠️ `VT1_MIN_BOUT_S` IS THE FLOOR AND NOTHING ELSE. p107's bout length says whether a VT1 bout is
 * worth doing; it is not a set detector, and a number borrowed from one context is not licensed as
 * a filter in another. It is used once, below, to decide whether enough VT1 time is left to read.
 */
import { VT1_MIN_BOUT_S } from './vt1-bout.ts';

export type Vt1WindowDrift =
  /** Read over the VT1 portions. `pct` matches Friel's sign: positive means efficiency fell. */
  | { kind: 'read'; pct: number; basis: 'gap' | 'raw' | 'power'; seconds: number }
  /**
   * No VT1 bout in the session — every row was under p107's floor, so nothing qualifies to read
   * over. ⚠️ `seconds` is 0 whenever this fires: a row-wise read makes "is this row a bout" and "is
   * enough bout time left" the same question against the same number. The screen says so in words.
   */
  | { kind: 'too_short'; seconds: number }
  /** No sets in it — the caller keeps the ordinary whole-session read. */
  | { kind: 'not_applicable' };

type Row = {
  interval_type?: unknown;
  /** The library reports a pace band fastest-first, so `lower_sec_per_mi` is the FASTER number. */
  planned_pace_range?: { lower_sec_per_mi?: number | null; upper_sec_per_mi?: number | null } | null;
  planned_power_range?: { lower_w?: number | null; upper_w?: number | null } | null;
  executed?: {
    duration_s?: number | null;
    avg_hr?: number | null;
    actual_pace_sec_per_mi?: number | null;
    actual_gap_sec_per_mi?: number | null;
    power_watts?: number | null;
  } | null;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * ⛔ THE OUTPUT SIDE OF THE RATIO, AND IT IS THE SAME ONE EVERY OTHER SURFACE USES. A run ratios
 * SPEED against heart rate, so a pace in seconds per mile is inverted first — reading the pace
 * directly would make a slower second half look like improving efficiency. Grade-adjusted pace is
 * preferred where the row has one, matching `drift-pct.ts` basis 'gap' over 'raw'.
 */
function outputOf(r: Row, isRide: boolean): { value: number; basis: 'gap' | 'raw' | 'power' } | null {
  const ex = r.executed ?? null;
  if (isRide) {
    const w = num(ex?.power_watts);
    return w == null ? null : { value: w, basis: 'power' };
  }
  const gap = num(ex?.actual_gap_sec_per_mi);
  if (gap != null) return { value: 1 / gap, basis: 'gap' };
  const raw = num(ex?.actual_pace_sec_per_mi);
  return raw == null ? null : { value: 1 / raw, basis: 'raw' };
}

export function vt1WindowDrift(input: {
  intervals?: Row[] | null;
  sport?: string | null;
}): Vt1WindowDrift {
  const rows = Array.isArray(input.intervals) ? input.intervals : [];
  if (rows.length === 0) return { kind: 'not_applicable' };
  const sport = String(input.sport ?? '').toLowerCase();
  const isRide = /^(ride|bike|cycling)$/.test(sport);

  const kindOf = (r: Row) => String(r.interval_type ?? '').toLowerCase();
  const dur = (r: Row) => num(r.executed?.duration_s) ?? 0;

  /**
   * ⛔ HOW HARD THIS ROW WAS ASKED TO BE, ON ONE SCALE, HIGHER = HARDER. The band's upper value:
   * the most watts, or the fastest pace. A pace in seconds per mile runs the other way, so it is
   * inverted — the fastest pace is the smallest number and must come out the largest demand.
   * ⚠️ NULL MEANS THE ROW WAS NOT GIVEN A TARGET, which is a different thing from an easy target.
   */
  const demand = (r: Row): number | null => {
    if (isRide) {
      const hi = num(r.planned_power_range?.upper_w);
      return hi;
    }
    const a = num(r.planned_pace_range?.lower_sec_per_mi);
    const b = num(r.planned_pace_range?.upper_sec_per_mi);
    const fastest = a != null && b != null ? Math.min(a, b) : (a ?? b);
    return fastest == null ? null : 1 / fastest;
  };

  /**
   * ⚠️ THE WARM-UP COMES OUT TOO, and it is not one of the sets. Heart rate lags effort by two to
   * three minutes, so the opening of any session reads low and inflates the drift of what follows —
   * `hr-drift-halves.ts` drops it by time and `warmupSkipSeconds` drops it by the planned step. This
   * is the same exclusion applied as a row, so the three reads agree about where a session starts.
   */
  /**
   * ⛔ THE SESSION'S EASIEST WORK STEP IS THE VT1 LEVEL. Every work row asked for more than that is
   * a set. Rows with no target at all sit out of the comparison — they cannot raise or lower it.
   */
  const workRows = rows.filter((r) => kindOf(r) !== 'recovery' && kindOf(r) !== 'warmup' && dur(r) > 0);
  const demands = workRows.map(demand).filter((d): d is number => d != null);
  if (demands.length === 0) return { kind: 'not_applicable' };
  const easiest = Math.min(...demands);

  /**
   * ⚠️ STRICTLY ABOVE, SO EVERY ROW AT THE EASY LEVEL STAYS IN. A long run broken into three easy
   * segments has three rows at the same target and all three are VT1 — and an easy segment stays in
   * however short it is, because how hard it was asked to be is the only question here.
   */
  const isSet = (r: Row) => { const d = demand(r); return d != null && d > easiest; };

  // ⛔ NOTHING HARDER THAN EASY IN IT = NOTHING TO REMOVE. A plain long session keeps its
  // whole-session read; this is the branch that stops the windowed rule becoming the rule for
  // every session.
  if (!workRows.some(isSet)) return { kind: 'not_applicable' };

  /**
   * ⛔ A SET'S RECOVERY GOES WITH THE SET. p235 builds the insert as rounds of work and float, so
   * the recovery after one belongs to it and is no more a VT1 bout than the set is.
   * ⚠️ THE WARM-UP COMES OUT TOO, and it is not one of the sets. Heart rate lags effort by two to
   * three minutes, so the opening of any session reads low and inflates the drift of what follows —
   * `hr-drift-halves.ts` drops it by time and `warmupSkipSeconds` drops it by the planned step. This
   * is the same exclusion applied as a row, so the three reads agree about where a session starts.
   */
  // ⚠️ EVERY recovery row comes out, not only the ones that follow a set. p235 allows an LSD its own
  // rest pauses, and those are easy time — but heart rate falls through a pause, so a drift read
  // that included them would report a recovery as improving efficiency. The same reason
  // `hr-drift-halves.ts` reads over moving time rather than the whole clock.
  const vt1Rows = rows.filter((r) =>
    dur(r) > 0 && kindOf(r) !== 'warmup' && kindOf(r) !== 'recovery' && !isSet(r));
  const seconds = vt1Rows.reduce((s, r) => s + dur(r), 0);
  if (seconds < VT1_MIN_BOUT_S) return { kind: 'too_short', seconds: Math.round(seconds) };

  /**
   * ⛔ HALVES BY TIME, AND A ROW BELONGS TO THE HALF ITS MIDPOINT FALLS IN. The rows are averages
   * already, so a row cannot be split — assigning it by its midpoint is the closest a row-wise read
   * gets to `hr-drift-halves.ts`'s split by time, and it keeps a long VT1 block from landing wholly
   * in one half because its first second did.
   * ⚠️ A SINGLE VT1 ROW CANNOT BE HALVED. One row means one average, and an average has no first and
   * second half — the session falls back to the ordinary whole-session read rather than inventing a
   * comparison. This is the resolution limit of reading stored rows instead of samples.
   */
  if (vt1Rows.length < 2) return { kind: 'not_applicable' };

  const half = seconds / 2;
  let elapsed = 0;
  const first: Row[] = []; const second: Row[] = [];
  for (const r of vt1Rows) {
    const d = dur(r);
    (elapsed + d / 2 <= half ? first : second).push(r);
    elapsed += d;
  }
  if (first.length === 0 || second.length === 0) return { kind: 'not_applicable' };

  /** Duration-weighted, because a 40-minute row and a 10-minute one are not one reading each. */
  const weighted = (rs: Row[], pick: (r: Row) => number | null): number | null => {
    let sw = 0; let sv = 0;
    for (const r of rs) {
      const v = pick(r); const d = dur(r);
      if (v == null || d <= 0) continue;
      sv += v * d; sw += d;
    }
    return sw > 0 ? sv / sw : null;
  };

  /**
   * The basis the whole read is on. A ride is always 'power'. A run is 'gap' only when EVERY VT1 row
   * carries grade-adjusted pace — mixing one row's graded pace with another's raw would compare two
   * different measurements across the halves and call the difference drift.
   */
  const bases = vt1Rows.map((r) => outputOf(r, isRide)?.basis ?? null);
  if (bases.some((b) => b == null)) return { kind: 'not_applicable' };
  const basis: 'gap' | 'raw' | 'power' = isRide ? 'power' : (bases.every((b) => b === 'gap') ? 'gap' : 'raw');
  // On 'raw' every row must be read raw, so a row that offered graded pace is re-read.
  const forceRaw = basis === 'raw';

  const out = (r: Row): number | null => {
    if (forceRaw) { const p = num(r.executed?.actual_pace_sec_per_mi); return p == null ? null : 1 / p; }
    return outputOf(r, isRide)?.value ?? null;
  };
  const hr = (r: Row) => num(r.executed?.avg_hr);
  const o1 = weighted(first, out); const o2 = weighted(second, out);
  const h1 = weighted(first, hr); const h2 = weighted(second, hr);
  if (o1 == null || o2 == null || h1 == null || h2 == null) return { kind: 'not_applicable' };

  // Friel's ratio and Friel's sign, the same expression `ride-physiology.ts` uses: efficiency is
  // output per heartbeat, and drift is how much of it was lost by the second half.
  const r1 = o1 / h1; const r2 = o2 / h2;
  if (!(r1 > 0)) return { kind: 'not_applicable' };
  return { kind: 'read', pct: Math.round(((r1 - r2) / r1) * 1000) / 10, basis, seconds: Math.round(seconds) };
}
