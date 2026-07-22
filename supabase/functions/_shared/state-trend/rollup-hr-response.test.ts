/**
 * Holistic BODY heart-rate response — read from the SPINE, covering every discipline whose HR is
 * trustworthy (run aerobic decoupling + bike HR-at-power), swim excluded (in-water HR unreliable).
 * Replaces the coach's run-only re-derived HR-drift. Provisional-aware: a thin read can't assert the
 * verdict (Q-162 pattern), but the contributor is still named.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/rollup-hr-response.test.ts --no-check
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rollupHrResponse, hrResponseExcludedRunNote } from './assemble.ts';

type D = { verdict?: string; provisional?: boolean; newestAgeDays?: number | null; sampleCount?: number };
const v1 = (parts: { run?: D; bike?: D }) => ({
  run: parts.run ? { decoupling: parts.run } : undefined,
  bike: parts.bike ? { efficiency: parts.bike } : undefined,
}) as any;

Deno.test('run + bike both holding → holding; stamp = OLDEST contributor (never overstates freshness)', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'holding', newestAgeDays: 14 }, bike: { verdict: 'holding', newestAgeDays: 5 } }));
  assertEquals(r.verdict, 'holding');
  assertEquals(r.contributors.map((c) => c.discipline), ['run', 'bike']);
  assertEquals(r.asOfAgeDays, 14); // the STALEST input (run 14d), not the fresh bike (5d) — the real bug fix
});

Deno.test('any SOLID contributor sliding → sliding (HR response worsening)', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'holding' }, bike: { verdict: 'sliding' } }));
  assertEquals(r.verdict, 'sliding');
});

Deno.test('bike-only (run needs_data) → reads the bike verdict', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'needs_data' }, bike: { verdict: 'improving', newestAgeDays: 2 } }));
  assertEquals(r.verdict, 'improving');
  assertEquals(r.contributors.map((c) => c.discipline), ['bike']);
  assertEquals(r.asOfAgeDays, 2);
});

Deno.test('THIN read cannot assert — provisional bike-improving does not flip a solid run-holding', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'holding' }, bike: { verdict: 'improving', provisional: true } }));
  assertEquals(r.verdict, 'holding');            // solid decides
  assertEquals(r.contributors.length, 2);        // …but the thin contributor is still named
});

Deno.test('all contributors provisional → holding (nothing solid asserts), still lists them', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'sliding', provisional: true }, bike: { verdict: 'sliding', provisional: true } }));
  assertEquals(r.verdict, 'holding'); // no solid → can't confidently call it sliding
  assertEquals(r.contributors.length, 2);
});

Deno.test('run improving + bike sliding (both solid) → holding, split named by contributors', () => {
  const r = rollupHrResponse(v1({ run: { verdict: 'improving' }, bike: { verdict: 'sliding' } }));
  assertEquals(r.verdict, 'holding');
  assertEquals(r.contributors.length, 2);
});

Deno.test('no reliable-HR endurance data → needs_data (swim never contributes)', () => {
  assertEquals(rollupHrResponse(v1({})).verdict, 'needs_data');
  assertEquals(rollupHrResponse(v1({ run: { verdict: 'needs_data' } })).verdict, 'needs_data');
  assertEquals(rollupHrResponse(null).verdict, 'needs_data');
});

// ── NO SILENT DROP — Michael's "is the HR response lagging?" catch (2026-07-20). A run PRESENT but
//    below the 8-run trend floor is excluded from the rollup and must be NAMED, not hidden. ──────────
Deno.test('excluded-run note: run present but below floor (his exact case) → named + the refresh lever', () => {
  // Bike holds (6d ago), run has 7 steady runs — under 8, no direction → dropped from the rollup.
  const state = v1({ bike: { verdict: 'holding', newestAgeDays: 6 }, run: { verdict: 'needs_data', sampleCount: 7 } });
  const r = rollupHrResponse(state);
  assertEquals(r.contributors.length, 1);                  // only bike contributes
  assertEquals(r.contributors[0].discipline, 'bike');
  const note = hrResponseExcludedRunNote(state, r.contributors)!;
  assertEquals(note, "7 of 8 steady runs to trend — a steady run refreshes this.");
});

Deno.test('excluded-run note: DOUBLE DUTY when the athlete is also under their run target (opportunity, not scold)', () => {
  const state = v1({ bike: { verdict: 'holding', newestAgeDays: 6 }, run: { verdict: 'needs_data', sampleCount: 6 } });
  const note = hrResponseExcludedRunNote(state, rollupHrResponse(state).contributors, 8, { runUnderTarget: true })!;
  assertStringIncludes(note, '6 of 8 steady runs to trend');
  assertStringIncludes(note, "running you're under target on"); // the double-duty payoff
  assertEquals(note.toLowerCase().includes('unproductive'), false); // never a scold
});

Deno.test('excluded-run note: silent when the run IS contributing, absent, or floor met', () => {
  // contributing → no note
  const contributing = v1({ run: { verdict: 'holding', newestAgeDays: 1, sampleCount: 9 } });
  assertEquals(hrResponseExcludedRunNote(contributing, rollupHrResponse(contributing).contributors), null);
  // no run at all → no note
  const bikeOnly = v1({ bike: { verdict: 'holding', newestAgeDays: 6 } });
  assertEquals(hrResponseExcludedRunNote(bikeOnly, rollupHrResponse(bikeOnly).contributors), null);
  // run present but ZERO samples → no note (nothing to promise)
  const zero = v1({ bike: { verdict: 'holding', newestAgeDays: 6 }, run: { verdict: 'needs_data', sampleCount: 0 } });
  assertEquals(hrResponseExcludedRunNote(zero, rollupHrResponse(zero).contributors), null);
});
