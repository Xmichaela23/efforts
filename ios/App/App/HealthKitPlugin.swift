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
        CAPPluginMethod(name: "readWorkouts", returnType: CAPPluginReturnPromise),
    ]
    
    private let healthStore = HKHealthStore()
    
    // MARK: - Check Availability
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }
    
    // MARK: - Request Authorization
    
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit is not available on this device")
            return
        }
        
        // Types to read
        let readTypes: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .distanceCycling)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
        ]
        
        // Types to write
        let writeTypes: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.quantityType(forIdentifier: .distanceCycling)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        ]
        
        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            if let error = error {
                call.reject("Authorization failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["authorized": success])
        }
    }
    
    // MARK: - Save Workout
    
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard let activityTypeRaw = call.getInt("activityType"),
              let startTimestamp = call.getDouble("startDate"),
              let endTimestamp = call.getDouble("endDate") else {
            call.reject("Missing required parameters: activityType, startDate, endDate")
            return
        }
        
        let activityType = HKWorkoutActivityType(rawValue: UInt(activityTypeRaw)) ?? .running
        let startDate = Date(timeIntervalSince1970: startTimestamp / 1000)
        let endDate = Date(timeIntervalSince1970: endTimestamp / 1000)
        
        let totalDistance = call.getDouble("totalDistance") // meters
        let totalCalories = call.getDouble("totalCalories")
        let averageHeartRate = call.getDouble("averageHeartRate")
        
        var metadata: [String: Any] = [:]
        if let workoutName = call.getString("workoutName") {
            metadata[HKMetadataKeyWorkoutBrandName] = "Efforts"
            metadata["WorkoutName"] = workoutName
        }
        
        // Build workout
        let workoutBuilder = HKWorkoutBuilder(healthStore: healthStore, configuration: HKWorkoutConfiguration(), device: nil)
        
        workoutBuilder.beginCollection(withStart: startDate) { success, error in
            guard success else {
                call.reject("Failed to begin workout collection: \(error?.localizedDescription ?? "Unknown error")")
                return
            }
            
            var samples: [HKSample] = []
            
            // Add distance sample
            if let distance = totalDistance, distance > 0 {
                let distanceType = activityType == .cycling 
                    ? HKQuantityType.quantityType(forIdentifier: .distanceCycling)!
                    : HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!
                let distanceQuantity = HKQuantity(unit: .meter(), doubleValue: distance)
                let distanceSample = HKQuantitySample(type: distanceType, quantity: distanceQuantity, start: startDate, end: endDate)
                samples.append(distanceSample)
            }
            
            // Add calories sample
            if let calories = totalCalories, calories > 0 {
                let caloriesType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!
                let caloriesQuantity = HKQuantity(unit: .kilocalorie(), doubleValue: calories)
                let caloriesSample = HKQuantitySample(type: caloriesType, quantity: caloriesQuantity, start: startDate, end: endDate)
                samples.append(caloriesSample)
            }
            
            // Add samples to workout
            if !samples.isEmpty {
                workoutBuilder.add(samples) { success, error in
                    if let error = error {
                        print("Failed to add samples: \(error.localizedDescription)")
                    }
                }
            }
            
            // End collection and save
            workoutBuilder.endCollection(withEnd: endDate) { success, error in
                guard success else {
                    call.reject("Failed to end workout collection: \(error?.localizedDescription ?? "Unknown error")")
                    return
                }
                
                workoutBuilder.finishWorkout { workout, error in
                    if let error = error {
                        call.reject("Failed to save workout: \(error.localizedDescription)")
                        return
                    }
                    
                    guard let workout = workout else {
                        call.reject("Workout was nil after saving")
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
    
    // MARK: - Read Workouts
    
    @objc func readWorkouts(_ call: CAPPluginCall) {
        let limit = call.getInt("limit") ?? 50
        let startTimestamp = call.getDouble("startDate")
        let endTimestamp = call.getDouble("endDate")
        
        var predicate: NSPredicate? = nil
        
        if let start = startTimestamp, let end = endTimestamp {
            let startDate = Date(timeIntervalSince1970: start / 1000)
            let endDate = Date(timeIntervalSince1970: end / 1000)
            predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        }
        
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        
        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: limit,
            sortDescriptors: [sortDescriptor]
        ) { query, samples, error in
            if let error = error {
                call.reject("Failed to read workouts: \(error.localizedDescription)")
                return
            }
            
            guard let workouts = samples as? [HKWorkout] else {
                call.resolve(["workouts": []])
                return
            }
            
            let workoutData = workouts.map { workout -> [String: Any] in
                var data: [String: Any] = [
                    "id": workout.uuid.uuidString,
                    "activityType": workout.workoutActivityType.rawValue,
                    "startDate": workout.startDate.timeIntervalSince1970 * 1000,
                    "endDate": workout.endDate.timeIntervalSince1970 * 1000,
                    "duration": workout.duration,
                ]
                
                if let distance = workout.totalDistance {
                    data["totalDistance"] = distance.doubleValue(for: .meter())
                }
                
                if let energy = workout.totalEnergyBurned {
                    data["totalCalories"] = energy.doubleValue(for: .kilocalorie())
                }
                
                if let sourceName = workout.sourceRevision.source.name {
                    data["sourceName"] = sourceName
                }
                
                return data
            }
            
            call.resolve(["workouts": workoutData])
        }
        
        healthStore.execute(query)
    }
}

