// D-197 (D-180/D-196 lineage) — per-set swim equipment assignment. Today equipment is session-level
// only (swim_equipment_optional_suggested); this assigns equipment PER STEP from the drill name +
// session intent, so FORM copy / breakout / Garmin can show "use fins on THIS set".
//
// New per-step field: `equipment_detail: { required: string[]; optional: string[] }` (empty arrays =
// none). The legacy string `equipment` stays for back-compat. Readers PREFER equipment_detail and, when
// it's missing (old plan data, no rematerialize), DERIVE it at read-time via getStepEquipmentDetail —
// so existing plans get enriched display without a rematerialize, and both paths converge.

export interface StepEquipment {
  required: string[];
  optional: string[];
}

const EMPTY: StepEquipment = { required: [], optional: [] };

/** Normalize a drill name for keyword matching: lowercase, all separators → single spaces. */
function norm(s: unknown): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Assign equipment for a single swim step from its drill name, kind, and the session/step intent.
 * Drill names match case-insensitively by keyword ("catch up" / "catch-up" / "catchup" all match).
 * Returns empty arrays when no equipment applies.
 */
export function resolveSwimStepEquipment(
  drillName: string | null | undefined,
  stepKind: string | null | undefined,
  sessionIntent: string | null | undefined,
): StepEquipment {
  const kind = norm(stepKind);
  const name = norm(drillName);
  const intent = norm(sessionIntent);
  const has = (...kw: string[]) => kw.some((k) => name.includes(k));

  if (kind === 'warmup' || kind === 'warm up' || kind === 'cooldown' || kind === 'cool down') return { ...EMPTY };
  if (kind === 'recovery' || kind === 'rest') return { ...EMPTY };

  // ── Drill rules (keyword match). Order matters: kick EXCEPTIONS before the generic "kick" rule. ──
  if (name) {
    if (has('tombstone')) return { required: ['kickboard'], optional: ['fins'] };
    if (has('six kick', 'kick switch', 'kick rotate')) return { required: [], optional: ['fins'] };
    if (has('side kick')) return { required: [], optional: ['fins', 'snorkel'] };
    if (has('kick')) return { required: ['kickboard'], optional: ['fins'] }; // kick / kickboard set
    if (has('pull')) return { required: ['pull_buoy'], optional: ['paddles'] };
    if (has('catch up', 'catchup')) return { required: [], optional: ['fins', 'snorkel'] };
    if (has('single arm', 'one arm')) return { required: [], optional: ['fins', 'snorkel'] };
    if (has('fingertip', 'finger tip')) return { required: [], optional: ['snorkel'] };
    if (has('fist')) return { required: [], optional: ['fins', 'snorkel'] }; // fist / closed-fist
    if (has('zipper')) return { required: [], optional: ['snorkel'] };
    if (has('scull')) return { required: [], optional: ['pull_buoy', 'fins'] }; // not both — present as options
    if (has('tarzan', 'head up')) return { ...EMPTY };
    if (has('corkscrew')) return { ...EMPTY };
    if (has('bilateral')) return { required: [], optional: ['snorkel'] }; // bilateral-breathing
    if (has('thumb')) return { required: [], optional: ['snorkel'] }; // thumb-scrape / thumb-drag
    if (has('3 3 3', '333', 'three stroke')) return { required: [], optional: ['fins'] };
    if (has('dps', 'distance per stroke')) return { ...EMPTY };
  }

  // ── Main-set rules by intent (for non-drill work). ──
  if (kind === 'work' || kind === 'main' || kind === 'steady' || kind === 'interval' || kind === '') {
    if (/(^|\b)(easy|aerobic|recovery)/.test(intent)) return { required: [], optional: ['snorkel'] };
    if (/(^|\b)(moderate|tempo)/.test(intent)) return { required: [], optional: ['snorkel'] };
    if (/(^|\b)(css|threshold|quality)/.test(intent)) return { ...EMPTY };
    if (/(^|\b)(sprint|speed)/.test(intent)) return { ...EMPTY };
  }

  return { ...EMPTY };
}

/**
 * Read-time accessor: prefer the step's persisted `equipment_detail`; otherwise DERIVE it from the
 * drill name (`label`) + kind + intensity, folding in any legacy string `equipment` as an optional.
 */
export function getStepEquipmentDetail(step: any): StepEquipment {
  const d = step?.equipment_detail;
  if (d && (Array.isArray(d.required) || Array.isArray(d.optional))) {
    return { required: Array.isArray(d.required) ? d.required : [], optional: Array.isArray(d.optional) ? d.optional : [] };
  }
  const drillName = step?.label ?? step?.drill ?? '';
  const intent = step?.intensity ?? (step?.kind === 'work' ? step?.label : undefined);
  const out = resolveSwimStepEquipment(drillName, step?.kind ?? step?.type, intent);
  const legacy = typeof step?.equipment === 'string' ? step.equipment.toLowerCase().trim() : '';
  if (legacy && legacy !== 'none' && !out.required.includes(legacy) && !out.optional.includes(legacy)) {
    out.optional = [...out.optional, legacy];
  }
  return out;
}

const PRETTY: Record<string, string> = {
  pull_buoy: 'pull buoy',
  kickboard: 'kickboard',
  fins: 'fins',
  paddles: 'paddles',
  snorkel: 'snorkel',
};
function pretty(name: string): string {
  return PRETTY[name] ?? name.replace(/_/g, ' ');
}

/** Display string: required items bare, optional items suffixed "(optional)". "" when none. */
export function formatStepEquipment(detail: StepEquipment | null | undefined): string {
  if (!detail) return '';
  const parts: string[] = [];
  for (const r of detail.required || []) parts.push(pretty(r));
  for (const o of detail.optional || []) parts.push(`${pretty(o)} (optional)`);
  return parts.join(', ');
}

/** Convenience: derive-or-read, then format. Empty string when no equipment. */
export function stepEquipmentLabel(step: any): string {
  return formatStepEquipment(getStepEquipmentDetail(step));
}
