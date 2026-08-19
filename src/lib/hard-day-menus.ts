/**
 * THE HIGH INTENSITY DAY'S COPY — one table, read by the wizard and by the recipe suite.
 *
 * ⛔ IT LIVED INSIDE `NonRaceBuilder.tsx` AND THAT MADE IT UNTESTABLE. Anything the client and the
 * engine must agree on lives in `src/lib/` — the same reason `assistance-menu.ts` gives in its own
 * header.
 *
 * ⛔⛔ REBUILT 2026-08-18 (Michael, from the live screen). WHAT THIS FILE USED TO BE AND WHY IT IS
 * NOT THAT ANY MORE — read this before adding an option back.
 *
 * It held FIVE ground menus: three for the run (speed / vo2 / threshold, three or four surfaces
 * each) and two for the ride. Stacked with the goal question above them, one hard run asked the
 * athlete FIVE questions on a single card. His verdict: *"this is all a bit of a mess and
 * consuing — need to be clear on intent and what the work out is, too many options."*
 *
 * Three things were wrong, and they are different problems:
 *
 * 1. **MOST OF IT WAS NOT A PLANNING QUESTION.** Track versus flat road versus turf, hill versus
 *    treadmill, trainer versus road — none of them changed a token, a duration or a rep count. They
 *    changed one sentence of the session description. A builder standing twelve weeks from the
 *    session is the worst possible moment to ask where you will be on a Tuesday morning in week
 *    nine. *"Let the materializing explain what their options are."* So those sentences now live in
 *    the session itself (`sprintSession`, `thresholdGroundNote`, `rideEnvironmentNote`, and the
 *    incline note in `hardRunSession`), which is where the athlete reads them on the day.
 *
 * 2. **ONE OF THEM WAS REAL AND IS KEPT.** Flat versus incline is not a preference — it is the
 *    eccentric-versus-concentric fork. Flat sprints pound the legs and buy the 48h backward
 *    clearance against heavy lower work; running uphill removes the impact transient entirely.
 *    It changes the session AND the week. It is the only ground question left, and it is asked in
 *    exactly one state: a run holding the top-end intensity slot.
 *
 * 3. **THE BIKE HAD NO INTENT QUESTION AT ALL, AND THE INTERLOCK WAS INVISIBLE.** Which sport got
 *    the intensity session was decided by which one the wizard happened to list first. Two athletes
 *    making identical picks got different blocks off list order. The allocation is now a stated,
 *    athlete-owned toggle — see `INTENT_ALLOCATION`.
 *
 * ⚠️ THE `id`s ARE STORED VALUES. `intent` maps to `hard_days[].role` and the run ground maps to
 * `hard_days[].goal`; the composer's allowlists read them (`assignHardRoles`, `HardRunGoal` in
 * `strength-primary-plan.ts`). Renaming one here without renaming it there degrades the athlete's
 * pick to "not asked", silently.
 *
 * ⚠️ `terrain` IS NO LONGER WRITTEN BY THE WIZARD. `HardRunTerrain` still exists and is still
 * honoured — every goal built before today carries one and reads exactly as it did. Nothing new
 * sets it.
 */

export type CopyOption<T extends string> = { id: T; title: string; body: string };

/**
 * ⛔ THERE IS NO `HARD_DAY_EMPTY_NOTE` HERE, AND ONE MUST NOT COME BACK. Michael's spec gave copy for
 * the empty state — *"Intensity taxes your central nervous system…"* — and it was added here and
 * rendered on the card, where the card's OWN banner (`NonRaceBuilder.tsx:4334`) had been carrying
 * those same two sentences since earlier the same day, plus the Schedule-step line. The athlete
 * landed on the screen and read the cost twice.
 *
 * ⚠️ THE BANNER IS THE ONE OWNER. If the empty state ever needs different words, change the banner —
 * do not add a second string that says the same thing in a different place.
 */

/**
 * ⛔ THE SINGLE-SLOT QUESTION. One hard session is not a fragment of a two-session week — it IS the
 * cardiovascular content of the block, and the athlete is choosing what twelve weeks of it buys.
 *
 * ⚠️ THE RECOMMENDATION IS STATED, NOT ENFORCED. The engine advises, the athlete decides — the
 * standing rule on this screen. `intensity` is the default because it preserves the barbell; a
 * `threshold` pick is honoured with nothing said about it afterwards.
 */
/**
 * ⚠️ ONE WORD CHANGED FROM MICHAEL'S DRAFT, AND IT WAS THE LINT, NOT AN EDIT. His line read
 * *"dictates the cardiovascular focus"*; `focus` is a banned word in `voiceViolation()` and the
 * copy-voice rule is enforced as a hard check, not a preference. `stimulus` carries the same claim
 * and is the term the sessions themselves use.
 */
export const SINGLE_SLOT_NOTE = 'One hard session. It sets the cardiovascular stimulus for all 12 weeks.';

/**
 * ⛔ `HARD_DAY_INTENT` LIVED HERE AND IS DELETED — do not reintroduce it. It was the single-slot
 * intensity-vs-threshold pair, and it stacked on the speed-vs-VO2 pair to make one list of four
 * (Michael: *"4 options? confusing?"*). `singleSlotOptions()` at the bottom of this file merged both
 * into one question. Its two corrections survive there verbatim: "aligns with heavy lifting
 * pathways", never "protects them", and NO accessory-cost clause on the threshold option — the band
 * is set by the COUNT of hard days, so both roles cost identical accessory volume and the sentence
 * would be a claim the plan then contradicts.
 */

/**
 * ⛔ THE INTERLOCK, SAID OUT LOUD — THE WHOLE POINT OF THE 2026-08-18 REBUILD.
 *
 * The week's budget is one top-end session and one sustained session. That was already true and it
 * was decided by LIST ORDER, which no surface displayed. An athlete picked a hard run and a hard
 * ride and had no way to learn that the run took the speed because it was tapped first.
 *
 * ⚠️ ONE TOGGLE, TWO CONSEQUENCES. Picking intensity for one sport IS picking threshold for the
 * other — there is no second question, and the card states the other sport's session rather than
 * asking about it. That is what makes the budget visible instead of enforced in silence.
 */
export const INTENT_ALLOCATION_NOTE = 'One top-end session, one sustained. Pick which sport holds your speed.';

/**
 * ⛔ LEAD WITH THE GOAL, NOT THE GROUND (Michael, 2026-08-18): *"hills are VO2 max, flat is speed
 * work — needs to be clear, need to lead with the goal: speed focus, VO2 max focus."*
 *
 * The first draft titled these "Flat ground" and "Incline" and buried what they BUY in the body
 * text. That is backwards. The athlete is choosing a training goal; the surface is the consequence
 * of the goal, not the question. These titles are his own approved wording, restored verbatim from
 * the pre-rebuild `HARD_RUN_GOALS` — they were live before today and should not have been renamed.
 *
 * ⚠️ TWO BANNED WORDS, KNOWINGLY SHIPPED. `focus` and the metric name `VO2 max` both trip
 * `voiceViolation()` (copy-voice rule 9 bans naming the metric, as it bans "aerobic base" and "Z2").
 * Michael named both explicitly and these are the labels he already approved once. His call, on the
 * record — ⛔ do not "fix" them to satisfy the lint without asking him.
 *
 * ⚠️ AND IT IS STILL A BIOLOGICAL QUESTION, NOT A PREFERENCE. It is asked in exactly one state: a RUN
 * holding the TOP-END INTENSITY slot. A threshold run, a ride of either kind and a club session all
 * ask nothing. It is the only ground choice that reaches Layer 1 — `goal: 'speed'` is what makes the
 * solver prefer 48h of clearance between the session and heavy lower work (`isFlatFootfall` →
 * `preferredClearance` in `strength-primary-plan.ts`).
 *
 * ⛔ THE `id`s ARE `HardRunGoal` VALUES, NOT TERRAIN VALUES. `speed` here means the SPRINT session on
 * level ground; it must never be written to `terrain`, where `'flat'` is a different thing entirely
 * (§2.0's last-resort VO2 intervals on the level). The wizard writes `goal` and nothing else; which
 * flat surface, or hill versus treadmill, is answered on the day.
 */
export const RUN_GROUND_NOTE = 'Flat sprints need 48 hours clear of heavy squats. Hills do not.';

/**
 * ⛔ ORDERED BY WHAT IT COSTS THE LEGS, CHEAPEST FIRST (Michael, 2026-08-18: *"is VO2 max the most
 * forgiving? then put it up top — order by easiest on legs if we auto prefer"*).
 *
 * ⚠️ THE ORDER IS AN ARGUMENT, NOT A LAYOUT CHOICE, AND IT IS THE BLOCK'S OWN AXIS. `HardRunTerrain`
 * already ranks its options this way in its header — *"VO2max stimulus bought at the least cost to
 * the legs"* — and the reason is doctrine §2: running uphill removes the impact transient, so the
 * hill session buys a hard aerobic stimulus the barbell does not pay for. Flat sprints are the only
 * option that charges a mechanical cost, which is why they are the only one carrying a clearance
 * window. Recommended-first and cheapest-first are the same order here, and that is not a
 * coincidence — the recommendation IS the cost ranking.
 *
 * ⛔ SO IF A NEW OPTION IS ADDED, IT GOES IN BY LEG COST, not at the end.
 */
export const RUN_GROUND_OPTIONS: Array<CopyOption<'vo2' | 'speed'>> = [
  {
    id: 'vo2',
    title: 'VO2 max focus',
    body: 'Incline — hill or treadmill. Hard 3-minute climbs. Uphill removes the eccentric impact, '
      + 'so your knees and quads are still there for the barbell.',
  },
  {
    id: 'speed',
    title: 'Speed focus',
    body: 'Flat ground — track or road. Explosive sprints. High neural drive, but the footfall '
      + 'costs you 48 hours clear of heavy squats.',
  },
];

/**
 * ⛔ THE ACTUAL PRESCRIPTION, NOT A CHARACTER SKETCH (Michael, 2026-08-18: *"ride intensity needs
 * to fill with green, actual ride prescription"*).
 *
 * The first draft said things like *"short, explosive pushes to raise your maximum wattage"* — true,
 * and it tells an athlete nothing they can plan around. The run's options have always stated their
 * reps; the ride's said nothing, which is the same *"there is not clarity on ride what we offer"*
 * complaint in a new outfit. These are the sessions the composer actually builds.
 *
 * ⛔ AND BOTH SLOTS RENDER AT ONCE — see the per-slot loop in `NonRaceBuilder`. Showing only the
 * active slot meant an athlete could allocate intensity to the ride and never once read what the
 * ride was; the card told them about the run instead. Two blocks, side by side, is the interlock
 * made concrete rather than described.
 *
 * ⚠️ EACH ONE NAMES WHERE THE REMAINING CHOICE GETS MADE — *"you will choose your setup on the day."*
 * That sentence is a CONTRACT with the session description, which now lists the setups. If the
 * materializer ever stops listing them, these lines promise something the app does not deliver.
 *
 * ⚠️ THE NUMBERS MUST TRACK THE COMPOSER. `4 × 5 → 3 × 7 → 2 × 10` is the threshold wave for both
 * disciplines; the Helgerud `4 × 4` halves to `2 × 4` in the anchor. If those tables move, these
 * move with them or the card starts lying about the block it just sold.
 */
export const SESSION_PRESCRIPTION = {
  ride_intensity:
    'Helgerud 4 × 4 — four 4-minute efforts at max sustainable power, easy spinning between. Halves '
    + 'to 2 × 4 in the final weeks. Setup (trainer vs. road) on the day.',
  ride_threshold:
    '4 × 5 min building to 2 × 10, at 95-105% FTP. Setup (trainer vs. road) on the day.',
  run_threshold:
    '4 × 5 min building to 2 × 10, about 20 s/mi slower than 5K pace. Setup (track vs. rolling '
    + 'road) on the day.',
} as const;

/**
 * ⛔ THE INTERLOCK LINE — one sentence, above the pair, naming which sport took the speed. It is the
 * thing that was invisible for the entire life of this screen, so it is stated even though the two
 * blocks below it already imply it.
 */
export const interlockLine = (intensitySport: 'run' | 'bike', chosen: boolean): string => {
  const stated = intensitySport === 'bike'
    ? 'Your ride holds the speed. Your run is the sustained one.'
    : 'Your run holds the speed. Your ride is the sustained one.';
  /**
   * ⛔ THE APP PICKED AND SAID NOTHING (Michael, 2026-08-18: *"is it auto picks sustained for ride?
   * we need to make it clear how this happens"*).
   *
   * With two slots and no allocation yet, `hardRoleOf` falls back to the positional rule and ONE
   * BUTTON RENDERS ALREADY FILLED. To the athlete that is indistinguishable from a choice they
   * made — so the sustained session appeared on one sport for no reason they could see. That is the
   * same invisible-decision defect the allocation toggle was built to end, surviving as a default.
   *
   * ⚠️ THE LINE DOES NOT INVENT A RATIONALE. The fallback is list order and nothing more; claiming
   * a training reason for it would be worse than saying it is a starting point. What it does say is
   * the MECHANISM — tap either, that sport takes the speed, the other takes the sustained work —
   * which is the part that was never stated anywhere.
   */
  return chosen ? stated : `${stated} Nothing picked yet — tap either to set it.`;
};

/**
 * ⛔⛔ ONE SLOT IS ONE QUESTION (Michael, 2026-08-18: *"4 options? confusing?"*).
 *
 * A single hard RUN was being asked twice, and the athlete read it as one list of four:
 *
 *     What you want from it   → Top-end intensity | Sustained threshold
 *     Run — top-end intensity → Speed focus       | VO2 max focus
 *
 * Both questions are the SAME AXIS for a lone hard session. There are exactly three sessions a
 * single hard run can be — sprints, hills, or threshold — and the two-step framing was an artifact
 * of the two-slot flow leaking into the one-slot one. Merged into one list, each option carrying
 * its own prescription, so the choice and its consequence arrive together.
 *
 * ⚠️ THE TWO-SLOT FLOW IS UNCHANGED AND MUST STAY THAT WAY. There the allocation toggle settles
 * intensity-vs-threshold first, so the run's remaining question is genuinely only speed-vs-VO2 —
 * one list of two under an already-labelled heading. ⛔ Do not merge that one; it would put four
 * options back on the card by the other route.
 *
 * ⚠️ `role` AND `goal` ARE BOTH WRITTEN FROM ONE TAP. That is the point of merging: the athlete
 * answers once and the engine gets both fields it needs.
 */
export type SingleSlotOption = {
  id: string;
  title: string;
  body: string;
  role: 'intensity' | 'threshold';
  goal?: 'speed' | 'vo2';
};

export const singleSlotOptions = (discipline: 'run' | 'bike'): SingleSlotOption[] => (
  discipline === 'bike'
    ? [
      {
        id: 'intensity',
        title: 'Top-end intensity',
        // ⚠️ THE REAL SESSION, not a character sketch — same rule as `SESSION_PRESCRIPTION`, which
        // this deliberately mirrors word for word so the two cannot drift apart.
        body: 'Helgerud 4 × 4 — four 4-minute efforts at max sustainable power, halving to 2 × 4 in '
          + 'the final weeks. Same fast-twitch pathways as the barbell. Recommended.',
        role: 'intensity',
      },
      {
        id: 'threshold',
        title: 'Sustained threshold',
        body: '4 × 5 min building to 2 × 10 at 95-105% FTP. Builds stamina, but prolonged efforts '
          + 'compete hardest with strength.',
        role: 'threshold',
      },
    ]
    : [
      /**
       * ⛔ CHEAPEST ON THE LEGS FIRST — the same ranking `RUN_GROUND_OPTIONS` documents, and for the
       * same reason. Uphill removes the impact transient; sustained running is a lot of level
       * footfall at a submaximal effort; maximal flat sprinting is the one session that charges a
       * mechanical cost, which is why it is the only one with a clearance window attached.
       */
      {
        id: 'vo2',
        title: 'VO2 max focus',
        body: 'Incline — hill or treadmill. Hard 3-minute climbs. Uphill removes the eccentric '
          + 'impact, so your legs are still there for the barbell. Recommended.',
        role: 'intensity',
        goal: 'vo2',
      },
      {
        id: 'threshold',
        title: 'Sustained threshold',
        body: '4 × 5 min building to 2 × 10, about 20 s/mi slower than 5K pace. Builds stamina, '
          + 'but prolonged efforts compete hardest with strength.',
        role: 'threshold',
      },
      {
        id: 'speed',
        title: 'Speed focus',
        body: 'Flat ground — track or road. Explosive sprints. High neural drive, but the footfall '
          + 'costs you 48 hours clear of heavy squats.',
        role: 'intensity',
        goal: 'speed',
      },
    ]
);
