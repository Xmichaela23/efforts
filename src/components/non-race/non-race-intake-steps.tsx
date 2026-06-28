// Non-race intake — Time allocation + Placement steps. Rebuilt from the interaction reference
// (docs/reference/non-race-intake-reference.html) in the real stack/design system; behavior +
// rules come from src/lib/non-race-intake.ts (tested). Drop-in StepLayout steps for the builder.
import React from 'react';
import { Activity, Bike, Dumbbell, AlertTriangle } from 'lucide-react';
import { StepLayout } from '@/components/wizard/StepLayout';
import {
  allocateTime,
  placeWeek,
  STRENGTH_PROGRAM_HRS,
  DAY_LABELS_SHORT,
  DAY_LABELS_FULL,
  type StrengthProgram,
  type DayType,
} from '@/lib/non-race-intake';

const RUN = '#378ADD';
const RIDE = '#1D9E75';
const STRENGTH = '#D85A30';

const STRENGTH_OPTIONS: Array<{ id: StrengthProgram; label: string; meta: string }> = [
  { id: 'five_by_five', label: '5×5', meta: '3 days · heavy compound' },
  { id: 'durability', label: 'Durability', meta: '2 days · injury-prevention' },
  { id: 'hypertrophy', label: 'Hypertrophy', meta: '4 days · upper/lower' },
  { id: 'minimum_dose', label: 'Minimum dose', meta: '2 short maintenance' },
];

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function Dot({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />;
}

// ── Layer 1 — Time allocation ────────────────────────────────────────────────
export type AllocationValue = { budgetHrs: number; program: StrengthProgram; runLeanPct: number };

export function TimeAllocationStep({
  step, totalSteps, value, onChange, onBack, onContinue,
  showRideLean = true,
}: {
  step: number; totalSteps: number;
  value: AllocationValue;
  onChange: (v: AllocationValue) => void;
  onBack?: () => void; onContinue: () => void;
  /** Hide the fader for single-developing-discipline goals (run-only / ride-only). */
  showRideLean?: boolean;
}) {
  const a = allocateTime(value.budgetHrs, value.program, showRideLean ? value.runLeanPct : 100);

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="Your weekly training time"
      subtitle="The whole week — long weekend rides and runs included."
      onBack={onBack} onContinue={onContinue} canContinue={a.warning === null}
    >
      <div className="space-y-5">
        {/* Budget */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/55">Budget — the hard cap for your whole week</span>
            <span className="text-lg font-medium tabular-nums">{fmt(a.budgetHrs)} hrs</span>
          </div>
          <input
            type="range" min={4} max={20} step={0.5} value={value.budgetHrs}
            onChange={(e) => onChange({ ...value, budgetHrs: +e.target.value })}
            className="w-full accent-teal-400"
          />
        </div>

        {/* Strength reserved off the top */}
        <div className="rounded-xl border border-white/12 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2"><Dot color={STRENGTH} /> Strength reserved</span>
            <span className="font-medium tabular-nums" style={{ color: STRENGTH }}>{fmt(a.strengthHrs)} hrs</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {STRENGTH_OPTIONS.map((o) => {
              const active = value.program === o.id;
              return (
                <button
                  key={o.id} type="button"
                  onClick={() => onChange({ ...value, program: o.id })}
                  className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                    active ? 'border-transparent text-zinc-950 font-semibold' : 'border-white/12 text-white/70 bg-white/[0.02]'
                  }`}
                  style={active ? { background: STRENGTH } : undefined}
                >
                  <span className="block text-sm leading-tight">{o.label}</span>
                  <span className={`block text-[11px] leading-tight ${active ? 'text-zinc-950/70' : 'text-white/40'}`}>
                    {STRENGTH_PROGRAM_HRS[o.id].toFixed(1)} hr · {o.meta}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/35 mt-2.5">
            Set by your strength goal — taken off the top, not a slider. (Placeholder costs; per-protocol hours are a coaching sign-off.)
          </p>
        </div>

        {/* Endurance lean */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-white/55">Endurance time{showRideLean ? ' — how should it lean?' : ''}</span>
            <span className="text-sm font-medium tabular-nums">{fmt(a.enduranceHrs)} hrs</span>
          </div>

          {showRideLean ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4" style={{ color: RUN }} /> Run</span>
                <span className="text-sm"><span className="font-medium tabular-nums">{fmt(a.runHrs)}</span> <span className="text-white/40">hrs · {a.runPct}%</span></span>
              </div>
              <input
                type="range" min={0} max={100} step={1} value={value.runLeanPct}
                onChange={(e) => onChange({ ...value, runLeanPct: +e.target.value })}
                className="w-full accent-teal-400 mb-3"
              />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2"><Bike className="h-4 w-4" style={{ color: RIDE }} /> Ride</span>
                <span className="text-sm"><span className="font-medium tabular-nums">{fmt(a.rideHrs)}</span> <span className="text-white/40">hrs · {a.ridePct}%</span></span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/12 px-3 py-2.5">
              <span className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4" style={{ color: RUN }} /> Run</span>
              <span className="text-sm font-medium tabular-nums">{fmt(a.runHrs)} hrs</span>
            </div>
          )}
        </div>

        {a.warning && (
          <div className="flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[13px]" style={{ background: '#FAEEDA', color: '#854F0B' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{a.warning}</span>
          </div>
        )}
      </div>
    </StepLayout>
  );
}

// ── Layer 2 — Placement (strength-gated) ─────────────────────────────────────
export type PlacementValue = { activeDays: boolean[]; longDay: number };

const TYPE_COLOR: Record<DayType, string> = {
  heavy: STRENGTH, quality: RUN, easy: RIDE, long: RIDE, rest: 'rgba(255,255,255,0.25)',
};
const TYPE_LABEL: Record<DayType, string> = {
  heavy: 'Heavy strength', quality: 'Quality endurance', easy: 'Easy', long: 'Long session', rest: 'Rest',
};

const LONG_DAY_CHOICES = [6, 0, 5, 3]; // Sat, Sun, Fri, Wed (reference order)

export function PlacementStep({
  step, totalSteps, value, onChange, onBack, onContinue,
}: {
  step: number; totalSteps: number;
  value: PlacementValue;
  onChange: (v: PlacementValue) => void;
  onBack?: () => void; onContinue: () => void;
}) {
  const plan = placeWeek(value.activeDays, value.longDay);

  const toggleDay = (i: number) => {
    const next = value.activeDays.slice();
    next[i] = !next[i];
    onChange({ ...value, activeDays: next });
  };

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="When can you train?"
      subtitle="Pick your days and long session — we place heavy lifts so they don't poison quality runs."
      onBack={onBack} onContinue={onContinue} canContinue
    >
      <div className="space-y-5">
        {/* Day picker */}
        <div>
          <p className="text-sm text-white/55 mb-2">Which days can you train? Tap to toggle.</p>
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS_SHORT.map((n, i) => {
              const on = value.activeDays[i];
              return (
                <button
                  key={i} type="button" onClick={() => toggleDay(i)}
                  className={`py-2 rounded-lg text-xs transition-colors ${
                    on ? 'bg-teal-500 text-white' : 'bg-white/[0.04] text-white/40 border border-white/12'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Long day */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/55 min-w-[88px]">Long session</span>
          <select
            value={value.longDay}
            onChange={(e) => onChange({ ...value, longDay: +e.target.value })}
            className="flex-1 text-sm px-3 py-2 rounded-lg bg-white/[0.04] border border-white/12 text-white"
          >
            {LONG_DAY_CHOICES.map((d) => (
              <option key={d} value={d} className="bg-zinc-900">{DAY_LABELS_FULL[d]}</option>
            ))}
          </select>
        </div>

        {/* Placed week */}
        <div>
          <p className="text-sm text-white/55 mb-2">Your week — heavy lifts kept off quality and long days.</p>
          <div className="space-y-1.5">
            {plan.days.map((type, i) => {
              const label = type === 'long' ? 'Long session' : TYPE_LABEL[type];
              const rest = type === 'rest';
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                    rest ? 'border-transparent' : 'border-white/12 bg-white/[0.03]'
                  }`}
                >
                  <span className={`text-sm min-w-[78px] ${rest ? 'text-white/35' : 'text-white/90 font-medium'}`}>{DAY_LABELS_FULL[i]}</span>
                  <Dot color={TYPE_COLOR[type]} />
                  <span className={`text-[13px] ${rest ? 'text-white/35' : 'text-white/60'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 flex-wrap text-[11px] text-white/50">
          <span className="flex items-center gap-1.5"><Dumbbell className="h-3.5 w-3.5" style={{ color: STRENGTH }} /> Heavy strength</span>
          <span className="flex items-center gap-1.5"><Dot color={RUN} /> Quality endurance</span>
          <span className="flex items-center gap-1.5"><Dot color={RIDE} /> Easy / long</span>
          <span className="flex items-center gap-1.5"><Dot color="rgba(255,255,255,0.25)" /> Rest</span>
        </div>

        {/* Interference: either the standing rule (clean) or the forced-compromise flag */}
        {plan.interference ? (
          <div className="flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-[13px]" style={{ background: '#FAEEDA', color: '#854F0B' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{plan.interference}</span>
          </div>
        ) : (
          <div className="rounded-lg bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white/55">
            Heavy lower-body days are kept off the day before a quality run, and off the long-run day — the interference rule, applied automatically.
          </div>
        )}
      </div>
    </StepLayout>
  );
}
