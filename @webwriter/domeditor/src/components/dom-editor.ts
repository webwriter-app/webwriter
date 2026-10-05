import type {DOMEditor} from "../domeditor"
import {cloudServiceExpired, tokenExpiresAt, type CloudService} from "../cloud-services"
import type {GitPackageSource} from "../git-package"
import {appIconUrl, ribbonIcon} from "../ribbon-icons"
import {documentOpenReference, parseDocumentOpenReference, readLocalDocumentReference, matchesRecentDocumentSession, readRecentDocuments, recentDocumentAccessible, rememberRecentDocument, saveRecentDocuments, type RecentDocument, type RecentFileHandle} from "../recent-documents"
import "./developer-console"
import type {DeveloperConsole} from "./developer-console"
import "./math-keyboard"
import {documentLayoutPreviewStyles, renderDocumentLayoutCard, documentLayoutModes} from "./layout-preview"
import {indentHTMLSource, tokenizeHTMLSource} from "./html-source-highlight"
import { LitElement, css, html, nothing, type PropertyValues } from "lit"
import {guard} from "lit/directives/guard.js"
import {bindEditingUI, type EditingUIProperties, type EditingUIListeners} from "./editing-ui-bindings"
import type {AppRibbon, AIEditReviewHandler} from "./ribbon"
import type {LiveLearnerRibbonItem} from "./ribbon"
import type { DomEditorBreadcrumb, DocumentTreeItem } from "./breadcrumb"
import type {DomEditorToolbox} from "./toolbox"
import type {LayoutSelectionState} from "../layouts"
import type {LayoutEditorAction} from "./layout-editor"
import type { EditingAction } from "../domeditor"
import {elementDragType, emptyElementHTML, insertionMenuItems, ribbonInsertionAction, ribbonInsertionDragType} from "./insertion-menu"
import type {EditorStateSnapshot} from "../editor-state"
import {
  describePackageExport,
  editingConfigKey,
  normalizeEditingConfig,
  packageEditingConfigOptions,
  INSTALLED_PACKAGES_STORAGE_KEY,
  INSTALLED_PACKAGE_IMPORT_MAP_STORAGE_KEY,
  SCOPED_CUSTOM_ELEMENT_REGISTRY_POLYFILL_URL as scopedCustomElementRegistryPolyfillUrl,
  packageMemberAction,
  refreshPackageLabels,
  packageTestTimeout,
  WebWriterPackageRegistry,
  webWriterPackageExportName,
  withPackageExportSource,
  type PackageEditingConfig,
  type PackageMember,
  type PackageExportTarget,
  type PackageTestResult,
  type WebWriterPackage,
  type WebWriterPackageExportType,
} from "../packages"
import { getElementPresentation, isLineBreakElement } from "../element-names"
import {
  canonicalMarkName,
  emptyRubyState,
  isMarkAttributeName,
  isMarkElement,
  isStyleMarkName,
  mergedMarkGroupFor,
  stripExcludedMarks,
  type MarkAttributeValues,
  type MarkName,
  type RubyState,
  type StyleMarkValues,
} from "../marks"
import {clearEditorOwnedAttributes, clearEditorMarkerClasses, clearInlinePlacement, isWidgetShadowInteraction, getInertDocument} from "../utility"
import {stripActiveContent} from "../active-content"
import {
  imageMapAreaAttributeOptions,
  isImageMapHotspotShape,
  isMediaCaptureMode,
  isMediaType,
  isTimedMediaResourceType,
  isWebsiteType,
  mediaAttributeOptions,
  timedMediaResourceAttributeOptions,
  type MediaSelectionState,
} from "../media"
import type {DialogSelectionState} from "../dialog"
import type {MathSelectionState} from "../math"
import type {ElementAttributeState} from "../element-attributes"
import {widgetOptionValue, type WidgetOptionsState} from "../widget-options"
import {
  aiEditReviewEvent,
  editorFrameControlMessage,
  executeCompleteEvent,
  emptyVersionHistoryState,
  initializeEditorMessage,
  isBlockFormatTag,
  isAIEditReviewMessage,
  isExecuteResponse,
  isDocumentHeadStateChangeMessage,
  isHistoryStateChangeMessage,
  isMarkStateChangeMessage,
  isCommentStateChangeMessage,
  isSelectionChangeMessage,
  isPresenceChangeMessage,
  markStateChangeEvent,
  commentStateChangeEvent,
  historyStateChangeEvent,
  loadWidgetsMessage,
  selectionChangeEvent,
  type ElementStyleMutation,
  type ElementStyleState,
  type ExecuteCompleteDetail,
  type ExecuteFailureDetail,
  type FigureSelectionState,
  type SelectionGap,
  type SelectionPathItem,
  type SelectionPathSection,
  type PresenceUser,
  type HeadingGroupSelectionState,
  type ListSelectionState,
  type ListType,
  type InitializeEditorMessage,
  type LoadWidgetsMessage,
  type AIEditReviewMessage,
  type CommentState,
  type RibbonDropPosition,
  type HostDragDetail,
} from "../editor-bridge"
import {elementStylePropertyNames, paragraphStylePropertyNameSet} from "../element-styles"
import "./breadcrumb"
import "./toolbox"
import "./ribbon"
import type {OpenDocumentMenu} from "./open-document-menu"
import "./open-document-menu"
import "./live-session-controls"
import "./live-session-overlay"
import {appendSerializedAssets, restoreOriginalResourceURLs, serializeDoctype} from "../serialization"
import {isPackageImportMap, packageImportMapId, packageModuleEntries, resolvePackageDependencies} from "../package-dependencies"
import type {IImportMap} from "@jspm/import-map"
import {applyPreviewWidgetSnapshot, cleanPreviewEditorArtifacts, LivePreview, previewElementAtPath, previewElementPath, previewWidgetElements} from "../live-preview"
import {editorFrameOrigin} from "../frame-origins"
import {frameImportMap, frameLocalPackageURL, framePackages} from "../frame-local-packages"
import {getSectionOption, isSectionElement, isSectionName, type SectionName} from "../sections"
import {userInitials} from "../user-identity"
import {
  normalizeLocalPackagePath,
  type LocalPackageWarning,
} from "../local-package"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "../local-package-worker"
import {LocalPackageManager, type LocalPackageRecord} from "../local-package-manager"
import {defaultDocumentTheme, documentTheme} from "../document-themes"
import type {AIDocumentToolCall, AIDocumentToolHandler} from "../ai-client"
import {aiPage, type AIChangeOperation} from "../ai-tools"
import type {TableSelectionState} from "../table"
import {
  isGraphicArrangeOperation,
  isGraphicLayerOperation,
  isGraphicShapeType,
  isGraphicViewportOperation,
  type GraphicSelectionState,
} from "../graphic"
import {
  BackendClient,
  probeDevelopmentBackend,
  connectCloudService,
  discoverHostBackend,
  CloudAuthenticationError,
  type BackendSession,
  type BackendDocumentSummary,
} from "../backend-client"
import {
  WEBWRITER_GENERATOR,
  emptyDocumentHeadState,
  isDocumentHeadAction,
  type DocumentHeadAction,
  type DocumentHeadState,
} from "../document-head"
import {
  LiveSession,
  type LiveSessionChange,
  type LiveSessionLearner as SessionLearner,
  type LiveSessionLearnerState,
  type LiveSessionStep,
} from "../live-session"
import type {
  LiveSessionLearner as OverlayLearner,
  LiveSessionWidget as OverlayWidget,
  LiveWidgetStateChangeDetail,
} from "./live-session-overlay"
import {
  appCommands,
  builtinShortcuts,
  loadAppSettings,
  persistAppSettings,
  SNIPPET_LABEL_MAX_LENGTH,
  shortcutFromEvent,
  type AppSettings,
} from "../app-settings"
import {getDocumentRoot} from "../document-template"
import {canvasStyles, slidesStyles, documentLayoutMode, resetEmptyLayoutContent, slideLayoutRole, type DocumentLayoutMode, type DocumentLayoutState} from "../document-layout"

type LocalFileHandle = RecentFileHandle

type FilePickerWindow = Window & typeof globalThis & {
  showOpenFilePicker?: (options?: object) => Promise<LocalFileHandle[]>
  showSaveFilePicker?: (options?: object) => Promise<LocalFileHandle>
  showDirectoryPicker?: (options?: object) => Promise<FileSystemDirectoryHandle>
}

type FileFormat = "html" | "offline"
type StorageLocation = "local" | "development-server"

const escapeAttribute = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;")

const ensureDefaultDocumentTheme = (root: Document) => {
  const hasTheme = Array.from(root.head.querySelectorAll<HTMLStyleElement>("style[data-ww-theme]"))
    .some(style => documentTheme(style.getAttribute("data-ww-theme") ?? ""))
  if(hasTheme) return
  const style = root.createElement("style")
  style.setAttribute("data-ww-theme", defaultDocumentTheme.value)
  style.setAttribute("blocking", "render")
  style.textContent = defaultDocumentTheme.source
  root.head.append(style)
}

const defaultDocumentThemeHTML = () => {
  const root = document.implementation.createHTMLDocument()
  ensureDefaultDocumentTheme(root)
  return root.head.querySelector("style")!.outerHTML
}

const editorEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/editor-entry.ts" : "assets/editor-entry.js"}`
const previewEntryUrl = `${import.meta.env.BASE_URL}${import.meta.env.DEV ? "src/preview-entry.ts" : "assets/preview-entry.js"}`
const localPackageResourcePath = LOCAL_PACKAGE_ROUTE_PREFIX
const packageLoadTimeoutMs = 10_000
const executeTimeoutMs = 15_000


const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const localPackageMetadataFields = new Set([
  "name", "version", "description", "license", "keywords", "author", "contributors",
  "customElements", "editingConfig",
])

const localPackageExportTypes = new Set<WebWriterPackageExportType>([
  "widget", "test", "migration", "snippet", "theme", "icon", "editing-config", "custom-elements", "other",
])

const defaultPackageExportSource = (type: WebWriterPackageExportType, name: string) => {
  if(type === "test") return `./tests/${name}.test.ts`
  if(type === "migration") return "./src/migrate.ts"
  if(type === "snippet") return `./src/snippets/${name}.html`
  if(type === "theme") return `./src/themes/${name}.css`
  if(type === "icon") return "./src/icon.svg"
  if(type === "editing-config") return "./editing-config.json"
  if(type === "custom-elements") return "./custom-elements.json"
  if(type === "other") return `./src/${name}`
  return `./src/widgets/${name}.ts`
}

type LocalPackageMetadataUpdate = {remove: true} | {remove: false, value: unknown}

const optionalPackageMetadata = (value: string): LocalPackageMetadataUpdate => value.trim()
  ? {remove: false, value}
  : {remove: true}

const parsePackageMetadataJSON = (field: string, value: string) => {
  try { return JSON.parse(value) as unknown }
  catch { throw new Error(`${field} must be valid JSON`) }
}

const isPersonMetadata = (value: unknown) => typeof value === "string" || isRecord(value)
  && Object.values(value).every(part => typeof part === "string")

const parsePackagePerson = (label: string, value: string) => {
  const trimmed = value.trim()
  const person = trimmed.startsWith("{") ? parsePackageMetadataJSON(label, trimmed) : trimmed
  if(!isPersonMetadata(person)) throw new Error(`${label} must be a name or a JSON person object`)
  return person
}

function isPackageExportTarget(value: unknown): boolean {
  if(typeof value === "string") {
    try { normalizeLocalPackagePath(value); return true }
    catch { return false }
  }
  return isRecord(value) && Object.keys(value).length > 0
    && Object.values(value).every(isPackageExportTarget)
}

const parseLocalPackageMetadata = (field: string, value: string): LocalPackageMetadataUpdate => {
  if(field === "customElements") {
    if(!value.trim()) return {remove: true}
    normalizeLocalPackagePath(value.trim())
    return {remove: false, value: value.trim()}
  }
  if(field === "description" || field === "license") {
    return optionalPackageMetadata(value)
  }
  if(field === "keywords") {
    const keywords = [...new Set(value.split(/\r?\n|,/).map(keyword => keyword.trim()).filter(Boolean))]
    if(!keywords.includes("webwriter-widget")) throw new Error("Keywords must include webwriter-widget")
    return {remove: false, value: keywords}
  }
  if(field === "author") {
    if(!value.trim()) return {remove: true}
    return {remove: false, value: parsePackagePerson("Author", value)}
  }
  if(field === "contributors") {
    if(!value.trim()) return {remove: true}
    const contributors = parsePackageMetadataJSON("Contributors", value)
    if(!Array.isArray(contributors) || !contributors.every(isPersonMetadata)) {
      throw new Error("Contributors must be a JSON array of names or person objects")
    }
    return {remove: false, value: contributors}
  }
  if(field === "editingConfig") {
    if(!value.trim()) return {remove: true}
    const editingConfig = parsePackageMetadataJSON("Editing config", value)
    if(!isRecord(editingConfig)) throw new Error("Editing config must be a JSON object")
    return {remove: false, value: editingConfig}
  }
  return {remove: false, value}
}

const isAbortError = (error: unknown) => error instanceof DOMException
  ? error.name === "AbortError"
  : isRecord(error) && error.name === "AbortError"

const isLocalResourcePackage = (pkg: WebWriterPackage) => Boolean(pkg.developerSource) || [
  pkg.iconUrl,
  ...pkg.scripts,
  ...pkg.styles,
  ...pkg.members.flatMap(member => [member.iconUrl, member.htmlUrl, member.scriptUrl, member.styleUrl]),
].some(url => url?.includes(localPackageResourcePath))

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

const liveSessionParameter = "liveSession"
const liveSessionTokenParameter = "liveToken"
const liveSessionIdentityKey = (sessionId: string) => `webwriter_live_session_learner_${sessionId}`
const liveSessionColors = [
  "#e11d48", "#db2777", "#9333ea", "#4f46e5", "#2563eb", "#0284c7",
  "#0891b2", "#0d9488", "#059669", "#65a30d", "#ca8a04", "#ea580c",
]

const randomIdentifier = (prefix: string) => globalThis.crypto?.randomUUID?.()
  ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

const hashString = (value: string) => Array.from(value).reduce(
  (hash, character) => (Math.imul(hash, 31) + character.codePointAt(0)!) | 0,
  0,
)

const clampUnit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

const defaultDocumentLayoutState = (): DocumentLayoutState => ({mode: "document", canConvert: true, zoom: 100})

type LiveSessionIdentity = {
  id: string
  name: string
  color: string
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
    svgText: {attribute: false, state: true},
    canMark: {attribute: false, state: true},
    canSection: {attribute: false, state: true},
    sectionType: {attribute: false, state: true},
    sectionActive: {attribute: false, state: true},
    sectionSelected: {attribute: false, state: true},
    layoutSelection: {attribute: false, state: true},
    layoutError: {attribute: false, state: true},
    selectedSectionPath: {attribute: false, state: true},
    marks: {attribute: false, state: true},
    allowedMarks: {attribute: false, state: true},
    markStyles: {attribute: false, state: true},
    markAttributes: {attribute: false, state: true},
    ruby: {attribute: false, state: true},
    commentState: {attribute: false, state: true},
    presenceUsers: {attribute: false, state: true},
    packages: {attribute: false, state: true},
    installedPackages: {attribute: false, state: true},
    packagesLoading: {attribute: false, state: true},
    busyPackageNames: {attribute: false, state: true},
    packageError: {attribute: false, state: true},
    localPackages: {attribute: false, state: true},
    localPackagesLoading: {attribute: false, state: true},
    localPackageRefreshingNames: {attribute: false, state: true},
    localPackageError: {attribute: false, state: true},
    selectedLocalPackageName: {attribute: false, state: true},
    localPackageRuntimeWarnings: {attribute: false, state: true},
    localPackageTestResults: {attribute: false, state: true},
    frameRevision: {attribute: false, state: true},
    frameStarted: {attribute: false, state: true},
    listType: {attribute: false, state: true},
    listStyle: {attribute: false, state: true},
    orderedList: {attribute: false, state: true},
    headingGroup: {attribute: false, state: true},
    figure: {attribute: false, state: true},
    mediaSelection: {attribute: false, state: true},
    dialogSelection: {attribute: false, state: true},
    tableSelection: {attribute: false, state: true},
    graphicSelection: {attribute: false, state: true},
    mathSelection: {attribute: false, state: true},
    mathKeyboardHidden: {attribute: false, state: true},
    elementAttributes: {attribute: false, state: true},
    widgetOptions: {attribute: false, state: true},
    elementStyle: {attribute: false, state: true},
    fileName: {attribute: false, state: true},
    fileDirty: {attribute: false, state: true},
    documentLayoutsDismissed: {attribute: false, state: true},
    fileError: {attribute: false, state: true},
    fileOperationActive: {attribute: false, state: true},
    savedDocuments: {attribute: false, state: true},
    recentDocuments: {attribute: false, state: true},
    accessibleRecentDocumentIds: {attribute: false, state: true},
    documentsLoading: {attribute: false, state: true},
    documentsError: {attribute: false, state: true},
    documentDialogMode: {attribute: false, state: true},
    previewActive: {attribute: false, state: true},
    previewFramePending: {attribute: false, state: true},
    ribbonDrag: {attribute: false, state: true},
    previewDocumentHTML: {attribute: false, state: true},
    liveSessionActive: {attribute: false, state: true},
    liveSessionRole: {attribute: false, state: true},
    liveSessionLink: {attribute: false, state: true},
    liveLearners: {attribute: false, state: true},
    liveSteps: {attribute: false, state: true},
    liveStreamStep: {attribute: false, state: true},
    liveStreamPlaying: {attribute: false, state: true},
    liveStreamTime: {attribute: false, state: true},
    liveStreamDuration: {attribute: false, state: true},
    liveOverlayLearners: {attribute: false, state: true},
    liveOverlayWidgets: {attribute: false, state: true},
    backendState: {attribute: false, state: true},
    backendClient: {attribute: false, state: true},
    backendSession: {attribute: false, state: true},
    storageLocation: {attribute: false, state: true},
    documentHead: {attribute: false, state: true},
    historyState: {attribute: false, state: true},
    historyLoading: {attribute: false, state: true},
    historyError: {attribute: false, state: true},
    consoleOpen: {attribute: false, state: true},
    consoleTab: {attribute: false, state: true},
    localPackageDraft: {attribute: false, state: true},
    localPackageDraftSaving: {attribute: false, state: true},
    localPackageDraftRevision: {attribute: false, state: true},
    htmlMode: {attribute: false, state: true},
    htmlSource: {attribute: false, state: true},
    htmlPending: {attribute: false, state: true},
    htmlSourceError: {attribute: false, state: true},
    documentLayout: {attribute: false, state: true},
    documentLayoutError: {attribute: false, state: true},
    settings: {attribute: false, state: true},
    editingSnippetId: {state: true},
    breadcrumbVisible: {attribute: false, state: true},
    aiToolboxOpen: {state: true},
  }

  private editorDocument: Document | null = null
  private editorWindow: Window | null = null
  private editorOpaque = false
  private editorShellRevision = -1
  private editorShellInstanceId: string | null = null
  private editorInitializedRevision = -1
  private previewShellInstanceId: string | null = null
  private readonly registeredWidgetTags = new Set<string>()
  private readonly frameRequests = new Map<string, {resolve: (value: any) => void, reject: (reason: unknown) => void,
    timer: ReturnType<typeof setTimeout>}>()
  private readonly bridgeNonce = randomIdentifier("bridge")
  private documentTreeObserver: MutationObserver | null = null
  private editorReadyPromise: Promise<Window> | null = null
  private editorReadyResolve: ((editorWindow: Window) => void) | null = null
  private editorReadyReject: ((reason: unknown) => void) | null = null
  private packageLoadPromise: Promise<unknown> | null = null
  private requestSequence = 0
  private packageLoadSequence = 0
  private savedEditorSelection: SelectionBookmark | "remote" | null = null
  private ribbonInputSession = false
  private restoreEditorAfterRibbonInput = false
  private selectionPath: SelectionPathItem[] = []
  private nodeSelection = false
  private captureSelection = false
  private selectionGap: SelectionGap | null = null
  private documentTree: DocumentTreeItem | null = null
  private canMark = false
  private canSection = false
  private sectionType: SectionName = "section"
  private sectionActive = false
  private sectionSelected = false
  private layoutSelection: LayoutSelectionState | null = null
  private layoutError = ""
  private selectedSectionPath: number[] | null = null
  private svgText = false
  private marks: MarkName[] = []
  private allowedMarks: MarkName[] | null = null
  private markStyles: StyleMarkValues = {}
  private markAttributes: MarkAttributeValues = {}
  private ruby: RubyState = {...emptyRubyState}
  private commentState: CommentState = {
    canComment: false,
    active: false,
    text: "",
    activeCount: 0,
    count: 0,
    highlighting: true,
  }
  private listType: ListType | null = null
  private listStyle = ""
  private orderedList: ListSelectionState["ordered"] = undefined
  private headingGroup: HeadingGroupSelectionState | null = null
  private figure: FigureSelectionState | null = null
  private mediaSelection: MediaSelectionState | null = null
  private dialogSelection: DialogSelectionState | null = null
  private tableSelection: TableSelectionState | null = null
  private graphicSelection: GraphicSelectionState | null = null
  private mathSelection: MathSelectionState | null = null
  private mathKeyboardHidden = false
  private elementAttributes: ElementAttributeState | null = null
  private widgetOptions: WidgetOptionsState | null = null
  private elementStyle: ElementStyleState = {
    target: null,
    inline: {},
    computed: {},
    context: {display: "", parentDisplay: ""},
  }
  private elementStyleRefreshSequence = 0
  private elementStyleRefreshQueued = false
  private consoleOpen = false
  private consoleTab: "HTML" | "Packages" | "Tests" | "Element" = "Packages"
  private htmlMode = false
  private htmlSource = ""
  private htmlOriginalSource = ""
  private htmlPending = false
  private htmlSourceError = ""
  private documentLayout: DocumentLayoutState = defaultDocumentLayoutState()
  private documentLayoutError = ""
  private htmlSourceRefreshSequence = 0
  private htmlSourceHovered = false
  private htmlSourceFocused = false
  private htmlSourceHighlightActive = false
  private htmlSourceRefreshQueued = false
  private presenceUsers: PresenceUser[] = []
  private packages: WebWriterPackage[] = []
  private installedPackages: WebWriterPackage[] = []
  private packageImportMap: IImportMap | null = null
  private packageImportMapPackageSetKey: string | null = null
  private packagesLoading = false
  private busyPackageNames: string[] = []
  private packageError = ""
  private localPackages: WebWriterPackage[] = []
  private localPackagesLoading = false
  private localPackageRefreshingNames: string[] = []
  private localPackageError = ""
  private selectedLocalPackageName = ""
  private localPackageDraft: {id: string, base: Record<string, unknown>, manifest: Record<string, unknown>, errors: Record<string, string>} | null = null
  private localPackageDraftSaving = false
  private localPackageDraftRevision = 0
  private pendingPackageDecision: Promise<boolean> | null = null
  /** Checks of loaded local widgets, keyed by package name. */
  private localPackageRuntimeWarnings: Record<string, LocalPackageWarning[]> = {}
  /** Latest test run per `<package name>/<test name>`. */
  private localPackageTestResults: Record<string, PackageTestResult | "running"> = {}
  private readonly localPackageManager = new LocalPackageManager({
    gitApiUrl: async () => {
      const session = this.backendSession ?? await probeDevelopmentBackend()
      if(!session) throw new Error("Git packages require the local development server. Start it with npm start.")
      return `${session.apiBaseUrl}/developer-packages/git`
    },
    changed: packages => { this.localPackages = packages },
    refreshing: names => { this.localPackageRefreshingNames = names },
    error: message => { this.localPackageError = message },
    loaded: record => this.selectLocalPackage(record.package.name),
    install: async(pkg, previousName) => {
      const client = this.backendClient
      const documentId = this.backendDocumentId
      await this.reloadEditor([
        ...this.installedPackages.filter(candidate => candidate.name !== previousName && candidate.name !== pkg.name),
        pkg,
      ])
      if(previousName && client && documentId) await this.autosaveCloudAfterBundleReload({client, id: documentId})
    },
  })
  private frameState: EditorStateSnapshot | undefined
  private frameRevision = 0
  private frameStarted = false
  private frameStartTimer: ReturnType<typeof setTimeout> | undefined
  private frameDocumentHTML: string | null = null
  private fileName = ""
  private fileDirty = false
  private documentLayoutsDismissed = false
  private documentLayoutConversionCount = 0
  private fileError = ""
  private fileOperationActive = false
  private downloadedFileName: string | null = null
  private cancelFileInput?: () => void
  private documentDialogMode: "open" | "save" = "open"
  private documentDialogFormat: FileFormat = "html"
  private documentDialogClient: BackendClient | null = null
  private pendingCloudBundleSave: {client: BackendClient, id: string} | null = null
  private savedDocuments: BackendDocumentSummary[] = []
  private recentDocuments: RecentDocument[] = []
  private accessibleRecentDocumentIds = new Set<string>()
  private recentDocumentsReady: Promise<void> = Promise.resolve()
  private recentDocumentsWrite: Promise<void> = Promise.resolve()
  private recentRefreshGeneration = 0
  private documentsLoading = false
  private documentsError = ""
  private documentChangeSequence = 0
  private previewActive = false
  private previewFramePending = false
  /** Data of the ribbon drag in progress, relayed to the editor frame. */
  private ribbonDrag: Record<string, string> | null = null
  private previewDocumentHTML: string | null = null
  private previewFrameRevision = 0
  private previewShellRevision = -1
  private previewOpaque = false
  private previewWidgetPositions: {path: string, x: number, y: number}[] = []
  private livePreviewSource: string | null = null
  private previewSelection: SelectionBookmark | "remote" | null = null
  private previewGeneration = 0
  private previewTransition = false
  private liveSessionActive = false
  private liveSessionRole: "host" | "learner" | "" = ""
  private liveSessionLink = ""
  private liveSession: LiveSession | null = null
  private liveSessionUnsubscribe: (() => void) | null = null
  private liveLearners: LiveLearnerRibbonItem[] = []
  private liveSteps: LiveSessionStep[] = []
  private liveStreamStep = 0
  private liveStreamPlaying = false
  private liveStreamTime = 0
  private liveStreamDuration = 0
  private liveStreamStartedAt = 0
  private livePlaybackLastTick = 0
  private livePlaybackTimer: ReturnType<typeof setTimeout> | undefined
  private liveOverlayLearners: OverlayLearner[] = []
  private liveOverlayWidgets: OverlayWidget[] = []
  private liveLearnerVisibility = new Map<string, boolean>()
  private liveStatesAtStep = new Map<string, LiveSessionLearnerState>()
  private liveStateCache = new Map<string, LiveSessionLearnerState>()
  private liveStateCacheStep = 0
  private liveSelectedWidgetLearners = new Map<string, string>()
  private readonly livePreview = new LivePreview()
  private fileFormat: FileFormat = "html"
  private fileHandle: LocalFileHandle | null = null
  private storageLocation: StorageLocation = "local"
  private documentHead: DocumentHeadState = emptyDocumentHeadState()
  private historyState = emptyVersionHistoryState()
  private historyLoading = false
  private historyOperationCount = 0
  private historyDocumentTransitionCount = 0
  private historyError = ""
  private settings: AppSettings = loadAppSettings()
  private editingSnippetId: string | null = null
  private freshDocumentLayoutSnapshot: string | null = null
  private initialDocumentLayoutStarted = false
  private breadcrumbVisible = true
  private aiToolboxOpen = false
  private motionStylesheet: {document: Document, sheet: CSSStyleSheet} | null = null
  private backendState: "probing" | "connected" | "unavailable" = "probing"
  private backendSession: BackendSession | null = null
  private backendClient: BackendClient | null = null
  private backendDocumentId: string | null = null
  private backendProbeController: AbortController | null = null
  private cloudExpiryTimer: ReturnType<typeof setTimeout> | undefined
  private dirtyTrackingReady = false
  private dirtyTrackingMutationPending = false
  private dirtyTrackingTimer: ReturnType<typeof setTimeout> | undefined
  private packageCatalogRequested = false
  private dependencyRefreshPromise: Promise<void> = Promise.resolve()
  private installedPackagesRestored = false
  private readonly packageRegistry = new WebWriterPackageRegistry()
  private breadcrumbHoverPath: number[] | null = null
  private pendingExecutions = new Map<string, {
    resolve: (value: unknown) => void
    reject: (reason?: unknown) => void
    timer?: ReturnType<typeof setTimeout>
    abortCleanup?: () => void
  }>()

  static styles = css`
    :host {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      width: 100%;
      height: 100%;
      overflow: clip;
      border: 0.5px solid #a8a8a8;
    }

    :host([disable-animations]) {
      --ww-ui-transition: none;
      --ww-ui-animation: none;
    }

    .app-bar {
      display: contents;
    }

    app-ribbon {
      grid-row: 1;
      grid-column: 1 / -1;
    }

    dom-editor-breadcrumb,
    live-session-controls {
      grid-row: 2;
      grid-column: 1 / -1;
    }

    dom-editor-breadcrumb[hidden] { display: none; }

    dom-editor-breadcrumb {
      grid-column: 1;
      min-width: 0;
    }

    .file-error {
      position: absolute;
      inset: 0.5rem 0.5rem auto;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem;
      border: 1px solid #b42318;
      background: #fff4f2;
      color: #8a1c13;
      font: 0.875rem system-ui;
    }

    .document-stage {
      display: flex;
      position: relative;
      grid-row: 3;
      grid-column: 1 / -1;
      min-height: 0;
      width: 100%;
      overflow: hidden;
    }

    .math-keyboard-area {
      position: absolute;
      z-index: 5;
      bottom: 0;
      left: 0;
      right: 0;
      height: min(280px, 100%);
      min-width: 0;
      pointer-events: none;
    }

    .math-keyboard-area dom-editor-math-keyboard { height: 100%; max-height: none; pointer-events: auto; }

    .ribbon-drag-shield {
      position: absolute;
      inset: 0;
      z-index: 1;
    }

    .math-keyboard-open {
      position: absolute;
      right: 0.6rem;
      bottom: 0.6rem;
      display: grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0.2rem;
      border: 1px solid #b9c5d2;
      border-radius: 0.3rem;
      background: #f2f4f7;
      color: #26313d;
      font: 0.85rem system-ui;
      cursor: pointer;
    }

    .math-keyboard-open svg { width: 100%; height: 100%; }

    dom-editor-toolbox {
      grid-row: 2 / 4;
      grid-column: 2;
      justify-self: end;
    }

    dom-editor-toolbox:not([active-tool]) {
      grid-row: 2;
    }

    .app-bar:has(dom-editor-breadcrumb[tree-open]) ~ dom-editor-toolbox:not([active-tool]),
    .app-bar:has(dom-editor-breadcrumb[tree-animating]) ~ dom-editor-toolbox:not([active-tool]) {
      --toolbox-tabs-border-color: transparent;
    }

    .document-stage:has(+ dom-editor-toolbox[active-tool]:not([hidden])) {
      grid-column: 1;
    }

    .app-bar:has(app-ribbon:not([expanded])) ~ .document-stage:not(:has(+ dom-editor-toolbox[active-tool="AI"]:not([hidden]))) {
      grid-column: 1 / -1;
    }

    ${documentLayoutPreviewStyles}

    .html-source-panel {
      grid-row: 4;
      grid-column: 1 / -1;
      display: grid;
      grid-template-rows: 1fr;
      transition: var(--ww-ui-transition, grid-template-rows 180ms ease);
    }
    .html-source-panel[inert] { grid-template-rows: 0fr; }
    .html-source-clip { min-width: 0; min-height: 0; overflow: hidden; }

    .html-source-editor {
      box-sizing: border-box;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      min-height: 0;
      height: 100%;
      padding: 0.45rem 0.65rem;
      border-top: 1px solid #c8c8c8;
      background: #e9e9e9;
    }

    .html-source-editor[hidden] {display: none}

    .html-source-field {
      position: relative;
      min-height: 0;
      height: 100%;
      border-radius: 0.35rem;
      background: #fafafa;
    }

    .html-source-input,
    .html-source-highlight {
      box-sizing: border-box;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0.45rem 0.65rem;
      border: 1px solid #c7ccd1;
      border-radius: 0.35rem;
      outline: none;
      color: #1f2937;
      background: transparent;
      font: 12px/18px ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: normal;
      /* The highlight must wrap exactly like the textarea above it. */
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-gutter: stable;
      resize: none;
      tab-size: 2;
    }

    .html-source-highlight {
      pointer-events: none;
      overflow: hidden;
    }

    .html-source-input {
      color: transparent;
      caret-color: #1f2937;
    }

    .html-source-input::selection {
      color: #1f2937;
      background: #bfdbfe;
    }

    .html-source-highlight .tag { color: #155e9b; }
    .html-source-highlight .attribute { color: #854d0e; }
    .html-source-highlight .value { color: #166534; }
    .html-source-highlight .comment { color: #667085; }
    .html-source-highlight .entity { color: #7e22ce; }

    @media (forced-colors: active) {
      .html-source-input { color: CanvasText; caret-color: auto; }
      .html-source-highlight { visibility: hidden; }
    }

    .html-source-input:focus {
      border-color: #6388ad;
      box-shadow: 0 0 0 2px rgb(57 119 199 / 14%);
    }

    .html-source-error {
      margin: 0.35rem 0 0;
      color: #b42318;
      font: 0.7rem system-ui, sans-serif;
    }

    .document-layouts-panel {
      grid-row: 5;
      grid-column: 1 / -1;
      display: grid;
      grid-template-rows: 1fr;
      transition: var(--ww-ui-transition, grid-template-rows 180ms ease);
    }
    .document-layouts-panel[inert] { grid-template-rows: 0fr; }
    .document-layouts-clip { min-height: 0; overflow: hidden; }
    .document-layouts-panel[inert] .document-layouts-bar { transform: translateY(100%); }
    .document-layouts-bar {
      box-sizing: border-box;
      transition: var(--ww-ui-transition, transform 180ms ease);
      min-width: 0;
      padding: 0.55rem 0.8rem 0.65rem;
      border-top: 1px solid #c8c8c8;
      background: #f2f2f2;
      color: #2f3742;
      font: 0.75rem/1.25 system-ui, sans-serif;
    }
    .document-layouts-heading { position: relative; display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; min-height: 1.45rem; }
    .document-layouts-bar .recent-documents-title {width: min(20.45rem, calc(100% - 6rem)); margin-left: auto; box-sizing: border-box; padding-right: 1.5rem}
    .document-layouts-close { position: absolute; right: 0; border: 0; border-radius: 0.25rem; background: transparent; color: inherit; font: 1.25rem/1 system-ui; cursor: pointer; padding: 0.1rem 0.3rem; }
    .document-layouts-close:hover { background: #e2e5e9; }
    .document-layouts-close:focus-visible { outline: 2px solid #5e91bf; outline-offset: 2px; }
    .document-layouts-bar h2 { margin: 0; font-size: 0.75rem; font-weight: 650; }
    .document-layouts-bar .document-layout-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 10rem)); gap: 0.45rem; }
    .document-layouts-bar .layout-preset { min-height: 0; }
    .document-layouts-bar .document-layout-error { margin: 0.4rem 0 0; color: #b42318; }
    .document-layouts-options {display: flex; flex-wrap: wrap; align-items: start; gap: 1rem}
    .document-layouts-documents {margin-left: auto; width: min(20.45rem, 100%); min-width: 0}
    .document-layouts-documents ul {display: grid; grid-template-rows: repeat(5, 1.6rem); grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: column; gap: .15rem .45rem; list-style: none; margin: 0; padding: 0}
    .document-layouts-documents li {min-width: 0}
    .document-layout-document {display: flex; align-items: center; gap: .35rem; width: 100%; min-width: 0; height: 100%; border: 1px solid transparent; border-radius: .25rem; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; padding: .15rem .3rem}
    .document-layout-document svg {width: .9rem; height: .9rem; flex-shrink: 0; color: #526b86}
    .document-layout-document span {overflow: hidden; text-overflow: ellipsis; white-space: nowrap}
    .document-layout-document[aria-current="true"] {background: #e0ebf8}
    .document-layouts-documents button:hover:not(:disabled) {background: #e3e3e3}
    .document-layouts-documents button:focus-visible {outline: 2px solid #3977c7; outline-offset: 1px}
    .document-layouts-documents button:disabled {opacity: .5; cursor: default}
    .document-layouts-documents p {margin: .3rem 0; color: #687383; font-size: .7rem}

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

    iframe.window-inactive {
      pointer-events: none;
    }
  `

  private get editorSrcdoc() {
    return this.editorSrcdocFromHTML(this.frameDocumentHTML)
  }

  private editorSrcdocFromHTML(documentHTML: string | null) {
    // Keep authored script elements in the live DOM for serialization, but
    // give only the editor bootstrap and explicitly installed package assets
    // execution permission in this isolated editing frame. The nonce is
    // also passed through the authenticated bridge, so a document script
    // cannot learn or forge it before editor initialization.
    const nonce = escapeAttribute(this.bridgeNonce)
    // Installed widget bundles include shader and code compilers. They need
    // string evaluation, while authored scripts still require the secret nonce.
    const hasWidgetScripts = this.installedPackages.some(pkg => pkg.scripts.length)
    const packageEvaluation = hasWidgetScripts ? " 'unsafe-eval'" : ""
    // Libraries such as CodeMirror create their own style elements inside
    // widget shadows. They cannot inherit the nonce on their module script.
    const packageStyles = hasWidgetScripts ? "* data: blob: 'unsafe-inline'" : `'nonce-${nonce}'`
    const policy = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${packageEvaluation}; style-src 'none'; style-src-elem ${packageStyles}; style-src-attr 'unsafe-inline'; img-src * data: blob:; font-src * data:; connect-src * data: blob:; media-src * data: blob:; frame-src https:; worker-src blob: https:; object-src 'none'; base-uri 'none'; form-action 'none'`
    const csp = `<meta class="◆ ◆editor-only" http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}">`
    const bridge = `<meta class="◆ ◆editor-only" name="webwriter-editor-bridge" data-nonce="${nonce}" data-host-origin="${escapeAttribute(window.location.origin)}">`
    // Happy DOM deliberately disables external script execution but reports
    // each attempted iframe load as an uncaught exception. Keep virtual test
    // frames inert; browser builds retain the executable script types.
    const testScriptType = import.meta.env.MODE === "test" ? ' type="application/json"' : ""
    const editorScriptType = import.meta.env.MODE === "test" ? "application/json" : "module"
    const bootstrapScripts = `<script class="◆ ◆editor-only" nonce="${nonce}">globalThis.litIssuedWarnings ??= new Set(); globalThis.litIssuedWarnings.add("dev-mode");</script><script class="◆ ◆editor-only" nonce="${nonce}"${testScriptType} src="${escapeAttribute(scopedCustomElementRegistryPolyfillUrl)}"></script><script class="◆ ◆editor-only" nonce="${nonce}" type="${editorScriptType}" src="${escapeAttribute(editorEntryUrl)}"></script>`
    const bootstrap = `${csp}${bridge}${bootstrapScripts}`
    if(documentHTML === null) {
      return `<!-- frame ${this.frameRevision} -->${bootstrap}<meta name="generator" content="${escapeAttribute(WEBWRITER_GENERATOR)}">${defaultDocumentThemeHTML()}`
    }

    const parsed = new DOMParser().parseFromString(documentHTML, "text/html")
    restoreOriginalResourceURLs(parsed)
    // The iframe receives its trusted resolution through load-widgets.
    parsed.getElementById(packageImportMapId)?.remove()
    ensureDefaultDocumentTheme(parsed)
    parsed.head.insertAdjacentHTML("beforeend", `${bridge}${bootstrapScripts}`)
    const cspElement = parsed.createElement("meta")
    cspElement.classList.add("◆", "◆editor-only")
    cspElement.httpEquiv = "Content-Security-Policy"
    cspElement.content = policy
    parsed.head.prepend(cspElement)
    return `<!-- frame ${this.frameRevision} -->${serializeDoctype(parsed.doctype)}${parsed.documentElement.outerHTML}`
  }

  /** Serialize the most recent host-side snapshot into a bootstrap payload
   * without normalizing authored structure or upgrading custom elements. */
  private snapshotEditorDocumentHTML() {
    const source = this.editorDocument
    if(!source?.documentElement) return this.frameDocumentHTML
    const inertDocument = getInertDocument(source)
    const root = inertDocument.importNode(source.documentElement, true) as HTMLElement
    const removeEditorOnly = (parent: Node) => {
      for(const child of Array.from(parent.childNodes)) {
        if(child.nodeType === Node.ELEMENT_NODE) {
          const element = child as Element
          if(element.classList.contains("◆editor-only") || element.hasAttribute("data-webwriter-editor-only")) {
            element.remove()
            continue
          }
          if(element.localName === "template") removeEditorOnly((element as HTMLTemplateElement).content)
        }
        removeEditorOnly(child)
      }
    }
    removeEditorOnly(root)
    clearEditorOwnedAttributes(root)
    clearEditorMarkerClasses(root)
    return `${serializeDoctype(source.doctype)}${root.outerHTML}`
  }

  /** Creates a static copy for preview without bootstrapping another
   * DOMEditor. The live editor iframe remains mounted separately so its Yjs
   * document, undo manager, widgets, and selection stay untouched. */
  private currentPreviewHTML() {
    const source = this.editorDocument?.cloneNode(true) as Document | null
    if(!source?.documentElement) throw new Error("The editor document is not ready")
    return this.preparePreviewDocument(source)
  }

  private async currentPreviewHTMLFromFrame() {
    if(!this.editorOpaque) return this.currentPreviewHTML()
    await this.waitForEditorWindow()
    const response = await this.requestFrameControl("snapshot")
    if(typeof response.html !== "string") throw new Error("The editor did not return its document")
    return this.preparePreviewDocument(new DOMParser().parseFromString(response.html, "text/html"))
  }

  private preparePreviewDocument(source: Document) {
    const nonce = crypto.randomUUID()
    // srcdoc inherits the host URL for relative links; explicitly retain
    // native carousel navigation inside the preview frame.
    if(source.body.classList.contains("ww-slides")) {
      source.querySelectorAll<HTMLAnchorElement>('body > nav.ww-slides-navigation a[href^="#"], body.ww-slides .ww-slide-directions a[href^="#"]').forEach(link => {
        link.setAttribute("href", `about:srcdoc${link.getAttribute("href")}`)
      })
    }
    cleanPreviewEditorArtifacts(source)

    // Remove authored executable content before installing the trusted widget
    // and preview bridge scripts in the isolated frame.
    stripActiveContent(source, {allowStyles: true, allowIframes: true})

    // Use the same dependency selection as saving, after stripping authored code.
    if(import.meta.env.MODE !== "test") {
      source.querySelectorAll<HTMLElement>("[src], [href]").forEach(element => {
        for(const name of ["src", "href"]) {
          const value = element.getAttribute(name)
          if(!value) continue
          const rewritten = frameLocalPackageURL(value, window.location.origin, editorFrameOrigin())
          if(rewritten !== value) element.setAttribute(name, rewritten)
        }
      })
    }
    const frameOrigin = import.meta.env.MODE === "test" ? window.location.origin : editorFrameOrigin()
    appendSerializedAssets(source,
      framePackages(this.installedPackages, window.location.origin, frameOrigin),
      frameImportMap(this.packageImportMap, window.location.origin, frameOrigin))
    if(source.head) {
      const scripts = Array.from(source.head.querySelectorAll("script"))
      const policy = source.createElement("meta")
      policy.httpEquiv = "Content-Security-Policy"
      const packageEvaluation = scripts.some(script => script.hasAttribute("src")) ? " 'unsafe-eval'" : ""
      policy.content = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${packageEvaluation}; style-src * data: 'unsafe-inline'; img-src * data: blob:; font-src * data:; media-src * data: blob:; connect-src * data: blob:; frame-src https:; worker-src blob: https:; object-src 'none'; base-uri 'none'; form-action 'none'`
      source.head.prepend(policy)
      if(import.meta.env.MODE !== "test") {
        const bridge = source.createElement("meta")
        bridge.className = "◆ ◆editor-only"
        bridge.name = "webwriter-preview-bridge"
        bridge.setAttribute("data-nonce", this.bridgeNonce)
        bridge.setAttribute("data-host-origin", window.location.origin)
        source.head.append(bridge)
        const entry = source.createElement("script")
        entry.className = "◆ ◆editor-only"
        entry.type = "module"
        entry.src = previewEntryUrl
        source.head.append(entry)
      }
      if(import.meta.env.MODE === "test") scripts.forEach(script => script.type = "application/json")
      // Set the serialized attribute after connecting the nodes to the cloned
      // document; a frame's nonce-hiding machinery can clear it on insertion.
      source.head.querySelectorAll("script").forEach(script => script.setAttribute("nonce", nonce))
    }

    // `designMode` is a document property rather than serialized markup. A
    // srcdoc that does not load editor-entry therefore starts in its default
    // "off" state; explicitly clearing it also documents that invariant for
    // DOM implementations that retain a cloned property.
    source.designMode = "off"
    return `${serializeDoctype(source.doctype)}${source.documentElement.outerHTML}`
  }

  private get syncUrl() {
    const syncUrl = new URL(this.backendSession?.collaborationUrl ?? `ws://${location.hostname}:1234`)
    const outerUrl = new URL(location.href)
    outerUrl.searchParams.forEach((value, key) => {
      // Live-session bearer tokens are for the dedicated live room only; do
      // not forward them to the ordinary document collaboration provider.
      if(key === liveSessionTokenParameter || key === liveSessionParameter || key === "role" || key === "open") return
      syncUrl.searchParams.set(key, value)
    })
    return syncUrl.href
  }

  private frameShellURL(kind: "editor" | "preview", revision: number) {
    const url = new URL(`${import.meta.env.BASE_URL}frame-shell.html`, `${editorFrameOrigin()}/`)
    url.searchParams.set("kind", kind)
    url.searchParams.set("revision", String(revision))
    url.hash = new URLSearchParams({nonce: this.bridgeNonce}).toString()
    return url.href
  }

  /** The frame lives on the configured origin, distinct from the app. */
  private editorTargetOrigin() {
    if(this.editorOpaque) return editorFrameOrigin()
    const origin = this.editorWindow?.location.origin
    if(origin && origin !== "null") return origin
    return window.location.origin === "null" ? "*" : window.location.origin
  }

  private postToEditor(message: object) {
    const editorWindow = this.editorWindow
    if(!editorWindow) return
    try {
      editorWindow.postMessage(message, this.editorTargetOrigin())
    }
    catch(error) {
      // happy-dom reports srcdoc recipients as opaque even when the test
      // frame is same-origin. Keep this test-only compatibility fallback.
      const happyDom = globalThis.navigator?.userAgent.includes("HappyDOM")
      if(happyDom && error && typeof error === "object" && (error as {name?: unknown}).name === "SecurityError") {
        editorWindow.postMessage(message, "*")
        return
      }
      throw error
    }
  }

  private postFrameControl(command: string, detail: object = {}) {
    this.postToEditor({type: editorFrameControlMessage, command, bridgeNonce: this.bridgeNonce, ...detail})
  }

  private requestFrameControl(command: string, detail: object = {}) {
    const requestId = `frame-${++this.requestSequence}`
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.frameRequests.delete(requestId)
        reject(new Error("The editor frame did not respond"))
      }, executeTimeoutMs)
      this.frameRequests.set(requestId, {resolve, reject, timer})
      this.postFrameControl(command, {requestId, ...detail})
    })
  }

  private liveSessionIdFromURL() {
    const value = new URL(location.href).searchParams.get(liveSessionParameter)
    return value && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) ? value : null
  }

  private liveSessionShareLink(sessionId: string, token: string) {
    const url = new URL(location.href)
    url.searchParams.delete("session")
    url.searchParams.delete("source")
    url.searchParams.delete("open")
    url.searchParams.set(liveSessionParameter, sessionId)
    url.searchParams.set(liveSessionTokenParameter, token)
    url.searchParams.set("role", "learner")
    return url.href
  }

  private learnerIdentity(sessionId: string): LiveSessionIdentity {
    const storageKey = liveSessionIdentityKey(sessionId)
    try {
      const value = globalThis.sessionStorage?.getItem(storageKey)
      if(value) {
        const parsed = JSON.parse(value) as Partial<LiveSessionIdentity>
        if(typeof parsed.id === "string" && typeof parsed.name === "string" && typeof parsed.color === "string") {
          return {id: parsed.id, name: this.username || parsed.name, color: parsed.color}
        }
      }
    }
    catch {
      // Private browsing or an opaque origin may make sessionStorage unavailable.
    }

    const id = randomIdentifier("learner")
    const suffix = id.replaceAll(/[^a-zA-Z0-9]/g, "").slice(-4).toLocaleUpperCase()
    const identity = {
      id,
      name: this.username || `Learner ${suffix || "?"}`,
      color: liveSessionColors[Math.abs(hashString(id)) % liveSessionColors.length],
    }
    try {
      globalThis.sessionStorage?.setItem(storageKey, JSON.stringify(identity))
    }
    catch {
      // Identity persistence is a convenience; the session remains usable without it.
    }
    return identity
  }

  private connectLiveSession(session: LiveSession, role: "host" | "learner", link = "") {
    this.liveSessionUnsubscribe?.()
    this.liveSession?.destroy()
    this.liveSession = session
    this.liveSessionRole = role
    this.liveSessionLink = link
    this.liveSessionActive = true
    this.liveSessionUnsubscribe = session.onChange(this.syncLiveSession)
    this.syncLiveSession(session)
  }

  private syncLiveSession = (session = this.liveSession, change?: LiveSessionChange) => {
    if(!session || session !== this.liveSession) return
    const followedLiveEdge = this.liveStreamPlaying && this.liveStreamTime >= this.liveStreamDuration
    let appendOnly = true
    const steps = change ? [...this.liveSteps] : session.steps
    change?.stepDeltas.forEach(delta => {
      if(delta.deleteCount > 0 || delta.index !== steps.length) appendOnly = false
      steps.splice(delta.index, delta.deleteCount, ...delta.steps)
    })
    if(!appendOnly) this.resetLiveStateCache()
    this.liveSteps = steps

    const sessionLearners = session.learners
    const knownIds = new Set(sessionLearners.map(learner => learner.id))
    sessionLearners.forEach(learner => {
      if(!this.liveLearnerVisibility.has(learner.id)) this.liveLearnerVisibility.set(learner.id, true)
    })
    for(const id of this.liveLearnerVisibility.keys()) {
      if(!knownIds.has(id)) this.liveLearnerVisibility.delete(id)
    }
    this.liveLearners = sessionLearners.map(learner => this.liveLearnerRibbonItem(learner))

    this.advanceLiveClock()
    if(followedLiveEdge) this.liveStreamStep = steps.length
    else this.updateLiveStep()

    if(this.liveSessionRole === "learner" && session.baseHTML && session.baseHTML !== this.livePreviewSource) {
      this.livePreviewSource = session.baseHTML
      this.previewDocumentHTML = this.preparePreviewDocument(new DOMParser().parseFromString(session.baseHTML, "text/html"))
      this.previewFrameRevision++
      this.previewActive = true
    }
    if(session.status === "stopped") {
      this.liveStreamPlaying = false
      this.clearLivePlaybackTimer()
      if(this.liveSessionRole === "learner") {
        this.livePreview.disconnect()
        queueMicrotask(() => {
          if(this.liveSession === session && this.previewActive) void this.exitPreview()
        })
        return
      }
    }
    this.updateLiveVisualization()
    this.scheduleLivePlayback()
  }

  private liveLearnerRibbonItem(learner: SessionLearner): LiveLearnerRibbonItem {
    return {
      id: learner.id,
      name: learner.name,
      initials: userInitials(learner.name),
      color: learner.color,
      connected: learner.connected,
      enabled: this.liveLearnerVisibility.get(learner.id) !== false,
    }
  }

  private clearLivePlaybackTimer() {
    if(this.livePlaybackTimer !== undefined) clearTimeout(this.livePlaybackTimer)
    this.livePlaybackTimer = undefined
  }

  private resetLivePlayback() {
    this.clearLivePlaybackTimer()
    this.liveStreamStartedAt = Date.now()
    this.livePlaybackLastTick = this.liveStreamStartedAt
    this.liveStreamTime = 0
    this.liveStreamDuration = 0
    this.liveStreamStep = 0
    this.liveStreamPlaying = true
    this.scheduleLivePlayback()
  }

  private advanceLiveClock() {
    const now = Date.now()
    const following = this.liveStreamTime >= this.liveStreamDuration
    this.liveStreamDuration = Math.max(this.liveStreamDuration, (now - this.liveStreamStartedAt) / 1000)
    if(this.liveStreamPlaying) {
      this.liveStreamTime = following ? this.liveStreamDuration
        : Math.min(this.liveStreamDuration, this.liveStreamTime + Math.max(0, now - this.livePlaybackLastTick) / 1000)
    }
    this.livePlaybackLastTick = now
  }

  private updateLiveStep() {
    const time = this.liveStreamStartedAt + this.liveStreamTime * 1000
    let step = this.liveStreamTime >= this.liveStreamDuration ? this.liveSteps.length : 0
    if(step === 0) {
      while(step < this.liveSteps.length && this.liveSteps[step].time <= time) step++
    }
    this.liveStreamStep = step
  }

  private scheduleLivePlayback() {
    if(this.livePlaybackTimer !== undefined || !this.previewActive) return
    this.livePlaybackTimer = setTimeout(() => {
      this.livePlaybackTimer = undefined
      this.advanceLiveClock()
      const previousStep = this.liveStreamStep
      this.updateLiveStep()
      if(previousStep !== this.liveStreamStep) this.updateLiveVisualization()
      this.scheduleLivePlayback()
    }, 100)
  }

  private playLiveSession = () => {
    this.advanceLiveClock()
    this.liveStreamPlaying = true
    this.scheduleLivePlayback()
  }

  private pauseLiveSession = () => {
    this.advanceLiveClock()
    this.liveStreamPlaying = false
  }

  private seekLiveSession = (event: Event) => {
    const time = (event as CustomEvent<{time?: unknown}>).detail?.time
    if(typeof time !== "number" || !Number.isFinite(time)) return
    this.pauseLiveSession()
    this.liveStreamTime = Math.max(0, Math.min(this.liveStreamDuration, time))
    this.updateLiveStep()
    this.updateLiveVisualization()
  }

  private resetLiveStateCache() {
    this.liveStateCache = new Map()
    this.liveStateCacheStep = 0
  }

  private statesAtLiveStep(stepCount: number) {
    if(stepCount < this.liveStateCacheStep) this.resetLiveStateCache()
    for(const step of this.liveSteps.slice(this.liveStateCacheStep, stepCount)) {
      if(!step.learner) continue
      const previous = this.liveStateCache.get(step.learner)
      this.liveStateCache.set(step.learner, {
        ...(previous ?? {learner: step.learner}),
        learner: step.learner,
        time: step.time,
        ...(step.html !== undefined ? {html: step.html} : {}),
        ...(step.cursor !== undefined ? {cursor: {...step.cursor}} : {}),
        ...(step.pointer !== undefined ? {pointer: {...step.pointer}} : {}),
        ...(step.click !== undefined ? {click: {...step.click}, clickStep: step.id} : {}),
        ...(step.scroll !== undefined ? {scroll: {...step.scroll}} : {}),
        ...(step.regions !== undefined ? {regions: step.regions.map(region => ({...region}))} : {}),
        ...(step.widgets !== undefined ? {widgets: step.widgets.map(widget => ({...widget}))} : {}),
      })
    }
    this.liveStateCacheStep = stepCount
    return new Map(this.liveStateCache)
  }

  private updateLiveVisualization() {
    this.liveStatesAtStep = this.statesAtLiveStep(this.liveStreamStep)
    this.liveOverlayLearners = this.liveLearners.flatMap<OverlayLearner>(learner => {
      if(!learner.enabled) return []
      const state = this.liveStatesAtStep.get(learner.id)
      const scroll = state?.scroll
      const scrollRange = scroll ? Math.max(0, (scroll.height ?? 0) - (scroll.viewport ?? 0)) : 0
      const scrollPosition = scroll
        ? scrollRange > 0 ? clampUnit(scroll.top / scrollRange) : clampUnit(scroll.top)
        : undefined
      const point = state?.pointer ?? state?.cursor
      return [{
        id: learner.id,
        name: learner.name,
        initials: learner.initials,
        color: learner.color,
        ...(point ? {cursor: {x: clampUnit(point.x), y: clampUnit(point.y)}} : {}),
        ...(scrollPosition !== undefined ? {scroll: scrollPosition} : {}),
        ...(state?.regions ? {regions: state.regions.map(region => ({
          x: clampUnit(region.x),
          y: clampUnit(region.y),
          width: clampUnit(region.width),
          height: clampUnit(region.height),
        }))} : {}),
        ...(state?.click ? {
          click: {
            x: clampUnit(state.click.x),
            y: clampUnit(state.click.y),
            sequence: state.clickStep ?? `${learner.id}-${state.click.x}-${state.click.y}`,
          },
        } : {}),
      }]
    })
    queueMicrotask(() => {
      this.liveSelectedWidgetLearners.forEach((learnerId, path) => {
        if(this.widgetStateAtStep(path, learnerId)) return
        this.liveSelectedWidgetLearners.delete(path)
        this.applyLiveWidgetState(path, null)
      })
      this.syncSelectedLiveWidgetStates()
      this.updateLiveWidgetAffordances()
    })
  }

  private cloudServiceForURL(apiBaseUrl: string) {
    const matches = (service: CloudService) => {
      const base = service.url.replace(/\/$/, "")
      return (base.endsWith("/api") ? base : `${base}/api`) === apiBaseUrl
    }
    return this.settings.cloudServices.find(service => service.id === this.settings.activeCloudServiceId && matches(service))
      ?? this.settings.cloudServices.find(matches)
  }

  private expireCloudService(service: CloudService) {
    const current = this.settings.cloudServices.find(value => value.id === service.id)
    if(!current || current.accessToken !== service.accessToken) return
    this.settings = {...this.settings, cloudServices: this.settings.cloudServices.map(value => value.id === service.id
      ? {...value, accessToken: undefined, expiresAt: Date.now() - 1} : value)}
    persistAppSettings(this.settings)
    if(this.settings.activeCloudServiceId === service.id) {
      this.backendProbeController?.abort()
      this.backendClient = null
      this.backendSession = null
      this.backendState = "unavailable"
      this.savedDocuments = []
      this.documentsLoading = false
      this.storageLocation = "local"
    }
    this.updateCloudExpiry()
    this.updateUserIdentity()
  }

  private updateCloudExpiry() {
    clearTimeout(this.cloudExpiryTimer)
    this.cloudExpiryTimer = undefined
    let nextExpiry = Infinity
    for(const service of this.settings.cloudServices) {
      if(!service.accessToken) continue
      const expiry = service.expiresAt ?? tokenExpiresAt(service.accessToken)
      if(expiry === undefined) continue
      if(expiry <= Date.now()) {this.expireCloudService(service); return}
      nextExpiry = Math.min(nextExpiry, expiry)
    }
    if(Number.isFinite(nextExpiry)) this.cloudExpiryTimer = setTimeout(() => this.updateCloudExpiry(), Math.min(nextExpiry - Date.now(), 2 ** 31 - 1))
  }

  private get cloudSessionWarning() {
    return this.settings.cloudServices.some(service => cloudServiceExpired(service))
      ? "Cloud session expired. Open Settings to sign in again." : ""
  }

  private get username() {
    if(this.backendSession?.authentication === "none") {
      const service = this.settings.cloudServices.find(value => value.id === this.settings.activeCloudServiceId)
      return service?.username.trim() || this.backendSession.user.name || this.settings.localUsername.trim()
    }
    return this.backendSession?.user.name || this.settings.localUsername.trim()
  }

  private updateUserIdentity() {
    const username = this.username
    if(this.editorOpaque) this.postFrameControl("username", {username})
    else {
      const doc = (this.editorWindow as Window & {editor?: DOMEditor} | null)?.editor?.doc
      doc?.setUser({name: username || `User ${doc.doc.clientID.toString(36).toUpperCase()}`})
    }
  }

  private discoverAdditionalCloudServices = async (signal: AbortSignal) => {
    try {
      const session = await discoverHostBackend(signal) ?? await probeDevelopmentBackend(signal)
      if(!session || signal.aborted || !this.isConnected || this.cloudServiceForURL(session.apiBaseUrl)) return
      const service: CloudService = {id: crypto.randomUUID(), type: "url", url: session.apiBaseUrl,
        username: session.user.name, ...(session.authentication === "none" ? {authentication: "none" as const} : {})}
      this.settings = {...this.settings, cloudServices: [...this.settings.cloudServices, service]}
      persistAppSettings(this.settings)
    }
    catch { /* Discovery must not interrupt the selected provider. */ }
  }

  private loginToBackend = async (apiBaseUrl?: unknown, discoverAdditional = false) => {
    this.backendProbeController?.abort()
    const controller = new AbortController()
    this.backendProbeController = controller
    this.backendState = "probing"
    this.backendClient = null
    this.backendSession = null
    this.savedDocuments = []
    this.documentsLoading = false
    this.storageLocation = "local"
    const linkedBase = typeof apiBaseUrl === "string" ? apiBaseUrl : undefined
    let service = linkedBase ? this.cloudServiceForURL(linkedBase)
      : this.settings.cloudServices.find(value => value.id === this.settings.activeCloudServiceId)
    if(linkedBase && service && this.settings.activeCloudServiceId !== service.id) {
      this.settings = {...this.settings, activeCloudServiceId: service.id, cloudServicesConfigured: true}
      this.backendDocumentId = null
      persistAppSettings(this.settings)
    }
    const discovery = service && discoverAdditional ? this.discoverAdditionalCloudServices(
      AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])) : Promise.resolve()
    try {
      let session: BackendSession | null = null
      if(service) {
        if(service.authentication !== "none" && !service.accessToken) {
          if(cloudServiceExpired(service)) this.expireCloudService(service)
        }
        else {
          const result = await connectCloudService(service, {signal: controller.signal})
          if(this.backendProbeController !== controller) return
          session = result.session
          service = result.service
          this.settings = {...this.settings, cloudServices: this.settings.cloudServices.map(value => value.id === result.service.id ? result.service : value)}
          persistAppSettings(this.settings)
        }
      }
      else {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
        if(!linkedBase) session = await discoverHostBackend(signal)
        if(!session) session = await probeDevelopmentBackend(signal, undefined, linkedBase)
        if(this.backendProbeController !== controller) return
        if(session) {
          const existing = this.cloudServiceForURL(session.apiBaseUrl)
          service = existing ?? {id: crypto.randomUUID(), type: "url", url: session.apiBaseUrl,
            username: session.user.name, ...(session.authentication === "none" ? {authentication: "none" as const} : {})}
          this.settings = {...this.settings,
            cloudServices: existing ? this.settings.cloudServices : [...this.settings.cloudServices, service],
            activeCloudServiceId: linkedBase || !this.settings.cloudServicesConfigured ? service.id : this.settings.activeCloudServiceId,
            cloudServicesConfigured: true,
          }
          persistAppSettings(this.settings)
          if(!linkedBase && this.settings.activeCloudServiceId !== service.id) session = null
          if(session?.authentication === "bearer") session = null
        }
      }
      if(this.backendProbeController !== controller) return
      this.backendSession = session
      const connectedService = service
      this.backendClient = session ? new BackendClient(session, undefined, service?.accessToken,
        connectedService ? () => this.expireCloudService(connectedService) : undefined) : null
      this.savedDocuments = []
      this.backendState = session ? "connected" : "unavailable"
      this.storageLocation = session ? "development-server" : "local"
      this.updateCloudExpiry()
      this.updateUserIdentity()
      if(session) void this.loadSavedDocuments()
    }
    catch(error) {
      if(controller.signal.aborted) return
      this.backendSession = null
      this.backendClient = null
      this.backendState = "unavailable"
      this.storageLocation = "local"
      if(error instanceof CloudAuthenticationError && service?.accessToken) this.expireCloudService(service)
      else this.reportFileError(error)
      this.updateUserIdentity()
    }
    finally {
      await discovery
      if(this.backendProbeController === controller) this.backendProbeController = null
    }
  }

  private openBackendAdmin = () => {
    if(this.backendSession) window.open(this.backendSession.adminUrl, "_blank", "noopener,noreferrer")
  }

  private publishLiveLearnerStep(input: Parameters<LiveSession["publish"]>[0]) {
    if(this.liveSessionRole !== "learner" || !this.liveSession) return
    try {
      this.liveSession.publish(input)
    }
    catch {
      // The host may stop while a throttled browser event is being delivered.
    }
  }

  private updateLiveWidgetAffordances() {
    if(!this.liveSessionActive || this.liveSessionRole !== "host") {
      this.liveOverlayWidgets = []
      return
    }
    if(this.previewOpaque) {
      this.liveOverlayWidgets = this.previewWidgetPositions.map(widget => {
        const learners = this.liveLearners.flatMap(learner => {
          if(!learner.enabled) return []
          const hasState = this.liveStatesAtStep.get(learner.id)?.widgets?.some(state =>
            state.path && JSON.stringify(state.path) === widget.path && typeof state.html === "string")
          return hasState ? [{id: learner.id, name: learner.name, color: learner.color}] : []
        })
        return {...widget, learners, selectedLearnerId: this.liveSelectedWidgetLearners.get(widget.path) ?? null}
      })
      return
    }
    const frame = this.renderRoot.querySelector<HTMLIFrameElement>("iframe.preview-frame")
    const previewDocument = frame?.contentDocument
    const view = frame?.contentWindow
    if(!previewDocument?.body || !view) return
    const width = view.innerWidth || previewDocument.documentElement.clientWidth || 1
    const height = view.innerHeight || previewDocument.documentElement.clientHeight || 1
    this.liveOverlayWidgets = previewWidgetElements(previewDocument).flatMap<OverlayWidget>(widget => {
      const path = previewElementPath(widget, previewDocument)
      if(!path) return []
      const key = JSON.stringify(path)
      const learners = this.liveLearners.flatMap(learner => {
        if(!learner.enabled) return []
        const hasState = this.liveStatesAtStep.get(learner.id)?.widgets?.some(state =>
          state.path && JSON.stringify(state.path) === key && typeof state.html === "string",
        )
        return hasState ? [{id: learner.id, name: learner.name, color: learner.color}] : []
      })
      const rect = widget.getBoundingClientRect()
      return [{
        path: key,
        x: clampUnit((rect.left + rect.width / 2) / width),
        y: clampUnit(rect.top / height),
        learners,
        selectedLearnerId: this.liveSelectedWidgetLearners.get(key) ?? null,
      }]
    })
  }

  private widgetStateAtStep(pathKey: string, learnerId: string) {
    return this.liveStatesAtStep.get(learnerId)?.widgets?.find(widget =>
      widget.path && JSON.stringify(widget.path) === pathKey,
    )
  }

  private applyLiveWidgetState(pathKey: string, learnerId: string | null) {
    if(this.previewOpaque) {
      const snapshot = learnerId
        ? this.widgetStateAtStep(pathKey, learnerId)
        : this.livePreview.baseWidgetStates.get(pathKey)
      if(snapshot) this.postToPreview({type: "preview-frame-apply", snapshot})
      return
    }
    const frame = this.renderRoot.querySelector<HTMLIFrameElement>("iframe.preview-frame")
    const previewDocument = frame?.contentDocument
    if(!previewDocument) return
    const snapshot = learnerId
      ? this.widgetStateAtStep(pathKey, learnerId)
      : this.livePreview.baseWidgetStates.get(pathKey)
    if(!snapshot) return
    let path: number[]
    try {
      const value = JSON.parse(pathKey)
      if(!Array.isArray(value) || !value.every(index => Number.isInteger(index) && index >= 0)) return
      path = value
    }
    catch { return }
    applyPreviewWidgetSnapshot(previewDocument, {...snapshot, path})
  }

  private syncSelectedLiveWidgetStates() {
    this.liveSelectedWidgetLearners.forEach((learnerId, path) => {
      this.applyLiveWidgetState(path, learnerId)
    })
  }

  private handleLiveWidgetStateChange = (event: Event) => {
    const {path, learnerId} = (event as CustomEvent<LiveWidgetStateChangeDetail>).detail
    if(typeof path !== "string") return
    if(learnerId) this.liveSelectedWidgetLearners.set(path, learnerId)
    else this.liveSelectedWidgetLearners.delete(path)
    this.applyLiveWidgetState(path, learnerId)
    this.updateLiveWidgetAffordances()
  }

  private handlePreviewFrameLoad = (event: Event) => {
    if(import.meta.env.MODE !== "test") return
    const frame = event.currentTarget as HTMLIFrameElement
    if(frame !== this.renderRoot.querySelector("iframe.preview-frame")) return
    this.previewOpaque = frame.contentDocument === null
    if(this.previewOpaque) {
      this.configurePreviewFrame()
      return
    }
    const previewDocument = frame.contentDocument
    if(!previewDocument) return
    previewDocument.designMode = "off"
    previewDocument.body?.removeAttribute("contenteditable")
    this.livePreview.disconnect()
    if(!this.liveSessionActive) return
    if(this.liveSessionRole === "learner") {
      if(this.liveSession?.baseHTML) this.livePreview.observeLearner(frame, previewDocument, step => this.publishLiveLearnerStep(step))
    }
    else this.livePreview.observeHost(frame, previewDocument, () => this.updateLiveWidgetAffordances())
  }

  private postToPreview(message: object) {
    this.renderRoot.querySelector<HTMLIFrameElement>("iframe.preview-frame")?.contentWindow
      ?.postMessage({...message, bridgeNonce: this.bridgeNonce}, this.previewOpaque ? editorFrameOrigin() : window.location.origin)
  }

  private configurePreviewFrame() {
    this.postToPreview({type: "preview-frame-configure", role: this.liveSessionActive ? this.liveSessionRole : ""})
  }

  private isPreviewMessage(event: MessageEvent) {
    const frame = this.renderRoot.querySelector<HTMLIFrameElement>("iframe.preview-frame")
    return event.source === frame?.contentWindow && event.data?.bridgeNonce === this.bridgeNonce
      && (event.origin === editorFrameOrigin() || event.origin === window.location.origin)
  }

  private handlePreviewMessage(event: MessageEvent) {
    if(!this.isPreviewMessage(event)) return false
    if(event.data?.type === "preview-frame-ready") {
      this.previewOpaque = true
      this.configurePreviewFrame()
      return true
    }
    if(event.data?.type === "preview-frame-step") {
      if(this.liveSessionRole === "learner" && event.data.step && typeof event.data.step === "object") {
        this.publishLiveLearnerStep(event.data.step)
      }
      return true
    }
    if(event.data?.type === "preview-frame-base-widgets") {
      this.livePreview.baseWidgetStates.clear()
      for(const widget of Array.isArray(event.data.widgets) ? event.data.widgets : []) {
        if(Array.isArray(widget?.path) && widget.path.every((index: unknown) => Number.isInteger(index) && (index as number) >= 0)) {
          this.livePreview.baseWidgetStates.set(JSON.stringify(widget.path), widget)
        }
      }
      return true
    }
    if(event.data?.type === "preview-frame-positions") {
      this.previewWidgetPositions = (Array.isArray(event.data.widgets) ? event.data.widgets : []).flatMap((widget: any) =>
        typeof widget?.path === "string" && Number.isFinite(widget.x) && Number.isFinite(widget.y)
          ? [{path: widget.path, x: widget.x, y: widget.y}] : [])
      this.updateLiveWidgetAffordances()
      return true
    }
    return false
  }

  private handleEditorFrameLoad = (event: Event) => {
    if(import.meta.env.MODE === "test") this.initializeEditorFrame(event.currentTarget as HTMLIFrameElement)
  }

  private initializeEditorFrame(iframe: HTMLIFrameElement) {
    for(const pending of this.frameRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error("The editor iframe was reloaded"))
    }
    this.frameRequests.clear()
    this.dirtyTrackingReady = false
    this.dirtyTrackingMutationPending = false
    this.elementStyleRefreshSequence++
    this.elementStyle = {
      target: null,
      inline: {},
      computed: {},
      context: {display: "", parentDisplay: ""},
    }
    if(this.dirtyTrackingTimer !== undefined) clearTimeout(this.dirtyTrackingTimer)
    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    if(!this.editorOpaque) this.editorWindow?.removeEventListener(aiEditReviewEvent, this.handleInlineAIEditReview)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("focus", this.handleHostWindowFocus)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("blur", this.handleHostWindowBlur)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("pointerdown", this.handleEditorPointerDown, true)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    this.editorDocument?.removeEventListener("keydown", this.handleConfiguredShortcut, true)
    iframe.removeEventListener("focus", this.handleEditorFrameFocus)
    iframe.removeEventListener("blur", this.handleEditorFrameBlur)
    this.clearMotionStylesheet()
    this.editorOpaque = iframe.contentDocument === null
    this.editorDocument = iframe.contentDocument
    this.editorWindow = iframe.contentWindow
    this.updateMotionPreference()
    // Happy DOM parses the intentionally minimal initial srcdoc's metadata
    // into the body. Browsers place it in the head, but keep the authored DOM
    // correct in either environment before observers and bridge state start.
    if(this.frameDocumentHTML === null) {
      const generator = this.editorDocument?.querySelector('meta[name="generator"]')
      if(generator && generator.parentElement !== this.editorDocument?.head) {
        this.editorDocument?.head.prepend(generator)
      }
      const theme = this.editorDocument?.querySelector('style[data-ww-theme]')
      if(theme && theme.parentElement !== this.editorDocument?.head) {
        this.editorDocument?.head.append(theme)
      }
      this.editorDocument?.documentElement.setAttribute("lang", this.settings.language)
    }
    if(this.breadcrumbHoverPath !== null) {
      void this.execute({
        type: "hoverNode",
        path: [...this.breadcrumbHoverPath],
      }).catch(() => {})
    }
    this.documentTree = this.buildDocumentTree()
    const body = this.editorDocument?.body
    const FrameMutationObserver = this.editorOpaque ? undefined : (this.editorWindow as unknown as {
      MutationObserver?: typeof MutationObserver
    } | null)?.MutationObserver
    if(body && FrameMutationObserver) {
      const observationOptions: MutationObserverInit = {
        attributes: true, attributeOldValue: true, characterData: true,
        characterDataOldValue: true, childList: true, subtree: true,
      }
      const templateOwners = new WeakMap<Node, HTMLTemplateElement>()
      const isCurrentTarget = (node: Node): boolean => {
        if(this.editorDocument!.documentElement.contains(node)) return true
        const owner = templateOwners.get(node.getRootNode())
        return Boolean(owner && isCurrentTarget(owner))
      }
      // Construct the observer in the iframe's realm. Chromium rejects an
      // outer-window MutationObserver when scoped-registry initialization
      // reloads the iframe and hands it an iframe-owned Node.
      const observer = new FrameMutationObserver((mutations: MutationRecord[]) => {
        if(mutations.some(mutation => mutation.type === "childList")) {
          this.documentTree = this.buildDocumentTree()
          observeLayouts(mutations)
        }
        const hasAuthoredMutation = mutations.some(mutation => isCurrentTarget(mutation.target) && this.isAuthoredMutation(mutation))
        if(hasAuthoredMutation) {
          this.documentChangeSequence++
          if(this.historyDocumentTransitionCount === 0) {
            if(this.dirtyTrackingReady) this.fileDirty = !this.isFreshDocumentUnchanged()
            else this.dirtyTrackingMutationPending = true
            if(this.documentLayoutConversionCount === 0 && this.dirtyTrackingReady && this.fileDirty) this.documentLayoutsDismissed = true
          }
          if(this.stylesVisible()) this.queueElementStyleRefresh()
        }
      })
      // Template contents are separate trees. Release removed fragments and
      // retain any queued records when the observation roots need rebuilding.
      let observedTemplates = new Set<DocumentFragment>()
      const observeLayouts = (mutations: MutationRecord[] = []) => {
        const roots: ParentNode[] = [this.editorDocument!.documentElement]
        const templates = new Set<DocumentFragment>()
        for(let index = 0; index < roots.length; index++) {
          roots[index].querySelectorAll<HTMLTemplateElement>("template").forEach(template => {
            if(!template.content) return
            templateOwners.set(template.content, template)
            templates.add(template.content)
            roots.push(template.content)
          })
        }
        const removed = [...observedTemplates].some(fragment => !templates.has(fragment))
        if(removed) {
          mutations.push(...observer.takeRecords())
          observer.disconnect()
          observer.observe(this.editorDocument!.documentElement, observationOptions)
        }
        for(const fragment of templates) {
          if(removed || !observedTemplates.has(fragment)) observer.observe(fragment, observationOptions)
        }
        observedTemplates = templates
      }
      this.documentTreeObserver = observer
      try {
        observer.observe(this.editorDocument?.documentElement ?? body, observationOptions)
        observeLayouts()
      }
      catch {
        // A preliminary iframe load can expose a body from the document being
        // replaced. Do not let that transient realm mismatch prevent the
        // initialization messages below from reaching the final document.
        observer.disconnect()
        this.documentTreeObserver = null
      }
    }
    // Observe before feature capture listeners can claim canvas/slide gestures.
    if(!this.editorOpaque) this.editorWindow?.addEventListener("pointerdown", this.handleEditorPointerDown, true)
    this.editorDocument?.addEventListener("focusin", this.handleEditorFocus)
    this.editorDocument?.addEventListener("keydown", this.handleConfiguredShortcut, true)
    if(!this.editorOpaque) this.editorWindow?.addEventListener(aiEditReviewEvent, this.handleInlineAIEditReview)
    if(!this.editorOpaque) this.editorWindow?.addEventListener("focus", this.handleHostWindowFocus)
    if(!this.editorOpaque) this.editorWindow?.addEventListener("blur", this.handleHostWindowBlur)
    iframe.addEventListener("focus", this.handleEditorFrameFocus)
    iframe.addEventListener("blur", this.handleEditorFrameBlur)
    if(this.editorWindow) {
      const editorWindow = this.editorWindow
      const editorReadyResolve = this.editorReadyResolve
      const editorReadyReject = this.editorReadyReject
      const initializeMessage: InitializeEditorMessage = {
        type: initializeEditorMessage,
        syncUrl: this.syncUrl,
        bridgeNonce: this.bridgeNonce,
        language: this.settings.language,
        username: this.username,
        disableAnimations: this.settings.disableAnimations,
        shortcuts: {...this.settings.shortcuts},
        ...(this.frameState ? {initialState: this.frameState} : {}),
      }
      const importMap = this.packageImportMap ?? undefined
      const packageSetKey = this.packageSetKey(this.installedPackages)
      const loadMessage: LoadWidgetsMessage = {
        type: loadWidgetsMessage,
        bridgeNonce: this.bridgeNonce,
        widgets: this.installedPackages.map(({name, version}) => ({name, version})),
        packages: this.editorOpaque
          ? framePackages(this.installedPackages, window.location.origin, editorFrameOrigin())
          : this.installedPackages,
        ...(importMap ? {importMap: this.editorOpaque
          ? frameImportMap(importMap, window.location.origin, editorFrameOrigin())! : importMap} : {}),
      }
      this.postToEditor(initializeMessage)
      const packageLoadRequestId = `packages-${++this.packageLoadSequence}`
      const packageLoad = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          if(!this.pendingExecutions.delete(packageLoadRequestId)) return
          reject(new Error("The editor did not finish loading package resources"))
        }, packageModuleEntries(this.installedPackages).length ? 60_000 : packageLoadTimeoutMs)
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
      this.packageLoadPromise = packageLoad
      if(packageModuleEntries(this.installedPackages).length) {
        if(importMap && this.packageImportMapPackageSetKey === packageSetKey) {
          this.postToEditor({...loadMessage, requestId: packageLoadRequestId})
        }
        else void resolvePackageDependencies(this.installedPackages, document.baseURI, importMap).then(plan => {
          if(this.editorWindow !== editorWindow || !this.pendingExecutions.has(packageLoadRequestId)) return
          this.packageImportMap = plan.map
          this.packageImportMapPackageSetKey = packageSetKey
          this.persistPackageImportMap()
          this.postToEditor({...loadMessage, ...(plan.map ? {importMap: this.editorOpaque
            ? frameImportMap(plan.map, window.location.origin, editorFrameOrigin()) : plan.map} : {}), requestId: packageLoadRequestId})
        }, error => {
          const pending = this.pendingExecutions.get(packageLoadRequestId)
          if(!pending) return
          this.pendingExecutions.delete(packageLoadRequestId)
          pending.reject(error)
        })
      }
      else this.postToEditor({...loadMessage, requestId: packageLoadRequestId})
      void packageLoad.catch(error => {
        const message = error instanceof Error ? error.message : String(error)
        if(!this.isConnected || message === "The editor iframe was reloaded for a package change") return
        if(this.installedPackages.some(isLocalResourcePackage)) this.localPackageError = message
        else this.packageError = message
      })
      void packageLoad.then(
        () => {
          void this.inspectLocalPackageWidgets(editorWindow).catch(() => {})
          if(this.editorOpaque && this.editorWindow === editorWindow) {
            const tags = this.installedPackages.flatMap(pkg => pkg.members.flatMap(member => member.tagName ? [member.tagName] : []))
            void this.requestFrameControl("registered-tags", {tags}).then(response => {
              if(this.editorWindow !== editorWindow) return
              this.registeredWidgetTags.clear()
              for(const tag of response.tags ?? []) if(typeof tag === "string") this.registeredWidgetTags.add(tag)
            }).catch(() => {})
          }
          if(this.editorWindow === editorWindow && !packageModuleEntries(this.installedPackages).length) {
            this.packageImportMap = null
            this.packageImportMapPackageSetKey = null
          }
          // Activate the initial selection after the delayed frame and its
          // widget resources are ready. Window focus refreshes its markers.
          if(this.isConnected && this.editorWindow === editorWindow && this.frameRevision === 0 && !this.previewActive) {
            this.focusEditor()
          }
          this.updateUserIdentity()
          editorReadyResolve?.(editorWindow)
          if(this.frameRevision === 0 && this.frameDocumentHTML === null && !this.initialDocumentLayoutStarted
            && !new URL(location.href).searchParams.has("open") && this.settings.defaultLayout !== "document") {
            this.initialDocumentLayoutStarted = true
            void this.applyDefaultLayout(this.settings.defaultLayout, 0).catch(error => this.reportFileError(error))
          }
          if(this.isConnected && this.editorWindow === editorWindow && this.stylesVisible()) this.queueElementStyleRefresh()
        },
        error => editorReadyReject?.(error),
      )
      this.dirtyTrackingTimer = setTimeout(() => {
        this.dirtyTrackingReady = true
        if(this.dirtyTrackingMutationPending) {
          this.dirtyTrackingMutationPending = false
          this.fileDirty = !this.isFreshDocumentUnchanged()
          if(this.fileDirty && this.documentLayoutConversionCount === 0) this.documentLayoutsDismissed = true
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

  /** Dirty tracking for a generated Canvas or Slides document ignores local
   * markers and native empty-block placeholders. */
  private authoredDocumentSnapshot() {
    const root = this.editorDocument?.documentElement.cloneNode(true) as HTMLElement | undefined
    if(!root) return null
    root.querySelectorAll(".◆editor-only, [data-webwriter-editor-only]").forEach(element => element.remove())
    clearEditorOwnedAttributes(root)
    for(const element of [root, ...root.querySelectorAll("*")]) {
      const classes = this.authoredClasses(element.getAttribute("class"))
      if(classes) element.setAttribute("class", classes)
      else element.removeAttribute("class")
      if(element.getAttribute("style") === "") element.removeAttribute("style")
      if(["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(element.localName)
        && Array.from(element.childNodes).every(node => node.nodeType === Node.TEXT_NODE && !node.textContent
          || node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === "br" && !(node as Element).attributes.length)) element.replaceChildren()
    }
    const body = root.querySelector("body")
    const paragraph = body?.firstElementChild
    if(body && documentLayoutMode(body) === "canvas" && body.childNodes.length === 1
      && paragraph?.localName === "p" && !paragraph.childNodes.length
      && Array.from(paragraph.attributes).every(attribute => attribute.name === "style")) {
      // Canvas drops an empty paragraph when focus leaves it. Its placement
      // alone does not distinguish that placeholder from an empty canvas.
      const placeholder = paragraph.cloneNode(true) as HTMLElement
      clearInlinePlacement(placeholder)
      if(!placeholder.attributes.length) paragraph.remove()
    }
    return root.outerHTML
  }

  private pristineDocumentLayoutSnapshot(snapshot: string | null) {
    if(snapshot === null) return null
    const doc = new DOMParser().parseFromString(snapshot, "text/html")
    for(const style of doc.head.querySelectorAll("style")) {
      if(style.attributes.length === 0 && (style.textContent === canvasStyles || style.textContent === slidesStyles)) style.remove()
    }
    const body = doc.body
    body.classList.remove("ww-canvas", "ww-slides")
    if(!body.classList.length) body.removeAttribute("class")
    for(const viewport of body.querySelectorAll(":scope > div.ww-slides-viewport")) {
      if(viewport.attributes.length !== 1 || viewport.className !== "ww-slides-viewport") return null
      for(const slide of Array.from(viewport.children)) {
        if(!slide.matches("section.ww-slide") || slide.className !== "ww-slide" || Array.from(slide.attributes).some(attribute => attribute.name !== "class"
          && !(attribute.name === "tabindex" && attribute.value === "-1")
          && !(attribute.name === "id" && /^slide-[0-9a-f-]{36}$/i.test(attribute.value)))) return null
        slide.querySelectorAll(":scope > nav.ww-slide-directions").forEach(nav => nav.remove())
        slide.replaceWith(...slide.childNodes)
      }
      viewport.replaceWith(...viewport.childNodes)
    }
    body.querySelectorAll(":scope > nav.ww-slides-navigation").forEach(nav => nav.remove())
    const placement: Record<string, string[]> = {
      position: ["absolute", "static"], left: ["0px", "var(--ww-page-gutter, 1.25rem)"],
      top: ["0px", "1.25rem", "calc(20% + 2.5rem)"],
      width: ["320px", "calc(100% - 2 * var(--ww-page-gutter, 1.25rem))"],
      height: ["20%", "calc(80% - 3.75rem)"],
    }
    for(const child of body.children) {
      if(!child.matches("p, h1, h2, h3, h4, h5, h6")) return null
      const element = child as HTMLElement
      for(const property of Array.from({length: element.style.length}, (_, index) => element.style.item(index))) {
        if(!placement[property]?.includes(element.style.getPropertyValue(property)) || element.style.getPropertyPriority(property)) return null
      }
      element.removeAttribute("style")
    }
    if(!resetEmptyLayoutContent(body)) return null
    return doc.documentElement.outerHTML
  }

  private async retainFreshDocumentLayout(revision: number, initialSnapshot?: string | null) {
    if(this.editorOpaque) {
      // Published snapshots are throttled; request the converted DOM before
      // recording its initial state so a delayed snapshot stays clean.
      const response = await this.requestFrameControl("snapshot")
      if(revision !== this.frameRevision) return
      if(typeof response.html !== "string") throw new Error("The editor did not return its document")
      this.editorDocument = new DOMParser().parseFromString(response.html, "text/html")
      this.documentTree = this.buildDocumentTree()
    }
    if(revision !== this.frameRevision || this.fileHandle !== null || this.backendDocumentId !== null) return
    if(initialSnapshot !== undefined) {
      const before = this.pristineDocumentLayoutSnapshot(initialSnapshot)
      if(before === null || before !== this.pristineDocumentLayoutSnapshot(this.authoredDocumentSnapshot())) {
        this.fileDirty = true
        return
      }
    }
    this.freshDocumentLayoutSnapshot = this.authoredDocumentSnapshot()
    this.fileDirty = false
  }

  private isFreshDocumentUnchanged() {
    if(this.fileHandle !== null || this.backendDocumentId !== null) return false
    if(this.freshDocumentLayoutSnapshot !== null) return this.authoredDocumentSnapshot() === this.freshDocumentLayoutSnapshot
    const body = this.editorDocument?.body
    const head = this.editorDocument?.head
    if(!body || !head) return false
    const hasAttributes = (element: Element, expected: Record<string, string> = {}) => {
      const attributes = Object.fromEntries(Array.from(element.attributes).flatMap(attribute => {
        if(attribute.name === "class") {
          const value = this.authoredClasses(attribute.value)
          return value ? [[attribute.name, value]] : []
        }
        if(attribute.name === "style" && !attribute.value.trim()) return []
        return [[attribute.name, attribute.value]]
      }))
      return Object.keys(attributes).length === Object.keys(expected).length
        && Object.entries(expected).every(([name, value]) => attributes[name] === value)
    }
    // SharedDOMDoc assigns a persistent document identity during startup.
    const root = this.editorDocument!.documentElement
    const initialAttributes: Record<string, string> = {lang: this.settings.language}
    if(/^ww[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(root.id)) initialAttributes.id = root.id
    if(!hasAttributes(body) || !hasAttributes(head) || !hasAttributes(root, initialAttributes)) return false

    const authoredHeadNodes = Array.from(head.childNodes).filter(node => !(
      node.nodeType === Node.ELEMENT_NODE && (
        (node as Element).classList.contains("◆editor-only")
        || (node as Element).hasAttribute("data-webwriter-editor-only")
      )
    ))
    const generator = authoredHeadNodes[0]
    const theme = authoredHeadNodes[1]
    const headUnchanged = authoredHeadNodes.length === 2
      && generator?.nodeType === Node.ELEMENT_NODE
      && (generator as Element).localName === "meta"
      && (generator as Element).getAttribute("name")?.toLowerCase() === "generator"
      && (generator as Element).getAttribute("content") === WEBWRITER_GENERATOR
      && (generator as Element).attributes.length === 2
      && theme?.nodeType === Node.ELEMENT_NODE
      && (theme as Element).localName === "style"
      && (theme as Element).getAttribute("data-ww-theme") === defaultDocumentTheme.value
      && (theme as Element).textContent === defaultDocumentTheme.source
      && hasAttributes(theme as Element, {"data-ww-theme": defaultDocumentTheme.value, blocking: "render"})
    if(!headUnchanged) return false

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
      && hasAttributes(onlyChild as Element)
      // Native editing can leave empty text nodes and a placeholder line break.
      && (onlyChild as Element).children.length <= 1
      && Array.from(onlyChild.childNodes).every(node =>
        node.nodeType === Node.TEXT_NODE && !node.textContent
        || node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === "br" && hasAttributes(node as Element)
      )
  }

  private isAuthoredMutation(mutation: MutationRecord) {
    const element = mutation.target.nodeType === Node.ELEMENT_NODE
      ? mutation.target as Element : mutation.target.parentElement
    // Resource loaders update their own attributes and text after startup.
    // Those changes, like appendix UI, do not edit the authored document.
    if(element?.closest(".◆editor-only, [data-webwriter-editor-only]")) return false
    if(mutation.type === "characterData") return mutation.oldValue !== mutation.target.nodeValue
    if(mutation.type === "attributes") {
      const current = mutation.attributeNamespace
        ? element?.getAttributeNS(mutation.attributeNamespace, mutation.attributeName!) ?? null
        : element?.getAttribute(mutation.attributeName!) ?? null
      if(mutation.attributeName === "class") {
        return this.authoredClasses(mutation.oldValue) !== this.authoredClasses(current)
      }
      // DOM synchronization can set an attribute to the value it already has.
      return mutation.oldValue !== current
    }
    const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
    return nodes.some(node => !(
      node.nodeType === Node.ELEMENT_NODE && ((node as Element).classList.contains("◆editor-only")
        || (node as Element).hasAttribute("data-webwriter-editor-only"))
    ))
  }

  private handleEditorPointerDown = (event: PointerEvent) => {
    const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
    if(isWidgetShadowInteraction(event)) return
    this.focusEditor()
    this.dismissEditorMenus()
    if(!this.editorTargetSharesTextSelection(event.target)) {
      ribbon?.dismissDrawers()
    }
  }

  private dismissEditorMenus() {
    const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
    ribbon?.dismissCollapsedMenu()
    ribbon?.dismissMenus()
    this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")?.dismissMenus()
    this.renderRoot.querySelector<DeveloperConsole>("developer-console")?.dismissMenus()
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
    this.handleHostWindowFocus()
    this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.dismissCollapsedMenu()
  }

  private handleEditorFrameBlur = () => {
    this.saveEditorSelection()
  }

  private handleHostWindowBlur = () => {
    // Entering a child frame also blurs the host Window. Check the completed
    // focus change before treating it as a switch to another app/window.
    queueMicrotask(() => {
      if(!this.isConnected || this.ownerDocument.hasFocus()) return
      // Retire Chrome's iframe hit-test target while inactive, so returning
      // directly to the frame refreshes native cursors without a ribbon detour.
      this.editorIframe()?.classList.add("window-inactive")
    })
  }

  private handleHostWindowFocus = () => {
    this.editorIframe()?.classList.remove("window-inactive")
  }

  private editorIframe() {
    return this.renderRoot.querySelector<HTMLIFrameElement>("iframe.editor-frame")
  }

  private isEditorFocused() {
    const iframe = this.editorIframe()
    return iframe !== null && this.shadowRoot?.activeElement === iframe
  }

  private saveEditorSelection() {
    if(this.editorOpaque) {
      this.savedEditorSelection = "remote"
      this.postFrameControl("save-selection")
      return
    }
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
    if(this.editorOpaque) {
      this.savedEditorSelection = null
      return
    }
    const bookmark = this.savedEditorSelection
    this.savedEditorSelection = null
    const selection = this.editorDocument?.getSelection()
    const body = this.editorDocument?.body
    if(!bookmark || bookmark === "remote" || !selection || !body) return

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
    if(this.editorOpaque) {
      if(!restoreSelection) this.saveEditorSelection()
      this.editorIframe()?.focus({preventScroll: true})
      this.postFrameControl("focus")
      this.savedEditorSelection = null
      return
    }
    // Activating designMode can collapse the range established by a command.
    // Preserve that live range unless the caller requested its saved bookmark.
    if(!restoreSelection) {
      this.savedEditorSelection = null
      this.saveEditorSelection()
    }
    const iframe = this.editorIframe()
    iframe?.focus({preventScroll: true})
    this.editorWindow?.focus()
    // Focusing the frame alone does not activate native designMode typing.
    this.editorDocument?.body.focus({preventScroll: true})
    this.restoreEditorSelection()
  }

  private async joinLiveSession(sessionId: string) {
    if(this.liveSessionActive) return
    if(import.meta.env.MODE !== "test" && !this.backendSession) await this.loginToBackend()
    if(!this.isConnected) return
    if(!this.backendSession?.collaborationUrl) {
      this.reportFileError(new Error("Connect to a collaboration server to join a live session"))
      return
    }
    const identity = this.learnerIdentity(sessionId)
    const token = new URL(location.href).searchParams.get(liveSessionTokenParameter) ?? ""
    if(this.backendSession?.collaborationUrl && !/^[A-Za-z0-9_-]{24,256}$/.test(token)) {
      this.reportFileError(new Error("This live-session link is missing its access token"))
      return
    }
    const session = new LiveSession({
      id: sessionId,
      role: "learner",
      learner: identity,
      ...(this.backendSession?.collaborationUrl ? {serverUrl: this.backendSession.collaborationUrl} : {}),
      ...(token ? {token} : {}),
    })
    this.liveStreamPlaying = true
    this.liveStreamStep = 0
    this.previewSelection = null
    this.previewDocumentHTML = session.baseHTML ?? `<!doctype html><html><head><title>Joining live session</title></head><body><p>Joining live session…</p></body></html>`
    this.previewFrameRevision++
    this.previewActive = true
    this.resetLivePlayback()
    this.connectLiveSession(session, "learner")
  }

  private disposeLiveSession() {
    this.livePreviewSource = null
    this.livePreview.disconnect()
    this.clearLivePlaybackTimer()
    this.liveSessionUnsubscribe?.()
    this.liveSessionUnsubscribe = null
    const session = this.liveSession
    this.liveSession = null
    if(session) {
      if(this.liveSessionRole === "host") session.stop()
      session.destroy()
    }
    this.liveSessionActive = false
    this.liveSessionRole = ""
    this.liveSessionLink = ""
    this.liveLearners = []
    this.liveSteps = []
    this.liveStreamStep = 0
    this.liveStreamPlaying = false
    this.liveStreamTime = 0
    this.liveStreamDuration = 0
    this.liveOverlayLearners = []
    this.liveOverlayWidgets = []
    this.previewWidgetPositions = []
    this.liveLearnerVisibility.clear()
    this.liveStatesAtStep.clear()
    this.resetLiveStateCache()
    this.liveSelectedWidgetLearners.clear()
  }

  private async enterPreview() {
    if(this.previewActive || this.previewTransition) return
    if(!this.settings.pinDeveloperConsole && this.localPackageDraft && !await this.resolvePendingPackageChanges()) return
    this.previewTransition = true
    this.savedEditorSelection = null
    this.saveEditorSelection()
    this.previewSelection = this.savedEditorSelection
    this.savedEditorSelection = null

    try {
      // Preview hides the editor iframe, so close any appendix capture UI and
      // release its device streams before the authored document is previewed.
      void this.execute({type: "cancelMediaCapture"}).catch(() => {
        // Cancellation is best effort while the editor frame is initializing.
      })
      if(!this.editorDocument) await this.waitForEditorWindow()
      if(import.meta.env.MODE !== "test" && this.backendState === "probing") await this.loginToBackend()
      const previewHTML = this.editorOpaque
        ? await this.currentPreviewHTMLFromFrame()
        : this.currentPreviewHTML()
      const generation = ++this.previewGeneration
      const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
      this.previewFramePending = Boolean(ribbon && (!ribbon.expanded || ribbon.getAnimations?.().length))
      this.previewDocumentHTML = previewHTML
      this.previewFrameRevision++
      this.previewActive = true
      this.resetLivePlayback()
      if(this.previewFramePending) void this.showPreviewAfterRibbonExpansion(generation)
    }
    catch(error) {
      this.previewSelection = null
      this.disposeLiveSession()
      this.reportFileError(error)
    }
    finally {
      this.previewTransition = false
    }
  }

  private async showPreviewAfterRibbonExpansion(generation: number) {
    await this.updateComplete
    const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
    await ribbon?.updateComplete
    // Reading the animations after Lit reflects `expanded` flushes the new
    // styles. Loading srcdoc earlier makes document parsing and widget startup
    // compete with the ribbon's height transition on the main thread.
    await Promise.allSettled((ribbon?.getAnimations?.() ?? []).map(animation => animation.finished))
    if(this.isConnected && this.previewActive && this.previewGeneration === generation) {
      this.previewFramePending = false
    }
  }

  private async exitPreview() {
    if(!this.previewActive || this.previewTransition) return
    const selection = this.previewSelection
    this.previewGeneration++
    this.previewSelection = null
    this.disposeLiveSession()
    this.previewFramePending = false
    this.previewDocumentHTML = null
    this.previewActive = false
    await this.updateComplete
    this.savedEditorSelection = selection
    this.focusEditor(true)
  }

  private toggleLiveSession = (event: Event) => {
    const enabled = (event as CustomEvent<{enabled?: unknown}>).detail?.enabled
    if(typeof enabled !== "boolean" || !this.previewActive || this.liveSessionRole === "learner" || enabled === this.liveSessionActive) return
    if(!enabled) {
      for(const path of this.liveSelectedWidgetLearners.keys()) this.applyLiveWidgetState(path, null)
      this.disposeLiveSession()
      this.resetLivePlayback()
      return
    }
    try {
      const sessionId = randomIdentifier("live")
      const serverUrl = this.backendSession?.collaborationUrl
      const sessionToken = serverUrl ? randomIdentifier("live-token") : undefined
      const session = new LiveSession({
        id: sessionId,
        role: "host",
        baseHTML: this.previewDocumentHTML ?? this.currentPreviewHTML(),
        ...(serverUrl ? {serverUrl} : {}),
        token: sessionToken,
      })
      this.resetLivePlayback()
      this.connectLiveSession(session, "host", sessionToken ? this.liveSessionShareLink(sessionId, sessionToken) : "")
      const frame = this.renderRoot.querySelector<HTMLIFrameElement>("iframe.preview-frame")
      if(frame?.contentDocument) this.livePreview.observeHost(frame, frame.contentDocument, () => this.updateLiveWidgetAffordances())
      else if(this.previewOpaque) this.configurePreviewFrame()
    }
    catch(error) {
      this.disposeLiveSession()
      this.resetLivePlayback()
      this.reportFileError(error)
    }
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

  private listAIWidgets(args: Record<string, unknown>) {
    const {offset, limit} = aiPage(args)
    if(args.query !== undefined && (typeof args.query !== "string" || args.query.length > 200)) throw new TypeError("Provide a short widget search query")
    const query = String(args.query ?? "").toLowerCase()
    const packages = new Map([...this.packages, ...this.localPackages, ...this.installedPackages].map(pkg => [`${pkg.name}@${pkg.version}`, pkg]))
    const members = [...packages.values()].flatMap(pkg => {
      const installed = this.installedPackages.some(item => item.name === pkg.name && item.version === pkg.version)
      const local = [...this.localPackageManager.records.values()].find(record => record.package.name === pkg.name && record.package.version === pkg.version)
      return pkg.members.map(member => {
        const registered = member.kind === "snippet" || Boolean(member.tagName && (this.editorOpaque
          ? this.registeredWidgetTags.has(member.tagName) : this.editorWindow?.customElements.get(member.tagName)))
        const available = installed && member.insertable && registered && !local?.error
        return {
          id: member.id, packageName: pkg.name, version: pkg.version, label: member.label,
          description: member.description ?? pkg.description, tagName: member.tagName, kind: member.kind,
          source: local ? "local" : "published", localRevision: local?.revision,
          installed, insertable: member.insertable, registered, available,
          unavailableReason: available ? null : !installed ? "Package is not enabled in this document"
            : !member.insertable ? "Package marks this member uninsertable" : local?.error ?? "Widget has not registered in the editor",
          editingConfig: member.editingConfig ?? {}, documentation: "Read this package's README before configuring the widget",
        }
      })
    }).filter(member => `${member.packageName} ${member.label} ${member.description ?? ""} ${member.tagName ?? ""}`.toLowerCase().includes(query))
    return {members: members.slice(offset, offset + limit), total: members.length, nextOffset: offset + limit < members.length ? offset + limit : undefined,
      scope: "Installed, local, and previously discovered catalog packages", catalogLoading: this.packagesLoading}
  }

  private readonly aiDocumentedPackages = new Set<string>()

  private async readAIWidgetDocumentation(args: Record<string, unknown>, options: {signal?: AbortSignal}) {
    if(typeof args.packageName !== "string" || typeof args.version !== "string") throw new TypeError("Choose a package name and exact version from list_widgets")
    const pkg = [...this.installedPackages, ...this.localPackages, ...this.packages].find(pkg => pkg.name === args.packageName && pkg.version === args.version)
    if(!pkg) return {status: "unavailable", message: "This package/version is not in the current widget inventory; read list_widgets again"}
    const local = [...this.localPackageManager.records.values()].find(record => record.package.name === pkg.name && record.package.version === pkg.version)
    if(args.localRevision !== undefined && args.localRevision !== local?.revision) return {status: "unavailable", message: "The local package revision changed; read list_widgets again"}
    for(const field of ["startLine", "lineCount"] as const) {
      const value = args[field]
      if(value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || field === "lineCount" && value > 200)) throw new TypeError(`Invalid documentation ${field}`)
    }
    const readOptions = {startLine: args.startLine as number | undefined, lineCount: args.lineCount as number | undefined, signal: options.signal}
    const result = local ? await this.localPackageManager.readPackageReadme(pkg, readOptions) : await this.packageRegistry.readPackageReadme(pkg, readOptions)
    if(result.status === "available" || result.reason === "not-found") this.aiDocumentedPackages.add(`${pkg.name}@${pkg.version}/${local?.revision ?? "published"}`)
    return {...result, members: pkg.members.map(member => ({id: member.id, tagName: member.tagName, editingConfig: member.editingConfig ?? {}, publicAPI: "Only use APIs explicitly documented in the README or editing metadata"}))}
  }

  private readonly handleAIDocumentTool: AIDocumentToolHandler = async (call: AIDocumentToolCall, options = {}) => {
    if(call.name === "read_editor_capabilities") {
      if(call.id.endsWith("/context")) this.aiDocumentedPackages.clear()
      return this.execute({...call.arguments, type: "readAIEditorCapabilities"}, options)
    }
    if(call.name === "inspect_elements") return this.execute({...call.arguments, type: "inspectAIElements"}, options)
    if(call.name === "list_widgets") return this.listAIWidgets(call.arguments)
    if(call.name === "read_widget_documentation") return this.readAIWidgetDocumentation(call.arguments, options)
    if(call.name === "read_current_document") {
      return await this.execute({...call.arguments, type: "readAIDocument"}, options)
    }
    if(call.name === "read_current_selection") {
      return await this.execute({type: "readAISelection"}, options)
    }
    const html = call.arguments.html
    if(typeof html !== "string") throw new TypeError("The document tool did not provide HTML")
    if(call.name === "replace_current_document") {
      return await this.execute({type: "replaceAIDocument", html})
    }
    if(call.name === "replace_current_selection") {
      return await this.execute({type: "replaceAISelection", html})
    }
    throw new TypeError(`Unsupported document tool: ${String(call.name)}`)
  }

  private readonly handleAIEditReview: AIEditReviewHandler = async (action, call, options = {}) => {
    const editId = call.id
    if(action === "accept") return await this.execute({type: "acceptAIEdit", editId})
    if(action === "reject") return await this.execute({type: "rejectAIEdit", editId})
    if(action === "goto") return await this.execute({type: "gotoAIEdit", editId})
    if(action === "undo") return await this.execute({type: "undoAIEdit", editId})

    if(call.name === "queue_document_change") {
      options.signal?.throwIfAborted()
      const {summary, operations} = call.arguments
      if(typeof summary !== "string" || !Array.isArray(operations) || !operations.length || operations.length > 50) throw new TypeError("Provide a summary and 1–50 focused changes")
      const resolved: AIChangeOperation[] = []
      for(const operation of operations as AIChangeOperation[]) {
        if(!operation || typeof operation !== "object") throw new TypeError("Invalid document operation")
        if(operation.type !== "insert_widget") { resolved.push(operation); continue }
        const pkg = this.installedPackages.find(pkg => pkg.members.some(member => member.id === operation.memberId))
        const member = pkg?.members.find(member => member.id === operation.memberId)
        const local = pkg && [...this.localPackageManager.records.values()].find(record => record.package.name === pkg.name && record.package.version === pkg.version)
        if(!pkg || !member?.insertable || local?.error) throw new Error("The requested widget/snippet is unavailable; read list_widgets again")
        if(!this.aiDocumentedPackages.has(`${pkg.name}@${pkg.version}/${local?.revision ?? "published"}`)) throw new Error("Read the widget package README before inserting it")
        let html: string
        if(member.kind === "snippet") html = await this.packageRegistry.fetchSnippet(member, this.documentLanguage)
        else {
          if(!member.tagName || !(this.editorOpaque ? this.registeredWidgetTags.has(member.tagName)
            : this.editorWindow?.customElements.get(member.tagName))) throw new Error("The widget has not registered in the editor")
          const element = getInertDocument().createElement(member.tagName)
          if(operation.attributes !== undefined && (!operation.attributes || typeof operation.attributes !== "object" || Array.isArray(operation.attributes))) throw new TypeError("Provide widget attributes by name")
          for(const [name, value] of Object.entries(operation.attributes ?? {})) {
            if(value !== null && typeof value !== "string") throw new TypeError("Widget attributes must be strings or null")
            if(value !== null) element.setAttribute(name, value)
          }
          if(operation.html !== undefined && typeof operation.html !== "string") throw new TypeError("Widget light DOM must be HTML text")
          if(operation.html) element.innerHTML = operation.html
          html = element.outerHTML
        }
        resolved.push({type: "insert_html", target: operation.target, position: operation.position, html})
      }
      // Recheck readiness after asynchronous snippet resolution and before the
      // iframe validates targets. Package reloads cannot authorize stale tags.
      const availableWidgets = this.installedPackages.flatMap(pkg => {
        const local = [...this.localPackageManager.records.values()].find(record => record.package.name === pkg.name && record.package.version === pkg.version)
        return !local?.error && this.aiDocumentedPackages.has(`${pkg.name}@${pkg.version}/${local?.revision ?? "published"}`)
          ? pkg.members.flatMap(member => member.insertable && member.tagName && (this.editorOpaque
            ? this.registeredWidgetTags.has(member.tagName) : this.editorWindow?.customElements.get(member.tagName)) ? [member.tagName] : []) : []
      })
      options.signal?.throwIfAborted()
      return this.execute({type: "previewAIOperations", editId, summary, operations: resolved, availableWidgets})
    }

    const html = call.arguments.html
    const summary = call.arguments.summary
    if(typeof html !== "string" || typeof summary !== "string") {
      throw new TypeError("The document tool did not provide HTML and a summary")
    }
    return call.name === "replace_current_document"
      ? await this.execute({type: "previewAIDocument", editId, summary, html})
      : await this.execute({type: "previewAISelection", editId, summary, html})
  }

  private handleFileNameChange = (event: Event) => {
    const value = (event as CustomEvent<{value?: unknown}>).detail?.value
    if(typeof value === "string") this.fileName = this.baseFileName(value)
  }

  private handleDocumentHeadAction = (event: Event) => {
    const action = (event as CustomEvent<DocumentHeadAction>).detail
    if(!isDocumentHeadAction(action)) return
    void this.execute(action).then(changed => {
      if(changed !== false) this.fileDirty = true
    }).catch(error => this.reportFileError(error))
  }

  private clearMotionStylesheet() {
    if(!this.motionStylesheet) return
    const {document, sheet} = this.motionStylesheet
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(candidate => candidate !== sheet)
    this.motionStylesheet = null
  }

  private updateMotionPreference() {
    this.toggleAttribute("disable-animations", this.settings.disableAnimations)
    if(this.editorOpaque) {
      this.postFrameControl("motion", {disabled: this.settings.disableAnimations})
      return
    }
    this.clearMotionStylesheet()
    const document = this.editorDocument
    if(!this.settings.disableAnimations || !document?.defaultView) return
    // Construct in the iframe's realm. Adopted sheets never enter authored HTML,
    // collaboration, or serialization; only editor styles consume these tokens.
    const sheet = new (document.defaultView as Window & typeof globalThis).CSSStyleSheet()
    sheet.replaceSync(":root { --ww-ui-transition: none; --ww-ui-animation: none; }")
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    this.motionStylesheet = {document, sheet}
  }

  private handleAppSettingsChange = (event: Event) => {
    const settings = (event as CustomEvent<AppSettings>).detail
    if(!settings || typeof settings.language !== "string" || typeof settings.updateDocumentLanguage !== "boolean") return
    const previous = this.settings
    if(previous.pinDeveloperConsole && !settings.pinDeveloperConsole && this.localPackageDraft) {
      const toolbox = this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")
      if(!this.breadcrumbVisible || this.previewActive || !toolbox?.activeTool || toolbox.hidden) {
        void this.resolvePendingPackageChanges().then(continueChange => {
          if(continueChange) this.handleAppSettingsChange(event)
          else persistAppSettings(this.settings)
        })
        return
      }
    }
    this.settings = {...settings, shortcuts: {...settings.shortcuts}}
    const active = (value: AppSettings) => value.cloudServices.find(service => service.id === value.activeCloudServiceId)
    const connection = (service?: CloudService) => service?.authentication === "none" ? {...service, username: ""} : service
    if(previous.activeCloudServiceId !== settings.activeCloudServiceId
      || JSON.stringify(connection(active(previous))) !== JSON.stringify(connection(active(settings)))) {
      if(previous.activeCloudServiceId !== settings.activeCloudServiceId
        || active(previous)?.username !== active(settings)?.username || active(previous)?.url !== active(settings)?.url) this.backendDocumentId = null
      this.renderRoot.querySelector<OpenDocumentMenu>("open-document-menu")?.close()
      this.documentDialogClient = null
      this.savedDocuments = []
      void this.loginToBackend()
    }
    this.updateCloudExpiry()
    this.updateUserIdentity()
    this.lang = settings.language
    this.updateMotionPreference()
    this.localPackageManager.autoReload = settings.autoReloadPackages
    if(settings.pinDeveloperConsole && !previous.pinDeveloperConsole) {
      this.handleDeveloperConsoleChange(new CustomEvent("developer-console-change", {detail: {enabled: true}}))
    }
    if(previous.pinDeveloperConsole && !settings.pinDeveloperConsole) {
      const toolbox = this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")
      if(!toolbox?.activeTool || toolbox.hidden) {
        this.handleDeveloperConsoleChange(new CustomEvent("developer-console-change", {detail: {enabled: false}}))
      }
    }
    if(this.editorOpaque) this.postFrameControl("shortcuts", {shortcuts: {...settings.shortcuts}})
    if(settings.updateDocumentLanguage && (
      settings.language !== previous.language || !previous.updateDocumentLanguage
    )) {
      void this.execute({
        type: "setDocumentHeadField",
        field: "language",
        value: settings.language,
      }).then(changed => {
        if(changed !== false) this.fileDirty = true
      }).catch(error => this.reportFileError(error))
    }
  }

  private readonly handleConfiguredShortcut = (event: KeyboardEvent) => {
    if(event.defaultPrevented || event.isComposing) return
    if(event.composedPath().some(target => target instanceof HTMLElement
      && target.classList.contains("html-source-input"))) return
    if(event.composedPath().some(target => target instanceof HTMLElement && target.localName === "settings-panel")) return
    if(this.renderRoot.querySelector<OpenDocumentMenu>("open-document-menu")?.shadowRoot?.querySelector("dialog")?.open) return
    const shortcut = shortcutFromEvent(event)
    if(!shortcut) return
    const command = appCommands.find(candidate => this.settings.shortcuts[candidate.id] === shortcut)
    if(!command && !builtinShortcuts().has(shortcut)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(!command || event.repeat) return
    this.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {
      detail: {label: command.action},
    }))
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
    this.fileError = error instanceof Error ? error.message : String(error)
    this.dispatchEvent(new CustomEvent("file-error", {
      detail: {error},
      bubbles: true,
      composed: true,
    }))
    console.error(error)
  }

  private readonly handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if(!this.fileDirty && !this.fileOperationActive && !this.localPackageDraft) return
    event.preventDefault()
    event.returnValue = ""
  }

  private confirmDiscardChanges() {
    return !this.fileDirty || window.confirm("Discard the unsaved changes to this document?")
  }

  private async reloadDocument(htmlSource: string) {
    this.freshDocumentLayoutSnapshot = null
    this.aiDocumentedPackages.clear()
    await this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.cancelAIWork()
    const parsed = new DOMParser().parseFromString(htmlSource, "text/html")
    stripExcludedMarks(parsed.body)
    const reloadError = new Error("The editor iframe was reloaded for a document change")
    this.editorReadyPromise?.catch(() => {})
    this.editorReadyReject?.(reloadError)
    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    if(!this.editorOpaque) this.editorWindow?.removeEventListener(aiEditReviewEvent, this.handleInlineAIEditReview)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("pointerdown", this.handleEditorPointerDown, true)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    this.editorDocument = null
    this.editorWindow = null
    this.packageLoadPromise = null
    this.editorReadyPromise = null
    this.editorReadyResolve = null
    this.editorReadyReject = null
    this.savedEditorSelection = null
    this.frameState = undefined
    this.documentHead = emptyDocumentHeadState()
    this.historyState = emptyVersionHistoryState()
    this.historyLoading = false
    this.historyOperationCount = 0
    this.historyDocumentTransitionCount = 0
    this.historyError = ""
    this.documentLayout = defaultDocumentLayoutState()
    this.documentLayoutError = ""
    this.documentLayoutsDismissed = this.settings.pinDeveloperConsole
    this.frameDocumentHTML = `${serializeDoctype(parsed.doctype)}${parsed.documentElement.outerHTML}`
    this.pendingExecutions.forEach(({reject, timer, abortCleanup}) => {
      clearTimeout(timer)
      abortCleanup?.()
      reject(reloadError)
    })
    this.pendingExecutions.clear()
    this.frameRevision++
    await this.updateComplete
    await this.waitForEditorWindow()
  }

  private async runFileOperation(operation: () => Promise<void>) {
    if(this.fileOperationActive) return
    this.fileOperationActive = true
    this.fileError = ""
    try { await operation() }
    finally {
      this.fileOperationActive = false
      const pending = this.pendingCloudBundleSave
      this.pendingCloudBundleSave = null
      if(pending) await this.autosaveCloudAfterBundleReload(pending)
    }
  }

  private newDocument(layout: DocumentLayoutMode = this.settings.defaultLayout) {
    return this.runFileOperation(() => this.performNewDocument(layout))
  }

  private openDocument() {
    if(this.settings.activeCloudServiceId) {
      if(this.fileOperationActive) return Promise.resolve()
      if(!this.backendClient) {this.reportFileError(new Error("Connect to the configured cloud service in Settings to open a file.")); return Promise.resolve()}
      return this.showOpenDocumentMenu()
    }
    return this.runFileOperation(() => this.performOpenDocument())
  }

  private async showOpenDocumentMenu(mode: "open" | "save" = "open", format: FileFormat = this.fileFormat) {
    this.documentDialogMode = mode
    this.documentDialogFormat = format
    this.documentDialogClient = this.backendClient
    this.documentsError = ""
    const loading = this.loadSavedDocuments()
    await this.updateComplete
    // The Open command's menu item is now hidden. Give the dialog a visible
    // focus target to restore when it is dismissed.
    const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
    await ribbon?.updateComplete
    ribbon?.shadowRoot?.querySelector('ribbon-tab[label="File"]')?.shadowRoot
      ?.querySelector<HTMLButtonElement>("button")?.focus()
    const menu = this.renderRoot.querySelector<OpenDocumentMenu>("open-document-menu")
    if(menu) {
      menu.fileName = this.fileNameForFormat(format)
      await menu.show()
    }
    await loading
  }

  private async loadSavedDocuments() {
    const client = this.backendClient
    if(!client || this.documentsLoading || this.fileOperationActive) return
    this.documentsLoading = true
    this.documentsError = ""
    try {
      const documents = await client.listDocuments()
      if(this.backendClient !== client) return
      this.savedDocuments = documents.sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title))
    }
    catch(error) {
      if(this.backendClient !== client) return
      this.savedDocuments = []
      this.documentsError = error instanceof Error ? error.message : String(error)
    }
    finally {
      if(this.backendClient === client) {
        this.documentsLoading = false
        void this.refreshRecentDocuments()
      }
    }
  }

  private get visibleRecentDocuments() {
    return this.recentDocuments.filter(document => this.accessibleRecentDocumentIds.has(document.id)
      && (document.kind === "local" || (this.backendClient && matchesRecentDocumentSession(document, this.backendSession)
        && this.savedDocuments.some(summary => summary.id === document.documentId)))).slice(0, 10)
  }

  private async restoreRecentDocuments() {
    this.recentDocuments = await readRecentDocuments()
    await this.refreshRecentDocuments()
  }

  private async refreshRecentDocuments() {
    const generation = ++this.recentRefreshGeneration
    const documents = this.recentDocuments
    const ids = new Set(this.savedDocuments.map(document => document.id))
    const session = this.backendClient ? this.backendSession : null
    const accessible = await Promise.all(documents.map(document => recentDocumentAccessible(document, session, ids)))
    if(generation !== this.recentRefreshGeneration || !this.isConnected || documents !== this.recentDocuments) return
    this.accessibleRecentDocumentIds = new Set(documents.filter((_, index) => accessible[index]).map(document => document.id))
  }

  private async rememberOpenedDocument(document: RecentDocument) {
    await this.recentDocumentsReady
    this.recentDocuments = await rememberRecentDocument(this.recentDocuments, document)
    const documents = this.recentDocuments
    this.recentDocumentsWrite = this.recentDocumentsWrite.then(() => saveRecentDocuments(documents))
    await this.recentDocumentsWrite
    await this.refreshRecentDocuments()
    return this.recentDocuments[0]
  }

  private updateDocumentURL(reference: string | null) {
    if(this.liveSessionActive) return
    const url = new URL(location.href)
    if(reference === null) url.searchParams.delete("open")
    else url.searchParams.set("open", reference)
    history.replaceState(history.state, "", url.href)
  }

  private updateBackendDocumentURL(id: string, client: BackendClient) {
    const apiBaseUrl = client.apiBaseUrl ?? this.backendSession?.apiBaseUrl
    if(apiBaseUrl) this.updateDocumentURL(`${apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(id)}`)
  }

  private async restoreLinkedDocument(value: string, backendReady: Promise<void> = Promise.resolve()) {
    const initialReference = new URL(location.href).searchParams.get("open")
    const currentLink = () => new URL(location.href).searchParams.get("open") === initialReference
    try {
      const reference = parseDocumentOpenReference(value)
      if(!reference) throw new Error("The document link is invalid.")
      await Promise.all([this.recentDocumentsReady, backendReady])
      if(!this.isConnected || this.liveSessionActive || !currentLink()) return
      const revision = this.frameRevision
      await this.waitForEditorWindow()
      if(!this.isConnected || this.frameRevision !== revision || this.liveSessionActive || !currentLink()) return
      await this.runFileOperation(async () => {
        if(reference.kind === "local") {
          const document = this.recentDocuments.find(document => document.kind === "local" && document.id === reference.id)
            ?? await readLocalDocumentReference(reference.id)
          if(!document || document.kind !== "local") throw new Error("This local document is not stored in this browser. Open the file again to create a new link.")
          if(!await recentDocumentAccessible(document, null, new Set())) throw new Error("This browser no longer has access to the linked local file. Open the file again to grant access.")
          if(!this.isConnected || this.frameRevision !== revision || !currentLink()) return
          await this.performOpenDocument(document.handle, document.id)
        }
        else {
          if(this.backendClient?.apiBaseUrl !== reference.apiBaseUrl) await this.loginToBackend(reference.apiBaseUrl)
          if(!this.isConnected || this.frameRevision !== revision || !currentLink()) return
          if(this.backendClient?.apiBaseUrl !== reference.apiBaseUrl) throw new Error("Could not connect to the document storage in this link.")
          await this.openBackendDocument(reference.documentId)
          if(this.documentsError) throw new Error(this.documentsError)
        }
      })
    }
    catch(error) {this.reportFileError(error)}
  }

  private handleRecentDocumentsRefresh = () => {
    void this.refreshRecentDocuments()
    if(this.backendClient) void this.loadSavedDocuments()
  }

  private async openRecentDocument(id: string) {
    const document = this.visibleRecentDocuments.find(document => document.id === id)
    if(!document) return
    await this.runFileOperation(() => document.kind === "local"
      ? this.performOpenDocument(document.handle) : this.openBackendDocument(document.documentId))
    this.handleRecentDocumentsRefresh()
  }

  private handleSavedDocumentOpen = (event: CustomEvent<{id: string}>) => {
    if(this.documentDialogMode !== "open" || this.documentDialogClient !== this.backendClient
      || this.documentsLoading || !this.savedDocuments.some(document => document.id === event.detail.id)) return
    void this.runFileOperation(() => this.openBackendDocument(event.detail.id))
  }

  private handleSavedDocumentDelete = (event: CustomEvent<{id: string}>) => {
    const client = this.backendClient
    const summary = this.savedDocuments.find(document => document.id === event.detail.id)
    if(!client || !summary || this.documentsLoading || this.fileOperationActive) return
    if(!window.confirm(`Delete “${summary.title}”? This will remove the saved document.`)) return
    void this.runFileOperation(async() => {
      this.documentsError = ""
      try {
        await client.deleteDocument(summary.id)
        if(this.backendClient !== client) return
        this.savedDocuments = this.savedDocuments.filter(document => document.id !== summary.id)
        void this.refreshRecentDocuments()
        if(this.backendDocumentId === summary.id) {
          this.backendDocumentId = null
          this.updateDocumentURL(null)
          this.fileDirty = true
        }
      }
      catch(error) {
        if(this.backendClient !== client) return
        this.documentsError = error instanceof Error ? error.message : String(error)
      }
    })
  }

  private handleSavedDocumentSave = (event: CustomEvent<{name: string, id?: string}>) => {
    const client = this.backendClient
    const name = event.detail.name.trim()
    if(!client || client !== this.documentDialogClient || this.documentDialogMode !== "save"
      || this.documentsLoading || this.fileOperationActive || !name) return
    const existing = event.detail.id ? this.savedDocuments.find(document => document.id === event.detail.id)
      : this.savedDocuments.find(document => this.baseFileName(document.title) === this.baseFileName(name))
    if(event.detail.id && !existing) return
    if(existing && !window.confirm(`Replace “${existing.title}”?`)) return
    void this.runFileOperation(async () => {
      this.documentsError = ""
      const saved = await this.saveBackendDocument(true, this.formatForFileName(name, this.documentDialogFormat), undefined,
        {name: this.baseFileName(name), id: existing?.id})
      if(client !== this.backendClient) return
      if(saved) this.renderRoot.querySelector<OpenDocumentMenu>("open-document-menu")?.close()
      else this.documentsError = this.fileError || "Could not save the document."
    })
  }

  private saveDocument(saveAs = false, requestedFormat: FileFormat = this.fileFormat) {
    if(this.fileOperationActive) return Promise.resolve()
    if(this.settings.activeCloudServiceId) {
      if(!this.backendClient) {this.reportFileError(new Error("Connect to the configured cloud service in Settings to save a file.")); return Promise.resolve()}
      if(saveAs || !this.backendDocumentId) return this.showOpenDocumentMenu("save", requestedFormat)
      return this.runFileOperation(async () => {await this.saveBackendDocument(false, requestedFormat)})
    }
    return this.runFileOperation(() => this.performSaveDocument(saveAs, requestedFormat))
  }

  private async performNewDocument(layout: DocumentLayoutMode) {
    if(!this.confirmDiscardChanges()) return
    try {
      this.fileHandle = null
      this.downloadedFileName = null
      this.backendDocumentId = null
      this.fileName = ""
      this.fileFormat = "html"
      await this.reloadDocument(`<!DOCTYPE html><html lang="${escapeAttribute(this.settings.language)}"><head><meta name="generator" content="${escapeAttribute(WEBWRITER_GENERATOR)}"></head><body></body></html>`)
      await this.applyDefaultLayout(layout, this.frameRevision)
      this.fileDirty = !this.isFreshDocumentUnchanged()
      this.updateDocumentURL(null)
      this.focusEditor()
    }
    catch(error) {
      this.reportFileError(error)
    }
  }

  private async applyDefaultLayout(mode: DocumentLayoutMode, revision: number) {
    if(mode === "document" || revision !== this.frameRevision) return
    const initialSnapshot = this.authoredDocumentSnapshot()
    this.documentLayoutConversionCount++
    try {
      const changed = await this.execute({type: "setDocumentLayout", mode, expectedMode: "document"})
      if(changed === false) throw new Error(`Could not create a new ${mode} document`)
      if(revision !== this.frameRevision) return
      await this.retainFreshDocumentLayout(revision, initialSnapshot)
    }
    finally { this.documentLayoutConversionCount-- }
  }

  private async performOpenDocument(storedHandle?: LocalFileHandle, storedId?: string) {
    if(!this.confirmDiscardChanges()) return
    const revision = this.documentChangeSequence
    const picker = this.filePickerWindow().showOpenFilePicker
    try {
      const handle = storedHandle ?? (picker ? (await picker.call(window, this.htmlFilePickerOptions()))[0] : null)
      const file = handle ? await handle.getFile() : picker ? null : await this.pickFileInput()
      if(!file) return
      const source = await file.text()
      if(revision !== this.documentChangeSequence) throw new Error("The document changed while opening a file. Open it again to discard those changes.")
      await this.reloadDocument(source)
      this.backendDocumentId = null
      this.fileHandle = handle
      this.storageLocation = "local"
      const openedName = file.name || handle?.name || "document.html"
      this.downloadedFileName = openedName
      this.fileName = this.baseFileName(openedName)
      this.fileFormat = this.formatForFileName(openedName)
      this.fileDirty = false
      if(handle) {
        const opened = await this.rememberOpenedDocument({id: storedId ?? crypto.randomUUID(), title: openedName, openedAt: Date.now(), kind: "local", handle})
        this.updateDocumentURL(documentOpenReference(opened))
      }
      else this.updateDocumentURL(null)
      this.focusEditor()
    }
    catch(error) {
      this.reportFileError(error)
    }
  }

  private pickFileInput(): Promise<File | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".html,.htm,text/html"
      input.hidden = true
      const finish = (file: File | null, error?: unknown) => {
        input.removeEventListener("change", change)
        input.removeEventListener("cancel", cancel)
        input.remove()
        this.cancelFileInput = undefined
        if(error !== undefined) reject(error)
        else resolve(file)
      }
      const change = () => finish(input.files?.[0] ?? null)
      const cancel = () => finish(null)
      input.addEventListener("change", change)
      input.addEventListener("cancel", cancel)
      this.cancelFileInput = cancel
      this.renderRoot.append(input)
      try {input.click()}
      catch(error) {finish(null, error)}
    })
  }

  private triggerFileDownload(source: string, name: string) {
    const url = URL.createObjectURL(new Blob([source], {type: "text/html;charset=utf-8"}))
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  private async performSaveDocument(saveAs = false, requestedFormat: FileFormat = this.fileFormat, localCopy = false) {
    try {
      let handle = saveAs || this.fileHandle && this.formatForFileName(this.fileHandle.name, requestedFormat) !== requestedFormat
        ? null : this.fileHandle
      let name = handle?.name ?? this.downloadedFileName ?? this.fileNameForFormat(requestedFormat)
      if(!handle) {
        const picker = this.filePickerWindow().showSaveFilePicker
        if(picker) {
          handle = await picker.call(window, this.htmlFilePickerOptions(this.fileNameForFormat(requestedFormat)))
          name = handle.name
        }
        else if(saveAs || !this.downloadedFileName || this.formatForFileName(this.downloadedFileName) !== requestedFormat) {
          const chosen = window.prompt("File name", this.fileNameForFormat(requestedFormat) || `document${requestedFormat === "offline" ? ".offline" : ""}.html`)
          if(chosen === null || !chosen.trim()) return
          name = chosen.trim()
          if(!/\.html?$/i.test(name)) name += requestedFormat === "offline" ? ".offline.html" : ".html"
        }
      }
      const selectedFormat = this.formatForFileName(name, requestedFormat)
      const revision = this.documentChangeSequence
      const frameRevision = this.frameRevision
      const snapshot = await this.execute({type: "prepareVersionSave", offline: selectedFormat === "offline"})
      if(!isRecord(snapshot) || typeof snapshot.source !== "string" || typeof snapshot.checkpointId !== "string") {
        throw new TypeError("The editor returned an invalid save snapshot")
      }
      const {source, checkpointId} = snapshot
      if(handle) {
        const writable = await handle.createWritable()
        await writable.write(new Blob([source], {type: "text/html;charset=utf-8"}))
        await writable.close()
      }
      else this.triggerFileDownload(source, name)
      if(frameRevision === this.frameRevision) {
        this.updateHistoryState(await this.execute({type: "recordVersionSave", checkpointId}))
      }
      this.fileHandle = handle
      this.downloadedFileName = name
      if(!localCopy) {
        this.backendDocumentId = null
        this.fileName = this.baseFileName(name)
        this.fileFormat = selectedFormat
        this.fileDirty = revision !== this.documentChangeSequence
        if(handle) {
          const saved = await this.rememberOpenedDocument({id: crypto.randomUUID(), title: handle.name, openedAt: Date.now(), kind: "local", handle})
          this.updateDocumentURL(documentOpenReference(saved))
        }
        else this.updateDocumentURL(null)
      }
    }
    catch(error) {this.reportFileError(error)}
  }

  private async openBackendDocument(id: string) {
    if(!this.backendClient || !this.confirmDiscardChanges()) return
    const revision = this.documentChangeSequence
    const client = this.backendClient
    const session = this.backendSession
    try {
      this.documentsError = ""
      const document = await client.getDocument(id)
      if(this.backendClient !== client) throw new Error("The document storage connection changed while opening the file.")
      if(revision !== this.documentChangeSequence) throw new Error("The document changed while opening a file. Open it again to discard those changes.")
      await this.reloadDocument(document.content)
      this.backendDocumentId = document.id
      this.fileHandle = null
      this.downloadedFileName = null
      this.storageLocation = "development-server"
      this.fileName = this.baseFileName(document.title)
      this.fileFormat = document.format
      this.fileDirty = false
      if(session) await this.rememberOpenedDocument({id: crypto.randomUUID(), title: document.title, openedAt: Date.now(),
        kind: "backend", documentId: document.id, apiBaseUrl: session.apiBaseUrl, userId: session.user.id})
      this.updateBackendDocumentURL(document.id, client)
      this.renderRoot.querySelector<OpenDocumentMenu>("open-document-menu")?.close()
      this.focusEditor()
    }
    catch(error) {
      this.documentsError = error instanceof Error ? error.message : String(error)
    }
  }

  private async autosaveCloudAfterBundleReload(expected: {client: BackendClient, id: string}) {
    if(!this.isConnected || !this.settings.autosaveCloudOnBundleChange || this.backendClient !== expected.client
      || this.backendDocumentId !== expected.id || this.storageLocation !== "development-server") return
    if(this.fileOperationActive) {
      this.pendingCloudBundleSave = expected
      return
    }
    await this.runFileOperation(async () => {await this.saveBackendDocument(false, this.fileFormat, expected)})
  }

  private async saveBackendDocument(saveAs = false, requestedFormat: FileFormat = this.fileFormat, expectedDocument?: {client: BackendClient, id: string}, target?: {name: string, id?: string}) {
    if(!this.backendClient) return
    const revision = this.documentChangeSequence
    const client = this.backendClient
    try {
      const frameRevision = this.frameRevision
      const snapshot = await this.execute({type: "prepareVersionSave", offline: requestedFormat === "offline"})
      if(!isRecord(snapshot) || typeof snapshot.source !== "string" || typeof snapshot.checkpointId !== "string") {
        throw new TypeError("The editor returned an invalid save snapshot")
      }
      const {source, checkpointId} = snapshot
      if(this.backendClient !== client) throw new Error("The cloud service changed while saving the document.")
      if(expectedDocument && (!this.settings.autosaveCloudOnBundleChange || this.backendClient !== expectedDocument.client
        || this.backendDocumentId !== expectedDocument.id || this.storageLocation !== "development-server")) return
      const title = target?.name ?? (this.fileName.trim() || "Untitled")
      const targetId = target?.id ?? (!saveAs ? this.backendDocumentId : null)
      const document = targetId
        ? await client.updateDocument(targetId, {title, content: source, format: requestedFormat})
        : await client.createDocument({title, content: source, format: requestedFormat})
      if(this.backendClient !== client) throw new Error("The cloud service changed while saving the document.")
      if(expectedDocument && (this.backendClient !== expectedDocument.client || this.backendDocumentId !== expectedDocument.id)) return
      if(frameRevision === this.frameRevision) {
        this.updateHistoryState(await this.execute({type: "recordVersionSave", checkpointId}))
      }
      if(this.backendClient !== client) throw new Error("The cloud service changed while saving the document.")
      this.backendDocumentId = document.id
      this.storageLocation = "development-server"
      this.fileName = this.baseFileName(document.title)
      this.fileFormat = document.format
      this.fileDirty = revision !== this.documentChangeSequence
      const {id, title: savedTitle, format, createdAt, updatedAt} = document
      this.savedDocuments = [{id, title: savedTitle, format, createdAt, updatedAt}, ...this.savedDocuments.filter(summary => summary.id !== id)]
      this.updateBackendDocumentURL(id, client)
      return true
    }
    catch(error) {
      this.reportFileError(error)
    }
  }

  private printDocument() {
    if(this.editorOpaque) this.postFrameControl("print")
    else this.editorWindow?.print()
  }

  private async saveGraphic() {
    try {
      const picker = this.filePickerWindow().showSaveFilePicker
      const handlePromise = picker?.call(window, {
        suggestedName: "graphic.svg",
        types: [{description: "SVG graphic", accept: {"image/svg+xml": [".svg"]}}],
        excludeAcceptAllOption: true,
      })
      const [source, handle] = await Promise.all([this.execute({type: "serializeGraphic"}), handlePromise])
      if(typeof source !== "string") return
      const blob = new Blob([source], {type: "image/svg+xml;charset=utf-8"})
      if(handle) {
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
      }
      else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = "graphic.svg"
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
      }
    }
    catch(error) { this.reportFileError(error) }
  }

  private downloadDocument(requestedFormat: FileFormat = this.fileFormat) {
    return this.runFileOperation(() => this.performSaveDocument(false, requestedFormat, true))
  }

  private updateHistoryState(value: unknown) {
    const message = {type: historyStateChangeEvent, detail: value}
    if(!isHistoryStateChangeMessage(message)) throw new TypeError("The editor returned invalid version history")
    this.historyState = {
      versions: message.detail.versions.map(version => ({
        ...version, user: {...version.user}, changes: {...version.changes}, checkpointIds: [...version.checkpointIds],
      })),
      checkpoints: message.detail.checkpoints.map(checkpoint => ({
        ...checkpoint,
        user: {...checkpoint.user},
        changes: {...checkpoint.changes},
      })),
      comments: message.detail.comments.map(comment => ({...comment, user: {...comment.user}})),
      preview: message.detail.preview ? {...message.detail.preview} : null,
      currentCheckpointId: message.detail.currentCheckpointId,
      currentUserId: message.detail.currentUserId,
    }
  }

  private beginHistoryOperation(documentTransition = false) {
    this.historyOperationCount++
    if(documentTransition) this.historyDocumentTransitionCount++
    this.historyLoading = true
  }

  private endHistoryOperation(documentTransition = false) {
    this.historyOperationCount = Math.max(0, this.historyOperationCount - 1)
    if(documentTransition) {
      this.historyDocumentTransitionCount = Math.max(0, this.historyDocumentTransitionCount - 1)
    }
    this.historyLoading = this.historyOperationCount > 0
  }

  private requestHistoryState = async () => {
    this.beginHistoryOperation()
    this.historyError = ""
    try {
      this.updateHistoryState(await this.execute({type: "getVersionHistory"}))
    }
    catch(error) {
      this.historyError = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.endHistoryOperation()
    }
  }

  private handleHistoryCheckpointSelect = async(event: Event) => {
    const checkpointId = (event as CustomEvent<{checkpointId?: unknown}>).detail?.checkpointId
    if(typeof checkpointId !== "string") return
    this.beginHistoryOperation(true)
    this.historyError = ""
    try {
      const state = await this.execute({type: "previewVersionCheckpoint", checkpointId})
      this.updateHistoryState(state)
      if(isRecord(state) && state.appliedQueuedChanges === true) this.fileDirty = true
    }
    catch(error) {
      this.historyError = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.endHistoryOperation(true)
    }
  }

  private handleHistoryRevert = async(event: Event) => {
    const checkpointId = (event as CustomEvent<{checkpointId?: unknown}>).detail?.checkpointId
    if(typeof checkpointId !== "string") return
    this.beginHistoryOperation(true)
    this.historyError = ""
    try {
      this.updateHistoryState(await this.execute({type: "revertVersionCheckpoint", checkpointId}))
      this.fileDirty = true
    }
    catch(error) {
      this.historyError = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.endHistoryOperation(true)
    }
  }

  private clearHistoryPreview = () => {
    this.beginHistoryOperation(true)
    this.historyError = ""
    void this.execute({type: "clearVersionPreview"})
      .then(state => {
        this.updateHistoryState(state)
        if(isRecord(state) && state.appliedQueuedChanges === true) this.fileDirty = true
      })
      .catch(() => {
        // The iframe may be reloading while the ribbon switches away.
      })
      .finally(() => {
        this.endHistoryOperation(true)
      })
  }

  private handleRibbonButtonClick = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label === "pin-snippet") {
      void this.pinSnippet()
      return
    }
    if(label?.startsWith("remove-user-snippet:")) {
      const id = label.slice("remove-user-snippet:".length)
      if(this.editingSnippetId === id) this.editingSnippetId = null
      this.settings = {...this.settings, userSnippets: this.settings.userSnippets.filter(snippet => snippet.id !== id)}
      persistAppSettings(this.settings)
      return
    }
    if(label?.startsWith("user-snippet:")) {
      const snippet = this.settings.userSnippets.find(candidate => candidate.id === label.slice("user-snippet:".length))
      if(snippet) void this.execute({type: "insert", html: snippet.html})
        .catch(error => { this.packageError = error instanceof Error ? error.message : String(error) })
        .finally(() => this.focusEditor())
      return
    }
    if(this.localPackageDraft && label?.startsWith("local-package") && label !== `local-package-select:${this.selectedLocalPackageName}`) {
      event.preventDefault()
      const action = /^(local-package-(?:remove|refresh|select)):(.+)$/.exec(label)
      const record = action && [...this.localPackageManager.records.values()].find(record => record.package.name === action[2])
      void this.resolvePendingPackageChanges().then(continueAction => {
        if(!continueAction) return
        const current = record && this.localPackageManager.records.get(record.id)
        if(record && !current) return
        this.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {
          detail: {label: current ? `${action![1]}:${current.package.name}` : label},
        }))
      })
      return
    }
    if(label === "Preview") {
      if(this.previewActive) void this.exitPreview()
      else void this.enterPreview()
      return
    }
    if(label === "New") {
      void this.newDocument()
      return
    }
    if(label === "new:document" || label === "new:canvas" || label === "new:slides") {
      void this.newDocument(label.slice("new:".length) as DocumentLayoutMode)
      return
    }
    if(label === "Open") {
      void this.openDocument()
      return
    }
    if(typeof label === "string" && label.startsWith("recent-document:")) {
      void this.openRecentDocument(decodeURIComponent(label.slice("recent-document:".length)))
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
    if(label === "download:html" || label === "download:offline") {
      void this.downloadDocument(label === "download:offline" ? "offline" : "html")
      return
    }
    if(label === "Print") {
      this.printDocument()
      return
    }
    if(label === "Upload") {
      void this.runFileOperation(() => this.performOpenDocument())
      return
    }
    if(label === "Download") {
      void this.downloadDocument()
      return
    }
    if(label === "show-developer-console") {
      void this.handleDeveloperConsoleChange(new CustomEvent("developer-console-change", {detail: {enabled: true}}))
      return
    }
    if(label === "local-package-add") {
      void this.addLocalPackage()
      return
    }
    if(label?.startsWith("local-package-refresh:")) {
      const name = label.slice("local-package-refresh:".length)
      const record = [...this.localPackageManager.records.values()].find(candidate => candidate.package.name === name)
      if(record) void this.refreshDeveloperPackage(record.id)
      return
    }
    if(label?.startsWith("local-package-remove:")) {
      void this.removeDeveloperPackage(label.slice("local-package-remove:".length))
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
    if(label?.startsWith("media-file:")) {
      const media = label.slice("media-file:".length)
      if(isMediaType(media)) void this.execute({type: "insertMedia", media, selectFile: true})
      else this.focusEditor()
      return
    }
    if(label?.startsWith("media-capture:")) {
      const mode = label.slice("media-capture:".length)
      if(isMediaCaptureMode(mode)) void this.execute({type: "captureMedia", mode})
      else this.focusEditor()
      return
    }
    if(label === "removeMarks") {
      void this.execute({type: "removeMarks"}).finally(() => this.focusEditor())
      return
    }
    if(label?.startsWith("set-document-template:")) {
      const template = label.slice("set-document-template:".length)
      if(template === "body") {
        void this.execute({type: "setDocumentTemplate", template}).finally(() => this.focusEditor())
      }
      else this.focusEditor()
      return
    }
    if(label === "toggle-section") {
      void this.execute({type: "toggleSection", section: this.sectionType}).finally(() => this.focusEditor())
      return
    }
    if(label === "section-add") {
      void this.execute({type: "addSection", section: "section"}).finally(() => this.focusEditor())
      return
    }
    if(label === "section-remove") {
      void this.execute({type: "removeSection"}).finally(() => this.focusEditor())
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
      const detail = (event as CustomEvent<{keepDrawerOpen?: boolean, apply?: boolean}>).detail
      const keepDrawerOpen = Boolean(detail?.keepDrawerOpen)
      const restoreFocus = () => { if(!keepDrawerOpen) this.focusEditor() }
      const mark = canonicalMarkName(label.slice("mark:".length))
      const group = mark ? mergedMarkGroupFor(mark) : undefined
      if(!mark) restoreFocus()
      else if(detail?.apply === true) void this.execute({type: "addMark", mark}).finally(restoreFocus)
      else if(group?.primary === mark) {
        void this.execute({type: "toggleMarkGroup", mark}).finally(restoreFocus)
      }
      else if(group) {
        void this.execute({type: "toggleMark", mark}).finally(restoreFocus)
      }
      else void this.execute({type: "toggleMark", mark}).finally(restoreFocus)
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
    if(label === "heading-group-add-before" || label === "heading-group-add-after") {
      void this.execute({
        type: "addHeadingGroupText",
        position: label.endsWith("before") ? "before" : "after",
      }).finally(() => this.focusEditor())
      return
    }
    if(label === "media-to-figure") {
      void this.execute({type: "wrapMediaInFigure"}).finally(() => this.focusEditor())
      return
    }
    if(label === "figure-caption-before" || label === "figure-caption-after") {
      void this.execute({
        type: "addFigureCaption",
        position: label.endsWith("before") ? "before" : "after",
      }).finally(() => this.focusEditor())
      return
    }
    if(label === "figure-caption-edit") {
      void this.execute({type: "editFigureCaption"}).finally(() => this.focusEditor())
      return
    }
    if(label?.startsWith("math:")) {
      void this.execute({type: "editMath", command: label.slice(5)}).finally(() => this.focusEditor())
      return
    }
    if(label?.startsWith("insert-math:")) {
      void this.execute({type: "insertMath", structure: label.slice("insert-math:".length)}).finally(() => this.focusEditor())
      return
    }
    if(label === "import-graphic") {
      void this.execute({type: "importGraphic"}).catch(error => this.reportFileError(error))
      return
    }
    if(label === "save-graphic") {
      void this.saveGraphic()
      return
    }
    if(label?.startsWith("insert-graphic-shape:")) {
      const shape = label.slice("insert-graphic-shape:".length)
      if(isGraphicShapeType(shape)) {
        void this.execute({type: "insertGraphic", shape})
          .finally(() => this.focusEditor())
      }
      else this.focusEditor()
      return
    }
    if(label?.startsWith("add-graphic-shape:")) {
      const shape = label.slice("add-graphic-shape:".length)
      if(isGraphicShapeType(shape)) void this.execute({type: "addGraphicShape", shape}).finally(() => this.focusEditor())
      else this.focusEditor()
      return
    }
    if(label?.startsWith("toggle-graphic-option:")) {
      const name = label.slice("toggle-graphic-option:".length)
      if(name === "grid" || name === "snap" || name === "guides") {
        void this.execute({type: "toggleGraphicOption", name}).finally(() => this.focusEditor())
      }
      else this.focusEditor()
      return
    }
    if(label?.startsWith("arrange-graphic:")) {
      const operation = label.slice("arrange-graphic:".length)
      if(isGraphicArrangeOperation(operation)) {
        void this.execute({type: "arrangeGraphicShapes", operation}).finally(() => this.focusEditor())
      }
      else this.focusEditor()
      return
    }
    if(label?.startsWith("navigate-graphic:")) {
      const operation = label.slice("navigate-graphic:".length)
      if(isGraphicViewportOperation(operation) && operation !== "set-zoom") {
        void this.execute({type: "navigateGraphic", operation}).finally(() => this.focusEditor())
      }
      else this.focusEditor()
      return
    }
    if(label === "insert-details") {
      void this.execute({type: "insertDetails"})
        .finally(() => this.focusEditor())
      return
    }
    const tableActions = {
      "table-row-above": {type: "insertTableRow", side: "above"},
      "table-row-below": {type: "insertTableRow", side: "below"},
      "table-column-left": {type: "insertTableColumn", side: "left"},
      "table-column-right": {type: "insertTableColumn", side: "right"},
      "table-merge-cells": {type: "mergeTableCells"},
      "table-split-cells": {type: "splitTableCells"},
      "table-split": {type: "splitTable"},
      "table-caption": {type: "toggleTableCaption"},
      "table-header": {type: "toggleTableHeader"},
      "table-footer": {type: "toggleTableFooter"},
    } as const
    if(label && Object.hasOwn(tableActions, label)) {
      void this.execute(tableActions[label as keyof typeof tableActions]).finally(() => this.focusEditor())
      return
    }

    const item = insertionMenuItems.find(candidate => candidate.name === label)
    if(!item) {
      this.focusEditor()
      return
    }

    if(item.kind === "html") {
      this.restoreEditorSelection()
      this.openEditToolbox()
      void this.setHTMLMode(true)
      return
    }
    if(!item.tag) return

    if(item.tag === "ul" || item.tag === "ol" || item.tag === "dl" || item.tag === "menu") {
      void this.execute({type: "toggleList", listType: item.tag}).finally(() => this.focusEditor())
      return
    }
    if(item.tag === "details") {
      void this.execute({type: "insertDetails"}).finally(() => this.focusEditor())
      return
    }

    if(item.tag === "table") {
      void this.execute({type: "insertTable", rows: 2, columns: 2})
        .finally(() => this.focusEditor())
      return
    }

    if(item.tag === "math") {
      void this.execute({type: "insertMath"}).finally(() => this.focusEditor())
      return
    }
    if(item.tag === "svg") {
      void this.execute({type: "insertGraphic"})
        .finally(() => this.focusEditor())
      return
    }

    if(isMediaType(item.tag)) {
      void this.execute({type: "insertMedia", media: item.tag}).finally(() => this.focusEditor())
      return
    }

    if(isBlockFormatTag(item.tag)) {
      void this.execute({type: "setBlockType", tag: item.tag}).finally(() => this.focusEditor())
      return
    }

    void this.execute({
      type: "insert",
      html: item.html ?? emptyElementHTML(item.tag),
    }).finally(() => this.focusEditor())
  }

  private selectLocalPackage(name: string) {
    const record = [...this.localPackageManager.records.values()].find(candidate => candidate.package.name === name)
    if(!record) {
      this.localPackageError = `Local package '${name}' is no longer available`
      return
    }
    this.selectedLocalPackageName = name
  }

  private get selectedLocalPackageRecord() {
    return [...this.localPackageManager.records.values()].find(candidate => candidate.package.name === this.selectedLocalPackageName)
  }

  private beginLocalPackageDraft(record: LocalPackageRecord) {
    if(record.gitSource) throw new Error("Git package contents are read-only. Edit the repository and refresh the package.")
    if(this.localPackageDraftSaving) throw new Error("Package changes are being saved")
    if(this.localPackageDraft && this.localPackageDraft.id !== record.id) throw new Error("Confirm or discard the pending package changes first")
    if(!this.localPackageDraft) {
      if(!record.package.manifest) throw new Error("The package manifest is unavailable")
      const base = structuredClone(record.package.manifest)
      this.localPackageDraft = {id: record.id, base, manifest: structuredClone(base), errors: {}}
    }
    return this.localPackageDraft
  }

  private handleLocalPackagePendingInput = () => {
    const record = this.selectedLocalPackageRecord
    if(!record) return
    try {this.beginLocalPackageDraft(record)}
    catch(error) {this.localPackageError = error instanceof Error ? error.message : String(error)}
  }

  private failLocalPackageEdit(record: LocalPackageRecord, key: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if(!record.gitSource && record.package.manifest && !this.localPackageDraftSaving && (!this.localPackageDraft || this.localPackageDraft.id === record.id)) {
      const draft = this.beginLocalPackageDraft(record)
      this.localPackageDraft = {...draft, errors: {...draft.errors, [key]: message}}
    }
    this.localPackageError = message
  }

  private updateLocalPackageManifest(
    record: LocalPackageRecord,
    update: (manifest: Record<string, unknown>) => void,
    key = "action",
  ) {
    const draft = this.beginLocalPackageDraft(record)
    const manifest = structuredClone(draft.manifest)
    update(manifest)
    const errors = {...draft.errors}
    delete errors[key]
    this.localPackageDraft = {...draft, manifest, errors}
    this.localPackageError = Object.values(errors).join("\n")
  }

  private remapLocalPackageErrors(remap: (key: string) => string | null) {
    const draft = this.localPackageDraft
    if(!draft) return
    const errors: Record<string, string> = {}
    for(const [key, message] of Object.entries(draft.errors)) {
      const nextKey = remap(key)
      if(nextKey !== null) errors[nextKey] = message
    }
    this.localPackageDraft = {...draft, errors}
    this.localPackageError = Object.values(errors).join("\n")
  }

  private discardLocalPackageChanges = () => {
    if(this.localPackageDraftSaving) return
    this.localPackageDraft = null
    this.localPackageDraftRevision++
    this.localPackageError = ""
  }

  private confirmLocalPackageChanges = async() => {
    if(this.localPackageDraftSaving) return false
    const console = this.renderRoot.querySelector("developer-console")
    if(console && !console.flushPackageInputs()) return false
    await Promise.resolve()
    const draft = this.localPackageDraft
    if(!draft) return true
    if(Object.keys(draft.errors).length) return false
    const record = this.localPackageManager.records.get(draft.id)
    if(!record) {this.localPackageError = "The edited package is no longer available"; return false}
    this.localPackageDraftSaving = true
    try {
      if([...this.localPackageManager.records.values()].some(candidate => candidate.id !== record.id && candidate.package.name === draft.manifest.name)) {
        throw new Error(`A local package named '${draft.manifest.name}' is already loaded`)
      }
      const keys = [...new Set([...Object.keys(draft.base), ...Object.keys(draft.manifest)])]
        .filter(key => JSON.stringify(draft.base[key]) !== JSON.stringify(draft.manifest[key]))
      if(keys.length) {
        const refreshed = await this.localPackageManager.updateManifest(record, manifest => {
          for(const key of keys) {
            if(JSON.stringify(manifest[key]) !== JSON.stringify(draft.base[key]) && JSON.stringify(manifest[key]) !== JSON.stringify(draft.manifest[key])) {
              throw new Error(`The package's ${key} changed in the source. Discard your pending changes and refresh before editing it again.`)
            }
            if(key in draft.manifest) manifest[key] = structuredClone(draft.manifest[key])
            else delete manifest[key]
          }
        })
        if(refreshed) this.selectLocalPackage(refreshed.package.name)
      }
      this.localPackageDraft = null
      this.localPackageDraftRevision++
      this.localPackageError = ""
      return true
    }
    catch(error) {this.localPackageError = error instanceof Error ? error.message : String(error); return false}
    finally {this.localPackageDraftSaving = false}
  }

  private resolvePendingPackageChanges() {
    if(!this.localPackageDraft) return Promise.resolve(true)
    if(this.localPackageDraftSaving) return Promise.resolve(false)
    if(this.pendingPackageDecision) return this.pendingPackageDecision
    this.pendingPackageDecision = (async () => {
      const choice = await this.renderRoot.querySelector("developer-console")?.askPendingPackageChanges()
      if(choice === "keep") return this.confirmLocalPackageChanges()
      if(choice === "discard") {this.discardLocalPackageChanges(); return true}
      return false
    })().finally(() => {this.pendingPackageDecision = null})
    return this.pendingPackageDecision
  }

  private async handleLocalPackageMetadataChange(event: Event) {
    const detail = (event as CustomEvent<{field?: string, value?: string}>).detail
    const record = this.selectedLocalPackageRecord
    if(!record || !detail?.field) return
    if(!localPackageMetadataFields.has(detail.field)) return
    try {
      const value = detail.value ?? ""
      if(detail.field === "name") {
        if(!/^@[^/\s]+\/[^/\s]+$/.test(value)) throw new Error("Package name must be scoped (for example @scope/name)")
        const duplicate = [...this.localPackageManager.records.values()].find(candidate => (
          candidate.id !== record.id && candidate.package.name === value
        ))
        if(duplicate) throw new Error(`A local package named '${value}' is already loaded`)
      }
      if(detail.field === "version" && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) {
        throw new Error("Package version must use semantic versioning")
      }
      const update = parseLocalPackageMetadata(detail.field, value)
      await this.updateLocalPackageManifest(record, manifest => {
        if(update.remove) delete manifest[detail.field!]
        else manifest[detail.field!] = update.value
      }, `metadata:${detail.field}`)
    }
    catch(error) {
      this.failLocalPackageEdit(record, `metadata:${detail.field}`, error)
    }
  }

  private handleLocalPackageKeywordChange = (event: Event) => {
    const detail = (event as CustomEvent<{operation?: string, value?: string}>).detail
    const record = this.selectedLocalPackageRecord
    if(!record || !detail || typeof detail.value !== "string" || (detail.operation !== "add" && detail.operation !== "remove")) return
    const value = detail.operation === "add" ? detail.value.trim() : detail.value
    if(!value || value === "webwriter-widget") return
    try {
      this.updateLocalPackageManifest(record, manifest => {
        const keywords = Array.isArray(manifest.keywords) ? manifest.keywords.filter((keyword): keyword is string => typeof keyword === "string") : []
        manifest.keywords = ["webwriter-widget", ...new Set([
          ...keywords.filter(keyword => keyword !== "webwriter-widget" && (detail.operation !== "remove" || keyword !== value)),
          ...(detail.operation === "add" ? [value] : []),
        ])]
      }, "metadata:keywords")
    }
    catch(error) {this.failLocalPackageEdit(record, "metadata:keywords", error)}
  }

  private handleLocalPackageEditingOptionChange = (event: Event) => {
    const detail = (event as CustomEvent<{key?: string, option?: string, value?: string}>).detail
    const record = this.selectedLocalPackageRecord
    if(!record || !detail?.key || !detail.option || typeof detail.value !== "string") return
    const {key: inputKey, option, value} = detail
    const key = editingConfigKey(inputKey)
    if(!packageEditingConfigOptions.some(candidate => candidate === option) || key === "." && option !== "label" && option !== "description") return
    const errorKey = `editing:${key}:${option}`
    try {
      let parsed: unknown = value
      const remove = !value.trim() && option !== "marks" && option !== "content"
      if(["uninsertable", "inline", "isolating", "sharedData"].includes(option)) {
        if(value !== "" && value !== "true" && value !== "false") throw new Error("Choose Default, Yes, or No")
        parsed = value === "true"
      }
      else if(option === "propagateEvents") parsed = [...new Set(value.split(/[\s,]+/).filter(Boolean))]
      else if((option === "label" || option === "description") && value.trim().startsWith("{")) {
        parsed = parsePackageMetadataJSON("Translations", value)
        if(!isRecord(parsed) || !Object.values(parsed).every(text => typeof text === "string")) throw new Error("Translations must be a JSON object of language codes and text")
      }
      this.updateLocalPackageManifest(record, manifest => {
        if(key !== "." && (!isRecord(manifest.exports) || !Object.keys(manifest.exports).some(name => editingConfigKey(name) === key))) throw new Error("Export is no longer available")
        const config = isRecord(manifest.editingConfig) ? {...manifest.editingConfig} : {}
        const entry = {...normalizeEditingConfig(config as PackageEditingConfig)[key]}
        if(remove) delete entry[option]
        else entry[option] = parsed
        for(const name of Object.keys(config)) if(editingConfigKey(name) === key) delete config[name]
        if(Object.keys(entry).length) config[key] = entry
        if(Object.keys(config).length) manifest.editingConfig = config
        else delete manifest.editingConfig
      }, errorKey)
    }
    catch(error) {this.failLocalPackageEdit(record, errorKey, error)}
  }

  private async handleLocalPackageContributorAdd() {
    if(this.renderRoot.querySelector("developer-console")?.flushPackageInputs() === false) return
    const record = this.selectedLocalPackageRecord
    if(!record) return
    try {
      await this.updateLocalPackageManifest(record, manifest => {
        const contributors = Array.isArray(manifest.contributors) ? [...manifest.contributors] : []
        contributors.push("")
        manifest.contributors = contributors
      })
    }
    catch(error) {
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  private async handleLocalPackageContributorChange(event: Event) {
    const detail = (event as CustomEvent<{index?: number, value?: string}>).detail
    const record = this.selectedLocalPackageRecord
    const {index, value: inputValue} = detail ?? {}
    if(!record || typeof index !== "number" || !Number.isInteger(index) || index < 0 || inputValue === undefined) return
    try {
      const value = inputValue.trim() ? parsePackagePerson("Contributor", inputValue) : ""
      await this.updateLocalPackageManifest(record, manifest => {
        const contributors = Array.isArray(manifest.contributors) ? [...manifest.contributors] : []
        if(index >= contributors.length) throw new Error("Contributor is no longer available")
        contributors[index] = value
        manifest.contributors = contributors
      }, `contributor:${index}`)
    }
    catch(error) {
      this.failLocalPackageEdit(record, `contributor:${index}`, error)
    }
  }

  private async handleLocalPackageContributorDelete(event: Event) {
    if(this.renderRoot.querySelector("developer-console")?.flushPackageInputs() === false) return
    const index = (event as CustomEvent<{index?: number}>).detail?.index
    const record = this.selectedLocalPackageRecord
    if(!record || typeof index !== "number" || !Number.isInteger(index) || index < 0) return
    try {
      await this.updateLocalPackageManifest(record, manifest => {
        const contributors = Array.isArray(manifest.contributors) ? [...manifest.contributors] : []
        if(index >= contributors.length) throw new Error("Contributor is no longer available")
        contributors.splice(index, 1)
        if(contributors.length) manifest.contributors = contributors
        else delete manifest.contributors
      })
      this.remapLocalPackageErrors(key => {
        if(!key.startsWith("contributor:")) return key
        const previousIndex = Number(key.slice("contributor:".length))
        return previousIndex === index ? null : `contributor:${previousIndex > index ? previousIndex - 1 : previousIndex}`
      })
    }
    catch(error) {
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  private moveLocalPackageEditingConfig(manifest: Record<string, unknown>, from: string, to?: string) {
    if(!isRecord(manifest.editingConfig)) return
    const key = editingConfigKey(from)
    const nextKey = to ? editingConfigKey(to) : undefined
    if(key === nextKey) return
    const config = {...manifest.editingConfig}
    if(!Object.keys(config).some(name => editingConfigKey(name) === key)) return
    const entries = normalizeEditingConfig(config as PackageEditingConfig)
    for(const name of Object.keys(config)) {
      if(editingConfigKey(name) === key || nextKey && editingConfigKey(name) === nextKey) delete config[name]
    }
    if(nextKey) config[nextKey] = {...entries[nextKey], ...entries[key]}
    if(Object.keys(config).length) manifest.editingConfig = config
    else delete manifest.editingConfig
  }

  private async handleLocalPackageExportChange(event: Event) {
    const detail = (event as CustomEvent<{
      exportName?: string
      field?: "type" | "name" | "source"
      value?: string
    }>).detail
    const record = this.selectedLocalPackageRecord
    if(!record || !detail?.exportName || !detail.field || detail.value === undefined) return
    const {exportName, field, value} = detail
    let renamedExport = exportName
    try {
      await this.updateLocalPackageManifest(record, manifest => {
        const exports = isRecord(manifest.exports) ? {...manifest.exports} as Record<string, PackageExportTarget> : {}
        const target = exports[exportName]
        if(!target || !isPackageExportTarget(target)) throw new Error(`Export '${exportName}' is no longer available`)
        if(field === "source") {
          normalizeLocalPackagePath(value)
          exports[exportName] = withPackageExportSource(target, value)
          if(exportName === "./custom-elements.json") manifest.customElements = value.replace(/^\.\//, "")
        }
        else {
          const descriptor = describePackageExport(exportName, target)
          const type = field === "type" ? value as WebWriterPackageExportType : descriptor.type
          if(!localPackageExportTypes.has(type)) throw new Error("Unknown package export type")
          const name = field === "name" ? value : descriptor.name
          if(!name.trim()) throw new Error("Export name cannot be empty")
          const nextName = webWriterPackageExportName(type, name)
          if(nextName !== exportName && nextName in exports) throw new Error(`Export '${nextName}' already exists`)
          delete exports[exportName]
          exports[nextName] = target
          renamedExport = nextName
          this.moveLocalPackageEditingConfig(manifest, exportName, nextName)
          if(descriptor.type === "custom-elements" && type !== "custom-elements") delete manifest.customElements
          if(type === "custom-elements" && descriptor.source) manifest.customElements = descriptor.source.replace(/^\.\//, "")
        }
        manifest.exports = exports
      }, `export:${exportName}:${field}`)
      if(renamedExport !== exportName) this.remapLocalPackageErrors(key => {
        if(key.startsWith(`export:${exportName}:`)) return `export:${renamedExport}:${key.slice(`export:${exportName}:`.length)}`
        const prefix = `editing:${editingConfigKey(exportName)}:`
        return key.startsWith(prefix) ? `editing:${editingConfigKey(renamedExport)}:${key.slice(prefix.length)}` : key
      })
    }
    catch(error) {
      this.failLocalPackageEdit(record, `export:${exportName}:${field}`, error)
    }
  }

  private async handleLocalPackageExportAdd() {
    if(this.renderRoot.querySelector("developer-console")?.flushPackageInputs() === false) return
    const record = this.selectedLocalPackageRecord
    if(!record) return
    try {
      await this.updateLocalPackageManifest(record, manifest => {
        const exports = isRecord(manifest.exports) ? {...manifest.exports} as Record<string, PackageExportTarget> : {}
        let name = "new-widget"
        let exportName = webWriterPackageExportName("widget", name)
        for(let index = 2; exportName in exports; index++) {
          name = `new-widget-${index}`
          exportName = webWriterPackageExportName("widget", name)
        }
        exports[exportName] = {
          source: defaultPackageExportSource("widget", name),
          default: `./dist/widgets/${name}.*`,
        }
        manifest.exports = exports
      })
    }
    catch(error) {
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  private async handleLocalPackageExportDelete(event: Event) {
    if(this.renderRoot.querySelector("developer-console")?.flushPackageInputs() === false) return
    const exportName = (event as CustomEvent<{exportName?: string}>).detail?.exportName
    const record = this.selectedLocalPackageRecord
    if(!record || !exportName) return
    try {
      await this.updateLocalPackageManifest(record, manifest => {
        const exports = isRecord(manifest.exports) ? {...manifest.exports} : {}
        if(!(exportName in exports)) throw new Error(`Export '${exportName}' is no longer available`)
        delete exports[exportName]
        this.moveLocalPackageEditingConfig(manifest, exportName)
        if(exportName === "./custom-elements.json") delete manifest.customElements
        manifest.exports = exports
      })
      this.remapLocalPackageErrors(key => key.startsWith(`export:${exportName}:`) || key.startsWith(`editing:${editingConfigKey(exportName)}:`) ? null : key)
    }
    catch(error) {
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  private async handleLocalPackageExportFilePick(event: Event) {
    const exportName = (event as CustomEvent<{exportName?: string}>).detail?.exportName
    const record = this.selectedLocalPackageRecord
    if(!record || !exportName || record.gitSource) return
    const picker = this.filePickerWindow().showOpenFilePicker
    const directory = record.directory as FileSystemDirectoryHandle & {
      resolve?: (possibleDescendant: FileSystemHandle) => Promise<string[] | null>
    }
    if(!picker || typeof directory.resolve !== "function") {
      this.localPackageError = "This browser cannot pick package export files"
      return
    }
    try {
      const [handle] = await picker.call(window, {id: "webwriter-package-export", startIn: directory, multiple: false})
      if(!handle) return
      const parts = await directory.resolve(handle as unknown as FileSystemHandle)
      if(!parts?.length) throw new Error("Choose a file inside the selected package folder")
      await this.handleLocalPackageExportChange(new CustomEvent("local-package-export-change", {
        detail: {exportName, field: "source", value: `./${parts.join("/")}`},
      }))
    }
    catch(error) {
      if(!isAbortError(error)) this.localPackageError = error instanceof Error ? error.message : String(error)
    }
  }

  /** Static loader warnings and runtime checks of each local package. */
  private get localPackageWarnings() {
    const warnings: Record<string, LocalPackageWarning[]> = {}
    for(const record of this.localPackageManager.records.values()) {
      const name = record.package?.name
      if(name) warnings[name] = [...record.warnings ?? [], ...this.localPackageRuntimeWarnings[name] ?? []]
    }
    return warnings
  }

  /** Checks the loaded widgets of local packages in the editor frame. */
  private async inspectLocalPackageWidgets(editorWindow: Window | null) {
    const packages = this.installedPackages.filter(pkg => [...this.localPackageManager.records.values()]
      .some(record => record.package.name === pkg.name && record.package.version === pkg.version))
    const tagNames = packages.flatMap(pkg => pkg.members.flatMap(member => member.kind === "widget" && member.tagName ? [member.tagName] : []))
    if(!tagNames.length) {
      this.localPackageRuntimeWarnings = {}
      return
    }
    const results = await this.execute({type: "inspectWidgets", tagNames}) as {tagName: string, defined: boolean, unreflected: string[]}[]
    if(this.editorWindow !== editorWindow || !Array.isArray(results)) return
    this.localPackageRuntimeWarnings = Object.fromEntries(packages.map(pkg => [pkg.name, results.flatMap((result): LocalPackageWarning[] => {
      if(!pkg.members.some(member => member.tagName === result.tagName)) return []
      if(!result.defined) return [{code: "undefined-widget" as const, path: result.tagName,
        message: `Widget '${result.tagName}' was not defined by its script.`}]
      return result.unreflected.map(name => ({code: "unreflected-property" as const, path: result.tagName,
        message: `Widget '${result.tagName}': property '${name}' does not reflect to its attribute, so changes to it are not saved.`}))
    })]))
  }

  private handleLocalPackageTestRun = async (event: Event) => {
    const testName = (event as CustomEvent<{name?: unknown}>).detail?.name
    const pkg = this.localPackages.find(candidate => candidate.name === this.selectedLocalPackageName) ?? this.localPackages[0]
    const test = pkg?.tests?.find(candidate => candidate.name === testName)
    if(!pkg || !test) return
    const key = `${pkg.name}/${test.name}`
    if(this.localPackageTestResults[key] === "running") return
    this.localPackageTestResults = {...this.localPackageTestResults, [key]: "running"}
    const frameURL = (url: string) => this.editorOpaque ? frameLocalPackageURL(url, window.location.origin, editorFrameOrigin()) : url
    let result: PackageTestResult
    try {
      result = await this.execute({
        type: "runPackageTest",
        scriptUrl: frameURL(test.scriptUrl),
        ...(test.styleUrl ? {styleUrl: frameURL(test.styleUrl)} : {}),
      }, {timeout: packageTestTimeout + 5_000}) as PackageTestResult
    }
    catch(error) {
      result = {status: "error", tests: [], error: error instanceof Error ? error.message : String(error)}
    }
    this.localPackageTestResults = {...this.localPackageTestResults, [key]: result}
  }

  private handleRibbonPreviewExit = () => {
    void this.exitPreview()
  }

  private handleLiveLearnerToggle = (event: Event) => {
    const {id, enabled} = (event as CustomEvent<{id?: unknown, enabled?: unknown}>).detail ?? {}
    if(typeof id !== "string" || typeof enabled !== "boolean" || !this.liveLearnerVisibility.has(id)) return
    this.liveLearnerVisibility.set(id, enabled)
    this.liveLearners = this.liveLearners.map(learner => learner.id === id ? {...learner, enabled} : learner)
    if(!enabled) {
      for(const [path, learnerId] of this.liveSelectedWidgetLearners) {
        if(learnerId !== id) continue
        this.liveSelectedWidgetLearners.delete(path)
        this.applyLiveWidgetState(path, null)
      }
    }
    this.updateLiveVisualization()
  }

  private async refreshDeveloperPackage(id: string) {
    this.localPackagesLoading = true
    const selected = this.selectedLocalPackageRecord?.id === id
    try {
      await this.localPackageManager.refresh(id, true)
      const record = this.localPackageManager.records.get(id)
      if(selected && record) this.selectLocalPackage(record.package.name)
    }
    finally {this.localPackagesLoading = false}
  }

  private async removeDeveloperPackage(name: string) {
    if(this.localPackagesLoading) return
    if(this.localPackageDraft && !await this.resolvePendingPackageChanges()) return
    const record = [...this.localPackageManager.records.values()].find(candidate => candidate.package.name === name)
    if(!record) return
    this.localPackagesLoading = true
    this.localPackageError = ""
    const enabled = record.enabled
    record.enabled = false
    try {
      if(this.installedPackages.some(pkg => pkg.name === name)) {
        await this.reloadEditor(this.installedPackages.filter(pkg => pkg.name !== name))
      }
      await this.localPackageManager.remove(record.id)
      this.packages = this.packages.filter(pkg => pkg.name !== name || !pkg.developerSource)
      if(this.selectedLocalPackageName === name) this.selectedLocalPackageName = this.localPackages[0]?.name ?? ""
      this.localPackageRuntimeWarnings = Object.fromEntries(Object.entries(this.localPackageRuntimeWarnings).filter(([key]) => key !== name))
      this.localPackageTestResults = Object.fromEntries(Object.entries(this.localPackageTestResults).filter(([key]) => !key.startsWith(`${name}/`)))
    }
    catch(error) {
      record.enabled = enabled
      this.localPackageError = error instanceof Error ? error.message : String(error)
    }
    finally {this.localPackagesLoading = false}
  }

  private handleGitPackageLoad = async (event: Event) => {
    if(this.localPackageDraft && !await this.resolvePendingPackageChanges()) return
    const source = (event as CustomEvent<GitPackageSource>).detail
    this.localPackagesLoading = true
    this.localPackageError = ""
    try {await this.localPackageManager.loadGit(source)}
    catch(error) {this.localPackageError = error instanceof Error ? error.message : String(error)}
    finally {this.localPackagesLoading = false}
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
      // require it to run within the Load button's user activation.
      const directory = await picker.call(window, {id: "webwriter-develop-package", mode: "readwrite"})
      await this.localPackageManager.load(directory)
    }
    catch(error) {
      if(!isAbortError(error)) this.localPackageError = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.localPackagesLoading = false
    }
  }

  private async pinSnippet() {
    this.packageError = ""
    try {
      const snippet = await this.execute({type: "getSnippet"})
      if(!snippet || typeof snippet !== "object" || !("html" in snippet) || typeof snippet.html !== "string"
        || !("label" in snippet) || typeof snippet.label !== "string" || !snippet.html) return
      if(this.settings.userSnippets.some(saved => saved.html === snippet.html)) return
      const id = crypto.randomUUID()
      this.editingSnippetId = id
      this.settings = {...this.settings, userSnippets: [{id, label: snippet.label.slice(0, SNIPPET_LABEL_MAX_LENGTH), html: snippet.html},
        ...this.settings.userSnippets]}
      persistAppSettings(this.settings)
    }
    catch(error) { this.packageError = error instanceof Error ? error.message : String(error) }
    finally { if(!this.editingSnippetId) this.focusEditor() }
  }

  private handleSnippetNameChange(event: CustomEvent<{action: string, label: string}>) {
    const {action, label} = event.detail
    if(!action.startsWith("user-snippet:") || typeof label !== "string") return
    const id = action.slice("user-snippet:".length)
    if(!this.settings.userSnippets.some(snippet => snippet.id === id)) return
    this.ribbonInputSession = false
    this.restoreEditorAfterRibbonInput = false
    if(this.editingSnippetId === id) this.editingSnippetId = null
    this.settings = {...this.settings, userSnippets: this.settings.userSnippets.map(snippet =>
      snippet.id === id ? {...snippet, label: (label.trim() || snippet.label).slice(0, SNIPPET_LABEL_MAX_LENGTH)} : snippet,
    )}
    persistAppSettings(this.settings)
  }

  /** Snippets are translated to the document language, else the UI's. */
  private get documentLanguage() {
    return this.documentHead.language || navigator.language || "en"
  }

  private async insertPackageMember(member: PackageMember, position?: RibbonDropPosition) {
    this.packageError = ""
    try {
      const html = member.kind === "snippet"
        ? await this.packageRegistry.fetchSnippet(member, this.documentLanguage)
        : member.tagName ? `<${member.tagName}></${member.tagName}>` : ""
      if(!html) throw new Error(`Package member '${member.label}' has no insertable content`)
      await this.execute(position ? {type: "insertRibbonDrop", html, position} : {type: "insert", html})
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
      if(!installed && [...this.localPackageManager.records.values()].some(record => record.package.name === pkg.name)) {
        await this.removeDeveloperPackage(pkg.name)
        return undefined
      }
      const localPackage = this.localPackages.find(candidate => candidate.name === pkg.name)
      const resolvedPackage = installed ? localPackage ?? await this.packageRegistry.getPackage(pkg) : pkg
      const nextPackages = installed
        ? [...this.installedPackages.filter(candidate => candidate.name !== pkg.name), resolvedPackage]
        : this.installedPackages.filter(candidate => candidate.name !== pkg.name)
      await this.reloadEditor(nextPackages)
      const localRecord = [...this.localPackageManager.records.values()].find(candidate => candidate.package.name === pkg.name)
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

  private async installAndInsertPackage(pkg: WebWriterPackage, requestedMember?: PackageMember, position?: RibbonDropPosition) {
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
    if(position) await this.insertPackageMember(member, position)
    else await this.insertPackageMember(member)
  }

  private async insertRibbonDropAction(action: string, position: RibbonDropPosition) {
    try {
      if(action.startsWith("user-snippet:")) {
        const snippet = this.settings.userSnippets.find(candidate => `user-snippet:${candidate.id}` === action)
        if(snippet) await this.execute({type: "insertRibbonDrop", html: snippet.html, position})
        return
      }
      const packages = [...this.installedPackages, ...this.localPackages, ...this.packages]
      const pkg = packages.find(candidate => action.startsWith("package-member:")
        ? candidate.members.some(member => packageMemberAction(member) === action && member.insertable)
        : `package:${candidate.name}` === action)
      if(!pkg) return
      const member = action.startsWith("package-member:") ? pkg.members.find(candidate => packageMemberAction(candidate) === action) : undefined
      await this.installAndInsertPackage(pkg, member, position)
    }
    catch(error) { this.packageError = error instanceof Error ? error.message : String(error) }
    finally { this.focusEditor() }
  }

  private async reloadEditor(nextPackages: WebWriterPackage[]) {
    if(!this.frameStarted) {
      this.installedPackages = nextPackages
      this.persistInstalledPackages()
      return
    }
    this.aiDocumentedPackages.clear()
    await this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.cancelAIWork()
    const snapshot = await this.execute({type: "snapshotState"}) as EditorStateSnapshot
    if(!snapshot || !Array.isArray(snapshot.update)) throw new TypeError("The editor returned an invalid state snapshot")
    const shouldRefocus = this.isEditorFocused() || this.savedEditorSelection !== null
    const reloadError = new Error("The editor iframe was reloaded for a package change")
    this.editorReadyPromise?.catch(() => {})
    this.editorReadyReject?.(reloadError)

    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    if(!this.editorOpaque) this.editorWindow?.removeEventListener(aiEditReviewEvent, this.handleInlineAIEditReview)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("pointerdown", this.handleEditorPointerDown, true)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    this.editorDocument = null
    this.editorWindow = null
    this.packageLoadPromise = null
    this.editorReadyPromise = null
    this.editorReadyResolve = null
    this.editorReadyReject = null
    this.savedEditorSelection = null
    this.pendingExecutions.forEach(({reject, timer, abortCleanup}) => {
      clearTimeout(timer)
      abortCleanup?.()
      reject(reloadError)
    })
    this.pendingExecutions.clear()
    this.frameState = snapshot
    this.installedPackages = nextPackages
    this.persistInstalledPackages()
    this.frameRevision++
    await this.updateComplete
    await this.waitForEditorWindow()
    if(shouldRefocus) this.focusEditor()
  }

  private refreshPackageDependencies() {
    this.dependencyRefreshPromise = this.dependencyRefreshPromise.then(() => this.checkPackageDependencies())
    return this.dependencyRefreshPromise
  }

  /** Drop requests bound to a replaced child realm while preserving the live
   * document snapshot and host-owned document/file metadata. */
  private resetEditorFrameForShellRestart() {
    const reloadError = new Error("The editor iframe was reloaded")
    this.editorReadyPromise?.catch(() => {})
    this.editorReadyReject?.(reloadError)
    this.editorReadyPromise = null
    this.editorReadyResolve = null
    this.editorReadyReject = null
    for(const pending of this.frameRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(reloadError)
    }
    this.frameRequests.clear()
    this.pendingExecutions.forEach(({reject, timer, abortCleanup}) => {
      if(timer !== undefined) clearTimeout(timer)
      abortCleanup?.()
      reject(reloadError)
    })
    this.pendingExecutions.clear()
    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    if(!this.editorOpaque) this.editorWindow?.removeEventListener(aiEditReviewEvent, this.handleInlineAIEditReview)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("pointerdown", this.handleEditorPointerDown, true)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    this.editorDocument?.removeEventListener("keydown", this.handleConfiguredShortcut, true)
    this.clearMotionStylesheet()
    this.editorDocument = null
    this.editorWindow = null
    this.packageLoadPromise = null
    this.savedEditorSelection = null
    this.frameState = undefined
    this.documentTree = null
    this.editorInitializedRevision = -1
  }

  private async checkPackageDependencies() {
    if(!packageModuleEntries(this.installedPackages).length) return
    let previousMap = this.packageImportMap
    let previousKey = this.packageImportMapPackageSetKey
    let applied = false
    try {
      const packages = [...this.installedPackages]
      const packageSetKey = this.packageSetKey(packages)
      const plan = await resolvePackageDependencies(packages, document.baseURI)
      if(this.packageSetKey(this.installedPackages) !== packageSetKey) return
      if(this.packageImportMapPackageSetKey === packageSetKey
        && JSON.stringify(this.packageImportMap) === JSON.stringify(plan.map)) return
      if(this.frameStarted && this.isConnected) await this.waitForEditorWindow()
      if(this.packageSetKey(this.installedPackages) !== packageSetKey) return
      if(this.packageImportMapPackageSetKey === packageSetKey
        && JSON.stringify(this.packageImportMap) === JSON.stringify(plan.map)) return
      previousMap = this.packageImportMap
      previousKey = this.packageImportMapPackageSetKey
      this.packageImportMap = plan.map
      this.packageImportMapPackageSetKey = packageSetKey
      applied = true
      if(this.isConnected) await this.reloadEditor(packages)
      this.persistPackageImportMap()
    }
    catch(error) {
      if(applied) {
        this.packageImportMap = previousMap
        this.packageImportMapPackageSetKey = previousKey
      }
      console.warn("Could not refresh package dependencies", error)
    }
  }

  private async loadPackageCatalog(event?: Event) {
    const refresh = (event as CustomEvent<{refresh?: boolean}> | undefined)?.detail?.refresh === true
    if(this.packagesLoading || this.packageCatalogRequested && !refresh) return
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
      await this.refreshPackageDependencies()
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
      const locale = document.documentElement.lang || navigator.language || "en"
      this.installedPackages = stored.filter(isStoredPackage).map(pkg => refreshPackageLabels(pkg, locale))
      const storedMap = globalThis.localStorage?.getItem(INSTALLED_PACKAGE_IMPORT_MAP_STORAGE_KEY)
      if(storedMap) {
        const saved: unknown = JSON.parse(storedMap)
        if(isRecord(saved) && saved.packageSet === this.packageSetKey(this.installedPackages)
          && isPackageImportMap(saved.map)) {
          this.packageImportMap = saved.map
          this.packageImportMapPackageSetKey = saved.packageSet
        }
      }
    }
    catch {
      // A malformed or unavailable local-storage entry should not prevent the
      // editor from mounting with an empty in-memory package list.
    }
  }

  private packageSetKey(packages: WebWriterPackage[]) {
    return JSON.stringify(packages.map(pkg => [pkg.name, pkg.version, ...pkg.scripts]).sort((a, b) => a[0].localeCompare(b[0])))
  }

  private persistPackageImportMap() {
    if(!this.packageImportMap || this.installedPackages.some(isLocalResourcePackage)) return
    try {
      globalThis.localStorage?.setItem(INSTALLED_PACKAGE_IMPORT_MAP_STORAGE_KEY, JSON.stringify({
        packageSet: this.packageSetKey(this.installedPackages), map: this.packageImportMap,
      }))
    }
    catch { /* Storage is optional; the current editor retains the resolution. */ }
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
      || typeof detail.value !== "string" && detail.value !== null) {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setMarkAttribute",
      mark,
      attribute: detail.attribute,
      value: detail.value,
    }).finally(() => {
      if(mark !== "a") this.focusEditor()
    })
  }

  private handleRubyAction = (event: Event) => {
    const detail = (event as CustomEvent<{
      action?: unknown
      annotation?: unknown
      fallback?: unknown
      index?: unknown
      expected?: unknown
      value?: unknown
    }>).detail
    if(detail?.action === "create" && typeof detail.annotation === "string" && typeof detail.fallback === "boolean") {
      void this.execute({type: "createRuby", annotation: detail.annotation, fallback: detail.fallback})
      return
    }
    if(detail?.action === "add-annotation" && typeof detail.value === "string") {
      void this.execute({type: "addRubyAnnotation", value: detail.value})
      return
    }
    const guardedComponent = Number.isInteger(detail?.index) && (detail.index as number) >= 0
      && typeof detail?.expected === "string"
    if(detail?.action === "set-annotation" && guardedComponent && typeof detail.value === "string") {
      void this.execute({
        type: "setRubyAnnotation",
        index: detail.index as number,
        expected: detail.expected as string,
        value: detail.value,
      })
      return
    }
    if(detail?.action === "remove-annotation" && guardedComponent) {
      void this.execute({
        type: "removeRubyAnnotation", index: detail.index as number, expected: detail.expected as string,
      })
      return
    }
    if(detail?.action === "set-fallback" && guardedComponent && typeof detail.value === "string") {
      void this.execute({
        type: "setRubyFallback",
        index: detail.index as number,
        expected: detail.expected as string,
        value: detail.value,
      })
      return
    }
    if(detail?.action === "add-fallback") {
      void this.execute({type: "addRubyFallback"})
      return
    }
    if(detail?.action === "remove-fallback") {
      void this.execute({type: "removeRubyFallback"})
      return
    }
    if(detail?.action === "remove-ruby") {
      void this.execute({type: "removeRuby"})
      return
    }
    this.focusEditor()
  }

  private handleListAttributeChange = (event: Event) => {
    const detail = (event as CustomEvent<{name?: unknown, value?: unknown}>).detail
    if(!detail || !["start", "reversed", "type", "value"].includes(String(detail.name))
      || detail.value !== null && typeof detail.value !== "string") {
      this.focusEditor()
      return
    }
    if(detail.name === "value") {
      void this.execute({type: "setOrderedListItemValue", value: detail.value}).finally(() => this.focusEditor())
      return
    }
    void this.execute({
      type: "setOrderedListAttribute",
      name: detail.name as "start" | "reversed" | "type",
      value: detail.value,
    }).finally(() => this.focusEditor())
  }


  private handleHeadingGroupLevelChange = (event: Event) => {
    const level = (event as CustomEvent<{level?: unknown}>).detail?.level
    if(typeof level !== "string" || !/^h[1-6]$/.test(level)) {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setHeadingGroupLevel",
      level: level as HeadingGroupSelectionState["heading"],
    }).finally(() => this.focusEditor())
  }

  private handleSectionTypeChange = (event: Event) => {
    const section = (event as CustomEvent<{section?: unknown}>).detail?.section
    if(!isSectionName(section)) {
      this.focusEditor()
      return
    }
    void this.execute({type: "setSectionType", section}).finally(() => this.focusEditor())
  }

  private handleCommentAction = (event: Event) => {
    const detail = (event as CustomEvent<{action?: unknown, text?: unknown, enabled?: unknown}>).detail
    if(!detail || typeof detail.action !== "string") return
    const action = detail.action === "toggle" && typeof detail.text === "string"
      ? {type: "toggleComment", text: detail.text} as const
      : detail.action === "set-text" && typeof detail.text === "string"
        ? {type: "setCommentText", text: detail.text} as const
        : detail.action === "remove-all"
          ? {type: "removeAllComments"} as const
          : detail.action === "previous"
            ? {type: "previousComment"} as const
            : detail.action === "next"
              ? {type: "nextComment"} as const
              : detail.action === "highlight" && typeof detail.enabled === "boolean"
                ? {type: "setCommentHighlighting", enabled: detail.enabled} as const
              : null
    if(!action) return
    void this.execute(action).finally(() => {
      if(detail.action !== "set-text" && detail.action !== "highlight") this.focusEditor()
    })
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

  private handleMediaResourceAction = (event: Event) => {
    const detail = (event as CustomEvent<{
      type?: unknown
      action?: unknown
      resource?: unknown
      index?: unknown
      expected?: unknown
      attribute?: unknown
      value?: unknown
      direction?: unknown
      html?: unknown
      expectedHTML?: unknown
    }>).detail
    if((detail?.type !== "audio" && detail?.type !== "video") || typeof detail.action !== "string") {
      this.focusEditor()
      return
    }
    if(detail.action === "set-fallback") {
      if(typeof detail.html !== "string" || typeof detail.expectedHTML !== "string") {
        this.focusEditor()
        return
      }
      void this.execute({type: "setTimedMediaFallbackHTML", html: detail.html, expected: detail.expectedHTML})
      return
    }
    if(!isTimedMediaResourceType(detail.resource)) {
      this.focusEditor()
      return
    }
    if(detail.action === "add") {
      void this.execute({type: "addTimedMediaResource", resource: detail.resource})
      return
    }
    const expectedIsValid = !!detail.expected
      && typeof detail.expected === "object"
      && !Array.isArray(detail.expected)
      && Object.entries(detail.expected).every(([name, value]) => Boolean(name) && typeof value === "string")
    if(!Number.isInteger(detail.index) || (detail.index as number) < 0 || !expectedIsValid) {
      this.focusEditor()
      return
    }
    const index = detail.index as number
    const expected = detail.expected as Record<string, string>
    if(detail.action === "remove") {
      void this.execute({type: "removeTimedMediaResource", resource: detail.resource, index, expected})
      return
    }
    if(detail.action === "move" && (detail.direction === -1 || detail.direction === 1)) {
      void this.execute({
        type: "moveTimedMediaResource",
        resource: detail.resource,
        index,
        expected,
        direction: detail.direction,
      })
      return
    }
    if(detail.action === "set-attribute"
      && typeof detail.attribute === "string"
      && timedMediaResourceAttributeOptions[detail.resource].some(option => option.name === detail.attribute)
      && (detail.value === null || typeof detail.value === "string")) {
      void this.execute({
        type: "setTimedMediaResourceAttribute",
        resource: detail.resource,
        index,
        expected,
        name: detail.attribute,
        value: detail.value,
      })
      return
    }
    this.focusEditor()
  }

  private handleImageMapAction = (event: Event) => {
    const detail = (event as CustomEvent<{
      type?: unknown
      action?: unknown
      shape?: unknown
      path?: unknown
      expected?: unknown
      attribute?: unknown
      value?: unknown
    }>).detail
    if((detail?.type !== "picture" && detail?.type !== "img") || typeof detail.action !== "string") {
      this.focusEditor()
      return
    }
    if(detail.action === "add-map") {
      void this.execute({type: "addImageMap"})
      return
    }
    if(detail.action === "remove-map") {
      void this.execute({type: "removeImageMap"})
      return
    }
    if(detail.action === "draw" && isImageMapHotspotShape(detail.shape)) {
      void this.execute({type: "startImageMapDrawing", shape: detail.shape})
      return
    }
    const pathIsValid = Array.isArray(detail.path)
      && detail.path.every(index => Number.isInteger(index) && index >= 0)
    const expectedIsValid = !!detail.expected
      && typeof detail.expected === "object"
      && !Array.isArray(detail.expected)
      && Object.entries(detail.expected).every(([name, value]) => Boolean(name) && typeof value === "string")
    if(!pathIsValid || !expectedIsValid) {
      this.focusEditor()
      return
    }
    const path = detail.path as number[]
    const expected = detail.expected as Record<string, string>
    if(detail.action === "remove-area") {
      void this.execute({type: "removeImageMapArea", path, expected})
      return
    }
    if(detail.action === "set-area-attribute"
      && typeof detail.attribute === "string"
      && imageMapAreaAttributeOptions.some(option => option.name === detail.attribute)
      && (detail.value === null || typeof detail.value === "string")) {
      void this.execute({
        type: "setImageMapAreaAttribute",
        path,
        expected,
        name: detail.attribute,
        value: detail.value,
      })
      return
    }
    this.focusEditor()
  }

  private handleElementAttributeChange = (event: Event) => {
    const detail = (event as CustomEvent<{
      path?: unknown
      localName?: unknown
      namespaceURI?: unknown
      name?: unknown
      previousName?: unknown
      value?: unknown
    }>).detail
    const pathIsValid = detail?.path === null || Array.isArray(detail?.path)
      && detail.path.every(index => Number.isInteger(index) && index >= 0)
    if(!pathIsValid
      || typeof detail?.localName !== "string"
      || detail.namespaceURI !== null && typeof detail.namespaceURI !== "string"
      || typeof detail.name !== "string"
      || detail.previousName !== undefined && typeof detail.previousName !== "string"
      || detail.value !== null && typeof detail.value !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setElementAttribute",
      path: detail.path as number[] | null,
      localName: detail.localName,
      namespaceURI: detail.namespaceURI,
      name: detail.name,
      ...(detail.previousName ? {previousName: detail.previousName} : {}),
      value: detail.value,
    })
  }

  private handleWidgetOptionChange = (event: Event) => {
    const detail = (event as CustomEvent<{name?: unknown, value?: unknown}>).detail
    const widget = this.widgetOptions
    if(!widget || typeof detail?.name !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setWidgetOption",
      path: [...widget.path],
      localName: widget.localName,
      name: detail.name,
      value: widgetOptionValue(detail.value),
    })
  }

  private handleWidgetSharingChange = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if(!detail || !Array.isArray(detail.path) || typeof detail.localName !== "string" || typeof detail.widgetId !== "string") return
    void this.execute({type: "setWidgetSharing", path: detail.path, localName: detail.localName, widgetId: detail.widgetId, enabled: detail.enabled === true})
  }

  private handleWidgetGroupingChange = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if(!detail || !Array.isArray(detail.path) || typeof detail.localName !== "string" || typeof detail.widgetId !== "string") return
    void this.execute({type: "setWidgetGrouping", path: detail.path, localName: detail.localName, widgetId: detail.widgetId, grouping: detail.grouping})
  }

  private handleWidgetGroupingContext = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if(!detail || typeof detail.resolve !== "function" || typeof detail.reject !== "function") return
    void this.execute({type: "readWidgetGroupingContext", path: detail.path, localName: detail.localName, widgetId: detail.widgetId})
      .then(detail.resolve, detail.reject)
  }

  private handleWidgetAction = (event: Event) => {
    const name = (event as CustomEvent<{name?: unknown}>).detail?.name
    const widget = this.widgetOptions
    if(!widget || typeof name !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({type: "runWidgetAction", path: [...widget.path], localName: widget.localName, name})
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

  private handleDialogAttributeChange = (event: Event) => {
    const detail = (event as CustomEvent<{attribute?: unknown, value?: unknown}>).detail
    if(typeof detail?.attribute !== "string"
      || !["id", "open", "closedby", "aria-label", "aria-labelledby", "title"].includes(detail.attribute)
      || detail.value !== null && typeof detail.value !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setDialogAttribute",
      name: detail.attribute,
      value: detail.value,
    })
  }

  private handleTableInsert = (event: Event) => {
    const detail = (event as CustomEvent<{rows?: unknown, columns?: unknown}>).detail
    if(!Number.isInteger(detail?.rows) || !Number.isInteger(detail?.columns)) {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "insertTable",
      rows: detail.rows as number,
      columns: detail.columns as number,
    }).finally(() => this.focusEditor())
  }

  private handleLayoutAction = (event: Event) => {
    const action = (event as CustomEvent<LayoutEditorAction>).detail
    if(!action || !["setLayoutStyles", "insertLayoutTrack", "removeLayoutTrack", "setLayoutTrackSize"].includes(action.type)) return
    this.layoutError = ""
    void this.execute(action).then(changed => {
      if(changed === false) this.layoutError = "The layout changed or this operation is unavailable. Select the layout again."
    }).catch(error => { this.layoutError = error instanceof Error ? error.message : String(error) })
  }

  private openEditToolbox() {
    if(!this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.expanded) return
    this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")?.selectTool("Edit")
  }

  private async refreshHTMLSource() {
    if(!this.htmlMode || this.htmlPending) return
    const sequence = ++this.htmlSourceRefreshSequence
    try {
      const path = this.selectionPath.at(-1)?.path
      const result = await this.execute({
        type: "beginHTMLSelectionEdit",
        ...(path ? {path: [...path]} : {}),
      }) as {html?: unknown}
      if(sequence !== this.htmlSourceRefreshSequence || !this.htmlMode || this.htmlPending) return
      if(typeof result?.html !== "string") throw new TypeError("The editor did not return selected HTML")
      this.htmlSource = indentHTMLSource(result.html)
      this.htmlOriginalSource = this.htmlSource
      this.htmlSourceError = ""
      this.syncHTMLSourceHover(true)
    }
    catch(error) {
      if(sequence !== this.htmlSourceRefreshSequence || !this.htmlMode) return
      this.htmlSourceError = error instanceof Error ? error.message : String(error)
    }
  }

  private queueHTMLSourceRefresh() {
    if(this.htmlSourceRefreshQueued || !this.htmlMode || this.htmlPending) return
    this.htmlSourceRefreshQueued = true
    queueMicrotask(() => {
      this.htmlSourceRefreshQueued = false
      void this.refreshHTMLSource()
    })
  }

  private async setHTMLMode(enabled: boolean) {
    if(enabled === this.htmlMode) return
    if(!enabled && this.htmlPending) return
    const sequence = ++this.htmlSourceRefreshSequence
    if(!enabled) {
      this.htmlMode = false
      this.htmlSourceHovered = this.htmlSourceFocused = this.htmlSourceHighlightActive = false
      try {
        await this.execute({type: "discardHTMLSelectionEdit"})
      }
      catch {
        // The iframe may have replaced a clean source session after a remote
        // selection change; leaving the visual mode must still succeed.
      }
      if(sequence !== this.htmlSourceRefreshSequence) return
      if(this.consoleTab === "HTML") this.consoleOpen = false
      // Keep the source visible while the HTML view collapses; it is reset
      // when the view opens again.
      this.htmlOriginalSource = ""
      this.htmlSourceError = ""
      return
    }
    this.consoleOpen = true
    this.documentLayoutsDismissed = true
    this.consoleTab = "HTML"
    this.htmlMode = true
    this.htmlSource = ""
    this.htmlOriginalSource = ""
    this.htmlSourceError = ""
    await this.refreshHTMLSource()
  }

  private handleDeveloperConsoleChange = async(event: Event) => {
    const enabled = (event as CustomEvent<{enabled?: unknown}>).detail?.enabled
    if(typeof enabled !== "boolean" || this.htmlPending) return
    if(!enabled && this.localPackageDraft && !await this.resolvePendingPackageChanges()) return
    this.consoleOpen = enabled
    if(enabled) {
      this.documentLayoutsDismissed = true
      this.selectWidgetElementPackage()
    }
    void this.setHTMLMode(enabled && this.consoleTab === "HTML")
  }

  private handleDeveloperConsolePinChange = (event: Event) => {
    const pinned = (event as CustomEvent<{pinned?: unknown}>).detail?.pinned
    if(typeof pinned !== "boolean") return
    const settings = {...this.settings, pinDeveloperConsole: pinned}
    persistAppSettings(settings)
    this.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: settings}))
  }

  private handleDeveloperConsoleAutoReloadChange = (event: Event) => {
    const enabled = (event as CustomEvent<{enabled?: unknown}>).detail?.enabled
    if(typeof enabled !== "boolean") return
    const settings = {...this.settings, autoReloadPackages: enabled}
    persistAppSettings(settings)
    this.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: settings}))
  }

  private selectWidgetElementPackage() {
    const widget = this.widgetOptions
    if(!this.consoleOpen || this.consoleTab !== "Element" || !widget) return
    const pkg = this.localPackages.find(pkg => pkg.members.some(member => member.kind === "widget" && member.tagName === widget.localName))
    if(pkg) this.selectedLocalPackageName = pkg.name
  }

  private handleDeveloperConsoleTabChange = (event: Event) => {
    const tab = (event as CustomEvent<{tab?: unknown}>).detail?.tab
    if((tab !== "HTML" && tab !== "Packages" && tab !== "Tests" && tab !== "Element") || this.htmlPending) {
      event.preventDefault()
      return
    }
    if(this.localPackageDraft && tab !== this.consoleTab) {
      event.preventDefault()
      void this.resolvePendingPackageChanges().then(continueAction => {
        if(continueAction) this.handleDeveloperConsoleTabChange(new CustomEvent("developer-console-tab-change", {detail: {tab}}))
      })
      return
    }
    this.consoleTab = tab
    this.selectWidgetElementPackage()
    void this.setHTMLMode(tab === "HTML")
  }

  private handleAIToolboxChange = (event: CustomEvent<{open: boolean}>) => {
    this.aiToolboxOpen = event.detail.open
    const toolbox = this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")
    if(event.detail.open) toolbox?.selectTool("AI")
    else if(toolbox?.activeTool === "AI") toolbox.selectTool(null)
  }

  private handleToolboxChange = (event: Event) => {
    const tool = (event as CustomEvent<{tool?: unknown}>).detail?.tool
    this.aiToolboxOpen = tool === "AI"
    const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
    if(ribbon) ribbon.aiChatOpen = this.aiToolboxOpen
    if(tool !== "Edit" && !this.htmlPending && !this.settings.pinDeveloperConsole) {
      void this.handleDeveloperConsoleChange(new CustomEvent("developer-console-change", {detail: {enabled: false}}))
    }
  }

  private handleDocumentLayoutChange = (event: Event) => {
    const mode = (event as CustomEvent<{mode?: unknown}>).detail?.mode
    if((mode !== "canvas" && mode !== "document" && mode !== "slides") || mode === this.documentLayout.mode) return
    const currentMode = this.documentLayout.mode as "document" | "canvas" | "slides"
    const fresh = this.isFreshDocumentUnchanged()
    const initialSnapshot = fresh ? this.authoredDocumentSnapshot() : null
    const revision = this.frameRevision
    this.documentLayoutError = ""
    this.documentLayoutConversionCount++
    void this.execute({type: "setDocumentLayout", mode, expectedMode: currentMode}).then(async changed => {
      if(revision !== this.frameRevision) return
      if(changed === false) {
        this.documentLayoutError = "The document layout changed before conversion could be applied. Try again."
        return
      }
      if(fresh && this.fileHandle === null && this.backendDocumentId === null) {
        await this.retainFreshDocumentLayout(revision, initialSnapshot)
      }
      else this.fileDirty = true
      // Finish disabling the selected card and updating the toolbox before
      // handing keyboard focus back to the editing surface.
      await this.updateComplete
      await this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")?.updateComplete
      if(!this.isConnected) return
      this.focusEditor()
    }).catch(error => {
      this.documentLayoutError = error instanceof Error ? error.message : String(error)
    }).finally(() => {
      this.documentLayoutConversionCount--
      if(revision === this.frameRevision && this.documentLayoutConversionCount === 0 && this.dirtyTrackingReady && this.fileDirty) this.documentLayoutsDismissed = true
    })
  }

  private syncHTMLSourceHover(force = false) {
    const hovered = this.htmlMode && (this.htmlSourceHovered || this.htmlSourceFocused)
    if(!hovered && !this.htmlSourceHighlightActive || !force && hovered === this.htmlSourceHighlightActive) return
    this.htmlSourceHighlightActive = hovered
    if(!this.htmlMode) return
    void this.execute({type: "hoverHTMLSelectionEdit", hovered}).catch(() => {})
  }

  private handleHTMLSourceInput = (event: Event) => {
    const value = (event.currentTarget as HTMLTextAreaElement).value
    if(!this.htmlMode) return
    const pending = value !== this.htmlOriginalSource
    const pendingChanged = pending !== this.htmlPending
    this.htmlSource = value
    this.htmlPending = pending
    this.htmlSourceError = ""
    if(!pendingChanged) return
    void this.execute({type: "setHTMLSelectionEditPending", pending}).catch(error => {
      this.htmlPending = !pending
      this.htmlSourceError = error instanceof Error ? error.message : String(error)
    })
  }

  private syncHTMLSourceScroll(input: HTMLTextAreaElement) {
    const highlight = input.previousElementSibling as HTMLElement
    highlight.scrollTop = input.scrollTop
    highlight.scrollLeft = input.scrollLeft
  }

  private renderHTMLSourceEditor() {
    return html`
      <div class="html-source-panel" ?inert=${!this.consoleOpen} aria-hidden=${String(!this.consoleOpen)}>
        <div class="html-source-clip">
          <developer-console .tab=${this.consoleTab} .htmlPending=${this.htmlPending} .pinned=${this.settings.pinDeveloperConsole}
            .packageDraft=${this.localPackageDraft?.manifest ?? null} .packageSaving=${this.localPackageDraftSaving}
            .packageDraftRevision=${this.localPackageDraftRevision}
            ${bindEditingUI(this.editingUIProperties, this.editingUIListeners)}
            @git-package-load=${this.handleGitPackageLoad}
            .localPackages=${this.localPackages}
            .localPackagesLoading=${this.localPackagesLoading}
            .localPackageRefreshingNames=${this.localPackageRefreshingNames}
            .localPackageError=${this.localPackageError}
            .selectedLocalPackageName=${this.selectedLocalPackageName}
            .localPackageWarnings=${this.localPackageWarnings}
            .localPackageRuntimeWarnings=${this.localPackageRuntimeWarnings}
            .localPackageTestResults=${this.localPackageTestResults}
            @local-package-test-run=${this.handleLocalPackageTestRun}
            @local-package-metadata-change=${this.handleLocalPackageMetadataChange}
            @local-package-keyword-change=${this.handleLocalPackageKeywordChange}
            @local-package-editing-option-change=${this.handleLocalPackageEditingOptionChange}
            @local-package-pending-input=${this.handleLocalPackagePendingInput}
            @local-package-changes-confirm=${this.confirmLocalPackageChanges}
            @local-package-changes-discard=${this.discardLocalPackageChanges}
            @local-package-contributor-change=${this.handleLocalPackageContributorChange}
            @local-package-contributor-add=${this.handleLocalPackageContributorAdd}
            @local-package-contributor-delete=${this.handleLocalPackageContributorDelete}
            @local-package-export-change=${this.handleLocalPackageExportChange}
            @local-package-export-add=${this.handleLocalPackageExportAdd}
            @local-package-export-delete=${this.handleLocalPackageExportDelete}
            @local-package-export-file-pick=${this.handleLocalPackageExportFilePick}
            @developer-console-tab-change=${this.handleDeveloperConsoleTabChange}
            @developer-console-change=${this.handleDeveloperConsoleChange}
            @developer-console-pin-change=${this.handleDeveloperConsolePinChange}
            .autoReload=${this.settings.autoReloadPackages}
            @developer-console-auto-reload-change=${this.handleDeveloperConsoleAutoReloadChange}
            @html-source-apply=${this.handleHTMLSourceApply}
            @html-source-discard=${this.handleHTMLSourceDiscard}
          >
          <section class="html-source-editor" aria-label="Selected HTML source" ?hidden=${this.consoleTab !== "HTML"}>
            <div class="html-source-field">
              <pre class="html-source-highlight" aria-hidden="true">${guard([this.htmlSource], () => tokenizeHTMLSource(this.htmlSource).map(token => token.kind === "text" ? token.text : html`<span class=${token.kind}>${token.text}</span>`))}${"\n"}</pre>
              <textarea
                class="html-source-input"
                aria-label="Selected HTML"
                .value=${this.htmlSource}
                spellcheck="false"
                @mouseenter=${() => {this.htmlSourceHovered = true; this.syncHTMLSourceHover()}}
                @mouseleave=${() => {this.htmlSourceHovered = false; this.syncHTMLSourceHover()}}
                @focus=${() => {this.htmlSourceFocused = true; this.syncHTMLSourceHover()}}
                @blur=${() => {this.htmlSourceFocused = false; this.syncHTMLSourceHover()}}
                @input=${this.handleHTMLSourceInput}
                @scroll=${(event: Event) => this.syncHTMLSourceScroll(event.currentTarget as HTMLTextAreaElement)}
              ></textarea>
            </div>
            ${this.htmlSourceError ? html`<p class="html-source-error" role="alert">${this.htmlSourceError}</p>` : ""}
          </section>
          </developer-console>
        </div>
      </div>
    `
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed)
    if(changed.has("mathSelection") && this.mathSelection?.active) {
      if(!changed.get("mathSelection")) this.mathKeyboardHidden = false
    }
    const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
    const toolbox = this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")
    if(ribbon && toolbox) void toolbox.updateComplete.then(() => {
      if(this.isConnected) ribbon.aiToolboxTarget = toolbox.renderRoot.querySelector<HTMLElement>(".ai-toolbox-content")
    })
    if(changed.has("htmlSource")) {
      const input = this.renderRoot.querySelector<HTMLTextAreaElement>(".html-source-input")
      if(input) this.syncHTMLSourceScroll(input)
    }
  }

  private handleMathKeyboardCommand = (event: CustomEvent<{command: string}>) => {
    if(!this.mathSelection?.active || this.previewActive || this.liveSessionActive || typeof event.detail?.command !== "string") return
    void this.execute({type: "editMath", command: `keyboard:${event.detail.command}`})
      .catch(() => { /* A removed/replaced document no longer has a formula caret. */ })
      .finally(() => this.focusEditor())
  }

  private handleHTMLSourceApply = () => {
    if(!this.htmlMode || !this.htmlPending) return
    void this.execute({type: "applyHTMLSelectionEdit", html: this.htmlSource}).then(() => {
      this.htmlPending = false
      this.htmlOriginalSource = this.htmlSource
      this.htmlSourceError = ""
      this.fileDirty = true
      return this.refreshHTMLSource()
    }).catch(error => {
      this.htmlSourceError = error instanceof Error ? error.message : String(error)
    })
  }

  private handleHTMLSourceDiscard = () => {
    if(!this.htmlMode || !this.htmlPending) return
    void this.execute({type: "discardHTMLSelectionEdit"}).then(() => {
      this.htmlPending = false
      this.htmlSource = this.htmlOriginalSource
      this.htmlSourceError = ""
      return this.refreshHTMLSource()
    }).catch(error => {
      this.htmlSourceError = error instanceof Error ? error.message : String(error)
    })
  }

  private handleTableStyleChange = (event: Event) => {
    const detail = (event as CustomEvent<{property?: unknown, value?: unknown}>).detail
    if(!["background-color", "border-color", "border-style", "border-width"].includes(String(detail?.property))
      || typeof detail?.value !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setTableCellStyle",
      property: detail.property as "background-color" | "border-color" | "border-style" | "border-width",
      value: detail.value,
    }).finally(() => this.focusEditor())
  }

  private handleGraphicParameterChange = (event: Event) => {
    const detail = (event as CustomEvent<{name?: unknown, value?: unknown}>).detail
    const allowed = new Set([
      "x", "y", "width", "height", "rotation", "fill", "stroke",
      "stroke-width", "opacity", "corner-radius", "routing", "start-arrow", "end-arrow",
      "label", "text-color", "font-size", "inset", "inner-radius", "head-size", "tail-width",
    ])
    if(typeof detail?.name !== "string" || (!allowed.has(detail.name) && !/^adjust-[a-z][a-z -]*$/.test(detail.name)) || typeof detail.value !== "string") {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "setGraphicParameter",
      name: detail.name,
      value: detail.value,
    }).finally(() => this.focusEditor())
  }

  private handleGraphicLayerAction = (event: Event) => {
    const detail = (event as CustomEvent<{operation?: unknown, index?: unknown}>).detail
    if(!isGraphicLayerOperation(detail?.operation)
      || typeof detail.index !== "number" || !Number.isInteger(detail.index) || detail.index < 0) {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "manageGraphicLayer",
      operation: detail.operation,
      index: detail.index,
    }).finally(() => this.focusEditor())
  }

  private handleGraphicViewportAction = (event: Event) => {
    const detail = (event as CustomEvent<{operation?: unknown, zoom?: unknown}>).detail
    if(!isGraphicViewportOperation(detail?.operation)
      || detail.operation === "set-zoom" && (
        typeof detail.zoom !== "number" || !Number.isFinite(detail.zoom) || detail.zoom < 25 || detail.zoom > 400
      )) {
      this.focusEditor()
      return
    }
    void this.execute({
      type: "navigateGraphic",
      operation: detail.operation,
      ...(detail.operation === "set-zoom" ? {zoom: detail.zoom as number} : {}),
    }).finally(() => this.focusEditor())
  }

  private handleRibbonCollapse = async () => {
    if(!this.settings.pinDeveloperConsole && this.localPackageDraft && !await this.resolvePendingPackageChanges()) {
      const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
      if(ribbon) ribbon.expanded = true
      return
    }
    this.breadcrumbVisible = false
    this.renderRoot.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")?.collapseTree()
  }

  private handleRibbonExpand = () => {
    this.breadcrumbVisible = true
  }

  private handleRibbonBreadcrumbVisibilityChange = async (event: Event) => {
    const visible = (event as CustomEvent<{visible?: unknown}>).detail?.visible
    if(visible === false && !this.settings.pinDeveloperConsole && this.localPackageDraft && !await this.resolvePendingPackageChanges()) return
    if(typeof visible === "boolean") this.breadcrumbVisible = visible
  }

  private handleBreadcrumbItemSelect = (event: Event) => {
    const item = (event as CustomEvent<SelectionPathItem>).detail
    if(!item || !Array.isArray(item.path)) return
    const path = [...item.path]

    void this.execute({
      type: "selectNode",
      path,
    }).then(() => {
      const body = this.editorDocument?.body
      const node = path.reduce<Node | undefined>((node, index) => node?.childNodes[index], body)
      if(body && node === getDocumentRoot(body)) this.openEditToolbox()
    }).finally(() => this.focusEditor())
  }

  private handleBreadcrumbSectionSelect = (event: Event) => {
    const section = (event as CustomEvent<SelectionPathSection>).detail
    if(!section || !Array.isArray(section.path)) return

    void this.execute({type: "selectSection", path: [...section.path]}).then(() => {
      this.openEditToolbox()
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

  private handleBreadcrumbSectionHover = (event: Event) => {
    const section = (event as CustomEvent<SelectionPathSection | null>).detail
    const path = section && Array.isArray(section.path) ? [...section.path] : null
    this.breadcrumbHoverPath = path
    void this.execute({type: "hoverSection", path}).catch(() => {
      // Hover is best-effort; the editor may be unloading while the pointer
      // leaves the breadcrumb.
    })
  }

  private buildDocumentTree() {
    const body = this.editorDocument?.body
    if(!body) return null
    const root = getDocumentRoot(body)

    const sectionItem = (element: Element, path: number[]): SelectionPathSection => ({
      path: [...path],
      type: element.localName as SectionName,
      name: getSectionOption(element.localName as SectionName).label,
      icon: getSectionOption(element.localName as SectionName).icon,
    })
    const addSections = (item: DocumentTreeItem, sections: SelectionPathSection[]) => {
      const existing = item.sections ?? []
      const paths = new Set(existing.map(section => section.path.join(".")))
      const added = sections.filter(section => !paths.has(section.path.join(".")))
      if(added.length) item.sections = [...existing, ...added]
    }
    const build = (element: Element, path: number[], sections: SelectionPathSection[] = []): DocumentTreeItem => {
      const item: DocumentTreeItem = {
        path: [...path],
        ...this.elementPresentation(element),
        ...(sections.length ? {sections: sections.map(section => ({...section, path: [...section.path]}))} : {}),
        children: [],
      }
      if(element.matches("table")) return item

      const appendChildren = (container: Element, containerPath: number[], inherited: SelectionPathSection[]) => {
        Array.from(container.childNodes).forEach((child, index) => {
          if(child.nodeType !== Node.ELEMENT_NODE) return
          const childElement = child as Element
          const slideRole = slideLayoutRole(childElement)
          if(slideRole === "navigation") return
          if(childElement.matches("source, math, details > summary")
            || childElement.matches("img") && childElement.closest("picture")
            || isLineBreakElement(childElement)) return
          const childPath = [...containerPath, index]
          if(slideRole === "viewport" || isMarkElement(childElement)) {
            appendChildren(childElement, childPath, inherited)
            return
          }
          if(slideRole !== "slide" && isSectionElement(childElement)) {
            const currentSection = sectionItem(childElement, childPath)
            const nextSections = [...inherited, currentSection]
            const childCount = item.children.length
            appendChildren(childElement, childPath, nextSections)
            if(item.children.length === childCount) addSections(item, [currentSection])
            return
          }
          item.children.push(build(childElement, childPath, inherited))
        })
      }
      appendChildren(element, path, [])
      return item
    }

    const rootPath = root === body
      ? []
      : [Array.from(body.childNodes).indexOf(root as ChildNode)]
    return build(root, rootPath)
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

  private handleBreadcrumbTreeToggle = () => {
    this.documentTree = this.buildDocumentTree()
  }

  private isEditorMessage(event: MessageEvent) {
    const iframe = this.editorIframe()
    const sourceMatches = event.source === this.editorWindow || event.source === iframe?.contentWindow
    const testOriginFallback = globalThis.navigator?.userAgent.includes("HappyDOM") && !event.origin
    return sourceMatches
      && event.data?.bridgeNonce === this.bridgeNonce
      && (event.origin === window.location.origin || event.origin === editorFrameOrigin() || testOriginFallback)
  }

  private stylesVisible() {
    const toolbox = this.renderRoot.querySelector<DomEditorToolbox>("dom-editor-toolbox")
    return toolbox?.activeTool === "Style" || toolbox?.activeTool === "Edit"
      || this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.activeMenu === "Style"
  }

  private normalizedElementStyleState(value: unknown): ElementStyleState | null {
    if(!isRecord(value) || !isRecord(value.inline) || !isRecord(value.computed) || !isRecord(value.context)) {
      return null
    }
    const target = value.target === null
      ? null
      : isRecord(value.target)
        && typeof value.target.localName === "string"
        && (value.target.namespaceURI === null || typeof value.target.namespaceURI === "string")
        ? {localName: value.target.localName, namespaceURI: value.target.namespaceURI,
          ...(value.target.documentRoot === true ? {documentRoot: true as const} : {})}
        : undefined
    if(target === undefined
      || typeof value.context.display !== "string"
      || typeof value.context.parentDisplay !== "string") return null

    const inline = Object.fromEntries(Object.entries(value.inline).flatMap(([name, declaration]) => (
      isRecord(declaration)
      && typeof declaration.value === "string"
      && (declaration.priority === "" || declaration.priority === "important")
        ? [[name, {value: declaration.value, priority: declaration.priority}]]
        : []
    ))) as ElementStyleState["inline"]
    const computed = Object.fromEntries(Object.entries(value.computed).flatMap(([name, computedValue]) => (
      typeof computedValue === "string" ? [[name, computedValue]] : []
    )))
    return {
      target,
      inline,
      computed,
      context: {
        display: value.context.display,
        parentDisplay: value.context.parentDisplay,
      },
    }
  }

  private refreshElementStyleState = async () => {
    const sequence = ++this.elementStyleRefreshSequence
    try {
      const result = await this.execute({
        type: "getStyleState",
        properties: elementStylePropertyNames,
      })
      const state = this.normalizedElementStyleState(result)
      if(sequence === this.elementStyleRefreshSequence && state) this.elementStyle = state
    }
    catch {
      // The frame can be replaced while a queued projection is in flight.
      // Its next selection or Style-tab request will provide current state.
    }
  }

  private queueElementStyleRefresh = () => {
    if(this.elementStyleRefreshQueued) return
    this.elementStyleRefreshQueued = true
    queueMicrotask(() => {
      this.elementStyleRefreshQueued = false
      void this.refreshElementStyleState()
    })
  }

  private handleElementStyleChange = (event: Event) => {
    const detail = (event as CustomEvent<{
      property?: unknown
      mutation?: unknown
      styles?: unknown
    }>).detail
    const entries = isRecord(detail?.styles)
      ? Object.entries(detail.styles)
      : [[detail?.property, detail?.mutation]]
    if(!entries.length || entries.some(([property, mutation]) => {
      const validDeclaration = isRecord(mutation) && typeof mutation.value === "string"
        && (mutation.priority === "" || mutation.priority === "important")
      return typeof property !== "string" || !property || property !== property.trim() || property.includes(";")
        || mutation !== null && typeof mutation !== "string" && !validDeclaration
    })) return
    const styles = Object.fromEntries(entries) as Record<string, ElementStyleMutation>
    const previousState = this.elementStyle
    const inline = {...this.elementStyle.inline}
    for(const [property, mutation] of Object.entries(styles)) {
      if(mutation === null || mutation === "") delete inline[property]
      else inline[property] = typeof mutation === "string"
        ? {value: mutation, priority: ""} : {...mutation}
    }
    this.elementStyle = {...this.elementStyle, inline}

    const paragraphSelection = Object.keys(styles).every(property => paragraphStylePropertyNameSet.has(property))
      && !this.nodeSelection && !this.selectionGap && !this.tableSelection?.cellSelection
    void this.execute(paragraphSelection ? {
      type: "setBlockStyle", styles,
    } : {
      type: "setStyle", styles,
    }).then(() => this.refreshElementStyleState()).catch(() => {
      this.elementStyle = previousState
      return this.refreshElementStyleState()
    })
  }

  private handleElementStyleTargetHover = (event: Event) => {
    const hovered = (event as CustomEvent<{hovered?: unknown}>).detail?.hovered
    if(typeof hovered !== "boolean") return
    void this.execute({type: "hoverStyleTarget", hovered}).catch(() => {
      // Hover is best-effort; the editor may be unloading as the pointer leaves.
    })
  }

  private routeAIEditReview(detail: AIEditReviewMessage["detail"]) {
    this.renderRoot.querySelector<AppRibbon>("app-ribbon")
      ?.reviewPendingAIEdit(detail.action, detail.editId)
  }

  private handleInlineAIEditReview = (event: Event) => {
    const message = {
      type: aiEditReviewEvent,
      detail: (event as CustomEvent<AIEditReviewMessage["detail"]>).detail,
    }
    if(isAIEditReviewMessage(message)) {
      event.preventDefault()
      this.routeAIEditReview(message.detail)
    }
  }

  /** Ribbon buttons set their drag data in their own dragstart listeners,
   * before the event bubbles here. Browsers hide those values until drop, so
   * keep them for relaying the drag into the editor frame. */
  private handleRibbonDragStart = (event: DragEvent) => {
    const data = event.dataTransfer
    if(event.defaultPrevented || !data
      || !Array.from(data.types).some(type => type === elementDragType || type === ribbonInsertionDragType)) return
    this.ribbonDrag = Object.fromEntries(Array.from(data.types).map(type => [type, data.getData(type)]))
  }

  private handleRibbonDragEnd = () => {
    if(this.ribbonDrag) this.postFrameControl("drag", {event: "dragleave", x: 0, y: 0, data: this.ribbonDrag} satisfies HostDragDetail)
    this.ribbonDrag = null
  }

  /** The browser does not deliver a ribbon drag to the cross-site editor
   * frame, so the stage shield receives it and replays it at the same point. */
  private relayRibbonDrag = (event: DragEvent) => {
    const frame = this.editorIframe()
    const data = this.ribbonDrag
    if(!frame || !data) return
    const rect = frame.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const inside = !frame.hidden && x >= 0 && y >= 0 && x < rect.width && y < rect.height
    const type = event.type === "dragleave" || !inside ? "dragleave" : event.type === "drop" ? "drop" : "dragover"
    if(event.type !== "dragleave") event.preventDefault()
    if(event.dataTransfer) event.dataTransfer.dropEffect = inside ? "copy" : "none"
    this.postFrameControl("drag", {
      event: type, x, y, data,
      ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey,
    } satisfies HostDragDetail)
    if(event.type === "drop") this.ribbonDrag = null
  }

  private handleEditorMessage = (event: MessageEvent) => {
    if(event.data?.type === "editor-ribbon-drop") {
      if(!this.isEditorMessage(event) || typeof event.data.action !== "string" || !ribbonInsertionAction(event.data.action)) return
      const position = event.data.position as RibbonDropPosition | undefined
      if(!position || !position.anchor || typeof position.anchor !== "object"
        || !["document", "canvas", "slides"].includes(position.layout)
        || position.layout !== "document" && (!Number.isFinite(position.x) || !Number.isFinite(position.y))) return
      void this.insertRibbonDropAction(event.data.action, position)
      return
    }
    if(event.data?.type === "frame-local-package-request") {
      const isFrame = this.isEditorMessage(event) || this.isPreviewMessage(event)
      const port = event.ports[0]
      if(!isFrame || !port || typeof event.data.url !== "string"
        || (event.data.method !== "GET" && event.data.method !== "HEAD")) return
      let url: URL
      try { url = new URL(event.data.url) }
      catch { return }
      const original = new URL(frameLocalPackageURL(url.href, editorFrameOrigin(), window.location.origin))
      if(url.origin !== editorFrameOrigin() || !url.pathname.startsWith(LOCAL_PACKAGE_ROUTE_PREFIX)
        || original.origin !== window.location.origin) return
      const id = url.pathname.slice(LOCAL_PACKAGE_ROUTE_PREFIX.length).split("/")[0]
      if(![...this.localPackageManager.records.values()].some(record => encodeURIComponent(record.id) === id)) {
        port.postMessage({status: 404, headers: [], body: new ArrayBuffer(0)})
        return
      }
      void fetch(original.href, {method: event.data.method}).then(async response => {
        const body = await response.arrayBuffer()
        port.postMessage({status: response.status, headers: [...response.headers], body}, [body])
      }).catch(() => port.postMessage({status: 502, headers: [], body: new ArrayBuffer(0)}))
      return
    }
    if(event.data?.type === "webwriter-frame-shell-ready") {
      if(event.origin !== editorFrameOrigin() || event.data.bridgeNonce !== this.bridgeNonce) return
      const hasInstanceId = Object.prototype.hasOwnProperty.call(event.data, "instanceId")
      const instanceId = event.data.instanceId
      if(hasInstanceId && (typeof instanceId !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId))) return
      if(event.data.kind === "editor" && event.data.revision === String(this.frameRevision)) {
        const frame = this.editorIframe()
        if(event.source !== frame?.contentWindow) return
        if(hasInstanceId) {
          if(instanceId === this.editorShellInstanceId) return
          const restartedShell = this.editorShellInstanceId !== null && this.editorShellRevision === this.frameRevision
          this.editorShellInstanceId = instanceId as string
          this.editorShellRevision = this.frameRevision
          let html = this.editorSrcdoc
          if(restartedShell) {
            const latestDocument = this.snapshotEditorDocumentHTML()
            if(latestDocument !== null) {
              this.frameDocumentHTML = latestDocument
              html = this.editorSrcdoc
            }
            this.resetEditorFrameForShellRestart()
          }
          frame.contentWindow?.postMessage({type: "webwriter-frame-document", html}, editorFrameOrigin())
          return
        }
        if(this.editorShellRevision === this.frameRevision) return
        this.editorShellRevision = this.frameRevision
        frame.contentWindow?.postMessage({type: "webwriter-frame-document", html: this.editorSrcdoc}, editorFrameOrigin())
      }
      else if(event.data.kind === "preview" && event.data.revision === String(this.previewFrameRevision)) {
        const frame = this.renderRoot.querySelector<HTMLIFrameElement>("iframe.preview-frame")
        if(event.source !== frame?.contentWindow) return
        if(hasInstanceId) {
          if(instanceId === this.previewShellInstanceId) return
          this.previewShellInstanceId = instanceId as string
        }
        else if(this.previewShellRevision === this.previewFrameRevision) return
        this.previewShellRevision = this.previewFrameRevision
        frame.contentWindow?.postMessage({type: "webwriter-frame-document", html: this.previewDocumentHTML ?? ""}, editorFrameOrigin())
      }
      return
    }
    if(event.data?.type === "webwriter-editor-frame-ready") {
      const frame = this.editorIframe()
      if(event.origin !== editorFrameOrigin() || event.source !== frame?.contentWindow
        || event.data.bridgeNonce !== this.bridgeNonce || this.editorInitializedRevision === this.frameRevision) return
      this.editorInitializedRevision = this.frameRevision
      this.initializeEditorFrame(frame)
      return
    }
    if(this.handlePreviewMessage(event)) return
    if(event.data?.type === "editor-frame-snapshot") {
      if(!this.editorOpaque || !this.isEditorMessage(event) || typeof event.data.html !== "string") return
      const before = this.authoredDocumentSnapshot()
      this.editorDocument = new DOMParser().parseFromString(event.data.html, "text/html")
      this.documentTree = this.buildDocumentTree()
      if(before !== null && before !== this.authoredDocumentSnapshot()) {
        this.documentChangeSequence++
        if(this.historyDocumentTransitionCount === 0) {
          if(this.dirtyTrackingReady) this.fileDirty = !this.isFreshDocumentUnchanged()
          else this.dirtyTrackingMutationPending = true
          if(this.documentLayoutConversionCount === 0 && this.dirtyTrackingReady && this.fileDirty) this.documentLayoutsDismissed = true
        }
        if(this.stylesVisible()) this.queueElementStyleRefresh()
      }
      return
    }
    if(event.data?.type === "editor-frame-response") {
      if(!this.editorOpaque || !this.isEditorMessage(event)) return
      const pending = this.frameRequests.get(event.data.requestId)
      if(!pending) return
      this.frameRequests.delete(event.data.requestId)
      clearTimeout(pending.timer)
      pending.resolve(event.data)
      return
    }
    if(event.data?.type === "editor-frame-pointerdown") {
      if(!this.editorOpaque || !this.isEditorMessage(event)) return
      const ribbon = this.renderRoot.querySelector<AppRibbon>("app-ribbon")
      if(event.data.widgetShadow === true) return
      this.focusEditor()
      this.dismissEditorMenus()
      const path = event.data.targetPath
      const target = Array.isArray(path) && path.every((index: unknown) => Number.isInteger(index) && (index as number) >= 0)
        ? path.reduce((node: Node | null, index: number) => node?.childNodes.item(index) ?? null, this.editorDocument?.body ?? null)
        : null
      if(!this.editorTargetSharesTextSelection(target)) ribbon?.dismissDrawers()
      return
    }
    if(event.data?.type === "editor-frame-window-focus" || event.data?.type === "editor-frame-window-blur") {
      if(!this.editorOpaque || !this.isEditorMessage(event)) return
      if(event.data.type === "editor-frame-window-focus") this.handleHostWindowFocus()
      else this.handleHostWindowBlur()
      return
    }
    if(event.data?.type === "editor-frame-focusin") {
      if(!this.editorOpaque || !this.isEditorMessage(event) || event.data.widgetShadow === true) return
      this.renderRoot.querySelector<AppRibbon>("app-ribbon")?.dismissCollapsedMenu()
      return
    }
    if(event.data?.type === "editor-frame-shortcut") {
      if(!this.editorOpaque || !this.isEditorMessage(event) || typeof event.data.action !== "string") return
      if(appCommands.some(command => command.action === event.data.action)) this.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {
        detail: {label: event.data.action},
      }))
      return
    }
    if(isAIEditReviewMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.routeAIEditReview(event.data.detail)
      return
    }
    if(isMarkStateChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.svgText = event.data.detail.svgText === true
      this.canMark = event.data.detail.canMark
      // Markability identifies a text selection. Selection and mark state are
      // delivered as separate messages, so retire any older node/gap state as
      // soon as the newer text state arrives.
      if(this.canMark) {
        this.nodeSelection = false
        this.captureSelection = false
        this.selectionGap = null
        this.mediaSelection = null
        this.graphicSelection = null
        this.elementAttributes = null
      }
      this.marks = [...event.data.detail.marks]
      this.allowedMarks = event.data.detail.allowedMarks ? [...event.data.detail.allowedMarks] : null
      this.markStyles = {...(event.data.detail.styles ?? {})}
      this.markAttributes = Object.fromEntries(
        Object.entries(event.data.detail.attributes ?? {}).map(([mark, attributes]) => [mark, {...attributes}]),
      )
      this.ruby = event.data.detail.ruby ? {
        ...event.data.detail.ruby,
        annotations: event.data.detail.ruby.annotations.map(component => ({...component})),
        fallbacks: event.data.detail.ruby.fallbacks.map(component => ({...component})),
      } : {...emptyRubyState}
      this.dispatchEvent(new CustomEvent(markStateChangeEvent, {
        detail: {
          svgText: this.svgText,
          canMark: this.canMark,
          marks: [...this.marks],
          styles: {...this.markStyles},
          attributes: this.markAttributes,
          ruby: this.ruby,
        },
        bubbles: true,
        composed: true,
      }))
      return
    }
    if(isCommentStateChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.commentState = {...event.data.detail}
      this.dispatchEvent(new CustomEvent(commentStateChangeEvent, {
        detail: {...this.commentState},
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
        ...(item.sections ? {sections: item.sections.map(section => ({
          ...section,
          path: [...section.path],
        }))} : {}),
      }))
      const gap = event.data.detail.gap
      const selectionGap = gap
        ? {parentPath: [...gap.parentPath], offset: gap.offset}
        : null
      this.selectionPath = path
      const selectedSection = event.data.detail.section
      const activeSection = path.flatMap(item => item.sections ?? []).at(-1)
      this.sectionSelected = selectedSection !== undefined
      this.layoutSelection = event.data.detail.layout ?? null
      this.documentLayout = {...(event.data.detail.documentLayout ?? defaultDocumentLayoutState())}
      this.documentLayoutError = ""
      this.selectedSectionPath = selectedSection ? [...selectedSection.path] : null
      this.sectionActive = selectedSection !== undefined || activeSection !== undefined
      this.sectionType = selectedSection?.type ?? activeSection?.type ?? "section"
      this.canSection = event.data.detail.canSection === true
        || this.sectionSelected
        || Boolean(path.at(-1)?.path.length)
      this.nodeSelection = event.data.detail.nodeSelected === true || event.data.detail.capture === true
      this.captureSelection = event.data.detail.capture === true
      this.selectionGap = selectionGap
      // A node or gap selection cannot simultaneously be a markable text
      // selection. Clear the independently delivered mark state immediately
      // so rendering never applies both selection kinds.
      if(this.nodeSelection || this.sectionSelected || this.selectionGap || event.data.detail.table?.cellSelection) {
        this.canMark = false
        this.marks = []
        this.markStyles = {}
        this.markAttributes = {}
        this.ruby = {...emptyRubyState}
      }
      this.listType = event.data.detail.list?.type ?? null
      this.listStyle = event.data.detail.list?.style ?? ""
      this.orderedList = event.data.detail.list?.ordered ? {...event.data.detail.list.ordered} : undefined
      this.headingGroup = event.data.detail.headingGroup ? {...event.data.detail.headingGroup} : null
      this.figure = event.data.detail.figure ? {...event.data.detail.figure} : null
      this.mediaSelection = event.data.detail.media
        ? {type: event.data.detail.media.type, attributes: {...event.data.detail.media.attributes}}
        : null
      this.dialogSelection = event.data.detail.dialog ? {
        ...event.data.detail.dialog,
        attributes: {...event.data.detail.dialog.attributes},
      } : null
      this.tableSelection = event.data.detail.table ? {...event.data.detail.table} : null
      this.mathSelection = event.data.detail.math ? {...event.data.detail.math} : null
      this.graphicSelection = event.data.detail.graphic ? {
        ...event.data.detail.graphic,
        ...(event.data.detail.graphic.parameters ? {parameters: {...event.data.detail.graphic.parameters}} : {}),
        ...(event.data.detail.graphic.options ? {options: {...event.data.detail.graphic.options}} : {}),
        ...(event.data.detail.graphic.layers ? {
          layers: event.data.detail.graphic.layers.map(layer => ({...layer})),
        } : {}),
        ...(event.data.detail.graphic.viewport ? {viewport: {...event.data.detail.graphic.viewport}} : {}),
      } : null
      this.elementAttributes = event.data.detail.element ? {
        ...event.data.detail.element,
        path: event.data.detail.element.path ? [...event.data.detail.element.path] : null,
        attributes: {...event.data.detail.element.attributes},
      } : null
      const previousWidget = this.widgetOptions
      this.widgetOptions = event.data.detail.widget ? structuredClone(event.data.detail.widget) : null
      if(previousWidget?.localName !== this.widgetOptions?.localName
        || JSON.stringify(previousWidget?.path) !== JSON.stringify(this.widgetOptions?.path)) this.selectWidgetElementPackage()
      const hasContextualEditOptions = this.tableSelection?.active === true
        || this.layoutSelection !== null
        || this.graphicSelection?.active === true
        || this.mediaSelection !== null
        || this.dialogSelection !== null
        || this.sectionSelected
        || this.headingGroup !== null
        || this.figure !== null
        || path.at(-1)?.icon === "Packages"
      if(event.data.detail.inserted === true && hasContextualEditOptions) this.openEditToolbox()
      this.documentTree = this.buildDocumentTree()
      if(this.stylesVisible()) this.queueElementStyleRefresh()
      this.dispatchEvent(new CustomEvent(selectionChangeEvent, {
        detail: {
          path,
          ...(event.data.detail.canSection === true ? {canSection: true} : {}),
          ...(event.data.detail.inserted === true ? {inserted: true} : {}),
          ...(this.nodeSelection ? {nodeSelected: true} : {}),
          ...(this.captureSelection ? {capture: true} : {}),
          ...(selectionGap ? {gap: selectionGap} : {}),
          list: {
            type: this.listType,
            style: this.listStyle,
            ...(this.orderedList ? {ordered: {...this.orderedList}} : {}),
          },
          ...(this.headingGroup ? {headingGroup: {...this.headingGroup}} : {}),
          ...(this.figure ? {figure: {...this.figure}} : {}),
          ...(this.mediaSelection ? {media: this.mediaSelection} : {}),
          ...(this.dialogSelection ? {dialog: this.dialogSelection} : {}),
          ...(this.tableSelection ? {table: this.tableSelection} : {}),
          ...(this.graphicSelection ? {graphic: this.graphicSelection} : {}),
          ...(this.mathSelection ? {math: this.mathSelection} : {}),
          ...(this.layoutSelection ? {layout: this.layoutSelection} : {}),
          documentLayout: {...this.documentLayout},
          ...(this.elementAttributes ? {element: this.elementAttributes} : {}),
          ...(selectedSection ? {section: {
            path: [...selectedSection.path],
            type: selectedSection.type,
          }} : {}),
        },
        bubbles: true,
        composed: true,
      }))
      this.queueHTMLSourceRefresh()
      return
    }
    if(isPresenceChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.presenceUsers = event.data.detail.users.map(user => ({...user}))
      return
    }
    if(isDocumentHeadStateChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.documentHead = {
        ...event.data.detail,
        elements: event.data.detail.elements.map(element => ({
          ...element,
          attributes: element.attributes.map(attribute => ({...attribute})),
        })),
      }
      return
    }
    if(isHistoryStateChangeMessage(event.data)) {
      if(!this.isEditorMessage(event)) return
      this.updateHistoryState(event.data.detail)
      return
    }
    if(!isExecuteResponse(event.data)) return
    if(!this.isEditorMessage(event)) return

    const detail = event.data.detail
    const pending = this.pendingExecutions.get(detail.requestId)
    if(!pending) return
    this.pendingExecutions.delete(detail.requestId)
    clearTimeout(pending.timer)
    pending.abortCleanup?.()

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
    if(this.editorWindow) {
      const editorWindow = this.editorWindow
      return this.packageLoadPromise
        ? this.packageLoadPromise.then(() => editorWindow)
        : Promise.resolve(editorWindow)
    }
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

  async execute(action: EditingAction, options: {signal?: AbortSignal, timeout?: number} = {}): Promise<unknown> {
    if(!this.isConnected) {
      throw new Error("The DOM editor component is not connected")
    }
    const requestId = String(++this.requestSequence)
    const promise = new Promise<unknown>((resolve, reject) => {
      const pending = {resolve, reject} as {
        resolve: (value: unknown) => void
        reject: (reason?: unknown) => void
        timer?: ReturnType<typeof setTimeout>
        abortCleanup?: () => void
      }
      pending.timer = setTimeout(() => {
        if(this.pendingExecutions.get(requestId) !== pending) return
        this.pendingExecutions.delete(requestId)
        pending.abortCleanup?.()
        reject(new Error("The editor did not respond in time"))
      }, options.timeout ?? executeTimeoutMs)
      this.pendingExecutions.set(requestId, pending)
      if(options.signal) {
        const abort = () => {
          if(this.pendingExecutions.get(requestId) !== pending) return
          this.pendingExecutions.delete(requestId)
          clearTimeout(pending.timer)
          reject(options.signal?.reason ?? new DOMException("The operation was aborted", "AbortError"))
        }
        if(options.signal.aborted) abort()
        else {
          options.signal.addEventListener("abort", abort, {once: true})
          pending.abortCleanup = () => options.signal?.removeEventListener("abort", abort)
        }
      }
    })

    if(options.signal?.aborted) return promise
    void this.waitForEditorWindow().then(() => {
      // A timeout or AbortSignal can settle the request while the iframe is
      // still initializing. Never execute a command whose caller has already
      // stopped waiting for it.
      if(this.pendingExecutions.has(requestId)) {
        this.postToEditor(Object.assign({}, action as object, {requestId, bridgeNonce: this.bridgeNonce}))
      }
    }).catch(error => {
      const pending = this.pendingExecutions.get(requestId)
      if(pending) {
        this.pendingExecutions.delete(requestId)
        clearTimeout(pending.timer)
        pending.abortCleanup?.()
        pending.reject(error)
      }
    })

    return promise
  }

  private async restoreLocalPackages() {
    const restored = await this.localPackageManager.restore()
    const firstRestored = this.localPackageManager.records.values().next().value
    if(!this.selectedLocalPackageName && firstRestored) this.selectLocalPackage(firstRestored.package.name)
    if(restored.length) {
      const restoredNames = new Set(restored.map(pkg => pkg.name))
      try {
        await this.reloadEditor([
          ...this.installedPackages.filter(candidate => !restoredNames.has(candidate.name)),
          ...restored,
        ])
      }
      catch(error) {
        this.localPackageError = error instanceof Error ? error.message : String(error)
      }
    }
  }

  connectedCallback() {
    super.connectedCallback()
    this.recentDocumentsReady = this.restoreRecentDocuments()
    this.lang = this.settings.language
    this.localPackageManager.autoReload = this.settings.autoReloadPackages
    this.updateMotionPreference()
    this.updateCloudExpiry()
    window.addEventListener("message", this.handleEditorMessage)
    window.addEventListener("beforeunload", this.handleBeforeUnload)
    window.addEventListener("blur", this.handleHostWindowBlur)
    window.addEventListener("focus", this.handleHostWindowFocus)
    this.addEventListener("dragstart", this.handleRibbonDragStart)
    this.addEventListener("dragend", this.handleRibbonDragEnd)
    document.addEventListener("keydown", this.handleConfiguredShortcut, true)
    const liveSessionId = this.liveSessionIdFromURL()
    const open = new URL(location.href).searchParams.get("open")
    const reference = open === null ? null : parseDocumentOpenReference(open)
    const backendReady = !liveSessionId && import.meta.env.MODE !== "test" && reference?.kind !== "backend"
      ? this.loginToBackend(undefined, true) : Promise.resolve()
    if(liveSessionId) void this.joinLiveSession(liveSessionId)
    this.restoreInstalledPackages()
    const catalog = this.loadPackageCatalog()
    const restoration = this.restoreLocalPackages()
    const timer = this.frameStarted ? undefined : setTimeout(() => startFrame(), 250)
    this.frameStartTimer = timer
    const startFrame = () => {
      if(!this.isConnected || this.frameStartTimer !== timer) return
      clearTimeout(timer)
      this.frameStartTimer = undefined
      this.frameStarted = true
    }
    void Promise.allSettled([catalog, restoration]).then(([, restored]) => {
      if(restored.status === "rejected") {
        this.localPackageError = restored.reason instanceof Error ? restored.reason.message : String(restored.reason)
      }
      startFrame()
    })
    this.localPackageManager.connect()
    // Package restoration can replace the initial iframe. Open only after
    // that startup work finishes, then wait for the current frame.
    if(!liveSessionId && open !== null) void this.restoreLinkedDocument(open,
      Promise.allSettled([backendReady, restoration]).then(() => {}))
    if(this.settings.pinDeveloperConsole) this.handleDeveloperConsoleChange(new CustomEvent("developer-console-change", {detail: {enabled: true}}))
  }

  disconnectedCallback() {
    this.cancelFileInput?.()
    this.recentRefreshGeneration++
    clearTimeout(this.frameStartTimer)
    this.frameStartTimer = undefined
    this.clearMotionStylesheet()
    this.disposeLiveSession()
    for(const pending of this.frameRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error("The DOM editor component was disconnected"))
    }
    this.frameRequests.clear()
    this.backendProbeController?.abort()
    this.backendProbeController = null
    clearTimeout(this.cloudExpiryTimer)
    this.cloudExpiryTimer = undefined
    window.removeEventListener("message", this.handleEditorMessage)
    window.removeEventListener("beforeunload", this.handleBeforeUnload)
    window.removeEventListener("blur", this.handleHostWindowBlur)
    window.removeEventListener("focus", this.handleHostWindowFocus)
    this.removeEventListener("dragstart", this.handleRibbonDragStart)
    this.removeEventListener("dragend", this.handleRibbonDragEnd)
    this.ribbonDrag = null
    document.removeEventListener("keydown", this.handleConfiguredShortcut, true)
    this.localPackageManager.disconnect()
    if(this.dirtyTrackingTimer !== undefined) clearTimeout(this.dirtyTrackingTimer)
    this.dirtyTrackingTimer = undefined
    this.dirtyTrackingReady = false
    this.dirtyTrackingMutationPending = false
    this.documentTreeObserver?.disconnect()
    this.documentTreeObserver = null
    if(!this.editorOpaque) this.editorWindow?.removeEventListener(aiEditReviewEvent, this.handleInlineAIEditReview)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("focus", this.handleHostWindowFocus)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("blur", this.handleHostWindowBlur)
    if(!this.editorOpaque) this.editorWindow?.removeEventListener("pointerdown", this.handleEditorPointerDown, true)
    this.editorDocument?.removeEventListener("focusin", this.handleEditorFocus)
    this.editorDocument?.removeEventListener("keydown", this.handleConfiguredShortcut, true)
    const iframe = this.editorIframe()
    iframe?.classList.remove("window-inactive")
    iframe?.removeEventListener("focus", this.handleEditorFrameFocus)
    iframe?.removeEventListener("blur", this.handleEditorFrameBlur)
    this.editorDocument = null
    this.editorWindow = null
    this.savedEditorSelection = null
    this.previewActive = false
    this.previewDocumentHTML = null
    this.previewFramePending = false
    this.previewSelection = null
    this.previewTransition = false
    this.ribbonInputSession = false
    this.restoreEditorAfterRibbonInput = false
    this.breadcrumbHoverPath = null
    this.documentTree = null
    this.presenceUsers = []
    this.editorReadyReject?.(new Error("The DOM editor component was disconnected"))
    this.packageLoadPromise = null
    this.editorReadyPromise = null
    this.editorReadyResolve = null
    this.editorReadyReject = null
    this.selectionPath = []
    this.nodeSelection = false
    this.captureSelection = false
    this.elementAttributes = null
    this.widgetOptions = null
    this.selectionGap = null
    this.canMark = false
    this.canSection = false
    this.sectionType = "section"
    this.sectionActive = false
    this.sectionSelected = false
    this.layoutSelection = null
    this.layoutError = ""
    this.selectedSectionPath = null
    this.marks = []
    this.markStyles = {}
    this.markAttributes = {}
    this.ruby = {...emptyRubyState}
    this.listType = null
    this.listStyle = ""
    this.orderedList = undefined
    this.headingGroup = null
    this.figure = null
    this.commentState = {
      canComment: false,
      active: false,
      text: "",
      activeCount: 0,
      count: 0,
      highlighting: true,
    }
    this.mediaSelection = null
    this.dialogSelection = null
    this.tableSelection = null
    this.mathSelection = null
    this.graphicSelection = null
    this.elementStyleRefreshSequence++
    this.elementStyleRefreshQueued = false
    this.htmlSourceRefreshSequence++
    this.htmlSourceRefreshQueued = false
    this.htmlSourceHovered = this.htmlSourceFocused = this.htmlSourceHighlightActive = false
    this.consoleOpen = false
    this.consoleTab = "Packages"
    this.htmlMode = false
    this.htmlSource = ""
    this.htmlOriginalSource = ""
    this.htmlPending = false
    this.htmlSourceError = ""
    this.documentLayout = defaultDocumentLayoutState()
    this.documentLayoutError = ""
    this.elementStyle = {
      target: null,
      inline: {},
      computed: {},
      context: {display: "", parentDisplay: ""},
    }
    this.documentHead = emptyDocumentHeadState()
    this.historyState = emptyVersionHistoryState()
    this.historyLoading = false
    this.historyOperationCount = 0
    this.historyDocumentTransitionCount = 0
    this.historyError = ""
    const error = new Error("The DOM editor component was disconnected")
    this.pendingExecutions.forEach(({reject, timer, abortCleanup}) => {
      clearTimeout(timer)
      abortCleanup?.()
      reject(error)
    })
    this.pendingExecutions.clear()
    super.disconnectedCallback()
  }

  private get editingUIProperties(): EditingUIProperties {
    return {
      svgText: this.svgText,
      canMark: this.canMark,
      canSection: this.canSection,
      sectionType: this.sectionType,
      sectionActive: this.sectionActive,
      sectionSelected: this.sectionSelected,
      layout: this.layoutSelection,
      layoutError: this.layoutError,
      marks: this.marks,
      allowedMarks: this.allowedMarks,
      markStyles: this.markStyles,
      markAttributes: this.markAttributes,
      ruby: this.ruby,
      commentState: this.commentState,
      listType: this.listType,
      listStyle: this.listStyle,
      orderedList: this.orderedList,
      headingGroup: this.headingGroup,
      figure: this.figure,
      media: this.mediaSelection,
      dialog: this.dialogSelection,
      graphic: this.graphicSelection,
      math: this.mathSelection,
      elementAttributes: this.elementAttributes,
      widgetOptions: this.widgetOptions,
      elementStyle: this.elementStyle,
      historyState: this.historyState,
      historyLoading: this.historyLoading,
      historyError: this.historyError,
    }
  }

  private boundEditingUIListeners: EditingUIListeners | undefined

  private get editingUIListeners(): EditingUIListeners {
    return this.boundEditingUIListeners ??= {
      "ribbon-button-click": this.handleRibbonButtonClick.bind(this),
      "snippet-hover-change": (event: Event) => {
        const hovered = Boolean((event as CustomEvent<{hovered: boolean}>).detail?.hovered)
        void this.execute({type: "hoverSnippet", hovered}).catch(() => {})
      },
      "ribbon-combobox-change": this.handleRibbonComboboxChange.bind(this),
      "section-type-change": this.handleSectionTypeChange.bind(this),
      "mark-attribute-change": this.handleMarkAttributeChange.bind(this),
      "ruby-action": this.handleRubyAction.bind(this),
      "list-attribute-change": this.handleListAttributeChange.bind(this),
      "heading-group-level-change": this.handleHeadingGroupLevelChange.bind(this),
      "comment-action": this.handleCommentAction.bind(this),
      "media-attribute-change": this.handleMediaAttributeChange.bind(this),
      "media-resource-action": this.handleMediaResourceAction.bind(this),
      "image-map-action": this.handleImageMapAction.bind(this),
      "element-attribute-change": this.handleElementAttributeChange.bind(this),
      "widget-option-change": this.handleWidgetOptionChange.bind(this),
      "widget-action": this.handleWidgetAction.bind(this),
      "widget-sharing-change": this.handleWidgetSharingChange,
      "widget-grouping-change": this.handleWidgetGroupingChange,
      "widget-grouping-context": this.handleWidgetGroupingContext,
      "media-type-change": this.handleMediaTypeChange.bind(this),
      "dialog-attribute-change": this.handleDialogAttributeChange.bind(this),
      "table-insert": this.handleTableInsert.bind(this),
      "layout-action": this.handleLayoutAction.bind(this),
      "table-style-change": this.handleTableStyleChange.bind(this),
      "graphic-parameter-change": this.handleGraphicParameterChange.bind(this),
      "graphic-layer-action": this.handleGraphicLayerAction.bind(this),
      "graphic-viewport-action": this.handleGraphicViewportAction.bind(this),
      "element-style-change": this.handleElementStyleChange.bind(this),
      "element-style-target-hover": this.handleElementStyleTargetHover.bind(this),
      "element-style-state-request": this.queueElementStyleRefresh.bind(this),
      "history-state-request": this.requestHistoryState.bind(this),
      "history-checkpoint-select": this.handleHistoryCheckpointSelect.bind(this),
      "history-revert": this.handleHistoryRevert.bind(this),
      "history-preview-clear": this.clearHistoryPreview.bind(this),
      "ribbon-input-pointerdown": this.handleRibbonInputPointerDown.bind(this),
      "ribbon-input-focus": this.handleRibbonInputFocus.bind(this),
      "ribbon-input-blur": this.handleRibbonInputBlur.bind(this),
      "ribbon-input-commit": this.finishRibbonInput.bind(this),
      "ribbon-input-cancel": this.finishRibbonInput.bind(this),
    }
  }

  render() {
    return html`
      <header class="app-bar">
        <app-ribbon
          ${bindEditingUI(this.editingUIProperties, this.editingUIListeners)}
          ?inert=${this.htmlPending}
          logo-url=${appIconUrl}
          .breadcrumbVisible=${this.breadcrumbVisible}
          .presenceUsers=${this.presenceUsers}
          .packages=${this.packages}
          .localPackages=${this.localPackages}
          .installedPackages=${this.installedPackages}
          .consoleOpen=${this.consoleOpen}
          .recentDocuments=${this.visibleRecentDocuments.map(({id, title}) => ({id, title}))}
          @recent-documents-refresh=${this.handleRecentDocumentsRefresh}
          @ribbon-submenu-open=${(event: CustomEvent<{label: string}>) => {if(event.detail.label === "Open") this.handleRecentDocumentsRefresh()}}
          @ribbon-dropdown-open=${(event: Event) => {if(event.composedPath().some(target => target instanceof HTMLElement && target.matches('ribbon-button[label="Open"]'))) this.handleRecentDocumentsRefresh()}}
          .selectedLocalPackageName=${this.selectedLocalPackageName}
          .packagesLoading=${this.packagesLoading}
          .busyPackageNames=${this.busyPackageNames}
          .packageError=${this.packageError}
          .fileName=${this.fileName}
          .fileDirty=${this.fileDirty}
          .previewActive=${this.previewActive}
          .liveSessionActive=${this.liveSessionActive}
          .liveSessionRole=${this.liveSessionRole}
          .liveSessionLink=${this.liveSessionLink}
          .liveLearners=${this.liveLearners}
          .settings=${this.settings}
          .editingSnippetId=${this.editingSnippetId}
          @ribbon-label-change=${this.handleSnippetNameChange}
          .backendClient=${this.backendClient}
          .backendState=${this.backendState}
          .cloudSessionWarning=${this.cloudSessionWarning}
          .aiDocumentToolHandler=${this.handleAIDocumentTool}
          .aiEditReviewHandler=${this.handleAIEditReview}
          @ribbon-preview-exit=${this.handleRibbonPreviewExit}
          @live-session-toggle=${this.toggleLiveSession}
          @live-learner-toggle=${this.handleLiveLearnerToggle}
          @file-name-change=${this.handleFileNameChange}
          @backend-login-request=${this.loginToBackend}
          @backend-admin-request=${this.openBackendAdmin}
          @ai-toolbox-change=${this.handleAIToolboxChange}
          @ribbon-collapse=${this.handleRibbonCollapse}
          @ribbon-expand=${this.handleRibbonExpand}
          @breadcrumb-visibility-change=${this.handleRibbonBreadcrumbVisibilityChange}
          @package-catalog-request=${this.loadPackageCatalog}
          @app-settings-change=${this.handleAppSettingsChange}
        ></app-ribbon>
        ${this.previewActive ? html`
          <live-session-controls
            .playing=${this.liveStreamPlaying}
            .currentTime=${this.liveStreamTime}
            .duration=${this.liveStreamDuration}
            .live=${this.liveSessionActive}
            @live-session-play=${this.playLiveSession}
            @live-session-pause=${this.pauseLiveSession}
            @live-session-seek=${this.seekLiveSession}
          ></live-session-controls>
        ` : html`
          <dom-editor-breadcrumb
            ?inert=${this.htmlPending}
            .path=${this.selectionPath}
            .showPositionIcons=${this.documentLayout.mode === "document"}
            .nodeSelected=${this.nodeSelection}
            .capture=${this.captureSelection}
            .gap=${this.selectionGap}
            .selectedSectionPath=${this.selectedSectionPath}
            .tree=${this.documentTree}
            ?hidden=${!this.breadcrumbVisible}
            @breadcrumb-tree-toggle=${this.handleBreadcrumbTreeToggle}
            @breadcrumb-item-select=${this.handleBreadcrumbItemSelect}
            @breadcrumb-item-hover=${this.handleBreadcrumbItemHover}
            @breadcrumb-section-select=${this.handleBreadcrumbSectionSelect}
            @breadcrumb-section-hover=${this.handleBreadcrumbSectionHover}
          ></dom-editor-breadcrumb>
        `}
      </header>
      <open-document-menu
        .mode=${this.documentDialogMode}
        .documents=${this.savedDocuments}
        .currentDocumentId=${this.backendDocumentId}
        .loading=${this.documentsLoading}
        .busy=${this.fileOperationActive}
        .error=${this.documentsError}
        @document-open=${this.handleSavedDocumentOpen}
        @document-save=${this.handleSavedDocumentSave}
        @document-delete=${this.handleSavedDocumentDelete}
        @documents-retry=${this.loadSavedDocuments}
      ></open-document-menu>
      <div class="document-stage" aria-busy=${this.previewFramePending ? "true" : "false"}>
        ${this.fileError ? html`
          <div class="file-error" role="alert">
            <span>${this.fileError}</span>
            <button type="button" @click=${() => { this.fileError = "" }}>Dismiss</button>
          </div>
        ` : ""}
        ${this.previewActive && !this.previewFramePending ? html`
          <iframe
            class="preview-frame"
            title=${this.liveSessionActive ? "Live document preview" : "Document preview"}
            sandbox="allow-scripts allow-same-origin"
            referrerpolicy="no-referrer"
            src=${import.meta.env.MODE === "test" ? nothing : this.frameShellURL("preview", this.previewFrameRevision)}
            srcdoc=${import.meta.env.MODE === "test" ? this.previewDocumentHTML ?? "" : nothing}
            @load=${this.handlePreviewFrameLoad}
          ></iframe>
        ` : ""}
        ${this.frameStarted ? html`<iframe
          class="editor-frame"
          title="DOM editor"
          sandbox="allow-scripts allow-same-origin"
          referrerpolicy="no-referrer"
          src=${import.meta.env.MODE === "test" ? nothing : this.frameShellURL("editor", this.frameRevision)}
          srcdoc=${import.meta.env.MODE === "test" ? this.editorSrcdoc : nothing}
          ?hidden=${this.previewActive && !this.previewFramePending}
          ?inert=${this.previewActive}
          @load=${this.handleEditorFrameLoad}
          @dom-editor-ai-edit-review=${this.handleInlineAIEditReview}
        ></iframe>` : ""}
        ${this.ribbonDrag && !this.previewActive ? html`<div class="ribbon-drag-shield"
          @dragenter=${this.relayRibbonDrag} @dragover=${this.relayRibbonDrag}
          @dragleave=${this.relayRibbonDrag} @drop=${this.relayRibbonDrag}></div>` : ""}
        ${this.liveSessionActive && this.liveSessionRole === "host" ? html`
          <live-session-overlay
            .learners=${this.liveOverlayLearners}
            .widgets=${this.liveOverlayWidgets}
            @live-widget-state-change=${this.handleLiveWidgetStateChange}
          ></live-session-overlay>
        ` : ""}
        ${this.mathSelection?.active && this.mathKeyboardHidden && !this.previewActive && !this.liveSessionActive ? html`
          <button class="math-keyboard-open" type="button" title="Show formula keyboard" aria-label="Show formula keyboard"
            @pointerdown=${(event: PointerEvent) => event.preventDefault()}
            @click=${() => { this.mathKeyboardHidden = false; this.focusEditor() }}
          >${ribbonIcon("Shortcuts")}</button>
        ` : ""}
        ${this.mathSelection?.active && !this.mathKeyboardHidden && !this.previewActive && !this.liveSessionActive ? html`
          <section class="math-keyboard-area" aria-label="Formula input">
            <dom-editor-math-keyboard
              .display=${this.mathSelection.display}
              @math-keyboard-command=${this.handleMathKeyboardCommand}
              @math-keyboard-close=${() => { this.mathKeyboardHidden = true; this.focusEditor() }}
            ></dom-editor-math-keyboard>
          </section>
        ` : ""}
      </div>
      <dom-editor-toolbox
        .disableAI=${this.settings.disableAI}
        .showStyleToolbox=${this.settings.showStyleToolbox}
        ${bindEditingUI(this.editingUIProperties, this.editingUIListeners)}
        .selectionPath=${this.selectionPath}
        .documentSelected=${this.nodeSelection && !this.captureSelection && this.selectionPath.length === 1}
        .documentLayout=${this.documentLayout}
        .documentLayoutError=${this.documentLayoutError}
        .documentHead=${this.documentHead}
        @document-head-action=${this.handleDocumentHeadAction}
        .consoleOpen=${this.consoleOpen}
        .htmlPending=${this.htmlPending}
        .table=${this.tableSelection}
        .aiSidebar=${!this.breadcrumbVisible && this.aiToolboxOpen}
        ?hidden=${(!this.breadcrumbVisible && !this.aiToolboxOpen) || this.previewActive || this.liveSessionActive}
        @toolbox-change=${this.handleToolboxChange}
        @document-layout-change=${this.handleDocumentLayoutChange}
        @developer-console-change=${this.handleDeveloperConsoleChange}
        @developer-console-pin-change=${this.handleDeveloperConsolePinChange}
      ></dom-editor-toolbox>
      ${(this.breadcrumbVisible || this.consoleOpen || this.settings.pinDeveloperConsole) && (!this.previewActive || this.settings.pinDeveloperConsole) && !this.liveSessionActive ? this.renderHTMLSourceEditor() : ""}
      ${this.previewActive || this.liveSessionActive ? "" : html`
        <div class="document-layouts-panel" ?inert=${this.documentLayoutsDismissed} aria-hidden=${String(this.documentLayoutsDismissed)}>
          <div class="document-layouts-clip">
            <section class="document-layouts-bar" aria-labelledby="document-layouts-title">
              <div class="document-layouts-heading">
                <h2 id="document-layouts-title">Layouts</h2>
                <h2 id="recent-documents-title" class="recent-documents-title">Recently opened</h2>
                <button class="document-layouts-close" type="button" aria-label="Hide layouts" title="Hide layouts"
                  @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
                  @mousedown=${(event: MouseEvent) => { if(event.button === 0) event.preventDefault() }}
                  @click=${async () => {
                    this.documentLayoutsDismissed = true
                    await this.updateComplete
                    this.focusEditor()
                  }}
                >×</button>
              </div>
              <div class="document-layouts-options">
                <div class="document-layout-cards" role="group" aria-label="Layouts">
                  ${documentLayoutModes.map(mode => renderDocumentLayoutCard(mode, this.documentLayout,
                    this.historyState.preview !== null || this.htmlPending,
                    selected => this.handleDocumentLayoutChange(new CustomEvent("document-layout-change", {detail: {mode: selected}})),
                  ))}
                </div>
                <nav class="document-layouts-documents" aria-labelledby="recent-documents-title">
                  ${this.visibleRecentDocuments.length ? html`<ul>${this.visibleRecentDocuments.map(document => html`<li>
                    <button class="document-layout-document" type="button" aria-label=${`Open ${document.title}`} title=${document.title}
                      ?disabled=${this.fileOperationActive || this.htmlPending || this.historyState.preview !== null}
                      @click=${() => this.openRecentDocument(document.id)}
                    >${ribbonIcon("Document")}<span>${document.title}</span></button>
                  </li>`)}</ul>` : html`<p>No recently opened documents</p>`}
                </nav>
              </div>
              ${this.documentLayoutError ? html`<p class="document-layout-error" role="alert">${this.documentLayoutError}</p>` : ""}
            </section>
          </div>
        </div>
      `}

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
