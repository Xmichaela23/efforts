import Foundation
import SwiftUI
import HealthKit
import WatchKit

// MARK: - Workout Data Models

struct WorkoutData: Codable {
    let id: String
    let name: String
    let type: String // "run" or "ride"
    let totalDurationSeconds: Int
    let steps: [WorkoutStep]
}

struct WorkoutStep: Codable {
    let kind: String // "warmup", "work", "recovery", "cooldown"
    let durationSeconds: Int?
    let distanceMeters: Double?
    let hrZone: Int?
    let hrRange: HRRange?
    let paceRange: PaceRange?
}

struct HRRange: Codable {
    let lower: Int
    let upper: Int
}

struct PaceRange: Codable {
    let lower: Double // seconds per mile
    let upper: Double
}

// MARK: - Workout Manager

class WorkoutManager: NSObject, ObservableObject {
    // MARK: - Published Properties
    
    @Published var isWorkoutActive = false
    @Published var isPaused = false
    @Published var currentStepIndex = 0
    @Published var stepTimeRemaining: String = "0:00"
    @Published var currentStepName: String = ""
    @Published var currentHeartRate: Int = 0
    @Published var currentZone: String? = nil
    @Published var elapsedTimeFormatted: String = "0:00"
    @Published var totalSteps: Int = 0
    
    var currentStepColor: Color {
        switch currentStepName.lowercased() {
        case "warmup", "warm up":
            return .yellow
        case "work", "hard", "interval":
            return .red
        case "recovery", "rest", "easy":
            return .green
        case "cooldown", "cool down":
            return .blue
        default:
            return .teal
        }
    }
    
    var zoneColor: Color {
        guard let zone = currentZone else { return .gray }
        switch zone {
        case "Z1", "Easy":
            return .blue
        case "Z2", "Moderate":
            return .green
        case "Z3", "Tempo":
            return .yellow
        case "Z4", "Threshold":
            return .orange
        case "Z5", "VO2max":
            return .red
        default:
            return .gray
        }
    }
    
    // MARK: - Private Properties
    
    private var workout: WorkoutData?
    private var healthStore = HKHealthStore()
    private var workoutSession: HKWorkoutSession?
    private var workoutBuilder: HKLiveWorkoutBuilder?
    
    private var stepTimer: Timer?
    private var stepSecondsRemaining: Int = 0
    private var totalElapsedSeconds: Int = 0
    private var workoutStartDate: Date?
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        requestHealthKitAuthorization()
    }
    
    // MARK: - HealthKit Authorization
    
    private func requestHealthKitAuthorization() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        
        let typesToShare: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKQuantityType.quantityType(forIdentifier: .heartRate)!,
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!,
        ]
        
        let typesToRead: Set<HKObjectType> = [
            HKQuantityType.quantityType(forIdentifier: .heartRate)!,
        ]
        
        healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead) { success, error in
            if let error = error {
                print("HealthKit authorization error: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Workout Control
    
    func startWorkout(_ workoutData: WorkoutData) {
        self.workout = workoutData
        self.totalSteps = workoutData.steps.count
        self.currentStepIndex = 0
        self.totalElapsedSeconds = 0
        self.workoutStartDate = Date()
        
        // Start HealthKit workout session
        startHealthKitSession(type: workoutData.type)
        
        // Start first step
        startStep(at: 0)
        
        isWorkoutActive = true
        isPaused = false
        
        // Haptic feedback
        WKInterfaceDevice.current().play(.start)
    }
    
    func pause() {
        isPaused = true
        stepTimer?.invalidate()
        workoutSession?.pause()
        WKInterfaceDevice.current().play(.stop)
    }
    
    func resume() {
        isPaused = false
        startStepTimer()
        workoutSession?.resume()
        WKInterfaceDevice.current().play(.start)
    }
    
    func skipToNextStep() {
        guard let workout = workout else { return }
        
        if currentStepIndex < workout.steps.count - 1 {
            currentStepIndex += 1
            startStep(at: currentStepIndex)
            WKInterfaceDevice.current().play(.click)
        }
    }
    
    func endWorkout() {
        stepTimer?.invalidate()
        
        // End HealthKit session
        workoutSession?.end()
        
        // Save workout
        workoutBuilder?.endCollection(withEnd: Date()) { success, error in
            self.workoutBuilder?.finishWorkout { workout, error in
                if let error = error {
                    print("Error finishing workout: \(error.localizedDescription)")
                }
            }
        }
        
        // Reset state
        isWorkoutActive = false
        isPaused = false
        currentStepIndex = 0
        workout = nil
        
        // Clear pending workout
        WatchConnectivityManager.shared.clearPendingWorkout()
        
        WKInterfaceDevice.current().play(.success)
    }
    
    // MARK: - Step Management
    
    private func startStep(at index: Int) {
        guard let workout = workout, index < workout.steps.count else {
            endWorkout()
            return
        }
        
        let step = workout.steps[index]
        currentStepIndex = index
        
        // Set step name
        currentStepName = stepKindToName(step.kind)
        
        // Set duration
        if let duration = step.durationSeconds {
            stepSecondsRemaining = duration
        } else {
            stepSecondsRemaining = 300 // Default 5 min if no duration
        }
        
        updateStepTimeDisplay()
        
        // Haptic for step change
        if index > 0 {
            WKInterfaceDevice.current().play(.notification)
        }
        
        // Start timer
        startStepTimer()
    }
    
    private func startStepTimer() {
        stepTimer?.invalidate()
        stepTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.timerTick()
        }
    }
    
    private func timerTick() {
        guard !isPaused else { return }
        
        totalElapsedSeconds += 1
        stepSecondsRemaining -= 1
        
        updateStepTimeDisplay()
        updateElapsedTimeDisplay()
        
        // Countdown haptics
        if stepSecondsRemaining <= 5 && stepSecondsRemaining > 0 {
            WKInterfaceDevice.current().play(.click)
        }
        
        // Step complete
        if stepSecondsRemaining <= 0 {
            advanceToNextStep()
        }
    }
    
    private func advanceToNextStep() {
        guard let workout = workout else { return }
        
        if currentStepIndex < workout.steps.count - 1 {
            currentStepIndex += 1
            startStep(at: currentStepIndex)
        } else {
            // Workout complete
            endWorkout()
        }
    }
    
    private func updateStepTimeDisplay() {
        let minutes = stepSecondsRemaining / 60
        let seconds = stepSecondsRemaining % 60
        stepTimeRemaining = String(format: "%d:%02d", minutes, seconds)
    }
    
    private func updateElapsedTimeDisplay() {
        let minutes = totalElapsedSeconds / 60
        let seconds = totalElapsedSeconds % 60
        elapsedTimeFormatted = String(format: "%d:%02d", minutes, seconds)
    }
    
    private func stepKindToName(_ kind: String) -> String {
        switch kind.lowercased() {
        case "warmup", "warm_up":
            return "Warmup"
        case "work", "interval":
            return "Hard"
        case "recovery", "rest":
            return "Recovery"
        case "cooldown", "cool_down":
            return "Cooldown"
        default:
            return kind.capitalized
        }
    }
    
    // MARK: - HealthKit Session
    
    private func startHealthKitSession(type: String) {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = type == "ride" ? .cycling : .running
        configuration.locationType = .outdoor
        
        do {
            workoutSession = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            workoutBuilder = workoutSession?.associatedWorkoutBuilder()
            
            workoutBuilder?.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            
            workoutSession?.delegate = self
            workoutBuilder?.delegate = self
            
            workoutSession?.startActivity(with: Date())
            workoutBuilder?.beginCollection(withStart: Date()) { success, error in
                if let error = error {
                    print("Error starting workout collection: \(error.localizedDescription)")
                }
            }
        } catch {
            print("Error creating workout session: \(error.localizedDescription)")
        }
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutManager: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        // Handle state changes if needed
    }
    
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        print("Workout session failed: \(error.localizedDescription)")
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let quantityType = type as? HKQuantityType else { continue }
            
            if quantityType == HKQuantityType.quantityType(forIdentifier: .heartRate) {
                let statistics = workoutBuilder.statistics(for: quantityType)
                if let heartRate = statistics?.mostRecentQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) {
                    DispatchQueue.main.async {
                        self.currentHeartRate = Int(heartRate)
                        self.updateZone()
                    }
                }
            }
        }
    }
    
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Handle events if needed
    }
    
    private func updateZone() {
        guard let workout = workout,
              currentStepIndex < workout.steps.count else { return }
        
        let step = workout.steps[currentStepIndex]
        
        if let hrRange = step.hrRange {
            if currentHeartRate < hrRange.lower {
                currentZone = "Speed up"
            } else if currentHeartRate > hrRange.upper {
                currentZone = "Slow down"
            } else {
                currentZone = "In Zone"
            }
        } else {
            currentZone = nil
        }
    }
}

