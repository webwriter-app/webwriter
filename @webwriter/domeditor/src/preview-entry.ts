import {applyPreviewWidgetSnapshot, LivePreview, previewElementPath, previewWidgetElements} from "./live-preview"
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
    if(applyPreviewWidgetSnapshot(document, snapshot)) {
      positions()
    }
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
