/**
 * Effort Score — what the phone still needs: the pace shape and the race-clock parser.
 *
 * ⛔ THE SCORE AND THE TRAINING PACES ARE COMPUTED ON THE SERVER (2026-09-10). This file held a full
 * phone copy of the VDOT and pace tables (`calculateEffortScore`, `getPacesFromScore` and friends), and
 * the phone derived and saved the athlete's `effort_*` columns with it. `save-baselines` now does that
 * with `supabase/functions/generate-run-plan/effort-score.ts`, the formula the plan builder uses; the
 * copy is deleted so there is one formula. Do not re-add score or pace maths here.
 */

export interface TrainingPaces {
  base: number;    // Easy pace (seconds per mile)
  race: number;    // Marathon pace (seconds per mile)
  steady: number;  // Threshold pace (seconds per mile)
  power: number;   // Interval pace (seconds per mile)
  speed: number;   // Repetition pace (seconds per mile)
}

export type RaceDistance = '5k' | '10k' | 'half' | 'marathon';

/**
 * Parse time string to seconds
 * - For 5K/10K: MM:SS format (e.g., "22:00" = 22 minutes)
 * - For Half/Marathon: H:MM or H:MM:SS format (e.g., "3:55" = 3 hours 55 minutes)
 */
export function parseTimeToSeconds(timeStr: string, distance?: RaceDistance): number | null {
  const parts = timeStr.split(':').map(p => parseInt(p, 10));

  if (parts.some(isNaN)) return null;

  if (parts.length === 2) {
    // Two-part time: could be MM:SS or H:MM depending on context
    if (distance === 'marathon' || distance === 'half') {
      // For marathon/half, interpret as H:MM (hours:minutes)
      return parts[0] * 3600 + parts[1] * 60;
    } else {
      // For 5K/10K, interpret as MM:SS (minutes:seconds)
      return parts[0] * 60 + parts[1];
    }
  } else if (parts.length === 3) {
    // Three-part time: always HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}
