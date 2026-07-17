// AUTO-DERIVED PROVISIONAL BASELINES (Michael 2026-07-16, reversal of the manual-only rule).
//
// For a discipline with no CONFIRMED baseline, the coach derives a PROVISIONAL one from the single BEST
// qualifying effort in the athlete's OWN history — so the fitness dot is reachable without a manual step,
// while staying honest via the "auto · source · date" label (labeling, not absence).
//
// ⛔ THE HARD RULE (from the contract): derivation uses ONLY criteria the engine already computes. It reuses
// the EXACT qualification predicates the trends use — never a looser copy invented to force an anchor:
//   - RUN   → `isQualifyingDecouplingRow` (the same steady/≥20min/terrain rule the durability trend uses),
//             best = the LOWEST decoupling % (lower is better). Source event = the run's workout_id.
//   - BIKE  → the current FTP estimate (learned_fitness.ride_ftp_estimated). Source = the estimate itself.
//   - SWIM  → the FASTEST CONFIRMED-HARD effort (RPE ≥ 7 — the css-learner's existing classification).
//             Source event = that swim's workout_id. No hard effort on record → null (calibration state).
// If a discipline has no qualifying effort, it returns null — the caller renders the honest calibration
// state ("needs a steady run of 20+ min"), and NOTHING is loosened to manufacture an anchor.
//
// Pure: no fetching, no Date.now. STRENGTH is intentionally absent — its declared 1RMs are already
// CONFIRMED anchors, never auto-derived (contract §2d).

import { isQualifyingDecouplingRow, type DecouplingRow } from './run.ts';

export interface BaselineCandidate {
  discipline: 'run' | 'bike' | 'swim';
  metric: string;                 // 'decoupling' | 'ftp' | 'css_pace'
  value: number;                  // the metric value at the anchor (the tick position)
  lowerIsBetter: boolean;         // decoupling & pace: lower is better; ftp: higher is better
  sourceEventId: string | null;   // workout_id of the source effort; null when the source is an estimate (bike)
  sourceDate: string;             // ISO date of the source effort / estimate
  sourceLabel: string;            // human: "steady run" / "FTP estimate" / "hard swim"
  confidence?: string | null;     // carried for the label where the source has one (bike FTP estimate)
}

export interface BaselineDeriveInputs {
  /** Qualifying-or-not steady-run rows carrying decoupling + workout_id + date (filtered HERE by the shared rule). */
  runDecouplingRows: DecouplingRow[];
  /** The current learned FTP estimate, or null. Source is the estimate, not a single ride (contract §2a). */
  bikeFtpEstimate: { value: number | null; confidence?: string | null; asOf?: string | null } | null;
  /** Swim efforts with the css-learner's hard classification + workout_id + date. */
  swimEfforts: Array<{ workout_id?: string | null; date?: string | null; pacePer100m?: number | null; confirmedHard?: boolean | null }>;
}

/** RECENCY BOUND (#2): the athlete's history is bounded to a recent window so the picked anchor is a CURRENT
 *  best, not an all-time PR from a prior training life. `asOf` + `windowDays` come from the spine's config
 *  layer (STATE_TREND_WINDOWS.baselineWindowDays) — never an inline constant here. */
export interface BaselineDeriveOpts { asOf: string; windowDays: number; }

export interface DerivedBaselines {
  run: BaselineCandidate | null;
  bike: BaselineCandidate | null;
  swim: BaselineCandidate | null;
}

const MS_PER_DAY = 86_400_000;
function windowStartISO(asOf: string, windowDays: number): string {
  return new Date(Date.parse(asOf + 'T12:00:00Z') - windowDays * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Derive one provisional baseline per discipline from the athlete's own best qualifying effort, bounded
 *  to a recent window. Bike's FTP estimate is a CURRENT learned value, so it isn't window-filtered. */
export function deriveProvisionalBaselines(inp: BaselineDeriveInputs, opts: BaselineDeriveOpts): DerivedBaselines {
  const start = windowStartISO(opts.asOf, opts.windowDays);
  return {
    run: deriveRun(inp.runDecouplingRows, start, opts.asOf),
    bike: deriveBike(inp.bikeFtpEstimate),
    swim: deriveSwim(inp.swimEfforts, start, opts.asOf),
  };
}

// #3 BENCHMARK-ONLY FLOOR (new rule, flagged 2026-07-16). NO existing analyzer rule distinguishes a strongly
// NEGATIVE decoupling as un-clean — the plausible band keeps [-30, 50] for TRENDING, and mixed_effort is a
// HEDGE-never-a-filter (run.ts). But crowning is stricter than trending: a negative decoupling (HR drifting
// DOWN vs pace) is almost always a confounded/under-warmed start, not superhuman durability — a "memorial",
// not a benchmark. So auto-derivation will only CROWN a run whose decoupling is >= 0. (The athlete may still
// pick a negative-drift run manually via the change flow; auto just won't.) This threshold is benchmark-scoped
// and does NOT touch the trend series.
const CROWN_MIN_DECOUPLING = 0;

function deriveRun(rows: DecouplingRow[] | null | undefined, windowStart: string, asOf: string): BaselineCandidate | null {
  const qualifying = (Array.isArray(rows) ? rows : [])
    .filter(isQualifyingDecouplingRow)                                   // SAME rule as the trend (one source)
    .filter((r) => { const d = rowDate(r); return d > windowStart && d <= asOf; }) // #2 recency
    .filter((r) => Number(r.decoupling_pct) >= CROWN_MIN_DECOUPLING);    // #3 don't crown a confounded negative
  if (qualifying.length === 0) return null;
  // best durability = the LOWEST decoupling %. Ties → the more RECENT run (a fresher anchor of equal quality).
  const best = qualifying.reduce((a, b) => {
    const av = Number(a.decoupling_pct), bv = Number(b.decoupling_pct);
    if (bv < av) return b;
    if (bv > av) return a;
    return (rowDate(b) > rowDate(a)) ? b : a;
  });
  return {
    discipline: 'run', metric: 'decoupling', value: Number(best.decoupling_pct), lowerIsBetter: true,
    sourceEventId: best.workout_id ?? null, sourceDate: rowDate(best), sourceLabel: 'steady run',
  };
}

function deriveBike(est: BaselineDeriveInputs['bikeFtpEstimate']): BaselineCandidate | null {
  if (!est || !(Number(est.value) > 0)) return null;
  return {
    discipline: 'bike', metric: 'ftp', value: Number(est.value), lowerIsBetter: false,
    sourceEventId: null, sourceDate: est.asOf ?? '', sourceLabel: 'FTP estimate', confidence: est.confidence ?? null,
  };
}

function deriveSwim(efforts: BaselineDeriveInputs['swimEfforts'], windowStart: string, asOf: string): BaselineCandidate | null {
  const hard = (Array.isArray(efforts) ? efforts : [])
    .filter((e) => e?.confirmedHard === true && Number(e?.pacePer100m) > 0)
    .filter((e) => { const d = String(e?.date || ''); return d > windowStart && d <= asOf; }); // #2 recency
  if (hard.length === 0) return null; // no hard effort on record → calibration state, never a faked anchor
  const best = hard.reduce((a, b) => {
    const av = Number(a.pacePer100m), bv = Number(b.pacePer100m);
    if (bv < av) return b;            // faster pace = better
    if (bv > av) return a;
    return (String(b.date || '') > String(a.date || '')) ? b : a;
  });
  return {
    discipline: 'swim', metric: 'css_pace', value: Number(best.pacePer100m), lowerIsBetter: true,
    sourceEventId: best.workout_id ?? null, sourceDate: String(best.date || ''), sourceLabel: 'hard swim',
  };
}

function rowDate(r: DecouplingRow): string { return r.date ?? r.metric_date ?? ''; }

// ── IDEMPOTENT RECONCILIATION (Michael 2026-07-16) ────────────────────────────────────────────────
// The write path must be idempotent BY CONSTRUCTION: re-running compute against unchanged history must
// NOT churn supersede records. A provisional row is superseded ONLY when the PICK ACTUALLY CHANGES —
// never on every pass — else the audit lineage fills with no-op supersedes and history stops meaning
// anything. And a CONFIRMED baseline is NEVER auto-touched (contract §3). This pure function decides the
// single DB action; the caller (compute-snapshot) executes it against the table.

/** The current ACTIVE baseline row (superseded_at IS NULL) for a discipline/metric, reduced to what the
 *  reconciliation needs. */
export interface ActiveBaseline { status: 'provisional' | 'confirmed'; sourceEventId: string | null; value: number; }

export type BaselineAction =
  | { kind: 'noop' }                                   // confirmed (skip), unchanged pick, or null-with-no-active
  | { kind: 'insert'; candidate: BaselineCandidate }   // no active → write a new provisional
  | { kind: 'supersede'; candidate: BaselineCandidate }// provisional AND the pick changed → retire old + write new
  | { kind: 'retire' };                                // provisional but no qualifying effort now → retire to calibration

export function reconcileBaseline(active: ActiveBaseline | null, candidate: BaselineCandidate | null): BaselineAction {
  if (active?.status === 'confirmed') return { kind: 'noop' };          // never auto-update a confirmed anchor
  if (!candidate) return active ? { kind: 'retire' } : { kind: 'noop' };// no pick: retire a stale provisional, else nothing
  if (!active) return { kind: 'insert', candidate };                   // first anchor for this discipline
  // active is PROVISIONAL — supersede ONLY if the pick genuinely moved (idempotency).
  const changed = active.sourceEventId !== candidate.sourceEventId || Number(active.value) !== Number(candidate.value);
  return changed ? { kind: 'supersede', candidate } : { kind: 'noop' };
}
