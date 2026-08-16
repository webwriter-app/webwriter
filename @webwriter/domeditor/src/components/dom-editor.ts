import { LitElement, css, html } from "lit"
import type { AppRibbon } from "./ribbon"
import type { DomEditorBreadcrumb, DocumentTreeItem } from "./breadcrumb"
import type { EditingAction } from "../domeditor"
import { insertionMenuItems } from "./insertion-menu"
import type {EditorStateSnapshot} from "../editor-state"
import {
  INSTALLED_PACKAGES_STORAGE_KEY,
  packageMemberAction,
  WebWriterPackageRegistry,
  type PackageMember,
  type WebWriterPackage,
} from "../packages"
import { getElementPresentation } from "../element-names"
import {
  canonicalMarkName,
  isMarkAttributeName,
  isMarkElement,
  isStyleMarkName,
  mergedMarkGroupFor,
  type MarkAttributeValues,
  type MarkName,
  type StyleMarkValues,
} from "../marks"
import {isWidgetShadowInteraction} from "../utility"
import {
  isMediaType,
  isWebsiteType,
  mediaAttributeOptions,
  type MediaSelectionState,
} from "../media"
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
  type ListType,
  type InitializeEditorMessage,
  type LoadWidgetsMessage,
} from "../editor-bridge"
import "./breadcrumb"
import "./ribbon"
import {restoreOriginalResourceURLs, serializeDoctype} from "../serialization"
import {
  loadLocalPackage,
  localPackageWatchPaths,
  type LocalPackageDirectory,
  type LocalPackageWarning,
} from "../local-package"
import {LocalPackageMonitor} from "../local-package-monitor"
import {LOCAL_PACKAGE_ROUTE_PREFIX, localPackageUrl, type LocalPackageDirectoryHandle} from "../local-package-worker"
import {LocalPackageWorkerClient} from "../local-package-worker-client"

type WritableFileStream = {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}

type LocalFileHandle = {
  readonly name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableFileStream>
}

type FilePickerWindow = Window & typeof globalThis & {
  showOpenFilePicker?: (options?: object) => Promise<LocalFileHandle[]>
  showSaveFilePicker?: (options?: object) => Promise<LocalFileHandle>
  showDirectoryPicker?: (options?: object) => Promise<FileSystemDirectoryHandle>
}

type FileFormat = "html" | "offline"

const escapeAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")

const editorEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/editor-entry.ts" : "assets/editor-entry.js"}`
const appIconUrl = `${import.meta.env.BASE_URL}assets/app-icon-transparent.svg`
const scopedCustomElementRegistryPolyfillUrl = "https://cdn.jsdelivr.net/npm/@webcomponents/scoped-custom-element-registry@0.0.10/scoped-custom-element-registry.min.js"
const localPackageResourcePath = LOCAL_PACKAGE_ROUTE_PREFIX
const packageLoadTimeoutMs = 10_000

type LocalPackageRecord = {
  id: string
  directory: FileSystemDirectoryHandle
  package: WebWriterPackage
  warnings: LocalPackageWarning[]
  revision: number
  enabled: boolean
  monitor?: LocalPackageMonitor
  error?: string
  autoReload: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isAbortError = (error: unknown) => error instanceof DOMException
  ? error.name === "AbortError"
  : isRecord(error) && error.name === "AbortError"

const isLocalResourcePackage = (pkg: WebWriterPackage) => [
  pkg.iconUrl,
  ...pkg.scripts,
  ...pkg.styles,
  ...pkg.members.flatMap(member => [member.iconUrl, member.htmlUrl, member.scriptUrl, member.styleUrl]),
].some(url => url?.includes(localPackageResourcePath))

const localPackageId = () => globalThis.crypto?.randomUUID?.()
  ?? `package-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const localPackagePlaceholder = (directory: FileSystemDirectoryHandle, id: string): WebWriterPackage => ({
  name: `@local/${(directory.name || id).toLowerCase().replaceAll(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || id}`,
  version: "0.0.0",
  label: directory.name || "Local package",
  description: "This local package could not be loaded yet.",
  authors: [],
  keywords: ["local", "development"],
  links: {},
  members: [],
  scripts: [],
  styles: [],
})

const isStoredPackageMember = (value: unknown): value is PackageMember => {
  if(!isRecord(value)) return false
  return typeof value.id === "string"
    && typeof value.packageName === "string"
    && typeof value.packageVersion === "string"
    && typeof value.exportName === "string"
    && (value.kind === "widget" || value.kind === "snippet")
    && typeof value.label === "string"
    && typeof value.insertable === "boolean"
}

const isStoredPackage = (value: unknown): value is WebWriterPackage => {
  if(!isRecord(value)) return false
  return typeof value.name === "string"
    && typeof value.version === "string"
    && typeof value.label === "string"
    && Array.isArray(value.authors) && value.authors.every(author => typeof author === "string")
    && Array.isArray(value.keywords) && value.keywords.every(keyword => typeof keyword === "string")
    && isRecord(value.links)
    && Array.isArray(value.members) && value.members.every(isStoredPackageMember)
    && Array.isArray(value.scripts) && value.scripts.every(script => typeof script === "string")
    && Array.isArray(value.styles) && value.styles.every(style => typeof style === "string")
}

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
    captureSelection: {attribute: false, state: true},
    selectionGap: {attribute: false, state: true},
    documentTree: {attribute: false, state: true},
    canMark: {attribute: false, state: true},
    marks: {attribute: false, state: true},
    markStyles: {attribute: false, state: true},
    markAttributes: {attribute: false, state: true},
    presenceUsers: {attribute: false, state: true},
    packages: {attribute: false, state: true},
    installedPackages: {attribute: false, state: true},
    packagesLoading: {attribute: false, state: true},
    busyPackageNames: {attribute: false, state: true},
    packageError: {attribute: false, state: true},
    localPackages: {attribute: false, state: true},
    localPackagesLoading: {attribute: false, state: true},
    localPackageError: {attribute: false, state: true},
    selectedLocalPackageName: {attribute: false, state: true},
    selectedLocalPackageAutoReload: {attribute: false, state: true},
    frameRevision: {attribute: false, state: true},
    listType: {attribute: false, state: true},
    listStyle: {attribute: false, state: true},
    mediaSelection: {attribute: false, state: true},
    fileName: {attribute: false, state: true},
    fileDirty: {attribute: false, state: true},
    previewActive: {attribute: false, state: true},
  }

  private editorDocument: Document | null = null
  private editorWindow: Window | null = null
  private documentTreeObserver: MutationObserver | null = null
  private editorReadyPromise: Promise<Window> | null = null
  private editorReadyResolve: ((editorWindow: Window) => void) | null = null
  private editorReadyReject: ((reason: unknown) => void) | null = null
  private requestSequence = 0
  private packageLoadSequence = 0
  private savedEditorSelection: SelectionBookmark | null = null
  private ribbonInputSession = false
  private restoreEditorAfterRibbonInput = false
  private selectionPath: SelectionPathItem[] = []
  private nodeSelection = false
  private captureSelection = false
  private selectionGap: SelectionGap | null = null
  private documentTree: DocumentTreeItem | null = null
  private canMark = false
  private marks: MarkName[] = []
  private markStyles: StyleMarkValues = {}
  private markAttributes: MarkAttributeValues = {}
  private listType: ListType | null = null
  private listStyle = ""
  private mediaSelection: MediaSelectionState | null = null
  private presenceUsers: PresenceUser[] = []
  private packages: WebWriterPackage[] = []
  private installedPackages: WebWriterPackage[] = []
  private packagesLoading = false
  private busyPackageNames: string[] = []
  private packageError = ""
  private localPackages: WebWriterPackage[] = []
  private localPackagesLoading = false
  private localPackageError = ""
  private selectedLocalPackageName = ""
  private selectedLocalPackageAutoReload = false
  private readonly localPackageRecords = new Map<string, LocalPackageRecord>()
  private readonly localPackageReloads = new Set<string>()
  private readonly localPackageReloadPending = new Set<string>()
  private readonly localPackageWorker = new LocalPackageWorkerClient()
  private frameState: EditorStateSnapshot | undefined
  private frameRevision = 0
  private frameDocumentHTML: string | null = null
  private fileName = ""
  private fileDirty = false
  private previewActive = false
  private previewDocumentHTML: string | null = null
  private previewSelection: SelectionBookmark | null = null
  private previewTransition = false
  private fileFormat: FileFormat = "html"
  private fileHandle: LocalFileHandle | null = null
  private dirtyTrackingReady = false
  private dirtyTrackingMutationPending = false
  private dirtyTrackingTimer: ReturnType<typeof setTimeout> | undefined
  private packageCatalogRequested = false
  private installedPackagesRestored = false
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

    iframe[hidden] {
      display: none;
    }
  `

  private get editorSrcdoc() {
    const bootstrap = `<script data-webwriter-editor-only src="${escapeAttribute(scopedCustomElementRegistryPolyfillUrl)}"></script><script data-webwriter-editor-only type="module" src="${escapeAttribute(editorEntryUrl)}"></script>`
    if(this.frameDocumentHTML === null) return `<!-- frame ${this.frameRevision} -->${bootstrap}`

    const parsed = new DOMParser().parseFromString(this.frameDocumentHTML, "text/html")
    restoreOriginalResourceURLs(parsed)
    parsed.head.insertAdjacentHTML("beforeend", bootstrap)
    return `<!-- frame ${this.frameRevision} -->${serializeDoctype(parsed.doctype)}${parsed.documentElement.outerHTML}`
  }

  /** Creates a static copy for preview without bootstrapping another
   * DOMEditor. The live editor iframe remains mounted separately so its Yjs
   * document, undo manager, widgets, and selection stay untouched. */
  private currentPreviewHTML() {
    const source = this.editorDocument?.cloneNode(true) as Document | null
    if(!source?.documentElement) throw new Error("The editor document is not ready")

    source.body?.removeAttribute("contenteditable")
    source.body?.removeAttribute("spellcheck")
    source.querySelectorAll("[contenteditable]").forEach(element => element.removeAttribute("contenteditable"))
    source.querySelectorAll("[data-webwriter-editor-only]").forEach(element => element.remove())

    const editingElements = Array.from(source.querySelectorAll<HTMLElement>("[class]"))
      .filter(element => Array.from(element.classList).some(name => name.startsWith("◆")))
    editingElements.forEach(element => {
      if(element.classList.contains("◆editor-only")) {
        element.remove()
        return
      }
      element.classList.remove(...Array.from(element.classList).filter(name => name.startsWith("◆")))
      if(!element.classList.length) element.removeAttribute("class")
    })

    // The editor loads installed widget assets as editor-only nodes. Re-add
    // those assets without editor markers so custom elements render in the
    // preview copy as they do in the live document.
    if(source.head) {
      const styles = [...new Set(this.installedPackages.flatMap(pkg => pkg.styles))]
        .map(href => {
          const link = source.createElement("link")
          link.rel = "stylesheet"
          link.href = href
          return link
        })
      const scripts = [...new Set(this.installedPackages.flatMap(pkg => pkg.scripts))]
        .map(src => {
          const script = source.createElement("script")
          script.type = "module"
          script.src = src
          return script
        })
      source.head.append(...styles, ...scripts)
    }

    // `designMode` is a document property rather than serialized markup. A
    // srcdoc that does not load editor-entry therefore starts in its default
    // "off" state; explicitly clearing it also documents that invariant for
    // DOM implementations that retain a cloned property.
    source.designMode = "off"
    return `${serializeDoctype(source.doctype)}${source.documentElement.outerHTML}`
  }

  private get syncUrl() {
    const syncUrl = new URL(`ws://${location.hostname}:1234`)
    const outerUrl = new URL(location.href)
    outerUrl.searchParams.forEach((value, key) => syncUrl.searchParams.set(key, value))
    return syncUrl.href
  }

  private handlePreviewFrameLoad = (event: Event) => {
    const frame = event.currentTarget as HTMLIFrameElement
    const previewDocument = frame.contentDocument
    if(!previewDocument) return
    previewDocument.designMode = "off"
    previewDocument.body?.removeAttribute("contenteditable")
  }

  private handleEditorFrameLoad = (event: Event) => {
    this.dirtyTrackingReady = false
    this.dirtyTrackingMutationPending = false
    if(this.dirtyTrackingTimer !== undefined) clearTimeout(this.dirtyTrackingTimer)
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
    const FrameMutationObserver = (this.editorWindow as unknown as {
      MutationObserver?: typeof MutationObserver
    } | null)?.MutationObserver
    if(body && FrameMutationObserver) {
      // Construct the observer in the iframe's realm. Chromium rejects an
      // outer-window MutationObserver when scoped-registry initialization
      // reloads the iframe and hands it an iframe-owned Node.
      const observer = new FrameMutationObserver((mutations: MutationRecord[]) => {
        if(mutations.some(mutation => mutation.type === "childList")) {
          this.documentTree = this.buildDocumentTree()
        }
        const hasAuthoredMutation = mutations.some(mutation => this.isAuthoredMutation(mutation))
        if(hasAuthoredMutation) {
          if(this.dirtyTrackingReady) this.fileDirty = !this.isFreshDocumentUnchanged()
          else this.dirtyTrackingMutationPending = true
        }
      })
      this.documentTreeObserver = observer
      try {
        observer.observe(this.editorDocument?.documentElement ?? body, {
          attributes: true,
          attributeOldValue: true,
          characterData: true,
          childList: true,
          subtree: true,
        })
      }
      catch {
        // A preliminary iframe load can expose a body from the document being
        // replaced. Do not let that transient realm mismatch prevent the
        // initialization messages below from reaching the final document.
        observer.disconnect()
        this.documentTreeObserver = null
      }
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
        packages: this.installedPackages,
      }
      this.editorWindow.postMessage(initializeMessage, "*")
      const packageLoadRequestId = `packages-${++this.packageLoadSequence}`
      const packageLoad = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          if(!this.pendingExecutions.delete(packageLoadRequestId)) return
          reject(new Error("The editor did not finish loading package resources"))
        }, packageLoadTimeoutMs)
        this.pendingExecutions.set(packageLoadRequestId, {
          resolve: value => {
            clearTimeout(timer)
            resolve(value)
          },
          reject: reason => {
            clearTimeout(timer)
            reject(reason)
          },
        })
      })
      this.editorWindow.postMessage({...loadMessage, requestId: packageLoadRequestId}, "*")
      void packageLoad.catch(error => {
        const message = error instanceof Error ? error.message : String(error)
        if(!this.isConnected || message === "The editor iframe was reloaded for a package change") return
        if(this.installedPackages.some(isLocalResourcePackage)) this.localPackageError = message
        else this.packageError = message
      })
      this.editorReadyResolve?.(this.editorWindow)
      this.dirtyTrackingTimer = setTimeout(() => {
        this.dirtyTrackingReady = true
        if(this.dirtyTrackingMutationPending) {
          this.dirtyTrackingMutationPending = false
          this.fileDirty = !this.isFreshDocumentUnchanged()
        }
        this.dirtyTrackingTimer = undefined
      }, 0)
    }
    else {
      this.editorReadyReject?.(new Error("The DOM editor iframe has no content window"))
    }
    this.editorReadyResolve = null
    this.editorReadyReject = null
  }

  private authoredClasses(value: string | null) {
    return (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
  }

  private isFreshDocumentUnchanged() {
    if(this.fileHandle !== null) return false
    const body = this.editorDocument?.body
    if(!body) return false

    const authoredChildren = Array.from(body.childNodes).filter(node => {
      if(node.nodeType !== Node.ELEMENT_NODE) return true
      const element = node as Element
      return !element.classList.contains("◆editor-only")
        && !element.hasAttribute("data-webwriter-editor-only")
    })
    if(authoredChildren.length === 0) return true

    const onlyChild = authoredChildren[0]
    return authoredChildren.length === 1
      && onlyChild?.nodeType === Node.ELEMENT_NODE
      && (onlyChild as Element).localName === "p"
      && onlyChild.childNodes.length === 0
  }

  private isAuthoredMutation(mutation: MutationRecord) {
    if(mutation.type === "characterData") return true
    if(mutation.type === "attributes") {
      if(mutation.attributeName === "contenteditable" || mutation.attributeName === "spellcheck") return false
      if(mutation.attributeName === "class") {
        const current = mutation.target.nodeType === Node.ELEMENT_NODE
          ? (mutation.target as Element).getAttribute("class")
          : null
        return this.authoredClasses(mutation.oldValue) !== this.authoredClasses(current)
      }
      return true
    }
    const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
    return nodes.some(node => !(
      node.nodeType === Node.ELEMENT_NODE && (node as Element).classList.contains("◆editor-only")
    ))
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
    return this.renderRoot.querySelector<HTMLIFrameElement>("iframe.editor-frame")
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

  private async enterPreview() {
    if(this.previewActive || this.previewTransition) return
    this.previewTransition = true
    this.savedEditorSelection = null
    this.saveEditorSelection()
    this.previewSelection = this.savedEditorSelection
    this.savedEditorSelection = null

    try {
      if(!this.editorDocument) await this.waitForEditorWindow()
      this.previewDocumentHTML = this.currentPreviewHTML()
      this.previewActive = true
    }
    catch(error) {
      this.previewSelection = null
      this.reportFileError(error)
    }
    finally {
      this.previewTransition = false
    }
  }

  private async exitPreview() {
    if(!this.previewActive || this.previewTransition) return
    const selection = this.previewSelection
    this.previewSelection = null
    this.previewDocumentHTML = null
    this.previewActive = false
    await this.updateComplete
    this.savedEditorSelection = selection
    this.focusEditor(true)
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

  private handleFileNameChange = (event: Event) => {
    const value = (event as CustomEvent<{value?: unknown}>).detail?.value
    if(typeof value === "string") this.fileName = this.baseFileName(value)
  }

  private filePickerWindow() {
    return window as FilePickerWindow
  }

  private htmlFilePickerOptions(suggestedName?: string) {
    return {
      ...(suggestedName ? {suggestedName} : {}),
      types: [
        {
          description: "HTML document (.html)",
          accept: {"text/html": [".html", ".htm"]},
        },
        {
          description: "Offline HTML document (.offline.html)",
          accept: {"text/html": [".offline.html"]},
        },
      ],
    }
  }

  private formatForFileName(name: string, fallback: FileFormat = "html"): FileFormat {
    const lowerName = name.toLowerCase()
    if(lowerName.endsWith(".offline.html")) return "offline"
    if(lowerName.endsWith(".html") || lowerName.endsWith(".htm")) return "html"
    return fallback
  }

  private baseFileName(name: string) {
    if(name.toLowerCase().endsWith(".offline.html")) return name.slice(0, -".offline.html".length)
    if(name.toLowerCase().endsWith(".html")) return name.slice(0, -".html".length)
    if(name.toLowerCase().endsWith(".htm")) return name.slice(0, -".htm".length)
    return name
  }

  private fileNameForFormat(format: FileFormat) {
    return this.fileName
      ? `${this.fileName}${format === "offline" ? ".offline.html" : ".html"}`
      : ""
  }

  private isPickerCancellation(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError"
  }

  private reportFileError(error: unknown) {
    if(this.isPickerCancellation(error)) return
    this.dispatchEvent(new CustomEvent("file-error", {
      detail: {error},
      bubbles: true,
      composed: true,
    }))
    console.error(error)
  }

  private confirmDiscardChanges() {
    return !this.fileDirty || window.confirm("Discard the unsaved changes to this document?")
  }

  private async reloadDocument(htmlSource: string) {
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
    this.frameState = undefined
    this.frameDocumentHTML = htmlSource
    const reloadError = new Error("The editor iframe was reloaded for a document change")
    this.pendingExecutions.forEach(({reject}) => reject(reloadError))
    this.pendingExecutions.clear()
    this.frameRevision++
    await this.updateComplete
    await this.waitForEditorWindow()
  }

  private async newDocument() {
    if(!this.confirmDiscardChanges()) return
    try {
      this.fileHandle = null
      this.fileName = ""
      this.fileFormat = "html"
      await this.reloadDocument("<!DOCTYPE html><html><head></head><body></body></html>")
      this.fileDirty = false
      this.focusEditor()
    }
    catch(error) {
      this.reportFileError(error)
    }
  }

  private async openDocument() {
    if(!this.confirmDiscardChanges()) return
    const picker = this.filePickerWindow().showOpenFilePicker
    if(!picker) {
      this.reportFileError(new Error("This browser does not support the File System Access API"))
      return
    }
    try {
      const [handle] = await picker.call(window, this.htmlFilePickerOptions())
      if(!handle) return
      const file = await handle.getFile()
      const source = await file.text()
      await this.reloadDocument(source)
      this.fileHandle = handle
      const openedName = file.name || handle.name
      this.fileName = this.baseFileName(openedName)
      this.fileFormat = this.formatForFileName(openedName)
      this.fileDirty = false
      this.focusEditor()
    }
    catch(error) {
      this.reportFileError(error)
    }
  }

  private async saveDocument(saveAs = false, requestedFormat: FileFormat = this.fileFormat) {
    try {
      const currentHandleMatches = this.fileHandle
        && this.formatForFileName(this.fileHandle.name, requestedFormat) === requestedFormat
        && this.baseFileName(this.fileHandle.name) === this.fileName
      let handle = saveAs || !currentHandleMatches ? null : this.fileHandle
      if(!handle) {
        const picker = this.filePickerWindow().showSaveFilePicker
        if(!picker) throw new Error("This browser does not support the File System Access API")
        handle = await picker.call(window, this.htmlFilePickerOptions(this.fileNameForFormat(requestedFormat)))
      }
      const selectedFormat = this.formatForFileName(handle.name, requestedFormat)
      const source = await this.execute({type: "serializeDocument", offline: selectedFormat === "offline"})
      if(typeof source !== "string") throw new TypeError("The editor returned invalid HTML")
      const writable = await handle.createWritable()
      await writable.write(new Blob([source], {type: "text/html;charset=utf-8"}))
      await writable.close()
      this.fileHandle = handle
      this.fileName = this.baseFileName(handle.name)
      this.fileFormat = selectedFormat
      this.fileDirty = false
    }
    catch(error) {
      this.reportFileError(error)
    }
  }

  private printDocument() {
    this.editorWindow?.print()
  }

  private async downloadDocument() {
    try {
      const source = await this.execute({
        type: "serializeDocument",
        offline: this.fileFormat === "offline",
      })
      if(typeof source !== "string") throw new TypeError("The editor returned invalid HTML")

      const format = this.fileFormat === "offline" ? "offline" : "html"
      const filename = this.fileNameForFormat(format) || `document${format === "offline" ? ".offline" : ""}.html`
      const url = URL.createObjectURL(new Blob([source], {type: "text/html;charset=utf-8"}))
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    }
    catch(error) {
      this.reportFileError(error)
    }
  }

  private handleRibbonButtonClick = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label === "Preview") {
      if(this.previewActive) void this.exitPreview()
      else void this.enterPreview()
      return
    }
    if(label === "New") {
      void this.newDocument()
      return
    }
    if(label === "Open") {
      void this.openDocument()
      return
    }
    if(label === "Save") {
      void this.saveDocument()
      return
    }
    if(label === "Save as") {
      void this.saveDocument(true)
      return
    }
    if(label === "save:html" || label === "save:offline") {
      void this.saveDocument(false, label === "save:offline" ? "offline" : "html")
      return
    }
    if(label === "save-as:html" || label === "save-as:offline") {
      void this.saveDocument(true, label === "save-as:offline" ? "offline" : "html")
      return
    }
    if(label === "Print") {
      this.printDocument()
      return
    }
    if(label === "Download") {
      void this.downloadDocument()
      return
    }
    if(label === "local-package-add") {
      void this.addLocalPackage()
      return
    }
    if(label?.startsWith("local-package-select:")) {
      const name = label.slice("local-package-select:".length)
      this.selectLocalPackage(name)
      return
    }
    if(label?.startsWith("local-package:")) {
      const name = label.slice("local-package:".length)
      this.selectLocalPackage(name)
      const pkg = this.localPackages.find(candidate => candidate.name === name)
      if(!pkg) {
        this.localPackageError = `Local package '${name}' is no longer available`
        return
      }
      if(!pkg.members.some(member => member.insertable)) {
        this.localPackageError = `${pkg.label} has no bundle yet. Build the package to make its exports available.`
        return
      }
      void this.installAndInsertPackage(pkg)
      return
    }
    if(label?.startsWith("package-member:")) {
      const pkg = [...this.installedPackages, ...this.localPackages, ...this.packages]
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
    if(label?.startsWith("mark-detail:")) {
      const mark = canonicalMarkName(label.slice("mark-detail:".length))
      if(mark) void this.execute({type: "toggleMark", mark}).finally(() => this.focusEditor())
      else this.focusEditor()
      return
    }
    if(label?.startsWith("mark:")) {
      const mark = canonicalMarkName(label.slice("mark:".length))
      const group = mark ? mergedMarkGroupFor(mark) : undefined
      if(!mark) this.focusEditor()
      else if(group?.primary === mark) {
        void this.execute({type: "toggleMarkGroup", mark}).finally(() => this.focusEditor())
      }
      else if(group) {
        void this.execute({type: "toggleMark", mark}).finally(() => this.focusEditor())
      }
      else void this.execute({type: "toggleMark", mark}).finally(() => this.focusEditor())
      return
    }
    if(label?.startsWith("toggle-list:")) {
      const listType = label.slice("toggle-list:".length) as ListType
      if(listType === "ul" || listType === "ol" || listType === "dl" || listType === "menu") {
        void this.execute({type: "toggleList", listType}).finally(() => this.focusEditor())
      }
      else this.focusEditor()
      return
    }
    if(label?.startsWith("list-style:")) {
      const [, listType, style] = label.split(":")
      if((listType === "ul" || listType === "ol" || listType === "dl" || listType === "menu") && style) {
        void this.execute({type: "setListStyle", listType, style}).finally(() => this.focusEditor())
      }
      else this.focusEditor()
      return
    }
    if(label === "insert-details") {
      void this.execute({type: "insertDetails"})
        .finally(() => this.focusEditor())
      return
    }
    const item = insertionMenuItems.find(candidate => candidate.name === label)
    if(!item) {
      this.focusEditor()
      return
    }

    if(item.tag === "ul" || item.tag === "ol" || item.tag === "dl" || item.tag === "menu") {
      void this.execute({type: "toggleList", listType: item.tag}).finally(() => this.focusEditor())
      return
    }
    if(item.tag === "details") {
      void this.execute({type: "insertDetails"}).finally(() => this.focusEditor())
      return
    }

    if(isMediaType(item.tag)) {
      void this.execute({type: "insertMedia", media: item.tag}).finally(() => this.focusEditor())
      return
    }

    void this.execute({
      type: "insert",
      html: `<${item.tag}></${item.tag}>`,
    }).finally(() => this.focusEditor())
  }

  private selectLocalPackage(name: string) {
    const record = [...this.localPackageRecords.values()].find(candidate => candidate.package.name === name)
    if(!record) {
      this.localPackageError = `Local package '${name}' is no longer available`
      return
    }
    this.selectedLocalPackageName = name
    this.selectedLocalPackageAutoReload = record.autoReload
  }

  private async handleLocalPackageMetadataChange(event: Event) {
    const detail = (event as CustomEvent<{field?: string, value?: string}>).detail
    const record = [...this.localPackageRecords.values()].find(candidate => candidate.package.name === this.selectedLocalPackageName)
    if(!record || !detail?.field) return
    if(!["name", "version", "description", "license"].includes(detail.field)) return
    try {
      const directory = record.directory as FileSystemDirectoryHandle & {getFileHandle(name: string, options?: {create?: boolean}): Promise<any>}
      const handle = await directory.getFileHandle("package.json")
      const file = await handle.getFile()
      const parsed: unknown = JSON.parse(await file.text())
      if(!isRecord(parsed)) throw new Error("The local package.json must contain a JSON object")
      const manifest = {...parsed}
      const value = detail.value ?? ""
      if((detail.field === "description" || detail.field === "license") && !value.trim()) delete manifest[detail.field]
      else manifest[detail.field] = value
      if(detail.field === "name") {
        if(!/^@[^/\s]+\/[^/\s]+$/.test(value)) throw new Error("Package name must be scoped (for example @scope/name)")
        const duplicate = [...this.localPackageRecords.values()].find(candidate => (
          candidate.id !== record.id && candidate.package.name === value
        ))
        if(duplicate) throw new Error(`A local package named '${value}' is already loaded`)
      }
      if(detail.field === "version" && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) {
        throw new Error("Package version must use semantic versioning")
      }
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(manifest, null, 2) + "\n")
      await writable.close()
      await this.refreshLocalPackage(record.id)
      const refreshed = this.localPackageRecords.get(record.id)
      if(refreshed) this.selectLocalPackage(refreshed.package.name)
    }
    catch(error) {
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  private handleLocalPackageAutoReloadChange = (event: Event) => {
    const detail = (event as CustomEvent<{enabled?: boolean}>).detail
    const record = [...this.localPackageRecords.values()].find(candidate => candidate.package.name === this.selectedLocalPackageName)
    if(!record || typeof detail?.enabled !== "boolean") return
    record.autoReload = detail.enabled
    this.selectedLocalPackageAutoReload = detail.enabled
  }

  private handleRibbonPreviewExit = () => {
    void this.exitPreview()
  }

  private async matchingLocalPackage(directory: FileSystemDirectoryHandle) {
    const candidate = directory as FileSystemDirectoryHandle & {
      isSameEntry?: (other: FileSystemHandle) => Promise<boolean>
    }
    if(typeof candidate.isSameEntry !== "function") return undefined
    for(const record of this.localPackageRecords.values()) {
      try {
        if(await candidate.isSameEntry(record.directory)) return record
      }
      catch {
        // An expired handle is not a match; loading the newly-picked handle
        // will surface any current permission problem.
      }
    }
  }

  private updateLocalPackageList() {
    this.localPackages = [...this.localPackageRecords.values()].map(record => record.package)
  }

  private replaceLocalPackageName(id: string, name: string) {
    for(const [otherId, other] of this.localPackageRecords) {
      if(otherId === id || other.package.name !== name) continue
      other.monitor?.dispose()
      this.localPackageRecords.delete(otherId)
      void this.localPackageWorker.unregister(otherId).catch(() => {
        // The newly selected folder is already registered; stale worker state
        // does not prevent it from becoming the active package with this name.
      })
    }
  }

  private localPackageWarning(pkg: WebWriterPackage, warnings: LocalPackageWarning[]) {
    if(!warnings.length) return ""
    const missingBundle = warnings.find(warning => warning.code === "missing-bundle")
    return missingBundle
      ? `${pkg.label} has no bundle yet. Build the package to make its exports available.`
      : `${pkg.label}: ${warnings.map(warning => warning.message).join(" ")}`
  }

  private async watchLocalPackage(record: LocalPackageRecord) {
    const paths = localPackageWatchPaths(record.package.manifest)
    if(record.monitor) {
      await record.monitor.setPaths(paths)
      return
    }
    const monitor = new LocalPackageMonitor(record.directory as unknown as LocalPackageDirectory, {
      onChange: () => void this.refreshLocalPackage(record.id),
    })
    record.monitor = monitor
    await monitor.start(paths)
  }

  private async refreshLocalPackage(id: string) {
    if(this.localPackageReloads.has(id)) {
      this.localPackageReloadPending.add(id)
      return
    }
    this.localPackageReloads.add(id)
    try {
      do {
        this.localPackageReloadPending.delete(id)
        await this.performLocalPackageRefresh(id)
      } while(this.localPackageReloadPending.has(id))
    }
    finally {
      this.localPackageReloadPending.delete(id)
      this.localPackageReloads.delete(id)
    }
  }

  private async performLocalPackageRefresh(id: string) {
    const previous = this.localPackageRecords.get(id)
    if(!previous) return
    try {
      const revision = previous.revision + 1
      let result: Awaited<ReturnType<typeof loadLocalPackage>>
      try {
        result = await loadLocalPackage(previous.directory as unknown as LocalPackageDirectory, {
          urlFor: path => localPackageUrl(id, path, revision),
          locale: document.documentElement.lang || navigator.language || "en",
        })
      }
      catch(error) {
        previous.error = error instanceof Error ? error.message : String(error)
        this.localPackageError = `${previous.package.label}: ${previous.error}`
        await this.watchLocalPackage(previous)
        this.updateLocalPackageList()
        return
      }

      // Build tools often replace the output file rather than updating it in
      // place. Keep the last working package while that short missing-file
      // window is visible, but continue polling/observing for the finished build.
      if(!result.package.members.length && previous.package.members.length) {
        previous.warnings = result.warnings
        previous.error = this.localPackageWarning(result.package, result.warnings)
        this.localPackageError = previous.error
        await this.watchLocalPackage(previous)
        return
      }

      const nextRecord: LocalPackageRecord = {
        ...previous,
        package: result.package,
        warnings: result.warnings,
        revision,
        error: undefined,
      }
      this.replaceLocalPackageName(id, result.package.name)
      this.localPackageRecords.set(id, nextRecord)
      this.updateLocalPackageList()
      await this.watchLocalPackage(nextRecord)
      this.localPackageError = this.localPackageWarning(result.package, result.warnings)

      if(nextRecord.enabled && nextRecord.autoReload && result.package.members.length) {
        const nextPackages = this.installedPackages.filter(candidate => (
          candidate.name !== previous.package.name && candidate.name !== result.package.name
        ))
        nextPackages.push(result.package)
        await this.reloadEditor(nextPackages)
      }
    }
    catch(error) {
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  private async addLocalPackage() {
    const picker = (window as FilePickerWindow).showDirectoryPicker
    if(!picker) {
      this.localPackageError = "This browser cannot open local package folders. Use a secure Chromium-based browser with the File System Access API."
      return
    }

    this.localPackagesLoading = true
    this.localPackageError = ""
    try {
      // The picker is deliberately the first awaited operation: browsers
      // require it to run within the Load package button's user activation.
      const directory = await picker.call(window, {id: "webwriter-develop-package", mode: "readwrite"})
      const previous = await this.matchingLocalPackage(directory)
      const id = previous?.id ?? localPackageId()
      await this.localPackageWorker.start()
      await this.localPackageWorker.register(id, directory as unknown as LocalPackageDirectoryHandle)

      const revision = (previous?.revision ?? -1) + 1
      let loaded: Awaited<ReturnType<typeof loadLocalPackage>>
      try {
        loaded = await loadLocalPackage(directory as unknown as LocalPackageDirectory, {
          urlFor: path => localPackageUrl(id, path, revision),
          locale: document.documentElement.lang || navigator.language || "en",
        })
      }
      catch(error) {
        const pkg = previous?.package ?? localPackagePlaceholder(directory, id)
        const record: LocalPackageRecord = {
          id,
          directory,
          package: pkg,
          warnings: previous?.warnings ?? [],
          revision,
          enabled: true,
          monitor: previous?.monitor,
          error: error instanceof Error ? error.message : String(error),
          autoReload: previous?.autoReload ?? true,
        }
        this.localPackageRecords.set(id, record)
        this.updateLocalPackageList()
        await this.watchLocalPackage(record)
        this.selectLocalPackage(record.package.name)
        this.localPackageError = `${pkg.label}: ${record.error}`
        return
      }

      const record: LocalPackageRecord = {
        id,
        directory,
        package: loaded.package,
        warnings: loaded.warnings,
        revision,
        enabled: true,
        monitor: previous?.monitor,
        autoReload: previous?.autoReload ?? true,
      }
      this.replaceLocalPackageName(id, loaded.package.name)
      this.localPackageRecords.set(id, record)
      this.updateLocalPackageList()
      await this.watchLocalPackage(record)
      this.selectLocalPackage(record.package.name)
      this.localPackageError = this.localPackageWarning(loaded.package, loaded.warnings)

      if(loaded.package.members.length) {
        const nextPackages = this.installedPackages.filter(candidate => (
          candidate.name !== previous?.package.name && candidate.name !== loaded.package.name
        ))
        nextPackages.push(loaded.package)
        await this.reloadEditor(nextPackages)
      }
    }
    catch(error) {
      if(!isAbortError(error)) this.localPackageError = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.localPackagesLoading = false
    }
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
      const localPackage = this.localPackages.find(candidate => candidate.name === pkg.name)
      const resolvedPackage = installed ? localPackage ?? await this.packageRegistry.getPackage(pkg) : pkg
      const nextPackages = installed
        ? [...this.installedPackages.filter(candidate => candidate.name !== pkg.name), resolvedPackage]
        : this.installedPackages.filter(candidate => candidate.name !== pkg.name)
      await this.reloadEditor(nextPackages)
      const localRecord = [...this.localPackageRecords.values()].find(candidate => candidate.package.name === pkg.name)
      if(localRecord) localRecord.enabled = installed
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
    this.persistInstalledPackages()
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

  private restoreInstalledPackages() {
    if(this.installedPackagesRestored) return
    this.installedPackagesRestored = true
    try {
      const serialized = globalThis.localStorage?.getItem(INSTALLED_PACKAGES_STORAGE_KEY)
      if(serialized === null || serialized === undefined) return
      const stored = JSON.parse(serialized) as unknown
      if(!Array.isArray(stored)) return
      this.installedPackages = stored.filter(isStoredPackage)
    }
    catch {
      // A malformed or unavailable local-storage entry should not prevent the
      // editor from mounting with an empty in-memory package list.
    }
  }

  private persistInstalledPackages() {
    try {
      globalThis.localStorage?.setItem(
        INSTALLED_PACKAGES_STORAGE_KEY,
        JSON.stringify(this.installedPackages.filter(pkg => !isLocalResourcePackage(pkg))),
      )
    }
    catch {
      // Storage can be disabled or full; package changes still work in memory.
    }
  }

  private handleRibbonComboboxChange = (event: Event) => {
    const detail = (event as CustomEvent<{name?: unknown, value?: unknown, values?: unknown}>).detail
    if(detail?.name === "mark-types") {
      const group = mergedMarkGroupFor("span")
      if(!group || !Array.isArray(detail.values) || !detail.values.every(value => (
        typeof value === "string" && group.members.includes(value as MarkName)
      ))) {
        this.focusEditor()
        return
      }
      void this.execute({
        type: "setMarkGroup",
        primary: "span",
        marks: detail.values as MarkName[],
      })
      return
    }
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

  private handleMarkAttributeChange = (event: Event) => {
    const detail = (event as CustomEvent<{
      mark?: unknown
      attribute?: unknown
      value?: unknown
    }>).detail
    const mark = typeof detail?.mark === "string" ? canonicalMarkName(detail.mark) : null
    if(!mark
      || typeof detail?.attribute !== "string"
      || !isMarkAttributeName(mark, detail.attribute)
      || typeof detail.value !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setMarkAttribute",
      mark,
      attribute: detail.attribute,
      value: detail.value,
    }).finally(() => this.focusEditor())
  }

  private handleMediaAttributeChange = (event: Event) => {
    const detail = (event as CustomEvent<{
      type?: unknown
      attribute?: unknown
      value?: unknown
    }>).detail
    if(!isMediaType(detail?.type)
      || typeof detail?.attribute !== "string"
      || !mediaAttributeOptions[detail.type].some(option => option.name === detail.attribute)
      || detail.value !== null && typeof detail.value !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setMediaAttribute",
      name: detail.attribute,
      value: detail.value,
    })
  }

  private handleMediaTypeChange = (event: Event) => {
    const type = (event as CustomEvent<{type?: unknown}>).detail?.type
    if(type === "picture" || type === "img") {
      void this.execute({type: "switchImageType", image: type})
      return
    }
    if(isWebsiteType(type)) {
      void this.execute({type: "switchWebsiteType", website: type})
      return
    }
    this.focusEditor()
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
        if(childElement.matches("source") || childElement.matches("img") && childElement.closest("picture")) return []
        const childPath = [...path, index]
        return isMarkElement(childElement)? buildChildren(childElement, childPath): [build(childElement, childPath)]
      })

    const build = (element: Element, path: number[]): DocumentTreeItem => ({
      path: [...path],
      ...this.elementPresentation(element),
      children: buildChildren(element, path),
    })

    return build(body, [])
  }

  private elementPresentation(element: Element) {
    for(const pkg of this.installedPackages) {
      const member = pkg.members.find(candidate => (
        candidate.kind === "widget" && candidate.tagName?.toLowerCase() === element.localName
      ))
      if(member) {
        const iconUrl = member.iconUrl ?? pkg.iconUrl
        return {
          name: member.label,
          icon: "Packages",
          ...(iconUrl ? {iconUrl} : {}),
        }
      }
    }
    return getElementPresentation(element)
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
      this.markAttributes = Object.fromEntries(
        Object.entries(event.data.detail.attributes ?? {}).map(([mark, attributes]) => [mark, {...attributes}]),
      )
      this.dispatchEvent(new CustomEvent(markStateChangeEvent, {
        detail: {
          canMark: this.canMark,
          marks: [...this.marks],
          styles: {...this.markStyles},
          attributes: this.markAttributes,
        },
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
      this.nodeSelection = event.data.detail.nodeSelected === true || event.data.detail.capture === true
      this.captureSelection = event.data.detail.capture === true
      this.selectionGap = selectionGap
      this.listType = event.data.detail.list?.type ?? null
      this.listStyle = event.data.detail.list?.style ?? ""
      this.mediaSelection = event.data.detail.media
        ? {type: event.data.detail.media.type, attributes: {...event.data.detail.media.attributes}}
        : null
      this.documentTree = this.buildDocumentTree()
      this.dispatchEvent(new CustomEvent(selectionChangeEvent, {
        detail: {
          path,
          ...(this.nodeSelection ? {nodeSelected: true} : {}),
          ...(this.captureSelection ? {capture: true} : {}),
          ...(selectionGap ? {gap: selectionGap} : {}),
          list: {type: this.listType, style: this.listStyle},
          ...(this.mediaSelection ? {media: this.mediaSelection} : {}),
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

  private async restoreLocalPackages() {
    const worker = this.localPackageWorker as LocalPackageWorkerClient & {
      storedDirectories?: () => Promise<Array<{id: string, handle: LocalPackageDirectoryHandle}>>
    }
    if(!worker.storedDirectories) return
    try {
      const stored = await worker.storedDirectories()
      if(stored.length) await worker.start()
      const restored = new Map<string, WebWriterPackage>()
      for(const entry of stored) {
        if(this.localPackageRecords.has(entry.id)) continue
        try {
          const result = await loadLocalPackage(entry.handle as unknown as LocalPackageDirectory, {
            urlFor: path => localPackageUrl(entry.id, path, 0),
            locale: document.documentElement.lang || navigator.language || "en",
          })
          const record: LocalPackageRecord = {
            id: entry.id,
            directory: entry.handle as unknown as FileSystemDirectoryHandle,
            package: result.package,
            warnings: result.warnings,
            revision: 0,
            enabled: true,
            autoReload: true,
          }
          this.replaceLocalPackageName(entry.id, result.package.name)
          this.localPackageRecords.set(entry.id, record)
          restored.set(result.package.name, result.package)
          await this.watchLocalPackage(record)
        }
        catch(error) {
          const placeholder = localPackagePlaceholder(entry.handle as unknown as FileSystemDirectoryHandle, entry.id)
          const record: LocalPackageRecord = {
            id: entry.id,
            directory: entry.handle as unknown as FileSystemDirectoryHandle,
            package: placeholder,
            warnings: [],
            revision: 0,
            enabled: true,
            autoReload: true,
            error: error instanceof Error ? error.message : String(error),
          }
          this.localPackageRecords.set(entry.id, record)
          this.localPackageError = `${placeholder.label}: ${record.error}`
          await this.watchLocalPackage(record)
        }
      }
      this.updateLocalPackageList()
      const firstRestored = this.localPackageRecords.values().next().value as LocalPackageRecord | undefined
      if(!this.selectedLocalPackageName && firstRestored) this.selectLocalPackage(firstRestored.package.name)
      if(restored.size) {
        const restoredNames = new Set(restored.keys())
        await this.reloadEditor([
          ...this.installedPackages.filter(candidate => !restoredNames.has(candidate.name)),
          ...restored.values(),
        ])
      }
    }
    catch(error) {
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("message", this.handleEditorMessage)
    this.restoreInstalledPackages()
    void this.loadPackageCatalog()
    void this.restoreLocalPackages()
    this.localPackageRecords.forEach(record => {
      record.monitor = undefined
      void this.watchLocalPackage(record)
    })
  }

  disconnectedCallback() {
    window.removeEventListener("message", this.handleEditorMessage)
    this.localPackageRecords.forEach(record => {
      record.monitor?.dispose()
      record.monitor = undefined
    })
    if(this.dirtyTrackingTimer !== undefined) clearTimeout(this.dirtyTrackingTimer)
    this.dirtyTrackingTimer = undefined
    this.dirtyTrackingReady = false
    this.dirtyTrackingMutationPending = false
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
    this.previewActive = false
    this.previewDocumentHTML = null
    this.previewSelection = null
    this.previewTransition = false
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
    this.nodeSelection = false
    this.captureSelection = false
    this.selectionGap = null
    this.canMark = false
    this.marks = []
    this.markStyles = {}
    this.markAttributes = {}
    this.mediaSelection = null
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
          .markAttributes=${this.markAttributes}
          .listType=${this.listType}
          .listStyle=${this.listStyle}
          .media=${this.mediaSelection}
          .presenceUsers=${this.presenceUsers}
          .packages=${this.packages}
          .installedPackages=${this.installedPackages}
          .packagesLoading=${this.packagesLoading}
          .busyPackageNames=${this.busyPackageNames}
          .packageError=${this.packageError}
          .localPackages=${this.localPackages}
          .localPackagesLoading=${this.localPackagesLoading}
          .localPackageError=${this.localPackageError}
          .selectedLocalPackageName=${this.selectedLocalPackageName}
          .selectedLocalPackageAutoReload=${this.selectedLocalPackageAutoReload}
          .fileName=${this.fileName}
          .fileDirty=${this.fileDirty}
          .previewActive=${this.previewActive}
          @ribbon-button-click=${this.handleRibbonButtonClick}
          @ribbon-preview-exit=${this.handleRibbonPreviewExit}
          @file-name-change=${this.handleFileNameChange}
          @ribbon-combobox-change=${this.handleRibbonComboboxChange}
          @mark-attribute-change=${this.handleMarkAttributeChange}
          @media-attribute-change=${this.handleMediaAttributeChange}
          @media-type-change=${this.handleMediaTypeChange}
          @ribbon-collapse=${this.handleRibbonCollapse}
          @ribbon-input-pointerdown=${this.handleRibbonInputPointerDown}
          @ribbon-input-focus=${this.handleRibbonInputFocus}
          @ribbon-input-blur=${this.handleRibbonInputBlur}
          @ribbon-input-commit=${this.finishRibbonInput}
          @ribbon-input-cancel=${this.finishRibbonInput}
          @package-catalog-request=${this.loadPackageCatalog}
          @local-package-metadata-change=${this.handleLocalPackageMetadataChange}
          @local-package-auto-reload-change=${this.handleLocalPackageAutoReloadChange}
        ></app-ribbon>
        <dom-editor-breadcrumb
          .path=${this.selectionPath}
          .nodeSelected=${this.nodeSelection}
          .capture=${this.captureSelection}
          .gap=${this.selectionGap}
          .tree=${this.documentTree}
          @breadcrumb-tree-toggle=${this.handleBreadcrumbTreeToggle}
          @breadcrumb-item-select=${this.handleBreadcrumbItemSelect}
          @breadcrumb-item-hover=${this.handleBreadcrumbItemHover}
        ></dom-editor-breadcrumb>
      </header>
      ${this.previewActive ? html`
        <iframe
          class="preview-frame"
          title="Document preview"
          srcdoc=${this.previewDocumentHTML ?? ""}
          @load=${this.handlePreviewFrameLoad}
        ></iframe>
      ` : ""}
      <iframe
        class="editor-frame"
        title="DOM editor"
        srcdoc=${this.editorSrcdoc}
        ?hidden=${this.previewActive}
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
