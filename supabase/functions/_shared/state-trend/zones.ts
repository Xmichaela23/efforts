// resolveZoneBand — the SEAM for personal zones (SPEC-personal-zones-outlier-detection.md).
// The bike slice's HR-at-power reference band reads from HERE, never an inline FTP %. Today it
// returns the Coggan population default (Z2 = 56–75% FTP); the day an athlete has tested/entered
// personal zones, this returns those and NOTHING downstream changes. Same resolve-pattern as the
// spine's resolveThresholds: don't hardcode a formula, resolve a per-athlete input.

export interface AthleteZoneInputs {
  ftp?: number | null;
  /** Per-sport tested/entered bands (the future personal-zones feature writes here). */
  personalZones?: Record<string, { lo: number; hi: number }> | null;
}

export interface ZoneBand {
  lo: number;
  hi: number;
  /** Honesty label (the spec's core principle): is this the athlete's real zones or the averaged guess? */
  source: 'personal' | 'coggan_ftp' | 'none';
}

// Coggan Z2 power band (population default) for the HR-at-power reference. WIDE is the coverage
// fallback when too few rides land enough time in the narrow band (build-time check).
const COGGAN_Z2 = { lo: 0.56, hi: 0.75 };
const COGGAN_Z2_WIDE = { lo: 0.56, hi: 0.85 };

/**
 * Resolve the reference power band for an athlete + sport. PERSONAL zones win (the athlete's
 * own truth); else the Coggan population default from FTP; else none (→ efficiency = needs_data,
 * honest). `wide` widens the Coggan default for coverage. Returns the band + an honesty `source`.
 */
export function resolveZoneBand(
  athlete: AthleteZoneInputs,
  sport: string,
  opts?: { wide?: boolean },
): ZoneBand {
  const personal = athlete.personalZones?.[sport];
  if (personal && Number(personal.lo) > 0 && Number(personal.hi) > Number(personal.lo)) {
    return { lo: Math.round(personal.lo), hi: Math.round(personal.hi), source: 'personal' };
  }
  const ftp = Number(athlete.ftp);
  if (Number.isFinite(ftp) && ftp > 0) {
    const z = opts?.wide ? COGGAN_Z2_WIDE : COGGAN_Z2;
    return { lo: Math.round(ftp * z.lo), hi: Math.round(ftp * z.hi), source: 'coggan_ftp' };
  }
  return { lo: 0, hi: 0, source: 'none' };
}
