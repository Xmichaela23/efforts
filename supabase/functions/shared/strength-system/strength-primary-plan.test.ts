// STRENGTH-PRIMARY PLAN — ATR arc with a DELOAD, peak to a 96–97% single, and a SAFE retest
// (heavy sub-max triple → estimate e1RM, no solo max-grind). Off the entered 1RM, no inflation.
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildArcPhases, composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2,
});
const wk = (n: number) => PLAN.sessions_by_week[String(n)];
const strengthOf = (n: number) => wk(n).filter((s) => s.type === 'strength');
const benchEx = (n: number) =>
  strengthOf(n).flatMap((s) => s.strength_exercises ?? []).filter((e) => /^Bench Press/i.test(e.name));
const benchPct = (n: number) => Number((benchEx(n)[0]?.weight.match(/([\d.]+)%/) || [])[1]);
const allText = (n: number) => JSON.stringify(wk(n)).toLowerCase();

Deno.test('ATR arc with a DELOAD — accumulate→intensify→deload→peak→retest', () => {
  const { phases, recovery_weeks } = buildArcPhases(12);
  assertEquals(phases.map((p) => p.name), ['Base', 'Power', 'Deload', 'Peak', 'Retest']);
  // deload sits BETWEEN intensify and peak, ~6–8 wk in
  const deload = phases.find((p) => p.name === 'Deload')!;
  assert(deload.start_week >= 6 && deload.start_week <= 8, `deload at wk ${deload.start_week}, want 6–8`);
  assertEquals(recovery_weeks, [deload.start_week]);
});

Deno.test('DELOAD week recovers — lower volume + intensity than the weeks around it', () => {
  const deWk = buildArcPhases(12).phases.find((p) => p.name === 'Deload')!.start_week;
  const dePct = benchPct(deWk);
  assert(dePct <= 70, `deload bench ${dePct}% should drop (≤70)`);
  assert(dePct < benchPct(deWk - 1), 'deload intensity < the intensify week before it');
  assert(dePct < benchPct(deWk + 1), 'deload intensity < the peak week after it');
  // volume drop: deload sets < base sets
  const deSets = benchEx(deWk)[0].sets;
  assert(deSets <= 3, `deload volume should drop (sets ${deSets})`);
});

Deno.test('CURVE — peak is heavy DOUBLES (no near-max single); the single is the retest check only', () => {
  const peak = buildArcPhases(12).phases.find((p) => p.name === 'Peak')!;
  const last = benchEx(peak.end_week)[0];
  assertEquals(last.reps, 2, 'final peak week = a double, NOT a single (one near-max moment, at retest)');
  const pk = Number((last.weight.match(/([\d.]+)%/) || [])[1]);
  assert(pk >= 92 && pk <= 95, `peak double ~94%, got ${last.weight}`);
  // the ONE near-max single lives at the retest (wk12 check), and it's ABOVE the peak double
  const retestSingle = Math.max(...strengthOf(12).filter((s) => s.tags.includes('optional'))
    .flatMap((s) => s.strength_exercises ?? []).map((e) => parseFloat(e.weight)));
  assert(retestSingle > pk, `the retest check (${retestSingle}%) must exceed the peak double (${pk}%)`);
  assertEquals(benchPct(1), 72, 'base wk1 = 72%');
});

Deno.test('COURTESY RETEST — sparing, NOT four max-out days; the CHECK expresses a gain (above the peak)', () => {
  const sessions = strengthOf(12);
  // exactly the 2 KEY lifts are optional max-CHECKS; the other 2 estimate from a working set
  const checks = sessions.filter((s) => s.tags.includes('optional'));
  assertEquals(checks.length, 2, 'only 2 optional max-checks (squat+bench), not 4 max-out days');
  const checkText = JSON.stringify(checks).toLowerCase();
  assert(/bench press/.test(checkText) && /back squat/.test(checkText), 'the checks are squat + bench');
  // the CHECK expresses a gain: prescribed ABOVE the wk11 peak single (97%), e1RM > start
  const checkPct = checks.flatMap((s) => s.strength_exercises ?? []).map((e) => parseFloat(e.weight));
  assert(checkPct.every((p) => p >= 100), `the check must work up ABOVE the old max (≥100%), got ${checkPct}`);
  assert(Math.max(...checkPct) > 97, 'the check renders above the wk11 peak single (97%)');
  // the other 2 ESTIMATE from a top working set (not a formal max)
  const estimates = sessions.filter((s) => !s.tags.includes('optional'));
  assertEquals(estimates.length, 2);
  assert(estimates.flatMap((s) => s.strength_exercises ?? []).every((e) => e.reps === 3), 'estimates are a working triple');
  const t = allText(12);
  assert(t.includes('optional') && (t.includes('epley') || t.includes('estimate')), 'optional + estimate framing');
  assert(sessions.every((s) => s.tags.includes('1rm_test') && s.tags.includes('estimate_1rm')), 'tagged for e1RM write-back');
});

Deno.test('honest copy — measured gain, optional courtesy retest (not mandatory max-out)', () => {
  const d = PLAN.description.toLowerCase();
  assert(d.includes('measured') && d.includes('modest'), 'promise is tempered');
  assert(d.includes('deload') && d.includes('optional') && d.includes('no mandatory max-out'), 'names the deload + courtesy retest');
});

Deno.test('guard — real barbell every work phase, maintenance runs, sport-agnostic', () => {
  for (const n of [2, 6, 9]) {
    assertEquals(strengthOf(n).length, 4);
    const t = allText(n);
    assert(!t.includes('bodyweight tier cannot') && !t.includes('glute bridges'));
    assertEquals(wk(n).filter((s) => s.type === 'run').length, 2);
  }
  const bike = composeStrengthPrimaryPlan({ durationWeeks: 8, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'bike', enduranceFrequency: 2 });
  assertEquals(bike.sessions_by_week['2'].filter((s) => s.type === 'ride').length, 2);
});

Deno.test('maintenance band — typed miles clamped to floor/ceiling (pace-mapped), flat, glass-box', () => {
  const mk = (miles: number) => composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: miles, easyPaceMinPerMile: 9.5 });
  // 9.5 min/mi → floor 6 (60/9.5), ceiling 19 (180/9.5)
  assertEquals(mk(12).volume_notes, null, '12mi is inside the band — build it, no friction');
  const over = mk(30); assert(over.volume_notes !== null && /Held to 19/.test(over.volume_notes) && /Wilson/.test(over.volume_notes), 'over-ask → capped at ceiling + Wilson note');
  const under = mk(3); assert(under.volume_notes !== null && /Bumped to 6/.test(under.volume_notes) && /Hickson/.test(under.volume_notes), 'under-ask → floor bump + Hickson/Spiering note');
  // flat: maintenance run duration is the same every work week (no ramp)
  const inBand = mk(12);
  const rd = (w: string) => inBand.sessions_by_week[w].find((s) => s.type === 'run')!.duration;
  assertEquals(rd('2'), rd('9'), 'maintenance is FLAT — no ramp');
  // absent (no typed miles) → the fixed default, backward-compatible
  const def = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2 });
  assertEquals(def.volume_notes, null);
  assertEquals(def.sessions_by_week['2'].find((s) => s.type === 'run')!.duration, 35, 'no typed miles → fixed ~35min default');
});

Deno.test('SQUAT FREQUENCY — one heavy back squat/week; Lower B is hinge (deadlift + lighter front squat), never stacked', () => {
  // across a work week, Back Squat appears exactly once (Lower A, primary heavy) — not on both lower days
  const lifts = strengthOf(2).flatMap((s) => s.strength_exercises ?? []).map((e) => e.name);
  assertEquals(lifts.filter((n) => /^Back Squat/i.test(n)).length, 1, 'only ONE heavy back squat/week (was two)');
  // the hinge day carries the deadlift + a LIGHTER front squat — no heavy back-squat + deadlift in one session
  const lowerB = strengthOf(2).find((s) => /Lower B/i.test(s.name))!;
  const lbNames = (lowerB.strength_exercises ?? []).map((e) => e.name).join(' ');
  assert(/Conventional Deadlift/i.test(lbNames) && /Front Squat/i.test(lbNames), `Lower B = deadlift + front squat, got ${lbNames}`);
  assert(!/Back Squat/i.test(lbNames), 'Lower B must NOT stack a heavy back squat with the deadlift');
});

Deno.test('MILEAGE never silently dropped — typed miles honored even without a learned easy pace (estimate + disclose)', () => {
  // pace UNKNOWN but miles typed → must NOT fall to the fixed 35min default; estimate + say so
  const noPace = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 25 });
  const mins = noPace.sessions_by_week['2'].find((s) => s.type === 'run')!.duration;
  assert(mins !== 35, `typed 25mi must not collapse to the 35min default (got ${mins})`);
  assert(noPace.volume_notes !== null && /estimated/i.test(noPace.volume_notes), 'missing pace → disclosed estimate note');
  // 25mi over a 10:00/mi fallback → ceiling 18 (180/10) → capped, so the Wilson note fires too
  assert(/Held to 18/.test(noPace.volume_notes!) && /Wilson/.test(noPace.volume_notes!), 'over-ask still caps on the fallback pace');
});

Deno.test('DISTRIBUTION — spread as long-run + easy fill (not total÷N), extra runs stacked on UPPER days, lift-first', () => {
  const mk = (freq: number) => composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: freq, targetWeeklyMiles: 18, easyPaceMinPerMile: 10 });
  // 3 run days: only 2 run-only slots (Wed/Sat) → the 3rd stacks onto an upper lift day (Mon)
  const w3 = mk(3).sessions_by_week['2'];
  const runs3 = w3.filter((s) => s.type === 'run');
  assertEquals(runs3.length, 3, '3 run days materialize (stacked beyond the 2 run-only slots)');
  const durs3 = runs3.map((r) => r.duration).sort((a, b) => b - a);
  assert(durs3[0] > durs3[durs3.length - 1], 'NOT equal split — a long run + smaller fill runs');
  // the long run lands on the run-only day (Saturday), never on a lift day
  const longRun = runs3.reduce((m, r) => (r.duration > m.duration ? r : m));
  assertEquals(longRun.day, 'Saturday', 'the long run is on the run-only day, not stacked on a lift day');
  // a stacked day (Monday has both) orders LIFT before RUN
  const monday = w3.filter((s) => s.day === 'Monday');
  assert(monday.length === 2 && monday[0].type === 'strength' && monday[1].type === 'run', 'stacked day: lift first, then the easy run');

  // 4 run days → 2 stacked (both upper days), never a stacked heavy-lower day
  const w4 = mk(4).sessions_by_week['2'];
  const runDays4 = w4.filter((s) => s.type === 'run').map((r) => r.day);
  assertEquals(runDays4.length, 4);
  const lowerDays = w4.filter((s) => s.type === 'strength' && /Lower/.test(s.name)).map((s) => s.day);
  assert(!runDays4.some((d) => lowerDays.includes(d)), 'no run stacked on a heavy-lower day (Tue/Fri)');
});

Deno.test('NO-1RMs path — week 1 is a baseline test (offered, not forced); weeks 2-12 train', () => {
  const no = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2, needsBaseline: true });
  const wk1 = no.sessions_by_week['1'].filter((s) => s.type === 'strength');
  assertEquals(wk1.length, 2, 'week 1 = 2 baseline tests (lower + upper), not 4 training days');
  assert(wk1.every((s) => /^Baseline Test:/.test(s.name)), 'named "Baseline Test: …" so the logger recognizes it by name + writes performance_numbers');
  assert(JSON.stringify(wk1).includes('Back Squat') && JSON.stringify(wk1).includes('Bench Press'));
  assert(no.sessions_by_week['2'].some((s) => s.type === 'strength' && /Strength Focus/.test(s.name)), 'weeks 2+ train');
  assertEquals(no.sessions_by_week['1'].filter((s) => s.type === 'run').length, 2, 'easy maintenance still fills the baseline week');

  // YES / unset path (default): week 1 trains, no baseline test, no bounce-out
  const yes = composeStrengthPrimaryPlan({ durationWeeks: 12, strengthFrequency: 4, tier: 'barbell', enduranceSport: 'run', enduranceFrequency: 2 });
  assert(!JSON.stringify(yes.sessions_by_week['1']).includes('Baseline Test'), 'YES path: week 1 is training');
});
