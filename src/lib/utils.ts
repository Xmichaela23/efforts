import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Global discipline color helpers
export type Discipline = 'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'bike' | 'pilates_yoga';

// Primary discipline colors - Muji-inspired earthy tones
export const disciplineHex: Record<string, string> = {
  run: '#C9922E',       // warm ochre/mustard
  ride: '#C65D3B',      // terracotta
  bike: '#C65D3B',      // alias
  swim: '#2B5A8C',      // deep indigo
  strength: '#5A7D5A',  // sage green
  walk: '#C9922E',      // map walk to run color
  pilates_yoga: '#B07070', // dusty rose
};

// Light background colors for pills/cards (brighter -100 variants)
export const disciplineBgLight: Record<string, string> = {
  run: '#FEF08A',       // yellow-200
  ride: '#FED7AA',      // orange-200
  bike: '#FED7AA',      // alias
  swim: '#BAE6FD',      // sky-200
  strength: '#DDD6FE',  // violet-200
  walk: '#FEF08A',      // map walk to run
  pilates_yoga: '#FBCFE8', // pink-200
};

// Border colors (more saturated -400 variants)
export const disciplineBorder: Record<string, string> = {
  run: '#FACC15',       // yellow-400
  ride: '#FB923C',      // orange-400
  bike: '#FB923C',      // alias
  swim: '#38BDF8',      // sky-400
  strength: '#A78BFA',  // violet-400
  walk: '#FACC15',      // map walk to run
  pilates_yoga: '#F472B6', // pink-400
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
  
  // Completed workouts: gradient fade from green to gray
  if (isCompleted) {
    return 'bg-gradient-to-r from-green-100 to-gray-50 border border-gray-200 text-gray-600 hover:from-green-200 hover:to-gray-100';
  }
  
  // Muji minimal: neutral base with earthy colored left accent (4px)
  switch (key) {
    case 'run':
    case 'walk':
      return 'bg-gray-50 border border-gray-200 border-l-4 border-l-[#C9922E] text-gray-700 hover:bg-gray-100';
    case 'ride':
    case 'bike':
      return 'bg-gray-50 border border-gray-200 border-l-4 border-l-[#C65D3B] text-gray-700 hover:bg-gray-100';
    case 'swim':
      return 'bg-gray-50 border border-gray-200 border-l-4 border-l-[#2B5A8C] text-gray-700 hover:bg-gray-100';
    case 'strength':
      return 'bg-gray-50 border border-gray-200 border-l-4 border-l-[#5A7D5A] text-gray-700 hover:bg-gray-100';
    case 'pilates_yoga':
      return 'bg-gray-50 border border-gray-200 border-l-4 border-l-[#B07070] text-gray-700 hover:bg-gray-100';
    default:
      return 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100';
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
