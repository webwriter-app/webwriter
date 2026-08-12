import { LitElement, css, html } from "lit"
import type { AppRibbon } from "./ribbon"
import type { DomEditorBreadcrumb, DocumentTreeItem } from "./breadcrumb"
import type { EditingAction } from "../domeditor"
import { insertionMenuItems } from "./insertion-menu"
import type {EditorStateSnapshot} from "../editor-state"
import {
  packageMemberAction,
  WebWriterPackageRegistry,
  type PackageMember,
  type WebWriterPackage,
} from "../packages"
import { getElementPresentation } from "../element-names"
import {canonicalMarkName, isMarkElement, isStyleMarkName, type MarkName, type StyleMarkValues} from "../marks"
import {isWidgetShadowInteraction} from "../utility"
import {
  executeCompleteEvent,
  executeFailureEvent,
  initializeEditorMessage,
  isExecuteResponse,
  isMarkStateChangeMessage,
  isSelectionChangeMessage,
  isPresenceChangeMessage,
  markStateChangeEvent,
  loadWidgetsMessage,
  selectionChangeEvent,
  type ExecuteCompleteDetail,
  type ExecuteFailureDetail,
  type SelectionGap,
  type SelectionPathItem,
  type PresenceUser,
  type InitializeEditorMessage,
  type LoadWidgetsMessage,
} from "../editor-bridge"
import "./breadcrumb"
import "./ribbon"

const escapeAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")

const editorEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/editor-entry.ts" : "assets/editor-entry.js"}`
const appIconUrl = `${import.meta.env.BASE_URL}assets/app-icon-transparent.svg`
const scopedCustomElementRegistryPolyfillUrl = "https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js"

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
    canMark: {attribute: false, state: true},
    marks: {attribute: false, state: true},
    markStyles: {attribute: false, state: true},
    presenceUsers: {attribute: false, state: true},
    packages: {attribute: false, state: true},
    installedPackages: {attribute: false, state: true},
    packagesLoading: {attribute: false, state: true},
    busyPackageNames: {attribute: false, state: true},
    packageError: {attribute: false, state: true},
    frameRevision: {attribute: false, state: true},
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
  private canMark = false
  private marks: MarkName[] = []
  private markStyles: StyleMarkValues = {}
  private presenceUsers: PresenceUser[] = []
  private packages: WebWriterPackage[] = []
  private installedPackages: WebWriterPackage[] = []
  private packagesLoading = false
  private busyPackageNames: string[] = []
  private packageError = ""
  private frameState: EditorStateSnapshot | undefined
  private frameRevision = 0
  private packageCatalogRequested = false
  private readonly packageRegistry = new WebWriterPackageRegistry()
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
    return `<!-- frame ${this.frameRevision} --><script src="${escapeAttribute(scopedCustomElementRegistryPolyfillUrl)}"></script><script type="module" src="${escapeAttribute(editorEntryUrl)}"></script>`
  }

  private get syncUrl() {
    const syncUrl = new URL(`ws://${location.hostname}:1234`)
    const outerUrl = new URL(location.href)
    outerUrl.searchParams.forEach((value, key) => syncUrl.searchParams.set(key, value))
    return syncUrl.href
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
      const initializeMessage: InitializeEditorMessage = {
        type: initializeEditorMessage,
        syncUrl: this.syncUrl,
        ...(this.frameState ? {initialState: this.frameState} : {}),
      }
      const loadMessage: LoadWidgetsMessage = {
        type: loadWidgetsMessage,
        widgets: this.installedPackages.map(({name, version}) => ({name, version})),
      }
      this.editorWindow.postMessage(initializeMessage, "*")
      this.editorWindow.postMessage(loadMessage, "*")
      this.editorReadyResolve?.(this.editorWindow)
    }
    else {
      this.editorReadyReject?.(new Error("The DOM editor iframe has no content window"))
    }
    this.editorReadyResolve = null
    this.editorReadyReject = null
  }

  private handleEditorPointerDown = (event: PointerEvent) => {
    if(isWidgetShadowInteraction(event)) return
    this.focusEditor()
    const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
    ribbon?.dismissCollapsedMenu()
    if(!this.editorTargetSharesTextSelection(event.target)) ribbon?.dismissDrawers()
  }

  /** Keeps the mark area open while the pointer starts another text selection
   * inside the current selection's containing element. A different editor
   * element, a gap, or an element selection still dismisses it. */
  private editorTargetSharesTextSelection(target: EventTarget | null) {
    if(!this.canMark) return false

    const editorDocument = this.editorDocument
    const body = editorDocument?.body
    const targetNode = target as Node | null
    const selectedPath = this.selectionPath.at(-1)?.path
    if(!body || !selectedPath?.length || !targetNode || typeof targetNode.nodeType !== "number") return false

    const targetElement = targetNode.nodeType === Node.ELEMENT_NODE
      ? targetNode as Element
      : targetNode.parentElement
    if(!targetElement || targetElement === body || !body.contains(targetElement)) return false

    let selectionElement: Element | null = body
    for(const index of selectedPath) {
      const child = selectionElement.childNodes.item(index)
      if(!child || child.nodeType !== Node.ELEMENT_NODE) return false
      selectionElement = child as Element
    }
    while(selectionElement && selectionElement !== body) {
      if(selectionElement.contains(targetElement)) return true
      selectionElement = selectionElement.parentElement
    }
    return false
  }

  private handleEditorFocus = (event: FocusEvent) => {
    if(isWidgetShadowInteraction(event)) return
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
    if(label?.startsWith("package-member:")) {
      const pkg = [...this.installedPackages, ...this.packages]
        .find(candidate => candidate.members.some(member => packageMemberAction(member) === label))
      const member = pkg?.members.find(candidate => packageMemberAction(candidate) === label)
      if(pkg && member) void this.installAndInsertPackage(pkg, member)
      else this.focusEditor()
      return
    }
    if(label?.startsWith("package-toggle:")) {
      const name = label.slice("package-toggle:".length)
      const pkg = this.installedPackages.find(candidate => candidate.name === name) ??
        this.packages.find(candidate => candidate.name === name)
      if(pkg) void this.setPackageInstalled(pkg, !this.installedPackages.some(candidate => candidate.name === name))
      else this.focusEditor()
      return
    }
    if(label?.startsWith("package:")) {
      const name = label.slice("package:".length)
      const pkg = this.installedPackages.find(candidate => candidate.name === name) ??
        this.packages.find(candidate => candidate.name === name)
      if(pkg) void this.installAndInsertPackage(pkg)
      else this.focusEditor()
      return
    }
    if(label === "Undo") {
      void this.execute({type: "undo"}).finally(() => this.focusEditor())
      return
    }
    if(label === "Redo") {
      void this.execute({type: "redo"}).finally(() => this.focusEditor())
      return
    }
    if(label === "removeMarks") {
      void this.execute({type: "removeMarks"}).finally(() => this.focusEditor())
      return
    }
    if(label === "increaseFontSize" || label === "decreaseFontSize") {
      void this.execute({type: label}).finally(() => this.focusEditor())
      return
    }
    if(label?.startsWith("mark:")) {
      const mark = canonicalMarkName(label.slice("mark:".length))
      if(mark) void this.execute({type: "toggleMark", mark}).finally(() => this.focusEditor())
      else this.focusEditor()
      return
    }
    const item = insertionMenuItems.find(candidate => candidate.name === label)
    if(!item) {
      this.focusEditor()
      return
    }

    void this.execute({
      type: "insert",
      html: `<${item.tag}></${item.tag}>`,
    }).finally(() => this.focusEditor())
  }

  private async insertPackageMember(member: PackageMember) {
    this.packageError = ""
    try {
      const html = member.kind === "snippet"
        ? await this.packageRegistry.fetchSnippet(member)
        : member.tagName ? `<${member.tagName}></${member.tagName}>` : ""
      if(!html) throw new Error(`Package member '${member.label}' has no insertable content`)
      await this.execute({type: "insert", html})
    }
    catch(error) {
      this.packageError = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.focusEditor()
    }
  }

  private async setPackageInstalled(pkg: WebWriterPackage, installed: boolean) {
    if(this.busyPackageNames.includes(pkg.name)) return undefined
    this.busyPackageNames = [...this.busyPackageNames, pkg.name]
    this.packageError = ""
    try {
      const resolvedPackage = installed ? await this.packageRegistry.getPackage(pkg) : pkg
      const nextPackages = installed
        ? [...this.installedPackages.filter(candidate => candidate.name !== pkg.name), resolvedPackage]
        : this.installedPackages.filter(candidate => candidate.name !== pkg.name)
      await this.reloadEditor(nextPackages)
      this.packages = this.packages.map(candidate => candidate.name === resolvedPackage.name ? resolvedPackage : candidate)
      return installed ? resolvedPackage : undefined
    }
    catch(error) {
      this.packageError = error instanceof Error ? error.message : String(error)
      return undefined
    }
    finally {
      this.busyPackageNames = this.busyPackageNames.filter(name => name !== pkg.name)
    }
  }

  private async installAndInsertPackage(pkg: WebWriterPackage, requestedMember?: PackageMember) {
    const activePackage = this.installedPackages.find(candidate => candidate.name === pkg.name) ??
      await this.setPackageInstalled(pkg, true)
    if(!activePackage) {
      this.focusEditor()
      return
    }
    const member = requestedMember
      ? activePackage.members.find(candidate => candidate.id === requestedMember.id || candidate.exportName === requestedMember.exportName)
      : activePackage.members.find(candidate => candidate.insertable)
    if(!member?.insertable) {
      this.packageError = `Package '${activePackage.label}' has no insertable members`
      this.focusEditor()
      return
    }
    await this.insertPackageMember(member)
  }

  private async reloadEditor(nextPackages: WebWriterPackage[]) {
    const snapshot = await this.execute({type: "snapshotState"}) as EditorStateSnapshot
    if(!snapshot || !Array.isArray(snapshot.update)) throw new TypeError("The editor returned an invalid state snapshot")
    const shouldRefocus = this.isEditorFocused() || this.savedEditorSelection !== null

    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    this.editorDocument?.removeEventListener("pointerdown", this.handleEditorPointerDown)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    this.editorDocument = null
    this.editorWindow = null
    this.editorReadyPromise = null
    this.editorReadyResolve = null
    this.editorReadyReject = null
    this.savedEditorSelection = null
    const reloadError = new Error("The editor iframe was reloaded for a package change")
    this.pendingExecutions.forEach(({reject}) => reject(reloadError))
    this.pendingExecutions.clear()
    this.frameState = snapshot
    this.installedPackages = nextPackages
    this.frameRevision++
    await this.updateComplete
    await this.waitForEditorWindow()
    if(shouldRefocus) this.focusEditor()
  }

  private async loadPackageCatalog() {
    if(this.packageCatalogRequested) return
    this.packageCatalogRequested = true
    this.packagesLoading = true
    this.packageError = ""
    try {
      this.packages = await this.packageRegistry.search()
    }
    catch(error) {
      this.packageError = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.packagesLoading = false
    }
  }

  private handleRibbonComboboxChange = (event: Event) => {
    const detail = (event as CustomEvent<{name?: unknown, value?: unknown}>).detail
    if(!detail || typeof detail.name !== "string" || !isStyleMarkName(detail.name) || typeof detail.value !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setStyleMark",
      property: detail.name,
      value: detail.value,
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

    const buildChildren = (element: Element, path: number[]): DocumentTreeItem[] =>
      Array.from(element.childNodes).flatMap((child, index) => {
        if(child.nodeType !== Node.ELEMENT_NODE) return []
        const childElement = child as Element
        const childPath = [...path, index]
        return isMarkElement(childElement)? buildChildren(childElement, childPath): [build(childElement, childPath)]
      })

    const build = (element: Element, path: number[]): DocumentTreeItem => ({
      path: [...path],
      ...getElementPresentation(element),
      children: buildChildren(element, path),
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
    if(isMarkStateChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.canMark = event.data.detail.canMark
      this.marks = [...event.data.detail.marks]
      this.markStyles = {...(event.data.detail.styles ?? {})}
      this.dispatchEvent(new CustomEvent(markStateChangeEvent, {
        detail: {canMark: this.canMark, marks: [...this.marks], styles: {...this.markStyles}},
        bubbles: true,
        composed: true,
      }))
      return
    }
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
    this.canMark = false
    this.marks = []
    this.markStyles = {}
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
          .canMark=${this.canMark}
          .marks=${this.marks}
          .markStyles=${this.markStyles}
          .presenceUsers=${this.presenceUsers}
          .packages=${this.packages}
          .installedPackages=${this.installedPackages}
          .packagesLoading=${this.packagesLoading}
          .busyPackageNames=${this.busyPackageNames}
          .packageError=${this.packageError}
          @ribbon-button-click=${this.handleRibbonButtonClick}
          @ribbon-combobox-change=${this.handleRibbonComboboxChange}
          @ribbon-collapse=${this.handleRibbonCollapse}
          @ribbon-input-pointerdown=${this.handleRibbonInputPointerDown}
          @ribbon-input-focus=${this.handleRibbonInputFocus}
          @ribbon-input-blur=${this.handleRibbonInputBlur}
          @ribbon-input-commit=${this.finishRibbonInput}
          @ribbon-input-cancel=${this.finishRibbonInput}
          @package-catalog-request=${this.loadPackageCatalog}
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
      <iframe
        title="DOM editor"
        srcdoc=${this.editorSrcdoc}
        @load=${this.handleEditorFrameLoad}
      ></iframe>
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
