import { Day, PoolId, SimpleSchedulerParams, Slot, PlaceResult } from './types';

const ORDER: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MAX_HARD_PER_WEEK = 3;

const idx = (d: Day) => ORDER.indexOf(d);
const next = (d: Day) => ORDER[(idx(d)+1)%7] as Day;
const prev = (d: Day) => ORDER[(idx(d)+6)%7] as Day;
const neighbors = (d: Day) => [prev(d), next(d)];
const includesDay = (arr: Day[], d: Day) => arr.indexOf(d) !== -1;

const isHardPool = (p: PoolId) =>
  p === 'run_speed_vo2_pool' || p === 'run_threshold_pool' || p === 'run_long_pool' || p.startsWith('strength_');

const strengthPoolFor = (t: 'power'|'endurance'|'hybrid'): PoolId =>
  t === 'power' ? 'strength_power_pool' : t === 'endurance' ? 'strength_endurance_pool' : 'strength_hybrid_pool';

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function nearestNonAdjacent(target: Day, avail: Day[], blocked: Day[]): Day | null {
  const bad = new Set<Day>(blocked.flatMap(neighbors).concat(blocked));
  if (includesDay(avail, target) && !bad.has(target)) return target;
  // forward scan then wrap
  let i = (idx(target)+1)%7;
  for (let k=0; k<6; k++, i=(i+1)%7) {
    const cand = ORDER[i] as Day;
    if (includesDay(avail, cand) && !bad.has(cand)) return cand;
  }
  // backward scan
  i = (idx(target)+6)%7;
  for (let k=0; k<6; k++, i=(i+6)%7) {
    const cand = ORDER[i] as Day;
    if (includesDay(avail, cand) && !bad.has(cand)) return cand;
  }
  return null;
}

function firstWithBuffers(avail: Day[], blocked: Day[]): Day | null {
  const bad = new Set<Day>(blocked.flatMap(neighbors).concat(blocked));
  for (const d of ORDER) { if (includesDay(avail, d) && !bad.has(d)) return d; }
  return null;
}

function add(slots: Slot[], poolId: PoolId, day: Day, optional=false) { slots.push({ day, poolId, optional }); }

function countHardDays(slots: Slot[]): number {
  const hardDays = new Set(slots.filter(s => isHardPool(s.poolId)).map(s => s.day));
  return hardDays.size;
}

function hasAdjacentHard(slots: Slot[]): [boolean, Day?] {
  const hard = new Set(slots.filter(s => isHardPool(s.poolId)).map(s => s.day));
  for (const d of ORDER) if (hard.has(d) && hard.has(next(d))) return [true, d];
  return [false, undefined];
}

function moveEasyOff(slots: Slot[], day: Day, avail: Day[]): boolean {
  const easyIdx = slots.findIndex(s => s.day===day && s.poolId==='run_easy_pool');
  if (easyIdx === -1) return false;
  for (const d of ORDER) {
    if (!includesDay(avail, d)) continue;
    if (!slots.some(s => s.day===d)) { slots[easyIdx].day = d; return true; }
  }
  return false;
}

function moveStrength(slots: Slot[], day: Day, avail: Day[], blocked: Day[]): boolean {
  const i = slots.findIndex(s => s.day===day && s.poolId.startsWith('strength_'));
  if (i === -1) return false;
  const bad = new Set<Day>(blocked.flatMap(neighbors).concat(blocked));
  for (const d of ORDER) {
    if (!includesDay(avail, d)) continue;
    if (bad.has(d)) continue;
    if (!slots.some(s => s.day===d && isHardPool(s.poolId))) { slots[i].day = d; return true; }
  }
  return false;
}

function stackStrengthWithNote(slots: Slot[], hardDay: Day, notes: string[]) {
  const strIdx = slots.findIndex(s => s.poolId.startsWith('strength_') && s.day!==hardDay);
  if (strIdx !== -1) slots[strIdx].day = hardDay;
  notes.push(`Stacked day on ${hardDay} — Notes: If running is the goal, do run first and strength second. If strength is the goal, do strength first; expect the run to feel sluggish.`);
}

export function placeWeek(params: SimpleSchedulerParams): PlaceResult {
  const notes: string[] = [];
  const { availableDays, longRunDay, level, strengthTrack, strengthDays,
          preferredStrengthDays = [], includeMobility, mobilityDays = 0, preferredMobilityDays = [] } = params;

  const slots: Slot[] = [];
  const isAvail = (d: Day) => includesDay(availableDays, d);

  // Long run
  add(slots, 'run_long_pool', longRunDay);

  // Quality runs
  const wantQual = (level === 'new') ? 1 : 2;
  const qualDays: Day[] = [];
  const qualTargets: Day[] = ['Tue','Thu'];
  for (const target of qualTargets) {
    if (qualDays.length >= wantQual) break;
    const cand = nearestNonAdjacent(target, availableDays, [longRunDay, ...qualDays]);
    if (cand) { add(slots, qualDays.length===0 ? 'run_speed_vo2_pool' : 'run_threshold_pool', cand); qualDays.push(cand); }
  }
  while (qualDays.length < wantQual) {
    const cand = firstWithBuffers(availableDays, [longRunDay, ...qualDays]);
    if (!cand) break; add(slots, qualDays.length===0 ? 'run_speed_vo2_pool' : 'run_threshold_pool', cand); qualDays.push(cand);
  }

  // Strength
  const blockedForStrength = uniq<Day>([ longRunDay, ...neighbors(longRunDay), ...qualDays, ...qualDays.flatMap(neighbors) ]);
  const strengthPool = strengthPoolFor(strengthTrack);
  const chosen: Day[] = [];
  for (const d of preferredStrengthDays) {
    if (chosen.length >= strengthDays) break;
    if (isAvail(d) && !blockedForStrength.includes(d)) chosen.push(d);
  }
  if (chosen.length < strengthDays) {
    for (const d of ORDER) {
      if (chosen.length >= strengthDays) break;
      if (isAvail(d) && !blockedForStrength.includes(d) && !chosen.includes(d)) chosen.push(d);
    }
  }
  if (chosen.length < strengthDays) {
    for (const d of ORDER) { if (chosen.length >= strengthDays) break; if (isAvail(d) && !chosen.includes(d)) chosen.push(d); }
  }
  chosen.slice(0, strengthDays).forEach(d => add(slots, strengthPool, d));

  // If we still owe strength sessions, stack on quality days (preferred) to honor counts
  let placedStrength = slots.filter(s => s.poolId.startsWith('strength_')).length;
  if (placedStrength < strengthDays) {
    for (const qd of qualDays) {
      if (placedStrength >= strengthDays) break;
      add(slots, strengthPool, qd);
      placedStrength++;
    }
  }
  // As a final fallback (rare), place on any available day to reach the target
  if (placedStrength < strengthDays) {
    for (const d of ORDER) {
      if (placedStrength >= strengthDays) break;
      if (!isAvail(d)) continue;
      add(slots, strengthPool, d);
      placedStrength++;
    }
  }

  // Easy runs fill on remaining available days
  for (const d of ORDER) {
    if (!isAvail(d)) continue;
    if (!slots.some(s => s.day===d)) add(slots, 'run_easy_pool', d, true);
  }

  // Mobility optional
  if (includeMobility && mobilityDays > 0) {
    const picked: Day[] = [];
    const pref = preferredMobilityDays.filter(isAvail);
    for (const d of pref) { if (picked.length >= mobilityDays) break; add(slots, 'mobility_pool', d, true); picked.push(d); }
    for (const d of ORDER) { if (picked.length >= mobilityDays) break; if (isAvail(d) && !picked.includes(d)) { add(slots, 'mobility_pool', d, true); picked.push(d); } }
  }

  // Gating: cap hard days
  while (countHardDays(slots) > MAX_HARD_PER_WEEK) {
    const i = slots.findIndex(s => s.poolId.startsWith('strength_'));
    if (i !== -1) { slots.splice(i,1); }
    else break;
  }

  // Gating: no adjacent hard — move easy, move strength, or stack with note
  let guard = 0;
  while (guard < 10) {
    const [adj, day] = hasAdjacentHard(slots);
    if (!adj || !day) break;
    const nextDay = next(day);
    if (moveEasyOff(slots, nextDay, availableDays)) { guard++; continue; }
    if (moveStrength(slots, nextDay, availableDays, [longRunDay, ...qualDays])) { guard++; continue; }
    stackStrengthWithNote(slots, day, notes); break;
  }

  return { slots, notes };
}


