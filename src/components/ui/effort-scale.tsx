// ⛔ ONE EFFORT SCALE FOR THE WHOLE APP (Michael, 2026-09-06: "it should just be congruent across the app").
//
// Before this there were three: the post-workout popup drew ten bordered buttons with talk-test words,
// the strength logger's finish sheet drew a slider with "Light / Moderate / Hard", and the logger's notes
// box took a typed number. Same question, three faces. This is the one face.
//
// The 1–10 row is the same everywhere. ⛔ A SESSION RATING IS FOSTER'S SESSION RPE FOR EVERY SPORT, LIFTS INCLUDED
// (Michael, 2026-09-26). The lift's end-of-session question used to carry the per-SET reps-left words ("two reps
// left"), which cannot describe a session that mixes maximum effort, 3–4-in-reserve and 0–2-in-reserve sets (p218);
// reps in reserve stay on each set, where the logger records them. Swims keep their talk-test words.
// Buttons are rounded-xl per docs/DESIGN-button-shape.md; the chosen one wears the sport colour.
import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';
import { FOSTER_LEGEND, fosterEffortWord } from '@shared/effort-words';

export type EffortSport = 'run' | 'bike' | 'swim' | 'strength';

const TALK_TEST: Record<number, string> = {
  1: 'Could sing', 2: 'Could sing', 3: 'Full sentences', 4: 'Short sentences', 5: 'A few words',
  6: 'A few words', 7: 'One word', 8: 'One word', 9: 'Almost max', 10: 'Max',
};

/**
 * ⛔ RUNS AND RIDES USE FOSTER'S SESSION-RPE WORDS (2026-09-14, approved). The talk test words were the app's
 * own translation of an effort number; the book's talk test is its own yes/no question, asked in the popup
 * for easy and long runs only (`@shared/effort-words`). Swims keep their words, unchanged by that decision.
 */
export function effortWords(sport: EffortSport, value: number): string {
  if (sport === 'swim') return TALK_TEST[value] ?? '';
  return fosterEffortWord(value);
}

export default function EffortScale({ sport, value, onChange, label = 'How hard?', optional = true }: {
  sport: EffortSport;
  value: number | null;
  onChange: (v: number | null) => void;
  label?: string;
  optional?: boolean;
}) {
  const colour = getDisciplineColor(sport);
  const legend = sport === 'swim'
      ? ['1–2 could sing', '3 full sentences', '5–6 a few words', '10 max']
      : [...FOSTER_LEGEND];
  return (
    <div>
      <label className="text-sm font-light text-white/70 mb-2 block">
        {label}{optional && <span className="text-xs text-white/40 font-light"> (optional)</span>}
        {value != null && effortWords(sport, value) && <span className="ml-2 text-white/50 font-light">— {effortWords(sport, value)}</span>}
      </label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : n)}
              className={`flex-1 py-2.5 text-sm font-light rounded-xl border backdrop-blur-md transition-colors ${on ? 'text-white' : 'bg-white/[0.06] border-white/15 text-white/70'}`}
              style={on ? { backgroundColor: `${colour}33`, borderColor: `${colour}88` } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-xs text-white/40 font-light">
        {legend.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}
