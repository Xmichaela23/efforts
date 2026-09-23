/**
 * ⛔⛔ THE FOCUS HAS TO SURVIVE EVERY HOP, and this file is the guard (2026-08-30).
 *
 * Standard Focus builds the All Rounder (p274-275); Run Focus builds Run + Strength (p246-247).
 * The athlete's answer travels: the Train card → `NonRaceState.focus` → the wizard payload →
 * `create-goal`'s forward → `generate-strength-plan`'s body read → `resolveFrame`.
 *
 * ⛔ A DROPPED HOP FAILS SILENTLY AND BUILDS THE WRONG PROGRAMME. `resolveFrame` treats an absent
 * focus as the 5K frame — deliberately, so every caller that predates this card is untouched — so an
 * athlete who picked Standard Focus and lost the field on any hop is handed twelve weeks of a
 * DIFFERENT Viada programme with nothing said. That is exactly the failure `endurance_experience`
 * had on the same path, which is why that field has a travel test of its own beside this one.
 *
 * ⚠️ SOURCE-LEVEL, LIKE ITS SIBLING. There is no runtime here to compose these four files, so this
 * asserts the wiring exists rather than that a request produces a plan. It catches the hop being
 * deleted, which is the failure that actually happened.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const read = (p: string) => Deno.readTextFileSync(new URL(p, import.meta.url));

const WIZARD = read('../components/NonRaceBuilder.tsx');
const CREATE_GOAL = read('../../supabase/functions/create-goal-and-materialize-plan/index.ts');
const GENERATE = read('../../supabase/functions/generate-strength-plan/index.ts');
const RESOLVER = read('../../supabase/functions/_shared/standing-plan/frame-resolver.ts');

Deno.test('⛔ HOP 1 — the card sets the focus and the payload carries it', () => {
  // ⛔ TWO CARDS SET IT NOW (2026-09-07): the Standard Focus card on the Train screen, and the
  // programme card on the Run Focus list (which carries its frame's focus in `PROGRAM_COPY`).
  assert(/setState\(\(st\) => \(\{ \.\.\.st, focus: 'standard', trainCard: t, program: null \}\)\)/.test(WIZARD),
    'the Standard Focus card no longer records its focus');
  assert(/setState\(\(st\) => \(\{ \.\.\.st, focus, program: p \}\)\)/.test(WIZARD),
    'the programme card no longer records its focus');
  assert(/\{ focus: 'standard' \}/.test(WIZARD),
    'the wizard payload no longer carries the focus');
  // ⚠️ AND THE 5K PATH SENDS NOTHING, so its payload is unchanged.
  assert(/state\.focus === 'standard' \? \{ focus: 'standard' \} : \{\}/.test(WIZARD),
    'the focus is now sent on the 5K path too — that payload must stay as it was');
});

Deno.test('⛔ HOP 2 — create-goal forwards it, allowlisted', () => {
  assert(/gsTp\.focus === 'standard'/.test(CREATE_GOAL),
    'create-goal no longer forwards the focus to the builder');
  assert(/gsTp\.focus === 'standard' \|\| gsTp\.focus === 'run'/.test(CREATE_GOAL),
    'the forward is no longer allowlisted — an unknown value could name a frame that does not exist');
});

Deno.test('⛔ HOP 3 — the builder reads it and hands it to the resolver', () => {
  // ⚠️ ONE READER SINCE 2026-09-13 (`focusFromBody`), because the entry check resolves the frame too.
  assert(/\(body as Record<string, unknown> \| null\)\?\.focus/.test(GENERATE),
    'generate-strength-plan no longer reads the focus off its body');
  assert(/enduranceSport: sport, focus/.test(GENERATE),
    'the focus never reaches resolveFrame — every athlete gets the 5K frame');
  assert(/raw === 'ride' \? 'ride' : raw === 'run_half' \? 'run_half' : 'run'/.test(GENERATE),
    'an unrecognised focus no longer falls back to the 5K frame');
});

Deno.test('⛔ THE RESOLVER STILL DEFAULTS TO THE 5K FRAME', () => {
  /**
   * ⚠️ THIS IS THE ASSERTION THAT KEEPS THE EXISTING PATH SAFE. Absent must mean `strength_5k` —
   * every caller written before the card exists sends no focus at all, and a default of
   * `all_rounder` would move every one of them onto a different programme mid-flight.
   */
  // ⚠️ `'ride'` JOINED 2026-09-13 (Ride Focus → Cycling: Base, p278). Absent still means the 5K frame.
  assert(/focus\?: 'standard' \| 'run' \| 'ride' \| 'run_half';/.test(RESOLVER),
    'the resolver no longer takes an optional focus');
  assert(/position\.focus === 'run_half' \? 'strength_half' : 'strength_5k'/.test(RESOLVER),
    'the resolver default is no longer the 5K frame');
});

Deno.test('⛔ RIDE + STRENGTH — the focus and the ride count survive every hop (2026-09-13)', () => {
  // Hop 1: the programme card carries `ride`, and the payload sends it and the ride count.
  assert(/goal: 'get_stronger', focus: 'ride'/.test(WIZARD), 'the Ride + Strength card no longer seeds its focus');
  assert(/state\.focus === 'ride' \? \{ focus: 'ride' \} : \{\}/.test(WIZARD), 'the payload no longer sends the ride focus');
  assert(/printedRideWeekPath\(state\) && state\.rideCount != null \? \{ ride_count:/.test(WIZARD), 'the payload no longer sends the ride count');
  // Hop 2: create-goal forwards both through its allowlist.
  assert(/gsTp\.focus === 'ride'/.test(CREATE_GOAL), 'create-goal no longer forwards the ride focus');
  assert(/\{ ride_count: n \}/.test(CREATE_GOAL), 'create-goal drops the ride count — a four-ride answer builds five');
  // Hop 3: the builder reads the count off its body.
  assert(/\(body as Record<string, unknown>\)\.ride_count/.test(GENERATE), 'generate-strength-plan no longer reads the ride count');
});

Deno.test('⛔ MULTISPORT FOCUS — the Run + Ride + Strength card opens today\'s Standard Focus setup (2026-09-13)', () => {
  // The same goal and focus the Standard Focus Train card set, so the setup and the payload are unchanged.
  assert(/run_ride_strength: \{[\s\S]*?goal: 'get_stronger', focus: 'standard',/.test(WIZARD),
    'the Run + Ride + Strength card no longer seeds the Standard Focus goal and focus');
  assert(/standard: \['run_ride_strength'\], run: \['run_strength', 'run_half_strength'\], ride: \['ride_strength'\]/.test(WIZARD),
    'the program lists changed');
  assert(/standard: 'programs', run: 'programs', ride: 'programs'/.test(WIZARD), 'a section no longer opens its list');
});

Deno.test('⛔ THE SAMPLE WEEK FOLLOWS THE NUMBERS ANSWER (Michael, off his phone 2026-09-13)', () => {
  // Build this plan? rebuilds a sample week built from older answers; Your week rebuilds on the numbers answer.
  assert(/previewBuiltFrom\.current !== JSON\.stringify\(payloadNow\(\)\)/.test(WIZARD),
    'Build this plan? can show a sample week built before the numbers were answered');
  assert(/state\.runClubIntensity, state\.trainingDays,[\s\S]{0,120}state\.numbersChoice,/.test(WIZARD),
    'Your week no longer rebuilds when the numbers answer changes');
});
