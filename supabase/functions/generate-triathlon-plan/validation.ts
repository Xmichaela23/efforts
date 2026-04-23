import { GenerateTriPlanRequest, TRI_MIN_WEEKS, TriDistance } from './types.ts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

const VALID_DISTANCES: TriDistance[] = ['sprint', 'olympic', '70.3', 'ironman'];
const VALID_FITNESS   = ['beginner', 'intermediate', 'advanced'];
const VALID_GOALS     = ['complete', 'performance'];

export function validateRequest(req: GenerateTriPlanRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!req.user_id)   errors.push('user_id is required');
  if (!req.distance || !VALID_DISTANCES.includes(req.distance as TriDistance))
    errors.push(`distance must be one of: ${VALID_DISTANCES.join(', ')}`);
  if (!req.fitness || !VALID_FITNESS.includes(req.fitness))
    errors.push(`fitness must be one of: ${VALID_FITNESS.join(', ')}`);
  if (!req.goal || !VALID_GOALS.includes(req.goal))
    errors.push(`goal must be one of: ${VALID_GOALS.join(', ')}`);
  if (!req.duration_weeks || req.duration_weeks < 4)
    errors.push('duration_weeks must be at least 4');
  if (req.duration_weeks > 32)
    warnings.push('Plans longer than 32 weeks are unusual — consider breaking into blocks');

  if (req.distance && req.fitness) {
    const minWeeks = TRI_MIN_WEEKS[req.distance as TriDistance]?.[req.fitness] ?? 6;
    if (req.duration_weeks < minWeeks) {
      errors.push(
        `${req.distance} for a ${req.fitness} athlete requires at least ${minWeeks} weeks. ` +
        `Got ${req.duration_weeks}.`
      );
    }
  }

  if (req.ftp !== undefined && (req.ftp <= 0 || req.ftp > 600))
    warnings.push('FTP value looks outside the normal range (0–600 watts)');

  if (req.strength_frequency !== undefined &&
      ![0, 1, 2].includes(req.strength_frequency))
    errors.push('strength_frequency must be 0, 1, or 2');

  const validIntent = ['performance', 'completion', 'comeback', 'first_race'] as const;
  if (req.training_intent !== undefined &&
      !validIntent.includes(req.training_intent as (typeof validIntent)[number])) {
    errors.push(`training_intent must be one of: ${validIntent.join(', ')}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validatePlanSchema(sessions_by_week: Record<string, any[]>): ValidationResult {
  const errors: string[] = [];

  if (!sessions_by_week || typeof sessions_by_week !== 'object')
    return { valid: false, errors: ['sessions_by_week is missing or invalid'] };

  const validTypes = ['run', 'bike', 'swim', 'strength', 'brick'];
  const validDays  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  for (const [week, sessions] of Object.entries(sessions_by_week)) {
    if (!Array.isArray(sessions)) {
      errors.push(`Week ${week}: sessions must be an array`);
      continue;
    }
    for (const s of sessions) {
      if (!validDays.includes(s.day))   errors.push(`Week ${week}: invalid day "${s.day}"`);
      if (!validTypes.includes(s.type)) errors.push(`Week ${week}: invalid type "${s.type}"`);
      if (!s.name)                      errors.push(`Week ${week}: session missing name`);
      if (typeof s.duration !== 'number' || s.duration < 0)
        errors.push(`Week ${week}: session "${s.name}" has invalid duration`);
    }
  }

  return { valid: errors.length === 0, errors };
}
