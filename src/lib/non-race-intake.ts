// Non-race intake logic — the allocation + placement behavior, rebuilt from the interaction
// reference (docs/reference/non-race-intake-reference.html). Pure + deterministic; the UI
// (NonRaceTimeAllocation / NonRacePlacement) is a thin shell over these. Matches the RULES, not
// the reference markup. Run: ~/.deno/bin/deno test --no-check src/lib/non-race-intake.test.ts

// ── Layer 1: time allocation ─────────────────────────────────────────────────
// Budget is the hard cap. Strength's program cost is reserved off the top (shown, not draggable).
// The remainder is endurance, leaned between run and ride by one fader. Warn (never silently
// overcommit) when strength leaves too little endurance.

export type StrengthProgram = 'five_by_five' | 'durability' | 'hypertrophy' | 'minimum_dose';

/**
 * ⚠️ PROVISIONAL — NOT SCIENCE-FINAL. Per-protocol weekly hour cost. Placeholders pending the
 * coaching sign-off in SPEC-non-race-goal-plan-contract.md (gate #3 — strength frequency/cost cells).
 * Mirrors the reference reserve values; real costs come from the protocol × frequency the engine runs.
 */
export const STRENGTH_PROGRAM_HRS: Record<StrengthProgram, number> = {
  five_by_five: 3.0,   // 3 days · heavy compound
  durability: 2.0,     // 2 days · injury-prevention
  hypertrophy: 4.0,    // 4 days · upper/lower
  minimum_dose: 1.0,   // 2 short maintenance
};

/** Below this, strength has eaten too much of the week — warn the athlete. */
export const MIN_ENDURANCE_HRS = 2;

export type TimeAllocation = {
  budgetHrs: number;
  strengthHrs: number;
  enduranceHrs: number;
  runHrs: number;
  rideHrs: number;
  runPct: number;
  ridePct: number;
  /** Set when endurance time is too low; null when fine. Glass-box: surfaced, never silent. */
  warning: string | null;
};

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Allocate the week: budget → strength reserved off the top → endurance leaned run/ride.
 * `runLeanPct` is the single fader (0 = all ride, 100 = all run). For single-developing-discipline
 * goals the caller pins the fader (100 run-only / 0 ride-only) and hides it.
 */
export function allocateTime(
  budgetHrs: number,
  program: StrengthProgram,
  runLeanPct: number,
): TimeAllocation {
  const strengthHrs = STRENGTH_PROGRAM_HRS[program] ?? 0;
  const enduranceHrs = Math.max(0, budgetHrs - strengthHrs);
  const runPct = clampPct(runLeanPct);
  const ridePct = 100 - runPct;
  return {
    budgetHrs,
    strengthHrs,
    enduranceHrs,
    runHrs: (enduranceHrs * runPct) / 100,
    rideHrs: (enduranceHrs * ridePct) / 100,
    runPct,
    ridePct,
    warning:
      enduranceHrs < MIN_ENDURANCE_HRS
        ? 'Strength eats most of your week — little left for endurance. Add time or pick a lighter strength program.'
        : null,
  };
}

// ── Layer 2: placement (strength-gated) ──────────────────────────────────────
// User gives availability + the long-session day. The engine assigns ONE quality endurance day and
// ONE heavy strength day under the interference rules:
//   • quality endurance is NOT adjacent to the long day (the long day already carries fatigue).
//   • heavy lower-body is NEVER the day BEFORE a quality run (it would blunt the quality session —
//     the residual-fatigue interference rule), NEVER the day before the long run, NEVER on the long
//     day, and not on the quality day itself.
// When availability is too tight for a clean placement, we still place it but FLAG the unavoidable
// interference (never silently produce a bad week).
//
// NOTE: the reference markup gated heavy on the day *after* quality (`(qualityDay+1)`); the stated
// rule — and the interference science — is the day *before* (heavy today → impaired quality
// tomorrow). This implements the rule, not the markup's slip.

export type DayType = 'heavy' | 'quality' | 'easy' | 'long' | 'rest';

export type WeekPlacement = {
  /** index 0=Sunday … 6=Saturday */
  days: DayType[];
  longDay: number;
  qualityDay: number | null;
  heavyDay: number | null;
  /** Non-null when availability forced an interference compromise — surfaced to the athlete. */
  interference: string | null;
};

const DAYS = 7;
const dayBefore = (d: number): number => (d - 1 + DAYS) % DAYS;
const dayAfter = (d: number): number => (d + 1) % DAYS;

export function placeWeek(active: boolean[], longDay: number): WeekPlacement {
  const days: DayType[] = Array.from({ length: DAYS }, (_, i) => (active[i] ? 'easy' : 'rest'));
  if (active[longDay]) days[longDay] = 'long';

  const avail = [0, 1, 2, 3, 4, 5, 6].filter((i) => active[i] && i !== longDay);
  let interference: string | null = null;

  // Quality endurance — prefer a day not adjacent to the long day.
  const longAdj = (d: number) => d === dayBefore(longDay) || d === dayAfter(longDay);
  let qualityDay: number | null = avail.find((d) => !longAdj(d)) ?? null;
  if (qualityDay === null && avail.length > 0) {
    qualityDay = avail[0]; // forced adjacent — flag it
    interference =
      'Quality day sits next to your long day — limited availability forced it; recovery between them is tight.';
  }
  if (qualityDay !== null) days[qualityDay] = 'quality';

  // Heavy strength — off quality, off the day before quality, off the long day + the day before it.
  const heavyBlocked = (d: number): boolean =>
    d === qualityDay ||
    (qualityDay !== null && d === dayBefore(qualityDay)) ||
    d === longDay ||
    d === dayBefore(longDay);

  let heavyDay: number | null = avail.find((d) => d !== qualityDay && !heavyBlocked(d)) ?? null;
  if (heavyDay === null) {
    // No clean day — place it on any remaining day (off quality + long) and flag the interference.
    heavyDay = avail.find((d) => d !== qualityDay && d !== longDay) ?? null;
    if (heavyDay !== null) {
      interference =
        interference ??
        'No clean day for heavy lifting — it lands the day before a quality or long session. Add a training day to separate them.';
    }
  }
  if (heavyDay !== null) days[heavyDay] = 'heavy';

  return { days, longDay, qualityDay, heavyDay, interference };
}

export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
