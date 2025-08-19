import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Global discipline color helpers
export type Discipline = 'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'bike';

export const disciplineHex: Record<string, string> = {
  run: '#FF7F11',       // orange
  ride: '#FFD60A',      // yellow-gold
  bike: '#FFD60A',      // alias
  swim: '#00B4D8',      // aqua
  strength: '#2E2E2E',  // charcoal
  walk: '#FF7F11',      // map walk to run color
};

export function getDisciplineColor(type: string): string {
  const key = (type || '').toLowerCase();
  return disciplineHex[key] || '#2E2E2E';
}
