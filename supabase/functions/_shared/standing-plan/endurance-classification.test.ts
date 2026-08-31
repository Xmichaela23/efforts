/**
 * ⛔⛔ EVERY ENDURANCE SESSION CARRIES THE SOURCE'S OWN NAME FOR IT — Michael's order, 2026-08-31.
 * See `ENDURANCE_CLASS` for the table, for what is his and what is ours, and for the one part of the
 * order that is NOT built because the corpus contradicts its premise.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { defaultCompetitionLifts } from './frame-resolver.ts';
import { FRAMES, type FrameId } from './frames.ts';
import { ENDURANCE_CLASS, classToken, FAMILIES } from '../endurance-library/index.ts';

Deno.test('⛔ EVERY FAMILY IN THE LIBRARY HAS A CLASSIFICATION — none falls through', () => {
  /**
   * ⚠️ KEYED OFF `FAMILIES`, NOT OFF A LIST WRITTEN HERE. A family added to the library with no
   * classification fails here rather than shipping sessions that carry a tag nobody wrote.
   */
  for (const family of Object.keys(FAMILIES)) {
    const k = ENDURANCE_CLASS[family as keyof typeof ENDURANCE_CLASS];
    assert(k, `${family} has no classification`);
    assert(k.his.length > 0 && k.abbrev.length > 0, `${family}: empty name`);
    assert(/^Viada p/.test(k.cite), `${family}: the classification is not cited to a page`);
    assert(k.basis.length > 0, `${family}: no stated basis for its band`);
  }
});

Deno.test("⛔⛔ THE ABBREVIATION IS THE ONE HIS PROGRAMME TABLE PRINTS — checked against the frames", () => {
  /**
   * ⛔ THE STRONGEST EVIDENCE AVAILABLE WITHOUT THE BOOK IN HAND: `EnduranceSlot.sourceText` is the
   * cell transcribed from p246 / p274 verbatim, so if this table's short form is really his, it
   * appears in the cell his own page prints for that family. **This is what stops the abbreviations
   * being ours wearing his authority.**
   * ⚠️ CASE-INSENSITIVE and substring — the cell adds the level (`MLSS+ (level 2)`) and sometimes a
   * count (`1 x MLSS+ (level 2)`).
   */
  let checked = 0;
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    for (const column of ['standard', 'taper'] as const) {
      for (const d of FRAMES[frame].columns[column]) {
        for (const slot of d.endurance ?? []) {
          const abbrev = ENDURANCE_CLASS[slot.family].abbrev;
          assert(
            slot.sourceText.toLowerCase().includes(abbrev.toLowerCase()),
            `${frame}/${column} day ${d.day}: the page prints "${slot.sourceText}" and the `
            + `classification calls ${slot.family} "${abbrev}"`,
          );
          checked += 1;
        }
      }
    }
  }
  assert(checked >= 12, `only ${checked} printed cells were checked`);
});

Deno.test('⛔⛔ THE BUILT WEEK CARRIES IT — every endurance session, both frames, both columns', () => {
  const bands = new Set<string>();
  let sessions = 0;
  for (const frame of ['strength_5k', 'all_rounder'] as const) {
    for (const column of ['standard', 'taper'] as const) {
      const w = composeWeek({
        competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: frame as FrameId, week: 1,
        column, equipment: ['Barbell + plates', 'Dumbbells', 'Flat bench'],
      } as never);
      for (const s of w.sessions) {
        if (s.type !== 'run' && s.type !== 'ride' && s.type !== 'swim') continue;
        const fam = (s.tags ?? []).find((t) => t.startsWith('family:'))?.slice('family:'.length);
        assert(fam, `${frame}/${column} ${s.day}: a built session carries no family tag`);
        const intensity = (s.tags ?? []).find((t) => t.startsWith('intensity:'));
        const band = (s.tags ?? []).find((t) => t.startsWith('band:'));
        assert(intensity, `${frame}/${column} ${s.day} (${fam}): no intensity tag`);
        assert(band, `${frame}/${column} ${s.day} (${fam}): no band tag`);
        // ⛔ AND IT IS THE RIGHT ONE — a tag that is present but wrong is worse than one that is absent.
        assertEquals(intensity, `intensity:${classToken(fam as never)}`,
          `${frame}/${column} ${s.day}: ${fam} is tagged ${intensity}`);
        assertEquals(band, `band:${ENDURANCE_CLASS[fam as never].band}`);
        bands.add(band!);
        sessions += 1;
      }
    }
  }
  assert(sessions >= 12, `only ${sessions} endurance sessions were built`);
  /**
   * ⛔ AND THE AXIS ACTUALLY SEPARATES THESE WEEKS. A classification where every session lands in one
   * bucket is a column of one value — it would pass every check above and tell a shuffler nothing.
   */
  assert(bands.size >= 3, `the two frames' weeks use only ${bands.size} bands: ${[...bands].join(', ')}`);
});

Deno.test('⚠️ THE CYCLING PERCENTAGES ARE LABELLED INFERRED, AS THE CORPUS REQUIRES', () => {
  /**
   * ⚠️ *"the book's cycling opener (p236) states NO equivalent convention… It is not a captured
   * statement. Label it as inferred wherever it is used."* Every ride family's band is read off a
   * percentage, so every ride family carries the label; running's basis IS stated (p229) and must
   * not carry it, or the label stops meaning anything.
   */
  for (const [family, k] of Object.entries(ENDURANCE_CLASS)) {
    if (family.startsWith('ride_')) {
      assert(k.percentBasisInferred, `${family}: the inferred percentage basis is not labelled`);
    }
    if (family.startsWith('run_')) {
      assert(!k.percentBasisInferred, `${family}: running's basis is stated on p229, not inferred`);
    }
  }
});
