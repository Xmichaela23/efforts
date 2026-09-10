/**
 * MY RECORD'S "LOGGED SUGGESTS" LINES — and the accept behind their Update button (2026-09-10, audit H-B12).
 *
 * ⛔ THE LOCK IS RESPECTED. My Record ran `suggestBaselineUpdate` on the phone against the TYPED lift, so a
 * lift the athlete had locked still prompted there (Profile, on `resolveStrengthCapacity`, did not), and
 * Update wrote `performance_numbers` straight from the phone. The lifts now go through the resolver every
 * plan and screen uses — locked, then trusted logged, then typed — and its own `suggestion`; the Update tap
 * goes to `save-baselines`, which re-runs this file and refuses a number that moved since the line was drawn.
 *
 * Swim moved unchanged: the typed 100-yard pace against the learned 100-metre pace, converted.
 *
 * Pure: `athletic-record` builds the lines from it, `save-baselines` checks and saves the accept from it.
 */
import { resolveStrengthCapacity, canonicalizeLiftKey, type CanonicalLiftKey } from './state-trend/capacity-resolver.ts';
import { suggestBaselineUpdate } from './state-trend/reconcile.ts';

/** The four lifts My Record lists. */
export const RECORD_LIFT_KEYS: CanonicalLiftKey[] = ['deadlift', 'squat', 'bench', 'overheadPress1RM'];

export type RecordSuggestion = {
  /** The logged number the Update button saves: pounds for a lift, seconds per 100 yd for swim. */
  computed: number;
  /** "225 lbs" · "1:32" */
  display: string;
  /** "+13.3%" · "-6%" */
  pct_display: string;
};

export type RecordLiftRow = {
  key: CanonicalLiftKey;
  /** The number the app runs on (locked, then trusted logged, then typed), whole pounds; null = none. */
  value: number | null;
  locked: boolean;
  suggestion: RecordSuggestion | null;
};

export type RecordSwimPace = {
  /** The typed 100-yard pace as stored ("1:40"); null = none. */
  value: string | null;
  suggestion: RecordSuggestion | null;
};

type Baselines = {
  performanceNumbers: Record<string, unknown> | null | undefined;
  learnedFitness: Record<string, any> | null | undefined;
  asOf: string;
};

const pctDisplay = (p: number) => `${p > 0 ? '+' : ''}${p}%`;

const parseMmSs = (s: unknown): number | null => {
  const m = /^(\d+):(\d{2})$/.exec(String(s ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const fmtMmSs = (sec: number): string => {
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return `${mm}:${String(ss).padStart(2, '0')}`;
};

export function recordLiftRows(args: Baselines & { lockedBaselines: Record<string, unknown> | null | undefined }): RecordLiftRow[] {
  const s1rms = (args.learnedFitness?.strength_1rms ?? null) as Record<string, any> | null;
  return RECORD_LIFT_KEYS.map((key) => {
    const r = resolveStrengthCapacity({
      key,
      typed: (args.performanceNumbers ?? null) as Record<string, any> | null,
      learnedStrength1rms: s1rms,
      locked: (args.lockedBaselines ?? null) as Record<string, any> | null,
      asOf: args.asOf,
    });
    const sug = r.suggestion;
    return {
      key,
      value: r.value != null && r.source !== 'none' ? Math.round(r.value) : null,
      locked: r.source === 'locked',
      suggestion: sug ? { computed: sug.computed, display: `${sug.computed} lbs`, pct_display: pctDisplay(sug.divergencePct) } : null,
    };
  });
}

export function recordSwimPace(args: Baselines): RecordSwimPace {
  const raw = args.performanceNumbers?.swimPace100;
  const value = typeof raw === 'string' && raw ? raw : null;
  const baseYd = parseMmSs(raw);
  const lr = args.learnedFitness?.swim_pace_per_100m;
  if (baseYd == null || !lr || !(Number(lr.value) > 0)) return { value, suggestion: null };
  // learned s/100m → s/100yd to compare with the typed 100yd pace (100 yd = 91.44 m — a unit, not a tuning number)
  const sug = suggestBaselineUpdate({
    key: 'swimPace100', label: 'Swim 100yd', baseline: baseYd,
    learned: { value: Math.round(Number(lr.value) * 0.9144), confidence: lr.confidence, sample_count: Number(lr.sample_count) },
    asOf: args.asOf,
  });
  return {
    value,
    suggestion: sug ? { computed: sug.computed, display: fmtMmSs(sug.computed), pct_display: pctDisplay(sug.divergencePct) } : null,
  };
}

export type RecordAcceptKind = 'lift' | 'swim_pace';

/**
 * The Update tap. `value` is the number the line showed (`suggestion.computed`). A lift writes the logged
 * number as the typed lift, and — when the lift is locked — as the locked number too, which is what Profile
 * writes when a lift is typed there. Swim writes the typed 100-yard pace.
 */
export function acceptRecordSuggestion(input: Baselines & {
  kind: RecordAcceptKind;
  lift?: string | null;
  value: number;
  lockedBaselines: Record<string, unknown> | null | undefined;
}):
  | { ok: true; performance_numbers: Record<string, unknown>; locked_baselines: Record<string, unknown> | null; accepted_value: number; locked: boolean }
  | { ok: false; reason: 'unknown_lift' | 'nothing_to_accept' | 'value_changed' } {
  const pn: Record<string, unknown> = { ...(input.performanceNumbers ?? {}) };
  const lockedIn = (input.lockedBaselines ?? null) as Record<string, unknown> | null;
  if (input.kind === 'swim_pace') {
    const sug = recordSwimPace(input).suggestion;
    if (!sug) return { ok: false, reason: 'nothing_to_accept' };
    if (Math.round(Number(input.value)) !== sug.computed) return { ok: false, reason: 'value_changed' };
    pn.swimPace100 = sug.display;
    return { ok: true, performance_numbers: pn, locked_baselines: lockedIn, accepted_value: sug.computed, locked: false };
  }
  const key = canonicalizeLiftKey(String(input.lift ?? ''));
  if (!key || !RECORD_LIFT_KEYS.includes(key)) return { ok: false, reason: 'unknown_lift' };
  const row = recordLiftRows(input).find((r) => r.key === key)!;
  if (!row.suggestion) return { ok: false, reason: 'nothing_to_accept' };
  if (Math.round(Number(input.value)) !== row.suggestion.computed) return { ok: false, reason: 'value_changed' };
  pn[key] = row.suggestion.computed;
  const locked_baselines = row.locked ? { ...(lockedIn ?? {}), [key]: row.suggestion.computed } : lockedIn;
  return { ok: true, performance_numbers: pn, locked_baselines, accepted_value: row.suggestion.computed, locked: row.locked };
}
