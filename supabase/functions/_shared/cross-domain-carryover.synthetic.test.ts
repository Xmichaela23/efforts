// SYNTHETIC-USER end-to-end test (Michael-requested acceptance run, 2026-07-03).
// Proves the LIVE carryover pipeline — not just the unit fixtures — by replicating the EXACT extraction +
// detector + clause chain that analyze-cycling-workout runs, on DB-shaped rows for a throwaway athlete.
// Permanent regression: if the analyzer glue or the clause voice drifts, this breaks.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveCarriedInSoreness, detectCrossDomainCarryover, buildCarryoverClause, classifyStrengthFocus,
  type SorenessEntry,
} from './cross-domain-carryover.ts';

// ── Mirrors analyze-cycling-workout's carryover block byte-for-byte (extraction → resolve → detect → clause) ──
function runRideCard(opts: {
  soreWkRows: any[];      // workouts rows (id, date, start_date, workout_metadata) — the soreness read
  strengthRows: any[];    // strength workouts (date, strength_exercises, workload_actual) — the antecedent read
  ride: { id: string; date: string; start_date: string };
  decoupPct: number;      // aerobic (power-at-HR) decoupling % — negative = easy/fresh
}) {
  const recentSessions = opts.strengthRows.map((w) => {
    const names = (w.strength_exercises || []).map((e: any) => String(e?.name || ''));
    return { date: String(w.date), type: 'strength', strengthFocus: classifyStrengthFocus(names), workload: Number(w.workload_actual || 0), isNovel: false };
  });
  const entries: SorenessEntry[] = opts.soreWkRows
    .map((w) => ({ workoutId: String(w?.id ?? ''), startTime: String(w?.start_date || (w?.date + 'T12:00:00Z')), soreness: Number(w?.workout_metadata?.readiness?.soreness) }))
    .filter((e) => e.workoutId && Number.isFinite(e.soreness));
  const targetStart = String(opts.ride.start_date || (opts.ride.date + 'T12:00:00Z'));
  const sore = resolveCarriedInSoreness(entries, { workoutId: String(opts.ride.id), startTime: targetStart });

  const rawElevation = opts.decoupPct - 5;
  const carry = detectCrossDomainCarryover({
    targetDate: opts.ride.date, targetDiscipline: 'ride',
    effortSignal: 'hr_at_pace', rawElevation, adjustedElevation: rawElevation, threshold: 3,
    confounds: { grade: false, heat: false, prescribedHard: false },
    recentSessions, nonLegElevated: null, declaredRpeGap: null, declaredBaselineOk: false,
    declaredSorenessElevated: sore.elevated,
  });
  return { clause: buildCarryoverClause(carry, 'ride'), carry, sore };
}

// ── The synthetic athlete: 5 low-soreness baseline sessions + a Monday heavy-leg lift + a Wednesday easy ride ──
const RIDE = { id: 'ride-wed', date: '2026-07-01', start_date: '2026-07-01T09:00:00Z' };
const LIFT = {
  id: 'lift-mon', date: '2026-06-29', start_date: '2026-06-29T18:00:00Z',
  strength_exercises: [{ name: 'Deadlift' }, { name: 'Back Squat' }], workload_actual: 120,
  workout_metadata: { readiness: { soreness: 6 } }, // logged SORE right after the lift
};
const BASELINE = [14, 15, 16, 17, 20].map((d, i) => ({
  id: `base-${i}`, date: `2026-06-${d}`, start_date: `2026-06-${d}T12:00:00Z`,
  workout_metadata: { readiness: { soreness: i % 2 === 0 ? 1 : 2 } }, // his normal: 1–2
}));

Deno.test('SYNTHETIC fires: sore Monday lift → easy Wednesday ride → declared, recovery-positive clause', () => {
  const soreWkRows = [
    { ...RIDE, workout_metadata: { readiness: { soreness: 7 } } }, // the ride's OWN post-ride log — must be IGNORED
    LIFT, ...BASELINE,
  ];
  const { clause, carry, sore } = runRideCard({ soreWkRows, strengthRows: [LIFT], ride: RIDE, decoupPct: -4 });

  // provenance guard: carried-in soreness is the LIFT's 6, NOT the ride's own 7
  assertEquals(sore.recent, 6);
  assertEquals(sore.elevated, true);
  // declared framing (only a logged slider earns the sensation) + recovery-positive (objectively easy)
  assertEquals(carry.claimable, true);
  assertEquals(carry.source, 'declared');
  assertEquals(carry.recoveryPositive, true);
  assertEquals(carry.declaredSoreness, true);
  assertEquals(clause?.includes('You reported sore legs') && clause.includes('right call') && clause.includes('recover'), true, clause ?? 'null');
  console.log(`\n  ▶ SYNTHETIC CARD (fires):\n    "${clause}"\n    [source=${carry.source} recovery+=${carry.recoveryPositive} carried-in soreness=${sore.recent} vs norm ${sore.mean?.toFixed(1)}]\n`);
});

Deno.test('SYNTHETIC silent: Monday lift logged NORMAL soreness → no elevation → card stays silent', () => {
  const liftNormal = { ...LIFT, workout_metadata: { readiness: { soreness: 2 } } }; // his usual, not elevated
  const soreWkRows = [liftNormal, ...BASELINE];
  const { clause, carry, sore } = runRideCard({ soreWkRows, strengthRows: [liftNormal], ride: RIDE, decoupPct: -4 });
  assertEquals(sore.elevated, false);
  assertEquals(carry.claimable, false);
  assertEquals(clause, null);
  console.log(`\n  ▶ SYNTHETIC CARD (silent): carried-in soreness ${sore.recent} vs norm ${sore.mean?.toFixed(1)} → ${carry.suppressedBy}\n`);
});

Deno.test('SYNTHETIC guard: even a SORE ride-own log, with no prior sore lift, cannot self-trigger', () => {
  // Only the ride's own post-ride soreness exists (7) + low baseline — the before-session guard drops the
  // ride's own entry, so there is no carried-in soreness → silent. Proves a card can't fabricate off itself.
  const soreWkRows = [{ ...RIDE, workout_metadata: { readiness: { soreness: 7 } } }, ...BASELINE];
  const { carry, sore } = runRideCard({ soreWkRows, strengthRows: [LIFT], ride: RIDE, decoupPct: -4 });
  assertEquals(sore.elevated, false);
  assertEquals(carry.claimable, false);
});
