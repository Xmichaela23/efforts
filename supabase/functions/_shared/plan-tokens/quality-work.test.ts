/**
 * ⛔ THE REFACTOR GUARD, AND IT IS THE POINT OF THIS FILE (2026-09-11).
 *
 * `materialize-plan` stopped carrying its own copy of these four branches and calls
 * `quality-work.ts` instead, so that the Instead sheet can say what a workout IS off the same
 * expansion that writes its steps. **The steps must not have moved by one field.** The reference
 * implementations below are the four branches as they stood at `a7e75fe3`, transcribed verbatim, and
 * every token the four hard families emit at every level is swept through both.
 *
 * ⚠️ A SECOND IMPLEMENTATION IN TEST-LAND IS DELIBERATE — it is what makes this a guard rather than
 * a tautology. Delete it only when the branches it pins are gone from history's reach.
 *
 * ⛔⛔ THE RIDE REFERENCE MOVED ONCE, ON PURPOSE (2026-09-15, WORKORDER Stage 3 session 6). The
 * branches wrote a single printed percentage as `lower === upper`, so every repeat of p237's work was
 * judged against one number and read red. Two rules replaced it and the reference carries both:
 *   · a single percentage gets `SINGLE_PERCENT_BAND` either side (OURS — see the constant);
 *   · a WORK step at or above a floor-only family's work floor gets the floor and NO upper (p237).
 * ⛔ AND ONCE MORE (2026-09-18, the rule per ride type): EVERY anaerobic work step is a floor (p237), and a sweet-spot
 * single number at or below 100% is capped at FTP (pp238–239). The reference carries both.
 * ⚠️ THE RUN REFERENCE IS UNTOUCHED, and so is every ride shape the page prints as a range.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseQualityWork,
  qualityRideSteps,
  type RidePowerRule,
  qualityRunSteps,
  qualityWorkLine,
} from './quality-work.ts';
import { archetypesFor, FAMILIES, ridePowerRuleOf } from '../endurance-library/index.ts';
import { composedHardSession } from '../session-swap/workout-choice.ts';

const BASELINES = {
  units: 'imperial',
  performance_numbers: { easy_pace: '9:30', fiveK_pace: '7:50', ftp: 210 },
} as never;

const THRESHOLD = 7 * 60 + 30; // sec/mi
const EASY = 9 * 60 + 30;
const FTP = 210;
/** The one band around a single printed percentage — `SINGLE_PERCENT_BAND`, transcribed as the rest is. */
const BAND = 0.10;

// ── THE FOUR BRANCHES AS THEY STOOD, VERBATIM ────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function refRun(tok: string, thr: number | undefined, easy: number | undefined): any[] {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  const lower = tok.toLowerCase();
  const mRound = lower.match(/^round_(\d+)x_((?:r?\d+s(?:\d+|vt1|easy|racepace))(?:-r?\d+s(?:\d+|vt1|easy|racepace))*)(?:_r(\d+)s)?$/);
  if (mRound) {
    const rounds = parseInt(mRound[1], 10);
    const segs = mRound[2].split('-');
    const rest_s = mRound[3] ? parseInt(mRound[3], 10) : 0;
    for (let r = 0; r < rounds; r += 1) {
      for (const seg of segs) {
        const m2 = seg.match(/^(r?)(\d+)s(\d+|vt1|easy|racepace)$/);
        if (!m2) continue;
        const isRec = m2[1] === 'r';
        const secs = parseInt(m2[2], 10);
        const at = m2[3];
        if (at === 'racepace') {
          out.push({ kind: 'work', duration_s: secs });
        } else if (at === 'vt1' || at === 'easy' || isRec) {
          const pct = at === 'vt1' || at === 'easy' ? 0 : parseInt(at, 10) / 100;
          out.push({ kind: 'recovery', duration_s: secs, pace_sec_per_mi: pct > 0 && thr ? Math.round(thr / pct) : easy });
        } else {
          const pct = parseInt(at, 10) / 100;
          out.push({ kind: 'work', duration_s: secs, pace_sec_per_mi: thr && pct > 0 ? Math.round(thr / pct) : undefined });
        }
      }
      if (rest_s > 0 && r < rounds - 1) out.push({ kind: 'recovery', duration_s: rest_s, pace_sec_per_mi: easy });
    }
    return out;
  }
  const mPct = lower.match(/^interval_(\d+)x(\d+)s_(\d+)pct(?:_[rR](\d+)s)?$/);
  if (mPct) {
    const reps = parseInt(mPct[1], 10);
    const work_s = parseInt(mPct[2], 10);
    const pct = parseInt(mPct[3], 10) / 100;
    const float_s = mPct[4] ? parseInt(mPct[4], 10) : 0;
    const pace = thr && pct > 0 ? Math.round(thr / pct) : undefined;
    for (let i = 0; i < reps; i += 1) {
      out.push({ kind: 'work', duration_s: work_s, pace_sec_per_mi: pace });
      if (float_s > 0 && i < reps - 1) out.push({ kind: 'recovery', duration_s: float_s, pace_sec_per_mi: easy });
    }
    return out;
  }
  return out;
}

// deno-lint-ignore no-explicit-any
function refRide(tok: string, ftp: number | undefined, rule?: RidePowerRule): any[] {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  const lower = tok.toLowerCase();
  const pctRange = (lo: number, hi: number) => {
    if (!ftp) return undefined;
    if (lo !== hi) return { lower: Math.round(lo * ftp), upper: Math.round(hi * ftp) };
    return { lower: Math.round(lo * ftp * (1 - BAND)), upper: Math.round(lo * ftp * (1 + BAND)) };
  };
  /** A WORK step: p237 a floor, no ceiling; pp238–239 never over FTP; else the band. */
  const workAt = (pct: number) => {
    if (!ftp) return undefined;
    // Round 5 (2026-09-18): the floor's shown top is 130% of FTP (p237); the score still has none (no `upper`).
    if (rule === 'floor') return { lower: Math.round(pct * ftp), shown_upper: Math.round(Math.max(pct, 1.3) * ftp) };
    if (rule === 'under_threshold' && pct <= 1) {
      return { lower: Math.round(pct * ftp * (1 - BAND)), upper: Math.round(Math.min(pct * (1 + BAND), 1) * ftp) };
    }
    return pctRange(pct, pct);
  };
  const mRound = lower.match(/^round_(\d+)x_((?:r?\d+s(?:\d+|vt1|easy|racepace))(?:-r?\d+s(?:\d+|vt1|easy|racepace))*)(?:_r(\d+)s)?$/);
  if (mRound) {
    const rounds = parseInt(mRound[1], 10);
    const segs = mRound[2].split('-');
    const rest_s = mRound[3] ? parseInt(mRound[3], 10) : 0;
    for (let r = 0; r < rounds; r += 1) {
      for (const seg of segs) {
        const m2 = seg.match(/^(r?)(\d+)s(\d+|vt1|easy|racepace)$/);
        if (!m2) continue;
        const isRec = m2[1] === 'r';
        const secs = parseInt(m2[2], 10);
        const at = m2[3];
        if (at === 'racepace') out.push({ kind: 'work', duration_s: secs });
        else if (at === 'vt1' || at === 'easy') out.push({ kind: 'recovery', duration_s: secs }); // 2026-09-18: a plain easy spin, no target
        else if (isRec) { const pct = parseInt(at, 10) / 100; out.push({ kind: 'recovery', duration_s: secs, power_range: pctRange(pct, pct) }); }
        else { const pct = parseInt(at, 10) / 100; out.push({ kind: 'work', duration_s: secs, power_range: workAt(pct) }); }
      }
      if (rest_s > 0 && r < rounds - 1) out.push({ kind: 'recovery', duration_s: rest_s });
    }
    return out;
  }
  let m = lower.match(/bike_ss_(\d+)x(\d+)min_r(\d+)min/);
  if (m) {
    const reps = parseInt(m[1], 10), work = parseInt(m[2], 10) * 60, rest = parseInt(m[3], 10) * 60;
    for (let i = 0; i < reps; i++) {
      out.push({ kind: 'work', duration_s: work, power_range: pctRange(0.85, 0.95) });
      if (rest && i < reps - 1) out.push({ kind: 'recovery', duration_s: rest });
    }
    return out;
  }
  m = lower.match(/bike_thr_(\d+)x(\d+)min_r(\d+)min/);
  if (m) {
    const reps = parseInt(m[1], 10), work = parseInt(m[2], 10) * 60, rest = parseInt(m[3], 10) * 60;
    for (let i = 0; i < reps; i++) {
      out.push({ kind: 'work', duration_s: work, power_range: pctRange(0.95, 1.05) });
      if (rest && i < reps - 1) out.push({ kind: 'recovery', duration_s: rest });
    }
    return out;
  }
  return out;
}

/** Every work token the four hard families emit, at every level, with its sport. */
function everyQualityToken(): Array<{ token: string; sport: 'run' | 'ride'; rule: RidePowerRule; where: string }> {
  const out: Array<{ token: string; sport: 'run' | 'ride'; rule: RidePowerRule; where: string }> = [];
  for (const family of ['run_mlss', 'run_near_threshold', 'ride_anaerobic', 'ride_sweet_spot'] as const) {
    const sport = FAMILIES[family].sport as 'run' | 'ride';
    const rule = ridePowerRuleOf(family);
    for (const level of [1, 2, 3] as const) {
      for (const a of archetypesFor(family, level)) {
        const s = composedHardSession({ family, level, archetype: a.id, baselines: BASELINES });
        for (const token of s.steps_preset) {
          if (parseQualityWork(token)) out.push({ token, sport, rule, where: `${family} L${level} ${a.id}` });
        }
      }
    }
  }
  return out;
}

// ⚠️ `place` (2026-09-18, book-language pass 2) marks where a step sits so the materializer can put the page's word on
// it; it is not part of the step the branches built, so the comparison leaves it out.
const noPlace = (steps: unknown[]) => JSON.parse(JSON.stringify(steps, (k, v) => (k === 'place' ? undefined : v)));

Deno.test('every quality token the four hard families emit expands exactly as the branches did', () => {
  const tokens = everyQualityToken();
  // The sweep is worthless if the families stopped emitting these shapes.
  assertEquals(tokens.length > 30, true, `only ${tokens.length} quality tokens found`);
  for (const { token, sport, rule, where } of tokens) {
    const work = parseQualityWork(token)!;
    if (sport === 'run') {
      const now = qualityRunSteps(work, { thresholdSecPerMi: THRESHOLD, easySecPerMi: EASY });
      assertEquals(noPlace(now), JSON.parse(JSON.stringify(refRun(token, THRESHOLD, EASY))), `${where} ${token}`);
      // And with nothing to price it with — the state the branches' `|| undefined` produced.
      const bare = qualityRunSteps(work, { thresholdSecPerMi: null, easySecPerMi: null });
      assertEquals(noPlace(bare), JSON.parse(JSON.stringify(refRun(token, undefined, undefined))), `${where} ${token} (no paces)`);
    } else {
      const now = qualityRideSteps(work, FTP, rule);
      assertEquals(noPlace(now), JSON.parse(JSON.stringify(refRide(token, FTP, rule))), `${where} ${token}`);
      const bare = qualityRideSteps(work, null, rule);
      assertEquals(noPlace(bare), JSON.parse(JSON.stringify(refRide(token, undefined, rule))), `${where} ${token} (no ftp)`);
    }
  }
});

Deno.test('the line is the work, in the page\'s structure, priced for this athlete', () => {
  const run = { thresholdSecPerMi: THRESHOLD, units: 'imperial' as const };
  const ride = { ftp: FTP, units: 'imperial' as const };
  // p231 MLSS, the surge and float: sets of rounds, the float at VT1, the rest between sets.
  assertEquals(
    qualityWorkLine(parseQualityWork('round_3x_15s130-45s105-r60svt1-15s130-45s105-r60svt1-15s130-45s105-r60svt1-15s130-45s105_R120s'), 'run', run),
    '3 sets of 4 rounds: 15 s at 5:46/mi, 45 s at 7:09/mi, 1 min easy; 2 min between',
  );
  // p234 near-threshold: one percentage, an easy float between.
  assertEquals(
    qualityWorkLine(parseQualityWork('interval_8x240s_90pct_R75s'), 'run', run),
    '8 × 4 min at 8:20/mi, 1:15 between',
  );
  /**
   * ⛔ p237 anaerobic: the sandwich, in watts. EVERY work step is a floor (2026-09-18) — the 120% surge and the 90%
   * sustained middle alike — and prints floor to 130% of FTP (round 5, 2026-09-18; 273 W at FTP 210).
   */
  const anaerobic = { ...ride, rule: ridePowerRuleOf('ride_anaerobic') };
  assertEquals(
    qualityWorkLine(parseQualityWork('round_8x_30s120-150s90_R240s'), 'ride', anaerobic),
    '8 rounds: 30 s at 252–273 W, 2:30 at 189–273 W; 4 min between',
  );
  /**
   * ⛔ pp238–239 sweet spot: never over threshold. 95% of 210 is 180–210 W (−10%, capped at FTP); the 105% surge on
   * the minute keeps its own ±10%.
   */
  const sweet = { ...ride, rule: ridePowerRuleOf('ride_sweet_spot') };
  assertEquals(
    qualityWorkLine(parseQualityWork('round_6x_240s95_R120s'), 'ride', sweet),
    '6 rounds: 4 min at 180–210 W, 2 min between',
  );
  assertEquals(
    qualityWorkLine(parseQualityWork('round_3x_10s105-50s90_R180s'), 'ride', sweet),
    '3 rounds: 10 s at 198–243 W, 50 s at 170–208 W; 3 min between',
  );
  // And the same shape with no family floor: both steps are single percentages and both get the band.
  assertEquals(
    qualityWorkLine(parseQualityWork('round_8x_30s120-150s90_R240s'), 'ride', ride),
    '8 rounds: 30 s at 227–277 W, 2:30 at 170–208 W; 4 min between',
  );
  // p238 sweet spot: the band is the token's own, and it prints as a range.
  assertEquals(
    qualityWorkLine(parseQualityWork('bike_ss_4x8min_R4min'), 'ride', ride),
    '4 × 8 min at 179–200 W, 4 min between',
  );
  assertEquals(
    qualityWorkLine(parseQualityWork('bike_thr_8x3min_R2min'), 'ride', ride),
    '8 × 3 min at 200–221 W, 2 min between',
  );
});

Deno.test('no pace and no FTP prints the page\'s percentages, never a derived number', () => {
  assertEquals(
    qualityWorkLine(parseQualityWork('interval_8x240s_90pct_R75s'), 'run', {}),
    '8 × 4 min at 90%, 1:15 between',
  );
  assertEquals(
    qualityWorkLine(parseQualityWork('bike_ss_4x8min_R4min'), 'ride', {}),
    '4 × 8 min at 85–95%, 4 min between',
  );
  assertEquals(
    qualityWorkLine(parseQualityWork('round_8x_30s120-150s90_R240s'), 'ride', {}),
    '8 rounds: 30 s at 120%, 2:30 at 90%; 4 min between',
  );
});

Deno.test('a metric athlete reads the same work per kilometre', () => {
  assertEquals(
    qualityWorkLine(parseQualityWork('interval_8x240s_90pct_R75s'), 'run', { thresholdSecPerMi: THRESHOLD, units: 'metric' }),
    '8 × 4 min at 5:11/km, 1:15 between',
  );
});

Deno.test('the line says nothing beyond the page\'s structure, the numbers and the units', () => {
  // ⛔ "spin" joined 2026-09-18 (book-language pass 2): a ride's untargeted recovery reads the page's "easy spin".
  const ALLOWED = /^[0-9\s:×–%,;./]*(?:(?:rounds|sets|of|at|easy|spin|between|min|s|W|mi|km)[0-9\s:×–%,;./]*)*$/;
  for (const { token, sport } of everyQualityToken()) {
    const line = qualityWorkLine(parseQualityWork(token), sport, { thresholdSecPerMi: THRESHOLD, ftp: FTP, units: 'imperial' });
    assertEquals(ALLOWED.test(line), true, `unexpected word in: ${line}`);
    // One line, always — a newline would break the sheet's row.
    assertEquals(line.includes('\n'), false, line);
  }
});
