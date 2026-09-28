// Calendar sync, the pure part: which planned workouts belong on which provider's calendar, and what to
// create, update or remove there given what was already sent. No network, no database (tested in plan.test.ts).

import { isJoinedPart, movesWith, type MoveRow } from '../move-check/index.ts';
import { sessionTitle } from '../session-title.ts';
import { fill, JOINED_ROW } from '../standing-plan/setup-copy.ts';

export type Provider = 'garmin' | 'intervals_icu';
export type Destination = Provider | 'none';
export type SyncSport = 'run' | 'ride' | 'swim' | 'strength';
export type Destinations = Partial<Record<SyncSport, Destination>>;

/**
 * How many days, today included, Efforts keeps on a provider's calendar.
 * TrainingPeaks: "the next 15 days of eligible structured workouts on your TrainingPeaks calendar will immediately
 * sync to your Garmin Connect calendar" (help.trainingpeaks.com/hc/en-us/articles/115000325647).
 */
export const SYNC_WINDOW_DAYS = 15;

/** Statuses a workout can have and still be ahead of the athlete. Completed and skipped come off the calendar. */
const OPEN_STATUSES = new Set([null, '', 'planned', 'in_progress', 'sent_to_garmin']);

export function sportOf(type: unknown): SyncSport | null {
  const t = String(type ?? '').toLowerCase();
  return t === 'run' || t === 'ride' || t === 'swim' || t === 'strength' ? t : null;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First and last date (inclusive) of the window starting on the athlete's local today. */
export function syncWindow(today: string): { from: string; to: string } {
  return { from: today, to: addDays(today, SYNC_WINDOW_DAYS - 1) };
}

export type PlannedRow = { id: string; date: string; type: string; workout_status?: string | null };

/** The provider a planned workout goes to, or null when it stays off every calendar. */
export function destinationFor(row: PlannedRow, destinations: Destinations, connected: Set<Provider>, today: string): Provider | null {
  const { from, to } = syncWindow(today);
  if (row.date < from || row.date > to) return null;
  if (!OPEN_STATUSES.has((row.workout_status ?? null) as any)) return null;
  const sport = sportOf(row.type);
  if (!sport) return null;
  const dest = destinations[sport] ?? 'none';
  if (dest === 'none' || !connected.has(dest)) return null;
  return dest;
}

/**
 * ⛔ ONE SESSION OF TWO PARTS GOES OUT AS ONE WORKOUT (Michael, 2026-09-27). The builder writes a joined session as
 * two rows (`JOINED_TAG`; p278's Day 3 and Day 5 rides, p245 / p253's runs), and one ride on the trainer is one Zwift
 * workout. Returns each first half's second half — the partner `movesWith` finds, on the same date. A second half
 * whose first half is skipped or gone is not paired, and goes out on its own.
 */
export function joinedPartners<R extends MoveRow>(rows: R[]): Map<string, R> {
  const out = new Map<string, R>();
  for (const head of rows) {
    if (isJoinedPart(head)) continue;
    // Asked both ways: `movesWith` leaves out a skipped partner, so a skipped first half pairs nothing.
    const part = movesWith(head, rows).find((r) => r.date === head.date && movesWith(r, rows).some((x) => x.id === head.id));
    if (part) out.set(head.id, part as R);
  }
  return out;
}

/**
 * ⛔ THE ONE WORKOUT A JOINED SESSION SENDS — both halves' saved steps in order (the first half built without its
 * cooldown and the second without its warm-up, so nothing moves when a converter sorts warm-ups first), both notes,
 * both lengths, titled "{first}, then {second}" (`JOINED_ROW`, approved) through `session_title`, which `sessionTitle` reads
 * first. Every sender uses this, so Garmin and Intervals.icu (and Zwift through it) get the same workout. Throws when a
 * half has no saved steps: half a ride is not sent as the whole one.
 */
export function mergeJoinedRow<R extends Record<string, any>>(head: R, part: R): R {
  for (const r of [head, part]) {
    if (!Array.isArray(r?.computed?.steps) || r.computed.steps.length === 0) {
      throw new Error(`planned workout ${r?.id}: half of a joined session has no saved steps`);
    }
  }
  const sum = (a: unknown, b: unknown) => ((Number(a) || 0) + (Number(b) || 0)) || null;
  return {
    ...head,
    session_title: fill(JOINED_ROW, { first: sessionTitle(head as any), second: sessionTitle(part as any) }),
    duration: sum(head.duration, part.duration),
    total_duration_seconds: sum(head.total_duration_seconds, part.total_duration_seconds),
    description: [head.description, part.description].map((d) => String(d ?? '').trim()).filter(Boolean).join('\n\n'),
    computed: {
      ...head.computed,
      steps: [...head.computed.steps, ...part.computed.steps],
      total_duration_seconds: sum(head.computed.total_duration_seconds, part.computed.total_duration_seconds),
    },
  };
}

export type Desired = { planned_workout_id: string; provider: Provider; date: string; content_hash: string };
export type Delivery = {
  planned_workout_id: string;
  provider: Provider;
  date: string;
  content_hash: string;
  provider_workout_id: string | null;
  provider_schedule_id: string | null;
};

export type SyncActions<D extends Desired> = {
  create: D[];
  update: Array<{ desired: D; delivery: Delivery }>;
  remove: Delivery[];
};

const keyOf = (x: { planned_workout_id: string; provider: Provider }) => `${x.provider}:${x.planned_workout_id}`;

/**
 * `desired` is every workout that belongs on a calendar now, already serialized and hashed.
 * `keep` holds planned workout ids whose serialization failed this run: whatever was sent for them stays as it is.
 * Deliveries dated before today are history and are never removed.
 */
export function diffDeliveries<D extends Desired>(desired: D[], deliveries: Delivery[], today: string, keep: Set<string> = new Set()): SyncActions<D> {
  const sent = new Map(deliveries.map((d) => [keyOf(d), d]));
  const wanted = new Set(desired.map(keyOf));
  const out: SyncActions<D> = { create: [], update: [], remove: [] };
  for (const d of desired) {
    const prior = sent.get(keyOf(d));
    if (!prior) out.create.push(d);
    else if (prior.content_hash !== d.content_hash) out.update.push({ desired: d, delivery: prior });
  }
  for (const s of deliveries) {
    if (s.date < today) continue;
    if (wanted.has(keyOf(s)) || keep.has(s.planned_workout_id)) continue;
    out.remove.push(s);
  }
  return out;
}

export async function contentHash(date: string, payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ date, payload }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
