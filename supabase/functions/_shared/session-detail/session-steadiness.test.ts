/**
 * The steadiness ladder — one rung per test, in the order they decide.
 *   ~/.deno/bin/deno test --no-check supabase/functions/_shared/session-detail/session-steadiness.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { sessionSteadiness } from './session-steadiness.ts';

const packetSteps = (n: number) => ({ derived: { interval_execution: { total_steps: n } } });
const packetPaces = (paces: number[]) => ({ facts: { segments: paces.map((p) => ({ pace_sec_per_mi: p })) } });

Deno.test('rung 1 — the plan family decides, above a step count that disagrees', () => {
  // A VT1 run prescribed as warm-up, main, cool-down: three steps, and still an easy run.
  assertEquals(
    sessionSteadiness({ plannedRow: { tags: ['family:run_vt1'] }, factPacket: packetSteps(3) }),
    { steady: true, decidedBy: 'plan_family' },
  );
  // The long run reads. p235: primarily below VT1.
  assertEquals(
    sessionSteadiness({ plannedRow: { tags: ['family:run_lsd'] }, factPacket: packetSteps(4) }),
    { steady: true, decidedBy: 'plan_family' },
  );
  // Sweet spot does not, however continuous it looks — 80-95% is not easy work.
  assertEquals(
    sessionSteadiness({ plannedRow: { tags: ['family:ride_sweet_spot'] }, factPacket: packetSteps(1) }),
    { steady: false, decidedBy: 'plan_family' },
  );
  // Near-threshold, MLSS, VO2, anaerobic and sprints: all above or near, none read.
  for (const f of ['run_near_threshold', 'run_mlss', 'run_sprint_power', 'ride_vo2', 'ride_anaerobic', 'ride_sprints']) {
    assertEquals(sessionSteadiness({ plannedRow: { tags: [`family:${f}`] } }).steady, false, f);
  }
  // The easy ride reads.
  assertEquals(sessionSteadiness({ plannedRow: { tags: ['family:ride_endurance'] } }).steady, true);
  // Tags stored as a JSON string read the same.
  assertEquals(
    sessionSteadiness({ plannedRow: { tags: JSON.stringify(['standing_plan', 'family:run_vt1']) } }).decidedBy,
    'plan_family',
  );
});

Deno.test('rung 1, second form — a race plan has no family tag, so its words decide', () => {
  assertEquals(
    sessionSteadiness({ plannedRow: { name: 'Easy run', tags: [] }, factPacket: packetSteps(3) }),
    { steady: true, decidedBy: 'plan_words' },
  );
  assertEquals(
    sessionSteadiness({ plannedRow: { name: 'Tempo run', tags: [] }, factPacket: packetSteps(1) }),
    { steady: false, decidedBy: 'plan_words' },
  );
  assertEquals(
    sessionSteadiness({ plannedRow: { name: 'Long run', description: '90 minutes' } }).steady,
    true,
  );
});

Deno.test('rung 2 — planned steps, when the plan named no type', () => {
  assertEquals(sessionSteadiness({ factPacket: packetSteps(12) }), { steady: false, decidedBy: 'planned_steps' });
  assertEquals(sessionSteadiness({ factPacket: packetSteps(2) }), { steady: true, decidedBy: 'planned_steps' });
});

Deno.test('rung 3 — the athlete tag has its slot and is null today', () => {
  assertEquals(sessionSteadiness({ athleteTag: 'intervals' }), { steady: false, decidedBy: 'athlete_tag' });
  assertEquals(sessionSteadiness({ athleteTag: 'steady' }), { steady: true, decidedBy: 'athlete_tag' });
  assertEquals(sessionSteadiness({ athleteTag: null }).decidedBy, 'nothing_said');
});

Deno.test("rung 4 — Strava's own word; workout decides, race does not", () => {
  const row = (wt: number) => ({ strava_data: { original_activity: { workout_type: wt } } });
  assertEquals(sessionSteadiness({ workoutRow: row(3) }), { steady: false, decidedBy: 'provider_workout_type' });
  assertEquals(sessionSteadiness({ workoutRow: row(12) }), { steady: false, decidedBy: 'provider_workout_type' });
  // race and long run and default all fall through
  for (const wt of [0, 1, 2, 10, 11]) {
    assertEquals(sessionSteadiness({ workoutRow: row(wt) }).decidedBy, 'nothing_said', String(wt));
  }
  // stringified strava_data reads the same
  assertEquals(
    sessionSteadiness({ workoutRow: { strava_data: JSON.stringify({ original_activity: { workout_type: 3 } }) } }).steady,
    false,
  );
});

Deno.test('rung 5 — device lap markings, inert when the recording carries none', () => {
  const laps = (kinds: Array<string | null>) => ({ laps: kinds.map((k) => (k ? { intensity: k } : {})) });
  assertEquals(
    sessionSteadiness({ workoutRow: laps(['WARMUP', 'ACTIVE', 'REST', 'ACTIVE', 'REST']) }),
    { steady: false, decidedBy: 'lap_intensity' },
  );
  assertEquals(
    sessionSteadiness({ workoutRow: laps(['ACTIVE', 'ACTIVE', 'ACTIVE']) }),
    { steady: true, decidedBy: 'lap_intensity' },
  );
  // no markings on the laps → the rung is skipped, not answered
  assertEquals(sessionSteadiness({ workoutRow: laps([null, null, null]) }).decidedBy, 'nothing_said');
});

Deno.test('rung 6 — the pace swing, ours, and last', () => {
  assertEquals(
    sessionSteadiness({ factPacket: packetPaces([540, 545, 550, 542, 548]) }),
    { steady: true, decidedBy: 'pace_swing' },
  );
  assertEquals(
    sessionSteadiness({ factPacket: packetPaces([420, 600, 430, 610, 425]) }),
    { steady: false, decidedBy: 'pace_swing' },
  );
  // under five miles there is nothing to swing
  assertEquals(sessionSteadiness({ factPacket: packetPaces([420, 600, 430]) }).decidedBy, 'nothing_said');
});

Deno.test('rung 7 — detected rows, retained; it only ever says "not steady"', () => {
  const rows = (t: string[]) => t.map((interval_type) => ({ interval_type }));
  assertEquals(
    sessionSteadiness({ intervals: rows(['warmup', 'work', 'recovery', 'work', 'recovery']) }),
    { steady: false, decidedBy: 'detected_rows' },
  );
  // four plain rows with no recovery say nothing
  assertEquals(sessionSteadiness({ intervals: rows(['work', 'work', 'work', 'work']) }).decidedBy, 'nothing_said');
});

Deno.test('nothing said — an unlinked easy run still gets its drift read', () => {
  assertEquals(sessionSteadiness({}), { steady: true, decidedBy: 'nothing_said' });
  assertEquals(sessionSteadiness({ workoutRow: {}, factPacket: {}, intervals: [] }).steady, true);
});

Deno.test('the order holds — a higher rung beats every lower one that disagrees', () => {
  // plan says easy; steps, Strava, laps and the swing all say intervals. The plan wins.
  assertEquals(
    sessionSteadiness({
      plannedRow: { tags: ['family:run_vt1'] },
      factPacket: { ...packetSteps(12), ...packetPaces([420, 600, 430, 610, 425]) },
      workoutRow: { strava_data: { original_activity: { workout_type: 3 } }, laps: [{ intensity: 'REST' }, { intensity: 'ACTIVE' }, { intensity: 'ACTIVE' }] },
      intervals: [{ interval_type: 'work' }, { interval_type: 'recovery' }, { interval_type: 'work' }, { interval_type: 'warmup' }],
    }),
    { steady: true, decidedBy: 'plan_family' },
  );
});
