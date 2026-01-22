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
  // If GPS track or steps exist, we intentionally skip heavy computation here
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
