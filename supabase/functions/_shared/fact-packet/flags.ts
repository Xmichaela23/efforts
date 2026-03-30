import type { FactPacketV1, FlagV1, WeatherV1 } from './types.ts';
import { coerceNumber, estimatedHeatPaceImpact, secondsToPaceString } from './utils.ts';

function push(flags: FlagV1[], f: FlagV1) {
  if (!f.message) return;
  flags.push(f);
}

export function generateFlagsV1(packet: FactPacketV1): FlagV1[] {
  const flags: FlagV1[] = [];

  const segs = packet.facts.segments || [];
  const work = segs.filter((s) => s.target_pace_sec_per_mi != null && !/warm|cool/i.test(String(s.name || '')));

  const terrain = String(packet.facts.terrain_type || '').toLowerCase();

  // Pacing: easy portion aligned with baseline (if present as a bullet already) isn't in packet yet.
  // For v1, emit plan pacing alignment/miss.
  try {
    if (work.length) {
      const avgDev = (() => {
        const xs = work
          .map((s) => coerceNumber(s.pace_deviation_sec))
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        if (!xs.length) return null;
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      })();

      // Recovery integrity: materially faster than prescribed on easy/recovery intent
      try {
        const intent = String((packet as any)?.facts?.plan?.week_intent || '').toLowerCase();
        const workoutType = String(packet.facts.workout_type || '').toLowerCase();
        const isRecovery = intent === 'recovery' || workoutType.includes('recovery') || workoutType.includes('easy');
        if (isRecovery && avgDev != null && avgDev < -20) {
          // Only treat "too fast for recovery" as a concern when HR indicates intensity drifted above aerobic.
          // If HR stayed aerobic, faster-than-range can be terrain/fitness-driven rather than "too hard".
          const zones = work.map((s) => String(s.hr_zone || '')).filter(Boolean);
          const hasHighZone = zones.some((z) => /^z[3-5]$/i.test(z));
          if (hasHighZone) {
            push(flags, {
              type: 'concern',
              category: 'pacing',
              message: `Too fast for recovery: ~${Math.round(Math.abs(avgDev))}s/mi faster than the prescribed range with HR above aerobic.`,
              priority: 1,
            });
          } else {
            push(flags, {
              type: 'neutral',
              category: 'pacing',
              message: `Faster than the recovery range (~${Math.round(Math.abs(avgDev))}s/mi), but HR stayed aerobic — effort was controlled${terrain ? ` on ${terrain} terrain` : ''}.`,
              priority: 2,
            });
          }
        }
      } catch {}

      const maxMiss = Math.max(...work.map((s) => Math.abs(coerceNumber(s.pace_deviation_sec) || 0)));
      if (maxMiss <= 15) {
        push(flags, { type: 'positive', category: 'pacing', message: 'Work segments were on target (±15s/mi).', priority: 3 });
      } else if (maxMiss >= 60) {
        push(flags, { type: 'neutral', category: 'pacing', message: 'One or more segments were ≥1:00/mi off target.', priority: 2 });
      }
    }
  } catch {}

  // HR drift: use pace-normalized drift as the physiological signal.
  // Pace-driven HR increases (negative splits) are not drift and should not flag.
  try {
    const driftExplanation = (packet.derived as any).drift_explanation;
    const paceNorm = coerceNumber((packet.derived as any).pace_normalized_drift_bpm);
    const rawDrift = coerceNumber(packet.derived.hr_drift_bpm);
    const typ = coerceNumber(packet.derived.hr_drift_typical);
    const terrainContrib = coerceNumber(packet.derived.terrain_contribution_bpm);

    // Use pace-normalized drift as the signal when available, else fall back to raw
    const signal = paceNorm ?? rawDrift;

    if (driftExplanation === 'pace_driven') {
      // HR increase was entirely explained by the athlete running faster — not a concern
      if (rawDrift != null && Math.abs(rawDrift) >= 8) {
        push(flags, {
          type: 'neutral',
          category: 'hr',
          message: `HR rose ${Math.round(Math.abs(rawDrift))} bpm across the session — explained by negative-split pacing, not cardiovascular drift.`,
          priority: 3,
        });
      }
    } else if (driftExplanation === 'terrain_driven') {
      if (signal != null && Math.abs(signal) >= 3) {
        const contribNote = terrainContrib != null ? ` (~${Math.round(Math.abs(terrainContrib))} bpm from grade changes)` : '';
        push(flags, {
          type: 'neutral',
          category: 'hr',
          message: `HR drift ${Math.round(Math.abs(signal))} bpm is consistent with ${terrain || 'rolling'} terrain${contribNote} — not a fatigue signal.`,
          priority: 2,
        });
      }
    } else if (signal != null && (driftExplanation === 'cardiac_drift' || driftExplanation === 'mixed') && Math.abs(signal) >= 3) {
      const durMin = coerceNumber(packet.facts.total_duration_min) ?? 0;
      const expectedMax =
        durMin >= 150 ? 20 :
        durMin >= 90  ? 15 :
        durMin >= 60  ? 12 :
        8;
      const absSig = Math.round(Math.abs(signal));

      if (typ != null && typ > 0) {
        const delta = absSig - Math.abs(typ);
        if (delta <= -3) {
          push(flags, { type: 'positive', category: 'hr', message: `HR drift ${absSig} bpm vs typical ~${Math.round(Math.abs(typ))} bpm — better than usual.`, priority: 2 });
        } else if (delta >= 5 && absSig > expectedMax) {
          push(flags, { type: 'concern', category: 'hr', message: `HR drift ${absSig} bpm vs typical ~${Math.round(Math.abs(typ))} bpm — elevated.`, priority: 1 });
        } else {
          push(flags, { type: 'neutral', category: 'hr', message: `HR drift ${absSig} bpm vs typical ~${Math.round(Math.abs(typ))} bpm.`, priority: 3 });
        }
      } else if (absSig > expectedMax) {
        push(flags, { type: 'concern', category: 'hr', message: `HR drift ${absSig} bpm — above expected range for a ${Math.round(durMin)}-minute session.`, priority: 1 });
      } else {
        push(flags, { type: 'neutral', category: 'hr', message: `HR drift ${absSig} bpm — normal for a ${Math.round(durMin)}-minute session.`, priority: 3 });
      }
    }
  } catch {}

  // Heat stress (dew point)
  try {
    const wx = packet.facts.weather;
    if (wx && (wx.heat_stress_level === 'moderate' || wx.heat_stress_level === 'severe')) {
      const imp = estimatedHeatPaceImpact(wx.dew_point_f);
      push(flags, {
        type: 'neutral',
        category: 'weather',
        message: `Dew point ${wx.dew_point_f}°F (${wx.heat_stress_level}) — expect ~+${imp.minSeconds}-${imp.maxSeconds}s/mi in these conditions.`,
        priority: 2,
      });
    }
  } catch {}

  // Fatigue / load flags — SUPPRESSED until modality-specific load isolation exists.
  // Current ACWR and week_load_pct mix all modalities (cycling, strength, running)
  // into a single number, which produces misleading claims like "171% of planned load"
  // when the overage is an easy bike ride. Showing a number without context is dishonest.
  // TODO: re-enable when running-specific load can be isolated from cross-training.

  // Stimulus: not emitted as a flag — stimulus has its own coach signals row and summary bullet; flag was redundant.

  // Limiter
  try {
    const lim = packet.derived.primary_limiter;
    if (lim?.limiter) {
      push(flags, { type: 'neutral', category: 'limiter', message: `Primary limiter: ${lim.limiter} (${Math.round(lim.confidence * 100)}% confidence).`, priority: 2 });
    }
  } catch {}

  // Achievements
  try {
    for (const a of packet.derived.comparisons.achievements || []) {
      push(flags, { type: 'positive', category: 'achievement', message: a.description, priority: a.significance === 'major' ? 2 : 4 });
    }
  } catch {}

  // Sort by priority then stable
  flags.sort((a, b) => (a.priority - b.priority));
  // Cap to keep UI clean (AI can still read packet fields)
  return flags.slice(0, 12);
}

