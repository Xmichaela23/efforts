// =============================================================================
// planned-session/duration — ONE duration reader for a PLANNED session
// =============================================================================
//
// Stage 2 of D-403 (`docs/DECISIONS-LOG-2.md`).
//
// ⛔ THE BUG THIS CLOSES, which was paid for twice. The swap gate read the root total; the row
// printed the steps-sum. Today's card read `63:00` while the gate computed `0`, so the swap control
// vanished **on one surface only** — and it looked correct at every call site, because each call site
// had its own ladder and each ladder was individually defensible.
//
// ⛔ PLANNED ONLY. `resolveMovingSeconds` is TWO readers keyed on `workout_status`: a planned branch
// (the ladder below) and a completed branch (`moving_time`, `total_elapsed_time`, `metrics.*`,
// distance÷speed, sensor samples). **The completed branch does NOT move here and must not.** Putting
// executed-time logic behind a name that says "planned" would be a fresh copy of the confusion this
// file exists to end. See SPEC §1.
//
// ⚠️ THIS FILE TAKES A ROW, NOT A `computed` BLOB. Consumers handed an already-extracted structure
// (`PreRunScreen`, `workoutDisplayTemplates`) are a
// different concern and are deliberately untouched — they are not reading a planned session, they are
// rendering a structure someone else already resolved.

/** Loosely-typed on purpose: raw `planned_workouts` rows, server-mapped rows and client-mapped rows all land here. */
type PlannedRowLike = Record<string, unknown> | null | undefined;

/**
 * `computed` arrives as an object from `get-week` and as a JSON **string** from some direct table
 * reads. `computeMinutes` parsed it; `resolveMovingSeconds` did not, and returned null for the string
 * form. Merged here, so the shape of the transport stops being a source of disagreement.
 */
function parseComputed(row: PlannedRowLike): Record<string, unknown> | null {
  try {
    const c = (row as Record<string, unknown>)?.computed;
    if (!c) return null;
    if (typeof c === 'string') return JSON.parse(c);
    return c as Record<string, unknown>;
  } catch {
    return ((row as Record<string, unknown>)?.computed as Record<string, unknown>) || null;
  }
}

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * ⛔ THE BADGE'S CONTRACT, AND IT IS DELIBERATELY NARROW. The authoritative stored total at the row
 * root, or nothing. **It may never gain fallbacks** (SPEC §1): it feeds a displayed badge, and a
 * wrong duration on screen is a lie. `resolvePlannedDurationMinutes` is a thin wrapper over this.
 *
 * ⚠️ IT IS NOT A NARROWER `plannedDurationSeconds`. It answers a different question — *"is there an
 * authoritative stored total?"*, not *"how long is this session?"* — and the whole reason the two
 * readers are allowed to disagree is that one of them must be allowed to say "I don't know".
 */
export function storedPlannedTotalSeconds(row: PlannedRowLike): number | null {
  try {
    if (!row) return null;
    const rootTs = positive((row as Record<string, unknown>)?.total_duration_seconds);
    return rootTs == null ? null : Math.round(rootTs);
  } catch {
    return null;
  }
}

/** Price a `computed.steps[]` entry in seconds. Direct time first; a distance step is estimated from its pace target. */
function stepSeconds(st: Record<string, unknown>): number {
  const direct = positive(st?.seconds) ?? positive(st?.durationSeconds);
  if (direct != null) return direct;

  /**
   * ⚠️ DISTANCE-BASED STEPS ARE PRICED FROM PACE — a capability that lived ONLY in
   * `PlannedWorkoutSummary.computeMinutes` and is preserved here rather than dropped. A session
   * authored as "6 × 800m @ 5k pace" carries no seconds anywhere; without this it reads as having no
   * duration at all, and the summary that used to show a time would show nothing.
   */
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

/** Sum `intervals[]`, expanding `{ segments, repeatCount }` blocks. */
function intervalSeconds(intervals: unknown): number {
  if (!Array.isArray(intervals) || intervals.length === 0) return 0;
  try {
    return intervals.reduce((acc: number, it: Record<string, unknown>) => {
      const repeat = positive(it?.repeatCount);
      if (Array.isArray(it?.segments) && repeat != null) {
        const segSum = (it.segments as Record<string, unknown>[]).reduce(
          (s: number, sg) => s + (positive(sg?.duration) ?? 0),
          0,
        );
        return acc + segSum * repeat;
      }
      return acc + (positive(it?.duration) ?? 0);
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * ⚠️ LAST RESORT: read a duration out of PROSE. `steps_preset` tokens and the description are text,
 * and a number scraped from text is the weakest thing in this file — but it is what the app does
 * today for library-plan rows that carry no structure, and stage 2 is a consolidation, not a
 * behaviour change. It stays last, where a real stored total always beats it.
 */
function textSeconds(row: PlannedRowLike): number {
  const src = row as Record<string, unknown>;
  const readFirst = (s: string): number => {
    const min = s.match(/(\d+)\s*(?:min|m|minutes?)/i);
    if (min) {
      const mins = positive(min[1]);
      if (mins != null) return mins * 60;
    }
    const hr = s.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/i);
    if (hr) {
      const hours = positive(hr[1]);
      if (hours != null) return hours * 3600;
    }
    return 0;
  };
  try {
    const steps = Array.isArray(src?.steps_preset) ? (src.steps_preset as unknown[]) : [];
    for (const step of steps) {
      const got = readFirst(String(step).toLowerCase());
      if (got > 0) return got;
    }
  } catch { /* malformed steps_preset — fall through to the description */ }
  try {
    const txt = String(src?.description ?? '').toLowerCase();
    if (txt) return readFirst(txt);
  } catch { /* unreadable description — the row simply has no duration */ }
  return 0;
}

/**
 * ⛔ THE ONE ANSWER to "how long is this planned session". Every planning-side surface reads this, so
 * the calendar chip, Today's card, the swap gate and the summary can no longer disagree.
 *
 * The ladder, highest authority first:
 *
 *   1. root `total_duration_seconds`        — what materialization stored
 *   2. `computed.total_duration_seconds`    — what the expander computed
 *   3. sum of `computed.steps[]`            — time per step, or distance priced at its pace target
 *   4. sum of `intervals[]`                 — legacy authored structure
 *   5. a number scraped from `steps_preset` / `description`
 *
 * ⚠️ NO `workout_status` GATE, DELIBERATELY. The caller already knows it is holding a planned
 * session; many of the rows that reach it (library-plan rows, client-mapped rows) carry no status at
 * all, and gating on a field they do not have would return null for sessions that plainly have a
 * duration. `resolveMovingSeconds` keeps its own status gate and delegates here for the planned case.
 *
 * ⚠️ ⛔ THE PRIORITY ORDER IS A DELIBERATE CHANGE FOR ONE CALLER — see the stage-2 note in
 * `planned-session-golden.test.ts`. `computeMinutes` preferred the steps-sum OVER the stored total;
 * every other reader preferred the stored total. They only ever differ when a row carries both and
 * they disagree, and when that happens the stored total is the number the athlete already sees on the
 * calendar and on Today's card. The summary was the outlier; it now agrees with the other three.
 */
export function plannedDurationSeconds(row: PlannedRowLike): number | null {
  try {
    if (!row) return null;
    const src = row as Record<string, unknown>;
    const comp = parseComputed(row);

    // 1 — the stored root total.
    const root = storedPlannedTotalSeconds(row);
    if (root != null) return root;

    // 2 — the computed total.
    const compTotal = positive(comp?.total_duration_seconds);
    if (compTotal != null) return Math.round(compTotal);

    // 3 — sum the steps.
    if (Array.isArray(comp?.steps) && (comp.steps as unknown[]).length > 0) {
      try {
        const sum = (comp.steps as Record<string, unknown>[]).reduce(
          (a: number, s) => a + stepSeconds(s ?? {}),
          0,
        );
        if (sum > 0) return Math.round(sum);
      } catch { /* a malformed step must not sink the whole ladder — try intervals next */ }
    }

    // 4 — sum the intervals.
    const iv = intervalSeconds(src?.intervals);
    if (iv > 0) return Math.round(iv);

    // 5 — scrape the prose.
    const txt = textSeconds(row);
    if (txt > 0) return Math.round(txt);

    return null;
  } catch {
    return null;
  }
}

/**
 * Minutes, floored at 1. The floor is a DISPLAY guard, not a fallback: a real 40-second session must
 * not render as `0 min`, which reads as "no session" rather than "a short one".
 */
export function plannedDurationMinutes(row: PlannedRowLike): number | null {
  const secs = plannedDurationSeconds(row);
  return secs == null ? null : Math.max(1, Math.round(secs / 60));
}

export default plannedDurationSeconds;
