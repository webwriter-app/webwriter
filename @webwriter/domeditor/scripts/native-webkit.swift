import AppKit
import WebKit

final class SmokeNavigationDelegate: NSObject, WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    fputs("WKWebView loaded smoke fixture\n", stderr)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    fputs("WebKit navigation failed: \(error)\n", stderr)
    NSApp.terminate(nil)
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    fputs("WebKit navigation failed: \(error)\n", stderr)
    NSApp.terminate(nil)
  }
}

guard CommandLine.arguments.count == 2, let url = URL(string: CommandLine.arguments[1]) else {
  fputs("Usage: native-webkit.swift URL\n", stderr)
  exit(2)
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let configuration = WKWebViewConfiguration()
configuration.websiteDataStore = .nonPersistent()
let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 960), configuration: configuration)
let delegate = SmokeNavigationDelegate()
webView.navigationDelegate = delegate
let window = NSWindow(
  contentRect: NSRect(x: 0, y: 0, width: 1280, height: 960),
  styleMask: .borderless,
  backing: .buffered,
  defer: false
)
window.isReleasedWhenClosed = false
window.contentView = webView
// WebKit suspends animation frames for fully offscreen windows.
window.center()
window.makeKeyAndOrderFront(nil)
application.activate(ignoringOtherApps: true)
webView.load(URLRequest(url: url))
application.run()
