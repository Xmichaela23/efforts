/**
 * ⛔ THE VOCABULARY GUARD — no exercise may silently borrow another's prescription.
 *
 *   ~/.deno/bin/deno test --allow-read src/lib/exercise-config.vocabulary-guard.test.ts --no-check
 *
 * ⛔ WHY THIS EXISTS. `getExerciseConfig` ends in a longest-substring fuzzy fallback, so a movement
 * with no key does NOT return null — it returns whichever neighbouring key overlaps most, and the app
 * then renders that neighbour's ratio, reference lift and display format with total confidence.
 * Everything about it looks right. The bugs it has actually shipped:
 *
 *     press                  → `leg press`            priced at 1.5x the SQUAT
 *     Single Leg Hip Thrust  → `hip thrust`           the two-legged 0.9x deadlift, drawn as a barbell
 *     Planks                 → `copenhagen plank`     a bilateral hold marked unilateral
 *     single leg squat       → `squat`                a bodyweight pistol at 100% of the back squat
 *     band overhead press    → `overhead press`       a band priced off the barbell max
 *
 * Every one was found BY EYE, from a screenshot, weeks or months after it shipped. This test is the
 * replacement for that. It walks the whole vocabulary and fails naming anything resolving `fuzzy`.
 *
 * ⛔ THE CORPUS IS THE POINT. An earlier reconciliation used only the LIBRARY (type table, role
 * table, protocol names) and passed — while six movements in the athlete's own plans and logs were
 * silently borrowing. A vocabulary guard that reads only what the code knows about cannot find the
 * gaps, because the gaps are precisely the names the code does not know about. So it reads six
 * sources, and the last one is real data.
 *
 * ⚠️ THE REAL-DATA SOURCE IS A COMMITTED SNAPSHOT, NOT A LIVE QUERY. The guard must run offline with
 * no credentials — a test that reaches for prod is one that fails on a plane and gets deleted.
 * `scripts/refresh-exercise-vocabulary.mjs` is the only thing that touches the database (read-only,
 * names only) and is run deliberately.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { EXERCISE_CONFIG, resolveExerciseConfig } from './exercise-config.ts';

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

/** Strip line comments before regexing names out of source — prose contains apostrophes. */
const stripComments = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

interface Source { label: string; names: string[] }

async function vocabularySources(): Promise<Source[]> {
  const out: Source[] = [];

  // 1. The config's own keys. Trivially exact, but it pins that the resolver agrees with itself.
  out.push({ label: 'exercise-config keys', names: Object.keys(EXERCISE_CONFIG) });

  // 2 + 3. The type axis and the role axis, plus the main-lift set — read from source, all private.
  const roleSrc = await read('./exercise-role.ts');
  const typeBlock = roleSrc.split('const TYPE_TABLE')[1];
  out.push({
    label: 'TYPE_TABLE',
    names: [...typeBlock.matchAll(
      /^ {2}'([^']+)':\s*'(?:barbell_main|loaded_accessory|bodyweight|plyo|isometric|mobility|carry|band)'/gm,
    )].map((m) => m[1]),
  });
  out.push({
    label: 'ROLE_TABLE',
    names: [...roleSrc.matchAll(/^ {2}'([^']+)':\s*'(?:primary|secondary|accessory)'/gm)].map((m) => m[1]),
  });
  out.push({
    label: 'MAIN_531_LIFTS',
    names: [...roleSrc.split('MAIN_531_LIFTS')[1].split(']')[0].matchAll(/'([^']+)'/g)].map((m) => m[1]),
  });

  // 4. The assistance catalog — the shortlist the athlete picks from at build time. ⛔ Its own header
  // makes this a hard requirement: *"Must be a name `getExerciseConfig()` resolves. An unresolved
  // name is the D-322 bug class."*
  // ⚠️ MOVED 2026-08-13 (D-407): this read `assistance-menu.ts`, whose menu was retired with the
  // block-wide 3-pick model. The names now live in `assistance-catalog.ts` — and the file also
  // carries a `display` alias per movement, which is athlete-facing text and NOT a token, so only
  // `name:` is swept. The balanced-default week's movement names are swept too, since a typo there
  // reaches a session exactly as fast as a catalog entry does.
  // ⚠️ THE DEFAULT-WEEK SWEEP IS SCOPED TO `BALANCED_WEEK`, and it has to be: the same
  // `push: '…'` shape also spells `CATEGORY_LABEL`, whose values are UI text ("Push", "Single-leg /
  // core"). Sweeping the whole file fed those to the resolver, where "Pull" cheerfully borrowed
  // `face pull`. A label is not a token — the first cut of this got that wrong.
  const catalogSrc = stripComments(await read('./assistance-catalog.ts'));
  const balancedBlock = catalogSrc.split('BALANCED_WEEK')[1]?.split('};')[0] ?? '';
  assert(balancedBlock.length > 100, 'BALANCED_WEEK did not load — did it move or get renamed?');
  out.push({
    label: 'assistance-catalog',
    names: [
      ...[...catalogSrc.matchAll(/\bname: '([^']+)'/g)].map((m) => m[1]),
      ...[...balancedBlock.matchAll(/(?:push|pull|single_leg_core): '([^']+)'/g)].map((m) => m[1]),
    ],
  });

  // 5. The add-exercise picker in the logger — what the athlete can type in. Evaluated as the array
  // literal it is; a regex here mis-parses `"Farmer's Carry"` and silently drops the entries after it.
  const loggerSrc = await read('../components/StrengthLogger.tsx');
  const body = loggerSrc.split('const commonExercises = [')[1].split('\n  ];')[0];
  out.push({
    label: 'add-exercise picker',
    names: new Function(`return [${stripComments(body)}]`)() as string[],
  });

  // 6. ⛔ THE ONE THAT MATTERS MOST — what has actually been planned and logged. See the header.
  const snap = JSON.parse(await read('./__fixtures__/real-exercise-vocabulary.json'));
  assert(Array.isArray(snap.names) && snap.names.length > 40, 'the real-vocabulary snapshot did not load');
  out.push({ label: 'REAL plans + logs', names: snap.names.map((n: { name: string }) => n.name) });

  // 7. ⛔ WHAT THE EQUIPMENT SUBSTITUTION *EMITS* — added 2026-08-13, and it was a real blind spot.
  //
  // `substituteExerciseForEquipment` (materialize-plan) rewrites an exercise when the athlete lacks
  // the kit, and the name it writes goes straight into the session. Those names appear in NO menu, NO
  // protocol table and NO config key list — so all six sources above were blind to them, and two had
  // been wrong for as long as they had existed: **"Band Leg Curls" borrowed `leg curls` and was priced
  // at 0.3× the DEADLIFT as a total barbell load**, and "Bent-Over Reverse Flyes" borrowed
  // `reverse flye`. Found by hand, from a gear map, months after shipping — which is the exact
  // pattern this whole guard exists to end.
  //
  // ⚠️ LITERALS ONLY. Two substitutions build the name at runtime (`exerciseName.replace(/Dumbbell/gi,
  // 'Band')`), so they cannot be read statically and are not covered here. That is a known hole, not
  // an oversight — the emitted forms ("Band Lateral Raises") are covered by the config's own plural
  // and band keys today.
  const subSrc = await read('../../supabase/functions/materialize-plan/index.ts');
  const subBody = subSrc.split('function substituteExerciseForEquipment')[1]?.split('\nfunction ')[0] ?? '';
  assert(subBody.length > 500, 'substituteExerciseForEquipment body did not load — did it move or get renamed?');
  out.push({
    label: 'equipment substitution OUTPUTS',
    names: [...stripComments(subBody).matchAll(/resultName\s*=\s*'([^']+)'/g)]
      .map((m) => m[1])
      // The two runtime-built names above land here as fragments; drop anything with a template hole.
      .filter((n) => !n.includes('${')),
  });

  return out;
}

/**
 * ⛔ A DEBT LEDGER, AND IT MAY ONLY SHRINK. Names that resolve `fuzzy` and are ACCEPTED, each with a
 * reason. ⚠️ DO NOT ADD A NAME HERE TO MAKE THIS TEST PASS. A new fuzzy resolution is a movement
 * borrowing another's prescription — the exact bug class this guard exists to surface. The fix is a
 * key in EXERCISE_CONFIG; this list is for cases where a key would be actively wrong.
 */
const ACCEPTED_FUZZY = new Map<string, string>([
  // (empty — every fuzzy resolution found so far has been fixed with a key)
]);

Deno.test('⛔ NO EXERCISE IN THE VOCABULARY RESOLVES THROUGH THE FUZZY FALLBACK', async () => {
  const offenders: string[] = [];
  const seen = new Set<string>();
  for (const src of await vocabularySources()) {
    for (const name of src.names) {
      const key = String(name).toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const r = resolveExerciseConfig(name);
      if (r.via === 'exact' || r.via === 'folded') continue;
      if (ACCEPTED_FUZZY.has(key)) continue;
      offenders.push(
        r.via === 'none'
          ? `${name}  [${src.label}]  → NO CONFIG AT ALL (falls to the legacy weight path)`
          : `${name}  [${src.label}]  → borrows '${r.matchedKey}' (ratio ${r.config?.ratio}, ${r.config?.displayFormat})`,
      );
    }
  }
  assertEquals(
    offenders,
    [],
    `these movements are silently borrowing another exercise's prescription — give each a key in ` +
      `EXERCISE_CONFIG (src/lib/exercise-config.ts):\n  ${offenders.join('\n  ')}`,
  );
});

Deno.test('⛔ THE LEDGER IS REAL — every accepted name still resolves fuzzy', () => {
  // An allowlist that outlives the problem it names becomes a lie.
  const stale = [...ACCEPTED_FUZZY.keys()].filter((n) => {
    const via = resolveExerciseConfig(n).via;
    return via === 'exact' || via === 'folded';
  });
  assertEquals(stale, [], `these now resolve exactly — remove them from ACCEPTED_FUZZY:\n  ${stale.join('\n  ')}`);
});

Deno.test('the resolver reports HOW it answered, and the three ways are distinguishable', () => {
  // The seam the guard and the runtime tripwire both read. If `via` ever stops being accurate, both
  // go quiet at once — so it is pinned directly rather than only through the sweep above.
  assertEquals(resolveExerciseConfig('squat').via, 'exact');
  assertEquals(resolveExerciseConfig('Back Squat').via, 'exact', 'case alone is handled before folding');
  // ⚠️ `folded` is the PUNCTUATION-insensitive pass — a hyphen is a spelling, not a different lift.
  assertEquals(resolveExerciseConfig('Pull-Up').via, 'folded');
  assertEquals(resolveExerciseConfig('Pull-Up').matchedKey, 'pull up');
  assertEquals(resolveExerciseConfig('some movement nobody has ever heard of').via, 'none');
  // A name that overlaps a key but is not one: the guess, named.
  const fuzzy = resolveExerciseConfig('extremely heavy barbell row variant');
  assertEquals(fuzzy.via, 'fuzzy');
  assertEquals(fuzzy.matchedKey, 'barbell row');
});

Deno.test('⛔ THE SNAPSHOT IS NAMES ONLY — it must never grow athlete data', () => {
  // It is a vocabulary, committed to the repo. If a future refresh starts carrying dates, ids, set
  // data or weights, this fails. Michael is the only user pre-launch and this is his own data; the
  // rule is about what belongs in git, not about risk.
  return read('./__fixtures__/real-exercise-vocabulary.json').then((raw) => {
    const snap = JSON.parse(raw);
    assertEquals(Object.keys(snap).sort(), ['_comment', 'count', 'names']);
    for (const entry of snap.names) {
      assertEquals(Object.keys(entry).sort(), ['name', 'sources']);
      for (const s of entry.sources) assert(['planned', 'logged'].includes(s), `unexpected source ${s}`);
    }
    assert(!/\d{4}-\d{2}-\d{2}/.test(raw), 'a date leaked into the vocabulary snapshot');
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(raw), 'a user id leaked into the vocabulary snapshot');
  });
});
