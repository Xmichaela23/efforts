// ============================================================================
// RIDES BUILD FOR THE ROAD BY DEFAULT; THE TRAINER IS THE EXCEPTION (2026-09-24).
//
// `docs/SPEC-outdoor-rides-2026-09-24.md` §6.2 and §6.3, held against the composer and the swap read:
//   · a block with no venue tag never builds `short_vo2`, `micro` or `minute_surge` on any ride, any week;
//   · easy and long rides are byte-for-byte what they were (steady / mixed, same minutes);
//   · a slot on the trainer for the rest of the plan rotates every shape on THAT slot from the next
//     unstarted week, the tagged week keeps its shape, every other ride stays on the road;
//   · reverting (no active row) puts it back on the road.
//
// Run: ~/.deno/bin/deno test --no-check --sloppy-imports --allow-read --allow-env supabase/functions/_shared/standing-plan/outdoor-rides.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeBlock, type ComposedWeek } from './compose.ts';
import { ARCHETYPES } from './golden-block.ts';
import { trainerSlotsByWeek } from '../session-swap/plan-adjustments.ts';

const home = ARCHETYPES.find((a) => a.key === 'home-barbell')!.args as Record<string, unknown>;
const newer = ARCHETYPES.find((a) => a.key === 'untested-minimal')!.args as Record<string, unknown>;
const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const RIDE_FAMILIES = ['ride_sprints', 'ride_anaerobic', 'ride_vo2', 'ride_sweet_spot', 'ride_endurance'];
const levels = (n: number) => Object.fromEntries(RIDE_FAMILIES.map((f) => [f, n]));
const AR_RIDES = { runs: 1, rides: 3, slots: { '1:0': 'ride', '3:0': 'ride' } };

/** Both programmes across the sweep's athletes and six more spanning levels 1–3 and the low-volume tier. */
const CASES: Array<{ label: string; args: Record<string, unknown> }> = [
  { label: 'All Rounder, runs', args: { ...home } },
  { label: 'All Rounder, newer', args: { ...newer } },
  { label: 'All Rounder, rides', args: { ...home, sportMix: AR_RIDES } },
  { label: 'All Rounder, rides, newer', args: { ...newer, enduranceExperience: { run: 'newer', ride: 'newer' }, sportMix: AR_RIDES } },
  { label: 'All Rounder, rides, level 2', args: { ...home, baselines: BASELINES, enduranceExperience: { run: 'experienced', ride: 'experienced' }, levelOverrides: levels(2), sportMix: AR_RIDES } },
  { label: 'All Rounder, rides, level 3', args: { ...home, baselines: BASELINES, enduranceExperience: { run: 'experienced', ride: 'experienced' }, levelOverrides: levels(3), sportMix: AR_RIDES } },
  { label: 'Ride + Strength, five rides', args: { ...home, frame: 'cycling_base', baselines: BASELINES, enduranceExperience: { ride: 'experienced' }, sportMix: {} } },
  { label: 'Ride + Strength, Day 2 off', args: { ...home, frame: 'cycling_base', baselines: BASELINES, enduranceExperience: { ride: 'experienced' }, sportMix: { slotsOff: ['2:0'] } } },
  { label: 'Ride + Strength, newer, five', args: { ...newer, frame: 'cycling_base', enduranceExperience: { ride: 'newer' }, sportMix: {} } },
  { label: 'Ride + Strength, newer, Day 2 off', args: { ...newer, frame: 'cycling_base', enduranceExperience: { ride: 'newer' }, sportMix: { slotsOff: ['2:0'] } } },
  { label: 'Ride + Strength, level 2', args: { ...home, frame: 'cycling_base', baselines: BASELINES, enduranceExperience: { ride: 'experienced' }, levelOverrides: levels(2), sportMix: {} } },
  { label: 'Ride + Strength, level 3', args: { ...home, frame: 'cycling_base', baselines: BASELINES, enduranceExperience: { ride: 'experienced' }, levelOverrides: levels(3), sportMix: {} } },
  { label: 'Ride + Strength, level 3, no FTP', args: { ...home, frame: 'cycling_base', enduranceExperience: { ride: 'experienced' }, levelOverrides: levels(3), sportMix: { slotsOff: ['2:0'] } } },
];

const WEEKS = 12;
const TRAINER = new Set(['short_vo2', 'micro', 'minute_surge']);
const tag = (s: { tags?: string[] }, p: string) => (s.tags ?? []).find((t) => t.startsWith(p))?.slice(p.length) ?? null;
const rides = (weeks: ComposedWeek[]) =>
  weeks.flatMap((w) => w.sessions.filter((s) => s.type === 'ride').map((s) => ({ week: w.week, s })));
const block = (args: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  composeBlock({ ...args, ...extra, weeks: WEEKS, taperWeeks: [] } as never);

Deno.test('⛔ §6.2 — no venue tag: no built ride carries a trainer shape, in any week, on either programme', () => {
  let seen = 0;
  const families = new Set<string>();
  for (const c of CASES) {
    for (const { week, s } of rides(block(c.args))) {
      seen += 1;
      families.add(tag(s, 'family:')!);
      const a = tag(s, 'archetype:');
      assert(a, `${c.label} week ${week} ${s.day}: a ride with no archetype tag`);
      assert(!TRAINER.has(a!), `${c.label} week ${week} ${s.day} ${tag(s, 'family:')}: built ${a} with no venue`);
      assertEquals(tag(s, 'venue:'), null, `${c.label} week ${week} ${s.day}: a venue tag on a fresh build`);
    }
  }
  assert(seen > 700, `only ${seen} rides swept`);
  for (const f of RIDE_FAMILIES) assert(families.has(f), `the sweep built no ${f}`);
});

Deno.test('⛔ §6.2 — easy and long rides: steady / mixed, the same minutes as before the road rule (Ride + Strength\'s midweek rides steady, 2026-09-27)', () => {
  // The sequences the composer built before 2026-09-24 (snapshot), per easy or long slot.
  const want: Record<string, Record<string, string[]>> = {
    // ⛔ p239's easy ride every week since 2026-09-29 (it alternated with the structured ride, which p239's "sparingly"
    // does not allow); the structured ride is a one-day choice on the swap sheet.
    'All Rounder, rides': { 'Thursday 4:0': Array.from({ length: WEEKS }, () => 'steady/80') },
    'All Rounder, newer': { 'Thursday 4:0': Array.from({ length: WEEKS }, () => 'steady/80') },
    // ⛔ The Tuesday and Friday rides are p239's plain easy ride every week (Michael, 2026-09-27, option A). ⛔ And the long
    // ride too, since 2026-09-29: it carries p239's two versions (`EnduranceSlot.versions`), builds the easy one every
    // week, and the structured ride is a one-day choice on the swap sheet (p239: "sparingly unless an event is coming").
    'Ride + Strength, five rides': {
      'Tuesday 2:0': Array.from({ length: WEEKS }, () => 'steady/80'),
      'Friday 5:1': Array.from({ length: WEEKS }, () => 'steady/80'),
      'Saturday 6:0': Array.from({ length: WEEKS }, () => 'steady/170'),
    },
    'Ride + Strength, Day 2 off': {
      'Friday 5:1': Array.from({ length: WEEKS }, () => 'steady/80'),
      'Saturday 6:0': Array.from({ length: WEEKS }, () => 'steady/170'),
    },
  };
  for (const [label, slots] of Object.entries(want)) {
    const c = CASES.find((x) => x.label === label)!;
    const got: Record<string, string[]> = {};
    for (const { s } of rides(block(c.args))) {
      if (tag(s, 'family:') !== 'ride_endurance') continue;
      (got[`${s.day} ${tag(s, 'slot:')}`] ??= []).push(`${tag(s, 'archetype:')}/${s.duration}`);
    }
    assertEquals(got, slots, label);
  }
});

Deno.test('⛔ §6.2 — hard rides: the road rotation, and VO2 is the one road shape every week', () => {
  // Ride + Strength at level 1: sweet spot walks medium / long / tempo (pp238-239's two-minute-plus shapes),
  // VO2 is p238's long repeats every week, sprints keep the frame's own road pins.
  const c = CASES.find((x) => x.label === 'Ride + Strength, five rides')!;
  const got: Record<string, string[]> = {};
  for (const { s } of rides(block(c.args))) {
    if (tag(s, 'family:') === 'ride_endurance') continue;
    (got[`${s.day} ${tag(s, 'slot:')} ${tag(s, 'family:')}`] ??= []).push(tag(s, 'archetype:')!);
  }
  // ⛔ THE ORDER IS THE HELD CYCLE'S (2026-09-29, `hard-rotation.ts`: p112's rotation under p148's 10%), so this pins
  // the shapes each ride walks — every road shape in the standard weeks, a new one every week — not a by-week order.
  const walks = (seq: Array<string | null>, list: string[]) => {
    assertEquals([...new Set(seq.slice(1))].sort(), [...list].sort(), seq.join(','));
    for (let w = 1; w < seq.length; w++) assert(list.length < 2 || seq[w] !== seq[w - 1], seq.join(','));
    assert(seq.every((id) => !TRAINER.has(String(id))), seq.join(','));
  };
  assertEquals(Object.keys(got).sort(), ['Friday 5:0 ride_sprints', 'Monday 1:0 ride_sweet_spot', 'Wednesday 3:0 ride_vo2', 'Wednesday 3:1 ride_sweet_spot']);
  walks(got['Monday 1:0 ride_sweet_spot'], ['medium', 'long', 'tempo']);
  walks(got['Wednesday 3:1 ride_sweet_spot'], ['medium', 'long', 'tempo']);
  walks(got['Wednesday 3:0 ride_vo2'], ['long_vo2']);
  walks(got['Friday 5:0 ride_sprints'], ['max_effort', 'flying_surge']);
  // ⛔ The two sweet spot rides never build one shape in one week (Michael, 2026-08-26).
  got['Monday 1:0 ride_sweet_spot'].forEach((id, w) => assert(id !== got['Wednesday 3:1 ride_sweet_spot'][w], `week ${w + 1}: both sweet spot rides built ${id}`));
  // And the All Rounder's own anaerobic ride (p274 day 2) rotates p237's three by-feel shapes, all road.
  const ar = CASES.find((x) => x.label === 'All Rounder, runs')!;
  const tuesday = rides(block(ar.args)).filter(({ s }) => tag(s, 'slot:') === '2:0').map(({ s }) => tag(s, 'archetype:'));
  // p237's fade at 130% joined the road rotation 2026-10-02 (week builder Stage 2; by feel, so road).
  walks(tuesday, ['progressive_repeats', 'one_to_one', 'sandwich', 'fade_130']);
});

/**
 * ⛔ §6.3 — one slot on the trainer for the rest of the plan. `trainerSlotsByWeek` is what the rewrite hands the
 * composer for the weeks AFTER the tagged one (`plan-adjustments.ts trainerSlotsByWeek`, tested below); here the
 * composer's own answer to it: that slot walks every shape from that week, exactly today's rotation by week number;
 * the weeks before keep the road; every other ride keeps the road.
 */
Deno.test('⛔ §6.3 — a trainer slot rotates every shape on that slot only, from the week it is listed', () => {
  const c = CASES.find((x) => x.label === 'Ride + Strength, five rides')!;
  const from = 4; // the tag landed in week 3; the rewrite lists weeks 4 on
  const listed = Object.fromEntries(Array.from({ length: WEEKS - from + 1 }, (_, i) => [from + i, ['3:0']]));
  const road = rides(block(c.args));
  const trainer = rides(block(c.args, { trainerSlotsByWeek: listed }));
  assertEquals(trainer.length, road.length);
  const all = ['long_vo2', 'short_vo2', 'micro'];
  for (let i = 0; i < road.length; i++) {
    const r = road[i].s, t = trainer[i].s, week = road[i].week;
    if (tag(t, 'slot:') === '3:0' && week >= from) {
      assertEquals(tag(t, 'family:'), 'ride_vo2');
      assertEquals(tag(t, 'archetype:'), all[(week - 1) % all.length], `week ${week}: the trainer walks the page's three by week number`);
    } else {
      assertEquals(tag(t, 'archetype:'), tag(r, 'archetype:'), `week ${week} ${t.day} ${tag(t, 'slot:')}: a ride off the trainer slot changed`);
      assertEquals(t.steps_preset, r.steps_preset, `week ${week} ${t.day} ${tag(t, 'slot:')}`);
    }
  }
  // Week 3 (the tagged week) and before: the road shape.
  for (const { week, s } of trainer) if (tag(s, 'slot:') === '3:0' && week < from) assertEquals(tag(s, 'archetype:'), 'long_vo2');
  // Weeks 4-6 on the trainer slot: all three, so the athlete meets p229's "try each type" on VO2 at last.
  assertEquals(trainer.filter(({ week, s }) => tag(s, 'slot:') === '3:0' && week >= 4 && week <= 6).map(({ s }) => tag(s, 'archetype:')), all);
  // Revert = no list: the road again, byte for byte.
  const reverted = rides(block(c.args, { trainerSlotsByWeek: {} }));
  for (let i = 0; i < road.length; i++) assertEquals(reverted[i].s.steps_preset, road[i].s.steps_preset);
});

/** The block's Monday-anchored dates: week 1 starts 2026-10-05. */
const DAY_INDEX: Record<string, number> = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };
const dateOf = (week: number, day: string): string | null => {
  const i = DAY_INDEX[day];
  if (i == null) return null;
  const d = new Date('2026-10-05T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + i);
  return d.toISOString().slice(0, 10);
};
const row = (over: Partial<{ exercise_name: string; substitute_exercise_name: string | null; applies_from: string; applies_until: string | null; status: string }>) => ({
  exercise_name: 'endurance:Wednesday:ride', substitute_exercise_name: 'venue:trainer', applies_from: dateOf(3, 'Wednesday')!, applies_until: null, status: 'active', ...over,
});

Deno.test('⛔ §3B — the rewrite lists the trainer slot for the weeks after the tag, that slot only; today and revert list nothing', () => {
  const c = CASES.find((x) => x.label === 'Ride + Strength, five rides')!;
  const composed = block(c.args);
  // Rest of plan from week 3's Wednesday: weeks 4-12, the first ride of Wednesday (VO2, slot 3:0) and nothing else.
  const restOfPlan = trainerSlotsByWeek(composed, [row({})], dateOf);
  assertEquals(Object.keys(restOfPlan).map(Number).sort((a, b) => a - b), [4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const keys of Object.values(restOfPlan)) assertEquals(keys, ['3:0']);
  // The second ride that day is its own slot (`endurance:Wednesday:ride:2`, the sweet spot).
  const second = trainerSlotsByWeek(composed, [row({ exercise_name: 'endurance:Wednesday:ride:2' })], dateOf);
  for (const keys of Object.values(second)) assertEquals(keys, ['3:1']);
  assertEquals(Object.keys(second).length, 9);
  // Just today: one date, nothing listed — the tag alone.
  assertEquals(trainerSlotsByWeek(composed, [row({ applies_until: dateOf(3, 'Wednesday') })], dateOf), {});
  // Reverted, or stopped before the date: nothing.
  assertEquals(trainerSlotsByWeek(composed, [row({ status: 'reverted' })], dateOf), {});
  assertEquals(trainerSlotsByWeek(composed, [row({ applies_until: dateOf(5, 'Wednesday') })], dateOf), { 4: ['3:0'], 5: ['3:0'] });
  // A run's machine, a sport swap and a workout pick are not the trainer.
  assertEquals(trainerSlotsByWeek(composed, [row({ substitute_exercise_name: 'venue:treadmill' })], dateOf), {});
  assertEquals(trainerSlotsByWeek(composed, [row({ substitute_exercise_name: 'discipline:run' })], dateOf), {});
  assertEquals(trainerSlotsByWeek(composed, [row({ substitute_exercise_name: 'workout:short_vo2' })], dateOf), {});
  // A slot with no ride on it lists nothing.
  assertEquals(trainerSlotsByWeek(composed, [row({ exercise_name: 'endurance:Sunday:ride' })], dateOf), {});
  // And the composer, handed that list, walks all three on Wednesday's VO2 from week 4 and the road before it.
  const rebuilt = rides(block(c.args, { trainerSlotsByWeek: restOfPlan })).filter(({ s }) => tag(s, 'slot:') === '3:0');
  assertEquals(rebuilt.map(({ s }) => tag(s, 'archetype:')), ['long_vo2', 'long_vo2', 'long_vo2', 'long_vo2', 'short_vo2', 'micro', 'long_vo2', 'short_vo2', 'micro', 'long_vo2', 'short_vo2', 'micro']);
});
