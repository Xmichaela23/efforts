/**
 * Run: ~/.deno/bin/deno test --no-check --no-lock supabase/functions/_shared/intent-title.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { intentTitle, spelledIntentTitle } from './intent-title.ts';

Deno.test('every day label the frames mint', () => {
  assertEquals(intentTitle('ME: Upper'), 'Maximum Effort: Upper');
  assertEquals(intentTitle('ME: Lower'), 'Maximum Effort: Lower');
  assertEquals(intentTitle('DE: Upper'), 'Dynamic Effort: Upper');
  assertEquals(intentTitle('DE: Lower'), 'Dynamic Effort: Lower');
  assertEquals(intentTitle('DE: Full'), 'Dynamic Effort: Full');
  assertEquals(intentTitle('Test: Upper'), 'Test: Upper');
  assertEquals(intentTitle('Upper body: Push'), 'Upper body: Push');
});

Deno.test('the other intents the page names, the prefix, and names it does not own', () => {
  assertEquals(intentTitle('HYP: Upper'), 'Hypertrophy: Upper');
  assertEquals(intentTitle('SKILL: Lower'), 'Skill: Lower');
  assertEquals(intentTitle('Strength — ME: Upper'), 'Strength — Maximum Effort: Upper');
  assertEquals(intentTitle('Strength - DE: Lower'), 'Strength - Dynamic Effort: Lower');
  assertEquals(intentTitle('Easy run'), 'Easy run');
  assertEquals(intentTitle('MEDIUM: x'), 'MEDIUM: x');
  assertEquals(intentTitle(null), '');
  assertEquals(intentTitle(intentTitle('ME: Upper')), 'Maximum Effort: Upper');
});

Deno.test('the spelled form, for the weekly lifting card', () => {
  assertEquals(spelledIntentTitle('ME: Upper'), 'Maximum Effort day, upper body');
  assertEquals(spelledIntentTitle('Strength — DE: Lower'), 'Dynamic Effort day, lower body');
  assertEquals(spelledIntentTitle('Test: Lower'), 'Test day, lower body');
  assertEquals(spelledIntentTitle('DE: Full'), 'Dynamic Effort: Full');
  assertEquals(spelledIntentTitle('Upper body: Push'), 'Upper body: Push');
});
