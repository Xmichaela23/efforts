/**
 * My Record's "Logged suggests" lines and their Update (2026-09-10, audit H-B12).
 *
 * `oldSwimSuggestion` / `oldLiftSuggestion` are the phone's own lines from `AthleticRecordPage.tsx` at ab40b9d2,
 * copied before they were deleted. Swim must match them exactly. Lifts change on purpose, and the change is
 * pinned: a locked lift is compared with its locked number, and an unlocked lift whose logged number is
 * trusted already runs on it, so it prints that number and no suggestion.
 *
 * Run: deno test --no-check supabase/functions/_shared/baseline-suggestions.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { acceptRecordSuggestion, recordLiftRows, recordSwimPace } from './baseline-suggestions.ts';
import { suggestBaselineUpdate } from './state-trend/reconcile.ts';

const AS_OF = '2026-09-10';

function oldSwimSuggestion(pn: Record<string, unknown>, learned: Record<string, any>) {
  const parseMmSs = (s: unknown): number | null => { const m = /^(\d+):(\d{2})$/.exec(String(s ?? '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const baseYd = parseMmSs(pn.swimPace100);
  const lr = learned?.swim_pace_per_100m;
  if (baseYd == null || !lr || !(Number(lr.value) > 0)) return null;
  return suggestBaselineUpdate({
    key: 'swimPace100', label: 'Swim 100yd', baseline: baseYd,
    learned: { value: Math.round(Number(lr.value) * 0.9144), confidence: lr.confidence, sample_count: Number(lr.sample_count) },
    asOf: AS_OF,
  });
}

function oldLiftSuggestion(pn: Record<string, unknown>, learned: Record<string, any>, pnKey: string, learnedKey: string) {
  const m = learned?.strength_1rms?.[learnedKey];
  const agg = m && Number(m.value) > 0 ? { value: Number(m.value), confidence: m.confidence, sample_count: Number(m.sample_count), last_logged: m.last_logged ?? null } : null;
  return suggestBaselineUpdate({ key: pnKey, label: pnKey, baseline: Number(pn[pnKey]), learned: agg, asOf: AS_OF });
}

const LEARNED = {
  strength_1rms: {
    squat: { value: 230, confidence: 'high', sample_count: 5, last_logged: '2026-09-07' },
    bench_press: { value: 160, confidence: 'medium', sample_count: 2, last_logged: '2026-09-07' },
    deadlift: { value: 300, confidence: 'high', sample_count: 6, last_logged: '2026-09-01' },
  },
  swim_pace_per_100m: { value: 100, confidence: 'medium', sample_count: 4 },
};

Deno.test('swim: the same line the phone drew', () => {
  for (const [pace, lf] of [['1:40', LEARNED], ['1:32', LEARNED], ['1:20', LEARNED], ['', LEARNED], ['1:40', {}]] as const) {
    const pn = { swimPace100: pace };
    const old = oldSwimSuggestion(pn, lf);
    const got = recordSwimPace({ performanceNumbers: pn, learnedFitness: lf, asOf: AS_OF });
    assertEquals(got.suggestion?.computed ?? null, old?.computed ?? null, `pace ${pace}`);
    if (old) {
      const mm = Math.floor(old.computed / 60), ss = Math.round(old.computed % 60);
      assertEquals(got.suggestion!.display, `${mm}:${String(ss).padStart(2, '0')}`);
      assertEquals(got.suggestion!.pct_display, `${old.divergencePct > 0 ? '+' : ''}${old.divergencePct}%`);
    }
  }
  assertEquals(recordSwimPace({ performanceNumbers: { swimPace100: '1:40' }, learnedFitness: LEARNED, asOf: AS_OF }).suggestion,
    { computed: 91, display: '1:31', pct_display: '-9%' });
});

Deno.test('a locked lift is compared with its locked number, not the typed one', () => {
  const pn = { squat: 200, deadlift: 250 };
  // The phone compared 230 with typed 200 whatever the lock said.
  assertEquals(oldLiftSuggestion(pn, LEARNED, 'squat', 'squat')?.computed, 230);
  const rows = recordLiftRows({ performanceNumbers: pn, learnedFitness: LEARNED, lockedBaselines: { squat: 225 }, asOf: AS_OF });
  const squat = rows.find((r) => r.key === 'squat')!;
  assertEquals(squat.value, 225);
  assertEquals(squat.locked, true);
  assertEquals(squat.suggestion, null, '230 is within 5% of the locked 225');
  const lockedLow = recordLiftRows({ performanceNumbers: pn, learnedFitness: LEARNED, lockedBaselines: { squat: 200 }, asOf: AS_OF })
    .find((r) => r.key === 'squat')!;
  assertEquals(lockedLow.suggestion, { computed: 230, display: '230 lbs', pct_display: '+15%' });
});

Deno.test('an unlocked lift with a trusted logged number prints that number and no suggestion', () => {
  const pn = { squat: 200, deadlift: 250, bench: 150 };
  const rows = recordLiftRows({ performanceNumbers: pn, learnedFitness: LEARNED, lockedBaselines: null, asOf: AS_OF });
  assertEquals(rows.map((r) => r.key), ['deadlift', 'squat', 'bench', 'overheadPress1RM']);
  assertEquals(rows.find((r) => r.key === 'squat'), { key: 'squat', value: 230, locked: false, suggestion: null });
  assertEquals(rows.find((r) => r.key === 'deadlift'), { key: 'deadlift', value: 300, locked: false, suggestion: null });
  // Two logged sessions are not trusted: the typed bench stands, as it did.
  assertEquals(rows.find((r) => r.key === 'bench'), { key: 'bench', value: 150, locked: false, suggestion: null });
  assertEquals(rows.find((r) => r.key === 'overheadPress1RM'), { key: 'overheadPress1RM', value: null, locked: false, suggestion: null });
});

Deno.test('Update: a locked lift saves the logged number as typed and locked; a moved number is refused', () => {
  const base = { performanceNumbers: { squat: 200, bench: 150 }, learnedFitness: LEARNED, lockedBaselines: { squat: 200 }, asOf: AS_OF };
  const ok = acceptRecordSuggestion({ ...base, kind: 'lift', lift: 'squat', value: 230 });
  assert(ok.ok);
  if (ok.ok) {
    assertEquals(ok.performance_numbers, { squat: 230, bench: 150 });
    assertEquals(ok.locked_baselines, { squat: 230 });
    assertEquals(ok.locked, true);
    assertEquals(ok.accepted_value, 230);
  }
  assertEquals(acceptRecordSuggestion({ ...base, kind: 'lift', lift: 'squat', value: 225 }), { ok: false, reason: 'value_changed' });
  assertEquals(acceptRecordSuggestion({ ...base, kind: 'lift', lift: 'bench', value: 160 }), { ok: false, reason: 'nothing_to_accept' });
  assertEquals(acceptRecordSuggestion({ ...base, kind: 'lift', lift: 'curl', value: 40 }), { ok: false, reason: 'unknown_lift' });
});

Deno.test('Update: swim saves the typed 100-yard pace as m:ss', () => {
  const res = acceptRecordSuggestion({ kind: 'swim_pace', value: 91, performanceNumbers: { swimPace100: '1:40', squat: 200 }, learnedFitness: LEARNED, lockedBaselines: { squat: 200 }, asOf: AS_OF });
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.performance_numbers, { swimPace100: '1:31', squat: 200 });
    assertEquals(res.locked_baselines, { squat: 200 });
    assertEquals(res.locked, false);
  }
});
