import React, { useState } from 'react';
import { SKIP_SESSION_REASONS, type SkipSessionReasonCode } from '@/lib/skip-session-reasons';

type Props = {
  sessionTitle: string;
  busy: boolean;
  onBack: () => void;
  /** No reason — still mark skipped. */
  onSkipWithoutReason: () => void;
  onConfirmSkip: (reason: string | null, note: string | null) => void;
};

/**
 * Optional nudge: chips are one tap except "other" (optional note, then confirm).
 */
export default function SkipSessionReasonPanel({
  sessionTitle,
  busy,
  onBack,
  onSkipWithoutReason,
  onConfirmSkip,
}: Props) {
  const [otherNote, setOtherNote] = useState('');
  const [otherSelected, setOtherSelected] = useState(false);

  const handleChip = (code: SkipSessionReasonCode) => {
    if (code === 'other') {
      setOtherSelected(true);
      return;
    }
    onConfirmSkip(code, null);
  };

  const handleOtherSubmit = () => {
    const n = otherNote.trim();
    onConfirmSkip('other', n || null);
  };

  return (
    <div className="space-y-4 px-1">
      <p className="text-[13px] text-white/55 leading-snug">
        Optional — sharing why helps your coach interpret the week (you can skip this).
      </p>
      {otherSelected ? (
        <div className="space-y-3">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-white/45">
            Other — add a few words (optional)
          </label>
          <textarea
            value={otherNote}
            onChange={(e) => setOtherNote(e.target.value)}
            placeholder="e.g. family emergency, gym closed…"
            rows={3}
            disabled={busy}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-[13px] text-white/90 placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-white/25 resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOtherSelected(false);
                setOtherNote('');
              }}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-medium text-white/60 border border-white/15"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleOtherSubmit}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-medium text-white bg-white/15 border border-white/25"
            >
              {busy ? 'Saving…' : 'Skip session'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {SKIP_SESSION_REASONS.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              disabled={busy}
              onClick={() => handleChip(code)}
              className="py-2.5 px-2 rounded-xl text-left text-[12px] font-medium text-white/85 bg-white/[0.06] border border-white/12 hover:bg-white/[0.10] disabled:opacity-45"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={onSkipWithoutReason}
          className="w-full py-2.5 text-[12px] text-white/45 hover:text-white/60"
        >
          Skip without sharing why
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="w-full py-2 text-[12px] text-white/35 hover:text-white/50"
        >
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-white/30 truncate" title={sessionTitle}>
        {sessionTitle}
      </p>
    </div>
  );
}
