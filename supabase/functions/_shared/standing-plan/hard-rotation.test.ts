// ============================================================================
// THE HARD ROTATION HOLDS THE WEEK — p112's rotation under p148's under-10% weekly change.
//
// ⛔ WHAT IT PINS, ON EVERY FRAME (standard weeks 2-12; week 1 is the test week and is exempt):
//   · every printed shape of every rotating hard slot is built in weeks 2-12, and each such slot changes
//     shape every week (the rotation is whole and still rotates);
//   · two hard slots of one family never build the same shape in one week (Ride + Strength's sweet spot pair);
//   · the week's endurance TOTAL never moves more than 10% week to week;
//   · the week's HARD minutes and p146's three minute buckets move more than 10% no more often than the
//     numbers below — each non-zero one is the page's own spread, named beside it;
//   · the same with a picked workout on a hard row: the pick is built every week and the rest still hold.
//
// Run: deno test --no-check --allow-all supabase/functions/_shared/standing-plan/hard-rotation.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FRAMES, assignSports, composeBlock, defaultCompetitionLifts, fenceMixToFrame, isHardSlot,
  type FrameId,
} from './index.ts';
import { archetypesForVenue } from '../endurance-library/index.ts';
import { holdRotation, heldRowFor } from './hard-rotation.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const WEEKS = 12;

type Sport = 'run' | 'ride';
type Case = { label: string; frame: FrameId; sports?: Record<string, Sport>; archetypes?: Record<string, string>; slotsOff?: string[] };

/** The frame's printed sport per slot (the book's own week). */
function printed(frame: FrameId, off: string[] = []): Record<string, Sport> {
  const out: Record<string, Sport> = {};
  for (const d of FRAMES[frame].columns.standard) {
    d.endurance.forEach((s, i) => {
      const key = `${d.day}:${i}`;
      if (s.optional && off.includes(key)) return;
      out[key] = String(s.family).startsWith('ride_') ? 'ride' : 'run';
    });
  }
  return out;
}

function block(c: Case) {
  const sports = c.sports ?? printed(c.frame, c.slotsOff);
  const mix = fenceMixToFrame(c.frame, {
    runs: Object.values(sports).filter((s) => s === 'run').length,
    rides: Object.values(sports).filter((s) => s === 'ride').length,
    swimDays: 0, slotsOff: c.slotsOff ?? null, slots: sports, archetypes: c.archetypes ?? null, minutes: null,
  });
  return composeBlock({
    frame: c.frame, competitionLifts: defaultCompetitionLifts(),
    seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
    baselines: BASELINES as never, equipment: ['Commercial gym'], roundTo: 5, sportMix: mix,
    weeks: WEEKS, taperWeeks: [],
  } as never);
}

const tag = (s: { tags?: string[] }, p: string) => (s.tags ?? []).find((t) => t.startsWith(p))?.slice(p.length) ?? null;
const HARD_BANDS = new Set(['above', 'near', 'below']);
const isEndurance = (s: { type?: string }) => s.type === 'run' || s.type === 'ride' || s.type === 'swim';

/** Transitions between standard weeks 2..12 whose change is over p148's 10%. */
function breaks(xs: number[]): number {
  let n = 0;
  for (let w = 2; w < xs.length; w++) {
    const a = xs[w - 1], b = xs[w];
    if (a > 0 ? Math.abs(b - a) / a > 0.10 : b > 0) n += 1;
  }
  return n;
}

function readBlock(c: Case) {
  const weeks = block(c);
  const hard: number[] = [], total: number[] = [], sub: number[] = [], near: number[] = [], over: number[] = [];
  const shapes: Record<string, Array<string | null>> = {};
  const families: Record<string, string> = {};
  const levels: Record<string, number> = {};
  for (const wk of weeks) {
    const end = wk.sessions.filter(isEndurance);
    total.push(end.reduce((a, s) => a + Number(s.duration), 0));
    const h = end.filter((s) => HARD_BANDS.has(tag(s, 'band:') ?? ''));
    hard.push(h.reduce((a, s) => a + Number(s.duration), 0));
    sub.push(wk.enduranceLedger.subVt1Minutes);
    near.push(wk.enduranceLedger.nearThresholdMinutes);
    over.push(wk.enduranceLedger.overThresholdMinutes + wk.enduranceLedger.overVt2Minutes);
    for (const s of h) {
      const key = tag(s, 'slot:')!;
      (shapes[key] ??= []).push(tag(s, 'archetype:'));
      families[key] = tag(s, 'family:')!;
      levels[key] = Number(tag(s, 'level:'));
    }
  }
  return { weeks, hard, total, sub, near, over, shapes, families, levels };
}

/** The shapes a hard slot rotates through, asked of the frame and the library directly — not of the composer. */
function rotationList(frame: FrameId, key: string, family: string, level: number, substituted: boolean): string[] {
  const [d, i] = key.split(':').map(Number);
  const slot = FRAMES[frame].columns.standard.find((x) => x.day === d)!.endurance[i];
  const offered = archetypesForVenue(family as never, level as never, 'road').map((a) => a.id);
  if (!substituted && slot.archetypes?.length) {
    const usable = slot.archetypes.filter((id) => offered.includes(id));
    if (usable.length) return usable;
  }
  return offered;
}

/**
 * ⛔ THE CEILINGS — breaks of the 10% line over weeks 2-12 (10 steps), measured 2026-09-29 on this build. Every
 * non-zero one is a slot whose printed shapes differ by more than 10% whatever the order:
 *   · strength_half / hyp_half — p233's level-1 near-threshold list carries Surge-Embedded at 79 min against 43-54
 *     for the other five, and the slot must change weekly: the week it lands breaks the line on the way in or out.
 *   · all_rounder, days 1-3 all ridden — one rotating ride (p237's three anaerobic rides, 33 / 46 / 65 min).
 *     Holding the minutes needs Sandwich every other week, and Sandwich is the only one with near-threshold
 *     work (13 min) — so near-threshold (and over-threshold) minutes flip every week. The page's own spread.
 *   · all_rounder printed — p233's six level-1 near-threshold sessions differ widely in near-threshold minutes, and
 *     p232/p237's shapes put a couple of dozen minutes a week over threshold, so one shape swap is 10%.
 *   · cycling_long — one rotating ride (p238's three sweet spot rides, 57 / 59 / 83 min): Tempo Blocks breaks the
 *     line on both sides of its one week in the cycle.
 *   · hyp_5k over-threshold — p232's MLSS half and p244's sprints; a dozen minutes a week.
 */
const CASES: Array<Case & { ceil: { hard: number; sub: number; near: number; over: number } }> = [
  { label: 'Run + Strength', frame: 'strength_5k', ceil: { hard: 0, sub: 0, near: 1, over: 2 } },
  { label: 'Run Lead + Strength', frame: 'strength_half', ceil: { hard: 1, sub: 0, near: 2, over: 1 } },
  { label: 'Run + Muscle', frame: 'hyp_5k', ceil: { hard: 0, sub: 0, near: 0, over: 9 } },
  { label: 'Run Lead + Muscle', frame: 'hyp_half', ceil: { hard: 2, sub: 0, near: 3, over: 3 } },
  { label: 'All Rounder, printed', frame: 'all_rounder', ceil: { hard: 0, sub: 0, near: 7, over: 6 } },
  {
    label: 'All Rounder, every choice ridden', frame: 'all_rounder',
    sports: { '1:0': 'ride', '2:0': 'ride', '3:0': 'ride', '4:0': 'ride', '6:0': 'ride' },
    ceil: { hard: 1, sub: 1, near: 10, over: 10 },
  },
  { label: 'Ride + Strength', frame: 'cycling_base', ceil: { hard: 0, sub: 0, near: 0, over: 0 } },
  { label: 'Ride + Strength, four rides', frame: 'cycling_base', slotsOff: ['2:0'], ceil: { hard: 0, sub: 0, near: 0, over: 0 } },
  { label: 'Ride Long + Strength', frame: 'cycling_long', ceil: { hard: 2, sub: 0, near: 2, over: 0 } },
];

/** A picked workout on a hard row — the athlete's own — for each frame where the row takes one. */
const PICKS: Array<Case & { pick: [string, string]; ceil: { hard: number } }> = [
  // ⚠️ With the MLSS fixed at 39 min, p247's three NT lines (69 / 59 / 55) cannot all sit inside 10%: 98 -> 108 is 10.2%.
  { label: 'Run + Strength, MLSS picked', frame: 'strength_5k', archetypes: { '1:0': 'descending' }, pick: ['1:0', 'descending'], ceil: { hard: 1 } },
  { label: 'Run Lead + Strength, NT picked', frame: 'strength_half', archetypes: { '3:0': 'race_repeats' }, pick: ['3:0', 'race_repeats'], ceil: { hard: 0 } },
  { label: 'Run Lead + Muscle, MLSS picked', frame: 'hyp_half', archetypes: { '1:0': 'forty_twenty' }, pick: ['1:0', 'forty_twenty'], ceil: { hard: 2 } },
  { label: 'All Rounder, anaerobic ride picked', frame: 'all_rounder', archetypes: { '2:0': 'one_to_one' }, pick: ['2:0', 'one_to_one'], ceil: { hard: 0 } },
  { label: 'Ride Long + Strength, sweet spot picked', frame: 'cycling_long', archetypes: { '1:0': 'long' }, pick: ['1:0', 'long'], ceil: { hard: 0 } },
];

/** The rotation is whole, it rotates, and no family builds one shape twice in a week. */
function assertRotation(c: Case, r: ReturnType<typeof readBlock>, pinned: string[] = []) {
  for (const [key, seq] of Object.entries(r.shapes)) {
    if (pinned.includes(key)) continue;
    const [d, i] = key.split(':').map(Number);
    const frameSlot = FRAMES[c.frame].columns.standard.find((x) => x.day === d)!.endurance[i];
    if (!isHardSlot(frameSlot)) continue;
    const substituted = (r.weeks[1].sessions.find((s) => tag(s, 'slot:') === key)?.tags ?? []).includes('sport_assigned');
    const list = rotationList(c.frame, key, r.families[key], r.levels[key], substituted);
    const standard = seq.slice(1);
    if (substituted || new Set(seq).size === 1 && list.length > 1 && !frameSlot.archetypes?.length && seq[0] != null
      && !list.includes(seq[0]!)) continue;
    // A slot the assignment pins to one shape (a substituted ride, the frame's own pin) does not rotate.
    if (new Set(seq).size === 1) continue;
    for (const id of list) assert(standard.includes(id), `${c.label} ${key}: ${id} never built in weeks 2-12 (${standard.join(',')})`);
    for (let w = 1; w < seq.length; w++) assert(seq[w] !== seq[w - 1], `${c.label} ${key}: week ${w + 1} repeats ${seq[w]}`);
  }
  // No twin: two ROTATING slots of one family, one shape, one week. ⚠️ A slot the assignment fixes (a substituted
  // ride takes its family's first shape) is not moved by the cycle; the cycle builds its twin as seldom as it can.
  for (let w = 0; w < WEEKS; w++) {
    const seen = new Map<string, string>();
    for (const [key, seq] of Object.entries(r.shapes)) {
      if (pinned.includes(key) || new Set(seq).size < 2) continue;
      const id = `${r.families[key]}/${seq[w]}`;
      assert(!seen.has(id), `${c.label} week ${w + 1}: ${seen.get(id)} and ${key} both build ${id}`);
      seen.set(id, key);
    }
  }
}

for (const c of CASES) {
  Deno.test(`⛔ p112 + p148 — ${c.label}: the rotation is whole and the week holds`, () => {
    const r = readBlock(c);
    assertRotation(c, r);
    assertEquals(breaks(r.total), 0, `${c.label}: endurance total ${r.total.join(' ')}`);
    const got = { hard: breaks(r.hard), sub: breaks(r.sub), near: breaks(r.near), over: breaks(r.over) };
    for (const k of ['hard', 'sub', 'near', 'over'] as const) {
      assert(got[k] <= c.ceil[k], `${c.label}: ${k} broke 10% ${got[k]}x (ceiling ${c.ceil[k]}) — ${JSON.stringify({ hard: r.hard, sub: r.sub, near: r.near, over: r.over })}`);
    }
  });
}

for (const c of PICKS) {
  Deno.test(`⛔ a picked hard workout always wins — ${c.label}; the rest still hold`, () => {
    const r = readBlock(c);
    const [key, id] = c.pick;
    assertEquals(r.shapes[key], new Array(WEEKS).fill(id), `${c.label}: the pick was not built every week`);
    assertRotation(c, r, [key]);
    assertEquals(breaks(r.total), 0, `${c.label}: endurance total ${r.total.join(' ')}`);
    assert(breaks(r.hard) <= c.ceil.hard, `${c.label}: hard minutes ${r.hard.join(' ')}`);
  });
}

Deno.test('⛔ the cycle itself: every shape, a change every step, the minutes held where the shapes allow it', () => {
  // Run + Strength's two hard runs as measured off the build: four MLSS shapes and p247's three NT lines.
  const mlss = [['surge_float', 36], ['forty_twenty', 46], ['long_surge_float', 48], ['descending', 39]] as const;
  const nt = [['sustained_5min_90', 69], ['sustained_6min_88', 59], ['sustained_8min30_85', 55]] as const;
  const slot = (key: string, family: string, xs: ReadonlyArray<readonly [string, number]>) => ({
    key, family, candidates: xs.map(([id, minutes]) => ({ id, minutes, sub: 0, near: 0, over: 0 })),
  });
  const plan = holdRotation([slot('1:0', 'run_mlss', mlss), slot('3:0', 'run_near_threshold', nt)], { minutes: 0, sub: 100, near: 0, over: 0 });
  const L = plan.cycle.length;
  const mins = plan.cycle.map((row) => mlss.find(([id]) => id === row[0])![1] + nt.find(([id]) => id === row[1])![1]);
  for (let j = 0; j < L; j++) {
    const a = mins[j], b = mins[(j + 1) % L];
    assert(Math.abs(b - a) / a <= 0.10, `step ${j}: ${a} -> ${b} (${plan.cycle.map((r) => r.join('+')).join(' | ')})`);
    assert(plan.cycle[j][0] !== plan.cycle[(j + 1) % L][0] && plan.cycle[j][1] !== plan.cycle[(j + 1) % L][1]);
  }
  for (const [id] of mlss) assert(plan.cycle.some((r) => r[0] === id), id);
  for (const [id] of nt) assert(plan.cycle.some((r) => r[1] === id), id);
  // Deterministic, and week N reads row (N - 1) mod L.
  assertEquals(holdRotation([slot('1:0', 'run_mlss', mlss), slot('3:0', 'run_near_threshold', nt)], { minutes: 0, sub: 100, near: 0, over: 0 }), plan);
  assertEquals(heldRowFor(plan, 1), { '1:0': plan.cycle[0][0], '3:0': plan.cycle[0][1] });
  assertEquals(heldRowFor(plan, L + 1), heldRowFor(plan, 1));
});

Deno.test('⛔ a slot with shapes that cannot hold still rotates every shape — the fewest breaks, never a dropped shape', () => {
  // cycling_long's sweet spot alone: 59 / 57 / 83 min. Tempo cannot sit beside either without breaking 10%.
  const plan = holdRotation([{
    key: '1:0', family: 'ride_sweet_spot', candidates: [
      { id: 'medium', minutes: 59, sub: 0, near: 0, over: 0 },
      { id: 'long', minutes: 57, sub: 0, near: 0, over: 0 },
      { id: 'tempo', minutes: 83, sub: 0, near: 0, over: 0 },
    ],
  }], { minutes: 65, sub: 500, near: 0, over: 0 });
  const ids = plan.cycle.map((r) => r[0]);
  for (const id of ['medium', 'long', 'tempo']) assert(ids.includes(id), id);
  assertEquals(ids.filter((x) => x === 'tempo').length, 1, ids.join(','));
  assertEquals(plan.breaks, 2, 'Tempo breaks the line on the way in and on the way out, once a cycle');
});
