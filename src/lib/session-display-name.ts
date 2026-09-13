/**
 * ═══ WHAT THIS SESSION IS CALLED — ONE LADDER, EVERY SCREEN ════════════════════════════════════
 *
 * "Treadmill", "Indoor Ride", "Trail Run", "Pool Swim". The words a card, a header or a map
 * placeholder puts on a session.
 *
 * ⛔ IT HAD SIX (audit 2026-09-12), and three of them asked whether the session was indoors in their
 * own way:
 *   · `TodaysEffort.tsx` and `UnifiedWorkoutView.tsx` carried CHARACTER-IDENTICAL indoor ladders —
 *     Strava's `trainer` flag, then an empty `gps_track` with no start fix.
 *   · `workoutNames.ts getVirtualWorkoutLabel` carried a third, `generateWorkoutName` a fourth on
 *     the raw provider word, and `useWorkouts.ts` two more inline at import time with no indoor
 *     branch at all — so a treadmill run imported from Garmin was simply called "Run".
 *   · `CompletedTab.tsx` asked a seventh time to decide whether to show the map placeholder.
 * None of them ever called a RIDE indoors: every one gated its indoor test on run or walk, so a
 * trainer ride printed "Ride" on every screen in the app.
 *
 * ⛔ THE INDOOR QUESTION IS NOT ASKED HERE. `_shared/indoor-session.ts` has been the one answer
 * since 2026-09-09 — five ways to know, statements before inferences — and this file calls it. That
 * is the whole point: a session that is indoors to the map and outdoors to the card is the failure
 * this replaces, and it can only be prevented by one predicate, not by six careful copies.
 *
 * ⚠️ THE WORDS THEMSELVES ARE UNCHANGED. Every string below already appeared on some screen; what
 * changes is that all the screens now say the same one about the same session.
 */
import { isIndoorSession } from '@shared/indoor-session';

type Rowish = Record<string, unknown> | null | undefined;

const lower = (v: unknown) => String(v ?? '').toLowerCase();

/** The provider's own word for the session, where it sent one. */
function providerWord(w: Rowish): string {
  return lower(
    (w as { strava_data?: { original_activity?: { sport_type?: unknown } } })?.strava_data?.original_activity?.sport_type
    ?? (w as { provider_sport?: unknown })?.provider_sport
    ?? (w as { activity_type?: unknown })?.activity_type,
  );
}

/**
 * ⛔ TREADMILL vs INDOOR RUN. Both mean the session was indoors; "Treadmill" additionally says the
 * athlete was on a machine, which the provider states (`trainer`, or a sport word carrying the
 * machine's name). Without that statement the honest word is the general one.
 */
function onAMachine(w: Rowish): boolean {
  const sd = (w as { strava_data?: unknown })?.strava_data;
  let parsed: Record<string, unknown> | null = null;
  if (typeof sd === 'string') { try { parsed = JSON.parse(sd); } catch { parsed = null; } }
  else if (sd && typeof sd === 'object') parsed = sd as Record<string, unknown>;
  const a = (parsed?.original_activity ?? parsed) as Record<string, unknown> | undefined;
  if (a?.trainer === true) return true;
  if ((w as { trainer?: unknown })?.trainer === true) return true;
  // ⛔ THE ATHLETE'S OWN STATEMENT NAMES THE MACHINE. `venue:treadmill` is the machine swap writing
  // down what the session moved onto (p275) — a stronger statement about the machine than any
  // provider flag, and the only ladder that read it before was the server's.
  const raw = (w as { tags?: unknown })?.tags;
  let tags: unknown[] = [];
  if (Array.isArray(raw)) tags = raw;
  else if (typeof raw === 'string') { try { const t: unknown = JSON.parse(raw); if (Array.isArray(t)) tags = t; } catch { /* not JSON */ } }
  if (tags.map(lower).some((t) => t.startsWith('venue:') && (t.includes('treadmill') || t.includes('trainer')))) return true;
  const p = providerWord(w);
  return p.includes('treadmill') || p.includes('trainer');
}

/**
 * The name for a session. `type` is the app's normalised discipline; everything else is read off the
 * row. ⚠️ A SESSION THE ATHLETE NAMED KEEPS ITS NAME — that is handled by the callers that have one
 * (an imported activity's title), because only they know whether the name is the athlete's or the
 * provider's raw enum.
 */
export function sessionDisplayName(w: Rowish): string {
  const type = lower((w as { type?: unknown })?.type);
  const p = providerWord(w);
  const indoors = isIndoorSession(w);

  if (type === 'run') {
    if (indoors) return onAMachine(w) ? 'Treadmill' : 'Indoor Run';
    if (/trail/.test(p)) return 'Trail Run';
    return 'Run';
  }
  if (type === 'walk') {
    if (indoors) return 'Indoor Walk';
    if (/hike|hiking/.test(p)) return 'Hike';
    return 'Walk';
  }
  if (type === 'ride' || type === 'bike' || type === 'cycling') {
    /**
     * ⛔ A RIDE CAN BE INDOORS, AND UNTIL NOW IT NEVER WAS (2026-09-12, Michael: "can we clarify
     * when rides are done on a trainer?"). Every previous ladder gated its indoor branch on run or
     * walk, so a Zwift or trainer ride read as an ordinary "Ride" on every screen. Zwift keeps its
     * own name because the athlete knows it by that; everything else on a trainer is "Indoor Ride".
     */
    if (indoors) {
      const name = lower((w as { name?: unknown })?.name);
      if (name.includes('zwift') || p.includes('virtual')) return 'Zwift';
      return 'Indoor Ride';
    }
    if (/gravel/.test(p)) return 'Gravel Ride';
    if (/mountain|mtb/.test(p)) return 'Mountain Bike';
    if (/road/.test(p)) return 'Road Ride';
    return 'Ride';
  }
  if (type === 'swim') {
    if (/open\s*water|ocean|\bow\b|open_water/.test(p)) return 'Open Water Swim';
    return 'Pool Swim';
  }
  if (type === 'strength') return 'Strength';
  if (type === 'mobility') return 'Mobility';

  // Nothing recognised: the provider's own word, tidied. Never an invented one.
  if (p.trim()) {
    const label = p.replace(/_/g, ' ').trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Session';
}

export default sessionDisplayName;
