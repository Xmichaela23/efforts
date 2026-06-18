// Swim pace zones — derived from the athlete's threshold 100 pace (the internal CSS anchor).
// D-199 Decision A: ATHLETE-FACING labels are PLAIN effort words only. "CSS", "Critical Swim
// Speed", and Z-numbers stay engine-internal and are NEVER surfaced here (preserves the
// 2026-05-22 anti-regression rule). The anchor is shown as "Threshold pace /100", not "CSS".
// Offsets per docs/SWIM-PROTOCOL.md §4–5 (single-sourced with what the plan already prescribes).

export interface SwimPaceBand {
  label: string;   // plain effort word (Recovery / Easy / Moderate / Threshold / Fast)
  range: string;   // formatted pace range per 100, e.g. "2:35–2:39"
  anchor: boolean; // true for the Threshold band (≈ the entered pace / internal CSS)
}

/** Parse an "m:ss" pace string to total seconds. Returns null if absent/malformed/non-positive. */
export function parsePaceToSeconds(mmss: string | undefined | null): number | null {
  if (!mmss) return null;
  const m = String(mmss).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return sec > 0 ? sec : null;
}

/** Format seconds to "m:ss". */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Derive the 5 plain-labeled swim pace bands from the threshold 100 pace (the internal CSS anchor),
 * in seconds-per-100 of whatever unit the input is in (yd today). Bands are CSS-relative offsets
 * from SWIM-PROTOCOL §4–5; the Threshold band straddles the anchor. Returns [] for invalid input.
 * Ordered easy→hard (Recovery at top), matching the run HR-zone card.
 */
export function deriveSwimPaceBands(thresholdSecPer100: number): SwimPaceBand[] {
  const c = thresholdSecPer100;
  if (!Number.isFinite(c) || c <= 0) return [];
  const f = formatSeconds;
  return [
    { label: 'Recovery',  range: `${f(c + 12)} and slower`,  anchor: false },
    { label: 'Easy',      range: `${f(c + 8)}–${f(c + 12)}`, anchor: false },
    { label: 'Moderate',  range: `${f(c + 3)}–${f(c + 8)}`,  anchor: false },
    { label: 'Threshold', range: `${f(c - 2)}–${f(c + 3)}`,  anchor: true  },
    { label: 'Fast',      range: `${f(c - 2)} and faster`,   anchor: false },
  ];
}
