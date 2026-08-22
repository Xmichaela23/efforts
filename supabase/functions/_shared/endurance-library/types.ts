// ============================================================================
// THE ENDURANCE SESSION LIBRARY — THE MODEL
//
// The mirror of `shared/strength-system/loading/wendler-531.ts`: pure, no weeks, no days, no plan
// shape. Session type + level + the athlete's own thresholds in, a session out.
//
// ⛔ CLIENT-REACHABLE BY CONTRACT. No Deno-only imports, no `supabase` client at module scope,
// importable through `@shared`. The wizard recomputes the size cap as the athlete changes their
// sport mix; a server round-trip there rebuilds the latency defect that was just deleted.
// ============================================================================

export type Sport = 'run' | 'ride' | 'swim';

/**
 * ⛔ THE LEVEL IS NOT THE ATHLETE-FACING DOSE DIAL (`DECISIONS-2026-08-21-standing-plan.md` §3d).
 * p275: *"Adjusting intensity and estimated threshold figures is always better than extending
 * distance or increasing level for this program."* A plan ASSIGNS the level per slot; the athlete's
 * dial is `size` below — which option inside the slot — and their own moving threshold.
 */
export type Level = 1 | 2 | 3;

export type FamilyId =
  // Running — p229-235
  | 'run_sprint_power'
  | 'run_mlss'
  | 'run_near_threshold'
  | 'run_vt1'
  | 'run_lsd'
  // Cycling — p236-239
  | 'ride_sprints'
  | 'ride_anaerobic'
  | 'ride_vo2'
  | 'ride_sweet_spot'
  | 'ride_endurance'
  // Swim — p240-241
  | 'swim_endurance'
  | 'swim_speed'
  | 'swim_open_water';

/**
 * Intensity as the SOURCE expresses it — never as a stored pace or wattage.
 *
 * ⛔ `pct_threshold` is the book's own notation and its meaning is stated for running and INFERRED
 * for cycling. See `PERCENT_BASIS` in `source-rules.ts`; every ride session carries the inference
 * note on its face.
 */
export type Intensity =
  /** Percent of threshold speed/pace/output. 1.0 = threshold / VT2. */
  | { kind: 'pct_threshold'; lo: number; hi: number }
  /** At or below VT1 — resolved from the athlete's own measured easy pace (run) / <75% FTP (ride). */
  | { kind: 'vt1' }
  /** "below 75%" — an upper bound with no floor (cycling endurance, p239). */
  | { kind: 'below_pct'; hi: number }
  /** "All-out" = best possible speed for the day (p229). NOT a percentage; deliberately unresolved. */
  | { kind: 'all_out' }
  /** "Greater than vVO2 pace" — a discrete pace REGION, which p229 says is how these are given. */
  | { kind: 'faster_than_vvo2' }
  /** The athlete's race pace. No anchor in this library resolves it; it stays unresolved. */
  | { kind: 'race_pace' }
  /** Easy jog / easy spin — warm-ups, cooldowns and recoveries. */
  | { kind: 'easy' }
  /** Technique work: drills, kick, pull buoy, mobility. No intensity target exists. */
  | { kind: 'drill' };

/** A range in whatever unit the sport uses. Both ends equal when the source gives a single figure. */
export type Range = { lo: number; hi: number };

/**
 * What the intensity resolves to for THIS athlete. Absent means "we could not resolve it" and the
 * reason travels with it — LAW 2, and the reason `unresolved` is a sentence rather than a null.
 */
export type ResolvedTarget = {
  /** Run — seconds per MILE (the repo's normalized run unit). */
  paceSecPerMi?: Range;
  /** Ride — watts. */
  watts?: Range;
  /** Swim — seconds per 100 METRES (the source's unit; the resolver's is yards, converted once). */
  swimSecPer100m?: Range;
  /** Why there is no number. Present exactly when no unit above is. Never a fabricated value. */
  unresolved?: string;
};

export type StepRole =
  | 'warmup'
  | 'drill'
  | 'work'
  /** Below the family's work floor but still prescribed effort — MLSS's 105% float, NT's VT1 float. */
  | 'float'
  /** Timed easy movement between efforts. */
  | 'recovery'
  /** ⛔ "Full recovery" — the source states NO duration. `seconds` is null and stays null. */
  | 'rest'
  | 'cooldown';

export type Step = {
  role: StepRole;
  label: string;
  /**
   * Clocked seconds. ⛔ `null` means the SOURCE gives no duration ("full recovery", "until unable to
   * hold 120%"). Nothing fills it in.
   */
  seconds: number | null;
  /** Distance-prescribed steps (run sprints, swim). The distance is exact; the clock is derived. */
  meters?: number;
  intensity: Intensity;
  target: ResolvedTarget;
  /**
   * True when `seconds` was DERIVED from `meters` and the athlete's own anchor rather than stated on
   * the page. Those seconds move with the athlete, which is the whole point — and they are an
   * estimate, which is why they are flagged rather than presented as prescription.
   */
  secondsFromDistance?: boolean;
  /**
   * True when the derived clock is a LOWER BOUND rather than an estimate — the sprint family, whose
   * work is "faster than vVO2" with no percentage, clocked at the fastest percentage the family
   * states anywhere (140%, p230-231) so the number can only be too small.
   */
  secondsIsLowerBound?: boolean;
};

export type Block = {
  /** How many times the step list runs. */
  repeat: number;
  label: string;
  steps: Step[];
  /** Between-repeat recovery. Null when the source states none. */
  restBetween: Step | null;
};

/**
 * ⛔ EVERY TOTAL IN THIS LIBRARY IS COMPUTED, AND SAYS SO AT THE SITE.
 *
 * Gap #2 of the twelve (`WORKORDER-the-standing-plan-2026-08-22.md`): *"He gives intervals, warm-up
 * and cooldown; never a total. Compute and label as computed."* This type is that label.
 */
export type SessionTotals = {
  basis: 'computed';
  /** Warm-up + every clocked step + cooldown. */
  clockedSeconds: number;
  /** Steps at or above the family's own work floor. */
  workSeconds: number;
  /** Timed recoveries and floats. Excludes untimed "full recovery". */
  restSeconds: number;
  /** How many "full recovery" gaps the source leaves untimed. */
  openRecoveryCount: number;
  /** Prescribed distance, where the family prescribes distance. */
  meters: number | null;
  /**
   * True when the session contains untimed recovery or a distance-derived clock, so `clockedSeconds`
   * understates the real session. ⚠️ A card reading this must say "at least", not "=".
   */
  isLowerBound: boolean;
};

export type NoteKind =
  /** Straight from the page, with the page. */
  | 'source'
  /** ⛔ OURS, and stated as ours. The cycling percentage basis is the standing example. */
  | 'inferred'
  /** Arithmetic on his numbers, done here rather than on the page. */
  | 'computed'
  /** A product decision with no page under it. */
  | 'ours'
  /** A rule the athlete must be able to act on mid-session. */
  | 'safety';

export type SessionNote = { kind: NoteKind; text: string; cite?: string };

/** What the athlete's own numbers resolved to, and how well we know them. */
export type AnchorReport = {
  sport: Sport;
  /** The resolved anchor in the sport's unit, or null when we do not know it. */
  value: number | null;
  unit: 'sec_per_mi' | 'watts' | 'sec_per_100m';
  /** The resolver's own source label — carried through, never restated. */
  source: string | null;
  isEstimate: boolean;
  /** Run only: the athlete's measured easy pace, which is what VT1 resolves against (B4, zone 2). */
  vt1SecPerMi?: number | null;
};

export type EnduranceSession = {
  family: FamilyId;
  sport: Sport;
  level: Level;
  /** Which structural shape of the family this is. Not one of his workouts — a shape. */
  archetype: string;
  /** 0 = the shortest dose the source's option set offers at this level, 1 = the longest. */
  size: number;
  warmup: Step[];
  blocks: Block[];
  cooldown: Step[];
  totals: SessionTotals;
  /**
   * ⛔ THE 4:1 GATE'S SUBJECT. Null when the family has no timed rest to measure against (the sprint
   * families, whose recovery is "full" and unclocked).
   */
  workToRest: { workSeconds: number; restSeconds: number; ratio: number | null };
  anchor: AnchorReport;
  notes: SessionNote[];
};
