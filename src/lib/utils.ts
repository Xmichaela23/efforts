import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Global discipline color helpers
export type Discipline = 'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'bike' | 'pilates_yoga';

// NOTE: Muji-inspired earthy color palette has been archived
// See: archive/muji-inspired-colors-archived.ts
// Current colors use glassmorphism theme (see: src/lib/context-utils.ts)

// =============================================================================
// COLOR UTILITIES - Re-exported from context-utils.ts for backward compatibility
// =============================================================================
// All color functions are now centralized in context-utils.ts
// These re-exports maintain backward compatibility with existing code
// New code should import directly from '@/lib/context-utils'

export {
  getDisciplineColor,
  getDisciplinePillClasses,
  getDisciplineCheckmarkColor,
  getDisciplineColorRgb,
  getDisciplineTextClassVariant,
  getDisciplineBorderClass,
  getDisciplineBgClassVariant,
  hexToRgb,
} from './context-utils';

// Time and pace formatting utilities
export function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatPace(secondsPerMile: number): string {
  if (!secondsPerMile || secondsPerMile <= 0) return '0:00/mi';
  const mins = Math.floor(secondsPerMile / 60);
  const secs = Math.round(secondsPerMile % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
}

// Distance normalization used by Today and Calendar chips
const KM_TO_MILES = 0.621371;

export function normalizeDistanceKm(workout: any): number | null {
  if (!workout) return null;
  if (typeof workout.distance_km === 'number') return workout.distance_km;
  if (typeof workout.distance_m === 'number') return workout.distance_m / 1000;
  if (typeof workout.distance === 'number') return workout.distance; // assume km
  const cm = workout?.computed?.overall?.distance_m ?? workout?.executed?.overall?.distance_m;
  if (typeof cm === 'number' && isFinite(cm)) return cm / 1000;
  return null;
}

export function normalizeDistanceMiles(workout: any): number | null {
  const km = normalizeDistanceKm(workout);
  return km == null ? null : km * KM_TO_MILES;
}

export function formatMilesShort(miles: number | null, digits: number = 1): string {
  if (miles == null || !isFinite(miles)) return '';
  const factor = Math.pow(10, digits);
  const rounded = Math.round(miles * factor) / factor;
  return `${rounded.toFixed(digits)}m`;
}

export function typeAbbrev(typeLike: string | undefined, workout?: any): string {
  const t = (typeLike || '').toLowerCase();
  // ⛔ BEFORE THE STRENGTH BRANCH, because the plyo day IS `type: 'strength'` on the wire and would
  // otherwise abbreviate to `ST`. See `isPlyoSession` — the tag decides, never the name.
  if (workout && isPlyoSession(workout)) return 'PLYO';
  if (t.includes('run')) return 'RN';
  if (t.includes('ride') || t.includes('bike') || t === 'cycling') return 'BK';
  if (t.includes('swim')) return 'SW';
  if (t.includes('strength')) return 'ST';
  if (t.includes('mobility')) return 'MBL';
  if (t.includes('pilates') || t.includes('yoga') || t === 'pilates_yoga') {
    // For pilates_yoga, check session_type to return PLT or YGO
    if (workout) {
      const metadata = workout.workout_metadata || {};
      const sessionType = metadata.session_type;
      if (sessionType) {
        if (sessionType.startsWith('pilates_')) return 'PLT';
        if (sessionType.startsWith('yoga_')) return 'YGO';
      }
      // Fallback: infer from name/description
      const nameLower = String(workout.name || '').toLowerCase();
      const descLower = String(workout.description || '').toLowerCase();
      const combined = nameLower + ' ' + descLower;
      if (/pilates/i.test(combined)) return 'PLT';
      if (/yoga/i.test(combined)) return 'YGO';
    }
    return 'PY'; // Generic fallback
  }
  if (t.includes('walk')) return 'WK';
  return 'WO';
}

/**
 * ⛔ THE TAG LIST, HOWEVER IT ARRIVED. `planned_workouts.tags` comes back as a real array from the
 * client's own writes and as a JSON string from some plan materialisations, and three call sites in
 * this repo had each grown their own copy of that branch. One reader.
 */
export function readWorkoutTags(workout?: { tags?: unknown } | null): string[] {
  const raw = workout?.tags;
  let tags: unknown[] = [];
  if (Array.isArray(raw)) tags = raw;
  else if (typeof raw === 'string') { try { const p: unknown = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch { /* not JSON */ } }
  return tags.map((t) => String(t).toLowerCase());
}

/**
 * ⛔ IS THIS THE PLYOMETRIC DRILL DAY? THE TAG DECIDES, NEVER THE NAME OR THE TYPE.
 *
 * `standing-plan/compose.ts` `plyoSession` emits the frame's plyo day as `type: 'strength'` with
 * `tags: ['standing_plan', 'plyo']` and no barbell in it — so on `type` alone it is indistinguishable
 * from a lifting day, which is exactly how the calendar came to show a four-lift week as five
 * orange STG chips.
 *
 * ⚠️ THE TAG, NOT THE NAME. `lifting-commitment.ts` and `WeekGrid.tsx` both already exclude this
 * session by its tag and both carry the same warning: the name is a display string and matching on
 * one is what the label renames had to unpick twice.
 * ⚠️ DISPLAY ONLY. Nothing that reasons about the session — load, dosing, the reconciler — reads
 * this; it is still a strength row everywhere upstream of a pixel.
 */
export function isPlyoSession(workout?: { tags?: unknown } | null): boolean {
  if (!workout) return false;
  return readWorkoutTags(workout).includes('plyo');
}

/**
 * ⛔ WHICH COLOUR AND WHICH ICON THIS SESSION WEARS — the one seam between "what it is on the wire"
 * and "what an athlete sees". Returns a `SPORT_COLORS` key.
 *
 * ⚠️ IT DERIVES NOTHING ELSE. A caller wanting the session's actual discipline must read `type`;
 * this answers only the display question, and `plyo` is the single case where the two differ.
 */
export function displayDisciplineOf(
  workout?: { type?: unknown; workout_type?: unknown; tags?: unknown } | null,
): string {
  if (isPlyoSession(workout)) return 'plyo';
  return String(workout?.type || workout?.workout_type || '').toLowerCase();
}

/**
 * Detect a strength baseline / 1RM test workout (planned or completed).
 * A test is measurement, not training, and should display as its own class (Q-097/Q-102).
 * Marker: the `1rm_test` tag OR a name containing "baseline test" (mirrors StrengthLogger's
 * `isBaselineTestWorkout`). `tags` may arrive as an array or a JSON string.
 */
export function isBaselineTestWorkout(workout?: { name?: any; tags?: any; workout_structure?: any } | null): boolean {
  if (!workout) return false;
  const name = String(
    workout.name || (workout as any)?.workout_structure?.title || ''
  ).toLowerCase();
  if (name.includes('baseline test')) return true;
  let tags: any[] = [];
  const raw = (workout as any).tags;
  if (Array.isArray(raw)) tags = raw;
  else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch { /* not JSON */ } }
  return tags.map((t) => String(t).toLowerCase()).includes('1rm_test');
}
