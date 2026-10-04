import {editorHostOrigin} from "./frame-origins"
import {connectFrameLocalPackages} from "./frame-local-packages"

const hostOrigin = editorHostOrigin()
const parameters = new URL(location.href).searchParams
const kind = parameters.get("kind")
const revision = parameters.get("revision")
const nonce = new URLSearchParams(location.hash.slice(1)).get("nonce")
const instanceId = crypto.randomUUID()

const receiveDocument = (event: MessageEvent) => {
  if(event.source !== window.parent || event.origin !== hostOrigin) return
  if(event.data?.type !== "webwriter-frame-document" || typeof event.data.html !== "string"
    || event.data.html.length > 50_000_000) return
  window.removeEventListener("message", receiveDocument)
  document.open()
  document.write(event.data.html)
  document.close()
}

window.addEventListener("message", receiveDocument)
if(window.parent !== window && (kind === "editor" || kind === "preview") && nonce) {
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
