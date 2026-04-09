import React from 'react';
import { SPORT_COLORS, hexToRgb } from '@/lib/context-utils';

interface AuthScreenLayoutProps {
  children: React.ReactNode;
}

/**
 * Full-screen auth backdrop: black base, subtle grid, and a radial "supernova"
 * built from discipline colors (single source: SPORT_COLORS).
 */
export function AuthScreenLayout({ children }: AuthScreenLayoutProps) {
  const r = {
    run: hexToRgb(SPORT_COLORS.run),
    strength: hexToRgb(SPORT_COLORS.strength),
    ride: hexToRgb(SPORT_COLORS.ride),
    pilates: hexToRgb(SPORT_COLORS.pilates_yoga),
    swim: hexToRgb(SPORT_COLORS.swim),
  };

  const supernovaStyle: React.CSSProperties = {
    background: `
      radial-gradient(ellipse 130% 90% at 50% -15%, rgba(${r.run}, 0.28) 0%, transparent 55%),
      radial-gradient(ellipse 85% 55% at 92% 18%, rgba(${r.strength}, 0.14) 0%, transparent 50%),
      radial-gradient(ellipse 85% 55% at 8% 22%, rgba(${r.swim}, 0.14) 0%, transparent 50%),
      radial-gradient(ellipse 75% 50% at 72% 88%, rgba(${r.ride}, 0.12) 0%, transparent 48%),
      radial-gradient(ellipse 75% 50% at 28% 85%, rgba(${r.pilates}, 0.14) 0%, transparent 48%),
      conic-gradient(
        from 210deg at 50% -5%,
        transparent 0deg,
        rgba(${r.run}, 0.12) 55deg,
        rgba(${r.strength}, 0.1) 115deg,
        rgba(${r.ride}, 0.1) 175deg,
        rgba(${r.swim}, 0.12) 235deg,
        rgba(${r.pilates}, 0.11) 295deg,
        transparent 360deg
      )
    `,
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <div
        className="pointer-events-none absolute inset-0 animate-auth-nova-pulse"
        style={supernovaStyle}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[length:24px_24px]"
        aria-hidden
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}
