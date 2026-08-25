// THE WIZARD'S SCHEDULE CARD — TWO RULES THAT LIVE IN JSX AND CANNOT BE UNIT-TESTED HERE.
//
// ⛔ WHY A SOURCE LINT AND NOT A RENDER TEST. `npx vitest run` does not run in this repo — its ESM
// loader rejects the `https:` deno-std imports the shared modules use, and there is no vitest config
// or `test` script. `deno test src/` runs the pure modules but cannot render a React component.
// So the two rules below have no executable home, and the choice is a source assertion or nothing.
// ⚠️ `_shared/anchor-resolver-lint.test.ts` is the precedent: this repo already guards a rule it
// cannot execute by reading the source.
//
// ⛔ A SOURCE LINT IS WEAKER THAN A RENDER TEST AND THIS FILE SAYS SO. It proves the call is written,
// not that the screen behaves. Neither rule below has been verified on a device.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check src/lib/wizard-day-lock.lint.test.ts
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(
  new URL('../components/NonRaceBuilder.tsx', import.meta.url),
);

Deno.test('⛔ THE LONG-DAY ROWS LOCK AGAINST THE OTHER ANCHOR — the long run and long ride cannot both read Sunday', () => {
  // ⛔ THE DEFECT (trace report, unresolved until stage 3 2026-08-21). The comment above this row
  // said `anchor-days.ts` answers the lock "for all three" — and the code passed `taken={{}}`. The
  // comment and the code disagreed, and the code was the one that was wrong: nothing was locked and
  // nothing was named, so both long days could be answered onto the same date.
  //
  // ⚠️ `strength-primary-plan.ts` keeps a BACKSTOP for that collision and its own comment says where
  // the real fix belongs: *"the day picker greys out and locks a day another anchor already holds,
  // so the collision is never entered."* This is that picker.
  // ⚠️ THE EXPRESSION MOVED, THE RULE DID NOT (2026-08-25). The disclosure list is gone, so the row
  // no longer branches on `row.key`; the long picker is its own always-open card and reads the same
  // helper off `scheduleRunShown`. The test matches the CALL, not the old row plumbing around it.
  assert(
    /taken=\{anchorDaysTaken\(state, scheduleRunShown \? 'long run' : 'long ride'\)\}/.test(SRC),
    'the long-day WeekDayRow no longer passes anchorDaysTaken — the two long days can collide again',
  );
});

Deno.test('⛔ THE HARD-DAY ROW STILL PASSES {} — this is a RULING, not an inconsistency', () => {
  // ⚠️ THE TWO ROWS DISAGREE ON PURPOSE AND MUST NOT BE "MADE CONSISTENT". The hard-day row is
  // deliberately unlocked — *"two hard sessions on one day still builds as one, and the PLAN says
  // so; a lock made it look like a broken button."* Two hard days sharing a date is a legal week the
  // composer reports on. Two LONG days sharing one is the pin collision above.
  //
  // ⛔ THIS TEST EXISTS BECAUSE FIXING THE ROW ABOVE MAKES THIS ONE LOOK LIKE THE SAME BUG. It is
  // not. If a future session "tidies" it, this fails and points at the ruling.
  // ⚠️ ANCHORED ON THE RULING'S OWN WORDS, so the test names the reason rather than a line number.
  const marker = '⛔ NOTHING IS DISABLED. The other slot';
  const at = SRC.indexOf(marker);
  assert(at > 0, `the hard-day ruling comment is gone — it read: "${marker}..."`);
  // ⚠️ THE PROP MOVED BELOW THE RULING (2026-08-25). It used to sit immediately before the comment;
  // in the always-open card the comment introduces the pair and `taken` follows it. Both sides are
  // searched so the assertion survives the next reshuffle of one element's attribute order.
  const around = SRC.slice(Math.max(0, at - 300), at + 300);
  assert(
    /taken=\{\{\}\}/.test(around),
    `the hard-day WeekDayRow stopped passing an empty \`taken\`: ...${around.slice(-200)}`,
  );
});

Deno.test('⛔ THE EXHAUSTIVE SOLVE IS GATED TO THE STEP THAT READS IT', () => {
  // ⛔ THE LATENCY DEFECT. The memo was ungated and its deps include `runDays`, `rideDays` and
  // `swimDays`, so tapping a ride-count chip on the VOLUME step ran a 457 ms exhaustive placer whose
  // answer nobody reads until two screens later. Nothing outside `schedule` consumes it — the two
  // long-day pre-fills, the hard-day pre-fill and the health badge are all gated to that step.
  assert(
    /currentStep === 'schedule' && solveArmed \? wizardSolveInput : null/.test(SRC),
    'the wizard solve is no longer gated to the schedule step',
  );
  assert(
    /IDLE_WIZARD_WEEK/.test(SRC),
    'the no-opinion answer used off the schedule step is gone',
  );
});

Deno.test('⛔ AND IT IS OFF THE PAINT — deferred, and armed a frame after the step opens', () => {
  // ⚠️ TWO MECHANISMS, BOTH NEEDED. `useDeferredValue` keeps later taps off the paint by re-rendering
  // with the previous input first. It does NOT help the FIRST render of the step: on React 18 it
  // returns the value unchanged when there is no previous one, so the card's first paint would still
  // pay the full unpinned solve. `solveArmed` flipping on the next animation frame is what covers
  // that. ⛔ Removing either one puts the worst solve back in front of a paint.
  assert(/React\.useDeferredValue\(/.test(SRC), 'the solve is no longer deferred');
  assert(
    /requestAnimationFrame\(\(\) => setSolveArmed\(true\)\)/.test(SRC),
    'the first solve is no longer armed on the next frame',
  );
});

Deno.test('⛔ EVERY RIDE-DAY PICKER READS THE ONE RANGE — no hardcoded 1/2/3 left', () => {
  // ⛔ THE RULE HAD SIX STATEMENTS AND THREE WERE STALE AT 3 (stage 4, 2026-08-21). Michael ruled on
  // 2026-08-21 that this is *"fixing an internal contradiction, not a design change — the volume card
  // and the validator already say 4, and Viada's cycling programs use five or six rides a week."*
  //
  // ⚠️ THE TEST IS "NO LITERAL", NOT "THE VALUE IS 4". Pinning 4 here would be a seventh statement of
  // the range; what must hold is that every picker reads `RIDE_DAYS_CHOICES`, wherever that goes next.
  const rideDayWrites = [...SRC.matchAll(/\{\s*\.\.\.st?,?\s*rideDays: n\s*\}|rideDays: n \}/g)];
  assert(rideDayWrites.length >= 2, `expected at least two ride-day pickers, found ${rideDayWrites.length}`);
  for (const m of rideDayWrites) {
    const before = SRC.slice(Math.max(0, m.index! - 700), m.index!);
    // ⚠️ BOTH HALVES. The schedule row's ride arm reads `RIDE_DAYS_CHOICES` inside a ternary, so
    // "mentions the constant" is what can be checked — and "carries no literal range" is what stops
    // the constant sitting beside a hardcoded `[1, 2, 3]` that is the one actually mapped.
    assert(
      /RIDE_DAYS_CHOICES/.test(before),
      `a ride-day picker does not read RIDE_DAYS_CHOICES: ...${before.slice(-160)}`,
    );
    assert(
      !/\[\s*1\s*,\s*2\s*,\s*3\s*\]/.test(before),
      `a ride-day picker still carries a hardcoded 1/2/3 range: ...${before.slice(-160)}`,
    );
  }
});

Deno.test('⛔ THE RUN AND SWIM PICKERS READ THEIR RANGES — no hardcoded literals left', () => {
  // ⛔ SAME RULE AS THE RIDE'S, one sport over (stage 4 run half, 2026-08-22). The test is "no
  // literal", not "the value is N" — pinning the number here would be another statement of the range.
  //
  // ⚠️ TWO LITERALS SURVIVE ON PURPOSE AND ARE NAMED, so this test cannot be satisfied by deleting
  // the constants:
  //   · the schedule row's RUN arm is `[2, 3, 4]` — the wire accepts 1 and the composer builds it,
  //     but this row has never OFFERED 1. A screen offering fewer than the wire accepts rewrites
  //     nothing; the ride's defect was the other direction. Raising it is Michael's call.
  //   · the standalone run step is `[2, 3, 4]` for the same reason.
  const runVolumeCard = /\{RUN_DAYS_CHOICES\.map\(\(n\) => \{\s*\n\s*const on = \(state\.runDays === n\);/;
  assert(runVolumeCard.test(SRC), 'the volume card\'s run picker stopped reading RUN_DAYS_CHOICES');

  const swimWrites = [...SRC.matchAll(/swimDays: n \}/g)];
  assert(swimWrites.length >= 2, `expected at least two swim pickers, found ${swimWrites.length}`);
  for (const m of swimWrites) {
    const before = SRC.slice(Math.max(0, m.index! - 700), m.index!);
    assert(
      /SWIM_DAYS_CHOICES/.test(before),
      `a swim picker does not read SWIM_DAYS_CHOICES: ...${before.slice(-160)}`,
    );
  }
});

Deno.test('⛔ `run_days` IS NOT GATED ON STRENGTH POSTURE — a routing key is not a discipline gate', () => {
  // ⛔ THE DEFECT (trace report §2.5a, unresolved until 2026-08-22). `run_days` shipped only when
  // `state.posture?.strength === 'develop'` while `target_weekly_miles` beside it shipped UNGATED.
  // The report could neither find a path to the bad state nor prove there wasn't one — and the
  // failure it allows is silent: the miles arrive, the count does not, and the athlete's typed
  // mileage is divided across the DEFAULT two runs instead of the four they picked.
  // ⚠️ REGEX WIDENED 2026-08-25. The `...(` used to sit directly on this ternary; the 2026-08-24
  // slot refactor wrapped it in `isStrengthFocusPath ? { run_days: derivedCounts.runs } : (…)`, so
  // the old anchored pattern failed on a change that did not touch the rule. Both arms are pinned
  // instead — the strength path ships the count unconditionally from the slots, every other path
  // gates on `runDays >= 1` (i.e. "did the athlete answer"), and neither reads strength posture.
  assert(
    /state\.runDays >= 1 \? \{ run_days: state\.runDays \} : \{\}/.test(SRC),
    'run_days is gated on something other than whether the athlete answered it',
  );
  assert(
    /isStrengthFocusPath\s*\n?\s*\? \{ run_days: derivedCounts\.runs \}/.test(SRC),
    'the strength path stopped shipping run_days from the endurance slots',
  );
  assert(
    !/posture\?\.strength === 'develop' && state\.runDays/.test(SRC),
    'the strength-posture coupling on run_days came back',
  );
});
