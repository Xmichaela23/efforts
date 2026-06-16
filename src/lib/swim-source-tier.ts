// D-169 — the ONE swim source/tier derivation (pure). The badge UI, the tier-gated metric rendering,
// and the FORM→Apple nudge all read from here so "which source / what tier / is this a FORM-via-Strava
// swim" has a single answer. Spec: docs/SPEC-swim-source-tiers.md. Verified against real data.
//
// Tier = provenance (from `source`) + a data-presence suffix (NOT just source): a Strava swim that was
// merged with HealthKit, or popup-enriched with strokes, reads `+SWOLF` even though `source` is strava.

export type SwimProvenance = 'strava' | 'garmin' | 'apple_health' | 'manual' | 'unknown';
export type SwimDataTier = 'courtesy' | 'basic' | 'full' | 'plus_swolf';

export interface SwimSourceTier {
  provenance: SwimProvenance;
  /** Athlete-facing provenance label: "via Strava" / "via Garmin" / "via Apple Health" / "Manual". */
  provenanceLabel: string;
  tier: SwimDataTier;
  /** Full badge string, e.g. "via Strava · basic", "via Garmin · full", "via Apple Health · +SWOLF", "Manual". */
  badge: string;
  /** Drives the FORM→Apple nudge: a FORM swim arriving via Strava with thin fields (no strokes yet). */
  isFormViaStrava: boolean;
  hasStrokes: boolean;
  /** Per-length splits (Garmin's per-length time/distance array) — NOT SWOLF (no per-length strokes). */
  hasPerLengthSplits: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** device_info is a JSON string `{"device_name":"FORM goggles"}` (or already-parsed object). */
function deviceName(deviceInfo: unknown): string {
  if (!deviceInfo) return '';
  let obj: any = deviceInfo;
  if (typeof deviceInfo === 'string') {
    try { obj = JSON.parse(deviceInfo); } catch { return deviceInfo; }
  }
  return String(obj?.device_name || obj?.deviceName || '').trim();
}

export function deriveSwimTier(workout: any): SwimSourceTier {
  const source = String(workout?.source || '').toLowerCase();
  const isForm = /\bform\b/i.test(deviceName(workout?.device_info));

  // Data presence (not source). strokes = SWOLF-capable; Garmin per-length array = splits.
  const hasStrokes = num(workout?.strokes) > 0;
  const hasPerLengthSplits = source === 'garmin' && num(workout?.number_of_active_lengths) > 0;

  let provenance: SwimProvenance;
  let provenanceLabel: string;
  if (source === 'manual') { provenance = 'manual'; provenanceLabel = 'Manual'; }
  else if (source === 'garmin') { provenance = 'garmin'; provenanceLabel = 'via Garmin'; }
  else if (source === 'healthkit') { provenance = 'apple_health'; provenanceLabel = 'via Apple Health'; }
  else if (source === 'strava') { provenance = 'strava'; provenanceLabel = 'via Strava'; }
  else { provenance = 'unknown'; provenanceLabel = source ? `via ${source[0].toUpperCase()}${source.slice(1)}` : 'Unknown'; }

  // Data tier: strokes (→ session SWOLF) outranks per-length splits outranks basic. Manual = courtesy.
  let tier: SwimDataTier;
  if (provenance === 'manual') tier = 'courtesy';
  else if (hasStrokes) tier = 'plus_swolf';
  else if (hasPerLengthSplits) tier = 'full';
  else tier = 'basic';

  const suffix = tier === 'courtesy' ? '' : tier === 'plus_swolf' ? ' · +SWOLF' : tier === 'full' ? ' · full' : ' · basic';
  const badge = provenance === 'manual' ? 'Manual' : `${provenanceLabel}${suffix}`;

  // Nudge fires only for FORM-via-Strava swims still missing the rich fields (strokes) — i.e. the swimmer
  // hasn't connected Apple Health yet. Once merged/enriched (hasStrokes), there's nothing to nudge for.
  const isFormViaStrava = isForm && source === 'strava' && !hasStrokes;

  return { provenance, provenanceLabel, tier, badge, isFormViaStrava, hasStrokes, hasPerLengthSplits };
}
