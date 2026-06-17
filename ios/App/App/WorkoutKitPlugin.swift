import Foundation
import Capacitor

#if canImport(WorkoutKit)
import WorkoutKit
import HealthKit
#endif

/**
 * WorkoutKitPlugin — "Send to Apple Watch" for POOL SWIMS (D-196 item 2).
 *
 * On-device only. This plugin receives the swim structure FROM THE CLIENT
 * (computed.steps + pool length/unit + title/date) and builds a WorkoutKit
 * `CustomWorkout`, then schedules it via `WorkoutScheduler.shared`.
 *
 * Hard constraints (by design):
 *  - NO edge function call. NO server `userId`. Fully on-device. (Explicit:
 *    do not inherit send-workout-to-garmin's client-userId-trust issue.)
 *  - POOL SWIM ONLY. Reject anything else.
 *  - Rests are TIME-based only. WorkoutKit cannot express manual-advance
 *    ("lap button") rests, so a fixed-time rest is the closest analog.
 *
 * COMPILE-RISK: every WorkoutKit symbol below is a FIRST PASS written without
 * a compiler. See the COMPILE-RISK list in the handoff report. Search this file
 * for "COMPILE-RISK:" to find each uncertain spot inline.
 */

// COMPILE-RISK (availability): WorkoutScheduler + CustomWorkout scheduling
// require recent OS. The work order says "watchOS 11". The companion iOS app
// builds/schedules the workout, so the iOS deployment target also matters.
// ASSUMPTION: iOS 17.0 / watchOS 10.0 introduced CustomWorkout + WorkoutScheduler,
// and the richer scheduling/preview API stabilized around iOS 17 / watchOS 10–11.
// VERIFY the exact minimums in Xcode (set the annotation to whatever compiles
// against your SDK; bump to 17.4/11.0 if the symbols are unavailable below).
@available(iOS 17.0, *)
@objc(WorkoutKitPlugin)
public class WorkoutKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutKitPlugin"
    public let jsName = "WorkoutKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleSwim", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        // COMPILE-RISK (availability): the runtime guard must mirror the
        // @available annotation on the class. If you raise the annotation,
        // raise this `#available` check too.
        if #available(iOS 17.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false, "reason": "OS too old for WorkoutKit scheduling"])
        }
        #else
        call.resolve(["available": false, "reason": "WorkoutKit not in SDK"])
        #endif
    }

    // MARK: - scheduleSwim

    @objc func scheduleSwim(_ call: CAPPluginCall) {
        #if canImport(WorkoutKit)
        guard #available(iOS 17.0, *) else {
            call.reject("This iOS version does not support WorkoutKit scheduling")
            return
        }

        // ---- Gate: pool swim only -------------------------------------------
        let sport = (call.getString("sport") ?? "").lowercased()
        guard sport == "swim" else {
            call.reject("WorkoutKit send is pool-swim only (got sport=\(sport))")
            return
        }

        // ---- Pool config -----------------------------------------------------
        // poolUnit: "yd" | "m"; poolLengthM: numeric meters (e.g. 22.86, 25, 50)
        let poolUnit = (call.getString("poolUnit") ?? "").lowercased()
        let poolLengthM = call.getDouble("poolLengthM") ?? 0
        guard poolUnit == "yd" || poolUnit == "m" else {
            call.reject("Pool unit required for a pool swim (expected 'yd' or 'm')")
            return
        }

        let title = call.getString("title") ?? "Pool Swim"

        // ---- Steps from the client ------------------------------------------
        // The client passes computed.steps verbatim. Each step:
        //   kind:     "warmup" | "work" | "cooldown" | "drill" | "recovery"
        //   distance_m: Double?   (work/warmup/cooldown/drill)
        //   duration_s: Double?   (recovery rests, or time-based work)
        //   rest_s:     Double?   (inline rest attached to a work step)
        //   label/stroke/equipment/intensity/cue: metadata (display only here)
        guard let rawSteps = call.getArray("steps") as? [[String: Any]], !rawSteps.isEmpty else {
            call.reject("No steps provided")
            return
        }

        do {
            let workout = try buildPoolSwimWorkout(
                title: title,
                poolUnit: poolUnit,
                poolLengthM: poolLengthM,
                rawSteps: rawSteps
            )

            // ---- Schedule date ----------------------------------------------
            // Client passes ISO date (yyyy-MM-dd or full ISO). Default: today.
            let dateStr = call.getString("date")
            let scheduledDate = parseScheduleDate(dateStr)

            Task {
                do {
                    // COMPILE-RISK (authorization): WorkoutScheduler requires the
                    // user to authorize scheduling. The API shape is uncertain —
                    // it may be `requestAuthorization()` returning a status enum,
                    // or it may throw. VERIFY the exact symbol/return in Xcode.
                    let status = await WorkoutScheduler.shared.requestAuthorization()
                    // COMPILE-RISK: enum case name. Likely `.authorized`. Could be
                    // `WorkoutScheduler.AuthorizationState.authorized` or similar.
                    guard status == .authorized else {
                        call.reject("WorkoutKit scheduling not authorized (status=\(status))")
                        return
                    }

                    // COMPILE-RISK (scheduling API): the call shape is the single
                    // most likely thing to need fixing. Candidates seen in the wild:
                    //   try await WorkoutScheduler.shared.schedule(workoutPlan, at: dateComponents)
                    //   try await WorkoutScheduler.shared.schedule(workoutPlan)   // plan carries date
                    // and `WorkoutPlan(_:)` wraps the CustomWorkout. We build a
                    // WorkoutPlan + DateComponents and pass both. Adjust to match SDK.
                    let plan = WorkoutPlan(.custom(workout))
                    let comps = Calendar.current.dateComponents(
                        [.year, .month, .day, .hour, .minute],
                        from: scheduledDate
                    )
                    try await WorkoutScheduler.shared.schedule(plan, at: comps)

                    call.resolve(["scheduled": true])
                } catch {
                    call.reject("Failed to schedule swim: \(error.localizedDescription)", nil, error)
                }
            }
        } catch let err as SwimBuildError {
            call.reject(err.message)
        } catch {
            call.reject("Failed to build swim: \(error.localizedDescription)", nil, error)
        }
        #else
        call.reject("WorkoutKit not available in this build")
        #endif
    }

    // MARK: - Workout construction

    #if canImport(WorkoutKit)

    enum SwimBuildError: Error {
        case empty
        var message: String {
            switch self {
            case .empty: return "Swim had no usable steps"
            }
        }
    }

    /**
     * Maps warmup/work/rest/cooldown steps → a WorkoutKit `CustomWorkout`.
     *
     * This mirrors the Garmin decomposition in send-workout-to-garmin/index.ts
     * (~619–760): bin into warmup → main → cooldown; each main "work" step plus
     * its trailing rest becomes one interval; consecutive identical work+rest
     * pairs are collapsed into a repeated IntervalBlock (Garmin's "repeat").
     *
     * COMPILE-RISK (model shape): CustomWorkout's initializer and the
     * WarmupStep/CooldownStep/IntervalBlock/IntervalStep types are the second
     * most likely area to need fixing. See inline COMPILE-RISK notes.
     */
    @available(iOS 17.0, *)
    func buildPoolSwimWorkout(
        title: String,
        poolUnit: String,
        poolLengthM: Double,
        rawSteps: [[String: Any]]
    ) throws -> CustomWorkout {

        // Normalize client steps into a simple intermediate model.
        struct Step {
            var kind: String        // warmup | work | cooldown | drill | recovery
            var distanceM: Double?
            var durationS: Double?
            var restS: Double?      // inline rest attached to a work step
            var label: String?
        }

        func num(_ any: Any?) -> Double? {
            if let d = any as? Double { return d }
            if let i = any as? Int { return Double(i) }
            if let s = any as? String, let d = Double(s) { return d }
            return nil
        }

        let steps: [Step] = rawSteps.map { row in
            let kind = (row["kind"] as? String ?? row["type"] as? String ?? "").lowercased()
            return Step(
                kind: kind,
                distanceM: num(row["distance_m"]) ?? num(row["distanceMeters"]),
                durationS: num(row["duration_s"]) ?? num(row["seconds"]),
                restS: num(row["rest_s"]) ?? num(row["restSeconds"]),
                label: row["label"] as? String
            )
        }

        // Bin into warmup / main / cooldown, matching the Garmin warmArr/mainArr/coolArr.
        var warmup: Step?
        var cooldown: Step?
        var main: [Step] = []

        for s in steps {
            switch s.kind {
            case "warmup":
                warmup = s
            case "cooldown":
                cooldown = s
            case "recovery", "rest", "interval_rest":
                // Standalone rest step → attach as a main rest marker.
                main.append(s)
            default:
                // work, drill, or anything else → main effort.
                main.append(s)
            }
        }

        // --- Pool distance helper --------------------------------------------
        // COMPILE-RISK (units): WorkoutKit distances use Foundation
        // Measurement<UnitLength>. We express swim distance in meters since
        // computed.steps stores distance_m. The pool LENGTH below is set on the
        // workout/lap config — see COMPILE-RISK (pool length) further down.
        func distanceGoal(_ meters: Double) -> WorkoutGoal {
            // WorkoutGoal.distance takes (value: Double, unit: UnitLength) positionally.
            return .distance(meters, UnitLength.meters)
        }
        func timeGoal(_ seconds: Double) -> WorkoutGoal {
            // WorkoutGoal.time takes (value: Double, unit: UnitDuration) positionally.
            return .time(seconds, UnitDuration.seconds)
        }

        // A work step → IntervalStep(.work); a rest → IntervalStep(.recovery).
        // COMPILE-RISK (IntervalStep): the initializer shape is uncertain.
        // Candidates:
        //   IntervalStep(.work, goal: .distance(...))
        //   var s = IntervalStep(.work); s.step.goal = .distance(...)
        // We use the goal-in-initializer form and FLAG it.
        func workIntervalStep(_ s: Step) -> IntervalStep {
            if let m = s.distanceM, m > 0 {
                return IntervalStep(.work, goal: distanceGoal(m))
            } else if let sec = s.durationS, sec > 0 {
                return IntervalStep(.work, goal: timeGoal(sec))
            } else {
                // No measurable goal — open step. COMPILE-RISK: `.open` goal name.
                return IntervalStep(.work, goal: .open)
            }
        }
        func restIntervalStep(seconds: Double) -> IntervalStep {
            // Time-based rest only (no manual-advance in WorkoutKit).
            return IntervalStep(.recovery, goal: timeGoal(max(1, seconds)))
        }

        // --- Build IntervalBlocks from main, collapsing repeats --------------
        // Pair each work step with its rest (either inline rest_s, or the
        // immediately-following standalone recovery step). Then collapse runs of
        // identical (work,rest) pairs into one IntervalBlock with iterations>1,
        // mirroring Garmin's `repeatCount`.
        struct Pair: Equatable {
            var workDistanceM: Double?
            var workDurationS: Double?
            var restS: Double?
        }

        var pairs: [Pair] = []
        var i = 0
        while i < main.count {
            let s = main[i]
            let isRestKind = (s.kind == "recovery" || s.kind == "rest" || s.kind == "interval_rest")
            if isRestKind {
                // A leading/standalone rest with no preceding work: attach to the
                // previous pair if one exists, else emit a rest-only pair.
                let r = s.durationS ?? s.restS ?? 0
                if var last = pairs.last, last.restS == nil {
                    last.restS = r
                    pairs[pairs.count - 1] = last
                } else {
                    pairs.append(Pair(workDistanceM: nil, workDurationS: nil, restS: r))
                }
                i += 1
                continue
            }

            // Work/drill step.
            var p = Pair(workDistanceM: s.distanceM, workDurationS: s.durationS, restS: s.restS)
            // Inline rest already captured via restS; otherwise consume a trailing rest step.
            if p.restS == nil, i + 1 < main.count {
                let nxt = main[i + 1]
                if nxt.kind == "recovery" || nxt.kind == "rest" || nxt.kind == "interval_rest" {
                    p.restS = nxt.durationS ?? nxt.restS ?? 0
                    i += 1 // consume the rest
                }
            }
            pairs.append(p)
            i += 1
        }

        // Collapse consecutive identical pairs → (pair, count).
        var blocks: [(pair: Pair, count: Int)] = []
        for p in pairs {
            if var last = blocks.last, last.pair == p {
                last.count += 1
                blocks[blocks.count - 1] = last
            } else {
                blocks.append((pair: p, count: 1))
            }
        }

        // Convert collapsed blocks → IntervalBlock array.
        // COMPILE-RISK (IntervalBlock): initializer shape uncertain. Likely:
        //   IntervalBlock(steps: [IntervalStep], iterations: Int)
        var intervalBlocks: [IntervalBlock] = []
        for b in blocks {
            var stepsInBlock: [IntervalStep] = []
            // Work portion (skip if rest-only pair).
            if b.pair.workDistanceM != nil || b.pair.workDurationS != nil {
                stepsInBlock.append(workIntervalStep(Step(
                    kind: "work",
                    distanceM: b.pair.workDistanceM,
                    durationS: b.pair.workDurationS,
                    restS: nil,
                    label: nil
                )))
            }
            if let r = b.pair.restS, r > 0 {
                stepsInBlock.append(restIntervalStep(seconds: r))
            }
            guard !stepsInBlock.isEmpty else { continue }
            intervalBlocks.append(IntervalBlock(steps: stepsInBlock, iterations: max(1, b.count)))
        }

        // --- Warmup / cooldown steps -----------------------------------------
        // COMPILE-RISK (WarmupStep/CooldownStep): names + initializer uncertain.
        // Candidates: WorkoutStep with goal, or dedicated WarmupStep/CooldownStep.
        var wuStep: WorkoutStep?
        if let w = warmup {
            if let m = w.distanceM, m > 0 {
                wuStep = WorkoutStep(goal: distanceGoal(m))
            } else if let sec = w.durationS, sec > 0 {
                wuStep = WorkoutStep(goal: timeGoal(sec))
            } else {
                wuStep = WorkoutStep(goal: .open)
            }
        }
        var cdStep: WorkoutStep?
        if let c = cooldown {
            if let m = c.distanceM, m > 0 {
                cdStep = WorkoutStep(goal: distanceGoal(m))
            } else if let sec = c.durationS, sec > 0 {
                cdStep = WorkoutStep(goal: timeGoal(sec))
            } else {
                cdStep = WorkoutStep(goal: .open)
            }
        }

        guard wuStep != nil || cdStep != nil || !intervalBlocks.isEmpty else {
            throw SwimBuildError.empty
        }

        // --- Pool length location --------------------------------------------
        // COMPILE-RISK (pool length): expressing pool length in WorkoutKit is the
        // least certain part. HealthKit models lap length via
        // HKWorkoutSwimmingLocationType + a swimming lap length quantity, but
        // WorkoutKit's CustomWorkout may NOT expose pool length at all in this
        // SDK. If it does, it is likely on a swimming-specific config. For now we
        // compute the value and FLAG that wiring it onto CustomWorkout must be
        // verified. The workout will still schedule without it; the watch may
        // prompt for pool length, or default. poolLengthMeters below is ready to
        // attach once the correct property is identified.
        let _poolLengthMeters: Double = {
            if poolUnit == "yd" { return poolLengthM > 0 ? poolLengthM : 22.86 } // 25yd
            return poolLengthM > 0 ? poolLengthM : 25.0
        }()
        _ = _poolLengthMeters // silence unused until wired (see COMPILE-RISK)

        // --- Assemble the CustomWorkout --------------------------------------
        // COMPILE-RISK (activity/location): the swimming activity + pool location.
        //   activity: .swimming
        //   location: .indoor   (pool swim => indoor / pool)
        // The exact enum names (HKWorkoutActivityType vs WorkoutKit's own) and the
        // CustomWorkout initializer parameter labels are uncertain. Candidate:
        //   CustomWorkout(activity: .swimming, location: .indoor,
        //                 displayName: title, warmup: wuStep,
        //                 blocks: intervalBlocks, cooldown: cdStep)
        let workout = CustomWorkout(
            activity: .swimming,
            location: .indoor,
            displayName: title,
            warmup: wuStep,
            blocks: intervalBlocks,
            cooldown: cdStep
        )

        return workout
    }

    @available(iOS 17.0, *)
    func parseScheduleDate(_ dateStr: String?) -> Date {
        guard let dateStr = dateStr, !dateStr.isEmpty else { return defaultScheduleTime(Date()) }

        // Try full ISO-8601 first.
        let iso = ISO8601DateFormatter()
        if let d = iso.date(from: dateStr) { return d }

        // Then yyyy-MM-dd (planned_workouts.date shape) → schedule at a sane
        // local hour so it shows up that day. Default 06:00 local.
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone.current
        if let d = df.date(from: dateStr) {
            return defaultScheduleTime(d)
        }
        return defaultScheduleTime(Date())
    }

    func defaultScheduleTime(_ day: Date) -> Date {
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: day)
        comps.hour = 6
        comps.minute = 0
        return Calendar.current.date(from: comps) ?? day
    }

    #endif // canImport(WorkoutKit)
}
