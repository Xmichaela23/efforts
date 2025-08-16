import { Baselines } from './types';

export interface LastWeekCompletion {
  run?: { hadTempo: boolean; tempo_hr_drift_pct?: number; best5k_s?: number };
  bike?: { cp20_w?: number };
  strength?: { liftsHitRIRClean2w?: boolean };
}

export interface AdjustCoefficients {
  runPaceDelta_s_per_km?: number;
  ftpDelta_pct?: number;
  strengthPct1rmDelta?: number;
}

export function adjustCoefficients(args: {
  baselines: Baselines;
  lastWeek: LastWeekCompletion;
}): AdjustCoefficients {
  const out: AdjustCoefficients = {};

  const best5kBase = args.baselines.run?.best5k_s;
  const best5kNew  = args.lastWeek.run?.best5k_s;
  const drift = args.lastWeek.run?.tempo_hr_drift_pct ?? 999;
  if (best5kBase && best5kNew && best5kNew <= best5kBase * 0.98 && drift < 3) {
    out.runPaceDelta_s_per_km = -5;
  }

  const cp20 = args.lastWeek.bike?.cp20_w;
  const ftp  = args.baselines.bike?.ftp_w;
  if (cp20 && ftp && cp20 >= ftp * 1.03) {
    out.ftpDelta_pct = 0.03;
  }

  if (args.lastWeek.strength?.liftsHitRIRClean2w) {
    out.strengthPct1rmDelta = 0.025;
  }

  return out;
}


