/**
 * ═══ THE ZONE TABLES A SCREEN PRINTS — ONE COPY EACH, ON THE SERVER (2026-09-10, audit H-B05, H-B06) ═══
 *
 * ⛔ ONE TABLE PER METRIC, AND THE RIDE IS COUNTED BY IT (2026-09-26, Michael). Profile / Baselines print a
 * table from this file, and `compute-workout-analysis` counts a session's time in zone on the SAME table with
 * the SAME rule (`timeInZones`: a reading belongs to the first zone whose top it does not pass). The ride card's
 * names and ranges are written by `workout-detail` from here too. Nothing else draws a zone edge.
 *
 * ⛔ POWER: COGGAN'S SEVEN TRAINING LEVELS. Allen & Coggan, *Training and Racing with a Power Meter*
 * (the levels TrainingPeaks publishes as "Power Training Levels"): L1 up to 55% of FTP, L2 56–75,
 * L3 76–90, L4 91–105, L5 106–120, L6 121–150, L7 above 150.
 *
 * ⛔ THE 1% GAP IS CLOSED ONE WAY, EVERYWHERE (2026-09-26). The printed table goes 55 → 56, 75 → 76 …: each
 * level's top percentage is IN the level and the next level starts just above it. The ride used to open L2
 * at 55% of FTP (92 W at FTP 168) and Profile at 56% (94 W), so one ride printed "92-126W" beside Profile's
 * "94-126W". Now both read the printed tops as included and start the next level at the next whole watt —
 * TrainingPeaks' own rule for its zone tables: "Do not overlap zones --> start at the next whole number"
 * (help.trainingpeaks.com, "How to Create Custom Zones as an Athlete"), with a zone's top included
 * ("68-73% (include 73%)", "73-80% (73.5-80)", "Zones Calculator Overview"). A level's last whole watt is the
 * last one at or under its top percentage, so every whole watt reads in the level its own share of FTP falls
 * in. At FTP 168: 0-92, 93-126, 127-151, 152-176, 177-201, 202-252, > 252 W.
 *
 * ⚠️ WHY COGGAN'S TABLE AND NOT ONE OF THE OTHER TWO (2026-09-10). There were three: Profile's, the ride
 * analysis's, and a six-level table in `analyze-cycling-workout` that no code called. Coggan's is the field
 * standard.
 *
 * ⛔ HEART RATE: FRIEL'S ZONES FROM THE THRESHOLD ON BASELINES (2026-09-26, Michael). See the HEART RATE
 * section below — the one chain (threshold → max heart rate → age estimate), the tables, and the names.
 *
 * ⛔ SWIM: THE FIVE PACE BANDS, MOVED FROM `src/lib/swimPaceZones.ts` UNCHANGED. ⚠️ SOURCE STATUS: the
 * offsets (+12, +8, +3 and −2 seconds per 100 from threshold 100 pace) are OURS. Their only citation was
 * `docs/SWIM-PROTOCOL.md` §7.3, which cites no outside source and does not match them exactly (it gives
 * Recovery as +15 or slower and Endurance as +8 to +15). Moved as the screen printed them; not re-decided.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "endurance/display-zones" supabase/functions
 */
import { resolveCurrentLthr } from '../../../../src/lib/resolve-current-lthr.ts';
import { ageFromBirthday, resolveCurrentMaxHr } from '../../../../src/lib/resolve-current-max-hr.ts';
import { EASY_CEILING_PCT_LTHR, Z2_FLOOR_PCT_LTHR, Z4_FLOOR_PCT_LTHR, Z5_FLOOR_PCT_LTHR, zone3FloorBpm } from '../../../../src/lib/friel-zones.ts';

// ── counting ────────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THE ONE COUNTING RULE: seconds per zone, for a zone table given as the top of each zone but the last
 * (which is open above). A reading belongs to the first zone whose top it does not pass — a top is IN its
 * zone, as the printed tables say. Each reading takes the seconds since the one before it; a missing or
 * negative reading counts nowhere. null under ten readings (the gate the analysis always had).
 */
export function timeInZones(values: ReadonlyArray<number | null | undefined>, times: ReadonlyArray<number>, tops: ReadonlyArray<number>): number[] | null {
  let readings = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) readings++;
  // OURS — `timeInZones` under 10 readings is no distribution: the analysis's existing gate, kept as found
  if (readings < 10) return null;
  const secs = new Array(tops.length + 1).fill(0);
  for (let i = 1; i < times.length && i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    const dt = Math.max(0, times[i] - times[i - 1]);
    let z = 0;
    while (z < tops.length && v > tops[z]) z++;
    secs[z] += dt;
  }
  return secs;
}

// ── power ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The top of L1–L6 in percent of FTP, each IN its level; L7 is open above the last. Whole percents, divided
 * once: `0.55 * 120` is 66.00000000000001 in floating point, and a top a hair off its watt moves that watt.
 */
// FIELD — Coggan power training levels, tops 55 / 75 / 90 / 105 / 120 / 150% FTP (see header)
export const POWER_LEVEL_TOP_PCT_OF_FTP = [55, 75, 90, 105, 120, 150] as const;

/** The counting edges in watts: the top of L1–L6, each included in its level. */
export function powerZoneTopsW(ftp: number): number[] {
  return POWER_LEVEL_TOP_PCT_OF_FTP.map((p) => (ftp * p) / 100);
}

export type PowerZoneRow = {
  name: string;
  /** The level's first whole watt (L1: 0). */
  low_w: number | null;
  /** The level's last whole watt; null for L7's open top. */
  high_w: number | null;
  /** The text Profile and the ride card print, e.g. `93-126W`, `> 252W`. */
  range: string;
};

/** The seven level names, L1–L7, as Profile and the ride's zone card print them. */
// FIELD — Coggan power training levels L1–L7 (see header)
export const POWER_ZONE_NAMES = [
  'Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO2max', 'Z6 Anaerobic', 'Z7 Neuromuscular',
] as const;

/** A level's whole watts as printed: `0-92W`, `93-126W`, and the open top `> 252W` (from 253 W). */
function powerLevelRangeText(lowW: number, highW: number | null): string {
  return highW == null ? `> ${lowW - 1}W` : `${lowW}-${highW}W`;
}

/**
 * ⛔ THE ONE POWER TABLE — the seven rows Profile prints, and the watts a ride's bins carry, for an FTP in
 * watts. L1 starts at 0; each level's last watt is the last whole watt at or under its top; the next level
 * starts one watt above (see header). [] without a positive FTP.
 */
export function powerZoneRows(ftp: number): PowerZoneRow[] {
  if (!Number.isFinite(ftp) || ftp <= 0) return [];
  const lastWatt = powerZoneTopsW(ftp).map((t) => Math.floor(t));
  return POWER_ZONE_NAMES.map((name, i) => {
    const low_w = i === 0 ? 0 : lastWatt[i - 1] + 1;
    const high_w = i < lastWatt.length ? lastWatt[i] : null;
    return { name, low_w, high_w, range: powerLevelRangeText(low_w, high_w) };
  });
}

export type PowerZoneBinText = { name: string; range: string };

/**
 * ⛔ THE NAME AND RANGE ON EACH OF A RIDE'S POWER BINS — what the ride's power card prints, written beside each
 * bin by `workout-detail` (`display_metrics.zones.power.bins[]`).
 *
 * A ride counted since 2026-09-26 stores the FTP it was counted at (`ftp_w`): its words are `powerZoneRows` at
 * that FTP — Profile's rows to the watt when the FTP has not moved since.
 *
 * ⚠️ A RIDE COUNTED BEFORE THAT carries no FTP and was counted with each level opening AT the level below's top
 * (55 / 75 / 90 / 105 / 120%). It prints its own watts until it is analysed again: L1 `< {max}W`, L7
 * `> {min}W`, the rest `{min}-{max}W` — so its L2 reads "92-126W" at FTP 168 where Profile reads "93-126W".
 *
 * [] unless the bins are the seven levels (schema `ftp-based`, seven bins, every inner edge present). Rows
 * analysed before 2025-10-08 hold six equal slices of the ride's own range (`auto-range`), which are no levels.
 */
export function powerZoneBinText(power: { schema?: unknown; bins?: unknown; ftp_w?: unknown } | null | undefined): PowerZoneBinText[] {
  const bins = power?.bins;
  if (power?.schema !== 'ftp-based' || !Array.isArray(bins) || bins.length !== POWER_ZONE_NAMES.length) return [];
  const ftp = Number(power?.ftp_w);
  if (power?.ftp_w != null && Number.isFinite(ftp) && ftp > 0) {
    return powerZoneRows(ftp).map((r) => ({ name: r.name, range: r.range }));
  }
  const watts = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  const last = bins.length - 1;
  const edges = bins.map((b, i) => ({
    low: i === 0 ? null : watts((b as { min?: unknown })?.min),
    high: i === last ? null : watts((b as { max?: unknown })?.max),
  }));
  if (edges.some((e, i) => (i > 0 && e.low == null) || (i < last && e.high == null))) return [];
  return edges.map((e, i) => ({
    name: POWER_ZONE_NAMES[i],
    range: e.low == null ? `< ${e.high}W` : e.high == null ? `> ${e.low}W` : `${e.low}-${e.high}W`,
  }));
}

// ── heart rate ──────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ HEART-RATE ZONES — ONE CHAIN, ONE TABLE (2026-09-26, Michael). `heartRateZoneSet` is the only place a
 * heart-rate zone edge is decided. `compute-workout-analysis` counts every session's heart rate on it, and
 * `save-baselines/zones.ts` prints its rows as the Baselines zone table, so Baselines shows exactly the
 * zones a ride is counted in. The chain, per sport (a ride uses the bike's numbers, everything else the run's):
 *
 *   1. THE THRESHOLD ON BASELINES — `resolveCurrentLthr`, the same call the Baselines threshold row makes:
 *      the athlete's typed number or the one learned from their runs / rides → Friel's seven zones.
 *   2. NO THRESHOLD → % OF MAX HEART RATE (Garmin's split, below), max from `resolveCurrentMaxHr`: typed, else
 *      the peak observed in that sport's history.
 *   3. NO MAX EITHER → the resolver's age tier (Tanaka 208 − 0.7·age, Gulati for women, age from the
 *      birthday), flagged `estimate`, until a threshold or a real max is on file.
 *   4. No birthday either → null. Baselines prints its empty line; the analysis keeps its old per-session
 *      fallback (see `compute-workout-analysis`), which Baselines cannot show because it has no session.
 *
 * ⛔ NO IMPORTED TABLE IS READ. `configured_hr_zones.zones*` — Strava's table stored at connect (its
 * automatic zones are 220 − age), a watch file's, or the ones `save-baselines/derive.ts` writes — used to
 * outrank the threshold: one ride was counted on Strava's 110/137/150/164 while the app's learned ride
 * threshold was 153. Nor is `configured_hr_zones.max_heart_rate` (Strava's is the top of its own zone 4):
 * the max is the athlete's typed one or their measured peak (`maxHrBaselines`).
 */
export type HrZoneSport = 'run' | 'ride';

/** A ride's zones come from the bike's numbers; every other session's from the run's (as the analysis always did). */
export function hrZoneSport(type: unknown): HrZoneSport {
  return /ride|bike|cycl/i.test(String(type ?? '')) ? 'ride' : 'run';
}

/**
 * Where zones 2, 4, 5a, 5b and 5c open, as a fraction of LTHR, per sport. Friel prints whole percents, so each
 * zone opens at its first whole percent ("more than 106%" → 107%), rounded to the nearest beat — the rule
 * `frielRunZones` already applies to 85 / 95 / 100%. Zone 3 is not here: it opens one beat above Zone 2's top
 * (89%, the easy ceiling — D-286, `zone3FloorBpm`), for both sports.
 */
// FIELD — Friel, "A Quick Guide to Setting Zones" (trainingbible.com / TrainingPeaks, the "Joe Friel for Running /
// for Cycling (7)" calculators): run Z1 <85, Z2 85–89, Z3 90–94, Z4 95–99, Z5a 100–102, Z5b 103–106, Z5c >106 %
// LTHR; bike Z1 <81, Z2 81–89, Z3 90–93, Z4 94–99, Z5a–c as run.
const FRIEL_OPENS_PCT_LTHR: Record<HrZoneSport, { z2: number; z4: number; z5a: number; z5b: number; z5c: number }> = {
  run: { z2: Z2_FLOOR_PCT_LTHR, z4: Z4_FLOOR_PCT_LTHR, z5a: Z5_FLOOR_PCT_LTHR, z5b: 1.03, z5c: 1.07 },
  ride: { z2: 0.81, z4: 0.94, z5a: Z5_FLOOR_PCT_LTHR, z5b: 1.03, z5c: 1.07 },
};

/**
 * ⛔ THE SAME TABLE IN WHOLE PERCENTS OF LTHR, for a reader that places a percentage rather than a beat — the
 * heart-rate TSS estimate in `workload.ts` (2026-09-26: it typed Friel's percentages out a second time). Friel
 * prints whole percents: Zone 3 opens at the first one above the easy ceiling (89% → 90%, the percent form of "one
 * beat above Zone 2's top"), and Zone 5b ends on the whole percent before Zone 5c opens (106).
 */
export type FrielZoneOpensPct = { z2: number; z3: number; z4: number; z5a: number; z5b: number; z5c: number };
export function frielZoneOpensPct(sport: HrZoneSport): FrielZoneOpensPct {
  const o = FRIEL_OPENS_PCT_LTHR[sport];
  const pct = (f: number) => Math.round(f * 100);
  return { z2: pct(o.z2), z3: pct(EASY_CEILING_PCT_LTHR) + 1, z4: pct(o.z4), z5a: pct(o.z5a), z5b: pct(o.z5b), z5c: pct(o.z5c) };
}

/**
 * ⚠️ NUMBERS, NOT NAMES (2026-09-26). The names wanted were "Recovery … Anaerobic Capacity" as TrainingPeaks
 * prints them for Friel's method. Neither TrainingPeaks' article and help pages ("A Quick Guide to Setting
 * Zones", "Zones Calculator Overview") nor Friel's own page prints a name beside these seven zones — his site
 * now shows a newer table with other names and other percentages. So each zone is named as Friel numbers it.
 */
// FIELD — Friel's zone numbers, as printed in "A Quick Guide to Setting Zones"
export const FRIEL_HR_ZONE_NAMES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5a', 'Zone 5b', 'Zone 5c'] as const;

/** Where zones 2–5 open, as a fraction of max heart rate. Zone 1 also takes everything under 50%; Zone 5 is open above. */
// FIELD — Garmin's heart rate zones by % of max heart rate, 50–60 / 60–70 / 70–80 / 80–90 / 90–100 (Edge 1040
// owner's manual, "Heart Rate Zone Calculations"); the analysis's %-of-max split since before 2026-07.
const MAX_HR_OPENS = [0.60, 0.70, 0.80, 0.90] as const;
// FIELD — Garmin's zone numbers, as its manual prints them
export const MAX_HR_ZONE_NAMES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'] as const;

/** An anchor at or under this is a dropped strap or a typo, not a threshold or a max. */
// OURS — the plausibility floor the old zone writer (`hrZones`, deleted 2026-09-26) applied: > 100 bpm
const HR_ANCHOR_FLOOR_BPM = 100;

export type HrZoneRow = {
  name: string;
  /** The zone's first beat (Zone 1: 0). */
  min: number;
  /** The zone's last beat; null for the top zone, open above. */
  max: number | null;
  /** As Baselines and the session's card print it: `123 bpm and under`, `124–136 bpm`, `164 bpm and up`. */
  range: string;
};

export type HrZoneSchema = 'friel-run' | 'friel-ride' | 'max-hr' | 'max-hr-age' | 'max-hr-session';

export type HrZoneSet = {
  sport: HrZoneSport;
  /** Stored beside the bins, so the card's words can be written again from it. */
  schema: HrZoneSchema;
  /** The threshold (friel-*) or max heart rate (max-hr*) the zones are worked out from. */
  anchor_bpm: number;
  /** True when the anchor is an estimate — the age formula, or a session's own numbers. */
  estimate: boolean;
  rows: HrZoneRow[];
  /** The counting edges: each zone's last beat, the open top zone left out. */
  tops: number[];
};

function hrRangeText(min: number, max: number | null): string {
  if (max == null) return `${min} bpm and up`;
  if (min <= 0) return `${max} bpm and under`;
  return `${min}–${max} bpm`;
}

/** Rows from the beat each zone after the first opens on: each zone ends one beat under the next. */
function rowsFromOpens(names: ReadonlyArray<string>, opens: number[]): HrZoneRow[] {
  return names.map((name, i) => {
    const min = i === 0 ? 0 : opens[i - 1];
    const max = i < opens.length ? opens[i] - 1 : null;
    return { name, min, max, range: hrRangeText(min, max) };
  });
}

/** Friel's seven zones for a sport, from an LTHR in bpm. */
export function frielHrZoneRows(lthr: number, sport: HrZoneSport): HrZoneRow[] {
  const o = FRIEL_OPENS_PCT_LTHR[sport];
  return rowsFromOpens(FRIEL_HR_ZONE_NAMES, [
    Math.round(lthr * o.z2),
    zone3FloorBpm(lthr),
    Math.round(lthr * o.z4),
    Math.round(lthr * o.z5a),
    Math.round(lthr * o.z5b),
    Math.round(lthr * o.z5c),
  ]);
}

/** The five %-of-max zones, from a max heart rate in bpm. */
export function maxHrZoneRows(maxBpm: number): HrZoneRow[] {
  return rowsFromOpens(MAX_HR_ZONE_NAMES, MAX_HR_OPENS.map((f) => Math.round(maxBpm * f)));
}

/** A zone set from a known anchor. The analysis's per-session fallback and `hrZoneBinText` come in here too. */
export function hrZoneSetFromAnchor(schema: HrZoneSchema, anchorBpm: number, sport: HrZoneSport): HrZoneSet {
  const friel = schema === 'friel-run' || schema === 'friel-ride';
  const rows = friel ? frielHrZoneRows(anchorBpm, schema === 'friel-ride' ? 'ride' : 'run') : maxHrZoneRows(anchorBpm);
  return {
    sport,
    schema,
    anchor_bpm: anchorBpm,
    estimate: schema === 'max-hr-age' || schema === 'max-hr-session',
    rows,
    tops: rows.filter((r) => r.max != null).map((r) => r.max as number),
  };
}

/**
 * ⛔ A SESSION'S OWN LAST RESORT, ONE COPY (2026-09-26). No threshold, no max heart rate and no birthday on file —
 * Baselines prints no zones — so the session is counted on % of max from its own numbers: the watch file's max, else
 * this session's peak ÷ `PEAK_TO_MAX`, else 180. Stored as `max-hr-session`, flagged an estimate. The analysis's bins
 * (`compute-workout-analysis`) and the run debrief (`analyze-running-workout`) both take it from here; the debrief kept
 * its own 60/70/80/90% table and its own "peak under 150 → 180" rule until today.
 */
export function sessionHrZoneSet(sport: HrZoneSport, session: { deviceMaxHr?: number | null; peakBpm?: number | null }): HrZoneSet {
  const device = Number(session.deviceMaxHr);
  const sessionMax = resolveCurrentMaxHr({}, {
    sport,
    deviceMaxHr: Number.isFinite(device) && device > HR_ANCHOR_FLOOR_BPM ? device : null,
    observedSessionPeak: session.peakBpm ?? null,
    allowAgeEstimate: false,
  });
  // OURS — the historical 180 bpm floor when a session carries no max of its own (kept as found)
  return hrZoneSetFromAnchor('max-hr-session', sessionMax.bpm ?? 180, sport);
}

const parseJson = (v: unknown): Record<string, unknown> | null => {
  if (v == null) return null;
  if (typeof v !== 'string') return v as Record<string, unknown>;
  try { return JSON.parse(v); } catch { return null; }
};

/**
 * What the max heart rate is read from: the athlete's typed max per sport and the learned peaks. Not
 * `configured_hr_zones.max_heart_rate` (see the section header). The Baselines max row reads the same object.
 */
export function maxHrBaselines(learnedFitness: unknown, configuredHrZones: unknown) {
  const cfg = parseJson(configuredHrZones) ?? {};
  return {
    learned_fitness: parseJson(learnedFitness),
    athlete_config: { manual_run_max_hr: cfg.manual_run_max_hr ?? null, manual_ride_max_hr: cfg.manual_ride_max_hr ?? null },
  } as never;
}

/**
 * ⛔ THE ONE CHAIN (see the section header). `row` is the `user_baselines` row as stored — the analysis and the
 * Baselines readout both hand it over whole, so neither can feed the resolvers a different object. `today`
 * (YYYY-MM-DD) is the day the age is taken on.
 */
export function heartRateZoneSet(
  row: {
    performance_numbers?: unknown;
    learned_fitness?: unknown;
    configured_hr_zones?: unknown;
    birthday?: unknown;
    gender?: unknown;
  } | null | undefined,
  sport: HrZoneSport,
  opts: { today: string },
): HrZoneSet | null {
  if (!row) return null;
  const learned = parseJson(row.learned_fitness);
  const lthr = resolveCurrentLthr(
    { learned_fitness: learned, performance_numbers: parseJson(row.performance_numbers) ?? {}, configured_hr_zones: parseJson(row.configured_hr_zones) ?? {} } as never,
    { sport },
  ).bpm;
  if (lthr != null && lthr > HR_ANCHOR_FLOOR_BPM) return hrZoneSetFromAnchor(sport === 'ride' ? 'friel-ride' : 'friel-run', lthr, sport);

  const max = resolveCurrentMaxHr(maxHrBaselines(row.learned_fitness, row.configured_hr_zones), {
    sport,
    age: ageFromBirthday(typeof row.birthday === 'string' ? row.birthday : null, opts.today),
    sex: typeof row.gender === 'string' ? row.gender : null,
    allowAgeEstimate: true,
  });
  if (max.bpm != null && max.bpm > HR_ANCHOR_FLOOR_BPM) {
    return hrZoneSetFromAnchor(max.is_estimate ? 'max-hr-age' : 'max-hr', max.bpm, sport);
  }
  return null;
}

/**
 * ⛔ THE NAME AND RANGE ON EACH OF A SESSION'S HEART-RATE BINS — what the heart-rate card prints, written beside
 * each bin by `workout-detail`. The card named the zones itself ("Zone 1" …) and printed `{min}-{max} bpm`.
 *
 * A session counted since 2026-09-26 stores its zone set's `schema` and `anchor_bpm`: its words are that set's
 * rows, the rows Baselines prints when the anchor has not moved since.
 *
 * ⚠️ A SESSION COUNTED BEFORE THAT stores each bin from its first beat to the next bin's first beat. It prints
 * those beats, numbered by position, until it is analysed again.
 */
export function hrZoneBinText(hr: { schema?: unknown; anchor_bpm?: unknown; bins?: unknown } | null | undefined): Array<{ name: string; range: string }> {
  const bins = hr?.bins;
  if (!Array.isArray(bins) || bins.length === 0) return [];
  const schema = String(hr?.schema ?? '');
  const anchor = Number(hr?.anchor_bpm);
  const known: HrZoneSchema[] = ['friel-run', 'friel-ride', 'max-hr', 'max-hr-age', 'max-hr-session'];
  if ((known as string[]).includes(schema) && hr?.anchor_bpm != null && Number.isFinite(anchor) && anchor > 0) {
    const rows = hrZoneSetFromAnchor(schema as HrZoneSchema, anchor, schema === 'friel-ride' ? 'ride' : 'run').rows;
    if (rows.length === bins.length) return rows.map((r) => ({ name: r.name, range: r.range }));
  }
  const beat = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const last = bins.length - 1;
  return bins.map((b, i) => {
    const next = beat((b as { max?: unknown })?.max);
    const min = i === 0 ? 0 : beat((b as { min?: unknown })?.min);
    const max = i === last ? null : (next != null ? next - 1 : null);
    const ok = min != null && (i === last || max != null);
    return { name: `Zone ${i + 1}`, range: ok ? hrRangeText(min as number, max) : '' };
  });
}

// ── swim ────────────────────────────────────────────────────────────────────────────────────────

export type SwimPaceBandRow = {
  /** Plain effort word (D-199: no CSS, no Z-numbers on screen). */
  label: string;
  /** Pace per 100 of the pool's unit, e.g. `2:35–2:39`. */
  range: string;
  /** True for the Threshold band. */
  anchor: boolean;
};

/** `m:ss` → seconds, or null when absent, malformed or not positive. */
export function parsePaceClock(mmss: unknown): number | null {
  const m = String(mmss ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return sec > 0 ? sec : null;
}

const clock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The five bands, easy to hard, from the threshold 100 pace in seconds. [] for no pace. */
export function swimPaceBandRows(thresholdSecPer100: number): SwimPaceBandRow[] {
  const c = thresholdSecPer100;
  if (!Number.isFinite(c) || c <= 0) return [];
  return [
    // OURS — `swimPaceBandRows` +12 / +8 / +3 / −2 s per 100 offsets (ledger row: swim pace bands)
    { label: 'Recovery', range: `${clock(c + 12)} and slower`, anchor: false },
    { label: 'Easy', range: `${clock(c + 8)}–${clock(c + 12)}`, anchor: false },
    { label: 'Moderate', range: `${clock(c + 3)}–${clock(c + 8)}`, anchor: false },
    { label: 'Threshold', range: `${clock(c - 2)}–${clock(c + 3)}`, anchor: true },
    { label: 'Hard', range: `${clock(c - 2)} and faster`, anchor: false },
  ];
}
