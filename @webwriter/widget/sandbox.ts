import {sandboxBootstrapSource} from "./sandbox-bootstrap.js"
export {sandboxBootstrapSource} from "./sandbox-bootstrap.js"
export {sandboxScriptHash} from "./sandbox-policy.js"

/** A self-contained HTML execution document for an opaque script sandbox.
 * Hosts with CSP must authorize sandboxScriptHash and use strict-dynamic.
 * The bootstrap refuses to execute outside an isolated opaque iframe.
 * This activates classic/module scripts, not inline event attributes or
 * document.write. Resources remain subject to the inherited CSP and CORS. */
export function sandboxDocument(html: string): string {
  const payload = JSON.stringify(html).replaceAll("<", "\\u003c")
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="application/json">${payload}</script><script>${sandboxBootstrapSource}</script></body></html>`
}

/** Replace an iframe's execution realm. Call on a new/detached iframe when
 * possible: sandbox permissions take effect at navigation, not retroactively.
 * No object URLs or host listeners are retained; the caller owns the frame. */
export function renderSandbox(frame: HTMLIFrameElement, html: string): void {
  frame.setAttribute("sandbox", "allow-scripts")
  frame.removeAttribute("src")
  frame.srcdoc = sandboxDocument(html)
}
