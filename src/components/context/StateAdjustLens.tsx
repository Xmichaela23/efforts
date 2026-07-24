// State-as-hub "Adjust" lens (D-316) — v0 scaffold.
//
// The Adjust tab mirrors the discipline layout of Status, but each row is a HANDLE to steer that
// discipline (changes WHAT you do). v0 lays out the disciplines and names the steer each one gets;
// the functional controls (strength swap/add/weight already exist in the logger + StrengthAdjustmentModal;
// endurance ease/push next) get re-homed here in the next pass. Nothing here changes your plan yet —
// no dead buttons that pretend to work; honest labels for what lands where. Consent-first throughout.

type Lift = { canonical_name: string; display_name?: string };

export default function StateAdjustLens({ perLift }: { perLift: Lift[] }) {
  return (
    <div className="px-0.5">
      <p className="text-[13px] text-white/55 mb-4 leading-snug">
        Steer your training. Changes apply from today forward — nothing changes on its own.
      </p>

      {/* STRENGTH — the deepest steer (swap / add / adjust weight already built; re-homing here next) */}
      <section className="mb-5">
        <div className="text-[12px] uppercase tracking-wider text-white/45 mb-2">Strength</div>
        {perLift.length === 0 ? (
          <p className="text-[13px] text-white/40 leading-snug">Log some lifts and they show up here to steer.</p>
        ) : (
          <div className="space-y-1.5">
            {perLift.map((lt) => (
              <div key={lt.canonical_name} className="flex items-center justify-between py-1">
                <span className="text-[13px] text-white/80">{lt.display_name ?? lt.canonical_name}</span>
                <span className="text-[12px] text-white/35">adjust · swap · add</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-white/35 mt-2.5 leading-snug">
          Swap, add, and adjust-weight live in the logger today — moving onto this row next.
        </p>
      </section>

      {/* ENDURANCE — load steering (ease / push) lands here next */}
      <section>
        <div className="text-[12px] uppercase tracking-wider text-white/45 mb-2">Run · Bike · Swim</div>
        <p className="text-[13px] text-white/40 leading-snug">
          Ease or push each discipline's load — the everyday steer — is the next lens to wire here.
        </p>
      </section>
    </div>
  );
}
