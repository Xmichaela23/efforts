// Shared narrative-reasoning core — types. The LOGIC (the 7 universal rules + the validator suite) is
// single-sourced here and parameterized by a per-discipline ADAPTER. No `if discipline ==` branches:
// the scaffold + validators know nothing about run/ride/swim/strength; the adapter translates each
// discipline's fact packet into the generic NarrativeContext the core reasons over.
// Standard: docs/SPEC-universal-narrative-inference.md. Work order: docs/WORK-ORDER-narrative-core.md.

export type Discipline = 'run' | 'ride' | 'swim' | 'strength';

/** Which effort claims have an anchor THIS session (Rule 3). null = no anchor → stay neutral. */
export interface AnchorSet {
  hr?: 'zones' | 'threshold' | null;
  pace?: 'threshold' | null;
  power?: 'ftp' | null;
  strength?: 'e1rm-history' | null;
}

/** A signal the packet flags as atypical/elevated this session (Rule 2) — the lead must reconcile it. */
export interface SignalFlag {
  signal: string;   // human label, e.g. 'HR drift', 'decoupling'
  state: string;    // e.g. 'elevated', 'unexplained'
  detail?: string;  // e.g. '35 bpm vs typical 0'
}

/** A lead signal that is NOTABLE this session and must NOT be dropped from the reasoning (Rule 1). */
export interface NotableLeadSignal {
  signal: string;       // e.g. 'heat'
  mentions: string[];   // lexical tokens that count as "mentioned", e.g. ['heat','temperature','warm','°f']
  detail: string;       // e.g. 'it was 82°F'
}

/** The generic context the core reasons over — built by the adapter from the discipline's packet. */
export interface NarrativeContext {
  notableLeadSignals: NotableLeadSignal[];  // Rule 1 — must be reasoned about, not dropped
  atypicalSignals: SignalFlag[];            // Rule 2 — lead must reconcile these
  anchors: AnchorSet;                       // Rule 3 — effort claims need a present anchor
  hasTrendField: boolean;                   // Rule 5 — pace/power DIRECTION claims (improving/declining) need a trend
  hasFitnessTrend: boolean;                 // Rule 5 — FITNESS-STATE claims ("fitness is holding/building") need a FITNESS-grade
                                            //          verdict, not just a similarity trend. Ride's spine cross_workout.trend
                                            //          qualifies; run's pace-similarity trend does NOT. The adapter decides.
  establishedCauses: string[];              // Rule 4 — lowercase causes the packet deterministically proved
}

export interface DisciplineAdapter {
  discipline: Discipline;
  /** Rule 1 — the signals that MUST be reasoned together in the lead (swim's D-179 win, generalized). */
  leadSignals: string[];
  /** The discipline's honest-reads + traps (from the SPEC addendum), appended to the scaffold verbatim. */
  addendum: string;
  /** Translate the discipline's display/fact packet into the generic context. The ONLY discipline-aware code. */
  buildContext(packet: any): NarrativeContext;
}

export interface ValidationFailure { rule: number; code: string; why: string; }
export interface ValidationResult { ok: boolean; failures: ValidationFailure[]; retryNote: string; }
