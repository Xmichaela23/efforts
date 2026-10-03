import UIKit
import Capacitor

/**
 * The app's bridge view controller (Main.storyboard). Registers the app's own plugins in `capacitorDidLoad`, which
 * runs BEFORE the web page loads, so the page sees them from its first call.
 *
 * ⛔ WHY (2026-10-02): `PlanSheetPdfPlugin` was registered from AppDelegate on a timer, after "WebView loaded". The
 * page had already been told which native plugins exist, so every Share / Save to Files tap failed in JavaScript
 * ("The PDF was not made.") and never reached native. This is Capacitor's documented place for a local plugin.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PlanSheetPdfPlugin())
    }
}
