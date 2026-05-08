/**
 * Parse `steps_preset` swim DSL tokens for weekly summaries and yard totals.
 * Keeps token order aligned with materialize-plan / session-factory naming.
 */

export type SwimTokenBuckets = {
  wu: string | null;
  cd: string | null;
  drills: string[];
  pulls: string[];
  kicks: string[];
  aerobics: string[];
};

const toYd = (n: number, unit: string) => (unit.toLowerCase() === 'm' ? Math.round(n / 0.9144) : n);

/** Sum yards from tokens (warmup, drills, pull/kick, aerobic including CSS, threshold, etc.). */
export function sumSwimYardsFromStepsPresetTokens(tokens: string[] | undefined | null): number {
  if (!Array.isArray(tokens) || !tokens.length) return 0;
  let sum = 0;
  for (const raw of tokens) {
    const s = String(raw).toLowerCase();
    let m: RegExpMatchArray | null;
    m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10), m[2]);
      continue;
    }
    m = s.match(/swim_drill_[a-z0-9_]+_(\d+)x(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
    m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
    m = s.match(/swim_(?:pull|kick)_(\d+)x(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
    m = s.match(/swim_aerobic_css_(\d+)x(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
    m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
    m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
    m = s.match(/swim_interval_(\d+)x(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
    m = s.match(/swim_speed_(\d+)x(\d+)(yd|m)/i);
    if (m) {
      sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]);
      continue;
    }
  }
  return sum;
}

/**
 * Compact distance for calendar chips — respects pool_unit then athlete units (planned row fields).
 */
export function formatPlannedSwimDistanceChip(workout: {
  type?: string;
  units?: string | null;
  pool_unit?: string | null;
  steps_preset?: string[] | null;
  computed?: { steps?: Array<{ distanceMeters?: number }> | null } | null;
  name?: string | null;
}): string | null {
  const type = String(workout?.type ?? '').toLowerCase();
  if (type !== 'swim') return null;

  const poolUnit = String(workout?.pool_unit || '').toLowerCase();
  const userUnits = String(workout?.units || '').toLowerCase();
  const preferMetric =
    poolUnit === 'm' || (poolUnit !== 'yd' && !poolUnit && userUnits === 'metric');

  let metersTotal = 0;
  const steps = Array.isArray(workout?.computed?.steps) ? workout!.computed!.steps! : [];
  for (const st of steps) {
    const d = Number((st as { distanceMeters?: number })?.distanceMeters);
    if (Number.isFinite(d) && d > 0) metersTotal += d;
  }

  if (metersTotal > 0) {
    if (preferMetric) return `${Math.round(metersTotal)} m`;
    return `${Math.round(metersTotal / 0.9144)} yd`;
  }

  const toks = Array.isArray(workout?.steps_preset) ? workout.steps_preset : [];
  const yardsFromTokens = sumSwimYardsFromStepsPresetTokens(toks);
  if (yardsFromTokens > 0) {
    if (preferMetric) return `${Math.round(yardsFromTokens * 0.9144)} m`;
    return `${yardsFromTokens} yd`;
  }

  const name = String(workout?.name || '');
  const ydm = name.match(/(\d[\d,]*)\s*yd\b/i);
  if (ydm) {
    const yd = parseInt(ydm[1].replace(/,/g, ''), 10);
    if (Number.isFinite(yd) && yd > 0) {
      if (preferMetric) return `${Math.round(yd * 0.9144)} m`;
      return `${yd} yd`;
    }
  }
  const mm = name.match(/(\d[\d,]*)\s*m\b/i);
  if (mm && preferMetric) {
    const m = parseInt(mm[1].replace(/,/g, ''), 10);
    if (Number.isFinite(m) && m > 0) return `${m} m`;
  }

  return null;
}

export function categorizeSwimTokensForDisplay(tokens: string[]): SwimTokenBuckets {
  const drills: string[] = [];
  const pulls: string[] = [];
  const kicks: string[] = [];
  const aerobics: string[] = [];
  let wu: string | null = null;
  let cd: string | null = null;

  for (const raw of tokens) {
    const s = String(raw).toLowerCase();
    let m: RegExpMatchArray | null;
    m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
    if (m) {
      const txt = `${parseInt(m[1], 10)} ${m[2].toLowerCase()}`;
      if (/warmup/i.test(s)) wu = `WU ${txt}`;
      else cd = `CD ${txt}`;
      continue;
    }
    m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
    if (m) {
      const name = m[1].replace(/_/g, ' ');
      const reps = parseInt(m[2], 10);
      const dist = parseInt(m[3], 10);
      const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : '';
      drills.push(`${name} ${reps}x${dist}${r}`);
      continue;
    }
    m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const dist = parseInt(m[2], 10);
      const name = m[4].replace(/_/g, ' ');
      drills.push(`${name} ${reps}x${dist}`);
      continue;
    }
    m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
    if (m) {
      const reps = parseInt(m[2], 10);
      const dist = parseInt(m[3], 10);
      const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : '';
      (m[1] === 'pull' ? pulls : kicks).push(`${reps}x${dist}${r}`);
      continue;
    }
    m = s.match(/swim_aerobic_css_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const dist = parseInt(m[2], 10);
      const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : '';
      aerobics.push(`CSS ${reps}x${dist}${r}`);
      continue;
    }
    m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const dist = parseInt(m[2], 10);
      const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : '';
      aerobics.push(`${reps}x${dist}${r}`);
      continue;
    }
    m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const dist = parseInt(m[2], 10);
      const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : '';
      aerobics.push(`threshold ${reps}x${dist}${r}`);
      continue;
    }
    m = s.match(/swim_interval_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const dist = parseInt(m[2], 10);
      const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : '';
      aerobics.push(`interval ${reps}x${dist}${r}`);
      continue;
    }
    m = s.match(/swim_speed_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
    if (m) {
      const reps = parseInt(m[1], 10);
      const dist = parseInt(m[2], 10);
      const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : '';
      aerobics.push(`speed ${reps}x${dist}${r}`);
      continue;
    }
  }

  return { wu, cd, drills, pulls, kicks, aerobics };
}

/** PlannedWorkoutSummary style — bullet-ish segments joined with middle dot. */
export function formatSwimSubtitleFromBuckets(b: SwimTokenBuckets, sep = ' • '): string | undefined {
  const parts: string[] = [];
  if (b.wu) parts.push(b.wu);
  if (b.drills.length) parts.push(`Drills: ${Array.from(new Set(b.drills)).join(', ')}`);
  if (b.pulls.length) parts.push(`Pull ${Array.from(new Set(b.pulls)).join(', ')}`);
  if (b.kicks.length) parts.push(`Kick ${Array.from(new Set(b.kicks)).join(', ')}`);
  if (b.aerobics.length) parts.push(`Aerobic ${Array.from(new Set(b.aerobics)).join(', ')}`);
  if (b.cd) parts.push(b.cd);
  return parts.length ? parts.join(sep) : undefined;
}
