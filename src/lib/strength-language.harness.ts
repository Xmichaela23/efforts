/**
 * SYNTHETIC-ATHLETE HARNESS — the State strength card's per-lift rows, printed as text.
 *
 *   deno run --allow-read src/lib/strength-language.harness.ts
 *   deno test --allow-read src/lib/strength-language.harness.test.ts   (the assertions)
 *
 * ⛔ WHY THIS EXISTS, in GAME-PLAN's own words: "every unit fixture passes … because each piece is
 * right in isolation. NOTHING ANYWHERE RENDERS THE ASSEMBLED SCREEN FOR A SYNTHETIC ATHLETE, and
 * that is precisely where every one of these lives." The "back off weight" bug was exactly that: a
 * verdict function that was individually correct, and a row that dumped its output raw. Both had
 * tests. Neither test read the sentence the athlete saw.
 *
 * This runs the REAL server path (`computeStrength` from `_shared/response-model/weekly.ts`) into
 * the REAL client composition (`composePerLiftRowText`), and prints what the row says. Read it like
 * a page — the movements sit next to each other the way they do on the phone.
 */
import { computeStrength } from '../../supabase/functions/_shared/response-model/weekly.ts';
import type { StrengthLiftSnapshot } from '../../supabase/functions/_shared/response-model/types.ts';
import { composeAllOutRowText, composePerLiftRowText, containsCommand } from './strength-row-text.ts';
import { typeForExercise } from './exercise-role.ts';

/** One movement in a synthetic athlete's week. Defaults are a healthy, on-target main lift. */
function lift(canonical: string, over: Partial<StrengthLiftSnapshot> = {}): StrengthLiftSnapshot {
  return {
    canonical_name: canonical,
    display_name: canonical.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    current_e1rm: 200,
    previous_e1rm: 195,
    current_avg_rir: 2,
    baseline_avg_rir: 2,
    target_rir: 2,
    sessions_in_window: 4,
    best_weight: 135,
    anchor_1rm: null,
    last_session_date: '2026-08-01',
    spine_e1rm_direction: null,
    ...over,
  };
}

export interface SyntheticAthlete {
  name: string;
  /** What this athlete is here to prove. */
  question: string;
  weekIntent: string;
  lifts: StrengthLiftSnapshot[];
}

/**
 * The athletes. Every TYPE row is represented, and every path through `computeLiftVerdict` that
 * used to be able to put a command on screen.
 *
 * ⚠️ THE ACCESSORY CASES USE A RIR DEVIATION THAT *WOULD* HAVE FIRED A COMMAND — `current_avg_rir`
 * one full point under target is the exact `VERDICT_DEVIATION.BACK_OFF` boundary that printed the
 * red "back off weight" on Michael's Hip Thrust. An accessory athlete with on-target RIR proves
 * nothing, because there would have been no command to suppress.
 */
export const ATHLETES: SyntheticAthlete[] = [
  {
    name: 'A1 · four main lifts, base week, on target',
    question: 'do the four lifts still get coached, and does the anchor sentence still read?',
    weekIntent: 'base',
    lifts: [
      lift('squat', { anchor_1rm: 250, best_weight: 205 }),
      lift('bench_press', { anchor_1rm: 150, best_weight: 120 }),
      lift('deadlift', { anchor_1rm: 300, best_weight: 245 }),
      lift('overhead_press', { anchor_1rm: 100, best_weight: 85 }),
    ],
  },
  {
    name: 'A2 · main lift, RIR one under target (the back-off boundary)',
    question: 'the command still fires where it should — silence must not be blanket',
    weekIntent: 'base',
    lifts: [
      lift('squat', { current_avg_rir: 1, target_rir: 2, anchor_1rm: 250, best_weight: 240 }),
      lift('bench_press', { current_avg_rir: 1, target_rir: 2, best_weight: 120 }),
    ],
  },
  {
    name: 'A3 · main lift, RIR one OVER target (add weight)',
    question: 'progression language survives, and it is tappable',
    weekIntent: 'build',
    lifts: [
      lift('deadlift', { current_avg_rir: 3, target_rir: 2, best_weight: 245 }),
      lift('overhead_press', { current_avg_rir: 3, target_rir: 2, anchor_1rm: 100, best_weight: 75 }),
    ],
  },
  {
    name: 'A4 · THE ORIGINAL BUG — accessories worked hard',
    question: 'a Hip Thrust and a Barbell Row at the back-off boundary: numbers, never a command',
    weekIntent: 'base',
    lifts: [
      lift('hip_thrust', { current_avg_rir: 1, target_rir: 2, best_weight: 185 }),
      lift('barbell_row', { current_avg_rir: 1, target_rir: 2, best_weight: 110 }),
      lift('romanian_deadlift', { current_avg_rir: 0, target_rir: 2, best_weight: 155 }),
    ],
  },
  {
    name: 'A5 · plyo, isometric, mobility, band, carry',
    question: 'the four typed-but-unloaded rows, all at a deviation that would have commanded',
    weekIntent: 'build',
    lifts: [
      lift('box_jump', { current_avg_rir: 0, target_rir: 2, best_weight: 0 }),
      lift('plank', { current_avg_rir: 0, target_rir: 2, best_weight: 0 }),
      lift('wall_angel', { current_avg_rir: 0, target_rir: 2, best_weight: 0 }),
      lift('band_pull_apart', { current_avg_rir: 0, target_rir: 2, best_weight: 0 }),
      lift('farmers_carry', { current_avg_rir: 1, target_rir: 2, best_weight: 70 }),
    ],
  },
  {
    name: 'A6 · bodyweight work, and the assisted movements',
    question: 'a chin-up is bodyweight, not band — and it is not coached either',
    weekIntent: 'base',
    lifts: [
      lift('pullup', { current_avg_rir: 1, target_rir: 2, best_weight: 0 }),
      lift('chinup', { current_avg_rir: 1, target_rir: 2, best_weight: 0 }),
      lift('dip', { current_avg_rir: 0, target_rir: 2, best_weight: 0 }),
      lift('push_up', { current_avg_rir: 1, target_rir: 2, best_weight: 0 }),
    ],
  },
  {
    name: 'A7 · recovery week',
    question: 'the phase verdicts still reach main lifts, and still cannot reach an accessory',
    weekIntent: 'recovery',
    lifts: [
      lift('squat', { anchor_1rm: 250, best_weight: 180 }),
      lift('hip_thrust', { best_weight: 185 }),
      lift('box_jump', { best_weight: 0 }),
    ],
  },
  {
    name: 'A8 · taper week',
    question: 'same, on the taper branch — "maintain" is a command and must not leak',
    weekIntent: 'taper',
    lifts: [
      lift('bench_press', { anchor_1rm: 150, best_weight: 130 }),
      lift('barbell_row', { best_weight: 110 }),
      lift('plank', { best_weight: 0 }),
    ],
  },
  {
    name: 'A9 · peak week, upper and lower',
    question: 'the peak branch splits on isLowerBodyLift — neither half may reach an accessory',
    weekIntent: 'peak',
    lifts: [
      lift('squat', { current_avg_rir: 3, target_rir: 2, best_weight: 225 }),
      lift('bench_press', { current_avg_rir: 3, target_rir: 2, best_weight: 135 }),
      lift('hip_thrust', { current_avg_rir: 3, target_rir: 2, best_weight: 185 }),
    ],
  },
  {
    name: 'A10 · thin data — one session, no RIR recorded',
    question: 'the no-RIR branch (getting stronger / slipping / holding) still cannot reach a plyo',
    weekIntent: 'base',
    lifts: [
      lift('deadlift', { sessions_in_window: 1, current_avg_rir: null, target_rir: null, spine_e1rm_direction: 'improving' }),
      lift('squat', { sessions_in_window: 1, current_avg_rir: null, target_rir: null, spine_e1rm_direction: 'declining' }),
      lift('box_jump', { sessions_in_window: 1, current_avg_rir: null, target_rir: null, spine_e1rm_direction: 'declining', best_weight: 0 }),
    ],
  },
  {
    name: 'A11 · ⛔ A STALE CACHE — the payload still carries a pre-D-373 command',
    question: 'the client must refuse it. This is the case the old empty-label test could not catch.',
    weekIntent: 'base',
    lifts: [],
  },
  {
    name: 'A12 · a movement the tables have never heard of',
    question: 'an unmapped move counts as load and says nothing',
    weekIntent: 'base',
    lifts: [
      lift('zercher_good_morning_complex', { current_avg_rir: 0, target_rir: 2, best_weight: 95 }),
    ],
  },
  {
    // ⛔ THE MICHAEL CASE, Q-254. His real screen on 2026-08-03: Deadlift read "Working ~120 vs your
    // 150 baseline" — a light the previous program week measured against a typed number he had blown past — while
    // the AMRAP said 225 × 6 and beat his record at that weight. The working weight is the
    // PRESCRIPTION; the all-out set is the MEASUREMENT. Both now sit on the row, in that order.
    name: 'A13 · ⛔ THE AMRAP — a light working week over a rep record (Q-254)',
    question: 'does the measurement render, does it carry its date, and does it out-rank nothing?',
    weekIntent: 'base',
    lifts: [
      lift('deadlift', {
        anchor_1rm: 150, best_weight: 120, current_avg_rir: 2, target_rir: 2,
        last_all_out: {
          name: 'Deadlift', date: '2026-07-28', weight: 225, reps: 6,
          prior_best_reps_at_weight: 5, is_rep_record: true, rep_record_window_sessions: 40,
          estimated_1rm: 270, estimate_trusted: false, estimate_trusted_max_reps: 5,
        },
      }),
      // Measured, no record yet — the honest middle case.
      lift('bench_press', {
        anchor_1rm: 150, best_weight: 135,
        last_all_out: {
          name: 'Bench Press', date: '2026-07-30', weight: 165, reps: 4,
          prior_best_reps_at_weight: 7, is_rep_record: false, rep_record_window_sessions: 40,
          estimated_1rm: 190, estimate_trusted: true, estimate_trusted_max_reps: 8,
        },
      }),
      // ⛔ NOT MEASURED — a leader cycle prescribes no all-out set. The row must simply say less,
      // never reach for the working weight to fill the space.
      lift('overhead_press', { anchor_1rm: 100, best_weight: 85 }),
    ],
  },
];

/**
 * ⛔ A11 IS HAND-BUILT, NOT SERVER-COMPUTED, AND THAT IS THE POINT. It is a row as `coach_cache`
 * would have stored it BEFORE [D-373] — an accessory carrying a live command and a suggested
 * weight. The server can no longer produce this; the cache can still serve it. The old client test
 * (`verdict_label !== ''`) would have rendered every one of these.
 */
export const STALE_CACHE_ROWS = [
  { canonical_name: 'hip_thrust', display_name: 'Hip Thrust', verdict_label: 'back off weight', verdict_tone: 'caution', best_weight: 185, suggested_weight: 165, anchor_1rm: null },
  { canonical_name: 'barbell_row', display_name: 'Barbell Row', verdict_label: 'add weight', verdict_tone: 'action', best_weight: 110, suggested_weight: 115, anchor_1rm: null },
  { canonical_name: 'box_jump', display_name: 'Box Jump', verdict_label: 'back off weight', verdict_tone: 'caution', best_weight: 0, suggested_weight: null, anchor_1rm: null },
];

/** One athlete's rows, exactly as the screen would compose them. */
export function renderAthlete(a: SyntheticAthlete) {
  const rows = a.name.startsWith('A11')
    ? STALE_CACHE_ROWS.map((r) => ({ lift: r, row: composePerLiftRowText(r) }))
    : computeStrength(a.lifts, a.weekIntent).per_lift.map((l) => ({
      lift: l,
      row: composePerLiftRowText(l),
    }));
  return rows;
}

/**
 * The all-out (AMRAP) lines under one row, if the lift carries a measurement — Q-254 slice 1.
 *
 * ⛔ IT IS HERE FOR THE SAME REASON THE ROW TEXT IS: the assembled screen is where these bugs live.
 * A fixture proves the sentence is correct in isolation; only this shows it sitting under the
 * verdict, where a rep record and a "back off weight" could end up on the same lift and nobody
 * would notice until it reached a device.
 */
export function renderAllOut(lift: { all_out?: Parameters<typeof composeAllOutRowText>[0] }) {
  const a = lift?.all_out ?? null;
  const dateLabel = a?.date ? String(a.date).slice(5) : '';
  return composeAllOutRowText(a, dateLabel);
}

function pad(s: string, n: number) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function printAll(): void {
  for (const a of ATHLETES) {
    console.log('\n' + '─'.repeat(96));
    console.log(a.name);
    console.log('   week intent: ' + a.weekIntent + '   —   ' + a.question);
    console.log('─'.repeat(96));
    console.log(
      '   ' + pad('MOVEMENT', 22) + pad('TYPE', 19) + pad('COACHED', 9) + 'WHAT THE ROW SAYS',
    );
    for (const { lift: l, row } of renderAthlete(a)) {
      const name = String((l as { display_name?: string }).display_name ?? '');
      const text = row.text === '' ? '(nothing)' : row.text;
      const flag = containsCommand(row.text) && !row.coached ? '   ⛔ COMMAND LEAKED' : '';
      console.log(
        '   ' + pad(name, 22) + pad(typeForExercise(String((l as { canonical_name?: string }).canonical_name ?? '')), 19) +
          pad(row.coached ? 'yes' : 'no', 9) + text + (row.tappable ? '   [tap → adjust]' : '') + flag,
      );
      const allOut = renderAllOut(l as { all_out?: Parameters<typeof composeAllOutRowText>[0] });
      if (allOut) {
        console.log('   ' + ' '.repeat(50) + allOut.set_line);
        console.log('   ' + ' '.repeat(50) + allOut.record_line);
        if (allOut.estimate_line) console.log('   ' + ' '.repeat(50) + allOut.estimate_line);
      }
    }
  }
  console.log('\n' + '─'.repeat(96));
}

if (import.meta.main) printAll();
