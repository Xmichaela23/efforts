/**
 * course-strategy-build — the deterministic race pacing plan.
 *
 * Replaces the model that used to write `display_groups` JSON (deleted 2026-09-07, no-AI work order).
 * Everything here is arithmetic on the course geometry and the athlete's anchor finish time:
 *
 *   1. Group adjacent geometry segments of like terrain into 4–9 display groups (fewer for shorter races).
 *   2. Even EFFORT across the course: each group's pace is the flat-equivalent race pace scaled by the
 *      Minetti (2002) metabolic cost of its average grade (`_shared/gap.ts`, the same model the GAP
 *      readouts use), then the flat pace is solved so the distance-weighted paces sum to the anchor
 *      finish time. Bike legs use the linear grade cost that course-detail's terrain-adjusted finish
 *      already uses; swim legs are one even group.
 *   3. Pace band = ±2.5% around the group's pace. OURS — a band wide enough to read as a range on a
 *      watch, narrow enough that its mid-point still adds up to the finish time (docs/STATE-SOURCES.md).
 *   4. Heart-rate band by race distance from the athlete's configured zones (Friel: marathon Z3, half
 *      Z4, 10K Z4–5, 5K Z5); when no zones are configured, %maxHR ranges (OURS, ledger row).
 *   5. Effort zone and cue are fixed sentences keyed to terrain and position on the course. Fuel note
 *      keyed to the projected finish: 30–60 g carbohydrate/h for 1–2.5 h efforts, 60–90 g/h beyond
 *      (Jeukendrup 2014, Sports Med 44:S25; ACSM/AND/DC 2016 position stand), attached to the group that
 *      contains the 45-minute mark.
 */
import { metabolicCostPerMeter } from './gap.ts';
import type { GeometrySegment } from './course-segmentation.ts';
import type { DisplayGroup } from './course-strategy-helpers.ts';

const MI_M = 1609.344;
const FLAT_COST = metabolicCostPerMeter(0);

export type StrategyLeg = 'swim' | 'bike' | 'run' | 'full';

export type HrZoneBand = { min?: number | null; max?: number | null };

export type BuildCourseStrategyInput = {
  geometry: GeometrySegment[];
  /** Course distance in miles (row distance, else the goal's nominal distance). */
  distanceMi: number;
  /** Anchor finish time for THIS leg, in seconds (terrain-adjusted where the caller did that). */
  legTargetSec: number;
  leg: StrategyLeg;
  /** Athlete's configured HR zones, Z1..Zn ascending; empty when not configured. */
  hrZones: HrZoneBand[];
  maxHr: number | null;
};

/** OURS — pace band half-width as a fraction of the group's pace (docs/STATE-SOURCES.md). */
export const PACE_BAND_FRACTION = 0.025;
/** OURS — a display group longer than this is split so the course screen never shows one 11-mile row. */
const MAX_GROUP_MI = 6;
/** Fuel note lands on the group containing this many seconds into the race (first carbs at ~45 min). */
const FUEL_NOTE_AT_SEC = 45 * 60;

// ── 1. grouping ────────────────────────────────────────────────────────────────────────────────────

function targetGroupCount(distanceMi: number, leg: StrategyLeg): number {
  if (leg === 'swim') return 1;
  if (distanceMi >= 20) return 7;
  if (distanceMi >= 12) return 6;
  if (distanceMi >= 8) return 5;
  if (distanceMi >= 5) return 4;
  return 3;
}

function mergeable(a: GeometrySegment['terrain_type'], b: GeometrySegment['terrain_type']): boolean {
  if (a === b) return true;
  const flatish = (t: string) => t === 'flat' || t === 'rolling';
  return flatish(a) && flatish(b);
}

function segLen(g: GeometrySegment): number {
  return Math.max(0, g.end_distance_m - g.start_distance_m);
}

/** Adjacent like-terrain merge, then shortest-group merge down to the target count. */
export function groupGeometry(geometry: GeometrySegment[], target: number): GeometrySegment[][] {
  const sorted = [...geometry].sort((a, b) => a.segment_order - b.segment_order);
  if (sorted.length === 0) return [];
  const groups: GeometrySegment[][] = [];
  for (const g of sorted) {
    const last = groups[groups.length - 1];
    if (last && mergeable(last[last.length - 1].terrain_type, g.terrain_type)) last.push(g);
    else groups.push([g]);
  }
  const groupLen = (grp: GeometrySegment[]) => grp.reduce((a, g) => a + segLen(g), 0);
  while (groups.length > Math.max(1, target)) {
    let idx = 0;
    for (let i = 1; i < groups.length; i++) if (groupLen(groups[i]) < groupLen(groups[idx])) idx = i;
    const left = idx > 0 ? groupLen(groups[idx - 1]) : Infinity;
    const right = idx < groups.length - 1 ? groupLen(groups[idx + 1]) : Infinity;
    const into = left <= right ? idx - 1 : idx + 1;
    if (into < idx) groups[into] = [...groups[into], ...groups[idx]];
    else groups[into] = [...groups[idx], ...groups[into]];
    groups.splice(idx, 1);
  }
  // A like-terrain run longer than MAX_GROUP_MI reads as one wall of miles on the course screen; split
  // the longest such group at the segment boundary nearest its midpoint until the target count is met.
  while (groups.length < target) {
    let idx = -1;
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].length >= 2 && groupLen(groups[i]) > MAX_GROUP_MI * MI_M && (idx < 0 || groupLen(groups[i]) > groupLen(groups[idx]))) idx = i;
    }
    if (idx < 0) break;
    const grp = groups[idx];
    const half = groupLen(grp) / 2;
    let acc = 0;
    let cut = 1;
    let best = Infinity;
    for (let k = 0; k < grp.length - 1; k++) {
      acc += segLen(grp[k]);
      const d = Math.abs(acc - half);
      if (d < best) { best = d; cut = k + 1; }
    }
    groups.splice(idx, 1, grp.slice(0, cut), grp.slice(cut));
  }
  return groups;
}

// ── 2. pace ────────────────────────────────────────────────────────────────────────────────────────

/** Time-per-metre multiplier for a grade at even metabolic effort (Minetti 2002 via gap.ts). Run legs. */
export function runGradeTimeFactor(avgGradePct: number): number {
  if (!Number.isFinite(avgGradePct)) return 1;
  const cost = metabolicCostPerMeter(avgGradePct / 100);
  if (cost <= 0.5) return 1;
  return cost / FLAT_COST;
}

/**
 * Bike legs: the linear grade cost course-detail already applies to the terrain-adjusted finish
 * (+10 s/mi per % up, capped 60; −6 s/mi per % down, capped −20) expressed as a factor of flat pace.
 */
export function bikeGradeTimeFactor(avgGradePct: number, flatPaceSecPerMi: number): number {
  if (!Number.isFinite(avgGradePct) || flatPaceSecPerMi <= 0) return 1;
  const adj = avgGradePct > 0 ? Math.min(avgGradePct * 10, 60) : Math.max(avgGradePct * 6, -20);
  return Math.max(0.5, (flatPaceSecPerMi + adj) / flatPaceSecPerMi);
}

function groupGradePct(grp: GeometrySegment[]): number {
  const run = grp.reduce((a, g) => a + segLen(g), 0);
  const rise = grp.reduce((a, g) => a + g.elevation_change_m, 0);
  return run > 0 ? (rise / run) * 100 : 0;
}

// ── 4. heart rate ──────────────────────────────────────────────────────────────────────────────────

type HrBand = { low: number; high: number } | null;

/**
 * Race heart-rate band by distance. With configured zones (Z1..Zn ascending): marathon Z3, half Z4,
 * ≤10K the top zone available (Friel run zones by %LTHR). Without zones, %maxHR (OURS):
 * marathon 80–88, half 85–92, 10K 88–94, 5K 92–97.
 */
export function raceHrBand(distanceMi: number, zones: HrZoneBand[], maxHr: number | null): HrBand {
  const z = zones.filter((b) => b && (b.min != null || b.max != null));
  const pick = (i: number): HrBand => {
    const band = z[Math.min(i, z.length - 1)];
    if (!band) return null;
    const low = Number(band.min);
    const high = band.max == null ? (maxHr ?? Number(band.min) + 10) : Number(band.max);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low) return null;
    return { low: Math.round(low), high: Math.round(high) };
  };
  if (z.length >= 3) {
    if (distanceMi >= 20) return pick(2);
    if (distanceMi >= 12) return pick(3);
    return pick(z.length >= 5 ? 4 : z.length - 1);
  }
  if (maxHr != null && maxHr > 100) {
    const pct: [number, number] =
      distanceMi >= 20 ? [0.80, 0.88] : distanceMi >= 12 ? [0.85, 0.92] : distanceMi >= 5 ? [0.88, 0.94] : [0.92, 0.97];
    return { low: Math.round(maxHr * pct[0]), high: Math.round(maxHr * pct[1]) };
  }
  return null;
}

// ── 5. effort zone, label, cue ─────────────────────────────────────────────────────────────────────

type Terrain = GeometrySegment['terrain_type'];

function dominantTerrain(grp: GeometrySegment[]): Terrain {
  const by: Record<string, number> = {};
  for (const g of grp) by[g.terrain_type] = (by[g.terrain_type] || 0) + segLen(g);
  let best: Terrain = 'flat';
  let mx = -1;
  for (const [k, v] of Object.entries(by)) if (v > mx) { mx = v; best = k as Terrain; }
  return best;
}

function fmtMi(m: number): string {
  return String(Math.round((m / MI_M) * 10) / 10);
}

export function groupLabel(grp: GeometrySegment[], terrain: Terrain, isFirst: boolean, isLast: boolean): string {
  const a = fmtMi(grp[0].start_distance_m);
  const b = fmtMi(grp[grp.length - 1].end_distance_m);
  const word = isFirst ? 'start' : isLast ? 'finish' : terrain === 'descent' ? 'downhill' : terrain;
  return `Mi ${a}–${b} · ${word}`.slice(0, 40);
}

export type EffortZone = 'conservative' | 'cruise' | 'caution' | 'push';

export function effortZoneFor(args: {
  terrain: Terrain; gradePct: number; isFirst: boolean; isLast: boolean; lateRace: boolean; leg: StrategyLeg;
}): EffortZone {
  const { terrain, gradePct, isFirst, isLast, lateRace, leg } = args;
  if (leg === 'swim') return 'cruise';
  if (isFirst) return 'conservative';
  if (terrain === 'climb' || gradePct >= 2) return 'conservative';
  if (terrain === 'descent' && gradePct <= -4) return 'caution';
  if (isLast) return 'push';
  if (lateRace) return 'caution';
  return 'cruise';
}

/** Fixed sentences keyed to terrain and position; ≤ 80 chars, no imperatives (docs/COPY-VOICE.md). */
export function cueFor(args: {
  terrain: Terrain; gradePct: number; isFirst: boolean; isLast: boolean; lateRace: boolean; leg: StrategyLeg; fuelNote: string | null;
}): string {
  const { terrain, gradePct, isFirst, isLast, lateRace, leg, fuelNote } = args;
  let cue: string;
  if (leg === 'swim') cue = 'Even effort; sighting every few strokes holds the line.';
  else if (isFirst) cue = 'Pace above the band here returns as late-mile fade.';
  else if (terrain === 'climb' || gradePct >= 2) cue = leg === 'bike' ? 'Climb: speed drops, effort holds at the band.' : 'Climb: pace slows, heart rate tops the band.';
  else if (terrain === 'descent' && gradePct <= -4) cue = leg === 'bike' ? 'Steep descent: free speed, braking is the only cost.' : 'Steep descent: free speed, braking loads the quads.';
  else if (terrain === 'descent') cue = 'Gentle descent: quicker pace at the same effort.';
  else if (isLast) cue = 'Final stretch: extra effort costs nothing later.';
  else if (lateRace) cue = 'Late miles: tired legs, pace holds at the same effort.';
  else cue = 'Steady stretch: even effort, pace inside the band.';
  if (fuelNote && cue.length + 1 + fuelNote.length <= 80) cue = `${cue} ${fuelNote}`;
  return cue.slice(0, 80);
}

/** 30–60 g/h for 1–2.5 h, 60–90 g/h beyond 2.5 h (Jeukendrup 2014; ACSM 2016). Null under an hour. */
export function fuelNoteFor(legTargetSec: number): string | null {
  if (legTargetSec < 3600) return null;
  return legTargetSec > 2.5 * 3600 ? 'Carbs 60–90 g/h.' : 'Carbs 30–60 g/h.';
}

// ── assembly ───────────────────────────────────────────────────────────────────────────────────────

export function buildCourseStrategyGroups(input: BuildCourseStrategyInput): DisplayGroup[] {
  const { geometry, distanceMi, legTargetSec, leg, hrZones, maxHr } = input;
  const groups = groupGeometry(geometry, targetGroupCount(distanceMi, leg));
  if (groups.length === 0) return [];

  const totalM = groups.reduce((a, grp) => a + grp.reduce((b, g) => b + segLen(g), 0), 0);
  const flatGuessSecPerMi = distanceMi > 0.1 ? legTargetSec / distanceMi : 600;
  const grades = groups.map(groupGradePct);
  const factors = grades.map((g) =>
    leg === 'swim' ? 1 : leg === 'bike' ? bikeGradeTimeFactor(g, flatGuessSecPerMi) : runGradeTimeFactor(g),
  );
  // Solve the flat pace so Σ(factor_i × pace_flat × miles_i) = legTargetSec.
  const weighted = groups.reduce((a, grp, i) => a + factors[i] * (grp.reduce((b, g) => b + segLen(g), 0) / MI_M), 0);
  const flatSecPerMi = weighted > 0 ? legTargetSec / weighted : flatGuessSecPerMi;

  const hr = raceHrBand(distanceMi, hrZones, maxHr);
  const fuel = fuelNoteFor(legTargetSec);
  let fuelPlaced = fuel == null;
  let elapsedSec = 0;

  return groups.map((grp, i) => {
    const isFirst = i === 0;
    const isLast = i === groups.length - 1;
    const startM = grp[0].start_distance_m;
    const lateRace = totalM > 0 && startM / totalM >= 0.7;
    const terrain = dominantTerrain(grp);
    const gradePct = grades[i];
    const pace = flatSecPerMi * factors[i];
    const half = pace * PACE_BAND_FRACTION;
    const miles = grp.reduce((b, g) => b + segLen(g), 0) / MI_M;
    const groupStartSec = elapsedSec;
    elapsedSec += pace * miles;
    let fuelNote: string | null = null;
    if (!fuelPlaced && !isFirst && elapsedSec >= FUEL_NOTE_AT_SEC && groupStartSec < elapsedSec) {
      fuelNote = fuel;
      fuelPlaced = true;
    }
    return {
      display_group_id: i + 1,
      segment_orders: grp.map((g) => g.segment_order),
      display_label: groupLabel(grp, terrain, isFirst, isLast),
      effort_zone: effortZoneFor({ terrain, gradePct, isFirst, isLast, lateRace, leg }),
      target_pace_slow_sec_per_mi: Math.round(pace + half),
      target_pace_fast_sec_per_mi: Math.round(pace - half),
      target_hr_low: hr ? hr.low : null,
      target_hr_high: hr ? hr.high : null,
      coaching_cue: cueFor({ terrain, gradePct, isFirst, isLast, lateRace, leg, fuelNote }),
    };
  });
}
