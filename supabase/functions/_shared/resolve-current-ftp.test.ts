// The FTP resolver's TIER 0 — the athlete's stored choice (Q-240, 2026-08-01).
// Bike was the only baseline where the app decided and the athlete could not answer back: a confident
// learned estimate outranked their typed number, and their only lever was deleting their own entry.
// These pin both halves — that a choice is honoured, AND that no choice changes nothing.
// Run: deno test --no-check resolve-current-ftp.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';

const learned = (value: number, confidence: string) => ({ ride_ftp_estimated: { value, confidence } });

// ── THE REGRESSION GUARD, and it is the most important test here ────────────────────────────────
// This resolver feeds the coach, the analyzers, the plan generators and every power zone — including
// the 56-75% aerobic band the bike's heart-rate read is taken in. An athlete who has never opened
// Baselines must get byte-identical numbers to before.
Deno.test('NO CHOICE → historical precedence, unchanged', () => {
  // confident learned outranks the typed number (the old tier 1 > tier 2)
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'high'), performance_numbers: { ftp: 181 } }),
    { value: 176, source: 'learned' },
  );
  // low-confidence learned does NOT outrank it
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'low'), performance_numbers: { ftp: 181 } }),
    { value: 181, source: 'manual' },
  );
  // learned alone, low confidence, still surfaces with its honest label
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'low'), performance_numbers: {} }),
    { value: 176, source: 'learned-low' },
  );
  assertEquals(resolveCurrentFtp({ learned_fitness: null, performance_numbers: {} }), { value: null, source: null });
});

// ── THE POINT OF THE TICKET ─────────────────────────────────────────────────────────────────────
Deno.test('"Use my number" beats even a HIGH-confidence learned estimate', () => {
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'high'), performance_numbers: { ftp: 181, ftp_source: 'manual' } }),
    { value: 181, source: 'manual' },
  );
});

Deno.test('"Use my rides" is honoured, and does NOT launder a low-confidence estimate', () => {
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'high'), performance_numbers: { ftp: 181, ftp_source: 'learned' } }),
    { value: 176, source: 'learned' },
  );
  // Choosing "auto" asks for the learned value; it does not upgrade what that value is WORTH. The
  // source stays 'learned-low' so quality-gated consumers can still opt out of it.
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'low'), performance_numbers: { ftp: 181, ftp_source: 'learned' } }),
    { value: 176, source: 'learned-low' },
  );
});

// ── A CHOICE WITH NOTHING BEHIND IT MUST NOT BLANK THE APP ──────────────────────────────────────
// Choosing "my number" and then clearing the field means "there is nothing to prefer", not "this
// athlete has no FTP". Returning null here would strip power zones and plan targets app-wide.
Deno.test('a preference with no value behind it falls through instead of returning null', () => {
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'high'), performance_numbers: { ftp_source: 'manual' } }),
    { value: 176, source: 'learned' },
  );
  assertEquals(
    resolveCurrentFtp({ learned_fitness: null, performance_numbers: { ftp: 181, ftp_source: 'learned' } }),
    { value: 181, source: 'manual' },
  );
});

// Garbage in the column (hand-edited row, an older client, a typo) must not disable the resolver.
Deno.test('an unrecognised preference is ignored, not obeyed', () => {
  assertEquals(
    resolveCurrentFtp({ learned_fitness: learned(176, 'high'), performance_numbers: { ftp: 181, ftp_source: 'whatever' } }),
    { value: 176, source: 'learned' },
  );
});
