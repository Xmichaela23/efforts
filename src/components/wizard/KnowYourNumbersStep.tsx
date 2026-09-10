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
 * ⛔ THE LIFTS COME FROM THE SERVER (2026-09-10, audit item 20). This screen used to pick each lift
 * itself — locked, then typed, then learned — while the block prices off the capacity resolver, which
 * puts trusted learned ahead of typed. The row could print the typed squat over a block built on the
 * learned one. `strength` is get-arc-context's readout: each lift as the resolver returns it, how many
 * barbell lifts have a number, and the Use current / Retest default. Until it arrives the Strength row
 * is not shown.
 *
 * SOURCES for the words on screen: the 1RM keys and pull-up rep count are Baselines' own
 * (`STRENGTH_LIFT_FIELDS`, Q-102 `0` valid); FTP wording from `resolveCurrentFtp` (learned = from your
 * rides, manual = typed); threshold pace from `resolveCurrentRunThresholdPace`.
 */
import React from 'react';
import { StepLayout } from '@/components/wizard/StepLayout';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';
import { resolveCurrentRunThresholdPace } from '@/lib/resolve-current-run-pace';
import type { IntakeReadout } from '@/lib/intake-readout-types';

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
  { key: 'squat', label: 'Squat', reps: false },
  { key: 'bench', label: 'Bench', reps: false },
  { key: 'deadlift', label: 'Deadlift', reps: false },
  { key: 'overheadPress1RM', label: 'OHP', reps: false },
  { key: 'pullupMaxReps', label: 'Pull-ups', reps: true },
] as const;
export type LiftKey = (typeof LIFT_FIELDS)[number]['key'];

export type StrengthOnFile = Pick<IntakeReadout, 'lifts' | 'barbell_lifts_on_file' | 'strength_default'>;

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
  step, totalSteps, row, strength, include, choice, onChoice, onBack, onContinue,
}: {
  step: number; totalSteps: number;
  row: BaselinesRowLike;
  /** get-arc-context's strength readout; null until it arrives. */
  strength: StrengthOnFile | null;
  include: NumbersInclude;
  choice: NumbersChoice;
  onChoice: (next: NumbersChoice) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const metric = String(row?.units ?? '').toLowerCase() === 'metric';
  const pn = (row?.performance_numbers ?? {}) as Record<string, unknown>;

  const lifts = LIFT_FIELDS.map((f) => ({ f, onFile: strength?.lifts?.[f.key] ?? null }));
  const barbell = lifts.filter((l) => !l.f.reps);
  const strengthComplete = strength?.barbell_lifts_on_file === 'all';
  const strengthAny = strength?.barbell_lifts_on_file === 'all' || strength?.barbell_lifts_on_file === 'some';

  const ftp = resolveCurrentFtp(row as never);
  const thr = resolveCurrentRunThresholdPace(row as never);
  const swimOnFile = typeof pn.swimPace100 === 'string' && pn.swimPace100.trim() !== '' ? String(pn.swimPace100) : null;

  const strengthChoice: 'use' | 'test' = choice.strength ?? strength?.strength_default ?? 'test';
  const ftpChoice: 'use' | 'test' = choice.ftp ?? (ftp.value != null ? 'use' : 'test');
  const runChoice: 'use' | 'test' = choice.run ?? (thr.sec_per_mi != null ? 'use' : 'test');

  // Seed the effective defaults into wizard state once, so an untouched screen still carries its answer
  // to the payload (use what is on file, test what is not). Only keys the athlete has not set; the
  // strength key waits for the server's default.
  React.useEffect(() => {
    const seeded: NumbersChoice = {};
    if (include.strength && choice.strength == null && strength) seeded.strength = strength.strength_default;
    if (include.bike && choice.ftp == null) seeded.ftp = ftpChoice;
    if (include.run && choice.run == null) seeded.run = runChoice;
    if (Object.keys(seeded).length > 0) onChoice({ ...seeded, ...choice });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strength?.strength_default, ftp.value, thr.sec_per_mi]);

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
        {include.strength && strength && rowShell(
          'Strength',
          strengthAny
            ? (
              <>
                {lifts.filter((l) => l.onFile).map((l) => `${l.f.label} ${l.onFile!.value}${l.f.reps ? ' reps' : ''}`).join(' · ')}
                {' '}<span className="text-white/40">· {lifts.some((l) => l.onFile?.source === 'learned') ? 'from your logged sets' : 'typed in Baselines'}</span>
                {strengthChoice === 'use' && strengthComplete && <div className="text-white/50 mt-1">The block uses these; no test week.</div>}
                {strengthChoice === 'use' && !strengthComplete && <div className="text-white/50 mt-1">The block uses these; {barbell.filter((l) => !l.onFile).map((l) => l.f.label).join(' and ')} {barbell.filter((l) => !l.onFile).length === 1 ? 'is' : 'are'} tested in week one.</div>}
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
