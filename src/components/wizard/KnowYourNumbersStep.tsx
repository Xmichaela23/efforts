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
import { Info } from 'lucide-react';
import { StepLayout } from '@/components/wizard/StepLayout';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';
import { resolveCurrentRunThresholdPace } from '@/lib/resolve-current-run-pace';
import type { IntakeReadout } from '@/lib/intake-readout-types';

/** ⛔ THE SCREEN'S WORDS, FROM THE SERVER (`builder.setup.numbers`, 2026-09-13). None are kept here. */
export type NumbersCopy = IntakeReadout['setup']['numbers'];

export type NumbersChoiceKey = 'strength' | 'ftp' | 'run';
export type NumbersChoice = Partial<Record<NumbersChoiceKey, 'use' | 'test'>>;

export type BaselinesRowLike = {
  performance_numbers?: Record<string, unknown> | null;
  learned_fitness?: Record<string, unknown> | null;
  locked_baselines?: Record<string, unknown> | null;
  units?: string | null;
} | null;

/** Same rows, same keys, same order as Training Baselines' 1RM block. The labels are the server's (`copy.lift_labels`). */
export const LIFT_FIELDS = [
  { key: 'squat', reps: false },
  { key: 'bench', reps: false },
  { key: 'deadlift', reps: false },
  { key: 'overheadPress1RM', reps: false },
  { key: 'pullupMaxReps', reps: true },
] as const;
export type LiftKey = (typeof LIFT_FIELDS)[number]['key'];

export type StrengthOnFile = Pick<IntakeReadout, 'lifts' | 'barbell_lifts_on_file' | 'strength_default' | 'run_threshold_display'>;

export type NumbersInclude = { strength: boolean; run: boolean; bike: boolean; swim: boolean };

/** Hoisted out of the step so React keeps the same element between renders — an inline component would
 *  remount on every keystroke and drop focus after one character. */
function Toggle({ k, value, canUse, onSet, copy }: {
  k: NumbersChoiceKey; value: 'use' | 'test'; canUse: boolean; onSet: (k: NumbersChoiceKey, v: 'use' | 'test') => void; copy: NumbersCopy;
}) {
  // ⛔ NOTHING ON FILE → NO BUTTON (Michael, 2026-09-22). A lone "Test in week one" read as a control with one
  // answer; the row's flagged note says what happens instead.
  if (!canUse) return null;
  return (
    <div className="flex gap-2 shrink-0" role="group">
      {canUse && (
        <button type="button" onClick={() => onSet(k, 'use')}
          className={`px-3 py-1.5 rounded-lg border text-[13px] ${value === 'use' ? 'border-white/70 bg-white/[0.10] text-white' : 'border-white/15 text-white/60'}`}>
          {copy.use_current}
        </button>
      )}
      <button type="button" onClick={() => onSet(k, 'test')}
        className={`px-3 py-1.5 rounded-lg border text-[13px] ${value === 'test' ? 'border-white/70 bg-white/[0.10] text-white' : 'border-white/15 text-white/60'}`}>
        {canUse ? copy.retest : copy.test}
      </button>
    </div>
  );
}

/** A row with nothing on file: the note, flagged, in place of the buttons. */
function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2 text-white/85">
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-300/90" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

export function KnowYourNumbersStep({
  step, totalSteps, row, strength, include, choice, onChoice, onBack, onContinue, testedLifts, ftpNote, copy,
  unit = 'mi', onSaveTyped,
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
  /**
   * ⛔ THE BARBELL LIFTS THE PLAN'S WEEK LOADS (`Frame.testedLifts`, 2026-09-13). Ride + Strength loads
   * bench, squat and deadlift, so the row neither lists a press nor says one is tested in week one.
   * Absent = all four, which is every other plan.
   */
  testedLifts?: string[];
  /** One line under the FTP row, for the plan that asks for it. Null or absent = none. */
  ftpNote?: string | null;
  /** The screen's words (`builder.setup.numbers`). Until they arrive the screen shows no rows. */
  copy: NumbersCopy | null;
  /** The athlete's distance unit: lifts in kg and pace per km on a metric account. */
  unit?: 'mi' | 'km';
  /**
   * ⛔ NUMBERS TYPED HERE (Michael, 2026-09-22: "slots for the 4 lifts and threshold pace"). Saved through
   * `save-baselines` — the same path Profile uses — before the step moves on. Resolves false on failure.
   */
  onSaveTyped?: (typed: { lifts: Record<string, number>; threshold: string | null }) => Promise<boolean>;
}) {
  const pn = (row?.performance_numbers ?? {}) as Record<string, unknown>;

  // ⚠️ `overheadPress1RM` is Baselines' key for the lift the frame calls `overheadPress`.
  const planLoads = (key: LiftKey) =>
    !testedLifts || key === 'pullupMaxReps' || testedLifts.includes(key === 'overheadPress1RM' ? 'overheadPress' : key);
  const lifts = LIFT_FIELDS.filter((f) => planLoads(f.key)).map((f) => ({ f, onFile: strength?.lifts?.[f.key] ?? null }));
  const barbell = lifts.filter((l) => !l.f.reps);
  // ⛔ WITHOUT `testedLifts` THESE ARE THE SERVER'S COUNTS, as before. With it, the same counts over the
  // lifts the plan loads — the server counts all four, and a press on file is not this plan's number.
  const strengthComplete = testedLifts
    ? barbell.length > 0 && barbell.every((l) => l.onFile)
    : strength?.barbell_lifts_on_file === 'all';
  const strengthAny = testedLifts
    ? barbell.some((l) => l.onFile)
    : strength?.barbell_lifts_on_file === 'all' || strength?.barbell_lifts_on_file === 'some';
  const strengthDefault: 'use' | 'test' = testedLifts
    ? (strengthAny ? 'use' : 'test')
    : strength?.strength_default ?? 'test';

  const ftp = resolveCurrentFtp(row as never);
  const thr = resolveCurrentRunThresholdPace(row as never);
  const swimOnFile = typeof pn.swimPace100 === 'string' && pn.swimPace100.trim() !== '' ? String(pn.swimPace100) : null;

  const strengthChoice: 'use' | 'test' = choice.strength ?? (strength ? strengthDefault : 'test');
  const ftpChoice: 'use' | 'test' = choice.ftp ?? (ftp.value != null ? 'use' : 'test');
  const runChoice: 'use' | 'test' = choice.run ?? (thr.sec_per_mi != null ? 'use' : 'test');

  // Seed the effective defaults into wizard state once, so an untouched screen still carries its answer
  // to the payload (use what is on file, test what is not). Only keys the athlete has not set; the
  // strength key waits for the server's default.
  React.useEffect(() => {
    const seeded: NumbersChoice = {};
    if (include.strength && choice.strength == null && strength) seeded.strength = strengthDefault;
    if (include.bike && choice.ftp == null) seeded.ftp = ftpChoice;
    if (include.run && choice.run == null) seeded.run = runChoice;
    if (Object.keys(seeded).length > 0) onChoice({ ...seeded, ...choice });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strength?.strength_default, strengthDefault, ftp.value, thr.sec_per_mi]);

  const set = (k: NumbersChoiceKey, v: 'use' | 'test') => onChoice({ ...choice, [k]: v });

  // ── typed numbers (rows with nothing on file) ──
  const [typedLifts, setTypedLifts] = React.useState<Record<string, string>>({});
  const [typedPace, setTypedPace] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const liftsToSave = Object.fromEntries(Object.entries(typedLifts)
    .map(([k, v]) => [k, Number(v)] as const)
    .filter(([, v]) => Number.isFinite(v) && v > 0));
  const paceOk = /^\d{1,2}:[0-5]\d$/.test(typedPace.trim());
  const continueNow = async () => {
    const anyLift = Object.keys(liftsToSave).length > 0;
    if (onSaveTyped && (anyLift || paceOk)) {
      setSaving(true);
      const ok = await onSaveTyped({ lifts: liftsToSave, threshold: paceOk ? typedPace.trim() : null });
      setSaving(false);
      if (!ok) return;
      // A typed number is a number on file: use it, and week one tests only what is still blank.
      onChoice({ ...choice, ...(anyLift ? { strength: 'use' as const } : {}), ...(paceOk ? { run: 'use' as const } : {}) });
    }
    onContinue();
  };
  const boxClass = 'w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-white text-[15px] outline-none focus:border-white/40';

  const rowShell = (title: string, body: React.ReactNode, right: React.ReactNode) => (
    // The two buttons sit UNDER the text, not beside it (Michael, 2026-09-11, phone screenshot): side
    // by side, "Use current" + "Retest in week one" took the row's width and the title and numbers
    // wrapped one syllable per line.
    <div className="rounded-xl border border-white/12 bg-white/[0.03] p-4 flex flex-col gap-3">
      <div className="min-w-0">
        <div className="text-white text-[15px]">{title}</div>
        <div className="text-white/60 text-[13px] mt-0.5">{body}</div>
      </div>
      {right}
    </div>
  );

  if (!copy) {
    return <StepLayout step={step} totalSteps={totalSteps} title="" onBack={onBack} onContinue={onContinue} canContinue>{null}</StepLayout>;
  }
  const fillIn = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, key) => String(v[key] ?? ''));
  const untested = barbell.filter((l) => !l.onFile).map((l) => copy.lift_labels[l.f.key]);
  return (
    <StepLayout step={step} totalSteps={totalSteps} title={copy.title} onBack={onBack} onContinue={() => { void continueNow(); }} canContinue={!saving} saving={saving} continueLabel={copy.continue}>
      <p className="text-white/70 text-sm mb-4">
        {copy.intro}
      </p>
      <div className="flex flex-col gap-3">
        {include.strength && strength && rowShell(
          copy.strength_title,
          strengthAny
            ? (
              <>
                {lifts.filter((l) => l.onFile).map((l) => `${copy.lift_labels[l.f.key]} ${l.onFile!.display}${l.f.reps ? copy.reps_suffix : ''}`).join(' · ')}
                {' '}<span className="text-white/40">· {lifts.some((l) => l.onFile?.source === 'learned') ? copy.source_learned_lifts : copy.source_typed}</span>
                {strengthChoice === 'use' && strengthComplete && <div className="text-white/50 mt-1">{copy.strength_use_complete}</div>}
                {strengthChoice === 'use' && !strengthComplete && <div className="text-white/50 mt-1">{fillIn(copy.strength_use_partial, { lifts: untested.join(copy.lift_list_join), verb: untested.length === 1 ? copy.verb_one : copy.verb_many })}</div>}
                {strengthChoice === 'test' && <div className="text-white/50 mt-1">{copy.strength_test}</div>}
              </>
            )
            : (
              <>
                {copy.strength_none}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {barbell.map((l) => (
                    <label key={l.f.key} className="block">
                      <span className="text-white/70 text-xs">{copy.lift_labels[l.f.key]} ({unit === 'km' ? 'kg' : 'lb'})</span>
                      <input
                        type="text" inputMode="numeric" data-testid={`typed-lift-${l.f.key}`}
                        className={boxClass} value={typedLifts[l.f.key] ?? ''}
                        onChange={(e) => setTypedLifts((t) => ({ ...t, [l.f.key]: e.target.value.replace(/[^\d.]/g, '') }))}
                      />
                    </label>
                  ))}
                </div>
              </>
            ),
          <Toggle k="strength" value={strengthChoice} canUse={strengthAny} onSet={set} copy={copy} />,
        )}
        {include.bike && rowShell(
          copy.ftp_title,
          <>
            {ftp.value != null
              ? <>{fillIn(copy.watts, { watts: Math.round(ftp.value) })} <span className="text-white/40">· {ftp.source === 'manual' ? copy.source_ftp_manual : ftp.source === 'learned' ? copy.source_ftp_learned : copy.source_ftp_low}</span>
                  {ftpChoice === 'test' && <div className="text-white/50 mt-1">{copy.ftp_test}</div>}</>
              : <Flag>{copy.ftp_none}</Flag>}
            {ftpNote ? <div className="text-white/70 mt-1">{ftpNote}</div> : null}
          </>,
          <Toggle k="ftp" value={ftpChoice} canUse={ftp.value != null} onSet={set} copy={copy} />,
        )}

        {include.run && rowShell(
          copy.run_title,
          thr.sec_per_mi != null
            // ⛔ The pace is get-arc-context's `run_threshold_display`; this converted and split it itself
            // (2026-09-16, Stage 7 session 1).
            ? <>{strength?.run_threshold_display} <span className="text-white/40">· {thr.source === 'manual' || thr.source === 'manual-chosen' ? copy.source_run_typed : copy.source_run_learned}</span>
                {runChoice === 'test' && <div className="text-white/50 mt-1">{copy.run_test}</div>}</>
            : (
              <>
                {copy.run_none}
                <label className="block mt-3 max-w-[12rem]">
                  <span className="text-white/70 text-xs">{unit === 'km' ? 'min:sec per km' : 'min:sec per mile'}</span>
                  <input
                    type="text" inputMode="numeric" data-testid="typed-threshold" placeholder={unit === 'km' ? '4:40' : '7:30'}
                    className={boxClass} value={typedPace}
                    onChange={(e) => setTypedPace(e.target.value.replace(/[^\d:]/g, ''))}
                  />
                </label>
              </>
            ),
          <Toggle k="run" value={runChoice} canUse={thr.sec_per_mi != null} onSet={set} copy={copy} />,
        )}

        {include.swim && rowShell(
          copy.swim_title,
          swimOnFile
            ? <>{swimOnFile} <span className="text-white/40">· {copy.source_swim}</span></>
            : <>{copy.swim_none}</>,
          null,
        )}
      </div>
    </StepLayout>
  );
}
