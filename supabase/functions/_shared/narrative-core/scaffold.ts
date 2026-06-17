// Shared narrative-reasoning core — the SCAFFOLD (the structural half: make the model reason right
// up front, the way swim's D-179 cross-signal lead does). buildReasoningScaffold(adapter, packet)
// returns the SAME 7-rule block for every discipline, with three adapter-driven inserts (Rule 1 lead
// signals + this-session notables, Rule 2 atypical signals to reconcile, Rule 4 established-cause
// allowlist) + the discipline addendum. Each analyzer INJECTS this into its existing prompt — assembly
// is NOT unified (work-order guardrail #1); only the reasoning logic is single-sourced.

import type { DisciplineAdapter } from './types.ts';

export function buildReasoningScaffold(adapter: DisciplineAdapter, packet: any): string {
  const ctx = adapter.buildContext(packet);
  const lead = adapter.leadSignals.join(' + ');
  const atypical = ctx.atypicalSignals.length
    ? ctx.atypicalSignals.map((s) => `${s.signal} ${s.state}${s.detail ? ` (${s.detail})` : ''}`).join(', ')
    : null;
  const notDrop = ctx.notableLeadSignals.length
    ? ctx.notableLeadSignals.map((n) => `${n.signal} — ${n.detail}`).join('; ')
    : null;
  const causes = ctx.establishedCauses.length ? ctx.establishedCauses.join(', ') : 'NONE (no cause is established)';

  return [
    '',
    '════════ SHARED REASONING CORE (universal — applies to every discipline) ════════',
    `1. REASON ACROSS SIGNALS, NEVER IN SILOS: your opening sentence must reason across ${lead} TOGETHER, in relationship — never as a separate list, never dropping one.${notDrop ? ` This session, do NOT omit: ${notDrop}.` : ''}`,
    `2. NEVER CONTRADICT ACROSS SECTIONS: ${atypical ? `these signals are ATYPICAL this session — ${atypical}. The lead must RECONCILE them; it cannot call the session steady / easy / controlled / "in control" while leaving them unaddressed.` : 'the lead must not contradict any later observation; if a body signal is elevated/atypical, the lead cannot call the session uniformly easy.'}`,
    `3. ANCHOR TO THIS ATHLETE, NEVER ABSOLUTES: read effort against this athlete's own zones / threshold / FTP / history. Where no anchor is provided, stay neutral — never assert high / low / hard / easy in the absolute.`,
    `4. OBSERVE, DON'T DIAGNOSE CAUSE: you may attribute cause ONLY to: ${causes}. Every other contributor (heat, terrain, fatigue) is named as a PLAUSIBLE contributor, never as the proven sole cause.`,
    `5. AVERAGE OVER PEAK, TREND OVER SINGLE SESSION: the AVERAGE characterizes the session; a peak is momentary and does not define it. Make NO single-session fitness or readiness verdict ("you're ready", "fitness is holding", "aerobic base is building") unless a multi-session trend is provided in the data.`,
    `6. NO FABRICATED MECHANISM OR NUMBERS: describe behavior, not physiology (no "VO2 improved", "lactate cleared"); use only numbers present in the data; flag direction without inventing magnitude.`,
    `7. DON'T RESTATE THE CARD; HONEST BLANKS OVER GUESSES: reason about the numbers, do not repeat them; where a value or anchor is missing, omit / stay neutral rather than guess.`,
    '',
    `──── ${adapter.discipline.toUpperCase()} ADDENDUM ────`,
    adapter.addendum.trim(),
    '═════════════════════════════════════════════════════════════════════════════════',
    '',
  ].join('\n');
}
