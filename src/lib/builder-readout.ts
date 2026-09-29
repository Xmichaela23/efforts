/**
 * WHAT THE SERVER SAYS ABOUT A PREVIEW, AND THE CALL THAT ASKS FOR IT WITHOUT THE BLOCK
 * (2026-09-10, audit H-P07, H-P06, H-P05, H-W05, H-W06, H-W10).
 *
 * `create-goal-and-materialize-plan` returns `readout` beside every preview: the endurance step's
 * lengths and chip numbers, the race intake's weeks and mileage lines, the club-night note and the
 * sample week's counts. The builder prints these and works none of them out.
 *
 * `fetchIntakeReadout` sends `preview_scope: 'intake'`, which answers the endurance and race steps
 * without composing twelve weeks — those steps ask on every tap. A full preview still goes through
 * `useArcSetupComplete().preview`, which attaches the same readout to the plan as `_readout`.
 */
import { getStoredUserId, invokeFunction } from '@/lib/supabase';
import type { ArcSetupPayload } from '@/lib/parse-arc-setup';
import type { SlotKey, SlotSport } from '@/lib/standing-plan-week-copy';

export type Both = { mi: number; km: number };

export type RaceIntakeReadout = {
  date_passed?: true;
  weeks?: number;
  weeks_at_cap?: boolean;
  tier_seeds?: Record<'beginner' | 'intermediate' | 'advanced', { weeklyMi: number; longRunMi: number }>;
  weekly?: {
    ok: boolean;
    bound: 'base_floor' | 'engine_clamp' | 'long_run_share' | null;
    floor: Both;
    long_run_week1: Both;
    share_pct: number | null;
  } | null;
  tier_note?: string | null;
  long_run?: {
    peak: Both;
    typical: [Both, Both] | null;
    short_of_table: boolean;
    half_full_arc: boolean;
  } | null;
};

/** One experience chip, as `experienceChips` measures it on the server. */
export type ExperienceChip = {
  tier: 'newer' | 'experienced';
  longestMin: number | null;
  needsHours: number;
  hardCount: number;
  longFloorMin: number | null;
};
export type ExperienceChoice = { newer: ExperienceChip; experienced: ExperienceChip } | null;

export type IntakeRow = {
  /** The sport the row's numbers describe; a row is read only while it matches the screen. */
  sport: SlotSport | null;
  length_options: number[] | null;
  fixed_minutes: number | null;
  length_varies: boolean;
  /** The shortest and longest a rotating hard row will be — see the server's `slotLengthRange`. */
  length_range?: { min: number; max: number } | null;
  /**
   * ⛔ THE HARD ROW'S SENTENCE, WRITTEN ON THE SERVER (`HARD_ROW_LINE`, Michael 2026-09-11). It
   * stands where the shape list used to. Null on every other row. ⚠️ The card prints it and composes
   * nothing — a second copy of these words on the phone is how the two come to disagree.
   */
  hard_line: string | null;
};

export type EnduranceIntakeReadout = {
  frame: string;
  /** The answers and workout picks these numbers were worked out for. */
  slots: Partial<Record<SlotKey, SlotSport | null>>;
  archetypes: Partial<Record<SlotKey, string>>;
  rows: Partial<Record<SlotKey, IntakeRow>>;
  experience_chips: Record<SlotSport, ExperienceChoice>;
  has_bounds: { run: boolean; ride: boolean };
  is_lower_bound: boolean;
  run_strength_week: {
    easy_run_minutes: number;
    long_run_options: number[];
    long_run_default: number | null;
    commitment_line: string | null;
    sub_line: string;
    length_label: string;
    long_option_labels: Record<string, string>;
    rows: Array<{
      key: SlotKey; title: string; session: string; length: string | null; is_long: boolean;
      /** An easy row with chips (2026-09-23): the frame's tiers, the first selected. */
      options?: number[]; option_labels?: Record<string, string>; default_minutes?: number;
    }>;
    /** The extra easy runs control (2026-09-22). Absent from an older server. */
    extra?: {
      label: string;
      line: string;
      options: Array<{ count: number; label: string }>;
      rows: Array<{ title: string; session: string; length: string; card?: string }>;
    };
  } | null;
  /** The rides screen (2026-09-27): rows, the long ride's chips, and a switch on each optional ride's own row. */
  ride_strength_week: {
    /** Null on a plan whose own line is not yet approved (Long Ride + Strength, 2026-09-28). */
    sub_line: string | null;
    length_label: string;
    /** `length`: the chips on a ride whose length the rider picks, stored under `length.key` (shared by rides held to one length). */
    rows: Array<{
      key: SlotKey; line: string; is_long: boolean; optional: boolean; optional_line?: string | null;
      length: { key: SlotKey; options: number[]; labels: Record<string, string>; default: number | null; same_as?: string | null } | null;
      /**
       * The level chips on a ride the page prints as a range (p279 day 1). Absent from an older server. The labels are
       * null until their words are approved, and the card draws nothing then.
       */
      level?: { key: SlotKey; label: string | null; default: number; options: Array<{ level: number; label: string | null }> } | null;
    }>;
    easy_line: string | null;
  } | null;
  tier_line: string | null;
};

export type WeekOneSummary = {
  training_days: number;
  rest_days: number;
  /** "Rest" under each day with no session (server, 2026-09-19); days with a session are absent. */
  day_lines?: Record<string, string>;
  lift_days: number;
  total_minutes: number;
  press_days_note: string | null;
  balance_note: string | null;
};

export type BuilderReadout = {
  intake?: EnduranceIntakeReadout | null;
  race_intake?: RaceIntakeReadout | null;
  race_week_note?: string | null;
  week_one?: WeekOneSummary | null;
};

/** The intake's numbers for these answers, without the block. Null when the server sends none. */
export async function fetchIntakeReadout(payload: ArcSetupPayload): Promise<BuilderReadout | null> {
  const userId = getStoredUserId();
  const goal = Array.isArray(payload.goals) ? payload.goals[0] : null;
  if (!userId || !goal) return null;
  const { data, error } = await invokeFunction<{ success?: boolean; readout?: BuilderReadout }>(
    'create-goal-and-materialize-plan',
    {
      user_id: userId,
      mode: 'create',
      goal,
      preview: true,
      preview_scope: 'intake',
      ...(payload.plan_start_date ? { plan_start_date: payload.plan_start_date } : {}),
    },
  );
  if (error || !data || data.success === false) {
    if (error) console.warn('[intake-readout] invoke failed:', error.message);
    return null;
  }
  return data.readout ?? null;
}
