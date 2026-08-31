// ============================================================================
// ⛔⛔ THE SOURCE'S OWN NAME FOR EVERY SESSION TYPE, AND WHERE IT SITS RELATIVE TO THRESHOLD.
//
// Michael's order, 2026-08-31: *"each endurance session carries the book's own intensity
// classification — speed, threshold, MLSS+, NT, anaerobic, LSD, VT1, as he prints them — stored so
// schedule shuffling can apply his placement rules."*
//
// ⛔ THE QUESTION THIS ANSWERS THAT `FamilyId` DOES NOT. The family id is the app's key and the
// family's `label` is the FIELD's plain word for it — deliberately, and in one case deliberately
// NOT the book's ("Above threshold" for `run_mlss`, because "maximal lactate steady state" collided
// with the plan's own word for a different session). Neither is his printed vocabulary, and a
// shuffler that wants to reason about a week in HIS terms has nothing to read. **This is a second
// accessor over the existing vocabulary, not a second taxonomy** — no new ids, no new families, and
// every row keyed by the `FamilyId` that already exists.
//
// ⛔⛔ AND ONE THING IN THAT ORDER IS FALSE ON THE CORPUS'S OWN RECORD, so it is not built here.
// The stated purpose — *"so schedule shuffling can apply his placement rules (what sits next to
// which lifting day)"* — attributes adjacency rules to pp.139-145. `SOURCE-viada-hybrid-athlete.md`
// §C2 records the opposite, and records that it was checked deliberately:
//
//   *"THEY GOVERN ORDER WITHIN A SESSION, NOT WHICH SESSIONS MAY SIT ON ADJACENT DAYS. Nothing in
//    pp.130-131 or pp.139-145 forbids two session types from being adjacent in the week. That was
//    checked deliberately; it is absent, not missed."*
//
// **So there is no printed table of "this may not follow that" to encode, and inventing one would be
// exactly the extrapolation this app has ruled out.** What the pages DO give, and what a shuffler
// can act on, is: keystone sessions must be preceded by the recovery state they specifically require
// (p131), consolidation is about what each session REQUIRES rather than what it fatigues (p130), and
// p247 prices a hard run the day before heavy legs at 3-4% off the squat and deadlift. Those need
// this classification to be readable; they are not encoded here, and no placement decision is taken
// in this file.
// ============================================================================
import type { FamilyId } from './types.ts';

/**
 * ⛔ WHERE THE SESSION SITS RELATIVE TO THRESHOLD — **OURS, DERIVED FROM HIS OWN PRINTED BANDS.**
 * Four buckets over ten families is a grouping the book does not print, so it is labelled ours; what
 * puts each family in its bucket is the page's own numbers, quoted per row below.
 *
 * ⚠️ THE ONE HE DOES PRINT IS COARSER AND DOES NOT COVER THESE TEN. p109's weekly floor is *"one
 * speed, one subthreshold, remainder VT1 or below"* — three buckets, and MLSS, anaerobic and VO2 all
 * sit above threshold rather than in any of them. Forcing ten families into three would have been an
 * invention wearing his page number, so p109 is cited as the reason this axis exists and not as its
 * vocabulary.
 */
export type ThresholdBand = 'above' | 'near' | 'below' | 'vt1_or_easier';

export type EnduranceClass = {
  /** ⛔ HIS OWN SECTION HEADING for this session type, Part D of the corpus. */
  his: string;
  /** ⛔ THE SHORT FORM HE USES IN THE PROGRAMME TABLES — `MLSS+`, `NT`, `Cyc AnA`, `LSD`. */
  abbrev: string;
  /** ⚠️ OURS — see `ThresholdBand`. The evidence is the band quoted in `basis`. */
  band: ThresholdBand;
  /** The page's own numbers that put it in that band. */
  basis: string;
  cite: string;
  /**
   * ⚠️ CYCLING PERCENTAGES ARE AN INFERENCE, and the corpus says to label it wherever it is used:
   * *"the book's cycling opener (p236) states NO equivalent convention… It is not a captured
   * statement."* Running's basis is stated on p229; cycling's is read as percent of threshold power.
   */
  percentBasisInferred?: true;
};

export const ENDURANCE_CLASS: Record<FamilyId, EnduranceClass> = {
  // ── running, pp229-235 ────────────────────────────────────────────────────────────────────────
  run_sprint_power: {
    his: 'Sprint / Power', abbrev: 'speed', band: 'above',
    basis: 'faster than vVO2; "all-out" is the best possible speed for the day',
    cite: 'Viada pp229-231',
  },
  run_mlss: {
    his: 'Maximal lactate steady state', abbrev: 'MLSS+', band: 'above',
    basis: 'time in zone 4; level-1 work is prescribed at 100-130%',
    cite: 'Viada pp231-232',
  },
  run_near_threshold: {
    his: 'Near-threshold', abbrev: 'NT', band: 'near',
    basis: '"whether shorter above-threshold intervals or longer below-threshold ones" — 85-105%',
    cite: 'Viada pp233-234',
  },
  run_vt1: {
    his: 'VT1', abbrev: 'VT1', band: 'vt1_or_easier',
    basis: 'any workout at or below VT1; the level refers almost strictly to duration',
    cite: 'Viada p235',
  },
  run_lsd: {
    his: 'Long slow distance', abbrev: 'LSD', band: 'vt1_or_easier',
    basis: 'may combine zones but is primarily below VT1',
    cite: 'Viada p235',
  },
  // ── cycling, pp236-239 — percentage basis inferred, see the type ──────────────────────────────
  ride_sprints: {
    his: 'Sprints', abbrev: 'Cyc sprints', band: 'above',
    basis: 'max-effort sprints and flying surges to max effort',
    cite: 'Viada p236', percentBasisInferred: true,
  },
  ride_anaerobic: {
    his: 'Anaerobic', abbrev: 'Cyc AnA', band: 'above',
    basis: 'anaerobic repeatability; work at 110-115%+ progressing to 125-130%',
    cite: 'Viada p237', percentBasisInferred: true,
  },
  ride_vo2: {
    his: 'VO2', abbrev: 'Cyc VO2', band: 'above',
    basis: '110-120%, "more metabolically taxing than the anaerobic work"',
    cite: 'Viada p238', percentBasisInferred: true,
  },
  ride_sweet_spot: {
    his: 'Sweet spot', abbrev: 'Cyc sweet spot', band: 'below',
    basis: '"as close to threshold as possible without exceeding it" — 80-95%',
    cite: 'Viada pp238-239', percentBasisInferred: true,
  },
  ride_endurance: {
    his: 'Endurance', abbrev: 'Cyc endurance', band: 'vt1_or_easier',
    basis: 'easy riding below 75%, or endurance carrying some tempo work',
    cite: 'Viada p239', percentBasisInferred: true,
  },
  // ── swim, pp240-241 ───────────────────────────────────────────────────────────────────────────
  /**
   * ⚠️ THE SWIM PAGES CLASSIFY BY EMPHASIS, NOT BY A PERCENTAGE — *"the emphasis is duration"*, with
   * three examples per level named endurance, speed and open water. There is no threshold band on
   * the page, so the band here is read off that emphasis and nothing finer is claimed.
   */
  swim_endurance: {
    his: 'Endurance swim', abbrev: 'Swim endurance', band: 'vt1_or_easier',
    basis: '"easy-to-moderate (race pace)" repeats; the emphasis is duration',
    cite: 'Viada pp240-241',
  },
  swim_speed: {
    his: 'Speed swim', abbrev: 'Swim speed', band: 'above',
    basis: 'sprint repeats and 25-easy/25-moderate/25-hard/25-all-out ladders',
    cite: 'Viada pp240-241',
  },
  swim_open_water: {
    his: 'Open-water swim', abbrev: 'Swim open water', band: 'vt1_or_easier',
    basis: 'sighting and orientation work; straight distance out and back',
    cite: 'Viada pp240-241',
  },
};

/**
 * ⛔ THE TAG TOKEN — lower-case, spaces to underscores, so a tag is one word and a reader can match
 * on it. The human-readable form stays in `ENDURANCE_CLASS`; nothing parses the token back into
 * prose. ⚠️ `MLSS+` keeps its plus as `mlss+`: it is his abbreviation, not a typo, and stripping it
 * would make the token indistinguishable from a plain MLSS that the book does not prescribe here.
 */
export function classToken(family: FamilyId): string {
  return ENDURANCE_CLASS[family].abbrev.toLowerCase().replace(/\s+/g, '_');
}
