import "./preview-entry"

const bridge = document.querySelector<HTMLMetaElement>('meta[name="webwriter-preview-bridge"]')
const hostOrigin = bridge?.getAttribute("data-host-origin")
const bridgeNonce = bridge?.getAttribute("data-nonce")
const tag = new URL(import.meta.url).searchParams.get("tag")

if(hostOrigin && bridgeNonce && window.parent !== window) {
  const post = (detail: object) => window.parent.postMessage({...detail, bridgeNonce}, hostOrigin)
  const fail = (message: string) => post({type: "gallery-preview-error", message})
  const error = (event: ErrorEvent | Event) => {
    if(event instanceof ErrorEvent) fail(event.message)
    else if(event.target instanceof HTMLScriptElement) fail("A widget script could not be loaded.")
  }
  const rejection = (event: PromiseRejectionEvent) => fail(String(event.reason?.message ?? event.reason))
  window.addEventListener("error", error, true)
  window.addEventListener("unhandledrejection", rejection)
  const observer = new ResizeObserver(() => {
    const height = Math.ceil(document.body.getBoundingClientRect().height)
    post({type: "gallery-preview-height", height})
  })
  observer.observe(document.body)
  const ready = () => post({type: "gallery-preview-ready"})
  if(tag) void customElements.whenDefined(tag).then(ready).catch(error => fail(String(error)))
  else ready()
  window.addEventListener("pagehide", () => {
    observer.disconnect()
    window.removeEventListener("error", error, true)
    window.removeEventListener("unhandledrejection", rejection)
  }, {once: true})
}
