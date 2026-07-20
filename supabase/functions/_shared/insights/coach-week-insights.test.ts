// deno test --allow-none supabase/functions/_shared/insights/coach-week-insights.test.ts
import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeCoachWeekInsight, buildCoachWeekInsightInput } from './coach-week-insights.ts';

const d = (discipline: string, actualLoad: number, sessionCount: number, extra: Record<string, unknown> = {}) =>
  ({ discipline, actualLoad, sessionCount, ...extra });

// ── SILENCE IS LEGAL ────────────────────────────────────────────────────────────────────────────────
Deno.test('nothing trained → null, never "you did nothing"', () => {
  assertEquals(composeCoachWeekInsight({ hasPlan: true, disciplines: [] }), null);
  assertEquals(composeCoachWeekInsight({ hasPlan: false, disciplines: [d('run', 0, 0)] }), null);
});

Deno.test('malformed input → null, not a throw', () => {
  assertEquals(composeCoachWeekInsight(null as any), null);
  assertEquals(composeCoachWeekInsight({ hasPlan: true, disciplines: null as any }), null);
});

Deno.test('one discipline, no plan, no ratio → silent (a single sport is self-evident)', () => {
  assertEquals(composeCoachWeekInsight({ hasPlan: false, disciplines: [d('run', 100, 4)] }), null);
});

// ── CLAUSE 1 — where the week went ──────────────────────────────────────────────────────────────────
Deno.test('a real mix names the lead discipline and the shares', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    disciplines: [d('run', 40, 4), d('strength', 24, 3), d('ride', 23, 2), d('swim', 13, 1)],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('running'), out!);
  assert(out!.includes('40%'), out!);
  assert(out!.includes('strength 24%'), out!);
});

Deno.test('a rounding-error discipline is not named', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    disciplines: [d('run', 95, 5), d('walk', 2, 1)],
  });
  // walk is 2% — below the floor, so there is no mix worth describing.
  assertEquals(out, null);
});

// ── CLAUSE 2 — is anything quietly disappearing ─────────────────────────────────────────────────────
Deno.test('a discipline below its own normal is named, as description not diagnosis', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    posture: { strength: 'develop', run: 'maintain' },
    disciplines: [d('run', 70, 5, { acwr: 1.1 }), d('strength', 30, 1, { verdict: 'sliding' })],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('estimated one-rep maxes have been sliding'), out!);
  // NOT a prescription and NOT an injury claim.
  assert(!/should|need to|must|risk|injur/i.test(out!), out!);
});

Deno.test('no acwr data → no disappearance claim (no inference without evidence)', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    disciplines: [d('run', 70, 5), d('strength', 30, 1)],
  });
  assert(out, 'expected the mix clause');
  assert(!out!.includes('below its own recent normal'), out!);
});

// ── CLAUSE 3 — against the reference ────────────────────────────────────────────────────────────────
Deno.test('PLAN: under-plan reads as consequence, never as a tally', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    disciplines: [
      d('run', 40, 4, { plannedLoad: 45 }),
      d('strength', 10, 1, { plannedLoad: 30 }),
    ],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('where you are now, not where you were scheduled to be'), out!);
  // The tally form the prompt bans: "N of M".
  assert(!/\d+\s+of\s+\d+/i.test(out!), out!);
});

Deno.test('PLAN: a partial week cannot read as "came in lighter" (the Q-177 trap)', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    partialWeek: true,
    disciplines: [
      d('run', 5, 1, { plannedLoad: 45 }),
      d('strength', 2, 1, { plannedLoad: 30 }),
    ],
  });
  assert(!out || !out.includes('lighter than the plan asked'), String(out));
});

Deno.test('NO PLAN: a down week is explicitly not a failure state', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    weekLoadVsNormal: 0.6,
    disciplines: [d('run', 60, 2), d('strength', 40, 2)],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('how a down week is supposed to look'), out!);
  // Never render plan-absence as a deficit.
  assert(!/plan/i.test(out!), out!);
});

Deno.test('NO PLAN: within-normal reads flat, with no praise', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    weekLoadVsNormal: 1.0,
    disciplines: [d('run', 60, 3), d('ride', 40, 2)],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('inside your recent normal'), out!);
});

// ── FOCUS (posture) — "what is affecting what" ──────────────────────────────────────────────────────
Deno.test('MAINTAIN: a maintained discipline drifting down is NOT reported (Q-179)', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    posture: { run: 'maintain', strength: 'develop' },
    disciplines: [d('run', 60, 2, { acwr: 0.5 }), d('strength', 40, 3, { acwr: 1.1 })],
  });
  // The run dip is the declared plan working. No warning — and no consoling "that's a trade" either.
  assert(!out || !/running ran below/i.test(out), String(out));
  assert(!out || !/trade|mistake|not a loss/i.test(out), String(out));
});

Deno.test('DEVELOP: the discipline being built earns the consequence clause', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    posture: { strength: 'develop', run: 'maintain' },
    disciplines: [d('run', 70, 4, { acwr: 1.0 }), d('strength', 30, 1, { verdict: 'sliding' })],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes("it's the one you're building"), out!);
});

Deno.test('UNKNOWN posture: states the fact, never the "you\'re building it" consequence', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    disciplines: [d('run', 70, 4, { acwr: 1.0 }), d('strength', 30, 1, { verdict: 'sliding' })],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('estimated one-rep maxes have been sliding'), out!);
  assert(!out!.includes("you're building"), out!);
});

Deno.test('DROPPED: a dropped discipline is invisible — never named, never penalised', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    posture: { swim: 'dropped' },
    disciplines: [d('run', 60, 4, { acwr: 1.0 }), d('strength', 35, 3, { acwr: 1.0 }), d('swim', 20, 1, { acwr: 0.2 })],
  });
  assert(out, 'expected a paragraph');
  assert(!/swim/i.test(out!), out!);
});

Deno.test('CREDIT: endurance focus + strength holding reads as contribution, not competition', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    posture: { run: 'develop', strength: 'maintain' },
    disciplines: [d('run', 70, 4, { acwr: 1.1 }), d('strength', 30, 2, { verdict: 'holding' })],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('supports economy rather than competing'), out!);
});

Deno.test('CREDIT does not fire when the lifting is actually falling away', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    posture: { run: 'develop', strength: 'develop' },
    disciplines: [d('run', 70, 4, { acwr: 1.1 }), d('strength', 30, 1, { acwr: 0.4 })],
  });
  assert(out, 'expected a paragraph');
  assert(!out!.includes('supports economy'), out!);
});

// ── RIGHT INSTRUMENT / PRESCRIBED-IS-NOT-SHORTFALL ──────────────────────────────────────────────────
Deno.test('a PRESCRIBED lighter week, executed, is never reported as a shortfall', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'develop', run: 'maintain' },
    // Deload: the plan asked for little, they did it. acwr is low BECAUSE the plan said so.
    disciplines: [
      d('run', 60, 3, { plannedLoad: 60, acwr: 1.0 }),
      d('strength', 12, 2, { plannedLoad: 12, acwr: 0.4, verdict: 'holding' }),
    ],
  });
  assert(!out || !/below its own recent normal|sliding/i.test(out), String(out));
});

Deno.test('STRENGTH is judged by e1RM, not by a volume ratio', () => {
  // Volume ratio is in the tank, but the lifts are holding — that is NOT giving ground.
  const holding = composeCoachWeekInsight({
    hasPlan: false,
    posture: { strength: 'develop' },
    disciplines: [d('run', 70, 4, { acwr: 1.0 }), d('strength', 30, 2, { acwr: 0.3, verdict: 'holding' })],
  });
  assert(!holding || !/sliding|below its own/i.test(holding), String(holding));

  // Volume ratio looks fine, but the e1RMs are sliding — THAT is the story.
  const sliding = composeCoachWeekInsight({
    hasPlan: false,
    posture: { strength: 'develop' },
    disciplines: [d('run', 70, 4, { acwr: 1.0 }), d('strength', 30, 3, { acwr: 1.1, verdict: 'sliding' })],
  });
  assert(sliding, 'expected a paragraph');
  assert(sliding!.includes('estimated one-rep maxes have been sliding'), sliding!);
  assert(sliding!.includes("it's the one you're building"), sliding!);
});

Deno.test('no e1RM verdict → no strength claim at all (no inference without evidence)', () => {
  const out = composeCoachWeekInsight({
    hasPlan: false,
    posture: { strength: 'develop' },
    disciplines: [d('run', 70, 4, { acwr: 1.0 }), d('strength', 30, 1, { acwr: 0.2 })],
  });
  assert(!out || !/sliding|below its own recent normal/i.test(out), String(out));
});

// ── VOICE ───────────────────────────────────────────────────────────────────────────────────────────
Deno.test('no banned words or exclamation marks in any reachable output', () => {
  const cases: Parameters<typeof composeCoachWeekInsight>[0][] = [
    { hasPlan: false, weekLoadVsNormal: 0.6, disciplines: [d('run', 60, 3), d('strength', 40, 2, { acwr: 0.4 })] },
    { hasPlan: false, weekLoadVsNormal: 1.4, disciplines: [d('run', 60, 3), d('ride', 40, 2)] },
    { hasPlan: true, disciplines: [d('run', 40, 4, { plannedLoad: 40 }), d('strength', 30, 3, { plannedLoad: 30 })] },
    { hasPlan: true, disciplines: [d('run', 80, 4, { plannedLoad: 40 }), d('strength', 30, 3, { plannedLoad: 30 })] },
  ];
  for (const c of cases) {
    const out = composeCoachWeekInsight(c);
    if (!out) continue;
    assert(!/\b(crush|nailed|smash|amazing|great job|awesome|keep it up|proud|beast|killer)\b/i.test(out), out);
    assert(!out.includes('!'), out);
  }
});

// ── MAPPER ──────────────────────────────────────────────────────────────────────────────────────────
Deno.test('mapper reads the coach by_discipline shape and survives missing fields', () => {
  const inp = buildCoachWeekInsightInput(
    [
      { discipline: 'run', actual_load: 40, planned_load: 45, session_count: 4, acwr: 1.1 },
      { discipline: 'strength', actual_load: 24, session_count: 2 },
      null,
    ] as any,
    { hasPlan: true },
  );
  assertEquals(inp.hasPlan, true);
  assertEquals(inp.disciplines.length, 3);
  assertEquals(inp.disciplines[0].acwr, 1.1);
  assertEquals(inp.disciplines[1].plannedLoad, null);
  assertEquals(inp.disciplines[2].discipline, 'other');
  assert(composeCoachWeekInsight(inp) !== undefined);
});

Deno.test('doing every prescribed session and STILL sliding is reported, not swallowed', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'develop', run: 'maintain' },
    disciplines: [
      d('run', 55, 4, { plannedLoad: 52, acwr: 1.2 }),
      d('strength', 34, 3, { plannedLoad: 34, acwr: 1.1, verdict: 'sliding' }),
    ],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('estimated one-rep maxes have been sliding'), out!);
  assert(out!.includes("it's the one you're building"), out!);
});

// ── PROTOCOL AWARENESS — the block's design decides what the number means ───────────────────────────
Deno.test('5x5: a dipping e1RM is the RAMP, never reported as decay', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'develop' },
    strengthProtocol: { protocolId: 'five_by_five', weekInBlock: 5, workingPct: 75 },
    disciplines: [
      d('run', 50, 3, { plannedLoad: 50, acwr: 1.0 }),
      d('strength', 40, 2, { plannedLoad: 40, verdict: 'sliding' }),
    ],
  });
  assert(!out || !/sliding|drifted down|below its own/i.test(out), String(out));
});

Deno.test('5x5: the STALL is the event worth naming', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'develop' },
    strengthProtocol: { protocolId: 'five_by_five', weekInBlock: 9, workingPct: 82, missedPrescribedReps: true },
    disciplines: [d('run', 50, 3, { plannedLoad: 50 }), d('strength', 40, 2, { plannedLoad: 40 })],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('that is the stall'), out!);
});

Deno.test('5x5: hitting the 85% ceiling reads as the block ending, not a problem', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'develop' },
    strengthProtocol: { protocolId: 'five_by_five', weekInBlock: 13, workingPct: 85 },
    disciplines: [d('run', 50, 3, { plannedLoad: 50 }), d('strength', 40, 2, { plannedLoad: 40 })],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('retest'), out!);
  assert(!/should|must|need to/i.test(out!), out!);
});

Deno.test('5x5: a deload week says nothing about the lighter load', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'develop' },
    strengthProtocol: { protocolId: 'five_by_five', weekInBlock: 8, workingPct: 45, isDeloadWeek: true, e1rmVerdict: 'sliding' },
    disciplines: [d('run', 50, 3, { plannedLoad: 50 }), d('strength', 15, 2, { plannedLoad: 15, verdict: 'sliding' })],
  });
  assert(!out || !/sliding|stall|retest|drifted/i.test(out), String(out));
});

Deno.test('MAINTENANCE dose: sliding IS the story, because holding is its only job', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'maintain', run: 'develop' },
    strengthProtocol: { protocolId: 'minimum_dose', weekInBlock: 6, e1rmVerdict: 'sliding' },
    disciplines: [d('run', 70, 4, { plannedLoad: 70, acwr: 1.1 }), d('strength', 15, 1, { plannedLoad: 15 })],
  });
  assert(out, 'expected a paragraph');
  assert(out!.includes('holding is the one thing that block is for'), out!);
});

Deno.test('an ungrounded protocol stays silent rather than guessing', () => {
  const out = composeCoachWeekInsight({
    hasPlan: true,
    posture: { strength: 'develop' },
    strengthProtocol: { protocolId: 'triathlon_performance', weekInBlock: 4, e1rmVerdict: 'sliding' },
    disciplines: [d('run', 50, 3, { plannedLoad: 50 }), d('strength', 40, 2, { plannedLoad: 40 })],
  });
  assert(!out || !/stall|retest|holding is the one thing/i.test(out), String(out));
});
