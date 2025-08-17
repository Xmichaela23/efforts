import { Day, PoolId, SimpleSchedulerParams, Slot, PlaceResult } from './types';

const ORDER: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
// Global constants (cross-discipline)
const MAX_HARD_PER_WEEK = 3;
const MIN_REST_GAP_HOURS = 24;
const MAX_STACKED_DAYS = 2; // never create >2 stacked days/week

const idx = (d: Day) => ORDER.indexOf(d);
const next = (d: Day) => ORDER[(idx(d)+1)%7] as Day;
const prev = (d: Day) => ORDER[(idx(d)+6)%7] as Day;
const neighbors = (d: Day) => [prev(d), next(d)];
const includesDay = (arr: Day[], d: Day) => arr.indexOf(d) !== -1;

const isHardPool = (p: PoolId) =>
  // Run hard
  p === 'run_speed_vo2_pool' ||
  p === 'run_threshold_pool' ||
  p === 'run_long_pool' ||
  // Bike hard
  p === 'bike_vo2_pool' ||
  p === 'bike_threshold_pool' ||
  p === 'bike_long_pool' ||
  // Strength
  p.startsWith('strength_') ||
  // Bricks are always hard and count as one hard day
  p.startsWith('brick_');

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
  // Treat optional third (upper-only supplemental) strength as not hard
  const hardDays = new Set(slots
    .filter(s => isHardPool(s.poolId) && !(s.poolId.startsWith('strength_') && s.optional === true))
    .map(s => s.day));
  return hardDays.size;
}

function hasAdjacentHard(slots: Slot[]): [boolean, Day?] {
  const hard = new Set(slots
    .filter(s => isHardPool(s.poolId) && !(s.poolId.startsWith('strength_') && s.optional === true))
    .map(s => s.day));
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

function moveStrength(slots: Slot[], day: Day, avail: Day[], protectedDays: Day[]): boolean {
  const protectedRing = uniq<Day>(protectedDays.flatMap(d => [d, ...neighbors(d)]));
  const i = slots.findIndex(s => s.day===day && s.poolId.startsWith('strength_'));
  if (i === -1) return false;
  for (const d of ORDER) {
    if (!includesDay(avail, d)) continue;
    if (protectedRing.includes(d)) continue;
    const hardHere = slots.some(s => s.day===d && isHardPool(s.poolId));
    const hardPrev = slots.some(s => s.day===prev(d) && isHardPool(s.poolId));
    const hardNext = slots.some(s => s.day===next(d) && isHardPool(s.poolId));
    if (!hardHere && !hardPrev && !hardNext) { slots[i].day = d; return true; }
  }
  return false;
}

function stackStrengthWithNote(
  slots: Slot[],
  hardDay: Day,
  notes: string[],
  priority: 'endurance_first'|'balanced'|'strength_first' = 'endurance_first'
) {
  const strIdxNearby = slots.findIndex(s => s.poolId.startsWith('strength_') && s.day!==hardDay);
  if (strIdxNearby !== -1) {
    slots[strIdxNearby].day = hardDay;
  }
  let guidance = '';
  if (priority === 'strength_first') {
    guidance = 'Strength AM, Endurance PM.';
  } else if (priority === 'balanced') {
    guidance = 'Quality session AM, Strength PM; reverse is OK on easy endurance days.';
  } else {
    guidance = 'Run/Bike AM, Strength PM.';
  }
  notes.push(`Stacked day on ${hardDay} — ${guidance}`);
}

function markSupplementalThirdIfNeeded(
  slots: Slot[],
  strengthTrack: 'power'|'endurance'|'hybrid',
  strengthDaysRequested: 2|3,
  notes: string[]
) {
  if (strengthTrack !== 'endurance' || strengthDaysRequested !== 3) return;
  const strengthIdxs = slots
    .map((s, i) => ({ i, s }))
    .filter(x => x.s.poolId.startsWith('strength_'))
    .map(x => x.i);
  if (strengthIdxs.length < 3) return;
  const isStacked = (d: Day) => slots.some(s => isHardPool(s.poolId) && s.day === d && !s.poolId.startsWith('strength_'));
  // prefer standalone
  let supplementalIndex = strengthIdxs.find(i => !isStacked(slots[i].day));
  if (supplementalIndex === undefined) supplementalIndex = strengthIdxs[strengthIdxs.length - 1];
  slots[supplementalIndex].optional = true;
  const msg = 'Endurance track: the 3rd strength day is supplemental (upper/core emphasis) and will be dropped first if needed.';
  if (!notes.includes(msg)) notes.push(msg);
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
    if (!cand) break;
    add(slots, qualDays.length===0 ? 'run_speed_vo2_pool' : 'run_threshold_pool', cand);
    qualDays.push(cand);
  }

  // --- Strength placement (budget-aware, deterministic) ---
  const strengthPool = strengthPoolFor(strengthTrack);
  const protectedDays = uniq<Day>([longRunDay, ...qualDays]);
  const protectedRing = uniq<Day>(protectedDays.flatMap(d => [d, ...neighbors(d)]));

  // anchors = distinct hard-day anchors already placed
  const anchorHard = uniq<Day>([longRunDay, ...qualDays]);
  let budget = MAX_HARD_PER_WEEK - anchorHard.length;  // how many standalone hard days we can add

  // helper: find safe standalone strength days
  const safeStandalone: Day[] = [];
  for (const d of [...preferredStrengthDays, ...ORDER]) {
    if (safeStandalone.includes(d)) continue;
    if (!includesDay(availableDays, d)) continue;
    if (protectedRing.includes(d)) continue;
    if (d === longRunDay) continue;
    const hardHere = slots.some(s => s.day===d && isHardPool(s.poolId));
    const hardPrev = slots.some(s => s.day===prev(d) && isHardPool(s.poolId));
    const hardNext = slots.some(s => s.day===next(d) && isHardPool(s.poolId));
    if (!hardHere && !hardPrev && !hardNext) safeStandalone.push(d);
  }

  const chosen: Day[] = [];
  const stackTargets: Day[] = [...qualDays]; // never include long run here

  let addedBudgetReductionNote = false;
  if (budget <= 0) {
    // Case A: no budget → only stack on quality
    for (const d of stackTargets) {
      if (chosen.length >= strengthDays) break;
      if (!includesDay(availableDays, d)) continue;
      if (!chosen.includes(d)) chosen.push(d);
      if (uniq(chosen.filter(x => stackTargets.includes(x))).length >= MAX_STACKED_DAYS) break;
    }
    if (chosen.length < strengthDays) {
      // Reduce to 2× with a single consolidated note; do not place on long day in no-budget cases
      const msg = 'Reduced strength to 2× due to weekly hard-day cap and spacing limits.';
      if (!notes.includes(msg)) notes.push(msg);
      addedBudgetReductionNote = true;
    }
  } else {
    // Case B: positive budget → place up to budget standalone first (safe), then stack remainder on quality
    for (const d of safeStandalone) {
      if (chosen.length >= strengthDays) break;
      if (budget <= 0) break;
      chosen.push(d);
      budget--;
    }
    for (const d of stackTargets) {
      if (chosen.length >= strengthDays) break;
      if (!includesDay(availableDays, d)) continue;
      const stackedCount = uniq(chosen.filter(x => stackTargets.includes(x))).length;
      if (stackedCount >= MAX_STACKED_DAYS) break;
      if (!chosen.includes(d)) chosen.push(d);
    }
    // if still short: do not use long day; allow reduction to be handled below
  }

  const finalStrengthDays = Math.min(strengthDays, chosen.length);
  if (finalStrengthDays < strengthDays && !addedBudgetReductionNote) {
    notes.push(`Reduced strength to ${finalStrengthDays}× due to weekly hard-day cap and spacing limits.`);
  }
  chosen.slice(0, finalStrengthDays).forEach(d => add(slots, strengthPool, d));

  // Mark supplemental third on endurance track
  markSupplementalThirdIfNeeded(slots, strengthTrack, strengthDays, notes);

  // Easy runs: cap by experience-based base volume
  let baseTotal: number = 4;
  if (level === 'experienced') baseTotal = 5;
  if (level === 'veryExperienced') baseTotal = 6;
  const targetEasy = Math.max(0, baseTotal - (1 + wantQual));
  let easyPlaced = 0;
  for (const d of ORDER) {
    if (easyPlaced >= targetEasy) break;
    if (!isAvail(d)) continue;
    if (!slots.some(s => s.day===d)) { add(slots, 'run_easy_pool', d, true); easyPlaced++; }
  }

  // Mobility optional
  if (includeMobility && mobilityDays > 0) {
    const picked: Day[] = [];
    const pref = preferredMobilityDays.filter(isAvail);
    for (const d of pref) { if (picked.length >= mobilityDays) break; add(slots, 'mobility_pool', d, true); picked.push(d); }
    for (const d of ORDER) { if (picked.length >= mobilityDays) break; if (isAvail(d) && !picked.includes(d)) { add(slots, 'mobility_pool', d, true); picked.push(d); } }
  }

  // Gating: cap hard days (preserve stacked when possible; optional first; de-dupe notes)
  function isStackedOnQuality(s: Slot): boolean {
    return s.poolId.startsWith('strength_') && qualDays.includes(s.day as Day);
  }

  while (countHardDays(slots) > MAX_HARD_PER_WEEK) {
    // 1) optional first
    let idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && s.optional === true);
    // 2) standalone non-preferred
    if (idxToDrop === -1) idxToDrop = slots.findIndex(s =>
      s.poolId.startsWith('strength_') &&
      !preferredStrengthDays.includes(s.day as Day) &&
      !isStackedOnQuality(s) &&
      s.day !== longRunDay
    );
    // 3) standalone preferred
    if (idxToDrop === -1) idxToDrop = slots.findIndex(s =>
      s.poolId.startsWith('strength_') &&
      !isStackedOnQuality(s) &&
      s.day !== longRunDay
    );
    // 4) stacked last
    if (idxToDrop === -1) idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && isStackedOnQuality(s));

    if (idxToDrop !== -1) {
      slots.splice(idxToDrop, 1);
      const msg = 'Reduced hard-day count by removing strength due to weekly cap.';
      if (!notes.includes(msg)) notes.push(msg);
    } else break;
  }
  // de-dupe any repeated reduction messages
  if (notes.filter(n => n.startsWith('Reduced hard-day count')).length > 1) {
    const kept = notes.filter(n => !n.startsWith('Reduced hard-day count'));
    kept.push('Reduced hard-day count by removing strength due to weekly cap.');
    notes.length = 0; notes.push(...kept);
  }

  // Gating: no adjacent hard — move easy, move strength, or stack with note
  let guard = 0;
  const protectedForMove = [longRunDay, ...qualDays];
  while (guard < 10) {
    const [adj, day] = hasAdjacentHard(slots);
    if (!adj || !day) break;
    const nextDay = next(day);
    if (moveEasyOff(slots, nextDay, availableDays)) { guard++; continue; }
    if (moveStrength(slots, nextDay, availableDays, protectedForMove)) { guard++; continue; }
    // enforce stacked-day limit and never stack onto long day
    const pair: Day[] = [day, nextDay];
    const involvesLong = pair.includes(longRunDay);
    const stackedSoFar = new Set(slots
      .filter(s => s.poolId.startsWith('strength_') && qualDays.includes(s.day as Day))
      .map(s => s.day)).size;
    if (involvesLong) {
      const other = pair.find(d => d !== longRunDay)!;
      if (qualDays.includes(other) && stackedSoFar < MAX_STACKED_DAYS) {
        stackStrengthWithNote(slots, other, notes, params.priority ?? 'endurance_first');
        break;
      } else {
        // Drop one strength using removal order and add exact note
        let idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && s.optional === true);
        if (idxToDrop === -1) idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && !preferredStrengthDays.includes(s.day as Day) && !qualDays.includes(s.day as Day) && s.day !== longRunDay);
        if (idxToDrop === -1) idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && !qualDays.includes(s.day as Day) && s.day !== longRunDay);
        if (idxToDrop === -1) idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && qualDays.includes(s.day as Day));
        if (idxToDrop !== -1) {
          slots.splice(idxToDrop, 1);
          const msg = 'Reduced strength to maintain spacing and weekly hard-day cap.';
          if (!notes.includes(msg)) notes.push(msg);
        }
        break;
      }
    } else {
      if (stackedSoFar < MAX_STACKED_DAYS) {
        // stack onto the first day of the pair (a quality day)
        stackStrengthWithNote(slots, day, notes, params.priority ?? 'endurance_first');
      }
      break;
    }
  }

  // Final assert: ensure we do not exceed cap (safety pass)
  let guardCap = 0;
  while (countHardDays(slots) > MAX_HARD_PER_WEEK && guardCap < 5) {
    // reuse the same order as above
    let idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && s.optional === true);
    if (idxToDrop === -1) idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && !preferredStrengthDays.includes(s.day as Day) && !qualDays.includes(s.day as Day) && s.day !== longRunDay);
    if (idxToDrop === -1) idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && !qualDays.includes(s.day as Day) && s.day !== longRunDay);
    if (idxToDrop === -1) idxToDrop = slots.findIndex(s => s.poolId.startsWith('strength_') && qualDays.includes(s.day as Day));
    if (idxToDrop !== -1) {
      slots.splice(idxToDrop, 1);
    } else break;
    guardCap++;
  }

  // Invariant: do not schedule strength on long-run day when week is fully available
  if (availableDays.length >= 7) {
    const strengthOnLong = slots.some(s => s.poolId.startsWith('strength_') && s.day === longRunDay);
    if (strengthOnLong) {
      throw new Error('Invariant violated: strength on long-run day with ample availability.');
    }
  }

  return { slots, notes };
}



