// Authoring defaults: map minimal session specs (kind + day) → tokens/tags
// Goal: let authors avoid hand-authoring steps/tags everywhere.

export type MinimalSession = { day?: string; discipline?: string; type?: string; kind?: string; description?: string; steps_preset?: string[]; tags?: string[]; [k: string]: any };

const addTag = (arr: string[], t: string) => {
  if (!arr.map(x => x.toLowerCase()).includes(String(t).toLowerCase())) arr.push(t);
};

export function enrichSessionFromKind<T extends MinimalSession>(session: T): T {
  const s: any = { ...session };
  const kind = String(s.kind || '').toLowerCase();

  // Only add tokens if none provided
  if (!Array.isArray(s.steps_preset) || s.steps_preset.length === 0) {
    switch (kind) {
      // RUN
      case 'run_intervals':
        s.steps_preset = ['warmup_run_quality_12min', 'interval_6x800m_5kpace_R2min', 'cooldown_easy_10min'];
        break;
      case 'run_tempo':
        s.steps_preset = ['warmup_run_quality_12min', 'tempo_4mi', 'cooldown_easy_10min'];
        break;
      case 'run_openers':
        s.steps_preset = ['strides_6x20s'];
        break;
      case 'run_easy':
        s.steps_preset = ['longrun_40min'];
        break;
      case 'run_long':
        s.steps_preset = ['longrun_90min'];
        break;

      // BIKE
      case 'bike_intervals':
        s.steps_preset = ['warmup_bike_quality_15min_fastpedal', 'bike_vo2_6x5min_R3min', 'cooldown_bike_easy_10min'];
        break;
      case 'bike_tempo':
        s.steps_preset = ['warmup_bike_quality_15min_fastpedal', 'bike_thr_2x20min_R5min', 'cooldown_bike_easy_10min'];
        break;
      case 'bike_easy':
      case 'bike_openers':
        s.steps_preset = ['bike_endurance_60min'];
        break;
      case 'bike_long_progressive':
        s.steps_preset = ['bike_endurance_120min'];
        break;

      // SWIM
      case 'swim_technique':
      case 'swim_easy_tech':
        s.steps_preset = ['swim_warmup_200yd_easy', 'swim_drills_4x50yd_catchup', 'swim_drills_4x50yd_singlearm', 'swim_pull_2x100yd', 'swim_kick_2x100yd', 'swim_cooldown_200yd_easy'];
        break;
      case 'swim_intervals':
        s.steps_preset = ['swim_warmup_200yd_easy', 'swim_aerobic_10x100yd', 'swim_cooldown_200yd_easy'];
        break;
      case 'swim_steady':
      case 'swim_open_water_or_pool':
      case 'swim_easy':
        s.steps_preset = ['swim_warmup_200yd_easy', 'swim_aerobic_6x200yd', 'swim_cooldown_200yd_easy'];
        break;

      default:
        break;
    }
  }

  // Tags for spacing/UX
  const tags: string[] = Array.isArray(s.tags) ? [...s.tags] : [];
  if (kind === 'run_long') addTag(tags, 'long_run');
  if (kind === 'bike_long_progressive') addTag(tags, 'long_ride');
  if (kind === 'bike_intervals' || kind === 'bike_tempo') addTag(tags, 'bike_intensity');
  if (kind === 'run_intervals' || kind === 'run_tempo') addTag(tags, 'hard_run');
  if (kind === 'strength_lower') addTag(tags, 'strength_lower');
  if (tags.length) s.tags = tags;

  // Discipline inference
  if (!s.discipline) {
    if (kind.startsWith('run_') || kind === 'run') s.discipline = 'run';
    else if (kind.startsWith('bike_') || kind === 'bike' || kind === 'ride' || kind === 'cycling') s.discipline = 'ride';
    else if (kind.startsWith('swim_') || kind === 'swim') s.discipline = 'swim';
    else if (kind.startsWith('strength_') || kind === 'strength') s.discipline = 'strength';
  }

  return s as T;
}


