import React from 'react';
import { DRIFT_LIMITS } from '@shared/state-trend';
import {
  type SessionInterpretationV1,
} from '@/utils/performance-format';

interface AdherenceChipsProps {
  sessionDetail: {
    workout_id?: string;
    type?: string;
    execution?: {
      execution_score?: number | null;
      pace_adherence?: number | null;
      power_adherence?: number | null;
      duration_adherence?: number | null;
      intensity_adherence?: number | null;
      volume_ratio_pct?: number | null;
      easy_under_s?: number | null;
      easy_total_s?: number | null;
      easy_ceiling_bpm?: number | null;
      easy_ceiling_anchor?: string | null;
      performance_assessment?: string | null;
      assessed_against?: string | null;
      status_label?: string | null;
      gap_adjusted?: boolean;
    };
    display?: { show_adherence_chips?: boolean };
    plan_context?: { week_label?: string | null };
    completed_totals?: {
      duration_s?: number | null;
      distance_m?: number | null;
      avg_pace_s_per_mi?: number | null;
      swim_pace_per_100_s?: number | null;
    };
    planned_totals?: {
      duration_s?: number | null;
      distance_m?: number | null;
      avg_pace_s_per_mi?: number | null;
      swim_pace_per_100_s?: number | null;
      swim_unit?: 'yd' | 'm' | null;
    };
    classification?: {
      is_structured_interval?: boolean;
      is_pool_swim?: boolean;
      is_easy_like?: boolean;
    };
    load?: {
      workload?: number | null;
      typical_low?: number | null;
      typical_high?: number | null;
      sample_count?: number | null;
    } | null;
    session_interpretation?: SessionInterpretationV1;
  } | null;
  hasSessionDetail: boolean;
  noPlannedCompare: boolean;
  hideTopAdherence?: boolean;
}

export default function AdherenceChips({
  sessionDetail: sd,
  hasSessionDetail,
  noPlannedCompare,
  hideTopAdherence,
}: AdherenceChipsProps) {
  try {
    if (!hasSessionDetail || !sd) return null;
    if (noPlannedCompare) return null;
    if (sd.display?.show_adherence_chips === false) return null;
    if (hideTopAdherence) return null;

    const ex = sd.execution;
    // ⛔ A BIG DEVIATION IS NOT A REASON TO STOP SCORING (2026-08-02, Michael: "if it attached it should
    // adhere to something").
    // `assessed_against` flips to 'actual' in TWO unrelated situations (`fact-packet/build.ts:848`):
    //   1. there is no planned workout at all — nothing to compare against, chips are meaningless.
    //   2. the distance deviated >=30% from plan, which the packet calls an "intentional" change.
    // This guard treated them the same and hid the chips for both. Case 2 is exactly BACKWARDS: there IS
    // a plan, the comparison DID run, and pace 90 / duration 78 / execution 84 are all sitting in the
    // contract. A 37%-short session is precisely when an athlete should see those numbers — and the
    // same screen was already printing "36 of 46 min planned (78%)" and a 90% interval row two lines
    // above, so the screen contradicted itself.
    // Case 1 is still handled, by `noPlannedCompare` above and by the analyzer nulling every adherence
    // field on an unlinked workout (D-035) — so nothing renders for a genuinely unplanned session.
    // ⚠️ `assessed_against` itself is UNCHANGED: the fact packet still uses it to pick stimulus criteria
    // and to tell the LLM not to compare against a prescription that does not exist. Only this display
    // guard moved.

    const executionScore = ex?.execution_score ?? null;
    const paceAdherence = ex?.pace_adherence ?? null;
    const powerAdherence = ex?.power_adherence ?? null;
    const durationAdherence = ex?.duration_adherence ?? null;
    // The EASY governor (rides prescribed without watts): share of time at or under the athlete's easy
    // ceiling. It takes the Power chip's slot, because it is the same question — "did you ride it as
    // prescribed" — asked of a session that prescribed an intensity instead of a number.
    const intensityAdherence = ex?.intensity_adherence ?? null;
    const easyUnderS = ex?.easy_under_s ?? null;
    const easyTotalS = ex?.easy_total_s ?? null;
    const easyCeilingBpm = ex?.easy_ceiling_bpm ?? null;
    // ⛔ SAY WHERE THE BAR CAME FROM (2026-08-01, Michael). "At or under 131 bpm" reads as a fact
    // handed down; it is an ESTIMATE off the highest heart rate we have observed, and the athlete
    // deserves to know that before it costs them a score. When a measured threshold anchors it
    // instead, the line says so — and that difference is the whole argument for doing a threshold test.
    // ⛔ ONE LINE, NOT TWO (2026-08-02, Michael: "at or under should be removed, just leave est").
    // "At or under 131 bpm" over "Est. from your max HR" was two lines saying one thing, and the extra
    // line made this chip taller than its neighbours — which is what knocked the row out of alignment.
    // "131 bpm · est. from your max HR" carries the bar AND its provenance in the space of one.
    // ⛔ AND IT STILL WRAPPED TO TWO LINES (2026-08-02). "134 bpm · from your threshold HR" is 30
    // characters in a third of the screen width, so it wrapped anyway and the chip stood taller than
    // its neighbours — the exact misalignment the line above was written to fix. The provenance is
    // now one word: `measured` when a real threshold test anchors the bar, `est.` when it is derived
    // from max HR. That distinction is the whole argument for doing a threshold test, and it survives
    // the shortening — what is lost is only the sentence around it.
    const easyCeilingNote = ex?.easy_ceiling_anchor === 'threshold'
      ? '· measured'
      : ex?.easy_ceiling_anchor === 'max_hr'
        ? '· est.'
        : null;
    const isGapAdjusted = !!ex?.gap_adjusted;
    const performanceAssessment = ex?.performance_assessment ?? null;
    const isStructured = !!sd.classification?.is_structured_interval;

    const allZero = (executionScore ?? 0) === 0 && (paceAdherence ?? 0) === 0 &&
      (powerAdherence ?? 0) === 0 && (durationAdherence ?? 0) === 0 && (intensityAdherence ?? 0) === 0;
    if (allZero) return null;
    const anyVal = executionScore != null || paceAdherence != null ||
      powerAdherence != null || durationAdherence != null || intensityAdherence != null;
    if (!anyVal) return null;

    const weekLabel = sd.plan_context?.week_label ?? null;
    const sportType = String(sd.type || '').toLowerCase();
    const isRide = /ride|bike|cycling/i.test(sportType);
    const isSwim = /swim/i.test(sportType);
    const isPoolSwim = !!sd.classification?.is_pool_swim;

    const decoupling = (sd.classification as any)?.decoupling as { pct: number | null; basis: 'gap' | 'raw' | 'hr' | null; whole_session?: boolean } | null | undefined;
    const driftPct = decoupling?.pct ?? null;
    const driftValue = driftPct != null ? `${driftPct.toFixed(1)}%` : null;
    const driftSubtitle = (() => {
      if (driftPct == null) return 'Heart-rate drift';
      const line = DRIFT_LIMITS.hybridPct;
      const d = Math.round((driftPct - line) * 10) / 10;
      // 2026-09-03, Michael: one short line per chip, plain words.
      // a FALL in heart rate has no room to compute (2026-09-03) — it is under the line, full stop
      const room = driftPct <= 0 ? `fell · under ${line}%` : (d > 0 ? `${d.toFixed(1)} over ${line}%` : `${Math.abs(d).toFixed(1)} under ${line}%`);
      const t = (sd as any)?.weather?.temperature_f;
      const heat = typeof t === 'number' && Number.isFinite(t) ? ` · ${Math.round(t)}°F` : '';
      // one line only; "whole session" and "hills" are said in the Heart rate row below
      void heat;
      return room;
    })();
    // 2026-09-03 (Michael: "we add an execution score, right? Drift?"): the header is Workload · Execution ·
    // Duration · Drift on every planned run and ride. The pace/GAP percentage that sat here was the blended
    // interval pace score and read as a mystery number; it lives per row in the interval table. Easy and
    // Power reads live in the Insights text.
    const executionSubtitle = 'efforts & time';

    const completedDurS = sd.completed_totals?.duration_s ?? null;
    const plannedDurS = sd.planned_totals?.duration_s ?? null;
    const durationDelta = (completedDurS != null && plannedDurS != null && plannedDurS > 0)
      ? completedDurS - plannedDurS : null;

    const chip = (label: string, pct: number | null, text: string) => {
      if (pct == null) return null;
      return (
        // 2026-09-03: same markup as chipText so the four readouts sit on one baseline (the percentage
        // chip used to be smaller and lower-case, which read as a different kind of thing).
        <div className="flex flex-col items-center px-1 min-w-0">
          <div className="readout-num text-lg whitespace-nowrap">{pct}%</div>
          <div className="readout-label text-[11px] uppercase text-center whitespace-nowrap">{label}</div>
          <div className="text-[10px] text-white/40 text-center leading-snug whitespace-nowrap">{text}</div>
        </div>
      );
    };

    // ⛔ EASY IS A READOUT, NOT A MARK (2026-08-02, Michael's call).
    // Every other chip here answers "how close to plan, out of 100". Easy does not, and it never
    // could: it is time spent under a heart-rate ceiling on a session whose whole purpose is aerobic
    // work at low cost. Printing it as 49% put a failing grade on a run executed exactly as
    // prescribed, on a warm hilly morning at RPE 2. None of the three apps we measure against score
    // an easy session — Strava shows the zone bar, Garmin shows time in zone, TrainingPeaks grades
    // duration and distance and nothing else. So the number stays, stated as the fact it is.
    // ⛔ THE SUBTITLE MUST NOT BREAK MID-FACT (2026-08-02, Michael: *"ctenr them better?"*).
    // "you typically 68–117" wrapped with "117" alone on the last line — the range split across two
    // rows, which reads as a different number. Three chips share a phone width, so wrapping is normal
    // and fine; wrapping THROUGH a value is not. `text-center` centres what does wrap, and the value
    // line is nowrap so a range, a bpm figure or a "64 of 108 min" can never be cut in half.
    const chipText = (label: string, value: string | null, text: string) => {
      if (!value) return null;
      return (
        <div className="flex flex-col items-center px-1 min-w-0">
          <div className="readout-num text-lg whitespace-nowrap">{value}</div>
          <div className="readout-label text-[11px] uppercase text-center whitespace-nowrap">{label}</div>
          <div className="text-[10px] text-white/40 text-center leading-snug whitespace-nowrap">{text}</div>
        </div>
      );
    };

    /**
     * ⛔ DURATION IS A READOUT TOO (2026-08-02, Michael: *"duration is one grade, time in prescribed
     * anything is another grade"*).
     *
     * The percentage could not answer the question he actually asks of it — "did you cut it short or
     * go long". It is distance-from-100 computed with Math.abs(), so a 35-minute run and a 57-minute
     * run against a 46-minute plan BOTH read 76%. "35 of 46 min" answers it at a glance and grades
     * nothing, exactly as the Easy chip now does.
     *
     * ⚠️ THESE ARE MOVING MINUTES. Both analyzers resolve actual duration from
     * `computed.overall.duration_s_moving`, so the sports agree with each other — but a session with
     * long stops reads short here for that reason alone, not for anything the athlete did.
     */
    const durationValue = (() => {
      const done = sd.completed_totals?.duration_s ?? null;
      const plan = sd.planned_totals?.duration_s ?? null;
      if (done == null || plan == null || plan <= 0) {
        // No plan to compare against — the percentage is the only honest thing left, and if that is
        // absent too the chip does not render at all.
        return durationAdherence != null ? `${durationAdherence}%` : null;
      }
      return `${Math.round(done / 60)} of ${Math.round(plan / 60)} min`;
    })();

    /** "22 of 35 min" — whole minutes, from the seconds the server measured.
     *
     * ⛔ NO FALLBACK TO THE PERCENTAGE (2026-08-02, Michael: *"is this a good fallback?"* — it was not).
     * The first version rendered `49%` when the seconds were absent, justified as a bridge for sessions
     * analysed before they existed. Two things were wrong with it. It was SILENT: one run reading
     * "22 of 35 min" and the next reading "49%", with nothing on screen saying why. And the reason
     * given for tolerating it — "it will age out" — was false, because nothing ages it out; there is no
     * backfill, only a person tapping recompute.
     *
     * ⚠️ The window it covered turned out to be about two sessions: a run analysed BEFORE this morning
     * has no percentage either, so it shows no Easy chip at all and never reached this branch. Paying
     * for a permanent second shape to cover two runs is the wrong trade — and the backfill that would
     * have retired it rewrites `heart_rate_summary`, which is State's durability substrate. Not worth
     * moving State to tidy two chips.
     *
     * So: no measurement, no chip. The session shows Execution and Duration until it is recomputed. */
    const easyValue = (easyUnderS != null && easyTotalS != null && easyTotalS > 0)
      ? `${Math.round(easyUnderS / 60)} of ${Math.round(easyTotalS / 60)} min`
      : null;
    const easySubtitle = easyCeilingBpm != null
      ? `under\u00a0${easyCeilingBpm}\u00a0bpm ${easyCeilingNote ?? ''}`.trim()
      : 'held easy';

    /**
     * ⛔ WORKLOAD REPLACES EXECUTION (2026-08-02, Michael: *"omfg what the fuck are all these score"*).
     *
     * The row carried Execution, Duration and Easy, and Execution was the other two averaged — it could
     * not say anything they did not already say, and its weighting was a number nobody chose. Three
     * questions, three numbers, no blends:
     *   · Duration — did you do the amount asked
     *   · Easy / Power — did you do it at the intensity asked
     *   · Workload — what it cost you
     *
     * ⚠️ THE RANGE IS THE POINT. "86" cannot be high or low on its own. This shows the athlete's OWN
     * middle-half band for the same sport, the way Strava frames Relative Effort and Garmin bands
     * Training Load — where it SITS among theirs, never a verdict. Below five sessions there is no
     * band and the chip makes no claim.
     */
    const loadValue = sd.load?.workload != null ? String(sd.load.workload) : null;
    const loadSubtitle = (() => {
      const lo = sd.load?.typical_low;
      const hi = sd.load?.typical_high;
      if (lo == null || hi == null) return 'What it cost';
      // Non-breaking space before the range so "typically" can wrap but "68–117" never splits.
      return lo === hi ? `usual\u00a0${lo}` : `usual\u00a0${lo}–${hi}`;
    })();

    const fmtDeltaTime = (s: number) => {
      const sign = s >= 0 ? '+' : '−';
      const v = Math.abs(Math.round(s));
      const m = Math.floor(v / 60);
      const ss = v % 60;
      return `${sign}${m}:${String(ss).padStart(2, '0')}`;
    };

    // D-084: absolute duration formatter for the Duration chip's secondary
    // line. The adherence % already conveys "how close to plan" — the
    // secondary line is more useful as the actual completed duration than
    // as a +/− delta from plan. H:MM:SS when ≥ 1h, MM:SS otherwise.
    const fmtDurAbs = (s: number) => {
      const v = Math.max(0, Math.round(s));
      const h = Math.floor(v / 3600);
      const m = Math.floor((v % 3600) / 60);
      const ss = v % 60;
      return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${m}:${String(ss).padStart(2, '0')}`;
    };

    // ── Swim (open water only) ───────────────────────────────────────────────
    if (isSwim && !isPoolSwim) {
      const swimUnit = sd.planned_totals?.swim_unit || 'yd';
      const plannedPer100 = sd.planned_totals?.swim_pace_per_100_s ?? null;
      const executedPer100 = sd.completed_totals?.swim_pace_per_100_s ?? null;
      const paceDeltaSec = (plannedPer100 != null && executedPer100 != null)
        ? plannedPer100 - executedPer100 : null;
      const fmtDeltaPer100 = (s: number) => {
        const faster = s > 0;
        const v = Math.abs(s);
        const m = Math.floor(v / 60);
        const ss = Math.round(v % 60);
        return `${m ? `${m}m ` : ''}${ss}s/${swimUnit === 'yd' ? '100yd' : '100m'} ${faster ? 'faster' : 'slower'}`.trim();
      };

      return (
        <div className="w-full pt-1 pb-2">
          {weekLabel && <div className="readout-label mb-2 text-center text-[11px] uppercase">{weekLabel}</div>}
          <div className="flex items-center justify-center gap-6 text-center mb-3">
            <div className="flex items-start justify-between w-full px-3">
              {chipText('Workload', loadValue, loadSubtitle)}
              {chip('Pace', paceAdherence, paceDeltaSec != null ? fmtDeltaPer100(paceDeltaSec) : '—')}
              {chipText('Duration', durationValue, 'of plan')}
            </div>
          </div>
        </div>
      );
    }

    // ── Ride ─────────────────────────────────────────────────────────────────
    if (isRide) {
      return (
        <div className="w-full pt-1 pb-2">
          {weekLabel && <div className="readout-label mb-2 text-center text-[11px] uppercase">{weekLabel}</div>}
          <div className="flex items-center justify-center gap-6 text-center mb-3">
            <div className="flex items-start justify-between w-full px-3">
              {chipText('Workload', loadValue, loadSubtitle)}
              {/* 2026-09-03: Execution and Drift on rides too (Michael: "drift really important on the
                  performance screens for running and riding"). Power / Easy reads live in Insights. */}
              {executionScore != null && chip('Execution', executionScore, 'efforts & time')}
              {chipText('Duration', durationValue, 'of plan')}
              {driftValue != null && chipText('Drift', driftValue, driftSubtitle)}
            </div>
          </div>
        </div>
      );
    }

    // ── Run / Walk (default) ─────────────────────────────────────────────────
    const paceChipLabel = isGapAdjusted ? 'GAP' : 'Pace';
    const paceChipSubtitle = isStructured
      ? (isGapAdjusted ? 'Blended interval GAP' : 'Blended interval pace')
      : (isGapAdjusted ? 'Grade-adjusted pace' : 'Pace adherence');

    const showPaceChip = !sd.classification?.is_easy_like;
    // ⛔ HEART-RATE DRIFT AGAINST THE BOOK'S LINE (Michael 2026-09-02: "the performance screen should reflect
    // that difference so the user can see if they need to dial back or have room"). p107: terminate an easy
    // session at 10%; 5% for hybrid athletes training many sessions a week — our whole audience. The chip
    // states the measurement and the room; it does not judge. Terrain-confounded ('raw') reads say so.

    return (
      <div className="w-full pt-1 pb-2">
        {weekLabel && <div className="readout-label mb-2 text-center text-[11px] uppercase">{weekLabel}</div>}
        <div className="flex items-center justify-center gap-6 text-center mb-3">
          <div className="flex items-start justify-between w-full px-3">
            {chipText('Workload', loadValue, loadSubtitle)}
            {executionScore != null && chip('Execution', executionScore, executionSubtitle)}
            {chipText('Duration', durationValue, 'of plan')}
            {driftValue != null && chipText('Drift', driftValue, driftSubtitle)}
          </div>
        </div>
      </div>
    );
  } catch { return null; }
}
