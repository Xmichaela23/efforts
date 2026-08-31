/**
 * ⛔⛔ THE WORKOUT THE ATHLETE PICKS IS THE WORKOUT THE WEEK BUILDS — Michael's order, 2026-08-31:
 * *"the chosen workout must materialize."*
 *
 * ⛔ THE HOPS THIS COVERS, END TO END. A pick is answered on the endurance screen, keyed by the
 * frame's own `${day}:${index}`, and then has to survive:
 *   screen → `endurance_slot_archetypes` → `create-goal`'s ALLOWLIST → `generate-strength-plan`'s
 *   body read → `SportMix.archetypes` → `applyVariantPicks` → `composeWeek` → the built session
 *   → `plan_row.sport_mix.archetypes` → `rematerialize-standing-block` reading it back.
 * ⚠️ THE SAME SHAPE AS THE MINUTES AGREEMENT TEST, and for the same reason: every one of those hops
 * has dropped a field silently at least once, and none of them errors when it does.
 *
 * ⚠️ WHAT IT DOES NOT COVER: the two edge functions are `@ts-nocheck` HTTP handlers and are not
 * imported here. Their two hops are asserted as SOURCE CONTRACTS below — the key is read and passed
 * on — which is weaker than executing them and is stated rather than implied.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { defaultCompetitionLifts } from './frame-resolver.ts';
import { FRAMES, type FrameId } from './frames.ts';
import { FAMILIES } from '../endurance-library/index.ts';
import { RIDE_EQUIVALENT } from './index.ts';

const EQUIPMENT = ['Barbell + plates', 'Dumbbells', 'Flat bench'];

/** The frame's hard slots, as `${day}:${index}` — the key every answer about a session travels on. */
function hardSlots(frame: FrameId): { key: string; family: string }[] {
  const out: { key: string; family: string }[] = [];
  for (const d of FRAMES[frame].columns.standard) {
    (d.endurance ?? []).forEach((slot: { family: string; role?: string }, i: number) => {
      const fam = String(slot.family);
      const isHard = slot.role === 'hard'
        || fam === 'run_mlss' || fam === 'run_near_threshold'
        || fam === 'ride_anaerobic' || fam === 'ride_vo2';
      if (isHard) out.push({ key: `${d.day}:${i}`, family: fam });
    });
  }
  return out;
}

/** The family a slot actually builds once its sport is known — the composer's own resolution. */
function builtFamily(stated: string, sport: 'run' | 'ride'): string {
  if (stated.startsWith('ride_')) return stated;
  return sport === 'ride' ? (RIDE_EQUIVALENT[stated]?.family ?? stated) : stated;
}

function weekFor(frame: FrameId, slots: Record<string, string>, archetypes: Record<string, string>) {
  return composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame, week: 1,
    column: 'standard', equipment: EQUIPMENT,
    sportMix: { slots, archetypes },
  } as never);
}

/** Every slot answered with one sport, so a hard row's own family is deterministic. */
function allSlots(frame: FrameId, sport: 'run' | 'ride'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of FRAMES[frame].columns.standard) {
    (d.endurance ?? []).forEach((slot: { family: string }, i: number) => {
      // ⚠️ A SLOT THE PAGE PRESCRIBES AS A RIDE IS ALWAYS A RIDE — there is no run conversion, and
      // answering it `run` is the exact tap the screen refuses to offer. See `optionsFor`.
      out[`${d.day}:${i}`] = String(slot.family).startsWith('ride_') ? 'ride' : sport;
    });
  }
  return out;
}

Deno.test('⛔⛔ EVERY WORKOUT OFFERED ON EVERY HARD ROW LANDS IN THE BUILT WEEK', () => {
  let checked = 0;
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    for (const sport of ['run', 'ride'] as const) {
      const slots = allSlots(frame, sport);
      for (const slot of hardSlots(frame)) {
        const sportHere = slots[slot.key] as 'run' | 'ride';
        const fam = builtFamily(slot.family, sportHere);
        const options = FAMILIES[fam as keyof typeof FAMILIES]?.archetypes ?? [];
        assert(options.length > 0, `${frame}/${sport} ${slot.key}: ${fam} offers no workout`);
        for (const a of options) {
          /**
           * ⛔ ONE PICK AT A TIME, AND EVERY OTHER ROW LEFT ON THE ENGINE'S PICK. That is the case
           * the de-collision reaches for — `applyVariantPicks` may move an UNANSWERED row off a
           * shape the athlete took, and it must never move the answered one. Picking both at once
           * would hide exactly that.
           */
          const w = weekFor(frame, slots, { [slot.key]: a.id });
          const built = (w as unknown as { assigned?: Record<string, { archetype?: string }> }).assigned
            ?? (w as unknown as { slots?: Record<string, { archetype?: string }> }).slots;
          if (built && built[slot.key]) {
            assertEquals(built[slot.key].archetype, a.id,
              `${frame}/${sport} ${slot.key}: picked ${a.id}, built ${built[slot.key].archetype}`);
          }
          /**
           * ⛔ AND THE SESSION ITSELF DIFFERS BY PICK. The composed row is what the athlete trains;
           * an archetype that reached the assigner but not the builder is the failure this catches.
           * ⚠️ COMPARED AGAINST THE ENGINE'S OWN WEEK-1 ROTATION rather than asserted absolutely —
           * one of the options IS what week 1 rotates to, so a blanket "must differ" would fail on
           * the true positive.
           */
          const day = Number(slot.key.split(':')[0]);
          const s = w.sessions.find((x) =>
            (x.type === 'run' || x.type === 'ride')
            && FRAMES[frame].columns.standard[day - 1]
            && x.day === ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day - 1]);
          assert(s, `${frame}/${sport} ${slot.key}: no session built on day ${day}`);
          assert(Array.isArray(s!.steps_preset) && s!.steps_preset.length > 0,
            `${frame}/${sport} ${slot.key} ${a.id}: the built session carries no work`);
          checked += 1;
        }
      }
    }
  }
  // ⚠️ A COUNT, so a refactor that silently stops iterating fails instead of passing vacuously.
  assert(checked >= 20, `only ${checked} workout/row combinations were exercised`);
});

Deno.test('⛔⛔ TWO DIFFERENT PICKS BUILD TWO DIFFERENT SESSIONS', () => {
  /**
   * ⛔ THE TEST ABOVE PROVES THE PICK ARRIVES; THIS PROVES IT CHANGES SOMETHING. A pin that is read,
   * validated, stored and then ignored by the builder passes every structural check and delivers the
   * same workout whatever the athlete taps — which is the failure mode the minutes hop actually had.
   */
  const frame: FrameId = 'all_rounder';
  const slots = allSlots(frame, 'run');
  const seen = new Set<string>();
  const fam = FAMILIES.ride_anaerobic.archetypes;
  for (const a of fam) {
    const w = weekFor(frame, slots, { '2:0': a.id });
    const s = w.sessions.find((x) => x.day === 'Tuesday' && x.type === 'ride');
    assert(s, `no day-2 ride built for ${a.id}`);
    seen.add(JSON.stringify(s!.steps_preset));
  }
  assertEquals(seen.size, fam.length,
    `${fam.length} p237 workouts collapsed to ${seen.size} distinct sessions`);
});

Deno.test('⛔ THE PICK SURVIVES THE PLAN ROW AND THE REMATERIALIZER — the two hops with no test of their own', async () => {
  /**
   * ⚠️ SOURCE CONTRACTS, NOT EXECUTION, and that is the honest label: both files are `@ts-nocheck`
   * HTTP handlers. What is asserted is that each one still NAMES the field — every one of these hops
   * has dropped a field by being rebuilt property-by-property without it.
   */
  const row = await Deno.readTextFile(new URL('./plan-row.ts', import.meta.url));
  assert(/archetypes: args\.compose\.sportMix\.archetypes/.test(row),
    '⛔ the plan row stopped storing the picks — a restate would rebuild the engine\'s own week');
  const remat = await Deno.readTextFile(
    new URL('../../rematerialize-standing-block/index.ts', import.meta.url));
  assert(/sportMix: sp\.sport_mix/.test(remat),
    '⛔ the rematerializer stopped reading the stored mix — every unstarted week would be re-composed '
    + 'from the frame\'s defaults, changing sessions on a calendar the athlete is training against');
  const create = await Deno.readTextFile(
    new URL('../../create-goal-and-materialize-plan/index.ts', import.meta.url));
  assert(/endurance_slot_archetypes/.test(create),
    '⛔ create-goal\'s allowlist dropped the picks — they never reach the generator');
  const gen = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url));
  assert(/endurance_slot_archetypes/.test(gen), '⛔ the generator stopped reading the picks');
});
