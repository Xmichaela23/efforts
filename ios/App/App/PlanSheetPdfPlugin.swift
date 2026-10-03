import Foundation
import Capacitor
import UIKit
import WebKit

/**
 * PlanSheetPdfPlugin — the plan sheet as a PDF on the iPhone (2026-10-02, docs/WORKORDER-plan-sheet-2026-10-02.md).
 *
 * `makePdf({ html, filename })` loads the sheet's one page (`src/lib/plan-sheet-html.ts`) into an off-screen web view,
 * paginates it onto US Letter pages with iOS's own print renderer (so the page's print styles apply), writes the PDF to
 * the app's cache and returns its file URL. `saveToFiles({ uri })` opens the Files save picker for that file. Sharing is
 * Capacitor Share on the returned URL, as "Download your data" does.
 *
 * On-device only. No network call of its own (the page may fetch its web fonts; it falls back to the system face).
 */
@objc(PlanSheetPdfPlugin)
public class PlanSheetPdfPlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate, UIDocumentPickerDelegate {
    public let identifier = "PlanSheetPdfPlugin"
    public let jsName = "PlanSheetPdf"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "makePdf", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToFiles", returnType: CAPPluginReturnPromise)
    ]

    private var pdfView: WKWebView?
    private var pendingPdfCall: CAPPluginCall?
    private var pendingFilename = "plan-sheet.pdf"
    private var pendingSaveCall: CAPPluginCall?

    // US Letter, 12 mm margins — the same page the web prints (`@page` in plan-sheet-html.ts).
    private let pageSize = CGSize(width: 612, height: 792)
    private let margin: CGFloat = 34

    // MARK: - makePdf

    @objc func makePdf(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), !html.isEmpty else {
            call.reject("No page to print")
            return
        }
        let raw = call.getString("filename") ?? "plan-sheet.pdf"
        let safe = raw.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "-", options: .regularExpression)
        pendingFilename = safe.lowercased().hasSuffix(".pdf") ? safe : "\(safe).pdf"

        DispatchQueue.main.async {
            if self.pendingPdfCall != nil {
                call.reject("A PDF is already being made")
                return
            }
            self.pendingPdfCall = call
            let config = WKWebViewConfiguration()
            let wv = WKWebView(frame: CGRect(origin: .zero, size: self.pageSize), configuration: config)
            wv.navigationDelegate = self
            wv.isHidden = true
            // Off screen but in the window, so WebKit lays the page out and loads its fonts.
            self.bridge?.viewController?.view.addSubview(wv)
            self.pdfView = wv
            wv.loadHTMLString(html, baseURL: URL(string: "https://efforts.work/"))
        }
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A short pause for the web fonts; the PDF falls back to the system face if they are not in yet.
        webView.evaluateJavaScript("document.fonts ? document.fonts.ready.then(() => true) : true") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.renderPdf(webView) }
        }
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finishPdf(error: "The page did not load: \(error.localizedDescription)")
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finishPdf(error: "The page did not load: \(error.localizedDescription)")
    }

    private func renderPdf(_ webView: WKWebView) {
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let paper = CGRect(origin: .zero, size: pageSize)
        let printable = paper.insetBy(dx: margin, dy: margin)
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, nil)
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: renderer.numberOfPages))
        let bounds = UIGraphicsGetPDFContextBounds()
        for i in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: bounds)
        }
        UIGraphicsEndPDFContext()

        let url = FileManager.default.temporaryDirectory.appendingPathComponent(pendingFilename)
        do {
            try? FileManager.default.removeItem(at: url)
            try (data as Data).write(to: url, options: .atomic)
            let call = pendingPdfCall
            cleanUpWebView()
            call?.resolve(["uri": url.absoluteString, "pages": renderer.numberOfPages])
        } catch {
            finishPdf(error: "The PDF was not written: \(error.localizedDescription)")
        }
    }

    private func finishPdf(error: String) {
        let call = pendingPdfCall
        cleanUpWebView()
        call?.reject(error)
    }

    private func cleanUpWebView() {
        pdfView?.navigationDelegate = nil
        pdfView?.removeFromSuperview()
        pdfView = nil
        pendingPdfCall = nil
    }

    // MARK: - saveToFiles

    @objc func saveToFiles(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri"), let url = URL(string: uri), url.isFileURL else {
            call.reject("No file to save")
            return
        }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.reject("No screen to show the picker on")
                return
            }
            self.pendingSaveCall = call
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            picker.delegate = self
            vc.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        pendingSaveCall?.resolve(["saved": true])
        pendingSaveCall = nil
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingSaveCall?.resolve(["saved": false])
        pendingSaveCall = nil
    }
}
