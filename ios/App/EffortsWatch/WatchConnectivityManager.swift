import Foundation
import WatchConnectivity

class WatchConnectivityManager: NSObject, ObservableObject {
    static let shared = WatchConnectivityManager()
    
    @Published var pendingWorkout: WorkoutData?
    @Published var isReachable = false
    
    private override init() {
        super.init()
        
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }
    
    func clearPendingWorkout() {
        DispatchQueue.main.async {
            self.pendingWorkout = nil
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            self.isReachable = session.isReachable
        }
    }
    
    // Receive message from iPhone
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        handleMessage(message)
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
        handleMessage(message)
        replyHandler(["received": true])
    }
    
    // Receive application context (persisted data)
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        handleMessage(applicationContext)
    }
    
    private func handleMessage(_ message: [String: Any]) {
        guard let action = message["action"] as? String else { return }
        
        switch action {
        case "sendWorkout":
            if let workoutData = message["workout"] as? Data {
                do {
                    let workout = try JSONDecoder().decode(WorkoutData.self, from: workoutData)
                    DispatchQueue.main.async {
                        self.pendingWorkout = workout
                    }
                } catch {
                    print("Error decoding workout: \(error.localizedDescription)")
                }
            }
        case "clearWorkout":
            DispatchQueue.main.async {
                self.pendingWorkout = nil
            }
        default:
            break
        }
    }
}

