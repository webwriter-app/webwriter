import {stripActiveContent} from "./active-content"
import {LivePreview, previewElementAtPath, previewElementPath, previewWidgetElements} from "./live-preview"
import type {LiveSessionWidgetState} from "./live-session"

const bridge = document.querySelector<HTMLMetaElement>('meta[name="webwriter-preview-bridge"]')
const nonce = bridge?.getAttribute("data-nonce")
const hostOrigin = bridge?.getAttribute("data-host-origin")

if(nonce && hostOrigin && window.parent !== window) {
  const preview = new LivePreview()
  const post = (message: object) => window.parent.postMessage({...message, bridgeNonce: nonce}, hostOrigin)
  const frame = {contentWindow: window}
  const positions = () => {
    const width = window.innerWidth || document.documentElement.clientWidth || 1
    const height = window.innerHeight || document.documentElement.clientHeight || 1
    const widgets = previewWidgetElements(document).flatMap(widget => {
      const path = previewElementPath(widget, document)
      if(!path) return []
      const rect = widget.getBoundingClientRect()
      return [{path: JSON.stringify(path),
        x: Math.max(0, Math.min(1, (rect.left + rect.width / 2) / width)),
        y: Math.max(0, Math.min(1, rect.top / height))}]
    })
    post({type: "preview-frame-positions", widgets})
  }
  const applyState = (snapshot: LiveSessionWidgetState) => {
    const path = snapshot.path
    if(!Array.isArray(path) || !path.every(index => Number.isInteger(index) && index >= 0)) return
    let current = previewElementAtPath(path, document)
    if(!current) return
    if(typeof snapshot.html === "string" && snapshot.html && current.outerHTML !== snapshot.html) {
      const template = document.createElement("template")
      template.innerHTML = snapshot.html.trim()
      stripActiveContent(template.content)
      const replacement = template.content.firstElementChild
      if(!replacement || replacement.localName !== current.localName || replacement.namespaceURI !== current.namespaceURI) return
      current.replaceWith(replacement)
      current = previewElementAtPath(path, document)
    }
    if(current && snapshot.state && typeof snapshot.state === "object" && !Array.isArray(snapshot.state)) {
      for(const [key, value] of Object.entries(snapshot.state)) {
        if(key.startsWith("on") || key === "__proto__" || key === "constructor" || key === "prototype"
          || key in HTMLElement.prototype) continue
        try { (current as unknown as Record<string, unknown>)[key] = value }
        catch { /* A read-only widget property is left untouched. */ }
      }
    }
    positions()
  }
  document.designMode = "off"
  document.body?.removeAttribute("contenteditable")
  window.addEventListener("message", event => {
    if(event.source !== window.parent || event.origin !== hostOrigin || event.data?.bridgeNonce !== nonce) return
    if(event.data.type === "preview-frame-configure") {
      preview.disconnect()
      if(event.data.role === "learner") {
        preview.observeLearner(frame, document, step => post({type: "preview-frame-step", step}))
      }
      else if(event.data.role === "host") {
        preview.observeHost(frame, document, positions)
        post({type: "preview-frame-base-widgets", widgets: [...preview.baseWidgetStates.values()]})
      }
    }
    else if(event.data.type === "preview-frame-apply" && event.data.snapshot) applyState(event.data.snapshot)
  })
  post({type: "preview-frame-ready"})
}
