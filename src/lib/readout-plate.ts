/**
 * The READOUT PLATE — the instrument-plate card the workout Details tab wears, extracted so other
 * screens can wear the same one. [2026-08-15]
 *
 * Michael, looking at a ride's Details tab: "I do like the details thing — does State adopt more of
 * that, since it's info/performance too?" The look was born inline in `CompletedTab.tsx`
 * (`readoutPlateStyle`, ~line 153) and lived only there; this file is that recipe made shared, so
 * State and Details read as one design system instead of drifting into two.
 *
 * THE RULE THAT RIDES ALONG (same law as the strength logger's palette): a discipline colour only
 * ever means its discipline. On a workout detail screen the whole page belongs to one sport, so the
 * whole plate is keyed to it. On State, a card belongs to one sport (strength row, bike row) or to
 * several (LOAD, NEXT) — a multi-sport card takes the NEUTRAL plate and lets the sport colours
 * inside it stay data (bars, legend chips), never chrome.
 *
 * What the plate is, visually: a near-black instrument face; the accent as a soft light source off
 * the top edge; two faint fixed corner tints (run gold left, swim blue right) that read as ambient
 * room light, deliberately identical on every plate; a hairline highlight on the top edge. Numbers
 * on the plate glow faintly in the accent via `readoutValueStyle`.
 */

import type React from 'react';

/** Neutral accent for multi-sport plates — white light, no discipline claim. */
export const NEUTRAL_PLATE_RGB = '255, 255, 255';

export function readoutPlateStyle(accentRgb: string = NEUTRAL_PLATE_RGB, opts?: {
  /** Extra box-shadow layers (e.g. getDisciplineGlowStyle().boxShadow) appended to the plate's own. */
  glow?: string;
  /**
   * Nebula ground (2026-08-15, Michael: "what about the readout overlay?"): the element must ALSO
   * carry the `.galaxy-card` class (index.css) — the wizard's nebula/stars/grain paints as the
   * plate's ground via ::before/::after, so this style omits its own background layers (an element
   * background would paint OVER the pseudo-element ground) and instead sets the class's accent
   * knobs. Flat plates (galaxy off) keep the original painted background — the workout Details tab
   * still uses that form.
   */
  galaxy?: boolean;
}): React.CSSProperties {
  const neutral = accentRgb === NEUTRAL_PLATE_RGB;
  // The neutral plate's "light" runs dimmer than a discipline's: white at a sport hue's alpha reads
  // as a wash, not a light.
  const topA = neutral ? 0.07 : 0.14;
  const borderA = neutral ? 0.10 : 0.18;
  const base: React.CSSProperties = {
    borderRadius: 16,
    border: `1px solid rgba(${accentRgb}, ${borderA})`,
    boxShadow: [
      '0 0 0 1px rgba(255,255,255,0.06) inset',
      '0 1px 0 rgba(255,255,255,0.06) inset',
      opts?.glow || '',
      '0 10px 28px rgba(0,0,0,0.35)',
    ].filter(Boolean).join(', '),
  };
  if (opts?.galaxy) {
    return {
      ...base,
      ['--card-accent-rgb' as any]: accentRgb,
      ['--card-accent-a' as any]: String(neutral ? 0.08 : 0.20),
    };
  }
  return {
    ...base,
    backgroundColor: 'rgba(0,0,0,0.30)',
    backgroundImage: `
      radial-gradient(900px 220px at 50% 0%, rgba(${accentRgb}, ${topA}) 0%, rgba(0,0,0,0) 68%),
      radial-gradient(600px 220px at 10% 10%, rgba(255, 215, 0, 0.06) 0%, rgba(0,0,0,0) 65%),
      radial-gradient(600px 220px at 90% 12%, rgba(74, 158, 255, 0.05) 0%, rgba(0,0,0,0) 65%),
      linear-gradient(to bottom, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 18%, rgba(0,0,0,0.0) 100%)
    `,
  };
}

/** The phosphor number treatment that sits ON a plate — faint accent glow behind the value. */
export function readoutValueStyle(accentRgb: string = NEUTRAL_PLATE_RGB): React.CSSProperties {
  return {
    color: 'rgba(255,255,255,0.92)',
    textShadow: `0 0 14px rgba(${accentRgb}, 0.18), 0 0 2px rgba(${accentRgb}, 0.22)`,
    fontVariantNumeric: 'tabular-nums lining-nums',
  };
}
