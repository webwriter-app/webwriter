import { DOMEditor } from "./domeditor"
import {openFrameLinksInNewTabs} from "./frame-links"
import {captureSnapshotTextNodeRuns, editorFrameControlMessage, isInitializeEditorMessage, replayHostDrag, replayHostPointer} from "./editor-bridge"
import {appCommands, builtinShortcuts, shortcutFromEvent} from "./app-settings"
import {isAppendixInteraction, isTextFieldInteraction, isWidgetShadowInteraction, pathFromNode} from "./utility"
import {isAuthoredMutation} from "./editor-artifacts"
import {serializeDoctype} from "./serialization-primitives"

/** Shortest time between two document snapshots posted to the host. */
const snapshotInterval = 250

const mutationOptions: MutationObserverInit = {attributes: true, attributeOldValue: true, characterData: true,
  characterDataOldValue: true, childList: true, subtree: true}

/** Observes the document and all nested inert template contents. */
export function observeFrameDocument(document: Document, callback: MutationCallback) {
  const Observer = document.defaultView?.MutationObserver ?? MutationObserver
  let templateContents: Set<DocumentFragment> | null = null
  const observer = new Observer((mutations, currentObserver) => {
    callback(mutations, currentObserver)
    if(mutations.some(mutation => mutation.type === "childList")) observe()
  })
  const findTemplateContents = () => {
    const contents: DocumentFragment[] = []
    const roots: ParentNode[] = [document.documentElement]
    for(let index = 0; index < roots.length; index++) {
      roots[index].querySelectorAll("template").forEach(element => {
        const content = (element as HTMLTemplateElement).content
        if(!content || content.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
        contents.push(content)
        roots.push(content)
      })
    }
    return contents
  }
  const flushPending = () => {
    let records = observer.takeRecords()
    while(records.length) {
      callback(records, observer)
      records = observer.takeRecords()
    }
  }
  const observe = () => {
    flushPending()
    const contents = findTemplateContents()
    const observed = templateContents
    if(observed && contents.length === observed.size && contents.every(content => observed.has(content))) return
    observer.disconnect()
    observer.observe(document.documentElement, mutationOptions)
    contents.forEach(content => observer.observe(content, mutationOptions))
    templateContents = new Set(contents)
  }
  observe()
  return () => {
    flushPending()
    observer.disconnect()
    templateContents = null
  }
}

/** Whether a frame-level shortcut belongs to the editor document. */
export function shouldCaptureFrameShortcut(event: KeyboardEvent, action?: string) {
  return !event.defaultPrevented && !event.isComposing
    && (action === "Print" || !isWidgetShadowInteraction(event) && !isAppendixInteraction(event)
      && !isTextFieldInteraction(event, document.body))
}

type SelectionBookmark = {
  anchorNode: Node
  anchorOffset: number
  focusNode: Node
  focusOffset: number
}

/** Host-only frame operations. The document stays in this cross-origin realm. */
const connectHost = (editor: DOMEditor, origin: string, nonce: string, settings: {
  username?: string
  disableAnimations?: boolean
  shortcuts?: Record<string, string>
}) => {
  let bookmark: SelectionBookmark | null = null
  const saveSelection = () => {
    bookmark = null
    const selection = document.getSelection()
    if(selection?.anchorNode && selection.focusNode && document.body.contains(selection.anchorNode)
      && document.body.contains(selection.focusNode)) bookmark = {
      anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode, focusOffset: selection.focusOffset,
    }
  }
  let motionSheet: CSSStyleSheet | null = null
  let shortcuts = settings.shortcuts ?? {}
  const post = (message: object) => window.parent.postMessage({...message, bridgeNonce: nonce}, origin)
  const snapshot = () => `${serializeDoctype(document.doctype)}${document.documentElement.outerHTML}`
  const setMotion = (disabled: boolean) => {
    if(motionSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== motionSheet)
    motionSheet = null
    if(!disabled) return
    motionSheet = new CSSStyleSheet()
    motionSheet.replaceSync(":root { --ww-ui-transition: none; --ww-ui-animation: none; }")
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, motionSheet]
  }
  const setUsername = (name: string) => editor.doc?.setUser({name: name.trim() || `User ${editor.doc.doc.clientID.toString(36).toUpperCase()}`})
  if(settings.username !== undefined) setUsername(settings.username)
  setMotion(settings.disableAnimations === true)
  // Serializing the document here and parsing it in the host costs time in
  // proportion to its size. Post the first change at once, then at most one
  // snapshot per interval while changes continue.
  let pending = false
  let pendingTreeChanged = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const flushSnapshot = () => {
    timer = null
    if(!pending) return
    pending = false
    const treeChanged = pendingTreeChanged
    pendingTreeChanged = false
    post({type: "editor-frame-snapshot", html: snapshot(), textNodeRuns: captureSnapshotTextNodeRuns(document.body), treeChanged})
    timer = setTimeout(flushSnapshot, snapshotInterval)
  }
  const publishSnapshot = (mutations?: MutationRecord[]) => {
    if(mutations) {
      const authoredMutations = mutations.filter(isAuthoredMutation)
      if(authoredMutations.length === 0) return
      pendingTreeChanged ||= authoredMutations.some(mutation => mutation.type === "childList" || mutation.type === "attributes")
    }
    if(pending) return
    pending = true
    if(timer === null) queueMicrotask(flushSnapshot)
  }
  const stopObserving = observeFrameDocument(document, publishSnapshot)
  window.addEventListener("unload", stopObserving, {once: true})
  publishSnapshot()
  // Run before feature capture listeners can claim canvas/slide gestures.
  window.addEventListener("pointerdown", event => {
    const target = event.target as Node | null
    post({type: "editor-frame-pointerdown", widgetShadow: isWidgetShadowInteraction(event), appendix: isAppendixInteraction(event),
      targetPath: target && document.body.contains(target) ? pathFromNode(document.body, target) : null})
  }, true)
  document.addEventListener("focusin", event => {
    post({type: "editor-frame-focusin", widgetShadow: isWidgetShadowInteraction(event)})
  }, true)
  // Reactivating Chrome can focus only this child Window; the already-focused
  // body need not emit focusin, and cross-origin hosts cannot observe Window.focus.
  window.addEventListener("focus", () => post({type: "editor-frame-window-focus"}))
  window.addEventListener("blur", () => post({type: "editor-frame-window-blur"}))
  document.addEventListener("wheel", () => post({type: "editor-frame-interaction"}), {capture: true, passive: true})
  document.addEventListener("keydown", event => {
    post({type: "editor-frame-interaction"})
    // The captured graphic owns its Option shortcuts before application bindings.
    if(event.altKey && !event.ctrlKey && !event.metaKey && !editor.features.mark.isSVGTextSelection
      && editor.features.selection.captureSelectedElement?.localName === "svg") return
    const shortcut = shortcutFromEvent(event)
    if(!shortcut) return
    const command = appCommands.find(candidate => shortcuts[candidate.id] === shortcut)
    if(!command && !builtinShortcuts().has(shortcut)) return
    if(!shouldCaptureFrameShortcut(event, command?.action)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(command && !event.repeat) post({type: "editor-frame-shortcut", action: command.action})
  }, true)
  window.addEventListener("message", event => {
    if(event.source !== window.parent || event.origin !== origin || event.data?.bridgeNonce !== nonce
      || event.data?.type !== editorFrameControlMessage) return
    const data = event.data as {command?: string, requestId?: string, disabled?: boolean, restoreSelection?: boolean,
      shortcuts?: Record<string, string>, tags?: string[], username?: string}
    if(data.command === "snapshot") {
      post({type: "editor-frame-response", requestId: data.requestId, html: snapshot(), textNodeRuns: captureSnapshotTextNodeRuns(document.body)})
    }
    else if(data.command === "disconnect-collaboration") editor.doc?.disconnectCollaboration()
    else if(data.command === "registered-tags") {
      post({type: "editor-frame-response", requestId: data.requestId,
        tags: (data.tags ?? []).filter(tag => typeof tag === "string" && !!customElements.get(tag))})
    }
    else if(data.command === "save-selection") {
      saveSelection()
    }
    else if(data.command === "focus") {
      // A queued host pointerdown can arrive after an empty image opened
      // its source controls. Keep their native focus and graphic capture.
      if(editor.features.media.isPlaceholderInteraction) {
        bookmark = null
        window.focus()
        return
      }
      // A queued host pointerdown can arrive after double-click opened a
      // label. Focusing BODY would replace the proxy's live text selection.
      if(editor.features.graphic.textEditingRange) {
        bookmark = null
        window.focus()
        editor.features.graphic.focusTextInput()
        return
      }
      if(!data.restoreSelection) saveSelection()
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
    else if(data.command === "username" && typeof data.username === "string") setUsername(data.username)
    else if(data.command === "drag") replayHostDrag(event.data)
    else if(data.command === "pointer") replayHostPointer(event.data)
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
    accessibilityReviewEnabled: event.data.accessibilityReviewEnabled === true,
  })
  editor.features.proofreading.setChecking(event.data.proofreadingAllowed !== false)
  editor.features.proofreading.setDocumentChecking(event.data.proofreadingEnabled !== false)
  editor.features.comment.setCommentHighlighting(event.data.commentHighlighting !== false)
  editor.features.proofreading.setDictionary(event.data.proofreadingDictionary ?? [])
  connectHost(editor, event.origin, event.data.bridgeNonce, event.data)
  /* @ts-ignore */
  window.editor = editor
}

openFrameLinksInNewTabs(window)
window.addEventListener("message", initialize)

const bridge = document.querySelector<HTMLMetaElement>('meta[name="webwriter-editor-bridge"]')
const bridgeNonce = bridge?.getAttribute("data-nonce")
const hostOrigin = bridge?.getAttribute("data-host-origin")
if(window.parent !== window && bridgeNonce && hostOrigin) {
  window.parent.postMessage({type: "webwriter-editor-frame-ready", bridgeNonce}, hostOrigin)
}
