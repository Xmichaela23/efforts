// ⛔ ONE EFFORT SCALE FOR THE WHOLE APP (Michael, 2026-09-06: "it should just be congruent across the app").
//
// Before this there were three: the post-workout popup drew ten bordered buttons with talk-test words,
// the strength logger's finish sheet drew a slider with "Light / Moderate / Hard", and the logger's notes
// box took a typed number. Same question, three faces. This is the one face.
//
// The 1–10 row is the same everywhere. Only the WORDS under it change, by sport, because the two
// scales in the field are different things:
//   · endurance — session RPE anchored on the talk test (3 = full sentences is the easy-day anchor;
//     an easy run logged at 3 with a high heart rate reads as heat, not effort).
//   · strength — reps left in the tank, the RPE/RIR scale Strong, Hevy and Renaissance Periodization
//     use: 10 = nothing left, 9 = one rep, 8 = two, 7 = three, 6 = four or more.
// Buttons are rounded-xl per docs/DESIGN-button-shape.md; the chosen one wears the sport colour.
import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';

export type EffortSport = 'run' | 'bike' | 'swim' | 'strength';

const TALK_TEST: Record<number, string> = {
  1: 'Could sing', 2: 'Could sing', 3: 'Full sentences', 4: 'Short sentences', 5: 'A few words',
  6: 'A few words', 7: 'One word', 8: 'One word', 9: 'Almost max', 10: 'Max',
};
const REPS_LEFT: Record<number, string> = {
  1: 'Warm-up weight', 2: 'Warm-up weight', 3: 'Many reps left', 4: 'Many reps left', 5: 'Five or more reps left',
  6: 'Four reps left', 7: 'Three reps left', 8: 'Two reps left', 9: 'One rep left', 10: 'Nothing left',
};

export function effortWords(sport: EffortSport, value: number): string {
  return (sport === 'strength' ? REPS_LEFT : TALK_TEST)[value] ?? '';
}

export default function EffortScale({ sport, value, onChange, label = 'How hard?', optional = true }: {
  sport: EffortSport;
  value: number | null;
  onChange: (v: number | null) => void;
  label?: string;
  optional?: boolean;
}) {
  const colour = getDisciplineColor(sport);
  const legend = sport === 'strength'
    ? ['1 warm-up', '5 five left', '8 two left', '10 nothing left']
    : ['1–2 could sing', '3 full sentences', '5–6 a few words', '10 max'];
  return (
    <div>
      <label className="text-sm font-light text-white/70 mb-2 block">
        {label}{optional && <span className="text-xs text-white/40 font-light"> (optional)</span>}
        {value != null && <span className="ml-2 text-white/50 font-light">— {effortWords(sport, value)}</span>}
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
