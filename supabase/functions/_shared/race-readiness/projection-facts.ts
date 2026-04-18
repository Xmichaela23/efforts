import type { EnduranceResponse } from '../response-model/types.ts';
import type { RaceReadinessV1 } from './index.ts';

/**
 * Short, declarative lines for State / Goals — no encouragement, cites data layers only.
 */
export function buildRaceProjectionFactLines(args: {
  rr: RaceReadinessV1;
  endurance: EnduranceResponse;
}): string[] {
  const { rr, endurance: e } = args;
  const lines: string[] = [];

  lines.push(
    'Projected finish = threshold pace → VDOT → distance, then durability and data-confidence adjustments (already baked into the time above).',
  );

  if (e.hr_drift.sufficient && e.hr_drift.current_avg_bpm != null && e.hr_drift.baseline_avg_bpm != null) {
    const cur = e.hr_drift.current_avg_bpm;
    const base = e.hr_drift.baseline_avg_bpm;
    const delta = cur - base;
    if (Math.abs(delta) >= 0.4) {
      lines.push(
        delta < 0
          ? `HR drift on runs is lower than your 28-day average (${cur.toFixed(1)} vs ${base.toFixed(1)} bpm).`
          : `HR drift on runs is higher than your 28-day average (${cur.toFixed(1)} vs ${base.toFixed(1)} bpm).`,
      );
    }
  }

  if (e.cardiac_efficiency.sufficient) {
    if (e.cardiac_efficiency.trend === 'improving') {
      lines.push('Pace at comparable easy effort is trending faster than your rolling baseline (aerobic efficiency).');
    } else if (e.cardiac_efficiency.trend === 'declining') {
      lines.push('Pace at comparable easy effort is trending slower than your rolling baseline.');
    }
  }

  if (rr.plan_vdot != null && rr.vdot_delta != null && rr.vdot_direction !== 'stable') {
    lines.push(
      `Threshold-derived VDOT is ${rr.vdot_delta > 0 ? '+' : ''}${rr.vdot_delta.toFixed(1)} vs plan-start steady pace (${rr.current_vdot.toFixed(1)} vs ${rr.plan_vdot.toFixed(1)}).`,
    );
  }

  if (rr.target_finish_time_seconds != null && rr.delta_seconds != null && Number.isFinite(rr.delta_seconds)) {
    const ds = rr.delta_seconds;
    if (ds > 90) {
      lines.push(
        'Slower than your saved goal because the clock follows observed threshold fitness, not the goal time.',
      );
      if (rr.data_source === 'plan_targets') {
        lines.push('Threshold signal is still plan-based; observed pace will replace it when confidence is sufficient.');
      }
      if (rr.confidence_adjustment_pct > 0) {
        lines.push(`Conservative time bias +${rr.confidence_adjustment_pct.toFixed(1)}% (sparse or low-confidence data).`);
      }
      if (rr.durability_factor < 0.995) {
        lines.push(
          `Durability factor ${rr.durability_factor.toFixed(3)} (drift vs baseline, easy-run decoupling) adds time.`,
        );
      }
    } else if (ds < -90) {
      lines.push('Faster than your saved goal on this same model — goal time is conservative vs current threshold data.');
    }
  }

  return lines.slice(0, 7);
}
