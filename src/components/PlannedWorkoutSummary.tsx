import React from 'react';
import { normalizePlannedSession, Baselines as NormalizerBaselines, ExportHints } from '@/services/plans/normalizer';
import { normalizeStructuredSession } from '@/services/plans/normalizer';
// ⛔ ONE PLANNED-DURATION READER (stage 2). See `src/lib/planned-session/duration.ts`.
import { plannedDurationMinutes } from '@/lib/planned-session/duration';
import { formatStrengthExercise, formatStrengthExerciseLines } from '@/utils/strengthFormatter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getDisciplinePhosphorCore } from '@/lib/context-utils';
import { swimPlannedEquipmentFromWorkout } from '@/lib/plan-tokens/swim-drill-tokens';
import {
  categorizeSwimTokensForDisplay,
  formatSwimSubtitleFromBuckets,
  stripTrailingSwimDistanceFromTitle,
  sumSwimYardsFromStepsPresetTokens,
} from '@/utils/swimPlanTokens';
import { deriveWorkoutTitle } from '@/lib/derive-workout-title';
// ⛔ ONE SWAP PREDICATE + ONE CLEAN BLOCK, shared by all three surfaces.
import { swappedSessionBlock, swappedStructureIsStale } from '@/lib/session-discipline-swap';

type Baselines = NormalizerBaselines | Record<string, any> | null | undefined;

interface PlannedWorkoutSummaryProps {
  workout: any;
  baselines?: Baselines;
  exportHints?: ExportHints;
  hideLines?: boolean;
  /**
   * ⛔ SUPPRESS THIS COMPONENT'S OWN TITLE + DURATION LINE. Set it wherever
   * `PlannedSessionHeader` is rendered directly above — otherwise the sport-coloured title and the
   * `63:00` appear twice on one screen, which is exactly what the Today's drawer was doing.
   */
  hideHeader?: boolean;
  /**
   * ⛔ THE CALLER ALREADY PRINTED THE DESCRIPTION (2026-08-08). `buildWeeklySubtitle`'s last resort
   * is `rendered_description || description` — correct when this block stands alone, and a DUPLICATE
   * inside a drawer whose header already renders the same string. Device-confirmed: a plain planned
   * run showed the full "~63 min easy…" text under the title AND again under the "Easy Run 63:00"
   * sub-header.
   *
   * ⚠️ OPT-IN, so every other caller is byte-identical, and it suppresses ONLY the plain-description
   * fallback — structured content (intervals, swim buckets, strength rows) still renders, because
   * that is not what was duplicated.
   */
  suppressDescriptionFallback?: boolean;
  suppressNotes?: boolean;
}

const formatDuration = (minutes: number) => {
  if (!minutes && minutes !== 0) return '';
  const mins = minutes % 60;
  const totalMins = minutes;
  // Return MM:00 format (e.g., "52:00")
  return `${totalMins}:00`;
};

// Delegates to the shared canonical title helper (`src/lib/derive-workout-title.ts`),
// the single source of truth across PlannedWorkoutSummary / AllPlansInterface /
// TodaysEffort. Closes the ENGINE-STATE Known Broken label-divergence entry.
function getTitle(workout: any): string {
  return deriveWorkoutTitle(workout);
}

function parseComputed(workout: any): any | null {
  try {
    const c = (workout as any)?.computed;
    if (!c) return null;
    if (typeof c === 'string') return JSON.parse(c);
    return c;
  } catch { return (workout as any)?.computed || null; }
}

/**
 * ⛔ `computeMinutes` IS DELETED (stage 2, 2026-08-09) — see `src/lib/planned-session/duration.ts`.
 *
 * It was the app's FOURTH duration ladder and the only one that preferred the **steps-sum over the
 * stored total**; every other reader preferred the stored total. So a row carrying both, disagreeing,
 * printed one number on the calendar and on Today's card and a different one here.
 *
 * ⚠️ ITS ONE REAL CAPABILITY WAS KEPT, NOT DROPPED: pricing a distance-based step from its pace
 * target, so "6 × 800m @ 5k pace" still reads as a duration. That moved into `stepSeconds` in the
 * shared reader. Its `baselines` / `exportHints` parameters were never read and are gone.
 */

function computeSwimYards(workout: any): number | null {
  const type = String((workout as any)?.type || '').toLowerCase();
  if (type !== 'swim') return null;
  // Prefer tokens (authoring unit is yd) — includes swim_aerobic_css_* main sets
  try {
    const toks: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset : [];
    if (toks.length) {
      const sum = sumSwimYardsFromStepsPresetTokens(toks);
      return sum > 0 ? sum : null;
    }
  } catch {}
  // Fallback to computed distances
  try {
    const compC = parseComputed(workout);
    const steps: any[] = Array.isArray(compC?.steps) ? compC.steps : [];
    if (steps.length) {
      const meters = steps.reduce((a: number, st: any) => a + (Number(st?.distanceMeters) || 0), 0);
      const yd = Math.round(meters / 0.9144);
      if (yd > 0) return yd;
    }
  } catch {}
  return null;
}

/**
 * ⚠️ `skipDescriptionFallback` suppresses ONLY this function's last resort — the raw
 * `rendered_description || description`. Structured output (intervals, swim buckets, strength rows)
 * is unaffected, because that is not what duplicates. Set by a caller that already printed the
 * description itself; see `PlannedWorkoutSummaryProps.suppressDescriptionFallback`.
 */
function buildWeeklySubtitle(workout: any, baselines?: Baselines, skipDescriptionFallback?: boolean): string | undefined {
  try {
    const pn = (baselines as any)?.performanceNumbers || {};
    try {
      const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
      if (disc === 'pilates_yoga') {
        // Extract session type details for pilates/yoga
        const metadata = (workout as any)?.workout_metadata || {};
        const sessionType = metadata.session_type;
        const parts: string[] = [];
        
        if (sessionType) {
          const sessionTypeLabels: { [key: string]: string } = {
            'pilates_mat': 'Mat',
            'pilates_reformer': 'Reformer',
            'yoga_flow': 'Flow',
            'yoga_restorative': 'Restorative',
            'yoga_power': 'Power',
            'other': ''
          };
          const typeLabel = sessionTypeLabels[sessionType];
          if (typeLabel) parts.push(typeLabel);
        } else {
          // Infer from description/name for planned workouts
          const nameLower = String(workout.name || '').toLowerCase();
          const descLower = String(workout.description || workout.rendered_description || '').toLowerCase();
          const combined = (nameLower + ' ' + descLower).toLowerCase();
          
          if (/reformer/i.test(combined)) parts.push('Reformer');
          else if (/mat/i.test(combined)) parts.push('Mat');
          else if (/yoga.*power|ashtanga|power.*yoga/i.test(combined)) parts.push('Power');
          else if (/yoga.*flow|vinyasa|flow.*yoga/i.test(combined)) parts.push('Flow');
          else if (/yoga.*restorative|yin.*yoga|restorative.*yoga/i.test(combined)) parts.push('Restorative');
        }
        
        /**
         * ⛔ ONE DURATION READER (stage 4). Two IDENTICAL copies of this ladder survived stage 2 —
         * it deleted `computeMinutes` and missed these, because they sit in the subtitle builders
         * rather than the badge path. The enforcement scan found them.
         *
         * ⚠️ `?? duration` IS KEPT: the accessor answers in seconds and knows nothing about the
         * `duration` MINUTES column, which is the only time some library-plan rows carry.
         */
        let durationMins: number | null = plannedDurationMinutes(workout);
        if (durationMins == null && typeof (workout as any)?.duration === 'number' && (workout as any).duration > 0) {
          durationMins = Math.round((workout as any).duration);
        }
        if (durationMins && durationMins > 0) {
          parts.push(`${durationMins}min`);
        }
        
        // Add RPE if available
        const rpe = metadata.session_rpe;
        if (typeof rpe === 'number' && rpe > 0) {
          parts.push(`RPE ${rpe}/10`);
        }
        
        // Add focus areas if available
        const focusAreas = metadata.focus_area;
        if (Array.isArray(focusAreas) && focusAreas.length > 0) {
          const focusLabels: { [key: string]: string } = {
            'core': 'Core',
            'upper_body': 'Upper Body',
            'lower_body': 'Lower Body',
            'flexibility': 'Flexibility',
            'balance': 'Balance',
            'full_body': 'Full Body'
          };
          const focusList = focusAreas.map((f: string) => focusLabels[f] || f).join(', ');
          if (focusList) parts.push(focusList);
        }
        
        if (parts.length > 0) return parts.join(' • ');
        
        // Fallback to description if no structured data
        if (skipDescriptionFallback) return undefined;
        const desc = String((workout as any)?.rendered_description || (workout as any)?.description || '').trim();
        if (desc) return desc;
      }
      if (disc === 'swim') {
        const stepsTok: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t: any) => String(t)) : [];
        if (stepsTok.length) {
          const line = formatSwimSubtitleFromBuckets(categorizeSwimTokensForDisplay(stepsTok), ' • ');
          if (line) return line;
        }
      }
    } catch {}
    const structured = (workout as any)?.workout_structure;
    if (structured && typeof structured === 'object') {
      try {
        const res = normalizeStructuredSession(workout, { performanceNumbers: pn, learned_fitness: (baselines as any)?.learned_fitness } as any);
        if (res?.friendlySummary) return res.friendlySummary;
      } catch {}
    }
    const friendly = String((workout as any)?.friendly_summary || '').trim();
    if (friendly) return friendly;
    if (skipDescriptionFallback) return undefined;
    const desc = String((workout as any)?.rendered_description || (workout as any)?.description || '').trim();
    return desc || undefined;
  } catch { return undefined; }
}

// Structured‑only variant: no coach notes fallback
function buildStructuredSubtitleOnly(workout: any, baselines?: Baselines): string | undefined {
  try {
    const pn = (baselines as any)?.performanceNumbers || {};
    const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
    if (disc === 'pilates_yoga') {
      // Extract session type details for pilates/yoga
      const metadata = (workout as any)?.workout_metadata || {};
      const sessionType = metadata.session_type;
      const parts: string[] = [];
      
      if (sessionType) {
        const sessionTypeLabels: { [key: string]: string } = {
          'pilates_mat': 'Mat',
          'pilates_reformer': 'Reformer',
          'yoga_flow': 'Flow',
          'yoga_restorative': 'Restorative',
          'yoga_power': 'Power',
          'other': ''
        };
        const typeLabel = sessionTypeLabels[sessionType];
        if (typeLabel) parts.push(typeLabel);
      } else {
        // Infer from description/name for planned workouts
        const nameLower = String(workout.name || '').toLowerCase();
        const descLower = String(workout.description || workout.rendered_description || '').toLowerCase();
        const combined = (nameLower + ' ' + descLower).toLowerCase();
        
        if (/reformer/i.test(combined)) parts.push('Reformer');
        else if (/mat/i.test(combined)) parts.push('Mat');
        else if (/yoga.*power|ashtanga|power.*yoga/i.test(combined)) parts.push('Power');
        else if (/yoga.*flow|vinyasa|flow.*yoga/i.test(combined)) parts.push('Flow');
        else if (/yoga.*restorative|yin.*yoga|restorative.*yoga/i.test(combined)) parts.push('Restorative');
      }
      
      /**
       * ⛔ ONE DURATION READER (stage 4). Two IDENTICAL copies of this ladder survived stage 2 —
       * it deleted `computeMinutes` and missed these, because they sit in the subtitle builders
       * rather than the badge path. The enforcement scan found them.
       *
       * ⚠️ `?? duration` IS KEPT: the accessor answers in seconds and knows nothing about the
       * `duration` MINUTES column, which is the only time some library-plan rows carry.
       */
      let durationMins: number | null = plannedDurationMinutes(workout);
      if (durationMins == null && typeof (workout as any)?.duration === 'number' && (workout as any).duration > 0) {
        durationMins = Math.round((workout as any).duration);
      }
      if (durationMins && durationMins > 0) {
        parts.push(`${durationMins}min`);
      }
      
      // Add RPE if available
      const rpe = metadata.session_rpe;
      if (typeof rpe === 'number' && rpe > 0) {
        parts.push(`RPE ${rpe}/10`);
      }
      
      // Add focus areas if available
      const focusAreas = metadata.focus_area;
      if (Array.isArray(focusAreas) && focusAreas.length > 0) {
        const focusLabels: { [key: string]: string } = {
          'core': 'Core',
          'upper_body': 'Upper Body',
          'lower_body': 'Lower Body',
          'flexibility': 'Flexibility',
          'balance': 'Balance',
          'full_body': 'Full Body'
        };
        const focusList = focusAreas.map((f: string) => focusLabels[f] || f).join(', ');
        if (focusList) parts.push(focusList);
      }
      
      if (parts.length > 0) return parts.join(' • ');
      
      // Fallback to description if no structured data
      const desc = String((workout as any)?.rendered_description || (workout as any)?.description || '').trim();
      if (desc) return desc;
    }
    if (disc === 'swim') {
      const stepsTok: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t: any) => String(t)) : [];
      if (stepsTok.length) {
        const line = formatSwimSubtitleFromBuckets(categorizeSwimTokensForDisplay(stepsTok), ' • ');
        if (line) return line;
      }
    }
    const structured = (workout as any)?.workout_structure;
    if (structured && typeof structured === 'object') {
      try {
        const res = normalizeStructuredSession(workout, { performanceNumbers: pn, learned_fitness: (baselines as any)?.learned_fitness } as any);
        if (res?.friendlySummary) return res.friendlySummary;
      } catch {}
    }
    return undefined;
  } catch { return undefined; }
}

export const PlannedWorkoutSummary: React.FC<PlannedWorkoutSummaryProps> = ({ workout, baselines, exportHints, hideLines, suppressNotes, suppressDescriptionFallback, hideHeader }) => {
  const minutes = (()=>{
    const t = String((workout as any)?.type||'').toLowerCase();
    if (t==='strength') return null; // avoid misleading 45min placeholders
    return plannedDurationMinutes(workout);
  })();
  /**
   * ⚠️ ALSO A SWAP LEAK. `computeSwimYards` falls back to `computed.steps[].distanceMeters`, so a
   * session swapped TO swim would print the ORIGINAL run's metres as pool yardage — a fabricated
   * distance under a swim's name. A swapped session has no distance; that is the point of it.
   */
  const yards = swappedStructureIsStale(workout as never) ? null : computeSwimYards(workout);
  const title = getTitle(workout);
  /**
   * ⛔ THE FLAG IS PASSED DOWN, NOT COMPARED AFTERWARDS (corrected 2026-08-09). The first version
   * suppressed the subtitle when it was byte-identical to the row's description — which is fragile
   * in exactly the way that matters: any whitespace or prefix difference and the duplicate returns
   * with nothing failing. The builder now declines to produce the fallback at all, so there is no
   * string to compare.
   */
  /**
   * ⛔ A SWAPPED SESSION GETS THE CLEAN BLOCK, NOT THE SOURCE SPORT'S SUBTITLE (2026-08-09).
   *
   * `buildWeeklySubtitle` reads `computed.steps`, `steps_preset` and `intervals` — and the swap
   * patch clears only `steps_preset`. So on a swapped Easy Ride it reached the RUN's computed steps
   * and printed *"5.0 mi @ run pace"* under a ride's name; on a swapped hard ride it printed the
   * hill-run structure, "Walk down" included.
   *
   * ⚠️ SUPPRESSED AT THE SUBTITLE, NOT BY BLANKING THE ROW. `plannedDurationMinutes` above still
   * reads the same `computed.steps` for its third rung — the duration is the one thing a swap
   * preserves, so the data has to stay readable even though it must stop being displayed.
   */
  const swapped = swappedStructureIsStale(workout as never);
  const swapBlock = swapped ? swappedSessionBlock(workout as never) : null;
  const lines = swapBlock
    ? swapBlock.effort
    : suppressNotes
      ? (buildStructuredSubtitleOnly(workout, baselines) || '')
      : (buildWeeklySubtitle(workout, baselines, suppressDescriptionFallback) || '');
  const linesShown = lines;
  const isStrength = String((workout as any)?.type||'').toLowerCase()==='strength';
  const isMobility = String((workout as any)?.type||'').toLowerCase()==='mobility';
  const strengthItems: string[] = (() => {
    if (!isStrength) return [];
    try {
      // Prefer computed strength steps (server-prescribed)
      const compD = parseComputed(workout);
      const cSteps: any[] = Array.isArray(compD?.steps) ? compD.steps : [];
      const comp = cSteps.filter(st => String((st as any)?.kind||'').toLowerCase()==='strength').map((st:any)=> st?.strength).filter(Boolean) as any[];
      const asLines = (arr:any[]) => arr.map((s:any)=>{
        // Use shared formatter for consistent display
        return formatStrengthExercise(s, 'imperial');
      });
      if (comp.length) return formatStrengthExerciseLines(comp, 'imperial');
      // Fallback: authored exercises
      const ex: any[] = Array.isArray((workout as any)?.strength_exercises) ? (workout as any).strength_exercises : [];
      if (!ex.length) return [];
      return formatStrengthExerciseLines(ex, 'imperial', (e:any)=>{
        // Fallback for non-materialized exercises - use shared formatter
        // Special handling for string weights (e.g., "70% 1RM" from raw JSON)
        if (typeof e?.weight === 'string' && e.weight.trim()) {
          // Keep string weights as-is for raw exercises
          const formatted = formatStrengthExercise(e, 'imperial');
          const name = String(e?.name||'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
          const sets = Math.max(1, Number(e?.sets)||1);
          const repsVal:any = (():any=>{ const r=e?.reps||e?.rep; if (typeof r==='string') return r.toUpperCase(); if (typeof r==='number') return Math.max(1, Math.round(r)); return undefined; })();
          const repTxt = (typeof repsVal==='string') ? repsVal : `${Number(repsVal||0)}`;
          const notes = e?.notes ? ` (${String(e.notes).trim()})` : '';
          return `${name} ${sets}×${repTxt} — ${e.weight.trim()}${notes}`;
        }
        return formatStrengthExercise(e, 'imperial');
      });
    } catch { return []; }
  })();

  // Endurance detail lines from computed steps (no coach notes)
  const enduranceLines: string[] = (() => {
    try {
      const t = String((workout as any)?.type||'').toLowerCase();
      if (!(t==='run' || t==='ride' || t==='walk')) return [];
      const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
      if (!steps.length) return [];
      const hints = (workout as any)?.export_hints || {};
      const tolQual: number = (typeof hints?.pace_tolerance_quality==='number' ? hints.pace_tolerance_quality : 0.04);
      const tolEasy: number = (typeof hints?.pace_tolerance_easy==='number' ? hints.pace_tolerance_easy : 0.06);
      const fmtTime = (s:number)=>{ const x=Math.max(1,Math.round(Number(s)||0)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
      const fmtDist = (meters:number)=>{
        const m = Math.max(1, Math.round(Number(meters)||0));
        const planUnits = String((workout as any)?.units||'').toLowerCase();
        if (planUnits === 'metric') {
          // Metric: show km for longer distances, m for shorter
          if (m >= 1000) {
            const km = (m / 1000).toFixed(1);
            return `${km} km`;
          }
          return `${m} m`;
        } else {
          // Imperial: convert meters to miles
          const miles = m / 1609.34;
          if (miles < 0.1) {
            // Very short distances: show in yards
            const yards = Math.round(m / 0.9144);
            return `${yards} yd`;
          } else if (miles < 1) {
            // Less than a mile: show with 2 decimals
            return `${miles.toFixed(2)} mi`;
          } else {
            // One mile or more: show with 1 decimal
            return `${miles.toFixed(1)} mi`;
          }
        }
      };
      // Check if this is a race day workout (fixed M pace, no range)
      const tags: string[] = Array.isArray((workout as any)?.tags) ? (workout as any).tags.map((t:any)=>String(t).toLowerCase()) : [];
      const isRaceDay = tags.includes('race_day') || tags.includes('marathon_pace');
      
      const paceStrWithRange = (paceTarget?: string, kind?: string, paceRange?: any) => {
        try {
          // RACE DAY: Show fixed M pace (no range) - matches generator logic
          if (isRaceDay && paceTarget) {
            // For race day, return the exact pace target without range
            return paceTarget;
          }
          
          // Priority 1: Use server-processed pace_range object
          if (paceRange && typeof paceRange === 'object' && paceRange.lower && paceRange.upper) {
            const formatPace = (sec: number) => {
              const mins = Math.floor(sec / 60);
              const secs = Math.round(sec % 60);
              return `${mins}:${secs.toString().padStart(2, '0')}`;
            };
            return `${formatPace(paceRange.lower)}–${formatPace(paceRange.upper)}/mi`;
          }
          
          // Priority 2: Use server-processed pace_range array
          if (Array.isArray(paceRange) && paceRange.length === 2 && paceRange[0] && paceRange[1]) {
            return `${paceRange[0]}–${paceRange[1]}`;
          }
          
          // Priority 3: Fall back to client-side calculation from paceTarget
          if (!paceTarget) return undefined;
          const m = String(paceTarget).match(/(\d+):(\d{2})\/(mi|km)/i);
          if (!m) return undefined;
          const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
          const unit = m[3].toLowerCase();
          const ease = String(kind||'').toLowerCase();
          const tol = (ease==='recovery' || ease==='warmup' || ease==='cooldown') ? tolEasy : tolQual;
          const lo = Math.round(sec*(1 - tol));
          const hi = Math.round(sec*(1 + tol));
          const mmss = (n:number)=>{ const mm=Math.floor(n/60); const ss=n%60; return `${mm}:${String(ss).padStart(2,'0')}`; };
          return `${mmss(lo)}–${mmss(hi)}/${unit}`;
        } catch { return undefined; }
      };
      const powerStr = (st:any) => (st?.powerRange && typeof st.powerRange.lower==='number' && typeof st.powerRange.upper==='number') ? `${Math.round(st.powerRange.lower)}–${Math.round(st.powerRange.upper)} W` : undefined;
      /**
       * ⛔ WHAT THE STEP IS PRESCRIBED BY (Michael 2026-09-02, D-462 + the materializer's stampRunPrescription).
       * Easy steps carry `prescription: 'heart_rate'` + `hr_range` (bpm) — the heart rate is the target and the
       * pace is a reference. Hard work steps carry `target_rpe` — the pace is the target, the effort is the
       * gauge. Rows written before the stamp carry neither and print exactly as before.
       */
      const hrStr = (st:any) => (st?.prescription === 'heart_rate' && st?.hr_range && typeof st.hr_range.lower === 'number' && typeof st.hr_range.upper === 'number')
        ? `HR ${Math.round(st.hr_range.lower)}–${Math.round(st.hr_range.upper)}` : undefined;
      const rpeStr = (st:any) => (st?.target_rpe && typeof st.target_rpe.lo === 'number' && typeof st.target_rpe.hi === 'number')
        ? `effort ${st.target_rpe.lo}–${st.target_rpe.hi}` : undefined;
      const workAnnoOf = (st:any, pace?: string, power?: string): string => anno(st, pace, power);
      const anno = (st:any, pace?: string, power?: string): string => {
        const hr = hrStr(st);
        if (hr) return ` (${hr}${pace ? ` · ref ${pace}` : ''})`;
        const rpe = rpeStr(st);
        if (pace) return ` (${pace}${rpe ? ` · ${rpe}` : ''})`;
        if (power) return ` (${power})`;
        if (rpe) return ` (${rpe})`;
        return '';
      };
      const out: string[] = [];
      let i = 0;
      const isWork = (x:any)=> String((x?.kind||'')).toLowerCase()==='work' || String((x?.kind||''))==='interval_work' || String((x?.kind||'')).toLowerCase()==='steady';
      const isRec = (x:any)=> String((x?.kind||'')).toLowerCase()==='recovery' || /rest/i.test(String(x?.label||''));
      while (i < steps.length) {
        const st:any = steps[i];
        const kind = String(st?.kind||'').toLowerCase();
        if (kind==='warmup' && typeof st?.seconds==='number') {
          const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'warmup', st?.pace_range);
          out.push(`WU ${fmtTime(st.seconds)}${anno(st, pace)}`);
          i += 1; continue;
        }
        if (kind==='cooldown' && typeof st?.seconds==='number') {
          const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'cooldown', st?.pace_range);
          out.push(`CD ${fmtTime(st.seconds)}${anno(st, pace)}`);
          i += 1; continue;
        }
        if (isWork(st)) {
          // Check for stride label - strides should show as "100m Stride" not just "0.06 mi"
          const strideLabel = String(st?.label || '').trim();
          const isStride = /stride/i.test(strideLabel);
          const workLabel = (()=>{
            // For strides, show distance in meters/yards for clarity (100m is clearer than 0.06 mi)
            if (isStride && typeof st?.distance_m==='number' && st.distance_m>0) {
              const distM = Math.round(st.distance_m);
              if (distM < 1000) return `${distM}m Stride`;
            }
            if (typeof st?.distanceMeters==='number' && st.distanceMeters>0) {
              // For very short distances (< 200m), show in meters for clarity
              if (st.distanceMeters < 200 && !isStride) {
                return `${Math.round(st.distanceMeters)}m`;
              }
              return fmtDist(st.distanceMeters);
            }
            if (typeof st?.distance_m==='number' && st.distance_m>0) {
              if (st.distance_m < 200 && !isStride) {
                return `${Math.round(st.distance_m)}m`;
              }
              return fmtDist(st.distance_m);
            }
            if (typeof st?.seconds==='number' && st.seconds>0) return fmtTime(st.seconds);
            return 'interval';
          })();
          const workPace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined, st?.kind, st?.pace_range);
          const workPower = powerStr(st);
          const next = steps[i+1];
          const hasRec = next && isRec(next);
          const restLabel = hasRec ? (()=>{
            if (typeof next?.seconds==='number' && next.seconds>0) return fmtTime(next.seconds);
            if (typeof next?.distanceMeters==='number' && next.distanceMeters>0) return fmtDist(next.distanceMeters);
            if (typeof next?.distance_m==='number' && next.distance_m>0) return fmtDist(next.distance_m);
            return 'rest';
          })() : undefined;
          const restPace = hasRec ? paceStrWithRange(typeof next?.paceTarget==='string'?next.paceTarget:undefined, 'recovery', next?.pace_range) : undefined;
          const restPower = hasRec ? powerStr(next) : undefined;
          let count = 0; let j = i;
          while (j < steps.length) {
            const a = steps[j]; const b = steps[j+1];
            if (!isWork(a)) break;
            const aStrideLabel = String(a?.label || '').trim();
            const aIsStride = /stride/i.test(aStrideLabel);
            const aLabel = (()=>{
              if (aIsStride && typeof a?.distance_m==='number' && a.distance_m>0) {
                return `${Math.round(a.distance_m)}m Stride`;
              }
              if (typeof a?.distanceMeters==='number' && a.distanceMeters>0) {
                if (a.distanceMeters < 200 && !aIsStride) return `${Math.round(a.distanceMeters)}m`;
                return fmtDist(a.distanceMeters);
              }
              if (typeof a?.distance_m==='number' && a.distance_m>0) {
                if (a.distance_m < 200 && !aIsStride) return `${Math.round(a.distance_m)}m`;
                return fmtDist(a.distance_m);
              }
              if (typeof a?.seconds==='number') return fmtTime(a.seconds);
              return 'interval';
            })();
            const aPace = paceStrWithRange(typeof a?.paceTarget==='string'?a.paceTarget:undefined, a?.kind, a?.pace_range);
            const aPow = powerStr(a);
            const bLabel = (b && isRec(b)) ? ((typeof b?.seconds==='number' && b.seconds>0) ? fmtTime(b.seconds) : (typeof b?.distanceMeters==='number' && b.distanceMeters>0 ? fmtDist(b.distanceMeters) : (typeof b?.distance_m==='number' && b.distance_m>0 ? fmtDist(b.distance_m) : 'rest'))) : undefined;
            const bPace = (b && isRec(b)) ? paceStrWithRange(typeof b?.paceTarget==='string'?b.paceTarget:undefined, 'recovery', b?.pace_range) : undefined;
            const bPow = (b && isRec(b)) ? powerStr(b) : undefined;
            const sameWork = (aLabel===workLabel) && anno(a, aPace, aPow)===workAnnoOf(st, workPace, workPower);
            const sameRest = (!hasRec && !b) || (!!hasRec && !!b && isRec(b) && bLabel===restLabel && anno(b, bPace, bPow)===anno(next, restPace, restPower));
            if (!sameWork || !sameRest) break;
            count += 1; j += hasRec ? 2 : 1;
          }
          const workAnno = anno(st, workPace, workPower);
          const restAnno = hasRec ? ` ${restLabel}${anno(next, restPace, restPower)}` : '';
          const countDisplay = Math.max(1, Number(count)||0);
          out.push(`${countDisplay} × ${workLabel}${workAnno}${restAnno}`);
          if (j <= i) { i += 1; continue; }
          i = j; continue;
        }
        if (typeof st?.seconds==='number') { out.push(`1 × ${fmtTime(st.seconds)}`); i+=1; continue; }
        if (typeof st?.distanceMeters==='number') { out.push(`1 × ${fmtDist(st.distanceMeters)}`); i+=1; continue; }
        i += 1;
      }
      return out;
    } catch { return []; }
  })();
  const mobilityLines: string[] = (() => {
    if (!isMobility) return [];
    try {
      const raw = (workout as any)?.mobility_exercises;
      const arr: any[] = Array.isArray(raw) ? raw : (typeof raw==='string'? (JSON.parse(raw)||[]): []);
      if (!Array.isArray(arr) || arr.length===0) return [];
      return arr.map((m:any)=>{
        const name = String(m?.name||'').trim();
        const dur = String(m?.duration||'').trim();
        const desc = String(m?.description||'').trim();
        return [name, dur, desc].filter(Boolean).join(' — ');
      });
    } catch { return []; }
  })();
  const stacked = String(lines).split(/\s•\s/g).filter(Boolean);
  const workoutType = String(workout.type || workout.workout_type || '').toLowerCase();
  const disciplineColor = getDisciplinePhosphorCore(workoutType);

  const swimEquipment =
    workoutType === 'swim' ? swimPlannedEquipmentFromWorkout(workout as any) : null;
  
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        {/**
          * ⛔ `hideHeader` EXISTS BECAUSE THE DRAWER PRINTS THIS TWICE OTHERWISE (2026-08-09).
          * `PlannedSessionHeader` now owns the sport-coloured title and the duration on all three
          * planned surfaces. Where that header is above this component — the Today's drawer — this
          * line is the SECOND copy, which is the "63 min printed twice" the athlete sees.
          *
          * ⚠️ IT HIDES THE TITLE AND THE DURATION ONLY. The yardage and workload chips are this
          * component's own facts, not the header's, so they keep rendering.
          */}
        <div className="font-light tracking-normal text-base flex items-center gap-2" style={{ color: disciplineColor }}>
          {!hideHeader && <span>{title}</span>}
          <span className="flex items-center gap-1">
            {(typeof minutes === 'number' && !hideHeader) ? (
              <span className="text-xs text-white font-light">{minutes}:00</span>
            ) : null}
            {(typeof yards === 'number') ? (
              <span className="text-xs text-blue-300">{yards} yd</span>
            ) : null}
            {(workout as any)?.workload_planned ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-gray-300"
                title="Planned workload: hours times intensity, one hour at threshold is 100"
              >
                <span className="text-white/45 font-normal">Workload</span>
                <span className="text-gray-200 tabular-nums">{Math.round(Number((workout as any).workload_planned))}</span>
              </span>
            ) : null}
          </span>
        </div>
        {swimEquipment && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {swimEquipment.required.map((eq) => (
              <span key={eq} className="text-[11px] text-blue-200/80">
                bring: {eq}
              </span>
            ))}
            {swimEquipment.optional.map((eq) => (
              <span key={eq} className="text-[11px] text-white/45">
                optional: {eq}
              </span>
            ))}
          </div>
        )}
        {!hideLines && !isStrength && (
          <div className="text-sm text-gray-200 font-light tracking-normal mt-1">
            {stacked.length > 1 ? (
              <span className="whitespace-pre-line">
                {stacked.map((line, idx) => {
                  // Add tooltip for strides mentions
                  if (/strides/i.test(line)) {
                    const parts = line.split(/(strides)/i);
                    return (
                      <React.Fragment key={idx}>
                        {parts.map((part, pIdx) => {
                          if (/^strides$/i.test(part)) {
                            return (
                              <TooltipProvider key={pIdx}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="underline decoration-dotted cursor-help">{part}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      <strong>What are Strides?</strong><br />
                                      Short, controlled accelerations (approx. 100m) designed to wake up your legs. Reach 95% of max speed while staying completely relaxed. This is not a sprint.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          }
                          return <span key={pIdx}>{part}</span>;
                        })}
                        {idx < stacked.length - 1 && '\n'}
                      </React.Fragment>
                    );
                  }
                  return <React.Fragment key={idx}>{line}{idx < stacked.length - 1 && '\n'}</React.Fragment>;
                })}
              </span>
            ) : (
              (() => {
                // ⚠️ `linesShown` throughout: when the caller already printed this exact description,
                // the whole subtitle (including the strides tooltip) collapses rather than duplicating.
                if (!linesShown) return null;
                // Single line - check if it contains strides
                if (/strides/i.test(linesShown)) {
                  const parts = String(linesShown).split(/(strides)/i);
                  return (
                    <span>
                      {parts.map((part, idx) => {
                        if (/^strides$/i.test(part)) {
                          return (
                            <TooltipProvider key={idx}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="underline decoration-dotted cursor-help">{part}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs">
                                    <strong>What are Strides?</strong><br />
                                    Short, controlled accelerations (approx. 100m) designed to wake up your legs. Reach 95% of max speed while staying completely relaxed. This is not a sprint.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        return <span key={idx}>{part}</span>;
                      })}
                    </span>
                  );
                }
                return <span>{linesShown}</span>;
              })()
            )}
          </div>
        )}
        {!hideLines && !isStrength && enduranceLines.length>0 && (
          <ul className="list-disc pl-5 mt-1 text-sm text-gray-200 font-light tracking-normal">
            {enduranceLines.map((ln, idx)=> (<li key={idx}>{ln}</li>))}
          </ul>
        )}
        {!hideLines && isStrength && (
          <div className="text-sm text-gray-200 font-light tracking-normal mt-1">
            <span>{lines}</span>
          </div>
        )}
        {!hideLines && isStrength && strengthItems.length>0 && (
          <ul className="list-disc pl-5 mt-1 text-sm text-gray-200 font-light tracking-normal">
            {strengthItems.map((ln, idx)=> (<li key={idx}>{ln}</li>))}
          </ul>
        )}
        {!hideLines && isMobility && mobilityLines.length>0 && (
          <ul className="list-disc pl-5 mt-1 text-sm text-gray-200 font-light tracking-normal">
            {mobilityLines.map((ln, idx)=> (<li key={idx}>{ln}</li>))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PlannedWorkoutSummary;


