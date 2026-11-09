import {applyPreviewWidgetSnapshot, LivePreview, previewElementPath, previewWidgetElements} from "./live-preview"
import type {LiveSessionWidgetState} from "./live-session"
import {openFrameLinksInNewTabs} from "./frame-links"
import {registerFrameArtifacts, widgetLookupForTags} from "./editor-artifacts"
import {observePrivateDistributionRegions} from "./distribution-presentation"
import {hydrateDistributionInstructions} from "./distribution-dom"
import {shortcutMatchesEvent} from "./app-settings"
import {isAppendixInteraction, isTextFieldInteraction, isWidgetShadowInteraction} from "./utility"

openFrameLinksInNewTabs(window)

const bridge = document.querySelector<HTMLMetaElement>('meta[name="webwriter-preview-bridge"]')
const nonce = bridge?.getAttribute("data-nonce")
const hostOrigin = bridge?.getAttribute("data-host-origin")

if(nonce && hostOrigin && window.parent !== window) {
  registerFrameArtifacts(document)
  hydrateDistributionInstructions(document)
  const preview = new LivePreview(widgetLookupForTags((bridge?.getAttribute("data-widget-tags") ?? "").split(" ")))
  let stopPrivateMarkers: (() => void) | undefined
  const clearPrivateMarkers = () => {
    stopPrivateMarkers?.()
    stopPrivateMarkers = undefined
  }
  window.addEventListener("pagehide", event => { if(!event.persisted) clearPrivateMarkers() })
  const post = (message: object) => window.parent.postMessage({...message, bridgeNonce: nonce}, hostOrigin)
  let feedbackShortcut = ""
  document.addEventListener("keydown", event => {
    if(event.defaultPrevented || event.isComposing || !shortcutMatchesEvent(feedbackShortcut, event)
      || isWidgetShadowInteraction(event) || isAppendixInteraction(event) || isTextFieldInteraction(event, document.body)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(!event.repeat) post({type: "preview-frame-open-feedback"})
  }, true)
  window.addEventListener("webwriter-document-save", event => {
    event.preventDefault()
    post({type: "preview-frame-save"})
  })
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
    if(event.data.type === "preview-frame-configure" || event.data.type === "preview-frame-feedback-shortcut") {
      feedbackShortcut = typeof event.data.feedbackShortcut === "string" ? event.data.feedbackShortcut.replace(/^Physical:/, "") : ""
    }
    if(event.data.type === "preview-frame-configure") {
      preview.disconnect()
      if(event.data.role === "learner") {
        clearPrivateMarkers()
        preview.observeLearner(frame, document, step => post({type: "preview-frame-step", step}))
      }
      else {
        stopPrivateMarkers ??= observePrivateDistributionRegions(document)
        if(event.data.role === "host") {
          preview.observeHost(frame, document, positions)
          post({type: "preview-frame-base-widgets", widgets: [...preview.baseWidgetStates.values()]})
        }
      }
    }
    else if(event.data.type === "preview-frame-print") window.print()
    else if(event.data.type === "preview-frame-scroll" && Number.isFinite(event.data.top) && Number.isFinite(event.data.left)) {
      window.scrollTo({top: event.data.top, left: event.data.left, behavior: "instant"})
    }
    else if(event.data.type === "preview-frame-apply" && event.data.snapshot) applyState(event.data.snapshot)
    else if(event.data.type === "preview-frame-aggregate" && Array.isArray(event.data.widgets)) {
      post({type: "preview-frame-aggregate-options", widgets: preview.showAggregates(document, event.data.widgets)})
    }
  })
  post({type: "preview-frame-ready"})
}
