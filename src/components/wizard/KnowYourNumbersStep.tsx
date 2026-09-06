/**
 * "KNOW YOUR NUMBERS?" — the last wizard screen before the commit (SPEC-baseline-entry-2026-09-04).
 *
 * One row per discipline the plan will contain. A row with a number on file offers
 * [Use current] / [Retest in week one]; a row with nothing on file is tested in week one, full stop —
 * there is nothing current to use and NOTHING IS TYPED HERE (Michael, 2026-09-04: typing numbers
 * lives in Training Baselines, not the wizard). Continue is never gated; skipping changes nothing —
 * the defaults (use what is on file, test what is not) apply.
 *
 * WHAT EACH ANSWER DOES — the engine is not changed by this screen, it is only told:
 *   strength · Use current → `training_prefs.skip_test_week: true`; `generate-strength-plan` prices the
 *              block off the numbers on file (typed, or learned from logged sets) and week one is a
 *              normal week. Retest → week one is the test week (Viada p215) and the priced rows wait
 *              on it (`awaiting_test`, on purpose).
 *   FTP / run threshold · Use current → nothing to do; the plan already reads these through
 *              `resolveCurrentFtp` / `resolveCurrentRunThresholdPace`. Retest → the book's test session
 *              (p212 / p210) is scheduled into week one after the plan is built, the same planned row
 *              Training Baselines schedules (`src/lib/baseline-tests.ts`).
 *   swim · number on file is used; no test is scheduled (the app has no swim test session).
 *
 * NO WRITES. This screen reads Baselines and records a choice; it never writes `user_baselines`.
 *
 * SOURCES for the words on screen: the 1RM keys and pull-up rep count are Baselines' own
 * (`STRENGTH_LIFT_FIELDS`, Q-102 `0` valid); FTP wording from `resolveCurrentFtp` (learned = from your
 * rides, manual = typed); threshold pace from `resolveCurrentRunThresholdPace`. No number on this
 * screen is computed here.
 */
import React from 'react';
import { StepLayout } from '@/components/wizard/StepLayout';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';
import { resolveCurrentRunThresholdPace } from '@/lib/resolve-current-run-pace';

export type NumbersChoiceKey = 'strength' | 'ftp' | 'run';
export type NumbersChoice = Partial<Record<NumbersChoiceKey, 'use' | 'test'>>;

export type BaselinesRowLike = {
  performance_numbers?: Record<string, unknown> | null;
  learned_fitness?: Record<string, unknown> | null;
  locked_baselines?: Record<string, unknown> | null;
  units?: string | null;
} | null;

/** Same rows, same keys, same order as Training Baselines' 1RM block. */
export const LIFT_FIELDS = [
  { key: 'squat', label: 'Squat', learnedKey: 'squat', reps: false },
  { key: 'bench', label: 'Bench', learnedKey: 'bench_press', reps: false },
  { key: 'deadlift', label: 'Deadlift', learnedKey: 'deadlift', reps: false },
  { key: 'overheadPress1RM', label: 'OHP', learnedKey: 'overhead_press', reps: false },
  { key: 'pullupMaxReps', label: 'Pull-ups', learnedKey: null, reps: true },
] as const;
export type LiftKey = (typeof LIFT_FIELDS)[number]['key'];

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One lift's number on file: locked > typed > learned (trusted) — the order Baselines displays. */
export function liftOnFile(row: BaselinesRowLike, f: (typeof LIFT_FIELDS)[number]): { value: number; source: 'typed' | 'learned' } | null {
  const pn = (row?.performance_numbers ?? {}) as Record<string, unknown>;
  const locked = (row?.locked_baselines ?? {}) as Record<string, unknown>;
  const lf = (row?.learned_fitness ?? {}) as Record<string, unknown>;
  const lockedV = num(locked[f.key]);
  if (lockedV != null && lockedV > 0) return { value: Math.round(lockedV), source: 'typed' };
  const typed = num(pn[f.key]);
  if (typed != null && (f.reps ? typed >= 0 : typed > 0)) return { value: Math.round(typed), source: 'typed' };
  if (f.learnedKey) {
    const s1 = (lf.strength_1rms ?? {}) as Record<string, { value?: unknown; confidence?: unknown }>;
    const e = s1[f.learnedKey];
    const v = num(e?.value);
    const conf = String(e?.confidence ?? '');
    if (v != null && v > 0 && (conf === 'medium' || conf === 'high')) return { value: Math.round(v), source: 'learned' };
  }
  return null;
}

export function formatSecPerMi(sec: number, metric: boolean): string {
  const s = metric ? sec / 1.609344 : sec;
  const m = Math.floor(s / 60), r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, '0')}${metric ? '/km' : '/mi'}`;
}

export type NumbersInclude = { strength: boolean; run: boolean; bike: boolean; swim: boolean };

/** Hoisted out of the step so React keeps the same element between renders — an inline component would
 *  remount on every keystroke and drop focus after one character. */
function Toggle({ k, value, canUse, onSet, useLabel = 'Use current', testLabel = 'Retest in week one' }: {
  k: NumbersChoiceKey; value: 'use' | 'test'; canUse: boolean; onSet: (k: NumbersChoiceKey, v: 'use' | 'test') => void; useLabel?: string; testLabel?: string;
}) {
  return (
    <div className="flex gap-2 shrink-0" role="group">
      {canUse && (
        <button type="button" onClick={() => onSet(k, 'use')}
          className={`px-3 py-1.5 rounded-lg border text-[13px] ${value === 'use' ? 'border-white/70 bg-white/[0.10] text-white' : 'border-white/15 text-white/60'}`}>
          {useLabel}
        </button>
      )}
      <button type="button" onClick={() => onSet(k, 'test')}
        className={`px-3 py-1.5 rounded-lg border text-[13px] ${value === 'test' ? 'border-white/70 bg-white/[0.10] text-white' : 'border-white/15 text-white/60'}`}>
        {canUse ? testLabel : 'Test in week one'}
      </button>
    </div>
  );
}

export function KnowYourNumbersStep({
  step, totalSteps, row, include, choice, onChoice, onBack, onContinue,
}: {
  step: number; totalSteps: number;
  row: BaselinesRowLike;
  include: NumbersInclude;
  choice: NumbersChoice;
  onChoice: (next: NumbersChoice) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const metric = String(row?.units ?? '').toLowerCase() === 'metric';
  const pn = (row?.performance_numbers ?? {}) as Record<string, unknown>;

  // strength — all four barbell lifts are needed to price a block off file; pull-ups ride along (Q-102)
  const lifts = LIFT_FIELDS.map((f) => ({ f, onFile: liftOnFile(row, f) }));
  const barbell = lifts.filter((l) => !l.f.reps);
  const strengthComplete = barbell.every((l) => l.onFile != null);
  const strengthAny = barbell.some((l) => l.onFile != null);

  const ftp = resolveCurrentFtp(row as never);
  const thr = resolveCurrentRunThresholdPace(row as never);
  const swimOnFile = typeof pn.swimPace100 === 'string' && pn.swimPace100.trim() !== '' ? String(pn.swimPace100) : null;

  // Use current is offered from ONE lift on file (2026-09-04): the lifts with numbers price, the rest are
  // tested in week one in their own session. Nothing on file at all → the test week.
  const strengthChoice: 'use' | 'test' = choice.strength ?? (strengthAny ? 'use' : 'test');
  const ftpChoice: 'use' | 'test' = choice.ftp ?? (ftp.value != null ? 'use' : 'test');
  const runChoice: 'use' | 'test' = choice.run ?? (thr.sec_per_mi != null ? 'use' : 'test');

  // Seed the effective defaults into wizard state once, so an untouched screen still carries its answer
  // to the payload (use what is on file, test what is not). Only keys the athlete has not set.
  React.useEffect(() => {
    const seeded: NumbersChoice = {};
    if (include.strength && choice.strength == null) seeded.strength = strengthChoice;
    if (include.bike && choice.ftp == null) seeded.ftp = ftpChoice;
    if (include.run && choice.run == null) seeded.run = runChoice;
    if (Object.keys(seeded).length > 0) onChoice({ ...seeded, ...choice });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strengthAny, ftp.value, thr.sec_per_mi]);

  const set = (k: NumbersChoiceKey, v: 'use' | 'test') => onChoice({ ...choice, [k]: v });

  const rowShell = (title: string, body: React.ReactNode, right: React.ReactNode) => (
    <div className="rounded-xl border border-white/12 bg-white/[0.03] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white text-[15px]">{title}</div>
          <div className="text-white/60 text-[13px] mt-0.5">{body}</div>
        </div>
        {right}
      </div>
    </div>
  );

  return (
    <StepLayout step={step} totalSteps={totalSteps} title="Know your numbers?" onBack={onBack} onContinue={onContinue} canContinue continueLabel="Continue">
      <p className="text-white/70 text-sm mb-4">
        Optional. Keep what is on file or test in week one. Numbers are typed on Profile, not here.
      </p>
      <div className="flex flex-col gap-3">
        {include.strength && rowShell(
          'Strength',
          strengthAny
            ? (
              <>
                {lifts.filter((l) => l.onFile).map((l) => `${l.f.label} ${l.onFile!.value}${l.f.reps ? ' reps' : ''}`).join(' · ')}
                {' '}<span className="text-white/40">· {lifts.some((l) => l.onFile?.source === 'learned') ? 'from your logged sets' : 'typed in Baselines'}</span>
                {strengthChoice === 'use' && strengthComplete && <div className="text-white/50 mt-1">The block prices off these; no test week.</div>}
                {strengthChoice === 'use' && !strengthComplete && <div className="text-white/50 mt-1">The block prices off these; {barbell.filter((l) => !l.onFile).map((l) => l.f.label).join(' and ')} {barbell.filter((l) => !l.onFile).length === 1 ? 'is' : 'are'} tested in week one.</div>}
                {strengthChoice === 'test' && <div className="text-white/50 mt-1">Week one is the test week (p215). The number on file stays until the test replaces it.</div>}
              </>
            )
            : 'Nothing on file. Every lift is tested in week one (p215). Numbers can be typed on Profile.',
          <Toggle k="strength" value={strengthChoice} canUse={strengthAny} onSet={set} />,
        )}
        {include.bike && rowShell(
          'FTP',
          ftp.value != null
            ? <>{Math.round(ftp.value)} W <span className="text-white/40">· {ftp.source === 'manual' ? 'typed in Baselines' : ftp.source === 'learned' ? 'estimated from your rides' : 'estimated, low confidence'}</span>
                {ftpChoice === 'test' && <div className="text-white/50 mt-1">The 20-minute FTP test (p212) is scheduled into week one.</div>}</>
            : <>Nothing on file. The 20-minute FTP test (p212) is scheduled into week one.</>,
          <Toggle k="ftp" value={ftpChoice} canUse={ftp.value != null} onSet={set} />,
        )}

        {include.run && rowShell(
          'Run threshold',
          thr.sec_per_mi != null
            ? <>{formatSecPerMi(thr.sec_per_mi, metric)} <span className="text-white/40">· {thr.source === 'manual' || thr.source === 'manual-chosen' ? 'typed in Baselines' : 'from your runs'}</span>
                {runChoice === 'test' && <div className="text-white/50 mt-1">The threshold time trial (p210) is scheduled into week one.</div>}</>
            : <>Nothing on file. The threshold time trial (p210) is scheduled into week one.</>,
          <Toggle k="run" value={runChoice} canUse={thr.sec_per_mi != null} onSet={set} />,
        )}

        {include.swim && rowShell(
          'Swim pace (per 100)',
          swimOnFile
            ? <>{swimOnFile} <span className="text-white/40">· on file</span></>
            : <>Nothing on file — there is no swim test to schedule; the number is typed on Profile.</>,
          null,
        )}
      </div>
    </StepLayout>
  );
}
