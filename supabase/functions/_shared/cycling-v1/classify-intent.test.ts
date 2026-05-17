/**
 * Tests for fallbackClassifyIntent — the cycling ride classifier's VI gate
 * (audit fix). High VI ⇒ NP-inflated IF is not a valid structured-intensity
 * proxy ⇒ reroute hard variable rides to climbing/tempo instead of
 * threshold/vo2. Gate: VI ≥ 1.15 AND IF ≥ 0.85 (floor resolved with product;
 * spec's 0.88 conflicted with the IF-0.85 acceptance case). climbing when
 * elevation density ≥ 40 ft/mi, else tempo. VI < 1.15 → existing logic.
 *
 * Run: deno test supabase/functions/_shared/cycling-v1/classify-intent.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fallbackClassifyIntent } from './build.ts';

const C = (intensityFactor: number | null, variabilityIndex: number | null, elevationGainPerMi: number | null, totalDurationMin: number | null = 90) =>
  fallbackClassifyIntent({ intensityFactor, ftpBinsMin: null, totalDurationMin, variabilityIndex, elevationGainPerMi });

// ── The four spec acceptance cases ──────────────────────────────────────────

Deno.test('VI 1.3, IF 1.02, 75 ft/mi → climbing (NOT threshold — the audit bug)', () => {
  assertEquals(C(1.02, 1.3, 75), 'climbing');
});

Deno.test('VI 1.0, IF 1.02, 5 ft/mi → threshold (structured ride, VI<1.15 bypasses gate, unchanged)', () => {
  assertEquals(C(1.02, 1.0, 5), 'threshold');
});

Deno.test('VI 1.2, IF 0.85, 30 ft/mi → tempo (variable but not climbing; gate floor IF≥0.85)', () => {
  assertEquals(C(0.85, 1.2, 30), 'tempo');
});

Deno.test('VI 1.0, IF 0.70 → endurance (low-IF, VI<1.15 bypasses gate)', () => {
  // Spec listed "VI 1.0, IF 0.75 → endurance (unchanged)"; existing code maps
  // IF exactly 0.75 → 'tempo' (build.ts `if0 >= 0.75 && if0 < 0.82`). That
  // endurance/tempo boundary is pre-existing and out of scope ("no other
  // changes"); this sanity-checks the gate-bypass for a clearly-sub-tempo IF.
  assertEquals(C(0.70, 1.0, 0), 'endurance');
});

// ── Gate-floor guards (why IF ≥ 0.85, not VI-only) ──────────────────────────

Deno.test('high VI but easy IF (variable recovery/group spin) is NOT rerouted', () => {
  // VI 1.3 but IF 0.55 < 0.85 → gate does not fire → existing logic → recovery.
  // (Proves the IF floor prevents over-capturing easy variable rides as tempo.)
  assertEquals(C(0.55, 1.3, 60), 'recovery');
});

Deno.test('VI exactly 1.15 with IF 0.95, climbing terrain → climbing (boundary inclusive)', () => {
  assertEquals(C(0.95, 1.15, 50), 'climbing');
  // Same VI/IF but flat → tempo (elevation density < 40)
  assertEquals(C(0.95, 1.15, 12), 'tempo');
});

Deno.test('null VI / null elevation degrade safely (no gate → existing logic)', () => {
  assertEquals(C(1.02, null, 75), 'threshold'); // no VI → gate skipped → IF≥0.95 → threshold
  // VI high, IF high, but elevation unknown → tempo (climbing needs epm≥40)
  assertEquals(C(1.00, 1.25, null), 'tempo');
});
