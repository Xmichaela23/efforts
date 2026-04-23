/**
 * Tri race distance → generate-triathlon-plan / create-goal-and-materialize key.
 * Labels from LLM arc_setup are often messy ("Ironman 70.3", "IM70.3") — be forgiving.
 */
const EXACT: Record<string, string> = {
  sprint: 'sprint',
  Sprint: 'sprint',
  olympic: 'olympic',
  Olympic: 'olympic',
  '70.3': '70.3',
  'Half-Iron': '70.3',
  'Half Iron': '70.3',
  'half-iron': '70.3',
  ironman: 'ironman',
  Ironman: 'ironman',
  Full: 'ironman',
  full: 'ironman',
};

/**
 * @returns 'sprint' | 'olympic' | '70.3' | 'ironman' | null
 */
export function triDistanceApiKey(distance: string | null | undefined): string | null {
  if (distance == null) return null;
  const raw = String(distance).trim();
  if (!raw) return null;
  if (EXACT[raw] != null) return EXACT[raw];
  const d = raw.toLowerCase();
  for (const [k, v] of Object.entries(EXACT)) {
    if (k.toLowerCase() === d) return v;
  }
  if (/\b70\.3\b/i.test(raw) || /half[- ]?iron/i.test(d)) return '70.3';
  if (d.includes('ironman') && /\b70\.3\b/i.test(raw)) return '70.3';
  if (/\b140\.6\b/i.test(raw) || (d === 'ironman' && !/\b70\.3\b/i.test(raw) && !d.includes('half'))) return 'ironman';
  if (d.includes('olympic') || d.includes('1.5/40/10')) return 'olympic';
  if (d.includes('sprint') && (d.includes('tri') || d.includes('75/20/5'))) return 'sprint';
  if (d === 'full' || d === 'ironman') return 'ironman';
  return null;
}

/**
 * If the model omitted `sport` on a tri event, infer triathlon when distance is clearly a tri race.
 */
export function inferEventSportForTri(
  goalType: string,
  sport: string | null,
  distance: string | null,
  name: string,
): string | null {
  if (goalType !== 'event' || sport) return sport;
  if (triDistanceApiKey(distance) != null) return 'triathlon';
  const n = name.toLowerCase();
  if (/\b70\.3\b|half.iron|ironman\s*70|im\s*70\.3/i.test(n)) return 'triathlon';
  if (/\bolympic triathlon\b|\bstandard distance tri/i.test(n)) return 'triathlon';
  if (/\bsprint triathlon\b/i.test(n)) return 'triathlon';
  if (/\b(ironman|140\.6)\b/i.test(n) && !/\b70\.3\b/i.test(n)) return 'triathlon';
  return sport;
}
