// Validation module for generated run plans
// Ensures plans conform to schema and use valid tokens

import { 
  GeneratePlanRequest, 
  TrainingPlan, 
  ValidationResult,
  APPROACH_CONSTRAINTS,
  getMarathonDurationRequirements
} from './types.ts';

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

/**
 * Validate the incoming generation request
 */
export function validateRequest(request: GeneratePlanRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!request.user_id) {
    errors.push('user_id is required');
  }

  if (!request.distance) {
    errors.push('distance is required');
  } else if (!['5k', '10k', 'half', 'marathon', 'maintenance'].includes(request.distance)) {
    errors.push(`Invalid distance: ${request.distance}. Must be 5k, 10k, half, marathon, or maintenance`);
  }

  if (!request.fitness) {
    errors.push('fitness is required');
  } else if (!['beginner', 'intermediate', 'advanced'].includes(request.fitness)) {
    errors.push(`Invalid fitness: ${request.fitness}. Must be beginner, intermediate, or advanced`);
  }

  if (!request.duration_weeks) {
    errors.push('duration_weeks is required');
  } else if (request.duration_weeks < 4) {
    errors.push('duration_weeks must be at least 4');
  } else if (request.duration_weeks > 52) {
    errors.push('duration_weeks cannot exceed 52');
  }

  if (!request.approach) {
    errors.push('approach is required');
  } else if (!['simple_completion', 'performance_build'].includes(request.approach)) {
    errors.push(`Invalid approach: ${request.approach}. Must be simple_completion or performance_build`);
  }

  if (!request.days_per_week) {
    errors.push('days_per_week is required');
  } else if (!['3-4', '4-5', '5-6', '6-7'].includes(request.days_per_week)) {
    errors.push(`Invalid days_per_week: ${request.days_per_week}`);
  }

  // Validate approach + days_per_week compatibility
  if (request.approach && request.days_per_week) {
    const constraints = APPROACH_CONSTRAINTS[request.approach];
    if (constraints && !constraints.supported_days.includes(request.days_per_week)) {
      errors.push(
        `${request.approach} does not support ${request.days_per_week} days/week. ` +
        `Supported: ${constraints.supported_days.join(', ')}`
      );
    }
  }

  // Goal validation (required for non-maintenance)
  if (request.distance !== 'maintenance' && !request.goal) {
    warnings.push('goal is recommended for race-focused plans');
  }

  // Strength frequency validation
  if (request.strength_frequency !== undefined) {
    if (![0, 1, 2, 3].includes(request.strength_frequency)) {
      errors.push('strength_frequency must be 0, 1, 2, or 3');
    }
  }

  // Strength protocol validation and normalization
  // If strength_power tier is selected with frequency > 0, protocol is required
  if (request.strength_tier === 'strength_power' && request.strength_frequency && request.strength_frequency > 0) {
    if (!request.strength_protocol) {
      errors.push('strength_protocol is required for strength_power tier');
    } else {
      // Supported protocols (runtime list - excludes minimum_dose until frontend supports it)
      const validProtocols = new Set<string>(['durability', 'neural_speed', 'upper_aesthetics']);
      // Also accept legacy IDs for temporary backward compatibility (will be normalized)
      const legacyProtocols = new Set<string>(['foundation_durability', 'performance_neural', 'upper_priority_hybrid']);
      
      if (!validProtocols.has(request.strength_protocol) && !legacyProtocols.has(request.strength_protocol)) {
        const validList = Array.from(validProtocols).join(', ');
        const errorMsg = `Invalid strength_protocol: "${request.strength_protocol}". Must be one of: ${validList}`;
        console.error(`[Validation] ${errorMsg}`);
        errors.push(errorMsg);
      }
      
      // Normalize legacy IDs to new canonical IDs (early normalization)
      // Derive normalized value explicitly to avoid mutation side-effects
      // TODO: Remove legacy support after 2025-03-01 - all clients should use new IDs
      const legacyToNew: Record<string, string> = {
        'foundation_durability': 'durability',
        'performance_neural': 'neural_speed',
        'upper_priority_hybrid': 'upper_aesthetics',
      };
      
      // After this point, request.strength_protocol is guaranteed to be canonical
      const normalizedProtocol = legacyProtocols.has(request.strength_protocol) 
        ? legacyToNew[request.strength_protocol] 
        : request.strength_protocol;
      
      // Set normalized value explicitly (not a mutation side-effect)
      (request as any).strength_protocol = normalizedProtocol;
    }
  } else if (request.strength_protocol) {
    // Guardrail: ignore protocol if tier isn't strength_power (log for debugging)
    console.warn(`strength_protocol "${request.strength_protocol}" provided but tier is not strength_power. Ignoring.`);
    delete (request as any).strength_protocol;
  }

  // Race date validation
  if (request.race_date) {
    const raceDate = new Date(request.race_date);
    const now = new Date();
    if (isNaN(raceDate.getTime())) {
      errors.push('Invalid race_date format. Use ISO date format (YYYY-MM-DD)');
    } else if (raceDate < now) {
      errors.push('race_date must be in the future');
    }
  }

  // Marathon duration validation - stricter requirements for shorter plans
  if (request.distance === 'marathon' && request.duration_weeks) {
    const durationReqs = getMarathonDurationRequirements(request.duration_weeks);
    
    // Minimum duration check
    if (request.duration_weeks < 10) {
      errors.push(
        `Marathon plans require at least 10 weeks. ${request.duration_weeks} weeks is too short ` +
        `to safely prepare for 26.2 miles.`
      );
    }
    
    // Minimum weekly miles check for short plans
    if (durationReqs.minWeeklyMiles > 0) {
      if (request.current_weekly_miles === undefined) {
        warnings.push(
          `A ${request.duration_weeks}-week marathon plan requires an established running base. ` +
          `Confirm you are currently running at least ${durationReqs.minWeeklyMiles} miles per week.`
        );
      } else if (request.current_weekly_miles < durationReqs.minWeeklyMiles) {
        errors.push(
          `A ${request.duration_weeks}-week marathon plan requires at least ${durationReqs.minWeeklyMiles} miles/week baseline. ` +
          `Your current ${request.current_weekly_miles} mpw suggests a longer plan (14-16 weeks) would be safer.`
        );
      }
    }
    
    // Beginner + short plan check
    if (request.fitness === 'beginner' && request.duration_weeks < 14) {
      errors.push(
        `Beginners should use a 14+ week marathon plan. ` +
        `A ${request.duration_weeks}-week plan is too aggressive for first-time marathoners.`
      );
    }
    
    // Add warning for aggressive timelines
    if (durationReqs.warning) {
      warnings.push(durationReqs.warning);
    }
    
    // Add prerequisite info as warnings
    if (durationReqs.additionalPrereqs.length > 0) {
      warnings.push(
        `Prerequisites for ${request.duration_weeks}-week marathon plan: ` +
        durationReqs.additionalPrereqs.join('; ')
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// PLAN SCHEMA VALIDATION
// ============================================================================

/**
 * Validate generated plan structure matches authoring schema
 */
export function validatePlanSchema(plan: TrainingPlan): ValidationResult {
  const errors: string[] = [];

  // Required top-level fields
  if (!plan.name) errors.push('Plan name is required');
  if (!plan.description) errors.push('Plan description is required');
  if (!plan.duration_weeks || plan.duration_weeks < 1) {
    errors.push('Valid duration_weeks is required');
  }
  if (!plan.units || !['imperial', 'metric'].includes(plan.units)) {
    errors.push('units must be "imperial" or "metric"');
  }

  // Sessions validation
  if (!plan.sessions_by_week || Object.keys(plan.sessions_by_week).length === 0) {
    errors.push('sessions_by_week is required and cannot be empty');
  } else {
    for (const [week, sessions] of Object.entries(plan.sessions_by_week)) {
      const weekNum = parseInt(week, 10);
      if (isNaN(weekNum) || weekNum < 1) {
        errors.push(`Invalid week key: ${week}`);
        continue;
      }

      if (!Array.isArray(sessions)) {
        errors.push(`Week ${week} sessions must be an array`);
        continue;
      }

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        const prefix = `Week ${week}, session ${i + 1}`;

        // Required session fields
        if (!session.day) {
          errors.push(`${prefix}: day is required`);
        } else if (!isValidDay(session.day)) {
          errors.push(`${prefix}: invalid day "${session.day}". Must be Title Case (Monday, Tuesday, etc.)`);
        }

        if (!session.type) {
          errors.push(`${prefix}: type is required`);
        } else if (!['run', 'bike', 'swim', 'strength'].includes(session.type)) {
          errors.push(`${prefix}: invalid type "${session.type}". Must be run, bike, swim, or strength`);
        }

        if (!session.name) {
          errors.push(`${prefix}: name is required`);
        }

        if (typeof session.duration !== 'number' || session.duration <= 0) {
          errors.push(`${prefix}: duration must be a positive number`);
        }

        // Type-specific validation
        if (session.type === 'strength') {
          if (!session.strength_exercises || !Array.isArray(session.strength_exercises)) {
            errors.push(`${prefix}: strength sessions require strength_exercises array`);
          } else {
            for (const ex of session.strength_exercises) {
              if (!ex.name) errors.push(`${prefix}: strength exercise missing name`);
              if (typeof ex.sets !== 'number') errors.push(`${prefix}: strength exercise ${ex.name} missing sets`);
            }
          }
          if (session.steps_preset) {
            errors.push(`${prefix}: strength sessions should not have steps_preset`);
          }
        } else {
          // Run/bike/swim should have steps_preset
          if (!session.steps_preset || !Array.isArray(session.steps_preset) || session.steps_preset.length === 0) {
            errors.push(`${prefix}: ${session.type} sessions require steps_preset array`);
          }
        }

        if (!session.tags || !Array.isArray(session.tags)) {
          errors.push(`${prefix}: tags array is required`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

// Known valid token patterns (simplified - in production, load from token library)
const VALID_TOKEN_PATTERNS = [
  // Warmup/Cooldown - time based
  /^warmup_run_(easy|quality)_\d+min$/,
  /^cooldown_easy_\d+min$/,
  // Warmup/Cooldown - distance based
  /^warmup_run_easy_\d+mi$/,
  /^cooldown_easy_\d+mi$/,
  // Easy runs - time and distance based
  /^run_easy_\d+min$/,
  /^run_easy_\d+mi$/,
  // Long runs - time based
  /^longrun_\d+min_(easypace|easy)(_last\d+min_MP)?$/,
  // Long runs - distance based
  /^longrun_\d+mi_easypace$/,
  /^longrun_\d+mi_easypace_last\d+mi_MP$/,
  // Marathon pace runs
  /^run_mp_\d+mi$/,
  // Intervals
  /^interval_\d+x\d+(m|mi)_5kpace_[rR]\d+(s|min)?$/,
  // Tempo - legacy (5kpace) and new (threshold)
  /^tempo_\d+(min|mi)_5kpace(_plus\d+:\d+)?$/,
  /^tempo_\d+(min|mi)_threshold$/,
  // Cruise intervals
  /^cruise_\d+x\d+mi_T_pace_r\d+s$/,
  /^cruise_\d+x\d+mi_threshold_r\d+s$/,
  // Fartlek
  /^fartlek_\d+x\d+-\d+s_moderate$/,
  // Strides
  /^strides_\d+x\d+[sm]$/
];

/**
 * Validate that all tokens in the plan are recognized
 */
export function validateTokens(plan: TrainingPlan): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unknownTokens = new Set<string>();

  for (const [week, sessions] of Object.entries(plan.sessions_by_week)) {
    for (const session of sessions) {
      if (session.steps_preset) {
        for (const token of session.steps_preset) {
          if (!isValidToken(token)) {
            unknownTokens.add(token);
            warnings.push(`Week ${week}, ${session.name}: Unknown token "${token}"`);
          }
        }
      }
    }
  }

  // Only error if ALL tokens are unknown (plan would be unusable)
  if (unknownTokens.size > 0) {
    // Just warnings for now - materialize-plan may still handle them
  }

  return {
    valid: true, // Tokens are warnings, not errors
    errors,
    warnings
  };
}

/**
 * Check if a token matches known patterns
 */
function isValidToken(token: string): boolean {
  // Check against known patterns
  for (const pattern of VALID_TOKEN_PATTERNS) {
    if (pattern.test(token)) {
      return true;
    }
  }

  // Check specific known tokens
  const knownTokens = [
    'warmup_run_easy_10min',
    'warmup_run_quality_12min',
    'warmup_run_easy_1mi',
    'cooldown_easy_10min',
    'cooldown_easy_1mi',
    'strides_6x20s',
    'strides_4x100m'
  ];

  return knownTokens.includes(token);
}

/**
 * Validate day name is Title Case
 */
function isValidDay(day: string): boolean {
  const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return validDays.includes(day);
}

// ============================================================================
// CONFLICT DETECTION (for schedule validation)
// ============================================================================

export interface ScheduleConflict {
  week: number;
  day: string;
  sessions: string[];
  reason: string;
  severity: 'error' | 'warning';
}

/**
 * Detect scheduling conflicts in generated plan
 */
export function detectScheduleConflicts(plan: TrainingPlan): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const week = parseInt(weekStr, 10);
    
    // Group sessions by day
    const byDay: Record<string, typeof sessions> = {};
    for (const session of sessions) {
      if (!byDay[session.day]) byDay[session.day] = [];
      byDay[session.day].push(session);
    }

    // Check for multiple hard sessions on same day
    for (const [day, daySessions] of Object.entries(byDay)) {
      const hardSessions = daySessions.filter(s => 
        s.tags.some(t => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t))
      );
      
      if (hardSessions.length > 1) {
        conflicts.push({
          week,
          day,
          sessions: hardSessions.map(s => s.name),
          reason: 'Multiple hard sessions on same day',
          severity: 'error'
        });
      }

      // Strength + hard run on same day
      const strengthSessions = daySessions.filter(s => s.type === 'strength');
      if (strengthSessions.length > 0 && hardSessions.length > 0) {
        conflicts.push({
          week,
          day,
          sessions: [...strengthSessions, ...hardSessions].map(s => s.name),
          reason: 'Strength and hard run on same day',
          severity: 'warning'
        });
      }
    }

    // Check consecutive days
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (let i = 0; i < dayOrder.length - 1; i++) {
      const today = byDay[dayOrder[i]] || [];
      const tomorrow = byDay[dayOrder[i + 1]] || [];

      const todayHasHard = today.some(s => 
        s.tags.some(t => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t))
      );
      const tomorrowHasHard = tomorrow.some(s => 
        s.tags.some(t => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t))
      );

      if (todayHasHard && tomorrowHasHard) {
        conflicts.push({
          week,
          day: dayOrder[i],
          sessions: [
            ...today.filter(s => s.tags.some(t => ['hard_run', 'intervals', 'tempo'].includes(t))),
            ...tomorrow.filter(s => s.tags.some(t => ['hard_run', 'intervals', 'tempo'].includes(t)))
          ].map(s => s.name),
          reason: 'Hard sessions on consecutive days',
          severity: 'warning'
        });
      }
    }
  }

  return conflicts;
}
