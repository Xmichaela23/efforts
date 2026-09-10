/**
 * HOW LONG WAS THIS SESSION PLANNED TO BE — one answer, for every consumer.
 *
 * ⛔ WHY THIS EXISTS (2026-08-01). Two different surfaces asked that question and each looked in one
 * place, so an UNSTRUCTURED session — "~108 min easy, all conversational", no steps — was invisible to
 * both, in different ways:
 *   · `auto-attach-planned` summed the STEPS, found none, and refused to attach a ride to its own
 *     planned Long Ride. Every unstructured endurance session in the app was unattachable.
 *   · `analyze-cycling-workout` summed the STEPS, found none, and scored duration adherence 0 — so a
 *     64-of-108-minute ride reported 0% executed instead of 59%.
 * Meanwhile `analyze-running-workout` read `computed.total_duration_seconds` and worked. Three
 * readers, three answers, one fact.
 *
 * ⛔⛔ AND IT IS NOW THE ONLY ANSWER, PHONE INCLUDED (2026-09-10, audit H-T01 / Stage 2 item 10). The
 * phone kept its own five-rung ladder (`src/lib/planned-session/duration.ts`) that read in a
 * DIFFERENT ORDER from this file — stored total first there, step sum first here — so Today's
 * "63:00" and the Performance duration chip could grade against two numbers for one session. The
 * phone ladder is deleted; `get-week` and `session_detail_v1` send this file's answer and the phone
 * prints it.
 *
 * ⛔ THE ORDER IS SETTLED HERE, ONCE, AND THE STORED TOTAL LEADS:
 *   1. root `total_duration_seconds`       — what `materialize-plan` stored
 *   2. `computed.total_duration_seconds`   — what the expander computed
 *   3. sum of `computed.steps[]`           — seconds, or a distance step priced at its pace target
 *   4. sum of `intervals[]`                — legacy authored structure (segments × repeatCount)
 *   5. the `duration` column               — MINUTES, the only length some library rows carry
 * ⚠️ WHY THE STORED TOTAL AND NOT THE STEPS: it is the number athletes already see — the calendar
 * chip and Today's card have always printed it — and `materialize-plan` writes it FROM the steps, so
 * the two agree on every materialized row. They only differ on a row whose steps were edited after
 * expansion, and there the stored total is what every screen had already shown.
 * ⚠️ NO PROSE SCRAPING. The phone's last rung read "45 min" out of the description; a number lifted
 * from text is not a planned length, and the `duration` column covers the rows that rung was for.
 *
 * ⛔ SHARED = DEPLOY TRAP. Every function importing this must be redeployed when it changes:
 *     grep -rln "planned-duration" supabase/functions
 */

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** `computed` arrives as an object from most readers and as a JSON STRING from some direct reads. */
function parseComputed(planned: any): Record<string, unknown> | null {
  const c = planned?.computed;
  if (!c) return null;
  if (typeof c === 'string') {
    try { return JSON.parse(c); } catch { return null; }
  }
  return typeof c === 'object' ? c : null;
}

/**
 * Price one `computed.steps[]` entry in seconds. Direct time first; a distance step is estimated from
 * its pace target — "6 × 800m @ 5k pace" carries no seconds anywhere, and without this it reads as
 * having no length at all. (Carried over from the phone ladder, which was the only reader that did it.)
 */
function stepSeconds(st: Record<string, unknown>): number {
  const direct = positive(st?.seconds) ?? positive(st?.durationSeconds) ?? positive(st?.duration)
    ?? positive(st?.duration_sec) ?? positive(st?.timeSeconds);
  if (direct != null) return direct;

  const meters = positive(st?.distanceMeters);
  if (meters == null) return 0;

  const secPerMeter = (() => {
    const pr = st?.pace_range as unknown;
    if (Array.isArray(pr) && pr.length === 2) {
      const a = positive(pr[0]);
      const b = positive(pr[1]);
      if (a != null && b != null) return (a + b) / 2 / 1609.34;
    } else if (pr && typeof pr === 'object') {
      const o = pr as { lower?: unknown; upper?: unknown };
      const a = positive(o.lower);
      const b = positive(o.upper);
      if (a != null && b != null) return (a + b) / 2 / 1609.34;
    }
    const perMi = positive(st?.pace_sec_per_mi);
    if (perMi != null) return perMi / 1609.34;
    // Formatted target, e.g. "7:30/mi" or "4:40/km".
    const m = String(st?.paceTarget ?? '').match(/(\d+):(\d{2})\/(mi|km)/i);
    if (m) {
      const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      return sec / (m[3].toLowerCase() === 'mi' ? 1609.34 : 1000);
    }
    return null;
  })();

  return secPerMeter == null ? 0 : meters * secPerMeter;
}

/** Seconds a planned session's STEPS add up to, or null when it has none. */
export function plannedStepSeconds(planned: any): number | null {
  const comp = parseComputed(planned);
  const steps = Array.isArray(comp?.steps) ? comp!.steps as Record<string, unknown>[] : [];
  let sec = 0;
  for (const st of steps) sec += stepSeconds(st ?? {});
  return sec > 0 ? Math.round(sec) : null;
}

/** Sum `intervals[]`, expanding `{ segments, repeatCount }` blocks. */
function intervalSeconds(intervals: unknown): number | null {
  if (!Array.isArray(intervals) || intervals.length === 0) return null;
  let total = 0;
  for (const it of intervals as Record<string, unknown>[]) {
    const repeat = positive(it?.repeatCount);
    if (Array.isArray(it?.segments) && repeat != null) {
      const seg = (it.segments as Record<string, unknown>[]).reduce((s, sg) => s + (positive(sg?.duration) ?? 0), 0);
      total += seg * repeat;
    } else {
      total += positive(it?.duration) ?? positive(it?.seconds) ?? 0;
    }
  }
  return total > 0 ? Math.round(total) : null;
}

/**
 * The planned session's length in seconds, or null if it never stated one. See the header for the order.
 *
 * ⚠️ `duration` is MINUTES (verified against a real row: 108 on a "~108 min easy" ride). The >=1000
 * guard covers legacy rows that stored seconds there — the same heuristic `auto-attach-planned`
 * applies to `workouts.moving_time`.
 */
export function resolvePlannedDurationSeconds(planned: any): number | null {
  try {
    if (!planned) return null;

    const root = positive(planned?.total_duration_seconds);
    if (root != null) return Math.round(root);

    const comp = parseComputed(planned);
    const computedTotal = positive(comp?.total_duration_seconds);
    if (computedTotal != null) return Math.round(computedTotal);

    const fromSteps = plannedStepSeconds(planned);
    if (fromSteps != null) return fromSteps;

    const fromIntervals = intervalSeconds(planned?.intervals);
    if (fromIntervals != null) return fromIntervals;

    const dur = positive(planned?.duration);
    if (dur != null) return Math.round(dur < 1000 ? dur * 60 : dur);

    return null;
  } catch {
    return null;
  }
}
