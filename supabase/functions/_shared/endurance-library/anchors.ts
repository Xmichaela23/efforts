// ============================================================================
// THE ANCHORS — the athlete's own numbers, read through the resolvers that already own them.
//
// ⛔ NOT A NEW RESOLVER. Every fact here has an owner already, and this file calls it:
//
//   run threshold pace   `src/lib/resolve-current-run-pace.ts`  resolveCurrentRunThresholdPace
//   run VT1 / easy pace  `src/lib/resolve-current-run-pace.ts`  resolveCurrentRunEasyPace
//   FTP                  `src/lib/resolve-current-ftp.ts`       resolveCurrentFtp
//   swim pace            `_shared/planning-context.ts`          swimSecPer100YdFromArcSwimInputs
//
// A second copy of "which threshold counts" is exactly how those facts fractured the first time —
// `resolve-current-run-pace.ts`'s own header lists eight ad-hoc chains that disagreed. This library
// adds a ninth reader, not a ninth answer.
//
// ⛔ NO NUMBER IS INVENTED WHEN A RESOLVER SAYS IT DOES NOT KNOW. `value: null` travels forward and
// the session is built with the intensity unresolved and the reason attached. Never 540. Never 600.
// ============================================================================

import { resolveCurrentFtp } from '../../../../src/lib/resolve-current-ftp.ts';
import {
  resolveCurrentRunEasyPace,
  resolveCurrentRunThresholdPace,
} from '../../../../src/lib/resolve-current-run-pace.ts';
import { swimSecPer100YdFromArcSwimInputs } from '../planning-context.ts';
import type { AnchorReport, Sport } from './types.ts';

/**
 * The baselines shape every resolver above already accepts. Deliberately permissive and deliberately
 * NOT re-typed field by field — the resolvers own their own input contracts.
 */
export type EnduranceBaselines = {
  learned_fitness?: Record<string, unknown> | null;
  performance_numbers?: Record<string, unknown> | null;
  effort_paces?: Record<string, unknown> | null;
  units?: string | null;
} | null | undefined;

export type EnduranceAnchors = {
  run: AnchorReport;
  ride: AnchorReport;
  swim: AnchorReport;
};

/** 100 yards is 91.44 metres. The conversion lives once, here. */
const YD100_TO_M100 = 100 / 91.44;

/**
 * ⛔ VT1 RESOLVES TO THE ATHLETE'S MEASURED EASY PACE, AND THAT IS SOURCED RATHER THAN CHOSEN.
 * Ch.4's zone table (B4 of the corpus) puts the top of zone 2 AT VT1, by the talk test — and easy
 * pace is this app's zone 2. p235 adds that the exact percentage of threshold at VT1 moves with
 * fatigue, hydration and conditions, which is why it is read from the athlete's own runs rather
 * than computed as a fraction of anything.
 */
export function resolveEnduranceAnchors(baselines: EnduranceBaselines): EnduranceAnchors {
  const runThreshold = resolveCurrentRunThresholdPace(baselines as never);
  const runEasy = resolveCurrentRunEasyPace(baselines as never);
  const ftp = resolveCurrentFtp(baselines as never);

  const swimYd = swimSecPer100YdFromArcSwimInputs({
    performance_numbers: (baselines?.performance_numbers ?? null) as Record<string, unknown> | null,
    learned_fitness: (baselines?.learned_fitness ?? null) as Record<string, unknown> | null,
    units: baselines?.units ?? null,
  });

  return {
    run: {
      sport: 'run',
      value: runThreshold.sec_per_mi,
      unit: 'sec_per_mi',
      source: runThreshold.source,
      isEstimate: runThreshold.is_estimate,
      vt1SecPerMi: runEasy.sec_per_mi,
    },
    ride: {
      sport: 'ride',
      value: ftp.value,
      unit: 'watts',
      source: ftp.source,
      // ⚠️ `resolveCurrentFtp` has no is_estimate field; its `learned-low` tier is the one that is
      // thin rather than derived, and that is what is reported here. Nothing new is asserted.
      isEstimate: ftp.source === 'learned-low',
    },
    swim: {
      sport: 'swim',
      value: swimYd == null ? null : Math.round(swimYd * YD100_TO_M100),
      unit: 'sec_per_100m',
      // The swim resolver returns a bare number with no provenance. Saying 'resolved' rather than
      // inventing a tier name is the honest report; when that resolver grows a source, this reads it.
      source: swimYd == null ? null : 'resolved',
      isEstimate: false,
    },
  };
}

export function anchorFor(anchors: EnduranceAnchors, sport: Sport): AnchorReport {
  return sport === 'run' ? anchors.run : sport === 'ride' ? anchors.ride : anchors.swim;
}

/** An anchors object with nothing in it — for callers previewing a plan before baselines exist. */
export const UNKNOWN_ANCHORS: EnduranceAnchors = {
  run: { sport: 'run', value: null, unit: 'sec_per_mi', source: null, isEstimate: false, vt1SecPerMi: null },
  ride: { sport: 'ride', value: null, unit: 'watts', source: null, isEstimate: false },
  swim: { sport: 'swim', value: null, unit: 'sec_per_100m', source: null, isEstimate: false },
};
