/**
 * Markdown lines for plan exports — human-readable wizard / Arc preferences from goals.training_prefs.
 */

function titleCaseKey(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtPrefScalar(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'string') {
    const t = val.trim();
    return t.length > 280 ? `${t.slice(0, 277)}…` : t;
  }
  return '';
}

/** Preferred-day anchors from wizard (`preferred_days`). */
function formatPreferredDays(pd: unknown): string[] {
  if (!pd || typeof pd !== 'object') return [];
  const o = pd as Record<string, unknown>;
  const preferredOrder = [
    'long_run',
    'long_ride',
    'quality_bike',
    'easy_bike',
    'quality_run',
    'easy_run',
    'swim',
    'strength',
  ];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const k of preferredOrder) {
    if (!(k in o)) continue;
    seen.add(k);
    const v = o[k];
    const label = titleCaseKey(k);
    if (Array.isArray(v)) {
      lines.push(`  - **${label}:** ${v.map((x) => String(x)).join(', ')}`);
    } else {
      const s = fmtPrefScalar(v);
      if (s) lines.push(`  - **${label}:** ${s}`);
    }
  }
  for (const k of Object.keys(o)) {
    if (seen.has(k)) continue;
    const v = o[k];
    const label = titleCaseKey(k);
    if (Array.isArray(v)) {
      lines.push(`  - **${label}:** ${v.map((x) => String(x)).join(', ')}`);
    } else {
      const s = fmtPrefScalar(v);
      if (s) lines.push(`  - **${label}:** ${s}`);
    }
  }
  return lines;
}

const TRAINING_INTENT_LABELS: Record<string, string> = {
  performance: 'Performance build',
  completion: 'Strong finish / completion',
  first_race: 'First race / finish focus',
};

const SWIM_INTENT_LABELS: Record<string, string> = {
  focus: 'Swim focus (more weekly swims)',
  race: 'Race-adequate swimming',
};

const SWIM_EXPERIENCE_LABELS: Record<string, string> = {
  learning: 'Learning / newer swimmer',
  steady: 'Steady swimmer',
  strong: 'Strong swimmer',
};

const STRENGTH_INTENT_LABELS: Record<string, string> = {
  performance: 'Strength co-equal (2×)',
  support: 'Strength supports triathlon',
};

const KEY_ORDER = [
  'training_intent',
  'days_per_week',
  'strength_frequency',
  'preferred_days',
  'swim_intent',
  'swim_experience',
  'strength_intent',
  'assessment_week_preference',
  'run_quality_placement',
  'bike_quality_placement',
  'bike_quality_label',
  'group_ride_route_url',
  'group_ride_route_snapshot',
  'combine',
  'notes',
] as const;

/**
 * Builds markdown bullet lines from a linked goal row (wizard preferences live in training_prefs).
 */
export function formatWizardPrefsMarkdownLines(goal: {
  name?: string | null;
  distance?: string | null;
  target_date?: string | null;
  priority?: string | null;
  sport?: string | null;
  training_prefs?: Record<string, unknown> | null;
  notes?: string | null;
}): string[] {
  const out: string[] = [];

  if (goal.name) out.push(`- **Primary goal:** ${goal.name}`);
  if (goal.distance) out.push(`- **Event distance:** ${goal.distance}`);
  if (goal.target_date) out.push(`- **Target date:** ${goal.target_date}`);
  if (goal.priority) out.push(`- **Priority:** ${goal.priority}`);
  if (goal.sport) out.push(`- **Sport:** ${goal.sport}`);

  const prefs = goal.training_prefs;
  if (!prefs || typeof prefs !== 'object') {
    if (goal.notes && String(goal.notes).trim()) out.push(`- **Goal notes:** ${fmtPrefScalar(goal.notes)}`);
    return out;
  }

  const used = new Set<string>();

  const emitScalar = (key: string, raw: unknown, labelOverride?: string) => {
    if (raw === undefined || raw === null || raw === '') return;
    used.add(key);
    const label = labelOverride ?? titleCaseKey(key);
    let display = fmtPrefScalar(raw);
    if (key === 'training_intent') display = TRAINING_INTENT_LABELS[String(raw)] ?? display;
    if (key === 'swim_intent') display = SWIM_INTENT_LABELS[String(raw)] ?? display;
    if (key === 'swim_experience') display = SWIM_EXPERIENCE_LABELS[String(raw)] ?? display;
    if (key === 'strength_intent') display = STRENGTH_INTENT_LABELS[String(raw)] ?? display;
    if (key === 'strength_frequency' && typeof raw === 'number') {
      display = raw === 0 ? 'None' : `${raw}×/week`;
    }
    if (!display && typeof raw === 'object') return;
    if (display) out.push(`- **${label}:** ${display}`);
  };

  for (const key of KEY_ORDER) {
    if (!(key in prefs)) continue;
    const val = prefs[key];
    if (key === 'preferred_days') {
      used.add(key);
      const sub = formatPreferredDays(val);
      if (sub.length) {
        out.push(`- **Preferred days:**`);
        sub.forEach((l) => out.push(l));
      }
      continue;
    }
    if (key === 'group_ride_route_snapshot') {
      used.add(key);
      if (val && typeof val === 'object') out.push(`- **Group ride route:** Saved on file`);
      continue;
    }
    emitScalar(key, val);
  }

  for (const key of Object.keys(prefs)) {
    if (used.has(key)) continue;
    const val = prefs[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sub = formatPreferredDays(val);
      if (sub.length) {
        out.push(`- **${titleCaseKey(key)}:**`);
        sub.forEach((l) => out.push(l));
      } else {
        try {
          const compact = JSON.stringify(val);
          const s = compact.length > 400 ? `${compact.slice(0, 397)}…` : compact;
          out.push(`- **${titleCaseKey(key)}:** ${s}`);
        } catch {
          out.push(`- **${titleCaseKey(key)}:** _(complex)_`);
        }
      }
      continue;
    }
    emitScalar(key, val);
  }

  if (goal.notes && String(goal.notes).trim()) out.push(`- **Goal notes:** ${fmtPrefScalar(goal.notes)}`);

  return out;
}

/** Fallback bullets from plans.config when no linked goal prefs exist. */
export function formatPlanConfigPrefsMarkdownLines(config: Record<string, unknown> | null | undefined): string[] {
  if (!config || typeof config !== 'object') return [];
  const lines: string[] = [];
  const c = config as Record<string, unknown>;
  const keys = ['approach', 'fitness', 'distance', 'days_per_week', 'strength_frequency', 'user_selected_start_date', 'goal'];
  for (const k of keys) {
    if (!(k in c)) continue;
    const v = c[k];
    const s = fmtPrefScalar(v);
    if (s) lines.push(`- **${titleCaseKey(k)}:** ${s}`);
  }
  return lines;
}
