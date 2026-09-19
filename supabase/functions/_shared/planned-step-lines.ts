/**
 * ⛔ THE LINES UNDER A PLANNED RUN, RIDE OR WALK, WRITTEN BY THE SERVER (2026-09-16, WORKORDER §3b follow-up).
 *
 * materialize-plan stamps `computed.step_lines` on the session from its own `computed.steps`, the same
 * way it stamps `computed.strength_lines`, and every planned screen prints the list. The phone grouped
 * the flattened steps itself (`PlannedWorkoutSummary.tsx`), matched only a work + recovery pair, and
 * printed a time-prescribed rep by its derived metres ("59 m") — so a forty-twenty session read as
 * forty flat rows on one screen and a different grouping on another.
 *
 * The words (approved by Michael, 2026-09-16, off p231-232's forty-twenty at level 2):
 *   10:00 warm-up · ref 8:33–9:41/mi
 *   5 sets of 4 × 40 s @ 5:39–5:53/mi, 20 s @ 14:06–15:54/mi between · 2:00 @ 8:33–9:41/mi between sets
 *   (the "RPE 8–10" added 2026-09-16 came off 2026-09-17 — no run or ride page prints an effort number)
 *   8:00 cool-down · ref 8:33–9:41/mi
 *
 * ⚠️ GROUPING READS THE STEPS, NOT THE TOKEN. The smallest run of steps that repeats back to back is the
 * round; a lone recovery after a block of rounds that then repeats is the rest between sets. A step that
 * repeats nothing prints on its own line.
 */
import { oneSidedPowerText, shownPowerRange } from './ride-power.ts';
import { clock as clockOf, displayFormat, M_PER_MI } from './display-format.ts';

type Range = { lower?: number; upper?: number; shown_upper?: number };
export type PlannedStep = {
  kind?: string;
  label?: string;
  seconds?: number;
  distanceMeters?: number;
  distance_m?: number;
  distanceDerived?: boolean;
  /** The label is the page's own words (`materialize-plan`); the lines print it. */
  page_label?: boolean;
  /** An untimed step the athlete ends with the lap button. */
  lap_button?: boolean;
  paceTarget?: string;
  pace_range?: Range | [number | string, number | string] | null;
  powerRange?: Range | null;
  prescription?: string;
  hr_range?: Range | null;
};

export type StepLineOptions = {
  /** `planned_workouts.units` — 'metric' prints km/m, anything else miles/yards. */
  units?: string | null;
  /** 'ride' spins read "easy" when a recovery carries no pace or heart-rate range. */
  sport?: string | null;
  /** A race-day row prints its one pace, not a range. */
  raceDay?: boolean;
  /** The row's `family:<id>` tag — picks the book's effort line, if its page prints one. */
  family?: string | null;
};

/**
 * ⛔ THE BOOK'S EFFORT WORDS UNDER THE STEPS (2026-09-18, book-language pass 1).
 * The talk-test line that printed here was a second copy of the session's own line (`family-lines.ts`, p235),
 * which the planned screens print above these steps; it came off. The all-out line stays for p229's run
 * sprints, whose steps carry no target.
 */
// Viada p229 (Sprint / Power), whole sentence read off the page: "“All-out” indicates “best possible speed” for the
// day." (2026-09-18, book-language pass 4; it was reworded as "All-out: the best speed you have today.")
export const ALL_OUT_LINE = '"All-out" indicates "best possible speed" for the day.';
const ALL_OUT_LINE_FAMILIES: ReadonlySet<string> = new Set(['run_sprint_power']);

const kindOf = (s: PlannedStep) => String(s?.kind || '').toLowerCase();
const isWarmup = (s: PlannedStep) => kindOf(s) === 'warmup';
const isCooldown = (s: PlannedStep) => kindOf(s) === 'cooldown';
const isRecovery = (s: PlannedStep) => kindOf(s) === 'recovery' || /rest/i.test(String(s?.label || ''));

/** "40 s" under a minute, "2:00" from a minute up. */
function fmtTime(sec: number): string {
  const x = Math.max(1, Math.round(Number(sec) || 0));
  if (x < 60) return `${x} s`;
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = x % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// FIELD — definition: 1 mi = 1609.344 m, 1 yd = 0.9144 m.
const M_PER_MI = 1609.344;
const M_PER_YD = 0.9144;
/**
 * OURS — `fmtDist` cut-offs moved unchanged from the phone (`PlannedWorkoutSummary.tsx`): under 200 m prints
 * metres; metric ≥ 1000 m prints km to 1 dp; imperial under 0.1 mi prints yards, under 1 mi 2 dp, else 1 dp.
 * Ledger row in docs/STATE-SOURCES.md.
 */
function fmtDist(meters: number, units?: string | null): string {
  const m = Math.max(1, Math.round(Number(meters) || 0));
  if (m < 200) return `${m} m`;
  if (String(units || '').toLowerCase() === 'metric') return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
  const mi = m / M_PER_MI;
  if (mi < 0.1) return `${Math.round(m / M_PER_YD)} yd`;
  return mi < 1 ? `${mi.toFixed(2)} mi` : `${mi.toFixed(1)} mi`;
}

/**
 * ⛔ A PACE RANGE IN THE ATHLETE'S OWN UNIT, THROUGH THE SERVER'S ONE FORMATTER (2026-09-18, book-language pass 1,
 * audit item 31). Work steps printed /mi and warm-ups /km for the same metric athlete; every range now goes
 * through `display-format.ts`. Paces travel as seconds per MILE.
 */
function paceRangeText(loSecPerMi: number, hiSecPerMi: number, units?: string | null): string {
  const f = displayFormat(String(units || '').toLowerCase() === 'metric');
  const perKm = (secPerMi: number) => secPerMi / (M_PER_MI / 1000);
  return `${clockOf(f.metric ? perKm(loSecPerMi) : loSecPerMi)}–${f.pacePerUnit(perKm(hiSecPerMi))}`;
}

function paceText(s: PlannedStep, opts: StepLineOptions): string | undefined {
  if (opts.raceDay && typeof s?.paceTarget === 'string' && s.paceTarget) return s.paceTarget;
  const pr = s?.pace_range as any;
  if (pr && !Array.isArray(pr) && Number(pr.lower) > 0 && Number(pr.upper) > 0) return paceRangeText(Number(pr.lower), Number(pr.upper), opts.units);
  if (Array.isArray(pr) && pr.length === 2 && pr[0] && pr[1]) {
    return typeof pr[0] === 'number' ? paceRangeText(pr[0], Number(pr[1]), opts.units) : `${pr[0]}–${pr[1]}`;
  }
  return typeof s?.paceTarget === 'string' && s.paceTarget ? s.paceTarget : undefined;
}

function powerText(s: PlannedStep): string | undefined {
  if (!(s?.powerRange && typeof s.powerRange.lower === 'number')) return undefined;
  // p237's floor prints its shown top, 130% of FTP (round 5, `shownPowerRange`); the score has none.
  const r = shownPowerRange(s.powerRange)!;
  const lo = Math.round(r.lower);
  // p239's ceiling ("under N W") — the words every send prints too (`oneSidedPowerText`).
  const oneSided = oneSidedPowerText(r.lower, r.upper);
  if (oneSided) return oneSided;
  const hi = Math.round(Number(r.upper));
  return lo === hi ? `${lo} W` : `${lo}–${hi} W`;
}

const hrText = (s: PlannedStep) =>
  s?.prescription === 'heart_rate' && s?.hr_range && typeof s.hr_range.lower === 'number' && typeof s.hr_range.upper === 'number'
    ? `HR ${Math.round(s.hr_range.lower)}–${Math.round(s.hr_range.upper)}` : undefined;

/**
 * ⛔ THE PAGE'S OWN WORDS FOR A STEP, WHERE THE STEP CARRIES THEM (2026-09-18, book-language). Only a label marked
 * `page_label` prints: the other labels on the steps are ours and never reached these lines.
 */
const pageWords = (s: PlannedStep): string | null =>
  s?.page_label === true && typeof s?.label === 'string' && s.label.trim() ? s.label.trim() : null;
const untimed = (s: PlannedStep): boolean =>
  !(Number(s?.seconds) > 0) && !(Number(s?.distanceMeters ?? s?.distance_m) > 0);

/** The step's length as prescribed: a derived distance on a timed step never prints. */
function lengthText(s: PlannedStep, opts: StepLineOptions): string {
  const dist = Number(s?.distanceMeters ?? s?.distance_m);
  const stride = /stride/i.test(String(s?.label || ''));
  if (!s?.distanceDerived && dist > 0) return stride ? `${Math.round(dist)} m stride` : fmtDist(dist, opts.units);  // p210 — the page's word: "2 × 100-meter strides"
  if (Number(s?.seconds) > 0) return stride ? `${fmtTime(Number(s.seconds))} stride` : fmtTime(Number(s.seconds));  // p210 — the page's word: "2 × 100-meter strides"
  if (dist > 0) return fmtDist(dist, opts.units);
  return String(s?.label || '').trim() || 'interval';
}

/** " @ 5:39–5:53/mi", " @ HR 138–144 · ref 10:05–11:25/mi", " @ 202–273 W", " easy". */
function targetText(s: PlannedStep, opts: StepLineOptions): string {
  const pace = paceText(s, opts), hr = hrText(s), pow = powerText(s);
  if (hr) return ` @ ${hr}${pace ? ` · ref ${pace}` : ''}`;
  if (pace) return ` @ ${pace}`;
  // ⛔ A RIDE'S RECOVERY PRINTS ITS WATTS WHEN IT CARRIES THEM (2026-09-16, Stage 7 session 3 — "a recovery step inside a
  // hard run or ride prints the page's pace or power"). It printed " easy" ahead of the watts; " easy" is left for a
  // recovery that carries no target at all (the last line below).
  if (pow) return ` @ ${pow}`;
  // ⛔ NO WORD OF OURS ON A REST (2026-09-18, book-language pass 2). An untargeted recovery printed " easy" — the page
  // says "recovery walk/jog", "rest", "spin" or "easy spin" by shape, and a step that carries the page's word prints it
  // (`page_label`, from `endurance-library/step-words.ts`). One without a word prints its length and the structure.
  return '';
}

function wrapperLine(s: PlannedStep, word: string, opts: StepLineOptions): string {
  const pace = paceText(s, opts), hr = hrText(s), pow = powerText(s);
  const words = pageWords(s);
  /**
   * ⛔ A WARM-UP OR COOL-DOWN STEP IN THE PAGE'S OWN WORDS (2026-09-18, book-language pass 4) prints the page's box
   * heading word and its line: `10:00 warm-up · 10-minute easy jog`, `warm-up · 3 sets of 20m walking lunges`, and a
   * power target only where the page prints a number (`5:00 warm-up · 214–261 W · 5 minutes @ 95%`).
   */
  if (words) {
    if (untimed(s)) return `${word} · ${words}`;
    return `${lengthText(s, opts)} ${word}${hr ? ` · ${hr}` : pace ? ` · ${pace}` : pow ? ` · ${pow}` : ''} · ${words}`;
  }
  const len = lengthText(s, opts);
  /**
   * ⛔ A RUN'S WARM-UP AND COOL-DOWN PRINT THE EASY PACE (Michael's words, approved 2026-09-17):
   *   10:00 warm-up · easy pace 10:56–12:22/mi
   * The book prints "10-min easy jog" (p231–235); the watch gets the step as time only. /km for a metric athlete.
   */
  if (!hr && pace && opts.sport === 'run' && !opts.raceDay) return `${len} ${word} · easy pace ${pace}`;
  if (hr) return `${len} ${word} · ${hr}${pace ? ` · ref ${pace}` : ''}`;
  if (pace) return `${len} ${word} · ${s?.prescription === 'heart_rate' ? 'ref ' : ''}${pace}`;
  if (pow) return `${len} ${word} · ${pow}`;
  return `${len} ${word}`;
}

const stepText = (s: PlannedStep, opts: StepLineOptions) => {
  const words = pageWords(s);
  // An untimed page step is its words alone (the lap button ends it).
  if (words && untimed(s)) return words;
  // The page's word follows the length, as the page sets it: "2:00 recovery walk/jog", "30 s max effort". ⛔ A rest the
  // page names in words carries no pace or watts on the line — the page gives it none; the words are the prescription.
  const base = `${lengthText(s, opts)}${words && isRecovery(s) ? '' : targetText(s, opts)}`;
  return words ? `${base} ${words}` : base;
};
const sigOf = (s: PlannedStep, opts: StepLineOptions) => `${isRecovery(s) ? 'r' : 'w'}|${stepText(s, opts)}`;

function unitText(unit: PlannedStep[], opts: StepLineOptions): string {
  return unit.map((s, i) => {
    const t = stepText(s, opts);
    return i === unit.length - 1 && unit.length > 1 && isRecovery(s) ? `${t} between` : t;
  }).join(', ');
}

/** The best repeat that starts at `from`: how many steps it covers and its line. */
function groupAt(seg: PlannedStep[], sig: string[], from: number, opts: StepLineOptions): { covered: number; line: string } {
  const n = seg.length - from;
  let best = { covered: 1, line: stepText(seg[from], opts), p: 1 };
  const same = (a: number, b: number, len: number) => {
    for (let k = 0; k < len; k++) if (sig[a + k] !== sig[b + k]) return false;
    return true;
  };
  for (let p = 1; p <= Math.floor(n / 2) || (p === 1 && n >= 1); p++) {
    if (p > n) break;
    // Rounds back to back. The last round may drop its trailing recovery.
    let r = 1;
    while (from + (r + 1) * p <= seg.length && same(from, from + r * p, p)) r++;
    let covered = r * p;
    let lastRoundShort = false;
    const tail = from + covered;
    if (sig[from + p - 1]?.startsWith('r|') && p > 1 && tail + p - 1 <= seg.length && same(from, tail, p - 1)
      && (tail + p - 1 === seg.length || !(sig[tail + p - 1] === sig[from + p - 1]))) {
      r++; covered += p - 1; lastRoundShort = true;
    }
    // Sets: a lone recovery after the block, then the same block again.
    let sets = 1;
    let sepIdx = -1;
    const block = lastRoundShort ? -1 : covered;
    if (block > 0 && from + block < seg.length && isRecovery(seg[from + block])) {
      sepIdx = from + block;
      let at = from + block + 1;
      while (at + block <= seg.length && same(from, at, block)) {
        sets++;
        at += block;
        if (at < seg.length && sig[at] === sig[sepIdx]) at++;
        else break;
      }
      if (sets > 1) covered = at - from;
    }
    if (r < 2 && sets < 2) continue;
    let line: string;
    const unit = seg.slice(from, from + p);
    if (sets > 1 && r > 1) {
      line = `${sets} sets of ${r} × ${unitText(unit, opts)} · ${stepText(seg[sepIdx], opts)} between sets`;  // p231 — "2 sets of 3 rounds of … 2-minute recovery walk/jog between sets"; the page writes a count with "x" ("4 x 25m")
    } else if (sets > 1) {
      line = `${sets} × ${unitText([...unit, seg[sepIdx]], opts)}`;
    } else {
      line = `${r} × ${unitText(unit, opts)}`;
    }
    // The smallest round that covers the most steps wins; p only grows, so a tie keeps the smaller one.
    if (covered > best.covered) best = { covered, line, p };
  }
  return { covered: best.covered, line: best.line };
}

/**
 * ⛔ A SET WHERE NOTHING REPEATS IS CHUNKED, NOT LISTED STEP BY STEP (2026-09-17, WORKORDER Stage B4).
 *
 * The descending ladder (p231–232) is ten different steps, then eight more — so `groupAt` finds no repeat and
 * printed TWENTY lines, one per step. Michael's words, approved 2026-09-17:
 *
 *   Set 1
 *   3:00, 2:00, 1:00, 45 s, 30 s @ 7:49–8:09/mi
 *   after each: 2:00, 1:20, 40 s, 30 s, 20 s @ 15:01–16:55/mi
 *   2:00 @ 10:56–12:22/mi between sets
 *   Set 2
 *   …
 *
 * FIELD — the chunking is Nielsen Norman Group's scanning guidance: readers scan rather than read, and a line runs
 * 50–75 characters. The one-line form was about 140 and wrapped.
 */
function setBlockAt(seg: PlannedStep[], from: number, opts: StepLineOptions): { covered: number; work: PlannedStep[]; rec: PlannedStep[] } | null {
  if (isRecovery(seg[from])) return null;
  const work: PlannedStep[] = [];
  const rec: PlannedStep[] = [];
  const wSig = targetText(seg[from], opts);
  let rSig: string | null = null;
  let i = from;
  while (i < seg.length) {
    const w = seg[i];
    if (isRecovery(w) || targetText(w, opts) !== wSig) break;
    work.push(w);
    i++;
    const r = seg[i];
    if (!r || !isRecovery(r)) break;
    const sig = targetText(r, opts);
    if (rSig == null) rSig = sig;
    else if (sig !== rSig) break;
    rec.push(r);
    i++;
  }
  // Two work steps and two recoveries at the least, and only where the steps differ — an even block is `groupAt`'s.
  if (work.length < 2 || rec.length < 2) return null;
  if (new Set(work.map((s) => lengthText(s, opts))).size < 2) return null;
  return { covered: i - from, work, rec };
}

export function plannedStepLines(steps: PlannedStep[] | null | undefined, opts: StepLineOptions = {}): string[] {
  const all = Array.isArray(steps) ? steps.filter((s) => s && typeof s === 'object') : [];
  const out: string[] = [];
  let i = 0;
  while (i < all.length) {
    if (isWarmup(all[i])) { out.push(wrapperLine(all[i], 'warm-up', opts)); i++; continue; }
    if (isCooldown(all[i])) { out.push(wrapperLine(all[i], 'cool-down', opts)); i++; continue; }
    let j = i;
    while (j < all.length && !isWarmup(all[j]) && !isCooldown(all[j])) j++;
    const seg = all.slice(i, j);
    const sig = seg.map((s) => sigOf(s, opts));
    let k = 0;
    let setNo = 0;
    while (k < seg.length) {
      const g = groupAt(seg, sig, k, opts);
      // A repeat is still a repeat — the chunked form is only for a stretch where nothing repeats.
      if (g.covered === 1) {
        const block = setBlockAt(seg, k, opts);
        if (block) {
          setNo++;
          out.push(`Set ${setNo}`);
          out.push(`${block.work.map((s) => lengthText(s, opts)).join(', ')}${targetText(block.work[0], opts)}`);
          // ⛔ "after each", not "jog after each" (2026-09-18, book-language): the page gives these a percentage
          // ("2 minutes @ 60%"), never the word jog.
          out.push(`after each: ${block.rec.map((s) => lengthText(s, opts)).join(', ')}${targetText(block.rec[0], opts)}`);
          k += block.covered;
          // The lone recovery that separates one set from the next.
          if (k < seg.length && isRecovery(seg[k]) && setBlockAt(seg, k + 1, opts)) {
            out.push(`${stepText(seg[k], opts)} between sets`);  // p231 — "… between sets"
            k++;
          }
          continue;
        }
      }
      out.push(g.line);
      k += g.covered;
    }
    i = j;
  }
  return withEffortLine(out, all, opts);
}

/**
 * The book's effort line goes after the main set, ahead of the cool-down. The all-out line stands in for a target
 * the page does not give, so it prints only when a work step carries no pace, heart rate or watts.
 */
function withEffortLine(lines: string[], steps: PlannedStep[], opts: StepLineOptions): string[] {
  const family = String(opts.family || '').toLowerCase();
  let line: string | null = null;
  if (ALL_OUT_LINE_FAMILIES.has(family)
    && steps.some((s) => !isWarmup(s) && !isCooldown(s) && !isRecovery(s) && !paceText(s, opts) && !hrText(s) && !powerText(s))) {
    line = ALL_OUT_LINE;
  }
  if (!line || lines.length === 0) return lines;
  const at = isCooldown(steps[steps.length - 1]) ? lines.length - 1 : lines.length;
  return [...lines.slice(0, at), line, ...lines.slice(at)];
}
