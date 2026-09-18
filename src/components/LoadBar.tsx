import React from 'react';
import { formZoneColor } from '@/lib/context-utils';
import { GarminDerivedDataLine } from '@/components/ProviderAttribution';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadBarData {
  /**
   * TrainingPeaks' Performance Management Chart — THE load read (2026-09-04, Michael: one reference per metric).
   * fitness = 42-day exponential average of daily workload (CTL), fatigue = 7-day (ATL), form = yesterday's
   * fitness − yesterday's fatigue (TSB). Server-computed (`_shared/fitness-fatigue.ts`) over the whole history.
   */
  fitness_fatigue?: {
    fitness: number | null; fatigue: number | null; form: number | null;
    fitness_prior?: number | null; fatigue_prior?: number | null;
    week_ago?: { fitness: number | null; fatigue: number | null; form: number | null } | null;
    provenance?: { tau_fitness_days?: number | null; tau_fatigue_days?: number | null } | null;
    /**
     * ⛔ THE THREE READINGS AS TEXT (2026-09-15, Stage 4 session 2) — the number, the week's change and
     * the window, each finished by the coach (`coach/index.ts`, beside `week_ago`). This bar rounded all
     * three itself, subtracted this week from last, and divided the averaging constants by 7 to write the
     * windows. It prints these and works nothing out. A payload without it prints no readings.
     */
    display?: {
      fitness: { value: string | null; change: string | null; window: string | null };
      fatigue: { value: string | null; change: string | null; window: string | null };
      form: { value: string | null; change: string | null; window: string | null };
    } | null;
  } | null;
  /** Kept on the payload for the coach; NOT rendered here since 2026-09-04 (ACWR is Gabbett's — neither Garmin nor TrainingPeaks). */
  acwr?: number | null;
  acwr_provisional?: boolean;
  wtd_actual_load: number | null;
  wtd_planned_load?: number | null;
  daily_load_7d: Array<{
    date: string;
    load: number;
    dominant_type: string;
    by_type?: Array<{ type: string; load: number }>;
  }>;
  /** Friel's form zone word for today's form — the coach's (`formZone` on the server). */
  label?: string | null;
  /** The form-zone table the ⓘ prints, the current zone flagged (coach, audit 2026-09-10 H-T21). */
  form_zones?: Array<{ range: string; word: string; meaning: string; current: boolean }>;
  /** The rolling seven days' workload points, the sport that carried most, and each sport's printed share (coach, H-T21). */
  total_7d?: number;
  dominant?: string | null;
  composition_7d?: Array<{ discipline: string; load: number; share_pct: number }>;
  /** The plan week so far, time per sport — "strength 2h 10m · run 2h 30m · bike 3h 40m" (coach v216). */
  week_time_line?: string | null;
}

export interface LoadBarStatus {
  status: 'under' | 'on_target' | 'productive' | 'elevated' | 'high';
}

interface LoadBarProps {
  load: LoadBarData;
  /** Kept for the callers' sake (State and Home pass it); NOT read since 2026-09-04 — the reconciled load word is off the bar. */
  loadStatus?: LoadBarStatus | null;
  weekIntent?: string | null;
  /** compact variant (calendar). ⚠️ No effect since the composition strip left the card (2026-09-10). */
  compact?: boolean;
  hasActivePlan?: boolean;
  plannedThisWeek?: number;
  doneThisWeek?: number;
  /**
   * docs/WORKORDER-garmin-strava-attribution-2026-09-09.md §3 — fitness, fatigue and form are
   * DERIVED from Garmin device-sourced rows, so the plate carries Garmin's derived-data line as its
   * footer (Garmin API Brand Guidelines v6.30.2025: "globally — such as in a header or footer").
   * The caller answers WHETHER (`useGarminDataPresence`); false on an account with no Garmin data.
   */
  garminDerived?: boolean;
}

// ⛔ THE LOAD WORD IS OFF THIS BAR (2026-09-04). `loadRead` (src/lib/load-read.ts) still gates the glance
// headline on StateTab; the bar prints TrainingPeaks' three numbers and nothing the app decided.

// ── Helpers ──────────────────────────────────────────────────────────────────

// ⛔ loadVolumeColor + statusVolumeLabel removed here (2026-09-01) — the load word is now the
// programme-aware `loadRead` above, which carries its own colour.



/**
 * The separator BEFORE a LOAD reading. Exported since 2026-09-10 so BODY's readings row draws with the
 * same separator as this one (one construction, not a copy that drifts). It sits in a fixed 12 px slot that the reading pulls into the gap
 * before it (`-ml-3`), and the row clips its left edge — so on a line the row wraps onto, the first
 * reading's separator is cut off instead of a separator dangling at the end of the line above (2026-09-10:
 * the windows made the row wrap at 390 px).
 */
export function Dot() {
  return <span aria-hidden className="inline-block w-3 text-center text-label-secondary select-none">·</span>;
}

// ⛔ THE ZONE WORD'S COLOUR HAS ONE OWNER (2026-09-09) — `formZoneColor` in `context-utils`, shared
// with Today's LOAD card, so the same word cannot read green on one screen and white on the other.
// It used to be a local class map here, and its high-risk case borrowed the Race card's coral.

// ── LoadBar ──────────────────────────────────────────────────────────────────
// The load section: TrainingPeaks' fitness · fatigue · form on the first line (2026-09-04), then the weekly
// composition (which discipline carried the load — our differentiator, and the same "TSS by sport" split
// TrainingPeaks draws on its dashboard) as the primary visual. Per-day detail lives in the calendar.
// ⛔ AUDIT 2026-09-10 (H-T21, H-B08): the zone word, the zone table, the seven-day total, the shares and
// the dominant sport are the coach's (`load.label`, `load.form_zones`, `load.total_7d`,
// `load.composition_7d`, `load.dominant`). This bar used to sum and round them itself.

/**
 * ⛔ THE LOAD EXPLANATION, IN ONE PLACE (2026-09-09). Two surfaces open it — State, behind this
 * bar's ⓘ, and Today's load card, behind its chevron. It is athlete-facing copy, and a second copy
 * of these paragraphs is a second thing to keep true, so it is extracted rather than duplicated.
 * ⚠️ SO A CHANGE HERE LANDS ON BOTH — which is the point: Michael's new form sentence reached State
 * and Today in one edit, and neither can drift from the other.
 *
 * ⛔ AND SPLIT IN TWO, because Today's open LOAD card deals them as separate cards — the form table
 * on one, the workload paragraph on another. The boundary falls between the two subjects: what a
 * workload point is, and what form is.
 */
export function LoadKeyWorkload() {
  return (
    <p className="text-caption text-label-secondary leading-snug">
      Every session earns workload points. Fitness averages them over the last six weeks, fatigue over the last week. The small numbers are this week's change.
    </p>
  );
}

export function LoadKeyForm({ ff, zones }: { ff: NonNullable<LoadBarData['fitness_fatigue']>; zones?: LoadBarData['form_zones'] }) {
  // ⛔ THE TABLE IS THE COACH'S (`load.form_zones`, H-T21) — ranges, words and the current zone. A payload
  // without it prints no table rather than a copy kept here.
  const rows = Array.isArray(zones) ? zones : [];
  return (
    <div className="text-caption text-label-secondary leading-snug">
      {/**
        * ⛔ MICHAEL'S LINE (2026-09-09), VERBATIM. It replaced *"Form is one subtraction, fitness −
        * fatigue, taken as you start the day … The word beside it comes from this table:"* — which
        * named the arithmetic and never said what the SIGN means, the one thing a reader wants from
        * a number that can go negative.
        * ⚠️ AND NO LEAD-IN ABOVE THE TABLE. The old sentence ended by introducing it; his does not,
        * and the table is left to stand on its own.
        * ⚠️ THE NUMBERS ARE LIVE — his "47 − 63 = −16" is the shape, not the values. The sentence is
        * dropped entirely when either number is missing, rather than printed with a blank in it.
        */}
      <p>
        Form is fitness minus fatigue. Below zero you are training harder than usual, building but tired. Above zero you are rested.
        {/* ⛔ NO EQUATION (Michael, 2026-09-16: "drop it"). The "Today: a − b = c" line printed the numbers entering
            today beside the bar's end-of-today numbers; TrainingPeaks prints no equation. */}
      </p>
      {rows.length > 0 && (
        <table className="mt-1 text-caption tabular-nums">
          <tbody>
            {rows.map((r) => (
              <tr key={r.word} className={r.current ? 'text-label' : 'text-label-secondary'}>
                <td className="pr-3 py-0.5 whitespace-nowrap">{r.range}</td>
                <td className="pr-3 py-0.5 whitespace-nowrap">{r.current ? '▸ ' : ''}{r.word}</td>
                <td className="py-0.5">{r.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** State's ⓘ opens both halves at once, exactly as it always did. */
export function LoadKey({ ff, zones }: { ff: NonNullable<LoadBarData['fitness_fatigue']>; zones?: LoadBarData['form_zones'] }) {
  return (
    <div className="mt-1.5 max-w-[min(100%,360px)] space-y-1">
      <LoadKeyWorkload />
      <LoadKeyForm ff={ff} zones={zones} />
    </div>
  );
}

export default function LoadBar({ load, garminDerived = false }: LoadBarProps) {
  const [showKey, setShowKey] = React.useState(false);
  // ⛔ THE LOAD READ IS TRAININGPEAKS' PMC, WHOLE (2026-09-04, Michael: "each metric has to have an absolute
  // reference point", never a hodgepodge). Fitness · Fatigue · Form, and Friel's Form zone word beside form.
  // WHAT THIS REPLACED: the reconciled load word ("balanced" — the app's own reconciler, D-260) and the
  // ACWR ratio (Gabbett). Neither is Garmin's or TrainingPeaks' rule; both stay on the payload for the coach.
  const ff = load.fitness_fatigue ?? null;
  const zone = load.label ?? null;
  // ⛔ NOTHING IS WORKED OUT HERE (2026-09-15, Stage 4 session 2). The number, the week's change and the
  // window are the coach's finished text. What this replaced: a rounder over all three readings, a
  // subtraction of this week against last week, `tau ÷ 7` for the fitness window, and a sign split off
  // form — four rules on the phone over numbers the server already owned.
  // ⛔ EACH NUMBER CARRIES ITS WINDOW, ONCE, IN THE GREY LABEL (Michael 2026-09-10), and the windows are
  // the model's own averaging constants (TrainingPeaks' PMC 42 and 7 — ledger row "Fitness (CTL, 42-day
  // EWMA)"). Fitness reads in weeks, fatigue in days; form has none, it is the gap between the two.
  const rd = ff?.display ?? null;

  // ⛔ THE LOAD-SHARE BAR LEFT THIS CARD (Michael, 2026-09-10), and the planned-vs-done bars that carried its shares
  // after it are gone too (2026-09-18). The week so far in time per sport — the coach's `week_time_line`, printed
  // as sent; no line when nothing is done yet.
  const weekLine = load.week_time_line ?? null;

  // ⛔ FORM IS THE HEADLINE (2026-09-18, docs/AUDIT-type-legibility-2026-09-18.md §6, approved by Michael). Form
  // is the number the zone word reads, so it is the Title 1 figure with its word beside it; fitness and fatigue
  // sit beneath it, each with its window under it. The week's changes (`display.*.change`) are OFF the card —
  // the coach still sends them. Every word is the coach's, printed as sent. What this replaced: one wrapped row
  // of three numbers at 13 px with 10.5–11 px grey labels, changes and windows — 11 of its 20 lines measured
  // under 4.5:1 over the card's glow. The calmer background the rule asks for is the plate's own (`plate-calm` on State's top plate).
  const Reading = ({ label, value, window: w }: { label: string; value: string | null; window: string | null }) => (
    <div>
      <div className="text-footnote font-medium text-label-secondary">{label}</div>
      <div className="readout-num text-body font-medium">{value ?? '—'}</div>
      {w && <div className="text-caption text-label-secondary">{w}</div>}
    </div>
  );

  return (
    <div className="px-3 py-3">
      <div className="px-1 py-1">
        <span className="readout-label text-footnote font-semibold tracking-[0.08em] uppercase">
          LOAD{' '}
          <button type="button" onClick={() => setShowKey((o) => !o)} aria-label="What do fitness, fatigue and form mean?" aria-expanded={showKey} className="bg-transparent border-none p-0 cursor-pointer text-label-secondary normal-case tracking-normal font-normal text-subhead align-baseline">ⓘ</button>
        </span>
        {rd && rd.form.value != null ? (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-footnote font-medium text-label-secondary">form</span>
              <span className="readout-num text-title1 font-semibold">{rd.form.value}</span>
              {zone && <span className="text-body font-medium" style={{ color: formZoneColor(zone) }}>{zone}</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4">
              <Reading label="fitness" value={rd.fitness.value} window={rd.fitness.window} />
              <Reading label="fatigue" value={rd.fatigue.value} window={rd.fatigue.window} />
            </div>
          </>
        ) : (
          <div className="mt-2 text-subhead text-label-secondary">no sessions logged yet</div>
        )}
        {weekLine && (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 leading-snug">
            <span className="text-footnote font-medium text-label-secondary shrink-0">This week</span>
            <span className="text-subhead text-label tabular-nums">{weekLine}</span>
          </div>
        )}
        {showKey && ff && <LoadKey ff={ff} zones={load.form_zones} />}

        {/* Garmin API Brand Guidelines v6.30.2025 — derived-data attribution, verbatim, as the plate's
            footer. Never in the ⓘ key above: "never bury the Garmin attribution in … expandable containers". */}
        {garminDerived ? <GarminDerivedDataLine className="mt-3" /> : null}
      </div>
    </div>
  );
}
