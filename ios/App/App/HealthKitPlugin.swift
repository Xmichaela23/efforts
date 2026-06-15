import Foundation
import Capacitor
import HealthKit

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkouts", returnType: CAPPluginReturnPromise)
    ]
    
    private let healthStore = HKHealthStore()
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        print("[HealthKitPlugin] isAvailable called")
        let available = HKHealthStore.isHealthDataAvailable()
        call.resolve(["available": available])
    }
    
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["authorized": false])
            return
        }
        
        // Types we want to read (+ swim: distance + stroke count for the rich swim fields Strava strips)
        let readTypes: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .distanceCycling)!,
            HKObjectType.quantityType(forIdentifier: .distanceSwimming)!,
            HKObjectType.quantityType(forIdentifier: .swimmingStrokeCount)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        ]
        
        // Types we want to write
        let writeTypes: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .distanceCycling)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!
        ]
        
        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["authorized": success])
        }
    }
    
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard let activityTypeRaw = call.getInt("activityType"),
              let startDateMs = call.getDouble("startDate"),
              let endDateMs = call.getDouble("endDate") else {
            call.reject("Missing required parameters")
            return
        }
        
        let activityType = HKWorkoutActivityType(rawValue: UInt(activityTypeRaw)) ?? .other
        let startDate = Date(timeIntervalSince1970: startDateMs / 1000)
        let endDate = Date(timeIntervalSince1970: endDateMs / 1000)
        
        _ = call.getDouble("totalDistance")
        _ = call.getDouble("totalCalories")
        
        var metadata: [String: Any] = [:]
        if let workoutName = call.getString("workoutName") {
            metadata[HKMetadataKeyWorkoutBrandName] = workoutName
        }
        
        // Build the workout
        let builder = HKWorkoutBuilder(healthStore: healthStore, configuration: HKWorkoutConfiguration(), device: nil)
        
        builder.beginCollection(withStart: startDate) { success, error in
            guard success else {
                call.reject("Failed to begin collection: \(error?.localizedDescription ?? "Unknown error")")
                return
            }
            
            builder.endCollection(withEnd: endDate) { success, error in
                guard success else {
                    call.reject("Failed to end collection: \(error?.localizedDescription ?? "Unknown error")")
                    return
                }
                
                builder.finishWorkout { workout, error in
                    guard let workout = workout else {
                        call.reject("Failed to save workout: \(error?.localizedDescription ?? "Unknown error")")
                        return
                    }
                    
                    call.resolve([
                        "success": true,
                        "workoutId": workout.uuid.uuidString
                    ])
                }
            }
        }
    }
    
    @objc func readWorkouts(_ call: CAPPluginCall) {
        let limit = call.getInt("limit") ?? 50

        let workoutType = HKObjectType.workoutType()
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(
            sampleType: workoutType,
            predicate: nil,
            limit: limit,
            sortDescriptors: [sortDescriptor]
        ) { [weak self] _, samples, error in
            guard let self = self else { call.resolve(["workouts": []]); return }
            if let error = error {
                call.reject("Failed to read workouts: \(error.localizedDescription)")
                return
            }

            let workouts = (samples as? [HKWorkout]) ?? []
            var out: [[String: Any]] = []
            let lock = NSLock()
            let group = DispatchGroup()

            for workout in workouts {
                var dict: [String: Any] = [
                    "id": workout.uuid.uuidString,
                    "activityType": workout.workoutActivityType.rawValue,
                    "startDate": workout.startDate.timeIntervalSince1970 * 1000,
                    "endDate": workout.endDate.timeIntervalSince1970 * 1000,
                    "duration": workout.duration, // seconds-precise (the value Strava rounds to minutes)
                    "totalDistance": workout.totalDistance?.doubleValue(for: .meter()) ?? 0,
                    "totalCalories": workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0,
                    "sourceName": workout.sourceRevision.source.name
                ]

                // SWIM enrichment — the rich fields Strava strips. Pool length is in workout
                // metadata (sync); stroke count + avg HR need statistics queries (async).
                if workout.workoutActivityType == .swimming {
                    if let lap = workout.metadata?[HKMetadataKeyLapLength] as? HKQuantity {
                        dict["pool_length"] = lap.doubleValue(for: .meter()) // real device pool length
                    }
                    group.enter()
                    self.swimStats(for: workout) { strokes, avgHr in
                        if let s = strokes { dict["strokes"] = s }
                        if let h = avgHr { dict["avgHr"] = h }
                        lock.lock(); out.append(dict); lock.unlock()
                        group.leave()
                    }
                } else {
                    lock.lock(); out.append(dict); lock.unlock()
                }
            }

            group.notify(queue: .main) {
                call.resolve(["workouts": out])
            }
        }

        healthStore.execute(query)
    }

    // Per-swim statistics: cumulative stroke count + average HR over the workout window.
    private func swimStats(for workout: HKWorkout, completion: @escaping (Double?, Double?) -> Void) {
        let predicate = HKQuery.predicateForObjects(from: workout)
        var strokes: Double? = nil
        var avgHr: Double? = nil
        let g = DispatchGroup()

        if let strokeType = HKObjectType.quantityType(forIdentifier: .swimmingStrokeCount) {
            g.enter()
            let q = HKStatisticsQuery(quantityType: strokeType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                strokes = stats?.sumQuantity()?.doubleValue(for: .count())
                g.leave()
            }
            healthStore.execute(q)
        }
        if let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            g.enter()
            let bpm = HKUnit.count().unitDivided(by: .minute())
            let q = HKStatisticsQuery(quantityType: hrType, quantitySamplePredicate: predicate, options: .discreteAverage) { _, stats, _ in
                avgHr = stats?.averageQuantity()?.doubleValue(for: bpm)
                g.leave()
            }
            healthStore.execute(q)
        }

        g.notify(queue: .main) { completion(strokes, avgHr) }
    }
}
