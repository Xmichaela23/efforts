/**
 * ⛔ THE CALIBRATION NOTICE — one component, rendered by State and echoed by Performance (slice b).
 *
 * State is the ACTOR and Performance is a COURTESY ECHO, and that is a difference in placement, not
 * in content: both render this, both route to the same `undo`. Two components would be two chances
 * for the screens to disagree about what a lift did, and the disagreement would be invisible until
 * an athlete had both open.
 *
 * ⛔ **NOT A SECOND NUDGE.** The change is already applied and the logger already said so at save
 * time. What this adds is that the fact stays reachable afterwards and stays reversible — an athlete
 * who tapped past the sheet has somewhere to find it.
 *
 * ⚠️ RENDERS NOTHING when there is no standing event. Silence is the common case, and an empty
 * container with a heading is how a screen teaches people to ignore a region.
 */
import { useState } from 'react';
import {
  CALIBRATION_SCOPE_NOTE,
  CALIBRATION_UNDO_LABEL,
  calibrationLine,
} from '@/lib/strength-calibration-copy';
import type { CalibratedLift } from '@/hooks/useStrengthCalibration';

export type StrengthCalibrationNoticeProps = {
  lifts: CalibratedLift[];
  undo: (ref: string) => Promise<boolean>;
  /**
   * ⛔ THE ECHO IS QUIETER, AND THAT IS THE ONLY DIFFERENCE. Performance passes `variant="echo"`,
   * which drops the scope note — Performance is a session screen and the block-level caveat belongs
   * where the athlete is looking at the block. The line and the Undo are identical.
   */
  variant?: 'primary' | 'echo';
};

export function StrengthCalibrationNotice({ lifts, undo, variant = 'primary' }: StrengthCalibrationNoticeProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [undone, setUndone] = useState<string[]>([]);

  const standing = (lifts ?? []).filter((l) => l.event && !undone.includes(l.ref));
  if (standing.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {standing.map((l) => (
        <div key={l.ref} className="text-[13px] leading-snug text-white/60">
          <p>
            {calibrationLine(l.event!.reason === 'reset' ? 'reset' : 'bump', {
              lift: l.name,
              from: Number(l.event!.from_training_max),
              to: Number(l.event!.to_training_max),
            })}
          </p>
          <button
            type="button"
            disabled={busy === l.ref}
            onClick={async () => {
              setBusy(l.ref);
              const ok = await undo(l.ref);
              // ⚠️ THE ROW HIDES ONLY ON A CONFIRMED SERVER WRITE. Hiding optimistically would tell
              // the athlete the change was reversed when it was not, and the number on their next
              // session would contradict the screen that said so.
              if (ok) setUndone((prev) => [...prev, l.ref]);
              setBusy(null);
            }}
            className="mt-1 text-[12px] text-white/55 underline underline-offset-2 disabled:opacity-50"
          >
            {busy === l.ref ? 'Working…' : CALIBRATION_UNDO_LABEL}
          </button>
        </div>
      ))}
      {variant === 'primary' && (
        <p className="text-[12px] text-white/40 leading-snug">{CALIBRATION_SCOPE_NOTE}</p>
      )}
    </div>
  );
}

export default StrengthCalibrationNotice;
