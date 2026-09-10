/**
 * ⛔ A PLANNED SWIM'S SUBTITLE AND DISTANCE, WRITTEN BY THE SERVER (2026-09-10, audit H-T18 / H-T20).
 *
 * The phone parsed `steps_preset` for both on every render (`src/utils/swimPlanTokens.ts`), and its
 * distance chip had three rungs — token yards, else a number in the name, else the steps' metres
 * summed — which its own comment recorded disagreeing ("1099 yd"). `materialize-plan` now writes
 * `friendly_summary` from the bucket line below and `computed.swim_distance` from a tally it keeps
 * while it expands the same tokens into steps, so the distance is the steps it wrote and nothing else.
 *
 * ⚠️ THE BUCKET FUNCTIONS ARE MOVED WORD FOR WORD from `swimPlanTokens.ts`. No new words.
 */

export type SwimTokenBuckets = {
  wu: string | null;
  cd: string | null;
  drills: string[];
  pulls: string[];
  kicks: string[];
  aerobics: string[];
};

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
      aerobics.push(`${reps}x${dist}${r}`);
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

/** Bullet-ish segments joined with a middle dot — the planned subtitle line. */
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

/** Distance the expander wrote, kept in the unit each token was authored in. */
export type SwimDistanceTally = { yd: number; m: number };

export type PlannedSwimDistance = { distance: number; unit: 'yd' | 'm'; label: string };

/** One international yard is exactly 0.9144 m (by definition, 1959). Not a tuning number. */
const M_PER_YD = 0.9144;

/**
 * The planned swim's total, in the unit the athlete swims in. The unit rule is the phone chip's,
 * moved: the row's pool unit when set; with none, metres for a metric athlete; otherwise yards.
 * A tally with no distance (an open-water swim prescribed in time) returns null and prints nothing.
 */
export function plannedSwimDistance(
  tally: SwimDistanceTally | null | undefined,
  poolUnit: string | null | undefined,
  units: string | null | undefined,
): PlannedSwimDistance | null {
  const yd = Number(tally?.yd) || 0;
  const m = Number(tally?.m) || 0;
  if (!(yd > 0 || m > 0)) return null;
  const pool = String(poolUnit || '').toLowerCase();
  const preferMetric = pool === 'm' || (pool !== 'yd' && String(units || '').toLowerCase() === 'metric');
  if (preferMetric) {
    const distance = Math.round(yd * M_PER_YD) + Math.round(m);
    return { distance, unit: 'm', label: `${distance} m` };
  }
  const distance = Math.round(yd) + Math.round(m / M_PER_YD);
  return { distance, unit: 'yd', label: `${distance} yd` };
}
