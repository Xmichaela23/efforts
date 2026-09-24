import React from 'react';
import { getDisciplineColorRgb } from '@/lib/context-utils';

/**
 * ⛔ THE MOVE CHECK, REBUILT ON THE BOOK (2026-09-21, docs/WORKORDER-lost-day-2026-09-21.md "Move check rebuilt on
 * the book"). It shows the session, from → to, the server's notes word for word, the days that fit, Cancel and
 * Move — nothing else. The notes and the days come from `validate-reschedule` (`_shared/move-check`); this file
 * decides nothing. A day off is the only refusal, and then there is no Move.
 */
export interface MoveCheckResult {
  refused: boolean;
  notes: string[];
  days_that_fit: string[];
  /** Rows that move with this one (the other part of a joined run). The caller moves them; this file does not. */
  moves_with?: string[];
}

interface RescheduleValidationPopupProps {
  workoutName: string;
  /** The session's sport as the calendar reads it (`displayDisciplineOf`) — the popup takes its dot's colour. */
  sport?: string;
  oldDate: string;
  newDate: string;
  validation: MoveCheckResult;
  onConfirm: () => void;
  onCancel: () => void;
  /** A "Days that fit" button: moves the session to that day. */
  onDayClick?: (date: string) => void;
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

export default function RescheduleValidationPopup({
  workoutName, sport, oldDate, newDate, validation, onConfirm, onCancel, onDayClick,
}: RescheduleValidationPopupProps) {
  const notes = Array.isArray(validation?.notes) ? validation.notes : [];
  const days = Array.isArray(validation?.days_that_fit) ? validation.days_that_fit : [];
  const refused = validation?.refused === true;
  const moving = oldDate !== newDate;
  /**
   * ⛔ THE PANEL WEARS THE SESSION'S SPORT COLOUR (2026-09-22) — the same colour as its calendar dot. The old green /
   * gold severity tints read as sport colours and are gone. A day off (the refusal) stays neutral.
   */
  const rgb = refused || !sport ? '242, 240, 236' : getDisciplineColorRgb(sport).replace(/^rgb\(|\)$/g, '');

  return (
    // ⛔ CLEARS THE TAB BAR AND THE SAFE AREA (2026-09-21, from Michael's phone: Cancel / Confirm sat under the tab bar
    // and could not be reached). The panel fits the space above it and scrolls inside itself, as one.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 'calc(var(--tabbar-h, 56px) + env(safe-area-inset-bottom, 0px) + var(--tabbar-extra, 0px))',
      }}
    >
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.5))' }}
        onClick={onCancel}
      />
      <div
        className="relative w-full max-w-lg mx-4 mb-4 p-6 max-h-[calc(100%-1rem)] overflow-y-auto overscroll-contain rounded-2xl backdrop-blur-xl border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] animate-slide-up"
        style={{
          background: `linear-gradient(135deg, rgba(${rgb},0.15) 0%, rgba(${rgb},0.05) 50%, rgba(255,255,255,0.03) 100%)`,
          borderColor: `rgba(${rgb}, ${refused ? 0.18 : 0.45})`,
          boxShadow: refused ? undefined : `0 0 24px rgba(${rgb}, 0.18), 0 0 0 1px rgba(${rgb}, 0.12) inset`,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* The calendar and the session screen pass the server's `intent_title` ("Maximum Effort: Upper") as the name. */}
        <p className="text-base font-light text-white">{workoutName}</p>
        {moving && (
          <p className="text-xs text-white/50 mt-1">{formatDate(oldDate)} → {formatDate(newDate)}</p>
        )}

        {moving && notes.length > 0 && (
          <div className="mt-4 space-y-2">
            {notes.map((n, i) => (
              <p key={i} className="p-3 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white/85 font-light">{n}</p>
            ))}
          </div>
        )}

        {days.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-white/60 font-light mb-2">Days that fit:</p>
            <div className="flex flex-wrap gap-2">
              {days.map((d) => (
                <button
                  key={d}
                  onClick={() => onDayClick?.(d)}
                  className="px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/20 text-white/85 hover:bg-white/[0.12] hover:border-white/30 transition-all text-xs font-light"
                >
                  {formatDate(d)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl font-light text-white/60 hover:text-white/80 bg-white/[0.05] border-2 border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300"
          >
            Cancel
          </button>
          {moving && !refused && (
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 rounded-xl font-light border-2 transition-all duration-300 shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset] text-white"
              style={{ backgroundColor: `rgba(${rgb}, 0.6)`, borderColor: `rgba(${rgb}, 0.8)` }}
            >
              Move
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  );
}
