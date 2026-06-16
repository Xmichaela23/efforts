// D-172 — swim source capability matrix for Connections. HONEST framing (no source overstated):
// Garmin is the only LIVE rich source; Apple Watch is integration-in-place-but-untested; FORM reaches
// us thin via Strava OR a MODEST bump via Apple Health (pool + session strokes — NOT per-length SWOLF,
// which FORM keeps in its own app); Strava is basic; manual is the escape hatch. Display-only.
// Spec: docs/SPEC-swim-source-tiers.md.

import React from 'react';

interface SwimSourceMatrixProps {
  garminConnected?: boolean;
  stravaConnected?: boolean;
  appleHealthConnected?: boolean;
  appleHealthAvailable?: boolean; // iOS native app
}

type Status = { label: string; tone: 'connected' | 'action' | 'pending' | 'muted' };

const Chip: React.FC<{ s: Status }> = ({ s }) => {
  const cls = s.tone === 'connected'
    ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
    : s.tone === 'action'
      ? 'text-sky-300 border-sky-400/30 bg-sky-400/10'
      : s.tone === 'pending'
        ? 'text-amber-300/80 border-amber-300/20 bg-amber-300/[0.06]'
        : 'text-white/40 border-white/10 bg-white/[0.03]';
  return <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{s.label}</span>;
};

const Row: React.FC<{ name: string; gives: string; status: Status }> = ({ name, gives, status }) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.06] last:border-0">
    <div className="w-[104px] shrink-0 text-[13px] text-white/85">{name}</div>
    <div className="flex-1 min-w-0 text-[12px] text-white/45 leading-snug">{gives}</div>
    <Chip s={status} />
  </div>
);

const SwimSourceMatrix: React.FC<SwimSourceMatrixProps> = ({
  garminConnected, stravaConnected, appleHealthConnected, appleHealthAvailable,
}) => {
  const garmin: Status = garminConnected ? { label: 'Connected', tone: 'connected' } : { label: 'Connect', tone: 'action' };
  const strava: Status = stravaConnected ? { label: 'Connected', tone: 'connected' } : { label: 'Connect', tone: 'action' };
  // Apple Watch rides the HealthKit sync (D-157) — integration exists, NEEDS TESTING (honest hybrid).
  const watch: Status = appleHealthConnected
    ? { label: 'Connected · testing', tone: 'pending' }
    : appleHealthAvailable
      ? { label: 'Needs testing', tone: 'action' }
      : { label: 'iOS app only', tone: 'muted' };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[13px] font-medium text-white/85 mb-1.5">Swim data</div>
      {/* The honest one-liner — turn the fragmented data story into a trust moment, not a wall of text. */}
      <p className="text-[12px] text-white/55 leading-snug mb-3">
        Swim data's messy — every device captures different things and they don't all talk. Here's
        what each gives you, so you can pick what works. And if it's ever a hassle, you can add a swim by hand.
      </p>

      <div>
        <Row name="Garmin" gives="Full · per-length splits, stroke count, SWOLF, rest intervals" status={garmin} />
        <Row name="Apple Watch" gives="Full · per-length splits, stroke count, SWOLF" status={watch} />
        <Row name="FORM goggles" gives="via Apple Health: + pool & stroke count (coming soon) · via Strava: basic" status={{ label: 'via Strava / Apple Health', tone: 'muted' }} />
        <Row name="Strava" gives="Basic · distance, time, heart rate (no pool / strokes / SWOLF)" status={strava} />
        <Row name="Manual" gives="Whatever you enter — distance + time, pool optional" status={{ label: 'Add by hand', tone: 'muted' }} />
      </div>

      {/* Dual-source reassurance (Phase 2 / Q-060 merge — stated as intent, not yet built). */}
      <p className="text-[11px] text-white/35 leading-snug mt-3">
        Use both FORM and Apple Watch? We'll merge the same swim into one workout — no duplicates.
      </p>
    </div>
  );
};

export default SwimSourceMatrix;
