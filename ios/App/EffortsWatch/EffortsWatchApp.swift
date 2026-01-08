import SwiftUI

@main
struct EffortsWatchApp: App {
    @StateObject private var workoutManager = WorkoutManager()
    @StateObject private var connectivityManager = WatchConnectivityManager.shared
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(workoutManager)
                .environmentObject(connectivityManager)
        }
    }
}

