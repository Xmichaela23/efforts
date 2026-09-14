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

  // The warm sun from Home (TodaysEffort.tsx, "THE SUN"): a small warm-white core with a gold and
  // peach halo, sitting just above the card so the card's top edge catches it. It breathes on the
  // same slow pulse as the nova.
  const sunStyle: React.CSSProperties = {
    mixBlendMode: 'screen',
    filter: 'blur(10px)',
    background: `
      radial-gradient(150px 90px at 50% 50%, rgba(255,240,210,0.55) 0%, rgba(255,224,170,0.16) 50%, rgba(255,224,170,0) 100%),
      radial-gradient(420px 240px at 50% 52%, rgba(255,190,100,0.22) 0%, rgba(255,190,100,0) 100%),
      radial-gradient(760px 420px at 50% 54%, rgba(255,150,80,0.12) 0%, rgba(255,150,80,0) 100%)
    `,
  };

  return (
    // The same room as Focus and the Train screens: `wizard-galaxy` (nebula, stars, grain).
    <div className="wizard-galaxy relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 animate-auth-nova-pulse"
        style={{ ...supernovaStyle, opacity: 0.7 }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 animate-auth-nova-pulse"
        style={{ ...sunStyle, top: 'calc(50% - 440px)', height: '420px' }}
        aria-hidden
      />
      {/* Home's texture: diagonal lines at 26px and 52px, in place of the square grid. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.30,
          mixBlendMode: 'soft-light',
          backgroundImage: `
            linear-gradient(45deg, rgba(255,255,255,0.22) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.18) 1px, transparent 1px),
            linear-gradient(45deg, rgba(255,255,255,0.10) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.08) 1px, transparent 1px)
          `,
          backgroundSize: '26px 26px, 26px 26px, 52px 52px, 52px 52px',
        }}
        aria-hidden
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}
