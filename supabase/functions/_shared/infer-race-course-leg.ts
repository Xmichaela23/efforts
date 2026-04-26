/** GPX / course upload: infer discipline leg from name + original file name. */

export type RaceCourseLeg = 'swim' | 'bike' | 'run' | 'full';

const SWIM = /\b(swim|swimming|open\s*water|ow|ocean|bay|reservoir)\b/i;
const BIKE = /\b(bike|bicycle|cycle|cycling|ride|rolling)\b/i;
const RUN = /\b(run|running|jog|marathon|half|10k|5k|5\s*k|10\s*mile|13\.1|26\.2)\b/i;

export function normalizeRaceCourseLeg(raw: string | null | undefined): RaceCourseLeg | null {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'swim' || s === 'bike' || s === 'run' || s === 'full') return s;
  return null;
}

/** Combine course label + server filename to infer tri leg; default `full` for run races / ambiguous. */
export function inferRaceCourseLeg(courseName: string, fileName?: string | null): RaceCourseLeg {
  const a = [courseName, fileName || ''].join(' ');
  if (SWIM.test(a) && !BIKE.test(a) && !RUN.test(a)) return 'swim';
  if (BIKE.test(a) && !RUN.test(a) && !SWIM.test(a)) return 'bike';
  if (RUN.test(a) && !BIKE.test(a) && !SWIM.test(a)) return 'run';
  if (SWIM.test(a) && BIKE.test(a)) {
    if (a.search(SWIM) < a.search(BIKE)) return 'swim';
    return 'bike';
  }
  if (BIKE.test(a) && RUN.test(a)) {
    if (a.search(RUN) < a.search(BIKE)) return 'run';
    return 'bike';
  }
  if (SWIM.test(a)) return 'swim';
  if (BIKE.test(a)) return 'bike';
  if (RUN.test(a)) return 'run';
  return 'full';
}
