import { DOMEditor } from "./domeditor"
import {editorFrameControlMessage, isInitializeEditorMessage} from "./editor-bridge"
import {appCommands, builtinShortcuts, shortcutFromEvent} from "./app-settings"
import {isWidgetShadowInteraction, pathFromNode} from "./utility"

/** Shortest time between two document snapshots posted to the host. */
const snapshotInterval = 250

type SelectionBookmark = {
  anchorNode: Node
  anchorOffset: number
  focusNode: Node
  focusOffset: number
}

/** Host-only frame operations. The document stays in this cross-origin realm. */
const connectHost = (editor: DOMEditor, origin: string, nonce: string, settings: {
  language?: string
  disableAnimations?: boolean
  shortcuts?: Record<string, string>
}) => {
  let bookmark: SelectionBookmark | null = null
  let motionSheet: CSSStyleSheet | null = null
  let shortcuts = settings.shortcuts ?? {}
  const post = (message: object) => window.parent.postMessage({...message, bridgeNonce: nonce}, origin)
  const snapshot = () => `${document.doctype ? `<!doctype ${document.doctype.name}>` : ""}${document.documentElement.outerHTML}`
  const setMotion = (disabled: boolean) => {
    if(motionSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== motionSheet)
    motionSheet = null
    if(!disabled) return
    motionSheet = new CSSStyleSheet()
    motionSheet.replaceSync(":root { --ww-ui-transition: none; --ww-ui-animation: none; }")
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, motionSheet]
  }
  if(settings.language) document.documentElement.lang = settings.language
  setMotion(settings.disableAnimations === true)
  // Serializing the document here and parsing it in the host costs time in
  // proportion to its size. Post the first change at once, then at most one
  // snapshot per interval while changes continue.
  let pending = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const flushSnapshot = () => {
    timer = null
    if(!pending) return
    pending = false
    post({type: "editor-frame-snapshot", html: snapshot()})
    timer = setTimeout(flushSnapshot, snapshotInterval)
  }
  const publishSnapshot = () => {
    if(pending) return
    pending = true
    if(timer === null) queueMicrotask(flushSnapshot)
  }
  const observer = new MutationObserver(publishSnapshot)
  observer.observe(document.documentElement, {attributes: true, characterData: true, childList: true, subtree: true})
  publishSnapshot()
  document.addEventListener("pointerdown", event => {
    const target = event.target as Node | null
    post({type: "editor-frame-pointerdown", widgetShadow: isWidgetShadowInteraction(event),
      targetPath: target && document.body.contains(target) ? pathFromNode(document.body, target) : null})
  }, true)
  document.addEventListener("focusin", event => {
    post({type: "editor-frame-focusin", widgetShadow: isWidgetShadowInteraction(event)})
  }, true)
  document.addEventListener("keydown", event => {
    if(event.defaultPrevented || event.isComposing) return
    const shortcut = shortcutFromEvent(event)
    if(!shortcut) return
    const command = appCommands.find(candidate => shortcuts[candidate.id] === shortcut)
    if(!command && !builtinShortcuts().has(shortcut)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(command && !event.repeat) post({type: "editor-frame-shortcut", action: command.action})
  }, true)
  window.addEventListener("message", event => {
    if(event.source !== window.parent || event.origin !== origin || event.data?.bridgeNonce !== nonce
      || event.data?.type !== editorFrameControlMessage) return
    const data = event.data as {command?: string, requestId?: string, disabled?: boolean,
      shortcuts?: Record<string, string>, tags?: string[]}
    if(data.command === "snapshot") {
      post({type: "editor-frame-response", requestId: data.requestId, html: snapshot()})
    }
    else if(data.command === "registered-tags") {
      post({type: "editor-frame-response", requestId: data.requestId,
        tags: (data.tags ?? []).filter(tag => typeof tag === "string" && !!customElements.get(tag))})
    }
    else if(data.command === "save-selection") {
      bookmark = null
      const selection = document.getSelection()
      if(selection?.anchorNode && selection.focusNode && document.body.contains(selection.anchorNode)
        && document.body.contains(selection.focusNode)) bookmark = {
        anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset,
        focusNode: selection.focusNode, focusOffset: selection.focusOffset,
      }
    }
    else if(data.command === "focus") {
      window.focus()
      document.body.focus({preventScroll: true})
      if(bookmark) {
        const saved = bookmark
        bookmark = null
        if(document.body.contains(saved.anchorNode) && document.body.contains(saved.focusNode)) {
          const offset = (node: Node, value: number) => Math.min(value,
            node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length)
          try { document.getSelection()?.setBaseAndExtent(saved.anchorNode, offset(saved.anchorNode, saved.anchorOffset),
            saved.focusNode, offset(saved.focusNode, saved.focusOffset)) }
          catch { /* Concurrent edits may have replaced the saved endpoints. */ }
        }
      }
    }
    else if(data.command === "print") window.print()
    else if(data.command === "motion") setMotion(data.disabled === true)
    else if(data.command === "shortcuts" && data.shortcuts) shortcuts = data.shortcuts
  })
  void editor
}

const initialize = (event: MessageEvent) => {
  if(window.parent !== window && event.source !== window.parent) return
  if(!isInitializeEditorMessage(event.data)) return
  if(typeof event.data.bridgeNonce !== "string") return
  window.removeEventListener("message", initialize)
  const editor = new DOMEditor({
    syncUrl: event.data.syncUrl,
    bridgeNonce: event.data.bridgeNonce,
    bridgeOrigin: event.origin && event.origin !== "null" ? event.origin : window.location.origin,
    initialState: event.data.initialState,
  })
  connectHost(editor, event.origin, event.data.bridgeNonce, event.data)
  /* @ts-ignore */
  window.editor = editor
}

window.addEventListener("message", initialize)

const bridge = document.querySelector<HTMLMetaElement>('meta[name="webwriter-editor-bridge"]')
const bridgeNonce = bridge?.getAttribute("data-nonce")
const hostOrigin = bridge?.getAttribute("data-host-origin")
if(window.parent !== window && bridgeNonce && hostOrigin) {
  window.parent.postMessage({type: "webwriter-editor-frame-ready", bridgeNonce}, hostOrigin)
}
