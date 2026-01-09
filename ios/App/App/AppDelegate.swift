import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var pluginsRegistered = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Schedule plugin registration after a short delay to ensure bridge is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.registerPluginsIfNeeded()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Also try to register on become active as a fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.registerPluginsIfNeeded()
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }
    
    private func registerPluginsIfNeeded() {
        guard !pluginsRegistered else { return }
        
        guard let vc = window?.rootViewController as? CAPBridgeViewController,
              let bridge = vc.bridge else {
            print("[AppDelegate] Bridge not ready yet, will retry...")
            // Retry after a delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.registerPluginsIfNeeded()
            }
            return
        }
        
        print("[AppDelegate] Registering plugins...")
        bridge.registerPluginInstance(HealthKitPlugin())
        bridge.registerPluginInstance(WatchConnectivityPlugin())
        bridge.registerPluginInstance(BluetoothHRPlugin())
        pluginsRegistered = true
        print("[AppDelegate] Plugins registered!")
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
