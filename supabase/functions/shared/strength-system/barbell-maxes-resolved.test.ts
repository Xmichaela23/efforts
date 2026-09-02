/**
 * The entry gate reads the RESOLVED four (2026-09-02): locked > trusted learned > typed. A learned or
 * locked max alone used to be refused as "missing".
 *
 * Run: deno test --allow-read --no-check supabase/functions/shared/strength-system/barbell-maxes-resolved.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { missingBarbellLifts, readBarbellMaxesResolved } from './barbell-maxes.ts';

const AS_OF = '2026-09-02';
const trusted = (value: number) => ({ value, confidence: 'high', sample_count: 6, last_logged: '2026-08-30' });
const thin = (value: number) => ({ value, confidence: 'low', sample_count: 1, last_logged: '2026-08-30' });

Deno.test('typed only → the typed numbers, as before', () => {
  const m = readBarbellMaxesResolved({ squat: 200, bench: 150, deadlift: 250, overheadPress1RM: 95 }, null, null, AS_OF);
  assertEquals(m, { squat: 200, bench: 150, deadlift: 250, overheadPress: 95 });
  assertEquals(missingBarbellLifts(m), []);
});

Deno.test('LEARNED (trusted) alone is enough to pass the gate — nothing typed', () => {
  const m = readBarbellMaxesResolved({}, { strength_1rms: { squat: trusted(185), bench_press: trusted(160), deadlift: trusted(225), overhead_press: trusted(100) } }, null, AS_OF);
  assertEquals(missingBarbellLifts(m), []);
  assertEquals(m.deadlift, 225);
});

Deno.test('LOCKED alone is enough to pass the gate', () => {
  const m = readBarbellMaxesResolved({}, null, { squat: 180, bench: 140, deadlift: 220, overheadPress1RM: 90 }, AS_OF);
  assertEquals(missingBarbellLifts(m), []);
  assertEquals(m.bench, 140);
});

Deno.test('precedence: locked > trusted learned > typed, per lift', () => {
  const m = readBarbellMaxesResolved(
    { squat: 200, bench: 150, deadlift: 250, overheadPress1RM: 95 },
    { strength_1rms: { squat: trusted(210), bench_press: thin(170) } },
    { deadlift: 240 },
    AS_OF,
  );
  assertEquals(m.squat, 210);        // trusted learned beats typed
  assertEquals(m.bench, 150);        // thin learned does not; typed stands
  assertEquals(m.deadlift, 240);     // locked wins
  assertEquals(m.overheadPress, 95); // typed only
});

Deno.test('a thin learned value alone does NOT pass the gate — still missing', () => {
  const m = readBarbellMaxesResolved({}, { strength_1rms: { squat: thin(185) } }, null, AS_OF);
  assertEquals(m.squat, 0);
  assertEquals(missingBarbellLifts(m).includes('squat'), true);
});

Deno.test('nothing on file → all four missing', () => {
  assertEquals(missingBarbellLifts(readBarbellMaxesResolved({}, null, null, AS_OF)).length, 4);
});
