/**
 * The sport colours have exactly ONE value each. [2026-08-14]
 *
 * Run from repo root:  deno test src/lib/sport-color-parity.test.ts --no-check --allow-read
 *
 * WHY THIS EXISTS. The strength logger drifted off its own discipline colour four separate times in
 * one file, and every drift looked reasonable at the keystroke: reach for `orange-400`, reach for
 * `orange-300`, hand-pick a gradient, use emerald for "done". Tailwind's `orange-*` ramp is NOT
 * SPORT_COLORS.strength — `orange-300` (#FDBA74) is a pale peach that desaturates to tan-gold over a
 * black ground, which is what Michael saw on device and correctly called run yellow.
 *
 * So the fix was not "swap the oranges again" (that had already been tried twice, and the second
 * sweep made it worse). The fix was to give the styling system a named `strength` colour that IS the
 * sport colour, and to pin the two definitions together so they cannot drift apart silently. A
 * colour defined in two places is a colour that will eventually be two colours.
 *
 * If this test fails, do NOT edit the number in tailwind.config.ts to match. `SPORT_COLORS` in
 * src/lib/context-utils.ts is the source of truth (its own header says so); make the config follow
 * it.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SPORT_COLORS } from './context-utils.ts';

const configSrc = await Deno.readTextFile(new URL('../../tailwind.config.ts', import.meta.url));

/** Pull `<name>: '#RRGGBB'` out of the config's colours block. */
function configColor(name: string): string | null {
  const m = configSrc.match(new RegExp(`\\b${name}\\s*:\\s*'(#[0-9A-Fa-f]{6})'`));
  return m ? m[1].toUpperCase() : null;
}

Deno.test('tailwind `strength` is exactly SPORT_COLORS.strength', () => {
  assertEquals(configColor('strength'), SPORT_COLORS.strength.toUpperCase());
});

Deno.test('the `--strength-core` CSS var is the same colour too', () => {
  // A THIRD definition site, found while checking the built stylesheet: src/index.css carries
  // `--strength-core` + a `--strength-glow-rgb` ramp for the card glows. It happens to agree today.
  // Pinned so it keeps agreeing — this is the exact shape of drift that produced the mess.
  const cssSrc = Deno.readTextFileSync(new URL('../index.css', import.meta.url));
  const core = cssSrc.match(/--strength-core:\s*(#[0-9A-Fa-f]{6})/)?.[1].toUpperCase() ?? null;
  assertEquals(core, SPORT_COLORS.strength.toUpperCase());

  const hex = SPORT_COLORS.strength.replace('#', '');
  const asRgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');
  const glow = cssSrc.match(/--strength-glow-rgb:\s*([\d\s]+);/)?.[1].trim() ?? null;
  assertEquals(glow, asRgb);
});

Deno.test('the discipline colours are still all distinct', () => {
  // The three leaks removed from the logger were each a discipline colour doing another
  // discipline's job (orange-300 reading as run gold, sky-300 as swim, emerald as bike). That is
  // only a defect worth naming if the palette itself keeps the disciplines apart — so pin it.
  const distinct = [
    SPORT_COLORS.run,
    SPORT_COLORS.bike,
    SPORT_COLORS.swim,
    SPORT_COLORS.strength,
    SPORT_COLORS.mobility,
  ].map((c) => c.toUpperCase());
  assertEquals(new Set(distinct).size, distinct.length);
});
