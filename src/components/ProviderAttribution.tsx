import React from 'react';
import { getProviderAttribution, garminAttributionText } from '@/lib/provider-attribution';

/**
 * ═══ THE ATTRIBUTION LINE AND THE DERIVED-DATA FOOTER ════════════════════════════════════════════
 *
 * docs/WORKORDER-garmin-strava-attribution-2026-09-09.md. One component for the per-row line
 * (Today's done card, the Week tab, the old pill row) and one for the global derived-data footer
 * (Today's header, State's load plate, the Performance tab). The reader is
 * `src/lib/provider-attribution.ts`; this file only draws its answer.
 *
 * ⛔ 12 PX, THE APP'S SMALL LABEL SIZE, NEVER SMALLER THAN THE METADATA BESIDE IT (work order §6).
 * ⛔ NEVER INSIDE A TOOLTIP, A FOOTNOTE OR A COLLAPSED SECTION — Garmin API Brand Guidelines
 *    v6.30.2025: "Never bury the Garmin attribution in tooltips, footnotes or expandable containers."
 */

/** Garmin's blue, the colour the drawer already uses for "Garmin [device]". */
export const GARMIN_BLUE = '#007CC3';
/** The muted token the surrounding metadata uses. */
const MUTED = 'rgba(255,255,255,0.45)';

export const ProviderAttributionLine: React.FC<{
  workout: unknown;
  className?: string;
  style?: React.CSSProperties;
}> = ({ workout, className = '', style }) => {
  const a = getProviderAttribution(workout);
  if (!a.source) return null;
  const garminText = garminAttributionText(a);

  if (garminText) {
    /* "Garmin [device model]" — Garmin API Brand Guidelines v6.30.2025: title-level and secondary
       displays of Garmin device-sourced data carry this text; with no model, "Garmin" alone. A
       Garmin device arriving through Strava reads "Garmin [device] via Strava" —
       developers.strava.com/guidelines (Garmin attribution notice) defers to Garmin's rule. */
    return (
      <span className={`text-xs font-light whitespace-nowrap ${className}`} style={{ color: GARMIN_BLUE, ...style }}>
        {garminText}
      </span>
    );
  }

  /* The unaltered "Powered by Strava" mark, less prominent than the app's own brand —
     developers.strava.com/guidelines. A non-Garmin device keeps its "via [device]" line. */
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`} style={style}>
      <img src="/icons/strava-powered-by.svg" alt="Powered by Strava" className="h-3" />
      {a.deviceName ? (
        <span className="text-xs font-light" style={{ color: MUTED }}>via {a.deviceName}</span>
      ) : null}
    </span>
  );
};

/**
 * The global line for combined or derived data (a form number, a load bar, an adherence tile).
 * Garmin API Brand Guidelines v6.30.2025, their acceptable wording verbatim; shown as a footer
 * "globally — such as in a header or footer". The caller decides WHETHER (see
 * `useGarminDataPresence`): never on an account with no Garmin data.
 */
export const GarminDerivedDataLine: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`text-xs font-light leading-snug ${className}`} style={{ color: MUTED, ...style }}>
    Insights derived in part from Garmin device-sourced data.
  </div>
);
