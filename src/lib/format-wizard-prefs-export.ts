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

/** Strength slot objects from optimizer export / Arc — avoid "[object Object]" in markdown. */
function formatStrengthOrDayToken(x: unknown): string {
  if (x === null || x === undefined) return '';
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  if (typeof x === 'object' && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    const day = String(o.weekday ?? o.day ?? '').trim();
    const kind = String(o.kind ?? '').trim();
    const idx = o.session_index;
    if (day && kind) {
      const short = kind.includes('upper')
        ? 'upper body'
        : kind.includes('lower')
          ? 'lower body'
          : kind.replace(/_/g, ' ');
      return `${day} (${short})`;
    }
    if (day && typeof idx === 'number' && Number.isFinite(idx)) {
      return `${day} (session ${idx + 1})`;
    }
    if (day) return day;
  }
  return fmtPrefScalar(x);
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
      const parts = v.map((x) => formatStrengthOrDayToken(x)).filter(Boolean);
      if (parts.length) lines.push(`  - **${label}:** ${parts.join(', ')}`);
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
      const parts = v.map((x) => formatStrengthOrDayToken(x)).filter(Boolean);
      if (parts.length) lines.push(`  - **${label}:** ${parts.join(', ')}`);
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

/**
 * Display labels for keys where title-casing the key isn't enough.
 * "Equipment Location" and "Capability Tier" are spec §8 — distinct concepts that the title-case
 * default would conflate into "Equipment Tier" / "Equipment Type".
 */
const KEY_DISPLAY_LABELS: Record<string, string> = {
  equipment_location: 'Equipment Location',
  equipment_tier: 'Capability Tier',
  db_max_lb: 'Heaviest DB pair (lb per hand)',
};

/**
 * Display values for capability-tier strings. Renamed 2025-12: legacy `commercial_gym` value now
 * displays as "Full barbell + rack + bench" to make the location/capability split obvious. Old
 * stored data still passes through (legacy mapping in `normalizeEquipmentTier3`).
 */
const EQUIPMENT_TIER_DISPLAY: Record<string, string> = {
  full_barbell: 'Full barbell + rack + bench',
  commercial_gym: 'Full barbell + rack + bench', // legacy value, same meaning
  dumbbell_based: 'Dumbbell-based',
  bodyweight_bands: 'Bodyweight + bands',
};

const EQUIPMENT_LOCATION_DISPLAY: Record<string, string> = {
  home_gym: 'Home gym',
  commercial_gym: 'Commercial gym',
};

/**
 * Keys that are export-suppressed: stale, redundant, or run-only fields that shouldn't appear in
 * tri exports. The "Strength Protocol: durability" mislabel came from `strength_protocol` (a
 * run-side field) bleeding into tri exports via the catch-all loop.
 */
const SUPPRESSED_EXPORT_KEYS = new Set<string>([
  'equipment_type',     // legacy redundant — equipment_location is the canonical literal
  'strength_protocol',  // run-only protocol id; tri uses strength_intent instead
  'strength_focus',     // upstream signal that derives strength_protocol; not athlete-facing
  'co_equal_strength_provisional_1x', // optimizer fallback flag, not athlete-facing
]);

const KEY_ORDER = [
  'training_intent',
  'days_per_week',
  'strength_frequency',
  'preferred_days',
  'strength_preferred_days',
  'prior_similar_race',
  'swim_intent',
  'swim_experience',
  'strength_intent',
  'equipment_location',
  'equipment_tier',
  'db_max_lb',
  'assessment_week_preference',
  'run_quality_placement',
  'bike_quality_placement',
  'bike_quality_label',
  'group_ride_route_url',
  'group_ride_route_snapshot',
  'combine',
  'notes',
] as const;

function fmtRaceClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PRIOR_CONTINUITY_LABELS: Record<string, string> = {
  steady: 'steady training since',
  spotty: 'on/off training since',
  long_break: 'long break since',
};

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

  const rawPrefs = goal.training_prefs;
  if (!rawPrefs || typeof rawPrefs !== 'object') {
    if (goal.notes && String(goal.notes).trim()) out.push(`- **Goal notes:** ${fmtPrefScalar(goal.notes)}`);
    return out;
  }

  // Backfill `equipment_location` from legacy `equipment_type` for plans saved before the
  // location/capability split. Display-only — doesn't mutate the stored prefs.
  const prefs: Record<string, unknown> = { ...rawPrefs };
  if (
    !prefs.equipment_location &&
    typeof prefs.equipment_type === 'string' &&
    prefs.equipment_type
  ) {
    prefs.equipment_location = prefs.equipment_type;
  }

  const used = new Set<string>();

  const emitScalar = (key: string, raw: unknown, labelOverride?: string) => {
    if (raw === undefined || raw === null || raw === '') return;
    if (SUPPRESSED_EXPORT_KEYS.has(key)) {
      used.add(key);
      return;
    }
    used.add(key);
    const label = labelOverride ?? KEY_DISPLAY_LABELS[key] ?? titleCaseKey(key);
    if (Array.isArray(raw)) {
      const parts = raw.map((x) => formatStrengthOrDayToken(x)).filter(Boolean);
      if (parts.length) out.push(`- **${label}:** ${parts.join('; ')}`);
      return;
    }
    let display = fmtPrefScalar(raw);
    if (key === 'training_intent') display = TRAINING_INTENT_LABELS[String(raw)] ?? display;
    if (key === 'swim_intent') display = SWIM_INTENT_LABELS[String(raw)] ?? display;
    if (key === 'swim_experience') display = SWIM_EXPERIENCE_LABELS[String(raw)] ?? display;
    if (key === 'strength_intent') display = STRENGTH_INTENT_LABELS[String(raw)] ?? display;
    if (key === 'equipment_location') display = EQUIPMENT_LOCATION_DISPLAY[String(raw)] ?? display;
    if (key === 'equipment_tier') display = EQUIPMENT_TIER_DISPLAY[String(raw)] ?? display;
    if (key === 'strength_frequency' && typeof raw === 'number') {
      display = raw === 0 ? 'None' : `${raw}×/week`;
    }
    if (key === 'db_max_lb' && typeof raw === 'number') {
      display = `${raw} lb`;
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
    if (key === 'prior_similar_race') {
      used.add(key);
      const p = val as Record<string, unknown>;
      if (p?.skipped === true) {
        out.push('- **Prior comparable race:** Not provided');
        continue;
      }
      const dist = String(p?.distance ?? '').trim();
      const dt = String(p?.event_date ?? '').trim();
      const nm = String(p?.event_name ?? '').trim();
      const eyRaw = p?.event_year;
      const ey =
        typeof eyRaw === 'number' && Number.isFinite(eyRaw)
          ? eyRaw
          : typeof eyRaw === 'string' && /^\d{4}$/.test(eyRaw.trim())
            ? Number(eyRaw.trim())
            : null;
      const secRaw = p?.finish_seconds;
      const sec =
        typeof secRaw === 'number' && Number.isFinite(secRaw) && secRaw > 0
          ? secRaw
          : typeof secRaw === 'string' && /^\d+$/.test(secRaw.trim())
            ? Number(secRaw.trim())
            : NaN;
      const cont = String(p?.continuity ?? '');
      const contHuman = PRIOR_CONTINUITY_LABELS[cont] ?? cont;
      if (dist && dt && cont) {
        const labelParts = [nm || null, ey != null && Number.isFinite(ey) ? String(Math.round(ey)) : null].filter(Boolean);
        const label = labelParts.length ? `${labelParts.join(' · ')} — ` : '';
        const clock =
          Number.isFinite(sec) && sec > 0 ? `${fmtRaceClock(sec)} on ${dt}` : `date ${dt} (finish time not recorded)`;
        out.push(`- **Prior comparable race:** ${label}${dist} — ${clock} (${contHuman})`);
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
    if (SUPPRESSED_EXPORT_KEYS.has(key)) continue;
    const val = prefs[key];
    const label = KEY_DISPLAY_LABELS[key] ?? titleCaseKey(key);
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sub = formatPreferredDays(val);
      if (sub.length) {
        out.push(`- **${label}:**`);
        sub.forEach((l) => out.push(l));
      } else {
        try {
          const compact = JSON.stringify(val);
          const s = compact.length > 400 ? `${compact.slice(0, 397)}…` : compact;
          out.push(`- **${label}:** ${s}`);
        } catch {
          out.push(`- **${label}:** _(complex)_`);
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
