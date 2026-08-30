/**
 * ⛔⛔ THE FOCUS HAS TO SURVIVE EVERY HOP, and this file is the guard (2026-08-30).
 *
 * Standard Focus builds the All Rounder (p274-275); Strength Focus builds Strength + 5K (p246-247).
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
  assert(/setState\(\(st\) => \(\{ \.\.\.st, focus: focusOfCard \}\)\)/.test(WIZARD),
    'the Train card no longer records which focus was picked');
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
  assert(/\(body as Record<string, unknown>\)\.focus/.test(GENERATE),
    'generate-strength-plan no longer reads the focus off its body');
  assert(/enduranceSport: sport, focus/.test(GENERATE),
    'the focus never reaches resolveFrame — every athlete gets the 5K frame');
});

Deno.test('⛔ THE RESOLVER STILL DEFAULTS TO THE 5K FRAME', () => {
  /**
   * ⚠️ THIS IS THE ASSERTION THAT KEEPS THE EXISTING PATH SAFE. Absent must mean `strength_5k` —
   * every caller written before the card exists sends no focus at all, and a default of
   * `all_rounder` would move every one of them onto a different programme mid-flight.
   */
  assert(/focus\?: 'standard' \| 'run';/.test(RESOLVER),
    'the resolver no longer takes an optional focus');
  assert(/position\.focus === 'standard' \? 'all_rounder' : 'strength_5k'/.test(RESOLVER),
    'the resolver default is no longer the 5K frame');
});
