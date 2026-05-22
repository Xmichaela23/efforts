/**
 * SWIM-PROTOCOL §5.4 open-water race-specific elements — pin tests.
 *
 * Locks the phase-gated copy expansion on Race-Specific Aerobic sessions
 * (cssAerobicSwim with raceSupport=true). Bilateral-breathing prescription
 * + drafting-position language fires ONLY when phase === 'race_specific';
 * earlier phases that may surface raceSupport=true keep the standard
 * race-rhythm copy. Beginner exclusion is structural — D-025 substitutes
 * race_specific_aerobic → technique_aerobic upstream, so this test file
 * does not need a beginner case.
 *
 * Wetsuit trade-off is deferred to a follow-up slice (filed as Q-NNN —
 * detection signals don't yet exist in arc-context / wizard).
 *
 * Run: deno test --no-check --no-lock --allow-all
 *   supabase/functions/generate-combined-plan/swim-race-specific-ow.test.ts
 */

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cssAerobicSwim } from './session-factory.ts';

const BILATERAL_FRAGMENT = 'Bilateral breathing on at least half the repeats';
const DRAFTING_FRAGMENT = 'practice both lead (no draft) and feet/hip-side draft positions';

Deno.test('§5.4 Race-Specific Aerobic in race_specific phase → bilateral + drafting elements present', () => {
  const s = cssAerobicSwim('Monday', 2500, 'a', 5, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  assert(
    s.description.includes(BILATERAL_FRAGMENT),
    `expected bilateral breathing cue; got: ${s.description}`,
  );
  assert(
    s.description.includes(DRAFTING_FRAGMENT),
    `expected drafting cue; got: ${s.description}`,
  );
});

Deno.test('§5.4 phase normalization: "race-specific" hyphenated string also gates correctly', () => {
  const s = cssAerobicSwim('Monday', 2500, 'a', 5, 0, 'race-specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  assert(
    s.description.includes(BILATERAL_FRAGMENT),
    `phase string "race-specific" should normalize to "race_specific"; got: ${s.description}`,
  );
});

Deno.test('§5.4 anti-regression: build phase raceSupport=true keeps standard copy (no OW elements)', () => {
  const s = cssAerobicSwim('Monday', 2500, 'a', 3, 0, 'build', {
    raceSupport: true,
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  assert(
    !s.description.includes(BILATERAL_FRAGMENT),
    `build phase raceSupport must NOT carry OW elements; got: ${s.description}`,
  );
  assert(
    !s.description.includes(DRAFTING_FRAGMENT),
    `build phase raceSupport must NOT carry drafting cue; got: ${s.description}`,
  );
});

Deno.test('§5.4 anti-regression: regular CSS Aerobic (raceSupport=false) in race_specific phase → no OW elements', () => {
  const s = cssAerobicSwim('Friday', 2800, 'a', 5, 0, 'race_specific', {
    raceSupport: false,
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  assert(
    !s.description.includes(BILATERAL_FRAGMENT),
    `regular CSS Aerobic must NOT carry OW elements; got: ${s.description}`,
  );
  assert(
    !s.description.includes(DRAFTING_FRAGMENT),
    `regular CSS Aerobic must NOT carry drafting cue; got: ${s.description}`,
  );
});

Deno.test('§5.4 anti-regression: base phase raceSupport=false keeps standard CSS Aerobic copy', () => {
  const s = cssAerobicSwim('Friday', 2500, 'a', 1, 0, 'base', {
    raceSupport: false,
    athleteFitness: 'intermediate',
    swimThresholdPace: '1:40',
  });
  assert(
    !s.description.includes(BILATERAL_FRAGMENT),
    `base CSS Aerobic must NOT carry §5.4 elements; got: ${s.description}`,
  );
});

Deno.test('§5.4 Race-Specific Aerobic + missing CSS pace → both OW elements AND §7.5 cue present', () => {
  // Layering check: the §5.4 OW elements compose with the §7.5 CSS fallback cue.
  // Both fire when applicable; neither shadows the other.
  const s = cssAerobicSwim('Monday', 2500, 'a', 5, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
    // swimThresholdPace deliberately omitted
  });
  assert(s.description.includes(BILATERAL_FRAGMENT), '§5.4 OW elements expected');
  assert(
    s.description.includes("If you don't have a CSS pace yet"),
    '§7.5 CSS fallback cue expected',
  );
});

Deno.test('§5.4 anti-regression: race_specific phase + raceSupport=true keeps existing sighting language', () => {
  // The existing inline "Sight every 6–8 strokes; practice breathing to both sides"
  // sentence in the cssAerobicSwim raceSupport mainSet must remain — §5.4's OW elements
  // EXPAND this, they don't replace it.
  const s = cssAerobicSwim('Monday', 2500, 'a', 5, 0, 'race_specific', {
    raceSupport: true,
    athleteFitness: 'intermediate',
  });
  assert(
    /Sight every 6.{0,3}8 strokes/.test(s.description),
    `existing sighting language must remain; got: ${s.description}`,
  );
});
