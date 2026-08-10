import { LitElement, css, html } from "lit"
import type { AppRibbon } from "./ribbon"
import type { DomEditorBreadcrumb, DocumentTreeItem } from "./breadcrumb"
import type { EditingAction } from "../domeditor"
import { slashMenuItems } from "./slash-menu"
import { getElementPresentation } from "../element-names"
import {
  executeCompleteEvent,
  executeFailureEvent,
  isExecuteResponse,
  isSelectionChangeMessage,
  isPresenceChangeMessage,
  selectionChangeEvent,
  type ExecuteCompleteDetail,
  type ExecuteFailureDetail,
  type SelectionGap,
  type SelectionPathItem,
  type PresenceUser,
} from "../editor-bridge"
import "./breadcrumb"
import "./ribbon"

const escapeAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")

const editorEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/editor-entry.ts" : "assets/editor-entry.js"}`
const appIconUrl = `${import.meta.env.BASE_URL}assets/app-icon-transparent.svg`

type SelectionBookmark = {
  anchorNode: Node
  anchorOffset: number
  focusNode: Node
  focusOffset: number
}

type RibbonInputEventDetail = {
  relatedTarget?: EventTarget | null
  relatedTargetIsInput?: boolean
}

/** The iframe-backed editor element. The iframe gets its own document and
 * runs the editor module there, keeping editor styles, selection and DOM
 * mutations isolated from the host document. */
export class DomEditor extends LitElement {
  static properties = {
    selectionPath: {attribute: false, state: true},
    selectionGap: {attribute: false, state: true},
    documentTree: {attribute: false, state: true},
    presenceUsers: {attribute: false, state: true},
  }

  private editorDocument: Document | null = null
  private editorWindow: Window | null = null
  private documentTreeObserver: MutationObserver | null = null
  private editorReadyPromise: Promise<Window> | null = null
  private editorReadyResolve: ((editorWindow: Window) => void) | null = null
  private editorReadyReject: ((reason: unknown) => void) | null = null
  private requestSequence = 0
  private savedEditorSelection: SelectionBookmark | null = null
  private ribbonInputSession = false
  private restoreEditorAfterRibbonInput = false
  private selectionPath: SelectionPathItem[] = []
  private selectionGap: SelectionGap | null = null
  private documentTree: DocumentTreeItem | null = null
  private presenceUsers: PresenceUser[] = []
  private treeViewOpen = false
  private breadcrumbHoverPath: number[] | null = null
  private pendingExecutions = new Map<string, {
    resolve: (value: unknown) => void
    reject: (reason?: unknown) => void
  }>()

  static styles = css`
    :host {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      border: 0.5px solid #a8a8a8;
    }

    .app-bar {
      flex: 0 0 auto;
      width: 100%;
    }

    app-ribbon:not([expanded]) + dom-editor-breadcrumb {
      display: none;
    }

    iframe {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      border: 0;
    }
  `

  private get editorSrcdoc() {
    const syncUrl = new URL(`ws://${location.hostname}:1234`)
    const outerUrl = new URL(location.href)
    outerUrl.searchParams.forEach((value, key) => syncUrl.searchParams.set(key, value))
    const syncUrlLiteral = JSON.stringify(syncUrl.href).replaceAll("<", "\\u003C")
    return `<script>globalThis.SYNC_URL = ${syncUrlLiteral}</script><script type="module" src="${escapeAttribute(editorEntryUrl)}"></script>`
  }

  private handleEditorFrameLoad = (event: Event) => {
    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    this.editorDocument?.removeEventListener("pointerdown", this.handleEditorPointerDown)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    const previousIframe = event.currentTarget as HTMLIFrameElement
    previousIframe.removeEventListener("focus", this.handleEditorFrameFocus)
    previousIframe.removeEventListener("blur", this.handleEditorFrameBlur)
    const iframe = event.currentTarget as HTMLIFrameElement
    this.editorDocument = iframe.contentDocument
    this.editorWindow = iframe.contentWindow
    if(this.breadcrumbHoverPath !== null) {
      void this.execute({
        type: "hoverNode",
        path: [...this.breadcrumbHoverPath],
      }).catch(() => {})
    }
    this.documentTree = this.buildDocumentTree()
    const body = this.editorDocument?.body
    if(body) {
      this.documentTreeObserver = new MutationObserver(mutations => {
        if(mutations.some(mutation => mutation.type === "childList")) {
          this.documentTree = this.buildDocumentTree()
        }
      })
      this.documentTreeObserver.observe(body, {childList: true, subtree: true})
    }
    this.editorDocument?.addEventListener("pointerdown", this.handleEditorPointerDown)
    this.editorDocument?.addEventListener("focusin", this.handleEditorFocus)
    iframe.addEventListener("focus", this.handleEditorFrameFocus)
    iframe.addEventListener("blur", this.handleEditorFrameBlur)
    if(this.editorWindow) {
      this.editorReadyResolve?.(this.editorWindow)
    }
    else {
      this.editorReadyReject?.(new Error("The DOM editor iframe has no content window"))
    }
    this.editorReadyResolve = null
    this.editorReadyReject = null
  }

  private handleEditorPointerDown = () => {
    this.focusEditor()
    this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.dismissCollapsedMenu()
  }

  private handleEditorFocus = () => {
    this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.dismissCollapsedMenu()
  }

  private handleEditorFrameFocus = () => {
    this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.dismissCollapsedMenu()
  }

  private handleEditorFrameBlur = () => {
    this.saveEditorSelection()
  }

  private editorIframe() {
    return this.renderRoot.querySelector<HTMLIFrameElement>("iframe")
  }

  private isEditorFocused() {
    const iframe = this.editorIframe()
    return iframe !== null && document.activeElement === iframe
  }

  private saveEditorSelection() {
    const selection = this.editorDocument?.getSelection()
    const body = this.editorDocument?.body
    if(!selection?.anchorNode || !selection.focusNode || !body) return

    const isInEditor = (node: Node) => node === body || body.contains(node)
    if(!isInEditor(selection.anchorNode) || !isInEditor(selection.focusNode)) return

    this.savedEditorSelection = {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    }
  }

  private restoreEditorSelection() {
    const bookmark = this.savedEditorSelection
    this.savedEditorSelection = null
    const selection = this.editorDocument?.getSelection()
    const body = this.editorDocument?.body
    if(!bookmark || !selection || !body) return

    const isInEditor = (node: Node) => node === body || body.contains(node)
    if(!isInEditor(bookmark.anchorNode) || !isInEditor(bookmark.focusNode)) return

    const offset = (node: Node, value: number) => Math.min(
      value,
      node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length,
    )
    try {
      selection.setBaseAndExtent(
        bookmark.anchorNode,
        offset(bookmark.anchorNode, bookmark.anchorOffset),
        bookmark.focusNode,
        offset(bookmark.focusNode, bookmark.focusOffset),
      )
    }
    catch {
      // The command may have removed a bookmarked node. In that case the
      // editor's current selection is safer than restoring a stale bookmark.
    }
  }

  private focusEditor(restoreSelection = false) {
    const iframe = this.editorIframe()
    iframe?.focus({preventScroll: true})
    this.editorWindow?.focus()
    if(restoreSelection) this.restoreEditorSelection()
    else this.savedEditorSelection = null
  }

  private handleRibbonInputPointerDown = () => {
    if(this.ribbonInputSession) return
    this.ribbonInputSession = true
    this.restoreEditorAfterRibbonInput = this.isEditorFocused() || this.savedEditorSelection !== null
    if(this.isEditorFocused()) this.saveEditorSelection()
  }

  private handleRibbonInputFocus = () => {
    if(this.ribbonInputSession) return
    this.ribbonInputSession = true
    this.restoreEditorAfterRibbonInput = this.savedEditorSelection !== null
  }

  private finishRibbonInput = () => {
    const shouldRestore = this.restoreEditorAfterRibbonInput
    this.ribbonInputSession = false
    this.restoreEditorAfterRibbonInput = false
    if(shouldRestore) this.focusEditor(true)
    else this.savedEditorSelection = null
  }

  private handleRibbonInputBlur = (event: Event) => {
    const detail = (event as CustomEvent<RibbonInputEventDetail>).detail
    if(detail?.relatedTargetIsInput) return
    queueMicrotask(() => {
      if(this.ribbonInputSession) this.finishRibbonInput()
    })
  }

  private handleRibbonButtonClick = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label === "Undo") {
      void this.execute({type: "undo"}).finally(() => this.focusEditor())
      return
    }
    if(label === "Redo") {
      void this.execute({type: "redo"}).finally(() => this.focusEditor())
      return
    }
    const item = slashMenuItems.find(candidate => candidate.name === label)
    if(!item) {
      this.focusEditor()
      return
    }

    void this.execute({
      type: "insert",
      html: `<${item.tag}></${item.tag}>`,
    }).finally(() => this.focusEditor())
  }

  private handleRibbonCollapse = () => {
    this.renderRoot.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")?.collapseTree()
  }

  private handleBreadcrumbItemSelect = (event: Event) => {
    const item = (event as CustomEvent<SelectionPathItem>).detail
    if(!item || !Array.isArray(item.path)) return

    void this.execute({
      type: "selectNode",
      path: [...item.path],
    }).finally(() => this.focusEditor())
  }

  private handleBreadcrumbItemHover = (event: Event) => {
    const item = (event as CustomEvent<SelectionPathItem | null>).detail
    const path = item && Array.isArray(item.path) ? [...item.path] : null
    this.breadcrumbHoverPath = path
    void this.execute({
      type: "hoverNode",
      path,
    }).catch(() => {
      // Hover is best-effort; the editor may be unloading while the pointer
      // leaves the breadcrumb.
    })
  }

  private buildDocumentTree() {
    const body = this.editorDocument?.body
    if(!body) return null

    const build = (element: Element, path: number[]): DocumentTreeItem => ({
      path: [...path],
      ...getElementPresentation(element),
      children: Array.from(element.children).flatMap(child => {
        const index = Array.from(element.childNodes).indexOf(child)
        return index < 0? []: [build(child, [...path, index])]
      }),
    })

    return build(body, [])
  }

  private handleBreadcrumbTreeToggle = (event: Event) => {
    const open = (event as CustomEvent<{open?: unknown}>).detail?.open === true
    this.treeViewOpen = open
    this.documentTree = this.buildDocumentTree()
  }

  private isEditorMessage(event: MessageEvent) {
    const iframe = this.editorIframe()
    return !event.source || event.source === this.editorWindow || event.source === iframe?.contentWindow
  }

  private handleEditorMessage = (event: MessageEvent) => {
    if(isSelectionChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      const path = event.data.detail.path.map(item => ({
        ...item,
        path: [...item.path],
      }))
      const gap = event.data.detail.gap
      const selectionGap = gap
        ? {parentPath: [...gap.parentPath], offset: gap.offset}
        : null
      this.selectionPath = path
      this.selectionGap = selectionGap
      this.documentTree = this.buildDocumentTree()
      this.dispatchEvent(new CustomEvent(selectionChangeEvent, {
        detail: {
          path,
          ...(selectionGap ? {gap: selectionGap} : {}),
        },
        bubbles: true,
        composed: true,
      }))
      return
    }
    if(isPresenceChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.presenceUsers = event.data.detail.users.map(user => ({...user}))
      return
    }
    if(!isExecuteResponse(event.data)) return
    if(!this.isEditorMessage(event)) return

    const detail = event.data.detail
    const pending = this.pendingExecutions.get(detail.requestId)
    if(!pending) return
    this.pendingExecutions.delete(detail.requestId)

    this.dispatchEvent(new CustomEvent(event.data.type, {
      detail,
      bubbles: true,
      composed: true,
    }))
    if(event.data.type === executeCompleteEvent) {
      pending.resolve((detail as ExecuteCompleteDetail).result)
    }
    else {
      pending.reject(this.deserializeError((detail as ExecuteFailureDetail).error))
    }
  }

  private waitForEditorWindow() {
    if(this.editorWindow) return Promise.resolve(this.editorWindow)
    if(!this.editorReadyPromise) {
      this.editorReadyPromise = new Promise<Window>((resolve, reject) => {
        this.editorReadyResolve = resolve
        this.editorReadyReject = reject
      })
    }
    return this.editorReadyPromise
  }

  private deserializeError(error: unknown) {
    if(error instanceof Error) return error
    if(error && typeof error === "object") {
      const serialized = error as {name?: unknown, message?: unknown, stack?: unknown}
      const deserialized = new Error(String(serialized.message ?? error))
      if(typeof serialized.name === "string") deserialized.name = serialized.name
      if(typeof serialized.stack === "string") deserialized.stack = serialized.stack
      return deserialized
    }
    return error
  }

  async execute(action: EditingAction): Promise<unknown> {
    if(!this.isConnected) {
      throw new Error("The DOM editor component is not connected")
    }
    const requestId = String(++this.requestSequence)
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingExecutions.set(requestId, {resolve, reject})
    })

    try {
      const editorWindow = await this.waitForEditorWindow()
      editorWindow.postMessage(Object.assign({}, action as object, {requestId}), "*")
    }
    catch(error) {
      const pending = this.pendingExecutions.get(requestId)
      if(pending) {
        this.pendingExecutions.delete(requestId)
        pending.reject(error)
      }
    }

    return promise
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("message", this.handleEditorMessage)
  }

  disconnectedCallback() {
    window.removeEventListener("message", this.handleEditorMessage)
    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    this.editorDocument?.removeEventListener("pointerdown", this.handleEditorPointerDown)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    const iframe = this.editorIframe()
    iframe?.removeEventListener("focus", this.handleEditorFrameFocus)
    iframe?.removeEventListener("blur", this.handleEditorFrameBlur)
    this.editorDocument = null
    this.editorWindow = null
    this.savedEditorSelection = null
    this.ribbonInputSession = false
    this.restoreEditorAfterRibbonInput = false
    this.treeViewOpen = false
    this.breadcrumbHoverPath = null
    this.documentTree = null
    this.presenceUsers = []
    this.editorReadyReject?.(new Error("The DOM editor component was disconnected"))
    this.editorReadyPromise = null
    this.editorReadyResolve = null
    this.editorReadyReject = null
    this.selectionPath = []
    this.selectionGap = null
    const error = new Error("The DOM editor component was disconnected")
    this.pendingExecutions.forEach(({reject}) => reject(error))
    this.pendingExecutions.clear()
    super.disconnectedCallback()
  }

  render() {
    return html`
      <header class="app-bar">
        <app-ribbon
          logo-url=${appIconUrl}
          .presenceUsers=${this.presenceUsers}
          @ribbon-button-click=${this.handleRibbonButtonClick}
          @ribbon-collapse=${this.handleRibbonCollapse}
          @ribbon-input-pointerdown=${this.handleRibbonInputPointerDown}
          @ribbon-input-focus=${this.handleRibbonInputFocus}
          @ribbon-input-blur=${this.handleRibbonInputBlur}
          @ribbon-input-commit=${this.finishRibbonInput}
          @ribbon-input-cancel=${this.finishRibbonInput}
        ></app-ribbon>
        <dom-editor-breadcrumb
          .path=${this.selectionPath}
          .gap=${this.selectionGap}
          .tree=${this.documentTree}
          @breadcrumb-tree-toggle=${this.handleBreadcrumbTreeToggle}
          @breadcrumb-item-select=${this.handleBreadcrumbItemSelect}
          @breadcrumb-item-hover=${this.handleBreadcrumbItemHover}
        ></dom-editor-breadcrumb>
      </header>
      <iframe title="DOM editor" srcdoc=${this.editorSrcdoc} @load=${this.handleEditorFrameLoad}></iframe>
    `
  }
}

if(!customElements.get("dom-editor")) {
  customElements.define("dom-editor", DomEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    "dom-editor": DomEditor
  }
}
