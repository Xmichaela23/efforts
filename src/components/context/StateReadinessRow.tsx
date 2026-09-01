import React from 'react';
import { Row, Chip, Dot } from './state-primitives';

/**
 * READINESS — athlete-reported energy/soreness/sleep (Q-049 Phase 1, D-144).
 * Extracted from StateTab 2026-09-01 (Round 0a). No behaviour change; the body is the inline
 * IIFE verbatim, comments carried across.
 * Raw + distinct sliders; shown ONLY when a recent check-in exists (no-data
 * on absent, per Q3). Neutral tone — Phase 1 is visible-only, no good/bad
 * judgement encoded. Trend arrow per signal (newest vs oldest in window)
 * when >=3 check-ins.
 * ⛔ The `checkinReadiness?.latest` test stays in the caller (plate `divide-y`).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function StateReadinessRow({ checkinReadiness }: { checkinReadiness: any }) {
  const L = checkinReadiness.latest!;
  const today = new Date().toISOString().slice(0, 10);
  const dayDiff = Math.round(
    (Date.parse(today + 'T00:00:00Z') - Date.parse(L.date + 'T00:00:00Z')) / 86400000,
  );
  const whenLabel = dayDiff <= 0 ? 'today' : dayDiff === 1 ? 'yesterday' : `${dayDiff}d ago`;
  const arrow = (k: 'energy' | 'soreness' | 'sleep') => {
    if (checkinReadiness.recent.length < 3) return '';
    const newest = checkinReadiness.recent[0][k];
    const oldest = checkinReadiness.recent[checkinReadiness.recent.length - 1][k];
    return newest > oldest ? ' ↑' : newest < oldest ? ' ↓' : ' →';
  };
  return (
    <div className="px-3 py-3">
      <Row label="READINESS">
        <Chip label="energy" value={`${L.energy}${arrow('energy')}`} />
        <Dot />
        <Chip label="soreness" value={`${L.soreness}${arrow('soreness')}`} />
        <Dot />
        <Chip label="sleep" value={`${L.sleep}${arrow('sleep')}`} />
        <Dot />
        <Chip value={whenLabel} valueClass="text-white/65" />
      </Row>
    </div>
  );
}
