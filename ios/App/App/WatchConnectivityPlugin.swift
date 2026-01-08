import Foundation
import Capacitor
import WatchConnectivity

@objc(WatchConnectivityPlugin)
public class WatchConnectivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchConnectivityPlugin"
    public let jsName = "WatchConnectivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPaired", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isReachable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearWorkout", returnType: CAPPluginReturnPromise),
    ]
    
    private var session: WCSession?
    
    public override func load() {
        if WCSession.isSupported() {
            session = WCSession.default
            session?.delegate = self
            session?.activate()
        }
    }
    
    // MARK: - Check Support
    
    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": WCSession.isSupported()])
    }
    
    // MARK: - Check Paired
    
    @objc func isPaired(_ call: CAPPluginCall) {
        guard let session = session else {
            call.resolve(["paired": false])
            return
        }
        call.resolve(["paired": session.isPaired])
    }
    
    // MARK: - Check Reachable
    
    @objc func isReachable(_ call: CAPPluginCall) {
        guard let session = session else {
            call.resolve(["reachable": false])
            return
        }
        call.resolve(["reachable": session.isReachable])
    }
    
    // MARK: - Send Workout to Watch
    
    @objc func sendWorkout(_ call: CAPPluginCall) {
        guard let session = session else {
            call.reject("WatchConnectivity not available")
            return
        }
        
        guard session.isPaired else {
            call.reject("Apple Watch not paired")
            return
        }
        
        guard let workoutJson = call.getString("workout") else {
            call.reject("Missing workout data")
            return
        }
        
        guard let workoutData = workoutJson.data(using: .utf8) else {
            call.reject("Invalid workout data")
            return
        }
        
        let message: [String: Any] = [
            "action": "sendWorkout",
            "workout": workoutData
        ]
        
        // Try to send immediately if reachable
        if session.isReachable {
            session.sendMessage(message, replyHandler: { reply in
                call.resolve(["sent": true, "method": "message"])
            }, errorHandler: { error in
                // Fall back to application context
                self.sendViaApplicationContext(message: message, call: call)
            })
        } else {
            // Use application context (persisted)
            sendViaApplicationContext(message: message, call: call)
        }
    }
    
    private func sendViaApplicationContext(message: [String: Any], call: CAPPluginCall) {
        guard let session = session else {
            call.reject("Session not available")
            return
        }
        
        do {
            try session.updateApplicationContext(message)
            call.resolve(["sent": true, "method": "context"])
        } catch {
            call.reject("Failed to send: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Clear Workout
    
    @objc func clearWorkout(_ call: CAPPluginCall) {
        guard let session = session else {
            call.reject("WatchConnectivity not available")
            return
        }
        
        let message: [String: Any] = ["action": "clearWorkout"]
        
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in
                call.resolve(["cleared": true])
            }, errorHandler: { error in
                call.reject("Failed to clear: \(error.localizedDescription)")
            })
        } else {
            do {
                try session.updateApplicationContext(message)
                call.resolve(["cleared": true])
            } catch {
                call.reject("Failed to clear: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityPlugin: WCSessionDelegate {
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error = error {
            print("WCSession activation failed: \(error.localizedDescription)")
        }
    }
    
    public func sessionDidBecomeInactive(_ session: WCSession) {
        // Handle inactive state
    }
    
    public func sessionDidDeactivate(_ session: WCSession) {
        // Reactivate session
        session.activate()
    }
    
    public func sessionReachabilityDidChange(_ session: WCSession) {
        // Notify JS about reachability change
        notifyListeners("reachabilityChanged", data: ["reachable": session.isReachable])
    }
}

