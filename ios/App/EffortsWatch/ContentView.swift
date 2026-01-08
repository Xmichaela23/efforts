import SwiftUI

struct ContentView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    @EnvironmentObject var connectivityManager: WatchConnectivityManager
    
    var body: some View {
        NavigationStack {
            Group {
                if workoutManager.isWorkoutActive {
                    WorkoutView()
                } else if let workout = connectivityManager.pendingWorkout {
                    WorkoutPreviewView(workout: workout)
                } else {
                    WaitingView()
                }
            }
        }
    }
}

// MARK: - Waiting View (No workout received)

struct WaitingView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "figure.run")
                .font(.system(size: 40))
                .foregroundColor(.teal)
            
            Text("Efforts")
                .font(.headline)
            
            Text("Send a workout from your phone")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

// MARK: - Workout Preview (Ready to start)

struct WorkoutPreviewView: View {
    let workout: WorkoutData
    @EnvironmentObject var workoutManager: WorkoutManager
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Workout name
                Text(workout.name)
                    .font(.headline)
                    .multilineTextAlignment(.center)
                
                // Duration
                if workout.totalDurationSeconds > 0 {
                    HStack {
                        Image(systemName: "clock")
                        Text("\(workout.totalDurationSeconds / 60) min")
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
                
                // Intervals summary
                Text("\(workout.steps.count) intervals")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                // Start button
                Button(action: {
                    workoutManager.startWorkout(workout)
                }) {
                    Text("Start")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
            }
            .padding()
        }
    }
}

// MARK: - Active Workout View

struct WorkoutView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    
    var body: some View {
        TabView {
            // Main metrics view
            MetricsView()
            
            // Controls view
            ControlsView()
        }
        .tabViewStyle(.page)
    }
}

// MARK: - Metrics View

struct MetricsView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    
    var body: some View {
        VStack(spacing: 4) {
            // Current step name
            Text(workoutManager.currentStepName)
                .font(.caption)
                .foregroundColor(workoutManager.currentStepColor)
            
            // Time remaining in step
            Text(workoutManager.stepTimeRemaining)
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .monospacedDigit()
            
            // Heart rate
            HStack(spacing: 4) {
                Image(systemName: "heart.fill")
                    .foregroundColor(.red)
                Text("\(workoutManager.currentHeartRate)")
                    .font(.title2)
                    .fontWeight(.semibold)
            }
            
            // Zone indicator
            if let zone = workoutManager.currentZone {
                Text(zone)
                    .font(.caption2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(workoutManager.zoneColor.opacity(0.3))
                    .cornerRadius(4)
            }
            
            // Step progress
            Text("\(workoutManager.currentStepIndex + 1) / \(workoutManager.totalSteps)")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding()
    }
}

// MARK: - Controls View

struct ControlsView: View {
    @EnvironmentObject var workoutManager: WorkoutManager
    
    var body: some View {
        VStack(spacing: 16) {
            // Elapsed time
            Text(workoutManager.elapsedTimeFormatted)
                .font(.title3)
                .monospacedDigit()
            
            HStack(spacing: 20) {
                // Pause/Resume
                Button(action: {
                    if workoutManager.isPaused {
                        workoutManager.resume()
                    } else {
                        workoutManager.pause()
                    }
                }) {
                    Image(systemName: workoutManager.isPaused ? "play.fill" : "pause.fill")
                        .font(.title2)
                }
                .buttonStyle(.bordered)
                
                // Skip interval
                Button(action: {
                    workoutManager.skipToNextStep()
                }) {
                    Image(systemName: "forward.fill")
                        .font(.title2)
                }
                .buttonStyle(.bordered)
                
                // End workout
                Button(action: {
                    workoutManager.endWorkout()
                }) {
                    Image(systemName: "xmark")
                        .font(.title2)
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }
        }
        .padding()
    }
}

#Preview {
    ContentView()
        .environmentObject(WorkoutManager())
        .environmentObject(WatchConnectivityManager.shared)
}

