import type { RaceFinishProjectionV1, RaceReadinessV1 } from '@/hooks/useCoachWeekContext';

function isUsableRfp(r: RaceFinishProjectionV1 | null | undefined): r is RaceFinishProjectionV1 {
  if (!r || typeof r !== 'object') return false;
  if (!r.goal_id || String(r.goal_id).trim() === '') return false;
  const s = Number(r.anchor_seconds);
  return Number.isFinite(s) && s > 0;
}

/** Root wins; nested weekly_state_v1 is only for partial/old rows. */
export function pickRaceFinishProjectionV1FromCoachData(data: {
  race_finish_projection_v1?: RaceFinishProjectionV1 | null;
  weekly_state_v1?: { race_finish_projection_v1?: RaceFinishProjectionV1 | null };
} | null | undefined): RaceFinishProjectionV1 | null {
  if (!data) return null;
  if (isUsableRfp(data.race_finish_projection_v1)) return data.race_finish_projection_v1;
  const nested = data.weekly_state_v1?.race_finish_projection_v1;
  if (isUsableRfp(nested)) return nested;
  return null;
}

function isUsableRaceReadiness(rr: RaceReadinessV1 | null | undefined): rr is RaceReadinessV1 {
  if (!rr || typeof rr !== 'object') return false;
  return typeof (rr as RaceReadinessV1).predicted_finish_display === 'string';
}

/** Root wins; nested weekly_state_v1 only if we ever mirror partial rows. */
export function pickRaceReadinessFromCoachData(data: {
  race_readiness?: RaceReadinessV1 | null;
  weekly_state_v1?: { race_readiness?: RaceReadinessV1 | null };
} | null | undefined): RaceReadinessV1 | null {
  if (!data) return null;
  if (isUsableRaceReadiness(data.race_readiness)) return data.race_readiness;
  const nested = data.weekly_state_v1?.race_readiness;
  if (isUsableRaceReadiness(nested)) return nested;
  return null;
}
