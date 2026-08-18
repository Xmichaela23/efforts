// ⛔ FLAT SPRINTS — the speed track's session (Michael, 2026-08-18).
//
// A RETAINING LOAD THAT SYNCS WITH THE BARBELL, not a progressive track programme. His words:
// *"Do not add volume; just pay the biological rent to hold the speed adaptation."* The volume never
// climbs, and in the anchor it is cut so the legs are fresh to express maximum strength on the heavy
// tests. If a future change makes this session grow across the block, it has stopped being what it
// is for.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/sprint-session.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { buildWeekMap } from './loading/wendler-531.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const build = (cfg: Record<string, unknown> = {}): any => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: MAXES,
  fiveKPaceSecPerMi: 435, thresholdPaceSecPerMi: 455, ftpWatts: 240,
  enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 15, easyPaceMinPerMile: 9,
  longRunDay: 'sunday',
  hardDays: [{ discipline: 'run', day: 'wednesday', goal: 'speed' }],
  ...cfg,
} as never);
const sprintIn = (p: any, week: number) =>
  (p.sessions_by_week[String(week)] ?? []).find((s: any) => s.name === 'Flat Sprints');
const repsIn = (p: any, week: number): number | null => {
  const m = String(sprintIn(p, week)?.steps_preset?.[0] ?? '').match(/^run_sprint_(\d+)x/);
  return m ? Number(m[1]) : null;
};

// ── THE GOAL AXIS ────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ `goal: speed` BUILDS A DIFFERENT SESSION, not a terrain of the hill one', () => {
  assertEquals(sprintIn(build(), 2)?.name, 'Flat Sprints');
  const hills = build({ hardDays: [{ discipline: 'run', day: 'wednesday' }] });
  assertEquals(sprintIn(hills, 2), undefined, 'the default changed — absent must still mean vo2');
  assert(/Hill|Intervals/.test(
    (hills.sessions_by_week['2'] as any[]).find((s) => /Hill|Intervals/.test(s.name))?.name ?? ''));
});

Deno.test('an unrecognised goal degrades to the shipped session, never to none', () => {
  const p = build({ hardDays: [{ discipline: 'run', day: 'wednesday', goal: 'sideways' }] });
  assertEquals(sprintIn(p, 2), undefined);
  assertEquals((p.sessions_by_week['2'] as any[]).filter((s) => /Hill/.test(s.name)).length, 1);
});

// ── THE 12-WEEK MAP ──────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE VOLUME NEVER CLIMBS — 6 through both leader waves', () => {
  const p = build();
  for (const week of [1, 2, 3, 5, 6, 7]) {
    assertEquals(repsIn(p, week), 6, `week ${week} is not the baseline six`);
  }
});

Deno.test('⛔ AND IT IS CUT IN THE ANCHOR — 4, so the legs are fresh for the heavy tests', () => {
  const p = build();
  for (const week of [9, 10, 11]) {
    assertEquals(repsIn(p, week), 4, `week ${week} did not take the anchor cut`);
  }
});

Deno.test('⛔ IT NEVER GETS LONGER, EITHER — one duration, every week it appears', () => {
  // A session that grew in minutes while its rep count held would be the same defect wearing a
  // different number.
  const p = build();
  const lengths = new Set(buildWeekMap(12)
    .map((bw) => sprintIn(p, bw.week)?.duration)
    .filter((d) => d != null));
  assertEquals([...lengths], [35]);
});

Deno.test('the rest is COMPLETE and it is stated as the prescription, not a detail', () => {
  // 10-15 s at maximum effort is a NEURAL session; an incomplete recovery turns it into a lactate
  // session, which is the one thing it must not become in a block that already has a threshold day.
  const s = sprintIn(build(), 2);
  assertEquals(/_r150s$/.test(String(s.steps_preset[0])), true, `rest moved: ${s.steps_preset[0]}`);
  assert(/short recovery turns it into a lactate session/i.test(String(s.description)));
});

// ── THE GROUND ───────────────────────────────────────────────────────────────────────────────────

Deno.test('the speed terrains name the ground and change nothing else', () => {
  for (const [terrain, words] of [['track', /on a track/], ['flat_road', /on a flat road/],
    ['turf', /on grass or turf/]] as const) {
    const p = build({ hardDays: [{ discipline: 'run', day: 'wednesday', goal: 'speed', terrain }] });
    const s = sprintIn(p, 2);
    assert(words.test(String(s.description)), `${terrain}: ${s.description}`);
    // ⚠️ TERRAIN DOES NOT TOUCH THE TOKEN. A sprint is a sprint; the ground is where, not what.
    assertEquals(s.steps_preset[0], 'run_sprint_6x12s_r150s');
  }
});

// ── IT COSTS WHAT IT COSTS ───────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE SPRINT IS INSIDE THE TYPED MILEAGE, not on top of it', () => {
  // The budget subtracts the hard session's OWN length. A sprint quoting a hill's 35 min happens to
  // match today; if either moves and the budget still quotes the other, the difference comes back as
  // easy miles — the defect §7 already fixed twice.
  const asked = 15 * 9;
  const built = (build().sessions_by_week['2'] as any[])
    .filter((s) => s.type === 'run').reduce((n, s) => n + s.duration, 0);
  assert(Math.abs(built - asked) <= 8, `asked ${asked} min of running, built ${built}`);
});

// ── THE LIGHT WEEKS ──────────────────────────────────────────────────────────────────────────────

Deno.test('⚠️ THE LIGHT WEEKS DELETE IT ENTIRELY — and that is NOT what Michael\'s map says', () => {
  // ⛔ FLAGGED, NOT RESOLVED. His 12-week map asks for a HALVED sprint session in weeks 4 and 8
  // ("cut volume in half — this must sync with the barbell deload"). The engine's light-week rule
  // deletes every hard session on 4, 8 and 12 and replaces it with an easy run — a rule he affirmed
  // on 2026-08-17 in the threshold doctrine ("weeks 4, 8 and 12 remain strictly no intervals").
  //
  // The two cannot both hold. This test pins what SHIPS so the disagreement is visible rather than
  // discovered in a plan; the deletion is the more conservative reading of his own CNS argument,
  // since a maximal sprint is the most neurally expensive thing in the block.
  // ⛔ If he rules for the halved version, this test inverts and `sprintRepsFor` grows a third row.
  const p = build();
  for (const week of [4, 8, 12]) {
    assertEquals(sprintIn(p, week), undefined, `week ${week} kept a sprint session`);
  }
});
