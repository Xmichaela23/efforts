import Ajv from 'ajv';
import schema from './contracts/universal_plan.schema.json';

export type UniversalPlan = {
  name: string;
  description?: string;
  duration_weeks: number;
  plan_type?: string;
  sessions_by_week: Record<string, any[]>;
  notes_by_week?: Record<string, string[]>;
};

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema as any);

export function validateUniversalPlan(json: unknown): { ok: true; plan: UniversalPlan } | { ok: false; errors: string } {
  const valid = validate(json);
  if (!valid) {
    const msg = ajv.errorsText(validate.errors, { separator: '\n' });
    return { ok: false, errors: msg };
  }
  return { ok: true, plan: json as UniversalPlan };
}


