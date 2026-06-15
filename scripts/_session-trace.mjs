// D-132 logic harness: mirrors the StrengthLogger draft persistence (key + gate-on-Done +
// restore-with-legacy-fallback + identity guard + legacy cleanup) against a fake localStorage,
// and asserts the original bug is gone + the MUST-PRESERVE cases hold. Pure logic, no app/DB.
const store = new Map();
const LS = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
  get length() { return store.size; },
  key: i => [...store.keys()][i],
};
const NOW = Date.parse('2026-06-11T18:00:00Z');
const H = 3600e3;

const computeKey = (date, id) => `strength_logger_session_${date}_${id || 'adhoc'}`;
const legacyKey = date => `strength_logger_session_${date}`;
const hasCompleted = ex => Array.isArray(ex) && ex.some(e => Array.isArray(e?.sets) && e.sets.some(s => s?.completed));

// saveSessionProgress (Layer 3 gate-on-Done + Layer 2 key)
function save(date, sourcePlannedId, exercises, ts = NOW) {
  const key = computeKey(date, sourcePlannedId);
  if (!hasCompleted(exercises)) { LS.removeItem(key); return; }
  LS.setItem(key, JSON.stringify({ exercises, sourcePlannedId, timestamp: ts }));
}
// restoreSessionProgress (Layer 2 identity key + legacy fallback + 24h)
function restore(date, openedId) {
  const primary = computeKey(date, openedId ?? null);
  let usedKey = primary, saved = LS.getItem(primary);
  if (!saved) { usedKey = legacyKey(date); saved = LS.getItem(usedKey); }
  if (!saved) return null;
  const data = JSON.parse(saved);
  const ageH = Math.abs(NOW - data.timestamp) / H;
  if (ageH < 24) return data;
  LS.removeItem(usedKey); return null;
}
// Layer 1 guard
const guard = (saved, openedId) => !!saved && ((saved.sourcePlannedId ?? null) === (openedId ?? null));
// Layer 3 legacy cleanup
function legacyCleanup() {
  const re = /^strength_logger_session_\d{4}-\d{2}-\d{2}$/;
  for (let i = LS.length - 1; i >= 0; i--) {
    const k = LS.key(i); if (!k || !re.test(k)) continue;
    try { const b = JSON.parse(LS.getItem(k) || 'null');
      const ageH = b?.timestamp ? Math.abs(NOW - b.timestamp) / H : Infinity;
      if (!hasCompleted(b?.exercises) || ageH >= 24) LS.removeItem(k);
    } catch { LS.removeItem(k); }
  }
}
// mount(): cleanup → restore → guard → restore-or-fresh. Returns the EFFECTIVE workout id used for saving.
function mount(date, openedId) {
  legacyCleanup();
  const saved = restore(date, openedId);
  if (saved && guard(saved, openedId)) return { loaded: 'restored', effectiveSourcePlannedId: saved.sourcePlannedId };
  return { loaded: 'fresh', effectiveSourcePlannedId: openedId ?? null };
}

let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

// ===== ORIGINAL BUG REPRO (post-fix) =====
store.clear();
// Pre-existing STUCK legacy blob: Upper Bench poked, NEVER Done (phantom), keyed date-only.
store.set(legacyKey('2026-06-11'), JSON.stringify({ exercises: [{ name: 'Bench Press', sets: [{ weight: 105, completed: false }, { weight: 100, completed: false }] }], sourcePlannedId: 'UPPER', timestamp: NOW - 2 * H }));
const r1 = mount('2026-06-11', 'LOWER');  // open today's Lower
ok('original bug: open Lower → loads FRESH (not Upper)', r1.loaded === 'fresh');
ok('original bug: Lower saves under LOWER, never UPPER', r1.effectiveSourcePlannedId === 'LOWER');
ok('legacy cleanup removed the stuck phantom Upper blob', LS.getItem(legacyKey('2026-06-11')) === null);

// ===== LAYER 3 gate-on-Done =====
store.clear();
save('2026-06-11', 'UPPER', [{ name: 'Bench', sets: [{ weight: 105, completed: false }] }]);  // poke, no Done
ok('gate-on-Done: poke with no completed set writes NO blob', LS.getItem(computeKey('2026-06-11', 'UPPER')) === null);
save('2026-06-11', 'UPPER', [{ name: 'Bench', sets: [{ weight: 105, completed: true }] }]);   // tap Done
ok('gate-on-Done: after a completed set, blob IS written', LS.getItem(computeKey('2026-06-11', 'UPPER')) !== null);

// ===== EDGE: complete then un-complete back to zero → draft clears =====
save('2026-06-11', 'UPPER', [{ name: 'Bench', sets: [{ weight: 105, completed: false }] }]);   // un-complete
ok('edge: un-complete back to zero → draft CLEARED', LS.getItem(computeKey('2026-06-11', 'UPPER')) === null);

// ===== MUST-PRESERVE: genuine same-workout resume =====
store.clear();
save('2026-06-11', 'UPPER', [{ name: 'Bench', sets: [{ weight: 105, completed: true }] }]);
const r2 = mount('2026-06-11', 'UPPER');  // reopen same workout
ok('same-workout resume: reopen Upper → RESTORED', r2.loaded === 'restored' && r2.effectiveSourcePlannedId === 'UPPER');

// ===== different workout after genuine Upper draft exists =====
const r3 = mount('2026-06-11', 'LOWER');
ok('cross-workout: open Lower with Upper draft present → FRESH', r3.loaded === 'fresh' && r3.effectiveSourcePlannedId === 'LOWER');
ok('cross-workout: Upper draft left intact under its own key', LS.getItem(computeKey('2026-06-11', 'UPPER')) !== null);

// ===== ad-hoc resume (null === null) =====
store.clear();
save('2026-06-11', null, [{ name: 'Bench', sets: [{ weight: 105, completed: true }] }]);
const r4 = mount('2026-06-11', null);
ok('ad-hoc resume: null===null restores', r4.loaded === 'restored');

// ===== 24h window =====
store.clear();
save('2026-06-11', 'UPPER', [{ name: 'Bench', sets: [{ weight: 105, completed: true }] }], NOW - 30 * H);  // 30h old
const r5 = mount('2026-06-11', 'UPPER');
ok('24h window: >24h draft expires → FRESH', r5.loaded === 'fresh');

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
