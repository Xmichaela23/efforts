import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Global discipline color helpers
export type Discipline = 'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'bike' | 'pilates_yoga';

// Primary discipline colors (for text, borders, accents)
export const disciplineHex: Record<string, string> = {
  run: '#3B82F6',       // blue-500
  ride: '#F97316',      // orange-500
  bike: '#F97316',      // alias
  swim: '#14B8A6',      // teal-500
  strength: '#8B5CF6',  // violet-500
  walk: '#3B82F6',      // map walk to run color
  pilates_yoga: '#EC4899', // pink-500
};

// Light background colors for pills/cards
export const disciplineBgLight: Record<string, string> = {
  run: '#DBEAFE',       // blue-100
  ride: '#FFEDD5',      // orange-100
  bike: '#FFEDD5',      // alias
  swim: '#CCFBF1',      // teal-100
  strength: '#EDE9FE',  // violet-100
  walk: '#DBEAFE',      // map walk to run
  pilates_yoga: '#FCE7F3', // pink-100
};

// Border colors (slightly darker than bg)
export const disciplineBorder: Record<string, string> = {
  run: '#93C5FD',       // blue-300
  ride: '#FDBA74',      // orange-300
  bike: '#FDBA74',      // alias
  swim: '#5EEAD4',      // teal-300
  strength: '#C4B5FD',  // violet-300
  walk: '#93C5FD',      // map walk to run
  pilates_yoga: '#F9A8D4', // pink-300
};

export function getDisciplineColor(type: string): string {
  const key = (type || '').toLowerCase();
  return disciplineHex[key] || '#6B7280'; // gray-500 fallback
}

export function getDisciplineBgLight(type: string): string {
  const key = (type || '').toLowerCase();
  return disciplineBgLight[key] || '#F3F4F6'; // gray-100 fallback
}

export function getDisciplineBorder(type: string): string {
  const key = (type || '').toLowerCase();
  return disciplineBorder[key] || '#D1D5DB'; // gray-300 fallback
}

// Get Tailwind classes for discipline-colored pills
export function getDisciplinePillClasses(type: string, isCompleted: boolean = false): string {
  const key = (type || '').toLowerCase();
  
  // Completed workouts get green styling
  if (isCompleted) {
    return 'bg-green-50 border-green-200 hover:bg-green-100';
  }
  
  // Discipline-specific colors
  switch (key) {
    case 'run':
    case 'walk':
      return 'bg-blue-50 border-blue-200 hover:bg-blue-100';
    case 'ride':
    case 'bike':
      return 'bg-orange-50 border-orange-200 hover:bg-orange-100';
    case 'swim':
      return 'bg-teal-50 border-teal-200 hover:bg-teal-100';
    case 'strength':
      return 'bg-violet-50 border-violet-200 hover:bg-violet-100';
    case 'pilates_yoga':
      return 'bg-pink-50 border-pink-200 hover:bg-pink-100';
    default:
      return 'bg-gray-100 border-gray-200 hover:bg-gray-200';
  }
}

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
