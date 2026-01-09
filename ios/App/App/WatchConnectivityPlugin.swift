import Foundation
import Capacitor
import WatchConnectivity

@objc(WatchConnectivityPlugin)
public class WatchConnectivityPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchConnectivityPlugin"
    public let jsName = "WatchConnectivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPaired", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isReachable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearWorkout", returnType: CAPPluginReturnPromise)
    ]
    
    private var session: WCSession?
    
    public override func load() {
        if WCSession.isSupported() {
            session = WCSession.default
            session?.delegate = self
            session?.activate()
        }
    }
    
    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": WCSession.isSupported()])
    }
    
    @objc func isPaired(_ call: CAPPluginCall) {
        guard let session = session else {
            call.resolve(["paired": false])
            return
        }
        call.resolve(["paired": session.isPaired])
    }
    
    @objc func isReachable(_ call: CAPPluginCall) {
        guard let session = session else {
            call.resolve(["reachable": false])
            return
        }
        call.resolve(["reachable": session.isReachable])
    }
    
    @objc func sendWorkout(_ call: CAPPluginCall) {
        guard let workoutJson = call.getString("workout") else {
            call.reject("Missing workout data")
            return
        }
        
        guard let session = session, session.isPaired else {
            call.reject("Watch not paired")
            return
        }
        
        let message = ["workout": workoutJson]
        
        // Try to send directly if reachable
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in
                call.resolve(["sent": true, "method": "message"])
            }, errorHandler: { error in
                // Fall back to application context
                self.sendViaApplicationContext(message: message, call: call)
            })
        } else {
            // Use application context for background transfer
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
            call.resolve(["sent": true, "method": "applicationContext"])
        } catch {
            call.reject("Failed to send: \(error.localizedDescription)")
        }
    }
    
    @objc func clearWorkout(_ call: CAPPluginCall) {
        guard let session = session else {
            call.reject("Session not available")
            return
        }
        
        do {
            try session.updateApplicationContext(["workout": ""])
            call.resolve(["cleared": true])
        } catch {
            call.reject("Failed to clear: \(error.localizedDescription)")
        }
    }
    
    // MARK: - WCSessionDelegate
    
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // Session activated
    }
    
    public func sessionDidBecomeInactive(_ session: WCSession) {
        // Session became inactive
    }
    
    public func sessionDidDeactivate(_ session: WCSession) {
        // Session deactivated - reactivate
        session.activate()
    }
}
