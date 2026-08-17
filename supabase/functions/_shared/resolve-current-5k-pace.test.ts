/**
 * Run: deno test supabase/functions/_shared/resolve-current-5k-pace.test.ts --no-check
 *
 * Pins the three things the resolver exists to own:
 *   1. every key spelling resolves to the SAME number (that was the whole disease)
 *   2. a RACE TIME never resolves as a pace — it is converted or it is nothing
 *   3. absent-everything returns null, not a guess (D-285: we do not invent a pace)
 *
 * See `src/lib/resolve-current-5k-pace.ts` for the precedence semantics.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveCurrent5kPace,
  resolveFiveKRaceTimeSec,
  formatFiveKPace,
  deriveFiveKPaceFromRaceTime,
} from '../../../src/lib/resolve-current-5k-pace.ts';

// ── 1. EVERY SPELLING, ONE NUMBER ───────────────────────────────────────────────────────────────
// 7:15/mi = 435 sec/mi, written eight ways. Before the resolver, which of these a surface could see
// depended on which surface it was.
const SPELLINGS: Array<[string, Record<string, unknown>]> = [
  ['fiveK_pace as "7:15/mi"', { fiveK_pace: '7:15/mi' }],
  ['fiveK_pace as "7:15" (unsuffixed)', { fiveK_pace: '7:15' }],
  ['fiveK_pace as a number', { fiveK_pace: 435 }],
  ['fiveKPace camelCase', { fiveKPace: '7:15/mi' }],
  ['fiveK_pace_sec_per_mi', { fiveK_pace_sec_per_mi: 435 }],
  ['five_k_pace_min_per_mi string', { five_k_pace_min_per_mi: '7:15' }],
];

for (const [label, pn] of SPELLINGS) {
  Deno.test(`resolveCurrent5kPace — ${label} -> 435 sec/mi, source manual`, () => {
    const r = resolveCurrent5kPace({ performance_numbers: pn });
    assertEquals(r.sec_per_mi, 435);
    assertEquals(r.source, 'manual');
    assertEquals(r.is_estimate, false);
  });
}

Deno.test('resolveCurrent5kPace — effort_paces.power and .five_k are the same number, flagged as an estimate', () => {
  const viaPower = resolveCurrent5kPace({ effort_paces: { power: 435 } });
  const viaFiveK = resolveCurrent5kPace({ effort_paces: { five_k: 435 } });
  assertEquals(viaPower.sec_per_mi, 435);
  assertEquals(viaFiveK.sec_per_mi, 435);
  assertEquals(viaPower.source, 'effort_paces');
  assertEquals(viaPower.is_estimate, true);
});

Deno.test('resolveCurrent5kPace — a /km pace is converted to sec/mi exactly once', () => {
  // 4:30/km = 270 sec/km -> 435 sec/mi. The footgun, pinned.
  const r = resolveCurrent5kPace({ performance_numbers: { fiveK_pace: '4:30/km' } });
  assertEquals(r.sec_per_mi, 435);
  assertEquals(r.source, 'manual');
});

// ── 2. THE TRAP: A RACE TIME IS NOT A PACE ──────────────────────────────────────────────────────

Deno.test('resolveCurrent5kPace — TRAP: fiveK "22:30" is a race TIME, never a 22:30/mi pace', () => {
  const r = resolveCurrent5kPace({ performance_numbers: { fiveK: '22:30' } });
  // materialize-plan:674 read this as 1350 sec/mi and then prescribed threshold at 1370 sec/mi.
  assertEquals(r.sec_per_mi, 435);          // 1350s / 3.106856 mi
  assertEquals(r.source, 'race-time');
  assertEquals(r.is_estimate, true);
  assertEquals(r.race_time_sec, 1350);
});

Deno.test('resolveCurrent5kPace — TRAP: numeric fiveK (1350) is also a time, not a pace', () => {
  // The AppContext backfill is guarded by `typeof perf.fiveK === "string"`, so this shape never
  // gets a fiveK_pace written for it.
  const r = resolveCurrent5kPace({ performance_numbers: { fiveK: 1350 } });
  assertEquals(r.sec_per_mi, 435);
  assertEquals(r.source, 'race-time');
});

Deno.test('resolveCurrent5kPace — TRAP: fiveKTime spelling behaves identically', () => {
  const r = resolveCurrent5kPace({ performance_numbers: { fiveKTime: '22:30' } });
  assertEquals(r.sec_per_mi, 435);
  assertEquals(r.source, 'race-time');
});

Deno.test('REGRESSION — the threshold pace materialize-plan derives as 5K + 20s', () => {
  // `materialize-plan:682-686` derives threshold from whatever the 5K resolves to. With the old chain a
  // row carrying only the race time produced 1350 + 20 = 1370 sec/mi — a 22:50/mi tempo target on the
  // athlete's calendar. Keep this fixture: it is the bug, not a hypothetical.
  const fiveK = resolveCurrent5kPace({ performance_numbers: { fiveK: '22:30' } }).sec_per_mi!;
  assertEquals(fiveK + 20, 455);   // 7:35/mi, not 22:50/mi
});

Deno.test('resolveCurrent5kPace — a race time typed into the PACE field is rejected, not prescribed', () => {
  // Second net: 22:30 in fiveK_pace is 1350 sec/mi, outside any plausible pace band.
  const r = resolveCurrent5kPace({ performance_numbers: { fiveK_pace: '22:30' } });
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
});

Deno.test('resolveCurrent5kPace — a bad pace key does not shadow a good one beside it', () => {
  const r = resolveCurrent5kPace({ performance_numbers: { fiveK_pace: '22:30', fiveKPace: '7:15/mi' } });
  assertEquals(r.sec_per_mi, 435);
  assertEquals(r.source, 'manual');
});

Deno.test('resolveCurrent5kPace — the time key never wins over a real typed pace', () => {
  const r = resolveCurrent5kPace({ performance_numbers: { fiveK: '22:30', fiveK_pace: '7:00/mi' } });
  assertEquals(r.sec_per_mi, 420);
  assertEquals(r.source, 'manual');
});

Deno.test('resolveFiveKRaceTimeSec — the time is readable as a TIME, from its own accessor', () => {
  assertEquals(resolveFiveKRaceTimeSec({ performance_numbers: { fiveK: '22:30' } }), 1350);
  assertEquals(resolveFiveKRaceTimeSec({ performance_numbers: { fiveK: '1:02:30' } }), 3750);
  // …and a PACE field is never mistaken for one.
  assertEquals(resolveFiveKRaceTimeSec({ performance_numbers: { fiveK_pace: '7:15/mi' } }), null);
  // …nor is an implausible clock (7:00 min / 80:00 max, per arc-context's own band).
  assertEquals(resolveFiveKRaceTimeSec({ performance_numbers: { fiveK: '4:30' } }), null);
  assertEquals(resolveFiveKRaceTimeSec({ performance_numbers: { fiveK: '95:00' } }), null);
});

// ── 3. ABSENT EVERYTHING -> NULL, NEVER A GUESS ─────────────────────────────────────────────────

Deno.test('resolveCurrent5kPace — nothing on file returns null, not a literal', () => {
  const expected = { sec_per_mi: null, source: null, is_estimate: false, race_time_sec: null };
  assertEquals(resolveCurrent5kPace(null), expected);
  assertEquals(resolveCurrent5kPace(undefined), expected);
  assertEquals(resolveCurrent5kPace({}), expected);
  assertEquals(resolveCurrent5kPace({ performance_numbers: {} }), expected);
  assertEquals(resolveCurrent5kPace({ performance_numbers: { fiveK_pace: null, fiveK: '' } }), expected);
  assertEquals(resolveCurrent5kPace({ performance_numbers: { fiveK_pace: 0 } }), expected);
  assertEquals(resolveCurrent5kPace({ performance_numbers: { fiveK_pace: 'not a pace' } }), expected);
});

Deno.test('resolveCurrent5kPace — five_k_pace_min_per_mi as a bare NUMBER is skipped, not mis-read', () => {
  // 7.25 "minutes" vs 435 "seconds" is unresolvable from the field name; skipping beats guessing.
  assertEquals(resolveCurrent5kPace({ performance_numbers: { five_k_pace_min_per_mi: 7.25 } }).sec_per_mi, null);
});

// ── 4. PRECEDENCE ───────────────────────────────────────────────────────────────────────────────

Deno.test('resolveCurrent5kPace — typed pace beats race time beats effort_paces', () => {
  const all = {
    performance_numbers: { fiveK_pace: '7:00/mi', fiveK: '22:30' },
    effort_paces: { power: 400 },
  };
  assertEquals(resolveCurrent5kPace(all).source, 'manual');
  assertEquals(resolveCurrent5kPace(all).sec_per_mi, 420);

  const noTyped = { performance_numbers: { fiveK: '22:30' }, effort_paces: { power: 400 } };
  assertEquals(resolveCurrent5kPace(noTyped).source, 'race-time');
  assertEquals(resolveCurrent5kPace(noTyped).sec_per_mi, 435);

  const wizardOnly = { performance_numbers: {}, effort_paces: { power: 400 } };
  assertEquals(resolveCurrent5kPace(wizardOnly).source, 'effort_paces');
  assertEquals(resolveCurrent5kPace(wizardOnly).sec_per_mi, 400);
});

Deno.test('formatFiveKPace — round-trips the stored string shape both surfaces render', () => {
  assertEquals(formatFiveKPace(435), '7:15/mi');
  assertEquals(formatFiveKPace(435, true), '4:30/km');
  assertEquals(formatFiveKPace(null), null);
});

// ── 5. THE WRITE SIDE — what `AppContext.saveUserBaselines` persists ────────────────────────────

Deno.test('deriveFiveKPaceFromRaceTime — imperial: 22:30 5K -> 7:15/mi', () => {
  // 1350s / 3.106856 mi = 434.6 -> 435 sec/mi.
  assertEquals(deriveFiveKPaceFromRaceTime('22:30', false), '7:15/mi');
});

Deno.test('REGRESSION — metric: a 5K time derives a per-KM pace, not a mile pace wearing a /km label', () => {
  // The old copy in AppContext.tsx:324 divided by 3.10686 (MILES) and then appended the athlete's unit
  // suffix, so a metric athlete stored "7:15/km" — a per-mile number under a per-km label. A reader that
  // honoured the suffix multiplied it by 1.609 and got 700 sec/mi, a 60% error on every plan target.
  assertEquals(deriveFiveKPaceFromRaceTime('22:30', true), '4:30/km');   // 1350s / 5 km = 270 sec/km
  assertEquals(deriveFiveKPaceFromRaceTime('22:30', true) === '7:15/km', false);
});

Deno.test('the writer emits exactly what the reader reads back — both unit systems, no drift', () => {
  for (const clock of ['18:00', '22:30', '25:00', '31:12', '45:00']) {
    const imperial = deriveFiveKPaceFromRaceTime(clock, false);
    const metric = deriveFiveKPaceFromRaceTime(clock, true);
    const fromTime = resolveCurrent5kPace({ performance_numbers: { fiveK: clock } }).sec_per_mi;
    // Both stored strings resolve to the same sec/mi as the race time they came from (±1s rounding).
    for (const [label, stored] of [['imperial', imperial], ['metric', metric]] as const) {
      const readBack = resolveCurrent5kPace({ performance_numbers: { fiveK_pace: stored } }).sec_per_mi;
      assertEquals(
        Math.abs((readBack ?? 0) - (fromTime ?? 0)) <= 1,
        true,
        `${clock} ${label}: stored ${stored} read back as ${readBack}, race time says ${fromTime}`,
      );
    }
  }
});

Deno.test('REGRESSION — re-typing the 5K moves the pace with it (the backfill is not a fill-once)', () => {
  // The `!perf.fiveK_pace` guard meant this returned the OLD pace. `resolveCurrent5kPace` prefers a typed
  // pace over the race time, so the stale value then beat the fresh time on every surface.
  const stale = '7:15/mi';                                        // from a 22:30 5K
  const fresh = deriveFiveKPaceFromRaceTime('21:00', false);      // athlete re-types 21:00
  assertEquals(fresh, '6:46/mi');                                 // 1260s / 3.106856 mi = 405.6 -> 406
  assertEquals(fresh === stale, false);
  // …and what the resolver then reads is the new number, not the old one.
  assertEquals(resolveCurrent5kPace({ performance_numbers: { fiveK: '21:00', fiveK_pace: fresh } }).sec_per_mi, 406);
});

Deno.test('deriveFiveKPaceFromRaceTime — writes nothing rather than a value the resolver would reject', () => {
  assertEquals(deriveFiveKPaceFromRaceTime(null, false), null);
  assertEquals(deriveFiveKPaceFromRaceTime('', false), null);
  assertEquals(deriveFiveKPaceFromRaceTime('not a time', false), null);
  assertEquals(deriveFiveKPaceFromRaceTime('4:30', false), null);      // below the 7:00 race-time band
  assertEquals(deriveFiveKPaceFromRaceTime('95:00', false), null);     // above the 80:00 race-time band
  assertEquals(deriveFiveKPaceFromRaceTime('1:05:00', false), null);   // in the time band, but 20:56/mi
  // A numeric race time now derives too — the old `typeof perf.fiveK === 'string'` guard skipped it.
  assertEquals(deriveFiveKPaceFromRaceTime(1350, false), '7:15/mi');
});
