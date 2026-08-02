import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { formatSessionTemp } from './build.ts';

/**
 * ONE TEMPERATURE PER SCREEN (2026-08-02).
 *
 * ⛔ THE BUG THIS PINS, with the real row behind it. Michael's 2026-07-27 run stored
 * `temperature_start_f: 74, temperature_end_f: 78, temperature_peak_f: 78, temperature: 76`.
 * The header rendered the START and the Terrain row rendered the AVERAGE — 74 and 76, same run,
 * three lines apart. Neither was wrong. Nobody had chosen, and both call sites were free to differ.
 */

Deno.test('⛔ the real row: 74 start, 78 end, 76 average → one string, and it shows the movement', () => {
  assertEquals(
    formatSessionTemp({ temperature_f: 76, temp_start_f: 74, temp_end_f: 78 }),
    '74 → 78°F',
  );
});

Deno.test('a steady temperature is one number, not a range of itself', () => {
  assertEquals(formatSessionTemp({ temperature_f: 70, temp_start_f: 70, temp_end_f: 70 }), '70°F');
});

Deno.test('no threshold — a one-degree move is still a move, because any cutoff would be invented', () => {
  assertEquals(formatSessionTemp({ temperature_f: 70, temp_start_f: 70, temp_end_f: 71 }), '70 → 71°F');
});

Deno.test('a partial reading falls back rather than inventing the other end', () => {
  assertEquals(formatSessionTemp({ temperature_f: 76, temp_start_f: 74, temp_end_f: null }), '74°F');
  assertEquals(formatSessionTemp({ temperature_f: 76, temp_start_f: null, temp_end_f: 78 }), '78°F');
  assertEquals(formatSessionTemp({ temperature_f: 76 }), '76°F');
});

Deno.test('no weather at all abstains — the stat line drops the segment rather than printing NaN', () => {
  assertEquals(formatSessionTemp(null), null);
  assertEquals(formatSessionTemp(undefined), null);
  assertEquals(formatSessionTemp({}), null);
  assertEquals(formatSessionTemp({ temperature_f: null, temp_start_f: null, temp_end_f: null }), null);
});
