/**
 * ARCHIVED: Muji-inspired Earthy Tone Color Palette
 * 
 * This color scheme was replaced by the glassmorphism theme colors.
 * Archived on: 2026-01-11
 * 
 * The glassmorphism theme uses:
 * - Run: #14b8a6 (teal-500)
 * - Ride: #22c55e (green-500)
 * - Swim: #3b82f6 (blue-500)
 * - Strength: #f97316 (orange-500)
 * - Mobility/Pilates: #a855f7 (purple-500)
 * 
 * See: src/lib/context-utils.ts for current color definitions
 */

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
