/**
 * NumberRow — the one way a number is drawn and edited, on Adjust and on Profile (2026-09-06).
 *
 * Name left, pill right: `125 lb · auto`. Tap the pill → inline input (16px, no zoom), save / cancel. No pencil:
 * the bordered pill is the affordance (docs/DESIGN-button-shape.md, "A border means you can tap it").
 * The word beside the number follows the switch: `auto`, `your number` (the athlete set it), `accepted`
 * (a proposal was taken) — see `numberWord`. When the athlete's own number is in use the pill grows an
 * `auto` segment that switches back. Read-only rows render the value with no pill. One optional note
 * under the row (12px, white/50): Profile uses it for provenance, Adjust for the easy-pace note.
 * Sport colour on the pill border/fill via `getDisciplineColor`; corners `rounded-xl`
 * (docs/DESIGN-button-shape.md).
 */
import React, { useState } from 'react';
import { getDisciplineColor } from '@/lib/context-utils';

export type NumberRowSport = 'strength' | 'run' | 'bike' | 'swim';

const NEUTRAL = 'rgba(255,255,255,0.7)';
const colourOf = (sport?: NumberRowSport) => (sport ? getDisciplineColor(sport) : NEUTRAL);

export type NumberRowProps = {
  id: string;
  name: string;
  /** What the pill shows; null → "tap to add" (editable) or "no number yet" (read-only). */
  value: string | null;
  editable?: boolean;
  /** Placeholder in the input: the unit or format, e.g. `lb`, `m:ss/mi`, `bpm`. */
  hint?: string;
  sport?: NumberRowSport;
  note?: string | null;
  /** The switch: true → the word is "your number" and the `auto` segment shows. */
  mine?: boolean;
  onSave?: (text: string) => void | Promise<void>;
  onAuto?: () => void | Promise<void>;
  onEditStart?: () => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  /** `date` renders a date input; `text` a plain text input; default is a short numeric field. */
  inputType?: 'number' | 'text' | 'date';
  /** Seed for the input when editing opens (e.g. the current typed value). */
  seed?: string;
  /** A custom control in place of the pill (e.g. a units toggle). */
  right?: React.ReactNode;
};

export function NumberRow({ id, name, value, editable = true, hint, sport, note, mine = false, onSave, onAuto, onEditStart, inputMode, inputType = 'number', seed, right }: NumberRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const colour = colourOf(sport);
  const close = () => { setEditing(false); setDraft(''); };
  const save = async () => { const t = draft.trim(); close(); if (onSave) await onSave(t); };
  const wide = inputType === 'date' || inputType === 'text';
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] text-white/85 min-w-0 leading-tight">{name}</span>
        {right ? right : editing ? (
          <span className="flex items-center gap-2 min-w-0">
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') close(); }}
              type={inputType === 'date' ? 'date' : 'text'} inputMode={inputMode ?? (inputType === 'text' ? 'text' : 'decimal')} placeholder={hint}
              className={`${wide ? 'w-40' : 'w-24'} min-w-0 bg-white/[0.06] border border-white/20 rounded-md px-2 py-1 text-[16px] text-white/90 ${wide ? '' : 'text-right tabular-nums'} outline-none`} />
            <button type="button" onClick={() => void save()} className="text-[12px] text-white/80 px-2 py-1 rounded-xl border border-white/15">save</button>
            <button type="button" onClick={close} className="text-[12px] text-white/45 px-1 py-1">cancel</button>
          </span>
        ) : editable ? (
          <span className="inline-flex shrink-0 max-w-[62%] rounded-xl border overflow-hidden" style={{ borderColor: `${colour}55`, background: `${colour}14` }}>
            <button type="button" onClick={() => { setEditing(true); setDraft(seed ?? ''); onEditStart?.(); }} aria-label={`edit ${name}`}
              className="inline-flex items-center px-2.5 py-1 bg-transparent border-none text-[14px] text-white/90 tabular-nums outline-none focus:outline-none active:brightness-125 min-w-0">
              <span className="truncate">{value ?? <span className="text-white/45">tap to add</span>}</span>
            </button>
            {mine && onAuto && (
              <button type="button" onClick={() => void onAuto()} aria-label={`${name}: back to auto`}
                className="px-2 py-1 border-l text-[12px] text-white/70 bg-white/[0.04] outline-none focus:outline-none active:brightness-125" style={{ borderColor: `${colour}55` }}>
                auto
              </button>
            )}
          </span>
        ) : (
          <span className="text-[14px] text-white/90 tabular-nums shrink-0 text-right">{value ?? <span className="text-white/35">no number yet</span>}</span>
        )}
      </div>
      {note && <p className="text-[12px] text-white/50 mt-1 leading-snug">{note}</p>}
    </div>
  );
}

export default NumberRow;
