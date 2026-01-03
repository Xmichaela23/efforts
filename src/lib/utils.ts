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

// Get Tailwind classes for discipline-colored pills (dark theme glassmorphism)
export function getDisciplinePillClasses(type: string, isCompleted: boolean = false): string {
  const t = (type || '').toLowerCase();
  
  // Run: Teal-500 (#14b8a6) - aqua-green
  if (t === 'run' || t === 'running') {
    return isCompleted
      ? 'bg-teal-500/20 border border-teal-500/30 text-teal-400 backdrop-blur-md hover:bg-teal-500/30'
      : 'bg-transparent border border-teal-500/50 text-white/90 hover:bg-teal-500/10';
  }
  // Ride/Cycling: Green-600 (#16a34a)
  if (t === 'ride' || t === 'cycling' || t === 'bike') {
    return isCompleted
      ? 'bg-green-600/20 border border-green-500/30 text-green-400 backdrop-blur-md hover:bg-green-600/30'
      : 'bg-transparent border border-green-500/50 text-white/90 hover:bg-green-500/10';
  }
  // Swim: Blue-600 (#2563eb) - true blue
  if (t === 'swim' || t === 'swimming') {
    return isCompleted
      ? 'bg-blue-600/20 border border-blue-500/30 text-blue-400 backdrop-blur-md hover:bg-blue-600/30'
      : 'bg-transparent border border-blue-500/50 text-white/90 hover:bg-blue-500/10';
  }
  // Strength: Orange-600 (#ea580c)
  if (t === 'strength' || t === 'weight' || t === 'weights') {
    return isCompleted
      ? 'bg-orange-600/20 border border-orange-500/30 text-orange-400 backdrop-blur-md hover:bg-orange-600/30'
      : 'bg-transparent border border-orange-500/50 text-white/90 hover:bg-orange-500/10';
  }
  // Mobility/Pilates/Yoga: Purple-600 (#9333ea)
  if (t === 'mobility' || t === 'pilates' || t === 'yoga' || t === 'stretch' || t === 'pilates_yoga') {
    return isCompleted
      ? 'bg-purple-600/20 border border-purple-500/30 text-purple-400 backdrop-blur-md hover:bg-purple-600/30'
      : 'bg-transparent border border-purple-500/50 text-white/90 hover:bg-purple-500/10';
  }
  // Default fallback: neutral
  return isCompleted
    ? 'bg-zinc-500/20 border border-zinc-400/30 text-white/80 backdrop-blur-md hover:bg-zinc-500/30'
    : 'bg-transparent border border-white/40 text-white/90 hover:bg-white/10';
}

// Get checkmark color based on discipline
export function getDisciplineCheckmarkColor(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'run' || t === 'running') return 'text-teal-500';
  if (t === 'ride' || t === 'cycling' || t === 'bike') return 'text-green-500';
  if (t === 'swim' || t === 'swimming') return 'text-blue-500';
  if (t === 'strength' || t === 'weight' || t === 'weights') return 'text-orange-500';
  if (t === 'mobility' || t === 'pilates' || t === 'yoga' || t === 'stretch' || t === 'pilates_yoga') return 'text-purple-500';
  return 'text-white';
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
