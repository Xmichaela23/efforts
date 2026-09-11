/**
 * ═══ WHICH SESSION IS LISTED FIRST ON A DAY, DECIDED HERE (2026-09-10, audit H-T16) ═══════════════
 *
 * ⛔ THE PHONE DECIDED THIS (`src/lib/pairing-timing.ts`, deleted) and the plan builder decided it
 * again another way (`generate-combined-plan/week-builder.ts decideOrdering`, which still writes the
 * AM/PM word onto a combined plan's rows at activation). On a combined plan with the default
 * preference the server said run first and the phone showed the lift first. get-week now stamps
 * `day_order` on every item and plan-overview on every planned row; the screens sort by it and hold
 * no rule of their own.
 *
 * THE RULE, moved unchanged from the phone:
 *   1. A lower-body lift and its same-day partner. The partner is the first found of long ride,
 *      quality run, quality ride, easy run, easy ride. A long ride goes first (heavy lower work
 *      after a long ride, never before — a legacy pair; `week-model` forbids it now). Every other
 *      partner comes AFTER the lift: FIELD — Eddens, resistance before endurance on a concurrent day
 *      (+6.91% lower-body dynamic strength); sprints and climbs empty local glycogen and fatigue the
 *      CNS, and a heavy bar after them is lifted on compromised stabilisers (Michael, 2026-08-18).
 *      `strength_ordering_preference` is not consulted: the choice it offered was to invert that.
 *   2. Else a stored AM/PM on the row (`workout_metadata.timing`, activate-plan on a combined plan).
 *   3. Else discipline: swim, bike, run, strength, then the rest. OURS — a stable tie-break with no
 *      outside source (docs/STATE-SOURCES.md).
 *   4. Else the name.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "day-order" supabase/functions --include=index.ts
 */

export type DayOrderRow = {
  type?: string | null;
  discipline?: string | null;
  name?: string | null;
  tags?: unknown;
  timing?: unknown;
  workout_metadata?: unknown;
};

const LOWER_PAIRING_PARTNERS = ['long_ride', 'quality_run', 'quality_bike', 'easy_run', 'easy_bike'] as const;
type PartnerKind = (typeof LOWER_PAIRING_PARTNERS)[number];

function tagsOf(r: DayOrderRow): string[] {
  const raw = Array.isArray(r.tags) ? r.tags : [];
  return raw.map((t) => String(t).toLowerCase());
}

/** The matrix slot a row fills, tag first, then the conservative name patterns the server's own slot reader uses. */
export function classifyKind(r: DayOrderRow): PartnerKind | 'lower_body_strength' | 'other' {
  const ty = String(r.type ?? r.discipline ?? '').toLowerCase();
  const tags = tagsOf(r);
  const name = String(r.name ?? '').toLowerCase();
  if (ty === 'strength') {
    if (tags.includes('lower_body')) return 'lower_body_strength';
    if (/\(lower\)|lower body|deadlift|squat|hip thrust|rdl|step-up|split|posterior|neural/.test(name)) return 'lower_body_strength';
    return 'other';
  }
  if (ty === 'run' || ty === 'walk') {
    if (tags.includes('long_run')) return 'other';
    if (tags.includes('quality') || tags.includes('intervals') || tags.includes('marathon_pace') || tags.includes('race_specific')) return 'quality_run';
    return 'easy_run';
  }
  if (ty === 'bike' || ty === 'ride' || ty === 'cycling') {
    if (tags.includes('long_ride')) return 'long_ride';
    if (tags.includes('quality') || tags.includes('vo2') || tags.includes('sweet') || tags.includes('threshold') || tags.includes('tempo')) return 'quality_bike';
    return 'easy_bike';
  }
  return 'other';
}

function decideOrdering(partnerKind: PartnerKind): { lower: 'AM' | 'PM'; partner: 'AM' | 'PM' } {
  if (partnerKind === 'long_ride') return { lower: 'PM', partner: 'AM' };
  return { lower: 'AM', partner: 'PM' };
}

/** The lift and its first-found partner get a half of the day; every other row stays untimed. */
export function dayTimings<T>(rows: readonly T[], read: (r: T) => DayOrderRow): Map<T, 'AM' | 'PM'> {
  const out = new Map<T, 'AM' | 'PM'>();
  const lower = rows.find((r) => classifyKind(read(r)) === 'lower_body_strength');
  if (!lower) return out;
  for (const kind of LOWER_PAIRING_PARTNERS) {
    const partner = rows.find((r) => r !== lower && classifyKind(read(r)) === kind);
    if (!partner) continue;
    const o = decideOrdering(kind);
    out.set(lower, o.lower);
    out.set(partner, o.partner);
    return out;
  }
  return out;
}

function storedTiming(r: DayOrderRow): 'AM' | 'PM' | null {
  const meta = r.workout_metadata && typeof r.workout_metadata === 'object' ? (r.workout_metadata as { timing?: unknown }).timing : null;
  const t = r.timing ?? meta;
  return t === 'AM' || t === 'PM' ? t : null;
}

export function disciplineRank(r: DayOrderRow): number {
  const t = String(r.type ?? r.discipline ?? '').toLowerCase();
  const n = String(r.name ?? '').toLowerCase();
  if (t === 'swim' || /\bswim\b/.test(n)) return 0;
  if (t === 'bike' || t === 'ride' || /\bbrick\b.*\b(bike|ride)\b/.test(n) || /\b(bike|ride)\b.*\bbrick\b/.test(n)) return 1;
  if (t === 'run' || /\bbrick\b.*\brun\b/.test(n) || /\brun\b.*\bbrick\b/.test(n)) return 2;
  if (t === 'strength') return 3;
  return 4;
}

/** One day's rows in the order they are listed. Stable: ties keep the input order. */
export function orderDay<T>(rows: readonly T[], read: (r: T) => DayOrderRow): T[] {
  if (!Array.isArray(rows) || rows.length <= 1) return Array.isArray(rows) ? rows.slice() : [];
  const timings = dayTimings(rows, read);
  const timingRank = (r: T): number => {
    const t = timings.get(r) ?? storedTiming(read(r));
    if (t === 'AM') return 0;
    if (t === 'PM') return 2;
    return 1;
  };
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const t = timingRank(a.r) - timingRank(b.r);
      if (t !== 0) return t;
      const d = disciplineRank(read(a.r)) - disciplineRank(read(b.r));
      if (d !== 0) return d;
      const n = String(read(a.r).name || '').localeCompare(String(read(b.r).name || ''));
      if (n !== 0) return n;
      return a.i - b.i;
    })
    .map((x) => x.r);
}

/**
 * `day_order` for every row, 1-based within its day. `keyOf` names the day (a date, or a plan
 * week + day number); rows with no day get no order.
 */
export function dayOrderFor<T>(rows: readonly T[], keyOf: (r: T) => string | null, read: (r: T) => DayOrderRow): Map<T, number> {
  const byDay = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const list = byDay.get(k);
    if (list) list.push(r); else byDay.set(k, [r]);
  }
  const out = new Map<T, number>();
  for (const list of byDay.values()) {
    orderDay(list, read).forEach((r, i) => out.set(r, i + 1));
  }
  return out;
}
