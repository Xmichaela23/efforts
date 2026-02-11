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

  // Pacing: easy portion aligned with baseline (if present as a bullet already) isn't in packet yet.
  // For v1, emit plan pacing alignment/miss.
  try {
    if (work.length) {
      const maxMiss = Math.max(...work.map((s) => Math.abs(coerceNumber(s.pace_deviation_sec) || 0)));
      if (maxMiss <= 15) {
        push(flags, { type: 'positive', category: 'pacing', message: 'Work segments were on target (±15s/mi).', priority: 3 });
      } else if (maxMiss >= 60) {
        push(flags, { type: 'neutral', category: 'pacing', message: 'One or more segments were ≥1:00/mi off target.', priority: 2 });
      }
    }
  } catch {}

  // HR drift vs typical
  try {
    const drift = coerceNumber(packet.derived.hr_drift_bpm);
    const typ = coerceNumber(packet.derived.hr_drift_typical);
    if (drift != null && typ != null && typ > 0) {
      const delta = drift - typ;
      if (delta <= -3) {
        push(flags, { type: 'positive', category: 'hr', message: `HR drift ${Math.round(drift)} bpm vs typical ~${Math.round(typ)} bpm — better than usual.`, priority: 2 });
      } else if (delta >= 5) {
        push(flags, { type: 'concern', category: 'hr', message: `HR drift ${Math.round(drift)} bpm vs typical ~${Math.round(typ)} bpm — elevated.`, priority: 1 });
      } else {
        push(flags, { type: 'neutral', category: 'hr', message: `HR drift ${Math.round(drift)} bpm vs typical ~${Math.round(typ)} bpm.`, priority: 3 });
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

  // Fatigue / load flags
  try {
    const tl = packet.derived.training_load;
    if (tl) {
      if (tl.acwr_ratio != null && tl.acwr_ratio > 1.3) {
        push(flags, { type: 'concern', category: 'fatigue', message: `ACWR ${tl.acwr_ratio.toFixed(2)} (elevated) — higher-than-normal training stress.`, priority: 1 });
      } else if (tl.acwr_ratio != null && tl.acwr_ratio > 1.1) {
        push(flags, { type: 'neutral', category: 'fatigue', message: `ACWR ${tl.acwr_ratio.toFixed(2)} — training load is trending up.`, priority: 3 });
      }
      if (tl.week_load_pct != null && tl.week_load_pct > 120) {
        push(flags, { type: 'concern', category: 'fatigue', message: `Week at ${Math.round(tl.week_load_pct)}% of planned load — accumulated fatigue likely.`, priority: 1 });
      } else if (tl.previous_day_workload > 80) {
        push(flags, { type: 'neutral', category: 'fatigue', message: `Hard session yesterday (workload ${tl.previous_day_workload}).`, priority: 3 });
      }
    }
  } catch {}

  // Stimulus achieved
  try {
    const st = packet.derived.stimulus;
    if (st?.achieved) {
      push(flags, { type: 'positive', category: 'execution', message: `Training stimulus achieved — ${st.evidence?.[0] || 'HR/structure confirms the work was done'}.`, priority: 1 });
    } else {
      push(flags, { type: 'concern', category: 'execution', message: `Stimulus may have been missed — ${st?.partial_credit || 'targets/physiology did not align'}.`, priority: 1 });
    }
  } catch {}

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

