/**
 * The load plate's shares, zone table and headline, moved to the coach (audit 2026-09-10, H-T21 / H-B08).
 *
 *   ~/.deno/bin/deno test supabase/functions/coach/load-composition.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formZone } from '../_shared/fitness-fatigue.ts';
import { formHeadline, formKicker, formZoneRows, loadComposition7d, FORM_ZONE_TABLE } from './load-composition.ts';

const day = (date: string, by: Array<[string, number]>) => ({
  date, load: by.reduce((a, [, l]) => a + l, 0), dominant_type: by[0]?.[0] ?? 'none', by_type: by.map(([type, load]) => ({ type, load })),
});

Deno.test('composition: shares sum to exactly 100 by largest remainder; dominant is the biggest', () => {
  const out = loadComposition7d([day('2026-09-04', [['run', 42.4], ['bike', 24.3]]), day('2026-09-05', [['strength', 21.2], ['swim', 12.1]])]);
  assertEquals(out.total_7d, 100);
  assertEquals(out.dominant, 'run');
  assertEquals(out.composition_7d.map((c) => [c.discipline, c.share_pct]), [['run', 43], ['bike', 24], ['strength', 21], ['swim', 12]]);
  assertEquals(out.composition_7d.reduce((a, c) => a + c.share_pct, 0), 100);
});

Deno.test('composition: a day with no breakdown counts under its dominant type; "none" and zeros are skipped', () => {
  const out = loadComposition7d([
    { date: '2026-09-01', load: 30, dominant_type: 'Run' },
    { date: '2026-09-02', load: 0, dominant_type: 'none', by_type: [] },
    day('2026-09-03', [['run', 10], ['none', 5], ['bike', 0]]),
  ]);
  assertEquals(out.total_7d, 40);
  assertEquals(out.composition_7d, [{ discipline: 'run', load: 40, share_pct: 100 }]);
});

Deno.test('composition: nothing logged → total 0, no dominant, no rows', () => {
  assertEquals(loadComposition7d([]), { total_7d: 0, dominant: null, composition_7d: [] });
  assertEquals(loadComposition7d(null), { total_7d: 0, dominant: null, composition_7d: [] });
});

Deno.test('zone rows: the words are formZone\'s, and exactly the current zone is flagged, boundaries included', () => {
  assertEquals(FORM_ZONE_TABLE.map((r) => r.word), ['transitional', 'fresh', 'grey zone', 'optimal', 'high risk']);
  for (const form of [40, 25.5, 25, 10, 5, 0, -9.9, -10, -20, -30, -30.1, -60]) {
    const rows = formZoneRows(form);
    assertEquals(rows.filter((r) => r.current).map((r) => r.word), [formZone(form)], `form ${form}`);
  }
  assertEquals(formZoneRows(null).filter((r) => r.current), []);
});

Deno.test('headline: only in high risk, and the form sentence in every week, light weeks included', () => {
  assertEquals(formHeadline(-32.4), 'Form -32 — high risk (TrainingPeaks)');
  // ⛔ A recovery or taper week keeps the form sentence (Michael, 2026-09-10) — never "Recovery • …".
  assertEquals(formHeadline(-40), 'Form -40 — high risk (TrainingPeaks)');
  assertEquals(formHeadline(-30), null, '−30 is optimal, not high risk');
  assertEquals(formHeadline(null), null);
  assertEquals(formKicker(12.2, 'fresh'), 'Form +12 — fresh (TrainingPeaks)');
});
