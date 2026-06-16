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
  swimOverride?: boolean; // D-173: route swims to Garmin even on a Strava-global preference
  onToggleSwimOverride?: () => void;
}

type Status = { label: string; tone: 'connected' | 'action' | 'pending' | 'muted' };

const Chip: React.FC<{ s: Status }> = ({ s }) => {
  // 'muted' is a plain text pointer (e.g. Manual → planned screen), not a pill.
  if (s.tone === 'muted') return <span className="shrink-0 text-[11px] text-white/40">{s.label}</span>;
  const cls = s.tone === 'connected'
    ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
    : 'text-sky-300 border-sky-400/30 bg-sky-400/10';
  return <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{s.label}</span>;
};

const Row: React.FC<{ name: string; gives: string; status?: Status }> = ({ name, gives, status }) => (
  <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.06] last:border-0">
    <div className="w-[104px] shrink-0 text-[13px] text-white/85">{name}</div>
    <div className="flex-1 min-w-0 text-[12px] text-white/45 leading-snug">{gives}</div>
    {status && <Chip s={status} />}
  </div>
);

const SwimSourceMatrix: React.FC<SwimSourceMatrixProps> = ({
  garminConnected, stravaConnected, appleHealthConnected, appleHealthAvailable, swimOverride, onToggleSwimOverride,
}) => {
  // D-173: when the swim override is on, Garmin IS the swim source — the badge says so.
  const garmin: Status = garminConnected
    ? (swimOverride ? { label: 'Swim source', tone: 'connected' } : { label: 'Connected', tone: 'connected' })
    : { label: 'Connect', tone: 'action' };
  const strava: Status = stravaConnected ? { label: 'Connected', tone: 'connected' } : { label: 'Connect', tone: 'action' };
  // Apple Watch + FORM-via-Apple-Health share ONE pipe — Apple Health. Both badges read its connection state.
  const appleHealth: Status = appleHealthConnected ? { label: 'Connected', tone: 'connected' } : { label: 'Connect', tone: 'action' };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[13px] font-medium text-white/85 mb-1.5">Swim data</div>
      {/* The honest one-liner — turn the fragmented data story into a trust moment, not a wall of text. */}
      <p className="text-[12px] text-white/55 leading-snug mb-3">
        Swim data's messy — every device captures different things and they don't all talk. Here's
        what each gives you, so you can pick what works. And if it's ever a hassle, you can add a swim by hand.
      </p>

      <div>
        <Row name="Garmin" gives="Full · splits, stroke count, SWOLF, rest" status={garmin} />
        <Row name="Strava" gives="Basic · distance, time, heart rate" status={strava} />
        <Row name="Apple Watch" gives="Full · splits, stroke count, SWOLF" status={appleHealth} />
        <Row name="FORM goggles" gives="via Apple Health: +pool, strokes · via Strava: basic" status={appleHealth} />
        <Row name="Manual" gives="distance + time, pool optional" status={{ label: 'Log on planned session screen', tone: 'muted' }} />
      </div>

      {/* D-173: opt-in — route swims to Garmin (richer) while runs/rides stay on the global preference. */}
      {garminConnected && (
        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-white/[0.06]">
          <div className="min-w-0">
            <div className="text-[12px] text-white/80">Use Garmin for swim data</div>
            <div className="text-[11px] text-white/40">Garmin offers richer swim data.</div>
          </div>
          <button
            onClick={onToggleSwimOverride}
            role="switch"
            aria-checked={!!swimOverride}
            className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${swimOverride ? 'bg-emerald-500/60' : 'bg-white/15'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${swimOverride ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>
      )}

      <p className="text-[12px] text-white/45 leading-snug mt-3">
        You'll only ever see the richest version of each swim — never a duplicate.
      </p>
    </div>
  );
};

export default SwimSourceMatrix;
