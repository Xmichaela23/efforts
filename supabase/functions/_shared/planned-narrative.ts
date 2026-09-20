/**
 * ⛔ TODAY'S NARRATIVE FOR A HARD RUN OR RIDE (2026-09-20, Michael: "a narrative of what each one is … 3:00 at xx
 * pace, 2:00 at XX pace type thing"; "No there are. Just a clean narrative"; "this is just for a today effort read").
 *
 * pp231–239 print no words for any single workout: one purpose paragraph per session type (`family-lines.ts`), then
 * each workout is a column of numbers ("3 minutes @ 120%", "2 minutes @ 60%" …). The narrative is that column said
 * in order, with the athlete's own pace or watts where the page prints a percentage, and the page's own word for a
 * rest where it gives one (`endurance-library/step-words.ts`, carried on the step as `page_label`).
 *
 * materialize-plan stamps it as `computed.narrative` beside `computed.step_lines`, off the same steps and grouped by
 * the same `groupAt` / `setBlockAt`, so the narrative and the list under it in the session sheet cannot disagree.
 * get-week passes it through; Today's card prints it above the type's purpose line. The session sheet, the week view
 * and the Garmin and Intervals.icu sends keep the step list and do not print it.
 *
 * ⛔ A SESSION THIS FILE CANNOT READ IN FULL GETS NO NARRATIVE. A step with no length, or a work step with no pace,
 * heart rate or watts and no page word, returns null for the whole session — Today then shows the purpose line
 * alone, as it did before. Nothing is guessed. ⚠️ The progressive repeats' sentence names no watts (the rise is the
 * purpose line's second sentence), so it reads the same for an athlete with no FTP on file — seen on a throwaway
 * plan with nothing on file, 2026-09-20.
 *
 * The sentence shapes (Michael approved the words 2026-09-20):
 *   2 sets of 4 rounds: 15 seconds at 5:39–5:53/mi, 45 seconds at 7:00–7:18/mi, then 1 minute at 10:56–12:22/mi. 2-minute recovery walk or jog between sets.
 *   5 rounds: 30 seconds at 252–273 W, 2:30 at 189 W and up, 30 seconds at 252–273 W, then a 4-minute easy spin.
 *   8 rounds: 5 minutes at 8:10–8:30/mi, then 1:30 at 10:56–12:22/mi.
 *   3 rounds of 8 minutes at 170–189 W, with a 4-minute easy spin after each.
 *   2 sets. Set 1: 3:00, 2:00, 1:00, 45 seconds and 30 seconds at 7:11–8:47/mi. After each one: 2:00, 1:20, 40 seconds, 30 seconds and 20 seconds at 14:22–17:34/mi. Then 2:00 at 10:56–12:22/mi. Set 2 repeats set 1 from the 2:00 effort.
 *     (the ladder, reworded the same day: Michael threw out "The same two paces for each pair after that" as invented
 *      language and asked how many sets there were; the count now leads, in the list's own "Set 1" / "Set 2")
 *   8 repeats of 45 seconds, with 5 minutes of recovery between them.
 *   3 sets of 6 minutes at 170–189 W, with 10 seconds at 199–210 W every minute on the minute. 3-minute easy spin after each set.
 *   3 max-effort sprints of 2:30, each one aiming to beat the last. 5:30 of recovery between them.
 *   8 flying 30-second surges to max effort, with 2:30 of recovery between them.
 */
import {
  groupAt, setBlockAt, sigOf, isWarmup, isCooldown, isRecovery, paceText, powerText, hrText, pageWords,
  type PlannedStep, type StepLineOptions,
} from './planned-step-lines.ts';
import { stepWordFor } from './endurance-library/step-words.ts';

export type NarrativeOptions = StepLineOptions & {
  /** The row's `archetype:<id>` tag — the five workouts whose sentence is their own are picked by it. */
  archetype?: string | null;
  /** The row's `level:<n>` tag — with the family and archetype, it finds the page's word for a rest in the round. */
  level?: number | null;
};

/** The session types whose workouts Michael approved a narrative for (2026-09-20): the hard runs and rides. */
export const NARRATED_FAMILIES: ReadonlySet<string> = new Set([
  'run_mlss', 'run_near_threshold', 'ride_anaerobic', 'ride_vo2', 'ride_sweet_spot', 'ride_sprints',
]);

// OURS — a guard on when to say nothing, not a training number (`MAX_ROUND_STEPS`, ledger row in docs/STATE-SOURCES.md).
// The longest round on pp231–239 is five steps (p233's threshold with a surge). A longer "round" is the grouping not
// finding the page's sets (level 3's three full ladders, p237 level 3's nested sets — no plan in
// `standing-plan/frames.ts` prescribes either), and said aloud it is a paragraph. Such a session gets no narrative.
const MAX_ROUND_STEPS = 6;

const secondsOf = (s: PlannedStep): number => Math.round(Number(s?.seconds) || 0);

/** "3:00", "1:20". */
function clock(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** "15 seconds", "1 minute", "5 minutes", "2:30" — a length as it is said aloud. */
function sayTime(sec: number): string {
  if (sec < 60) return `${sec} ${sec === 1 ? 'second' : 'seconds'}`;
  if (sec % 60 === 0 && sec < 3600) return `${sec / 60} ${sec === 60 ? 'minute' : 'minutes'}`;
  return clock(sec);
}

/** "30-second", "4-minute" — or null for a length that is not whole seconds under a minute or whole minutes. */
function sayTimeBefore(sec: number): string | null {
  if (sec < 60) return `${sec}-second`;
  if (sec % 60 === 0 && sec < 3600) return `${sec / 60}-minute`;
  return null;
}

/** The ladder's form: "3:00" from a minute up, "45 seconds" under one. */
const ladderTime = (sec: number): string => (sec < 60 ? `${sec} seconds` : clock(sec));

/** The page writes "walk/jog"; said aloud that is "walk or jog". */
const sayWords = (w: string): string => w.replace(/\s*\/\s*/g, ' or ');

const article = (phrase: string): string => (/^(8|11|18)(\D|$)/.test(phrase) ? 'an' : 'a');

/** "at 7:11–8:47/mi", "at HR 138–144", "at 252–273 W" — the number the list prints first for the step. */
function target(s: PlannedStep, opts: NarrativeOptions): string | null {
  const hr = hrText(s), pace = paceText(s, opts), pow = powerText(s);
  if (hr) return `at ${hr}`;
  if (pace) return `at ${pace}`;
  if (pow) return /^under /i.test(pow) ? pow : `at ${pow}`;
  return null;
}

/** A rest in the page's word: "a 4-minute easy spin", "5 minutes of recovery", "1:30 of easy spin". */
function restInWords(sec: number, words: string, place: 'start' | 'mid'): string {
  const w = sayWords(words);
  const before = sayTimeBefore(sec);
  // "recovery" is not counted ("5 minutes of recovery"); a walk, a jog, a spin and a rest are ("a 4-minute easy spin").
  if (/recovery$/i.test(w) || !before) return `${sayTime(sec)} of ${w}`;
  return place === 'mid' ? `${article(before)} ${before} ${w}` : `${before} ${w}`;
}

/** One step, said: its length, then its pace or watts, or the page's word for it. Null when it cannot be read. */
function stepPhrase(s: PlannedStep, opts: NarrativeOptions, place: 'start' | 'mid'): string | null {
  const sec = secondsOf(s);
  if (!(sec > 0)) return null;
  const words = pageWords(s);
  // A rest the page names in words carries no pace or watts (`planned-step-lines.ts stepText`): the words are it.
  if (isRecovery(s) && words) return restInWords(sec, words, place);
  const t = target(s, opts);
  if (t) return words ? `${sayTime(sec)} ${t} ${sayWords(words)}` : `${sayTime(sec)} ${t}`;
  if (words) return `${sayTime(sec)} ${sayWords(words)}`;
  // A work step with no number and no word cannot be said.
  if (!isRecovery(s)) return null;
  // ⛔ A REST IN THE ROUND THAT REACHED THE STEP WITH NO WORD takes the page's own (`step-words.ts` `inRound`). p237's
  // "4-minute easy spin" closes each Surge, Sustain, Surge round; the token builds it as the rest between rounds, which
  // the word table keys differently, so the step arrives bare. Never the between-sets word: that is another rest.
  const inRound = place === 'mid' ? stepWordFor(opts.family, opts.archetype, opts.level, 'inRound') : null;
  return inRound ? restInWords(sec, inRound, place) : sayTime(sec);
}

/** "15 seconds at A, 45 seconds at B, then 1 minute at C". */
function roundPhrase(unit: PlannedStep[], opts: NarrativeOptions): string | null {
  const parts = unit.map((s) => stepPhrase(s, opts, 'mid'));
  if (parts.some((p) => !p)) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')}, then ${parts[parts.length - 1]}`;
}

const sentence = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;

type Ladder = { work: PlannedStep[]; rec: PlannedStep[] };

/**
 * p231–232's descending ladder, in the session sheet's own shape (`planned-step-lines.ts setBlockAt`): the efforts
 * and their pace, then what follows each one and its pace. Level 2 leads with the count of sets and names the second
 * by the effort it starts from (p232: "followed by a second round from the 2 minutes @ 120% interval").
 */
function ladderNarrative(blocks: Ladder[], seps: PlannedStep[], opts: NarrativeOptions): string | null {
  const first = blocks[0];
  const w0 = first.work[0], r0 = first.rec[0];
  const wPace = paceText(w0, opts), rPace = paceText(r0, opts);
  if (!wPace || !rPace || hrText(w0) || hrText(r0)) return null;
  if ([...first.work, ...first.rec].some((st) => !(secondsOf(st) > 0))) return null;
  // "3:00, 2:00, 1:00, 45 seconds and 30 seconds"
  const listed = (steps: PlannedStep[]): string => {
    const t = steps.map((st) => ladderTime(secondsOf(st)));
    return t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}` : t[0];
  };
  const efforts = `${listed(first.work)} at ${wPace}.`;
  const after = `After each one: ${listed(first.rec)} at ${rPace}.`;
  // Level 1: one set, and no set words.
  if (blocks.length === 1) return `${efforts} ${after}`;
  if (seps.length !== blocks.length - 1) return null;
  const sep = seps[0];
  const sepWords = pageWords(sep);
  const sepText = sepWords ? restInWords(secondsOf(sep), sepWords, 'mid') : (() => {
    const p = paceText(sep, opts);
    return p && !hrText(sep) ? `${ladderTime(secondsOf(sep))} at ${p}` : stepPhrase(sep, opts, 'mid');
  })();
  if (!sepText) return null;
  // Level 2: one more set, the first set's own rungs from partway down. ⚠️ Level 3's three equal sets have no
  // approved sentence and no plan prescribes them (`standing-plan/frames.ts` builds this run at levels 1 and 2); the
  // list groups them as one long repeat, which `MAX_ROUND_STEPS` leaves unsaid.
  const lengths = (b: Ladder) => b.work.map(secondsOf).join(',');
  const second = blocks[1];
  const tail = first.work.map(secondsOf).slice(first.work.length - second.work.length).join(',');
  if (blocks.length !== 2 || second.work.length >= first.work.length || tail !== lengths(second)) return null;
  return `2 sets. Set 1: ${efforts} ${after} Then ${sepText}. Set 2 repeats set 1 from the ${ladderTime(secondsOf(second.work[0]))} effort.`;
}

/** The work and rest steps of a main set whose every effort is one length and every rest another, or null. */
function evenRepeats(seg: PlannedStep[]): { n: number; work: PlannedStep; rest: PlannedStep | null } | null {
  const work = seg.filter((s) => !isRecovery(s));
  const rest = seg.filter((s) => isRecovery(s));
  if (work.length < 2) return null;
  if (new Set(work.map(secondsOf)).size !== 1 || !(secondsOf(work[0]) > 0)) return null;
  if (rest.length && (new Set(rest.map(secondsOf)).size !== 1 || !(secondsOf(rest[0]) > 0))) return null;
  // Effort, rest, effort, rest … in turn.
  for (let i = 0; i < seg.length; i++) if (isRecovery(seg[i]) !== (i % 2 === 1)) return null;
  return { n: work.length, work: work[0], rest: rest[0] ?? null };
}

/** The five workouts whose sentence is their own. Null hands the session to the general shapes. */
function ownShape(seg: PlannedStep[], opts: NarrativeOptions): string | null {
  const archetype = String(opts.archetype || '').toLowerCase();
  if (archetype === 'progressive_repeats') {
    // p237: "6 to 10 x 45 seconds @ 110–115% plus with 4- to 6-minute recovery between sets". The rise from 110% to
    // 125–130% is the purpose line's second sentence (`RIDE_ANAEROBIC_PROGRESSIVE_LINE`), printed under this one.
    const e = evenRepeats(seg);
    if (!e || !e.rest) return null;
    const words = pageWords(e.rest);
    const rest = words ? restInWords(secondsOf(e.rest), words, 'mid') : sayTime(secondsOf(e.rest));
    return `${e.n} repeats of ${sayTime(secondsOf(e.work))}, with ${rest} between them.`;
  }
  if (archetype === 'max_effort') {
    // p236: "3 max effort 2- to 3-minute sprints where you try to beat your last effort. 5 to 6 minutes of recovery
    // between sprints". "try" is on the app's banned-word list (`voiceViolation`), so the sentence says "aiming".
    const e = evenRepeats(seg);
    if (!e || !e.rest || target(e.work, opts)) return null;
    return `${e.n} max-effort sprints of ${sayTime(secondsOf(e.work))}, each one aiming to beat the last. ${sentence(`${sayTime(secondsOf(e.rest))} of recovery between them`)}`;
  }
  if (archetype === 'flying_surge') {
    // p236: "8 rounds of flying 30-second surges to max effort, with 2 to 3 minutes recovery between".
    const e = evenRepeats(seg);
    const before = e ? sayTimeBefore(secondsOf(e.work)) : null;
    if (!e || !e.rest || !before || target(e.work, opts)) return null;
    return `${e.n} flying ${before} surges to max effort, with ${sayTime(secondsOf(e.rest))} of recovery between them.`;
  }
  if (archetype === 'minute_surge') {
    // pp238–239: "3 sets of 6 minutes @ 90% with 10 seconds @ 105% every minute on the minute. 3-minute easy spin".
    const sig = seg.map((s) => sigOf(s, opts));
    const g = groupAt(seg, sig, 0, opts);
    if (g.covered < seg.length - 1 || g.sets < 2 || g.unitLen !== 2 || g.sepIdx < 0) return null;
    const [a, b] = [seg[0], seg[1]];
    if (isRecovery(a) || isRecovery(b) || secondsOf(a) + secondsOf(b) !== 60) return null;
    const surge = secondsOf(a) <= secondsOf(b) ? a : b;
    const base = surge === a ? b : a;
    const tBase = target(base, opts), tSurge = target(surge, opts);
    const sep = stepPhrase(seg[g.sepIdx], opts, 'start');
    if (!tBase || !tSurge || !sep) return null;
    return `${g.sets} sets of ${sayTime(g.rounds * 60)} ${tBase}, with ${sayTime(secondsOf(surge))} ${tSurge} every minute on the minute. ${sentence(`${sep} after each set`)}`;
  }
  return null;
}

/**
 * The narrative for a planned hard run or ride, or null. `steps` are the session's own `computed.steps`; the
 * warm-up and cool-down stay in the session sheet's list and are not said here.
 */
export function plannedNarrative(steps: PlannedStep[] | null | undefined, opts: NarrativeOptions = {}): string | null {
  const family = String(opts.family || '').toLowerCase();
  if (!NARRATED_FAMILIES.has(family)) return null;
  const all = Array.isArray(steps) ? steps.filter((s) => s && typeof s === 'object') : [];
  const first = all.findIndex((s) => !isWarmup(s) && !isCooldown(s));
  if (first < 0) return null;
  let end = first;
  while (end < all.length && !isWarmup(all[end]) && !isCooldown(all[end])) end++;
  // One main set between the warm-up and the cool-down; a session with two is not one of the page's hard workouts.
  if (all.slice(end).some((s) => !isWarmup(s) && !isCooldown(s))) return null;
  const seg = all.slice(first, end);
  if (seg.some((s) => !(secondsOf(s) > 0))) return null;

  const own = ownShape(seg, opts);
  if (own) return own;

  const sig = seg.map((s) => sigOf(s, opts));
  const out: string[] = [];
  const ladders: Ladder[] = [];
  const ladderSeps: PlannedStep[] = [];
  let k = 0;
  while (k < seg.length) {
    const g = groupAt(seg, sig, k, opts);
    if (g.covered === 1) {
      const block = setBlockAt(seg, k, opts);
      if (block) {
        ladders.push({ work: block.work, rec: block.rec });
        k += block.covered;
        if (k < seg.length && isRecovery(seg[k]) && setBlockAt(seg, k + 1, opts)) { ladderSeps.push(seg[k]); k++; }
        continue;
      }
      // A ladder is the whole main set or the session is not said: a lone step beside one has no approved words.
      if (ladders.length) return null;
      const one = stepPhrase(seg[k], opts, 'start');
      if (!one) return null;
      out.push(sentence(one));
      k += 1;
      continue;
    }
    if (ladders.length) return null;

    // `groupAt` reads N efforts with one rest between them as N "sets" of one round; said aloud they are N rounds.
    let sets = g.sets, rounds = g.rounds;
    let unit = seg.slice(k, k + g.unitLen);
    let sep: PlannedStep | null = g.sepIdx >= 0 ? seg[g.sepIdx] : null;
    let everyRoundRests = !g.lastRoundShort;
    if (sets > 1 && rounds === 1 && sep) {
      const last = seg[k + g.covered - 1];
      everyRoundRests = isRecovery(last) && sigOf(last, opts) === sigOf(sep, opts);
      rounds = sets; sets = 1; unit = [...unit, sep]; sep = null;
    }

    // A "round" longer than any the page prints is left unsaid — see `MAX_ROUND_STEPS`.
    if (unit.length > MAX_ROUND_STEPS) return null;

    const restLast = unit.length === 2 && !isRecovery(unit[0]) && isRecovery(unit[1]);
    if (sets === 1 && restLast && (pageWords(unit[1]) || !target(unit[1], opts))) {
      // "3 rounds of 8 minutes at 170–189 W, with a 4-minute easy spin after each."
      const work = stepPhrase(unit[0], opts, 'mid');
      const rest = stepPhrase(unit[1], opts, 'mid');
      if (!work || !rest) return null;
      out.push(`${rounds} rounds of ${work}, with ${rest} ${everyRoundRests ? 'after each' : 'between them'}.`);
    } else {
      const round = roundPhrase(unit, opts);
      if (!round) return null;
      if (sets > 1) {
        const between = sep ? stepPhrase(sep, opts, 'start') : null;
        if (!between) return null;
        out.push(`${sets} sets of ${rounds} rounds: ${round}.`);
        out.push(sentence(`${between} between sets`));
      } else {
        out.push(`${rounds} rounds: ${round}.`);
      }
    }
    k += g.covered;
  }
  if (ladders.length) return out.length ? null : ladderNarrative(ladders, ladderSeps, opts);
  return out.length ? out.join(' ') : null;
}
