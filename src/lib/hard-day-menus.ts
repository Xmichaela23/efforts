/**
 * THE HARD DAY'S GROUND — one table, read by the wizard and by the recipe suite.
 *
 * ⛔ IT LIVED INSIDE `NonRaceBuilder.tsx` AND THAT MADE IT UNTESTABLE. The doctrine's terrain rules —
 * no flat option on the VO2 menu, a treadmill at 1% on the threshold menu and 5-8% on the interval
 * one, `stationary` on the bike's intervals and not its threshold — could only be verified by a
 * human looking at a phone. Moved here for the same reason `assistance-menu.ts` gives in its own
 * header: **anything the client and the engine must agree on lives in `src/lib/`.**
 *
 * ⚠️ THE `id`s ARE STORED VALUES. They go onto the goal as `hard_days[].terrain` / `.environment`
 * and the composer's allowlists read them — `HardRunTerrain` and `HardRideEnvironment` in
 * `strength-primary-plan.ts`. Renaming one here without renaming it there degrades the athlete's
 * pick to "not asked", silently.
 */

export type GroundMenu = { note: string; options: Array<{ id: string; title: string; body: string }> };

/**
 * ⛔ EACH MENU LEADS WITH THE RULE THAT GOVERNS IT (Michael, 2026-08-18), then the options.
 * *"The goal is real-world execution, removing pedantic restrictions while keeping the biological
 * guardrails."* So the notes are deliberately PERMISSIVE about ground the athlete cannot control —
 * a slight rise, natural rolling hills — and absolute about the one thing that actually injures
 * people. His copy, verbatim.
 */
export const HARD_RUN_MENUS: Record<'speed' | 'vo2' | 'threshold', GroundMenu> = {
  speed: {
    // ⛔ THE DOWNHILL CLAUSE IS A SAFETY GUARDRAIL, NOT A PREFERENCE, and it is the one absolute on
    // this screen. Maximal downhill running is the laboratory model for eccentric hamstring damage;
    // it is also the fastest a runner can move, so it looks like the right idea. ⛔ Do not soften it
    // into "prefer flat" — the sentence exists because the mistake is attractive.
    // ⛔ THE DOWNHILL CLAUSE IS THE ONE ABSOLUTE ON THIS SCREEN, and it got STRICTER on 2026-08-18:
    // "even a 1-2% decline". A gentle downhill does not read as dangerous, which is exactly why it
    // has to be named — a runner chasing a fast split takes the free speed and the hamstrings do the
    // braking. Downhill sprinting is the laboratory model for eccentric hamstring damage.
    // ⚠️ AND THE PERMISSION MOVED OUT OF THIS NOTE. "A slight 2-3% uphill is completely fine" used
    // to sit here, which put a licence and a prohibition in one paragraph; the licence now lives on
    // the Road option, where the athlete is actually deciding what to do with a rolling road.
    note: 'Flat is preferred for pure speed mechanics. Never sprint at absolute max effort downhill'
      + '\u2014even a 1-2% decline creates overspeed braking forces that tear up your hamstrings and '
      + 'ruin your squat recovery.',
    options: [
      { id: 'track', title: 'A track', body: 'Predictable footing and a safe run-out, which is what lets you go flat out.' },
      // ⚠️ THE ONLY OPTION THAT NEEDS A METHOD, NOT A DESCRIPTION. Nobody's road is perfectly flat,
      // so this says how to run the session on the road they actually have: pick the efforts, walk
      // the descents. Without it the note above reads as "you cannot do this outside".
      { id: 'flat_road', title: 'Road (flat or rolling)', body: 'If your road isn\u2019t perfectly flat, time your max efforts for the flat or slight uphill stretches. Strictly walk or jog the downhills to save your legs.' },
      { id: 'turf', title: 'Grass or turf', body: 'Softer landing than tarmac, so the same session costs your legs a little less.' },
    ],
  },
  vo2: {
    // ⛔ THIS NOTE SAID THE SAME THING AS THE GOAL OPTION DIRECTLY ABOVE IT, almost word for word —
    // "pushes your aerobic ceiling, uphill removes the eccentric impact, saves your knees and quads".
    // The athlete read one paragraph, chose it, and immediately read it again. The goal card sells
    // the SESSION; this line's only job is the ground it needs.
    note: 'Any climb you can run hard for the full effort. The gradient is what does the work.',
    options: [
      { id: 'hill_3min', title: 'A hill you can run for 3 minutes', body: 'Four 3-minute climbs, walk or jog back down.' },
      { id: 'hill_short', title: 'Only a short hill', body: 'Ten 1-minute climbs. Shorter efforts hold less stimulus than the 3-minute version \u2014 the session for the hill you have.' },
      { id: 'treadmill', title: 'A treadmill', body: 'The same four 3-minute efforts at 5-8% incline. The incline does the hill\u2019s job.' },
      // ⛔ `flat` IS OFF THIS MENU DELIBERATELY — RULED 2026-08-18, DO NOT PUT IT BACK. It was §2.0's
      // last-resort 4 × 3 min on level ground for an athlete with no climb and no treadmill.
      //
      // ⛔ MICHAEL'S REASON, AND IT IS WHY THIS IS AN IMPROVEMENT RATHER THAN A LOSS: *"trying to
      // hack a VO2 max session on flat ground guarantees massive eccentric tissue damage. Removing
      // flat routes them to the Speed goal, which gives them a flat-ground session specifically
      // designed to manage that mechanical impact. The system protects the user from their own
      // geography."* The no-hill athlete is not losing an option; they are being moved off a bad one
      // onto the session built for their ground. The engine still builds `flat` for any goal that
      // already stores it.
    ],
  },
  threshold: {
    note: 'Uninterrupted pacing is the only rule. Natural 2-3% rolling hills are fine \u2014 just '
      + 'maintain a steady effort and don\u2019t let the short uphills spike your heart rate out of '
      + 'the zone.',
    options: [
      { id: 'track', title: 'A track', body: 'The pace is the pace \u2014 nothing tilts, so you hold the number.' },
      { id: 'flat_road', title: 'Road \u2014 flat or rolling', body: 'Pick a stretch you can run unbroken.' },
      { id: 'treadmill_1pct', title: 'A treadmill at 1%', body: 'One percent, not the interval day\u2019s 5-8%. This session wants flat.' },
    ],
  },
};

export const HARD_RIDE_MENUS: Record<'vo2' | 'threshold', GroundMenu> = {
  vo2: {
    note: 'Cycling spares your joints from impact damage, but max-wattage pushes aggressively drain '
      + 'glycogen from your quads. You need an environment where you can safely redline with zero '
      + 'traffic or stoplights.',
    options: [
      { id: 'smart_trainer', title: 'Smart trainer, erg mode', body: 'It holds the number, so all you do is pedal.' },
      { id: 'stationary', title: 'A stationary bike', body: 'No power to read, so ride it by effort \u2014 hard enough that a sentence is a struggle.' },
      { id: 'flat_road', title: 'A flat road', body: 'Use a stretch with no junctions.' },
      { id: 'hill_climb', title: 'A climb you can repeat', body: 'The gradient holds the effort for you \u2014 ride back down easy.' },
    ],
  },
  threshold: {
    note: 'Requires grueling, unbroken pedaling. Coasting or stopping for intersections breaks the '
      + 'metabolic adaptation. If your local roads force you to stop, take this inside to the trainer.',
    options: [
      { id: 'smart_trainer', title: 'Smart trainer', body: 'Completely uninterrupted, which is what this session needs most.' },
      { id: 'flat_road', title: 'A flat or rolling road', body: 'Pick a stretch you can ride unbroken \u2014 every stop restarts the effort.' },
      { id: 'long_climb', title: 'A long steady climb', body: 'The gradient does the pacing and nothing interrupts it.' },
    ],
  },
};

/** The two things an athlete can want from the intensity day. Michael's copy, verbatim. */
export const HARD_RUN_GOALS: Array<{ id: 'speed' | 'vo2'; title: string; body: string }> = [
  {
    id: 'speed',
    title: 'Speed focus',
    body: 'Short, explosive flat sprints to make you faster. High neurological drive, but the hard '
      + 'footfall creates mechanical damage that requires 48 hours of leg clearance before heavy squats.',
  },
  {
    id: 'vo2',
    title: 'VO2 max focus',
    body: 'Hard 3-minute climbs to push your maximum aerobic ceiling. Spikes your heart rate to the '
      + 'limit, but running uphill removes the eccentric impact, saving your knees and quads for the barbell.',
  },
];
