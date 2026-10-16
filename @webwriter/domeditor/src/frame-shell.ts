import {editorHostOrigin} from "./frame-origins"
import {connectFrameLocalPackages} from "./frame-local-packages"
import {openFrameLinksInNewTabs} from "./frame-links"

const parameters = new URL(location.href).searchParams
const kind = parameters.get("kind")
const hostOrigin = kind === "package-test" ? location.origin : editorHostOrigin()
const revision = parameters.get("revision")
const nonce = new URLSearchParams(location.hash.slice(1)).get("nonce")
const instanceId = crypto.randomUUID()
const navigation = (window as Window & {navigation?: {
  addEventListener: (type: "navigate", listener: (event: Event & {destination: {sameDocument: boolean}}) => void) => void
}}).navigation

const receiveDocument = (event: MessageEvent) => {
  if(event.source !== window.parent || event.origin !== hostOrigin) return
  if(event.data?.type !== "webwriter-frame-document" || typeof event.data.html !== "string"
    || event.data.html.length > 50_000_000) return
  window.removeEventListener("message", receiveDocument)
  if(kind === "editor" || kind === "preview") {
    if(!navigation) {
      const imported = new DOMParser().parseFromString(event.data.html, "text/html")
      const hasRefresh = Array.from(imported.querySelectorAll<HTMLMetaElement>("meta[http-equiv]"))
        .some(meta => meta.namespaceURI === "http://www.w3.org/1999/xhtml" && meta.httpEquiv.trim().toLowerCase() === "refresh")
      if(hasRefresh) {
        const message = "This browser cannot open documents with automatic refresh redirects. Open this document in a newer browser."
        window.parent.postMessage({type: "webwriter-frame-error", kind, revision, bridgeNonce: nonce, message}, hostOrigin)
        const alert = document.createElement("p")
        alert.setAttribute("role", "alert")
        alert.textContent = message
        Object.assign(alert.style, {margin: "2rem", font: "16px system-ui", color: "#8a1c13"})
        document.body.replaceChildren(alert)
        return
      }
    }
    else {
      navigation.addEventListener("navigate", navigationEvent => {
        if(!navigationEvent.destination.sameDocument) navigationEvent.preventDefault()
      })
    }
  }
  document.open()
  document.write(event.data.html)
  document.close()
  openFrameLinksInNewTabs(window)
}

window.addEventListener("message", receiveDocument)
if(window.parent !== window && (kind === "editor" || kind === "preview" || kind === "package-test") && nonce) {
  connectFrameLocalPackages(hostOrigin, nonce)
  // The frame's worker proxies local package files before widget modules run.
  // Wait until it controls this document, including on the first visit.
  const base = new URL(import.meta.env.BASE_URL, location.href)
  const ready = () => window.parent.postMessage({type: "webwriter-frame-shell-ready", kind, revision, instanceId,
    bridgeNonce: nonce}, hostOrigin)
  if(!navigator.serviceWorker) ready()
  else void navigator.serviceWorker.register(new URL("local-package-service-worker.js", base), {
    scope: base.pathname, type: "module",
  }).then(async () => {
    if(!navigator.serviceWorker.controller) await new Promise<void>(resolve => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {once: true})
    })
    ready()
  }).catch(ready)
}
