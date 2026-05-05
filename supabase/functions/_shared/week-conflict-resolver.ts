/**
 * Pure resolver: turns week-builder `ConflictEvent[]` into athlete-facing
 * `ConflictResolution[]` for Arc / coach (Step 3 wiring is separate).
 *
 * No Supabase, LLM, network, or week-builder imports.
 */

import type { ConflictEvent, ConflictType, WeekStateReason } from '../generate-combined-plan/types.ts';

export type ResolutionPattern =
  | 'offer_adjacent_day'
  | 'offer_alternate_stimulus'
  | 'offer_consolidate'
  | 'offer_drop_explained'
  | 'no_options_recovery'
  | 'no_options_race'
  | 'athlete_choice_quality_or_stimulus';

export type ConflictResolution = {
  conflict_id: string;
  conflict_type: ConflictType;
  resolution: ResolutionPattern;
  primary_option?: { label: string; action: string };
  secondary_option?: { label: string; action: string };
  explanation: string;
  science_note: string;
  adjustable: true;
};

export type WeekConflictContext = {
  isRecovery: boolean;
  isTaper: boolean;
  isRaceWeek: boolean;
  weeksToRace: number;
};

function dayLabel(day?: string): string {
  if (!day || !String(day).trim()) return 'another day';
  const s = String(day).trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function chooseResolutionPattern(
  reasons: WeekStateReason[],
  ctx: WeekConflictContext,
): ResolutionPattern {
  const R = new Set(reasons);
  if (ctx.isRaceWeek || R.has('race_week')) return 'no_options_race';
  if (
    ctx.isRecovery ||
    R.has('recovery_week') ||
    ctx.isTaper ||
    R.has('taper_week') ||
    R.has('post_race_rebuild')
  ) {
    return 'no_options_recovery';
  }
  if (R.has('pre_long_run_48h') || R.has('pre_brick_48h')) return 'offer_alternate_stimulus';
  if (R.has('consecutive_same_discipline')) return 'offer_adjacent_day';
  if (R.has('consecutive_cross_discipline') || R.has('anchor_conflict')) {
    return 'athlete_choice_quality_or_stimulus';
  }
  if (R.has('no_clean_day')) return 'offer_drop_explained';
  return 'offer_drop_explained';
}

type Row = Pick<
  ConflictResolution,
  'primary_option' | 'secondary_option' | 'explanation' | 'science_note'
>;

type RowFn = (ev: ConflictEvent, ctx: WeekConflictContext) => Row;

const prefDay = (ev: ConflictEvent) => dayLabel(ev.blocked_intent.preferred_day);
const toDay = (ev: ConflictEvent) => dayLabel(ev.applied_resolution?.to_day);
const anchor0 = (ev: ConflictEvent) => ev.anchors_involved[0] ?? 'your anchor session';

function rowNoOptionsRace(ev: ConflictEvent): Row {
  const w = ev.blocked_intent.session_kind.replace(/_/g, ' ');
  return {
    explanation: `Race week keeps the plan tight, so we are not offering alternate days for this ${w} change.`,
    science_note: 'The days right around race day are for sharpness and rest, not for re-opening big training choices.',
  };
}

function rowNoOptionsRecovery(ev: ConflictEvent, ctx: WeekConflictContext): Row {
  const fromCtx = ctx.isTaper ? 'taper' : ctx.isRecovery ? 'recovery' : null;
  const fromReasons = ev.blocking_reasons.includes('taper_week')
    ? 'taper'
    : ev.blocking_reasons.includes('recovery_week') || ev.blocking_reasons.includes('post_race_rebuild')
      ? 'recovery'
      : null;
  const bit = fromCtx ?? fromReasons ?? 'recovery';
  return {
    explanation: `This week is a ${bit} week, so the planner kept the safer default instead of asking you to juggle hard sessions.`,
    science_note: 'Recovery and taper weeks protect fitness you already built; big swaps add risk without much extra reward.',
  };
}

const TABLE: Partial<Record<`${ConflictType}|${ResolutionPattern}`, RowFn>> = {
  'quality_run_blocked|athlete_choice_quality_or_stimulus': (ev) => {
    const p = prefDay(ev);
    const t = toDay(ev);
    const a = anchor0(ev);
    const moved = ev.applied_resolution?.type === 'moved' && ev.applied_resolution.to_day;
    return {
      primary_option: moved
        ? { label: `Keep quality run on ${t}`, action: 'accept_planner_quality_run_day' }
        : { label: `Keep quality run on ${p}`, action: 'keep_quality_run_preferred_day' },
      secondary_option: moved
        ? { label: 'Let your long run carry more of the hard running', action: 'shift_quality_to_long_run' }
        : { label: 'Let your long run carry more of the hard running', action: 'shift_quality_stimulus_to_long_run' },
      explanation: moved
        ? `Your ${a} and a quality run on ${p} would have stacked two demanding days in a row, so the plan moved the quality run to ${t}.`
        : `${a} and your quality run timing are competing; you can keep the quality day you asked for or shift the hard work.`,
      science_note:
        'Hard bike and hard run use different muscles, but back-to-back still adds fatigue the body has to absorb before your long run.',
    };
  },

  'quality_swim_blocked|athlete_choice_quality_or_stimulus': (ev) => {
    const p = prefDay(ev);
    const t = toDay(ev);
    const moved = ev.applied_resolution?.type === 'moved' && ev.applied_resolution.to_day;
    return {
      primary_option: moved
        ? { label: `Keep quality swim on ${t}`, action: 'accept_planner_quality_swim_day' }
        : { label: `Keep quality swim on ${p}`, action: 'keep_quality_swim_preferred_day' },
      secondary_option: moved
        ? { label: `Put the quality swim back toward ${p}`, action: 'revert_quality_swim_to_preferred_day' }
        : { label: 'Swap pool hardness for an easier swim this week', action: 'soften_quality_swim_week' },
      explanation: moved
        ? `Your pool quality day moved from ${p} to ${t} so it would not collide with your run or long-day anchors.`
        : 'Your swim quality day bumps against another hard or long session you care about.',
      science_note:
        'Swimming is gentle on joints, but a hard swim still loads the shoulders and nervous system alongside run and bike work.',
    };
  },

  'quality_bike_blocked|athlete_choice_quality_or_stimulus': (ev) => {
    const p = prefDay(ev);
    const t = toDay(ev);
    const moved = ev.applied_resolution?.type === 'moved' && ev.applied_resolution.to_day;
    return {
      primary_option: moved
        ? { label: `Keep quality bike on ${t}`, action: 'accept_planner_quality_bike_day' }
        : { label: `Keep quality bike on ${p}`, action: 'keep_quality_bike_preferred_day' },
      secondary_option: moved
        ? { label: `Move quality bike back toward ${p}`, action: 'revert_quality_bike_to_preferred_day' }
        : { label: 'Make this week’s ride easier and keep the anchor day', action: 'soften_quality_bike_week' },
      explanation: moved
        ? `Your quality bike day moved from ${p} to ${t} so it would not sit on a long ride, long run, or rest day.`
        : 'Your quality bike day is brushing up against another fixed piece of the week.',
      science_note:
        'Group rides and long endurance days both tax legs and fueling; spacing them usually recovers better than stacking them.',
    };
  },

  'heavy_lower_blocked|offer_alternate_stimulus': (ev) => {
    const t = toDay(ev);
    return {
      primary_option: { label: `Keep lower-body strength on ${t}`, action: 'accept_planner_lower_body_day' },
      secondary_option: { label: 'Lighten leg strength this week', action: 'reduce_lower_body_volume_week' },
      explanation: `Lower-body strength landed on ${t} after working around your long run or brick spacing.`,
      science_note:
        'Heavy legs need a clear runway before long runs and bricks so the long work stays high quality and injury risk stays lower.',
    };
  },

  'heavy_lower_blocked|athlete_choice_quality_or_stimulus': (ev) => {
    const t = toDay(ev);
    return {
      primary_option: { label: `Keep lower-body strength on ${t}`, action: 'accept_planner_lower_body_day' },
      secondary_option: { label: 'Swap for upper-only or easier legs this week', action: 'swap_lower_to_upper_or_easy' },
      explanation: `Strength placement on ${t} trades off with other hard pieces of the week you already locked in.`,
      science_note:
        'Lower-body lifting and long endurance both dig into the same tissues; the plan tries not to hide that overlap.',
    };
  },

  'third_swim_blocked|offer_alternate_stimulus': (ev) => {
    const p = prefDay(ev);
    const t = toDay(ev);
    return {
      primary_option: { label: `Keep the third swim on ${t}`, action: 'accept_planner_third_swim_day' },
      secondary_option: { label: `Move the third swim toward ${p}`, action: 'revert_third_swim_preferred_day' },
      explanation: `Your third weekly swim moved from ${p} to ${t} so it would not sit on top of other swim or long-day slots.`,
      science_note: 'Extra pool time has to come from somewhere; the planner keeps bike and run from silently paying for it.',
    };
  },

  'third_swim_blocked|athlete_choice_quality_or_stimulus': (ev) => {
    const p = prefDay(ev);
    const t = toDay(ev);
    return {
      primary_option: { label: `Keep the third swim on ${t}`, action: 'accept_planner_third_swim_day' },
      secondary_option: { label: `Park the third swim and stay at two swims`, action: 'drop_third_swim_week' },
      explanation: `Three swims is a bump in load; the plan parked the extra day on ${t} instead of ${p}.`,
      science_note: 'Swim fitness rises slowly; one fewer hard week rarely costs race swim, but it can protect bike and run.',
    };
  },

  'brick_blocked|offer_adjacent_day': (ev) => ({
    primary_option: { label: `Keep the planner’s brick on ${toDay(ev)}`, action: 'accept_planner_brick_day' },
    secondary_option: { label: 'Slide the brick one day if your race rehearsal allows', action: 'nudge_brick_day' },
    explanation: 'Weekend brick spacing bumped against another hard or long piece of the week.',
    science_note: 'Bricks are already a long training dose; sliding them can protect the two days before and after.',
  }),

  'brick_blocked|offer_alternate_stimulus': () => ({
    primary_option: { label: 'Keep the brick and trim mid-week intensity', action: 'protect_brick_soften_midweek' },
    secondary_option: { label: 'Keep mid-week work and simplify the weekend brick', action: 'soften_brick_weekend' },
    explanation: 'Weekend brick load trades off with how hard you can go Tuesday through Friday.',
    science_note: 'Race day is swim-bike-run in one go; bricks teach that chain, but they are not free training hours.',
  }),

  'brick_blocked|athlete_choice_quality_or_stimulus': (ev) => ({
    primary_option: { label: 'Keep the weekend brick as planned', action: 'accept_planner_brick_layout' },
    secondary_option: { label: 'Ask for a standalone long ride instead of a brick', action: 'prefer_standalone_long_ride' },
    explanation: ev.applied_resolution?.note ||
      'Brick weekend work collides with another hard or long session the same day.',
    science_note:
      'Bricks teach pacing on tired legs; they also spike leg fatigue, so the planner treats them like a serious training day.',
  }),

  'quality_run_blocked|offer_adjacent_day': (ev) => {
    const p = prefDay(ev);
    const t = toDay(ev);
    return {
      primary_option: { label: `Move quality run to ${t}`, action: 'accept_planner_adjacent_quality_run' },
      secondary_option: { label: `Hold the run quality on ${p}`, action: 'keep_quality_run_same_day' },
      explanation: `Two hard runs on neighboring days would lean on the same tissues, so the plan nudged quality toward ${t}.`,
      science_note: 'Same-sport hard days back-to-back spike soreness and injury risk more than mixing bike and run hard days.',
    };
  },

  'quality_swim_blocked|offer_adjacent_day': (ev) => ({
    primary_option: { label: `Keep the swim shift on ${toDay(ev)}`, action: 'accept_planner_adjacent_swim' },
    secondary_option: { label: `Move the swim back toward ${prefDay(ev)}`, action: 'revert_swim_adjacent' },
    explanation: 'Back-to-back hard swims would overload the same shoulder and pull pattern.',
    science_note: 'Swim muscles recover slower than it feels in the water when intensity stacks day after day.',
  }),

  'quality_bike_blocked|offer_adjacent_day': (ev) => ({
    primary_option: { label: `Keep bike quality on ${toDay(ev)}`, action: 'accept_planner_adjacent_bike' },
    secondary_option: { label: `Move bike quality toward ${prefDay(ev)}`, action: 'revert_bike_adjacent' },
    explanation: 'Two hard bike days in a row would dig into the same leg endurance before you have recovered.',
    science_note: 'Cycling fitness loves consistency, but consecutive hard rides still need glycogen and sleep to pay off.',
  }),

  'heavy_lower_blocked|offer_adjacent_day': (ev) => ({
    primary_option: { label: `Keep strength on ${toDay(ev)}`, action: 'accept_planner_adjacent_strength' },
    secondary_option: { label: 'Slide strength one day earlier or later', action: 'nudge_strength_day' },
    explanation: 'Same-sport hard pairs were crowding each other, so the plan shifted the lift day slightly.',
    science_note: 'Muscles adapt on the rest between sessions; one quiet day often matters more than the exact lift prescription.',
  }),

  'quality_run_blocked|offer_alternate_stimulus': (ev) => {
    const t = toDay(ev);
    return {
      primary_option: { label: `Keep the planner’s ${t} quality run`, action: 'accept_planner_quality_run_stimulus' },
      secondary_option: { label: 'Trade some run sharpness for easier legs this week', action: 'trade_run_stimulus_for_volume' },
      explanation: 'Your quality run timing ran into spacing rules around long runs or bricks.',
      science_note: 'Long runs build endurance; mid-week quality builds speed—both help, but they compete for the same recovery budget.',
    };
  },

  'quality_swim_blocked|offer_alternate_stimulus': (ev) => ({
    primary_option: { label: `Keep quality swim on ${toDay(ev)}`, action: 'accept_planner_swim_stimulus' },
    secondary_option: { label: 'Keep yardage but ease the main set', action: 'soften_swim_main_set' },
    explanation: 'Pool quality had to move for spacing; you can keep the move or soften the main set instead.',
    science_note: 'Threshold swim work raises heart and breathing stress similar to a hard run, just with less leg pounding.',
  }),

  'quality_bike_blocked|offer_alternate_stimulus': (ev) => ({
    primary_option: { label: `Keep quality bike on ${toDay(ev)}`, action: 'accept_planner_bike_stimulus' },
    secondary_option: { label: 'Keep the day but ride easier', action: 'soften_bike_quality_week' },
    explanation: 'Bike quality moved for calendar reasons; you can accept the new day or keep the day and drop intensity.',
    science_note: 'Sweet spot and threshold rides create a deep leg burn that lasts into the next day if recovery is short.',
  }),

  'third_swim_blocked|offer_drop_explained': (ev) => ({
    primary_option: { label: `Accept dropping the extra swim from ${prefDay(ev)}`, action: 'accept_drop_third_swim' },
    secondary_option: { label: 'Try again next week with fresher bike and run', action: 'defer_third_swim' },
    explanation: ev.applied_resolution?.note || 'There was not a clean day left for the third swim without breaking other rules.',
    science_note: 'When the calendar is full, something has to give; the planner would rather say that out loud than hide it.',
  }),

  'quality_run_blocked|offer_drop_explained': (ev) => ({
    primary_option: { label: 'Accept dropping or softening this quality run', action: 'accept_drop_quality_run' },
    secondary_option: { label: 'Shrink other hard pieces and retry placement', action: 'trim_peer_sessions_retry' },
    explanation: ev.applied_resolution?.note ||
      'The quality run could not be placed without breaking same-day pairing rules.',
    science_note: 'Hard sessions only work if the week still has enough easy time to absorb them.',
  }),

  'quality_swim_blocked|offer_drop_explained': (ev) => ({
    primary_option: { label: 'Accept simplifying this swim slot', action: 'accept_drop_quality_swim' },
    secondary_option: { label: 'Keep yards easy and skip the hard main set', action: 'easy_yardage_only' },
    explanation: ev.applied_resolution?.note ||
      'Quality swim could not be paired cleanly with what else landed that day.',
    science_note: 'Swim pairs easily with easy bike or run, but two true quality sessions the same day is a heavy ask.',
  }),

  'quality_bike_blocked|offer_drop_explained': (ev) => ({
    primary_option: { label: 'Accept easing this quality ride', action: 'accept_drop_quality_bike' },
    secondary_option: { label: 'Shorten the ride but keep some tempo', action: 'shorten_quality_bike' },
    explanation: ev.applied_resolution?.note ||
      'Quality bike could not be placed without clashing with another hard or long session.',
    science_note: 'Mid-week bike quality is powerful, but it needs air around it the same way run intervals do.',
  }),

  'heavy_lower_blocked|offer_drop_explained': (ev) => ({
    primary_option: { label: 'Accept skipping this lower-body session', action: 'accept_drop_lower_strength' },
    secondary_option: { label: 'Keep an upper-only strength day instead', action: 'swap_to_upper_only' },
    explanation: ev.applied_resolution?.note ||
      'Lower-body strength was removed so the day could stay within product safety rules.',
    science_note: 'Strength supports durability, but not if it forces illegal same-day stacks with swim, bike, or run quality.',
  }),

  'brick_blocked|offer_drop_explained': () => ({
    primary_option: { label: 'Accept simplifying the weekend ride or run leg', action: 'accept_soften_brick' },
    secondary_option: { label: 'Keep volume but drop race-pace pieces', action: 'brick_z2_only' },
    explanation: 'Brick day could not be combined with another protected hard session on the calendar.',
    science_note: 'Bricks are already a big dose; adding another hard fight the same day rarely improves race readiness.',
  }),

  'quality_run_blocked|offer_consolidate': (ev) => ({
    primary_option: { label: 'Run quality in the morning and lift legs after', action: 'consolidate_am_run_pm_lift' },
    secondary_option: { label: 'Keep sessions split on separate days', action: 'keep_split_days' },
    explanation: `You could stack run quality and lower-body strength on ${toDay(ev)} with clear morning and evening spacing.`,
    science_note: 'Same-day run then lift can work when both are planned and food and sleep are solid; it is not the default because it is demanding.',
  }),

  'heavy_lower_blocked|offer_consolidate': (ev) => ({
    primary_option: { label: 'Pair lower-body strength after your quality run', action: 'consolidate_run_then_lift' },
    secondary_option: { label: 'Keep strength on its own day', action: 'keep_strength_split' },
    explanation: `A single long day on ${toDay(ev)} could carry run quality and controlled lifting if you want fewer hard spikes in the week.`,
    science_note: 'Training order matters: finishing hard running before heavy lifting keeps run quality honest and lowers mishap risk.',
  }),

  'quality_swim_blocked|offer_consolidate': () => ({
    primary_option: { label: 'Swim morning and bike easy after', action: 'consolidate_swim_bike_easy_same_day' },
    secondary_option: { label: 'Keep swim and bike quality on different days', action: 'keep_swim_bike_split' },
    explanation: 'You could keep swim quality and an easy spin the same day when the plan needs fewer separate hard touches.',
    science_note: 'Easy cycling after a hard swim flushes the legs without adding another nervous-system peak the same day.',
  }),

  'quality_bike_blocked|offer_consolidate': () => ({
    primary_option: { label: 'Ride quality once and keep the other ride easy', action: 'consolidate_single_quality_bike' },
    secondary_option: { label: 'Spread bike stress across two lighter sessions', action: 'split_bike_stimulus' },
    explanation: 'Two bike intents can merge into one quality ride plus easy spinning if you want fewer mid-week peaks.',
    science_note: 'One well-fueled hard ride usually trains the energy systems better than two half-hearted hard rides.',
  }),

  'third_swim_blocked|offer_consolidate': () => ({
    primary_option: { label: 'Combine drill work with your easy swim', action: 'consolidate_drills_into_easy' },
    secondary_option: { label: 'Keep three separate swims', action: 'keep_three_swims' },
    explanation: 'Technique and aerobic swim work can share a longer single visit when the week is tight.',
    science_note: 'Drills and steady swimming train different pieces; one longer session can cover both if pacing stays honest.',
  }),

  'brick_blocked|offer_consolidate': () => ({
    primary_option: { label: 'Keep brick intensity on the bike and make the run leg easy', action: 'consolidate_brick_bike_hard_run_easy' },
    secondary_option: { label: 'Keep run quality inside the brick only if legs feel ready', action: 'consolidate_full_brick' },
    explanation: 'Brick day can emphasize either bike or run quality while the other leg stays controlled.',
    science_note: 'Race day still asks for both legs fresh enough to finish strong; practice bricks mirror that trade-off.',
  }),
};

function buildFallbackRow(ev: ConflictEvent, pattern: ResolutionPattern, ctx: WeekConflictContext): Row {
  const kind = ev.blocked_intent.session_kind.replace(/_/g, ' ');
  if (pattern === 'offer_adjacent_day') {
    return {
      primary_option: { label: `Use the planner’s ${toDay(ev)} placement`, action: 'accept_planner_day_shift' },
      secondary_option: { label: `Prefer ${prefDay(ev)} and adjust peers`, action: 'revert_preferred_day' },
      explanation: ev.applied_resolution?.note || `Scheduling moved your ${kind} to ${toDay(ev)} to reduce same-sport stacking.`,
      science_note: 'Spacing hard days gives tissues and fuel stores time to catch up before the next big bout.',
    };
  }
  if (pattern === 'offer_alternate_stimulus') {
    return {
      primary_option: { label: 'Keep the planner’s version of this week', action: 'accept_planner_stimulus' },
      secondary_option: { label: 'Trade intensity for extra easy time', action: 'trade_intensity_for_easy' },
      explanation: ev.applied_resolution?.note || `The plan adjusted ${kind} to protect the rest of the week.`,
      science_note: 'Fitness grows during recovery; swapping a hard edge for easy volume sometimes preserves the trend line.',
    };
  }
  if (pattern === 'athlete_choice_quality_or_stimulus') {
    return {
      primary_option: { label: `Keep the planner choice on ${toDay(ev)}`, action: 'accept_planner_choice' },
      secondary_option: { label: `Favor your original ${prefDay(ev)} preference`, action: 'favor_preferred_day' },
      explanation: ev.applied_resolution?.note || `${kind} timing trades off with another anchor you care about.`,
      science_note: 'There is rarely a perfect week; picking what you protect tells the plan what matters most right now.',
    };
  }
  if (pattern === 'offer_consolidate') {
    return {
      primary_option: { label: 'Stack compatible sessions on one day', action: 'accept_consolidated_day' },
      secondary_option: { label: 'Keep hard sessions on separate days', action: 'reject_consolidation' },
      explanation: 'You can sometimes merge compatible hard pieces when the calendar is tight.',
      science_note: 'Consolidation saves calendar space but raises single-day load, so fueling and sleep have to match.',
    };
  }
  return {
    primary_option: { label: 'Accept the planner fix', action: 'accept_planner_fix' },
    secondary_option: { label: 'Undo and simplify another session', action: 'undo_and_simplify_peer' },
    explanation: ev.applied_resolution?.note || `The plan changed ${kind} to stay within pairing rules.`,
    science_note: 'When no clean day exists, the engine picks the least-bad fix and should say so plainly.',
  };
}

function buildResolution(ev: ConflictEvent, ctx: WeekConflictContext): ConflictResolution {
  const pattern = chooseResolutionPattern(ev.blocking_reasons, ctx);

  if (pattern === 'no_options_race') {
    const row = rowNoOptionsRace(ev);
    return {
      conflict_id: ev.conflict_id,
      conflict_type: ev.conflict_type,
      resolution: pattern,
      explanation: row.explanation,
      science_note: row.science_note,
      adjustable: true,
    };
  }
  if (pattern === 'no_options_recovery') {
    const row = rowNoOptionsRecovery(ev, ctx);
    return {
      conflict_id: ev.conflict_id,
      conflict_type: ev.conflict_type,
      resolution: pattern,
      explanation: row.explanation,
      science_note: row.science_note,
      adjustable: true,
    };
  }

  const key = `${ev.conflict_type}|${pattern}` as keyof typeof TABLE;
  const fn = TABLE[key];
  const row: Row = fn != null ? fn(ev, ctx) : buildFallbackRow(ev, pattern, ctx);

  return {
    conflict_id: ev.conflict_id,
    conflict_type: ev.conflict_type,
    resolution: pattern,
    explanation: row.explanation,
    science_note: row.science_note,
    adjustable: true,
    ...(row.primary_option ? { primary_option: row.primary_option } : {}),
    ...(row.secondary_option ? { secondary_option: row.secondary_option } : {}),
  };
}

/**
 * Map each `ConflictEvent` to one `ConflictResolution` for UI / Arc (Step 3).
 */
export function resolveWeekConflicts(
  events: ConflictEvent[],
  weekContext: WeekConflictContext,
): ConflictResolution[] {
  if (!events?.length) return [];
  return events.map((ev) => buildResolution(ev, weekContext));
}
