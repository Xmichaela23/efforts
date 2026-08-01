// ── THE SEVERITY CAP — a rollup may never out-alarm its own evidence ─────────────────────────────
//
// THE RULE (Michael, 2026-08-01, D-353):
//   **A rollup row's severity may never exceed the maximum severity of its contributors.**
//   Less severe than its contributors is fine — that is legitimate aggregation. More severe is
//   invention: a row with no metric of its own asserting a concern its evidence does not carry.
//
// WHY IT EXISTS. The BODY "Heart-rate response" row is a pure rollup — its contributors ARE
// `run.efficiency` and `bike.efficiency` (`assemble.ts:837-843`), the same two verdicts the RUN and
// BIKE rows render underneath it. Those rows render a decline NEUTRALLY. The rollup rendered the
// same decline AMBER, because its tone was a hardcoded literal in the composer whose own comment
// read *"the RUN row renders the same movement in amber"* — an assumption about a different row's
// colour, which changing that row silently falsified. One measurement, two severities, one screen.
//
// ⛔ THE POINT IS THAT THIS IS A RULE, NOT A PATCH. Hand-fixing that one colour would leave the
// mechanism live for the next rollup anyone adds. Apply `capRollupTone` at the COMPOSER for any row
// whose evidence is other rows, and the class of bug cannot recur.

/** Display tones the client knows (`trendColor`, `StateTab.tsx`). */
export type Tone = 'positive' | 'neutral' | 'warning' | 'danger';

/**
 * How ALARMING a tone is. `positive` is a valence, not a severity — a green row is not "less
 * worrying" than a grey one, it is a different statement — so it ranks alongside neutral at 0.
 * The cap only ever removes alarm; it never turns a positive row grey.
 */
const SEVERITY: Record<Tone, number> = { positive: 0, neutral: 0, warning: 1, danger: 2 };

/**
 * The severity a single contributor VERDICT is entitled to.
 *
 * ⚠️ THIS IS THE APP-WIDE DECISION, IN ONE PLACE. A decline is a DIRECTION, not a warning — it is
 * routinely correct (a deload, a taper, a base block), which is why the fitness rows render it in
 * neutral grey. Anything that wants to raise alarm above this must justify it from evidence it owns,
 * not inherit it from a trend arrow.
 */
export function severityOfVerdict(verdict: string | null | undefined): Tone {
  if (verdict === 'improving') return 'positive';
  return 'neutral'; // holding, sliding, needs_data, withheld — none of these is an alarm
}

/**
 * Cap `ownTone` at the most severe tone any contributor is entitled to.
 *
 * No contributors → nothing to inherit from, so the rollup has no evidence for alarm and is capped
 * at neutral. That is deliberate: a rollup of nothing should never be the loudest row on the screen.
 */
export function capRollupTone(ownTone: Tone, contributorVerdicts: Array<string | null | undefined>): Tone {
  const ceiling = contributorVerdicts.reduce<number>(
    (max, v) => Math.max(max, SEVERITY[severityOfVerdict(v)]),
    0,
  );
  if (SEVERITY[ownTone] <= ceiling) return ownTone;
  // Step DOWN to the ceiling. `positive` is never reached here (rank 0 can't exceed a ceiling).
  return ceiling >= 2 ? 'danger' : ceiling >= 1 ? 'warning' : 'neutral';
}
