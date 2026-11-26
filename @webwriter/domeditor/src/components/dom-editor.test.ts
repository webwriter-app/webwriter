// @vitest-environment happy-dom
import * as Y from "yjs"
import {SharedDOMDoc} from "../domdoc"
import {restoreSnapshotTextNodeRuns} from "../editor-bridge"
import type {EditorDocumentUpdate} from "../editor-document-sync"
import {emptyVersionHistoryState} from "../editor-bridge"
import {documentThemeProperties} from "../document-theme-options"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {webcrypto} from "node:crypto"
import {nothing} from "lit"
import {documentRecoveryMaxStalenessMs, documentRecoveryPollMs, documentRecoveryQuietMs, DomEditor} from "./dom-editor"
import {excludedMarkNames} from "../marks"
import {AppRibbon} from "./ribbon"
import {elementDragType, ribbonInsertionDragType} from "./insertion-menu"
import type {DomEditorToolbox} from "./toolbox"
import type {ElementStyleEditor} from "./element-style-editor"
import type {ShapeKeyboard} from "./shape-keyboard"
import type {MathKeyboard} from "./math-keyboard"
import type {LinkKeyboard} from "./link-keyboard"
import {DomEditorBreadcrumb, type DocumentTreeItem} from "./breadcrumb"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonCombobox} from "./ribbon-combobox"
import type {RibbonMenu} from "./ribbon-menu"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonTab} from "./ribbon-tab"
import type {OpenDocumentMenu} from "./open-document-menu"
import {
  captureSnapshotTextNodeRuns,
  editorFrameControlMessage,
  executeCompleteEvent,
  executeFailureEvent,
  aiEditReviewEvent,
  initializeEditorMessage,
  loadWidgetsMessage,
  markStateChangeEvent,
  presenceChangeEvent,
  documentHeadStateChangeEvent,
  undoStateChangeEvent,
  selectionChangeEvent,
  shapeKeyboardInputEvent,
  mathKeyboardTabEvent,
  type VersionHistoryState,
} from "../editor-bridge"
import {WEBWRITER_GENERATOR, emptyDocumentHeadState} from "../document-head"
import {INSTALLED_PACKAGES_STORAGE_KEY, WebWriterPackageRegistry, type WebWriterPackage} from "../packages"
import * as packageDependencies from "../package-dependencies"
import * as offlineBundler from "../offline-module-bundler"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "../local-package-worker"

// Linking the installed widget scripts would trace them on the CDN. Tests resolve an empty map at once.
vi.mock("../package-dependencies", async importOriginal => ({
  ...await importOriginal<typeof import("../package-dependencies")>(),
  resolvePackageDependencies: vi.fn(async(packages: WebWriterPackage[]) => ({entries: packages.flatMap(pkg => pkg.scripts), map: {}})),
}))
vi.mock("../live-session-recovery", () => ({
  LiveSessionRecovery: class { async finish() {} },
  listRecoveredSessions: vi.fn(async () => []),
  readRecoveredSession: vi.fn(async () => { throw new Error("No recovered session") }),
  deleteRecoveredSession: vi.fn(async () => {}),
}))
import {LocalPackageWorkerClient} from "../local-package-worker-client"
import {LiveSession} from "../live-session"
import {distributionTarget, emptyDistributionConfig, encodeDistributionConfig} from "../distribution.js"
import {readDistributionConfigs} from "../distribution-dom"
import {IncrementalPreviewRecorder} from "../live-session-incremental"
import {createLiveSessionReplayFile, readLiveSessionReplayFile} from "../live-session-replay"
import {LiveSessionReplayClient} from "../live-session-replay-client"
import * as liveRecovery from "../live-session-recovery"
import {createReplayWorkerHandler, type ReplayWorkerRequest, type ReplayWorkerResponse} from "../live-session-replay-worker"
import type {LiveSessionOverlay} from "./live-session-overlay"
import type {LiveSessionControls} from "./live-session-controls"
import {APP_SETTINGS_STORAGE_KEY, defaultAppSettings, formatShortcut, loadAppSettings, loadDocumentSettings, type AppSettings} from "../app-settings"
import * as recentDocumentStorage from "../recent-documents"
import * as documentRecoveryStorage from "../document-recovery"

class ReplayTestWorker {
  onmessage: ((event: {data: ReplayWorkerResponse}) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessageerror: (() => void) | null = null
  private readonly handler = createReplayWorkerHandler()
  private queue = Promise.resolve()
  private stopped = false
  postMessage(request: ReplayWorkerRequest) {
    this.queue = this.queue.then(async () => {
      if(this.stopped) return
      const response = await this.handler.handle(request)
      if(!this.stopped) this.onmessage?.({data: response})
    })
  }
  terminate() { this.stopped = true; this.handler.close() }
}

const configureCloudStorage = (host: any) => {
  host.settings = {...host.settings, cloudServicesConfigured: true, activeCloudServiceId: "test-cloud",
    cloudServices: [{id: "test-cloud", type: "url", url: "http://localhost:1234/api", username: "Tester", authentication: "none"}]}
}

function seedRecoveryDraft(editor: DomEditor) {
  const record = {id: crypto.randomUUID(), title: "Draft", updatedAt: 1}
  Object.assign(editor, {activeDocumentRecovery: {id: record.id, release() {}}, documentRecoveryCheckpoint: record})
  return record
}

const demoPackage: WebWriterPackage = {
  name: "@webwriter/demo",
  version: "1.0.0",
  label: "Demo",
  description: "Demo package",
  iconUrl: "https://example.com/demo.svg",
  authors: ["Ada"],
  license: "MIT",
  keywords: ["webwriter-widget"],
  links: {},
  scripts: ["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.0.0/dist/demo.js"],
  styles: ["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.0.0/dist/demo.css"],
  members: [{
    id: "@webwriter/demo@1.0.0:./widgets/webwriter-demo",
    packageName: "@webwriter/demo",
    packageVersion: "1.0.0",
    exportName: "./widgets/webwriter-demo.*",
    kind: "widget",
    label: "Demo Widget",
    insertable: true,
    iconUrl: "https://example.com/demo.svg",
    tagName: "webwriter-demo",
  }, {
    id: "@webwriter/demo@1.0.0:./snippets/demo",
    packageName: "@webwriter/demo",
    packageVersion: "1.0.0",
    exportName: "./snippets/demo.html",
    kind: "snippet",
    label: "Demo Snippet",
    insertable: true,
    htmlUrl: "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.0.0/dist/demo.html",
  }],
}

const localPackageDirectory = (withBundle: boolean | {current: boolean} = true, packageName = "@local/demo") => {
  const bundleAvailable = () => typeof withBundle === "boolean" ? withBundle : withBundle.current
  const manifest = JSON.stringify({
    name: packageName,
    version: "0.1.0",
    keywords: ["webwriter-widget"],
    exports: {
      "./widgets/local-demo.*": {source: "./src/local-demo.ts", default: "./dist/local-demo.*"},
    },
  })
  const file = (name: string, contents: string) => ({
    name,
    kind: "file",
    getFile: async () => new File([contents], name, {type: name.endsWith(".js") ? "text/javascript" : "application/json", lastModified: 1}),
  })
  const dist = {
    name: "dist",
    kind: "directory",
    getDirectoryHandle: async () => { throw Object.assign(new Error("Missing directory"), {name: "NotFoundError"}) },
    getFileHandle: async (name: string) => {
      if(bundleAvailable() && name === "local-demo.js") return file(name, "customElements.define('local-demo', class extends HTMLElement {})")
      throw Object.assign(new Error(`Missing ${name}`), {name: "NotFoundError"})
    },
  }
  return {
    name: "demo-package",
    kind: "directory",
    getFileHandle: async (name: string) => {
      if(name === "package.json") return file(name, manifest)
      throw Object.assign(new Error(`Missing ${name}`), {name: "NotFoundError"})
    },
    getDirectoryHandle: async (name: string) => {
      if(name === "dist") return dist
      throw Object.assign(new Error(`Missing ${name}`), {name: "NotFoundError"})
    },
  } as unknown as FileSystemDirectoryHandle
}

function mockSaveSnapshot(editor: DomEditor, source: string) {
  return vi.spyOn(editor, "execute").mockImplementation(async action => {
    if(action.type === "prepareVersionSave") return {checkpointId: "saved-checkpoint", source}
    if(action.type === "recordVersionSave") return emptyVersionHistoryState()
    return source
  })
}

function wirePackageLoadCompletion(editorWindow: Window) {
  const postMessage = vi.spyOn(editorWindow, "postMessage")
  postMessage.mockImplementation((message: any) => {
    if(message?.type !== loadWidgetsMessage || typeof message.requestId !== "string") return
    queueMicrotask(() => window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: executeCompleteEvent,
        detail: {requestId: message.requestId, result: undefined},
        bridgeNonce: message.bridgeNonce,
      },
      source: editorWindow,
      origin: window.location.origin,
    })))
  })
  return postMessage
}

function completePendingPackageLoad(editor: DomEditor) {
  const requestId = [...(editor as any).pendingExecutions.keys()]
    .find((id: string) => id.startsWith("packages-"))
  if(!requestId) throw new Error("No pending package load request")
  const editorWindow = (editor as any).editorWindow as Window
  window.dispatchEvent(new MessageEvent("message", {
    data: {
      type: executeCompleteEvent,
      detail: {requestId, result: undefined},
      bridgeNonce: (editor as any).bridgeNonce,
    },
    source: editorWindow,
    origin: window.location.origin,
  }))
}

const mountedEditors = new Set<DomEditor>()

async function mountEditor(configure?: (editor: DomEditor) => void) {
  const editor = new DomEditor()
  mountedEditors.add(editor)
  Object.assign(editor, {frameStarted: true})
  configure?.(editor)
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  // Virtual frames do not execute DOMEditor, which supplies the initial paragraph.
  if(!iframe.contentDocument!.body.childNodes.length) {
    iframe.contentDocument!.body.append(iframe.contentDocument!.createElement("p"))
  }
  wirePackageLoadCompletion(iframe.contentWindow!)
  iframe.dispatchEvent(new Event("load"))
  await (editor as any).packageLoadPromise
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

const testMirrors: SharedDOMDoc[] = []
const frameMirrorSources = new WeakMap<object, {owner: Document, shared: SharedDOMDoc, vector: Uint8Array}>()
afterEach(() => { testMirrors.splice(0).forEach(shared => shared.destroy()) })

function frameUpdate(host: any, source: Document | string, textNodeRuns?: unknown): EditorDocumentUpdate & {bridgeNonce: string} {
  if(host.editorOpaque) { host.documentTreeObserver?.disconnect(); host.documentTreeObserver = null }
  const owner = typeof source === "string" ? new DOMParser().parseFromString(source, "text/html") : source
  if(textNodeRuns) restoreSnapshotTextNodeRuns(owner.body, textNodeRuns)
  let state = frameMirrorSources.get(host)
  const reset = !state || state.owner !== owner || !host.documentReplica
  if(reset) {
    const shared = new SharedDOMDoc(undefined, undefined, ["contenteditable", "spellcheck"], ["◆"], {root: owner.body})
    testMirrors.push(shared)
    state = {owner, shared, vector: new Uint8Array([0])}
    frameMirrorSources.set(host, state)
  }
  state!.shared.flushDOMChanges()
  const update = Y.encodeStateAsUpdate(state!.shared.doc, reset ? undefined : state!.vector)
  state!.vector = Y.encodeStateVector(state!.shared.doc)
  return {type: "editor-frame-update", bridgeNonce: host.bridgeNonce, replicaId: host.documentReplicaId, sequence: host.documentReplicaSequence + 1,
    reset, update, doctype: null}
}

describe("incremental frame replica", () => {
  it("passes the frame's insertion availability to the ribbon", async () => {
    const {editor, editorWindow} = await mountEditor()
    const select = async (unavailableInsertions: string[]) => {
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: selectionChangeEvent,
        detail: {path: [], unavailableInsertions}}}))
      await editor.updateComplete
    }
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await select(["element:table"])
    const unavailable = ribbon.unavailableInsertions
    expect(unavailable.has("element:table")).toBe(true)
    await select(["element:table"])
    expect(ribbon.unavailableInsertions).toBe(unavailable)
    await select([])
    expect(ribbon.unavailableInsertions.size).toBe(0)
  })

  it("keeps deeper widget chevrons and outline actions aligned with adjacent text-node paths", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.editorOpaque = true
    host.fileHandle = {}
    vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    const live = iframe.contentDocument!
    live.body.innerHTML = '<webwriter-timeline><webwriter-timeline-event><webwriter-timeline-event-title>Title</webwriter-timeline-event-title><webwriter-timeline-event-details><p>Details</p></webwriter-timeline-event-details></webwriter-timeline-event></webwriter-timeline>'
    const timeline = live.querySelector("webwriter-timeline")!
    const event = live.querySelector("webwriter-timeline-event")!
    const details = live.querySelector("webwriter-timeline-event-details")!
    timeline.prepend(live.createTextNode("\n"), live.createTextNode("\n"))
    event.prepend(live.createTextNode(""))
    details.prepend(live.createTextNode(""), live.createTextNode(" "))
    const html = live.body.innerHTML
    const publish = () => window.dispatchEvent(new MessageEvent("message", {
      source: iframe.contentWindow,
      data: frameUpdate(host, live),
    }))
    const selectParagraph = (eventIndex: number) => host.selectionPath = [
      {path: [], name: "Document"}, {path: [0], name: "Timeline"},
      {path: [0, eventIndex], name: "Timeline Event"},
      {path: [0, eventIndex, 2], name: "Timeline Event Details"},
      {path: [0, eventIndex, 2, 2], name: "Paragraph"},
    ]
    publish()
    selectParagraph(2)
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const toggle = (name: string) => breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(`.separator-trigger[aria-label="Show ${name} tree"]`)
    expect(toggle("Timeline Event")).not.toBeNull()
    expect(toggle("Timeline Event Details")).not.toBeNull()
    expect(toggle("Paragraph")).toBeNull()
    expect(host.editorBody.children[0].childNodes.length).toBe(timeline.childNodes.length)
    toggle("Timeline Event")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    expect(menu.groups[0].buttons.map(button => typeof button === "string" ? button : button.action))
      .toEqual(["outline:0,2,1", "outline:0,2,2"])
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="outline:0,2,2"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: [0, 2, 2]})

    // An empty text node changes live paths without changing serialized HTML.
    ;(timeline.firstChild as Text).splitText(0)
    expect(live.body.innerHTML).toBe(html)
    publish()
    selectParagraph(3)
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(host.documentTree.children[0].children[0].path).toEqual([0, 3])
    expect(toggle("Timeline Event")).not.toBeNull()
    expect(toggle("Timeline Event Details")).not.toBeNull()
  })

  it("updates text and geometry without parsing or rebuilding the outline, and ignores duplicate updates", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.editorOpaque = true
    host.fileHandle = {}
    host.documentTreeObserver.disconnect()
    vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    const source = iframe.contentDocument!
    source.body.innerHTML = '<p arbitrary="keep">Before<!--keep--></p>'
    const publish = (message = frameUpdate(host, source)) => {
      window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: message}))
      return message
    }
    publish()
    host.editorDocument = null
    const initialTree = host.documentTree
    const tree = vi.spyOn(host, "buildDocumentTree")
    const canonical = vi.spyOn(host, "authoredDocumentSnapshot")
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString")
    ;(source.querySelector("p")!.firstChild as Text).data = "Changed"
    const message = publish()
    expect(host.editorBody.textContent).toBe("Changed")
    expect(host.editorBody.children[0].getAttribute("arbitrary")).toBe("keep")
    expect(host.editorBody.children[0].childNodes[1]).toMatchObject({nodeType: 8, textContent: "keep"})
    expect(host.documentTree).toBe(initialTree)
    expect(tree).not.toHaveBeenCalled()
    expect(canonical).not.toHaveBeenCalled()
    const sequence = host.documentChangeSequence
    publish(message)
    expect(host.documentChangeSequence).toBe(sequence)
    source.querySelector<HTMLElement>("p")!.style.left = "15px"
    publish()
    expect(host.editorBody.children[0].getAttribute("style")).toContain("15px")
    expect(tree).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
    // A structural update only marks the outline stale. The breadcrumb then
    // reads its own entries, and the whole outline waits for a reader.
    source.body.append(source.createElement("custom-widget"))
    publish()
    expect(tree).not.toHaveBeenCalled()
    await editor.updateComplete
    expect(tree.mock.calls).toEqual([[[[]]]])
    expect(host.documentTree).not.toBe(initialTree)
    expect(tree).toHaveBeenCalledTimes(2)
    expect(host.documentTree.children.map((item: DocumentTreeItem) => item.name)).toEqual(["Paragraph", "Widget"])
    expect(tree).toHaveBeenCalledTimes(2)
    expect(host.editorDocument).toBeNull()
  })

  const outlineFixtures = {
    document: ["", `<section><ul><li><p>a</p></li></ul><aside></aside><div><footer></footer></div><div class="note"><p>n</p></div></section>`
      + `<p>text <b>bold <span>x</span><custom-inline></custom-inline></b><i></i></p>`
      + `<figure><img src="a.png"><figcaption>cap</figcaption></figure>`
      + `<figure><blockquote><header></header><p>q</p></blockquote></figure>`
      + `<figure><p>one</p><p>two</p></figure>`
      + `<table><thead><tr><th><p>head</p></th></tr></thead><tbody><tr><td></td><td><p>cell</p></td></tr>`
      + `<tr><td><table><tbody><tr><td><p>nested</p></td></tr></tbody></table></td><td><aside></aside></td></tr></tbody>`
      + `<tfoot><tr><td><footer></footer><img></td></tr></tfoot></table>`
      + `<details><summary>s</summary><p>d</p></details>`
      + `<div class="ww-popup"><button popovertarget="pop">Open</button><div id="pop" popover><p>in</p></div><p>beside</p></div>`
      + `<div class="ww-popup"><button popovertarget="far">Far</button></div>`
      + `<img src="map.png" usemap="#m"><map name="m"><area popovertarget="spot"></map>`
      + `<div id="spot" popover><p>spot</p></div>`
      + `<blockquote><header></header><nav></nav></blockquote>`
      + `<custom-widget><p>slot</p><script type="application/json">{}</script></custom-widget>`
      + `<main><article><h2>t</h2><section></section></article></main>`
      + `<div id="far" class="ww-popup-content" popover><section><p>far</p></section></div><p>last</p>`],
    slides: ["ww-slides", `<div class="ww-slides-viewport"><section class="ww-slide"><h2>S</h2><aside></aside><nav class="ww-slide-directions"></nav></section>`
      + `<section class="ww-slide"></section></div><nav class="ww-slides-navigation"></nav>`],
    board: ["ww-board", `<section class="ww-board-group"><h2>G</h2><section class="ww-board-column"><h2>C</h2>`
      + `<article class="ww-board-card"><p>card</p><footer></footer></article></section></section><section class="ww-board-column"></section>`],
    canvas: ["ww-canvas", `<div class="ww-canvas-starting-view"></div><p>a</p><div><p>b</p></div>`
      + `<figure><img src="a.png"></figure><blockquote><p>q</p><aside></aside></blockquote>`],
    template: ["", `<!--keep--><demo-deck role="document"><section><p>one</p><aside></aside></section><p>two <b>bold</b></p></demo-deck>`],
  }

  it.each(Object.keys(outlineFixtures).flatMap(name => [[name, false], [name, true]] as const))(
    "answers breadcrumb entries of a %s like its whole outline (isolated frame: %s)", async (name, isolated) => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const source = iframe.contentDocument!
    const [layout, content] = outlineFixtures[name as keyof typeof outlineFixtures]
    source.body.className = layout
    source.body.innerHTML = content
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
      window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, source)}))
      host.editorDocument = null
    }
    else host.documentTreeObserver.disconnect()
    const whole = host.buildDocumentTree() as DocumentTreeItem
    const find = (item: DocumentTreeItem, path: number[]): DocumentTreeItem | null => item.path.join() === path.join() ? item
      : item.children.reduce<DocumentTreeItem | null>((match, child) => match ?? find(child, path), null)
    const facts = (item: DocumentTreeItem | null | undefined) => item ? {sections: item.sections ?? [], children: item.children.length > 0} : null
    const paths: number[][] = []
    const collect = (element: {childNodes: ArrayLike<{nodeType: number}>}, path: number[]) => Array.from(element.childNodes).forEach((child, index) => {
      if(child.nodeType !== 1) return
      paths.push([...path, index])
      collect(child as unknown as Element, [...path, index])
    })
    collect(host.editorBody, [])
    expect(paths.length).toBeGreaterThan(5)
    if(name === "template") expect(whole.path).toEqual([1])
    else if(name !== "document") expect(whole.name).toBe(({slides: "Slides", board: "Board", canvas: "Canvas"} as Record<string, string>)[name])
    const tree = vi.spyOn(host, "buildDocumentTree")
    const answer = (path: number[], entries: number[][]) => {
      host.selectionPath = entries.map(entry => ({path: entry, name: ""}))
      const items = host.breadcrumbPathItems() as DocumentTreeItem[]
      for(const entry of entries) {
        expect({path: entry, facts: facts(items.find(item => item.path.join() === entry.join()))})
          .toEqual({path: entry, facts: facts(find(whole, entry))})
      }
      return path
    }
    const ancestors = (path: number[]) => Array.from({length: path.length + 1}, (_, length) => path.slice(0, length))
    const plain = paths.filter(path => !host.pathCrossesPopup(path))

    // The entries of a selection, with earlier answers kept as selections move.
    host.invalidateDocumentTree()
    for(const path of plain) answer(path, ancestors(path))
    // One entry alone, reached through ancestors that are not entries.
    for(const path of plain) {
      host.invalidateDocumentTree()
      answer(path, [path])
    }
    expect(tree.mock.calls.length).toBeGreaterThan(plain.length)
    expect(tree.mock.calls.every(([targets]) => Array.isArray(targets))).toBe(true)

    // Popup parts are listed away from where they are authored: only the whole outline places them.
    const popups = paths.filter(path => host.pathCrossesPopup(path))
    expect(popups.length > 0).toBe(name === "document")
    for(const path of popups) {
      host.invalidateDocumentTree()
      tree.mockClear()
      answer(path, ancestors(path))
      expect(tree.mock.calls).toEqual([[]])
    }
  })

  it("keeps breadcrumb chevrons and sections current across structural updates, and builds the outline when it opens", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const host = editor as any
    host.editorOpaque = true
    host.fileHandle = {}
    vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    const source = iframe.contentDocument!
    source.body.innerHTML = "<blockquote><p>Quote</p></blockquote><ul><li></li></ul><p>Tail</p>"
    const publish = async () => {
      window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, source)}))
      await editor.updateComplete
      await breadcrumb.updateComplete
    }
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await publish()
    host.editorDocument = null
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: selectionChangeEvent, detail: {path: [
      {path: [], name: "Document", icon: "Document"},
      {path: [1], name: "List", icon: "List"},
      {path: [1, 0], name: "List Item", icon: "Lists"},
    ]}}}))
    await editor.updateComplete
    await breadcrumb.updateComplete
    const tree = vi.spyOn(host, "buildDocumentTree")
    const toggles = () => Array.from(breadcrumb.shadowRoot!.querySelectorAll(".separator-trigger"), toggle => toggle.getAttribute("aria-label"))
    const sections = () => Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLElement>(".section-item"), section => section.dataset.sectionPath)
    expect(toggles()).toEqual(["Show Document tree", "Show List tree"])
    expect(sections()).toEqual([])
    const items = breadcrumb.pathItems

    // Typing changes no structure: nothing is read again.
    ;(source.querySelector("p")!.firstChild as Text).data = "Quoted"
    await publish()
    expect(tree).not.toHaveBeenCalled()
    expect(breadcrumb.pathItems).toBe(items)

    // An edit elsewhere leaves the entries as they were, so the breadcrumb is not updated.
    source.body.append(source.createElement("p"))
    await publish()
    expect(tree.mock.calls).toEqual([[[[], [1], [1, 0]]]])
    expect(breadcrumb.pathItems).toBe(items)
    expect(breadcrumb.tree).toBeNull()

    // The selected item gains a child and an empty section.
    const item = source.querySelector("li")!
    item.append(source.createElement("p"), source.createElement("aside"))
    await publish()
    expect(breadcrumb.pathItems).not.toBe(items)
    expect(toggles()).toEqual(["Show Document tree", "Show List tree", "Show List Item tree"])
    expect(sections()).toEqual(["1,0,1"])
    item.querySelector("p")!.remove()
    await publish()
    expect(toggles()).toEqual(["Show Document tree", "Show List tree"])
    expect(sections()).toEqual(["1,0,0"])
    expect(tree.mock.calls.every(([targets]) => Array.isArray(targets))).toBe(true)

    // Opening the outline builds it, once, from the document as it is now.
    tree.mockClear()
    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".separator-trigger")[0].click()
    expect(tree.mock.calls).toEqual([[]])
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)
    expect(breadcrumb.tree!.children.map(child => child.name)).toEqual(["Paragraph", "List", "Paragraph", "Paragraph"])
    expect(breadcrumb.tree!.children[1].children[0].sections).toEqual([expect.objectContaining({path: [1, 0, 0], type: "aside"})])
    const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    expect(menu.groups[0].buttons.map(button => typeof button === "string" ? button : button.action))
      .toEqual(["outline:0,0", "outline:1", "outline:2", "outline:3"])
    expect(tree).toHaveBeenCalledOnce()

    // An authored change closes the popup, and the stale outline is dropped.
    source.body.append(source.createElement("hr"))
    await publish()
    expect(breadcrumb.treeOpen).toBe(false)
    expect(breadcrumb.tree).toBeNull()
    expect(tree.mock.calls.slice(1).every(([targets]) => Array.isArray(targets))).toBe(true)
  })

  it("rebuilds an open outline at most once per frame", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    iframe.contentDocument!.body.innerHTML = "<p>One</p>"
    await new Promise(resolve => setTimeout(resolve, 0))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    const opened = breadcrumb.tree
    expect(opened!.children.map(child => child.name)).toEqual(["Paragraph"])
    const tree = vi.spyOn(host, "buildDocumentTree")
    const frames: FrameRequestCallback[] = []
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => frames.push(callback))
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
    try {
      // Changes that leave the popup open, such as editor-owned nodes.
      host.documentTreeObserver.disconnect()
      iframe.contentDocument!.body.append(iframe.contentDocument!.createElement("ul"))
      for(let update = 0; update < 3; update++) host.invalidateDocumentTree()
      await editor.updateComplete
      expect(frames).toHaveLength(1)
      expect(tree.mock.calls.every(([targets]) => Array.isArray(targets))).toBe(true)
      expect(breadcrumb.tree).toBe(opened)
      tree.mockClear()
      frames[0](0)
      expect(tree.mock.calls).toEqual([[]])
      await editor.updateComplete
      expect(breadcrumb.tree!.children.map(child => child.name)).toEqual(["Paragraph", "List"])

      // A frame still pending when the editor goes away is cancelled.
      host.invalidateDocumentTree()
      expect(frames).toHaveLength(2)
      editor.remove()
      expect(cancel).toHaveBeenCalledWith(2)
    }
    finally {
      request.mockRestore()
      cancel.mockRestore()
    }
  })

  it("rebuilds the live document tree for authored structure and presentation changes, not selection", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const host = editor as any
    vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    const tree = vi.spyOn(host, "buildDocumentTree")
    const select = () => window.dispatchEvent(new MessageEvent("message", {
      source: editorWindow,
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}]}},
    }))
    const flushMutations = () => new Promise(resolve => setTimeout(resolve, 0))
    await flushMutations()
    tree.mockClear()

    select()
    expect(tree).not.toHaveBeenCalled()

    iframe.contentDocument!.body.classList.add("ww-canvas")
    await flushMutations()
    expect(tree).toHaveBeenCalled()
    expect(host.documentTree.name).toBe("Canvas")

    const presentations = tree.mock.calls.length
    iframe.contentDocument!.body.append(iframe.contentDocument!.createElement("custom-widget"))
    await flushMutations()
    expect(tree.mock.calls.length).toBeGreaterThan(presentations)
    expect(host.documentTree.children.map((item: DocumentTreeItem) => item.name)).toEqual(["Paragraph", "Widget"])
    const structuralChange = tree.mock.calls.length
    select()
    expect(tree).toHaveBeenCalledTimes(structuralChange)
  })

  it("reuses canonical comparisons only for an immutable opaque snapshot", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const first = host.authoredDocumentSnapshot(true)
    const clone = vi.spyOn(host.editorDocument.documentElement, "cloneNode")
    expect(host.authoredDocumentSnapshot(true)).toBe(first)
    expect(clone).not.toHaveBeenCalled()
    host.editorDocument = new DOMParser().parseFromString('<p>New</p>', "text/html")
    expect(host.authoredDocumentSnapshot(true)).not.toBe(first)
    // Ordinary live-DOM callers never use a cached comparison.
    host.editorDocument.body.querySelector("p").textContent = "Direct edit"
    expect(host.authoredDocumentSnapshot()).toContain("Direct edit")
  })
})

describe("guided tour", () => {
  const flushTour = async(editor: DomEditor) => {
    await new Promise(resolve => setTimeout(resolve, 0))
    await editor.updateComplete
  }
  const tour = (editor: DomEditor) => editor.shadowRoot!.querySelector<HTMLElement>("guided-tour")
  const reenable = async(editor: DomEditor) => {
    editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
      detail: {...(editor as any).settings, showGuidedTour: true}, bubbles: true, composed: true,
    }))
    await editor.updateComplete
  }
  const flushMutations = () => new Promise(resolve => setTimeout(resolve, 0))

  it("shows after the initial frame is ready, and dismissal persists across reload", async() => {
    const {editor} = await mountEditor()
    await flushTour(editor)
    expect(tour(editor)).not.toBeNull()

    tour(editor)!.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Dismiss tour"]')!.click()
    await editor.updateComplete
    expect(tour(editor)).toBeNull()
    expect(loadAppSettings().showGuidedTour).toBe(false)

    const reloaded = await mountEditor()
    await flushTour(reloaded.editor)
    expect(tour(reloaded.editor)).toBeNull()
  })

  it("can be reenabled from app settings", async() => {
    const {editor} = await mountEditor(editor => {
      Object.assign(editor, {settings: {...(editor as any).settings, showGuidedTour: false}})
    })
    await flushTour(editor)
    expect(tour(editor)).toBeNull()
    await reenable(editor)
    expect(tour(editor)).not.toBeNull()
    expect(loadAppSettings().showGuidedTour).toBe(true)
  })

  it("dismisses on authored text, attribute, custom element, head, and template edits", async() => {
    const {editor, iframe} = await mountEditor()
    await flushTour(editor)
    const doc = iframe.contentDocument!
    doc.querySelector("p")!.textContent = "Initial text"
    await flushMutations()
    const mutate = async(change: () => void) => {
      await reenable(editor)
      expect(tour(editor)).not.toBeNull()
      change()
      await flushMutations()
      await editor.updateComplete
      expect(tour(editor)).toBeNull()
    }

    await mutate(() => { doc.querySelector("p")!.firstChild!.textContent = "Edited" })
    await mutate(() => { doc.querySelector("p")!.setAttribute("title", "Authored") })
    await mutate(() => { doc.body.append(doc.createElement("custom-element")) })
    await mutate(() => { doc.head.append(doc.createElement("meta")) })
    const template = doc.createElement("template")
    doc.body.append(template)
    await flushMutations()
    // The template itself is authored content, so reenable after inserting it.
    await mutate(() => { template.content.append(doc.createTextNode("Template content")) })
  })

  it("stays open for editor markers and widget shadow mutations", async() => {
    const {editor, iframe} = await mountEditor()
    const doc = iframe.contentDocument!
    const widget = doc.createElement("custom-widget")
    const shadow = widget.attachShadow({mode: "open"})
    doc.body.append(widget)
    await flushMutations()
    await reenable(editor)
    expect(tour(editor)).not.toBeNull()

    doc.querySelector("p")!.classList.add("◆selection")
    await flushMutations()
    await editor.updateComplete
    expect(tour(editor)).not.toBeNull()

    shadow.append(doc.createElement("span"))
    await flushMutations()
    await editor.updateComplete
    expect(tour(editor)).not.toBeNull()
  })

  it("dismisses when an opaque frame publishes an authored snapshot change", async() => {
    const {editor, iframe} = await mountEditor()
    await flushTour(editor)
    const host = editor as any
    host.editorOpaque = true
    vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    window.dispatchEvent(new MessageEvent("message", {
      source: iframe.contentWindow,
      data: frameUpdate(host, host.editorDocument),
    }))
    await editor.updateComplete
    expect(tour(editor)).not.toBeNull()

    const html = '<html><head></head><body><p>Authored snapshot edit</p></body></html>'
    window.dispatchEvent(new MessageEvent("message", {
      source: iframe.contentWindow,
      data: frameUpdate(host, html),
    }))
    await editor.updateComplete
    expect(tour(editor)).toBeNull()
    expect(loadAppSettings().showGuidedTour).toBe(false)
  })
})

function dispatchMarkState(editor: DomEditor, editorWindow: Window, detail: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent("message", {
    data: {type: markStateChangeEvent, detail, bridgeNonce: (editor as any).bridgeNonce},
    source: editorWindow,
    origin: window.location.origin,
  }))
}

afterEach(async() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  const editors = new Set([...mountedEditors, ...document.body.querySelectorAll<DomEditor>("dom-editor")])
  // Release Happy DOM's nested iframe documents before detaching editors. A
  // preview test can leave both the editor and preview browsing contexts alive
  // until the next GC cycle, which makes the later tests time out as a suite.
  const frames = [
    ...document.body.querySelectorAll<HTMLIFrameElement>("iframe"),
    ...Array.from(editors)
      .flatMap(editor => Array.from(editor.shadowRoot?.querySelectorAll<HTMLIFrameElement>("iframe") ?? [])),
  ]
  frames.forEach(iframe => iframe.remove())
  document.body.replaceChildren()
  // Vitest retains restored spies, including their target instances. Release
  // each discarded fixture's Lit tree, even if a test detached its editor.
  for(const editor of editors) {
    editor.remove()
    Object.assign(editor, {render: () => nothing})
    editor.requestUpdate()
    await editor.updateComplete
  }
  mountedEditors.clear()
  const url = new URL(location.href)
  url.searchParams.delete("open")
  url.searchParams.delete("example")
  url.searchParams.delete("layout")
  history.replaceState(history.state, "", url.href)
  localStorage.removeItem(INSTALLED_PACKAGES_STORAGE_KEY)
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
  localStorage.removeItem("webwriter_pinned_document_v1")
  await (window as unknown as {happyDOM: {abort(): Promise<void>}}).happyDOM.abort()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
  vi.spyOn(WebWriterPackageRegistry.prototype, "latestCompatibleVersion").mockImplementation(async (_name, version) => version)
  vi.spyOn(WebWriterPackageRegistry.prototype, "publishedPackageManifest").mockImplementation(async (name, version) => ({name, version, deprecated: undefined}))
  // Bridge messages in these component tests are dispatched directly instead
  // of crossing the iframe's postMessage implementation. Add the same
  // per-editor nonce that production messages carry so tests exercise the
  // authenticated path rather than bypassing it.
  const dispatch = window.dispatchEvent.bind(window)
  vi.spyOn(window, "dispatchEvent").mockImplementation(event => {
    const editor = document.body.querySelector("dom-editor") as unknown as {bridgeNonce?: string} | null
    if(event instanceof MessageEvent && editor && event.data && typeof event.data === "object"
      && typeof editor.bridgeNonce === "string" && !("bridgeNonce" in event.data)) {
      event = new MessageEvent(event.type, {
        data: {...event.data, bridgeNonce: editor.bridgeNonce},
        source: event.source,
        origin: event.origin,
      })
    }
    return dispatch(event)
  })
})

describe("DomEditor document loading", () => {
  it("opens a curated example as an editable local copy and rejects unknown examples", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    history.replaceState(null, "", "/editor/?example=binary")
    vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockImplementation(async ({name, version}) => {
      const tagName = name === "@webwriter/code" ? "webwriter-code-javascript" : "webwriter-quiz"
      const script = `https://cdn.jsdelivr.net/npm/${name}@${version}/dist/widgets/${name === "@webwriter/code" ? "ww-code-javascript" : tagName}.js`
      return {...demoPackage, name, version, scripts: [script], members: [{...demoPackage.members[0], tagName, scriptUrl: script}]}
    })
    const reload = vi.spyOn(host, "reloadDocument")
    vi.spyOn(host, "waitForEditorWindow").mockResolvedValue(undefined)
    vi.spyOn(host, "focusEditor").mockImplementation(() => {})
    await host.restoreExampleDocument("binary", Promise.resolve())
    expect(reload).toHaveBeenCalledWith(expect.stringContaining("<webwriter-code-javascript"), false, null, false,
      {beforeSwitch: expect.any(Function)})
    expect(host.frameDocumentHTML).toContain('data-ww-theme="base"')
    expect(host.frameDocumentHTML).not.toContain('src="https://cdn.jsdelivr.net/npm/@webwriter/code@3.0.5/dist/widgets/ww-code-javascript.js"')
    expect(host.installedPackages.map((pkg: WebWriterPackage) => pkg.name)).toEqual(["@webwriter/code"])
    expect(host.fileName).toBe("Count like a computer")
    expect(host.fileHandle).toBeNull()
    expect(host.backendDocumentId).toBeNull()
    const error = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    await host.restoreExampleDocument("../other.html", Promise.resolve())
    expect(error).toHaveBeenCalledWith(expect.objectContaining({message: "This example could not be found."}))
    expect(reload).toHaveBeenCalledOnce()
    host.updateDocumentURL(null)
    expect(new URL(location.href).searchParams.has("example")).toBe(false)
  })

  it("discards a curated example when the user leaves its link during startup", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    history.replaceState(null, "", "/editor/?example=binary")
    vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockResolvedValue(demoPackage)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    let ready!: () => void
    const startup = new Promise<void>(resolve => {ready = resolve})
    const opening = host.restoreExampleDocument("binary", startup)
    history.replaceState(null, "", "/editor/")
    ready()
    await opening
    expect(reload).not.toHaveBeenCalled()
    expect(host.linkedDocumentLoading).toBe(false)
  })

  it.each(["canvas", "slides", "board"])("opens a curated example in its linked %s layout", async layout => {
    const {editor} = await mountEditor()
    const host = editor as any
    history.replaceState(null, "", `/editor/?example=binary&layout=${layout}`)
    vi.spyOn(WebWriterPackageRegistry.prototype, "getPackage").mockResolvedValue(demoPackage)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    vi.spyOn(host, "focusEditor").mockImplementation(() => {})
    await host.restoreExampleDocument("binary", Promise.resolve())
    expect(reload).toHaveBeenCalledOnce()
    const source = new DOMParser().parseFromString(reload.mock.calls[0][0] as string, "text/html")
    expect(source.body.className).toBe(`ww-${layout}`)
    expect(source.querySelector("webwriter-code-javascript")).not.toBeNull()
    expect(host.downloadedFileName).toBe(`binary-${layout}.html`)
    host.updateDocumentURL(null)
    expect(new URL(location.href).searchParams.has("layout")).toBe(false)
  })

  it("does not show a spinner while the initial empty preset is loading", async () => {
    const editor = new DomEditor()
    mountedEditors.add(editor)
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {})
    iframe.dispatchEvent(new Event("load"))
    await editor.updateComplete

    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
    expect(editor.shadowRoot!.querySelector(".document-stage")!.getAttribute("aria-busy")).toBe("false")
    completePendingPackageLoad(editor)
    await (editor as any).packageLoadPromise
  })

  it.each(["local:stored", "http://localhost:5678/api/documents/lesson"])("fetches a startup ?open document before packages and history finish, then initializes one populated frame: %s", async reference => {
    history.replaceState({}, "", `/?open=${encodeURIComponent(reference)}`)
    const editor = new DomEditor()
    const host = editor as any
    mountedEditors.add(editor)
    const source = '<section><!--keep--><demo-widget data-answer="42"></demo-widget><p>Linked lesson</p></section>'
    const file = new File([source], "Lesson.html")
    const read = vi.spyOn(file, "text")
    const handle = {name: file.name, getFile: vi.fn().mockResolvedValue(file), createWritable: vi.fn(), queryPermission: vi.fn().mockResolvedValue("granted")}
    vi.spyOn(recentDocumentStorage, "readLocalDocumentReference").mockResolvedValue({id: "stored", kind: "local", title: file.name, openedAt: 1, handle})
    let historyReady!: () => void
    vi.spyOn(recentDocumentStorage, "readRecentDocuments").mockReturnValue(new Promise(resolve => { historyReady = () => resolve([]) }))
    const getDocument = vi.fn().mockResolvedValue({id: "lesson", title: "Lesson", format: "html", content: source})
    const login = vi.spyOn(host, "loginToBackend").mockImplementation(async () => {
      host.backendClient = {apiBaseUrl: "http://localhost:5678/api", getDocument}
    })
    vi.spyOn(host, "rememberOpenedDocument").mockResolvedValue({id: "stored", kind: "local"})
    const initializeFrame = host.initializeEditorFrame.bind(host)
    const postToEditor = vi.spyOn(host, "postToEditor")
    const initialize = vi.spyOn(host as {initializeEditorFrame(iframe: HTMLIFrameElement): void}, "initializeEditorFrame").mockImplementation(iframe => {
      vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {})
      initializeFrame(iframe)
    })
    let restored!: () => void
    const pkg = {...demoPackage, scripts: [], styles: []}
    vi.spyOn(host.localPackageManager, "restore").mockReturnValue(new Promise(resolve => { restored = () => resolve([pkg]) }))
    let catalogReady!: () => void
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockReturnValue(new Promise(resolve => { catalogReady = () => resolve([]) }))
    document.body.append(editor)
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
    expect(editor.shadowRoot!.querySelector(".document-stage")!.getAttribute("aria-busy")).toBe("true")
    if(reference.startsWith("local:")) {
      await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
      expect(login).not.toHaveBeenCalled()
    }
    else await vi.waitFor(() => expect(getDocument).toHaveBeenCalledWith("lesson"))
    expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()

    restored()
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBeNull())
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
    const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    expect(iframe.srcdoc).toContain(source)
    expect(host.installedPackages).toEqual([pkg])
    expect(host.frameRevision).toBe(0)
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce())
    expect(postToEditor).toHaveBeenCalledWith(expect.objectContaining({type: initializeEditorMessage, accessibilityReviewEnabled: true}))
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
    completePendingPackageLoad(editor)
    await host.packageLoadPromise
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull())
    expect(initialize).toHaveBeenCalledOnce()
    expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBe(iframe)
    expect(editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-panel")!.inert).toBe(true)
    historyReady()
    catalogReady()
    await host.recentDocumentsReady
  })

  it("keeps the spinner visible through linked document lookup and clears it on failure", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    let lookup!: (value: null) => void
    vi.spyOn(recentDocumentStorage, "readLocalDocumentReference").mockReturnValue(new Promise(resolve => { lookup = resolve }))
    vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    const restoring = host.restoreLinkedDocument("local:missing")
    await vi.waitFor(() => expect(recentDocumentStorage.readLocalDocumentReference).toHaveBeenCalledWith("missing"))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
    lookup(null)
    await restoring
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
  })

  it.each(["URL changed", "disconnected", "storage changed"])("discards a fetched startup document when %s", async cancellation => {
    history.replaceState({}, "", "/?open=http%3A%2F%2Flocalhost%3A5678%2Fapi%2Fdocuments%2Flesson")
    const editor = new DomEditor()
    const host = editor as any
    mountedEditors.add(editor)
    let fetched!: (value: unknown) => void
    const getDocument = vi.fn().mockReturnValue(new Promise(resolve => { fetched = resolve }))
    vi.spyOn(host, "loginToBackend").mockImplementation(async () => {
      host.backendClient = {apiBaseUrl: "http://localhost:5678/api", getDocument}
    })
    let restored!: () => void
    vi.spyOn(host.localPackageManager, "restore").mockReturnValue(new Promise(resolve => { restored = () => resolve([]) }))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const reload = vi.spyOn(host, "reloadDocument")
    document.body.append(editor)
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledOnce())
    if(cancellation === "disconnected") editor.remove()
    else if(cancellation === "URL changed") host.updateDocumentURL(null)
    else host.backendClient = null
    fetched({id: "lesson", title: "Lesson", format: "html", content: "<p>Stale lesson</p>"})
    restored()
    await vi.waitFor(() => expect(host.linkedDocumentLoading).toBe(false))
    await editor.updateComplete
    expect(reload).not.toHaveBeenCalled()
    expect(host.frameDocumentHTML).toBeNull()
    if(cancellation === "disconnected") expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()
    else await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBeNull())
    if(cancellation === "storage changed") expect(host.fileError).toContain("storage connection changed")
  })

  it("starts a usable empty frame after an invalid startup link and package restoration", async () => {
    history.replaceState({}, "", "/?open=invalid")
    const editor = new DomEditor()
    const host = editor as any
    mountedEditors.add(editor)
    let restored!: () => void
    vi.spyOn(host.localPackageManager, "restore").mockReturnValue(new Promise(resolve => { restored = () => resolve([]) }))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const initializeFrame = host.initializeEditorFrame.bind(host)
    vi.spyOn(host as {initializeEditorFrame(iframe: HTMLIFrameElement): void}, "initializeEditorFrame").mockImplementation(iframe => {
      wirePackageLoadCompletion(iframe.contentWindow!)
      initializeFrame(iframe)
    })
    document.body.append(editor)
    await editor.updateComplete
    expect(host.fileError).toBe("The document link is invalid.")
    expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()
    restored()
    await vi.waitFor(() => expect(host.editorWindow).not.toBeNull())
    await host.packageLoadPromise
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
    expect(editor.shadowRoot!.querySelector(".file-error")!.textContent).toContain("The document link is invalid.")
  })

  it("shows a spinner through a local file read and frame resource loading", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    let read!: (source: string) => void
    const file = new File([], "lesson.html")
    vi.spyOn(file, "text").mockReturnValue(new Promise(resolve => { read = resolve }))
    const handle = {name: file.name, getFile: vi.fn().mockResolvedValue(file)}
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
    vi.spyOn(host, "rememberOpenedDocument").mockResolvedValue({id: "lesson", kind: "local"})
    vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {})

    const opening = host.openDocument()
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull())
    const overlay = editor.shadowRoot!.querySelector(".document-loading")!
    expect(overlay.getAttribute("role")).toBe("status")
    expect(overlay.getAttribute("aria-label")).toBe("Loading document")
    expect(editor.shadowRoot!.querySelector(".document-stage")!.getAttribute("aria-busy")).toBe("true")
    expect(iframe.contentDocument!.querySelector(".document-loading")).toBeNull()

    read("<p>Loaded lesson</p>")
    await vi.waitFor(() => expect(host.frameRevision).toBe(1))
    await editor.updateComplete
    editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!.dispatchEvent(new Event("load"))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
    completePendingPackageLoad(editor)
    await opening
    await editor.updateComplete

    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
    expect(editor.shadowRoot!.querySelector(".document-stage")!.getAttribute("aria-busy")).toBe("false")
  })

  it.each(["local", "cloud"])("installs a %s file's missing widgets before revealing its document", async location => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const retained = {...demoPackage, name: "@webwriter/retained", scripts: [], members: []}
    host.installedPackages = [retained]
    const content = `<section data-authored="keep"><!--keep--><webwriter-demo answer="42"><span>Authored content</span></webwriter-demo><unknown-element></unknown-element></section>`
    const source = `<html><head><script type="module" src="${demoPackage.scripts[0]}"></script></head><body>${content}</body></html>`
    let resolved!: (pkg: WebWriterPackage) => void
    const getPackage = vi.spyOn(host.packageRegistry, "getPackage").mockReturnValue(new Promise(resolve => { resolved = resolve }))
    const file = new File([source], "lesson.html")
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{name: file.name, getFile: async() => file}]))
    vi.spyOn(host, "rememberOpenedDocument").mockResolvedValue({id: "lesson", kind: "local"})
    host.backendClient = {getDocument: vi.fn().mockResolvedValue({id: "lesson", title: "Lesson", format: "html", content: source})}
    const post = vi.spyOn(host, "postToEditor").mockImplementation(() => {})

    const opening = location === "local" ? host.openDocument() : host.openBackendDocument("lesson")
    await vi.waitFor(() => expect(getPackage).toHaveBeenCalledWith({name: demoPackage.name, version: demoPackage.version}))
    await editor.updateComplete
    expect(host.frameRevision).toBe(0)
    expect(iframe.contentDocument!.querySelector("webwriter-demo")).toBeNull()
    expect(iframe.classList.contains("loading")).toBe(true)
    expect(getComputedStyle(iframe).visibility).toBe("hidden")
    expect(iframe.inert).toBe(true)
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()

    resolved(demoPackage)
    await vi.waitFor(() => expect(host.frameRevision).toBe(1))
    await editor.updateComplete
    const loadedFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    loadedFrame.dispatchEvent(new Event("load"))
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({
      type: loadWidgetsMessage, packages: [retained, demoPackage], requestId: expect.any(String),
    })))
    expect(host.installedPackages).toEqual([retained, demoPackage])
    expect(JSON.parse(localStorage.getItem(INSTALLED_PACKAGES_STORAGE_KEY)!)).toEqual([retained, demoPackage])
    expect(host.frameDocumentHTML).toContain(content)
    expect(loadedFrame.classList.contains("loading")).toBe(true)
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()

    completePendingPackageLoad(editor)
    await opening
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
    expect(loadedFrame.classList.contains("loading")).toBe(false)
    expect(loadedFrame.inert).toBe(false)
    expect(host.fileDirty).toBe(false)
  })

  it("opens the file without unsupported widgets when Open anyway is confirmed", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const body = iframe.contentDocument!.body.innerHTML
    const source = `<script type="module" src="${demoPackage.scripts[0]}"></script><webwriter-demo>
      <script type="application/json" slot="data">{"discard":true}</script><p>Keep this content</p>
    </webwriter-demo>`
    const file = new File([source], "lesson.html")
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{name: file.name, getFile: async() => file}]))
    vi.spyOn(host, "rememberOpenedDocument").mockResolvedValue({id: "lesson", kind: "local"})
    vi.spyOn(host.packageRegistry, "getPackage").mockRejectedValue(new Error("Widget package unavailable"))
    vi.spyOn(host, "postToEditor").mockImplementation(() => {})
    const dialog = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!.shadowRoot!
      .querySelector<HTMLDialogElement>("#unsupported-widget-packages-dialog")!

    const opening = host.openDocument()
    await vi.waitFor(() => expect(dialog.open).toBe(true))
    expect(host.frameRevision).toBe(0)
    expect(iframe.contentDocument!.body.innerHTML).toBe(body)
    dialog.querySelector<HTMLButtonElement>("button.primary")!.click()
    await vi.waitFor(() => expect(host.frameRevision).toBe(1))
    await editor.updateComplete
    editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!.dispatchEvent(new Event("load"))
    await vi.waitFor(() => expect(host.packageLoadPromise).not.toBeNull())
    completePendingPackageLoad(editor)
    await opening
    await editor.updateComplete

    expect(host.fileError).toBe("")
    expect(host.fileName).toBe("lesson")
    expect(host.installedPackages).toEqual([])
    expect(host.frameDocumentHTML).toContain("<p>Keep this content</p>")
    expect(host.frameDocumentHTML).not.toContain("<webwriter-demo")
    expect(host.frameDocumentHTML).not.toContain('"discard"')
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
  })

  it("keeps a newly opened document hidden when its widget modules fail to load", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const source = `<script type="module" src="${demoPackage.scripts[0]}"></script><webwriter-demo></webwriter-demo>`
    const file = new File([source], "lesson.html")
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{name: file.name, getFile: async() => file}]))
    vi.spyOn(host.packageRegistry, "getPackage").mockResolvedValue(demoPackage)
    vi.spyOn(host, "postToEditor").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})

    const opening = host.openDocument()
    await vi.waitFor(() => expect(host.frameRevision).toBe(1))
    const loadedFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    loadedFrame.dispatchEvent(new Event("load"))
    await vi.waitFor(() => expect(host.packageLoadPromise).not.toBeNull())
    const requestId = [...host.pendingExecutions.keys()].find((id: string) => id.startsWith("packages-"))
    window.dispatchEvent(new MessageEvent("message", {source: host.editorWindow, origin: window.location.origin,
      data: {type: executeFailureEvent, detail: {requestId, error: {name: "NetworkError", message: "Widget module failed"}}}}))
    await opening
    await editor.updateComplete

    expect(host.fileError).toBe("Widget module failed")
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
    expect(loadedFrame.classList.contains("loading")).toBe(true)
    expect(loadedFrame.inert).toBe(true)
    expect(getComputedStyle(loadedFrame).visibility).toBe("hidden")
  })

  it("keeps edits made during widget installation instead of replacing them with the opened file", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const source = `<script type="module" src="${demoPackage.scripts[0]}"></script><webwriter-demo></webwriter-demo>`
    const file = new File([source], "lesson.html")
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{name: file.name, getFile: async() => file}]))
    let resolved!: (pkg: WebWriterPackage) => void
    const getPackage = vi.spyOn(host.packageRegistry, "getPackage").mockReturnValue(new Promise(resolve => { resolved = resolve }))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const opening = host.openDocument()
    await vi.waitFor(() => expect(getPackage).toHaveBeenCalled())
    iframe.contentDocument!.body.innerHTML = "<p>A concurrent edit</p>"
    host.documentChangeSequence++
    resolved(demoPackage)
    await opening
    await editor.updateComplete
    expect(host.frameRevision).toBe(0)
    expect(host.installedPackages).toEqual([])
    expect(iframe.contentDocument!.body.innerHTML).toBe("<p>A concurrent edit</p>")
    expect(host.fileError).toContain("The document changed while loading its widgets")
  })

  it("keeps the spinner visible while a new empty document's preset is applied", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    let applied!: () => void
    vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    vi.spyOn(host, "applyDefaultLayout").mockReturnValue(new Promise<void>(resolve => { applied = resolve }))
    const creating = host.newDocument("canvas")
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
    applied()
    await creating
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
  })

  it.each(["success", "failure"])("clears the spinner after a cloud load: %s", async outcome => {
    const {editor} = await mountEditor()
    const host = editor as any
    let fetched!: (value: unknown) => void
    let failed!: (error: Error) => void
    host.backendClient = {getDocument: vi.fn().mockReturnValue(new Promise((resolve, reject) => { fetched = resolve; failed = reject }))}
    let ready!: () => void
    vi.spyOn(host, "reloadDocument").mockReturnValue(new Promise<void>(resolve => { ready = resolve }))

    const opening = host.openBackendDocument("lesson")
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
    if(outcome === "failure") failed(new Error("Could not load lesson"))
    else {
      fetched({id: "lesson", title: "Lesson", format: "html", content: "<p>Lesson</p>"})
      await Promise.resolve()
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector(".document-loading")).not.toBeNull()
      ready()
    }
    await opening
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
    if(outcome === "failure") expect(host.documentsError).toBe("Could not load lesson")
  })

  it("does not show a spinner for a cancelled file picker", async () => {
    const {editor} = await mountEditor()
    vi.stubGlobal("showOpenFilePicker", undefined)
    const opening = (editor as any).openDocument()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
    editor.shadowRoot!.querySelector('input[type="file"]')!.dispatchEvent(new Event("cancel"))
    await opening
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-loading")).toBeNull()
  })
})

describe("DomEditor fullscreen controls", () => {
  async function mountFullscreenEditor() {
    const {editor, iframe} = await mountEditor(editor => {
      Object.assign(editor, {documentLayoutsDismissed: true, documentLayoutsManuallyDismissed: true})
    })
    const root = editor.shadowRoot!
    const ribbon = root.querySelector<AppRibbon>("app-ribbon")!
    const header = root.querySelector<HTMLElement>(".ribbon-header")!
    const toolbox = root.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const scope = root.querySelector<HTMLDialogElement>(".fullscreen-scope")!
    let modal = false
    const scopeMatches = scope.matches.bind(scope)
    vi.spyOn(scope, "matches").mockImplementation(selector => selector === ":modal" ? modal : scopeMatches(selector))
    vi.spyOn(scope, "showModal").mockImplementation(() => { modal = true; scope.open = true })
    vi.spyOn(scope, "show").mockImplementation(() => { modal = false; scope.open = true })
    vi.spyOn(scope, "close").mockImplementation(() => { modal = false; scope.open = false })
    const open = new Set<HTMLElement>()
    // Happy DOM does not implement browser top-layer promotion. Keep its state
    // local to these controls while exercising the real host event listeners.
    for(const element of [header, toolbox, ...root.querySelectorAll<HTMLElement>(".bottom-detail-panel, .document-layouts-panel")]) {
      const matches = element.matches.bind(element)
      vi.spyOn(element, "matches").mockImplementation(selector => selector === ":popover-open" ? open.has(element) : matches(selector))
      Object.defineProperties(element, {
        showPopover: {configurable: true, value: vi.fn(() => {open.add(element)})},
        hidePopover: {configurable: true, value: vi.fn(() => {open.delete(element)})},
      })
    }
    let fullscreenElement: Element | null = null
    Object.defineProperty(root, "fullscreenElement", {configurable: true, get: () => fullscreenElement})
    const settle = async () => {
      await ribbon.updateComplete
      await toolbox.updateComplete
      await editor.updateComplete
      await ribbon.updateComplete
      await editor.updateComplete
    }
    const fullscreen = async (element: Element | null) => {
      fullscreenElement = element
      editor.ownerDocument.dispatchEvent(new Event("fullscreenchange", {bubbles: true, composed: true}))
      await settle()
    }
    return {editor, iframe, root, ribbon, header, toolbox, scope, open, fullscreen, settle}
  }

  it("immediately shows the same collapsed app bar without a launcher or default toolbox tabs", async () => {
    const {editor, iframe, root, ribbon, header, toolbox, open, fullscreen} = await mountFullscreenEditor()
    await fullscreen(iframe)
    expect(open).toEqual(new Set([header]))
    expect(header.getAttribute("popover")).toBe("manual")
    expect(ribbon.fullscreenControls).toBe(true)
    expect(ribbon.hasAttribute("fullscreen-controls")).toBe(true)
    expect(ribbon.expanded).toBe(false)
    expect(root.querySelector(".fullscreen-launcher")).toBeNull()
    expect(root.querySelector("app-ribbon")).toBe(ribbon)
    expect(root.querySelector("dom-editor-toolbox")).toBe(toolbox)
    expect(iframe.contentDocument!.querySelector("app-ribbon, dom-editor-toolbox")).toBeNull()
    expect((editor as any).fullscreenEditing).toBe(true)
  })

  it("releases the host scrollbar gutter during fullscreen and restores its styles on exit and removal", async () => {
    const {editor, iframe, fullscreen, settle} = await mountFullscreenEditor()
    const document = editor.ownerDocument
    const original = [...document.adoptedStyleSheets]
    const rootStyle = document.documentElement.getAttribute("style")
    await fullscreen(iframe)
    const added = document.adoptedStyleSheets.filter(sheet => !original.includes(sheet))
    expect(added).toHaveLength(1)
    expect(added[0].cssRules[0].cssText).toContain("scrollbar-gutter: auto !important")
    await settle()
    expect(document.adoptedStyleSheets).toEqual([...original, added[0]])
    expect(document.documentElement.getAttribute("style")).toBe(rootStyle)
    await fullscreen(null)
    expect(document.adoptedStyleSheets).toEqual(original)
    await fullscreen(iframe)
    editor.remove()
    expect(document.adoptedStyleSheets).toEqual(original)
  })

  it("replaces Preview with the existing toolbox tabs and opens, switches, and closes the same toolbox", async () => {
    const {editor, iframe, root, ribbon, header, toolbox, open, fullscreen, settle} = await mountFullscreenEditor()
    const tools = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".toolbox-tab-button"), button => button.dataset.tool)
    const frameWindow = iframe.contentWindow
    await fullscreen(iframe)
    const tabs = () => ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".ribbon-top-actions .toolbox-tab-button")
    const button = (tool: string) => ribbon.shadowRoot!.querySelector<HTMLButtonElement>(`.ribbon-top-actions [data-tool="${tool}"]`)!
    expect(Array.from(tabs(), tab => tab.dataset.tool)).toEqual(tools)
    expect(ribbon.shadowRoot!.querySelector(".preview-button")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector(".toolbox-tabs")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('.toolbox-tabs[role="toolbar"]')).not.toBeNull()
    button("Edit").click()
    await settle()
    expect(root.querySelector("dom-editor-toolbox")).toBe(toolbox)
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolbox.collapsed).toBe(false)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(false)
    expect(button("Edit").getAttribute("aria-pressed")).toBe("true")
    expect(open).toEqual(new Set([toolbox, header]))
    button("Review").click()
    await settle()
    expect(toolbox.activeTool).toBe("Review")
    expect(button("Edit").getAttribute("aria-pressed")).toBe("false")
    expect(button("Review").getAttribute("aria-pressed")).toBe("true")
    button("Review").click()
    await settle()
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.collapsed).toBe(true)
    expect(open).toEqual(new Set([header]))
    await fullscreen(null)
    expect(toolbox.tabsInRibbon).toBe(false)
    expect(toolbox.shadowRoot!.querySelectorAll(".toolbox-tab-button")).toHaveLength(tools.length)
    expect(ribbon.shadowRoot!.querySelector(".preview-button")).not.toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".toolbox-tabs")).toBeNull()
    expect(iframe.contentWindow).toBe(frameWindow)
    expect((editor as any).fullscreenToolboxOpen).toBe(false)
  })

  it("keeps an already selected toolbox closed on entry until its fullscreen tab is activated", async () => {
    const {iframe, ribbon, toolbox, header, open, fullscreen, settle} = await mountFullscreenEditor()
    toolbox.selectTool("Edit", true)
    await settle()
    await fullscreen(iframe)
    const button = ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.ribbon-top-actions [data-tool="Edit"]')!
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolbox.collapsed).toBe(true)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(open).toEqual(new Set([header]))
    button.click()
    await settle()
    expect(toolbox.collapsed).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(open).toEqual(new Set([toolbox, header]))
  })

  it("shares toolbox tab availability and pending-edit restrictions with the fullscreen bar", async () => {
    const {editor, iframe, ribbon, toolbox, fullscreen, settle} = await mountFullscreenEditor()
    await fullscreen(iframe)
    const host = editor as any
    host.settings = {...host.settings, disableAI: true}
    await settle()
    expect(ribbon.shadowRoot!.querySelector('.ribbon-top-actions [data-tool="AI"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('.ribbon-top-actions [data-tool="Feedback"]')).toBeNull()
    host.htmlPending = true
    await settle()
    const buttons = Array.from(ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".ribbon-top-actions .toolbox-tab-button"))
    expect(buttons.length).toBeGreaterThan(0)
    for(const button of buttons) expect(button.disabled).toBe(button.dataset.tool !== "Edit")
    expect(toolbox.htmlPending).toBe(true)
  })

  it("keeps fullscreen toolboxes above a visible bottom pane and clears positioning on exit", async () => {
    const {editor, iframe, root, ribbon, toolbox, fullscreen, settle} = await mountFullscreenEditor()
    const panel = root.querySelector<HTMLElement>(".bottom-detail-panel")!
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 420, 800, 180))
    Object.assign(editor, {localPackages: [demoPackage]})
    await fullscreen(iframe)
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.ribbon-top-actions [data-tool="Review"]')!.click()
    await settle()
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Checks & Tests"]')!.click()
    await settle()
    expect(toolbox.activeTool).toBe("Review")
    expect(toolbox.matches(":popover-open")).toBe(true)
    expect(panel.matches(":popover-open")).toBe(true)
    expect(toolbox.style.getPropertyValue("--fullscreen-bottom-pane-height")).toBe("180px")
    await fullscreen(null)
    expect(toolbox.style.getPropertyValue("--fullscreen-bottom-pane-height")).toBe("")
    expect(toolbox.hasAttribute("popover")).toBe(false)
  })

  it("opens existing editing commands from the app icon while keeping the app bar collapsed", async () => {
    const {iframe, ribbon, header, open, fullscreen, settle} = await mountFullscreenEditor()
    await fullscreen(iframe)
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
    await settle()
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("#ribbon-file-menu")!
    await menu.updateComplete
    expect(ribbon.menuOpen).toBe(true)
    expect(menu.hidden).toBe(false)
    expect(menu.groups.flatMap(group => group.buttons.map(button => typeof button === "string" ? button : button.label)))
      .toEqual(expect.arrayContaining(["Format", "Insert"]))
    expect(ribbon.expanded).toBe(false)
    expect(open).toEqual(new Set([header]))
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
    await settle()
    expect(ribbon.menuOpen).toBe(false)
    expect(open).toEqual(new Set([header]))
  })

  it.each([true, false])("restores initial expanded=%s and breadcrumb state on fullscreen exit", async expanded => {
    vi.stubGlobal("innerHeight", 800)
    const {editor, iframe, ribbon, header, toolbox, open, fullscreen, settle} = await mountFullscreenEditor()
    ribbon.expanded = expanded
    await settle()
    const breadcrumbVisible = (editor as any).breadcrumbVisible
    await fullscreen(iframe)
    expect(ribbon.expanded).toBe(false)
    expect(open).toEqual(new Set([header]))
    await fullscreen(null)
    expect(ribbon.expanded).toBe(expanded)
    expect(ribbon.fullscreenControls).toBe(false)
    expect((editor as any).breadcrumbVisible).toBe(breadcrumbVisible)
    expect(toolbox.hidden).toBe(!breadcrumbVisible)
    expect(open.size).toBe(0)
    for(const element of [header, toolbox]) {
      expect(element.hasAttribute("popover")).toBe(false)
      expect(element.style.getPropertyValue("--fullscreen-ribbon-height")).toBe("")
    }
  })

  it.each([600, 900])("keeps the fullscreen app bar collapsed at viewport height %s", async height => {
    vi.stubGlobal("innerHeight", 800)
    const {iframe, ribbon, header, open, fullscreen, settle} = await mountFullscreenEditor()
    await fullscreen(iframe)
    vi.stubGlobal("innerHeight", height)
    window.dispatchEvent(new Event("resize"))
    await settle()
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
    await settle()
    expect(ribbon.menuOpen).toBe(true)
    expect(ribbon.expanded).toBe(false)
    expect(open).toEqual(new Set([header]))
    window.dispatchEvent(new Event("resize"))
    await settle()
    expect(ribbon.expanded).toBe(false)
    vi.stubGlobal("innerHeight", 800)
    window.dispatchEvent(new Event("resize"))
    await fullscreen(null)
    expect(ribbon.expanded).toBe(true)
  })

  it("preserves the app bar across nested widget fullscreen changes and repeated cleanup", async () => {
    const {editor, iframe, ribbon, header, toolbox, scope, open, fullscreen, settle} = await mountFullscreenEditor()
    await fullscreen(iframe)
    // Widget and shadow-descendant changes keep the same host iframe.
    await fullscreen(iframe)
    expect(ribbon.expanded).toBe(false)
    expect(open).toEqual(new Set([header]))
    expect(scope.showModal).toHaveBeenCalledOnce()
    await fullscreen(null)
    await fullscreen(null)
    editor.remove()
    await settle()
    expect(scope.showModal).toHaveBeenCalledOnce()
    expect(scope.close).toHaveBeenCalledTimes(2)
    expect(open.size).toBe(0)
    expect((editor as any).fullscreenRibbonState).toBeNull()
    for(const element of [header, toolbox]) {
      expect(element.hasAttribute("popover")).toBe(false)
      expect(element.style.getPropertyValue("--fullscreen-ribbon-height")).toBe("")
    }
  })

  it("uses a stable modal scope without moving or reloading the editor frame", async () => {
    const {iframe, root, ribbon, header, toolbox, scope, fullscreen} = await mountFullscreenEditor()
    const editorWindow = iframe.contentWindow
    const editorDocument = iframe.contentDocument!
    const paragraph = editorDocument.querySelector("p")!
    paragraph.textContent = "Keep the live document"
    expect(scope.open).toBe(true)
    expect(scope.matches(":modal")).toBe(false)
    expect(scope.getAttribute("role")).toBe("presentation")
    expect(scope.contains(iframe)).toBe(true)
    await fullscreen(iframe)
    expect(scope.matches(":modal")).toBe(true)
    expect(scope.getAttribute("role")).toBe("dialog")
    expect(scope.showModal).toHaveBeenCalledOnce()
    expect([ribbon, header, toolbox].every(element => scope.contains(element))).toBe(true)
    await fullscreen(null)
    expect(scope.open).toBe(true)
    expect(scope.matches(":modal")).toBe(false)
    expect(scope.getAttribute("role")).toBe("presentation")
    expect(scope.show).toHaveBeenCalledOnce()
    expect(root.querySelector("iframe.editor-frame")).toBe(iframe)
    expect(iframe.contentWindow).toBe(editorWindow)
    expect(iframe.contentDocument).toBe(editorDocument)
    expect(editorDocument.querySelector("p")).toBe(paragraph)
    expect(paragraph.textContent).toBe("Keep the live document")
  })

  it("routes modal cancellation through fullscreen exit while preserving its stable scope", async () => {
    const {editor, iframe, scope, fullscreen} = await mountFullscreenEditor()
    const exitFullscreen = vi.fn(async () => {})
    const previous = Object.getOwnPropertyDescriptor(editor.ownerDocument, "exitFullscreen")
    Object.defineProperty(editor.ownerDocument, "exitFullscreen", {configurable: true, value: exitFullscreen})
    try {
      await fullscreen(iframe)
      const cancel = new Event("cancel", {cancelable: true})
      expect(scope.dispatchEvent(cancel)).toBe(false)
      expect(cancel.defaultPrevented).toBe(true)
      expect(exitFullscreen).toHaveBeenCalledOnce()
      expect(scope.matches(":modal")).toBe(true)
      await fullscreen(null)
      expect(scope.open).toBe(true)
      expect(scope.matches(":modal")).toBe(false)
    }
    finally {
      if(previous) Object.defineProperty(editor.ownerDocument, "exitFullscreen", previous)
      else Reflect.deleteProperty(editor.ownerDocument, "exitFullscreen")
    }
  })

  it("keeps active toolboxes closed and retains the existing app menu command path", async () => {
    const {editor, iframe, ribbon, toolbox, header, open, fullscreen, settle} = await mountFullscreenEditor()
    toolbox.activeTool = "Edit"
    await toolbox.updateComplete
    await fullscreen(iframe)
    expect(open).toEqual(new Set([header]))
    expect(toolbox.matches(":popover-open")).toBe(false)
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
    await settle()
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("#ribbon-file-menu")!
    await menu.updateComplete
    menu.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "mark:b", apply: true}, bubbles: true, composed: true,
    }))
    await settle()
    expect(execute).toHaveBeenCalledWith({type: "addMark", mark: "b"})
    expect(open).toEqual(new Set([header]))
  })

  it("promotes Checks & Tests already open before fullscreen and restores its ordinary presentation", async () => {
    const {editor, iframe, root, header, open, fullscreen, settle} = await mountFullscreenEditor()
    const panel = root.querySelector<HTMLElement>(".bottom-detail-panel")!
    Object.assign(editor, {checksOpen: true, localPackages: [demoPackage]})
    await settle()
    expect(panel.hasAttribute("inert")).toBe(false)
    expect(panel.hasAttribute("popover")).toBe(false)
    const consoleElement = panel.querySelector("bottom-detail-panel")
    await fullscreen(iframe)
    expect(open).toEqual(new Set([panel, header]))
    expect(panel.querySelector("bottom-detail-panel")).toBe(consoleElement)
    await fullscreen(null)
    expect(root.querySelector(".bottom-detail-panel")).toBe(panel)
    expect(panel.hasAttribute("popover")).toBe(false)
    expect(panel.hasAttribute("inert")).toBe(false)
    expect(open.size).toBe(0)
  })

  it("uses the existing bottom panel for review and hides it when review closes", async () => {
    const {editor, iframe, root, header, open, fullscreen, settle} = await mountFullscreenEditor()
    const panel = root.querySelector<HTMLElement>(".bottom-detail-panel")!
    await fullscreen(iframe)
    Object.assign(editor, {reviewOpen: true})
    await settle()
    expect(root.querySelector(".bottom-detail-panel")).toBe(panel)
    expect(panel.hasAttribute("inert")).toBe(false)
    expect(open).toEqual(new Set([panel, header]))
    const consoleElement = panel.querySelector("bottom-detail-panel")!
    await (consoleElement as any).updateComplete
    expect(consoleElement.mode).toBe("versions")
    Object.assign(editor, {reviewOpen: false})
    await settle()
    expect(panel.hasAttribute("inert")).toBe(true)
    expect(open).toEqual(new Set([header]))
    await fullscreen(null)
    expect(panel.hasAttribute("popover")).toBe(false)
  })

  it("promotes visible layout choices and restores their existing node on exit", async () => {
    const {editor, iframe, root, header, open, fullscreen, settle} = await mountFullscreenEditor()
    const panel = root.querySelector<HTMLElement>(".document-layouts-panel")!
    await fullscreen(iframe)
    Object.assign(editor, {documentLayoutsDismissed: false})
    await settle()
    expect(panel.hasAttribute("inert")).toBe(false)
    expect(open).toEqual(new Set([panel, header]))
    Object.assign(editor, {documentLayoutsDismissed: true})
    await settle()
    expect(open).toEqual(new Set([header]))
    await fullscreen(null)
    expect(root.querySelector(".document-layouts-panel")).toBe(panel)
    expect(panel.hasAttribute("popover")).toBe(false)
    expect(panel.hasAttribute("inert")).toBe(true)
  })

  it("disables Preview buttons, commands, and its configured shortcut during fullscreen", async () => {
    const {editor, iframe, root, ribbon, fullscreen, settle} = await mountFullscreenEditor()
    const host = editor as any
    const preview = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!
    expect(preview.disabled).toBe(false)
    await fullscreen(iframe)
    expect(ribbon.shadowRoot!.querySelector(".preview-button")).toBeNull()
    const snapshot = vi.spyOn(host, "currentPreviewHTMLFromFrame")
    host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: "Preview"}}))
    const shortcut = host.settings.shortcuts["editor.preview"] as string
    const keydown = new KeyboardEvent("keydown", {
      key: "p", code: "KeyP", ctrlKey: shortcut.includes("Ctrl"), metaKey: shortcut.includes("Meta"),
      altKey: shortcut.includes("Alt"), shiftKey: shortcut.includes("Shift"), bubbles: true, cancelable: true,
    })
    iframe.contentDocument!.dispatchEvent(keydown)
    expect(keydown.defaultPrevented).toBe(true)
    await host.enterPreview()
    await settle()
    expect(host.previewActive).toBe(false)
    expect(snapshot).not.toHaveBeenCalled()
    expect(root.querySelector("iframe.preview-frame")).toBeNull()
    expect(root.querySelector("iframe.editor-frame")).toBe(iframe)
    expect(iframe.hidden).toBe(false)
    await fullscreen(null)
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.disabled).toBe(false)
  })

  it("abandons a pending preview snapshot when the editing iframe enters fullscreen", async () => {
    const {editor, iframe, root, fullscreen, settle} = await mountFullscreenEditor()
    const host = editor as any
    host.editorOpaque = true
    vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(host, "requestFrameControl").mockResolvedValue(undefined)
    const setEditingLocked = vi.spyOn(host, "setPreviewEditingLocked").mockResolvedValue(undefined)
    let resolveSnapshot!: (html: string) => void
    const snapshot = vi.spyOn(host, "currentPreviewHTMLFromFrame").mockImplementation(() => new Promise<string>(resolve => { resolveSnapshot = resolve }))
    const opening = host.enterPreview() as Promise<void>
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledOnce())
    await fullscreen(iframe)
    resolveSnapshot("<!doctype html><html><head></head><body><p>Preview snapshot</p></body></html>")
    await opening
    await settle()
    expect(host.previewActive).toBe(false)
    expect(host.previewTransition).toBe(false)
    expect(setEditingLocked).toHaveBeenCalledWith(false)
    expect(root.querySelector("iframe.preview-frame")).toBeNull()
    expect(root.querySelector("iframe.editor-frame")).toBe(iframe)
    expect(iframe.hidden).toBe(false)
  })

  it("ignores fullscreen belonging to another element", async () => {
    const {editor, header, toolbox, open, fullscreen} = await mountFullscreenEditor()
    await fullscreen(document.createElement("video"))
    expect((editor as any).fullscreenEditing).toBe(false)
    expect(open.size).toBe(0)
    for(const element of [header, toolbox]) expect(element.hasAttribute("popover")).toBe(false)
  })

  it("cleans up promoted controls and the modal scope when disconnected", async () => {
    const {editor, iframe, header, toolbox, scope, open, fullscreen, settle} = await mountFullscreenEditor()
    await fullscreen(iframe)
    editor.remove()
    await settle()
    expect(scope.close).toHaveBeenCalledTimes(2)
    expect(scope.matches(":modal")).toBe(false)
    expect(open.size).toBe(0)
    for(const element of [header, toolbox]) expect(element.hasAttribute("popover")).toBe(false)
    editor.ownerDocument.dispatchEvent(new Event("fullscreenchange"))
    await settle()
    expect((editor as any).fullscreenEditing).toBe(false)
    expect(scope.showModal).toHaveBeenCalledOnce()
  })
})

describe("fullscreen package reload", () => {
  async function withReload(run: (context: {
    editor: DomEditor, iframe: HTMLIFrameElement, host: any,
    exit: ReturnType<typeof vi.fn<() => Promise<void>>>, setFullscreen: (element: Element | null) => void,
    snapshot: ReturnType<typeof vi.spyOn>, reset: ReturnType<typeof vi.spyOn>, cancel: ReturnType<typeof vi.spyOn>,
  }) => Promise<void>) {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const root = editor.shadowRoot!
    const previousFullscreen = Object.getOwnPropertyDescriptor(root, "fullscreenElement")
    const previousExit = Object.getOwnPropertyDescriptor(editor.ownerDocument, "exitFullscreen")
    let fullscreenElement: Element | null = iframe
    Object.defineProperty(root, "fullscreenElement", {configurable: true, get: () => fullscreenElement})
    const setFullscreen = (element: Element | null) => { fullscreenElement = element }
    const exit = vi.fn(async () => {fullscreenElement = null})
    Object.defineProperty(editor.ownerDocument, "exitFullscreen", {configurable: true, value: exit})
    const snapshot = vi.spyOn(editor, "execute").mockResolvedValue({update: []})
    const reset = vi.spyOn(host, "resetEditorFrame")
    const cancel = vi.spyOn(root.querySelector<AppRibbon>("app-ribbon")!, "cancelAIWork").mockResolvedValue(undefined)
    vi.spyOn(host, "waitForEditorWindow").mockResolvedValue(window)
    try { await run({editor, iframe: iframe as HTMLIFrameElement, host, exit, setFullscreen, snapshot, reset, cancel}) }
    finally {
      if(previousFullscreen) Object.defineProperty(root, "fullscreenElement", previousFullscreen)
      else Reflect.deleteProperty(root, "fullscreenElement")
      if(previousExit) Object.defineProperty(editor.ownerDocument, "exitFullscreen", previousExit)
      else Reflect.deleteProperty(editor.ownerDocument, "exitFullscreen")
    }
  }

  it("keeps the old frame mounted and delays snapshots and reset until fullscreen exit resolves", async () => {
    await withReload(async ({editor, iframe, host, exit, setFullscreen, snapshot, reset, cancel}) => {
      let finishExit!: () => void
      exit.mockImplementation(() => new Promise<void>(resolve => {finishExit = () => {setFullscreen(null); resolve()}}))
      const oldWindow = iframe.contentWindow
      const revision = host.frameRevision
      const previousPackages = host.installedPackages
      const nextPackages = [{...demoPackage, scripts: [], styles: []}]
      const loading = host.reloadEditor(nextPackages) as Promise<void>
      expect(exit).toHaveBeenCalledOnce()
      expect(iframe.isConnected).toBe(true)
      expect(iframe.contentWindow).toBe(oldWindow)
      expect(host.frameRevision).toBe(revision)
      expect(host.installedPackages).toBe(previousPackages)
      expect(snapshot).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
      expect(cancel).not.toHaveBeenCalled()
      finishExit()
      await loading
      await editor.updateComplete
      expect(snapshot).toHaveBeenCalledWith({type: "snapshotState"})
      expect(reset).toHaveBeenCalledOnce()
      expect(host.frameRevision).toBe(revision + 1)
      expect(host.installedPackages).toBe(nextPackages)
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBe(iframe)
      expect(iframe.isConnected).toBe(false)
    })
  })

  it("aborts the reload without changing packages or detaching the frame if fullscreen exit fails", async () => {
    await withReload(async ({editor, iframe, host, exit, snapshot, reset, cancel}) => {
      const previousPackages = host.installedPackages
      const revision = host.frameRevision
      exit.mockRejectedValue(new Error("Fullscreen exit failed"))
      await expect(host.reloadEditor([{...demoPackage, scripts: [], styles: []}])).rejects.toThrow("Fullscreen exit failed")
      expect(snapshot).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
      expect(cancel).not.toHaveBeenCalled()
      expect(host.installedPackages).toBe(previousPackages)
      expect(host.frameRevision).toBe(revision)
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBe(iframe)
      expect(iframe.isConnected).toBe(true)
    })
  })

  it("does not exit fullscreen belonging to an unrelated element", async () => {
    await withReload(async ({host, exit, setFullscreen, snapshot, reset}) => {
      setFullscreen(document.createElement("video"))
      const revision = host.frameRevision
      await host.reloadEditor([])
      expect(exit).not.toHaveBeenCalled()
      expect(snapshot).toHaveBeenCalledWith({type: "snapshotState"})
      expect(reset).toHaveBeenCalledOnce()
      expect(host.frameRevision).toBe(revision + 1)
    })
  })

  it("rejects a stale reload if the editor frame changes while fullscreen exit is pending", async () => {
    await withReload(async ({editor, host, exit, setFullscreen, reset}) => {
      let finishExit!: () => void
      exit.mockImplementation(() => new Promise<void>(resolve => {finishExit = () => {setFullscreen(null); resolve()}}))
      const previousPackages = host.installedPackages
      const revision = host.frameRevision
      const loading = host.reloadEditor([{...demoPackage, scripts: [], styles: []}]) as Promise<void>
      const rejected = expect(loading).rejects.toThrow("The editor changed while loading packages")
      host.frameRevision++
      await editor.updateComplete
      const replacement = editor.shadowRoot!.querySelector("iframe.editor-frame")
      finishExit()
      await rejected
      expect(reset).not.toHaveBeenCalled()
      expect(host.frameRevision).toBe(revision + 1)
      expect(host.installedPackages).toBe(previousPackages)
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBe(replacement)
    })
  })
})

describe("DomEditor iframe setup", () => {
  it("anchors update notifications to the app icon outside the authored document", async () => {
    const {editor, iframe} = await mountEditor()
    const notice = editor.shadowRoot!.querySelector<HTMLElement & {anchor: () => HTMLElement | null}>("app-update-notice")!
    const logo = editor.shadowRoot!.querySelector("app-ribbon")!.shadowRoot!.querySelector(".brand-logo")
    expect(notice).not.toBeNull()
    expect(logo).not.toBeNull()
    expect(notice.anchor()).toBe(logo)
    expect(iframe.contentDocument!.querySelector("app-update-notice")).toBeNull()
  })

  it("delegates camera, microphone and screen capture to the editing frame", async () => {
    const {iframe} = await mountEditor()
    expect(iframe.getAttribute("allow")).toBe("camera; microphone; display-capture")
  })

  it("suppresses UI context menus while preserving text fields, editable content and document menus", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const search = ribbon.shadowRoot!.querySelector("package-search")!
    await (search as any).updateComplete
    const targets = [editor, editor.shadowRoot!.querySelector(".document-layouts-heading")!,
      ribbon.shadowRoot!.querySelector('[aria-label="Preview"]')!,
    ]
    for(const target of targets) {
      const menu = new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true})
      expect(target.dispatchEvent(menu)).toBe(false)
      expect(menu.defaultPrevented).toBe(true)
    }
    const textarea = document.createElement("textarea")
    search.shadowRoot!.append(textarea)
    for(const field of [search.shadowRoot!.querySelector("input")!, textarea]) {
      for(const readOnly of [false, true]) {
        field.readOnly = readOnly
        const menu = new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true})
        expect(field.dispatchEvent(menu)).toBe(true)
        expect(menu.defaultPrevented).toBe(false)
      }
    }
    for(const value of ["", "true", "plaintext-only"]) {
      const rich = document.createElement("div")
      rich.setAttribute("contenteditable", value)
      rich.innerHTML = '<span>Editable</span><span contenteditable="false">Read only UI</span>'
      search.shadowRoot!.append(rich)
      for(const target of [rich, rich.firstElementChild!]) {
        expect(target.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true}))).toBe(true)
      }
      expect(rich.lastElementChild!.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true}))).toBe(false)
    }
    const menu = new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true})
    expect(iframe.contentDocument!.body.dispatchEvent(menu)).toBe(true)
    expect(menu.defaultPrevented).toBe(false)

    editor.remove()
    const detached = new MouseEvent("contextmenu", {bubbles: true, composed: true, cancelable: true})
    expect(editor.dispatchEvent(detached)).toBe(true)
  })

  it("restores iframe hit testing after one paint while DevTools retains focus", async () => {
    const {iframe} = await mountEditor()
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => callbacks.push(callback))
    const cancel = vi.spyOn(window, "cancelAnimationFrame")
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).toBe("none")
    callbacks.shift()!(0)
    expect(getComputedStyle(iframe).pointerEvents).toBe("none")
    callbacks.shift()!(16)
    expect(document.hasFocus()).toBe(false)
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
    expect(cancel).toHaveBeenCalled()
  })

  it("restores iframe hit testing if background animation frames are suspended", async () => {
    const {iframe} = await mountEditor()
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).toBe("none")
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(document.hasFocus()).toBe(false)
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
  })

  it("cancels the pending cursor refresh when focus returns or the editor disconnects", async () => {
    const {editor, iframe} = await mountEditor()
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42)
    const cancel = vi.spyOn(window, "cancelAnimationFrame")
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    window.dispatchEvent(new Event("focus"))
    expect(cancel).toHaveBeenCalledWith(42)
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    cancel.mockClear()
    editor.remove()
    expect(cancel).toHaveBeenCalledWith(42)
    expect(iframe.classList.contains("window-inactive")).toBe(false)
  })

  it.each(["host", "frame", "bridge"])("refreshes iframe hit testing on %s window reactivation without changing its selection", async source => {
    const {editor, iframe} = await mountEditor()
    const doc = iframe.contentDocument!
    doc.body.innerHTML = '<p style="cursor: crosshair">Keep<!--comment--> this</p><demo-widget></demo-widget>'
    const text = doc.querySelector("p")!.firstChild!
    doc.getSelection()!.setBaseAndExtent(text, 1, text, 3)
    const html = doc.body.innerHTML
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false)
    const post = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {})
    const relay = (type: "focus" | "blur", origin = window.location.origin, nonce = (editor as any).bridgeNonce, sender = iframe.contentWindow!) => window.dispatchEvent(new MessageEvent("message", {
      origin, source: sender, data: {type: `editor-frame-window-${type}`, bridgeNonce: nonce},
    }))
    if(source === "host") window.dispatchEvent(new Event("blur"))
    else if(source === "frame") iframe.contentWindow!.dispatchEvent(new Event("blur"))
    else {
      ;(editor as any).editorOpaque = true
      relay("blur", "https://forged.example")
      relay("blur", window.location.origin, "wrong")
      relay("blur", window.location.origin, (editor as any).bridgeNonce, window)
      await Promise.resolve()
      expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
      relay("blur")
    }
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).toBe("none")
    focus.mockReturnValue(true)
    if(source === "host") window.dispatchEvent(new Event("focus"))
    else if(source === "frame") iframe.contentWindow!.dispatchEvent(new Event("focus"))
    else {
      relay("focus", "https://forged.example")
      relay("focus", window.location.origin, "wrong")
      relay("focus", window.location.origin, (editor as any).bridgeNonce, window)
      expect(getComputedStyle(iframe).pointerEvents).toBe("none")
      relay("focus")
      ;(editor as any).editorOpaque = false
    }
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
    expect(iframe.contentDocument).toBe(doc)
    expect(doc.body.innerHTML).toBe(html)
    expect(doc.getSelection()!.anchorNode).toBe(text)
    expect(doc.getSelection()!.anchorOffset).toBe(1)
    expect(doc.getSelection()!.focusNode).toBe(text)
    expect(doc.getSelection()!.focusOffset).toBe(3)
    expect(post.mock.calls.some(([message]) => message?.type === editorFrameControlMessage)).toBe(false)
  })

  it("keeps iframe interaction enabled when focus moves within the page or returns before blur settles", async () => {
    const {iframe} = await mountEditor()
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true)
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
    focus.mockReturnValue(false)
    window.dispatchEvent(new Event("blur"))
    focus.mockReturnValue(true)
    window.dispatchEvent(new Event("focus"))
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
  })

  it("removes the inactive frame state and focus listeners on disconnect, including a pending blur", async () => {
    const {editor, iframe} = await mountEditor()
    const editorWindow = iframe.contentWindow!
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).toBe("none")
    window.dispatchEvent(new Event("blur"))
    editor.remove()
    await Promise.resolve()
    expect(iframe.classList.contains("window-inactive")).toBe(false)
    iframe.classList.add("window-inactive")
    window.dispatchEvent(new Event("focus"))
    editorWindow.dispatchEvent(new Event("focus"))
    expect(iframe.classList.contains("window-inactive")).toBe(true)
  })

  it("keeps touch input reachable while the host window lacks focus", async () => {
    const {iframe} = await mountEditor()
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    const matchMedia = window.matchMedia.bind(window)
    vi.spyOn(window, "matchMedia").mockImplementation(query => query === "(pointer: coarse)"
      ? {...matchMedia(query), matches: true} as MediaQueryList : matchMedia(query))
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
    iframe.contentWindow!.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    expect(getComputedStyle(iframe).pointerEvents).not.toBe("none")
  })

  it("relays touch targeted at the iframe without duplicating native frame input", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const post = vi.spyOn(host, "postFrameControl")
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 300, 200))
    const touch = (type: string, target: EventTarget = iframe, pointerId = 7) => {
      const event = new PointerEvent(type, {bubbles: true, composed: true, cancelable: true,
        pointerType: "touch", pointerId, isPrimary: pointerId === 7, clientX: 30, clientY: 50, buttons: 1})
      target.dispatchEvent(event)
      return event
    }
    expect(touch("pointerdown").defaultPrevented).toBe(true)
    expect(post).toHaveBeenLastCalledWith("pointer", expect.objectContaining({event: "pointerdown", x: 20, y: 30, pointerId: 7}))
    const touchStart = new Event("touchstart", {bubbles: true, composed: true, cancelable: true})
    Object.defineProperty(touchStart, "touches", {value: [{identifier: 7}]})
    iframe.dispatchEvent(touchStart)
    expect(touchStart.defaultPrevented).toBe(false)
    touch("pointerdown", iframe, 8)
    touch("pointerup", iframe, 8)
    touch("pointermove")
    expect(post).toHaveBeenLastCalledWith("pointer", expect.objectContaining({event: "pointermove", pointerId: 7}))
    touch("pointercancel")
    const count = post.mock.calls.length
    touch("pointermove")
    touch("pointerdown", iframe.contentDocument!.body)
    expect(post.mock.calls.length).toBe(count)
    const mouse = new PointerEvent("pointerdown", {bubbles: true, pointerType: "mouse"})
    iframe.dispatchEvent(mouse)
    expect(mouse.defaultPrevented).toBe(false)
    expect(post.mock.calls.length).toBe(count)
  })

  it.each([false, true])("lets the opaque frame preserve selection before focusing (restore: %s)", async restoreSelection => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.editorOpaque = true
    const post = vi.spyOn(host, "postFrameControl")
    const focus = vi.spyOn(iframe, "focus")

    host.focusEditor(restoreSelection)

    expect(post).toHaveBeenCalledExactlyOnceWith("focus", {restoreSelection})
    expect(focus).not.toHaveBeenCalled()
    expect(host.savedEditorSelection).toBeNull()
  })

  it("refocuses an active graphic label without replacing its text range", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const graphic = {textEditingRange: iframe.contentDocument!.createRange(), focusTextInput: vi.fn()}
    Object.assign(editorWindow, {editor: {features: {graphic}}})
    const focusBody = vi.spyOn(iframe.contentDocument!.body, "focus")
    ;(editor as any).focusEditor(true)
    expect(graphic.focusTextInput).toHaveBeenCalledOnce()
    expect(focusBody).not.toHaveBeenCalled()
    expect((editor as any).savedEditorSelection).toBeNull()
  })

  it("delegates captured widget focus without replacing its native input selection", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const body = iframe.contentDocument!.body
    const widget = iframe.contentDocument!.createElement("focus-widget")
    const input = iframe.contentDocument!.createElement("input")
    input.value = "1815"
    widget.attachShadow({mode: "open"}).append(input)
    body.replaceChildren(widget)
    const focusCapturedWidget = vi.fn(() => { input.focus(); input.select(); return true })
    Object.assign(editorWindow, {editor: {features: {
      mark: {focusWidgetText: () => false}, selection: {focusCapturedWidget},
    }}})
    const focusBody = vi.spyOn(body, "focus")

    ;(editor as any).focusEditor()
    expect(focusCapturedWidget).toHaveBeenCalledOnce()
    expect(widget.shadowRoot!.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(4)
    expect(focusBody).not.toHaveBeenCalled()
    expect((editor as any).savedEditorSelection).toBeNull()
  })

  it("preserves the first widget's breadcrumb selection when refocusing the document", async () => {
    const {editor, iframe} = await mountEditor()
    const body = iframe.contentDocument!.body
    body.innerHTML = "<interactive-widget></interactive-widget><p>after</p>"
    const selection = iframe.contentWindow!.getSelection()!
    selection.setPosition(body, 0)
    vi.spyOn(editor, "execute").mockImplementation(async () => {
      selection.setBaseAndExtent(body, 0, body, 1)
      return {update: []}
    })
    vi.spyOn(body, "focus").mockImplementation(() => selection.setPosition(body, 0))

    ;(editor as any).handleBreadcrumbItemSelect(new CustomEvent("item-select", {detail: {path: [0]}}))

    await vi.waitFor(() => expect(body.focus).toHaveBeenCalled())
    expect(selection.anchorNode).toBe(body)
    expect(selection.anchorOffset).toBe(0)
    expect(selection.focusNode).toBe(body)
    expect(selection.focusOffset).toBe(1)
    expect(selection.isCollapsed).toBe(false)
  })

  it("restores iframe focus after a package reload from inside the shadow root", async () => {
    const {editor, iframe} = await mountEditor()
    const state = editor as any
    iframe.focus()
    expect(document.activeElement).toBe(editor)
    expect(editor.shadowRoot!.activeElement).toBe(iframe)
    state.savedEditorSelection = null
    vi.spyOn(editor, "execute").mockResolvedValue({update: []})
    let finishLoading!: () => void
    vi.spyOn(state, "waitForEditorWindow").mockImplementation(() => new Promise<void>(resolve => { finishLoading = resolve }))
    const focus = vi.spyOn(state, "focusEditor")
    const reload = state.reloadEditor([])
    await vi.waitFor(() => expect(finishLoading).toBeDefined())
    iframe.blur()
    expect(focus).not.toHaveBeenCalled()
    finishLoading()
    await reload
    expect(focus).toHaveBeenCalledOnce()
    const reloadedFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    expect(reloadedFrame).not.toBe(iframe)
    expect(editor.shadowRoot!.activeElement).toBe(reloadedFrame)
  })

  it.each([true, false])("uses the snapshot's published revision during package reload (current: %s)", async current => {
    const {editor} = await mountEditor()
    const host = editor as any
    const previousRevision = host.frameRevision
    vi.spyOn(host, "waitForEditorWindow").mockResolvedValue(window)
    vi.spyOn(editor, "execute").mockImplementationOnce(async () => {
      host.documentChangeSequence++
      host.documentReplicaSequence = 2
      return {update: new Uint8Array([0]), replicaSequence: current ? 2 : 1}
    })
    if(current) await host.reloadEditor([])
    else await expect(host.reloadEditor([])).rejects.toThrow("The editor changed while loading packages")
    expect(host.frameRevision).toBe(previousRevision + Number(current))
  })

  it.each(["initial", "preview", "reload", "disconnected"])("focuses the initial selection after loading: %s", async mode => {
    const editor = new DomEditor()
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined)
    const focus = vi.spyOn(editor as any, "focusEditor")
    iframe.dispatchEvent(new Event("load"))
    const paragraph = iframe.contentDocument!.createElement("p")
    iframe.contentDocument!.body.append(paragraph)
    const selection = iframe.contentWindow!.getSelection()!
    selection.setPosition(paragraph, 0)
    expect(focus).not.toHaveBeenCalled()
    if(mode === "preview") Object.assign(editor, {previewActive: true})
    if(mode === "reload") Object.assign(editor, {frameRevision: 1})
    const loaded = (editor as any).packageLoadPromise
    completePendingPackageLoad(editor)
    if(mode === "disconnected") editor.remove()
    await loaded
    if(mode === "initial") {
      expect(focus).toHaveBeenCalledOnce()
      expect(editor.shadowRoot!.activeElement).toBe(iframe)
      expect(selection.anchorNode).toBe(paragraph)
      expect(selection.anchorOffset).toBe(0)
    }
    else expect(focus).not.toHaveBeenCalled()
  })

  it("starts when catalog and local packages both finish within the 250 ms startup window", async () => {
    vi.useFakeTimers()
    try {
      const editor = new DomEditor()
      const state = editor as any
      let restore!: (packages: WebWriterPackage[]) => void
      vi.spyOn(state.localPackageManager, "restore").mockImplementation(() => new Promise(resolve => { restore = resolve }))
      const execute = vi.spyOn(editor, "execute")
      document.body.append(editor)
      await editor.updateComplete
      await vi.advanceTimersByTimeAsync(25)
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()
      restore([demoPackage])
      await vi.advanceTimersByTimeAsync(0)
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBeNull()
      expect(state.installedPackages).toEqual([demoPackage])
      expect(state.frameRevision).toBe(0)
      expect(execute).not.toHaveBeenCalled()
    }
    finally { vi.useRealTimers() }
  })

  it("waits for the catalog after local packages finish", async () => {
    vi.useFakeTimers()
    try {
      const editor = new DomEditor()
      const state = editor as any
      let finishCatalog!: (packages: WebWriterPackage[]) => void
      vi.mocked(WebWriterPackageRegistry.prototype.search)
        .mockImplementationOnce(() => new Promise(resolve => { finishCatalog = resolve }))
      vi.spyOn(state.localPackageManager, "restore").mockResolvedValue([demoPackage])
      document.body.append(editor)
      await editor.updateComplete
      await vi.advanceTimersByTimeAsync(200)
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()
      expect(state.installedPackages).toEqual([demoPackage])
      finishCatalog([])
      await vi.advanceTimersByTimeAsync(0)
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBeNull()
      expect(state.frameRevision).toBe(0)
    }
    finally { vi.useRealTimers() }
  })

  it("starts after 250 ms and reloads normally when packages restore later", async () => {
    vi.useFakeTimers()
    try {
      const editor = new DomEditor()
      const state = editor as any
      let restore!: (packages: WebWriterPackage[]) => void
      vi.spyOn(state.localPackageManager, "restore").mockImplementation(() => new Promise(resolve => { restore = resolve }))
      document.body.append(editor)
      await editor.updateComplete
      await vi.advanceTimersByTimeAsync(249)
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBeNull()
      const execute = vi.spyOn(editor, "execute").mockResolvedValue({update: []})
      vi.spyOn(state, "waitForEditorWindow").mockResolvedValue(window)
      restore([demoPackage])
      await vi.advanceTimersByTimeAsync(0)
      await editor.updateComplete
      expect(execute).toHaveBeenCalledWith({type: "snapshotState"})
      expect(state.installedPackages).toEqual([demoPackage])
      expect(state.frameRevision).toBe(1)
    }
    finally { vi.useRealTimers() }
  })

  it("starts immediately if package restoration fails", async () => {
    vi.useFakeTimers()
    try {
      const editor = new DomEditor()
      const state = editor as any
      vi.spyOn(state.localPackageManager, "restore").mockRejectedValue(new Error("Restoration failed"))
      document.body.append(editor)
      await vi.advanceTimersByTimeAsync(0)
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBeNull()
      expect(state.localPackageError).toBe("Restoration failed")
    }
    finally { vi.useRealTimers() }
  })

  it("ignores a disconnected startup when reconnected", async () => {
    vi.useFakeTimers()
    try {
      const editor = new DomEditor()
      const state = editor as any
      let restore!: (packages: WebWriterPackage[]) => void
      vi.spyOn(state.localPackageManager, "restore")
        .mockImplementationOnce(() => new Promise(resolve => { restore = resolve }))
        .mockImplementationOnce(() => new Promise(() => {}))
      document.body.append(editor)
      await editor.updateComplete
      await vi.advanceTimersByTimeAsync(25)
      editor.remove()
      await vi.advanceTimersByTimeAsync(250)
      expect(state.frameStarted).toBe(false)
      document.body.append(editor)
      restore([])
      await vi.advanceTimersByTimeAsync(249)
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).not.toBeNull()
    }
    finally { vi.useRealTimers() }
  })

  it("resolves only ready documented widgets into one focused proposal", async () => {
    const editor = new DomEditor()
    const state = editor as any
    state.installedPackages = [{...demoPackage, members: [{...demoPackage.members[0], tagName: "ai-ready-widget"}]}]
    state.editorWindow = window
    customElements.define("ai-ready-widget", class extends HTMLElement {})
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({status: "previewing"})
    const call = {id: "widget-proposal", name: "queue_document_change", arguments: {summary: "Add an interactive exercise.", operations: [
      {type: "insert_widget", target: "read-target", position: "after", memberId: demoPackage.members[0].id, attributes: {answer: "7"}},
    ]}}
    await expect(state.handleAIEditReview("preview", call)).rejects.toThrow("README")
    state.aiDocumentedPackages.add(`${demoPackage.name}@${demoPackage.version}/published`)
    await state.handleAIEditReview("preview", call)
    expect(execute).toHaveBeenLastCalledWith({type: "previewAIOperations", editId: call.id, summary: call.arguments.summary,
      operations: [{type: "insert_html", target: "read-target", position: "after", html: '<ai-ready-widget answer="7"></ai-ready-widget>'}], availableWidgets: ["ai-ready-widget"],
    })
    execute.mockClear()
    const controller = new AbortController()
    controller.abort()
    await expect(state.handleAIEditReview("preview", call, {signal: controller.signal})).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    state.installedPackages = []
    await expect(state.handleAIEditReview("preview", call)).rejects.toThrow("unavailable")
  })

  it("reads published initialization documentation before preserving configured automaton state", async () => {
    const editor = new DomEditor(), state = editor as any
    const tagName = "ai-configured-automaton"
    customElements.define(tagName, class extends HTMLElement {})
    state.editorWindow = window
    state.installedPackages = [{...demoPackage, members: [{...demoPackage.members[0], tagName}]}]
    const nodes = "#0(-150|0);%1(0|0);2(150|0)"
    const transitions = "0-1[a];0-2[b];1-1[b];1-2[a];2-2[a,b]"
    const markdown = '# Initialization\nEncode nodes as [#][%]id(x|y) and transitions as from-to[symbols], separated by semicolons. DFAs require a transition for every symbol at every state.'
    const read = vi.spyOn(state.packageRegistry, "readPackageReadme").mockResolvedValue({status: "available", source: "published",
      packageName: demoPackage.name, version: demoPackage.version, path: "README.md", markdown})
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({status: "previewing"})
    const call = {id: "automaton-proposal", name: "queue_document_change", arguments: {summary: "Add an automaton accepting ab*.", operations: [
      {type: "insert_widget", target: "body", position: "append", memberId: demoPackage.members[0].id,
        attributes: {type: "dfa", nodes, transitions}},
    ]}}
    await expect(state.handleAIEditReview("preview", call)).rejects.toThrow("README")
    const docs = await state.handleAIDocumentTool({id: "docs", name: "read_widget_documentation",
      arguments: {packageName: demoPackage.name, version: demoPackage.version}})
    expect(docs.markdown).toBe(markdown)
    expect(read).toHaveBeenCalledOnce()
    await state.handleAIEditReview("preview", call)
    const proposal = execute.mock.calls.at(-1)![0] as any
    const wrapper = document.createElement("div")
    wrapper.innerHTML = proposal.operations[0].html
    expect(wrapper.firstElementChild!.getAttribute("nodes")).toBe(nodes)
    expect(wrapper.firstElementChild!.getAttribute("transitions")).toBe(transitions)
    expect(proposal.availableWidgets).toContain(tagName)
  })

  it("reads AI widget documentation only for known exact package versions", async () => {
    const editor = new DomEditor()
    const state = editor as any
    state.installedPackages = [demoPackage]
    const read = vi.spyOn(state.packageRegistry, "readPackageReadme").mockResolvedValue({
      status: "available", source: "published", packageName: demoPackage.name, version: "1.0.0", path: "README.md", markdown: "# Demo",
    })
    const signal = new AbortController().signal
    const result = await state.handleAIDocumentTool({id: "docs", name: "read_widget_documentation", arguments: {packageName: demoPackage.name, version: "1.0.0", startLine: 1}}, {signal})
    expect(result).toMatchObject({markdown: "# Demo", members: expect.arrayContaining([expect.objectContaining({id: demoPackage.members[0].id})])})
    expect(read).toHaveBeenCalledWith(demoPackage, {signal, startLine: 1, lineCount: undefined})
    expect(await state.handleAIDocumentTool({id: "unknown", name: "read_widget_documentation", arguments: {packageName: demoPackage.name, version: "latest"}})).toMatchObject({status: "unavailable"})
    expect(await state.handleAIDocumentTool({id: "path", name: "read_widget_documentation", arguments: {packageName: "file:///secret", version: "1.0.0"}})).toMatchObject({status: "unavailable"})
    expect(read).toHaveBeenCalledOnce()
  })
  it("reports dynamic AI widget readiness and keeps read tools on their fixed bridge actions", async () => {
    const editor = new DomEditor()
    const state = editor as any
    state.packages = [demoPackage]
    state.editorWindow = window
    expect(state.listAIWidgets({}).members[0]).toMatchObject({installed: false, available: false})
    state.installedPackages = [demoPackage]
    expect(state.listAIWidgets({}).members[0]).toMatchObject({installed: true, registered: false, available: false})
    if(!customElements.get("webwriter-demo")) customElements.define("webwriter-demo", class extends HTMLElement {})
    expect(state.listAIWidgets({}).members[0]).toMatchObject({available: true, version: "1.0.0"})
    state.installedPackages = []
    expect(state.listAIWidgets({query: "demo"}).members[0].available).toBe(false)
    expect(state.listAIWidgets({query: "absent"}).members).toEqual([])
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({})
    await state.handleAIDocumentTool({id: "inspect", name: "inspect_elements", arguments: {type: "replaceAIDocument", selector: "p"}})
    expect(execute).toHaveBeenCalledWith({type: "inspectAIElements", selector: "p"}, {})
  })
  it("shows and dismisses file errors outside the authored document", async () => {
    const {editor, iframe} = await mountEditor()
    vi.spyOn(console, "error").mockImplementation(() => {})
    const listener = vi.fn()
    editor.addEventListener("file-error", listener)
    ;(editor as any).reportFileError(new Error("The disk is full"))
    await editor.updateComplete
    const alert = editor.shadowRoot!.querySelector<HTMLElement>(".file-error")!
    expect(alert.textContent).toContain("The disk is full")
    expect(listener).toHaveBeenCalledOnce()
    expect(iframe.contentDocument!.querySelector(".file-error")).toBeNull()
    alert.querySelector("button")!.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".file-error")).toBeNull()
  })


  it("preserves themes, authored styles, editing attributes and isolated HTTPS embeds in preview", async () => {
    const {editor} = await mountEditor()
    const doc = new DOMParser().parseFromString('<html spellcheck="true"><head><style data-ww-theme="water">p { color: red }</style></head><body contenteditable="false"><p style="font-size: 2em">Text</p><iframe src="https://example.com/embed" sandbox="allow-same-origin allow-scripts"></iframe></body></html>', "text/html")
    const html = (editor as any).preparePreviewDocument(doc) as string
    expect(html).toContain('data-ww-theme="water"')
    expect(html).toContain("color: red")
    expect(html).toContain('contenteditable="false"')
    expect(html).toContain('spellcheck="true"')
    const preview = new DOMParser().parseFromString(html, "text/html")
    expect(preview.querySelector("iframe")!.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin")
    expect(preview.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull()
  })


  it("sanitizes incoming live HTML and permits only trusted package scripts", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.installedPackages = [{...demoPackage, styles: []}]
    const parsed = new DOMParser().parseFromString('<p onclick="bad()">Keep</p><script>bad()</script><iframe srcdoc="bad"></iframe><template><img src="x" onerror="bad()"></template>', "text/html")
    const html = host.preparePreviewDocument(parsed) as string
    const preview = new DOMParser().parseFromString(html, "text/html")
    expect(preview.querySelector("[onclick], [onerror], [srcdoc]")).toBeNull()
    expect(preview.querySelector("template")!.content.querySelector("[onerror]")).toBeNull()
    expect([...preview.querySelectorAll("script")].every(script =>
      script.src && !script.textContent || script.type === "application/json")).toBe(true)
    expect(preview.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toContain("strict-dynamic")
    expect(preview.querySelector("p")!.textContent).toBe("Keep")
  })


  it("warns before unloading unsaved work and removes the guard on disconnect", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const clean = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    host.fileDirty = true
    const dirty = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
    editor.remove()
    const detached = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(detached)
    expect(detached.defaultPrevented).toBe(false)
  })

  it("warns before unloading while AI is thinking or has queued messages, and releases the guard after cancellation", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const host = ribbon as any
    const unloadPrevented = () => {
      const event = new Event("beforeunload", {cancelable: true})
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(unloadPrevented()).toBe(false)
    host.aiBusy = true
    expect(unloadPrevented()).toBe(true)
    host.aiBusy = false
    expect(unloadPrevented()).toBe(false)
    host.queuedAIPrompts = [{prompt: "Next", chatId: "chat-1", messageId: "queued", attachments: []}]
    expect(unloadPrevented()).toBe(true)
    await ribbon.cancelAIWork()
    expect(unloadPrevented()).toBe(false)
    host.aiBusy = true
    editor.remove()
    expect(unloadPrevented()).toBe(false)
  })

  it("rebootstraps a new same-revision shell from the latest authored snapshot and rejects replays", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const frameOrigin = new URL(host.frameShellURL("editor", 0)).origin
    const oldInstance = "11111111-1111-4111-8111-111111111111"
    const newInstance = "22222222-2222-4222-8222-222222222222"
    const source = new DOMParser().parseFromString(`<!doctype html>
      <html lang="fr"><head><title>Keep title</title>
        <script class="◆ ◆editor-only">bootstrap</script>
        <meta data-webwriter-editor-only=""></head><body>
        <!-- retain body comment --><webwriter-demo data-custom="keep" class="authored ◆selected" contenteditable="">
          <template><!-- retain template comment --><x-child data-template="keep"></x-child></template>
        </webwriter-demo></body></html>`, "text/html")
    host.installedPackages = [{...demoPackage, scripts: [], styles: []}]
    host.editorDocument = source
    host.editorWindow = iframe.contentWindow
    host.editorOpaque = false
    host.editorShellRevision = 0
    host.editorShellInstanceId = oldInstance
    host.editorInitializedRevision = 0
    host.frameState = {update: [new Uint8Array([1])], origin: "stale"}
    host.fileDirty = true
    host.fileName = "keep.html"
    host.backendDocumentId = "keep-document-id"
    const rejectFrameRequest = vi.fn()
    const rejectExecution = vi.fn()
    const rejectReady = vi.fn()
    host.frameRequests.set("stale-frame-request", {
      resolve: vi.fn(), reject: rejectFrameRequest, timer: setTimeout(() => {}, 60_000),
    })
    host.pendingExecutions.set("stale-execution", {resolve: vi.fn(), reject: rejectExecution})
    host.editorReadyPromise = Promise.resolve(iframe.contentWindow)
    host.editorReadyReject = rejectReady
    const post = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {})
    post.mockClear()
    const ready = (instanceId: string, origin = frameOrigin, eventSource: MessageEventSource | null = iframe.contentWindow) => host.handleEditorMessage(new MessageEvent("message", {
      origin,
      source: eventSource,
      data: {type: "webwriter-frame-shell-ready", kind: "editor", revision: "0", bridgeNonce: host.bridgeNonce, instanceId},
    }))

    ready(oldInstance)
    expect(post).not.toHaveBeenCalled()
    ready("not-a-uuid")
    ready(newInstance, "https://forged.example")
    ready(newInstance, frameOrigin, window)
    expect(post).not.toHaveBeenCalled()

    ready(newInstance)
    expect(post).toHaveBeenCalledTimes(1)
    const payload = post.mock.calls[0][0] as {type: string, html: string}
    expect(payload.type).toBe("webwriter-frame-document")
    expect(payload.html).toContain("<!DOCTYPE html>")
    expect(payload.html).toContain("<title>Keep title</title>")
    expect(payload.html).toContain("<!-- retain body comment -->")
    expect(payload.html).toContain("<!-- retain template comment -->")
    expect(payload.html).toContain('data-custom="keep"')
    expect(payload.html).toContain('data-template="keep"')
    const bootstrapped = new DOMParser().parseFromString(payload.html, "text/html")
    expect(bootstrapped.body.querySelector("webwriter-demo")?.getAttribute("class")).toBe("authored")
    expect(bootstrapped.querySelector('meta[data-webwriter-editor-only]')).toBeNull()
    expect(bootstrapped.querySelector('script:not([src])')?.textContent).not.toContain("bootstrap")
    expect(bootstrapped.body.querySelector("[contenteditable]")).toBeNull()
    expect(host.editorInitializedRevision).toBe(-1)
    expect(host.frameState).toBeUndefined()
    expect(rejectFrameRequest).toHaveBeenCalledWith(expect.any(Error))
    expect(rejectExecution).toHaveBeenCalledWith(expect.any(Error))
    expect(rejectReady).toHaveBeenCalledWith(expect.any(Error))
    expect(host.frameRequests.size).toBe(0)
    expect(host.pendingExecutions.size).toBe(0)
    expect(host.editorReadyPromise).toBeNull()
    expect(host.fileDirty).toBe(true)
    expect(host.fileName).toBe("keep.html")
    expect(host.backendDocumentId).toBe("keep-document-id")

    ready(newInstance)
    expect(post).toHaveBeenCalledTimes(1)
    const initialize = vi.spyOn(host, "initializeEditorFrame").mockImplementation(() => {})
    host.handleEditorMessage(new MessageEvent("message", {
      origin: frameOrigin,
      source: iframe.contentWindow,
      data: {type: "webwriter-editor-frame-ready", bridgeNonce: host.bridgeNonce},
    }))
    expect(initialize).toHaveBeenCalledWith(iframe)
  })


  it.each([
    ["local", "body"], ["development-server", "body"],
    ["local", "template"], ["development-server", "template"],
  ])("keeps %s saves dirty after %s edits and excludes overlapping file actions", async (storageLocation, target) => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.storageLocation = storageLocation
    if(storageLocation === "development-server") {configureCloudStorage(host); host.backendDocumentId = "saved"}
    const template = iframe.contentDocument!.createElement("template")
    iframe.contentDocument!.body.append(template)
    await new Promise(resolve => setTimeout(resolve, 0))
    const draft = seedRecoveryDraft(editor)
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const write = vi.fn(() => pending)
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({
      name: "lesson.html", createWritable: async() => ({write, close: async() => {}}),
    }))
    host.backendClient = {updateDocument: vi.fn(async() => { await write(); return {id: "saved", title: "lesson", format: "html"} })}
    mockSaveSnapshot(editor, "<p>Saved snapshot</p>")
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    const saving = host.saveDocument()
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    const container = target === "template" ? template.content : iframe.contentDocument!.body
    container.append(iframe.contentDocument!.createElement("p"))
    await new Promise(resolve => setTimeout(resolve, 0))
    await host.newDocument()
    await host.saveDocument()
    expect(reload).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledOnce()
    finish()
    await saving
    expect(host.fileDirty).toBe(true)
    expect(host.documentRecoveryCheckpoint).toBe(draft)
    expect(remove).not.toHaveBeenCalled()
  })

  it("preserves edits made while an opened file is being read", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    let finish!: (source: string) => void
    const text = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async() => ({name: "opened.html", text})}]))
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    const error = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    const opening = host.openDocument()
    await vi.waitFor(() => expect(text).toHaveBeenCalledOnce())
    iframe.contentDocument!.body.append(iframe.contentDocument!.createElement("p"))
    await new Promise(resolve => setTimeout(resolve, 0))
    finish("<p>Opened</p>")
    await opening
    expect(reload).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.objectContaining({message: expect.stringContaining("changed while opening")}))
  })


  it("settles cancellation and timeouts while iframe initialization is stalled", async () => {
    const {editor} = await mountEditor()
    let ready!: (value: Window) => void
    vi.spyOn(editor as unknown as {waitForEditorWindow(): Promise<Window>}, "waitForEditorWindow")
      .mockReturnValue(new Promise(resolve => { ready = resolve }))
    const controller = new AbortController()
    const aborted = editor.execute({type: "undo"}, {signal: controller.signal})
    controller.abort()
    await expect(aborted).rejects.toMatchObject({name: "AbortError"})
    vi.useFakeTimers()
    try {
      const timedOut = editor.execute({type: "undo"})
      const assertion = expect(timedOut).rejects.toThrow("did not respond in time")
      await vi.advanceTimersByTimeAsync(15_001)
      await assertion
    }
    finally { vi.useRealTimers() }
    const post = vi.spyOn(editor as unknown as {postToEditor(value: unknown): void}, "postToEditor")
    ready(window)
    await Promise.resolve()
    expect(post).not.toHaveBeenCalled()
  })

  it("starts new documents with the current WebWriter generator metadata", async () => {
    const {iframe} = await mountEditor()

    expect(iframe.contentDocument!.head.querySelector('meta[name="generator"]')?.getAttribute("content"))
      .toBe(WEBWRITER_GENERATOR)
  })

  it("discards the entire iframe and ignores old document messages when creating a new document", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const host = editor as any
    const oldDocument = iframe.contentDocument!
    oldDocument.documentElement.setAttribute("data-authored", "old")
    oldDocument.head.insertAdjacentHTML("beforeend", "<title>Old canvas</title><style>body {color: red}</style>")
    oldDocument.body.className = "ww-canvas"
    oldDocument.body.innerHTML = '<div><div><custom-widget answer="42"><!--keep--><p>Old canvas content</p></custom-widget></div></div>'
    oldDocument.body.attachShadow({mode: "open"}).innerHTML = "<slot></slot><div>Old controls</div>"
    const oldHTML = oldDocument.documentElement.outerHTML
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    host.frameState = {update: [1, 2, 3]}
    host.savedEditorSelection = {anchor: {}, focus: {}}
    host.undoState = {canUndo: true, canRedo: true}
    const initializeFrame = host.initializeEditorFrame.bind(host)
    vi.spyOn(host as {initializeEditorFrame(frame: HTMLIFrameElement): void}, "initializeEditorFrame").mockImplementation(frame => {
      if(frame === host.editorIframe()) wirePackageLoadCompletion(frame.contentWindow!)
      initializeFrame(frame)
    })

    for(let iteration = 0; iteration < 2; iteration++) {
      const previousFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
      await host.newDocument("document")
      await editor.updateComplete
      const freshFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
      expect(freshFrame).not.toBe(previousFrame)
      expect(previousFrame.isConnected).toBe(false)
      expect(freshFrame.contentWindow).not.toBe(editorWindow)
      expect(host.editorDocument).toBe(freshFrame.contentDocument)
      expect(host.editorDocument.documentElement.hasAttribute("data-authored")).toBe(false)
      expect(host.editorDocument.title).toBe("")
      expect(host.editorDocument.body.innerHTML).toBe("")
      expect(host.editorDocument.body.shadowRoot).toBeNull()
      expect(host.frameState).toBeUndefined()
      expect(host.savedEditorSelection).toBeNull()
      expect(host.undoState).toEqual({canUndo: false, canRedo: false})
      expect(host.documentLayout).toMatchObject({mode: "document", canConvert: true})
      expect(host.documentLayoutsDismissed).toBe(false)
      expect(host.fileDirty).toBe(false)

      initializeFrame(previousFrame)
      host.editorOpaque = true
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin, source: editorWindow,
        data: {...frameUpdate(host, oldHTML), bridgeNonce: host.bridgeNonce},
      }))
      host.handleEditorMessage(new MessageEvent("message", {
        origin: new URL(host.frameShellURL("editor", host.frameRevision)).origin, source: editorWindow,
        data: {type: "webwriter-editor-frame-ready", bridgeNonce: host.bridgeNonce},
      }))
      expect(host.editorDocument).toBe(freshFrame.contentDocument)
      expect(host.editorWindow).toBe(freshFrame.contentWindow)
      expect(host.fileDirty).toBe(false)
      host.editorOpaque = false

      editor.requestUpdate()
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector("iframe.editor-frame")).toBe(freshFrame)
    }
  })

  it("passes the saved-once accessibility gate into initial and restarted editor frames", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const checkInitialization = async (enabled: boolean) => {
      host.accessibilityReviewEnabled = enabled
      const post = vi.spyOn(host, "postToEditor")
      host.initializeEditorFrame(iframe)
      await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({
        type: initializeEditorMessage, accessibilityReviewEnabled: enabled,
      })))
      await host.packageLoadPromise
      post.mockRestore()
    }
    await checkInitialization(false)
    await checkInitialization(true)
  })

  it("includes the preferred language in fresh document HTML before initialization", async () => {
    const {editor, iframe} = await mountEditor(editor => {
      Object.assign(editor, {settings: {...defaultAppSettings(), language: "de"}})
    })
    const host = editor as any
    const source = new DOMParser().parseFromString(host.editorSrcdocFromHTML(null), "text/html")
    expect(source.documentElement.lang).toBe("de")
    expect(source.head.querySelector('meta[name="generator"]')?.getAttribute("content")).toBe(WEBWRITER_GENERATOR)
    expect(source.body.childNodes).toHaveLength(0)
    expect(iframe.contentDocument!.documentElement.lang).toBe("de")

    const loaded = new DOMParser().parseFromString(host.editorSrcdocFromHTML('<html lang="fr"><head></head><body><p>Bonjour</p></body></html>'), "text/html")
    expect(loaded.documentElement.lang).toBe("fr")
    expect(loaded.body.textContent).toBe("Bonjour")
  })

  it.each([undefined, "en", "fr"])("uses browser detection or the saved %s override for initial and new documents", async language => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE", "en-US"])
    if(language) localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({language, shortcutsVersion: 2}))
    const {editor, iframe} = await mountEditor()
    const expected = language ?? "de-DE"
    expect(iframe.contentDocument!.documentElement.lang).toBe(expected)
    expect((editor as any).settings.language).toBe(expected)

    const reload = vi.spyOn(editor as any, "reloadDocument").mockResolvedValue(undefined)
    await (editor as any).newDocument()
    expect(reload).toHaveBeenCalledWith(expect.stringContaining(`<html lang="${expected}">`), true, null, undefined, {discardRecovery: false})
  })

  it("preserves authored meta refresh metadata in the editor frame HTML", async () => {
    const {editor} = await mountEditor()
    const source = new DOMParser().parseFromString((editor as any).editorSrcdocFromHTML(
      '<!doctype html><html><head><meta http-equiv="refresh" content="5; URL=/next" data-authored="yes"></head><body>Keep editing</body></html>',
    ), "text/html")
    const refresh = source.head.querySelector('meta[http-equiv="refresh"]')

    expect(refresh?.getAttribute("http-equiv")).toBe("refresh")
    expect(refresh?.getAttribute("content")).toBe("5; URL=/next")
    expect(refresh?.getAttribute("data-authored")).toBe("yes")
    expect(source.body.textContent).toBe("Keep editing")
  })

  it("shows a startup error from the current editor frame and rejects readiness", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const frameOrigin = host.frameShellURL("editor", host.frameRevision).split("/frame-shell.html")[0]
    const rejectReady = vi.fn()
    host.editorWindow = null
    host.editorReadyPromise = new Promise(() => {})
    host.editorReadyReject = rejectReady

    host.handleEditorMessage(new MessageEvent("message", {
      origin: frameOrigin,
      source: iframe.contentWindow,
      data: {type: "webwriter-frame-error", kind: "editor", revision: String(host.frameRevision),
        bridgeNonce: host.bridgeNonce, message: "Unsupported refresh"},
    }))

    expect(host.fileError).toBe("Unsupported refresh")
    expect(host.documentLoading).toBe(false)
    expect(rejectReady).toHaveBeenCalledWith(expect.objectContaining({message: "Unsupported refresh"}))
    await expect(host.waitForEditorWindow()).rejects.toThrow("Unsupported refresh")
  })

  it.each(["canvas", "slides"] as const)("uses the selected %s layout for File → New and keeps its fresh state clean", async mode => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
      detail: {...defaultAppSettings(), defaultLayout: mode}, bubbles: true, composed: true,
    }))
    const reload = vi.spyOn(host, "reloadDocument").mockImplementation(async () => {
      iframe.contentDocument!.body.innerHTML = "<p></p>"
    })
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "setDocumentLayout") iframe.contentDocument!.body.className = mode === "canvas" ? "ww-canvas" : "ww-slides"
      return true
    })

    await host.newDocument()

    expect(reload).toHaveBeenCalledWith(expect.stringContaining('<meta name="generator"'), true, null, undefined, {discardRecovery: false})
    expect(execute).toHaveBeenCalledWith({type: "setDocumentLayout", mode, expectedMode: "document"})
    expect(host.fileDirty).toBe(false)
    expect(host.isFreshDocumentUnchanged()).toBe(true)
    iframe.contentDocument!.querySelector("p")!.textContent = "Edited"
    expect(host.isFreshDocumentUnchanged()).toBe(false)
  })

  it.each([
    ["canvas", false], ["canvas", true], ["slides", false], ["slides", true],
  ] as const)("keeps edits made while creating a new %s document dirty (isolated frame: %s)", async (mode, isolated) => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    const doc = iframe.contentDocument!
    vi.spyOn(host, "reloadDocument").mockImplementation(async () => {
      doc.body.innerHTML = "<p></p>"
    })
    let complete!: (result: boolean) => void
    const execute = vi.spyOn(editor, "execute").mockImplementation(() => new Promise(resolve => {complete = resolve}))
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "requestFrameControl").mockImplementation(async () => {
        window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, doc)}))
        return {html: doc.documentElement.outerHTML}
      })
    }
    const creating = host.newDocument(mode)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setDocumentLayout", mode, expectedMode: "document"}))
    doc.body.className = mode === "canvas" ? "ww-canvas" : "ww-slides"
    doc.body.innerHTML = "<p>Typed while creating the document</p>"
    await new Promise(resolve => setTimeout(resolve, 0))
    complete(true)
    await creating
    expect(host.fileDirty).toBe(true)
    expect(host.isFreshDocumentUnchanged()).toBe(false)
    const unload = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false))
    expect(host.confirmDocumentSwitch()).toBeNull()
  })

  it.each(["document", "canvas", "slides", "board"] as const)("creates an explicit %s layout from the New submenu without changing the default", async mode => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...host.settings, defaultLayout: "slides"}
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    const apply = vi.spyOn(host, "applyDefaultLayout").mockResolvedValue(undefined)
    editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: `new:${mode}`}, bubbles: true, composed: true,
    }))
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(mode, host.frameRevision))
    expect(reload).toHaveBeenCalledOnce()
    expect(host.settings.defaultLayout).toBe("slides")
    expect(host.fileDirty).toBe(false)
  })

  it("applies the saved default layout to the first blank document", async () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...defaultAppSettings(), defaultLayout: "canvas"}))
    const execute = vi.spyOn(DomEditor.prototype, "execute").mockImplementation(async function(this: DomEditor, action) {
      if(action.type === "setDocumentLayout") this.shadowRoot!.querySelector("iframe")!.contentDocument!.body.classList.add("ww-canvas")
      return true
    })
    const {editor} = await mountEditor()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"}))
    expect((editor as any).fileDirty).toBe(false)
  })

  it("keeps the Style toolbox hidden after settings changes without changing authored HTML", async () => {
    const {editor, iframe} = await mountEditor()
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const authoredHTML = iframe.contentDocument!.documentElement.outerHTML
    await toolbox.updateComplete
    expect(toolbox.showStyleToolbox).toBe(false)
    for(const disableAnimations of [true, false]) {
      ribbon.dispatchEvent(new CustomEvent("app-settings-change", {
        detail: {...defaultAppSettings(), disableAnimations}, bubbles: true, composed: true,
      }))
      await editor.updateComplete
      await toolbox.updateComplete
      expect(toolbox.shadowRoot!.querySelector('button[data-tool="Style"]')).toBeNull()
      expect(iframe.contentDocument!.documentElement.outerHTML).toBe(authoredHTML)
    }
  })

  it("applies and reverses motion preferences without changing authored HTML", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const document = iframe.contentDocument!
    const authoredHTML = document.documentElement.outerHTML
    const originalSheets = [...document.adoptedStyleSheets]
    const changeMotion = async (disableAnimations: boolean) => {
      ribbon.dispatchEvent(new CustomEvent("app-settings-change", {
        detail: {...defaultAppSettings(), disableAnimations}, bubbles: true, composed: true,
      }))
      await editor.updateComplete
      await ribbon.updateComplete
    }

    expect(editor.hasAttribute("disable-animations")).toBe(false)
    await changeMotion(true)
    expect(editor.hasAttribute("disable-animations")).toBe(true)
    expect(ribbon.settings.disableAnimations).toBe(true)
    expect(document.adoptedStyleSheets).toHaveLength(originalSheets.length + 1)
    expect(document.adoptedStyleSheets.at(-1)!.cssRules[0].cssText).toContain("--ww-ui-animation: none")
    expect(document.documentElement.outerHTML).toBe(authoredHTML)

    // A repeated frame load must reapply the preference without accumulating sheets.
    iframe.dispatchEvent(new Event("load"))
    expect(document.adoptedStyleSheets).toHaveLength(originalSheets.length + 1)
    await changeMotion(false)
    expect(editor.hasAttribute("disable-animations")).toBe(false)
    expect(document.adoptedStyleSheets).toEqual(originalSheets)
    expect(document.documentElement.outerHTML).toBe(authoredHTML)

    await changeMotion(true)
    editor.remove()
    expect(document.adoptedStyleSheets).toEqual(originalSheets)
  })

  it("restores the saved motion preference before rendering the editing UI", async () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...defaultAppSettings(), disableAnimations: true}))
    const {editor, iframe} = await mountEditor()
    expect(editor.hasAttribute("disable-animations")).toBe(true)
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    expect(ribbon.settings.disableAnimations).toBe(true)
    expect(iframe.contentDocument!.adoptedStyleSheets.at(-1)!.cssRules[0].cssText).toContain("--ww-ui-animation: none")
  })

  it("runs configured shortcuts in the editor frame and suppresses replaced defaults", async () => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const defaults = defaultAppSettings()
    const settings = {
      ...defaults,
      shortcuts: {...defaults.shortcuts, "editor.undo": "Alt+U"},
    }
    editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
      detail: settings,
      bubbles: true,
      composed: true,
    }))

    const configured = new KeyboardEvent("keydown", {
      key: "u", code: "KeyU", altKey: true, bubbles: true, cancelable: true,
    })
    iframe.contentDocument!.dispatchEvent(configured)
    expect(configured.defaultPrevented).toBe(true)
    expect(execute).toHaveBeenCalledWith({type: "undo"})

    execute.mockClear()
    const old = defaults.shortcuts["editor.undo"]
    const replaced = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: old.includes("Meta"),
      ctrlKey: old.includes("Ctrl"),
      bubbles: true,
      cancelable: true,
    })
    iframe.contentDocument!.dispatchEvent(replaced)
    expect(replaced.defaultPrevented).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    ["G", "font-family", "font-combobox", "Font family", "text.fontFamily"],
    ["H", "font-size", "font-size-combobox", "Font size", "text.fontSize"],
  ] as const)("routes the %s font picker shortcut from the editor", async (key, name, tag, label, id) => {
    const {editor, iframe, editorWindow} = await mountEditor()
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: [], styles: {"font-size": "16px"}})
    await editor.updateComplete
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const open = vi.spyOn(ribbon, "openFontPicker").mockResolvedValue(undefined)
    const event = new KeyboardEvent("keydown", {key, code: `Key${key}`, altKey: true, shiftKey: true, cancelable: true})
    iframe.contentDocument!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledExactlyOnceWith(name)
    const picker = ribbon.shadowRoot!.querySelector<RibbonCombobox>(`ribbon-combobox[name="${name}"]`)!
    await picker.updateComplete
    const field = picker.shadowRoot!.querySelector(tag)!
    await field.updateComplete
    expect(field.shadowRoot!.querySelector("input")!.title).toBe(`${label} (${formatShortcut(ribbon.settings.shortcuts[id])})`)
  })

  it("runs formatting shortcuts and lists them in native ribbon tooltips", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: []})
    await editor.updateComplete
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    for(const [id, action, label, key, code] of [
      ["text.clear", "removeMarks", "Remove formatting", "Backspace", "Backspace"],
      ["text.increase", "increaseFontSize", "Increase font size", ">", "Period"],
      ["text.decrease", "decreaseFontSize", "Decrease font size", "<", "Comma"],
    ]) {
      const shortcut = ribbon.settings.shortcuts[id]
      const event = new KeyboardEvent("keydown", {key, code, shiftKey: true, altKey: shortcut.includes("Alt"),
        ctrlKey: shortcut.includes("Ctrl"), metaKey: shortcut.includes("Meta"), cancelable: true})
      iframe.contentDocument!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(execute).toHaveBeenLastCalledWith({type: action})
      const button = ribbon.shadowRoot!.querySelector<RibbonButton>(`ribbon-button[action="${action}"]`)!
      expect(button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.title).toBe(`${label} (${formatShortcut(shortcut)})`)
    }
  })

  it("focuses the AI bar and opens numbered toolboxes with the configured shortcuts", async () => {
    const {editor, iframe} = await mountEditor(editor => Object.assign(editor, {backendState: "connected"}))
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const press = (key: string, code: string, shiftKey = true) => {
      const event = new KeyboardEvent("keydown", {key, code, altKey: true, shiftKey, cancelable: true})
      iframe.contentDocument!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    await ribbon.updateComplete
    press("J", "KeyJ")
    const prompt = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    await vi.waitFor(() => expect(focus.mock.contexts).toContain(prompt))
    expect(prompt.title).toBe(`AI prompt (${formatShortcut(ribbon.settings.shortcuts["editor.focusAI"])})`)

    toolbox.showStyleToolbox = true
    await toolbox.updateComplete
    const oldStyleShortcut = new KeyboardEvent("keydown", {key: "2", code: "Digit2", altKey: true, shiftKey: true, cancelable: true})
    iframe.contentDocument!.dispatchEvent(oldStyleShortcut)
    expect(oldStyleShortcut.defaultPrevented).toBe(false)
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Style"]')!.title).toBe("Style")
    for(const [key, tool] of [["1", "Edit"], ["3", "AI"], ["4", "Review"], ["5", "Distribute"]]) {
      press(key, `Digit${key}`)
      expect(toolbox.activeTool).toBe(tool)
      await toolbox.updateComplete
      const button = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`[data-tool="${tool}"]`)!
      expect(button.title).toContain(formatShortcut(ribbon.settings.shortcuts[`toolbox.${tool.toLowerCase()}`]))
    }

    const settings: AppSettings = {...ribbon.settings, shortcuts: {...ribbon.settings.shortcuts, "toolbox.review": "Alt+9"}}
    ribbon.dispatchEvent(new CustomEvent("app-settings-change", {detail: settings, bubbles: true, composed: true}))
    await editor.updateComplete
    press("9", "Digit9", false)
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Review")
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Review"]')!.title).toBe(`Review (${formatShortcut("Alt+9")})`)

    Object.assign(editor, {previewActive: true})
    await editor.updateComplete
    await toolbox.updateComplete
    press("0", "Digit0")
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Feedback")
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Feedback"]')!.title)
      .toBe(`Feedback (${formatShortcut(settings.shortcuts["toolbox.feedback"])})`)
  })

  it.each(["Ctrl", "Meta"])("preserves native undo in UI fields and widget controls (%s)", async modifier => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.settings = {...host.settings, shortcuts: {...host.settings.shortcuts, "editor.undo": `${modifier}+Z`}}
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    dispatchMarkState(editor, iframe.contentWindow!, {canMark: true, marks: ["a"], attributes: {a: {href: "#intro"}}, link: {
      active: true, identity: "shortcut-link", href: "#intro", attributes: {href: "#intro"}, text: "Intro", targets: [],
    }})
    await editor.updateComplete
    const keyboard = editor.shadowRoot!.querySelector<LinkKeyboard>("dom-editor-link-keyboard")!
    await keyboard.updateComplete
    const fields = [ribbon.shadowRoot!.querySelector(".ai-prompt-input")!, keyboard.shadowRoot!.querySelector("#link-search")!]
    const frameDocument = iframe.contentDocument!
    frameDocument.body.setAttribute("contenteditable", "")
    const widget = frameDocument.createElement("test-widget")
    frameDocument.body.append(widget)
    const root = widget.attachShadow({mode: "open"})
    const input = frameDocument.createElement("input")
    root.append(input)
    fields.push(input)
    const nativeHandler = vi.fn()
    for(const field of fields) {
      expect(field).not.toBeNull()
      field.addEventListener("keydown", nativeHandler)
      const event = new KeyboardEvent("keydown", {key: "z", code: "KeyZ", ctrlKey: modifier === "Ctrl", metaKey: modifier === "Meta",
        bubbles: true, composed: true, cancelable: true})
      field.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(nativeHandler).toHaveBeenCalledTimes(fields.length)
    expect(execute).not.toHaveBeenCalled()

    const event = new KeyboardEvent("keydown", {key: "z", code: "KeyZ", ctrlKey: modifier === "Ctrl", metaKey: modifier === "Meta",
      bubbles: true, cancelable: true})
    frameDocument.querySelector("p")!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(execute).toHaveBeenCalledWith({type: "undo"})
    execute.mockClear()
    const shellEvent = new KeyboardEvent("keydown", {key: "z", code: "KeyZ", ctrlKey: modifier === "Ctrl", metaKey: modifier === "Meta",
      bubbles: true, composed: true, cancelable: true})
    ribbon.dispatchEvent(shellEvent)
    expect(shellEvent.defaultPrevented).toBe(true)
    expect(execute).toHaveBeenCalledWith({type: "undo"})
  })

  it("dispatches insertion shortcuts after loading legacy saved settings", async () => {
    const settings = defaultAppSettings()
    for(const id of Object.keys(settings.shortcuts)) {
      if(id.startsWith("insert.")) settings.shortcuts[id] = ""
    }
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const shortcut = defaultAppSettings().shortcuts["insert.image"]
    const event = new KeyboardEvent("keydown", {
      key: "7", code: "Digit7", metaKey: shortcut.includes("Meta"), ctrlKey: shortcut.includes("Ctrl"),
      bubbles: true, cancelable: true,
    })
    iframe.contentDocument!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(execute).toHaveBeenCalledExactlyOnceWith({type: "insertElement", tag: "picture"})
  })

  it.each([true, false])("dispatches all numbered insertion shortcuts (Apple: %s)", async apple => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
      detail: defaultAppSettings(apple), bubbles: true, composed: true,
    }))
    const commands = [
      {type: "insertElement", tag: "ul"},
      {type: "insertElement", tag: "table"},
      {type: "insertElement", tag: "svg"},
      {type: "insertElement", tag: "iframe"},
      {type: "insertElement", tag: "h1"},
      {type: "insertElement", tag: "details"},
      {type: "insertElement", tag: "picture"},
      {type: "insertElement", tag: "audio"},
      {type: "insertElement", tag: "video"},
      {type: "insertElement", tag: "math"},
    ]
    for(const [index, command] of commands.entries()) {
      execute.mockClear()
      const formula = command.tag === "math"
      const key = formula ? "9" : String(index + 1)
      const event = new KeyboardEvent("keydown", {
        key, code: `Digit${key}`,
        metaKey: !formula && apple,
        ctrlKey: !formula && !apple,
        altKey: formula, shiftKey: formula,
        bubbles: true, cancelable: true,
      })
      iframe.contentDocument!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(execute).toHaveBeenCalledExactlyOnceWith(command)
      await Promise.resolve()
    }
  })

  it("applies document language while retaining the English interface language", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const settings = {...defaultAppSettings(), language: "de"}
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.dispatchEvent(new CustomEvent("app-settings-change", {
      detail: settings,
      bubbles: true,
      composed: true,
    }))

    expect(editor.lang).toBe("en")
    await editor.updateComplete
    expect(ribbon.interfaceLanguage).toBe("en")
    expect(execute).toHaveBeenCalledWith({type: "setDocumentHeadField", field: "language", value: "de"})
  })

  it("routes bridged document-head state and form actions", async () => {
    const {editor, editorWindow} = await mountEditor()
    const nextState = {
      ...emptyDocumentHeadState(),
      title: "Head title",
      generator: WEBWRITER_GENERATOR,
    }
    window.dispatchEvent(new MessageEvent("message", {
      source: editorWindow,
      data: {type: documentHeadStateChangeEvent, detail: nextState},
    }))
    await editor.updateComplete
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    expect(toolbox.documentHead.title).toBe("Head title")

    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    toolbox.dispatchEvent(new CustomEvent("document-head-action", {
      detail: {type: "setDocumentHeadField", field: "title", value: "Changed"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setDocumentHeadField", field: "title", value: "Changed"})
    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(true))
  })

  it.each(["empty", "local"])("automatically logs in when the no-auth backend answers without changing the %s document's storage", async documentKind => {
    const sessionResponse = new Response(JSON.stringify({
      kind: "webwriter-dev-server",
      version: 1,
      authentication: "none",
      user: {id: "local-development", name: "Local developer"},
      apiBaseUrl: "http://localhost:1234/api",
      collaborationUrl: "ws://localhost:1234",
      adminUrl: "http://localhost:1234/admin",
      capabilities: ["documents", "collaboration", "inference", "providers"],
    }), {headers: {"Content-Type": "application/json"}})
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(sessionResponse)
      .mockResolvedValue(new Response(JSON.stringify({providers: [], activeProviderId: null}), {
        headers: {"Content-Type": "application/json"},
      })))
    const {editor} = await mountEditor()
    const host = editor as any
    const login = host.loginToBackend()
    if(documentKind === "local") host.fileHandle = {name: "Linked.html"}
    await login

    await vi.waitFor(() => expect((editor as any).backendState).toBe("connected"))
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete

    expect(host.storageLocation).toBe(documentKind === "local" ? "local" : "development-server")
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".login-button")?.textContent).toContain("Local dev")
    expect(getComputedStyle(ribbon.shadowRoot!.querySelector(".login-button")!).display).toBe("none")
  })

  it("keeps the AI toolbox open when the editor receives a pointer", async () => {
    const {editor, iframe} = await mountEditor(editor => Object.assign(editor, {backendState: "connected"}))
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const expand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!

    expand.click()
    await ribbon.updateComplete
    expect(ribbon.aiChatOpen).toBe(true)

    iframe.contentDocument!.dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true}))
    await ribbon.updateComplete

    expect(ribbon.aiChatOpen).toBe(true)
  })

  it("routes in-document AI review buttons to the ribbon", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const review = vi.spyOn(ribbon, "reviewPendingAIEdit")

    const handled = iframe.contentWindow!.dispatchEvent(new CustomEvent(aiEditReviewEvent, {
      detail: {action: "accept", editId: "edit-inline"},
      bubbles: true,
      composed: true,
      cancelable: true,
    }))

    expect(handled).toBe(false)
    expect(review).toHaveBeenCalledWith("accept", "edit-inline")
  })

  it("restores installed packages and starts the package catalog fetch on mount", async () => {
    localStorage.setItem(INSTALLED_PACKAGES_STORAGE_KEY, JSON.stringify([demoPackage]))
    vi.spyOn(packageDependencies, "resolvePackageDependencies").mockResolvedValue({entries: demoPackage.scripts, map: {}})
    const search = vi.mocked(WebWriterPackageRegistry.prototype.search)
    const editor = new DomEditor()
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector("iframe")!
    const postMessage = wirePackageLoadCompletion(iframe.contentWindow!)
    iframe.dispatchEvent(new Event("load"))

    expect(search).toHaveBeenCalledTimes(1)
    expect((editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages).toEqual([demoPackage])

    // Widget scripts load after their import map is resolved.
    await (editor as any).packageLoadPromise
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: loadWidgetsMessage,
      widgets: [{name: demoPackage.name, version: demoPackage.version}],
      packages: [demoPackage],
      importMap: {},
      requestId: expect.any(String),
    }), window.location.origin)
  })

  it("refreshes restored widget labels before showing them in the package dropdown", async () => {
    const pkg = {...demoPackage, members: [demoPackage.members[1], {
      ...demoPackage.members[0],
      exportName: "./widgets/webwriter-word-puzzle.*",
      tagName: "webwriter-word-puzzle",
      label: "Webwriter Word Puzzle",
      editingConfig: {},
    }]}
    localStorage.setItem(INSTALLED_PACKAGES_STORAGE_KEY, JSON.stringify([pkg]))
    const editor = new DomEditor()
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete

    const installed = (editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages[0]
    expect(installed.members[1]).toEqual({...pkg.members[1], label: "Word Puzzle"})
    expect(installed.members[0]).toEqual(pkg.members[0])
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await button.updateComplete
    expect(button.submenu[0]).toMatchObject({label: "Word Puzzle"})
  })

  it("revalidates the package catalog on every request and coalesces in-flight requests", async () => {
    const editor = new DomEditor()
    const load = (event?: Event) => (editor as unknown as {loadPackageCatalog(event?: Event): Promise<void>}).loadPackageCatalog(event)
    const search = vi.mocked(WebWriterPackageRegistry.prototype.search)
    const dependencies = vi.spyOn(editor as any, "refreshPackageDependencies").mockResolvedValue(undefined)
    const request = () => new Event("package-catalog-request")
    const refresh = () => new CustomEvent("package-catalog-request", {detail: {refresh: true}})
    await load()
    search.mockResolvedValueOnce([demoPackage])
    await load(request())
    expect(search).toHaveBeenCalledTimes(2)
    expect(dependencies).toHaveBeenCalledTimes(1)
    expect((editor as any).packages).toEqual([demoPackage])

    let complete!: (packages: WebWriterPackage[]) => void
    search.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
    const pending = load(refresh())
    await load(request())
    expect(search).toHaveBeenCalledTimes(3)
    const updated = {...demoPackage, version: "2.0.0"}
    complete([updated])
    await pending
    expect((editor as any).packages).toEqual([updated])
    expect(dependencies).toHaveBeenCalledTimes(2)

    search.mockRejectedValueOnce(new Error("Catalog unavailable"))
    await load(request())
    expect((editor as any).packageError).toBe("Catalog unavailable")
    expect((editor as any).packages).toEqual([])
    expect(dependencies).toHaveBeenCalledTimes(2)
  })

  it("refreshes the catalog on request and applies only compatible published updates", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const current = {...demoPackage, version: "1.0.0"}
    const compatible = {...current, version: "1.1.0"}
    const major = {...current, version: "2.0.0"}
    const local: WebWriterPackage = {...current, name: "@webwriter/local", developerSource: {kind: "local", path: "fixtures/local"}}
    const other = {...current, name: "@webwriter/other"}
    host.installedPackages = [current, local, other]
    const search = vi.mocked(WebWriterPackageRegistry.prototype.search)
    search.mockResolvedValue([major, {...local, version: "2.0.0"}, {...other, version: "2.0.0"}])
    const compatibleVersion = vi.mocked(WebWriterPackageRegistry.prototype.latestCompatibleVersion)
    compatibleVersion.mockImplementation(async (name, version) => name === current.name ? compatible.version : version)
    vi.spyOn(host.packageRegistry, "getPackage").mockResolvedValue(compatible)
    const reload = vi.spyOn(host, "reloadEditor").mockImplementation(async next => {host.installedPackages = next})
    host.settings = {...host.settings, autoUpdatePackages: false}
    await host.loadPackageCatalog(new Event("package-catalog-request"))
    expect(host.packages[0]).toBe(major)
    expect(reload).not.toHaveBeenCalled()
    host.settings = {...host.settings, autoUpdatePackages: true}
    await host.loadPackageCatalog(new Event("package-catalog-request"))
    expect(reload).toHaveBeenCalledExactlyOnceWith([compatible, local, other])
    expect(host.packages[0]).toBe(major)
    expect(compatibleVersion).not.toHaveBeenCalledWith(local.name, expect.anything())
  })

  it("confirms a major widget upgrade before replacing the installed package", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const current = {...demoPackage, version: "1.0.0"}
    const update = {...current, version: "2.0.0"}
    host.installedPackages = [current]
    host.packages = [update]
    const getPackage = vi.spyOn(host.packageRegistry, "getPackage").mockResolvedValue(update)
    const reload = vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#package-major-change-dialog")!

    const cancelled = host.updatePublishedPackage(current.name)
    await ribbon.updateComplete
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain("1.0.0 → 2.0.0")
    dialog.querySelector<HTMLButtonElement>("footer button")!.click()
    await cancelled
    expect(getPackage).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()

    const accepted = host.updatePublishedPackage(current.name)
    await ribbon.updateComplete
    expect(dialog.open).toBe(true)
    dialog.querySelector<HTMLButtonElement>("button.primary")!.click()
    await accepted
    expect(reload).toHaveBeenCalledExactlyOnceWith([update])
  })

  it("rolls back a widget update whose runtime fails to load", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const current = {...demoPackage, version: "1.0.0"}
    const update = {...current, version: "1.0.1"}
    host.installedPackages = [current]
    host.packages = [update]
    vi.spyOn(host.packageRegistry, "getPackage").mockResolvedValue(update)
    const reload = vi.spyOn(host, "reloadEditor").mockImplementationOnce(async next => {
      host.installedPackages = next
      throw new Error("Widget failed to load")
    }).mockImplementation(async next => {host.installedPackages = next})

    await host.updatePublishedPackage(current.name)

    expect(reload.mock.calls).toEqual([[[update]], [[current]]])
    expect(host.installedPackages).toEqual([current])
    expect(host.packages).toEqual([update])
    expect(host.packageError).toBe("Widget failed to load")
    expect(host.busyPackageNames).toEqual([])
  })

  it("leaves the current document open when a file's major widget change is declined", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const current = {...demoPackage, version: "1.0.0"}
    const update = {...current, version: "2.1.0"}
    host.installedPackages = [current]
    host.fileName = "Current"
    const html = `<script type="module" src="https://cdn.jsdelivr.net/npm/${current.name}@2.0.0/index.js"></script><p>Incoming</p>`
    const handle = {name: "incoming.html", getFile: async () => new File([html], "incoming.html")}
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
    vi.mocked(WebWriterPackageRegistry.prototype.latestCompatibleVersion).mockResolvedValue(update.version)
    vi.spyOn(host.packageRegistry, "getPackage").mockResolvedValue(update)
    const confirm = vi.spyOn(host, "confirmPackageChanges").mockResolvedValue(false)
    const disconnect = vi.spyOn(host, "clearDocumentCollaboration")
    await host.openDocument()

    expect(confirm).toHaveBeenCalledWith([{name: current.name, from: "1.0.0", to: "2.1.0"}])
    expect(host.installedPackages).toEqual([current])
    expect(host.fileName).toBe("Current")
    expect(disconnect).not.toHaveBeenCalled()
  })

  it.each([
    ["missing", undefined],
    ["deprecated", "Use a supported widget instead."],
  ])("keeps the current document open and warns about a %s widget package", async (status, deprecation) => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.fileName = "Current"
    const release = `@webwriter/${status}@2.0.0`
    const html = `<script type="module" data-webwriter-original-package-entries='["https://cdn.jsdelivr.net/npm/${release}/dist/widget.js"]'></script><p>Incoming</p>`
    const handle = {name: "incoming.html", getFile: async () => new File([html], "incoming.html")}
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
    vi.mocked(WebWriterPackageRegistry.prototype.publishedPackageManifest).mockResolvedValueOnce({
      name: `@webwriter/${status}`, version: "2.0.0", deprecated: deprecation,
    })
    const getPackage = vi.spyOn(host.packageRegistry, "getPackage").mockRejectedValue(new Error("Package metadata failed (404)"))
    const disconnect = vi.spyOn(host, "clearDocumentCollaboration")
    const revision = host.frameRevision

    const opening = host.openDocument()
    const dialog = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!.shadowRoot!
      .querySelector<HTMLDialogElement>("#unsupported-widget-packages-dialog")!
    await vi.waitFor(() => expect(dialog.open).toBe(true))
    expect(dialog.textContent).toContain(release)
    if(deprecation) {
      expect(dialog.textContent).toContain(`is deprecated. ${deprecation}`)
      expect(getPackage).not.toHaveBeenCalled()
    }
    dialog.querySelector<HTMLButtonElement>("footer button")!.click()
    await opening
    expect(dialog.open).toBe(false)
    expect(host.fileError).toBe("")
    expect(host.fileName).toBe("Current")
    expect(host.frameRevision).toBe(revision)
    expect(disconnect).not.toHaveBeenCalled()
  })

  it("reloads the editor only when a catalog dependency check changes the import map", async () => {
    const pkg: WebWriterPackage = {
      ...demoPackage,
      manifest: {name: demoPackage.name, version: demoPackage.version},
    }
    const editor = new DomEditor()
    ;(editor as any).installedPackages = [pkg]
    Object.defineProperty(editor, "isConnected", {configurable: true, get: () => true})
    const reload = vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    const resolve = vi.spyOn(packageDependencies, "resolvePackageDependencies").mockResolvedValue({
      entries: pkg.scripts, map: {imports: {lit: "https://example.test/lit-3.3.2.js"}},
    })
    const refresh = () => (editor as any).refreshPackageDependencies() as Promise<void>
    await refresh()
    expect(reload).toHaveBeenCalledTimes(1)
    await refresh()
    expect(reload).toHaveBeenCalledTimes(1)

    resolve.mockResolvedValueOnce({entries: pkg.scripts, map: {imports: {lit: "https://example.test/lit-3.3.3.js"}}})
    await refresh()
    expect(reload).toHaveBeenCalledTimes(2)
    expect((editor as any).packageImportMap.imports.lit).toBe("https://example.test/lit-3.3.3.js")

    resolve.mockRejectedValueOnce(new Error("Registry unavailable"))
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    await refresh()
    expect(warning).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledTimes(2)
    expect((editor as any).packageImportMap.imports.lit).toBe("https://example.test/lit-3.3.3.js")

    const next = {entries: pkg.scripts, map: {imports: {lit: "https://example.test/lit-3.3.4.js"}}}
    let complete!: (plan: typeof next) => void
    resolve.mockResolvedValue(next).mockImplementationOnce(() => new Promise(done => { complete = done }))
    const priorChecks = resolve.mock.calls.length
    const first = refresh()
    const second = refresh()
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(priorChecks + 1))
    complete(next)
    await Promise.all([first, second])
    expect(resolve).toHaveBeenCalledTimes(priorChecks + 2)
    expect(reload).toHaveBeenCalledTimes(3)
  })

  it("sandboxes the editor iframe while allowing fullscreen and preserving its trusted same-origin bridge", async () => {
    const {editor, iframe} = await mountEditor()
    const srcdoc = (editor as unknown as {readonly editorSrcdoc: string}).editorSrcdoc

    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox")
    expect(iframe.hasAttribute("allowfullscreen")).toBe(true)
    expect(iframe.getAttribute("allow")).toBe("camera; microphone; display-capture")
    expect(srcdoc).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/)
    expect(srcdoc).toMatch(/style-src 'none'/)
    expect(srcdoc).toMatch(/style-src-elem 'nonce-[^']+'/)
    expect(srcdoc).toContain("style-src-attr 'unsafe-inline'")
    expect(srcdoc).toContain("connect-src * data: blob:")
    expect(srcdoc).toContain("frame-src https:")
    expect(srcdoc).toContain("worker-src blob: https:")
    expect(srcdoc).not.toContain("'unsafe-eval'")
    expect(srcdoc).toContain("'wasm-unsafe-eval'")
    expect(srcdoc).toContain('data-ww-theme="base"')
    expect(srcdoc).toContain("Pico CSS ✨ v2.1.1")
  })

  it("adds the default theme to opened documents that do not specify one", () => {
    const editor = new DomEditor()
    ;(editor as any).frameDocumentHTML = "<!doctype html><html><head><title>Lesson</title></head><body></body></html>"

    const srcdoc = (editor as any).editorSrcdoc as string

    expect(srcdoc).toContain('<style data-ww-theme="base" blocking="render">')
    expect(srcdoc.match(/data-ww-theme="base"/g)).toHaveLength(1)
  })

  it("permits installed widget compilers while keeping authored scripts nonce-gated", () => {
    const editor = new DomEditor() as unknown as {installedPackages: WebWriterPackage[], readonly editorSrcdoc: string}
    editor.installedPackages = [demoPackage]
    expect(editor.editorSrcdoc).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic' 'unsafe-eval' 'wasm-unsafe-eval' 'sha256-[^']+';/)
    expect(editor.editorSrcdoc).toContain("style-src-elem * data: blob: 'unsafe-inline'")
    editor.installedPackages = [{...demoPackage, scripts: []}]
    expect(editor.editorSrcdoc).not.toContain("'unsafe-eval'")
  })

  it("preserves an explicitly selected document theme", () => {
    const editor = new DomEditor()
    ;(editor as any).frameDocumentHTML = "<!doctype html><html><head><style data-ww-theme='water'>custom source</style></head><body></body></html>"

    const srcdoc = (editor as any).editorSrcdoc as string

    expect(srcdoc).toContain('data-ww-theme="water"')
    expect(srcdoc).not.toContain('data-ww-theme="base"')
  })

  it("passes the sync URL to the editor through the bridge", async () => {
    const originalUrl = location.href
    history.replaceState({}, "", "/?session=collab-demo&source=local")

    try {
      const editor = new DomEditor()
      Object.assign(editor, {frameStarted: true})
      document.body.append(editor)
      await editor.updateComplete
      const iframe = editor.shadowRoot!.querySelector("iframe")!
      const postMessage = wirePackageLoadCompletion(iframe.contentWindow!)

      iframe.dispatchEvent(new Event("load"))

      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: initializeEditorMessage,
        syncUrl: "ws://localhost:1234/?session=collab-demo&source=local",
        bridgeNonce: expect.any(String),
      }), window.location.origin)
      expect(iframe.getAttribute("srcdoc")).not.toContain("SYNC_URL")
    }
    finally {
      history.replaceState({}, "", originalUrl)
    }
  })

  it("loads the inline scoped registry adapter before widgets", async () => {
    const editor = new DomEditor()
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector("iframe")!
    const postMessage = wirePackageLoadCompletion(iframe.contentWindow!)
    const srcdoc = (editor as unknown as {readonly editorSrcdoc: string}).editorSrcdoc

    iframe.dispatchEvent(new Event("load"))

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: loadWidgetsMessage,
      widgets: [{name: "@webwriter/demo", version: "1.0.0"}],
      packages: [demoPackage],
      requestId: expect.any(String),
    }), window.location.origin))
    const registryAdapter = new DOMParser().parseFromString(srcdoc, "text/html").querySelector<HTMLScriptElement>("#webwriter-scoped-registry")
    expect(registryAdapter?.textContent).toBeTruthy()
    expect(registryAdapter?.hasAttribute("class")).toBe(false)
    expect(registryAdapter?.getAttribute("nonce")).toBeTruthy()
    expect(srcdoc.indexOf("webwriter-scoped-registry")).toBeLessThan(srcdoc.indexOf("editor-entry"))
    expect(srcdoc).not.toContain("Demo Widget")
  })

  it("restores original resource URLs before loading an offline document", () => {
    const editor = new DomEditor()
    ;(editor as any).frameDocumentHTML = '<!DOCTYPE html><html><head><script type="application/json" data-webwriter-original-src="/app.js">inline()</script></head><body><img data-webwriter-original-src="photo.png" src="data:image/png;base64,AQID"></body></html>'

    const srcdoc = (editor as any).editorSrcdoc as string

    expect(srcdoc).toContain('<script type="application/json" src="/app.js"></script>')
    expect(srcdoc).toContain('src="photo.png"')
    expect(srcdoc).not.toContain("data-webwriter-original-src")
    expect(srcdoc).not.toContain("<head>null")
  })

  it("persists package additions and removals", async () => {
    const {editor} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue({update: []})
    vi.spyOn((editor as any).packageRegistry, "getPackage").mockResolvedValue(demoPackage)

    const adding = (editor as any).setPackageInstalled(demoPackage, true) as Promise<unknown>
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe")?.getAttribute("srcdoc")).toContain("<!-- frame 1 -->"))
    const addedFrame = editor.shadowRoot!.querySelector("iframe")!
    addedFrame.dispatchEvent(new Event("load"))
    completePendingPackageLoad(editor)
    await adding

    expect(JSON.parse(localStorage.getItem(INSTALLED_PACKAGES_STORAGE_KEY)!)).toEqual([demoPackage])

    const removing = (editor as any).setPackageInstalled(demoPackage, false) as Promise<unknown>
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe")?.getAttribute("srcdoc")).toContain("<!-- frame 2 -->"))
    const removedFrame = editor.shadowRoot!.querySelector("iframe")!
    removedFrame.dispatchEvent(new Event("load"))
    completePendingPackageLoad(editor)
    await removing

    expect(JSON.parse(localStorage.getItem(INSTALLED_PACKAGES_STORAGE_KEY)!)).toEqual([])
  })
})

describe("DomEditor ribbon drag relay", () => {
  function dragEvent(type: string, data: DataTransfer, extra: Record<string, unknown> = {}) {
    const event = new Event(type, {bubbles: true, cancelable: true, composed: true})
    Object.assign(event, {dataTransfer: data, clientX: 0, clientY: 0, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...extra})
    return event
  }

  async function startDrag(editor: DomEditor, types: Record<string, string>) {
    const data = new DataTransfer()
    Object.entries(types).forEach(([type, value]) => data.setData(type, value))
    const source = document.createElement("button")
    editor.shadowRoot!.append(source)
    source.dispatchEvent(dragEvent("dragstart", data))
    await editor.updateComplete
    return data
  }

  it("activates only a quick drop on the original ribbon drag source", async () => {
    const {editor} = await mountEditor()
    const source = document.createElement("button")
    source.draggable = true
    const child = document.createElement("span")
    source.append(child)
    const other = document.createElement("button")
    editor.shadowRoot!.append(source, other)
    const clicked = vi.fn()
    source.addEventListener("click", clicked)
    const data = new DataTransfer()
    data.setData(ribbonInsertionDragType, "element:p")
    const now = vi.spyOn(performance, "now").mockReturnValue(1000)
    const start = () => source.dispatchEvent(dragEvent("dragstart", data))

    start()
    const over = dragEvent("dragover", data)
    child.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    const otherDrop = dragEvent("drop", data)
    other.dispatchEvent(otherDrop)
    expect(otherDrop.defaultPrevented).toBe(false)
    expect(clicked).not.toHaveBeenCalled()
    now.mockReturnValue(1249)
    const drop = dragEvent("drop", data)
    child.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(clicked).toHaveBeenCalledTimes(1)
    source.dispatchEvent(dragEvent("dragend", data))
    child.dispatchEvent(dragEvent("drop", data))
    expect(clicked).toHaveBeenCalledTimes(1)

    now.mockReturnValue(2000)
    start()
    now.mockReturnValue(2250)
    const lateDrop = dragEvent("drop", data)
    source.dispatchEvent(lateDrop)
    expect(lateDrop.defaultPrevented).toBe(false)
    expect(clicked).toHaveBeenCalledTimes(1)
    source.dispatchEvent(dragEvent("dragend", data))
    now.mockRestore()
  })

  it("relays shape keyboard payloads into the graphic frame", async () => {
    const {graphicShapeDragType} = await import("../graphic")
    const {editor, iframe} = await mountEditor()
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 300, 200))
    const post = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined)
    const payload = JSON.stringify({shape: "ellipse", paint: {fill: "red"}})
    const data = await startDrag(editor, {[graphicShapeDragType]: payload})
    const shield = editor.shadowRoot!.querySelector(".ribbon-drag-shield")!
    expect(shield).toBeTruthy()
    shield.dispatchEvent(dragEvent("drop", data, {clientX: 60, clientY: 70}))
    expect(post.mock.calls.map(([message]) => message)).toContainEqual(expect.objectContaining({
      type: editorFrameControlMessage, command: "drag", event: "drop", x: 50, y: 50,
      data: {[graphicShapeDragType]: payload},
    }))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".ribbon-drag-shield")).toBeNull()
  })

  it("relays ribbon drags over the cross-site editor frame and removes the shield afterwards", async () => {
    const {editor, iframe} = await mountEditor()
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 300, 200))
    const post = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined)
    const relayed = () => post.mock.calls.map(([message]) => message as Record<string, unknown>)
      .filter(message => message.type === editorFrameControlMessage && message.command === "drag")
    const data = await startDrag(editor, {[elementDragType]: "h2", [`${elementDragType}-h2`]: "h2", "text/html": "<h2></h2>"})
    const shield = editor.shadowRoot!.querySelector(".ribbon-drag-shield")!
    expect(shield).toBeTruthy()

    const over = dragEvent("dragover", data, {clientX: 60, clientY: 70, altKey: true})
    shield.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(data.dropEffect).toBe("copy")
    expect(relayed().at(-1)).toMatchObject({event: "dragover", x: 50, y: 50, altKey: true,
      data: {[elementDragType]: "h2", [`${elementDragType}-h2`]: "h2", "text/html": "<h2></h2>"}})
    // Points over the stage but outside the frame clear the frame's drop caret.
    shield.dispatchEvent(dragEvent("dragover", data, {clientX: 5, clientY: 70}))
    expect(data.dropEffect).toBe("none")
    expect(relayed().at(-1)).toMatchObject({event: "dragleave"})
    shield.dispatchEvent(dragEvent("dragleave", data))
    expect(relayed().at(-1)).toMatchObject({event: "dragleave"})

    const drop = dragEvent("drop", data, {clientX: 110, clientY: 120})
    shield.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(relayed().at(-1)).toMatchObject({event: "drop", x: 100, y: 100})
    const count = relayed().length
    editor.shadowRoot!.dispatchEvent(new Event("dragend", {bubbles: true, composed: true}))
    await editor.updateComplete
    expect(relayed()).toHaveLength(count)
    expect(editor.shadowRoot!.querySelector(".ribbon-drag-shield")).toBeNull()
  })

  it("relays a compact element button through the same frame shield as a widget", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[slot="compact"][label="Text"]')!
    await button.updateComplete
    const source = button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    const data = new DataTransfer()
    vi.spyOn(data, "setDragImage").mockImplementation(() => {})
    source.dispatchEvent(dragEvent("dragstart", data))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".ribbon-drag-shield")).not.toBeNull()
    vi.spyOn(iframe, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 300, 200))
    const post = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined)
    editor.shadowRoot!.querySelector(".ribbon-drag-shield")!
      .dispatchEvent(dragEvent("drop", data, {clientX: 60, clientY: 70}))
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
      type: editorFrameControlMessage, command: "drag", event: "drop", x: 50, y: 50,
      data: expect.objectContaining({[ribbonInsertionDragType]: "element:p"}),
    }), expect.anything())
  })

  it("clears the frame's drop caret when a ribbon drag is cancelled", async () => {
    const {editor, iframe} = await mountEditor()
    const post = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined)
    await startDrag(editor, {[elementDragType]: "h2", [`${elementDragType}-h2`]: "h2"})
    expect(editor.shadowRoot!.querySelector(".ribbon-drag-shield")).toBeTruthy()
    editor.shadowRoot!.dispatchEvent(new Event("dragend", {bubbles: true, composed: true}))
    await editor.updateComplete
    expect(post).toHaveBeenCalledWith(expect.objectContaining({type: editorFrameControlMessage, command: "drag", event: "dragleave"}), expect.anything())
    expect(editor.shadowRoot!.querySelector(".ribbon-drag-shield")).toBeNull()
  })

  it("leaves other drags to the browser", async () => {
    const {editor} = await mountEditor()
    await startDrag(editor, {"text/plain": "text"})
    expect(editor.shadowRoot!.querySelector(".ribbon-drag-shield")).toBeNull()
  })
})

describe("DomEditor breadcrumb visibility", () => {
  it.each(["checks", "versions", "math", "shape", "link"])("collapses the docked toolbox while %s is open and restores it on close", async surface => {
    const {editor} = await mountEditor()
    const host = editor as any
    vi.spyOn(editor, "execute").mockResolvedValue(emptyVersionHistoryState())
    vi.spyOn(host, "focusEditor").mockImplementation(() => {})
    host.narrowLayout = true
    if(surface === "checks") host.localPackages = [demoPackage]
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool(surface === "versions" || surface === "checks" ? "Review" : "Edit")
    await editor.updateComplete
    await toolbox.updateComplete
    if(surface === "checks" || surface === "versions") {
      if(surface === "checks") toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Checks & Tests"]')!.click()
      else toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".versions-console-toggle")!.click()
    }
    else if(surface === "math") host.mathSelection = {active: true, display: "inline"}
    else if(surface === "shape") host.graphicSelection = {active: true, capture: true}
    else host.linkSelection = {active: true, identity: "link-1", href: "https://example.com", text: "Example",
      attributes: {href: "https://example.com"}, targets: [], references: []}
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(true)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(true)
    expect(toolbox.activeTool).toBe(surface === "versions" || surface === "checks" ? "Review" : "Edit")
    if(surface === "checks" || surface === "versions") {
      expect(editor.shadowRoot!.querySelector<HTMLElement>(".bottom-detail-panel")!.inert).toBe(false)
      expect(host[surface === "checks" ? "checksOpen" : "reviewOpen"]).toBe(true)
    }
    else {
      const keyboard = editor.shadowRoot!.querySelector(`dom-editor-${surface}-keyboard`)!
      keyboard.dispatchEvent(new CustomEvent(`${surface}-keyboard-close`))
      await editor.updateComplete
      await toolbox.updateComplete
      expect(toolbox.collapsed).toBe(false)
      editor.shadowRoot!.querySelector<HTMLButtonElement>(".math-keyboard-open")!.click()
      await editor.updateComplete
      await toolbox.updateComplete
      expect(toolbox.collapsed).toBe(true)
    }
    // A tab remains usable even when it is the remembered current tool.
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`[data-tool="${toolbox.activeTool}"]`)!.click()
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(false)
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(false)
  })

  it("keeps wide toolboxes expanded and preserves pending HTML when the container narrows", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    Object.assign(editor, {htmlMode: true, htmlPending: true, htmlSource: "<p>Draft</p>"})
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(false)
    host.narrowLayout = true
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(true)
    expect(host.htmlPending).toBe(true)
    expect(host.htmlSource).toBe("<p>Draft</p>")
    expect(host.htmlMode).toBe(true)
    host.narrowLayout = false
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(false)
    expect(toolbox.activeTool).toBe("Edit")
  })

  it("keeps a version preview while collapsed and clears it when its tab replaces Versions", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const clearPreview = vi.spyOn(host, "clearHistoryPreview").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Review")
    const preview = {checkpointId: "old", added: 1, removed: 0, modified: 0, isCurrent: false}
    Object.assign(editor, {reviewOpen: true, historyState: {...emptyVersionHistoryState(), preview}, narrowLayout: true})
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(true)
    expect(host.historyState.preview).toBe(preview)
    expect(clearPreview).not.toHaveBeenCalled()
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Review"]')!.click()
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(false)
    expect(host.reviewOpen).toBe(false)
    expect(clearPreview).toHaveBeenCalledOnce()
  })

  it("hides the breadcrumb and toolbox when collapsed and restores them when the ribbon expands", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const breadcrumb = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-breadcrumb")!
    const toolbox = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-toolbox")!

    expect(breadcrumb.hidden).toBe(false)
    expect(toolbox.hidden).toBe(false)

    ribbon.expanded = false
    await ribbon.updateComplete
    await editor.updateComplete
    await ribbon.updateComplete
    expect(breadcrumb.hidden).toBe(true)
    expect(getComputedStyle(breadcrumb).display).toBe("none")
    expect(toolbox.hidden).toBe(true)
    expect(ribbon.breadcrumbVisible).toBe(false)

    const fileMenu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await fileMenu.updateComplete
    expect(fileMenu.shadowRoot!.querySelector('[title="Show breadcrumb"]')).toBeNull()
    expect(fileMenu.shadowRoot!.querySelector('[title="Hide breadcrumb"]')).toBeNull()

    ribbon.expanded = true
    await ribbon.updateComplete
    await editor.updateComplete
    expect(breadcrumb.hidden).toBe(false)
    expect(toolbox.hidden).toBe(false)
    await ribbon.updateComplete
    await fileMenu.updateComplete
    expect(fileMenu.shadowRoot!.querySelector('[title="Hide breadcrumb"]')).toBeNull()
  })

  it.each([true, false])("applies the short viewport collapse only to fine pointers (coarse: %s)", async coarse => {
    vi.stubGlobal("innerHeight", 800)
    const matchMedia = window.matchMedia.bind(window)
    const pointer = new EventTarget()
    vi.spyOn(window, "matchMedia").mockImplementation(query => query === "(pointer: coarse)"
      ? Object.assign(pointer, {matches: coarse, media: query}) as MediaQueryList : matchMedia(query))
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const breadcrumb = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-breadcrumb")!
    expect(ribbon.expanded).toBe(true)

    vi.stubGlobal("innerHeight", 450)
    window.dispatchEvent(new Event("resize"))
    await ribbon.updateComplete
    await editor.updateComplete
    expect(ribbon.expanded).toBe(coarse)
    expect(breadcrumb.hidden).toBe(!coarse)

    vi.stubGlobal("innerHeight", 800)
    window.dispatchEvent(new Event("resize"))
    await ribbon.updateComplete
    await editor.updateComplete
    expect(ribbon.expanded).toBe(true)
    expect(breadcrumb.hidden).toBe(false)
  })
})

async function widgetSearch(editor: DomEditor, expanded = true) {
  await editor.updateComplete
  const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
  ribbon.expanded = expanded
  if(!expanded) ribbon.menuOpen = true
  await ribbon.updateComplete
  let search = ribbon.shadowRoot!.querySelector("package-search")
  if(!expanded) {
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("#ribbon-file-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Packages"]')!.click()
    await menu.updateComplete
    search = menu.shadowRoot!.querySelector("package-search")
  }
  expect(search).not.toBeNull()
  await search!.updateComplete
  return search!
}

describe("Develop local packages", () => {
  it("removes a local package through the Widgets ribbon and stops watching its folder", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const local = {...demoPackage, developerSource: {kind: "local", path: "demo-folder"}}
    const other = {...demoPackage, name: "@local/other", label: "Other"}
    const dispose = vi.fn()
    host.localPackageManager.records.set("local-id", {id: "local-id", directory: {}, package: local, enabled: true, revision: 0, warnings: [], monitor: {dispose}})
    host.localPackageManager.records.set("other-id", {id: "other-id", directory: {}, package: other, enabled: false, revision: 0, warnings: []})
    host.localPackages = [local, other]
    host.selectedLocalPackageName = local.name
    host.installedPackages = [local, other]
    host.localPackageRuntimeWarnings = {[local.name]: [{message: "Old warning"}], [other.name]: []}
    host.localPackageTestResults = {[`${local.name}/test`]: "running", [`${other.name}/test`]: "running"}
    const unregister = vi.spyOn(LocalPackageWorkerClient.prototype, "unregister").mockResolvedValue(undefined)
    const reload = vi.spyOn(host, "reloadEditor").mockImplementation(async (packages: any) => { host.installedPackages = packages })
    await editor.updateComplete
    editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: `package-toggle:${local.name}`}, bubbles: true, composed: true,
    }))
    await vi.waitFor(() => expect(host.localPackages).toEqual([other]))
    await vi.waitFor(() => expect(host.localPackagesLoading).toBe(false))
    expect(reload).toHaveBeenCalledWith([other])
    expect(host.installedPackages).toEqual([other])
    expect(host.localPackageManager.records.has("local-id")).toBe(false)
    expect(unregister).toHaveBeenCalledWith("local-id")
    expect(dispose).toHaveBeenCalledOnce()
    expect(host.selectedLocalPackageName).toBe(other.name)
    expect(host.localPackageRuntimeWarnings).toEqual({[other.name]: []})
    expect(host.localPackageTestResults).toEqual({[`${other.name}/test`]: "running"})
    await host.removeDeveloperPackage(other.name)
    expect(host.selectedLocalPackageName).toBe("")
    expect(host.localPackages).toEqual([])
  })

  it("keeps the local source if disabling its installed package fails", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const record = {id: "local-id", directory: {}, package: demoPackage, enabled: true, revision: 0, warnings: []}
    host.localPackageManager.records.set(record.id, record)
    host.localPackages = [demoPackage]
    host.installedPackages = [demoPackage]
    vi.spyOn(host, "reloadEditor").mockRejectedValue(new Error("Reload failed"))
    const unregister = vi.spyOn(LocalPackageWorkerClient.prototype, "unregister")
    await host.removeDeveloperPackage(demoPackage.name)
    expect(host.localPackageManager.records.get(record.id)).toBe(record)
    expect(record.enabled).toBe(true)
    expect(unregister).not.toHaveBeenCalled()
    expect(host.localPackagesLoading).toBe(false)
    expect(host.localPackageError).toBe("Reload failed")
  })

  it("retains developer sources but only shows installed packages in the ribbon", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const local = {...demoPackage, developerSource: {kind: "local", path: "demo-folder"}, members: []}
    host.localPackages = [local]
    host.packages = [{...demoPackage, name: "@webwriter/published", label: "Published"}]
    await editor.updateComplete
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    expect(ribbon.localPackages).toEqual([local])
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button'))
      .filter(button => button.action.startsWith("package:")).map(button => button.label)).toEqual(["Published"])
    host.installedPackages = [local]
    await editor.updateComplete
    await ribbon.updateComplete
    const buttons = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button'))
      .filter(button => button.action.startsWith("package:"))
    expect(buttons.map(button => button.label)).toEqual(["Demo", "Published"])
    expect(buttons[0].hasAttribute("developer-package")).toBe(true)
    expect(buttons[0].hasAttribute("active")).toBe(true)
  })

  it.each([
    {enabled: true, storage: "development-server", id: "saved", refreshing: true, busy: false, saves: true},
    {enabled: false, storage: "development-server", id: "saved", refreshing: true, busy: false, saves: false},
    {enabled: true, storage: "local", id: "saved", refreshing: true, busy: false, saves: false},
    {enabled: true, storage: "development-server", id: null, refreshing: true, busy: false, saves: false},
    {enabled: true, storage: "development-server", id: "saved", refreshing: false, busy: false, saves: false},
    {enabled: true, storage: "development-server", id: "saved", refreshing: true, busy: true, saves: false},
  ])("autosaves cloud documents after package bundle reloads only when eligible: %j", async scenario => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...host.settings, autosaveCloudOnBundleChange: scenario.enabled}
    host.storageLocation = scenario.storage
    host.backendDocumentId = scenario.id
    host.fileOperationActive = scenario.busy
    host.fileName = "Lesson"
    host.fileFormat = "html"
    host.fileDirty = true
    const updateDocument = vi.fn().mockResolvedValue({id: "saved", title: "Lesson", format: "html", createdAt: "", updatedAt: ""})
    const createDocument = vi.fn()
    host.backendClient = {updateDocument, createDocument}
    const reload = vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    const execute = mockSaveSnapshot(editor, "<html><body>Updated bundle</body></html>")
    await host.localPackageManager.options.install(demoPackage, scenario.refreshing ? demoPackage.name : undefined)
    expect(reload).toHaveBeenCalledOnce()
    expect(createDocument).not.toHaveBeenCalled()
    if(scenario.saves) {
      expect(execute).toHaveBeenCalledWith({type: "prepareVersionSave", offline: false})
      expect(updateDocument).toHaveBeenCalledWith("saved", {title: "Lesson", content: "<html><body>Updated bundle</body></html>", format: "html"})
      expect(host.fileDirty).toBe(false)
    }
    else expect(updateDocument).not.toHaveBeenCalled()
  })

  it("coalesces bundle autosaves while another file operation is running", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...host.settings, autosaveCloudOnBundleChange: true}
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    host.backendDocumentId = "saved"
    const updateDocument = vi.fn().mockResolvedValue({id: "saved", title: "Lesson", format: "html", createdAt: "", updatedAt: ""})
    host.backendClient = {updateDocument}
    vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    mockSaveSnapshot(editor, "<html><body>Latest bundle</body></html>")
    let complete!: () => void
    const operation = host.runFileOperation(() => new Promise<void>(resolve => {complete = resolve}))
    await host.localPackageManager.options.install(demoPackage, demoPackage.name)
    await host.localPackageManager.options.install(demoPackage, demoPackage.name)
    expect(updateDocument).not.toHaveBeenCalled()
    complete()
    await operation
    expect(updateDocument).toHaveBeenCalledOnce()
    expect(host.fileOperationActive).toBe(false)
  })

  it("does not autosave a different cloud document when it changes during serialization", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...host.settings, autosaveCloudOnBundleChange: true}
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    host.backendDocumentId = "original"
    const updateDocument = vi.fn()
    host.backendClient = {updateDocument}
    vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    let serialize!: (source: string) => void
    const execute = vi.spyOn(editor, "execute").mockReturnValue(new Promise(resolve => {serialize = resolve}))
    const installation = host.localPackageManager.options.install(demoPackage, demoPackage.name)
    await vi.waitFor(() => expect(execute).toHaveBeenCalled())
    host.backendDocumentId = "replacement"
    serialize("<html><body>Original</body></html>")
    await installation
    expect(updateDocument).not.toHaveBeenCalled()
    expect(host.backendDocumentId).toBe("replacement")
  })

  it("proxies only registered local package resources from the isolated frame", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const frameOrigin = host.frameShellURL("editor", 0).split("/frame-shell.html")[0]
    const id = "test-package"
    const url = `${frameOrigin}/__webwriter/local-packages/${id}/widget.js`
    const send = async () => {
      const channel = new MessageChannel()
      const result = new Promise<any>(resolve => { channel.port1.onmessage = event => {
        channel.port1.close()
        channel.port2.close()
        resolve(event.data)
      } })
      host.handleEditorMessage(new MessageEvent("message", {source: iframe.contentWindow, origin: frameOrigin,
        data: {type: "frame-local-package-request", bridgeNonce: host.bridgeNonce, url, method: "GET"},
        ports: [channel.port2]}))
      return result
    }
    expect((await send()).status).toBe(404)
    host.localPackageManager.records.set(id, {id})
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("export {}", {
      headers: {"Content-Type": "application/javascript"},
    }))
    const response = await send()
    expect(response.status).toBe(200)
    expect(new TextDecoder().decode(response.body)).toBe("export {}")
    expect(fetch).toHaveBeenCalledWith(new URL(url.replace(frameOrigin, location.origin)).href, {method: "GET"})
    host.localPackageManager.records.delete(id)
  })

  it("picks, serves, watches, and enables a built local package", async () => {
    const directory = localPackageDirectory()
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(directory))
    const start = vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const register = vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    const reload = vi.spyOn(editor as any, "reloadEditor").mockImplementation(async (...args: unknown[]) => {
      ;(editor as any).installedPackages = args[0] as WebWriterPackage[]
    })

    const search = await widgetSearch(editor)
    search.shadowRoot!.querySelectorAll<HTMLButtonElement>(".local-package-actions button")[0].click()
    await vi.waitFor(() => expect((editor as any).localPackagesLoading).toBe(false))

    expect(start).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(expect.any(String), directory)
    const packages = (editor as any).localPackages as WebWriterPackage[]
    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({name: "@local/demo", version: "0.1.0"})
    expect(packages[0].scripts[0]).toContain("/__webwriter/local-packages/")
    expect(packages[0].scripts[0]).toContain("revision=0")
    expect(reload).toHaveBeenCalledWith([packages[0]])
    expect((editor as any).localPackageError).toBe("")
    expect((editor as any).selectedLocalPackageName).toBe("@local/demo")

    await editor.updateComplete
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Checks & Tests"]')!.click()
    await editor.updateComplete
    const console = editor.shadowRoot!.querySelector("bottom-detail-panel")!
    await console.updateComplete
    expect(console.localPackages).toEqual(packages)
    expect(console.shadowRoot!.querySelector('.local-packages-drawer')).not.toBeNull()
  })

  it.each([true, false])("adds sibling local packages through widget search with ribbon expanded=%s", async expanded => {
    const alpha = Object.assign(localPackageDirectory(true, "@local/alpha"), {name: "alpha"})
    const broken = Object.assign(localPackageDirectory(), {name: "broken"})
    const demo = localPackageDirectory()
    const unrelated = {kind: "directory", name: "notes", getFileHandle: vi.fn().mockRejectedValue(new DOMException("", "NotFoundError"))}
    const dependency = {kind: "directory", name: "node_modules", getFileHandle: vi.fn()}
    const parent = {
      name: "packages",
      async *values() {yield* [demo, unrelated, broken, {kind: "file", name: "package.json"}, dependency, alpha]},
    }
    const picker = vi.fn().mockResolvedValue(parent)
    vi.stubGlobal("showDirectoryPicker", picker)
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const register = vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockImplementation(async (_id, directory) => {
      if(directory === broken) throw new Error("Folder registration failed")
    })
    const {editor} = await mountEditor()
    const host = editor as any
    const reload = vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    const search = await widgetSearch(editor, expanded)
    search.shadowRoot!.querySelectorAll<HTMLButtonElement>(".local-package-actions button")[1].click()

    expect(picker).toHaveBeenCalledExactlyOnceWith({id: "webwriter-develop-package-parent", mode: "readwrite"})
    expect(host.localPackagesLoading).toBe(true)
    await vi.waitFor(() => expect(host.localPackagesLoading).toBe(false))
    expect(register.mock.calls.map(([, directory]) => directory)).toEqual([alpha, broken, demo])
    expect(dependency.getFileHandle).not.toHaveBeenCalled()
    expect(host.localPackages.map((pkg: WebWriterPackage) => pkg.name)).toEqual(["@local/alpha", "@local/demo"])
    expect(reload).toHaveBeenCalledExactlyOnceWith(host.localPackages)
    expect(host.localPackageError).toBe("broken: Folder registration failed")
  })

  it("reports when a parent folder has no packages and ignores picker cancellation", async () => {
    const picker = vi.fn()
      .mockResolvedValueOnce({name: "empty", values: async function* () {}})
      .mockRejectedValueOnce(new DOMException("", "AbortError"))
    vi.stubGlobal("showDirectoryPicker", picker)
    const {editor} = await mountEditor()
    const host = editor as any

    await host.addLocalPackage(true)
    expect(host.localPackageError).toContain("No package folders found directly inside 'empty'")
    expect(host.localPackages).toEqual([])
    expect(host.localPackagesLoading).toBe(false)

    await host.addLocalPackage(true)
    expect(host.localPackageError).toBe("")
    expect(host.localPackagesLoading).toBe(false)
  })

  it("selects a local package without inserting it", async() => {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(localPackageDirectory()))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()
    const insert = vi.spyOn(editor as any, "installAndInsertPackage").mockResolvedValue(undefined)

    ;(editor as any).handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {
      detail: {label: "local-package-select:@local/demo"},
    }))

    expect((editor as any).selectedLocalPackageName).toBe("@local/demo")
    expect(insert).not.toHaveBeenCalled()
  })

  it("honors the global package auto-reload setting", async() => {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(localPackageDirectory()))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    const reload = vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)
    await (editor as any).addLocalPackage()
    reload.mockClear()

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const setAutoReload = (autoReloadPackages: boolean) => ribbon.dispatchEvent(new CustomEvent("app-settings-change", {
      detail: {...(editor as any).settings, autoReloadPackages},
    }))
    setAutoReload(false)
    await (editor as any).localPackageManager.refresh([...(editor as any).localPackageManager.records.keys()][0])

    expect((editor as any).settings.autoReloadPackages).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    setAutoReload(true)
    await (editor as any).localPackageManager.refresh([...(editor as any).localPackageManager.records.keys()][0])
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("uses the Search widgets refresh to reload local packages even with auto-reload off", async () => {
    const directory = Object.assign(localPackageDirectory(), {requestPermission: vi.fn(async () => "granted")})
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(directory))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    const host = editor as any
    const reload = vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    await host.addLocalPackage()
    reload.mockClear()
    host.localPackageManager.autoReload = false
    await vi.waitFor(() => expect(host.packagesLoading).toBe(false))
    const catalog = vi.spyOn(host.packageRegistry, "search").mockResolvedValue([])
    const search = await widgetSearch(editor)
    search.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Refresh list"]')!.click()
    expect(directory.requestPermission).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(host.localPackagesLoading).toBe(false))
    expect(reload).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({
      scripts: [expect.stringContaining("revision=1")],
    })])
    expect(catalog).toHaveBeenCalled()
  })

  it("restores persisted directory handles and reloads their packages", async() => {
    const queryPermission = vi.fn().mockResolvedValue("granted")
    const requestPermission = vi.fn().mockResolvedValue("granted")
    const directory = Object.assign(localPackageDirectory(), {queryPermission, requestPermission})
    vi.spyOn(LocalPackageWorkerClient.prototype, "storedDirectories").mockResolvedValue([{id: "persisted", handle: directory as any}])
    const start = vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const editor = new DomEditor()
    const watch = vi.spyOn((editor as any).localPackageManager, "watch").mockResolvedValue(undefined)
    const reload = vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)

    await (editor as any).restoreLocalPackages()

    expect(start).toHaveBeenCalledTimes(1)
    expect(watch).toHaveBeenCalledTimes(1)
    expect((editor as any).localPackages).toHaveLength(1)
    expect((editor as any).selectedLocalPackageName).toBe("@local/demo")
    expect(reload).toHaveBeenCalledWith([expect.objectContaining({name: "@local/demo"})])
    expect(queryPermission).toHaveBeenCalledWith({mode: "read"})
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it("keeps inaccessible restored folders visible with a recovery error", async() => {
    const directory = {
      name: "private-package",
      kind: "directory",
      getFileHandle: async() => { throw Object.assign(new Error("Denied"), {name: "NotAllowedError"}) },
      getDirectoryHandle: async() => { throw Object.assign(new Error("Denied"), {name: "NotAllowedError"}) },
    } as unknown as FileSystemDirectoryHandle
    vi.spyOn(LocalPackageWorkerClient.prototype, "storedDirectories").mockResolvedValue([{id: "private", handle: directory as any}])
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const editor = new DomEditor()
    vi.spyOn((editor as any).localPackageManager, "watch").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)

    await (editor as any).restoreLocalPackages()

    expect((editor as any).localPackages[0].label).toBe("private-package")
    expect((editor as any).selectedLocalPackageName).toBe("@local/private-package")
    expect((editor as any).localPackageError).toContain("Click Refresh")
  })

  it("keeps a restored folder visible without prompting when permission needs renewal", async() => {
    const directory = Object.assign(localPackageDirectory(), {
      queryPermission: vi.fn().mockResolvedValue("prompt"),
      requestPermission: vi.fn().mockResolvedValue("denied"),
    })
    const getFileHandle = vi.spyOn(directory, "getFileHandle")
    vi.spyOn(LocalPackageWorkerClient.prototype, "storedDirectories").mockResolvedValue([{id: "private", handle: directory as any}])
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    const editor = new DomEditor()
    vi.spyOn((editor as any).localPackageManager, "watch").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)

    await (editor as any).restoreLocalPackages()

    expect(getFileHandle).not.toHaveBeenCalled()
    expect(directory.requestPermission).not.toHaveBeenCalled()
    expect((editor as any).localPackages[0].label).toBe("demo-package")
    expect((editor as any).localPackageError).toContain("Click Refresh")
  })

  it("keeps a package without a bundle visible and ready for its first build", async () => {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(localPackageDirectory(false)))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    const reload = vi.spyOn(editor as any, "reloadEditor").mockResolvedValue(undefined)

    await (editor as any).addLocalPackage()

    expect((editor as any).localPackages).toHaveLength(1)
    expect((editor as any).localPackages[0].members).toEqual([])
    expect((editor as any).localPackageError).toContain("has no bundle yet")
    expect(reload).not.toHaveBeenCalled()
  })

  it("automatically enables the package when its first bundle appears", async () => {
    const bundle = {current: false}
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(localPackageDirectory(bundle)))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()
    const reload = vi.spyOn(editor as any, "reloadEditor").mockImplementation(async (...args: unknown[]) => {
      ;(editor as any).installedPackages = args[0] as WebWriterPackage[]
    })
    await (editor as any).addLocalPackage()
    const record = [...(editor as any).localPackageManager.records.values()][0] as any

    bundle.current = true
    record.monitor.options.onChange()

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    const pkg = (editor as any).localPackages[0] as WebWriterPackage
    expect(pkg.members).toHaveLength(1)
    expect(pkg.scripts[0]).toContain("revision=1")
    expect((editor as any).localPackageError).toBe("")
  })

  it("queues another refresh when the package changes during a reload", async () => {
    const {editor} = await mountEditor()
    let finishFirst!: () => void
    const firstRefresh = new Promise<void>(resolve => { finishFirst = resolve })
    const manager = (editor as any).localPackageManager
    manager.records.set("local-id", {id: "local-id", package: demoPackage, directory: {}, revision: 0, warnings: [], enabled: true})
    const perform = vi.spyOn(manager, "performRefresh")
      .mockImplementationOnce(() => firstRefresh)
      .mockResolvedValue(undefined)

    const refreshing = manager.refresh("local-id") as Promise<void>
    await vi.waitFor(() => expect(perform).toHaveBeenCalledTimes(1))
    const queued = manager.refresh("local-id") as Promise<void>
    finishFirst()
    await Promise.all([refreshing, queued])

    expect(perform).toHaveBeenCalledTimes(2)
  })

  it("treats a cancelled folder picker as a no-op", async () => {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")))
    const {editor} = await mountEditor()

    await (editor as any).addLocalPackage()

    expect((editor as any).localPackages).toEqual([])
    expect((editor as any).localPackageError).toBe("")
  })

  it("reports unsupported folder access and worker registration failures", async () => {
    vi.stubGlobal("showDirectoryPicker", undefined)
    const {editor} = await mountEditor()
    await (editor as any).addLocalPackage()
    expect((editor as any).localPackageError).toContain("cannot open local package folders")

    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(localPackageDirectory()))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockRejectedValue(new Error("Worker registration failed"))
    await (editor as any).addLocalPackage()
    expect((editor as any).localPackageError).toBe("Worker registration failed")
  })

  it("reports denied folder access without leaving the picker busy", async () => {
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockRejectedValue(Object.assign(new Error("Denied"), {name: "NotAllowedError"})))
    const {editor} = await mountEditor()

    await (editor as any).addLocalPackage()

    expect((editor as any).localPackageError).toBe("Denied")
    expect((editor as any).localPackagesLoading).toBe(false)
  })

  it("keeps a denied package folder visible so it can recover after reauthorization", async () => {
    const directory = {
      name: "private-package",
      kind: "directory",
      getFileHandle: async () => { throw Object.assign(new Error("Denied"), {name: "NotAllowedError"}) },
      getDirectoryHandle: async () => { throw Object.assign(new Error("Denied"), {name: "NotAllowedError"}) },
    } as unknown as FileSystemDirectoryHandle
    vi.stubGlobal("showDirectoryPicker", vi.fn().mockResolvedValue(directory))
    vi.spyOn(LocalPackageWorkerClient.prototype, "start").mockResolvedValue({} as never)
    vi.spyOn(LocalPackageWorkerClient.prototype, "register").mockResolvedValue(undefined)
    const {editor} = await mountEditor()

    await (editor as any).addLocalPackage()

    expect((editor as any).localPackages).toHaveLength(1)
    expect((editor as any).localPackages[0].label).toBe("private-package")
    expect((editor as any).localPackageError).toContain("Select the folder again")
    expect([...(editor as any).localPackageManager.records.values()][0].monitor).toBeTruthy()
  })
})

describe("DomEditor file actions", () => {
  it("marks authored language mutations as unsaved", async () => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))
    iframe.contentDocument!.documentElement.setAttribute("lang", "de")
    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(true))
  })

  it("marks authored iframe mutations as unsaved", async () => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))

    const paragraph = iframe.contentDocument!.createElement("p")
    paragraph.textContent = "Content"
    iframe.contentDocument!.body.append(paragraph)

    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(true))
    await editor.updateComplete
    expect((editor.shadowRoot!.querySelector("app-ribbon") as any).fileDirty).toBe(true)
  })

  it("keeps a fresh document clean when it is empty or contains one empty paragraph", async () => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))

    const body = iframe.contentDocument!.body
    const paragraph = iframe.contentDocument!.createElement("p")
    body.replaceChildren(paragraph)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect((editor as any).fileDirty).toBe(false)

    body.replaceChildren()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect((editor as any).fileDirty).toBe(false)
  })

  it.each([
    ["body", "style", "background: red"],
    ["html", "dir", "rtl"],
    ["head", "id", "metadata"],
    ["p", "id", "empty-paragraph"],
    ["p", "contenteditable", "false"],
  ])("tracks attribute-only edits to a fresh %s", async (tag, name, value) => {
    const {editor, iframe} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).dirtyTrackingReady).toBe(true))
    const doc = iframe.contentDocument!
    doc.body.innerHTML = "<p></p>"
    doc.querySelector(tag)!.setAttribute(name, value)
    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(true))
    const unload = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it("tracks edits inside existing and newly inserted nested template fragments", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    const doc = iframe.contentDocument!
    doc.body.innerHTML = "<template><p>before</p></template>"
    await vi.waitFor(() => expect(host.fileDirty).toBe(true))
    host.fileHandle = {name: "saved.html"}
    host.fileDirty = false
    let revision = host.documentChangeSequence
    const template = doc.querySelector("template")!
    template.content.querySelector("p")!.textContent = "after"
    await vi.waitFor(() => expect(host.fileDirty).toBe(true))
    expect(host.documentChangeSequence).toBeGreaterThan(revision)
    template.innerHTML = "<template><b>nested</b></template>"
    await new Promise(resolve => setTimeout(resolve, 0))
    host.fileDirty = false
    revision = host.documentChangeSequence
    template.content.querySelector("template")!.content.querySelector("b")!.setAttribute("title", "authored")
    await vi.waitFor(() => expect(host.fileDirty).toBe(true))
    expect(host.documentChangeSequence).toBeGreaterThan(revision)
    template.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    host.fileDirty = false
    revision = host.documentChangeSequence
    template.content.append(doc.createElement("p"))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.fileDirty).toBe(false)
    expect(host.documentChangeSequence).toBe(revision)
  })

  it("clears unsaved changes when the styles on an otherwise empty paragraph are cleared", async () => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))
    const paragraph = iframe.contentDocument!.createElement("p")
    iframe.contentDocument!.body.replaceChildren(paragraph)
    paragraph.style.padding = "8px"
    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(true))
    paragraph.style.padding = ""
    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(false))
  })

  it("checkpoints authored changes once and removes the draft when the document becomes empty", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.documentSettingsId = "local:document"
    const previous = {id: "previous-draft", documentKey: "source:local:document", title: "Previous draft", updatedAt: 1}
    host.recoveredDocuments = [previous]
    host.documentRecoveryNoticeOpen = true
    const write = vi.spyOn(documentRecoveryStorage, "writeDocumentRecovery")
      .mockImplementation(async record => ({record, replacedIds: [previous.id]}))
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue("<html><body><p>Draft</p></body></html>")
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))

    await host.checkpointDocument()
    expect(execute).not.toHaveBeenCalled()

    iframe.contentDocument!.body.innerHTML = "<p>Draft</p>"
    await vi.waitFor(() => expect(host.fileDirty).toBe(true))
    await host.checkpointDocument()
    const id = host.documentRecoveryCheckpoint.id
    expect(write).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id, documentKey: previous.documentKey}), "<html><body><p>Draft</p></body></html>")
    expect(host.recoveredDocuments).toEqual([])
    expect(host.documentRecoveryNoticeOpen).toBe(false)
    expect(host.documentRecoveryUnchanged).toBe(true)
    await host.checkpointDocument()
    expect(write).toHaveBeenCalledOnce()

    iframe.contentDocument!.body.innerHTML = "<p><br></p>"
    execute.mockResolvedValue(null)
    await vi.waitFor(() => expect(host.documentRecoveryUnchanged).toBe(false))
    await host.checkpointDocument()
    expect(remove).toHaveBeenCalledExactlyOnceWith(id)
    expect(write).toHaveBeenCalledOnce()
    expect(host.documentRecoveryCheckpoint).toBeNull()
  })

  it("captures recovery after a pause in editing, at the latest after the staleness limit, and at once when hidden", async () => {
    const poll = documentRecoveryPollMs, quiet = documentRecoveryQuietMs, limit = documentRecoveryMaxStalenessMs
    // The scenario below pauses twice within one limit and types with gaps of whole polls.
    expect(quiet % poll).toBe(0)
    expect(limit % poll).toBe(0)
    expect(2 * quiet).toBeLessThanOrEqual(limit)
    expect(quiet).toBeGreaterThan(2 * poll)
    vi.useFakeTimers({toFake: ["setInterval", "clearInterval", "Date"]})
    const visibility = vi.spyOn(document, "visibilityState", "get")
    try {
      const timers = vi.spyOn(globalThis, "setInterval")
      const polled: number[] = []
      const {editor, iframe} = await mountEditor(editor => {
        const host = editor as any, run = host.pollDocumentRecovery
        host.pollDocumentRecovery = () => { polled.push(Date.now()); run() }
      })
      const host = editor as any
      expect(timers).toHaveBeenCalledWith(host.pollDocumentRecovery, poll)
      const html = "<html><body><p>Draft</p></body></html>"
      const write = vi.spyOn(documentRecoveryStorage, "writeDocumentRecovery").mockImplementation(async record => ({record, replacedIds: []}))
      let hold = false, release = () => {}
      const execute = vi.spyOn(editor, "execute").mockImplementation(async command =>
        command.type === "captureDocumentRecovery" && hold ? new Promise<string>(resolve => { release = () => resolve(html) }) : html)
      const captures = () => execute.mock.calls.filter(([command]) => command.type === "captureDocumentRecovery").length
      await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
      const settle = () => new Promise(resolve => setTimeout(resolve, 0))
      const body = iframe.contentDocument!.body
      let edits = 0
      const edit = async () => {
        const revision = host.documentChangeSequence
        body.innerHTML = `<p>Draft ${++edits}</p>`
        await settle()
        expect(host.documentChangeSequence).toBeGreaterThan(revision)
        expect(host.fileDirty).toBe(true)
      }
      // Keeps editing for a duration, never pausing for the quiet period.
      const typeFor = async (duration: number) => {
        for(let left = duration; left > 0; left -= quiet - poll) {
          await edit()
          await vi.advanceTimersByTimeAsync(Math.min(quiet - poll, left))
        }
      }
      // Start on a poll, so that every later poll falls on a whole step.
      await vi.advanceTimersByTimeAsync(poll)
      await vi.advanceTimersByTimeAsync(poll - (Date.now() - polled.at(-1)!))
      expect(Date.now()).toBe(polled.at(-1))

      // Each edit postpones the capture until the author has paused.
      await typeFor(2 * (quiet - poll))
      expect(captures()).toBe(0)
      await vi.advanceTimersByTimeAsync(poll)
      expect(captures()).toBe(1)
      expect(host.documentRecoveryUnchanged).toBe(true)
      await vi.advanceTimersByTimeAsync(limit + quiet)
      expect(captures()).toBe(1)

      // Uninterrupted editing is captured once it is the limit behind.
      await typeFor(limit - poll)
      expect(captures()).toBe(1)
      write.mockRejectedValueOnce(new Error("Quota"))
      await typeFor(poll)
      expect(captures()).toBe(2)
      expect(host.documentRecoveryError).toContain("Quota")

      // A failed capture saved nothing: it is retried after its delay, not a limit later.
      const retryDelay = host.documentRecoveryRetryAt - Date.now()
      expect(retryDelay).toBeGreaterThan(poll)
      expect(retryDelay).toBeLessThan(limit)
      await typeFor(retryDelay - poll)
      expect(captures()).toBe(2)
      hold = true
      await typeFor(poll)
      expect(captures()).toBe(3)

      // Edits made while a capture runs count from its start, not from the first edit of the run.
      hold = false
      await edit()
      release()
      await settle()
      expect(host.documentRecoveryWrite).toBeUndefined()
      expect(host.documentRecoveryError).toBe("")
      expect(host.documentRecoveryUnchanged).toBe(false)
      await typeFor(limit - poll)
      expect(captures()).toBe(3)
      await typeFor(poll)
      expect(captures()).toBe(4)

      // A page being hidden may never run again: capture without waiting.
      await edit()
      document.dispatchEvent(new Event("visibilitychange"))
      expect(captures()).toBe(4)
      visibility.mockReturnValue("hidden")
      document.dispatchEvent(new Event("visibilitychange"))
      expect(captures()).toBe(5)

      // The poll ends with the editor.
      await settle()
      await edit()
      editor.remove()
      await vi.advanceTimersByTimeAsync(limit + quiet)
      expect(captures()).toBe(5)
    }
    finally {
      visibility.mockRestore()
      vi.useRealTimers()
    }
  })

  it("keeps a draft if navigation is cancelled and retires it after the page leaves", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const id = crypto.randomUUID()
    const release = vi.fn()
    let finishWrite!: () => void
    host.documentRecoveryWrite = new Promise<void>(resolve => { finishWrite = resolve })
    host.activeDocumentRecovery = {id, release}
    host.documentRecoveryCheckpoint = {id, title: "Draft", updatedAt: 1}
    host.fileDirty = true
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    try {
      const warning = new Event("beforeunload", {cancelable: true})
      window.dispatchEvent(warning)
      expect(warning.defaultPrevented).toBe(true)
      expect(documentRecoveryStorage.discardedDocumentRecoveryIds().has(id)).toBe(false)
      expect(host.documentRecoveryCheckpoint.id).toBe(id)
      expect(remove).not.toHaveBeenCalled()

      window.dispatchEvent(new Event("pagehide"))
      expect(documentRecoveryStorage.discardedDocumentRecoveryIds().has(id)).toBe(true)
      expect(host.documentRecoveryCheckpoint).toBeNull()
      expect(remove).not.toHaveBeenCalled()
      finishWrite()
      await vi.waitFor(() => {
        expect(remove).toHaveBeenCalledExactlyOnceWith(id)
        expect(release).toHaveBeenCalledOnce()
      })
    }
    finally {
      finishWrite()
      localStorage.removeItem("webwriter-document-recovery-discarded:" + id)
    }
  })

  it.each(["New", "Open local", "Open cloud"])("keeps the recovery draft until %s completes a confirmed switch", async action => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const host = editor as any
    const id = crypto.randomUUID()
    const release = vi.fn()
    const record = {id, title: "Draft", updatedAt: 1}
    host.activeDocumentRecovery = {id, release}
    host.documentRecoveryCheckpoint = record
    host.fileDirty = true
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal("confirm", confirm)
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    const file = new File(["<p>Opened</p>"], "opened.html")
    const picker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
      .mockResolvedValue([{name: file.name, getFile: async () => file}])
    vi.stubGlobal("showOpenFilePicker", picker)
    host.backendClient = {apiBaseUrl: "http://localhost:1234/api", getDocument: async () => ({
      id: "lesson", title: "Lesson", content: "<p>Opened</p>", format: "html",
    })}
    const switchDocument = () => action === "New" ? host.newDocument("document")
      : action === "Open local" ? host.openDocument() : host.openBackendDocument("lesson")
    try {
      await switchDocument()
      expect(host.documentRecoveryCheckpoint).toBe(record)
      expect(host.editorIframe()).toBe(iframe)
      expect(remove).not.toHaveBeenCalled()
      confirm.mockReturnValue(true)
      if(action === "Open local") {
        await switchDocument()
        expect(host.documentRecoveryCheckpoint).toBe(record)
        expect(host.editorIframe()).toBe(iframe)
        expect(host.fileError).toBe("")
        expect(remove).not.toHaveBeenCalled()
      }

      let ready!: (value: Window) => void
      const wait = vi.spyOn(host, "waitForEditorWindow").mockReturnValue(new Promise<Window>(resolve => { ready = resolve }))
      const switching = switchDocument()
      await vi.waitFor(() => expect(wait).toHaveBeenCalled())
      expect(documentRecoveryStorage.discardedDocumentRecoveryIds().has(id)).toBe(false)
      expect(remove).not.toHaveBeenCalled()
      expect(release).not.toHaveBeenCalled()
      ready(editorWindow)
      await switching
      expect(host.editorIframe()).not.toBe(iframe)
      expect(host.documentRecoveryCheckpoint).toBeNull()
      await vi.waitFor(() => {
        expect(remove).toHaveBeenCalledExactlyOnceWith(id)
        expect(release).toHaveBeenCalledOnce()
      })
    }
    finally { localStorage.removeItem("webwriter-document-recovery-discarded:" + id) }
  })

  it("keeps a confirmed switch's recovery draft when the replacement cannot initialize", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const id = crypto.randomUUID()
    const release = vi.fn()
    host.activeDocumentRecovery = {id, release}
    host.documentRecoveryCheckpoint = {id, title: "Draft", updatedAt: 1}
    host.fileDirty = true
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    vi.spyOn(host, "waitForEditorWindow").mockRejectedValue(new Error("Frame failed"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()

    await host.newDocument("document")
    expect(host.fileError).toBe("Frame failed")
    expect(documentRecoveryStorage.discardedDocumentRecoveryIds().has(id)).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it.each(["empty", "empty text", "placeholder break"])("clears unsaved changes for a fresh paragraph with %s content", async content => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))
    const host = editor as any
    const doc = iframe.contentDocument!
    doc.body.innerHTML = "<p>Content</p>"
    await vi.waitFor(() => expect(host.fileDirty).toBe(true))

    const paragraph = doc.body.firstElementChild!
    paragraph.replaceChildren(...(content === "empty" ? [] : [doc.createTextNode("")]))
    if(content === "placeholder break") paragraph.append(doc.createElement("br"))

    await vi.waitFor(() => expect(host.fileDirty).toBe(false))
    await editor.updateComplete
    expect((editor.shadowRoot!.querySelector("app-ribbon") as AppRibbon).fileDirty).toBe(false)
    const unload = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal("confirm", confirm)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    await host.newDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledOnce()
  })

  it.each([
    "<p>Text</p>",
    "<p> </p>",
    '<p><img src="image.png"></p>',
    "<p><test-widget></test-widget></p>",
    "<p><br><br></p>",
    "<p></p><p></p>",
    '<p style="padding: 8px"></p>',
    '<p style="border: 1px solid black"><br></p>',
  ])("keeps authored content dirty in a fresh document: %s", async html => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))
    iframe.contentDocument!.body.innerHTML = html
    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(true))
    const unload = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it.each(["local", "development-server"])("tracks an empty paragraph as a change once the document has been saved to %s", async storageLocation => {
    const {editor, iframe} = await mountEditor()
    await new Promise(resolve => setTimeout(resolve, 0))
    if(storageLocation === "local") (editor as any).fileHandle = {name: "saved.html"}
    else (editor as any).backendDocumentId = "saved"

    iframe.contentDocument!.body.innerHTML = "<p><br></p>"

    await vi.waitFor(() => expect((editor as any).fileDirty).toBe(true))
  })

  it("saves serialized HTML through the File System Access API and clears the dirty marker", async () => {
    const {editor} = await mountEditor()
    const draft = seedRecoveryDraft(editor)
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const handle = {
      name: "lesson.html",
      getFile: vi.fn(),
      createWritable: vi.fn().mockResolvedValue({write, close}),
    }
    const picker = vi.fn().mockResolvedValue(handle)
    vi.stubGlobal("showSaveFilePicker", picker)
    const execute = mockSaveSnapshot(editor, "<!DOCTYPE html><html><body><p>Saved</p></body></html>")
    ;(editor as any).fileDirty = true

    await (editor as any).saveDocument()

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      types: [
        {description: "HTML document (.html)", accept: {"text/html": [".html", ".htm"]}},
        {description: "Offline HTML document (.offline.html)", accept: {"text/html": [".offline.html"]}},
      ],
    }))
    expect(picker.mock.calls[0][0]).not.toHaveProperty("suggestedName")
    expect(execute).toHaveBeenCalledWith({type: "prepareVersionSave", offline: false})
    expect(handle.createWritable).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    const blob = write.mock.calls[0][0] as Blob
    await expect(blob.text()).resolves.toContain("<p>Saved</p>")
    expect(close).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({type: "recordVersionSave", checkpointId: "saved-checkpoint"})
    expect((editor as any).fileName).toBe("lesson")
    expect((editor as any).fileDirty).toBe(false)
    expect(remove).toHaveBeenCalledExactlyOnceWith(draft.id, expect.any(AbortSignal))
    expect((editor as any).documentRecoveryCheckpoint).toBeNull()
    expect(new URL(location.href).searchParams.get("open")).toBe(`local:${(editor as any).recentDocuments[0].id}`)
  })

  it("routes the quick Save button to Save As for a document without a file handle", async () => {
    const {editor} = await mountEditor()
    const handle = {
      name: "quick-save.html",
      getFile: vi.fn(),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }
    const picker = vi.fn().mockResolvedValue(handle)
    vi.stubGlobal("showSaveFilePicker", picker)
    mockSaveSnapshot(editor, "<!DOCTYPE html><html><body></body></html>")

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const save = ribbon.shadowRoot!.querySelector<RibbonButton>("ribbon-button.file-save-action")!
    await save.updateComplete
    save.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect((editor as any).fileHandle).toBe(handle))
    expect(picker).toHaveBeenCalledOnce()
  })

  it.each(["local", "development-server"])("records no saved version after a failed %s save", async storageLocation => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.storageLocation = storageLocation
    if(storageLocation === "development-server") {configureCloudStorage(host); host.backendDocumentId = "saved"}
    host.fileDirty = true
    vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    const failure = new Error("Save failed")
    const draft = seedRecoveryDraft(editor)
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    host.backendClient = {updateDocument: vi.fn().mockRejectedValue(failure)}
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({name: "failed.html",
      createWritable: async () => ({write: async () => {}, close: async () => {throw failure}})}))
    const execute = mockSaveSnapshot(editor, "<p>Unsaved</p>")
    await host.saveDocument()
    expect(execute).toHaveBeenCalledWith({type: "prepareVersionSave", offline: false})
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({type: "recordVersionSave"}))
    expect(host.fileDirty).toBe(true)
    expect(host.documentRecoveryCheckpoint).toBe(draft)
    expect(remove).not.toHaveBeenCalled()
  })

  it("keeps the recovery draft when Save As is cancelled in the writable file picker", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const draft = seedRecoveryDraft(editor)
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")))
    const execute = mockSaveSnapshot(editor, "<p>Draft</p>")

    await host.saveDocument(true)
    expect(host.documentRecoveryCheckpoint).toBe(draft)
    expect(remove).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({type: "prepareVersionSave"}))
  })

  it("cancels saved draft cleanup when another edit arrives before the deletion commits", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const draft = seedRecoveryDraft(editor)
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockImplementation((_id, signal) =>
      new Promise((resolve, reject) => {
        if(!signal) { resolve(); return }
        signal.addEventListener("abort", () => reject(signal.reason), {once: true})
      }))
    host.fileHandle = {name: "lesson.html", createWritable: async () => ({write: async () => {}, close: async () => {}})}
    mockSaveSnapshot(editor, "<p>Saved</p>")
    const saving = host.saveDocument()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(draft.id, expect.any(AbortSignal)))
    iframe.contentDocument!.body.append(iframe.contentDocument!.createElement("hr"))
    await saving
    expect(host.documentRecoveryCheckpoint).toBe(draft)
    expect(host.documentRecoveryUnchanged).toBe(false)
    expect(host.fileDirty).toBe(true)
    expect(host.documentRecoveryError).toBe("")
  })

  it("uses the hidden input to open local files even when a backend is connected", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...host.settings, cloudServicesConfigured: true, activeCloudServiceId: null}
    host.backendClient = {listDocuments: vi.fn()}
    host.storageLocation = "development-server"
    vi.stubGlobal("showOpenFilePicker", undefined)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    const opening = host.openDocument()
    const input = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.hidden).toBe(true)
    Object.defineProperty(input, "files", {value: [new File(["<p>Imported</p>"], "import.html")]})
    input.dispatchEvent(new Event("change"))
    await opening
    expect(reload).toHaveBeenCalledWith("<p>Imported</p>", false, null, true, {discardRecovery: false, beforeSwitch: expect.any(Function)})
    expect(host.backendClient.listDocuments).not.toHaveBeenCalled()
    expect(host.fileHandle).toBeNull()
    expect(host.fileName).toBe("import")
    expect(input.isConnected).toBe(false)
    expect(host.fileOperationActive).toBe(false)
  })

  it("cleans up cancelled fallback file dialogs", async () => {
    const {editor} = await mountEditor()
    vi.stubGlobal("showOpenFilePicker", undefined)
    const host = editor as any
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    const opening = host.openDocument()
    editor.shadowRoot!.querySelector('input[type="file"]')!.dispatchEvent(new Event("cancel"))
    await opening
    expect(host.fileOperationActive).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(editor.shadowRoot!.querySelector('input[type="file"]')).toBeNull()
  })

  it("routes widget file conversions through the host picker and download", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.widgetConversion = {sourceId: "element-1", targets: [], imports: ["text/csv", ".CSV", ".csv", ".quiz"], exports: ["text/plain", ".txt"]}
    const output = new File(["Exported"], "quiz.txt", {type: "text/plain"})
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => action.type === "exportWidgetFile" ? output : true)
    const download = vi.spyOn(host, "triggerFileDownload").mockImplementation(() => {})
    const run = (label: string) => host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label}}))

    for(const [input, format] of [
      [new File(["a,b"], "quiz.csv"), ".CSV"],
      [new File(["a,b"], "quiz", {type: "text/csv"}), "text/csv"],
    ] as const) {
      run("widget-import:element-1:text/csv")
      const picker = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
      expect(picker.accept).toBe("text/csv,.csv")
      Object.defineProperty(picker, "files", {value: [input]})
      picker.dispatchEvent(new Event("change"))
      await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "importWidgetFile", sourceId: "element-1", format, file: input}))
      expect(picker.isConnected).toBe(false)
    }

    run("widget-export:element-1:text/plain")
    await vi.waitFor(() => expect(download).toHaveBeenCalledWith(output, "quiz.txt"))
    expect(execute).toHaveBeenCalledWith({type: "exportWidgetFile", sourceId: "element-1", format: "text/plain"})
  })

  it.each([
    ["a message", new Error("Die Datei ist leer."), "Die Datei ist leer."],
    ["no message", new Error(""), "The file could not be imported into the selected widget."],
    ["a declined import", false, "The file could not be imported into the selected widget."],
  ])("shows the author why a widget file import failed (%s)", async (_name, outcome, message) => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.widgetConversion = {sourceId: "element-1", targets: [], imports: [".quiz"]}
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(editor, "execute").mockImplementation(async () => { if(outcome instanceof Error) throw outcome; return outcome })
    host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: "widget-import:element-1:.quiz"}}))
    const picker = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(picker, "files", {value: [new File(["x"], "quiz.quiz")]})
    picker.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(host.fileError).toBe(message))
  })

  it("shows the widget's message when an element conversion fails", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.widgetConversion = {sourceId: "element-1", targets: [{tag: "ww-demo"}]}
    const execute = vi.spyOn(editor, "execute").mockRejectedValue(new Error("Die Liste ist leer."))
    host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: "widget-conversion:element-1:ww-demo"}}))
    await vi.waitFor(() => expect(host.fileError).toBe("Die Liste ist leer."))
    execute.mockRejectedValue(new Error(""))
    host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: "widget-conversion:element-1:ww-demo"}}))
    await vi.waitFor(() => expect(host.fileError).toBe("The selected element could not be converted."))
  })

  it("prompts for the first local download name and reuses it on Save", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.fileDirty = true
    const draft = seedRecoveryDraft(editor)
    const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
    vi.stubGlobal("showSaveFilePicker", undefined)
    const prompt = vi.fn().mockReturnValueOnce("Lesson").mockReturnValueOnce("Copy.html")
    vi.stubGlobal("prompt", prompt)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) {downloads.push(this.download)})
    mockSaveSnapshot(editor, "<p>Saved</p>")
    await host.saveDocument()
    expect(host.fileName).toBe("Lesson")
    expect(host.fileDirty).toBe(false)
    await host.saveDocument()
    expect(prompt).toHaveBeenCalledTimes(1)
    await host.saveDocument(true)
    expect(prompt).toHaveBeenCalledTimes(2)
    expect(downloads).toEqual(["Lesson.html", "Lesson.html", "Copy.html"])
    expect(host.documentRecoveryCheckpoint).toBe(draft)
    expect(remove).not.toHaveBeenCalled()
  })

  it("leaves the document unchanged when the fallback Save as prompt is cancelled", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.fileDirty = true
    vi.stubGlobal("showSaveFilePicker", undefined)
    vi.stubGlobal("prompt", vi.fn().mockReturnValue(null))
    const execute = mockSaveSnapshot(editor, "<p>Saved</p>")
    await host.saveDocument()
    expect(execute).not.toHaveBeenCalledWith(expect.objectContaining({type: "prepareVersionSave"}))
    expect(host.fileDirty).toBe(true)
    expect(host.downloadedFileName).toBeNull()
  })

  it("reports an unavailable configured cloud without invoking local file dialogs", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    configureCloudStorage(host)
    host.backendClient = null
    const open = vi.fn()
    const save = vi.fn()
    vi.stubGlobal("showOpenFilePicker", open)
    vi.stubGlobal("showSaveFilePicker", save)
    const report = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    await host.openDocument()
    await host.saveDocument()
    expect(report).toHaveBeenCalledTimes(2)
    expect(open).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it("reuses the local file handle when Save is triggered again", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const write = vi.fn()
    host.fileHandle = {name: "Original.html", createWritable: async () => ({write, close: async () => {}})}
    host.fileName = "Renamed in editor"
    const picker = vi.fn()
    vi.stubGlobal("showSaveFilePicker", picker)
    host.updateDocumentSettings({proofreadingEnabled: false, commentHighlighting: false})
    mockSaveSnapshot(editor, "<p>Saved</p>")
    await host.saveDocument()
    expect(write).toHaveBeenCalledOnce()
    expect(picker).not.toHaveBeenCalled()
    expect(host.documentSettingsId).toMatch(/^local:/)
    expect(loadDocumentSettings(host.documentSettingsId)).toEqual({proofreadingEnabled: false, commentHighlighting: false})
    const id = host.documentSettingsId
    await host.saveDocument()
    expect(host.documentSettingsId).toBe(id)
  })

  it("enables automatic accessibility review only after a successful save", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.fileName = "Lesson"
    const actions: string[] = []
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      actions.push(action.type)
      if(action.type === "prepareVersionSave") return {checkpointId: "saved-checkpoint", source: "<p>Saved</p>"}
      if(action.type === "recordVersionSave") return emptyVersionHistoryState()
      return true
    })
    vi.spyOn(host, "triggerFileDownload").mockImplementation(() => {})
    const picker = vi.fn().mockRejectedValue(new DOMException("canceled", "AbortError"))
    vi.spyOn(host, "filePickerWindow").mockReturnValue({showSaveFilePicker: picker})
    await host.performSaveDocument()
    expect(host.accessibilityReviewEnabled).toBe(false)
    expect(actions).toEqual([])

    picker.mockResolvedValue({name: "Lesson.html", createWritable: async () => ({write: vi.fn(), close: vi.fn()})})
    await host.performSaveDocument()
    expect(host.accessibilityReviewEnabled).toBe(true)
    expect(actions).toContain("setAccessibilityReviewEnabled")
    expect(execute).toHaveBeenCalledWith({type: "setAccessibilityReviewEnabled", enabled: true})
  })

  it("does not enable automatic accessibility review when saving the file fails", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.fileHandle = {name: "Lesson.html", createWritable: async () => {throw new Error("write failed")}}
    const execute = mockSaveSnapshot(editor, "<p>Saved</p>")
    vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    await host.performSaveDocument()
    expect(host.accessibilityReviewEnabled).toBe(false)
    expect(execute).not.toHaveBeenCalledWith({type: "setAccessibilityReviewEnabled", enabled: true})
  })

  it("resets the saved-once accessibility gate for new documents and restores it for opened documents", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    vi.spyOn(host, "waitForEditorWindow").mockResolvedValue(iframe.contentWindow)
    host.accessibilityReviewEnabled = true
    await host.reloadDocument("<!doctype html><html><body></body></html>", true)
    expect(host.accessibilityReviewEnabled).toBe(false)
    await host.reloadDocument("<!doctype html><html><body><p>Opened</p></body></html>", false, null, true)
    expect(host.accessibilityReviewEnabled).toBe(true)
    await host.reloadDocument("<!doctype html><html><body></body></html>", true)
    expect(host.accessibilityReviewEnabled).toBe(false)
  })

  it("keeps the cloud endpoint and dirty state when downloading a local copy", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    configureCloudStorage(host)
    host.backendDocumentId = "cloud-file"
    host.fileName = "Cloud lesson"
    host.fileDirty = true
    const write = vi.fn()
    const handle = {name: "Local copy.html", createWritable: async () => ({write, close: async () => {}})}
    const picker = vi.fn().mockResolvedValue(handle)
    vi.stubGlobal("showSaveFilePicker", picker)
    mockSaveSnapshot(editor, "<p>Saved</p>")
    host.backendClient = {updateDocument: vi.fn().mockResolvedValue({id: "cloud-file", title: "Cloud lesson", format: "html"})}
    await host.downloadDocument()
    await host.downloadDocument()
    expect(picker).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledTimes(2)
    expect(host.backendDocumentId).toBe("cloud-file")
    expect(host.fileName).toBe("Cloud lesson")
    expect(host.fileDirty).toBe(true)
    expect(host.accessibilityReviewEnabled).toBe(true)
    await host.saveDocument()
    expect(host.backendClient.updateDocument).toHaveBeenCalledWith("cloud-file", expect.objectContaining({title: "Cloud lesson"}))
    expect(host.fileHandle).toBe(handle)
  })

  it("uses the cloud Save as dialog to replace a selected file and keeps failures open", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    configureCloudStorage(host)
    const existing = {id: "existing", title: "Lesson", format: "html", updatedAt: "2026-09-10T12:00:00Z"}
    host.backendClient = {listDocuments: vi.fn().mockResolvedValue([{...existing, id: "earlier"}, existing]), updateDocument: vi.fn().mockRejectedValue(new Error("Save failed")), createDocument: vi.fn()}
    host.accessibilityReviewEnabled = false
    const report = vi.spyOn(host, "reportFileError").mockImplementation((error: unknown) => {host.fileError = (error as Error).message})
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    mockSaveSnapshot(editor, "<p>Saved</p>")
    await host.saveDocument(true)
    const menu = editor.shadowRoot!.querySelector<OpenDocumentMenu>("open-document-menu")!
    menu.dispatchEvent(new CustomEvent("document-save", {detail: {name: "Lesson.html", id: "existing"}}))
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce())
    expect(host.accessibilityReviewEnabled).toBe(false)
    expect(host.backendClient.updateDocument).toHaveBeenCalledWith("existing", expect.objectContaining({title: "Lesson"}))
    expect(host.backendClient.createDocument).not.toHaveBeenCalled()
    expect(menu.shadowRoot!.querySelector("dialog")!.open).toBe(true)
    expect(host.documentsError).toBe("Save failed")
    host.backendClient.updateDocument.mockResolvedValue(existing)
    menu.dispatchEvent(new CustomEvent("document-save", {detail: {name: "Lesson", id: "existing"}}))
    await vi.waitFor(() => expect(menu.shadowRoot!.querySelector("dialog")!.open).toBe(false))
    expect(host.backendDocumentId).toBe("existing")
    expect(host.accessibilityReviewEnabled).toBe(true)
    await host.saveDocument(true)
    menu.fileName = "Discarded draft"
    menu.close()
    await host.saveDocument(true)
    expect(menu.fileName).toBe("Lesson.html")
  })

  it.each(["html", "offline"])("routes the %s Download submenu to local saving without changing the cloud destination", async format => {
    const {editor} = await mountEditor()
    const host = editor as any
    configureCloudStorage(host)
    host.backendDocumentId = "cloud-file"
    const write = vi.fn()
    const name = format === "offline" ? "copy.offline.html" : "copy.html"
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({name, createWritable: async () => ({write, close: async () => {}})}))
    const execute = mockSaveSnapshot(editor, "<p>Downloaded</p>")
    host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: `download:${format}`}}))
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(host.fileOperationActive).toBe(false))
    expect(execute).toHaveBeenCalledWith({type: "prepareVersionSave", offline: format === "offline"})
    expect(host.backendDocumentId).toBe("cloud-file")
  })

  it("offers Upload and Download only for a configured cloud, above the menu separator", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    expect(menu.groups[0].buttons.map(button => typeof button === "string" ? button : button.label)).not.toContain("Upload")
    configureCloudStorage(host)
    await editor.updateComplete
    await ribbon.updateComplete
    expect(menu.groups[0].buttons.slice(-3)).toEqual([{label: "Upload", icon: "Upload"}, {label: "Download", icon: "Download", submenu: [
      {label: "HTML (.html)", action: "download:html", icon: "HTML"}, {label: "Offline HTML (.offline.html)", action: "download:offline", icon: "OfflineHTML"},
    ]}, "Print"])
    const labels = menu.groups[0].buttons.map(button => typeof button === "string" ? button : button.label)
    expect(labels.indexOf("Save as")).toBe(labels.indexOf("Save") + 1)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    host.backendDocumentId = "old-cloud-file"
    vi.stubGlobal("showOpenFilePicker", undefined)
    host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: "Upload"}}))
    const input = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {value: [new File(["<p>Upload</p>"], "Uploaded.html")]})
    input.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(host.fileOperationActive).toBe(false))
    expect(reload).toHaveBeenCalledWith("<p>Upload</p>", false, null, true, {discardRecovery: false, beforeSwitch: expect.any(Function)})
    expect(host.settings.activeCloudServiceId).toBe("test-cloud")
    expect(host.backendDocumentId).toBeNull()
  })

  it("opens an HTML file and associates its handle with the document", async () => {
    const {editor} = await mountEditor()
    const file = new File(["<!DOCTYPE html><html><body><p>Opened</p></body></html>"], "opened.html", {type: "text/html"})
    const handle = {name: "opened.html", getFile: vi.fn().mockResolvedValue(file), createWritable: vi.fn()}
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
    const reload = vi.spyOn(editor as any, "reloadDocument").mockResolvedValue(undefined)

    await (editor as any).openDocument()

    expect(reload).toHaveBeenCalledWith(expect.stringContaining("<p>Opened</p>"), false, expect.stringMatching(/^local:/), true, {discardRecovery: false, beforeSwitch: expect.any(Function)})
    expect((editor as any).fileHandle).toBe(handle)
    expect((editor as any).fileName).toBe("opened")
    expect((editor as any).fileDirty).toBe(false)
  })

  it("preserves authored formatting and image filters when reopening HTML files", async () => {
    const {editor} = await mountEditor()
    const marks = excludedMarkNames.map(name => `<${name}><b>${name}</b><!--keep--></${name}>`).join("")
    const body = '<p style="font-size: 24px; color: navy">Whole paragraph <span style="font-family: Georgia, serif; font-size: 32px; color: red; background-color: yellow">styled <b>text</b></span> plain</p>'
      + '<figure style="filter: grayscale(1)"><picture><img src="data:image/png;base64,AQID" style="filter: sepia(1) contrast(2)"></picture><figcaption>Caption</figcaption></figure>'
      + `<p>${marks}<ruby><rb>漢</rb><rp>(</rp><rt>かん</rt><rp>)</rp><rtc><rt>character</rt></rtc></ruby></p>`
      + '<test-widget custom="keep"><span style="color: green">widget</span></test-widget><template><span style="color: blue">template</span></template>'
      + '<svg xmlns="http://www.w3.org/2000/svg"><text><tspan fill="purple">SVG</tspan></text></svg>'
    const file = new File([`<!DOCTYPE html><html lang="de"><head><title>Imported</title></head><body>${body}</body></html>`], "imported.html", {type: "text/html"})
    const handle = {name: "imported.html", getFile: vi.fn().mockResolvedValue(file)}
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([handle]))
    vi.spyOn(editor as any, "waitForEditorWindow").mockResolvedValue(undefined)

    await (editor as any).openDocument()

    const source = (editor as any).frameDocumentHTML as string
    const parsed = new DOMParser().parseFromString(source, "text/html")
    expect(source).toContain("<!DOCTYPE html>")
    expect(parsed.documentElement.lang).toBe("de")
    expect(parsed.title).toBe("Imported")
    const expected = new DOMParser().parseFromString(body, "text/html")
    expect(parsed.body.innerHTML).toBe(expected.body.innerHTML)
    expect((editor as any).fileHandle).toBe(handle)

    // Repeated opens must not progressively discard markup or its attributes.
    await (editor as any).reloadDocument(source)
    const reopened = new DOMParser().parseFromString((editor as any).frameDocumentHTML, "text/html")
    expect(reopened.body.innerHTML).toBe(expected.body.innerHTML)
  })

  it("opens documents from the development backend when logged in", async () => {
    const {editor} = await mountEditor()
    const backend = {
      listDocuments: vi.fn().mockResolvedValue([{id: "doc-1", title: "Server lesson", format: "html", updatedAt: "2026-09-10T12:00:00Z"}]),
      getDocument: vi.fn().mockResolvedValue({
        id: "doc-1",
        title: "Server lesson",
        content: "<!DOCTYPE html><html><body><p>From server</p></body></html>",
        format: "html",
      }),
    }
    ;(editor as any).backendClient = backend
    ;(editor as any).storageLocation = "development-server"
    configureCloudStorage(editor as any)
    const reload = vi.spyOn(editor as any, "reloadDocument").mockResolvedValue(undefined)

    await (editor as any).openDocument()

    expect(backend.getDocument).not.toHaveBeenCalled()
    const menu = editor.shadowRoot!.querySelector<OpenDocumentMenu>("open-document-menu")!
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector("dialog")!.open).toBe(true)
    menu.shadowRoot!.querySelector<HTMLButtonElement>(".open")!.click()
    await vi.waitFor(() => expect((editor as any).fileName).toBe("Server lesson"))
    expect(menu.shadowRoot!.querySelector("dialog")!.open).toBe(false)
    expect(backend.getDocument).toHaveBeenCalledWith("doc-1")
    expect(reload).toHaveBeenCalledWith(expect.stringContaining("From server"), false, null, true, {discardRecovery: false, beforeSwitch: expect.any(Function)})
    expect((editor as any).backendDocumentId).toBe("doc-1")
    expect((editor as any).fileName).toBe("Server lesson")
  })

  it("refreshes saved documents on each opening, with newest first and retry after failure", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const older = {id: "older", title: "Older", format: "html", updatedAt: "2026-09-01T12:00:00Z"}
    const newer = {id: "newer", title: "Newer", format: "html", updatedAt: "2026-09-10T12:00:00Z"}
    const listDocuments = vi.fn().mockRejectedValueOnce(new Error("Server unavailable"))
      .mockResolvedValueOnce([older, newer]).mockResolvedValueOnce([])
    host.backendClient = {listDocuments}
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    host.fileDirty = true
    const confirm = vi.fn()
    vi.stubGlobal("confirm", confirm)
    await host.openDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(host.documentsError).toBe("Server unavailable")
    const menu = editor.shadowRoot!.querySelector<OpenDocumentMenu>("open-document-menu")!
    menu.dispatchEvent(new CustomEvent("documents-retry"))
    await vi.waitFor(() => expect(host.savedDocuments).toEqual([newer, older]))
    expect(host.documentsError).toBe("")
    menu.close()
    await host.openDocument()
    expect(host.savedDocuments).toEqual([])
  })

  it("restores a local deep link on startup from its retained handle, without a picker", async () => {
    history.replaceState({previous: true}, "", "/?other=keep&open=local%3Astored#anchor")
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...defaultAppSettings, defaultLayout: "canvas"}))
    const file = new File(["<p>Linked local document</p>"], "Linked.html")
    const handle = {name: file.name, getFile: vi.fn().mockResolvedValue(file), createWritable: vi.fn(), queryPermission: vi.fn().mockResolvedValue("granted")}
    vi.spyOn(recentDocumentStorage, "readLocalDocumentReference").mockResolvedValue({id: "stored", title: file.name, openedAt: 1, kind: "local", handle})
    const picker = vi.fn()
    vi.stubGlobal("showOpenFilePicker", picker)
    let reload!: ReturnType<typeof vi.spyOn>
    const {editor} = await mountEditor(editor => {
      const host = editor as any
      reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
      vi.spyOn(host.localPackageManager, "restore").mockImplementation(async () => {
        host.frameRevision++
        return []
      })
    })
    await vi.waitFor(() => expect((editor as any).fileHandle).toBe(handle))
    await vi.waitFor(() => expect((editor as any).fileOperationActive).toBe(false))
    expect(reload).toHaveBeenCalledWith("<p>Linked local document</p>", false, "local:stored", true, {discardRecovery: false, beforeSwitch: expect.any(Function)})
    expect(picker).not.toHaveBeenCalled()
    expect(new URL(location.href).searchParams.get("open")).toBe("local:stored")
    expect(new URL(location.href).searchParams.get("other")).toBe("keep")
    expect(location.hash).toBe("#anchor")
    expect(history.state).toEqual({previous: true})
  })

  it.each([null, "local:newer"])("does not restore a delayed startup link after another document replaces it (%s)", async replacement => {
    const {editor} = await mountEditor()
    const host = editor as any
    history.replaceState({}, "", "/?open=local%3Astored")
    const opened = vi.spyOn(host, "performOpenDocument").mockResolvedValue(undefined)
    let release!: () => void
    const ready = new Promise<void>(resolve => {release = resolve})
    const restoring = host.restoreLinkedDocument("local:stored", ready)
    host.frameRevision++
    host.updateDocumentURL(replacement)
    release()
    await restoring
    expect(opened).not.toHaveBeenCalled()
    expect(host.fileError).toBe("")
    expect(new URL(location.href).searchParams.get("open")).toBe(replacement)
  })

  it.each(["missing", "denied"])("leaves the document unchanged for an inaccessible local deep link: %s", async reason => {
    const {editor} = await mountEditor()
    const host = editor as any
    const handle = {name: "Missing.html", getFile: vi.fn(), createWritable: vi.fn(), queryPermission: vi.fn().mockResolvedValue("denied")}
    vi.spyOn(recentDocumentStorage, "readLocalDocumentReference").mockResolvedValue(reason === "missing" ? null : {id: "missing", title: handle.name, openedAt: 1, kind: "local", handle})
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    await host.restoreLinkedDocument("local:missing")
    expect(reload).not.toHaveBeenCalled()
    expect(handle.getFile).not.toHaveBeenCalled()
    expect(host.fileHandle).toBeNull()
    expect(host.fileOperationActive).toBe(false)
    expect(host.fileError).toContain(reason === "missing" ? "not stored in this browser" : "no longer has access")
  })

  it("opens a cloud deep link from its exact endpoint and id without relying on recent history", async () => {
    const base = "http://localhost:5678/nested/api"
    const reference = `${base}/documents/folder%2Flesson`
    history.replaceState({}, "", `/?open=${encodeURIComponent(reference)}`)
    const getDocument = vi.fn().mockResolvedValue({id: "folder/lesson", title: "Linked lesson", content: "<p>Cloud document</p>", format: "html"})
    let login!: ReturnType<typeof vi.spyOn>
    let reload!: ReturnType<typeof vi.spyOn>
    const {editor} = await mountEditor(editor => {
      const host = editor as any
      login = vi.spyOn(host, "loginToBackend").mockImplementation(async () => {
        host.backendSession = {apiBaseUrl: base, user: {id: "ada"}}
        host.backendClient = {apiBaseUrl: base, getDocument}
      })
      reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    })
    await vi.waitFor(() => expect((editor as any).backendDocumentId).toBe("folder/lesson"))
    await vi.waitFor(() => expect((editor as any).fileOperationActive).toBe(false))
    expect(login).toHaveBeenCalledWith(base)
    expect(getDocument).toHaveBeenCalledWith("folder/lesson")
    expect(reload).toHaveBeenCalledWith("<p>Cloud document</p>", false, reference, true, {discardRecovery: false, beforeSwitch: expect.any(Function)})
    expect(new URL(location.href).searchParams.get("open")).toBe(reference)
  })

  it("updates cloud links after Save As and retains their ids on subsequent saves", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const saved = {id: "folder/new document", title: "Saved", format: "html", createdAt: "2026-10-03", updatedAt: "2026-10-03"}
    const client = {listDocuments: vi.fn().mockResolvedValue([]), apiBaseUrl: "http://localhost:1234/api", createDocument: vi.fn().mockResolvedValue(saved), updateDocument: vi.fn().mockResolvedValue(saved)}
    host.backendClient = client
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    host.backendDocumentId = "previous"
    host.updateDocumentSettings({proofreadingEnabled: true, commentHighlighting: false})
    mockSaveSnapshot(editor, "<p>Saved content</p>")
    history.replaceState({}, "", "/?other=keep&open=local%3Aprevious")
    await host.saveDocument(true)
    editor.shadowRoot!.querySelector("open-document-menu")!.dispatchEvent(new CustomEvent("document-save", {detail: {name: "Saved.html"}}))
    await vi.waitFor(() => expect(host.backendDocumentId).toBe(saved.id))
    const reference = "http://localhost:1234/api/documents/folder%2Fnew%20document"
    expect(new URL(location.href).searchParams.get("open")).toBe(reference)
    expect(client.createDocument).toHaveBeenCalledOnce()
    expect(loadDocumentSettings(reference)).toEqual({proofreadingEnabled: true, commentHighlighting: false})
    await host.saveDocument()
    expect(client.updateDocument).toHaveBeenCalledWith(saved.id, expect.objectContaining({content: "<p>Saved content</p>"}))
    expect(new URL(location.href).searchParams.get("open")).toBe(reference)
    expect(new URL(location.href).searchParams.get("other")).toBe("keep")
  })

  it("reports failed cloud links without changing the document or linking a different endpoint", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    const login = vi.spyOn(host, "loginToBackend").mockResolvedValue(undefined)
    host.backendClient = {apiBaseUrl: "http://localhost:1234/api", getDocument: vi.fn().mockRejectedValue(new Error("Document not found"))}
    await host.restoreLinkedDocument("http://localhost:5678/api/documents/missing")
    expect(host.backendClient.getDocument).not.toHaveBeenCalled()
    expect(login).toHaveBeenCalledWith("http://localhost:5678/api")
    expect(host.fileError).toContain("Could not connect")
    await host.restoreLinkedDocument("http://localhost:1234/api/documents/missing")
    expect(host.fileError).toBe("Document not found")
    expect(reload).not.toHaveBeenCalled()
    await host.restoreLinkedDocument("javascript:alert(1)")
    expect(host.fileError).toBe("The document link is invalid.")
  })

  it("retains the previous document link on a cancelled switch and clears it for a new document", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    history.replaceState({}, "", "/?open=local%3Aoriginal&other=keep")
    host.fileDirty = true
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal("confirm", confirm)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    await host.newDocument("document")
    expect(reload).not.toHaveBeenCalled()
    expect(new URL(location.href).searchParams.get("open")).toBe("local:original")
    confirm.mockReturnValue(true)
    await host.newDocument("document")
    expect(new URL(location.href).searchParams.has("open")).toBe(false)
    expect(new URL(location.href).searchParams.get("other")).toBe("keep")
  })

  it("keeps the size warning dismissed until a new editor is loaded", async () => {
    const {editor} = await mountEditor()
    const warning = editor.shadowRoot!.querySelector<HTMLElement>(".size-warning")!
    expect(warning.textContent).toContain("WebWriter may not work correctly at this size.")
    warning.querySelector<HTMLButtonElement>("button")!.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".size-warning")).toBeNull()
    editor.requestUpdate()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".size-warning")).toBeNull()
    // Happy DOM cannot resolve a focused iframe from another editor's shadow root.
    document.body.focus()
    const {editor: reloaded} = await mountEditor()
    expect(reloaded.shadowRoot!.querySelector(".size-warning")).not.toBeNull()
  })

  it.each([
    ["Macintosh; Intel Mac OS X 10_15_7", "Version/17.6 Safari/605.1.15", true],
    ["Macintosh; Intel Mac OS X 10_15_7", "Version/18.6 Safari/605.1.15", true],
    ["iPhone; CPU iPhone OS 18_6 like Mac OS X", "Version/18.6 Mobile/15E148 Safari/604.1", true],
    ["iPad; CPU OS 18_6 like Mac OS X", "Version/18.6 Mobile/15E148 Safari/604.1", true],
    ["Macintosh; Intel Mac OS X 10_15_7", "Version/26.0 Safari/605.1.15", false],
    ["iPhone; CPU iPhone OS 26_1 like Mac OS X", "Version/26.1 Mobile/15E148 Safari/604.1", false],
    ["Macintosh; Intel Mac OS X 10_15_7", "Version/27.0 Safari/605.1.15", false],
    ["Macintosh; Intel Mac OS X 10_15_7", "Chrome/130.0.0.0 Safari/537.36", false],
    ["iPhone; CPU iPhone OS 18_6 like Mac OS X", "CriOS/130.0.0.0 Mobile/15E148 Safari/604.1", false],
    ["iPhone; CPU iPhone OS 18_6 like Mac OS X", "FxiOS/130.0 Mobile/15E148 Safari/605.1.15", false],
    ["iPhone; CPU iPhone OS 18_6 like Mac OS X", "Version/18.6 EdgiOS/130.0 Mobile/15E148 Safari/605.1.15", false],
    ["iPhone; CPU iPhone OS 18_6 like Mac OS X", "Version/18.6 OPT/5.0 Mobile/15E148 Safari/605.1.15", false],
    ["Linux; Android 9", "Version/4.0 Safari/537.36", false],
    ["Macintosh; Intel Mac OS X 10_15_7", "Safari/605.1.15", false],
    ["Macintosh; Intel Mac OS X 10_15_7", "Version/unknown Safari/605.1.15", false],
  ])("shows the Safari warning only for outdated Safari (%s, %s)", async (platform, browser, visible) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(`Mozilla/5.0 (${platform}) AppleWebKit/605.1.15 (KHTML, like Gecko) ${browser}`)
    const {editor} = await mountEditor()
    const warning = editor.shadowRoot!.querySelector(".safari-warning")
    expect(Boolean(warning)).toBe(visible)
    if(visible) {
      expect(warning!.getAttribute("role")).toBe("status")
      expect(warning!.textContent).toContain("WebWriter may not work correctly in this outdated version of Safari.")
      expect(warning!.parentElement).toBe(editor.shadowRoot!.querySelector(".size-warning")!.parentElement)
      expect(warning!.nextElementSibling?.localName).toBe("app-ribbon")
    }
  })

  it("dismisses the Safari warning independently until a new editor is loaded", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Version/18.6 Safari/605.1.15")
    const {editor} = await mountEditor()
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Dismiss size warning"]')!.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".safari-warning")).not.toBeNull()
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Dismiss Safari warning"]')!.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".safari-warning")).toBeNull()
    editor.requestUpdate()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".safari-warning")).toBeNull()
    // Happy DOM cannot resolve a focused iframe from another editor's shadow root.
    document.body.focus()
    const {editor: reloaded} = await mountEditor()
    expect(reloaded.shadowRoot!.querySelector(".safari-warning")).not.toBeNull()
    reloaded.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Dismiss Safari warning"]')!.click()
    await reloaded.updateComplete
    expect(reloaded.shadowRoot!.querySelector(".size-warning")).not.toBeNull()
  })

  it("shows only accessible recently opened documents beside Layouts and in the Open submenu", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    await host.recentDocumentsReady
    host.backendSession = {apiBaseUrl: "https://storage.example/api", user: {id: "ada"}}
    const documents = Array.from({length: 12}, (_, index) => ({id: `doc-${index}`, title: `Lesson ${index}`, format: "html", updatedAt: "2026-09-10T12:00:00Z"}))
    host.backendClient = {listDocuments: vi.fn().mockResolvedValue(documents.slice())}
    host.savedDocuments = documents
    host.recentDocuments = documents.map((document, index) => ({id: `recent-${index}`, title: document.title, openedAt: 100 - index, kind: "backend", documentId: document.id, apiBaseUrl: host.backendSession.apiBaseUrl, userId: "ada"}))
    await host.refreshRecentDocuments()
    await editor.updateComplete
    const nav = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-documents")!
    const entries = [...nav.querySelectorAll<HTMLButtonElement>(".document-layout-document")]
    expect(entries.map(button => button.title)).toEqual(documents.slice(0, 10).map(document => document.title))
    expect(nav.previousElementSibling?.classList.contains("document-layout-cards")).toBe(true)
    expect(getComputedStyle(nav).position).toBe("relative")
    expect(getComputedStyle(nav.querySelector("ul")!).position).toBe("absolute")
    expect(getComputedStyle(nav.querySelector("ul")!).overflowY).toBe("auto")
    expect(editor.shadowRoot!.querySelector("#recent-documents-title .recent-documents-full-title")?.textContent).toBe("Recently opened")
    expect(editor.shadowRoot!.querySelector("#recent-documents-title .recent-documents-short-title")?.textContent).toBe("Recent")
    expect(nav.querySelector("h2")).toBeNull()
    expect(getComputedStyle(nav.querySelector("li:last-child")!).gridColumn).not.toBe("1 / -1")
    expect(editor.shadowRoot!.querySelector(".document-layouts-combined-title")?.textContent).toBe(" & Recently opened")
    expect(editor.shadowRoot!.querySelectorAll(".document-layout-cards .layout-preset-icon svg")).toHaveLength(4)
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    expect(ribbon.recentDocuments.map(document => document.title)).toEqual(entries.map(button => button.title))
    const open = vi.spyOn(host, "openBackendDocument").mockResolvedValue(undefined)
    entries[0].click()
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("doc-0"))
    const recentDocuments = host.recentDocuments
    host.recentDocuments = recentDocuments.slice(0, 1)
    await editor.updateComplete
    expect(getComputedStyle(nav.querySelector("li")!).gridColumn).toBe("1 / -1")
    host.recentDocuments = recentDocuments
    await editor.updateComplete
    host.fileOperationActive = true
    await editor.updateComplete
    expect([...nav.querySelectorAll<HTMLButtonElement>("button")].every(button => button.disabled)).toBe(true)
    host.backendSession = {...host.backendSession, user: {id: "grace"}}
    await editor.updateComplete
    await ribbon.updateComplete
    expect(ribbon.recentDocuments).toEqual([])
    expect(nav.textContent).toContain("No recently opened documents")
    host.backendSession = null
    await editor.updateComplete
    expect(nav.querySelector(".document-layout-document")).toBeNull()
  })

  it("does not show unopened saved documents or deleted cloud documents as recent", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    await host.recentDocumentsReady
    host.backendSession = {apiBaseUrl: "https://storage.example/api", user: {id: "ada"}}
    host.backendClient = {}
    host.savedDocuments = [{id: "unopened", title: "Unopened", format: "html", updatedAt: "2026-09-10T12:00:00Z"}]
    host.recentDocuments = [{id: "recent", title: "Deleted", openedAt: 1, kind: "backend", documentId: "deleted", apiBaseUrl: host.backendSession.apiBaseUrl, userId: "ada"}]
    await host.refreshRecentDocuments()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-layouts-documents")!.textContent).toContain("No recently opened documents")
  })

  it("remembers successful local opens, reopens stored handles and hides revoked access", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const file = new File(["<p>Local lesson</p>"], "Lesson.html", {type: "text/html"})
    const handle = {name: file.name, getFile: vi.fn().mockResolvedValue(file), createWritable: vi.fn(), queryPermission: vi.fn().mockResolvedValue("granted")}
    const picker = vi.fn().mockResolvedValue([handle])
    vi.stubGlobal("showOpenFilePicker", picker)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    await host.openDocument()
    expect(host.recentDocuments).toHaveLength(1)
    expect(host.recentDocuments[0]).toMatchObject({kind: "local", title: "Lesson.html", handle})
    const reference = new URL(location.href).searchParams.get("open")
    expect(reference).toBe(`local:${host.recentDocuments[0].id}`)
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    await editor.updateComplete
    editor.shadowRoot!.querySelector<HTMLButtonElement>(".document-layout-document")!.click()
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(host.fileOperationActive).toBe(false))
    expect(picker).toHaveBeenCalledOnce()
    expect(host.recentDocuments).toHaveLength(1)
    expect(new URL(location.href).searchParams.get("open")).toBe(reference)
    expect(host.storageLocation).toBe("local")
    handle.queryPermission.mockResolvedValue("denied")
    await host.refreshRecentDocuments()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-layout-document")).toBeNull()
    expect(editor.shadowRoot!.querySelector(".document-layouts-documents")!.textContent).toContain("No recently opened documents")
  })

  it("records cloud opens for their account and orders history by successful opening", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    await host.recentDocumentsReady
    host.backendSession = {apiBaseUrl: "https://storage.example/api", user: {id: "ada"}}
    host.backendClient = {getDocument: vi.fn().mockImplementation(async id => ({id, title: id, content: "<p>Cloud</p>", format: "html"}))}
    host.savedDocuments = ["first", "second"].map(id => ({id, title: id, format: "html", updatedAt: "2026-09-10T12:00:00Z"}))
    vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    await host.openBackendDocument("first")
    expect(host.storageLocation).toBe("development-server")
    await host.openBackendDocument("second")
    await host.openBackendDocument("first")
    expect(host.recentDocuments.map((document: {title: string}) => document.title)).toEqual(["first", "second"])
    expect(host.recentDocuments[0]).toMatchObject({kind: "backend", apiBaseUrl: "https://storage.example/api", userId: "ada"})
    host.backendClient = null
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-layout-document")).toBeNull()
  })

  it("does not add cancelled or failed local opens to recent history", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const picker = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{name: "Missing.html", getFile: vi.fn().mockRejectedValue(new Error("File not found"))}])
    vi.stubGlobal("showOpenFilePicker", picker)
    await host.openDocument()
    expect(host.recentDocuments).toEqual([])
    await host.openDocument()
    expect(host.recentDocuments).toEqual([])
    expect(host.fileError).toBe("File not found")
  })

  it("restores stored recent file handles after reload without restoring document contents", async () => {
    const file = new File(["<p>Saved file</p>"], "Lesson.html", {type: "text/html"})
    const handle = {name: file.name, getFile: vi.fn().mockResolvedValue(file), createWritable: vi.fn(), queryPermission: vi.fn().mockResolvedValue("granted")}
    vi.spyOn(recentDocumentStorage, "readRecentDocuments").mockResolvedValue([{id: "stored", title: file.name, openedAt: 1, kind: "local", handle}])
    const {editor} = await mountEditor()
    const host = editor as any
    await host.recentDocumentsReady
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector('.document-layout-document')?.getAttribute("title")).toBe("Lesson.html")
    expect(host.frameDocumentHTML).toBeNull()
    expect(host.fileHandle).toBeNull()
    handle.queryPermission.mockResolvedValue("prompt")
    const {editor: restored} = await mountEditor()
    await (restored as any).recentDocumentsReady
    await restored.updateComplete
    expect(restored.shadowRoot!.querySelector('.document-layout-document')).toBeNull()
  })

  it.each([true, false])("deletes saved documents without opening them (current: %s)", async current => {
    const {editor} = await mountEditor()
    const host = editor as any
    const summary = {id: "doc-1", title: "Lesson", format: "html", updatedAt: "2026-09-10T12:00:00Z"}
    const backend = {listDocuments: vi.fn().mockResolvedValue([summary]), deleteDocument: vi.fn().mockResolvedValue(undefined), getDocument: vi.fn()}
    host.backendClient = backend
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    host.backendDocumentId = current ? "doc-1" : "other"
    host.fileDirty = false
    const reload = vi.spyOn(host, "reloadDocument")
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    await host.openDocument()
    editor.shadowRoot!.querySelector("open-document-menu")!.dispatchEvent(new CustomEvent("document-delete", {detail: {id: "doc-1"}}))
    await vi.waitFor(() => expect(host.savedDocuments).toEqual([]))
    expect(backend.deleteDocument).toHaveBeenCalledWith("doc-1")
    expect(backend.getDocument).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(host.backendDocumentId).toBe(current ? null : "other")
    expect(host.fileDirty).toBe(current)
  })

  it("keeps a saved document listed when deletion is cancelled or fails", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const summary = {id: "doc-1", title: "Lesson", format: "html", updatedAt: "2026-09-10T12:00:00Z"}
    const backend = {listDocuments: vi.fn().mockResolvedValue([summary]), deleteDocument: vi.fn().mockRejectedValue(new Error("Delete failed"))}
    host.backendClient = backend
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    await host.openDocument()
    const menu = editor.shadowRoot!.querySelector("open-document-menu")!
    const confirm = vi.fn()
    vi.stubGlobal("confirm", confirm)
    confirm.mockReturnValue(false)
    menu.dispatchEvent(new CustomEvent("document-delete", {detail: {id: "doc-1"}}))
    expect(backend.deleteDocument).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    menu.dispatchEvent(new CustomEvent("document-delete", {detail: {id: "doc-1"}}))
    await vi.waitFor(() => expect(host.documentsError).toBe("Delete failed"))
    expect(host.savedDocuments).toEqual([summary])
    expect(host.fileOperationActive).toBe(false)
  })

  it("checks discard only on selection and preserves concurrent edits while opening saved documents", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    let finish!: (value: unknown) => void
    const getDocument = vi.fn(() => new Promise(resolve => { finish = resolve }))
    host.backendClient = {listDocuments: vi.fn().mockResolvedValue([{id: "doc-1", title: "Lesson", format: "html", updatedAt: "2026-09-10T12:00:00Z"}]), getDocument}
    host.storageLocation = "development-server"
    configureCloudStorage(host)
    host.fileDirty = true
    const confirm = vi.fn()
    vi.stubGlobal("confirm", confirm)
    confirm.mockReturnValue(false)
    const reload = vi.spyOn(host, "reloadDocument").mockResolvedValue(undefined)
    await host.openDocument()
    const menu = editor.shadowRoot!.querySelector("open-document-menu")!
    menu.dispatchEvent(new CustomEvent("document-open", {detail: {id: "doc-1"}}))
    await vi.waitFor(() => expect(host.fileOperationActive).toBe(false))
    expect(getDocument).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    menu.dispatchEvent(new CustomEvent("document-open", {detail: {id: "doc-1"}}))
    menu.dispatchEvent(new CustomEvent("document-open", {detail: {id: "doc-1"}}))
    expect(getDocument).toHaveBeenCalledTimes(1)
    host.documentChangeSequence++
    finish({id: "doc-1", content: "<p>Saved</p>"})
    await vi.waitFor(() => expect(host.documentsError).toContain("changed while opening"))
    expect(reload).not.toHaveBeenCalled()
    expect(host.fileDirty).toBe(true)
  })

  it("saves documents through the development backend by default after login", async () => {
    const {editor} = await mountEditor()
    const saved = {
      id: "doc-2",
      title: "Lesson",
      content: "<!DOCTYPE html><html><body><p>Saved remotely</p></body></html>",
      format: "html",
    }
    const backend = {listDocuments: vi.fn().mockResolvedValue([]), createDocument: vi.fn().mockResolvedValue(saved), updateDocument: vi.fn()}
    ;(editor as any).backendClient = backend
    ;(editor as any).storageLocation = "development-server"
    configureCloudStorage(editor as any)
    ;(editor as any).fileName = "Lesson"
    ;(editor as any).fileDirty = true
    mockSaveSnapshot(editor, saved.content)

    await (editor as any).saveDocument()

    expect(backend.createDocument).not.toHaveBeenCalled()
    const menu = editor.shadowRoot!.querySelector<OpenDocumentMenu>("open-document-menu")!
    expect(menu.mode).toBe("save")
    menu.dispatchEvent(new CustomEvent("document-save", {detail: {name: "Lesson.html"}}))
    await vi.waitFor(() => expect((editor as any).backendDocumentId).toBe("doc-2"))

    expect(backend.createDocument).toHaveBeenCalledWith({
      title: "Lesson",
      content: saved.content,
      format: "html",
    })
    expect((editor as any).backendDocumentId).toBe("doc-2")
    expect((editor as any).fileDirty).toBe(false)
    expect((editor as any).savedDocuments.map((document: {id: string}) => document.id)).toEqual(["doc-2"])
  })

  it("selects the offline format through Save as and suggests its compound extension", async () => {
    const {editor} = await mountEditor()
    const handle = {
      name: "lesson.offline.html",
      getFile: vi.fn(),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }
    const picker = vi.fn().mockResolvedValue(handle)
    vi.stubGlobal("showSaveFilePicker", picker)
    const execute = mockSaveSnapshot(editor, "<html></html>")

    await (editor as any).saveDocument(true, "offline")

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      types: [
        {description: "HTML document (.html)", accept: {"text/html": [".html", ".htm"]}},
        {description: "Offline HTML document (.offline.html)", accept: {"text/html": [".offline.html"]}},
      ],
    }))
    expect(picker.mock.calls[0][0]).not.toHaveProperty("suggestedName")
    expect(execute).toHaveBeenCalledWith({type: "prepareVersionSave", offline: true})
    expect((editor as any).fileName).toBe("lesson")
    expect((editor as any).fileFormat).toBe("offline")
  })

  it("requires confirmation before replacing a dirty document with a new one", async () => {
    const {editor} = await mountEditor()
    ;(editor as any).fileDirty = true
    const confirm = vi.fn().mockReturnValue(false)
    Object.defineProperty(window, "confirm", {configurable: true, value: confirm})
    const reload = vi.spyOn(editor as any, "reloadDocument").mockResolvedValue(undefined)

    await (editor as any).newDocument()

    expect(reload).not.toHaveBeenCalled()
    expect((editor as any).fileDirty).toBe(true)
  })

  it("prints only the iframe document", async () => {
    const {editor, editorWindow, iframe} = await mountEditor()
    const print = vi.fn()
    Object.defineProperty(editorWindow, "print", {configurable: true, value: print})

    ;(editor as any).printDocument()

    expect(print).toHaveBeenCalledTimes(1)
    expect(iframe.sandbox.contains("allow-modals")).toBe(true)
  })

  it.each(["Ctrl", "Meta", "Alt"])("prints the iframe from UI fields, widgets, and dialogs (%s)", async modifier => {
    const {editor, editorWindow, iframe} = await mountEditor()
    const host = editor as any
    host.settings = {...host.settings, shortcuts: {...host.settings.shortcuts, "document.print": `${modifier}+P`}}
    const print = vi.fn()
    Object.defineProperty(editorWindow, "print", {configurable: true, value: print})
    const outerPrint = vi.fn()
    vi.stubGlobal("print", outerPrint)
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const source = document.createElement("textarea")
    source.className = "html-source-input"
    source.value = "Selected source"
    const settings = document.createElement("settings-panel")
    const settingsButton = settings.appendChild(document.createElement("button"))
    editor.shadowRoot!.append(source, settings)
    const frameDocument = iframe.contentDocument!
    const input = frameDocument.body.appendChild(frameDocument.createElement("input"))
    const widget = frameDocument.body.appendChild(frameDocument.createElement("test-widget"))
    const widgetControl = widget.attachShadow({mode: "open"}).appendChild(frameDocument.createElement("button"))
    const appendix = frameDocument.body.shadowRoot ?? frameDocument.body.attachShadow({mode: "open"})
    const appendixControl = appendix.appendChild(frameDocument.createElement("input"))
    const targets = [ribbon, ribbon.shadowRoot!.querySelector<HTMLInputElement>(".ai-prompt-input")!, source,
      settingsButton, frameDocument.querySelector("p")!, input, widgetControl, appendixControl]
    const keydown = (target: EventTarget, repeat = false) => {
      const event = new KeyboardEvent("keydown", {key: "p", code: "KeyP", ctrlKey: modifier === "Ctrl",
        metaKey: modifier === "Meta", altKey: modifier === "Alt", bubbles: true, composed: true, cancelable: true, repeat})
      target.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    for(const target of targets) {
      expect(target).not.toBeNull()
      ;(target as HTMLElement).focus()
      if(target === source) source.select()
      keydown(target)
    }
    expect(source.selectionStart).toBe(0)
    expect(source.selectionEnd).toBe(source.value.length)
    expect(print).toHaveBeenCalledTimes(targets.length)
    keydown(source, true)
    expect(print).toHaveBeenCalledTimes(targets.length)

    const menu = editor.shadowRoot!.querySelector<OpenDocumentMenu>("open-document-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector("dialog")!.open = true
    keydown(menu)
    expect(print).toHaveBeenCalledTimes(targets.length + 1)
    expect(outerPrint).not.toHaveBeenCalled()

    editor.remove()
    const detached = new KeyboardEvent("keydown", {key: "p", code: "KeyP", ctrlKey: modifier === "Ctrl",
      metaKey: modifier === "Meta", altKey: modifier === "Alt", bubbles: true, cancelable: true})
    document.dispatchEvent(detached)
    expect(detached.defaultPrevented).toBe(false)
    expect(print).toHaveBeenCalledTimes(targets.length + 1)
  })

  it("routes printing from a UI field to the cross-origin editor frame", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.editorOpaque = true
    const control = vi.spyOn(host, "postFrameControl")
    const source = editor.shadowRoot!.appendChild(document.createElement("textarea"))
    const shortcut = host.settings.shortcuts["document.print"]
    const event = new KeyboardEvent("keydown", {key: "p", code: "KeyP", metaKey: shortcut.includes("Meta"),
      ctrlKey: shortcut.includes("Ctrl"), bubbles: true, composed: true, cancelable: true})

    source.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(control).toHaveBeenCalledWith("print")
  })

  it("prints the active preview document", async () => {
    const {editor, editorWindow} = await mountEditor()
    const editorPrint = vi.fn()
    const previewPrint = vi.fn()
    Object.defineProperty(editorWindow, "print", {configurable: true, value: editorPrint})
    vi.spyOn(editor as any, "postToPreview").mockImplementation((message: any) => {
      if(message.type === "preview-frame-print") previewPrint()
    })
    ;(editor as any).previewActive = true

    const source = editor.shadowRoot!.appendChild(document.createElement("textarea"))
    const shortcut = (editor as any).settings.shortcuts["document.print"]
    const event = new KeyboardEvent("keydown", {key: "p", code: "KeyP", metaKey: shortcut.includes("Meta"),
      ctrlKey: shortcut.includes("Ctrl"), bubbles: true, composed: true, cancelable: true})
    source.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(previewPrint).toHaveBeenCalledTimes(1)
    expect(editorPrint).not.toHaveBeenCalled()
  })

  it("downloads the serialized document with the current file name", async () => {
    const {editor} = await mountEditor()
    const execute = mockSaveSnapshot(editor, "<!DOCTYPE html><html><body><p>Downloaded</p></body></html>")
    vi.stubGlobal("showSaveFilePicker", undefined)
    vi.stubGlobal("prompt", vi.fn().mockReturnValue("lesson.html"))
    const createObjectURL = vi.fn().mockReturnValue("blob:test")
    const revokeObjectURL = vi.fn()
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL)
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL)
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    ;(editor as any).fileName = "lesson"

    await (editor as any).downloadDocument()

    expect(execute).toHaveBeenCalledWith({type: "prepareVersionSave", offline: false})
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:test"))
  })
})

describe("DomEditor.execute()", () => {
  it("reuses unchanged HTML highlighting on reopen and refreshes changed source", async () => {
    const {editor} = await mountEditor()
    let source = "<p>Hello</p>"
    let holdSource = false
    let resolveSource: ((value: any) => void) | undefined
    vi.spyOn(editor, "execute").mockImplementation(async action => action.type === "beginHTMLSelectionEdit"
      ? holdSource ? new Promise(resolve => {resolveSource = resolve}) : {html: source} as any
      : true)
    const host = editor as any
    await host.setHTMLMode(true)
    await editor.updateComplete
    const highlight = editor.shadowRoot!.querySelector(".html-source-highlight")!
    const token = highlight.querySelector(".tag")!
    expect(token.textContent).toBe("<p")
    await host.setHTMLMode(false)
    await editor.updateComplete
    holdSource = true
    const reopening = host.setHTMLMode(true)
    await editor.updateComplete
    expect(highlight.querySelector(".tag")).toBeNull()
    resolveSource!({html: source})
    await reopening
    holdSource = false
    await editor.updateComplete
    expect(highlight.querySelector(".tag")).toBe(token)
    expect(highlight.textContent).toBe(source + "\n")
    await host.setHTMLMode(false)
    source = "<section>Changed</section>"
    await host.setHTMLMode(true)
    await editor.updateComplete
    expect(highlight.textContent).toBe(source + "\n")
    expect(editor.shadowRoot!.querySelector<HTMLTextAreaElement>(".html-source-input")!.value).toBe(source)
  })

  it("leaves document highlighting and selection alone while hovering, focusing, and refreshing HTML source", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({html: "<p>Hello</p>"} as any)
    const restore = vi.spyOn(editor as any, "restoreEditorSelection")
    const host = editor as any
    await host.setHTMLMode(true)
    await editor.updateComplete
    execute.mockClear()
    const input = editor.shadowRoot!.querySelector<HTMLTextAreaElement>(".html-source-input")!
    input.dispatchEvent(new MouseEvent("mouseenter"))
    input.dispatchEvent(new FocusEvent("focus"))
    input.dispatchEvent(new MouseEvent("mouseleave"))
    for(let i = 0; i < 3; i++) await host.refreshHTMLSource()
    input.dispatchEvent(new FocusEvent("blur"))
    expect(execute.mock.calls.map(([action]) => action.type)).toEqual(Array(3).fill("beginHTMLSelectionEdit"))
    expect(restore).not.toHaveBeenCalled()
    expect(input.value).toBe("<p>Hello</p>")
    await host.setHTMLMode(false)
    expect(execute).toHaveBeenLastCalledWith({type: "discardHTMLSelectionEdit"})
  })

  it("loads indented HTML as the clean baseline and leaves typing untouched", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({html: '<div><p>Hello <b>world</b></p></div>'} as any)
    await (editor as any).setHTMLMode(true)
    const formatted = '<div>\n  <p>Hello <b>world</b></p>\n</div>'
    expect((editor as any).htmlSource).toBe(formatted)
    expect((editor as any).htmlOriginalSource).toBe(formatted)
    expect((editor as any).htmlPending).toBe(false)
    await editor.updateComplete
    const input = editor.shadowRoot!.querySelector<HTMLTextAreaElement>(".html-source-input")!
    const draft = '<div><p>Edited'
    input.value = draft
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    expect((editor as any).htmlSource).toBe(draft)
    expect((editor as any).htmlPending).toBe(true)
    expect(execute).toHaveBeenCalledWith({type: "setHTMLSelectionEditPending", pending: true})
    input.value = formatted
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    expect((editor as any).htmlPending).toBe(false)
  })

  it("shows the HTML view in a fixed-height console below the editor and toolbox", async () => {
    const {editor} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue({html: "<p>Hello</p>"} as any)
    const root = editor.shadowRoot!
    const panel = root.querySelector<HTMLElement>(".bottom-detail-panel")!
    expect(panel.previousElementSibling?.localName).toBe("dom-editor-toolbox")
    expect(getComputedStyle(panel).gridRow).toBe("4")
    expect(getComputedStyle(panel).gridColumn).toBe("1 / -1")
    expect(panel.inert).toBe(true)
    expect(getComputedStyle(panel).gridTemplateRows).toBe("0fr")
    expect(getComputedStyle(panel).transition).not.toContain("grid-template-rows")
    expect(getComputedStyle(editor).overflow).toBe("clip")
    await (editor as any).setHTMLMode(true)
    await editor.updateComplete
    expect(panel.inert).toBe(false)
    expect(panel.getAttribute("aria-hidden")).toBeNull()
    expect(getComputedStyle(panel).gridTemplateRows).toBe("1fr")
    expect(panel.textContent).not.toContain("Selected HTML")
    expect(getComputedStyle(root.querySelector(".html-source-editor")!).height).toBe("300px")
    expect(getComputedStyle(root.querySelector(".html-source-field")!).height).toBe("100%")
    const input = root.querySelector<HTMLTextAreaElement>(".html-source-input")!
    const highlight = root.querySelector<HTMLElement>(".html-source-highlight")!
    expect(input.value).toBe("<p>Hello</p>")
    expect(input.getAttribute("wrap")).toBeNull()
    for(const element of [input, highlight]) {
      expect(getComputedStyle(element).whiteSpace).toBe("pre-wrap")
      expect(getComputedStyle(element).overflowWrap).toBe("anywhere")
      expect(getComputedStyle(element).overflowX).toBe("hidden")
    }
    await (editor as any).setHTMLMode(false)
    await editor.updateComplete
    expect(root.querySelector(".bottom-detail-panel")).toBe(panel)
    expect(panel.inert).toBe(true)
    expect(panel.getAttribute("aria-hidden")).toBeNull()
  })

  it("refreshes HTML source colors on input and external updates without replacing the textarea", async () => {
    const {editor} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue({html: '<p title="hello">Text</p>'} as any)
    await (editor as any).setHTMLMode(true)
    await editor.updateComplete
    const root = editor.shadowRoot!
    const input = root.querySelector<HTMLTextAreaElement>(".html-source-input")!
    const highlight = root.querySelector<HTMLElement>(".html-source-highlight")!
    expect(highlight.textContent).toBe('<p title="hello">Text</p>\n')
    expect(highlight.querySelector(".attribute")?.textContent).toBe("title")
    input.focus()
    input.value = '<my-widget label="unfinished'
    input.setSelectionRange(12, 12)
    input.dispatchEvent(new InputEvent("input", {bubbles: true, isComposing: true}))
    await editor.updateComplete
    expect(root.querySelector(".html-source-input")).toBe(input)
    expect(root.activeElement).toBe(input)
    expect(input.selectionStart).toBe(12)
    expect(highlight.textContent).toBe(input.value + "\n")
    expect(highlight.querySelector(".value")?.textContent).toBe('"unfinished')
    input.scrollTop = 24
    input.scrollLeft = 40
    input.dispatchEvent(new Event("scroll"))
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(highlight.scrollTop).toBe(24)
    expect(highlight.scrollLeft).toBe(40)
    ;(editor as any).htmlSource = '<img src=x onerror="alert(1)">\n'
    await editor.updateComplete
    expect(input.value).toBe((editor as any).htmlSource)
    expect(highlight.textContent).toBe((editor as any).htmlSource + "\n")
    expect(highlight.querySelector("img")).toBeNull()
    expect(highlight.getAttribute("aria-hidden")).toBe("true")
  })

  it("colors large source with bounded native ranges while retaining exact text, input identity and selection", async () => {
    const highlights = new Map<string, Set<Range>>()
    vi.stubGlobal("CSS", Object.assign(Object.create(CSS), {highlights}))
    vi.stubGlobal("Highlight", class extends Set<Range> {})
    const {editor} = await mountEditor()
    const source = Array.from({length: 1000}, (_, index) => `<p title="${index}">Line ${index} &amp; text</p>`).join("\n")
    vi.spyOn(editor, "execute").mockResolvedValue({html: source} as any)
    const host = editor as any
    await host.setHTMLMode(true)
    await editor.updateComplete
    await new Promise(resolve => requestAnimationFrame(resolve))
    const input = editor.shadowRoot!.querySelector<HTMLTextAreaElement>(".html-source-input")!
    const highlight = editor.shadowRoot!.querySelector<HTMLElement>(".html-source-highlight")!
    input.setSelectionRange(30000, 30010)
    expect(input.value).toBe(source)
    expect(highlight.textContent).toBe(source + "\n")
    expect(highlight.querySelectorAll("span")).toHaveLength(0)
    const ranges = Array.from(highlights.values()).flatMap(ranges => Array.from(ranges))
    expect(ranges.length).toBeGreaterThan(0)
    expect(ranges.length).toBeLessThan(2000)
    expect(ranges.every(range => highlight.contains(range.startContainer) && range.toString().length > 0)).toBe(true)
    const text = ranges[0].startContainer
    input.scrollTop = 40
    input.dispatchEvent(new Event("scroll"))
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(highlight.textContent).toBe(source + "\n")
    expect(highlight.contains(text)).toBe(true)
    expect(editor.shadowRoot!.querySelector(".html-source-input")).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([30000, 30010])
    const colors = highlights.get("webwriter-html-tag")
    input.value = source.slice(0, 30000) + "x" + source.slice(30010)
    input.setSelectionRange(30001, 30001)
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await editor.updateComplete
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(highlight.textContent).toBe(input.value + "\n")
    expect(highlights.get("webwriter-html-tag")).toBe(colors)
    expect(input.selectionStart).toBe(30001)
    editor.remove()
    expect(highlights.size).toBe(0)
  })

  it("retains large-source syntax colors when native highlights are unavailable", async () => {
    vi.stubGlobal("Highlight", undefined)
    const {editor} = await mountEditor()
    const source = Array.from({length: 700}, () => '<p title="plain">Text &amp; more</p>').join("\n")
    vi.spyOn(editor, "execute").mockResolvedValue({html: source} as any)
    await (editor as any).setHTMLMode(true)
    await editor.updateComplete
    const highlight = editor.shadowRoot!.querySelector<HTMLElement>(".html-source-highlight")!
    expect(highlight.textContent).toBe(source + "\n")
    expect(highlight.querySelector(".attribute")?.textContent).toBe("title")
  })

  it("posts an action and resolves with the completion result", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const postMessage = vi.spyOn(editorWindow, "postMessage").mockImplementation((message: any) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: executeCompleteEvent,
          detail: {requestId: message.requestId, result: "done"},
        },
        source: editorWindow,
      }))
    })
    const completed = vi.fn()
    editor.addEventListener(executeCompleteEvent, completed)

    await expect(editor.execute({type: "lift"})).resolves.toBe("done")
    expect(postMessage).toHaveBeenCalledWith({type: "lift", requestId: "1", bridgeNonce: expect.any(String)}, window.location.origin)
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({detail: {requestId: "1", result: "done"}}))
    expect(editor.shadowRoot?.contains(iframe)).toBe(true)
  })

  it("rejects with the error returned by the inner editor", async () => {
    const {editor, editorWindow} = await mountEditor()
    vi.spyOn(editorWindow, "postMessage").mockImplementation((message: any) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: executeFailureEvent,
          detail: {
            requestId: message.requestId,
            error: {name: "NotAllowedError", message: "Clipboard access denied"},
          },
        },
        source: editorWindow,
      }))
    })

    await expect(editor.execute({type: "copy"})).rejects.toMatchObject({
      name: "NotAllowedError",
      message: "Clipboard access denied",
    })
  })

  it("waits for package resources before posting an action", async () => {
    const editor = new DomEditor()
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    const editorWindow = iframe.contentWindow!
    const postMessage = vi.spyOn(editorWindow, "postMessage").mockImplementation(() => undefined)
    const execution = editor.execute({type: "lift"})
    iframe.dispatchEvent(new Event("load"))

    const loadCall = postMessage.mock.calls.find(([message]) => message?.type === loadWidgetsMessage)
    expect(loadCall).toBeDefined()
    expect(postMessage.mock.calls.some(([message]) => message?.type === "lift")).toBe(false)

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: executeCompleteEvent,
        detail: {requestId: loadCall![0].requestId, result: undefined},
        bridgeNonce: loadCall![0].bridgeNonce,
      },
      source: editorWindow,
      origin: window.location.origin,
    }))
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({type: "lift", requestId: expect.any(String)}),
      expect.any(String),
    ))

    const actionCall = postMessage.mock.calls.find(([message]) => message?.type === "lift")!
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: executeCompleteEvent,
        detail: {requestId: actionCall[0].requestId, result: "done"},
        bridgeNonce: actionCall[0].bridgeNonce,
      },
      source: editorWindow,
      origin: window.location.origin,
    }))
    await expect(execution).resolves.toBe("done")
  })

  it("reports a failed package load but allows subsequent snapshots for saving and refresh", async () => {
    const editor = new DomEditor()
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    const editorWindow = iframe.contentWindow!
    const postMessage = vi.spyOn(editorWindow, "postMessage").mockImplementation(() => undefined)
    const execution = editor.execute({type: "lift"})
    iframe.dispatchEvent(new Event("load"))

    const loadCall = postMessage.mock.calls.find(([message]) => message?.type === loadWidgetsMessage)
    expect(loadCall).toBeDefined()
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: executeFailureEvent,
        detail: {
          requestId: loadCall![0].requestId,
          error: {name: "NetworkError", message: "widget script failed to load"},
        },
        bridgeNonce: loadCall![0].bridgeNonce,
      },
      source: editorWindow,
      origin: window.location.origin,
    }))

    await expect(execution).rejects.toMatchObject({
      name: "NetworkError",
      message: "widget script failed to load",
    })
    expect((editor as any).packageError).toBe("widget script failed to load")
    const snapshot = editor.execute({type: "snapshotState"})
    await vi.waitFor(() => expect(postMessage.mock.calls.some(([message]) => message.type === "snapshotState")).toBe(true))
    const snapshotCall = postMessage.mock.calls.find(([message]) => message.type === "snapshotState")![0]
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: executeCompleteEvent, detail: {requestId: snapshotCall.requestId, result: {update: []}}, bridgeNonce: snapshotCall.bridgeNonce},
      source: editorWindow,
      origin: window.location.origin,
    }))
    await expect(snapshot).resolves.toEqual({update: []})
  })

  it("does not post an action aborted while the editor frame is initializing", async () => {
    const editor = new DomEditor()
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    await editor.updateComplete
    const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    const postMessage = wirePackageLoadCompletion(iframe.contentWindow!)
    const controller = new AbortController()

    const execution = editor.execute({type: "lift"}, {signal: controller.signal})
    controller.abort(new DOMException("Cancelled", "AbortError"))
    iframe.dispatchEvent(new Event("load"))

    await expect(execution).rejects.toMatchObject({name: "AbortError"})
    expect(postMessage.mock.calls.some(([message]) => message?.type === "lift")).toBe(false)
  })

  it("rejects an action when the editor does not answer before the deadline", async () => {
    const {editor, editorWindow} = await mountEditor()
    vi.spyOn(editorWindow, "postMessage").mockImplementation(() => undefined)
    vi.useFakeTimers()
    try {
      const execution = editor.execute({type: "lift"})
      const rejection = expect(execution).rejects.toThrow("did not respond in time")
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(15_000)
      await rejection
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("inserts a paragraph from the Start ribbon", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()

    expect(execute).toHaveBeenCalledWith({type: "insertElement", tag: "p"})
  })

  it("does not open or switch the toolbox for inserted elements or video warnings", async () => {
    const {editor, editorWindow} = await mountEditor()
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const details = [
      {path: [{path: [], name: "Document"}, {path: [0], name: "Image"}], nodeSelected: true,
        inserted: true, media: {type: "picture", attributes: {alt: "Diagram"}}},
      {path: [{path: [], name: "Document"}, {path: [1], name: "Widget", icon: "Packages"}], nodeSelected: true, inserted: true},
      {path: [{path: [], name: "Document"}, {path: [2], name: "Video"}], nodeSelected: true,
        media: {type: "video", attributes: {src: "movie.mp4"}, videoPlaybackWarning: "unsupported"}},
    ]
    for(const activeTool of [null, "AI"] as const) {
      toolbox.selectTool(activeTool)
      for(const detail of details) {
        window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: selectionChangeEvent, detail}}))
        await editor.updateComplete
        await toolbox.updateComplete
        expect(toolbox.activeTool).toBe(activeTool)
      }
    }
  })

  it("does not expand a collapsed toolbox for a video warning", async () => {
    const {editor, editorWindow} = await mountEditor()
    const host = editor as any
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    host.narrowLayout = true
    host.mathSelection = {active: true, display: "inline"}
    toolbox.selectTool("Edit")
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.collapsed).toBe(true)
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: selectionChangeEvent, detail: {
      path: [{path: [], name: "Document"}, {path: [0], name: "Video"}], nodeSelected: true,
      media: {type: "video", attributes: {src: "movie.mp4"}, videoPlaybackWarning: "unsupported"},
      math: {active: true, display: "inline"},
    }}}))
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolbox.collapsed).toBe(true)
    expect(host.mathKeyboardHidden).toBe(false)
  })

  it("does not auto-open contextual tools while collapsed, even with the breadcrumb shown", async () => {
    const {editor, editorWindow} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    ribbon.expanded = false
    await ribbon.updateComplete
    await editor.updateComplete
    for(const visible of [false, true]) {
      ribbon.dispatchEvent(new CustomEvent("breadcrumb-visibility-change", {detail: {visible}}))
      await editor.updateComplete
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {
          inserted: true,
          path: [{path: [], name: "Document"}, {path: [0], name: "Image"}],
          nodeSelected: true,
          media: {type: "picture", attributes: {alt: "Diagram"}},
        }}, source: editorWindow,
      }))
      await editor.updateComplete
      expect(toolbox.activeTool).toBeNull()
      expect(toolbox.hidden).toBe(!visible)
    }
  })

  it("refreshes inline styles when Edit opens and the selected element changes", async () => {
    const {editor, editorWindow} = await mountEditor()
    let width: string | null = "120px"
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "getStyleState") return {
        target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
        inline: width ? {width: {value: width, priority: ""}} : {},
        authoredProperties: width ? ["width", "margin", "margin-top", 1] : [],
        computed: {width: "300px"}, context: {display: "block", parentDisplay: "block", floatLeftForcedRight: width === "120px", floatRightInFlow: width === "240px"},
      }
    })
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool(null)
    toolbox.selectTool("Edit")
    await vi.waitFor(() => expect(toolbox.elementStyle.inline.width?.value).toBe("120px"))
    expect(toolbox.elementStyle.context.floatLeftForcedRight).toBe(true)
    expect(toolbox.elementStyle.authoredProperties).toEqual(["width", "margin", "margin-top"])
    width = "240px"
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}, {path: [1], name: "Paragraph"}]}},
      source: editorWindow,
    }))
    await vi.waitFor(() => expect(toolbox.elementStyle.inline.width?.value).toBe("240px"))
    expect(toolbox.elementStyle.context.floatLeftForcedRight).toBe(false)
    expect(toolbox.elementStyle.context.floatRightInFlow).toBe(true)
    width = null
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}, {path: [2], name: "Paragraph"}]}},
      source: editorWindow,
    }))
    await vi.waitFor(() => expect(toolbox.elementStyle.inline.width).toBeUndefined())
    expect(toolbox.elementStyle.authoredProperties).toEqual([])
    expect(execute.mock.calls.filter(([action]) => action.type === "getStyleState").length).toBeGreaterThanOrEqual(3)
  })

  it("styles the selected media figure through the regular Style drawer", async () => {
    const {editor, editorWindow} = await mountEditor()
    const figure = {
      target: {localName: "figure", namespaceURI: "http://www.w3.org/1999/xhtml"},
      inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"},
    }
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "getStyleState") return figure
    })
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool(null)
    toolbox.selectTool("Edit")
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}, {path: [0], name: "Figure"}], nodeSelected: true}},
      source: editorWindow,
    }))
    await (editor as any).refreshElementStyleState()
    await editor.updateComplete
    await vi.waitFor(() => expect(toolbox.elementStyle.target?.localName).toBe("figure"))
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<HTMLElement>('ribbon-drawer[label="Style"]')!
    expect(drawer.querySelector('[aria-label="Style target"]')).toBeNull()
    const control = drawer.querySelector<HTMLElement>("element-style-editor")!
    control.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {styles: {"background-color": "green"}}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setStyle", styles: {"background-color": "green"}, topLevel: true})
  })

  it("keeps the popup content Style target through the bridge and sends a scoped preset", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "getStyleState") return {
        target: {localName: "div", namespaceURI: "http://www.w3.org/1999/xhtml", popupRole: "content"},
        inline: {}, computed: {}, context: {display: "flex", parentDisplay: "block"},
      }
    })
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool(null); toolbox.selectTool("Edit")
    await vi.waitFor(() => expect(toolbox.elementStyle.target?.popupRole).toBe("content"))
    await toolbox.updateComplete
    const styleEditor = toolbox.shadowRoot!.querySelector<ElementStyleEditor>('ribbon-drawer[label="Style"] element-style-editor[show-presets]')!
    await styleEditor.updateComplete
    styleEditor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Blue style preset"]')!.click()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setStyle", topLevel: true, boxPreset: true,
      styles: expect.objectContaining({"background-color": expect.any(Object), "box-shadow": expect.any(Object)})}))
    const command = execute.mock.calls.find(([action]) => action.type === "setStyle")![0]
    if(command.type !== "setStyle") throw new Error("The preset did not set styles")
    expect(Object.keys(command.styles)).not.toContain("padding")
    expect(Object.keys(command.styles)).not.toContain("border-radius")
  })

  it("retains board grouping state through the bridge and routes grouping commands from the style drawer", async () => {
    const {editor} = await mountEditor()
    const grouping = {grouped: false, canCreate: true, canUngroup: true, canJoinLeft: true, canJoinRight: false}
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "getStyleState") return {target: {localName: "section", namespaceURI: "http://www.w3.org/1999/xhtml", grouping},
        inline: {}, computed: {}, context: {display: "flex", parentDisplay: "flex"}}
    })
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool(null); toolbox.selectTool("Edit")
    await vi.waitFor(() => expect(toolbox.elementStyle.target?.grouping).toEqual(grouping))
    toolbox.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "setBoardGrouping", mode: "left"}, bubbles: true, composed: true}))
    expect(execute).toHaveBeenCalledWith({type: "setBoardGrouping", mode: "left"})
  })

  it("applies a box preset in one style command", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const styles = {
      "background-color": {value: "#deebf7", priority: ""},
      "border-width": {value: "1px", priority: ""},
      "border-style": {value: "solid", priority: ""},
      "border-color": {value: "#5b9bd5", priority: ""},
    }
    toolbox.dispatchEvent(new CustomEvent("element-style-change", {detail: {styles}, bubbles: true, composed: true}))
    expect(execute.mock.calls.filter(([action]) => action.type === "setStyle")).toEqual([[{type: "setStyle", styles}]])
  })

  it("routes every Edit toolbox style command to the top-level container", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    for(const detail of [
      {styles: {padding: "4px"}},
      {styles: {"text-align": "center"}},
      {styles: {color: "red"}, selectionType: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}},
    ]) {
      toolbox.dispatchEvent(new CustomEvent("element-style-change", {detail, bubbles: true, composed: true}))
      expect(execute).toHaveBeenCalledWith({type: "setStyle", topLevel: true, styles: detail.styles})
    }
    await (editor as any).refreshElementStyleState()
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "getStyleState", topLevel: true}))
  })

  it("preserves Fill viewport state across the frame bridge and forwards its toggle", async () => {
    const {editor} = await mountEditor()
    const style = {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml", fillViewport: true, canFillViewport: true}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => action.type === "getStyleState" ? style : undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    await (editor as any).refreshElementStyleState()
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.elementStyle.target).toMatchObject({fillViewport: true, canFillViewport: true})
    toolbox.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "setFillViewport", enabled: false}}))
    expect(execute).toHaveBeenCalledWith({type: "setFillViewport", enabled: false})
  })

  it("routes media crop fields to the selected media instead of its top-level container", async () => {
    const {editor} = await mountEditor()
    const style = {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => action.type === "getStyleState" ? style : undefined)
    Object.assign(editor, {mediaSelection: {type: "picture", attributes: {style: "object-view-box: inset(10%)"}}, elementStyle: style})
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    await editor.updateComplete
    await toolbox.updateComplete
    const field = toolbox.shadowRoot!.querySelector('[data-specialized="picture"] element-style-editor')!
    field.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {property: "object-view-box", mutation: {value: "inset(20%)", priority: ""}}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setMediaCrop", crop: {value: "inset(20%)", priority: ""}})
    expect(execute.mock.calls.some(([action]) => action.type === "setStyle")).toBe(false)
  })

  it("loads Style-pane state lazily and routes inline style changes", async () => {
    const {editor} = await mountEditor()
    let display = "block"
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "getStyleState") return {
        target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"},
        inline: display === "block" ? {} : {display: {value: display, priority: ""}},
        computed: {display},
        context: {display, parentDisplay: "block"},
      }
      if(action.type === "setStyle") {
        const mutation = action.styles.display
        display = typeof mutation === "string" ? mutation : mutation?.value ?? "block"
      }
    })
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.showStyleToolbox = true
    await toolbox.updateComplete
    const styleButton = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Style"]')!

    expect(toolbox.elementStyle.target).toBeNull()
    toolbox.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {property: "display", mutation: {value: "flex", priority: ""}},
      bubbles: true,
      composed: true,
    }))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "setStyle",
      styles: {display: {value: "flex", priority: ""}},
    }))

    styleButton.click()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "getStyleState",
      properties: expect.arrayContaining(["display", "width", "color", "cursor"]),
    })))
    await (editor as any).refreshElementStyleState()
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.elementStyle.target?.localName).toBe("p")

    const position = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Position & Form"]')!
    const basic = position.querySelector("element-style-editor")!
    await basic.updateComplete
    const fieldset = basic.shadowRoot!.querySelector<HTMLFieldSetElement>("fieldset")!
    expect(fieldset.disabled).toBe(false)

    fieldset.dispatchEvent(new MouseEvent("mouseenter"))
    fieldset.dispatchEvent(new MouseEvent("mouseleave"))
    expect(execute).toHaveBeenCalledWith({type: "hoverStyleTarget", hovered: true})
    expect(execute).toHaveBeenCalledWith({type: "hoverStyleTarget", hovered: false})

    toolbox.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {property: "display", mutation: {value: "grid", priority: ""}},
      bubbles: true,
      composed: true,
    }))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "setStyle",
      styles: {display: {value: "grid", priority: ""}},
    }))
    await vi.waitFor(() => expect(toolbox.elementStyle.inline.display?.value).toBe("grid"))

    toolbox.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {property: "text-align", mutation: "center"},
      bubbles: true,
      composed: true,
    }))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "setBlockStyle",
      styles: {"text-align": "center"},
    }))
  })

  it("pins selected HTML persistently and inserts saved user snippets through the normal insertion command", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({html: '<p class="authored">First</p>', label: "First"})
    const action = (label: string) => editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label}, bubbles: true, composed: true}))
    action("pin-snippet")
    await vi.waitFor(() => expect(loadAppSettings().userSnippets).toHaveLength(1))
    expect(execute).toHaveBeenCalledWith({type: "getSnippet"})
    execute.mockResolvedValue({html: "<section>Second</section>", label: "Second"})
    action("pin-snippet")
    await vi.waitFor(() => expect(loadAppSettings().userSnippets).toHaveLength(2))
    const snippets = loadAppSettings().userSnippets
    expect(snippets.map(snippet => snippet.label)).toEqual(["Second", "First"])
    expect(snippets[0].id).not.toBe(snippets[1].id)
    execute.mockResolvedValue(undefined)
    action(`user-snippet:${snippets[1].id}`)
    await vi.waitFor(() => expect(execute).toHaveBeenLastCalledWith({type: "insert", html: '<p class="authored">First</p>'}))
    expect(loadAppSettings().userSnippets).toEqual(snippets)
    execute.mockClear()
    action(`remove-user-snippet:${snippets[1].id}`)
    expect(loadAppSettings().userSnippets).toEqual([snippets[0]])
    action(`remove-user-snippet:${snippets[0].id}`)
    expect(loadAppSettings().userSnippets).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    [true, "Enter", "icon"], [true, "blur", "icon"], [false, "Enter", "icon"], [false, "blur", "icon"],
    [true, "Enter", "menu"], [true, "blur", "menu"], [false, "Enter", "menu"], [false, "blur", "menu"],
    [true, "button", "icon"], [false, "button", "icon"], [true, "button", "menu"], [false, "button", "menu"],
  ] as const)("names newly added snippets inline with expanded=%s, confirmation=%s, and source=%s", async (expanded, confirmation, source) => {
    const {editor} = await mountEditor()
    const focusEditor = vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({html: "<p>Selected content</p>", label: "Selected content"})
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.expanded = expanded
    ribbon.menuOpen = !expanded
    await ribbon.updateComplete

    let controls: RibbonButton | RibbonMenu
    if(expanded) {
      controls = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Snippets"]')!
    }
    else {
      const root = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
      await root.updateComplete
      root.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
      await root.updateComplete
      controls = root.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    }
    await controls.updateComplete
    if(source === "icon") controls.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Add snippet"]')!.click()
    else {
      controls.shadowRoot!.querySelector<HTMLButtonElement>(expanded ? ".main-button" : '[title="Snippets"]')!.click()
      await controls.updateComplete
      const menu = controls.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
      await menu.updateComplete
      menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Add snippet"]')!.click()
    }

    const nameInput = () => controls.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")?.shadowRoot?.querySelector<HTMLTextAreaElement>(".item-label-input")
    await vi.waitFor(() => expect(nameInput()).toBeTruthy())
    const input = nameInput()!
    expect((input.getRootNode() as ShadowRoot).activeElement).toBe(input)
    expect(input.value).toBe("Selected content")
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length])
    expect(input.closest("button")).toBeNull()
    expect(getComputedStyle(input).borderWidth).toBe("0px")
    expect(getComputedStyle(input).backgroundColor).toBe("transparent")
    expect(getComputedStyle(input).overflow).toBe("hidden")
    const menu = controls.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    const confirm = menu.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Confirm snippet name"]')!
    expect(confirm).not.toBeNull()
    expect(menu.shadowRoot!.querySelector('[aria-label="Remove Selected content"]')).toBeNull()
    focusEditor.mockClear()

    input.value = "My lesson example"
    if(confirmation === "Enter") {
      const enter = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
      input.dispatchEvent(enter)
      expect(enter.defaultPrevented).toBe(true)
    }
    else if(confirmation === "button") {
      const down = new PointerEvent("pointerdown", {bubbles: true, composed: true, cancelable: true})
      confirm.dispatchEvent(down)
      expect(down.defaultPrevented).toBe(true)
      expect(menu.shadowRoot!.activeElement).toBe(input)
      confirm.click()
    }
    else input.blur()
    await vi.waitFor(() => expect(loadAppSettings().userSnippets[0]?.label).toBe("My lesson example"))
    await vi.waitFor(() => expect(nameInput()).toBeNull())
    expect(focusEditor).not.toHaveBeenCalledWith(true)
    expect(controls.shadowRoot!.querySelector<HTMLButtonElement>(expanded ? ".main-button" : '[title="Snippets"]')!.getAttribute("aria-expanded")).toBe("true")
    if(!expanded) expect(ribbon.menuOpen).toBe(true)
    expect(menu.shadowRoot!.querySelector('[aria-label="Confirm snippet name"]')).toBeNull()
    expect(menu.shadowRoot!.querySelector('[aria-label="Remove My lesson example"]')).not.toBeNull()
    if(confirmation !== "blur") expect(menu.shadowRoot!.activeElement).toBe(menu.shadowRoot!.querySelector('[title="My lesson example"]'))
    expect(loadAppSettings().userSnippets[0].html).toBe("<p>Selected content</p>")
    expect(execute).toHaveBeenCalledWith({type: "getSnippet"})
    expect(execute.mock.calls.some(([action]) => action.type === "insert")).toBe(false)
  })

  it("saves a pending name before another add and ignores confirmation of a removed snippet", async () => {
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const getSnippet = vi.fn()
      .mockResolvedValueOnce({html: "<p>First</p>", label: "First"})
      .mockResolvedValueOnce({html: "<p>Second</p>", label: "Second"})
    vi.spyOn(editor, "execute").mockImplementation(async action => action.type === "getSnippet" ? getSnippet() : undefined)
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const snippets = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Snippets"]')!
    await snippets.updateComplete
    const add = snippets.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Add snippet"]')!
    const menu = () => snippets.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    const nameInput = () => menu().shadowRoot?.querySelector<HTMLTextAreaElement>("textarea")
    add.click()
    await vi.waitFor(() => expect(nameInput()?.value).toBe("First"))
    nameInput()!.value = "First renamed"
    add.click()
    await vi.waitFor(() => expect(nameInput()?.value).toBe("Second"))
    expect(loadAppSettings().userSnippets.map(snippet => snippet.label)).toEqual(["Second", "First renamed"])
    const removedInput = nameInput()!
    removedInput.value = "Removed name"
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: `remove-user-snippet:${loadAppSettings().userSnippets[0].id}`}, bubbles: true, composed: true,
    }))
    removedInput.dispatchEvent(new FocusEvent("blur"))
    await vi.waitFor(() => expect(loadAppSettings().userSnippets.map(snippet => snippet.label)).toEqual(["First renamed"]))
  })

  it.each([249, 250, 251])("enforces the snippet name limit when storing defaults and rename events (length: %s)", async length => {
    const {editor} = await mountEditor()
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    vi.spyOn(editor, "execute").mockResolvedValue({html: "<p>Saved</p>", label: "Default ".repeat(40)})
    await (editor as any).pinSnippet()
    const saved = loadAppSettings().userSnippets[0]
    expect(saved.label).toBe("Default ".repeat(40).slice(0, 250))
    const label = "x".repeat(length)
    editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!.dispatchEvent(new CustomEvent("ribbon-label-change", {
      detail: {action: `user-snippet:${saved.id}`, label}, bubbles: true, composed: true,
    }))
    expect(loadAppSettings().userSnippets[0]).toEqual({...saved, label: label.slice(0, 250)})
  })

  it("ignores pinning a selection with no snippet target", async () => {
    const {editor} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue(null)
    await (editor as any).pinSnippet()
    expect(loadAppSettings().userSnippets).toEqual([])
  })

  it("stores identical snippet HTML only once, including concurrent requests", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue({html: "<p>Saved</p>", label: "Saved"})
    await Promise.all([(editor as any).pinSnippet(), (editor as any).pinSnippet()])
    const saved = loadAppSettings().userSnippets
    expect(saved).toHaveLength(1)
    execute.mockResolvedValue({html: "<p>Saved</p>", label: "Different label"})
    await (editor as any).pinSnippet()
    expect(loadAppSettings().userSnippets).toEqual(saved)
    execute.mockResolvedValue({html: '<p class="different">Saved</p>', label: "Saved"})
    await (editor as any).pinSnippet()
    expect(loadAppSettings().userSnippets.map(snippet => snippet.html)).toEqual(['<p class="different">Saved</p>', "<p>Saved</p>"])
  })

  it.each([true, false])("routes snippet hover and dropdown focus to an editor preview without storing content (expanded=%s)", async expanded => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    for(const hovered of [true, false]) ribbon.dispatchEvent(new CustomEvent("snippet-hover-change", {detail: {hovered}, bubbles: true, composed: true}))
    expect(execute.mock.calls.map(([action]) => action)).toEqual([{type: "hoverSnippet", hovered: true}, {type: "hoverSnippet", hovered: false}])
    ribbon.dispatchEvent(new CustomEvent("insertion-hover-change", {detail: {hovered: true, tag: "p"}, bubbles: true, composed: true}))
    ribbon.dispatchEvent(new CustomEvent("insertion-hover-change", {detail: {hovered: false}, bubbles: true, composed: true}))
    expect(execute.mock.calls.slice(2).map(([action]) => action)).toEqual([
      {type: "hoverInsertion", hovered: true, tag: "p"}, {type: "hoverInsertion", hovered: false},
    ])
    ribbon.expanded = expanded
    ribbon.menuOpen = !expanded
    await ribbon.updateComplete
    let controls: RibbonButton | RibbonMenu
    if(expanded) controls = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Snippets"]')!
    else {
      const root = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
      await root.updateComplete
      root.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
      await root.updateComplete
      controls = root.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    }
    await controls.updateComplete
    controls.shadowRoot!.querySelector<HTMLButtonElement>(expanded ? ".main-button" : '[title="Snippets"]')!.click()
    await controls.updateComplete
    const menu = controls.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    const add = menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Add snippet"]')!
    execute.mockClear()
    for(const type of ["mouseenter", "mouseleave", "focus", "blur"]) add.dispatchEvent(new Event(type))
    expect(execute.mock.calls.map(([action]) => action)).toEqual([
      {type: "hoverSnippet", hovered: true}, {type: "hoverSnippet", hovered: false},
      {type: "hoverSnippet", hovered: true}, {type: "hoverSnippet", hovered: false},
    ])
    expect(loadAppSettings().userSnippets).toEqual([])
  })

  it.each(["document", "canvas", "slides"] as const)("inserts ribbon %s drops from authenticated snippet messages and ignores invalid requests", async layout => {
    const {editor} = await mountEditor()
    const host = editor as any
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const authenticated = vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    host.settings = {...host.settings, userSnippets: [{id: "saved", label: "Saved", html: '<p>Saved</p>'}]}
    const position = {anchor: {type: "body", tname: "root"}, layout, x: 200, y: 100}
    const drop = (action: string, target = position) => host.handleEditorMessage(new MessageEvent("message", {
      data: {type: "editor-ribbon-drop", action, position: target},
    }))
    drop("user-snippet:saved")
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "insertRibbonDrop", html: '<p>Saved</p>', position}))
    execute.mockClear()
    drop("user-snippet:missing")
    drop("delete")
    if(layout !== "document") drop("user-snippet:saved", {...position, x: Infinity})
    authenticated.mockReturnValue(false)
    drop("user-snippet:saved")
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects authenticated ribbon drop messages targeting graphics", async () => {
    const {editor}=await mountEditor()
    const host=editor as any
    vi.spyOn(host,"isEditorMessage").mockReturnValue(true)
    const insert=vi.spyOn(host,"insertRibbonDropAction").mockResolvedValue(undefined)
    const position={anchor:{type:"body",tname:"root"},layout:"graphic",x:200,y:100}
    for(const action of ["user-snippet:saved","package:demo","package-member:demo"]) {
      host.handleEditorMessage(new MessageEvent("message",{data:{type:"editor-ribbon-drop",action,position}}))
    }
    expect(insert).not.toHaveBeenCalled()
  })

  it("installs dropped packages and routes dropped package members to the captured position", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.packages = [demoPackage]
    const install = vi.spyOn(host, "setPackageInstalled").mockResolvedValue(demoPackage)
    const insert = vi.spyOn(host, "insertPackageMember").mockResolvedValue(undefined)
    const position = {anchor: {tname: "root"}, layout: "document"}
    await host.insertRibbonDropAction(`package:${demoPackage.name}`, position)
    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).toHaveBeenCalledWith(demoPackage.members[0], position)
    await host.insertRibbonDropAction(`package-member:${demoPackage.members[1].id}`, position)
    expect(insert).toHaveBeenLastCalledWith(demoPackage.members[1], position)
  })

  it("fetches dropped package snippets before inserting at the captured position", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const fetch = vi.spyOn(host.packageRegistry, "fetchSnippet").mockResolvedValue('<p>Package snippet</p>')
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const position = {anchor: {tname: "root"}, layout: "slides", x: 100, y: 100}
    await host.insertPackageMember(demoPackage.members[1], position)
    expect(fetch).toHaveBeenCalledWith(demoPackage.members[1], host.documentLanguage)
    expect(execute).toHaveBeenCalledWith({type: "insertRibbonDrop", html: '<p>Package snippet</p>', position})
  })

  it("loads missing snippet dependencies in one reload before inserting at the original drop", async () => {
    const host = new DomEditor() as any
    vi.spyOn(host, "focusEditor").mockImplementation(() => {})
    const extra = {...demoPackage, name: "@webwriter/extra", version: "2.3.0", members: []}
    const installed = {...demoPackage, name: "@webwriter/reuse", version: "1.4.0", members: []}
    const snippet = {...demoPackage.members[1], editingConfig: {dependencies: [installed.name, extra.name]}}
    const pkg = {...demoPackage, members: [snippet], manifest: {
      name: demoPackage.name, version: demoPackage.version,
      optionalDependencies: {[extra.name]: "^2.1.0", [installed.name]: "^1.0.0", "@webwriter/unused": "*"},
    }}
    host.installedPackages = [installed]
    host.packages = [pkg]
    const resolve = vi.spyOn(host.packageRegistry, "getPackageForRange").mockResolvedValue(extra)
    vi.spyOn(host.packageRegistry, "fetchSnippet").mockResolvedValue("<p>Example</p>")
    const execute = vi.spyOn(host, "execute").mockResolvedValue(true)
    let loaded!: () => void
    const barrier = new Promise<void>(done => { loaded = done })
    const reload = vi.spyOn(host, "reloadEditor").mockImplementation(async packages => {
      host.installedPackages = packages
      host.frameRevision++
      await barrier
    })
    const position = {anchor: {tname: "root"}, layout: "document"}
    const insertion = host.insertRibbonDropAction(`package-member:${snippet.id}`, position)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith([installed, pkg, extra]))
    expect(execute).not.toHaveBeenCalled()
    expect(resolve).toHaveBeenCalledExactlyOnceWith(extra.name, "^2.1.0")
    loaded()
    await insertion
    expect(execute).toHaveBeenCalledExactlyOnceWith({type: "insertRibbonDrop", html: "<p>Example</p>", position, packageSnippet: true})
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it.each(["mismatch", "unavailable"])("keeps the document intact when a snippet dependency is %s", async failure => {
    const host = new DomEditor() as any
    vi.spyOn(host, "focusEditor").mockImplementation(() => {})
    const name = "@webwriter/extra"
    const snippet = {...demoPackage.members[1], editingConfig: {dependencies: [name]}}
    const pkg = {...demoPackage, members: [snippet], manifest: {
      name: demoPackage.name, version: demoPackage.version, optionalDependencies: {[name]: "^2.0.0"},
    }}
    host.installedPackages = failure === "mismatch" ? [pkg, {...demoPackage, name, members: []}] : [pkg]
    vi.spyOn(host.packageRegistry, "getPackageForRange").mockRejectedValue(new Error("Dependency download failed"))
    vi.spyOn(host.packageRegistry, "fetchSnippet").mockResolvedValue("<p>Example</p>")
    const execute = vi.spyOn(host, "execute").mockResolvedValue(true)
    const reload = vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    await host.installAndInsertPackage(pkg, snippet, {start: {}, end: {}, html: null})
    expect(host.packageError).toContain(failure === "mismatch" ? "Version 1.0.0 is installed" : "Dependency download failed")
    expect(reload).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it("renders Packages as ribbon buttons with a prefixed search bar", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    const button = drawer.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await Promise.all([search.updateComplete, button.updateComplete])

    expect(drawer).not.toBeNull()
    expect(search.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Search widgets"]')?.placeholder).toBe("Search widgets")
    expect(search.shadowRoot!.querySelector(".icon-tabler-search")).not.toBeNull()
    expect(button.shadowRoot!.querySelector('button[aria-label="Show more Demo options"]')).toBeNull()
  })

  it("installs an uninstalled package and inserts its first member only on a later click", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const install = vi.spyOn(editor as any, "setPackageInstalled").mockImplementation(async () => {
      ;(editor as any).installedPackages = [demoPackage]
      return demoPackage
    })
    const insert = vi.spyOn(editor as any, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).not.toHaveBeenCalled()
    await editor.updateComplete
    await ribbon.updateComplete
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    expect(install).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(demoPackage.members[0])
  })

  it("installs without inserting on the first click and inserts the matched snippet on the next click", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const install = vi.spyOn(editor as any, "setPackageInstalled").mockImplementation(async () => {
      ;(editor as any).installedPackages = [demoPackage]
      return demoPackage
    })
    const insert = vi.spyOn(editor as any, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Packages"] ribbon-button[label="Demo"]')).not.toBeNull())
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    await search.updateComplete
    const input = search.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.value = "snippet"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    const button = drawer.querySelector<RibbonButton>('ribbon-button[label="Demo Snippet"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    await vi.waitFor(() => expect(install).toHaveBeenCalled())
    expect(install).toHaveBeenCalledWith(demoPackage, true)
    expect(insert).not.toHaveBeenCalled()
    await editor.updateComplete
    await ribbon.updateComplete
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await vi.waitFor(() => expect(insert).toHaveBeenCalledWith(demoPackage.members[1]))
    expect(install).toHaveBeenCalledTimes(1)
  })

  it("cancels an installation by clicking its loading button before metadata resolves", async () => {
    vi.mocked(WebWriterPackageRegistry.prototype.search).mockResolvedValue([demoPackage])
    const {editor} = await mountEditor()
    const host = editor as any
    let resolvePackage!: (pkg: WebWriterPackage) => void
    vi.spyOn(host.packageRegistry, "getPackage").mockImplementation(() => new Promise(resolve => {resolvePackage = resolve}))
    const reload = vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    const insert = vi.spyOn(host, "insertPackageMember").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector('ribbon-button[label="Demo"]')).not.toBeNull())
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete
    await button.updateComplete
    expect(button.loading).toBe(true)
    expect(button.disabled).toBe(false)
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await vi.waitFor(() => expect(host.busyPackageNames).toEqual([]))
    resolvePackage(demoPackage)
    await Promise.resolve()
    expect(reload).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
    expect(host.installedPackages).toEqual([])
    expect(host.packageInstallations.size).toBe(0)
    expect(host.packageError).toBe("")
  })

  it.each([false, true])("removes an installation cancelled while its frame loads (load fails: %s)", async fails => {
    const {editor} = await mountEditor()
    const host = editor as any
    const other = {...demoPackage, name: "@webwriter/other"}
    host.installedPackages = [other]
    vi.spyOn(host.packageRegistry, "getPackage").mockResolvedValue(demoPackage)
    let finishLoading!: () => void
    const reload = vi.spyOn(host, "reloadEditor").mockImplementationOnce(async (packages: any) => {
      host.installedPackages = packages
      await new Promise<void>(resolve => {finishLoading = resolve})
      if(fails) throw new Error("Widget load failed")
    }).mockImplementation(async (packages: any) => {host.installedPackages = packages})
    const installing = host.setPackageInstalled(demoPackage, true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await host.setPackageInstalled(demoPackage, false)
    finishLoading()
    expect(await installing).toBeUndefined()
    expect(reload).toHaveBeenLastCalledWith([other])
    expect(host.installedPackages).toEqual([other])
    expect(host.busyPackageNames).toEqual([])
    expect(host.packageInstallations.size).toBe(0)
    expect(host.packageError).toBe("")
  })

  it("removes an installed package from a management-mode package action", async () => {
    const {editor} = await mountEditor()
    Object.defineProperty(editor, "installedPackages", {
      value: [demoPackage],
      writable: true,
      configurable: true,
    })
    const setInstalled = vi.spyOn(editor as any, "setPackageInstalled").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "package-toggle:@webwriter/demo", keepDrawerOpen: true},
      bubbles: true,
      composed: true,
    }))

    expect(setInstalled).toHaveBeenCalledWith(demoPackage, false)
  })

  it("disables unavailable history actions and executes enabled undo and redo controls", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const historyButtons = Array.from(ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".history-button"))

    expect(historyButtons.map(button => button.getAttribute("aria-label"))).toEqual(["Undo", "Redo"])
    expect(historyButtons[0].querySelector(".icon-tabler-arrow-back-up")).not.toBeNull()
    expect(historyButtons[1].querySelector(".icon-tabler-arrow-forward-up")).not.toBeNull()
    expect(historyButtons[1].parentElement?.nextElementSibling?.getAttribute("aria-label")).toBe("Preview")

    expect(historyButtons.map(button => button.disabled)).toEqual([true, true])
    historyButtons.forEach(button => button.click())
    expect(execute).not.toHaveBeenCalled()

    const publish = async (canUndo: boolean, canRedo: boolean) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: undoStateChangeEvent, detail: {canUndo, canRedo}, bridgeNonce: (editor as any).bridgeNonce},
        source: editorWindow, origin: window.location.origin,
      }))
      await editor.updateComplete
      await (ribbon as AppRibbon).updateComplete
    }

    await publish(true, false)
    expect(historyButtons.map(button => button.disabled)).toEqual([false, true])

    historyButtons[0].click()
    await publish(false, true)
    expect(historyButtons.map(button => button.disabled)).toEqual([true, false])
    historyButtons[1].click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "undo"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "redo"})
    await publish(false, false)
    expect(historyButtons.map(button => button.disabled)).toEqual([true, true])
  })

  it("opens Versions only from the Review footer and hides it on close or leaving Review", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(emptyVersionHistoryState())
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Review")
    await editor.updateComplete
    await toolbox.updateComplete
    const panel = editor.shadowRoot!.querySelector<HTMLElement>(".bottom-detail-panel")!
    expect(panel.inert).toBe(true)
    expect(execute).not.toHaveBeenCalledWith({type: "getVersionHistory"})
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".versions-console-toggle")!.click()
    await editor.updateComplete
    await toolbox.updateComplete
    expect(panel.inert).toBe(false)
    expect(editor.shadowRoot!.querySelector("bottom-detail-panel")!.mode).toBe("versions")
    expect(execute).toHaveBeenCalledWith({type: "getVersionHistory"})
    expect(toolbox.versionsOpen).toBe(true)
    const detailPanel = editor.shadowRoot!.querySelector("bottom-detail-panel")!
    await detailPanel.updateComplete
    detailPanel.shadowRoot!.querySelector<HTMLButtonElement>('header [aria-label="Close versions"]')!.click()
    await editor.updateComplete
    expect(panel.inert).toBe(true)
    await toolbox.updateComplete
    const versions = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".versions-console-toggle")!
    expect(toolbox.shadowRoot!.activeElement).toBe(versions)
    versions.click()
    await editor.updateComplete
    toolbox.selectTool("Edit")
    await editor.updateComplete
    expect(panel.inert).toBe(true)
    expect(editor.shadowRoot!.querySelector("bottom-detail-panel")!.mode).toBeNull()
  })

  it("switches between Checks & Tests and Versions in the Review footer", async () => {
    const {editor} = await mountEditor()
    const clear = vi.spyOn(editor as any, "clearHistoryPreview").mockResolvedValue(undefined)
    vi.spyOn(editor, "execute").mockResolvedValue(emptyVersionHistoryState())
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!
    toolbox.selectTool("Review")
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('[aria-label="Checks & Tests"]')).toBeNull()
    Object.assign(editor, {localPackages: [demoPackage]})
    await editor.updateComplete
    await toolbox.updateComplete
    const checks = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Checks & Tests"]')!
    const versions = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Versions"]')!
    checks.click()
    await editor.updateComplete
    await toolbox.updateComplete
    const panel = editor.shadowRoot!.querySelector("bottom-detail-panel")!
    expect(panel.mode).toBe("checks")
    expect(checks.getAttribute("aria-pressed")).toBe("true")
    versions.click()
    await editor.updateComplete
    expect(panel.mode).toBe("versions")
    checks.click()
    await editor.updateComplete
    await panel.updateComplete
    expect(panel.mode).toBe("checks")
    expect(clear).toHaveBeenCalledOnce()
    expect(panel.shadowRoot!.querySelector(".test-content")).not.toBeNull()
    panel.shadowRoot!.querySelector<HTMLButtonElement>('header [aria-label="Close checks and tests"]')!.click()
    await editor.updateComplete
    await toolbox.updateComplete
    expect(panel.mode).toBeNull()
    expect(toolbox.shadowRoot!.activeElement).toBe(checks)
    checks.click()
    await editor.updateComplete
    expect(panel.mode).toBe("checks")
    Object.assign(editor, {localPackages: []})
    await editor.updateComplete
    await toolbox.updateComplete
    expect(panel.mode).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('[aria-label="Checks & Tests"]')).toBeNull()
    expect(versions.isConnected).toBe(true)
  })

  it("lists newest versions first and routes preview and restore for both tiers", async () => {
    const {editor} = await mountEditor(editor => Object.assign(editor, {undoState: {canUndo: true, canRedo: false}}))
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    const user = {clientId: 7, name: "Ada Lovelace", initials: "AL", color: "#e11d48"}
    const peer = {clientId: 8, name: "Grace Hopper", initials: "GH", color: "#2563eb"}
    const checkpoint = (id: string, timestamp: number) => ({id, timestamp, label: "Edited by Ada Lovelace",
      user, changes: {added: 1, removed: 2, modified: 3}, commentCount: 0})
    const initial = {...checkpoint("initial", 0), label: "Document created", changes: {added: 0, removed: 0, modified: 0}}
    const saved = {...checkpoint("saved", 2), label: "Saved version", checkpointIds: ["second", "first", "initial"],
      isUnsaved: false, isCurrent: false}
    const unsaved = {...checkpoint("unsaved", 3), label: "Unsaved changes", checkpointIds: ["third"],
      isUnsaved: true, isCurrent: true}
    const state: VersionHistoryState = {
      versions: [unsaved, saved],
      checkpoints: [checkpoint("third", 3), {...checkpoint("second", 2), user: peer, label: "Edited by Grace Hopper"},
        checkpoint("first", 1), initial],
      comments: [], preview: null, currentCheckpointId: "third", currentUserId: 7,
    }
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "previewVersionCheckpoint") return {...state,
        preview: {checkpointId: action.checkpointId, added: 1, removed: 2, modified: 3, isCurrent: action.checkpointId === "unsaved"}}
      return state
    })
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('.versions-console-toggle')!.click()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "getVersionHistory"}))
    await editor.updateComplete
    const console = editor.shadowRoot!.querySelector("bottom-detail-panel")!
    await console.updateComplete
    expect(console.mode).toBe("versions")
    expect(toolbox.shadowRoot!.querySelector('.history-timeline')).toBeNull()
    const cards = Array.from(console.shadowRoot!.querySelectorAll<HTMLElement>(".history-version-card"))
    expect(cards.map(card => card.dataset.checkpointId)).toEqual(["unsaved", "saved"])
    expect(cards[0].querySelector(".history-checkpoint-label")?.textContent).toBe("Unsaved changes")
    expect(cards[1].querySelector(".history-checkpoint-meta")?.textContent).toBe("By you")
    expect(cards[1].querySelector(".history-change-count")?.textContent?.trim()).toBe(String(saved.changes.added + saved.changes.removed + saved.changes.modified))
    expect(console.shadowRoot!.querySelector("details")).toBeNull()
    console.shadowRoot!.querySelector<HTMLButtonElement>('.version-sidebar .history-checkpoint[data-checkpoint-id="saved"]')!.click()
    await console.updateComplete
    expect(Array.from(console.shadowRoot!.querySelectorAll<HTMLElement>(".history-change-card"))
      .map(card => card.dataset.checkpointId)).toEqual(["second", "first"])
    expect(console.shadowRoot!.querySelector('.history-change-card[data-checkpoint-id="second"] .history-checkpoint-meta')?.textContent)
      .toBe("By Grace Hopper")

    for(const id of ["saved", "first", "unsaved"]) {
      console.shadowRoot!.querySelector<HTMLButtonElement>(`.history-checkpoint[data-checkpoint-id="${id}"]`)!.click()
      await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "previewVersionCheckpoint", checkpointId: id}))
      await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.disabled).toBe(true))
      await toolbox.updateComplete
      expect(console.shadowRoot!.querySelector(".version-sidebar")).not.toBeNull()
    }
    console.shadowRoot!.querySelector<HTMLButtonElement>('.version-sidebar .history-checkpoint[data-checkpoint-id="saved"]')!.click()
    await console.updateComplete
    for(const id of ["saved", "first"]) {
      await vi.waitFor(() => expect(console.shadowRoot!.querySelector<HTMLButtonElement>(`.history-card-restore-button[data-checkpoint-id="${id}"]`)!.disabled).toBe(false))
      console.shadowRoot!.querySelector<HTMLButtonElement>(`.history-card-restore-button[data-checkpoint-id="${id}"]`)!.click()
      await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "revertVersionCheckpoint", checkpointId: id}))
      await toolbox.updateComplete
    }
    await vi.waitFor(() => expect(console.shadowRoot!.querySelector<HTMLButtonElement>('.history-checkpoint[data-checkpoint-id="saved"]')!.disabled).toBe(false))
    console.shadowRoot!.querySelector<HTMLButtonElement>('.history-checkpoint[data-checkpoint-id="saved"]')!.click()
    await vi.waitFor(() => expect(toolbox.historyState.preview).not.toBeNull())
    await toolbox.updateComplete
    console.shadowRoot!.querySelector<HTMLButtonElement>(".history-preview-clear")!.click()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "clearVersionPreview"}))
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.disabled).toBe(false))

    console.historyState = {...state, versions: [{...saved, id: "newest", timestamp: unsaved.timestamp + 1, checkpointIds: []}, ...state.versions]}
    await console.updateComplete
    expect(console.shadowRoot!.querySelector<HTMLElement>(".history-version-card")!.dataset.checkpointId).toBe("newest")
    expect(console.shadowRoot!.querySelector(".version-sidebar")).not.toBeNull()
  })

  it("routes Website zoom to the selected iframe type inside a figure", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const selectionType = {localName: "iframe", namespaceURI: "http://www.w3.org/1999/xhtml"}
    const figure = {...selectionType, localName: "figure", name: "Figure", path: [0], attributes: {}}
    const website = {...selectionType, name: "Website", path: [0, 0], attributes: {style: "zoom: 80%"}}
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: selectionChangeEvent, detail: {
      path: [{path: [], name: "Document"}, figure], nodeSelected: true, element: figure,
      media: {type: "iframe", attributes: website.attributes},
      selectedElementTypes: [{
        element: website, count: 1, styleProperties: ["zoom"], configuredWidgetOptions: [],
        style: {target: selectionType, inline: {zoom: {value: "80%", priority: ""}}, computed: {},
          context: {display: "block", parentDisplay: "block"}},
      }],
    }}}))
    await editor.updateComplete
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('[data-specialized="iframe"]')!
    const styles = drawer.querySelector("element-style-editor")!
    await styles.updateComplete
    const zoom = styles.shadowRoot!.querySelector<import("./style-combobox").StyleCombobox>('[data-property="zoom"] style-combobox')!
    expect(zoom.value).toBe("80%")
    expect(zoom.options.map(option => option.value)).toContain("75%")
    const change = (value: string) => zoom.dispatchEvent(new CustomEvent("combobox-change", {
      detail: {value}, bubbles: true, composed: true,
    }))
    change("75%")
    expect(execute).toHaveBeenCalledWith({type: "setSelectedElementStyles", selectionType, styles: {zoom: {value: "75%", priority: ""}}})
    change("")
    expect(execute).toHaveBeenCalledWith({type: "setSelectedElementStyles", selectionType, styles: {zoom: null}})
  })

  it("shows and changes alignment separately for selected header and data cells in Edit", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const namespaceURI = "http://www.w3.org/1999/xhtml"
    const cellGroup = (localName: string, name: string, column: number, horizontal: string, vertical: string) => ({
      element: {localName, namespaceURI, name, path: [0, 0, 0, column], attributes: {}},
      count: 1, styleProperties: ["text-align", "vertical-align"], configuredWidgetOptions: [],
      style: {target: {localName, namespaceURI}, inline: {
        "text-align": {value: horizontal, priority: ""},
        "vertical-align": {value: vertical, priority: ""},
      }, computed: {}, context: {display: "table-cell", parentDisplay: "table-row"}},
    })
    const heading = cellGroup("th", "Header cell", 0, "center", "top")
    const data = cellGroup("td", "Data cell", 1, "left", "bottom")
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: selectionChangeEvent, detail: {
      path: [{path: [], name: "Document"}, data.element], nodeSelected: true, element: data.element,
      selectedElementTypes: [heading, data],
    }}}))
    await editor.updateComplete
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const choices = async (localName: string, property: string) => {
      const control = toolbox.shadowRoot!.querySelector<import("./element-style-editor").ElementStyleEditor>(
        `[data-specialized="${localName}"] element-style-editor`,
      )!
      await control.updateComplete
      return control.shadowRoot!.querySelector(`[data-property="${property}"]`)!
    }
    const headingAlignment = await choices("th", "text-align")
    const dataAlignment = await choices("td", "vertical-align")
    expect(headingAlignment.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Center")
    expect(dataAlignment.querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Bottom")
    headingAlignment.querySelector<HTMLButtonElement>('[aria-label="Right"]')!.click()
    dataAlignment.querySelector<HTMLButtonElement>('[aria-label="Middle"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "setSelectedElementStyles", selectionType: {localName: "th", namespaceURI},
      styles: {"text-align": {value: "right", priority: ""}}})
    expect(execute).toHaveBeenCalledWith({type: "setSelectedElementStyles", selectionType: {localName: "td", namespaceURI},
      styles: {"vertical-align": {value: "middle", priority: ""}}})
  })

  it("routes media ribbon commands through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!

    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "Image"},
      bubbles: true,
      composed: true,
    }))

    expect(execute).toHaveBeenCalledWith({type: "insertElement", tag: "picture"})
    await Promise.resolve()
    focusEditor.mockClear()

    toolbox.dispatchEvent(new CustomEvent("media-type-change", {
      detail: {type: "object"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "switchWebsiteType", website: "object"})

    toolbox.dispatchEvent(new CustomEvent("media-attribute-change", {
      detail: {type: "object", attribute: "data", value: "https://example.test"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "setMediaAttribute",
      name: "data",
      value: "https://example.test",
    })
    toolbox.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {type: "video", action: "add", resource: "source"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "addTimedMediaResource", resource: "source"})

    toolbox.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {
        type: "video",
        action: "set-attribute",
        resource: "track",
        index: 2,
        expected: {src: "captions.vtt"},
        attribute: "label",
        value: "English",
      },
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "setTimedMediaResourceAttribute",
      resource: "track",
      index: 2,
      expected: {src: "captions.vtt"},
      name: "label",
      value: "English",
    })

    const file = new File(["sound"], "fallback.ogg", {type: "audio/ogg"})
    toolbox.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {type: "audio", action: "set-file", resource: "source", index: 1,
        expected: {src: "old.ogg"}, file},
      bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setMediaFile", file,
      resource: {index: 1, expected: {src: "old.ogg"}}})

    toolbox.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {type: "video", action: "capture", resource: "source", index: 1,
        expected: {src: "old.webm"}, mode: "screen-video"},
      bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "captureTimedMediaResource", index: 1,
      expected: {src: "old.webm"}, mode: "screen-video"})

    toolbox.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {
        type: "audio",
        action: "set-fallback",
        html: "<p>Download audio</p>",
        expectedHTML: "",
      },
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "setTimedMediaFallbackHTML",
      html: "<p>Download audio</p>",
      expected: "",
    })
    toolbox.dispatchEvent(new CustomEvent("image-map-action", {
      detail: {type: "img", action: "add-map"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "addImageMap"})
    toolbox.dispatchEvent(new CustomEvent("image-map-action", {
      detail: {type: "picture", action: "draw", shape: "poly"},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "startImageMapDrawing", shape: "poly"})
    toolbox.dispatchEvent(new CustomEvent("image-map-action", {
      detail: {
        type: "img",
        action: "set-area-attribute",
        path: [1, 0],
        expected: {shape: "rect", coords: "1,2,3,4"},
        attribute: "href",
        value: "library.html",
      },
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "setImageMapAreaAttribute",
      path: [1, 0],
      expected: {shape: "rect", coords: "1,2,3,4"},
      name: "href",
      value: "library.html",
    })
    toolbox.dispatchEvent(new CustomEvent("image-map-action", {
      detail: {type:"img", action:"set-overlay", path:[1, 0], expected:{shape:"rect"}, part:"border", value:false},
      bubbles:true, composed:true,
    }))
    expect(execute).toHaveBeenCalledWith({type:"setImageMapOverlay", path:[1, 0], expected:{shape:"rect"}, part:"border", value:false})
    await Promise.resolve()
    expect(focusEditor).not.toHaveBeenCalled()
    for(const [label, action] of [
      ["media-to-figure", {type: "wrapMediaInFigure"}],
      ["figure-caption-before", {type: "addFigureCaption", position: "before"}],
      ["figure-caption-after", {type: "addFigureCaption", position: "after"}],
      ["figure-caption-edit", {type: "editFigureCaption"}],
    ] as const) {
      toolbox.dispatchEvent(new CustomEvent("ribbon-button-click", {
        detail: {label},
        bubbles: true,
        composed: true,
      }))
      expect(execute).toHaveBeenCalledWith(action)
    }
  })

  it("routes a dropped media source file through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!
    const file = new File(["video"], "movie.mp4", {type: "video/mp4"})
    toolbox.dispatchEvent(new CustomEvent("media-file-drop", {
      detail: {type: "video", file}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setMediaFile", file, attribute: undefined})
  })

  it.each([
    ["Audio", {type: "insertElement", tag: "audio"}],
    ["Video", {type: "insertElement", tag: "video"}],
    ["element:picture", {type: "insertElement", tag: "picture"}],
    ["element:iframe", {type: "insertElement", tag: "iframe"}],
    ["media-capture:screen-image", {type: "captureMedia", mode: "screen-image"}],
    ["media-file:picture", {type: "insertMedia", media: "picture", selectFile: true}],
    ["selected-media-cover-capture:camera-image", {type: "captureSelectedMedia", mode: "camera-image", attribute: "poster"}],
    ["selected-media-capture:screen-image", {type: "captureSelectedMedia", mode: "screen-image"}],
    ["remove-media-source", {type: "removeMediaSource"}],
  ])("routes %s without reclaiming focus", async (label, action) => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label},
      bubbles: true,
      composed: true,
    }))

    expect(execute).toHaveBeenCalledWith(action)
    await Promise.resolve()
    expect(focusEditor).not.toHaveBeenCalled()
  })

  it.each([
    ["selected-media-file", "audio", undefined, "audio/*"],
    ["selected-media-file", "picture", undefined, "image/*"],
    ["selected-media-file", "iframe", undefined, ".html,.htm,text/html"],
    ["selected-media-cover-file", "video", "poster", "image/*"],
  ] as const)("reopens the host %s picker for %s after cancellation", async (label, type, attribute, accept) => {
    const {editor} = await mountEditor()
    ;(editor as any).mediaSelection = {type, attributes: {}}
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!
    const open = () => toolbox.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label}, bubbles: true, composed: true,
    }))

    open()
    const first = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(first.accept).toBe(accept)
    expect(click).toHaveBeenCalledOnce()
    const pickerId = (execute.mock.calls[0][0] as any).pickerId
    expect(execute).toHaveBeenCalledWith({type: "selectMediaFile", attribute, pickerId})
    first.dispatchEvent(new Event("cancel"))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setMediaFile", file: null, pickerId}))
    expect(first.isConnected).toBe(false)

    open()
    const second = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(second).not.toBe(first)
    expect(click).toHaveBeenCalledTimes(2)
    const nextId = (execute.mock.calls[2][0] as any).pickerId
    expect(nextId).not.toBe(pickerId)
    const file = new File(["media"], "media.bin")
    Object.defineProperty(second, "files", {value: [file]})
    second.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setMediaFile", file, pickerId: nextId}))
    expect(second.isConnected).toBe(false)
    expect(document.body.querySelector('input[type="file"]')).toBeNull()
  })

  it("routes a WebVTT file from the host picker to its track", async () => {
    const {editor} = await mountEditor()
    ;(editor as any).mediaSelection = {type: "video", attributes: {}}
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!
    const expected = {src: "captions.vtt", srclang: "en"}
    toolbox.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {type: "video", action: "pick-file", resource: "track", index: 2, expected}, bubbles: true, composed: true,
    }))
    const picker = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(picker.accept).toBe(".vtt,text/vtt")
    const {pickerId} = execute.mock.calls[0][0] as {pickerId: string}
    expect(execute).toHaveBeenCalledWith({type: "selectMediaFile", attribute: undefined,
      resource: {type: "track", index: 2, expected}, pickerId})
    const file = new File(["WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nCaption"], "captions.vtt")
    Object.defineProperty(picker, "files", {value: [file]})
    picker.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setMediaFile", file, pickerId}))
    expect(picker.isConnected).toBe(false)
  })

  it.each(["disconnect", "reload", "picker failure"])("cleans up a host media picker after %s", async condition => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.mediaSelection = {type: "video", attributes: {}}
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const report = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {
      if(condition === "picker failure") throw new Error("Picker unavailable")
    })
    const picking = host.pickMediaFile()
    const input = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')
    if(condition === "disconnect") editor.remove()
    if(condition === "reload") {
      host.frameRevision++
      input!.dispatchEvent(new Event("cancel"))
    }
    await picking
    expect(input?.isConnected ?? false).toBe(false)
    expect(execute).toHaveBeenCalledTimes(condition === "picker failure" ? 2 : 1)
    expect(report).toHaveBeenCalledTimes(condition === "picker failure" ? 1 : 0)
  })

  it.each(["app-ribbon", "dom-editor-toolbox"])("opens graphic imports synchronously from %s and retries after cancellation", async surface => {
    const {editor} = await mountEditor()
    let ready!: (value: boolean) => void
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
      .mockImplementationOnce(() => new Promise(resolve => { ready = resolve }))
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    const focus = vi.spyOn(editor as any, "focusEditor")
    const open = () => editor.shadowRoot!.querySelector(surface)!.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "import-graphic"}, bubbles: true, composed: true,
    }))

    open()
    const first = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(first.accept).toBe(".svg,image/svg+xml")
    expect(click).toHaveBeenCalledOnce()
    expect(focus).not.toHaveBeenCalled()
    const pickerId = (execute.mock.calls[0][0] as any).pickerId
    expect(execute).toHaveBeenCalledWith({type: "importGraphic", pickerId})
    first.dispatchEvent(new Event("cancel"))
    ready(true)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setGraphicFile", file: null, pickerId}))
    expect(first.isConnected).toBe(false)

    focus.mockClear()
    open()
    const second = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(second).not.toBe(first)
    expect(click).toHaveBeenCalledTimes(2)
    expect(focus).not.toHaveBeenCalled()
    const nextId = (execute.mock.calls[2][0] as any).pickerId
    expect(nextId).not.toBe(pickerId)
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "drawing.svg", {type: "image/svg+xml"})
    Object.defineProperty(second, "files", {value: [file]})
    second.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "setGraphicFile", file, pickerId: nextId}))
    expect(second.isConnected).toBe(false)
  })

  it.each(["disconnect", "reload", "picker failure", "bridge failure"])("cleans up a host graphic picker after %s", async condition => {
    const {editor} = await mountEditor()
    const host = editor as any
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    if(condition === "bridge failure") execute.mockRejectedValueOnce(new Error("Frame unavailable"))
    const report = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {
      if(condition === "picker failure") throw new Error("Picker unavailable")
    })
    const picking = host.pickEditorFile({type: "importGraphic"}, ".svg,image/svg+xml")
    const input = editor.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')
    if(condition === "disconnect") editor.remove()
    if(condition === "reload") {
      host.frameRevision++
      input!.dispatchEvent(new Event("cancel"))
    }
    await picking
    expect(input?.isConnected ?? false).toBe(false)
    const failed = condition.endsWith("failure")
    expect(execute).toHaveBeenCalledTimes(failed ? 2 : 1)
    expect(report).toHaveBeenCalledTimes(failed ? 1 : 0)
  })

  it.each([
    ["table-header", "toggleTableHeader"],
    ["table-footer", "toggleTableFooter"],
  ])("routes %s through the iframe bridge", async (label, type) => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    editor.shadowRoot!.querySelector("dom-editor-toolbox")!.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type})
  })

  it.each(["nodeSelected", "capture"] as const)("advertises paragraph toolbox availability for %s bridge selections", async kind => {
    const {editor, editorWindow} = await mountEditor()
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const detail = {
      path: [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}],
      element: {path: [0], localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Paragraph", attributes: {}},
    }
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: selectionChangeEvent, detail: {...detail, [kind]: true}},
    }))
    await editor.updateComplete
    await toolbox.updateComplete
    const edit = toolbox.shadowRoot!.querySelector('[data-tool="Edit"]')!
    expect(toolbox.elementSelected).toBe(true)
    expect(edit.getAttribute("aria-label")).toBe("Edit Paragraph")
    expect(edit.closest(".toolbox-tab")!.hasAttribute("data-available")).toBe(true)
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: selectionChangeEvent, detail},
    }))
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.elementSelected).toBe(false)
    expect(edit.getAttribute("aria-label")).toBe("Edit")
    expect(edit.closest(".toolbox-tab")!.hasAttribute("data-available")).toBe(false)
  })

  it.each(["nodeSelected", "capture"] as const)("shows a selected widget's pretty name for %s bridge selections", async kind => {
    const {editor, editorWindow} = await mountEditor()
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: selectionChangeEvent, detail: {
      path: [{path: [], name: "Document"}, {path: [0], name: "Interactive Video", icon: "Packages"}],
      element: {path: [0], localName: "webwriter-interactive-video", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Interactive Video", attributes: {}},
      [kind]: true,
    }}}))
    await editor.updateComplete
    await toolbox.updateComplete
    const edit = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Edit"]')!
    expect(edit.getAttribute("aria-label")).toBe("Edit Interactive Video")
    expect(edit.closest(".toolbox-tab")!.hasAttribute("data-available")).toBe(true)
    expect(toolbox.activeTool).toBeNull()
  })

  it("loads isolated local widget icons from the host in the breadcrumb and toolbox", async () => {
    const {editor, editorWindow} = await mountEditor()
    const host = editor as any
    const frameOrigin = new URL(host.frameShellURL("editor", 0)).origin
    const iconPath = `${LOCAL_PACKAGE_ROUTE_PREFIX}local-demo/assets/icon.svg?revision=3`
    const frameIcon = frameOrigin + iconPath
    const hostIcon = location.origin + iconPath
    const remoteIcon = `https://cdn.example${iconPath}`
    host.editorOpaque = true
    vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    const presentation = {name: "Local Demo", icon: "Packages", iconUrl: frameIcon}
    const identity = {localName: "local-demo", namespaceURI: "http://www.w3.org/1999/xhtml"}
    const element = {...identity, ...presentation, path: [0], attributes: {}}
    const group = {
      element, count: 1, styleProperties: [], configuredWidgetOptions: [],
      style: {target: identity, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}},
    }
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, origin: frameOrigin,
      data: {type: selectionChangeEvent, detail: {
        path: [{path: [], name: "Document"}, {path: [0], ...presentation}], element, nodeSelected: true,
        selectedElementTypes: [group], widgetConversion: {sourceId: "local-demo", targets: [
          {tag: "local-other", ...presentation}, {tag: "remote-demo", ...presentation, iconUrl: remoteIcon},
        ]},
      }},
    }))
    await editor.updateComplete
    await toolbox.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector("dom-editor-breadcrumb")!
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('[data-specialized="local-demo"]')!
    await drawer.updateComplete
    expect(breadcrumb.shadowRoot!.querySelector(".item-icon img")?.getAttribute("src")).toBe(hostIcon)
    expect(drawer.shadowRoot!.querySelector(".pane-icon img")?.getAttribute("src")).toBe(hostIcon)
    expect(toolbox.elementAttributes?.iconUrl).toBe(hostIcon)
    expect(toolbox.widgetConversion?.targets.map(target => target.iconUrl)).toEqual([hostIcon, remoteIcon])
    expect(element.iconUrl).toBe(frameIcon)
  })

  it("binds multi-selection drawers and routes their changes by type through the bridge", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    const selectionType = {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}
    const group = {
      element: {...selectionType, name: "Paragraph", path: null, attributes: {lang: "en"}}, count: 2,
      style: {target: selectionType, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}},
      styleProperties: [], configuredWidgetOptions: [],
    }
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}], nodeSelected: true, selectedElementTypes: [group]}},
    }))
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.selectedElementTypes).toEqual([group])
    expect(toolbox.documentSelected).toBe(false)
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('[data-specialized="p"]')!
    expect(drawer.label).toBe("Paragraph")
    expect(drawer.elementCount).toBe(2)
    drawer.querySelector("element-style-editor")!.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {property: "text-align", mutation: "right"}, bubbles: true, composed: true,
    }))
    drawer.querySelector("element-attribute-editor")!.dispatchEvent(new CustomEvent("element-attribute-change", {
      detail: {...group.element, name: "lang", value: "de"}, bubbles: true, composed: true,
    }))
    toolbox.dispatchEvent(new CustomEvent("widget-option-change", {
      detail: {selectionType: {localName: "course-quiz", namespaceURI: selectionType.namespaceURI}, name: "count", value: 3},
    }))
    toolbox.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "setCaption", position: "above"}}))
    expect(execute).toHaveBeenCalledWith({type: "setCaption", position: "above"})
    toolbox.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "openAttribution"}}))
    expect(execute).toHaveBeenCalledWith({type: "openAttribution"})
    expect(execute).toHaveBeenCalledWith({type: "setStyle", topLevel: true, styles: {"text-align": "right"}})
    expect(execute).toHaveBeenCalledWith({type: "setSelectedElementAttribute", selectionType, name: "lang", value: "de"})
    expect(execute).toHaveBeenCalledWith({type: "setSelectedWidgetOption", selectionType: {localName: "course-quiz", namespaceURI: selectionType.namespaceURI}, name: "count", value: 3})
    toolbox.dispatchEvent(new CustomEvent("widget-action", {
      detail: {selectionType: {localName: "course-quiz", namespaceURI: selectionType.namespaceURI, id: "second"}, name: "reset"},
    }))
    expect(execute).toHaveBeenCalledWith({type: "runSelectedWidgetAction", selectionType: {localName: "course-quiz", namespaceURI: selectionType.namespaceURI, id: "second"}, name: "reset"})
    toolbox.dispatchEvent(new CustomEvent("widget-action", {
      detail: {selectionType: {localName: "course-quiz", namespaceURI: selectionType.namespaceURI, id: "second"}, name: "reset", confirmed: true},
    }))
    expect(execute).toHaveBeenCalledWith({type: "runSelectedWidgetAction", selectionType: {localName: "course-quiz", namespaceURI: selectionType.namespaceURI, id: "second"}, name: "reset", confirmed: true})
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}]}},
    }))
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.selectedElementTypes).toEqual([])
  })

  it("keeps container drawers available for a text caret after mark-state updates", async () => {
    const {editor, editorWindow} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    const group = {
      element: {path: [0], localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml", name: "Paragraph", attributes: {}},
      count: 1, styleProperties: [], configuredWidgetOptions: [],
      style: {target: {localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}},
    }
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}], selectedElementTypes: [group]}},
    }))
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: markStateChangeEvent, detail: {canMark: true, marks: [], styles: {}, attributes: {}}},
    }))
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.canMark).toBe(true)
    expect(toolbox.selectedElementTypes).toEqual([group])
    expect(toolbox.shadowRoot!.querySelector<RibbonDrawer>('[data-specialized="p"]')?.label).toBe("Paragraph")
  })

  it("routes exact element attribute mutations through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!

    toolbox.dispatchEvent(new CustomEvent("element-attribute-change", {
      detail: {
        path: [0, 1],
        targetId: "element-captured",
        localName: "blockquote",
        namespaceURI: "http://www.w3.org/1999/xhtml",
        name: "data-source",
        previousName: "cite",
        value: "curriculum",
      },
      bubbles: true,
      composed: true,
    }))

    expect(execute).toHaveBeenCalledWith({
      type: "setElementAttribute",
      path: [0, 1],
      targetId: "element-captured",
      localName: "blockquote",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "data-source",
      previousName: "cite",
      value: "curriculum",
    })
  })

  it("saves graphics through the file picker and falls back to SVG downloads", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const picker = vi.fn().mockResolvedValue({createWritable: async () => ({write, close})})
    const pickerWindow = window as Window & {showSaveFilePicker?: typeof picker}
    const previous = pickerWindow.showSaveFilePicker
    pickerWindow.showSaveFilePicker = picker
    try {
      await (editor as any).saveGraphic()
      expect(picker).toHaveBeenCalledWith(expect.objectContaining({suggestedName: "graphic.svg"}))
      expect(execute).toHaveBeenCalledWith({type: "serializeGraphic"})
      expect(write).toHaveBeenCalledWith(expect.any(Blob))
      expect(close).toHaveBeenCalledOnce()
      pickerWindow.showSaveFilePicker = undefined
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
      await (editor as any).saveGraphic()
      expect(click).toHaveBeenCalledOnce()
      expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe("graphic.svg")
      click.mockRestore()
    }
    finally { pickerWindow.showSaveFilePicker = previous }
  })

  it("routes graphic insertion, shape, and parameter commands through the iframe bridge", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "Graphic"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "insert-graphic-shape:ellipse"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "add-graphic-shape:line"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("graphic-parameter-change", {
      detail: {name: "stroke-width", value: "24"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("graphic-parameter-change", {
      detail: {name: "routing", value: "orthogonal"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("graphic-parameter-change", {
      detail: {name: "label", value: "Milestone"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "toggle-graphic-option:grid"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "arrange-graphic:align-middle"},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("graphic-layer-action", {
      detail: {operation: "toggle-lock", index: 2},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("graphic-viewport-action", {
      detail: {operation: "set-zoom", zoom: 175},
      bubbles: true,
      composed: true,
    }))
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "navigate-graphic:fit-content"},
      bubbles: true,
      composed: true,
    }))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "insertElement", tag: "svg"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "insertGraphic", shape: "ellipse"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "addGraphicShape", shape: "line"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "setGraphicParameter", name: "stroke-width", value: "24"})
    expect(execute).toHaveBeenNthCalledWith(5, {type: "setGraphicParameter", name: "routing", value: "orthogonal"})
    expect(execute).toHaveBeenNthCalledWith(6, {type: "setGraphicParameter", name: "label", value: "Milestone"})
    expect(execute).toHaveBeenNthCalledWith(7, {type: "toggleGraphicOption", name: "grid"})
    expect(execute).toHaveBeenNthCalledWith(8, {type: "arrangeGraphicShapes", operation: "align-middle"})
    expect(execute).toHaveBeenNthCalledWith(9, {type: "manageGraphicLayer", operation: "toggle-lock", index: 2})
    expect(execute).toHaveBeenNthCalledWith(10, {type: "navigateGraphic", operation: "set-zoom", zoom: 175})
    expect(execute).toHaveBeenNthCalledWith(11, {type: "navigateGraphic", operation: "fit-content"})
    ribbon.dispatchEvent(new CustomEvent("graphic-parameter-change", {
      detail: {name: "adjust-radius", value: "30"}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenNthCalledWith(12, {type: "setGraphicParameter", name: "adjust-radius", value: "30"})
    for(const [name, value] of [["start-ending", "diamond"], ["end-ending", "bar"], ["start-ending-size", "12.5"], ["end-ending-size", "16"]]) {
      ribbon.dispatchEvent(new CustomEvent("graphic-parameter-change", {
        detail: {name, value}, bubbles: true, composed: true,
      }))
      expect(execute).toHaveBeenLastCalledWith({type: "setGraphicParameter", name, value})
    }

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        bridgeNonce: (editor as any).bridgeNonce,
        detail: {
          path: [{path: [], name: "Document"}, {path: [0], name: "Graphic"}],
          nodeSelected: true,
          capture: true,
          graphic: {
            active: true,
            capture: true,
            selectionCount: 1,
            shape: "connector",
            parameters: {"stroke-width": "24", routing: "orthogonal"},
            options: {grid: false, snap: true, guides: true},
            layers: [{
              index: 0,
              label: "Connector 1",
              type: "connector",
              selected: true,
              primary: true,
              visible: true,
              locked: false,
            }],
            viewport: {zoom: 175},
          },
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    expect(ribbon.graphic).toEqual({
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "connector",
      parameters: {"stroke-width": "24", routing: "orthogonal"},
      options: {grid: false, snap: true, guides: true},
      layers: [{
        index: 0,
        label: "Connector 1",
        type: "connector",
        selected: true,
        primary: true,
        visible: true,
        locked: false,
      }],
      viewport: {zoom: 175},
    })
  })

  it("routes graphic alternative text through the iframe bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!
    toolbox.dispatchEvent(new CustomEvent("graphic-alternative-text-change", {
      detail: {value: "A map"}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setGraphicAlternativeText", value: "A map"})
    toolbox.dispatchEvent(new CustomEvent("graphic-alternative-text-change", {
      detail: {value: null}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setGraphicAlternativeText", value: null})
  })

  it("replaces the collaboration icon with up to two initials avatars", async () => {
    const {editor, editorWindow} = await mountEditor()

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: presenceChangeEvent,
        detail: {
          users: [
            {clientId: 1, name: "Ada Lovelace", initials: "AL", color: "#e11d48"},
            {clientId: 2, name: "Grace Hopper", initials: "GH", color: "#2563eb"},
            {clientId: 3, name: "Lin", initials: "LI", color: "#059669"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await ribbon.updateComplete
    const users = ribbon.shadowRoot!.querySelector<HTMLElement>(".presence-users")!
    const circles = Array.from(users.querySelectorAll<HTMLElement>(".presence-user"))

    expect(circles).toHaveLength(2)
    expect(circles.map(circle => circle.textContent)).toEqual(["AL", "GH"])
    expect(circles.map(circle => circle.style.getPropertyValue("--presence-color"))).toEqual([
      "#e11d48",
      "#2563eb",
    ])
    expect(users.querySelector(".presence-more")).toBeNull()
    expect(users.parentElement?.getAttribute("label")).toBe("Collaboration")
    expect(users.getAttribute("slot")).toBe("icon")
  })

  it("does not render again for a mark or presence state that repeats, and still reports it", async () => {
    const {editor, editorWindow} = await mountEditor()
    const host = editor as any
    const send = (type: string, detail: unknown) => window.dispatchEvent(new MessageEvent("message", {data: {type, detail}, source: editorWindow}))
    const marks = (text: string) => ({
      canMark: true, marks: ["b", "ruby"], allowedMarks: ["b", "i", "ruby"], styles: {color: "red"}, attributes: {a: {href: "https://example.com/"}},
      link: {active: true, identity: "link", href: "https://example.com/", attributes: {}, text, targets: []},
      attachment: {identity: "file", media: [{id: "media", label: "Media"}]},
      ruby: {active: true, canCreate: false, base: "base", annotations: [{index: 1, text: "rt", hasMarkup: false}], fallbacks: []},
    })
    const users = (name: string) => ({users: [{clientId: 1, name, initials: "AL", color: "#e11d48"}], connectionStatus: "connected"})
    const state = () => [host.marks, host.allowedMarks, host.markStyles, host.markAttributes, host.linkSelection, host.attachmentSelection, host.ruby, host.presenceUsers]
    const reported = vi.fn()
    editor.addEventListener(markStateChangeEvent, reported)
    send(markStateChangeEvent, marks("Link"))
    send(presenceChangeEvent, users("Ada Lovelace"))
    while(host.isUpdatePending) await editor.updateComplete
    const before = state()
    expect(before).toEqual([["b", "ruby"], ["b", "i", "ruby"], {color: "red"}, {a: {href: "https://example.com/"}},
      expect.objectContaining({text: "Link"}), expect.objectContaining({identity: "file"}), expect.objectContaining({base: "base"}),
      [expect.objectContaining({name: "Ada Lovelace"})]])

    send(markStateChangeEvent, marks("Link"))
    send(presenceChangeEvent, users("Ada Lovelace"))
    state().forEach((value, index) => expect(value).toBe(before[index]))
    expect(host.isUpdatePending).toBe(false)
    expect(reported).toHaveBeenCalledTimes(2)

    send(markStateChangeEvent, {...marks("Changed"), styles: {color: "blue"}})
    send(presenceChangeEvent, users("Ada King"))
    expect(host.isUpdatePending).toBe(true)
    expect(host.marks).toBe(before[0])
    expect(host.markStyles).toEqual({color: "blue"})
    expect(host.linkSelection.text).toBe("Changed")
    expect(host.attachmentSelection).toBe(before[5])
    expect(host.presenceUsers).toEqual([expect.objectContaining({name: "Ada King"})])
  })

  it("keeps at most two collaboration avatars when four peers are connected", async () => {
    const {editor, editorWindow} = await mountEditor()

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: presenceChangeEvent,
        detail: {
          users: [1, 2, 3, 4].map(clientId => ({
            clientId,
            name: `User ${clientId}`,
            initials: `U${clientId}`,
            color: "#2563eb",
          })),
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await ribbon.updateComplete
    const users = ribbon.shadowRoot!.querySelector<HTMLElement>(".presence-users")!
    expect(users.querySelectorAll(".presence-user")).toHaveLength(2)
    expect(users.querySelector(".presence-more")).toBeNull()
    expect(users.dataset.userCount).toBe("4")
  })

  it("renders the preview control after redo with the circular play icon", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const previewButton = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!

    expect(previewButton.getAttribute("aria-label")).toBe("Preview")
    expect(previewButton.previousElementSibling?.querySelector('[aria-label="Redo"]')).not.toBeNull()
    expect(previewButton.nextElementSibling).toBeNull()
    expect(previewButton.querySelector(".preview-icon")).not.toBeNull()
    expect(previewButton.querySelector(".icon-tabler-player-play")).not.toBeNull()
    expect(getComputedStyle(previewButton.querySelector(".preview-icon")!).borderRadius).toBe("50%")
  })

  it("starts a live preview session and restores the editor selection when it stops", async () => {
    const {editor} = await mountEditor()
    const editorFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    const editorDocument = editorFrame.contentDocument!
    editorDocument.body.innerHTML = '<p contenteditable="true" class="◆element-selected">Original</p>'
    editorDocument.body.setAttribute("contenteditable", "true")
    editorDocument.designMode = "on"
    const text = editorDocument.querySelector("p")!.firstChild!
    editorDocument.getSelection()!.setBaseAndExtent(text, 1, text, 4)

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const previewButton = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!
    previewButton.click()
    await editor.updateComplete
    await ribbon.updateComplete

    const previewFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.preview-frame")!
    expect(previewFrame).not.toBe(editorFrame)
    expect(editorFrame.hidden).toBe(true)
    expect(getComputedStyle(previewFrame.parentElement!).paddingBlockStart).toBe("1px")
    expect(previewFrame.contentDocument!.body.getAttribute("contenteditable")).toBe("true")
    expect(previewFrame.contentDocument!.querySelector("p[contenteditable='true']")).not.toBeNull()
    expect(previewFrame.contentDocument!.designMode).not.toBe("on")
    expect(ribbon.shadowRoot!.querySelectorAll("ribbon-tab")).toHaveLength(1)
    expect(ribbon.shadowRoot!.querySelectorAll(".history-button")).toHaveLength(0)
    expect((ribbon as AppRibbon).expanded).toBe(true)
    const brand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
    expect(brand.disabled).toBe(false)
    expect(brand.getAttribute("aria-label")).toBe("Return to editing")
    expect(ribbon.previewActive).toBe(true)
    expect(ribbon.expanded).toBe(true)
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.getAttribute("aria-label"))
      .toBe("Exit preview")
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.getAttribute("aria-pressed"))
      .toBe("true")
    const ribbonContent = ribbon.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!
    expect(getComputedStyle(ribbonContent).borderTopColor).toBe("transparent")
    expect(getComputedStyle(ribbonContent).backgroundImage).toContain("linear-gradient")
    expect(getComputedStyle(ribbonContent).backgroundSize).toContain("+ 1px")
    expect(previewButton.querySelector(".preview-label")).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Sharing"]')).not.toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Learners"]')).not.toBeNull()
    expect(editor.shadowRoot!.querySelector("live-session-controls")).not.toBeNull()
    expect(editor.shadowRoot!.querySelector("live-session-overlay")).toBeNull()
    expect(editor.shadowRoot!.querySelector("dom-editor-breadcrumb")).toBeNull()

    previewFrame.contentDocument!.body.textContent = "Preview changes are discarded"
    previewButton.click()
    await editor.updateComplete
    await ribbon.updateComplete

    expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).toBeNull()
    expect(editorFrame.hidden).toBe(false)
    expect(editorFrame.contentDocument!.body.innerHTML).toContain("Original")
    expect(editorFrame.contentDocument!.body.getAttribute("contenteditable")).toBe("true")
    expect(editorFrame.contentDocument!.designMode).toBe("on")
    const restored = editorFrame.contentDocument!.getSelection()!
    expect(restored.anchorNode).toBe(text)
    expect(restored.anchorOffset).toBe(1)
    expect(restored.focusNode).toBe(text)
    expect(restored.focusOffset).toBe(4)
  })

  it("returns to editing from the app button during a preview transition", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    const brand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
    expect(ribbon.previewActive).toBe(true)
    expect(ribbon.hasAttribute("preview-transition")).toBe(true)
    expect(brand.disabled).toBe(false)
    brand.click()
    await editor.updateComplete
    await ribbon.updateComplete

    expect(ribbon.previewActive).toBe(false)
    expect(ribbon.expanded).toBe(true)
    expect(iframe.hidden).toBe(false)
    expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).toBeNull()
  })

  it.each(["finished", "cancelled"])("loads preview after the ribbon expansion has %s", async outcome => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    let finishHeight!: () => void
    let settleMaxHeight!: () => void
    const height = new Promise<void>(resolve => { finishHeight = resolve })
    const maxHeight = new Promise<void>((resolve, reject) => {
      settleMaxHeight = outcome === "finished" ? resolve : () => reject(new DOMException("Cancelled", "AbortError"))
    })
    ribbon.getAnimations = vi.fn(() => [{finished: height}, {finished: maxHeight}] as unknown as Animation[])
    const document = iframe.contentDocument!
    const srcdoc = iframe.srcdoc

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete
    expect(ribbon.expanded).toBe(true)
    expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).toBeNull()
    expect(iframe.hidden).toBe(false)
    expect(iframe.inert).toBe(true)
    expect(editor.shadowRoot!.querySelector(".document-stage")!.getAttribute("aria-busy")).toBe("true")

    finishHeight()
    await Promise.resolve()
    expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).toBeNull()
    settleMaxHeight()
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).not.toBeNull())
    expect(iframe.hidden).toBe(true)
    expect(iframe.contentDocument).toBe(document)
    expect(iframe.srcdoc).toBe(srcdoc)
    expect(editor.shadowRoot!.querySelector(".document-stage")!.getAttribute("aria-busy")).toBe("false")
  })

  it("does not let an obsolete expansion load a stopped or restarted preview", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    let finishFirst!: () => void
    let finishSecond!: () => void
    const first = new Promise<void>(resolve => { finishFirst = resolve })
    const second = new Promise<void>(resolve => { finishSecond = resolve })
    ribbon.getAnimations = () => [{finished: first}] as unknown as Animation[]
    const toggle = async () => {
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
      await editor.updateComplete
      await ribbon.updateComplete
    }
    await toggle()
    await toggle()
    expect(iframe.hidden).toBe(false)
    expect(iframe.inert).toBe(false)
    expect(ribbon.expanded).toBe(false)
    expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).toBeNull()

    ribbon.getAnimations = () => [{finished: second}] as unknown as Animation[]
    await toggle()
    finishFirst()
    await new Promise(resolve => setTimeout(resolve, 0))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).toBeNull()
    finishSecond()
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).not.toBeNull())
  })

  it("loads preview without a delay when expansion has no animations", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    ribbon.getAnimations = () => []
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).not.toBeNull())
  })

  it("discards a pending preview when the editor is disconnected and reconnected", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    ribbon.getAnimations = () => [{finished}] as unknown as Animation[]
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete
    editor.remove()
    Object.assign(editor, {frameStarted: true})
    document.body.append(editor)
    finish()
    await new Promise(resolve => setTimeout(resolve, 0))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("iframe.preview-frame")).toBeNull()
    expect(editor.shadowRoot!.querySelector(".document-stage")!.getAttribute("aria-busy")).toBe("false")
  })

  it("cancels media capture before hiding the editor frame for preview", async () => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const audio = iframe.contentDocument!.createElement("audio")
    const video = iframe.contentDocument!.createElement("video")
    audio.setAttribute("autoplay", "")
    iframe.contentDocument!.body.append(audio, video)
    const pauseAudio = vi.spyOn(audio, "pause").mockImplementation(() => {})
    const pauseVideo = vi.spyOn(video, "pause").mockImplementation(() => {})
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete

    expect(execute).toHaveBeenCalledWith({type: "cancelMediaCapture"})
    expect(pauseAudio).toHaveBeenCalledOnce()
    expect(pauseVideo).toHaveBeenCalledOnce()
    expect(audio.hasAttribute("autoplay")).toBe(true)
    expect(iframe.hidden).toBe(true)
  })

  it.each(["Open", "New"])("returns to editing when %s replaces a document in Preview", async action => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const initializeFrame = host.initializeEditorFrame.bind(host)
    vi.spyOn(host as {initializeEditorFrame(frame: HTMLIFrameElement): void}, "initializeEditorFrame").mockImplementation(frame => {
      if(frame === host.editorIframe()) wirePackageLoadCompletion(frame.contentWindow!)
      initializeFrame(frame)
    })
    const root = editor.shadowRoot!
    const ribbon = root.querySelector<AppRibbon>("app-ribbon")!
    iframe.contentDocument!.body.innerHTML = "<p>Previous lesson</p>"
    await host.enterPreview()
    await vi.waitFor(() => expect(root.querySelector("iframe.preview-frame")).not.toBeNull())
    expect(iframe.hidden).toBe(true)
    vi.stubGlobal("confirm", () => true)

    if(action === "Open") {
      const file = new File(["<p>Opened lesson</p>"], "opened.html", {type: "text/html"})
      const picker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
        .mockResolvedValueOnce([{name: file.name, getFile: async () => file}])
      vi.stubGlobal("showOpenFilePicker", picker)
      vi.spyOn(host, "rememberOpenedDocument").mockResolvedValue({id: "opened", kind: "local"})
      const openFromMenu = async () => {
        ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!
          .dispatchEvent(new CustomEvent("ribbon-tab-select", {detail: {label: "File"}, bubbles: true}))
        await ribbon.updateComplete
        const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
        await menu.updateComplete
        menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Open"]')!.click()
      }
      const preview = root.querySelector("iframe.preview-frame")
      await openFromMenu()
      await vi.waitFor(() => expect(host.fileOperationActive).toBe(false))
      expect(picker).toHaveBeenCalledOnce()
      expect(root.querySelector("iframe.preview-frame")).toBe(preview)
      await openFromMenu()
    }
    else {
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "N", code: "KeyN", altKey: true, shiftKey: true, cancelable: true}))
    }

    await vi.waitFor(() => expect(host.frameRevision).toBe(1))
    await editor.updateComplete
    const replacement = root.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    expect(replacement).not.toBe(iframe)
    await vi.waitFor(() => expect(host.fileOperationActive).toBe(false))
    await editor.updateComplete
    expect(root.querySelector("iframe.preview-frame")).toBeNull()
    expect(replacement.hidden).toBe(false)
    expect(replacement.inert).toBe(false)
    expect(replacement.contentDocument!.body.textContent?.trim()).toBe(action === "Open" ? "Opened lesson" : "")
    expect(host.previewEditingLocked).toBe(false)
  })

  it("removes authored executable content from the preview copy", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<style>body { display: none }</style><link rel="stylesheet"><button onclick="alert(1)" formaction="javascript:alert(2)" srcdoc="<script>evil()</script>" style="color: red">Run</button><script>window.evil = true</script>'
    const previewHTML = (editor as unknown as {currentPreviewHTML(): string}).currentPreviewHTML()
    expect(previewHTML).toContain("Run")
    expect(previewHTML).not.toContain("onclick")
    expect(previewHTML).not.toContain("formaction")
    expect(previewHTML).not.toContain("srcdoc")
    expect(previewHTML).toContain('style="color: red"')
    expect(previewHTML).toContain("display: none")
    expect(previewHTML).not.toContain('href="javascript:')
    expect(previewHTML).not.toContain("window.evil")
  })

  it("preserves authored carousel fragments while stripping scripts from the preview copy", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.className = "ww-slides"
    iframe.contentDocument!.body.innerHTML = '<nav class="ww-slides-navigation"><a href="#slide-one">Slide one</a></nav><section id="slide-one" class="ww-slide">One</section><script>window.untrusted = true</script>'

    const source = iframe.contentDocument!
    expect(source.querySelector<HTMLAnchorElement>('nav.ww-slides-navigation a')!.getAttribute("href")).toBe("#slide-one")
    const previewHTML = (editor as unknown as {currentPreviewHTML(): string}).currentPreviewHTML()
    const preview = new DOMParser().parseFromString(previewHTML, "text/html")
    expect(preview.querySelector<HTMLAnchorElement>('nav.ww-slides-navigation a')!.getAttribute("href")).toBe("#slide-one")
    expect(preview.querySelectorAll("script")).toHaveLength(0)
    expect(source.querySelector("script")).not.toBeNull()
  })

  it("includes the scoped registry adapter before widget modules in preview", async () => {
    const {editor, iframe} = await mountEditor()
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]
    iframe.contentDocument!.body.innerHTML = '<webwriter-demo contenteditable="true"></webwriter-demo>'
    const previewHTML = (editor as unknown as {currentPreviewHTML(): string}).currentPreviewHTML()
    const parsed = new DOMParser().parseFromString(previewHTML, "text/html")
    const scripts = Array.from(parsed.querySelectorAll("script"))
    const policy = parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")!
    const nonce = /'nonce-([^']+)'/.exec(policy)![1]
    expect(scripts.every(script => script.getAttribute("nonce") === nonce)).toBe(true)
    expect(scripts[0].id).toBe("webwriter-scoped-registry")
    expect(scripts[0].textContent).toBeTruthy()
    expect(scripts[0].hasAttribute("src")).toBe(false)
    expect(scripts.slice(1).filter(script => script.hasAttribute("src")).map(script => script.src)).toEqual(demoPackage.scripts)
    expect(parsed.querySelector("webwriter-demo")?.getAttribute("contenteditable")).toBe("true")
    expect(parsed.body.innerHTML).not.toContain("◆")
  })

  it("selects only present widgets' assets and refreshes after DOM changes", async () => {
    const {editor, iframe} = await mountEditor()
    const usedScript = "https://example.test/used.js"
    const usedStyle = "https://example.test/used.css"
    const unusedScript = "https://example.test/unused.js"
    const unusedStyle = "https://example.test/unused.css"
    ;(editor as any).installedPackages = [{
      ...demoPackage,
      scripts: [usedScript, unusedScript], styles: [usedStyle, unusedStyle],
      members: [
        {...demoPackage.members[0], tagName: "used-widget", scriptUrl: usedScript, styleUrl: usedStyle},
        {...demoPackage.members[0], tagName: "unused-widget", scriptUrl: unusedScript, styleUrl: unusedStyle},
      ],
    }]
    const source = iframe.contentDocument!
    source.body.innerHTML = '<section><template><used-widget></used-widget></template><used-widget></used-widget></section>'
    const preview = () => new DOMParser().parseFromString((editor as any).currentPreviewHTML(), "text/html")
    const parsed = preview()
    expect(parsed.querySelector("#webwriter-scoped-registry")?.textContent).toBeTruthy()
    expect(Array.from(parsed.querySelectorAll("script[src]")).map(script => script.getAttribute("src"))).toEqual([usedScript])
    expect(Array.from(parsed.querySelectorAll('link[rel="stylesheet"]')).map(link => link.getAttribute("href"))).toEqual([usedStyle])
    source.body.replaceChildren()
    const empty = preview()
    expect(empty.querySelector("script[src], link[rel='stylesheet']")).toBeNull()
    expect(empty.getElementById("webwriter-document-viewer")).not.toBeNull()
    expect(empty.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")).not.toContain("unsafe-eval")
  })

  it("adds the canvas layout runtime only when needed and trusts its nonce", async () => {
    const {editor, iframe} = await mountEditor()
    const source = iframe.contentDocument!
    source.body.className = "ww-canvas"
    source.body.innerHTML = '<p>Canvas content</p><script id="webwriter-canvas-viewer">untrusted()</script>'
    const preview = () => new DOMParser().parseFromString((editor as any).currentPreviewHTML(), "text/html")
    const parsed = preview()
    const scripts = parsed.querySelectorAll("script")
    expect(scripts).toHaveLength(1)
    expect(scripts[0].id).toBe("webwriter-canvas-viewer")
    expect(scripts[0].textContent).toContain("canvasReader.mount(loadCanvasSnapdom)")
    expect(scripts[0].textContent).not.toContain("untrusted()")
    const policy = parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")!
    expect(scripts[0].getAttribute("nonce")).toBe(/'nonce-([^']+)'/.exec(policy)![1])
    expect(source.getElementById("webwriter-canvas-viewer")!.textContent).toBe("untrusted()")
    source.body.className = "ww-slides"
    expect(preview().querySelector("script")).toBeNull()
  })

  it("adds the optional document reader to preview with a trusted nonce and delegates preview permissions", async () => {
    const {editor, iframe} = await mountEditor()
    const source = iframe.contentDocument!
    source.body.innerHTML = '<h1 id="intro">Intro</h1><figure id="diagram"><img><figcaption>Diagram</figcaption></figure><script id="webwriter-document-viewer">untrusted()</script>'
    const preview = new DOMParser().parseFromString((editor as any).currentPreviewHTML(), "text/html")
    const script = preview.getElementById("webwriter-document-viewer")!
    expect(script.textContent).toContain("documentReader.mount(")
    expect(script.textContent).not.toContain("untrusted()")
    const policy = preview.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")!
    expect(script.getAttribute("nonce")).toBe(/'nonce-([^']+)'/.exec(policy)![1])
    expect(source.getElementById("webwriter-document-viewer")!.textContent).toBe("untrusted()")
    ;(editor as any).previewActive = true
    await editor.updateComplete
    const previewFrame = editor.shadowRoot!.querySelector("iframe.preview-frame")!
    expect(previewFrame.hasAttribute("allowfullscreen")).toBe(true)
    expect(previewFrame.getAttribute("allow")?.split("; ")).toEqual([
      "camera", "microphone", "display-capture", "geolocation", "clipboard-read", "clipboard-write",
      "accelerometer", "gyroscope", "magnetometer",
    ])
    expect(previewFrame.getAttribute("sandbox")).toContain("allow-modals")
    expect(previewFrame.getAttribute("sandbox")).toContain("allow-popups allow-popups-to-escape-sandbox")
  })

  it("saves from the document pane only through an authenticated preview message", async () => {
    const {editor} = await mountEditor()
    ;(editor as any).previewActive = true
    await editor.updateComplete
    const frame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.preview-frame")!
    const download = vi.spyOn(editor as any, "downloadDocument").mockResolvedValue(undefined)
    const message = (source: Window | null, nonce: string, origin = window.location.origin) => new MessageEvent("message", {
      source, origin, data: {type: "preview-frame-save", bridgeNonce: nonce},
    })
    const nonce = (editor as any).bridgeNonce
    expect((editor as any).handlePreviewMessage(message(window, nonce))).toBe(false)
    expect((editor as any).handlePreviewMessage(message(frame.contentWindow, "wrong"))).toBe(false)
    expect((editor as any).handlePreviewMessage(message(frame.contentWindow, nonce, "https://untrusted.test"))).toBe(false)
    expect(download).not.toHaveBeenCalled()
    expect((editor as any).handlePreviewMessage(message(frame.contentWindow, nonce))).toBe(true)
    expect(download).toHaveBeenCalledOnce()
  })

  it("opens Feedback only for the current authenticated preview frame", async () => {
    const {editor} = await mountEditor()
    Object.assign(editor, {previewActive: true})
    await editor.updateComplete
    const frame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.preview-frame")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    await toolbox.updateComplete
    const nonce = (editor as unknown as {bridgeNonce: string}).bridgeNonce
    const request = (source: Window | null, bridgeNonce: string, origin = window.location.origin) =>
      window.dispatchEvent(new MessageEvent("message", {source, origin, data: {type: "preview-frame-open-feedback", bridgeNonce}}))
    request(window, nonce)
    request(frame.contentWindow, "wrong")
    request(frame.contentWindow, nonce, "https://untrusted.test")
    expect(toolbox.activeTool).toBeNull()
    request(frame.contentWindow, nonce)
    expect(toolbox.activeTool).toBe("Feedback")
  })

  it("exits preview from the file tab", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    expect((editor as unknown as {previewActive: boolean}).previewActive).toBe(true)
    expect(ribbon.shadowRoot!.querySelectorAll("ribbon-tab")).toHaveLength(1)
    expect(ribbon.activeMenu).toBe("File")
  })

  it("keeps repeated preview toggles on the same ribbon animation path", async () => {
    const {editor, iframe} = await mountEditor()
    // Theme fidelity is covered separately; these repeated transitions need
    // only a small stylesheet rather than parsing the full theme each time.
    iframe.contentDocument!.querySelector('style[data-ww-theme="base"]')!.textContent = "p { color: black }"
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!

    for(let cycle = 0; cycle < 3; cycle++) {
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
      await editor.updateComplete
      await ribbon.updateComplete
      expect((ribbon as AppRibbon).expanded).toBe(true)
      expect(ribbon.hasAttribute("preview-transition")).toBe(true)
      expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")
        ?.querySelector(".preview-label")).toBeNull()

      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
      await editor.updateComplete
      await ribbon.updateComplete
      expect((ribbon as AppRibbon).expanded).toBe(true)
      expect(ribbon.hasAttribute("preview-transition")).toBe(true)
    }
  })

  it("opens the preview Feedback toolbox and delivers messages through the live session", async () => {
    const {editor, iframe} = await mountEditor()
    const authored = iframe.contentDocument!.body.innerHTML
    const host = new LiveSession({id: "editor-feedback", role: "host", baseHTML: "<p>Document</p>"})
    const participant = new LiveSession({id: "editor-feedback", role: "learner", learner: {id: "ada", name: "Ada", color: "#123456"}})
    try {
      ;(editor as any).previewActive = true
      ;(editor as any).connectLiveSession(host, "host")
      await editor.updateComplete
      const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
      await toolbox.updateComplete
      expect(toolbox.hidden).toBe(false)
      const timeline = editor.shadowRoot!.querySelector("live-session-controls")!
      expect(getComputedStyle(timeline).backgroundColor).toBe("transparent")
      expect(getComputedStyle(timeline).borderBottomWidth).toBe("0px")
      expect(toolbox.preview).toBe(true)
      toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Feedback"]')!.click()
      await toolbox.updateComplete
      expect(toolbox.activeTool).toBe("Feedback")
      const send = new CustomEvent("live-feedback-send", {detail: {participant: "ada", text: "Well done!"}, cancelable: true})
      expect(toolbox.dispatchEvent(send)).toBe(true)
      await vi.waitFor(() => expect(toolbox.feedbackMessages).toHaveLength(1))
      expect(participant.feedback[0].text).toBe("Well done!")
      expect(iframe.contentDocument!.body.innerHTML).toBe(authored)
      participant.stop()
      const stale = new CustomEvent("live-feedback-send", {detail: {participant: "ada", text: "Too late"}, cancelable: true})
      expect(toolbox.dispatchEvent(stale)).toBe(false)
    }
    finally { participant.destroy(); editor.remove() }
  })

  it("keeps serverless recordings local and resets the clock between preview and live", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete
    const controls = editor.shadowRoot!.querySelector<LiveSessionControls>("live-session-controls")!
    const share = () => ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Learners"] ribbon-button[label="QR"]')!
    const toggle = () => ribbon.shadowRoot!.querySelector<HTMLInputElement>('input[role="switch"][aria-label="Share"]')!
    const toggleRecording = (enabled: boolean) => (editor as any).toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled}}))
    expect(toggle().disabled).toBe(true)
    expect(share().disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Sharing"] ribbon-button[label="Download"]')).not.toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Sharing"] ribbon-button[label="Print"]')).not.toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Sharing"] ribbon-button[label="Share"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector(".learners-summary")).toBeNull()
    expect(controls.live).toBe(false)
    expect((editor as unknown as {liveSession: LiveSession | null}).liveSession).toBeNull()

    vi.useFakeTimers()
    try {
      // Restart the clock under fake timers so its lifecycle can be verified.
      const playback = editor as unknown as {resetLivePlayback(): void}
      playback.resetLivePlayback()
      await vi.advanceTimersByTimeAsync(2500)
      await editor.updateComplete
      expect(controls.currentTime).toBe(2.5)
      expect(controls.duration).toBe(2.5)
      await toggleRecording(true)
      await editor.updateComplete
      await ribbon.updateComplete
      expect(share().disabled).toBe(true)
      expect((editor as any).liveSessionLink).toBe("")
      expect(ribbon.shadowRoot!.querySelector(".learners-summary")?.textContent).toContain("Waiting for participants")
      expect(controls.live).toBe(true)
      expect(controls.currentTime).toBe(0)
      const session = (editor as unknown as {liveSession: LiveSession}).liveSession
      await vi.advanceTimersByTimeAsync(1500)
      await editor.updateComplete
      expect(controls.currentTime).toBe(1.5)
      const stopping = toggleRecording(false)
      await editor.updateComplete
      await ribbon.updateComplete
      const stopDialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#live-session-stop-dialog")!
      expect(stopDialog.open).toBe(true)
      expect(session.status).toBe("connected")
      stopDialog.querySelector<HTMLButtonElement>(".primary")!.click()
      await vi.advanceTimersByTimeAsync(0)
      await stopping
      await editor.updateComplete
      await ribbon.updateComplete
      expect(session.status).toBe("stopped")
      expect(share().disabled).toBe(true)
      expect(controls.live).toBe(false)
      expect(controls.currentTime).toBe(0)
      expect(controls.duration).toBe(0)
      expect(ribbon.shadowRoot!.querySelector(".learners-summary")).toBeNull()
      editor.remove()
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { vi.useRealTimers() }
  })

  it.each(["share", "preview", "return to editing", "file", "compact file", "new shortcut"])("requires confirmation to stop a live session through %s", async action => {
    const {editor} = await mountEditor(editor => Object.assign(editor, {backendState: "connected"}))
    const host = editor as any
    await host.enterPreview()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const session = host.liveSession as LiveSession
    const focusEditor = vi.spyOn(host, "focusEditor")
    const newDocument = vi.spyOn(host, "newDocument").mockResolvedValue(undefined)
    const learner = new LiveSession({id: session.id, role: "learner"})
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await editor.updateComplete
    await ribbon.updateComplete
    if(action === "compact file") {
      Object.assign(ribbon, {heightConstrained: true})
      await ribbon.updateComplete
    }
    const share = () => ribbon.shadowRoot!.querySelector<HTMLInputElement>('input[role="switch"][aria-label="Share"]')!
    const requestStop = () => {
      if(action === "share") share().click()
      else if(action === "preview") host.handleRibbonButtonClick(new CustomEvent("ribbon-button-click", {detail: {label: "Preview"}}))
      else if(action === "file") ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!
        .dispatchEvent(new CustomEvent("ribbon-tab-select", {detail: {label: "File"}, bubbles: true}))
      else if(action === "compact file") ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
      else if(action === "new shortcut") document.dispatchEvent(new KeyboardEvent("keydown", {key: "N", code: "KeyN", altKey: true, shiftKey: true, cancelable: true}))
      else ribbon.dispatchEvent(new Event("ribbon-preview-exit", {bubbles: true, composed: true}))
    }
    try {
      requestStop()
      const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#live-session-stop-dialog")!
      await vi.waitFor(() => expect(dialog.open).toBe(true))
      expect(session.status).toBe("connected")
      expect(learner.status).toBe("connected")
      expect(host.previewActive).toBe(true)
      expect(share().checked).toBe(true)
      expect(ribbon.shadowRoot!.querySelector<HTMLElement>("#ribbon-file-menu")!.hidden).toBe(true)
      dialog.querySelector<HTMLButtonElement>("footer button")!.click()
      await Promise.resolve()
      expect(host.liveSession).toBe(session)
      expect(host.liveSessionActive).toBe(true)
      expect(host.previewActive).toBe(true)
      expect(learner.status).toBe("connected")
      expect(share().checked).toBe(true)
      expect(newDocument).not.toHaveBeenCalled()

      requestStop()
      await vi.waitFor(() => expect(dialog.open).toBe(true))
      dialog.querySelector<HTMLButtonElement>(".primary")!.click()
      await vi.waitFor(() => expect(host.liveSession).toBeNull())
      expect(session.status).toBe("stopped")
      expect(learner.status).toBe("stopped")
      expect(host.liveSessionActive).toBe(false)
      expect(host.previewActive).toBe(action === "share")
      if(action === "new shortcut") await vi.waitFor(() => expect(newDocument).toHaveBeenCalledOnce())
      if(action === "file" || action === "compact file") {
        await vi.waitFor(() => expect(ribbon.menuOpen).toBe(true))
        expect(ribbon.shadowRoot!.querySelector<HTMLElement>("#ribbon-file-menu")!.hidden).toBe(false)
        expect(focusEditor).not.toHaveBeenCalled()
      }
    }
    finally {learner.destroy(); host.disposeLiveSession()}
  })

  it("retains a concluded session until its replay is saved, including after leaving preview", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    await host.enterPreview()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const session = host.liveSession as LiveSession
    const learner = new LiveSession({id: session.id, role: "learner", learner: {id: "ada", name: "Ada", color: "red"}})
    learner.publish({kind: "pointer", pointer: {x: 0.1, y: 0.2}})
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await editor.updateComplete
    const exiting = host.exitPreview()
    await vi.waitFor(() => expect(ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#live-session-stop-dialog")!.open).toBe(true))
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>("#live-session-stop-dialog .primary")!.click()
    await exiting
    await editor.updateComplete
    await ribbon.updateComplete
    expect(host.completedLiveReplays).toHaveLength(1)
    expect(host.completedLiveReplays[0].steps).toEqual([expect.objectContaining({learner: "ada", kind: "pointer"})])
    await host.enterPreview()
    await editor.updateComplete; await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.reader-replay-save')!.disabled).toBe(false)
    const picker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
    vi.stubGlobal("showSaveFilePicker", picker)
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.reader-replay-save')!.click()
    await vi.waitFor(() => expect(picker).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(host.savingLiveReplay).toBe(false))
    expect(host.completedLiveReplays).toHaveLength(1)
    const report = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    const abort = vi.fn().mockResolvedValue(undefined)
    picker.mockResolvedValueOnce({name: "lesson.wwreplay", createWritable: async () => ({write: vi.fn().mockRejectedValue(new Error("Disk full")), close: vi.fn(), abort})})
    await host.saveLiveReplay()
    expect(report).toHaveBeenCalledWith(expect.objectContaining({message: "Disk full"}))
    expect(abort).toHaveBeenCalledOnce()
    expect(host.completedLiveReplays).toHaveLength(1)
    const write = vi.fn(), close = vi.fn()
    picker.mockResolvedValueOnce({name: "lesson.wwreplay", createWritable: async () => ({write, close})})
    await host.saveLiveReplay()
    expect(picker.mock.calls[2][0].suggestedName).toMatch(/\.wwreplay$/)
    const saved = await readLiveSessionReplayFile(new Blob(write.mock.calls.map(call => call[0])))
    expect(saved).toMatchObject({format: "webwriter-live-replay", steps: [expect.objectContaining({learner: "ada"})]})
    expect(close).toHaveBeenCalledOnce()
    expect(host.completedLiveReplays).toHaveLength(0)
    learner.destroy(); editor.remove()
  })

  it("saves a running host session as a snapshot without stopping it or deleting its recovery", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor(), host = editor as any
    await host.enterPreview()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const session = host.liveSession as LiveSession
    const learner = new LiveSession({id: session.id, role: "learner", learner: {id: "ada", name: "Ada", color: "red"}})
    const write = vi.fn(), close = vi.fn()
    const deleteCount = vi.mocked(liveRecovery.deleteRecoveredSession).mock.calls.length
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({name: "snapshot.wwreplay", createWritable: async () => ({write, close})}))
    try {
      learner.publish({kind: "pointer", pointer: {x: .1, y: .2}})
      await editor.updateComplete
      const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
      await ribbon.updateComplete
      const button = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".reader-replay-save")!
      expect(button.disabled).toBe(false)
      button.click()
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
      const replay = await readLiveSessionReplayFile(new Blob(write.mock.calls.map(call => call[0])))
      expect(replay.steps).toEqual([expect.objectContaining({learner: "ada", kind: "pointer"})])
      expect(session.status).not.toBe("stopped")
      expect(host.liveSession).toBe(session)
      expect(host.completedLiveReplays).toHaveLength(0)
      expect(liveRecovery.deleteRecoveredSession).toHaveBeenCalledTimes(deleteCount)
      learner.publish({kind: "pointer", pointer: {x: .2, y: .3}})
      expect(session.steps).toHaveLength(2)
    }
    finally { learner.destroy(); editor.remove() }
  })

  it("copies an opened replay incrementally when no unsaved session is waiting", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor(), host = editor as any
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2, baseHTML: "<p>Start</p>", learners: [], steps: [], feedback: []}
    const source = await createLiveSessionReplayFile(replay), write = vi.fn(), close = vi.fn()
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => source}]))
    const savePicker = vi.fn().mockResolvedValue({name: "copy.wwreplay", createWritable: async () => ({write, close})})
    vi.stubGlobal("showSaveFilePicker", savePicker)
    try {
      await host.openLiveReplay()
      await host.saveLiveReplay()
      expect(close).toHaveBeenCalledOnce()
      expect(await readLiveSessionReplayFile(new Blob(write.mock.calls.map(call => call[0])))).toEqual(replay)
      expect(host.replayActive).toBe(true)
      const abort = vi.fn().mockResolvedValue(undefined), failedClose = vi.fn()
      savePicker.mockResolvedValueOnce({name: "failed.wwreplay", createWritable: async () => ({
        write: vi.fn().mockRejectedValue(new Error("Disk full")), close: failedClose, abort,
      })})
      const report = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
      await host.saveLiveReplay()
      expect(abort).toHaveBeenCalledOnce()
      expect(failedClose).not.toHaveBeenCalled()
      expect(report).toHaveBeenCalledWith(expect.objectContaining({message: "Disk full"}))
      expect(host.replayActive).toBe(true)
    }
    finally { editor.remove() }
  })

  it("downloads replay data when the browser has no file picker", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const replay = {format: "webwriter-live-replay", startedAt: 1, endedAt: 2,
      baseHTML: "<p>Start</p>", learners: [], steps: [], feedback: []}
    host.completedLiveReplays = [replay, {...replay, startedAt: 3, endedAt: 4}]
    vi.stubGlobal("showSaveFilePicker", undefined)
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:replay")
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    await host.saveLiveReplay()
    const data = await readLiveSessionReplayFile(create.mock.calls[0][0] as Blob)
    expect(data.format).toBe("webwriter-live-replay")
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toMatch(/\.wwreplay$/)
    expect(host.completedLiveReplays).toHaveLength(1)
    await host.saveLiveReplay()
    expect(host.completedLiveReplays).toHaveLength(0)
    editor.remove()
  })

  it("restores recovered recordings and deletes only the recording whose notification is closed", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const records = [
      {id: "one", title: "Lesson", startedAt: 1, updatedAt: 2, finished: false, sequence: 1},
      {id: "two", title: "Next", startedAt: 3, updatedAt: 4, finished: true, sequence: 1},
    ]
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2, baseHTML: "<p>Start</p>", learners: [], steps: [], feedback: []}
    vi.mocked(liveRecovery.listRecoveredSessions).mockImplementation(async () => [...records])
    vi.mocked(liveRecovery.readRecoveredSession).mockResolvedValue(replay)
    vi.mocked(liveRecovery.deleteRecoveredSession).mockImplementation(async id => { const index = records.findIndex(record => record.id === id); if(index >= 0) records.splice(index, 1) })
    const {editor} = await mountEditor(), host = editor as any
    try {
      await vi.waitFor(() => expect(host.recoveredLiveReplays).toHaveLength(2))
      await editor.updateComplete
      const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
      await ribbon.updateComplete
      expect(ribbon.shadowRoot!.querySelector(".preview-recovery-alert")?.textContent).toBe("!")
      expect(editor.shadowRoot!.querySelector(".replay-recovery-notice")).toBeNull()
      await host.enterPreview()
      await editor.updateComplete; await ribbon.updateComplete
      expect(ribbon.shadowRoot!.querySelector(".recovery-popover")?.textContent).toContain("Lesson")
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".recovery-restore")!.click()
      await vi.waitFor(() => expect(host.replayActive).toBe(true))
      await vi.waitFor(() => expect(host.recoveringLiveReplay).toBe(false))
      expect(host.restoredRecoveryId).toBe("one")
      expect(records).toHaveLength(2)
      await editor.updateComplete; await ribbon.updateComplete
      expect(ribbon.shadowRoot!.querySelector(".recovery-popover")?.textContent).toContain("Recording restored")
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".recovery-close")!.click()
      await vi.waitFor(() => expect(records).toHaveLength(1))
      await vi.waitFor(() => expect(host.deletingRecoveredReplay).toBe(false))
      expect(host.replayActive).toBe(true)
      expect(records[0].id).toBe("two")
      expect(host.recoveredLiveReplays[0].id).toBe("two")
      await editor.updateComplete; await ribbon.updateComplete
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".recovery-close")!.click()
      await vi.waitFor(() => expect(records).toHaveLength(0))
      await vi.waitFor(() => expect(host.recoveredLiveReplays).toHaveLength(0))
      await vi.waitFor(() => expect(host.deletingRecoveredReplay).toBe(false))
      await editor.updateComplete; await ribbon.updateComplete
      expect(ribbon.shadowRoot!.querySelector(".preview-recovery-alert")).toBeNull()
      expect(ribbon.shadowRoot!.querySelector(".recovery-popover")).toBeNull()
    }
    finally {
      vi.mocked(liveRecovery.listRecoveredSessions).mockImplementation(async () => [])
      editor.remove()
    }
  })

  it("does not expose host recovery controls when opening a learner link", async () => {
    const record = {id: "one", title: "Lesson", startedAt: 1, updatedAt: 2, finished: true, sequence: 1}
    vi.mocked(liveRecovery.listRecoveredSessions).mockResolvedValue([record])
    const {editor} = await mountEditor(), host = editor as any
    try {
      await vi.waitFor(() => expect(host.recoveredLiveReplays).toHaveLength(1))
      vi.spyOn(host, "liveSessionIdFromURL").mockReturnValue("learner-session")
      await host.refreshRecoveredLiveReplays()
      await editor.updateComplete
      expect(host.recoveredLiveReplays).toHaveLength(0)
      expect(editor.shadowRoot!.querySelector(".replay-recovery-notice")).toBeNull()
    }
    finally { vi.mocked(liveRecovery.listRecoveredSessions).mockResolvedValue([]); editor.remove() }
  })

  it("keeps the recovery notice when restore or deletion fails", async () => {
    const record = {id: "broken", title: "Lesson", startedAt: 1, updatedAt: 2, finished: false, sequence: 1}
    vi.mocked(liveRecovery.listRecoveredSessions).mockResolvedValue([record])
    vi.mocked(liveRecovery.readRecoveredSession).mockRejectedValue(new Error("Recovery is incomplete"))
    vi.mocked(liveRecovery.deleteRecoveredSession).mockRejectedValue(new Error("Storage unavailable"))
    const {editor} = await mountEditor(), host = editor as any
    try {
      await vi.waitFor(() => expect(host.recoveredLiveReplays).toHaveLength(1))
      await host.enterPreview()
      await editor.updateComplete
      const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
      await ribbon.updateComplete
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".recovery-restore")!.click()
      await vi.waitFor(() => expect(host.fileError).toContain("Recovery is incomplete"))
      expect(host.recoveredLiveReplays).toHaveLength(1)
      await vi.waitFor(() => expect(host.recoveringLiveReplay).toBe(false))
      await editor.updateComplete; await ribbon.updateComplete
      ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".recovery-close")!.click()
      await vi.waitFor(() => expect(host.fileError).toContain("Storage unavailable"))
      expect(host.recoveredLiveReplays).toHaveLength(1)
      expect(ribbon.shadowRoot!.querySelector(".recovery-popover")).not.toBeNull()
    }
    finally {
      vi.mocked(liveRecovery.listRecoveredSessions).mockResolvedValue([])
      vi.mocked(liveRecovery.readRecoveredSession).mockImplementation(async () => { throw new Error("No recovered session") })
      vi.mocked(liveRecovery.deleteRecoveredSession).mockImplementation(async () => {})
      editor.remove()
    }
  })

  it("reports a local recovery failure during a host session", async () => {
    let fail!: (error: Error) => void
    vi.spyOn(liveRecovery, "LiveSessionRecovery").mockImplementation(function(_session, _started, _title, onError) {
      fail = onError
      return {finish: async () => {}} as unknown as liveRecovery.LiveSessionRecovery
    })
    const {editor} = await mountEditor(), host = editor as any
    try {
      const session = new LiveSession({id: "recovery-error-test", role: "host", baseHTML: "<p>Start</p>"})
      host.resetLivePlayback()
      host.connectLiveSession(session, "host")
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector(".replay-recovery-notice")).toBeNull()
      fail(new Error("Disk full"))
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector(".replay-recovery-notice")!.textContent).toContain("Local recovery is unavailable")
      expect(host.fileError).toContain("Disk full")
    }
    finally { editor.remove() }
  })

  it("sends host activity to an LRS only after the host explicitly starts delivery", async () => {
    const {editor} = await mountEditor(), host = editor as any
    vi.stubGlobal("crypto", webcrypto)
    const fetcher = vi.fn(async () => new Response("[]", {status: 200}))
    vi.stubGlobal("fetch", fetcher)
    try {
      const session = new LiveSession({id: "lrs-host-test", role: "host", baseHTML: "<p>Start</p>"})
      host.resetLivePlayback()
      host.connectLiveSession(session, "host")
      session.publish({learner: "ada", kind: "widget"})
      await Promise.resolve()
      expect(fetcher).not.toHaveBeenCalled()
      const start = new CustomEvent("start-live-lrs", {cancelable: true, detail: {endpoint: "https://school.example/xapi/", username: "key", password: "secret"}})
      host.startLiveLrs(start)
      expect(start.defaultPrevented).toBe(false)
      session.publish({learner: "ada", kind: "widget"})
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(host.lrsStatus?.queued).toBe(0))
      expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toHaveLength(1)
      host.stopLiveLrs()
      session.publish({learner: "ada", kind: "widget"})
      await Promise.resolve()
      expect(fetcher).toHaveBeenCalledOnce()
    }
    finally { editor.remove(); vi.unstubAllGlobals() }
  })

  it("sends an opened replay to the LRS only after explicit configuration", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    vi.stubGlobal("crypto", webcrypto)
    const {editor} = await mountEditor(), host = editor as any
    const replay = {format: "webwriter-live-replay" as const, sessionId: "saved", startedAt: 1, endedAt: 3, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1, lastSeen: 3, connected: false}], feedback: [],
      steps: [{id: "one", learner: "ada", time: 2, kind: "widget" as const}]}
    const replayFile = await createLiveSessionReplayFile(replay)
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => replayFile}]))
    const fetcher = vi.fn(async () => new Response(null, {status: 204}))
    vi.stubGlobal("fetch", fetcher)
    try {
      await host.openLiveReplay()
      expect(host.replayActive).toBe(true)
      expect(fetcher).not.toHaveBeenCalled()
      const event = new CustomEvent("start-replay-lrs", {cancelable: true, detail: {endpoint: "https://school.example/xapi", username: "key", password: "secret"}})
      host.startReplayLrs(event)
      expect(event.defaultPrevented).toBe(false)
      await vi.waitFor(() => expect(host.replayLrsStatus).toMatchObject({state: "done", confirmed: 1}))
      expect(fetcher).toHaveBeenCalledOnce()
      expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("PUT")
      expect(host.replayActive).toBe(true)
    }
    finally { editor.remove(); vi.unstubAllGlobals() }
  })

  it("opens and seeks a replay without executing dependencies from the file", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const openReplay = vi.spyOn(host as {openLiveReplay(event?: Event): Promise<unknown>}, "openLiveReplay")
    const authored = host.editorDocument?.documentElement.outerHTML
    const recorder = new IncrementalPreviewRecorder("<p>First</p>")
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    const replay = {format: "webwriter-live-replay", startedAt: 1000, endedAt: 5000,
      baseHTML: "<p>Original</p>", previewDependencies: {packages: [{scripts: ["https://untrusted.example/evil.js"]}], importMap: null},
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1000, lastSeen: 5000, connected: false}],
      steps: [{id: "one", time: 2000, learner: "ada", kind: "document", htmlCheckpoint: encode(recorder.checkpoint())},
        {id: "two", time: 3000, learner: "ada", kind: "document", htmlUpdate: encode(recorder.capture("<p>Edited</p>")!), scroll: {top: 120, left: 4}}],
      feedback: [{id: "feedback", participant: "ada", time: 2500, text: "Good work"}]}
    const replayFile = await createLiveSessionReplayFile(replay as any)
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => replayFile}]))
    try {
      await host.enterPreview()
      const openRibbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
      await editor.updateComplete
      await openRibbon.updateComplete
      openRibbon.shadowRoot!.querySelector<HTMLButtonElement>('.reader-replay-open')!.click()
      expect(openReplay).toHaveBeenCalledOnce()
      await openReplay.mock.results[0].value
      expect(host.replayActive).toBe(true)
      expect(host.replaySelectedLearner).toBe("ada")
      expect(host.liveSession).toBeNull()
      expect(host.liveStreamDuration).toBe(4)
      expect(host.liveStreamPlaying).toBe(false)
      expect(host.previewDocumentHTML).not.toContain("untrusted.example")
      await editor.updateComplete
      const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
      await ribbon.updateComplete
      expect(ribbon.shadowRoot!.querySelector('input[aria-label="Share"]')).toBeNull()
      ribbon.dispatchEvent(new CustomEvent("live-learner-toggle", {detail: {id: "ada", enabled: false}, bubbles: true, composed: true}))
      expect(host.liveLearners[0].enabled).toBe(false)
      ribbon.dispatchEvent(new CustomEvent("live-learner-toggle", {detail: {id: "ada", enabled: true}, bubbles: true, composed: true}))
      ribbon.dispatchEvent(new CustomEvent("replay-learner-select", {detail: {id: "ada"}, bubbles: true, composed: true}))
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      expect(host.liveStatesAtStep.get("ada").html).toBe("<p>First</p>")
      expect(host.previewDocumentHTML).toContain("First")
      expect(host.liveFeedback).toEqual([])
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 1.5}}))
      expect(host.liveStatesAtStep.get("ada").html).toBe("<p>First</p>")
      expect(host.liveFeedback).toEqual([expect.objectContaining({text: "Good work"})])
      const post = vi.spyOn(host, "postToPreview").mockImplementation(() => {})
      host.previewOpaque = true
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 2}}))
      expect(host.liveStatesAtStep.get("ada").html).toBe("<p>Edited</p>")
      expect(host.previewDocumentHTML).toContain("Edited")
      expect(host.liveFeedback).toEqual([expect.objectContaining({text: "Good work"})])
      expect(post).toHaveBeenCalledWith({type: "preview-frame-scroll", top: 120, left: 4})
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      expect(host.liveStatesAtStep.get("ada").html).toBe("<p>First</p>")
      expect(host.liveFeedback).toEqual([])
      vi.useFakeTimers()
      host.livePlaybackLastTick = Date.now()
      host.playLiveSession()
      await vi.advanceTimersByTimeAsync(600)
      expect(host.liveFeedback).toEqual([expect.objectContaining({text: "Good work"})])
      await vi.advanceTimersByTimeAsync(3400)
      expect(host.liveStreamTime).toBe(4)
      expect(host.liveStreamDuration).toBe(4)
      expect(host.liveStreamPlaying).toBe(false)
      await host.exitPreview(false)
      expect(host.replayActive).toBe(false)
      expect(host.completedLiveReplays).toHaveLength(0)
      expect(host.editorDocument?.documentElement.outerHTML).toBe(authored)
    }
    finally { vi.useRealTimers(); recorder.destroy(); editor.remove() }
  })

  it("rejects a malformed replay without changing the open document", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const report = vi.spyOn(host, "reportFileError").mockImplementation(() => {})
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => new File(['{"version":99}'], "bad.wwreplay")}]))
    await host.openLiveReplay()
    expect(report).toHaveBeenCalledOnce()
    expect(host.previewActive).toBe(false)
    expect(host.liveSessionActive).toBe(false)
    editor.remove()
  })

  it("preserves preview on cancellation and replaces an open replay only after validation", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor(), host = editor as any
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2, baseHTML: "<p>First replay</p>", learners: [], steps: [], feedback: []}
    const first = await createLiveSessionReplayFile(replay)
    const second = await createLiveSessionReplayFile({...replay, baseHTML: "<p>Second replay</p>"})
    const picker = vi.fn().mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
      .mockResolvedValueOnce([{getFile: async () => first}])
      .mockResolvedValueOnce([{getFile: async () => new Blob(["bad"])}])
      .mockResolvedValueOnce([{getFile: async () => second}])
    vi.stubGlobal("showOpenFilePicker", picker)
    try {
      await host.enterPreview()
      const source = host.previewDocumentHTML, selection = {marker: "preview bookmark"}
      host.previewSelection = selection
      await host.openLiveReplay()
      expect(host.previewActive).toBe(true)
      expect(host.previewDocumentHTML).toBe(source)
      await host.openLiveReplay()
      expect(host.previewDocumentHTML).toContain("First replay")
      expect(host.previewSelection).toBe(selection)
      const reader = host.replayReader, close = vi.spyOn(reader, "close")
      await host.openLiveReplay()
      expect(host.replayReader).toBe(reader)
      expect(host.previewDocumentHTML).toContain("First replay")
      expect(close).not.toHaveBeenCalled()
      await host.openLiveReplay()
      expect(close).toHaveBeenCalledOnce()
      expect(host.previewDocumentHTML).toContain("Second replay")
      expect(host.previewSelection).toBe(selection)
      await host.exitPreview(false)
    }
    finally { editor.remove() }
  })

  it("does not open a replay if preview is closed while the picker is pending", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor(), host = editor as any
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2, baseHTML: "<p>Replay</p>", learners: [], steps: [], feedback: []}
    const file = await createLiveSessionReplayFile(replay)
    let resolvePicker!: (handles: unknown[]) => void
    vi.stubGlobal("showOpenFilePicker", vi.fn(() => new Promise(resolve => { resolvePicker = resolve })))
    try {
      await host.enterPreview()
      host.replaySizeWarning = true
      const opening = host.openLiveReplay()
      await host.exitPreview(false)
      resolvePicker([{getFile: async () => file}])
      await opening
      expect(host.previewActive).toBe(false)
      expect(host.replayActive).toBe(false)
      expect(host.replaySizeWarning).toBe(false)
    }
    finally { editor.remove() }
  })

  it.each([[256 * 1024 * 1024, false], [256 * 1024 * 1024 + 1, true]])("warns without blocking replay playback for a file of %s bytes", async (size, warning) => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1, endedAt: 2, baseHTML: "<p>Start</p>", learners: [], steps: [], feedback: []}
    vi.spyOn(LiveSessionReplayClient.prototype, "open").mockResolvedValue(replay)
    vi.spyOn(LiveSessionReplayClient.prototype, "seek").mockResolvedValue({index: -1, stepCount: 0, revision: 1, states: []})
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => ({size})}]))
    await host.openLiveReplay()
    await editor.updateComplete
    expect(host.replayActive).toBe(true)
    expect(Boolean(editor.shadowRoot!.querySelector(".replay-size-warning"))).toBe(warning)
    if(warning) {
      expect(editor.shadowRoot!.querySelector(".replay-size-warning")!.textContent).toContain("256 MiB")
      editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Dismiss replay size warning"]')!.click()
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector(".replay-size-warning")).toBeNull()
    }
    await host.exitPreview(false)
    expect(host.replaySizeWarning).toBe(false)
    editor.remove()
  })

  it("clears the size warning if the replay cannot be opened", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    vi.spyOn(LiveSessionReplayClient.prototype, "open").mockRejectedValue(new Error("Invalid replay"))
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => ({size: 256 * 1024 * 1024 + 1})}]))
    await host.openLiveReplay()
    await editor.updateComplete
    expect(host.replayActive).toBe(false)
    expect(editor.shadowRoot!.querySelector(".replay-size-warning")).toBeNull()
    editor.remove()
  })

  it("terminates replay processing if the editor is disconnected while opening", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const terminate = vi.spyOn(ReplayTestWorker.prototype, "terminate")
    vi.spyOn(ReplayTestWorker.prototype, "postMessage").mockImplementation(() => {})
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => new Blob()}]))
    const opening = host.openLiveReplay()
    await vi.waitFor(() => expect(host.replayOpeningWorker).not.toBeNull())
    editor.remove()
    await opening
    expect(terminate).toHaveBeenCalledOnce()
    expect(host.replayActive).toBe(false)
  })

  it("retains the recording if the editor disconnects during replay export", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    host.completedLiveReplays = [{format: "webwriter-live-replay", startedAt: 1, endedAt: 2, baseHTML: "<p>Start</p>", learners: [], steps: [], feedback: []}]
    const terminate = vi.spyOn(ReplayTestWorker.prototype, "terminate")
    vi.spyOn(ReplayTestWorker.prototype, "postMessage").mockImplementation(() => {})
    vi.stubGlobal("showSaveFilePicker", vi.fn().mockResolvedValue({}))
    const saving = host.saveLiveReplay()
    await vi.waitFor(() => expect(host.replaySavingWorker).not.toBeNull())
    editor.remove()
    await saving
    expect(terminate).toHaveBeenCalledOnce()
    expect(host.completedLiveReplays).toHaveLength(1)
  })

  it("restores replay checkpoints when seeking between chunks", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const replay = {format: "webwriter-live-replay" as const, startedAt: 1000, endedAt: 90000, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 1000, lastSeen: 90000, connected: false}],
      steps: [2000, 34000, 66000].map((time, index) => ({id: String(index), time, learner: "ada", kind: "pointer" as const, pointer: {x: index / 10, y: 0}})), feedback: []}
    const file = await createLiveSessionReplayFile(replay)
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => file}]))
    try {
      await host.openLiveReplay()
      expect(host.liveSteps).toHaveLength(0)
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      expect(host.liveSteps).toHaveLength(0)
      expect(host.liveStatesAtStep.get("ada").pointer.x).toBe(0)
      const read = host.replayReader.seek.bind(host.replayReader)
      let release!: () => void
      const delayed = new Promise<void>(resolve => { release = resolve })
      vi.spyOn(host.replayReader, "seek").mockImplementation(async (...args: unknown[]) => {
        const [time, revision] = args as [number, number]
        if(time === 66000) await delayed
        return read(time, revision)
      })
      const later = host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 65}}))
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 33}}))
      release(); await later
      expect(host.liveStatesAtStep.get("ada").pointer.x).toBe(0.1)
      expect(host.liveStreamTime).toBe(33)
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 33}}))
      expect(host.liveSteps).toHaveLength(0)
      expect(host.liveStatesAtStep.get("ada").pointer.x).toBe(0.1)
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      expect(host.liveSteps).toHaveLength(0)
      expect(host.liveStatesAtStep.get("ada").pointer.x).toBe(0)
    }
    finally { await host.exitPreview(false); editor.remove() }
  })

  it("restores learner documents, widget state and feedback when jumping to a later checkpoint", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const recorder = new IncrementalPreviewRecorder("<p>First</p>")
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    const replay = {format: "webwriter-live-replay" as const, startedAt: 0, endedAt: 90000, baseHTML: "<p>Start</p>",
      learners: [{id: "ada", name: "Ada", color: "red", firstSeen: 0, lastSeen: 90000, connected: false}],
      steps: [
        {id: "a", learner: "ada", time: 1000, kind: "document" as const, htmlCheckpoint: encode(recorder.checkpoint())},
        {id: "b", learner: "ada", time: 32000, kind: "document" as const, htmlUpdate: encode(recorder.capture("<p>Second</p>")!), widgets: [{id: "quiz", state: {answer: 3}}], scroll: {top: 120}},
        {id: "c", learner: "ada", time: 64000, kind: "document" as const, htmlUpdate: encode(recorder.capture("<p>Third</p>")!)},
      ], feedback: [{id: "feedback", participant: "ada", time: 30000, text: "Good"}]}
    vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{getFile: async () => createLiveSessionReplayFile(replay)}]))
    try {
      await host.openLiveReplay()
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 64}}))
      expect(host.liveSteps).toHaveLength(0)
      expect(host.liveStreamStep).toBe(1)
      expect(host.liveStatesAtStep.get("ada")).toMatchObject({html: "<p>Third</p>", widgets: [{id: "quiz", state: {answer: 3}}], scroll: {top: 120}})
      expect(host.liveFeedback).toEqual([expect.objectContaining({text: "Good"})])
      await host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      expect(host.liveStatesAtStep.get("ada").html).toBe("<p>First</p>")
      expect(host.liveFeedback).toEqual([])
    }
    finally { await host.exitPreview(false); recorder.destroy(); editor.remove() }
  })

  it("opens a replay through a file input when the browser has no file picker", async () => {
    vi.stubGlobal("Worker", ReplayTestWorker)
    const {editor} = await mountEditor()
    const host = editor as any
    const replay = {format: "webwriter-live-replay", startedAt: 1, endedAt: 2,
      baseHTML: "<p>Original</p>", learners: [], steps: [], feedback: []}
    vi.stubGlobal("showOpenFilePicker", undefined)
    const input = vi.spyOn(host, "pickFileInput").mockResolvedValue(await createLiveSessionReplayFile(replay as any))
    await host.openLiveReplay()
    expect(input).toHaveBeenCalledWith(".wwreplay")
    expect(host.replayActive).toBe(true)
    await host.exitPreview(false)
    editor.remove()
  })

  it("does not apply a pending stop confirmation to a replacement live session", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    await host.enterPreview()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const pendingExit = host.exitPreview()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#live-session-stop-dialog")!
    await vi.waitFor(() => expect(dialog.open).toBe(true))
    host.disposeLiveSession()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const replacement = host.liveSession as LiveSession
    dialog.querySelector<HTMLButtonElement>(".primary")!.click()
    await pendingExit
    expect(host.liveSession).toBe(replacement)
    expect(replacement.status).toBe("connected")
    expect(host.previewActive).toBe(true)
    host.disposeLiveSession()
  })

  it("warns before unloading a clean document during a live session and clears the guard after stopping", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.fileDirty = false
    await host.enterPreview()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const session = host.liveSession as LiveSession
    const beforeUnload = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
    expect(session.status).toBe("connected")
    host.disposeLiveSession()
    const afterStop = new Event("beforeunload", {cancelable: true})
    window.dispatchEvent(afterStop)
    expect(afterStop.defaultPrevented).toBe(false)
  })

  it.each(["local", "git"] as const)("shares embedded %s widget sources with live learners without changing the editor runtime", async kind => {
    const bundle = vi.spyOn(offlineBundler, "bundleOfflineModules").mockResolvedValue({js: 'customElements.define("webwriter-demo", class extends HTMLElement {})', css: "webwriter-demo {display: block}"})
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const base = kind === "local" ? `${location.origin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/` : `${location.origin}/api/developer-packages/git/fixture/`
    const script = `${base}widget.js?revision=2`
    const style = `${base}widget.css?revision=2`
    host.installedPackages = [{...demoPackage, scripts: [script], styles: [style],
      ...(kind === "git" ? {developerSource: {kind, repository: "https://example.com/widget.git", ref: "main", path: "", commit: "abc"}} : {})}]
    const authoredHTML = '<section><!--keep--><webwriter-demo></webwriter-demo></section>'
    iframe.contentDocument!.body.innerHTML = authoredHTML
    await host.enterPreview()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const session = host.liveSession as LiveSession
    const learner = new LiveSession({id: session.id, role: "learner"})
    try {
      expect(bundle).toHaveBeenCalledOnce()
      expect(session.previewDependencies!.packages[0].scripts[0]).toMatch(/^data:text\/javascript/)
      const source = new DOMParser().parseFromString(learner.baseHTML!, "text/html")
      const html = host.preparePreviewDocument(source, learner.previewDependencies)
      expect(html).not.toContain(LOCAL_PACKAGE_ROUTE_PREFIX)
      expect(html).not.toContain(script)
      expect(html).not.toContain(style)
      expect(html).toContain("data:text/javascript")
      expect(html).toContain("data:text/css")
      expect(source.body.innerHTML).toBe(authoredHTML)
      expect(host.installedPackages[0].scripts).toEqual([script])
      expect(host.previewDocumentHTML).toContain(script)
    }
    finally { learner.destroy(); host.disposeLiveSession() }
  })

  it("sends only visible subtrees to participants and keeps host widget paths aligned", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const authored = iframe.contentDocument!
    authored.body.innerHTML = '<x-widget id="private"><p id="private-child">private answer</p></x-widget><x-widget></x-widget><p id="public">Visible</p>'
    const visiblePolicy = {...emptyDistributionConfig(), permissions: ["edit" as const]}
    for(const [id, policy] of [
      ["private", {...emptyDistributionConfig(), view: false}], ["private-child", emptyDistributionConfig()], ["public", visiblePolicy],
    ] as const) {
      authored.getElementById(id)!.append(authored.createProcessingInstruction(distributionTarget, encodeDistributionConfig(policy)))
    }

    await host.enterPreview()
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const session = host.liveSession as LiveSession
    const learner = new LiveSession({id: session.id, role: "learner", learner: {id: "ada", name: "Ada", color: "red"}})
    try {
      expect(learner.baseHTML?.includes("private answer")).toBe(false)
      const shared = new DOMParser().parseFromString(learner.baseHTML!, "text/html")
      expect([...shared.body.children].map(element => element.localName)).toEqual(["x-widget", "p"])
      expect(readDistributionConfigs(shared)).toEqual(new Map([[shared.getElementById("public"), visiblePolicy]]))
      expect(authored.getElementById("private")?.textContent).toBe("private answer")
      expect(host.previewDocumentHTML).toContain("private answer")

      const widget = {path: [0], html: "<x-widget>learner state</x-widget>"}
      learner.publish({kind: "widget", widgets: [widget]})
      await vi.waitFor(() => expect(host.widgetStateAtStep("[1]", "ada")).toEqual(widget))
      expect(host.widgetStateAtStep("[0]", "ada")).toBeUndefined()
      learner.publish({kind: "document", html: learner.baseHTML!.replace(">Visible<", ">Updated<")})
      expect(session.steps.at(-1)?.html).toContain(">Updated<")
    }
    finally { learner.destroy(); host.disposeLiveSession() }
  })

  it("keeps the participant document on the host and creates a peer invitation", async () => {
    vi.stubGlobal("WebSocket", class {send() {} close() {}})
    vi.spyOn(offlineBundler, "bundleOfflineModules").mockResolvedValue({js: 'customElements.define("webwriter-demo", class extends HTMLElement {})', css: "webwriter-demo {display:block}"})
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.installedPackages = [{...demoPackage, scripts: [`${location.origin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/widget.js`], styles: []}]
    iframe.contentDocument!.body.innerHTML = '<webwriter-demo></webwriter-demo>'
    await host.enterPreview()
    const publishLiveSession = vi.fn()
    host.backendSession = {kind: "webwriter-dev-server", collaborationUrl: "ws://localhost:1234", user: {id: "host", name: "Host"}}
    host.backendClient = {apiBaseUrl: "http://localhost:1234/api", publishLiveSession}
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    expect(publishLiveSession).not.toHaveBeenCalled()
    const session = host.liveSession as LiveSession
    expect(session.baseHTML).toBeTruthy()
    expect(session.previewDependencies?.packages[0].scripts[0]).toMatch(/^data:text\/javascript/)
    const link = new URL(host.liveSessionLink)
    expect(link.searchParams.get("liveSession")).toBe(session.id)
    expect(link.searchParams.has("liveToken")).toBe(false)
    expect(new URLSearchParams(link.hash.slice(1)).get("liveKey")).toMatch(/^[A-Za-z0-9_-]{87}$/)
    host.disposeLiveSession()
  })

  it("cancels live-session startup when preview ends while local widgets are bundling", async () => {
    let finish!: (value: {js: string, css: undefined}) => void
    const bundle = vi.spyOn(offlineBundler, "bundleOfflineModules").mockReturnValue(new Promise(resolve => {finish = resolve}))
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    host.installedPackages = [{...demoPackage, scripts: [`${location.origin}${LOCAL_PACKAGE_ROUTE_PREFIX}fixture/widget.js`], styles: []}]
    iframe.contentDocument!.body.innerHTML = '<webwriter-demo></webwriter-demo>'
    await host.enterPreview()
    const starting = host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    await vi.waitFor(() => expect(bundle).toHaveBeenCalledOnce())
    await host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    expect(bundle).toHaveBeenCalledOnce()
    await host.exitPreview(false)
    finish({js: "register()", css: undefined})
    await starting
    expect(host.liveSessionActive).toBe(false)
    expect(host.liveSession).toBeNull()
  })

  it("loads the host widget runtime in a live learner preview independently of local installations", async () => {
    const {editor: hostEditor, iframe} = await mountEditor()
    const host = hostEditor as any
    host.installedPackages = [demoPackage]
    host.packageImportMap = {imports: {lit: "https://example.test/host-lit.js"}}
    const authoredHTML = '<section><!--keep--><webwriter-demo><script type="application/json">{"answer":1}</script></webwriter-demo></section>'
    iframe.contentDocument!.body.innerHTML = authoredHTML
    await host.enterPreview()
    host.toggleLiveSession(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    const session = host.liveSession as LiveSession
    expect(session.previewDependencies).toEqual({packages: [demoPackage], importMap: host.packageImportMap})
    const {editor} = await mountEditor()
    const learnerEditor = editor as any
    learnerEditor.installedPackages = [{...demoPackage, scripts: ["https://example.test/learner-widget.js"]}]
    learnerEditor.packageImportMap = {imports: {lit: "https://example.test/learner-lit.js"}}
    const learner = new LiveSession({id: session.id, role: "learner"})
    try {
      learnerEditor.connectLiveSession(learner, "learner")
      const preview = new DOMParser().parseFromString(learnerEditor.previewDocumentHTML, "text/html")
      expect([...preview.querySelectorAll("script[src]")].map(script => script.getAttribute("src"))).toEqual(demoPackage.scripts)
      expect(preview.querySelector('link[rel="stylesheet"]')!.getAttribute("href")).toBe(demoPackage.styles[0])
      expect(JSON.parse(preview.getElementById(packageDependencies.packageImportMapId)!.textContent!)).toEqual(host.packageImportMap)
      expect(preview.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1)
      expect(preview.querySelector("#webwriter-scoped-registry")).not.toBeNull()
      expect(preview.body.innerHTML).toBe(authoredHTML)
      expect(learnerEditor.installedPackages[0].scripts).toEqual(["https://example.test/learner-widget.js"])
    }
    finally { learnerEditor.disposeLiveSession(); host.disposeLiveSession() }
  })

  it("advances an idle timeline, holds a paused position, and resumes from a rewind", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    const controls = editor.shadowRoot!.querySelector<LiveSessionControls>("live-session-controls")!
    vi.useFakeTimers()
    try {
      ;(editor as unknown as {resetLivePlayback(): void}).resetLivePlayback()
      await vi.advanceTimersByTimeAsync(3000)
      await editor.updateComplete
      expect(controls.currentTime).toBe(3)
      expect(controls.currentTime).toBe(controls.duration)
      controls.dispatchEvent(new Event("live-session-pause"))
      await vi.advanceTimersByTimeAsync(2000)
      await editor.updateComplete
      expect(controls.currentTime).toBe(3)
      expect(controls.duration).toBe(5)
      controls.dispatchEvent(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      controls.dispatchEvent(new Event("live-session-play"))
      await vi.advanceTimersByTimeAsync(1000)
      await editor.updateComplete
      expect(controls.currentTime).toBeCloseTo(2)
      expect(controls.duration).toBe(6)
      controls.dispatchEvent(new CustomEvent("live-session-seek", {detail: {time: 6}}))
      controls.dispatchEvent(new Event("live-session-play"))
      await vi.advanceTimersByTimeAsync(1000)
      await editor.updateComplete
      expect(controls.currentTime).toBe(7)
      expect(controls.currentTime).toBe(controls.duration)
      editor.remove()
    }
    finally { vi.useRealTimers() }
  })

  it("returns rewound playback to the newest learner state and follows the growing edge", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    const controls = editor.shadowRoot!.querySelector<LiveSessionControls>("live-session-controls")!
    const host = editor as any
    vi.useFakeTimers()
    try {
      ;(editor as unknown as {resetLivePlayback(): void}).resetLivePlayback()
      const startedAt = host.liveStreamStartedAt
      host.liveSteps = [
        {id: "first", time: startedAt + 1000, learner: "learner-ada", cursor: {x: 0.1, y: 0.2}},
        {id: "latest", time: startedAt + 4000, learner: "learner-ada", cursor: {x: 0.8, y: 0.9}},
      ]
      await vi.advanceTimersByTimeAsync(4000)
      await editor.updateComplete
      controls.dispatchEvent(new Event("live-session-pause"))
      controls.dispatchEvent(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      expect(host.liveStreamStep).toBe(1)

      controls.dispatchEvent(new Event("live-session-return-to-live"))
      await editor.updateComplete
      expect(controls.playing).toBe(true)
      expect(controls.currentTime).toBe(4)
      expect(host.liveStreamStep).toBe(2)
      expect(host.liveStatesAtStep.get("learner-ada")?.cursor).toEqual({x: 0.8, y: 0.9})

      host.liveSteps.push({id: "newest", time: startedAt + 5000, learner: "learner-ada", cursor: {x: 0.4, y: 0.6}})
      await vi.advanceTimersByTimeAsync(1000)
      await editor.updateComplete
      expect(controls.currentTime).toBe(5)
      expect(host.liveStreamStep).toBe(3)
      expect(host.liveStatesAtStep.get("learner-ada")?.cursor).toEqual({x: 0.4, y: 0.6})
    }
    finally { editor.remove(); vi.useRealTimers() }
  })

  it("reconstructs incremental learner documents while seeking backwards and forwards", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const recorder = new IncrementalPreviewRecorder("<p>Start</p>")
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    try {
      const checkpoint = encode(recorder.checkpoint())
      const update = encode(recorder.capture("<p>Edited 😀</p>")!)
      host.liveSteps = [
        {id: "one", learner: "ada", time: 1, kind: "document", htmlCheckpoint: checkpoint},
        {id: "two", learner: "ada", time: 2, kind: "document", htmlUpdate: update},
      ]
      expect(host.statesAtLiveStep(2).get("ada").html).toBe("<p>Edited 😀</p>")
      expect(host.statesAtLiveStep(1).get("ada").html).toBe("<p>Start</p>")
      expect(host.statesAtLiveStep(2).get("ada").html).toBe("<p>Edited 😀</p>")
    }
    finally { recorder.destroy(); editor.remove() }
  })

  it("keeps every learner in the live drawer and filters their combined visualization", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    ribbon.dispatchEvent(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    await editor.updateComplete
    await ribbon.updateComplete
    const host = (editor as unknown as {liveSession: LiveSession}).liveSession
    const learner = new LiveSession({
      id: host.id,
      role: "learner",
      learner: {id: "learner-ada", name: "Ada Lovelace", color: "#d11b60"},
    })
    try {
      learner.publish({
        kind: "document",
        html: "<p>Answer</p>",
        pointer: {x: 0.25, y: 0.4},
        scroll: {top: 300, height: 1200, viewport: 600},
        regions: [{x: 0.1, y: 0.2, width: 0.5, height: 0.1}],
      })
      await vi.waitFor(() => expect(ribbon.liveLearners[0]?.id).toBe("learner-ada"))
      await editor.updateComplete
      await ribbon.updateComplete

      const share = ribbon.shadowRoot!.querySelector<RibbonButton>(
        'ribbon-drawer[label="Learners"] ribbon-button[label="QR"]',
      )!
      expect(share.disabled).toBe(true)
      expect(ribbon.liveSessionLink).toBe("")

      const toggle = ribbon.shadowRoot!.querySelector<HTMLButtonElement>('.learner-toggle[data-learner-id="learner-ada"]')!
      expect(toggle).not.toBeNull()
      expect(toggle.getAttribute("aria-pressed")).toBe("true")
      expect(toggle.getAttribute("role")).toBeNull()
      expect(toggle.getAttribute("aria-label")).toBe("Ada Lovelace, connected")
      const overlay = editor.shadowRoot!.querySelector<LiveSessionOverlay>("live-session-overlay")!
      await overlay.updateComplete
      expect(overlay.learners).toEqual([expect.objectContaining({
        id: "learner-ada",
        cursor: {x: 0.25, y: 0.4},
        scroll: 0.5,
      })])
      expect((editor as unknown as {liveStreamStep: number}).liveStreamStep).toBe(1)

      learner.publish({kind: "widget", widgets: [{path: [0], html: '<demo-quiz><span submitted>Draft</span></demo-quiz>'}]})
      await vi.waitFor(() => expect((editor as any).liveStreamStep).toBe(2))
      expect(toggle.querySelector(".learner-submitted")).toBeNull()

      learner.publish({kind: "widget", widgets: [{path: [0], html: '<demo-quiz submitted=""></demo-quiz>'}]})
      await vi.waitFor(() => expect(toggle.querySelector(".learner-avatar .learner-submitted")).not.toBeNull())
      expect(toggle.getAttribute("aria-label")).toBe("Ada Lovelace, connected, submitted an answer")

      learner.publish({kind: "widget", widgets: [{path: [0], html: "<demo-quiz></demo-quiz>"}]})
      await vi.waitFor(() => expect(toggle.querySelector(".learner-submitted")).toBeNull())
      expect(toggle.getAttribute("aria-label")).toBe("Ada Lovelace, connected")

      toggle.click()
      await editor.updateComplete
      await ribbon.updateComplete
      expect(overlay.learners).toEqual([])

      learner.stop()
      await vi.waitFor(() => expect(ribbon.liveLearners[0]?.connected).toBe(false))
      await ribbon.updateComplete
      expect(ribbon.shadowRoot!.querySelector('.learner-toggle[data-learner-id="learner-ada"]')).not.toBeNull()
      expect(ribbon.liveLearners[0].connected).toBe(false)
    }
    finally {
      learner.destroy()
    }
  })

  it("switches a widget between learner snapshots without changing the authored editor DOM", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<demo-widget data-answer="base"></demo-widget>'
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete

    const previewFrame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.preview-frame")!
    previewFrame.dispatchEvent(new Event("load"))
    ribbon.dispatchEvent(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    await editor.updateComplete
    await ribbon.updateComplete
    const host = (editor as unknown as {liveSession: LiveSession}).liveSession
    const learner = new LiveSession({
      id: host.id,
      role: "learner",
      learner: {id: "learner-grace", name: "Grace Hopper", color: "#2563eb"},
    })
    try {
      learner.publish({
        kind: "widget",
        widgets: [{
          path: [0],
          html: '<demo-widget data-answer="learner"></demo-widget>',
          state: {answer: "learner"},
        }],
      })

      const overlay = editor.shadowRoot!.querySelector<LiveSessionOverlay>("live-session-overlay")!
      await vi.waitFor(() => expect(overlay.widgets[0]?.learners[0]?.id).toBe("learner-grace"))
      await overlay.updateComplete
      const switcher = overlay.shadowRoot!.querySelector<HTMLSelectElement>(".widget-affordance")!
      switcher.value = "learner-grace"
      switcher.dispatchEvent(new Event("change", {bubbles: true}))
      await editor.updateComplete

      const previewWidget = previewFrame.contentDocument!.querySelector<HTMLElement>("demo-widget")!
      expect(previewWidget.getAttribute("data-answer")).toBe("learner")
      expect((previewWidget as HTMLElement & {answer?: string}).answer).toBe("learner")
      expect(iframe.contentDocument!.querySelector("demo-widget")?.getAttribute("data-answer")).toBe("base")
    }
    finally {
      learner.destroy()
    }
  })

  it("sends live widget aggregates by authored ID and respects filters, replay, and thumbnail selection", async () => {
    const {editor, iframe} = await mountEditor()
    const authored = '<live-aggregate-quiz id="quiz"><script type="application/json" slot="data">{"choice":"a"}</script></live-aggregate-quiz>'
    iframe.contentDocument!.body.innerHTML = authored
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!.click()
    await editor.updateComplete
    await ribbon.updateComplete
    const frame = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.preview-frame")!
    frame.dispatchEvent(new Event("load"))
    ribbon.dispatchEvent(new CustomEvent("live-session-toggle", {detail: {enabled: true}}))
    await editor.updateComplete
    const host = editor as any
    const session = host.liveSession as LiveSession
    // Production previews communicate with an isolated frame. Verify that
    // boundary here; the native aggregation fixture verifies the renderers.
    host.previewOpaque = true
    const post = vi.spyOn(host, "postToPreview").mockImplementation(() => {})
    vi.spyOn(frame, "contentDocument", "get").mockReturnValue(null)
    const packet = () => post.mock.calls.filter(([message]: any) => message.type === "preview-frame-aggregate").at(-1)?.[0] as any
    const learner = new LiveSession({id: session.id, role: "learner", learner: {id: "aggregate-ada", name: "Ada", color: "#2563eb"}})
    const publish = (choice: string) => learner.publish({kind: "widget", widgets: [{id: "quiz", path: [999], html: `<live-aggregate-quiz id="quiz"><script type="application/json" slot="data">{"choice":"${choice}"}</script></live-aggregate-quiz>`, data: {status: "ready", format: "json", mode: "individual", text: JSON.stringify({choice})}}]})
    const now = vi.spyOn(Date, "now")
    try {
      now.mockReturnValue(host.liveStreamStartedAt + 1000)
      publish("a")
      await vi.waitFor(() => expect(packet()?.widgets[0]?.participants[0]?.snapshot?.data.text).toBe('{"choice":"a"}'))
      expect(packet().widgets[0]).toMatchObject({id: "quiz", path: [0], view: "aggregate"})
      now.mockReturnValue(host.liveStreamStartedAt + 2000)
      publish("b")
      await vi.waitFor(() => expect(host.liveSteps).toHaveLength(2))
      expect(host.liveSteps.map((step: any) => [step.learner, step.widgets?.[0]?.data?.text])).toEqual([
        ["aggregate-ada", '{"choice":"a"}'], ["aggregate-ada", '{"choice":"b"}'],
      ])
      host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 2}}))
      await vi.waitFor(() => expect({time: host.liveStreamTime, duration: host.liveStreamDuration, step: host.liveStreamStep,
        text: packet()?.widgets[0]?.participants[0]?.snapshot?.data.text}).toEqual({time: 2, duration: 2, step: 2, text: '{"choice":"b"}'}))
      host.seekLiveSession(new CustomEvent("live-session-seek", {detail: {time: 1}}))
      await vi.waitFor(() => expect(packet()?.widgets[0]?.participants[0]?.snapshot?.data.text).toBe('{"choice":"a"}'))
      host.handleLiveLearnerToggle(new CustomEvent("live-learner-toggle", {detail: {id: "aggregate-ada", enabled: false}}))
      await vi.waitFor(() => expect(packet()?.widgets[0]?.participants).toHaveLength(0))
      host.handleLiveLearnerToggle(new CustomEvent("live-learner-toggle", {detail: {id: "aggregate-ada", enabled: true}}))
      host.handleLiveWidgetStateChange(new CustomEvent("live-widget-state-change", {detail: {path: "[0]", learnerId: null, view: "thumbnails"}}))
      expect(packet().widgets[0].view).toBe("thumbnails")
      host.handleLiveWidgetStateChange(new CustomEvent("live-widget-state-change", {detail: {path: "[0]", learnerId: "aggregate-ada"}}))
      expect(packet().widgets[0].view).toBe("individual")
      host.handlePreviewMessage(new MessageEvent("message", {source: frame.contentWindow, origin: window.location.origin,
        data: {bridgeNonce: host.bridgeNonce, type: "preview-frame-aggregate-options", widgets: [{path: [0], options: [{id: "count", title: "State count"}, {id: "text", title: "Explanations"}], selectedId: "count"}]}}))
      expect(host.liveAggregateOptions.get("[0]")?.options).toHaveLength(2)
      host.handleLiveWidgetStateChange(new CustomEvent("live-widget-state-change", {detail: {path: "[0]", learnerId: null, view: "aggregate", aggregateId: "text"}}))
      expect(packet().widgets[0]).toMatchObject({view: "aggregate", aggregateId: "text"})
      expect(iframe.contentDocument!.body.innerHTML).toBe(authored)
    }
    finally { now.mockRestore(); learner.destroy() }
  })

  it("renders the current selection path received from the editor bridge", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><span></span><p></p></section>"

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        bridgeNonce: (editor as any).bridgeNonce,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {
              path: [0, 1],
              name: "Paragraph",
              icon: "Paragraph",
              sections: [{path: [0], type: "section", name: "Section", icon: "Section"}],
            },
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const buttons = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item"))

    expect(buttons.map(button => button.textContent?.trim())).toEqual([
      "Document",
      "Paragraph",
    ])
    expect(breadcrumb.shadowRoot!.querySelectorAll(".separator")).toHaveLength(1)
    expect(breadcrumb.shadowRoot!.querySelectorAll(".separator-icon svg")).toHaveLength(1)
    expect(buttons[0].parentElement?.nextElementSibling?.classList.contains("tree-toggle-separator")).toBe(true)
    expect(buttons[1].parentElement?.nextElementSibling).toBeNull()
    expect(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item-icon svg")).toHaveLength(2)
    const section = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.section-item[data-section-path="0"]')!
    expect(section.textContent).toBe("Section")
    expect(getComputedStyle(section).fontSize).toBe("8px")
  })

  it("updates superscript positioning icons in breadcrumbs, sections, and the selected tree path", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><p>Text</p></section>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const sendPosition = async (position?: "absolute" | "fixed" | "relative" | "sticky", mode: "document" | "canvas" | "slides" = "document") => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {path: [
          {path: [], name: "Document", positionAnchor: position === "absolute" || position === "fixed"},
          {path: [0, 0], name: "Paragraph", position,
            positionAnchor: position === "relative" || position === "sticky",
            sections: [{path: [0], type: "section", name: "Section", positionAnchor: position === "absolute"}]},
        ], documentLayout: {mode, canConvert: true, zoom: 100}}},
        source: editorWindow,
      }))
      await editor.updateComplete
      await breadcrumb.updateComplete
    }

    for(const position of ["absolute", "fixed", "sticky", "relative"] as const) {
      await sendPosition(position)
      const items = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")
      const floating = position === "absolute" || position === "fixed"
      expect(items[0].querySelector("sup .icon-tabler-anchor") !== null).toBe(floating)
      expect(items[1].querySelector("sup .icon-tabler-anchor") !== null).toBe(!floating)
      expect(items[1].querySelector("sup .icon-tabler-balloon") !== null).toBe(position !== "sticky")
      expect(items[1].querySelector("sup .icons-tabler-filled") !== null).toBe(position === "relative")
      const superscript = items[1].querySelector("sup")!
      expect(superscript.previousElementSibling?.className).toBe("item-label")
      expect(getComputedStyle(superscript).transform).toBe("translateY(-4px)")
      expect(getComputedStyle(superscript.querySelector("svg")!).width).toBe("10px")
      expect(breadcrumb.shadowRoot!.querySelector(".section-item .position-anchor") !== null).toBe(position === "absolute")
    }

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete
    expect(breadcrumb.shadowRoot!.querySelector("ribbon-menu#document-tree")).not.toBeNull()
    for(const mode of ["slides", "canvas"] as const) {
      await sendPosition("absolute", mode)
      expect(breadcrumb.shadowRoot!.querySelector(".position-icons")).toBeNull()
      expect(breadcrumb.shadowRoot!.querySelector(".item-icon")).not.toBeNull()
    }
    await sendPosition("absolute", "document")
    expect(breadcrumb.shadowRoot!.querySelector(".position-anchor")).not.toBeNull()
    expect(breadcrumb.shadowRoot!.querySelector(".position-balloon")).not.toBeNull()
    await sendPosition()
    expect(breadcrumb.shadowRoot!.querySelector(".position-icons")).toBeNull()
  })

  it("keeps ribbon drawers and navigation menus above the toolbox and its tabs", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const tabs = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    expect(getComputedStyle(toolbox).position).toBe("relative")
    expect(getComputedStyle(tabs).position).toBe("relative")
    const toolboxLayer = Number(getComputedStyle(toolbox).zIndex)
    expect(getComputedStyle(ribbon).position).toBe("relative")
    expect(Number(getComputedStyle(ribbon).zIndex)).toBeGreaterThan(toolboxLayer)
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[layout="elements"]')!
    drawer.collapsed = true
    await drawer.updateComplete
    drawer.openDrawer()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(Number(getComputedStyle(ribbon).zIndex)).toBeGreaterThan(toolboxLayer)
    drawer.closeDrawer()
    ribbon.expanded = false
    ribbon.menuOpen = true
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector("ribbon-menu")).not.toBeNull()
    expect(Number(getComputedStyle(ribbon).zIndex)).toBeGreaterThan(toolboxLayer)
  })

  it("renders and updates superscript float direction icons", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<p>Text</p>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const sendFloat = async (float?: "far-left" | "far-right", floatForcedRight = false) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {path: [
          {path: [], name: "Document"},
          {path: [0], name: "Paragraph", ...(float ? {float} : {}), floatForcedRight},
        ]}},
        source: editorWindow,
      }))
      await editor.updateComplete
      await breadcrumb.updateComplete
    }

    await sendFloat("far-left")
    expect(breadcrumb.shadowRoot!.querySelector(".position-float")?.getAttribute("aria-label")).toBe("Left float")
    expect(breadcrumb.shadowRoot!.querySelector(".position-float .icon-tabler-float-left")).not.toBeNull()
    expect(getComputedStyle(breadcrumb.shadowRoot!.querySelector(".position-float svg")!).width).toBe("16px")
    await sendFloat("far-left", true)
    const info = breadcrumb.shadowRoot!.querySelector<import("./float-info").FloatInfo>("float-info")!
    expect(info).not.toBeNull()
    info.showBriefly()
    await info.updateComplete
    iframe.contentDocument!.dispatchEvent(new KeyboardEvent("keydown", {key: "a", bubbles: true}))
    expect(info.open).toBe(false)
    info.showBriefly()
    await info.updateComplete
    iframe.contentDocument!.dispatchEvent(new WheelEvent("wheel", {bubbles: true}))
    expect(info.open).toBe(false)
    await sendFloat("far-right")
    expect(breadcrumb.shadowRoot!.querySelector(".position-float")?.getAttribute("aria-label")).toBe("Right float")
    expect(breadcrumb.shadowRoot!.querySelector(".position-float .icon-tabler-float-right")).not.toBeNull()
    await sendFloat()
    expect(breadcrumb.shadowRoot!.querySelector(".position-float")).toBeNull()
  })

  it.each([
    {html: "<p>Hello</p>", rootPath: [], name: "Document"},
    {html: '<!--template-->\n<demo-widget role="document"><p>Hello</p></demo-widget>', rootPath: [2], name: "Content"},
  ])("selects the document without opening the toolbox when clicking the $name breadcrumb", async ({html, rootPath, name}) => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = html
    const root = {path: rootPath, name, icon: "Document"}
    const select = (path: Array<{path: number[], name: string}>, nodeSelected = false) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {path, nodeSelected}},
        source: editorWindow,
      }))
    }
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type === "selectNode") select([root], true)
    })
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!

    for(const activeTool of [null, "Review"] as const) {
      select([root, {path: [...rootPath, 0], name: "Paragraph"}])
      toolbox.selectTool(activeTool)
      await editor.updateComplete
      await breadcrumb.updateComplete
      expect(iframe.classList.contains("root-selected")).toBe(false)

      breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>("button.item")!.click()
      await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({type: "selectNode", path: rootPath}))
      await editor.updateComplete
      await toolbox.updateComplete

      expect(toolbox.activeTool).toBe(activeTool)
      expect(toolbox.documentSelected).toBe(true)
      expect(iframe.classList.contains("root-selected")).toBe(true)
      expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Edit"]')!.getAttribute("aria-label")).toBe("Edit Document")
    }
  })

  it("keeps dismissed Layouts lazy and refreshes their controls when showing a fresh document", async () => {
    const {editor} = await mountEditor(editor => Object.assign(editor, {documentLayoutsDismissed: true}))
    expect(editor.shadowRoot!.querySelector(".document-layouts-bar")).toBeNull()
    const host = editor as any
    host.documentLayoutsDismissed = false
    await editor.updateComplete
    const bar = editor.shadowRoot!.querySelector(".document-layouts-bar")!
    expect(bar).not.toBeNull()
    const panel = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-panel")!
    expect(getComputedStyle(panel).transition).not.toContain("grid-template-rows")
    host.documentLayoutsDismissed = true
    await editor.updateComplete
    expect(panel.inert).toBe(true)
    expect(getComputedStyle(panel).gridTemplateRows).toBe("0fr")
    expect(getComputedStyle(bar).position).toBe("absolute")
    expect(getComputedStyle(bar).visibility).toBe("hidden")
    host.documentLayout = {mode: "canvas", canConvert: true, zoom: 100}
    await editor.updateComplete
    expect(bar.querySelector('[data-mode="canvas"]')!.getAttribute("aria-pressed")).toBe("false")
    host.documentLayoutsDismissed = false
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-layouts-bar")).toBe(bar)
    expect(getComputedStyle(bar).position).not.toBe("absolute")
    expect(getComputedStyle(bar).visibility).toBe("visible")
    expect(bar.querySelector('[data-mode="canvas"]')!.getAttribute("aria-pressed")).toBe("true")
    host.htmlPending = true
    await editor.updateComplete
    expect(Array.from(bar.querySelectorAll<HTMLButtonElement>(".layout-preset"), button => button.disabled)).toEqual([true, true, true, true])
  })

  it("offers a document-scoped theme picker in the Layouts heading", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const picker = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-main-heading document-theme-presets")!
    expect(picker.hasAttribute("select-only")).toBe(true)
    const styles = {"background-color": {value: "red", priority: ""}}
    picker.dispatchEvent(new CustomEvent("document-theme-apply", {detail: {styles}, bubbles: true, composed: true}))
    expect(execute).toHaveBeenCalledWith({type: "setDocumentThemeStyles", styles})
  })

  it("resets document themes through the Standard preset action", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const toolbox = editor.shadowRoot!.querySelector<any>("dom-editor-toolbox")!
    toolbox.dispatchEvent(new CustomEvent("element-style-reset", {detail: {theme: true}, bubbles: true, composed: true}))
    const action = execute.mock.calls[0][0]
    expect(action.type).toBe("setDocumentThemeStyles")
    expect((action as any).styles).toEqual(Object.fromEntries(documentThemeProperties.map(name => [name, null])))
  })

  it.each(["focus", "pointer", "isolated focus", "isolated pointer"])("closes the Layouts theme picker on editor %s", async mode => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const picker = editor.shadowRoot!.querySelector<any>(".document-layouts-main-heading document-theme-presets")!
    await picker.updateComplete
    ;(picker.shadowRoot!.querySelector(".trigger") as HTMLButtonElement).click()
    await picker.updateComplete
    expect(picker.hasAttribute("open")).toBe(true)
    if(mode.startsWith("isolated")) {
      ;(editor as any).editorOpaque = true
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: mode.endsWith("focus") ? "editor-frame-focusin" : "editor-frame-pointerdown"}}))
      ;(editor as any).editorOpaque = false
    }
    else iframe.contentDocument!.body.dispatchEvent(new Event(mode === "focus" ? "focusin" : "pointerdown", {bubbles: true, composed: true}))
    await picker.updateComplete
    expect(picker.hasAttribute("open")).toBe(false)
    expect(picker.shadowRoot!.querySelector(".popup")).toBeNull()
  })

  it("keeps Layouts visible when a theme styles an empty document", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    const doc = iframe.contentDocument!
    doc.documentElement.style.setProperty("--ww-theme-accent-1", "#397da2")
    doc.documentElement.style.setProperty("--ww-text-color", "#243746")
    doc.documentElement.style.backgroundColor = "#f7fbff"
    await vi.waitFor(() => expect(host.fileDirty).toBe(true))
    expect(host.documentLayoutsDismissed).toBe(false)
    doc.body.className = "ww-slides"
    doc.body.innerHTML = '<div class="ww-slides-viewport"><section class="ww-slide" tabindex="-1" id="slide-cbb92aae-6b1b-40f9-9d11-70108719738b"><nav class="ww-slide-directions" contenteditable="false" aria-label="Slide navigation"><a>‹</a><a>›</a></nav></section></div><nav class="ww-slides-navigation" aria-label="Slides" contenteditable="false"><a>1</a></nav>'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.documentLayoutsDismissed).toBe(false)
  })

  it("selects the document and opens advanced Style options for theme customization", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const toolbox = editor.shadowRoot!.querySelector<any>("dom-editor-toolbox")!
    const open = vi.spyOn(toolbox, "openDocumentThemeOptions")
    const picker = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-main-heading document-theme-presets")!
    picker.dispatchEvent(new CustomEvent("document-theme-customize", {bubbles: true, composed: true}))
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce())
    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: []})
  })

  it("projects document palette accents into editor controls and clears them on document changes", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const doc = new DOMParser().parseFromString('<html style="--ww-theme-accent-2: #336699"><head></head><body><p>Text</p></body></html>', "text/html")
    host.editorDocument = doc
    host.syncDocumentPalette()
    expect(editor.style.getPropertyValue("--ww-editor-color-4-0")).toBe("#336699")
    expect(editor.style.getPropertyValue("--ww-editor-color-4-1")).toBe("#d6e0eb")
    doc.documentElement.style.removeProperty("--ww-theme-accent-2")
    host.syncDocumentPalette()
    expect(editor.style.getPropertyValue("--ww-editor-color-4-0")).toBe("")
  })

  it("keeps the full-width Layouts bar in every layout and reflects live conversion availability", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))
    for(const mode of ["document", "canvas", "slides", "board"] as const) {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {
          path: [{path: [], name: mode}], nodeSelected: true,
          documentLayout: {mode, canConvert: true, zoom: 100},
        }}, source: editorWindow,
      }))
      await editor.updateComplete
      const bar = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-bar")!
      expect(bar.querySelector("h2")!.textContent).toBe("Layouts & Recently opened")
      const cards = Array.from(bar.querySelectorAll<HTMLButtonElement>("button[data-mode]"))
      expect(cards.map(card => card.dataset.mode)).toEqual(["document", "canvas", "slides", "board"])
      expect(cards.filter(card => card.getAttribute("aria-pressed") === "true").map(card => card.dataset.mode)).toEqual([mode])
      expect(cards.find(card => card.dataset.mode === mode)!.disabled).toBe(true)
      const next = mode === "document" ? "canvas" : "document"
      cards.find(card => card.dataset.mode === next)!.click()
      expect(execute).toHaveBeenCalledWith({type: "setDocumentLayout", mode: next, expectedMode: mode})
      if(mode !== "document") {
        expect(cards.find(card => card.dataset.mode === (mode === "canvas" ? "slides" : "canvas"))!.disabled).toBe(false)
      }
    }
    expect(editor.shadowRoot!.querySelector(".document-layouts-bar")).not.toBeNull()
    expect(editor.querySelector(".document-layouts-bar")).toBeNull()
  })

  it.each([
    ["local", "<p>Opened document</p>"], ["local", "<p></p>"],
    ["backend", "<p>Opened document</p>"], ["backend", "<p></p>"],
  ])("hides Layouts when opening an existing %s document containing %s", async (storage, content) => {
    const {editor} = await mountEditor()
    const host = editor as any
    vi.spyOn(host, "waitForEditorWindow").mockResolvedValue(undefined)
    vi.spyOn(host, "rememberOpenedDocument").mockResolvedValue({id: "opened", kind: "local"})
    expect(editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-panel")!.inert).toBe(false)

    if(storage === "local") {
      const file = new File([content], "opened.html", {type: "text/html"})
      vi.stubGlobal("showOpenFilePicker", vi.fn().mockResolvedValue([{name: file.name, getFile: async () => file}]))
      await host.openDocument()
    }
    else {
      host.backendClient = {getDocument: vi.fn().mockResolvedValue({id: "opened", title: "Opened", format: "html", content})}
      await host.openBackendDocument("opened")
    }
    await editor.updateComplete

    const panel = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-panel")!
    expect(panel.inert).toBe(true)
    expect(panel.getAttribute("aria-hidden")).toBe("true")
  })

  it("restores Layouts for a new empty document", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    vi.spyOn(host, "waitForEditorWindow").mockResolvedValue(undefined)
    await host.reloadDocument("<p>Existing document</p>")
    host.documentLayoutsManuallyDismissed = true

    await host.newDocument("document")
    await editor.updateComplete

    const panel = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-panel")!
    expect(panel.inert).toBe(false)
    expect(panel.getAttribute("aria-hidden")).toBe("false")
    expect(new DOMParser().parseFromString(host.frameDocumentHTML, "text/html").body.innerHTML).toBe("")
  })

  it("keeps Layouts visible when synchronization reapplies the document language", async () => {
    const {editor, iframe} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).dirtyTrackingReady).toBe(true))
    const root = iframe.contentDocument!.documentElement
    const revision = (editor as any).documentChangeSequence
    root.setAttribute("lang", root.getAttribute("lang")!)
    await new Promise(resolve => setTimeout(resolve, 50))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert])")).not.toBeNull()
    expect((editor as any).documentChangeSequence).toBe(revision)
  })

  it("ignores editor resource initialization when deciding whether to dismiss Layouts", async () => {
    const {editor, iframe} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).dirtyTrackingReady).toBe(true))
    const style = iframe.contentDocument!.createElement("style")
    style.className = "◆ ◆editor-only"
    iframe.contentDocument!.head.append(style)
    await new Promise(resolve => setTimeout(resolve, 0))
    style.textContent = "p { min-height: 1em; }"
    style.setAttribute("media", "screen")
    await new Promise(resolve => setTimeout(resolve, 50))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert])")).not.toBeNull()
    expect((editor as any).fileDirty).toBe(false)
  })

  it("hides Layouts on the first authored edit and restores it after undoing that edit", async () => {
    const {editor, iframe} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).dirtyTrackingReady).toBe(true))
    const body = iframe.contentDocument!.body
    body.innerHTML = '<p class="◆ ◆empty-selected"></p>'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert]) .document-layouts-bar")).not.toBeNull()
    body.firstElementChild!.textContent = "First edit"
    await vi.waitFor(() => {
      expect((editor as any).fileDirty).toBe(true)
      expect((editor as any).documentLayoutsDismissed).toBe(true)
      expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert]) .document-layouts-bar")).toBeNull()
    })
    body.firstElementChild!.textContent = ""
    await new Promise(resolve => setTimeout(resolve, 0))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert]) .document-layouts-bar")).not.toBeNull()
  })

  it("rejects nonempty layout snapshots without cloning and still recognizes cleared content", async () => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    host.fileHandle = {}
    const body = iframe.contentDocument!.body
    body.innerHTML = '<p>Authored text</p>'.repeat(1000)
    host.fileDirty = true
    const clone = vi.spyOn(body, "cloneNode")
    host.updateDocumentLayoutsVisibility()
    expect(host.documentLayoutsDismissed).toBe(true)
    expect(clone).not.toHaveBeenCalled()
    clone.mockRestore()

    body.innerHTML = '<p><span class="◆editor-only">Editor text</span><br></p>'
    host.updateDocumentLayoutsVisibility()
    expect(host.documentLayoutsDismissed).toBe(false)
    expect(body.querySelector("span")?.textContent).toBe("Editor text")
    body.firstElementChild!.append('Authored again')
    host.updateDocumentLayoutsVisibility()
    expect(host.documentLayoutsDismissed).toBe(true)
  })

  it.each([false, true])("restores Layouts after clearing a saved document unless manually dismissed (isolated frame: %s)", async isolated => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    host.fileHandle = {}
    const doc = iframe.contentDocument!
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
      window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, doc)}))
    }
    const change = async (html: string) => {
      doc.body.innerHTML = html
      if(isolated) window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow,
        data: frameUpdate(host, doc)}))
      await new Promise(resolve => setTimeout(resolve, 0))
      await editor.updateComplete
      expect(doc.body.innerHTML).toBe(html)
    }
    const panel = editor.shadowRoot!.querySelector<HTMLElement>(".document-layouts-panel")!
    for(const html of ["", '<p class="◆ ◆empty-selected"><br></p>', "<h1></h1><p><br></p>"]) {
      await change("<p>Content</p>")
      expect(panel.inert).toBe(true)
      await change(html)
      expect(panel.inert).toBe(false)
      expect(host.fileDirty).toBe(true)
    }
    for(const html of ["<custom-card></custom-card>", "<img src=\"example.png\">", "<!--keep-->", '<p id="anchor"></p>']) {
      await change(html)
      expect(panel.inert).toBe(true)
    }
    await change("")
    editor.shadowRoot!.querySelector<HTMLButtonElement>(".document-layouts-close")!.click()
    await change("<p>More content</p>")
    await change("")
    expect(panel.inert).toBe(true)
  })

  it.each([
    ["canvas", '<p style="position: absolute; left: 0px; top: 0px; width: 320px;"><br></p>'],
    ["slides", '<div class="ww-slides-viewport"><section class="ww-slide" tabindex="-1"><h1></h1><p><br></p></section></div>'],
    ["board", '<section class="ww-board-column"><h2></h2><article class="ww-board-card"><p><br></p></article></section>'],
  ])("restores Layouts when %s content returns to empty layout placeholders", async (mode, html) => {
    const {editor, iframe} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).dirtyTrackingReady).toBe(true))
    const body = iframe.contentDocument!.body
    body.className = `ww-${mode}`
    body.innerHTML = "<p>Content</p>"
    await vi.waitFor(() => expect((editor as any).documentLayoutsDismissed).toBe(true))
    body.innerHTML = html
    await vi.waitFor(() => expect((editor as any).documentLayoutsDismissed).toBe(false))
    expect(body.innerHTML).toBe(html)
    expect((editor as any).fileDirty).toBe(true)
  })

  it.each([false, true])("keeps the initial layout clean and the pane open across repeated layout switches (isolated frame: %s)", async isolated => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    const doc = iframe.contentDocument!
    doc.documentElement.id = "ww9b905a62-994a-43a6-b8a4-eae2d166b55c"
    host.freshDocumentLayoutSnapshot = null
    const snapshot = () => {
      if(isolated) window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow,
        data: frameUpdate(host, doc)}))
    }
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
      vi.spyOn(host, "requestFrameControl").mockImplementation(async () => {
        window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, doc)}))
        return {html: doc.documentElement.outerHTML}
      })
    }
    vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type !== "setDocumentLayout") return undefined
      doc.body.className = action.mode === "document" ? "" : `ww-${action.mode}`
      doc.body.innerHTML = action.mode === "slides" ? '<div class="ww-slides-viewport"><section class="ww-slide" tabindex="-1"><h1 style="position: absolute; left: var(--ww-page-gutter, 1.25rem); width: calc(100% - 2 * var(--ww-page-gutter, 1.25rem)); top: 1.25rem; height: 20%;"></h1><p style="position: absolute; left: var(--ww-page-gutter, 1.25rem); width: calc(100% - 2 * var(--ww-page-gutter, 1.25rem)); top: calc(20% + 2.5rem); height: calc(80% - 3.75rem);"></p></section></div>' : action.mode === "board" ? '<section class="ww-board-column"><h2></h2><article class="ww-board-card"><p></p></article></section>' : "<p></p>"
      host.documentLayout = {...host.documentLayout, mode: action.mode}
      return true
    })
    for(const mode of ["canvas", "slides", "board", "slides", "board", "document", "board", "canvas"]) {
      editor.shadowRoot!.querySelector<HTMLButtonElement>(`.document-layouts-bar [data-mode="${mode}"]`)!.click()
      await vi.waitFor(() => expect(host.documentLayoutConversionCount).toBe(0))
      snapshot()
      expect(host.documentLayoutError).toBe("")
      expect(host.isFreshDocumentUnchanged()).toBe(true)
      expect(host.fileDirty).toBe(false)
      expect(host.documentLayoutsDismissed).toBe(false)
      doc.querySelector("p")!.innerHTML = "<br>"
      doc.body.classList.add("◆empty-selected")
      snapshot()
      await new Promise(resolve => setTimeout(resolve, 0))
      await editor.updateComplete
      expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert])")).not.toBeNull()
      expect(host.fileDirty).toBe(false)
    }
    doc.querySelector("p")!.textContent = "An authored edit"
    snapshot()
    await vi.waitFor(() => expect(host.documentLayoutsDismissed).toBe(true))
    expect(host.fileDirty).toBe(true)
  })

  it.each([false, true])("keeps an empty canvas clean and Layouts open with or without a paragraph (isolated frame: %s)", async isolated => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    const doc = iframe.contentDocument!
    const snapshot = () => {
      if(isolated) window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow,
        data: frameUpdate(host, doc)}))
    }
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
      vi.spyOn(host, "requestFrameControl").mockImplementation(async () => {
        window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, doc)}))
        return {html: doc.documentElement.outerHTML}
      })
    }
    vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type !== "setDocumentLayout") return undefined
      doc.body.className = "ww-canvas"
      doc.body.innerHTML = '<p style="position: absolute; left: 0px; top: 0px; width: 320px;"></p>'
      host.documentLayout = {...host.documentLayout, mode: "canvas"}
      return true
    })
    editor.shadowRoot!.querySelector<HTMLButtonElement>('.document-layouts-bar [data-mode="canvas"]')!.click()
    await vi.waitFor(() => expect(host.documentLayoutConversionCount).toBe(0))
    snapshot()
    const initial = host.authoredDocumentSnapshot()
    for(const html of ["", "<p></p>", '<p class="◆ ◆empty-selected"><br></p>',
      '<p style="position: absolute; left: 40px; top: 80px; width: 320px;"></p>', ""]) {
      doc.body.innerHTML = html
      snapshot()
      await new Promise(resolve => setTimeout(resolve, 0))
      await editor.updateComplete
      expect(host.authoredDocumentSnapshot()).toBe(initial)
      expect(host.isFreshDocumentUnchanged()).toBe(true)
      expect(host.fileDirty).toBe(false)
      expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert])")).not.toBeNull()
      expect(doc.body.innerHTML).toBe(html)
    }
    for(const html of ['<p style="color: red"></p>', '<p id="anchor"></p>', '<p><br class="authored"></p>', '<!--keep-->',
      '<custom-card></custom-card>', '<p>Content</p>']) {
      doc.body.innerHTML = html
      snapshot()
      await vi.waitFor(() => expect(host.fileDirty).toBe(true))
      expect(host.isFreshDocumentUnchanged()).toBe(false)
      expect(host.documentLayoutsDismissed).toBe(true)
    }
  })

  it.each([false, true])("keeps concurrent authored edits dirty during layout conversion (isolated frame: %s)", async isolated => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    await vi.waitFor(() => expect(host.dirtyTrackingReady).toBe(true))
    let complete!: (result: boolean) => void
    vi.spyOn(editor, "execute").mockImplementation(() => new Promise(resolve => {complete = resolve}))
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "requestFrameControl").mockImplementation(async () => ({html: iframe.contentDocument!.documentElement.outerHTML}))
    }
    editor.shadowRoot!.querySelector<HTMLButtonElement>('.document-layouts-bar [data-mode="canvas"]')!.click()
    iframe.contentDocument!.body.classList.add("ww-canvas")
    iframe.contentDocument!.body.innerHTML = "<p>Typed while converting</p>"
    await new Promise(resolve => setTimeout(resolve, 0))
    complete(true)
    await vi.waitFor(() => expect(host.documentLayoutConversionCount).toBe(0))
    expect(host.fileDirty).toBe(true)
    expect(host.isFreshDocumentUnchanged()).toBe(false)
    expect(host.documentLayoutsDismissed).toBe(true)
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false))
    expect(host.confirmDocumentSwitch()).toBeNull()
  })

  it("keeps Layouts visible for conversion mutations, then hides it on the next edit", async () => {
    const {editor, iframe} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).dirtyTrackingReady).toBe(true))
    let complete!: (result: boolean) => void
    vi.spyOn(editor, "execute").mockImplementation(() => new Promise(resolve => { complete = resolve }))
    editor.shadowRoot!.querySelector<HTMLButtonElement>('.document-layouts-bar [data-mode="canvas"]')!.click()
    iframe.contentDocument!.body.classList.add("ww-canvas")
    iframe.contentDocument!.body.innerHTML = '<p style="position:absolute"></p>'
    await new Promise(resolve => setTimeout(resolve, 0))
    complete(true)
    await vi.waitFor(() => expect((editor as any).documentLayoutConversionCount).toBe(0))
    expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert]) .document-layouts-bar")).not.toBeNull()
    iframe.contentDocument!.body.firstElementChild!.textContent = "Edit"
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert]) .document-layouts-bar")).toBeNull())
  })

  it("hides Layouts when formatting empty content", async () => {
    const {editor, iframe} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).dirtyTrackingReady).toBe(true))
    const paragraph = iframe.contentDocument!.createElement("p")
    iframe.contentDocument!.body.append(paragraph)
    paragraph.style.color = "red"
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert]) .document-layouts-bar")).toBeNull())
  })

  it("dismisses Layouts with its close button and restores editor focus", async () => {
    const {editor, iframe} = await mountEditor()
    const focus = vi.spyOn(iframe, "focus")
    editor.shadowRoot!.querySelector<HTMLButtonElement>('.document-layouts-close[aria-label="Hide layouts"]')!.click()
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector(".document-layouts-panel:not([inert]) .document-layouts-bar")).toBeNull())
    expect(focus).toHaveBeenCalledWith({preventScroll: true})
    expect(editor.shadowRoot!.querySelector(".document-layouts-bar")).not.toBeNull()
    expect(editor.shadowRoot!.querySelector(".document-layouts-panel")!.getAttribute("aria-hidden")).toBe("true")
    expect(editor.shadowRoot!.querySelector("dom-editor-toolbox")).not.toBeNull()
  })

  it("keeps native pointer focus in the editor when pressing a bottom layout card", async () => {
    const {editor, iframe} = await mountEditor()
    const button = editor.shadowRoot!.querySelector<HTMLButtonElement>('.document-layouts-bar [data-mode="canvas"]')!
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    iframe.focus()
    for(const type of ["pointerdown", "mousedown"]) {
      const event = new MouseEvent(type, {button: 0, bubbles: true, composed: true, cancelable: true})
      button.querySelector("span")!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(editor.shadowRoot!.activeElement).toBe(iframe)
      const secondary = new MouseEvent(type, {button: 2, bubbles: true, composed: true, cancelable: true})
      button.dispatchEvent(secondary)
      expect(secondary.defaultPrevented).toBe(false)
    }
    button.click()
    expect(execute).toHaveBeenCalledWith({type: "setDocumentLayout", mode: "canvas", expectedMode: "document"})
  })

  it.each([true, false])("focuses the editor only after a successful layout switch: %s", async changed => {
    const {editor, iframe} = await mountEditor()
    let complete!: (value: boolean) => void
    vi.spyOn(editor, "execute").mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const focus = vi.spyOn(iframe, "focus")
    const button = editor.shadowRoot!.querySelector<HTMLButtonElement>('.document-layouts-bar [data-mode="canvas"]')!
    button.focus()
    button.click()
    expect(focus).not.toHaveBeenCalled()
    complete(changed)
    await editor.updateComplete
    await editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!.updateComplete
    await Promise.resolve()
    if(changed) await vi.waitFor(() => expect(focus).toHaveBeenCalledWith({preventScroll: true}))
    else expect(focus).not.toHaveBeenCalled()
  })

  it("switches document layouts immediately without confirmation", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [{path: [], name: "Document", icon: "Document"}],
          nodeSelected: true,
          documentLayout: {mode: "document", canConvert: true, zoom: 100},
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const change = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-mode="canvas"]')!
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal("confirm", confirm)

    change.click()
    expect(confirm).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(execute).toHaveBeenCalledWith({
      type: "setDocumentLayout",
      mode: "canvas",
      expectedMode: "document",
    })
  })

  it("keeps the filled Pages breadcrumb clickable while Document is selected", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<!--keep--><webwriter-pages role="document"></webwriter-pages>'
    await Promise.resolve()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document", icon: "Document"}], nodeSelected: true}},
    }))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    expect(breadcrumb.fillElement).toMatchObject({path: [1], fillViewport: true})
    expect(breadcrumb.shadowRoot!.querySelector('.item[data-path=""]')?.classList.contains("node-selected")).toBe(true)
    const pages = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.item[data-path="1"]')!
    expect(pages).not.toBeNull()
    pages.click()
    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: [1]})
    expect(editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!.documentSelected).toBe(true)
  })

  it("uses a document layout as the breadcrumb tree root and exposes the Document toolbox", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<demo-widget role="document"><p>Slide</p></demo-widget>'
    await Promise.resolve()

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [{path: [0], name: "Content", icon: "Section"}],
          nodeSelected: true,
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    await breadcrumb.updateComplete
    await toolbox.updateComplete

    // The whole outline is only handed over while its popup is open.
    expect(breadcrumb.tree).toBeNull()
    expect(breadcrumb.pathItems).toEqual([expect.objectContaining({path: [0], children: [expect.objectContaining({path: [0, 0]})]})])
    expect((editor as any).documentTree.path).toEqual([0])
    expect((editor as any).documentTree.children).toHaveLength(1)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item"))
      .map(button => button.textContent?.trim())).toEqual(["Content"])
    expect(toolbox.documentSelected).toBe(true)
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Edit"]')!
      .getAttribute("aria-label")).toBe("Edit Document")
  })

  it("selects a breadcrumb section without opening its toolbox", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><p>hello</p></section>"
    const path = [
      {path: [], name: "Document", icon: "Document"},
      {
        path: [0, 0],
        name: "Paragraph",
        icon: "Paragraph",
        sections: [{path: [0], type: "section" as const, name: "Section", icon: "Section"}],
      },
    ]
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {path}},
      source: editorWindow,
    }))
    await editor.updateComplete
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('.section-item[data-section-path="0"]')!.click()
    await Promise.resolve()
    expect(execute).toHaveBeenCalledWith({type: "selectSection", path: [0]})

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {path, section: {path: [0], type: "section"}},
      },
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    await toolbox.updateComplete

    expect(breadcrumb.shadowRoot!.querySelector('.section-item[aria-pressed="true"]')).not.toBeNull()
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="Edit"]')!.getAttribute("aria-label")).toBe("Edit Section")
  })

  it("renders package widget names and icons in breadcrumbs and the document tree", async () => {
    const {editor} = await mountEditor()
    await vi.waitFor(() => expect((editor as any).editorWindow).not.toBeNull())
    const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    const editorWindow = iframe.contentWindow!
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [demoPackage]

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        bridgeNonce: (editor as any).bridgeNonce,
        detail: {
          path: [
            {path: [], name: "Document", icon: "Document"},
            {
              path: [0],
              name: "Demo Widget",
              icon: "Packages",
              iconUrl: "https://example.com/demo.svg",
            },
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const editorDocument = (editor as unknown as {editorDocument: Document}).editorDocument!
    editorDocument.body.innerHTML = "<webwriter-demo></webwriter-demo>"
    const widget = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item"))[1]
    expect(widget.textContent?.trim()).toBe("Demo Widget")
    expect(widget.querySelector('img[src="https://example.com/demo.svg"]')).not.toBeNull()

    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children[0]).toEqual(expect.objectContaining({
      name: "Demo Widget",
      icon: "Packages",
      iconUrl: "https://example.com/demo.svg",
    }))
  })

  it("uses package presentation for nested uninsertable widgets in the outline", async () => {
    const {editor, iframe} = await mountEditor()
    const pkg: WebWriterPackage = {
      ...demoPackage,
      iconUrl: "https://example.com/package.svg",
      members: [{
        ...demoPackage.members[0],
        id: "@webwriter/demo@1.0.0:./widgets/webwriter-task-prompt",
        label: "webwriter-task-prompt",
        tagName: "webwriter-task-prompt",
        insertable: false,
        iconUrl: "https://example.com/member.svg",
      }],
    }
    ;(editor as unknown as {installedPackages: WebWriterPackage[]}).installedPackages = [pkg]
    iframe.contentDocument!.body.innerHTML = "<blockquote><webwriter-task-prompt></webwriter-task-prompt></blockquote>"

    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    const findWidget = (item: DocumentTreeItem): DocumentTreeItem | undefined =>
      item.path.length > 0 && item.name === "Task Prompt" ? item : item.children.map(findWidget).find(Boolean)
    const widget = findWidget(tree)
    expect(widget).toMatchObject({
      name: "Task Prompt",
      icon: "Packages",
      iconUrl: "https://example.com/package.svg",
    })
  })

  it("omits summary and formula descendants from outline data while preserving authored paths", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<details open><summary><b>Title</b><test-widget></test-widget></summary><!--keep--><p>Body<math><mi>x</mi></math></p></details><math display="block"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>'
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)
    expect(breadcrumb.tree!.children.map(item => ({path: item.path, name: item.name}))).toEqual([{path: [0], name: "Details"}, {path: [1], name: "Formula"}])
    expect(breadcrumb.tree!.children[1]).toMatchObject({icon: "Formula", children: []})
    expect(breadcrumb.tree!.children[0].children.map(item => ({path: item.path, name: item.name}))).toEqual([{path: [0, 2], name: "Paragraph"}])
    expect(breadcrumb.shadowRoot!.querySelector("ribbon-menu#document-tree")).not.toBeNull()
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item-label"), item => item.textContent)).toEqual(["Document"])
  })

  it.each([false, true])("lists content from every table cell under the table (isolated frame: %s)", async isolated => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const body = iframe.contentDocument!.body
    body.innerHTML = '<table><caption>Caption</caption><colgroup><col></colgroup><!--keep--><thead><tr><th><p>Heading</p></th><th></th></tr></thead>'
      + '<tbody><tr><td></td><td><!--keep--><figure><img src="cell.png"><figcaption>Image caption</figcaption></figure><test-widget></test-widget></td></tr>'
      + '<tr><td><table><tbody><tr><td><video></video></td></tr></tbody></table></td><td><section><p>Body</p></section></td></tr></tbody>'
      + '<tfoot><tr><td><audio></audio></td></tr></tfoot></table><p>After</p>'
    const before = body.innerHTML
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
      window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, iframe.contentDocument!)}))
      host.editorDocument = null
    }
    const tree = host.buildDocumentTree() as DocumentTreeItem
    expect(tree.children.map(item => item.name)).toEqual(["Table", "Paragraph"])
    expect(tree.children[0].children.map(item => ({name: item.name, path: item.path}))).toEqual([
      {name: "Paragraph", path: [0, 3, 0, 0, 0]},
      {name: "Image", path: [0, 4, 0, 1, 1]},
      {name: "Widget", path: [0, 4, 0, 1, 2]},
      {name: "Table", path: [0, 4, 1, 0, 0]},
      {name: "Paragraph", path: [0, 4, 1, 1, 0, 0]},
      {name: "Audio", path: [0, 5, 0, 0, 0]},
    ])
    expect(tree.children[0].children[3].children).toMatchObject([
      {name: "Video", path: [0, 4, 1, 0, 0, 0, 0, 0, 0]},
    ])
    expect(body.innerHTML).toBe(before)
  })

  it.each([false, true])("preserves custom cells and popup ownership in table outlines (isolated frame: %s)", async isolated => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const source = iframe.contentDocument!
    source.body.innerHTML = '<div class="ww-popup"><button popovertarget="note">Open</button></div>'
      + '<table><tbody><tr><td is="custom-cell"><p>Custom</p></td><td id="note" class="ww-popup-content" popover><p>Popup</p></td><td></td></tr></tbody></table>'
    source.querySelector("td:last-child")!.append(source.createElementNS("urn:custom", "td"))
    if(isolated) {
      host.editorOpaque = true
      vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
      window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, data: frameUpdate(host, source)}))
      host.editorDocument = null
    }
    const tree = host.buildDocumentTree() as DocumentTreeItem
    expect(tree.children[0]).toMatchObject({name: "Popup", children: [
      {name: "Popup Content", path: [1, 0, 0, 1], children: [{name: "Paragraph", path: [1, 0, 0, 1, 0]}]},
    ]})
    expect(tree.children[1].children.map(item => item.path)).toEqual([[1, 0, 0, 0], [1, 0, 0, 2, 0]])
    expect(tree.children[1].children[0].children).toMatchObject([{name: "Paragraph", path: [1, 0, 0, 0, 0]}])
  })

  it.each([false, true])("selects another cell's media from the table outline and follows updates (isolated frame: %s)", async isolated => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const host = editor as any
    const live = iframe.contentDocument!
    live.body.innerHTML = '<table><tbody><tr><td><p>Current cell</p></td><td><img src="other.png"></td></tr></tbody></table>'
    host.editorOpaque = isolated
    vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    const publish = async () => {
      if(isolated) window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: frameUpdate(host, live)}))
      else await new Promise(resolve => setTimeout(resolve, 0))
      await editor.updateComplete
    }
    await publish()
    host.selectionPath = [{path: [], name: "Document"}, {path: [0], name: "Table"}, {path: [0, 0, 0, 0, 0], name: "Paragraph"}]
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const openTable = async () => {
      breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show Table tree"]')!.click()
      await editor.updateComplete
      await breadcrumb.updateComplete
      const menu = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
      await menu.updateComplete
      return menu
    }
    const menu = await openTable()
    expect(menu.groups[0].buttons.map(button => typeof button === "string" ? button : button.action))
      .toEqual(["outline:0,0,0,0,0", "outline:0,0,0,1,0"])
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="outline:0,0,0,1,0"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: [0, 0, 0, 1, 0]})

    live.querySelector("img")!.replaceWith(live.createElement("video"))
    await publish()
    const updatedMenu = await openTable()
    expect(updatedMenu.groups[0].buttons).toContainEqual(expect.objectContaining({label: "Video", action: "outline:0,0,0,1,0"}))
  })

  it("shows the popup and its native parts in the document tree", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<div class="ww-popup"><button popovertarget="note">Open</button><!--keep--><div id="note" popover="auto"><p>Content</p></div></div>'
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children).toMatchObject([{name: "Popup", path: [0, 0], children: [
      {name: "Popup Content", path: [0, 2], children: [{name: "Paragraph", path: [0, 2, 0]}]},
    ]}])
  })
  it("places a linked dialog below its inline toggle in the document tree", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button></span></p><div class="ww-popup-content" id="note" role="dialog" popover="auto"><p>Content</p></div>'
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children[0].children).toMatchObject([{name: "Popup", path: [0, 0, 0], children: [
      {name: "Popup Content", path: [1], children: [{name: "Paragraph", path: [1, 0]}]},
    ]}])
    expect(tree.children).toHaveLength(1)
  })

  it("keeps linked Popup Content beneath Popup when authored siblings have another order", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<p><span class="ww-popup"><span id="note" popover>Content</span><!--keep--><button popovertarget="note">Open</button><b>Other</b></span></p>'
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children[0].children).toMatchObject([{name: "Popup", path: [0, 0, 2], children: [
      {name: "Popup Content", path: [0, 0, 0]},
    ]}])
    expect(iframe.contentDocument!.body.querySelector(".ww-popup")!.childNodes).toHaveLength(4)
  })

  it("treats graphics as outline leaves while preserving surrounding authored paths", async () => {
    const {editor, iframe} = await mountEditor()
    const body=iframe.contentDocument!.body
    body.innerHTML='<section><!--keep--><figure><svg viewBox="0 0 100 100"><title>Drawing</title><defs><linearGradient id="paint"></linearGradient></defs><g><rect width="100" height="100"></rect><text>Label</text><svg><circle r="5"></circle></svg><foreignObject><div><p>Embedded text</p><test-widget></test-widget></div></foreignObject></g></svg><figcaption>Caption</figcaption></figure><p>After</p></section>'
    const before=body.innerHTML
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children).toEqual([
      {path:[0,1],name:"Graphic",icon:"Graphic",children:[],sections:[{path:[0],type:"section",name:"Section",icon:"Section"}]},
      {path:[0,2],name:"Paragraph",icon:"Paragraph",children:[],sections:[{path:[0],type:"section",name:"Section",icon:"Section"}]},
    ])
    expect(body.innerHTML).toBe(before)
  })

  it("preserves section, figure, and mark semantics in outline tree data", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p><b>hello</b><img></p><section></section><figure><img><figcaption>Caption</figcaption></figure></div>"
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children.map(item => ({path: item.path, name: item.name}))).toEqual([
      {path: [0, 0], name: "Paragraph"}, {path: [0, 2], name: "Image"},
    ])
  })

  it("keeps canvas and slide layout entries in outline menu data", async () => {
    const {editor, iframe} = await mountEditor()
    const body = iframe.contentDocument!.body
    body.className = "ww-canvas"
    body.innerHTML = "<p>Canvas content</p>"
    const canvasTree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(canvasTree).toMatchObject({path: [], name: "Canvas", icon: "Canvas", children: [
      {path: [0], name: "Paragraph", children: []},
    ]})

    body.className = "ww-slides"
    body.innerHTML = '<div class="ww-slides-viewport"><!--keep--><section class="ww-slide"><p>One</p></section><section class="ww-slide"><article><p>Two</p></article></section><section class="ww-slide"></section></div><nav class="ww-slides-navigation"><a>1</a><a>2</a><a>3</a></nav>'
    const slidesTree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(slidesTree).toEqual({path: [], name: "Slides", icon: "Presentation", children: [
      {path: [0, 1], name: "Slide 1", icon: "Rectangle", children: [{path: [0, 1, 0], name: "Paragraph", icon: "Paragraph", children: []}]},
      {path: [0, 2], name: "Slide 2", icon: "Rectangle", children: [{path: [0, 2, 0, 0], name: "Paragraph", icon: "Paragraph", children: [], sections: [
        {path: [0, 2, 0], type: "article", name: "Article", icon: "Article"},
      ]}]},
      {path: [0, 3], name: "Slide 3", icon: "Rectangle", children: []},
    ]})
  })

  it("omits starting-view elements from a canvas outline without changing authored paths or DOM", async () => {
    const {editor, iframe} = await mountEditor()
    const body = iframe.contentDocument!.body
    body.className = "ww-canvas"
    body.innerHTML = '<!--keep--><div class="ww-canvas-starting-view"></div><p>Before</p><div class="ww-canvas-starting-view"></div><test-widget></test-widget><p>After</p><div class="ww-canvas-starting-view" is="custom-start-view"><p>Custom</p></div><section><div class="ww-canvas-starting-view"><p>Nested</p></div></section>'
    const before = body.innerHTML
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children.map(item => item.path)).toEqual([[2], [4], [5], [6, 0], [7, 0, 0]])
    expect(tree.children.map(item => item.name)).toEqual(["Paragraph", "Widget", "Paragraph", "Paragraph", "Paragraph"])
    expect(tree.sections).toBeUndefined()
    expect(body.innerHTML).toBe(before)
  })

  it("keeps board columns, cards, and widget sections in outline menu data", async () => {
    const {editor, iframe} = await mountEditor()
    const body = iframe.contentDocument!.body
    body.className = "ww-board"
    body.innerHTML = '<section class="ww-board-column"><h2>Backlog</h2><!--keep--><article class="ww-board-card"><p>First</p><section><custom-widget>Widget</custom-widget></section></article><article class="ww-board-card"><p>Second</p></article></section><section class="ww-board-column"><h2>Done</h2><article class="ww-board-card"><p>Third</p></article></section>'
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree).toEqual({path: [], name: "Board", icon: "Columns", children: [
      {path: [0], name: "Column 1", icon: "BoardColumn", children: [
        {path: [0, 0], name: "Column Heading", icon: "Heading", children: []},
        {path: [0, 2], name: "Card 1", icon: "BoardCard", children: [
          {path: [0, 2, 0], name: "Paragraph", icon: "Paragraph", children: []},
          {path: [0, 2, 1, 0], name: "Widget", icon: "Packages", children: [], sections: [
            {path: [0, 2, 1], type: "section", name: "Section", icon: "Section"},
          ]},
        ]},
        {path: [0, 3], name: "Card 2", icon: "BoardCard", children: [
          {path: [0, 3, 0], name: "Paragraph", icon: "Paragraph", children: []},
        ]},
      ]},
      {path: [1], name: "Column 2", icon: "BoardColumn", children: [
        {path: [1, 0], name: "Column Heading", icon: "Heading", children: []},
        {path: [1, 1], name: "Card 1", icon: "BoardCard", children: [
          {path: [1, 1, 0], name: "Paragraph", icon: "Paragraph", children: []},
        ]},
      ]},
    ]})
  })

  it("projects hotspot popups under images using their actual authored paths", async () => {
    const {editor, iframe} = await mountEditor()
    const body = iframe.contentDocument!.body
    body.innerHTML = '<figure><picture><img usemap="#plan"></picture><figcaption>Plan</figcaption></figure><map name="plan"><span><!--keep--><area popovertarget="one"><area interestfor="two"><area popovertarget="one"></span></map><section><div id="one" popover><p>One</p></div><span id="two" popover>Two</span></section>'
    const before = body.innerHTML
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]).toMatchObject({name: "Image", path: [0], children: [
      {name: "Popup", icon: "Popup", path: [2, 0], children: [{name: "Paragraph", path: [2, 0, 0]}]},
      {name: "Popup", icon: "Popup", path: [2, 1], children: []},
    ]})
    expect(body.innerHTML).toBe(before)
  })

  it("hides picture implementation images and media sources from outline data", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = '<picture><source srcset="small.png"><img src="large.png"></picture><video><source src="movie.mp4"></video>'
    const tree = (editor as unknown as {buildDocumentTree(): DocumentTreeItem}).buildDocumentTree()
    expect(tree.children.map(child => child.name)).toEqual(["Image", "Video"])
    expect(tree.children.map(child => child.children)).toEqual([[], []])
  })

  it.each([false, true])("hides data blocks from the breadcrumb outline (isolated frame: %s)", async isolated => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const host = editor as any
    host.editorOpaque = isolated
    vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    const live = iframe.contentDocument!
    live.body.innerHTML = '<test-widget><script type="application/json" slot="data">{"choice":""}</script></test-widget><test-widget><script type="application/xml"><state/></script><!--keep--><p>Visible child</p></test-widget>'
    const publish = async () => {
      if(isolated) window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: frameUpdate(host, live)}))
      else await new Promise(resolve => setTimeout(resolve, 0))
      await editor.updateComplete
    }
    await publish()
    window.dispatchEvent(new MessageEvent("message", {
      source: editorWindow,
      data: {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}, {path: [0], name: "Widget"}]}},
    }))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    expect(host.documentTree.children.map((item: DocumentTreeItem) => item.children)).toEqual([
      [], [expect.objectContaining({name: "Paragraph", path: [1, 2]})],
    ])
    expect(breadcrumb.shadowRoot!.querySelector('[aria-label="Show Widget tree"]')).toBeNull()
    const block = live.body.querySelector<HTMLScriptElement>("script[slot=data]")!
    expect(block.textContent).toBe('{"choice":""}')

    block.type = "text/javascript"
    await publish()
    expect(host.documentTree.children[0].children.map((item: DocumentTreeItem) => item.path)).toEqual([[0, 0]])
    await breadcrumb.updateComplete
    expect(breadcrumb.shadowRoot!.querySelector('[aria-label="Show Widget tree"]')).not.toBeNull()
    block.type = "application/json"
    await publish()
    expect(host.documentTree.children[0].children).toEqual([])
    await breadcrumb.updateComplete
    expect(breadcrumb.shadowRoot!.querySelector('[aria-label="Show Widget tree"]')).toBeNull()
  })

  it("opens the outline from a breadcrumb separator and preserves the full path", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<section><ul><li><p></p></li></ul><aside></aside></section>"
    window.dispatchEvent(new MessageEvent("message", {data: {type: selectionChangeEvent, detail: {path: [
      {path: [], name: "Document", icon: "Document"},
      {path: [0, 0], name: "List", icon: "List", sections: [{path: [0], type: "section", name: "Section", icon: "Section"}]},
      {path: [0, 0, 0], name: "List Item", icon: "Lists"},
      {path: [0, 0, 0, 0], name: "Paragraph", icon: "Paragraph"},
    ]}}, source: editorWindow}))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".separator-trigger")[1].click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item-label"), item => item.textContent)).toEqual([
      "Document", "List", "List Item", "Paragraph",
    ])
    expect(breadcrumb.shadowRoot!.querySelector("ribbon-menu#document-tree")).not.toBeNull()
  })

  it.each([false, true])("collapses the breadcrumb tree only for authored document changes (isolated frame: %s)", async isolated => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const doc = iframe.contentDocument!
    doc.body.innerHTML = "<section><custom-widget><p>Original</p></custom-widget><!--comment--></section>"
    await new Promise(resolve => setTimeout(resolve, 0))
    await editor.updateComplete
    if(isolated) {
      host.documentTreeObserver.disconnect()
      host.editorOpaque = true
      vi.spyOn(host, "isEditorMessage").mockReturnValue(true)
    }
    const flush = async () => {
      if(isolated) window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow,
        data: frameUpdate(host, doc)}))
      await new Promise(resolve => setTimeout(resolve, 0))
      await editor.updateComplete
      await breadcrumb.updateComplete
    }
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const openTree = async () => {
      breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
      await editor.updateComplete
      await breadcrumb.updateComplete
      expect(breadcrumb.treeOpen).toBe(true)
    }
    await openTree()
    await flush()
    expect(breadcrumb.treeOpen).toBe(true)
    doc.body.classList.add("◆test-marker")
    await flush()
    expect(breadcrumb.treeOpen).toBe(true)
    doc.body.classList.remove("◆test-marker")
    await flush()
    expect(breadcrumb.treeOpen).toBe(true)

    for(const change of [
      () => { doc.querySelector("p")!.firstChild!.textContent = "Edited" },
      () => { doc.querySelector("custom-widget")!.setAttribute("option", "changed") },
      () => { doc.querySelector("section")!.append(doc.createElement("aside")) },
      () => { doc.head.append(doc.createElement("meta")) },
    ]) {
      change()
      await flush()
      expect(breadcrumb.treeOpen).toBe(false)
      expect(host.breadcrumbVisible).toBe(true)
      await openTree()
    }
  })

  it("closes the outline popup on editor pointer interaction", async () => {
    const {editor, iframe} = await mountEditor()
    const focus = vi.spyOn(iframe, "focus")
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)

    iframe.contentDocument!.dispatchEvent(new Event("pointerdown", {bubbles: true}))
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(false)
    expect(breadcrumb.shadowRoot!.querySelector("#document-tree")).toBeNull()
    expect(focus).toHaveBeenCalledWith({preventScroll: true})
  })

  it("prevents breadcrumb pointer interactions from focusing its controls", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete

    const expectPointerDownToBePrevented = (button: HTMLButtonElement) => {
      const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})
      expect(button.dispatchEvent(event)).toBe(false)
      expect(event.defaultPrevented).toBe(true)
    }

    Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"))
      .forEach(expectPointerDownToBePrevented)

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete

    Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"))
      .forEach(expectPointerDownToBePrevented)
  })

  it("selects the node represented by a clicked breadcrumb item", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {path: [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}]},
      },
      source: editorWindow,
    }))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")[1].click()

    expect(execute).toHaveBeenCalledWith({type: "selectNode", path: [0]})
  })

  it.each([
    {selector: "button.item[data-path='0,0']", action: {type: "selectNode", path: [0, 0]}},
    {selector: "button.section-item", action: {type: "selectSection", path: [0]}},
  ])("opens the Edit toolbox on a double click that triggers $action.type", async ({selector, action}) => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {path: [
          {path: [], name: "Document"},
          {path: [0, 0], name: "Paragraph", sections: [{path: [0], type: "section", name: "Section"}]},
        ]},
      },
      source: editorWindow,
    }))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    await breadcrumb.updateComplete
    const button = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(selector)!
    const pane = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!

    button.dispatchEvent(new MouseEvent("click", {bubbles: true, detail: 1}))
    await toolbox.updateComplete
    expect(execute).toHaveBeenCalledWith(action)
    expect(pane.hidden).toBe(true)

    execute.mockClear()
    button.dispatchEvent(new MouseEvent("click", {bubbles: true, detail: 2}))
    await vi.waitFor(() => expect(pane.hidden).toBe(false))
    expect(execute).toHaveBeenCalledWith(action)
    expect(toolbox.activeTool).toBe("Edit")
  })

  it("indicates node and capture selection on breadcrumb items", async () => {
    const {editor, editorWindow} = await mountEditor()
    const detail = {
      path: [{path: [], name: "Document"}, {path: [0], name: "Widget", icon: "Packages"}],
      nodeSelected: true,
      capture: true,
    }

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail},
      source: editorWindow,
    }))
    await editor.updateComplete
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    await breadcrumb.updateComplete
    await toolbox.updateComplete

    const items = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")
    expect(items[0].classList.contains("node-selected")).toBe(false)
    expect(items[1].classList.contains("node-selected")).toBe(true)
    expect(items[0].classList.contains("capture-selected")).toBe(false)
    expect(items[1].classList.contains("capture-selected")).toBe(true)
    const styles = (DomEditorBreadcrumb.styles as unknown as {cssText: string}).cssText
    expect(styles).toContain("text-decoration-style: dotted")
    expect(styles).toContain("text-decoration-style: solid")
    expect(styles).toContain("#38bdf8")
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[data-tool="Edit"]')!
      .querySelector(".toolbox-tab-label")?.textContent).toBe("Widget")

    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await breadcrumb.updateComplete
    const outline = breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!
    expect(outline.groups[0].buttons[0]).toMatchObject({label: "Paragraph", action: "outline:0", selected: true})

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {...detail, capture: false}},
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete
    const updatedItems = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")
    expect(updatedItems[1].classList.contains("capture-selected")).toBe(false)
    expect(updatedItems[1].classList.contains("node-selected")).toBe(true)
    expect(breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!.groups[0].buttons[0]).toMatchObject({selected: true})

    for(const selection of [
      {nodeSelected: false},
      {nodeSelected: false, gap: {parentPath: [], offset: 0}},
    ]) {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {...detail, capture: false, ...selection}},
        source: editorWindow,
      }))
      await editor.updateComplete
      await breadcrumb.updateComplete
      const unmarkedItems = breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>("button.item")
      expect(unmarkedItems[1].classList.contains("node-selected")).toBe(false)
      expect(unmarkedItems[1].classList.contains("capture-selected")).toBe(false)
      expect(breadcrumb.shadowRoot!.querySelector<RibbonMenu>("#document-tree")!.groups[0].buttons[0]).toMatchObject({selected: true})
    }
  })

  it("keeps graphic controls and text marks stable while editing an SVG label", async () => {
    const {editor, editorWindow} = await mountEditor()
    const selection = {path: [{path: [], name: "Document"}, {path: [0], name: "Graphic"}],
      capture: true, graphic: {active: true, capture: true, mode: "select", selectionCount: 1}}
    const post = async (type: string, detail: unknown) => {
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type, detail}}))
      await editor.updateComplete
    }
    await post(selectionChangeEvent, selection)
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    for(let update = 0; update < 3; update++) {
      await post(markStateChangeEvent, {canMark: true, svgText: true, marks: ["b"]})
      expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBe(keyboard)
      expect((editor as any).captureSelection).toBe(true)
      expect(keyboard.insertionDisabled).toBe(true)
      await post(selectionChangeEvent, selection)
      expect(ribbon.canMark).toBe(true)
      expect(ribbon.marks).toEqual(["b"])
      expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBe(keyboard)
    }
    await post(markStateChangeEvent, {canMark: false, marks: []})
    expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBe(keyboard)
    expect((editor as any).captureSelection).toBe(true)
    await post(selectionChangeEvent, {...selection, graphic: {...selection.graphic, selectionCount: 0}})
    expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBe(keyboard)
    expect(ribbon.canMark).toBe(false)
    expect(keyboard.insertionDisabled).toBe(false)
    await post(markStateChangeEvent, {canMark: true, marks: []})
    expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBeNull()
    expect((editor as any).captureSelection).toBe(false)
  })

  it.each([true, false])("keeps block formula font controls and selection stable (capture: %s)", async capture => {
    const {editor, editorWindow} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const selection = {path: [{path: [], name: "Document"}, {path: [0], name: "Formula"}],
      nodeSelected: true, capture, math: {active: true, display: "block"}}
    const styles = {"font-family": '"Libertinus Math", math', "font-size": "24px"}
    const post = async (type: string, detail: object) => {
      window.dispatchEvent(new MessageEvent("message", {data: {type, detail}, source: editorWindow}))
      await editor.updateComplete
      await ribbon.updateComplete
      await breadcrumb.updateComplete
    }
    await post(selectionChangeEvent, selection)
    const keyboard = editor.shadowRoot!.querySelector("dom-editor-math-keyboard")
    for(let update = 0; update < 3; update++) {
      await post(markStateChangeEvent, {canMark: true, marks: [], styles})
      expect(breadcrumb.nodeSelected).toBe(true)
      expect(breadcrumb.capture).toBe(capture)
      expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).toBe(keyboard)
      await post(selectionChangeEvent, selection)
      expect(ribbon.canMark).toBe(true)
      expect(ribbon.markStyles).toEqual(styles)
      for(const name of ["font-family", "font-size"]) {
        const picker = ribbon.shadowRoot!.querySelector<RibbonCombobox>(`ribbon-combobox[name="${name}"]`)!
        expect(picker.disabled).toBe(false)
      }
    }
    await post(selectionChangeEvent, {path: [selection.path[0], {path: [1], name: "Image"}], capture: true})
    expect(ribbon.canMark).toBe(false)
    expect(ribbon.markStyles).toEqual({})
    expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).toBeNull()
  })

  it("never applies text and node or gap selection states together", async () => {
    const {editor, editorWindow} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const path = [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}]

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: markStateChangeEvent, detail: {canMark: true, marks: []}},
      source: editorWindow,
    }))
    await editor.updateComplete
    expect(ribbon.canMark).toBe(true)

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {path, nodeSelected: true}},
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(ribbon.canMark).toBe(false)
    expect(breadcrumb.nodeSelected).toBe(true)

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: markStateChangeEvent, detail: {canMark: true, marks: []}},
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(ribbon.canMark).toBe(true)
    expect(breadcrumb.nodeSelected).toBe(false)

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {path, gap: {parentPath: [], offset: 0}}},
      source: editorWindow,
    }))
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(ribbon.canMark).toBe(false)
    expect(breadcrumb.nodeSelected).toBe(false)
    expect(breadcrumb.gap).toEqual({parentPath: [], offset: 0})
  })

  it.each(["canvas", "slides"] as const)("keeps marks enabled for %s node selections", async mode => {
    const {editor, editorWindow} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const path = [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}]
    const post = async (type: string, detail: object) => {
      window.dispatchEvent(new MessageEvent("message", {data: {type, detail}, source: editorWindow}))
      await editor.updateComplete
      await ribbon.updateComplete
      await breadcrumb.updateComplete
    }
    const layout = {mode, canConvert: true, zoom: 1}
    await post(markStateChangeEvent, {canMark: true, spatialSelection: "[[0]]", marks: ["b"]})
    await post(selectionChangeEvent, {path, nodeSelected: true, spatialSelection: "[[0]]", documentLayout: layout})
    expect(ribbon.canMark).toBe(true)
    expect(ribbon.marks).toEqual(["b"])
    expect(breadcrumb.nodeSelected).toBe(true)
    const bold = ribbon.shadowRoot!.querySelector("ribbon-button[action='mark:b']")!
    expect(bold.hasAttribute("disabled")).toBe(false)

    await post(selectionChangeEvent, {path: [path[0], {path: [1], name: "Image"}],
      capture: true, spatialSelection: "[[1]]", documentLayout: layout})
    expect(ribbon.canMark).toBe(false)
    expect(bold.hasAttribute("disabled")).toBe(true)
    expect(breadcrumb.nodeSelected).toBe(true)
  })

  it("starts and ends an element hover from a breadcrumb item", async () => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    const item = breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>("button.item")!

    item.dispatchEvent(new MouseEvent("mouseenter"))
    await editor.updateComplete
    expect(iframe.classList.contains("root-hovered")).toBe(true)
    item.dispatchEvent(new MouseEvent("mouseleave"))
    await editor.updateComplete
    expect(iframe.classList.contains("root-hovered")).toBe(false)

    expect(execute).toHaveBeenNthCalledWith(1, {type: "hoverNode", path: []})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "hoverNode", path: null})
  })

  it("hides the AI bar, tab, and open sidebar when AI is disabled in settings", async () => {
    const {editor} = await mountEditor(editor => Object.assign(editor, {backendState: "connected"}))
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    await ribbon.updateComplete
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Settings"]')!.click()
    await ribbon.updateComplete
    const panel = ribbon.shadowRoot!.querySelector("settings-panel")!
    toolbox.selectTool("AI")
    ribbon.expanded = false
    await ribbon.updateComplete
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.hidden).toBe(false)
    panel.dispatchEvent(new CustomEvent("settings-change", {detail: {...ribbon.settings, disableAI: true}, bubbles: true, composed: true}))
    await editor.updateComplete
    await ribbon.updateComplete
    await toolbox.updateComplete
    await editor.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-panel")).toBeNull()
    expect(toolbox.shadowRoot!.querySelector('[data-tool="AI"]')).toBeNull()
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.hidden).toBe(true)
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)!).disableAI).toBe(true)
    panel.dispatchEvent(new CustomEvent("settings-change", {detail: {...ribbon.settings, disableAI: false}, bubbles: true, composed: true}))
    await editor.updateComplete
    await ribbon.updateComplete
    await toolbox.updateComplete
    expect(ribbon.shadowRoot!.querySelector(".ai-chat-panel")).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('[data-tool="AI"]')).not.toBeNull()
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    expect(getComputedStyle(toolbox).width).toBe("250px")
  })

  it("opens AI in the toolbox or a closable sidebar and synchronizes the prompt", async () => {
    const {editor} = await mountEditor(editor => Object.assign(editor, {backendState: "connected"}))
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    await toolbox.updateComplete
    await ribbon.updateComplete
    expect([...toolbox.shadowRoot!.querySelectorAll("[role=tab]")].map(tab => tab.getAttribute("data-tool"))).toEqual(["Edit", "AI", "Review", "Distribute"])
    toolbox.selectTool("AI")
    await editor.updateComplete
    await ribbon.updateComplete
    await toolbox.updateComplete
    expect(ribbon.aiChatOpen).toBe(true)
    expect(toolbox.hidden).toBe(false)
    const bar = ribbon.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    const chat = toolbox.shadowRoot!.querySelector<HTMLTextAreaElement>(".ai-toolbox-content textarea")!
    bar.value = "Help with my document"
    bar.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await ribbon.updateComplete
    expect(chat.value).toBe(bar.value)
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
    await ribbon.updateComplete
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.aiSidebar).toBe(true)
    expect(toolbox.hidden).toBe(false)
    expect(toolbox.activeTool).toBe("AI")
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close Ask AI"]')!.click()
    await ribbon.updateComplete
    await editor.updateComplete
    await toolbox.updateComplete
    expect(ribbon.aiChatOpen).toBe(false)
    expect(toolbox.hidden).toBe(true)
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!.click()
    await ribbon.updateComplete
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("AI")
    expect(toolbox.hidden).toBe(false)
    expect(chat.value).toBe(bar.value)
    ribbon.expanded = true
    await ribbon.updateComplete
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.aiSidebar).toBe(false)
    toolbox.selectTool("Edit")
    await ribbon.updateComplete
    expect(ribbon.aiChatOpen).toBe(false)
  })

  it("hides the breadcrumb when the ribbon is collapsed", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const breadcrumb = editor.shadowRoot!.querySelector("dom-editor-breadcrumb")!

    expect(getComputedStyle(breadcrumb).display).not.toBe("none")
    expect(getComputedStyle(breadcrumb).height).toBe("30px")
    ribbon.expanded = false
    await ribbon.updateComplete

    expect(getComputedStyle(breadcrumb).display).toBe("none")
  })

  it("keeps the breadcrumb and toolbox bars at 30px while the outline popup is open", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"
    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const tabs = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    await breadcrumb.updateComplete
    expect(getComputedStyle(breadcrumb).height).toBe("30px")
    expect(getComputedStyle(tabs).height).toBe("30px")
    expect(getComputedStyle(breadcrumb).backgroundColor).toBe("transparent")
    expect(getComputedStyle(breadcrumb).borderBottomColor).toBe("transparent")
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)
    expect(getComputedStyle(breadcrumb).height).toBe("30px")
    expect(getComputedStyle(tabs).height).toBe("30px")
    expect(breadcrumb.shadowRoot!.querySelector("#document-tree")).not.toBeNull()
    expect(Array.from(breadcrumb.shadowRoot!.querySelectorAll(".breadcrumb-list .item-label"), item => item.textContent)).toEqual(["Document"])
  })

  it("collapses the breadcrumb tree when the ribbon is collapsed", async () => {
    const {editor, iframe} = await mountEditor()
    iframe.contentDocument!.body.innerHTML = "<div><p></p></div>"

    const breadcrumb = editor.shadowRoot!.querySelector<DomEditorBreadcrumb>("dom-editor-breadcrumb")!
    await breadcrumb.updateComplete
    breadcrumb.shadowRoot!.querySelector<HTMLButtonElement>(".separator-trigger")!.click()
    await editor.updateComplete
    await breadcrumb.updateComplete
    expect(breadcrumb.treeOpen).toBe(true)

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    await editor.updateComplete
    await breadcrumb.updateComplete

    expect(breadcrumb.treeOpen).toBe(false)
  })

  it("prevents pointer interactions from focusing ribbon controls", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const button = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})

    expect(button.dispatchEvent(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it("keeps Style advanced options open when clicking between paragraphs in the editor frame", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const doc = iframe.contentDocument!
    doc.body.innerHTML = "<p>First</p><p>Second</p>"
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const drawer = () => toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Style"]')!
    await drawer().updateComplete
    drawer().shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    for(const index of [0, 1, 0]) {
      const paragraph = doc.querySelectorAll("p")[index]
      paragraph.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, button: 0}))
      doc.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 0, paragraph.firstChild!, 0)
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {path: [
          {path: [], name: "Document"}, {path: [index], name: "Paragraph"},
        ]}}, source: editorWindow,
      }))
      await editor.updateComplete
      await toolbox.updateComplete
      await drawer().updateComplete
      await drawer().updateComplete
      expect(drawer().shadowRoot!.querySelector(".drawer-toggle")!.getAttribute("aria-expanded")).toBe("true")
    }
  })

  it("keeps the fixed mark area mounted while selecting text", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const frameDocument = iframe.contentDocument!
    frameDocument.body.innerHTML = "<p>hello</p><p>world</p>"
    const firstParagraph = frameDocument.querySelectorAll("p")[0]
    const secondParagraph = frameDocument.querySelectorAll("p")[1]
    const text = firstParagraph.firstChild!
    const selection = frameDocument.getSelection()!
    selection.setBaseAndExtent(text, 0, text, 3)

    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: markStateChangeEvent,
        detail: {canMark: true, marks: []},
      },
      source: editorWindow,
    }))
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: selectionChangeEvent,
        detail: {
          path: [
            {path: [], name: "Document"},
            {path: [0], name: "Paragraph"},
          ],
        },
      },
      source: editorWindow,
    }))
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector(".drawer-toggle")).toBeNull()
    expect(drawer.hasAttribute("drawer-open")).toBe(false)

    firstParagraph.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, button: 0}))
    expect(drawer.hasAttribute("drawer-open")).toBe(false)

    selection.setBaseAndExtent(secondParagraph.firstChild!, 0, secondParagraph.firstChild!, 3)
    secondParagraph.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, button: 0}))
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(false)
  })

  it("routes a Formula structure menu item to a prefilled formula insertion", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "insert-math:frac"}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "insertMath", structure: "frac"})
  })

  it.each([1, 2])("allows shape keyboard previews for %s selected graphic elements", async selectionCount => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const select = async (count: number) => {
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
        type: selectionChangeEvent, detail: {path: [], graphic: {active: true, capture: true, mode: "select", selectionCount: count}},
      }}))
      await editor.updateComplete
      await editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!.updateComplete
    }
    await select(selectionCount)
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    expect(keyboard.insertionDisabled).toBe(false)
    expect(keyboard.keyboardInputDisabled).toBe(false)
    const detail = {type: "keydown", key: "1", code: "Digit1", altKey: false, shiftKey: true, capsLock: false, repeat: false}
    const relay = () => window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: shapeKeyboardInputEvent, detail}}))
    relay()
    expect(execute).toHaveBeenCalledWith({type: "setGraphicShapePreview", shape: "text-box",
      paint: {}, code: "Digit1", key: "1"})
    execute.mockClear()
    const key = keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".key")!
    key.dispatchEvent(new KeyboardEvent("keydown", {key: "1", code: "Digit1", altKey: false, shiftKey: true, bubbles: true, composed: true}))
    expect(execute).not.toHaveBeenCalled()
    const ellipse = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('.key[title="Ellipse"]')!
    expect(ellipse.disabled).toBe(false)
    expect(ellipse.getAttribute("draggable")).toBe("true")
    ellipse.click()
    expect(execute).toHaveBeenCalledExactlyOnceWith({type: "addGraphicShape", shape: "ellipse", paint: {fill: keyboard.paint.fill}})
    execute.mockClear()
    await select(0)
    expect(keyboard.insertionDisabled).toBe(false)
    expect(keyboard.keyboardInputDisabled).toBe(false)
    relay()
    expect(keyboard.activePage).toBe("Basic")
    expect(execute).not.toHaveBeenCalled()
  })

  it("cycles shape tabs from the document bridge and host Tab keys while captured", async () => {
    const {editor, editorWindow} = await mountEditor()
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
      type: selectionChangeEvent, detail: {path: [], graphic: {active: true, capture: true, mode: "select"}},
    }}))
    await editor.updateComplete
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    await keyboard.updateComplete
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
      type: shapeKeyboardInputEvent, detail: {type: "keydown", key: "Tab", code: "Tab", altKey: false, shiftKey: false, capsLock: false, repeat: false},
    }}))
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Advanced")
    const tab = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", shiftKey: true, bubbles: true, cancelable: true})
    document.body.dispatchEvent(tab)
    await keyboard.updateComplete
    expect(tab.defaultPrevented).toBe(true)
    expect(keyboard.activePage).toBe("Basic")
    keyboard.dispatchEvent(new CustomEvent("shape-keyboard-close", {bubbles: true, composed: true}))
    await editor.updateComplete
    const hidden = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", bubbles: true, cancelable: true})
    document.body.dispatchEvent(hidden)
    expect(hidden.defaultPrevented).toBe(false)
  })

  it("routes shape keys from the document bridge and host keyboard, respecting hidden and text editing states", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {path: [], graphic: {active: true, capture: true, mode: "select"}}}, source: editorWindow,
    }))
    await editor.updateComplete
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    keyboard.activePage = "Advanced"
    await keyboard.updateComplete
    const detail = {type: "keydown", key: "q", code: "KeyQ", altKey: false, shiftKey: true, capsLock: false, repeat: false}
    const relay = (input = detail, source: Window | null = editorWindow) => window.dispatchEvent(new MessageEvent("message", {
      data: {type: shapeKeyboardInputEvent, detail: input}, source,
    }))
    relay()
    await keyboard.updateComplete
    const shape = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-keyshortcuts="q"]')!
    shape.click()
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[0][0]).toMatchObject({type: "setGraphicShapePreview", shape: "block-arc", code: "KeyQ", key: "q"})
    expect(execute.mock.calls[1][0]).toMatchObject({type: "addGraphicShape", shape: "block-arc"})
    execute.mockClear()
    relay(detail, window)
    expect(execute).not.toHaveBeenCalled()
    relay({...detail, type: "keyup", shiftKey: false})
    await keyboard.updateComplete
    expect(keyboard.activePage).toBe("Advanced")
    expect(execute).toHaveBeenCalledWith({type: "setGraphicShapePreview", shape: null, paint: undefined, code: undefined, key: undefined})
    execute.mockClear()
    shape.dispatchEvent(new KeyboardEvent("keydown", {key: "q", code: "KeyQ", altKey: false, shiftKey: true, bubbles: true, composed: true, cancelable: true}))
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setGraphicShapePreview", shape: "block-arc"}))
    shape.dispatchEvent(new KeyboardEvent("keyup", {key: "q", code: "KeyQ", bubbles: true, composed: true, cancelable: true}))
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({type: "setGraphicShapePreview", shape: null}))
    execute.mockClear()
    document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "q", code: "KeyQ", ctrlKey: true, bubbles: true, cancelable: true}))
    document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "q", code: "KeyQ", metaKey: true, bubbles: true, cancelable: true}))
    expect(execute).not.toHaveBeenCalled()
    const input = document.createElement("input")
    editor.shadowRoot!.append(input)
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "q", code: "KeyQ", bubbles: true, composed: true}))
    expect(execute).not.toHaveBeenCalled()
    relay()
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setGraphicShapePreview", shape: "block-arc"}))
    execute.mockClear()
    vi.spyOn(document, "hasFocus").mockReturnValue(true)
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    expect(keyboard.shadowRoot!.querySelector('.key[aria-pressed="true"]')).not.toBeNull()
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    window.dispatchEvent(new Event("blur"))
    await Promise.resolve()
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector('.key[aria-pressed="true"]')).toBeNull()
    execute.mockClear()
    relay()
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setGraphicShapePreview", shape: "block-arc"}))
    execute.mockClear()
    ;(editor as any).svgText = true
    await editor.updateComplete
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setGraphicShapePreview", shape: null}))
    execute.mockClear()
    relay()
    expect(execute).not.toHaveBeenCalled()
    ;(editor as any).svgText = false
    await editor.updateComplete
    relay()
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setGraphicShapePreview", shape: "block-arc"}))
    execute.mockClear()
    keyboard.dispatchEvent(new CustomEvent("shape-keyboard-close", {bubbles: true, composed: true}))
    await editor.updateComplete
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({type: "setGraphicShapePreview", shape: null}))
    execute.mockClear()
    relay()
    expect(execute).not.toHaveBeenCalled()
  })

  it.each(["select", "draw", "lines", "curves"] as const)("routes graphic %s mode through the editor action", async mode => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {
        path: [{path: [], name: "Document"}, {path: [0], name: "Graphic"}],
        graphic: {active: true, capture: true, mode: mode === "select" ? "draw" : "select"},
      }}, source: editorWindow,
    }))
    await editor.updateComplete
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    await keyboard.updateComplete
    const modeButton = mode === "select"
      ? keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".tabs button")!
      : [...keyboard.shadowRoot!.querySelectorAll<HTMLButtonElement>(".drawing-mode")]
        .find(button => button.textContent?.trim() === (mode === "draw" ? "Freehand" : mode === "lines" ? "Lines" : "Curves"))!
    modeButton.click()
    expect(execute).toHaveBeenCalledWith(mode !== "select"
      ? {type: "setGraphicMode", mode, paint: keyboard.paint}
      : {type: "setGraphicMode", mode})
  })

  it.each(["draw", "lines", "curves"] as const)("updates %s paint from the keyboard presets and opacity control", async mode => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {
        path: [{path: [], name: "Document"}, {path: [0], name: "Graphic"}],
        graphic: {active: true, capture: true, mode},
      }}, source: editorWindow,
    }))
    await editor.updateComplete
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    await keyboard.updateComplete
    const paint = {fill: "#ffffff", stroke: "#5b9bd5", "stroke-width": "8", opacity: "1"}
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "setGraphicDrawPaint", paint})
    const opacity = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Drawing opacity"]')!
    opacity.value = "0.5"
    opacity.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
    expect(execute).toHaveBeenLastCalledWith({type: "setGraphicDrawPaint", paint: {...paint, opacity: "0.5"}})
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
      type: shapeKeyboardInputEvent,
      detail: {type: "keydown", key: "œ", code: "KeyQ", altKey: true, shiftKey: false, capsLock: false, repeat: false},
    }}))
    expect(execute).toHaveBeenLastCalledWith({type: "setGraphicDrawPaint", paint: {...paint, stroke: "#ffffff", "stroke-width": "2", opacity: "0.5"}})
    const key = keyboard.shadowRoot!.querySelector<HTMLButtonElement>(".brush-grid .brush")!
    const shortcut = new KeyboardEvent("keydown", {key: "º", code: "Digit0", altKey: true, bubbles: true, composed: true, cancelable: true})
    key.dispatchEvent(shortcut)
    expect(shortcut.defaultPrevented).toBe(true)
    expect(execute).toHaveBeenLastCalledWith({type: "setGraphicDrawPaint", paint: {...paint, stroke: "#70ad47", "stroke-width": "1", opacity: "0.5"}})
  })

  it("restores the clicked session brush after temporary keys and keyboard recreation", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const select = async (capture: boolean) => {
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
        type: selectionChangeEvent, detail: {path: [], ...(capture ? {graphic: {active: true, capture: true, mode: "draw"}} : {})},
      }}))
      await editor.updateComplete
    }
    await select(true)
    let keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!.click()
    await editor.updateComplete
    const saved = {...keyboard.paint}
    const input = {type: "keydown" as "keydown" | "keyup", key: "0", code: "Digit0", altKey: false, shiftKey: false, capsLock: false, repeat: false}
    const relay = (type: "keydown" | "keyup") => window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
      type: shapeKeyboardInputEvent, detail: {...input, type},
    }}))
    relay("keydown")
    expect(execute).toHaveBeenLastCalledWith({type: "setGraphicDrawPaint", paint: {...saved, stroke: "#70ad47", "stroke-width": "1"}})
    expect(keyboard.paint).toEqual(saved)
    relay("keyup")
    expect(execute).toHaveBeenLastCalledWith({type: "setGraphicDrawPaint", paint: saved})
    relay("keydown")
    await select(false)
    await select(true)
    keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    await keyboard.updateComplete
    expect(keyboard.paint).toEqual(saved)
    expect(keyboard.shadowRoot!.querySelector('.brush[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("#5b9bd5, 8 px brush")
  })

  it.each(["draw", "lines", "curves"] as const)("retains the selected %s brush after drawing completion updates", async mode => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const update = () => window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
      type: selectionChangeEvent, detail: {path: [], graphic: {active: true, capture: true, mode, selectionCount: 0}},
    }}))
    update()
    await editor.updateComplete
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    await keyboard.updateComplete
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#5b9bd5, 8 px brush"]')!.click()
    for(let completion = 0; completion < 2; completion++) {
      update()
      await editor.updateComplete
      await keyboard.updateComplete
      expect(keyboard.shadowRoot!.querySelector('.brush[aria-pressed="true"]')?.getAttribute("aria-label")).toBe("#5b9bd5, 8 px brush")
      expect(keyboard.mode).toBe(mode)
      expect(keyboard.keyboardInputDisabled).toBe(false)
    }
    window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
      type: shapeKeyboardInputEvent, detail: {type: "keydown", key: "0", code: "Digit0", altKey: true, shiftKey: false, capsLock: false, repeat: false},
    }}))
    expect(execute).toHaveBeenLastCalledWith({type: "setGraphicDrawPaint", paint: {fill: "#ffffff", stroke: "#70ad47", "stroke-width": "1", opacity: "1"}})
    expect(execute.mock.calls.some(([action]) => action.type === "setGraphicMode")).toBe(false)
  })

  it("keeps the drawing tab idle after explicitly switching to selection and rearms it with a new brush", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const updateMode = async (mode: "select" | "curves") => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {
          path: [{path: [], name: "Document"}, {path: [0], name: "Graphic"}],
          graphic: {active: true, capture: true, mode, selectionCount: mode === "select" ? 1 : 0,
            ...(mode === "select" ? {shape: "bezier"} : {})},
        }}, source: editorWindow,
      }))
      await editor.updateComplete
    }
    await updateMode("curves")
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    await keyboard.updateComplete
    expect(execute).not.toHaveBeenCalled()
    execute.mockClear()
    await updateMode("select")
    await keyboard.updateComplete
    expect(keyboard.shadowRoot!.querySelector(".drawing-panel")!.getAttribute("aria-label")).toBe("Curves drawing")
    expect(keyboard.shadowRoot!.querySelectorAll('.brush[aria-pressed="true"]')).toHaveLength(0)
    const opacity = keyboard.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Drawing opacity"]')!
    opacity.value = "0.5"
    opacity.dispatchEvent(new Event("input", {bubbles: true, composed: true}))
    expect(execute).not.toHaveBeenCalled()
    keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="#70ad47, 8 px brush"]')!.click()
    expect(execute).toHaveBeenCalledExactlyOnceWith({type: "setGraphicMode", mode: "curves",
      paint: {fill: "#ffffff", stroke: "#70ad47", "stroke-width": "8", opacity: "0.5"}})
  })

  it("opens the touch text keyboard on a deliberate tap and supports switching to device input", async () => {
    vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(5)
    const {editor, editorWindow} = await mountEditor()
    const control = vi.spyOn(editor as any, "postFrameControl")
    const keyboard = () => editor.shadowRoot!.querySelector("dom-editor-text-keyboard")
    const message = async (data: object) => {
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data}))
      await editor.updateComplete
    }
    await message({type: selectionChangeEvent, detail: {path: [], textKeyboard: true}})
    expect(keyboard()).toBeNull()
    await message({type: "editor-text-entry", pointerType: "mouse"})
    expect(keyboard()).toBeNull()
    await message({type: "editor-text-entry", pointerType: "touch"})
    expect(keyboard()).not.toBeNull()
    keyboard()!.dispatchEvent(new CustomEvent("text-keyboard-native"))
    await editor.updateComplete
    expect(control).toHaveBeenCalledWith("touch-keyboard-mode", {enabled: false})
    expect(keyboard()).toBeNull()
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show text keyboard"]')!.click()
    await editor.updateComplete
    expect(control).toHaveBeenCalledWith("touch-keyboard-mode", {enabled: true})
    expect(keyboard()).not.toBeNull()
    await message({type: selectionChangeEvent, detail: {path: [], gap: {parentPath: [], offset: 0}}})
    expect(keyboard()).toBeNull()
  })

  it("offers the text keyboard on desktop only with the preference and a text selection", async () => {
    const {editor, editorWindow} = await mountEditor()
    const host = editor as any
    const keyboard = () => editor.shadowRoot!.querySelector("dom-editor-text-keyboard")
    const reopen = () => editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show text keyboard"]')
    const message = async (data: object) => {
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data}))
      await editor.updateComplete
    }
    const caret = {type: selectionChangeEvent, detail: {path: [{path: [], name: "Document"}], textKeyboard: true}}
    const click = {type: "editor-text-entry", pointerType: "mouse"}
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    vi.spyOn(host, "focusEditor").mockImplementation(() => {})
    const control = vi.spyOn(host, "postFrameControl")
    await message(caret)
    await message(click)
    expect(keyboard()).toBeNull()
    expect(reopen()).toBeNull()

    const preference = (enabled: boolean) => host.handleAppSettingsChange(new CustomEvent("app-settings-change", {
      detail: {...host.settings, alwaysShowTextKeyboard: enabled},
    }))
    preference(true)
    expect(control).toHaveBeenCalledWith("touch-keyboard-preference", {enabled: true})
    await message(caret)
    expect(reopen()).not.toBeNull()
    await message(click)
    expect(keyboard()).not.toBeNull()
    keyboard()!.dispatchEvent(new CustomEvent("text-keyboard-command", {detail: {command: "insert", text: "a"}}))
    expect(execute).toHaveBeenCalledWith({type: "textKeyboardInput", command: "insert", text: "a"})
    keyboard()!.dispatchEvent(new CustomEvent("text-keyboard-close"))
    await message(caret)
    expect(keyboard()).toBeNull()
    reopen()!.click()
    await editor.updateComplete
    expect(keyboard()).not.toBeNull()
    await message({type: selectionChangeEvent, detail: {path: [], nodeSelected: true}})
    expect(keyboard()).toBeNull()
    expect(reopen()).toBeNull()
    await message(caret)
    await message(click)
    preference(false)
    await editor.updateComplete
    expect(control).toHaveBeenCalledWith("touch-keyboard-preference", {enabled: false})
    expect(keyboard()).toBeNull()
    expect(reopen()).toBeNull()
  })

  it("shows shape input for captured graphics and routes styled keys", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const select = async (graphic: {active: true, capture: boolean} | null) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {
          path: [{path: [], name: "Document"}, {path: [0], name: "Graphic"}], ...(graphic ? {graphic} : {}),
        }}, source: editorWindow,
      }))
      await editor.updateComplete
    }
    await select({active: true, capture: false})
    expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBeNull()
    await select({active: true, capture: true})
    const keyboard = editor.shadowRoot!.querySelector<ShapeKeyboard>("dom-editor-shape-keyboard")!
    expect(keyboard.closest(".document-stage")).not.toBeNull()
    const paint = {fill: "#60a5fa", stroke: "#334155", "stroke-width": "8", opacity: "0.5"}
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.dispatchEvent(new CustomEvent("shape-paint-change", {detail: {paint}, bubbles: true, composed: true}))
    await editor.updateComplete
    await keyboard.updateComplete
    expect((keyboard as unknown as {paint: object}).paint).toEqual(paint)
    expect(execute).not.toHaveBeenCalled()
    keyboard.dispatchEvent(new CustomEvent("shape-keyboard-command", {
      detail: {shape: "heart", paint}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "addGraphicShape", shape: "heart", paint})
    keyboard.dispatchEvent(new CustomEvent("shape-keyboard-close", {bubbles: true, composed: true}))
    await editor.updateComplete
    expect(keyboard.closest("section")!.hasAttribute("hidden")).toBe(true)
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show shape keyboard"]')!.click()
    await editor.updateComplete
    expect(keyboard.closest("section")!.hasAttribute("hidden")).toBe(false)
    expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBe(keyboard)
    await select(null)
    expect(editor.shadowRoot!.querySelector("dom-editor-shape-keyboard")).toBeNull()
    execute.mockClear()
    keyboard.dispatchEvent(new CustomEvent("shape-keyboard-command", {detail: {shape: "heart", paint}, bubbles: true, composed: true}))
    expect(execute).not.toHaveBeenCalled()
  })

  it.each(["mark:a", "mark-detail:a"])("focuses Web address after adding a link with %s", async label => {
    const {editor, editorWindow} = await mountEditor()
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const execute = vi.spyOn(editor, "execute").mockImplementation(async () => {
      dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attributes: {a: {}}, link: {
        active: true, identity: "new-link", href: "", attributes: {}, text: "Text", targets: [],
      }})
      return true
    })
    editor.shadowRoot!.querySelector("dom-editor-toolbox")!.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label}, bubbles: true, composed: true,
    }))
    await editor.updateComplete
    await Promise.resolve()
    await vi.waitFor(() => {
      const keyboard = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-link-keyboard")!
      expect(keyboard?.shadowRoot?.activeElement).toBe(keyboard?.shadowRoot?.querySelector('[aria-label="Web address"]'))
      expect(keyboard).not.toBeNull()
    })
    expect(execute).toHaveBeenCalledWith(label === "mark:a"
      ? {type: "selectLinkKind", kind: "link", toggle: true}
      : {type: "toggleMark", mark: "a"})
  })

  it.each([
    ["cross-reference", "Cross Reference", "Search cross references"],
    ["citation", "Citation", "Search citations"],
  ] as const)("opens and focuses the %s keyboard from the Link radio menu", async (kind, label, searchLabel) => {
    const {editor, editorWindow} = await mountEditor()
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: []})
    const execute = vi.spyOn(editor, "execute").mockImplementation(async action => {
      if(action.type !== "selectLinkKind") return undefined
      dispatchMarkState(editor, editorWindow, {canMark: true, marks: [], link: {
        active: true, kind, identity: "draft", href: "", attributes: {}, text: "Label", targets: [],
      }})
      return true
    })
    await editor.updateComplete
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await ribbon.updateComplete
    const link = ribbon.shadowRoot!.querySelector<RibbonButton>(".mark-span")!
    await link.updateComplete
    link.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await link.updateComplete
    link.shadowRoot!.querySelector<HTMLInputElement>(`input[aria-label="Select ${label}"]`)!.click()
    expect(execute).toHaveBeenCalledWith({type: "selectLinkKind", kind, toggle: false})
    await vi.waitFor(() => {
      const keyboard = editor.shadowRoot!.querySelector<LinkKeyboard>("dom-editor-link-keyboard")!
      expect(keyboard.shadowRoot!.querySelector("h2")?.textContent).toBe(label)
      expect(focus.mock.contexts).toContain(keyboard.shadowRoot!.querySelector(`[aria-label="${searchLabel}"]`))
    })
  })

  it("removes a cross reference from its checked Link menu row and returns focus", async () => {
    const {editor, editorWindow} = await mountEditor()
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const execute = vi.spyOn(editor, "execute").mockImplementation(async () => {
      dispatchMarkState(editor, editorWindow, {canMark: true, marks: []})
      return true
    })
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attributes: {a: {href: "#intro"}}})
    await editor.updateComplete
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    await ribbon.updateComplete
    const link = ribbon.shadowRoot!.querySelector<RibbonButton>(".mark-span")!
    await link.updateComplete
    link.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await link.updateComplete
    const row = link.shadowRoot!.querySelector<HTMLElement>('[title="Remove Cross Reference"]')!
    expect(row.querySelector("input")?.checked).toBe(true)
    row.click()
    expect(execute).toHaveBeenCalledExactlyOnceWith({type: "removeLinkKind", kind: "cross-reference"})
    await vi.waitFor(() => expect(focusEditor).toHaveBeenCalled())
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).toBeNull()
  })

  it("shows, closes, reopens, and routes the link keyboard without losing the selection", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const selection = {
      active: true, identity: "link-1", href: "#intro", attributes: {href: "#intro"},
      text: "Intro", targets: [{href: "#intro", label: "Intro"}],
    }
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attributes: {a: {href: "#intro"}}, link: selection})
    await editor.updateComplete

    const keyboard = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-link-keyboard")!
    expect(keyboard.closest(".link-keyboard-area")).not.toBeNull()
    keyboard.dispatchEvent(new CustomEvent("link-keyboard-command", {
      detail: {identity: "link-1", href: "#intro", attributes: {target: "_blank"}},
      bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({
      type: "editLink", identity: "link-1", href: "#intro", attributes: {target: "_blank"},
    })

    const close = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close cross reference keyboard"]')!
    const pointer = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})
    close.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(true)
    close.click()
    await editor.updateComplete
    expect(keyboard.closest("section")!.hasAttribute("hidden")).toBe(true)
    const reopen = editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show cross reference keyboard"]')!
    const reopenPointer = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})
    reopen.dispatchEvent(reopenPointer)
    expect(reopenPointer.defaultPrevented).toBe(true)
    reopen.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).toBe(keyboard)
    expect(keyboard.closest("section")!.hasAttribute("hidden")).toBe(false)
    await vi.waitFor(() => expect(keyboard.shadowRoot!.activeElement).toBe(keyboard.shadowRoot!.querySelector('[aria-label="Search cross references"]')))
    expect(focusEditor).toHaveBeenCalled()
  })

  it("routes the Attachment control to the toggle command and returns focus after removal", async () => {
    const {editor, editorWindow} = await mountEditor()
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const execute = vi.spyOn(editor, "execute").mockImplementation(async () => {
      dispatchMarkState(editor, editorWindow, {canMark: true, marks: []})
      return true
    })
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attachment: {identity: "inside", media: []}})
    await editor.updateComplete
    editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "mark:attachment"}, bubbles: true, composed: true,
    }))
    await vi.waitFor(() => expect(focusEditor).toHaveBeenCalled())
    expect(execute).toHaveBeenCalledWith({type: "selectLinkKind", kind: "attachment", toggle: true})
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).toBeNull()
  })

  it("opens the attachment keyboard on selection and keeps its paperclip collapsed while the selection stays inside", async () => {
    const {editor, editorWindow} = await mountEditor()
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const selectAttachment = (identity: string) =>
      dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attachment: {identity, media: []}})
    selectAttachment("inside")
    await editor.updateComplete
    const keyboard = editor.shadowRoot!.querySelector<LinkKeyboard>("dom-editor-link-keyboard")!
    await keyboard.updateComplete
    const pane = keyboard.closest<HTMLElement>("section")!
    const file = keyboard.shadowRoot!.querySelector<HTMLInputElement>("#attachment-file")!
    expect(pane.hidden).toBe(false)
    expect(file.matches(":focus")).toBe(false)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    expect(ribbon.shadowRoot!.querySelector(".mark-span")?.getAttribute("icon")).toBe("MarkLink")

    const close = keyboard.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close attachment keyboard"]')!
    const pointer = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true})
    close.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(true)
    close.click()
    await editor.updateComplete
    expect(pane.hidden).toBe(true)
    selectAttachment("still-inside")
    await editor.updateComplete
    expect(pane.hidden).toBe(true)

    const reopen = editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show attachment keyboard"]')!
    expect(reopen.classList.contains("math-keyboard-open")).toBe(true)
    expect(reopen.querySelector("svg.icon-tabler-paperclip")).not.toBeNull()
    reopen.click()
    await vi.waitFor(() => expect(keyboard.shadowRoot!.activeElement).toBe(file))
    expect(pane.hidden).toBe(false)
    expect(focusEditor).toHaveBeenCalled()

    file.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true}))
    await editor.updateComplete
    expect(pane.hidden).toBe(true)
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: []})
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).toBeNull()
    selectAttachment("reentered")
    await vi.waitFor(() => expect(editor.shadowRoot!.querySelector<HTMLElement>(".link-keyboard-area")?.hidden).toBe(false))
  })

  it.each(["Reference could not be saved", "Target view is unavailable"])(
    "surfaces link keyboard reference/view errors: %s", async message => {
      const {editor, editorWindow} = await mountEditor()
      vi.spyOn(editor, "execute").mockRejectedValue(new Error(message))
      const selection = {
        active: true, identity: "link-1", href: "#intro", attributes: {href: "#intro"},
        text: "Intro", targets: [{href: "#intro", label: "Intro"}],
      }
      dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attributes: {a: {href: "#intro"}}, link: selection})
      await editor.updateComplete
      const keyboard = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-link-keyboard")!
      keyboard.dispatchEvent(new CustomEvent("link-keyboard-command", {
        detail: {identity: "link-1", href: "#intro", attributes: {"data-reference": JSON.stringify({title: "Intro"})}},
        bubbles: true, composed: true,
      }))
      await Promise.resolve()
      await Promise.resolve()
      await editor.updateComplete
      expect(keyboard.shadowRoot!.querySelector('[role="alert"]')?.textContent).toBe(message)
    },
  )

  it.each(["previewActive", "liveSessionActive"] as const)(
    "ignores link keyboard commands while %s", async mode => {
      const {editor, editorWindow} = await mountEditor()
      const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
      const selection = {
        active: true, identity: "link-1", href: "#intro", attributes: {href: "#intro"},
        text: "Intro", targets: [{href: "#intro", label: "Intro"}],
      }
      dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attributes: {a: {href: "#intro"}}, link: selection})
      await editor.updateComplete
      const keyboard = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-link-keyboard")!
      Object.assign(editor, {[mode]: true})
      keyboard.dispatchEvent(new CustomEvent("link-keyboard-command", {
        detail: {identity: "link-1", href: "https://example.com", attributes: {}}, bubbles: true, composed: true,
      }))
      expect(execute).not.toHaveBeenCalled()
      await editor.updateComplete
    },
  )

  it("retires the link keyboard on a newer node selection or link-free mark state", async () => {
    const {editor, editorWindow} = await mountEditor()
    const selection = {
      active: true, identity: "link-1", href: "#intro", attributes: {href: "#intro"},
      text: "Intro", targets: [{href: "#intro", label: "Intro"}],
    }
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attributes: {a: {href: "#intro"}}, link: selection})
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).not.toBeNull()

    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {
        path: [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}], nodeSelected: true,
      }, bridgeNonce: (editor as any).bridgeNonce},
      source: editorWindow,
      origin: window.location.origin,
    }))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).toBeNull()

    dispatchMarkState(editor, editorWindow, {canMark: true, marks: ["a"], attributes: {a: {href: "#intro"}}, link: selection})
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).not.toBeNull()
    dispatchMarkState(editor, editorWindow, {canMark: true, marks: [], attributes: {}})
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-link-keyboard")).toBeNull()
  })

  it("shows formula input in the document column without a Formula toolbox", async () => {
    const {editor, editorWindow} = await mountEditor()
    expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).toBeNull()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    // Selection comes from the mocked bridge; focusing the empty test frame
    // must not replace it with that frame's unrelated native selection.
    const focusEditor = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const math = {active: true as const, display: "inline" as const}
    window.dispatchEvent(new MessageEvent("message", {
      data: {type: selectionChangeEvent, detail: {
        path: [{path: [], name: "Document"}, {path: [0], name: "Formula"}], math, inserted: true,
      }}, source: editorWindow,
    }))
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.math).toEqual(math)
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Formula"]')).toBeNull()
    const keyboard = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-math-keyboard")!
    expect(keyboard.closest(".math-keyboard-area")).not.toBeNull()
    expect(keyboard.closest(".document-stage")).not.toBeNull()
    keyboard.dispatchEvent(new CustomEvent("math-keyboard-command", {
      detail: {command: "structure:frac"}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "editMath", command: "keyboard:structure:frac"})
    keyboard.dispatchEvent(new CustomEvent("math-keyboard-close", {bubbles: true, composed: true}))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).toBeNull()
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show formula keyboard"]')!.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).not.toBeNull()
    expect(focusEditor).toHaveBeenCalled()
  })

  it("cycles formula tabs from trusted frame messages and host Tab keys only while captured", async () => {
    const {editor, editorWindow} = await mountEditor()
    const select = async (capture: boolean) => {
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {
        type: selectionChangeEvent, detail: {path: [], math: {active: true, display: "block"}, capture},
      }}))
      await editor.updateComplete
    }
    await select(true)
    const keyboard = editor.shadowRoot!.querySelector<MathKeyboard>("dom-editor-math-keyboard")!
    await keyboard.updateComplete
    const relay = (backward: boolean, source: Window = editorWindow!) => window.dispatchEvent(new MessageEvent("message", {
      source, data: {type: mathKeyboardTabEvent, detail: {backward}},
    }))
    relay(false, window)
    expect(keyboard.activeLayout).toBe("numbers")
    relay(false)
    await keyboard.updateComplete
    expect(keyboard.activeLayout).toBe("operators")
    const tab = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", shiftKey: true, bubbles: true, cancelable: true})
    document.body.dispatchEvent(tab)
    await keyboard.updateComplete
    expect(tab.defaultPrevented).toBe(true)
    expect(keyboard.activeLayout).toBe("numbers")
    const input = document.createElement("input")
    editor.shadowRoot!.append(input)
    const fieldTab = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", bubbles: true, composed: true, cancelable: true})
    input.dispatchEvent(fieldTab)
    expect(fieldTab.defaultPrevented).toBe(false)
    expect(keyboard.activeLayout).toBe("numbers")
    await select(false)
    relay(false)
    expect(keyboard.activeLayout).toBe("numbers")
    const uncaptured = new KeyboardEvent("keydown", {key: "Tab", code: "Tab", bubbles: true, cancelable: true})
    document.body.dispatchEvent(uncaptured)
    expect(uncaptured.defaultPrevented).toBe(false)
  })

  it("shows the block formula keyboard only during capture selection", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const select = async (capture: boolean) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {type: selectionChangeEvent, detail: {
          path: [{path: [], name: "Document"}, {path: [0], name: "Formula"}],
          math: {active: true, display: "block"}, nodeSelected: true, capture,
        }}, source: editorWindow,
      }))
      await editor.updateComplete
    }
    await select(false)
    expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).toBeNull()
    expect(editor.shadowRoot!.querySelector('[aria-label="Show formula keyboard"]')).toBeNull()
    await select(true)
    const keyboard = editor.shadowRoot!.querySelector<HTMLElement>("dom-editor-math-keyboard")!
    expect(keyboard).not.toBeNull()
    keyboard.dispatchEvent(new CustomEvent("math-keyboard-close", {bubbles: true, composed: true}))
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector('[aria-label="Show formula keyboard"]')).not.toBeNull()
    await select(false)
    expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).toBeNull()
    expect(editor.shadowRoot!.querySelector('[aria-label="Show formula keyboard"]')).toBeNull()
    keyboard.dispatchEvent(new CustomEvent("math-keyboard-command", {
      detail: {command: "text:x"}, bubbles: true, composed: true,
    }))
    expect(execute).not.toHaveBeenCalled()
    await select(true)
    editor.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show formula keyboard"]')!.click()
    await editor.updateComplete
    expect(editor.shadowRoot!.querySelector("dom-editor-math-keyboard")).not.toBeNull()
  })

  it("allows ribbon inputs to receive pointer focus", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const root = ribbon.shadowRoot!.querySelector(".ribbon")!
    const input = document.createElement("input")
    root.append(input)
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})

    expect(input.dispatchEvent(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it("restores the editor selection after a ribbon input loses focus", async () => {
    const {editor, iframe} = await mountEditor()
    const frameDocument = iframe.contentDocument!
    frameDocument.body.innerHTML = "<p>hello</p>"
    const text = frameDocument.querySelector("p")!.firstChild!
    const selection = frameDocument.getSelection()!
    selection.setBaseAndExtent(text, 1, text, 4)
    iframe.focus()
    iframe.dispatchEvent(new Event("blur"))

    const focus = vi.spyOn(iframe, "focus")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const root = ribbon.shadowRoot!.querySelector(".ribbon")!
    const input = document.createElement("input")
    root.append(input)

    input.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0}))
    input.dispatchEvent(new FocusEvent("focusin", {bubbles: true, composed: true}))
    input.dispatchEvent(new FocusEvent("focusout", {bubbles: true, composed: true, relatedTarget: null}))
    await Promise.resolve()

    expect(focus).toHaveBeenCalledWith({preventScroll: true})
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(1)
    expect(selection.focusNode).toBe(text)
    expect(selection.focusOffset).toBe(4)
  })

  it("restores iframe focus after a ribbon command", async () => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focus = vi.spyOn(iframe, "focus")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()
    await execute.mock.results[0].value

    expect(focus).toHaveBeenCalledWith({preventScroll: true})
  })

  it("uses one Heading ribbon button with a submenu for the other heading levels", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Heading"]')!
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Elements"] ribbon-button[label="Heading 2"]')).toBeNull()
    await heading.updateComplete

    heading.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Heading"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "insertElement", tag: "h1"})

    heading.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete
    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    await submenu.updateComplete
    submenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Heading 3"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "insertElement", tag: "h3"})

    submenu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Divider"]')!.click()
    expect(execute).toHaveBeenLastCalledWith({type: "insertElement", tag: "hr"})
  })

  it("applies or changes a section type without form insertion", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    expect(ribbon.shadowRoot!.querySelector('ribbon-button[label="Form"]')).toBeNull()
    ribbon.canSection = true
    ribbon.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label: "toggle-section"}, bubbles: true, composed: true}))
    expect(execute).toHaveBeenCalledWith({type: "toggleSection", section: "section"})
    ribbon.activeMenu = "Edit"
    ribbon.sectionSelected = true
    await ribbon.updateComplete
    const sectionType = ribbon.shadowRoot!.querySelector<HTMLSelectElement>('ribbon-drawer[label="Section"] select')!
    sectionType.value = "address"
    sectionType.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(execute).toHaveBeenLastCalledWith({type: "setSectionType", section: "address"})

    sectionType.value = "figure"
    sectionType.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(execute).toHaveBeenLastCalledWith({type: "setSectionType", section: "figure"})
  })

  it("does not offer HTML insertion", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    expect(ribbon.shadowRoot!.querySelector('ribbon-button[label="HTML"]')).toBeNull()
  })

  it("does not offer dialog insertion in the Details button", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const details = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Details"]',
    )!
    await details.updateComplete
    expect(details.submenu).toEqual([])
    expect(details.shadowRoot!.querySelector(".submenu-trigger")).toBeNull()
  })

  it("keeps Paragraph insertion without a Preformatted Text submenu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const paragraph = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    expect(paragraph.submenu).toEqual([])
    expect(paragraph.shadowRoot!.querySelector('button[aria-label="Show more Paragraph options"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-button[label="Preformatted Text"]')).toBeNull()
    paragraph.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(execute).toHaveBeenCalledWith({type: "insertElement", tag: "p"})
  })

  it("closes expanded ribbon-button menus when the editor receives focus", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Heading"]')!
    await heading.updateComplete
    heading.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete

    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    expect(submenu.hidden).toBe(false)
    iframe.contentDocument!.dispatchEvent(new Event("focusin", {bubbles: true}))
    await heading.updateComplete

    expect(submenu.hidden).toBe(true)
  })

  it.each(["same-origin", "isolated"])("closes ribbon dropdowns on document typing in a %s frame without consuming input", async mode => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const doc = iframe.contentDocument!
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Heading"]')!
    await heading.updateComplete
    const toggle = heading.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const submenu = heading.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    if(mode === "isolated") (editor as any).editorOpaque = true
    try {
      for(const inputType of ["insertText", "insertCompositionText"]) {
        toggle.click()
        await heading.updateComplete
        expect(submenu.hidden).toBe(false)
        if(mode === "same-origin") {
          const input = new InputEvent("beforeinput", {inputType, data: "a", isComposing: inputType === "insertCompositionText",
            bubbles: true, composed: true, cancelable: true})
          doc.body.dispatchEvent(input)
          expect(input.defaultPrevented).toBe(false)
        }
        else {
          // Unauthenticated messages cannot dismiss editor UI.
          window.dispatchEvent(new MessageEvent("message", {data: {type: "editor-frame-beforeinput"}}))
          await heading.updateComplete
          expect(submenu.hidden).toBe(false)
          window.dispatchEvent(new MessageEvent("message", {source: editorWindow, data: {type: "editor-frame-beforeinput"}}))
        }
        await heading.updateComplete
        expect(submenu.hidden).toBe(true)
      }
    }
    finally { (editor as any).editorOpaque = false }
  })

  it("keeps dropdowns open while typing in ribbon, appendix, form, and widget fields", async () => {
    const {editor, iframe} = await mountEditor()
    const doc = iframe.contentDocument!
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Heading"]')!
    await heading.updateComplete
    const appendix = doc.body.attachShadow({mode: "open"})
    appendix.append(doc.createElement("slot"))
    const appendixInput = doc.createElement("input")
    appendix.append(appendixInput)
    const widget = doc.createElement("demo-widget")
    doc.body.append(widget)
    const widgetInput = doc.createElement("input")
    widget.attachShadow({mode: "open"}).append(widgetInput)
    const formInput = doc.createElement("input")
    doc.body.append(formInput)
    const ribbonInput = document.createElement("input")
    ribbon.shadowRoot!.append(ribbonInput)
    heading.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await heading.updateComplete
    const submenu = heading.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    for(const input of [appendixInput, widgetInput, formInput, ribbonInput]) {
      input.dispatchEvent(new InputEvent("beforeinput", {inputType: "insertText", data: "a", bubbles: true, composed: true}))
      await heading.updateComplete
      expect(submenu.hidden).toBe(false)
    }
    editor.remove()
    const dismiss = vi.spyOn(editor as any, "dismissEditorMenus")
    doc.body.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, composed: true}))
    expect(dismiss).not.toHaveBeenCalled()
  })

  it.each(["same-origin", "isolated"])("preserves focus in appendix URL controls in a %s frame", async mode => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const doc = iframe.contentDocument!
    doc.body.innerHTML = '<picture><img></picture><svg xmlns="http://www.w3.org/2000/svg"><image width="320" height="240"/></svg>'
    const appendix = doc.body.attachShadow({mode: "open"})
    appendix.append(doc.createElement("slot"))
    const placeholder = doc.createElement("div")
    appendix.append(placeholder)
    const root = placeholder.attachShadow({mode: "open"})
    const input = doc.createElement("input")
    input.type = "url"
    root.append(input)
    const focus = vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const dismiss = vi.spyOn(editor as any, "dismissEditorMenus")
    input.focus()
    if(mode === "same-origin") {
      input.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, button: 0}))
    }
    else {
      ;(editor as any).editorOpaque = true
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
        data: {type: "editor-frame-pointerdown", appendix: true, targetPath: null}}))
    }
    expect(focus).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
    expect(root.activeElement).toBe(input)
    // Authored document clicks must still activate normal editing focus.
    if(mode === "same-origin") doc.querySelector("picture")!.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, button: 0}))
    else window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
      data: {type: "editor-frame-pointerdown", appendix: false, targetPath: [0]}}))
    expect(focus).toHaveBeenCalledOnce()
    ;(editor as any).editorOpaque = false
  })

  it.each(["canvas", "slides"])("dismisses transient menus before %s claims the pointer, preserving toolbox panes", async mode => {
    const {editor, iframe, editorWindow} = await mountEditor()
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const doc = iframe.contentDocument!
    doc.body.className = `ww-${mode}`
    doc.body.innerHTML = '<section><p>Content</p></section>'
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    ;(editor as any).dialogSelection = {attributes: {}, initiallyOpen: false, closedBy: "", openerCount: 0, closeControlCount: 0, hasDialogForm: false}
    await editor.updateComplete
    toolbox.selectTool("Edit")
    await toolbox.updateComplete
    const heading = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Heading"]')!
    const attributes = toolbox.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Attributes"]')!
    await heading.updateComplete
    await attributes.updateComplete
    // Opening the second menu by keyboard keeps both menus present.
    heading.shadowRoot!.querySelector<HTMLButtonElement>('.submenu-trigger')!.click()
    attributes.shadowRoot!.querySelector<HTMLButtonElement>('.submenu-trigger')!.click()
    await heading.updateComplete
    await attributes.updateComplete
    const headingMenu = heading.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    expect(headingMenu.hidden).toBe(false)
    expect(attributes.shadowRoot!.querySelector('.submenu-trigger')!.getAttribute("aria-expanded")).toBe("true")
    const claimed = vi.fn((event: Event) => event.stopImmediatePropagation())
    doc.addEventListener("pointerdown", claimed, true)
    try {
      doc.querySelector("p")!.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, composed: true, button: 0}))
      await heading.updateComplete
      await attributes.updateComplete
      expect(claimed).toHaveBeenCalledOnce()
      expect(headingMenu.hidden).toBe(true)
      expect(attributes.shadowRoot!.querySelector('.submenu-trigger')!.getAttribute("aria-expanded")).toBe("false")
      expect(toolbox.activeTool).toBe("Edit")
      // The same dismissal applies to authenticated cross-origin relays.
      ;(editor as any).editorOpaque = true
      heading.shadowRoot!.querySelector<HTMLButtonElement>('.submenu-trigger')!.click()
      await heading.updateComplete
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
        data: {type: "editor-frame-pointerdown", widgetShadow: true, targetPath: [0, 0]}}))
      await heading.updateComplete
      expect(headingMenu.hidden).toBe(false)
      window.dispatchEvent(new MessageEvent("message", {source: editorWindow,
        data: {type: "editor-frame-pointerdown", targetPath: [0, 0]}}))
      await heading.updateComplete
      expect(headingMenu.hidden).toBe(true)
    }
    finally {
      ;(editor as any).editorOpaque = false
      doc.removeEventListener("pointerdown", claimed, true)
    }
  })

  it("does not expose Insert as a collapsed ribbon menu", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete

    expect(ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector("ribbon-menu")?.hidden).toBe(true)
  })
})

describe("cloud service settings integration", () => {
  const service = {id: "cloud-a", type: "url" as const, url: "https://cloud.example", username: "ada", accessToken: "token"}
  const session = {
    kind: "webwriter-cloud-service", version: 1, authentication: "bearer",
    apiBaseUrl: "https://cloud.example/api", collaborationUrl: "wss://cloud.example",
    adminUrl: "https://cloud.example/admin", capabilities: ["documents"], user: {id: "ada", name: "Ada"},
  }
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers: {"Content-Type": "application/json"}})

  it("gates AI, collaboration and preview sharing on the connection, while keeping local export available", async () => {
    vi.stubGlobal("fetch", vi.fn(async(url: string) => response(String(url).endsWith("/session") ? session : {documents: []})))
    const {editor} = await mountEditor()
    const host = editor as any
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    const root = ribbon.shadowRoot!
    const collaboration = root.querySelector<RibbonButton>(".file-share-action")!
    const chat = root.querySelector<HTMLButtonElement>(".ai-chat-brand-button")!
    const prompt = root.querySelector<HTMLTextAreaElement>(".ai-prompt-input")!
    const aiTab = () => toolbox.shadowRoot!.querySelector<HTMLButtonElement>('[data-tool="AI"]')!
    const providers = () => root.querySelector("ai-settings-dialog")!.shadowRoot!.querySelector<HTMLElement>(".provider-cards")!

    await collaboration.updateComplete
    const collaborationTrigger = collaboration.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    for(const control of [chat, aiTab(), collaborationTrigger]) {
      expect(control.getAttribute("aria-disabled")).toBe("true")
      expect(control.title).toContain("Connect to a cloud service")
      control.click()
    }
    expect(ribbon.aiChatOpen).toBe(false)
    expect(toolbox.activeTool).toBeNull()
    expect(collaborationTrigger.getAttribute("aria-expanded")).toBe("false")
    expect(prompt.disabled).toBe(true)

    host.backendState = "unavailable"
    await editor.updateComplete
    await ribbon.updateComplete
    root.querySelector<RibbonTab>('ribbon-tab[label="File"]')!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await ribbon.updateComplete
    const fileMenu = root.querySelector<RibbonMenu>("#ribbon-file-menu")!
    await fileMenu.updateComplete
    fileMenu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Settings"]')!.click()
    await ribbon.updateComplete
    root.querySelector<HTMLButtonElement>("#settings-tab-cloud")!.click()
    await vi.waitFor(() => expect(providers().querySelector("[inert]")).not.toBeNull())
    expect(providers().title).toContain("Connect to a cloud service")

    host.settings = {...defaultAppSettings(), cloudServices: [service], activeCloudServiceId: service.id, cloudServicesConfigured: true}
    await host.loginToBackend()
    await editor.updateComplete
    await ribbon.updateComplete
    expect(providers().querySelector("[inert]")).toBeNull()
    expect(aiTab().hasAttribute("aria-disabled")).toBe(false)
    expect(prompt.disabled).toBe(false)
    expect(collaboration.disabled).toBe(false)
    root.querySelector<HTMLButtonElement>(".settings-close-button")!.click()

    aiTab().click()
    await vi.waitFor(() => expect(ribbon.aiChatOpen).toBe(true))
    host.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: {...host.settings, activeCloudServiceId: null}}))
    await vi.waitFor(() => expect(host.backendState).toBe("unavailable"))
    expect(ribbon.aiChatOpen).toBe(false)
    expect(aiTab().getAttribute("aria-disabled")).toBe("true")

    await host.enterPreview()
    await ribbon.updateComplete
    const share = root.querySelector<HTMLInputElement>(".live-session-switch input")!
    expect(share.disabled).toBe(true)
    expect(share.closest("label")?.title).toContain("Connect to a cloud service")
    share.click()
    expect(host.liveSession).toBeNull()
    for(const [label, method] of [["Download", "downloadDocument"], ["Print", "printDocument"]]) {
      const action = root.querySelector<RibbonButton>(`ribbon-drawer[layout="sharing-preview"] ribbon-button[label="${label}"]`)!
      expect(action.disabled).toBe(false)
      const invoke = vi.spyOn(host, method).mockImplementation(() => {})
      await action.updateComplete
      action.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
      expect(invoke).toHaveBeenCalledOnce()
    }
  })

  it.each([false, true])("disconnects the document provider when changing services or selecting Local (opaque: %s)", async opaque => {
    const {editor, iframe} = await mountEditor()
    const host = editor as any
    const disconnect = vi.fn()
    const frameWindow = iframe.contentWindow as any
    frameWindow.editor = {doc: {disconnectCollaboration: disconnect, doc: {clientID: 1}, setUser: vi.fn()}}
    host.editorOpaque = opaque
    const control = vi.spyOn(host, "postFrameControl")
    vi.spyOn(host, "loginToBackend").mockResolvedValue(undefined)
    const services = [service, {...service, id: "cloud-b", url: "https://other.example"}]
    for(const next of ["cloud-b", null]) {
      host.settings = {...defaultAppSettings(), cloudServices: services, activeCloudServiceId: service.id}
      host.collaborationRoom = "old-room"
      host.sharedDocumentToken = "old-token"
      const body = iframe.contentDocument!.body
      const content = body.innerHTML
      host.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: {...host.settings, activeCloudServiceId: next}}))
      if(opaque) expect(control).toHaveBeenCalledWith("disconnect-collaboration")
      else expect(disconnect).toHaveBeenCalledTimes(next === null ? 2 : 1)
      expect(host.collaborationRoom).toBeNull()
      expect(host.sharedDocumentToken).toBeNull()
      expect(host.collaborationStatus).toBe("disconnected")
      expect(iframe.contentDocument!.body).toBe(body)
      expect(body.innerHTML).toBe(content)
      control.mockClear()
    }
  })

  it("uses the configured provider and saved token, and preserves the document ID after re-sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async(url: string) => response(String(url).endsWith("/session") ? session : {documents: []})))
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...defaultAppSettings(), cloudServices: [service], activeCloudServiceId: service.id, cloudServicesConfigured: true}
    await host.loginToBackend()
    expect(host.backendClient.apiBaseUrl).toBe(session.apiBaseUrl)
    expect(host.backendSession.user.name).toBe("Ada")
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => (init?.headers as any)?.Authorization === "Bearer token")).toBe(true)
    host.backendDocumentId = "existing-document"
    host.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: {
      ...host.settings, cloudServices: [{...service, accessToken: "renewed-token"}],
    }}))
    await vi.waitFor(() => expect(host.backendState).toBe("connected"))
    expect(host.backendDocumentId).toBe("existing-document")
    host.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: {...host.settings, activeCloudServiceId: null}}))
    expect(host.backendClient).toBeNull()
    expect(host.backendDocumentId).toBeNull()
    await vi.waitFor(() => expect(host.backendState).toBe("unavailable"))
    expect(host.settings.activeCloudServiceId).toBeNull()
  })

  it("expires the active token on a timer and renders warnings on File and Settings", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...defaultAppSettings(), cloudServices: [{...service, expiresAt: Date.now() + 50}], activeCloudServiceId: service.id}
    host.backendState = "connected"
    host.updateCloudExpiry()
    await vi.waitFor(() => expect(host.backendState).toBe("unavailable"))
    expect(loadAppSettings().cloudServices[0].accessToken).toBeUndefined()
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const tab = ribbon.shadowRoot!.querySelector<RibbonTab>('ribbon-tab[label="File"]')!
    await tab.updateComplete
    expect(tab.shadowRoot!.querySelector(".warning-bubble")?.getAttribute("aria-label")).toContain("sign in")
    tab.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('[data-action="Settings"] .warning-bubble')?.getAttribute("aria-label")).toContain("expired")
  })

  it("treats unauthorized document responses as expiration without persisting the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async(url: string) => String(url).endsWith("/session") ? response(session) : new Response("Expired", {status: 401})))
    const {editor} = await mountEditor()
    const host = editor as any
    host.settings = {...defaultAppSettings(), cloudServices: [service], activeCloudServiceId: service.id}
    await host.loginToBackend()
    await vi.waitFor(() => expect(host.backendState).toBe("unavailable"))
    expect(host.backendClient).toBeNull()
    expect(loadAppSettings().cloudServices[0].accessToken).toBeUndefined()
    expect(host.cloudSessionWarning).toContain("expired")
  })

  it("applies the local username through the authenticated frame-control bridge", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    host.editorOpaque = true
    const post = vi.spyOn(host, "postFrameControl")
    host.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: {...host.settings, localUsername: "Local Ada"}}))
    expect(post).toHaveBeenCalledWith("username", {username: "Local Ada"})
  })
})

it("discovers the dev server alongside a configured cloud provider without activating it", async () => {
  const service = {id: "selected", type: "url" as const, url: "https://selected.example", username: "ada", accessToken: "token"}
  const devSession = {kind: "webwriter-dev-server", version: 1, authentication: "none",
    apiBaseUrl: "http://localhost:1234/api", collaborationUrl: "ws://localhost:1234", adminUrl: "http://localhost:1234/admin",
    user: {id: "dev", name: "Developer"}, capabilities: ["documents"]}
  const cloudSession = {...devSession, kind: "webwriter-cloud-service", authentication: "bearer",
    apiBaseUrl: `${service.url}/api`, collaborationUrl: "wss://selected.example", adminUrl: `${service.url}/admin`, user: {id: "ada", name: "Ada"}}
  vi.stubGlobal("fetch", vi.fn(async(url: string) => new Response(JSON.stringify(
    !String(url).endsWith("/session") ? {documents: []} : String(url).startsWith(service.url) ? cloudSession : devSession,
  ), {headers: {"Content-Type": "application/json"}})))
  const {editor} = await mountEditor()
  const host = editor as any
  host.settings = {...defaultAppSettings(), cloudServices: [service], activeCloudServiceId: service.id, cloudServicesConfigured: true}
  await host.loginToBackend(undefined, true)
  expect(host.settings.cloudServices).toHaveLength(2)
  expect(host.settings.cloudServices[1].url).toBe(devSession.apiBaseUrl)
  expect(host.settings.activeCloudServiceId).toBe(service.id)
  expect(host.backendClient.apiBaseUrl).toBe(cloudSession.apiBaseUrl)
})

it("does not apply a cloud save response after the active service is changed", async () => {
  const {editor} = await mountEditor()
  const host = editor as any
  let finish!: (document: object) => void
  const pending = new Promise(resolve => {finish = resolve})
  const client = {createDocument: vi.fn(() => pending)}
  host.backendClient = client
  host.fileDirty = true
  vi.spyOn(editor, "execute").mockResolvedValue({source: "<p>Draft</p>", checkpointId: "checkpoint"})
  const saving = host.saveBackendDocument()
  await vi.waitFor(() => expect(client.createDocument).toHaveBeenCalledOnce())
  host.backendClient = {apiBaseUrl: "https://replacement.example/api"}
  finish({id: "old-cloud-id", title: "Old response", format: "html"})
  await saving
  expect(host.backendDocumentId).toBeNull()
  expect(host.fileDirty).toBe(true)
  expect(host.fileName).not.toBe("Old response")
})

it.each(["/api", "/other-api"])("discovers only the exact same-host cloud API for a fresh document link (advertised: %s)", async advertisedPath => {
  const base = `${location.origin}/api`
  const session = {kind: "webwriter-cloud-service", version: 1, authentication: "none",
    apiBaseUrl: `${location.origin}${advertisedPath}`, collaborationUrl: location.origin.replace(/^http/, "ws"),
    adminUrl: `${location.origin}/admin`, user: {id: "local-development", name: "Private tester"}, capabilities: ["documents"]}
  vi.stubGlobal("fetch", vi.fn(async(url: string) => new Response(JSON.stringify(
    String(url).endsWith("/session") ? session : {documents: []},
  ), {headers: {"Content-Type": "application/json"}})))
  const {editor} = await mountEditor()
  const host = editor as any
  host.settings = {...defaultAppSettings(), cloudServices: [], activeCloudServiceId: null, cloudServicesConfigured: false}
  await host.loginToBackend(base)
  if(advertisedPath === "/api") {
    expect(host.backendState).toBe("connected")
    expect(host.backendClient.apiBaseUrl).toBe(base)
    expect(host.settings.cloudServices).toEqual([expect.objectContaining({url: base, authentication: "none"})])
  }
  else {
    expect(host.backendState).toBe("unavailable")
    expect(host.backendClient).toBeNull()
    expect(host.settings.cloudServices).toEqual([])
  }
})

it("activates a saved inactive cloud service when opening its document link", async () => {
  const first = {id: "first", type: "url" as const, url: "https://first.example", username: "ada", accessToken: "first-token"}
  const second = {...first, id: "second", url: "https://second.example", accessToken: "second-token"}
  const session = {kind: "webwriter-cloud-service", version: 1, authentication: "bearer",
    apiBaseUrl: `${second.url}/api`, collaborationUrl: "wss://second.example", adminUrl: `${second.url}/admin`,
    user: {id: "ada", name: "Ada"}, capabilities: ["documents"]}
  vi.stubGlobal("fetch", vi.fn(async(url: string) => new Response(JSON.stringify(
    String(url).endsWith("/session") ? session : {documents: []},
  ), {headers: {"Content-Type": "application/json"}})))
  const {editor} = await mountEditor()
  const host = editor as any
  host.settings = {...defaultAppSettings(), cloudServices: [first, second], activeCloudServiceId: first.id}
  host.backendDocumentId = "old-provider-document"
  await host.loginToBackend(session.apiBaseUrl)
  expect(loadAppSettings().activeCloudServiceId).toBe(second.id)
  expect(host.backendClient.apiBaseUrl).toBe(session.apiBaseUrl)
  expect(host.backendDocumentId).toBeNull()
})

it("does not remove a replacement provider's document when an earlier deletion finishes", async () => {
  const {editor} = await mountEditor()
  const host = editor as any
  let finish!: () => void
  const pending = new Promise<void>(resolve => {finish = resolve})
  const client = {deleteDocument: vi.fn(() => pending)}
  host.backendClient = client
  host.savedDocuments = [{id: "same-id", title: "First provider", format: "html", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z"}]
  vi.stubGlobal("confirm", vi.fn(() => true))
  host.handleSavedDocumentDelete(new CustomEvent("saved-document-delete", {detail: {id: "same-id"}}))
  await vi.waitFor(() => expect(client.deleteDocument).toHaveBeenCalledOnce())
  host.backendClient = {apiBaseUrl: "https://second.example/api"}
  host.savedDocuments = [{id: "same-id", title: "Second provider", format: "html", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z"}]
  host.backendDocumentId = "same-id"
  finish()
  await vi.waitFor(() => expect(host.fileOperationActive).toBe(false))
  expect(host.savedDocuments[0].title).toBe("Second provider")
  expect(host.backendDocumentId).toBe("same-id")
})

it("updates the dev-server username without reconnecting or losing the saved document", async () => {
  const {editor} = await mountEditor()
  const host = editor as any
  const service = {id: "dev", type: "url" as const, url: "http://localhost:1234/api", username: "Local developer", authentication: "none" as const}
  host.settings = {...defaultAppSettings(), cloudServices: [service], activeCloudServiceId: service.id}
  host.backendSession = {authentication: "none", user: {id: "local-development", name: "Local developer"}}
  const client = {apiBaseUrl: service.url}
  host.backendClient = client
  host.backendDocumentId = "current-document"
  host.editorOpaque = true
  const login = vi.spyOn(host, "loginToBackend")
  const post = vi.spyOn(host, "postFrameControl")
  host.handleAppSettingsChange(new CustomEvent("app-settings-change", {detail: {
    ...host.settings, cloudServices: [{...service, username: "Dev Ada"}],
  }}))
  expect(login).not.toHaveBeenCalled()
  expect(host.backendClient).toBe(client)
  expect(host.backendDocumentId).toBe("current-document")
  expect(host.username).toBe("Dev Ada")
  expect(post).toHaveBeenCalledWith("username", {username: "Dev Ada"})
})


describe("list toolbox type changes", () => {
  it.each(["indentListItems", "outdentListItems"])("routes %s from the toolbox to the frame", async type => {
    const editor = new DomEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focus = vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    ;(editor as any).editingUIListeners["ribbon-button-click"](new CustomEvent("ribbon-button-click", {detail: {label: type}}))
    expect(execute).toHaveBeenCalledWith({type})
    await Promise.resolve()
    expect(focus).toHaveBeenCalled()
  })

  it("forwards scoped list commands and rejects invalid types and scopes", async () => {
    const editor = new DomEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const selectionTypes = [{localName: "ul", namespaceURI: "http://www.w3.org/1999/xhtml"}]
    const listener = (editor as any).editingUIListeners["list-type-change"]
    listener(new CustomEvent("list-type-change", {detail: {listType: "ol", selectionTypes}}))
    expect(execute).toHaveBeenCalledWith({type: "setListType", listType: "ol", selectionTypes})
    for(const detail of [{listType: "dl", selectionTypes}, {listType: "ol"}, {listType: "ul", selectionTypes: []},
      {listType: "ol", selectionTypes: [{localName: "p", namespaceURI: "http://www.w3.org/1999/xhtml"}]},
      {listType: "ol", selectionTypes: [{localName: "ul", namespaceURI: "http://www.w3.org/2000/svg"}]}]) {
      listener(new CustomEvent("list-type-change", {detail}))
    }
    expect(execute).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })
})

describe("heading toolbox level changes", () => {
  it("forwards a scoped heading command and rejects invalid levels and scopes", async () => {
    const editor = new DomEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    vi.spyOn(editor as any, "focusEditor").mockImplementation(() => {})
    const selectionType = {localName: "h2", namespaceURI: "http://www.w3.org/1999/xhtml"}
    const listener = (editor as any).editingUIListeners["heading-level-change"]
    listener(new CustomEvent("heading-level-change", {detail: {level: "h4", selectionType}}))
    expect(execute).toHaveBeenCalledWith({type: "setBlockType", tag: "h4", selectionType})
    for(const detail of [{level: "h7", selectionType}, {level: "h1"},
      {level: "h1", selectionType: {...selectionType, localName: "p"}},
      {level: "h1", selectionType: {...selectionType, namespaceURI: "http://www.w3.org/2000/svg"}}]) {
      listener(new CustomEvent("heading-level-change", {detail}))
    }
    expect(execute).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })
})

describe("document collaboration menu", () => {
  it.each([false, true, "unavailable"] as const)("joins the cloud collaboration room only when editing links are enabled (%s)", async enabled => {
    const {editor} = await mountEditor()
    const host = editor as any
    const sharingEnabled = enabled === true
    const content = '<picture style="filter: blur(2px)"><img src="data:image/png;base64,AQID"></picture><p></p>'
    const client = {
      apiBaseUrl: "http://localhost:1234/api",
      getDocument: vi.fn().mockResolvedValue({id: "saved", title: "Saved", format: "html", content}),
      getDocumentSharing: enabled === "unavailable" ? vi.fn().mockRejectedValue(new Error("Sharing unavailable"))
        : vi.fn().mockResolvedValue(sharingEnabled ? {enabled: true, token: "editing-token"} : {enabled: false}),
    }
    host.backendClient = client
    host.collaborationRoom = "document-previous"
    host.sharedDocumentToken = "previous-token"
    const disconnect = vi.spyOn(host, "clearDocumentCollaboration")
    const rooms: Array<string | null> = []
    const reload = vi.spyOn(host, "reloadDocument").mockImplementation(async (...args) => {
      ;(args[4] as {beforeSwitch: () => void}).beforeSwitch()
      rooms.push(host.collaborationRoom)
    })

    await host.openBackendDocument("saved")

    expect(client.getDocumentSharing).toHaveBeenCalledWith("saved")
    expect(disconnect).toHaveBeenCalledOnce()
    expect(rooms).toEqual([sharingEnabled ? "document-saved" : null])
    expect(reload).toHaveBeenCalledWith(content, false, "http://localhost:1234/api/documents/saved", true, {discardRecovery: false, beforeSwitch: expect.any(Function)})
    expect(new URL(host.syncUrl).searchParams.get("session")).toBe(sharingEnabled ? "document-saved" : null)
    expect(host.sharedDocumentToken).toBeNull()
    expect(host.linkSharingEnabled).toBe(sharingEnabled)
    expect(host.collaborationLink ? new URL(host.collaborationLink).searchParams.get("open") : "")
      .toBe(sharingEnabled ? "http://localhost:1234/api/shared-documents/editing-token" : "")
    expect(host.collaborationError).toBe(enabled === "unavailable" ? "Sharing unavailable" : "")
  })

  it("keeps the editor path and unrelated URL state when generating an open link", async () => {
    const {editor} = await mountEditor()
    history.replaceState({previous: true}, "", "/editor/?other=a+b&open=old#part%20one")
    ;(editor as any).updateDocumentURL("https://storage.example/api/documents/new%2Flesson")
    const url = new URL(location.href)
    expect(url.pathname).toBe("/editor/")
    expect(url.search).toBe("?other=a+b&open=https%3A%2F%2Fstorage.example%2Fapi%2Fdocuments%2Fnew%252Flesson")
    expect(url.hash).toBe("#part%20one")
    expect(history.state).toEqual({previous: true})
    history.replaceState({}, "", "/")
  })

  it("shares a direct document link on the isolated origin with its collaboration endpoint", async () => {
    const {editor} = await mountEditor()
    history.replaceState({}, "", "/editor/?other=keep&session=collab&source=local&open=old#anchor")
    ;(editor as any).backendSession = {collaborationUrl: "wss://collaboration.example/live"}
    const link = new URL((editor as any).liveSessionShareLink("lesson-1", "a".repeat(32)))
    expect(link.pathname).toBe("/live/")
    expect(link.origin).not.toBe(location.origin)
    expect(link.searchParams.has("other")).toBe(false)
    expect(link.searchParams.get("liveSession")).toBe("lesson-1")
    expect(link.searchParams.get("liveToken")).toBe("a".repeat(32))
    expect(link.searchParams.get("liveServer")).toBe("wss://collaboration.example/live")
    expect(link.searchParams.has("role")).toBe(false)
    expect(link.searchParams.has("session")).toBe(false)
    expect(link.searchParams.has("source")).toBe(false)
    expect(link.searchParams.has("open")).toBe(false)
    expect(link.hash).toBe("#anchor")
    history.replaceState({}, "", "/")
  })

  it("enables and revokes editing links through the server for a saved document", async () => {
    const {editor} = await mountEditor()
    history.replaceState({}, "", "/editor/?other=keep&session=collab&share=old&liveSession=old&liveToken=old&role=host#section")
    const host = editor as any
    const setDocumentSharing = vi.fn().mockResolvedValueOnce({enabled: true, token: "editing-token"}).mockResolvedValueOnce({enabled: false})
    host.backendClient = {apiBaseUrl: "http://localhost:1234/api", setDocumentSharing}
    host.backendDocumentId = "saved"
    host.storageLocation = "development-server"
    host.collaborationRoom = "document-saved"
    await host.handleLinkSharingChange(new CustomEvent("link-sharing-change", {detail: {enabled: true}}))
    expect(setDocumentSharing).toHaveBeenCalledWith("saved", true)
    const link = new URL(host.collaborationLink)
    expect(link.pathname).toBe("/editor/")
    expect(link.searchParams.get("open")).toBe("http://localhost:1234/api/shared-documents/editing-token")
    expect(link.searchParams.get("other")).toBe("keep")
    expect(link.searchParams.has("session")).toBe(false)
    expect(link.searchParams.has("share")).toBe(false)
    expect(link.searchParams.has("liveSession")).toBe(false)
    expect(link.searchParams.has("liveToken")).toBe(false)
    expect(link.searchParams.has("role")).toBe(false)
    expect(link.hash).toBe("#section")
    history.replaceState({}, "", "/")
    expect(host.linkSharingEnabled).toBe(true)
    await host.handleLinkSharingChange(new CustomEvent("link-sharing-change", {detail: {enabled: false}}))
    expect(setDocumentSharing).toHaveBeenLastCalledWith("saved", false)
    expect(host.collaborationLink).toBe("")
  })

  it("prompts before moving a local document and does nothing when cancelled", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const save = vi.spyOn(host, "saveBackendDocument").mockResolvedValue(true)
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal("confirm", confirm)
    const request = host.handleLinkSharingChange(new CustomEvent("link-sharing-change", {detail: {enabled: true}}))
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#link-sharing-dialog")!
    await vi.waitFor(() => expect(dialog.open).toBe(true))
    expect(dialog.textContent).toContain("Move this document to the server")
    expect(confirm).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    dialog.querySelector<HTMLButtonElement>("footer button")!.click()
    await request
    expect(save).not.toHaveBeenCalled()
    expect(host.linkSharingBusy).toBe(false)
    expect(host.linkSharingEnabled).toBe(false)
  })

  it("moves a local document before creating an editing link", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const setDocumentSharing = vi.fn().mockResolvedValue({enabled: true, token: "editing-token"})
    host.backendClient = {apiBaseUrl: "http://localhost:1234/api", setDocumentSharing}
    host.fileHandle = {name: "Local.html"}
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    vi.spyOn(host, "saveBackendDocument").mockImplementation(async () => {
      expect(setDocumentSharing).not.toHaveBeenCalled()
      host.backendDocumentId = "moved"
      host.storageLocation = "development-server"
      return true
    })
    const reload = vi.spyOn(host, "reloadEditor").mockResolvedValue(undefined)
    const request = host.handleLinkSharingChange(new CustomEvent("link-sharing-change", {detail: {enabled: true}}))
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#link-sharing-dialog")!
    await vi.waitFor(() => expect(dialog.open).toBe(true))
    expect(setDocumentSharing).not.toHaveBeenCalled()
    dialog.querySelector<HTMLButtonElement>(".primary")!.click()
    await request
    expect(reload).toHaveBeenCalledOnce()
    expect(host.fileHandle).toBeNull()
    expect(host.collaborationRoom).toBe("document-moved")
    expect(new URL(host.syncUrl).searchParams.get("session")).toBe("document-moved")
    expect(setDocumentSharing).toHaveBeenCalledWith("moved", true)
  })

  it("does not enable sharing when the move fails or the document is replaced during the request", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const setDocumentSharing = vi.fn()
    host.backendClient = {apiBaseUrl: "http://localhost:1234/api", setDocumentSharing}
    vi.spyOn(editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!, "confirmLinkSharing").mockResolvedValue(true)
    vi.spyOn(host, "saveBackendDocument").mockResolvedValue(undefined)
    await host.handleLinkSharingChange(new CustomEvent("link-sharing-change", {detail: {enabled: true}}))
    expect(setDocumentSharing).not.toHaveBeenCalled()
    expect(host.collaborationError).toContain("Save the document")
    host.backendDocumentId = "original"
    host.storageLocation = "development-server"
    host.collaborationRoom = "document-original"
    setDocumentSharing.mockImplementation(async () => {
      host.backendDocumentId = "replacement"
      return {enabled: true, token: "old-token"}
    })
    await host.handleLinkSharingChange(new CustomEvent("link-sharing-change", {detail: {enabled: true}}))
    expect(host.linkSharingEnabled).toBe(false)
  })

  it("does not move a replacement document after link sharing was confirmed", async () => {
    const {editor} = await mountEditor()
    const host = editor as any
    const save = vi.spyOn(host, "saveBackendDocument").mockResolvedValue(true)
    const request = host.handleLinkSharingChange(new CustomEvent("link-sharing-change", {detail: {enabled: true}}))
    const dialog = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!.shadowRoot!.querySelector<HTMLDialogElement>("#link-sharing-dialog")!
    await vi.waitFor(() => expect(dialog.open).toBe(true))
    host.clearDocumentCollaboration()
    dialog.querySelector<HTMLButtonElement>(".primary")!.click()
    await request
    expect(save).not.toHaveBeenCalled()
    expect(host.linkSharingBusy).toBe(false)
  })
})


it("opens a server editing link without an account and passes its token to collaboration", async () => {
  const {editor} = await mountEditor()
  const host = editor as any
  const token = "a".repeat(43)
  const session = {kind: "webwriter-dev-server", version: 1, authentication: "none", user: {id: "local", name: "Local"},
    apiBaseUrl: "http://localhost:1234/api", collaborationUrl: "ws://localhost:1234", adminUrl: "http://localhost:1234/admin", capabilities: ["documents", "collaboration"]}
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(session), {headers: {"Content-Type": "application/json"}}))
    .mockResolvedValueOnce(new Response(JSON.stringify({document: {id: "shared", title: "Shared", format: "html", content: "<p>Editable</p>"}}), {headers: {"Content-Type": "application/json"}}))
  vi.stubGlobal("fetch", fetch)
  const reload = vi.spyOn(host, "reloadDocument").mockImplementation(async (...args) => {
    ;(args[4] as {beforeSwitch: () => void}).beforeSwitch()
  })
  await host.restoreLinkedDocument(`http://localhost:1234/api/shared-documents/${token}`)
  expect(reload).toHaveBeenCalledWith("<p>Editable</p>", false, "http://localhost:1234/api/documents/shared", true, {beforeSwitch: expect.any(Function)})
  expect(host.backendDocumentId).toBe("shared")
  expect(new URL(host.syncUrl).searchParams.get("session")).toBe("document-shared")
  expect(new URL(host.syncUrl).searchParams.get("share")).toBe(token)
  expect(host.previewActive).toBe(false)
  expect(fetch.mock.calls.every(([, init]) => !init.headers.Authorization)).toBe(true)
})

it("moves a server Save As copy into its own collaboration room", async () => {
  const {editor} = await mountEditor()
  const host = editor as any
  host.backendDocumentId = "original"
  host.collaborationRoom = "document-original"
  host.sharedDocumentToken = "original-token"
  host.collaborationLink = "original-link"
  host.linkSharingEnabled = true
  host.backendClient = {apiBaseUrl: "http://localhost:1234/api", createDocument: vi.fn().mockResolvedValue({id: "copy", title: "Copy", format: "html", content: "<p>Copy</p>"})}
  const draft = seedRecoveryDraft(editor)
  const remove = vi.spyOn(documentRecoveryStorage, "deleteDocumentRecovery").mockResolvedValue()
  mockSaveSnapshot(editor, "<p>Copy</p>")
  const reconnect = vi.spyOn(host, "reloadEditor").mockImplementation(async () => {
    expect(remove).not.toHaveBeenCalled()
    host.frameRevision++
  })
  await host.saveBackendDocument(true)
  expect(reconnect).toHaveBeenCalledOnce()
  expect(host.collaborationRoom).toBe("document-copy")
  expect(host.sharedDocumentToken).toBeNull()
  expect(host.linkSharingEnabled).toBe(false)
  expect(new URL(location.href).searchParams.get("open")).toBe("http://localhost:1234/api/documents/copy")
  expect(remove).toHaveBeenCalledExactlyOnceWith(draft.id, expect.any(AbortSignal))
  expect(host.documentRecoveryCheckpoint).toBeNull()
})

it("preserves the editing capability URL when saving a shared document", async () => {
  const {editor} = await mountEditor()
  const host = editor as any
  const reference = `http://localhost:1234/api/shared-documents/${"a".repeat(43)}`
  const url = new URL(location.href)
  url.searchParams.set("open", reference)
  history.replaceState(null, "", url)
  host.backendDocumentId = "shared"
  host.collaborationRoom = "document-shared"
  host.sharedDocumentToken = "a".repeat(43)
  host.backendClient = {apiBaseUrl: "http://localhost:1234/api", updateDocument: vi.fn().mockResolvedValue({id: "shared", title: "Shared", format: "html"})}
  mockSaveSnapshot(editor, "<p>Edited</p>")
  await host.saveBackendDocument()
  expect(new URL(location.href).searchParams.get("open")).toBe(reference)
  expect(host.sharedDocumentToken).toBe("a".repeat(43))
})
