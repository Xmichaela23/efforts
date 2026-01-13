// ============================================================================
// PROTOCOL SYSTEM TYPES
// 
// These types define the contract that all strength protocols must satisfy.
// ============================================================================

import { StrengthIntent, IntentPriority, RepProfile } from './intent-taxonomy.ts';

// ============================================================================
// SHARED PHASE TYPE
// 
// Minimal phase interface for strength protocols.
// Each generator (run/cycling/triathlon) maps their Phase to this.
// ============================================================================

export interface StrengthPhase {
  name: string; // 'Base' | 'Speed' | 'Race Prep' | 'Taper'
  start_week: number;
  end_week: number;
  weeks_in_phase: number;
}

// ============================================================================
// PROTOCOL CONTEXT
// ============================================================================

/**
 * Context passed to protocols when generating sessions
 */
export interface ProtocolContext {
  // Week information
  weekIndex: number; // Absolute week in plan (1-based)
  weekInPhase: number; // Week within current phase (1-based)
  phase: StrengthPhase; // Current phase (Base, Speed, Race Prep, Taper)
  totalWeeks: number;
  isRecovery: boolean; // Is this a recovery week?
  
  // Primary sport schedule (for placement/guardrails)
  // Normalized across disciplines: long sessions, quality sessions, easy sessions
  // 
  // Future: For multi-sport (triathlon), extend to:
  //   schedules: { primary: Schedule, secondary?: Schedule, tertiary?: Schedule }
  //   or scheduleBlocks: Day[] with tags (LONG, QUALITY, EASY) and discipline field
  primarySchedule: {
    longSessionDays: string[]; // Days with longest/highest volume sessions (e.g., ['Sunday'])
    // Future: Can extend to highFatigueDays: string[] for days with tempo + long-ish sessions
    qualitySessionDays: string[]; // Days with quality/speed work (intervals, tempo, etc.)
    easySessionDays: string[]; // Days with easy/recovery sessions only
  };
  
  // User baselines and preferences
  userBaselines: {
    squat1RM?: number;
    deadlift1RM?: number;
    bench1RM?: number;
    overhead1RM?: number;
    equipment: 'home_gym' | 'commercial_gym';
  };
  
  // Strength training configuration
  strengthFrequency: 2 | 3; // How many strength sessions per week
  
  // Constraints
  constraints: {
    maxSessionDuration?: number; // Minutes
    preferredDays?: string[]; // User's preferred strength days
  };
  
  // Optional history (for adaptive protocols later)
  history?: {
    lastWeekCompletedSessions?: string[]; // Intent IDs that were completed
    skippedSessions?: string[]; // Intent IDs that were skipped
  };
}

// ============================================================================
// PROTOCOL OUTPUT
// ============================================================================

/**
 * A strength session with intent (no day assignment)
 */
export interface IntentSession {
  // Intent classification
  intent: StrengthIntent;
  priority: IntentPriority; // Can override default from intent metadata
  
  // Session details
  name: string;
  description: string;
  duration: number; // Minutes
  
  // Exercises (protocol chooses specific exercises for the intent)
  exercises: StrengthExercise[];
  
  // Rep profile (for intents that support multiple profiles)
  repProfile?: RepProfile; // 'strength' | 'hypertrophy' | 'maintenance'
  
  // Metadata
  tags: string[]; // For filtering/analytics
  notes?: string[]; // User-facing notes
}

/**
 * Strength exercise (matches existing structure but with intent context)
 */
export interface StrengthExercise {
  name: string;
  sets: number;
  reps: number | string; // e.g., 8 or "8/leg" or "8-10"
  weight: string; // e.g., "75% 1RM" or "25 lb each"
  target_rir?: number; // Reps in reserve target
  notes?: string;
}

// ============================================================================
// PROTOCOL CONTRACT
// ============================================================================

/**
 * Protocol interface - all protocols must implement this
 */
export interface StrengthProtocol {
  /**
   * Protocol identifier (used in routing) - canonical ID
   */
  id: string;
  
  /**
   * Legacy protocol IDs for backwards compatibility
   * TODO: Remove after 2025-03-01
   */
  legacy_ids?: string[];
  
  /**
   * Human-readable protocol name
   */
  name: string;
  
  /**
   * User-facing description
   */
  description: string;
  
  /**
   * Explicit tradeoffs (what this protocol does NOT do)
   */
  tradeoffs: string[];
  
  /**
   * Generate sessions for a week
   * 
   * Returns intent sessions (no day assignment).
   * Placement policy will assign days later.
   */
  createWeekSessions(context: ProtocolContext): IntentSession[];
  
  /**
   * Get protocol-specific guardrails
   * (in addition to intent-based guardrails)
   */
  getGuardrails?(context: ProtocolContext): ProtocolGuardrail[];
}

// ============================================================================
// GUARDRAILS
// ============================================================================

export type GuardrailSeverity = 'warn' | 'modify' | 'reschedule' | 'skip';

export interface ProtocolGuardrail {
  /**
   * What triggers this guardrail
   */
  condition: string; // Human-readable description
  
  /**
   * Severity level
   */
  severity: GuardrailSeverity;
  
  /**
   * Action to take
   */
  action: {
    type: 'warn' | 'reduce_sets' | 'reduce_reps' | 'reduce_intensity' | 'reschedule' | 'skip';
    params?: Record<string, any>; // e.g., { reduceBy: 0.5 } for reduce_sets
  };
  
  /**
   * Message to show user
   */
  message: string;
}

// ============================================================================
// PLACEMENT POLICY
// ============================================================================

export type PlacementPolicyId = 'long_run_dominant' | 'quality_dominant' | 'balanced';

/**
 * Placement policy assigns intent sessions to days
 */
export interface PlacementPolicy {
  id: PlacementPolicyId;
  name: string;
  description: string;
  
  /**
   * Assign intent sessions to days
   * 
   * Returns day-specific sessions with guardrail annotations
   */
  assignSessions(
    intentSessions: IntentSession[],
    primarySchedule: ProtocolContext['primarySchedule'],
    guardrails: GuardrailResult[]
  ): PlacedSession[];
}

/**
 * A session that has been assigned to a day
 */
export interface PlacedSession extends IntentSession {
  day: string; // 'Monday' | 'Wednesday' | 'Friday' | etc.
  isOptional: boolean; // Can user skip this?
  guardrailWarnings?: string[]; // Warnings from guardrails
  guardrailModifications?: string[]; // Modifications applied
}

/**
 * Result from guardrail validation
 */
export interface GuardrailResult {
  sessionIndex: number; // Index in intentSessions array
  intent: StrengthIntent;
  guardrails: ProtocolGuardrail[];
  finalAction: 'keep' | 'modify' | 'reschedule' | 'skip';
  modifiedSession?: IntentSession; // If action is 'modify'
  suggestedDay?: string; // If action is 'reschedule'
}
