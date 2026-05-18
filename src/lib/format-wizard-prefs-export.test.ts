/**
 * Bug 2 (2026-05-12) regression tests for the wizard-prefs markdown export.
 *
 * The `preferred_days` field on training_prefs is a MERGED structure (wizard pins stacked under
 * optimizer-derived defaults). Surfacing the whole thing as "Athlete preferences" makes engine
 * defaults look like user choices. Fix: cross-reference against individual pin fields
 * (`long_run_day`, `bike_quality_day`, …, `strength_preferred_days`) and only emit
 * `preferred_days[key]` when the corresponding pin field is set.
 *
 * Backwards-compatible: if no individual pin fields are set (older goals saved before the split),
 * fall back to legacy behavior (render everything) so we don't regress existing exports.
 *
 * Run from repo root:
 *   deno test --no-lock --allow-all src/lib/format-wizard-prefs-export.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatWizardPrefsMarkdownLines } from './format-wizard-prefs-export.ts';

function preferredDaysLines(out: string[]): string[] {
  const i = out.findIndex((l) => l === '- **Preferred days:**');
  if (i < 0) return [];
  const tail: string[] = [];
  for (let j = i + 1; j < out.length; j++) {
    const l = out[j];
    if (l.startsWith('  - ')) tail.push(l);
    else break;
  }
  return tail;
}

Deno.test('Bug 2: only user-pinned days surface when individual pin fields are set', () => {
  const out = formatWizardPrefsMarkdownLines({
    sport: 'triathlon',
    training_prefs: {
      // User pinned long_run + long_ride only; everything else is engine-derived.
      long_run_day: 0, // Sunday
      long_ride_day: 6, // Saturday
      // No bike_quality_day, no run_quality_day, no strength_preferred_days, etc.
      preferred_days: {
        long_run: 'sunday',
        long_ride: 'saturday',
        quality_bike: 'tuesday',
        easy_bike: 'friday',
        quality_run: 'thursday',
        easy_run: 'wednesday',
        swim: ['monday', 'tuesday'],
        strength: ['monday', 'thursday'],
      },
    },
  });
  const lines = preferredDaysLines(out);
  // Only long_run + long_ride should appear; engine-derived defaults suppressed.
  assert(lines.some((l) => /Long Run:.*sunday/i.test(l)), `expected long_run kept — got ${JSON.stringify(lines)}`);
  assert(lines.some((l) => /Long Ride:.*saturday/i.test(l)), `expected long_ride kept — got ${JSON.stringify(lines)}`);
  assert(!lines.some((l) => /Quality Bike:/i.test(l)), `expected engine-derived quality_bike suppressed — got ${JSON.stringify(lines)}`);
  assert(!lines.some((l) => /Easy Bike:/i.test(l)), `expected engine-derived easy_bike suppressed — got ${JSON.stringify(lines)}`);
  assert(!lines.some((l) => /Quality Run:/i.test(l)), `expected engine-derived quality_run suppressed — got ${JSON.stringify(lines)}`);
  assert(!lines.some((l) => /Easy Run:/i.test(l)), `expected engine-derived easy_run suppressed — got ${JSON.stringify(lines)}`);
  assert(!lines.some((l) => /\*\*Swim:/i.test(l)), `expected engine-derived swim suppressed — got ${JSON.stringify(lines)}`);
  assert(!lines.some((l) => /\*\*Strength:/i.test(l)), `expected engine-derived strength suppressed — got ${JSON.stringify(lines)}`);
});

Deno.test('Bugs 1&2 (#131): engine-chosen strength → "scheduled by app", NOT a preference', () => {
  // Post-fix shape: reconcile:276 no longer writes strength into the pin field,
  // create-goal:904 strips engine `preferred_days.strength` and persists
  // `strength_optimizer_slots`. So an engine-scheduled goal has the slots but
  // NO strength_preferred_days and NO preferred_days.strength.
  const out = formatWizardPrefsMarkdownLines({
    sport: 'triathlon',
    training_prefs: {
      strength_optimizer_slots: [
        { weekday: 'wednesday', kind: 'lower_body_strength' },
        { weekday: 'friday', kind: 'upper_body_strength' },
      ],
      preferred_days: { long_run: 'sunday' }, // engine strength stripped upstream
    },
  });
  // Engine placement surfaces under its own label, top-level (not "Preferred days").
  assert(
    out.some((l) => /Strength \(scheduled by app\):.*wednesday \(lower body\).*friday \(upper body\)/i.test(l)),
    `expected "scheduled by app" line — got ${JSON.stringify(out)}`,
  );
  // It must NOT masquerade as an athlete preference.
  assert(!out.some((l) => /^- \*\*Strength:\*\*/i.test(l)), `engine strength must not show as "Strength:" — got ${JSON.stringify(out)}`);
  assert(
    !preferredDaysLines(out).some((l) => /Strength/i.test(l)),
    `engine strength must not appear under "Preferred days" — got ${JSON.stringify(preferredDaysLines(out))}`,
  );
});

Deno.test('Bug 2 (#131): a GENUINE wizard strength pin still surfaces as an athlete choice', () => {
  // strength_preferred_days set by the wizard, no optimizer slots → real pin.
  const out = formatWizardPrefsMarkdownLines({
    sport: 'triathlon',
    training_prefs: {
      strength_preferred_days: ['monday', 'thursday'],
    },
  });
  assert(
    out.some((l) => /Strength Preferred Days:.*monday.*thursday/i.test(l)),
    `expected genuine wizard pin surfaced — got ${JSON.stringify(out)}`,
  );
  // Not relabeled as engine-scheduled.
  assert(!out.some((l) => /scheduled by app/i.test(l)), `genuine pin must not be "scheduled by app" — got ${JSON.stringify(out)}`);
});

Deno.test('Bug 2: swim surfaced when any swim_*_day is set', () => {
  const out = formatWizardPrefsMarkdownLines({
    sport: 'triathlon',
    training_prefs: {
      swim_easy_day: 1, // Monday
      preferred_days: {
        swim: ['monday', 'wednesday'],
      },
    },
  });
  const lines = preferredDaysLines(out);
  assert(lines.some((l) => /Swim:.*monday, wednesday/i.test(l)), `expected swim kept — got ${JSON.stringify(lines)}`);
});

Deno.test('Bug 2: fallback — no individual pin fields = render everything (legacy goals)', () => {
  // Older goals saved before the individual-pin-field split don't have *_day / strength_preferred_days
  // populated. We must NOT suppress everything — fall back to legacy behavior.
  const out = formatWizardPrefsMarkdownLines({
    sport: 'triathlon',
    training_prefs: {
      // No long_run_day / bike_quality_day / etc.
      preferred_days: {
        long_run: 'sunday',
        quality_bike: 'tuesday',
        strength: ['monday', 'thursday'],
      },
    },
  });
  const lines = preferredDaysLines(out);
  assert(lines.some((l) => /Long Run:.*sunday/i.test(l)), `expected legacy long_run rendered — got ${JSON.stringify(lines)}`);
  assert(lines.some((l) => /Quality Bike:.*tuesday/i.test(l)), `expected legacy quality_bike rendered — got ${JSON.stringify(lines)}`);
  assert(lines.some((l) => /Strength:/i.test(l)), `expected legacy strength rendered — got ${JSON.stringify(lines)}`);
});

Deno.test('Bug 2: full plan with all pins set — every key surfaces', () => {
  const out = formatWizardPrefsMarkdownLines({
    sport: 'triathlon',
    training_prefs: {
      long_run_day: 0,
      long_ride_day: 6,
      bike_quality_day: 2,
      bike_easy_day: 5,
      run_quality_day: 4,
      run_easy_day: 3,
      swim_easy_day: 1,
      swim_quality_day: 2,
      strength_preferred_days: ['monday', 'thursday'],
      preferred_days: {
        long_run: 'sunday',
        long_ride: 'saturday',
        quality_bike: 'tuesday',
        easy_bike: 'friday',
        quality_run: 'thursday',
        easy_run: 'wednesday',
        swim: ['monday', 'tuesday'],
        strength: ['monday', 'thursday'],
      },
    },
  });
  const lines = preferredDaysLines(out);
  assertEquals(lines.length, 8, `expected all 8 keys — got ${JSON.stringify(lines)}`);
});
