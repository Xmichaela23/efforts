// ============================================================================
// PLACEMENT TYPES
// 
// Types for methodology-aware strength placement strategies
// ============================================================================

export type MethodologyId = 'hal_higdon_complete' | 'jack_daniels_performance' | 'triathlon';
export type StrengthProtocolId = 'durability' | 'neural_speed' | 'upper_aesthetics' | 'triathlon';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Slot =
  | 'upper_primary'
  | 'upper_optional'
  | 'lower_primary'
  | 'lower_optional'
  | 'mobility_optional'
  | 'none';

export interface PlacementContext {
  methodology: MethodologyId;
  protocol: StrengthProtocolId;
  strengthFrequency: 0 | 1 | 2 | 3;
  noDoubles: boolean; // cannot do Tue AM + Tue PM
  qualityDays: Weekday[]; // e.g. ['tue','thu']
  longRunDay: Weekday; // e.g. 'sun'
  /** Flagged injury-prone areas from athlete_memory (e.g. ['achilles','it_band']). Used to protect the day before the long run from heavy lower-body sessions. */
  injuryHotspots?: string[];
  /** Days with brick sessions — strength must never be placed here (triathlon only). */
  brickDays?: Weekday[];
  /** Days carrying a HARD endurance session — trigger 6-h interference note (triathlon only). */
  hardEnduranceDays?: Weekday[];
}

export interface PlacementStrategy {
  name: string;
  // Maps weekday -> slot request
  // The scheduler will fulfill these based on frequency (e.g., freq=2 drops optionals)
  slotsByDay: Partial<Record<Weekday, Slot>>;
  // Metadata for resolving specific session types later
  notes?: string;
}
