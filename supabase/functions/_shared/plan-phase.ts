/**
 * Plan-phase resolution — the SINGLE lineage (D-261, Q-136 Drop A / Q-138).
 *
 * ONE place that turns a plan `config` + week index into a phase NAME. Before
 * this, three sites resolved phase independently and disagreed:
 *   - arc-context.ts had phase_by_week + a config.phases fallback (D-039 Fix 3),
 *   - coach's weekIntentFromContract read ONLY plan_contract_v1.phase_by_week
 *     (which generate-combined-plan never writes → 'unknown' for every
 *     multi-sport plan → Gate 2 inert), and
 *   - compute-snapshot wrote plan_phase = null and never resolved it (dead stub).
 *
 * This module is that one resolver. Consumers apply their own downstream mapping
 * (coach → week_intent; compute-snapshot → the plan_phase column; arc-context →
 * a sanitized display label) but they all RESOLVE the raw phase here, so a plan
 * shape that resolves for one surface resolves for all.
 *
 * Resolution order (mirrors the proven arc-context logic):
 *   1. plan_contract_v1.phase_by_week[weekIndex-1] — standalone run/tri plans.
 *   2. config.phases fallback — the last {name, start_week} entry whose
 *      start_week <= weekIndex (combined/multi-sport plans; D-039 Fix 3).
 *   3. null — neither present → callers keep their fail-safe (coach → 'unknown').
 */

export type WeekIntent = 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';

/**
 * WHERE the phase was resolved from — a small ENUMERATED provenance tag (never
 * free text, never null). It's an audit trail (`config_phases_fallback` in a
 * snapshot is the receipt proving the Q-136 fallback fired, like
 * `run_only_week_load_pct: -100` proved Gate 1), a legibility signal for Q-138
 * (which plans are on which path), and a visible production flag (`'unknown'`
 * surfacing = a real signal, not a silent null).
 *
 * BOUNDARY (D-260): this tag is the MACHINE fact only. The plain-English
 * sentence ("we used your plan's phase schedule") is Item 4's job, mapped from
 * this enum server-side when the ⓘ is built — NOT emitted here. The resolver
 * emits the tag; it does not narrate. Both the reconciler and the ⓘ read this
 * same field (one lineage at the smallest scale).
 */
export type PhaseSource = 'phase_by_week' | 'config_phases_fallback' | 'phase_structure' | 'unknown';

export interface ResolvedPhase {
  /** Raw phase name ('base' / 'build' / 'taper' / …), or null when unresolved. */
  phase: string | null;
  /** Enumerated provenance tag. `'unknown'` when phase is null. */
  phase_source: PhaseSource;
}

/**
 * Resolve the raw phase NAME + its source for a plan week. `phase` is null when
 * neither the contract array nor config.phases can place the week — callers
 * translate null into their own fail-safe.
 *
 * @param config    the plan's `config` JSON (carries `plan_contract_v1` and/or `phases`)
 * @param weekIndex 1-based plan week; null/<1 → null (pre-start / unknown week)
 */
export function resolvePlanPhaseDetailed(config: any, weekIndex: number | null | undefined): ResolvedPhase {
  if (config == null || weekIndex == null || !(Number(weekIndex) >= 1)) return { phase: null, phase_source: 'unknown' };
  const wk = Number(weekIndex);

  // 1. plan_contract_v1.phase_by_week (standalone run/tri). No version gate —
  //    preserve coach's existing acceptance (it never checked version), just
  //    add the fallback below. A blank/empty entry falls through to config.phases.
  const pbw = config?.plan_contract_v1?.phase_by_week;
  if (Array.isArray(pbw)) {
    const i = wk - 1;
    if (i >= 0 && i < pbw.length) {
      const p = String(pbw[i] ?? '').trim();
      if (p) return { phase: p, phase_source: 'phase_by_week' };
    }
  }

  // 2. D-039 Fix 3 fallback: config.phases = [{ name, start_week, ... }] covering
  //    the whole plan. Last phase whose start_week <= weekIndex wins (so a week
  //    beyond the last listed start_week resolves to the final phase).
  if (Array.isArray(config.phases)) {
    const sorted = (config.phases as Array<{ name?: unknown; start_week?: unknown }>)
      .filter((p) => Number.isFinite(Number(p?.start_week)))
      .map((p) => ({ name: String(p?.name ?? '').trim(), start_week: Number(p?.start_week) }))
      .sort((a, b) => a.start_week - b.start_week);
    let matched: string | null = null;
    for (const p of sorted) {
      if (p.start_week <= wk) { if (p.name) matched = p.name; }
      else break;
    }
    if (matched) return { phase: matched, phase_source: 'config_phases_fallback' };
  }

  // 3. Strength-primary plans (strength_primary_v1) carry their block structure
  //    under config.phase_structure.phases = [{ name, start_week, end_week, ... }].
  //    Same last-start_week-≤-weekIndex placement as config.phases.
  const psPhases = config?.phase_structure?.phases;
  if (Array.isArray(psPhases)) {
    const sorted = (psPhases as Array<{ name?: unknown; start_week?: unknown }>)
      .filter((p) => Number.isFinite(Number(p?.start_week)))
      .map((p) => ({ name: String(p?.name ?? '').trim(), start_week: Number(p?.start_week) }))
      .sort((a, b) => a.start_week - b.start_week);
    let matched: string | null = null;
    for (const p of sorted) {
      if (p.start_week <= wk) { if (p.name) matched = p.name; }
      else break;
    }
    if (matched) return { phase: matched, phase_source: 'phase_structure' };
  }

  return { phase: null, phase_source: 'unknown' };
}

/**
 * Resolve just the raw phase NAME (drops provenance). The default for callers
 * that only need the label; use `resolvePlanPhaseDetailed` when you need source.
 */
export function resolvePlanPhase(config: any, weekIndex: number | null | undefined): string | null {
  return resolvePlanPhaseDetailed(config, weekIndex).phase;
}

/**
 * Map a raw phase NAME to a coach week_intent.
 *
 * D-261 changes vs the old inline coach map (which was `else → 'build'`):
 *   - `deload → recovery` — a deload IS an easy week; the old map fell it through
 *     to 'build', which would hand it Gate 2's build-band LENIENCY on the one
 *     week you're deliberately backing off. Now an easy week.
 *   - DEFAULT FLIPPED TO 'unknown' (D-242 fail-safe): an UNRECOGNISED phase name
 *     resolves to 'unknown' (→ strict bands), never 'build' (→ lenient). A plan
 *     inventing a new phase (Power / Accumulation / Realization / Retest …)
 *     is safe by default — strict, not silently permissive. Only the explicitly
 *     known phases earn a mapping; everything else is the safe answer.
 *
 * Strength-phase names Power / Peak-as-strength / Retest deliberately fall to the
 * new 'unknown' default here — routing them through an endurance intent model is
 * lossy and deferred (see the strength-tolerance open question).
 */
export function phaseNameToWeekIntent(phaseName: string | null | undefined): WeekIntent {
  const p = String(phaseName ?? '').toLowerCase().trim();
  switch (p) {
    case 'recovery':
    case 'deload':   return 'recovery'; // D-261: deload is an easy week, not a build
    case 'taper':    return 'taper';
    case 'peak':     return 'peak';
    case 'base':
    case 'baseline': return 'baseline';
    case 'build':    return 'build';    // must be explicit now the default is 'unknown'
    default:         return 'unknown';  // D-261/D-242: unknown phase → strict, never lenient
  }
}

/** Convenience: resolve phase then map to intent in one call (coach's path). */
export function resolveWeekIntent(config: any, weekIndex: number | null | undefined): WeekIntent {
  return phaseNameToWeekIntent(resolvePlanPhase(config, weekIndex));
}
