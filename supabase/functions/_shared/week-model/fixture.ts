// Michael's exact block, read as a document. Run:
//   ~/.deno/bin/deno run --allow-all --no-check supabase/functions/_shared/week-model/fixture.ts
import { type Session, buildUnits, DAY_NAMES } from './model.ts';
import { render, resolve } from './resolve.ts';

const S = (id: string, label: string, load: Session['load'], minutes: number, sport?: Session['sport']): Session =>
  ({ id, label, load, minutes, sport });

// 3 lifting days · 3 runs · 2 rides · two hard days (one run, one ride).
const SESSIONS: Session[] = [
  S('bench', 'Bench Press', 'upper', 60),
  S('dl', 'Deadlift + Overhead Press', 'heavy_lower', 60),
  S('sq', 'Back Squat', 'heavy_lower', 60),
  S('hardrun', 'Hard Run', 'hard_cardio', 40, 'run'),
  S('hardride', 'Hard Ride', 'hard_cardio', 45, 'bike'),
  S('longrun', 'Long Run', 'long_cardio', 54, 'run'),
  S('longride', 'Long Ride', 'long_cardio', 135, 'bike'),
  S('easyrun', 'Easy Run', 'easy', 45, 'run'),
];

const show = (title: string, pins: Record<string, number>) => {
  const units = buildUnits(SESSIONS, pins);
  const r = resolve(units, { minRestDays: 1 });
  console.log(`\n=== ${title} ===`);
  console.log(`units: ${units.map((u) => u.label).join(' | ')}`);
  console.log(render(r));
};

// The athlete owns their weekend. Nothing else is pinned — the law places it.
show('long ride Saturday, long run Sunday (the only pins)', { longride: 5, longrun: 6 });

// What the current engine was handed, for comparison.
show('…plus the hard days pinned Fri run / Tue ride', { longride: 5, longrun: 6, hardrun: 4, hardride: 1 });

// Michael's own drawn week, to check the model agrees it is legal.
show("Michael's week, fully pinned", {
  bench: 0, dl: 1, sq: 3, hardride: 1, hardrun: 3, longride: 5, longrun: 6, easyrun: 0,
});

// A week that genuinely cannot be built — the failure should be readable.
show('long run Sunday + squat pinned Monday (impossible on purpose)', {
  longride: 5, longrun: 6, sq: 0,
});
