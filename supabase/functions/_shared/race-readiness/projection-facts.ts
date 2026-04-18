import type { EnduranceResponse } from '../response-model/types.ts';
import type { RaceReadinessV1 } from './index.ts';

/** Grouped projection copy for State: one framing line + sections (data-first, coherent). */
export type RaceProjectionSectionV1 = { label: string; lines: string[] };

export type RaceProjectionDisplayV1 = {
  /** Single through-line: goal vs model + risk or alignment; null when no goal to compare. */
  framing: string | null;
  sections: RaceProjectionSectionV1[];
};

function pushSection(
  sections: RaceProjectionSectionV1[],
  label: string,
  lines: string[],
): void {
  const filtered = lines.map((l) => l.trim()).filter(Boolean);
  if (filtered.length) sections.push({ label, lines: filtered });
}

/** Plain framing: goal vs clock, scoped risk, no pep talk. */
function buildFraming(rr: RaceReadinessV1): string | null {
  if (
    rr.target_finish_time_seconds == null ||
    rr.delta_seconds == null ||
    !Number.isFinite(rr.delta_seconds)
  ) {
    return null;
  }
  const ds = rr.delta_seconds;
  if (ds > 90) {
    return (
      'Projected finish is slower than your goal: it follows training signal, not your target. ' +
      'Forcing goal pace increases the risk of a hard second half on this model; pacing to the projected finish matches current data.'
    );
  }
  if (ds < -90) {
    return 'Projected finish is faster than your saved goal — the goal sits below current threshold signal.';
  }
  return 'Projected finish is close to your goal on this model.';
}

/**
 * Coherent projection UI: framing + grouped facts (speed / durability / goal / training snapshot).
 * Replaces a single flat bullet list of unrelated lines.
 */
export function buildRaceProjectionDisplay(args: {
  rr: RaceReadinessV1;
  endurance: EnduranceResponse;
}): RaceProjectionDisplayV1 {
  const { rr, endurance: e } = args;
  const sections: RaceProjectionSectionV1[] = [];

  if (rr.training_signals?.length) {
    pushSection(
      sections,
      'Training snapshot',
      rr.training_signals.slice(0, 6).map((s) => `${s.label}: ${s.value}`),
    );
  }

  pushSection(sections, 'How this time is built', [
    'Threshold pace → VDOT → race distance, then durability and data-confidence adjustments (already in the projected time above).',
  ]);

  const speedLines: string[] = [];
  if (rr.plan_vdot != null && rr.vdot_delta != null && rr.vdot_direction !== 'stable') {
    speedLines.push(
      `Threshold-derived VDOT ${rr.vdot_delta > 0 ? '+' : ''}${rr.vdot_delta.toFixed(1)} vs plan-start steady pace (${rr.current_vdot.toFixed(1)} vs ${rr.plan_vdot.toFixed(1)}).`,
    );
  }
  pushSection(sections, 'Speed (threshold)', speedLines);

  const durLines: string[] = [];
  if (e.hr_drift.sufficient && e.hr_drift.current_avg_bpm != null && e.hr_drift.baseline_avg_bpm != null) {
    const cur = e.hr_drift.current_avg_bpm;
    const base = e.hr_drift.baseline_avg_bpm;
    const delta = cur - base;
    if (Math.abs(delta) >= 0.4) {
      durLines.push(
        delta < 0
          ? `HR drift on runs vs 28-day average: ${cur.toFixed(1)} vs ${base.toFixed(1)} bpm (lower).`
          : `HR drift on runs vs 28-day average: ${cur.toFixed(1)} vs ${base.toFixed(1)} bpm (higher).`,
      );
    }
  }
  if (e.cardiac_efficiency.sufficient) {
    if (e.cardiac_efficiency.trend === 'improving') {
      durLines.push('Easy-effort pace trending faster than rolling baseline (aerobic efficiency).');
    } else if (e.cardiac_efficiency.trend === 'declining') {
      durLines.push('Easy-effort pace trending slower than rolling baseline.');
    }
  }
  pushSection(sections, 'Durability & aerobic', durLines);

  const goalLines: string[] = [];
  if (rr.target_finish_time_seconds != null && rr.delta_seconds != null && Number.isFinite(rr.delta_seconds)) {
    const ds = rr.delta_seconds;
    if (ds > 90) {
      goalLines.push('Slower than saved goal: clock uses observed threshold fitness, not goal time.');
      if (rr.data_source === 'plan_targets') {
        goalLines.push('Threshold signal still plan-based; observed pace replaces it when confidence is sufficient.');
      }
      if (rr.confidence_adjustment_pct > 0) {
        goalLines.push(`Conservative time bias +${rr.confidence_adjustment_pct.toFixed(1)}% (sparse or low-confidence data).`);
      }
      if (rr.durability_factor < 0.995) {
        goalLines.push(
          `Durability factor ${rr.durability_factor.toFixed(3)} (drift vs baseline, easy-run decoupling) adds time.`,
        );
      }
    } else if (ds < -90) {
      goalLines.push('Faster than saved goal on this model — goal is conservative vs current threshold data.');
    }
  }
  pushSection(sections, 'Projection vs goal', goalLines);

  return {
    framing: buildFraming(rr),
    sections,
  };
}

/**
 * @deprecated Use buildRaceProjectionDisplay; kept for callers expecting a flat list.
 */
export function buildRaceProjectionFactLines(args: {
  rr: RaceReadinessV1;
  endurance: EnduranceResponse;
}): string[] {
  const d = buildRaceProjectionDisplay(args);
  const out: string[] = [];
  if (d.framing) out.push(d.framing);
  for (const s of d.sections) {
    out.push(...s.lines);
  }
  return out.slice(0, 12);
}
