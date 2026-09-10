/**
 * ═══ HOW LONG A LIFTING SESSION TAKES, ESTIMATED FROM ITS OWN ROWS ═══════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3c.
 *
 * ⛔ MOVED TO THE SERVER UNCHANGED (2026-09-10, audit H-T02, Stage 2 item 10) — was
 * `src/lib/strength-session-minutes.ts`. `get-week` prints a lifting session's header length from it
 * (`planned_duration_label`), so the phone no longer prices a session off its rows.
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "strength-session-minutes" supabase/functions
 *
 * ⛔ WHAT THIS REPLACES, AND WHY. The composer stamps a FIXED figure on every strength session —
 * 55 on a lifting day, 45 on a test day, 20 on the plyo day (`standing-plan/compose.ts`). Those are
 * three constants with no page behind them and no relationship to what the day actually prescribes:
 * a four-row session and a seven-row session both said 55. This prices the session off the rows it
 * is made of instead.
 *
 * ⛔ THE FORMULA IS THE WORK ORDER'S, VERBATIM: for each row, `sets × (time under the bar + the rest
 * the timer would run for that kind of set)`, summed, shown as a range.
 *
 * ⚠️ THE REST IS NOT RE-DECIDED HERE. It is the number the logger's countdown runs: the row's stamped
 * `rest_seconds` / `warmup_rest_seconds` (2026-09-10, audit H-S07), and on a row stamped before those
 * fields existed, `restSecondsFor` — the rule the stamp comes from. A second opinion about rest is how
 * two screens end up disagreeing about the same set. ⛔ Note what that means for provenance: the source
 * gives a rest RULE and no minutes, so every figure underneath this estimate is ours — see
 * `REST_MINUTES_ARE_OURS` in `strength/rest-seconds.ts`.
 *
 * ⚠️ THE TIMER'S OWN SUPPRESSIONS ARE DELIBERATELY NOT MODELLED. The logger skips the countdown
 * after the last set of a row, and on the first half of a superset, because there is nothing for the
 * athlete to wait through — but time still passes there. Those are display rules, not a claim that
 * the rest is free, and the work order asks for `sets × (work + rest)`.
 */
import { restSecondsFor, WARMUP_REST_SEC } from './strength/rest-seconds.ts';

/**
 * ⛔⛔ OURS, AND THE ONE ESTIMATE IN THIS FILE THAT IS NOT READ OFF A ROW. The source gives no tempo
 * and no time-under-tension figure anywhere, so this is the field's number, not his:
 *
 *   · **2 seconds** is a brisk controlled rep — roughly one second up, one down — which is what a
 *     speed set and the top of a heavy set actually look like.
 *   · **4 seconds** is the slow end the same field guidance describes for hypertrophy work, where a
 *     two-to-three second eccentric is the norm and the last reps of a set slow down further.
 *
 * ⚠️ **THIS BAND IS WHERE THE RANGE COMES FROM.** The rest is a fixed clock, so it contributes the
 * same number to both ends; the spread the athlete sees is the honest uncertainty about how long
 * they spend under the bar. ⛔ It is marked as an estimate in the code and nowhere on the screen —
 * the work order asks for the marking here, and a provenance clause is not a line an athlete reads.
 */
export const SECONDS_PER_REP_ESTIMATE_IS_OURS =
  'Two to four seconds a rep is the field\'s figure for a controlled repetition, not the source\'s. '
  + 'He gives no tempo anywhere.';
const SEC_PER_REP_LOW = 2;
const SEC_PER_REP_HIGH = 4;

/** A planned strength row. Only the fields this file reads. */
type StrengthRow = {
  name?: unknown;
  execution_name?: unknown;
  sets?: unknown;
  reps?: unknown;
  target_reps?: unknown;
  slot_intent?: unknown;
  set_plan?: unknown;
  rest_seconds?: unknown;
  warmup_rest_seconds?: unknown;
};

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * A rep target as a low and a high. Rows carry `1-5`, `6-12`, `8-12+`, a bare `4`, or nothing.
 * ⚠️ A TRAILING `+` IS NOT AN OPEN END HERE. It means "at least", and pricing it as unbounded would
 * make the estimate unbounded; the printed number is treated as the high.
 */
export function repBand(row: StrengthRow): { lo: number; hi: number } | null {
  const raw = row?.reps ?? row?.target_reps;
  if (raw == null) return null;
  const text = String(raw).trim();
  const range = text.match(/^(\d+)\s*[-–—]\s*(\d+)/);
  if (range) {
    const lo = positive(range[1]);
    const hi = positive(range[2]);
    if (lo != null && hi != null) return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
  }
  const single = text.match(/^(\d+)/);
  const n = single ? positive(single[1]) : null;
  return n == null ? null : { lo: n, hi: n };
}

type PlannedSet = { warmup?: unknown; setType?: unknown; reps?: unknown };

/**
 * The sets a row actually prescribes.
 *
 * ⛔ `set_plan` WINS WHERE IT EXISTS, AND THIS IS THE ONE PLACE THIS FILE GOES BEYOND THE WORD
 * "sets". A max-effort row stores `sets: 1` and a `set_plan` holding a four-step warm-up ladder plus
 * the top set — five sets the athlete performs and roughly five minutes of the session. Counting the
 * `1` would price a heavy day as the lightest one in the week, which is the opposite of true.
 *
 * ⚠️ A WARM-UP SET RESTS LIKE A WARM-UP, the same `WARMUP_REST_SEC` the logger's timer uses: a
 * warm-up set is not the work and does not take the work's rest.
 */
function setsOf(row: StrengthRow): Array<{ warmup: boolean; reps: { lo: number; hi: number } | null }> {
  const band = repBand(row);
  const plan = Array.isArray(row?.set_plan) ? (row.set_plan as PlannedSet[]) : null;
  if (plan && plan.length > 0) {
    return plan.map((s) => {
      const warmup = s?.warmup === true || String(s?.setType ?? '').toLowerCase() === 'warmup';
      const own = positive(s?.reps);
      return { warmup, reps: own != null ? { lo: own, hi: own } : band };
    });
  }
  const count = positive(row?.sets) ?? 1;
  return Array.from({ length: Math.round(count) }, () => ({ warmup: false, reps: band }));
}

export type SessionMinutes = { low: number; high: number };

/**
 * Seconds, low and high, for one session's rows. `null` when the rows say nothing usable — the
 * caller then keeps whatever length the plan stored, rather than showing a blank where a number was.
 */
export function strengthSessionSeconds(rows: unknown): SessionMinutes | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let low = 0;
  let high = 0;
  let priced = 0;

  for (const raw of rows as StrengthRow[]) {
    const name = String(raw?.execution_name || raw?.name || '').trim();
    if (!name) continue;
    const intent = typeof raw?.slot_intent === 'string' ? raw.slot_intent : null;

    for (const set of setsOf(raw)) {
      // ⛔ THE COUNTDOWN'S OWN NUMBER. The row's stamp where it carries one; otherwise the rule the
      // stamp comes from, which reads the slot intent first and the movement and rep count after.
      const rest = set.warmup
        ? (positive(raw?.warmup_rest_seconds) ?? WARMUP_REST_SEC)
        : (positive(raw?.rest_seconds) ?? restSecondsFor(name, set.reps?.hi ?? undefined, intent));
      const reps = set.reps;
      low += rest + (reps ? reps.lo * SEC_PER_REP_LOW : 0);
      high += rest + (reps ? reps.hi * SEC_PER_REP_HIGH : 0);
      priced += 1;
    }
  }

  return priced === 0 ? null : { low, high };
}

/**
 * ⛔ FIVE-MINUTE STEPS, AND THAT IS A HONESTY CHOICE RATHER THAN A COSMETIC ONE. This is an estimate
 * built on a tempo band the source never gives; printing `31–38 min` would claim a precision the
 * inputs do not have. The low end rounds down and the high end rounds up, so the range always
 * contains the computed figure rather than trimming it.
 */
const STEP_MIN = 5;
const floorTo = (m: number) => Math.max(STEP_MIN, Math.floor(m / STEP_MIN) * STEP_MIN);
const ceilTo = (m: number) => Math.max(STEP_MIN, Math.ceil(m / STEP_MIN) * STEP_MIN);

export function strengthSessionMinutes(rows: unknown): SessionMinutes | null {
  const secs = strengthSessionSeconds(rows);
  if (!secs) return null;
  const low = floorTo(secs.low / 60);
  const high = ceilTo(secs.high / 60);
  return { low, high: Math.max(low, high) };
}

/**
 * `30–40 min`, or `35 min` when both ends land on the same step. The work order's own shape (§3c).
 * ⚠️ AN EN DASH, not a hyphen — it is a range, and the rest of the app's ranges are written that way.
 */
export function formatStrengthSessionMinutes(rows: unknown): string | null {
  const m = strengthSessionMinutes(rows);
  if (!m) return null;
  return m.low === m.high ? `${m.low} min` : `${m.low}–${m.high} min`;
}
