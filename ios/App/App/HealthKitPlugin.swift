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
        
        // Types we want to read
        let readTypes: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .distanceCycling)!,
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
        ) { _, samples, error in
            if let error = error {
                call.reject("Failed to read workouts: \(error.localizedDescription)")
                return
            }
            
            let workouts = (samples as? [HKWorkout])?.map { workout -> [String: Any] in
                return [
                    "id": workout.uuid.uuidString,
                    "activityType": workout.workoutActivityType.rawValue,
                    "startDate": workout.startDate.timeIntervalSince1970 * 1000,
                    "endDate": workout.endDate.timeIntervalSince1970 * 1000,
                    "duration": workout.duration,
                    "totalDistance": workout.totalDistance?.doubleValue(for: .meter()) ?? 0,
                    "totalCalories": workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0,
                    "sourceName": workout.sourceRevision.source.name
                ]
            } ?? []
            
            call.resolve(["workouts": workouts])
        }
        
        healthStore.execute(query)
    }
}
