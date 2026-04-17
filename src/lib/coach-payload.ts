import type { RaceFinishProjectionV1 } from '@/hooks/useCoachWeekContext';

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
