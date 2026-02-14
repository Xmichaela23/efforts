import type { CyclingFactPacketV1, CyclingFlagV1 } from './types.ts';

export function generateCyclingFlagsV1(packet: CyclingFactPacketV1, trainingLoad: any | null): CyclingFlagV1[] {
  const flags: CyclingFlagV1[] = [];

  // Priority 1: Plan vs execution mismatch (when planned intent exists)
  try {
    const plan = packet.facts.plan_intent;
    const exec = packet.derived.executed_intensity;
    if (plan && plan !== 'unknown') {
      if (plan === 'recovery' && exec === 'hard') {
        flags.push({
          type: 'concern',
          category: 'Recovery Integrity',
          message: 'Ride intensity ran hard relative to recovery intent — treat this as stress, not recovery.',
          priority: 1,
        });
      } else if (plan === 'recovery' && exec === 'moderate') {
        flags.push({
          type: 'neutral',
          category: 'Recovery Integrity',
          message: 'Recovery ride trended moderate — still fine, but keep most time truly easy when recovery is the goal.',
          priority: 2,
        });
      }
    }
  } catch {}

  // Priority 1/2: Fatigue context (cross-discipline)
  try {
    const tl = trainingLoad;
    const cf = String(tl?.cumulative_fatigue || '').toLowerCase();
    const ev = Array.isArray(tl?.fatigue_evidence) ? tl.fatigue_evidence : [];
    if (cf === 'high') {
      flags.push({
        type: 'concern',
        category: 'Fatigue',
        message: `Accumulated fatigue is elevated (${ev.slice(0, 2).join(' — ') || 'recent load is high'}).`,
        priority: 1,
      });
    } else if (cf === 'moderate') {
      flags.push({
        type: 'neutral',
        category: 'Fatigue',
        message: `Moderate fatigue context (${ev.slice(0, 2).join(' — ') || 'recent load is elevated'}).`,
        priority: 2,
      });
    }
  } catch {}

  // FTP quality note
  try {
    if (packet.derived.ftp_quality === 'missing') {
      flags.push({
        type: 'neutral',
        category: 'Data Quality',
        message: 'FTP is missing — intensity interpretation is conservative and based on power distribution.',
        priority: 3,
      });
    }
  } catch {}

  // If nothing, add a benign anchor
  if (!flags.length) {
    flags.push({
      type: 'neutral',
      category: 'Execution',
      message: 'Ride summary is based on power/HR distribution and recent training context.',
      priority: 3,
    });
  }

  // Sort and return top few
  flags.sort((a, b) => Number(a.priority) - Number(b.priority));
  return flags.slice(0, 5);
}

