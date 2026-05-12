// =============================================================================
// stack-tagging-validator — enforce "same-day bike + run = brick or nothing"
// =============================================================================
// Architectural backstop for the policy that bricks are the ONLY legitimate
// same-day bike + run pairing. The matrix flip in `schedule-session-constraints.ts`
// (Theme A commit 4) prevents the optimizer from creating these stacks at
// placement time. This validator catches anything that slips through:
//   • Engine bugs where placement produces accidental stacks
//   • Custom athlete pin configurations that create unintentional bricks
//   • Migration cases where legacy plans had implicit bricks
//   • Reschedule operations that move sessions across days post-generation
//
// Defense in depth: matrix layer (creation) → validation layer (detection) →
// `docs/BRICK-PROTOCOL.md` (policy source of truth).
//
// Production behavior: soft warning surfaced as a trade-off message. Test
// behavior: assertions catch violations as bugs.
// =============================================================================

/** Minimal shape needed for validation — caller may pass PlannedSession or any superset. */
export interface ValidatableSession {
  /** Discipline tag ('bike' | 'run' | 'swim' | 'strength' | ...). Case-insensitive. */
  type?: string;
  /** Display name — used in violation messages for athlete-readable context. */
  name?: string;
  /** Tags array. The presence of `'brick'` here signals intentional brick designation. */
  tags?: string[];
}

/** A single same-day bike+run pairing that violates the brick-tag policy. */
export interface StackTaggingViolation {
  day: string;
  bike: { name: string; tags: string[]; brickTagged: boolean };
  run: { name: string; tags: string[]; brickTagged: boolean };
  reason: 'neither_brick' | 'bike_only_brick' | 'run_only_brick';
  message: string;
}

/** True when the session's discipline maps to cycling (handles 'ride'/'bike'/'cycling'). */
export function isBikeDiscipline(s: ValidatableSession): boolean {
  const t = String(s.type ?? '').trim().toLowerCase();
  return t === 'bike' || t === 'ride' || t === 'cycling';
}

/** True when the session's discipline maps to running. */
export function isRunDiscipline(s: ValidatableSession): boolean {
  const t = String(s.type ?? '').trim().toLowerCase();
  return t === 'run' || t === 'running';
}

/** True when the session carries an explicit `'brick'` tag (case-insensitive). */
export function hasBrickTag(s: ValidatableSession): boolean {
  if (!Array.isArray(s.tags)) return false;
  return s.tags.some((t) => String(t ?? '').trim().toLowerCase() === 'brick');
}

/**
 * Walk a day-keyed map of sessions and identify any non-brick same-day bike+run pairings.
 * Returns one entry per violating pair (a day with 2 bikes + 1 run produces 2 entries).
 *
 * Empty / single-discipline days produce zero violations regardless of tagging.
 */
export function validateNonBrickStackTagging(
  sessionsByDay: Record<string, ValidatableSession[]>,
): StackTaggingViolation[] {
  const violations: StackTaggingViolation[] = [];
  for (const [day, sessions] of Object.entries(sessionsByDay)) {
    if (!sessions || sessions.length < 2) continue;
    const bikes = sessions.filter(isBikeDiscipline);
    const runs = sessions.filter(isRunDiscipline);
    if (bikes.length === 0 || runs.length === 0) continue;

    for (const b of bikes) {
      for (const r of runs) {
        const bIsBrick = hasBrickTag(b);
        const rIsBrick = hasBrickTag(r);
        if (bIsBrick && rIsBrick) continue; // both brick — sanctioned pairing

        const reason: StackTaggingViolation['reason'] =
          bIsBrick && !rIsBrick ? 'bike_only_brick'
          : !bIsBrick && rIsBrick ? 'run_only_brick'
          : 'neither_brick';

        const bikeName = b.name ?? 'bike session';
        const runName = r.name ?? 'run session';
        const reasonText =
          reason === 'neither_brick'
            ? `neither session carries the 'brick' tag — same-day bike+run is policy violation per docs/BRICK-PROTOCOL.md`
            : reason === 'bike_only_brick'
              ? `bike ('${bikeName}') is brick-tagged but run ('${runName}') is not — brick pair must be symmetric`
              : `run ('${runName}') is brick-tagged but bike ('${bikeName}') is not — brick pair must be symmetric`;

        violations.push({
          day,
          bike: { name: bikeName, tags: b.tags ?? [], brickTagged: bIsBrick },
          run: { name: runName, tags: r.tags ?? [], brickTagged: rIsBrick },
          reason,
          message: `Same-day bike + run detected on ${day} without brick tag. ${reasonText}`,
        });
      }
    }
  }
  return violations;
}

/**
 * Convenience adapter — group a flat array of sessions by their `day` field, then validate.
 * Matches the `GeneratedWeek.sessions: PlannedSession[]` shape produced by the week-builder.
 */
export function validateNonBrickStackTaggingFlat<
  T extends ValidatableSession & { day?: string },
>(sessions: T[]): StackTaggingViolation[] {
  const byDay: Record<string, T[]> = {};
  for (const s of sessions) {
    const day = String(s.day ?? '').trim();
    if (!day) continue;
    (byDay[day] ||= []).push(s);
  }
  return validateNonBrickStackTagging(byDay);
}
